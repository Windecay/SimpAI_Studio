import os
import tempfile


def atomic_write_bytes(path, content):
    target = os.path.abspath(path)
    descriptor, temporary = tempfile.mkstemp(
        prefix=".tag-text-", suffix=".tmp", dir=os.path.dirname(target)
    )
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_write_text(path, content):
    atomic_write_bytes(path, content.encode("utf-8"))
