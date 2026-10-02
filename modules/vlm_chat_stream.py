import hashlib
import json
import logging
import secrets
import threading
import time
import uuid
from collections import deque


logger = logging.getLogger(__name__)


class StreamRequestError(ValueError):
    def __init__(self, code, status_code):
        super().__init__(code)
        self.code = code
        self.status_code = status_code


class ChatStreamSession:
    def __init__(self, key, token, fingerprint, clock, event_limit, byte_limit):
        self.key = key
        self.token = token
        self.fingerprint = fingerprint
        self.stream_id = f"vlm-chat-stream-{uuid.uuid4().hex[:10]}"
        self.started_at = clock()
        self.completed_at = None
        self.clock = clock
        self.event_limit = event_limit
        self.byte_limit = byte_limit
        self.condition = threading.Condition()
        self.sequence = 0
        self.events = deque()
        self.event_bytes = 0
        self.text_parts = []
        self.status = None
        self.result_event = None

    def emit(self, event):
        try:
            serialized = json.dumps(event, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        except (TypeError, ValueError) as exc:
            logger.exception(
                "Describe Image VLM chat stream serialization failed: stream_id=%s", self.stream_id,
            )
            event = {
                "type": "result",
                "result": {
                    "ok": False,
                    "error": "Describe Image VLM streaming serialization error",
                    "details": str(exc),
                    "failure_stage": "response_serialization",
                },
            }
            serialized = json.dumps(event, separators=(",", ":"))
        size = len(serialized.encode("utf-8"))
        with self.condition:
            if self.result_event is not None:
                return
            self.sequence += 1
            entry = (self.sequence, event, serialized, size)
            event_type = event.get("type")
            if event_type == "delta":
                self.text_parts.append(str(event.get("text") or ""))
            elif event_type == "reset":
                self.text_parts.clear()
            elif event_type in {"status", "progress"}:
                self.status = event
            elif event_type == "result":
                self.result_event = entry
                self.completed_at = self.clock()
            self.events.append(entry)
            self.event_bytes += size
            while len(self.events) > self.event_limit or (
                self.event_bytes > self.byte_limit and len(self.events) > 1
            ):
                self.event_bytes -= self.events.popleft()[3]
            self.condition.notify_all()

    def emit_delta(self, delta):
        if isinstance(delta, dict):
            event_type = str(delta.get("type") or "").strip().lower()
            if event_type == "reset":
                self.emit({"type": "reset"})
            elif event_type in {"status", "progress"}:
                self.emit({**delta, "type": event_type})
        elif delta:
            self.emit({"type": "delta", "text": str(delta)})

    def read(self, after, timeout):
        with self.condition:
            self.condition.wait_for(
                lambda: self.sequence > after or self.result_event is not None,
                timeout=timeout,
            )
            if self.sequence <= after:
                return []
            if self.events and after >= self.events[0][0] - 1:
                return [(entry[0], entry[2]) for entry in self.events if entry[0] > after]
            snapshot_sequence = self.sequence - (1 if self.result_event is not None else 0)
            replay = []
            if snapshot_sequence > after:
                snapshot = {
                    "type": "snapshot",
                    "text": "".join(self.text_parts),
                    "status": self.status,
                }
                replay.append((
                    snapshot_sequence,
                    json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")),
                ))
            if self.result_event is not None and self.result_event[0] > after:
                replay.append((self.result_event[0], self.result_event[2]))
            return replay

    def run(self, payload, runner):
        try:
            result = runner(payload, stream_callback=self.emit_delta)
            if not isinstance(result, dict):
                result = {"ok": False, "error": "Invalid VLM response.", "failure_stage": "vlm_runtime"}
        except Exception as exc:
            logger.exception("Describe Image VLM chat streaming exception: stream_id=%s", self.stream_id)
            result = {
                "ok": False,
                "error": "Describe Image VLM streaming error",
                "details": str(exc),
                "failure_stage": "endpoint_exception",
            }
        self.emit({"type": "result", "result": result})
        cached_result = self.result_event[1]["result"]
        logger.info(
            "Describe Image VLM chat stream result ready: stream_id=%s elapsed=%.3fs ok=%s",
            self.stream_id, self.clock() - self.started_at, cached_result.get("ok"),
        )


class ChatStreamRegistry:
    def __init__(self, ttl_seconds=3600, max_sessions=64, event_limit=256, byte_limit=512 * 1024, clock=time.monotonic):
        self.ttl_seconds = ttl_seconds
        self.max_sessions = max_sessions
        self.event_limit = event_limit
        self.byte_limit = byte_limit
        self.clock = clock
        self.lock = threading.Lock()
        self.sessions = {}

    def open(self, payload, owner, runner):
        resume = payload.get("_stream_resume") is True
        conversation_id = str(payload.get("conversation_id") or "").strip()
        request_id = str(payload.get("request_id") or "").strip()
        token = str(payload.get("_stream_token") or "").strip()
        stage_value = payload.get("_stream_stage") if resume else (
            payload.get("request_kind") or payload.get("roleplay_request_kind") or payload.get("chat_mode")
        )
        stage = str(stage_value or "").strip()
        try:
            after = int(payload.get("_stream_after") or 0)
        except (TypeError, ValueError, OverflowError):
            raise StreamRequestError("stream_invalid_cursor", 400) from None
        if after < 0 or any(len(value) > 256 for value in (conversation_id, request_id, token, stage)):
            raise StreamRequestError("stream_invalid_request", 400)
        if resume and (not request_id or not token):
            raise StreamRequestError("stream_invalid_request", 400)
        if token and (len(token) < 16 or not token.isascii()):
            raise StreamRequestError("stream_invalid_token", 400)
        if not request_id:
            request_id = uuid.uuid4().hex
        key = (str(owner or ""), conversation_id, request_id, stage)
        fingerprint = None
        if not resume:
            original = {
                name: value for name, value in payload.items()
                if name not in {"_skill_access", "_stream_token", "_stream_after", "_stream_resume", "_stream_stage"}
            }
            fingerprint = hashlib.sha256(
                json.dumps(original, sort_keys=True, ensure_ascii=False).encode("utf-8")
            ).hexdigest()
        with self.lock:
            now = self.clock()
            expired = [
                session_key for session_key, session in self.sessions.items()
                if session.completed_at is not None and now - session.completed_at >= self.ttl_seconds
            ]
            for session_key in expired:
                self.sessions.pop(session_key, None)
            session = self.sessions.get(key)
            if session is not None:
                if not token or not secrets.compare_digest(session.token, token):
                    raise StreamRequestError("stream_access_denied", 403)
                if not resume and fingerprint != session.fingerprint:
                    raise StreamRequestError("stream_request_conflict", 409)
                if after > session.sequence:
                    raise StreamRequestError("stream_invalid_cursor", 400)
                return session, after
            if resume:
                raise StreamRequestError("stream_session_unavailable", 410)
            if after:
                raise StreamRequestError("stream_invalid_cursor", 400)
            if len(self.sessions) >= self.max_sessions:
                completed = [
                    entry for entry in self.sessions.values() if entry.completed_at is not None
                ]
                if not completed:
                    raise StreamRequestError("stream_capacity_exceeded", 503)
                oldest = min(completed, key=lambda entry: entry.completed_at)
                self.sessions.pop(oldest.key, None)
            token = token or secrets.token_urlsafe(32)
            session = ChatStreamSession(
                key, token, fingerprint, self.clock, self.event_limit, self.byte_limit,
            )
            self.sessions[key] = session
            threading.Thread(
                target=session.run, args=(dict(payload), runner),
                name="describe-vlm-chat-stream", daemon=True,
            ).start()
            return session, after


STREAMS = ChatStreamRegistry()
