import logging

import comfy.model_base as model_base


MC_KEY = "motion_context_index"
MC_AUDIO_KEY = "motion_context_audio_end_frame"
PATCH_MARKER = "_simpai_h3_motion_context_payload_patch"
_LOG = logging.getLogger("simpai_h3_motion_context")
_ORIGINAL_EXTRA_CONDS = None
_APPLIED = False


def _patched_extra_conds(self, **kwargs):
    output = _ORIGINAL_EXTRA_CONDS(self, **kwargs)
    keyframes = kwargs.get("minimax_keyframes")
    refs = kwargs.get("minimax_refs")
    if not keyframes or not refs:
        return output
    if not any(MC_KEY in keyframe for keyframe in keyframes) and not any(
        MC_AUDIO_KEY in ref for ref in refs
    ):
        return output

    payload_value = output.get("minimax_payload")
    payload = getattr(payload_value, "cond", None) if payload_value is not None else None
    if not isinstance(payload, dict):
        _LOG.warning("MiniMax H3 motion context payload is not accessible")
        return output
    payload["cond_video_latents"] = [
        keyframe["latent"] for keyframe in keyframes if "latent" in keyframe
    ] + [ref["latent"] for ref in refs if "latent" in ref]
    payload["cond_audio_latents"] = [
        ref["audio_latent"] for ref in refs if ref.get("audio_latent") is not None
    ]
    if kwargs.get("minimax_frame_count") is not None:
        payload["frame_count"] = kwargs["minimax_frame_count"]
    return output


setattr(_patched_extra_conds, PATCH_MARKER, True)


def apply_patch():
    global _ORIGINAL_EXTRA_CONDS, _APPLIED
    if _APPLIED:
        return True
    h3_class = getattr(model_base, "MiniMaxH3", None)
    current = getattr(h3_class, "extra_conds", None) if h3_class is not None else None
    if current is None:
        _LOG.warning("MiniMaxH3.extra_conds is unavailable")
        return False
    if getattr(current, PATCH_MARKER, False):
        _APPLIED = True
        return True
    if getattr(current, "__module__", model_base.__name__) != model_base.__name__:
        _LOG.warning("Another H3 extra_conds patch is already active")
        return False
    _ORIGINAL_EXTRA_CONDS = current
    h3_class.extra_conds = _patched_extra_conds
    _APPLIED = True
    return True


def is_applied():
    return _APPLIED
