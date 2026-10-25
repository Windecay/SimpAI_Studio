"""Spectrum state management, fast-forward path, and shared sampling logic."""

from __future__ import annotations

import inspect
import logging
import math
from typing import Dict, Hashable, List, Optional, Sequence

import torch
import torch.nn.functional as F

import comfy.sample
import comfy.samplers
import comfy.utils
import latent_preview

try:
    # Per-execution prompt_id — lets one_sampler_only re-arm on each fresh
    # workflow run instead of staying consumed forever on a cached MODEL.
    from comfy_execution.utils import get_executing_context
except Exception:  # older ComfyUI without the execution-context contextvar
    get_executing_context = None

from ._vendor.networks.spectrum_forecast import SpectrumPredictor
from .spectrum_sea import l1rel, sea_filter
from .dcw import install_dcw
from .dcw_calibrator import setup_dcw_calibrator
from .smc_cfg import install_smc_cfg
from .fsg import FSGCalibrator, fsg_step_indices, install_cfgpp, install_fsg

logger = logging.getLogger(__name__)

COMPAT_POLICIES = ("legacy", "conservative", "strict")
DEFAULT_COMPAT_POLICY = "legacy"

# Anima DiT patches the latent with spatial_patch_size=2, so latent H/W must
# be even (equivalently pixel H/W mod-16). Users picking odd-mod-32 pixel
# sizes hit a PatchEmbed assertion deep inside the DiT — we pad bottom/right
# before sampling and crop back after.
_PATCH_MULTIPLE = 2
_ODD_LATENT_WARNED = False


def _pad_latent_to_patch_multiple(t: torch.Tensor, patch: int = _PATCH_MULTIPLE):
    """Replicate-pad bottom/right of a latent to the next multiple of ``patch``.

    Handles both 4-D ``(B, C, H, W)`` and 5-D video-DiT ``(B, C, T, H, W)`` latents.

    Returns ``(padded, (H, W))`` where (H, W) are the original spatial dims.
    The caller crops the sampled output back to (H, W) before returning to
    the user.  Replicate (vs zero) padding minimises edge artifacts from the
    bottom/right strip that is later cropped away.
    """
    H, W = t.shape[-2], t.shape[-1]
    pad_h = (-H) % patch
    pad_w = (-W) % patch
    if pad_h == 0 and pad_w == 0:
        return t, (H, W)
    global _ODD_LATENT_WARNED
    if not _ODD_LATENT_WARNED:
        logger.warning(
            "Spectrum: latent H,W=%d,%d is not divisible by %d "
            "(Anima DiT patch_size). Padding to %d,%d and cropping the output "
            "back. For exact framing, use pixel sizes that are multiples of %d.",
            H,
            W,
            patch,
            H + pad_h,
            W + pad_w,
            patch * 8,
        )
        _ODD_LATENT_WARNED = True
    # 5-D video-DiT latents (B, C, T, H, W) need a size-6 pad tuple under
    # "replicate"; pad W/H and leave the temporal (and leading) dims untouched.
    if t.ndim >= 5:
        pad = (0, pad_w, 0, pad_h, 0, 0)
    else:
        pad = (0, pad_w, 0, pad_h)
    return F.pad(t, pad, mode="replicate"), (H, W)


def _spectrum_fast_forward(
    dit, timestep: torch.Tensor, predicted_feature: torch.Tensor
) -> torch.Tensor:
    """Runs only t_embedder + final_layer + unpatchify on predicted features.

    Returns the same shape as diffusion_model.forward() — 5D for video DiTs.
    """
    if timestep.ndim == 1:
        timestep = timestep.unsqueeze(1)
    # The forecaster works in its own dtype (bf16) and the Taylor blend can
    # promote to fp32 via the captured feature, so the prediction dtype need
    # not match the model. Pin it to final_layer's weight dtype before re-entry
    # — otherwise fp16 models (e.g. `--fast fp16_accumulation`) raise
    # "mat1 and mat2 ... float != c10::Half". t_emb follows via the cast below.
    # Skip non-float params: W8A8-quantized models (e.g. ComfyUI-INT8-Fast)
    # store final_layer.linear.weight as int8 — pinning to it would cast the
    # feature to int8. Their AdaLN linears stay float and supply the dtype; a
    # fully-quantized final_layer keeps the prediction dtype (the int8 Linear
    # casts its input internally).
    model_dtype = next(
        (p.dtype for p in dit.final_layer.parameters() if p.dtype.is_floating_point),
        predicted_feature.dtype,
    )
    predicted_feature = predicted_feature.to(model_dtype)
    # Replicate the model's two-step t_embedder call: Timesteps (sinusoidal,
    # always float32) -> cast to model dtype -> TimestepEmbedding (linear layers).
    # Calling t_embedder as a single Sequential skips the intermediate cast.
    t_sinusoidal = dit.t_embedder[0](timestep)
    t_emb, adaln = dit.t_embedder[1](t_sinusoidal.to(predicted_feature.dtype))
    t_emb = dit.t_embedding_norm(t_emb)
    # Mod guidance: add cached pooled-text projection from the DIFFUSION_MODEL
    # wrapper.  On actual steps the wrapper computes base+delta from post-adapter
    # context and caches it on dit._mod_pooled_proj.  On cached steps we reuse
    # the last actual step's value (text doesn't change between steps).
    pooled_proj = getattr(dit, "_mod_pooled_proj", None)
    if pooled_proj is not None:
        pp = pooled_proj.unsqueeze(1).to(t_emb.dtype)
        if pp.shape[0] == t_emb.shape[0]:
            t_emb = t_emb + pp
        elif pp.shape[0] == 1:
            t_emb = t_emb + pp.expand_as(t_emb)
    x = dit.final_layer(predicted_feature, t_emb, adaln_lora_B_T_3D=adaln)
    return dit.unpatchify(x)


def _normalize_compat_policy(policy: Optional[str]) -> str:
    if policy in COMPAT_POLICIES:
        return policy
    logger.warning(
        "Spectrum: unknown compat_policy=%r; using %s",
        policy,
        DEFAULT_COMPAT_POLICY,
    )
    return DEFAULT_COMPAT_POLICY


def _spectrum_batch_keys(c, cond_or_uncond: Sequence[int]) -> list:
    """Return branch-stable forecaster keys for the current ComfyUI batch."""
    fallback = [int(cou) for cou in cond_or_uncond]
    transformer_options = c.get("transformer_options", {}) if isinstance(c, dict) else {}
    uuids = transformer_options.get("uuids")
    if uuids is None:
        return fallback
    if torch.is_tensor(uuids):
        uuids = uuids.detach().cpu().tolist()
    try:
        uuid_list = list(uuids)
    except TypeError:
        return fallback
    if len(uuid_list) != len(fallback):
        return fallback
    return [(cou, str(uid)) for cou, uid in zip(fallback, uuid_list)]


def _wrapper_cache_safe(old_wrapper) -> bool:
    if old_wrapper is None:
        return True
    if getattr(old_wrapper, "__spectrum_requires_actual__", False):
        return False
    return bool(getattr(old_wrapper, "__spectrum_cache_safe__", False))


def _uses_uuid_branch_keys(keys: Sequence[Hashable]) -> bool:
    return all(isinstance(key, tuple) and len(key) == 2 for key in keys)


def _spectrum_context_changed(
    state: SpectrumState, input_x: torch.Tensor, keys: Sequence[Hashable]
) -> bool:
    del keys
    if state.input_shape is not None and tuple(input_x.shape[1:]) != state.input_shape:
        return True
    return False


def _iter_cache_vetoes(model_options) -> list:
    if not isinstance(model_options, dict):
        return []
    vetoes = model_options.get("spectrum_cache_vetoes", [])
    if callable(vetoes):
        return [vetoes]
    try:
        return [v for v in vetoes if callable(v)]
    except TypeError:
        return []


def _passes_cache_vetoes(
    state: SpectrumState,
    args,
    keys: Sequence[Hashable],
    input_x: torch.Tensor,
    timestep: torch.Tensor,
    c,
    model_options,
) -> bool:
    for veto in _iter_cache_vetoes(model_options):
        try:
            allowed = veto(
                state=state,
                args=args,
                keys=keys,
                input_x=input_x,
                timestep=timestep,
                c=c,
            )
        except Exception as e:
            logger.warning(
                "Spectrum: cache veto callback %r failed (%s); using actual forward",
                veto,
                e,
            )
            return False
        if allowed is False:
            return False
    return True


def _can_use_cached_prediction(
    state: SpectrumState,
    keys: Sequence[Hashable],
    input_x: torch.Tensor,
    timestep: torch.Tensor,
    c,
    old_wrapper,
    model_options,
    args,
    valid_chunks: bool,
) -> bool:
    if state.mode != "cached" or not valid_chunks or not state.has_forecasters(keys):
        return False
    if not _passes_cache_vetoes(
        state, args, keys, input_x, timestep, c, model_options
    ):
        return False
    if state.compat_policy == "legacy":
        return True
    if not _wrapper_cache_safe(old_wrapper):
        if not state.unsafe_wrapper_warned:
            logger.warning(
                "Spectrum: compat_policy=%s is using actual forwards because a "
                "previous model_function_wrapper is not tagged cache-safe. Use "
                "legacy for the fastest wrapper chain, or tag cache-neutral "
                "wrappers with __spectrum_cache_safe__=True.",
                state.compat_policy,
            )
            state.unsafe_wrapper_warned = True
        if state.verbose:
            logger.info(
                "Spectrum: compat_policy=%s blocks cached step because the "
                "previous model_function_wrapper is not cache-safe",
                state.compat_policy,
            )
        return False
    if state.compat_policy == "strict" and not _uses_uuid_branch_keys(keys):
        if state.verbose:
            logger.info(
                "Spectrum: compat_policy=strict blocks cached step because "
                "conditioning UUID branch keys are unavailable"
            )
        return False
    if state.step_idx >= state.num_steps:
        if state.verbose:
            logger.info(
                "Spectrum: compat_policy=%s blocks cached step after expected "
                "steps were exceeded (%d >= %d)",
                state.compat_policy,
                state.step_idx,
                state.num_steps,
            )
        return False
    if _spectrum_context_changed(state, input_x, keys):
        if state.verbose:
            logger.info(
                "Spectrum: compat_policy=%s blocks cached step after latent "
                "shape change",
                state.compat_policy,
            )
        return False
    return True


