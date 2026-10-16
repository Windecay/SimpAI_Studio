import re
import threading
import time
from urllib.parse import urlparse


class DownloadAccessRequired(RuntimeError):
    def __init__(self, message, repository):
        super().__init__(message)
        self.repository = repository


_cache = {}
_lock = threading.Lock()


def _repository(url):
    try:
        parsed = urlparse(str(url or ""))
        host = (parsed.hostname or "").lower()
    except ValueError:
        return None
    parts = parsed.path.strip("/").split("/")
    if parsed.scheme != "https":
        return None
    if host in ("modelscope.cn", "www.modelscope.cn") and len(parts) >= 3 and parts[0] == "models":
        owner, name = parts[1:3]
        page = "https://modelscope.cn/models/"
        api = "https://modelscope.cn/api/v1/models/"
        provider = "modelscope"
    elif host in ("huggingface.co", "hf-mirror.com") and len(parts) >= 2:
        owner, name = parts[:2]
        page = "https://huggingface.co/"
        api = "https://huggingface.co/api/models/"
        provider = "huggingface"
    else:
        return None
    if any(part in (".", "..") or not re.fullmatch(r"[A-Za-z0-9_.-]+", part) for part in (owner, name)):
        return None
    repository = f"{owner}/{name}"
    return provider, repository, page + repository, api + repository


def repository_key(url):
    info = _repository(url)
    return f"{info[0]}:{info[1].casefold()}" if info else None


def approval_url(url):
    info = _repository(url)
    return info[2] if info else ""


async def access_requirement(url, response, client):
    info = _repository(url)
    if info is None or response.status_code not in (401, 403, 404):
        return None
    provider, repository, page, api = info
    gated = str(response.headers.get("x-error-code") or "").lower() == "gatedrepo"
    if not gated:
        now = time.monotonic()
        with _lock:
            cached = _cache.get(api)
        if cached and cached[0] > now:
            gated = cached[1]
        else:
            try:
                metadata = await client.get(api, timeout=5.0)
                metadata.raise_for_status()
                payload = metadata.json()
                if provider == "modelscope":
                    gated = (payload.get("Data") or {}).get("ApprovalMode") == 2
                else:
                    gated = payload.get("gated") in (True, "auto", "manual")
            except Exception:
                return None
            with _lock:
                _cache[api] = (now + (300 if gated else 60), gated)
                if len(_cache) > 128:
                    _cache.pop(next(iter(_cache)))
    return {"requires_access": True, "access_url": page} if gated else None
