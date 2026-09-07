import threading
from contextlib import contextmanager


exclusive_task_lock = threading.Lock()


class GpuTaskCancelled(RuntimeError):
    pass


@contextmanager
def exclusive_gpu_task(cancel_check=None, on_wait=None):
    def check_cancelled():
        if callable(cancel_check) and cancel_check():
            raise GpuTaskCancelled("Stopped by user.")

    check_cancelled()
    acquired = exclusive_task_lock.acquire(blocking=False)
    try:
        if not acquired and callable(on_wait):
            on_wait()
        while not acquired:
            check_cancelled()
            acquired = exclusive_task_lock.acquire(timeout=0.1)
        check_cancelled()
        yield
    finally:
        if acquired:
            exclusive_task_lock.release()
