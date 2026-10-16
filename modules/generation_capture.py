from contextlib import contextmanager
from contextvars import ContextVar


_sink = ContextVar("generation_output_sink", default=None)


@contextmanager
def capture_output(callback):
    token = _sink.set(callback)
    try:
        yield
    finally:
        _sink.reset(token)


def is_active():
    return callable(_sink.get())


def publish(record):
    callback = _sink.get()
    if callable(callback):
        callback(dict(record))
