import base64
import json
import mimetypes
import os
import re
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import modules.canvas_workbench_assets as canvas_workbench_assets
import shared


CUSTOM_NODE_RELATIVE = Path("comfy") / "custom_nodes" / "ComfyUI_VNCCS_Utils"
POSE_LIBRARY_RELATIVE = CUSTOM_NODE_RELATIVE / "PoseLibrary"
USER_POSE_LIBRARY_CATALOG = "pose_studio/library"
DATA_URL_RE = re.compile(r"^data:(?P<mime>[^;,]+)?(?:;[^,]*)?;base64,(?P<data>.*)$", re.DOTALL)
POSE_STUDIO_CHARACTER_CACHE: Dict[str, Any] = {
    "base_mesh": None,
    "targets": None,
    "skeleton": None,
}
_PERSON_DETECTOR_LOCK = threading.Lock()
_PERSON_DETECTOR_CACHE = {}


def _person_detector_path() -> Path:
    import modules.config as config

    relatives = ("hr16/yolox-onnx/yolox_l.torchscript.pt", "yzd-v/DWPose/yolox_l.onnx")
    candidates = [Path(root) / relative for relative in relatives for root in config.paths_controlnet]
    return next((path for path in candidates if path.is_file()), candidates[-1])


def _detect_people(image_rgb):
    import numpy as np
    import torch

    model_path = _person_detector_path()
    if not model_path.is_file():
        raise FileNotFoundError("Pose Studio person detector is missing. Install the Pose Studio model package (37).")
    with _PERSON_DETECTOR_LOCK:
        key = str(model_path.resolve())
        if _PERSON_DETECTOR_CACHE.get("path") != key:
            if model_path.suffix == ".pt":
                from enhanced.dwpose_torchscript.jit_det import inference_detector
                model = torch.jit.load(key, map_location="cpu").eval()
            else:
                import onnxruntime
                from extras.easy_dwpose.body_estimation.detector import inference_detector
                model = onnxruntime.InferenceSession(key, providers=["CPUExecutionProvider"])
            _PERSON_DETECTOR_CACHE.update(path=key, model=model, infer=inference_detector)
        with torch.no_grad():
            boxes = _PERSON_DETECTOR_CACHE["infer"](_PERSON_DETECTOR_CACHE["model"], image_rgb[:, :, ::-1].copy())
    if boxes is None or len(boxes) == 0:
        raise ValueError("No people detected in the reference image.")
    boxes = np.asarray(boxes, dtype=np.float32).reshape(-1, 4)
    height, width = image_rgb.shape[:2]
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, width)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, height)
    boxes = boxes[np.isfinite(boxes).all(axis=1) & (boxes[:, 2] > boxes[:, 0]) & (boxes[:, 3] > boxes[:, 1])]
    if len(boxes) == 0:
        raise ValueError("No people detected in the reference image.")
    return boxes[np.argsort((boxes[:, 0] + boxes[:, 2]) * 0.5, kind="stable")]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _custom_node_root() -> Path:
    return _repo_root() / CUSTOM_NODE_RELATIVE


def _pose_library_root() -> Path:
    return _repo_root() / POSE_LIBRARY_RELATIVE


def _get_user_did(state_params: Optional[Dict[str, Any]] = None) -> str:
    try:
        user = state_params.get("user") if isinstance(state_params, dict) else None
        if user is not None and hasattr(user, "get_did"):
            did = user.get_did()
            if did:
                return str(did)
    except Exception:
        pass
    try:
        if shared.token is not None:
            return str(shared.token.get_guest_did() or "guest")
    except Exception:
        pass
    return "guest"


def _user_pose_library_root(state_params: Optional[Dict[str, Any]] = None) -> Path:
    user_did = _get_user_did(state_params)
    try:
        if shared.token is not None and hasattr(shared.token, "get_path_in_user_dir"):
            return Path(shared.token.get_path_in_user_dir(user_did, USER_POSE_LIBRARY_CATALOG))
    except Exception:
        pass
    base = shared.path_userhome or "users"
    return Path(base) / str(user_did or "guest") / USER_POSE_LIBRARY_CATALOG


def _norm_path(path: Path) -> str:
    return str(path.resolve())


def _file_url(path: Path) -> str:
    text = _norm_path(path).replace(os.sep, "/")
    return f"/file={quote(text, safe=':/')}"


def _check(root: Path, rel: str) -> Dict[str, Any]:
    path = root / rel
    item: Dict[str, Any] = {
        "relative_path": rel.replace("\\", "/"),
        "path": _norm_path(path),
        "exists": path.exists(),
        "is_dir": path.is_dir(),
    }
    if path.is_file():
        try:
            item["size"] = path.stat().st_size
        except OSError:
            item["size"] = None
    return item