def _update_forecasters_from_feature(
    state: SpectrumState,
    feat: Optional[torch.Tensor],
    input_x: torch.Tensor,
    keys: Sequence[Hashable],
    valid_chunks: bool,
    label: str,
) -> None:
    if not state.active or feat is None or not valid_chunks:
        return
    batch_chunks = len(keys)
    if batch_chunks == 0 or feat.shape[0] % batch_chunks != 0:
        if state.verbose:
            logger.warning(
                "%s: feature batch %d cannot be split into %d conditioning chunks; "
                "skipping forecast update",
                label,
                feat.shape[0],
                batch_chunks,
            )
        return

    feat_chunks = feat.chunk(batch_chunks, dim=0)
    if len(feat_chunks) != batch_chunks:
        if state.verbose:
            logger.warning(
                "%s: feature batch %d produced %d chunks for %d conditioning keys; "
                "skipping forecast update",
                label,
                feat.shape[0],
                len(feat_chunks),
                batch_chunks,
            )
        return

    def _create_or_update() -> None:
        for idx, key in enumerate(keys):
            if key not in state.forecasters:
                state.forecasters[key] = SpectrumPredictor(
                    state.m_param,
                    state.lam,
                    state.w,
                    feat.device,
                    feat_chunks[idx].shape,
                    state.num_steps,
                    K=state.history_size,
                )
            state.forecasters[key].update(float(state.step_idx), feat_chunks[idx])

    try:
        _create_or_update()
    except AssertionError:
        if state.verbose:
            logger.info("%s: feature shape changed; resetting forecasters", label)
        state.clear_forecasters()
        _create_or_update()
    state.record_context(input_x, keys)


class SpectrumState:
    def __init__(
        self,
        window_size: float,
        flex_window: float,
        warmup_steps: int,
        w: float,
        m: int,
        lam: float,
        num_steps: int,
        tail_actual_steps: int = 3,
        history_size: int = 100,
        verbose: bool = False,
        one_sampler_only: bool = False,
        schedule: str = "window",
        refresh_ratio: float = -1.0,
        sea_beta: float = 2.0,
        delta: Optional[float] = None,
        fsg_steps: Optional[frozenset] = None,
        compat_policy: str = DEFAULT_COMPAT_POLICY,
    ):
        self.window_size = window_size
        self.flex_window = flex_window
        self.warmup_steps = warmup_steps
        self.w = w
        self.m_param = m
        self.lam = lam
        self.num_steps = num_steps
        self.tail_actual_steps = tail_actual_steps
        self.history_size = history_size
        self.verbose = verbose
        self.one_sampler_only = one_sampler_only
        self.compat_policy = _normalize_compat_policy(compat_policy)

        # SEA schedule (SeaCache decision metric). schedule="sea" replaces the
        # growing-window rule with accumulate-until-δ on the SEA-filtered latent.
        # delta is None while uncalibrated → the loop falls back to the window
        # rule and records the per-step distance trace for one-shot auto-δ.
        self.schedule = schedule
        self.refresh_ratio = refresh_ratio
        self.sea_beta = sea_beta
        self.delta = delta
        self.sea_accum = 0.0
        self.sea_prev: Optional[torch.Tensor] = None
        self.sea_dists: List[float] = []  # decision-region trace, calibration only

        # FSG: step indices forced to actual forwards (the latent is calibrated
        # before these steps, so a cached feature forecast would be stale) and
        # excluded from the SEA decision denominator — same treatment as
        # warmup/tail. Empty when FSG is off.
        self.fsg_steps: frozenset = fsg_steps or frozenset()

        # Runtime
        self.step_idx = -1
        self.last_sigma: Optional[float] = None
        self.mode = "actual"
        self.curr_ws = window_size
        self.consec_cached = 0
        self.fwd_count = 0
        self.steps_seen = 0  # cumulative forwards across SPD resets (logging)

        # When False, every step runs an actual forward and no forecaster is
        # built — used by the SPEED sampler to keep the low-res SPD prefix
        # uncached (phase-2-only). Flipped True (with a reset) at the handoff.
        self.active = True

        # Forecasters keyed by conditioning branch. Legacy paths can still use
        # cond_or_uncond ints, but modern ComfyUI supplies per-conditioning UUIDs.
        self.forecasters: Dict[Hashable, SpectrumPredictor] = {}
        self.captured_feat: Optional[torch.Tensor] = None
        self.patch_consumed = False
        self.input_shape: Optional[tuple] = None
        self.unsafe_wrapper_warned = False

        # one_sampler_only: the ComfyUI prompt_id this state was last armed for.
        # The patched MODEL (and this state) is cached across workflow re-runs,
        # so we re-arm when the prompt_id changes — otherwise patch_consumed
        # would stay True forever and Spectrum would no-op on every later queue.
        self.active_prompt_id = None

    def reset(self) -> None:
        """Re-arm a fresh warmup window, discarding the current forecasters.

        Called by the SPEED sampler at the SPD resolution handoff: the captured
        ``final_layer`` feature changes token grid across the transition, so the
        stage-0 forecasters are unusable and Spectrum must re-warm on the
        full-res tail. ``fwd_count`` / ``steps_seen`` are left intact so the
        end-of-sample speedup log spans both phases.
        """
        self.step_idx = -1
        self.last_sigma = None
        self.mode = "actual"
        self.curr_ws = self.window_size
        self.consec_cached = 0
        self.clear_forecasters()
        self.captured_feat = None
        self.unsafe_wrapper_warned = False
        self.sea_accum = 0.0
        self.sea_prev = None
        self.sea_dists = []

    def clear_forecasters(self) -> None:
        self.forecasters = {}
        self.input_shape = None

    def record_context(self, input_x: torch.Tensor, keys: Sequence[Hashable]) -> None:
        del keys
        self.input_shape = tuple(input_x.shape[1:])

    def observe_sea(self, latent: torch.Tensor, sigma: float) -> None:
        """Accrue the SEA-filtered latent distance for the current step.

        Called once per new sampler step (after step_idx advanced, before the
        cache decision) on the input latent x_t. Under CFG the batch tiles the
        same x_t across cond/uncond, so row 0 is x_t. Mirrors the training-repo
        loop: distance accrues into ``sea_accum`` (reset on each refresh, Eq. 8)
        and, during the uncalibrated pass only, the raw per-step distance is
        recorded over the decision region for one-shot auto-δ.
        """
        if self.schedule != "sea":
            return
        x = latent[0:1]  # (1, C, H, W) — x_t
        sea_now = sea_filter(x, float(sigma), self.sea_beta)
        if self.sea_prev is not None:
            d = l1rel(sea_now, self.sea_prev)
            self.sea_accum += d
            stop_at = self.num_steps - self.tail_actual_steps
            if (
                self.delta is None
                and self.warmup_steps <= self.step_idx < stop_at
                and self.step_idx not in self.fsg_steps
            ):
                self.sea_dists.append(d)
        self.sea_prev = sea_now

    def _forecaster_ready(self, key: Hashable) -> bool:
        forecaster = self.forecasters.get(key)
        if forecaster is None:
            return False
        return forecaster.cheb.t_buf.numel() >= max(2, self.m_param + 2)

    def forecasters_ready(self, keys: Sequence[Hashable]) -> bool:
        return all(self._forecaster_ready(key) for key in keys)

    def should_cache(self, keys: Optional[Sequence[Hashable]] = None) -> bool:
        if not self.active:
            return False
        if self.step_idx < self.warmup_steps:
            return False
        stop_at = self.num_steps - self.tail_actual_steps
        if self.step_idx >= stop_at:
            return False
        if self.step_idx in self.fsg_steps:
            return False  # FSG-calibrated step — must run an actual forward
        if keys is not None and not self.forecasters_ready(keys):
            return False
        if self.schedule == "sea" and self.delta is not None:
            # Refresh (actual) once the accumulated SEA distance crosses δ; cache
            # (skip) until then. The accumulator resets on each refresh in the
            # step-advance bookkeeping (alongside consec_cached).
            return self.sea_accum < self.delta
        # Window schedule, or SEA calibration pass (δ uncalibrated) → window rule.
        return (self.consec_cached + 1) % max(1, math.floor(self.curr_ws)) != 0

    def has_forecasters(self, keys: Sequence[Hashable]) -> bool:
        return all(key in self.forecasters for key in keys)


def _capture_pre_hook(module, args):
    """Module-singleton pre-hook on final_layer — stores the pre-final feature
    on whichever SpectrumState is currently bound to the module.
    """
    state = getattr(module, "_spectrum_state", None)
    if state is not None:
        state.captured_feat = args[0].detach().clone()


