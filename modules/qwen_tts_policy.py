"""Local file checks shared by Agent discovery and the Qwen model loader.

No model, torch, network or node initialization belongs in this module.
"""

import json
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path


_LOCAL_ONLY = ContextVar("simpai_qwen_tts_local_only", default=False)
TOKENIZER = "Qwen/Qwen3-TTS-Tokenizer-12Hz"
MODEL_IDS = {
    ("Base", "0.6B"): "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
    ("Base", "1.7B"): "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    ("VoiceDesign", "1.7B"): "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    ("CustomVoice", "0.6B"): "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    ("CustomVoice", "1.7B"): "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
}


def local_only():
    return _LOCAL_ONLY.get()


@contextmanager
def local_models_only():
    token = _LOCAL_ONLY.set(True)
    try:
        yield
    finally:
        _LOCAL_ONLY.reset(token)


def model_roots():
    from modules.config import paths_qwen_tts
    import sys
    roots = list(paths_qwen_tts) if isinstance(paths_qwen_tts, (list, tuple)) else [paths_qwen_tts]
    folder_paths = sys.modules.get("folder_paths")
    if folder_paths:
        roots.extend(folder_paths.get_folder_paths("qwen-tts") or [])
    return list(dict.fromkeys(str(Path(root).resolve()) for root in roots if root))


def _weight_files(root):
    for filename in ("model.safetensors", "pytorch_model.bin"):
        path = root / filename
        if _nonempty_file(path):
            return []
    for filename in ("model.safetensors.index.json", "pytorch_model.bin.index.json"):
        path = root / filename
        try:
            if _nonempty_file(path) and path.stat().st_size < 4 * 1024 * 1024:
                shards = set(json.loads(path.read_text(encoding="utf-8"))["weight_map"].values())
                if shards and all(isinstance(name, str) and Path(name).name == name
                                  and _nonempty_file(root / name) for name in shards):
                    return []
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            pass
    return ["model.safetensors"]

def _nonempty_file(path):
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:
        return False


def inspect_model(model_id, roots=None):
    roots = model_roots() if roots is None else roots
    folder = model_id.rsplit("/", 1)[-1]
    candidates = [Path(root) / suffix for root in roots for suffix in (folder, "Qwen/" + folder)]
    required = ["config.json", "preprocessor_config.json"]
    if model_id != TOKENIZER:
        required += ["generation_config.json", "merges.txt", "tokenizer_config.json", "vocab.json",
                     "speech_tokenizer/config.json", "speech_tokenizer/preprocessor_config.json"]
    best = None
    for candidate in candidates:
        missing = [name for name in required if not _nonempty_file(candidate / name)]
        missing += _weight_files(candidate)
        if model_id != TOKENIZER:
            missing += ["speech_tokenizer/" + name for name in _weight_files(candidate / "speech_tokenizer")]
        result = {"model_id": model_id, "ready": not missing, "missing_files": missing, "path": str(candidate)}
        if not missing:
            return result
        if best is None or len(missing) < len(best["missing_files"]):
            best = result
    return best or {"model_id": model_id, "ready": False, "missing_files": required + ["model.safetensors"], "path": ""}


def require_model(model_id, roots=None):
    status = inspect_model(model_id, roots)
    if not status["ready"]:
        raise RuntimeError("Qwen TTS local model files are incomplete: " + model_id)
    return status["path"]


def dependencies(mode, parameters):
    size = parameters.model_choice
    kind = {"voice_design": "VoiceDesign", "custom_voice": "CustomVoice"}.get(mode, "Base")
    ids = [TOKENIZER]
    if (kind, size) in MODEL_IDS:
        ids.append(MODEL_IDS[kind, size])
    if mode == "voice_design" and parameters.lock_timbre_with_first_segment:
        ids.append(MODEL_IDS["Base", size])
    return list(dict.fromkeys(ids))
