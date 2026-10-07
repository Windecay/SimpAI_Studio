"""Serve the Studio app on its selected interface and a real local listener."""

from contextlib import contextmanager
import ipaddress
import logging
import socket
import threading

from gradio import http_server


_launch_lock = threading.RLock()
logger = logging.getLogger(__name__)


def _bind(host, port):
    listener = socket.socket(socket.AF_INET6 if ":" in host else socket.AF_INET, socket.SOCK_STREAM)
    try:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        listener.bind((host, port))
        return listener
    except BaseException:
        listener.close()
        raise


def local_endpoint_for_request(request):
    """Offer the listener only to requests from this computer, never as remote localhost."""
    endpoint = getattr(request.app.state, "simpai_local_endpoint", None)
    if not isinstance(endpoint, dict):
        return None
    peer = getattr(request.client, "host", "")
    try:
        same_machine = ipaddress.ip_address(peer).is_loopback or peer in endpoint["interface_hosts"]
    except ValueError:
        return None
    if not same_machine:
        return None
    prefix = str(request.scope.get("root_path") or "").rstrip("/")
    base = endpoint["origin"] + prefix
    return {"base_url": base, "discovery_url": base + "/api/v1/auth/discovery",
            "connection_guide_url": base + "/api/v1/connect", "same_machine_only": True}


@contextmanager
def studio_http_server():
    """Use one Uvicorn server/event loop/lifespan for both listening sockets."""
    with _launch_lock:
        original = http_server.Server

        class StudioServer(original):
            async def startup(self, sockets=None):
                owned = []
                metadata = None
                if sockets is None and not self.config.is_ssl:
                    host = self.config.host.strip("[]")
                    try:
                        primary = _bind(host, self.config.port)
                        owned.append(primary)
                        bound_host, port = primary.getsockname()[:2]
                        local_host = "::1" if bound_host in {"::", "::1"} else "127.0.0.1"
                        if bound_host not in {"0.0.0.0", "127.0.0.1", "::", "::1"}:
                            try:
                                local = _bind("127.0.0.1", port)
                            except OSError:
                                # Reserve a real free local port; never reuse or terminate another listener.
                                local = _bind("127.0.0.1", 0)
                            owned.append(local)
                            port = local.getsockname()[1]
                        origin = f"http://{'[' + local_host + ']' if ':' in local_host else local_host}:{port}"
                        metadata = {"origin": origin, "interface_hosts": [bound_host]}
                        sockets = owned
                    except BaseException:
                        for listener in owned:
                            listener.close()
                        raise
                try:
                    await super().startup(sockets=sockets)
                except BaseException:
                    for listener in owned:
                        listener.close()
                    raise
                if not self.started:
                    for listener in owned:
                        listener.close()
                    return
                self._studio_local_endpoint = metadata
                if metadata:
                    self.config.app.state.simpai_local_endpoint = metadata
                    logger.info("Studio local Agent entry: %s", metadata["origin"])

            async def shutdown(self, sockets=None):
                metadata = getattr(self, "_studio_local_endpoint", None)
                if metadata is not None and getattr(self.config.app.state, "simpai_local_endpoint", None) is metadata:
                    self.config.app.state.simpai_local_endpoint = None
                await super().shutdown(sockets=sockets)

        http_server.Server = StudioServer
        try:
            yield
        finally:
            http_server.Server = original