def _ensure_capture_hook(dit) -> None:
    final_layer = dit.final_layer
    if getattr(final_layer, "_spectrum_hook_installed", False):
        return
    final_layer.register_forward_pre_hook(_capture_pre_hook)
    final_layer._spectrum_hook_installed = True


# ---------------------------------------------------------------------------
# Front-loaded cross-attn boost (--xattn_boost)
#
# Scales every block's cross-attn residual by λ on the conditional forward only,
# gated to σ ≥ band — the plan-writing window where cross-attn text drive exists
# (peaks σ=1, floor below σ≈0.85). Amplifies weak-tag adherence / relation
# bindings without touching self-attn/MLP style. Mirror of anima_lora's
# library.inference.adapters.set_xattn_gain, adapted to ComfyUI's batched CFG.
#
# COMPILE COMPATIBILITY. AnimaBlockCompile runs torch.compile on each *whole*
# transformer block (`set_torch_compile_wrapper` keys = diffusion_model.blocks.i),
# so the cross-attn multiply must live *inside* the compiled graph as a buffer
# read — a plain forward hook on the cross_attn submodule is traced over and
# silently baked at its trace-time value (that was the "no effect" bug). Instead
# we register a non-persistent `_xattn_gain` buffer on each block's cross_attn
# and monkeypatch its `forward` to multiply the output by that buffer (exactly
# scaling `result` in comfy's `x = result * gate + x`, i.e. equivalent to
# scaling the AdaLN gate_cross_attn — native anima's `Block._xattn_gain`). The
# buffer is a graph input, so updating it in place (`copy_`/`fill_`) retunes the
# boost per step with NO recompile — the same pattern the mod-guidance path uses.
# torch.compile wraps the same block object (`_orig_mod`) and only swaps it in
# temporarily, so patching before the first sample lands in the trace.
#
# ComfyUI batches cond+uncond in one forward, so the gain is a per-sample
# (B, 1, 1) buffer (λ on cond rows, 1.0 on uncond). The patch is installed once
# and left in place (removing it would flip the traced forward and force a
# recompile); it is neutralized to 1.0 (exact identity) whenever the boost is
# off, so it never leaks into other samplers sharing the DiT. Only actual
# (block-running) forwards carry the boost; forecast steps skip the blocks and
# extrapolate from the boosted cond features, consistent with the boost.
# ---------------------------------------------------------------------------


def _ensure_xattn_gain_patch(dit) -> bool:
    """Patch every block's ``cross_attn`` with a buffer-scaled forward (once).

    Registers a non-persistent ``_xattn_gain`` buffer (init 1.0 = identity) on
    each ``cross_attn`` and wraps its ``forward`` to multiply the output by that
    buffer. Idempotent. Returns False (and logs) when the DiT has no
    block/cross_attn structure, so the caller disables the boost instead of
    crashing on a non-Anima model.
    """
    if getattr(dit, "_xattn_gain_patched", False):
        return True

    blocks = getattr(dit, "blocks", None)
    if blocks is None or not all(hasattr(b, "cross_attn") for b in blocks):
        logger.warning(
            "Spectrum xattn boost: DiT has no blocks[*].cross_attn to patch; "
            "disabling the boost for this run."
        )
        return False

    def _make_forward(orig_forward, module):
        def _boosted_forward(*args, **kwargs):
            out = orig_forward(*args, **kwargs)
            return out * module._xattn_gain.to(out.dtype)

        return _boosted_forward

    for block in blocks:
        ca = block.cross_attn
        if getattr(ca, "_xattn_gain_patched", False):
            continue
        # Buffer dtype must be floating-point: on W8A8-quantized models
        # (e.g. ComfyUI-INT8-Fast) the attn projection weights are int8, and an
        # int8 gain buffer would truncate λ (1.15 → 1 = silent no-op boost).
        dev, dt = None, torch.float32
        for p in ca.parameters():
            if dev is None:
                dev = p.device
            if p.dtype.is_floating_point:
                dev, dt = p.device, p.dtype
                break
        ca.register_buffer(
            "_xattn_gain", torch.ones((1, 1, 1), device=dev, dtype=dt), persistent=False
        )
        ca.forward = _make_forward(ca.forward, ca)
        ca._xattn_gain_patched = True
    dit._xattn_gain_patched = True
    return True


# --- Norm-matched gain (anima_lora Phase-1'' `--xattn_boost_renorm`) --------
#
# The raw residual gain pushes hidden states off the norm distribution the
# next block was trained on (mixture-OOD → saturation burn / framing drift on
# complex prompts). The shipped fix rescales the post-cross-attn state back
# toward the norm it would have had at gain 1.0, so the boost becomes a
# *rotation toward the cross-attn direction* on (near) the trained norm shell.
# `img` mode (shipped default, ρ 0.5) matches the per-image MEAN token norm —
# the token-norm distribution keeps its peaks (neon / highlights / speculars);
# `tok` matches every token individually (clamps exactly those peaks → grey
# tone; bench reference only). ρ applies scale**ρ (1.0 full shell, 0.0 raw).
#
# The renorm needs `plain = result·gate + x` at the residual-add site inside
# Block.forward, which the cross_attn-level patch can't see — so it rides a
# second, opt-in patch that replaces each Block's `forward` with a faithful
# mirror of comfy predict2's (bit-identical when neutral) plus the gain +
# renorm at the cross-attn residual add. Same compile discipline as the
# cross_attn patch: the gain is a non-persistent buffer (per-step retune via
# copy_ with no recompile); the renorm flags are plain Python attrs (static
# dynamo guards — at most two graph variants, boosted / identity, both cached
# after first trace). When the block patch is armed, the cross_attn-level
# buffer is held at identity so the gain is never applied twice; renorm='off'
# keeps the original cross_attn-only path byte-for-byte untouched.
#
# The block mirror pins comfy's Block.forward signature. If upstream drifts,
# `_ensure_xattn_block_patch` refuses to install (signature + submodule
# check), logs, and the boost falls back to the raw-gain path — never a crash
# or a silently divergent forward.

_BLOCK_FORWARD_PARAMS = (
    "self",
    "x_B_T_H_W_D",
    "emb_B_T_D",
    "crossattn_emb",
    "rope_emb_L_1_1_D",
    "adaln_lora_B_T_3D",
    "extra_per_block_pos_emb",
    "transformer_options",
)
_BLOCK_SUBMODULES = (
    "layer_norm_self_attn",
    "self_attn",
    "layer_norm_cross_attn",
    "cross_attn",
    "layer_norm_mlp",
    "mlp",
    "adaln_modulation_self_attn",
    "adaln_modulation_cross_attn",
    "adaln_modulation_mlp",
)


