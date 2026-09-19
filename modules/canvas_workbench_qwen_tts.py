import copy
import json
import os
import random
import subprocess
import tempfile
import threading
import time
import wave

import modules.canvas_workbench_assets as canvas_workbench_assets
import shared

try:
    import numpy as np
except Exception:
    np = None


QWEN_TTS_RUNS = {}
QWEN_TTS_RUNS_LOCK = threading.Lock()
QWEN_TTS_WORKER_LOCK = threading.Lock()
QWEN_TTS_RETENTION_SECONDS = 60 * 60 * 6
QWEN_TTS_TERMINAL_STATES = ("finished", "failed", "canceled")

QWEN_SPEAKER_DISPLAY_TO_KEY = {
    "艾登 Aiden": "Aiden",
    "晓东 Dylan": "Dylan",
    "程川 Eric": "Eric",
    "小野杏 Ono Anna": "Ono_anna",
    "甜茶 Ryan": "Ryan",
    "苏瑶 Serena": "Serena",
    "素熙 Sohee": "Sohee",
    "福伯 Uncle Fu": "Uncle_fu",
    "十三 Vivian": "Vivian",
}

QWEN_TTS_STYLE_PRESETS = {
    "Catgirl (Neko)": "Cute catgirl voice: high-pitched, bright and sweet, youthful and playful. Add occasional short interjections like 'nya', 'meow', 'na', 'ne', 'ya' (not every sentence). Expressive with subtle emotional shifts: shy -> softer, breathy, slightly shaky; tsundere -> quick pitch rise and a small 'hmph'; teary -> light sob or choked tone. Optionally add close-mic ASMR details (soft breathing, whispery delivery) while keeping articulation clear.",
    "Warm Female": "Female, mid-20s, warm and friendly, medium pace, clear articulation, slight smile in voice, natural breath and gentle intonation.",
    "News Anchor": "Male, 30s, calm professional news anchor, steady rhythm, neutral emotion, crisp consonants, confident delivery, minimal pitch fluctuation.",
    "Energetic Teen": "Young energetic teen, bright tone, fast pace, playful rising intonation, light laughter between phrases, vivid emphasis on keywords.",
    "Elderly Hoarse": "Elderly male, ~70, slightly hoarse and breathy, slow pace, reflective mood, soft volume, longer pauses, subtle trembling on sustained vowels.",
    "Audiobook Narrator": "Audiobook narrator, 40s, cinematic and immersive, controlled dynamics, clear phrasing, dramatic pauses, rich low-mid register, smooth resonance.",
}


def _iso_from_ts(value):
    try:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(float(value)))
    except Exception:
        return ""


def _now_iso():
    return _iso_from_ts(time.time())


def _bool_value(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "on"):
        return True
    if text in ("0", "false", "no", "off"):
        return False
    return default


