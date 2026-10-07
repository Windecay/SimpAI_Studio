"""Browser-only sign-in using the existing Studio identity and session backend."""

import base64
import hashlib
import io
import secrets
import threading
import time

from pydantic import Field, SecretStr

from modules.agent_api_contract import RequestModel
from modules.agent_auth import _code
from modules.agent_service import AgentAPIError
from modules.identity_session import resolve_session


LOGIN_COOKIE = "simpai_agent_login"
MAX_QR_BYTES = 4 * 1024 * 1024


class LoginChallenge(RequestModel):
    user_code: str = Field(min_length=8, max_length=9)
    csrf_token: str = Field(min_length=40, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")


class IdentityLoginRequest(LoginChallenge):
    nickname: str = Field(min_length=1, max_length=128)
    telephone: str = Field(default="", max_length=40)
    did: str = Field(default="", max_length=256)
    passphrase: SecretStr = Field(min_length=1, max_length=256)


class IdentityImageRequest(LoginChallenge):
    data_url: str = Field(max_length=(MAX_QR_BYTES * 4 // 3) + 128, repr=False)


def _ua_hash(request):
    return hashlib.sha256(str(request.headers.get("user-agent") or "").encode("utf-8")).hexdigest()


def _read_identity_image(data_url):
    try:
        from PIL import Image
        import cv2
        import numpy as np
        from simpleai_base.simpleai_base import import_identity_qrcode

        header, encoded = data_url.split(",", 1)
        if header not in {"data:image/png;base64", "data:image/jpeg;base64",
                          "data:image/webp;base64", "data:image/bmp;base64"}:
            raise ValueError()
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > MAX_QR_BYTES:
            raise ValueError()
        with Image.open(io.BytesIO(raw)) as image:
            if image.width * image.height > 16_000_000:
                raise ValueError()
            pixels = np.asarray(image.convert("RGB"))
        text, _, _ = cv2.QRCodeDetector().detectAndDecode(pixels)
        if not text:
            try:
                from pyzbar.pyzbar import decode
                text = next((item.data.decode("utf-8") for item in decode(pixels)), "")
            except (ImportError, OSError):
                pass
        did, nickname, telephone = import_identity_qrcode(text) if text else ("", "", "")
        if not did or not nickname or len(did) > 256 or len(nickname) > 128 or len(telephone) > 40:
            raise ValueError()
        return {"did": did, "nickname": nickname, "telephone": telephone}
    except Exception:
        raise AgentAPIError("invalid_identity_image", "The identity QR image could not be read.", 400) from None


class BrowserIdentityLogin:
    def __init__(self, authorization, clock=time.monotonic):
        self.authorization = authorization
        self.clock = clock
        self._lock = threading.RLock()
        self._challenges = {}

    def _pairing(self, user_code):
        original, _ = self.authorization.store.view(user_code)
        if (original["service_id"] != self.authorization.identity.service_id()
                or original["expected_mode"] != self.authorization.identity.mode()
                or original["expected_mode"] != "multi-user"):
            raise AgentAPIError("identity_context_changed", "The service or access mode changed. Pair again.", 409)
        return original

    def issue(self, request, user_code):
        original = self._pairing(user_code)
        nonce = secrets.token_urlsafe(32)
        with self._lock:
            self._challenges = {key: row for key, row in self._challenges.items()
                                if row["expires"] > self.clock() or row["busy"]}
            if len(self._challenges) >= 500:
                raise AgentAPIError("rate_limited", "Too many sign-in pages are open.", 429)
            self._challenges[hashlib.sha256(nonce.encode()).digest()] = {
                "code": _code(user_code), "ua": _ua_hash(request), "expires": self.clock() + 600,
                "service_id": original["service_id"], "mode": original["expected_mode"], "busy": False,
            }
        return nonce

    def validate(self, request, payload, *, reserve=False):
        cookie = request.cookies.get(LOGIN_COOKIE, "")
        if not cookie or not secrets.compare_digest(cookie.encode("utf-8"), payload.csrf_token.encode("utf-8")):
            raise AgentAPIError("invalid_csrf_token", "Reopen the sign-in page.", 403)
        key = hashlib.sha256(cookie.encode()).digest()
        with self._lock:
            row = self._challenges.get(key)
            if (row is None or row["expires"] <= self.clock() or row["code"] != _code(payload.user_code)
                    or row["ua"] != _ua_hash(request)):
                raise AgentAPIError("invalid_csrf_token", "Reopen the sign-in page.", 403)
            if row["busy"]:
                raise AgentAPIError("login_in_progress", "A sign-in request is already in progress.", 409)
            original = self._pairing(payload.user_code)
            if row["service_id"] != original["service_id"] or row["mode"] != original["expected_mode"]:
                raise AgentAPIError("identity_context_changed", "The service changed. Pair again.", 409)
            if reserve:
                row["busy"] = True
        return key, original

    def read_image(self, request, payload):
        self.validate(request, payload)
        return _read_identity_image(payload.data_url)

    def sign_in(self, request, payload):
        import shared

        key, original = self.validate(request, payload, reserve=True)
        succeeded = False
        session = None
        try:
            token = getattr(shared, "token", None)
            if token is None:
                raise AgentAPIError("identity_unavailable", "The identity backend is unavailable.", 503)
            nickname = payload.nickname.strip()
            telephone = payload.telephone.strip()
            did_hint = payload.did.strip()
            if not nickname:
                raise AgentAPIError("invalid_identity_login", "The identity or passphrase is incorrect.", 401)
            context = token.get_user_context_with_phrase(
                nickname, telephone, did_hint, payload.passphrase.get_secret_value())
            did = str(context.get_did() or "")
            if not did or token.is_guest(did) or (did_hint and did_hint != did):
                raise AgentAPIError("invalid_identity_login", "The identity or passphrase is incorrect.", 401)
            if original["expected_did"] and original["expected_did"] != did:
                raise AgentAPIError("identity_mismatch", "This identity does not match the pairing request.", 409)
            identity = self.authorization.identity.describe(self.authorization.identity.subject(did))
            if identity["access_status"] != "allowed":
                raise AgentAPIError("account_not_allowed", "This identity has not been approved or is disabled.", 403)
            original = self._pairing(payload.user_code)
            if original["expected_did"] and original["expected_did"] != did:
                raise AgentAPIError("identity_mismatch", "This identity does not match the pairing request.", 409)
            session = token.get_user_sstoken(did, _ua_hash(request))
            resolved = resolve_session(token, session, _ua_hash(request))
            if resolved["status"] != "valid" or resolved["did"] != did:
                raise AgentAPIError("identity_unavailable", "A browser session could not be created.", 503)
            self._pairing(payload.user_code)
            current = self.authorization.identity.describe(self.authorization.identity.subject(did))
            if identity["binding_id"] != current["binding_id"] or current["access_status"] != "allowed":
                raise AgentAPIError("identity_context_changed", "The identity or storage scope changed. Pair again.", 409)
            succeeded = True
            return resolved["sstoken"], resolved["expires_in"]
        except AgentAPIError:
            raise
        except Exception:
            raise AgentAPIError("identity_unavailable", "The identity backend is unavailable.", 503) from None
        finally:
            if not succeeded and session:
                try:
                    token.revoke_sstoken(session)
                except Exception:
                    pass
            with self._lock:
                if succeeded:
                    self._challenges.pop(key, None)
                elif key in self._challenges:
                    self._challenges[key]["busy"] = False
