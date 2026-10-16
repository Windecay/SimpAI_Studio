from __future__ import annotations

import logging
import os
import select
import socket
import time
from collections.abc import MutableMapping
from urllib.parse import urlsplit


LOOPBACK_NO_PROXY_HOSTS = ("localhost", "127.0.0.1", "::1", "0.0.0.0")
_INVALID_HTTP_FILTER_SENTINEL = "_simpai_frontend_invalid_http_filter"
_H11_DATA_GUARD_SENTINEL = "_simpai_frontend_h11_data_guard"
_H11_DATA_ORIGINAL_ATTR = "_simpai_original_data_received"
_PROACTOR_ACCEPT_GUARD_SENTINEL = "_simpai_frontend_threaded_accept_guard"
_PROACTOR_ACCEPT_ORIGINAL_ATTR = "_simpai_original_accept"
_ASYNCIO_CONNECTION_RESET_FILTER_SENTINEL = "_simpai_frontend_asyncio_connection_reset_filter"
_WARNING_INTERVAL_SECONDS = 600.0
_PROTOCOL_WARNING_COUNTS: dict[str, int] = {}
_PROTOCOL_WARNING_LAST_LOGGED_AT: dict[str, float] = {}
_FRONTEND_HTTP_GUARD_CONFIG = {"host": "127.0.0.1", "port": ""}


def _normalize_no_proxy_host(host: str | None) -> str:
    host = str(host or "").strip()
    if not host:
        return ""
    if "://" in host:
        host = urlsplit(host).hostname or ""
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
    if ":" in host and host.count(":") == 1:
        host = host.split(":", 1)[0]
    return host.strip().lower()


def _frontend_bypass_hint(host: str | None = None) -> str:
    hosts = list(LOOPBACK_NO_PROXY_HOSTS)
    normalized = _normalize_no_proxy_host(host)
    if normalized and normalized not in hosts:
        hosts.append(normalized)
    return "/".join(hosts)


def _endpoint_host_port(endpoint) -> tuple[str, int | None]:
    if not endpoint:
        return "", None
    try:
        host = endpoint.ip
        port = endpoint.port
    except AttributeError:
        try:
            host, port = endpoint[:2]
        except Exception:
            return "", None
    try:
        port = int(port)
    except (TypeError, ValueError):
        port = None
    return _normalize_no_proxy_host(host), port


def describe_frontend_tls_client_process(client, server) -> str:
    client_host, client_port = _endpoint_host_port(client)
    server_host, server_port = _endpoint_host_port(server)
    if not client_host or not server_host or client_port is None or server_port is None:
        return ""
    try:
        import psutil
    except Exception:
        return ""

    try:
        connections = psutil.net_connections(kind="tcp")
    except Exception:
        return ""

    for conn in connections:
        l_host, l_port = _endpoint_host_port(getattr(conn, "laddr", None))
        r_host, r_port = _endpoint_host_port(getattr(conn, "raddr", None))
        if (l_host, l_port, r_host, r_port) != (client_host, client_port, server_host, server_port):
            continue

        pid = getattr(conn, "pid", None)
        if not pid:
            return "client_process=unknown"
        try:
            process = psutil.Process(pid)
            name = process.name()
        except Exception:
            name = "unknown"
        return f"client_process={name} pid={pid}"
    return ""


def ensure_loopback_no_proxy(
    environ: MutableMapping[str, str] | None = None,
    extra_hosts: tuple[str | None, ...] | list[str | None] | None = None,
) -> None:
    environ = environ if environ is not None else os.environ
    required_hosts = list(LOOPBACK_NO_PROXY_HOSTS)
    for host in extra_hosts or ():
        normalized = _normalize_no_proxy_host(host)
        if normalized and normalized not in required_hosts:
            required_hosts.append(normalized)
    for key in ("NO_PROXY", "no_proxy"):
        raw = environ.get(key, "")
        parts = [part.strip() for part in raw.split(",") if part.strip()]
        seen = {_normalize_no_proxy_host(part) for part in parts}
        changed = False
        for host in required_hosts:
            if host not in seen:
                parts.append(host)
                seen.add(host)
                changed = True
        if changed or key not in environ:
            environ[key] = ",".join(parts)


