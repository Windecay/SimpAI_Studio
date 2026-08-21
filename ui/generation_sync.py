from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any


def _component_value(current_value: Any, update: Any) -> Any:
    if isinstance(update, dict) and update.get("__type__") == "update":
        return update.get("value", current_value)
    return update


def synchronize_generation_inputs(
    *,
    model_values: Sequence[Any],
    prompt_values: Sequence[Any],
    backend_params: Any,
    director_values: Sequence[Any],
    random_values: Sequence[Any],
    quick_enhance_values: Sequence[Any],
    inpaint_values: Sequence[Any],
    cloud_values: Sequence[Any],
    sync_model_state: Callable[..., Any],
    wait_for_vlm: Callable[[], Any],
    avoid_empty_prompt: Callable[..., Any],
    apply_director_prompt: Callable[..., tuple[Any, Any]],
    select_random_aspect_ratio: Callable[..., Sequence[Any]],
    sync_quick_enhance: Callable[..., Sequence[Any]],
    sync_inpaint_engines: Callable[..., Sequence[Any]],
    sync_cloud_params: Callable[..., Any],
) -> list[Any]:
    """Execute generation input synchronization in the original callback order."""
    prompt_text, state_params, canvas_image, input_image, scene_theme, additional_prompt, additional_prompt_2 = prompt_values
    director_enabled, director_runtime = director_values

    model_state = sync_model_state(*model_values)
    wait_for_vlm()

    prompt_update = avoid_empty_prompt(
        prompt_text,
        state_params,
        canvas_image,
        input_image,
        scene_theme,
        additional_prompt,
        additional_prompt_2,
    )
    prompt_text = _component_value(prompt_text, prompt_update)
    prompt_text, backend_params = apply_director_prompt(
        prompt_text,
        backend_params,
        director_enabled,
        director_runtime,
        state_params,
        scene_theme,
    )

    random_updates = list(select_random_aspect_ratio(*random_values))
    quick_enhance_updates = list(sync_quick_enhance(*quick_enhance_values))
    inpaint_updates = list(sync_inpaint_engines(state_params, *inpaint_values))
    backend_params = sync_cloud_params(backend_params, *cloud_values, scene_theme)

    return [
        model_state,
        prompt_text,
        backend_params,
        *random_updates,
        *quick_enhance_updates,
        *inpaint_updates,
    ]
