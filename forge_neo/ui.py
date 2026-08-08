from __future__ import annotations

import base64
import csv
import html as html_lib
import io
import json
import os
import subprocess
import sys
import urllib.parse
from collections.abc import Mapping
from dataclasses import dataclass
from functools import partial
from pathlib import Path

import gradio as gr
from PIL import Image, ImageChops, ImageDraw, ImageEnhance

import args_manager
from forge_neo.adetailer_compat import (
    ADETAILER_ARG_DEFAULTS,
    adetailer_load_state,
    adetailer_model_names,
    adetailer_preferred_model,
    adetailer_reset_state,
    adetailer_version,
)
from forge_neo.aesthetic_enhancement import aesthetic_gallery_values, aesthetic_summary_html
from forge_neo.aesthetic_enhancement import aesthetic_qwen_analysis_defaults, aesthetic_qwen_analyze, aesthetic_qwen_connection_status
from forge_neo.checkpoint_hashes import calculate_checkpoint_hashes, checkpoint_hashes_html
from forge_neo.extension_adapter import (
    adetailer_available,
    aesthetic_enhancement_available,
    builtin_extension_available,
    camera_angle_selector_iframe_html,
    camera_angle_selector_available,
    civitai_helper_available,
    dynamic_prompts_available,
    forge_couple_available,
    infinite_browsing_iframe_html,
    infinite_browsing_available,
    multimodal_media_available,
    qwen_vision_chat_available,
    regional_prompter_available,
    sam_matting_available,
    see_through_available,
    storyboard_assistant_available,
    TAGCOMPLETE_EXTENSION,
    tipo_available,
    trellis2_available,
    wd14_tagger_available,
    wd14_interrogate_payload,
    wd14_interrogator_names,
)
from forge_neo.regional_prompter_compat import (
    REGIONAL_PROMPTER_ARG_DEFAULTS,
    REGIONAL_PROMPTER_ARG_KEYS,
    REGIONAL_PROMPTER_OPTION_CHOICES,
    regional_prompter_arg_dict,
)
from forge_neo.tipo_compat import (
    TIPO_ARG_KEYS,
    TIPO_LENGTH_CHOICES,
    TIPO_TIMING_AFTER,
    TIPO_TIMING_BEFORE,
    tipo_arg_dict,
    tipo_default_values,
    tipo_format_choices,
    tipo_model_choices,
)
from forge_neo.extensions import (
    ADAPTED_AVAILABLE_EXTENSION_SOURCE,
    apply_extension_config_state,
    apply_extension_changes,
    apply_extension_disable_mode,
    available_extension_table,
    available_extension_filter_counts,
    cached_available_extension_tag_choices,
    build_extension_config_diff,
    build_extension_install_preview,
    build_extension_update_preview,
    extension_apply_preview_table,
    extension_config_choices,
    extension_config_diff_table,
    extension_config_download_path,
    extension_config_state_table,
    extension_install_preview_html,
    extension_summary,
    extension_table,
    extension_update_candidate_names,
    extension_update_preview_table,
    install_extension_from_url,
    load_available_extensions,
    save_extension_config_state,
)
from forge_neo.dynamic_prompts_wildcards import create_dynamic_prompts_wildcards_tab
from forge_neo.dynamic_prompts_compat import DYNAMIC_PROMPTS_ARG_DEFAULTS, DYNAMIC_PROMPTS_ARG_KEYS, dynamic_prompts_arg_dict
from forge_neo.forge_couple_compat import (
    FORGE_COUPLE_ARG_DEFAULTS,
    FORGE_COUPLE_ARG_KEYS,
    FORGE_COUPLE_DEFAULT_MAPPING,
    forge_couple_arg_dict,
    normalize_advanced_mapping,
    normalize_mask_mapping,
)
from forge_neo.forge_canvas import ForgeCanvas
from forge_neo.i18n import t
from forge_neo.licenses import license_notice_html
from forge_neo.localization import localization_template_html, save_localization_template
from forge_neo.models import (
    UI_PRESETS,
    find_model_path,
    first_or_none,
    initial_preset,
    initial_model_choices,
    module_choices,
    preset_model_defaults,
    refresh_model_choices,
    sampling_methods,
    scheduler_types,
    save_forge_neo_config_values,
    settings_defaults_for_preset,
    split_module_selection,
    upscale_model_names,
)
from forge_neo.multimodal_media import (
    ace_step_analyze,
    ace_step_defaults,
    ace_step_generate,
    extract_video_frames,
    index_tts_defaults,
    index_tts_generate,
    latent_sync_defaults,
    latent_sync_generate,
    multimodal_media_defaults,
    multimodal_media_status,
    qwen3_tts_defaults,
    qwen3_tts_generate,
    qwen_video_defaults,
    qwen_video_generate,
    qwen_video_query,
    qwen_video_recent_tasks,
    qwen_video_set_api_key,
)
from forge_neo.png_info import parse_generation_parameters, png_info_html, read_png_info
from forge_neo.qwen_vision_chat import qwen_vision_chat_defaults, qwen_vision_chat_request
from forge_neo.restart import ensure_server_state
from forge_neo.sam_matting import REMBG_MODELS, SAM_MODELS, remove_background, run_cleaner, run_sam_auto_segmentation, run_sam_point_segmentation, sam_matting_defaults, sam_matting_status
from forge_neo.see_through import run_see_through, see_through_defaults, see_through_status
from forge_neo.source_ui import render_source_extension_tab
from forge_neo.trellis2 import generate_trellis2_3d, trellis2_defaults, trellis2_status
from forge_neo.runtime import ForgeNeoBatchEditRequest, ForgeNeoExtrasRequest, ForgeNeoRequest, _image_from_value, gallery_image_at, outputs_dir, save_output_images
from forge_neo.runtime import (
    ForgeNeoCurrentModelSaveRequest,
    ForgeNeoMergerRequest,
    build_merger_metadata_json,
    build_batch_edit_plan,
    merger_formula,
    run_batch_edit,
    run_current_model_save_plan,
    run_merger_recipe,
)
from forge_neo.scripts import refresh_script_body_index, script_body_index_html, script_dropdown_choices
from forge_neo.settings import (
    CALLBACK_PRIORITY_CHOICES,
    CALLBACK_PRIORITY_KEYS,
    DEFAULT_SETTINGS,
    FORGE_COUPLE_SETTING_KEYS,
    PRESET_ARCHES,
    PRESET_DISTILL,
    PRESET_DISPLAY_NAMES,
    PRESET_FRAMES,
    PRESET_SETTING_KEYS,
    PRESET_SHIFT,
    TAGCOMPLETE_SETTING_KEYS,
    check_sysinfo_file,
    load_settings,
    normalize_settings,
    reset_settings,
    save_settings,
    save_sysinfo,
    settings_json,
    settings_path,
    settings_search_rows,
    sysinfo_snapshot,
)
from forge_neo.style_grid import (
    style_grid_alwayson_payload,
    style_grid_available,
    style_grid_category_order_json,
    style_grid_payload_json,
)
from forge_neo.storyboard import (
    CHARACTERS_PER_PAGE,
    STORYBOARDS_PER_PAGE,
    STORY_GENRES,
    add_blank_storyboard,
    delete_story_character,
    delete_story_character_image,
    clear_storyboard_cell,
    clear_storyboards,
    create_story_script,
    delete_story_script,
    delete_storyboard_audio,
    delete_storyboard_frame,
    export_story_script,
    export_storyboards,
    load_story_character,
    load_story_script,
    move_storyboard_audio,
    move_storyboard_frame,
    save_story_character,
    send_image_to_storyboard,
    save_story_script,
    storyboard_cell_values,
    storyboard_gallery_values,
    storyboard_page_items,
    story_character_choices,
    story_script_choices,
    update_storyboard_cell_audio,
    update_storyboard_cell_description,
    update_storyboard_cell_image,
)
from forge_neo.styles import apply_style_names, apply_styles_to_prompt, delete_style, get_style, save_style, style_choices
from forge_neo.ui_components import InputAccordion
from forge_neo.worker import skip_current, stop_current, unload_runtime_state, worker
from ui.bootstrap import create_root_blocks


HIRES_UPSCALERS = [
    "Latent",
    "Latent (antialiased)",
    "Latent (bicubic)",
    "Latent (bicubic antialiased)",
    "Latent (nearest)",
    "Latent (nearest-exact)",
    "Latent (bilinear)",
    "None",
]

TORCH_COMPILE_PRESETS = [
    "Automatic",
    "Disable",
    "guard_filter_fn",
    "dynamic",
    "max-autotune",
    "max-autotune-no-cudagraphs",
    "reduce-overhead",
]

CONTROLNET_PREPROCESSORS = [
    "None",
    "CLIP-ViT-H (IPAdapter)",
    "CLIP-ViT-bigG (IPAdapter)",
    "InsightFace (InstantID)",
    "InsightFace+CLIP-H (IPAdapter)",
    "animal_openpose",
    "blur_gaussian",
    "canny",
    "densepose (pruple bg & purple torso)",
    "densepose_parula (black bg & blue torso)",
    "depth_anything",
    "depth_anything_v2",
    "depth_leres",
    "depth_leres++",
    "depth_midas",
    "depth_zoe",
    "dw_openpose_full",
    "inpaint_global_harmonious",
    "inpaint_noobai",
    "inpaint_only",
    "inpaint_only+lama",
    "instant_id_face_keypoints",
    "invert (from white bg & black line)",
    "lineart_anime",
    "lineart_anime_denoise",
    "lineart_coarse",
    "lineart_realistic",
    "lineart_standard (from white bg & black line)",
    "mediapipe_face",
    "mlsd",
    "normal_midas",
    "openpose",
    "openpose_face",
    "openpose_faceonly",
    "openpose_full",
    "openpose_hand",
    "reference_adain",
    "reference_adain+attn",
    "reference_only",
    "scribble_hed",
    "scribble_pidinet",
    "scribble_xdog",
    "seg_anime_face",
    "seg_ofade20k",
    "seg_ofcoco",
    "seg_ufade20k",
    "shuffle",
    "softedge_hed",
    "softedge_hedsafe",
    "softedge_pidinet",
    "softedge_pidisafe",
    "softedge_teed",
    "t2ia_color_grid",
    "t2ia_sketch_pidi",
    "threshold",
    "tile_colorfix",
    "tile_colorfix+sharp",
    "tile_resample",
]
CONTROLNET_TYPES = [
    ("All", "全部"),
    ("Blur", "模糊"),
    ("Canny", "Canny"),
    ("Depth", "深度"),
    ("IP-Adapter", "IP-Adapter"),
    ("Inpaint", "重绘"),
    ("Instant-ID", "Instant-ID"),
    ("Lineart", "线稿"),
    ("MLSD", "MLSD"),
    ("NormalMap", "法线图"),
    ("OpenPose", "OpenPose"),
    ("Reference", "参考"),
    ("Scribble", "涂鸦"),
    ("Segmentation", "分割"),
    ("Shuffle", "Shuffle"),
    ("Sketch", "草图"),
    ("SoftEdge", "软边缘"),
    ("T2I-Adapter", "T2I-Adapter"),
    ("Tile", "Tile"),
]
CONTROLNET_PREPROCESSORS_BY_TYPE = {
    "All": CONTROLNET_PREPROCESSORS,
    "Blur": ["None", "blur_gaussian"],
    "Canny": ["None", "canny", "invert (from white bg & black line)"],
    "Depth": ["None", "depth_anything", "depth_anything_v2", "depth_leres", "depth_leres++", "depth_midas", "depth_zoe"],
    "IP-Adapter": ["None", "CLIP-ViT-H (IPAdapter)", "CLIP-ViT-bigG (IPAdapter)", "InsightFace+CLIP-H (IPAdapter)"],
    "Inpaint": ["None", "inpaint_global_harmonious", "inpaint_noobai", "inpaint_only", "inpaint_only+lama"],
    "Instant-ID": ["None", "InsightFace (InstantID)", "instant_id_face_keypoints"],
    "Lineart": [
        "None",
        "lineart_anime",
        "lineart_anime_denoise",
        "lineart_coarse",
        "lineart_realistic",
        "lineart_standard (from white bg & black line)",
    ],
    "MLSD": ["None", "mlsd"],
    "NormalMap": ["None", "normal_midas"],
    "OpenPose": [
        "None",
        "animal_openpose",
        "densepose (pruple bg & purple torso)",
        "densepose_parula (black bg & blue torso)",
        "dw_openpose_full",
        "mediapipe_face",
        "openpose",
        "openpose_face",
        "openpose_faceonly",
        "openpose_full",
        "openpose_hand",
    ],
    "Reference": ["None", "reference_adain", "reference_adain+attn", "reference_only"],
    "Scribble": ["None", "scribble_hed", "scribble_pidinet", "scribble_xdog"],
    "Segmentation": ["None", "seg_anime_face", "seg_ofade20k", "seg_ofcoco", "seg_ufade20k"],
    "Shuffle": ["None", "shuffle"],
    "Sketch": ["None", "threshold", "t2ia_sketch_pidi"],
    "SoftEdge": ["None", "softedge_hed", "softedge_hedsafe", "softedge_pidinet", "softedge_pidisafe", "softedge_teed"],
    "T2I-Adapter": ["None", "t2ia_color_grid", "t2ia_sketch_pidi"],
    "Tile": ["None", "tile_colorfix", "tile_colorfix+sharp", "tile_resample"],
}
CONTROLNET_RESIZE_MODES = ["Just Resize", "Crop and Resize", "Resize and Fill"]
CONTROLNET_MODES = ["Balanced", "My prompt is more important", "ControlNet is more important"]
CONTROLNET_HR_OPTIONS = ["Both", "Low res only", "High res only"]
STABLE_DIFFUSION_UNET_CHOICES = ["Automatic"]
STABLE_DIFFUSION_EMPHASIS_CHOICES = ["None", "Ignore", "Original", "No norm"]
STABLE_DIFFUSION_RNG_CHOICES = ["CPU", "GPU", "NV"]
VAE_SETTING_CHOICES = ["Automatic"]
VAE_METHOD_CHOICES = ["Full", "TAESD"]
INFOTEXT_FIELD_CHOICES = [
    "Prompt",
    "Negative prompt",
    "Steps",
    "Sampler",
    "Schedule type",
    "CFG scale",
    "Seed",
    "Size",
    "Model",
    "Model hash",
    "VAE",
    "Text Encoder",
    "LoRA",
    "Version",
]
SETTINGS_IN_UI_CHOICES = [
    "steps",
    "cfg_scale",
    "width",
    "height",
    "seed",
    "sampler",
    "scheduler",
    "sd_vae",
    "CLIP_stop_at_last_layers",
    "tiling",
    "show_rescale_cfg",
    "show_mahiro",
]
UI_TAB_CHOICES = [
    "txt2img",
    "img2img",
    "Extras",
    "PNG Info",
    "Checkpoint Merger",
    "Civitai Helper",
    "Civitai Helper Browser",
    "WD14 Tagger",
    "Infinite Browsing",
    "Camera Angle Selector",
    "Storyboard Assistant",
    "Aesthetic Enhancement",
    "Multimodal Media",
    "Qwen Vision Chat",
    "SAM Matting",
    "See-Through",
    "TRELLIS.2",
    "Settings",
    "Extensions",
]
UI_REORDER_CHOICES = [
    "inpaint",
    "sampler",
    "checkboxes",
    "hires_fix",
    "dimensions",
    "cfg",
    "seed",
    "batch",
    "override_settings",
    "scripts",
]
BUILTIN_CONTROLNET_EXTENSION = "sd_forge_controlnet"
BUILTIN_MULTIDIFFUSION_EXTENSION = "sd_forge_multidiffusion"
BUILTIN_NEVER_OOM_EXTENSION = "sd_forge_neveroom"
BUILTIN_IMAGE_STITCH_EXTENSION = "sd_forge_image_stitch"
BUILTIN_SPECTRUM_EXTENSION = "sd_forge_spectrum"
BUILTIN_TORCH_COMPILE_EXTENSION = "sd_forge_compile"
BUILTIN_MODULATED_GUIDANCE_EXTENSION = "sd_forge_mod_guidance"
GRADIO_THEME_CHOICES = ["Default"]
PROFILING_ACTIVITY_CHOICES = ["CPU", "CUDA"]
RESOLUTION_STEP_CHOICES = ["8", "16", "32", "64", "128", "256"]
AUTO_LAUNCH_BROWSER_CHOICES = ["Disable", "Local", "Remote"]
FACE_RESTORATION_MODEL_CHOICES = ["CodeFormer", "GFPGAN"]
POSTPROCESSING_OPERATION_CHOICES = ["GFPGAN", "CodeFormer", "Upscale"]
PIXEL_UPSCALERS = ["None", "Lanczos", "Nearest", "ESRGAN"]
UPSCALER_CHOICES = [*PIXEL_UPSCALERS, "Latent"]
SVDQ_ATTENTION_CHOICES = ["nunchaku-fp16", "flashattn2"]
CONTROLNET_UNIT_COUNT = 3
CONTROLNET_UNIT_FIELD_COUNT = 21
SCRIPT_PARAM_FIELD_COUNT = 35
ADETAILER_UNIT_COUNT = 4
ADETAILER_UNIT_FIELD_NAMES = (
    "ad_tab_enable",
    "ad_model",
    "ad_model_classes",
    "ad_prompt",
    "ad_negative_prompt",
    "ad_confidence",
    "ad_mask_filter_method",
    "ad_mask_k",
    "ad_mask_min_ratio",
    "ad_mask_max_ratio",
    "ad_x_offset",
    "ad_y_offset",
    "ad_dilate_erode",
    "ad_mask_merge_invert",
    "ad_mask_blur",
    "ad_denoising_strength",
    "ad_inpaint_only_masked",
    "ad_inpaint_only_masked_padding",
    "ad_use_inpaint_width_height",
    "ad_inpaint_width",
    "ad_inpaint_height",
    "ad_use_steps",
    "ad_steps",
    "ad_use_cfg_scale",
    "ad_cfg_scale",
    "ad_use_checkpoint",
    "ad_checkpoint",
    "ad_use_vae",
    "ad_vae",
    "ad_use_sampler",
    "ad_sampler",
    "ad_scheduler",
    "ad_use_noise_multiplier",
    "ad_noise_multiplier",
    "ad_restore_face",
    "ad_controlnet_model",
    "ad_controlnet_module",
    "ad_controlnet_weight",
    "ad_controlnet_guidance_start",
    "ad_controlnet_guidance_end",
)
ADETAILER_UNIT_FIELD_COUNT = len(ADETAILER_UNIT_FIELD_NAMES)
ADETAILER_FIELD_COUNT = 2 + ADETAILER_UNIT_COUNT * ADETAILER_UNIT_FIELD_COUNT
DYNAMIC_PROMPTS_FIELD_COUNT = len(DYNAMIC_PROMPTS_ARG_KEYS)
TIPO_FIELD_COUNT = len(TIPO_ARG_KEYS)
IMG2IMG_EXTRA_FIELD_COUNT = 32
REGIONAL_PROMPTER_FIELD_COUNT = len(REGIONAL_PROMPTER_ARG_KEYS)
FORGE_COUPLE_FIELD_COUNT = len(FORGE_COUPLE_ARG_KEYS)
SCRIPT_PANEL_FIELD_COUNT = 5
SCRIPT_FILL_BUTTON_FIELD_COUNT = 3
SCRIPT_SEND_FIELD_COUNT = 1 + SCRIPT_PANEL_FIELD_COUNT + SCRIPT_PARAM_FIELD_COUNT + SCRIPT_FILL_BUTTON_FIELD_COUNT
INTEGRATED_COMMON_FIELD_COUNT = (
    32
    + SCRIPT_PARAM_FIELD_COUNT
    + ADETAILER_FIELD_COUNT
    + DYNAMIC_PROMPTS_FIELD_COUNT
    + REGIONAL_PROMPTER_FIELD_COUNT
    + FORGE_COUPLE_FIELD_COUNT
)
INTEGRATED_FIELD_COUNT = CONTROLNET_UNIT_COUNT * CONTROLNET_UNIT_FIELD_COUNT + INTEGRATED_COMMON_FIELD_COUNT
XYZ_IMG2IMG_AXIS_CHOICES = [
    "Nothing",
    "Seed",
    "Steps",
    "Size",
    "CFG Scale",
    "Distilled CFG Scale",
    "Shift",
    "Rescale CFG",
    "MaHiRo",
    "Prompt S/R",
    "Prompt order",
    "Sampler",
    "Schedule type",
    "Checkpoint name",
    "VAE",
    "Clip skip",
    "Denoising",
    "Initial noise multiplier",
    "Extra noise",
    "Styles",
    "Face restore",
    "Negative Guidance minimum sigma",
    "Token merging ratio",
    "Token merging ratio high-res",
    "Refiner checkpoint",
    "Refiner switch at",
    "RNG source",
]
XYZ_TXT2IMG_AXIS_CHOICES = [
    "Nothing",
    "Seed",
    "Steps",
    "Hires steps",
    "Size",
    "CFG Scale",
    "Distilled CFG Scale",
    "Shift",
    "Rescale CFG",
    "MaHiRo",
    "Prompt S/R",
    "Prompt order",
    "Sampler",
    "Hires sampler",
    "Schedule type",
    "Checkpoint name",
    "VAE",
    "Clip skip",
    "Denoising",
    "Initial noise multiplier",
    "Extra noise",
    "Hires upscaler",
    "Styles",
    "Face restore",
    "Negative Guidance minimum sigma",
    "Token merging ratio",
    "Token merging ratio high-res",
    "Refiner checkpoint",
    "Refiner switch at",
    "RNG source",
    "批量提示词文件",
]
XYZ_AXIS_CHOICES = XYZ_TXT2IMG_AXIS_CHOICES
XYZ_FILL_VALUES_SYMBOL = "\U0001f4d2"
SCRIPT_UPSCALER_CHOICES = ["None", "Latent", "Lanczos", "Nearest", "ESRGAN"]
CONTROLNET_PREPROCESSOR_SLIDERS = {
    "None": {
        "processor_res": {"visible": False, "value": 512, "minimum": 128, "maximum": 2048, "step": 8, "label": ("Preprocessor resolution", "预处理器分辨率")},
        "threshold_a": {"visible": False, "value": 0.5, "minimum": 0.0, "maximum": 1.0, "step": 0.01, "label": ("Threshold A", "阈值 A")},
        "threshold_b": {"visible": False, "value": 0.5, "minimum": 0.0, "maximum": 1.0, "step": 0.01, "label": ("Threshold B", "阈值 B")},
        "model_visible": True,
        "control_mode_visible": True,
    },
    "invert": {
        "processor_res": {"visible": False, "value": 512, "minimum": 128, "maximum": 2048, "step": 8, "label": ("Preprocessor resolution", "预处理器分辨率")},
        "threshold_a": {"visible": False, "value": 0.5, "minimum": 0.0, "maximum": 1.0, "step": 0.01, "label": ("Threshold A", "阈值 A")},
        "threshold_b": {"visible": False, "value": 0.5, "minimum": 0.0, "maximum": 1.0, "step": 0.01, "label": ("Threshold B", "阈值 B")},
        "model_visible": False,
        "control_mode_visible": False,
    },
    "canny": {
        "processor_res": {"visible": True, "value": 512, "minimum": 128, "maximum": 2048, "step": 8, "label": ("Resolution", "分辨率")},
        "threshold_a": {"visible": True, "value": 100, "minimum": 0, "maximum": 256, "step": 1, "label": ("Low Threshold", "低阈值")},
        "threshold_b": {"visible": True, "value": 200, "minimum": 0, "maximum": 256, "step": 1, "label": ("High Threshold", "高阈值")},
        "model_visible": True,
        "control_mode_visible": True,
    },
    "depth": {
        "processor_res": {"visible": True, "value": 512, "minimum": 128, "maximum": 2048, "step": 8, "label": ("Resolution", "分辨率")},
        "threshold_a": {"visible": False, "value": 0.5, "minimum": 0.0, "maximum": 1.0, "step": 0.01, "label": ("Threshold A", "阈值 A")},
        "threshold_b": {"visible": False, "value": 0.5, "minimum": 0.0, "maximum": 1.0, "step": 0.01, "label": ("Threshold B", "阈值 B")},
        "model_visible": True,
        "control_mode_visible": True,
    },
    "openpose": {
        "processor_res": {"visible": True, "value": 512, "minimum": 128, "maximum": 2048, "step": 8, "label": ("Resolution", "分辨率")},
        "threshold_a": {"visible": False, "value": 0.5, "minimum": 0.0, "maximum": 1.0, "step": 0.01, "label": ("Threshold A", "阈值 A")},
        "threshold_b": {"visible": False, "value": 0.5, "minimum": 0.0, "maximum": 1.0, "step": 0.01, "label": ("Threshold B", "阈值 B")},
        "model_visible": True,
        "control_mode_visible": True,
    },
    "tile": {
        "processor_res": {"visible": False, "value": 512, "minimum": 128, "maximum": 2048, "step": 8, "label": ("Resolution", "分辨率")},
        "threshold_a": {"visible": False, "value": 8.0, "minimum": 3.0, "maximum": 32.0, "step": 1.0, "label": ("Variation", "变化量")},
        "threshold_b": {"visible": False, "value": 1.0, "minimum": 0.0, "maximum": 2.0, "step": 0.01, "label": ("Sharpness", "锐度")},
        "model_visible": True,
        "control_mode_visible": True,
    },
    "inpaint_only": {
        "processor_res": {"visible": False, "value": 512, "minimum": 128, "maximum": 2048, "step": 8, "label": ("Preprocessor resolution", "预处理器分辨率")},
        "threshold_a": {"visible": False, "value": 0.5, "minimum": 0.0, "maximum": 1.0, "step": 0.01, "label": ("Threshold A", "阈值 A")},
        "threshold_b": {"visible": False, "value": 0.5, "minimum": 0.0, "maximum": 1.0, "step": 0.01, "label": ("Threshold B", "阈值 B")},
        "model_visible": True,
        "control_mode_visible": True,
    },
}
IMG2IMG_CANVAS_COPY_TARGETS = [
    ("img2img", "to img2img", "到图生图", "img2img", "图生图"),
    ("sketch", "to sketch", "到草图", "sketch", "草图"),
    ("inpaint", "to inpaint", "到局部重绘", "inpaint", "局部重绘"),
    ("inpaint_sketch", "to inpaint sketch", "到局部重绘草图", "inpaint sketch", "局部重绘草图"),
]
IMG2IMG_CANVAS_COMPOSITE_COPY_MODES = {"sketch", "inpaint_sketch"}
SETTINGS_INPUT_KEYS = [
    "output_dir",
    "outdir_txt2img_samples",
    "outdir_img2img_samples",
    "outdir_extras_samples",
    "outdir_video",
    "outdir_grids",
    "outdir_txt2img_grids",
    "outdir_img2img_grids",
    "outdir_save",
    "outdir_init_images",
    "save_samples",
    "enable_pnginfo",
    "save_txt",
    "save_write_log_csv",
    "save_selected_only",
    "samples_format",
    "samples_filename_pattern",
    "save_images_add_number",
    "save_images_existing_action",
    "grid_save",
    "grid_format",
    "grid_extended_filename",
    "grid_only_if_multiple",
    "grid_prevent_empty_spots",
    "grid_zip_filename_pattern",
    "grid_row_count",
    "grid_text_color",
    "grid_inactive_text_color",
    "grid_background_color",
    "save_init_img",
    "save_before_face_restoration",
    "save_before_highres_fix",
    "save_before_color_correction",
    "save_mask",
    "save_mask_composite",
    "jpeg_quality",
    "webp_lossless",
    "save_large_images_as_jpg",
    "large_image_jpg_file_limit",
    "large_image_jpg_dimension_limit",
    "video_save_frames",
    "video_play_on_finish",
    "video_loop_playback",
    "video_crf",
    "video_preset",
    "video_profile",
    "video_extension",
    "save_to_dirs",
    "grid_save_to_dirs",
    "save_to_dirs_for_ui",
    "directories_filename_pattern",
    "directories_max_prompt_words",
    "control_net_models_path",
    "control_net_unit_count",
    "control_net_model_cache_size",
    "control_net_sync_field_args",
    "control_net_no_detectmap",
    "cross_attention_optimization",
    "persistent_cond_cache",
    "skip_early_cond",
    "s_min_uncond",
    "s_min_uncond_all",
    "token_merging_ratio",
    "token_merging_ratio_img2img",
    "token_merging_ratio_hr",
    "token_merging_stride",
    "token_merging_downsample",
    "token_merging_no_rand",
    "show_refiner",
    "refiner_fast_sd",
    "refiner_use_steps",
    "refiner_lora_replacement",
    "hide_samplers",
    "sd_unet",
    "emphasis",
    "scaling_factor",
    "CLIP_stop_at_last_layers",
    "comma_padding_backtrack",
    "tiling",
    "randn_source",
    "sdxl_crop_top",
    "sdxl_crop_left",
    "sdxl_refiner_low_aesthetic_score",
    "sdxl_refiner_high_aesthetic_score",
    "sdxl_zero_neg",
    "neta_template_positive",
    "neta_template_negative",
    "qwen_vae_resize",
    "klein_no_reference",
    "sd_vae",
    "sd_vae_encode_method",
    "sd_vae_decode_method",
    "inpainting_mask_weight",
    "initial_noise_multiplier",
    "img2img_extra_noise",
    "img2img_color_correction",
    "img2img_fix_steps",
    "img2img_background_color",
    "img2img_sketch_default_brush_color",
    "img2img_inpaint_mask_brush_color",
    "img2img_inpaint_sketch_default_brush_color",
    "img2img_inpaint_mask_high_contrast",
    "img2img_inpaint_mask_scribble_alpha",
    "return_mask",
    "return_mask_composite",
    "img2img_batch_show_results_limit",
    "overlay_inpaint",
    "img2img_autosize",
    "img2img_batch_use_original_name",
    "img2img_inpaint_precise_mask",
    "txt2img_upscale_single_batch",
    "txt2img_upscale_same_seed",
    "hires_button_gallery_insert",
    "hires_insert_index",
    "use_old_hires_fix_width_height",
    "hires_fix_use_firstpass_conds",
    "enable_prompt_comments",
    "save_prompt_comments",
    "forge_canvas_height",
    "forge_canvas_toolbar_always",
    "forge_canvas_consistent_brush",
    "forge_canvas_plain",
    "forge_canvas_plain_color",
    "do_not_show_images",
    "gallery_height",
    "return_grid",
    "js_modal_lightbox",
    "js_modal_lightbox_initially_zoomed",
    "js_modal_lightbox_gamepad",
    "js_modal_lightbox_gamepad_repeat",
    "sd_webui_modal_lightbox_icon_opacity",
    "sd_webui_modal_lightbox_toolbar_opacity",
    "open_dir_button_choice",
    "add_model_name_to_info",
    "add_model_hash_to_info",
    "add_user_name_to_info",
    "add_version_to_infotext",
    "disable_weights_auto_swap",
    "disable_modules_auto_swap",
    "infotext_skip_pasting",
    "infotext_styles",
    "keyedit_precision_attention",
    "keyedit_precision_extra",
    "keyedit_delimiters",
    "keyedit_delimiters_whitespace",
    "keyedit_move",
    "disable_token_counters",
    "include_styles_into_token_counters",
    *TAGCOMPLETE_SETTING_KEYS,
    "extra_options_txt2img",
    "extra_options_img2img",
    "extra_options_cols",
    "extra_options_accordion",
    "show_rescale_cfg",
    "show_mahiro",
    "paste_safe_guard",
    "ctrl_enter_interrupt",
    "quicksettings_accordion",
    "quicksettings_accordion_starts_closed",
    "remove_image_on_hover",
    "forbidden_knowledge",
    "hires_fix_show_sampler",
    "hires_fix_show_prompts",
    "txt2img_settings_accordion",
    "img2img_settings_accordion",
    "interrupt_after_current",
    "live_previews_enable",
    "show_progressbar",
    "live_preview_refresh_period",
    "extra_networks_default_multiplier",
    "extra_networks_add_text_separator",
    "extra_networks_card_width",
    "extra_networks_card_height",
    "localization",
    "quicksettings_list",
    "ui_tab_order",
    "hidden_tabs",
    "ui_reorder_list",
    "gradio_theme",
    "gradio_themes_cache",
    "show_progress_in_title",
    "send_seed",
    "send_cfg",
    "send_size",
    "send_image_info_not_ui",
    "allow_i2i_send_info",
    "enable_reloading_ui_scripts",
    "sd_checkpoint_dropdown_use_short",
    "dimensions_and_batch_together",
    "prompt_box_style",
    "api_enable_requests",
    "api_forbid_local_requests",
    "api_useragent",
    *CALLBACK_PRIORITY_KEYS,
    "profiling_enable",
    "profiling_activities",
    "profiling_record_shapes",
    "profiling_profile_memory",
    "profiling_with_stack",
    "profiling_filename",
    "setting_allocated_vram",
    "res_step",
    "auto_launch_browser",
    "enable_console_prompts",
    "samples_log_stdout",
    "show_warnings",
    "show_gradio_deprecation_warnings",
    "memmon_poll_rate",
    "multiple_tqdm",
    "enable_upscale_progressbar",
    "list_hidden_files",
    "dump_stacks_on_signal",
    "no_spellcheck",
    "face_restoration",
    "face_restoration_model",
    "code_former_weight",
    "face_restoration_unload",
    "postprocessing_enable_in_main_ui",
    "postprocessing_disable_in_extras",
    "postprocessing_operation_order",
    "ESRGAN_tile",
    "ESRGAN_tile_overlap",
    "composite_tiles_on_gpu",
    "upscaler_for_img2img",
    "upscaling_max_images_in_cache",
    "set_scale_by_when_changing_upscaler",
    "prefer_fp16_upscalers",
    "svdq_cpu_offload",
    "svdq_cache_threshold",
    "svdq_attention",
    "svdq_use_pin_memory",
    "svdq_num_blocks_on_gpu",
    *FORGE_COUPLE_SETTING_KEYS,
    *PRESET_SETTING_KEYS,
]
SOURCE_SETTINGS_PAGE_GROUPS: tuple[tuple[str, str, str, tuple[tuple[str, str], ...]], ...] = (
    (
        "ControlNet",
        "ControlNet",
        "forge_neo_settings_control_net",
        (
            ("Extra Path to look for ControlNet Models (e.g. training output directory)", "额外 ControlNet 模型路径（例如训练输出目录）"),
            ("Number of ControlNet Units (requires Reload UI)", "ControlNet 单元数量（需要重载 UI）"),
            ("Number of Models to Cache in Memory (requires Reload UI)", "内存中缓存的模型数量（需要重载 UI）"),
            ("Read ControlNet parameters from Infotext (requires Reload UI)", "从 Infotext 读取 ControlNet 参数（需要重载 UI）"),
            ("Do not append detectmap to output", "不将 detectmap 附加到输出"),
        ),
    ),
    (
        "Optimizations",
        "优化",
        "forge_neo_settings_optimizations",
        (
            ("Cross Attention Optimization", "Cross Attention 优化"),
            ("Persistent Cond Cache", "持久化 Cond 缓存"),
            ("Ignore Negative Prompt during Early Steps", "早期采样忽略负面提示词"),
            ("Skip Negative Prompt during Later Steps", "后期采样跳过负面提示词"),
            ("Token Merging Ratio", "Token Merging 比例"),
            ("Token Merging - Stride", "Token Merging - 步幅"),
            ("Token Merging - Max Downsample", "Token Merging - 最大下采样"),
            ("Token Merging - No Random", "Token Merging - 固定融合区域"),
        ),
    ),
    (
        "Refiner",
        "精修",
        "forge_neo_settings_refiner",
        (
            ("Display the Refiner Accordion", "显示 Refiner 折叠面板"),
            ('Reload "state_dict" Only', '仅重载 "state_dict"'),
            ('Switch based on "steps" instead', '改为基于 "steps" 切换'),
            ("Lora Replacements", "Lora 替换"),
        ),
    ),
    (
        "Sampler Parameters",
        "采样器参数",
        "forge_neo_settings_sampler_parameters",
        (
            ("Hide Samplers", "隐藏采样器"),
        ),
    ),
    (
        "Stable Diffusion",
        "Stable Diffusion",
        "forge_neo_settings_stable_diffusion",
        (
            ("Clip skip", "Clip skip"),
            ("Random number generator source", "随机数生成器来源"),
            ("Emphasis mode", "强调模式"),
        ),
    ),
    (
        "VAE",
        "VAE",
        "forge_neo_settings_vae",
        (
            ("VAE type", "VAE 类型"),
            ("VAE precision", "VAE 精度"),
            ("Automatically find VAE", "自动查找 VAE"),
        ),
    ),
    (
        "img2img",
        "图生图",
        "forge_neo_settings_img2img",
        (
            ("Mask blur", "蒙版模糊"),
            ("Inpaint conditioning mask strength", "局部重绘条件蒙版强度"),
            ("Initial noise multiplier", "初始噪声倍率"),
        ),
    ),
    (
        "txt2img",
        "文生图",
        "forge_neo_settings_txt2img",
        (
            ("Highres fix prompt", "高清修复提示词"),
            ("Highres fix negative prompt", "高清修复反向提示词"),
            ("Batch generation behavior", "批量生成行为"),
        ),
    ),
    (
        "Comments",
        "评论",
        "forge_neo_settings_comments",
        (
            ("Enable comments", "启用评论"),
            ("Comment fields", "评论字段"),
        ),
    ),
    (
        "Forge Canvas",
        "Forge Canvas",
        "forge_neo_settings_forge_canvas",
        (
            ("Canvas toolbar", "画布工具栏"),
            ("Maximum canvas size", "最大画布尺寸"),
            ("Brush defaults", "画笔默认值"),
        ),
    ),
    (
        "Gallery",
        "图库",
        "forge_neo_settings_gallery",
        (
            ("Thumbnail size", "缩略图尺寸"),
            ("Image browser behavior", "图片浏览行为"),
            ("Show generation info", "显示生成信息"),
        ),
    ),
    (
        "Infotext",
        "生成信息",
        "forge_neo_settings_infotext",
        (
            ("Add model hash to generation information", "在生成信息中写入模型哈希"),
            ("Add version to generation information", "在生成信息中写入版本"),
            ("Ignored infotext fields", "忽略的生成信息字段"),
        ),
    ),
    (
        "Prompt Editing",
        "提示词编辑",
        "forge_neo_settings_prompt_editing",
        (
            ("Prompt editing key", "提示词编辑按键"),
            ("Prompt editing timeout", "提示词编辑超时"),
            ("Delimiter behavior", "分隔符行为"),
        ),
    ),
    (
        "Tag Autocomplete",
        "标签补全",
        "forge_neo_settings_tagcomplete",
        (
            ("Tag filename", "标签文件"),
            ("Translation filename", "翻译文件"),
            ("Extra filename", "额外标签文件"),
            ("Chant filename", "长提示文件"),
            ("Completion behavior", "补全行为"),
        ),
    ),
    (
        "Forge Couple",
        "Forge Couple",
        "forge_neo_settings_forge_couple",
        (
            ("Interrupt on Error", "发生错误时中断生成"),
            ("Advanced presets", "Advanced 预设"),
            ("img2img Tile mode", "img2img Tile 模式"),
            ("Advanced dataframe newlines", "Advanced 表格换行符"),
        ),
    ),
    (
        "Settings in UI",
        "UI 内设置",
        "forge_neo_settings_settings_in_ui",
        (
            ("Quicksettings list", "快捷设置列表"),
            ("Hidden UI tabs", "隐藏的 UI 标签"),
            ("Reload UI after applying", "应用后重载 UI"),
        ),
    ),
    (
        "UI Alternatives",
        "UI Alternatives",
        "forge_neo_settings_ui_alternatives",
        (
            ("Alternative layouts", "替代布局"),
            ("Compatibility toggles", "兼容开关"),
        ),
    ),
    (
        "ANIMA",
        "ANIMA",
        "forge_neo_settings_anima",
        (("ANIMA defaults", "ANIMA 默认参数"), ("ANIMA model hints", "ANIMA 模型提示")),
    ),
    (
        "FLUX",
        "FLUX",
        "forge_neo_settings_flux",
        (("FLUX defaults", "FLUX 默认参数"), ("Guidance defaults", "Guidance 默认值")),
    ),
    (
        "KLEIN",
        "KLEIN",
        "forge_neo_settings_klein",
        (("KLEIN defaults", "KLEIN 默认参数"), ("Low-bit defaults", "低位默认参数")),
    ),
    (
        "LUMINA",
        "LUMINA",
        "forge_neo_settings_lumina",
        (("LUMINA defaults", "LUMINA 默认参数"), ("Lumina prompt behavior", "Lumina 提示词行为")),
    ),
    (
        "QWEN",
        "QWEN",
        "forge_neo_settings_qwen",
        (("QWEN defaults", "QWEN 默认参数"), ("Qwen image defaults", "Qwen Image 默认参数")),
    ),
    (
        "SD",
        "SD",
        "forge_neo_settings_sd_arch",
        (("SD defaults", "SD 默认参数"), ("Legacy checkpoint behavior", "传统模型行为")),
    ),
    (
        "XL",
        "XL",
        "forge_neo_settings_xl",
        (("XL defaults", "XL 默认参数"), ("Refiner defaults", "精修默认参数")),
    ),
    (
        "ZIT",
        "ZIT",
        "forge_neo_settings_zit",
        (("ZIT defaults", "ZIT 默认参数"), ("Z-image defaults", "Z-image 默认参数")),
    ),
    (
        "API",
        "API",
        "forge_neo_settings_api",
        (("API authentication", "API 认证"), ("Request limits", "请求限制"), ("API response fields", "API 返回字段")),
    ),
    (
        "Callbacks",
        "回调",
        "forge_neo_settings_callbacks",
        (("Callback order", "回调顺序"), ("Extension callback warnings", "扩展回调警告")),
    ),
    (
        "Profiler",
        "性能分析",
        "forge_neo_settings_profiler",
        (("Profiler enabled", "启用性能分析"), ("Profiler output path", "性能分析输出路径")),
    ),
    (
        "System",
        "系统",
        "forge_neo_settings_system",
        (("Memory monitor", "内存监控"), ("Temporary directory", "临时目录"), ("Startup diagnostics", "启动诊断")),
    ),
    (
        "Face Restoration",
        "面部修复",
        "forge_neo_settings_face_restoration",
        (("Face restoration model", "面部修复模型"), ("CodeFormer weight", "CodeFormer 权重")),
    ),
    (
        "Postprocessing",
        "后处理",
        "forge_neo_settings_postprocessing",
        (("Postprocessing scripts", "后处理脚本"), ("Postprocessing output behavior", "后处理输出行为")),
    ),
    (
        "Upscaling",
        "放大",
        "forge_neo_settings_upscaling",
        (("Default upscaler", "默认放大器"), ("Upscaler model paths", "放大器模型路径"), ("Tile overlap", "分块重叠")),
    ),
    (
        "Nunchaku",
        "Nunchaku",
        "forge_neo_settings_nunchaku",
        (("Nunchaku low-bit options", "Nunchaku 低位选项"), ("SVDQuant options", "SVDQuant 选项")),
    ),
)
GENERATION_PARAMETER_KEYS = frozenset(
    {
        "steps",
        "sampler",
        "scheduler",
        "cfg_scale",
        "seed",
        "size",
        "width",
        "height",
        "model",
        "vae",
        "denoising_strength",
    }
)


@dataclass
class StyleControls:
    editor: gr.Accordion
    dropdown: gr.Dropdown
    edit_select: gr.Dropdown
    prompt: gr.Textbox
    negative_prompt: gr.Textbox
    edit: gr.Button
    close: gr.Button
    close_top: gr.Button
    refresh: gr.Button
    save: gr.Button
    delete: gr.Button
    apply: gr.Button
    materialize: gr.Button
    copy: gr.Button


@dataclass
class StyleGridBridgeControls:
    data: gr.Textbox
    selected: gr.Textbox
    silent: gr.Textbox
    source: gr.Textbox
    apply: gr.Button
    category_order: gr.Textbox


@dataclass
class ExtraNetworkBrowserControls:
    kind: str
    search: gr.Textbox
    dropdown: gr.Dropdown
    cards: gr.HTML
    apply: gr.Button | None = None
    prompt: gr.Button | None = None
    negative_prompt: gr.Button | None = None


def _normalize_ui_language(value: object) -> str:
    raw = str(value or "").strip().lower()
    return "en" if raw.startswith("en") else "cn"


def _runtime_marker_html(lang: object) -> str:
    value = html_lib.escape(_normalize_ui_language(lang), quote=True)
    return f'<div class="forge-neo-hidden-runtime" data-lang="{value}" data-app="forge_neo"></div>'


def _initial_state() -> dict[str, object]:
    return {"__lang": _normalize_ui_language(getattr(args_manager.args, "language", "cn")), "app": "forge_neo"}


def _language_changed(language: object, state: object) -> tuple[dict[str, object], object]:
    lang = _normalize_ui_language(language)
    previous = _normalize_ui_language((state or {}).get("__lang") if isinstance(state, Mapping) else getattr(args_manager.args, "language", "cn"))
    args_manager.args.language = lang
    next_state = dict(state or {}) if isinstance(state, Mapping) else {}
    next_state.update({"__lang": lang, "app": "forge_neo"})
    if lang != previous:
        ensure_server_state().request_restart()
    return next_state, gr.update(value=_runtime_marker_html(lang))


def _label(en: str, cn: str) -> str:
    return en if str(getattr(args_manager.args, "language", "cn")).lower().startswith("en") else cn


def _label_for_lang(lang: object | None, en: str, cn: str) -> str:
    value = getattr(args_manager.args, "language", "cn") if lang is None else lang
    if isinstance(value, Mapping):
        value = value.get("__lang", getattr(args_manager.args, "language", "cn"))
    return en if str(value).lower().startswith("en") else cn


def _localized_value_choices(items: list[tuple[str, str]]) -> list[tuple[str, str]]:
    return [(_label(value, label), value) for value, label in items]


def _choice_list_with_value(choices: list[str], value: object) -> list[str]:
    selected = str(value or "")
    return ([selected] if selected and selected not in choices else []) + list(choices)


def _setting_initial_value(settings_initial: dict[str, object], key: str) -> object:
    return settings_initial.get(key, DEFAULT_SETTINGS[key])


def _tagcomplete_file_choices(suffix: str, value: object) -> list[str]:
    choices = ["None"]
    tags_dir = Path(__file__).resolve().parents[1] / "forge_neo" / "webui" / "extensions" / TAGCOMPLETE_EXTENSION / "tags"
    try:
        choices.extend(sorted(path.name for path in tags_dir.glob(f"*{suffix}") if path.is_file()))
    except Exception:
        pass
    return _choice_list_with_value(choices, value)


def _create_tagcomplete_settings_page(settings_initial: dict[str, object]) -> list[object]:
    components: list[object] = []

    def add(component):
        components.append(component)
        return component

    def value(key: str) -> object:
        return _setting_initial_value(settings_initial, key)

    with gr.Column(elem_classes=["forge-neo-settings-panel", "forge-neo-tagcomplete-settings-panel"]):
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(
                gr.Dropdown(
                    _tagcomplete_file_choices(".csv", value("tac_tagFile")),
                    value=value("tac_tagFile"),
                    label=_label("Tag filename", "标签文件"),
                    elem_id="forge_neo_setting_tac_tagFile",
                )
            )
            add(
                gr.Checkbox(
                    value=value("tac_active"),
                    label=_label("Enable Tag Autocompletion", "启用标签补全"),
                    elem_id="forge_neo_setting_tac_active",
                )
            )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_activeIn.txt2img"), label=_label("Active in txt2img", "文生图启用"), elem_id="forge_neo_setting_tac_activeIn_txt2img"))
            add(gr.Checkbox(value=value("tac_activeIn.img2img"), label=_label("Active in img2img", "图生图启用"), elem_id="forge_neo_setting_tac_activeIn_img2img"))
            add(gr.Checkbox(value=value("tac_activeIn.negativePrompts"), label=_label("Active in negative prompts", "反向提示词启用"), elem_id="forge_neo_setting_tac_activeIn_negativePrompts"))
            add(gr.Checkbox(value=value("tac_activeIn.thirdParty"), label=_label("Active in third party textboxes", "第三方文本框启用"), elem_id="forge_neo_setting_tac_activeIn_thirdParty"))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(
                gr.Textbox(
                    value=value("tac_activeIn.modelList"),
                    label=_label("Black/Whitelist models", "模型黑白名单"),
                    elem_id="forge_neo_setting_tac_activeIn_modelList",
                )
            )
            add(
                gr.Radio(
                    _localized_value_choices([("Blacklist", "黑名单"), ("Whitelist", "白名单")]),
                    value=value("tac_activeIn.modelListMode"),
                    label=_label("Mode to use for model list", "模型名单模式"),
                    elem_id="forge_neo_setting_tac_activeIn_modelListMode",
                )
            )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Slider(1, 200, value=value("tac_maxResults"), step=1, label=_label("Maximum results", "最大候选数"), elem_id="forge_neo_setting_tac_maxResults"))
            add(gr.Slider(10, 1000, value=value("tac_resultStepLength"), step=10, label=_label("How many results to load at once", "每次加载候选数"), elem_id="forge_neo_setting_tac_resultStepLength"))
            add(gr.Slider(0, 2000, value=value("tac_delayTime"), step=25, label=_label("Completion delay (ms)", "补全延迟（毫秒）"), elem_id="forge_neo_setting_tac_delayTime"))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_slidingPopup"), label=_label("Move popup with cursor", "候选框跟随光标"), elem_id="forge_neo_setting_tac_slidingPopup"))
            add(gr.Checkbox(value=value("tac_showAllResults"), label=_label("Show all results", "显示所有候选"), elem_id="forge_neo_setting_tac_showAllResults"))
            add(gr.Checkbox(value=value("tac_useIndexedSearch"), label=_label("Use indexed search", "使用索引搜索"), elem_id="forge_neo_setting_tac_useIndexedSearch"))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_useWildcards"), label=_label("Search for wildcards", "搜索通配符"), elem_id="forge_neo_setting_tac_useWildcards"))
            add(gr.Checkbox(value=value("tac_sortWildcardResults"), label=_label("Sort wildcard contents", "通配符内容排序"), elem_id="forge_neo_setting_tac_sortWildcardResults"))
            add(gr.Checkbox(value=value("tac_skipWildcardRefresh"), label=_label("Skip wildcard refresh", "跳过通配符刷新"), elem_id="forge_neo_setting_tac_skipWildcardRefresh"))
        add(
            gr.Textbox(
                value=value("tac_wildcardExclusionList"),
                label=_label("Wildcard folder exclusion list", "通配符排除目录"),
                elem_id="forge_neo_setting_tac_wildcardExclusionList",
            )
        )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_useEmbeddings"), label=_label("Search for embeddings", "搜索 Embeddings"), elem_id="forge_neo_setting_tac_useEmbeddings"))
            add(gr.Checkbox(value=value("tac_forceRefreshEmbeddings"), label=_label("Force refresh embeddings", "强制刷新 Embeddings"), elem_id="forge_neo_setting_tac_forceRefreshEmbeddings"))
            add(gr.Checkbox(value=value("tac_includeEmbeddingsInNormalResults"), label=_label("Include embeddings in normal results", "普通候选包含 Embeddings"), elem_id="forge_neo_setting_tac_includeEmbeddingsInNormalResults"))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_useLoras"), label=_label("Search for Loras", "搜索 LoRA"), elem_id="forge_neo_setting_tac_useLoras"))
            add(gr.Checkbox(value=value("tac_useLycos"), label=_label("Search for LyCORIS/LoHa", "搜索 LyCORIS/LoHa"), elem_id="forge_neo_setting_tac_useLycos"))
            add(gr.Checkbox(value=value("tac_useLoraPrefixForLycos"), label=_label("Use '<lora:' prefix for LyCORIS", "LyCORIS 使用 '<lora:' 前缀"), elem_id="forge_neo_setting_tac_useLoraPrefixForLycos"))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_showWikiLinks"), label=_label("Show wiki links", "显示 Wiki 链接"), elem_id="forge_neo_setting_tac_showWikiLinks"))
            add(gr.Checkbox(value=value("tac_showExtraNetworkPreviews"), label=_label("Show extra network previews", "显示额外网络预览图"), elem_id="forge_neo_setting_tac_showExtraNetworkPreviews"))
            add(gr.Checkbox(value=value("tac_useStyleVars"), label=_label("Search style names", "搜索样式名"), elem_id="forge_neo_setting_tac_useStyleVars"))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(
                gr.Dropdown(
                    ["Name", "Date Modified (newest first)", "Date Modified (oldest first)"],
                    value=value("tac_modelSortOrder"),
                    label=_label("Model sort order", "模型排序方式"),
                    elem_id="forge_neo_setting_tac_modelSortOrder",
                )
            )
            add(
                gr.Dropdown(
                    ["Logarithmic (weak)", "Logarithmic (strong)", "Usage first"],
                    value=value("tac_frequencyFunction"),
                    label=_label("Frequency sorting function", "频率排序函数"),
                    elem_id="forge_neo_setting_tac_frequencyFunction",
                )
            )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_frequencySort"), label=_label("Sort frequent tags higher", "常用标签优先"), elem_id="forge_neo_setting_tac_frequencySort"))
            add(gr.Slider(0, 100, value=value("tac_frequencyMinCount"), step=1, label=_label("Minimum frequent uses", "常用最小次数"), elem_id="forge_neo_setting_tac_frequencyMinCount"))
            add(gr.Slider(0, 365, value=value("tac_frequencyMaxAge"), step=1, label=_label("Maximum frequent age in days", "常用最长天数"), elem_id="forge_neo_setting_tac_frequencyMaxAge"))
            add(gr.Slider(0, 100, value=value("tac_frequencyRecommendCap"), step=1, label=_label("Maximum recommended tags", "推荐标签最大数量"), elem_id="forge_neo_setting_tac_frequencyRecommendCap"))
        add(gr.Checkbox(value=value("tac_frequencyIncludeAlias"), label=_label("Frequency sorting matches aliases", "频率排序匹配别名"), elem_id="forge_neo_setting_tac_frequencyIncludeAlias"))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_replaceUnderscores"), label=_label("Replace underscores with spaces", "下划线替换为空格"), elem_id="forge_neo_setting_tac_replaceUnderscores"))
            add(gr.Checkbox(value=value("tac_escapeParentheses"), label=_label("Escape parentheses", "转义括号"), elem_id="forge_neo_setting_tac_escapeParentheses"))
            add(gr.Checkbox(value=value("tac_appendComma"), label=_label("Append comma", "追加逗号"), elem_id="forge_neo_setting_tac_appendComma"))
            add(gr.Checkbox(value=value("tac_appendSpace"), label=_label("Append space", "追加空格"), elem_id="forge_neo_setting_tac_appendSpace"))
            add(gr.Checkbox(value=value("tac_alwaysSpaceAtEnd"), label=_label("Always append ending space", "末尾总是追加空格"), elem_id="forge_neo_setting_tac_alwaysSpaceAtEnd"))
        add(
            gr.Textbox(
                value=value("tac_undersocreReplacementExclusionList"),
                label=_label("Underscore replacement exclusion list", "下划线替换排除列表"),
                elem_id="forge_neo_setting_tac_undersocreReplacementExclusionList",
            )
        )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(
                gr.Radio(
                    _localized_value_choices([("Never", "从不"), ("Only user list", "仅用户列表"), ("Always", "总是")]),
                    value=value("tac_modelKeywordCompletion"),
                    label=_label("Add known trigger words for LoRA/LyCO", "加入 LoRA/LyCO 触发词"),
                    elem_id="forge_neo_setting_tac_modelKeywordCompletion",
                )
            )
            add(
                gr.Dropdown(
                    _localized_value_choices(
                        [
                            ("Start of prompt", "提示词开头"),
                            ("End of prompt", "提示词结尾"),
                            ("Before LORA/LyCO", "LoRA/LyCO 前"),
                            ("After LORA/LyCO", "LoRA/LyCO 后"),
                        ]
                    ),
                    value=value("tac_modelKeywordLocation"),
                    label=_label("Trigger keyword location", "触发词位置"),
                    elem_id="forge_neo_setting_tac_modelKeywordLocation",
                )
            )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_modelKeywordCivitai"), label=_label("Fetch trigger words from CivitAI", "从 CivitAI 获取触发词"), elem_id="forge_neo_setting_tac_modelKeywordCivitai"))
            add(gr.Textbox(value=value("tac_civitaiApiKey"), label=_label("CivitAI API key", "CivitAI API key"), type="password", elem_id="forge_neo_setting_tac_civitaiApiKey"))
            add(
                gr.Dropdown(
                    _localized_value_choices(
                        [
                            ("To next folder level", "到下一级目录"),
                            ("To first difference", "到第一个差异"),
                            ("Always fully", "总是完整路径"),
                        ]
                    ),
                    value=value("tac_wildcardCompletionMode"),
                    label=_label("Nested wildcard completion", "嵌套通配符补全"),
                    elem_id="forge_neo_setting_tac_wildcardCompletionMode",
                )
            )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_alias.searchByAlias"), label=_label("Search by alias", "按别名搜索"), elem_id="forge_neo_setting_tac_alias_searchByAlias"))
            add(gr.Checkbox(value=value("tac_alias.onlyShowAlias"), label=_label("Only show alias", "仅显示别名"), elem_id="forge_neo_setting_tac_alias_onlyShowAlias"))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(
                gr.Dropdown(
                    _tagcomplete_file_choices(".csv", value("tac_translation.translationFile")),
                    value=value("tac_translation.translationFile"),
                    label=_label("Translation filename", "翻译文件"),
                    elem_id="forge_neo_setting_tac_translation_translationFile",
                )
            )
            add(
                gr.Dropdown(
                    _tagcomplete_file_choices(".csv", value("tac_extra.extraFile")),
                    value=value("tac_extra.extraFile"),
                    label=_label("Extra filename", "额外标签文件"),
                    elem_id="forge_neo_setting_tac_extra_extraFile",
                )
            )
            add(
                gr.Dropdown(
                    _tagcomplete_file_choices(".json", value("tac_chantFile")),
                    value=value("tac_chantFile"),
                    label=_label("Chant filename", "长提示文件"),
                    elem_id="forge_neo_setting_tac_chantFile",
                )
            )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Checkbox(value=value("tac_translation.oldFormat"), label=_label("Old translation format", "旧翻译格式"), elem_id="forge_neo_setting_tac_translation_oldFormat"))
            add(gr.Checkbox(value=value("tac_translation.searchByTranslation"), label=_label("Search by translation", "按翻译搜索"), elem_id="forge_neo_setting_tac_translation_searchByTranslation"))
            add(gr.Checkbox(value=value("tac_translation.liveTranslation"), label=_label("Live translation", "实时翻译"), elem_id="forge_neo_setting_tac_translation_liveTranslation"))
            add(
                gr.Radio(
                    _localized_value_choices([("Insert before", "插入前面"), ("Insert after", "插入后面")]),
                    value=value("tac_extra.addMode"),
                    label=_label("Extra tags add mode", "额外标签加入方式"),
                    elem_id="forge_neo_setting_tac_extra_addMode",
                )
            )
        add(
            gr.Textbox(
                value=value("tac_keymap"),
                label=_label("Configure Hotkeys JSON", "快捷键 JSON"),
                lines=6,
                elem_id="forge_neo_setting_tac_keymap",
            )
        )
        add(
            gr.Textbox(
                value=value("tac_colormap"),
                label=_label("Configure colors JSON", "颜色 JSON"),
                lines=8,
                elem_id="forge_neo_setting_tac_colormap",
            )
        )

    return components


def _create_forge_couple_settings_page(
    settings_initial: dict[str, object],
    *,
    state_value: Mapping[str, object],
    bridge: dict[str, dict[str, object]] | None = None,
) -> list[object]:
    lang = state_value.get("__lang", getattr(args_manager.args, "language", "cn"))
    label = partial(_label_for_lang, lang)

    with gr.Column(elem_classes=["forge-neo-settings-panel", "forge-neo-forge-couple-settings-panel"]):
        interrupt = gr.Checkbox(
            value=_setting_initial_value(settings_initial, "fc_do_interrupt"),
            label=label("Interrupt on Error", "发生错误时中断生成"),
            info=label(
                "If disabled, Forge Couple will fail silently when it encounters an error.",
                "关闭后，Forge Couple 遇到错误时会静默停用，不中断生成。",
            ),
            elem_id="forge_neo_setting_fc_do_interrupt",
        )
        no_presets = gr.Checkbox(
            value=_setting_initial_value(settings_initial, "fc_no_presets"),
            label=label("Disable the Presets feature in Advanced mode", "禁用 Advanced 模式的预设功能"),
            info=label("Requires Reload UI.", "需要重载 UI。"),
            elem_id="forge_neo_setting_fc_no_presets",
        )
        no_tile = gr.Checkbox(
            value=_setting_initial_value(settings_initial, "fc_no_tile"),
            label=label("Disable the Tile mode in img2img", "禁用 img2img 的 Tile 模式"),
            info=label("Requires Reload UI.", "需要重载 UI。"),
            elem_id="forge_neo_setting_fc_no_tile",
        )
        advanced_newline = gr.Checkbox(
            value=_setting_initial_value(settings_initial, "fc_adv_newline"),
            label=label(
                "Keep newline characters in Advanced mode dataframe",
                "在 Advanced 表格中保留换行符",
            ),
            info=label(
                'Newlines are shown as "\\n" literals.',
                '换行符会显示为“\\n”字面量。',
            ),
            elem_id="forge_neo_setting_fc_adv_newline",
        )

    newline_states = [
        entry["advanced_newline"]
        for entry in (bridge or {}).values()
        if isinstance(entry, dict) and entry.get("advanced_newline") is not None
    ]
    if newline_states:
        advanced_newline.change(
            lambda enabled: [bool(enabled)] * len(newline_states),
            inputs=[advanced_newline],
            outputs=newline_states,
            show_progress=False,
            queue=False,
        )
    return [interrupt, no_presets, no_tile, advanced_newline]


def _create_forge_couple_settings_tab(
    settings_initial: dict[str, object],
    *,
    state_value: Mapping[str, object],
    bridge: dict[str, dict[str, object]] | None = None,
    available: bool | None = None,
) -> list[object]:
    if available is None:
        available = forge_couple_available()
    if not available:
        return [
            gr.State(_setting_initial_value(settings_initial, key))
            for key in FORGE_COUPLE_SETTING_KEYS
        ]

    with gr.Tab(
        _label_for_lang(state_value, "Forge Couple", "Forge Couple"),
        elem_id="forge_neo_settings_forge_couple",
        render_children=True,
    ):
        return _create_forge_couple_settings_page(
            settings_initial,
            state_value=state_value,
            bridge=bridge,
        )


def _create_preset_settings_page(arch: str, settings_initial: dict[str, object]) -> list[object]:
    display_name = PRESET_DISPLAY_NAMES[arch]
    components: list[object] = []
    preset_sampling_choices = sampling_methods(settings_initial, include_hidden=True)
    preset_scheduler_choices = scheduler_types()

    def add(component):
        components.append(component)
        return component

    def key(suffix: str) -> str:
        return f"{arch}_{suffix}"

    def elem(suffix: str) -> str:
        return f"forge_neo_setting_{key(suffix)}"

    def slider_value(suffix: str) -> object:
        return _setting_initial_value(settings_initial, key(suffix))

    with gr.Column(elem_classes=["forge-neo-settings-panel", "forge-neo-preset-settings-panel"]):
        gr.HTML(
            _label(
                f"{display_name} UI Preset defaults. These values are applied when this preset is selected.",
                f"{display_name} UI Preset 默认参数。选择该预设时会使用这些值。",
            ),
            elem_id=f"forge_neo_setting_{arch}_preset_explanation",
            elem_classes=["forge-neo-settings-note"],
        )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(
                gr.Dropdown(
                    _choice_list_with_value(preset_sampling_choices, slider_value("t2i_sampler")),
                    value=slider_value("t2i_sampler"),
                    label=_label("txt2img Sampler", "txt2img 采样器"),
                    elem_id=elem("t2i_sampler"),
                )
            )
            add(
                gr.Dropdown(
                    _choice_list_with_value(preset_scheduler_choices, slider_value("t2i_scheduler")),
                    value=slider_value("t2i_scheduler"),
                    label=_label("txt2img Scheduler", "txt2img 调度器"),
                    elem_id=elem("t2i_scheduler"),
                )
            )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(
                gr.Dropdown(
                    _choice_list_with_value(preset_sampling_choices, slider_value("i2i_sampler")),
                    value=slider_value("i2i_sampler"),
                    label=_label("img2img Sampler", "img2img 采样器"),
                    elem_id=elem("i2i_sampler"),
                )
            )
            add(
                gr.Dropdown(
                    _choice_list_with_value(preset_scheduler_choices, slider_value("i2i_scheduler")),
                    value=slider_value("i2i_scheduler"),
                    label=_label("img2img Scheduler", "img2img 调度器"),
                    elem_id=elem("i2i_scheduler"),
                )
            )
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Slider(0, 150, value=slider_value("t2i_step"), step=1, label=_label("txt2img Steps", "txt2img 步数"), elem_id=elem("t2i_step")))
            add(gr.Slider(0, 150, value=slider_value("t2i_hr_step"), step=1, label=_label("txt2img Hires. Steps", "txt2img Hires. 步数"), elem_id=elem("t2i_hr_step")))
            add(gr.Slider(0, 150, value=slider_value("i2i_step"), step=1, label=_label("img2img Steps", "img2img 步数"), elem_id=elem("i2i_step")))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Slider(0, 24, value=slider_value("t2i_cfg"), step=0.5, label=_label("txt2img CFG", "txt2img CFG"), elem_id=elem("t2i_cfg")))
            add(gr.Slider(0, 24, value=slider_value("t2i_hr_cfg"), step=0.5, label=_label("txt2img Hires. CFG", "txt2img Hires. CFG"), elem_id=elem("t2i_hr_cfg")))
            add(gr.Slider(0, 24, value=slider_value("i2i_cfg"), step=0.5, label=_label("img2img CFG", "img2img CFG"), elem_id=elem("i2i_cfg")))
        if arch in PRESET_SHIFT:
            add(
                gr.Checkbox(
                    value=slider_value("show_shift"),
                    label=_label("Display Shift Slider", "显示 Shift 滑条"),
                    elem_id=elem("show_shift"),
                )
            )
            with gr.Row(elem_classes=["forge-neo-settings-row"]):
                add(gr.Slider(1, 24, value=slider_value("t2i_dcfg"), step=0.5, label=_label("txt2img Shift", "txt2img Shift"), elem_id=elem("t2i_dcfg")))
                add(gr.Slider(1, 24, value=slider_value("t2i_hr_dcfg"), step=0.5, label=_label("txt2img Hires. Shift", "txt2img Hires. Shift"), elem_id=elem("t2i_hr_dcfg")))
                add(gr.Slider(1, 24, value=slider_value("i2i_dcfg"), step=0.5, label=_label("img2img Shift", "img2img Shift"), elem_id=elem("i2i_dcfg")))
        elif arch in PRESET_DISTILL:
            with gr.Row(elem_classes=["forge-neo-settings-row"]):
                add(gr.Slider(1, 24, value=slider_value("t2i_dcfg"), step=0.5, label=_label("txt2img Distilled CFG", "txt2img Distilled CFG"), elem_id=elem("t2i_dcfg")))
                add(gr.Slider(1, 24, value=slider_value("t2i_hr_dcfg"), step=0.5, label=_label("txt2img Hires. Distilled CFG", "txt2img Hires. Distilled CFG"), elem_id=elem("t2i_hr_dcfg")))
                add(gr.Slider(1, 24, value=slider_value("i2i_dcfg"), step=0.5, label=_label("img2img Distilled CFG", "img2img Distilled CFG"), elem_id=elem("i2i_dcfg")))
        frames = PRESET_FRAMES.get(arch, 1)
        batch_max = frames * 15 + 1 if frames > 1 else 8
        batch_step = frames if frames > 1 else 1
        batch_t2i_label = ("txt2img Frames", "txt2img 帧数") if frames > 1 else ("txt2img Batch Size", "txt2img 批量大小")
        batch_i2i_label = ("img2img Frames", "img2img 帧数") if frames > 1 else ("img2img Batch Size", "img2img 批量大小")
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Slider(1, batch_max, value=slider_value("t2i_batch_size"), step=batch_step, label=_label(*batch_t2i_label), elem_id=elem("t2i_batch_size")))
            add(gr.Slider(1, batch_max, value=slider_value("i2i_batch_size"), step=batch_step, label=_label(*batch_i2i_label), elem_id=elem("i2i_batch_size")))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Slider(0, 2048, value=slider_value("t2i_width"), step=64, label=_label("txt2img Width", "txt2img 宽度"), elem_id=elem("t2i_width")))
            add(gr.Slider(0, 2048, value=slider_value("i2i_width"), step=64, label=_label("img2img Width", "img2img 宽度"), elem_id=elem("i2i_width")))
        with gr.Row(elem_classes=["forge-neo-settings-row"]):
            add(gr.Slider(0, 2048, value=slider_value("t2i_height"), step=64, label=_label("txt2img Height", "txt2img 高度"), elem_id=elem("t2i_height")))
            add(gr.Slider(0, 2048, value=slider_value("i2i_height"), step=64, label=_label("img2img Height", "img2img 高度"), elem_id=elem("i2i_height")))

    return components


def _callbacks_default_order_html(category: str, choices: tuple[str, ...]) -> str:
    rows = "".join(f"<li>{html_lib.escape(item)}</li>" for item in choices)
    return (
        '<div class="forge-neo-settings-callback-order">'
        f"<b>{html_lib.escape(_label('Default order:', '默认顺序：'))}</b>"
        f"<ol>{rows}</ol>"
        "</div>"
    )


def _create_callbacks_settings_page(settings_initial: dict[str, object]) -> list[object]:
    components: list[object] = []
    with gr.Column(elem_classes=["forge-neo-settings-panel", "forge-neo-callback-settings-panel"]):
        gr.HTML(
            _label(
                "For categories below, callbacks added to dropdowns happen before others, in order listed.",
                "下面分类中，被加入下拉框的 callbacks 会按所列顺序优先执行。",
            ),
            elem_id="forge_neo_setting_callbacks_explanation",
            elem_classes=["forge-neo-settings-note"],
        )
        for category, choices in CALLBACK_PRIORITY_CHOICES.items():
            key = f"prioritized_callbacks_{category}"
            components.append(
                gr.Dropdown(
                    list(choices),
                    value=_setting_initial_value(settings_initial, key),
                    label=_label(f"{category} callback priority", f"{category} callback 优先级"),
                    info=_label("requires restart", "需要重启"),
                    multiselect=True,
                    elem_id=f"forge_neo_setting_{key}",
                )
            )
            gr.HTML(
                _callbacks_default_order_html(category, choices),
                elem_id=f"forge_neo_setting_{key}_default_order",
                elem_classes=["forge-neo-settings-note", "forge-neo-callback-default-order"],
            )
    return components


def _tool_button(value: str, *, elem_id: str, min_width: int = 40, visible: bool = True) -> gr.Button:
    return gr.Button(
        value,
        elem_id=elem_id,
        elem_classes=["forge-neo-tool-button"],
        min_width=min_width,
        visible=visible,
    )


def _status(state: Mapping[str, object] | None, en: str, cn: str) -> str:
    return t(state, en, cn)


WD14_RATING_TAGS = {"general", "sensitive", "questionable", "explicit"}


def _wd14_model_choices() -> list[str]:
    names = wd14_interrogator_names()
    return names or ["None"]


def _wd14_default_model() -> str:
    names = _wd14_model_choices()
    if "wd14-vit-v2-git" in names:
        return "wd14-vit-v2-git"
    return names[0] if names else "None"


def _wd14_refresh_models_clicked():
    names = _wd14_model_choices()
    return gr.update(choices=names, value=_wd14_default_model())


def _wd14_image_base64(value: object) -> str | None:
    image = _image_from_value(value)
    if image is None:
        return None
    buffer = io.BytesIO()
    image.convert("RGBA").save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _wd14_interrogate_clicked(image, model: str, threshold: float, state):
    encoded = _wd14_image_base64(image)
    if not encoded:
        return "", {}, _output_status_update(_status(state, "Upload an image first.", "请先上传图片。"), visible=True)
    selected_model = str(model or "").strip() or _wd14_default_model()
    if selected_model == "None":
        return "", {}, _output_status_update(_status(state, "No local WD14 model is available.", "没有可用的本地 WD14 模型。"), visible=True)
    try:
        payload = wd14_interrogate_payload({"image": encoded, "model": selected_model, "threshold": threshold})
    except Exception as exc:
        return "", {}, _output_status_update(_status(state, f"WD14 failed: {exc}", f"WD14 执行失败：{exc}"), visible=True)
    caption = payload.get("caption", {}) if isinstance(payload, dict) else {}
    if not isinstance(caption, dict):
        caption = {}
    ratings = {key: caption[key] for key in WD14_RATING_TAGS if key in caption}
    tags = {key: value for key, value in caption.items() if key not in WD14_RATING_TAGS}
    tag_text = ", ".join(tags)
    result = {
        "model": selected_model,
        "threshold": float(threshold or 0.0),
        "ratings": ratings,
        "tags": tags,
        "tag_count": len(tags),
    }
    return tag_text, result, _output_status_update(_status(state, "WD14 tags generated.", "WD14 标签已生成。"), visible=True)


def _create_wd14_tagger_tab(state: gr.State) -> None:
    with gr.Tab(_label("WD14 Tagger", "WD14 标签"), visible=wd14_tagger_available(), elem_id="forge_neo_wd14_tagger_tab"):
        with gr.Row(elem_classes=["forge-neo-pnginfo-workspace", "forge-neo-wd14-workspace"]):
            with gr.Column(scale=1, elem_classes=["forge-neo-pnginfo-source", "forge-neo-wd14-source"]):
                wd14_image = gr.Image(
                    label=_label("Source", "源图"),
                    type="pil",
                    image_mode=None,
                    sources="upload",
                    height="54vh",
                    placeholder=_label("Drop Image Here - or - Click to Upload", "将图像拖放到此处 - 或 - 点击上传"),
                    elem_id="forge_neo_wd14_image",
                    elem_classes=["forge-neo-img2img-input"],
                )
            with gr.Column(scale=1, elem_classes=["forge-neo-pnginfo-panel", "forge-neo-wd14-panel"]):
                with gr.Row(elem_classes=["forge-neo-pnginfo-actions", "forge-neo-wd14-actions"]):
                    wd14_model = gr.Dropdown(
                        _wd14_model_choices(),
                        value=_wd14_default_model(),
                        label=_label("Interrogator", "标注模型"),
                        allow_custom_value=True,
                        elem_id="forge_neo_wd14_model",
                    )
                    wd14_refresh = _tool_button("↻", elem_id="forge_neo_wd14_refresh")
                wd14_threshold = gr.Slider(
                    0.0,
                    1.0,
                    value=0.35,
                    step=0.01,
                    label=_label("Threshold", "阈值"),
                    elem_id="forge_neo_wd14_threshold",
                )
                wd14_run = gr.Button(
                    _label("Interrogate", "生成标签"),
                    variant="primary",
                    elem_id="forge_neo_wd14_interrogate",
                )
                wd14_tags = gr.Textbox(
                    label=_label("Tags", "标签"),
                    lines=8,
                    max_lines=20,
                    elem_id="forge_neo_wd14_tags",
                )
                wd14_scores = gr.JSON(
                    label=_label("Scores", "分数"),
                    value={},
                    elem_id="forge_neo_wd14_scores",
                )
                wd14_status = gr.HTML(
                    "",
                    elem_id="forge_neo_wd14_status",
                    visible=False,
                )
        wd14_refresh.click(
            _wd14_refresh_models_clicked,
            outputs=[wd14_model],
            show_progress=False,
            queue=False,
        )
        wd14_run.click(
            _wd14_interrogate_clicked,
            inputs=[wd14_image, wd14_model, wd14_threshold, state],
            outputs=[wd14_tags, wd14_scores, wd14_status],
        )


def _create_infinite_browsing_tab(state_value: Mapping[str, object]) -> None:
    with gr.Tab(_label("Infinite Browsing", "无边图像浏览"), visible=infinite_browsing_available(), elem_id="forge_neo_infinite_browsing_tab"):
        gr.HTML(
            infinite_browsing_iframe_html(state_value),
            elem_id="forge_neo_infinite_browsing_html",
            elem_classes=["forge-neo-infinite-browsing-html"],
        )


def _create_camera_angle_selector_tab(state_value: Mapping[str, object]) -> None:
    with gr.Tab(_label("Camera Angle Selector", "相机角度选择器"), visible=camera_angle_selector_available(), elem_id="forge_neo_camera_angle_selector_tab"):
        gr.HTML(
            camera_angle_selector_iframe_html(state_value),
            elem_id="forge_neo_camera_angle_selector_html",
            elem_classes=["forge-neo-camera-angle-selector-html"],
        )


def _civitai_helper_source_i18n() -> dict[str, str]:
    return {
        "Civitai Helper": "Civitai 助手",
        "Civitai Helper Browser": "Civitai 浏览器助手",
        "### Scan Models for Civitai": "### 扫描并匹配 Civitai 模型记录",
        "Model Types": "模型种类",
        "Move models into category folders": "将模型移动到分类文件夹",
        "Replace Old Metadata Formats*": "替换旧版元数据格式*",
        "* [<a href=https://github.com/zixaphir/Stable-Diffusion-Webui-Civitai-Helper/wiki/Metadata-Format-Changes>wiki</a>] Do not use this option if you have made changes with the metadata editor without backing up your data!!<br><br>": "* [<a href=https://github.com/zixaphir/Stable-Diffusion-Webui-Civitai-Helper/wiki/Metadata-Format-Changes>wiki</a>] 如果你用元数据编辑器修改过模型信息且还没有备份，请勿使用此选项！！<br><br>",
        "Scan": "扫描",
        "Scanning takes time, just wait. Check console log for details": "扫描需要一些时间，请等待。详细信息见控制台日志。",
        "### Get Model Info from Civitai by URL": "### 从 Civitai 链接获取模型信息",
        "Use this when scanning can not find a local model on civitai": "无法通过扫描匹配本地模型信息时使用此功能。",
        "Model Type": "模型种类",
        "Only Show Models have no Info": "只显示缺少信息的模型",
        "Model": "模型",
        "Civitai URL": "Civitai 链接",
        "Get Model Info from Civitai": "从 Civitai 获取模型信息",
        "### Download Model": "### 下载模型",
        "Single": "单次处理",
        "Batch Download": "批量下载",
        "**1. Add URL and retrieve Model Info**": "**1. 添加链接并获取模型信息**",
        "Model URL or Model ID": "模型链接或模型 ID",
        "Get Model Info by Civitai Url": "通过 Civitai 链接获取模型信息",
        "**2. Pick Subfolder and Model Version**": "**2. 选择子文件夹和模型版本**",
        "Model Name": "模型名称",
        "Base Model": "基础模型",
        "Model Version": "模型版本",
        "Sub-folder": "子文件夹",
        "Duplicate File Behavior": "重复文件行为",
        "**Files**": "**文件**",
        "Unhandled Files (Files that we don't know what to do with but will still downloaded with \"Download All Files\")": "未识别文件（启用“下载全部文件”时仍会下载这些文件）",
        "Download All Files": "下载全部文件",
        "Preview Image": "预览图像",
        "Rename Model": "重命名模型",
        "Model extension": "模型扩展名",
        "3. Download Model": "3. 下载模型",
        "Check Console log for Downloading Status": "下载状态见控制台日志。",
        "Add to Batch Form": "添加到批量下载",
        "### Add to Batch": "### 添加到批量下载",
        "Model URL": "模型链接",
        "Detect Model Type": "检测模型种类",
        "All Files": "全部文件",
        "All Versions": "全部版本",
        "Subfolder": "子文件夹",
        "Add to Batch": "添加到批量列表",
        "Models to download": "待下载模型",
        "Supports Model page URLs and Model Version page URLs.": "支持模型页面链接和模型版本页面链接。",
        "Download Models": "下载模型",
        "Additional info will be printed to the webui console output.": "更多信息会输出到 WebUI 控制台。",
        "### Scan for duplicate models": "### 扫描重复模型",
        "Use Hash from Metadata (May have false-positives but can be useful if you've pruned models)": "使用元数据中的 Hash（可能有误报，但对裁剪过的模型有帮助）",
        "### Check models' new version": "### 检查模型新版本",
        "Check New Version from Civitai": "从 Civitai 检查新版本",
        "It takes time, just wait. Check console log for details": "检查需要一些时间，请等待。详细信息见控制台日志。",
        "Download Model's new version": "下载模型新版本",
        "# Browse and Search Civitai": "# 浏览和搜索 Civitai",
        "Tip: You can save your choices as defaults by selecting the options you'd like and then going to `Settings -> Other -> Defaults` and hitting `Apply`!": "提示：选择想要的选项后，可以到 `设置 -> 其他 -> 默认值` 点击 `应用` 保存为默认值。",
        "Query": "关键词",
        "Tag": "标签",
        "Model Age": "模型时间",
        "Sort By": "排序方式",
        "Base Model": "基础模型",
        "Allow NSFW Models": "允许 NSFW 模型",
        "Search": "搜索",
        "Previous Page": "上一页",
        "Next Page": "下一页",
        "Search Results": "搜索结果",
    }


def _create_civitai_helper_tabs(
    txt2img_prompt: gr.Textbox,
    txt2img_negative_prompt: gr.Textbox,
    img2img_prompt: gr.Textbox,
    img2img_negative_prompt: gr.Textbox,
    state_value: Mapping[str, object],
) -> None:
    render_source_extension_tab(
        "Stable-Diffusion-Webui-Civitai-Helper",
        "scripts/civitai_helper.py",
        "on_ui_tabs",
        visible=civitai_helper_available(),
        require_flag=False,
        prompt_components={
            "txt2img_prompt": txt2img_prompt,
            "txt2img_negative_prompt": txt2img_negative_prompt,
            "img2img_prompt": img2img_prompt,
            "img2img_negative_prompt": img2img_negative_prompt,
            "lang": state_value.get("__lang", getattr(args_manager.args, "language", "cn")),
            "source_i18n": _civitai_helper_source_i18n(),
        },
    )


def _aesthetic_enhancement_refresh_clicked():
    return (
        aesthetic_summary_html(),
        aesthetic_gallery_values("artists"),
        aesthetic_gallery_values("composition"),
        aesthetic_gallery_values("lighting"),
    )


def _aesthetic_analysis_mode_changed(mode):
    is_video = str(mode or "image") == "video"
    return (
        gr.update(visible=not is_video),
        gr.update(visible=is_video),
        gr.update(visible=is_video),
        gr.update(visible=False, value=[]),
        "video" if is_video else "image",
    )


def _aesthetic_qwen_connection_clicked():
    status = aesthetic_qwen_connection_status()
    return str(status.get("message") or "")


def _aesthetic_qwen_analyze_clicked(model, mode, analysis_type, image, video, frame_interval):
    selected_mode = str(mode or "").strip().lower()
    if selected_mode not in {"image", "video"}:
        selected_mode = "video" if video else "image"
    result = aesthetic_qwen_analyze(
        model=model,
        mode=selected_mode,
        analysis_type=analysis_type,
        image=image,
        video=video,
        frame_interval=frame_interval,
    )
    message = str(result.get("message") or "")
    analysis = str(result.get("analysis") or "")
    frames = result.get("frames") or []
    text = analysis if bool(result.get("ok")) else "\n\n".join(part for part in [message, analysis] if part)
    return text, gr.update(value=frames, visible=bool(frames))


def _create_aesthetic_enhancement_tab(state_value: Mapping[str, object]) -> None:
    if render_source_extension_tab(
        "sd-webui-AestheticEnhancement",
        "scripts/main.py",
        "MultiModal_tab",
        visible=aesthetic_enhancement_available(),
    ):
        return

    with gr.Tab(
        _label("Aesthetic Enhancement", "🎨 美学提升"),
        visible=aesthetic_enhancement_available(),
        elem_id="forge_neo_aesthetic_enhancement_tab",
    ):
        aesthetic_summary = gr.HTML(
            aesthetic_summary_html(),
            elem_id="forge_neo_aesthetic_enhancement_summary",
        )
        with gr.Tabs(elem_id="forge_neo_aesthetic_enhancement_views"):
            with gr.Tab(_label("Artists", "画师百科"), elem_id="forge_neo_aesthetic_artists_tab"):
                aesthetic_artists = gr.Gallery(
                    aesthetic_gallery_values("artists"),
                    label=_label("Artists", "画师百科"),
                    columns=4,
                    height=620,
                    interactive=False,
                    elem_id="forge_neo_aesthetic_artists_gallery",
                )
            with gr.Tab(_label("Composition", "构图技巧"), elem_id="forge_neo_aesthetic_composition_tab"):
                aesthetic_composition = gr.Gallery(
                    aesthetic_gallery_values("composition"),
                    label=_label("Composition", "构图技巧"),
                    columns=4,
                    height=620,
                    interactive=False,
                    elem_id="forge_neo_aesthetic_composition_gallery",
                )
            with gr.Tab(_label("Lighting", "打光技巧"), elem_id="forge_neo_aesthetic_lighting_tab"):
                aesthetic_lighting = gr.Gallery(
                    aesthetic_gallery_values("lighting"),
                    label=_label("Lighting", "打光技巧"),
                    columns=4,
                    height=620,
                    interactive=False,
                    elem_id="forge_neo_aesthetic_lighting_gallery",
                )
            with gr.Tab(_label("AI Analysis", "AI 智能分析"), elem_id="forge_neo_aesthetic_ai_analysis_tab"):
                qwen_defaults = aesthetic_qwen_analysis_defaults()
                with gr.Row(elem_classes=["forge-neo-aesthetic-analysis-layout"]):
                    with gr.Column(scale=1, elem_classes=["forge-neo-aesthetic-analysis-inputs"]):
                        aesthetic_qwen_connection = gr.Textbox(
                            label=_label("Ollama status", "Ollama 状态"),
                            value=_label("Click test to check Ollama.", "点击测试检查 Ollama。"),
                            lines=4,
                            interactive=False,
                            elem_id="forge_neo_aesthetic_qwen_connection",
                        )
                        aesthetic_qwen_test = gr.Button(
                            _label("Test Ollama", "测试 Ollama"),
                            elem_id="forge_neo_aesthetic_qwen_test",
                        )
                        aesthetic_qwen_model = gr.Dropdown(
                            qwen_defaults["models"],
                            value=qwen_defaults["default_model"],
                            label=_label("Qwen model", "Qwen 模型"),
                            elem_id="forge_neo_aesthetic_qwen_model",
                        )
                        aesthetic_qwen_image = gr.Image(
                            type="filepath",
                            label=_label("Image", "图片"),
                            height=300,
                            elem_id="forge_neo_aesthetic_qwen_image",
                        )
                        aesthetic_qwen_video = gr.Video(
                            label=_label("Video", "视频"),
                            height=300,
                            visible=False,
                            elem_id="forge_neo_aesthetic_qwen_video",
                        )
                        aesthetic_qwen_frame_interval = gr.Slider(
                            0,
                            120,
                            value=int(qwen_defaults["default_frame_interval"]),
                            step=1,
                            label=_label("Frame interval", "抽帧间隔"),
                            visible=False,
                            elem_id="forge_neo_aesthetic_qwen_frame_interval",
                        )
                        aesthetic_qwen_mode = gr.Dropdown(
                            [(_label("Image", "图片"), "image"), (_label("Video", "视频"), "video")],
                            value=qwen_defaults["default_mode"],
                            label=_label("Input mode", "输入模式"),
                            elem_id="forge_neo_aesthetic_qwen_mode",
                        )
                        aesthetic_qwen_mode_state = gr.Textbox(
                            value=qwen_defaults["default_mode"],
                            visible=False,
                            elem_id="forge_neo_aesthetic_qwen_mode_state",
                        )
                        aesthetic_qwen_type = gr.Radio(
                            [
                                (_label("Comprehensive", "综合分析"), "comprehensive"),
                                (_label("Composition", "构图分析"), "composition"),
                                (_label("Lighting", "灯光分析"), "lighting"),
                                (_label("Shot", "分镜分析"), "shot"),
                            ],
                            value=qwen_defaults["default_analysis_type"],
                            label=_label("Analysis type", "分析类型"),
                            elem_id="forge_neo_aesthetic_qwen_type",
                        )
                        aesthetic_qwen_run = gr.Button(
                            _label("Analyze", "开始分析"),
                            variant="primary",
                            elem_id="forge_neo_aesthetic_qwen_analyze",
                        )
                    with gr.Column(scale=2, elem_classes=["forge-neo-aesthetic-analysis-output"]):
                        aesthetic_qwen_output = gr.Textbox(
                            label=_label("Analysis report", "分析报告"),
                            lines=24,
                            elem_id="forge_neo_aesthetic_qwen_output",
                        )
                        aesthetic_qwen_frames = gr.Gallery(
                            label=_label("Extracted frames", "提取帧预览"),
                            columns=4,
                            height=260,
                            visible=False,
                            elem_id="forge_neo_aesthetic_qwen_frames",
                        )
        aesthetic_refresh = gr.Button(
            _label("Refresh", "刷新"),
            elem_id="forge_neo_aesthetic_refresh",
        )
        aesthetic_refresh.click(
            _aesthetic_enhancement_refresh_clicked,
            outputs=[aesthetic_summary, aesthetic_artists, aesthetic_composition, aesthetic_lighting],
            show_progress=False,
            queue=False,
        )
        aesthetic_qwen_test.click(
            _aesthetic_qwen_connection_clicked,
            outputs=[aesthetic_qwen_connection],
            show_progress=False,
            queue=False,
        )
        aesthetic_qwen_mode.change(
            _aesthetic_analysis_mode_changed,
            inputs=[aesthetic_qwen_mode],
            outputs=[
                aesthetic_qwen_image,
                aesthetic_qwen_video,
                aesthetic_qwen_frame_interval,
                aesthetic_qwen_frames,
                aesthetic_qwen_mode_state,
            ],
            show_progress=False,
            queue=False,
        )
        aesthetic_qwen_run.click(
            _aesthetic_qwen_analyze_clicked,
            inputs=[
                aesthetic_qwen_model,
                aesthetic_qwen_mode_state,
                aesthetic_qwen_type,
                aesthetic_qwen_image,
                aesthetic_qwen_video,
                aesthetic_qwen_frame_interval,
            ],
            outputs=[aesthetic_qwen_output, aesthetic_qwen_frames],
        )


def _multimodal_media_status_html(message: str, *, ok: bool = True) -> str:
    class_name = "ok" if ok else "error"
    return f'<div class="forge-neo-multimodal-media-status {class_name}">{html_lib.escape(str(message or ""))}</div>'


def _multimodal_media_summary_html() -> str:
    status = multimodal_media_status()
    dependencies = status.get("dependencies") or {}
    submodules = status.get("submodules") or {}
    rows = [
        ("Source", status.get("source_available")),
        ("OpenCV", dependencies.get("cv2")),
        ("FFmpeg", dependencies.get("ffmpeg")),
        ("DashScope", dependencies.get("dashscope")),
        ("Qwen3-TTS", submodules.get("qwen3_tts")),
        ("LatentSync", submodules.get("latent_sync")),
        ("IndexTTS", submodules.get("index_tts")),
    ]
    items = "".join(
        f"<span><strong>{html_lib.escape(str(label))}</strong>{html_lib.escape(str(value))}</span>"
        for label, value in rows
    )
    return f'<div class="forge-neo-multimodal-media-summary">{items}</div>'


def _multimodal_media_header_markdown() -> str:
    return _label(
        """## 🎬 Multimodal Media - Media Tools
Speech synthesis, video generation, and video analysis tools""",
        """## 🎬 Multimodal Media - 多媒体处理工具
提供语音合成、视频生成和视频分析功能""",
    )


ACE_STEP_EXAMPLE_PROMPT = """E minor (E小调)
演唱：成熟女声
曲风定位：古风武侠 / 江湖抒情
曲风：大气悲壮 + 温柔婉转，侠气与柔情交织
节奏：中速偏缓，4/4 拍，起承转合分明，副歌深情有力
乐器：古筝、竹笛、二胡、琵琶、弦乐铺底、轻微鼓点、古风打击乐（木鱼、铜铃），间奏加入箫声"""

ACE_STEP_EXAMPLE_LYRICS = """[第一节]
一剑霜寒照九州
半生风雨踏清秋
马蹄踏碎红尘路
恩怨未休
情字难收
[第二节]
青山隐隐水悠悠
红袖添香为谁留
江湖纵有千般险
一念温柔
便胜所有
[副歌]
刀光剑影
藏不住眼底温柔
策马天涯
忘不了你回眸
[结尾]
一剑 一酒 一知己
一生 一世 一双人"""


def _multimodal_media_detail(result: Mapping[str, object]) -> str:
    paths = [str(path) for path in (result.get("frames") or [])]
    if result.get("audio"):
        paths.append(str(result.get("audio")))
    if result.get("video"):
        paths.append(str(result.get("video")))
    lines = [str(result.get("message") or "")]
    if result.get("output_dir"):
        lines.append(f"Output: {result.get('output_dir')}")
    lines.extend(paths)
    return "\n".join(line for line in lines if line).strip()


def _multimodal_media_extract_clicked(video, quality, mode):
    result = extract_video_frames(video, quality, mode)
    return result.get("frames") or [], result.get("frames") or [], _multimodal_media_detail(result), _multimodal_media_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _multimodal_media_tts_model_changed(model_choice):
    model = str(model_choice or "CustomVoice")
    return (
        gr.update(visible=model == "Base"),
        gr.update(visible=model == "CustomVoice"),
        gr.update(visible=model == "VoiceDesign"),
    )


def _multimodal_media_tts_clicked(
    text,
    language,
    model_choice,
    ref_audio,
    ref_text,
    auto_transcribe,
    speaker,
    custom_instruct,
    design_instruct,
    output_dir,
    use_batch_mode,
):
    result = qwen3_tts_generate(
        text=text,
        language=language,
        model_choice=model_choice,
        ref_audio=ref_audio,
        ref_text=ref_text,
        auto_transcribe=auto_transcribe,
        speaker=speaker,
        custom_instruct=custom_instruct,
        design_instruct=design_instruct,
        output_dir=output_dir,
        use_batch_mode=use_batch_mode,
    )
    return result.get("audio"), _multimodal_media_detail(result), _multimodal_media_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _multimodal_media_qwen_video_mode_changed(mode):
    actual_mode = str(mode or "wan26_i2v")
    is_i2v = actual_mode in {"wan26_i2v", "wan25_i2v"}
    is_kf2v = actual_mode == "wan22_kf2v"
    is_t2v = actual_mode == "wan25_t2v"
    defaults = qwen_video_defaults()
    resolution_choices = defaults["t2v_resolutions"] if is_t2v else defaults["resolutions"]
    resolution_value = defaults["default_t2v_resolution"] if is_t2v else defaults["default_resolution"]
    return (
        gr.update(visible=is_i2v),
        gr.update(visible=is_kf2v),
        gr.update(visible=is_t2v),
        gr.update(choices=resolution_choices, value=resolution_value),
        gr.update(visible=not is_kf2v),
        gr.update(visible=not is_kf2v),
        gr.update(visible=actual_mode == "wan26_i2v"),
    )


def _multimodal_media_qwen_video_set_key_clicked(api_key):
    result = qwen_video_set_api_key(api_key)
    return _multimodal_media_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _multimodal_media_qwen_video_generate_clicked(
    mode,
    prompt,
    image,
    first_frame,
    last_frame,
    t2v_audio,
    i2v_audio,
    resolution,
    duration,
    audio_enabled,
    shot_type,
):
    audio = t2v_audio if str(mode or "") == "wan25_t2v" else i2v_audio
    result = qwen_video_generate(
        mode=mode,
        prompt=prompt,
        image=image,
        first_frame=first_frame,
        last_frame=last_frame,
        audio=audio,
        resolution=resolution,
        duration=duration,
        audio_enabled=audio_enabled,
        shot_type=shot_type,
    )
    return result.get("message") or "", result.get("video_html") or "", _multimodal_media_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _multimodal_media_qwen_video_query_clicked(task_id):
    result = qwen_video_query(task_id)
    return result.get("message") or "", _multimodal_media_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _multimodal_media_qwen_video_recent_clicked():
    return qwen_video_recent_tasks()


def _multimodal_media_latent_sync_clicked(video, audio, guidance_scale, inference_steps, seed, model_name):
    result = latent_sync_generate(
        video=video,
        audio=audio,
        guidance_scale=guidance_scale,
        inference_steps=inference_steps,
        seed=seed,
        model_name=model_name,
    )
    return result.get("video"), _multimodal_media_detail(result), _multimodal_media_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _multimodal_media_ace_step_analyze_clicked(audio, model_version):
    result = ace_step_analyze(audio, model_version)
    values = result.get("values") or {}
    defaults = ace_step_defaults()
    return (
        _multimodal_media_status_html(result.get("message", ""), ok=bool(result.get("ok"))),
        values.get("prompt", ""),
        values.get("lyrics", ""),
        values.get("bpm", defaults["default_bpm"]),
        values.get("duration", defaults["default_duration"]),
        values.get("key_scale", defaults["default_key_scale"]),
        values.get("language", defaults["default_language"]),
        values.get("time_signature", defaults["default_time_signature"]),
    )


def _multimodal_media_ace_step_generate_clicked(prompt, lyrics, duration, infer_steps, guidance_scale, model_version, bpm, key_scale, time_signature, vocal_language):
    result = ace_step_generate(
        prompt=prompt,
        lyrics=lyrics,
        duration=duration,
        infer_steps=infer_steps,
        guidance_scale=guidance_scale,
        model_version=model_version,
        bpm=bpm,
        key_scale=key_scale,
        time_signature=time_signature,
        vocal_language=vocal_language,
    )
    return result.get("audio"), _multimodal_media_detail(result), _multimodal_media_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _multimodal_media_index_tts_mode_changed(mode):
    actual_mode = str(mode or "与音色参考音频相同")
    return (
        gr.update(visible=actual_mode == "使用情感参考音频"),
        gr.update(visible=actual_mode == "使用情感向量控制"),
        gr.update(visible=actual_mode == "使用情感描述文本控制"),
    )


def _multimodal_media_index_tts_generate_clicked(
    text,
    language,
    prompt_audio,
    emotion_mode,
    emotion_reference_audio,
    emotion_weight,
    emotion_text,
    vec1,
    vec2,
    vec3,
    vec4,
    vec5,
    vec6,
    vec7,
    vec8,
    do_sample,
    top_p,
    top_k,
    temperature,
    length_penalty,
    num_beams,
    repetition_penalty,
    max_mel_tokens,
    max_text_tokens_per_segment,
):
    result = index_tts_generate(
        text=text,
        language=language,
        prompt_audio=prompt_audio,
        emotion_mode=emotion_mode,
        emotion_reference_audio=emotion_reference_audio,
        emotion_weight=emotion_weight,
        emotion_text=emotion_text,
        vectors=[vec1, vec2, vec3, vec4, vec5, vec6, vec7, vec8],
        do_sample=do_sample,
        top_p=top_p,
        top_k=top_k,
        temperature=temperature,
        length_penalty=length_penalty,
        num_beams=num_beams,
        repetition_penalty=repetition_penalty,
        max_mel_tokens=max_mel_tokens,
        max_text_tokens_per_segment=max_text_tokens_per_segment,
    )
    return result.get("audio"), _multimodal_media_detail(result), _multimodal_media_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _create_multimodal_media_tab(state_value: Mapping[str, object]) -> None:
    defaults = multimodal_media_defaults()
    qwen_tts = qwen3_tts_defaults()
    qwen_video = qwen_video_defaults()
    latent_sync = latent_sync_defaults()
    ace_step = ace_step_defaults()
    index_tts = index_tts_defaults()
    with gr.Tab(
        _label("Multimodal Media", "多媒体处理"),
        visible=multimodal_media_available(),
        elem_id="forge_neo_multimodal_media_tab",
    ):
        gr.Markdown(
            _multimodal_media_header_markdown(),
            elem_id="forge_neo_multimodal_media_header",
            elem_classes=["forge-neo-multimodal-media-header"],
        )
        with gr.Tabs(elem_id="forge_neo_multimodal_media_tools"):
            with gr.Tab(_label("1. Qwen3-TTS", "1. Qwen3-TTS 语音合成"), elem_id="forge_neo_multimodal_qwen3_tts_tab"):
                with gr.Row(elem_classes=["forge-neo-multimodal-media-layout"]):
                    with gr.Column(scale=1, elem_classes=["forge-neo-multimodal-media-inputs"]):
                        tts_model = gr.Dropdown(
                            choices=[(item["label"], item["value"]) for item in qwen_tts["models"]],
                            value=str(qwen_tts["default_model"]),
                            label=_label("Model", "模型"),
                            elem_id="forge_neo_multimodal_qwen3_tts_model",
                        )
                        with gr.Group(visible=False, elem_id="forge_neo_multimodal_qwen3_tts_base_group") as tts_base_group:
                            tts_ref_audio = gr.Audio(
                                label=_label("Reference audio", "参考音频"),
                                type="filepath",
                                elem_id="forge_neo_multimodal_qwen3_tts_ref_audio",
                            )
                            tts_auto_transcribe = gr.Checkbox(
                                value=True,
                                label=_label("Auto transcribe reference", "自动识别参考文本"),
                                elem_id="forge_neo_multimodal_qwen3_tts_auto_transcribe",
                            )
                            tts_ref_text = gr.Textbox(
                                label=_label("Reference text", "参考文本"),
                                lines=2,
                                elem_id="forge_neo_multimodal_qwen3_tts_ref_text",
                            )
                        with gr.Group(visible=True, elem_id="forge_neo_multimodal_qwen3_tts_custom_group") as tts_custom_group:
                            tts_speaker = gr.Dropdown(
                                choices=[(item["label"], item["value"]) for item in qwen_tts["speakers"]],
                                value=str(qwen_tts["default_speaker"]),
                                label=_label("Speaker", "说话人"),
                                elem_id="forge_neo_multimodal_qwen3_tts_speaker",
                            )
                            tts_custom_instruct = gr.Textbox(
                                label=_label("Speaking instruction", "语气指令"),
                                lines=2,
                                elem_id="forge_neo_multimodal_qwen3_tts_custom_instruct",
                            )
                        with gr.Group(visible=False, elem_id="forge_neo_multimodal_qwen3_tts_design_group") as tts_design_group:
                            tts_design_instruct = gr.Textbox(
                                value=str(qwen_tts["default_voice_design"]),
                                label=_label("Voice description", "音色描述"),
                                lines=3,
                                elem_id="forge_neo_multimodal_qwen3_tts_design_instruct",
                            )
                        tts_text = gr.Textbox(
                            label=_label("Text", "合成文本"),
                            lines=5,
                            max_lines=8,
                            elem_id="forge_neo_multimodal_qwen3_tts_text",
                        )
                        with gr.Row():
                            tts_language = gr.Dropdown(
                                choices=[(item["label"], item["value"]) for item in qwen_tts["languages"]],
                                value=str(qwen_tts["default_language"]),
                                label=_label("Language", "语言"),
                                elem_id="forge_neo_multimodal_qwen3_tts_language",
                            )
                            tts_batch = gr.Checkbox(
                                value=False,
                                label=_label("Batch mode", "批量模式"),
                                elem_id="forge_neo_multimodal_qwen3_tts_batch",
                            )
                        tts_output_dir = gr.Textbox(
                            value=str(qwen_tts["output_dir"]),
                            label=_label("Output directory", "输出目录"),
                            elem_id="forge_neo_multimodal_qwen3_tts_output_dir",
                        )
                        tts_generate = gr.Button(
                            _label("Generate speech", "生成语音"),
                            variant="primary",
                            elem_id="forge_neo_multimodal_qwen3_tts_generate",
                        )
                    with gr.Column(scale=1, elem_classes=["forge-neo-multimodal-media-output"]):
                        tts_audio = gr.Audio(
                            label=_label("Generated audio", "生成音频"),
                            type="filepath",
                            elem_id="forge_neo_multimodal_qwen3_tts_audio",
                        )
                        tts_result = gr.Textbox(
                            label=_label("Result", "处理结果"),
                            lines=8,
                            elem_id="forge_neo_multimodal_qwen3_tts_result",
                        )
                        tts_status = gr.HTML(
                            _multimodal_media_status_html("Ready."),
                            elem_id="forge_neo_multimodal_qwen3_tts_status",
                        )
                tts_model.change(
                    _multimodal_media_tts_model_changed,
                    inputs=[tts_model],
                    outputs=[tts_base_group, tts_custom_group, tts_design_group],
                    queue=False,
                    show_progress=False,
                )
                tts_generate.click(
                    _multimodal_media_tts_clicked,
                    inputs=[
                        tts_text,
                        tts_language,
                        tts_model,
                        tts_ref_audio,
                        tts_ref_text,
                        tts_auto_transcribe,
                        tts_speaker,
                        tts_custom_instruct,
                        tts_design_instruct,
                        tts_output_dir,
                        tts_batch,
                    ],
                    outputs=[tts_audio, tts_result, tts_status],
                )
            with gr.Tab(_label("4. Qwen Video", "4. Qwen Video 万相视频生成"), elem_id="forge_neo_multimodal_qwen_video_tab"):
                with gr.Row(elem_classes=["forge-neo-multimodal-media-layout"]):
                    with gr.Column(scale=1, elem_classes=["forge-neo-multimodal-media-inputs"]):
                        qv_api_key = gr.Textbox(
                            label=_label("DashScope API key", "DashScope API Key"),
                            type="password",
                            elem_id="forge_neo_multimodal_qwen_video_api_key",
                        )
                        qv_set_key = gr.Button(
                            _label("Set API key", "设置 API Key"),
                            elem_id="forge_neo_multimodal_qwen_video_set_key",
                        )
                        qv_mode = gr.Dropdown(
                            choices=[(item["label"], item["value"]) for item in qwen_video["modes"]],
                            value=str(qwen_video["default_mode"]),
                            label=_label("Mode", "模式"),
                            elem_id="forge_neo_multimodal_qwen_video_mode",
                        )
                        qv_prompt = gr.Textbox(
                            label=_label("Prompt", "提示词"),
                            lines=4,
                            max_lines=6,
                            elem_id="forge_neo_multimodal_qwen_video_prompt",
                        )
                        with gr.Group(visible=True, elem_id="forge_neo_multimodal_qwen_video_i2v_group") as qv_i2v_group:
                            qv_image = gr.Image(
                                label=_label("Input image", "输入图像"),
                                type="filepath",
                                elem_id="forge_neo_multimodal_qwen_video_image",
                            )
                            qv_i2v_audio = gr.Audio(
                                label=_label("Audio file", "音频文件"),
                                type="filepath",
                                elem_id="forge_neo_multimodal_qwen_video_i2v_audio",
                            )
                        with gr.Group(visible=False, elem_id="forge_neo_multimodal_qwen_video_kf2v_group") as qv_kf2v_group:
                            qv_first_frame = gr.Image(
                                label=_label("First frame", "首帧图像"),
                                type="filepath",
                                elem_id="forge_neo_multimodal_qwen_video_first_frame",
                            )
                            qv_last_frame = gr.Image(
                                label=_label("Last frame", "尾帧图像"),
                                type="filepath",
                                elem_id="forge_neo_multimodal_qwen_video_last_frame",
                            )
                        with gr.Group(visible=False, elem_id="forge_neo_multimodal_qwen_video_t2v_group") as qv_t2v_group:
                            qv_t2v_audio = gr.Audio(
                                label=_label("Audio file", "音频文件"),
                                type="filepath",
                                elem_id="forge_neo_multimodal_qwen_video_t2v_audio",
                            )
                        with gr.Row():
                            qv_resolution = gr.Dropdown(
                                choices=list(qwen_video["resolutions"]),
                                value=str(qwen_video["default_resolution"]),
                                label=_label("Resolution", "分辨率"),
                                elem_id="forge_neo_multimodal_qwen_video_resolution",
                            )
                            qv_duration = gr.Slider(
                                1,
                                30,
                                value=int(qwen_video["default_duration"]),
                                step=1,
                                label=_label("Duration", "时长"),
                                elem_id="forge_neo_multimodal_qwen_video_duration",
                            )
                        with gr.Row():
                            qv_audio_enabled = gr.Checkbox(
                                value=bool(qwen_video["default_audio_enabled"]),
                                label=_label("Include audio", "包含音频"),
                                elem_id="forge_neo_multimodal_qwen_video_audio_enabled",
                            )
                            qv_shot_type = gr.Dropdown(
                                choices=[(item["label"], item["value"]) for item in qwen_video["shot_types"]],
                                value=str(qwen_video["default_shot_type"]),
                                label=_label("Shot type", "镜头类型"),
                                elem_id="forge_neo_multimodal_qwen_video_shot_type",
                            )
                        qv_generate = gr.Button(
                            _label("Generate video", "生成视频"),
                            variant="primary",
                            elem_id="forge_neo_multimodal_qwen_video_generate",
                        )
                    with gr.Column(scale=1, elem_classes=["forge-neo-multimodal-media-output"]):
                        qv_result = gr.Textbox(
                            label=_label("Task result", "任务结果"),
                            lines=10,
                            elem_id="forge_neo_multimodal_qwen_video_result",
                        )
                        qv_preview = gr.HTML(
                            "",
                            elem_id="forge_neo_multimodal_qwen_video_preview",
                        )
                        qv_status = gr.HTML(
                            _multimodal_media_status_html("Ready."),
                            elem_id="forge_neo_multimodal_qwen_video_status",
                        )
                        qv_task_id = gr.Textbox(
                            label=_label("Task ID", "任务 ID"),
                            elem_id="forge_neo_multimodal_qwen_video_task_id",
                        )
                        with gr.Row(elem_classes=["forge-neo-multimodal-qwen-video-actions"]):
                            qv_query = gr.Button(
                                _label("Query task", "查询任务"),
                                elem_id="forge_neo_multimodal_qwen_video_query",
                            )
                            qv_recent = gr.Button(
                                _label("Recent tasks", "最近任务"),
                                elem_id="forge_neo_multimodal_qwen_video_recent",
                            )
                        qv_recent_tasks = gr.Dataframe(
                            headers=["Task ID", "Status", "Submit Time", "Model"],
                            datatype=["str", "str", "str", "str"],
                            label=_label("Recent tasks", "最近任务"),
                            interactive=False,
                            elem_id="forge_neo_multimodal_qwen_video_recent_tasks",
                        )
                qv_set_key.click(
                    _multimodal_media_qwen_video_set_key_clicked,
                    inputs=[qv_api_key],
                    outputs=[qv_status],
                    queue=False,
                    show_progress=False,
                )
                qv_mode.change(
                    _multimodal_media_qwen_video_mode_changed,
                    inputs=[qv_mode],
                    outputs=[qv_i2v_group, qv_kf2v_group, qv_t2v_group, qv_resolution, qv_duration, qv_audio_enabled, qv_shot_type],
                    queue=False,
                    show_progress=False,
                )
                qv_generate.click(
                    _multimodal_media_qwen_video_generate_clicked,
                    inputs=[
                        qv_mode,
                        qv_prompt,
                        qv_image,
                        qv_first_frame,
                        qv_last_frame,
                        qv_t2v_audio,
                        qv_i2v_audio,
                        qv_resolution,
                        qv_duration,
                        qv_audio_enabled,
                        qv_shot_type,
                    ],
                    outputs=[qv_result, qv_preview, qv_status],
                )
                qv_query.click(
                    _multimodal_media_qwen_video_query_clicked,
                    inputs=[qv_task_id],
                    outputs=[qv_result, qv_status],
                )
                qv_recent.click(
                    _multimodal_media_qwen_video_recent_clicked,
                    outputs=[qv_recent_tasks],
                    queue=False,
                    show_progress=False,
                )
            with gr.Tab(_label("2. LatentSync", "2. 数字人对口型生成"), elem_id="forge_neo_multimodal_latent_sync_tab"):
                with gr.Row(elem_classes=["forge-neo-multimodal-media-layout"]):
                    with gr.Column(scale=1, elem_classes=["forge-neo-multimodal-media-inputs"]):
                        latent_video = gr.Video(
                            label=_label("Input video", "输入视频"),
                            elem_id="forge_neo_multimodal_latent_sync_video",
                        )
                        latent_audio = gr.Audio(
                            label=_label("Input audio", "输入音频"),
                            type="filepath",
                            elem_id="forge_neo_multimodal_latent_sync_audio",
                        )
                        latent_model = gr.Dropdown(
                            choices=list(latent_sync["models"]),
                            value=str(latent_sync["default_model"]),
                            label=_label("Model", "模型"),
                            elem_id="forge_neo_multimodal_latent_sync_model",
                        )
                        with gr.Row():
                            latent_guidance = gr.Slider(
                                1.0,
                                3.0,
                                value=float(latent_sync["default_guidance_scale"]),
                                step=0.1,
                                label=_label("Guidance scale", "引导尺度"),
                                elem_id="forge_neo_multimodal_latent_sync_guidance",
                            )
                            latent_steps = gr.Slider(
                                10,
                                50,
                                value=int(latent_sync["default_inference_steps"]),
                                step=1,
                                label=_label("Inference steps", "推理步数"),
                                elem_id="forge_neo_multimodal_latent_sync_steps",
                            )
                        latent_seed = gr.Number(
                            value=int(latent_sync["default_seed"]),
                            precision=0,
                            label=_label("Seed", "随机种子"),
                            elem_id="forge_neo_multimodal_latent_sync_seed",
                        )
                        latent_generate = gr.Button(
                            _label("Generate lip sync video", "生成数字人视频"),
                            variant="primary",
                            elem_id="forge_neo_multimodal_latent_sync_generate",
                        )
                    with gr.Column(scale=1, elem_classes=["forge-neo-multimodal-media-output"]):
                        latent_output = gr.Video(
                            label=_label("Output video", "输出视频"),
                            elem_id="forge_neo_multimodal_latent_sync_output",
                        )
                        latent_result = gr.Textbox(
                            label=_label("Result", "处理结果"),
                            lines=8,
                            elem_id="forge_neo_multimodal_latent_sync_result",
                        )
                        latent_status = gr.HTML(
                            _multimodal_media_status_html("Ready."),
                            elem_id="forge_neo_multimodal_latent_sync_status",
                        )
                latent_generate.click(
                    _multimodal_media_latent_sync_clicked,
                    inputs=[latent_video, latent_audio, latent_guidance, latent_steps, latent_seed, latent_model],
                    outputs=[latent_output, latent_result, latent_status],
                )
            with gr.Tab(_label("5. ACE-Step", "5. ACE-Step 音乐生成"), elem_id="forge_neo_multimodal_ace_step_tab"):
                gr.Markdown(
                    _label(
                        """## 🎵 ACE-Step 1.5 Music Generation
Generate music with ACE-Step 1.5. Supports lyric control and reference audio analysis.

**Model requirements:**
- Put the model in `models/acestep-v15-xl-turbo/`.
- Required files: `config.json` and `pytorch_model.bin`.
- If the local model is missing, the first run downloads it from Hugging Face.""",
                        """## 🎵 ACE-Step 1.5 音乐生成
使用 ACE-Step 1.5 模型生成音乐，支持歌词控制和音频分析参考

**模型要求：**
- 将模型放入 `models/acestep-v15-xl-turbo/` 目录
- 模型需包含 `config.json` 和 `pytorch_model.bin`
- 如果本地没有模型，首次运行会自动从 Hugging Face 下载。""",
                    ),
                    elem_id="forge_neo_multimodal_ace_step_intro",
                    elem_classes=["forge-neo-multimodal-ace-intro"],
                )
                with gr.Row(elem_classes=["forge-neo-multimodal-media-layout", "forge-neo-multimodal-ace-layout"]):
                    with gr.Column(scale=3, elem_classes=["forge-neo-multimodal-media-inputs"]):
                        ace_prompt = gr.Textbox(
                            value=ACE_STEP_EXAMPLE_PROMPT,
                            label=_label("🎵 Style prompt", "🎵 曲风/风格提示"),
                            lines=3,
                            max_lines=8,
                            elem_id="forge_neo_multimodal_ace_step_prompt",
                        )
                        ace_lyrics = gr.Textbox(
                            value=ACE_STEP_EXAMPLE_LYRICS,
                            label=_label("📝 Lyrics (optional)", "📝 歌词（可选）"),
                            lines=8,
                            max_lines=12,
                            elem_id="forge_neo_multimodal_ace_step_lyrics",
                        )
                        gr.Examples(
                            examples=[[ACE_STEP_EXAMPLE_PROMPT, ACE_STEP_EXAMPLE_LYRICS]],
                            label=_label("Example: Wuxia", "示例：古风武侠"),
                            inputs=[ace_prompt, ace_lyrics],
                        )
                        with gr.Row(elem_classes=["forge-neo-multimodal-ace-params"]):
                            ace_bpm = gr.Number(
                                value=int(ace_step["default_bpm"]),
                                precision=0,
                                label=_label("🎵 BPM", "🎵 BPM"),
                                elem_id="forge_neo_multimodal_ace_step_bpm",
                            )
                            ace_key = gr.Dropdown(
                                choices=list(ace_step["key_scales"]),
                                value=str(ace_step["default_key_scale"]),
                                label=_label("🎼 Key", "🎼 调式"),
                                elem_id="forge_neo_multimodal_ace_step_key",
                            )
                            ace_time_signature = gr.Dropdown(
                                choices=list(ace_step["time_signatures"]),
                                value=str(ace_step["default_time_signature"]),
                                label=_label("⏱️ Time signature", "⏱️ 拍号"),
                                elem_id="forge_neo_multimodal_ace_step_time_signature",
                            )
                            ace_language = gr.Dropdown(
                                choices=list(ace_step["languages"]),
                                value=str(ace_step["default_language"]),
                                label=_label("🗣️ Vocal language", "🗣️ 演唱语言"),
                                elem_id="forge_neo_multimodal_ace_step_language",
                            )
                        gr.Markdown(
                            _label(
                                "### 🎧 Reference Audio Analysis\nUpload reference audio and extract style or lyric hints.",
                                "### 🎧 音频分析参考\n可以上传音频，自动提取曲风、歌词等信息作为参考",
                            ),
                            elem_id="forge_neo_multimodal_ace_step_reference_intro",
                            elem_classes=["forge-neo-multimodal-ace-reference"],
                        )
                        with gr.Row():
                            ace_reference = gr.Audio(
                                label=_label("Upload reference audio", "上传参考音频"),
                                type="filepath",
                                elem_id="forge_neo_multimodal_ace_step_reference_audio",
                            )
                            ace_analyze = gr.Button(
                                _label("🔍 Analyze audio", "🔍 分析音频"),
                                elem_id="forge_neo_multimodal_ace_step_analyze",
                            )
                        with gr.Row():
                            ace_duration = gr.Number(
                                value=int(ace_step["default_duration"]),
                                precision=0,
                                label=_label("⏱️ Duration (seconds)", "⏱️ 时长（秒）"),
                                elem_id="forge_neo_multimodal_ace_step_duration",
                            )
                            ace_steps = gr.Slider(
                                4,
                                50,
                                value=int(ace_step["default_infer_steps"]),
                                step=1,
                                label=_label("🔄 Inference steps", "🔄 推理步数"),
                                elem_id="forge_neo_multimodal_ace_step_steps",
                            )
                        ace_guidance = gr.Slider(
                            1.0,
                            20.0,
                            value=float(ace_step["default_guidance_scale"]),
                            step=0.5,
                            label=_label("🎚️ Guidance scale", "🎚️ 引导强度"),
                            elem_id="forge_neo_multimodal_ace_step_guidance",
                        )
                        ace_model = gr.Dropdown(
                            choices=list(ace_step["models"]),
                            value=str(ace_step["default_model"]),
                            label=_label("🏷️ Model version", "🏷️ 模型版本"),
                            elem_id="forge_neo_multimodal_ace_step_model",
                        )
                        ace_generate = gr.Button(
                            _label("🎵 Generate music", "🎵 生成音乐"),
                            variant="primary",
                            elem_id="forge_neo_multimodal_ace_step_generate",
                        )
                    with gr.Column(scale=2, elem_classes=["forge-neo-multimodal-media-output"]):
                        ace_audio = gr.Audio(
                            label=_label("🎧 Generated music", "🎧 生成的音乐"),
                            type="filepath",
                            elem_id="forge_neo_multimodal_ace_step_audio",
                        )
                        ace_result = gr.Textbox(
                            label=_label("Result", "处理结果"),
                            lines=8,
                            elem_id="forge_neo_multimodal_ace_step_result",
                        )
                        ace_status = gr.HTML(
                            _multimodal_media_status_html("Ready."),
                            elem_id="forge_neo_multimodal_ace_step_status",
                        )
                ace_analyze.click(
                    _multimodal_media_ace_step_analyze_clicked,
                    inputs=[ace_reference, ace_model],
                    outputs=[ace_status, ace_prompt, ace_lyrics, ace_bpm, ace_duration, ace_key, ace_language, ace_time_signature],
                )
                ace_generate.click(
                    _multimodal_media_ace_step_generate_clicked,
                    inputs=[ace_prompt, ace_lyrics, ace_duration, ace_steps, ace_guidance, ace_model, ace_bpm, ace_key, ace_time_signature, ace_language],
                    outputs=[ace_audio, ace_result, ace_status],
                )
            with gr.Tab(_label("6. IndexTTS-2", "6. IndexTTS-2 语音合成"), elem_id="forge_neo_multimodal_index_tts_tab"):
                with gr.Row(elem_classes=["forge-neo-multimodal-media-layout"]):
                    with gr.Column(scale=1, elem_classes=["forge-neo-multimodal-media-inputs"]):
                        index_text = gr.Textbox(
                            label=_label("Text", "合成文本"),
                            lines=5,
                            max_lines=8,
                            elem_id="forge_neo_multimodal_index_tts_text",
                        )
                        index_language = gr.Dropdown(
                            choices=[(item["label"], item["value"]) for item in index_tts["languages"]],
                            value=str(index_tts["default_language"]),
                            label=_label("Language", "语言"),
                            elem_id="forge_neo_multimodal_index_tts_language",
                        )
                        index_prompt_audio = gr.Audio(
                            label=_label("Reference audio", "音色参考音频"),
                            type="filepath",
                            elem_id="forge_neo_multimodal_index_tts_prompt_audio",
                        )
                        index_emotion_mode = gr.Dropdown(
                            choices=list(index_tts["emotion_modes"]),
                            value=str(index_tts["default_emotion_mode"]),
                            label=_label("Emotion mode", "情感控制模式"),
                            elem_id="forge_neo_multimodal_index_tts_emotion_mode",
                        )
                        with gr.Group(visible=False, elem_id="forge_neo_multimodal_index_tts_emotion_ref_group") as index_emotion_ref_group:
                            index_emotion_ref_audio = gr.Audio(
                                label=_label("Emotion reference audio", "情感参考音频"),
                                type="filepath",
                                elem_id="forge_neo_multimodal_index_tts_emotion_ref_audio",
                            )
                        with gr.Group(visible=False, elem_id="forge_neo_multimodal_index_tts_vector_group") as index_vector_group:
                            with gr.Row():
                                index_vec1 = gr.Slider(0, 1, value=0, step=0.1, label="V1", elem_id="forge_neo_multimodal_index_tts_vec1")
                                index_vec2 = gr.Slider(0, 1, value=0, step=0.1, label="V2", elem_id="forge_neo_multimodal_index_tts_vec2")
                                index_vec3 = gr.Slider(0, 1, value=0, step=0.1, label="V3", elem_id="forge_neo_multimodal_index_tts_vec3")
                                index_vec4 = gr.Slider(0, 1, value=0, step=0.1, label="V4", elem_id="forge_neo_multimodal_index_tts_vec4")
                            with gr.Row():
                                index_vec5 = gr.Slider(0, 1, value=0, step=0.1, label="V5", elem_id="forge_neo_multimodal_index_tts_vec5")
                                index_vec6 = gr.Slider(0, 1, value=0, step=0.1, label="V6", elem_id="forge_neo_multimodal_index_tts_vec6")
                                index_vec7 = gr.Slider(0, 1, value=0, step=0.1, label="V7", elem_id="forge_neo_multimodal_index_tts_vec7")
                                index_vec8 = gr.Slider(0, 1, value=0, step=0.1, label="V8", elem_id="forge_neo_multimodal_index_tts_vec8")
                        with gr.Group(visible=False, elem_id="forge_neo_multimodal_index_tts_emotion_text_group") as index_emotion_text_group:
                            index_emotion_text = gr.Textbox(
                                label=_label("Emotion description", "情感描述"),
                                lines=2,
                                elem_id="forge_neo_multimodal_index_tts_emotion_text",
                            )
                        index_emotion_weight = gr.Slider(
                            0.0,
                            2.0,
                            value=float(index_tts["default_emotion_weight"]),
                            step=0.1,
                            label=_label("Emotion weight", "情感权重"),
                            elem_id="forge_neo_multimodal_index_tts_emotion_weight",
                        )
                        with gr.Accordion(_label("Advanced", "高级参数"), open=False):
                            with gr.Row():
                                index_do_sample = gr.Checkbox(
                                    value=True,
                                    label=_label("Do sample", "启用采样"),
                                    elem_id="forge_neo_multimodal_index_tts_do_sample",
                                )
                                index_temperature = gr.Slider(
                                    0.1,
                                    2.0,
                                    value=float(index_tts["default_temperature"]),
                                    step=0.1,
                                    label=_label("Temperature", "温度"),
                                    elem_id="forge_neo_multimodal_index_tts_temperature",
                                )
                            with gr.Row():
                                index_top_p = gr.Slider(
                                    0.1,
                                    1.0,
                                    value=float(index_tts["default_top_p"]),
                                    step=0.05,
                                    label="Top-p",
                                    elem_id="forge_neo_multimodal_index_tts_top_p",
                                )
                                index_top_k = gr.Slider(
                                    0,
                                    100,
                                    value=int(index_tts["default_top_k"]),
                                    step=1,
                                    label="Top-k",
                                    elem_id="forge_neo_multimodal_index_tts_top_k",
                                )
                            with gr.Row():
                                index_length_penalty = gr.Slider(
                                    0.5,
                                    2.0,
                                    value=float(index_tts["default_length_penalty"]),
                                    step=0.1,
                                    label=_label("Length penalty", "长度惩罚"),
                                    elem_id="forge_neo_multimodal_index_tts_length_penalty",
                                )
                                index_repetition_penalty = gr.Slider(
                                    1.0,
                                    2.0,
                                    value=float(index_tts["default_repetition_penalty"]),
                                    step=0.1,
                                    label=_label("Repetition penalty", "重复惩罚"),
                                    elem_id="forge_neo_multimodal_index_tts_repetition_penalty",
                                )
                            with gr.Row():
                                index_num_beams = gr.Slider(
                                    1,
                                    10,
                                    value=int(index_tts["default_num_beams"]),
                                    step=1,
                                    label=_label("Num beams", "Beam 数量"),
                                    elem_id="forge_neo_multimodal_index_tts_num_beams",
                                )
                                index_max_mel_tokens = gr.Slider(
                                    100,
                                    1000,
                                    value=int(index_tts["default_max_mel_tokens"]),
                                    step=50,
                                    label=_label("Max mel tokens", "最大 Mel Token"),
                                    elem_id="forge_neo_multimodal_index_tts_max_mel_tokens",
                                )
                            index_max_text_tokens = gr.Slider(
                                50,
                                200,
                                value=int(index_tts["default_max_text_tokens_per_segment"]),
                                step=10,
                                label=_label("Max text tokens per segment", "每段最大文本 Token"),
                                elem_id="forge_neo_multimodal_index_tts_max_text_tokens",
                            )
                        index_generate = gr.Button(
                            _label("Generate speech", "生成语音"),
                            variant="primary",
                            elem_id="forge_neo_multimodal_index_tts_generate",
                        )
                    with gr.Column(scale=1, elem_classes=["forge-neo-multimodal-media-output"]):
                        index_audio = gr.Audio(
                            label=_label("Generated audio", "生成音频"),
                            type="filepath",
                            elem_id="forge_neo_multimodal_index_tts_audio",
                        )
                        index_result = gr.Textbox(
                            label=_label("Result", "处理结果"),
                            lines=8,
                            elem_id="forge_neo_multimodal_index_tts_result",
                        )
                        index_status = gr.HTML(
                            _multimodal_media_status_html("Ready."),
                            elem_id="forge_neo_multimodal_index_tts_status",
                        )
                index_emotion_mode.change(
                    _multimodal_media_index_tts_mode_changed,
                    inputs=[index_emotion_mode],
                    outputs=[index_emotion_ref_group, index_vector_group, index_emotion_text_group],
                    queue=False,
                    show_progress=False,
                )
                index_generate.click(
                    _multimodal_media_index_tts_generate_clicked,
                    inputs=[
                        index_text,
                        index_language,
                        index_prompt_audio,
                        index_emotion_mode,
                        index_emotion_ref_audio,
                        index_emotion_weight,
                        index_emotion_text,
                        index_vec1,
                        index_vec2,
                        index_vec3,
                        index_vec4,
                        index_vec5,
                        index_vec6,
                        index_vec7,
                        index_vec8,
                        index_do_sample,
                        index_top_p,
                        index_top_k,
                        index_temperature,
                        index_length_penalty,
                        index_num_beams,
                        index_repetition_penalty,
                        index_max_mel_tokens,
                        index_max_text_tokens,
                    ],
                    outputs=[index_audio, index_result, index_status],
                )
            with gr.Tab(_label("3. Video Frames", "3. 视频关键帧提取"), elem_id="forge_neo_multimodal_video_frames_tab"):
                with gr.Row(elem_classes=["forge-neo-multimodal-media-layout"]):
                    with gr.Column(scale=1, elem_classes=["forge-neo-multimodal-media-inputs"]):
                        media_video = gr.Video(
                            label=_label("Video", "视频"),
                            height=320,
                            elem_id="forge_neo_multimodal_video",
                        )
                        media_quality = gr.Slider(
                            1,
                            100,
                            value=int(defaults["frame_quality"]),
                            step=1,
                            label=_label("Frame quality", "帧质量"),
                            elem_id="forge_neo_multimodal_frame_quality",
                        )
                        media_mode = gr.Radio(
                            choices=[
                                ("Uniform", "uniform"),
                                ("Interval", "interval"),
                                ("Change detection", "change_detection"),
                            ],
                            value=str(defaults["frame_mode"]),
                            label=_label("Extraction mode", "提取模式"),
                            elem_id="forge_neo_multimodal_frame_mode",
                        )
                        media_extract = gr.Button(
                            _label("Extract frames", "提取关键帧"),
                            variant="primary",
                            elem_id="forge_neo_multimodal_extract_frames",
                        )
                    with gr.Column(scale=1, elem_classes=["forge-neo-multimodal-media-output"]):
                        media_files = gr.File(
                            label=_label("Frame files", "帧文件"),
                            file_count="multiple",
                            elem_id="forge_neo_multimodal_frame_files",
                        )
                        media_gallery = gr.Gallery(
                            label=_label("Frame preview", "帧预览"),
                            columns=4,
                            height=320,
                            object_fit="contain",
                            elem_id="forge_neo_multimodal_frame_gallery",
                        )
                        media_result = gr.Textbox(
                            label=_label("Result", "处理结果"),
                            lines=6,
                            elem_id="forge_neo_multimodal_result",
                        )
                        media_status = gr.HTML(
                            _multimodal_media_status_html("Ready."),
                            elem_id="forge_neo_multimodal_status",
                        )
                media_extract.click(
                    _multimodal_media_extract_clicked,
                    inputs=[media_video, media_quality, media_mode],
                    outputs=[media_files, media_gallery, media_result, media_status],
                )

def _qwen_vision_status_html(message: str, *, ok: bool = True) -> str:
    class_name = "ok" if ok else "error"
    return f'<div class="forge-neo-qwen-vision-status {class_name}">{html_lib.escape(str(message or ""))}</div>'


def _qwen_vision_chat_send_clicked(image, prompt, model_type, vision_model, language_model, ollama_host, timeout, history):
    result = qwen_vision_chat_request(
        prompt=prompt,
        model_type=model_type,
        vision_model=vision_model,
        language_model=language_model,
        image=image,
        ollama_host=ollama_host,
        timeout=timeout,
    )
    previous = str(history or "").strip()
    question = str(prompt or "").strip()
    answer = str(result.get("content") or "")
    block = f"User: {question}\nQwen: {answer or result.get('message', '')}".strip()
    combined = f"{previous}\n\n{block}".strip() if previous else block
    status = _qwen_vision_status_html(result.get("message", ""), ok=bool(result.get("ok")))
    return combined, answer, status


def _qwen_vision_chat_clear_clicked():
    return "", "", _qwen_vision_status_html("Chat cleared.")


def _create_qwen_vision_chat_tab(state_value: Mapping[str, object]) -> None:
    if render_source_extension_tab(
        "sd-webui-qwen-vision-chat",
        "scripts/sd_qwen_vision_chat.py",
        "vision_chat_tab",
        visible=qwen_vision_chat_available(),
    ):
        return

    defaults = qwen_vision_chat_defaults()
    with gr.Tab(
        _label("Qwen Vision Chat", "图像识别与语言交互"),
        visible=qwen_vision_chat_available(),
        elem_id="forge_neo_qwen_vision_chat_tab",
    ):
        with gr.Tabs(elem_id="forge_neo_qwen_vision_tabs"):
            with gr.Tab(_label("1 Model Download Guide", "1 模型下载说明"), elem_id="forge_neo_qwen_vision_model_guide_tab"):
                gr.Markdown(
                    _label(
                        """# 📥 Ollama and Qwen Model Guide

## Install Ollama
1. Download Ollama from `https://ollama.com/`.
2. Install it on the system.

## Download Qwen models

### Vision models
| Command | Notes | VRAM |
| --- | --- | --- |
| `ollama run qwen3.5:9b` | High accuracy | 16GB+ |
| `ollama run qwen3.5:4b` | Balanced | 12GB |
| `ollama run qwen3-vl:8b` | Vision language model | 12GB+ |
| `ollama run qwen3-vl:4b` | Medium vision model | 8GB+ |
| `ollama run qwen3-vl:2b` | Lightweight | 8GB |

### Text models
| Command | Notes |
| --- | --- |
| `ollama run qwen3:latest` | Latest text model |
| `ollama run qwen3.5:4b` | Balanced text model |""",
                        """# 📥 Ollama 与 Qwen 模型下载说明

## 步骤 1：安装 Ollama
1. 访问官网下载：`https://ollama.com/`
2. 下载并安装适合当前系统的安装包

## 步骤 2：下载 Qwen 模型

### 视觉模型（支持图片识别）
| 模型命令 | 说明 | 推荐显存 |
| --- | --- | --- |
| `ollama run qwen3.5:9b` | 高精度版 | 16GB+ |
| `ollama run qwen3.5:4b` | 平衡版（推荐） | 12GB |
| `ollama run qwen3-vl:8b` | 视觉语言模型 | 12GB+ |
| `ollama run qwen3-vl:4b` | 中等视觉模型 | 8GB+ |
| `ollama run qwen3-vl:2b` | 轻量版 | 8GB |

### 语言模型（仅文本对话）
| 模型命令 | 说明 |
| --- | --- |
| `ollama run qwen3:latest` | 最新版语言模型 |
| `ollama run qwen3.5:4b` | 平衡版语言模型 |""",
                    ),
                    elem_classes=["forge-neo-qwen-vision-guide"],
                )
            with gr.Tab(_label("2 Image Recognition and Prompt Assist", "2 图像识别与关键词辅助"), elem_id="forge_neo_qwen_vision_assist_tab"):
                with gr.Row(elem_classes=["forge-neo-qwen-vision-layout"]):
                    with gr.Column(scale=1, elem_classes=["forge-neo-qwen-vision-inputs"]):
                        with gr.Group():
                            gr.Markdown(_label("### Model Selection", "### 模型选择"))
                            gr.Markdown(
                                _label(
                                    "Vision models support image recognition and text chat. Text models only support text chat.",
                                    "📌 **模型选择建议**：8GB 显存选择 2B，12GB-16GB 显存可选择 4B-9B 模型",
                                )
                            )
                            qwen_model_type = gr.Radio(
                                choices=[("Vision", "vision"), ("Text", "text")],
                                value="vision",
                                label=_label("Model type", "模型类型"),
                                elem_id="forge_neo_qwen_vision_model_type",
                            )
                            with gr.Row():
                                qwen_vision_model = gr.Dropdown(
                                    defaults["vision_models"],
                                    value=defaults["default_vision_model"],
                                    label=_label("Vision model", "视觉模型"),
                                    allow_custom_value=True,
                                    elem_id="forge_neo_qwen_vision_model",
                                )
                                qwen_language_model = gr.Dropdown(
                                    defaults["language_models"],
                                    value=defaults["default_language_model"],
                                    label=_label("Language model", "语言模型"),
                                    allow_custom_value=True,
                                    elem_id="forge_neo_qwen_language_model",
                                )
                            with gr.Row():
                                qwen_host = gr.Textbox(
                                    value=defaults["ollama_host"],
                                    label=_label("Ollama server", "Ollama 服务器地址"),
                                    elem_id="forge_neo_qwen_ollama_host",
                                )
                                qwen_timeout = gr.Number(
                                    value=defaults["timeout"],
                                    precision=0,
                                    label=_label("Timeout", "超时"),
                                    elem_id="forge_neo_qwen_ollama_timeout",
                                )
                        with gr.Group():
                            gr.Markdown(_label("### 📤 Image Upload", "### 📤 图片上传"))
                            gr.Markdown(
                                _label(
                                    "Qwen multimodal models support image plus text chat.",
                                    "📌 **使用说明**：Qwen 多模态模型支持同时上传图片和文字聊天",
                                )
                            )
                            qwen_image = gr.Image(
                                label=_label("Image", "图片"),
                                type="pil",
                                height=320,
                                elem_id="forge_neo_qwen_vision_image",
                            )
                    with gr.Column(scale=1, elem_classes=["forge-neo-qwen-vision-output"]):
                        with gr.Accordion(_label("Prompt templates", "关键词辅助模板"), open=False):
                            with gr.Tabs(elem_id="forge_neo_qwen_vision_prompt_template_tabs"):
                                with gr.Tab(_label("Expression", "表情包"), elem_id="forge_neo_qwen_vision_expression_template_tab"):
                                    gr.Textbox(
                                        value="一组角色表情变化的图片，同一个角色在不同情绪状态下的表现。日系动漫风格。",
                                        label=_label("Expression template", "表情包模板"),
                                        lines=6,
                                        elem_id="forge_neo_qwen_vision_expression_template",
                                    )
                                with gr.Tab(_label("Story", "创作故事"), elem_id="forge_neo_qwen_vision_story_template_tab"):
                                    gr.Textbox(
                                        value="请根据以下模板，为您的AI绘画作品创作一个故事：\n\n故事名称：\n主要角色：\n背景设定：\n故事情节：\n作品主题：",
                                        label=_label("Story template", "创作故事模板"),
                                        lines=8,
                                        elem_id="forge_neo_qwen_vision_story_template",
                                    )
                                with gr.Tab(_label("Storyboard", "分镜描写"), elem_id="forge_neo_qwen_vision_storyboard_template_tab"):
                                    gr.Textbox(
                                        value="第一格：\n- 场景：昏暗房间内部\n- 人物：地上昏迷者 + 椅子上的男人\n- 布局：左侧躺地上，右侧坐椅子\n- 氛围：压抑不安。",
                                        label=_label("Storyboard template", "分镜描写模板"),
                                        lines=8,
                                        elem_id="forge_neo_qwen_vision_storyboard_template",
                                    )
                                with gr.Tab(_label("Visual Reference", "分镜视觉呈现参考"), elem_id="forge_neo_qwen_vision_visual_reference_tab"):
                                    gr.Markdown(
                                        _label(
                                            "### Common storyboard visual references\n- Shot size: wide, full, medium, close-up, extreme close-up\n- Angle: eye level, high angle, low angle\n- Motion: push in, pull back, pan, track",
                                            "### 分镜常用视觉呈现\n- 景别：远景、全景、中景、近景、特写、大特写\n- 镜头角度：平视、俯视、仰视\n- 镜头运动：推镜头、拉镜头、摇镜头、移镜头、跟镜头",
                                        )
                                    )
                        qwen_history = gr.Textbox(
                            label=_label("Chat history", "聊天记录"),
                            lines=10,
                            elem_id="forge_neo_qwen_vision_history",
                        )
                        qwen_prompt = gr.Textbox(
                            value=_label("Describe this image in detail.", "请详细描述这张图片。"),
                            label=_label("Message", "消息"),
                            lines=3,
                            elem_id="forge_neo_qwen_vision_prompt",
                        )
                        with gr.Row(elem_classes=["forge-neo-qwen-vision-actions"]):
                            qwen_send = gr.Button(
                                _label("Send", "发送"),
                                variant="primary",
                                elem_id="forge_neo_qwen_vision_send",
                            )
                            qwen_clear = gr.Button(
                                _label("Clear chat", "清空聊天"),
                                elem_id="forge_neo_qwen_vision_clear",
                            )
                        qwen_answer = gr.Textbox(
                            label=_label("Latest response", "最新回复"),
                            lines=8,
                            elem_id="forge_neo_qwen_vision_answer",
                        )
                        qwen_status = gr.HTML(
                            _qwen_vision_status_html("Ready."),
                            elem_id="forge_neo_qwen_vision_status",
                        )
        qwen_inputs = [
            qwen_image,
            qwen_prompt,
            qwen_model_type,
            qwen_vision_model,
            qwen_language_model,
            qwen_host,
            qwen_timeout,
            qwen_history,
        ]
        qwen_send.click(
            _qwen_vision_chat_send_clicked,
            inputs=qwen_inputs,
            outputs=[qwen_history, qwen_answer, qwen_status],
        )
        qwen_clear.click(
            _qwen_vision_chat_clear_clicked,
            outputs=[qwen_history, qwen_answer, qwen_status],
            show_progress=False,
            queue=False,
        )


def _sam_matting_status_html(message: str, *, ok: bool = True) -> str:
    class_name = "ok" if ok else "error"
    return f'<div class="forge-neo-sam-matting-status {class_name}">{html_lib.escape(str(message or ""))}</div>'


def _sam_matting_summary_html() -> str:
    status = sam_matting_status()
    dependencies = status.get("dependencies") or {}
    sam_models = status.get("sam_models") or {}
    rows = [
        ("Source", status.get("source_available")),
        ("rembg", dependencies.get("rembg")),
        ("segment_anything", dependencies.get("segment_anything")),
        ("litelama", dependencies.get("litelama")),
        ("SAM vit_h", (sam_models.get("vit_h") or {}).get("exists")),
        ("SAM vit_l", (sam_models.get("vit_l") or {}).get("exists")),
    ]
    items = "".join(
        f"<span><strong>{html_lib.escape(str(label))}</strong>{html_lib.escape(str(value))}</span>"
        for label, value in rows
    )
    return f'<div class="forge-neo-sam-matting-summary">{items}</div>'


def _sam_matting_detail(result: Mapping[str, object]) -> str:
    paths = [str(path) for path in (result.get("images") or [])]
    lines = [str(result.get("message") or "")]
    if result.get("output_dir"):
        lines.append(f"Output: {result.get('output_dir')}")
    lines.extend(paths)
    return "\n".join(line for line in lines if line).strip()


def _sam_matting_background_clicked(image, background_mode, background_color, model_name):
    result = remove_background(image, background_mode, background_color, model_name)
    return result.get("images") or [], _sam_matting_detail(result), _sam_matting_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _sam_matting_sam_clicked(image, model_type, mode, max_masks):
    result = run_sam_auto_segmentation(image, model_type, mode, max_masks)
    return result.get("images") or [], _sam_matting_detail(result), _sam_matting_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _sam_matting_point_image(image: object, points: object) -> Image.Image | object:
    if not isinstance(image, Image.Image):
        return image
    marked = image.convert("RGB").copy()
    draw = ImageDraw.Draw(marked)
    for index, point in enumerate(points or [], start=1):
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        x = int(point[0])
        y = int(point[1])
        radius = 10
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(255, 64, 64), outline=(255, 255, 255), width=3)
        draw.text((x + 13, y - 12), str(index), fill=(255, 255, 255))
    return marked


def _sam_matting_point_upload(image):
    return image, [], _sam_matting_detail({"message": "Point list cleared."}), _sam_matting_status_html("Point list cleared.")


def _sam_matting_point_select(evt: gr.SelectData, image, source_image, points):
    if image is None and source_image is None:
        return image, source_image, [], _sam_matting_detail({"message": "Image is required."}), _sam_matting_status_html("Image is required.", ok=False)
    base_image = source_image if isinstance(source_image, Image.Image) else image
    point_list = list(points or [])
    index = getattr(evt, "index", None)
    if isinstance(index, (list, tuple)) and len(index) >= 2:
        point_list.append([int(index[0]), int(index[1])])
    marked = _sam_matting_point_image(base_image, point_list)
    return marked, base_image, point_list, _sam_matting_detail({"message": f"{len(point_list)} point(s) selected."}), _sam_matting_status_html(f"{len(point_list)} point(s) selected.")


def _sam_matting_point_clear(source_image, image):
    base_image = source_image if isinstance(source_image, Image.Image) else image
    return base_image, [], _sam_matting_detail({"message": "Point list cleared."}), _sam_matting_status_html("Point list cleared.")


def _sam_matting_point_clicked(source_image, image, points, model_type):
    base_image = source_image if isinstance(source_image, Image.Image) else image
    result = run_sam_point_segmentation(base_image, points, model_type)
    return result.get("images") or [], _sam_matting_detail(result), _sam_matting_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _sam_matting_cleaner_clicked(image_editor_value):
    result = run_cleaner(image_editor_value)
    return result.get("images") or [], _sam_matting_detail(result), _sam_matting_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _create_sam_matting_tab(state_value: Mapping[str, object]) -> None:
    defaults = sam_matting_defaults()
    with gr.Tab(
        _label("SAM Matting", "图像分割与智能抠图"),
        visible=sam_matting_available(),
        elem_id="forge_neo_sam_matting_tab",
    ):
        gr.HTML(_sam_matting_summary_html(), elem_id="forge_neo_sam_matting_summary")
        with gr.Tabs(elem_id="forge_neo_sam_matting_tools"):
            with gr.Tab(_label("Smart Matting", "智能抠图"), elem_id="forge_neo_sam_matting_rembg_tab"):
                with gr.Row(elem_classes=["forge-neo-sam-matting-layout"]):
                    with gr.Column(scale=1, elem_classes=["forge-neo-sam-matting-inputs"]):
                        matting_image = gr.Image(
                            label=_label("Input image", "输入图片"),
                            type="pil",
                            height=360,
                            elem_id="forge_neo_sam_matting_image",
                        )
                        with gr.Row():
                            matting_background_mode = gr.Radio(
                                choices=[("Transparent", "transparent"), ("Color", "color")],
                                value=str(defaults["background_mode"]),
                                label=_label("Background", "背景"),
                                elem_id="forge_neo_sam_matting_background_mode",
                            )
                            matting_background_color = gr.ColorPicker(
                                value=str(defaults["background_color"]),
                                label=_label("Background color", "背景颜色"),
                                elem_id="forge_neo_sam_matting_background_color",
                            )
                        matting_model = gr.Dropdown(
                            choices=[(label, value) for label, value in REMBG_MODELS.items()],
                            value=str(defaults["rembg_model"]),
                            label=_label("Matting model", "抠图模型"),
                            elem_id="forge_neo_sam_matting_model",
                        )
                        matting_process = gr.Button(
                            _label("Remove background", "开始抠图"),
                            variant="primary",
                            elem_id="forge_neo_sam_matting_process",
                        )
                    with gr.Column(scale=1, elem_classes=["forge-neo-sam-matting-output"]):
                        matting_gallery = gr.Gallery(
                            label=_label("Matting results", "抠图结果"),
                            columns=3,
                            height=360,
                            object_fit="contain",
                            elem_id="forge_neo_sam_matting_gallery",
                        )
                        matting_result = gr.Textbox(
                            label=_label("Result", "处理结果"),
                            lines=6,
                            elem_id="forge_neo_sam_matting_result",
                        )
                        matting_status = gr.HTML(
                            _sam_matting_status_html("Ready."),
                            elem_id="forge_neo_sam_matting_status",
                        )
                matting_process.click(
                    _sam_matting_background_clicked,
                    inputs=[matting_image, matting_background_mode, matting_background_color, matting_model],
                    outputs=[matting_gallery, matting_result, matting_status],
                )
            with gr.Tab(_label("SAM Segmentation", "SAM 自动分割"), elem_id="forge_neo_sam_segmentation_tab"):
                with gr.Row(elem_classes=["forge-neo-sam-matting-layout"]):
                    with gr.Column(scale=1, elem_classes=["forge-neo-sam-matting-inputs"]):
                        sam_image = gr.Image(
                            label=_label("Input image", "输入图片"),
                            type="pil",
                            height=360,
                            elem_id="forge_neo_sam_segmentation_image",
                        )
                        sam_source_image = gr.State(None)
                        sam_points = gr.State([])
                        with gr.Row():
                            sam_model = gr.Dropdown(
                                choices=[(label, value) for label, value in SAM_MODELS.items()],
                                value=str(defaults["sam_model"]),
                                label=_label("SAM model", "SAM 模型"),
                                elem_id="forge_neo_sam_segmentation_model",
                            )
                            sam_mode = gr.Radio(
                                choices=[("Limited", "limited"), ("All", "all")],
                                value=str(defaults["sam_mode"]),
                                label=_label("Mode", "模式"),
                                elem_id="forge_neo_sam_segmentation_mode",
                            )
                        sam_max_masks = gr.Slider(
                            1,
                            24,
                            value=int(defaults["sam_max_masks"]),
                            step=1,
                            label=_label("Max masks", "最大分割数"),
                            elem_id="forge_neo_sam_segmentation_max_masks",
                        )
                        sam_process = gr.Button(
                            _label("Run auto segmentation", "运行自动分割"),
                            variant="primary",
                            elem_id="forge_neo_sam_segmentation_process",
                        )
                        with gr.Row(elem_classes=["forge-neo-sam-point-actions"]):
                            sam_point_process = gr.Button(
                                _label("Run point segmentation", "按标记点分割"),
                                elem_id="forge_neo_sam_point_process",
                            )
                            sam_point_clear = gr.Button(
                                _label("Clear points", "清除标记点"),
                                elem_id="forge_neo_sam_point_clear",
                            )
                    with gr.Column(scale=1, elem_classes=["forge-neo-sam-matting-output"]):
                        sam_gallery = gr.Gallery(
                            label=_label("Segmentation results", "分割结果"),
                            columns=3,
                            height=360,
                            object_fit="contain",
                            elem_id="forge_neo_sam_segmentation_gallery",
                        )
                        sam_result = gr.Textbox(
                            label=_label("Result", "处理结果"),
                            lines=6,
                            elem_id="forge_neo_sam_segmentation_result",
                        )
                        sam_status = gr.HTML(
                            _sam_matting_status_html("Ready."),
                            elem_id="forge_neo_sam_segmentation_status",
                        )
                sam_process.click(
                    _sam_matting_sam_clicked,
                    inputs=[sam_image, sam_model, sam_mode, sam_max_masks],
                    outputs=[sam_gallery, sam_result, sam_status],
                )
                sam_image.upload(
                    _sam_matting_point_upload,
                    inputs=[sam_image],
                    outputs=[sam_source_image, sam_points, sam_result, sam_status],
                    queue=False,
                    show_progress=False,
                )
                sam_image.select(
                    _sam_matting_point_select,
                    inputs=[sam_image, sam_source_image, sam_points],
                    outputs=[sam_image, sam_source_image, sam_points, sam_result, sam_status],
                    queue=False,
                    show_progress=False,
                )
                sam_point_process.click(
                    _sam_matting_point_clicked,
                    inputs=[sam_source_image, sam_image, sam_points, sam_model],
                    outputs=[sam_gallery, sam_result, sam_status],
                )
                sam_point_clear.click(
                    _sam_matting_point_clear,
                    inputs=[sam_source_image, sam_image],
                    outputs=[sam_image, sam_points, sam_result, sam_status],
                    queue=False,
                    show_progress=False,
                )
            with gr.Tab(_label("Cleaner", "图像清理"), elem_id="forge_neo_sam_cleaner_tab"):
                with gr.Row(elem_classes=["forge-neo-sam-matting-layout"]):
                    with gr.Column(scale=1, elem_classes=["forge-neo-sam-matting-inputs"]):
                        cleaner_image = gr.ImageMask(
                            label=_label("Image and mask", "图片与遮罩"),
                            type="pil",
                            height=420,
                            brush=gr.Brush(default_size=32, default_color="#FFFFFF"),
                            elem_id="forge_neo_sam_cleaner_image",
                        )
                        cleaner_process = gr.Button(
                            _label("Clean masked area", "清理遮罩区域"),
                            variant="primary",
                            elem_id="forge_neo_sam_cleaner_process",
                        )
                    with gr.Column(scale=1, elem_classes=["forge-neo-sam-matting-output"]):
                        cleaner_gallery = gr.Gallery(
                            label=_label("Cleaner results", "清理结果"),
                            columns=2,
                            height=420,
                            object_fit="contain",
                            elem_id="forge_neo_sam_cleaner_gallery",
                        )
                        cleaner_result = gr.Textbox(
                            label=_label("Result", "处理结果"),
                            lines=6,
                            elem_id="forge_neo_sam_cleaner_result",
                        )
                        cleaner_status = gr.HTML(
                            _sam_matting_status_html("Ready."),
                            elem_id="forge_neo_sam_cleaner_status",
                        )
                cleaner_process.click(
                    _sam_matting_cleaner_clicked,
                    inputs=[cleaner_image],
                    outputs=[cleaner_gallery, cleaner_result, cleaner_status],
                )


def _see_through_status_html(message: str, *, ok: bool = True) -> str:
    class_name = "ok" if ok else "error"
    return f'<div class="forge-neo-see-through-status {class_name}">{html_lib.escape(str(message or ""))}</div>'


def _see_through_summary_html() -> str:
    status = see_through_status()
    rows = [
        ("Source", status.get("source_available")),
        ("Inference", status.get("inference_script_exists")),
        ("Output", status.get("output_dir")),
    ]
    items = "".join(
        f"<span><strong>{html_lib.escape(str(label))}</strong>{html_lib.escape(str(value))}</span>"
        for label, value in rows
    )
    return f'<div class="forge-neo-see-through-summary">{items}</div>'


def _see_through_process_clicked(image, save_psd, resolution, steps, seed, quantization, lr_split, cache_tag_embeds, timeout):
    result = run_see_through(
        image,
        save_psd=save_psd,
        resolution=resolution,
        steps=steps,
        seed=seed,
        quantization=quantization,
        lr_split=lr_split,
        cache_tag_embeds=cache_tag_embeds,
        timeout=timeout,
    )
    output = str(result.get("output") or "")
    command = " ".join(str(part) for part in result.get("command") or [])
    detail = "\n\n".join(part for part in [str(result.get("message") or ""), command, output] if part).strip()
    return detail, _see_through_status_html(result.get("message", ""), ok=bool(result.get("ok")))


def _create_see_through_tab(state_value: Mapping[str, object]) -> None:
    defaults = see_through_defaults()
    status = see_through_status()
    with gr.Tab(
        _label("See-Through", "See-Through 图层分离"),
        visible=see_through_available(),
        elem_id="forge_neo_see_through_tab",
    ):
        see_summary = gr.HTML(
            _see_through_summary_html(),
            elem_id="forge_neo_see_through_summary",
        )
        with gr.Row(elem_classes=["forge-neo-see-through-layout"]):
            with gr.Column(scale=1, elem_classes=["forge-neo-see-through-inputs"]):
                see_image = gr.Image(
                    label=_label("Input image", "输入图片"),
                    type="pil",
                    height=360,
                    elem_id="forge_neo_see_through_image",
                )
                with gr.Row():
                    see_save_psd = gr.Checkbox(
                        bool(defaults["save_psd"]),
                        label=_label("Save PSD", "保存 PSD"),
                        elem_id="forge_neo_see_through_save_psd",
                    )
                    see_quantization = gr.Radio(
                        choices=[("NF4", "nf4"), ("None", "none")],
                        value=str(defaults["quantization"]),
                        label=_label("Quantization", "量化"),
                        elem_id="forge_neo_see_through_quantization",
                    )
                with gr.Row():
                    see_resolution = gr.Slider(
                        512,
                        1536,
                        value=int(defaults["resolution"]),
                        step=64,
                        label=_label("Resolution", "处理分辨率"),
                        elem_id="forge_neo_see_through_resolution",
                    )
                    see_steps = gr.Slider(
                        10,
                        50,
                        value=int(defaults["steps"]),
                        step=5,
                        label=_label("Steps", "推理步数"),
                        elem_id="forge_neo_see_through_steps",
                    )
                with gr.Row():
                    see_seed = gr.Number(
                        value=int(defaults["seed"]),
                        precision=0,
                        label=_label("Seed", "随机种子"),
                        elem_id="forge_neo_see_through_seed",
                    )
                    see_timeout = gr.Number(
                        value=int(defaults["timeout"]),
                        precision=0,
                        label=_label("Timeout", "超时秒数"),
                        elem_id="forge_neo_see_through_timeout",
                    )
                with gr.Row():
                    see_lr_split = gr.Checkbox(
                        bool(defaults["lr_split"]),
                        label=_label("Left/right split", "左右分离"),
                        elem_id="forge_neo_see_through_lr_split",
                    )
                    see_cache = gr.Checkbox(
                        bool(defaults["cache_tag_embeds"]),
                        label=_label("Cache tag embeds", "缓存文本嵌入"),
                        elem_id="forge_neo_see_through_cache_tag_embeds",
                    )
                see_process = gr.Button(
                    _label("Start", "开始处理"),
                    variant="primary",
                    elem_id="forge_neo_see_through_process",
                )
            with gr.Column(scale=1, elem_classes=["forge-neo-see-through-output"]):
                gr.Textbox(
                    value=str(status.get("output_dir") or ""),
                    label=_label("Output directory", "输出目录"),
                    interactive=False,
                    elem_id="forge_neo_see_through_output_dir",
                )
                see_result = gr.Textbox(
                    label=_label("Result", "处理结果"),
                    lines=18,
                    elem_id="forge_neo_see_through_result",
                )
                see_status = gr.HTML(
                    _see_through_status_html("Ready."),
                    elem_id="forge_neo_see_through_status",
                )
        see_process.click(
            _see_through_process_clicked,
            inputs=[see_image, see_save_psd, see_resolution, see_steps, see_seed, see_quantization, see_lr_split, see_cache, see_timeout],
            outputs=[see_result, see_status],
        )


def _trellis2_status_html(message: str, *, ok: bool = True) -> str:
    class_name = "ok" if ok else "error"
    return f'<div class="forge-neo-trellis2-status {class_name}">{html_lib.escape(str(message or ""))}</div>'


def _trellis2_summary_html() -> str:
    status = trellis2_status()
    dependencies = status.get("dependencies") or {}
    rows = [
        ("Source", status.get("source_available")),
        ("Pipeline", status.get("pipeline_config_exists")),
        ("torch", dependencies.get("torch")),
        ("flash_attn", dependencies.get("flash_attn")),
        ("nvdiffrast", dependencies.get("nvdiffrast")),
        ("utils3d", dependencies.get("utils3d")),
    ]
    items = "".join(
        f"<span><strong>{html_lib.escape(str(label))}</strong>{html_lib.escape(str(value))}</span>"
        for label, value in rows
    )
    return f'<div class="forge-neo-trellis2-summary">{items}</div>'


def _trellis2_generate_clicked(image, seed, randomize_seed, guidance_scale, steps, octree_resolution, simplify_ratio, texture_resolution, env_map, use_flash_attn):
    result = generate_trellis2_3d(
        image,
        seed,
        randomize_seed,
        guidance_scale,
        steps,
        octree_resolution,
        simplify_ratio,
        texture_resolution,
        env_map,
        use_flash_attn,
    )
    return (
        str(result.get("message") or ""),
        result.get("model"),
        result.get("preview"),
        _trellis2_status_html(result.get("message", ""), ok=bool(result.get("ok"))),
    )


def _create_trellis2_tab(state_value: Mapping[str, object]) -> None:
    if render_source_extension_tab(
        "sd-webui-trellis2",
        "scripts/trellis2_script.py",
        "on_ui_tabs",
        visible=trellis2_available(),
    ):
        return

    defaults = trellis2_defaults()
    with gr.Tab(
        _label("TRELLIS.2", "TRELLIS.2 图生成3D"),
        visible=trellis2_available(),
        elem_id="forge_neo_trellis2_tab",
    ):
        gr.HTML(_trellis2_summary_html(), elem_id="forge_neo_trellis2_summary")
        with gr.Row(elem_classes=["forge-neo-trellis2-layout"]):
            with gr.Column(scale=1, elem_classes=["forge-neo-trellis2-inputs"]):
                trellis_image = gr.Image(
                    label=_label("Input image", "输入图片"),
                    type="pil",
                    height=360,
                    elem_id="forge_neo_trellis2_image",
                )
                with gr.Row():
                    trellis_seed = gr.Number(
                        value=int(defaults["seed"]),
                        precision=0,
                        label=_label("Seed", "随机种子"),
                        elem_id="forge_neo_trellis2_seed",
                    )
                    trellis_randomize_seed = gr.Checkbox(
                        bool(defaults["randomize_seed"]),
                        label=_label("Randomize seed", "随机种子"),
                        elem_id="forge_neo_trellis2_randomize_seed",
                    )
                trellis_guidance = gr.Slider(
                    1.0,
                    10.0,
                    value=float(defaults["guidance_scale"]),
                    step=0.5,
                    label=_label("Guidance scale", "引导系数"),
                    elem_id="forge_neo_trellis2_guidance_scale",
                )
                trellis_steps = gr.Slider(
                    10,
                    100,
                    value=int(defaults["steps"]),
                    step=5,
                    label=_label("Steps", "推理步数"),
                    elem_id="forge_neo_trellis2_steps",
                )
                with gr.Row():
                    trellis_octree = gr.Dropdown(
                        choices=["512", "1024", "1536"],
                        value=str(defaults["octree_resolution"]),
                        label=_label("Octree resolution", "八叉树分辨率"),
                        elem_id="forge_neo_trellis2_octree_resolution",
                    )
                    trellis_texture = gr.Slider(
                        512,
                        4096,
                        value=int(defaults["texture_resolution"]),
                        step=256,
                        label=_label("Texture resolution", "纹理分辨率"),
                        elem_id="forge_neo_trellis2_texture_resolution",
                    )
                with gr.Row():
                    trellis_simplify = gr.Slider(
                        0.0,
                        1.0,
                        value=float(defaults["simplify_ratio"]),
                        step=0.05,
                        label=_label("Simplify ratio", "网格简化比例"),
                        elem_id="forge_neo_trellis2_simplify_ratio",
                    )
                    trellis_env = gr.Dropdown(
                        choices=[("None", "none"), ("Forest", "forest"), ("Sunset", "sunset")],
                        value=str(defaults["env_map"]),
                        label=_label("Environment map", "环境贴图"),
                        elem_id="forge_neo_trellis2_env_map",
                    )
                trellis_flash = gr.Checkbox(
                    bool(defaults["use_flash_attn"]),
                    label=_label("Use Flash Attention", "使用 Flash Attention"),
                    elem_id="forge_neo_trellis2_use_flash_attn",
                )
                trellis_generate = gr.Button(
                    _label("Generate 3D model", "生成3D模型"),
                    variant="primary",
                    elem_id="forge_neo_trellis2_generate",
                )
            with gr.Column(scale=1, elem_classes=["forge-neo-trellis2-output"]):
                trellis_result = gr.Textbox(
                    label=_label("Status", "状态"),
                    lines=8,
                    elem_id="forge_neo_trellis2_result",
                )
                trellis_preview = gr.Image(
                    label=_label("Preview", "预览图"),
                    height=240,
                    interactive=False,
                    elem_id="forge_neo_trellis2_preview",
                )
                trellis_model = gr.Model3D(
                    label=_label("3D model", "3D 模型"),
                    height=360,
                    elem_id="forge_neo_trellis2_model",
                )
                trellis_status = gr.HTML(
                    _trellis2_status_html("Ready."),
                    elem_id="forge_neo_trellis2_status",
                )
        trellis_generate.click(
            _trellis2_generate_clicked,
            inputs=[
                trellis_image,
                trellis_seed,
                trellis_randomize_seed,
                trellis_guidance,
                trellis_steps,
                trellis_octree,
                trellis_simplify,
                trellis_texture,
                trellis_env,
                trellis_flash,
            ],
            outputs=[trellis_result, trellis_model, trellis_preview, trellis_status],
        )


def _default_prompt(preset: str | None = None, choices=None) -> str:
    preset_key = str(preset or "").strip()
    if not preset_key:
        return ""
    model_choices = choices or refresh_model_choices(preset_key)
    defaults = preset_model_defaults(preset_key, model_choices)
    prompt = ""
    for name in defaults.loras:
        prompt = _insert_lora_token(prompt, name, defaults.lora_weights.get(name, 1.0))
    return prompt


def _hires_checkpoint_choices(choices) -> list[object]:
    return _localized_value_choices([("Use same checkpoint", "使用同一模型")]) + list(getattr(choices, "checkpoints", []) or [])


def _refiner_checkpoint_choices(choices) -> list[object]:
    return _localized_value_choices([("None", "无")]) + list(getattr(choices, "checkpoints", []) or [])


def _hires_module_choices(choices) -> list[object]:
    modules = module_choices(choices)
    return _localized_value_choices([("Use same choices", "使用同一组")]) + modules


def _model_default_updates(preset: str, choices):
    defaults = preset_model_defaults(preset, choices)
    return (
        gr.update(choices=choices.checkpoints, value=defaults.checkpoint),
        gr.update(choices=choices.vae, value=defaults.vae),
        gr.update(choices=module_choices(choices), value=defaults.modules),
        gr.update(value=defaults.low_bits),
    )


def _module_selection_for_request(text_encoders: object) -> tuple[str, list[str]]:
    if isinstance(text_encoders, str):
        values = [text_encoders] if text_encoders.strip() else []
    elif isinstance(text_encoders, (list, tuple, set)):
        values = list(text_encoders)
    else:
        values = []
    return split_module_selection(values, fallback_vae="None")


def _text_encoders_changed(text_encoders: list[str] | tuple[str, ...] | None):
    selected_vae, _selected_text_encoders = _module_selection_for_request(text_encoders)
    return gr.update(value=selected_vae)


def _lora_default_updates(preset: str, choices) -> tuple[object, dict[str, float]]:
    defaults = preset_model_defaults(preset, choices)
    return gr.update(choices=choices.loras, value=defaults.loras), dict(defaults.lora_weights)


def _normalize_lora_weights(value: object) -> dict[str, float]:
    raw = value
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = {}
    if not isinstance(raw, dict):
        return {}
    weights: dict[str, float] = {}
    for key, weight in raw.items():
        text = str(key or "").strip()
        if not text:
            continue
        try:
            number = float(weight)
        except Exception:
            continue
        weights[text] = number
    return weights


def _modulated_guidance_clip_choices(choices) -> list[object]:
    return _localized_value_choices([("None", "无")]) + list(getattr(choices, "text_encoders", []) or [])


def _script_dropdown_choices(*, is_img2img: bool = False) -> list[object]:
    return _localized_value_choices([("None", "无")]) + script_dropdown_choices(is_img2img=is_img2img)


def _default_modulated_guidance_clip(choices) -> str:
    return first_or_none(list(getattr(choices, "text_encoders", []) or [])) or "None"


def _controlnet_model_choices(choices) -> list[object]:
    return _localized_value_choices([("None", "无")]) + list(getattr(choices, "controlnet", []) or [])


def _controlnet_type_value(value: str | None) -> str:
    raw = str(value or "All")
    for en, cn in CONTROLNET_TYPES:
        if raw in {en, cn}:
            return en
    return "All"


def _controlnet_preprocessor_choices(control_type: str | None) -> list[object]:
    key = _controlnet_type_value(control_type)
    preprocessors = CONTROLNET_PREPROCESSORS_BY_TYPE.get(key, CONTROLNET_PREPROCESSORS)
    return _localized_value_choices([("None", "无")]) + [item for item in preprocessors if item != "None"]


def _default_controlnet_preprocessor(control_type: str | None) -> str:
    key = _controlnet_type_value(control_type)
    preprocessors = CONTROLNET_PREPROCESSORS_BY_TYPE.get(key, CONTROLNET_PREPROCESSORS)
    if key != "All" and len(preprocessors) > 1:
        return preprocessors[1]
    return "None"


def _filter_controlnet_model_choices(choices, control_type: str | None) -> list[object]:
    base = list(getattr(choices, "controlnet", []) or [])
    key = _controlnet_type_value(control_type)
    if key == "All":
        filtered = base
    else:
        needles = [key.lower().replace("-", ""), key.lower().replace("-", "_")]
        if key == "IP-Adapter":
            needles.extend(["ipadapter", "ip_adapter"])
        elif key == "T2I-Adapter":
            needles.extend(["t2iadapter", "t2i_adapter", "t2ia"])
        elif key == "NormalMap":
            needles.extend(["normal", "normalmap"])
        elif key == "SoftEdge":
            needles.extend(["softedge", "hed", "pidinet", "teed"])
        filtered = [name for name in base if any(needle in str(name).lower().replace("-", "").replace(" ", "") for needle in needles)]
    return _localized_value_choices([("None", "无")]) + filtered


def _default_controlnet_model(choices: list[object], control_type: str | None) -> str:
    key = _controlnet_type_value(control_type)
    if key != "All" and len(choices) > 1:
        item = choices[1]
        if isinstance(item, (tuple, list)) and len(item) >= 2:
            return str(item[1])
        return str(item)
    return "None"


def _controlnet_preprocessor_key(module: str | None) -> str:
    raw = str(module or "None").lower()
    if raw == "none" or raw == "无":
        return "None"
    if "invert" in raw:
        return "invert"
    if "canny" in raw:
        return "canny"
    if raw.startswith("tile"):
        return "tile"
    if raw.startswith("inpaint"):
        return "inpaint_only"
    if any(token in raw for token in ["depth", "openpose", "densepose", "mediapipe", "lineart", "scribble", "softedge", "mlsd", "normal", "seg_", "threshold"]):
        return "depth"
    return "None"


def _controlnet_type_changed(control_type: str | None, preset: str | None, pixel_perfect: bool = False):
    module_choices = _controlnet_preprocessor_choices(control_type)
    module_value = _default_controlnet_preprocessor(control_type)
    model_choices = _filter_controlnet_model_choices(refresh_model_choices(preset or "klein"), control_type)
    model_value = _default_controlnet_model(model_choices, control_type)
    slider_updates = list(_controlnet_slider_update(module_value, pixel_perfect))
    model_visible = bool(slider_updates[4].get("visible", True)) if isinstance(slider_updates[4], dict) else True
    model_update = gr.update(choices=model_choices, value=model_value, visible=model_visible)
    return (
        gr.update(choices=module_choices, value=module_value),
        model_update,
        slider_updates[0],
        slider_updates[1],
        slider_updates[2],
        slider_updates[3],
        slider_updates[5],
        slider_updates[6],
    )


def _extras_upscaler_choices(include_none: bool = False) -> list[tuple[str, str]]:
    items = [
        ("Nearest", "Nearest-最近邻"),
        ("Bilinear", "Bilinear-双线性"),
        ("Bicubic", "Bicubic-双三次"),
        ("Lanczos", "Lanczos-兰索斯"),
        ("ESRGAN", "ESRGAN"),
    ]
    items.extend((name, name) for name in upscale_model_names())
    if include_none:
        items.insert(0, ("None", "None-无"))
    choices: list[tuple[str, str]] = []
    seen: set[str] = set()
    for value, label in items:
        value = str(value or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        choices.append((value, label))
    return _localized_value_choices(choices)


def _low_bit_choices() -> list[object]:
    return [
        (_label("Automatic", "自动"), "Automatic"),
        "Float8 e4m3fn",
        "Float8 e5m2",
        "NF4",
        (_label("None", "无"), "None"),
    ]


def _controlnet_model_updates(choices) -> list[object]:
    return [
        gr.update(choices=_controlnet_model_choices(choices), value="None")
        for _ in range(CONTROLNET_UNIT_COUNT * 2)
    ]


def _merger_model_updates(choices) -> list[object]:
    checkpoints = list(getattr(choices, "checkpoints", []) or [])
    vae_choices = ["None", *list(getattr(choices, "vae", []) or [])]
    return [
        gr.update(choices=checkpoints, value=first_or_none(checkpoints)),
        gr.update(choices=checkpoints, value=first_or_none(checkpoints)),
        gr.update(choices=checkpoints, value=first_or_none(checkpoints)),
        gr.update(choices=vae_choices, value="None"),
    ]


def _names_for_extra_kind(choices, kind: str) -> list[str]:
    if kind == "checkpoints":
        return list(getattr(choices, "checkpoints", []) or [])
    if kind == "textual_inversion":
        return list(getattr(choices, "embeddings", []) or [])
    if kind == "lora":
        return list(getattr(choices, "loras", []) or [])
    return []


def _filter_names(names: list[str], query: str | None) -> list[str]:
    raw_query = str(query or "").strip().lower()
    if not raw_query:
        return list(names)
    terms = [part for part in raw_query.replace("\\", "/").split() if part]
    return [name for name in names if all(term in name.lower().replace("\\", "/") for term in terms)]


def _extra_token_name(name: str) -> str:
    clean = str(name or "").replace("\\", "/").rsplit("/", 1)[-1]
    if "." in clean:
        clean = clean.rsplit(".", 1)[0]
    return clean


_EXTRA_NETWORK_PREVIEW_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif")


def _extra_network_catalogs(kind: str) -> tuple[str, ...]:
    if kind == "checkpoints":
        return ("diffusion_models", "checkpoints")
    if kind == "textual_inversion":
        return ("embeddings",)
    if kind == "lora":
        return ("loras",)
    return ()


def _extra_network_model_path(kind: str, name: str) -> Path | None:
    catalogs = _extra_network_catalogs(kind)
    if not catalogs:
        return None
    try:
        model_path_text = find_model_path(str(name or ""), *catalogs)
    except Exception:
        model_path_text = ""
    if not model_path_text:
        return None
    return Path(model_path_text)


def _extra_network_preview_url(model_path: Path | None) -> str:
    if model_path is None:
        return ""
    base = model_path.with_suffix("")
    for extension in _EXTRA_NETWORK_PREVIEW_EXTENSIONS:
        for candidate in (Path(str(base) + extension), Path(str(base) + ".preview" + extension)):
            try:
                if candidate.is_file():
                    quoted = urllib.parse.quote(str(candidate.resolve()).replace("\\", "/"))
                    return "./sd_extra_networks/thumb?filename=" + quoted
            except OSError:
                continue
    return ""


def _extra_network_sidecar_metadata(model_path: Path | None) -> dict[str, object]:
    if model_path is None:
        return {}
    target = Path(str(model_path.with_suffix("")) + ".json")
    try:
        if target.is_file():
            loaded = json.loads(target.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                return loaded
    except Exception:
        return {}
    return {}


def _extra_network_sidecar_text(metadata: dict[str, object], key: str) -> str:
    value = metadata.get(key)
    if value is None:
        return ""
    return str(value).strip()


def _extra_network_file_sort_attrs(model_path: Path | None) -> tuple[str, str, str]:
    if model_path is None:
        return "", "0", "0"
    try:
        stat = model_path.stat()
        return str(model_path), str(int(stat.st_ctime)), str(int(stat.st_mtime))
    except OSError:
        return str(model_path), "0", "0"


def _extra_network_parent_dirs(names: list[str]) -> list[str]:
    dirs: list[str] = []
    seen: set[str] = set()
    for name in names:
        normalized = str(name or "").replace("\\", "/").strip("/")
        parts = [part for part in normalized.split("/")[:-1] if part]
        for index in range(1, len(parts) + 1):
            directory = "/".join(parts[:index]) + "/"
            key = directory.casefold()
            if key in seen:
                continue
            seen.add(key)
            dirs.append(directory)
    return dirs[:36]


def _extra_network_active_dir(query: str | None) -> str:
    raw = str(query or "").strip()
    if not raw.endswith(("/", "\\")):
        return ""
    normalized = raw.replace("\\", "/").strip("/")
    return f"{normalized}/" if normalized else ""


def _extra_network_dir_buttons(names: list[str], active_dir: str | None = "") -> str:
    dirs = _extra_network_parent_dirs(names)
    normalized_active_dir = str(active_dir or "").replace("\\", "/").strip("/")
    normalized_active_dir = f"{normalized_active_dir}/" if normalized_active_dir else ""
    all_label = html_lib.escape(_label("all", "全部"))
    all_class = "forge-neo-extra-dir" + ("" if normalized_active_dir else " is-active")
    all_pressed = "false" if normalized_active_dir else "true"
    buttons = [
        f'<button type="button" class="{all_class}" data-dir="" aria-pressed="{all_pressed}">'
        f"{all_label}</button>"
    ]
    for directory in dirs:
        safe_dir = html_lib.escape(directory, quote=True)
        safe_label = html_lib.escape(directory.replace("/", "\\"))
        active = directory.casefold() == normalized_active_dir.casefold()
        active_class = " is-active" if active else ""
        pressed = "true" if active else "false"
        buttons.append(f'<button type="button" class="forge-neo-extra-dir{active_class}" data-dir="{safe_dir}" aria-pressed="{pressed}">{safe_label}</button>')
    return f'<div class="forge-neo-extra-dir-row">{"".join(buttons)}</div>'


def _extra_network_cards(kind: str, names: list[str], weights: dict[str, float] | None = None, active_dir: str | None = "") -> str:
    safe_kind = html_lib.escape(str(kind or ""), quote=True)
    if not names:
        empty = html_lib.escape(_label("No items.", "暂无项目。"))
        return f'<div class="forge-neo-extra-pane" data-kind="{safe_kind}"><div class="forge-neo-extra-empty">{empty}</div></div>'
    weight_values = weights if isinstance(weights, dict) else {}
    visible = names[:80]
    cards = []
    thumb_placeholder = html_lib.escape(_label("N/A", "无预览"))
    for name in visible:
        label = html_lib.escape(_extra_token_name(name))
        normalized_path = str(name).replace("\\", "/").strip("/")
        path = html_lib.escape(normalized_path)
        attr_path = html_lib.escape(normalized_path, quote=True)
        directory = normalized_path.rsplit("/", 1)[0] + "/" if "/" in normalized_path else ""
        attr_dir = html_lib.escape(directory, quote=True)
        model_path = _extra_network_model_path(kind, name)
        sidecar_metadata = _extra_network_sidecar_metadata(model_path) if kind == "lora" else {}
        filename, created_time, modified_time = _extra_network_file_sort_attrs(model_path)
        preview_url = _extra_network_preview_url(model_path)
        raw_weight = None
        sidecar_weight = sidecar_metadata.get("preferred weight")
        if kind == "lora" and sidecar_weight not in (None, ""):
            raw_weight = sidecar_weight
        for key in (name, normalized_path, _extra_token_name(name)):
            if raw_weight is None and key in weight_values:
                raw_weight = weight_values[key]
                break
        weight_attr = ""
        if kind == "lora" and raw_weight is not None:
            weight_attr = f' data-weight="{html_lib.escape(_format_lora_weight(raw_weight), quote=True)}"'
        prompt_attrs = ""
        if kind == "lora":
            activation_text = _extra_network_sidecar_text(sidecar_metadata, "activation text")
            negative_text = _extra_network_sidecar_text(sidecar_metadata, "negative text")
            prompt_attrs = (
                f' data-activation-text="{html_lib.escape(activation_text, quote=True)}"'
                f' data-negative-text="{html_lib.escape(negative_text, quote=True)}"'
            )
        metadata_tool = (
            '<span class="forge-neo-extra-card-tool forge-neo-extra-card-tool-metadata" '
            'data-extra-action="metadata" title="Show internal metadata">i</span>'
            if kind == "lora"
            else ""
        )
        if preview_url:
            safe_preview = html_lib.escape(preview_url, quote=True)
            thumb = (
                f'<div class="forge-neo-extra-thumb forge-neo-extra-thumb-has-image" data-preview="{safe_preview}">'
                f'<img src="{safe_preview}" alt="" loading="lazy"></div>'
            )
        else:
            thumb = f'<div class="forge-neo-extra-thumb">{thumb_placeholder}</div>'
        cards.append(
            '<button type="button" class="forge-neo-extra-card" '
            f'data-kind="{safe_kind}" data-name="{attr_path}" data-dir="{attr_dir}" data-path="{attr_path}" '
            f'data-filename="{html_lib.escape(filename, quote=True)}" data-sort-name="{html_lib.escape(_extra_token_name(name).casefold(), quote=True)}" '
            f'data-sort-created="{created_time}" data-sort-modified="{modified_time}"{weight_attr}{prompt_attrs} aria-pressed="false">'
            f"{thumb}"
            '<span class="forge-neo-extra-card-tools" aria-hidden="true">'
            '<span class="forge-neo-extra-card-tool" data-extra-action="copy" title="Copy path">⎘</span>'
            f"{metadata_tool}"
            '<span class="forge-neo-extra-card-tool" data-extra-action="edit" title="Edit metadata">🛠</span>'
            "</span>"
            '<div class="forge-neo-extra-card-text">'
            f'<span class="forge-neo-extra-name">{label}</span>'
            f'<span class="forge-neo-extra-path">{path}</span>'
            "</div></button>"
        )
    more = ""
    if len(names) > len(visible):
        remaining = len(names) - len(visible)
        more = f'<div class="forge-neo-extra-more">{html_lib.escape(_label(f"+{remaining} more", f"另有 {remaining} 项"))}</div>'
    return (
        f'<div class="forge-neo-extra-pane" data-kind="{safe_kind}">'
        f"{_extra_network_dir_buttons(names, active_dir)}"
        f'<div class="forge-neo-extra-grid">{"".join(cards)}{more}</div>'
        "</div>"
    )


def _extra_browser_update(kind: str, choices, query: str | None = "", weights: dict[str, float] | None = None):
    names = _filter_names(_names_for_extra_kind(choices, kind), query)
    return gr.update(choices=names, value=first_or_none(names) if names else None), _extra_network_cards(kind, names, weights, active_dir=_extra_network_active_dir(query))


def _extra_browser_updates(preset: str, choices) -> list[object]:
    updates: list[object] = []
    defaults = preset_model_defaults(preset, choices)
    for _prefix in ("txt2img", "img2img"):
        for kind in ("textual_inversion", "checkpoints", "lora"):
            updates.extend(_extra_browser_update(kind, choices, weights=defaults.lora_weights if kind == "lora" else None))
    return updates


def _calc_hires_resolution(enable: bool, width: int, height: int, scale: float, resize_x: int, resize_y: int, state):
    if not enable:
        return ""
    base_width = int(width or 0)
    base_height = int(height or 0)
    factor = float(scale or 1.0)
    target_width = int(resize_x or 0) or round(base_width * factor)
    target_height = int(resize_y or 0) or round(base_height * factor)
    return _status(state, f"Upscaled resolution: {target_width}x{target_height}", f"放大后分辨率：{target_width}x{target_height}")


def _editor_background(value):
    if isinstance(value, dict):
        return value.get("background") or value.get("composite")
    return value


def _editor_composite(value):
    if isinstance(value, dict):
        return value.get("composite") or value.get("background")
    return value


def _editor_mask(value):
    if not isinstance(value, dict):
        return None
    layers = value.get("layers") or []
    return layers[-1] if layers else None


def _canvas_image(value):
    return _image_from_value(value)


def _canvas_composite(background, foreground):
    if foreground is None and isinstance(background, dict):
        return _editor_composite(background)
    base = _canvas_image(background)
    drawing = _canvas_image(foreground)
    if base is None:
        return drawing
    if drawing is None:
        return base
    if drawing.size != base.size:
        drawing = drawing.resize(base.size)
    return Image.alpha_composite(base.convert("RGBA"), drawing.convert("RGBA"))


def _switch_dimensions_clicked(width: int | float | None, height: int | float | None, state):
    swapped_width = int(height or 0) or gr.update()
    swapped_height = int(width or 0) or gr.update()
    return swapped_width, swapped_height, _output_status_update(_status(state, "Width and height switched.", "宽高已互换。"))


def _round_img2img_dimension(value: int | float | None) -> int:
    rounded = int(round(float(value or 0) / 8.0) * 8)
    return min(2048, max(64, rounded or 64))


def _selected_img2img_source(
    mode: str,
    img2img_image,
    sketch_image,
    inpaint_image,
    inpaint_sketch_image,
    inpaint_upload_image,
    sketch_foreground=None,
    inpaint_foreground=None,
    inpaint_sketch_foreground=None,
):
    return {
        "img2img": _canvas_image(img2img_image) or _editor_background(img2img_image),
        "sketch": _canvas_composite(sketch_image, sketch_foreground) or _editor_composite(sketch_image),
        "inpaint": _canvas_image(inpaint_image) or _editor_background(inpaint_image),
        "inpaint_sketch": _canvas_composite(inpaint_sketch_image, inpaint_sketch_foreground) or _editor_composite(inpaint_sketch_image),
        "inpaint_upload": inpaint_upload_image,
    }.get(str(mode or "img2img"), _canvas_image(img2img_image) or _editor_background(img2img_image))


def _detect_img2img_size_clicked(mode: str, img2img_image, sketch_image, inpaint_image, inpaint_sketch_image, inpaint_upload_image, state):
    source = _selected_img2img_source(mode, img2img_image, sketch_image, inpaint_image, inpaint_sketch_image, inpaint_upload_image)
    image = _image_from_value(source)
    if image is None:
        return gr.update(), gr.update(), _output_status_update(_status(state, "No input image size found.", "没有找到输入图尺寸。"))
    width, height = image.size
    return width, height, _output_status_update(_status(state, f"Image size detected: {width}x{height}", f"已读取图片尺寸：{width}x{height}"))


def _img2img_canvas_target_label(mode: str, state) -> tuple[str, str]:
    for target_mode, _button_en, _button_cn, label_en, label_cn in IMG2IMG_CANVAS_COPY_TARGETS:
        if target_mode == mode:
            return label_en, label_cn
    return str(mode or "img2img"), str(mode or "图生图")


def _copy_img2img_canvas_clicked(background, foreground, source_mode: str, target_mode: str, state):
    source = str(source_mode or "img2img")
    target = str(target_mode or "img2img")
    if source in IMG2IMG_CANVAS_COMPOSITE_COPY_MODES:
        image = _canvas_composite(background, foreground)
    else:
        image = _canvas_image(background) or _editor_background(background)
    if image is None:
        return (
            gr.update(),
            gr.update(),
            target,
            _output_status_update(_status(state, "No canvas image to copy.", "没有可复制的画布图片。")),
        )
    label_en, label_cn = _img2img_canvas_target_label(target, state)
    return (
        image,
        None,
        target,
        _output_status_update(_status(state, f"Canvas copied to {label_en}.", f"画布已复制到{label_cn}。")),
    )


def _round_to_multiple_of_eight(value: int | float) -> int:
    number = int(round(float(value or 0)))
    remainder = number % 8
    return number - remainder if remainder <= 4 else number + (8 - remainder)


def _create_controlnet_canvas_clicked(canvas_height: int | float | None, canvas_width: int | float | None, state):
    width = max(64, int(canvas_width or 512))
    height = max(64, int(canvas_height or 512))
    image = Image.new("RGB", (width, height), (0, 0, 0))
    message = _status(state, f"New ControlNet canvas created: {width}x{height}.", f"已创建 ControlNet 新画布：{width}x{height}。")
    return image, gr.update(visible=False), _output_status_update(message)


def _create_regional_prompter_mask_canvas(canvas_height: int | float | None, canvas_width: int | float | None):
    width = max(64, min(int(canvas_width or 512), 2048))
    height = max(64, min(int(canvas_height or 512), 2048))
    return Image.new("RGB", (width, height), (0, 0, 0)), None


def _send_controlnet_dimensions_clicked(image, state):
    source = _canvas_image(image)
    if source is None:
        return gr.update(), gr.update(), _output_status_update(_status(state, "No ControlNet image size found.", "没有找到 ControlNet 图片尺寸。"))
    width, height = source.size
    rounded_width = _round_to_multiple_of_eight(width)
    rounded_height = _round_to_multiple_of_eight(height)
    message = _status(
        state,
        f"ControlNet image size sent: {rounded_width}x{rounded_height}.",
        f"已发送 ControlNet 图片尺寸：{rounded_width}x{rounded_height}。",
    )
    return rounded_width, rounded_height, _output_status_update(message)


def _controlnet_allow_preview_changed(enabled: bool):
    if enabled:
        return gr.update(visible=True), gr.update(visible=False), gr.update()
    return gr.update(visible=False), gr.update(visible=False), None


def _controlnet_use_mask_changed(enabled: bool, canvas_height: int | float | None, canvas_width: int | float | None, state):
    if not enabled:
        message = _status(state, "ControlNet mask disabled.", "ControlNet 蒙版已关闭。")
        return gr.update(visible=False), None, _output_status_update(message)
    width = max(64, int(canvas_width or 512))
    height = max(64, int(canvas_height or 512))
    image = Image.new("RGB", (width, height), (0, 0, 0))
    message = _status(state, f"ControlNet mask canvas created: {width}x{height}.", f"已创建 ControlNet 蒙版画布：{width}x{height}。")
    return gr.update(visible=True), image, _output_status_update(message)


def _controlnet_encode_preview_image(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _controlnet_decode_preview_image(value: object) -> Image.Image:
    text = str(value or "").strip()
    if text.startswith("data:image/") and "," in text:
        text = text.split(",", 1)[1]
    raw = base64.b64decode(text, validate=False)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _source_controlnet_detect_for_ui(payload: dict[str, object]) -> dict[str, object]:
    from forge_neo.runtime_backend.source_runtime import run_source_controlnet_detect

    return run_source_controlnet_detect(payload)


def _controlnet_run_preprocessor_clicked(image, module: str | None, processor_res: int | float | None, threshold_a: int | float | None, threshold_b: int | float | None, state):
    source = _canvas_image(image)
    if source is None:
        return (
            gr.update(visible=False),
            None,
            False,
            gr.update(visible=False),
            _output_status_update(_status(state, "No ControlNet image to preview.", "没有可预览的 ControlNet 图片。")),
        )
    module_name = str(module or "None")
    payload = {
        "controlnet_module": module_name,
        "controlnet_input_images": [_controlnet_encode_preview_image(source)],
        "controlnet_processor_res": int(processor_res or 512),
        "controlnet_threshold_a": float(threshold_a if threshold_a is not None else 64),
        "controlnet_threshold_b": float(threshold_b if threshold_b is not None else 64),
    }
    try:
        result = _source_controlnet_detect_for_ui(payload)
    except Exception as exc:
        message = _status(
            state,
            f"ControlNet source preprocessor failed: {type(exc).__name__}: {exc}",
            f"ControlNet 源后端预处理失败：{type(exc).__name__}: {exc}",
        )
        return gr.update(visible=False), None, False, gr.update(visible=False), _output_status_update(message)
    if not result.get("ok", True):
        detail = str(result.get("error") or "ControlNet detect failed")
        message = _status(state, f"ControlNet source preprocessor failed: {detail}", f"ControlNet 源后端预处理失败：{detail}")
        return gr.update(visible=False), None, False, gr.update(visible=False), _output_status_update(message)
    result_images = list(result.get("images") or [])
    if not result_images:
        message = _status(state, "ControlNet source preprocessor returned no image.", "ControlNet 源后端预处理未返回图片。")
        return gr.update(visible=False), None, False, gr.update(visible=False), _output_status_update(message)
    try:
        preview = _controlnet_decode_preview_image(result_images[0])
    except Exception as exc:
        message = _status(
            state,
            f"ControlNet source preprocessor returned non-image data: {type(exc).__name__}: {exc}",
            f"ControlNet 源后端预处理返回的不是图片：{type(exc).__name__}: {exc}",
        )
        return gr.update(visible=False), None, False, gr.update(visible=False), _output_status_update(message)
    message = _status(
        state,
        f"ControlNet preview refreshed: {module_name}, res {int(processor_res or 512)}, thresholds {threshold_a}/{threshold_b}.",
        f"已刷新 ControlNet 预览：{module_name}，分辨率 {int(processor_res or 512)}，阈值 {threshold_a}/{threshold_b}。",
    )
    return gr.update(visible=True), preview, True, gr.update(visible=False), _output_status_update(message)


def _controlnet_img2img_independent_changed(enabled: bool):
    visible = bool(enabled)
    return (
        gr.update(value=None),
        gr.update(value=False, visible=visible),
        gr.update(visible=visible),
        gr.update(visible=visible),
        gr.update(visible=visible),
        gr.update(value=False, visible=visible),
        gr.update(visible=False),
        None,
        gr.update(visible=False),
        None,
        gr.update(value=False, visible=False),
    )


def _controlnet_slider_update(module: str | None, pixel_perfect: bool = False):
    key = _controlnet_preprocessor_key(module)
    config = CONTROLNET_PREPROCESSOR_SLIDERS.get(key, CONTROLNET_PREPROCESSOR_SLIDERS["None"])

    def slider_update(name: str):
        slider = dict(config[name])
        label_en, label_cn = slider.pop("label")
        visible = bool(slider.pop("visible", False))
        if name == "processor_res" and pixel_perfect:
            visible = False
        return gr.update(
            visible=visible,
            label=_label(label_en, label_cn),
            minimum=slider["minimum"],
            maximum=slider["maximum"],
            step=slider["step"],
            value=slider["value"],
        )

    processor_visible = bool(config["processor_res"]["visible"]) and not bool(pixel_perfect)
    any_slider_visible = processor_visible or bool(config["threshold_a"]["visible"]) or bool(config["threshold_b"]["visible"])
    return (
        gr.update(visible=any_slider_visible),
        slider_update("processor_res"),
        slider_update("threshold_a"),
        slider_update("threshold_b"),
        gr.update(visible=bool(config.get("model_visible", True))),
        gr.update(visible=bool(config.get("model_visible", True))),
        gr.update(visible=bool(config.get("control_mode_visible", True))),
    )


def _xyz_axis_choices(*, is_img2img: bool) -> list[str]:
    return list(XYZ_IMG2IMG_AXIS_CHOICES if is_img2img else XYZ_TXT2IMG_AXIS_CHOICES)


def _xyz_model_choices() -> object:
    try:
        return refresh_model_choices(initial_preset() or "klein")
    except Exception:
        return initial_model_choices("klein")


def _unique_text_choices(values: list[object]) -> list[str]:
    choices: list[str] = []
    for value in values:
        text = str(value or "").strip().strip('"')
        if text and text not in choices:
            choices.append(text)
    return choices


def _localized_none_choice(value: str) -> object:
    return (_label("None", "无"), "None") if value == "None" else value


def _upscaler_names(*, include_none: bool = True, include_latent: bool = False) -> list[str]:
    names: list[object] = []
    if include_none:
        names.append("None")
    names.extend([item for item in PIXEL_UPSCALERS if item != "None"])
    names.extend(upscale_model_names())
    if include_latent:
        names.append("Latent")
    return _unique_text_choices(names)


def _upscaler_dropdown_choices(*, include_none: bool = True, include_latent: bool = False) -> list[object]:
    return [_localized_none_choice(value) for value in _upscaler_names(include_none=include_none, include_latent=include_latent)]


def _hires_upscaler_names() -> list[str]:
    return _unique_text_choices([*HIRES_UPSCALERS, *PIXEL_UPSCALERS, *upscale_model_names()])


def _hires_upscaler_choices() -> list[object]:
    return [_localized_none_choice(value) for value in _hires_upscaler_names()]


def _script_upscaler_choices() -> list[str]:
    return _unique_text_choices([*SCRIPT_UPSCALER_CHOICES, *upscale_model_names()])


def _xyz_axis_value_choices(axis_type: object) -> list[str]:
    axis = str(axis_type or "").strip()
    if axis in {"Sampler", "Hires sampler"}:
        return sampling_methods()
    if axis == "Schedule type":
        return scheduler_types()
    if axis == "Checkpoint name":
        return list(_xyz_model_choices().checkpoints or [])
    if axis == "Refiner checkpoint":
        return _unique_text_choices(["None", *list(_xyz_model_choices().checkpoints or [])])
    if axis == "VAE":
        return _unique_text_choices(["Automatic", "None", *list(_xyz_model_choices().vae or [])])
    if axis == "Hires upscaler":
        return _hires_upscaler_names()
    if axis == "Styles":
        return style_choices()
    if axis == "RNG source":
        return ["GPU", "CPU", "NV"]
    if axis == "MaHiRo":
        return ["False", "True"]
    return []


def _xyz_list_to_csv(values: list[object] | tuple[object, ...] | None) -> str:
    with io.StringIO() as handle:
        csv.writer(handle).writerow([str(item) for item in list(values or [])])
        return handle.getvalue().strip()


def _xyz_csv_to_list(value: object) -> list[str]:
    text = str(value or "").strip()
    if not text:
        return []
    try:
        rows = list(csv.reader(io.StringIO(text), skipinitialspace=True))
    except Exception:
        return [item.strip() for item in text.split(",") if item.strip()]
    return [item.strip() for row in rows for item in row if item.strip()]


def _xyz_select_axis(axis_type, axis_values, axis_values_dropdown, csv_mode):
    choices = _xyz_axis_value_choices(axis_type)
    has_choices = bool(choices)
    text_value = str(axis_values or "")
    dropdown_value = list(axis_values_dropdown or [])
    if has_choices:
        if csv_mode:
            if dropdown_value:
                text_value = _xyz_list_to_csv([item for item in dropdown_value if item in choices])
                dropdown_value = []
        elif text_value:
            dropdown_value = [item for item in _xyz_csv_to_list(text_value) if item in choices]
            text_value = ""
    return (
        gr.update(visible=has_choices),
        gr.update(visible=not has_choices or bool(csv_mode), value=text_value),
        gr.update(choices=choices if has_choices else [], visible=has_choices and not bool(csv_mode), value=dropdown_value),
    )


def _xyz_fill_axis_values(axis_type, csv_mode):
    choices = _xyz_axis_value_choices(axis_type)
    if not choices:
        return gr.update(), gr.update()
    if csv_mode:
        return gr.update(value=_xyz_list_to_csv(choices)), gr.update()
    return gr.update(), gr.update(value=choices)


def _xyz_change_choice_mode(csv_mode, x_type, x_values, x_values_dropdown, y_type, y_values, y_values_dropdown, z_type, z_values, z_values_dropdown):
    x_updates = _xyz_select_axis(x_type, x_values, x_values_dropdown, csv_mode)
    y_updates = _xyz_select_axis(y_type, y_values, y_values_dropdown, csv_mode)
    z_updates = _xyz_select_axis(z_type, z_values, z_values_dropdown, csv_mode)
    return (*x_updates, *y_updates, *z_updates)


def _swap_axis_values(first_type, first_values, first_dropdown, second_type, second_values, second_dropdown, csv_mode):
    first_fill, first_text, first_dropdown_update = _xyz_select_axis(second_type, second_values, second_dropdown, csv_mode)
    second_fill, second_text, second_dropdown_update = _xyz_select_axis(first_type, first_values, first_dropdown, csv_mode)
    return (
        second_type,
        first_text,
        first_dropdown_update,
        first_fill,
        first_type,
        second_text,
        second_dropdown_update,
        second_fill,
    )


def _refresh_single_controlnet_model_clicked(preset: str | None):
    choices = refresh_model_choices(preset or "klein")
    return gr.update(choices=_controlnet_model_choices(choices), value="None")


def _script_xyz_axis_request(axis_type: object, axis_values: object, axis_values_dropdown: object) -> tuple[str, str, list[object]]:
    clean_type = str(axis_type or "Nothing").strip() or "Nothing"
    clean_values = str(axis_values or "")
    clean_dropdown = list(axis_values_dropdown or [])
    if clean_type != "Nothing" and (clean_values.strip() or any(str(item or "").strip() for item in clean_dropdown)):
        return clean_type, clean_values, clean_dropdown
    return "Nothing", "", []


def _script_request_args(script: str, values: list[object]) -> dict[str, object]:
    name = str(script or "None").strip()
    if name == "Prompt Matrix":
        return {
            "put_at_start": bool(values[0]),
            "different_seeds": bool(values[1]),
            "prompt_type": str(values[2] or "positive"),
            "variations_delimiter": str(values[3] or "comma"),
            "margin_size": int(values[4] or 0),
        }
    if name == "Prompts from File or Textbox":
        return {
            "iterate_seed": bool(values[5]),
            "same_seed": bool(values[6]),
            "prompt_position": str(values[7] or "start"),
            "prompt_text": str(values[8] or ""),
        }
    if name == "X/Y/Z plot":
        x_type, x_values, x_values_dropdown = _script_xyz_axis_request(values[9], values[10], values[11])
        y_type, y_values, y_values_dropdown = _script_xyz_axis_request(values[12], values[13], values[14])
        z_type, z_values, z_values_dropdown = _script_xyz_axis_request(values[15], values[16], values[17])
        return {
            "x_type": x_type,
            "x_values": x_values,
            "x_values_dropdown": x_values_dropdown,
            "y_type": y_type,
            "y_values": y_values,
            "y_values_dropdown": y_values_dropdown,
            "z_type": z_type,
            "z_values": z_values,
            "z_values_dropdown": z_values_dropdown,
            "row_count": int(values[18] or 0),
            "margin_size": int(values[19] or 0),
            "draw_legend": bool(values[20]),
            "keep_minus_one": bool(values[21]),
            "vary_seed_x": bool(values[22]),
            "vary_seed_y": bool(values[23]),
            "vary_seed_z": bool(values[24]),
            "include_sub_images": bool(values[25]),
            "include_sub_grids": bool(values[26]),
            "csv_mode": bool(values[27]),
        }
    if name == "Loopback":
        return {
            "loops": int(values[28] or 1),
            "final_denoising_strength": float(values[29] or 0.0),
            "denoising_curve": str(values[30] or "Linear"),
        }
    if name == "SD Upscale":
        return {
            "upscaler": str(values[31] or "None"),
            "scale_factor": float(values[32] or 1.0),
            "overlap": int(values[33] or 0),
            "save_to_extras": bool(values[34]),
        }
    return {}


def _as_int_param(value: object, default: int = 0) -> int:
    try:
        if value in (None, ""):
            return int(default)
        return int(float(value))
    except Exception:
        return int(default)


def _as_float_param(value: object, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def _adetailer_unit_from_integrated(integrated, offset: int) -> dict[str, object]:
    raw = {
        name: integrated(offset + index, ADETAILER_ARG_DEFAULTS.get(name))
        for index, name in enumerate(ADETAILER_UNIT_FIELD_NAMES)
    }
    return {
        "ad_tab_enable": _as_bool_param(raw.get("ad_tab_enable"), bool(ADETAILER_ARG_DEFAULTS["ad_tab_enable"])),
        "ad_model": str(raw.get("ad_model") or "None"),
        "ad_model_classes": str(raw.get("ad_model_classes") or ""),
        "ad_prompt": str(raw.get("ad_prompt") or ""),
        "ad_negative_prompt": str(raw.get("ad_negative_prompt") or ""),
        "ad_confidence": _as_float_param(raw.get("ad_confidence"), float(ADETAILER_ARG_DEFAULTS["ad_confidence"])),
        "ad_mask_filter_method": str(raw.get("ad_mask_filter_method") or ADETAILER_ARG_DEFAULTS["ad_mask_filter_method"]),
        "ad_mask_k": _as_int_param(raw.get("ad_mask_k"), int(ADETAILER_ARG_DEFAULTS["ad_mask_k"])),
        "ad_mask_min_ratio": _as_float_param(raw.get("ad_mask_min_ratio"), float(ADETAILER_ARG_DEFAULTS["ad_mask_min_ratio"])),
        "ad_mask_max_ratio": _as_float_param(raw.get("ad_mask_max_ratio"), float(ADETAILER_ARG_DEFAULTS["ad_mask_max_ratio"])),
        "ad_x_offset": _as_int_param(raw.get("ad_x_offset"), int(ADETAILER_ARG_DEFAULTS["ad_x_offset"])),
        "ad_y_offset": _as_int_param(raw.get("ad_y_offset"), int(ADETAILER_ARG_DEFAULTS["ad_y_offset"])),
        "ad_dilate_erode": _as_int_param(raw.get("ad_dilate_erode"), int(ADETAILER_ARG_DEFAULTS["ad_dilate_erode"])),
        "ad_mask_merge_invert": str(raw.get("ad_mask_merge_invert") or ADETAILER_ARG_DEFAULTS["ad_mask_merge_invert"]),
        "ad_mask_blur": _as_int_param(raw.get("ad_mask_blur"), int(ADETAILER_ARG_DEFAULTS["ad_mask_blur"])),
        "ad_denoising_strength": _as_float_param(raw.get("ad_denoising_strength"), float(ADETAILER_ARG_DEFAULTS["ad_denoising_strength"])),
        "ad_inpaint_only_masked": _as_bool_param(raw.get("ad_inpaint_only_masked"), bool(ADETAILER_ARG_DEFAULTS["ad_inpaint_only_masked"])),
        "ad_inpaint_only_masked_padding": _as_int_param(raw.get("ad_inpaint_only_masked_padding"), int(ADETAILER_ARG_DEFAULTS["ad_inpaint_only_masked_padding"])),
        "ad_use_inpaint_width_height": _as_bool_param(raw.get("ad_use_inpaint_width_height"), bool(ADETAILER_ARG_DEFAULTS["ad_use_inpaint_width_height"])),
        "ad_inpaint_width": _as_int_param(raw.get("ad_inpaint_width"), int(ADETAILER_ARG_DEFAULTS["ad_inpaint_width"])),
        "ad_inpaint_height": _as_int_param(raw.get("ad_inpaint_height"), int(ADETAILER_ARG_DEFAULTS["ad_inpaint_height"])),
        "ad_use_steps": _as_bool_param(raw.get("ad_use_steps"), bool(ADETAILER_ARG_DEFAULTS["ad_use_steps"])),
        "ad_steps": _as_int_param(raw.get("ad_steps"), int(ADETAILER_ARG_DEFAULTS["ad_steps"])),
        "ad_use_cfg_scale": _as_bool_param(raw.get("ad_use_cfg_scale"), bool(ADETAILER_ARG_DEFAULTS["ad_use_cfg_scale"])),
        "ad_cfg_scale": _as_float_param(raw.get("ad_cfg_scale"), float(ADETAILER_ARG_DEFAULTS["ad_cfg_scale"])),
        "ad_use_checkpoint": _as_bool_param(raw.get("ad_use_checkpoint"), bool(ADETAILER_ARG_DEFAULTS["ad_use_checkpoint"])),
        "ad_checkpoint": str(raw.get("ad_checkpoint") or "Use same checkpoint"),
        "ad_use_vae": _as_bool_param(raw.get("ad_use_vae"), bool(ADETAILER_ARG_DEFAULTS["ad_use_vae"])),
        "ad_vae": str(raw.get("ad_vae") or "Use same VAE"),
        "ad_use_sampler": _as_bool_param(raw.get("ad_use_sampler"), bool(ADETAILER_ARG_DEFAULTS["ad_use_sampler"])),
        "ad_sampler": str(raw.get("ad_sampler") or ADETAILER_ARG_DEFAULTS["ad_sampler"]),
        "ad_scheduler": str(raw.get("ad_scheduler") or ADETAILER_ARG_DEFAULTS["ad_scheduler"]),
        "ad_use_noise_multiplier": _as_bool_param(raw.get("ad_use_noise_multiplier"), bool(ADETAILER_ARG_DEFAULTS["ad_use_noise_multiplier"])),
        "ad_noise_multiplier": _as_float_param(raw.get("ad_noise_multiplier"), float(ADETAILER_ARG_DEFAULTS["ad_noise_multiplier"])),
        "ad_restore_face": _as_bool_param(raw.get("ad_restore_face"), bool(ADETAILER_ARG_DEFAULTS["ad_restore_face"])),
        "ad_controlnet_model": str(raw.get("ad_controlnet_model") or "None"),
        "ad_controlnet_module": str(raw.get("ad_controlnet_module") or "None"),
        "ad_controlnet_weight": _as_float_param(raw.get("ad_controlnet_weight"), float(ADETAILER_ARG_DEFAULTS["ad_controlnet_weight"])),
        "ad_controlnet_guidance_start_end": [
            _as_float_param(raw.get("ad_controlnet_guidance_start"), 0.0),
            _as_float_param(raw.get("ad_controlnet_guidance_end"), 1.0),
        ],
        "is_api": True,
    }


def _dynamic_prompts_from_integrated(integrated, offset: int) -> dict[str, object]:
    raw = {
        key: integrated(offset + index, DYNAMIC_PROMPTS_ARG_DEFAULTS.get(key))
        for index, key in enumerate(DYNAMIC_PROMPTS_ARG_KEYS)
    }
    raw["is_enabled"] = _as_bool_param(raw.get("is_enabled"), False)
    return dynamic_prompts_arg_dict(raw, enabled=_as_bool_param(raw.get("is_enabled"), False))


def _regional_prompter_from_integrated(integrated, offset: int) -> dict[str, object]:
    raw = {
        key: integrated(offset + index, REGIONAL_PROMPTER_ARG_DEFAULTS.get(key))
        for index, key in enumerate(REGIONAL_PROMPTER_ARG_KEYS)
    }
    return regional_prompter_arg_dict(raw, enabled=_as_bool_param(raw.get("active"), False))


def _forge_couple_from_integrated(integrated, offset: int, *, is_img2img: bool) -> dict[str, object]:
    raw = {
        key: integrated(offset + index, FORGE_COUPLE_ARG_DEFAULTS.get(key))
        for index, key in enumerate(FORGE_COUPLE_ARG_KEYS)
    }
    return forge_couple_arg_dict(
        raw,
        enabled=_as_bool_param(raw.get("enable"), False),
        is_img2img=is_img2img,
    )


def _build_request(
    mode: str,
    preset: str,
    checkpoint: str,
    text_encoders: list[str] | None,
    low_bits: str,
    prompt: str,
    negative_prompt: str,
    styles: list[str] | None,
    style_grid_silent_json: str,
    style_grid_source_filter: str,
    sampler: str,
    scheduler: str,
    steps: int,
    width: int,
    height: int,
    cfg_scale: float,
    distilled_cfg_scale: float,
    image_cfg_scale: float | None,
    rescale_cfg: float,
    denoising_strength: float,
    seed: int,
    batch_count: int,
    batch_size: int,
    hires_fix: bool,
    refiner: bool,
    loras: list[str] | None,
    lora_weights: dict[str, float] | str | None,
    hires_upscaler: str,
    hires_steps: int,
    hires_denoising_strength: float,
    hires_scale: float,
    hires_resize_x: int,
    hires_resize_y: int,
    hires_checkpoint: str,
    hires_additional_modules: list[str] | None,
    hires_sampler: str,
    hires_scheduler: str,
    hires_prompt: str,
    hires_negative_prompt: str,
    hires_cfg: float,
    hires_distilled_cfg: float,
    refiner_checkpoint: str,
    refiner_switch_at: float,
    *integrated_and_img2img,
) -> ForgeNeoRequest:
    integrated_values = list(integrated_and_img2img[:INTEGRATED_FIELD_COUNT])
    extras_start = INTEGRATED_FIELD_COUNT
    if mode == "txt2img":
        compact_extras = integrated_and_img2img[extras_start:]
        img2img_extras = compact_extras[:1]
        tipo_values = compact_extras[1 : 1 + TIPO_FIELD_COUNT]
    else:
        tipo_start = extras_start + IMG2IMG_EXTRA_FIELD_COUNT
        img2img_extras = integrated_and_img2img[extras_start:tipo_start]
        tipo_values = integrated_and_img2img[tipo_start : tipo_start + TIPO_FIELD_COUNT]
    img2img_image = img2img_extras[0] if img2img_extras else None

    def extra(index: int, default=None):
        return img2img_extras[index] if index < len(img2img_extras) else default

    def integrated(index: int, default=None):
        return integrated_values[index] if index < len(integrated_values) else default

    tipo_args = tipo_arg_dict(tipo_values)

    sketch_image = extra(0)
    sketch_foreground = extra(1)
    inpaint_image = extra(2)
    inpaint_foreground = extra(3)
    inpaint_sketch_image = extra(4)
    inpaint_sketch_foreground = extra(5)
    inpaint_upload_image = extra(6)
    inpaint_upload_mask = extra(7)
    selected_scale_tab = int(extra(8, 0) or 0)
    resize_mode = extra(9, "Crop and resize")
    resize_scale = float(extra(10, 1.0) or 1.0)
    mask_blur = extra(11, 4)
    mask_alpha = float(extra(12, 0.0) or 0.0)
    inpainting_fill = extra(13, "original")
    inpainting_mask_mode = extra(14, "Inpaint masked")
    inpaint_area = extra(15, "Only masked")
    inpaint_padding = extra(16, 32)
    soft_inpainting_enabled = bool(extra(17, False))
    soft_inpainting_schedule_bias = float(extra(18, 1.0) or 0.0)
    soft_inpainting_preservation_strength = float(extra(19, 0.5) or 0.0)
    soft_inpainting_transition_contrast_boost = float(extra(20, 4.0) or 0.0)
    soft_inpainting_mask_influence = float(extra(21, 0.0) or 0.0)
    soft_inpainting_difference_threshold = float(extra(22, 0.5) or 0.0)
    soft_inpainting_difference_contrast = float(extra(23, 2.0) or 0.0)
    batch_files = extra(24, []) or []
    batch_source_type = extra(25, "upload")
    batch_input_dir = extra(26, "")
    batch_output_dir = extra(27, "")
    batch_inpaint_mask_dir = extra(28, "")
    batch_use_png_info = extra(29, False)
    batch_png_info_props = extra(30, []) or []
    batch_png_info_dir = extra(31, "")

    controlnet_units = []
    for unit_index in range(CONTROLNET_UNIT_COUNT):
        offset = unit_index * CONTROLNET_UNIT_FIELD_COUNT
        controlnet_units.append(
            {
                "enabled": bool(integrated(offset + 0, False)),
                "module": str(integrated(offset + 1, "None") or "None"),
                "model": str(integrated(offset + 2, "None") or "None"),
                "weight": float(integrated(offset + 3, 1.0) or 0.0),
                "resize_mode": str(integrated(offset + 4, "Crop and Resize") or "Crop and Resize"),
                "guidance_start": float(integrated(offset + 5, 0.0) or 0.0),
                "guidance_end": float(integrated(offset + 6, 1.0) or 0.0),
                "pixel_perfect": bool(integrated(offset + 7, False)),
                "control_mode": str(integrated(offset + 8, "Balanced") or "Balanced"),
                "hr_option": str(integrated(offset + 9, "Both") or "Both"),
                "processor_res": int(integrated(offset + 10, 512) or 0),
                "threshold_a": float(integrated(offset + 11, 0.5) or 0.0),
                "threshold_b": float(integrated(offset + 12, 0.5) or 0.0),
                "image": integrated(offset + 13),
                "image_fg": integrated(offset + 14),
                "generated_image": integrated(offset + 15),
                "mask_image": integrated(offset + 16),
                "mask_image_fg": integrated(offset + 17),
                "use_mask": bool(integrated(offset + 18, False)),
                "preview_as_input": bool(integrated(offset + 19, False)),
                "type_filter": str(integrated(offset + 20, "All") or "All"),
            }
        )
    common_offset = CONTROLNET_UNIT_COUNT * CONTROLNET_UNIT_FIELD_COUNT
    multidiffusion_enabled = bool(integrated(common_offset + 0, False))
    multidiffusion_method = str(integrated(common_offset + 1, "Mixture of Diffusers") or "Mixture of Diffusers")
    multidiffusion_tile_width = int(integrated(common_offset + 2, 768) or 0)
    multidiffusion_tile_height = int(integrated(common_offset + 3, 768) or 0)
    multidiffusion_tile_overlap = int(integrated(common_offset + 4, 64) or 0)
    multidiffusion_tile_batch_size = int(integrated(common_offset + 5, 1) or 0)
    never_oom_unet = bool(integrated(common_offset + 6, False))
    never_oom_vae = bool(integrated(common_offset + 7, False))
    image_stitch_enabled = bool(integrated(common_offset + 8, False))
    image_stitch_references = integrated(common_offset + 9, [])
    image_stitch_max_dim = int(integrated(common_offset + 10, 1024) or 0)
    spectrum_enabled = bool(integrated(common_offset + 11, False))
    spectrum_prediction_weighting = float(integrated(common_offset + 12, 0.25) or 0.0)
    spectrum_polynomial_degree = int(integrated(common_offset + 13, 6) or 0)
    spectrum_regularization = float(integrated(common_offset + 14, 0.5) or 0.0)
    spectrum_cache_window = int(integrated(common_offset + 15, 2) or 0)
    spectrum_window_growth = float(integrated(common_offset + 16, 0.0) or 0.0)
    spectrum_warmup_steps = int(integrated(common_offset + 17, 6) or 0)
    spectrum_stop_caching_step = float(integrated(common_offset + 18, 0.9) or 0.0)
    torch_compile_preset = str(integrated(common_offset + 19, "Automatic") or "Automatic")
    modulated_guidance_enabled = bool(integrated(common_offset + 20, False))
    modulated_guidance_clip = str(integrated(common_offset + 21, "None") or "None")
    modulated_guidance_positive = str(integrated(common_offset + 22, "") or "")
    modulated_guidance_negative = str(integrated(common_offset + 23, "") or "")
    modulated_guidance_weight = float(integrated(common_offset + 24, 3.0) or 0.0)
    modulated_guidance_start_layer = int(integrated(common_offset + 25, 0) or 0)
    modulated_guidance_end_value = integrated(common_offset + 26, -1)
    modulated_guidance_end_layer = int(-1 if modulated_guidance_end_value in (None, "") else modulated_guidance_end_value)
    seed_variance_enabled = bool(integrated(common_offset + 27, False))
    seed_variance_delta = int(integrated(common_offset + 28, 1) or 0)
    seed_variance_strength = float(integrated(common_offset + 29, 0.25) or 0.0)
    mahiro = bool(integrated(common_offset + 30, False))
    script = str(integrated(common_offset + 31, "None") or "None")
    script_args = _script_request_args(
        script,
        [
            integrated(common_offset + 32, False),
            integrated(common_offset + 33, False),
            integrated(common_offset + 34, "positive"),
            integrated(common_offset + 35, "comma"),
            integrated(common_offset + 36, 0),
            integrated(common_offset + 37, False),
            integrated(common_offset + 38, False),
            integrated(common_offset + 39, "start"),
            integrated(common_offset + 40, ""),
            integrated(common_offset + 41, "Seed"),
            integrated(common_offset + 42, ""),
            integrated(common_offset + 43, []),
            integrated(common_offset + 44, "Nothing"),
            integrated(common_offset + 45, ""),
            integrated(common_offset + 46, []),
            integrated(common_offset + 47, "Nothing"),
            integrated(common_offset + 48, ""),
            integrated(common_offset + 49, []),
            integrated(common_offset + 50, 0),
            integrated(common_offset + 51, 0),
            integrated(common_offset + 52, True),
            integrated(common_offset + 53, False),
            integrated(common_offset + 54, False),
            integrated(common_offset + 55, False),
            integrated(common_offset + 56, False),
            integrated(common_offset + 57, False),
            integrated(common_offset + 58, False),
            integrated(common_offset + 59, False),
            integrated(common_offset + 60, 2),
            integrated(common_offset + 61, 0.5),
            integrated(common_offset + 62, "Linear"),
            integrated(common_offset + 63, "None"),
            integrated(common_offset + 64, 2.0),
            integrated(common_offset + 65, 64),
            integrated(common_offset + 66, False),
        ],
    )
    if style_grid_available():
        alwayson_scripts = script_args.get("alwayson_scripts")
        alwayson = dict(alwayson_scripts) if isinstance(alwayson_scripts, dict) else {}
        alwayson.update(style_grid_alwayson_payload(style_grid_silent_json, style_grid_source_filter))
        script_args["alwayson_scripts"] = alwayson
    adetailer_offset = common_offset + 32 + SCRIPT_PARAM_FIELD_COUNT
    adetailer_enabled = bool(integrated(adetailer_offset + 0, False))
    adetailer_skip_img2img = bool(integrated(adetailer_offset + 1, False))
    adetailer_args = []
    if adetailer_enabled:
        adetailer_args = [
            _adetailer_unit_from_integrated(
                integrated,
                adetailer_offset + 2 + unit_index * ADETAILER_UNIT_FIELD_COUNT,
            )
            for unit_index in range(ADETAILER_UNIT_COUNT)
        ]
    dynamic_prompts_offset = adetailer_offset + ADETAILER_FIELD_COUNT
    dynamic_prompts_enabled = bool(integrated(dynamic_prompts_offset + 0, False))
    dynamic_prompts_args = {}
    if dynamic_prompts_enabled:
        dynamic_prompts_args = _dynamic_prompts_from_integrated(integrated, dynamic_prompts_offset)
    regional_prompter_offset = dynamic_prompts_offset + DYNAMIC_PROMPTS_FIELD_COUNT
    regional_prompter_enabled = bool(integrated(regional_prompter_offset + 0, False))
    regional_prompter_args = {}
    if regional_prompter_enabled:
        regional_prompter_args = _regional_prompter_from_integrated(integrated, regional_prompter_offset)
    forge_couple_offset = regional_prompter_offset + REGIONAL_PROMPTER_FIELD_COUNT
    forge_couple_enabled = bool(integrated(forge_couple_offset + 0, False))
    forge_couple_args = {}
    if forge_couple_enabled:
        forge_couple_args = _forge_couple_from_integrated(
            integrated,
            forge_couple_offset,
            is_img2img=mode != "txt2img",
        )

    def gallery_count(value) -> int:
        if not value:
            return 0
        if isinstance(value, (list, tuple)):
            return len(value)
        return 1

    selected_init_image = _selected_img2img_source(
        mode,
        img2img_image,
        sketch_image,
        inpaint_image,
        inpaint_sketch_image,
        inpaint_upload_image,
        sketch_foreground,
        inpaint_foreground,
        inpaint_sketch_foreground,
    )
    selected_mask_image = {
        "inpaint": _canvas_image(inpaint_foreground) or _editor_mask(inpaint_image),
        "inpaint_sketch": _canvas_image(inpaint_sketch_foreground) or _editor_mask(inpaint_sketch_image),
        "inpaint_upload": inpaint_upload_mask,
    }.get(mode)
    resolved_width = int(width or 1024)
    resolved_height = int(height or 1024)
    if selected_scale_tab == 1:
        selected_image = _image_from_value(selected_init_image)
        if selected_image is not None:
            resolved_width = _round_img2img_dimension(selected_image.size[0] * resize_scale)
            resolved_height = _round_img2img_dimension(selected_image.size[1] * resize_scale)

    selected_styles = list(styles or [])
    styled_prompt, styled_negative_prompt = apply_style_names(prompt, negative_prompt, selected_styles)
    selected_vae, selected_text_encoders = _module_selection_for_request(text_encoders)
    return ForgeNeoRequest(
        mode=mode,
        prompt=styled_prompt or "",
        negative_prompt=styled_negative_prompt or "",
        preset=preset or "klein",
        checkpoint=checkpoint or "None",
        text_encoders=selected_text_encoders,
        vae=selected_vae,
        low_bit_dtype=low_bits or "Automatic",
        styles=selected_styles,
        sampler=sampler or "Euler",
        scheduler=scheduler or "Beta",
        steps=int(steps or 1),
        width=resolved_width,
        height=resolved_height,
        cfg_scale=float(cfg_scale or 1.0),
        distilled_cfg_scale=float(distilled_cfg_scale or 0.0),
        image_cfg_scale=None if image_cfg_scale is None else float(image_cfg_scale or 0.0),
        rescale_cfg=float(rescale_cfg or 0.0),
        denoising_strength=float(denoising_strength or 0.0),
        seed=int(seed if seed is not None else -1),
        batch_count=int(batch_count or 1),
        batch_size=int(batch_size or 1),
        hires_fix=bool(hires_fix),
        hires_upscaler=str(hires_upscaler or "Latent"),
        hires_steps=int(hires_steps or 0),
        hires_denoising_strength=float(hires_denoising_strength or 0.0),
        hires_scale=float(hires_scale or 1.0),
        hires_resize_x=int(hires_resize_x or 0),
        hires_resize_y=int(hires_resize_y or 0),
        hires_checkpoint=str(hires_checkpoint or "Use same checkpoint"),
        hires_additional_modules=list(hires_additional_modules or ["Use same choices"]),
        hires_sampler=str(hires_sampler or "Use same sampler"),
        hires_scheduler=str(hires_scheduler or "Use same scheduler"),
        hires_prompt=str(hires_prompt or ""),
        hires_negative_prompt=str(hires_negative_prompt or ""),
        hires_cfg=float(hires_cfg or 0.0),
        hires_distilled_cfg=float(hires_distilled_cfg or 0.0),
        refiner=bool(refiner),
        refiner_checkpoint=str(refiner_checkpoint or "None"),
        refiner_switch_at=float(refiner_switch_at or 0.0),
        controlnet_units=controlnet_units,
        controlnet_enabled=bool(controlnet_units[0]["enabled"]),
        controlnet_module=str(controlnet_units[0]["module"]),
        controlnet_model=str(controlnet_units[0]["model"]),
        controlnet_weight=float(controlnet_units[0]["weight"]),
        controlnet_resize_mode=str(controlnet_units[0]["resize_mode"]),
        controlnet_guidance_start=float(controlnet_units[0]["guidance_start"]),
        controlnet_guidance_end=float(controlnet_units[0]["guidance_end"]),
        controlnet_pixel_perfect=bool(controlnet_units[0]["pixel_perfect"]),
        controlnet_control_mode=str(controlnet_units[0]["control_mode"]),
        controlnet_hr_option=str(controlnet_units[0]["hr_option"]),
        controlnet_processor_res=int(controlnet_units[0]["processor_res"]),
        controlnet_threshold_a=float(controlnet_units[0]["threshold_a"]),
        controlnet_threshold_b=float(controlnet_units[0]["threshold_b"]),
        multidiffusion_enabled=bool(multidiffusion_enabled),
        multidiffusion_method=str(multidiffusion_method or "Mixture of Diffusers"),
        multidiffusion_tile_width=int(multidiffusion_tile_width or 0),
        multidiffusion_tile_height=int(multidiffusion_tile_height or 0),
        multidiffusion_tile_overlap=int(multidiffusion_tile_overlap or 0),
        multidiffusion_tile_batch_size=int(multidiffusion_tile_batch_size or 0),
        never_oom_unet=bool(never_oom_unet),
        never_oom_vae=bool(never_oom_vae),
        torch_compile_preset=str(torch_compile_preset or "Automatic"),
        image_stitch_enabled=bool(image_stitch_enabled),
        image_stitch_references=list(image_stitch_references or []),
        image_stitch_reference_count=gallery_count(image_stitch_references),
        image_stitch_max_dim=int(image_stitch_max_dim or 0),
        spectrum_enabled=bool(spectrum_enabled),
        spectrum_prediction_weighting=float(spectrum_prediction_weighting or 0.0),
        spectrum_polynomial_degree=int(spectrum_polynomial_degree or 0),
        spectrum_regularization=float(spectrum_regularization or 0.0),
        spectrum_cache_window=int(spectrum_cache_window or 0),
        spectrum_window_growth=float(spectrum_window_growth or 0.0),
        spectrum_warmup_steps=int(spectrum_warmup_steps or 0),
        spectrum_stop_caching_step=float(spectrum_stop_caching_step or 0.0),
        modulated_guidance_enabled=bool(modulated_guidance_enabled),
        modulated_guidance_clip=str(modulated_guidance_clip or "None"),
        modulated_guidance_positive=str(modulated_guidance_positive or ""),
        modulated_guidance_negative=str(modulated_guidance_negative or ""),
        modulated_guidance_weight=float(modulated_guidance_weight or 0.0),
        modulated_guidance_start_layer=int(modulated_guidance_start_layer or 0),
        modulated_guidance_end_layer=int(modulated_guidance_end_layer),
        adetailer_enabled=bool(adetailer_enabled),
        adetailer_skip_img2img=bool(adetailer_skip_img2img),
        adetailer_args=adetailer_args,
        dynamic_prompts_enabled=bool(dynamic_prompts_enabled),
        dynamic_prompts_args=dynamic_prompts_args,
        tipo_enabled=bool(tipo_args.get("enabled", False)),
        tipo_args=tipo_args,
        regional_prompter_enabled=bool(regional_prompter_enabled),
        regional_prompter_args=regional_prompter_args,
        forge_couple_enabled=bool(forge_couple_enabled),
        forge_couple_args=forge_couple_args,
        seed_variance_enabled=bool(seed_variance_enabled),
        seed_variance_delta=int(seed_variance_delta or 0),
        seed_variance_strength=float(seed_variance_strength or 0.0),
        mahiro=bool(mahiro),
        script=script,
        script_args=script_args,
        loras=list(loras or []),
        lora_weights=_normalize_lora_weights(lora_weights),
        init_image=selected_init_image,
        mask_image=selected_mask_image,
        selected_scale_tab=int(selected_scale_tab or 0),
        resize_mode=str(resize_mode or "Crop and resize"),
        resize_scale=float(resize_scale or 1.0),
        mask_blur=int(mask_blur or 0),
        mask_alpha=float(mask_alpha or 0.0),
        inpainting_fill=str(inpainting_fill or "original"),
        inpainting_mask_mode=str(inpainting_mask_mode or "Inpaint masked"),
        inpaint_area=str(inpaint_area or "Only masked"),
        inpaint_padding=int(inpaint_padding or 0),
        soft_inpainting_enabled=bool(soft_inpainting_enabled),
        soft_inpainting_schedule_bias=float(soft_inpainting_schedule_bias or 0.0),
        soft_inpainting_preservation_strength=float(soft_inpainting_preservation_strength or 0.0),
        soft_inpainting_transition_contrast_boost=float(soft_inpainting_transition_contrast_boost or 0.0),
        soft_inpainting_mask_influence=float(soft_inpainting_mask_influence or 0.0),
        soft_inpainting_difference_threshold=float(soft_inpainting_difference_threshold or 0.0),
        soft_inpainting_difference_contrast=float(soft_inpainting_difference_contrast or 0.0),
        batch_files=list(batch_files),
        batch_source_type=str(batch_source_type or "upload"),
        batch_input_dir=str(batch_input_dir or ""),
        batch_output_dir=str(batch_output_dir or ""),
        batch_inpaint_mask_dir=str(batch_inpaint_mask_dir or ""),
        batch_use_png_info=bool(batch_use_png_info),
        batch_png_info_props=list(batch_png_info_props),
        batch_png_info_dir=str(batch_png_info_dir or ""),
    )


def _generate_clicked(*values):
    state = values[0]
    request = _build_request(*values[1:])
    result = worker.run(request, state)
    if result.status == "finished" and _has_generation_parameter_payload(result.infotext):
        _write_prompt_history(result.infotext)
    status = _status(state, "Finished.", "已完成。")
    if result.status == "backend_pending":
        status = _status(
            state,
            "UI contract run finished. Native Forge backend adapter is still pending.",
            "界面合约运行完成，原生 Forge 后端适配仍待迁入。",
        )
    elif result.status == "backend_unavailable":
        status = _status(
            state,
            "Backend unavailable. Forge Neo will not create placeholder sampling images in normal backend mode.",
            "后端不可用。Forge Neo 在正常后端模式下不会生成占位采样图。",
        )
    elif result.status == "stopped":
        status = _status(state, "Stopped.", "已停止。")
    elif result.status == "skipped":
        status = _status(state, "Skipped.", "已跳过。")
    if result.error:
        status = f"{status}\n{result.error}"
    if result.output_paths:
        status = f"{status}\n{_status(state, 'Saved:', '已保存：')} {result.output_paths[0]}"
    if len(result.output_paths) > 1:
        status = f"{status}\n+{len(result.output_paths) - 1}"
    status_visible = result.status != "finished" or bool(result.error) or bool(result.output_paths)
    selected_index = 0 if result.images else -1
    return (
        _gallery_update(result.images, selected_index=selected_index),
        _infotext_html(result.infotext),
        result.infotext,
        _output_status_update(status, visible=status_visible),
        str(selected_index),
        _output_actions_update(result.images),
    )


def _output_status_html(message: str) -> str:
    lines = str(message or "").splitlines() or [""]
    body = "<br>".join(html_lib.escape(line) for line in lines)
    return f'<div class="forge-neo-output-status">{body}</div>'


def _output_status_update(message: str, *, visible: bool = True):
    return gr.update(value=_output_status_html(message), visible=visible)


def _output_actions_update(images: list[object] | tuple[object, ...] | None):
    return gr.update(visible=True)


def _gallery_update(images: list[object] | tuple[object, ...] | None, *, selected_index: int = -1):
    return gr.update(
        value=list(images or []),
        selected_index=selected_index if selected_index >= 0 else None,
        visible=True,
    )


def _infotext_html(text: str) -> str:
    return f'<pre class="forge-neo-infotext">{html_lib.escape(str(text or ""))}</pre>'


def _output_status_tuple(values: tuple[object, ...], status_index: int) -> tuple[object, ...]:
    converted = list(values)
    converted[status_index] = _output_status_update(str(converted[status_index]))
    return tuple(converted)


def _stop_output_clicked(state):
    return _output_status_update(stop_current(state))


def _skip_output_clicked(state):
    return _output_status_update(skip_current(state))


def _extras_clicked(*values):
    state = values[0]
    request = ForgeNeoExtrasRequest(
        mode=str(values[1] or "single"),
        image=values[2],
        batch_files=list(values[3] or []),
        input_dir=str(values[4] or ""),
        output_dir=str(values[5] or ""),
        show_results=bool(values[6]),
        resize_mode=str(values[7] or "Scale by"),
        resize_scale=float(values[8] or 4.0),
        max_side_length=int(values[9] or 0),
        resize_width=int(values[10] or 1024),
        resize_height=int(values[11] or 1024),
        crop_to_fit=bool(values[12]),
        upscaler_1=str(values[13] or "None"),
        upscaler_2=str(values[14] or "None"),
        upscaler_2_visibility=float(values[15] or 0.0),
        color_correction=bool(values[16]),
        gfpgan_visibility=float(values[17] or 0.0),
        codeformer_visibility=float(values[18] or 0.0),
        codeformer_weight=float(values[19] or 0.5),
        video_path=str(values[20] if len(values) > 20 and values[20] is not None else ""),
    )
    result = worker.run_extras(request, state)
    status = _status(state, "Finished.", "已完成。")
    if result.status == "stopped":
        status = _status(state, "Stopped.", "已停止。")
    elif result.status == "skipped":
        status = _status(state, "Skipped.", "已跳过。")
    elif result.status == "error":
        if result.error == "No input video found.":
            status = _status(state, "No input video found.", "没有找到输入视频。")
        elif result.error == "No input image found.":
            status = _status(state, "No input image found.", "没有找到输入图片。")
        else:
            status = result.error or _status(state, "No input image found.", "没有找到输入图片。")
    if result.output_paths:
        status = f"{status}\n{_status(state, 'Saved:', '已保存：')} {result.output_paths[0]}"
    if len(result.output_paths) > 1:
        status = f"{status}\n+{len(result.output_paths) - 1}"
    output_folder = _output_folder_from_paths(result.output_paths, request.output_dir or outputs_dir())
    return _gallery_update(result.images), _infotext_html(result.infotext), _extras_status_update(status), output_folder


def _extras_status_html(message: str) -> str:
    lines = str(message or "").splitlines() or [""]
    body = "<br>".join(html_lib.escape(line) for line in lines)
    return f'<div class="forge-neo-extras-status">{body}</div>'


def _extras_status_update(message: str, *, visible: bool = True):
    return gr.update(value=_extras_status_html(message), visible=visible)


def _extras_stop_clicked(state):
    return _extras_status_update(stop_current(state))


def _extras_skip_clicked(state):
    return _extras_status_update(skip_current(state))


def _batch_edit_generate_clicked(*values):
    state = values[0]
    result = run_batch_edit(
        ForgeNeoBatchEditRequest(
            input_dir=str(values[1] or ""),
            output_dir=str(values[2] or ""),
            prompt=str(values[3] or ""),
            negative_prompt=str(values[4] or ""),
            max_edge_length=int(values[5] or 0),
            steps=int(values[6] or 1),
            cfg_scale=float(values[7] or 0.0),
            seed=int(values[8] if values[8] is not None else -1),
            formats=list(values[9] or []),
            sort_method=str(values[10] or "文件名升序"),
        )
    )
    progress = result.progress
    if result.status == "finished":
        progress = _status(state, "Batch edit finished", "批量编辑完成") + f": {sum(1 for item in result.files if item.get('written'))}"
    elif result.status == "plan":
        progress = _status(state, "Plan ready", "计划就绪") + f": {len(result.files)}"
    elif result.status == "empty":
        progress = _status(state, "No images found", "未找到图片")
    elif result.status == "error":
        progress = _status(state, "Batch edit plan failed", "批量编辑计划失败")
    return progress, result.log


def _batch_edit_stop_clicked(state):
    return _status(state, "Stop requested.", "已请求停止。"), _status(
        state,
        "Native batch edit execution is not running in the Gradio 6 shell yet.",
        "Gradio 6 外壳尚未运行原生批量编辑执行器。",
    )


def _merger_interp_description_html(value: str) -> str:
    method = str(value or "Weighted sum")
    descriptions = {
        "No interpolation": _label(
            "No interpolation will be used. Requires one model; A. Allows for format conversion and VAE baking.",
            "不做模型插值。需要模型 A，可用于格式转换和 VAE 烘焙。",
        ),
        "Weighted sum": _label(
            "A weighted sum will be used for interpolation. Requires two models; A and B. The result is calculated as A * (1 - M) + B * M",
            "使用加权和插值。需要模型 A 和 B，结果按 A * (1 - M) + B * M 计算。",
        ),
        "Add difference": _label(
            "The difference between the last two models will be added to the first. Requires three models; A, B and C. The result is calculated as A + (B - C) * M",
            "把后两个模型的差值加到第一个模型。需要模型 A、B、C，结果按 A + (B - C) * M 计算。",
        ),
    }
    description = descriptions.get(method, descriptions["Weighted sum"])
    return f'<p class="forge-neo-merger-description">{html_lib.escape(description)}</p>'


def _read_merger_metadata_clicked(primary: str, secondary: str, tertiary: str):
    return build_merger_metadata_json(primary, secondary, tertiary)


def _save_current_checkpoint_notice(
    filename: str,
    state,
    kind: str,
    checkpoint_name: str = "None",
    text_encoders: list[str] | None = None,
    low_bit_dtype: str = "Automatic",
) -> str:
    label = _status(state, "Save UNet" if kind == "unet" else "Save Checkpoint", "保存 UNet" if kind == "unet" else "保存模型")
    selected_vae, selected_text_encoders = _module_selection_for_request(text_encoders)
    result = run_current_model_save_plan(
        ForgeNeoCurrentModelSaveRequest(
            filename=str(filename or "my_model.safetensors"),
            kind=kind,
            checkpoint=str(checkpoint_name or "None"),
            vae=selected_vae,
            text_encoders=selected_text_encoders,
            low_bit_dtype=str(low_bit_dtype or "Automatic"),
        )
    )
    if result.status == "error":
        message = _status(state, "Save plan failed.", "保存计划生成失败。")
        return (
            '<div class="forge-neo-merger-summary">'
            f"<strong>{html_lib.escape(label)}</strong><br>{html_lib.escape(message)}<br>{html_lib.escape(result.error)}"
            "</div>"
        )
    planned_path = str(((result.plan.get("output") or {}) if result.plan else {}).get("planned_model_path", ""))
    checkpoint_text = str(((result.plan.get("current_model") or {}) if result.plan else {}).get("checkpoint", checkpoint_name or "None"))
    message = _status(
        state,
        "Current-model save plan generated. Native weight writing requires the Forge backend adapter.",
        "当前模型保存计划已生成。真实权重写入需要 Forge 后端适配。",
    )
    return (
        '<div class="forge-neo-merger-summary">'
        f"<strong>{html_lib.escape(label)}</strong>"
        f"<br>{html_lib.escape(message)}"
        f"<br>{html_lib.escape(_status(state, 'Current model', '当前模型'))}: {html_lib.escape(checkpoint_text)}"
        f"<br>{html_lib.escape(_status(state, 'Planned model', '计划模型'))}: {html_lib.escape(planned_path)}"
        f"<br>{html_lib.escape(_status(state, 'Plan file', '计划文件'))}: {html_lib.escape(result.plan_path)}"
        "</div>"
    )


def _initial_current_checkpoint_save_notice() -> str:
    message = _label(
        "Ready to save ... (Currently only support saving Flux models)",
        "准备保存 ...（目前仅支持保存 Flux 模型）",
    )
    return f'<div class="forge-neo-merger-summary">{html_lib.escape(message)}</div>'


def _save_current_checkpoint_notice_update(
    filename: str,
    state,
    kind: str,
    checkpoint_name: str = "None",
    text_encoders: list[str] | None = None,
    low_bit_dtype: str = "Automatic",
):
    return gr.update(
        value=_save_current_checkpoint_notice(
            filename,
            state,
            kind,
            checkpoint_name,
            text_encoders,
            low_bit_dtype,
        ),
        visible=True,
    )


def _merger_clicked(*values):
    state = values[0]
    request = ForgeNeoMergerRequest(
        primary_model_name=str(values[1] or "None"),
        secondary_model_name=str(values[2] or "None"),
        tertiary_model_name=str(values[3] or "None"),
        interp_method=str(values[4] or "Weighted sum"),
        interp_amount=float(values[5] or 0.0),
        save_as_half=bool(values[6]),
        custom_name=str(values[7] or ""),
        checkpoint_format=str(values[8] or "safetensors"),
        config_source=str(values[9] or "A, B or C"),
        bake_in_vae=str(values[10] or "None"),
        discard_weights=str(values[11] or ""),
        save_metadata=bool(values[12]),
        add_merge_recipe=bool(values[13]),
        copy_metadata_fields=bool(values[14]),
        metadata_json=str(values[15] or "{}"),
    )
    result = run_merger_recipe(request)
    if result.status == "error":
        status = _status(state, "Recipe generation failed.", "生成 recipe 失败。")
        return (
            _merger_result_update(f'<div class="forge-neo-merger-summary">{html_lib.escape(result.error)}</div>', visible=True),
            _merger_recipe_json_update("{}", visible=False),
            _merger_status_update(status),
        )

    formula = html_lib.escape(merger_formula(request.interp_method))
    method = html_lib.escape(request.interp_method)
    recipe_path = html_lib.escape(result.recipe_path)
    planned_path = html_lib.escape(str(((result.recipe.get("output") or {}) if result.recipe else {}).get("planned_checkpoint_path", "")))
    title = _status(state, "Merge recipe generated.", "合并 recipe 已生成。")
    note = _status(
        state,
        "This is a dry-run recipe. Native checkpoint merging will be enabled after the Forge backend adapter is vendored.",
        "这是 dry-run recipe。真实 checkpoint 合并会在 Forge 后端适配迁入后启用。",
    )
    html = (
        '<div class="forge-neo-merger-summary">'
        f"<strong>{html_lib.escape(title)}</strong>"
        f"<br>Method: {method}"
        f"<br>Formula: {formula}"
        f"<br>Recipe: {recipe_path}"
        f"<br>Planned checkpoint: {planned_path}"
        f"<br>{html_lib.escape(note)}"
        "</div>"
    )
    status = _status(state, "Recipe saved.", "Recipe 已保存。")
    return (
        _merger_result_update(html, visible=True),
        _merger_recipe_json_update(result.recipe_json, visible=True),
        _merger_status_update(f"{status}\n{result.recipe_path}"),
    )


def _merger_status_html(message: str) -> str:
    lines = str(message or "").splitlines() or [""]
    body = "<br>".join(html_lib.escape(line) for line in lines)
    return f'<div class="forge-neo-merger-status">{body}</div>'


def _merger_status_update(message: str, *, visible: bool = True):
    return gr.update(value=_merger_status_html(message), visible=visible)


def _merger_recipe_json_html(value: str) -> str:
    return f'<pre class="forge-neo-merger-recipe-json">{html_lib.escape(str(value or "{}"))}</pre>'


def _merger_recipe_json_update(value: str, *, visible: bool = True):
    return gr.update(value=_merger_recipe_json_html(value), visible=visible)


def _merger_result_update(value: str, *, visible: bool = True):
    return gr.update(value=str(value or ""), visible=visible)


def _settings_payload(values: list[object]) -> dict[str, object]:
    return {
        key: values[index] if index < len(values) else DEFAULT_SETTINGS[key]
        for index, key in enumerate(SETTINGS_INPUT_KEYS)
    }


def _settings_updates(data: dict[str, object]) -> list[object]:
    return [gr.update(value=data.get(key, DEFAULT_SETTINGS[key])) for key in SETTINGS_INPUT_KEYS]


def _settings_result_html(message: str, detail: object = "") -> str:
    parts = [html_lib.escape(str(message or ""))]
    if detail:
        parts.append(f'<span class="forge-neo-settings-detail">{html_lib.escape(str(detail))}</span>')
    return f'<div class="forge-neo-settings-result">{"<br>".join(parts)}</div>'


def _settings_result_update(message: str, detail: object = "", *, visible: bool = True):
    return gr.update(value=_settings_result_html(message, detail), visible=visible)


def _settings_result_html_update(value: str, *, visible: bool = True):
    return gr.update(value=str(value or ""), visible=visible)


def _settings_defaults_instructions_html(state=None) -> str:
    lang = _state_lang(state)
    path = settings_path()
    lines = [
        _label_for_lang(lang, "This page allows you to change default values in UI elements on other tabs.", "此页面用于修改其他标签页 UI 组件的默认值。"),
        _label_for_lang(lang, "Make your changes, press 'View changes' to review the changed default values,", "调整其他页面的控件后，点击“查看变更”检查默认值变化，"),
        _label_for_lang(lang, f"then press 'Apply' to write them to {path}.", f"再点击“应用”写入 {path}。"),
        _label_for_lang(lang, "New defaults will apply after you restart the UI.", "新的默认值会在重启 UI 后生效。"),
    ]
    return '<div class="forge-neo-settings-defaults-info">' + "<br>".join(html_lib.escape(line) for line in lines) + "</div>"


def _format_settings_default_value(value: object) -> str:
    if value is None:
        return '<span class="forge-neo-ui-defaults-none">None</span>'
    if isinstance(value, (dict, list, tuple)):
        return html_lib.escape(json.dumps(value, ensure_ascii=False))
    return html_lib.escape(str(value))


def _settings_defaults_review_html(changes: list[tuple[str, object, object]], state=None) -> str:
    lang = _state_lang(state)
    if changes:
        body = "".join(
            "<tr>"
            f"<td>{html_lib.escape(key)}</td>"
            f"<td>{_format_settings_default_value(old)}</td>"
            f"<td>{_format_settings_default_value(new)}</td>"
            "</tr>"
            for key, old, new in changes
        )
    else:
        empty = _label_for_lang(lang, "No changes", "没有变更")
        body = f'<tr><td colspan="3">{html_lib.escape(empty)}</td></tr>'
    return (
        '<div class="forge-neo-settings-defaults-review">'
        '<table id="forge_neo_settings_defaults_table" class="forge-neo-settings-defaults-table">'
        "<thead><tr>"
        f"<th>{html_lib.escape(_label_for_lang(lang, 'Path', '路径'))}</th>"
        f"<th>{html_lib.escape(_label_for_lang(lang, 'Old value', '旧值'))}</th>"
        f"<th>{html_lib.escape(_label_for_lang(lang, 'New value', '新值'))}</th>"
        "</tr></thead>"
        f"<tbody>{body}</tbody>"
        "</table></div>"
    )


def _settings_defaults_changes(values: list[object]) -> tuple[dict[str, object], list[tuple[str, object, object]]]:
    current = load_settings()
    proposed = normalize_settings(_settings_payload(values))
    changes = [
        (key, current.get(key), proposed.get(key))
        for key in SETTINGS_INPUT_KEYS
        if current.get(key) != proposed.get(key)
    ]
    return proposed, changes


def _settings_defaults_view_clicked(state, *values):
    _proposed, changes = _settings_defaults_changes(list(values))
    return gr.update(value=_settings_defaults_review_html(changes, state), visible=True)


def _settings_defaults_apply_clicked(state, *values):
    proposed, changes = _settings_defaults_changes(list(values))
    if changes:
        data = save_settings(proposed)
        message = _label_for_lang(state, f"Wrote {len(changes)} changes.", f"已写入 {len(changes)} 项变更。")
    else:
        data = load_settings()
        message = _label_for_lang(state, "No changes.", "没有变更。")
    return (
        gr.update(value=f'<div class="forge-neo-settings-defaults-apply">{html_lib.escape(message)}</div>', visible=True),
        _settings_json_html(data),
    )


def _settings_loaded_models_html(state, checkpoint_name, text_encoders, low_bits) -> str:
    lang = _state_lang(state)
    none_text = _label_for_lang(lang, "None", "无")
    selected_vae, selected_text_encoders = _module_selection_for_request(text_encoders)

    def value_or_none(value: object) -> str:
        text = str(value or "").strip().strip('"')
        return text if text else none_text

    encoder_values = [str(item).strip() for item in selected_text_encoders if str(item or "").strip()]
    encoder_text = "\n".join(encoder_values) if encoder_values else none_text
    rows = [
        (_label_for_lang(lang, "Checkpoint", "模型"), value_or_none(checkpoint_name)),
        ("VAE", value_or_none(selected_vae)),
        (_label_for_lang(lang, "Text Encoder", "文本编码器"), encoder_text),
        (_label_for_lang(lang, "Diffusion in Low Bits", "低位扩散"), value_or_none(low_bits or "Automatic")),
    ]
    body = "".join(
        "<tr>"
        f"<th>{html_lib.escape(str(label))}</th>"
        f"<td>{html_lib.escape(str(value))}</td>"
        "</tr>"
        for label, value in rows
    )
    title = _label_for_lang(lang, "Loaded Models", "已加载模型")
    note = _label_for_lang(
        lang,
        "Current Forge Neo model selector state.",
        "当前 Forge Neo 模型栏状态。",
    )
    return (
        '<div class="forge-neo-settings-loaded-models">'
        f"<strong>{html_lib.escape(title)}</strong>"
        f"<p>{html_lib.escape(note)}</p>"
        '<div class="forge-neo-settings-loaded-models-table-wrap">'
        '<table id="forge_neo_settings_loaded_models_table" class="forge-neo-settings-loaded-models-table">'
        f"<tbody>{body}</tbody>"
        "</table></div>"
        "</div>"
    )


def _settings_list_loaded_models_clicked(state, checkpoint_name, text_encoders, low_bits):
    return _settings_result_html_update(_settings_loaded_models_html(state, checkpoint_name, text_encoders, low_bits))


def _settings_unload_models_html(result: Mapping[str, object], state=None) -> str:
    lang = _state_lang(state)
    yes = _label_for_lang(lang, "Yes", "是")
    no = _label_for_lang(lang, "No", "否")
    parent_model_unload = result.get("parent_model_unload") if isinstance(result.get("parent_model_unload"), Mapping) else {}
    source_backend = result.get("source_backend") if isinstance(result.get("source_backend"), Mapping) else {}

    def yes_no(value: object) -> str:
        return yes if bool(value) else no

    rows = [
        (_label_for_lang(lang, "Previous worker status", "清理前任务状态"), str(result.get("previous_status") or "idle")),
        (_label_for_lang(lang, "Worker events cleared", "已清理任务事件"), str(result.get("events_cleared", 0))),
        (
            _label_for_lang(lang, "Parent model unload", "父进程模型卸载"),
            yes_no(
                bool(parent_model_unload.get("unload_model_weights_called"))
                or bool(parent_model_unload.get("memory_management_called"))
            ),
        ),
        (
            _label_for_lang(lang, "Source backend status", "源后端状态"),
            str(source_backend.get("status") or "unknown"),
        ),
        (
            _label_for_lang(lang, "Source backend unload requested", "源后端卸载请求"),
            yes_no(source_backend.get("model_unload_requested")),
        ),
        (
            _label_for_lang(lang, "Source loaded models", "源后端已加载模型"),
            f"{source_backend.get('loaded_models_before', 0)} -> {source_backend.get('loaded_models_after', 0)}",
        ),
        (_label_for_lang(lang, "Python GC collected", "Python GC 回收对象"), str(result.get("gc_collected", 0))),
        ("PyTorch", yes_no(result.get("torch_available"))),
        (_label_for_lang(lang, "CUDA available", "CUDA 可用"), yes_no(result.get("cuda_available"))),
        ("CUDA empty_cache", yes_no(result.get("cuda_empty_cache_called"))),
        ("CUDA ipc_collect", yes_no(result.get("cuda_ipc_collect_called"))),
    ]
    error = str(result.get("torch_error") or "").strip()
    if error:
        rows.append((_label_for_lang(lang, "PyTorch note", "PyTorch 提示"), error))
    parent_error = str(parent_model_unload.get("error") or "").strip()
    if parent_error:
        rows.append((_label_for_lang(lang, "Parent unload note", "父进程卸载提示"), parent_error))
    source_error = str(source_backend.get("error") or "").strip()
    if source_error:
        rows.append((_label_for_lang(lang, "Source backend note", "源后端提示"), source_error))

    body = "".join(
        "<tr>"
        f"<th>{html_lib.escape(str(label))}</th>"
        f"<td>{html_lib.escape(str(value))}</td>"
        "</tr>"
        for label, value in rows
    )
    title = _label_for_lang(lang, "Unload All Models", "卸载所有模型")
    note = _label_for_lang(
        lang,
        "Forge Neo runtime state was cleared; loaded models were requested to move off VRAM and PyTorch/CUDA cache release was requested.",
        "Forge Neo 运行态已清理，已请求将模型从显存卸载到内存，并已请求释放 PyTorch/CUDA 缓存。",
    )
    return (
        '<div class="forge-neo-settings-unload-models">'
        f"<strong>{html_lib.escape(title)}</strong>"
        f"<p>{html_lib.escape(note)}</p>"
        '<div class="forge-neo-settings-unload-models-table-wrap">'
        '<table id="forge_neo_settings_unload_models_table" class="forge-neo-settings-unload-models-table">'
        f"<tbody>{body}</tbody>"
        "</table></div>"
        "</div>"
    )


def _settings_unload_models_clicked(state):
    gr.Info(_label_for_lang(state, "Forge Neo model unload requested.", "已请求卸载 Forge Neo 模型。"))
    return _settings_result_html_update(_settings_unload_models_html(unload_runtime_state(), state=state))


def _settings_json_html(values: dict[str, object] | None = None) -> str:
    return f'<pre class="forge-neo-settings-json">{html_lib.escape(settings_json(values))}</pre>'


def _settings_source_page_html(title_en: str, title_cn: str, rows: tuple[tuple[str, str], ...]) -> str:
    title = _label(title_en, title_cn)
    note = _label(
        "This source settings page is mirrored in the Forge Neo navigation. Its controls are being migrated in later stages.",
        "此源项目设置页已加入 Forge Neo 目录，相关控件会在后续阶段继续迁入。",
    )
    status = _label("Source category mapped", "源项目分类已映射")
    item_html = "".join(
        f"<li>{html_lib.escape(_label(en, cn))}</li>"
        for en, cn in rows
    )
    return (
        '<div class="forge-neo-settings-source-panel">'
        f"<h3>{html_lib.escape(title)}</h3>"
        f"<p>{html_lib.escape(status)}</p>"
        f"<p>{html_lib.escape(note)}</p>"
        f"<ul>{item_html}</ul>"
        "</div>"
    )


def _settings_search_results_html(result: object | None = None, lang: object | None = None) -> str:
    data = result if isinstance(result, Mapping) else settings_search_rows(lang=lang)
    rows = list(data.get("rows", [])) if isinstance(data.get("rows", []), list) else []
    query = str(data.get("query", "") or "").strip()
    include_all = bool(data.get("include_all"))
    if include_all:
        title = _label_for_lang(lang, "All Settings Pages", "全部设置页面")
        note = _label_for_lang(lang, "Showing every migrated Forge Neo setting.", "显示所有已迁入的 Forge Neo 设置。")
    elif query:
        title = _label_for_lang(lang, "Settings Search", "设置搜索")
        note = _label_for_lang(lang, f'Search query: "{query}"', f"搜索关键词：{query}")
    else:
        title = _label_for_lang(lang, "Settings Search", "设置搜索")
        note = _label_for_lang(lang, "Type a keyword and press Enter, or show all pages.", "输入关键词后按 Enter，或点击“显示全部页面”。")

    if rows:
        body = []
        for row in rows:
            body.append(
                "<tr>"
                f"<td>{html_lib.escape(str(row.get('section', '')))}</td>"
                f"<td>{html_lib.escape(str(row.get('label', '')))}</td>"
                f"<td><code>{html_lib.escape(str(row.get('key', '')))}</code></td>"
                f"<td>{html_lib.escape(str(row.get('value', '')))}</td>"
                f"<td>{html_lib.escape(str(row.get('default', '')))}</td>"
                "</tr>"
            )
        table = (
            '<div class="forge-neo-settings-search-table-wrap">'
            '<table id="forge_neo_settings_search_results_table" class="forge-neo-settings-search-table">'
            "<thead><tr>"
            f"<th>{html_lib.escape(_label_for_lang(lang, 'Page', '页面'))}</th>"
            f"<th>{html_lib.escape(_label_for_lang(lang, 'Setting', '设置项'))}</th>"
            f"<th>{html_lib.escape(_label_for_lang(lang, 'Key', '键名'))}</th>"
            f"<th>{html_lib.escape(_label_for_lang(lang, 'Value', '当前值'))}</th>"
            f"<th>{html_lib.escape(_label_for_lang(lang, 'Default', '默认值'))}</th>"
            "</tr></thead>"
            f"<tbody>{''.join(body)}</tbody>"
            "</table></div>"
        )
    else:
        empty = _label_for_lang(lang, "No matching setting.", "没有匹配的设置项。") if query else _label_for_lang(lang, "Waiting for a search.", "等待搜索。")
        table = f'<div id="forge_neo_settings_search_empty" class="forge-neo-settings-search-empty">{html_lib.escape(empty)}</div>'

    return (
        '<div class="forge-neo-settings-search-results">'
        f"<strong>{html_lib.escape(title)}</strong>"
        f"<p>{html_lib.escape(note)}</p>"
        f"{table}"
        "</div>"
    )


def _settings_search_results_update(value: str, *, visible: bool = True):
    return gr.update(value=value, visible=visible)


def _settings_search_submitted(state, query):
    lang = _state_lang(state)
    raw_query = str(query or "").strip()
    if not raw_query:
        message = _status(state, "Enter a Settings search keyword.", "请输入设置搜索关键词。")
        return _settings_search_results_update(
            _settings_search_results_html(settings_search_rows("", include_all=False, lang=lang), lang=lang),
            visible=False,
        ), _settings_result_update(message)
    result = settings_search_rows(raw_query, include_all=False, lang=lang)
    message = _status(
        state,
        f"Settings search finished. {result['total_count']} item(s) found.",
        f"设置搜索完成。找到 {result['total_count']} 项。",
    )
    return _settings_search_results_update(_settings_search_results_html(result, lang=lang), visible=True), _settings_result_update(message)


def _settings_show_all_clicked(state):
    lang = _state_lang(state)
    result = settings_search_rows("", include_all=True, lang=lang)
    message = _status(state, "Settings index is showing all pages.", "设置索引已显示全部页面。")
    return _settings_search_results_update(_settings_search_results_html(result, lang=lang), visible=True), _settings_result_update(message)


def _settings_show_one_clicked(state):
    lang = _state_lang(state)
    message = _status(state, "Settings returned to the current-page view.", "设置已恢复为当前页查看。")
    return _settings_search_results_update(
        _settings_search_results_html(settings_search_rows("", include_all=False, lang=lang), lang=lang),
        visible=False,
    ), _settings_result_update(message)


def _settings_sysinfo_html(value: object) -> str:
    return f'<pre class="forge-neo-settings-sysinfo">{html_lib.escape(json_dumps(value))}</pre>'


def _settings_sysinfo_download_html(state=None) -> str:
    download = _label_for_lang(state, "Download system info", "下载系统信息")
    open_text = _label_for_lang(state, "(or open as text in a new page)", "（或在新页面以文本打开）")
    return (
        '<div class="forge-neo-settings-sysinfo-download">'
        f'<a href="./internal/sysinfo-download" class="sysinfo_big_link" download>{html_lib.escape(download)}</a>'
        "<br />"
        f'<a href="./internal/sysinfo" target="_blank">{html_lib.escape(open_text)}</a>'
        "</div>"
    )


def _settings_sysinfo_validity_html(result: object | None = None, state=None) -> str:
    data = result if isinstance(result, Mapping) else {}
    selected = bool(data)
    valid = bool(data.get("valid"))
    if not selected:
        message = _status(state, "Select a sysinfo JSON file to check.", "选择 sysinfo JSON 文件进行检查。")
        status_class = "idle"
    elif valid:
        message = _status(state, "Valid Forge Neo sysinfo file.", "有效的 Forge Neo sysinfo 文件。")
        status_class = "valid"
    else:
        message = _status(state, "Invalid sysinfo file.", "无效的 sysinfo 文件。")
        status_class = "invalid"
    detail_items = []
    for key in ("message", "path", "entry", "generated_at", "error"):
        if data.get(key):
            detail_items.append(f"<p><span>{html_lib.escape(str(key))}</span>{html_lib.escape(str(data.get(key)))}</p>")
    if data.get("missing"):
        detail_items.append(f"<p><span>missing</span>{html_lib.escape(', '.join(str(item) for item in data.get('missing', [])))}</p>")
    return (
        f'<div class="forge-neo-settings-sysinfo-validity is-{status_class}">'
        f"<strong>{html_lib.escape(message)}</strong>"
        f"{''.join(detail_items)}"
        "</div>"
    )


def _apply_settings_clicked(*values):
    state = values[0]
    data = save_settings(_settings_payload(list(values[1:])))
    message = _status(state, "Settings saved.", "设置已保存。")
    return _settings_json_html(data), _settings_result_update(message, settings_path())


def _reload_settings_clicked(state):
    data = load_settings()
    message = _status(state, "Settings reloaded.", "设置已重新读取。")
    return [*_settings_updates(data), _settings_json_html(data), _settings_result_update(message, settings_path())]


def _reset_settings_clicked(state):
    data = reset_settings()
    message = _status(state, "Settings reset to defaults.", "设置已恢复默认。")
    return [*_settings_updates(data), _settings_json_html(data), _settings_result_update(message, settings_path())]


def _settings_sysinfo_clicked():
    return _settings_sysinfo_html(sysinfo_snapshot())


def _download_sysinfo_clicked(state):
    path, data = save_sysinfo()
    message = _status(state, "System info generated.", "系统信息已生成。")
    return _settings_sysinfo_html(data), str(path), _settings_result_update(message, path)


def _check_sysinfo_file_changed(file_value, state):
    result = check_sysinfo_file(file_value) if file_value else None
    return gr.update(
        value=_settings_sysinfo_validity_html(result, state=state),
        visible=bool(file_value),
    )


def _download_localization_template_clicked(state):
    lang = _state_lang(state)
    path, template = save_localization_template(lang)
    message = _status(state, "Localization template generated.", "本地化模板已生成。")
    return gr.update(value=localization_template_html(template, lang=lang, path=path), visible=True), str(path), _settings_result_update(message, path)


def _reload_script_bodies_clicked(state):
    lang = _state_lang(state)
    return _settings_result_html_update(script_body_index_html(refresh_script_body_index(), lang=lang))


def _calculate_checkpoint_hashes_clicked(state, thread_count):
    lang = _state_lang(state)
    result = calculate_checkpoint_hashes(thread_count)
    message = _status(
        state,
        f"Checkpoint hash calculation finished. {result['calculated_count']} file(s) calculated.",
        f"模型哈希计算完成。已计算 {result['calculated_count']} 个文件。",
    )
    return gr.update(value=checkpoint_hashes_html(result, lang=lang), visible=True), _settings_result_update(message)


def json_dumps(value: object) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, indent=2)


def _settings_action_notice(state, action: str) -> str:
    messages = {
        "reload_ui": (
            "Reload UI requests are handled by the Forge Neo entry process.",
            "Reload UI 请求由 Forge Neo 入口进程处理。",
        ),
    }
    en, cn = messages.get(action, messages["reload_ui"])
    return _settings_result_update(_status(state, en, cn))


def _request_reload_ui(state):
    ensure_server_state().request_restart()
    return _settings_result_update(
        _status(
            state,
            "Reload UI requested. Forge Neo will rebuild the Gradio interface.",
            "已请求重载 UI。Forge Neo 将重建 Gradio 界面。",
        )
    )


def _initial_localization_template_preview() -> str:
    return localization_template_html(lang=getattr(args_manager.args, "language", "cn"))


def _initial_checkpoint_hashes_preview() -> str:
    return checkpoint_hashes_html(lang=getattr(args_manager.args, "language", "cn"))


def _torch_version_label() -> str:
    try:
        import torch

        return str(getattr(torch, "__long_version__", getattr(torch, "__version__", "")) or "unknown")
    except Exception:
        return "unavailable"


def _footer_html() -> str:
    python_version = ".".join(str(part) for part in sys.version_info[:3])
    full_python = html_lib.escape(sys.version)
    torch_version = html_lib.escape(_torch_version_label())
    gradio_version = html_lib.escape(getattr(gr, "__version__", "unknown"))
    return f"""
<div class="forge-neo-footer">
    <div class="forge-neo-footer-links">
        <a href="https://github.com/Haoming02/sd-webui-forge-classic/issues/414" target="_blank" rel="noopener noreferrer">FAQ</a>
        <span>&#x2000;•&#x2000;</span>
        <a href="/docs" target="_blank" rel="noopener noreferrer">API</a>
        <span>&#x2000;•&#x2000;</span>
        <a href="#" onclick="window.forgeNeoShowProfile && window.forgeNeoShowProfile('./internal/profile-startup'); return false;">Startup Profile</a>
        <span>&#x2000;•&#x2000;</span>
        <a href="#" onclick="window.forgeNeoFooterReload && window.forgeNeoFooterReload(); return false;">Reload UI</a>
    </div>
    <div class="versions">
        version: <a href="https://github.com/Haoming02/sd-webui-forge-classic/tree/neo" target="_blank" rel="noopener noreferrer">neo</a>
        &#x2000;•&#x2000;
        python: <span title="{full_python}">{html_lib.escape(python_version)}</span>
        &#x2000;•&#x2000;
        torch: {torch_version}
        &#x2000;•&#x2000;
        gradio: {gradio_version}
        &#x2000;•&#x2000;
        checkpoint: <a id="sd_checkpoint_hash">N/A</a>
    </div>
</div>
"""


def _initial_settings_search_results() -> str:
    lang = getattr(args_manager.args, "language", "cn")
    return _settings_search_results_html(settings_search_rows("", include_all=False, lang=lang), lang=lang)


def _initial_license_notice() -> str:
    return license_notice_html(lang=getattr(args_manager.args, "language", "cn"))


def _extensions_action_notice(state, action: str) -> str:
    messages = {
        "apply": (
            "Apply writes extension enable state to users/config.txt, updates checked extensions, and requests a UI reload.",
            "应用会把扩展启停状态写入 users/config.txt，更新已勾选扩展，并请求重载 UI。",
        ),
        "check": (
            "Check for updates fetches Git remote refs and does not change the working tree.",
            "检查更新会 fetch Git 远端引用，不改动工作区文件。",
        ),
        "load_available": (
            "Available extensions are loaded from the local SimpAI adapted list.",
            "可用扩展来自本地 SimpAI 已适配清单。",
        ),
        "install": (
            "Installing an adapted extension runs a controlled git clone into the extensions directory.",
            "安装已适配扩展会受控 git clone 到 extensions 目录。",
        ),
        "restore": (
            "Backup restore applies extension enable state to users/config.txt and requests a UI reload.",
            "备份恢复会把扩展启用状态写入 users/config.txt，并请求重载 UI。",
        ),
        "save_state": (
            "Config state saving is read-only in this port stage.",
            "当前迁移阶段只读显示配置状态，不保存扩展配置快照。",
        ),
    }
    en, cn = messages.get(action, messages["apply"])
    return _extensions_info_html(_status(state, en, cn))


def _extensions_info_html(message: str, detail: object = "") -> str:
    escaped_message = html_lib.escape(str(message or ""))
    if detail:
        escaped_detail = html_lib.escape(str(detail))
        return f'<div class="forge-neo-extensions-info">{escaped_message}<br><span class="forge-neo-extensions-detail">{escaped_detail}</span></div>'
    return f'<div class="forge-neo-extensions-info">{escaped_message}</div>'


def _extensions_summary_html(summary: object, lang: object | None = None) -> str:
    raw_summary = json_dumps(summary)
    data = summary if isinstance(summary, Mapping) else {}
    mode = str(data.get("mode", "read-only"))
    mode_label = _label_for_lang(lang, "read-only", "只读") if mode == "read-only" else mode
    rows = [
        (_label_for_lang(lang, "Mode", "模式"), mode_label),
        (_label_for_lang(lang, "Installed", "已安装"), str(data.get("installed_count", data.get("value", "")))),
        (_label_for_lang(lang, "Built-in", "内置"), str(data.get("builtin_count", ""))),
        (_label_for_lang(lang, "User", "用户"), str(data.get("user_count", ""))),
        (_label_for_lang(lang, "Source", "来源"), " / ".join(str(data.get(key, "")) for key in ("source_project", "source_branch", "source_commit")).strip(" /")),
        (_label_for_lang(lang, "Built-in dir", "内置目录"), str(data.get("extensions_builtin_dir", ""))),
        (_label_for_lang(lang, "User dir", "用户目录"), str(data.get("extensions_dir", ""))),
        (_label_for_lang(lang, "Config states", "配置快照"), str(data.get("config_state_count", ""))),
    ]
    visible_rows = "".join(
        f"<p><span>{html_lib.escape(label)}</span>{html_lib.escape(value)}</p>"
        for label, value in rows
        if value
    )
    return (
        '<div class="forge-neo-extensions-summary">'
        f"{visible_rows}"
        f'<pre class="forge-neo-extensions-summary-raw" hidden>{html_lib.escape(raw_summary)}</pre>'
        "</div>"
    )


def _state_lang(state) -> str:
    if isinstance(state, Mapping):
        return str(state.get("__lang", getattr(args_manager.args, "language", "cn")))
    return str(getattr(args_manager.args, "language", "cn"))


def _refresh_extensions_clicked(state):
    lang = _state_lang(state)
    return (
        extension_table(lang=lang),
        _extensions_summary_html(extension_summary(), lang=lang),
        extension_config_state_table("Current", lang=lang),
        gr.update(value=extension_config_diff_table(build_extension_config_diff("Current", "extensions"), lang=lang), visible=False),
    )


def _refresh_extension_config_states_clicked(state):
    lang = _state_lang(state)
    message = _status(state, "Config states refreshed.", "配置快照已刷新。")
    return (
        gr.update(choices=extension_config_choices(lang=lang), value="Current"),
        extension_config_state_table("Current", lang=lang),
        gr.update(value=extension_config_diff_table(build_extension_config_diff("Current", "extensions"), lang=lang), visible=False),
        None,
        _extensions_info_html(message),
    )


def _extension_config_state_selected(selection: str, state):
    lang = _state_lang(state)
    try:
        download_path = extension_config_download_path(selection)
    except Exception:
        download_path = None
    show_diff = bool(selection and selection != "Current")
    return (
        extension_config_state_table(selection, lang=lang),
        gr.update(value=extension_config_diff_table(build_extension_config_diff(selection, "extensions"), lang=lang), visible=show_diff),
        download_path,
    )


def _save_extension_config_state_clicked(state, config_name: str):
    lang = _state_lang(state)
    path, _data = save_extension_config_state(config_name)
    message = _status(state, "Current extension config state saved.", "当前扩展配置快照已保存。")
    return (
        gr.update(choices=extension_config_choices(lang=lang), value=path.name),
        _extensions_info_html(message, path),
        extension_config_state_table(path.name, lang=lang),
        gr.update(value=extension_config_diff_table(build_extension_config_diff(path.name, "extensions"), lang=lang), visible=True),
        _extensions_summary_html(extension_summary(), lang=lang),
        str(path),
    )


def _restore_extension_config_state_clicked(state, selection: str, restore_type: str):
    if not selection or selection == "Current":
        lang = _state_lang(state)
        return (
            gr.update(value=extension_config_diff_table(build_extension_config_diff("Current", restore_type), lang=lang), visible=False),
            _extensions_info_html(_status(state, "Select a saved config state first.", "请先选择一个已保存的配置快照。")),
        )
    try:
        detail = extension_config_download_path(selection) or selection
        diff = build_extension_config_diff(selection, restore_type)
        result = apply_extension_config_state(selection, restore_type)
        ensure_server_state().request_restart()
    except Exception as exc:
        lang = _state_lang(state)
        return (
            gr.update(value=extension_config_diff_table(build_extension_config_diff("Current", restore_type), lang=lang), visible=False),
            _extensions_info_html(_status(state, "Selected config state cannot be read.", "所选配置快照无法读取。"), exc),
        )
    target = _label_for_lang(_state_lang(state), "extensions", "仅扩展")
    if restore_type == "webui":
        target = _label_for_lang(_state_lang(state), "webui", "仅 WebUI")
    elif restore_type == "both":
        target = _label_for_lang(_state_lang(state), "both", "全部")
    message = _status(
        state,
        f"Restore applied to extension config. {int(result.get('changed_count', 0))} change(s); UI reload requested.",
        f"恢复已写入扩展配置。{int(result.get('changed_count', 0))} 个变更；已请求重载 UI。",
    )
    detail_text = f"{detail} -> {result.get('config_path', '')}"
    return gr.update(value=extension_config_diff_table(diff, lang=_state_lang(state)), visible=True), _extensions_info_html(f"{message} {target}", detail_text)


def _install_extension_preview_clicked(state, dirname: str, url: str, branch: str):
    lang = _state_lang(state)
    try:
        preview = install_extension_from_url(dirname, url, branch)
    except Exception as exc:
        if not str(url or "").strip():
            message = _status(state, "Enter an extension repository URL first.", "请先填写扩展 git 仓库 URL。")
        else:
            message = _status(state, "Extension installation failed.", "扩展安装失败。")
        preview = getattr(exc, "preview", None)
        if not isinstance(preview, Mapping):
            preview = {}
            if str(url or "").strip():
                try:
                    preview = build_extension_install_preview(dirname, url, branch)
                except Exception:
                    preview = {}
        preview = dict(preview)
        preview.update(
            {
                "mode": "install-failed",
                "install_allowed": False,
                "installed": False,
                "writes_files": False,
                "message": message,
            }
        )
        preview.setdefault("url", str(url or "").strip())
        preview.setdefault("dirname", str(dirname or "").strip())
        preview.setdefault("branch", str(branch or "").strip())
        preview.setdefault("error", str(exc))
        return (
            gr.update(),
            gr.update(value=extension_install_preview_html(preview, lang=lang, message=message), visible=True),
            _extensions_info_html(message, exc),
            gr.update(),
            gr.update(),
            gr.update(),
        )
    if preview.get("already_installed"):
        message = _status(
            state,
            "The extension may already exist; no files were changed.",
            "该扩展可能已存在，没有改动文件。",
        )
    else:
        message = _status(
            state,
            "Extension installed. Restart the UI to load it.",
            "扩展已安装。重启 UI 后加载。",
        )
    return (
        gr.update(value=preview["dirname"]),
        gr.update(value=extension_install_preview_html(preview, lang=lang), visible=True),
        _extensions_info_html(message, preview["target_dir"]),
        extension_table(lang=lang),
        _extensions_summary_html(extension_summary(), lang=lang),
        extension_config_state_table("Current", lang=lang),
    )


def _check_extensions_clicked(state):
    lang = _state_lang(state)
    preview = build_extension_update_preview(fetch=True)
    update_candidates = extension_update_candidate_names(preview)
    message = _status(
        state,
        f"Update check finished. {preview['checked_count']} extension(s) checked, {preview['fetched_count']} fetched, {preview['update_available_count']} update(s) available. Working tree was not changed.",
        f"更新检查完成。已检查 {preview['checked_count']} 个扩展，fetch {preview['fetched_count']} 个，发现 {preview['update_available_count']} 个可更新。未改动工作区文件。",
    )
    return (
        json.dumps(update_candidates, ensure_ascii=False),
        gr.update(value=extension_update_preview_table(preview, lang=lang), visible=True),
        _extensions_info_html(message),
        extension_table(lang=lang, update_preview=preview),
    )


def _apply_extensions_preview_clicked(state, disable_all: str, disabled_list: object = "[]", update_list: object = "[]"):
    lang = _state_lang(state)
    preview = apply_extension_changes(disabled_list, update_list, disable_all)
    ensure_server_state().request_restart()
    preview["restarts_ui"] = True
    message = _status(
        state,
        f"Extension changes applied. {preview['affected_count']} extension(s) affected, {preview['updated_count']} updated; UI reload requested.",
        f"扩展变更已应用。影响 {preview['affected_count']} 个扩展，已更新 {preview['updated_count']} 个；已请求重载 UI。",
    )
    update_state = "[]"
    disabled_state = json.dumps(preview.get("disabled_extensions", []), ensure_ascii=False)
    return (
        disabled_state,
        update_state,
        gr.update(value=extension_apply_preview_table(preview, lang=lang), visible=True),
        _extensions_info_html(message, preview.get("config_path", "")),
        extension_table(lang=lang),
        _extensions_summary_html(extension_summary(), lang=lang),
        extension_config_state_table("Current", lang=lang),
    )


def _load_available_extensions_clicked(
    state,
    index_url: str,
    selected_tags,
    showing_type: str,
    filtering_type: str,
    sort_column: str,
    search: str,
    refresh: bool = True,
):
    lang = _state_lang(state)
    try:
        items = load_available_extensions(
            index_url,
            selected_tags=selected_tags or [],
            showing_type=showing_type,
            filtering_type=filtering_type,
            sort_column=sort_column,
            search=search,
            refresh=refresh,
        )
    except Exception as exc:
        message = _status(state, "Failed to load the adapted extension list.", "已适配扩展清单读取失败。")
        return (
            available_extension_table([], lang=lang, source_url=ADAPTED_AVAILABLE_EXTENSION_SOURCE, message=message),
            gr.update(),
            _extensions_info_html(message, exc),
        )
    tag_choices = cached_available_extension_tag_choices(index_url, lang=lang)
    tag_values = {str(choice[1]) for choice in tag_choices}
    selected_tag_values = [str(tag) for tag in selected_tags or [] if str(tag) in tag_values]
    filter_counts = available_extension_filter_counts(
        index_url,
        selected_tags=selected_tags or [],
        showing_type=showing_type,
        filtering_type=filtering_type,
        sort_column=sort_column,
        search=search,
    )
    message = _status(
        state,
        f"Loaded {len(items)} adapted extension entries from the local list.",
        f"已读取 {len(items)} 个本地已适配扩展。",
    )
    return (
        available_extension_table(items, lang=lang, source_url=ADAPTED_AVAILABLE_EXTENSION_SOURCE, filter_counts=filter_counts),
        gr.update(choices=tag_choices, value=selected_tag_values),
        _extensions_info_html(message, ADAPTED_AVAILABLE_EXTENSION_SOURCE),
    )


def _filter_available_extensions_changed(state, index_url: str, selected_tags, showing_type: str, filtering_type: str, sort_column: str, search: str):
    available_html, _tag_update, info_html = _load_available_extensions_clicked(
        state,
        index_url,
        selected_tags,
        showing_type,
        filtering_type,
        sort_column,
        search,
        refresh=False,
    )
    return available_html, info_html


def _initial_extension_table() -> str:
    return extension_table(lang=getattr(args_manager.args, "language", "cn"))


def _initial_extension_update_preview() -> str:
    return extension_update_preview_table(lang=getattr(args_manager.args, "language", "cn"))


def _initial_extension_apply_preview() -> str:
    return extension_apply_preview_table(lang=getattr(args_manager.args, "language", "cn"))


def _initial_extension_config_state() -> str:
    return extension_config_state_table("Current", lang=getattr(args_manager.args, "language", "cn"))


def _initial_extension_config_diff() -> str:
    lang = getattr(args_manager.args, "language", "cn")
    return extension_config_diff_table(build_extension_config_diff("Current", "extensions"), lang=lang)


def _initial_extension_install_preview() -> str:
    return extension_install_preview_html(lang=getattr(args_manager.args, "language", "cn"))


def _extensions_available_empty() -> str:
    lang = getattr(args_manager.args, "language", "cn")
    items = load_available_extensions(
        ADAPTED_AVAILABLE_EXTENSION_SOURCE,
        selected_tags=[],
        showing_type="show",
        filtering_type="or",
        sort_column="internal order",
        search="",
        refresh=True,
    )
    filter_counts = available_extension_filter_counts(
        ADAPTED_AVAILABLE_EXTENSION_SOURCE,
        selected_tags=[],
        showing_type="show",
        filtering_type="or",
        sort_column="internal order",
        search="",
    )
    return available_extension_table(
        items,
        lang=lang,
        source_url=ADAPTED_AVAILABLE_EXTENSION_SOURCE,
        filter_counts=filter_counts,
    )


def _refresh_models(preset: str):
    choices = refresh_model_choices(preset)
    lora_update, lora_weights = _lora_default_updates(preset, choices)
    return (
        *_model_default_updates(preset, choices),
        lora_update,
        lora_update,
        lora_weights,
        lora_weights,
        gr.update(choices=_hires_checkpoint_choices(choices), value="Use same checkpoint"),
        gr.update(choices=_hires_module_choices(choices), value=["Use same choices"]),
        gr.update(choices=_refiner_checkpoint_choices(choices), value="None"),
        gr.update(choices=_refiner_checkpoint_choices(choices), value="None"),
        gr.update(choices=_modulated_guidance_clip_choices(choices), value=_default_modulated_guidance_clip(choices)),
        gr.update(choices=_modulated_guidance_clip_choices(choices), value=_default_modulated_guidance_clip(choices)),
        *_controlnet_model_updates(choices),
        *_extra_browser_updates(preset, choices),
        *_merger_model_updates(choices),
    )


def _refresh_merger_models(preset: str):
    choices = refresh_model_choices(preset)
    return _merger_model_updates(choices)


def _checkpoint_changed(checkpoint_name: str, preset: str):
    choices = refresh_model_choices(preset)
    if not str(checkpoint_name or "").strip() or str(checkpoint_name or "").strip().casefold() == "none":
        return (
            gr.update(choices=choices.vae, value="None"),
            gr.update(choices=module_choices(choices), value=[]),
        )
    return (
        gr.update(choices=choices.vae),
        gr.update(choices=module_choices(choices)),
    )


def _preset_dcfg_value(
    preset: str,
    *,
    is_img2img: bool = False,
    is_hires: bool = False,
    settings: dict[str, object] | None = None,
) -> float:
    key = str(preset or "").lower()
    if settings is None:
        settings = load_settings()
    if is_hires:
        suffix = "t2i_hr_dcfg"
    else:
        suffix = "i2i_dcfg" if is_img2img else "t2i_dcfg"
    if key in PRESET_SHIFT:
        return float(settings.get(f"{key}_{suffix}", abs(PRESET_SHIFT[key])))
    if key in PRESET_DISTILL:
        return float(settings.get(f"{key}_{suffix}", PRESET_DISTILL[key]))
    return 3.0


def _preset_dcfg_visible(preset: str, *, settings: dict[str, object] | None = None) -> bool:
    key = str(preset or "").lower()
    if key in PRESET_SHIFT:
        if settings is None:
            settings = load_settings()
        return bool(settings.get(f"{key}_show_shift", PRESET_SHIFT[key] > 0.0))
    return key in PRESET_DISTILL


def _preset_dcfg_label(preset: str) -> tuple[str, str]:
    key = str(preset or "").lower()
    if key in PRESET_SHIFT:
        return ("Shift", "Shift")
    return ("Distilled CFG Scale", "蒸馏 CFG 比例")


def _preset_dcfg_update(preset: str, *, is_img2img: bool = False, is_hires: bool = False):
    return gr.update(
        value=_preset_dcfg_value(preset, is_img2img=is_img2img, is_hires=is_hires),
        visible=_preset_dcfg_visible(preset),
        label=_label(*_preset_dcfg_label(preset)),
    )


def _preset_changed(preset: str):
    preset_key = str(preset or "").strip().lower()
    if preset_key in UI_PRESETS:
        save_forge_neo_config_values({"forge_preset": preset_key})
    settings = load_settings()
    defaults = settings_defaults_for_preset(preset, mode="t2i", settings=settings)
    hires_defaults = settings_defaults_for_preset(preset, mode="t2i_hr", settings=settings)
    img_defaults = settings_defaults_for_preset(preset, mode="i2i", settings=settings)
    choices = refresh_model_choices(preset)
    lora_update, lora_weights = _lora_default_updates(preset, choices)
    prompt_value = _default_prompt(preset, choices)
    return (
        *_model_default_updates(preset, choices),
        prompt_value,
        prompt_value,
        int(defaults["steps"]),
        int(defaults["width"]),
        int(defaults["height"]),
        float(defaults["cfg_scale"]),
        _preset_dcfg_update(preset),
        int(hires_defaults["steps"]),
        float(hires_defaults["cfg_scale"]),
        _preset_dcfg_update(preset, is_hires=True),
        int(defaults["batch_size"]),
        defaults["sampler"],
        defaults["scheduler"],
        int(img_defaults["steps"]),
        int(img_defaults["width"]),
        int(img_defaults["height"]),
        float(img_defaults["cfg_scale"]),
        _preset_dcfg_update(preset, is_img2img=True),
        int(img_defaults["batch_size"]),
        img_defaults["sampler"],
        img_defaults["scheduler"],
        lora_update,
        lora_update,
        lora_weights,
        lora_weights,
        gr.update(choices=_hires_checkpoint_choices(choices), value="Use same checkpoint"),
        gr.update(choices=_hires_module_choices(choices), value=["Use same choices"]),
        gr.update(choices=_refiner_checkpoint_choices(choices), value="None"),
        gr.update(choices=_refiner_checkpoint_choices(choices), value="None"),
        gr.update(choices=_modulated_guidance_clip_choices(choices), value=_default_modulated_guidance_clip(choices)),
        gr.update(choices=_modulated_guidance_clip_choices(choices), value=_default_modulated_guidance_clip(choices)),
        *_controlnet_model_updates(choices),
        *_extra_browser_updates(preset, choices),
        *_merger_model_updates(choices),
    )


def _preset_restore_changed(preset: str):
    preset_key = str(preset or "").strip().lower()
    if preset_key not in UI_PRESETS:
        preset_key = initial_preset()
    return (
        gr.update(value=preset_key),
        *_preset_changed(preset_key),
    )


def _read_png_clicked(image, state):
    text = read_png_info(image, state)
    has_image = image is not None
    return (
        text,
        gr.update(value=png_info_html(image, state), visible=has_image),
        _png_status_update(_status(state, "PNG info loaded.", "PNG Info 已读取。"), visible=has_image),
    )


def _png_status_html(message: str) -> str:
    return f'<div class="forge-neo-pnginfo-status">{html_lib.escape(str(message or ""))}</div>'


def _png_status_update(message: str, *, visible: bool = True):
    return gr.update(value=_png_status_html(message), visible=visible)


def _no_script_send_updates() -> list[object]:
    return [gr.update() for _ in range(SCRIPT_SEND_FIELD_COUNT)]


def _as_bool_param(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().casefold()
    if text in {"true", "yes", "on", "1"}:
        return True
    if text in {"false", "no", "off", "0"}:
        return False
    return default


def _script_update_value(params: dict[str, object], key: str, *, default: object = None, cast=None):
    if key not in params:
        return gr.update()
    value = params.get(key, default)
    if cast is not None:
        try:
            value = cast(value)
        except Exception:
            value = default
    return gr.update(value=value)


def _script_update_bool(params: dict[str, object], key: str, *, default: bool = False):
    if key not in params:
        return gr.update()
    return gr.update(value=_as_bool_param(params.get(key), default))


def _script_update_number(params: dict[str, object], key: str, *, default: object, cast):
    if key not in params:
        return gr.update()
    try:
        value = cast(params.get(key))
    except Exception:
        value = default
    return gr.update(value=value)


def _script_grid_margin_update(params: dict[str, object], script: str, *, prompt_matrix: bool = False):
    key = "script_prompt_matrix_margin" if prompt_matrix else "script_xyz_margin"
    if key in params:
        return _script_update_number(params, key, default=0, cast=int)
    if "grid_margins" in params and script == ("Prompt Matrix" if prompt_matrix else "X/Y/Z plot"):
        return _script_update_number(params, "grid_margins", default=0, cast=int)
    return gr.update()


def _script_xyz_axis_updates(params: dict[str, object], axis: str, csv_mode: bool) -> list[object]:
    type_key = f"script_xyz_{axis}_type"
    values_key = f"script_xyz_{axis}_values"
    if type_key not in params and values_key not in params:
        return [gr.update(), gr.update(), gr.update(), gr.update()]
    axis_type = str(params.get(type_key) or "Nothing")
    axis_values = str(params.get(values_key) or "")
    fill_update, text_update, dropdown_update = _xyz_select_axis(axis_type, axis_values, [], csv_mode)
    return [gr.update(value=axis_type), text_update, dropdown_update, fill_update]


def _script_param_send_updates(params: dict[str, object], script: str) -> list[object]:
    script_name = str(script or "None").strip()
    updates: list[object] = []
    updates.extend(
        [
            _script_update_bool(params, "script_prompt_matrix_put_at_start"),
            _script_update_bool(params, "script_prompt_matrix_different_seeds"),
            _script_update_value(params, "script_prompt_matrix_prompt_type"),
            _script_update_value(params, "script_prompt_matrix_delimiter"),
            _script_grid_margin_update(params, script_name, prompt_matrix=True),
            _script_update_bool(params, "script_prompts_iterate_seed"),
            _script_update_bool(params, "script_prompts_same_seed"),
            _script_update_value(params, "script_prompts_position"),
            _script_update_value(params, "script_prompts_text"),
        ]
    )
    csv_mode = _as_bool_param(params.get("script_xyz_csv_mode"), False)
    updates.extend(_script_xyz_axis_updates(params, "x", csv_mode))
    updates.extend(_script_xyz_axis_updates(params, "y", csv_mode))
    updates.extend(_script_xyz_axis_updates(params, "z", csv_mode))
    updates.extend(
        [
            _script_update_number(params, "script_xyz_row_count", default=0, cast=int),
            _script_grid_margin_update(params, script_name, prompt_matrix=False),
            _script_update_bool(params, "script_xyz_draw_legend", default=True),
            _script_update_bool(params, "script_xyz_keep_minus_one"),
            _script_update_bool(params, "script_xyz_vary_x"),
            _script_update_bool(params, "script_xyz_vary_y"),
            _script_update_bool(params, "script_xyz_vary_z"),
            _script_update_bool(params, "script_xyz_include_sub_images"),
            _script_update_bool(params, "script_xyz_include_sub_grids"),
            _script_update_bool(params, "script_xyz_csv_mode"),
            _script_update_number(params, "script_loopback_loops", default=2, cast=int),
            _script_update_number(params, "script_loopback_final_denoising", default=0.5, cast=float),
            _script_update_value(params, "script_loopback_curve"),
            _script_update_value(params, "script_sd_upscale_upscaler"),
            _script_update_number(params, "script_sd_upscale_scale", default=2.0, cast=float),
            _script_update_number(params, "script_sd_upscale_overlap", default=64, cast=int),
            _script_update_bool(params, "script_sd_upscale_override"),
        ]
    )
    return updates


def _script_send_updates_from_params(params: dict[str, object]) -> list[object]:
    script = str(params.get("script") or "").strip()
    if not script:
        return _no_script_send_updates()
    return [
        gr.update(value=script),
        *_script_panel_updates(script),
        *_script_param_send_updates(params, script),
    ]


def _png_send_updates(text: str, state, *, target: str) -> tuple[object, ...]:
    params = parse_generation_parameters(text)
    if not params:
        message = _status(state, "No generation parameters found.", "没有找到可回填的生成参数。")
        if target == "txt2img":
            return (message, *[gr.update() for _ in range(9)], *_no_script_send_updates())
        return (message, *[gr.update() for _ in range(9)], *_no_script_send_updates(), gr.update())

    prompt = str(params.get("prompt", ""))
    negative = str(params.get("negative_prompt", ""))
    sampler = params.get("sampler")
    scheduler = params.get("scheduler")
    steps_value = params.get("steps")
    width_value = params.get("width")
    height_value = params.get("height")
    cfg_value = params.get("cfg_scale")
    seed_value = params.get("seed")
    denoise_value = params.get("denoising_strength")
    message = _status(state, "Parameters sent.", "参数已发送。")

    common = [
        gr.update(value=prompt),
        gr.update(value=negative),
        gr.update(value=sampler) if sampler else gr.update(),
        gr.update(value=scheduler) if scheduler else gr.update(),
        gr.update(value=steps_value) if steps_value is not None else gr.update(),
        gr.update(value=width_value) if width_value is not None else gr.update(),
        gr.update(value=height_value) if height_value is not None else gr.update(),
        gr.update(value=cfg_value) if cfg_value is not None else gr.update(),
        gr.update(value=seed_value) if seed_value is not None else gr.update(),
        *_script_send_updates_from_params(params),
    ]
    if target == "txt2img":
        return (message, *common)
    return (
        message,
        *common,
        gr.update(value=denoise_value) if denoise_value is not None else gr.update(),
    )


def _send_png_to_txt2img(text: str, state):
    updates = _png_send_updates(text, state, target="txt2img")
    return (_png_status_update(str(updates[0])), *updates[1:])


def _send_png_to_img2img(text: str, state):
    updates = _png_send_updates(text, state, target="img2img")
    return (_png_status_update(str(updates[0])), *updates[1:])


def _send_png_to_inpaint(text: str, state):
    updates = _png_send_updates(text, state, target="img2img")
    return (_png_status_update(str(updates[0])), *updates[1:], "inpaint")


def _png_image_target_update(image, state, *, target: str) -> tuple[object, str]:
    if image is None:
        return gr.update(), _status(state, "No image to send.", "没有可发送的图片。")
    if target == "inpaint":
        return gr.update(value=image), _status(state, "Image sent to inpaint.", "图片已发送到局部重绘。")
    return gr.update(value=image), _status(state, "Image sent to img2img.", "图片已发送到图生图。")


def _send_png_image_to_img2img(text: str, image, state):
    image_update, image_message = _png_image_target_update(image, state, target="img2img")
    updates = _png_send_updates(text, state, target="img2img")
    has_params = bool(parse_generation_parameters(text))
    status_message = _status(state, "Image and parameters sent.", "图片和参数已发送。") if image is not None and has_params else image_message
    if image is None and has_params:
        status_message = str(updates[0])
    if image is None and not has_params:
        status_message = _status(state, "No image or generation parameters found.", "没有找到可发送的图片或生成参数。")
    return (_png_status_update(status_message), image_update, *updates[1:])


def _send_png_image_to_inpaint(text: str, image, state):
    image_update, image_message = _png_image_target_update(image, state, target="inpaint")
    updates = _png_send_updates(text, state, target="img2img")
    has_params = bool(parse_generation_parameters(text))
    status_message = _status(state, "Image and parameters sent.", "图片和参数已发送。") if image is not None and has_params else image_message
    if image is None and has_params:
        status_message = str(updates[0])
    if image is None and not has_params:
        status_message = _status(state, "No image or generation parameters found.", "没有找到可发送的图片或生成参数。")
    return (_png_status_update(status_message), image_update, *updates[1:], "inpaint")


def _has_generation_parameter_payload(text: str | None) -> bool:
    params = parse_generation_parameters(text)
    return bool(GENERATION_PARAMETER_KEYS.intersection(params))


def _prompt_history_path() -> Path:
    configured_root = str(
        os.environ.get("FORGE_NEO_SOURCE_BACKEND_DATA_DIR")
        or os.environ.get("FORGE_NEO_DATA_PATH")
        or ""
    ).strip()
    if configured_root:
        root = Path(configured_root).expanduser()
        if (root / "webui" / "models").is_dir():
            root = root / "webui"
    else:
        root = Path(__file__).resolve().parent / "webui"
    return root / "params.txt"


def _read_prompt_history() -> str:
    try:
        return _prompt_history_path().read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _write_prompt_history(infotext: str | None) -> None:
    value = str(infotext or "").strip()
    if not value:
        return
    try:
        path = _prompt_history_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")
    except OSError:
        pass


def _paste_parameter_source(prompt_text: str | None, infotext: str | None) -> str:
    prompt_source = str(prompt_text or "").strip()
    if prompt_source:
        return prompt_source
    return _read_prompt_history() or str(infotext or "").strip()


def _paste_txt2img_params_clicked(prompt_text: str | None, infotext: str | None, state):
    return _output_status_tuple(_png_send_updates(_paste_parameter_source(prompt_text, infotext), state, target="txt2img"), 0)


def _paste_img2img_params_clicked(prompt_text: str | None, infotext: str | None, state):
    return _output_status_tuple(_png_send_updates(_paste_parameter_source(prompt_text, infotext), state, target="img2img"), 0)


def _clear_prompts_clicked(state):
    return "", "", _output_status_update(_status(state, "Prompts cleared.", "提示词已清空。"))


def _random_seed_clicked() -> int:
    return -1


def _reuse_seed_clicked(infotext: str | None):
    seed_value = parse_generation_parameters(infotext or "").get("seed")
    if seed_value is None:
        return gr.update()
    try:
        return int(seed_value)
    except (TypeError, ValueError):
        return gr.update()


def _send_png_to_extras(image, state):
    message = _status(state, "Image sent to Extras.", "图片已发送到 Extras。")
    if image is None:
        message = _status(state, "No image to send.", "没有可发送的图片。")
        return gr.update(), _png_status_update(message)
    return gr.update(value=image), _png_status_update(message)


def _gallery_selected_index(evt: gr.EventData):
    index = getattr(evt, "index", -1)
    if isinstance(index, (list, tuple)):
        index = index[0] if index else -1
    try:
        return str(int(index))
    except Exception:
        return "-1"


def _gallery_image_update(gallery, state, selected_index=-1):
    image = gallery_image_at(gallery, selected_index)
    if image is None:
        return gr.update(), _status(state, "No output image to send.", "没有可发送的结果图片。")
    return gr.update(value=image), ""


def _send_output_to_img2img(gallery, text: str, state, selected_index=-1):
    image_update, image_message = _gallery_image_update(gallery, state, selected_index)
    params = _png_send_updates(text, state, target="img2img")
    status_message = image_message or _status(state, "Output sent to img2img.", "结果已发送到 img2img。")
    return (image_update, *params[1:], _output_status_update(status_message))


def _send_output_to_inpaint(gallery, text: str, state, selected_index=-1):
    image_update, image_message = _gallery_image_update(gallery, state, selected_index)
    params = _png_send_updates(text, state, target="img2img")
    status_message = image_message or _status(state, "Output sent to inpaint.", "结果已发送到 inpaint。")
    return (image_update, *params[1:], "inpaint", _output_status_update(status_message))


def _send_output_to_extras(gallery, state, selected_index=-1):
    image_update, image_message = _gallery_image_update(gallery, state, selected_index)
    status_message = image_message or _status(state, "Output sent to Extras.", "结果已发送到 Extras。")
    return image_update, _output_status_update(status_message)


def _send_output_to_upscale(gallery, state, selected_index=-1):
    image_update, image_message = _gallery_image_update(gallery, state, selected_index)
    if image_message:
        return gr.update(), gr.update(), gr.update(), gr.update(), _output_status_update(image_message)
    status_message = _status(
        state,
        "Output sent to Extras with upscale preset.",
        "结果已发送到 Extras，并预设为高清放大。",
    )
    return image_update, "single", "Scale by", gr.update(value=2.0), _output_status_update(status_message)


def _storyboard_status_html(message: str) -> str:
    lines = str(message or "").splitlines() or [""]
    body = "<br>".join(html_lib.escape(line) for line in lines)
    return f'<div class="forge-neo-storyboard-status">{body}</div>'


def _storyboard_status_update(message: str, *, visible: bool = True):
    return gr.update(value=_storyboard_status_html(message), visible=visible)


def _storyboard_summary_html(page: object = 1, state=None) -> str:
    items, current_page, total_pages, total_count = storyboard_page_items(page)
    lang = _state_lang(state)
    empty = _label_for_lang(lang, "No storyboard frames yet.", "暂无分镜。")
    title = _label_for_lang(lang, "Storyboard Wall", "分镜墙")
    summary = _label_for_lang(
        lang,
        f"Page {current_page} / {total_pages} · {total_count} frame(s)",
        f"第 {current_page} / {total_pages} 页 · 共 {total_count} 个分镜",
    )
    rows = []
    for item in items:
        frame_id = int(item.get("id", 0)) + 1
        description = str(item.get("description") or "").strip() or _label_for_lang(lang, "No annotation", "无注释")
        image_path = str(item.get("image_path") or "")
        rows.append(
            "<tr>"
            f"<th>#{frame_id}</th>"
            f"<td>{html_lib.escape(description)}</td>"
            f"<td>{html_lib.escape(image_path)}</td>"
            "</tr>"
        )
    body = "".join(rows) or f'<tr><td colspan="3">{html_lib.escape(empty)}</td></tr>'
    return (
        '<div class="forge-neo-storyboard-summary">'
        f"<strong>{html_lib.escape(title)}</strong>"
        f"<p>{html_lib.escape(summary)}</p>"
        '<table id="forge_neo_storyboard_table" class="forge-neo-storyboard-table">'
        f"<tbody>{body}</tbody>"
        "</table>"
        "</div>"
    )


STORYBOARD_PANEL_OUTPUT_COUNT = 1 + (STORYBOARDS_PER_PAGE * 4) + 4
STORYBOARD_CHARACTER_OUTPUT_COUNT = 6


def _storyboard_panel_updates(state, page: object = 1, message: str = "", *, status_visible: bool = False):
    _items, current_page, total_pages, _total_count = storyboard_page_items(page)
    images, audios, descriptions, labels, current_page, total_pages, _total_count = storyboard_cell_values(current_page)
    return (
        gr.update(value=storyboard_gallery_values(current_page), visible=False),
        *[gr.update(value=value) for value in images],
        *[gr.update(value=value) for value in audios],
        *[gr.update(value=value) for value in descriptions],
        *[gr.update(value=value) for value in labels],
        gr.update(value=_storyboard_summary_html(current_page, state), visible=True),
        _storyboard_status_update(message, visible=status_visible),
        current_page,
        total_pages,
    )


_STORY_GENRE_LABELS = {
    "奇幻": ("Fantasy", "奇幻"),
    "科幻": ("Sci-fi", "科幻"),
    "爱情": ("Romance", "爱情"),
    "动作": ("Action", "动作"),
    "悬疑": ("Mystery", "悬疑"),
    "恐怖": ("Horror", "恐怖"),
    "喜剧": ("Comedy", "喜剧"),
    "冒险": ("Adventure", "冒险"),
    "历史": ("History", "历史"),
    "其他": ("Other", "其他"),
}


def _storyboard_genre_choices(selected: object = "") -> list[tuple[str, str]]:
    choices = [(_label(*_STORY_GENRE_LABELS.get(value, (value, value))), value) for value in STORY_GENRES]
    selected_text = str(selected or "").strip()
    if selected_text and selected_text not in STORY_GENRES:
        choices.append((selected_text, selected_text))
    return choices


def _storyboard_story_dropdown_update(selected: object = ""):
    choices = story_script_choices()
    selected_text = str(selected or "").strip()
    value = selected_text if selected_text in choices else (choices[0] if choices else "")
    return gr.update(choices=choices, value=value)


def _storyboard_story_field_updates(story_key: object = ""):
    story = load_story_script(story_key)
    genre = str(story.get("genre") or STORY_GENRES[0])
    return (
        str(story.get("title") or ""),
        gr.update(choices=_storyboard_genre_choices(genre), value=genre),
        str(story.get("script") or ""),
    )


def _storyboard_character_template(state) -> str:
    return _status(
        state,
        "Name:\nAge:\nPersonality:\nAppearance:\nBackground:\nRole in story:",
        "姓名：\n年龄：\n性格：\n外貌：\n背景：\n故事中的作用：",
    )


def _storyboard_character_page_for_name(story_key: object, character_name: object) -> int:
    selected = str(character_name or "").strip()
    if not selected:
        return 1
    _choices, _current_page, total_pages, _total = story_character_choices(story_key, 1)
    for page in range(1, total_pages + 1):
        page_choices, _page, _pages, _count = story_character_choices(story_key, page)
        if selected in page_choices:
            return page
    return 1


def _storyboard_character_dropdown_update(story_key: object, page: object = 1, selected: object = ""):
    choices, current_page, total_pages, total_count = story_character_choices(story_key, page)
    selected_text = str(selected or "").strip()
    selected_character = load_story_character(story_key, selected_text) if selected_text else {}
    if selected_text and not selected_character.get("name"):
        selected_text = ""
    if not selected_text and choices:
        selected_text = choices[0]
    if selected_text and selected_text not in choices:
        choices = [selected_text, *choices]
    value = selected_text if selected_text else ""
    return gr.update(choices=choices, value=value), current_page, total_pages, total_count


def _storyboard_character_field_updates(story_key: object, character_name: object = ""):
    character = load_story_character(story_key, character_name)
    image_path = str(character.get("image_path") or "")
    return (
        str(character.get("content") or ""),
        image_path if image_path and Path(image_path).is_file() else None,
    )


def _storyboard_character_panel_updates(
    state,
    story_key: object,
    page: object = 1,
    selected: object = "",
    message: str = "",
    *,
    status_visible: bool = False,
):
    dropdown_update, current_page, total_pages, _total_count = _storyboard_character_dropdown_update(story_key, page, selected)
    selected_name = str(dropdown_update.get("value") or "")
    content, image_path = _storyboard_character_field_updates(story_key, selected_name)
    return (
        dropdown_update,
        gr.update(value=content),
        gr.update(value=image_path),
        current_page,
        total_pages,
        _storyboard_status_update(message, visible=status_visible),
    )


def _storyboard_character_story_changed(state, story_key):
    return _storyboard_character_panel_updates(state, story_key, 1, "", "", status_visible=False)


def _storyboard_character_selected(state, story_key, character_name):
    content, image_path = _storyboard_character_field_updates(story_key, character_name)
    if not str(character_name or "").strip():
        return gr.update(value=""), gr.update(value=None), _storyboard_status_update("", visible=False)
    message = _status(state, "Character loaded.", "角色小传已载入。")
    return gr.update(value=content), gr.update(value=image_path), _storyboard_status_update(message, visible=True)


def _storyboard_new_character_clicked(state):
    message = _status(state, "New character draft created.", "已新建角色草稿。")
    return (
        gr.update(value=""),
        gr.update(value=_storyboard_character_template(state)),
        gr.update(value=None),
        _storyboard_status_update(message, visible=True),
    )


def _storyboard_save_character_clicked(state, story_key, character_name, content, image, page):
    try:
        character = save_story_character(story_key, character_name, content, image)
    except ValueError as exc:
        key = str(exc)
        message = _status(
            state,
            "Select a story and enter a character name.",
            "请选择故事，并填写角色名。",
        )
        if "Character" in key:
            message = _status(state, "Enter a character name in the selector or first line.", "请在下拉框或第一行填写角色名。")
        return (*_storyboard_character_panel_updates(state, story_key, page, character_name, message, status_visible=True),)

    name = str(character.get("name") or "")
    target_page = _storyboard_character_page_for_name(story_key, name)
    message = _status(state, f"Character saved: {name}", f"角色《{name}》已保存。")
    return _storyboard_character_panel_updates(state, story_key, target_page, name, message, status_visible=True)


def _storyboard_delete_character_clicked(state, story_key, character_name, page):
    name = str(character_name or "").strip()
    if not name:
        message = _status(state, "Select a character first.", "请先选择一个角色。")
        return _storyboard_character_panel_updates(state, story_key, page, name, message, status_visible=True)
    character = delete_story_character(story_key, name)
    next_name = str(character.get("name") or "")
    message = _status(state, f"Character deleted: {name}", f"已删除角色《{name}》。")
    target_page = _storyboard_character_page_for_name(story_key, next_name)
    return _storyboard_character_panel_updates(state, story_key, target_page, next_name, message, status_visible=True)


def _storyboard_delete_character_image_clicked(state, story_key, character_name, page):
    name = str(character_name or "").strip()
    if not name:
        message = _status(state, "Select a character first.", "请先选择一个角色。")
        return _storyboard_character_panel_updates(state, story_key, page, name, message, status_visible=True)
    character = delete_story_character_image(story_key, name)
    selected = str(character.get("name") or name)
    message = _status(state, f"Character image removed: {selected}", f"角色《{selected}》图片已移除。")
    return _storyboard_character_panel_updates(state, story_key, page, selected, message, status_visible=True)


def _storyboard_character_prev_clicked(state, story_key, page):
    try:
        next_page = int(float(str(page or 1))) - 1
    except Exception:
        next_page = 1
    return _storyboard_character_panel_updates(state, story_key, next_page, "", "", status_visible=False)


def _storyboard_character_next_clicked(state, story_key, page):
    try:
        next_page = int(float(str(page or 1))) + 1
    except Exception:
        next_page = 1
    return _storyboard_character_panel_updates(state, story_key, next_page, "", "", status_visible=False)


def _storyboard_story_selected(story_key, state):
    title, genre_update, script = _storyboard_story_field_updates(story_key)
    if str(story_key or "").strip() and not title:
        title = str(story_key or "").strip()
    if not str(story_key or "").strip():
        return title, genre_update, script, _storyboard_status_update("", visible=False)
    message = _status(state, "Story loaded.", "剧本已载入。")
    return title, genre_update, script, _storyboard_status_update(message, visible=True)


def _storyboard_new_story_clicked(state):
    story = create_story_script(_status(state, "Untitled Story", "新故事"))
    key = str(story.get("key") or "")
    message = _status(state, "New story created.", "已新建故事。")
    return (
        _storyboard_story_dropdown_update(key),
        str(story.get("title") or ""),
        gr.update(choices=_storyboard_genre_choices(story.get("genre")), value=story.get("genre") or STORY_GENRES[0]),
        str(story.get("script") or ""),
        gr.update(value=None),
        _storyboard_status_update(message, visible=True),
    )


def _storyboard_save_story_clicked(state, story_key, title, genre, script):
    try:
        story = save_story_script(story_key, title, genre, script)
    except ValueError:
        message = _status(state, "Please enter a story title.", "请输入故事标题。")
        return (
            gr.update(),
            gr.update(),
            gr.update(),
            gr.update(),
            gr.update(value=None),
            _storyboard_status_update(message, visible=True),
        )

    key = str(story.get("key") or "")
    message = _status(
        state,
        f"Story saved: {story.get('title') or key}",
        f"故事《{story.get('title') or key}》已保存。",
    )
    return (
        _storyboard_story_dropdown_update(key),
        str(story.get("title") or ""),
        gr.update(choices=_storyboard_genre_choices(story.get("genre")), value=story.get("genre") or STORY_GENRES[0]),
        str(story.get("script") or ""),
        gr.update(value=None),
        _storyboard_status_update(message, visible=True),
    )


def _storyboard_delete_story_clicked(state, story_key):
    deleted_name = str(story_key or "").strip()
    if not deleted_name:
        message = _status(state, "Select a story first.", "请先选择一个故事。")
        return (
            gr.update(),
            gr.update(),
            gr.update(),
            gr.update(),
            gr.update(value=None),
            _storyboard_status_update(message, visible=True),
        )

    story = delete_story_script(deleted_name)
    selected = str(story.get("key") or "")
    message = _status(state, f"Story deleted: {deleted_name}", f"已删除故事《{deleted_name}》。")
    return (
        _storyboard_story_dropdown_update(selected),
        str(story.get("title") or ""),
        gr.update(choices=_storyboard_genre_choices(story.get("genre")), value=story.get("genre") or STORY_GENRES[0]),
        str(story.get("script") or ""),
        gr.update(value=None),
        _storyboard_status_update(message, visible=True),
    )


def _storyboard_export_script_clicked(state, story_key):
    path = export_story_script(story_key)
    if not path:
        message = _status(state, "Select a story first.", "请先选择一个故事。")
        return gr.update(value=None), _storyboard_status_update(message, visible=True)
    message = _status(state, "Story script exported.", "剧本已导出。")
    return path, _storyboard_status_update(f"{message} {path}", visible=True)


def _storyboard_edit_message(state, result, en_success: str, cn_success: str, en_failure: str, cn_failure: str) -> str:
    frame_no = result.index + 1 if getattr(result, "index", -1) >= 0 else 0
    if result.success:
        return _status(state, en_success.format(frame=frame_no), cn_success.format(frame=frame_no))
    return _status(state, en_failure, cn_failure)


def _storyboard_cell_image_changed(state, page, image, cell_index):
    result = update_storyboard_cell_image(page, cell_index, image)
    message = _storyboard_edit_message(
        state,
        result,
        "Frame #{frame} image updated.",
        "分镜 #{frame} 图片已更新。",
        "No valid image for this frame.",
        "这个分镜没有有效图片。",
    )
    return _storyboard_panel_updates(state, result.target_page, message, status_visible=True)


def _storyboard_cell_audio_changed(state, page, audio, cell_index):
    result = update_storyboard_cell_audio(page, cell_index, audio)
    message = _storyboard_edit_message(
        state,
        result,
        "Frame #{frame} audio updated.",
        "分镜 #{frame} 音频已更新。",
        "No valid audio for this frame.",
        "这个分镜没有有效音频。",
    )
    return _storyboard_panel_updates(state, result.target_page, message, status_visible=True)


def _storyboard_cell_annotation_changed(state, page, text, cell_index):
    result = update_storyboard_cell_description(page, cell_index, text)
    message = _storyboard_edit_message(
        state,
        result,
        "Frame #{frame} annotation saved.",
        "分镜 #{frame} 注释已保存。",
        "Annotation was not saved.",
        "注释没有保存。",
    )
    return _storyboard_panel_updates(state, result.target_page, message, status_visible=True)


def _storyboard_cell_delete_clicked(state, page, cell_index):
    result = clear_storyboard_cell(page, cell_index)
    message = _storyboard_edit_message(
        state,
        result,
        "Frame #{frame} cleared.",
        "分镜 #{frame} 已清空。",
        "No storyboard frame at this position.",
        "这个位置没有分镜。",
    )
    return _storyboard_panel_updates(state, result.target_page, message, status_visible=True)


def _storyboard_move_frame_clicked(state, source_index, target_index):
    result = move_storyboard_frame(source_index, target_index)
    message = _storyboard_edit_message(
        state,
        result,
        "Frame moved to #{frame}.",
        "分镜已移动到 #{frame}。",
        "Frame move failed. Check the frame numbers.",
        "分镜移动失败，请检查编号。",
    )
    return _storyboard_panel_updates(state, result.target_page, message, status_visible=True)


def _storyboard_delete_frame_clicked(state, source_index):
    result = delete_storyboard_frame(source_index)
    message = _storyboard_edit_message(
        state,
        result,
        "Frame deleted.",
        "分镜已删除。",
        "Frame delete failed. Check the frame number.",
        "分镜删除失败，请检查编号。",
    )
    return _storyboard_panel_updates(state, result.target_page, message, status_visible=True)


def _storyboard_move_audio_clicked(state, source_index, target_index):
    result = move_storyboard_audio(source_index, target_index)
    message = _storyboard_edit_message(
        state,
        result,
        "Audio moved to frame #{frame}.",
        "音频已移动到分镜 #{frame}。",
        "Audio move failed. Check the frame numbers.",
        "音频移动失败，请检查编号。",
    )
    return _storyboard_panel_updates(state, result.target_page, message, status_visible=True)


def _storyboard_delete_audio_clicked(state, source_index):
    result = delete_storyboard_audio(source_index)
    message = _storyboard_edit_message(
        state,
        result,
        "Frame #{frame} audio deleted.",
        "分镜 #{frame} 音频已删除。",
        "Audio delete failed. Check the frame number.",
        "音频删除失败，请检查编号。",
    )
    return _storyboard_panel_updates(state, result.target_page, message, status_visible=True)


def _send_output_to_storyboard(gallery, state, selected_index=-1):
    image = gallery_image_at(gallery, selected_index)
    if image is None:
        message = _status(state, "No output image to send.", "没有可发送的结果图片。")
        return (_output_status_update(message), *[gr.update() for _ in range(STORYBOARD_PANEL_OUTPUT_COUNT)])

    result = send_image_to_storyboard(image, position="end")
    if not result.success:
        message = _status(state, f"Storyboard send failed: {result.message}", f"发送到分镜失败：{result.message}")
        return (_output_status_update(message), *[gr.update() for _ in range(STORYBOARD_PANEL_OUTPUT_COUNT)])

    message = _status(
        state,
        f"Output sent to storyboard #{result.index + 1}.",
        f"结果已发送到分镜 #{result.index + 1}。",
    )
    return (_output_status_update(message), *_storyboard_panel_updates(state, result.target_page, message, status_visible=True))


def _storyboard_refresh_clicked(state, page):
    message = _status(state, "Storyboard refreshed.", "分镜已刷新。")
    return _storyboard_panel_updates(state, page, message, status_visible=True)


def _storyboard_prev_clicked(state, page):
    try:
        next_page = int(float(str(page or 1))) - 1
    except Exception:
        next_page = 1
    message = _status(state, "Storyboard page changed.", "分镜页已切换。")
    return _storyboard_panel_updates(state, next_page, message, status_visible=False)


def _storyboard_next_clicked(state, page):
    try:
        next_page = int(float(str(page or 1))) + 1
    except Exception:
        next_page = 1
    message = _status(state, "Storyboard page changed.", "分镜页已切换。")
    return _storyboard_panel_updates(state, next_page, message, status_visible=False)


def _storyboard_add_blank_clicked(state):
    result = add_blank_storyboard()
    message = _status(
        state,
        f"Blank storyboard #{result.index + 1} added.",
        f"已添加空白分镜 #{result.index + 1}。",
    )
    return _storyboard_panel_updates(state, result.target_page, message, status_visible=True)


def _storyboard_clear_clicked(state):
    count = clear_storyboards()
    message = _status(state, f"Cleared {count} storyboard frame(s).", f"已清空 {count} 个分镜。")
    return _storyboard_panel_updates(state, 1, message, status_visible=True)


def _storyboard_export_clicked(state):
    path = export_storyboards()
    message = _status(state, "Storyboard exported.", "分镜已导出。")
    return path, *_storyboard_panel_updates(state, 1, f"{message} {path}", status_visible=True)


def _save_output_clicked(gallery, text: str, state, make_zip: bool, selected_index=-1):
    paths = save_output_images(gallery, text, make_zip=make_zip, selected_index=selected_index)
    if not paths:
        return _output_status_update(_status(state, "No output image to save.", "没有可保存的结果图片。"))
    label = _status(state, "Saved:", "已保存：")
    return _output_status_update(f"{label} {paths[0]}")


def _output_folder_from_paths(paths: list[object] | tuple[object, ...] | None, fallback: object = "") -> str:
    for value in paths or []:
        text = str(value or "").strip()
        if not text:
            continue
        path = Path(text).expanduser()
        if path.is_dir():
            return str(path)
        if path.is_file() or path.suffix:
            return str(path.parent)
        return str(path)
    return str(fallback or outputs_dir())


def _open_folder_in_file_manager(path: str, opener=None) -> None:
    if opener is not None:
        opener(path)
        return
    if os.name == "nt":
        os.startfile(path)
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])


def _open_output_folder_clicked(state, folder_path: object = "", opener=None):
    if isinstance(state, Mapping) and "local_access" in state and not state.get("local_access"):
        message = _status(state, "This feature is only available on the local machine.", "此功能仅限本机使用。")
        gr.Info(message)
        return _output_status_update(message)

    target_text = str(folder_path or outputs_dir()).strip().strip('"')
    target = Path(target_text or outputs_dir()).expanduser()
    if target.is_file():
        target = target.parent
    if not target.is_dir():
        message = _status(state, "Output folder not found.", "未找到输出文件夹。")
        gr.Warning(message)
        return _output_status_update(message)

    target_text = str(target)
    try:
        _open_folder_in_file_manager(target_text, opener=opener)
    except Exception as exc:
        message = _status(state, f"Could not open folder: {exc}", f"无法打开文件夹：{exc}")
        gr.Warning(message)
        return _output_status_update(message)

    message = f"{_status(state, 'Opened:', '已打开：')} {target_text}"
    gr.Info(message)
    return _output_status_update(message)


def _style_selected(name: str):
    clean_name = str(name or "").strip()
    if not clean_name:
        return "", "", gr.update(visible=False), gr.update(visible=False)
    style = get_style(name)
    if style is None:
        return "", "", gr.update(visible=False), gr.update(visible=True)
    return style.prompt, style.negative_prompt, gr.update(visible=True), gr.update(visible=True)


def _style_editor_default_name(selected_styles: object = None) -> str:
    selected_names: list[str] = []
    if isinstance(selected_styles, (list, tuple, set)):
        selected_names = [str(item or "").strip() for item in selected_styles]
    else:
        selected_names = [str(selected_styles or "").strip()]

    for name in selected_names:
        if name and name.lower() != "none" and get_style(name) is not None:
            return name
    for name in selected_names:
        if name and get_style(name) is not None:
            return name

    for name in style_choices():
        style = get_style(name)
        if style is not None and str(name or "").strip().lower() != "none" and (style.prompt or style.negative_prompt):
            return name
    for name in style_choices():
        if get_style(name) is not None:
            return str(name or "").strip()
    return ""


def _open_style_editor_clicked(selected_styles: object = None):
    choices = style_choices()
    name = _style_editor_default_name(selected_styles)
    prompt, negative_prompt, delete_update, save_update = _style_selected(name)
    return (
        gr.update(visible=True),
        gr.update(choices=choices, value=name or None),
        prompt,
        negative_prompt,
        delete_update,
        save_update,
    )


def _apply_selected_styles(prompt: str, negative_prompt: str, selected_styles: list[str] | None):
    styled_prompt, styled_negative = apply_style_names(prompt, negative_prompt, list(selected_styles or []))
    return styled_prompt, styled_negative, []


def _materialize_style_editor_clicked(prompt: str, negative_prompt: str, style_prompt: str, style_negative_prompt: str):
    styled_prompt = apply_styles_to_prompt(prompt, [style_prompt])
    styled_negative = apply_styles_to_prompt(negative_prompt, [style_negative_prompt])
    return styled_prompt, styled_negative, [], gr.update(visible=False)


def _copy_prompt_to_style(prompt: str, negative_prompt: str):
    return prompt or "", negative_prompt or ""


def _save_style_clicked(name: str, prompt: str, negative_prompt: str, state):
    try:
        style = save_style(name, prompt, negative_prompt)
    except Exception as exc:
        status = _status(state, f"Save failed: {exc}", f"保存失败：{exc}")
        return (
            gr.update(choices=style_choices()),
            gr.update(choices=style_choices()),
            gr.update(),
            gr.update(),
            _output_status_update(status),
        )
    choices = style_choices()
    return (
        gr.update(choices=choices, value=[style.name]),
        gr.update(choices=choices, value=style.name),
        gr.update(visible=True),
        gr.update(visible=True),
        _output_status_update(_status(state, "Style saved.", "样式已保存。")),
    )


def _delete_style_clicked(name: str, state):
    delete_style(name)
    choices = style_choices()
    return (
        gr.update(choices=choices, value=[]),
        gr.update(choices=choices, value=None),
        "",
        "",
        gr.update(visible=False),
        gr.update(visible=False),
        _output_status_update(_status(state, "Style deleted.", "样式已删除。")),
    )


def _refresh_styles_clicked(name: str, state):
    choices = style_choices()
    clean_name = str(name or "").strip()
    style_exists = bool(clean_name and get_style(clean_name) is not None)
    message = _status(state, f"Styles refreshed: {len(choices)}.", f"样式已刷新：{len(choices)}。")
    return (
        gr.update(choices=choices),
        gr.update(choices=choices, value=clean_name or None),
        gr.update(visible=style_exists),
        gr.update(visible=bool(clean_name)),
        _output_status_update(message),
    )


def _forge_elem(prefix: str, suffix: str) -> str:
    if prefix:
        return f"forge_neo_{prefix}_{suffix}"
    return f"forge_neo_{suffix}"


def _builtin_ui_available(name: str, *required_files: str) -> bool:
    return builtin_extension_available(name, tuple(required_files))


def _filter_textual_inversion_browser(preset: str, query: str):
    return _extra_browser_update("textual_inversion", refresh_model_choices(preset), query)


def _filter_checkpoints_browser(preset: str, query: str):
    return _extra_browser_update("checkpoints", refresh_model_choices(preset), query)


def _filter_lora_browser(preset: str, query: str):
    choices = refresh_model_choices(preset)
    defaults = preset_model_defaults(preset, choices)
    return _extra_browser_update("lora", choices, query, defaults.lora_weights)


def _append_prompt_token(prompt: str, token: str) -> str:
    clean = str(token or "").strip()
    if not clean:
        return str(prompt or "")
    existing = str(prompt or "").strip()
    return ", ".join([part for part in [existing, clean] if part])


def _insert_textual_inversion(prompt: str, name: str) -> str:
    return _append_prompt_token(prompt, _extra_token_name(name))


def _format_lora_weight(weight: object) -> str:
    try:
        return f"{float(weight):.6g}"
    except Exception:
        return "1"


def _insert_lora_token(prompt: str, name: str, weight: object = 1.0) -> str:
    token_name = _extra_token_name(name)
    if not token_name:
        return str(prompt or "")
    return _append_prompt_token(prompt, f"<lora:{token_name}:{_format_lora_weight(weight)}>")


def _add_lora_selection(current: list[str] | None, name: str):
    selected = list(current or [])
    clean = str(name or "").strip()
    if clean and clean not in selected:
        selected.append(clean)
    return gr.update(value=selected)


def _controlnet_suffix(unit_index: int, suffix: str) -> str:
    if unit_index == 0:
        return f"controlnet_{suffix}"
    return f"controlnet_unit_{unit_index + 1}_{suffix}"


def _tipo_inputs(controls: dict[str, object]) -> list[gr.components.Component]:
    return [controls[key] for key in TIPO_ARG_KEYS]


def _tipo_status_update(message: str, *, visible: bool = True):
    body = html_lib.escape(str(message or ""))
    return gr.update(value=f'<div class="forge-neo-tipo-status">{body}</div>', visible=visible)


def _tipo_generate_prompt_clicked(
    state,
    current_prompt,
    tag_prompt,
    nl_prompt,
    width,
    height,
    *values,
):
    tipo_values = tipo_arg_dict(values)
    tipo_values["tag_prompt"] = str(tag_prompt or "").strip() or str(current_prompt or "").strip()
    tipo_values["nl_prompt"] = str(nl_prompt or "")
    try:
        from forge_neo.runtime_backend.source_runtime import run_source_tipo_prompt

        result = run_source_tipo_prompt(
            {
                **tipo_values,
                "aspect_ratio": float(width or 1.0) / max(float(height or 1.0), 1.0),
            }
        )
    except Exception as exc:
        return current_prompt or "", _tipo_status_update(_status(state, f"TIPO failed: {exc}", f"TIPO 处理失败：{exc}"))

    if result.status != "finished":
        return current_prompt or "", _tipo_status_update(
            _status(state, result.error or "TIPO is unavailable.", result.error or "TIPO 当前不可用。")
        )
    output = str(result.infotext or "").strip()
    if not output:
        return current_prompt or "", _tipo_status_update(_status(state, "TIPO returned an empty prompt.", "TIPO 没有返回提示词。"))
    return output, gr.update(value="", visible=False)


def _create_tipo_controls(prefix: str, *, is_img2img: bool) -> dict[str, object]:
    defaults = tipo_default_values()
    format_choices, format_values = tipo_format_choices()
    model_choices = tipo_model_choices() or [""]
    tab_name = "img2img" if is_img2img else "txt2img"
    controls: dict[str, object] = {}
    with gr.Column(
        elem_id=_forge_elem(prefix, "tipo"),
        elem_classes=["forge-neo-tipo-panel"],
    ):
        with gr.Row(elem_classes=["forge-neo-tipo-input-row"]):
            controls["tag_prompt"] = gr.Textbox(
                label=_label("Tag Prompt", "标签提示词"),
                lines=2,
                max_lines=4,
                placeholder=_label("Tags for TIPO", "供 TIPO 优化的标签"),
                elem_id=_forge_elem(prefix, "tipo_tag_prompt"),
            )
            controls["nl_prompt"] = gr.Textbox(
                label=_label("Natural Language Prompt", "自然语言提示词"),
                lines=2,
                max_lines=4,
                placeholder=_label("Optional natural language prompt", "可选的自然语言提示词"),
                elem_id=_forge_elem(prefix, "tipo_nl_prompt"),
            )
        with gr.Row(elem_classes=["forge-neo-tipo-toolbar"]):
            controls["generate"] = gr.Button(
                _label("Generate Prompt", "生成提示词"),
                elem_id=_forge_elem(prefix, "tipo_generate"),
                min_width=150,
            )
            controls["status"] = gr.HTML("", visible=False, elem_id=_forge_elem(prefix, "tipo_status"))
        with gr.Accordion(
            _label("TIPO", "TIPO"),
            open=False,
            elem_id=f"{tab_name}_tipo_settings",
            elem_classes=["forge-neo-tipo-settings"],
        ):
            controls["enabled"] = gr.Checkbox(
                value=bool(defaults["enabled"]),
                label=_label("Enable TIPO during generation", "生成时启用 TIPO"),
                elem_id=_forge_elem(prefix, "tipo_enabled"),
            )
            with gr.Row(elem_classes=["forge-neo-tipo-settings-row"]):
                controls["timing"] = gr.Dropdown(
                    _localized_value_choices(
                        [
                            (TIPO_TIMING_BEFORE, "在其它提示词处理前"),
                            (TIPO_TIMING_AFTER, "在其它提示词处理后"),
                        ]
                    ),
                    value=defaults["timing"],
                    label=_label("Upsampling timing", "优化时机"),
                    elem_id=_forge_elem(prefix, "tipo_timing"),
                )
                controls["seed"] = gr.Number(
                    value=defaults["seed"],
                    precision=0,
                    minimum=-1,
                    label=_label("Upsampling seed", "优化种子"),
                    elem_id=_forge_elem(prefix, "tipo_seed"),
                )
                controls["follow_generation_seed"] = gr.Checkbox(
                    value=bool(defaults["follow_generation_seed"]),
                    label=_label("Follow generation seed", "跟随生成种子"),
                    elem_id=_forge_elem(prefix, "tipo_follow_generation_seed"),
                )
            with gr.Row(elem_classes=["forge-neo-tipo-settings-row"]):
                controls["tag_length"] = gr.Dropdown(
                    _localized_value_choices(
                        [(value, {"very short": "很短", "short": "短", "long": "长", "very long": "很长"}[value]) for value in TIPO_LENGTH_CHOICES]
                    ),
                    value=defaults["tag_length"],
                    label=_label("Tags length", "标签长度"),
                    elem_id=_forge_elem(prefix, "tipo_tag_length"),
                )
                controls["nl_length"] = gr.Dropdown(
                    _localized_value_choices(
                        [(value, {"very short": "很短", "short": "短", "long": "长", "very long": "很长"}[value]) for value in TIPO_LENGTH_CHOICES]
                    ),
                    value=defaults["nl_length"],
                    label=_label("Natural language length", "自然语言长度"),
                    elem_id=_forge_elem(prefix, "tipo_nl_length"),
                )
                controls["ban_tags"] = gr.Textbox(
                    value=defaults["ban_tags"],
                    label=_label("Ban tags", "排除标签"),
                    placeholder=_label("Separate with commas", "使用逗号分隔"),
                    elem_id=_forge_elem(prefix, "tipo_ban_tags"),
                )
            with gr.Row(elem_classes=["forge-neo-tipo-settings-row"]):
                controls["format_select"] = gr.Dropdown(
                    format_choices,
                    value=defaults["format_select"],
                    label=_label("Prompt format", "提示词格式"),
                    elem_id=_forge_elem(prefix, "tipo_format"),
                )
                controls["temperature"] = gr.Slider(
                    0.1,
                    1.5,
                    value=defaults["temperature"],
                    step=0.05,
                    label="Temperature",
                    elem_id=_forge_elem(prefix, "tipo_temperature"),
                )
                controls["top_p"] = gr.Slider(
                    0.0,
                    1.0,
                    value=defaults["top_p"],
                    step=0.05,
                    label="Top-p",
                    elem_id=_forge_elem(prefix, "tipo_top_p"),
                )
                controls["top_k"] = gr.Slider(
                    0,
                    150,
                    value=defaults["top_k"],
                    step=1,
                    label="Top-k",
                    elem_id=_forge_elem(prefix, "tipo_top_k"),
                )
            controls["format"] = gr.TextArea(
                value=defaults["format"],
                label=_label("Custom prompt format", "自定义提示词格式"),
                visible=defaults["format_select"] == "custom",
                elem_id=_forge_elem(prefix, "tipo_custom_format"),
            )
            controls["format_select"].change(
                lambda value: gr.update(
                    visible=value == "custom",
                    value=format_values.get(value, defaults["format"]),
                ),
                inputs=[controls["format_select"]],
                outputs=[controls["format"]],
                show_progress=False,
            )
            with gr.Row(elem_classes=["forge-neo-tipo-settings-row"]):
                controls["model"] = gr.Dropdown(
                    model_choices,
                    value=defaults["model"],
                    allow_custom_value=True,
                    label=_label("Model", "模型"),
                    elem_id=_forge_elem(prefix, "tipo_model"),
                )
                controls["gguf_cpu"] = gr.Checkbox(
                    value=bool(defaults["gguf_cpu"]),
                    label=_label("Use CPU for GGUF", "GGUF 使用 CPU"),
                    elem_id=_forge_elem(prefix, "tipo_gguf_cpu"),
                )
                controls["no_formatting"] = gr.Checkbox(
                    value=bool(defaults["no_formatting"]),
                    label=_label("No formatting", "不使用格式化"),
                    elem_id=_forge_elem(prefix, "tipo_no_formatting"),
                )
    return controls


def _wire_tipo_controls(
    controls: dict[str, object],
    *,
    prompt: gr.components.Component,
    width: gr.components.Component,
    height: gr.components.Component,
    state: gr.State,
) -> None:
    controls["generate"].click(
        _tipo_generate_prompt_clicked,
        inputs=[
            state,
            prompt,
            controls["tag_prompt"],
            controls["nl_prompt"],
            width,
            height,
            *_tipo_inputs(controls),
        ],
        outputs=[prompt, controls["status"]],
        show_progress=True,
    )


def _integrated_inputs(controls: dict[str, object]) -> list[gr.components.Component]:
    inputs: list[gr.components.Component] = []
    for unit in controls["controlnet_units"]:
        inputs.extend(
            [
                unit["enabled"],
                unit["module"],
                unit["model"],
                unit["weight"],
                unit["resize_mode"],
                unit["guidance_start"],
                unit["guidance_end"],
                unit["pixel_perfect"],
                unit["control_mode"],
                unit["hr_option"],
                unit["processor_res"],
                unit["threshold_a"],
                unit["threshold_b"],
                unit["image"],
                unit["mask"],
                unit["generated_image"],
                unit["mask_image"],
                unit["mask_image_fg"],
                unit["use_mask"],
                unit["preview_as_input"],
                unit["type"],
            ]
        )
    inputs.extend(
        [
            controls["multidiffusion_enabled"],
            controls["multidiffusion_method"],
            controls["multidiffusion_tile_width"],
            controls["multidiffusion_tile_height"],
            controls["multidiffusion_tile_overlap"],
            controls["multidiffusion_tile_batch_size"],
            controls["never_oom_unet"],
            controls["never_oom_vae"],
            controls["image_stitch_enabled"],
            controls["image_stitch_references"],
            controls["image_stitch_max_dim"],
            controls["spectrum_enabled"],
            controls["spectrum_prediction_weighting"],
            controls["spectrum_polynomial_degree"],
            controls["spectrum_regularization"],
            controls["spectrum_cache_window"],
            controls["spectrum_window_growth"],
            controls["spectrum_warmup_steps"],
            controls["spectrum_stop_caching_step"],
            controls["torch_compile_preset"],
            controls["modulated_guidance_enabled"],
            controls["modulated_guidance_clip"],
            controls["modulated_guidance_positive"],
            controls["modulated_guidance_negative"],
            controls["modulated_guidance_weight"],
            controls["modulated_guidance_start_layer"],
            controls["modulated_guidance_end_layer"],
            controls["seed_variance_enabled"],
            controls["seed_variance_delta"],
            controls["seed_variance_strength"],
            controls["mahiro"],
            controls["script"],
            controls["script_prompt_matrix_put_at_start"],
            controls["script_prompt_matrix_different_seeds"],
            controls["script_prompt_matrix_prompt_type"],
            controls["script_prompt_matrix_delimiter"],
            controls["script_prompt_matrix_margin"],
            controls["script_prompts_iterate_seed"],
            controls["script_prompts_same_seed"],
            controls["script_prompts_position"],
            controls["script_prompts_text"],
            controls["script_xyz_x_type"],
            controls["script_xyz_x_values"],
            controls["script_xyz_x_values_dropdown"],
            controls["script_xyz_y_type"],
            controls["script_xyz_y_values"],
            controls["script_xyz_y_values_dropdown"],
            controls["script_xyz_z_type"],
            controls["script_xyz_z_values"],
            controls["script_xyz_z_values_dropdown"],
            controls["script_xyz_row_count"],
            controls["script_xyz_margin"],
            controls["script_xyz_draw_legend"],
            controls["script_xyz_keep_minus_one"],
            controls["script_xyz_vary_x"],
            controls["script_xyz_vary_y"],
            controls["script_xyz_vary_z"],
            controls["script_xyz_include_sub_images"],
            controls["script_xyz_include_sub_grids"],
            controls["script_xyz_csv_mode"],
            controls["script_loopback_loops"],
            controls["script_loopback_final_denoising"],
            controls["script_loopback_curve"],
            controls["script_sd_upscale_upscaler"],
            controls["script_sd_upscale_scale"],
            controls["script_sd_upscale_overlap"],
            controls["script_sd_upscale_override"],
            *_adetailer_unit_controls(controls),
            *_dynamic_prompts_controls(controls),
            *_regional_prompter_controls(controls),
            *_forge_couple_controls(controls),
        ]
    )
    return inputs


def _script_send_outputs(script: gr.components.Component, controls: dict[str, object]) -> list[gr.components.Component]:
    return [
        script,
        controls["script_prompt_matrix_panel"],
        controls["script_prompts_panel"],
        controls["script_xyz_panel"],
        controls["script_loopback_panel"],
        controls["script_sd_upscale_panel"],
        controls["script_prompt_matrix_put_at_start"],
        controls["script_prompt_matrix_different_seeds"],
        controls["script_prompt_matrix_prompt_type"],
        controls["script_prompt_matrix_delimiter"],
        controls["script_prompt_matrix_margin"],
        controls["script_prompts_iterate_seed"],
        controls["script_prompts_same_seed"],
        controls["script_prompts_position"],
        controls["script_prompts_text"],
        controls["script_xyz_x_type"],
        controls["script_xyz_x_values"],
        controls["script_xyz_x_values_dropdown"],
        controls["script_xyz_fill_x"],
        controls["script_xyz_y_type"],
        controls["script_xyz_y_values"],
        controls["script_xyz_y_values_dropdown"],
        controls["script_xyz_fill_y"],
        controls["script_xyz_z_type"],
        controls["script_xyz_z_values"],
        controls["script_xyz_z_values_dropdown"],
        controls["script_xyz_fill_z"],
        controls["script_xyz_row_count"],
        controls["script_xyz_margin"],
        controls["script_xyz_draw_legend"],
        controls["script_xyz_keep_minus_one"],
        controls["script_xyz_vary_x"],
        controls["script_xyz_vary_y"],
        controls["script_xyz_vary_z"],
        controls["script_xyz_include_sub_images"],
        controls["script_xyz_include_sub_grids"],
        controls["script_xyz_csv_mode"],
        controls["script_loopback_loops"],
        controls["script_loopback_final_denoising"],
        controls["script_loopback_curve"],
        controls["script_sd_upscale_upscaler"],
        controls["script_sd_upscale_scale"],
        controls["script_sd_upscale_overlap"],
        controls["script_sd_upscale_override"],
    ]


def _controlnet_model_outputs(*groups: dict[str, object]) -> list[gr.components.Component]:
    outputs: list[gr.components.Component] = []
    for controls in groups:
        for unit in controls["controlnet_units"]:
            outputs.append(unit["model"])
    return outputs


def _extra_browser_outputs(*browsers: ExtraNetworkBrowserControls) -> list[gr.components.Component]:
    outputs: list[gr.components.Component] = []
    for browser in browsers:
        outputs.extend([browser.dropdown, browser.cards])
    return outputs


def _create_extra_network_browser(
    prefix: str,
    kind: str,
    names: list[str],
    weights: dict[str, float] | None = None,
) -> ExtraNetworkBrowserControls:
    suffix = {
        "textual_inversion": "textual_inversion_browser",
        "checkpoints": "checkpoint_browser",
        "lora": "lora_browser",
    }[kind]
    title = {
        "textual_inversion": _label("Textual Inversion", "反向文本"),
        "checkpoints": _label("Checkpoints", "模型"),
        "lora": _label("LoRA", "LoRA"),
    }[kind]
    with gr.Column(elem_id=_forge_elem(prefix, suffix), elem_classes=["forge-neo-extra-browser"]):
        with gr.Row(elem_classes=["forge-neo-extra-toolbar"]):
            search = gr.Textbox(
                label="",
                show_label=False,
                placeholder=_label("Search", "搜索"),
                elem_id=_forge_elem(prefix, f"{suffix}_search"),
                elem_classes=["forge-neo-extra-search"],
            )
            gr.HTML(
                '<div class="forge-neo-extra-sort-tools">'
                f'<span>{html_lib.escape(_label("Sort:", "排序："))}</span>'
                '<button type="button" data-extra-sort="path" aria-label="Folder">▣</button>'
                '<button type="button" data-extra-sort="name" aria-label="Name">A</button>'
                '<button type="button" data-extra-sort="created" aria-label="Date created">◷＋</button>'
                '<button type="button" data-extra-sort="modified" aria-label="Date modified">◷✎</button>'
                '<button type="button" data-extra-control="direction" aria-label="Sort direction">↓</button>'
                '<button type="button" data-extra-control="dirs" aria-label="Tree view">▤</button>'
                '<button type="button" data-extra-control="refresh" aria-label="Refresh">↻</button>'
                "</div>",
                elem_classes=["forge-neo-extra-sort-html"],
            )
        dropdown = gr.Dropdown(
            names,
            value=first_or_none(names) if names else None,
            label=title,
            allow_custom_value=True,
            elem_id=_forge_elem(prefix, f"{suffix}_select"),
            elem_classes=["forge-neo-extra-state-control"],
        )
        with gr.Row(elem_classes=["forge-neo-extra-actions", "forge-neo-extra-state-control"]):
            apply_button = None
            prompt_button = None
            negative_button = None
            if kind == "checkpoints":
                apply_button = gr.Button(
                    _label("Use Checkpoint", "使用模型"),
                    elem_id=_forge_elem(prefix, f"{suffix}_apply"),
                )
            elif kind == "textual_inversion":
                prompt_button = gr.Button(
                    _label("Insert Prompt", "写入提示词"),
                    elem_id=_forge_elem(prefix, f"{suffix}_prompt"),
                )
                negative_button = gr.Button(
                    _label("Insert Negative", "写入反向提示词"),
                    elem_id=_forge_elem(prefix, f"{suffix}_negative"),
                )
            else:
                apply_button = gr.Button(
                    _label("Select LoRA", "选择 LoRA"),
                    elem_id=_forge_elem(prefix, f"{suffix}_apply"),
                )
                prompt_button = gr.Button(
                    _label("Insert Token", "写入 Token"),
                    elem_id=_forge_elem(prefix, f"{suffix}_prompt"),
                )
        cards = gr.HTML(
            _extra_network_cards(kind, names, weights),
            elem_id=_forge_elem(prefix, f"{suffix}_cards"),
            elem_classes=["forge-neo-extra-cards"],
        )
    return ExtraNetworkBrowserControls(
        kind=kind,
        search=search,
        dropdown=dropdown,
        cards=cards,
        apply=apply_button,
        prompt=prompt_button,
        negative_prompt=negative_button,
    )


def _wire_extra_network_browser(
    browser: ExtraNetworkBrowserControls,
    preset: gr.Dropdown,
    prompt: gr.Textbox,
    negative_prompt: gr.Textbox,
    checkpoint: gr.Dropdown,
    lora_dropdown: gr.Dropdown,
) -> None:
    if browser.kind == "textual_inversion":
        browser.search.change(
            _filter_textual_inversion_browser,
            inputs=[preset, browser.search],
            outputs=[browser.dropdown, browser.cards],
            show_progress=False,
        )
        if browser.prompt is not None:
            browser.prompt.click(_insert_textual_inversion, inputs=[prompt, browser.dropdown], outputs=[prompt])
        if browser.negative_prompt is not None:
            browser.negative_prompt.click(_insert_textual_inversion, inputs=[negative_prompt, browser.dropdown], outputs=[negative_prompt])
    elif browser.kind == "checkpoints":
        browser.search.change(
            _filter_checkpoints_browser,
            inputs=[preset, browser.search],
            outputs=[browser.dropdown, browser.cards],
            show_progress=False,
        )
        if browser.apply is not None:
            browser.apply.click(lambda value: gr.update(value=value), inputs=[browser.dropdown], outputs=[checkpoint])
    elif browser.kind == "lora":
        browser.search.change(
            _filter_lora_browser,
            inputs=[preset, browser.search],
            outputs=[browser.dropdown, browser.cards],
            show_progress=False,
        )
        if browser.apply is not None:
            browser.apply.click(_add_lora_selection, inputs=[lora_dropdown, browser.dropdown], outputs=[lora_dropdown])
        if browser.prompt is not None:
            browser.prompt.click(_insert_lora_token, inputs=[prompt, browser.dropdown], outputs=[prompt])


def _script_panel_updates(script: str):
    value = str(script or "None").strip()
    return (
        gr.update(visible=value == "Prompt Matrix"),
        gr.update(visible=value == "Prompts from File or Textbox"),
        gr.update(visible=value == "X/Y/Z plot"),
        gr.update(visible=value == "Loopback"),
        gr.update(visible=value == "SD Upscale"),
    )


def _create_script_controls(prefix: str, *, is_img2img: bool = False) -> dict[str, gr.components.Component]:
    controls: dict[str, gr.components.Component] = {}
    with gr.Group(
        visible=False,
        elem_id=_forge_elem(prefix, "script_prompt_matrix_panel"),
        elem_classes=["forge-neo-script-panel"],
    ) as prompt_matrix_panel:
        with gr.Row(elem_classes=["forge-neo-script-row"]):
            controls["script_prompt_matrix_put_at_start"] = gr.Checkbox(
                False,
                label="Put the variable parts at the start of prompt",
                elem_id=_forge_elem(prefix, "script_prompt_matrix_put_at_start"),
            )
            controls["script_prompt_matrix_different_seeds"] = gr.Checkbox(
                False,
                label="Use different seeds for each image",
                elem_id=_forge_elem(prefix, "script_prompt_matrix_different_seeds"),
            )
        with gr.Row(elem_classes=["forge-neo-script-row"]):
            controls["script_prompt_matrix_prompt_type"] = gr.Radio(
                ["positive", "negative"],
                value="positive",
                label="Prompt",
                elem_id=_forge_elem(prefix, "script_prompt_matrix_prompt_type"),
            )
            controls["script_prompt_matrix_delimiter"] = gr.Radio(
                ["comma", "space"],
                value="comma",
                label="Joining Char.",
                elem_id=_forge_elem(prefix, "script_prompt_matrix_delimiter"),
            )
        controls["script_prompt_matrix_margin"] = gr.Slider(
            0,
            256,
            value=0,
            step=2,
            label="Grid Margins (px)",
            elem_id=_forge_elem(prefix, "script_prompt_matrix_margin"),
        )

    with gr.Group(
        visible=False,
        elem_id=_forge_elem(prefix, "script_prompts_panel"),
        elem_classes=["forge-neo-script-panel"],
    ) as prompts_panel:
        with gr.Row(elem_classes=["forge-neo-script-row"]):
            controls["script_prompts_iterate_seed"] = gr.Checkbox(
                False,
                label="Iterate seed every line",
                elem_id=_forge_elem(prefix, "script_prompts_iterate_seed"),
            )
            controls["script_prompts_same_seed"] = gr.Checkbox(
                False,
                label="Use same random seed for all lines",
                elem_id=_forge_elem(prefix, "script_prompts_same_seed"),
            )
        controls["script_prompts_position"] = gr.Radio(
            ["start", "end"],
            value="start",
            label="Insert prompts at the",
            elem_id=_forge_elem(prefix, "script_prompts_position"),
        )
        controls["script_prompts_text"] = gr.Textbox(
            value="",
            lines=3,
            label="List of prompt inputs",
            elem_id=_forge_elem(prefix, "script_prompts_text"),
        )

    with gr.Group(
        visible=False,
        elem_id=_forge_elem(prefix, "script_xyz_panel"),
        elem_classes=["forge-neo-script-panel", "forge-neo-xyz-panel"],
    ) as xyz_panel:
        axis_choices = _xyz_axis_choices(is_img2img=is_img2img)
        with gr.Row(elem_classes=["forge-neo-script-xyz-row"]):
            controls["script_xyz_x_type"] = gr.Dropdown(
                axis_choices,
                value="Nothing",
                label=_label("X type", "X 轴类型"),
                elem_id=_forge_elem(prefix, "script_xyz_x_type"),
                scale=2,
            )
            controls["script_xyz_x_values"] = gr.Textbox(
                value="",
                lines=1,
                label=_label("X values", "X 轴数值"),
                elem_id=_forge_elem(prefix, "script_xyz_x_values"),
                scale=5,
            )
            controls["script_xyz_x_values_dropdown"] = gr.Dropdown(
                [],
                value=[],
                label=_label("X values", "X 轴数值"),
                visible=False,
                multiselect=True,
                interactive=True,
                elem_id=_forge_elem(prefix, "script_xyz_x_values_dropdown"),
                scale=5,
            )
            controls["script_xyz_fill_x"] = _tool_button(
                XYZ_FILL_VALUES_SYMBOL,
                elem_id=_forge_elem(prefix, "script_xyz_fill_x"),
                min_width=40,
                visible=False,
            )
        with gr.Row(elem_classes=["forge-neo-script-xyz-row"]):
            controls["script_xyz_y_type"] = gr.Dropdown(
                axis_choices,
                value="Nothing",
                label=_label("Y type", "Y 轴类型"),
                elem_id=_forge_elem(prefix, "script_xyz_y_type"),
                scale=2,
            )
            controls["script_xyz_y_values"] = gr.Textbox(
                value="",
                lines=1,
                label=_label("Y values", "Y 轴数值"),
                elem_id=_forge_elem(prefix, "script_xyz_y_values"),
                scale=5,
            )
            controls["script_xyz_y_values_dropdown"] = gr.Dropdown(
                [],
                value=[],
                label=_label("Y values", "Y 轴数值"),
                visible=False,
                multiselect=True,
                interactive=True,
                elem_id=_forge_elem(prefix, "script_xyz_y_values_dropdown"),
                scale=5,
            )
            controls["script_xyz_fill_y"] = _tool_button(
                XYZ_FILL_VALUES_SYMBOL,
                elem_id=_forge_elem(prefix, "script_xyz_fill_y"),
                min_width=40,
                visible=False,
            )
        with gr.Row(elem_classes=["forge-neo-script-xyz-row"]):
            controls["script_xyz_z_type"] = gr.Dropdown(
                axis_choices,
                value="Nothing",
                label=_label("Z type", "Z 轴类型"),
                elem_id=_forge_elem(prefix, "script_xyz_z_type"),
                scale=2,
            )
            controls["script_xyz_z_values"] = gr.Textbox(
                value="",
                lines=1,
                label=_label("Z values", "Z 轴数值"),
                elem_id=_forge_elem(prefix, "script_xyz_z_values"),
                scale=5,
            )
            controls["script_xyz_z_values_dropdown"] = gr.Dropdown(
                [],
                value=[],
                label=_label("Z values", "Z 轴数值"),
                visible=False,
                multiselect=True,
                interactive=True,
                elem_id=_forge_elem(prefix, "script_xyz_z_values_dropdown"),
                scale=5,
            )
            controls["script_xyz_fill_z"] = _tool_button(
                XYZ_FILL_VALUES_SYMBOL,
                elem_id=_forge_elem(prefix, "script_xyz_fill_z"),
                min_width=40,
                visible=False,
            )
        with gr.Row(elem_classes=["forge-neo-script-row"]):
            controls["script_xyz_row_count"] = gr.Slider(
                0,
                8,
                value=0,
                step=1,
                label=_label("Row Count", "行数"),
                info=_label("(set to 0 for auto)", "0 为自动"),
                elem_id=_forge_elem(prefix, "script_xyz_row_count"),
            )
            controls["script_xyz_margin"] = gr.Slider(
                0,
                500,
                value=0,
                step=2,
                label=_label("Grid Margins", "网格边距"),
                info=_label("(in pixels)", "单位：像素"),
                elem_id=_forge_elem(prefix, "script_xyz_margin"),
            )
        with gr.Row(elem_classes=["forge-neo-script-row", "forge-neo-script-check-row"]):
            with gr.Column(scale=3):
                controls["script_xyz_draw_legend"] = gr.Checkbox(
                    True,
                    label=_label("Draw legend", "绘制图例"),
                    elem_id=_forge_elem(prefix, "script_xyz_draw_legend"),
                )
                controls["script_xyz_keep_minus_one"] = gr.Checkbox(
                    False,
                    label=_label("Keep -1 for seeds", "Seed 保持 -1"),
                    elem_id=_forge_elem(prefix, "script_xyz_keep_minus_one"),
                )
                with gr.Row(elem_classes=["forge-neo-script-row"]):
                    controls["script_xyz_vary_x"] = gr.Checkbox(
                        False,
                        label=_label("Vary seeds for X", "X 轴变化 Seed"),
                        elem_id=_forge_elem(prefix, "script_xyz_vary_x"),
                    )
                    controls["script_xyz_vary_y"] = gr.Checkbox(
                        False,
                        label=_label("Vary seeds for Y", "Y 轴变化 Seed"),
                        elem_id=_forge_elem(prefix, "script_xyz_vary_y"),
                    )
                    controls["script_xyz_vary_z"] = gr.Checkbox(
                        False,
                        label=_label("Vary seeds for Z", "Z 轴变化 Seed"),
                        elem_id=_forge_elem(prefix, "script_xyz_vary_z"),
                    )
            with gr.Column(scale=2):
                controls["script_xyz_include_sub_images"] = gr.Checkbox(
                    False,
                    label=_label("Include Sub Images", "包含子图"),
                    elem_id=_forge_elem(prefix, "script_xyz_include_sub_images"),
                )
                controls["script_xyz_include_sub_grids"] = gr.Checkbox(
                    False,
                    label=_label("Include Sub Grids", "包含子网格"),
                    elem_id=_forge_elem(prefix, "script_xyz_include_sub_grids"),
                )
                controls["script_xyz_csv_mode"] = gr.Checkbox(
                    False,
                    label=_label("Use text inputs instead of dropdowns", "使用文本输入代替下拉框"),
                    elem_id=_forge_elem(prefix, "script_xyz_csv_mode"),
                )
        with gr.Row(elem_classes=["forge-neo-script-row", "forge-neo-script-swap-row"]):
            controls["script_xyz_swap_xy"] = gr.Button(_label("Swap X/Y axes", "交换 X/Y 轴"), elem_id=_forge_elem(prefix, "script_xyz_swap_xy"))
            controls["script_xyz_swap_yz"] = gr.Button(_label("Swap Y/Z axes", "交换 Y/Z 轴"), elem_id=_forge_elem(prefix, "script_xyz_swap_yz"))
            controls["script_xyz_swap_xz"] = gr.Button(_label("Swap X/Z axes", "交换 X/Z 轴"), elem_id=_forge_elem(prefix, "script_xyz_swap_xz"))

    with gr.Group(
        visible=False,
        elem_id=_forge_elem(prefix, "script_loopback_panel"),
        elem_classes=["forge-neo-script-panel"],
    ) as loopback_panel:
        controls["script_loopback_loops"] = gr.Slider(
            1,
            8,
            value=2,
            step=1,
            label="Loops",
            elem_id=_forge_elem(prefix, "script_loopback_loops"),
        )
        controls["script_loopback_final_denoising"] = gr.Slider(
            0.0,
            1.0,
            value=0.5,
            step=0.05,
            label="Final Denoising Strength",
            elem_id=_forge_elem(prefix, "script_loopback_final_denoising"),
        )
        controls["script_loopback_curve"] = gr.Dropdown(
            ["Aggressive", "Linear", "Lazy"],
            value="Linear",
            label="Denoising Strength Curve",
            elem_id=_forge_elem(prefix, "script_loopback_curve"),
        )

    with gr.Group(
        visible=False,
        elem_id=_forge_elem(prefix, "script_sd_upscale_panel"),
        elem_classes=["forge-neo-script-panel"],
    ) as sd_upscale_panel:
        with gr.Row(elem_classes=["forge-neo-script-row"]):
            controls["script_sd_upscale_upscaler"] = gr.Dropdown(
                _script_upscaler_choices(),
                value="None",
                label="Upscaler",
                elem_id=_forge_elem(prefix, "script_sd_upscale_upscaler"),
            )
            controls["script_sd_upscale_scale"] = gr.Slider(
                1.0,
                8.0,
                value=2.0,
                step=0.05,
                label="Scale Factor",
                elem_id=_forge_elem(prefix, "script_sd_upscale_scale"),
            )
        with gr.Row(elem_classes=["forge-neo-script-row"]):
            controls["script_sd_upscale_overlap"] = gr.Slider(
                0,
                256,
                value=64,
                step=16,
                label="Tile Overlap",
                elem_id=_forge_elem(prefix, "script_sd_upscale_overlap"),
            )
            controls["script_sd_upscale_override"] = gr.Checkbox(
                False,
                label="Save to Extras folder instead",
                elem_id=_forge_elem(prefix, "script_sd_upscale_override"),
            )

    controls["script_prompt_matrix_panel"] = prompt_matrix_panel
    controls["script_prompts_panel"] = prompts_panel
    controls["script_xyz_panel"] = xyz_panel
    controls["script_loopback_panel"] = loopback_panel
    controls["script_sd_upscale_panel"] = sd_upscale_panel
    return controls


def _wire_script_controls(script: gr.Dropdown, controls: dict[str, gr.components.Component]) -> None:
    script.change(
        _script_panel_updates,
        inputs=[script],
        outputs=[
            controls["script_prompt_matrix_panel"],
            controls["script_prompts_panel"],
            controls["script_xyz_panel"],
            controls["script_loopback_panel"],
            controls["script_sd_upscale_panel"],
        ],
        show_progress=False,
        queue=False,
    )
    controls["script_xyz_swap_xy"].click(
        _swap_axis_values,
        inputs=[
            controls["script_xyz_x_type"],
            controls["script_xyz_x_values"],
            controls["script_xyz_x_values_dropdown"],
            controls["script_xyz_y_type"],
            controls["script_xyz_y_values"],
            controls["script_xyz_y_values_dropdown"],
            controls["script_xyz_csv_mode"],
        ],
        outputs=[
            controls["script_xyz_x_type"],
            controls["script_xyz_x_values"],
            controls["script_xyz_x_values_dropdown"],
            controls["script_xyz_fill_x"],
            controls["script_xyz_y_type"],
            controls["script_xyz_y_values"],
            controls["script_xyz_y_values_dropdown"],
            controls["script_xyz_fill_y"],
        ],
        show_progress=False,
        queue=False,
    )
    controls["script_xyz_swap_yz"].click(
        _swap_axis_values,
        inputs=[
            controls["script_xyz_y_type"],
            controls["script_xyz_y_values"],
            controls["script_xyz_y_values_dropdown"],
            controls["script_xyz_z_type"],
            controls["script_xyz_z_values"],
            controls["script_xyz_z_values_dropdown"],
            controls["script_xyz_csv_mode"],
        ],
        outputs=[
            controls["script_xyz_y_type"],
            controls["script_xyz_y_values"],
            controls["script_xyz_y_values_dropdown"],
            controls["script_xyz_fill_y"],
            controls["script_xyz_z_type"],
            controls["script_xyz_z_values"],
            controls["script_xyz_z_values_dropdown"],
            controls["script_xyz_fill_z"],
        ],
        show_progress=False,
        queue=False,
    )
    controls["script_xyz_swap_xz"].click(
        _swap_axis_values,
        inputs=[
            controls["script_xyz_x_type"],
            controls["script_xyz_x_values"],
            controls["script_xyz_x_values_dropdown"],
            controls["script_xyz_z_type"],
            controls["script_xyz_z_values"],
            controls["script_xyz_z_values_dropdown"],
            controls["script_xyz_csv_mode"],
        ],
        outputs=[
            controls["script_xyz_x_type"],
            controls["script_xyz_x_values"],
            controls["script_xyz_x_values_dropdown"],
            controls["script_xyz_fill_x"],
            controls["script_xyz_z_type"],
            controls["script_xyz_z_values"],
            controls["script_xyz_z_values_dropdown"],
            controls["script_xyz_fill_z"],
        ],
        show_progress=False,
        queue=False,
    )
    for axis in ("x", "y", "z"):
        controls[f"script_xyz_{axis}_type"].change(
            _xyz_select_axis,
            inputs=[
                controls[f"script_xyz_{axis}_type"],
                controls[f"script_xyz_{axis}_values"],
                controls[f"script_xyz_{axis}_values_dropdown"],
                controls["script_xyz_csv_mode"],
            ],
            outputs=[
                controls[f"script_xyz_fill_{axis}"],
                controls[f"script_xyz_{axis}_values"],
                controls[f"script_xyz_{axis}_values_dropdown"],
            ],
            show_progress=False,
            queue=False,
        )
        controls[f"script_xyz_fill_{axis}"].click(
            _xyz_fill_axis_values,
            inputs=[
                controls[f"script_xyz_{axis}_type"],
                controls["script_xyz_csv_mode"],
            ],
            outputs=[
                controls[f"script_xyz_{axis}_values"],
                controls[f"script_xyz_{axis}_values_dropdown"],
            ],
            show_progress=False,
            queue=False,
        )
    controls["script_xyz_csv_mode"].change(
        _xyz_change_choice_mode,
        inputs=[
            controls["script_xyz_csv_mode"],
            controls["script_xyz_x_type"],
            controls["script_xyz_x_values"],
            controls["script_xyz_x_values_dropdown"],
            controls["script_xyz_y_type"],
            controls["script_xyz_y_values"],
            controls["script_xyz_y_values_dropdown"],
            controls["script_xyz_z_type"],
            controls["script_xyz_z_values"],
            controls["script_xyz_z_values_dropdown"],
        ],
        outputs=[
            controls["script_xyz_fill_x"],
            controls["script_xyz_x_values"],
            controls["script_xyz_x_values_dropdown"],
            controls["script_xyz_fill_y"],
            controls["script_xyz_y_values"],
            controls["script_xyz_y_values_dropdown"],
            controls["script_xyz_fill_z"],
            controls["script_xyz_z_values"],
            controls["script_xyz_z_values_dropdown"],
        ],
        show_progress=False,
        queue=False,
    )


def _adetailer_control_key(unit_index: int, field_name: str) -> str:
    return f"adetailer_unit_{unit_index + 1}_{field_name}"


def _adetailer_initial_state() -> dict[str, object]:
    return adetailer_load_state()


def _adetailer_default(field_name: str, fallback: object = None, values: Mapping[str, object] | None = None) -> object:
    if isinstance(values, Mapping) and field_name in values:
        return values[field_name]
    value = ADETAILER_ARG_DEFAULTS.get(field_name, fallback)
    if value is None and fallback is not None:
        return fallback
    return value


def _adetailer_unit_initial_values(
    state: Mapping[str, object] | None,
    unit_index: int,
    default_model: str,
) -> dict[str, object]:
    units = state.get("units") if isinstance(state, Mapping) else None
    unit = units[unit_index] if isinstance(units, list) and 0 <= unit_index < len(units) and isinstance(units[unit_index], Mapping) else {}
    values: dict[str, object] = {}
    guidance = unit.get("ad_controlnet_guidance_start_end") if isinstance(unit, Mapping) else None
    for field_name in ADETAILER_UNIT_FIELD_NAMES:
        if field_name == "ad_tab_enable":
            fallback = unit_index == 0
        elif field_name == "ad_model":
            fallback = default_model
        elif field_name == "ad_checkpoint":
            fallback = "Use same checkpoint"
        elif field_name == "ad_vae":
            fallback = "Use same VAE"
        elif field_name == "ad_controlnet_guidance_start":
            fallback = guidance[0] if isinstance(guidance, (list, tuple)) and len(guidance) >= 2 else 0.0
        elif field_name == "ad_controlnet_guidance_end":
            fallback = guidance[1] if isinstance(guidance, (list, tuple)) and len(guidance) >= 2 else 1.0
        else:
            fallback = ADETAILER_ARG_DEFAULTS.get(field_name, "")
        values[field_name] = unit.get(field_name, fallback) if isinstance(unit, Mapping) else fallback
    return values


def _adetailer_model_classes_visible(model: object) -> bool:
    return "-world" in str(model or "")


def _adetailer_model_classes_update(model: object):
    return gr.update(visible=_adetailer_model_classes_visible(model))


def _adetailer_unit_controls(controls: dict[str, gr.components.Component]) -> list[gr.components.Component]:
    result: list[gr.components.Component] = [controls["adetailer_enabled"], controls["adetailer_skip_img2img"]]
    for unit_index in range(ADETAILER_UNIT_COUNT):
        for field_name in ADETAILER_UNIT_FIELD_NAMES:
            result.append(controls[_adetailer_control_key(unit_index, field_name)])
    return result


def _adetailer_default_control_updates(default_model: str) -> list[object]:
    adetailer_reset_state()
    updates: list[object] = [False, False]
    for unit_index in range(ADETAILER_UNIT_COUNT):
        unit_default_model = default_model if unit_index == 0 else "None"
        values = _adetailer_unit_initial_values({}, unit_index, unit_default_model)
        for field_name in ADETAILER_UNIT_FIELD_NAMES:
            value = values.get(field_name)
            if field_name == "ad_model_classes":
                updates.append(gr.update(value=str(value or ""), visible=_adetailer_model_classes_visible(unit_default_model)))
            else:
                updates.append(value)
    return updates


def _create_adetailer_unit_controls(
    controls: dict[str, gr.components.Component],
    prefix: str,
    unit_index: int,
    ad_model_choices: list[str],
    default_model: str,
    default_values: Mapping[str, object],
    checkpoint_choices: list[object],
    vae_choices: list[object],
    sampler_choices: list[object],
    scheduler_choices: list[object],
    controlnet_model_choices: list[object],
    controlnet_module_choices: list[object],
) -> None:
    key = partial(_adetailer_control_key, unit_index)
    elem = partial(_forge_elem, prefix)
    suffix = "" if unit_index == 0 else f" {unit_index + 1}"
    ad_model_default = str(_adetailer_default("ad_model", default_model, default_values) or default_model)

    def store(field_name: str, component: gr.components.Component) -> gr.components.Component:
        controls[key(field_name)] = component
        return component

    with gr.Row(elem_classes=["forge-neo-integrated-row"]):
        store(
            "ad_tab_enable",
            gr.Checkbox(
                bool(_adetailer_default("ad_tab_enable", unit_index == 0, default_values)),
                label=_label(f"Enable this tab ({unit_index + 1})", f"启用此单元 ({unit_index + 1})"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_tab_enable"),
            ),
        )
    ad_model = store(
        "ad_model",
        gr.Dropdown(
            ad_model_choices,
            value=ad_model_default,
            label=_label(f"ADetailer detector{suffix}", f"ADetailer 检测模型{suffix}"),
            allow_custom_value=True,
            elem_id=elem(f"adetailer_unit_{unit_index + 1}_model"),
        ),
    )
    ad_model_classes = store(
        "ad_model_classes",
        gr.Textbox(
            label=_label(f"ADetailer detector classes{suffix}", f"ADetailer 检测类别{suffix}"),
            value=str(_adetailer_default("ad_model_classes", "", default_values) or ""),
            visible=_adetailer_model_classes_visible(ad_model_default),
            lines=1,
            max_lines=1,
            elem_id=elem(f"adetailer_unit_{unit_index + 1}_model_classes"),
        ),
    )
    ad_model.change(
        _adetailer_model_classes_update,
        inputs=[ad_model],
        outputs=[ad_model_classes],
        show_progress=False,
        queue=False,
    )
    store(
        "ad_prompt",
        gr.Textbox(
            label=_label(f"ADetailer prompt{suffix}", f"ADetailer 提示词{suffix}"),
            value=str(_adetailer_default("ad_prompt", "", default_values) or ""),
            lines=3,
            placeholder=_label(
                f"ADetailer Prompt{suffix}\n(if blank, the original prompt is used)",
                f"ADetailer 提示词{suffix}\n留空则使用原始提示词",
            ),
            elem_id=elem(f"adetailer_unit_{unit_index + 1}_prompt"),
        ),
    )
    store(
        "ad_negative_prompt",
        gr.Textbox(
            label=_label(f"ADetailer negative prompt{suffix}", f"ADetailer 反向提示词{suffix}"),
            value=str(_adetailer_default("ad_negative_prompt", "", default_values) or ""),
            lines=2,
            placeholder=_label(
                f"ADetailer Negative Prompt{suffix}\n(if blank, the original negative prompt is used)",
                f"ADetailer 反向提示词{suffix}\n留空则使用原始反向提示词",
            ),
            elem_id=elem(f"adetailer_unit_{unit_index + 1}_negative_prompt"),
        ),
    )

    with gr.Accordion(_label("Detection", "检测"), open=False, elem_id=elem(f"adetailer_unit_{unit_index + 1}_detection")):
        store(
            "ad_confidence",
            gr.Slider(
                0.0,
                1.0,
                value=float(_adetailer_default("ad_confidence", 0.3, default_values)),
                step=0.01,
                label=_label(f"Detection model confidence threshold{suffix}", f"检测模型置信阈值{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_confidence"),
            ),
        )
        store(
            "ad_mask_filter_method",
            gr.Radio(
                ["Area", "Confidence"],
                value=str(_adetailer_default("ad_mask_filter_method", "Area", default_values)),
                label=_label(f"Method to filter top k masks{suffix}", f"Top K 蒙版筛选方式{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_mask_filter_method"),
            ),
        )
        store(
            "ad_mask_k",
            gr.Slider(
                0,
                10,
                value=int(_adetailer_default("ad_mask_k", 0, default_values)),
                step=1,
                label=_label(f"Mask only the top k (0 to disable){suffix}", f"仅使用前 K 个蒙版，0 为关闭{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_mask_k"),
            ),
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "ad_mask_min_ratio",
                gr.Slider(
                    0.0,
                    1.0,
                    value=float(_adetailer_default("ad_mask_min_ratio", 0.0, default_values)),
                    step=0.001,
                    label=_label(f"Mask min area ratio{suffix}", f"蒙版区域最小比率{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_mask_min_ratio"),
                ),
            )
            store(
                "ad_mask_max_ratio",
                gr.Slider(
                    0.0,
                    1.0,
                    value=float(_adetailer_default("ad_mask_max_ratio", 1.0, default_values)),
                    step=0.001,
                    label=_label(f"Mask max area ratio{suffix}", f"蒙版区域最大比率{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_mask_max_ratio"),
                ),
            )

    with gr.Accordion(_label("Mask Preprocessing", "蒙版处理"), open=False, elem_id=elem(f"adetailer_unit_{unit_index + 1}_mask")):
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "ad_x_offset",
                gr.Slider(
                    -200,
                    200,
                    value=int(_adetailer_default("ad_x_offset", 0, default_values)),
                    step=1,
                    label=_label(f"Mask X offset{suffix}", f"蒙版 X 偏移{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_x_offset"),
                ),
            )
            store(
                "ad_y_offset",
                gr.Slider(
                    -200,
                    200,
                    value=int(_adetailer_default("ad_y_offset", 0, default_values)),
                    step=1,
                    label=_label(f"Mask Y offset{suffix}", f"蒙版 Y 偏移{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_y_offset"),
                ),
            )
        store(
            "ad_dilate_erode",
            gr.Slider(
                -128,
                128,
                value=int(_adetailer_default("ad_dilate_erode", 4, default_values)),
                step=4,
                label=_label(f"Mask erosion (-) / dilation (+){suffix}", f"蒙版腐蚀 (-) / 膨胀 (+){suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_dilate_erode"),
            ),
        )
        store(
            "ad_mask_merge_invert",
            gr.Radio(
                ["None", "Merge", "Merge and Invert"],
                value=str(_adetailer_default("ad_mask_merge_invert", "None", default_values)),
                label=_label(f"Mask merge mode{suffix}", f"蒙版合并模式{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_mask_merge_invert"),
            ),
        )

    with gr.Accordion(_label("Inpainting", "重绘"), open=False, elem_id=elem(f"adetailer_unit_{unit_index + 1}_inpainting")):
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "ad_mask_blur",
                gr.Slider(
                    0,
                    64,
                    value=int(_adetailer_default("ad_mask_blur", 4, default_values)),
                    step=1,
                    label=_label(f"Inpaint mask blur{suffix}", f"重绘蒙版边缘模糊度{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_mask_blur"),
                ),
            )
            store(
                "ad_denoising_strength",
                gr.Slider(
                    0.0,
                    1.0,
                    value=float(_adetailer_default("ad_denoising_strength", 0.5, default_values)),
                    step=0.01,
                    label=_label(f"Inpaint denoising strength{suffix}", f"局部重绘幅度{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_denoising_strength"),
                ),
            )
        store(
            "ad_inpaint_only_masked",
            gr.Checkbox(
                bool(_adetailer_default("ad_inpaint_only_masked", True, default_values)),
                label=_label(f"Inpaint only masked{suffix}", f"仅重绘蒙版内容{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_inpaint_only_masked"),
            ),
        )
        store(
            "ad_inpaint_only_masked_padding",
            gr.Slider(
                0,
                256,
                value=int(_adetailer_default("ad_inpaint_only_masked_padding", 32, default_values)),
                step=4,
                label=_label(f"Inpaint only masked padding, pixels{suffix}", f"仅重绘蒙版区域边缘预留像素{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_inpaint_padding"),
            ),
        )
        store(
            "ad_use_inpaint_width_height",
            gr.Checkbox(
                bool(_adetailer_default("ad_use_inpaint_width_height", False, default_values)),
                label=_label(f"Use separate width/height{suffix}", f"使用独立重绘宽高{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_use_inpaint_size"),
            ),
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "ad_inpaint_width",
                gr.Slider(
                    64,
                    2048,
                    value=int(_adetailer_default("ad_inpaint_width", 512, default_values)),
                    step=4,
                    label=_label(f"Inpaint width{suffix}", f"重绘宽度{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_inpaint_width"),
                ),
            )
            store(
                "ad_inpaint_height",
                gr.Slider(
                    64,
                    2048,
                    value=int(_adetailer_default("ad_inpaint_height", 512, default_values)),
                    step=4,
                    label=_label(f"Inpaint height{suffix}", f"重绘高度{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_inpaint_height"),
                ),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "ad_use_steps",
                gr.Checkbox(
                    bool(_adetailer_default("ad_use_steps", False, default_values)),
                    label=_label(f"Use separate steps{suffix}", f"使用独立迭代步数{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_use_steps"),
                ),
            )
            store(
                "ad_steps",
                gr.Slider(
                    1,
                    150,
                    value=int(_adetailer_default("ad_steps", 28, default_values)),
                    step=1,
                    label=_label(f"ADetailer steps{suffix}", f"After Detailer 迭代步数{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_steps"),
                ),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "ad_use_cfg_scale",
                gr.Checkbox(
                    bool(_adetailer_default("ad_use_cfg_scale", False, default_values)),
                    label=_label(f"Use separate CFG scale{suffix}", f"使用独立提示词引导系数{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_use_cfg"),
                ),
            )
            store(
                "ad_cfg_scale",
                gr.Slider(
                    0.0,
                    30.0,
                    value=float(_adetailer_default("ad_cfg_scale", 7.0, default_values)),
                    step=0.5,
                    label=_label(f"ADetailer CFG scale{suffix}", f"After Detailer 提示词引导系数{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_cfg_scale"),
                ),
            )
        store(
            "ad_use_checkpoint",
            gr.Checkbox(
                bool(_adetailer_default("ad_use_checkpoint", False, default_values)),
                label=_label(f"Use separate checkpoint{suffix}", f"使用独立模型{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_use_checkpoint"),
            ),
        )
        store(
            "ad_checkpoint",
            gr.Dropdown(
                checkpoint_choices,
                value=str(_adetailer_default("ad_checkpoint", "Use same checkpoint", default_values)),
                label=_label(f"ADetailer checkpoint{suffix}", f"After Detailer 模型{suffix}"),
                allow_custom_value=True,
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_checkpoint"),
            ),
        )
        store(
            "ad_use_vae",
            gr.Checkbox(
                bool(_adetailer_default("ad_use_vae", False, default_values)),
                label=_label(f"Use separate VAE{suffix}", f"使用独立 VAE{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_use_vae"),
            ),
        )
        store(
            "ad_vae",
            gr.Dropdown(
                vae_choices,
                value=str(_adetailer_default("ad_vae", "Use same VAE", default_values)),
                label=_label(f"ADetailer VAE{suffix}", f"After Detailer 使用的 VAE{suffix}"),
                allow_custom_value=True,
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_vae"),
            ),
        )
        store(
            "ad_use_sampler",
            gr.Checkbox(
                bool(_adetailer_default("ad_use_sampler", False, default_values)),
                label=_label(f"Use separate sampler{suffix}", f"使用独立采样方法{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_use_sampler"),
            ),
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "ad_sampler",
                gr.Dropdown(
                    sampler_choices,
                    value=str(_adetailer_default("ad_sampler", "DPM++ 2M Karras", default_values)),
                    label=_label(f"ADetailer sampler{suffix}", f"After Detailer 采样方法{suffix}"),
                    allow_custom_value=True,
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_sampler"),
                ),
            )
            store(
                "ad_scheduler",
                gr.Dropdown(
                    scheduler_choices,
                    value=str(_adetailer_default("ad_scheduler", "Use same scheduler", default_values)),
                    label=_label(f"ADetailer scheduler{suffix}", f"ADetailer scheduler{suffix}"),
                    allow_custom_value=True,
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_scheduler"),
                ),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "ad_use_noise_multiplier",
                gr.Checkbox(
                    bool(_adetailer_default("ad_use_noise_multiplier", False, default_values)),
                    label=_label(f"Use separate noise multiplier{suffix}", f"使用独立噪声参数{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_use_noise_multiplier"),
                ),
            )
            store(
                "ad_noise_multiplier",
                gr.Slider(
                    0.5,
                    1.5,
                    value=float(_adetailer_default("ad_noise_multiplier", 1.0, default_values)),
                    step=0.01,
                    label=_label(f"Noise multiplier for img2img{suffix}", f"图生图噪声倍率{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_noise_multiplier"),
                ),
            )
        store(
            "ad_restore_face",
            gr.Checkbox(
                bool(_adetailer_default("ad_restore_face", False, default_values)),
                label=_label(f"Restore faces after ADetailer{suffix}", f"在 After Detailer 之后修复面部{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_restore_face"),
            ),
        )

    with gr.Accordion(_label("ControlNet", "ControlNet"), open=False, elem_id=elem(f"adetailer_unit_{unit_index + 1}_controlnet")):
        store(
            "ad_controlnet_model",
            gr.Dropdown(
                controlnet_model_choices,
                value=str(_adetailer_default("ad_controlnet_model", "None", default_values)),
                label=_label(f"ControlNet model{suffix}", f"ControlNet 模型{suffix}"),
                allow_custom_value=True,
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_controlnet_model"),
            ),
        )
        store(
            "ad_controlnet_module",
            gr.Dropdown(
                controlnet_module_choices,
                value=str(_adetailer_default("ad_controlnet_module", "None", default_values)),
                label=_label(f"ControlNet module{suffix}", f"ControlNet 预处理器{suffix}"),
                allow_custom_value=True,
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_controlnet_module"),
            ),
        )
        store(
            "ad_controlnet_weight",
            gr.Slider(
                0.0,
                1.0,
                value=float(_adetailer_default("ad_controlnet_weight", 1.0, default_values)),
                step=0.01,
                label=_label(f"ControlNet weight{suffix}", f"ControlNet 权重{suffix}"),
                elem_id=elem(f"adetailer_unit_{unit_index + 1}_controlnet_weight"),
            ),
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "ad_controlnet_guidance_start",
                gr.Slider(
                    0.0,
                    1.0,
                    value=float(_adetailer_default("ad_controlnet_guidance_start", 0.0, default_values)),
                    step=0.01,
                    label=_label(f"ControlNet guidance start{suffix}", f"ControlNet 引导介入时机{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_controlnet_guidance_start"),
                ),
            )
            store(
                "ad_controlnet_guidance_end",
                gr.Slider(
                    0.0,
                    1.0,
                    value=float(_adetailer_default("ad_controlnet_guidance_end", 1.0, default_values)),
                    step=0.01,
                    label=_label(f"ControlNet guidance end{suffix}", f"ControlNet 引导结束时机{suffix}"),
                    elem_id=elem(f"adetailer_unit_{unit_index + 1}_controlnet_guidance_end"),
                ),
            )


def _create_adetailer_controls(controls: dict[str, gr.components.Component], prefix: str, *, is_img2img: bool, model_choices) -> None:
    initial_state = _adetailer_initial_state()
    adetailer_enabled_default = bool(initial_state.get("enabled", False)) if isinstance(initial_state, Mapping) else False
    adetailer_skip_img2img_default = bool(initial_state.get("skip_img2img", False)) if is_img2img and isinstance(initial_state, Mapping) else False
    ad_model_choices = adetailer_model_names(include_none=True)
    adetailer_default_model = adetailer_preferred_model()
    if adetailer_default_model not in ad_model_choices:
        adetailer_default_model = "None"
    checkpoint_choices = _localized_value_choices([("Use same checkpoint", "使用同一模型")]) + list(getattr(model_choices, "checkpoints", []) or [])
    vae_choices = _localized_value_choices([("Use same VAE", "使用同一 VAE")]) + list(getattr(model_choices, "vae", []) or [])
    sampler_choices = _localized_value_choices([("Use same sampler", "使用同一采样方法")]) + sampling_methods(load_settings(), include_hidden=True)
    scheduler_choices = _localized_value_choices([("Use same scheduler", "使用同一调度器")]) + scheduler_types()
    controlnet_model_choices = _localized_value_choices([("None", "无"), ("Passthrough", "透传")]) + list(getattr(model_choices, "controlnet", []) or [])
    controlnet_module_choices = _controlnet_preprocessor_choices("All")

    with InputAccordion(
        adetailer_enabled_default,
        label=_label("ADetailer", "ADetailer"),
        visible=adetailer_available(),
        elem_id=_forge_elem(prefix, "adetailer"),
        elem_classes=["forge-neo-integrated-accordion"],
    ) as adetailer_enabled:
        controls["adetailer_enabled"] = adetailer_enabled
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["adetailer_skip_img2img"] = gr.Checkbox(
                adetailer_skip_img2img_default,
                label=_label("Skip img2img", "跳过 img2img"),
                visible=is_img2img,
                elem_id=_forge_elem(prefix, "adetailer_skip_img2img"),
            )
            controls["adetailer_restore_defaults"] = gr.Button(
                _label("Restore defaults", "恢复默认值"),
                variant="secondary",
                elem_id=_forge_elem(prefix, "adetailer_restore_defaults"),
            )
            gr.Markdown(f"v{adetailer_version()}", elem_id=_forge_elem(prefix, "adetailer_version"))
        with gr.Tabs(elem_id=_forge_elem(prefix, "adetailer_tabs"), elem_classes=["forge-neo-mode-tabs", "forge-neo-adetailer-tabs"]):
            for unit_index in range(ADETAILER_UNIT_COUNT):
                default_model = adetailer_default_model if unit_index == 0 else "None"
                default_values = _adetailer_unit_initial_values(initial_state, unit_index, default_model)
                with gr.Tab(_label(f"Unit {unit_index + 1}", f"单元 {unit_index + 1}"), elem_id=_forge_elem(prefix, f"adetailer_unit_{unit_index + 1}")):
                    _create_adetailer_unit_controls(
                        controls,
                        prefix,
                        unit_index,
                        ad_model_choices,
                        default_model,
                        default_values,
                        checkpoint_choices,
                        vae_choices,
                        sampler_choices,
                        scheduler_choices,
                        controlnet_model_choices,
                        controlnet_module_choices,
                    )
        controls["adetailer_restore_defaults"].click(
            partial(_adetailer_default_control_updates, adetailer_default_model),
            inputs=[],
            outputs=_adetailer_unit_controls(controls),
            show_progress=False,
            queue=False,
        )

    unit_one = partial(_adetailer_control_key, 0)
    controls["adetailer_model"] = controls[unit_one("ad_model")]
    controls["adetailer_model_classes"] = controls[unit_one("ad_model_classes")]
    controls["adetailer_prompt"] = controls[unit_one("ad_prompt")]
    controls["adetailer_negative_prompt"] = controls[unit_one("ad_negative_prompt")]
    controls["adetailer_confidence"] = controls[unit_one("ad_confidence")]
    controls["adetailer_mask_blur"] = controls[unit_one("ad_mask_blur")]
    controls["adetailer_dilate_erode"] = controls[unit_one("ad_dilate_erode")]
    controls["adetailer_denoising_strength"] = controls[unit_one("ad_denoising_strength")]
    controls["adetailer_inpaint_padding"] = controls[unit_one("ad_inpaint_only_masked_padding")]


FORGE_COUPLE_GUIDE_URL = "https://github.com/Haoming02/sd-forge-couple"
FORGE_COUPLE_MAPPING_PRESETS = {
    "two_columns": [
        [0.0, 0.5, 0.0, 1.0, 1.0],
        [0.5, 1.0, 0.0, 1.0, 1.0],
    ],
    "three_columns": [
        [0.0, 1.0 / 3.0, 0.0, 1.0, 1.0],
        [1.0 / 3.0, 2.0 / 3.0, 0.0, 1.0, 1.0],
        [2.0 / 3.0, 1.0, 0.0, 1.0, 1.0],
    ],
    "two_rows": [
        [0.0, 1.0, 0.0, 0.5, 1.0],
        [0.0, 1.0, 0.5, 1.0, 1.0],
    ],
    "four_quadrants": [
        [0.0, 0.5, 0.0, 0.5, 1.0],
        [0.5, 1.0, 0.0, 0.5, 1.0],
        [0.0, 0.5, 0.5, 1.0, 1.0],
        [0.5, 1.0, 0.5, 1.0, 1.0],
    ],
}
FORGE_COUPLE_PREVIEW_COLORS = (
    (239, 68, 68),
    (245, 158, 11),
    (34, 197, 94),
    (14, 165, 233),
    (99, 102, 241),
    (168, 85, 247),
    (236, 72, 153),
)


def _forge_couple_control_key(field_name: str) -> str:
    return f"forge_couple_{field_name}"


def _forge_couple_default(field_name: str, fallback: object = None) -> object:
    return FORGE_COUPLE_ARG_DEFAULTS.get(field_name, fallback)


def _forge_couple_controls(controls: dict[str, gr.components.Component]) -> list[gr.components.Component]:
    return [controls[_forge_couple_control_key(field_name)] for field_name in FORGE_COUPLE_ARG_KEYS]


def _forge_couple_image(value: object) -> Image.Image | None:
    if isinstance(value, str) and value.startswith("data:image/") and "base64," in value:
        try:
            raw = base64.b64decode(value.split("base64,", 1)[1])
            with Image.open(io.BytesIO(raw)) as image:
                return image.convert("RGBA").copy()
        except Exception:
            return None
    return _image_from_value(value)


def _forge_couple_canvas_dimensions(width: object, height: object) -> tuple[int, int]:
    canvas_width = max(64, min(_as_int_param(width, 512), 2048))
    canvas_height = max(64, min(_as_int_param(height, 512), 2048))
    while canvas_width * canvas_height > 1024 * 1024:
        canvas_width = max(64, canvas_width // 2)
        canvas_height = max(64, canvas_height // 2)
    return canvas_width, canvas_height


def _forge_couple_preview_dimensions(width: object, height: object) -> tuple[int, int]:
    canvas_width, canvas_height = _forge_couple_canvas_dimensions(width, height)
    longest = max(canvas_width, canvas_height)
    if longest > 768:
        scale = 768.0 / longest
        canvas_width = max(64, int(round(canvas_width * scale)))
        canvas_height = max(64, int(round(canvas_height * scale)))
    return canvas_width, canvas_height


def _forge_couple_prompt_lines(prompt: object, separator: object) -> list[str]:
    delimiter = _forge_couple_separator_value(separator)
    return [item.strip() for item in str(prompt or "").split(delimiter)]


def _forge_couple_separator_value(separator: object) -> str:
    delimiter = str(separator or "").replace("\\n", "\n").replace("\\t", "\t")
    return delimiter if delimiter else "\n"


def _forge_couple_reference_image(value: object, size: tuple[int, int]) -> Image.Image:
    image = _forge_couple_image(value)
    if image is None:
        return Image.new("RGB", size, "black")
    image = image.convert("RGB").resize(size, Image.Resampling.LANCZOS)
    return ImageEnhance.Brightness(image).enhance(0.56)


def _forge_couple_binary_mask(value: object, width: object, height: object) -> Image.Image | None:
    image = _forge_couple_image(value)
    if image is None:
        return None
    size = _forge_couple_canvas_dimensions(width, height)
    rgba = image.convert("RGBA").resize(size, Image.Resampling.NEAREST)
    red, green, blue, alpha = rgba.split()
    red = red.point(lambda pixel: 255 if pixel >= 248 else 0)
    green = green.point(lambda pixel: 255 if pixel >= 248 else 0)
    blue = blue.point(lambda pixel: 255 if pixel >= 248 else 0)
    alpha = alpha.point(lambda pixel: 255 if pixel > 0 else 0)
    mask = ImageChops.multiply(ImageChops.multiply(red, green), ImageChops.multiply(blue, alpha))
    return mask if mask.getbbox() else None


def _forge_couple_mask_foreground(mask: object) -> Image.Image | None:
    image = _forge_couple_image(mask)
    if image is None:
        return None
    alpha = image.convert("L")
    foreground = Image.new("RGBA", image.size, (255, 255, 255, 0))
    foreground.putalpha(alpha)
    return foreground


def _forge_couple_mask_gallery(layers: object, lang: object) -> list[tuple[Image.Image, str]]:
    label = partial(_label_for_lang, lang)
    values: list[tuple[Image.Image, str]] = []
    for index, item in enumerate(normalize_mask_mapping(layers)):
        image = _forge_couple_image(item.get("mask"))
        if image is None:
            continue
        caption = label(
            f"Region {index + 1} | Weight {float(item.get('weight', 1.0)):.2f}",
            f"区域 {index + 1} | 权重 {float(item.get('weight', 1.0)):.2f}",
        )
        values.append((image.convert("RGB"), caption))
    return values


def _forge_couple_preview(
    prompt: object,
    separator: object,
    mode: object,
    direction: object,
    background: object,
    background_weight: object,
    mapping: object,
    mask_layers: object,
    width: object,
    height: object,
    reference: object,
) -> Image.Image:
    size = _forge_couple_preview_dimensions(width, height)
    base = _forge_couple_reference_image(reference, size).convert("RGBA")
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    selected_mode = str(mode or "Basic")
    selected_background = str(background or "None")

    if selected_mode == "Basic":
        lines = _forge_couple_prompt_lines(prompt, separator)
        region_count = max(1, len(lines) - int(selected_background != "None"))
        horizontal = str(direction or "Horizontal") == "Horizontal"
        for index in range(region_count):
            if horizontal:
                x0 = int(round(size[0] * index / region_count))
                x1 = size[0] if index == region_count - 1 else int(round(size[0] * (index + 1) / region_count))
                rectangle = (x0, 0, x1, size[1])
            else:
                y0 = int(round(size[1] * index / region_count))
                y1 = size[1] if index == region_count - 1 else int(round(size[1] * (index + 1) / region_count))
                rectangle = (0, y0, size[0], y1)
            color = FORGE_COUPLE_PREVIEW_COLORS[index % len(FORGE_COUPLE_PREVIEW_COLORS)]
            draw.rectangle(rectangle, fill=(*color, 92), outline=(*color, 255), width=3)
            draw.text((rectangle[0] + 8, rectangle[1] + 8), str(index + 1), fill=(255, 255, 255, 255))
    elif selected_mode == "Advanced":
        for index, (x1, x2, y1, y2, weight) in enumerate(normalize_advanced_mapping(mapping, use_default=False)):
            rectangle = (
                int(round(size[0] * x1)),
                int(round(size[1] * y1)),
                int(round(size[0] * x2)),
                int(round(size[1] * y2)),
            )
            color = FORGE_COUPLE_PREVIEW_COLORS[index % len(FORGE_COUPLE_PREVIEW_COLORS)]
            draw.rectangle(rectangle, outline=(*color, 255), width=4)
            draw.text((rectangle[0] + 8, rectangle[1] + 8), str(index + 1), fill=(255, 255, 255, 255))
    else:
        for index, item in enumerate(normalize_mask_mapping(mask_layers)):
            mask = _forge_couple_image(item.get("mask"))
            if mask is None:
                continue
            mask = mask.convert("L").resize(size, Image.Resampling.NEAREST)
            opacity = int(round(70 + 70 * min(max(float(item.get("weight", 1.0)), 0.0), 1.0)))
            alpha = ImageChops.multiply(mask, Image.new("L", size, opacity))
            color = FORGE_COUPLE_PREVIEW_COLORS[index % len(FORGE_COUPLE_PREVIEW_COLORS)]
            layer = Image.new("RGBA", size, (*color, 0))
            layer.putalpha(alpha)
            overlay = Image.alpha_composite(overlay, layer)
            bounds = mask.getbbox()
            if bounds:
                ImageDraw.Draw(overlay).text((bounds[0] + 8, bounds[1] + 8), str(index + 1), fill=(255, 255, 255, 255))

    if selected_background != "None":
        try:
            global_opacity = int(round(42 * max(0.1, min(float(background_weight), 1.0))))
        except Exception:
            global_opacity = 21
        overlay = Image.alpha_composite(Image.new("RGBA", size, (255, 255, 255, global_opacity)), overlay)
    return Image.alpha_composite(base, overlay).convert("RGB")


def _forge_couple_create_mask_canvas(width: object, height: object):
    size = _forge_couple_canvas_dimensions(width, height)
    return Image.new("RGB", size, "black"), None


def _forge_couple_dataframe_prompt(value: object, keep_newlines: object = False) -> str:
    text = str(value or "").strip()
    if bool(keep_newlines):
        return text.replace("\n", "\\n")
    lines = [line.strip(" ,") for line in text.splitlines() if line.strip(" ,")]
    return ", ".join(lines) if len(lines) > 1 else text


def _forge_couple_mapping_table(
    mapping: object,
    prompt: object = "",
    separator: object = "",
    keep_newlines: object = False,
) -> list[list[object]]:
    rows = normalize_advanced_mapping(mapping)
    prompts = _forge_couple_prompt_lines(prompt, separator)
    return [
        [*row, _forge_couple_dataframe_prompt(prompts[index], keep_newlines) if index < len(prompts) else ""]
        for index, row in enumerate(rows)
    ]


def _forge_couple_table_prompt_values(value: object, keep_newlines: object = False) -> list[str]:
    rows = value.get("data", []) if isinstance(value, dict) else value
    if not isinstance(rows, (list, tuple)):
        return []
    prompts: list[str] = []
    for row in rows:
        if isinstance(row, (list, tuple)) and len(row) >= 6:
            prompt = str(row[5] or "").strip()
        elif isinstance(row, dict):
            prompt = str(row.get("prompt", "") or "").strip()
        else:
            prompt = ""
        prompts.append(prompt.replace("\\n", "\n") if bool(keep_newlines) else prompt)
    return prompts


def _forge_couple_prompt_from_table(
    value: object,
    prompt: object,
    separator: object,
    keep_newlines: object = False,
) -> str:
    table_prompts = _forge_couple_table_prompt_values(value, keep_newlines)
    previous = _forge_couple_prompt_lines(prompt, separator)
    if len(table_prompts) < len(previous):
        table_prompts.extend(previous[len(table_prompts):])
    return _forge_couple_separator_value(separator).join(table_prompts)


def _forge_couple_advanced_preview(
    prompt: object,
    separator: object,
    mapping: object,
    width: object,
    height: object,
    reference: object,
) -> Image.Image:
    return _forge_couple_preview(
        prompt,
        separator,
        "Advanced",
        "Horizontal",
        "None",
        0.5,
        mapping,
        [],
        width,
        height,
        reference,
    )


def _forge_couple_mask_preview(layers: object, width: object, height: object) -> Image.Image:
    return _forge_couple_preview(
        "",
        "",
        "Mask",
        "Horizontal",
        "None",
        0.5,
        [],
        layers,
        width,
        height,
        None,
    )


def _forge_couple_advanced_table_changed(value, prompt, separator, width, height, reference, keep_newlines=False):
    mapping = normalize_advanced_mapping(value)
    updated_prompt = _forge_couple_prompt_from_table(value, prompt, separator, keep_newlines)
    preview = _forge_couple_advanced_preview(updated_prompt, separator, mapping, width, height, reference)
    return mapping, updated_prompt, preview


def _forge_couple_sync_advanced_prompts(prompt, separator, value, width, height, reference, keep_newlines=False):
    mapping = normalize_advanced_mapping(value)
    table = _forge_couple_mapping_table(mapping, prompt, separator, keep_newlines)
    preview = _forge_couple_advanced_preview(prompt, separator, mapping, width, height, reference)
    return gr.update(value=table), preview


def _forge_couple_reference_uploaded(value, prompt, separator, mapping, width, height):
    image = _forge_couple_image(value)
    return image, _forge_couple_advanced_preview(prompt, separator, mapping, width, height, image)


def _forge_couple_reference_cleared(prompt, separator, mapping, width, height):
    return None, gr.update(value=None), _forge_couple_advanced_preview(prompt, separator, mapping, width, height, None)


def _forge_couple_mask_background_uploaded(value, width, height):
    image = _forge_couple_image(value)
    if image is None:
        return gr.update(), gr.update(value=None)
    size = _forge_couple_canvas_dimensions(width, height)
    background = ImageEnhance.Brightness(image.convert("RGB").resize(size, Image.Resampling.LANCZOS)).enhance(0.75)
    return background, gr.update(value=None)


def _forge_couple_mask_image_uploaded(value, width, height):
    mask = _forge_couple_binary_mask(value, width, height)
    return _forge_couple_mask_foreground(mask), gr.update(value=None)


def _forge_couple_mask_load(layers, selected):
    values = normalize_mask_mapping(layers)
    try:
        index = int(selected)
    except Exception:
        index = -1
    if index < 0 or index >= len(values):
        return gr.update()
    return _forge_couple_mask_foreground(values[index]["mask"])


def _forge_couple_mask_action_updates(layers, selected):
    values = normalize_mask_mapping(layers)
    try:
        index = int(selected)
    except Exception:
        index = -1
    active = 0 <= index < len(values)
    return [gr.update(interactive=active)] * 3


def _forge_couple_mode_changed(choice, advanced_table, mask_layers):
    selected = str(choice or "Basic")
    mapping = normalize_mask_mapping(mask_layers) if selected == "Mask" else normalize_advanced_mapping(advanced_table)
    return (
        gr.update(visible=selected in {"Basic", "Mask"}),
        gr.update(visible=selected == "Basic"),
        gr.update(visible=selected == "Mask"),
        gr.update(visible=selected == "Advanced"),
        gr.update(visible=selected == "Mask"),
        mapping,
    )


def _forge_couple_pull_advanced(source_table, prompt, separator, width, height, reference, keep_newlines=False):
    mapping = normalize_advanced_mapping(source_table)
    table = _forge_couple_mapping_table(mapping, prompt, separator, keep_newlines)
    preview = _forge_couple_advanced_preview(prompt, separator, mapping, width, height, reference)
    return gr.update(value=table), mapping, preview


def _forge_couple_pull_masks(source_layers, width, height, *, lang):
    layers = normalize_mask_mapping(source_layers)
    preview = _forge_couple_mask_preview(layers, width, height)
    return layers, layers, gr.update(value=_forge_couple_mask_gallery(layers, lang), selected_index=None), -1, None, 1.0, preview


def _forge_couple_advanced_changed(value: object) -> list[list[float]]:
    return normalize_advanced_mapping(value)


def _forge_couple_select_advanced(value: object):
    return "Advanced", normalize_advanced_mapping(value)


def _forge_couple_select_mask(layers: object):
    return "Mask", normalize_mask_mapping(layers)


def _forge_couple_apply_mapping_preset(
    name: object,
    prompt: object = "",
    separator: object = "",
    keep_newlines: object = False,
):
    mapping = normalize_advanced_mapping(FORGE_COUPLE_MAPPING_PRESETS.get(str(name or ""), FORGE_COUPLE_DEFAULT_MAPPING))
    return gr.update(value=_forge_couple_mapping_table(mapping, prompt, separator, keep_newlines)), mapping


def _forge_couple_mapping_add(
    value: object,
    prompt: object = "",
    separator: object = "",
    keep_newlines: object = False,
):
    mapping = normalize_advanced_mapping(value)
    mapping.append([0.25, 0.75, 0.25, 0.75, 1.0])
    return gr.update(value=_forge_couple_mapping_table(mapping, prompt, separator, keep_newlines)), mapping


def _forge_couple_mapping_remove(
    value: object,
    prompt: object = "",
    separator: object = "",
    keep_newlines: object = False,
):
    mapping = normalize_advanced_mapping(value)
    if len(mapping) > 1:
        mapping.pop()
    return gr.update(value=_forge_couple_mapping_table(mapping, prompt, separator, keep_newlines)), mapping


def _forge_couple_mask_add(foreground, weight, layers, width, height, *, lang):
    values = normalize_mask_mapping(layers)
    mask = _forge_couple_binary_mask(foreground, width, height)
    if mask is None:
        return values, values, gr.update(), len(values) - 1, foreground, weight
    values.append({"mask": mask, "weight": max(0.0, min(float(weight or 1.0), 5.0))})
    selected = len(values) - 1
    return values, values, gr.update(value=_forge_couple_mask_gallery(values, lang), selected_index=selected), selected, None, values[selected]["weight"]


def _forge_couple_mask_selected(layers, evt: gr.EventData, *, lang):
    values = normalize_mask_mapping(layers)
    index = getattr(evt, "index", -1)
    if isinstance(index, (list, tuple)):
        index = index[0] if index else -1
    try:
        selected = int(index)
    except Exception:
        selected = -1
    if selected < 0 or selected >= len(values):
        return -1, None, 1.0
    return selected, _forge_couple_mask_foreground(values[selected]["mask"]), float(values[selected].get("weight", 1.0))


def _forge_couple_mask_replace(foreground, weight, layers, selected, width, height, *, lang):
    values = normalize_mask_mapping(layers)
    try:
        index = int(selected)
    except Exception:
        index = -1
    mask = _forge_couple_binary_mask(foreground, width, height)
    if mask is None or index < 0 or index >= len(values):
        return values, values, gr.update(), index, foreground, weight
    values[index] = {"mask": mask, "weight": max(0.0, min(float(weight or 1.0), 5.0))}
    return values, values, gr.update(value=_forge_couple_mask_gallery(values, lang), selected_index=index), index, foreground, values[index]["weight"]


def _forge_couple_mask_delete(layers, selected, *, lang):
    values = normalize_mask_mapping(layers)
    try:
        index = int(selected)
    except Exception:
        index = -1
    if 0 <= index < len(values):
        del values[index]
    next_index = min(index, len(values) - 1)
    foreground = _forge_couple_mask_foreground(values[next_index]["mask"]) if next_index >= 0 else None
    weight = float(values[next_index].get("weight", 1.0)) if next_index >= 0 else 1.0
    return values, values, gr.update(value=_forge_couple_mask_gallery(values, lang), selected_index=next_index if next_index >= 0 else None), next_index, foreground, weight


def _forge_couple_mask_move(layers, selected, delta: int, *, lang):
    values = normalize_mask_mapping(layers)
    try:
        index = int(selected)
    except Exception:
        index = -1
    target = index + int(delta)
    if 0 <= index < len(values) and 0 <= target < len(values):
        values[index], values[target] = values[target], values[index]
        index = target
    foreground = _forge_couple_mask_foreground(values[index]["mask"]) if 0 <= index < len(values) else None
    weight = float(values[index].get("weight", 1.0)) if 0 <= index < len(values) else 1.0
    return values, values, gr.update(value=_forge_couple_mask_gallery(values, lang), selected_index=index if index >= 0 else None), index, foreground, weight


def _forge_couple_mask_weight_changed(weight, layers, selected, *, lang):
    values = normalize_mask_mapping(layers)
    try:
        index = int(selected)
    except Exception:
        index = -1
    if 0 <= index < len(values):
        values[index]["weight"] = max(0.0, min(float(weight or 1.0), 5.0))
    return values, values, gr.update(value=_forge_couple_mask_gallery(values, lang), selected_index=index if index >= 0 else None)


def _forge_couple_mask_import(files, layers, width, height, *, lang):
    values = normalize_mask_mapping(layers)
    for item in list(files or []):
        mask = _forge_couple_binary_mask(item, width, height)
        if mask is not None:
            values.append({"mask": mask, "weight": 1.0})
    selected = len(values) - 1
    foreground = _forge_couple_mask_foreground(values[selected]["mask"]) if selected >= 0 else None
    return values, values, gr.update(value=_forge_couple_mask_gallery(values, lang), selected_index=selected if selected >= 0 else None), selected, foreground, 1.0


def _forge_couple_mask_reset(*, lang):
    return [], [], gr.update(value=_forge_couple_mask_gallery([], lang), selected_index=None), -1, None, 1.0


def _create_forge_couple_controls(
    controls: dict[str, gr.components.Component],
    prefix: str,
    *,
    is_img2img: bool,
    state_value: Mapping[str, object],
    prompt: gr.components.Component,
    width: gr.components.Component,
    height: gr.components.Component,
    settings_value: Mapping[str, object] | None = None,
    source_image: gr.components.Component | None = None,
    bridge: dict[str, dict[str, object]] | None = None,
) -> None:
    lang = state_value.get("__lang", getattr(args_manager.args, "language", "cn"))
    label = partial(_label_for_lang, lang)
    initial_prompt = getattr(prompt, "value", "") or ""
    active_settings = settings_value if isinstance(settings_value, Mapping) else DEFAULT_SETTINGS
    disable_presets = bool(active_settings.get("fc_no_presets", False))
    disable_tile = bool(active_settings.get("fc_no_tile", False))
    keep_advanced_newlines = bool(active_settings.get("fc_adv_newline", False))

    def store(field_name: str, component: gr.components.Component) -> gr.components.Component:
        controls[_forge_couple_control_key(field_name)] = component
        return component

    def select_mask_layer(layers, evt: gr.EventData):
        selected, _foreground, selected_weight = _forge_couple_mask_selected(layers, evt, lang=lang)
        action_updates = _forge_couple_mask_action_updates(layers, selected)
        return selected, selected_weight, *action_updates

    def build_regions(mapping: gr.State, mask_layers: gr.State, mask_selected: gr.State) -> dict[str, object]:
        with gr.Row(elem_classes=["forge-neo-forge-couple-header"]):
            with gr.Column(scale=2, min_width=150, elem_classes=["forge-neo-forge-couple-checks"]):
                enable = store(
                    "enable",
                    gr.Checkbox(
                        bool(_forge_couple_default("enable", False)),
                        label=label("Enable", "启用"),
                        elem_id=_forge_elem(prefix, "forge_couple_enable"),
                    ),
                )
                disable_hr = store(
                    "disable_hr",
                    gr.Checkbox(
                        bool(_forge_couple_default("disable_hr", True)),
                        label=label("Compatibility", "兼容性"),
                        elem_id=_forge_elem(prefix, "forge_couple_disable_hr"),
                    ),
                )

            mode = store(
                "mode",
                gr.Radio(
                    [
                        (label("Basic", "基础"), "Basic"),
                        (label("Advanced", "高级"), "Advanced"),
                        (label("Mask", "蒙版"), "Mask"),
                    ],
                    value=str(_forge_couple_default("mode", "Basic")),
                    label=label("Region Assignment", "区域分配"),
                    scale=3,
                    elem_id=_forge_elem(prefix, "forge_couple_mode"),
                    elem_classes=["forge-neo-forge-couple-mode"],
                ),
            )
            separator = store(
                "separator",
                gr.Textbox(
                    value=str(_forge_couple_default("separator", "")),
                    label=label("Couple Separator", "区域提示词分隔符"),
                    placeholder="\\n",
                    lines=1,
                    max_lines=1,
                    scale=1,
                    elem_id=_forge_elem(prefix, "forge_couple_separator"),
                ),
            )

        with gr.Group(
            visible=True,
            elem_id=_forge_elem(prefix, "forge_couple_basic_settings"),
            elem_classes=["forge-neo-forge-couple-basic-settings"],
        ) as basic_settings:
            with gr.Row(elem_classes=["forge-neo-forge-couple-settings-row"]):
                with gr.Column(
                    scale=2,
                    min_width=150,
                    elem_id=_forge_elem(prefix, "forge_couple_direction_slot"),
                    elem_classes=["forge-neo-forge-couple-direction-slot"],
                ) as direction_slot:
                    direction = store(
                        "direction",
                        gr.Radio(
                            [
                                (label("Horizontal", "水平"), "Horizontal"),
                                (label("Vertical", "垂直"), "Vertical"),
                            ],
                            value=str(_forge_couple_default("direction", "Horizontal")),
                            label=label("Tile Direction", "区域方向"),
                            elem_id=_forge_elem(prefix, "forge_couple_direction"),
                        ),
                    )
                with gr.Column(
                    scale=2,
                    min_width=150,
                    visible=False,
                    elem_id=_forge_elem(prefix, "forge_couple_mask_spacer"),
                    elem_classes=["forge-neo-forge-couple-mask-spacer"],
                ) as mask_spacer:
                    gr.HTML("<span aria-hidden=\"true\"></span>")
                background = store(
                    "background",
                    gr.Radio(
                        [
                            (label("None", "无"), "None"),
                            (label("First Line", "第一行"), "First Line"),
                            (label("Last Line", "最后一行"), "Last Line"),
                        ],
                        value=str(_forge_couple_default("background", "None")),
                        label=label("Global Effect", "全局效果"),
                        scale=3,
                        elem_id=_forge_elem(prefix, "forge_couple_background"),
                    ),
                )
                background_weight = store(
                    "background_weight",
                    gr.Slider(
                        0.1,
                        1.0,
                        value=float(_forge_couple_default("background_weight", 0.5)),
                        step=0.1,
                        interactive=False,
                        label=label("Global Effect Weight", "全局效果权重"),
                        scale=1,
                        elem_id=_forge_elem(prefix, "forge_couple_background_weight"),
                    ),
                )

        with gr.Group(
            visible=False,
            elem_id=_forge_elem(prefix, "forge_couple_advanced_settings"),
            elem_classes=["forge-neo-forge-couple-advanced"],
        ) as advanced_settings:
            with gr.Row(elem_classes=["forge-neo-forge-couple-default-row"]):
                default_mapping = gr.Button(
                    label("Default Mapping", "默认映射"),
                    min_width=240,
                    elem_id=_forge_elem(prefix, "forge_couple_default_mapping"),
                )

            with gr.Group(elem_classes=["forge-neo-forge-couple-mapping-shell"]):
                advanced_mapping = gr.Dataframe(
                    value=_forge_couple_mapping_table(
                        FORGE_COUPLE_DEFAULT_MAPPING,
                        initial_prompt,
                        "",
                        keep_advanced_newlines,
                    ),
                    headers=["x1", "x2", "y1", "y2", "w", label("Prompt", "正向提示词")],
                    row_count=2,
                    column_count=6,
                    datatype=["number", "number", "number", "number", "number", "str"],
                    type="array",
                    interactive=True,
                    max_height=300,
                    show_label=False,
                    wrap=False,
                    line_breaks=False,
                    column_widths=["7%", "7%", "7%", "7%", "7%", "65%"],
                    buttons=[],
                    elem_id=_forge_elem(prefix, "forge_couple_advanced_mapping"),
                )
                with gr.Row(elem_classes=["forge-neo-forge-couple-mapping-actions"]):
                    mapping_add = gr.Button(
                        "+",
                        size="sm",
                        min_width=40,
                        elem_id=_forge_elem(prefix, "forge_couple_mapping_add"),
                        elem_classes=["forge-neo-tool-button"],
                    )
                    mapping_remove = gr.Button(
                        "−",
                        size="sm",
                        min_width=40,
                        elem_id=_forge_elem(prefix, "forge_couple_mapping_remove"),
                        elem_classes=["forge-neo-tool-button"],
                    )

            reference_image = gr.State(None)
            with gr.Row(elem_classes=["forge-neo-forge-couple-preview-stage"]):
                advanced_preview = gr.Image(
                    value=_forge_couple_advanced_preview(initial_prompt, "", FORGE_COUPLE_DEFAULT_MAPPING, 512, 512, None),
                    type="pil",
                    interactive=False,
                    height=512,
                    width=512,
                    show_label=False,
                    buttons=[],
                    elem_id=_forge_elem(prefix, "forge_couple_advanced_preview"),
                )
                with gr.Column(scale=0, min_width=44, elem_classes=["forge-neo-forge-couple-preview-tools"]):
                    reference_upload = gr.UploadButton(
                        "📂",
                        file_types=["image"],
                        type="filepath",
                        size="sm",
                        min_width=44,
                        elem_id=_forge_elem(prefix, "forge_couple_reference_upload"),
                        elem_classes=["forge-neo-tool-button"],
                    )
                    load_source = None
                    if source_image is not None:
                        load_source = gr.Button(
                            "↓",
                            size="sm",
                            min_width=44,
                            elem_id=_forge_elem(prefix, "forge_couple_reference_source"),
                            elem_classes=["forge-neo-tool-button"],
                        )
                    clear_reference = gr.Button(
                        "🗑",
                        size="sm",
                        min_width=44,
                        elem_id=_forge_elem(prefix, "forge_couple_reference_clear"),
                        elem_classes=["forge-neo-tool-button"],
                    )

            advanced_pull = gr.Button(
                label("Pull from txt2img" if is_img2img else "Pull from img2img", "从文生图读取" if is_img2img else "从图生图读取"),
                elem_id=_forge_elem(prefix, "forge_couple_advanced_pull"),
                elem_classes=["forge-neo-forge-couple-wide-button"],
            )

            with gr.Accordion(
                label("Presets", "预设"),
                open=False,
                visible=not disable_presets,
                elem_id=_forge_elem(prefix, "forge_couple_presets"),
            ):
                with gr.Row(elem_classes=["forge-neo-integrated-row", "forge-neo-forge-couple-preset-row"]):
                    mapping_preset = gr.Dropdown(
                        [
                            (label("Two columns", "左右两列"), "two_columns"),
                            (label("Three columns", "三列"), "three_columns"),
                            (label("Two rows", "上下两行"), "two_rows"),
                            (label("Four quadrants", "四宫格"), "four_quadrants"),
                        ],
                        value="two_columns",
                        label=label("Mapping Presets", "映射预设"),
                        elem_id=_forge_elem(prefix, "forge_couple_mapping_preset"),
                    )
                    apply_mapping_preset = gr.Button(
                        label("Apply Preset", "应用预设"),
                        elem_id=_forge_elem(prefix, "forge_couple_mapping_preset_apply"),
                    )

        with gr.Group(
            visible=False,
            elem_id=_forge_elem(prefix, "forge_couple_mask_settings"),
            elem_classes=["forge-neo-forge-couple-mask"],
        ) as mask_settings:
            mask_create = gr.Button(
                label("Create Empty Canvas", "创建空白画布"),
                elem_id=_forge_elem(prefix, "forge_couple_mask_create"),
                elem_classes=["forge-neo-forge-couple-wide-button"],
            )
            gr.HTML(
                f'<h2 class="forge-neo-forge-couple-section-title"><u>{html_lib.escape(label("Mask Canvas", "蒙版画布"))}</u></h2>'
            )
            mask_canvas = ForgeCanvas(
                height=512,
                no_upload=True,
                scribble_color="#ffffff",
                scribble_color_fixed=True,
                scribble_width=28,
                elem_id=_forge_elem(prefix, "forge_couple_mask_canvas"),
                elem_classes=["forge-neo-img2img-input", "forge-neo-forge-couple-mask-canvas"],
            )
            with gr.Row(elem_classes=["forge-neo-forge-couple-mask-io"]):
                mask_save = gr.Button(label("Save Mask", "保存蒙版"), elem_id=_forge_elem(prefix, "forge_couple_mask_save"))
                mask_load = gr.Button(
                    label("Load Mask", "加载蒙版"),
                    interactive=False,
                    elem_id=_forge_elem(prefix, "forge_couple_mask_load"),
                )
                mask_override = gr.Button(
                    label("Override Mask", "覆盖蒙版"),
                    interactive=False,
                    elem_id=_forge_elem(prefix, "forge_couple_mask_override"),
                )

            gr.HTML(
                f'<h2 class="forge-neo-forge-couple-section-title"><u>{html_lib.escape(label("Mask Layers", "蒙版图层"))}</u></h2>'
            )
            mask_gallery = gr.Gallery(
                value=[],
                show_label=False,
                columns=4,
                rows=2,
                height=220,
                type="pil",
                preview=False,
                buttons=[],
                elem_id=_forge_elem(prefix, "forge_couple_mask_gallery"),
            )
            with gr.Row(elem_classes=["forge-neo-forge-couple-mask-order"]):
                mask_up = gr.Button(label("Move Up", "上移"), elem_id=_forge_elem(prefix, "forge_couple_mask_up"))
                mask_down = gr.Button(label("Move Down", "下移"), elem_id=_forge_elem(prefix, "forge_couple_mask_down"))
                mask_weight = gr.Slider(
                    0.0,
                    5.0,
                    value=1.0,
                    step=0.05,
                    label=label("Selected Weight", "所选蒙版权重"),
                    elem_id=_forge_elem(prefix, "forge_couple_mask_weight"),
                )
                mask_delete = gr.Button(
                    label("Delete Mask", "删除蒙版"),
                    interactive=False,
                    elem_id=_forge_elem(prefix, "forge_couple_mask_delete"),
                )

            gr.HTML(
                f'<h2 class="forge-neo-forge-couple-section-title"><u>{html_lib.escape(label("Mask Preview", "蒙版预览"))}</u></h2>'
            )
            mask_preview = gr.Image(
                value=_forge_couple_mask_preview([], 512, 512),
                type="pil",
                interactive=False,
                height=512,
                width=512,
                show_label=False,
                buttons=[],
                elem_id=_forge_elem(prefix, "forge_couple_mask_preview"),
            )
            mask_reset = gr.Button(
                label("Reset All Masks", "重置全部蒙版"),
                elem_id=_forge_elem(prefix, "forge_couple_mask_reset"),
                elem_classes=["forge-neo-forge-couple-wide-button"],
            )
            mask_pull = gr.Button(
                label("Pull from txt2img" if is_img2img else "Pull from img2img", "从文生图读取" if is_img2img else "从图生图读取"),
                elem_id=_forge_elem(prefix, "forge_couple_mask_pull"),
                elem_classes=["forge-neo-forge-couple-wide-button"],
            )
            with gr.Row(elem_classes=["forge-neo-forge-couple-mask-uploads"]):
                mask_background_upload = gr.Image(
                    image_mode="RGBA",
                    type="pil",
                    sources=["upload", "clipboard"],
                    height=256,
                    label=label("Upload Background", "上传背景图"),
                    elem_id=_forge_elem(prefix, "forge_couple_mask_background_upload"),
                )
                mask_image_upload = gr.Image(
                    image_mode="RGBA",
                    type="pil",
                    sources=["upload", "clipboard"],
                    height=256,
                    label=label("Upload Mask", "上传蒙版"),
                    elem_id=_forge_elem(prefix, "forge_couple_mask_image_upload"),
                )
            with gr.Accordion(label("Import Masks", "批量导入蒙版"), open=False, elem_id=_forge_elem(prefix, "forge_couple_mask_import_panel")):
                mask_import = gr.File(
                    file_count="multiple",
                    file_types=["image"],
                    type="filepath",
                    label=label("Mask Image Files", "蒙版图片文件"),
                    elem_id=_forge_elem(prefix, "forge_couple_mask_import"),
                )

        with gr.Accordion(label("Common Prompts", "通用提示词"), open=False, elem_id=_forge_elem(prefix, "forge_couple_common_prompts")):
            with gr.Row(elem_classes=["forge-neo-forge-couple-common-row"]):
                common_parser = store(
                    "common_parser",
                    gr.Radio(
                        [(label("Off", "关闭"), "off"), ("{ }", "{ }"), ("< >", "< >")],
                        value=str(_forge_couple_default("common_parser", "{ }")),
                        label=label("Syntax", "语法"),
                        scale=3,
                        elem_id=_forge_elem(prefix, "forge_couple_common_parser"),
                    ),
                )
                def_in_prompt = store(
                    "def_in_prompt",
                    gr.Checkbox(
                        bool(_forge_couple_default("def_in_prompt", True)),
                        label=label("Include Definitions in Prompt", "在提示词中保留定义"),
                        scale=3,
                        elem_id=_forge_elem(prefix, "forge_couple_def_in_prompt"),
                    ),
                )
                common_debug = store(
                    "common_debug",
                    gr.Checkbox(
                        bool(_forge_couple_default("common_debug", False)),
                        label=label("Debug", "调试"),
                        scale=1,
                        elem_id=_forge_elem(prefix, "forge_couple_common_debug"),
                    ),
                )

        return {
            "enable": enable,
            "disable_hr": disable_hr,
            "mode": mode,
            "separator": separator,
            "direction": direction,
            "background": background,
            "background_weight": background_weight,
            "basic_settings": basic_settings,
            "direction_slot": direction_slot,
            "mask_spacer": mask_spacer,
            "advanced_settings": advanced_settings,
            "advanced_mapping": advanced_mapping,
            "default_mapping": default_mapping,
            "mapping_add": mapping_add,
            "mapping_remove": mapping_remove,
            "mapping_preset": mapping_preset,
            "apply_mapping_preset": apply_mapping_preset,
            "reference_image": reference_image,
            "reference_upload": reference_upload,
            "load_source": load_source,
            "clear_reference": clear_reference,
            "advanced_preview": advanced_preview,
            "advanced_pull": advanced_pull,
            "mask_settings": mask_settings,
            "mask_canvas": mask_canvas,
            "mask_create": mask_create,
            "mask_save": mask_save,
            "mask_load": mask_load,
            "mask_override": mask_override,
            "mask_delete": mask_delete,
            "mask_gallery": mask_gallery,
            "mask_up": mask_up,
            "mask_down": mask_down,
            "mask_weight": mask_weight,
            "mask_preview": mask_preview,
            "mask_reset": mask_reset,
            "mask_pull": mask_pull,
            "mask_background_upload": mask_background_upload,
            "mask_image_upload": mask_image_upload,
            "mask_import": mask_import,
            "common_parser": common_parser,
            "def_in_prompt": def_in_prompt,
            "common_debug": common_debug,
        }

    def build_tiles() -> None:
        gr.HTML(
            f'<div class="forge-neo-forge-couple-tile-title"><h2>{html_lib.escape(label("Tile Mode", "分块模式"))}</h2><strong>{html_lib.escape(label("Experimental", "实验性"))}</strong></div>'
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row", "forge-neo-forge-couple-tile-primary"]):
            store(
                "tile_enabled",
                gr.Checkbox(
                    bool(_forge_couple_default("tile_enabled", False)),
                    label=label("Enable Tile Mode", "启用分块模式"),
                    elem_id=_forge_elem(prefix, "forge_couple_tile_enabled"),
                ),
            )
            store(
                "tile_debug",
                gr.Checkbox(
                    bool(_forge_couple_default("tile_debug", False)),
                    label=label("Debug Tiles", "调试分块"),
                    elem_id=_forge_elem(prefix, "forge_couple_tile_debug"),
                ),
            )
            store(
                "tile_threshold",
                gr.Slider(
                    0.0,
                    1.0,
                    value=float(_forge_couple_default("tile_threshold", 0.75)),
                    step=0.05,
                    label=label("Inclusion Threshold", "区域纳入阈值"),
                    elem_id=_forge_elem(prefix, "forge_couple_tile_threshold"),
                ),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row", "forge-neo-forge-couple-tile-counts"]):
            store(
                "tile_columns",
                gr.Slider(1, 16, value=2, step=1, label=label("Column Count", "列数"), elem_id=_forge_elem(prefix, "forge_couple_tile_columns")),
            )
            store(
                "tile_rows",
                gr.Slider(1, 16, value=2, step=1, label=label("Row Count", "行数"), elem_id=_forge_elem(prefix, "forge_couple_tile_rows")),
            )
        store(
            "tile_replacements",
            gr.Textbox(
                value=str(_forge_couple_default("tile_replacements", "")),
                lines=3,
                label=label("Subject Replacement", "主体替换"),
                placeholder="1boy: 2boys, multiple boys",
                elem_id=_forge_elem(prefix, "forge_couple_tile_replacements"),
            ),
        )

    with gr.Accordion(
        "Forge Couple v7.1.0",
        open=False,
        visible=forge_couple_available(),
        elem_id=_forge_elem(prefix, "forge_couple"),
        elem_classes=["forge-neo-integrated-accordion", "forge-neo-forge-couple"],
    ):
        mapping = store("mapping", gr.State(normalize_advanced_mapping(FORGE_COUPLE_DEFAULT_MAPPING)))
        mask_layers = gr.State([])
        mask_selected = gr.State(-1)
        advanced_newline = gr.State(keep_advanced_newlines)

        if is_img2img and not disable_tile:
            with gr.Tabs(elem_id=_forge_elem(prefix, "forge_couple_outer_tabs"), elem_classes=["forge-neo-forge-couple-outer-tabs"]):
                with gr.Tab(label("Regions", "区域"), elem_id=_forge_elem(prefix, "forge_couple_regions_tab")):
                    region = build_regions(mapping, mask_layers, mask_selected)
                with gr.Tab(label("Tiles", "分块"), elem_id=_forge_elem(prefix, "forge_couple_tiles_tab")):
                    build_tiles()
        else:
            region = build_regions(mapping, mask_layers, mask_selected)
            store("tile_enabled", gr.State(False))
            store("tile_columns", gr.State(-1))
            store("tile_rows", gr.State(-1))
            store("tile_threshold", gr.State(float(_forge_couple_default("tile_threshold", 0.75))))
            store("tile_replacements", gr.State(""))
            store("tile_debug", gr.State(False))

        mode = region["mode"]
        separator = region["separator"]
        background = region["background"]
        background_weight = region["background_weight"]
        advanced_mapping = region["advanced_mapping"]
        reference_image = region["reference_image"]
        advanced_preview = region["advanced_preview"]
        mask_canvas = region["mask_canvas"]
        mask_gallery = region["mask_gallery"]
        mask_weight = region["mask_weight"]
        mask_preview = region["mask_preview"]

        background.change(
            lambda choice: gr.update(interactive=str(choice) != "None"),
            inputs=[background],
            outputs=[background_weight],
            show_progress=False,
            queue=False,
        )
        mode.change(
            _forge_couple_mode_changed,
            inputs=[mode, advanced_mapping, mask_layers],
            outputs=[
                region["basic_settings"],
                region["direction_slot"],
                region["mask_spacer"],
                region["advanced_settings"],
                region["mask_settings"],
                mapping,
            ],
            show_progress=False,
            queue=False,
        )

        advanced_mapping.input(
            _forge_couple_advanced_table_changed,
            inputs=[advanced_mapping, prompt, separator, width, height, reference_image, advanced_newline],
            outputs=[mapping, prompt, advanced_preview],
            show_progress=False,
            queue=False,
        )
        prompt.input(
            _forge_couple_sync_advanced_prompts,
            inputs=[prompt, separator, advanced_mapping, width, height, reference_image, advanced_newline],
            outputs=[advanced_mapping, advanced_preview],
            show_progress=False,
            queue=False,
        )
        separator.change(
            _forge_couple_sync_advanced_prompts,
            inputs=[prompt, separator, advanced_mapping, width, height, reference_image, advanced_newline],
            outputs=[advanced_mapping, advanced_preview],
            show_progress=False,
            queue=False,
        )

        def refresh_advanced_after(event):
            event.then(
                _forge_couple_advanced_preview,
                inputs=[prompt, separator, mapping, width, height, reference_image],
                outputs=[advanced_preview],
                show_progress=False,
                queue=False,
            )

        refresh_advanced_after(
            region["default_mapping"].click(
                _forge_couple_apply_mapping_preset,
                inputs=[gr.State("two_columns"), prompt, separator, advanced_newline],
                outputs=[advanced_mapping, mapping],
                show_progress=False,
                queue=False,
            )
        )
        refresh_advanced_after(
            region["apply_mapping_preset"].click(
                _forge_couple_apply_mapping_preset,
                inputs=[region["mapping_preset"], prompt, separator, advanced_newline],
                outputs=[advanced_mapping, mapping],
                show_progress=False,
                queue=False,
            )
        )
        refresh_advanced_after(
            region["mapping_add"].click(
                _forge_couple_mapping_add,
                inputs=[advanced_mapping, prompt, separator, advanced_newline],
                outputs=[advanced_mapping, mapping],
                show_progress=False,
                queue=False,
            )
        )
        refresh_advanced_after(
            region["mapping_remove"].click(
                _forge_couple_mapping_remove,
                inputs=[advanced_mapping, prompt, separator, advanced_newline],
                outputs=[advanced_mapping, mapping],
                show_progress=False,
                queue=False,
            )
        )
        region["reference_upload"].upload(
            _forge_couple_reference_uploaded,
            inputs=[region["reference_upload"], prompt, separator, mapping, width, height],
            outputs=[reference_image, advanced_preview],
            show_progress=False,
            queue=False,
        )
        region["clear_reference"].click(
            _forge_couple_reference_cleared,
            inputs=[prompt, separator, mapping, width, height],
            outputs=[reference_image, region["reference_upload"], advanced_preview],
            show_progress=False,
            queue=False,
        )
        if region["load_source"] is not None and source_image is not None:
            region["load_source"].click(
                _forge_couple_reference_uploaded,
                inputs=[source_image, prompt, separator, mapping, width, height],
                outputs=[reference_image, advanced_preview],
                show_progress=False,
                queue=False,
            )

        region["mask_create"].click(
            _forge_couple_create_mask_canvas,
            inputs=[width, height],
            outputs=[mask_canvas.background, mask_canvas.foreground],
            show_progress=False,
            queue=False,
        )
        mask_gallery.select(
            select_mask_layer,
            inputs=[mask_layers],
            outputs=[mask_selected, mask_weight, region["mask_load"], region["mask_override"], region["mask_delete"]],
            show_progress=False,
            queue=False,
        )
        region["mask_load"].click(
            _forge_couple_mask_load,
            inputs=[mask_layers, mask_selected],
            outputs=[mask_canvas.foreground],
            show_progress=False,
            queue=False,
        )

        def mask_followups(event):
            event.then(
                _forge_couple_mask_preview,
                inputs=[mask_layers, width, height],
                outputs=[mask_preview],
                show_progress=False,
                queue=False,
            ).then(
                _forge_couple_mask_action_updates,
                inputs=[mask_layers, mask_selected],
                outputs=[region["mask_load"], region["mask_override"], region["mask_delete"]],
                show_progress=False,
                queue=False,
            )

        mask_followups(
            region["mask_save"].click(
                partial(_forge_couple_mask_add, lang=lang),
                inputs=[mask_canvas.foreground, mask_weight, mask_layers, width, height],
                outputs=[mask_layers, mapping, mask_gallery, mask_selected, mask_canvas.foreground, mask_weight],
                show_progress=False,
                queue=False,
            )
        )
        mask_followups(
            region["mask_override"].click(
                partial(_forge_couple_mask_replace, lang=lang),
                inputs=[mask_canvas.foreground, mask_weight, mask_layers, mask_selected, width, height],
                outputs=[mask_layers, mapping, mask_gallery, mask_selected, mask_canvas.foreground, mask_weight],
                show_progress=False,
                queue=False,
            )
        )
        mask_followups(
            region["mask_delete"].click(
                partial(_forge_couple_mask_delete, lang=lang),
                inputs=[mask_layers, mask_selected],
                outputs=[mask_layers, mapping, mask_gallery, mask_selected, mask_canvas.foreground, mask_weight],
                show_progress=False,
                queue=False,
            )
        )
        mask_followups(
            region["mask_up"].click(
                partial(_forge_couple_mask_move, delta=-1, lang=lang),
                inputs=[mask_layers, mask_selected],
                outputs=[mask_layers, mapping, mask_gallery, mask_selected, mask_canvas.foreground, mask_weight],
                show_progress=False,
                queue=False,
            )
        )
        mask_followups(
            region["mask_down"].click(
                partial(_forge_couple_mask_move, delta=1, lang=lang),
                inputs=[mask_layers, mask_selected],
                outputs=[mask_layers, mapping, mask_gallery, mask_selected, mask_canvas.foreground, mask_weight],
                show_progress=False,
                queue=False,
            )
        )
        mask_followups(
            mask_weight.release(
                partial(_forge_couple_mask_weight_changed, lang=lang),
                inputs=[mask_weight, mask_layers, mask_selected],
                outputs=[mask_layers, mapping, mask_gallery],
                show_progress=False,
                queue=False,
            )
        )
        mask_followups(
            region["mask_import"].upload(
                partial(_forge_couple_mask_import, lang=lang),
                inputs=[region["mask_import"], mask_layers, width, height],
                outputs=[mask_layers, mapping, mask_gallery, mask_selected, mask_canvas.foreground, mask_weight],
                show_progress=False,
                queue=False,
            )
        )
        mask_followups(
            region["mask_reset"].click(
                partial(_forge_couple_mask_reset, lang=lang),
                inputs=[],
                outputs=[mask_layers, mapping, mask_gallery, mask_selected, mask_canvas.foreground, mask_weight],
                show_progress=False,
                queue=False,
            )
        )
        region["mask_background_upload"].upload(
            _forge_couple_mask_background_uploaded,
            inputs=[region["mask_background_upload"], width, height],
            outputs=[mask_canvas.background, region["mask_background_upload"]],
            show_progress=False,
            queue=False,
        )
        region["mask_image_upload"].upload(
            _forge_couple_mask_image_uploaded,
            inputs=[region["mask_image_upload"], width, height],
            outputs=[mask_canvas.foreground, region["mask_image_upload"]],
            show_progress=False,
            queue=False,
        )

        for dimension in (width, height):
            dimension.release(
                _forge_couple_advanced_preview,
                inputs=[prompt, separator, mapping, width, height, reference_image],
                outputs=[advanced_preview],
                show_progress=False,
                queue=False,
            )
            dimension.release(
                _forge_couple_mask_preview,
                inputs=[mask_layers, width, height],
                outputs=[mask_preview],
                show_progress=False,
                queue=False,
            )

        if bridge is not None:
            key = "img2img" if is_img2img else "txt2img"
            opposite_key = "txt2img" if is_img2img else "img2img"
            bridge[key] = {
                "lang": lang,
                "prompt": prompt,
                "separator": separator,
                "width": width,
                "height": height,
                "mapping": mapping,
                "advanced_mapping": advanced_mapping,
                "reference_image": reference_image,
                "advanced_newline": advanced_newline,
                "advanced_preview": advanced_preview,
                "advanced_pull": region["advanced_pull"],
                "mask_layers": mask_layers,
                "mask_selected": mask_selected,
                "mask_gallery": mask_gallery,
                "mask_foreground": mask_canvas.foreground,
                "mask_weight": mask_weight,
                "mask_preview": mask_preview,
                "mask_pull": region["mask_pull"],
            }

            def wire_pull(target: dict[str, object], source: dict[str, object]) -> None:
                target["advanced_pull"].click(
                    _forge_couple_pull_advanced,
                    inputs=[
                        source["advanced_mapping"],
                        target["prompt"],
                        target["separator"],
                        target["width"],
                        target["height"],
                        target["reference_image"],
                        target["advanced_newline"],
                    ],
                    outputs=[target["advanced_mapping"], target["mapping"], target["advanced_preview"]],
                    show_progress=False,
                    queue=False,
                )
                target["mask_pull"].click(
                    partial(_forge_couple_pull_masks, lang=target["lang"]),
                    inputs=[source["mask_layers"], target["width"], target["height"]],
                    outputs=[
                        target["mask_layers"],
                        target["mapping"],
                        target["mask_gallery"],
                        target["mask_selected"],
                        target["mask_foreground"],
                        target["mask_weight"],
                        target["mask_preview"],
                    ],
                    show_progress=False,
                    queue=False,
                )

            if opposite_key in bridge:
                wire_pull(bridge[key], bridge[opposite_key])
                wire_pull(bridge[opposite_key], bridge[key])


REGIONAL_PROMPTER_GUIDE_URL = "https://github.com/hako-mikan/sd-webui-regional-prompter"
REGIONAL_PROMPTER_MATRIX_URL = REGIONAL_PROMPTER_GUIDE_URL + "#2d-region-assignment"
REGIONAL_PROMPTER_MASK_URL = REGIONAL_PROMPTER_GUIDE_URL + "#mask-regions-aka-inpaint-experimental-function"
REGIONAL_PROMPTER_PROMPT_URL = REGIONAL_PROMPTER_GUIDE_URL + "/blob/main/prompt_en.md"
REGIONAL_PROMPTER_PRESETS = {
    "Vertical-3": {
        "rp_selected_tab": "Matrix",
        "matrix_mode": "Rows",
        "ratios": "1,1,1",
        "base_ratios": "",
        "use_base": False,
        "use_common": False,
        "use_common_negative": False,
        "calculation_mode": "Attention",
        "options": [],
        "lora_negative_textencoder": "0",
        "lora_negative_unet": "0",
    },
    "Horizontal-3": {
        "rp_selected_tab": "Matrix",
        "matrix_mode": "Columns",
        "ratios": "1,1,1",
        "base_ratios": "",
        "use_base": False,
        "use_common": False,
        "use_common_negative": False,
        "calculation_mode": "Attention",
        "options": [],
        "lora_negative_textencoder": "0",
        "lora_negative_unet": "0",
    },
    "Horizontal-7": {
        "rp_selected_tab": "Matrix",
        "matrix_mode": "Columns",
        "ratios": "1,1,1,1,1,1,1",
        "base_ratios": "0.2",
        "use_base": True,
        "use_common": False,
        "use_common_negative": False,
        "calculation_mode": "Attention",
        "options": [],
        "lora_negative_textencoder": "0",
        "lora_negative_unet": "0",
    },
    "Twod-2-1": {
        "rp_selected_tab": "Matrix",
        "matrix_mode": "Columns",
        "ratios": "1,2,3;1,1",
        "base_ratios": "0.2",
        "use_base": False,
        "use_common": False,
        "use_common_negative": False,
        "calculation_mode": "Attention",
        "options": [],
        "lora_negative_textencoder": "0",
        "lora_negative_unet": "0",
    },
}


def _regional_prompter_link(url: str, en: str, cn: str) -> str:
    return f'<a href="{html_lib.escape(url, quote=True)}" target="_blank" rel="noopener noreferrer">{html_lib.escape(_label(en, cn))}</a>'


def _regional_prompter_swap_ratio_axes(ratios: object) -> str:
    return str(ratios or "").replace(",", "\0").replace(";", ",").replace("\0", ";")


def _regional_prompter_float_values(text: str) -> list[float]:
    values: list[float] = []
    for item in str(text or "").split(","):
        try:
            value = float(item.strip())
        except Exception:
            value = 1.0
        values.append(max(value, 0.001))
    return values or [1.0]


def _regional_prompter_ratio_grid(ratios: object, matrix_mode: object, *, flip: bool = False) -> tuple[list[float], list[list[float]], bool]:
    text = _regional_prompter_swap_ratio_axes(ratios) if flip else str(ratios or "1,1")
    mode = str(matrix_mode or "Columns")
    if ";" in text:
        row_values: list[float] = []
        cell_values: list[list[float]] = []
        for row in text.split(";"):
            values = _regional_prompter_float_values(row)
            row_values.append(values[0])
            cell_values.append(values[1:] or [values[0]])
        return row_values or [1.0], cell_values or [[1.0]], mode == "Rows"
    values = _regional_prompter_float_values(text)
    if mode == "Rows":
        return values, [[1.0] for _ in values], True
    return [1.0], [values], False


def _regional_prompter_spans(values: list[float], size: int) -> list[tuple[int, int]]:
    total = sum(values) or 1.0
    spans: list[tuple[int, int]] = []
    start = 0
    for index, value in enumerate(values):
        end = size if index == len(values) - 1 else int(round(start + size * (value / total)))
        spans.append((max(0, start), max(start + 1, end)))
        start = end
    return spans


def _regional_prompter_matrix_template_text(row_count: int, column_counts: list[int], *, use_common: bool, use_base: bool, vertical: bool) -> str:
    inner_key = "ADDROW" if vertical else "ADDCOL"
    outer_key = "ADDCOL" if vertical else "ADDROW"
    rows = [f" {inner_key} \n".join([""] * max(1, count)) for count in column_counts]
    template = f" {outer_key} \n".join(rows[: max(1, row_count)])
    prefixes = []
    if use_base:
        prefixes.append(" ADDBASE ")
    if use_common:
        prefixes.append(" ADDCOMM ")
    return "\n".join([*prefixes, template]).strip("\n")


def _regional_prompter_make_matrix_template(
    ratios: object,
    matrix_mode: object,
    use_common: object,
    use_base: object,
    flip: object,
    height: object,
    width: object,
    options: object,
    overlay: object,
):
    render_width = max(64, min(_as_int_param(width, 512), 2048))
    render_height = max(64, min(_as_int_param(height, 512), 2048))
    row_weights, cell_weights, vertical = _regional_prompter_ratio_grid(ratios, matrix_mode, flip=bool(flip))
    image = Image.new("RGB", (render_width, render_height), (35, 42, 54))
    draw = ImageDraw.Draw(image)
    palette = [
        (236, 72, 153),
        (124, 58, 237),
        (14, 165, 233),
        (34, 197, 94),
        (245, 158, 11),
        (239, 68, 68),
        (99, 102, 241),
        (20, 184, 166),
    ]
    row_spans = _regional_prompter_spans(row_weights, render_height if not vertical else render_width)
    region_count = 0
    flip_labels = "Flip prompts" in list(options or [])
    rects: list[tuple[int, int, int, int, tuple[int, int, int]]] = []
    for row_index, row_span in enumerate(row_spans):
        cells = cell_weights[min(row_index, len(cell_weights) - 1)] or [1.0]
        cell_spans = _regional_prompter_spans(cells, render_width if not vertical else render_height)
        for cell_span in cell_spans:
            color = palette[region_count % len(palette)]
            if vertical:
                x0, x1 = row_span
                y0, y1 = cell_span
            else:
                x0, x1 = cell_span
                y0, y1 = row_span
            rects.append((x0, y0, x1, y1, color))
            region_count += 1
    for index, (x0, y0, x1, y1, color) in enumerate(rects):
        draw.rectangle((x0, y0, x1, y1), fill=color, outline=(15, 23, 42), width=2)
        label = str(len(rects) - index - 1 if flip_labels else index)
        draw.text((x0 + 8, y0 + 8), label, fill=(255, 255, 255))
    template = _regional_prompter_matrix_template_text(
        len(row_weights),
        [len(row) for row in cell_weights],
        use_common=bool(use_common),
        use_base=bool(use_base),
        vertical=vertical,
    )
    try:
        alpha = max(0.0, min(float(overlay or 0.5), 1.0))
    except Exception:
        alpha = 0.5
    if alpha < 1.0:
        base = Image.new("RGB", image.size, (30, 35, 46))
        image = Image.blend(base, image, alpha)
    return image, template


def _regional_prompter_apply_preset(name: object):
    preset = REGIONAL_PROMPTER_PRESETS.get(str(name or ""))
    if preset is None:
        return [gr.update() for _ in range(11)]
    return [
        preset["rp_selected_tab"],
        gr.update(value=preset["matrix_mode"]),
        gr.update(),
        gr.update(),
        gr.update(value=preset["ratios"]),
        gr.update(value=preset["base_ratios"]),
        gr.update(value=preset["use_base"]),
        gr.update(value=preset["use_common"]),
        gr.update(value=preset["use_common_negative"]),
        gr.update(value=preset["calculation_mode"]),
        gr.update(value=preset["options"]),
    ]


def _regional_prompter_control_key(field_name: str) -> str:
    return f"regional_prompter_{field_name}"


def _dynamic_prompts_control_key(field_name: str) -> str:
    return f"dynamic_prompts_{field_name}"


def _dynamic_prompts_default(field_name: str, fallback: object = None) -> object:
    if field_name == "is_enabled":
        return dynamic_prompts_available()
    return DYNAMIC_PROMPTS_ARG_DEFAULTS.get(field_name, fallback)


def _dynamic_prompts_controls(controls: dict[str, gr.components.Component]) -> list[gr.components.Component]:
    return [controls[_dynamic_prompts_control_key(field_name)] for field_name in DYNAMIC_PROMPTS_ARG_KEYS]


def _dynamic_prompts_help_html() -> str:
    return (
        '<div class="forge-neo-dynamic-prompts-help">'
        '<a href="https://github.com/adieyal/sd-dynamic-prompts/blob/main/docs/SYNTAX.md" target="_blank">Syntax cheatsheet</a><br>'
        '<a href="https://github.com/adieyal/sd-dynamic-prompts/blob/main/docs/tutorial.md" target="_blank">Tutorial</a><br>'
        '<a href="https://github.com/adieyal/sd-dynamic-prompts/discussions" target="_blank">Discussions</a><br>'
        '<a href="https://github.com/adieyal/sd-dynamic-prompts/issues" target="_blank">Report a bug</a>'
        "</div>"
    )


def _dynamic_prompts_jinja_help_html() -> str:
    return (
        '<div class="forge-neo-dynamic-prompts-help">'
        "Jinja2 templates can use expressions such as "
        '<code>{{ choice("red", "blue", "green") }}</code> and prompt blocks for advanced generation.'
        "</div>"
    )


def _create_dynamic_prompts_controls(controls: dict[str, gr.components.Component], prefix: str) -> None:
    available = dynamic_prompts_available()

    def store(field_name: str, component: gr.components.Component) -> gr.components.Component:
        controls[_dynamic_prompts_control_key(field_name)] = component
        return component

    with gr.Accordion(
        _label("Dynamic Prompts", "Dynamic Prompts"),
        open=False,
        visible=available,
        elem_id=_forge_elem(prefix, "dynamic_prompts"),
        elem_classes=["forge-neo-integrated-accordion", "forge-neo-dynamic-prompts"],
    ):
        store(
            "is_enabled",
            gr.Checkbox(
                bool(_dynamic_prompts_default("is_enabled", available)),
                label=_label("Dynamic Prompts enabled", "启用动态提示词"),
                elem_id=_forge_elem(prefix, "dynamic_prompts_enabled"),
            ),
        )
        store(
            "is_combinatorial",
            gr.Checkbox(
                bool(_dynamic_prompts_default("is_combinatorial", False)),
                label=_label("Combinatorial generation", "组合生成"),
                elem_id=_forge_elem(prefix, "dynamic_prompts_is_combinatorial"),
            ),
        )
        store(
            "max_generations",
            gr.Slider(
                0,
                1000,
                value=int(_dynamic_prompts_default("max_generations", 0) or 0),
                step=1,
                label=_label(
                    "Max generations (0 = all combinations - the batch count value is ignored)",
                    "最大生成数（0 = 所有组合数 - 忽略批次数值）",
                ),
                elem_id=_forge_elem(prefix, "dynamic_prompts_max_generations"),
            ),
        )
        store(
            "combinatorial_batches",
            gr.Slider(
                1,
                10,
                value=int(_dynamic_prompts_default("combinatorial_batches", 1) or 1),
                step=1,
                label=_label("Combinatorial batches", "组合批次数"),
                elem_id=_forge_elem(prefix, "dynamic_prompts_combinatorial_batches"),
            ),
        )
        with gr.Accordion(_label("Prompt Magic", "魔法提示词"), open=False, elem_id=_forge_elem(prefix, "dynamic_prompts_magic")):
            store(
                "is_magic_prompt",
                gr.Checkbox(
                    bool(_dynamic_prompts_default("is_magic_prompt", False)),
                    label=_label("Magic prompt", "魔法提示词"),
                    elem_id=_forge_elem(prefix, "dynamic_prompts_is_magic_prompt"),
                ),
            )
            with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                store(
                    "magic_prompt_length",
                    gr.Slider(
                        30,
                        300,
                        value=int(_dynamic_prompts_default("magic_prompt_length", 100) or 100),
                        step=10,
                        label=_label("Max magic prompt length", "最大魔法提示词长度"),
                        elem_id=_forge_elem(prefix, "dynamic_prompts_magic_prompt_length"),
                    ),
                )
                store(
                    "magic_temp_value",
                    gr.Slider(
                        0.1,
                        3.0,
                        value=float(_dynamic_prompts_default("magic_temp_value", 0.7) or 0.7),
                        step=0.1,
                        label=_label("Magic prompt creativity", "魔法提示词创造性"),
                        elem_id=_forge_elem(prefix, "dynamic_prompts_magic_temp_value"),
                    ),
                )
            store(
                "magic_model",
                gr.Dropdown(
                    [str(_dynamic_prompts_default("magic_model", "") or "")],
                    value=str(_dynamic_prompts_default("magic_model", "") or ""),
                    label=_label("Magic prompt model", "魔法提示词模型"),
                    allow_custom_value=True,
                    elem_id=_forge_elem(prefix, "dynamic_prompts_magic_model"),
                ),
            )
            store(
                "magic_blocklist_regex",
                gr.Textbox(
                    value=str(_dynamic_prompts_default("magic_blocklist_regex", "") or ""),
                    label=_label("Magic prompt blocklist regex", "魔法提示词屏蔽正则"),
                    lines=1,
                    elem_id=_forge_elem(prefix, "dynamic_prompts_magic_blocklist_regex"),
                ),
            )
            store(
                "is_feeling_lucky",
                gr.Checkbox(
                    bool(_dynamic_prompts_default("is_feeling_lucky", False)),
                    label=_label("I'm feeling lucky", "手气不错"),
                    elem_id=_forge_elem(prefix, "dynamic_prompts_is_feeling_lucky"),
                ),
            )
            store(
                "is_attention_grabber",
                gr.Checkbox(
                    bool(_dynamic_prompts_default("is_attention_grabber", False)),
                    label=_label("Attention grabber", "注意力增强"),
                    elem_id=_forge_elem(prefix, "dynamic_prompts_is_attention_grabber"),
                ),
            )
            with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                store(
                    "min_attention",
                    gr.Slider(
                        -1.0,
                        2.0,
                        value=float(_dynamic_prompts_default("min_attention", 1.1) or 1.1),
                        step=0.1,
                        label=_label("Minimum attention", "最小注意力"),
                        elem_id=_forge_elem(prefix, "dynamic_prompts_min_attention"),
                    ),
                )
                store(
                    "max_attention",
                    gr.Slider(
                        -1.0,
                        2.0,
                        value=float(_dynamic_prompts_default("max_attention", 1.5) or 1.5),
                        step=0.1,
                        label=_label("Maximum attention", "最大注意力"),
                        elem_id=_forge_elem(prefix, "dynamic_prompts_max_attention"),
                    ),
                )
            store(
                "disable_negative_prompt",
                gr.Checkbox(
                    bool(_dynamic_prompts_default("disable_negative_prompt", True)),
                    label=_label("Don't apply to negative prompts", "不应用到反向提示词"),
                    elem_id=_forge_elem(prefix, "dynamic_prompts_disable_negative_prompt"),
                ),
            )
        with gr.Accordion(_label("Need help?", "需要帮助?"), open=False, elem_id=_forge_elem(prefix, "dynamic_prompts_help")):
            gr.HTML(_dynamic_prompts_help_html(), elem_id=_forge_elem(prefix, "dynamic_prompts_help_html"))
        with gr.Accordion(_label("Jinja2 templates", "Jinja2 模板"), open=False, elem_id=_forge_elem(prefix, "dynamic_prompts_jinja")):
            store(
                "enable_jinja_templates",
                gr.Checkbox(
                    bool(_dynamic_prompts_default("enable_jinja_templates", False)),
                    label=_label("Enable Jinja2 templates", "启用 Jinja2 模板"),
                    elem_id=_forge_elem(prefix, "dynamic_prompts_enable_jinja_templates"),
                ),
            )
            with gr.Accordion(_label("Help for Jinja2 templates", "Jinja2 模板帮助"), open=False, elem_id=_forge_elem(prefix, "dynamic_prompts_jinja_help")):
                gr.HTML(_dynamic_prompts_jinja_help_html(), elem_id=_forge_elem(prefix, "dynamic_prompts_jinja_help_html"))
        with gr.Accordion(_label("Advanced options", "高级选项"), open=False, elem_id=_forge_elem(prefix, "dynamic_prompts_advanced")):
            store(
                "unlink_seed_from_prompt",
                gr.Checkbox(
                    bool(_dynamic_prompts_default("unlink_seed_from_prompt", False)),
                    label=_label("Unlink seed from prompt", "取消种子与提示词绑定"),
                    elem_id=_forge_elem(prefix, "dynamic_prompts_unlink_seed_from_prompt"),
                ),
            )
            store(
                "use_fixed_seed",
                gr.Checkbox(
                    bool(_dynamic_prompts_default("use_fixed_seed", False)),
                    label=_label("Fixed seed", "固定种子"),
                    elem_id=_forge_elem(prefix, "dynamic_prompts_use_fixed_seed"),
                ),
            )
            store(
                "no_image_generation",
                gr.Checkbox(
                    bool(_dynamic_prompts_default("no_image_generation", False)),
                    label=_label("Don't generate images", "不生成图片"),
                    elem_id=_forge_elem(prefix, "dynamic_prompts_no_image_generation"),
                ),
            )


def _regional_prompter_default(field_name: str, fallback: object = None) -> object:
    return REGIONAL_PROMPTER_ARG_DEFAULTS.get(field_name, fallback)


def _regional_prompter_controls(controls: dict[str, gr.components.Component]) -> list[gr.components.Component]:
    return [controls[_regional_prompter_control_key(field_name)] for field_name in REGIONAL_PROMPTER_ARG_KEYS]


def _create_regional_prompter_controls(controls: dict[str, gr.components.Component], prefix: str) -> None:
    def store(field_name: str, component: gr.components.Component) -> gr.components.Component:
        controls[_regional_prompter_control_key(field_name)] = component
        return component

    with InputAccordion(
        bool(_regional_prompter_default("active", False)),
        label=_label("Regional Prompter", "区域提示词"),
        visible=regional_prompter_available(),
        elem_id=_forge_elem(prefix, "regional_prompter"),
        elem_classes=["forge-neo-integrated-accordion", "forge-neo-regional-prompter"],
    ) as regional_prompter_active:
        store("active", regional_prompter_active)
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "debug",
                gr.Checkbox(
                    bool(_regional_prompter_default("debug", False)),
                    label=_label("Debug", "调试"),
                    elem_id=_forge_elem(prefix, "regional_prompter_debug"),
                ),
            )
            store(
                "calculation_mode",
                gr.Radio(
                    _localized_value_choices([("Attention", "Attention"), ("Latent", "Latent")]),
                    value=str(_regional_prompter_default("calculation_mode", "Attention")),
                    label=_label("Generation Mode", "Generation Mode"),
                    elem_id=_forge_elem(prefix, "regional_prompter_calculation_mode"),
                ),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "rp_selected_tab",
                gr.Radio(
                    _localized_value_choices([("Matrix", "矩阵"), ("Mask", "蒙版"), ("Prompt", "提示词")]),
                    value=str(_regional_prompter_default("rp_selected_tab", "Matrix")),
                    label=_label("Mode", "模式"),
                    visible=False,
                    elem_id=_forge_elem(prefix, "regional_prompter_selected_tab"),
                ),
            )
            store(
                "matrix_mode",
                gr.Dropdown(
                    ["Columns", "Rows", "Horizontal", "Vertical", "Random"],
                    value=str(_regional_prompter_default("matrix_mode", "Columns")),
                    label=_label("Matrix", "矩阵"),
                    visible=False,
                    elem_id=_forge_elem(prefix, "regional_prompter_matrix_mode"),
                ),
            )
            store(
                "mask_mode",
                gr.Dropdown(
                    ["Mask"],
                    value=str(_regional_prompter_default("mask_mode", "Mask")),
                    label=_label("Mask", "蒙版"),
                    visible=False,
                    elem_id=_forge_elem(prefix, "regional_prompter_mask_mode"),
                ),
            )
            store(
                "prompt_mode",
                gr.Dropdown(
                    ["Prompt", "Prompt-Ex"],
                    value=str(_regional_prompter_default("prompt_mode", "Prompt")),
                    label=_label("Prompt", "提示词"),
                    visible=False,
                    elem_id=_forge_elem(prefix, "regional_prompter_prompt_mode"),
                ),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "ratios",
                gr.Textbox(
                    value=str(_regional_prompter_default("ratios", "1,1")),
                    label=_label("Ratios", "区域比例"),
                    lines=1,
                    visible=False,
                    elem_id=_forge_elem(prefix, "regional_prompter_ratios"),
                ),
            )
            store(
                "base_ratios",
                gr.Textbox(
                    value=str(_regional_prompter_default("base_ratios", "0.2")),
                    label=_label("Base ratios", "基础比例"),
                    lines=1,
                    visible=False,
                    elem_id=_forge_elem(prefix, "regional_prompter_base_ratios"),
                ),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "use_base",
                gr.Checkbox(
                    bool(_regional_prompter_default("use_base", False)),
                    label=_label("Use base", "使用基础"),
                    visible=False,
                    elem_id=_forge_elem(prefix, "regional_prompter_use_base"),
                ),
            )
            store(
                "use_common",
                gr.Checkbox(
                    bool(_regional_prompter_default("use_common", False)),
                    label=_label("Use common", "使用通用"),
                    visible=False,
                    elem_id=_forge_elem(prefix, "regional_prompter_use_common"),
                ),
            )
            store(
                "use_common_negative",
                gr.Checkbox(
                    bool(_regional_prompter_default("use_common_negative", False)),
                    label=_label("Use neg-common", "使用反向通用"),
                    visible=False,
                    elem_id=_forge_elem(prefix, "regional_prompter_use_common_negative"),
                ),
            )
            store(
                "flip",
                gr.Checkbox(
                    bool(_regional_prompter_default("flip", False)),
                    label=_label("Flip", "翻转"),
                    visible=False,
                    elem_id=_forge_elem(prefix, "regional_prompter_flip"),
                ),
            )
        store(
            "options",
            gr.CheckboxGroup(
                choices=list(REGIONAL_PROMPTER_OPTION_CHOICES),
                value=list(_regional_prompter_default("options", [])),
                label=_label("Options", "选项"),
                visible=False,
                elem_id=_forge_elem(prefix, "regional_prompter_options"),
            ),
        )
        with gr.Accordion(_label("LoRA / Mask", "LoRA / 蒙版"), open=False, visible=False, elem_id=_forge_elem(prefix, "regional_prompter_lora_mask")):
            with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                store(
                    "lora_negative_textencoder",
                    gr.Textbox(
                        value=str(_regional_prompter_default("lora_negative_textencoder", "0")),
                        label=_label("LoRA text encoder", "LoRA 文本编码器"),
                        lines=1,
                        elem_id=_forge_elem(prefix, "regional_prompter_lora_negative_textencoder"),
                    ),
                )
                store(
                    "lora_negative_unet",
                    gr.Textbox(
                        value=str(_regional_prompter_default("lora_negative_unet", "0")),
                        label=_label("LoRA U-Net", "LoRA U-Net"),
                        lines=1,
                        elem_id=_forge_elem(prefix, "regional_prompter_lora_negative_unet"),
                    ),
                )
            with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                store(
                    "threshold",
                    gr.Textbox(
                        value=str(_regional_prompter_default("threshold", "0.4")),
                        label=_label("Threshold", "阈值"),
                        lines=1,
                        elem_id=_forge_elem(prefix, "regional_prompter_threshold"),
                    ),
                )
                store(
                    "mask",
                    gr.Textbox(
                        value=str(_regional_prompter_default("mask", "")),
                        label=_label("Mask", "蒙版"),
                        lines=1,
                        elem_id=_forge_elem(prefix, "regional_prompter_mask"),
                    ),
                )
            with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                store(
                    "lora_stop_step",
                    gr.Textbox(
                        value=str(_regional_prompter_default("lora_stop_step", "0")),
                        label=_label("LoRA stop", "LoRA 停止步"),
                        lines=1,
                        elem_id=_forge_elem(prefix, "regional_prompter_lora_stop_step"),
                    ),
                )
                store(
                    "lora_hires_stop_step",
                    gr.Textbox(
                        value=str(_regional_prompter_default("lora_hires_stop_step", "0")),
                        label=_label("LoRA hires stop", "LoRA 高清停止步"),
                        lines=1,
                        elem_id=_forge_elem(prefix, "regional_prompter_lora_hires_stop_step"),
                    ),
                )

        gr.HTML(
            _regional_prompter_link(REGIONAL_PROMPTER_GUIDE_URL, "Usage guide", "使用指南"),
            elem_id=_forge_elem(prefix, "regional_prompter_usage_guide"),
            elem_classes=["forge-neo-muted-note", "forge-neo-regional-prompter-guide"],
        )
        store("rp_selected_tab", gr.State(str(_regional_prompter_default("rp_selected_tab", "Matrix"))))
        base_ratios = store(
            "base_ratios",
            gr.Textbox(
                value=str(_regional_prompter_default("base_ratios", "0.2")),
                label=_label("Base Ratio", "基础比率"),
                lines=1,
                elem_id=_forge_elem(prefix, "regional_prompter_base_ratios_native"),
            ),
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store(
                "use_base",
                gr.Checkbox(
                    bool(_regional_prompter_default("use_base", False)),
                    label=_label("Use base prompt", "使用基础提示词"),
                    elem_id=_forge_elem(prefix, "regional_prompter_use_base_native"),
                ),
            )
            store(
                "use_common",
                gr.Checkbox(
                    bool(_regional_prompter_default("use_common", False)),
                    label=_label("Use common prompt", "使用常见提示词"),
                    elem_id=_forge_elem(prefix, "regional_prompter_use_common_native"),
                ),
            )
            store(
                "use_common_negative",
                gr.Checkbox(
                    bool(_regional_prompter_default("use_common_negative", False)),
                    label=_label("Use common negative prompt", "使用常见反面提示词"),
                    elem_id=_forge_elem(prefix, "regional_prompter_use_common_negative_native"),
                ),
            )
        with gr.Tabs(elem_id=_forge_elem(prefix, "regional_prompter_mode_tabs"), elem_classes=["forge-neo-mode-tabs", "forge-neo-regional-prompter-tabs"]):
            with gr.Tab(_label("Matrix", "矩阵"), elem_id=_forge_elem(prefix, "regional_prompter_matrix_tab")) as matrix_tab:
                gr.HTML(
                    _regional_prompter_link(REGIONAL_PROMPTER_MATRIX_URL, "Matrix mode guide", "矩阵模式指南"),
                    elem_id=_forge_elem(prefix, "regional_prompter_matrix_guide"),
                    elem_classes=["forge-neo-muted-note", "forge-neo-regional-prompter-guide"],
                )
                with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                    matrix_mode = store(
                        "matrix_mode",
                        gr.Radio(
                            _localized_value_choices([("Columns", "Columns"), ("Rows", "Rows"), ("Random", "Random")]),
                            value=str(_regional_prompter_default("matrix_mode", "Columns")),
                            label=_label("Main Splitting", "主分割方法"),
                            elem_id=_forge_elem(prefix, "regional_prompter_matrix_mode_native"),
                        ),
                    )
                    ratios = store(
                        "ratios",
                        gr.Textbox(
                            value=str(_regional_prompter_default("ratios", "1,1")),
                            label=_label("Divide Ratio", "分割比率"),
                            lines=2,
                            max_lines=4,
                            elem_id=_forge_elem(prefix, "regional_prompter_ratios_native"),
                        ),
                    )
                with gr.Row(elem_classes=["forge-neo-integrated-row", "forge-neo-regional-prompter-matrix-row"]):
                    with gr.Column(scale=5):
                        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                            matrix_width = gr.Slider(64, 2048, value=512, step=8, label=_label("Width", "宽度"), elem_id=_forge_elem(prefix, "regional_prompter_matrix_width"))
                            matrix_height = gr.Slider(64, 2048, value=512, step=8, label=_label("Height", "高度"), elem_id=_forge_elem(prefix, "regional_prompter_matrix_height"))
                        make_template = gr.Button(_label("Visualize and make template", "可视化并制作模板"), elem_id=_forge_elem(prefix, "regional_prompter_make_template"))
                        matrix_template = gr.Textbox(label=_label("Template", "模板"), interactive=True, lines=3, elem_id=_forge_elem(prefix, "regional_prompter_matrix_template"))
                        flip = store(
                            "flip",
                            gr.Checkbox(
                                bool(_regional_prompter_default("flip", False)),
                                label='flip "," and ";"',
                                elem_id=_forge_elem(prefix, "regional_prompter_flip_native"),
                            ),
                        )
                        matrix_overlay = gr.Slider(0.0, 1.0, value=0.5, step=0.1, label="Overlay Ratio", elem_id=_forge_elem(prefix, "regional_prompter_matrix_overlay"))
                    with gr.Column(scale=4):
                        matrix_preview = gr.Image(type="pil", show_label=False, interactive=False, height=320, elem_id=_forge_elem(prefix, "regional_prompter_matrix_preview"))
            with gr.Tab(_label("Mask", "蒙版"), elem_id=_forge_elem(prefix, "regional_prompter_mask_tab")) as mask_tab:
                gr.HTML(
                    _regional_prompter_link(REGIONAL_PROMPTER_MASK_URL, "Inpaint+ mode guide", "Inpaint+ 模式指南"),
                    elem_id=_forge_elem(prefix, "regional_prompter_mask_guide"),
                    elem_classes=["forge-neo-muted-note", "forge-neo-regional-prompter-guide"],
                )
                store("mask_mode", gr.Radio(["Mask"], value=str(_regional_prompter_default("mask_mode", "Mask")), label=_label("Mask mode", "蒙版模式"), elem_id=_forge_elem(prefix, "regional_prompter_mask_mode_native")))
                with gr.Row(elem_classes=["forge-neo-integrated-row", "forge-neo-regional-prompter-mask-row"]):
                    regional_mask_canvas = ForgeCanvas(
                        height=512,
                        scribble_color="#ff1493",
                        scribble_width=24,
                        elem_id=_forge_elem(prefix, "regional_prompter_mask_canvas"),
                        elem_classes=["forge-neo-img2img-input", "forge-neo-regional-prompter-mask-canvas"],
                    )
                with gr.Row(elem_classes=["forge-neo-integrated-row", "forge-neo-regional-prompter-mask-tools"]):
                    regional_mask_region = gr.Slider(-1, 16, value=1, step=1, label=_label("Mask Paint", "蒙版画笔"), elem_id=_forge_elem(prefix, "regional_prompter_mask_region"))
                    regional_mask_width = gr.Slider(64, 2048, value=512, step=8, label=_label("Inpaint+ Width", "Inpaint+ 宽度"), elem_id=_forge_elem(prefix, "regional_prompter_mask_width"))
                    regional_mask_height = gr.Slider(64, 2048, value=512, step=8, label=_label("Inpaint+ Height", "Inpaint+ 高度"), elem_id=_forge_elem(prefix, "regional_prompter_mask_height"))
                    regional_mask_create = gr.Button(_label("Create mask canvas", "创建空白蒙版"), elem_id=_forge_elem(prefix, "regional_prompter_mask_create"))
                store("mask", regional_mask_canvas.foreground)
            with gr.Tab(_label("Prompt", "提示词"), elem_id=_forge_elem(prefix, "regional_prompter_prompt_tab")) as prompt_tab:
                gr.HTML(
                    _regional_prompter_link(REGIONAL_PROMPTER_PROMPT_URL, "Prompt mode guide", "提示词模式指南"),
                    elem_id=_forge_elem(prefix, "regional_prompter_prompt_guide"),
                    elem_classes=["forge-neo-muted-note", "forge-neo-regional-prompter-guide"],
                )
                with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                    store("prompt_mode", gr.Radio(["Prompt", "Prompt-Ex"], value=str(_regional_prompter_default("prompt_mode", "Prompt")), label=_label("Prompt mode", "提示词模式"), elem_id=_forge_elem(prefix, "regional_prompter_prompt_mode_native")))
                    store("threshold", gr.Textbox(value=str(_regional_prompter_default("threshold", "0.4")), label=_label("Threshold", "阈值"), lines=1, elem_id=_forge_elem(prefix, "regional_prompter_threshold_native")))
        with gr.Accordion(_label("Presets", "预设"), open=False, elem_id=_forge_elem(prefix, "regional_prompter_presets")):
            with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                regional_preset = gr.Dropdown(list(REGIONAL_PROMPTER_PRESETS.keys()), label=_label("Presets", "预设"), elem_id=_forge_elem(prefix, "regional_prompter_preset_select"))
                regional_preset_apply = gr.Button(_label("Apply Presets", "应用预设"), variant="primary", elem_id=_forge_elem(prefix, "regional_prompter_preset_apply"))
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            store("lora_stop_step", gr.Textbox(value=str(_regional_prompter_default("lora_stop_step", "0")), label=_label("LoRA stop step", "LoRA 停止步"), lines=1, elem_id=_forge_elem(prefix, "regional_prompter_lora_stop_step_native")))
            store("lora_hires_stop_step", gr.Textbox(value=str(_regional_prompter_default("lora_hires_stop_step", "0")), label=_label("LoRA Hires stop step", "LoRA 高清停止步"), lines=1, elem_id=_forge_elem(prefix, "regional_prompter_lora_hires_stop_step_native")))
            store("lora_negative_textencoder", gr.Textbox(value=str(_regional_prompter_default("lora_negative_textencoder", "0")), label=_label("LoRA in negative textencoder", "反向提示词中 LoRA 文本编码器权重"), lines=1, elem_id=_forge_elem(prefix, "regional_prompter_lora_negative_textencoder_native")))
            store("lora_negative_unet", gr.Textbox(value=str(_regional_prompter_default("lora_negative_unet", "0")), label=_label("LoRA in negative U-net", "反向提示词中 LoRA 的 U-net 权重"), lines=1, elem_id=_forge_elem(prefix, "regional_prompter_lora_negative_unet_native")))
        options = store("options", gr.CheckboxGroup(choices=list(REGIONAL_PROMPTER_OPTION_CHOICES), value=list(_regional_prompter_default("options", [])), label=_label("Options", "选项"), elem_id=_forge_elem(prefix, "regional_prompter_options_native")))

        matrix_tab.select(lambda: "Matrix", outputs=[controls["regional_prompter_rp_selected_tab"]], queue=False)
        mask_tab.select(lambda: "Mask", outputs=[controls["regional_prompter_rp_selected_tab"]], queue=False)
        prompt_tab.select(lambda: "Prompt", outputs=[controls["regional_prompter_rp_selected_tab"]], queue=False)
        regional_mask_create.click(
            _create_regional_prompter_mask_canvas,
            inputs=[regional_mask_height, regional_mask_width],
            outputs=[regional_mask_canvas.background, regional_mask_canvas.foreground],
            show_progress=False,
            queue=False,
        )
        make_template.click(
            _regional_prompter_make_matrix_template,
            inputs=[ratios, matrix_mode, controls["regional_prompter_use_common"], controls["regional_prompter_use_base"], flip, matrix_height, matrix_width, options, matrix_overlay],
            outputs=[matrix_preview, matrix_template],
            show_progress=False,
        )
        regional_preset_apply.click(
            _regional_prompter_apply_preset,
            inputs=[regional_preset],
            outputs=[
                controls["regional_prompter_rp_selected_tab"],
                matrix_mode,
                controls["regional_prompter_mask_mode"],
                controls["regional_prompter_prompt_mode"],
                ratios,
                base_ratios,
                controls["regional_prompter_use_base"],
                controls["regional_prompter_use_common"],
                controls["regional_prompter_use_common_negative"],
                controls["regional_prompter_calculation_mode"],
                options,
            ],
            show_progress=False,
        )


def _create_integrated_controls(
    prefix: str,
    *,
    is_img2img: bool,
    state_value: Mapping[str, object],
    prompt: gr.components.Component,
    width: gr.components.Component,
    height: gr.components.Component,
    settings_value: Mapping[str, object] | None = None,
    forge_couple_bridge: dict[str, dict[str, object]] | None = None,
    forge_couple_source_image: gr.components.Component | None = None,
) -> dict[str, gr.components.Component]:
    controls: dict[str, gr.components.Component] = {}
    model_choices = initial_model_choices("klein")
    controlnet_models = _controlnet_model_choices(model_choices)
    modulated_clip_choices = _modulated_guidance_clip_choices(model_choices)
    modulated_clip_value = _default_modulated_guidance_clip(model_choices)
    controlnet_visible = _builtin_ui_available(BUILTIN_CONTROLNET_EXTENSION, "scripts/controlnet.py")
    multidiffusion_visible = _builtin_ui_available(BUILTIN_MULTIDIFFUSION_EXTENSION)
    never_oom_visible = _builtin_ui_available(BUILTIN_NEVER_OOM_EXTENSION, "scripts/forge_never_oom.py")
    image_stitch_visible = _builtin_ui_available(BUILTIN_IMAGE_STITCH_EXTENSION, "scripts/image_stitch.py")
    spectrum_visible = _builtin_ui_available(BUILTIN_SPECTRUM_EXTENSION, "scripts/spectrum.py")
    torch_compile_visible = _builtin_ui_available(BUILTIN_TORCH_COMPILE_EXTENSION)
    modulated_guidance_visible = _builtin_ui_available(BUILTIN_MODULATED_GUIDANCE_EXTENSION)
    _create_adetailer_controls(controls, prefix, is_img2img=is_img2img, model_choices=model_choices)
    _create_dynamic_prompts_controls(controls, prefix)
    _create_regional_prompter_controls(controls, prefix)
    _create_forge_couple_controls(
        controls,
        prefix,
        is_img2img=is_img2img,
        state_value=state_value,
        prompt=prompt,
        width=width,
        height=height,
        settings_value=settings_value,
        source_image=forge_couple_source_image,
        bridge=forge_couple_bridge,
    )
    with gr.Accordion(_label("ControlNet Integrated", "ControlNet 集成"), open=False, visible=controlnet_visible, elem_id=_forge_elem(prefix, "controlnet"), elem_classes=["forge-neo-integrated-accordion"]):
        with gr.Tabs(elem_id=_forge_elem(prefix, "controlnet_tabs"), elem_classes=["forge-neo-mode-tabs", "forge-neo-controlnet-tabs"]):
            controlnet_units = []
            for unit_index in range(CONTROLNET_UNIT_COUNT):
                with gr.Tab(_label(f"ControlNet Unit {unit_index + 1}", f"ControlNet 单元 {unit_index + 1}"), elem_id=_forge_elem(prefix, f"controlnet_unit_{unit_index + 1}")):
                    independent_image = None
                    with gr.Group(
                        visible=not is_img2img,
                        elem_classes=["forge-neo-controlnet-image-panel"],
                    ) as image_upload_panel:
                        with gr.Row(elem_classes=["forge-neo-controlnet-image-row"], equal_height=True):
                            with gr.Group(elem_classes=["forge-neo-controlnet-input-group"]):
                                control_canvas = ForgeCanvas(
                                    height=384,
                                    scribble_color="#ff0000",
                                    scribble_color_fixed=True,
                                    elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "image")),
                                    elem_classes=["forge-neo-img2img-input", "forge-neo-controlnet-image-input"],
                                )
                            with gr.Group(visible=False, elem_classes=["forge-neo-controlnet-preview-group"]) as generated_image_group:
                                generated_canvas = ForgeCanvas(
                                    height=384,
                                    no_scribbles=True,
                                    no_upload=True,
                                    elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "generated_image")),
                                    elem_classes=["forge-neo-img2img-input", "forge-neo-controlnet-generated-image"],
                                )
                            with gr.Group(visible=False, elem_classes=["forge-neo-controlnet-mask-group"]) as mask_image_group:
                                mask_canvas = ForgeCanvas(
                                    height=384,
                                    scribble_color="#FFFFFF",
                                    scribble_color_fixed=True,
                                    scribble_width=1,
                                    scribble_alpha_fixed=True,
                                    scribble_softness_fixed=True,
                                    elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "mask_image")),
                                    elem_classes=["forge-neo-img2img-input", "forge-neo-controlnet-mask-image"],
                                )
                        with gr.Accordion(
                            _label("Open New Canvas", "新建画布"),
                            open=True,
                            visible=False,
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "create_canvas")),
                            elem_classes=["forge-neo-controlnet-create-canvas"],
                        ) as create_canvas:
                            canvas_width = gr.Slider(
                                256,
                                1024,
                                value=512,
                                step=64,
                                label=_label("New Canvas Width", "新画布宽度"),
                                elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "canvas_width")),
                            )
                            canvas_height = gr.Slider(
                                256,
                                1024,
                                value=512,
                                step=64,
                                label=_label("New Canvas Height", "新画布高度"),
                                elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "canvas_height")),
                            )
                            with gr.Row(elem_classes=["forge-neo-controlnet-create-actions"]):
                                canvas_create = gr.Button(
                                    _label("Create New Canvas", "创建新画布"),
                                    elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "canvas_create")),
                                )
                                canvas_cancel = gr.Button(
                                    _label("Cancel", "取消"),
                                    elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "canvas_cancel")),
                                )
                        with gr.Row(elem_classes=["forge-neo-controlnet-image-controls"]):
                            gr.HTML(
                                f"<p>{html_lib.escape(_label('Set the preprocessor to [invert] if your image has white background and black lines.', '如果图片是白底黑线，请将预处理器设为 [invert]。'))}</p>",
                                elem_classes=["forge-neo-controlnet-invert-warning"],
                            )
                            open_new_canvas = _tool_button(
                                "📝",
                                elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "open_new_canvas")),
                            )
                            send_dimensions = _tool_button(
                                "⤴",
                                elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "send_dimensions")),
                            )
                    image = control_canvas.background
                    mask = control_canvas.foreground
                    with gr.Row(elem_classes=["forge-neo-integrated-row", "forge-neo-controlnet-unit-options"]):
                        enabled = gr.Checkbox(
                            False,
                            label=_label("Enable", "启用"),
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "enable")),
                        )
                        pixel_perfect = gr.Checkbox(
                            False,
                            label=_label("Pixel Perfect", "像素精确"),
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "pixel_perfect")),
                        )
                        if is_img2img:
                            independent_image = gr.Checkbox(
                                False,
                                label=_label("Upload independent control image", "上传独立控制图"),
                                elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "independent_image")),
                            )
                        allow_preview = gr.Checkbox(
                            False,
                            label=_label("Allow Preview", "允许预览"),
                            visible=not is_img2img,
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "allow_preview")),
                        )
                        use_mask = gr.Checkbox(
                            False,
                            label=_label("Use Mask", "使用蒙版"),
                            visible=not is_img2img,
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "use_mask")),
                        )
                        preview_as_input = gr.Checkbox(
                            False,
                            label=_label("Preview as Input", "预览作为输入"),
                            visible=False,
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "preview_as_input")),
                        )
                    control_type = gr.Radio(
                        _localized_value_choices(CONTROLNET_TYPES),
                        value="All",
                        label=_label("Control Type", "控制类型"),
                        elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "type")),
                    )
                    with gr.Row(elem_classes=["forge-neo-integrated-row", "forge-neo-controlnet-preprocessor-row"]):
                        module = gr.Dropdown(
                            _controlnet_preprocessor_choices("All"),
                            value="None",
                            label=_label("Preprocessor", "预处理器"),
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "module")),
                        )
                        trigger_preprocessor = _tool_button(
                            "💥",
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "trigger_preprocessor")),
                            visible=not is_img2img,
                        )
                        model = gr.Dropdown(
                            controlnet_models,
                            value="None",
                            label=_label("Model", "模型"),
                            allow_custom_value=True,
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "model")),
                        )
                        refresh_models = _tool_button(
                            "🔄",
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "refresh_models")),
                        )
                    weight = gr.Slider(
                        0.0,
                        2.0,
                        value=1.0,
                        step=0.05,
                        label=_label("Control Weight", "控制权重"),
                        elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "weight")),
                    )
                    with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                        guidance_start = gr.Slider(
                            0.0,
                            1.0,
                            value=0.0,
                            step=0.01,
                            label=_label("Guidance Start", "起始步"),
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "guidance_start")),
                        )
                        guidance_end = gr.Slider(
                            0.0,
                            1.0,
                            value=1.0,
                            step=0.01,
                            label=_label("Guidance End", "结束步"),
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "guidance_end")),
                        )
                    with gr.Column(visible=False, elem_classes=["forge-neo-controlnet-advanced-sliders"]) as advanced_sliders:
                        processor_res = gr.Slider(
                            128,
                            2048,
                            value=512,
                            step=8,
                            label=_label("Preprocessor resolution", "预处理器分辨率"),
                            visible=False,
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "processor_res")),
                        )
                        threshold_a = gr.Slider(
                            0.0,
                            1.0,
                            value=0.5,
                            step=0.01,
                            label=_label("Threshold A", "阈值 A"),
                            visible=False,
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "threshold_a")),
                        )
                        threshold_b = gr.Slider(
                            0.0,
                            1.0,
                            value=0.5,
                            step=0.01,
                            label=_label("Threshold B", "阈值 B"),
                            visible=False,
                            elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "threshold_b")),
                        )
                    control_mode = gr.Radio(
                        _localized_value_choices(
                            [
                                ("Balanced", "平衡"),
                                ("My prompt is more important", "提示词优先"),
                                ("ControlNet is more important", "ControlNet 优先"),
                            ]
                        ),
                        value="Balanced",
                        label=_label("Control Mode", "控制模式"),
                        elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "control_mode")),
                    )
                    resize_mode = gr.Radio(
                        _localized_value_choices(
                            [
                                ("Just Resize", "仅缩放"),
                                ("Crop and Resize", "裁剪并缩放"),
                                ("Resize and Fill", "缩放并填充"),
                            ]
                        ),
                        value="Crop and Resize",
                        label=_label("Resize Mode", "缩放模式"),
                        visible=not is_img2img,
                        elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "resize_mode")),
                    )
                    hr_option = gr.Radio(
                        _localized_value_choices(
                            [
                                ("Both", "两阶段"),
                                ("Low res only", "仅低清"),
                                ("High res only", "仅高清"),
                            ]
                        ),
                        value="Both",
                        label=_label("Hires-Fix Option", "高清修复选项"),
                        elem_id=_forge_elem(prefix, _controlnet_suffix(unit_index, "hr_option")),
                    )
                    unit_controls = {
                        "image": image,
                        "mask": mask,
                        "image_upload_panel": image_upload_panel,
                        "independent_image": independent_image,
                        "generated_image_group": generated_image_group,
                        "generated_image": generated_canvas.background,
                        "mask_image_group": mask_image_group,
                        "mask_image": mask_canvas.background,
                        "mask_image_fg": mask_canvas.foreground,
                        "create_canvas": create_canvas,
                        "canvas_width": canvas_width,
                        "canvas_height": canvas_height,
                        "canvas_create": canvas_create,
                        "canvas_cancel": canvas_cancel,
                        "open_new_canvas": open_new_canvas,
                        "send_dimensions": send_dimensions,
                        "enabled": enabled,
                        "pixel_perfect": pixel_perfect,
                        "allow_preview": allow_preview,
                        "use_mask": use_mask,
                        "preview_as_input": preview_as_input,
                        "type": control_type,
                        "module": module,
                        "trigger_preprocessor": trigger_preprocessor,
                        "model": model,
                        "refresh_models": refresh_models,
                        "weight": weight,
                        "guidance_start": guidance_start,
                        "guidance_end": guidance_end,
                        "advanced_sliders": advanced_sliders,
                        "processor_res": processor_res,
                        "threshold_a": threshold_a,
                        "threshold_b": threshold_b,
                        "control_mode": control_mode,
                        "resize_mode": resize_mode,
                        "hr_option": hr_option,
                    }
                    controlnet_units.append(unit_controls)
            controls["controlnet_units"] = controlnet_units
            controls["controlnet_image"] = controlnet_units[0]["image"]
            controls["controlnet_enabled"] = controlnet_units[0]["enabled"]
            controls["controlnet_pixel_perfect"] = controlnet_units[0]["pixel_perfect"]
            controls["controlnet_type"] = controlnet_units[0]["type"]
            controls["controlnet_module"] = controlnet_units[0]["module"]
            controls["controlnet_model"] = controlnet_units[0]["model"]
            controls["controlnet_weight"] = controlnet_units[0]["weight"]
            controls["controlnet_guidance_start"] = controlnet_units[0]["guidance_start"]
            controls["controlnet_guidance_end"] = controlnet_units[0]["guidance_end"]
            controls["controlnet_control_mode"] = controlnet_units[0]["control_mode"]
            controls["controlnet_resize_mode"] = controlnet_units[0]["resize_mode"]
            controls["controlnet_hr_option"] = controlnet_units[0]["hr_option"]
    with InputAccordion(
        False,
        label=_label("MultiDiffusion Integrated", "MultiDiffusion Integrated"),
        elem_id=_forge_elem(prefix, "multidiffusion"),
        elem_classes=["forge-neo-integrated-accordion"],
        visible=is_img2img and multidiffusion_visible,
    ) as multidiffusion_enabled:
        controls["multidiffusion_enabled"] = multidiffusion_enabled
        controls["multidiffusion_method"] = gr.Radio(
            _localized_value_choices(
                [
                    ("MultiDiffusion", "MultiDiffusion"),
                    ("Mixture of Diffusers", "Mixture of Diffusers"),
                ]
            ),
            value="Mixture of Diffusers",
            label=_label("Method", "方法"),
            elem_id=_forge_elem(prefix, "multidiffusion_method"),
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row", "forge-neo-multidiffusion-size-row"]):
            controls["multidiffusion_tile_width"] = gr.Slider(
                256,
                2048,
                value=768,
                step=64,
                label=_label("Tile Width", "分块宽度"),
                elem_id=_forge_elem(prefix, "multidiffusion_tile_width"),
            )
            controls["multidiffusion_detect_size"] = _tool_button(
                "📐",
                elem_id=_forge_elem(prefix, "multidiffusion_detect_size"),
            )
            controls["multidiffusion_tile_height"] = gr.Slider(
                256,
                2048,
                value=768,
                step=64,
                label=_label("Tile Height", "分块高度"),
                elem_id=_forge_elem(prefix, "multidiffusion_tile_height"),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["multidiffusion_tile_overlap"] = gr.Slider(
                0,
                1024,
                value=64,
                step=16,
                label=_label("Tile Overlap", "分块重叠"),
                elem_id=_forge_elem(prefix, "multidiffusion_tile_overlap"),
            )
            controls["multidiffusion_tile_batch_size"] = gr.Slider(
                1,
                8,
                value=1,
                step=1,
                label=_label("Tile Batch Size", "分块批大小"),
                elem_id=_forge_elem(prefix, "multidiffusion_tile_batch_size"),
            )
    with gr.Accordion(_label("Never OOM Integrated", "Never OOM 集成"), open=False, visible=never_oom_visible, elem_id=_forge_elem(prefix, "never_oom"), elem_classes=["forge-neo-integrated-accordion"]):
        controls["never_oom_unet"] = gr.Checkbox(
            False,
            label=_label("Enabled for UNet (always offload)", "启用 UNet（始终卸载）"),
            elem_id=_forge_elem(prefix, "never_oom_unet"),
        )
        controls["never_oom_vae"] = gr.Checkbox(
            False,
            label=_label("Enabled for VAE (always tiled)", "启用 VAE（始终分块）"),
            elem_id=_forge_elem(prefix, "never_oom_vae"),
        )
    with InputAccordion(
        False,
        label=_label("ImageStitch Integrated", "多图拼接参考"),
        visible=image_stitch_visible,
        elem_id=_forge_elem(prefix, "image_stitch"),
        elem_classes=["forge-neo-integrated-accordion"],
    ) as image_stitch_enabled:
        controls["image_stitch_enabled"] = image_stitch_enabled
        controls["image_stitch_references"] = gr.Gallery(
            label=_label("Reference Image(s)", "参考图"),
            show_label=True,
            columns=2,
            rows=1,
            height=420,
            type="pil",
            interactive=True,
            object_fit="contain",
            sources=["upload", "clipboard"],
            elem_id=_forge_elem(prefix, "image_stitch_references"),
            elem_classes=["forge-neo-image-stitch-references"],
        )
        controls["image_stitch_max_dim"] = gr.Slider(
            0,
            2048,
            value=1024,
            step=256,
            label=_label("Maximum Side Length", "最大边长"),
            elem_id=_forge_elem(prefix, "image_stitch_max_dim"),
        )
    with gr.Accordion(_label("Batch Edit Generate", "🔄 批量编辑生成"), open=False, visible=image_stitch_visible, elem_id=_forge_elem(prefix, "batch_edit_generate"), elem_classes=["forge-neo-integrated-accordion"]):
        gr.Markdown(
            _label(
                "**For image-edit models** such as Flux-Kontext, Flux.2-Klein and Qwen-Image-Edit. The Gradio 6 shell now executes a local fallback pass that writes processed PNGs; native per-image model editing runs after the Forge backend adapter is connected.",
                "**仅适用于支持图像编辑的模型**，例如 Flux-Kontext、Flux.2-Klein、Qwen-Image-Edit。Gradio 6 外壳现在会执行本地兜底批处理并写出 PNG；真实逐图模型编辑等待 Forge 后端适配接入。",
            ),
            elem_classes=["forge-neo-muted-note"],
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["batch_edit_input_dir"] = gr.Textbox(
                label=_label("Input directory", "输入目录"),
                placeholder=_label("Example: D:/images/input", "例如: D:/images/input"),
                info=_label("Folder containing images to edit", "包含待处理图片的文件夹路径"),
                elem_id=_forge_elem(prefix, "batch_edit_input_dir"),
            )
            controls["batch_edit_output_dir"] = gr.Textbox(
                label=_label("Output directory", "输出目录"),
                placeholder=_label("Example: D:/images/output", "例如: D:/images/output"),
                info=_label("Where processed images will be saved", "处理后图片的保存位置"),
                elem_id=_forge_elem(prefix, "batch_edit_output_dir"),
            )
        controls["batch_edit_prompt"] = gr.Textbox(
            label=_label("Edit prompt", "编辑提示词"),
            placeholder=_label(
                "Example: turn into a 3D gray model, front/side/back views",
                "例如：改为3d灰模，生成三视图，正面，侧面，背面",
            ),
            lines=2,
            info=_label("Instruction applied to every image", "应用于所有图片的编辑指令"),
            elem_id=_forge_elem(prefix, "batch_edit_prompt"),
        )
        controls["batch_edit_negative_prompt"] = gr.Textbox(
            label=_label("Negative prompt (optional)", "负面提示词（可选）"),
            placeholder="low quality, blurry",
            lines=2,
            elem_id=_forge_elem(prefix, "batch_edit_negative_prompt"),
        )
        controls["batch_edit_max_edge_length"] = gr.Slider(
            0,
            2048,
            value=1024,
            step=64,
            label=_label("Target max edge", "目标最大边长"),
            info=_label(
                "0 keeps original size; dimensions are rounded to multiples of 16 for FLUX VAE.",
                "0 表示保持原图尺寸；输出尺寸会调整为 16 的倍数以适配 FLUX VAE。",
            ),
            elem_id=_forge_elem(prefix, "batch_edit_max_edge_length"),
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["batch_edit_steps"] = gr.Slider(
                1,
                150,
                value=30,
                step=1,
                label=_label("Sampling steps", "采样步数"),
                elem_id=_forge_elem(prefix, "batch_edit_steps"),
            )
            controls["batch_edit_cfg_scale"] = gr.Slider(
                1.0,
                30.0,
                value=7.5,
                step=0.5,
                label="CFG Scale",
                elem_id=_forge_elem(prefix, "batch_edit_cfg_scale"),
            )
            controls["batch_edit_seed"] = gr.Number(
                label=_label("Seed (-1 for random)", "种子 (-1为随机)"),
                value=-1,
                precision=0,
                elem_id=_forge_elem(prefix, "batch_edit_seed"),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["batch_edit_formats"] = gr.CheckboxGroup(
                label=_label("Supported file formats", "支持的文件格式"),
                choices=["png", "jpg", "jpeg", "webp", "bmp"],
                value=["png", "jpg", "jpeg", "webp", "bmp"],
                elem_id=_forge_elem(prefix, "batch_edit_formats"),
            )
            controls["batch_edit_sort_method"] = gr.Radio(
                label=_label("Processing order", "处理顺序"),
                choices=["文件名升序", "文件名降序", "修改时间升序", "修改时间降序"],
                value="文件名升序",
                elem_id=_forge_elem(prefix, "batch_edit_sort_method"),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["batch_edit_start"] = gr.Button(
                _label("Start batch processing", "开始批量处理"),
                variant="primary",
                elem_id=_forge_elem(prefix, "batch_edit_start"),
            )
            controls["batch_edit_stop"] = gr.Button(
                _label("Stop", "停止"),
                variant="stop",
                elem_id=_forge_elem(prefix, "batch_edit_stop"),
            )
        controls["batch_edit_progress"] = gr.Textbox(
            label=_label("Progress", "处理进度"),
            value=_label("Ready", "就绪"),
            interactive=False,
            elem_id=_forge_elem(prefix, "batch_edit_progress"),
        )
        controls["batch_edit_log"] = gr.Textbox(
            label=_label("Log", "处理日志"),
            value="",
            lines=10,
            max_lines=20,
            interactive=False,
            elem_id=_forge_elem(prefix, "batch_edit_log"),
        )
    with InputAccordion(
        False,
        label=_label("Spectrum Integrated", "Spectrum Integrated"),
        visible=spectrum_visible,
        elem_id=_forge_elem(prefix, "spectrum"),
        elem_classes=["forge-neo-integrated-accordion"],
    ) as spectrum_enabled:
        controls["spectrum_enabled"] = spectrum_enabled
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["spectrum_prediction_weighting"] = gr.Slider(
                0.0,
                1.0,
                value=0.25,
                step=0.05,
                label=_label("Prediction Weighting", "预测权重"),
                info=_label("higher = long-term trend ; lower = short-term changes", "更高偏长期趋势；更低偏短期变化"),
                elem_id=_forge_elem(prefix, "spectrum_prediction_weighting"),
            )
            controls["spectrum_polynomial_degree"] = gr.Slider(
                1,
                8,
                value=6,
                step=1,
                label=_label("Polynomial Degree", "多项式阶数"),
                info=_label("higher = complex & subtle patterns ; lower = stable & faster", "更高偏复杂细微模式；更低更稳定更快"),
                elem_id=_forge_elem(prefix, "spectrum_polynomial_degree"),
            )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["spectrum_regularization"] = gr.Slider(
                0.0,
                2.0,
                value=0.5,
                step=0.05,
                label=_label("Regularization", "正则化"),
                info=_label("higher = reduce overfitting ; lower = fit more data", "更高减少过拟合；更低拟合更多数据"),
                elem_id=_forge_elem(prefix, "spectrum_regularization"),
            )
            controls["spectrum_cache_window"] = gr.Slider(
                1,
                10,
                value=2,
                step=1,
                label=_label("Cache Window", "缓存窗口"),
                info=_label("higher = skip more steps ; lower = slower but more accurate", "更高跳过更多步；更低更慢但更精确"),
                elem_id=_forge_elem(prefix, "spectrum_cache_window"),
            )
        controls["spectrum_window_growth"] = gr.Slider(
            0.0,
            2.0,
            value=0.0,
            step=0.05,
            label=_label("Window Growth", "窗口增长"),
            info=_label(
                "higher = more speed & less accurate ; lower = more consistent accuracy but less speed gain",
                "更高速度更快但精度更低；更低精度更稳定但提速较少",
            ),
            elem_id=_forge_elem(prefix, "spectrum_window_growth"),
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["spectrum_warmup_steps"] = gr.Slider(
                0,
                20,
                value=6,
                step=1,
                label=_label("Warmup Steps", "预热步数"),
                info=_label("Run the full model before caching starts", "缓存开始前运行完整模型的步数"),
                elem_id=_forge_elem(prefix, "spectrum_warmup_steps"),
            )
            controls["spectrum_stop_caching_step"] = gr.Slider(
                0.0,
                1.0,
                value=0.9,
                step=0.05,
                label=_label("Stop Caching Step", "停止缓存步"),
                info=_label("Run the full model for the last few steps", "最后若干步重新运行完整模型"),
                elem_id=_forge_elem(prefix, "spectrum_stop_caching_step"),
            )
    with gr.Accordion(_label("Torch Compile Integrated", "Torch Compile 集成"), open=False, visible=torch_compile_visible, elem_id=_forge_elem(prefix, "torch_compile"), elem_classes=["forge-neo-integrated-accordion"]):
        controls["torch_compile_preset"] = gr.Dropdown(
            _localized_value_choices([("Automatic", "自动"), ("Disable", "禁用")]) + TORCH_COMPILE_PRESETS[2:],
            value="Automatic",
            label=_label("Preset", "预设"),
            elem_id=_forge_elem(prefix, "torch_compile_preset"),
        )
        gr.Markdown(
            _label(
                "Automatic keeps the current compile status. Other presets map to torch.compile modes.",
                "自动保持当前编译状态，其它预设对应 torch.compile 模式。",
            ),
            elem_classes=["forge-neo-muted-note"],
        )
    with InputAccordion(
        False,
        label=_label("Modulated Guidance Control", "调制引导控制"),
        visible=modulated_guidance_visible,
        elem_id=_forge_elem(prefix, "modulated_guidance"),
        elem_classes=["forge-neo-integrated-accordion"],
    ) as modulated_guidance_enabled:
        controls["modulated_guidance_enabled"] = modulated_guidance_enabled
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["modulated_guidance_clip"] = gr.Dropdown(
                modulated_clip_choices,
                value=modulated_clip_value,
                label="Clip-L",
                allow_custom_value=True,
                elem_id=_forge_elem(prefix, "modulated_guidance_clip"),
            )
            gr.Label(
                _label("Only for Anima", "仅用于 Anima"),
                show_label=False,
                elem_id=_forge_elem(prefix, "modulated_guidance_anima_note"),
            )
        controls["modulated_guidance_positive"] = gr.Textbox(
            label=_label("Positive Conditioning", "正向条件"),
            info=_label("Leave empty to use the first line of the main positive prompt", "留空则使用主正向提示词的第一行"),
            lines=3,
            max_lines=3,
            elem_id=_forge_elem(prefix, "modulated_guidance_positive"),
        )
        controls["modulated_guidance_negative"] = gr.Textbox(
            label=_label("Negative Conditioning", "负向条件"),
            info=_label("Leave empty to use the main negative prompt", "留空则使用主负向提示词"),
            lines=3,
            max_lines=3,
            elem_id=_forge_elem(prefix, "modulated_guidance_negative"),
        )
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["modulated_guidance_weight"] = gr.Slider(
                -20.0,
                20.0,
                value=3.0,
                step=0.5,
                label=_label("Weight", "权重"),
                elem_id=_forge_elem(prefix, "modulated_guidance_weight"),
            )
            controls["modulated_guidance_start_layer"] = gr.Slider(
                0,
                64,
                value=0,
                step=1,
                label=_label("Start Layer", "起始层"),
                elem_id=_forge_elem(prefix, "modulated_guidance_start_layer"),
            )
            controls["modulated_guidance_end_layer"] = gr.Slider(
                -1,
                64,
                value=-1,
                step=1,
                label=_label("End Layer", "结束层"),
                elem_id=_forge_elem(prefix, "modulated_guidance_end_layer"),
            )
    with InputAccordion(
        False,
        label=_label("SeedVarianceEnhancer Integrated", "种子变化增强集成"),
        elem_id=_forge_elem(prefix, "seed_variance"),
        elem_classes=["forge-neo-integrated-accordion"],
    ) as seed_variance_enabled:
        controls["seed_variance_enabled"] = seed_variance_enabled
        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
            controls["seed_variance_delta"] = gr.Number(
                value=1,
                precision=0,
                label=_label("Seed delta", "种子偏移"),
                elem_id=_forge_elem(prefix, "seed_variance_delta"),
            )
            controls["seed_variance_strength"] = gr.Slider(
                0.0,
                1.0,
                value=0.25,
                step=0.01,
                label=_label("Strength", "强度"),
                elem_id=_forge_elem(prefix, "seed_variance_strength"),
            )
    return controls


def _create_img2img_canvas_copy_controls(source_mode: str, source_canvas: ForgeCanvas, copy_buttons: list[tuple[gr.Button, str, object, object, str]]) -> None:
    with gr.Row(elem_id=f"forge_neo_img2img_copy_to_{source_mode}", elem_classes=["forge-neo-canvas-copy-row"]):
        for target_mode, button_en, button_cn, _label_en, _label_cn in IMG2IMG_CANVAS_COPY_TARGETS:
            is_current = target_mode == source_mode
            button = gr.Button(
                _label(button_en, button_cn),
                elem_id=f"forge_neo_img2img_copy_to_{target_mode}_from_{source_mode}",
                elem_classes=["forge-neo-canvas-copy-button"],
                interactive=not is_current,
                min_width=96,
            )
            if not is_current:
                copy_buttons.append((button, source_mode, source_canvas.background, source_canvas.foreground, target_mode))


def _create_style_controls(prefix: str, styles: list[str], apply_button: gr.Button | None = None) -> StyleControls:
    apply_style_btn = apply_button or _tool_button("📋", elem_id=_forge_elem(prefix, "style_apply"))
    with gr.Row(elem_classes=["forge-neo-style-selection-row"]):
        style_dropdown = gr.Dropdown(
            styles,
            value=[],
            label=_label("Styles", "样式"),
            show_label=False,
            container=False,
            multiselect=True,
            scale=5,
            min_width=120,
            elem_id=_forge_elem(prefix, "styles"),
        )
        edit_style_btn = _tool_button("🖌️", elem_id=_forge_elem(prefix, "style_edit"))
    with gr.Group(
        visible=False,
        elem_id=_forge_elem(prefix, "style_editor"),
        elem_classes=["forge-neo-profile-modal", "forge-neo-style-modal"],
    ) as style_editor:
        gr.HTML(
            '<div class="forge-neo-style-modal-backdrop"></div>',
            elem_id=_forge_elem(prefix, "style_modal_backdrop"),
            elem_classes=["forge-neo-style-modal-backdrop-host"],
        )
        with gr.Column(elem_classes=["forge-neo-profile-card", "forge-neo-style-modal-card"]):
            with gr.Row(elem_classes=["forge-neo-style-modal-heading"]):
                gr.Markdown(
                    _label(
                        "### Prompt Styles\nPrompt styles can insert reusable text into the prompt. Use `[prompt]` inside a style to replace it with the user's prompt; otherwise the style text is appended.",
                        "### 预设样式\n预设样式允许将整段自定义文本添加到提示词中。在文本框中使用 `[prompt]` 来调用预设样式中同名预设，在应用预设样式时，它将被用户的提示词所替代。否则预设样式文本会被添加到提示词末尾。",
                    ),
                    elem_classes=["forge-neo-style-modal-intro"],
                )
                style_close_top = gr.Button(
                    "×",
                    elem_id=_forge_elem(prefix, "style_close_top"),
                    elem_classes=["forge-neo-tool-button", "forge-neo-style-modal-close"],
                    min_width=34,
                )
            with gr.Row(elem_classes=["forge-neo-style-editor-row"]):
                style_edit_select = gr.Dropdown(
                    styles,
                    value=None,
                    label=_label("Styles", "样式"),
                    allow_custom_value=True,
                    elem_id=_forge_elem(prefix, "style_edit_select"),
                )
                style_refresh = _tool_button("↻", elem_id=_forge_elem(prefix, "style_refresh"))
                materialize_style_btn = _tool_button("📋", elem_id=_forge_elem(prefix, "style_apply_dialog"))
                copy_style_btn = _tool_button("📝", elem_id=_forge_elem(prefix, "style_copy"))
            style_prompt = gr.Textbox(label=_label("Prompt", "提示词"), lines=5, elem_id=_forge_elem(prefix, "edit_style_prompt"))
            style_negative = gr.Textbox(
                label=_label("Negative prompt", "反向提示词"),
                lines=4,
                elem_id=_forge_elem(prefix, "edit_style_negative"),
            )
            with gr.Row(elem_classes=["forge-neo-style-modal-actions"]):
                style_save = gr.Button(
                    _label("Save", "保存"),
                    variant="primary",
                    visible=False,
                    elem_id=_forge_elem(prefix, "edit_style_save"),
                )
                style_delete = gr.Button(
                    _label("Delete", "删除"),
                    variant="primary",
                    visible=False,
                    elem_id=_forge_elem(prefix, "edit_style_delete"),
                )
                style_close = gr.Button(
                    _label("Close", "关闭"),
                    variant="secondary",
                    elem_id=_forge_elem(prefix, "edit_style_close"),
                )
    return StyleControls(
        editor=style_editor,
        dropdown=style_dropdown,
        edit_select=style_edit_select,
        prompt=style_prompt,
        negative_prompt=style_negative,
        edit=edit_style_btn,
        close=style_close,
        close_top=style_close_top,
        refresh=style_refresh,
        save=style_save,
        delete=style_delete,
        apply=apply_style_btn,
        materialize=materialize_style_btn,
        copy=copy_style_btn,
    )


def _style_grid_json_value(kind: str) -> str:
    try:
        if kind == "order":
            return style_grid_category_order_json()
        return style_grid_payload_json()
    except Exception:
        return "[]" if kind == "order" else '{"categories": {}, "usage": {}, "presets": {}}'


def _create_style_grid_bridge(prefix: str) -> StyleGridBridgeControls:
    tab_prefix = "img2img" if prefix == "img2img" else "txt2img"
    with gr.Group(elem_id=f"style_grid_wrapper_{tab_prefix}", visible=False):
        styles_data = gr.Textbox(value=_style_grid_json_value("payload"), visible=False, elem_id=f"style_grid_data_{tab_prefix}")
        selected_styles = gr.Textbox(value="[]", visible=False, elem_id=f"style_grid_selected_{tab_prefix}")
        silent_styles = gr.Textbox(value="[]", visible=False, elem_id=f"style_grid_silent_{tab_prefix}")
        source_filter = gr.Textbox(value="", visible=False, elem_id=f"style_grid_source_{tab_prefix}")
        apply_trigger = gr.Button(visible=False, elem_id=f"style_grid_apply_trigger_{tab_prefix}")
    with gr.Group(visible=False):
        category_order = gr.Textbox(value=_style_grid_json_value("order"), visible=False, elem_id=f"style_grid_cat_order_{tab_prefix}")
    return StyleGridBridgeControls(
        data=styles_data,
        selected=selected_styles,
        silent=silent_styles,
        source=source_filter,
        apply=apply_trigger,
        category_order=category_order,
    )


def _wire_style_controls(controls: StyleControls, prompt: gr.Textbox, negative_prompt: gr.Textbox, state: gr.State, status: gr.HTML) -> None:
    controls.edit.click(
        _open_style_editor_clicked,
        inputs=[controls.dropdown],
        outputs=[controls.editor, controls.edit_select, controls.prompt, controls.negative_prompt, controls.delete, controls.save],
        show_progress=False,
        queue=False,
    )
    controls.close.click(
        lambda: gr.update(visible=False),
        outputs=[controls.editor],
        show_progress=False,
        queue=False,
    )
    controls.close_top.click(
        lambda: gr.update(visible=False),
        outputs=[controls.editor],
        show_progress=False,
        queue=False,
    )
    controls.apply.click(
        _apply_selected_styles,
        inputs=[prompt, negative_prompt, controls.dropdown],
        outputs=[prompt, negative_prompt, controls.dropdown],
    )
    controls.materialize.click(
        _materialize_style_editor_clicked,
        inputs=[prompt, negative_prompt, controls.prompt, controls.negative_prompt],
        outputs=[prompt, negative_prompt, controls.dropdown, controls.editor],
    )
    controls.copy.click(
        _copy_prompt_to_style,
        inputs=[prompt, negative_prompt],
        outputs=[controls.prompt, controls.negative_prompt],
    )
    controls.edit_select.change(
        _style_selected,
        inputs=[controls.edit_select],
        outputs=[controls.prompt, controls.negative_prompt, controls.delete, controls.save],
    )
    save_event = controls.save.click(
        _save_style_clicked,
        inputs=[controls.edit_select, controls.prompt, controls.negative_prompt, state],
        outputs=[controls.dropdown, controls.edit_select, controls.delete, controls.save, status],
    )
    save_event.then(
        _style_selected,
        inputs=[controls.edit_select],
        outputs=[controls.prompt, controls.negative_prompt, controls.delete, controls.save],
        show_progress=False,
    )
    controls.delete.click(
        _delete_style_clicked,
        inputs=[controls.edit_select, state],
        outputs=[controls.dropdown, controls.edit_select, controls.prompt, controls.negative_prompt, controls.delete, controls.save, status],
    )
    controls.refresh.click(
        _refresh_styles_clicked,
        inputs=[controls.edit_select, state],
        outputs=[controls.dropdown, controls.edit_select, controls.delete, controls.save, status],
    )


def _wire_controlnet_image_tools(controls: dict[str, object], width: gr.Slider, height: gr.Slider, state: gr.State, status: gr.HTML, preset: gr.Dropdown | None = None) -> None:
    for unit in controls.get("controlnet_units", []):
        unit["open_new_canvas"].click(
            lambda: gr.update(visible=True),
            outputs=[unit["create_canvas"]],
            show_progress=False,
            queue=False,
        )
        unit["canvas_cancel"].click(
            lambda: gr.update(visible=False),
            outputs=[unit["create_canvas"]],
            show_progress=False,
            queue=False,
        )
        unit["canvas_create"].click(
            _create_controlnet_canvas_clicked,
            inputs=[unit["canvas_height"], unit["canvas_width"], state],
            outputs=[unit["image"], unit["create_canvas"], status],
            show_progress=False,
            queue=False,
        )
        unit["send_dimensions"].click(
            _send_controlnet_dimensions_clicked,
            inputs=[unit["image"], state],
            outputs=[width, height, status],
            show_progress=False,
            queue=False,
        )
        unit["allow_preview"].change(
            _controlnet_allow_preview_changed,
            inputs=[unit["allow_preview"]],
            outputs=[unit["generated_image_group"], unit["preview_as_input"], unit["generated_image"]],
            show_progress=False,
            queue=False,
        )
        unit["use_mask"].change(
            _controlnet_use_mask_changed,
            inputs=[unit["use_mask"], height, width, state],
            outputs=[unit["mask_image_group"], unit["mask_image"], status],
            show_progress=False,
            queue=False,
        )
        unit["trigger_preprocessor"].click(
            _controlnet_run_preprocessor_clicked,
            inputs=[unit["image"], unit["module"], unit["processor_res"], unit["threshold_a"], unit["threshold_b"], state],
            outputs=[unit["generated_image_group"], unit["generated_image"], unit["allow_preview"], unit["preview_as_input"], status],
            show_progress=False,
            queue=False,
        )
        slider_update_outputs = [
            unit["advanced_sliders"],
            unit["processor_res"],
            unit["threshold_a"],
            unit["threshold_b"],
            unit["model"],
            unit["refresh_models"],
            unit["control_mode"],
        ]
        unit["module"].change(
            _controlnet_slider_update,
            inputs=[unit["module"], unit["pixel_perfect"]],
            outputs=slider_update_outputs,
            show_progress=False,
            queue=False,
        )
        unit["pixel_perfect"].input(
            _controlnet_slider_update,
            inputs=[unit["module"], unit["pixel_perfect"]],
            outputs=slider_update_outputs,
            show_progress=False,
            queue=False,
        )
        unit["pixel_perfect"].select(
            _controlnet_slider_update,
            inputs=[unit["module"], unit["pixel_perfect"]],
            outputs=slider_update_outputs,
            show_progress=False,
            queue=False,
        )
        if preset is not None:
            unit["type"].change(
                _controlnet_type_changed,
                inputs=[unit["type"], preset, unit["pixel_perfect"]],
                outputs=[
                    unit["module"],
                    unit["model"],
                    unit["advanced_sliders"],
                    unit["processor_res"],
                    unit["threshold_a"],
                    unit["threshold_b"],
                    unit["refresh_models"],
                    unit["control_mode"],
                ],
                show_progress=False,
                queue=False,
            )
        if preset is not None:
            unit["refresh_models"].click(
                _refresh_single_controlnet_model_clicked,
                inputs=[preset],
                outputs=[unit["model"]],
                show_progress=False,
                queue=False,
            )
        if unit.get("independent_image") is not None:
            unit["independent_image"].change(
                _controlnet_img2img_independent_changed,
                inputs=[unit["independent_image"]],
                outputs=[
                    unit["image"],
                    unit["allow_preview"],
                    unit["image_upload_panel"],
                    unit["trigger_preprocessor"],
                    unit["resize_mode"],
                    unit["use_mask"],
                    unit["generated_image_group"],
                    unit["generated_image"],
                    unit["mask_image_group"],
                    unit["mask_image"],
                    unit["preview_as_input"],
                ],
                show_progress=False,
                queue=False,
            )


def _wire_batch_edit_controls(controls: dict[str, object], state: gr.State) -> None:
    controls["batch_edit_start"].click(
        _batch_edit_generate_clicked,
        inputs=[
            state,
            controls["batch_edit_input_dir"],
            controls["batch_edit_output_dir"],
            controls["batch_edit_prompt"],
            controls["batch_edit_negative_prompt"],
            controls["batch_edit_max_edge_length"],
            controls["batch_edit_steps"],
            controls["batch_edit_cfg_scale"],
            controls["batch_edit_seed"],
            controls["batch_edit_formats"],
            controls["batch_edit_sort_method"],
        ],
        outputs=[controls["batch_edit_progress"], controls["batch_edit_log"]],
        show_progress=True,
    )
    controls["batch_edit_stop"].click(
        _batch_edit_stop_clicked,
        inputs=[state],
        outputs=[controls["batch_edit_progress"], controls["batch_edit_log"]],
        show_progress=False,
        queue=False,
    )


def create_app() -> gr.Blocks:
    os.environ["FORGE_NEO_MANAGED_SOURCE_EXTENSION_TABS"] = "1"
    state_value = _initial_state()
    default_preset = initial_preset()
    settings_initial = load_settings()
    model_choices = initial_model_choices(default_preset)
    model_defaults = preset_model_defaults(default_preset, model_choices)
    defaults = settings_defaults_for_preset(default_preset, mode="t2i", settings=settings_initial)
    hires_defaults = settings_defaults_for_preset(default_preset, mode="t2i_hr", settings=settings_initial)
    img_defaults = settings_defaults_for_preset(default_preset, mode="i2i", settings=settings_initial)
    styles = style_choices()
    sampling_choices = sampling_methods(settings_initial)
    all_sampling_choices = sampling_methods(settings_initial, include_hidden=True)
    scheduler_choices = scheduler_types()
    textual_inversion_choices = _names_for_extra_kind(model_choices, "textual_inversion")
    checkpoint_browser_choices = _names_for_extra_kind(model_choices, "checkpoints")
    lora_browser_choices = _names_for_extra_kind(model_choices, "lora")
    forge_couple_bridge: dict[str, dict[str, object]] = {}

    app = create_root_blocks(title="Forge Neo", concurrency_count=3)
    with app:
        state = gr.State(state_value)
        mode = gr.State("txt2img")
        with gr.Column(elem_id="forge_neo_root"):
            runtime_marker = gr.HTML(_runtime_marker_html(state_value["__lang"]))
            with gr.Row(elem_classes=["forge-neo-topbar"]):
                preset = gr.Dropdown(UI_PRESETS, value=default_preset, label=_label("UI Preset", "界面预设"), scale=1, min_width=110, elem_id="forge_neo_preset")
                preset_restore = gr.Textbox(value="", show_label=False, elem_id="forge_neo_preset_restore", elem_classes=["forge-neo-hidden-bridge"])
                preset_restore_apply = gr.Button("", elem_id="forge_neo_preset_restore_apply", elem_classes=["forge-neo-hidden-bridge"])
                checkpoint = gr.Dropdown(
                    model_choices.checkpoints,
                    value=model_defaults.checkpoint,
                    label=_label("Checkpoint", "模型"),
                    scale=4,
                    allow_custom_value=True,
                    elem_id="forge_neo_checkpoint",
                )
                text_encoders = gr.Dropdown(
                    module_choices(model_choices),
                    value=model_defaults.modules,
                    label=_label("VAE / Text Encoder", "VAE / 文本编码器"),
                    multiselect=True,
                    scale=4,
                    allow_custom_value=True,
                    elem_id="forge_neo_text_encoders",
                )
                vae = gr.Dropdown(
                    model_choices.vae,
                    value=model_defaults.vae,
                    label="VAE",
                    visible=False,
                    allow_custom_value=True,
                    elem_id="forge_neo_vae",
                )
                with gr.Column(elem_id="forge_neo_model_tool_stack", elem_classes=["forge-neo-topbar-tool-stack"], scale=0, min_width=44):
                    unload_vram_btn = gr.Button("🧹", elem_id="forge_neo_unload_models", min_width=44)
                    refresh_btn = gr.Button("↻", elem_id="forge_neo_refresh_models", min_width=44)
                language_switch = gr.Dropdown(
                    [("EN", "en"), ("CN", "cn")],
                    value=state_value["__lang"],
                    label=_label("Language", "语言"),
                    scale=0,
                    min_width=86,
                    elem_id="forge_neo_language",
                )
                low_bits = gr.Dropdown(_low_bit_choices(), value=model_defaults.low_bits, label=_label("Diffusion in Low Bits", "低位扩散"), scale=2, elem_id="forge_neo_low_bits")

            with gr.Tabs(elem_id="forge_neo_tabs"):
                with gr.Tab(_label("txt2img", "文生图"), elem_id="forge_neo_txt2img_tab"):
                    mode_txt = gr.State("txt2img")
                    with gr.Row(elem_classes=["forge-neo-main-row"]):
                        with gr.Column(scale=5, elem_classes=["forge-neo-left"]):
                            prompt = gr.Textbox(
                                value=_default_prompt(default_preset, model_choices),
                                label="",
                                show_label=False,
                                lines=3,
                                max_lines=5,
                                placeholder=_label("Prompt", "提示词"),
                                elem_id="forge_neo_prompt",
                            )
                            negative_prompt = gr.Textbox(
                                value="",
                                label="",
                                show_label=False,
                                lines=2,
                                max_lines=4,
                                placeholder=_label("Negative Prompt", "反向提示词"),
                                elem_id="forge_neo_negative_prompt",
                            )
                        with gr.Column(scale=1, elem_classes=["forge-neo-generate-column"]):
                            with gr.Column(elem_classes=["forge-neo-generate-box"]):
                                generate_btn = gr.Button(_label("Generate", "生成"), elem_id="forge_neo_generate", variant="primary")
                                stop_btn = gr.Button(_label("Stop", "停止"), elem_id="forge_neo_stop", elem_classes=["forge-neo-interrupt-button"])
                                skip_btn = gr.Button(_label("Skip", "跳过"), elem_id="forge_neo_skip", elem_classes=["forge-neo-skip-button"])
                            with gr.Row(
                                elem_id="txt2img_tools",
                                elem_classes=["forge-neo-small-actions", "forge-neo-tool-actions", "forge-neo-generate-actions"],
                            ):
                                paste_params = _tool_button("↙️", elem_id="forge_neo_paste_params")
                                clear_prompt = _tool_button("🗑️", elem_id="forge_neo_clear_prompt")
                                style_apply_quick = _tool_button("📋", elem_id="forge_neo_style_apply")
                            txt_styles = _create_style_controls("", styles, apply_button=style_apply_quick)
                            txt_style_grid = _create_style_grid_bridge("")

                    txt_tipo = _create_tipo_controls("", is_img2img=False) if tipo_available() else None

                    with gr.Row(elem_classes=["forge-neo-workspace"]):
                        with gr.Column(scale=1, elem_classes=["forge-neo-params"]):
                            with gr.Tabs():
                                with gr.Tab(_label("Generation", "生成")):
                                    with gr.Row(elem_classes=["forge-neo-sampling-row"]):
                                        sampler = gr.Dropdown(sampling_choices, value=defaults["sampler"], label=_label("Sampling Method", "采样方法"))
                                        scheduler = gr.Dropdown(scheduler_choices, value=defaults["scheduler"], label=_label("Schedule Type", "调度类型"))
                                        steps = gr.Slider(1, 150, value=defaults["steps"], step=1, label=_label("Sampling Steps", "采样步数"), elem_id="forge_neo_steps")
                                    with gr.Column(elem_classes=["forge-neo-advanced-accordions"]):
                                        with InputAccordion(False, label=_label("Hires. fix", "高分辨率修复 (Hires. fix)"), elem_id="forge_neo_hires_fix") as hires_fix:
                                            with hires_fix.extra():
                                                hires_final_resolution = gr.HTML("", elem_id="forge_neo_hires_final_resolution", elem_classes=["forge-neo-hires-preview"])
                                            with gr.Row():
                                                hr_upscaler = gr.Dropdown(
                                                    _hires_upscaler_choices(),
                                                    value="Latent",
                                                    label=_label("Upscaler", "放大器"),
                                                    elem_id="forge_neo_hires_upscaler",
                                                )
                                                hr_steps = gr.Slider(
                                                    0,
                                                    150,
                                                    value=hires_defaults["steps"],
                                                    step=1,
                                                    label=_label("Hires steps", "高清步数"),
                                                    elem_id="forge_neo_hires_steps",
                                                )
                                                hr_denoising_strength = gr.Slider(
                                                    0,
                                                    1,
                                                    value=0.6,
                                                    step=0.05,
                                                    label=_label("Denoising strength", "重绘幅度"),
                                                    elem_id="forge_neo_hires_denoising_strength",
                                                )
                                            with gr.Row():
                                                hr_scale = gr.Slider(
                                                    1.0,
                                                    4.0,
                                                    value=2.0,
                                                    step=0.05,
                                                    label=_label("Upscale by", "放大倍率"),
                                                    elem_id="forge_neo_hires_scale",
                                                )
                                                hr_resize_x = gr.Slider(
                                                    0,
                                                    4096,
                                                    value=0,
                                                    step=8,
                                                    label=_label("Resize width to", "目标宽度"),
                                                    elem_id="forge_neo_hires_resize_x",
                                                )
                                                hr_resize_y = gr.Slider(
                                                    0,
                                                    4096,
                                                    value=0,
                                                    step=8,
                                                    label=_label("Resize height to", "目标高度"),
                                                    elem_id="forge_neo_hires_resize_y",
                                                )
                                            with gr.Row():
                                                hr_checkpoint = gr.Dropdown(
                                                    _hires_checkpoint_choices(model_choices),
                                                    value="Use same checkpoint",
                                                    label=_label("Hires Checkpoint", "高清模型"),
                                                    elem_id="forge_neo_hires_checkpoint",
                                                )
                                                hr_additional_modules = gr.Dropdown(
                                                    _hires_module_choices(model_choices),
                                                    value=["Use same choices"],
                                                    label=_label("Hires VAE / Text Encoder", "高清 VAE / Text Encoder"),
                                                    multiselect=True,
                                                    elem_id="forge_neo_hires_modules",
                                                )
                                            with gr.Row():
                                                hr_sampler = gr.Dropdown(
                                                    _localized_value_choices([("Use same sampler", "使用同一采样器")]) + sampling_choices,
                                                    value="Use same sampler",
                                                    label=_label("Hires sampling method", "高清采样方法"),
                                                    elem_id="forge_neo_hires_sampler",
                                                )
                                                hr_scheduler = gr.Dropdown(
                                                    _localized_value_choices([("Use same scheduler", "使用同一调度器")]) + scheduler_choices,
                                                    value="Use same scheduler",
                                                    label=_label("Hires schedule type", "高清调度类型"),
                                                    elem_id="forge_neo_hires_scheduler",
                                                )
                                            with gr.Row():
                                                hr_cfg = gr.Slider(
                                                    1.0,
                                                    24.0,
                                                    value=hires_defaults["cfg_scale"],
                                                    step=0.5,
                                                    label=_label("Hires CFG Scale", "高清 CFG"),
                                                    elem_id="forge_neo_hires_cfg",
                                                )
                                                hr_distilled_cfg = gr.Slider(
                                                    1.0,
                                                    24.0,
                                                    value=_preset_dcfg_value(default_preset, is_hires=True, settings=settings_initial),
                                                    step=0.5,
                                                    label=_label("Hires Distilled CFG Scale", "高清 Distilled CFG"),
                                                    elem_id="forge_neo_hires_distilled_cfg",
                                                )
                                            with gr.Row():
                                                hr_prompt = gr.Textbox(
                                                    label=_label("Hires prompt", "高清提示词"),
                                                    show_label=False,
                                                    lines=3,
                                                    placeholder=_label(
                                                        "Prompt for hires fix pass. Leave empty to use the first pass prompt.",
                                                        "高清修复提示词，留空则使用第一阶段提示词。",
                                                    ),
                                                    elem_id="forge_neo_hires_prompt",
                                                )
                                                hr_negative_prompt = gr.Textbox(
                                                    label=_label("Hires negative prompt", "高清反向提示词"),
                                                    show_label=False,
                                                    lines=3,
                                                    placeholder=_label(
                                                        "Negative prompt for hires fix pass. Leave empty to use the first pass negative prompt.",
                                                        "高清修复反向提示词，留空则使用第一阶段反向提示词。",
                                                    ),
                                                    elem_id="forge_neo_hires_negative_prompt",
                                                )
                                        with InputAccordion(False, label=_label("Refiner", "精修"), elem_id="forge_neo_refiner") as refiner:
                                            with gr.Row():
                                                refiner_checkpoint = gr.Dropdown(
                                                    _refiner_checkpoint_choices(model_choices),
                                                    value="None",
                                                    label=_label("Checkpoint", "模型"),
                                                    elem_id="forge_neo_refiner_checkpoint",
                                                )
                                                refiner_switch_at = gr.Slider(
                                                    0.0,
                                                    1.0,
                                                    value=0.875,
                                                    step=0.025,
                                                    label=_label("Switch at", "切换位置"),
                                                    elem_id="forge_neo_refiner_switch_at",
                                                )
                                    with gr.Row(elem_id="forge_neo_dimensions_batch", elem_classes=["forge-neo-dim-batch-row"]):
                                        with gr.Column(scale=4, elem_classes=["forge-neo-dimensions-column"]):
                                            with gr.Row(elem_id="forge_neo_dimensions", elem_classes=["forge-neo-resolution-row"]):
                                                with gr.Column(scale=4, elem_classes=["forge-neo-resolution-sliders"]):
                                                    width = gr.Slider(64, 2048, value=defaults["width"], step=8, label=_label("Width", "宽度"), elem_id="forge_neo_width")
                                                    height = gr.Slider(64, 2048, value=defaults["height"], step=8, label=_label("Height", "高度"), elem_id="forge_neo_height")
                                                with gr.Column(scale=1, elem_classes=["forge-neo-dimension-tools"]):
                                                    res_switch_btn = gr.Button("⇅", elem_id="forge_neo_res_switch_btn", min_width=40)
                                        with gr.Column(scale=3, elem_classes=["forge-neo-batch-column"]):
                                            batch_count = gr.Slider(1, 16, value=1, step=1, label=_label("Batch Count", "批次数"), elem_id="forge_neo_batch_count")
                                            batch_size = gr.Slider(1, 16, value=defaults["batch_size"], step=1, label=_label("Batch Size", "批大小"), elem_id="forge_neo_batch_size")
                                    with gr.Row():
                                        distilled_cfg_scale = gr.Slider(
                                            1,
                                            24,
                                            value=_preset_dcfg_value(default_preset, settings=settings_initial),
                                            step=0.5,
                                            label=_label(*_preset_dcfg_label(default_preset)),
                                            elem_id="forge_neo_distilled_cfg_scale",
                                            visible=_preset_dcfg_visible(default_preset, settings=settings_initial),
                                        )
                                        cfg_scale = gr.Slider(1, 24, value=defaults["cfg_scale"], step=0.5, label=_label("CFG Scale", "CFG 比例"), elem_id="forge_neo_cfg_scale")
                                        rescale_cfg = gr.Slider(
                                            0,
                                            1,
                                            value=0,
                                            step=0.01,
                                            label=_label("Rescale CFG", "重调 CFG"),
                                            elem_id="forge_neo_rescale_cfg",
                                            visible=bool(settings_initial.get("show_rescale_cfg", False)),
                                        )
                                        mahiro = gr.Checkbox(
                                            False,
                                            label="MaHiRo",
                                            elem_id="forge_neo_mahiro",
                                            visible=bool(settings_initial.get("show_mahiro", False)),
                                        )
                                    with gr.Row(elem_classes=["forge-neo-seed-row"]):
                                        seed = gr.Number(value=-1, precision=0, label=_label("Seed", "随机种子"), elem_id="forge_neo_seed", scale=8, min_width=140)
                                        seed_random_btn = _tool_button("🎲️", elem_id="forge_neo_seed_random")
                                        seed_reuse_btn = _tool_button("♻️", elem_id="forge_neo_seed_reuse")
                                        seed_extra = gr.Checkbox(
                                            False,
                                            label=_label("Extra", "额外"),
                                            elem_id="forge_neo_seed_extra",
                                            elem_classes=["forge-neo-seed-extra"],
                                            scale=1,
                                            min_width=72,
                                        )
                                    txt_integrated = _create_integrated_controls(
                                        "",
                                        is_img2img=False,
                                        state_value=state_value,
                                        prompt=prompt,
                                        width=width,
                                        height=height,
                                        settings_value=settings_initial,
                                        forge_couple_bridge=forge_couple_bridge,
                                    )
                                    script = gr.Dropdown(
                                        _script_dropdown_choices(),
                                        value="None",
                                        label=_label("Script", "脚本"),
                                        elem_id="forge_neo_script",
                                    )
                                    script_controls = _create_script_controls("", is_img2img=False)
                                with gr.Tab(_label("Textual Inversion", "反向文本"), elem_id="forge_neo_textual_inversion_tab"):
                                    txt_ti_browser = _create_extra_network_browser(
                                        "",
                                        "textual_inversion",
                                        textual_inversion_choices,
                                    )
                                with gr.Tab(_label("Checkpoints", "模型"), elem_id="forge_neo_checkpoints_tab"):
                                    txt_checkpoint_browser = _create_extra_network_browser(
                                        "",
                                        "checkpoints",
                                        checkpoint_browser_choices,
                                    )
                                with gr.Tab(_label("Lora", "LoRA"), elem_id="forge_neo_lora_tab"):
                                    lora_dropdown = gr.Dropdown(
                                        model_choices.loras,
                                        value=model_defaults.loras,
                                        label="LoRA",
                                        multiselect=True,
                                        elem_id="forge_neo_lora_selection",
                                        elem_classes=["forge-neo-extra-state-control"],
                                    )
                                    txt_lora_weights = gr.State(dict(model_defaults.lora_weights))
                                    txt_lora_browser = _create_extra_network_browser(
                                        "",
                                        "lora",
                                        lora_browser_choices,
                                        model_defaults.lora_weights,
                                    )
                        with gr.Column(scale=1, elem_classes=["forge-neo-results"]):
                            gallery = gr.Gallery(
                                label="",
                                show_label=False,
                                elem_id="forge_neo_gallery",
                                columns=1,
                                height=520,
                                interactive=False,
                                visible=True,
                            )
                            gallery_selected_index = gr.State("-1")
                            with gr.Row(
                                elem_id="forge_neo_image_buttons_txt2img",
                                elem_classes=["forge-neo-output-actions"],
                                visible=True,
                            ) as txt_output_actions:
                                txt_open_folder = _tool_button("📂", elem_id="forge_neo_txt2img_open_folder")
                                txt_save = _tool_button("💾", elem_id="forge_neo_save_txt2img")
                                txt_save_zip = _tool_button("🗃️", elem_id="forge_neo_save_zip_txt2img")
                                txt_send_img2img = _tool_button("🖼️", elem_id="forge_neo_txt2img_send_to_img2img")
                                txt_send_inpaint = _tool_button("🎨️", elem_id="forge_neo_txt2img_send_to_inpaint")
                                txt_send_extras = _tool_button("📐", elem_id="forge_neo_txt2img_send_to_extras")
                                txt_send_storyboard = _tool_button("🎬", elem_id="forge_neo_txt2img_send_to_storyboard")
                                txt_upscale = _tool_button("✨", elem_id="forge_neo_txt2img_upscale")
                            infotext = gr.HTML(_infotext_html(""), elem_id="forge_neo_infotext")
                            infotext_raw = gr.State("")
                            status = gr.HTML(
                                elem_id="forge_neo_status",
                                visible=False,
                            )

                    img2img_image = gr.Image(visible=False)
                    image_cfg_scale_hidden = gr.State(None)
                    denoising_strength_hidden = gr.Number(value=0.0, visible=False)
                    generate_inputs = [
                        state,
                        mode_txt,
                        preset,
                        checkpoint,
                        text_encoders,
                        low_bits,
                        prompt,
                        negative_prompt,
                        txt_styles.dropdown,
                        txt_style_grid.silent,
                        txt_style_grid.source,
                        sampler,
                        scheduler,
                        steps,
                        width,
                        height,
                        cfg_scale,
                        distilled_cfg_scale,
                        image_cfg_scale_hidden,
                        rescale_cfg,
                        denoising_strength_hidden,
                        seed,
                        batch_count,
                        batch_size,
                        hires_fix,
                        refiner,
                        lora_dropdown,
                        txt_lora_weights,
                        hr_upscaler,
                        hr_steps,
                        hr_denoising_strength,
                        hr_scale,
                        hr_resize_x,
                        hr_resize_y,
                        hr_checkpoint,
                        hr_additional_modules,
                        hr_sampler,
                        hr_scheduler,
                        hr_prompt,
                        hr_negative_prompt,
                        hr_cfg,
                        hr_distilled_cfg,
                        refiner_checkpoint,
                        refiner_switch_at,
                        *_integrated_inputs({**txt_integrated, **script_controls, "mahiro": mahiro, "script": script}),
                        img2img_image,
                        *(_tipo_inputs(txt_tipo) if txt_tipo else []),
                    ]
                    for hires_input in (hires_fix, width, height, hr_scale, hr_resize_x, hr_resize_y):
                        hires_input.change(
                            _calc_hires_resolution,
                            inputs=[hires_fix, width, height, hr_scale, hr_resize_x, hr_resize_y, state],
                            outputs=[hires_final_resolution],
                            show_progress=False,
                        )
                    generate_btn.click(
                        _generate_clicked,
                        inputs=generate_inputs,
                        outputs=[gallery, infotext, infotext_raw, status, gallery_selected_index, txt_output_actions],
                    )
                    gallery.select(_gallery_selected_index, outputs=[gallery_selected_index], show_progress=False, queue=False)
                    seed_random_btn.click(_random_seed_clicked, outputs=[seed], show_progress=False, queue=False)
                    seed_reuse_btn.click(_reuse_seed_clicked, inputs=[infotext_raw], outputs=[seed], show_progress=False, queue=False)
                    stop_btn.click(
                        _stop_output_clicked,
                        inputs=[state],
                        outputs=[status],
                        show_progress="hidden",
                        queue=False,
                    )
                    skip_btn.click(
                        _skip_output_clicked,
                        inputs=[state],
                        outputs=[status],
                        show_progress="hidden",
                        queue=False,
                    )
                    res_switch_btn.click(
                        _switch_dimensions_clicked,
                        inputs=[width, height, state],
                        outputs=[width, height, status],
                        show_progress=False,
                    )
                    paste_params.click(
                        _paste_txt2img_params_clicked,
                        inputs=[prompt, infotext_raw, state],
                        outputs=[
                            status,
                            prompt,
                            negative_prompt,
                            sampler,
                            scheduler,
                            steps,
                            width,
                            height,
                            cfg_scale,
                            seed,
                            *_script_send_outputs(script, script_controls),
                        ],
                        show_progress=False,
                    )
                    clear_prompt.click(
                        _clear_prompts_clicked,
                        inputs=[state],
                        outputs=[prompt, negative_prompt, status],
                        show_progress=False,
                    )
                    _wire_style_controls(txt_styles, prompt, negative_prompt, state, status)
                    _wire_controlnet_image_tools(txt_integrated, width, height, state, status, preset)
                    _wire_batch_edit_controls(txt_integrated, state)
                    _wire_script_controls(script, script_controls)
                    if txt_tipo:
                        _wire_tipo_controls(txt_tipo, prompt=prompt, width=width, height=height, state=state)
                    _wire_extra_network_browser(txt_ti_browser, preset, prompt, negative_prompt, checkpoint, lora_dropdown)
                    _wire_extra_network_browser(txt_checkpoint_browser, preset, prompt, negative_prompt, checkpoint, lora_dropdown)
                    _wire_extra_network_browser(txt_lora_browser, preset, prompt, negative_prompt, checkpoint, lora_dropdown)

                with gr.Tab(_label("img2img", "图生图"), elem_id="forge_neo_img2img_tab"):
                    mode_img = gr.State("img2img")
                    img_hires_fix = gr.State(False)
                    img_hires_upscaler = gr.State("Latent")
                    img_hires_steps = gr.State(0)
                    img_hires_denoising_strength = gr.State(0.0)
                    img_hires_scale = gr.State(1.0)
                    img_hires_resize_x = gr.State(0)
                    img_hires_resize_y = gr.State(0)
                    img_hires_checkpoint = gr.State("Use same checkpoint")
                    img_hires_modules = gr.State(["Use same choices"])
                    img_hires_sampler = gr.State("Use same sampler")
                    img_hires_scheduler = gr.State("Use same scheduler")
                    img_hires_prompt = gr.State("")
                    img_hires_negative_prompt = gr.State("")
                    img_hires_cfg = gr.State(6.0)
                    img_hires_distilled_cfg = gr.State(3.0)
                    with gr.Row(elem_classes=["forge-neo-main-row"]):
                        with gr.Column(scale=5, elem_classes=["forge-neo-left"]):
                            img_prompt = gr.Textbox(
                                value=_default_prompt(default_preset, model_choices),
                                label="",
                                show_label=False,
                                lines=3,
                                max_lines=5,
                                placeholder=_label("Prompt", "提示词"),
                                elem_id="forge_neo_img2img_prompt",
                            )
                            img_negative = gr.Textbox(
                                value="",
                                label="",
                                show_label=False,
                                lines=2,
                                max_lines=4,
                                placeholder=_label("Negative Prompt", "反向提示词"),
                                elem_id="forge_neo_img2img_negative_prompt",
                            )
                        with gr.Column(scale=1, elem_classes=["forge-neo-generate-column"]):
                            with gr.Column(elem_classes=["forge-neo-generate-box"]):
                                img_generate = gr.Button(_label("Generate", "生成"), elem_id="forge_neo_img2img_generate", variant="primary")
                                img_stop = gr.Button(_label("Stop", "停止"), elem_id="forge_neo_img2img_stop", elem_classes=["forge-neo-interrupt-button"])
                                img_skip = gr.Button(_label("Skip", "跳过"), elem_id="forge_neo_img2img_skip", elem_classes=["forge-neo-skip-button"])
                            with gr.Row(
                                elem_id="img2img_tools",
                                elem_classes=["forge-neo-small-actions", "forge-neo-tool-actions", "forge-neo-generate-actions"],
                            ):
                                img_paste_params = _tool_button("↙️", elem_id="forge_neo_img2img_paste_params")
                                img_clear_prompt = _tool_button("🗑️", elem_id="forge_neo_img2img_clear_prompt")
                                img_style_apply_quick = _tool_button("📋", elem_id="forge_neo_img2img_style_apply")
                            img_styles = _create_style_controls("img2img", styles, apply_button=img_style_apply_quick)
                            img_style_grid = _create_style_grid_bridge("img2img")

                    img_tipo = _create_tipo_controls("img2img", is_img2img=True) if tipo_available() else None

                    with gr.Row(elem_classes=["forge-neo-workspace"]):
                        with gr.Column(scale=1, elem_classes=["forge-neo-params"]):
                            with gr.Tabs():
                                with gr.Tab(_label("Generation", "生成")):
                                    img_canvas_copy_buttons: list[tuple[gr.Button, str, object, object, str]] = []
                                    with gr.Tabs(elem_id="forge_neo_img2img_mode_tabs", elem_classes=["forge-neo-mode-tabs"]):
                                        with gr.Tab(_label("img2img", "img2img"), elem_id="forge_neo_img2img_mode_img2img") as img2img_mode_tab:
                                            img_input_canvas = ForgeCanvas(
                                                no_scribbles=True,
                                                height=512,
                                                elem_id="forge_neo_img2img_input_image",
                                                elem_classes=["forge-neo-img2img-input"],
                                            )
                                            img_input = img_input_canvas.background
                                            img_input_foreground = img_input_canvas.foreground
                                            _create_img2img_canvas_copy_controls("img2img", img_input_canvas, img_canvas_copy_buttons)
                                        with gr.Tab(_label("Sketch", "Sketch"), elem_id="forge_neo_img2img_mode_sketch") as sketch_mode_tab:
                                            img_sketch_canvas = ForgeCanvas(
                                                height=512,
                                                scribble_color="#ff0000",
                                                elem_id="forge_neo_img2img_sketch_image",
                                                elem_classes=["forge-neo-img2img-input"],
                                            )
                                            img_sketch = img_sketch_canvas.background
                                            img_sketch_foreground = img_sketch_canvas.foreground
                                            _create_img2img_canvas_copy_controls("sketch", img_sketch_canvas, img_canvas_copy_buttons)
                                        with gr.Tab(_label("Inpaint", "Inpaint"), elem_id="forge_neo_img2img_mode_inpaint") as inpaint_mode_tab:
                                            img_inpaint_canvas = ForgeCanvas(
                                                height=512,
                                                scribble_color="#ffffff",
                                                scribble_color_fixed=True,
                                                scribble_alpha=75,
                                                scribble_alpha_fixed=True,
                                                scribble_softness=0,
                                                scribble_softness_fixed=True,
                                                elem_id="forge_neo_img2img_inpaint_image",
                                                elem_classes=["forge-neo-img2img-input"],
                                            )
                                            img_inpaint = img_inpaint_canvas.background
                                            img_inpaint_foreground = img_inpaint_canvas.foreground
                                            _create_img2img_canvas_copy_controls("inpaint", img_inpaint_canvas, img_canvas_copy_buttons)
                                        with gr.Tab(_label("Inpaint sketch", "Inpaint sketch"), elem_id="forge_neo_img2img_mode_inpaint_sketch") as inpaint_sketch_mode_tab:
                                            img_inpaint_sketch_canvas = ForgeCanvas(
                                                height=512,
                                                scribble_color="#ff0000",
                                                elem_id="forge_neo_img2img_inpaint_sketch_image",
                                                elem_classes=["forge-neo-img2img-input"],
                                            )
                                            img_inpaint_sketch = img_inpaint_sketch_canvas.background
                                            img_inpaint_sketch_foreground = img_inpaint_sketch_canvas.foreground
                                            _create_img2img_canvas_copy_controls("inpaint_sketch", img_inpaint_sketch_canvas, img_canvas_copy_buttons)
                                        with gr.Tab(_label("Inpaint upload", "Inpaint upload"), elem_id="forge_neo_img2img_mode_inpaint_upload") as inpaint_upload_mode_tab:
                                            img_inpaint_upload = gr.Image(
                                                label=_label("Image for img2img", "Image for img2img"),
                                                type="pil",
                                                sources="upload",
                                                height=242,
                                                elem_id="forge_neo_img2img_inpaint_upload_image",
                                                elem_classes=["forge-neo-img2img-input"],
                                            )
                                            img_inpaint_upload_mask = gr.Image(
                                                label=_label("Mask", "Mask"),
                                                type="pil",
                                                image_mode="RGBA",
                                                sources="upload",
                                                height=242,
                                                elem_id="forge_neo_img2img_inpaint_upload_mask",
                                                elem_classes=["forge-neo-img2img-input"],
                                            )
                                        with gr.Tab(_label("Batch", "Batch"), elem_id="forge_neo_img2img_mode_batch") as batch_mode_tab:
                                            batch_source_type = gr.State("upload")
                                            with gr.Tabs(elem_id="forge_neo_img2img_batch_source", elem_classes=["forge-neo-mode-tabs"]):
                                                with gr.Tab(_label("Upload", "Upload"), elem_id="forge_neo_img2img_batch_upload_tab") as batch_upload_tab:
                                                    img_batch_upload = gr.Files(
                                                        label=_label("Files", "文件"),
                                                        elem_id="forge_neo_img2img_batch_upload",
                                                    )
                                                with gr.Tab(_label("From directory", "From directory"), elem_id="forge_neo_img2img_batch_from_dir_tab") as batch_from_dir_tab:
                                                    gr.Markdown(
                                                        _label(
                                                            "Process images from a server-side directory.",
                                                            "从服务端目录批量处理图片。",
                                                        ),
                                                        elem_classes=["forge-neo-muted-note"],
                                                    )
                                                    img_batch_input_dir = gr.Textbox(label=_label("Input directory", "输入目录"), elem_id="forge_neo_img2img_batch_input_dir")
                                                    img_batch_output_dir = gr.Textbox(label=_label("Output directory", "输出目录"), elem_id="forge_neo_img2img_batch_output_dir")
                                                    img_batch_inpaint_mask_dir = gr.Textbox(
                                                        label=_label("Inpaint batch mask directory", "批量局部重绘蒙版目录"),
                                                        elem_id="forge_neo_img2img_batch_inpaint_mask_dir",
                                                    )
                                            with gr.Accordion(_label("PNG info", "PNG 信息"), open=False, elem_id="forge_neo_img2img_batch_png_info"):
                                                img_batch_use_png_info = gr.Checkbox(
                                                    False,
                                                    label=_label("Append png info to prompts", "将 PNG 信息追加到提示词"),
                                                    elem_id="forge_neo_img2img_batch_use_png_info",
                                                )
                                                img_batch_png_info_dir = gr.Textbox(
                                                    label=_label("PNG info directory", "PNG 信息目录"),
                                                    placeholder=_label("Leave empty to use input directory", "留空则使用输入目录"),
                                                    elem_id="forge_neo_img2img_batch_png_info_dir",
                                                )
                                                img_batch_png_info_props = gr.CheckboxGroup(
                                                    _localized_value_choices(
                                                        [
                                                            ("Prompt", "提示词"),
                                                            ("Negative prompt", "反向提示词"),
                                                            ("Seed", "随机种子"),
                                                            ("CFG scale", "CFG 比例"),
                                                            ("Sampler", "采样器"),
                                                            ("Steps", "步数"),
                                                            ("Model hash", "模型哈希"),
                                                            ("Filename", "文件名"),
                                                        ]
                                                    ),
                                                    label=_label("Parameters to take from png info", "从 PNG 信息读取的参数"),
                                                    elem_id="forge_neo_img2img_batch_png_info_props",
                                                )
                                    img_resize_mode = gr.Radio(
                                        _localized_value_choices(
                                            [
                                                ("Just resize", "仅缩放"),
                                                ("Crop and resize", "裁剪并缩放"),
                                                ("Resize and fill", "缩放并填充"),
                                                ("Just resize (latent upscale)", "仅缩放（latent 放大）"),
                                            ]
                                        ),
                                        value="Crop and resize",
                                        label=_label("Resize mode", "缩放模式"),
                                        elem_id="forge_neo_img2img_resize_mode",
                                    )
                                    img_selected_scale_tab = gr.Number(
                                        value=0,
                                        visible=False,
                                        elem_id="forge_neo_img2img_selected_scale_tab",
                                    )
                                    with gr.Column(elem_id="forge_neo_img2img_inpaint_controls", elem_classes=["forge-neo-inpaint-controls"]) as img_inpaint_controls:
                                        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                                            img_mask_blur = gr.Slider(0, 64, value=4, step=4, label=_label("Mask blur", "蒙版模糊"), elem_id="forge_neo_img2img_mask_blur")
                                            img_mask_alpha = gr.Slider(
                                                0,
                                                100,
                                                value=0,
                                                step=1,
                                                label=_label("Mask transparency", "蒙版透明度"),
                                                elem_id="forge_neo_img2img_mask_alpha",
                                            )
                                        img_mask_mode = gr.Radio(
                                            _localized_value_choices(
                                                [
                                                    ("Inpaint masked", "重绘蒙版区域"),
                                                    ("Inpaint not masked", "重绘非蒙版区域"),
                                                ]
                                            ),
                                            value="Inpaint masked",
                                            label=_label("Mask mode", "蒙版模式"),
                                            elem_id="forge_neo_img2img_mask_mode",
                                        )
                                        img_inpainting_fill = gr.Radio(
                                            _localized_value_choices(
                                                [
                                                    ("fill", "填充"),
                                                    ("original", "原图"),
                                                    ("latent noise", "潜空间噪声"),
                                                    ("latent nothing", "空潜空间"),
                                                ]
                                            ),
                                            value="original",
                                            label=_label("Masked content", "蒙版内容"),
                                            elem_id="forge_neo_img2img_inpainting_fill",
                                        )
                                        with gr.Row():
                                            img_inpaint_area = gr.Radio(
                                                _localized_value_choices(
                                                    [
                                                        ("Whole picture", "整张图片"),
                                                        ("Only masked", "仅蒙版区域"),
                                                    ]
                                                ),
                                                value="Only masked",
                                                label=_label("Inpaint area", "重绘区域"),
                                                elem_id="forge_neo_img2img_inpaint_area",
                                            )
                                            img_inpaint_padding = gr.Slider(
                                                0,
                                                256,
                                                value=32,
                                                step=8,
                                                label=_label("Only masked padding, pixels", "仅蒙版区域边距（像素）"),
                                                elem_id="forge_neo_img2img_inpaint_padding",
                                            )
                                    with gr.Accordion(
                                        _label("Soft inpainting", "Soft inpainting"),
                                        open=False,
                                        elem_id="forge_neo_img2img_soft_inpainting",
                                        elem_classes=["forge-neo-input-accordion", "forge-neo-soft-inpainting"],
                                    ):
                                        img_soft_inpainting_enabled = gr.Checkbox(
                                            False,
                                            label=_label("Enable", "启用"),
                                            elem_id="forge_neo_img2img_soft_inpainting_enable",
                                        )
                                        gr.Markdown(
                                            _label(
                                                "Soft inpainting blends original content with inpainted content according to mask opacity. High Mask blur values are recommended.",
                                                "Soft inpainting 会按蒙版透明度混合原图和重绘内容。建议搭配较高的蒙版模糊值。",
                                            ),
                                            elem_classes=["forge-neo-soft-inpainting-note"],
                                        )
                                        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                                            img_soft_inpainting_schedule_bias = gr.Slider(
                                                0,
                                                8,
                                                value=1.0,
                                                step=0.1,
                                                label=_label("Schedule bias", "调度偏移"),
                                                info=_label(
                                                    "Shifts when preservation of original content occurs during denoising.",
                                                    "调整降噪过程中保留原图内容的时机。",
                                                ),
                                                elem_id="forge_neo_img2img_soft_inpainting_schedule_bias",
                                            )
                                            img_soft_inpainting_preservation_strength = gr.Slider(
                                                0,
                                                8,
                                                value=0.5,
                                                step=0.05,
                                                label=_label("Preservation strength", "保留强度"),
                                                info=_label(
                                                    "How strongly partially masked content should be preserved.",
                                                    "部分蒙版内容的保留强度。",
                                                ),
                                                elem_id="forge_neo_img2img_soft_inpainting_preservation_strength",
                                            )
                                            img_soft_inpainting_transition_contrast_boost = gr.Slider(
                                                1,
                                                32,
                                                value=4.0,
                                                step=0.5,
                                                label=_label("Transition contrast boost", "过渡对比增强"),
                                                info=_label(
                                                    "Amplifies contrast that may be lost in partially masked regions.",
                                                    "增强部分蒙版区域可能损失的对比度。",
                                                ),
                                                elem_id="forge_neo_img2img_soft_inpainting_transition_contrast_boost",
                                            )
                                        gr.Markdown(
                                            _label("### Pixel Composite Settings", "### 像素合成设置"),
                                            elem_classes=["forge-neo-soft-inpainting-subtitle"],
                                        )
                                        with gr.Row(elem_classes=["forge-neo-integrated-row"]):
                                            img_soft_inpainting_mask_influence = gr.Slider(
                                                0,
                                                1,
                                                value=0.0,
                                                step=0.05,
                                                label=_label("Mask influence", "蒙版影响"),
                                                info=_label(
                                                    "How strongly the original mask should bias the difference threshold.",
                                                    "原始蒙版对差异阈值的影响强度。",
                                                ),
                                                elem_id="forge_neo_img2img_soft_inpainting_mask_influence",
                                            )
                                            img_soft_inpainting_difference_threshold = gr.Slider(
                                                0,
                                                8,
                                                value=0.5,
                                                step=0.25,
                                                label=_label("Difference threshold", "差异阈值"),
                                                info=_label(
                                                    "How much an image region can change before original pixels are no longer blended.",
                                                    "图像区域变化到何种程度后不再混合原图像素。",
                                                ),
                                                elem_id="forge_neo_img2img_soft_inpainting_difference_threshold",
                                            )
                                            img_soft_inpainting_difference_contrast = gr.Slider(
                                                0,
                                                8,
                                                value=2.0,
                                                step=0.25,
                                                label=_label("Difference contrast", "差异对比"),
                                                info=_label(
                                                    "How sharp the transition should be between blended and not blended regions.",
                                                    "混合区域与非混合区域之间的过渡锐度。",
                                                ),
                                                elem_id="forge_neo_img2img_soft_inpainting_difference_contrast",
                                            )
                                    with gr.Row(elem_classes=["forge-neo-sampling-row"]):
                                        img_sampler = gr.Dropdown(sampling_choices, value=img_defaults["sampler"], label=_label("Sampling Method", "采样方法"))
                                        img_scheduler = gr.Dropdown(scheduler_choices, value=img_defaults["scheduler"], label=_label("Schedule Type", "调度类型"))
                                        img_steps = gr.Slider(1, 150, value=img_defaults["steps"], step=1, label=_label("Sampling Steps", "采样步数"), elem_id="forge_neo_img2img_steps")
                                    with gr.Column(elem_classes=["forge-neo-advanced-accordions"]):
                                        with InputAccordion(False, label=_label("Refiner", "精修"), elem_id="forge_neo_img2img_refiner") as img_refiner:
                                            with gr.Row():
                                                img_refiner_checkpoint = gr.Dropdown(
                                                    _refiner_checkpoint_choices(model_choices),
                                                    value="None",
                                                    label=_label("Checkpoint", "模型"),
                                                    elem_id="forge_neo_img2img_refiner_checkpoint",
                                                )
                                                img_refiner_switch_at = gr.Slider(
                                                    0.0,
                                                    1.0,
                                                    value=0.875,
                                                    step=0.025,
                                                    label=_label("Switch at", "切换位置"),
                                                    elem_id="forge_neo_img2img_refiner_switch_at",
                                                )
                                    with gr.Row(elem_id="forge_neo_img2img_dimensions_batch", elem_classes=["forge-neo-dim-batch-row"]):
                                        with gr.Column(scale=4, elem_classes=["forge-neo-dimensions-column"]):
                                            with gr.Tabs(elem_id="forge_neo_img2img_resize_tabs", elem_classes=["forge-neo-mode-tabs"]):
                                                with gr.Tab(_label("Resize to", "Resize to"), elem_id="forge_neo_img2img_resize_to") as img_resize_to_tab:
                                                    with gr.Row(elem_id="forge_neo_img2img_dimensions", elem_classes=["forge-neo-resolution-row"]):
                                                        with gr.Column(scale=4, elem_classes=["forge-neo-resolution-sliders"]):
                                                            img_width = gr.Slider(64, 2048, value=img_defaults["width"], step=8, label=_label("Width", "宽度"), elem_id="forge_neo_img2img_width")
                                                            img_height = gr.Slider(64, 2048, value=img_defaults["height"], step=8, label=_label("Height", "高度"), elem_id="forge_neo_img2img_height")
                                                        with gr.Column(scale=1, elem_classes=["forge-neo-dimension-tools"]):
                                                            img_res_switch_btn = gr.Button("⇅", elem_id="forge_neo_img2img_res_switch_btn", min_width=40)
                                                            img_detect_size_btn = gr.Button("📐", elem_id="forge_neo_img2img_detect_image_size_btn", min_width=40)
                                                with gr.Tab(_label("Resize by", "Resize by"), elem_id="forge_neo_img2img_resize_by") as img_resize_by_tab:
                                                    img_resize_scale = gr.Slider(
                                                        0.5,
                                                        4.0,
                                                        value=1.0,
                                                        step=0.05,
                                                        label=_label("Scale", "倍率"),
                                                        elem_id="forge_neo_img2img_resize_scale",
                                                    )
                                        with gr.Column(scale=3, elem_classes=["forge-neo-batch-column"]):
                                            img_batch_count = gr.Slider(1, 16, value=1, step=1, label=_label("Batch Count", "批次数"), elem_id="forge_neo_img2img_batch_count")
                                            img_batch_size = gr.Slider(1, 16, value=img_defaults["batch_size"], step=1, label=_label("Batch Size", "批大小"), elem_id="forge_neo_img2img_batch_size")
                                    with gr.Row():
                                        img_distilled_cfg_scale = gr.Slider(
                                            0,
                                            24,
                                            value=_preset_dcfg_value(default_preset, is_img2img=True, settings=settings_initial),
                                            step=0.5,
                                            label=_label(*_preset_dcfg_label(default_preset)),
                                            elem_id="forge_neo_img2img_distilled_cfg_scale",
                                            visible=_preset_dcfg_visible(default_preset, settings=settings_initial),
                                        )
                                        img_cfg_scale = gr.Slider(1, 24, value=img_defaults["cfg_scale"], step=0.5, label=_label("CFG Scale", "CFG 比例"), elem_id="forge_neo_img2img_cfg_scale")
                                        img_image_cfg_scale = gr.Slider(
                                            0,
                                            3.0,
                                            value=1.5,
                                            step=0.05,
                                            label=_label("Image CFG Scale", "图像 CFG 比例"),
                                            elem_id="forge_neo_img2img_image_cfg_scale",
                                            visible=False,
                                        )
                                        img_rescale_cfg = gr.Slider(
                                            0,
                                            1,
                                            value=0,
                                            step=0.01,
                                            label=_label("Rescale CFG", "重调 CFG"),
                                            elem_id="forge_neo_img2img_rescale_cfg",
                                            visible=bool(settings_initial.get("show_rescale_cfg", False)),
                                        )
                                        img_mahiro = gr.Checkbox(
                                            False,
                                            label="MaHiRo",
                                            elem_id="forge_neo_img2img_mahiro",
                                            visible=bool(settings_initial.get("show_mahiro", False)),
                                        )
                                    img_denoising_strength = gr.Slider(
                                        0,
                                        1,
                                        value=0.6,
                                        step=0.01,
                                        label=_label("Denoising Strength", "重绘幅度"),
                                        elem_id="forge_neo_img2img_denoising_strength",
                                    )
                                    with gr.Row(elem_classes=["forge-neo-seed-row"]):
                                        img_seed = gr.Number(value=-1, precision=0, label=_label("Seed", "随机种子"), elem_id="forge_neo_img2img_seed", scale=8, min_width=140)
                                        img_seed_random_btn = _tool_button("🎲️", elem_id="forge_neo_img2img_seed_random")
                                        img_seed_reuse_btn = _tool_button("♻️", elem_id="forge_neo_img2img_seed_reuse")
                                        img_seed_extra = gr.Checkbox(
                                            False,
                                            label=_label("Extra", "额外"),
                                            elem_id="forge_neo_img2img_seed_extra",
                                            elem_classes=["forge-neo-seed-extra"],
                                            scale=1,
                                            min_width=72,
                                        )
                                    img_integrated = _create_integrated_controls(
                                        "img2img",
                                        is_img2img=True,
                                        state_value=state_value,
                                        prompt=img_prompt,
                                        width=img_width,
                                        height=img_height,
                                        settings_value=settings_initial,
                                        forge_couple_bridge=forge_couple_bridge,
                                        forge_couple_source_image=img_input,
                                    )
                                    img_script = gr.Dropdown(
                                        _script_dropdown_choices(is_img2img=True),
                                        value="None",
                                        label=_label("Script", "脚本"),
                                        elem_id="forge_neo_img2img_script",
                                    )
                                    img_script_controls = _create_script_controls("img2img", is_img2img=True)
                                with gr.Tab(_label("Textual Inversion", "反向文本"), elem_id="forge_neo_img2img_textual_inversion_tab"):
                                    img_ti_browser = _create_extra_network_browser(
                                        "img2img",
                                        "textual_inversion",
                                        textual_inversion_choices,
                                    )
                                with gr.Tab(_label("Checkpoints", "模型"), elem_id="forge_neo_img2img_checkpoints_tab"):
                                    img_checkpoint_browser = _create_extra_network_browser(
                                        "img2img",
                                        "checkpoints",
                                        checkpoint_browser_choices,
                                    )
                                with gr.Tab(_label("Lora", "LoRA"), elem_id="forge_neo_img2img_lora_tab"):
                                    img_lora_dropdown = gr.Dropdown(
                                        model_choices.loras,
                                        value=model_defaults.loras,
                                        label="LoRA",
                                        multiselect=True,
                                        elem_id="forge_neo_img2img_lora_selection",
                                        elem_classes=["forge-neo-extra-state-control"],
                                    )
                                    img_lora_weights = gr.State(dict(model_defaults.lora_weights))
                                    img_lora_browser = _create_extra_network_browser(
                                        "img2img",
                                        "lora",
                                        lora_browser_choices,
                                        model_defaults.lora_weights,
                                    )
                        with gr.Column(scale=1, elem_classes=["forge-neo-results"]):
                            img_gallery = gr.Gallery(
                                label="",
                                show_label=False,
                                columns=1,
                                height=300,
                                interactive=False,
                                elem_id="forge_neo_img2img_gallery",
                                visible=True,
                            )
                            img_gallery_selected_index = gr.State("-1")
                            with gr.Row(
                                elem_id="forge_neo_image_buttons_img2img",
                                elem_classes=["forge-neo-output-actions"],
                                visible=True,
                            ) as img_output_actions:
                                img_open_folder = _tool_button("📂", elem_id="forge_neo_img2img_open_folder")
                                img_save = _tool_button("💾", elem_id="forge_neo_save_img2img")
                                img_save_zip = _tool_button("🗃️", elem_id="forge_neo_save_zip_img2img")
                                img_send_img2img = _tool_button("🖼️", elem_id="forge_neo_img2img_send_to_img2img")
                                img_send_inpaint = _tool_button("🎨️", elem_id="forge_neo_img2img_send_to_inpaint")
                                img_send_extras = _tool_button("📐", elem_id="forge_neo_img2img_send_to_extras")
                                img_send_storyboard = _tool_button("🎬", elem_id="forge_neo_img2img_send_to_storyboard")
                            img_infotext = gr.HTML(_infotext_html(""), elem_id="forge_neo_img2img_infotext")
                            img_infotext_raw = gr.State("")
                            img_status = gr.HTML(
                                elem_id="forge_neo_img2img_status",
                                visible=False,
                            )

                    img_generate.click(
                        _generate_clicked,
                        inputs=[
                            state,
                            mode_img,
                            preset,
                            checkpoint,
                            text_encoders,
                            low_bits,
                            img_prompt,
                            img_negative,
                            img_styles.dropdown,
                            img_style_grid.silent,
                            img_style_grid.source,
                            img_sampler,
                            img_scheduler,
                            img_steps,
                            img_width,
                            img_height,
                            img_cfg_scale,
                            img_distilled_cfg_scale,
                            img_image_cfg_scale,
                            img_rescale_cfg,
                            img_denoising_strength,
                            img_seed,
                            img_batch_count,
                            img_batch_size,
                            img_hires_fix,
                            img_refiner,
                            img_lora_dropdown,
                            img_lora_weights,
                            img_hires_upscaler,
                            img_hires_steps,
                            img_hires_denoising_strength,
                            img_hires_scale,
                            img_hires_resize_x,
                            img_hires_resize_y,
                            img_hires_checkpoint,
                            img_hires_modules,
                            img_hires_sampler,
                            img_hires_scheduler,
                            img_hires_prompt,
                            img_hires_negative_prompt,
                            img_hires_cfg,
                            img_hires_distilled_cfg,
                            img_refiner_checkpoint,
                            img_refiner_switch_at,
                            *_integrated_inputs({**img_integrated, **img_script_controls, "mahiro": img_mahiro, "script": img_script}),
                            img_input,
                            img_sketch,
                            img_sketch_foreground,
                            img_inpaint,
                            img_inpaint_foreground,
                            img_inpaint_sketch,
                            img_inpaint_sketch_foreground,
                            img_inpaint_upload,
                            img_inpaint_upload_mask,
                            img_selected_scale_tab,
                            img_resize_mode,
                            img_resize_scale,
                            img_mask_blur,
                            img_mask_alpha,
                            img_inpainting_fill,
                            img_mask_mode,
                            img_inpaint_area,
                            img_inpaint_padding,
                            img_soft_inpainting_enabled,
                            img_soft_inpainting_schedule_bias,
                            img_soft_inpainting_preservation_strength,
                            img_soft_inpainting_transition_contrast_boost,
                            img_soft_inpainting_mask_influence,
                            img_soft_inpainting_difference_threshold,
                            img_soft_inpainting_difference_contrast,
                            img_batch_upload,
                            batch_source_type,
                            img_batch_input_dir,
                            img_batch_output_dir,
                            img_batch_inpaint_mask_dir,
                            img_batch_use_png_info,
                            img_batch_png_info_props,
                            img_batch_png_info_dir,
                            *(_tipo_inputs(img_tipo) if img_tipo else []),
                        ],
                        outputs=[img_gallery, img_infotext, img_infotext_raw, img_status, img_gallery_selected_index, img_output_actions],
                    )
                    img_gallery.select(_gallery_selected_index, outputs=[img_gallery_selected_index], show_progress=False, queue=False)
                    img_seed_random_btn.click(_random_seed_clicked, outputs=[img_seed], show_progress=False, queue=False)
                    img_seed_reuse_btn.click(_reuse_seed_clicked, inputs=[img_infotext_raw], outputs=[img_seed], show_progress=False, queue=False)
                    img2img_mode_tab.select(lambda: "img2img", outputs=[mode_img], show_progress=False, queue=False)
                    sketch_mode_tab.select(lambda: "sketch", outputs=[mode_img], show_progress=False, queue=False)
                    inpaint_mode_tab.select(lambda: "inpaint", outputs=[mode_img], show_progress=False, queue=False)
                    inpaint_sketch_mode_tab.select(lambda: "inpaint_sketch", outputs=[mode_img], show_progress=False, queue=False)
                    inpaint_upload_mode_tab.select(lambda: "inpaint_upload", outputs=[mode_img], show_progress=False, queue=False)
                    batch_mode_tab.select(lambda: "batch", outputs=[mode_img], show_progress=False, queue=False)
                    img_resize_to_tab.select(lambda: 0, outputs=[img_selected_scale_tab], show_progress=False, queue=False)
                    img_resize_by_tab.select(lambda: 1, outputs=[img_selected_scale_tab], show_progress=False, queue=False)
                    batch_upload_tab.select(lambda: "upload", outputs=[batch_source_type], show_progress=False, queue=False)
                    batch_from_dir_tab.select(lambda: "from dir", outputs=[batch_source_type], show_progress=False, queue=False)
                    img_canvas_copy_outputs = {
                        "img2img": (img_input, img_input_foreground),
                        "sketch": (img_sketch, img_sketch_foreground),
                        "inpaint": (img_inpaint, img_inpaint_foreground),
                        "inpaint_sketch": (img_inpaint_sketch, img_inpaint_sketch_foreground),
                    }
                    for copy_button, source_mode, source_background, source_foreground, target_mode in img_canvas_copy_buttons:
                        target_background, target_foreground = img_canvas_copy_outputs[target_mode]
                        copy_button.click(
                            lambda background, foreground, current_state, source_mode=source_mode, target_mode=target_mode: _copy_img2img_canvas_clicked(
                                background,
                                foreground,
                                source_mode,
                                target_mode,
                                current_state,
                            ),
                            inputs=[source_background, source_foreground, state],
                            outputs=[target_background, target_foreground, mode_img, img_status],
                            show_progress=False,
                            queue=False,
                        )
                    img_stop.click(
                        _stop_output_clicked,
                        inputs=[state],
                        outputs=[img_status],
                        show_progress="hidden",
                        queue=False,
                    )
                    img_skip.click(
                        _skip_output_clicked,
                        inputs=[state],
                        outputs=[img_status],
                        show_progress="hidden",
                        queue=False,
                    )
                    img_res_switch_btn.click(
                        _switch_dimensions_clicked,
                        inputs=[img_width, img_height, state],
                        outputs=[img_width, img_height, img_status],
                        show_progress=False,
                    )
                    img_detect_size_btn.click(
                        _detect_img2img_size_clicked,
                        inputs=[mode_img, img_input, img_sketch, img_inpaint, img_inpaint_sketch, img_inpaint_upload, state],
                        outputs=[img_width, img_height, img_status],
                        show_progress=False,
                    )
                    img_integrated["multidiffusion_detect_size"].click(
                        _detect_img2img_size_clicked,
                        inputs=[mode_img, img_input, img_sketch, img_inpaint, img_inpaint_sketch, img_inpaint_upload, state],
                        outputs=[
                            img_integrated["multidiffusion_tile_width"],
                            img_integrated["multidiffusion_tile_height"],
                            img_status,
                        ],
                        show_progress=False,
                    )
                    img_paste_params.click(
                        _paste_img2img_params_clicked,
                        inputs=[img_prompt, img_infotext_raw, state],
                        outputs=[
                            img_status,
                            img_prompt,
                            img_negative,
                            img_sampler,
                            img_scheduler,
                            img_steps,
                            img_width,
                            img_height,
                            img_cfg_scale,
                            img_seed,
                            *_script_send_outputs(img_script, img_script_controls),
                            img_denoising_strength,
                        ],
                        show_progress=False,
                    )
                    img_clear_prompt.click(
                        _clear_prompts_clicked,
                        inputs=[state],
                        outputs=[img_prompt, img_negative, img_status],
                        show_progress=False,
                    )
                    _wire_style_controls(img_styles, img_prompt, img_negative, state, img_status)
                    _wire_controlnet_image_tools(img_integrated, img_width, img_height, state, img_status, preset)
                    _wire_batch_edit_controls(img_integrated, state)
                    _wire_script_controls(img_script, img_script_controls)
                    if img_tipo:
                        _wire_tipo_controls(img_tipo, prompt=img_prompt, width=img_width, height=img_height, state=state)
                    _wire_extra_network_browser(img_ti_browser, preset, img_prompt, img_negative, checkpoint, img_lora_dropdown)
                    _wire_extra_network_browser(img_checkpoint_browser, preset, img_prompt, img_negative, checkpoint, img_lora_dropdown)
                    _wire_extra_network_browser(img_lora_browser, preset, img_prompt, img_negative, checkpoint, img_lora_dropdown)

                with gr.Tab(_label("Extras", "后期处理"), elem_id="forge_neo_extras_tab"):
                    extras_mode = gr.State("single")
                    with gr.Row(elem_classes=["forge-neo-extras-workspace"]):
                        with gr.Column(scale=1, elem_classes=["forge-neo-extras-left"]):
                            with gr.Column(scale=1, elem_classes=["forge-neo-extras-source"]):
                                with gr.Tabs(elem_id="forge_neo_extras_mode_tabs", elem_classes=["forge-neo-mode-tabs"]):
                                    with gr.Tab(_label("Single Image", "单张图片"), elem_id="forge_neo_extras_single_tab") as extras_single_tab:
                                        extras_image = gr.Image(
                                            label=_label("Source", "源图"),
                                            type="pil",
                                            image_mode="RGBA",
                                            sources="upload",
                                            height="52vh",
                                            placeholder=_label("Drop Image Here - or - Click to Upload", "将图像拖放到此处 - 或 - 点击上传"),
                                            elem_id="forge_neo_extras_image",
                                            elem_classes=["forge-neo-img2img-input"],
                                        )
                                    with gr.Tab(_label("Batch Process", "批量处理"), elem_id="forge_neo_extras_batch_process_tab") as extras_batch_tab:
                                        extras_batch_files = gr.Files(
                                            label=_label("Batch Process", "批量处理"),
                                            elem_id="forge_neo_extras_image_batch",
                                        )
                                    with gr.Tab(_label("Batch from Directory", "目录批量"), elem_id="forge_neo_extras_batch_directory_tab") as extras_directory_tab:
                                        extras_input_dir = gr.Textbox(
                                            label=_label("Input directory", "输入目录"),
                                            placeholder=_label(
                                                "A local directory on this machine.",
                                                "本机上的图片目录。",
                                            ),
                                            elem_id="forge_neo_extras_batch_input_dir",
                                        )
                                        extras_output_dir = gr.Textbox(
                                            label=_label("Output directory", "输出目录"),
                                            placeholder=_label(
                                                "Leave empty to use userhome\\ForgeNeo\\extras.",
                                                "留空则使用 userhome\\ForgeNeo\\extras。",
                                            ),
                                            elem_id="forge_neo_extras_batch_output_dir",
                                        )
                                        extras_show_results = gr.Checkbox(
                                            True,
                                            label=_label("Show result images", "显示结果图片"),
                                            elem_id="forge_neo_extras_show_results",
                                        )
                                extras_video_input = gr.Textbox(
                                    value="",
                                    visible=False,
                                    show_label=False,
                                    container=False,
                                )
                            with gr.Accordion(
                                _label("Upscale", "放大"),
                                open=True,
                                elem_id="forge_neo_extras_upscale",
                                elem_classes=["forge-neo-input-accordion", "forge-neo-extras-controls"],
                            ):
                                with gr.Tabs(elem_id="forge_neo_extras_resize_tabs", elem_classes=["forge-neo-mode-tabs"]):
                                    with gr.Tab(_label("Resize by", "按倍率缩放"), elem_id="forge_neo_extras_resize_by_tab") as extras_resize_by_tab:
                                        extras_resize_scale = gr.Slider(
                                            0.25,
                                            8.0,
                                            value=4.0,
                                            step=0.05,
                                            label=_label("Scale", "倍率"),
                                            elem_id="forge_neo_extras_resize_scale",
                                        )
                                        extras_max_side_length = gr.Slider(
                                            0,
                                            8192,
                                            value=0,
                                            step=8,
                                            label=_label("Max Side Length", "最大边长"),
                                            elem_id="forge_neo_extras_max_side_length",
                                        )
                                    with gr.Tab(_label("Resize to", "缩放到"), elem_id="forge_neo_extras_resize_to_tab") as extras_resize_to_tab:
                                        with gr.Row():
                                            extras_resize_width = gr.Slider(
                                                64,
                                                8192,
                                                value=1024,
                                                step=8,
                                                label=_label("Width", "宽度"),
                                                elem_id="forge_neo_extras_resize_width",
                                            )
                                            extras_resize_height = gr.Slider(
                                                64,
                                                8192,
                                                value=1024,
                                                step=8,
                                                label=_label("Height", "高度"),
                                                elem_id="forge_neo_extras_resize_height",
                                            )
                                        extras_crop = gr.Checkbox(
                                            True,
                                            label=_label("Crop to fit", "裁剪适配"),
                                            elem_id="forge_neo_extras_crop",
                                        )
                                extras_resize_mode = gr.State("Scale by")
                                with gr.Row(elem_classes=["forge-neo-extras-upscalers"]):
                                    extras_upscaler_1 = gr.Dropdown(
                                        _extras_upscaler_choices(include_none=True),
                                        value="None",
                                        label=_label("Upscaler 1", "放大器 1"),
                                        elem_id="forge_neo_extras_upscaler_1",
                                    )
                                    extras_upscaler_2 = gr.Dropdown(
                                        _extras_upscaler_choices(include_none=True),
                                        value="None",
                                        label=_label("Upscaler 2", "放大器 2"),
                                        elem_id="forge_neo_extras_upscaler_2",
                                    )
                                with gr.Row(elem_classes=["forge-neo-extras-color-row"]):
                                    extras_color_correction = gr.Checkbox(
                                        False,
                                        label=_label("Color Correction", "颜色校正"),
                                        elem_id="forge_neo_extras_color_correction",
                                    )
                                    extras_upscaler_2_visibility = gr.Slider(
                                        0,
                                        1,
                                        value=0,
                                        step=0.01,
                                        label=_label("Upscaler 2 visibility", "放大器 2 权重"),
                                        elem_id="forge_neo_extras_upscaler_2_visibility",
                                    )
                                with gr.Row(elem_classes=["forge-neo-extras-face-row"], visible=False):
                                    extras_gfpgan = gr.Slider(
                                        0,
                                        1,
                                        value=0,
                                        step=0.01,
                                        label="GFPGAN",
                                        elem_id="forge_neo_extras_gfpgan",
                                    )
                                    extras_codeformer = gr.Slider(
                                        0,
                                        1,
                                        value=0,
                                        step=0.01,
                                        label="CodeFormer",
                                        elem_id="forge_neo_extras_codeformer",
                                    )
                                    extras_codeformer_weight = gr.Slider(
                                        0,
                                        1,
                                        value=0.5,
                                        step=0.01,
                                        label=_label("CodeFormer weight", "CodeFormer 权重"),
                                        elem_id="forge_neo_extras_codeformer_weight",
                                    )
                        with gr.Column(scale=1, elem_classes=["forge-neo-results", "forge-neo-extras-results"]):
                            with gr.Column(elem_classes=["forge-neo-generate-box", "forge-neo-extras-generate-box"]):
                                extras_process = gr.Button(_label("Generate", "生成"), elem_id="forge_neo_extras_generate", variant="primary")
                                extras_stop = gr.Button(_label("Stop", "停止"), elem_id="forge_neo_extras_stop", elem_classes=["forge-neo-interrupt-button"])
                                extras_skip = gr.Button(_label("Skip", "跳过"), elem_id="forge_neo_extras_skip", elem_classes=["forge-neo-skip-button"])
                            extras_gallery = gr.Gallery(
                                label="",
                                show_label=False,
                                columns=1,
                                height=300,
                                interactive=False,
                                elem_id="forge_neo_extras_gallery",
                                visible=True,
                            )
                            extras_gallery_selected_index = gr.State("-1")
                            with gr.Row(
                                elem_id="forge_neo_image_buttons_extras",
                                elem_classes=["forge-neo-output-actions"],
                                visible=True,
                            ):
                                extras_open_folder = _tool_button("📂", elem_id="forge_neo_extras_open_folder")
                                extras_send_img2img = _tool_button("🖼️", elem_id="forge_neo_extras_send_to_img2img")
                                extras_send_inpaint = _tool_button("🎨️", elem_id="forge_neo_extras_send_to_inpaint")
                                extras_send_extras = _tool_button("📐", elem_id="forge_neo_extras_send_to_extras")
                            extras_infotext = gr.HTML(_infotext_html(""), elem_id="forge_neo_extras_infotext")
                            extras_infotext_raw = gr.State("")
                            extras_output_folder = gr.State(str(outputs_dir()))
                            extras_status = gr.HTML(
                                elem_id="forge_neo_extras_status",
                                visible=False,
                            )
                    extras_single_tab.select(lambda: "single", outputs=[extras_mode], queue=False)
                    extras_batch_tab.select(lambda: "batch", outputs=[extras_mode], queue=False)
                    extras_directory_tab.select(lambda: "directory", outputs=[extras_mode], queue=False)
                    extras_resize_by_tab.select(lambda: "Scale by", outputs=[extras_resize_mode], queue=False)
                    extras_resize_to_tab.select(lambda: "Scale to", outputs=[extras_resize_mode], queue=False)
                    extras_process.click(
                        _extras_clicked,
                        inputs=[
                            state,
                            extras_mode,
                            extras_image,
                            extras_batch_files,
                            extras_input_dir,
                            extras_output_dir,
                            extras_show_results,
                            extras_resize_mode,
                            extras_resize_scale,
                            extras_max_side_length,
                            extras_resize_width,
                            extras_resize_height,
                            extras_crop,
                            extras_upscaler_1,
                            extras_upscaler_2,
                            extras_upscaler_2_visibility,
                            extras_color_correction,
                            extras_gfpgan,
                            extras_codeformer,
                            extras_codeformer_weight,
                            extras_video_input,
                        ],
                        outputs=[extras_gallery, extras_infotext, extras_status, extras_output_folder],
                    )
                    extras_gallery.select(
                        _gallery_selected_index,
                        outputs=[extras_gallery_selected_index],
                        show_progress=False,
                        queue=False,
                    )
                    extras_stop.click(
                        _extras_stop_clicked,
                        inputs=[state],
                        outputs=[extras_status],
                        show_progress="hidden",
                        queue=False,
                    )
                    extras_skip.click(
                        _extras_skip_clicked,
                        inputs=[state],
                        outputs=[extras_status],
                        show_progress="hidden",
                        queue=False,
                    )
                storyboard_source_rendered = render_source_extension_tab(
                    "sd-webui-Storyboard-Assistant",
                    "scripts/sd_MultiModal.py",
                    "storyboard_tab",
                    visible=storyboard_assistant_available(),
                )
                if storyboard_source_rendered:
                    with gr.Tab(
                        _label("Storyboard Assistant Bridge", "分镜助手桥接"),
                        visible=False,
                        elem_id="forge_neo_storyboard_bridge_tab",
                    ):
                        storyboard_gallery = gr.Gallery(
                            storyboard_gallery_values(1),
                            label=_label("Storyboard Wall", "分镜墙"),
                            visible=False,
                            elem_id="forge_neo_storyboard_bridge_gallery",
                        )
                        storyboard_summary = gr.HTML(
                            _storyboard_summary_html(1, state_value),
                            visible=False,
                            elem_id="forge_neo_storyboard_bridge_summary",
                        )
                        storyboard_status = gr.HTML(
                            "",
                            visible=False,
                            elem_id="forge_neo_storyboard_bridge_status",
                        )
                        storyboard_current_page = gr.Number(
                            value=1,
                            visible=False,
                            elem_id="forge_neo_storyboard_bridge_current_page",
                        )
                        storyboard_total_pages = gr.Number(
                            value=1,
                            visible=False,
                            elem_id="forge_neo_storyboard_bridge_total_pages",
                        )
                        storyboard_cell_images = [
                            gr.Image(visible=False, elem_id=f"forge_neo_storyboard_bridge_cell_image_{index + 1}")
                            for index in range(STORYBOARDS_PER_PAGE)
                        ]
                        storyboard_cell_audios = [
                            gr.Audio(visible=False, elem_id=f"forge_neo_storyboard_bridge_cell_audio_{index + 1}")
                            for index in range(STORYBOARDS_PER_PAGE)
                        ]
                        storyboard_cell_annotations = [
                            gr.Textbox(visible=False, elem_id=f"forge_neo_storyboard_bridge_cell_annotation_{index + 1}")
                            for index in range(STORYBOARDS_PER_PAGE)
                        ]
                        storyboard_cell_labels = [
                            gr.HTML("", visible=False, elem_id=f"forge_neo_storyboard_bridge_cell_label_{index + 1}")
                            for index in range(STORYBOARDS_PER_PAGE)
                        ]
                        storyboard_outputs = [
                            storyboard_gallery,
                            *storyboard_cell_images,
                            *storyboard_cell_audios,
                            *storyboard_cell_annotations,
                            *storyboard_cell_labels,
                            storyboard_summary,
                            storyboard_status,
                            storyboard_current_page,
                            storyboard_total_pages,
                        ]
                else:
                    with gr.Tab(
                        _label("Storyboard Assistant", "分镜助手"),
                        visible=storyboard_assistant_available(),
                        elem_id="forge_neo_storyboard_tab",
                    ):
                        storyboard_story_choices = story_script_choices()
                        storyboard_selected_story = storyboard_story_choices[0] if storyboard_story_choices else ""
                        storyboard_initial_story = load_story_script(storyboard_selected_story)
                        storyboard_initial_genre = str(storyboard_initial_story.get("genre") or STORY_GENRES[0])
                        (
                            storyboard_initial_character_choices,
                            storyboard_initial_character_page,
                            storyboard_initial_character_total_pages,
                            _storyboard_initial_character_count,
                        ) = story_character_choices(storyboard_selected_story, 1)
                        storyboard_selected_character = storyboard_initial_character_choices[0] if storyboard_initial_character_choices else ""
                        storyboard_initial_character = load_story_character(storyboard_selected_story, storyboard_selected_character)
                        storyboard_initial_character_image = str(storyboard_initial_character.get("image_path") or "")
                        if not storyboard_initial_character_image or not Path(storyboard_initial_character_image).is_file():
                            storyboard_initial_character_image = None
                        (
                            storyboard_initial_images,
                            storyboard_initial_audios,
                            storyboard_initial_annotations,
                            storyboard_initial_labels,
                            storyboard_initial_page,
                            storyboard_initial_total_pages,
                            _storyboard_initial_total_count,
                        ) = storyboard_cell_values(1)
                        gr.Markdown(_label("### 🎬 Storyboard Assistant - Professional", "### 🎬 分镜助手 - 专业版"))
                        with gr.Row(elem_classes=["forge-neo-storyboard-workspace"]):
                            with gr.Column(scale=1, min_width=420, elem_classes=["forge-neo-storyboard-panel", "forge-neo-storyboard-script-panel"]):
                                gr.Markdown(_label("#### 📖 Story Management", "#### 📖 剧本管理"))
                                with gr.Row(elem_classes=["forge-neo-storyboard-script-toolbar"]):
                                    storyboard_story_selector = gr.Dropdown(
                                        label=_label("Story", "选择故事"),
                                        choices=storyboard_story_choices,
                                        value=storyboard_selected_story,
                                        allow_custom_value=True,
                                        interactive=True,
                                        elem_id="forge_neo_storyboard_story_selector",
                                        scale=3,
                                    )
                                    storyboard_new_story = gr.Button(
                                        _label("New", "新建"),
                                        elem_id="forge_neo_storyboard_new_story",
                                        min_width=72,
                                        scale=1,
                                    )
                                with gr.Group(elem_classes=["forge-neo-storyboard-editor"]):
                                    with gr.Row(elem_classes=["forge-neo-storyboard-title-row"]):
                                        storyboard_story_title = gr.Textbox(
                                            label=_label("Story title", "故事标题"),
                                            value=str(storyboard_initial_story.get("title") or ""),
                                            lines=1,
                                            elem_id="forge_neo_storyboard_story_title",
                                        )
                                        storyboard_story_genre = gr.Dropdown(
                                            label=_label("Genre", "题材类型"),
                                            choices=_storyboard_genre_choices(storyboard_initial_genre),
                                            value=storyboard_initial_genre,
                                            interactive=True,
                                            elem_id="forge_neo_storyboard_story_genre",
                                        )
                                    storyboard_full_script = gr.Textbox(
                                        label=_label("Full script editor", "完整剧本编辑器"),
                                        value=str(storyboard_initial_story.get("script") or ""),
                                        lines=20,
                                        max_lines=50,
                                        elem_id="forge_neo_storyboard_full_script",
                                    )
                                with gr.Row(elem_classes=["forge-neo-storyboard-script-actions"]):
                                    storyboard_save_story = gr.Button(
                                        _label("Save script", "保存剧本"),
                                        elem_id="forge_neo_storyboard_save_story",
                                        variant="primary",
                                    )
                                    storyboard_delete_story = gr.Button(
                                        _label("Delete story", "删除此故事"),
                                        elem_id="forge_neo_storyboard_delete_story",
                                        variant="stop",
                                    )
                                    storyboard_export_script = gr.Button(
                                        _label("Export script", "导出剧本"),
                                        elem_id="forge_neo_storyboard_export_script",
                                    )
                                storyboard_script_download = gr.DownloadButton(
                                    label=_label("Download script export", "下载剧本导出"),
                                    value=None,
                                    elem_id="forge_neo_storyboard_script_download",
                                )
                                storyboard_script_status = gr.HTML(
                                    "",
                                    elem_id="forge_neo_storyboard_script_status",
                                    visible=False,
                                )
                                with gr.Accordion(
                                    _label(
                                        f"Character profiles ({CHARACTERS_PER_PAGE} per page)",
                                        f"角色小传（每页 {CHARACTERS_PER_PAGE} 个）",
                                    ),
                                    open=False,
                                    elem_classes=["forge-neo-storyboard-manager", "forge-neo-storyboard-character-panel"],
                                ):
                                    with gr.Row(elem_classes=["forge-neo-storyboard-character-page-row"]):
                                        storyboard_character_prev = gr.Button(
                                            _label("Prev", "上一页"),
                                            elem_id="forge_neo_storyboard_character_prev",
                                            min_width=40,
                                        )
                                        storyboard_character_page = gr.Number(
                                            value=storyboard_initial_character_page,
                                            label=_label("Current page", "当前页"),
                                            precision=0,
                                            interactive=False,
                                            elem_id="forge_neo_storyboard_character_page",
                                        )
                                        storyboard_character_total_pages = gr.Number(
                                            value=storyboard_initial_character_total_pages,
                                            label=_label("Total pages", "总页数"),
                                            precision=0,
                                            interactive=False,
                                            elem_id="forge_neo_storyboard_character_total_pages",
                                        )
                                        storyboard_character_next = gr.Button(
                                            _label("Next", "下一页"),
                                            elem_id="forge_neo_storyboard_character_next",
                                            min_width=40,
                                        )
                                    with gr.Row(elem_classes=["forge-neo-storyboard-character-toolbar"]):
                                        storyboard_character_selector = gr.Dropdown(
                                            label=_label("Character", "选择角色"),
                                            choices=storyboard_initial_character_choices,
                                            value=storyboard_selected_character,
                                            allow_custom_value=True,
                                            interactive=True,
                                            elem_id="forge_neo_storyboard_character_selector",
                                            scale=3,
                                        )
                                        storyboard_new_character = gr.Button(
                                            _label("New", "新建"),
                                            elem_id="forge_neo_storyboard_new_character",
                                            min_width=72,
                                            scale=1,
                                        )
                                    with gr.Row(elem_classes=["forge-neo-storyboard-character-editor-row"]):
                                        storyboard_character_image = gr.Image(
                                            value=storyboard_initial_character_image,
                                            label=_label("Character image", "角色图片"),
                                            sources=["upload", "clipboard"],
                                            type="pil",
                                            height=220,
                                            elem_id="forge_neo_storyboard_character_image",
                                            scale=1,
                                        )
                                        storyboard_character_editor = gr.Textbox(
                                            label=_label("Character profile", "角色小传"),
                                            value=str(storyboard_initial_character.get("content") or ""),
                                            placeholder=_label(
                                                "Name:\nAge:\nPersonality:\nAppearance:\nBackground:\nRole in story:",
                                                "姓名：\n年龄：\n性格：\n外貌：\n背景：\n故事中的作用：",
                                            ),
                                            lines=12,
                                            max_lines=24,
                                            elem_id="forge_neo_storyboard_character_editor",
                                            scale=2,
                                        )
                                    with gr.Row(elem_classes=["forge-neo-storyboard-character-actions"]):
                                        storyboard_save_character = gr.Button(
                                            _label("Save character", "保存角色"),
                                            elem_id="forge_neo_storyboard_save_character",
                                            variant="primary",
                                        )
                                        storyboard_delete_character = gr.Button(
                                            _label("Delete character", "删除角色"),
                                            elem_id="forge_neo_storyboard_delete_character",
                                            variant="stop",
                                        )
                                        storyboard_delete_character_image = gr.Button(
                                            _label("Remove image", "移除图片"),
                                            elem_id="forge_neo_storyboard_delete_character_image",
                                        )
                                    storyboard_character_status = gr.HTML(
                                        "",
                                        elem_id="forge_neo_storyboard_character_status",
                                        visible=False,
                                    )
                            with gr.Column(scale=2, min_width=640, elem_classes=["forge-neo-storyboard-wall", "forge-neo-storyboard-board-panel"]):
                                gr.Markdown(_label("#### 🎨 Storyboard Wall (9 per page)", "#### 🎨 分镜墙（每页 9 个）"))
                                storyboard_gallery = gr.Gallery(
                                    storyboard_gallery_values(1),
                                    label=_label("Storyboard Wall", "分镜墙"),
                                    columns=3,
                                    rows=3,
                                    height=520,
                                    interactive=False,
                                    elem_id="forge_neo_storyboard_gallery",
                                    visible=False,
                                )
                                storyboard_cell_images = []
                                storyboard_cell_audios = []
                                storyboard_cell_annotations = []
                                storyboard_cell_labels = []
                                storyboard_cell_deletes = []
                                with gr.Column(elem_classes=["forge-neo-storyboard-cell-grid"]):
                                    for storyboard_row_index in range(3):
                                        with gr.Row(elem_classes=["forge-neo-storyboard-cell-row"]):
                                            for storyboard_col_index in range(3):
                                                storyboard_cell_index = storyboard_row_index * 3 + storyboard_col_index
                                                with gr.Group(elem_classes=["forge-neo-storyboard-cell"], elem_id=f"forge_neo_storyboard_cell_{storyboard_cell_index + 1}"):
                                                    storyboard_cell_label = gr.HTML(
                                                        storyboard_initial_labels[storyboard_cell_index],
                                                        elem_id=f"forge_neo_storyboard_cell_label_{storyboard_cell_index + 1}",
                                                    )
                                                    storyboard_cell_image = gr.Image(
                                                        value=storyboard_initial_images[storyboard_cell_index],
                                                        label=_label("Image", "图片"),
                                                        show_label=False,
                                                        sources=["upload", "clipboard"],
                                                        type="pil",
                                                        height=160,
                                                        elem_id=f"forge_neo_storyboard_cell_image_{storyboard_cell_index + 1}",
                                                    )
                                                    storyboard_cell_audio = gr.Audio(
                                                        value=storyboard_initial_audios[storyboard_cell_index],
                                                        label=_label("Audio", "音频"),
                                                        sources=["upload"],
                                                        type="filepath",
                                                        interactive=True,
                                                        elem_id=f"forge_neo_storyboard_cell_audio_{storyboard_cell_index + 1}",
                                                    )
                                                    storyboard_cell_annotation = gr.Textbox(
                                                        value=storyboard_initial_annotations[storyboard_cell_index],
                                                        label=_label("Annotation", "注释"),
                                                        placeholder=_label("Annotation...", "注释..."),
                                                        lines=2,
                                                        max_lines=2,
                                                        elem_id=f"forge_neo_storyboard_cell_annotation_{storyboard_cell_index + 1}",
                                                    )
                                                    storyboard_cell_delete = gr.Button(
                                                        _label("Clear", "清空"),
                                                        elem_id=f"forge_neo_storyboard_cell_delete_{storyboard_cell_index + 1}",
                                                        variant="stop",
                                                        min_width=80,
                                                    )
                                                storyboard_cell_images.append(storyboard_cell_image)
                                                storyboard_cell_audios.append(storyboard_cell_audio)
                                                storyboard_cell_annotations.append(storyboard_cell_annotation)
                                                storyboard_cell_labels.append(storyboard_cell_label)
                                                storyboard_cell_deletes.append(storyboard_cell_delete)
                                storyboard_summary = gr.HTML(
                                    _storyboard_summary_html(1, state_value),
                                    elem_id="forge_neo_storyboard_summary",
                                    visible=True,
                                )
                                with gr.Row(elem_classes=["forge-neo-storyboard-pagination"]):
                                    storyboard_prev = gr.Button(
                                        _label("Prev", "上一页"),
                                        elem_id="forge_neo_storyboard_prev",
                                        min_width=40,
                                    )
                                    storyboard_current_page = gr.Number(
                                        value=storyboard_initial_page,
                                        label=_label("Current page", "当前页"),
                                        precision=0,
                                        interactive=False,
                                        elem_id="forge_neo_storyboard_current_page",
                                    )
                                    storyboard_total_pages = gr.Number(
                                        value=storyboard_initial_total_pages,
                                        label=_label("Total pages", "总页数"),
                                        precision=0,
                                        interactive=False,
                                        elem_id="forge_neo_storyboard_total_pages",
                                    )
                                    storyboard_next = gr.Button(
                                        _label("Next", "下一页"),
                                        elem_id="forge_neo_storyboard_next",
                                        min_width=40,
                                    )
                                with gr.Row(elem_classes=["forge-neo-storyboard-actions"]):
                                    storyboard_refresh = gr.Button(
                                        _label("Refresh", "刷新"),
                                        elem_id="forge_neo_storyboard_refresh",
                                    )
                                    storyboard_add_blank = gr.Button(
                                        _label("Add frame", "添加分镜"),
                                        elem_id="forge_neo_storyboard_add_blank",
                                    )
                                with gr.Row(elem_classes=["forge-neo-storyboard-actions"]):
                                    storyboard_export = gr.Button(
                                        _label("Export storyboard", "导出分镜"),
                                        elem_id="forge_neo_storyboard_export",
                                    )
                                    storyboard_clear = gr.Button(
                                        _label("Clear all", "清空全部"),
                                        elem_id="forge_neo_storyboard_clear",
                                        variant="stop",
                                    )
                                with gr.Accordion(_label("Audio file management", "音频文件管理"), open=False, elem_classes=["forge-neo-storyboard-manager"]):
                                    with gr.Row(elem_classes=["forge-neo-storyboard-manager-row"]):
                                        storyboard_audio_source = gr.Number(
                                            value=1,
                                            label=_label("Source frame", "源分镜编号"),
                                            precision=0,
                                            elem_id="forge_neo_storyboard_audio_source",
                                        )
                                        storyboard_audio_target = gr.Number(
                                            value=1,
                                            label=_label("Target frame", "目标分镜编号"),
                                            precision=0,
                                            elem_id="forge_neo_storyboard_audio_target",
                                        )
                                    with gr.Row(elem_classes=["forge-neo-storyboard-actions"]):
                                        storyboard_audio_move = gr.Button(
                                            _label("Move audio", "移动音频"),
                                            elem_id="forge_neo_storyboard_audio_move",
                                        )
                                        storyboard_audio_delete = gr.Button(
                                            _label("Delete audio", "删除音频"),
                                            elem_id="forge_neo_storyboard_audio_delete",
                                            variant="stop",
                                        )
                                with gr.Accordion(_label("Frame management", "分镜格移动管理"), open=False, elem_classes=["forge-neo-storyboard-manager"]):
                                    with gr.Row(elem_classes=["forge-neo-storyboard-manager-row"]):
                                        storyboard_move_source = gr.Number(
                                            value=1,
                                            label=_label("Source frame", "源分镜编号"),
                                            precision=0,
                                            elem_id="forge_neo_storyboard_move_source",
                                        )
                                        storyboard_move_target = gr.Number(
                                            value=1,
                                            label=_label("Target frame", "目标分镜编号"),
                                            precision=0,
                                            elem_id="forge_neo_storyboard_move_target",
                                        )
                                    with gr.Row(elem_classes=["forge-neo-storyboard-actions"]):
                                        storyboard_move_to = gr.Button(
                                            _label("Move frame", "移动分镜"),
                                            elem_id="forge_neo_storyboard_move_to",
                                        )
                                        storyboard_delete_frame = gr.Button(
                                            _label("Delete frame", "删除分镜"),
                                            elem_id="forge_neo_storyboard_delete_frame",
                                            variant="stop",
                                        )
                                storyboard_download = gr.DownloadButton(
                                    label=_label("Download storyboard export", "下载分镜导出"),
                                    value=None,
                                    elem_id="forge_neo_storyboard_download",
                                )
                                storyboard_status = gr.HTML(
                                    "",
                                    elem_id="forge_neo_storyboard_status",
                                    visible=False,
                                )
                        storyboard_script_outputs = [
                            storyboard_story_selector,
                            storyboard_story_title,
                            storyboard_story_genre,
                            storyboard_full_script,
                            storyboard_script_download,
                            storyboard_script_status,
                        ]
                        storyboard_character_outputs = [
                            storyboard_character_selector,
                            storyboard_character_editor,
                            storyboard_character_image,
                            storyboard_character_page,
                            storyboard_character_total_pages,
                            storyboard_character_status,
                        ]
                        storyboard_outputs = [
                            storyboard_gallery,
                            *storyboard_cell_images,
                            *storyboard_cell_audios,
                            *storyboard_cell_annotations,
                            *storyboard_cell_labels,
                            storyboard_summary,
                            storyboard_status,
                            storyboard_current_page,
                            storyboard_total_pages,
                        ]
                        storyboard_story_selector.change(
                            _storyboard_story_selected,
                            inputs=[storyboard_story_selector, state],
                            outputs=[
                                storyboard_story_title,
                                storyboard_story_genre,
                                storyboard_full_script,
                                storyboard_script_status,
                            ],
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_story_selector.change(
                            _storyboard_character_story_changed,
                            inputs=[state, storyboard_story_selector],
                            outputs=storyboard_character_outputs,
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_new_story_event = storyboard_new_story.click(
                            _storyboard_new_story_clicked,
                            inputs=[state],
                            outputs=storyboard_script_outputs,
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_new_story_event.then(
                            _storyboard_character_story_changed,
                            inputs=[state, storyboard_story_selector],
                            outputs=storyboard_character_outputs,
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_save_story_event = storyboard_save_story.click(
                            _storyboard_save_story_clicked,
                            inputs=[
                                state,
                                storyboard_story_selector,
                                storyboard_story_title,
                                storyboard_story_genre,
                                storyboard_full_script,
                            ],
                            outputs=storyboard_script_outputs,
                            show_progress=False,
                        )
                        storyboard_save_story_event.then(
                            _storyboard_character_story_changed,
                            inputs=[state, storyboard_story_selector],
                            outputs=storyboard_character_outputs,
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_delete_story_event = storyboard_delete_story.click(
                            _storyboard_delete_story_clicked,
                            inputs=[state, storyboard_story_selector],
                            outputs=storyboard_script_outputs,
                            show_progress=False,
                        )
                        storyboard_delete_story_event.then(
                            _storyboard_character_story_changed,
                            inputs=[state, storyboard_story_selector],
                            outputs=storyboard_character_outputs,
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_export_script.click(
                            _storyboard_export_script_clicked,
                            inputs=[state, storyboard_story_selector],
                            outputs=[storyboard_script_download, storyboard_script_status],
                            show_progress=False,
                        )
                        storyboard_character_selector.change(
                            _storyboard_character_selected,
                            inputs=[state, storyboard_story_selector, storyboard_character_selector],
                            outputs=[storyboard_character_editor, storyboard_character_image, storyboard_character_status],
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_new_character.click(
                            _storyboard_new_character_clicked,
                            inputs=[state],
                            outputs=[storyboard_character_selector, storyboard_character_editor, storyboard_character_image, storyboard_character_status],
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_save_character.click(
                            _storyboard_save_character_clicked,
                            inputs=[
                                state,
                                storyboard_story_selector,
                                storyboard_character_selector,
                                storyboard_character_editor,
                                storyboard_character_image,
                                storyboard_character_page,
                            ],
                            outputs=storyboard_character_outputs,
                            show_progress=False,
                        )
                        storyboard_delete_character.click(
                            _storyboard_delete_character_clicked,
                            inputs=[state, storyboard_story_selector, storyboard_character_selector, storyboard_character_page],
                            outputs=storyboard_character_outputs,
                            show_progress=False,
                        )
                        storyboard_delete_character_image.click(
                            _storyboard_delete_character_image_clicked,
                            inputs=[state, storyboard_story_selector, storyboard_character_selector, storyboard_character_page],
                            outputs=storyboard_character_outputs,
                            show_progress=False,
                        )
                        storyboard_character_prev.click(
                            _storyboard_character_prev_clicked,
                            inputs=[state, storyboard_story_selector, storyboard_character_page],
                            outputs=storyboard_character_outputs,
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_character_next.click(
                            _storyboard_character_next_clicked,
                            inputs=[state, storyboard_story_selector, storyboard_character_page],
                            outputs=storyboard_character_outputs,
                            show_progress=False,
                            queue=False,
                        )
                        for storyboard_cell_index, storyboard_cell_image in enumerate(storyboard_cell_images):
                            storyboard_cell_image.upload(
                                lambda state_value, page_value, image_value, cell_index=storyboard_cell_index: _storyboard_cell_image_changed(
                                    state_value,
                                    page_value,
                                    image_value,
                                    cell_index,
                                ),
                                inputs=[state, storyboard_current_page, storyboard_cell_image],
                                outputs=storyboard_outputs,
                                show_progress=False,
                            )
                        for storyboard_cell_index, storyboard_cell_audio in enumerate(storyboard_cell_audios):
                            storyboard_cell_audio.upload(
                                lambda state_value, page_value, audio_value, cell_index=storyboard_cell_index: _storyboard_cell_audio_changed(
                                    state_value,
                                    page_value,
                                    audio_value,
                                    cell_index,
                                ),
                                inputs=[state, storyboard_current_page, storyboard_cell_audio],
                                outputs=storyboard_outputs,
                                show_progress=False,
                            )
                        for storyboard_cell_index, storyboard_cell_annotation in enumerate(storyboard_cell_annotations):
                            storyboard_cell_annotation.change(
                                lambda state_value, page_value, text_value, cell_index=storyboard_cell_index: _storyboard_cell_annotation_changed(
                                    state_value,
                                    page_value,
                                    text_value,
                                    cell_index,
                                ),
                                inputs=[state, storyboard_current_page, storyboard_cell_annotation],
                                outputs=storyboard_outputs,
                                show_progress=False,
                                queue=False,
                            )
                        for storyboard_cell_index, storyboard_cell_delete in enumerate(storyboard_cell_deletes):
                            storyboard_cell_delete.click(
                                lambda state_value, page_value, cell_index=storyboard_cell_index: _storyboard_cell_delete_clicked(
                                    state_value,
                                    page_value,
                                    cell_index,
                                ),
                                inputs=[state, storyboard_current_page],
                                outputs=storyboard_outputs,
                                show_progress=False,
                            )
                        storyboard_audio_move.click(
                            _storyboard_move_audio_clicked,
                            inputs=[state, storyboard_audio_source, storyboard_audio_target],
                            outputs=storyboard_outputs,
                            show_progress=False,
                        )
                        storyboard_audio_delete.click(
                            _storyboard_delete_audio_clicked,
                            inputs=[state, storyboard_audio_source],
                            outputs=storyboard_outputs,
                            show_progress=False,
                        )
                        storyboard_move_to.click(
                            _storyboard_move_frame_clicked,
                            inputs=[state, storyboard_move_source, storyboard_move_target],
                            outputs=storyboard_outputs,
                            show_progress=False,
                        )
                        storyboard_delete_frame.click(
                            _storyboard_delete_frame_clicked,
                            inputs=[state, storyboard_move_source],
                            outputs=storyboard_outputs,
                            show_progress=False,
                        )
                        storyboard_refresh.click(
                            _storyboard_refresh_clicked,
                            inputs=[state, storyboard_current_page],
                            outputs=storyboard_outputs,
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_prev.click(
                            _storyboard_prev_clicked,
                            inputs=[state, storyboard_current_page],
                            outputs=storyboard_outputs,
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_next.click(
                            _storyboard_next_clicked,
                            inputs=[state, storyboard_current_page],
                            outputs=storyboard_outputs,
                            show_progress=False,
                            queue=False,
                        )
                        storyboard_add_blank.click(
                            _storyboard_add_blank_clicked,
                            inputs=[state],
                            outputs=storyboard_outputs,
                            show_progress=False,
                        )
                        storyboard_clear.click(
                            _storyboard_clear_clicked,
                            inputs=[state],
                            outputs=storyboard_outputs,
                            show_progress=False,
                        )
                        storyboard_export.click(
                            _storyboard_export_clicked,
                            inputs=[state],
                            outputs=[storyboard_download, *storyboard_outputs],
                            show_progress=False,
                        )
                with gr.Tab(_label("PNG Info", "PNG 图片信息"), elem_id="forge_neo_pnginfo_tab"):
                    with gr.Row(elem_classes=["forge-neo-pnginfo-workspace"]):
                        with gr.Column(scale=1, elem_classes=["forge-neo-pnginfo-source"]):
                            png_image = gr.Image(
                                label=_label("Source", "源图"),
                                type="pil",
                                image_mode=None,
                                sources="upload",
                                height="54vh",
                                placeholder=_label("Drop Image Here - or - Click to Upload", "将图像拖放到此处 - 或 - 点击上传"),
                                elem_id="forge_neo_pnginfo_image",
                                elem_classes=["forge-neo-img2img-input"],
                            )
                        with gr.Column(scale=1, elem_classes=["forge-neo-pnginfo-panel"]):
                            png_info_html = gr.HTML(
                                "",
                                elem_id="forge_neo_pnginfo_html",
                                visible=False,
                            )
                            png_text = gr.State("")
                            with gr.Row(elem_classes=["forge-neo-pnginfo-actions"]):
                                png_send_txt = gr.Button(
                                    _label("Send to txt2img", "发送到文生图"),
                                    elem_id="forge_neo_pnginfo_send_to_txt2img",
                                )
                                png_send_img = gr.Button(
                                    _label("Send to img2img", "发送到图生图"),
                                    elem_id="forge_neo_pnginfo_send_to_img2img",
                                )
                                png_send_inpaint = gr.Button(
                                    _label("Send to inpaint", "发送到局部重绘"),
                                    elem_id="forge_neo_pnginfo_send_to_inpaint",
                                )
                                png_send_extras = gr.Button(
                                    _label("Send to extras", "发送到后期处理"),
                                    elem_id="forge_neo_pnginfo_send_to_extras",
                                )
                            png_status = gr.HTML(
                                "",
                                elem_id="forge_neo_pnginfo_status",
                                visible=False,
                            )
                    png_image.change(
                        _read_png_clicked,
                        inputs=[png_image, state],
                        outputs=[png_text, png_info_html, png_status],
                        show_progress=False,
                        queue=False,
                    )
                    png_send_txt.click(
                        _send_png_to_txt2img,
                        inputs=[png_text, state],
                        outputs=[
                            png_status,
                            prompt,
                            negative_prompt,
                            sampler,
                            scheduler,
                            steps,
                            width,
                            height,
                            cfg_scale,
                            seed,
                            *_script_send_outputs(script, script_controls),
                        ],
                    )
                    png_send_img.click(
                        _send_png_image_to_img2img,
                        inputs=[png_text, png_image, state],
                        outputs=[
                            png_status,
                            img_input,
                            img_prompt,
                            img_negative,
                            img_sampler,
                            img_scheduler,
                            img_steps,
                            img_width,
                            img_height,
                            img_cfg_scale,
                            img_seed,
                            *_script_send_outputs(img_script, img_script_controls),
                            img_denoising_strength,
                        ],
                    )
                    png_send_inpaint.click(
                        _send_png_image_to_inpaint,
                        inputs=[png_text, png_image, state],
                        outputs=[
                            png_status,
                            img_inpaint,
                            img_prompt,
                            img_negative,
                            img_sampler,
                            img_scheduler,
                            img_steps,
                            img_width,
                            img_height,
                            img_cfg_scale,
                            img_seed,
                            *_script_send_outputs(img_script, img_script_controls),
                            img_denoising_strength,
                            mode_img,
                        ],
                    )
                    png_send_extras.click(_send_png_to_extras, inputs=[png_image, state], outputs=[extras_image, png_status])
                with gr.Tab(_label("Checkpoint Merger", "模型融合"), elem_id="forge_neo_modelmerger_tab"):
                    with gr.Accordion(
                        _label("Save Current Checkpoint (including all quantization)", "保存当前模型（包含量化状态）"),
                        open=True,
                        elem_id="forge_neo_modelmerger_save_current",
                        elem_classes=["forge-neo-input-accordion"],
                    ):
                        with gr.Row(elem_classes=["forge-neo-merger-save-row"]):
                            merger_save_filename = gr.Textbox(
                                value="my_model.safetensors",
                                label=_label("Filename (will save in /models/Stable-diffusion)", "文件名（原生后端会保存到 /models/Stable-diffusion）"),
                                elem_id="forge_neo_modelmerger_save_filename",
                            )
                            merger_save_unet = gr.Button(
                                _label("Save UNet", "保存 UNet"),
                                elem_id="forge_neo_modelmerger_save_unet",
                            )
                            merger_save_checkpoint = gr.Button(
                                _label("Save Checkpoint", "保存模型"),
                                elem_id="forge_neo_modelmerger_save_checkpoint",
                            )
                        merger_save_result = gr.HTML(
                            _initial_current_checkpoint_save_notice(),
                            elem_id="forge_neo_modelmerger_save_result",
                        )

                    with gr.Row(equal_height=False, elem_classes=["forge-neo-merger-workspace"]):
                        with gr.Column(scale=2, elem_classes=["forge-neo-merger-panel"]):
                            merger_interp_description = gr.HTML(
                                _merger_interp_description_html("Weighted sum"),
                                elem_id="forge_neo_modelmerger_interp_description",
                            )
                            with gr.Row(elem_id="forge_neo_modelmerger_models", elem_classes=["forge-neo-merger-models"]):
                                with gr.Row(elem_classes=["forge-neo-merger-model-pair"]):
                                    merger_primary = gr.Dropdown(
                                        model_choices.checkpoints,
                                        value=first_or_none(model_choices.checkpoints),
                                        label=_label("Primary model (A)", "主模型 (A)"),
                                        allow_custom_value=True,
                                        elem_id="forge_neo_modelmerger_primary_model_name",
                                        elem_classes=["forge-neo-merger-model-select"],
                                    )
                                    merger_primary_refresh = gr.Button(
                                        "🔄",
                                        elem_id="forge_neo_modelmerger_refresh_primary",
                                        elem_classes=["forge-neo-tool-button", "forge-neo-merger-refresh"],
                                    )
                                with gr.Row(elem_classes=["forge-neo-merger-model-pair"]):
                                    merger_secondary = gr.Dropdown(
                                        model_choices.checkpoints,
                                        value=first_or_none(model_choices.checkpoints),
                                        label=_label("Secondary model (B)", "副模型 (B)"),
                                        allow_custom_value=True,
                                        elem_id="forge_neo_modelmerger_secondary_model_name",
                                        elem_classes=["forge-neo-merger-model-select"],
                                    )
                                    merger_secondary_refresh = gr.Button(
                                        "🔄",
                                        elem_id="forge_neo_modelmerger_refresh_secondary",
                                        elem_classes=["forge-neo-tool-button", "forge-neo-merger-refresh"],
                                    )
                                with gr.Row(elem_classes=["forge-neo-merger-model-pair"]):
                                    merger_tertiary = gr.Dropdown(
                                        model_choices.checkpoints,
                                        value=first_or_none(model_choices.checkpoints),
                                        label=_label("Tertiary model (C)", "第三模型 (C)"),
                                        allow_custom_value=True,
                                        elem_id="forge_neo_modelmerger_tertiary_model_name",
                                        elem_classes=["forge-neo-merger-model-select"],
                                    )
                                    merger_tertiary_refresh = gr.Button(
                                        "🔄",
                                        elem_id="forge_neo_modelmerger_refresh_tertiary",
                                        elem_classes=["forge-neo-tool-button", "forge-neo-merger-refresh"],
                                    )
                            merger_custom_name = gr.Textbox(
                                label=_label("Custom Name (Optional)", "自定义名称（可选）"),
                                elem_id="forge_neo_modelmerger_custom_name",
                            )
                            merger_interp_amount = gr.Slider(
                                0.0,
                                1.0,
                                value=0.3,
                                step=0.05,
                                label=_label("Multiplier (M) - set to 0 to get model A", "倍率 (M) - 设为 0 得到模型 A"),
                                elem_id="forge_neo_modelmerger_interp_amount",
                            )
                            merger_interp_method = gr.Radio(
                                _localized_value_choices(
                                    [
                                        ("No interpolation", "不插值"),
                                        ("Weighted sum", "加权和"),
                                        ("Add difference", "差值相加"),
                                    ]
                                ),
                                value="Weighted sum",
                                label=_label("Interpolation Method", "插值方法"),
                                elem_id="forge_neo_modelmerger_interp_method",
                            )
                            with gr.Row(elem_classes=["forge-neo-merger-options"]):
                                merger_checkpoint_format = gr.Radio(
                                    ["ckpt", "safetensors"],
                                    value="safetensors",
                                    label=_label("Checkpoint format", "模型格式"),
                                    elem_id="forge_neo_modelmerger_checkpoint_format",
                                )
                                merger_save_as_half = gr.Checkbox(
                                    False,
                                    label=_label("Save as float16", "保存为 float16"),
                                    elem_id="forge_neo_modelmerger_save_as_half",
                                )
                            with gr.Row(elem_classes=["forge-neo-merger-options"]):
                                merger_config_source = gr.Radio(
                                    _localized_value_choices(
                                        [
                                            ("A, B or C", "A、B 或 C"),
                                            ("B", "B"),
                                            ("C", "C"),
                                            ("Don't", "不复制"),
                                        ]
                                    ),
                                    value="A, B or C",
                                    label=_label("Copy config from", "复制配置来源"),
                                    elem_id="forge_neo_modelmerger_config_method",
                                )
                                with gr.Row(elem_classes=["forge-neo-merger-model-pair"]):
                                    merger_bake_in_vae = gr.Dropdown(
                                        _localized_value_choices([("None", "无")]) + model_choices.vae,
                                        value="None",
                                        label=_label("Bake in VAE", "烘焙 VAE"),
                                        allow_custom_value=True,
                                        elem_id="forge_neo_modelmerger_bake_in_vae",
                                        elem_classes=["forge-neo-merger-model-select"],
                                    )
                                    merger_vae_refresh = gr.Button(
                                        "🔄",
                                        elem_id="forge_neo_modelmerger_refresh_vae",
                                        elem_classes=["forge-neo-tool-button", "forge-neo-merger-refresh"],
                                    )
                            merger_discard_weights = gr.Textbox(
                                value="",
                                label=_label("Discard weights with matching name", "丢弃匹配名称的权重"),
                                elem_id="forge_neo_modelmerger_discard_weights",
                            )
                            with gr.Accordion(
                                _label("Metadata", "元数据"),
                                open=False,
                                elem_id="forge_neo_modelmerger_metadata",
                            ) as merger_metadata_editor:
                                with gr.Row(elem_classes=["forge-neo-merger-options"]):
                                    merger_save_metadata = gr.Checkbox(
                                        True,
                                        label=_label("Save metadata", "保存元数据"),
                                        elem_id="forge_neo_modelmerger_save_metadata",
                                    )
                                    merger_add_recipe = gr.Checkbox(
                                        True,
                                        label=_label("Add merge recipe metadata", "添加合并配方元数据"),
                                        elem_id="forge_neo_modelmerger_add_recipe",
                                    )
                                    merger_copy_metadata = gr.Checkbox(
                                        True,
                                        label=_label("Copy metadata from merged models", "复制被合并模型的元数据"),
                                        elem_id="forge_neo_modelmerger_copy_metadata",
                                    )
                                merger_metadata_json = gr.Textbox(
                                    "{}",
                                    label=_label("Metadata in JSON format", "JSON 格式元数据"),
                                    lines=9,
                                    elem_id="forge_neo_modelmerger_metadata_json",
                                )
                                merger_read_metadata = gr.Button(
                                    _label("Read metadata from selected checkpoints", "读取所选模型元数据"),
                                    elem_id="forge_neo_modelmerger_read_metadata",
                                )
                            merger_merge = gr.Button(
                                _label("Merge", "合并"),
                                variant="primary",
                                elem_id="forge_neo_modelmerger_merge",
                            )
                        with gr.Column(
                            scale=1,
                            elem_id="forge_neo_modelmerger_results_container",
                            elem_classes=["forge-neo-merger-results"],
                        ):
                            merger_result = gr.HTML(
                                "",
                                elem_id="forge_neo_modelmerger_result",
                                show_label=False,
                                visible=False,
                            )
                            merger_recipe_json = gr.HTML(
                                _merger_recipe_json_html("{}"),
                                elem_id="forge_neo_modelmerger_recipe_json",
                                visible=False,
                            )
                            merger_status = gr.HTML(
                                "",
                                elem_id="forge_neo_modelmerger_status",
                                visible=False,
                            )
                    merger_save_unet.click(
                        lambda filename, current_state, current_checkpoint, current_text_encoders, current_low_bits: _save_current_checkpoint_notice_update(
                            filename,
                            current_state,
                            "unet",
                            current_checkpoint,
                            current_text_encoders,
                            current_low_bits,
                        ),
                        inputs=[merger_save_filename, state, checkpoint, text_encoders, low_bits],
                        outputs=[merger_save_result],
                        show_progress=False,
                    )
                    merger_save_checkpoint.click(
                        lambda filename, current_state, current_checkpoint, current_text_encoders, current_low_bits: _save_current_checkpoint_notice_update(
                            filename,
                            current_state,
                            "checkpoint",
                            current_checkpoint,
                            current_text_encoders,
                            current_low_bits,
                        ),
                        inputs=[merger_save_filename, state, checkpoint, text_encoders, low_bits],
                        outputs=[merger_save_result],
                        show_progress=False,
                    )
                    merger_interp_method.change(
                        _merger_interp_description_html,
                        inputs=[merger_interp_method],
                        outputs=[merger_interp_description],
                        show_progress=False,
                    )
                    merger_checkpoint_format.change(
                        lambda fmt: gr.update(visible=fmt == "safetensors"),
                        inputs=[merger_checkpoint_format],
                        outputs=[merger_metadata_editor],
                        show_progress=False,
                    )
                    merger_read_metadata.click(
                        _read_merger_metadata_clicked,
                        inputs=[merger_primary, merger_secondary, merger_tertiary],
                        outputs=[merger_metadata_json],
                        show_progress=False,
                    )
                    for merger_refresh_button in (
                        merger_primary_refresh,
                        merger_secondary_refresh,
                        merger_tertiary_refresh,
                        merger_vae_refresh,
                    ):
                        merger_refresh_button.click(
                            _refresh_merger_models,
                            inputs=[preset],
                            outputs=[merger_primary, merger_secondary, merger_tertiary, merger_bake_in_vae],
                            show_progress=False,
                        )
                    merger_merge.click(
                        _merger_clicked,
                        inputs=[
                            state,
                            merger_primary,
                            merger_secondary,
                            merger_tertiary,
                            merger_interp_method,
                            merger_interp_amount,
                            merger_save_as_half,
                            merger_custom_name,
                            merger_checkpoint_format,
                            merger_config_source,
                            merger_bake_in_vae,
                            merger_discard_weights,
                            merger_save_metadata,
                            merger_add_recipe,
                            merger_copy_metadata,
                            merger_metadata_json,
                        ],
                        outputs=[merger_result, merger_recipe_json, merger_status],
                        show_progress=False,
                    )
                _create_civitai_helper_tabs(prompt, negative_prompt, img_prompt, img_negative, state_value)
                create_dynamic_prompts_wildcards_tab(visible=dynamic_prompts_available(), lang=state_value["__lang"])
                _create_wd14_tagger_tab(state)
                _create_infinite_browsing_tab(state_value)
                _create_camera_angle_selector_tab(state_value)
                _create_aesthetic_enhancement_tab(state_value)
                _create_multimodal_media_tab(state_value)
                _create_qwen_vision_chat_tab(state_value)
                _create_sam_matting_tab(state_value)
                _create_see_through_tab(state_value)
                _create_trellis2_tab(state_value)
                with gr.Tab(_label("Settings", "设置"), elem_id="forge_neo_settings_tab", render_children=True):
                    with gr.Row(elem_classes=["forge-neo-settings-toolbar"]):
                        settings_submit = gr.Button(
                            _label("Apply settings", "应用设置"),
                            variant="primary",
                            elem_id="forge_neo_settings_submit",
                        )
                        settings_reload_ui = gr.Button(
                            _label("Reload UI", "重载 UI"),
                            variant="primary",
                            elem_id="forge_neo_settings_restart_gradio",
                        )
                    settings_result = gr.HTML(
                        "",
                        elem_id="forge_neo_settings_result",
                        visible=False,
                    )
                    with gr.Row(elem_classes=["forge-neo-settings-row", "forge-neo-settings-search-row"]):
                        settings_search = gr.Textbox(
                            value="",
                            placeholder=_label("Search...", "搜索..."),
                            show_label=False,
                            container=False,
                            max_lines=1,
                            elem_id="forge_neo_settings_search",
                        )
                    with gr.Tabs(elem_id="forge_neo_settings", elem_classes=["forge-neo-settings-tabs"]):
                        with gr.Tab(_label("Paths for Saving", "保存路径"), elem_id="forge_neo_settings_paths_for_saving", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel", "forge-neo-settings-paths-panel"]):
                                settings_output_dir = gr.Textbox(
                                    value=settings_initial["output_dir"],
                                    label=_label(
                                        "Output Directory (if empty, default to userhome\\ForgeNeo)",
                                        "输出目录（留空时使用 userhome\\ForgeNeo）",
                                    ),
                                    elem_id="forge_neo_setting_output_dir",
                                )
                                settings_txt2img_samples_dir = gr.Textbox(
                                    value=settings_initial["outdir_txt2img_samples"],
                                    label=_label("Output Directory for txt2img Images", "文生图图片输出目录"),
                                    elem_id="forge_neo_setting_outdir_txt2img_samples",
                                )
                                settings_img2img_samples_dir = gr.Textbox(
                                    value=settings_initial["outdir_img2img_samples"],
                                    label=_label("Output Directory for img2img Images", "图生图图片输出目录"),
                                    elem_id="forge_neo_setting_outdir_img2img_samples",
                                )
                                settings_extras_samples_dir = gr.Textbox(
                                    value=settings_initial["outdir_extras_samples"],
                                    label=_label("Output Directory for Extras Images", "后期处理图片输出目录"),
                                    elem_id="forge_neo_setting_outdir_extras_samples",
                                )
                                settings_video_dir = gr.Textbox(
                                    value=settings_initial["outdir_video"],
                                    visible=False,
                                    show_label=False,
                                    container=False,
                                )
                                settings_grids_dir = gr.Textbox(
                                    value=settings_initial["outdir_grids"],
                                    label=_label(
                                        "Output Directory for Grids (if empty, default to the two folders below)",
                                        "宫格图输出目录（留空时使用下面两个目录）",
                                    ),
                                    elem_id="forge_neo_setting_outdir_grids",
                                )
                                settings_txt2img_grids_dir = gr.Textbox(
                                    value=settings_initial["outdir_txt2img_grids"],
                                    label=_label("Output Directory for txt2img Grids", "文生图宫格输出目录"),
                                    elem_id="forge_neo_setting_outdir_txt2img_grids",
                                )
                                settings_img2img_grids_dir = gr.Textbox(
                                    value=settings_initial["outdir_img2img_grids"],
                                    label=_label("Output Directory for img2img Grids", "图生图宫格输出目录"),
                                    elem_id="forge_neo_setting_outdir_img2img_grids",
                                )
                                settings_save_dir = gr.Textbox(
                                    value=settings_initial["outdir_save"],
                                    label=_label(
                                        'Directory for manually saving images via the "Save" button',
                                        "使用“保存”按钮手动保存图片的目录",
                                    ),
                                    elem_id="forge_neo_setting_outdir_save",
                                )
                                settings_init_images_dir = gr.Textbox(
                                    value=settings_initial["outdir_init_images"],
                                    label=_label(
                                        "Directory for saving img2img init images if enabled",
                                        "启用时保存图生图初始图的目录",
                                    ),
                                    elem_id="forge_neo_setting_outdir_init_images",
                                )
                        with gr.Tab(_label("Saving Images/Grids", "图像/宫格保存"), elem_id="forge_neo_settings_saving_images_grids", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_save_samples = gr.Checkbox(
                                    value=settings_initial["save_samples"],
                                    label=_label(
                                        'Automatically save every generated image (if disabled, images will needed to be manually saved via the "Save Image" button)',
                                        "自动保存每张生成图片（关闭后需要使用“保存图片”按钮手动保存）",
                                    ),
                                    elem_id="forge_neo_setting_save_samples",
                                )
                                settings_samples_format = gr.Radio(
                                    ["png", "jpg", "webp"],
                                    value=settings_initial["samples_format"],
                                    label=_label("Image Format", "图片格式"),
                                    elem_id="forge_neo_setting_samples_format",
                                )
                                settings_filename_pattern = gr.Textbox(
                                    value=settings_initial["samples_filename_pattern"],
                                    label=_label("[wiki] Filename pattern for saving images", "[wiki] 图片文件名模板"),
                                    elem_id="forge_neo_setting_samples_filename_pattern",
                                )
                                settings_save_images_add_number = gr.Checkbox(
                                    value=settings_initial["save_images_add_number"],
                                    label=_label("Append an ascending number to the filename", "文件名追加递增编号"),
                                    elem_id="forge_neo_setting_save_images_add_number",
                                )
                                settings_save_images_existing_action = gr.Radio(
                                    _localized_value_choices(
                                        [
                                            ("Override", "覆盖"),
                                            ("Number Suffix", "数字后缀"),
                                        ]
                                    ),
                                    value=settings_initial["save_images_existing_action"],
                                    label=_label("Behavior when saving image to an existing filename", "保存到已有文件名时的行为"),
                                    elem_id="forge_neo_setting_save_images_existing_action",
                                )
                                settings_grid_save = gr.Checkbox(
                                    value=settings_initial["grid_save"],
                                    label=_label("Automatically save every generated image grid (e.g. for X/Y/Z Plot)", "自动保存生成宫格图（例如 X/Y/Z Plot）"),
                                    elem_id="forge_neo_setting_grid_save",
                                )
                                settings_grid_format = gr.Radio(
                                    ["png", "jpg", "webp"],
                                    value=settings_initial["grid_format"],
                                    label=_label("Image Format for Grids", "宫格图格式"),
                                    elem_id="forge_neo_setting_grid_format",
                                )
                                settings_grid_extended_filename = gr.Checkbox(
                                    value=settings_initial["grid_extended_filename"],
                                    label=_label(
                                        "Append extended info (seed, prompt, etc.) to the filename when saving grids",
                                        "保存宫格图时在文件名追加扩展信息（seed、prompt 等）",
                                    ),
                                    elem_id="forge_neo_setting_grid_extended_filename",
                                )
                                settings_grid_only_if_multiple = gr.Checkbox(
                                    value=settings_initial["grid_only_if_multiple"],
                                    label=_label("Do not save grids that contain only one image", "不保存只包含一张图的宫格"),
                                    elem_id="forge_neo_setting_grid_only_if_multiple",
                                )
                                settings_grid_prevent_empty_spots = gr.Checkbox(
                                    value=settings_initial["grid_prevent_empty_spots"],
                                    label=_label("Prevent empty gaps within a grid", "避免宫格图出现空位"),
                                    elem_id="forge_neo_setting_grid_prevent_empty_spots",
                                )
                                settings_zip_filename_pattern = gr.Textbox(
                                    value=settings_initial["grid_zip_filename_pattern"],
                                    label=_label("[wiki] Filename pattern for saving .zip archives", "[wiki] .zip 压缩包文件名模板"),
                                    elem_id="forge_neo_setting_grid_zip_filename_pattern",
                                )
                                settings_grid_row_count = gr.Number(
                                    value=settings_initial["grid_row_count"],
                                    label=_label("Grid Row Count (-1 for autodetect; 0 for the same as batch size)", "宫格行数（-1 自动检测；0 等于批量大小）"),
                                    precision=0,
                                    elem_id="forge_neo_setting_grid_row_count",
                                )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_grid_text_color = gr.Textbox(
                                        value=settings_initial["grid_text_color"],
                                        label=_label("Text Color for image grids", "宫格图文字颜色"),
                                        elem_id="forge_neo_setting_grid_text_color",
                                    )
                                    settings_grid_inactive_text_color = gr.Textbox(
                                        value=settings_initial["grid_inactive_text_color"],
                                        label=_label("Inactive Text Color for image grids", "宫格图非活动文字颜色"),
                                        elem_id="forge_neo_setting_grid_inactive_text_color",
                                    )
                                    settings_grid_background_color = gr.Textbox(
                                        value=settings_initial["grid_background_color"],
                                        label=_label("Background Color for image grids", "宫格图背景颜色"),
                                        elem_id="forge_neo_setting_grid_background_color",
                                    )
                                settings_save_init_img = gr.Checkbox(
                                    value=settings_initial["save_init_img"],
                                    label=_label("Save a copy of the init image before img2img", "图生图前保存初始图副本"),
                                    elem_id="forge_neo_setting_save_init_img",
                                )
                                settings_save_before_face_restoration = gr.Checkbox(
                                    value=settings_initial["save_before_face_restoration"],
                                    label=_label("Save a copy of the image before face restoration", "面部修复前保存图片副本"),
                                    elem_id="forge_neo_setting_save_before_face_restoration",
                                )
                                settings_save_before_highres_fix = gr.Checkbox(
                                    value=settings_initial["save_before_highres_fix"],
                                    label=_label("Save a copy of the image before Hires. fix", "高清修复前保存图片副本"),
                                    elem_id="forge_neo_setting_save_before_highres_fix",
                                )
                                settings_save_before_color_correction = gr.Checkbox(
                                    value=settings_initial["save_before_color_correction"],
                                    label=_label("Save a copy of the image before color correction", "颜色校正前保存图片副本"),
                                    elem_id="forge_neo_setting_save_before_color_correction",
                                )
                                settings_save_mask = gr.Checkbox(
                                    value=settings_initial["save_mask"],
                                    label=_label("For inpainting, save a copy of the greyscale mask", "局部重绘时保存灰度蒙版副本"),
                                    elem_id="forge_neo_setting_save_mask",
                                )
                                settings_save_mask_composite = gr.Checkbox(
                                    value=settings_initial["save_mask_composite"],
                                    label=_label("For inpainting, save the masked composite", "局部重绘时保存蒙版合成图"),
                                    elem_id="forge_neo_setting_save_mask_composite",
                                )
                                settings_jpeg_quality = gr.Slider(
                                    1,
                                    100,
                                    value=settings_initial["jpeg_quality"],
                                    step=1,
                                    label=_label("JPEG Quality", "JPEG 质量"),
                                    elem_id="forge_neo_setting_jpeg_quality",
                                )
                                settings_webp_lossless = gr.Checkbox(
                                    value=settings_initial["webp_lossless"],
                                    label=_label("Lossless WebP", "无损 WebP"),
                                    elem_id="forge_neo_setting_webp_lossless",
                                )
                                settings_save_large_images_as_jpg = gr.Checkbox(
                                    value=settings_initial["save_large_images_as_jpg"],
                                    label=_label("Save copies of large images as JPG (if the following limits are met)", "满足下面限制时将大图副本保存为 JPG"),
                                    elem_id="forge_neo_setting_save_large_images_as_jpg",
                                )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_large_image_jpg_file_limit = gr.Number(
                                        value=settings_initial["large_image_jpg_file_limit"],
                                        label=_label("File Size limit for the above option (in MB)", "上述选项的文件大小限制（MB）"),
                                        precision=0,
                                        elem_id="forge_neo_setting_large_image_jpg_file_limit",
                                    )
                                    settings_large_image_jpg_dimension_limit = gr.Number(
                                        value=settings_initial["large_image_jpg_dimension_limit"],
                                        label=_label("Width/height limit for the above option", "上述选项的宽高限制"),
                                        precision=0,
                                        elem_id="forge_neo_setting_large_image_jpg_dimension_limit",
                                    )
                                settings_save_write_log_csv = gr.Checkbox(
                                    value=settings_initial["save_write_log_csv"],
                                    label=_label(
                                        'Write generation parameters to log.csv when using the "Save" button',
                                        "使用“保存”按钮时写入 log.csv",
                                    ),
                                    elem_id="forge_neo_setting_save_write_log_csv",
                                )
                                settings_save_selected_only = gr.Checkbox(
                                    value=settings_initial["save_selected_only"],
                                    label=_label(
                                        'When using the "Save" button, only save the selected image',
                                        "使用“保存”按钮时只保存选中的图片",
                                    ),
                                    elem_id="forge_neo_setting_save_selected_only",
                                )
                        settings_video_save_frames = gr.Checkbox(
                            value=settings_initial["video_save_frames"],
                            visible=False,
                            show_label=False,
                            container=False,
                        )
                        settings_video_play_on_finish = gr.Checkbox(
                            value=settings_initial["video_play_on_finish"],
                            visible=False,
                            show_label=False,
                            container=False,
                        )
                        settings_video_loop_playback = gr.Checkbox(
                            value=settings_initial["video_loop_playback"],
                            visible=False,
                            show_label=False,
                            container=False,
                        )
                        settings_video_crf = gr.Slider(
                            0,
                            51,
                            value=settings_initial["video_crf"],
                            step=1,
                            visible=False,
                            show_label=False,
                            container=False,
                        )
                        settings_video_preset = gr.Textbox(
                            value=settings_initial["video_preset"],
                            visible=False,
                            show_label=False,
                            container=False,
                        )
                        settings_video_profile = gr.Textbox(
                            value=settings_initial["video_profile"],
                            visible=False,
                            show_label=False,
                            container=False,
                        )
                        settings_video_extension = gr.Radio(
                            ["mp4", "mkv"],
                            value=settings_initial["video_extension"],
                            visible=False,
                            show_label=False,
                            container=False,
                        )
                        with gr.Tab(_label("Saving to Subdirectory", "保存到子目录"), elem_id="forge_neo_settings_saving_subdirectory", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_save_to_dirs = gr.Checkbox(
                                    value=settings_initial["save_to_dirs"],
                                    label=_label("Save Images to Subdirectory", "保存图片到子目录"),
                                    elem_id="forge_neo_setting_save_to_dirs",
                                )
                                settings_grid_save_to_dirs = gr.Checkbox(
                                    value=settings_initial["grid_save_to_dirs"],
                                    label=_label("Save Grids to Subdirectory", "保存宫格图到子目录"),
                                    elem_id="forge_neo_setting_grid_save_to_dirs",
                                )
                                settings_save_to_dirs_for_ui = gr.Checkbox(
                                    value=settings_initial["save_to_dirs_for_ui"],
                                    label=_label(
                                        'Save to subdirectory when manually saving images via the "Save" button',
                                        "通过“保存”按钮手动保存图片时保存到子目录",
                                    ),
                                    elem_id="forge_neo_setting_save_to_dirs_for_ui",
                                )
                                settings_directories_filename_pattern = gr.Textbox(
                                    value=settings_initial["directories_filename_pattern"],
                                    label=_label("[wiki] Folder name pattern for subdirectories", "[wiki] 子目录文件夹名称模板"),
                                    elem_id="forge_neo_setting_directories_filename_pattern",
                                )
                                settings_directories_max_prompt_words = gr.Number(
                                    value=settings_initial["directories_max_prompt_words"],
                                    label=_label("Max length of prompts for the [prompt_words] pattern", "[prompt_words] 模板的最大提示词长度"),
                                    precision=0,
                                    elem_id="forge_neo_setting_directories_max_prompt_words",
                                )
                        with gr.Tab(_label("ControlNet", "ControlNet"), elem_id="forge_neo_settings_control_net", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_control_net_models_path = gr.Textbox(
                                    value=settings_initial["control_net_models_path"],
                                    label=_label(
                                        "Extra Path to look for ControlNet Models (e.g. training output directory)",
                                        "额外 ControlNet 模型路径（例如训练输出目录）",
                                    ),
                                    elem_id="forge_neo_setting_control_net_models_path",
                                )
                                settings_control_net_unit_count = gr.Slider(
                                    1,
                                    5,
                                    value=settings_initial["control_net_unit_count"],
                                    step=1,
                                    label=_label("Number of ControlNet Units (requires Reload UI)", "ControlNet 单元数量（需要重载 UI）"),
                                    elem_id="forge_neo_setting_control_net_unit_count",
                                )
                                settings_control_net_model_cache_size = gr.Slider(
                                    0,
                                    10,
                                    value=settings_initial["control_net_model_cache_size"],
                                    step=1,
                                    label=_label("Number of Models to Cache in Memory (requires Reload UI)", "内存中缓存的模型数量（需要重载 UI）"),
                                    elem_id="forge_neo_setting_control_net_model_cache_size",
                                )
                                settings_control_net_sync_field_args = gr.Checkbox(
                                    value=settings_initial["control_net_sync_field_args"],
                                    label=_label(
                                        "Read ControlNet parameters from Infotext (requires Reload UI)",
                                        "从 Infotext 读取 ControlNet 参数（需要重载 UI）",
                                    ),
                                    elem_id="forge_neo_setting_control_net_sync_field_args",
                                )
                                settings_control_net_no_detectmap = gr.Checkbox(
                                    value=settings_initial["control_net_no_detectmap"],
                                    label=_label("Do not append detectmap to output", "不将 detectmap 附加到输出"),
                                    elem_id="forge_neo_setting_control_net_no_detectmap",
                                )
                        with gr.Tab(_label("Extra Networks", "额外网络"), elem_id="forge_neo_settings_extra_networks", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_extra_multiplier = gr.Slider(
                                    0.0,
                                    2.0,
                                    value=settings_initial["extra_networks_default_multiplier"],
                                    step=0.05,
                                    label=_label("Default weight for Extra Networks", "额外网络默认权重"),
                                    elem_id="forge_neo_setting_extra_networks_default_multiplier",
                                )
                                settings_extra_separator = gr.Textbox(
                                    value=settings_initial["extra_networks_add_text_separator"],
                                    label=_label("Extra Networks token separator", "额外网络 token 分隔符"),
                                    elem_id="forge_neo_setting_extra_networks_add_text_separator",
                                )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_extra_card_width = gr.Slider(
                                        0,
                                        512,
                                        value=settings_initial["extra_networks_card_width"],
                                        step=8,
                                        label=_label("Card width", "卡片宽度"),
                                        elem_id="forge_neo_setting_extra_networks_card_width",
                                    )
                                    settings_extra_card_height = gr.Slider(
                                        0,
                                        512,
                                        value=settings_initial["extra_networks_card_height"],
                                        step=8,
                                        label=_label("Card height", "卡片高度"),
                                        elem_id="forge_neo_setting_extra_networks_card_height",
                                    )
                        with gr.Tab(_label("Optimizations", "优化"), elem_id="forge_neo_settings_optimizations", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_cross_attention_optimization = gr.Dropdown(
                                    ["Automatic"],
                                    value=settings_initial["cross_attention_optimization"],
                                    label=_label("Cross Attention Optimization", "Cross Attention 优化"),
                                    interactive=False,
                                    elem_id="forge_neo_setting_cross_attention_optimization",
                                )
                                settings_persistent_cond_cache = gr.Checkbox(
                                    value=settings_initial["persistent_cond_cache"],
                                    label=_label(
                                        "Persistent Cond Cache (do not re-encode prompts if only the Seed changes; note: may cause certain Infotext to be missing)",
                                        "持久化 Cond 缓存（仅种子变化时不重新编码提示词；注意：可能导致部分生成信息缺失）",
                                    ),
                                    elem_id="forge_neo_setting_persistent_cond_cache",
                                )
                                settings_skip_early_cond = gr.Slider(
                                    0.0,
                                    1.0,
                                    value=settings_initial["skip_early_cond"],
                                    step=0.05,
                                    label=_label(
                                        "Ignore Negative Prompt during Early Steps (in percentage of total steps; 0 = disable; higher = faster)",
                                        "早期采样忽略负面提示词（占总步数比例；0 为禁用；越高越快）",
                                    ),
                                    elem_id="forge_neo_setting_skip_early_cond",
                                )
                                settings_s_min_uncond = gr.Slider(
                                    0.0,
                                    8.0,
                                    value=settings_initial["s_min_uncond"],
                                    step=0.05,
                                    label=_label(
                                        'Skip Negative Prompt during Later Steps (in "sigma"; 0 = disable; higher = faster)',
                                        '后期采样跳过负面提示词（按 "sigma"；0 为禁用；越高越快）',
                                    ),
                                    elem_id="forge_neo_setting_s_min_uncond",
                                )
                                settings_s_min_uncond_all = gr.Checkbox(
                                    value=settings_initial["s_min_uncond_all"],
                                    label=_label(
                                        "For the above option, skip every step (otherwise, only skip every other step)",
                                        "对上方选项每一步都跳过（否则隔步跳过）",
                                    ),
                                    elem_id="forge_neo_setting_s_min_uncond_all",
                                )
                                gr.HTML(
                                    _label(
                                        '<p class="forge-neo-settings-note"><b>Token Merging</b> speeds up diffusion by fusing redundant tokens, but may reduce quality. <a href="https://github.com/dbolya/tomesd" target="_blank" rel="noopener">GitHub</a><br><b>Note:</b> Has no effect on SDXL when Max Downsample is set to 1.</p>',
                                        '<p class="forge-neo-settings-note"><b>Token Merging</b> 会融合冗余 token 以加快扩散，但可能降低质量。<a href="https://github.com/dbolya/tomesd" target="_blank" rel="noopener">GitHub</a><br><b>注意：</b>当最大下采样为 1 时，对 SDXL 无效。</p>',
                                    ),
                                    elem_id="forge_neo_setting_token_merging_explanation",
                                )
                                settings_token_merging_ratio = gr.Slider(
                                    0.0,
                                    0.9,
                                    value=settings_initial["token_merging_ratio"],
                                    step=0.05,
                                    label=_label("Token Merging Ratio (0 = disable; higher = faster)", "Token Merging 比例（0 为禁用；越高越快）"),
                                    elem_id="forge_neo_setting_token_merging_ratio",
                                )
                                settings_token_merging_ratio_img2img = gr.Slider(
                                    0.0,
                                    0.9,
                                    value=settings_initial["token_merging_ratio_img2img"],
                                    step=0.05,
                                    label=_label(
                                        "Token Merging Ratio for img2img (overrides base ratio if non-zero)",
                                        "图生图 Token Merging 比例（非零时覆盖基础比例）",
                                    ),
                                    elem_id="forge_neo_setting_token_merging_ratio_img2img",
                                )
                                settings_token_merging_ratio_hr = gr.Slider(
                                    0.0,
                                    0.9,
                                    value=settings_initial["token_merging_ratio_hr"],
                                    step=0.05,
                                    label=_label(
                                        "Token Merging Ratio for Hires. fix (overrides base ratio if non-zero)",
                                        "高清修复 Token Merging 比例（非零时覆盖基础比例）",
                                    ),
                                    elem_id="forge_neo_setting_token_merging_ratio_hr",
                                )
                                settings_token_merging_stride = gr.Slider(
                                    1,
                                    8,
                                    value=settings_initial["token_merging_stride"],
                                    step=1,
                                    label=_label("Token Merging - Stride (higher = faster)", "Token Merging - 步幅（越高越快）"),
                                    elem_id="forge_neo_setting_token_merging_stride",
                                )
                                settings_token_merging_downsample = gr.Slider(
                                    1,
                                    4,
                                    value=settings_initial["token_merging_downsample"],
                                    step=1,
                                    label=_label("Token Merging - Max Downsample (higher = faster)", "Token Merging - 最大下采样（越高越快）"),
                                    elem_id="forge_neo_setting_token_merging_downsample",
                                )
                                settings_token_merging_no_rand = gr.Checkbox(
                                    value=settings_initial["token_merging_no_rand"],
                                    label=_label(
                                        "Token Merging - No Random (reduce randomness by always fusing the same regions)",
                                        "Token Merging - 固定融合区域（减少随机性）",
                                    ),
                                    elem_id="forge_neo_setting_token_merging_no_rand",
                                )
                        with gr.Tab(_label("Refiner", "精修"), elem_id="forge_neo_settings_refiner", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_show_refiner = gr.Checkbox(
                                    value=settings_initial["show_refiner"],
                                    label=_label("Display the Refiner Accordion", "显示 Refiner 折叠面板"),
                                    info=_label(
                                        "Refiner swaps the model in the middle of generation. Requires Reload UI.",
                                        "Refiner 会在生成中途切换模型。需要重载 UI。",
                                    ),
                                    elem_id="forge_neo_setting_show_refiner",
                                )
                                settings_refiner_fast_sd = gr.Checkbox(
                                    value=settings_initial["refiner_fast_sd"],
                                    label=_label('Reload "state_dict" Only', '仅重载 "state_dict"'),
                                    info=_label("EXPERIMENTAL", "实验性功能"),
                                    elem_id="forge_neo_setting_refiner_fast_sd",
                                )
                                settings_refiner_use_steps = gr.Checkbox(
                                    value=settings_initial["refiner_use_steps"],
                                    label=_label('Switch based on "steps" instead', '改为基于 "steps" 切换'),
                                    info=_label(
                                        'By default, Refiner swaps the model based on "sigmas".',
                                        '默认情况下，Refiner 基于 "sigmas" 切换模型。',
                                    ),
                                    elem_id="forge_neo_setting_refiner_use_steps",
                                )
                                settings_refiner_lora_replacement = gr.Textbox(
                                    value=settings_initial["refiner_lora_replacement"],
                                    label=_label("Lora Replacements", "Lora 替换"),
                                    lines=3,
                                    max_lines=12,
                                    placeholder="base_lora=refiner_lora",
                                    elem_id="forge_neo_setting_refiner_lora_replacement",
                                )
                                gr.HTML(
                                    _label(
                                        '<p class="forge-neo-settings-note">Use the "Lora Replacements" to load different LoRAs between the normal pass and the refiner pass.<br>Separate the original and the target with an equal sign; place each entry in its own line.</p>',
                                        '<p class="forge-neo-settings-note">使用 "Lora 替换" 在普通阶段和 Refiner 阶段加载不同 LoRA。<br>用等号分隔原始名称和目标名称，每行一条。</p>',
                                    ),
                                    elem_id="forge_neo_setting_refiner_lora_explanation",
                                )
                        with gr.Tab(_label("Sampler Parameters", "采样器参数"), elem_id="forge_neo_settings_sampler_parameters", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_hide_samplers = gr.Dropdown(
                                    all_sampling_choices,
                                    value=settings_initial["hide_samplers"],
                                    label=_label("Hide Samplers (requires Reload UI)", "隐藏采样器（需要重载 UI）"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_hide_samplers",
                                )
                        with gr.Tab(_label("Stable Diffusion", "Stable Diffusion"), elem_id="forge_neo_settings_stable_diffusion", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_sd_unet = gr.Dropdown(
                                        STABLE_DIFFUSION_UNET_CHOICES,
                                        value=settings_initial["sd_unet"],
                                        label=_label("SD UNet", "SD UNet"),
                                        elem_id="forge_neo_setting_sd_unet",
                                        scale=10,
                                    )
                                    settings_sd_unet_refresh = gr.Button("🔄", elem_id="forge_neo_setting_sd_unet_refresh", min_width=40, scale=1)
                                settings_emphasis = gr.Radio(
                                    STABLE_DIFFUSION_EMPHASIS_CHOICES,
                                    value=settings_initial["emphasis"],
                                    label=_label("Emphasis Mode", "强调模式"),
                                    info=_label(
                                        "pay (more:1.1) or (less:0.9) attention to prompts",
                                        "让 (more:1.1) 或 (less:0.9) 这类提示词权重生效",
                                    ),
                                    elem_id="forge_neo_setting_emphasis",
                                )
                                gr.HTML(
                                    _label(
                                        '<p class="forge-neo-settings-note"><b>None</b>: disable Emphasis entirely and treat (:1.2) as literal characters<br><b>Ignore</b>: treat all words as if they have no emphasis<br><b>Original</b>: the original emphasis implementation<br><b>No norm</b>: implementation without normalization, useful for some SDXL cases</p>',
                                        '<p class="forge-neo-settings-note"><b>None</b>：完全关闭强调语法，把 (:1.2) 当普通字符<br><b>Ignore</b>：忽略所有提示词权重<br><b>Original</b>：原始强调实现<br><b>No norm</b>：不做归一化，适合部分 SDXL 场景</p>',
                                    ),
                                    elem_id="forge_neo_setting_emphasis_explanation",
                                )
                                settings_scaling_factor = gr.Slider(
                                    1.0,
                                    1.05,
                                    value=settings_initial["scaling_factor"],
                                    step=0.005,
                                    label=_label("Epsilon Scaling", "Epsilon 缩放"),
                                    info=_label("1.0 = disabled; higher = more detail", "1.0 为禁用；越高细节越多"),
                                    elem_id="forge_neo_setting_scaling_factor",
                                )
                                settings_clip_skip = gr.Slider(
                                    1,
                                    12,
                                    value=settings_initial["CLIP_stop_at_last_layers"],
                                    step=1,
                                    label=_label("Clip Skip", "Clip Skip"),
                                    info=_label("1 = disable, 2 = skip one layer, etc.", "1 为禁用，2 为跳过一层，依此类推"),
                                    elem_id="forge_neo_setting_CLIP_stop_at_last_layers",
                                )
                                settings_comma_padding_backtrack = gr.Slider(
                                    0,
                                    74,
                                    value=settings_initial["comma_padding_backtrack"],
                                    step=1,
                                    label=_label("Token Wrap Length", "Token 换行长度"),
                                    info=_label(
                                        "For short prompts, move them to the next chunk of 75 tokens when they do not fit in the current chunk.",
                                        "短提示词放不进当前 75 token 分块时，移动到下一个分块。",
                                    ),
                                    elem_id="forge_neo_setting_comma_padding_backtrack",
                                )
                                settings_tiling = gr.Checkbox(
                                    value=settings_initial["tiling"],
                                    label=_label("Tiling", "平铺"),
                                    info=_label("produce a tileable image", "生成可平铺图片"),
                                    elem_id="forge_neo_setting_tiling",
                                )
                                settings_randn_source = gr.Radio(
                                    STABLE_DIFFUSION_RNG_CHOICES,
                                    value=settings_initial["randn_source"],
                                    label=_label("Random Number Generator", "随机数生成器"),
                                    info=_label(
                                        "use CPU for the maximum recreatability across different systems",
                                        "使用 CPU 可在不同系统间获得更高可复现性",
                                    ),
                                    elem_id="forge_neo_setting_randn_source",
                                )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_sdxl_crop_top = gr.Number(
                                        value=settings_initial["sdxl_crop_top"],
                                        label=_label("[SDXL] Crop-Top Coordinate", "[SDXL] 顶部裁剪坐标"),
                                        precision=0,
                                        elem_id="forge_neo_setting_sdxl_crop_top",
                                    )
                                    settings_sdxl_crop_left = gr.Number(
                                        value=settings_initial["sdxl_crop_left"],
                                        label=_label("[SDXL] Crop-Left Coordinate", "[SDXL] 左侧裁剪坐标"),
                                        precision=0,
                                        elem_id="forge_neo_setting_sdxl_crop_left",
                                    )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_sdxl_low_score = gr.Number(
                                        value=settings_initial["sdxl_refiner_low_aesthetic_score"],
                                        label=_label("[SDXL] Low Aesthetic Score", "[SDXL] 低美学分数"),
                                        elem_id="forge_neo_setting_sdxl_refiner_low_aesthetic_score",
                                    )
                                    settings_sdxl_high_score = gr.Number(
                                        value=settings_initial["sdxl_refiner_high_aesthetic_score"],
                                        label=_label("[SDXL] High Aesthetic Score", "[SDXL] 高美学分数"),
                                        elem_id="forge_neo_setting_sdxl_refiner_high_aesthetic_score",
                                    )
                                settings_sdxl_zero_neg = gr.Checkbox(
                                    value=settings_initial["sdxl_zero_neg"],
                                    label=_label(
                                        "[SDXL] Zero out the conditioning when negative prompt is empty",
                                        "[SDXL] 负面提示词为空时清零 conditioning",
                                    ),
                                    info=_label(
                                        "old behavior; causes NaN when using SageAttention; requires Reload UI",
                                        "旧行为；使用 SageAttention 时可能产生 NaN；需要重载 UI",
                                    ),
                                    elem_id="forge_neo_setting_sdxl_zero_neg",
                                )
                                settings_lumina_positive = gr.Textbox(
                                    value=settings_initial["neta_template_positive"],
                                    label=_label("[Lumina] Positive Template", "[Lumina] 正向模板"),
                                    lines=3,
                                    max_lines=6,
                                    placeholder="<Prompt Start>",
                                    elem_id="forge_neo_setting_neta_template_positive",
                                )
                                settings_lumina_negative = gr.Textbox(
                                    value=settings_initial["neta_template_negative"],
                                    label=_label("[Lumina] Negative Template", "[Lumina] 负向模板"),
                                    lines=3,
                                    max_lines=6,
                                    placeholder="<Prompt Start>",
                                    elem_id="forge_neo_setting_neta_template_negative",
                                )
                                settings_qwen_vae_resize = gr.Checkbox(
                                    value=settings_initial["qwen_vae_resize"],
                                    label=_label(
                                        "[Qwen-Image-Edit] Resize input image to 1 megapixel for ref_latent",
                                        "[Qwen-Image-Edit] 将输入图缩放到 1 百万像素用于 ref_latent",
                                    ),
                                    elem_id="forge_neo_setting_qwen_vae_resize",
                                )
                                settings_klein_no_reference = gr.Checkbox(
                                    value=settings_initial["klein_no_reference"],
                                    label=_label("[Klein] Disable Reference", "[Klein] 禁用参考"),
                                    info=_label(
                                        "disable Edit; enable img2img; pin to Quicksettings is recommended if changed often",
                                        "禁用 Edit 并启用 img2img；频繁修改时建议放到 Quicksettings",
                                    ),
                                    elem_id="forge_neo_setting_klein_no_reference",
                                )
                        with gr.Tab(_label("VAE", "VAE"), elem_id="forge_neo_settings_vae", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                gr.HTML(
                                    _label(
                                        '<p class="forge-neo-settings-note"><abbr title="Variational AutoEncoder">VAE</abbr> transforms RGB images to and from latent space. txt2img uses VAE after sampling; img2img also uses it to encode the input image before sampling.</p>',
                                        '<p class="forge-neo-settings-note"><abbr title="Variational AutoEncoder">VAE</abbr> 负责在 RGB 图片和 latent space 之间转换。文生图在采样结束后使用 VAE，图生图还会在采样前用它编码输入图。</p>',
                                    ),
                                    elem_id="forge_neo_setting_sd_vae_explanation",
                                )
                                settings_sd_vae = gr.Dropdown(
                                    VAE_SETTING_CHOICES,
                                    value=settings_initial["sd_vae"],
                                    label=_label("SD VAE", "SD VAE"),
                                    info=_label('"SD VAE" option overrides per-model preference', '"SD VAE" 选项会覆盖单模型偏好'),
                                    interactive=False,
                                    elem_id="forge_neo_setting_sd_vae",
                                )
                                settings_sd_vae_encode_method = gr.Radio(
                                    VAE_METHOD_CHOICES,
                                    value=settings_initial["sd_vae_encode_method"],
                                    label=_label("VAE for Encoding", "VAE 编码方式"),
                                    info=_label(
                                        "method to encode image to latent (img2img / Hires. fix / inpaint)",
                                        "将图片编码为 latent 的方式（图生图 / 高清修复 / 局部重绘）",
                                    ),
                                    elem_id="forge_neo_setting_sd_vae_encode_method",
                                )
                                settings_sd_vae_decode_method = gr.Radio(
                                    VAE_METHOD_CHOICES,
                                    value=settings_initial["sd_vae_decode_method"],
                                    label=_label("VAE for Decoding", "VAE 解码方式"),
                                    info=_label("method to decode latent to image", "将 latent 解码为图片的方式"),
                                    elem_id="forge_neo_setting_sd_vae_decode_method",
                                )
                        with gr.Tab(_label("img2img", "图生图"), elem_id="forge_neo_settings_img2img", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_inpainting_mask_weight = gr.Slider(
                                    0.0,
                                    1.0,
                                    value=settings_initial["inpainting_mask_weight"],
                                    step=0.05,
                                    label=_label("Inpainting Conditioning Mask Strength", "局部重绘条件蒙版强度"),
                                    elem_id="forge_neo_setting_inpainting_mask_weight",
                                )
                                settings_initial_noise_multiplier = gr.Slider(
                                    0.0,
                                    1.5,
                                    value=settings_initial["initial_noise_multiplier"],
                                    step=0.05,
                                    label=_label("Noise Multiplier for img2img", "图生图噪声倍率"),
                                    elem_id="forge_neo_setting_initial_noise_multiplier",
                                )
                                settings_img2img_extra_noise = gr.Slider(
                                    0.0,
                                    1.0,
                                    value=settings_initial["img2img_extra_noise"],
                                    step=0.05,
                                    label=_label("Extra Noise Multiplier for img2img and Hires. fix", "图生图和高清修复额外噪声倍率"),
                                    info=_label("0 = disabled; higher = more details in generation", "0 为禁用；越高生成细节越多"),
                                    elem_id="forge_neo_setting_img2img_extra_noise",
                                )
                                settings_img2img_color_correction = gr.Checkbox(
                                    value=settings_initial["img2img_color_correction"],
                                    label=_label(
                                        "Apply color correction to img2img results to match original colors",
                                        "对图生图结果应用颜色校正以匹配原图颜色",
                                    ),
                                    elem_id="forge_neo_setting_img2img_color_correction",
                                )
                                settings_img2img_fix_steps = gr.Checkbox(
                                    value=settings_initial["img2img_fix_steps"],
                                    label=_label(
                                        "During img2img, do exactly the number of Steps the slider specifies",
                                        "图生图时严格使用采样步数滑条指定的步数",
                                    ),
                                    info=_label(
                                        "otherwise, only process Sampling steps x Denoising strength steps",
                                        "否则只处理采样步数 x 重绘幅度对应的步数",
                                    ),
                                    elem_id="forge_neo_setting_img2img_fix_steps",
                                )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_img2img_background_color = gr.ColorPicker(
                                        value=settings_initial["img2img_background_color"],
                                        label=_label(
                                            "For img2img, fill the transparent parts of the input image with this color",
                                            "图生图时用此颜色填充输入图透明区域",
                                        ),
                                        elem_id="forge_neo_setting_img2img_background_color",
                                    )
                                    settings_img2img_sketch_brush_color = gr.ColorPicker(
                                        value=settings_initial["img2img_sketch_default_brush_color"],
                                        label=_label("Initial Brush Color for Sketch", "Sketch 初始画笔颜色"),
                                        info=_label("requires Reload UI", "需要重载 UI"),
                                        elem_id="forge_neo_setting_img2img_sketch_default_brush_color",
                                    )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_img2img_inpaint_mask_brush_color = gr.ColorPicker(
                                        value=settings_initial["img2img_inpaint_mask_brush_color"],
                                        label=_label("Brush Color for Inpaint Mask", "局部重绘蒙版画笔颜色"),
                                        info=_label("requires Reload UI", "需要重载 UI"),
                                        elem_id="forge_neo_setting_img2img_inpaint_mask_brush_color",
                                    )
                                    settings_img2img_inpaint_sketch_brush_color = gr.ColorPicker(
                                        value=settings_initial["img2img_inpaint_sketch_default_brush_color"],
                                        label=_label("Initial Brush Color for Inpaint Sketch", "局部重绘 Sketch 初始画笔颜色"),
                                        info=_label("requires Reload UI", "需要重载 UI"),
                                        elem_id="forge_neo_setting_img2img_inpaint_sketch_default_brush_color",
                                    )
                                settings_img2img_inpaint_mask_high_contrast = gr.Checkbox(
                                    value=settings_initial["img2img_inpaint_mask_high_contrast"],
                                    label=_label("Use high-contrast brush for inpainting", "局部重绘使用高对比度画笔"),
                                    info=_label("use a checkerboard pattern instead of a solid color; requires Reload UI", "使用棋盘格图案而不是纯色；需要重载 UI"),
                                    elem_id="forge_neo_setting_img2img_inpaint_mask_high_contrast",
                                )
                                settings_img2img_inpaint_mask_scribble_alpha = gr.Slider(
                                    0,
                                    100,
                                    value=settings_initial["img2img_inpaint_mask_scribble_alpha"],
                                    step=1,
                                    label=_label("Inpaint mask alpha (transparency)", "局部重绘蒙版透明度"),
                                    info=_label("only affects solid color brush; requires Reload UI", "只影响纯色画笔；需要重载 UI"),
                                    elem_id="forge_neo_setting_img2img_inpaint_mask_scribble_alpha",
                                )
                                settings_return_mask = gr.Checkbox(
                                    value=settings_initial["return_mask"],
                                    label=_label("For inpainting, append the greyscale mask to results", "局部重绘时将灰度蒙版附加到结果"),
                                    elem_id="forge_neo_setting_return_mask",
                                )
                                settings_return_mask_composite = gr.Checkbox(
                                    value=settings_initial["return_mask_composite"],
                                    label=_label("For inpainting, append the masked composite to results", "局部重绘时将蒙版合成图附加到结果"),
                                    elem_id="forge_neo_setting_return_mask_composite",
                                )
                                settings_img2img_batch_show_results_limit = gr.Slider(
                                    -1,
                                    256,
                                    value=settings_initial["img2img_batch_show_results_limit"],
                                    step=1,
                                    label=_label("Show the first N batch of img2img results in UI", "在界面显示前 N 个图生图批量结果"),
                                    info=_label("0 = disable; -1 = show all; too many images causes severe lag", "0 为禁用；-1 显示全部；图片过多会严重卡顿"),
                                    elem_id="forge_neo_setting_img2img_batch_show_results_limit",
                                )
                                settings_overlay_inpaint = gr.Checkbox(
                                    value=settings_initial["overlay_inpaint"],
                                    label=_label(
                                        "For inpainting, overlay the resulting image back onto the original image",
                                        "局部重绘时将结果叠回原图",
                                    ),
                                    info=_label('when using the "Only masked" option', '使用 "Only masked" 选项时生效'),
                                    elem_id="forge_neo_setting_overlay_inpaint",
                                )
                                settings_img2img_autosize = gr.Checkbox(
                                    value=settings_initial["img2img_autosize"],
                                    label=_label(
                                        "Automatically update the Width and Height when uploading image to img2img input",
                                        "上传图生图输入图时自动更新宽高",
                                    ),
                                    elem_id="forge_neo_setting_img2img_autosize",
                                )
                                settings_img2img_batch_use_original_name = gr.Checkbox(
                                    value=settings_initial["img2img_batch_use_original_name"],
                                    label=_label("In img2img Batch, use the input filenames when saving", "图生图批量保存时使用输入文件名"),
                                    info=_label("Warning: may override existing files", "注意：可能覆盖已有文件"),
                                    elem_id="forge_neo_setting_img2img_batch_use_original_name",
                                )
                                settings_img2img_inpaint_precise_mask = gr.Checkbox(
                                    value=settings_initial["img2img_inpaint_precise_mask"],
                                    label=_label(
                                        'Process the "Mask blur" in fp32 instead of uint8 precision',
                                        '用 fp32 而非 uint8 精度处理 "Mask blur"',
                                    ),
                                    info=_label(
                                        'improve inpainting blending result and reduce masking artifacts; may break functionalities that access the "overlay_images"',
                                        '改善局部重绘融合并减少蒙版瑕疵；可能影响访问 "overlay_images" 的功能',
                                    ),
                                    elem_id="forge_neo_setting_img2img_inpaint_precise_mask",
                                )
                        with gr.Tab(_label("txt2img", "文生图"), elem_id="forge_neo_settings_txt2img", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_txt2img_upscale_single_batch = gr.Checkbox(
                                    value=settings_initial["txt2img_upscale_single_batch"],
                                    label=_label(
                                        "When using the [✨] button, lock the Batch Count and Batch Size to 1 regardless of the UI values",
                                        "使用 [✨] 按钮时无论界面值如何都将批次数和批大小锁定为 1",
                                    ),
                                    elem_id="forge_neo_setting_txt2img_upscale_single_batch",
                                )
                                settings_txt2img_upscale_same_seed = gr.Checkbox(
                                    value=settings_initial["txt2img_upscale_same_seed"],
                                    label=_label(
                                        "When using the [✨] button, pass the Seed of the input image instead of the UI value",
                                        "使用 [✨] 按钮时传入输入图的 Seed，而不是界面当前值",
                                    ),
                                    elem_id="forge_neo_setting_txt2img_upscale_same_seed",
                                )
                                settings_hires_button_gallery_insert = gr.Checkbox(
                                    value=settings_initial["hires_button_gallery_insert"],
                                    label=_label(
                                        "When using the [✨] button, insert the upscaled image to the gallery",
                                        "使用 [✨] 按钮时将放大图插入图库",
                                    ),
                                    info=_label(
                                        "otherwise replace the selected image in the gallery",
                                        "否则替换图库中选中的图片",
                                    ),
                                    elem_id="forge_neo_setting_hires_button_gallery_insert",
                                )
                                settings_hires_insert_index = gr.Checkbox(
                                    value=settings_initial["hires_insert_index"],
                                    label=_label(
                                        "When the above option is enabled, automatically select the upscaled image",
                                        "启用上方选项时自动选择放大后的图片",
                                    ),
                                    info=_label("otherwise select the original image", "否则选择原图"),
                                    elem_id="forge_neo_setting_hires_insert_index",
                                )
                                settings_use_old_hires_fix_width_height = gr.Checkbox(
                                    value=settings_initial["use_old_hires_fix_width_height"],
                                    label=_label(
                                        "For Hires. Fix, use Width/Height sliders to set the final resolution",
                                        "高清修复使用宽高滑条设置最终分辨率",
                                    ),
                                    info=_label("disable Upscale by / Resize to", "禁用 Upscale by / Resize to"),
                                    elem_id="forge_neo_setting_use_old_hires_fix_width_height",
                                )
                                settings_hires_fix_use_firstpass_conds = gr.Checkbox(
                                    value=settings_initial["hires_fix_use_firstpass_conds"],
                                    label=_label(
                                        "For Hires. Fix, calculate conds of Hires. pass using Extra Networks of the normal pass",
                                        "高清修复使用普通阶段的 Extra Networks 计算高清阶段 conds",
                                    ),
                                    info=_label("i.e. do not reload LoRA for the Hires. pass", "也就是高清阶段不重新加载 LoRA"),
                                    elem_id="forge_neo_setting_hires_fix_use_firstpass_conds",
                                )
                        with gr.Tab(_label("Comments", "评论"), elem_id="forge_neo_settings_comments", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_enable_prompt_comments = gr.Checkbox(
                                    value=settings_initial["enable_prompt_comments"],
                                    label=_label("Remove Comments from Prompts", "从提示词中移除注释"),
                                    elem_id="forge_neo_setting_enable_prompt_comments",
                                )
                                gr.HTML(
                                    _label(
                                        "<b>Comment Syntax:</b><br><ul><li># ...</li><li>// ...</li><li>/* ... */</li></ul>",
                                        "<b>注释语法：</b><br><ul><li># ...</li><li>// ...</li><li>/* ... */</li></ul>",
                                    ),
                                    elem_id="forge_neo_setting_prompt_comments_syntax",
                                    elem_classes=["forge-neo-settings-note"],
                                )
                                settings_save_prompt_comments = gr.Checkbox(
                                    value=settings_initial["save_prompt_comments"],
                                    label=_label("Save Raw Comments", "保存原始注释"),
                                    info=_label("include the comments in Infotext", "在生成信息中保留注释"),
                                    elem_id="forge_neo_setting_save_prompt_comments",
                                )
                        with gr.Tab(_label("Forge Canvas", "Forge Canvas"), elem_id="forge_neo_settings_forge_canvas", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_forge_canvas_height = gr.Number(
                                    value=settings_initial["forge_canvas_height"],
                                    label=_label("Canvas Height", "画布高度"),
                                    info=_label("in pixels (requires Reload UI)", "单位为像素（需要重载 UI）"),
                                    precision=0,
                                    minimum=128,
                                    elem_id="forge_neo_setting_forge_canvas_height",
                                )
                                settings_forge_canvas_toolbar_always = gr.Checkbox(
                                    value=settings_initial["forge_canvas_toolbar_always"],
                                    label=_label("Always Visible Toolbar", "工具栏始终可见"),
                                    info=_label(
                                        "disabled: toolbar only appears when hovering the canvas (requires Reload UI)",
                                        "关闭时仅在悬停画布时显示工具栏（需要重载 UI）",
                                    ),
                                    elem_id="forge_neo_setting_forge_canvas_toolbar_always",
                                )
                                settings_forge_canvas_consistent_brush = gr.Checkbox(
                                    value=settings_initial["forge_canvas_consistent_brush"],
                                    label=_label("Fixed Brush Size", "固定画笔尺寸"),
                                    info=_label(
                                        "disabled: the brush size is pixel-space; enabled: the brush size is canvas-space (requires Reload UI)",
                                        "关闭时画笔按屏幕像素计算；启用时画笔按画布空间计算（需要重载 UI）",
                                    ),
                                    elem_id="forge_neo_setting_forge_canvas_consistent_brush",
                                )
                                settings_forge_canvas_plain = gr.Checkbox(
                                    value=settings_initial["forge_canvas_plain"],
                                    label=_label("Plain Background", "纯色背景"),
                                    info=_label(
                                        "disabled: checkerboard pattern; enabled: solid color (requires Reload UI)",
                                        "关闭时显示棋盘格；启用时显示纯色（需要重载 UI）",
                                    ),
                                    elem_id="forge_neo_setting_forge_canvas_plain",
                                )
                                settings_forge_canvas_plain_color = gr.ColorPicker(
                                    value=settings_initial["forge_canvas_plain_color"],
                                    label=_label("Solid Color for Plain Background", "纯色背景颜色"),
                                    elem_id="forge_neo_setting_forge_canvas_plain_color",
                                )
                        with gr.Tab(_label("Gallery", "图库"), elem_id="forge_neo_settings_gallery", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_do_not_show_images = gr.Checkbox(
                                    value=settings_initial["do_not_show_images"],
                                    label=_label("Do not show any image in gallery", "图库中不显示任何图片"),
                                    elem_id="forge_neo_setting_do_not_show_images",
                                )
                                settings_gallery_height = gr.Textbox(
                                    value=settings_initial["gallery_height"],
                                    label=_label("Gallery Height", "图库高度"),
                                    info=_label("in CSS value; e.g. 768px or 20em (requires Reload UI)", "CSS 值，例如 768px 或 20em（需要重载 UI）"),
                                    elem_id="forge_neo_setting_gallery_height",
                                )
                                settings_return_grid = gr.Checkbox(
                                    value=settings_initial["return_grid"],
                                    label=_label("Show Grids in gallery", "在图库中显示宫格图"),
                                    info=_label("e.g. for X/Y/Z Plot", "例如 X/Y/Z Plot"),
                                    elem_id="forge_neo_setting_return_grid",
                                )
                                settings_js_modal_lightbox = gr.Checkbox(
                                    value=settings_initial["js_modal_lightbox"],
                                    label=_label('Enable "Lightbox"', "启用 Lightbox"),
                                    info=_label("Full Page Image Viewer", "整页图片查看器"),
                                    elem_id="forge_neo_setting_js_modal_lightbox",
                                )
                                settings_js_modal_lightbox_initially_zoomed = gr.Checkbox(
                                    value=settings_initial["js_modal_lightbox_initially_zoomed"],
                                    label=_label("[Lightbox]: show images zoomed in by default", "[Lightbox] 默认放大显示图片"),
                                    elem_id="forge_neo_setting_js_modal_lightbox_initially_zoomed",
                                )
                                settings_js_modal_lightbox_gamepad = gr.Checkbox(
                                    value=settings_initial["js_modal_lightbox_gamepad"],
                                    label=_label("[Lightbox]: navigate with gamepad", "[Lightbox] 使用手柄导航"),
                                    elem_id="forge_neo_setting_js_modal_lightbox_gamepad",
                                )
                                settings_js_modal_lightbox_gamepad_repeat = gr.Number(
                                    value=settings_initial["js_modal_lightbox_gamepad_repeat"],
                                    label=_label("[Lightbox]: gamepad repeat period", "[Lightbox] 手柄重复间隔"),
                                    info=_label("in ms", "单位为毫秒"),
                                    precision=0,
                                    minimum=0,
                                    elem_id="forge_neo_setting_js_modal_lightbox_gamepad_repeat",
                                )
                                settings_lightbox_icon_opacity = gr.Slider(
                                    0.0,
                                    1.0,
                                    value=settings_initial["sd_webui_modal_lightbox_icon_opacity"],
                                    step=0.05,
                                    label=_label("[Lightbox]: control icon unfocused opacity", "[Lightbox] 控制图标非聚焦透明度"),
                                    info=_label("for mouse only (requires Reload UI)", "仅鼠标使用（需要重载 UI）"),
                                    elem_id="forge_neo_setting_sd_webui_modal_lightbox_icon_opacity",
                                )
                                settings_lightbox_toolbar_opacity = gr.Slider(
                                    0.0,
                                    1.0,
                                    value=settings_initial["sd_webui_modal_lightbox_toolbar_opacity"],
                                    step=0.05,
                                    label=_label("[Lightbox]: tool bar opacity", "[Lightbox] 工具栏透明度"),
                                    info=_label("for mouse only (requires Reload UI)", "仅鼠标使用（需要重载 UI）"),
                                    elem_id="forge_neo_setting_sd_webui_modal_lightbox_toolbar_opacity",
                                )
                                settings_open_dir_button_choice = gr.Radio(
                                    _localized_value_choices(
                                        [
                                            ("Output Root", "输出根目录"),
                                            ("Subdirectory", "子目录"),
                                            ("Subdirectory (even temp dir)", "子目录（包括临时目录）"),
                                        ]
                                    ),
                                    value=settings_initial["open_dir_button_choice"],
                                    label=_label("What directory the [📂] button opens", "[📂] 按钮打开的目录"),
                                    elem_id="forge_neo_setting_open_dir_button_choice",
                                )
                        with gr.Tab(_label("Infotext", "生成信息"), elem_id="forge_neo_settings_infotext", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                gr.HTML(
                                    _label(
                                        "Infotext is what the webui calls the text that contains generation parameters, and can be used to generate the same image again.",
                                        "生成信息是 webui 对包含生成参数文本的称呼，可用于再次生成同类图片。",
                                    ),
                                    elem_id="forge_neo_setting_infotext_explanation",
                                    elem_classes=["forge-neo-settings-note"],
                                )
                                settings_enable_pnginfo = gr.Checkbox(
                                    value=settings_initial["enable_pnginfo"],
                                    label=_label("Write infotext to metadata of generated images", "将生成信息写入图片 metadata"),
                                    elem_id="forge_neo_setting_enable_pnginfo",
                                )
                                settings_save_txt = gr.Checkbox(
                                    value=settings_initial["save_txt"],
                                    label=_label("Write infotext to a text file next to every generated image", "为每张生成图保存同名生成信息文本"),
                                    elem_id="forge_neo_setting_save_txt",
                                )
                                settings_add_model_name_to_info = gr.Checkbox(
                                    value=settings_initial["add_model_name_to_info"],
                                    label=_label("Add model name to infotext", "生成信息中加入模型名称"),
                                    elem_id="forge_neo_setting_add_model_name_to_info",
                                )
                                settings_add_model_hash_to_info = gr.Checkbox(
                                    value=settings_initial["add_model_hash_to_info"],
                                    label=_label("Add model hash to infotext", "生成信息中加入模型哈希"),
                                    elem_id="forge_neo_setting_add_model_hash_to_info",
                                )
                                settings_add_user_name_to_info = gr.Checkbox(
                                    value=settings_initial["add_user_name_to_info"],
                                    label=_label("Add user name to infotext when authenticated", "认证时生成信息中加入用户名"),
                                    elem_id="forge_neo_setting_add_user_name_to_info",
                                )
                                settings_add_version_to_infotext = gr.Checkbox(
                                    value=settings_initial["add_version_to_infotext"],
                                    label=_label("Add webui version to infotext", "生成信息中加入 WebUI 版本"),
                                    elem_id="forge_neo_setting_add_version_to_infotext",
                                )
                                settings_disable_weights_auto_swap = gr.Checkbox(
                                    value=settings_initial["disable_weights_auto_swap"],
                                    label=_label("Ignore the Checkpoint when reading infotext", "读取生成信息时忽略 Checkpoint"),
                                    elem_id="forge_neo_setting_disable_weights_auto_swap",
                                )
                                settings_disable_modules_auto_swap = gr.Checkbox(
                                    value=settings_initial["disable_modules_auto_swap"],
                                    label=_label("Ignore the VAE / Text Encoder when reading infotext", "读取生成信息时忽略 VAE / Text Encoder"),
                                    elem_id="forge_neo_setting_disable_modules_auto_swap",
                                )
                                settings_infotext_skip_pasting = gr.Dropdown(
                                    INFOTEXT_FIELD_CHOICES,
                                    value=settings_initial["infotext_skip_pasting"],
                                    label=_label("Ignore fields when reading infotext", "读取生成信息时忽略字段"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_infotext_skip_pasting",
                                )
                                settings_infotext_styles = gr.Radio(
                                    _localized_value_choices(
                                        [
                                            ("Ignore", "忽略"),
                                            ("Apply", "应用"),
                                            ("Apply if any", "存在时应用"),
                                            ("Discard", "丢弃"),
                                        ]
                                    ),
                                    value=settings_initial["infotext_styles"],
                                    label=_label("Infer Styles when reading infotext", "读取生成信息时推断 Styles"),
                                    elem_id="forge_neo_setting_infotext_styles",
                                )
                                gr.HTML(
                                    _label(
                                        "<ul><li><b>Ignore:</b> keep prompt and styles dropdown as it is</li><li><b>Apply:</b> remove style text from prompt and replace the styles dropdown</li><li><b>Apply if any:</b> replace styles only when styles are found</li><li><b>Discard:</b> remove style text while keeping the styles dropdown</li></ul>",
                                        "<ul><li><b>忽略：</b>保持提示词和 Styles 下拉不变</li><li><b>应用：</b>从提示词移除样式文本并替换 Styles 下拉</li><li><b>存在时应用：</b>仅在找到样式时替换 Styles</li><li><b>丢弃：</b>移除样式文本但保留 Styles 下拉</li></ul>",
                                    ),
                                    elem_id="forge_neo_setting_infotext_styles_explanation",
                                    elem_classes=["forge-neo-settings-note"],
                                )
                        with gr.Tab(_label("Live Previews", "实时预览"), elem_id="forge_neo_settings_live_previews", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_live_previews = gr.Checkbox(
                                    value=settings_initial["live_previews_enable"],
                                    label=_label("Show live previews during sampling", "采样时显示预览"),
                                    elem_id="forge_neo_setting_live_previews_enable",
                                )
                                settings_show_progressbar = gr.Checkbox(
                                    value=settings_initial["show_progressbar"],
                                    label=_label("Show progress bar", "显示进度条"),
                                    elem_id="forge_neo_setting_show_progressbar",
                                )
                                settings_preview_refresh = gr.Slider(
                                    100,
                                    5000,
                                    value=settings_initial["live_preview_refresh_period"],
                                    step=50,
                                    label=_label("Preview refresh period (ms)", "预览刷新间隔（毫秒）"),
                                    elem_id="forge_neo_setting_live_preview_refresh_period",
                                )
                        with gr.Tab(_label("Prompt Editing", "提示词编辑"), elem_id="forge_neo_settings_prompt_editing", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_keyedit_precision_attention = gr.Slider(
                                    0.05,
                                    0.25,
                                    value=settings_initial["keyedit_precision_attention"],
                                    step=0.05,
                                    label=_label(
                                        "Precision for (attention:1.1) when editing the prompt with Ctrl + Up/Down",
                                        "使用 Ctrl + 上/下编辑 (attention:1.1) 时的精度",
                                    ),
                                    elem_id="forge_neo_setting_keyedit_precision_attention",
                                )
                                settings_keyedit_precision_extra = gr.Slider(
                                    0.05,
                                    0.25,
                                    value=settings_initial["keyedit_precision_extra"],
                                    step=0.05,
                                    label=_label(
                                        "Precision for <lora:0.9> when editing the prompt with Ctrl + Up/Down",
                                        "使用 Ctrl + 上/下编辑 <lora:0.9> 时的精度",
                                    ),
                                    elem_id="forge_neo_setting_keyedit_precision_extra",
                                )
                                settings_keyedit_delimiters = gr.Textbox(
                                    value=settings_initial["keyedit_delimiters"],
                                    label=_label(
                                        "RegEx Delimiters when editing the prompt with Ctrl + Up/Down",
                                        "使用 Ctrl + 上/下编辑提示词时的正则分隔符",
                                    ),
                                    elem_id="forge_neo_setting_keyedit_delimiters",
                                )
                                settings_keyedit_delimiters_whitespace = gr.CheckboxGroup(
                                    ["Tab", "Carriage Return", "Line Feed"],
                                    value=settings_initial["keyedit_delimiters_whitespace"],
                                    label=_label(
                                        "Whitespace Delimiters when editing the prompt with Ctrl + Up/Down",
                                        "使用 Ctrl + 上/下编辑提示词时的空白分隔符",
                                    ),
                                    elem_id="forge_neo_setting_keyedit_delimiters_whitespace",
                                )
                                settings_keyedit_move = gr.Checkbox(
                                    value=settings_initial["keyedit_move"],
                                    label=_label("Alt + Left/Right moves prompt chunks", "Alt + 左/右移动提示词片段"),
                                    elem_id="forge_neo_setting_keyedit_move",
                                )
                                settings_disable_token_counters = gr.Checkbox(
                                    value=settings_initial["disable_token_counters"],
                                    label=_label("Disable Token Counter", "禁用 Token 计数器"),
                                    elem_id="forge_neo_setting_disable_token_counters",
                                )
                                settings_include_styles_into_token_counters = gr.Checkbox(
                                    value=settings_initial["include_styles_into_token_counters"],
                                    label=_label("Include enabled Styles in Token Count", "Token 计数包含已启用 Styles"),
                                    elem_id="forge_neo_setting_include_styles_into_token_counters",
                                )
                        with gr.Tab(_label("Tag Autocomplete", "标签补全"), elem_id="forge_neo_settings_tagcomplete", render_children=True):
                            settings_tagcomplete_components = _create_tagcomplete_settings_page(settings_initial)
                        settings_forge_couple_components = _create_forge_couple_settings_tab(
                            settings_initial,
                            state_value=state_value,
                            bridge=forge_couple_bridge,
                        )
                        with gr.Tab(_label("Settings in UI", "UI 内设置"), elem_id="forge_neo_settings_settings_in_ui", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                gr.HTML(
                                    _label(
                                        "This page allows you to add some settings to the main interface of txt2img and img2img tabs.",
                                        "此页面用于把部分设置加入 txt2img 和 img2img 主界面。",
                                    ),
                                    elem_id="forge_neo_setting_settings_in_ui_explanation",
                                    elem_classes=["forge-neo-settings-note"],
                                )
                                settings_extra_options_txt2img = gr.Dropdown(
                                    SETTINGS_IN_UI_CHOICES,
                                    value=settings_initial["extra_options_txt2img"],
                                    label=_label("Settings for txt2img", "txt2img 界面附加设置"),
                                    info=_label("setting entries that also appear in txt2img interfaces (requires Reload UI)", "也显示在 txt2img 界面的设置项（需要重载 UI）"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_extra_options_txt2img",
                                )
                                settings_extra_options_img2img = gr.Dropdown(
                                    SETTINGS_IN_UI_CHOICES,
                                    value=settings_initial["extra_options_img2img"],
                                    label=_label("Settings for img2img", "img2img 界面附加设置"),
                                    info=_label("setting entries that also appear in img2img interfaces (requires Reload UI)", "也显示在 img2img 界面的设置项（需要重载 UI）"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_extra_options_img2img",
                                )
                                settings_extra_options_cols = gr.Slider(
                                    1,
                                    20,
                                    value=settings_initial["extra_options_cols"],
                                    step=1,
                                    label=_label("Number of columns for added settings", "附加设置列数"),
                                    info=_label("displayed amount will depend on the actual browser window width (requires Reload UI)", "实际显示数量取决于浏览器窗口宽度（需要重载 UI）"),
                                    elem_id="forge_neo_setting_extra_options_cols",
                                )
                                settings_extra_options_accordion = gr.Checkbox(
                                    value=settings_initial["extra_options_accordion"],
                                    label=_label("Place added settings into an accordion", "将附加设置放入折叠面板"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_extra_options_accordion",
                                )
                        with gr.Tab(_label("UI Alternatives", "UI Alternatives"), elem_id="forge_neo_settings_ui_alternatives", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_show_rescale_cfg = gr.Checkbox(
                                    value=settings_initial["show_rescale_cfg"],
                                    label=_label("Display the Rescale CFG Slider", "显示 Rescale CFG 滑条"),
                                    info=_label("feature for v-pred checkpoints (requires Reload UI)", "用于 v-pred checkpoints（需要重载 UI）"),
                                    elem_id="forge_neo_setting_show_rescale_cfg",
                                )
                                settings_show_mahiro = gr.Checkbox(
                                    value=settings_initial["show_mahiro"],
                                    label=_label("Display the MaHiRo Toggle", "显示 MaHiRo 开关"),
                                    info=_label("see blue-arxiv - id: 2024-1208.1 (requires Reload UI)", "参见 blue-arxiv - id: 2024-1208.1（需要重载 UI）"),
                                    elem_id="forge_neo_setting_show_mahiro",
                                )
                                settings_paste_safe_guard = gr.Checkbox(
                                    value=settings_initial["paste_safe_guard"],
                                    label=_label(
                                        'Disable the "Read generation parameters" button (↙️) when negative prompt is not empty',
                                        "反向提示词非空时禁用读取生成参数按钮（↙️）",
                                    ),
                                    elem_id="forge_neo_setting_paste_safe_guard",
                                )
                                settings_ctrl_enter_interrupt = gr.Checkbox(
                                    value=settings_initial["ctrl_enter_interrupt"],
                                    label=_label("Revert [Ctrl + Enter] to only interrupt the generation", "将 Ctrl + Enter 恢复为仅中断生成"),
                                    info=_label(
                                        'the current "intended" behavior is to interrupt the current generation then immediately start a new one',
                                        "当前预期行为是中断当前生成并立即开始新的生成",
                                    ),
                                    elem_id="forge_neo_setting_ctrl_enter_interrupt",
                                )
                                settings_quicksettings_accordion = gr.Checkbox(
                                    value=settings_initial["quicksettings_accordion"],
                                    label=_label("Place the Quicksettings under an Accordion", "将 Quicksettings 放入折叠面板"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_quicksettings_accordion",
                                )
                                settings_quicksettings_accordion_starts_closed = gr.Checkbox(
                                    value=settings_initial["quicksettings_accordion_starts_closed"],
                                    label=_label("Close the Accordion on startup", "启动时关闭 Quicksettings 折叠面板"),
                                    info=_label("for the above option (requires Reload UI)", "用于上方选项（需要重载 UI）"),
                                    elem_id="forge_neo_setting_quicksettings_accordion_starts_closed",
                                )
                                settings_remove_image_on_hover = gr.Checkbox(
                                    value=settings_initial["remove_image_on_hover"],
                                    label=_label(
                                        "For image inputs in Extras and PNG Info, remove the current image when dragging another image over it",
                                        "Extras 和 PNG Info 图片输入区拖入新图时移除当前图片",
                                    ),
                                    info=_label("allow you to drag-and-drop images onto the input similar to AUTOMATIC1111 behavior (requires Reload UI)", "让图片输入区获得类似 AUTOMATIC1111 的拖放行为（需要重载 UI）"),
                                    elem_id="forge_neo_setting_remove_image_on_hover",
                                )
                                settings_forbidden_knowledge = gr.Checkbox(
                                    value=settings_initial["forbidden_knowledge"],
                                    label=_label("Forbidden Knowledge", "Forbidden Knowledge"),
                                    info=_label('replace "DPM++ 2s a RF" with "Flux Realistic" (requires restart)', '将 "DPM++ 2s a RF" 替换为 "Flux Realistic"（需要重启）'),
                                    elem_id="forge_neo_setting_forbidden_knowledge",
                                )
                                settings_prompt_box_style = gr.Radio(
                                    _localized_value_choices(
                                        [
                                            ("Default", "默认"),
                                            ("Compact", "紧凑"),
                                            ("Scrollable", "可滚动"),
                                            ("Accordion", "折叠"),
                                        ]
                                    ),
                                    value=settings_initial["prompt_box_style"],
                                    label=_label("Prompt Layout", "提示词布局"),
                                    elem_id="forge_neo_setting_prompt_box_style",
                                )
                                gr.HTML(
                                    _label(
                                        "<ul><li><b>Default:</b> the original Automatic1111 layout</li><li><b>Compact:</b> put Prompts inside the Generate tab, leaving more space for the Gallery</li><li><b>Scrollable:</b> put Prompts inside fixed-height containers with a scrollbar</li><li><b>Accordion:</b> put Prompts inside an accordion that can be collapsed</li></ul>",
                                        "<ul><li><b>默认：</b>原始 Automatic1111 布局</li><li><b>紧凑：</b>将提示词放入 Generate 区域，为图库留出更多空间</li><li><b>可滚动：</b>提示词放入固定高度滚动容器</li><li><b>折叠：</b>提示词放入可关闭的折叠面板</li></ul>",
                                    ),
                                    elem_id="forge_neo_setting_prompt_box_style_explanation",
                                    elem_classes=["forge-neo-settings-note"],
                                )
                                settings_dimensions_batch = gr.Checkbox(
                                    value=settings_initial["dimensions_and_batch_together"],
                                    label=_label("Show Width/Height and Batch sliders in same row", "宽高和批量滑条显示在同一行"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_dimensions_and_batch_together",
                                )
                                settings_checkpoint_short = gr.Checkbox(
                                    value=settings_initial["sd_checkpoint_dropdown_use_short"],
                                    label=_label("Show filenames without folder in the Checkpoint dropdown", "Checkpoint 下拉只显示不带目录的文件名"),
                                    info=_label("if disabled, models under subdirectories will be listed like sdxl/anime.safetensors", "关闭时子目录中的模型会显示为 sdxl/anime.safetensors"),
                                    elem_id="forge_neo_setting_sd_checkpoint_dropdown_use_short",
                                )
                                settings_hires_fix_show_sampler = gr.Checkbox(
                                    value=settings_initial["hires_fix_show_sampler"],
                                    label=_label("[Hires. fix]: Show checkpoint, sampler, scheduler, and cfg options", "[Hires. fix] 显示 checkpoint、采样器、调度器和 CFG 选项"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_hires_fix_show_sampler",
                                )
                                settings_hires_fix_show_prompts = gr.Checkbox(
                                    value=settings_initial["hires_fix_show_prompts"],
                                    label=_label("[Hires. fix]: Show prompt and negative prompt textboxes", "[Hires. fix] 显示正向和反向提示词输入框"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_hires_fix_show_prompts",
                                )
                                settings_txt2img_settings_accordion = gr.Checkbox(
                                    value=settings_initial["txt2img_settings_accordion"],
                                    label=_label("Put txt2img parameters under Accordion", "将 txt2img 参数放入折叠面板"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_txt2img_settings_accordion",
                                )
                                settings_img2img_settings_accordion = gr.Checkbox(
                                    value=settings_initial["img2img_settings_accordion"],
                                    label=_label("Put img2img parameters under Accordion", "将 img2img 参数放入折叠面板"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_img2img_settings_accordion",
                                )
                                settings_interrupt_after_current = gr.Checkbox(
                                    value=settings_initial["interrupt_after_current"],
                                    label=_label("Don't Interrupt in the middle", "不要在中途立刻中断"),
                                    info=_label(
                                        "when using the Interrupt button, if generating more than one image, stop after the current generation of an image has finished instead of immediately",
                                        "使用中断按钮且生成多张图片时，当前图片完成后再停止",
                                    ),
                                    elem_id="forge_neo_setting_interrupt_after_current",
                                )
                        with gr.Tab(_label("User Interface", "界面"), elem_id="forge_neo_settings_user_interface", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_localization = gr.Dropdown(
                                    ["None"],
                                    value=settings_initial["localization"],
                                    label=_label("Localization", "本地化"),
                                    elem_id="forge_neo_setting_localization",
                                )
                                settings_quicksettings_list = gr.Dropdown(
                                    SETTINGS_IN_UI_CHOICES,
                                    value=settings_initial["quicksettings_list"],
                                    label=_label("Quicksettings List", "Quicksettings 列表"),
                                    info=_label("settings that appear at the top of the page instead of in the Settings tab (requires Reload UI)", "显示在页面顶部而不是 Settings 标签里的设置项（需要重载 UI）"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_quicksettings_list",
                                )
                                settings_ui_tab_order = gr.Dropdown(
                                    UI_TAB_CHOICES,
                                    value=settings_initial["ui_tab_order"],
                                    label=_label("UI Tab Order", "UI 标签顺序"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_ui_tab_order",
                                )
                                settings_hidden_tabs = gr.Dropdown(
                                    UI_TAB_CHOICES,
                                    value=settings_initial["hidden_tabs"],
                                    label=_label("Hide UI Tabs", "隐藏 UI 标签"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_hidden_tabs",
                                )
                                settings_ui_reorder_list = gr.Dropdown(
                                    UI_REORDER_CHOICES,
                                    value=settings_initial["ui_reorder_list"],
                                    label=_label("Parameter order for txt2img / img2img", "txt2img / img2img 参数顺序"),
                                    info=_label("selected items appear first (requires Reload UI)", "选中的项目会优先显示（需要重载 UI）"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_ui_reorder_list",
                                )
                                settings_gradio_theme = gr.Dropdown(
                                    GRADIO_THEME_CHOICES,
                                    value=settings_initial["gradio_theme"],
                                    label=_label("Gradio Theme", "Gradio 主题"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_gradio_theme",
                                )
                                settings_gradio_themes_cache = gr.Checkbox(
                                    value=settings_initial["gradio_themes_cache"],
                                    label=_label("Cache selected theme locally", "本地缓存选中的主题"),
                                    elem_id="forge_neo_setting_gradio_themes_cache",
                                )
                                settings_show_progress_in_title = gr.Checkbox(
                                    value=settings_initial["show_progress_in_title"],
                                    label=_label("Show generation progress in window title", "窗口标题显示生成进度"),
                                    elem_id="forge_neo_setting_show_progress_in_title",
                                )
                                settings_send_seed = gr.Checkbox(
                                    value=settings_initial["send_seed"],
                                    label=_label('Send the Seed information when using the "Send to" buttons', '使用 "Send to" 按钮时发送 Seed 信息'),
                                    elem_id="forge_neo_setting_send_seed",
                                )
                                settings_send_cfg = gr.Checkbox(
                                    value=settings_initial["send_cfg"],
                                    label=_label('Send the CFG information when using the "Send to" buttons', '使用 "Send to" 按钮时发送 CFG 信息'),
                                    elem_id="forge_neo_setting_send_cfg",
                                )
                                settings_send_size = gr.Checkbox(
                                    value=settings_initial["send_size"],
                                    label=_label('Send the Resolution information when using the "Send to" buttons', '使用 "Send to" 按钮时发送分辨率信息'),
                                    elem_id="forge_neo_setting_send_size",
                                )
                                settings_send_image_info_not_ui = gr.Checkbox(
                                    value=settings_initial["send_image_info_not_ui"],
                                    label=_label(
                                        'Send the Parameters in the infotext instead of the UI fields when using the "Send to" buttons',
                                        '使用 "Send to" 按钮时发送生成信息中的参数而非 UI 字段',
                                    ),
                                    info=_label("e.g. send the result of Wildcards instead of the syntax (requires Reload UI)", "例如发送 Wildcards 结果而不是语法（需要重载 UI）"),
                                    elem_id="forge_neo_setting_send_image_info_not_ui",
                                )
                                settings_allow_i2i_send_info = gr.Checkbox(
                                    value=settings_initial["allow_i2i_send_info"],
                                    label=_label('Send the Parameters too when using the "Send to" buttons in img2img tab', '在 img2img 标签中使用 "Send to" 按钮时也发送参数'),
                                    info=_label("otherwise only the image is sent (requires Reload UI)", "否则只发送图片（需要重载 UI）"),
                                    elem_id="forge_neo_setting_allow_i2i_send_info",
                                )
                                settings_enable_reloading_ui_scripts = gr.Checkbox(
                                    value=settings_initial["enable_reloading_ui_scripts"],
                                    label=_label('Additionally reload the "modules.ui" scripts when using "Reload UI"', '使用 "Reload UI" 时额外重新加载 modules.ui 脚本'),
                                    info=_label("for developing", "用于开发"),
                                    elem_id="forge_neo_setting_enable_reloading_ui_scripts",
                                )
                        settings_preset_components: list[object] = []
                        for arch in PRESET_ARCHES:
                            preset_label = PRESET_DISPLAY_NAMES[arch]
                            elem_id = "forge_neo_settings_sd_arch" if arch == "sd" else f"forge_neo_settings_{arch}"
                            with gr.Tab(_label(preset_label, preset_label), elem_id=elem_id, render_children=True):
                                settings_preset_components.extend(_create_preset_settings_page(arch, settings_initial))
                        with gr.Tab(_label("API", "API"), elem_id="forge_neo_settings_api", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_api_enable_requests = gr.Checkbox(
                                    value=settings_initial["api_enable_requests"],
                                    label=_label('Allow "http://" and "https://" URLs as input images', "允许将 http/https URL 作为输入图片"),
                                    elem_id="forge_neo_setting_api_enable_requests",
                                )
                                settings_api_forbid_local_requests = gr.Checkbox(
                                    value=settings_initial["api_forbid_local_requests"],
                                    label=_label("Forbid URLs to local resources", "禁止访问本地资源 URL"),
                                    elem_id="forge_neo_setting_api_forbid_local_requests",
                                )
                                settings_api_useragent = gr.Textbox(
                                    value=settings_initial["api_useragent"],
                                    label=_label("User Agent for Requests", "请求使用的 User Agent"),
                                    elem_id="forge_neo_setting_api_useragent",
                                )
                        with gr.Tab(_label("Callbacks", "回调"), elem_id="forge_neo_settings_callbacks", render_children=True):
                            settings_callback_components = _create_callbacks_settings_page(settings_initial)
                        with gr.Tab(_label("Profiler", "性能分析"), elem_id="forge_neo_settings_profiler", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                gr.HTML(
                                    _label(
                                        "These settings allow you to enable PyTorch profiler during generation. Each generation writes its own profile to one file. Writing profile can take up to 30 seconds, and the file itself can be around 500MB in size.",
                                        "这些设置用于在生成时启用 PyTorch profiler。每次生成都会写入一个 profile 文件。写入可能需要约 30 秒，文件本身可能接近 500MB。",
                                    ),
                                    elem_id="forge_neo_setting_profiling_explanation",
                                    elem_classes=["forge-neo-settings-note"],
                                )
                                settings_profiling_enable = gr.Checkbox(
                                    value=settings_initial["profiling_enable"],
                                    label=_label("Enable Profiling", "启用性能分析"),
                                    elem_id="forge_neo_setting_profiling_enable",
                                )
                                settings_profiling_activities = gr.CheckboxGroup(
                                    PROFILING_ACTIVITY_CHOICES,
                                    value=settings_initial["profiling_activities"],
                                    label=_label("Activities", "活动"),
                                    elem_id="forge_neo_setting_profiling_activities",
                                )
                                settings_profiling_record_shapes = gr.Checkbox(
                                    value=settings_initial["profiling_record_shapes"],
                                    label=_label("Record Shapes", "记录张量形状"),
                                    elem_id="forge_neo_setting_profiling_record_shapes",
                                )
                                settings_profiling_profile_memory = gr.Checkbox(
                                    value=settings_initial["profiling_profile_memory"],
                                    label=_label("Profile Memory", "分析内存"),
                                    elem_id="forge_neo_setting_profiling_profile_memory",
                                )
                                settings_profiling_with_stack = gr.Checkbox(
                                    value=settings_initial["profiling_with_stack"],
                                    label=_label("Include Python Stack", "包含 Python 调用栈"),
                                    elem_id="forge_neo_setting_profiling_with_stack",
                                )
                                settings_profiling_filename = gr.Textbox(
                                    value=settings_initial["profiling_filename"],
                                    label=_label("Profile Filename", "性能分析文件名"),
                                    elem_id="forge_neo_setting_profiling_filename",
                                )
                        with gr.Tab(_label("System", "系统"), elem_id="forge_neo_settings_system", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_allocated_vram = gr.Slider(
                                    0.0,
                                    1.0,
                                    value=settings_initial["setting_allocated_vram"],
                                    step=0.05,
                                    label=_label("GPU Weights", "GPU 权重"),
                                    info=_label("amount of VRAM that Forge can access; in % of total vram", "Forge 可访问的 VRAM 占比"),
                                    elem_id="forge_neo_setting_setting_allocated_vram",
                                )
                                settings_res_step = gr.Radio(
                                    _localized_value_choices([(value, value) for value in RESOLUTION_STEP_CHOICES]),
                                    value=str(settings_initial["res_step"]),
                                    label=_label("Resolution Step", "分辨率步进"),
                                    info=_label('"64" is recommended to prevent compatibility issues (requires restart)', "建议使用 64 以减少兼容问题（需要重启）"),
                                    elem_id="forge_neo_setting_res_step",
                                )
                                settings_auto_launch_browser = gr.Radio(
                                    _localized_value_choices(
                                        [
                                            ("Disable", "禁用"),
                                            ("Local", "本地"),
                                            ("Remote", "远程"),
                                        ]
                                    ),
                                    value=settings_initial["auto_launch_browser"],
                                    label=_label("Launch the webui in browser on startup", "启动时在浏览器打开 WebUI"),
                                    info=_label("Remote = always automatically start; Local = only when not sharing the server", "Remote 总是自动打开；Local 仅在非共享服务时打开"),
                                    elem_id="forge_neo_setting_auto_launch_browser",
                                )
                                settings_enable_console_prompts = gr.Checkbox(
                                    value=settings_initial["enable_console_prompts"],
                                    label=_label("Print the generation prompts to console", "在控制台打印生成提示词"),
                                    elem_id="forge_neo_setting_enable_console_prompts",
                                )
                                settings_samples_log_stdout = gr.Checkbox(
                                    value=settings_initial["samples_log_stdout"],
                                    label=_label("Print the generation infotxt to console", "在控制台打印生成信息"),
                                    elem_id="forge_neo_setting_samples_log_stdout",
                                )
                                settings_show_warnings = gr.Checkbox(
                                    value=settings_initial["show_warnings"],
                                    label=_label("Show warnings in console", "在控制台显示警告"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_show_warnings",
                                )
                                settings_show_gradio_deprecation_warnings = gr.Checkbox(
                                    value=settings_initial["show_gradio_deprecation_warnings"],
                                    label=_label("Show gradio deprecation warnings in console", "在控制台显示 Gradio 弃用警告"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_show_gradio_deprecation_warnings",
                                )
                                settings_memmon_poll_rate = gr.Slider(
                                    0,
                                    50,
                                    value=settings_initial["memmon_poll_rate"],
                                    step=1,
                                    label=_label("VRAM usage polls per second during generation", "生成时每秒查询 VRAM 次数"),
                                    info=_label("0 = disable", "0 = 禁用"),
                                    elem_id="forge_neo_setting_memmon_poll_rate",
                                )
                                settings_multiple_tqdm = gr.Checkbox(
                                    value=settings_initial["multiple_tqdm"],
                                    label=_label("Add an additional progress bar to the console to show the total progress of an entire job", "在控制台显示任务总进度条"),
                                    elem_id="forge_neo_setting_multiple_tqdm",
                                )
                                settings_enable_upscale_progressbar = gr.Checkbox(
                                    value=settings_initial["enable_upscale_progressbar"],
                                    label=_label("Show a progress bar in the console for tiled upscaling", "分块放大时在控制台显示进度条"),
                                    elem_id="forge_neo_setting_enable_upscale_progressbar",
                                )
                                settings_list_hidden_files = gr.Checkbox(
                                    value=settings_initial["list_hidden_files"],
                                    label=_label("List the models/files under hidden directories", "列出隐藏目录下的模型/文件"),
                                    info=_label('directory is hidden if its name starts with "."', '目录名以 "." 开头时视为隐藏目录'),
                                    elem_id="forge_neo_setting_list_hidden_files",
                                )
                                settings_dump_stacks_on_signal = gr.Checkbox(
                                    value=settings_initial["dump_stacks_on_signal"],
                                    label=_label("Print the stack trace before terminating the webui via Ctrl + C", "Ctrl+C 结束前打印调用栈"),
                                    elem_id="forge_neo_setting_dump_stacks_on_signal",
                                )
                                settings_no_spellcheck = gr.Checkbox(
                                    value=settings_initial["no_spellcheck"],
                                    label=_label("Disable auto-correct / spellcheck for prompt fields", "禁用提示词输入框自动更正/拼写检查"),
                                    info=_label("requires Reload UI", "需要重载 UI"),
                                    elem_id="forge_neo_setting_no_spellcheck",
                                )
                        with gr.Tab(_label("Face Restoration", "面部修复"), elem_id="forge_neo_settings_face_restoration", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_face_restoration = gr.Checkbox(
                                    value=settings_initial["face_restoration"],
                                    label=_label("Restore Faces", "修复面部"),
                                    info=_label("after each generation, process the face(s) with a 3rd-party model", "每次生成后使用第三方面部模型处理面部"),
                                    elem_id="forge_neo_setting_face_restoration",
                                )
                                settings_face_restoration_model = gr.Radio(
                                    _localized_value_choices([(value, value) for value in FACE_RESTORATION_MODEL_CHOICES]),
                                    value=settings_initial["face_restoration_model"],
                                    label=_label("Face Restoration Model", "面部修复模型"),
                                    elem_id="forge_neo_setting_face_restoration_model",
                                )
                                settings_code_former_weight = gr.Slider(
                                    0,
                                    1,
                                    value=settings_initial["code_former_weight"],
                                    step=0.05,
                                    label=_label("CodeFormer Strength", "CodeFormer 强度"),
                                    info=_label("0 = max effect; 1 = min effect", "0 = 效果最强；1 = 效果最弱"),
                                    elem_id="forge_neo_setting_code_former_weight",
                                )
                                settings_face_restoration_unload = gr.Checkbox(
                                    value=settings_initial["face_restoration_unload"],
                                    label=_label("Move the model to CPU after restoration", "修复后将模型移到 CPU"),
                                    elem_id="forge_neo_setting_face_restoration_unload",
                                )
                        with gr.Tab(_label("Postprocessing", "后处理"), elem_id="forge_neo_settings_postprocessing", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_postprocessing_enable_in_main_ui = gr.Dropdown(
                                    POSTPROCESSING_OPERATION_CHOICES,
                                    value=settings_initial["postprocessing_enable_in_main_ui"],
                                    label=_label("Enable Postprocessing operations in txt2img and img2img", "在 txt2img 和 img2img 中启用后处理操作"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_postprocessing_enable_in_main_ui",
                                )
                                settings_postprocessing_disable_in_extras = gr.Dropdown(
                                    POSTPROCESSING_OPERATION_CHOICES,
                                    value=settings_initial["postprocessing_disable_in_extras"],
                                    label=_label("Disable Postprocessing operations in Extras tab", "在 Extras 中禁用后处理操作"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_postprocessing_disable_in_extras",
                                )
                                settings_postprocessing_operation_order = gr.Dropdown(
                                    POSTPROCESSING_OPERATION_CHOICES,
                                    value=settings_initial["postprocessing_operation_order"],
                                    label=_label("Order of Postprocessing operations", "后处理操作顺序"),
                                    multiselect=True,
                                    elem_id="forge_neo_setting_postprocessing_operation_order",
                                )
                        with gr.Tab(_label("Upscaling", "放大"), elem_id="forge_neo_settings_upscaling", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_esrgan_tile = gr.Slider(
                                    0,
                                    512,
                                    value=settings_initial["ESRGAN_tile"],
                                    step=16,
                                    label=_label("Tile Size for Upscalers", "放大器分块尺寸"),
                                    info=_label("0 = no tiling", "0 = 不分块"),
                                    elem_id="forge_neo_setting_ESRGAN_tile",
                                )
                                settings_esrgan_tile_overlap = gr.Slider(
                                    0,
                                    64,
                                    value=settings_initial["ESRGAN_tile_overlap"],
                                    step=4,
                                    label=_label("Tile Overlap for Upscalers", "放大器分块重叠"),
                                    info=_label("low values = visible seam", "较低数值可能出现明显接缝"),
                                    elem_id="forge_neo_setting_ESRGAN_tile_overlap",
                                )
                                settings_composite_tiles_on_gpu = gr.Checkbox(
                                    value=settings_initial["composite_tiles_on_gpu"],
                                    label=_label("Composite the Tiles on GPU", "在 GPU 上合成分块"),
                                    info=_label("improve performance and resource utilization", "改善性能与资源利用"),
                                    elem_id="forge_neo_setting_composite_tiles_on_gpu",
                                )
                                settings_upscaler_for_img2img = gr.Dropdown(
                                    _upscaler_dropdown_choices(include_latent=True),
                                    value=settings_initial["upscaler_for_img2img"],
                                    label=_label("Upscaler for img2img", "img2img 放大器"),
                                    info=_label("for resizing the input image if the image resolution is smaller than the generation resolution", "输入图分辨率小于生成分辨率时用于缩放输入图"),
                                    elem_id="forge_neo_setting_upscaler_for_img2img",
                                )
                                settings_upscaling_max_images_in_cache = gr.Slider(
                                    0,
                                    8,
                                    value=settings_initial["upscaling_max_images_in_cache"],
                                    step=1,
                                    label=_label("Number of upscaled images to cache", "缓存的放大图片数量"),
                                    elem_id="forge_neo_setting_upscaling_max_images_in_cache",
                                )
                                settings_set_scale_by_when_changing_upscaler = gr.Checkbox(
                                    value=settings_initial["set_scale_by_when_changing_upscaler"],
                                    label=_label('Automatically set the "Scale by" factor based on the name of the selected Upscaler', '根据所选放大器名称自动设置 "Scale by" 倍率'),
                                    elem_id="forge_neo_setting_set_scale_by_when_changing_upscaler",
                                )
                                settings_prefer_fp16_upscalers = gr.Checkbox(
                                    value=settings_initial["prefer_fp16_upscalers"],
                                    label=_label("Prefer to load Upscaler in half precision", "优先以半精度加载放大器"),
                                    info=_label("increase speed; reduce quality; will try fp16, then bf16, then fall back to fp32 if not supported (requires restart)", "提升速度但可能降低质量；会尝试 fp16、bf16，不支持时回到 fp32（需要重启）"),
                                    elem_id="forge_neo_setting_prefer_fp16_upscalers",
                                )
                        with gr.Tab(_label("Nunchaku", "Nunchaku"), elem_id="forge_neo_settings_nunchaku", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_svdq_cpu_offload = gr.Checkbox(
                                    value=settings_initial["svdq_cpu_offload"],
                                    label=_label("CPU Offload", "CPU Offload"),
                                    info=_label("recommended if the VRAM is less than 16 GB", "显存少于 16GB 时建议启用"),
                                    elem_id="forge_neo_setting_svdq_cpu_offload",
                                )
                                gr.HTML("Flux", elem_id="forge_neo_setting_svdq_flux_exp", elem_classes=["forge-neo-settings-note"])
                                settings_svdq_cache_threshold = gr.Slider(
                                    0.0,
                                    1.0,
                                    value=settings_initial["svdq_cache_threshold"],
                                    step=0.01,
                                    label=_label("Cache Threshold", "缓存阈值"),
                                    info=_label("increasing the value enhances speed at the cost of quality; a typical value is 0.12; setting it to 0 disables the effect", "提高数值会提升速度但降低质量；典型值为 0.12；设为 0 时禁用"),
                                    elem_id="forge_neo_setting_svdq_cache_threshold",
                                )
                                settings_svdq_attention = gr.Radio(
                                    _localized_value_choices([(value, value) for value in SVDQ_ATTENTION_CHOICES]),
                                    value=settings_initial["svdq_attention"],
                                    label=_label("Attention", "Attention"),
                                    info=_label("RTX 20s GPUs can only use nunchaku-fp16", "RTX 20 系列只能使用 nunchaku-fp16"),
                                    elem_id="forge_neo_setting_svdq_attention",
                                )
                                gr.HTML("Qwen", elem_id="forge_neo_setting_svdq_qwen_exp", elem_classes=["forge-neo-settings-note"])
                                settings_svdq_use_pin_memory = gr.Checkbox(
                                    value=settings_initial["svdq_use_pin_memory"],
                                    label=_label("Use Pinned Memory", "使用 Pinned Memory"),
                                    info=_label("improve load speed at the cost of higher RAM usage", "提高加载速度但增加内存占用"),
                                    elem_id="forge_neo_setting_svdq_use_pin_memory",
                                )
                                settings_svdq_num_blocks_on_gpu = gr.Slider(
                                    1,
                                    60,
                                    value=settings_initial["svdq_num_blocks_on_gpu"],
                                    step=1,
                                    label=_label("Blocks on GPU", "GPU 上的 Blocks 数量"),
                                    info=_label("higher = more VRAM usage ; lower = more RAM usage", "更高会占用更多显存；更低会占用更多内存"),
                                    elem_id="forge_neo_setting_svdq_num_blocks_on_gpu",
                                )
                        with gr.Tab(_label("Defaults", "默认值"), elem_id="forge_neo_settings_defaults", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_defaults_info = gr.HTML(
                                    _settings_defaults_instructions_html(),
                                    elem_id="forge_neo_settings_defaults_info",
                                )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_defaults_view = gr.Button(
                                        _label("View changes", "查看变更"),
                                        elem_id="forge_neo_settings_defaults_view",
                                    )
                                    settings_defaults_apply = gr.Button(
                                        _label("Apply", "应用"),
                                        variant="primary",
                                        elem_id="forge_neo_settings_defaults_apply",
                                    )
                                settings_defaults_review = gr.HTML(
                                    "",
                                    elem_id="forge_neo_settings_defaults_review",
                                    visible=False,
                                )
                                settings_config_json = gr.HTML(
                                    _settings_json_html(settings_initial),
                                    elem_id="forge_neo_settings_json",
                                    visible=False,
                                )
                        with gr.Tab(_label("Sysinfo", "系统信息"), elem_id="forge_neo_settings_sysinfo", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_sysinfo_download_link = gr.HTML(
                                    _settings_sysinfo_download_html(),
                                    elem_id="forge_neo_settings_sysinfo_download_link",
                                )
                                settings_sysinfo = gr.HTML(
                                    _settings_sysinfo_html(sysinfo_snapshot()),
                                    elem_id="forge_neo_settings_sysinfo_json",
                                    visible=False,
                                )
                                with gr.Row(
                                    elem_id="forge_neo_settings_sysinfo_internal_row",
                                    elem_classes=["forge-neo-settings-row", "forge-neo-internal-settings-actions"],
                                    visible=False,
                                ):
                                    settings_refresh_sysinfo = gr.Button(
                                        _label("Refresh system info", "刷新系统信息"),
                                        elem_id="forge_neo_settings_refresh_sysinfo",
                                        visible=False,
                                    )
                                    settings_download_sysinfo = gr.Button(
                                        _label("Download system info", "下载系统信息"),
                                        elem_id="forge_neo_settings_download_sysinfo",
                                        visible=False,
                                    )
                                    settings_sysinfo_download = gr.DownloadButton(
                                        label=_label("Download sysinfo.json", "下载 sysinfo.json"),
                                        value=None,
                                        elem_id="forge_neo_settings_sysinfo_download",
                                        visible=False,
                                    )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_sysinfo_check_file = gr.File(
                                        label=_label("Check system info for validity", "检查系统信息有效性"),
                                        file_types=[".json"],
                                        type="filepath",
                                        elem_id="forge_neo_settings_sysinfo_check_file",
                                    )
                                    settings_sysinfo_validity = gr.HTML(
                                        _settings_sysinfo_validity_html(state={"__lang": getattr(args_manager.args, "language", "cn")}),
                                        elem_id="forge_neo_settings_sysinfo_validity",
                                        visible=False,
                                    )
                        with gr.Tab(_label("Actions", "操作"), elem_id="forge_neo_settings_actions", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                with gr.Row(
                                    elem_id="forge_neo_settings_internal_reload_row",
                                    elem_classes=["forge-neo-settings-row", "forge-neo-internal-settings-actions"],
                                    visible=False,
                                ):
                                    settings_reload = gr.Button(
                                        _label("Reload settings", "重新读取设置"),
                                        elem_id="forge_neo_settings_reload",
                                        visible=False,
                                    )
                                    settings_reset = gr.Button(
                                        _label("Restore defaults", "恢复默认"),
                                        elem_id="forge_neo_settings_reset",
                                        visible=False,
                                    )
                                with gr.Row(
                                    elem_id="forge_neo_settings_internal_search_row",
                                    elem_classes=["forge-neo-settings-row", "forge-neo-internal-settings-actions"],
                                    visible=False,
                                ):
                                    settings_show_all_pages = gr.Button(
                                        _label("Show all pages", "显示全部页面"),
                                        elem_id="forge_neo_settings_show_all_pages",
                                        visible=False,
                                    )
                                    settings_show_one_page = gr.Button(
                                        _label("Show only one page", "仅显示当前页面"),
                                        elem_id="forge_neo_settings_show_one_page",
                                        visible=False,
                                    )
                                settings_request_notifications = gr.Button(
                                    _label("Request browser notifications", "申请浏览器通知权限"),
                                    elem_id="forge_neo_settings_request_notifications",
                                )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_download_localization = gr.Button(
                                        _label("Download localization template", "下载本地化模板"),
                                        elem_id="forge_neo_settings_download_localization",
                                    )
                                    settings_localization_download = gr.DownloadButton(
                                        label=_label("Download localization.json", "下载 localization.json"),
                                        value=None,
                                        elem_id="forge_neo_settings_localization_download",
                                    )
                                settings_localization_preview = gr.HTML(
                                    _initial_localization_template_preview(),
                                    elem_id="forge_neo_settings_localization_preview",
                                    visible=False,
                                )
                                settings_reload_script_bodies = gr.Button(
                                    _label("Reload custom script bodies", "重新读取自定义脚本体"),
                                    elem_id="forge_neo_settings_reload_script_bodies",
                                )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_unload_models = gr.Button(
                                        _label("Unload All Models", "卸载所有模型"),
                                        elem_id="forge_neo_settings_unload_models",
                                    )
                                    settings_list_loaded_models = gr.Button(
                                        _label("List Loaded Models", "列出已加载模型"),
                                        elem_id="forge_neo_settings_list_loaded_models",
                                    )
                                with gr.Row(elem_classes=["forge-neo-settings-row"]):
                                    settings_calculate_checkpoint_hash = gr.Button(
                                        _label("Calculate hash for all checkpoint", "计算所有模型哈希"),
                                        elem_id="forge_neo_settings_calculate_all_checkpoint_hash",
                                    )
                                    settings_checkpoint_hash_threads = gr.Number(
                                        value=1,
                                        label=_label("Number of parallel calculations", "并行计算数量"),
                                        precision=0,
                                        minimum=1,
                                        maximum=32,
                                        elem_id="forge_neo_settings_calculate_all_checkpoint_hash_threads",
                                    )
                                settings_checkpoint_hashes = gr.HTML(
                                    _initial_checkpoint_hashes_preview(),
                                    elem_id="forge_neo_settings_checkpoint_hashes",
                                    visible=False,
                                )
                        with gr.Tab(_label("Licenses", "许可证"), elem_id="forge_neo_settings_licenses", render_children=True):
                            with gr.Column(elem_classes=["forge-neo-settings-panel"]):
                                settings_licenses = gr.HTML(
                                    _initial_license_notice(),
                                    elem_id="forge_neo_settings_licenses_html",
                                )
                    settings_search_results = gr.HTML(
                        _initial_settings_search_results(),
                        elem_id="forge_neo_settings_search_results",
                        visible=False,
                    )

                    settings_components = [
                        settings_output_dir,
                        settings_txt2img_samples_dir,
                        settings_img2img_samples_dir,
                        settings_extras_samples_dir,
                        settings_video_dir,
                        settings_grids_dir,
                        settings_txt2img_grids_dir,
                        settings_img2img_grids_dir,
                        settings_save_dir,
                        settings_init_images_dir,
                        settings_save_samples,
                        settings_enable_pnginfo,
                        settings_save_txt,
                        settings_save_write_log_csv,
                        settings_save_selected_only,
                        settings_samples_format,
                        settings_filename_pattern,
                        settings_save_images_add_number,
                        settings_save_images_existing_action,
                        settings_grid_save,
                        settings_grid_format,
                        settings_grid_extended_filename,
                        settings_grid_only_if_multiple,
                        settings_grid_prevent_empty_spots,
                        settings_zip_filename_pattern,
                        settings_grid_row_count,
                        settings_grid_text_color,
                        settings_grid_inactive_text_color,
                        settings_grid_background_color,
                        settings_save_init_img,
                        settings_save_before_face_restoration,
                        settings_save_before_highres_fix,
                        settings_save_before_color_correction,
                        settings_save_mask,
                        settings_save_mask_composite,
                        settings_jpeg_quality,
                        settings_webp_lossless,
                        settings_save_large_images_as_jpg,
                        settings_large_image_jpg_file_limit,
                        settings_large_image_jpg_dimension_limit,
                        settings_video_save_frames,
                        settings_video_play_on_finish,
                        settings_video_loop_playback,
                        settings_video_crf,
                        settings_video_preset,
                        settings_video_profile,
                        settings_video_extension,
                        settings_save_to_dirs,
                        settings_grid_save_to_dirs,
                        settings_save_to_dirs_for_ui,
                        settings_directories_filename_pattern,
                        settings_directories_max_prompt_words,
                        settings_control_net_models_path,
                        settings_control_net_unit_count,
                        settings_control_net_model_cache_size,
                        settings_control_net_sync_field_args,
                        settings_control_net_no_detectmap,
                        settings_cross_attention_optimization,
                        settings_persistent_cond_cache,
                        settings_skip_early_cond,
                        settings_s_min_uncond,
                        settings_s_min_uncond_all,
                        settings_token_merging_ratio,
                        settings_token_merging_ratio_img2img,
                        settings_token_merging_ratio_hr,
                        settings_token_merging_stride,
                        settings_token_merging_downsample,
                        settings_token_merging_no_rand,
                        settings_show_refiner,
                        settings_refiner_fast_sd,
                        settings_refiner_use_steps,
                        settings_refiner_lora_replacement,
                        settings_hide_samplers,
                        settings_sd_unet,
                        settings_emphasis,
                        settings_scaling_factor,
                        settings_clip_skip,
                        settings_comma_padding_backtrack,
                        settings_tiling,
                        settings_randn_source,
                        settings_sdxl_crop_top,
                        settings_sdxl_crop_left,
                        settings_sdxl_low_score,
                        settings_sdxl_high_score,
                        settings_sdxl_zero_neg,
                        settings_lumina_positive,
                        settings_lumina_negative,
                        settings_qwen_vae_resize,
                        settings_klein_no_reference,
                        settings_sd_vae,
                        settings_sd_vae_encode_method,
                        settings_sd_vae_decode_method,
                        settings_inpainting_mask_weight,
                        settings_initial_noise_multiplier,
                        settings_img2img_extra_noise,
                        settings_img2img_color_correction,
                        settings_img2img_fix_steps,
                        settings_img2img_background_color,
                        settings_img2img_sketch_brush_color,
                        settings_img2img_inpaint_mask_brush_color,
                        settings_img2img_inpaint_sketch_brush_color,
                        settings_img2img_inpaint_mask_high_contrast,
                        settings_img2img_inpaint_mask_scribble_alpha,
                        settings_return_mask,
                        settings_return_mask_composite,
                        settings_img2img_batch_show_results_limit,
                        settings_overlay_inpaint,
                        settings_img2img_autosize,
                        settings_img2img_batch_use_original_name,
                        settings_img2img_inpaint_precise_mask,
                        settings_txt2img_upscale_single_batch,
                        settings_txt2img_upscale_same_seed,
                        settings_hires_button_gallery_insert,
                        settings_hires_insert_index,
                        settings_use_old_hires_fix_width_height,
                        settings_hires_fix_use_firstpass_conds,
                        settings_enable_prompt_comments,
                        settings_save_prompt_comments,
                        settings_forge_canvas_height,
                        settings_forge_canvas_toolbar_always,
                        settings_forge_canvas_consistent_brush,
                        settings_forge_canvas_plain,
                        settings_forge_canvas_plain_color,
                        settings_do_not_show_images,
                        settings_gallery_height,
                        settings_return_grid,
                        settings_js_modal_lightbox,
                        settings_js_modal_lightbox_initially_zoomed,
                        settings_js_modal_lightbox_gamepad,
                        settings_js_modal_lightbox_gamepad_repeat,
                        settings_lightbox_icon_opacity,
                        settings_lightbox_toolbar_opacity,
                        settings_open_dir_button_choice,
                        settings_add_model_name_to_info,
                        settings_add_model_hash_to_info,
                        settings_add_user_name_to_info,
                        settings_add_version_to_infotext,
                        settings_disable_weights_auto_swap,
                        settings_disable_modules_auto_swap,
                        settings_infotext_skip_pasting,
                        settings_infotext_styles,
                        settings_keyedit_precision_attention,
                        settings_keyedit_precision_extra,
                        settings_keyedit_delimiters,
                        settings_keyedit_delimiters_whitespace,
                        settings_keyedit_move,
                        settings_disable_token_counters,
                        settings_include_styles_into_token_counters,
                        *settings_tagcomplete_components,
                        settings_extra_options_txt2img,
                        settings_extra_options_img2img,
                        settings_extra_options_cols,
                        settings_extra_options_accordion,
                        settings_show_rescale_cfg,
                        settings_show_mahiro,
                        settings_paste_safe_guard,
                        settings_ctrl_enter_interrupt,
                        settings_quicksettings_accordion,
                        settings_quicksettings_accordion_starts_closed,
                        settings_remove_image_on_hover,
                        settings_forbidden_knowledge,
                        settings_hires_fix_show_sampler,
                        settings_hires_fix_show_prompts,
                        settings_txt2img_settings_accordion,
                        settings_img2img_settings_accordion,
                        settings_interrupt_after_current,
                        settings_live_previews,
                        settings_show_progressbar,
                        settings_preview_refresh,
                        settings_extra_multiplier,
                        settings_extra_separator,
                        settings_extra_card_width,
                        settings_extra_card_height,
                        settings_localization,
                        settings_quicksettings_list,
                        settings_ui_tab_order,
                        settings_hidden_tabs,
                        settings_ui_reorder_list,
                        settings_gradio_theme,
                        settings_gradio_themes_cache,
                        settings_show_progress_in_title,
                        settings_send_seed,
                        settings_send_cfg,
                        settings_send_size,
                        settings_send_image_info_not_ui,
                        settings_allow_i2i_send_info,
                        settings_enable_reloading_ui_scripts,
                        settings_checkpoint_short,
                        settings_dimensions_batch,
                        settings_prompt_box_style,
                        settings_api_enable_requests,
                        settings_api_forbid_local_requests,
                        settings_api_useragent,
                        *settings_callback_components,
                        settings_profiling_enable,
                        settings_profiling_activities,
                        settings_profiling_record_shapes,
                        settings_profiling_profile_memory,
                        settings_profiling_with_stack,
                        settings_profiling_filename,
                        settings_allocated_vram,
                        settings_res_step,
                        settings_auto_launch_browser,
                        settings_enable_console_prompts,
                        settings_samples_log_stdout,
                        settings_show_warnings,
                        settings_show_gradio_deprecation_warnings,
                        settings_memmon_poll_rate,
                        settings_multiple_tqdm,
                        settings_enable_upscale_progressbar,
                        settings_list_hidden_files,
                        settings_dump_stacks_on_signal,
                        settings_no_spellcheck,
                        settings_face_restoration,
                        settings_face_restoration_model,
                        settings_code_former_weight,
                        settings_face_restoration_unload,
                        settings_postprocessing_enable_in_main_ui,
                        settings_postprocessing_disable_in_extras,
                        settings_postprocessing_operation_order,
                        settings_esrgan_tile,
                        settings_esrgan_tile_overlap,
                        settings_composite_tiles_on_gpu,
                        settings_upscaler_for_img2img,
                        settings_upscaling_max_images_in_cache,
                        settings_set_scale_by_when_changing_upscaler,
                        settings_prefer_fp16_upscalers,
                        settings_svdq_cpu_offload,
                        settings_svdq_cache_threshold,
                        settings_svdq_attention,
                        settings_svdq_use_pin_memory,
                        settings_svdq_num_blocks_on_gpu,
                        *settings_forge_couple_components,
                        *settings_preset_components,
                    ]
                    settings_sd_unet_refresh.click(
                        lambda: gr.update(choices=STABLE_DIFFUSION_UNET_CHOICES, value="Automatic"),
                        outputs=[settings_sd_unet],
                        show_progress=False,
                    )
                    settings_submit.click(
                        _apply_settings_clicked,
                        inputs=[state, *settings_components],
                        outputs=[settings_config_json, settings_result],
                        show_progress="hidden",
                    )
                    settings_reload.click(
                        _reload_settings_clicked,
                        inputs=[state],
                        outputs=[*settings_components, settings_config_json, settings_result],
                        show_progress="hidden",
                    )
                    settings_reset.click(
                        _reset_settings_clicked,
                        inputs=[state],
                        outputs=[*settings_components, settings_config_json, settings_result],
                        show_progress="hidden",
                    )
                    settings_defaults_view.click(
                        _settings_defaults_view_clicked,
                        inputs=[state, *settings_components],
                        outputs=[settings_defaults_review],
                        show_progress="hidden",
                    )
                    settings_defaults_apply.click(
                        _settings_defaults_apply_clicked,
                        inputs=[state, *settings_components],
                        outputs=[settings_defaults_review, settings_config_json],
                        show_progress="hidden",
                    )
                    settings_reload_ui.click(
                        _request_reload_ui,
                        inputs=[state],
                        outputs=[settings_result],
                        js="(current_state) => window.forgeNeoRequestReload(current_state)",
                        show_progress="hidden",
                    )
                    settings_refresh_sysinfo.click(
                        _settings_sysinfo_clicked,
                        outputs=[settings_sysinfo],
                        show_progress="hidden",
                    )
                    settings_download_sysinfo.click(
                        _download_sysinfo_clicked,
                        inputs=[state],
                        outputs=[settings_sysinfo, settings_sysinfo_download, settings_result],
                        show_progress="hidden",
                    )
                    settings_sysinfo_check_file.change(
                        _check_sysinfo_file_changed,
                        inputs=[settings_sysinfo_check_file, state],
                        outputs=[settings_sysinfo_validity],
                        show_progress="hidden",
                    )
                    settings_request_notifications.click(
                        None,
                        inputs=[state],
                        outputs=[settings_result],
                        js="(current_state) => window.forgeNeoRequestNotifications(current_state)",
                        show_progress="hidden",
                    )
                    settings_download_localization.click(
                        _download_localization_template_clicked,
                        inputs=[state],
                        outputs=[settings_localization_preview, settings_localization_download, settings_result],
                        show_progress="hidden",
                    )
                    settings_reload_script_bodies.click(
                        _reload_script_bodies_clicked,
                        inputs=[state],
                        outputs=[settings_result],
                        show_progress="hidden",
                    )
                    settings_unload_models.click(
                        _settings_unload_models_clicked,
                        inputs=[state],
                        outputs=[settings_result],
                        show_progress="hidden",
                    )
                    unload_vram_btn.click(
                        _settings_unload_models_clicked,
                        inputs=[state],
                        outputs=[settings_result],
                        show_progress="hidden",
                    )
                    settings_list_loaded_models.click(
                        _settings_list_loaded_models_clicked,
                        inputs=[state, checkpoint, text_encoders, low_bits],
                        outputs=[settings_result],
                        show_progress="hidden",
                    )
                    settings_calculate_checkpoint_hash.click(
                        _calculate_checkpoint_hashes_clicked,
                        inputs=[state, settings_checkpoint_hash_threads],
                        outputs=[settings_checkpoint_hashes, settings_result],
                        show_progress="hidden",
                    )
                    settings_search.submit(
                        _settings_search_submitted,
                        inputs=[state, settings_search],
                        outputs=[settings_search_results, settings_result],
                        show_progress="hidden",
                    )
                    settings_show_all_pages.click(
                        _settings_show_all_clicked,
                        inputs=[state],
                        outputs=[settings_search_results, settings_result],
                        show_progress="hidden",
                    )
                    settings_show_one_page.click(
                        _settings_show_one_clicked,
                        inputs=[state],
                        outputs=[settings_search_results, settings_result],
                        show_progress="hidden",
                    )
                with gr.Tab(_label("Extensions", "扩展"), elem_id="forge_neo_extensions_tab"):
                    with gr.Tabs(elem_id="forge_neo_extensions_tabs", elem_classes=["forge-neo-extensions-tabs"]):
                        with gr.Tab(_label("Installed", "已安装"), elem_id="forge_neo_extensions_installed_tab"):
                            extensions_disabled_list = gr.State("[]")
                            extensions_update_list = gr.State("[]")
                            with gr.Row(elem_id="forge_neo_extensions_installed_top", elem_classes=["forge-neo-extensions-toolbar"]):
                                extensions_apply = gr.Button(
                                    _label("Apply and restart UI", "应用并重载 UI"),
                                    variant="primary",
                                    elem_id="forge_neo_extensions_apply",
                                )
                                extensions_check = gr.Button(
                                    _label("Check for updates", "检查更新"),
                                    elem_id="forge_neo_extensions_check",
                                )
                                extensions_disable_all = gr.Radio(
                                    _localized_value_choices(
                                        [
                                            ("none", "不禁用"),
                                            ("extra", "仅禁用第三方"),
                                            ("all", "禁用全部"),
                                        ]
                                    ),
                                    value="none",
                                    label=_label("Disable all extensions", "禁用扩展"),
                                    elem_id="forge_neo_extensions_disable_all",
                                )
                                extensions_refresh = gr.Button(
                                    _label("Refresh", "刷新"),
                                    elem_id="forge_neo_extensions_refresh",
                                )
                            extensions_info = gr.HTML(
                                "",
                                elem_id="forge_neo_extensions_info",
                            )
                            with gr.Column(elem_classes=["forge-neo-extensions-panel", "forge-neo-extensions-installed-panel"]):
                                extensions_apply_preview = gr.HTML(
                                    _initial_extension_apply_preview(),
                                    elem_id="forge_neo_extensions_apply_preview",
                                    visible=False,
                                )
                                extensions_update_preview = gr.HTML(
                                    _initial_extension_update_preview(),
                                    elem_id="forge_neo_extensions_update_preview",
                                    visible=False,
                                )
                                extensions_installed_html = gr.HTML(
                                    _initial_extension_table(),
                                    elem_id="forge_neo_extensions_installed_html",
                                )
                        with gr.Tab(_label("Available", "可用"), elem_id="forge_neo_extensions_available_tab"):
                            with gr.Column(elem_classes=["forge-neo-extensions-panel"]):
                                with gr.Row(elem_classes=["forge-neo-extensions-toolbar"]):
                                    extensions_load_available = gr.Button(
                                        _label("Refresh adapted list", "刷新清单"),
                                        variant="primary",
                                        elem_id="forge_neo_extensions_load_available",
                                    )
                                with gr.Row(elem_classes=["forge-neo-extensions-row"]):
                                    extensions_selected_tags = gr.CheckboxGroup(
                                        cached_available_extension_tag_choices(
                                            ADAPTED_AVAILABLE_EXTENSION_SOURCE,
                                            lang=getattr(args_manager.args, "language", "cn"),
                                        ),
                                        value=[],
                                        label=_label("Extension tags", "扩展标签"),
                                        elem_id="forge_neo_extensions_selected_tags",
                                    )
                                    extensions_sort_column = gr.Radio(
                                        _localized_value_choices(
                                            [
                                                ("newest first", "最新优先"),
                                                ("oldest first", "最早优先"),
                                                ("a-z", "A-Z"),
                                                ("z-a", "Z-A"),
                                                ("internal order", "内部顺序"),
                                                ("update time", "更新时间"),
                                                ("create time", "创建时间"),
                                                ("stars", "星标数"),
                                            ]
                                        ),
                                        value="internal order",
                                        label=_label("Order", "排序"),
                                        elem_id="forge_neo_extensions_sort_column",
                                    )
                                with gr.Row(elem_classes=["forge-neo-extensions-row"]):
                                    extensions_showing_type = gr.Radio(
                                        _localized_value_choices(
                                            [
                                                ("show", "只显示匹配标签"),
                                                ("hide", "隐藏匹配标签"),
                                            ]
                                        ),
                                        value="show",
                                        label=_label("Showing type", "显示类型"),
                                        elem_id="forge_neo_extensions_showing_type",
                                    )
                                    extensions_filtering_type = gr.Radio(
                                        _localized_value_choices(
                                            [
                                                ("or", "任一标签"),
                                                ("and", "全部标签"),
                                            ]
                                        ),
                                        value="or",
                                        label=_label("Filtering type", "匹配方式"),
                                        elem_id="forge_neo_extensions_filtering_type",
                                    )
                                extensions_search = gr.Textbox(
                                    label=_label("Search", "搜索"),
                                    elem_id="forge_neo_extensions_search",
                                )
                                extensions_available_html = gr.HTML(
                                    _extensions_available_empty(),
                                    elem_id="forge_neo_extensions_available_html",
                                )
                                extensions_install_preview = gr.HTML(
                                    _initial_extension_install_preview(),
                                    elem_id="forge_neo_extensions_install_preview",
                                    visible=False,
                                )
                                with gr.Column(elem_id="forge_neo_extension_install_bridge", elem_classes=["forge-neo-extension-install-bridge"]):
                                    extensions_index_url = gr.Textbox(
                                        value=ADAPTED_AVAILABLE_EXTENSION_SOURCE,
                                        label=_label("Extension list source", "扩展清单来源"),
                                        show_label=False,
                                        elem_id="forge_neo_extensions_index_url",
                                    )
                                    extensions_install_url = gr.Textbox(
                                        label=_label("URL for extension's git repository", "扩展 git 仓库 URL"),
                                        elem_id="forge_neo_extensions_install_url",
                                    )
                                    extensions_install_branch = gr.Textbox(
                                        label=_label("Specific branch name", "指定分支名"),
                                        placeholder=_label("Leave empty for default main branch", "留空则使用默认主分支"),
                                        elem_id="forge_neo_extensions_install_branch",
                                    )
                                    extensions_install_dirname = gr.Textbox(
                                        label=_label("Local directory name", "本地目录名"),
                                        placeholder=_label("Leave empty for auto", "留空则自动命名"),
                                        elem_id="forge_neo_extensions_install_dirname",
                                    )
                                    extensions_install = gr.Button(
                                        _label("Install", "安装"),
                                        variant="primary",
                                        elem_id="forge_neo_extensions_install",
                                    )
                        with gr.Tab(_label("Backup/Restore", "备份/恢复"), elem_id="forge_neo_extensions_backup_restore_tab"):
                            with gr.Column(elem_classes=["forge-neo-extensions-panel", "forge-neo-extensions-backup-panel"]):
                                with gr.Row(elem_classes=["forge-neo-extensions-toolbar"]):
                                    extensions_saved_configs = gr.Dropdown(
                                        extension_config_choices(lang=getattr(args_manager.args, "language", "cn")),
                                        value="Current",
                                        label=_label("Saved Configs", "已保存配置"),
                                        elem_id="forge_neo_extensions_backup_saved_configs",
                                    )
                                    extensions_backup_refresh = gr.Button(
                                        _label("Refresh", "刷新"),
                                        elem_id="forge_neo_extensions_backup_refresh",
                                    )
                                    extensions_restore_type = gr.Radio(
                                        _localized_value_choices(
                                            [
                                                ("extensions", "仅扩展"),
                                                ("webui", "仅 WebUI"),
                                                ("both", "全部"),
                                            ]
                                        ),
                                        value="extensions",
                                        label=_label("State to restore", "恢复范围"),
                                        elem_id="forge_neo_extensions_backup_restore_type",
                                    )
                                    extensions_restore = gr.Button(
                                        _label("Restore Selected Config", "恢复所选配置"),
                                        variant="primary",
                                        elem_id="forge_neo_extensions_backup_restore",
                                    )
                                with gr.Row(elem_classes=["forge-neo-extensions-toolbar"]):
                                    extensions_save_name = gr.Textbox(
                                        "",
                                        label=_label("Config Name", "配置名称"),
                                        placeholder=_label("Config Name", "配置名称"),
                                        show_label=False,
                                        elem_id="forge_neo_extensions_backup_save_name",
                                    )
                                    extensions_save_state = gr.Button(
                                        _label("Save Current Config", "保存当前配置"),
                                        elem_id="forge_neo_extensions_backup_save",
                                    )
                                    extensions_config_download = gr.DownloadButton(
                                        label=_label("Download Config", "下载配置"),
                                        value=None,
                                        elem_id="forge_neo_extensions_backup_download",
                                        visible=False,
                                    )
                                extensions_summary_json = gr.HTML(
                                    _extensions_summary_html(extension_summary()),
                                    elem_id="forge_neo_extensions_summary_json",
                                    visible=False,
                                )
                                extensions_config_state = gr.HTML(
                                    _initial_extension_config_state(),
                                    elem_id="forge_neo_extensions_config_state",
                                )
                                extensions_config_diff = gr.HTML(
                                    _initial_extension_config_diff(),
                                    elem_id="forge_neo_extensions_config_diff",
                                    visible=False,
                                )

                    extensions_refresh.click(
                        _refresh_extensions_clicked,
                        inputs=[state],
                        outputs=[extensions_installed_html, extensions_summary_json, extensions_config_state, extensions_config_diff],
                        show_progress=False,
                    )
                    extensions_apply.click(
                        _apply_extensions_preview_clicked,
                        inputs=[state, extensions_disable_all, extensions_disabled_list, extensions_update_list],
                        outputs=[
                            extensions_disabled_list,
                            extensions_update_list,
                            extensions_apply_preview,
                            extensions_info,
                            extensions_installed_html,
                            extensions_summary_json,
                            extensions_config_state,
                        ],
                        js="(current_state, disable_all, disabled_list, update_list) => window.forgeNeoExtensionsApply(current_state, disable_all, disabled_list, update_list)",
                        show_progress=False,
                    )
                    extensions_check.click(
                        _check_extensions_clicked,
                        inputs=[state],
                        outputs=[extensions_update_list, extensions_update_preview, extensions_info, extensions_installed_html],
                        show_progress=False,
                    )
                    extensions_load_available.click(
                        _load_available_extensions_clicked,
                        inputs=[
                            state,
                            extensions_index_url,
                            extensions_selected_tags,
                            extensions_showing_type,
                            extensions_filtering_type,
                            extensions_sort_column,
                            extensions_search,
                        ],
                        outputs=[extensions_available_html, extensions_selected_tags, extensions_info],
                    )
                    for available_filter in (extensions_selected_tags, extensions_showing_type, extensions_filtering_type, extensions_sort_column):
                        available_filter.change(
                            _filter_available_extensions_changed,
                            inputs=[
                                state,
                                extensions_index_url,
                                extensions_selected_tags,
                                extensions_showing_type,
                                extensions_filtering_type,
                                extensions_sort_column,
                                extensions_search,
                            ],
                            outputs=[extensions_available_html, extensions_info],
                            show_progress=False,
                        )
                    extensions_search.submit(
                        _filter_available_extensions_changed,
                        inputs=[
                            state,
                            extensions_index_url,
                            extensions_selected_tags,
                            extensions_showing_type,
                            extensions_filtering_type,
                            extensions_sort_column,
                            extensions_search,
                        ],
                        outputs=[extensions_available_html, extensions_info],
                        show_progress=False,
                    )
                    extensions_search.change(
                        _filter_available_extensions_changed,
                        inputs=[
                            state,
                            extensions_index_url,
                            extensions_selected_tags,
                            extensions_showing_type,
                            extensions_filtering_type,
                            extensions_sort_column,
                            extensions_search,
                        ],
                        outputs=[extensions_available_html, extensions_info],
                        show_progress=False,
                    )
                    extensions_install.click(
                        _install_extension_preview_clicked,
                        inputs=[state, extensions_install_dirname, extensions_install_url, extensions_install_branch],
                        outputs=[extensions_install_dirname, extensions_install_preview, extensions_info, extensions_installed_html, extensions_summary_json, extensions_config_state],
                        show_progress=False,
                    )
                    extensions_restore.click(
                        _restore_extension_config_state_clicked,
                        inputs=[state, extensions_saved_configs, extensions_restore_type],
                        outputs=[extensions_config_diff, extensions_info],
                        show_progress=False,
                    )
                    extensions_save_state.click(
                        _save_extension_config_state_clicked,
                        inputs=[state, extensions_save_name],
                        outputs=[
                            extensions_saved_configs,
                            extensions_info,
                            extensions_config_state,
                            extensions_config_diff,
                            extensions_summary_json,
                            extensions_config_download,
                        ],
                        show_progress=False,
                    )
                    extensions_backup_refresh.click(
                        _refresh_extension_config_states_clicked,
                        inputs=[state],
                        outputs=[extensions_saved_configs, extensions_config_state, extensions_config_diff, extensions_config_download, extensions_info],
                        show_progress=False,
                    )
                    extensions_saved_configs.change(
                        _extension_config_state_selected,
                        inputs=[extensions_saved_configs, state],
                        outputs=[extensions_config_state, extensions_config_diff, extensions_config_download],
                        show_progress=False,
                    )

            gr.HTML(_footer_html(), elem_id="footer", elem_classes=["forge-neo-footer-block"])

            txt_open_folder.click(_open_output_folder_clicked, inputs=[state], outputs=[status])
            txt_save.click(
                lambda current_gallery, current_info, current_state, current_index: _save_output_clicked(
                    current_gallery, current_info, current_state, False, current_index
                ),
                inputs=[gallery, infotext_raw, state, gallery_selected_index],
                outputs=[status],
            )
            txt_save_zip.click(
                lambda current_gallery, current_info, current_state, current_index: _save_output_clicked(
                    current_gallery, current_info, current_state, True, current_index
                ),
                inputs=[gallery, infotext_raw, state, gallery_selected_index],
                outputs=[status],
            )
            txt_send_img2img.click(
                _send_output_to_img2img,
                inputs=[gallery, infotext_raw, state, gallery_selected_index],
                outputs=[
                    img_input,
                    img_prompt,
                    img_negative,
                    img_sampler,
                    img_scheduler,
                    img_steps,
                    img_width,
                    img_height,
                    img_cfg_scale,
                    img_seed,
                    *_script_send_outputs(img_script, img_script_controls),
                    img_denoising_strength,
                    status,
                ],
            )
            txt_send_inpaint.click(
                _send_output_to_inpaint,
                inputs=[gallery, infotext_raw, state, gallery_selected_index],
                outputs=[
                    img_inpaint,
                    img_prompt,
                    img_negative,
                    img_sampler,
                    img_scheduler,
                    img_steps,
                    img_width,
                    img_height,
                    img_cfg_scale,
                    img_seed,
                    *_script_send_outputs(img_script, img_script_controls),
                    img_denoising_strength,
                    mode_img,
                    status,
                ],
            )
            txt_send_extras.click(_send_output_to_extras, inputs=[gallery, state, gallery_selected_index], outputs=[extras_image, status])
            txt_send_storyboard.click(
                _send_output_to_storyboard,
                inputs=[gallery, state, gallery_selected_index],
                outputs=[status, *storyboard_outputs],
            )
            txt_upscale.click(
                _send_output_to_upscale,
                inputs=[gallery, state, gallery_selected_index],
                outputs=[extras_image, extras_mode, extras_resize_mode, extras_resize_scale, status],
            )

            img_open_folder.click(_open_output_folder_clicked, inputs=[state], outputs=[img_status])
            img_save.click(
                lambda current_gallery, current_info, current_state, current_index: _save_output_clicked(
                    current_gallery, current_info, current_state, False, current_index
                ),
                inputs=[img_gallery, img_infotext_raw, state, img_gallery_selected_index],
                outputs=[img_status],
            )
            img_save_zip.click(
                lambda current_gallery, current_info, current_state, current_index: _save_output_clicked(
                    current_gallery, current_info, current_state, True, current_index
                ),
                inputs=[img_gallery, img_infotext_raw, state, img_gallery_selected_index],
                outputs=[img_status],
            )
            img_send_img2img.click(
                _send_output_to_img2img,
                inputs=[img_gallery, img_infotext_raw, state, img_gallery_selected_index],
                outputs=[
                    img_input,
                    img_prompt,
                    img_negative,
                    img_sampler,
                    img_scheduler,
                    img_steps,
                    img_width,
                    img_height,
                    img_cfg_scale,
                    img_seed,
                    *_script_send_outputs(img_script, img_script_controls),
                    img_denoising_strength,
                    img_status,
                ],
            )
            img_send_inpaint.click(
                _send_output_to_inpaint,
                inputs=[img_gallery, img_infotext_raw, state, img_gallery_selected_index],
                outputs=[
                    img_inpaint,
                    img_prompt,
                    img_negative,
                    img_sampler,
                    img_scheduler,
                    img_steps,
                    img_width,
                    img_height,
                    img_cfg_scale,
                    img_seed,
                    *_script_send_outputs(img_script, img_script_controls),
                    img_denoising_strength,
                    mode_img,
                    img_status,
                ],
            )
            img_send_extras.click(_send_output_to_extras, inputs=[img_gallery, state, img_gallery_selected_index], outputs=[extras_image, img_status])
            img_send_storyboard.click(
                _send_output_to_storyboard,
                inputs=[img_gallery, state, img_gallery_selected_index],
                outputs=[img_status, *storyboard_outputs],
            )

            extras_open_folder.click(_open_output_folder_clicked, inputs=[state, extras_output_folder], outputs=[extras_status])
            extras_send_img2img.click(
                _send_output_to_img2img,
                inputs=[extras_gallery, extras_infotext_raw, state, extras_gallery_selected_index],
                outputs=[
                    img_input,
                    img_prompt,
                    img_negative,
                    img_sampler,
                    img_scheduler,
                    img_steps,
                    img_width,
                    img_height,
                    img_cfg_scale,
                    img_seed,
                    *_script_send_outputs(img_script, img_script_controls),
                    img_denoising_strength,
                    extras_status,
                ],
            )
            extras_send_inpaint.click(
                _send_output_to_inpaint,
                inputs=[extras_gallery, extras_infotext_raw, state, extras_gallery_selected_index],
                outputs=[
                    img_inpaint,
                    img_prompt,
                    img_negative,
                    img_sampler,
                    img_scheduler,
                    img_steps,
                    img_width,
                    img_height,
                    img_cfg_scale,
                    img_seed,
                    *_script_send_outputs(img_script, img_script_controls),
                    img_denoising_strength,
                    mode_img,
                    extras_status,
                ],
            )
            extras_send_extras.click(
                _send_output_to_extras,
                inputs=[extras_gallery, state, extras_gallery_selected_index],
                outputs=[extras_image, extras_status],
            )

            preset_outputs = [
                checkpoint,
                vae,
                text_encoders,
                low_bits,
                prompt,
                img_prompt,
                steps,
                width,
                height,
                cfg_scale,
                distilled_cfg_scale,
                hr_steps,
                hr_cfg,
                hr_distilled_cfg,
                batch_size,
                sampler,
                scheduler,
                img_steps,
                img_width,
                img_height,
                img_cfg_scale,
                img_distilled_cfg_scale,
                img_batch_size,
                img_sampler,
                img_scheduler,
                lora_dropdown,
                img_lora_dropdown,
                txt_lora_weights,
                img_lora_weights,
                hr_checkpoint,
                hr_additional_modules,
                refiner_checkpoint,
                img_refiner_checkpoint,
                txt_integrated["modulated_guidance_clip"],
                img_integrated["modulated_guidance_clip"],
                *_controlnet_model_outputs(txt_integrated, img_integrated),
                *_extra_browser_outputs(
                    txt_ti_browser,
                    txt_checkpoint_browser,
                    txt_lora_browser,
                    img_ti_browser,
                    img_checkpoint_browser,
                    img_lora_browser,
                ),
                merger_primary,
                merger_secondary,
                merger_tertiary,
                merger_bake_in_vae,
            ]
            preset.change(
                _preset_changed,
                inputs=[preset],
                outputs=preset_outputs,
                js="(preset) => window.forgeNeoRememberPreset(preset)",
            )
            preset_restore_apply.click(
                _preset_restore_changed,
                inputs=[preset_restore],
                outputs=[preset, *preset_outputs],
                queue=False,
                show_progress=False,
            )
            checkpoint.change(
                _checkpoint_changed,
                inputs=[checkpoint, preset],
                outputs=[vae, text_encoders],
                queue=False,
                show_progress=False,
            )
            text_encoders.change(
                _text_encoders_changed,
                inputs=[text_encoders],
                outputs=[vae],
                queue=False,
                show_progress=False,
            )
            refresh_btn.click(
                _refresh_models,
                inputs=[preset],
                outputs=[
                    checkpoint,
                    vae,
                    text_encoders,
                    low_bits,
                    lora_dropdown,
                    img_lora_dropdown,
                    txt_lora_weights,
                    img_lora_weights,
                    hr_checkpoint,
                    hr_additional_modules,
                    refiner_checkpoint,
                    img_refiner_checkpoint,
                    txt_integrated["modulated_guidance_clip"],
                    img_integrated["modulated_guidance_clip"],
                    *_controlnet_model_outputs(txt_integrated, img_integrated),
                    *_extra_browser_outputs(
                        txt_ti_browser,
                        txt_checkpoint_browser,
                        txt_lora_browser,
                        img_ti_browser,
                        img_checkpoint_browser,
                        img_lora_browser,
                    ),
                    merger_primary,
                    merger_secondary,
                    merger_tertiary,
                    merger_bake_in_vae,
                ],
            )
            language_switch.change(
                _language_changed,
                inputs=[language_switch, state],
                outputs=[state, runtime_marker],
                queue=False,
                show_progress=False,
            ).then(
                None,
                inputs=[state, language_switch],
                js="(current_state, lang) => window.forgeNeoSetLanguage(current_state, lang)",
            )

    return app
