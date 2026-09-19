"""Character-owned voice design using the existing Qwen TTS worker."""

import copy
import threading
import uuid

from modules import visual_character_library as library


LANGUAGES = ("Auto", "Chinese", "English", "Japanese", "Korean")
_START_LOCK = threading.Lock()


def normalize_voice(value):
    value = value if isinstance(value, dict) else {}
    language = str(value.get("language") or "Auto")
    if language not in LANGUAGES:
        raise ValueError("invalid_voice_language")
    seed = value.get("seed", 0)
    try:
        if isinstance(seed, bool) or float(seed) != int(seed):
            raise ValueError("invalid_voice_seed")
        seed = int(seed)
    except (ValueError, TypeError, OverflowError):
        raise ValueError("invalid_voice_seed") from None
    if not 0 <= seed <= 2147483647:
        raise ValueError("invalid_voice_seed")
    return {
        "instruction": str(value.get("instruction") or "").strip()[:4000],
        "sample_text": str(value.get("sample_text") or "").strip()[:1000],
        "language": language,
        "seed": seed,
    }


def style_context(character):
    if not isinstance(character, dict) or not str(character.get("name") or "").strip():
        raise ValueError("character_name_required")
    fields = [
        ("Character", character.get("name"), 200),
        ("Appearance", character.get("appearance"), 12000),
        ("Personality", character.get("personality"), 4000),
        ("Voice description", character.get("voice_description"), 4000),
    ]
    context = "\n".join(f"{label}: {str(value).strip()[:limit]}" for label, value, limit in fields if value)
    return (
        "Design a coherent speaking voice for this fictional character. Describe timbre, pitch, "
        "resonance, pace, articulation and emotional delivery. Prefer explicit voice traits over "
        "visual cues. Output only a voice-style instruction, no dialogue, sound effects or music.\n"
        + context
    )


def expand_style(character, expand=None):
    context = style_context(character)
    if expand is None:
        from enhanced.vlm import VLM, vlm
        from modules import async_worker

        if not VLM.get_enable() or not vlm.model_exists():
            raise ValueError("voice_style_model_unavailable")
        try:
            with async_worker.external_exclusive_task():
                result = vlm.expand_tts_style_instruction(context)
        except Exception as error:
            raise ValueError("voice_style_failed") from error
    else:
        result = expand(context)
    instruction = str(result or "").strip()[:4000]
    if not instruction:
        raise ValueError("voice_style_empty")
    return {"ok": True, "instruction": instruction}


def _service():
    from modules import canvas_workbench_qwen_tts
    return canvas_workbench_qwen_tts


def start_voice(payload, user_did, root=None, service=None):
    service = service or _service()
    card = library.load_character(payload.get("character_id"), user_did, root)
    if not card:
        raise ValueError("character_not_found")
    if payload.get("revision") != card["revision"]:
        raise ValueError("character_revision_conflict")
    voice = normalize_voice(card.get("voice"))
    if not voice["instruction"] or not voice["sample_text"]:
        raise ValueError("voice_design_fields_required")
    if sum(ref.get("mime", "").startswith("audio/") for ref in card["media"]) >= 3:
        raise ValueError("too_many_audios")
    # Never accept caller-provided paths, owner identities, node IDs or worker parameters.
    state = {"user_did": user_did, "__user_did": user_did}
    request = {
        "run_id": f"character-voice-{uuid.uuid4().hex}",
        "project_id": "character_library", "qwen_tts_node_id": card["id"],
        "user_context": {"user_did": user_did}, "mode": "voice_design",
        "params": {
            "text": voice["sample_text"], "instruct": voice["instruction"],
            "language": voice["language"], "seed": voice["seed"], "seed_random": False,
            "model_choice": "1.7B", "device": "auto", "precision": "bf16", "attention": "auto",
            "unload_model_after_generate": True, "lock_timbre_with_first_segment": True,
        },
    }
    with _START_LOCK:
        with service.QWEN_TTS_RUNS_LOCK:
            active = next((record for record in service.QWEN_TTS_RUNS.values()
                           if record.get("user_did") == user_did
                           and record.get("character_voice", {}).get("character_id") == card["id"]
                           and record.get("state") in {"queued", "running", "cancelling"}), None)
            if active:
                return {"ok": True, "run_id": active["run_id"], "state": active["state"]}
        result = service.run_qwen_tts(request, state)
        if not result.get("ok"):
            return result
        with service.QWEN_TTS_RUNS_LOCK:
            record = service.QWEN_TTS_RUNS.get(request["run_id"])
            if not record:
                raise ValueError("voice_run_not_found")
            record["character_voice"] = {
                "character_id": card["id"], "character_revision": card["revision"],
                "character_name": card["name"], "voice": voice,
            }
    return {"ok": True, "run_id": request["run_id"], "state": result.get("state", "queued")}


def voice_status(payload, user_did, root=None, service=None, stop=False):
    service = service or _service()
    run_id = str(payload.get("run_id") or "")
    with service.QWEN_TTS_RUNS_LOCK:
        record = service.QWEN_TTS_RUNS.get(run_id)
        if (not record or record.get("user_did") != user_did
                or record.get("project_id") != "character_library" or not record.get("character_voice")):
            raise ValueError("voice_run_not_found")
        metadata = copy.deepcopy(record["character_voice"])
    state = {"user_did": user_did, "__user_did": user_did}
    result = (service.control_qwen_tts({"run_id": run_id, "action": "stop"}, state) if stop
              else service.poll_qwen_tts({"run_id": run_id}, state))
    status = result.get("state")
    response = {
        "ok": True, "run_id": run_id, "state": status,
        "percent": result.get("percent", 0), "character_id": metadata["character_id"],
    }
    if status == "failed":
        response.update(error="voice_generation_failed", details=result.get("details") or result.get("error") or "")
    elif not result.get("ok"):
        raise ValueError("voice_run_not_found")
    if status == "finished":
        asset = copy.deepcopy(result.get("asset"))
        if not isinstance(asset, dict) or not str(asset.get("mime") or "").startswith("audio/"):
            raise ValueError("voice_result_missing")
        asset.update({
            "name": f'{metadata["character_name"]} - QwenTTS.wav',
            "transcript": metadata["voice"]["sample_text"],
            "voice_instruction": metadata["voice"]["instruction"],
            "voice_seed": result.get("resolved_seed", metadata["voice"]["seed"]),
            "voice_character_id": metadata["character_id"],
            "voice_character_revision": metadata["character_revision"],
        })
        response["asset"] = library.register_media(asset, user_did, root)
    return response
