"""Learned spatial latent upscaling for MiniMax H3 video latents.

The network definitions follow the local Minimax H3 latent upscaler project,
while the public helper keeps H3's AV latent and patch-size rules in Studio.
"""

import gc
import glob
import logging
import os
import re

import torch
import torch.nn as nn
import torch.nn.functional as F
from einops import rearrange

import folder_paths


LOG = logging.getLogger("simpai_h3_latent_upscaler")
H3_LATENT_UPSCALE_FOLDER = "latent_upscale_models"
H3_VIDEO_LATENT_CHANNELS = 24
H3_DIT_SPATIAL_MULTIPLE = 2
H3_SPATIAL_DOWNSCALE = 16
H3_LEARNED_VARIANTS = ("2d", "3d")
H3_LEARNED_PRECISIONS = ("bf16", "fp16", "fp32")
H3_UPSCALER_MEMORY_SAFETY_BYTES = 512 * 1024 * 1024
H3_UPSCALER_FEATURE_MULTIPLIER = 6

LATENTS_MEAN = [
    0.858090341091156, -0.9606591463088989, 1.0661640167236328, -0.5090325474739075,
    -0.2727581858634949, -1.3675414323806763, -0.2553254961967468, -0.26907554268836975,
    -0.5376840829849243, -0.0464097298681736, 0.6657370328903198, 0.19690127670764923,
    -0.5460608005523682, -0.4035342037677765, -0.23683024942874908, 0.2592845264368745,
    -0.30133944749832153, 0.211341992020607, -1.1206848621368408, 0.3581933379173279,
    -0.04225143790245056, 0.2604829967021942, 0.22864092886447906, 0.7056031823158264,
]
LATENTS_STD = [
    1.2223774194717407, 1.2767263650894165, 1.6831774711608887, 1.7549455165863037,
    1.5636216402053833, 2.194143533706665, 0.9653137922286987, 1.0569885969161987,
    0.841948926448822, 0.7729952931404114, 1.8955937623977661, 0.946841835975647,
    0.7996809482574463, 0.44988900423049927, 0.7197399735450745, 0.6936293244361877,
    2.961095094680786, 2.7694199085235596, 3.0496184825897217, 2.1088054180145264,
    3.276226282119751, 3.1627357006073, 2.2816812992095947, 2.6127843856811523,
]


if H3_LATENT_UPSCALE_FOLDER not in folder_paths.folder_names_and_paths:
    folder_paths.add_model_folder_path(
        H3_LATENT_UPSCALE_FOLDER,
        os.path.join(folder_paths.models_dir, H3_LATENT_UPSCALE_FOLDER),
    )


def scan_h3_latent_upscaler_models():
    """Return model names without making model loading part of node import."""
    names = []
    for model_dir in folder_paths.get_folder_paths(H3_LATENT_UPSCALE_FOLDER):
        for pattern in ("*.safetensors", "*.pth"):
            names.extend(
                os.path.relpath(path, model_dir)
                for path in glob.glob(os.path.join(model_dir, pattern))
            )
    names = sorted(set(name.replace("\\", "/") for name in names))
    return names or ["(no compatible H3 latent upscaler model)"]


def _normalization(device, dtype):
    mean = torch.tensor(LATENTS_MEAN, device=device, dtype=dtype).view(1, -1, 1, 1, 1)
    std = torch.tensor(LATENTS_STD, device=device, dtype=dtype).view(1, -1, 1, 1, 1)
    return mean, std


def _normalization_group(channels):
    return nn.GroupNorm(32, channels)


def _zero_module(module):
    for parameter in module.parameters():
        parameter.detach().zero_()
    return module


class _ResBlockEmb2D(nn.Module):
    def __init__(self, channels, emb_channels, dropout=0.1):
        super().__init__()
        self.in_layers = nn.Sequential(
            _normalization_group(channels),
            nn.SiLU(),
            nn.Conv2d(channels, channels, 3, padding=1),
        )
        self.emb_layers = nn.Sequential(
            nn.SiLU(),
            nn.Linear(emb_channels, 2 * channels),
        )
        self.out_norm = _normalization_group(channels)
        self.out_layers = nn.Sequential(
            nn.SiLU(),
            nn.Dropout(p=dropout),
            _zero_module(nn.Conv2d(channels, channels, 3, padding=1)),
        )

    def forward(self, x, emb):
        h = self.in_layers(x)
        emb_out = self.emb_layers(emb).to(dtype=h.dtype)
        while emb_out.ndim < h.ndim:
            emb_out = emb_out[..., None]
        scale, shift = torch.chunk(emb_out, 2, dim=1)
        h = self.out_norm(h) * (1 + scale) + shift
        return x + self.out_layers(h)


