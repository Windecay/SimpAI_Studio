import glob
import contextlib
import ctypes
import io
import logging
import os
import re
import shutil
import sys
from typing import List, Union

import cv2
import numpy as np
from PIL import Image
from tqdm import tqdm

import insightface
import onnxruntime
from insightface.app.common import Face
# try:
#     import torch.cuda as cuda
# except:
#     cuda = None
import torch

import folder_paths
import comfy.model_management as model_management
from modules.shared import state

from scripts.reactor_logger import logger
from reactor_utils import (
    move_path,
    get_image_md5hash,
)
from scripts.r_faceboost import swapper, restorer

import warnings

np.warnings = warnings
np.warnings.filterwarnings('ignore')


def _reactor_progress(total, desc):
    status_level = getattr(logging, "STATUS", logging.INFO + 5)
    return tqdm(
        total=total,
        desc=f"[ReActor] {desc}",
        unit="frame",
        dynamic_ncols=True,
        mininterval=0.3,
        ascii=True,
        leave=True,
        disable=total <= 1 or not logger.isEnabledFor(status_level),
    )

def _with_cpu_provider(provider):
    if provider == "CPUExecutionProvider":
        return [provider]
    return [provider, "CPUExecutionProvider"]


_PORTABLE_CUDA_DLL_DIR_HANDLES = []
_ADDED_PORTABLE_CUDA_DLL_DIRS = set()


def _portable_cuda_dll_dirs():
    candidates = []
    torch_file = getattr(torch, "__file__", None)
    if torch_file:
        torch_dir = os.path.dirname(torch_file)
        site_packages_dir = os.path.dirname(torch_dir)
        candidates.append(os.path.join(torch_dir, "lib"))
        nvidia_root = os.path.join(site_packages_dir, "nvidia")
        candidates.extend(glob.glob(os.path.join(nvidia_root, "*", "bin")))
        candidates.extend(glob.glob(os.path.join(nvidia_root, "*", "lib")))

    python_root = os.path.dirname(sys.executable)
    candidates.append(python_root)
    candidates.append(os.path.join(python_root, "DLLs"))

    result = []
    seen = set()
    for path in candidates:
        normalized = os.path.normcase(os.path.abspath(path))
        if normalized in seen or not os.path.isdir(path):
            continue
        seen.add(normalized)
        result.append(path)
    return result


def _add_portable_cuda_dll_dirs():
    if os.name != "nt" or not hasattr(os, "add_dll_directory"):
        return
    for dll_dir in _portable_cuda_dll_dirs():
        normalized = os.path.normcase(os.path.abspath(dll_dir))
        if normalized in _ADDED_PORTABLE_CUDA_DLL_DIRS:
            continue
        try:
            _PORTABLE_CUDA_DLL_DIR_HANDLES.append(os.add_dll_directory(dll_dir))
            _ADDED_PORTABLE_CUDA_DLL_DIRS.add(normalized)
        except OSError as e:
            logger.debug(f"Failed to add portable CUDA DLL directory {dll_dir}: {e}")


def _onnxruntime_cuda_major():
    try:
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            onnxruntime.print_debug_info()
        match = re.search(r"CUDA version used in build:\s*(\d+)", output.getvalue())
        if match:
            return match.group(1)
    except Exception as e:
        logger.debug(f"Failed to read ONNXRuntime CUDA build version: {e}")

    torch_cuda = getattr(torch.version, "cuda", None)
    if torch_cuda:
        return str(torch_cuda).split(".", 1)[0]
    return "12"


def _portable_cuda_dll_exists(dll_name):
    for dll_dir in _portable_cuda_dll_dirs():
        dll_path = os.path.join(dll_dir, dll_name)
        if not os.path.isfile(dll_path):
            continue
        try:
            ctypes.WinDLL(dll_path)
            return True
        except OSError as e:
            logger.debug(f"Failed to load portable CUDA DLL {dll_path}: {e}")
    return False


def _missing_windows_cuda_dlls():
    if os.name != "nt":
        return []

    _add_portable_cuda_dll_dirs()
    cuda_major = _onnxruntime_cuda_major()
    required_dlls = (
        f"cublasLt64_{cuda_major}.dll",
        f"cublas64_{cuda_major}.dll",
        f"cudart64_{cuda_major}.dll",
    )
    return [dll_name for dll_name in required_dlls if not _portable_cuda_dll_exists(dll_name)]


