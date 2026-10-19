import numpy as np
import csv
import onnxruntime as ort
import os
import threading
import time
from contextlib import nullcontext

from PIL import Image
from onnxruntime import InferenceSession
from modules.config import paths_clip_vision
from modules.model_loader import load_file_from_url
from modules.model_path_utils import find_model_in_dirs, find_dir_containing_model
from modules.wd14_preprocess import (
    needs_wd14_timm_normalization,
    prepare_wd14_image,
    prepare_pixai_image,
)
from modules.wd14_models import (MODEL_SPECS, PIXAI_MODEL_ID, default_thresholds,
                                 validate_model_id, verify_model_files, CATEGORY_NAMES, normalize_tag_categories)
import logging
logger = logging.getLogger(__name__)

global_model = None
global_csv = None
current_model_name = None
current_cpu_only = None
_model_lock = threading.RLock()


def _ort_providers():
    available = set(ort.get_available_providers())
    preferred = [
        "CUDAExecutionProvider",
        "DirectMLExecutionProvider",
        "DmlExecutionProvider",
        "ROCMExecutionProvider",
        "CoreMLExecutionProvider",
        "CPUExecutionProvider",
    ]
    if os.environ.get("SIMPAI_WD14_ENABLE_TENSORRT") == "1":
        preferred.insert(0, "TensorrtExecutionProvider")
    providers = [provider for provider in preferred if provider in available]
    return providers or ["CPUExecutionProvider"]


def free_model():
    global global_model, global_csv, current_model_name, current_cpu_only
    with _model_lock:
        global_model = None
        global_csv = None
        current_model_name = None
        current_cpu_only = None
    import gc
    gc.collect()


def default_interrogator(image, threshold=None, character_threshold=None, exclude_tags="",
                         *, allow_download=True, cpu_only=False, return_details=False, model_id=None, categories=None):
    categories = normalize_tag_categories(categories)
    if model_id is not None:
        validate_model_id(model_id)
    if not cpu_only:
        from modules.gpu_task_lock import exclusive_gpu_task
        wait_until = time.monotonic() + 25
        def check_wait():
            if time.monotonic() >= wait_until:
                raise TimeoutError("Image tagger is waiting for the GPU")
            return False
        gpu_context = exclusive_gpu_task(cancel_check=check_wait)
    else:
        gpu_context = nullcontext()
    with gpu_context:
        if not _model_lock.acquire(timeout=25):
            raise TimeoutError("Image tagger is busy")
        try:
            return _interrogate(image, threshold, character_threshold, exclude_tags,
                                allow_download=allow_download, cpu_only=cpu_only, return_details=return_details,
                                model_id=model_id, categories=categories)
        finally:
            try:
                if not cpu_only and current_model_name == PIXAI_MODEL_ID:
                    free_model()
            finally:
                _model_lock.release()


