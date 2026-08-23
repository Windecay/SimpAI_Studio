from __future__ import annotations
import logging
import os
import time

import gradio as gr
from enhanced.logger import format_name
from ui.update_helpers import gr_update, skip_update

logger = logging.getLogger(format_name(__name__))
_TRUE_ENV_VALUES = {"1", "true", "yes", "on", "debug"}


def _simpai_ui_trace_enabled():
    return str(os.environ.get("SIMPAI_UI_TRACE", "")).strip().lower() in _TRUE_ENV_VALUES


def _log_ui_trace(target_logger, *args, **kwargs):
    if not _simpai_ui_trace_enabled():
        return
    try:
        target_logger.info(*args, **kwargs)
    except Exception:
        pass


def _resolve_scene_theme_from_state(sp):
    if not isinstance(sp, dict):
        return None
    current = sp.get("scene_theme", None)
    scene_frontend = sp.get("scene_frontend", {})
    raw_themes = scene_frontend.get("theme", []) if isinstance(scene_frontend, dict) else []
    if isinstance(raw_themes, str):
        themes = [raw_themes] if raw_themes else []
    elif isinstance(raw_themes, (list, tuple)):
        themes = [theme for theme in raw_themes if isinstance(theme, str) and theme]
    else:
        themes = []
    if isinstance(current, str) and current and (not themes or current in themes):
        return current
    resolved = themes[0] if themes else current
    _log_ui_trace(
        logger,
        "[UI-TRACE] scene_theme.resolve_fallback | preset=%r, current=%r, resolved=%r, choices=%r",
        sp.get("__preset", None),
        current,
        resolved,
        themes,
    )
    return resolved


def bind_topbar_store_events(
    *,
    layout_refs,
    topbar_module,
    state_topbar,
    system_params,
    identity_dialog,
    current_id_info,
    current_upstream_status,
    identity_export_btn,
    identity_ctrls,
    identity_input,
) -> None:
    layout_refs.bar_store_button.click(
        topbar_module.toggle_preset_store,
        inputs=state_topbar,
        outputs=[
            layout_refs.preset_store,
            layout_refs.preset_store_list,
            system_params,
            identity_dialog,
            current_id_info,
            current_upstream_status,
            identity_export_btn,
        ]
        + identity_ctrls
        + identity_input,
        show_progress=False,
        queue=False,
    ).then(fn=lambda x: None, inputs=system_params, js="(x)=>{refresh_topbar_status_js(x);}")

    layout_refs.preset_store_apply_button.click(
        topbar_module.apply_navbar_from_store_editor,
        inputs=[layout_refs.preset_store_apply_payload, state_topbar],
        outputs=layout_refs.nav_bars + [system_params],
        show_progress=False,
        queue=False,
    ).then(fn=lambda x: None, inputs=system_params, js="(x)=>{refresh_topbar_status_js(x);}")

    layout_refs.preset_store_delete_button.click(
        topbar_module.delete_user_preset_from_store,
        inputs=[layout_refs.preset_store_delete_payload, state_topbar],
        outputs=[layout_refs.preset_store_list] + layout_refs.nav_bars + [system_params],
        show_progress=False,
        queue=False,
    ).then(fn=lambda x: None, inputs=system_params, js="(x)=>{refresh_topbar_status_js(x);}")


