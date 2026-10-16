import threading
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timezone


class DescriptionStopped(RuntimeError):
    code = "cancelled"


class DescriptionBusy(RuntimeError):
    pass


@dataclass
class DescriptionRequest:
    key: tuple
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    cancel: threading.Event = field(default_factory=threading.Event)
    done: threading.Event = field(default_factory=threading.Event)
    running: bool = False
    finalizing: bool = False
    created: float = field(default_factory=time.monotonic)
    report: dict = field(default_factory=dict)

    def __post_init__(self):
        self.report.update({
            "version": 1, "id": self.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "owner_did": self.key[0], "accepted": False, "attempts": [],
            "stage": "queued", "settings": {"max_tokens": 2048, "thinking": False},
        })


_lock = threading.RLock()
_requests = {}
_active = {}
_current = ContextVar("media_description_request", default=None)


def prepare(key):
    if not all(key):
        raise ValueError("Description requires an authenticated browser session.")
    with _lock:
        previous = _requests.get(_active.get(key))
        if previous is not None and not previous.done.is_set():
            raise DescriptionBusy("A description is already running in this page.")
        finished = sorted(
            (item for item in _requests.values() if item.done.is_set()),
            key=lambda item: item.created,
        )
        for item in finished:
            if time.monotonic() - item.created > 600 or len(_requests) > 256:
                _requests.pop(item.id, None)
                if _active.get(item.key) == item.id:
                    _active.pop(item.key, None)
        entry = DescriptionRequest(key)
        _requests[entry.id] = entry
        _active[key] = entry.id
        return entry


def get(key, request_id):
    with _lock:
        entry = _requests.get(request_id)
        return entry if entry is not None and entry.key == key else None


def is_current(key, request_id):
    with _lock:
        return _active.get(key) == request_id


@contextmanager
def running(entry):
    with _lock:
        if entry.cancel.is_set() or entry.done.is_set() or entry.running or entry.finalizing:
            raise DescriptionStopped("Description was stopped before it started.")
        entry.running = True
    token = _current.set(entry)
    try:
        check()
        yield
    finally:
        _current.reset(token)


def complete(entry):
    with _lock:
        entry.running = False
        entry.done.set()


def finalize(entry):
    with _lock:
        entry.finalizing = True
        return entry.cancel.is_set()


def stop(key):
    with _lock:
        entry = _requests.get(_active.get(key))
        if entry is None or entry.done.is_set() or entry.finalizing:
            return None
        entry.cancel.set()
        if not entry.running:
            entry.report.update(error="cancelled", accepted=False)
            entry.done.set()
        return entry


def cancelled():
    entry = _current.get()
    return entry is not None and entry.cancel.is_set()


def cancel_check():
    entry = _current.get()
    return entry.cancel.is_set if entry is not None else None


def check():
    if cancelled():
        raise DescriptionStopped("Media description stopped by user.")
