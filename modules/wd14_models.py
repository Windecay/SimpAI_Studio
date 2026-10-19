"""Image tagger identities shared by the UI, Agent and model downloads."""

import hashlib
import os
from functools import lru_cache

from modules.model_path_utils import find_model_in_dirs

DEFAULT_MODEL_ID = "wd-eva02-tagger-2026-canary-onnx-v2"
PIXAI_MODEL_ID = "pixai-tagger-v1.0-fp16"
PIXAI_HF_ROOT = "https://huggingface.co/Mexes/pixai-tagger-v1.0-onnx-fp32-fp16-int8/resolve/0800778563144a0e6fdf41ddadd84aae3cb0dbcf/"
PIXAI_HF_MIRROR_ROOT = PIXAI_HF_ROOT.replace("https://huggingface.co/", "https://hf-mirror.com/")
PIXAI_MS_ROOT = "https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/clip_vision/"


MODEL_SPECS = (
    (
        "wd-eva02-tagger-2026-canary-onnx-v2",
        "https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/clip_vision/wd-eva02-tagger-2026-canary-onnx-v2.onnx",
        "https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/clip_vision/wd-eva02-tagger-2026-canary-onnx-v2.csv",
    ),
    (
        "wd-eva02-large-tagger-v3",
        "https://www.modelscope.cn/models/windecay/WD-tagger/resolve/master/wd-eva02-large-tagger-v3.onnx",
        "https://www.modelscope.cn/models/windecay/WD-tagger/resolve/master/wd-eva02-large-tagger-v3.csv",
    ),
    (
        "wd-v1-4-moat-tagger-v2",
        "https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/wd-v1-4-moat-tagger-v2.onnx",
        "https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/wd-v1-4-moat-tagger-v2.csv",
    ),
    (
        PIXAI_MODEL_ID,
        PIXAI_MS_ROOT + PIXAI_MODEL_ID + ".onnx," + PIXAI_HF_ROOT + "model_fp16.onnx",
        PIXAI_HF_MIRROR_ROOT + "selected_tags.csv," + PIXAI_HF_ROOT + "selected_tags.csv",
    ),
)

MODEL_LABELS = {
    DEFAULT_MODEL_ID: "WD14 EVA02 2026",
    "wd-eva02-large-tagger-v3": "WD14 EVA02 v3",
    "wd-v1-4-moat-tagger-v2": "WD14 MOAT v2",
    PIXAI_MODEL_ID: "PixAI Tagger v1.0 FP16",
}
PIXAI_FILES = {
    "onnx": (992916002, "cd668e6760bb58ec400ce1b0286e5c9133f83b543caac6a378406b7d56f8c303"),
    "csv": (804671, "a9455cbf0a910d4a3890739f2f70bd986278f4594285ef1049121a03896e2a6d"),
}
CATEGORY_NAMES = {"0": "general", "1": "style", "3": "copyright", "4": "character", "5": "meta", "9": "rating"}
TAG_CATEGORY_LABELS = {
    "general": "General tags", "character": "Character tags", "copyright": "Work tags",
    "style": "Style tags", "meta": "Metadata tags", "rating": "Rating tags",
}
DEFAULT_TAG_CATEGORIES = ("general", "character")


def normalize_tag_categories(categories=None):
    if categories is None:
        return list(DEFAULT_TAG_CATEGORIES)
    if not isinstance(categories, (list, tuple)) or any(
        not isinstance(value, str) or value not in TAG_CATEGORY_LABELS for value in categories
    ):
        raise ValueError("Unknown image tagger category")
    return [value for value in TAG_CATEGORY_LABELS if value in categories]


def validate_model_id(model_id):
    if model_id not in MODEL_LABELS:
        raise ValueError("Unknown image tagger model")
    return model_id


def default_thresholds(model_id):
    validate_model_id(model_id)
    return (0.17, 0.27) if model_id == PIXAI_MODEL_ID else (0.35, 0.85)


def model_files(model_id):
    validate_model_id(model_id)
    spec = next(row for row in MODEL_SPECS if row[0] == model_id)
    return [{"cata": "clip_vision", "path_file": model_id + "." + ext, "url": url,
             "size": PIXAI_FILES[ext][0] if model_id == PIXAI_MODEL_ID else 0}
            for ext, url in zip(("onnx", "csv"), spec[1:])]


@lru_cache(maxsize=16)
def _verified_hash(path, size, mtime_ns, ctime_ns):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_model_files(model_id, paths):
    """Check the pinned PixAI export before creating an ONNX session."""
    if model_id != PIXAI_MODEL_ID:
        return
    for ext, path in paths.items():
        expected_size, expected_hash = PIXAI_FILES[ext]
        stat = os.stat(path)
        if (stat.st_size != expected_size or
                _verified_hash(os.path.abspath(path), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns) != expected_hash):
            raise RuntimeError("PixAI model or label table failed SHA256 verification: " + os.path.basename(path))


def installed_models(paths):
    models = []
    for name, _, _ in MODEL_SPECS:
        files = {ext: find_model_in_dirs(paths, name + "." + ext) for ext in ("onnx", "csv")}
        missing = [ext for ext, path in files.items() if not path or not os.path.isfile(path)]
        invalid = [ext for ext, path in files.items() if ext not in missing and name == PIXAI_MODEL_ID
                   and os.path.getsize(path) != PIXAI_FILES[ext][0]]
        models.append({"model_id": name, "label": MODEL_LABELS[name], "ready": not missing and not invalid,
                       "missing_files": missing, "invalid_files": invalid})
    return models