def _make_norm_matched_block_forward(block):
    """Mirror of comfy predict2 ``Block.forward`` + norm-matched cross-attn gain.

    Bit-identical to upstream when neutral (gain buffer = 1, renorm off — the
    extra multiply by exactly 1.0 and the skipped renorm branch change no
    bits). Plain reshape/indexing replaces upstream's einops rearranges
    (same memory layout, bit-identical).
    """

    def _block_forward(
        x_B_T_H_W_D,
        emb_B_T_D,
        crossattn_emb,
        rope_emb_L_1_1_D=None,
        adaln_lora_B_T_3D=None,
        extra_per_block_pos_emb=None,
        transformer_options={},
    ):
        residual_dtype = x_B_T_H_W_D.dtype
        compute_dtype = emb_B_T_D.dtype
        if extra_per_block_pos_emb is not None:
            x_B_T_H_W_D = x_B_T_H_W_D + extra_per_block_pos_emb

        if block.use_adaln_lora:
            shift_sa_B_T_D, scale_sa_B_T_D, gate_sa_B_T_D = (
                block.adaln_modulation_self_attn(emb_B_T_D) + adaln_lora_B_T_3D
            ).chunk(3, dim=-1)
            shift_ca_B_T_D, scale_ca_B_T_D, gate_ca_B_T_D = (
                block.adaln_modulation_cross_attn(emb_B_T_D) + adaln_lora_B_T_3D
            ).chunk(3, dim=-1)
            shift_mlp_B_T_D, scale_mlp_B_T_D, gate_mlp_B_T_D = (
                block.adaln_modulation_mlp(emb_B_T_D) + adaln_lora_B_T_3D
            ).chunk(3, dim=-1)
        else:
            shift_sa_B_T_D, scale_sa_B_T_D, gate_sa_B_T_D = (
                block.adaln_modulation_self_attn(emb_B_T_D).chunk(3, dim=-1)
            )
            shift_ca_B_T_D, scale_ca_B_T_D, gate_ca_B_T_D = (
                block.adaln_modulation_cross_attn(emb_B_T_D).chunk(3, dim=-1)
            )
            shift_mlp_B_T_D, scale_mlp_B_T_D, gate_mlp_B_T_D = (
                block.adaln_modulation_mlp(emb_B_T_D).chunk(3, dim=-1)
            )

        # (B, T, D) -> (B, T, 1, 1, D) broadcast shape.
        shift_sa = shift_sa_B_T_D[:, :, None, None, :]
        scale_sa = scale_sa_B_T_D[:, :, None, None, :]
        gate_sa = gate_sa_B_T_D[:, :, None, None, :]
        shift_ca = shift_ca_B_T_D[:, :, None, None, :]
        scale_ca = scale_ca_B_T_D[:, :, None, None, :]
        gate_ca = gate_ca_B_T_D[:, :, None, None, :]
        shift_mlp = shift_mlp_B_T_D[:, :, None, None, :]
        scale_mlp = scale_mlp_B_T_D[:, :, None, None, :]
        gate_mlp = gate_mlp_B_T_D[:, :, None, None, :]

        B, T, H, W, D = x_B_T_H_W_D.shape

        def _norm_mod(_x, _norm_layer, _scale, _shift):
            return _norm_layer(_x) * (1 + _scale) + _shift

        normalized = _norm_mod(
            x_B_T_H_W_D, block.layer_norm_self_attn, scale_sa, shift_sa
        )
        result = block.self_attn(
            normalized.to(compute_dtype).reshape(B, T * H * W, D),
            None,
            rope_emb=rope_emb_L_1_1_D,
            transformer_options=transformer_options,
        ).reshape(B, T, H, W, D)
        x_B_T_H_W_D = x_B_T_H_W_D + gate_sa.to(residual_dtype) * result.to(
            residual_dtype
        )

        normalized = _norm_mod(
            x_B_T_H_W_D, block.layer_norm_cross_attn, scale_ca, shift_ca
        )
        result = block.cross_attn(
            normalized.to(compute_dtype).reshape(B, T * H * W, D),
            crossattn_emb,
            rope_emb=rope_emb_L_1_1_D,
            transformer_options=transformer_options,
        ).reshape(B, T, H, W, D)

        # Norm-matched cross-attn boost. `_xattn_gain` is (B,1,1,1,1) — λ on
        # cond rows, 1.0 on uncond rows, so on uncond rows plain == boosted and
        # the renorm scale is exactly 1 (no per-row branching needed).
        gated = result.to(residual_dtype) * gate_ca.to(residual_dtype)
        x_new = gated * block._xattn_gain.to(residual_dtype) + x_B_T_H_W_D
        if block._xattn_renorm:
            plain = gated + x_B_T_H_W_D
            norm_plain = plain.float().norm(dim=-1, keepdim=True)
            norm_new = x_new.float().norm(dim=-1, keepdim=True).clamp_min(1e-6)
            if not block._xattn_renorm_pertoken:
                norm_plain = norm_plain.mean(dim=(1, 2, 3), keepdim=True)
                norm_new = norm_new.mean(dim=(1, 2, 3), keepdim=True)
            scale = norm_plain / norm_new
            if block._xattn_renorm_frac != 1.0:
                scale = scale**block._xattn_renorm_frac
            x_new = x_new * scale.to(x_new.dtype)
        x_B_T_H_W_D = x_new

        normalized = _norm_mod(
            x_B_T_H_W_D, block.layer_norm_mlp, scale_mlp, shift_mlp
        )
        result = block.mlp(normalized.to(compute_dtype))
        x_B_T_H_W_D = x_B_T_H_W_D + gate_mlp.to(residual_dtype) * result.to(
            residual_dtype
        )
        return x_B_T_H_W_D

    return _block_forward


def _ensure_xattn_block_patch(dit) -> bool:
    """Install the norm-matched Block.forward mirror on every block (once).

    Refuses (returns False, logs a warning) when the blocks don't match the
    comfy predict2 Block contract this mirror was written against — signature
    drift, missing submodules, or an already-monkeypatched forward — so the
    caller falls back to the raw-gain path instead of running a silently
    divergent forward.
    """
    if getattr(dit, "_xattn_block_patched", False):
        return True

    blocks = getattr(dit, "blocks", None)
    if not blocks:
        logger.warning(
            "Spectrum xattn renorm: DiT has no blocks to patch; "
            "falling back to the raw gain."
        )
        return False

    try:
        params = tuple(inspect.signature(type(blocks[0]).forward).parameters)
    except (TypeError, ValueError):
        params = ()
    if params != _BLOCK_FORWARD_PARAMS:
        logger.warning(
            "Spectrum xattn renorm: Block.forward signature %s does not match "
            "the predict2 contract this node mirrors %s (ComfyUI updated?); "
            "falling back to the raw gain. Update the Spectrum node.",
            params,
            _BLOCK_FORWARD_PARAMS,
        )
        return False
    for block in blocks:
        if any(not hasattr(block, name) for name in _BLOCK_SUBMODULES) or not hasattr(
            block, "use_adaln_lora"
        ):
            logger.warning(
                "Spectrum xattn renorm: block is missing expected predict2 "
                "submodules; falling back to the raw gain."
            )
            return False
        if "forward" in block.__dict__:
            logger.warning(
                "Spectrum xattn renorm: another patch already replaced "
                "Block.forward; falling back to the raw gain."
            )
            return False

    for block in blocks:
        # Same float-param pin as the cross_attn patch: on W8A8-quantized
        # models an int8-derived buffer would truncate λ to a silent no-op.
        dev, dt = None, torch.float32
        for p in block.cross_attn.parameters():
            if dev is None:
                dev = p.device
            if p.dtype.is_floating_point:
                dev, dt = p.device, p.dtype
                break
        block.register_buffer(
            "_xattn_gain",
            torch.ones((1, 1, 1, 1, 1), device=dev, dtype=dt),
            persistent=False,
        )
        block._xattn_renorm = False
        block._xattn_renorm_pertoken = False
        block._xattn_renorm_frac = 1.0
        block.forward = _make_norm_matched_block_forward(block)
    dit._xattn_block_patched = True
    return True


def _xattn_gain_vector(cond_or_uncond, batch_size, boost, device, dtype):
    """Build a ``(B, 1, 1)`` per-sample gain: λ on cond chunks, 1.0 on uncond.

    ``cond_or_uncond`` is ComfyUI's per-chunk tag list (0 = cond/positive,
    1 = uncond/negative); the batch splits into ``len(cond_or_uncond)`` equal
    contiguous chunks. Returns ``None`` when the chunks don't divide the batch
    (skip the boost this call rather than mis-mapping rows).
    """
    n = len(cond_or_uncond)
    if n == 0 or batch_size % n != 0:
        return None
    chunk = batch_size // n
    gains = torch.ones((batch_size, 1, 1), device=device, dtype=dtype)
    for j, cou in enumerate(cond_or_uncond):
        if int(cou) == 0:  # cond / positive branch
            gains[j * chunk : (j + 1) * chunk] = boost
    return gains


def _write_gain_buffer(module, target):
    """Write a gain buffer in place when the shape matches (no recompile);
    reallocate only on a batch-size change (one recompile)."""
    buf = module._xattn_gain
    if buf.shape == target.shape:
        buf.copy_(target)
    else:
        module._xattn_gain = target


def _set_xattn_gain(
    dit,
    cond_or_uncond,
    batch_size,
    boost,
    band,
    sigma_val,
    renorm_mode="off",
    renorm_frac=1.0,
):
    """Write the per-block cross-attn gain state for one actual forward.

    Raw path (``renorm_mode='off'`` or block patch unavailable): the λ-vector
    lands in each ``cross_attn``'s ``(B, 1, 1)`` buffer, exactly as before.
    Norm-matched path: the λ-vector lands in each Block's ``(B, 1, 1, 1, 1)``
    buffer read at the residual-add site, the cross_attn buffers are held at
    identity (never boost twice), and the renorm flags are armed. Off-band
    steps write identity into both (buffer shape — and thus the compiled block
    graph — stays fixed across boosted / unboosted steps). Returns True when a
    boost was actually applied.
    """
    blocks = dit.blocks
    block_patched = getattr(dit, "_xattn_block_patched", False)
    use_block_path = renorm_mode != "off" and block_patched
    ref = blocks[0].cross_attn._xattn_gain
    gain_vec = None
    if sigma_val >= band:
        gain_vec = _xattn_gain_vector(
            cond_or_uncond, batch_size, boost, ref.device, ref.dtype
        )
    renorm_on = use_block_path and gain_vec is not None
    for block in blocks:
        ca = block.cross_attn
        buf = ca._xattn_gain
        if gain_vec is None or use_block_path:
            ca_target = torch.ones(
                (batch_size, 1, 1), device=buf.device, dtype=buf.dtype
            )
        else:
            ca_target = gain_vec.to(device=buf.device, dtype=buf.dtype)
        _write_gain_buffer(ca, ca_target)
        if block_patched:
            bbuf = block._xattn_gain
            if renorm_on:
                blk_target = gain_vec.view(batch_size, 1, 1, 1, 1).to(
                    device=bbuf.device, dtype=bbuf.dtype
                )
            else:
                blk_target = torch.ones(
                    (batch_size, 1, 1, 1, 1), device=bbuf.device, dtype=bbuf.dtype
                )
            _write_gain_buffer(block, blk_target)
            block._xattn_renorm = renorm_on
            block._xattn_renorm_pertoken = renorm_mode == "tok"
            block._xattn_renorm_frac = float(renorm_frac) if renorm_on else 1.0
    return gain_vec is not None


