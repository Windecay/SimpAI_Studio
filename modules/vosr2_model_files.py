"""Verified VOSR2 source metadata and equivalent VAE config line endings."""

import hashlib
import os
from pathlib import Path
from urllib.parse import urlparse


MODELSCOPE_REVISION = "c8b0ae70beb01a011a74e4d5cfa242f52645a77a"
HF_REVISION = "f24b3061b7f350b81e1907bdcfc27f71fb4ff3f3"
MODELSCOPE_PATH = f"/models/LULALULALU/VOSR_CKPT/resolve/{MODELSCOPE_REVISION}/"
HF_PATH = f"/CSWRY/VOSR/resolve/{HF_REVISION}/"
VAE_CONFIG_PATH = "VOSR2/Qwen-Image-vae-2d/config.json"
VAE_CONFIG_SIZES = (754, 811)
VAE_CONFIG_LF_SHA256 = "86b0706a47e95dc7e469e7895ef1d43a062b2104d0d5fe16c421a5df5d9fd142"


def is_vae_config_path(path):
    normalized = str(path or "").replace("\\", "/").lower()
    return normalized == VAE_CONFIG_PATH.lower() or normalized.endswith(
        "/" + VAE_CONFIG_PATH.lower()
    )


def vae_config_matches(path, expected_size, target_path=None):
    """Return None for unrelated files, otherwise verify either published config."""
    if expected_size not in VAE_CONFIG_SIZES or not is_vae_config_path(target_path or path):
        return None
    try:
        file = Path(path)
        if file.stat().st_size not in VAE_CONFIG_SIZES:
            return False
        normalized = file.read_bytes().replace(b"\r\n", b"\n")
    except OSError:
        return False
    return hashlib.sha256(normalized).hexdigest() == VAE_CONFIG_LF_SHA256


def download_size(url, default_size):
    path = urlparse(str(url or "")).path
    if path == MODELSCOPE_PATH + "Qwen-Image-vae-2d/config.json":
        return 754
    if path == HF_PATH + "Qwen-Image-vae-2d/config.json":
        return 811
    return default_size


def prioritize_urls(urls):
    """Honor the source preference only for this verified VOSR2 URL pair."""
    paths = [urlparse(url).path for url in urls]
    if not paths or not all(path.startswith((MODELSCOPE_PATH, HF_PATH)) for path in paths):
        return urls
    source = os.getenv("SIMPLEAI_DOWNLOAD_SOURCE", "").strip().lower()
    preferred = HF_PATH if source == "huggingface" else MODELSCOPE_PATH
    return sorted(urls, key=lambda url: not urlparse(url).path.startswith(preferred))
