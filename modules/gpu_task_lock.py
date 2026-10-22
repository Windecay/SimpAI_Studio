import logging
import threading
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
from inspect import signature


exclusive_task_lock = threading.Lock()
_release_checks = ContextVar("gpu_task_release_checks", default=None)
_task_owner = ContextVar("gpu_task_owner", default=None)
_BACKEND_POLL_INTERVAL = 2.0
logger = logging.getLogger(__name__)


class GpuTaskCancelled(RuntimeError):
    pass


def defer_gpu_task_release(check_finished):
    """Keep the current slot until an outstanding backend task has stopped."""
    checks = _release_checks.get()
    if checks is not None:
        checks.append(check_finished)


def _release_when_confirmed(lock, checks):
    delay = threading.Event()
    while checks:
        for check in checks[:]:
            try:
                if check():
                    checks.remove(check)
            except Exception:
                logger.debug("Backend task status unavailable; retaining GPU slot", exc_info=True)
        if checks:
            delay.wait(_BACKEND_POLL_INTERVAL)
    lock.release()


@contextmanager
def exclusive_gpu_task(cancel_check=None, on_wait=None):
    def check_cancelled():
        if callable(cancel_check) and cancel_check():
            raise GpuTaskCancelled("Stopped by user.")

    check_cancelled()
    lock = exclusive_task_lock
    thread_id = threading.get_ident()
    owner = _task_owner.get()
    if (owner is not None and owner["active"]
            and owner["thread_id"] == thread_id and owner["lock"] is lock):
        yield
        return
    acquired = lock.acquire(blocking=False)
    checks = []
    token = None
    owner_token = None
    try:
        if not acquired and callable(on_wait):
            on_wait()
        while not acquired:
            check_cancelled()
            acquired = lock.acquire(timeout=0.1)
        check_cancelled()
        token = _release_checks.set(checks)
        owner = {"thread_id": thread_id, "lock": lock, "active": True}
        owner_token = _task_owner.set(owner)
        yield
    finally:
        if owner_token is not None:
            owner["active"] = False
            _task_owner.reset(owner_token)
        if token is not None:
            _release_checks.reset(token)
        if acquired:
            if checks:
                # The request can finish without admitting another GPU task.
                threading.Thread(target=_release_when_confirmed, args=(lock, checks),
                                 name="gpu-backend-release", daemon=True).start()
            else:
                lock.release()


def serialize_gpu_task(function):
    call_signature = signature(function)

    @wraps(function)
    def guarded(*args, **kwargs):
        cancel_check = call_signature.bind(*args, **kwargs).arguments.get("cancel_check")
        with exclusive_gpu_task(cancel_check=cancel_check):
            return function(*args, **kwargs)

    return guarded