def bind_topbar_navigation_events(
    *,
    bar_buttons,
    topbar_module,
    reset_preset_inputs,
    reset_layout_ui_outputs,
    reset_layout_nav_outputs=None,
    reset_layout_omitted_output_indices=None,
    reset_layout_scene_outputs=None,
    reset_layout_deferred_ui_state=None,
    state_topbar,
    comparison_state,
    comparison_box,
    progress_gallery,
    compare_btn,
    progress_window,
    refresh_files_clicked,
    model_filter_state,
    models_tab_active_state=None,
    model_params_state=None,
    refresh_files_output,
    lora_ctrls,
    reset_values_inputs,
    reset_layout_values_outputs,
    reset_layout_deferred_value_outputs=None,
    reset_layout_deferred_value_state=None,
    reset_layout_after_identity_outputs=None,
    reset_layout_after_identity_state=None,
    reset_layout_values_fn,
    reset_preset_styles_fn,
    style_selections,
    sanitize_ip_types,
    ip_types,
    sync_scene_models_from_main,
    base_model,
    refiner_model,
    scene_generation_model_ctrls,
    scene_theme,
    enforce_scene_panel_visibility,
    scene_panel,
    enforce_scene_setting_core_tabs_visibility,
    setting_core_tabs,
    advanced_checkbox,
    advanced_column,
    system_params,
    toggle_image_input_panel,
    input_image_checkbox,
    qwen_tts_checkbox,
    image_input_panel,
    layout_image_tab,
    update_describe_output_tags,
    engine_class_display,
    tts_panel,
    describe_output_tags,
    inpaint_mode_change,
    inpaint_mode,
    inpaint_engine_state,
    outpaint_selections,
    inpaint_additional_prompt,
    example_inpaint_prompts,
    inpaint_disable_initial_latent,
    inpaint_engine,
    inpaint_strength,
    inpaint_respective_field,
    inpaint_engine_state_change,
    enhance_inpaint_mode_ctrls,
    enhance_inpaint_engine_ctrls,
    apply_preferred_output_format,
    output_format,
    check_and_show_missing_models,
    missing_model_modal,
    missing_model_list,
    missing_model_total_progress,
    missing_model_btn,
    comfyd_active_checkbox,
    scene_control_visibility_fn=None,
    scene_control_visibility_outputs=None,
    welcome_media_load_fn=None,
    welcome_media_load_inputs=None,
    welcome_media_load_outputs=None,
) -> None:
    def _debug_nav_trace(event_name, *values):
        if not _simpai_ui_trace_enabled():
            return
        try:
            import time as _t
            ts = _t.strftime('%H:%M:%S')
            ms = int((_t.time() % 1) * 1000)
            value_text = ", ".join([repr(v) for v in values])
            print(f"[UI-TRACE {ts}.{ms:03d}] {event_name} | {value_text}")
        except Exception as _e:
            print(f"[UI-TRACE] nav_log_failed: {_e}")

    def _update_topbar_js_params_safe(sp):
        try:
            return topbar_module.update_topbar_js_params(sp, include_canvas_catalogs=False)[0]
        except Exception as e:
            _debug_nav_trace(
                "nav.update_topbar_js_params_failed",
                type(e).__name__,
                str(e),
            )
            raise

    def _is_scene_state(sp):
        return isinstance(sp, dict) and ("scene_frontend" in sp)

    def _normalize_updates(result, expected, trace_name):
        if result is None:
            result = []
        if not isinstance(result, (list, tuple)):
            result = [result]
        result = list(result)
        actual = len(result)
        if actual != expected:
            try:
                _debug_nav_trace(f"{trace_name}.len_adjust", expected, actual)
            except Exception:
                pass
        if actual > expected:
            return result[:expected]
        if actual < expected:
            return result + [skip_update() for _ in range(expected - actual)]
        return result

    scene_visibility_output_count = len(scene_control_visibility_outputs or [])
    reset_layout_deferred_value_outputs = list(reset_layout_deferred_value_outputs or [])
    reset_layout_after_identity_outputs = list(reset_layout_after_identity_outputs or [])
    reset_layout_values_output_count = len(reset_layout_values_outputs)
    reset_layout_deferred_value_output_count = len(reset_layout_deferred_value_outputs)
    reset_layout_after_identity_output_count = len(reset_layout_after_identity_outputs)
    split_deferred_values = bool(reset_layout_deferred_value_state is not None and reset_layout_deferred_value_outputs)
    split_after_identity = bool(reset_layout_after_identity_state is not None and reset_layout_after_identity_outputs)
    nav_current_file_dropdown_inputs = list(refresh_files_output[2:5]) if len(refresh_files_output or []) >= 5 else []
    scene_model_output_count = len(scene_generation_model_ctrls)
    inpaint_mode_output_count = 7
    enhance_inpaint_output_count = len(enhance_inpaint_engine_ctrls)
    model_bridge_ui_output_ids = {id(base_model), id(refiner_model)} | {id(control) for control in lora_ctrls}
    reset_layout_scene_outputs = list(reset_layout_scene_outputs or [])
    reset_layout_main_outputs = list(reset_layout_ui_outputs)
    if reset_layout_scene_outputs:
        reset_layout_main_outputs = reset_layout_main_outputs[: max(0, len(reset_layout_main_outputs) - len(reset_layout_scene_outputs))]
    reset_layout_nav_output_count = len(reset_layout_nav_outputs or [])
    reset_layout_omitted_output_indices = set(reset_layout_omitted_output_indices or [])
    reset_layout_apply_main_output_pairs = [
        (index, output)
        for index, output in enumerate(reset_layout_main_outputs)
        if index >= reset_layout_nav_output_count and index not in reset_layout_omitted_output_indices
    ]
    reset_layout_apply_main_outputs = [output for _, output in reset_layout_apply_main_output_pairs]
    reset_layout_main_head_count = len(reset_layout_apply_main_outputs)
    reset_layout_main_tail_outputs = []
    if reset_layout_deferred_ui_state is not None and len(reset_layout_apply_main_outputs) > 1:
        reset_layout_main_head_count = max(1, (len(reset_layout_apply_main_outputs) + 1) // 2)
        reset_layout_main_tail_outputs = reset_layout_apply_main_outputs[reset_layout_main_head_count:]
    reset_layout_main_head_outputs = reset_layout_apply_main_outputs[:reset_layout_main_head_count]
    split_reset_layout_main = bool(reset_layout_deferred_ui_state is not None and reset_layout_main_tail_outputs)
    welcome_media_inputs = list(welcome_media_load_inputs or [state_topbar])
    welcome_media_outputs = list(welcome_media_load_outputs or [])
    reset_layout_tail_output_count = 6
    reset_layout_nav_tail_pairs = [
        (0, state_topbar),
        (1, comparison_state),
        (5, progress_window),
    ]
    reset_layout_nav_tail_outputs = [output for _, output in reset_layout_nav_tail_pairs]
    has_models_tab_active_state = models_tab_active_state is not None
    has_model_params_state = model_params_state is not None
    nav_model_value_inputs = [model_params_state] if has_model_params_state else nav_current_file_dropdown_inputs + list(lora_ctrls)

    def _value_from_component_update(update):
        if isinstance(update, dict):
            return update.get("value")
        if update is gr.skip() or update is None:
            return None
        return update

    def _value_from_nav_update(nav_updates, output, fallback):
        try:
            for index, candidate_output in enumerate(nav_visibility_values_outputs):
                if candidate_output is output and index < len(nav_updates):
                    value = _value_from_component_update(nav_updates[index])
                    return fallback if value is None else value
        except Exception:
            pass
        return fallback

    def _sanitize_model_bridge_ui_update(output, update, models_tab_active):
        if id(output) not in model_bridge_ui_output_ids:
            return update
        if not models_tab_active:
            return skip_update()
        value = _value_from_component_update(update)
        return gr_update(value=value) if value is not None else skip_update()

    def _reset_layout_ui_nav(*args):
        models_tab_active = True
        reset_args = args
        if has_models_tab_active_state and len(args) >= 2:
            models_tab_active = bool(args[-2])
            reset_args = args[:-2] + (args[-1],)
        result = topbar_module.reset_layout_ui(
            *reset_args,
            include_scene_outputs=not bool(reset_layout_scene_outputs),
        )
        if result is None:
            result = []
        if not isinstance(result, (list, tuple)):
            result = [result]
        result = list(result)
        full_ui_count = len(reset_layout_ui_outputs)
        main_count = len(reset_layout_main_outputs)
        state_start = full_ui_count
        state_end = full_ui_count + reset_layout_tail_output_count
        tail_full = result[state_start:state_end]
        if len(tail_full) < reset_layout_tail_output_count:
            tail_full += [skip_update() for _ in range(reset_layout_tail_output_count - len(tail_full))]
        tail = [
            tail_full[index] if index < len(tail_full) else skip_update()
            for index, _ in reset_layout_nav_tail_pairs
        ]
        main_updates = result[:main_count]
        if len(main_updates) < main_count:
            main_updates += [skip_update() for _ in range(main_count - len(main_updates))]
        if reset_layout_nav_output_count or reset_layout_omitted_output_indices:
            main_update_pairs = [
                (index, reset_layout_main_outputs[index], update)
                for index, update in enumerate(main_updates)
                if index >= reset_layout_nav_output_count and index not in reset_layout_omitted_output_indices
            ]
        else:
            main_update_pairs = [
                (index, reset_layout_main_outputs[index], update)
                for index, update in enumerate(main_updates)
            ]
        main_update_pairs = [
            (index, output, _sanitize_model_bridge_ui_update(output, update, models_tab_active))
            for index, output, update in main_update_pairs
        ]
        main_updates = [update for _, _, update in main_update_pairs]
        if split_reset_layout_main:
            return (
                main_updates[:reset_layout_main_head_count]
                + [main_updates[reset_layout_main_head_count:]]
                + tail
            )
        return main_updates + tail

    def _reset_layout_main_tail_batch(payload):
        if not split_reset_layout_main:
            return []
        return _normalize_updates(
            payload,
            len(reset_layout_main_tail_outputs),
            "nav.reset_layout_main_tail",
        )

    def _reset_scene_frontend_ui_safe(sp):
        expected = len(reset_layout_scene_outputs)
        if expected <= 0:
            return []
        fn = getattr(topbar_module, "reset_scene_frontend_ui", None)
        if not callable(fn):
            return [skip_update() for _ in range(expected)]
        return _normalize_updates(fn(sp), expected, "nav.reset_scene_frontend_ui")

    def _nav_reset_values_batch(
        sp,
        is_generating,
        current_inpaint_mode,
        use_resolution_override,
        scene_batch_target,
        models_tab_active,
        current_model_params_state=None,
        *current_lora_values,
    ):
        start_perf = time.perf_counter()
        value_updates = _normalize_updates(
            reset_layout_values_fn(
                sp,
                is_generating,
                current_inpaint_mode,
                use_resolution_override,
                scene_batch_target,
                models_tab_active,
                current_model_params_state,
                *current_lora_values,
            ),
            reset_layout_values_output_count,
            "nav.reset_values.reset_values",
        )
        end_perf = time.perf_counter()
        try:
            _debug_nav_trace(
                "nav.reset_values.timing",
                sp.get("__preset", None),
                f"total={end_perf - start_perf:.3f}s",
            )
        except Exception:
            pass
        return value_updates

    def _nav_after_identity_batch(payload):
        if not split_after_identity:
            return []
        return _normalize_updates(
            payload,
            reset_layout_after_identity_output_count,
            "nav.after_identity",
        )

    def _nav_deferred_values_batch(payload):
        if not split_deferred_values:
            return []
        return _normalize_updates(
            payload,
            reset_layout_deferred_value_output_count,
            "nav.deferred_values",
        )

    def _split_nav_visibility_values_inputs(values):
        values = tuple(values)
        models_tab_active = False
        if has_models_tab_active_state:
            models_tab_active = bool(values[0]) if values else False
            values = values[1:]
        current_model_params_state = None
        if has_model_params_state:
            current_model_params_state = values[0] if values else None
            values = values[1:]
        ip_values = values[:len(ip_types)]
        current_lora_values = [] if has_model_params_state else values[len(ip_types):]
        return models_tab_active, current_model_params_state, ip_values, current_lora_values

    def _nav_visibility_batch(
        sp,
        advanced_checked,
        *ip_values,
    ):
        start_perf = time.perf_counter()

        if _is_scene_state(sp):
            ip_updates = [skip_update()] * len(ip_types)
        else:
            ip_updates = _normalize_updates(
                sanitize_ip_types(sp, *ip_values),
                len(ip_types),
                "nav.fast_batch.ip_types",
            )

        is_scene = _is_scene_state(sp)
        # scene_panel is a mounted-hidden control in Gradio 6. Keep it mounted
        # and let the frontend visibility registry own scene/non-scene display.
        scene_panel_update = gr_update()
        if is_scene and scene_control_visibility_fn and scene_visibility_output_count:
            current_scene_theme = _resolve_scene_theme_from_state(sp)
            _debug_nav_trace(
                "nav.fast_batch.scene_controls",
                sp.get("__preset", None),
                current_scene_theme,
                scene_visibility_output_count,
            )
            scene_updates = _normalize_updates(
                scene_control_visibility_fn(current_scene_theme, sp),
                scene_visibility_output_count,
                "nav.fast_batch.scene_controls",
            )
        else:
            scene_updates = [skip_update()] * scene_visibility_output_count

        style_update = reset_preset_styles_fn(sp)
        end_perf = time.perf_counter()
        try:
            _debug_nav_trace(
                "nav.visibility.timing",
                sp.get("__preset", None),
                f"total={end_perf - start_perf:.3f}s",
            )
        except Exception:
            pass

        return (
            ip_updates
            + [gr_update(), scene_panel_update]
            + scene_updates
            + [style_update]
        )

    def _nav_visibility_and_values_batch(
        sp,
        advanced_checked,
        is_generating,
        current_inpaint_mode,
        use_resolution_override,
        scene_batch_target,
        *values,
    ):
        models_tab_active, current_model_params_state, ip_values, current_lora_values = (
            _split_nav_visibility_values_inputs(values)
        )
        return _nav_visibility_batch(
            sp,
            advanced_checked,
            *ip_values,
        ) + _nav_reset_values_batch(
            sp,
            is_generating,
            current_inpaint_mode,
            use_resolution_override,
            scene_batch_target,
            models_tab_active,
            current_model_params_state,
            *current_lora_values,
        )

    def _post_nav_controls_batch(
        sp,
        current_engine_class_display,
        current_inpaint_mode,
        current_inpaint_engine_state,
        current_outpaint_selections,
        *values,
    ):
        enhance_values = values
        is_scene = _is_scene_state(sp)

        if is_scene:
            scene_model_updates = _normalize_updates(
                sync_scene_models_from_main(sp),
                scene_model_output_count,
                "nav.post_controls.scene_models",
            )
        else:
            scene_model_updates = [skip_update()] * scene_model_output_count
        describe_update = update_describe_output_tags(current_engine_class_display)

        if is_scene:
            inpaint_updates = [skip_update()] * inpaint_mode_output_count
            enhance_updates = [skip_update()] * enhance_inpaint_output_count
            output_format_update = skip_update()
        else:
            enhance_mode_values = list(enhance_values[:enhance_inpaint_output_count])
            inpaint_updates = _normalize_updates(
                inpaint_mode_change(
                    current_inpaint_mode,
                    current_inpaint_engine_state,
                    current_outpaint_selections,
                    sp,
                ),
                inpaint_mode_output_count,
                "nav.post_controls.inpaint_mode",
            )
            enhance_updates = _normalize_updates(
                inpaint_engine_state_change(current_inpaint_engine_state, sp, *enhance_mode_values),
                enhance_inpaint_output_count,
                "nav.post_controls.inpaint_engine",
            )
            output_format_update = apply_preferred_output_format(sp)

        return (
            scene_model_updates
            + [describe_update]
            + inpaint_updates
            + enhance_updates
            + [output_format_update]
        )

    def _post_nav_controls_and_params_batch(
        sp,
        current_engine_class_display,
        current_inpaint_mode,
        current_inpaint_engine_state,
        current_outpaint_selections,
        *values,
    ):
        comfyd_active_checked = values[-1] if values else False
        control_values = values[:-1] if values else []
        try:
            topbar_module.stop_comfyd_background(comfyd_active_checked)
        except Exception as e:
            _debug_nav_trace(
                "nav.stop_comfyd_background_failed",
                type(e).__name__,
                str(e),
            )
        if setting_core_tabs and callable(enforce_scene_setting_core_tabs_visibility):
            setting_core_tab_updates = _normalize_updates(
                enforce_scene_setting_core_tabs_visibility(sp),
                len(setting_core_tabs),
                "nav.setting_core_tabs",
            )
        else:
            setting_core_tab_updates = [skip_update()] * len(setting_core_tabs)

        return _post_nav_controls_batch(
            sp,
            current_engine_class_display,
            current_inpaint_mode,
            current_inpaint_engine_state,
            current_outpaint_selections,
            *control_values,
        ) + [_update_topbar_js_params_safe(sp)] + _reset_scene_frontend_ui_safe(sp) + setting_core_tab_updates

    def _nav_visibility_values_and_post_batch(
        sp,
        advanced_checked,
        is_generating,
        current_inpaint_mode,
        use_resolution_override,
        scene_batch_target,
        *values,
    ):
        start_perf = time.perf_counter()
        post_input_count = 4 + len(enhance_inpaint_mode_ctrls)
        nav_values = values[:-post_input_count]
        post_values = values[-post_input_count:]
        models_tab_active, current_model_params_state, ip_values, current_lora_values = (
            _split_nav_visibility_values_inputs(nav_values)
        )
        nav_updates = _nav_visibility_batch(
            sp,
            advanced_checked,
            *ip_values,
        ) + _nav_reset_values_batch(
            sp,
            is_generating,
            current_inpaint_mode,
            use_resolution_override,
            scene_batch_target,
            models_tab_active,
            current_model_params_state,
            *current_lora_values,
        )
        (
            current_engine_class_display,
            current_inpaint_engine_state,
            current_outpaint_selections,
            *post_control_values,
        ) = post_values
        post_inpaint_mode = _value_from_nav_update(nav_updates, inpaint_mode, current_inpaint_mode)
        post_inpaint_engine_state = _value_from_nav_update(
            nav_updates,
            inpaint_engine_state,
            current_inpaint_engine_state,
        )
        post_enhance_values = list(post_control_values[:-1])
        post_comfyd_active = post_control_values[-1] if post_control_values else False
        post_enhance_values = [
            _value_from_nav_update(nav_updates, control, value)
            for control, value in zip(enhance_inpaint_mode_ctrls, post_enhance_values)
        ]
        post_updates = _post_nav_controls_and_params_batch(
            sp,
            current_engine_class_display,
            post_inpaint_mode,
            post_inpaint_engine_state,
            current_outpaint_selections,
            *post_enhance_values,
            post_comfyd_active,
        )
        try:
            _debug_nav_trace(
                "nav.visibility_values_post.timing",
                sp.get("__preset", None),
                f"total={time.perf_counter() - start_perf:.3f}s",
            )
        except Exception:
            pass
        return nav_updates + post_updates

    nav_visibility_values_inputs = [
        state_topbar,
        advanced_checkbox,
        *reset_values_inputs[1:],
        *([models_tab_active_state] if has_models_tab_active_state else []),
        *([model_params_state] if has_model_params_state else []),
        *ip_types,
        *(nav_model_value_inputs if not has_model_params_state else []),
    ]
    nav_visibility_values_outputs = [
        *ip_types,
        advanced_column,
        scene_panel,
        *(scene_control_visibility_outputs or []),
        style_selections,
        *reset_layout_values_outputs,
    ]
    post_nav_inputs = [
        state_topbar,
        engine_class_display,
        inpaint_mode,
        inpaint_engine_state,
        outpaint_selections,
        *enhance_inpaint_mode_ctrls,
        comfyd_active_checkbox,
    ]
    post_nav_tail_inputs = [
        engine_class_display,
        inpaint_engine_state,
        outpaint_selections,
        *enhance_inpaint_mode_ctrls,
        comfyd_active_checkbox,
    ]
    post_nav_outputs = [
        *scene_generation_model_ctrls,
        describe_output_tags,
        inpaint_additional_prompt,
        outpaint_selections,
        example_inpaint_prompts,
        inpaint_disable_initial_latent,
        inpaint_engine,
        inpaint_strength,
        inpaint_respective_field,
        *enhance_inpaint_engine_ctrls,
        output_format,
        system_params,
        *reset_layout_scene_outputs,
        *setting_core_tabs,
    ]
    merge_post_nav_with_values = not split_deferred_values and not split_after_identity

    for button in bar_buttons:
        chain = button.click(
            _reset_layout_ui_nav,
            inputs=reset_preset_inputs + ([models_tab_active_state] if has_models_tab_active_state else []) + [button],
            outputs=reset_layout_main_head_outputs
            + ([reset_layout_deferred_ui_state] if split_reset_layout_main else [])
            + reset_layout_nav_tail_outputs,
            queue=False,
            show_progress=False,
        )
        if split_reset_layout_main:
            chain = chain.then(
                _reset_layout_main_tail_batch,
                inputs=reset_layout_deferred_ui_state,
                outputs=reset_layout_main_tail_outputs,
                queue=False,
                show_progress=False,
            )
        if merge_post_nav_with_values:
            chain = chain.then(
                _nav_visibility_values_and_post_batch,
                inputs=[*nav_visibility_values_inputs, *post_nav_tail_inputs],
                outputs=[*nav_visibility_values_outputs, *post_nav_outputs],
                queue=False,
                show_progress=False,
            )
        else:
            chain = chain.then(
                _nav_visibility_and_values_batch,
                inputs=nav_visibility_values_inputs,
                outputs=nav_visibility_values_outputs,
                queue=False,
                show_progress=False,
            )
            if split_deferred_values:
                chain = chain.then(
                    _nav_deferred_values_batch,
                    inputs=reset_layout_deferred_value_state,
                    outputs=reset_layout_deferred_value_outputs,
                    queue=False,
                    show_progress=False,
                )
            if split_after_identity:
                chain = chain.then(
                    _nav_after_identity_batch,
                    inputs=reset_layout_after_identity_state,
                    outputs=reset_layout_after_identity_outputs,
                    queue=False,
                    show_progress=False,
                )
            chain = chain.then(
                _post_nav_controls_and_params_batch,
                inputs=post_nav_inputs,
                outputs=post_nav_outputs,
                queue=False,
                show_progress=False,
            )
        chain = chain.then(
            fn=None,
            inputs=system_params,
            js="(x)=>new Promise((resolve)=>{try{syncImageAndTtsPanelsFromCheckboxes('preset_nav_fast'); setTimeout(()=>syncImageAndTtsPanelsFromCheckboxes('preset_nav_fast+80ms'),80); setTimeout(()=>syncImageAndTtsPanelsFromCheckboxes('preset_nav_fast+260ms'),260);}catch(e){console.warn('[UI-TRACE] preset_nav_fast_panel_sync_failed', e);} try{if (typeof notify_style_state_changed === 'function') { notify_style_state_changed('preset_styles_fast'); } else { refresh_style_localization(); refresh_style_layout(); setTimeout(refresh_style_layout,120); setTimeout(refresh_style_layout,500); }}catch(e){console.warn('[UI-TRACE] style_preset_fast_refresh_failed', e);} try{refresh_topbar_status_js_for_preset_nav(x);}catch(e){console.warn('[UI-TRACE] topbar_status_refresh_failed', e);} try{if (typeof window.simpleaiRehydrateModelsTabAfterPresetNav === 'function') window.simpleaiRehydrateModelsTabAfterPresetNav(x);}catch(e){console.warn('[UI-TRACE] models_tab_rehydrate_failed', e);} setTimeout(()=>resolve(x), 120);})",
            queue=False,
            show_progress=False,
        )
        if reset_layout_scene_outputs:
            chain = chain.then(
                _reset_scene_frontend_ui_safe,
                inputs=state_topbar,
                outputs=reset_layout_scene_outputs,
                queue=False,
                show_progress=False,
            )
            chain = chain.then(
                fn=None,
                inputs=system_params,
                js="(x)=>{try{if(typeof scheduleScenePanelVisibilityRepair==='function') scheduleScenePanelVisibilityRepair(x,'preset_nav_after_mount_scene_refresh'); if(window.syncGradio6MountedDynamicVisibility) window.syncGradio6MountedDynamicVisibility('preset_nav_after_mount_scene_refresh'); if(typeof refresh_scene_localization==='function') refresh_scene_localization(); setTimeout(()=>{try{if(window.syncGradio6MountedDynamicVisibility) window.syncGradio6MountedDynamicVisibility('preset_nav_after_mount_scene_refresh+120ms');}catch(e){}},120);}catch(e){console.warn('[UI-TRACE] preset_nav_after_mount_scene_refresh_failed', e);}}",
                queue=False,
                show_progress=False,
            )
        if welcome_media_load_fn is not None and welcome_media_outputs:
            chain = chain.then(
                welcome_media_load_fn,
                inputs=welcome_media_inputs,
                outputs=welcome_media_outputs,
                queue=False,
                show_progress=False,
            )
            chain = chain.then(
                fn=lambda: None,
                js="()=>{try{window.SimpAIWelcomeMedia?.sync();}catch(e){}}",
                queue=False,
                show_progress=False,
            )
        chain.then(
            fn=lambda x: None,
            inputs=system_params,
            js="(x)=>{const p=x&&typeof x==='object'?x:{}; const preset=String(p.__preset||p.preset||'').trim(); const seq=(Number(window.__simpleai_preset_nav_completion_seq)||0)+1; const detail={preset:preset,seq:seq,completed_at:Date.now()}; window.__simpleai_preset_nav_completion_seq=seq; window.__simpleai_preset_nav_completed=detail; try{window.dispatchEvent(new CustomEvent('simpai:preset-nav-completed',{detail:detail}));}catch(e){} try{window.SimpAIStudioPerformance?.mark?.('preset.navigation_finished',{preset:preset,completion_seq:seq});}catch(e){}}",
            queue=False,
            show_progress=False,
        )


def bind_topbar_load_chain(
    *,
    root_blocks,
    topbar_module,
    system_params,
    state_topbar,
    admin_ctrls,
    progress_window,
    language_ui,
    background_theme,
    preset_instruction,
    user_app_ctrls,
    qwen_refresh_style_preset_dropdowns,
    qwen_design_style_preset_choices,
    qwen_custom_style_preset_choices,
    reset_preset_inputs,
    reset_layout_ui_outputs,
    comparison_state,
    comparison_box,
    progress_gallery,
    compare_btn,
    toggle_image_input_panel,
    input_image_checkbox,
    qwen_tts_checkbox,
    image_input_panel,
    engine_class_display,
    layout_image_tab,
    tts_panel,
    ui_ready_state,
    apply_preferred_output_format,
    output_format,
    refresh_files_clicked,
    model_filter_state,
    refresh_files_output,
    lora_ctrls,
    preset_store_list,
    reset_values_inputs,
    reset_layout_values_outputs,
    reset_layout_values_fn,
    reset_preset_styles_fn,
    style_selections,
    sanitize_ip_types,
    ip_types,
    sync_scene_models_from_main,
    base_model,
    refiner_model,
    scene_generation_model_ctrls,
    scene_theme,
    enforce_scene_panel_visibility,
    scene_panel,
    enforce_scene_setting_core_tabs_visibility,
    setting_core_tabs,
    advanced_checkbox,
    advanced_column,
    inpaint_mode_change,
    inpaint_mode,
    inpaint_engine_state,
    outpaint_selections,
    inpaint_additional_prompt,
    example_inpaint_prompts,
    inpaint_disable_initial_latent,
    inpaint_engine,
    inpaint_strength,
    inpaint_respective_field,
    aspect_ratios_selections,
    aspect_ratios_selection,
    main_vlm_load_fn,
    main_vlm_load_inputs,
    main_vlm_load_outputs,
    scene_control_visibility_fn=None,
    scene_control_visibility_outputs=None,
    reset_layout_ui_fn=None,
    admin_access_refresh_fn=None,
    admin_access_user_select=None,
    admin_access_outputs=None,
    welcome_media_load_fn=None,
    welcome_media_load_inputs=None,
    welcome_media_load_outputs=None,
) -> None:
    def _debug_load_trace(event_name, *values):
        if not _simpai_ui_trace_enabled():
            return
        try:
            import time as _t
            ts = _t.strftime('%H:%M:%S')
            ms = int((_t.time() % 1) * 1000)
            value_text = ", ".join([repr(v) for v in values])
            print(f"[UI-TRACE {ts}.{ms:03d}] {event_name} | {value_text}")
        except Exception as _e:
            print(f"[UI-TRACE] load_log_failed: {_e}")

    def _update_topbar_js_params_safe(sp):
        try:
            _debug_load_trace(
                "load.before_update_topbar_js_params",
                sp.get("__preset", None) if isinstance(sp, dict) else None,
                sorted(list(sp.keys()))[:20] if isinstance(sp, dict) else None,
            )
            # The initial page already has the navigation names and can load
            # the model catalog on demand. Avoid sending the large model and
            # preset catalogs again while the rest of the controls mount.
            result = topbar_module.update_topbar_js_params(sp, include_canvas_catalogs=False)[0]
            try:
                _debug_load_trace(
                    "load.after_update_topbar_js_params",
                    result.get("__preset", None) if isinstance(result, dict) else None,
                    result.get("preset_store", None) if isinstance(result, dict) else None,
                    result.get("__finished_nums_pages", None) if isinstance(result, dict) else None,
                )
            except Exception:
                pass
            return result
        except Exception as e:
            _debug_load_trace(
                "load.update_topbar_js_params_failed",
                type(e).__name__,
                str(e),
            )
            raise

    def _is_scene_state(sp):
        return isinstance(sp, dict) and ("scene_frontend" in sp)

    def _normalize_updates(result, expected, trace_name):
        if result is None:
            result = []
        if not isinstance(result, (list, tuple)):
            result = [result]
        result = list(result)
        actual = len(result)
        if actual != expected:
            try:
                _debug_load_trace(f"{trace_name}.len_adjust", expected, actual)
            except Exception:
                pass
        if actual > expected:
            return result[:expected]
        if actual < expected:
            return result + [skip_update() for _ in range(expected - actual)]
        return result

    refresh_files_output_count = len(refresh_files_output) + len(lora_ctrls)
    scene_model_output_count = len(scene_generation_model_ctrls)
    refresh_scene_output_start = max(0, len(refresh_files_output) - scene_model_output_count)
    refresh_scene_output_end = len(refresh_files_output)
    aspect_ratio_sync_source = aspect_ratios_selections[0] if aspect_ratios_selections else aspect_ratios_selection

    def _drop_hidden_scene_refresh_updates(updates):
        updates = list(updates or [])
        if not updates:
            return updates
        end = min(refresh_scene_output_end, len(updates))
        start = min(refresh_scene_output_start, end)
        for i in range(start, end):
            updates[i] = skip_update()
        return updates

    def _shared_lora_dropdown_choice_updates(updates):
        updates = list(updates or [])
        preserved = [skip_update()] * refresh_files_output_count
        for output_index in range(min(len(refresh_files_output), len(updates), len(preserved))):
            preserved[output_index] = updates[output_index]
        lora_start = len(refresh_files_output)
        for lora_index in range(1, len(lora_ctrls), 3):
            output_index = lora_start + lora_index
            if output_index < len(updates) and output_index < len(preserved):
                preserved[output_index] = updates[output_index]
        return preserved

    def _load_refresh_files(sp, use_model_filter):
        start_perf = time.perf_counter()
        is_scene = _is_scene_state(sp)
        updates = _normalize_updates(
            refresh_files_clicked(sp, use_model_filter, False),
            refresh_files_output_count,
            "load.refresh_files",
        )
        if is_scene:
            updates = _shared_lora_dropdown_choice_updates(updates)
        else:
            updates = _drop_hidden_scene_refresh_updates(updates)
        try:
            _debug_load_trace(
                "load.refresh_files.timing",
                sp.get("__preset", None) if isinstance(sp, dict) else None,
                f"is_scene={is_scene}",
                f"total={time.perf_counter() - start_perf:.3f}s",
            )
        except Exception:
            pass
        return updates

    scene_visibility_output_count = len(scene_control_visibility_outputs or [])
    admin_access_refresh_outputs = list(admin_access_outputs or [])
    main_vlm_inputs = list(main_vlm_load_inputs or [state_topbar])
    main_vlm_outputs = list(main_vlm_load_outputs or [])
    welcome_media_inputs = list(welcome_media_load_inputs or [state_topbar])
    welcome_media_outputs = list(welcome_media_load_outputs or [])

    def _load_scene_control_visibility(sp):
        if not _is_scene_state(sp) or not scene_control_visibility_fn or not scene_visibility_output_count:
            return [skip_update()] * scene_visibility_output_count
        resolved_scene_theme = _resolve_scene_theme_from_state(sp)
        _debug_load_trace(
            "load.scene_controls",
            sp.get("__preset", None),
            resolved_scene_theme,
            scene_visibility_output_count,
        )
        return _normalize_updates(
            scene_control_visibility_fn(resolved_scene_theme, sp),
            scene_visibility_output_count,
            "load.scene_controls",
        )

    load_reset_layout_ui_fn = reset_layout_ui_fn or topbar_module.reset_layout_ui

    load_chain = root_blocks.load(
        fn=lambda x: x,
        inputs=system_params,
        outputs=state_topbar,
        js=topbar_module.get_system_params_js,
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda x: _debug_load_trace(
            "load.system_params_to_state",
            x.get("preset_store", None) if isinstance(x, dict) else None,
            x.get("__preset", None) if isinstance(x, dict) else None,
        ),
        inputs=[state_topbar],
        outputs=None,
        queue=False,
        show_progress=False,
    ).then(
        topbar_module.init_nav_bars,
        inputs=[state_topbar] + admin_ctrls,
        outputs=[progress_window, language_ui, background_theme, preset_instruction] + user_app_ctrls + admin_ctrls,
        show_progress=False,
        queue=False,
    ).then(
        main_vlm_load_fn,
        inputs=main_vlm_inputs,
        outputs=main_vlm_outputs,
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda: None,
        js="()=>{try{if (typeof notify_style_state_changed === 'function') { notify_style_state_changed('load_rehydrate'); } else { refresh_style_localization(); refresh_style_layout(); setTimeout(refresh_style_layout,120); setTimeout(refresh_style_layout,500); setTimeout(refresh_style_layout,1000); }}catch(e){console.warn('[UI-TRACE] style_load_rehydrate_failed', e);}}",
        show_progress=False,
        queue=False,
    ).then(
        qwen_refresh_style_preset_dropdowns,
        inputs=[state_topbar],
        outputs=[qwen_design_style_preset_choices, qwen_custom_style_preset_choices],
        queue=False,
        show_progress=False,
    ).then(
        load_reset_layout_ui_fn,
        inputs=reset_preset_inputs,
        outputs=reset_layout_ui_outputs + [state_topbar, comparison_state, comparison_box, progress_gallery, compare_btn, progress_window],
        show_progress=False,
        queue=False,
    ).then(
        fn=lambda x: _debug_load_trace(
            "load.after_reset_layout_ui.state_topbar",
            x.get("preset_store", None) if isinstance(x, dict) else None,
            x.get("identity_dialog", None) if isinstance(x, dict) else None,
            x.get("__preset", None) if isinstance(x, dict) else None,
        ),
        inputs=[state_topbar],
        outputs=None,
        queue=False,
        show_progress=False,
    ).then(
        fn=_update_topbar_js_params_safe,
        inputs=state_topbar,
        outputs=system_params,
        queue=False,
        show_progress=False,
    ).then(
        fn=_load_scene_control_visibility,
        inputs=[state_topbar],
        outputs=scene_control_visibility_outputs or [],
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda x: None,
        inputs=system_params,
        js="(x)=>{refresh_topbar_status_js(x);}",
        queue=False,
        show_progress=False,
    ).then(
        reset_preset_styles_fn,
        inputs=[state_topbar],
        outputs=[style_selections],
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda st: _debug_load_trace(
            "load.after_reset_preset_styles_fast",
            st.get("__preset", None) if isinstance(st, dict) else None,
        ),
        inputs=[state_topbar],
        outputs=None,
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda: None,
        js="()=>{try{if (typeof notify_style_state_changed === 'function') { notify_style_state_changed('load_preset_styles_fast'); } else { refresh_style_localization(); refresh_style_layout(); setTimeout(refresh_style_layout,120); setTimeout(refresh_style_layout,500); }}catch(e){console.warn('[UI-TRACE] style_load_fast_refresh_failed', e);}}",
        queue=False,
        show_progress=False,
    ).then(
        toggle_image_input_panel,
        inputs=[input_image_checkbox, qwen_tts_checkbox],
        outputs=[image_input_panel, engine_class_display] + layout_image_tab + [tts_panel, qwen_tts_checkbox],
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda i, t: _debug_load_trace("load.after_toggle_image_input_panel", i, t),
        inputs=[input_image_checkbox, qwen_tts_checkbox],
        outputs=None,
        queue=False,
        show_progress=False,
    ).then(
        sanitize_ip_types,
        inputs=[state_topbar] + ip_types,
        outputs=ip_types,
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda st, *vals: _debug_load_trace(
            "load.after_sanitize_ip_types_fast",
            st.get("__preset", None) if isinstance(st, dict) else None,
            list(vals),
        ),
        inputs=[state_topbar] + ip_types,
        outputs=None,
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda checked, st: gr_update(),
        inputs=[advanced_checkbox, state_topbar],
        outputs=[advanced_column],
        queue=False,
        show_progress=False,
    ).then(
        enforce_scene_setting_core_tabs_visibility,
        inputs=[state_topbar],
        outputs=setting_core_tabs,
        queue=False,
        show_progress=False,
    ).then(
        apply_preferred_output_format,
        inputs=[state_topbar],
        outputs=[output_format],
        queue=False,
        show_progress=False,
    ).then(
        reset_layout_values_fn,
        inputs=reset_values_inputs,
        outputs=reset_layout_values_outputs,
        show_progress=False,
        queue=False,
    ).then(
        fn=_update_topbar_js_params_safe,
        inputs=state_topbar,
        outputs=system_params,
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda x: _debug_load_trace(
            "load.after_reset_layout_values",
            x.get("__finished_nums_pages", None) if isinstance(x, dict) else None,
            x.get("__gallery_engine_type", None) if isinstance(x, dict) else None,
        ),
        inputs=system_params,
        outputs=None,
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda x: None,
        inputs=system_params,
        js="(x)=>{try{refresh_topbar_status_js(x);}catch(e){console.warn('[UI-TRACE] load_after_reset_values_topbar_sync_failed', e);}}",
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda: None,
        js="()=>{try{if (typeof notify_style_state_changed === 'function') { notify_style_state_changed('after_reset_values'); } else { refresh_style_localization(); refresh_style_layout(); setTimeout(refresh_style_layout,120); setTimeout(refresh_style_layout,500); }}catch(e){console.warn('[UI-TRACE] style_after_values_refresh_failed', e);}}",
        queue=False,
        show_progress=False,
    ).then(
        _load_refresh_files,
        inputs=[state_topbar, model_filter_state],
        outputs=refresh_files_output + lora_ctrls,
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda st: _debug_load_trace(
            "load.after_refresh_files",
            st.get("__preset", None) if isinstance(st, dict) else None,
        ),
        inputs=[state_topbar],
        outputs=None,
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda: None,
        js="()=>{try{syncImageAndTtsPanelsFromCheckboxes('load_after_refresh_files'); setTimeout(()=>syncImageAndTtsPanelsFromCheckboxes('load_after_refresh_files+120ms'),120); setTimeout(()=>syncImageAndTtsPanelsFromCheckboxes('load_after_refresh_files+500ms'),500);}catch(e){console.warn('[UI-TRACE] load_panel_sync_failed', e);}}",
        queue=False,
        show_progress=False,
    ).then(
            sync_scene_models_from_main,
            inputs=[state_topbar],
            outputs=scene_generation_model_ctrls,
            queue=False,
            show_progress=False,
        ).then(
            enforce_scene_panel_visibility,
            inputs=[state_topbar],
            outputs=[scene_panel],
            queue=False,
            show_progress=False,
        ).then(
            enforce_scene_setting_core_tabs_visibility,
            inputs=[state_topbar],
            outputs=setting_core_tabs,
            queue=False,
            show_progress=False,
        ).then(
            topbar_module.sync_message,
            inputs=state_topbar,
            queue=False,
            show_progress=False,
    ).then(
        inpaint_mode_change,
        inputs=[inpaint_mode, inpaint_engine_state, outpaint_selections, state_topbar],
        outputs=[
            inpaint_additional_prompt,
            outpaint_selections,
            example_inpaint_prompts,
            inpaint_disable_initial_latent,
            inpaint_engine,
            inpaint_strength,
            inpaint_respective_field,
        ],
        show_progress=False,
        queue=False,
    ).then(
        lambda x: x,
        inputs=aspect_ratio_sync_source,
        outputs=aspect_ratios_selection,
        queue=False,
        show_progress=False,
    ).then(
        lambda x: None,
        inputs=aspect_ratio_sync_source,
        queue=False,
        show_progress=False,
        js="(x)=>{refresh_aspect_ratios_label(x); if (typeof syncResolutionControlWidgets === 'function') syncResolutionControlWidgets();}",
    ).then(
        fn=lambda: None,
        js="refresh_grid_delayed",
    ).then(
        fn=lambda: None,
        js="bindPluginBtn",
    ).then(
        fn=lambda: time.time_ns(),
        outputs=[ui_ready_state],
        queue=False,
        show_progress=False,
    ).then(
        fn=lambda x: None,
        inputs=system_params,
        js="(x)=>{window.__simpleai_ui_ready=true; try{refresh_topbar_status_js(x); setTimeout(()=>refresh_topbar_status_js(x),250); setTimeout(()=>refresh_topbar_status_js(x),900);}catch(e){console.warn('[UI-TRACE] load_ready_topbar_sync_failed', e);} try{syncImageAndTtsPanelsFromCheckboxes('load_ready'); setTimeout(()=>syncImageAndTtsPanelsFromCheckboxes('load_ready+120ms'),120); setTimeout(()=>syncImageAndTtsPanelsFromCheckboxes('load_ready+500ms'),500);}catch(e){console.warn('[UI-TRACE] load_ready_panel_sync_failed', e);}}",
        queue=False,
        show_progress=False,
    )

    if welcome_media_load_fn is not None and welcome_media_outputs:
        load_chain = load_chain.then(
            welcome_media_load_fn,
            inputs=welcome_media_inputs,
            outputs=welcome_media_outputs,
            queue=False,
            show_progress=False,
        ).then(
            fn=lambda: None,
            js="()=>{try{window.SimpAIWelcomeMedia?.sync();}catch(e){}}",
            queue=False,
            show_progress=False,
        )

    if admin_access_refresh_fn is not None and admin_access_user_select is not None and admin_access_refresh_outputs:
        load_chain.then(
            admin_access_refresh_fn,
            inputs=[admin_access_user_select, state_topbar],
            outputs=admin_access_refresh_outputs,
            queue=False,
            show_progress=False,
        )

    return load_chain


def bind_topbar_identity_events(
    *,
    topbar_module,
    simpleai_module,
    state_topbar,
    system_params,
    identity_export_btn,
    identity_close_button,
    identity_input_info,
    identity_phrase_input,
    identity_phrases_confirm_button,
    identity_confirm_button,
    identity_unbind_button,
    identity_ctrls,
    identity_flow_rows,
    identity_stage_state,
    identity_input,
    current_id_info,
    current_upstream_status,
    nav_bars,
    after_identity,
    user_app_ctrls,
    sanitize_ip_types,
    ip_types,
    refresh_wildcards_components,
    wildcards_outputs,
    qwen_refresh_style_preset_dropdowns,
    qwen_design_style_preset_choices,
    qwen_custom_style_preset_choices,
    binding_id_button,
    identity_dialog,
    identity_activation=None,
    admin_access_refresh_fn=None,
    admin_access_user_select=None,
    admin_access_outputs=None,
    identity_admin_surface_refresh_fn=None,
    identity_admin_surface_outputs=None,
    welcome_media_load_fn=None,
    welcome_media_load_inputs=None,
    welcome_media_load_outputs=None,
) -> None:
    admin_access_refresh_outputs = list(admin_access_outputs or [])
    identity_admin_surface_outputs = list(identity_admin_surface_outputs or [])
    welcome_media_inputs = list(welcome_media_load_inputs or [state_topbar])
    welcome_media_outputs = list(welcome_media_load_outputs or [])
    activation = dict(identity_activation or {})
    activation_state = activation.get("state")
    activation_toggle_outputs = [
        activation.get("guard"),
        activation.get("note"),
        activation.get("mode"),
        activation.get("scope_confirm"),
        activation.get("permission_confirm"),
        activation.get("phrase_confirm"),
        activation.get("apply_button"),
        activation_state,
    ]
    activation_toggle_outputs = [item for item in activation_toggle_outputs if item is not None]

    def _activation_is_required(activation_confirmed=False):
        required_fn = getattr(simpleai_module, "requires_multi_user_activation", None)
        if not activation_toggle_outputs or not callable(required_fn):
            return False
        return bool(required_fn(activation_confirmed))

    def _activation_refresh_updates(state, opened, activation_confirmed=False):
        refresh_fn = activation.get("refresh_fn")
        if not activation_toggle_outputs or not callable(refresh_fn):
            return []
        return list(refresh_fn(state, opened, activation_confirmed))

    def _identity_stage_from_base(base):
        def is_visible(index):
            return len(base) > index and isinstance(base[index], dict) and base[index].get("visible") is True
        if is_visible(3) or is_visible(4):
            return "vcode"
        if is_visible(5):
            if is_visible(8):
                return "confirm"
            if is_visible(9):
                return "unbind"
            if is_visible(7):
                return "phrase_confirm"
            if is_visible(6):
                return "phrase_set"
            return "phrase"
        return "input" if is_visible(1) else "summary"

    def _identity_flow_row_updates(result):
        base = list(result)
        stage = _identity_stage_from_base(base)
        vcode_visible = any(isinstance(item, dict) and item.get("visible") is True for item in base[3:5])
        phrase_visible = any(isinstance(item, dict) and item.get("visible") is True for item in base[5:10])
        _log_ui_trace(
            logger,
            "[UI-TRACE] identity.flow_rows | stage=%s, vcode_visible=%s, phrase_visible=%s, base_len=%s",
            stage,
            vcode_visible,
            phrase_visible,
            len(base),
        )
        return [stage, gr_update(visible=vcode_visible), gr_update(visible=phrase_visible)] + base[:10] + base[10:]

    def _identity_state_update(state):
        if isinstance(state, dict):
            return dict(state)
        return state

    def _identity_flow_row_updates_with_state(result, state):
        return _identity_flow_row_updates(result) + [_identity_state_update(state)]

    def _after_identity_event_chain(chain):
        chain = chain.then(
            topbar_module.update_after_identity_all,
            inputs=state_topbar,
            outputs=nav_bars + after_identity + user_app_ctrls,
            show_progress=False,
            queue=False,
        ).then(
            fn=None,
            inputs=system_params,
            js="(x)=>{refresh_topbar_status_js(x);}",
            queue=False,
            show_progress=False,
        )
        if admin_access_refresh_fn is not None and admin_access_user_select is not None and admin_access_refresh_outputs:
            chain = chain.then(
                admin_access_refresh_fn,
                inputs=[admin_access_user_select, state_topbar],
                outputs=admin_access_refresh_outputs,
                queue=False,
                show_progress=False,
            )
        if identity_admin_surface_refresh_fn is not None and identity_admin_surface_outputs:
            chain = chain.then(
                identity_admin_surface_refresh_fn,
                inputs=state_topbar,
                outputs=identity_admin_surface_outputs,
                queue=False,
                show_progress=False,
            )
        chain = chain.then(
            sanitize_ip_types,
            inputs=[state_topbar] + ip_types,
            outputs=ip_types,
            queue=False,
            show_progress=False,
        ).then(
            refresh_wildcards_components,
            inputs=state_topbar,
            outputs=wildcards_outputs,
            show_progress=False,
            queue=False,
        ).then(
            qwen_refresh_style_preset_dropdowns,
            inputs=[state_topbar],
            outputs=[qwen_design_style_preset_choices, qwen_custom_style_preset_choices],
            queue=False,
            show_progress=False,
        )
        if welcome_media_load_fn is not None and welcome_media_outputs:
            chain = chain.then(
                welcome_media_load_fn,
                inputs=welcome_media_inputs,
                outputs=welcome_media_outputs,
                queue=False,
                show_progress=False,
            ).then(
                fn=None,
                js="()=>{try{window.SimpAIWelcomeMedia?.sync();}catch(e){}}",
                queue=False,
                show_progress=False,
            )
        return chain

    def _toggle_identity_dialog_reset(state, activation_confirmed=False):
        old_flag = bool(state.get("identity_dialog", False)) if isinstance(state, dict) else False
        base = list(simpleai_module.toggle_identity_dialog(state))
        if isinstance(state, dict):
            state["user_phrase"] = ""
        head = base[:4]
        ctrls = base[4:14]
        identity_inputs = base[14:]
        vcode_visible = any(isinstance(item, dict) and item.get("visible") is True for item in ctrls[3:5])
        phrase_visible = any(isinstance(item, dict) and item.get("visible") is True for item in ctrls[5:10])
        new_flag = bool(state.get("identity_dialog", False)) if isinstance(state, dict) else not old_flag
        activation_required = bool(new_flag and _activation_is_required(activation_confirmed))
        if activation_required and len(ctrls) > 1:
            ctrls[1] = gr_update(visible=False)
        _log_ui_trace(
            logger,
            "[UI-TRACE] identity.toggle_reset | old_flag=%s, new_flag=%s, clear_input_id_info=True, "
            "vcode_visible=%s, phrase_visible=%s, activation_required=%s",
            old_flag,
            new_flag,
            vcode_visible,
            phrase_visible,
            activation_required,
        )
        stage = "activation" if activation_required else (_identity_stage_from_base(ctrls) if new_flag else "closed")
        result = head + [stage, gr_update(visible=vcode_visible), gr_update(visible=phrase_visible)] + ctrls[:10] + identity_inputs + [""]
        return result + _activation_refresh_updates(state, new_flag, activation_confirmed) + [_identity_state_update(state)]

    def _close_identity_dialog_reset(state, activation_confirmed=False):
        if isinstance(state, dict):
            state["identity_dialog"] = True
        return _toggle_identity_dialog_reset(state, activation_confirmed)

    identity_export_btn.click(
        topbar_module.export_identity,
        inputs=state_topbar,
        outputs=system_params,
        show_progress=False,
    ).then(
        fn=lambda x: None,
        inputs=system_params,
        js="(x)=>{refresh_topbar_status_js(x);}",
    )

    if activation_state is not None:
        phrases_fn = lambda a, b, c, confirmed: _identity_flow_row_updates_with_state(
            simpleai_module.set_phrases(a, b, c, "confirm", confirmed),
            b,
        )
        phrases_inputs = identity_input_info + [identity_phrase_input, activation_state]
    else:
        phrases_fn = lambda a, b, c: _identity_flow_row_updates_with_state(simpleai_module.set_phrases(a, b, c, "confirm"), b)
        phrases_inputs = identity_input_info + [identity_phrase_input]
    phrases_chain = identity_phrases_confirm_button.click(
        phrases_fn,
        inputs=phrases_inputs,
        outputs=[identity_stage_state] + identity_flow_rows + identity_ctrls + [current_id_info, current_upstream_status, identity_export_btn, state_topbar],
        show_progress=False,
        queue=False,
    )
    _after_identity_event_chain(phrases_chain)

    if activation_state is not None:
        confirm_fn = lambda a, b, c, confirmed: _identity_flow_row_updates_with_state(
            simpleai_module.confirm_identity(a, b, c, confirmed),
            b,
        )
        confirm_inputs = identity_input_info + [identity_phrase_input, activation_state]
    else:
        confirm_fn = lambda a, b, c: _identity_flow_row_updates_with_state(simpleai_module.confirm_identity(a, b, c), b)
        confirm_inputs = identity_input_info + [identity_phrase_input]
    confirm_chain = identity_confirm_button.click(
        confirm_fn,
        inputs=confirm_inputs,
        outputs=[identity_stage_state] + identity_flow_rows + identity_ctrls + [current_id_info, current_upstream_status, identity_export_btn, state_topbar],
        show_progress=False,
        queue=False,
    )
    _after_identity_event_chain(confirm_chain)

    unbind_chain = identity_unbind_button.click(
        lambda a, b, c: _identity_flow_row_updates_with_state(simpleai_module.unbind_identity(a, b, c), b),
        inputs=identity_input_info + [identity_phrase_input],
        outputs=[identity_stage_state] + identity_flow_rows + identity_ctrls + identity_input + [current_id_info, current_upstream_status, identity_export_btn, state_topbar],
        show_progress=False,
        queue=False,
    )
    _after_identity_event_chain(unbind_chain)

    identity_toggle_outputs = [
        identity_dialog,
        current_id_info,
        current_upstream_status,
        identity_export_btn,
        identity_stage_state,
    ] + identity_flow_rows + identity_ctrls + identity_input + [identity_input_info[0]] + activation_toggle_outputs + [state_topbar]
    identity_toggle_inputs = [state_topbar]
    if activation_state is not None:
        identity_toggle_inputs.append(activation_state)

    activation_continue_fn = activation.get("continue_fn")
    activation_apply_button = activation.get("apply_button")
    if callable(activation_continue_fn) and activation_apply_button is not None and activation_state is not None:
        activation_apply_button.click(
            activation_continue_fn,
            inputs=[
                activation.get("mode"),
                activation.get("scope_confirm"),
                activation.get("permission_confirm"),
                activation.get("phrase_confirm"),
                state_topbar,
            ],
            outputs=[
                identity_dialog,
                activation.get("guard"),
                activation.get("note"),
                identity_ctrls[1],
                identity_ctrls[0],
                identity_stage_state,
                activation_state,
                state_topbar,
            ],
            show_progress=False,
            queue=False,
        )

    binding_id_button.click(
        _toggle_identity_dialog_reset,
        inputs=identity_toggle_inputs,
        outputs=identity_toggle_outputs,
        show_progress=False,
        queue=False,
    )

    identity_close_button.click(
        _close_identity_dialog_reset,
        inputs=identity_toggle_inputs,
        outputs=identity_toggle_outputs,
        show_progress=False,
        queue=False,
    )

