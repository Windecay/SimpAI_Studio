def resolve_local_workspace_did(token):
    """Resolve a native workspace identity, never a browser placeholder."""
    for method_name in ("get_default_workspace_did", "get_local_did", "get_guest_did"):
        try:
            method = getattr(token, method_name, None)
            did = str(method() or "").strip() if callable(method) else ""
        except Exception:
            continue
        if did and did.lower() not in {"guest", "local", "unknown", "invalid_did"}:
            return did
    raise ValueError("Local workspace identity is unavailable.")


def normalize_payload_identity(payload, user_did, *, access_mode="multi", user_role=""):
    """Apply the server-resolved identity to a Canvas request payload."""
    if not isinstance(payload, dict):
        return payload
    normalized = dict(payload)
    mode = "local" if str(access_mode or "").strip().lower() == "local" else "multi"

    context = payload.get("user_context") if isinstance(payload.get("user_context"), dict) else {}
    context = dict(context)
    effective_user_did = str(user_did or "guest").strip() or "guest"
    context.update({
        "user_did": effective_user_did,
        "owner": effective_user_did,
        "scope": mode,
        "role": str(user_role or mode).strip() or mode,
    })
    normalized["user_context"] = context
    return normalized