def _select_ort_providers():
    try:
        available = set(onnxruntime.get_available_providers())
        if torch.cuda.is_available() and "CUDAExecutionProvider" in available:
            missing = _missing_windows_cuda_dlls()
            if not missing:
                return _with_cpu_provider("CUDAExecutionProvider")
            logger.warning(
                "ONNXRuntime CUDA provider disabled: missing portable CUDA DLLs: %s. ReActor will use CPUExecutionProvider.",
                ", ".join(missing),
            )
        elif torch.backends.mps.is_available() and "CoreMLExecutionProvider" in available:
            return _with_cpu_provider("CoreMLExecutionProvider")
        elif (hasattr(torch, 'dml') or hasattr(torch, 'privateuseone')) and "ROCMExecutionProvider" in available:
            return _with_cpu_provider("ROCMExecutionProvider")
    except Exception as e:
        logger.debug(f"ExecutionProviderError: {e}.\nEP is set to CPU.")
    return ["CPUExecutionProvider"]


providers = _select_ort_providers()
# if cuda is not None:
#     if cuda.is_available():
#         providers = ["CUDAExecutionProvider"]
#     else:
#         providers = ["CPUExecutionProvider"]
# else:
#     providers = ["CPUExecutionProvider"]

models_path_old = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
insightface_path_old = os.path.join(models_path_old, "insightface")
insightface_models_path_old = os.path.join(insightface_path_old, "models")

models_path = folder_paths.models_dir
insightface_path = os.path.join(models_path, "insightface")
insightface_models_path = os.path.join(insightface_path, "models")
reswapper_path = os.path.join(models_path, "reswapper")
SWAPPER_MODEL_EXTENSIONS = (".onnx", ".pth")

if os.path.exists(models_path_old):
    move_path(insightface_models_path_old, insightface_models_path)
    move_path(insightface_path_old, insightface_path)
    move_path(models_path_old, models_path)
if os.path.exists(insightface_path) and os.path.exists(insightface_path_old):
    shutil.rmtree(insightface_path_old)
    shutil.rmtree(models_path_old)


def _dedupe_paths(paths):
    deduped = []
    seen = set()
    for path in paths:
        if not path:
            continue
        normalized = os.path.normpath(path)
        key = os.path.normcase(os.path.abspath(normalized))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(normalized)
    return deduped


def get_swap_model_dirs(folder_name):
    paths = []
    try:
        paths.extend(folder_paths.get_folder_paths(folder_name))
    except Exception:
        pass
    paths.append(os.path.join(folder_paths.models_dir, folder_name))
    return _dedupe_paths(paths)


def list_swap_model_paths(folder_names=("insightface", "reswapper")):
    models = []
    for folder_name in folder_names:
        for model_dir in get_swap_model_dirs(folder_name):
            models.extend(glob.glob(os.path.join(model_dir, "*")))
    return [
        model
        for model in _dedupe_paths(models)
        if os.path.isfile(model) and model.lower().endswith(SWAPPER_MODEL_EXTENSIONS)
    ]


def resolve_swap_model_path(model):
    if model is None:
        return None
    if os.path.isabs(model) and os.path.isfile(model):
        return model

    model_name = os.path.basename(model)
    model_lower = model_name.lower()
    if "reswapper" in model_lower:
        folder_names = ("reswapper", "insightface")
    elif "inswapper" in model_lower:
        folder_names = ("insightface", "reswapper")
    else:
        folder_names = ("insightface", "reswapper")

    for folder_name in folder_names:
        for model_dir in get_swap_model_dirs(folder_name):
            candidate = os.path.join(model_dir, model_name)
            if os.path.isfile(candidate):
                return candidate

    if "reswapper" in model_lower:
        return os.path.join(reswapper_path, model_name)
    return os.path.join(insightface_path, model_name)


