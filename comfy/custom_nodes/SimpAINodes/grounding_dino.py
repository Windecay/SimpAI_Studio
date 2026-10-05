import os
from pathlib import Path

import numpy as np
import torch
from groundingdino.util.inference import Model, get_phrases_from_posmap, load_model, preprocess_caption
from comfy import model_management
from comfy.model_patcher import ModelPatcher
from torch.hub import download_url_to_file

from .model_path_utils import find_model_in_dirs


def _predict(model, image, caption, box_threshold, text_threshold, device):
    caption = preprocess_caption(caption=caption)
    model = model.model.to(device)
    image = image.to(device)
    with torch.no_grad():
        outputs = model(image[None], captions=[caption])
    prediction_logits = outputs["pred_logits"].cpu().sigmoid()[0]
    prediction_boxes = outputs["pred_boxes"].cpu()[0]
    mask = prediction_logits.max(dim=1)[0] > box_threshold
    logits = prediction_logits[mask]
    boxes = prediction_boxes[mask]
    tokenizer = model.tokenizer
    tokenized = tokenizer(caption)
    phrases = [get_phrases_from_posmap(logit > text_threshold, tokenized, tokenizer).replace('.', '') for logit in logits]
    return boxes, logits.max(dim=1)[0], phrases


class GroundingDinoModel(Model):
    def __init__(self, model_dirs, download_dir):
        self.config_file = str(Path(__file__).with_name("grounding_dino_config.py"))
        self.model_dirs = list(model_dirs)
        self.download_dir = download_dir
        self.model = None
        self.load_device = torch.device("cpu")
        self.offload_device = torch.device("cpu")

    def _resolve_checkpoint(self):
        filename = "groundingdino_swint_ogc.pth"
        checkpoint = find_model_in_dirs(self.model_dirs, filename)
        if checkpoint is not None:
            return checkpoint
        target_dir = self.download_dir or self.model_dirs[0]
        os.makedirs(target_dir, exist_ok=True)
        checkpoint = os.path.join(target_dir, filename)
        download_url_to_file(
            "https://github.com/IDEA-Research/GroundingDINO/releases/download/v0.1.0-alpha/groundingdino_swint_ogc.pth",
            checkpoint,
        )
        return checkpoint

    def predict_with_caption(self, image: np.ndarray, caption: str, box_threshold=0.35, text_threshold=0.25):
        if self.model is None:
            model = load_model(self.config_file, self._resolve_checkpoint())
            self.load_device = model_management.text_encoder_device()
            self.offload_device = model_management.text_encoder_offload_device()
            model.to(self.offload_device)
            self.model = ModelPatcher(model, load_device=self.load_device, offload_device=self.offload_device)
        model_management.load_model_gpu(self.model)
        processed_image = GroundingDinoModel.preprocess_image(image_bgr=image).to(self.load_device)
        boxes, logits, phrases = _predict(self.model, processed_image, caption, box_threshold, text_threshold, self.load_device)
        source_height, source_width, _ = image.shape
        detections = GroundingDinoModel.post_process_result(source_height, source_width, boxes, logits)
        return detections, boxes, logits, phrases
