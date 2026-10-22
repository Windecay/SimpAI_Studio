import importlib
import importlib.util
import json
import mimetypes
import os
import re
import sys
import threading
import time
import types
from pathlib import Path

from PIL import Image

import modules.canvas_workbench_assets as canvas_workbench_assets
import shared


SHARP_REPO_ID = "apple/Sharp"
SHARP_FILENAME = "sharp_2572gikvuh.pt"
SHARP_EXPECTED_SIZE = 2809738232
SHARP_SHA256 = "94211a75198c47f61fca7d739ba08a215418d8d398d48fddf023baccc24f073d"
SHARP_PACKAGE_NAME = "simpai_comfyui_sharp_nodes"
SHARP_GAUSSIAN_DEFAULT_PRECISION = "fp32"
SHARP_GAUSSIAN_FALLBACK_PRECISION = "fp32"
GAUSSIAN_VIEWER_VERSION = "gaussian-default-scale-20260530-2"
_SHARP_PREDICT_LOCK = threading.Lock()


def _repo_root():
    return Path(__file__).resolve().parents[2]


def _comfy_root():
    return _repo_root() / "comfy"


def _sharp_root():
    return _comfy_root() / "custom_nodes" / "ComfyUI-Sharp"


def _sharp_nodes_root():
    return _sharp_root() / "nodes"


def _viewer_root():
    return _comfy_root() / "custom_nodes" / "comfyui_GaussianViewer"


def _viewer_web_root():
    return _viewer_root() / "web"


def _candidate_model_paths():
    candidates = []
    parents = list(_repo_root().parents)
    if len(parents) > 1:
        candidates.append(parents[1] / "SimpleModels" / "sharp" / SHARP_FILENAME)
    try:
        _ensure_comfy_import_path()
        import folder_paths
        models_dir = getattr(folder_paths, "models_dir", None)
        if models_dir:
            candidates.append(Path(models_dir) / "sharp" / SHARP_FILENAME)
    except Exception:
        pass
    candidates.extend([
        _repo_root() / "models" / "sharp" / SHARP_FILENAME,
        _comfy_root() / "models" / "sharp" / SHARP_FILENAME,
    ])
    seen = set()
    out = []
    for path in candidates:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        out.append(path)
    return out


def _model_path():
    candidates = _candidate_model_paths()
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return candidates[0] if candidates else _comfy_root() / "models" / "sharp" / SHARP_FILENAME


def _ensure_comfy_import_path():
    for path in (_repo_root(), _comfy_root()):
        text = str(path)
        if text not in sys.path:
            sys.path.insert(0, text)


def _ensure_sharp_package():
    _ensure_comfy_import_path()
    nodes_root = _sharp_nodes_root()
    if not nodes_root.is_dir():
        raise FileNotFoundError(f"ComfyUI-Sharp nodes folder not found: {nodes_root}")
    package = sys.modules.get(SHARP_PACKAGE_NAME)
    if package is None:
        package = types.ModuleType(SHARP_PACKAGE_NAME)
        package.__path__ = [str(nodes_root)]
        package.__package__ = SHARP_PACKAGE_NAME
        sys.modules[SHARP_PACKAGE_NAME] = package
    return package


def _load_sharp_modules():
    _ensure_sharp_package()
    load_model = importlib.import_module(f"{SHARP_PACKAGE_NAME}.load_model")
    predict = importlib.import_module(f"{SHARP_PACKAGE_NAME}.predict")
    return load_model, predict


def _safe_relpath(value):
    text = str(value or "").strip().replace("\\", "/")
    text = text.lstrip("/")
    if not text or "\0" in text:
        return ""
    parts = [part for part in text.split("/") if part not in ("", ".")]
    if any(part == ".." for part in parts):
        return ""
    return "/".join(parts)


def _safe_output_prefix(value, fallback="sharp_canvas"):
    text = str(value or "").strip() or fallback
    text = re.sub(r"[^a-zA-Z0-9_.-]+", "_", text).strip("._-")
    return (text or fallback)[:64]


def _gaussian_temp_output_dir(project_id, node_id):
    base = str(getattr(shared, "temp_path", "") or "").strip()
    if not base:
        base = str(_repo_root() / "temp")
    path = (
        Path(base)
        / "gaussian_studio"
        / "ply"
        / _safe_output_prefix(project_id, "default")
        / _safe_output_prefix(node_id, "gaussian_studio")
    )
    path.mkdir(parents=True, exist_ok=True)
    return path


