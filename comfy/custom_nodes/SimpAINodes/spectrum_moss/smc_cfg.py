"""Sliding-Mode Control CFG (SMC-CFG), α-adaptive variant — ComfyUI port.

Drop-in replacement of the standard ``uncond + w·(cond - uncond)`` CFG combine
with a classical sliding-mode controller applied to the velocity-space
residual:

    e_t        = v_cond − v_uncond              (velocity-space residual)
    s_t        = (e_t − e_prev) + λ · e_prev    (sliding-mode surface)
    k_t        = α · mean(|e_t|)                (adaptive switching gain)
    Δe         = −k_t · sign(s_t)               (bang-bang correction)
    v̂_t        = v_uncond + w · (e_t + Δe)

The α-adaptive gain replaces the paper's fixed ``k=0.1`` (Wang et al.,
arXiv:2603.03281), which was empirically ~14× off on Anima at CFG=4 and
produced visible texture chattering. ``k_t = α · mean(|e_t|)`` self-scales
across model / CFG / σ / sample; α=0.2 is the production default.

Operates in **velocity space** — this matters because σ varies per step,
so the denoised-space ``s_t`` is *not* a rescaled copy of the velocity-
space ``s_t``. ComfyUI's ``sampler_cfg_function`` is invoked in denoised
space (``cond``, ``uncond`` are post-``calculate_denoised`` x0 predictions),
so the hook below converts to v-space (``v = (x_in − denoised) / σ``),
runs the SMC combine, and converts back (``denoised = x_in − σ · v``).

One velocity-shaped buffer of state. No extra DiT forwards. Composes with
DCW (post-step x-space mix), modulation guidance (AdaLN-side), and
Spectrum (cached steps still invoke the CFG combine).

See anima_lora/docs/methods/smc_cfg.md for the full derivation and the
``bench/smc_cfg/analysis_and_proposal.md`` 14× analysis.
"""

from __future__ import annotations

import torch

# SMC-CFG combine is pure compute — the library module is already torch-only with
# no anima/comfy deps, so it IS the shared core (no separate *_core split).
# Resolved against the live tree or the ``_vendor/`` subset by the sys.path
# bootstrap in ``__init__.py``. ``combine`` operates in velocity space; the
# ``_make_smc_cfg_function`` seam below converts denoised↔v-space around it.
from ._vendor.library.inference.corrections.smc_cfg import SMCCFGState


def _make_smc_cfg_function(state: SMCCFGState):
    """Build a ComfyUI ``sampler_cfg_function`` that runs SMC-CFG in v-space.

    args carries ``cond``/``cond_denoised``, ``uncond``/``uncond_denoised``,
    ``cond_scale``, ``sigma``, ``input``. In flow-matching / CONST
    model_sampling, ``v = (x_in − denoised) / σ`` and
    ``denoised = x_in − σ · v``.

    ComfyUI's ``sampler_cfg_function`` contract: ``cfg_result = x − fn(args)``,
    so we must return ``x − denoised_combined`` (a noise-residual-like
    quantity), i.e. ``σ · v_out`` — NOT ``x − σ · v_out``. Returning the
    denoised value here makes the sampler treat the noise residual as x₀
    and the image collapses.
    """
    def cfg_function(args):
        cond_denoised = args.get("cond_denoised", args["cond"])
        uncond_denoised = args.get("uncond_denoised", args["uncond"])
        cond_scale = args["cond_scale"]
        sigma = args.get("sigma", args.get("timestep"))
        x_in = args["input"]

        if torch.is_tensor(sigma):
            sig = sigma.view(-1, *([1] * (x_in.ndim - 1))).to(x_in.dtype)
        else:
            sig = float(sigma)

        v_cond = (x_in - cond_denoised) / sig
        v_uncond = (x_in - uncond_denoised) / sig
        v_out = state.combine(v_cond, v_uncond, cond_scale)
        return sig * v_out

    return cfg_function


def install_smc_cfg(model_patcher, *, alpha: float, lam: float = 5.0) -> None:
    """Replace the CFG combine with SMC-CFG. No-op when ``alpha <= 0``.

    Caller must clone the model patcher before passing it in — this calls
    ``set_model_sampler_cfg_function``, which overwrites any existing
    ``sampler_cfg_function`` in ``model_options``.
    """
    if alpha <= 0.0:
        return
    state = SMCCFGState(lam=lam, alpha=alpha)
    model_patcher.set_model_sampler_cfg_function(_make_smc_cfg_function(state))
