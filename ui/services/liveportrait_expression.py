import base64
import hashlib
import importlib
import importlib.util
import io
import json
import os
import re
import sys
import threading
import time
import types
from pathlib import Path
from urllib.parse import unquote

import modules.canvas_workbench_assets as canvas_workbench_assets


LIVEPORTRAIT_PACKAGE_NAME = "simpai_comfyui_advanced_liveportrait"
DATA_URL_RE = re.compile(r"^data:(?P<mime>[^;,]+)?(?:;[^,]*)?;base64,(?P<data>.*)$", re.DOTALL)
_PREVIEW_LOCK = threading.Lock()
_EXPRESSION_EDITOR = None


MODEL_FILES = (
    ("liveportrait", "appearance_feature_extractor.safetensors", 3361936),
    ("liveportrait", "motion_extractor.safetensors", 112496256),
    ("liveportrait", "warping_module.safetensors", 182158564),
    ("liveportrait", "spade_generator.safetensors", 221771768),
    ("liveportrait", "stitching_retargeting_module.safetensors", 911836),
    ("ultralytics", "face_yolov8n.pt", 6230011),
)


def _repo_root():
    return Path(__file__).resolve().parents[2]


def _comfy_root():
    return _repo_root() / "comfy"


def _advanced_liveportrait_root():
    return _comfy_root() / "custom_nodes" / "ComfyUI-AdvancedLivePortrait"


def _parser_node_path():
    return _comfy_root() / "custom_nodes" / "SimpAINodes" / "SimpAILivePortraitExpression.py"


def _resolve_path(value):
    text = str(value or "").strip()
    if not text:
        return None
    path = Path(os.path.expandvars(os.path.expanduser(text)))
    if not path.is_absolute():
        path = _repo_root() / path
    return path.resolve()


def _dedupe_paths(paths):
    seen = set()
    out = []
    for path in paths:
        if path is None:
            continue
        key = os.path.normcase(os.path.normpath(str(path)))
        if key in seen:
            continue
        seen.add(key)
        out.append(Path(path))
    return out


def _category_dirs(category):
    paths = []
    try:
        import modules.config as config

        for value in (getattr(config, "model_cata_map", {}) or {}).get(category, []) or []:
            resolved = _resolve_path(value)
            if resolved is not None:
                paths.append(resolved)
        attr = f"paths_{category.replace('-', '_')}"
        for value in getattr(config, attr, []) or []:
            resolved = _resolve_path(value)
            if resolved is not None:
                paths.append(resolved)
        models_root = _resolve_path(getattr(config, "path_models_root", "") or config.get_path_models_root())
        if models_root is not None:
            folder = "ultralytics" if category == "ultralytics" else category
            paths.append(models_root / folder)
    except Exception:
        pass

    if category == "liveportrait":
        paths.extend([
            _repo_root() / "models" / "liveportrait",
            _comfy_root() / "models" / "liveportrait",
        ])
    elif category == "ultralytics":
        paths.extend([
            _repo_root() / "models" / "ultralytics",
            _comfy_root() / "models" / "ultralytics",
        ])
    return _dedupe_paths(paths)


def _file_info(category, filename, expected_size=0):
    candidates = []
    for directory in _category_dirs(category):
        path = directory / filename
        exists = path.is_file()
        size = path.stat().st_size if exists else 0
        ok = exists and (not expected_size or size == int(expected_size))
        candidates.append({
            "category": category,
            "filename": filename,
            "path": str(path),
            "exists": exists,
            "size": size,
            "expected_size": int(expected_size or 0),
            "ok": ok,
            "size_mismatch": exists and bool(expected_size) and size != int(expected_size),
        })
    if not candidates:
        fallback = _repo_root() / "models" / category / filename
        candidates.append({
            "category": category,
            "filename": filename,
            "path": str(fallback),
            "exists": False,
            "size": 0,
            "expected_size": int(expected_size or 0),
            "ok": False,
            "size_mismatch": False,
        })
    best = next((item for item in candidates if item["ok"]), None)
    if best is None:
        best = next((item for item in candidates if item["exists"]), candidates[0])
    best = dict(best)
    best["candidates"] = candidates
    return best


