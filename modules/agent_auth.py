"""Browser-approved, scoped Agent credentials. Secrets are never stored in plaintext."""

import hashlib
import ipaddress
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import replace
from pathlib import Path

from pydantic import Field, model_validator

from modules.agent_api_contract import API_PREFIX, RequestModel
from modules.agent_service import AgentAPIError, AgentContext, _require_context


SCOPES = ("read", "assets.write", "runs.submit", "runs.cancel", "node.read", "models.download", "vlm.infer")
DEFAULT_SCOPES = ["read", "assets.write", "runs.submit", "runs.cancel"]
PAIRING_SECONDS = 600
TOKEN_SECONDS = 3600
AUTHORIZATION_DAYS = 30
POLL_SECONDS = 5
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def authorization_transport(request):
    try:
        peer_local = ipaddress.ip_address(request.client.host).is_loopback
    except (ValueError, AttributeError):
        peer_local = False
    loopback = getattr(request.url, "hostname", None) in {"localhost", "127.0.0.1", "::1"} and peer_local
    return {"requirement": "https_or_loopback", "scheme": request.url.scheme,
            "loopback": loopback, "satisfied": request.url.scheme == "https" or loopback}


def secure_transport(request):
    transport = authorization_transport(request)
    if transport["satisfied"]:
        return
    prefix = str(request.scope.get("root_path") or "").rstrip("/")
    raise AgentAPIError("secure_transport_required",
                        "This address cannot authorize an Agent. Use a configured HTTPS endpoint or a reachable loopback listener on the Studio computer. A LAN IP on the same computer is not loopback.",
                        403, {"transport": transport, "pairing_available": False,
                              "connection_guide_url": prefix + API_PREFIX + "/connect",
                              "next_step": "configure_https_or_loopback", "retryable": False})


class DeviceRequest(RequestModel):
    client_name: str = Field(min_length=1, max_length=100, pattern=r"^[^\x00-\x1f\x7f]+$")
    expected_did: str = Field(default="", max_length=240)
    expected_mode: str = Field(default="", pattern=r"^(?:local|multi-user)?$")
    scopes: list[str] = Field(default_factory=lambda: list(DEFAULT_SCOPES), min_length=1, max_length=len(SCOPES))
    lang: str = Field(default="", pattern=r"^(?:cn|en)?$")
    authorization_days: int = Field(default=AUTHORIZATION_DAYS, ge=1, le=AUTHORIZATION_DAYS)

    @model_validator(mode="after")
    def known_scopes(self):
        if any(scope not in SCOPES for scope in self.scopes) or "read" not in self.scopes:
            raise ValueError("Use supported scopes and include read.")
        self.scopes = [scope for scope in SCOPES if scope in self.scopes]
        return self


class TokenRequest(RequestModel):
    device_code: str = Field(pattern=r"^device_[A-Za-z0-9_-]{40,80}$")


class RefreshRequest(RequestModel):
    refresh_token: str = Field(pattern=r"^agent_refresh_[A-Za-z0-9_-]{40,80}$")


class ConsentRequest(RequestModel):
    user_code: str = Field(min_length=8, max_length=16)
    csrf_token: str = Field(min_length=40, max_length=100)
    decision: str = Field(pattern=r"^(approve|deny)$")
    scopes: list[str] = Field(default_factory=list, max_length=len(SCOPES))
    authorization_days: int | None = Field(default=None, ge=1, le=AUTHORIZATION_DAYS)


def _digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def _code(value):
    value = value.replace("-", "").upper()
    if not re.fullmatch(r"[A-HJ-NP-Z2-9]{8}", value):
        raise AgentAPIError("invalid_user_code", "Invalid pairing code.", 422)
    return value


def private_store_directory():
    import shared
    root = getattr(shared, "path_userhome", None)
    if not root:
        raise AgentAPIError("identity_unavailable", "The Studio identity store is unavailable.", 503)
    return Path(root).resolve() / ".agent_authorizations"


