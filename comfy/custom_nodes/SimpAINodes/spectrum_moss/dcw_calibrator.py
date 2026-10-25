"""DCW online calibrator — node seam over the shared anima_lora calibrator.

The calibrator class (``FusionHead`` + ``OnlineDCWCalibrator`` +
``from_safetensors``) is pure compute and lives in anima_lora — the single
source of truth, with full ``dcw_v6_fei_replace`` / ``dcw_v6_fei_concat`` schema
support. It is imported below (resolved against the live tree or the bundled
``_vendor/`` subset by the sys.path bootstrap in ``__init__.py``). This module
keeps only the **node seam**: the artifact auto-download + the Anima-DiT-specific
``setup_dcw_calibrator`` (recovers the trainer's (B, L, 1024) c_pool via
``dit.preprocess_text_embeds``).

The calibrator loads a safetensors artifact (head weights + standardization
stats), observes the LL-band Haar norm of the post-CFG velocity (or, for v6, the
pre-forward 2-band FEI) over the first ``k_warmup`` steps, fires the MLP at step
``k_warmup`` to predict per-prompt λ̂*_p, then applies::

    λ_i = baseline_lambda · (1 − σ_i)                                      [all i]
        + α̂ · gain · (1 − σ_i)         for target_start ≤ i < target_end

clamped to ±0.05.
"""

from __future__ import annotations

import logging
import os
import threading
import time
import urllib.request
from typing import Optional

import torch

import folder_paths

# The fusion-head calibrator (DCW ``auto`` mode) lived in anima_lora, but the
# DCW line — including the trainable adjuster — was retired from that repo
# (archived 2026-07-05). The heavyweight ceiling-capped fusion head is NOT
# vendored here; ``auto`` mode therefore degrades to manual DCW when the class
# is unavailable (``setup_dcw_calibrator`` returns None → ``install_dcw`` falls
# back to the scalar ``dcw_lambda`` × schedule path). Manual DCW is fully
# self-contained (see ``dcw.py``) and unaffected.
try:
    from ._vendor.library.inference.corrections.dcw_calibrator import OnlineDCWCalibrator
except ImportError:
    OnlineDCWCalibrator = None

from .mod_guidance import _extract_raw_and_t5

logger = logging.getLogger(__name__)

DEFAULT_CALIBRATOR_FILENAME = "fusion_head-0506.safetensors"
DEFAULT_CALIBRATOR_URL = (
    "https://github.com/sorryhyun/ComfyUI-Spectrum-KSampler/releases/download/"
    "0429/fusion_head-0506.safetensors"
)
DEFAULT_CALIBRATOR_SUBDIR = "anima_dcw_calibrator"

_DOWNLOAD_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Auto-download
# ---------------------------------------------------------------------------