def get_preferred_insightface_path():
    roots = get_swap_model_dirs("insightface")
    required = ("1k3d68.onnx", "2d106det.onnx", "det_10g.onnx", "genderage.onnx", "w600k_r50.onnx")
    for root in roots:
        if all(os.path.isfile(os.path.join(root, "models", "buffalo_l", filename)) for filename in required):
            return root
    for root in roots:
        if (
            os.path.isdir(os.path.join(root, "models", "buffalo_l"))
            or os.path.isfile(os.path.join(root, "models", "buffalo_l.zip"))
        ):
            return root
    for root in roots:
        if (
            os.path.isfile(os.path.join(root, "inswapper_128.onnx"))
            or os.path.isfile(os.path.join(root, "inswapper_128_fp16.onnx"))
        ):
            return root
    for root in roots:
        if os.path.isdir(root):
            return root
    return insightface_path


FS_MODEL = None
CURRENT_FS_MODEL_PATH = None

ANALYSIS_MODELS = {
    "640": None,
    "320": None,
}

SOURCE_FACES = None
SOURCE_IMAGE_HASH = None
TARGET_FACES = None
TARGET_IMAGE_HASH = None
TARGET_FACES_LIST = []
TARGET_IMAGE_LIST_HASH = []

def unload_model(model):
    if model is not None:
        # check if model has unload method
        # if "unload" in model:
        #     model.unload()
        # if "model_unload" in model:
        #     model.model_unload()
        del model
    return None

def unload_all_models():
    global FS_MODEL, CURRENT_FS_MODEL_PATH
    FS_MODEL = unload_model(FS_MODEL)
    ANALYSIS_MODELS["320"] = unload_model(ANALYSIS_MODELS["320"])
    ANALYSIS_MODELS["640"] = unload_model(ANALYSIS_MODELS["640"])

def get_current_faces_model():
    global SOURCE_FACES
    return SOURCE_FACES

def getAnalysisModel(det_size = (640, 640)):
    global ANALYSIS_MODELS
    ANALYSIS_MODEL = ANALYSIS_MODELS[str(det_size[0])]
    if ANALYSIS_MODEL is None:
        ANALYSIS_MODEL = insightface.app.FaceAnalysis(
            name="buffalo_l", providers=providers, root=get_preferred_insightface_path()
        )
    ANALYSIS_MODEL.prepare(ctx_id=0, det_size=det_size)
    ANALYSIS_MODELS[str(det_size[0])] = ANALYSIS_MODEL
    return ANALYSIS_MODEL

def getFaceSwapModel(model_path: str):
    global FS_MODEL, CURRENT_FS_MODEL_PATH
    if FS_MODEL is None or CURRENT_FS_MODEL_PATH is None or CURRENT_FS_MODEL_PATH != model_path:
        CURRENT_FS_MODEL_PATH = model_path
        FS_MODEL = unload_model(FS_MODEL)
        FS_MODEL = insightface.model_zoo.get_model(model_path, providers=providers)

    return FS_MODEL


def sort_by_order(face, order: str):
    if order == "left-right":
        return sorted(face, key=lambda x: x.bbox[0])
    if order == "right-left":
        return sorted(face, key=lambda x: x.bbox[0], reverse = True)
    if order == "top-bottom":
        return sorted(face, key=lambda x: x.bbox[1])
    if order == "bottom-top":
        return sorted(face, key=lambda x: x.bbox[1], reverse = True)
    if order == "small-large":
        return sorted(face, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]))
    # if order == "large-small":
    #     return sorted(face, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]), reverse = True)
    # by default "large-small":
    return sorted(face, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]), reverse = True)

def get_face_gender(
        face,
        face_index,
        gender_condition,
        operated: str,
        order: str,
):
    gender = [
        x.sex
        for x in face
    ]
    gender.reverse()
    # If index is outside of bounds, return None, avoid exception
    if face_index >= len(gender):
        logger.status("Requested face index (%s) is out of bounds (max available index is %s)", face_index, len(gender))
        return None, 0
    face_gender = gender[face_index]
    logger.status("%s Face %s: Detected Gender -%s-", operated, face_index, face_gender)
    if (gender_condition == 1 and face_gender == "F") or (gender_condition == 2 and face_gender == "M"):
        logger.status("OK - Detected Gender matches Condition")
        try:
            faces_sorted = sort_by_order(face, order)
            return faces_sorted[face_index], 0
            # return sorted(face, key=lambda x: x.bbox[0])[face_index], 0
        except IndexError:
            return None, 0
    else:
        logger.status("WRONG - Detected Gender doesn't match Condition")
        faces_sorted = sort_by_order(face, order)
        return faces_sorted[face_index], 1
        # return sorted(face, key=lambda x: x.bbox[0])[face_index], 1

