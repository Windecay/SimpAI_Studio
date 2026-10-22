import os
import sys
import logging

logger = logging.getLogger(__name__)


def _ensure_project_root_on_path() -> None:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)
    if project_root not in sys.path:
        sys.path.append(project_root)


def check_model_availability():
    try:
        _ensure_project_root_on_path()
        import enhanced.sam3_image_mask as sam3_image_mask

        ckpt_path = sam3_image_mask._resolve_sam3_checkpoint(None, allow_download=False)
        if ckpt_path and os.path.exists(ckpt_path):
            return {
                "available": True,
                "reason": "ready",
                "message": "Model is ready to use",
                "model_path": ckpt_path,
            }

        return {
            "available": False,
            "reason": "not_downloaded",
            "message": "SAM3.1 is missing. Install it through model management or the current preset model downloads before retrying.",
            "model_path": ckpt_path or "",
        }
    except Exception as e:
        return {"available": False, "reason": "error", "message": str(e)}


def process_sam3_image_mask(image_data_url, positive_points=None, negative_points=None, threshold=None, fill_holes=False, mask_threshold=0.5, close_radius=1):
    _ensure_project_root_on_path()
    import enhanced.sam3_image_mask as sam3_image_mask

    return sam3_image_mask.build_sam3_image_response(
        image_data_url=image_data_url,
        positive_points=positive_points,
        negative_points=negative_points,
        threshold=threshold,
        fill_holes=bool(fill_holes),
        mask_threshold=mask_threshold,
        close_radius=close_radius,
    )


def offload_model():
    try:
        _ensure_project_root_on_path()
        import enhanced.sam3_image_mask as sam3_image_mask

        sam3_image_mask.offload_sam3_image_model_to_cpu()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