def _ensure_custom_node_import_path() -> Path:
    root = _custom_node_root()
    if not root.exists():
        raise FileNotFoundError(f"Pose Studio custom node was not found: {_norm_path(root)}")
    root_text = str(root.resolve())
    if root_text not in sys.path:
        sys.path.insert(0, root_text)
    return root


def _load_sam3d_bridge():
    _ensure_custom_node_import_path()
    from vnccs_sam3d import process_image_to_pose_json, progress

    return process_image_to_pose_json, progress


def _load_sam3d_overlay_bridge():
    _ensure_custom_node_import_path()
    from vnccs_sam3d.pose_import import process_pose_json_to_overlay_mesh

    return process_pose_json_to_overlay_mesh


def _makehuman_root() -> Path:
    return _custom_node_root() / "CharacterData" / "makehuman"


def _comfy_models_root() -> Path:
    try:
        import modules.config as config

        models_root = getattr(config, "path_models_root", None) or config.get_path_models_root()
        path = Path(models_root)
        if not path.is_absolute():
            path = _repo_root() / path
        return path
    except Exception:
        return _repo_root() / "models"


def _sam3d_model_status() -> Dict[str, Any]:
    models_root = _comfy_models_root()
    checks = {
        "sam3d_model_ckpt": _check(models_root, "sam3dbody/model.ckpt"),
        "sam3d_model_config": _check(models_root, "sam3dbody/model_config.yaml"),
        "sam3d_mhr_model": _check(models_root, "sam3dbody/assets/mhr_model.pt"),
        "birefnet_config": _check(models_root, "birefnet/BiRefNet_lite/config.json"),
        "person_detector": _check(_person_detector_path().parent, _person_detector_path().name),
    }
    required = ["sam3d_model_ckpt", "sam3d_model_config", "sam3d_mhr_model", "person_detector"]
    missing_required = [key for key in required if not checks[key].get("exists")]
    dependency_error = ""
    try:
        _load_sam3d_bridge()
    except Exception as exc:
        dependency_error = str(exc)
    ready = not missing_required and not dependency_error
    return {
        "ready": ready,
        "required_ready": not missing_required,
        "birefnet_ready": bool(checks["birefnet_config"].get("exists")),
        "person_detector_ready": bool(checks["person_detector"].get("exists")),
        "auto_download": True,
        "model_root": _norm_path(models_root / "sam3dbody"),
        "birefnet_root": _norm_path(models_root / "birefnet" / "BiRefNet_lite"),
        "checks": checks,
        "missing": missing_required,
        "dependency_error": dependency_error,
        "message": (
            "SAM3D pose parser is ready."
            if ready
            else "SAM3D models or runtime dependencies are missing; first parse can download model files when network access is available."
        ),
    }


def _ensure_character_data_loaded() -> None:
    if POSE_STUDIO_CHARACTER_CACHE.get("base_mesh") is not None:
        return
    root = _ensure_custom_node_import_path()
    from CharacterData.mh_parser import TargetParser
    from CharacterData.mh_skeleton import Skeleton
    from CharacterData.obj_loader import load_obj

    mh_path = _makehuman_root()
    if not mh_path.exists():
        raise FileNotFoundError(f"MakeHuman data not found at: {_norm_path(mh_path)}")

    base_obj_paths = [
        mh_path / "makehuman" / "data" / "3dobjs" / "base.obj",
        mh_path / "data" / "3dobjs" / "base.obj",
    ]
    base_path = next((path for path in base_obj_paths if path.exists()), None)
    if base_path is None:
        raise FileNotFoundError("Could not find MakeHuman base.obj for Pose Studio.")

    base_mesh = load_obj(str(base_path))
    parser = TargetParser(str(mh_path))
    targets = parser.scan_targets()

    skel = None
    skel_paths = [
        mh_path / "makehuman" / "data" / "rigs" / "game_engine.mhskel",
        mh_path / "makehuman" / "data" / "rigs" / "default.mhskel",
    ]
    skel_path = next((path for path in skel_paths if path.exists()), None)
    if skel_path:
        skel = Skeleton()
        skel.fromFile(str(skel_path), base_mesh)

    POSE_STUDIO_CHARACTER_CACHE.update({
        "base_mesh": base_mesh,
        "targets": targets,
        "parser": parser,
        "skeleton": skel,
        "root": str(root),
    })


def _sam3d_error(exc: Exception) -> Dict[str, Any]:
    details = str(exc)
    missing_dependency = (
        "dependencies are missing" in details
        or "No module named" in details
        or isinstance(exc, ImportError)
        or isinstance(exc, ModuleNotFoundError)
    )
    message = "SAM3D reference pose import failed."
    if missing_dependency:
        message = "SAM3D runtime dependencies are missing or incompatible."
    return {
        "ok": False,
        "error": message,
        "details": details,
        "missing_dependency": missing_dependency,
        "lighting_enabled": False,
        "prompt_box_enabled": False,
    }


