"""Private HTTP connection for the standalone MCP adapter; no Studio imports."""

import ctypes
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import time
from contextlib import contextmanager
from urllib.parse import quote, urljoin, urlsplit

import requests


class ConnectionError(RuntimeError):
    def __init__(self, code, public_error=None):
        self.code = code
        self.public_error = public_error or {"code": code}
        super().__init__(code)


def _protect(data, decrypt=False):
    if os.name != "nt":
        return data
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.c_void_p)]

    buffer = ctypes.create_string_buffer(data)
    source, result = Blob(len(data), ctypes.cast(buffer, ctypes.c_void_p)), Blob()
    api = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    api.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                   ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    api.restype = wintypes.BOOL
    if not api(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result)):
        raise ConnectionError("credential_store_unavailable")
    try:
        return ctypes.string_at(result.data, result.size)
    finally:
        ctypes.windll.kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        ctypes.windll.kernel32.LocalFree(result.data)


class CredentialStore:
    _locks = {}
    _guard = threading.Lock()

    def __init__(self, base, directory=None):
        directory = Path(directory) if directory else (
            Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "SimpAI" / "agent-connections"
            if os.name == "nt" else Path.home() / ".config" / "simpai" / "agent-connections"
        )
        self.path = directory / (hashlib.sha256(base.encode()).hexdigest() + ".credentials")
        with self._guard:
            self.lock = self._locks.setdefault(str(self.path.resolve()), threading.Lock())

    @contextmanager
    def locked(self):
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            lock_path = self.path.with_suffix(".lock")
            if lock_path.is_symlink() or self.path.is_symlink():
                raise ConnectionError("credential_store_unavailable")
            with open(lock_path, "a+b") as handle:
                if not handle.tell():
                    handle.write(b"0")
                    handle.flush()
                deadline = time.monotonic() + 45
                while True:
                    try:
                        handle.seek(0)
                        if os.name == "nt":
                            import msvcrt
                            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                        else:
                            import fcntl
                            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                        break
                    except OSError:
                        if time.monotonic() >= deadline:
                            raise ConnectionError("credential_store_busy") from None
                        time.sleep(0.05)
                try:
                    yield self
                finally:
                    handle.seek(0)
                    if os.name == "nt":
                        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                    else:
                        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def load(self):
        if not self.path.exists():
            return None
        if self.path.is_symlink() or self.path.stat().st_size > 65536:
            raise ConnectionError("credential_store_unavailable")
        if os.name != "nt" and (self.path.stat().st_mode & 0o077 or self.path.stat().st_uid != os.getuid()):
            raise ConnectionError("credential_store_permissions")
        try:
            return json.loads(_protect(self.path.read_bytes(), decrypt=True))
        except (OSError, ValueError):
            raise ConnectionError("credential_store_unavailable") from None

    def save(self, value):
        data = _protect(json.dumps(value, separators=(",", ":")).encode())
        fd, name = tempfile.mkstemp(dir=self.path.parent, prefix=".credentials-")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(name, self.path)
        finally:
            if os.path.exists(name):
                os.unlink(name)