class FrontendInvalidHttpRequestFilter(logging.Filter):
    def __init__(self, *, host: str | None = None, port: int | str | None = None):
        super().__init__()
        self.host = host or "127.0.0.1"
        self.port = str(port or "")
        self.count = 0
        self._last_warning_at: float | None = None

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno != logging.WARNING or record.getMessage() != "Invalid HTTP request received.":
            return True

        self.count += 1
        now = time.monotonic()
        if self._last_warning_at is not None and now - self._last_warning_at < _WARNING_INTERVAL_SECONDS:
            return False
        self._last_warning_at = now

        if self.count > 1:
            record.msg = "[SimpAI-frontHTTP] Repeated invalid HTTP requests to the Gradio frontend. count=%s"
            record.args = (self.count,)
            return True

        url = f"http://{self.host}:{self.port}" if self.port else f"http://{self.host}"
        bypass_hint = _frontend_bypass_hint(self.host)
        record.msg = (
            "[SimpAI-frontHTTP] Invalid request reached the Gradio frontend port. "
            "Most cases are HTTPS/WSS or a proxy hitting the HTTP-only local URL. "
            "Use %s and bypass proxy/HTTPS upgrade for %s. "
            "Repeats are summarized at most once every 10 minutes. count=%s"
        )
        record.args = (url, bypass_hint, self.count)
        return True


def classify_frontend_invalid_http_bytes(data: bytes) -> str:
    if data.startswith(b"PRI * HTTP/2.0"):
        return "http2-preface"
    if len(data) >= 3 and data[0] == 0x16 and data[1] == 0x03:
        return "tls-client-hello"
    if len(data) >= 2 and data[0] == 0x80:
        return "ssl2-client-hello"
    return ""


def _should_log_protocol_warning(kind: str) -> tuple[bool, int]:
    count = _PROTOCOL_WARNING_COUNTS.get(kind, 0) + 1
    _PROTOCOL_WARNING_COUNTS[kind] = count
    now = time.monotonic()
    last_logged_at = _PROTOCOL_WARNING_LAST_LOGGED_AT.get(kind)
    if last_logged_at is not None and now - last_logged_at < _WARNING_INTERVAL_SECONDS:
        return False, count
    _PROTOCOL_WARNING_LAST_LOGGED_AT[kind] = now
    return True, count


def _is_benign_windows_proactor_connection_reset(record: logging.LogRecord) -> bool:
    message = str(record.getMessage())
    if "_call_connection_lost" not in message:
        return False

    exc = record.exc_info[1] if record.exc_info else None
    if not isinstance(exc, ConnectionResetError):
        return "ConnectionResetError" in message and "WinError 10054" in message

    winerror = getattr(exc, "winerror", None)
    errno = getattr(exc, "errno", None)
    args = {str(arg) for arg in getattr(exc, "args", ())}
    return winerror == 10054 or errno == 10054 or "10054" in args or "WinError 10054" in message


class FrontendAsyncioConnectionResetFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return not _is_benign_windows_proactor_connection_reset(record)


def configure_asyncio_connection_reset_filter() -> None:
    logger = logging.getLogger("asyncio")
    if getattr(logger, _ASYNCIO_CONNECTION_RESET_FILTER_SENTINEL, False):
        return

    logger.addFilter(FrontendAsyncioConnectionResetFilter())
    setattr(logger, _ASYNCIO_CONNECTION_RESET_FILTER_SENTINEL, True)


def _env_flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _raw_socket(sock):
    return getattr(sock, "_sock", sock)


def _is_tcp_socket(sock) -> bool:
    raw = _raw_socket(sock)
    try:
        family = raw.family
        sock_type = raw.type
    except AttributeError:
        return False
    return family in {socket.AF_INET, socket.AF_INET6} and bool(sock_type & socket.SOCK_STREAM)


def _threaded_socket_accept(sock):
    raw = _raw_socket(sock)
    while True:
        readable, _, _ = select.select([raw], [], [], 0.25)
        if not readable:
            continue
        try:
            accepted, address = raw.accept()
        except (BlockingIOError, InterruptedError):
            continue
        accepted.setblocking(False)
        return accepted, address


