import torch
from comfy import model_management
from comfy.model_patcher import ModelPatcher
from segment_anything.utils.transforms import ResizeLongestSide


class SamPredictor:
    def __init__(self, model, load_device=None, offload_device=None):
        self.load_device = load_device or model_management.text_encoder_device()
        self.offload_device = offload_device or model_management.text_encoder_offload_device()
        model.to(self.offload_device)
        # SAM.device is read-only; Comfy tracks device changes on its parent module.
        managed_model = torch.nn.Module()
        managed_model.sam = model
        self.patcher = ModelPatcher(managed_model, load_device=self.load_device, offload_device=self.offload_device)
        self.transform = ResizeLongestSide(model.image_encoder.img_size)
        self.reset_image()

    def set_image(self, image, image_format="RGB"):
        if image_format not in ("RGB", "BGR"):
            raise ValueError(f"image_format must be RGB or BGR, got {image_format}")
        if image_format != self.patcher.model.sam.image_format:
            image = image[..., ::-1]
        transformed = self.transform.apply_image(image)
        transformed = torch.as_tensor(transformed, device=self.load_device).permute(2, 0, 1).contiguous()[None]
        self.set_torch_image(transformed, image.shape[:2])

    def set_torch_image(self, transformed_image, original_image_size):
        self.reset_image()
        self.original_size = original_image_size
        self.input_size = tuple(transformed_image.shape[-2:])
        model_management.load_model_gpu(self.patcher)
        prepared = self.patcher.model.sam.preprocess(transformed_image.to(self.load_device))
        self.features = self.patcher.model.sam.image_encoder(prepared)
        self.is_image_set = True

    def predict_torch(self, point_coords, point_labels, boxes=None, mask_input=None, multimask_output=True, return_logits=False):
        if not self.is_image_set:
            raise RuntimeError("An image must be set before mask prediction")
        points = None if point_coords is None else (point_coords.to(self.load_device), point_labels.to(self.load_device))
        boxes = boxes.to(self.load_device) if boxes is not None else None
        mask_input = mask_input.to(self.load_device) if mask_input is not None else None
        model_management.load_model_gpu(self.patcher)
        sparse, dense = self.patcher.model.sam.prompt_encoder(points=points, boxes=boxes, masks=mask_input)
        low_res_masks, scores = self.patcher.model.sam.mask_decoder(
            image_embeddings=self.features,
            image_pe=self.patcher.model.sam.prompt_encoder.get_dense_pe(),
            sparse_prompt_embeddings=sparse,
            dense_prompt_embeddings=dense,
            multimask_output=multimask_output,
        )
        masks = self.patcher.model.sam.postprocess_masks(low_res_masks, self.input_size, self.original_size)
        if not return_logits:
            masks = masks > self.patcher.model.sam.mask_threshold
        return masks, scores, low_res_masks

    def reset_image(self):
        self.is_image_set = False
        self.features = None