def _reset_xattn_gain(dit, neutral_shape: bool = False) -> None:
    """Neutralize the cross-attn gain buffers to exact identity (in place).

    Keeps the patch installed (so no recompile) but makes it a no-op — used
    after each forward and at teardown so a leftover boost never bleeds into a
    later step or another sampler sharing the DiT.

    ``neutral_shape`` (teardown only): also restore the buffers to their
    all-ones broadcast shape. The per-forward reset keeps the batch shape
    (fill_ in place — the compiled graph's shape guard stays satisfied), but a
    batch-shaped buffer left behind at run end would broadcast-error a later
    sampler running a *different* batch size through the patched forwards.
    """
    if not getattr(dit, "_xattn_gain_patched", False):
        return
    block_patched = getattr(dit, "_xattn_block_patched", False)
    for block in dit.blocks:
        ca = block.cross_attn
        buf = getattr(ca, "_xattn_gain", None)
        if buf is not None:
            if neutral_shape and buf.shape != (1, 1, 1):
                ca._xattn_gain = torch.ones(
                    (1, 1, 1), device=buf.device, dtype=buf.dtype
                )
            else:
                buf.fill_(1.0)
        if block_patched:
            bbuf = block._xattn_gain
            if neutral_shape and bbuf.shape != (1, 1, 1, 1, 1):
                block._xattn_gain = torch.ones(
                    (1, 1, 1, 1, 1), device=bbuf.device, dtype=bbuf.dtype
                )
            else:
                bbuf.fill_(1.0)
            block._xattn_renorm = False
            block._xattn_renorm_frac = 1.0


def _resolve_live_components(apply_model, fallback_dit, fallback_model_sampling, state):
    """Resolve the DiT + model_sampling that actually run *this* forward.

    The wrapper is invoked as ``model_function_wrapper(model.apply_model, ...)``,
    so ``apply_model.__self__`` is the live BaseModel. ComfyUI can hand the
    sampler a *different* DiT instance than the one patched at ``apply_dit_..``
    time — most commonly a downstream ``AnimaBlockCompile`` clones the model with
    ``disable_dynamic=True``, which rebuilds ``diffusion_model``. The patch-time
    refs then point at a dead module: the capture hook never fires, forecasters
    never fill, and Spectrum silently runs every step actual (looks like the
    forecaster keeps resetting). Prefer the live module and fall back only if it
    can't be resolved. Mirrors mod_guidance's re-home.
    """
    owner = getattr(apply_model, "__self__", None)
    dit = getattr(owner, "diffusion_model", None) if owner is not None else None
    model_sampling = (
        getattr(owner, "model_sampling", None) if owner is not None else None
    )
    if dit is None:
        dit = fallback_dit
    elif dit is not fallback_dit and not getattr(state, "_rehomed_logged", False):
        state._rehomed_logged = True
        if state.verbose:
            logger.info(
                "DiT Spectrum Patch: re-homing to live diffusion_model "
                "(patch-time id=%x != live id=%x); reinstalling capture hook.",
                id(fallback_dit) & 0xFFFFFF,
                id(dit) & 0xFFFFFF,
            )
    if model_sampling is None:
        model_sampling = fallback_model_sampling
    return dit, model_sampling


def _require_dit_spectrum_components(model):
    missing = []
    base = getattr(model, "model", None)
    dit = getattr(base, "diffusion_model", None)
    model_sampling = getattr(base, "model_sampling", None)

    if dit is None:
        missing.append("model.model.diffusion_model")
    else:
        for name in (
            "final_layer",
            "t_embedder",
            "t_embedding_norm",
            "unpatchify",
        ):
            if not hasattr(dit, name):
                missing.append(f"model.model.diffusion_model.{name}")
    if model_sampling is None:
        missing.append("model.model.model_sampling")

    if missing:
        raise RuntimeError(
            "DiT Spectrum Patch requires a DiT-style model with these "
            f"components: {', '.join(missing)}"
        )
    return dit, model_sampling


def _normalize_cond_or_uncond(args, batch_size: int):
    raw = args.get("cond_or_uncond", [0])
    if raw is None:
        raw = [0]
    if torch.is_tensor(raw):
        raw = raw.detach().cpu().tolist()
    if not isinstance(raw, (list, tuple)):
        raw = [raw]
    cond_or_uncond = [int(cou) for cou in raw]
    if len(cond_or_uncond) == 0:
        cond_or_uncond = [0]
    if batch_size % len(cond_or_uncond) != 0:
        return cond_or_uncond, False
    return cond_or_uncond, True


def _advance_spectrum_state(state: SpectrumState, sigma_val: float) -> bool:
    """Advance state once per new sampler sigma/timestep.

    Returns True when a new sampling step was observed. If sigma rises, assume a
    fresh sampler run started on the same patched MODEL and reset the forecast
    buffers before counting the new step.
    """
    eps = 1e-8
    if state.last_sigma is not None and sigma_val > state.last_sigma + eps:
        if state.one_sampler_only and state.steps_seen > 0:
            state.patch_consumed = True
            if state.verbose:
                logger.info(
                    "DiT Spectrum Patch: detected another sampler run; "
                    "one_sampler_only is passing through"
                )
            return False
        if state.verbose:
            logger.info(
                "DiT Spectrum Patch: sigma increased %.6g -> %.6g; resetting state",
                state.last_sigma,
                sigma_val,
            )
        state.reset()

    if state.last_sigma is not None and abs(sigma_val - state.last_sigma) <= eps:
        return False

    if state.step_idx >= 0:
        if state.mode == "actual":
            state.fwd_count += 1
            if state.step_idx >= state.warmup_steps:
                state.curr_ws = round(state.curr_ws + state.flex_window, 3)
            state.consec_cached = 0
        else:
            state.consec_cached += 1

    state.step_idx += 1
    state.steps_seen += 1
    state.last_sigma = sigma_val
    return True


def _maybe_rearm_for_new_execution(state: SpectrumState) -> None:
    """Re-arm a ``one_sampler_only`` patch at the start of each workflow run.

    ComfyUI caches the patched MODEL output, so the same ``SpectrumState`` is
    reused across re-queues. Once consumed, ``patch_consumed`` would otherwise
    stay True for the life of the process and Spectrum would silently no-op on
    every subsequent run. We key the arming on the current execution's
    ``prompt_id``: a *different* prompt_id means a fresh workflow run → re-arm;
    the *same* prompt_id (a later sampler in the same graph, e.g. hi-res fix)
    keeps the consumed state, preserving the intended one-sampler-only behavior.
    """
    if not state.one_sampler_only or get_executing_context is None:
        return
    ctx = get_executing_context()
    prompt_id = getattr(ctx, "prompt_id", None)
    if prompt_id is None or prompt_id == state.active_prompt_id:
        return
    state.active_prompt_id = prompt_id
    if state.patch_consumed or state.steps_seen > 0:
        state.reset()
    state.patch_consumed = False
    state.steps_seen = 0
    state.fwd_count = 0


def _mark_spectrum_patch_consumed(state: SpectrumState) -> None:
    if not state.one_sampler_only or state.patch_consumed:
        return
    if state.step_idx >= max(0, state.num_steps - 1):
        state.patch_consumed = True
        if state.verbose:
            logger.info(
                "DiT Spectrum Patch: one_sampler_only consumed after %d steps",
                state.step_idx + 1,
            )


