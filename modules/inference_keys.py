"""Long-lived, inference-only credentials for external Chat Completions clients."""
from contextlib import contextmanager
from dataclasses import replace
import hashlib
import json
import re
import secrets
from typing import Literal

from pydantic import Field, model_validator

from modules.agent_api_contract import API_PREFIX, RequestModel
from modules.agent_service import AgentAPIError


KEY_PATTERN = re.compile(r"^sk-simpai-[A-Za-z0-9_-]{43}$")
KEY_ID_PATTERN = re.compile(r"^llmkey_[A-Za-z0-9_-]{24}$")
COOKIE_NAME = "simpai_inference_key_csrf"
ALLOWED_ROUTES = {
    ("GET", API_PREFIX + "/llm/models"),
    ("POST", API_PREFIX + "/llm/chat/completions"),
}


class KeyAction(RequestModel):
    csrf_token: str = Field(min_length=40, max_length=100)
    binding_id: str = Field(min_length=1, max_length=200)


class KeyCreate(KeyAction):
    name: str = Field(min_length=1, max_length=100, pattern=r"^[^\x00-\x1f\x7f]+$")
    expires_days: int = Field(default=90, ge=0, le=3650, description="0 disables expiration.")
    allow_all_models: bool
    models: list[str] = Field(default_factory=list, max_length=100)
    vram_policy: Literal["cpu", "relaxed", "standard", "extreme"] = "extreme"

    @model_validator(mode="after")
    def valid_models(self):
        if not self.name.strip():
            raise ValueError("Provide a key name.")
        if self.allow_all_models and self.models or not self.allow_all_models and not self.models:
            raise ValueError("Select all models or an explicit non-empty model list.")
        if any(not name or len(name) > 180 for name in self.models) or len(set(self.models)) != len(self.models):
            raise ValueError("Provide unique local model IDs.")
        return self


class KeySettings(KeyAction):
    vram_policy: Literal["cpu", "relaxed", "standard", "extreme"]


