"""Local Hugging Face component loading with native ComfyUI outputs."""

import json
from pathlib import Path

import torch
from comfy import sd, utils
from transformers import AutoTokenizer

from .loaders import DTYPES, load_clip_state, load_model_state
from .text_encoder import MOSSImageTokenizer


def component(root, name):
    path = Path(root).expanduser().resolve() / name
    config = json.loads((path / "config.json").read_text())
    return path, config


def read_weights(path, stem):
    index = path / f"{stem}.safetensors.index.json"
    if not index.exists():
        return utils.load_torch_file(str(path / f"{stem}.safetensors"), safe_load=True)
    mapping = json.loads(index.read_text())["weight_map"]
    state = {}
    for filename in sorted(set(mapping.values())):
        shard = (path / filename).resolve()
        if not shard.is_relative_to(path.resolve()):
            raise ValueError("Shard path escapes the component directory")
        values = utils.load_torch_file(str(shard), safe_load=True)
        expected = {key for key, file in mapping.items() if file == filename}
        if values.keys() != expected:
            raise ValueError(f"Shard contents do not match index: {filename}")
        state.update(values)
    return state


class HFTokenizer(MOSSImageTokenizer):
    def __init__(self, embedding_directory=None, tokenizer_data={}):
        super().__init__(embedding_directory, tokenizer_data)
        self.qwen35_9b.tokenizer = AutoTokenizer.from_pretrained(
            tokenizer_data["hf_path"], local_files_only=True,
        )


def load_hf_model(root, weight_dtype, disable_dynamic=False):
    path, config = component(root, "transformer")
    if config.get("_class_name") not in ("MOSImageTransformer", "MOSSImageTransformer"):
        raise ValueError("Expected a MOSS-Image transformer")
    for key, value in {"text_dim": 4096, "freq_dim": 256,
                       "latent_channels": 128, "rope_base": 10000.0}.items():
        if config.get(key) != value:
            raise ValueError(f"Unsupported MOSS-Image {key}: {config.get(key)}")
    state = read_weights(path, "diffusion_pytorch_model")
    patcher = load_model_state(
        state, DTYPES[weight_dtype], disable_dynamic,
        fp8_optimizations=weight_dtype == "fp8_e4m3fn_fast",
    )
    patcher.cached_patcher_init = (load_hf_model, (root, weight_dtype))
    return patcher


def load_hf_clip(root, device, disable_dynamic=False):
    path, config = component(root, "text_encoder")
    if config.get("model_type") != "qwen3_5":
        raise ValueError("Expected a Qwen3.5 text encoder")
    tokenizer = Path(root).expanduser().resolve() / "tokenizer"
    state = read_weights(path, "model")
    clip = load_clip_state(state, device, disable_dynamic, HFTokenizer, {"hf_path": str(tokenizer)})
    clip.patcher.cached_patcher_init = (load_hf_clip_patcher, (root, device))
    return clip


def load_hf_clip_patcher(root, device, disable_dynamic=False):
    return load_hf_clip(root, device, disable_dynamic).patcher


def load_hf_vae(root):
    path, config = component(root, "vae")
    if config.get("_class_name") != "AutoencoderKLFlux2":
        raise ValueError("Expected an AutoencoderKLFlux2 VAE")
    vae = sd.VAE(sd=read_weights(path, "diffusion_pytorch_model"), dtype=torch.float32)
    vae.throw_exception_if_invalid()
    return vae
