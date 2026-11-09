import sys

import numpy as np
import onnxruntime as ort
import os
import torch
from extras.GroundingDINO.util.inference import default_groundingdino
from extras.sam.predictor import SamPredictor
from modules.model_path_utils import find_dir_containing_model, first_model_dir
from segment_anything import sam_model_registry
from segment_anything.utils.amg import remove_small_regions


def HWC3(x):
    assert x.dtype == np.uint8
    if x.ndim == 2:
        x = x[:, :, None]
    assert x.ndim == 3
    channels = x.shape[2]
    assert channels in (1, 3, 4)
    if channels == 3:
        return x
    if channels == 1:
        return np.concatenate([x, x, x], axis=2)
    color = x[:, :, :3].astype(np.float32)
    alpha = x[:, :, 3:4].astype(np.float32) / 255.0
    return (color * alpha + 255.0 * (1.0 - alpha)).clip(0, 255).astype(np.uint8)


def _rembg_import_error_message(exc: BaseException) -> str:
    detail = str(exc)
    guidance = (
        "RMBG/自动蒙版依赖加载失败。RMBG / automatic mask dependencies failed to load."
    )
    if (
        "应用程序控制策略" in detail
        or "application control" in detail.lower()
        or "dll load failed" in detail.lower()
    ):
        guidance += (
            " Windows application control/security policy may have blocked "
            "CuPy/PyMatting native .pyd/.dll files. "
            "请检查 Windows Application Control、WDAC、AppLocker、Smart App Control，"
            "或解除便携包目录中文件的阻止状态。"
        )
    return f"{guidance} Original error: {detail}"


def _load_rembg():
    try:
        from rembg import remove, new_session
    except (ImportError, OSError) as exc:
        raise RuntimeError(_rembg_import_error_message(exc)) from exc
    return remove, new_session


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
    if os.environ.get("SIMPAI_REMBG_ENABLE_TENSORRT") == "1":
        preferred.insert(0, "TensorrtExecutionProvider")
    providers = [provider for provider in preferred if provider in available]
    return providers or ["CPUExecutionProvider"]


class SAMOptions:
    def __init__(self,
                 # GroundingDINO
                 dino_prompt: str = '',
                 dino_box_threshold=0.3,
                 dino_text_threshold=0.25,
                 dino_erode_or_dilate=0,
                 dino_debug=False,

                 # SAM
                 max_detections=2,
                 model_type='vit_b'
                 ):
        self.dino_prompt = dino_prompt
        self.dino_box_threshold = dino_box_threshold
        self.dino_text_threshold = dino_text_threshold
        self.dino_erode_or_dilate = dino_erode_or_dilate
        self.dino_debug = dino_debug
        self.max_detections = max_detections
        self.model_type = model_type


def optimize_masks(masks: torch.Tensor) -> torch.Tensor:
    """
    removes small disconnected regions and holes
    """
    fine_masks = []
    for mask in masks.to('cpu').numpy():  # masks: [num_masks, 1, h, w]
        fine_masks.append(remove_small_regions(mask[0], 400, mode="holes")[0])
    masks = np.stack(fine_masks, axis=0)[:, np.newaxis]
    return torch.from_numpy(masks)


def generate_mask_from_image(image: np.ndarray | dict | str | None, mask_model: str = 'sam', extras=None,
                             sam_options: SAMOptions | None = SAMOptions,
                             backend=None) -> tuple[np.ndarray | None, int | None, int | None, int | None]:
    dino_detection_count = 0
    sam_detection_count = 0
    sam_detection_on_mask_count = 0

    if image is not None and not isinstance(image, np.ndarray):
        from modules.util import normalize_gradio_sketch_value

        sketch = normalize_gradio_sketch_value(image, image_mode="RGBA")
        image = sketch["image"] if sketch is not None else None

    if image is None:
        return None, dino_detection_count, sam_detection_count, sam_detection_on_mask_count

    if extras is None:
        extras = {}

    image = HWC3(image)

    if mask_model != 'sam' or sam_options is None:
        remove, new_session = _load_rembg()
        if backend is not None:
            os.environ["U2NET_HOME"] = backend.resolve_rembg_home(mask_model)
        else:
            import modules.config as config
            os.environ["U2NET_HOME"] = find_dir_containing_model(
                config.paths_inpaint + config.paths_rembg,
                f"{mask_model}.onnx",
                fallback=first_model_dir(config.paths_rembg + config.paths_inpaint)
            )
        result = remove(
            image,
            session=new_session(mask_model, providers=_ort_providers(), **extras),
            only_mask=True,
            **extras
        )

        return result, dino_detection_count, sam_detection_count, sam_detection_on_mask_count

    groundingdino = backend.groundingdino if backend is not None else default_groundingdino
    detections, boxes, logits, phrases = groundingdino(
        image=image,
        caption=sam_options.dino_prompt,
        box_threshold=sam_options.dino_box_threshold,
        text_threshold=sam_options.dino_text_threshold
    )

    H, W = image.shape[0], image.shape[1]
    boxes = boxes * torch.Tensor([W, H, W, H])
    boxes[:, :2] = boxes[:, :2] - boxes[:, 2:] / 2
    boxes[:, 2:] = boxes[:, 2:] + boxes[:, :2]

    if backend is not None:
        sam_checkpoint = backend.resolve_sam_model(sam_options.model_type)
    else:
        import modules.config as config
        sam_checkpoint = config.download_sam_model(sam_options.model_type)
    sam = sam_model_registry[sam_options.model_type](checkpoint=sam_checkpoint)

    sam_predictor = SamPredictor(sam)
    final_mask_tensor = torch.zeros((image.shape[0], image.shape[1]))
    dino_detection_count = boxes.size(0)

    if dino_detection_count > 0:
        sam_predictor.set_image(image)

        if sam_options.dino_erode_or_dilate != 0:
            for index in range(boxes.size(0)):
                assert boxes.size(1) == 4
                boxes[index][0] -= sam_options.dino_erode_or_dilate
                boxes[index][1] -= sam_options.dino_erode_or_dilate
                boxes[index][2] += sam_options.dino_erode_or_dilate
                boxes[index][3] += sam_options.dino_erode_or_dilate

        if sam_options.dino_debug:
            from PIL import ImageDraw, Image
            debug_dino_image = Image.new("RGB", (image.shape[1], image.shape[0]), color="black")
            draw = ImageDraw.Draw(debug_dino_image)
            for box in boxes.numpy():
                draw.rectangle(box.tolist(), fill="white")
            return np.array(debug_dino_image), dino_detection_count, sam_detection_count, sam_detection_on_mask_count

        transformed_boxes = sam_predictor.transform.apply_boxes_torch(boxes, image.shape[:2])
        masks, _, _ = sam_predictor.predict_torch(
            point_coords=None,
            point_labels=None,
            boxes=transformed_boxes,
            multimask_output=False,
        )

        masks = optimize_masks(masks)
        sam_detection_count = len(masks)
        if sam_options.max_detections == 0:
            sam_options.max_detections = sys.maxsize
        sam_objects = min(len(logits), sam_options.max_detections)
        for obj_ind in range(sam_objects):
            mask_tensor = masks[obj_ind][0]
            final_mask_tensor += mask_tensor
            sam_detection_on_mask_count += 1

    final_mask_tensor = (final_mask_tensor > 0).to('cpu').numpy()
    mask_image = np.dstack((final_mask_tensor, final_mask_tensor, final_mask_tensor)) * 255
    mask_image = np.array(mask_image, dtype=np.uint8)
    return mask_image, dino_detection_count, sam_detection_count, sam_detection_on_mask_count