class StudioIdentity:
    def mode(self):
        import shared
        token = getattr(shared, "token", None)
        if token is None:
            return "local"
        try:
            return "multi-user" if token.get_admin_did() else "local"
        except Exception as exc:
            raise AgentAPIError("identity_unavailable", "The Studio access mode cannot be verified.", 503) from exc

    def service_id(self):
        import shared
        token = getattr(shared, "token", None)
        node = str(token.get_sys_did() or "") if token is not None else ""
        return "studio-" + _digest(node + "\0" + str(Path(__file__).resolve().parents[1]))[:32]

    def subject(self, did):
        import shared
        from modules.canvas_workbench_request_identity import normalize_payload_identity, resolve_local_workspace_did
        from modules.canvas_workbench_project import _state_params_for_payload
        token = getattr(shared, "token", None)
        mode = self.mode()
        if mode == "local":
            if resolve_local_workspace_did(token) != did:
                raise AgentAPIError("identity_context_changed", "The local workspace identity has changed.", 409)
            role = "local"
        else:
            if token is None or token.get_user_context(did).get_did() != did or token.is_guest(did):
                raise AgentAPIError("identity_unavailable", "The authorized identity is no longer available.", 401)
            role = "admin" if token.is_admin(did) else "user"
        payload = normalize_payload_identity({}, did, access_mode="local" if mode == "local" else "multi", user_role=role)
        return AgentContext(_state_params_for_payload(payload, {}), payload["user_context"])

    def describe(self, context):
        import shared
        from modules.access_mode import get_user_access_record, user_can_download_models, user_can_generate
        from modules.canvas_workbench_assets import _asset_root
        state = {**context.state, "user_did": context.user_id}
        root, _ = _asset_root("agent_api", state)
        token = getattr(shared, "token", None)
        output_root = token.get_path_in_user_dir(context.user_id, "outputs") if token is not None else str(Path(root).parent / "outputs")
        mode = "local" if context.user_context.get("scope") == "local" else "multi-user"
        role = context.user_context.get("role")
        record = get_user_access_record(context.user_id) if mode != "local" and role == "user" else None
        status = str(record.get("status") or "unavailable") if record is not None else ("guest" if role == "guest" else "allowed")
        if mode != "local" and role == "user" and token is not None:
            native = token.get_user_context(context.user_id)
            if native.get_did() != context.user_id:
                raise AgentAPIError("identity_unavailable", "The browser identity is unavailable.", 401)
            if hasattr(native, "is_pending") and native.is_pending():
                status = "pending"
        scopes = ["read", "assets.write", "runs.cancel"]
        if user_can_generate(context.user_id):
            scopes.append("runs.submit")
            scopes.append("vlm.infer")
        if user_can_download_models(context.user_id):
            scopes.append("models.download")
        if role in {"local", "admin"}:
            scopes.append("node.read")
        if status != "allowed":
            scopes = []
        storage = {"scope": "local_workspace" if mode == "local" else "user_private",
                   "namespace_id": _digest(os.path.normcase(root) + "\0" + os.path.normcase(output_root))}
        binding = _digest(json.dumps([self.service_id(), mode, context.user_id, role, storage], sort_keys=True))
        return {"service_id": self.service_id(), "access_mode": mode, "did": context.user_id,
                "role": role, "access_status": status, "available_scopes": sorted(scopes),
                "storage": storage, "binding_id": binding, "language": context.state.get("__lang") or "en"}