class InferenceKeyStore:
    def __init__(self, authorization_store):
        self.store = authorization_store
        from modules.inference_key_secrets import KeyVault
        self.vault = KeyVault(authorization_store.path)

    @contextmanager
    def transaction(self):
        with self.store.transaction() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS inference_keys (
                id TEXT PRIMARY KEY, key_hash TEXT UNIQUE NOT NULL, owner TEXT NOT NULL,
                name TEXT NOT NULL, hint TEXT NOT NULL, identity TEXT NOT NULL,
                models TEXT NOT NULL, created REAL NOT NULL, expires REAL,
                last_used REAL, revoked INTEGER NOT NULL DEFAULT 0, encrypted_key BLOB,
                vram_policy TEXT NOT NULL DEFAULT 'extreme'
            )""")
            columns = {row["name"] for row in db.execute("PRAGMA table_info(inference_keys)")}
            if "encrypted_key" not in columns:
                db.execute("ALTER TABLE inference_keys ADD COLUMN encrypted_key BLOB")
            if "vram_policy" not in columns:
                db.execute("ALTER TABLE inference_keys ADD COLUMN vram_policy TEXT NOT NULL DEFAULT 'extreme'")
            yield db

    def _public(self, row):
        now = self.store.clock()
        return {"id": row["id"], "name": row["name"], "hint": row["hint"],
                "models": json.loads(row["models"]), "created_at": row["created"],
                "expires_at": row["expires"], "last_used_at": row["last_used"],
                "can_reveal": bool(row["encrypted_key"]),
                "vram_policy": row["vram_policy"],
                "state": "revoked" if row["revoked"] else "expired" if row["expires"] and row["expires"] <= now else "active"}

    def create(self, identity, request):
        now = self.store.clock()
        value = "sk-simpai-" + secrets.token_urlsafe(32)
        key_id = "llmkey_" + secrets.token_urlsafe(18)
        expires = now + request.expires_days * 86400 if request.expires_days else None
        with self.transaction() as db:
            count = db.execute("SELECT COUNT(*) FROM inference_keys WHERE owner=? AND revoked=0 AND (expires IS NULL OR expires>?)",
                               (identity["did"], now)).fetchone()[0]
            if count >= 50:
                raise AgentAPIError("inference_key_limit", "Revoke an unused inference key before creating another.", 409)
            has_saved_keys = bool(db.execute("SELECT 1 FROM inference_keys WHERE encrypted_key IS NOT NULL LIMIT 1").fetchone())
            encrypted = self.vault.encrypt(value, key_id, identity["did"], identity["service_id"], create_master=not has_saved_keys)
            db.execute("""INSERT INTO inference_keys
                       (id,key_hash,owner,name,hint,identity,models,created,expires,encrypted_key,vram_policy)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                       (key_id, hashlib.sha256(value.encode()).hexdigest(), identity["did"], request.name.strip(),
                        "sk-simpai-…" + value[-4:], json.dumps(identity), json.dumps(request.models), now, expires, encrypted,
                        request.vram_policy))
            row = db.execute("SELECT * FROM inference_keys WHERE id=?", (key_id,)).fetchone()
        return {"key": self._public(row), "api_key": value}

    def listing(self, owner):
        with self.transaction() as db:
            rows = db.execute("SELECT * FROM inference_keys WHERE owner=? ORDER BY created DESC, id DESC", (owner,)).fetchall()
        return [self._public(row) for row in rows]

    def lookup(self, value=None, key_id=None):
        if value is not None:
            if not KEY_PATTERN.fullmatch(value):
                raise AgentAPIError("invalid_inference_key", "The inference API key is invalid, expired or revoked.", 401)
            column, identifier = "key_hash", hashlib.sha256(value.encode()).hexdigest()
        else:
            if not KEY_ID_PATTERN.fullmatch(str(key_id or "")):
                raise AgentAPIError("invalid_inference_key", "The inference API key is invalid, expired or revoked.", 401)
            column, identifier = "id", key_id
        with self.transaction() as db:
            row = db.execute(f"SELECT * FROM inference_keys WHERE {column}=?", (identifier,)).fetchone()
        if row is None or row["revoked"] or row["expires"] and row["expires"] <= self.store.clock():
            raise AgentAPIError("invalid_inference_key", "The inference API key is invalid, expired or revoked.", 401)
        return dict(row)

    def used(self, key_id):
        now = self.store.clock()
        with self.transaction() as db:
            db.execute("UPDATE inference_keys SET last_used=? WHERE id=? AND (last_used IS NULL OR last_used<?)",
                       (now, key_id, now - 60))

    def revoke(self, key_id, owner):
        with self.transaction() as db:
            if not db.execute("UPDATE inference_keys SET revoked=1 WHERE id=? AND owner=?", (key_id, owner)).rowcount:
                raise AgentAPIError("inference_key_not_found", "This inference key is unavailable to the current identity.", 404)

    def reveal(self, key_id, owner):
        with self.transaction() as db:
            row = db.execute("SELECT * FROM inference_keys WHERE id=? AND owner=?", (key_id, owner)).fetchone()
            if row is None:
                raise AgentAPIError("inference_key_not_found", "This inference key is unavailable to the current identity.", 404)
            return {"key": self._public(row), "api_key": self.vault.decrypt(row)}

    def settings(self, key_id, owner, request):
        with self.transaction() as db:
            row = db.execute("SELECT * FROM inference_keys WHERE id=? AND owner=?", (key_id, owner)).fetchone()
            if row is None:
                raise AgentAPIError("inference_key_not_found", "This inference key is unavailable to the current identity.", 404)
            if row["revoked"] or row["expires"] and row["expires"] <= self.store.clock():
                raise AgentAPIError("inference_key_inactive", "This inference key is expired or revoked. Refresh the key list.", 409)
            db.execute("UPDATE inference_keys SET vram_policy=? WHERE id=? AND owner=?", (request.vram_policy, key_id, owner))
            return {"key": self._public(db.execute("SELECT * FROM inference_keys WHERE id=?", (key_id,)).fetchone())}


def require_transport(manager, request):
    # Local mode already exposes this workspace without authentication, including
    # its explicitly configured LAN listener. A restricted key must work there too.
    if manager.identity.mode() != "local":
        from modules.agent_auth import secure_transport
        secure_transport(request)


def credential_context(manager, row):
    saved = json.loads(row["identity"])
    context, identity = manager.check_identity(saved)
    if not {"read", "vlm.infer"}.issubset(identity["available_scopes"]):
        raise AgentAPIError("vlm_inference_not_allowed", "This identity no longer has local inference permission.", 403)
    lang = saved.get("language") or "en"
    return replace(context, state={**context.state, "__lang": lang}, authorization={
        "kind": "inference_key", "id": row["id"], "client_name": row["name"],
        "scopes": ["read", "vlm.infer"], "models": json.loads(row["models"]),
        "vram_policy": row["vram_policy"],
        "expires_at": row["expires"], "authorization_expires_at": row["expires"],
        "identity": {**identity, "language": lang},
    })


def request_context(manager, request, value):
    require_transport(manager, request)
    store = manager.inference_keys
    context = credential_context(manager, store.lookup(value=value))
    route = getattr(request.scope.get("route"), "path", "")
    if (request.method, route) not in ALLOWED_ROUTES:
        raise AgentAPIError("inference_key_scope", "This key only permits local model listing and Chat Completions.", 403)
    store.used(context.authorization["id"])
    return context


def allowed_models(context):
    authorization = context.authorization or {}
    return authorization.get("models") if authorization.get("kind") == "inference_key" else None