def half_det_size(det_size):
    logger.status("Trying to halve 'det_size' parameter")
    return (det_size[0] // 2, det_size[1] // 2)

def analyze_faces(img_data: np.ndarray, det_size=(640, 640)):
    face_analyser = getAnalysisModel(det_size)
    faces = face_analyser.get(img_data)

    # Try halving det_size if no faces are found
    if len(faces) == 0 and det_size[0] > 320 and det_size[1] > 320:
        det_size_half = half_det_size(det_size)
        return analyze_faces(img_data, det_size_half)

    return faces

def get_face_single(img_data: np.ndarray, face, face_index=0, det_size=(640, 640), gender_source=0, gender_target=0, order="large-small"):

    buffalo_path = os.path.join(insightface_models_path, "buffalo_l.zip")
    if os.path.exists(buffalo_path):
        os.remove(buffalo_path)

    if gender_source != 0:
        if len(face) == 0 and det_size[0] > 320 and det_size[1] > 320:
            det_size_half = half_det_size(det_size)
            return get_face_single(img_data, analyze_faces(img_data, det_size_half), face_index, det_size_half, gender_source, gender_target, order)
        return get_face_gender(face,face_index,gender_source,"Source", order)

    if gender_target != 0:
        if len(face) == 0 and det_size[0] > 320 and det_size[1] > 320:
            det_size_half = half_det_size(det_size)
            return get_face_single(img_data, analyze_faces(img_data, det_size_half), face_index, det_size_half, gender_source, gender_target, order)
        return get_face_gender(face,face_index,gender_target,"Target", order)
    
    if len(face) == 0 and det_size[0] > 320 and det_size[1] > 320:
        det_size_half = half_det_size(det_size)
        return get_face_single(img_data, analyze_faces(img_data, det_size_half), face_index, det_size_half, gender_source, gender_target, order)

    try:
        faces_sorted = sort_by_order(face, order)
        return faces_sorted[face_index], 0
        # return sorted(face, key=lambda x: x.bbox[0])[face_index], 0
    except IndexError:
        return None, 0


def swap_face(
    source_img: Union[Image.Image, None],
    target_img: Image.Image,
    model: Union[str, None] = None,
    source_faces_index: List[int] = [0],
    faces_index: List[int] = [0],
    gender_source: int = 0,
    gender_target: int = 0,
    face_model: Union[Face, None] = None,
    faces_order: List = ["large-small", "large-small"],
    face_boost_enabled: bool = False,
    face_restore_model = None,
    face_restore_visibility: int = 1,
    codeformer_weight: float = 0.5,
    interpolation: str = "Bicubic",
):
    global SOURCE_FACES, SOURCE_IMAGE_HASH, TARGET_FACES, TARGET_IMAGE_HASH
    result_image = target_img

    if model is not None:

        if isinstance(source_img, str):  # source_img is a base64 string
            import base64, io
            if 'base64,' in source_img:  # check if the base64 string has a data URL scheme
                # split the base64 string to get the actual base64 encoded image data
                base64_data = source_img.split('base64,')[-1]
                # decode base64 string to bytes
                img_bytes = base64.b64decode(base64_data)
            else:
                # if no data URL scheme, just decode
                img_bytes = base64.b64decode(source_img)
            
            source_img = Image.open(io.BytesIO(img_bytes))
            
        target_img = cv2.cvtColor(np.array(target_img), cv2.COLOR_RGB2BGR)

        if source_img is not None:

            source_img = cv2.cvtColor(np.array(source_img), cv2.COLOR_RGB2BGR)

            source_image_md5hash = get_image_md5hash(source_img)

            if SOURCE_IMAGE_HASH is None:
                SOURCE_IMAGE_HASH = source_image_md5hash
                source_image_same = False
            else:
                source_image_same = True if SOURCE_IMAGE_HASH == source_image_md5hash else False
                if not source_image_same:
                    SOURCE_IMAGE_HASH = source_image_md5hash

            logger.info("Source Image MD5 Hash = %s", SOURCE_IMAGE_HASH)
            logger.info("Source Image the Same? %s", source_image_same)

            if SOURCE_FACES is None or not source_image_same:
                logger.status("Analyzing Source Image...")
                source_faces = analyze_faces(source_img)
                SOURCE_FACES = source_faces
            elif source_image_same:
                logger.status("Using Hashed Source Face(s) Model...")
                source_faces = SOURCE_FACES

        elif face_model is not None:

            source_faces_index = [0]
            logger.status("Using Loaded Source Face Model...")
            source_face_model = [face_model]
            source_faces = source_face_model

        else:
            logger.error("Cannot detect any Source")

        if source_faces is not None:

            target_image_md5hash = get_image_md5hash(target_img)

            if TARGET_IMAGE_HASH is None:
                TARGET_IMAGE_HASH = target_image_md5hash
                target_image_same = False
            else:
                target_image_same = True if TARGET_IMAGE_HASH == target_image_md5hash else False
                if not target_image_same:
                    TARGET_IMAGE_HASH = target_image_md5hash

            logger.info("Target Image MD5 Hash = %s", TARGET_IMAGE_HASH)
            logger.info("Target Image the Same? %s", target_image_same)
            
            if TARGET_FACES is None or not target_image_same:
                logger.status("Analyzing Target Image...")
                target_faces = analyze_faces(target_img)
                TARGET_FACES = target_faces
            elif target_image_same:
                logger.status("Using Hashed Target Face(s) Model...")
                target_faces = TARGET_FACES

            # No use in trying to swap faces if no faces are found, enhancement
            if len(target_faces) == 0:
                logger.status("Cannot detect any Target, skipping swapping...")
                return result_image

            if source_img is not None:
                # separated management of wrong_gender between source and target, enhancement
                source_face, src_wrong_gender = get_face_single(source_img, source_faces, face_index=source_faces_index[0], gender_source=gender_source, order=faces_order[1])
            else:
                # source_face = sorted(source_faces, key=lambda x: x.bbox[0])[source_faces_index[0]]
                source_face = sorted(source_faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]), reverse = True)[source_faces_index[0]]
                src_wrong_gender = 0

            if len(source_faces_index) != 0 and len(source_faces_index) != 1 and len(source_faces_index) != len(faces_index):
                logger.status(f'Source Faces must have no entries (default=0), one entry, or same number of entries as target faces.')
            elif source_face is not None:
                result = target_img
                model_path = resolve_swap_model_path(model)
                face_swapper = getFaceSwapModel(model_path)

                source_face_idx = 0

                for face_num in faces_index:
                    # No use in trying to swap faces if no further faces are found, enhancement
                    if face_num >= len(target_faces):
                        logger.status("Checked all existing target faces, skipping swapping...")
                        break

                    if len(source_faces_index) > 1 and source_face_idx > 0:
                        source_face, src_wrong_gender = get_face_single(source_img, source_faces, face_index=source_faces_index[source_face_idx], gender_source=gender_source, order=faces_order[1])
                    source_face_idx += 1

                    if source_face is not None and src_wrong_gender == 0:
                        target_face, wrong_gender = get_face_single(target_img, target_faces, face_index=face_num, gender_target=gender_target, order=faces_order[0])
                        if target_face is not None and wrong_gender == 0:
                            logger.status(f"Swapping...")
                            if face_boost_enabled:
                                logger.status(f"Face Boost is enabled")
                                bgr_fake, M = face_swapper.get(result, target_face, source_face, paste_back=False)
                                bgr_fake, scale = restorer.get_restored_face(bgr_fake, face_restore_model, face_restore_visibility, codeformer_weight, interpolation)
                                M *= scale
                                result = swapper.in_swap(target_img, bgr_fake, M)
                            else:
                                # logger.status(f"Swapping as-is")
                                result = face_swapper.get(result, target_face, source_face)
                        elif wrong_gender == 1:
                            wrong_gender = 0
                            # Keep searching for other faces if wrong gender is detected, enhancement
                            #if source_face_idx == len(source_faces_index):
                            #    result_image = Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))
                            #    return result_image
                            logger.status("Wrong target gender detected")
                            continue
                        else:
                            logger.status(f"No target face found for {face_num}")
                    elif src_wrong_gender == 1:
                        src_wrong_gender = 0
                        # Keep searching for other faces if wrong gender is detected, enhancement
                        #if source_face_idx == len(source_faces_index):
                        #    result_image = Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))
                        #    return result_image
                        logger.status("Wrong source gender detected")
                        continue
                    else:
                        logger.status(f"No source face found for face number {source_face_idx}.")

                result_image = Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))

            else:
                logger.status("No source face(s) in the provided Index")
        else:
            logger.status("No source face(s) found")
    return result_image