def _should_patch_windows_proactor_accept() -> bool:
    if os.name != "nt":
        return False
    return _env_flag("SIMPAI_FRONTEND_THREADED_ACCEPT", False)


def patch_windows_proactor_accept_threaded(host: str | None = None, port: int | str | None = None) -> bool:
    if not _should_patch_windows_proactor_accept():
        return False
    try:
        import asyncio
        from asyncio.windows_events import IocpProactor
    except Exception:
        return False

    if getattr(IocpProactor, _PROACTOR_ACCEPT_GUARD_SENTINEL, False):
        return True

    original_accept = IocpProactor.accept
    setattr(IocpProactor, _PROACTOR_ACCEPT_ORIGINAL_ATTR, original_accept)

    def accept(self, listener):
        if not _is_tcp_socket(listener):
            return original_accept(self, listener)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return original_accept(self, listener)
        return loop.run_in_executor(None, _threaded_socket_accept, listener)

    IocpProactor.accept = accept
    setattr(IocpProactor, _PROACTOR_ACCEPT_GUARD_SENTINEL, True)
    logging.getLogger("uvicorn.error").info(
        "[SimpAI-frontHTTP] Windows Proactor TCP accept uses threaded Winsock accept. host=%s port=%s",
        host or "127.0.0.1",
        port or "",
    )
    return True


def patch_uvicorn_h11_protocol_probe(host: str | None = None, port: int | str | None = None) -> None:
    try:
        from uvicorn.protocols.http.h11_impl import H11Protocol
    except Exception:
        return

    if getattr(H11Protocol, _H11_DATA_GUARD_SENTINEL, False):
        return

    original = H11Protocol.data_received
    setattr(H11Protocol, _H11_DATA_ORIGINAL_ATTR, original)

    def data_received(self, data: bytes) -> None:
        kind = classify_frontend_invalid_http_bytes(data[:24] if data else b"")
        if kind:
            should_log, count = _should_log_protocol_warning(kind)
            if should_log and count > 1:
                logging.getLogger("uvicorn.error").warning(
                    "[SimpAI-frontHTTP] Repeated %s on the HTTP-only Gradio frontend. count=%s",
                    kind,
                    count,
                )
            elif should_log:
                current_host = _FRONTEND_HTTP_GUARD_CONFIG.get("host") or "127.0.0.1"
                current_port = _FRONTEND_HTTP_GUARD_CONFIG.get("port") or ""
                url = f"http://{current_host}:{current_port}" if current_port else f"http://{current_host}"
                bypass_hint = _frontend_bypass_hint(current_host)
                client = getattr(self, "client", None)
                server = getattr(self, "server", None)
                process_hint = describe_frontend_tls_client_process(client, server)
                logging.getLogger("uvicorn.error").warning(
                    "[SimpAI-frontHTTP] %s reached the HTTP-only Gradio frontend port. "
                    "Open %s and bypass proxy/HTTPS upgrade for %s. "
                    "Repeats are summarized at most once every 10 minutes. "
                    "client=%s server=%s %s count=%s",
                    kind,
                    url,
                    bypass_hint,
                    client,
                    server,
                    process_hint,
                    count,
                )
        return original(self, data)

    H11Protocol.data_received = data_received
    setattr(H11Protocol, _H11_DATA_GUARD_SENTINEL, True)


def configure_frontend_http_guard(host: str | None = None, port: int | str | None = None) -> None:
    ensure_loopback_no_proxy(extra_hosts=[host])
    _FRONTEND_HTTP_GUARD_CONFIG["host"] = host or "127.0.0.1"
    _FRONTEND_HTTP_GUARD_CONFIG["port"] = str(port or "")
    configure_asyncio_connection_reset_filter()
    patch_windows_proactor_accept_threaded(host, port)
    patch_uvicorn_h11_protocol_probe(host, port)
    logger = logging.getLogger("uvicorn.error")
    existing = getattr(logger, _INVALID_HTTP_FILTER_SENTINEL, None)
    if existing is not None:
        existing.host = host or existing.host
        existing.port = str(port or existing.port or "")
        return

    filt = FrontendInvalidHttpRequestFilter(host=host, port=port)
    logger.addFilter(filt)
    setattr(logger, _INVALID_HTTP_FILTER_SENTINEL, filt)