def _int_value(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return int(default)


def _float_value(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return float(default)


def _text_value(value, default=""):
    if value is None:
        return default
    return str(value)


def _blank(value):
    return not str(value or "").strip()


def _state_identity(payload, state_params):
    user_context = payload.get("user_context") if isinstance(payload.get("user_context"), dict) else {}
    user_did = user_context.get("user_did") or user_context.get("owner") or ""
    if isinstance(state_params, dict):
        user_did = user_did or state_params.get("user_did") or ""
        try:
            user = state_params.get("user")
            if not user_did and user is not None and hasattr(user, "get_did"):
                user_did = user.get_did()
        except Exception:
            pass
    return {"user_did": str(user_did or "guest")}


def _character_presets_dir(user_did):
    did = str(user_did or "guest").strip() or "guest"
    try:
        if shared.token is not None and hasattr(shared.token, "get_path_in_user_dir"):
            base = shared.token.get_path_in_user_dir(did, "presets")
        else:
            base = os.path.join(shared.path_userhome or "users", did, "presets")
    except Exception:
        base = os.path.join(shared.path_userhome or "users", did, "presets")
    return os.path.abspath(os.path.join(base, "characters"))


def _load_user_character_presets(user_did):
    presets = {}
    preset_dir = _character_presets_dir(user_did)
    if not preset_dir or not os.path.isdir(preset_dir):
        return presets
    try:
        for file_name in os.listdir(preset_dir):
            if not file_name.lower().endswith(".json"):
                continue
            full_path = os.path.join(preset_dir, file_name)
            if not os.path.isfile(full_path):
                continue
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    payload = json.load(f)
            except Exception:
                continue
            key = os.path.splitext(file_name)[0]
            text = ""
            if isinstance(payload, dict):
                key = payload.get("name", key)
                text = payload.get("instruction", "")
            elif isinstance(payload, str):
                text = payload
            key = "" if key is None else str(key).strip()
            text = "" if text is None else str(text).strip()
            if key and text:
                presets[key] = text
    except Exception:
        pass
    return presets


def list_qwen_tts_presets(payload, state_params):
    payload = payload if isinstance(payload, dict) else {}
    identity = _state_identity(payload, state_params)
    user_did = identity.get("user_did") or "guest"
    entries = [
        {"name": name, "instruction": instruction, "source": "builtin"}
        for name, instruction in QWEN_TTS_STYLE_PRESETS.items()
    ]
    builtins = set(QWEN_TTS_STYLE_PRESETS.keys())
    user_presets = _load_user_character_presets(user_did)
    for name in sorted(user_presets.keys()):
        if name in builtins:
            continue
        entries.append({
            "name": name,
            "instruction": user_presets[name],
            "source": "user",
        })
    return {
        "ok": True,
        "user_did": user_did,
        "presets": entries,
        "count": len(entries),
    }


def _cleanup_runs():
    now = time.time()
    with QWEN_TTS_RUNS_LOCK:
        stale = [
            run_id for run_id, record in QWEN_TTS_RUNS.items()
            if now - float(record.get("updated_ts") or record.get("created_ts") or now) > QWEN_TTS_RETENTION_SECONDS
        ]
        for run_id in stale:
            QWEN_TTS_RUNS.pop(run_id, None)


def _add_event(record, level, message, data=None):
    if not isinstance(record, dict):
        return
    events = record.setdefault("events", [])
    item = {
        "ts": _now_iso(),
        "level": str(level or "info"),
        "message": str(message or ""),
    }
    if data is not None:
        item["data"] = data
    events.append(item)
    if len(events) > 80:
        del events[:-80]


def _set_interrupt(value):
    try:
        import ldm_patched.modules.model_management as model_management
        model_management.interrupt_current_processing(bool(value))
    except Exception:
        pass
    try:
        from comfy import model_management as comfy_model_management
        comfy_model_management.interrupt_current_processing(bool(value))
    except Exception:
        pass


def _is_interrupt_exception(err):
    if type(err).__name__ == "InterruptProcessingException":
        return True
    try:
        import ldm_patched.modules.model_management as model_management
        if isinstance(err, model_management.InterruptProcessingException):
            return True
    except Exception:
        pass
    try:
        from comfy import model_management as comfy_model_management
        if isinstance(err, comfy_model_management.InterruptProcessingException):
            return True
    except Exception:
        pass
    return False


def _unload_qwen_tts_models_safe():
    try:
        from enhanced import webui_qwen_tts
        webui_qwen_tts.unload_qwen_tts_models()
    except BaseException:
        pass


def _get_ffmpeg_exe():
    try:
        return canvas_workbench_assets._get_ffmpeg_exe()
    except Exception:
        return None


def _read_wav_file(audio_path):
    if np is None:
        raise RuntimeError("numpy is not available for Qwen TTS reference audio")
    p = os.path.abspath(str(audio_path or ""))
    if not p or not os.path.isfile(p):
        raise FileNotFoundError(p or "missing audio file")
    with wave.open(p, "rb") as wf:
        sr = int(wf.getframerate())
        channels = int(wf.getnchannels())
        sample_width = int(wf.getsampwidth())
        frames = wf.readframes(int(wf.getnframes()))
    if sample_width == 2:
        data = np.frombuffer(frames, dtype=np.int16)
    elif sample_width == 4:
        data32 = np.frombuffer(frames, dtype=np.int32)
        data = (data32 / 65536.0).astype(np.int16)
    else:
        raise ValueError(f"Unsupported WAV sample width: {sample_width}")
    if channels > 1:
        data = data.reshape(-1, channels)
    return sr, data


def _convert_audio_to_wav(audio_path):
    p = os.path.abspath(str(audio_path or ""))
    if not p or not os.path.isfile(p):
        raise FileNotFoundError(p or "missing audio file")
    if os.path.splitext(p)[1].lower() == ".wav":
        return p
    ffmpeg = _get_ffmpeg_exe()
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to convert non-WAV reference audio for Qwen TTS")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp_path = tmp.name
    tmp.close()
    cmd = [ffmpeg, "-y", "-i", p, "-vn", "-acodec", "pcm_s16le", "-ar", "24000", tmp_path]
    completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=240)
    if completed.returncode != 0 or not os.path.exists(tmp_path) or os.path.getsize(tmp_path) <= 0:
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        raise RuntimeError((completed.stderr or completed.stdout or "audio conversion failed")[-1000:])
    return tmp_path


def _audio_ref_to_gradio_tuple(asset_ref):
    if not isinstance(asset_ref, dict):
        raise ValueError("Missing reference audio")
    audio_path = asset_ref.get("path") or asset_ref.get("output_path")
    wav_path = _convert_audio_to_wav(audio_path)
    return _read_wav_file(wav_path)


def _materialize_input_assets(payload, state_params):
    input_assets = payload.get("input_assets") if isinstance(payload.get("input_assets"), dict) else {}
    project_id = payload.get("project_id") or "default"
    materialized = {}
    errors = []
    for slot, source in input_assets.items():
        if not source:
            continue
        result = canvas_workbench_assets.materialize_node_asset(project_id, state_params, source)
        if result.get("ok"):
            materialized[str(slot)] = result.get("asset_ref")
        else:
            errors.append({
                "slot": str(slot),
                "error": result.get("error") or "input materialization failed",
            })
    return materialized, errors


def _resolve_seed(params):
    seed_random = _bool_value(params.get("seed_random"), True)
    if seed_random:
        return random.randint(0, 2147483647)
    return max(0, _int_value(params.get("seed"), 0))


def _common_kwargs(params, user_did):
    return {
        "model_choice": _text_value(params.get("model_choice") or params.get("model_size"), "1.7B"),
        "user_did": user_did,
        "device": _text_value(params.get("device"), "auto"),
        "precision": _text_value(params.get("precision"), "bf16"),
        "language": _text_value(params.get("language"), "Auto"),
        "seed": _resolve_seed(params),
        "max_new_tokens": _int_value(params.get("max_new_tokens"), 4096),
        "top_p": _float_value(params.get("top_p"), 0.8),
        "top_k": _int_value(params.get("top_k"), 20),
        "temperature": _float_value(params.get("temperature"), 1.0),
        "repetition_penalty": _float_value(params.get("repetition_penalty"), 1.05),
        "attention": _text_value(params.get("attention"), "auto"),
        "unload_model_after_generate": _bool_value(params.get("unload_model_after_generate"), True),
        "decode_batch_size": _int_value(params.get("decode_batch_size"), 2),
        "max_chars": _int_value(params.get("split_max_chars") or params.get("max_chars"), 200),
        "hard_max_chars": _int_value(params.get("split_hard_max_chars") or params.get("hard_max_chars"), 260),
    }


def _speaker_key(value):
    text = str(value or "").strip()
    if text in QWEN_SPEAKER_DISPLAY_TO_KEY:
        return QWEN_SPEAKER_DISPLAY_TO_KEY[text]
    if " " in text:
        last = text.split()[-1].strip()
        if last:
            return last
    return text


def _build_handler_call(mode, params, materialized, user_did):
    from enhanced import webui_qwen_tts

    common = _common_kwargs(params, user_did)
    if mode == "voice_design":
        text = _text_value(params.get("text"), "").strip()
        if not text:
            raise ValueError("Text to Speech is required")
        kwargs = dict(common)
        kwargs.update({
            "text": text,
            "instruct": _text_value(params.get("instruct"), ""),
            "lock_timbre_with_first_segment": _bool_value(params.get("lock_timbre_with_first_segment"), True),
            "clone_batch_size": _int_value(params.get("clone_batch_size") or params.get("batch_size"), 16),
        })
        return webui_qwen_tts.qwen_tts_handler.voice_design, kwargs

    if mode == "voice_clone":
        target_text = _text_value(params.get("target_text"), "").strip()
        if not target_text:
            raise ValueError("Target Text to Speech is required")
        if "ref_audio" not in materialized:
            raise ValueError("Reference audio is required")
        kwargs = dict(common)
        kwargs.update({
            "ref_audio": _audio_ref_to_gradio_tuple(materialized.get("ref_audio")),
            "ref_text": _text_value(params.get("ref_text"), ""),
            "target_text": target_text,
            "x_vector_only": _bool_value(params.get("x_vector_only"), False),
            "custom_model_path": _text_value(params.get("custom_model_path"), ""),
            "batch_size": _int_value(params.get("batch_size"), 16),
        })
        return webui_qwen_tts.qwen_tts_handler.voice_clone, kwargs

    if mode == "custom_voice":
        text = _text_value(params.get("text"), "").strip()
        if not text:
            raise ValueError("Text to Speech is required")
        custom_speaker = _text_value(params.get("custom_speaker_name"), "").strip()
        speaker = custom_speaker or _speaker_key(params.get("speaker") or "Ryan")
        if not speaker:
            raise ValueError("Speaker is required")
        kwargs = dict(common)
        kwargs.update({
            "text": text,
            "speaker": speaker,
            "instruct": _text_value(params.get("instruct"), ""),
            "custom_model_path": _text_value(params.get("custom_model_path"), ""),
            "custom_speaker_name": custom_speaker,
            "batch_size": _int_value(params.get("batch_size"), 16),
        })
        return webui_qwen_tts.qwen_tts_handler.custom_voice, kwargs

    if mode == "dialogue":
        script = _text_value(params.get("script"), "").strip()
        if not script:
            raise ValueError("Script is required")
        kwargs = dict(common)
        kwargs.pop("max_new_tokens", None)
        kwargs.pop("max_chars", None)
        kwargs.pop("hard_max_chars", None)
        kwargs.update({
            "script": script,
            "pause_linebreak": _float_value(params.get("pause_linebreak"), 0.5),
            "period_pause": _float_value(params.get("period_pause"), 0.4),
            "comma_pause": _float_value(params.get("comma_pause"), 0.2),
            "question_pause": _float_value(params.get("question_pause"), 0.6),
            "hyphen_pause": _float_value(params.get("hyphen_pause"), 0.3),
            "merge_outputs": _bool_value(params.get("merge_outputs"), True),
            "batch_size": _int_value(params.get("batch_size"), 4),
            "max_new_tokens_per_line": _int_value(params.get("max_new_tokens_per_line"), 4096),
        })
        for index in range(1, 5):
            slot = f"role_{index}_audio"
            kwargs[f"role_{index}_name"] = _text_value(params.get(f"role_{index}_name"), "")
            kwargs[f"role_{index}_audio"] = _audio_ref_to_gradio_tuple(materialized[slot]) if slot in materialized else None
            kwargs[f"role_{index}_ref_text"] = _text_value(params.get(f"role_{index}_ref_text"), "")
        return webui_qwen_tts.qwen_tts_handler.dialogue, kwargs

    raise ValueError(f"Unsupported Qwen TTS mode: {mode}")


def _public_record(record):
    state = str(record.get("state") or "")
    ok = state != "failed"
    result = {
        "ok": ok,
        "backend": "qwen_tts",
        "run_id": record.get("run_id"),
        "job_id": record.get("run_id"),
        "task_id": record.get("task_id"),
        "placeholder_node_id": record.get("placeholder_node_id"),
        "qwen_tts_node_id": record.get("qwen_tts_node_id"),
        "state": state,
        "percent": float(record.get("percent") or 0),
        "message": record.get("message") or "",
        "asset": record.get("asset"),
        "assets": record.get("assets") or [],
        "output_count": len(record.get("assets") or []),
        "input_count": record.get("input_count") or 0,
        "mode": record.get("mode") or "",
        "resolved_seed": record.get("resolved_seed"),
        "events": record.get("events") or [],
        "created_at": _iso_from_ts(record.get("created_ts")),
        "updated_at": _iso_from_ts(record.get("updated_ts")),
        "finished_at": _iso_from_ts(record.get("finished_ts")),
    }
    if record.get("error"):
        result["error"] = record.get("error")
        result["details"] = record.get("details") or ""
    if record.get("cancel_action"):
        result["user_cancel_action"] = record.get("cancel_action")
    return result


def _run_worker(run_id):
    with QWEN_TTS_WORKER_LOCK:
        _run_worker_locked(run_id)


def _run_worker_locked(run_id):
    with QWEN_TTS_RUNS_LOCK:
        record = QWEN_TTS_RUNS.get(run_id)
    if not record:
        return
    with QWEN_TTS_RUNS_LOCK:
        record = QWEN_TTS_RUNS.get(run_id)
        if not record:
            return
        if record.get("cancel_action") == "stop":
            record["state"] = "canceled"
            record["percent"] = max(float(record.get("percent") or 0), 0.01)
            record["message"] = "Stopped by user."
            record["finished_ts"] = time.time()
            record["updated_ts"] = time.time()
            _add_event(record, "warn", record["message"])
            _set_interrupt(False)
            return
    cleanup_after_worker = False
    try:
        from enhanced import webui_qwen_tts

        _set_interrupt(False)
        with QWEN_TTS_RUNS_LOCK:
            record = QWEN_TTS_RUNS.get(run_id)
            if not record:
                return
            record["state"] = "running"
            record["percent"] = max(float(record.get("percent") or 0), 0.04)
            record["message"] = "Qwen TTS running."
            record["updated_ts"] = time.time()
            _add_event(record, "info", record["message"])

        def progress_callback(percent, message=""):
            with QWEN_TTS_RUNS_LOCK:
                current = QWEN_TTS_RUNS.get(run_id)
                if not current:
                    return
                try:
                    pct = max(0.0, min(1.0, float(percent) / 100.0))
                except Exception:
                    pct = float(current.get("percent") or 0)
                current["percent"] = max(float(current.get("percent") or 0), pct)
                if message:
                    current["message"] = str(message)
                current["updated_ts"] = time.time()

        handler = record.get("handler")
        kwargs = dict(record.get("handler_kwargs") or {})
        kwargs["progress_callback"] = progress_callback
        audio_path = webui_qwen_tts.enqueue_task(handler, **kwargs)

        with QWEN_TTS_RUNS_LOCK:
            record = QWEN_TTS_RUNS.get(run_id)
            if not record:
                return
            if record.get("cancel_action") == "stop":
                cleanup_after_worker = True
                record["state"] = "canceled"
                record["percent"] = max(float(record.get("percent") or 0), 0.01)
                record["message"] = "Stopped by user."
                record["finished_ts"] = time.time()
                record["updated_ts"] = time.time()
                _add_event(record, "warn", record["message"])
                return

        asset = canvas_workbench_assets.register_existing_file_asset(
            audio_path,
            record.get("project_id") or "default",
            record.get("state_params") if isinstance(record.get("state_params"), dict) else {},
            node_id=record.get("placeholder_node_id") or record.get("qwen_tts_node_id") or "",
            role="qwen_tts_output",
            metadata={
                "mime": "audio/wav",
                "owner": record.get("user_did") or "guest",
                "mode": record.get("mode") or "",
            },
        )
        if not asset:
            raise RuntimeError("Qwen TTS finished without a materialized audio asset")
        with QWEN_TTS_RUNS_LOCK:
            record = QWEN_TTS_RUNS.get(run_id)
            if not record:
                return
            record["asset"] = asset
            record["assets"] = [asset]
            record["state"] = "finished"
            record["percent"] = 1.0
            record["message"] = "Qwen TTS finished: 1 audio result."
            record["finished_ts"] = time.time()
            record["updated_ts"] = time.time()
            _add_event(record, "info", record["message"], {"path": asset.get("path")})
    except BaseException as err:
        if isinstance(err, (KeyboardInterrupt, SystemExit)) and not _is_interrupt_exception(err):
            raise
        cleanup_after_worker = True
        with QWEN_TTS_RUNS_LOCK:
            record = QWEN_TTS_RUNS.get(run_id)
            if not record:
                return
            if record.get("cancel_action") == "stop" or _is_interrupt_exception(err):
                record["state"] = "canceled"
                record["message"] = "Stopped by user."
                record["percent"] = max(float(record.get("percent") or 0), 0.01)
                _add_event(record, "warn", record["message"])
            else:
                record["state"] = "failed"
                record["message"] = f"Qwen TTS failed: {type(err).__name__}: {err}"
                record["error"] = f"{type(err).__name__}: {err}"
                record["details"] = str(err)
                record["percent"] = 0.0
                _add_event(record, "error", record["message"])
            record["finished_ts"] = time.time()
            record["updated_ts"] = time.time()
    finally:
        if cleanup_after_worker:
            _unload_qwen_tts_models_safe()
        _set_interrupt(False)


def run_qwen_tts(payload, state_params):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload is not an object"}
    _cleanup_runs()
    mode = str(payload.get("mode") or "").strip()
    if mode not in ("voice_design", "voice_clone", "custom_voice", "dialogue"):
        return {"ok": False, "error": "unsupported Qwen TTS mode"}
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    identity = _state_identity(payload, state_params)
    try:
        materialized, errors = _materialize_input_assets(payload, state_params)
        if errors:
            return {"ok": False, "error": "input materialization failed", "errors": errors}
        handler, kwargs = _build_handler_call(mode, params, materialized, identity.get("user_did") or "guest")
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {err}"}

    run_id = payload.get("run_id") or f"qwen-tts-{int(time.time() * 1000)}"
    now = time.time()
    record = {
        "run_id": run_id,
        "task_id": run_id,
        "project_id": payload.get("project_id") or "default",
        "placeholder_node_id": payload.get("placeholder_node_id") or "",
        "qwen_tts_node_id": payload.get("qwen_tts_node_id") or payload.get("node_id") or "",
        "mode": mode,
        "state": "queued",
        "percent": 0.02,
        "message": "Queued Qwen TTS job.",
        "handler": handler,
        "handler_kwargs": kwargs,
        "input_count": len(materialized),
        "resolved_seed": kwargs.get("seed"),
        "user_did": identity.get("user_did") or "guest",
        "state_params": copy.deepcopy(state_params) if isinstance(state_params, dict) else {},
        "created_ts": now,
        "updated_ts": now,
    }
    _add_event(record, "info", record["message"], {"mode": mode})
    with QWEN_TTS_RUNS_LOCK:
        QWEN_TTS_RUNS[run_id] = record
    threading.Thread(target=_run_worker, args=(run_id,), daemon=True).start()
    return _public_record(record)


def poll_qwen_tts(payload, state_params):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload is not an object"}
    run_id = payload.get("job_id") or payload.get("run_id") or ""
    with QWEN_TTS_RUNS_LOCK:
        record = QWEN_TTS_RUNS.get(run_id)
        if not record:
            return {"ok": False, "error": "run not found", "run_id": run_id, "job_id": run_id}
        return _public_record(record)


def control_qwen_tts(payload, state_params):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload is not an object"}
    run_id = payload.get("job_id") or payload.get("run_id") or ""
    action = str(payload.get("action") or "").strip().lower()
    if action != "stop":
        return {"ok": False, "error": "unsupported control action", "run_id": run_id, "job_id": run_id}
    with QWEN_TTS_RUNS_LOCK:
        record = QWEN_TTS_RUNS.get(run_id)
        if not record:
            return {"ok": False, "error": "run not found", "run_id": run_id, "job_id": run_id}
        if record.get("state") in QWEN_TTS_TERMINAL_STATES:
            return _public_record(record)
        should_interrupt = record.get("state") == "running"
        record["cancel_action"] = "stop"
        record["state"] = "cancelling"
        record["message"] = "Stop requested. Waiting for Qwen TTS interruption."
        record["updated_ts"] = time.time()
        _add_event(record, "warn", record["message"], {"action": action})
    if should_interrupt:
        _set_interrupt(True)
    return _public_record(record)
