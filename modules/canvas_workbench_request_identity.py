def normalize_payload_identity(payload, user_did, *, access_mode="multi", user_role=""):
    """Apply the server-resolved identity to a Canvas request payload."""
    if not isinstance(payload, dict):
        return payload
    normalized = dict(payload)
    if str(access_mode or "").strip().lower() == "local":
        return normalized

    context = payload.get("user_context") if isinstance(payload.get("user_context"), dict) else {}
    context = dict(context)
    effective_user_did = str(user_did or "guest").strip() or "guest"
    context.update({
        "user_did": effective_user_did,
        "owner": effective_user_did,
        "scope": "multi",
        "role": str(user_role or "multi").strip() or "multi",
    })
    normalized["user_context"] = context
    return normalized
