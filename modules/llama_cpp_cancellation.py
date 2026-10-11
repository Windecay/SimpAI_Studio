import logging
import threading
from contextlib import contextmanager


logger = logging.getLogger(__name__)


class LlamaCppRequestCancelled(RuntimeError):
    pass


@contextmanager
def llama_cpp_request_cancellation(model, cancel_check=None, on_cancel=None, poll_seconds=0.02):
    if not callable(cancel_check):
        yield lambda: None
        return

    finished = threading.Event()
    interrupted = threading.Event()
    state_lock = threading.Lock()
    check_lock = threading.Lock()
    failures = []
    monitor = None
    restore_callback = None
    abort = getattr(model, "abort", None)

    def poll():
        with check_lock:
            with state_lock:
                if finished.is_set() or interrupted.is_set():
                    return
            failure = None
            try:
                cancelled = bool(cancel_check())
            except Exception as exc:
                cancelled = True
                failure = exc
            with state_lock:
                if finished.is_set():
                    return
                if cancelled:
                    interrupted.set()
                    if failure is not None:
                        failures.append(failure)

    def checkpoint():
        poll()
        with state_lock:
            failure = failures[0] if failures else None
            cancelled = interrupted.is_set()
        if failure is not None:
            raise failure
        if cancelled:
            raise LlamaCppRequestCancelled("Stopped.")

    def request_abort():
        with state_lock:
            if finished.is_set() or not interrupted.is_set() or not callable(abort):
                return
            native_flag = getattr(model, "_native_abort_flag", None)
            abort_event = getattr(model, "_abort_event", None)
            if native_flag is not None and getattr(native_flag, "value", False):
                return
            if native_flag is None and callable(getattr(abort_event, "is_set", None)) and abort_event.is_set():
                return
            abort()

    def watch():
        abort_failed = False
        while not finished.is_set():
            poll()
            try:
                request_abort()
            except Exception:
                if not abort_failed:
                    logger.exception("Unable to request native llama.cpp cancellation")
                    abort_failed = True
            finished.wait(poll_seconds)

    try:
        checkpoint()
        if not callable(abort):
            context = getattr(model, "_ctx", None)
            setter = getattr(context, "set_abort_callback", None)
            if callable(setter):
                previous = getattr(context, "_abort_callback_ref", None)
                previous_data = getattr(context, "_abort_callback_data_ref", None)
                setter(lambda _data: interrupted.is_set(), None)
                restore_callback = lambda: setter(previous, previous_data)
        monitor = threading.Thread(target=watch, name="llama-cpp-request-cancel", daemon=True)
        monitor.start()
        try:
            yield checkpoint
            checkpoint()
        except Exception:
            checkpoint()
            raise
    finally:
        with state_lock:
            finished.set()
        if monitor is not None:
            monitor.join(timeout=1.0)
        if restore_callback is not None:
            restore_callback()
        if interrupted.is_set():
            native_flag = getattr(model, "_native_abort_flag", None)
            if native_flag is not None and hasattr(native_flag, "value"):
                native_flag.value = False
            abort_event = getattr(model, "_abort_event", None)
            if callable(getattr(abort_event, "clear", None)):
                abort_event.clear()
            if callable(on_cancel):
                on_cancel()
            else:
                reset = getattr(model, "reset", None)
                if callable(reset):
                    reset()