def get_default_calibrator_path() -> str:
    """Return local path to the default fusion-head artifact, downloading if missing."""
    target_dir = os.path.join(folder_paths.models_dir, DEFAULT_CALIBRATOR_SUBDIR)
    target_path = os.path.join(target_dir, DEFAULT_CALIBRATOR_FILENAME)
    if os.path.exists(target_path) and os.path.getsize(target_path) > 0:
        return target_path

    with _DOWNLOAD_LOCK:
        if os.path.exists(target_path) and os.path.getsize(target_path) > 0:
            return target_path
        try:
            os.makedirs(target_dir, exist_ok=True)
        except OSError as e:
            raise RuntimeError(
                f"DCW calibrator: cannot create directory {target_dir} ({e}). "
                f"If ComfyUI is installed under Program Files, move it or run as admin. "
                f"Otherwise download manually from {DEFAULT_CALIBRATOR_URL} and place it at {target_path}."
            ) from e
        tmp_path = target_path + ".download"
        logger.info(
            f"DCW calibrator: downloading default fusion head from {DEFAULT_CALIBRATOR_URL}"
        )
        try:
            req = urllib.request.Request(
                DEFAULT_CALIBRATOR_URL,
                headers={"User-Agent": "comfyui-spectrum/dcw_calibrator"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                total = int(resp.headers.get("Content-Length") or 0)
                downloaded = 0
                next_log = 2 * 1024 * 1024
                with open(tmp_path, "wb") as fh:
                    while True:
                        chunk = resp.read(128 * 1024)
                        if not chunk:
                            break
                        fh.write(chunk)
                        downloaded += len(chunk)
                        if downloaded >= next_log:
                            if total:
                                logger.info(
                                    f"DCW calibrator: {downloaded // (1024 * 1024)}MB "
                                    f"/ {total // (1024 * 1024)}MB"
                                )
                            else:
                                logger.info(
                                    f"DCW calibrator: {downloaded // (1024 * 1024)}MB"
                                )
                            next_log += 2 * 1024 * 1024
                if total and downloaded != total:
                    raise RuntimeError(
                        f"truncated download: got {downloaded} of {total} bytes"
                    )
        except Exception as e:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            raise RuntimeError(
                f"DCW calibrator: failed to download from {DEFAULT_CALIBRATOR_URL} ({e}). "
                f"If this is a corporate network or TLS-intercepting proxy, try `pip install -U certifi`. "
                f"Otherwise download manually and place the file at {target_path}."
            ) from e
        last_err: Optional[Exception] = None
        for attempt in range(5):
            try:
                os.replace(tmp_path, target_path)
                last_err = None
                break
            except PermissionError as e:
                last_err = e
                time.sleep(0.2 * (attempt + 1))
        if last_err is not None:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            raise RuntimeError(
                f"DCW calibrator: downloaded but could not rename into place ({last_err}). "
                f"This is usually Windows antivirus holding the file open. "
                f"Try adding {target_dir} to your AV exclusions, or download manually from "
                f"{DEFAULT_CALIBRATOR_URL} and place it at {target_path}."
            ) from last_err
        logger.info(f"DCW calibrator: saved to {target_path}")
        return target_path


# ---------------------------------------------------------------------------
# Setup helper called from the node's sample()
# ---------------------------------------------------------------------------


def _resolve_calibrator_path(name: Optional[str]) -> str:
    from .nodes import AUTO_CALIBRATOR_SENTINEL  # avoid cycle at import time

    if name in (None, "", AUTO_CALIBRATOR_SENTINEL):
        return get_default_calibrator_path()
    path = folder_paths.get_full_path("loras", name)
    if path is None:
        raise RuntimeError(f"DCW calibrator artifact not found: {name}")
    return path


def setup_dcw_calibrator(
    model_clone,
    clip,
    positive,
    calibrator_name: Optional[str],
    *,
    gain: float = 1.0,
) -> Optional[OnlineDCWCalibrator]:
    """Load the calibrator + run setup() with c_pool from the post-LLM-adapter
    pooling of the positive prompt. Returns the calibrator (active) or ``None``
    if the artifact failed to load or setup hit an empty embed.

    Mirrors ``anima_lora/library/inference/generation.py``'s setup path: feed the
    raw positive cond + t5xxl meta through ``dit.preprocess_text_embeds`` to
    recover the same (B, L, 1024) tensor the trainer cached as
    ``crossattn_emb_v0``. ``embed_mask`` is reconstructed from per-token L2 norm
    > 0 (the LLM adapter zero-pads to 512 and ``t5xxl_weights`` zero out
    dropped tokens), which matches the trainer's ``attn_mask_v0`` to within the
    cap_len aux-feature tolerance.
    """
    if OnlineDCWCalibrator is None:
        logger.warning(
            "DCW calibrator (auto mode) is unavailable — the fusion-head "
            "calibrator was retired from anima_lora and is not vendored in this "
            "node. Falling back to manual DCW (dcw_lambda × schedule)."
        )
        return None

    try:
        path = _resolve_calibrator_path(calibrator_name)
    except Exception as e:
        logger.warning("DCW calibrator: cannot resolve artifact: %s — disabling", e)
        return None

    dm = model_clone.model.diffusion_model
    # The patcher's declared device, NOT the DiT's parameter device: under
    # Dynamic VRAM (comfy_aimdo) the params are meta shells reporting cpu while
    # the real bytes live in the vbar, so reading `.device` off them would load
    # the calibrator on cpu and mismatch every tensor it later touches.
    # Matches the `m.load_device` idiom in nodes.py / spectrum.py.
    device = model_clone.load_device
    dtype = model_clone.model.get_dtype_inference()

    try:
        calibrator = OnlineDCWCalibrator.from_safetensors(path, device=device)
    except Exception as e:
        logger.warning("DCW calibrator: failed to load %s: %s — disabling", path, e)
        return None

    pos_raw, pos_t5_ids, pos_t5_weights = _extract_raw_and_t5(positive)
    raw = pos_raw.unsqueeze(0).to(device=device, dtype=dtype)
    t5_ids = pos_t5_ids.unsqueeze(0).to(device=device) if pos_t5_ids is not None else None
    t5_weights = (
        pos_t5_weights.unsqueeze(0).unsqueeze(-1).to(device=device, dtype=dtype)
        if pos_t5_weights is not None
        else None
    )
    with torch.no_grad():
        adapted = dm.preprocess_text_embeds(raw, t5_ids, t5xxl_weights=t5_weights)
    # adapted: (1, 512, 1024) post-LLM-adapter, zero-padded.
    embed_mask = (adapted.float().norm(dim=-1) > 1e-6)  # (1, 512) bool
    calibrator.setup(embed=adapted.float(), embed_mask=embed_mask, gain=gain)
    if not calibrator.is_active:
        return None
    return calibrator
