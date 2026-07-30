from contextlib import contextmanager
from contextvars import ContextVar


_PROFILE_KNOWN_TOTAL_SAMPLER_CLASSES = ContextVar(
    "simpai_profile_known_total_sampler_classes",
    default=frozenset(),
)


@contextmanager
def use_progress_profile(profile):
    profile_classes = getattr(profile, "known_total_sampler_classes", ()) if profile is not None else ()
    classes = frozenset(str(class_type) for class_type in profile_classes if class_type)
    active_classes = _PROFILE_KNOWN_TOTAL_SAMPLER_CLASSES.get()
    token = _PROFILE_KNOWN_TOTAL_SAMPLER_CLASSES.set(active_classes | classes)
    try:
        yield
    finally:
        _PROFILE_KNOWN_TOTAL_SAMPLER_CLASSES.reset(token)


def _int_like(value):
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        text = value.strip()
        if text.isdigit():
            return int(text)
        try:
            parsed = float(text)
        except ValueError:
            return None
        return int(parsed) if parsed.is_integer() else None
    return None


def _is_aio_enhance_uov_upscale_setup_progress(class_type, inputs, max_value):
    if class_type != "SimpAIAIOEnhanceUOVConfig":
        return False
    if not isinstance(inputs, dict):
        return False

    method = str(inputs.get("method") or "").lower()
    if "upscale" not in method:
        return False

    tile_steps = _int_like(inputs.get("tile_steps"))
    progress_max = _int_like(max_value)
    if tile_steps is None or progress_max is None:
        return False

    return progress_max > tile_steps


def install_aio_enhance_uov_progress_filter(comfyclient_pipeline):
    original = getattr(comfyclient_pipeline, "_should_count_progress_as_sampler_step", None)
    if not callable(original):
        return False
    if getattr(original, "_simpai_aio_enhance_uov_progress_filter", False):
        return False

    def should_count_progress_as_sampler_step(class_type, inputs, max_value, total_steps_known):
        if _is_aio_enhance_uov_upscale_setup_progress(class_type, inputs, max_value):
            return False
        return original(class_type, inputs, max_value, total_steps_known)

    should_count_progress_as_sampler_step._simpai_aio_enhance_uov_progress_filter = True
    should_count_progress_as_sampler_step._simpai_original = original
    comfyclient_pipeline._should_count_progress_as_sampler_step = should_count_progress_as_sampler_step
    return True


_KNOWN_TOTAL_ADVANCED_SAMPLERS = {
    "KSamplerAdvanced",
    "SamplerCustomAdvanced",
    "LanPaint_KSamplerAdvanced",
    "LanPaint_SamplerCustomAdvanced",
}


def install_advanced_sampler_known_total_progress_filter(comfyclient_pipeline):
    original = getattr(comfyclient_pipeline, "_should_use_dynamic_stage_total", None)
    if not callable(original):
        return False
    if getattr(original, "_simpai_advanced_sampler_known_total_filter", False):
        return False

    def should_use_dynamic_stage_total(class_type):
        if class_type in _PROFILE_KNOWN_TOTAL_SAMPLER_CLASSES.get():
            return False
        if class_type in _KNOWN_TOTAL_ADVANCED_SAMPLERS:
            return False
        return original(class_type)

    should_use_dynamic_stage_total._simpai_advanced_sampler_known_total_filter = True
    should_use_dynamic_stage_total._simpai_original = original
    comfyclient_pipeline._should_use_dynamic_stage_total = should_use_dynamic_stage_total
    return True