def apply_dit_spectrum_patch(
    model,
    steps: int = 30,
    window_size: float = 2.0,
    flex_window: float = 0.25,
    warmup_steps: int = 6,
    tail_actual_steps: int = 3,
    blend_w: float = 0.3,
    cheby_degree: int = 3,
    ridge_lambda: float = 0.1,
    history_size: int = 100,
    enabled: bool = True,
    verbose: bool = False,
    one_sampler_only: bool = False,
    compat_policy: str = DEFAULT_COMPAT_POLICY,
):
    """Return a MODEL clone patched with DiT Spectrum feature forecasting only."""
    if not enabled:
        return model
    if history_size < cheby_degree + 2:
        raise RuntimeError(
            "DiT Spectrum Patch requires history_size >= cheby_degree + 2 "
            f"(got history_size={history_size}, cheby_degree={cheby_degree})."
        )

    # `ModelPatcher.clone()` already isolates `model_options` via
    # `comfy.utils.deepcopy_list_dict`, which copies dict/list containers while
    # preserving every other object by reference. Do NOT add a `copy.deepcopy`
    # on top of it: `model_options["transformer_options"]` can hold state
    # objects that reference conditioning tensors and the DiT module itself
    # (e.g. `ModGuidanceState`), so a full deepcopy duplicates model-sized
    # storage in host RAM. See issue #8.
    m = model.clone()
    dit, model_sampling = _require_dit_spectrum_components(m)

    state = SpectrumState(
        window_size=window_size,
        flex_window=flex_window,
        warmup_steps=warmup_steps,
        w=blend_w,
        m=cheby_degree,
        lam=ridge_lambda,
        num_steps=steps,
        tail_actual_steps=tail_actual_steps,
        history_size=history_size,
        verbose=verbose,
        one_sampler_only=one_sampler_only,
        compat_policy=compat_policy,
    )

    _ensure_capture_hook(dit)
    old_wrapper = m.model_options.get("model_function_wrapper")
    # Captured as a local so the wrapper closure does NOT hold the patcher
    # itself. A wrapper closing over `m` forms a cycle through m.model_options;
    # patcher clones then die only in a full gc batch, and CPython clears
    # parent weakrefs before LoadedModel._switch_parent runs — stranding the
    # entry → ComfyUI logs "memory leak with model …" on every later prompt.
    model_options = m.model_options

    def actual_forward(apply_model, args, input_x, timestep, c):
        if old_wrapper is not None:
            return old_wrapper(apply_model, args)
        return apply_model(input_x, timestep, **c)

    def passthrough_forward(apply_model, args, input_x, timestep, c, live_dit):
        live_dit.final_layer._spectrum_state = None
        return actual_forward(apply_model, args, input_x, timestep, c)

    def spectrum_model_patch_wrapper(apply_model, args):
        input_x = args["input"]
        timestep = args["timestep"]
        c = args["c"]

        # Resolve the DiT/model_sampling that actually run this forward — a
        # downstream compile node may have rebuilt diffusion_model, stranding
        # the patch-time refs (see _resolve_live_components).
        live_dit, live_model_sampling = _resolve_live_components(
            apply_model, dit, model_sampling, state
        )

        # Re-arm one_sampler_only when ComfyUI re-runs the workflow (new
        # prompt_id); the cached MODEL would otherwise stay consumed forever.
        _maybe_rearm_for_new_execution(state)

        if state.patch_consumed:
            return passthrough_forward(
                apply_model, args, input_x, timestep, c, live_dit
            )

        # Re-home the capture hook + state onto the live final_layer every call,
        # so a reused *or rebuilt* diffusion_model never writes into a stale
        # (or dead) patch state.
        _ensure_capture_hook(live_dit)
        live_dit.final_layer._spectrum_state = state

        cond_or_uncond, valid_chunks = _normalize_cond_or_uncond(args, input_x.shape[0])
        keys = _spectrum_batch_keys(c, cond_or_uncond)
        if state.compat_policy != "legacy" and _spectrum_context_changed(
            state, input_x, keys
        ):
            state.clear_forecasters()
        sigma_val = timestep.flatten()[0].item()
        new_step = _advance_spectrum_state(state, sigma_val)
        if state.patch_consumed:
            return passthrough_forward(
                apply_model, args, input_x, timestep, c, live_dit
            )
        if new_step:
            state.mode = (
                "cached"
                if valid_chunks and state.should_cache(keys)
                else "actual"
            )
            if state.verbose:
                logger.info(
                    "DiT Spectrum Patch: step %d/%d sigma=%.6g mode=%s",
                    state.step_idx + 1,
                    state.num_steps,
                    sigma_val,
                    state.mode,
                )

        if _can_use_cached_prediction(
            state,
            keys,
            input_x,
            timestep,
            c,
            old_wrapper,
            model_options,
            args,
            valid_chunks,
        ):
            predictions = []
            for key in keys:
                predictions.append(
                    state.forecasters[key].predict(float(state.step_idx))
                )

            batched_feat = torch.cat(predictions, dim=0)
            t_internal = live_model_sampling.timestep(timestep).to(batched_feat.dtype)
            noise_pred = _spectrum_fast_forward(live_dit, t_internal, batched_feat)
            result = live_model_sampling.calculate_denoised(
                timestep, noise_pred.float(), input_x
            )
            _mark_spectrum_patch_consumed(state)
            return result

        state.mode = "actual"
        state.captured_feat = None

        result = actual_forward(apply_model, args, input_x, timestep, c)

        feat = state.captured_feat
        _update_forecasters_from_feature(
            state, feat, input_x, keys, valid_chunks, "DiT Spectrum Patch"
        )
        if state.verbose and not valid_chunks:
            logger.warning(
                "DiT Spectrum Patch: cond_or_uncond=%s does not divide batch=%d; "
                "running actual forward without forecast update",
                cond_or_uncond,
                input_x.shape[0],
            )

        _mark_spectrum_patch_consumed(state)
        return result

    m.set_model_unet_function_wrapper(spectrum_model_patch_wrapper)
    return m