def swap_face_many(
    source_img: Union[Image.Image, None],
    target_imgs: List[Image.Image],
    model: Union[str, None] = None,
    source_faces_index: List[int] = [0],
    faces_index: List[int] = [0],
    gender_source: int = 0,
    gender_target: int = 0,
    face_model: Union[Face, None] = None,
    faces_order: List = ["large-small", "large-small"],
    face_boost_enabled: bool = False,
    face_restore_model = None,
    face_restore_visibility: int = 1,
    codeformer_weight: float = 0.5,
    interpolation: str = "Bicubic",
):
    global SOURCE_FACES, SOURCE_IMAGE_HASH, TARGET_FACES, TARGET_IMAGE_HASH, TARGET_FACES_LIST, TARGET_IMAGE_LIST_HASH
    result_images = target_imgs

    if model is not None:

        if isinstance(source_img, str):  # source_img is a base64 string
            import base64, io
            if 'base64,' in source_img:  # check if the base64 string has a data URL scheme
                # split the base64 string to get the actual base64 encoded image data
                base64_data = source_img.split('base64,')[-1]
                # decode base64 string to bytes
                img_bytes = base64.b64decode(base64_data)
            else:
                # if no data URL scheme, just decode
                img_bytes = base64.b64decode(source_img)
            
            source_img = Image.open(io.BytesIO(img_bytes))
            
        target_imgs = [cv2.cvtColor(np.array(target_img), cv2.COLOR_RGB2BGR) for target_img in target_imgs]

        if source_img is not None:

            source_img = cv2.cvtColor(np.array(source_img), cv2.COLOR_RGB2BGR)

            source_image_md5hash = get_image_md5hash(source_img)

            if SOURCE_IMAGE_HASH is None:
                SOURCE_IMAGE_HASH = source_image_md5hash
                source_image_same = False
            else:
                source_image_same = True if SOURCE_IMAGE_HASH == source_image_md5hash else False
                if not source_image_same:
                    SOURCE_IMAGE_HASH = source_image_md5hash

            logger.info("Source Image MD5 Hash = %s", SOURCE_IMAGE_HASH)
            logger.info("Source Image the Same? %s", source_image_same)

            if SOURCE_FACES is None or not source_image_same:
                logger.status("Analyzing Source Image...")
                source_faces = analyze_faces(source_img)
                SOURCE_FACES = source_faces
            elif source_image_same:
                logger.status("Using Hashed Source Face(s) Model...")
                source_faces = SOURCE_FACES

        elif face_model is not None:

            source_faces_index = [0]
            logger.status("Using Loaded Source Face Model...")
            source_face_model = [face_model]
            source_faces = source_face_model

        else:
            logger.error("Cannot detect any Source")

        if source_faces is not None:

            target_faces = []
            with _reactor_progress(len(target_imgs), "Analyze target frames") as analyze_progress:
                for i, target_img in enumerate(target_imgs):
                    if state.interrupted or model_management.processing_interrupted():
                        logger.status("Interrupted by User")
                        break

                    target_image_md5hash = get_image_md5hash(target_img)
                    if len(TARGET_IMAGE_LIST_HASH) == 0:
                        TARGET_IMAGE_LIST_HASH = [target_image_md5hash]
                        target_image_same = False
                    elif len(TARGET_IMAGE_LIST_HASH) == i:
                        TARGET_IMAGE_LIST_HASH.append(target_image_md5hash)
                        target_image_same = False
                    else:
                        target_image_same = True if TARGET_IMAGE_LIST_HASH[i] == target_image_md5hash else False
                        if not target_image_same:
                            TARGET_IMAGE_LIST_HASH[i] = target_image_md5hash

                    logger.info("(Image %s) Target Image MD5 Hash = %s", i, TARGET_IMAGE_LIST_HASH[i])
                    logger.info("(Image %s) Target Image the Same? %s", i, target_image_same)

                    if len(TARGET_FACES_LIST) == 0:
                        target_face = analyze_faces(target_img)
                        TARGET_FACES_LIST = [target_face]
                    elif len(TARGET_FACES_LIST) == i and not target_image_same:
                        target_face = analyze_faces(target_img)
                        TARGET_FACES_LIST.append(target_face)
                    elif len(TARGET_FACES_LIST) != i and not target_image_same:
                        target_face = analyze_faces(target_img)
                        TARGET_FACES_LIST[i] = target_face
                    elif target_image_same:
                        target_face = TARGET_FACES_LIST[i]

                    if target_face is not None:
                        target_faces.append(target_face)
                    analyze_progress.update(1)

            # No use in trying to swap faces if no faces are found, enhancement
            if len(target_faces) == 0:
                logger.status("Cannot detect any Target, skipping swapping...")
                return result_images

            if source_img is not None:
                # separated management of wrong_gender between source and target, enhancement
                source_face, src_wrong_gender = get_face_single(source_img, source_faces, face_index=source_faces_index[0], gender_source=gender_source, order=faces_order[1])
            else:
                # source_face = sorted(source_faces, key=lambda x: x.bbox[0])[source_faces_index[0]]
                source_face = sorted(source_faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]), reverse = True)[source_faces_index[0]]
                src_wrong_gender = 0

            if len(source_faces_index) != 0 and len(source_faces_index) != 1 and len(source_faces_index) != len(faces_index):
                logger.status(f'Source Faces must have no entries (default=0), one entry, or same number of entries as target faces.')
            elif source_face is not None:
                results = target_imgs
                model_path = resolve_swap_model_path(model)
                face_swapper = getFaceSwapModel(model_path)

                source_face_idx = 0

                if face_boost_enabled:
                    logger.status("Face Boost is enabled")

                swap_total = len(faces_index) * len(results)
                with _reactor_progress(swap_total, "Swap frames") as swap_progress:
                    for face_num in faces_index:
                        # No use in trying to swap faces if no further faces are found, enhancement
                        if face_num >= len(target_faces):
                            logger.status("Checked all existing target faces, skipping swapping...")
                            break

                        if len(source_faces_index) > 1 and source_face_idx > 0:
                            source_face, src_wrong_gender = get_face_single(source_img, source_faces, face_index=source_faces_index[source_face_idx], gender_source=gender_source, order=faces_order[1])
                        source_face_idx += 1

                        if source_face is not None and src_wrong_gender == 0:
                            # Reading results to make current face swap on a previous face result
                            for i, (target_img, target_face) in enumerate(zip(results, target_faces)):
                                try:
                                    target_face_single, wrong_gender = get_face_single(target_img, target_face, face_index=face_num, gender_target=gender_target, order=faces_order[0])
                                    if target_face_single is not None and wrong_gender == 0:
                                        result = target_img
                                        if face_boost_enabled:
                                            bgr_fake, M = face_swapper.get(target_img, target_face_single, source_face, paste_back=False)
                                            bgr_fake, scale = restorer.get_restored_face(bgr_fake, face_restore_model, face_restore_visibility, codeformer_weight, interpolation)
                                            M *= scale
                                            result = swapper.in_swap(target_img, bgr_fake, M)
                                        else:
                                            # logger.status(f"Swapping as-is")
                                            result = face_swapper.get(target_img, target_face_single, source_face)
                                        results[i] = result
                                    elif wrong_gender == 1:
                                        wrong_gender = 0
                                        logger.status("Wrong target gender detected")
                                        continue
                                    else:
                                        logger.status(f"No target face found for {face_num}")
                                finally:
                                    swap_progress.update(1)
                        elif src_wrong_gender == 1:
                            src_wrong_gender = 0
                            logger.status("Wrong source gender detected")
                            continue
                        else:
                            logger.status(f"No source face found for face number {source_face_idx}.")

                result_images = [Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB)) for result in results]

            else:
                logger.status("No source face(s) in the provided Index")
        else:
            logger.status("No source face(s) found")
    return result_images