def _jsonable(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    try:
        import torch
        if isinstance(value, torch.Tensor):
            return value.detach().cpu().tolist()
    except Exception:
        pass
    try:
        import numpy as np
        if isinstance(value, np.ndarray):
            return value.tolist()
        if isinstance(value, np.generic):
            return value.item()
    except Exception:
        pass
    try:
        return json.loads(json.dumps(value))
    except Exception:
        return str(value)


def _module_available(name):
    try:
        return importlib.util.find_spec(name) is not None
    except Exception:
        return False


def _file_info(path):
    path = Path(path)
    return {
        "path": str(path),
        "exists": path.is_file(),
        "size": path.stat().st_size if path.is_file() else 0,
    }


def resource_status(payload=None):
    payload = payload if isinstance(payload, dict) else {}
    _ensure_comfy_import_path()
    viewer_files = [
        "viewer_gaussian_v2.html",
        "js/gaussian_preview_v2.js",
        "js/gsplat-bundle.js",
        "js/precise_orbit_controls.js",
    ]
    sharp_files = [
        "nodes/load_model.py",
        "nodes/predict.py",
        "nodes/sharp/__init__.py",
    ]
    dependencies = {
        "torch": _module_available("torch"),
        "numpy": _module_available("numpy"),
        "PIL": _module_available("PIL"),
        "huggingface_hub": _module_available("huggingface_hub"),
        "comfy_api": _module_available("comfy_api"),
        "folder_paths": _module_available("folder_paths"),
    }
    viewer_ok = _viewer_web_root().is_dir() and all((_viewer_web_root() / rel).is_file() for rel in viewer_files)
    sharp_ok = _sharp_root().is_dir() and all((_sharp_root() / rel).is_file() for rel in sharp_files)
    model = _file_info(_model_path())
    return {
        "ok": bool(viewer_ok and sharp_ok),
        "available": {
            "sharp_nodes": sharp_ok,
            "gaussian_viewer": viewer_ok,
            "dependencies": dependencies,
        },
        "sharp": {
            "repo_id": SHARP_REPO_ID,
            "filename": SHARP_FILENAME,
            "root": str(_sharp_root()),
        },
        "sharp_model": {
            "ready": bool(model["exists"]),
            "expected_path": f"sharp/{SHARP_FILENAME}",
            "expected_size": SHARP_EXPECTED_SIZE,
            "sha256": SHARP_SHA256,
            "download_package": "gaussian_studio_sharp_package",
            "candidates": [str(path) for path in _candidate_model_paths()],
            **model,
        },
        "viewer": {
            "root": str(_viewer_root()),
            "web_root": str(_viewer_web_root()),
            "entry": "viewer_gaussian_v2.html",
        },
        "vendor_base_url": "/gaussian-studio/vendor/",
        "canvas_node": "gaussian_studio",
        "requested_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "options": payload,
    }


def vendor_asset(payload):
    payload = payload if isinstance(payload, dict) else {}
    rel = _safe_relpath(payload.get("path"))
    if not rel:
        return {"ok": False, "error": "invalid vendor asset path"}
    root = _viewer_web_root().resolve()
    candidate = (root / rel).resolve()
    try:
        if os.path.commonpath([str(root), str(candidate)]) != str(root):
            return {"ok": False, "error": "invalid vendor asset path"}
    except Exception:
        return {"ok": False, "error": "invalid vendor asset path"}
    if not candidate.is_file():
        return {"ok": False, "error": "vendor asset not found", "path": str(candidate)}
    return {
        "ok": True,
        "path": str(candidate),
        "media_type": mimetypes.guess_type(str(candidate))[0] or "application/octet-stream",
    }


def _source_from_payload(payload):
    source = payload.get("asset_source") if isinstance(payload.get("asset_source"), dict) else None
    if source:
        return source
    asset = payload.get("reference_asset") if isinstance(payload.get("reference_asset"), dict) else None
    if asset:
        return {
            "node_id": str(payload.get("node_id") or ""),
            "type": "gaussian_reference",
            "asset": asset,
            "source": {"kind": "gaussian_studio_reference"},
        }
    data_url = str(payload.get("reference_data_url") or payload.get("data_url") or "").strip()
    if data_url:
        return {
            "node_id": str(payload.get("node_id") or ""),
            "type": "gaussian_reference",
            "asset": {
                "data_url": data_url,
                "mime": payload.get("mime") or "image/png",
                "width": payload.get("reference_width"),
                "height": payload.get("reference_height"),
            },
            "source": {"kind": "browser_upload"},
        }
    return None


def _materialize_reference(payload, state_params):
    project_id = str(payload.get("project_id") or "default")
    source = _source_from_payload(payload)
    if not source:
        return None, {"ok": False, "error": "No reference image source was provided."}
    materialized = canvas_workbench_assets.materialize_node_asset(project_id, state_params, source)
    if not materialized.get("ok"):
        return None, materialized
    asset_ref = materialized.get("asset_ref") if isinstance(materialized.get("asset_ref"), dict) else {}
    path = str(asset_ref.get("path") or asset_ref.get("output_path") or asset_ref.get("original_output_path") or "").strip()
    if not path or not os.path.exists(path):
        return None, {
            "ok": False,
            "error": "Reference image could not be materialized to a local file.",
            "asset_ref": asset_ref,
        }
    return path, {"ok": True, "asset_ref": asset_ref}


def _image_tensor_from_path(path):
    import numpy as np
    import torch

    with Image.open(path) as image:
        image = image.convert("RGB")
        array = np.asarray(image, dtype=np.float32) / 255.0
    if array.ndim != 3 or array.shape[2] != 3:
        raise ValueError("Reference image must be RGB-compatible.")
    return torch.from_numpy(array).unsqueeze(0)


def _sharp_requested_precision_from_payload(payload):
    precision = str(payload.get("precision") or "").strip().lower()
    if precision not in ("auto", "bf16", "fp16", "fp32"):
        return "auto"
    return precision


def _sharp_precision_from_payload(payload):
    import torch

    precision = _sharp_requested_precision_from_payload(payload)
    if precision == "auto":
        precision = SHARP_GAUSSIAN_DEFAULT_PRECISION if torch.cuda.is_available() else "auto"
    return precision


def _sharp_should_retry_fp32(err):
    details = f"{type(err).__name__}: {err}".lower()
    return any(
        marker in details
        for marker in (
            "low precision dtypes not supported",
            "input type",
            "weight type",
            "should be the same",
            "expected scalar type",
        )
    )


def _reset_sharp_encode_cache(predict):
    cache = getattr(predict, "_encode_cache", None)
    if not isinstance(cache, dict):
        return
    for key in list(cache.keys()):
        cache[key] = None


def _run_sharp_predict(load_model, predict, precision, image_tensor, focal_length_mm, output_prefix, temp_output_dir):
    model_output = load_model.LoadSharpModel.execute(precision=precision)
    model_config = model_output[0]
    with _SHARP_PREDICT_LOCK:
        previous_output_dir = getattr(predict, "OUTPUT_DIR", None)
        predict.OUTPUT_DIR = str(temp_output_dir)
        try:
            return predict.SharpPredict.execute(
                model_config,
                image_tensor,
                focal_length_mm=focal_length_mm,
                output_prefix=output_prefix,
            )
        finally:
            if previous_output_dir is not None:
                predict.OUTPUT_DIR = previous_output_dir


def _sharp_prediction_with_fallback(load_model, predict, precision, image_tensor, focal_length_mm, output_prefix, temp_output_dir):
    try:
        result = _run_sharp_predict(load_model, predict, precision, image_tensor, focal_length_mm, output_prefix, temp_output_dir)
        return result, precision, None
    except Exception as err:
        if precision == SHARP_GAUSSIAN_FALLBACK_PRECISION or not _sharp_should_retry_fp32(err):
            raise
        _reset_sharp_encode_cache(predict)
        fallback_error = f"{type(err).__name__}: {err}"
        result = _run_sharp_predict(
            load_model,
            predict,
            SHARP_GAUSSIAN_FALLBACK_PRECISION,
            image_tensor,
            focal_length_mm,
            output_prefix,
            temp_output_dir,
        )
        return result, SHARP_GAUSSIAN_FALLBACK_PRECISION, fallback_error


def predict_from_reference(payload, state_params=None):
    payload = payload if isinstance(payload, dict) else {}
    state_params = state_params if isinstance(state_params, dict) else {}
    project_id = str(payload.get("project_id") or "default")
    node_id = str(payload.get("node_id") or "gaussian_studio")
    reference_path, materialized = _materialize_reference(payload, state_params)
    if not reference_path:
        return materialized

    try:
        load_model, predict = _load_sharp_modules()
        image_tensor = _image_tensor_from_path(reference_path)
        requested_precision = _sharp_requested_precision_from_payload(payload)
        precision = _sharp_precision_from_payload(payload)
        focal_length_mm = float(payload.get("focal_length_mm") or 30.0)
        output_prefix = _safe_output_prefix(payload.get("output_prefix") or f"sharp_{node_id}")
        temp_output_dir = _gaussian_temp_output_dir(project_id, node_id)
        result, actual_precision, fallback_error = _sharp_prediction_with_fallback(
            load_model,
            predict,
            precision,
            image_tensor,
            focal_length_mm,
            output_prefix,
            temp_output_dir,
        )
        ply_path = str(result[0])
        extrinsics = _jsonable(result[1] if len(result.args) > 1 else None)
        intrinsics = _jsonable(result[2] if len(result.args) > 2 else None)
    except Exception as err:
        return {
            "ok": False,
            "error": "SHARP prediction failed.",
            "details": f"{type(err).__name__}: {err}",
            "reference_asset": materialized.get("asset_ref"),
        }

    try:
        ply_asset = canvas_workbench_assets.register_existing_file_asset(
            ply_path,
            project_id,
            state_params,
            node_id=node_id,
            role="gaussian_ply",
            metadata={
                "mime": "application/octet-stream",
                "generation_metadata": {
                    "tool": "SHARP",
                    "repo_id": SHARP_REPO_ID,
                    "focal_length_mm": focal_length_mm,
                    "precision": actual_precision,
                    "requested_precision": requested_precision,
                    "precision_fallback_error": fallback_error or "",
                    "reference_path": reference_path,
                },
            },
            copy_to_assets=False,
        )
    except OSError as error:
        ply_asset = {"copy_error": f"{type(error).__name__}: {error}"}
    if not isinstance(ply_asset, dict) or not ply_asset or ply_asset.get("copy_error"):
        error = canvas_workbench_assets.output_delivery_error(state_params)
        return {"ok": False, "error": error["message"], "output_error": error,
                "ply_path": ply_path, "reference_asset": materialized.get("asset_ref")}
    return {
        "ok": True,
        "ply_path": ply_path,
        "ply_asset": ply_asset,
        "reference_asset": materialized.get("asset_ref"),
        "extrinsics": extrinsics,
        "intrinsics": intrinsics,
        "viewer_url": f"/gaussian-studio/vendor/viewer_gaussian_v2.html?v={GAUSSIAN_VIEWER_VERSION}",
        "message": "SHARP PLY generated with fp32 fallback." if fallback_error else "SHARP PLY generated.",
        "precision": actual_precision,
        "requested_precision": requested_precision,
        "precision_fallback_error": fallback_error or "",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def save_canvas_export(payload, state_params=None):
    payload = payload if isinstance(payload, dict) else {}
    state_params = state_params if isinstance(state_params, dict) else {}
    project_id = str(payload.get("project_id") or "default")
    node_id = str(payload.get("node_id") or "gaussian_studio")
    data_url = str(payload.get("image_data_url") or payload.get("data_url") or "").strip()
    if not data_url:
        return {"ok": False, "error": "No rendered image was provided."}
    metadata = {
        "mime": "image/png",
        "width": payload.get("width"),
        "height": payload.get("height"),
        "generation_metadata": {
            "tool": "Gaussian Studio",
            "camera_state": payload.get("camera_state") if isinstance(payload.get("camera_state"), dict) else {},
            "extrinsics": payload.get("extrinsics"),
            "intrinsics": payload.get("intrinsics"),
            "ply_asset_id": (payload.get("ply_asset") or {}).get("asset_id") if isinstance(payload.get("ply_asset"), dict) else "",
            "ply_path": payload.get("ply_path") or "",
            "reference_asset_id": (payload.get("reference_asset") or {}).get("asset_id") if isinstance(payload.get("reference_asset"), dict) else "",
            "reference_signature": payload.get("reference_signature") or "",
            "reference_capture_signature": payload.get("reference_capture_signature") or "",
            "reference_data_signature": payload.get("reference_data_signature") or "",
        },
    }
    try:
        asset_ref = canvas_workbench_assets.save_data_url_asset(
            data_url,
            project_id,
            state_params,
            node_id=node_id,
            role="gaussian_render",
            metadata=metadata,
        )
    except Exception as err:
        return {"ok": False, "error": "Gaussian render export failed.", "details": f"{type(err).__name__}: {err}"}
    if not asset_ref:
        return {"ok": False, "error": "Gaussian render export produced no asset."}
    return {
        "ok": True,
        "asset_ref": asset_ref,
        "render_asset": asset_ref,
        "gaussian_state": {
            "ply_asset": payload.get("ply_asset") if isinstance(payload.get("ply_asset"), dict) else None,
            "ply_path": payload.get("ply_path") or "",
            "reference_asset": payload.get("reference_asset") if isinstance(payload.get("reference_asset"), dict) else None,
            "reference_signature": payload.get("reference_signature") or "",
            "reference_capture_signature": payload.get("reference_capture_signature") or "",
            "reference_data_signature": payload.get("reference_data_signature") or "",
            "camera_state": payload.get("camera_state") if isinstance(payload.get("camera_state"), dict) else {},
            "extrinsics": payload.get("extrinsics"),
            "intrinsics": payload.get("intrinsics"),
            "params": payload.get("params") if isinstance(payload.get("params"), dict) else {},
        },
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
