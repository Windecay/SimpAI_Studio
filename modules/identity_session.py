"""Browser credential renewal without replacing rejected credentials with guests."""

from __future__ import annotations

import json
import time

COOKIE_DAYS = 90
CHECK_INTERVAL = 300


def resolve_session(token, session, ua_hash):
    rejected = {"status": "unavailable", "did": "", "sstoken": "", "expires_in": 0}
    if not session:
        return dict(rejected, status="missing")
    if token is None:
        return rejected
    try:
        if hasattr(token, "resolve_sstoken"):
            result = json.loads(token.resolve_sstoken(session, ua_hash))
            if not isinstance(result, dict):
                return rejected
            if result.get("status") != "valid":
                status = result.get("status")
                return dict(rejected, status=status if isinstance(status, str) else "unavailable")
            did = str(result.get("did") or "").strip()
            credential = str(result.get("sstoken") or "").strip()
            expires_in = int(result.get("expires_in") or 0)
            if not did or did == "Unknown" or not credential or credential == "Unknown" or expires_in <= 0:
                return rejected
            return {
                "status": "valid",
                "did": did,
                "sstoken": credential,
                "expires_in": min(expires_in, COOKIE_DAYS * 86400),
            }
        did = str(token.check_sstoken_and_get_did(session, ua_hash) or "").strip()
        if did and did != "Unknown":
            return {"status": "valid", "did": did, "sstoken": session, "expires_in": COOKIE_DAYS * 86400}
        return dict(rejected, status="invalid_legacy")
    except Exception:
        return rejected


def update_identity_session(state, token, *, force=False, now=None):
    now = time.time() if now is None else now
    last_check = state.get("__identity_last_check")
    if (
        not force and last_check is not None and now - last_check < CHECK_INTERVAL
        and now < state.get("__identity_expires_at", float("inf"))
    ):
        return state.get("__identity_status", "")
    credential = str(state.get("__identity_original_session") or state.get("__session") or "")
    result = resolve_session(token, credential, state.get("ua_hash", ""))
    state["__identity_last_check"] = now
    if result["status"] == "valid":
        try:
            context = token.get_user_context(result["did"])
            if context.get_did() != result["did"]:
                result["status"] = "unavailable"
            else:
                previous_did = state.get("user").get_did() if state.get("user") is not None else ""
                if credential != result["sstoken"] or previous_did != result["did"]:
                    state["__identity_session_seq"] = int(state.get("__identity_session_seq", 0) or 0) + 1
                state["user"] = context
                state["__session"] = result["sstoken"]
                state["sstoken"] = result["sstoken"]
                state["__identity_expires_at"] = now + result["expires_in"]
                state.pop("__identity_original_session", None)
                state["__identity_status"] = "valid"
                return "valid"
        except Exception:
            result["status"] = "unavailable"

    state["user"] = None
    state["sstoken"] = ""
    state["__session"] = ""
    try:
        guest_session = token.get_guest_sstoken(state.get("ua_hash", "")) if token is not None else ""
        guest_did = token.get_guest_did() if token is not None else ""
        state["user"] = token.get_user_context(guest_did) if token is not None else None
    except Exception:
        guest_session = ""
    if credential:
        state["__identity_original_session"] = credential
        state["sstoken"] = ""
        state["__identity_session_seq"] = int(state.get("__identity_session_seq", 0) or 0) + 1
    else:
        state["sstoken"] = guest_session
    state["__session"] = guest_session
    state["__identity_expires_at"] = now + COOKIE_DAYS * 86400
    state["__identity_status"] = result["status"]
    return result["status"]


def session_cookie_days(state, *, now=None):
    now = time.time() if now is None else now
    expiry = state.get("__identity_expires_at")
    if expiry is None:
        return COOKIE_DAYS
    return max(0, min(COOKIE_DAYS, (float(expiry) - now) / 86400))
