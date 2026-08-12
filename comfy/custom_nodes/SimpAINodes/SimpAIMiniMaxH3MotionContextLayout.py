import logging

import torch

import comfy.ldm.minimax.model as minimax_model


MC_KEY = "motion_context_index"
MC_AUDIO_KEY = "motion_context_audio_end_frame"
PATCH_MARKER = "_simpai_h3_motion_context_layout_patch"
_LOG = logging.getLogger("simpai_h3_motion_context")
_ORIGINAL_INIT = None
_APPLIED = False


def _target_origin(layout):
    start, end, kind = layout.segments[-1]
    if kind != "video" or end <= start:
        raise RuntimeError("MiniMax H3 target video segment is not last in PackedLayout")
    return float(layout.position_ids[start, 0])


def _expected_ref_segments(block):
    kind = block.get("kind")
    if kind == "image":
        return ("ref_img",)
    if kind == "audio":
        return ("ref_audio",) if int(block.get("ref_audio_t", 0)) > 0 else ()
    if kind in ("video", "video_audio"):
        if int(block.get("ref_audio_t", 0)) > 0:
            return ("ref_audio", "ref_img")
        return ("ref_img",)
    raise RuntimeError(f"Unknown MiniMax H3 reference kind: {kind!r}")


def _reference_segments(layout, refs):
    actual = [(a, b, kind) for a, b, kind in layout.segments if kind in ("ref_img", "ref_audio")]
    expected = [
        (index, kind)
        for index, block in enumerate(refs or [])
        for kind in _expected_ref_segments(block)
    ]
    if len(actual) != len(expected):
        raise RuntimeError("MiniMax H3 reference segment layout changed upstream")
    result = {}
    for (index, wanted), (start, end, got) in zip(expected, actual):
        if wanted != got:
            raise RuntimeError("MiniMax H3 reference segment order changed upstream")
        result.setdefault(index, {})[got] = (start, end)
    return result


def _condition_time(text_len, latent_t, frame_count, pixel_index):
    if pixel_index == 0:
        return float(text_len)
    if frame_count is not None and pixel_index == frame_count - 1:
        return float(text_len) + sum(minimax_model._video_t_spans(latent_t)) - minimax_model.FRAME_RESCALE
    return float(text_len) + minimax_model.FRAME_RESCALE * float(pixel_index)


def _fix_keyframe_positions(layout, text_len, latent_t, frame_count, keyframes):
    offset = _target_origin(layout) - float(text_len)
    condition_segments = [(a, b) for a, b, kind in layout.segments if kind == "cond"]
    if len(condition_segments) != len(keyframes):
        raise RuntimeError("MiniMax H3 keyframe segment count changed upstream")
    for (start, end), keyframe in zip(condition_segments, keyframes):
        pixel_index = keyframe.get(MC_KEY)
        if pixel_index is None:
            continue
        layout.position_ids[start:end, 0] = (
            _condition_time(text_len, latent_t, frame_count, pixel_index) + offset
        )


def _fix_audio_position(layout, refs):
    marked = [index for index, block in enumerate(refs or []) if block.get(MC_AUDIO_KEY) is not None]
    if len(marked) != 1:
        raise RuntimeError("MiniMax H3 motion context needs exactly one marked audio reference")
    index = marked[0]
    block = refs[index]
    if block.get("kind") != "audio":
        raise RuntimeError("Motion context audio marker must be attached to an audio reference")
    ref_audio_t = int(block.get("ref_audio_t", 0))
    if ref_audio_t <= 0:
        return
    segment = _reference_segments(layout, refs).get(index, {}).get("ref_audio")
    if segment is None:
        raise RuntimeError("MiniMax H3 motion context audio segment is missing")
    start, end = segment
    if end - start != ref_audio_t * 2:
        raise RuntimeError("MiniMax H3 reference audio row count changed upstream")
    target_origin = _target_origin(layout)
    current_start = float(layout.position_ids[start, 0])
    desired_start = target_origin + minimax_model.FRAME_RESCALE * float(block[MC_AUDIO_KEY]) - ref_audio_t
    layout.position_ids[start:end, 0] += desired_start - current_start


def _patched_init(self, text_len, latent_t, latent_h, latent_w, audio_t, keyframes=None, refs=None, frame_count=None):
    _ORIGINAL_INIT(
        self,
        text_len,
        latent_t,
        latent_h,
        latent_w,
        audio_t,
        keyframes=keyframes,
        refs=refs,
        frame_count=frame_count,
    )
    if keyframes and any(MC_KEY in keyframe for keyframe in keyframes):
        _fix_keyframe_positions(self, text_len, latent_t, frame_count, keyframes)
    if refs and any(MC_AUDIO_KEY in block for block in refs):
        _fix_audio_position(self, refs)


setattr(_patched_init, PATCH_MARKER, True)


def _self_test():
    text_len, latent_t, latent_h, latent_w, audio_t = 7, 7, 22, 38, 16
    frame_count = sum(minimax_model.FRAME_PER_TOKEN[k % 5] for k in range(latent_t))
    stock = minimax_model.PackedLayout(
        text_len,
        latent_t,
        latent_h,
        latent_w,
        audio_t,
        keyframes=[{"resolved_frame_index": 0}, {"resolved_frame_index": frame_count - 1}],
        frame_count=frame_count,
    )
    candidate = minimax_model.PackedLayout.__new__(minimax_model.PackedLayout)
    _ORIGINAL_INIT(
        candidate,
        text_len,
        latent_t,
        latent_h,
        latent_w,
        audio_t,
        keyframes=[
            {"resolved_frame_index": 0, MC_KEY: 0},
            {"resolved_frame_index": 0, MC_KEY: frame_count - 1},
        ],
        frame_count=frame_count,
    )
    _fix_keyframe_positions(
        candidate,
        text_len,
        latent_t,
        frame_count,
        [
            {"resolved_frame_index": 0, MC_KEY: 0},
            {"resolved_frame_index": 0, MC_KEY: frame_count - 1},
        ],
    )
    if not torch.equal(stock.position_ids, candidate.position_ids):
        raise RuntimeError("MiniMax H3 motion context layout self-test failed")


def apply_patch():
    global _ORIGINAL_INIT, _APPLIED
    if _APPLIED:
        return True
    packed_layout = getattr(minimax_model, "PackedLayout", None)
    if packed_layout is None:
        _LOG.warning("MiniMax H3 PackedLayout is unavailable")
        return False
    current = getattr(packed_layout, "__init__", None)
    if getattr(current, PATCH_MARKER, False):
        _APPLIED = True
        return True
    if current is None or getattr(current, "__module__", minimax_model.__name__) != minimax_model.__name__:
        _LOG.warning("Another H3 PackedLayout patch is already active")
        return False
    _ORIGINAL_INIT = current
    try:
        _self_test()
    except Exception as err:
        _ORIGINAL_INIT = None
        _LOG.warning("MiniMax H3 motion context layout self-test failed: %s", err)
        return False
    packed_layout.__init__ = _patched_init
    _APPLIED = True
    return True


def is_applied():
    return _APPLIED
