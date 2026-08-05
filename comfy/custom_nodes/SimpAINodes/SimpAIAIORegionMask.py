import os

import folder_paths
import numpy as np
import torch
from torch.hub import download_url_to_file

from .model_path_utils import find_dir_containing_model, find_model_in_dirs, first_model_dir


def _folder_dirs(name, fallback):
    try:
        paths = list(folder_paths.get_folder_paths(name))
    except Exception:
        paths = []
    fallback_path = os.path.join(folder_paths.models_dir, fallback)
    if fallback_path not in paths:
        paths.append(fallback_path)
    return paths


class _ComfyMaskBackend:
    SAM_MODELS = {
        "vit_b": ("sam_vit_b_01ec64.pth", "https://huggingface.co/mashb1t/misc/resolve/main/sam_vit_b_01ec64.pth"),
        "vit_l": ("sam_vit_l_0b3195.pth", "https://huggingface.co/mashb1t/misc/resolve/main/sam_vit_l_0b3195.pth"),
        "vit_h": ("sam_vit_h_4b8939.pth", "https://huggingface.co/mashb1t/misc/resolve/main/sam_vit_h_4b8939.pth"),
    }

    def __init__(self):
        self.sam_dirs = _folder_dirs("sams", "sams") + _folder_dirs("inpaint", "inpaint")
        self.rembg_dirs = _folder_dirs("rembg", "rembg") + _folder_dirs("inpaint", "inpaint")
        self._sam_predictors = {}
        dino_dirs = _folder_dirs("grounding-dino", "grounding-dino") + _folder_dirs("inpaint", "inpaint")
        from .grounding_dino import GroundingDinoModel
        self.groundingdino = GroundingDinoModel(dino_dirs, dino_dirs[0]).predict_with_caption

    def resolve_sam_model(self, model_type):
        filename, url = self.SAM_MODELS[str(model_type)]
        existing = find_model_in_dirs(self.sam_dirs, filename)
        if existing is not None:
            return existing
        target_dir = self.sam_dirs[0]
        os.makedirs(target_dir, exist_ok=True)
        target = os.path.join(target_dir, filename)
        download_url_to_file(url, target)
        return target

    def get_sam_predictor(self, model_type):
        model_type = str(model_type)
        predictor = self._sam_predictors.get(model_type)
        if predictor is None:
            from segment_anything import sam_model_registry

            from .sam_predictor import SamPredictor

            checkpoint = self.resolve_sam_model(model_type)
            predictor = SamPredictor(sam_model_registry[model_type](checkpoint=checkpoint))
            self._sam_predictors[model_type] = predictor
        return predictor

    def resolve_rembg_home(self, mask_model):
        return find_dir_containing_model(
            self.rembg_dirs,
            f"{mask_model}.onnx",
            fallback=first_model_dir(self.rembg_dirs),
        )


_MASK_BACKEND = None


def _get_mask_backend():
    global _MASK_BACKEND
    if _MASK_BACKEND is None:
        _MASK_BACKEND = _ComfyMaskBackend()
    return _MASK_BACKEND


class SimpAIAIORegionMask:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",),
            "region": ("SIMPAI_AIO_REGION_CONFIG",),
        }}

    RETURN_TYPES = ("MASK", "INT", "INT", "INT")
    RETURN_NAMES = ("mask", "dino_detections", "sam_detections", "applied_detections")
    FUNCTION = "generate"
    CATEGORY = "SimpAI/AIO/Improve Detail"

    def generate(self, image, region):
        from .inpaint_mask import SAMOptions, generate_mask_from_image

        masks = []
        dino_total = sam_total = applied_total = 0
        mask_model = str(region["mask_model"])
        backend = _get_mask_backend()
        for item in image:
            np_image = (item.detach().cpu().numpy().clip(0.0, 1.0) * 255.0).round().astype(np.uint8)
            extras = {}
            if mask_model == "u2net_cloth_seg":
                extras["cloth_category"] = region["cloth_category"]
            mask, dino_count, sam_count, applied_count = generate_mask_from_image(
                np_image,
                mask_model=mask_model,
                extras=extras,
                sam_options=SAMOptions(
                    dino_prompt=region["detection_prompt"],
                    dino_box_threshold=float(region["box_threshold"]),
                    dino_text_threshold=float(region["text_threshold"]),
                    max_detections=int(region["max_detections"]),
                    model_type=region["sam_model"],
                ),
                backend=backend,
            )
            if mask.ndim == 3:
                mask = mask[:, :, 0]
            masks.append(torch.from_numpy(mask.astype(np.float32) / 255.0))
            dino_total += int(dino_count or 0)
            sam_total += int(sam_count or 0)
            applied_total += int(applied_count or 0)
        return (torch.stack(masks, dim=0), dino_total, sam_total, applied_total)


NODE_CLASS_MAPPINGS = {"SimpAIAIORegionMask": SimpAIAIORegionMask}
NODE_DISPLAY_NAME_MAPPINGS = {"SimpAIAIORegionMask": "SimpAI AIO Region Mask"}