def _interrogate(image, threshold, character_threshold, exclude_tags,
                 *, allow_download, cpu_only, return_details, model_id=None, categories):
    global global_model, global_csv, current_model_name, current_cpu_only
    model_specs = ([row for row in MODEL_SPECS if row[0] == model_id] if model_id else
                   [row for row in MODEL_SPECS if row[0] != PIXAI_MODEL_ID])

    model_name = None
    model_onnx_filename = None
    model_csv_filename = None
    for candidate_name, model_onnx_url, model_csv_url in model_specs:
        if not allow_download:
            candidate_onnx_filename = find_model_in_dirs(paths_clip_vision, candidate_name + ".onnx")
            candidate_csv_filename = find_model_in_dirs(paths_clip_vision, candidate_name + ".csv")
            if (candidate_onnx_filename and os.path.isfile(candidate_onnx_filename)
                    and candidate_csv_filename and os.path.isfile(candidate_csv_filename)):
                model_name, model_onnx_filename, model_csv_filename = candidate_name, candidate_onnx_filename, candidate_csv_filename
                break
            continue
        model_dir = find_dir_containing_model(paths_clip_vision, f"{candidate_name}.onnx")
        try:
            candidate_onnx_filename = load_file_from_url(
                url=model_onnx_url,
                model_dir=model_dir,
                file_name=f'{candidate_name}.onnx',
            )
            candidate_csv_filename = load_file_from_url(
                url=model_csv_url,
                model_dir=model_dir,
                file_name=f'{candidate_name}.csv',
            )
        except Exception as exc:
            if model_id:
                raise
            logger.warning(f"[WD14 Tagger] 模型 {candidate_name} 不可用，将尝试兼容模型: {exc}")
            continue
        model_name = candidate_name
        model_onnx_filename = candidate_onnx_filename
        model_csv_filename = candidate_csv_filename
        break

    if model_name is None:
        raise RuntimeError("Image tagger model files are missing. Download the selected model in UI settings.")

    defaults = default_thresholds(model_name)
    threshold = defaults[0] if threshold is None else float(threshold)
    character_threshold = defaults[1] if character_threshold is None else float(character_threshold)
    if not (0 <= threshold <= 1 and 0 <= character_threshold <= 1):
        raise ValueError("Image tagger thresholds must be between 0 and 1")
    verify_model_files(model_name, {"onnx": model_onnx_filename, "csv": model_csv_filename})

    if current_model_name != model_name or current_cpu_only != cpu_only:
        global_model = None
        global_csv = None
        current_model_name = model_name
        current_cpu_only = cpu_only
    logger.info(f"[WD14 Tagger] 当前使用模型: {model_name}")

    if global_model is not None:
        model = global_model
    else:
        options = ort.SessionOptions()
        # Native ONNX warnings use UTF-16 on Windows and corrupt launcher logs.
        options.log_severity_level = 3
        if cpu_only:
            options.intra_op_num_threads = 4
            model = InferenceSession(model_onnx_filename, providers=["CPUExecutionProvider"], sess_options=options)
        else:
            providers = _ort_providers()
            if model_name == PIXAI_MODEL_ID and any(provider in {"DmlExecutionProvider", "DirectMLExecutionProvider"} for provider in providers):
                options.enable_mem_pattern = False
                options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            model = InferenceSession(model_onnx_filename, providers=_ort_providers(), sess_options=options)
        global_model = model

    input = model.get_inputs()[0]
    if model_name == PIXAI_MODEL_ID:
        image = prepare_pixai_image(image, input.shape)
    else:
        image = prepare_wd14_image(
            image,
            input.shape,
            normalize=needs_wd14_timm_normalization(model_name),
        )

    if global_csv is not None:
        csv_lines = global_csv
    else:
        csv_lines = []
        with open(model_csv_filename, encoding="utf-8-sig", newline="") as f:
            reader = csv.reader(f)
            next(reader)
            for row in reader:
                csv_lines.append(row)
        global_csv = csv_lines

    tags = []
    for row in csv_lines:
        tags.append(row[1])

    label_name = model.get_outputs()[0].name
    probs = model.run([label_name], {input.name: image})[0]
    if probs.ndim != 2 or probs.shape[1] != len(tags):
        raise RuntimeError(
            f"[WD14 Tagger] 模型输出数量 {getattr(probs, 'shape', None)} 与标签数量 {len(tags)} 不一致"
        )
    if not np.all(np.isfinite(probs)):
        raise RuntimeError("Image tagger returned non-finite probabilities")

    result = list(zip(tags, probs[0]))

    categories_by_tag = {row[1]: CATEGORY_NAMES.get(row[2]) for row in csv_lines}
    all = []
    # Keep character-first ordering for existing prompts and API limits.
    for category in ("character", "general", "copyright", "style", "meta", "rating"):
        if category in categories:
            cutoff = character_threshold if category == "character" else threshold
            all.extend(item for item in result if categories_by_tag[item[0]] == category and item[1] > cutoff)
    remove = {s.strip().replace(" ", "_") for s in exclude_tags.lower().split(",")}
    all = [tag for tag in all if tag[0].lower().replace(" ", "_") not in remove]

    res = ", ".join((item[0].replace("(", "\\(").replace(")", "\\)") for item in all)).replace('_', ' ')
    if not return_details:
        return res
    return {"prompt": res, "model_id": model_name, "providers": model.get_providers(),
            "categories": categories,
            "threshold": threshold, "character_threshold": character_threshold,
            "tags": [{"tag": tag, "confidence": float(confidence), "category": categories_by_tag[tag]}
                     for tag, confidence in all]}