class StudioConnection:
    def __init__(self, base, *, store=None, http=None, clock=time.time):
        parsed = urlsplit(base)
        if (parsed.scheme not in {"http", "https"} or not parsed.hostname
                or parsed.username or parsed.password or parsed.query or parsed.fragment):
            raise ConnectionError("invalid_studio_url")
        self.base = base.rstrip("/") + "/"
        self.origin = (parsed.scheme, parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
        self.prefix = parsed.path.rstrip("/") + "/api/v1/"
        self.store = store or CredentialStore(self.base)
        self._default_store = store is None
        self.http = http or requests.Session()
        self.clock = clock
        self.identity = None

    def url(self, path):
        value = urljoin(self.base, path)
        parsed = urlsplit(value)
        origin = (parsed.scheme, parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
        if (origin != self.origin or not parsed.path.startswith(self.prefix) or parsed.fragment
                or parsed.username or parsed.password):
            raise ConnectionError("invalid_service_url")
        return value

    def secure_credentials(self):
        host = self.origin[1]
        try:
            loopback = ipaddress.ip_address(host).is_loopback
        except ValueError:
            loopback = host == "localhost"
        if self.origin[0] != "https" and not loopback:
            raise ConnectionError("credentials_require_https")

    def discover(self):
        discovery = self.raw("GET", "api/v1/auth/discovery")
        recommendation = discovery.get("local_endpoint") or {}
        if (self.identity is None and discovery.get("next_step") == "use_local_endpoint"
                and recommendation.get("same_machine_only") is True):
            base = recommendation.get("base_url", "")
            candidate = urlsplit(base)
            current = urlsplit(self.base)
            if (candidate.scheme != "http" or candidate.hostname not in {"127.0.0.1", "::1"}
                    or candidate.username or candidate.password or candidate.query or candidate.fragment
                    or candidate.path.rstrip("/") != current.path.rstrip("/")
                    or not discovery.get("service_id")
                    or recommendation.get("service_id") != discovery["service_id"]):
                raise ConnectionError("invalid_service_url")
            local = StudioConnection(base, store=None if self._default_store else self.store, http=self.http, clock=self.clock)
            actual = local.raw("GET", "api/v1/auth/discovery")
            if (actual.get("service_id") != discovery["service_id"]
                    or actual.get("access_mode") != discovery.get("access_mode")
                    or actual.get("pairing_available") is not True):
                raise ConnectionError("identity_context_changed")
            self.base, self.origin, self.prefix, self.store = local.base, local.origin, local.prefix, local.store
            discovery = actual
        return discovery

    def raw(self, method, path, *, token=None, body=None, timeout_seconds=30):
        headers = {"Accept": "application/json"}
        if token:
            self.secure_credentials()
            headers["Authorization"] = "Bearer " + token
        try:
            response = self.http.request(method, self.url(path), json=body, headers=headers,
                                         timeout=(5, timeout_seconds), allow_redirects=False, **self._loopback_options())
            with response:
                if 300 <= response.status_code < 400:
                    raise ConnectionError("service_redirect_refused")
                result = response.json()
        except (requests.RequestException, ValueError):
            raise ConnectionError("studio_connection_failed") from None
        if not response.ok or not isinstance(result, dict) or not result.get("ok"):
            code = (result.get("error") or {}).get("code") if isinstance(result, dict) and isinstance(result.get("error"), dict) else None
            code = code if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,80}", code) else "studio_request_failed"
            public_error = {"code": code}
            if path == "api/v1/tools/call" and isinstance(result, dict) and isinstance(result.get("error"), dict):
                encoded = json.dumps({key: result["error"][key] for key in ("message", "details") if key in result["error"]})
                if len(encoded) <= 8000:
                    public_error.update(json.loads(encoded.replace(token, "[redacted]") if token else encoded))
            raise ConnectionError(code, public_error)
        return result["data"]

    def _loopback_options(self):
        # Loopback credentials must stay on this computer even when a client
        # inherits global HTTP_PROXY/ALL_PROXY environment settings.
        if self.origin[1] in {"localhost", "127.0.0.1", "::1"}:
            return {"proxies": {"http": "", "https": "", "all": ""}}
        return {}

    @staticmethod
    def binding(identity):
        return {key: identity.get(key) for key in ("service_id", "access_mode", "did", "role", "storage")}

    def _verify(self, identity, discovery, expected=None):
        binding = self.binding(identity)
        if (identity.get("service_id") != discovery.get("service_id")
                or identity.get("access_mode") != discovery.get("access_mode")
                or (expected is not None and binding != expected)
                or (self.identity is not None and binding != self.identity)):
            raise ConnectionError("identity_context_changed")
        self.identity = binding

    def authenticate(self):
        discovery = self.discover()
        with self.store.locked():
            credentials = self.store.load()
            if credentials:
                self.secure_credentials()
                expected = credentials["identity"]
                if (expected["service_id"] != discovery.get("service_id")
                        or expected["access_mode"] != discovery.get("access_mode")):
                    raise ConnectionError("identity_context_changed")
                if credentials.get("refresh_pending"):
                    raise ConnectionError("pairing_required")
                if credentials["expires_at"] <= self.clock() + 30:
                    # Mark uncertainty before sending: a lost refresh response must never be retried.
                    self.store.save({**credentials, "refresh_pending": True})
                    renewed = self.raw("POST", discovery["refresh_url"], body={"refresh_token": credentials["refresh_token"]})
                    self._verify(renewed["identity"], discovery, expected)
                    credentials = {**renewed, "identity": expected, "expires_at": self.clock() + renewed["expires_in"]}
                    self.store.save(credentials)
                token = credentials["access_token"]
            elif discovery.get("access_mode") == "local":
                token, expected = None, None
            else:
                raise ConnectionError("pairing_required")
            session = self.raw("GET", discovery["session_url"], token=token)
            self._verify(session["identity"], discovery, expected)
        return token, session

    def call(self, method, path, body=None, *, timeout_seconds=30):
        token, _ = self.authenticate()
        # Do not retry writes after an ambiguous transport failure.
        return self.raw(method, path, token=token, body=body, timeout_seconds=timeout_seconds)

    def tools(self):
        return self.call("GET", "api/v1/tools")

    def call_tool(self, name, arguments):
        timeout = 30
        if name in {"simpai.vlm.chat", "simpai.vlm.analyze"}:
            requested = arguments.get("timeout_seconds", 120) if isinstance(arguments, dict) else 120
            if isinstance(requested, int) and not isinstance(requested, bool) and 1 <= requested <= 600:
                timeout = requested + 10
        return self.call("POST", "api/v1/tools/call", {"name": name, "arguments": arguments}, timeout_seconds=timeout)

    def pair(self, display, scopes=None, expected_did="", days=30, sleep=time.sleep):
        discovery = self.discover()
        self.secure_credentials()
        device = self.raw("POST", discovery["device_url"], body={
            "client_name": "SimpAI MCP", "expected_mode": discovery["access_mode"],
            "expected_did": expected_did, "authorization_days": days,
            "scopes": scopes or ["read", "assets.write", "runs.submit", "runs.cancel"],
        })
        display(self.url(device["verification_url"]), device["user_code"])
        deadline = time.monotonic() + min(600, device["expires_in"])
        while time.monotonic() < deadline:
            sleep(max(1, device["interval"]))
            result = self.raw("POST", discovery["token_url"], body={"device_code": device["device_code"]})
            if result["state"] != "authorized":
                continue
            session = self.raw("GET", discovery["session_url"], token=result["access_token"])
            identity = session["identity"]
            if expected_did and identity.get("did") != expected_did:
                raise ConnectionError("identity_context_changed")
            self._verify(identity, discovery)
            with self.store.locked():
                self.store.save({**result, "identity": self.binding(identity),
                                 "expires_at": self.clock() + result["expires_in"]})
            return session
        raise ConnectionError("pairing_timeout")

    def asset(self, asset_id):
        if not re.fullmatch(r"(?:asset|file):[0-9a-f]{24,64}", asset_id):
            raise ConnectionError("invalid_asset_id")
        token, _ = self.authenticate()
        headers = {"Authorization": "Bearer " + token} if token else {}
        try:
            with self.http.request("GET", self.url("api/v1/assets/" + quote(asset_id, safe="") + "/content"),
                                   headers=headers, timeout=(5, 30), allow_redirects=False, stream=True, **self._loopback_options()) as response:
                if response.status_code != 200:
                    raise ConnectionError("asset_unavailable")
                parts, size = [], 0
                for part in response.iter_content(65536):
                    size += len(part)
                    if size > 80 * 1024 * 1024:
                        raise ConnectionError("asset_too_large")
                    parts.append(part)
                return b"".join(parts), response.headers.get("Content-Type", "application/octet-stream").split(";")[0]
        except requests.RequestException:
            raise ConnectionError("studio_connection_failed") from None
