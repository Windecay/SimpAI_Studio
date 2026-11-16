"""Normalize chat speech actions without treating spoken words as image prompts."""

import copy

from pydantic import ValidationError

from modules.agent_tts_contract import TTSPreview


def normalize_audio_action(item, media_manifest):
    raw = copy.deepcopy(item.get("tts")) if isinstance(item.get("tts"), dict) else {}
    if not raw:
        return None
    # The chat model selects attachment refs. Only the browser/server may bind
    # these refs to actual owned asset IDs, just before preview/submission.
    if "ref_audio_asset_id" in raw:
        return None
    bindings = []
    ref = raw.pop("ref_audio_ref", "")
    if ref:
        bindings.append({"field": "ref_audio_asset_id", "ref": str(ref)})
    for index, role in enumerate(raw.get("roles") or []):
        if not isinstance(role, dict) or "audio_asset_id" in role:
            return None
        audio_ref = role.pop("audio_ref", "")
        bindings.append({"field": f"roles.{index}.audio_asset_id", "ref": str(audio_ref)})
        role["audio_asset_id"] = "asset:" + "0" * 24
    try:
        request = TTSPreview.model_validate(raw).model_dump()
    except ValidationError:
        return None
    spoken = request["script"] if request["mode"] == "dialogue" else request["text"]
    if not spoken.strip():
        return None
    available = {str(row.get("ref") or "") for row in media_manifest or []
                 if isinstance(row, dict) and row.get("type") == "audio"}
    missing = [row["ref"] for row in bindings if row["ref"] not in available]
    return {"type": "generate_audio", "target": "qwen_tts", "prompt": spoken,
            "tts_request": request, "audio_bindings": bindings,
            "media_refs": [row["ref"] for row in bindings],
            "generation": {"state": "needs_media" if missing else "awaiting_confirmation", "assets": []}}
