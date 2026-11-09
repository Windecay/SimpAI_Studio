"""SnapRef (simple node): up to eight pictures of a character, Mode, Strength, Fidelity.
Everything else at the trained defaults; the full set of inputs is on SnapRef (Advanced) in __init__.py."""
from __future__ import annotations

import logging
import math
import os

import torch

import comfy.patcher_extension
import folder_paths

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".avif")
MODES = {"Character & Style": "cs", "Character": "char"}
MAX_REFERENCES = 8


def input_images() -> list[str]:
    d = folder_paths.get_input_directory()
    try:
        return sorted(f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f)) and f.lower().endswith(IMAGE_EXTS))
    except OSError:
        return []


def load_input_image(name: str) -> torch.Tensor:
    """ComfyUI input image -> IMAGE [1, H, W, 3] (EXIF orientation applied, alpha flattened on white)."""
    import numpy as np
    from PIL import Image, ImageOps
    import node_helpers
    img = node_helpers.pillow(Image.open, folder_paths.get_annotated_filepath(name))
    img = node_helpers.pillow(ImageOps.exif_transpose, img)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    return torch.from_numpy(np.asarray(img.convert("RGB")).astype(np.float32) / 255.0)[None]


def snapref_files() -> list[str]:
    """SnapRef weights in models/loras: bf16 before FP8, newer version names first (v2a-pre2, pre1, v1b, v1a)."""
    names = [n for n in folder_paths.get_filename_list("loras") if "snapref" in n.lower()]
    return sorted(names, key=lambda n: ("fp8" in n.lower(), [-ord(c) for c in os.path.basename(n).lower()])) \
        or ["snapref_v1a.safetensors"]


def make_simple_node(core):
    """core = the SnapRef module (adapters, encoder, wrappers). Returns the node class."""

    class SnapRefSimple:
        @classmethod
        def INPUT_TYPES(cls):
            images = input_images()
            inputs = {"required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "adapter": (snapref_files(), {"tooltip": "SnapRef weights (models/loras)"}),
                "reference": (images, {"image_upload": True, "tooltip": "a picture of the character"}),
                "mode": (list(MODES), {"default": "Character & Style",
                                       "tooltip": "Character & Style: character and art style from the picture. Character: "
                                                  "only the character; the style comes from the model and your prompt"}),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05,
                                       "tooltip": "how much the picture counts: 1 = as trained, 0 = off, 2 = twice"}),
                "fidelity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.05,
                                       "tooltip": "1 = keep every detail of the picture; lower = follow the prompt more freely"}),
            }, "optional": {
                "reference_2": (["none"] + images, {"default": "none",
                                                   "tooltip": "a second picture of the same character (e.g. full body)"}),
                "strength_2": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05,
                                         "tooltip": "how much the second picture counts"}),
            }}
            for i in range(3, MAX_REFERENCES + 1):
                inputs["optional"][f"reference_{i}"] = (["none"] + images, {"default": "none"})
                inputs["optional"][f"strength_{i}"] = ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05})
            return inputs

        RETURN_TYPES = ("MODEL",)
        FUNCTION = "apply"
        CATEGORY = "SnapRef"
        DESCRIPTION = "Reference a character with up to eight pictures. Write only the scene in the prompt."

        @classmethod
        def IS_CHANGED(cls, reference=None, reference_2="none", **kw):
            out = []
            for n in (reference, reference_2, *(kw.get(f"reference_{i}") for i in range(3, MAX_REFERENCES + 1))):
                if n and n != "none":
                    p = folder_paths.get_annotated_filepath(n)
                    out.append(f"{n}:{os.path.getmtime(p) if os.path.exists(p) else 0}")
            return "|".join(out)

        @classmethod
        def VALIDATE_INPUTS(cls, reference=None, reference_2="none", **kw):
            for n in (reference, reference_2, *(kw.get(f"reference_{i}") for i in range(3, MAX_REFERENCES + 1))):
                if n and n != "none" and not folder_paths.exists_annotated_filepath(n):
                    return f"Invalid image file: {n}"
            return True

        def apply(self, model, clip, vae, adapter, reference, mode, strength, fidelity, reference_2="none", strength_2=1.0, **kw):
            path = folder_paths.get_full_path_or_raise("loras", adapter)
            if path not in core._adapters:
                core._adapters[path] = core._Adapter(path)
            ad = core._adapters[path]
            refs, weights = [], []
            pairs = [(reference, strength), (reference_2, strength_2)]
            pairs.extend((kw.get(f"reference_{i}", "none"), kw.get(f"strength_{i}", 1.0))
                         for i in range(3, MAX_REFERENCES + 1))
            for name, w in pairs:
                if name and name != "none" and w > 0:
                    refs.append(load_input_image(name))
                    weights.append(float(w))
            if not refs:
                return (model,)
            core._adapter_block_map(ad.block_indices, model.get_model_object("diffusion_model"))
            latents = [core._encode_image(model, vae, px, 1.0)[0] for px in refs]
            cond = clip.encode_from_tokens_scheduled(clip.tokenize(""))[0]
            # Fidelity f: the negative branch also reads the picture, weighted (1 - f); f = 1 is the trained default
            uncond_bias = None if fidelity >= 1.0 else math.log(max(1.0 - float(fidelity), 1e-6))
            m = model.clone()
            m.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, core.WRAPPER_KEY,
                                   core._make_wrapper(ad, latents, cond, MODES[mode], False, 0.0, weights, uncond_bias))
            wr = m.wrappers[comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL]
            m.wrappers[comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL] = {core.WRAPPER_KEY: wr.pop(core.WRAPPER_KEY), **wr}
            logging.info(f"[SnapRef] {adapter}: {len(refs)} picture(s), {mode}, strength {weights}, fidelity {fidelity}")
            return (m,)

    return SnapRefSimple
