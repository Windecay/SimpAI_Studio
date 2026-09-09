# based on https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/v1.6.0/modules/ui_gradio_extensions.py

import json
import os
import gradio as gr
import args_manager
import modules.config
import modules.prompt_actions
import modules.sdxl_styles

from modules.localization import localization_js
from ui.assets import reload_template_assets
from gradio.route_utils import API_PREFIX


modules_path = os.path.dirname(os.path.realpath(__file__))
script_path = os.path.dirname(modules_path)


def _resolve_webpath_path(fn):
    resolved_path = fn
    if not os.path.isabs(resolved_path):
        resolved_path = os.path.join(script_path, fn)
    return os.path.abspath(resolved_path)


def _path_exists_for_webpath(fn):
    try:
        return os.path.exists(_resolve_webpath_path(fn))
    except OSError:
        return False


def webpath(fn):
    resolved_path = _resolve_webpath_path(fn)

    if resolved_path.startswith(script_path):
        web_path = os.path.relpath(resolved_path, script_path).replace('\\', '/')
    else:
        web_path = resolved_path.replace('\\', '/')

    try:
        mtime = os.path.getmtime(resolved_path)
    except OSError:
        mtime = 0

    return f'{API_PREFIX}/file={web_path}?{mtime}&v=layerforge_patch_63'


def ensure_tag_cart_custom_tags_path():
    user_tags_dir = os.path.join(modules.config.path_userhome, 'tags')
    user_custom_tags = os.path.join(user_tags_dir, 'custom_tags.csv')
    legacy_custom_tags = os.path.join(script_path, 'tags', 'custom_tags.csv')

    os.makedirs(user_tags_dir, exist_ok=True)

    if not os.path.exists(user_custom_tags):
        migrated = False
        try:
            if os.path.exists(legacy_custom_tags) and os.path.getsize(legacy_custom_tags) > 0:
                with open(legacy_custom_tags, 'rb') as src, open(user_custom_tags, 'wb') as dst:
                    dst.write(src.read())
                migrated = True
        except Exception:
            migrated = False

        if not migrated:
            with open(user_custom_tags, 'w', encoding='utf-8') as f:
                f.write('')

    return os.path.abspath(user_custom_tags)

def load_tips_text():
    # Temporarily disabled after the Gradio 6 refactor; keep the hook so it can be restored later.
    return ''

    tips_path = os.path.join(script_path, 'tips.txt')
    tips_text = ''
    if os.path.exists(tips_path):
        try:
            with open(tips_path, encoding='utf-8') as f:
                tips_text = f.readlines()
            tips_text = [line.strip() for line in tips_text if line.strip()]
            tips_text = ','.join([f'"{line}"' for line in tips_text])
        except Exception as e:
            logger.info(str(e))
            logger.info(f'Failed to load tips file {tips_path}')
    return f'let tips = [{tips_text}];'


def style_catalog_js():
    legal_names = list(modules.sdxl_styles.legal_style_names)
    default_names = list(getattr(modules.config, "default_styles", []) or [])
    sorted_names = []
    ordered_names = []

    try:
        sorted_styles_path = os.path.join(script_path, "sorted_styles.json")
        if os.path.exists(sorted_styles_path):
            with open(sorted_styles_path, "rt", encoding="utf-8") as fp:
                sorted_names = [name for name in json.load(fp) if name in legal_names]
    except Exception:
        sorted_names = []

    for name in default_names + sorted_names + legal_names:
        if name in legal_names and name not in ordered_names:
            ordered_names.append(name)

    entries = []
    for name in ordered_names:
        data = modules.sdxl_styles.get_style_config(name)
        entries.append({
            "name": data.get("name") or name,
            "prompt": data.get("prompt") or "",
            "negative_prompt": data.get("negative_prompt") or "",
        })

    payload = json.dumps({
        "names": ordered_names,
        "entries": entries,
    }, ensure_ascii=False).replace("</", "<\\/")
    return f"window.SimpAIStyleCatalog = {payload};"


def style_transfer_catalog_js():
    styles_dir = os.path.join(script_path, "enhanced", "style_transfer_assets")
    styles_json_path = os.path.join(styles_dir, "styles.json")
    images_dir = os.path.join(styles_dir, "images")
    entries = []

    try:
        with open(styles_json_path, "rt", encoding="utf-8") as fp:
            raw_items = json.load(fp)
    except Exception:
        raw_items = []

    if isinstance(raw_items, list):
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            preview = str(item.get("preview") or "").strip()
            if not name or not preview:
                continue
            preview_path = os.path.abspath(os.path.join(images_dir, preview))
            if not os.path.isfile(preview_path):
                continue
            entries.append({
                "name": name,
                "description": str(item.get("description") or ""),
                "prompt": str(item.get("prompt") or ""),
                "negative": str(item.get("negative") or ""),
                "preview": preview,
                "preview_url": webpath(preview_path),
            })

    payload = json.dumps({
        "items": entries,
    }, ensure_ascii=False).replace("</", "<\\/")
    return f"window.SimpAIStyleTransferCatalog = {payload};"


