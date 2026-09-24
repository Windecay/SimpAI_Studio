import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from modules.prompt_parser import SdConditioning

import torch
import torch.nn.functional as F
from huggingface_guess import model_list

from backend import memory_management
from backend.args import dynamic_args
from backend.diffusion_engine.base import ForgeDiffusionEngine, ForgeObjects
from backend.modules.k_prediction import PredictionFlux2
from backend.patcher.clip import CLIP
from backend.patcher.unet import UnetPatcher
from backend.patcher.vae import VAE
from backend.text_processing.qwen_image21 import QwenImage21TextProcessingEngine
from modules.shared import opts


class QwenImage21(ForgeDiffusionEngine):
    matched_guesses = [model_list.QwenImage21]

    def __init__(self, estimated_config, huggingface_components):
        super().__init__(estimated_config, huggingface_components)

        clip = CLIP(
            model_dict={"qwen3vl_8b": huggingface_components["text_encoder"]},
            tokenizer_dict={"qwen3vl_8b": huggingface_components["tokenizer"]},
        )
        vae = VAE(model=huggingface_components["vae"], is_qwen_image21=True)
        unet = UnetPatcher.from_model(
            model=huggingface_components["transformer"],
            diffusers_scheduler=None,
            k_predictor=PredictionFlux2(estimated_config),
            config=estimated_config,
        )

        self.text_processing_engine_qwen21 = QwenImage21TextProcessingEngine(
            text_encoder=clip.cond_stage_model.qwen3vl_8b,
            tokenizer=clip.tokenizer.qwen3vl_8b,
        )
        self._active_reference_images = []
        self._active_reference_latents = []
        self.forge_objects = ForgeObjects(unet=unet, clip=clip, vae=vae, clipvision=None)
        self.forge_objects_original = self.forge_objects.shallow_copy()
        self.forge_objects_after_applying_lora = self.forge_objects.shallow_copy()

    @torch.inference_mode()
    def get_learned_conditioning(self, prompt: "SdConditioning"):
        memory_management.load_model_gpu(self.forge_objects.clip.patcher)
        is_negative = getattr(prompt, "is_negative_prompt", False)

        if not is_negative:
            if self.ref_latents or self.ini_latent is not None:
                self._active_reference_images.clear()
                self._active_reference_latents.clear()
                self._prepare_reference_images()
            else:
                self._active_reference_images.clear()
                self._active_reference_latents.clear()
                dynamic_args.ref_latents.clear()
                dynamic_args.qwen_image21_image_slots.clear()

        if self._active_reference_images:
            dynamic_args.ref_latents = self._active_reference_latents.copy()
            conditioning = self.text_processing_engine_qwen21(
                prompt,
                images=self._active_reference_images,
            )
            if is_negative:
                self._active_reference_images.clear()
                self._active_reference_latents.clear()
            return conditioning

        dynamic_args.ref_latents.clear()
        dynamic_args.qwen_image21_image_slots.clear()
        return self.text_processing_engine_qwen21(prompt)

    def _prepare_reference_images(self):
        if self._active_reference_images:
            return

        images = list(self.ref_latents)
        if self.ini_latent is not None:
            images.insert(0, self.ini_latent)
            self.ini_latent = None

        if not images:
            return

        for index, image in enumerate(images):
            vision, latent = self.encode_vision(image, index)
            self._active_reference_images.append(vision)
            self._active_reference_latents.append(latent)

    @torch.inference_mode()
    def encode_vision(self, image: torch.Tensor, index: int):
        image = image[:, :, :, :4]
        vision = image[:, :, :, :3]
        samples = image.movedim(-1, 1)
        height, width = samples.shape[-2:]

        if opts.qwen_vae_resize:
            scale = math.sqrt((1024 * 1024) / max(1, width * height))
            width = round(width * scale)
            height = round(height * scale)

        width = max(16, round(width / 16) * 16)
        height = max(16, round(height / 16) * 16)
        samples = F.interpolate(samples, size=(height, width), mode="area")
        latent = self.forge_objects.vae.encode(samples.movedim(1, -1))
        latent = self.forge_objects.vae.first_stage_model.process_in(latent)
        return vision, latent

    @torch.inference_mode()
    def get_prompt_lengths_on_ui(self, prompt):
        return self.text_processing_engine_qwen21.get_prompt_lengths_on_ui(prompt)

    @torch.inference_mode()
    def encode_first_stage(self, x: torch.Tensor):
        if dynamic_args.edit:
            start_image = x[0].movedim(0, -1).mul(0.5).add(0.5).unsqueeze(0)
            if dynamic_args.is_referencing:
                self.ref_latents.append(start_image.cpu())
            else:
                self.ini_latent = start_image.cpu()
        return super().encode_first_stage(x)

    def clear_references(self):
        super().clear_references()
        self.ini_latent = None
        self._active_reference_images.clear()
        self._active_reference_latents.clear()
        dynamic_args.ref_latents.clear()
        dynamic_args.qwen_image21_image_slots.clear()