def resource_status(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    root = _custom_node_root()
    checks = {
        "pose_studio_js": _check(root, "web/vnccs_pose_studio.js"),
        "pose_studio_core_js": _check(root, "web/vnccs_pose_studio_core.js"),
        "pose_studio_scene_js": _check(root, "web/vnccs_pose_scene.js"),
        "openpose_import_js": _check(root, "web/vnccs_openpose_import.js"),
        "hand_presets_js": _check(root, "web/vnccs_hand_presets.js"),
        "three_module_js": _check(root, "web/three.module.js"),
        "transform_controls_js": _check(root, "web/TransformControls.js"),
        "orbit_controls_js": _check(root, "web/OrbitControls.js"),
        "pose_studio_node_py": _check(root, "nodes/pose_studio.py"),
        "sam3d_pose_import_py": _check(root, "vnccs_sam3d/pose_import.py"),
        "pose_library": _check(root, "PoseLibrary"),
        "makehuman_base_obj": _check(root, "CharacterData/makehuman/makehuman/data/3dobjs/base.obj"),
        "makehuman_game_skeleton": _check(root, "CharacterData/makehuman/makehuman/data/rigs/game_engine.mhskel"),
        "makehuman_default_skeleton": _check(root, "CharacterData/makehuman/makehuman/data/rigs/default.mhskel"),
        "makehuman_default_weights": _check(root, "CharacterData/makehuman/makehuman/data/rigs/default_weights.mhw"),
    }
    missing = [key for key, value in checks.items() if not value.get("exists")]
    core_keys = ["pose_studio_js", "pose_studio_core_js", "pose_studio_scene_js", "pose_studio_node_py", "makehuman_base_obj"]
    available = root.exists() and all(checks[key].get("exists") for key in core_keys)
    sam3d = _sam3d_model_status()
    return {
        "ok": True,
        "available": available,
        "root": _norm_path(root),
        "checks": checks,
        "missing": missing,
        "sam3d": sam3d,
        "canvas_node": "pose_studio",
        "vendor_base_url": "/pose-studio/vendor/",
        "lighting_enabled": False,
        "prompt_box_enabled": False,
        "message": (
            "Pose Studio resources are available."
            if available and sam3d.get("ready")
            else "Pose Studio resources are available; SAM3D models may download on first parse."
            if available
            else "Pose Studio resources are incomplete."
        ),
    }


def vendor_asset(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    rel = str(payload.get("path") or payload.get("relative_path") or "").strip().replace("\\", "/")
    if not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return {"ok": False, "error": "invalid vendor asset path"}
    web_root = (_custom_node_root() / "web").resolve()
    path = (web_root / rel).resolve()
    try:
        if os.path.commonpath([str(web_root), str(path)]) != str(web_root):
            return {"ok": False, "error": "vendor asset path is outside web root"}
    except ValueError:
        return {"ok": False, "error": "vendor asset path is outside web root"}
    if not path.is_file():
        return {"ok": False, "error": "vendor asset not found"}
    media_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return {
        "ok": True,
        "path": _norm_path(path),
        "media_type": media_type,
        "relative_path": rel,
        "lighting_enabled": False,
        "prompt_box_enabled": False,
    }


def _pose_category(path: Path, library_root: Path) -> str:
    try:
        rel_parent = path.parent.relative_to(library_root)
        parts = rel_parent.parts
    except ValueError:
        parts = path.parent.parts
    if len(parts) <= 1:
        return ""
    return "/".join(parts[1:])


def _pose_library_item(path: Path, library_root: Path, source: str, id_prefix: str = "") -> Dict[str, Any]:
    preview = path.with_suffix(".webp")
    if not preview.exists():
        preview = path.with_suffix(".png")
    if not preview.exists():
        preview = path.with_suffix(".jpg")
    try:
        rel = path.relative_to(library_root).as_posix()
    except ValueError:
        rel = path.name
    return {
        "id": f"{id_prefix}{rel}",
        "name": path.stem,
        "category": _pose_category(path, library_root),
        "source": source,
        "can_delete": source == "user",
        "path": _norm_path(path),
        "relative_path": rel,
        "preview_path": _norm_path(preview) if preview.exists() else "",
        "preview_url": _file_url(preview) if preview.exists() else "",
        "size": path.stat().st_size if path.exists() else 0,
    }


def _list_library_root(library_root: Path, limit: int, source: str, id_prefix: str = "") -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if not library_root.exists():
        return items
    for path in sorted(library_root.rglob("*.json"), key=lambda item: str(item).lower()):
        if path.name.lower() == "repositories.user.json":
            continue
        if len(items) >= limit:
            break
        items.append(_pose_library_item(path, library_root, source, id_prefix=id_prefix))
    return items


def list_pose_library(payload: Optional[Dict[str, Any]] = None, state_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    state_params = state_params if isinstance(state_params, dict) else {}
    limit = int(payload.get("limit") or 500)
    limit = max(1, min(limit, 2000))
    built_in_root = _pose_library_root()
    user_root = _user_pose_library_root(state_params)
    user_items = _list_library_root(user_root, limit, "user", id_prefix="user/")
    built_in_items = _list_library_root(built_in_root, max(0, limit - len(user_items)), "built_in")
    items = user_items + built_in_items
    return {
        "ok": True,
        "items": items,
        "root": _norm_path(built_in_root),
        "user_root": _norm_path(user_root),
        "count": len(items),
        "truncated": len(items) >= limit,
    }


def _safe_json_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [_safe_json_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _safe_json_value(item) for key, item in value.items()}
    return str(value)


def _pose_path_for_id(payload: Dict[str, Any], state_params: Optional[Dict[str, Any]] = None, user_only: bool = False) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    rel = str(payload.get("id") or payload.get("relative_path") or "").strip().replace("\\", "/")
    source = str(payload.get("source") or "").strip().lower()
    if rel.startswith("user/"):
        source = "user"
        rel = rel[len("user/"):]
    elif rel.startswith("builtin/"):
        source = "built_in"
        rel = rel[len("builtin/"):]
    if user_only:
        source = "user"
    if source not in ("user", "built_in"):
        source = "built_in"
    if not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return {"ok": False, "error": "invalid pose id"}
    root = (_user_pose_library_root(state_params) if source == "user" else _pose_library_root()).resolve()
    path = (root / rel).resolve()
    try:
        if os.path.commonpath([str(root), str(path)]) != str(root):
            return {"ok": False, "error": "pose id is outside library"}
    except ValueError:
        return {"ok": False, "error": "pose id is outside library"}
    return {"ok": True, "source": source, "relative_path": rel, "root": root, "path": path}


def get_pose(payload: Optional[Dict[str, Any]] = None, state_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    resolved = _pose_path_for_id(payload, state_params)
    if not resolved.get("ok"):
        return resolved
    path = resolved["path"]
    if not path.is_file():
        return {"ok": False, "error": "pose file not found"}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"ok": False, "error": "failed to read pose", "details": str(exc)}
    return {
        "ok": True,
        "id": f"user/{resolved['relative_path']}" if resolved.get("source") == "user" else resolved["relative_path"],
        "name": path.stem,
        "source": resolved.get("source"),
        "pose_data": _safe_json_value(data),
        "path": _norm_path(path),
    }


def import_status(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    task_id = str(payload.get("task_id") or "").strip()
    if not task_id:
        return {"ok": False, "error": "missing SAM3D import task id"}
    try:
        _, progress = _load_sam3d_bridge()
        status = progress.get_task(task_id)
    except Exception as exc:
        error = _sam3d_error(exc)
        return {
            "ok": False,
            "task_id": task_id,
            "status": "unknown",
            "message": error.get("error") or "SAM3D status unavailable.",
            "progress": 0,
            "details": error.get("details", ""),
            "missing_dependency": error.get("missing_dependency", False),
        }
    return {
        "ok": True,
        "task_id": task_id,
        "status": status.get("status", "unknown"),
        "message": status.get("message", ""),
        "progress": status.get("progress", 0),
        "lighting_enabled": False,
        "prompt_box_enabled": False,
    }


def _reference_asset_from_payload(payload: Dict[str, Any], state_params: Dict[str, Any]) -> Dict[str, Any]:
    project_id = str(payload.get("project_id") or "default")
    node_id = str(payload.get("node_id") or "")
    asset_source = payload.get("asset_source") if isinstance(payload.get("asset_source"), dict) else None
    if asset_source:
        materialized = canvas_workbench_assets.materialize_node_asset(project_id, state_params, asset_source)
        if not materialized.get("ok"):
            return {
                "ok": False,
                "error": materialized.get("error") or "failed to materialize reference image",
                "asset_ref": materialized.get("asset_ref"),
            }
        return {"ok": True, "asset_ref": materialized.get("asset_ref") or {}}

    data_url = str(payload.get("image_data_url") or payload.get("data_url") or "").strip()
    if data_url.startswith("data:image/"):
        asset_ref = canvas_workbench_assets.save_data_url_asset(
            data_url,
            project_id,
            state_params,
            node_id=node_id,
            role="pose_reference",
            metadata={"source": "pose_studio_reference"},
        )
        if asset_ref:
            return {"ok": True, "asset_ref": asset_ref}
        return {"ok": False, "error": "failed to save reference image"}

    return {"ok": False, "error": "Pose Studio import requires a reference image source."}


def import_reference_image(payload: Optional[Dict[str, Any]] = None, state_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    state_params = state_params if isinstance(state_params, dict) else {}
    task_id = str(payload.get("task_id") or f"pose_import_{uuid.uuid4().hex}").strip()
    max_people = payload.get("max_people", 2)
    if isinstance(max_people, bool) or not isinstance(max_people, int) or max_people < 1:
        return {"ok": False, "task_id": task_id, "error": "Maximum people must be a positive integer."}

    try:
        reference_result = _reference_asset_from_payload(payload, state_params)
        if not reference_result.get("ok"):
            return {
                "ok": False,
                "task_id": task_id,
                "error": reference_result.get("error") or "reference image unavailable",
                "lighting_enabled": False,
                "prompt_box_enabled": False,
            }
        reference_asset = reference_result.get("asset_ref") or {}
        image_path = str(reference_asset.get("path") or "").strip()
        if not image_path or not os.path.exists(image_path):
            return {
                "ok": False,
                "task_id": task_id,
                "error": "reference image file is unavailable on the server",
                "reference_asset": reference_asset,
                "lighting_enabled": False,
                "prompt_box_enabled": False,
            }

        from PIL import Image
        import numpy as np
        import torch

        process_image_to_pose_json, progress = _load_sam3d_bridge()
        progress.start_task(task_id)
        with progress.task_context(task_id):
            progress.update("Step 1/6: Image uploaded. Preparing SAM 3D Body import...", 2)
            pil_image = Image.open(image_path).convert("RGB")
            image_rgb = np.asarray(pil_image)
            progress.update("Detecting people in the reference image...", 3)
            boxes = _detect_people(image_rgb)
            detected_people = len(boxes)
            boxes = boxes[:max_people]
            image_np = image_rgb.astype(np.float32) / 255.0
            image_tensor = torch.from_numpy(image_np).unsqueeze(0)
            pose_json = process_image_to_pose_json(image_tensor, bboxes=boxes)

        try:
            pose_data = json.loads(pose_json)
        except Exception:
            pose_data = None
        return {
            "ok": True,
            "status": "success",
            "task_id": task_id,
            "pose_json": pose_json,
            "pose_data": _safe_json_value(pose_data) if pose_data is not None else None,
            "max_people": max_people,
            "detected_people": detected_people,
            "parsed_people": len(boxes),
            "reference_asset": _safe_json_value(reference_asset),
            "imported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "lighting_enabled": False,
            "prompt_box_enabled": False,
        }
    except Exception as exc:
        try:
            _, progress = _load_sam3d_bridge()
            with progress.task_context(task_id):
                progress.fail(str(exc))
        except Exception:
            pass
        error = _sam3d_error(exc)
        error["task_id"] = task_id
        return error


def character_preview(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    try:
        import numpy as np

        _ensure_character_data_loaded()
        from CharacterData.mh_parser import HumanSolver

        base_mesh = POSE_STUDIO_CHARACTER_CACHE["base_mesh"]
        targets = POSE_STUDIO_CHARACTER_CACHE["targets"]
        skel = POSE_STUDIO_CHARACTER_CACHE.get("skeleton")

        age = float(payload.get("age", 25.0))
        gender = float(payload.get("gender", 0.5))
        weight = float(payload.get("weight", 0.5))
        muscle = float(payload.get("muscle", 0.5))
        height = float(payload.get("height", 0.5))
        breast_size = float(payload.get("breast_size", 0.5))
        firmness = float(payload.get("firmness", 0.5))
        penis_len = float(payload.get("penis_len", 0.5))
        penis_circ = float(payload.get("penis_circ", 0.5))
        penis_test = float(payload.get("penis_test", 0.5))

        mh_age = max(0.0, min(1.0, (age - 1.0) / (90.0 - 1.0)))
        solver = HumanSolver()
        factors = solver.calculate_factors(
            mh_age,
            gender,
            weight,
            muscle,
            height,
            breast_size,
            firmness,
            penis_len,
            penis_circ,
            penis_test,
        )
        new_verts = solver.solve_mesh(base_mesh, targets, factors)

        valid_prefixes = [
            "body",
            "helper-r-eye",
            "helper-l-eye",
            "helper-upper-teeth",
            "helper-lower-teeth",
            "helper-tongue",
            "helper-genital",
        ]
        valid_faces = []
        if base_mesh.face_groups:
            for index, group in enumerate(base_mesh.face_groups):
                clean = str(group).strip()
                is_valid = clean in valid_prefixes
                if clean.startswith("joint-"):
                    is_valid = False
                if clean in ["helper-skirt", "helper-tights", "helper-hair"]:
                    is_valid = False
                if clean == "helper-genital" and gender < 0.99:
                    is_valid = False
                if is_valid:
                    valid_faces.append(base_mesh.faces[index])

        tri_indices: List[int] = []
        for face in valid_faces:
            vertex_indices = []
            for item in face:
                vertex_indices.append(int(item[0] if isinstance(item, (list, tuple)) else item))
            if len(vertex_indices) == 3:
                tri_indices.extend([vertex_indices[0], vertex_indices[1], vertex_indices[2]])
            elif len(vertex_indices) == 4:
                tri_indices.extend([vertex_indices[0], vertex_indices[1], vertex_indices[2]])
                tri_indices.extend([vertex_indices[0], vertex_indices[2], vertex_indices[3]])

        landmarks: Dict[str, Any] = {}
        landmark_indices: Dict[str, Any] = {}

        def average_vertices(indices):
            valid = [int(index) for index in indices if 0 <= int(index) < len(new_verts)]
            if not valid:
                return None
            point = new_verts[valid].mean(axis=0)
            return point.tolist() if hasattr(point, "tolist") else list(point)

        def set_landmark_from_indices(name, indices):
            valid = sorted({int(index) for index in indices if 0 <= int(index) < len(new_verts)})
            point = average_vertices(valid)
            if point is None:
                return None
            landmarks[name] = point
            landmark_indices[name] = valid
            return point

        def group_vertex_indices(group_names):
            names = set(group_names if isinstance(group_names, (list, tuple, set)) else [group_names])
            result = set()
            if not base_mesh.face_groups:
                return result
            for face, group in zip(base_mesh.faces, base_mesh.face_groups):
                if str(group).strip() not in names:
                    continue
                for item in face:
                    result.add(int(item[0] if isinstance(item, (list, tuple)) else item))
            return result

        def set_landmark_from_group(name, group_names):
            return set_landmark_from_indices(name, group_vertex_indices(group_names))

        def surface_nose_point():
            body_indices = sorted(group_vertex_indices("body"))
            if not body_indices:
                return None
            points = new_verts[body_indices]
            if points.size == 0:
                return None
            left_eye = landmarks.get("left_eye")
            right_eye = landmarks.get("right_eye")
            if left_eye and right_eye:
                eye_mid = (np.asarray(left_eye, dtype=np.float32) + np.asarray(right_eye, dtype=np.float32)) * 0.5
                eye_span = float(abs(left_eye[0] - right_eye[0]))
                x_limit = max(0.18, eye_span * 0.45)
                mask = (
                    (np.abs(points[:, 0] - eye_mid[0]) <= x_limit)
                    & (points[:, 1] >= eye_mid[1] - 0.65)
                    & (points[:, 1] <= eye_mid[1] - 0.03)
                )
            else:
                mask = (
                    (np.abs(points[:, 0]) <= 0.25)
                    & (points[:, 1] >= 6.4)
                    & (points[:, 1] <= 7.4)
                )
            candidates = points[mask]
            if len(candidates) == 0:
                candidates = points[
                    (np.abs(points[:, 0]) <= 0.35)
                    & (points[:, 1] >= 6.4)
                    & (points[:, 1] <= 7.4)
                ]
            if len(candidates) == 0:
                return None
            selected = candidates[np.argmax(candidates[:, 2])]
            distances = np.linalg.norm(points - selected, axis=1)
            nearest_order = np.argsort(distances)[:12]
            return set_landmark_from_indices("nose", [body_indices[int(i)] for i in nearest_order])

        def average_joint(joints_data, name):
            indices = joints_data.get(name) if isinstance(joints_data, dict) else None
            if not indices:
                return None
            return average_vertices(indices)

        try:
            set_landmark_from_group("left_eye", "helper-l-eye")
            set_landmark_from_group("right_eye", "helper-r-eye")
            surface_nose_point()
            default_skel_path = _makehuman_root() / "makehuman" / "data" / "rigs" / "default.mhskel"
            if default_skel_path.exists():
                default_skel_data = json.loads(default_skel_path.read_text(encoding="utf-8"))
                default_joints = default_skel_data.get("joints", {})
                landmark_sources = {
                    "left_eye": "eye.L____head",
                    "left_eye_front": "eye.L____tail",
                    "right_eye": "eye.R____head",
                    "right_eye_front": "eye.R____tail",
                    "nose": "special01____tail",
                    "mouth": "oris05____head",
                    "jaw": "jaw____head",
                    "head": "head____tail",
                }
                for landmark_name, joint_name in landmark_sources.items():
                    if landmark_name in landmarks:
                        continue
                    point = average_joint(default_joints, joint_name)
                    if point is not None:
                        landmarks[landmark_name] = point
        except Exception as exc:
            print(f"[Pose Studio] Failed to build face landmarks: {exc}")

        bones_data = []
        weights = {}
        if skel:
            class MeshWrapper:
                def __init__(self, verts):
                    self.vertices = verts

            skel.updateJointPositions(MeshWrapper(new_verts))
            for bone in skel.getBones():
                head_pos = bone.headPos.tolist() if hasattr(bone.headPos, "tolist") else list(bone.headPos)
                tail_pos = bone.tailPos.tolist() if hasattr(bone.tailPos, "tolist") else list(bone.tailPos)
                rest_matrix = bone.matRestGlobal.flatten().tolist() if bone.matRestGlobal is not None else None
                bones_data.append({
                    "name": bone.name,
                    "headPos": head_pos,
                    "tailPos": tail_pos,
                    "parent": bone.parent.name if bone.parent else None,
                    "length": float(bone.length) if hasattr(bone, "length") else 0.0,
                    "restMatrix": rest_matrix,
                })
            if skel.vertexWeights:
                for bone_name, (indices, values) in skel.vertexWeights.data.items():
                    weights[bone_name] = {
                        "indices": indices.tolist() if hasattr(indices, "tolist") else list(indices),
                        "weights": values.tolist() if hasattr(values, "tolist") else list(values),
                    }

        return {
            "ok": True,
            "status": "success",
            "vertices": new_verts.flatten().tolist(),
            "uvs": base_mesh.vertex_uvs.flatten().tolist() if hasattr(base_mesh, "vertex_uvs") else [],
            "indices": tri_indices,
            "normals": [],
            "bones": bones_data,
            "weights": weights,
            "landmarks": landmarks,
            "landmark_indices": landmark_indices,
            "lighting_enabled": False,
            "prompt_box_enabled": False,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": "Pose Studio character preview failed.",
            "details": str(exc),
            "lighting_enabled": False,
            "prompt_box_enabled": False,
        }


def render_overlay(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    pose_data = payload.get("pose_data")
    if not isinstance(pose_data, dict):
        return {"ok": False, "error": "render overlay requires pose_data"}
    body_preset = payload.get("body_preset") if isinstance(payload.get("body_preset"), dict) else {}
    try:
        pose_adjust = float(payload.get("pose_adjust") or 0.0)
    except Exception:
        pose_adjust = 0.0
    try:
        build_overlay = _load_sam3d_overlay_bridge()
        mesh = build_overlay(pose_data, body_preset=body_preset, pose_adjust=pose_adjust)
        return {
            "ok": True,
            "status": "success",
            "mesh": _safe_json_value(mesh),
            "lighting_enabled": False,
            "prompt_box_enabled": False,
        }
    except Exception as exc:
        return _sam3d_error(exc)


def _safe_file_stem(value: str, fallback: str = "pose") -> str:
    text = str(value or "").strip()
    text = re.sub(r"[^a-zA-Z0-9_.\-\u4e00-\u9fff]+", "_", text)
    text = text.strip("._-")
    return (text or fallback)[:96]


def _safe_category_parts(value: str) -> List[str]:
    parts = []
    for part in str(value or "").replace("\\", "/").split("/"):
        safe = _safe_file_stem(part, "")
        if safe:
            parts.append(safe)
    return parts[:4]


def _unique_pose_path(folder: Path, stem: str, overwrite: bool) -> Path:
    path = folder / f"{stem}.json"
    if overwrite or not path.exists():
        return path
    for index in range(2, 1000):
        candidate = folder / f"{stem}-{index}.json"
        if not candidate.exists():
            return candidate
    return folder / f"{stem}-{uuid.uuid4().hex[:8]}.json"


def _save_preview_data_url(data_url: str, pose_path: Path) -> str:
    text = str(data_url or "").strip()
    match = DATA_URL_RE.match(text)
    if not match:
        return ""
    mime = (match.group("mime") or "image/png").lower()
    if not mime.startswith("image/"):
        return ""
    ext = {
        "image/webp": ".webp",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
    }.get(mime, ".png")
    binary = base64.b64decode(match.group("data") or "", validate=False)
    if not binary:
        return ""
    preview_path = pose_path.with_suffix(ext)
    tmp_path = preview_path.with_suffix(f"{preview_path.suffix}.tmp")
    with open(tmp_path, "wb") as f:
        f.write(binary)
    os.replace(tmp_path, preview_path)
    return _norm_path(preview_path)


def save_pose(payload: Optional[Dict[str, Any]] = None, state_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    state_params = state_params if isinstance(state_params, dict) else {}
    pose_data = payload.get("pose_data")
    if not isinstance(pose_data, dict):
        pose_json = str(payload.get("pose_json") or "").strip()
        if pose_json:
            try:
                pose_data = json.loads(pose_json)
            except Exception as exc:
                return {"ok": False, "error": "invalid pose_json", "details": str(exc)}
    if not isinstance(pose_data, dict) or not pose_data:
        return {"ok": False, "error": "Pose library save requires pose_data."}

    root = _user_pose_library_root(state_params)
    category_parts = _safe_category_parts(str(payload.get("category") or "Saved"))
    folder = root
    for part in category_parts:
        folder = folder / part
    folder.mkdir(parents=True, exist_ok=True)

    stem = _safe_file_stem(str(payload.get("name") or payload.get("title") or "pose"))
    path = _unique_pose_path(folder, stem, bool(payload.get("overwrite")))
    data = _safe_json_value(pose_data)
    tmp_path = path.with_suffix(".json.tmp")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp_path, path)
    preview_path = _save_preview_data_url(str(payload.get("preview_data_url") or ""), path)
    item = _pose_library_item(path, root, "user", id_prefix="user/")
    if preview_path:
        preview = Path(preview_path)
        item["preview_path"] = preview_path
        item["preview_url"] = _file_url(preview)
    return {
        "ok": True,
        "item": item,
        "id": item.get("id"),
        "name": item.get("name"),
        "source": "user",
        "saved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lighting_enabled": False,
        "prompt_box_enabled": False,
    }


def delete_pose(payload: Optional[Dict[str, Any]] = None, state_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    resolved = _pose_path_for_id(payload, state_params, user_only=True)
    if not resolved.get("ok"):
        return resolved
    path = resolved["path"]
    root = resolved["root"]
    try:
        if os.path.commonpath([str(root), str(path)]) != str(root):
            return {"ok": False, "error": "pose id is outside user library"}
    except ValueError:
        return {"ok": False, "error": "pose id is outside user library"}
    if not path.exists():
        return {"ok": False, "error": "pose file not found"}
    removed = [_norm_path(path)]
    path.unlink()
    for ext in (".webp", ".png", ".jpg", ".jpeg"):
        preview = path.with_suffix(ext)
        if preview.exists():
            preview.unlink()
            removed.append(_norm_path(preview))
    return {
        "ok": True,
        "id": f"user/{resolved['relative_path']}",
        "removed": removed,
        "lighting_enabled": False,
        "prompt_box_enabled": False,
    }


def rename_pose(payload: Optional[Dict[str, Any]] = None, state_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    resolved = _pose_path_for_id(payload, state_params, user_only=True)
    if not resolved.get("ok"):
        return resolved
    root = resolved["root"].resolve()
    path = resolved["path"]
    try:
        if os.path.commonpath([str(root), str(path)]) != str(root):
            return {"ok": False, "error": "pose id is outside user library"}
    except ValueError:
        return {"ok": False, "error": "pose id is outside user library"}
    if not path.exists() or not path.is_file():
        return {"ok": False, "error": "pose file not found"}

    new_stem = _safe_file_stem(str(payload.get("name") or payload.get("title") or "pose"))
    if not new_stem:
        return {"ok": False, "error": "Pose name cannot be empty."}
    overwrite = bool(payload.get("overwrite"))
    target = path.with_name(f"{new_stem}.json")
    try:
        if os.path.commonpath([str(root), str(target.resolve().parent)]) != str(root):
            return {"ok": False, "error": "pose rename target is outside user library"}
    except ValueError:
        return {"ok": False, "error": "pose rename target is outside user library"}
    if target.exists() and target.resolve() != path.resolve() and not overwrite:
        return {"ok": False, "error": "A pose with that name already exists."}

    old_preview_paths = [path.with_suffix(ext) for ext in (".webp", ".png", ".jpg", ".jpeg")]
    if target.resolve() != path.resolve():
        os.replace(path, target)
        for preview in old_preview_paths:
            if not preview.exists():
                continue
            new_preview = target.with_suffix(preview.suffix)
            if new_preview.exists() and not overwrite:
                continue
            os.replace(preview, new_preview)

    item = _pose_library_item(target, root, "user", id_prefix="user/")
    return {
        "ok": True,
        "item": item,
        "id": item.get("id"),
        "name": item.get("name"),
        "source": "user",
        "renamed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lighting_enabled": False,
        "prompt_box_enabled": False,
    }


def save_canvas_export(payload: Optional[Dict[str, Any]] = None, state_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    state_params = state_params if isinstance(state_params, dict) else {}
    data_url = str(payload.get("image_data_url") or payload.get("data_url") or "").strip()
    if not data_url.startswith("data:image/"):
        return {"ok": False, "error": "Pose Studio export requires an image data URL."}

    project_id = str(payload.get("project_id") or "default")
    node_id = str(payload.get("node_id") or "")
    pose_data = _safe_json_value(payload.get("pose_data") if "pose_data" in payload else {})
    editor_state = _safe_json_value(payload.get("editor_state") if "editor_state" in payload else {})
    reference_asset = _safe_json_value(payload.get("reference_asset") if "reference_asset" in payload else None)
    asset_ref = canvas_workbench_assets.save_data_url_asset(
        data_url,
        project_id,
        state_params,
        node_id=node_id,
        role="pose_image",
        metadata={
            "source": "pose_studio",
            "pose_data": pose_data,
            "editor_state": editor_state,
            "reference_asset": reference_asset,
        },
    )
    if not asset_ref:
        return {"ok": False, "error": "failed to save Pose Studio export"}
    return {
        "ok": True,
        "asset_ref": asset_ref,
        "pose_image": asset_ref,
        "pose_data": pose_data,
        "editor_state": editor_state,
        "reference_asset": reference_asset,
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lighting_enabled": False,
        "prompt_box_enabled": False,
    }