class AuthorizationStore:
    def __init__(self, path, clock=time.time):
        self.path = Path(path)
        self.clock = clock

    @contextmanager
    def transaction(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if os.name != "nt":
            self.path.parent.chmod(0o700)
        connection = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        connection.row_factory = sqlite3.Row
        try:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS devices (
                    device_hash TEXT PRIMARY KEY, code_hash TEXT UNIQUE, request TEXT NOT NULL,
                    expires REAL NOT NULL, last_poll REAL NOT NULL DEFAULT 0,
                    state TEXT NOT NULL DEFAULT 'pending', csrf_hash TEXT, actor_binding TEXT,
                    identity TEXT, scopes TEXT
                );
                CREATE TABLE IF NOT EXISTS credentials (
                    id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, owner TEXT NOT NULL,
                    client_name TEXT NOT NULL, identity TEXT NOT NULL, scopes TEXT NOT NULL,
                    created REAL NOT NULL, expires REAL NOT NULL, revoked INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    token_hash TEXT PRIMARY KEY, credential_id TEXT NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0
                );
            """)
            if os.name != "nt":
                self.path.chmod(0o600)
            connection.execute("BEGIN IMMEDIATE")
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(credentials)")}
            if "authorization_expires" not in columns:
                connection.execute("ALTER TABLE credentials ADD COLUMN authorization_expires REAL")
                connection.execute("UPDATE credentials SET authorization_expires=expires")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def create(self, request):
        secret = "device_" + secrets.token_urlsafe(32)
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        expires = self.clock() + PAIRING_SECONDS
        with self.transaction() as db:
            db.execute("DELETE FROM devices WHERE expires < ?", (self.clock() - PAIRING_SECONDS,))
            if db.execute("SELECT COUNT(*) FROM devices WHERE expires > ?", (self.clock(),)).fetchone()[0] >= 1000:
                raise AgentAPIError("pairing_capacity_reached", "Too many pending pairing requests.", 429)
            db.execute("INSERT INTO devices(device_hash, code_hash, request, expires) VALUES(?,?,?,?)",
                       (_digest(secret), _digest(code), json.dumps(request), expires))
        return secret, code[:4] + "-" + code[4:]

    def _device(self, db, code_hash, field="code_hash"):
        row = db.execute(f"SELECT * FROM devices WHERE {field} = ?", (code_hash,)).fetchone()
        if row is None:
            raise AgentAPIError("pairing_not_found", "The pairing request is unavailable.", 404)
        if row["expires"] <= self.clock():
            raise AgentAPIError("expired_token", "The pairing request has expired.", 410)
        return row

    def view(self, code, identity=None):
        nonce = secrets.token_urlsafe(32)
        with self.transaction() as db:
            row = self._device(db, _digest(_code(code)))
            if row["state"] != "pending":
                raise AgentAPIError("pairing_closed", "This pairing request is already closed.", 409)
            if identity is not None:
                db.execute("UPDATE devices SET csrf_hash=?, actor_binding=? WHERE device_hash=?",
                           (_digest(nonce), identity["binding_id"], row["device_hash"]))
        return json.loads(row["request"]), nonce if identity is not None else ""

    def decide(self, request, identity):
        with self.transaction() as db:
            row = self._device(db, _digest(_code(request.user_code)))
            if row["state"] != "pending":
                raise AgentAPIError("pairing_closed", "This pairing request is already closed.", 409)
            if not secrets.compare_digest(row["csrf_hash"] or "", _digest(request.csrf_token)):
                raise AgentAPIError("invalid_csrf_token", "Reload the authorization page.", 403)
            if row["actor_binding"] != identity["binding_id"]:
                raise AgentAPIError("identity_context_changed", "The browser identity or storage scope changed. Reload the page.", 409)
            original = json.loads(row["request"])
            if original["expected_mode"] != identity["access_mode"] or original["service_id"] != identity["service_id"]:
                raise AgentAPIError("identity_context_changed", "The Studio mode has changed.", 409)
            if request.decision == "approve":
                if original["expected_did"] and original["expected_did"] != identity["did"]:
                    raise AgentAPIError("identity_mismatch", "The signed-in identity does not match the requested DID.", 409)
                if identity["access_status"] != "allowed":
                    raise AgentAPIError("account_not_allowed", "This identity is not approved for API access.", 403)
                if ("read" not in request.scopes or
                        not set(request.scopes) <= set(original["scopes"]) & set(identity["available_scopes"])):
                    raise AgentAPIError("scope_not_allowed", "The selected permissions cannot be granted.", 403)
                days = request.authorization_days or original.get("authorization_days", AUTHORIZATION_DAYS)
                if days > original.get("authorization_days", AUTHORIZATION_DAYS):
                    raise AgentAPIError("authorization_duration_not_allowed", "The approved duration exceeds the request.", 403)
                original["authorization_days"] = days
            db.execute("UPDATE devices SET state=?, identity=?, scopes=?, request=?, csrf_hash=NULL WHERE device_hash=?",
                       ("approved" if request.decision == "approve" else "denied", json.dumps(identity),
                        json.dumps(sorted(set(request.scopes))), json.dumps(original), row["device_hash"]))

    def exchange(self, code, identity_check):
        now = self.clock()
        with self.transaction() as db:
            row = self._device(db, _digest(code), "device_hash")
            if row["state"] == "pending":
                if row["last_poll"] and now - row["last_poll"] < POLL_SECONDS:
                    raise AgentAPIError("slow_down", "Wait before polling again.", 429, {"interval": POLL_SECONDS})
                db.execute("UPDATE devices SET last_poll=? WHERE device_hash=?", (now, row["device_hash"]))
                return {"state": "authorization_pending", "interval": POLL_SECONDS}
            if row["state"] == "denied":
                raise AgentAPIError("access_denied", "The user declined authorization.", 403)
            if row["state"] != "approved":
                raise AgentAPIError("device_code_consumed", "The pairing code has already been redeemed.", 409)
            identity = json.loads(row["identity"])
            identity_check(identity)
            scopes = json.loads(row["scopes"])
            token = "agent_" + secrets.token_urlsafe(32)
            refresh = "agent_refresh_" + secrets.token_urlsafe(32)
            credential_id = secrets.token_hex(16)
            original = json.loads(row["request"])
            authorization_expires = now + original.get("authorization_days", AUTHORIZATION_DAYS) * 86400
            db.execute("""INSERT INTO credentials
                       (id, token_hash, owner, client_name, identity, scopes, created, expires, authorization_expires)
                       VALUES(?,?,?,?,?,?,?,?,?)""",
                       (credential_id, _digest(token), identity["did"], original["client_name"],
                        row["identity"], row["scopes"], now, now + TOKEN_SECONDS, authorization_expires))
            db.execute("INSERT INTO refresh_tokens(token_hash, credential_id) VALUES(?,?)",
                       (_digest(refresh), credential_id))
            db.execute("UPDATE devices SET state='consumed' WHERE device_hash=?", (row["device_hash"],))
        return {"state": "authorized", "token_type": "Bearer", "access_token": token,
                "expires_in": TOKEN_SECONDS, "credential_id": credential_id,
                "refresh_token": refresh, "refresh_expires_in": int(authorization_expires - now),
                "authorization_expires_at": authorization_expires, "scopes": scopes, "identity": identity}

    def refresh(self, token, identity_check):
        now = self.clock()
        replay = False
        with self.transaction() as db:
            row = db.execute("""SELECT c.*, r.used FROM refresh_tokens r
                              JOIN credentials c ON c.id=r.credential_id WHERE r.token_hash=?""",
                             (_digest(token),)).fetchone()
            if row is None or row["revoked"] or row["authorization_expires"] <= now:
                raise AgentAPIError("invalid_refresh_token", "The refresh credential is invalid, expired or revoked.", 401)
            if row["used"]:
                # Commit the revocation before reporting reuse of a rotated secret.
                db.execute("UPDATE credentials SET revoked=1 WHERE id=?", (row["id"],))
                replay = True
            else:
                identity = json.loads(row["identity"])
                _, current = identity_check(identity)
                scopes = sorted(set(json.loads(row["scopes"])) & set(current["available_scopes"]))
                access = "agent_" + secrets.token_urlsafe(32)
                refresh = "agent_refresh_" + secrets.token_urlsafe(32)
                lifetime = min(TOKEN_SECONDS, int(row["authorization_expires"] - now))
                if lifetime < 1:
                    raise AgentAPIError("invalid_refresh_token", "The authorization has expired.", 401)
                db.execute("UPDATE refresh_tokens SET used=1 WHERE token_hash=?", (_digest(token),))
                db.execute("INSERT INTO refresh_tokens(token_hash, credential_id) VALUES(?,?)",
                           (_digest(refresh), row["id"]))
                db.execute("UPDATE credentials SET token_hash=?, expires=?, scopes=? WHERE id=?",
                           (_digest(access), now + lifetime, json.dumps(scopes), row["id"]))
        if replay:
            raise AgentAPIError("refresh_token_reused", "A rotated refresh credential was reused. Authorize again.", 401)
        return {"state": "authorized", "token_type": "Bearer", "access_token": access,
                "expires_in": lifetime, "refresh_token": refresh,
                "refresh_expires_in": int(row["authorization_expires"] - now),
                "authorization_expires_at": row["authorization_expires"], "credential_id": row["id"],
                "scopes": scopes, "identity": identity}

    def lookup(self, token):
        with self.transaction() as db:
            row = db.execute("SELECT * FROM credentials WHERE token_hash=?", (_digest(token),)).fetchone()
        return self._active(row)

    def lookup_credential(self, credential_id):
        with self.transaction() as db:
            row = db.execute("SELECT * FROM credentials WHERE id=?", (credential_id,)).fetchone()
        return self._active(row)

    def _active(self, row):
        if row is None or row["revoked"] or min(row["expires"], row["authorization_expires"]) <= self.clock():
            raise AgentAPIError("invalid_agent_credential", "The Agent credential is invalid, expired or revoked.", 401)
        return dict(row)

    def listing(self, owner):
        with self.transaction() as db:
            rows = db.execute("SELECT id, client_name, scopes, created, expires, authorization_expires, revoked FROM credentials WHERE owner=? ORDER BY created DESC",
                              (owner,)).fetchall()
        return [{**dict(row), "scopes": json.loads(row["scopes"])} for row in rows]

    def revoke(self, credential_id, owner):
        with self.transaction() as db:
            if not db.execute("UPDATE credentials SET revoked=1 WHERE id=? AND owner=?", (credential_id, owner)).rowcount:
                raise AgentAPIError("credential_not_found", "This credential is unavailable to the current identity.", 404)


class AgentAuthorization:
    def __init__(self, browser_context, identity=None, store=None):
        self.browser_context = browser_context
        self.identity = identity or StudioIdentity()
        self._store = store
        self._rate_lock = threading.Lock()
        self._rates = {}

    @property
    def store(self):
        if self._store is None:
            self._store = AuthorizationStore(private_store_directory() / (self.identity.service_id() + ".sqlite3"))
        return self._store

    def rate_limit(self, key, limit):
        now = time.monotonic()
        with self._rate_lock:
            self._rates = {name: times for name, times in self._rates.items() if times and now - times[-1] < 60}
            times = [value for value in self._rates.get(key, []) if now - value < 60]
            if len(times) >= limit or (key not in self._rates and len(self._rates) >= 5000):
                raise AgentAPIError("rate_limited", "Too many authorization requests. Try again later.", 429)
            self._rates[key] = [*times, now]

    def discovery(self):
        return {"service": "SimpAI Studio", "service_id": self.identity.service_id(), "access_mode": self.identity.mode(),
                "authentication_required": self.identity.mode() != "local",
                "methods": ["browser_pairing"], "guest_policy": "discovery_only",
                "device_url": f"{API_PREFIX}/auth/device", "token_url": f"{API_PREFIX}/auth/token",
                "refresh_url": f"{API_PREFIX}/auth/refresh",
                "session_url": f"{API_PREFIX}/session", "authorization_url": f"{API_PREFIX}/auth/authorize",
                "scopes": list(SCOPES), "pairing_expires_in": PAIRING_SECONDS, "token_expires_in": TOKEN_SECONDS,
                "authorization_days": AUTHORIZATION_DAYS, "refresh_rotation": True,
                "secure_transport": "https_or_loopback"}

    def create(self, request):
        mode = self.identity.mode()
        if request.expected_mode and request.expected_mode != mode:
            raise AgentAPIError("identity_context_changed", "The Studio mode does not match the requested mode.", 409)
        device, code = self.store.create({**request.model_dump(), "expected_mode": mode,
                                          "service_id": self.identity.service_id()})
        return {"device_code": device, "user_code": code,
                "verification_url": f"{API_PREFIX}/auth/authorize?user_code={code}" +
                                    ("&lang=" + request.lang if request.lang else ""),
                "expires_in": PAIRING_SECONDS, "interval": POLL_SECONDS}

    def check_identity(self, saved):
        if saved["service_id"] != self.identity.service_id() or saved["access_mode"] != self.identity.mode():
            raise AgentAPIError("identity_context_changed", "The Studio mode or identity changed. Authorize again.", 409)
        context = self.identity.subject(saved["did"])
        current = self.identity.describe(context)
        if current["binding_id"] != saved["binding_id"]:
            raise AgentAPIError("identity_context_changed", "The identity, role or storage scope changed. Authorize again.", 409)
        if current["access_status"] != "allowed":
            raise AgentAPIError("account_not_allowed", "The authorized account is no longer allowed.", 403)
        return context, current

    def request_context(self, request):
        header = request.headers.get("authorization", "")
        if not header:
            return self.browser_context(request)
        secure_transport(request)
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer" or not re.fullmatch(r"agent_[A-Za-z0-9_-]{40,80}", parts[1]):
            raise AgentAPIError("invalid_agent_credential", "Use a valid Agent Bearer credential.", 401)
        record = self.store.lookup(parts[1])
        return self._credential_context(record)

    def _credential_context(self, record):
        context, identity = self.check_identity(json.loads(record["identity"]))
        context = replace(context, state={**context.state, "__lang": json.loads(record["identity"]).get("language") or "en"})
        identity = {**identity, "language": context.state["__lang"]}
        scopes = sorted(set(json.loads(record["scopes"])) & set(identity["available_scopes"]))
        return replace(context, authorization={"id": record["id"], "client_name": record["client_name"],
                                              "scopes": scopes, "expires_at": record["expires"],
                                              "authorization_expires_at": record["authorization_expires"],
                                              "identity": identity})

    def actor(self, request):
        if request.headers.get("authorization", "").lower().startswith("bearer "):
            raise AgentAPIError("browser_session_required", "Use the Studio browser identity for authorization management.", 403)
        context = self.browser_context(request)
        _require_context(context)
        identity = self.identity.describe(context)
        if identity["access_mode"] != self.identity.mode():
            raise AgentAPIError("identity_context_changed", "The browser identity does not match the Studio mode.", 409)
        if identity["access_status"] != "allowed":
            raise AgentAPIError("account_not_allowed", "The browser identity is not approved.", 403)
        return context, identity

    def chat_context(self, request, lang=""):
        context = self.request_context(request)
        return self._chat_context(context, lang)

    def chat_credential_context(self, credential_id, lang=""):
        # Used only by a server-created resolver for an already authenticated turn.
        context = self._credential_context(self.store.lookup_credential(credential_id))
        return self._chat_context(context, lang)

    def _chat_context(self, context, lang):
        identity = self.identity.describe(context)
        state = {**context.state, "_agent_identity_binding": identity["binding_id"],
                 "_agent_available_scopes": identity["available_scopes"]}
        if lang in {"cn", "en"}:
            state["__lang"] = lang
        return replace(context, state=state)