def spectrum_sample(
    model,
    seed,
    steps,
    cfg,
    sampler_name,
    scheduler,
    positive,
    negative,
    latent_image,
    denoise,
    window_size,
    flex_window,
    warmup_steps,
    blend_w,
    cheby_degree,
    ridge_lambda,
    dcw_mode: str = "manual",
    dcw_lambda: float = 0.01,
    dcw_schedule: str = "one_minus_sigma",
    dcw_band_mask: str = "LL",
    dcw_calibrator: Optional[str] = None,
    clip=None,
    smc_cfg_alpha: float = 0.0,
    smc_cfg_lambda: float = 5.0,
    spd_scale: float = 1.0,
    spd_sigma: float = 1.0,
    spd_stages=None,
    spd_transition_sigmas=None,
    schedule: str = "window",
    refresh_ratio: float = -1.0,
    sea_beta: float = 2.0,
    cfgpp_lambda: float = 0.0,
    fsg_enabled: bool = False,
    fsg_band=(0.59, 0.75),
    fsg_k: int = 3,
    fsg_d_sigma: float = 0.1,
    fsg_gamma: float = 0.0,
    xattn_boost: float = 1.0,
    xattn_boost_band: float = 0.85,
    xattn_boost_renorm: str = "img",
    xattn_boost_renorm_frac: float = 0.5,
    compat_policy: str = DEFAULT_COMPAT_POLICY,
):
    """Shared Spectrum sampling logic used by all node tiers.

    spd_scale / spd_sigma: legacy single-handoff SPD (SPEED) multi-resolution
        knobs. When ``spd_scale < 1`` and ``0 < spd_sigma < 1`` the denoise loop
        is driven by the custom SPEED sampler (see ``spd.make_speed_sampler``):
        the ``spd_scale`` low-res prefix runs uncached, then at ``σ ≤ spd_sigma``
        the latent is spectral-expanded to full resolution and Spectrum forecasts
        the tail (phase-2-only naive-reset compose; ``bench/spd/compose_report.md``).
        Forces Euler. Defaults (1.0, 1.0) = no SPD, vanilla Spectrum path.
    spd_stages / spd_transition_sigmas: explicit multi-stage schedule (lists),
        e.g. ``[0.5, 0.75, 1.0]`` / ``[0.7, 0.4]``. When given they take
        precedence over the scalars above — this is how the LoRA-SPD node feeds a
        schedule read from an SPD-trained adapter's ``ss_spd_*`` metadata. See
        ``spd.resolve_spd_schedule``.

    dcw_mode: "off" / "manual" / "auto".
        - off: no DCW correction.
        - manual: scalar λ × schedule(σ_i), tunable via dcw_lambda + dcw_band_mask.
            Default 0.01 is the verified hyperparam for CFG ≥ ~2 with LL-only.
        - auto: per-step λ predicted by an OnlineDCWCalibrator fusion head.
            Requires ``clip`` (the same CLIP encoder feeding ``positive``) to
            recover post-LLM-adapter c_pool. ``dcw_calibrator`` names the
            artifact (or the auto-download sentinel). Forces band_mask = LL.

    dcw_lambda: scalar DCW strength used in manual mode. 0.0 = no-op even
        if mode != off. See anima_lora/docs/methods/dcw.md.
    dcw_band_mask: Subband restriction (manual mode only). Default 'LL' is
        strictly better than broadband on Anima.

    smc_cfg_alpha: α-adaptive Sliding-Mode Control CFG gain. ``0`` disables
        the modified CFG combine entirely (vanilla CFG path). ``0.2`` is the
        production default — α=0.2 puts the bang-bang correction at ~20% of
        the per-step mean residual magnitude, recovering detail without
        injecting visible chattering. Velocity-space combine (preserves
        across-step correctness when σ varies). Requires CFG ≠ 1 (auto-skipped).
    smc_cfg_lambda: SMC sliding-manifold slope λ. Paper sweep {3,4,5,6}; 5 best.

    cfgpp_lambda: CFG++ substrate strength λ (0 = off). Replaces the constant-w
        cond/uncond combine with the σ-scheduled CFG++ weight (paper App A.2);
        the substrate faithful FSG is defined on. λ=1.5 is the production point
        (tracks CFG=4 saturation/contrast). Mutually exclusive with SMC-CFG.
    fsg_enabled: Foresight Guidance pre-step latent calibration toward the
        golden path. Runs K forward-backward fixed-point iterations on the latent
        before each in-band step (forced to actual Spectrum forwards). Needs
        CFG ≠ 1. Pairs with cfgpp_lambda=1.5 for the production fsg/cfg++ point.
    fsg_band / fsg_k / fsg_d_sigma / fsg_gamma: FSG knobs. Band (σ_lo, σ_hi) is
        where calibration fires — default [0.59, 0.75] is the 1024-tier/28-step
        er_sde point; it moves DOWN for more steps and low-token (~768px) renders,
        UP for fewer steps (re-tune if you change steps/resolution; σ≈0.94 always
        diverges). K=3 iterations (each ~3 extra forwards). Δσ=0.1 stride.
        fsg_gamma=0 → use the CFG scale (=guidance); keep ≈4 even under CFG++
        (matching it to the CFG++ effective weight diverges).
    xattn_boost: Front-loaded cross-attn residual gain λ, applied to the
        conditional forward only at σ ≥ xattn_boost_band. 1.0 = off (exact
        identity). ~1.5 is the mild point, up to ~3.0; higher λ trades a mild
        global desaturation for stronger weak-tag / relation-binding adherence.
        Boosts only actual (block-running) forwards; forecast steps extrapolate
        from the boosted cond features. Composes with SMC-CFG / CFG++ / DCW /
        mod-guidance (they touch the combine or modulation, not the cond
        forward). See anima_lora/docs/inference/xattn_boost.md.
    xattn_boost_band: σ cutoff for xattn_boost (boost fires at σ ≥ band).
        Default 0.85 = the cross-attn drive-floor σ (~10 of 28 shifted-schedule
        steps). Raise for a tighter high-σ-only window.
    xattn_boost_renorm: Norm matching for the boost (anima Phase-1''; shipped
        default 'img'). 'img' rescales the post-cross-attn hidden state so the
        per-image MEAN token norm stays on its gain-1 shell — the boost becomes
        a rotation toward the cross-attn direction instead of an unconstrained
        residual add, killing the saturation-burn / framing-drift failure of
        the raw gain while keeping the token-norm peaks that carry highlights.
        'tok' matches every token individually (flattens exactly those peaks →
        grey tone; bench reference only). 'off' = raw pre-renorm gain.
        Needs the predict2 Block contract; falls back to 'off' with a warning
        on structure drift. Inert while xattn_boost = 1.0.
    xattn_boost_renorm_frac: Partial-correction exponent ρ (scale**ρ);
        1.0 = full shell match, 0.0 = raw boost. 0.5 at λ 2 was the Phase-1''
        tone sweet spot.
    """
    compat_policy = _normalize_compat_policy(compat_policy)
    m = model.clone()

    # SMC-CFG: replace the CFG combine before any sampler call. Alpha=0 is
    # the universal off-switch; CFG=1 also short-circuits since there is no
    # cond/uncond residual to slide on.
    if smc_cfg_alpha > 0.0 and not math.isclose(cfg, 1.0):
        has_external_cfg = m.model_options.get("sampler_cfg_function") is not None
        if compat_policy != "legacy" and has_external_cfg:
            logger.warning(
                "Spectrum: compat_policy=%s found an existing sampler_cfg_function; "
                "skipping SMC-CFG so it is not overwritten.",
                compat_policy,
            )
        else:
            install_smc_cfg(m, alpha=smc_cfg_alpha, lam=smc_cfg_lambda)

    # Auto mode: load + setup the calibrator. If anything fails, fall back to
    # manual semantics (dcw_lambda × schedule) — never hard-error mid-sample.
    calibrator = None
    if dcw_mode == "auto":
        if warmup_steps < 7:
            raise RuntimeError(
                f"auto-DCW needs spectrum warmup_steps >= calibrator k_warmup (=7); "
                f"got warmup_steps={warmup_steps}. Use manual mode or raise warmup."
            )
        if positive is None or clip is None:
            logger.warning(
                "auto-DCW: missing clip / positive — falling back to manual."
            )
        else:
            calibrator = setup_dcw_calibrator(m, clip, positive, dcw_calibrator)

    # DCW: register CALC_COND_BATCH wrapper + post-CFG hook.
    if dcw_mode == "off":
        pass  # no hooks
    else:
        install_dcw(
            m,
            lam=dcw_lambda,
            schedule=dcw_schedule,
            band_mask=dcw_band_mask,
            calibrator=calibrator,
        )

    # CFG++ substrate + FSG foresight calibration. Both need CFG (a cond/uncond
    # gap) and the σ schedule (CFG++ maps σ_i → σ_next for its reweight; FSG
    # forces its in-band steps to actual forwards). CFG++ is mutually exclusive
    # with SMC-CFG (both own sampler_cfg_function). The σ schedule is recomputed
    # the way comfy.sample.sample will inside the loop, so the indices/weights
    # line up. SPD re-spaces σ mid-loop, so neither composes with it.
    do_cfg = not math.isclose(cfg, 1.0)
    smc_active = smc_cfg_alpha > 0.0 and do_cfg
    fsg = None
    fsg_steps: frozenset = frozenset()
    want_cfgpp = cfgpp_lambda and cfgpp_lambda > 0.0
    spd_will_own_loop = bool(spd_stages) or (
        0.0 < spd_scale < 1.0 and 0.0 < spd_sigma < 1.0
    )
    if (want_cfgpp or fsg_enabled) and not do_cfg:
        logger.warning("CFG++/FSG need CFG (cfg != 1.0); ignoring.")
        want_cfgpp = fsg_enabled = False
    if (want_cfgpp or fsg_enabled) and spd_will_own_loop:
        logger.warning("CFG++/FSG are not wired into SPD/SPEED; ignoring.")
        want_cfgpp = fsg_enabled = False

    if want_cfgpp or fsg_enabled:
        ks_sched = comfy.samplers.KSampler(
            m,
            steps=steps,
            device=m.load_device,
            sampler=sampler_name,
            scheduler=scheduler,
            denoise=denoise,
        )
        sigma_schedule = [float(s) for s in ks_sched.sigmas]

        if want_cfgpp:
            if smc_active:
                logger.warning(
                    "CFG++ and SMC-CFG both replace the cond/uncond combine; "
                    "ignoring CFG++ (SMC-CFG is active)."
                )
            else:
                install_cfgpp(m, lam=float(cfgpp_lambda), sigmas=sigma_schedule)
                logger.info("CFG++ substrate active (λ=%.3g).", cfgpp_lambda)

        if fsg_enabled:
            fsg = FSGCalibrator(
                band=tuple(fsg_band),
                k=int(fsg_k),
                d_sigma=float(fsg_d_sigma),
                gamma=(float(fsg_gamma) if fsg_gamma and fsg_gamma > 0.0 else None),
            )
            fsg_steps = fsg_step_indices(fsg, sigma_schedule, steps)
            install_fsg(m, fsg=fsg, guidance_scale=cfg)
            logger.info(
                "FSG active: band=[%.2f, %.2f], K=%d, Δσ=%.3g, %d in-band steps "
                "(+~%d fwd).",
                fsg.band[0],
                fsg.band[1],
                fsg.k,
                fsg.d_sigma,
                len(fsg_steps),
                3 * fsg.k * len(fsg_steps),
            )

    # SEA schedule: resolve the auto-δ target + load any cached δ for this config.
    # An uncached config runs one window-scheduled calibration pass (full compute)
    # then persists δ; later generates at the same config use the SEA trigger.
    # Mirror SpectrumState's tail default; threaded to both the cache key's
    # stop_at and the state so the decision region can never drift between them.
    tail_actual_steps = 3
    sea_key = None
    sea_delta = None
    if schedule == "sea" and (spd_stages or spd_scale < 1.0):
        logger.warning(
            "Spectrum SEA is incompatible with SPD/SPEED (mid-loop σ re-spacing "
            "breaks the distance trace); falling back to the window schedule."
        )
        schedule = "window"
    if schedule == "sea":
        from . import spectrum_sea as _sea

        stop_at = steps - tail_actual_steps
        if refresh_ratio <= 0.0:
            refresh_ratio = _sea.window_decision_fraction(
                steps, warmup_steps, stop_at, window_size, flex_window
            )
        h_lat, w_lat = (
            int(latent_image["samples"].shape[-2]),
            int(latent_image["samples"].shape[-1]),
        )
        # CFG++ λ and the FSG forced-step set move the trajectory δ is
        # calibrated against, so fold them into the key — a plain run and an
        # fsg/cfg++ run at the same geometry must never share a cached δ.
        sea_extra = ""
        if want_cfgpp and not smc_active:
            sea_extra += f"cfgpp{round(float(cfgpp_lambda), 4)}"
        if fsg is not None:
            sea_extra += f"fsg{sorted(fsg_steps)}k{fsg.k}d{round(fsg.d_sigma, 3)}"
        sea_key = _sea.make_cache_key(
            steps,
            warmup_steps,
            stop_at,
            refresh_ratio,
            cfg,
            sampler_name,
            h_lat,
            w_lat,
            extra=sea_extra,
        )
        sea_delta = _sea.load_delta(sea_key)
        logger.info(
            "Spectrum SEA: refresh_ratio=%.3f, δ=%s (%s)",
            refresh_ratio,
            f"{sea_delta:.4g}" if sea_delta is not None else "uncalibrated",
            "cached → SEA trigger"
            if sea_delta is not None
            else "calibrating this run (window schedule, full compute)",
        )

    state = SpectrumState(
        window_size=window_size,
        flex_window=flex_window,
        warmup_steps=warmup_steps,
        w=blend_w,
        m=cheby_degree,
        lam=ridge_lambda,
        num_steps=steps,
        tail_actual_steps=tail_actual_steps,
        schedule=schedule,
        refresh_ratio=refresh_ratio,
        sea_beta=sea_beta,
        delta=sea_delta,
        fsg_steps=fsg_steps,
        compat_policy=compat_policy,
    )

    dit = m.model.diffusion_model
    model_sampling = m.model.model_sampling

    # Install capture hook once per DiT instance (no-op on subsequent runs) and
    # bind this sample's state to the module. The hook reads state from the
    # module attribute, so its identity/closure is stable across samples —
    # torch.compile's dynamo cache survives between runs.
    _ensure_capture_hook(dit)
    dit.final_layer._spectrum_state = state

    # --xattn_boost: install the per-block cross-attn gain hooks once and arm
    # them per-forward inside the wrapper. 1.0 = off (exact identity, no hook
    # cost beyond a None-read). Applies to actual forwards only; the cached
    # fast-forward path skips the blocks entirely.
    xattn_boost_active = xattn_boost is not None and not math.isclose(
        float(xattn_boost), 1.0
    )
    xattn_renorm_mode = str(xattn_boost_renorm or "off").lower()
    if xattn_renorm_mode not in ("off", "tok", "img"):
        logger.warning(
            "Spectrum xattn boost: unknown renorm mode %r; using 'img'.",
            xattn_boost_renorm,
        )
        xattn_renorm_mode = "img"
    if xattn_boost_active:
        xattn_boost_active = _ensure_xattn_gain_patch(dit)
        if xattn_boost_active and xattn_renorm_mode != "off":
            if not _ensure_xattn_block_patch(dit):
                xattn_renorm_mode = "off"  # raw-gain fallback (warned inside)
        if xattn_boost_active:
            logger.info(
                "Spectrum xattn boost active: λ=%.3g at σ ≥ %.3g, renorm=%s ρ=%.2g "
                "(cond forward only, compile-safe buffer path).",
                float(xattn_boost),
                float(xattn_boost_band),
                xattn_renorm_mode,
                float(xattn_boost_renorm_frac),
            )

    old_wrapper = m.model_options.get("model_function_wrapper")
    # Local capture keeps the transient clone `m` OUT of the wrapper closure
    # (same strand hazard as documented at the patch-node wrapper above).
    model_options = m.model_options

    def spectrum_wrapper(apply_model, args):
        input_x = args["input"]
        timestep = args["timestep"]
        c = args["c"]
        cond_or_uncond, valid_chunks = _normalize_cond_or_uncond(
            args, input_x.shape[0]
        )
        keys = _spectrum_batch_keys(c, cond_or_uncond)
        if state.compat_policy != "legacy" and _spectrum_context_changed(
            state, input_x, keys
        ):
            state.clear_forecasters()

        sigma_val = timestep.flatten()[0].item()

        if state.last_sigma is None or abs(sigma_val - state.last_sigma) > 1e-8:
            if state.step_idx >= 0:
                if state.mode == "actual":
                    state.fwd_count += 1
                    if state.step_idx >= state.warmup_steps:
                        state.curr_ws = round(state.curr_ws + state.flex_window, 3)
                    state.consec_cached = 0
                    state.sea_accum = 0.0  # refresh resets the SEA accumulator (Eq. 8)
                else:
                    state.consec_cached += 1

            state.step_idx += 1
            state.steps_seen += 1
            state.last_sigma = sigma_val
            # Accrue the SEA distance on this step's x_t before the cache decision.
            state.observe_sea(input_x, sigma_val)
            state.mode = (
                "cached" if valid_chunks and state.should_cache(keys) else "actual"
            )

        if _can_use_cached_prediction(
            state,
            keys,
            input_x,
            timestep,
            c,
            old_wrapper,
            model_options,
            args,
            valid_chunks,
        ):
            predictions = []
            for key in keys:
                pred_feat = state.forecasters[key].predict(float(state.step_idx))
                predictions.append(pred_feat)

            batched_feat = torch.cat(predictions, dim=0)
            t_internal = model_sampling.timestep(timestep).to(batched_feat.dtype)
            noise_pred = _spectrum_fast_forward(dit, t_internal, batched_feat)
            return model_sampling.calculate_denoised(
                timestep, noise_pred.float(), input_x
            )

        state.mode = "actual"
        state.captured_feat = None

        # Arm the cross-attn boost for this actual forward: λ on cond rows at
        # σ ≥ band, identity elsewhere (written into the per-block gain buffers,
        # read inside the compiled block graph). Reset in finally so no gain
        # leaks into the next forward (cached steps never run the blocks).
        boost_armed = False
        if xattn_boost_active:
            boost_armed = _set_xattn_gain(
                dit,
                cond_or_uncond,
                input_x.shape[0],
                float(xattn_boost),
                float(xattn_boost_band),
                sigma_val,
                renorm_mode=xattn_renorm_mode,
                renorm_frac=float(xattn_boost_renorm_frac),
            )
        try:
            if old_wrapper is not None:
                result = old_wrapper(apply_model, args)
            else:
                result = apply_model(input_x, timestep, **c)
        finally:
            if boost_armed:
                _reset_xattn_gain(dit)

        feat = state.captured_feat
        _update_forecasters_from_feature(
            state, feat, input_x, keys, valid_chunks, "Spectrum"
        )
        if state.verbose and not valid_chunks:
            logger.warning(
                "Spectrum: cond_or_uncond=%s does not divide batch=%d; running "
                "actual forward without forecast update",
                cond_or_uncond,
                input_x.shape[0],
            )

        return result

    m.set_model_unet_function_wrapper(spectrum_wrapper)

    latent_img = latent_image["samples"].clone()
    latent_img = comfy.sample.fix_empty_latent_channels(
        m, latent_img, latent_image.get("downscale_ratio_spacial")
    )

    # Pad to mod-2 latent (Anima DiT patch_size=2) before noise / sampling so
    # odd-shape latents (mod-8 pixel but not mod-16) don't trip PatchEmbed.
    latent_img, orig_hw = _pad_latent_to_patch_multiple(latent_img)
    pad_h = latent_img.shape[-2] - orig_hw[0]
    pad_w = latent_img.shape[-1] - orig_hw[1]

    batch_inds = latent_image.get("batch_index")
    noise = comfy.sample.prepare_noise(latent_img, seed, batch_inds)

    noise_mask = latent_image.get("noise_mask")
    if noise_mask is not None and (pad_h or pad_w):
        # Pad with ones so the appended strip denoises normally; we crop it off.
        noise_mask = F.pad(noise_mask, (0, pad_w, 0, pad_h), mode="constant", value=1.0)
    callback = latent_preview.prepare_callback(m, steps)
    disable_pbar = not comfy.utils.PROGRESS_BAR_ENABLED

    # SPD (SPEED) takes over the loop when a real low→full transition is asked
    # for. It must own the loop (mid-loop resolution change + σ re-space), so it
    # runs through a custom KSAMPLER via sample_custom rather than the string
    # sampler path. Everything upstream (SMC / DCW / mod-guidance / the Spectrum
    # wrapper + capture hook) is already installed on ``m`` and composes.
    from .spd import make_speed_sampler, resolve_spd_schedule

    spd_stages_r, spd_trans_r, spd_active = resolve_spd_schedule(
        spd_stages, spd_transition_sigmas, spd_scale, spd_sigma
    )
    if spd_active and sampler_name != "euler":
        logger.warning(
            "SPEED/SPD re-spaces σ mid-loop and is Euler-only; ignoring requested "
            "sampler '%s' and using Euler.",
            sampler_name,
        )

    try:
        if spd_active:
            # Phase-2-only: the SPEED sampler flips state.active True at the handoff.
            state.active = False
            ks = comfy.samplers.KSampler(
                m,
                steps=steps,
                device=m.load_device,
                sampler=sampler_name,
                scheduler=scheduler,
                denoise=denoise,
                model_options=m.model_options,
            )
            sampler_obj = make_speed_sampler(state, spd_stages_r, spd_trans_r, seed)
            samples = comfy.sample.sample_custom(
                m,
                noise,
                cfg,
                sampler_obj,
                ks.sigmas,
                positive,
                negative,
                latent_img,
                noise_mask=noise_mask,
                callback=callback,
                disable_pbar=disable_pbar,
                seed=seed,
            )
        else:
            samples = comfy.sample.sample(
                m,
                noise,
                steps,
                cfg,
                sampler_name,
                scheduler,
                positive,
                negative,
                latent_img,
                denoise=denoise,
                noise_mask=noise_mask,
                callback=callback,
                disable_pbar=disable_pbar,
                seed=seed,
            )
    finally:
        dit.final_layer._spectrum_state = None
        if xattn_boost_active:
            _reset_xattn_gain(dit, neutral_shape=True)
        if hasattr(dit, "_mod_pooled_proj"):
            del dit._mod_pooled_proj
        # Drop this run's wrapper from the transient clone. Belt-and-braces
        # with the closure fix above: guarantees `m` (and its parent clone
        # chain) dies by plain refcount when this frame exits, so ComfyUI's
        # LoadedModel parent-rescue (weakref-based, defeated by same-gc-batch
        # death) never strands an entry for this sample.
        m.model_options.pop("model_function_wrapper", None)

    if pad_h or pad_w:
        samples = samples[..., : orig_hw[0], : orig_hw[1]].contiguous()

    if state.step_idx >= 0:
        if state.mode == "actual":
            state.fwd_count += 1
        else:
            state.consec_cached += 1

    actual = state.fwd_count
    # SPD resets step_idx at the handoff, so step_idx only spans the tail; use
    # the cumulative step counter for the across-phase total. Note the low-res
    # prefix forwards are cheaper than full-res, so this block-skip ratio
    # understates the true SPEED wall-clock speedup.
    total = state.steps_seen if spd_active else state.step_idx + 1
    speedup = total / max(1, actual)
    do_cfg = not math.isclose(cfg, 1.0)
    cfg_note = " (x2 for CFG)" if do_cfg else ""
    tag = "SPEED (SPD+Spectrum)" if spd_active else "Spectrum"
    logger.info(
        f"{tag}: {actual}/{total} actual forwards "
        f"({speedup:.2f}x block-skip ratio{cfg_note})"
    )

    # SEA auto-δ: this generate ran the window schedule while recording the SEA
    # distance trace — solve the δ that hits the target refresh fraction and cache
    # it so subsequent generates at this config use the SEA trigger.
    if (
        schedule == "sea"
        and sea_delta is None
        and sea_key is not None
        and state.sea_dists
    ):
        from . import spectrum_sea as _sea

        new_delta = _sea.solve_delta_for_refresh_ratio(state.sea_dists, refresh_ratio)
        _sea.save_delta(sea_key, new_delta)
        logger.info(
            "Spectrum SEA: auto-calibrated δ=%.4g (target refresh_ratio=%.3f over "
            "%d decision steps); cached → subsequent generates at this config use "
            "the SEA trigger.",
            new_delta,
            refresh_ratio,
            len(state.sea_dists),
        )

    out = latent_image.copy()
    out.pop("downscale_ratio_spacial", None)
    out["samples"] = samples
    return (out,)