def prompt_action_catalog_js():
    payload = json.dumps(
        {"items": modules.prompt_actions.prompt_action_catalog()},
        ensure_ascii=False,
    ).replace("</", "<\\/")
    return f"window.SimpAIPromptActionCatalog = {payload};"

def javascript_html():
    simpleai_i18n_js_path = webpath('javascript/simpleai_i18n.js')
    studio_performance_js_path = webpath('javascript/studio_performance.js')
    script_js_path = webpath('javascript/script.js')
    model_browser_js_path = webpath('javascript/model_browser.js')
    context_menus_js_path = webpath('javascript/contextMenus.js')
    localization_js_path = webpath('javascript/localization.js')
    gradio_media_replacement_js_path = webpath('javascript/gradio_media_replacement.js')
    welcome_media_js_path = webpath('javascript/welcome_media.js')
    metadata_media_input_js_path = webpath('javascript/metadata_media_input.js')
    scene_director_js_path = webpath('javascript/scene_director.js')
    zoom_js_path = webpath('javascript/zoom.js')
    edit_attention_js_path = webpath('javascript/edit-attention.js')
    viewer_js_path = webpath('javascript/viewer.js')
    image_viewer_js_path = webpath('javascript/imageviewer.js')
    topbar_js_path = webpath('javascript/topbar.js')
    canvg_min_js_path = webpath('javascript/umd.min.js')
    workspace_recovery_path = webpath('javascript/workspace_recovery.js')
    status_monitor_path = webpath('javascript/status_monitor.js') 
    console_overlay_path = webpath('javascript/console_overlay.js')
    infinite_canvas_workbench_css_path = webpath('css/infinite_canvas_workbench.css')
    tag_cart_css_path = webpath('css/tag_cart.css')
    canvas_workbench_utils_path = webpath('javascript/canvas_workbench/utils.js')
    canvas_workbench_project_store_path = webpath('javascript/canvas_workbench/project_store.js')
    canvas_workbench_viewport_path = webpath('javascript/canvas_workbench/viewport.js')
    canvas_workbench_timeline_path = webpath('javascript/canvas_workbench/media_timeline.js')
    canvas_workbench_api_path = webpath('javascript/canvas_workbench/api.js')
    describe_vlm_chat_path = webpath('javascript/describe_vlm_chat.js')
    webui_danbooru_autocomplete_path = webpath('javascript/webui_danbooru_autocomplete.js')
    scene_prompt_recommendations_path = webpath('javascript/scene_prompt_recommendations.js')
    prompt_actions_path = webpath('javascript/prompt_actions.js')
    canvas_workbench_registry_path = webpath('javascript/canvas_workbench/registry.js')
    canvas_workbench_vlm_chat_path = webpath('javascript/canvas_workbench/vlm_chat.js')
    canvas_workbench_canvas_agent_path = webpath('javascript/canvas_workbench/canvas_agent.js')
    canvas_workbench_canvas_agent_settings_path = webpath('javascript/canvas_workbench/canvas_agent_settings.js')
    canvas_workbench_canvas_agent_input_path = webpath('javascript/canvas_workbench/canvas_agent_input_controller.js')
    canvas_workbench_canvas_scroll_path = webpath('javascript/canvas_workbench/canvas_scroll_controller.js')
    canvas_workbench_canvas_mode_path = webpath('javascript/canvas_workbench/canvas_mode_controller.js')
    canvas_workbench_canvas_status_path = webpath('javascript/canvas_workbench/canvas_status_controller.js')
    canvas_workbench_canvas_render_path = webpath('javascript/canvas_workbench/canvas_render_controller.js')
    canvas_workbench_canvas_preset_param_renderer_path = webpath('javascript/canvas_workbench/canvas_preset_param_renderer.js')
    canvas_workbench_canvas_node_render_path = webpath('javascript/canvas_workbench/canvas_node_render_controller.js')
    canvas_workbench_canvas_preset_node_renderer_path = webpath('javascript/canvas_workbench/canvas_preset_node_renderer.js')
    canvas_workbench_canvas_node_renderer_path = webpath('javascript/canvas_workbench/canvas_node_renderer.js')
    canvas_workbench_canvas_asset_node_renderer_path = webpath('javascript/canvas_workbench/canvas_asset_node_renderer.js')
    canvas_workbench_canvas_node_layout_path = webpath('javascript/canvas_workbench/canvas_node_layout.js')
    canvas_workbench_canvas_viewport_render_path = webpath('javascript/canvas_workbench/canvas_viewport_render_controller.js')
    canvas_workbench_canvas_node_spatial_index_path = webpath('javascript/canvas_workbench/canvas_node_spatial_index.js')
    canvas_workbench_canvas_node_factory_path = webpath('javascript/canvas_workbench/canvas_node_factory.js')
    canvas_workbench_canvas_result_preview_path = webpath('javascript/canvas_workbench/canvas_result_preview.js')
    canvas_workbench_canvas_lifecycle_path = webpath('javascript/canvas_workbench/canvas_lifecycle_controller.js')
    canvas_workbench_canvas_action_path = webpath('javascript/canvas_workbench/canvas_action_controller.js')
    canvas_workbench_canvas_click_path = webpath('javascript/canvas_workbench/canvas_click_controller.js')
    canvas_workbench_canvas_agent_references_path = webpath('javascript/canvas_workbench/canvas_agent_references.js')
    canvas_workbench_canvas_agent_decision_path = webpath('javascript/canvas_workbench/canvas_agent_decision.js')
    canvas_workbench_canvas_agent_prompt_rewrite_path = webpath('javascript/canvas_workbench/canvas_agent_prompt_rewrite.js')
    canvas_workbench_canvas_agent_text_workflows_path = webpath('javascript/canvas_workbench/canvas_agent_text_workflows.js')
    canvas_workbench_canvas_agent_text_nodes_path = webpath('javascript/canvas_workbench/canvas_agent_text_nodes.js')
    canvas_workbench_canvas_text_node_renderer_path = webpath('javascript/canvas_workbench/canvas_text_node_renderer.js')
    canvas_workbench_canvas_text_node_factory_path = webpath('javascript/canvas_workbench/canvas_text_node_factory.js')
    canvas_workbench_canvas_aux_node_factory_path = webpath('javascript/canvas_workbench/canvas_aux_node_factory.js')
    canvas_workbench_canvas_batch_any_node_factory_path = webpath('javascript/canvas_workbench/canvas_batch_any_node_factory.js')
    canvas_workbench_canvas_mask_node_factory_path = webpath('javascript/canvas_workbench/canvas_mask_node_factory.js')
    canvas_workbench_canvas_result_node_factory_path = webpath('javascript/canvas_workbench/canvas_result_node_factory.js')
    canvas_workbench_canvas_vlm_node_path = webpath('javascript/canvas_workbench/canvas_vlm_node.js')
    canvas_workbench_canvas_vlm_node_view_path = webpath('javascript/canvas_workbench/canvas_vlm_node_view.js')
    canvas_workbench_canvas_node_param_path = webpath('javascript/canvas_workbench/canvas_node_param_controller.js')
    canvas_workbench_canvas_inspector_path = webpath('javascript/canvas_workbench/canvas_inspector_controller.js')
    canvas_workbench_canvas_vlm_chat_path = webpath('javascript/canvas_workbench/canvas_vlm_chat.js')
    canvas_workbench_canvas_agent_image_workflows_path = webpath('javascript/canvas_workbench/canvas_agent_image_workflows.js')
    canvas_workbench_canvas_agent_video_workflows_path = webpath('javascript/canvas_workbench/canvas_agent_video_workflows.js')
    canvas_workbench_canvas_agent_video_tools_path = webpath('javascript/canvas_workbench/canvas_agent_video_tools.js')
    canvas_workbench_canvas_agent_image_tools_path = webpath('javascript/canvas_workbench/canvas_agent_image_tools.js')
    canvas_workbench_canvas_agent_audio_workflows_path = webpath('javascript/canvas_workbench/canvas_agent_audio_workflows.js')
    canvas_workbench_canvas_agent_audio_tools_path = webpath('javascript/canvas_workbench/canvas_agent_audio_tools.js')
    canvas_workbench_canvas_agent_tool_dispatch_path = webpath('javascript/canvas_workbench/canvas_agent_tool_dispatch.js')
    canvas_workbench_canvas_agent_panel_views_path = webpath('javascript/canvas_workbench/canvas_agent_panel_views.js')
    canvas_workbench_canvas_settings_views_path = webpath('javascript/canvas_workbench/canvas_settings_views.js')
    canvas_workbench_canvas_settings_controller_path = webpath('javascript/canvas_workbench/canvas_settings_controller.js')
    canvas_workbench_canvas_history_path = webpath('javascript/canvas_workbench/canvas_history_controller.js')
    canvas_workbench_canvas_selection_path = webpath('javascript/canvas_workbench/canvas_selection_controller.js')
    canvas_workbench_canvas_graph_delete_path = webpath('javascript/canvas_workbench/canvas_graph_delete_controller.js')
    canvas_workbench_canvas_clipboard_path = webpath('javascript/canvas_workbench/canvas_clipboard_controller.js')
    canvas_workbench_canvas_project_actions_path = webpath('javascript/canvas_workbench/canvas_project_actions_controller.js')
    canvas_workbench_canvas_project_assets_path = webpath('javascript/canvas_workbench/canvas_project_assets_controller.js')
    canvas_workbench_canvas_backend_requests_path = webpath('javascript/canvas_workbench/canvas_backend_request_controller.js')
    canvas_workbench_canvas_project_persistence_path = webpath('javascript/canvas_workbench/canvas_project_persistence_controller.js')
    canvas_workbench_canvas_bridge_transport_path = webpath('javascript/canvas_workbench/canvas_bridge_transport.js')
    canvas_workbench_canvas_minimap_path = webpath('javascript/canvas_workbench/canvas_minimap_controller.js')
    canvas_workbench_canvas_group_interaction_path = webpath('javascript/canvas_workbench/canvas_group_interaction_controller.js')
    canvas_workbench_canvas_run_panels_path = webpath('javascript/canvas_workbench/canvas_run_panels_controller.js')
    canvas_workbench_canvas_node_resize_path = webpath('javascript/canvas_workbench/canvas_node_resize_controller.js')
    canvas_workbench_canvas_node_drag_path = webpath('javascript/canvas_workbench/canvas_node_drag_controller.js')
    canvas_workbench_canvas_pan_path = webpath('javascript/canvas_workbench/canvas_pan_controller.js')
    canvas_workbench_canvas_viewport_wheel_path = webpath('javascript/canvas_workbench/canvas_viewport_wheel_controller.js')
    canvas_workbench_canvas_viewport_drop_path = webpath('javascript/canvas_workbench/canvas_viewport_drop_controller.js')
    canvas_workbench_canvas_viewport_context_path = webpath('javascript/canvas_workbench/canvas_viewport_context_controller.js')
    canvas_workbench_canvas_keyboard_path = webpath('javascript/canvas_workbench/canvas_keyboard_controller.js')
    canvas_workbench_canvas_document_paste_path = webpath('javascript/canvas_workbench/canvas_document_paste_controller.js')
    canvas_workbench_canvas_text_control_context_path = webpath('javascript/canvas_workbench/canvas_text_control_context_controller.js')
    canvas_workbench_canvas_marquee_path = webpath('javascript/canvas_workbench/canvas_marquee_controller.js')
    canvas_workbench_canvas_connection_path = webpath('javascript/canvas_workbench/canvas_connection_controller.js')
    canvas_workbench_canvas_input_handle_path = webpath('javascript/canvas_workbench/canvas_input_handle_controller.js')
    canvas_workbench_canvas_viewport_pointer_path = webpath('javascript/canvas_workbench/canvas_viewport_pointer_controller.js')
    canvas_workbench_canvas_edge_interaction_path = webpath('javascript/canvas_workbench/canvas_edge_interaction_controller.js')
    canvas_workbench_canvas_note_tail_path = webpath('javascript/canvas_workbench/canvas_note_tail_controller.js')
    canvas_workbench_canvas_compare_drag_path = webpath('javascript/canvas_workbench/canvas_compare_drag_controller.js')
    canvas_workbench_canvas_text_control_pointer_path = webpath('javascript/canvas_workbench/canvas_text_control_pointer_controller.js')
    canvas_workbench_canvas_timeline_dom_path = webpath('javascript/canvas_workbench/canvas_timeline_dom.js')
    canvas_workbench_canvas_timeline_playhead_path = webpath('javascript/canvas_workbench/canvas_timeline_playhead_controller.js')
    canvas_workbench_canvas_timeline_preview_path = webpath('javascript/canvas_workbench/canvas_timeline_preview_controller.js')
    canvas_workbench_canvas_timeline_frame_path = webpath('javascript/canvas_workbench/canvas_timeline_frame_controller.js')
    canvas_workbench_canvas_timeline_playback_path = webpath('javascript/canvas_workbench/canvas_timeline_playback_controller.js')
    canvas_workbench_canvas_timeline_keyframe_path = webpath('javascript/canvas_workbench/canvas_timeline_keyframe_controller.js')
    canvas_workbench_canvas_timeline_clip_path = webpath('javascript/canvas_workbench/canvas_timeline_clip_controller.js')
    canvas_workbench_canvas_timeline_mask_path = webpath('javascript/canvas_workbench/canvas_timeline_mask_controller.js')
    canvas_workbench_canvas_timeline_param_path = webpath('javascript/canvas_workbench/canvas_timeline_param_controller.js')
    canvas_workbench_canvas_timeline_command_path = webpath('javascript/canvas_workbench/canvas_timeline_command_controller.js')
    canvas_workbench_canvas_timeline_render_path = webpath('javascript/canvas_workbench/canvas_timeline_render_controller.js')
    canvas_workbench_canvas_timeline_compare_path = webpath('javascript/canvas_workbench/canvas_timeline_compare_controller.js')
    canvas_workbench_canvas_director_timeline_drag_path = webpath('javascript/canvas_workbench/canvas_director_timeline_drag_controller.js')
    canvas_workbench_canvas_outpaint_path = webpath('javascript/canvas_workbench/canvas_outpaint_controller.js')
    canvas_workbench_canvas_resolution_drag_path = webpath('javascript/canvas_workbench/canvas_resolution_drag_controller.js')
    canvas_workbench_canvas_media_browser_drag_path = webpath('javascript/canvas_workbench/canvas_media_browser_drag_controller.js')
    canvas_workbench_canvas_qwen_tts_presets_path = webpath('javascript/canvas_workbench/canvas_qwen_tts_presets_controller.js')
    canvas_workbench_canvas_tooltip_path = webpath('javascript/canvas_workbench/canvas_tooltip_controller.js')
    canvas_workbench_canvas_hover_preview_path = webpath('javascript/canvas_workbench/canvas_hover_preview_controller.js')
    canvas_workbench_canvas_preview_select_path = webpath('javascript/canvas_workbench/canvas_preview_select_controller.js')
    canvas_workbench_canvas_danbooru_autocomplete_path = webpath('javascript/canvas_workbench/canvas_danbooru_autocomplete_controller.js')
    canvas_workbench_canvas_vlm_chat_image_preview_path = webpath('javascript/canvas_workbench/canvas_vlm_chat_image_preview_controller.js')
    canvas_workbench_canvas_template_library_defaults_path = webpath('javascript/canvas_workbench/canvas_template_library_defaults.js')
    canvas_workbench_canvas_template_library_api_path = webpath('javascript/canvas_workbench/canvas_template_library_api.js')
    canvas_workbench_canvas_template_library_data_path = webpath('javascript/canvas_workbench/canvas_template_library_data.js')
    canvas_workbench_canvas_template_library_views_path = webpath('javascript/canvas_workbench/canvas_template_library_views.js')
    canvas_workbench_canvas_confirm_dialog_path = webpath('javascript/canvas_workbench/canvas_confirm_dialog.js')
    canvas_workbench_canvas_template_library_controller_path = webpath('javascript/canvas_workbench/canvas_template_library_controller.js')
    canvas_workbench_canvas_agent_panel_controller_path = webpath('javascript/canvas_workbench/canvas_agent_panel_controller.js')
    canvas_workbench_canvas_agent_instruction_planner_path = webpath('javascript/canvas_workbench/canvas_agent_instruction_planner.js')
    canvas_workbench_canvas_agent_vlm_instruction_path = webpath('javascript/canvas_workbench/canvas_agent_vlm_instruction.js')
    canvas_workbench_scheduler_path = webpath('javascript/canvas_workbench/scheduler.js')
    canvas_workbench_media_helpers_path = webpath('javascript/canvas_workbench/media_helpers.js')
    canvas_workbench_asset_nodes_path = webpath('javascript/canvas_workbench/nodes/asset_node_common.js')
    canvas_workbench_asset_manager_path = webpath('javascript/canvas_workbench/asset_manager.js')
    canvas_workbench_node_browser_path = webpath('javascript/canvas_workbench/node_browser.js')
    canvas_workbench_project_manager_path = webpath('javascript/canvas_workbench/project_manager.js')
    canvas_workbench_group_list_path = webpath('javascript/canvas_workbench/group_list.js')
    canvas_workbench_mask_editor_path = webpath('javascript/canvas_workbench/mask_editor.js')
    canvas_workbench_media_viewers_path = webpath('javascript/canvas_workbench/media_viewers.js')
    canvas_workbench_run_status_controller_path = webpath('javascript/canvas_workbench/canvas_run_status_controller.js')
    canvas_workbench_run_history_path = webpath('javascript/canvas_workbench/run_history_panel.js')
    canvas_workbench_run_queue_path = webpath('javascript/canvas_workbench/run_queue_panel.js')
    canvas_workbench_image_node_path = webpath('javascript/canvas_workbench/nodes/image_node.js')
    canvas_workbench_video_node_path = webpath('javascript/canvas_workbench/nodes/video_node.js')
    canvas_workbench_audio_node_path = webpath('javascript/canvas_workbench/nodes/audio_node.js')
    canvas_workbench_compare_node_path = webpath('javascript/canvas_workbench/nodes/compare_node.js')
    canvas_workbench_sam3_video_mask_node_path = webpath('javascript/canvas_workbench/nodes/sam3_video_mask_node.js')
    canvas_workbench_camera_motion_node_path = webpath('javascript/canvas_workbench/nodes/camera_motion_node.js')
    canvas_workbench_pose_studio_node_path = webpath('javascript/canvas_workbench/nodes/pose_studio_node.js')
    canvas_workbench_gaussian_studio_node_path = webpath('javascript/canvas_workbench/nodes/gaussian_studio_node.js')
    canvas_workbench_liveportrait_expression_node_path = webpath('javascript/canvas_workbench/nodes/liveportrait_expression_node.js')
    canvas_workbench_qwen_tts_node_path = webpath('javascript/canvas_workbench/nodes/qwen_tts_node.js')
    canvas_workbench_director_timeline_node_path = webpath('javascript/canvas_workbench/nodes/director_timeline_node.js')
    canvas_workbench_style_selector_node_path = webpath('javascript/canvas_workbench/nodes/style_selector_node.js')
    pose_studio_editor_path = webpath('javascript/pose_studio_editor.js')
    gaussian_studio_editor_path = webpath('javascript/gaussian_studio_editor.js')
    liveportrait_expression_editor_path = webpath('javascript/liveportrait_expression_editor.js')
    ltx_guide_editor_path = webpath('javascript/ltx_guide_editor.js')
    minimax_h3_storyboard_editor_path = webpath('javascript/minimax_h3_storyboard_editor.js')
    canvas_workbench_sketch_adapter_path = webpath('javascript/canvas_workbench/sketch_adapter.js')
    canvas_workbench_preset_catalog_path = webpath('javascript/canvas_workbench/preset_catalog.js')
    canvas_workbench_context_menu_path = webpath('javascript/canvas_workbench/context_menu.js')
    canvas_workbench_node_menus_path = webpath('javascript/canvas_workbench/node_menus.js')
    infinite_canvas_workbench_path = webpath('javascript/infinite_canvas_workbench.js')
    tag_cart_path = webpath('javascript/tag_cart.js') 
    tailwindcss_path = webpath('javascript/tailwindcss_3.4.16.js') 
    papaparse_path = webpath('javascript/papaparse.min_5.4.1.js') 
    sortable_path = webpath('javascript/sortable.min_1.15.2f.js') 
    layerforge_js_path = webpath('javascript/layerforge_integration.js')
    custom_sketch_editor_path = webpath('javascript/custom_sketch_editor.js')
    samples_path = webpath(os.path.abspath('./sdxl_styles/samples/fooocus_v2.jpg'))
    preset_samples_path = webpath(os.path.abspath('./presets/samples/default.jpg'))
    model_path = webpath(modules.config.get_path_models_root())
    custom_tags_path = webpath(ensure_tag_cart_custom_tags_path())
    def model_meta_paths(catalog_name, fallback_paths=None):
        raw_paths = []
        try:
            raw_paths = list((modules.config.model_cata_map or {}).get(catalog_name) or [])
        except Exception:
            raw_paths = []
        if not raw_paths:
            raw_paths = list(fallback_paths or [])
        result = []
        for path in raw_paths:
            if path and _path_exists_for_webpath(path):
                url = webpath(path)
                if url not in result:
                    result.append(url)
        return result

    checkpoints_paths = model_meta_paths('checkpoints', modules.config.paths_checkpoints)
    lora_paths = model_meta_paths('loras', modules.config.paths_loras)
    upscale_model_paths = model_meta_paths('upscale_models', getattr(modules.config, 'paths_upscale_models', []))
    infinite_canvas_lazy_assets = {
        'css': [
            infinite_canvas_workbench_css_path,
        ],
        'js': [
            canvas_workbench_registry_path,
            canvas_workbench_vlm_chat_path,
            canvas_workbench_canvas_agent_path,
            canvas_workbench_canvas_agent_settings_path,
            canvas_workbench_canvas_agent_input_path,
            canvas_workbench_canvas_scroll_path,
            canvas_workbench_canvas_mode_path,
            canvas_workbench_canvas_status_path,
            canvas_workbench_canvas_render_path,
            canvas_workbench_canvas_preset_param_renderer_path,
            canvas_workbench_canvas_preset_node_renderer_path,
            canvas_workbench_canvas_node_render_path,
            canvas_workbench_canvas_node_renderer_path,
            canvas_workbench_canvas_asset_node_renderer_path,
            canvas_workbench_canvas_node_layout_path,
            canvas_workbench_canvas_viewport_render_path,
            canvas_workbench_canvas_node_spatial_index_path,
            canvas_workbench_canvas_node_factory_path,
            canvas_workbench_canvas_result_preview_path,
            canvas_workbench_canvas_lifecycle_path,
            canvas_workbench_canvas_action_path,
            canvas_workbench_canvas_click_path,
            canvas_workbench_canvas_agent_references_path,
            canvas_workbench_canvas_agent_decision_path,
            canvas_workbench_canvas_agent_prompt_rewrite_path,
            canvas_workbench_canvas_agent_text_workflows_path,
            canvas_workbench_canvas_agent_text_nodes_path,
            canvas_workbench_canvas_text_node_renderer_path,
            canvas_workbench_canvas_text_node_factory_path,
            canvas_workbench_canvas_aux_node_factory_path,
            canvas_workbench_canvas_batch_any_node_factory_path,
            canvas_workbench_canvas_mask_node_factory_path,
            canvas_workbench_canvas_result_node_factory_path,
            canvas_workbench_canvas_vlm_node_path,
            canvas_workbench_canvas_vlm_node_view_path,
            canvas_workbench_canvas_node_param_path,
            canvas_workbench_canvas_inspector_path,
            canvas_workbench_canvas_vlm_chat_path,
            canvas_workbench_canvas_agent_image_workflows_path,
            canvas_workbench_canvas_agent_video_workflows_path,
            canvas_workbench_canvas_agent_video_tools_path,
            canvas_workbench_canvas_agent_image_tools_path,
            canvas_workbench_canvas_agent_audio_workflows_path,
            canvas_workbench_canvas_agent_audio_tools_path,
            canvas_workbench_canvas_agent_tool_dispatch_path,
            canvas_workbench_canvas_agent_panel_views_path,
             canvas_workbench_canvas_settings_views_path,
             canvas_workbench_canvas_settings_controller_path,
             canvas_workbench_canvas_history_path,
             canvas_workbench_canvas_selection_path,
             canvas_workbench_canvas_graph_delete_path,
             canvas_workbench_canvas_clipboard_path,
             canvas_workbench_canvas_project_actions_path,
            canvas_workbench_canvas_project_assets_path,
            canvas_workbench_canvas_backend_requests_path,
            canvas_workbench_canvas_project_persistence_path,
            canvas_workbench_canvas_bridge_transport_path,
            canvas_workbench_canvas_minimap_path,
             canvas_workbench_canvas_group_interaction_path,
             canvas_workbench_canvas_run_panels_path,
             canvas_workbench_canvas_node_resize_path,
             canvas_workbench_canvas_node_drag_path,
             canvas_workbench_canvas_pan_path,
             canvas_workbench_canvas_viewport_wheel_path,
             canvas_workbench_canvas_viewport_drop_path,
             canvas_workbench_canvas_viewport_context_path,
             canvas_workbench_canvas_keyboard_path,
             canvas_workbench_canvas_document_paste_path,
             canvas_workbench_canvas_text_control_context_path,
             canvas_workbench_canvas_marquee_path,
             canvas_workbench_canvas_connection_path,
             canvas_workbench_canvas_input_handle_path,
             canvas_workbench_canvas_viewport_pointer_path,
             canvas_workbench_canvas_edge_interaction_path,
             canvas_workbench_canvas_note_tail_path,
             canvas_workbench_canvas_compare_drag_path,
             canvas_workbench_canvas_text_control_pointer_path,
             canvas_workbench_canvas_timeline_dom_path,
             canvas_workbench_canvas_timeline_playhead_path,
             canvas_workbench_canvas_timeline_preview_path,
             canvas_workbench_canvas_timeline_frame_path,
             canvas_workbench_canvas_timeline_playback_path,
             canvas_workbench_canvas_timeline_keyframe_path,
             canvas_workbench_canvas_timeline_clip_path,
             canvas_workbench_canvas_timeline_mask_path,
             canvas_workbench_canvas_timeline_param_path,
             canvas_workbench_canvas_timeline_command_path,
             canvas_workbench_canvas_timeline_render_path,
             canvas_workbench_canvas_timeline_compare_path,
             canvas_workbench_canvas_director_timeline_drag_path,
             canvas_workbench_canvas_outpaint_path,
             canvas_workbench_canvas_resolution_drag_path,
             canvas_workbench_canvas_media_browser_drag_path,
             canvas_workbench_canvas_qwen_tts_presets_path,
            canvas_workbench_canvas_tooltip_path,
            canvas_workbench_canvas_hover_preview_path,
            canvas_workbench_canvas_preview_select_path,
            canvas_workbench_canvas_danbooru_autocomplete_path,
            canvas_workbench_canvas_vlm_chat_image_preview_path,
            canvas_workbench_canvas_template_library_defaults_path,
            canvas_workbench_canvas_template_library_api_path,
            canvas_workbench_canvas_template_library_data_path,
            canvas_workbench_canvas_template_library_views_path,
            canvas_workbench_canvas_confirm_dialog_path,
            canvas_workbench_canvas_template_library_controller_path,
            canvas_workbench_canvas_agent_panel_controller_path,
            canvas_workbench_canvas_agent_instruction_planner_path,
            canvas_workbench_canvas_agent_vlm_instruction_path,
            canvas_workbench_project_store_path,
            canvas_workbench_viewport_path,
            canvas_workbench_scheduler_path,
            canvas_workbench_media_helpers_path,
            canvas_workbench_asset_nodes_path,
            canvas_workbench_asset_manager_path,
            canvas_workbench_node_browser_path,
            canvas_workbench_project_manager_path,
            canvas_workbench_group_list_path,
            canvas_workbench_mask_editor_path,
            canvas_workbench_media_viewers_path,
            canvas_workbench_run_status_controller_path,
            canvas_workbench_run_history_path,
            canvas_workbench_run_queue_path,
            canvas_workbench_timeline_path,
            canvas_workbench_image_node_path,
            canvas_workbench_video_node_path,
            canvas_workbench_audio_node_path,
            canvas_workbench_compare_node_path,
            canvas_workbench_sam3_video_mask_node_path,
            canvas_workbench_camera_motion_node_path,
            canvas_workbench_pose_studio_node_path,
            canvas_workbench_gaussian_studio_node_path,
            canvas_workbench_liveportrait_expression_node_path,
            canvas_workbench_qwen_tts_node_path,
            canvas_workbench_director_timeline_node_path,
            canvas_workbench_style_selector_node_path,
            canvas_workbench_sketch_adapter_path,
            canvas_workbench_preset_catalog_path,
            canvas_workbench_context_menu_path,
            canvas_workbench_node_menus_path,
            infinite_canvas_workbench_path,
        ],
    }
    lazy_assets = {
        'groups': {
            'infiniteCanvas': infinite_canvas_lazy_assets,
            'modelBrowser': {
                'js': [
                    model_browser_js_path,
                ],
            },
            'describeVlmChat': {
                'js': [
                    describe_vlm_chat_path,
                ],
            },
            'poseStudio': {
                'css': [
                    infinite_canvas_workbench_css_path,
                ],
                'js': [
                    pose_studio_editor_path,
                ],
            },
            'gaussianStudio': {
                'css': [
                    infinite_canvas_workbench_css_path,
                ],
                'js': [
                    gaussian_studio_editor_path,
                ],
            },
            'livePortraitExpression': {
                'css': [
                    infinite_canvas_workbench_css_path,
                ],
                'js': [
                    liveportrait_expression_editor_path,
                ],
            },
            'ltxGuideEditor': {
                'css': [
                    infinite_canvas_workbench_css_path,
                ],
                'js': [
                    ltx_guide_editor_path,
                ],
            },
            'h3StoryboardEditor': {
                'css': [
                    infinite_canvas_workbench_css_path,
                ],
                'js': [
                    minimax_h3_storyboard_editor_path,
                ],
            },
            'tagCart': {
                'css': [
                    tag_cart_css_path,
                ],
                'js': [
                    papaparse_path,
                    sortable_path,
                    tag_cart_path,
                ],
            },
            'layerForge': {
                'js': [
                    canvg_min_js_path,
                    layerforge_js_path,
                ],
            },
            'customSketch': {
                'js': [
                    custom_sketch_editor_path,
                ],
            },
        },
    }
    lazy_assets_json = json.dumps(lazy_assets, ensure_ascii=False).replace("</", "<\\/")
    infinite_canvas_lazy_assets_json = json.dumps(infinite_canvas_lazy_assets, ensure_ascii=False).replace("</", "<\\/")

    head = f'<script type="text/javascript">{localization_js(args_manager.args.language)}</script>\n'
    head += f'<script type="text/javascript">{load_tips_text()}</script>\n'
    head += f'<script type="text/javascript">{style_catalog_js()}</script>\n'
    head += f'<script type="text/javascript">{style_transfer_catalog_js()}</script>\n'
    head += f'<script type="text/javascript">{prompt_action_catalog_js()}</script>\n'
    head += f'<script type="text/javascript">window.SimpAIDefaultEnhanceMaskModel={json.dumps(modules.config.default_enhance_inpaint_mask_model)};</script>\n'
    head += f'<script type="text/javascript" src="{simpleai_i18n_js_path}"></script>\n'
    from ui.studio_performance import studio_performance_frontend_config
    studio_performance_config = studio_performance_frontend_config()
    if studio_performance_config is not None:
        config_json = json.dumps(studio_performance_config, ensure_ascii=False).replace("</", "<\\/")
        head += f'<script type="text/javascript">window.SimpAIStudioPerformanceConfig={config_json};</script>\n'
        head += f'<script type="text/javascript" src="{studio_performance_js_path}"></script>\n'
    head += f'<script type="text/javascript">window.SimpAILazyAssets={lazy_assets_json};</script>\n'
    head += f'<script type="text/javascript" src="{script_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{context_menus_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{localization_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{gradio_media_replacement_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{welcome_media_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{metadata_media_input_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{scene_director_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{zoom_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{edit_attention_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{viewer_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{image_viewer_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{topbar_js_path}"></script>\n'
    head += f'<script type="text/javascript" src="{canvas_workbench_utils_path}"></script>\n'
    head += f'<script type="text/javascript" src="{canvas_workbench_api_path}"></script>\n'
    head += f'<script type="text/javascript">window.SimpAIInfiniteCanvasLazyAssets={infinite_canvas_lazy_assets_json};</script>\n'
    head += f'<script type="text/javascript" src="{workspace_recovery_path}"></script>\n'
    head += f'<script type="text/javascript" src="{status_monitor_path}"></script>\n'
    head += f'<script type="text/javascript" src="{console_overlay_path}"></script>\n'
    head += f'<script type="text/javascript" src="{webui_danbooru_autocomplete_path}"></script>\n'
    head += f'<script type="text/javascript" src="{scene_prompt_recommendations_path}"></script>\n'
    head += f'<script type="text/javascript" src="{prompt_actions_path}"></script>\n'
    head += f'<meta name="samples-path" content="{samples_path}">\n'
    head += f'<meta name="preset-samples-path" content="{preset_samples_path}">\n'
    head += f'<meta name="model-path" content="{model_path}">\n'
    head += f'<meta name="tag-cart-custom-tags-path" content="{custom_tags_path}">\n'
    head += f'<meta name="checkpoints-paths" content="{",".join(checkpoints_paths)}">\n'
    head += f'<meta name="loras-paths" content="{",".join(lora_paths)}">\n'
    head += f'<meta name="upscale_models-paths" content="{",".join(upscale_model_paths)}">\n'

    theme = args_manager.args.theme if args_manager.args.theme else "light"
    head += f'<script type="text/javascript">set_theme(\"{theme}\");</script>\n'

    return head


def css_html():
    style_css_path = webpath('css/style.css')
    font_awesome_path = webpath('css/fa_all.min_6.5.2.css')
    font_awesome_fix_path = webpath('css/font_awesome_fix.css')
    head = f'<link rel="stylesheet" property="stylesheet" href="{style_css_path}">\n'
    head += f'<link rel="stylesheet" property="stylesheet" href="{font_awesome_path}">\n'
    head += f'<link rel="stylesheet" property="stylesheet" href="{font_awesome_fix_path}">\n'
    return head


def reload_javascript():
    reload_template_assets(javascript_html=javascript_html, css_html=css_html)
