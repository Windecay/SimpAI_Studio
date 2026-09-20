from urllib.parse import urlsplit

from starlette.types import ASGIApp, Receive, Scope, Send


class GradioHeartbeatWebSocketMiddleware:
    """Carry the existing authenticated heartbeat route over a WebSocket."""

    def __init__(self, app: ASGIApp):
        self.app = app
        self._active_sessions: dict[str, int] = {}

    async def _serve_heartbeat(self, scope: Scope, receive: Receive, send: Send):
        session_hash = scope["path"].rsplit("/", 1)[-1]
        registered = False
        successful = False

        def reopen_session():
            holder = getattr(scope.get("app"), "state_holder", None)
            session = holder.session_data.get(session_hash) if holder is not None else None
            if session is not None:
                session.is_closed = False

        async def heartbeat_send(message):
            nonlocal registered, successful
            if message["type"] == "http.response.start":
                successful = message["status"] == 200
            elif (
                successful
                and message["type"] == "http.response.body"
                and b"data: ALIVE" in message.get("body", b"")
            ):
                if not registered:
                    self._active_sessions[session_hash] = self._active_sessions.get(session_hash, 0) + 1
                    registered = True
                # Gradio marks disconnected sessions closed, but does not reopen
                # them on heartbeat reconnect, leaving their state subject to GC.
                reopen_session()
            await send(message)

        try:
            await self.app(scope, receive, heartbeat_send)
        finally:
            if registered:
                remaining = self._active_sessions[session_hash] - 1
                if remaining:
                    self._active_sessions[session_hash] = remaining
                    # An older connection can finish its cleanup after a new one
                    # has already started for this same session.
                    reopen_session()
                else:
                    del self._active_sessions[session_hash]

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        path = scope.get("path", "")
        if "/gradio_api/heartbeat/" not in path:
            await self.app(scope, receive, send)
            return
        if scope["type"] == "http" and scope.get("method") == "GET":
            await self._serve_heartbeat(scope, receive, send)
            return
        if scope["type"] != "websocket":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        origin = headers.get(b"origin", b"").decode("latin-1")
        host = headers.get(b"host", b"").decode("latin-1")
        if not origin or urlsplit(origin).netloc.lower() != host.lower():
            await send({"type": "websocket.close", "code": 1008})
            return
        if (await receive())["type"] != "websocket.connect":
            return

        http_scope = dict(scope)
        http_scope.update(
            type="http",
            method="GET",
            scheme="https" if scope.get("scheme") == "wss" else "http",
            http_version="1.1",
            # StreamingResponse must listen for disconnects to run Gradio cleanup.
            asgi={**scope.get("asgi", {}), "spec_version": "2.3"},
        )
        http_scope.pop("subprotocols", None)
        http_scope.pop("extensions", None)
        request_sent = False
        accepted = False
        closed = False

        async def http_receive():
            nonlocal request_sent, closed
            if not request_sent:
                request_sent = True
                return {"type": "http.request", "body": b"", "more_body": False}
            while True:
                message = await receive()
                if message["type"] == "websocket.disconnect":
                    closed = True
                    return {"type": "http.disconnect"}

        async def http_send(message):
            nonlocal accepted, closed
            if closed:
                return
            if message["type"] == "http.response.start":
                if message["status"] != 200:
                    closed = True
                    await send({"type": "websocket.close", "code": 1008})
                    return
                await send({"type": "websocket.accept"})
                accepted = True
            elif message["type"] == "http.response.body" and accepted:
                if message.get("body"):
                    await send({"type": "websocket.send", "text": message["body"].decode("utf-8")})
                if not message.get("more_body", False):
                    closed = True
                    await send({"type": "websocket.close", "code": 1000})

        await self._serve_heartbeat(http_scope, http_receive, http_send)