def _category_ready_dir(category):
    specs = [(filename, size) for current, filename, size in MODEL_FILES if current == category]
    for directory in _category_dirs(category):
        ready = True
        for filename, expected_size in specs:
            path = directory / filename
            if not path.is_file():
                ready = False
                break
            if expected_size and path.stat().st_size != int(expected_size):
                ready = False
                break
        if ready:
            return directory
    return None


def _module_available(name):
    try:
        return importlib.util.find_spec(name) is not None
    except Exception:
        return False


def _load_params_module():
    spec = importlib.util.spec_from_file_location("_simpai_liveportrait_expression_params", _parser_node_path())
    if spec is None or spec.loader is None:
        raise RuntimeError("LivePortraitExpressionParams node is unavailable.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_expression_state(value):
    return _load_params_module().parse_liveportrait_expression_state(value)


def resource_status(payload=None):
    files = [_file_info(category, filename, size) for category, filename, size in MODEL_FILES]
    missing = [item for item in files if not item.get("ok")]
    node_root = _advanced_liveportrait_root()
    node_files = [
        node_root / "nodes.py",
        node_root / "LivePortrait" / "config" / "models.yaml",
        node_root / "LivePortrait" / "utils" / "resources" / "mask_template.png",
    ]
    node_missing = [str(path) for path in node_files if not path.is_file()]
    dependencies = {
        "torch": _module_available("torch"),
        "numpy": _module_available("numpy"),
        "PIL": _module_available("PIL"),
        "cv2": _module_available("cv2"),
        "yaml": _module_available("yaml"),
        "dill": _module_available("dill"),
        "ultralytics": _module_available("ultralytics"),
        "folder_paths": _module_available("folder_paths") or (_comfy_root() / "folder_paths.py").is_file(),
    }
    dependency_missing = [name for name, ok in dependencies.items() if not ok]
    ready = not missing and not node_missing and not dependency_missing
    return {
        "ok": True,
        "ready": ready,
        "auto_download": False,
        "files": files,
        "missing": missing,
        "node_root": str(node_root),
        "node_missing": node_missing,
        "dependencies": dependencies,
        "dependency_missing": dependency_missing,
        "message": "ready" if ready else "resource_missing",
    }


def _ensure_comfy_import_path():
    for path in (_repo_root(), _comfy_root()):
        text = str(path)
        if text not in sys.path:
            sys.path.insert(0, text)


def _register_model_dirs():
    _ensure_comfy_import_path()
    import folder_paths

    for category in ("liveportrait", "ultralytics"):
        for path in _category_dirs(category):
            if path.is_dir():
                folder_paths.add_model_folder_path(category, str(path))


def _configure_engine(nodes, status):
    paths = {
        (item["category"], item["filename"]): item["path"]
        for item in status.get("files", []) if item.get("ok")
    }
    return nodes.g_engine.configure_model_paths(paths, allow_download=False)


def _load_advanced_liveportrait_nodes():
    _ensure_comfy_import_path()
    root = _advanced_liveportrait_root()
    if not root.is_dir():
        raise FileNotFoundError(f"ComfyUI-AdvancedLivePortrait was not found: {root}")
    package = sys.modules.get(LIVEPORTRAIT_PACKAGE_NAME)
    if package is None:
        package = types.ModuleType(LIVEPORTRAIT_PACKAGE_NAME)
        package.__path__ = [str(root)]
        package.__package__ = LIVEPORTRAIT_PACKAGE_NAME
        sys.modules[LIVEPORTRAIT_PACKAGE_NAME] = package
    return importlib.import_module(f"{LIVEPORTRAIT_PACKAGE_NAME}.nodes")


def _value_from_payload(payload, *keys):
    if not isinstance(payload, dict):
        return ""
    for key in keys:
        value = payload.get(key)
        if value:
            return value
    return ""


def _decode_source_to_bytes(value, project_id="default", state_params=None):
    if isinstance(value, dict):
        value = _value_from_payload(value, "image_data_url", "data_url", "path", "url", "preview_url")
    text = str(value or "").strip()
    if not text:
        return b""
    match = DATA_URL_RE.match(text)
    if match:
        return base64.b64decode(match.group("data"))
    if text.startswith("/file="):
        text = unquote(text[len("/file="):])
    path = canvas_workbench_assets.resolve_readable_asset_path(
        {"path": text}, project_id, state_params
    )
    if path:
        return Path(path).read_bytes()
    return b""


def _image_source_to_tensor(value, project_id="default", state_params=None):
    raw = _decode_source_to_bytes(value, project_id, state_params)
    return _image_bytes_to_tensor(raw)


def _image_bytes_to_tensor(raw):
    if not raw:
        return None
    import numpy as np
    import torch
    from PIL import Image

    image = Image.open(io.BytesIO(raw)).convert("RGB")
    array = np.asarray(image).astype(np.float32) / 255.0
    return torch.from_numpy(array).unsqueeze(0)


def _preparation_key(payload, state_params, source, reference, source_bbox, reference_bbox, params, model_signature, engine):
    asset_root, user_did = canvas_workbench_assets._asset_root(payload.get("project_id") or "default", state_params)
    return (
        str(user_did), os.path.normcase(os.path.realpath(asset_root)), str(payload.get("node_id") or ""),
        hashlib.sha256(source).digest(), hashlib.sha256(reference).digest(),
        source_bbox, reference_bbox, params["crop_factor"], model_signature,
        id(engine), id(engine.pipeline),
    )


def _image_source_to_rgb_array(value, project_id="default", state_params=None):
    raw = _decode_source_to_bytes(value, project_id, state_params)
    if not raw:
        return None
    import numpy as np
    from PIL import Image

    image = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.asarray(image), image.width, image.height


def _face_bbox_text(value):
    if isinstance(value, dict):
        try:
            return json.dumps(value, separators=(",", ":"))
        except Exception:
            return ""
    if isinstance(value, (list, tuple)):
        try:
            return json.dumps(list(value), separators=(",", ":"))
        except Exception:
            return ""
    text = str(value or "").strip()
    return text


def _selected_face_bbox(payload, params, payload_key, param_key):
    if isinstance(payload, dict):
        direct = _face_bbox_text(payload.get(payload_key))
        if direct:
            return direct
    if isinstance(params, dict):
        return _face_bbox_text(params.get(param_key))
    return ""


def _face_payload(box, confidence, width, height, index, selected=False):
    x1, y1, x2, y2 = [float(value) for value in box]
    x1, x2 = sorted((max(0.0, min(float(width), x1)), max(0.0, min(float(width), x2))))
    y1, y2 = sorted((max(0.0, min(float(height), y1)), max(0.0, min(float(height), y2))))
    box_w = max(0.0, x2 - x1)
    box_h = max(0.0, y2 - y1)
    normalized = {
        "x": x1 / width if width else 0,
        "y": y1 / height if height else 0,
        "width": box_w / width if width else 0,
        "height": box_h / height if height else 0,
    }
    return {
        "index": index,
        "label": str(index + 1),
        "x": x1,
        "y": y1,
        "width": box_w,
        "height": box_h,
        "confidence": float(confidence or 0),
        "normalized": normalized,
        "bbox": json.dumps(normalized, separators=(",", ":")),
        "selected": bool(selected),
    }


def _tensor_to_data_url(tensor):
    import numpy as np
    from PIL import Image

    if tensor is None:
        return ""
    if hasattr(tensor, "detach"):
        tensor = tensor.detach().cpu().numpy()
    array = np.asarray(tensor)
    if array.ndim == 4:
        array = array[0]
    array = np.clip(array * 255.0, 0, 255).astype(np.uint8)
    image = Image.fromarray(array)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def detect_faces(payload, state_params=None):
    payload = payload if isinstance(payload, dict) else {}
    status = resource_status(payload)
    face_missing = [
        item for item in status.get("files", [])
        if item.get("category") == "ultralytics" and not item.get("ok")
    ]
    if face_missing:
        return {
            "ok": False,
            "error": "Face detector resource is missing.",
            "code": "face_detector_missing",
            "status": status,
            "missing": face_missing,
        }

    image_info = _image_source_to_rgb_array(
        _value_from_payload(payload, "source_image", "source_image_data_url", "image_data_url"),
        payload.get("project_id") or "default", state_params,
    )
    if image_info is None:
        return {"ok": False, "error": "Source image is required.", "code": "source_image_required", "status": status}
    image_rgb, width, height = image_info

    try:
        _register_model_dirs()
        nodes = _load_advanced_liveportrait_nodes()
        with _PREVIEW_LOCK:
            _configure_engine(nodes, status)
            model = nodes.g_engine.get_detect_model()
            pred = model(image_rgb, conf=0.7, device="")
        boxes = pred[0].boxes.xyxy.cpu().numpy() if pred and pred[0].boxes is not None else []
        confs = pred[0].boxes.conf.cpu().numpy() if pred and pred[0].boxes is not None and pred[0].boxes.conf is not None else []
    except Exception as err:
        return {
            "ok": False,
            "error": "Face detection failed.",
            "details": f"{type(err).__name__}: {err}",
            "code": "face_detection_failed",
            "status": status,
        }

    raw_faces = []
    for idx, box in enumerate(boxes):
        x1, y1, x2, y2 = [float(value) for value in box]
        if x2 - x1 < 8 or y2 - y1 < 8:
            continue
        confidence = float(confs[idx]) if idx < len(confs) else 0.0
        raw_faces.append((box, confidence))
    raw_faces.sort(key=lambda item: ((float(item[0][0]) + float(item[0][2])) / 2.0, float(item[0][1])))
    default_index = -1
    if raw_faces:
        center_x = float(width) / 2.0
        default_candidates = [
            item_index for item_index, item in enumerate(raw_faces)
            if float(item[0][2]) - float(item[0][0]) >= 30
        ] or list(range(len(raw_faces)))
        default_index = min(
            default_candidates,
            key=lambda item_index: abs(center_x - ((float(raw_faces[item_index][0][0]) + float(raw_faces[item_index][0][2])) / 2.0)),
        )
    faces = [
        _face_payload(box, confidence, width, height, index, selected=(index == default_index))
        for index, (box, confidence) in enumerate(raw_faces)
    ]
    return {
        "ok": True,
        "faces": faces,
        "default_index": default_index,
        "width": int(width),
        "height": int(height),
        "status": status,
    }


def _render_expression(payload, state_params=None):
    global _EXPRESSION_EDITOR

    status = resource_status(payload)
    if not status.get("ready"):
        with _PREVIEW_LOCK:
            _EXPRESSION_EDITOR = None
        return {
            "ok": False,
            "error": "LivePortrait Expression resources are missing.",
            "code": "resource_missing",
            "status": status,
        }

    expression_state = _value_from_payload(payload, "expression_state", "state", "params_json")
    if not expression_state and isinstance(payload, dict) and isinstance(payload.get("params"), dict):
        expression_state = json.dumps({"params": payload.get("params")})
    params = parse_expression_state(expression_state)
    project_id = payload.get("project_id") or "default"
    source_bytes = _decode_source_to_bytes(
        _value_from_payload(payload, "source_image", "source_image_data_url", "image_data_url"),
        project_id, state_params,
    )
    if not source_bytes:
        return {
            "ok": False,
            "error": "Source image is required.",
            "code": "source_image_required",
            "status": status,
            "params": params,
        }
    reference_bytes = _decode_source_to_bytes(
        _value_from_payload(payload, "reference_image", "reference_image_data_url", "sample_image"),
        project_id, state_params,
    )
    source_face_bbox = _selected_face_bbox(payload, params, "source_face_bbox", "source_face_bbox")
    reference_face_bbox = _selected_face_bbox(payload, params, "reference_face_bbox", "reference_face_bbox")

    _register_model_dirs()
    nodes = _load_advanced_liveportrait_nodes()
    with _PREVIEW_LOCK:
        model_signature = _configure_engine(nodes, status)
        key = _preparation_key(payload, state_params, source_bytes, reference_bytes,
                               source_face_bbox, reference_face_bbox, params, model_signature, nodes.g_engine)
        if _EXPRESSION_EDITOR is None or getattr(_EXPRESSION_EDITOR, "_simpai_preparation_key", None) != key:
            _EXPRESSION_EDITOR = nodes.ExpressionEditor()
            source_tensor = _image_bytes_to_tensor(source_bytes)
            reference_tensor = _image_bytes_to_tensor(reference_bytes)
        else:
            source_tensor = _EXPRESSION_EDITOR.src_image
            reference_tensor = _EXPRESSION_EDITOR.sample_image
        try:
            result = _EXPRESSION_EDITOR.run(
                params["rotate_pitch"],
                params["rotate_yaw"],
                params["rotate_roll"],
                params["blink"],
                params["eyebrow"],
                params["wink"],
                params["pupil_x"],
                params["pupil_y"],
                params["aaa"],
                params["eee"],
                params["woo"],
                params["smile"],
                params["src_ratio"],
                params["sample_ratio"],
                params["sample_parts"],
                params["crop_factor"],
                src_image=source_tensor,
                sample_image=reference_tensor,
                src_face_bbox=source_face_bbox,
                sample_face_bbox=reference_face_bbox,
            )
            values = result.get("result") if isinstance(result, dict) else result
            if isinstance(values, (tuple, list)) and values and values[0] is not None:
                _EXPRESSION_EDITOR._simpai_preparation_key = _preparation_key(
                    payload, state_params, source_bytes, reference_bytes, source_face_bbox,
                    reference_face_bbox, params, model_signature, nodes.g_engine,
                )
            else:
                _EXPRESSION_EDITOR = None
        except BaseException:
            _EXPRESSION_EDITOR = None
            raise

    output_tensor = None
    ui_images = []
    if isinstance(result, dict):
        values = result.get("result") or ()
        if values:
            output_tensor = values[0]
        ui_images = ((result.get("ui") or {}).get("images") or [])
    elif isinstance(result, (tuple, list)) and result:
        output_tensor = result[0]
    image_data_url = _tensor_to_data_url(output_tensor)
    if not image_data_url:
        return {
            "ok": False,
            "error": "Expression preview did not return an image.",
            "code": "empty_preview",
            "status": status,
            "params": params,
            "ui_images": ui_images,
        }
    return {
        "ok": True,
        "image_data_url": image_data_url,
        "expression_image": {"data_url": image_data_url},
        "params": params,
        "source_face_bbox": source_face_bbox,
        "reference_face_bbox": reference_face_bbox,
        "status": status,
        "ui_images": ui_images,
    }


def preview(payload, state_params=None):
    try:
        return _render_expression(payload if isinstance(payload, dict) else {}, state_params)
    except Exception as exc:
        return {"ok": False, "error": str(exc), "code": "preview_error", "status": resource_status(payload)}


def export_image(payload, state_params=None):
    payload = payload if isinstance(payload, dict) else {}
    state_params = state_params if isinstance(state_params, dict) else {}
    data_url = str(payload.get("image_data_url") or payload.get("data_url") or "").strip()
    rendered = {}
    if data_url.startswith("data:image/"):
        params = payload.get("params") if isinstance(payload.get("params"), dict) else parse_expression_state(_value_from_payload(payload, "expression_state", "state", "params_json"))
    else:
        rendered = preview(payload, state_params)
        if not rendered.get("ok"):
            return rendered
        data_url = str(rendered.get("image_data_url") or (rendered.get("expression_image") or {}).get("data_url") or "").strip()
        params = rendered.get("params") if isinstance(rendered.get("params"), dict) else {}
    if not data_url.startswith("data:image/"):
        return {"ok": False, "error": "LivePortrait Expression export requires an image data URL."}

    project_id = str(payload.get("project_id") or "default")
    node_id = str(payload.get("node_id") or "liveportrait_expression")
    source_asset = payload.get("source_asset") if isinstance(payload.get("source_asset"), dict) else None
    reference_asset = payload.get("reference_asset") if isinstance(payload.get("reference_asset"), dict) else None
    metadata = {
        "mime": "image/png",
        "width": payload.get("width") or (payload.get("source_size") or {}).get("width"),
        "height": payload.get("height") or (payload.get("source_size") or {}).get("height"),
        "generation_metadata": {
            "tool": "LivePortrait Exp",
            "params": params,
            "sample_parts": params.get("sample_parts"),
            "source_asset_id": (source_asset or {}).get("asset_id") or "",
            "reference_asset_id": (reference_asset or {}).get("asset_id") or "",
        },
    }
    try:
        asset_ref = canvas_workbench_assets.save_data_url_asset(
            data_url,
            project_id,
            state_params,
            node_id=node_id,
            role="liveportrait_expression",
            metadata=metadata,
        )
    except Exception as err:
        return {"ok": False, "error": "LivePortrait Expression export failed.", "details": f"{type(err).__name__}: {err}"}
    if not asset_ref:
        return {"ok": False, "error": "LivePortrait Expression export produced no asset."}
    return {
        "ok": True,
        "asset_ref": asset_ref,
        "expression_image": asset_ref,
        "params": params,
        "source_asset": source_asset,
        "reference_asset": reference_asset,
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
