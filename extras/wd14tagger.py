import numpy as np
import csv
import onnxruntime as ort
import os

from PIL import Image
from onnxruntime import InferenceSession
from modules.config import paths_clip_vision
from modules.model_loader import load_file_from_url
from modules.model_path_utils import find_model_in_dirs, find_dir_containing_model
from modules.wd14_preprocess import (
    needs_wd14_timm_normalization,
    prepare_wd14_image,
)
import logging
logger = logging.getLogger(__name__)

global_model = None
global_csv = None
current_model_name = None


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
    global global_model, global_csv, current_model_name
    if global_model is not None:
        del global_model
        global_model = None
    global_csv = None
    current_model_name = None
    import gc
    gc.collect()


def default_interrogator(image, threshold=0.35, character_threshold=0.85, exclude_tags=""):
    global global_model, global_csv, current_model_name

    model_specs = (
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
    )

    model_name = None
    model_onnx_filename = None
    model_csv_filename = None
    for candidate_name, model_onnx_url, model_csv_url in model_specs:
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
            logger.warning(f"[WD14 Tagger] 模型 {candidate_name} 不可用，将尝试兼容模型: {exc}")
            continue
        model_name = candidate_name
        model_onnx_filename = candidate_onnx_filename
        model_csv_filename = candidate_csv_filename
        break

    if model_name is None:
        raise RuntimeError("[WD14 Tagger] 没有可用的 ONNX 模型和标签表")

    if current_model_name != model_name:
        global_model = None
        global_csv = None
        current_model_name = model_name
    logger.info(f"[WD14 Tagger] 当前使用模型: {model_name}")

    if global_model is not None:
        model = global_model
    else:
        model = InferenceSession(model_onnx_filename, providers=_ort_providers())
        global_model = model

    input = model.get_inputs()[0]
    image = prepare_wd14_image(
        image,
        input.shape,
        normalize=needs_wd14_timm_normalization(model_name),
    )

    if global_csv is not None:
        csv_lines = global_csv
    else:
        csv_lines = []
        with open(model_csv_filename) as f:
            reader = csv.reader(f)
            next(reader)
            for row in reader:
                csv_lines.append(row)
        global_csv = csv_lines

    tags = []
    general_index = None
    character_index = None
    for line_num, row in enumerate(csv_lines):
        if general_index is None and row[2] == "0":
            general_index = line_num
        elif character_index is None and row[2] == "4":
            character_index = line_num
        tags.append(row[1])

    label_name = model.get_outputs()[0].name
    probs = model.run([label_name], {input.name: image})[0]
    if probs.ndim != 2 or probs.shape[1] != len(tags):
        raise RuntimeError(
            f"[WD14 Tagger] 模型输出数量 {getattr(probs, 'shape', None)} 与标签数量 {len(tags)} 不一致"
        )

    result = list(zip(tags, probs[0]))

    general = [item for item in result[general_index:character_index] if item[1] > threshold]
    character = [item for item in result[character_index:] if item[1] > character_threshold]

    all = character + general
    remove = [s.strip() for s in exclude_tags.lower().split(",")]
    all = [tag for tag in all if tag[0] not in remove]

    res = ", ".join((item[0].replace("(", "\\(").replace(")", "\\)") for item in all)).replace('_', ' ')
    return res