class _TemporalConv2D(nn.Module):
    def __init__(self, channels, kernel_size=5):
        super().__init__()
        self.norm = _normalization_group(channels)
        self.dwconv = nn.Conv3d(
            channels,
            channels,
            kernel_size=(kernel_size, 1, 1),
            padding=(kernel_size // 2, 0, 0),
            groups=channels,
        )
        self.pwconv = nn.Conv3d(channels, channels, kernel_size=1)
        nn.init.zeros_(self.pwconv.weight)
        nn.init.zeros_(self.pwconv.bias)

    def forward(self, x):
        batch, channels, frames, height, width = x.shape
        h = rearrange(x, "b c t h w -> (b t) c h w")
        h = self.norm(h)
        h = rearrange(h, "(b t) c h w -> b c t h w", b=batch, t=frames)
        return x + self.pwconv(self.dwconv(F.silu(h)))


class _LatentResizer2D(nn.Module):
    def __init__(self, in_channels, channels, in_blocks, out_blocks, dropout, temporal_kernel):
        super().__init__()
        self.conv_in = nn.Conv2d(in_channels, channels, 3, padding=1)
        self.embed = nn.Sequential(nn.Linear(1, 64), nn.SiLU(), nn.Linear(64, 64))
        self.in_blocks = nn.ModuleList(
            _ResBlockEmb2D(channels, 64, dropout) for _ in range(in_blocks)
        )
        self.out_blocks = nn.ModuleList(
            _ResBlockEmb2D(channels, 64, dropout) for _ in range(out_blocks)
        )
        self.norm_out = _normalization_group(channels)
        self.conv_out = nn.Conv2d(channels, in_channels, 3, padding=1)

    def forward(self, x, scale, target_hw):
        emb = self.embed(
            torch.tensor([scale - 1.0], dtype=x.dtype, device=x.device).view(1, 1)
        )
        out = self.conv_in(x)
        for index, block in enumerate(self.in_blocks):
            out = block(out, emb.expand(out.shape[0], -1))
        out = F.interpolate(out, size=target_hw, mode="bilinear", align_corners=False)
        for index, block in enumerate(self.out_blocks):
            out = block(out, emb.expand(out.shape[0], -1))
        return self.conv_out(F.silu(self.norm_out(out)))


class _VideoLatentResizer2D(nn.Module):
    def __init__(self, in_channels, channels, in_blocks, out_blocks, dropout, temporal_kernel):
        super().__init__()
        self.resizer = _LatentResizer2D(
            in_channels, channels, in_blocks, out_blocks, dropout, temporal_kernel
        )
        self.temporal_blocks = nn.ModuleList(
            [_TemporalConv2D(channels, temporal_kernel), _TemporalConv2D(channels, temporal_kernel)]
        )

    def forward(self, x, scale, target_hw):
        batch, channels, frames, height, width = x.shape
        emb = self.resizer.embed(
            torch.tensor([scale - 1.0], dtype=x.dtype, device=x.device).view(1, 1)
        )
        out = self.resizer.conv_in(rearrange(x, "b c t h w -> (b t) c h w"))
        for index, block in enumerate(self.resizer.in_blocks):
            out = block(out, emb.expand(batch * frames, -1))
            if index % 2 == 0:
                out_3d = rearrange(out, "(b t) c h w -> b c t h w", b=batch, t=frames)
                out = rearrange(
                    self.temporal_blocks[0](out_3d),
                    "b c t h w -> (b t) c h w",
                )
        out = F.interpolate(out, size=target_hw, mode="bilinear", align_corners=False)
        for index, block in enumerate(self.resizer.out_blocks):
            out = block(out, emb.expand(batch * frames, -1))
            if index % 2 == 0:
                out_3d = rearrange(out, "(b t) c h w -> b c t h w", b=batch, t=frames)
                out = rearrange(
                    self.temporal_blocks[1](out_3d),
                    "b c t h w -> (b t) c h w",
                )
        out = self.resizer.conv_out(F.silu(self.resizer.norm_out(out)))
        return rearrange(out, "(b t) c h w -> b c t h w", b=batch, t=frames)


class _ResBlockEmb3D(nn.Module):
    def __init__(self, channels, emb_channels, dropout=0.1):
        super().__init__()
        self.in_layers = nn.Sequential(
            _normalization_group(channels),
            nn.SiLU(),
            nn.Conv3d(channels, channels, 3, padding=1),
        )
        self.emb_layers = nn.Sequential(
            nn.SiLU(),
            nn.Linear(emb_channels, 2 * channels),
        )
        self.out_norm = _normalization_group(channels)
        self.out_layers = nn.Sequential(
            nn.SiLU(),
            nn.Dropout(p=dropout),
            _zero_module(nn.Conv3d(channels, channels, 3, padding=1)),
        )

    def forward(self, x, emb):
        h = self.in_layers(x)
        emb_out = self.emb_layers(emb).to(dtype=h.dtype)
        while emb_out.ndim < h.ndim:
            emb_out = emb_out[..., None]
        scale, shift = torch.chunk(emb_out, 2, dim=1)
        h = self.out_norm(h) * (1 + scale) + shift
        return x + self.out_layers(h)


class _TemporalConv3D(nn.Module):
    def __init__(self, channels, kernel_size=5):
        super().__init__()
        self.norm = _normalization_group(channels)
        self.dwconv = nn.Conv3d(
            channels,
            channels,
            kernel_size=(kernel_size, 1, 1),
            padding=(kernel_size // 2, 0, 0),
            groups=channels,
        )
        self.pwconv = nn.Conv3d(channels, channels, 1)
        nn.init.zeros_(self.pwconv.weight)
        nn.init.zeros_(self.pwconv.bias)

    def forward(self, x):
        return x + self.pwconv(self.dwconv(F.silu(self.norm(x))))


class _LatentResizer3D(nn.Module):
    def __init__(self, in_channels, channels, in_blocks, out_blocks, dropout, temporal_kernel):
        super().__init__()
        self.conv_in = nn.Conv3d(in_channels, channels, 3, padding=1)
        self.embed = nn.Sequential(nn.Linear(1, 64), nn.SiLU(), nn.Linear(64, 64))
        self.in_blocks = nn.ModuleList()
        self.out_blocks = nn.ModuleList()
        for index in range(in_blocks):
            self.in_blocks.append(_ResBlockEmb3D(channels, 64, dropout))
            if index % 2 == 0:
                self.in_blocks.append(_TemporalConv3D(channels, temporal_kernel))
        for index in range(out_blocks):
            self.out_blocks.append(_ResBlockEmb3D(channels, 64, dropout))
            if index % 2 == 0:
                self.out_blocks.append(_TemporalConv3D(channels, temporal_kernel))
        self.norm_out = _normalization_group(channels)
        self.conv_out = nn.Conv3d(channels, in_channels, 3, padding=1)

    def forward(self, x, scale, target_size):
        emb = self.embed(
            torch.tensor([scale - 1.0], dtype=x.dtype, device=x.device).view(1, 1)
        )
        out = self.conv_in(x)
        for block in self.in_blocks:
            out = block(out, emb.expand(out.shape[0], -1)) if isinstance(block, _ResBlockEmb3D) else block(out)
        out = F.interpolate(out, size=target_size, mode="trilinear", align_corners=False)
        for block in self.out_blocks:
            out = block(out, emb.expand(out.shape[0], -1)) if isinstance(block, _ResBlockEmb3D) else block(out)
        return self.conv_out(F.silu(self.norm_out(out)))


_MODEL_CACHE = {}


def _resolve_model_path(model_name):
    if not model_name or model_name.startswith("("):
        raise ValueError("Choose a compatible H3 latent upscaler model")
    path = folder_paths.get_full_path(H3_LATENT_UPSCALE_FOLDER, model_name)
    if path is None:
        for model_dir in folder_paths.get_folder_paths(H3_LATENT_UPSCALE_FOLDER):
            candidate = os.path.join(model_dir, model_name)
            if os.path.isfile(candidate):
                path = candidate
                break
    if path is None or not os.path.isfile(path):
        raise FileNotFoundError(f"H3 latent upscaler model was not found: {model_name}")
    return path


def _load_state_dict(path):
    if path.endswith(".safetensors"):
        from safetensors.torch import load_file

        state_dict = load_file(path, device="cpu")
    else:
        state_dict = torch.load(path, map_location="cpu", weights_only=False)
    if isinstance(state_dict, dict) and "model" in state_dict:
        state_dict = state_dict["model"]
    if not isinstance(state_dict, dict):
        raise ValueError("H3 latent upscaler checkpoint does not contain a state dict")
    if any(key.startswith("upscaler.") for key in state_dict):
        state_dict = {
            key[len("upscaler."):]: value
            for key, value in state_dict.items()
            if key.startswith("upscaler.")
        }
    return {
        key: value.to(torch.float16) if getattr(value, "dtype", None) == torch.float8_e4m3fn else value
        for key, value in state_dict.items()
    }


def _detect_architecture(state_dict, variant):
    if variant == "2d":
        prefix = "resizer."
        conv_key = "resizer.conv_in.weight"
        block_pattern = r"resizer\.(in_blocks|out_blocks)\.(\d+)\.in_layers\."
        if conv_key not in state_dict:
            raise ValueError("The selected checkpoint is not a compatible H3 2D upscaler")
    else:
        prefix = ""
        conv_key = "conv_in.weight"
        block_pattern = r"(in_blocks|out_blocks)\.(\d+)\.in_layers\."
        if conv_key not in state_dict:
            raise ValueError("The selected checkpoint is not a compatible H3 3D upscaler")
    conv_weight = state_dict[conv_key]
    if len(conv_weight.shape) not in (4, 5) or int(conv_weight.shape[1]) != H3_VIDEO_LATENT_CHANNELS:
        raise ValueError(
            "The selected H3 latent upscaler must accept 24 visual latent channels; "
            f"got {tuple(conv_weight.shape)}"
        )
    block_ids = {"in_blocks": set(), "out_blocks": set()}
    for key in state_dict:
        match = re.match(block_pattern, key)
        if match:
            block_ids[match.group(1)].add(int(match.group(2)))
    return {
        "in_channels": int(conv_weight.shape[1]),
        "channels": int(conv_weight.shape[0]),
        "in_blocks": len(block_ids["in_blocks"]) or 12,
        "out_blocks": len(block_ids["out_blocks"]) or 12,
        "dropout": 0.1,
        "temporal_kernel": next(
            (
                int(value.shape[2])
                for key, value in state_dict.items()
                if key.endswith("dwconv.weight") and len(value.shape) == 5
            ),
            5,
        ),
        "prefix": prefix,
    }


def _model_dtype(precision):
    return {
        "bf16": torch.bfloat16,
        "fp16": torch.float16,
        "fp32": torch.float32,
    }[precision]


def _model_device(model):
    try:
        return next(model.parameters()).device
    except (StopIteration, AttributeError):
        return torch.device("cpu")


def _model_parameter_bytes(model):
    total = 0
    for parameter in model.parameters():
        total += parameter.numel() * parameter.element_size()
    for buffer in model.buffers():
        total += buffer.numel() * buffer.element_size()
    return total


def _load_model(model_name, variant, device, precision):
    path = _resolve_model_path(model_name)
    cache_key = (os.path.abspath(path), variant, precision)
    model = _MODEL_CACHE.get(cache_key)
    if model is None:
        state_dict = _load_state_dict(path)
        config = _detect_architecture(state_dict, variant)
        if variant == "2d":
            model = _VideoLatentResizer2D(
                config["in_channels"],
                config["channels"],
                config["in_blocks"],
                config["out_blocks"],
                config["dropout"],
                config["temporal_kernel"],
            )
        else:
            model = _LatentResizer3D(
                config["in_channels"],
                config["channels"],
                config["in_blocks"],
                config["out_blocks"],
                config["dropout"],
                config["temporal_kernel"],
            )
        missing, unexpected = model.load_state_dict(state_dict, strict=False)
        meaningful_missing = [key for key in missing if "attn" not in key]
        if meaningful_missing or unexpected:
            raise ValueError(
                "The selected H3 latent upscaler checkpoint does not match its declared "
                f"{variant} architecture (missing={meaningful_missing[:3]}, unexpected={unexpected[:3]})"
            )
        del state_dict
        model = model.to(device="cpu", dtype=_model_dtype(precision)).eval()
        _MODEL_CACHE[cache_key] = model
        LOG.info(
            "Loaded H3 learned latent upscaler: model=%s variant=%s precision=%s channels=%d",
            os.path.basename(path), variant, precision, _model_hidden_channels(model),
        )
    target_dtype = _model_dtype(precision)
    if _model_device(model) != device or next(model.parameters(), None).dtype != target_dtype:
        model = model.to(device=device, dtype=target_dtype)
    return model


def _pad_latent_patch_size(samples):
    pad_h = (-int(samples.shape[-2])) % H3_DIT_SPATIAL_MULTIPLE
    pad_w = (-int(samples.shape[-1])) % H3_DIT_SPATIAL_MULTIPLE
    if pad_h or pad_w:
        samples = F.pad(samples, (0, pad_w, 0, pad_h))
    return samples


def _model_hidden_channels(model):
    conv_in = getattr(model, "conv_in", None)
    if conv_in is None:
        resizer = getattr(model, "resizer", None)
        conv_in = getattr(resizer, "conv_in", None)
    return int(getattr(conv_in, "out_channels", 512))


def _estimate_upscaler_memory(video_latent, target_hw, model, precision, variant):
    """Estimate a conservative inference peak for device selection."""
    batch, channels, frames, source_h, source_w = map(int, video_latent.shape)
    target_h, target_w = map(int, target_hw)
    dtype_bytes = torch.tensor([], dtype=_model_dtype(precision)).element_size()
    model_bytes = _model_parameter_bytes(model)
    input_bytes = batch * channels * frames * source_h * source_w * dtype_bytes
    output_bytes = batch * channels * frames * target_h * target_w * dtype_bytes
    feature_area = max(source_h * source_w, target_h * target_w)
    feature_bytes = (
        batch
        * _model_hidden_channels(model)
        * frames
        * feature_area
        * dtype_bytes
    )
    feature_multiplier = H3_UPSCALER_FEATURE_MULTIPLIER
    if variant == "3d":
        feature_multiplier += 2
    return (
        model_bytes
        + input_bytes * 4
        + output_bytes * 3
        + feature_bytes * feature_multiplier
        + H3_UPSCALER_MEMORY_SAFETY_BYTES
    )


def _free_memory_for_upscaler(device, required_bytes):
    try:
        import comfy.model_management as model_management

        model_management.free_memory(int(required_bytes), device)
        return int(model_management.get_free_memory(device))
    except Exception as err:
        LOG.debug("Unable to query or free Comfy memory for H3 upscaler: %s", err)
        try:
            if device.type == "cuda":
                return int(torch.cuda.mem_get_info(device)[0])
        except Exception:
            pass
        return None


def _empty_upscaler_cache(device):
    if getattr(device, "type", None) != "cuda":
        return
    try:
        import comfy.model_management as model_management

        model_management.soft_empty_cache(True)
    except Exception:
        try:
            torch.cuda.empty_cache()
        except Exception:
            pass


def _offload_upscaler_model(model):
    try:
        if _model_device(model).type == "cuda":
            model.to(device="cpu")
            gc.collect()
            _empty_upscaler_cache(torch.device("cuda"))
    except Exception as err:
        LOG.debug("Unable to offload H3 latent upscaler model: %s", err)


def _is_cuda_oom(error):
    return isinstance(error, torch.cuda.OutOfMemoryError) or "out of memory" in str(error).lower()


def _run_upscaler_once(model, video_latent, compute_device, compute_dtype, variant, scale_hint, target_hw):
    source = video_latent.to(device=compute_device, dtype=compute_dtype).contiguous()
    mean, std = _normalization(compute_device, compute_dtype)
    source = (source - mean) / std
    with torch.inference_mode():
        if variant == "2d":
            output = model(source, scale_hint, target_hw)
        else:
            output = model(
                source,
                scale_hint,
                (int(source.shape[2]), int(target_hw[0]), int(target_hw[1])),
            )
    del source
    output = _pad_latent_patch_size(output * std + mean)
    return output


def _device_for_request(device):
    if device in (None, "auto"):
        try:
            import comfy.model_management

            return comfy.model_management.get_torch_device()
        except Exception:
            return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device == "cuda" and not torch.cuda.is_available():
        return torch.device("cpu")
    return torch.device(device)


def upscale_h3_video_latent(
    video_latent,
    *,
    scale_by,
    target_width=None,
    target_height=None,
    model_name,
    variant,
    precision="bf16",
    device="auto",
):
    """Apply learned H3 spatial upscaling to the visual latent only."""
    if variant not in H3_LEARNED_VARIANTS:
        raise ValueError(f"Unsupported H3 learned upscaler variant: {variant}")
    if precision not in H3_LEARNED_PRECISIONS:
        raise ValueError(f"Unsupported H3 learned upscaler precision: {precision}")
    try:
        scale_value = float(scale_by)
    except (TypeError, ValueError) as err:
        raise ValueError("H3 learned upscale scale_by must be a number") from err
    if not 1.0 <= scale_value <= 4.0:
        raise ValueError("H3 learned upscale scale_by must be between 1.0 and 4.0")
    if video_latent.ndim == 4:
        video_latent = video_latent.unsqueeze(2)
        squeeze_time = True
    elif video_latent.ndim == 5:
        squeeze_time = False
    else:
        raise ValueError(f"H3 visual latent must be 4D or 5D, got {tuple(video_latent.shape)}")
    if video_latent.shape[1] != H3_VIDEO_LATENT_CHANNELS:
        raise ValueError(
            f"H3 visual latent must have 24 channels, got {int(video_latent.shape[1])}"
        )
    if target_width is not None and target_height is not None:
        if target_width % 32 or target_height % 32:
            raise ValueError("H3 learned upscale target width and height must be multiples of 32")
        target_hw = (int(target_height) // H3_SPATIAL_DOWNSCALE, int(target_width) // H3_SPATIAL_DOWNSCALE)
    else:
        target_hw = (
            max(H3_DIT_SPATIAL_MULTIPLE, round(video_latent.shape[-2] * scale_value)),
            max(H3_DIT_SPATIAL_MULTIPLE, round(video_latent.shape[-1] * scale_value)),
        )
    target_hw = tuple(
        value + (-value) % H3_DIT_SPATIAL_MULTIPLE
        for value in target_hw
    )
    if tuple(video_latent.shape[-2:]) == target_hw:
        return video_latent.squeeze(2) if squeeze_time else video_latent

    scale_hint = (
        scale_value
        if scale_by is not None
        else (float(target_hw[0]) / float(video_latent.shape[-2]))
    )
    requested_device = _device_for_request(device)
    auto_device = device in (None, "auto")
    compute_dtype = _model_dtype(precision)
    model = None
    required_memory = None
    compute_device = requested_device

    if requested_device.type == "cuda":
        # Load once on CPU so device selection can use the actual checkpoint size.
        model = _load_model(model_name, variant, torch.device("cpu"), precision)
        required_memory = _estimate_upscaler_memory(
            video_latent,
            target_hw,
            model,
            precision,
            variant,
        )
        free_memory = _free_memory_for_upscaler(requested_device, required_memory)
        if free_memory is not None and free_memory < required_memory:
            message = (
                "H3 learned latent upscaler needs about "
                f"{required_memory / 1024**3:.2f} GiB, but only "
                f"{free_memory / 1024**3:.2f} GiB is available on {requested_device}"
            )
            if auto_device:
                LOG.warning("%s; using CPU for this upscale request", message)
                compute_device = torch.device("cpu")
            else:
                raise RuntimeError(message + "; choose upscaler_device=auto or cpu")
        else:
            LOG.info(
                "H3 learned latent upscaler using %s: estimated_peak=%.2f GiB free=%.2f GiB",
                requested_device,
                required_memory / 1024**3,
                free_memory / 1024**3 if free_memory is not None else -1.0,
            )

    if model is None or _model_device(model) != compute_device:
        try:
            model = _load_model(model_name, variant, compute_device, precision)
        except RuntimeError as err:
            if not (auto_device and compute_device.type == "cuda" and _is_cuda_oom(err)):
                raise
            LOG.warning("H3 learned latent upscaler could not fit on %s; retrying on CPU", compute_device)
            _offload_upscaler_model(model)
            compute_device = torch.device("cpu")
            model = _load_model(model_name, variant, compute_device, precision)

    try:
        try:
            output = _run_upscaler_once(
                model,
                video_latent,
                compute_device,
                compute_dtype,
                variant,
                scale_hint,
                target_hw,
            )
        except RuntimeError as err:
            if not (auto_device and compute_device.type == "cuda" and _is_cuda_oom(err)):
                raise
            LOG.warning("H3 learned latent upscaler ran out of memory on %s; retrying on CPU", compute_device)
            _offload_upscaler_model(model)
            compute_device = torch.device("cpu")
            model = _load_model(model_name, variant, compute_device, precision)
            output = _run_upscaler_once(
                model,
                video_latent,
                compute_device,
                compute_dtype,
                variant,
                scale_hint,
                target_hw,
            )
    finally:
        _offload_upscaler_model(model)

    output = output.to(device=video_latent.device, dtype=video_latent.dtype)
    return output.squeeze(2) if squeeze_time else output


__all__ = [
    "H3_LEARNED_PRECISIONS",
    "H3_LEARNED_VARIANTS",
    "scan_h3_latent_upscaler_models",
    "upscale_h3_video_latent",
]
