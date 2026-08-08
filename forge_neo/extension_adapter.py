from __future__ import annotations

import base64
import csv
import hashlib
import html
import importlib
import importlib.util
import io
import json
import mimetypes
import os
import re
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse
from PIL import Image, ImageFilter, PngImagePlugin

from forge_neo.adetailer_compat import adetailer_model_names, adetailer_schema_payload, adetailer_version
from forge_neo.dynamic_prompts_compat import DYNAMIC_PROMPTS_EXTENSION, DYNAMIC_PROMPTS_SCRIPT_BASE_NAME
from forge_neo.forge_couple_compat import (
    FORGE_COUPLE_SCRIPT_NAME,
    forge_couple_default_args,
    forge_couple_schema_payload,
)
from forge_neo.regional_prompter_compat import (
    REGIONAL_PROMPTER_SCRIPT_NAME,
    regional_prompter_default_args,
    regional_prompter_schema_payload,
)


ROOT = Path(__file__).resolve().parents[1]
WEBUI_ROOT = ROOT / "forge_neo" / "webui"
USER_EXTENSIONS_DIR = WEBUI_ROOT / "extensions"
BUILTIN_EXTENSIONS_DIR = WEBUI_ROOT / "extensions-builtin"

TAGCOMPLETE_EXTENSION = "sd-webui-tagcomplete-neo"
PROMPT_ALL_IN_ONE_EXTENSION = "sd-webui-prompt-all-in-one-forgeneo"
TIPO_EXTENSION = "tipo"
WD14_TAGGER_EXTENSION = "stable-diffusion-webui-wd14-tagger"
ADETAILER_EXTENSION = "adetailer"
ADETAILER_EXTENSION_DIRNAME = "ADetailer-Neo"
REGIONAL_PROMPTER_EXTENSION = "sd-neo-regional-prompter"
FORGE_COUPLE_EXTENSION = "sd-forge-couple"
INFINITE_BROWSING_EXTENSION = "infinite-browsing"
AUTO_PHOTOSHOP_EXTENSION = "Auto-Photoshop-StableDiffusion-Plugin"
AESTHETIC_ENHANCEMENT_EXTENSION = "sd-webui-AestheticEnhancement"
ASPECT_RATIO_HELPER_EXTENSION = "sd-webui-aspect-ratio-helper"
CAMERA_ANGLE_SELECTOR_EXTENSION = "sd-webui-camera-angle-selector"
CIVITAI_HELPER_EXTENSION = "Stable-Diffusion-Webui-Civitai-Helper"
MULTIMODAL_MEDIA_EXTENSION = "sd-webui-multimodal-media"
QWEN_VISION_CHAT_EXTENSION = "sd-webui-qwen-vision-chat"
SAM_MATTING_EXTENSION = "sd-webui-sam-matting"
SEE_THROUGH_EXTENSION = "sd-webui-see-through"
STORYBOARD_ASSISTANT_EXTENSION = "sd-webui-Storyboard-Assistant"
STYLE_ORGANIZER_EXTENSION = "sd-webui-style-organizer"
TRELLIS2_EXTENSION = "sd-webui-trellis2"
AUTO_COMPLETE_EXTENSION = "sd-webui-auto-complete"
SUPPORTED_PROMPT_EXTENSIONS = (TAGCOMPLETE_EXTENSION, PROMPT_ALL_IN_ONE_EXTENSION)
FIRST_BATCH_PROMPT_EXTENSION_PROFILES = (TAGCOMPLETE_EXTENSION, PROMPT_ALL_IN_ONE_EXTENSION)
PRIORITY_EXTENSION_PROFILES = (
    DYNAMIC_PROMPTS_EXTENSION,
    TIPO_EXTENSION,
    WD14_TAGGER_EXTENSION,
    ADETAILER_EXTENSION,
    REGIONAL_PROMPTER_EXTENSION,
    FORGE_COUPLE_EXTENSION,
    INFINITE_BROWSING_EXTENSION,
)
API_ROUTE_EXTENSION_PROFILES = (AUTO_PHOTOSHOP_EXTENSION,)
UI_HELPER_EXTENSION_PROFILES = (ASPECT_RATIO_HELPER_EXTENSION,)
UI_TAB_EXTENSION_PROFILES = (
    CIVITAI_HELPER_EXTENSION,
    CAMERA_ANGLE_SELECTOR_EXTENSION,
    STORYBOARD_ASSISTANT_EXTENSION,
    AESTHETIC_ENHANCEMENT_EXTENSION,
    MULTIMODAL_MEDIA_EXTENSION,
    QWEN_VISION_CHAT_EXTENSION,
    SAM_MATTING_EXTENSION,
    SEE_THROUGH_EXTENSION,
    TRELLIS2_EXTENSION,
)
PROMPT_STYLE_EXTENSION_PROFILES = (STYLE_ORGANIZER_EXTENSION,)
PROFILE_ONLY_EXTENSION_PROFILES: tuple[str, ...] = ()
INFINITE_BROWSING_BASE = "/infinite_image_browsing"
AUTO_PHOTOSHOP_BASE = "/sdapi/auto-photoshop-sd"
CAMERA_ANGLE_SELECTOR_BASE = "/forge-neo/extensions/camera-angle-selector"

BRIDGE_JS = ROOT / "javascript" / "forge_neo_extension_bridge.js"
BRIDGE_CSS = ROOT / "css" / "forge_neo_extension_bridge.css"
CATALOG_PATH = ROOT / "forge_neo" / "extension_profile_catalog.json"
_INFINITE_BROWSING_MOUNT_ERROR = ""
_AUTO_PHOTOSHOP_MOUNT_ERROR = ""
_AUTO_PHOTOSHOP_SD_URL = os.environ.get("SD_URL", "http://127.0.0.1:7860")
ASPECT_RATIO_HELPER_JS = ROOT / "javascript" / "forge_neo_aspect_ratio_helper.js"
ASPECT_RATIO_HELPER_CSS = ROOT / "css" / "forge_neo_aspect_ratio_helper.css"
CAMERA_ANGLE_SELECTOR_JS = ROOT / "javascript" / "forge_neo_camera_angle_selector.js"
CAMERA_ANGLE_SELECTOR_CSS = ROOT / "css" / "forge_neo_camera_angle_selector.css"
DYNAMIC_PROMPTS_JS = ROOT / "javascript" / "forge_neo_dynamic_prompts.js"

TAGCOMPLETE_JS_FILES = (
    "javascript/__globals.js",
    "javascript/_baseParser.js",
    "javascript/_caretPosition.js",
    "javascript/_result.js",
    "javascript/_textAreas.js",
    "javascript/_utils.js",
    "javascript/ext_chants.js",
    "javascript/ext_embeddings.js",
    "javascript/ext_loras.js",
    "javascript/ext_lycos.js",
    "javascript/ext_modelKeyword.js",
    "javascript/ext_styles.js",
    "javascript/ext_umi.js",
    "javascript/ext_wildcards.js",
    "javascript/tagAutocomplete.js",
)

TAGCOMPLETE_EMPTY_TEMP_FILES = {
    "emb.txt": "",
    "hyp.txt": "",
    "known_lora_hashes.txt": "",
    "lora.txt": "",
    "lyco.txt": "",
    "styles.txt": "",
    "styleNames.txt": "",
    "umi_tags.txt": "",
    "wc.txt": "",
    "wce.txt": "",
    "wc_yaml.json": "{}\n",
}

SENSITIVE_KEY_RE = re.compile(r"(secret|token|password|passwd|api[_-]?key|access[_-]?key|app[_-]?id)", re.I)


@dataclass(frozen=True)
class ForgeNeoExtensionProfile:
    name: str
    display_name: str
    family: str
    support_level: str
    required_files: tuple[str, ...]
    extension_dirname: str | None = None
    adapter_scope: str = "profile-only"
    remote_url: str = ""
    repository_layout: str = "standalone"
    repository_subdir: str = ""
    source_branch: str = ""
    source_commit: str = ""
    source_commit_date: str = ""
    javascript_files: tuple[str, ...] = ()
    css_files: tuple[str, ...] = ()
    runtime_files: tuple[str, ...] = ()
    routes: tuple[str, ...] = ()
    source_routes: tuple[str, ...] = ()
    source_callbacks: tuple[str, ...] = ()
    notes: tuple[str, ...] = ()


TAGCOMPLETE_PROFILE = ForgeNeoExtensionProfile(
    name=TAGCOMPLETE_EXTENSION,
    display_name="TagComplete Neo",
    family="prompt-helper",
    support_level="first-batch",
    adapter_scope="prompt-resource",
    remote_url="https://github.com/eduardoabreu81/sd-webui-tagcomplete-neo.git",
    repository_layout="standalone",
    source_branch="main",
    source_commit="8e0d81fd",
    source_commit_date="2026-05-08 16:36:03 +0000",
    required_files=(
        "javascript/__globals.js",
        "javascript/_utils.js",
        "javascript/_textAreas.js",
        "javascript/tagAutocomplete.js",
        "tags/danbooru.csv",
    ),
    javascript_files=TAGCOMPLETE_JS_FILES,
    runtime_files=(
        "tmp/tagAutocompletePath.txt",
        "tmp/modelKeywordPath.txt",
        "tags/temp/emb.txt",
        "tags/temp/lora.txt",
        "tags/temp/lyco.txt",
        "tags/temp/wc.txt",
        "tags/temp/wce.txt",
        "tags/temp/wc_yaml.json",
    ),
    routes=(
        "/tacapi/v1/refresh-temp-files",
        "/tacapi/v1/refresh-embeddings",
        "/tacapi/v1/lora-info/{name}",
        "/tacapi/v1/wildcard-contents",
        "/tacapi/v1/get-use-count",
        "/tacapi/v1/get-use-count-list",
        "/tacapi/v1/get-all-use-counts",
    ),
    source_callbacks=("script_callbacks.on_ui_settings(on_ui_settings)",),
    notes=(
        "Uses Forge Neo DOM id bridge for txt2img/img2img prompts.",
        "Source extension registers Tag Autocomplete settings; Forge Neo exposes them in the native Settings page.",
        "Runtime files are created only when the extension is installed and enabled.",
    ),
)

PROMPT_ALL_IN_ONE_PROFILE = ForgeNeoExtensionProfile(
    name=PROMPT_ALL_IN_ONE_EXTENSION,
    display_name="Prompt All In One For Forge Neo",
    family="prompt-helper",
    support_level="first-batch",
    adapter_scope="prompt-resource",
    remote_url="https://github.com/abzaloff/sd-webui-prompt-all-in-one-forgeneo.git",
    repository_layout="standalone",
    source_branch="main",
    source_commit="da8342c",
    source_commit_date="2026-02-27 12:04:27 +0800",
    required_files=(
        "javascript/main.entry.js",
        "style.css",
        "i18n.json",
        "translate_apis.json",
        "group_tags/default.yaml",
        "scripts/physton_prompt/translate.py",
        "scripts/physton_prompt/translator/translators_translator.py",
        "scripts/physton_prompt/translators/server.py",
    ),
    javascript_files=("javascript/main.entry.js",),
    css_files=("style.css",),
    runtime_files=("storage",),
    routes=(
        "/physton_prompt/get_config",
        "/physton_prompt/token_counter",
        "/physton_prompt/get_data",
        "/physton_prompt/set_data",
        "/physton_prompt/get_histories",
        "/physton_prompt/get_favorites",
        "/physton_prompt/translate",
        "/physton_prompt/translates",
        "/physton_prompt/get_csvs",
        "/physton_prompt/styles",
        "/physton_prompt/get_group_tags",
    ),
    notes=(
        "Uses lightweight Forge Neo /physton_prompt API routes.",
        "Translation routes call the installed Prompt All In One translator backend.",
        "OpenAI generation and MBart50 remain disabled unless configured later.",
    ),
)

TIPO_PROFILE = ForgeNeoExtensionProfile(
    name=TIPO_EXTENSION,
    display_name="TIPO",
    family="prompt-helper",
    support_level="priority-profile",
    extension_dirname="z-tipo-extension",
    adapter_scope="alwayson-args",
    remote_url="https://github.com/KohakuBlueleaf/z-tipo-extension.git",
    repository_layout="standalone",
    source_branch="main",
    required_files=(
        "install.py",
        "scripts/tipo.py",
        "tipo_installer/__init__.py",
        "tipo_installer/scheme.py",
        "tipo_installer/hardware.py",
        "tipo_installer/pkg.py",
    ),
    source_callbacks=(
        "scripts.AlwaysVisible",
        "before_process",
        "process",
        "prompt_gen_only",
    ),
    notes=(
        "Forge Neo uses the installed source TIPOScript for generation-time prompt upsampling.",
        "The native Forge Neo prompt area supplies TIPO's alwayson arguments without loading the source WebUI UI.",
        "TIPO controls are created only when the z-tipo-extension profile is installed and enabled.",
    ),
)

DYNAMIC_PROMPTS_PROFILE = ForgeNeoExtensionProfile(
    name=DYNAMIC_PROMPTS_EXTENSION,
    display_name="Dynamic Prompts",
    family="prompt-helper",
    support_level="priority-profile",
    adapter_scope="alwayson-args",
    remote_url="https://github.com/akirau-ai/sd-dynamic-prompts",
    repository_layout="standalone",
    source_branch="main",
    required_files=(
        "scripts/dynamic_prompting.py",
        "sd_dynamic_prompts/dynamic_prompting.py",
        "sd_dynamic_prompts/generator_builder.py",
        "sd_dynamic_prompts/wildcards_tab.py",
        "sd_dynamic_prompts/settings.py",
        "javascript/dynamic_prompting.js",
        "style.css",
        "config/magicprompt_models.txt",
    ),
    javascript_files=("javascript/dynamic_prompting.js", "javascript/dynamic_prompting_hints.js"),
    css_files=("style.css",),
    runtime_files=("wildcards",),
    source_callbacks=(
        "scripts.AlwaysVisible",
        "process",
        "script_callbacks.on_ui_settings(on_ui_settings)",
        "script_callbacks.on_ui_tabs(on_ui_tabs)",
        "script_callbacks.on_before_image_saved(on_save)",
        "script_callbacks.on_infotext_pasted(on_infotext_pasted)",
    ),
    notes=(
        f"Forge Neo emits {DYNAMIC_PROMPTS_SCRIPT_BASE_NAME} alwayson args for source_backend requests.",
        "The source_backend adapter can expand common variant and wildcard syntax without installing the dynamicprompts package.",
        "Magic Prompt model generation remains available only when the source extension dependencies are installed.",
    ),
)

WD14_TAGGER_PROFILE = ForgeNeoExtensionProfile(
    name=WD14_TAGGER_EXTENSION,
    display_name="WD14 Tagger",
    family="image-interrogation",
    support_level="priority-profile",
    adapter_scope="api-adapter",
    remote_url="https://github.com/Akegarasu/sd-webui-wd14-tagger",
    repository_layout="standalone",
    source_branch="master",
    source_commit="711ba0a",
    source_commit_date="2024-10-24 15:06:11 +0800",
    required_files=(
        "scripts/tagger.py",
        "tagger/api.py",
        "tagger/api_models.py",
        "tagger/ui.py",
        "tagger/interrogator.py",
        "tagger/utils.py",
        "javascript/tagger.js",
        "style.css",
    ),
    javascript_files=("javascript/tagger.js",),
    css_files=("style.css",),
    routes=(
        "/tagger/v1/interrogate",
        "/tagger/v1/interrogators",
    ),
    source_routes=(
        "/tagger/v1/interrogate",
        "/tagger/v1/interrogators",
    ),
    source_callbacks=(
        "script_callbacks.on_app_started(on_app_started)",
        "script_callbacks.on_ui_tabs(on_ui_tabs)",
    ),
    notes=(
        "Source extension registers a standalone tagger tab and /tagger/v1 API.",
        "Forge Neo provides source-compatible /tagger/v1 API routes from local ONNX models.",
    ),
)

ADETAILER_PROFILE = ForgeNeoExtensionProfile(
    name=ADETAILER_EXTENSION,
    display_name="ADetailer Neo",
    family="generation-hook",
    support_level="priority-profile",
    extension_dirname=ADETAILER_EXTENSION_DIRNAME,
    adapter_scope="alwayson-args",
    remote_url="https://github.com/Haoming02/ADetailer-Neo",
    repository_layout="standalone",
    source_branch="main",
    required_files=(
        "scripts/adetailer.py",
        "lib_adetailer/__init__.py",
        "lib_adetailer/args.py",
        "lib_adetailer/ui.py",
        "lib_adetailer/controlnet.py",
        "lib_adetailer/mask.py",
        "lib_adetailer/opts.py",
        "lib_adetailer/detection/common.py",
        "lib_adetailer/detection/mediapipe.py",
        "lib_adetailer/detection/ultralytics.py",
        "preload.py",
    ),
    routes=(
        "/adetailer/v1/version",
        "/adetailer/v1/schema",
        "/adetailer/v1/ad_model",
    ),
    source_routes=(
        "/adetailer/v1/version",
        "/adetailer/v1/schema",
        "/adetailer/v1/ad_model",
    ),
    source_callbacks=(
        "scripts.AlwaysVisible",
        "process",
        "postprocess",
        "postprocess_image",
    ),
    notes=(
        "ADetailer Neo is the Forge Neo rewrite of ADetailer.",
        "Source extension is an always-visible generation script with process/postprocess hooks.",
        "Forge Neo emits ADetailer-Neo-compatible alwayson script args and lightweight /adetailer/v1 metadata routes.",
    ),
)

REGIONAL_PROMPTER_PROFILE = ForgeNeoExtensionProfile(
    name=REGIONAL_PROMPTER_EXTENSION,
    display_name="Regional Prompter",
    family="generation-hook",
    support_level="priority-profile",
    adapter_scope="alwayson-args",
    remote_url="https://github.com/CyrixJD115/sd-neo-regional-prompter",
    repository_layout="standalone",
    source_branch="main",
    source_commit="27ba390",
    source_commit_date="2026-06-02 18:12:17 -0700",
    required_files=(
        "scripts/rp.py",
        "scripts/rps.py",
        "scripts/attention.py",
        "scripts/latent.py",
        "scripts/regions.py",
        "javascript/inputAccordion-m.js",
        "style.css",
        "regional_prompter_presets.json",
    ),
    javascript_files=("javascript/inputAccordion-m.js",),
    css_files=("style.css",),
    routes=(
        "/regional-prompter/v1/schema",
        "/regional-prompter/v1/defaults",
    ),
    source_callbacks=(
        "scripts.AlwaysVisible",
        "process",
        "before_process_batch",
        "process_before_every_sampling",
        "before_hr",
        "process_batch",
        "postprocess",
        "script_callbacks.on_ui_settings(ext_on_ui_settings)",
        "script_callbacks.on_cfg_denoiser(denoiser_callback)",
        "script_callbacks.on_cfg_denoised(denoised_callback)",
    ),
    notes=(
        "Regional Prompter is an always-visible source generation script.",
        "Forge Neo emits source-compatible alwayson script args for Regional Prompter.",
        "The source backend imports rp.py only when the request asks for Regional Prompter.",
    ),
)

FORGE_COUPLE_PROFILE = ForgeNeoExtensionProfile(
    name=FORGE_COUPLE_EXTENSION,
    display_name="Forge Couple",
    family="generation-hook",
    support_level="priority-profile",
    adapter_scope="alwayson-args",
    remote_url="https://github.com/Haoming02/sd-forge-couple",
    repository_layout="standalone",
    source_branch="main",
    required_files=(
        "scripts/forge_couple.py",
        "lib_couple/attention_couple.py",
        "lib_couple/attention_masks.py",
        "lib_couple/mapping.py",
        "lib_couple/settings.py",
        "lib_couple/tile_funcs.py",
        "lib_couple/ui.py",
        "lib_couple/ui_masks.py",
        "javascript/couple.js",
        "style.css",
    ),
    javascript_files=(
        "javascript/background_loader.js",
        "javascript/bbox.js",
        "javascript/couple.js",
        "javascript/dataframe.js",
        "javascript/edit_timer.js",
        "javascript/mask.js",
    ),
    css_files=("style.css",),
    routes=(
        "/forge-couple/v1/schema",
        "/forge-couple/v1/defaults",
    ),
    source_callbacks=(
        "scripts.AlwaysVisible",
        "setup",
        "before_process",
        "after_extra_networks_activate",
        "before_process_batch",
        "process_before_every_sampling",
        "before_hr",
        "script_callbacks.on_ui_settings(fc_settings)",
    ),
    notes=(
        "Forge Couple is an always-visible source generation script.",
        "Forge Neo provides a native Gradio 6 UI for Basic, Advanced, Mask, Common Prompts, and img2img Tile settings.",
        "Forge Neo mirrors the source extension's four options in a native Forge Couple Settings page.",
        "The source backend imports forge_couple.py only when the request asks for Forge Couple.",
        "The source extension JavaScript and CSS are catalogued but not loaded into the native Forge Neo UI.",
    ),
)

INFINITE_BROWSING_PROFILE = ForgeNeoExtensionProfile(
    name=INFINITE_BROWSING_EXTENSION,
    display_name="Infinite Browsing",
    family="image-browser",
    support_level="priority-profile",
    adapter_scope="ui-route",
    remote_url="https://github.com/laptise/infinite-browsing.git",
    repository_layout="standalone",
    source_branch="main",
    source_commit="fc3dcb5",
    source_commit_date="2024-05-21 07:59:44 +0800",
    required_files=(
        "app.py",
        "scripts/iib_setup.py",
        "scripts/iib/api.py",
        "scripts/iib/tool.py",
        "scripts/iib/db/datamodel.py",
        "scripts/iib/db/update_image_data.py",
        "vue/dist/index.html",
        "vue/dist/assets/index-4577cc7c.js",
        "vue/dist/assets/index-f6de8b10.css",
    ),
    routes=(
        INFINITE_BROWSING_BASE,
        f"{INFINITE_BROWSING_BASE}/hello",
        f"{INFINITE_BROWSING_BASE}/global_setting",
        f"{INFINITE_BROWSING_BASE}/files",
        f"{INFINITE_BROWSING_BASE}/file",
        f"{INFINITE_BROWSING_BASE}/image-thumbnail",
        f"{INFINITE_BROWSING_BASE}/fe-static/{{file_path:path}}",
        f"{INFINITE_BROWSING_BASE}/db/basic_info",
        f"{INFINITE_BROWSING_BASE}/db/rebuild_index",
    ),
    source_routes=(
        INFINITE_BROWSING_BASE,
        f"{INFINITE_BROWSING_BASE}/hello",
        f"{INFINITE_BROWSING_BASE}/global_setting",
        f"{INFINITE_BROWSING_BASE}/fe-static/{{file_path:path}}",
    ),
    source_callbacks=(
        "script_callbacks.on_ui_tabs(on_ui_tabs)",
        "script_callbacks.on_app_started(on_app_started)",
    ),
    notes=(
        "Source extension registers a Gradio iframe tab and FastAPI routes under /infinite_image_browsing.",
        "Forge Neo mounts the source FastAPI app and exposes it as a top-level iframe tab.",
        "The legacy WebUI DOM injector is not loaded into the Gradio 6 page.",
    ),
)

AUTO_PHOTOSHOP_PROFILE = ForgeNeoExtensionProfile(
    name=AUTO_PHOTOSHOP_EXTENSION,
    display_name="Auto Photoshop StableDiffusion Plugin",
    family="external-client",
    support_level="runtime-adapter",
    adapter_scope="api-route",
    remote_url="https://github.com/AbdullahAlfaraj/Auto-Photoshop-StableDiffusion-Plugin.git",
    repository_layout="standalone",
    source_branch="master",
    source_commit="6f6d490",
    source_commit_date="2023-12-09 16:58:35 +0300",
    required_files=(
        "manifest.json",
        "index.html",
        "index.js",
        "psapi.js",
        "sdapi_py_re.js",
        "scripts/main.py",
        "server/python_server/serverMain.py",
        "server/python_server/img2imgapi.py",
    ),
    routes=(
        AUTO_PHOTOSHOP_BASE,
        f"{AUTO_PHOTOSHOP_BASE}/version",
        f"{AUTO_PHOTOSHOP_BASE}/heartbeat",
        f"{AUTO_PHOTOSHOP_BASE}/sdapi/v1/{{path:path}}",
        f"{AUTO_PHOTOSHOP_BASE}/txt2img/",
        f"{AUTO_PHOTOSHOP_BASE}/img2img/",
        f"{AUTO_PHOTOSHOP_BASE}/save/png/",
        f"{AUTO_PHOTOSHOP_BASE}/prompt_shortcut/load",
        f"{AUTO_PHOTOSHOP_BASE}/prompt_shortcut/save",
        "/forge-neo/extensions/auto-photoshop-status",
    ),
    source_routes=(
        AUTO_PHOTOSHOP_BASE,
        f"{AUTO_PHOTOSHOP_BASE}/version",
        f"{AUTO_PHOTOSHOP_BASE}/heartbeat",
        f"{AUTO_PHOTOSHOP_BASE}/sdapi/v1/{{path:path}}",
        f"{AUTO_PHOTOSHOP_BASE}/txt2img/",
        f"{AUTO_PHOTOSHOP_BASE}/img2img/",
        f"{AUTO_PHOTOSHOP_BASE}/save/png/",
        f"{AUTO_PHOTOSHOP_BASE}/prompt_shortcut/load",
        f"{AUTO_PHOTOSHOP_BASE}/prompt_shortcut/save",
    ),
    source_callbacks=("script_callbacks.on_app_started(on_app_started)",),
    notes=(
        "Photoshop UXP client plus a source WebUI FastAPI bridge.",
        "Forge Neo exposes a source-compatible API bridge under /sdapi/auto-photoshop-sd.",
        "Image cache files stay under the installed extension server/python_server directory.",
    ),
)

AESTHETIC_ENHANCEMENT_PROFILE = ForgeNeoExtensionProfile(
    name=AESTHETIC_ENHANCEMENT_EXTENSION,
    display_name="Aesthetic Enhancement",
    family="analysis-ui",
    support_level="runtime-adapter",
    adapter_scope="ui-tab",
    remote_url="https://github.com/exo101/sd-webui-AestheticEnhancement.git",
    repository_layout="standalone",
    source_branch="main",
    source_commit="eeced55",
    source_commit_date="2026-04-11 12:11:10 +0800",
    required_files=(
        "scripts/main.py",
        "scripts/qwen_analysis_ui.py",
        "Aesthetic-Enhancement",
        "README.md",
    ),
    runtime_files=("forge_neo/aesthetic_enhancement.py",),
    routes=("/forge-neo/extensions/aesthetic-enhancement-status",),
    source_callbacks=(
        "script_callbacks.on_ui_tabs(MultiModal_tab)",
        "script_callbacks.on_app_started(on_app_started)",
    ),
    notes=(
        "Source extension provides an independent multimodal/aesthetic analysis tab.",
        "Forge Neo exposes a Gradio 6 tab for the bundled artist, composition and lighting reference assets.",
        "Forge Neo also exposes the source Qwen analysis workflow through native Gradio 6 controls.",
    ),
)

ASPECT_RATIO_HELPER_PROFILE = ForgeNeoExtensionProfile(
    name=ASPECT_RATIO_HELPER_EXTENSION,
    display_name="Aspect Ratio Helper",
    family="ui-helper",
    support_level="runtime-adapter",
    adapter_scope="ui-helper",
    remote_url="https://github.com/thomasasfk/sd-webui-aspect-ratio-helper.git",
    repository_layout="standalone",
    source_branch="main",
    source_commit="0909671",
    source_commit_date="2025-02-20 15:03:31 +0000",
    required_files=(
        "scripts/sd_webui_aspect_ratio_helper.py",
        "aspect_ratio_helper",
        "javascript/aspectRatioController.js",
        "style.css",
    ),
    javascript_files=("javascript/aspectRatioController.js",),
    css_files=("style.css",),
    runtime_files=(
        "javascript/forge_neo_aspect_ratio_helper.js",
        "css/forge_neo_aspect_ratio_helper.css",
    ),
    routes=(
        "/forge-neo/extensions/aspect-ratio-helper-status",
        "/forge-neo/extensions/aspect-ratio-helper-config",
    ),
    notes=(
        "Source extension injects aspect-ratio helper UI and JavaScript.",
        "Forge Neo uses a dedicated Gradio 6 JavaScript adapter for forge_neo_width and forge_neo_img2img_width.",
    ),
)

CAMERA_ANGLE_SELECTOR_PROFILE = ForgeNeoExtensionProfile(
    name=CAMERA_ANGLE_SELECTOR_EXTENSION,
    display_name="Camera Angle Selector",
    family="prompt-helper",
    support_level="runtime-adapter",
    adapter_scope="ui-tab",
    remote_url="https://github.com/exo101/sd-webui-camera-angle-selector.git",
    repository_layout="standalone",
    source_branch="main",
    source_commit="726347a",
    source_commit_date="2026-03-28 04:27:03 +0800",
    required_files=(
        "scripts/camera_angle_selector.py",
        "scripts/camera_3d_view.html",
        "README.md",
    ),
    runtime_files=(
        "javascript/forge_neo_camera_angle_selector.js",
        "css/forge_neo_camera_angle_selector.css",
    ),
    routes=(
        CAMERA_ANGLE_SELECTOR_BASE,
        f"{CAMERA_ANGLE_SELECTOR_BASE}/view",
        "/forge-neo/extensions/camera-angle-selector-status",
        "/forge-neo/extensions/camera-angle-selector-config",
    ),
    source_callbacks=("script_callbacks.on_ui_tabs(create_angle_selector_ui)",),
    notes=(
        "Source extension provides an independent camera-angle selection tab.",
        "Forge Neo exposes the source camera_3d_view.html in a Gradio 6 iframe tab and applies prompts to Forge Neo prompt textareas.",
    ),
)

CIVITAI_HELPER_PROFILE = ForgeNeoExtensionProfile(
    name=CIVITAI_HELPER_EXTENSION,
    display_name="Civitai Helper",
    family="model-metadata",
    support_level="runtime-adapter",
    adapter_scope="ui-tab",
    remote_url="https://github.com/zixaphir/Stable-Diffusion-Webui-Civitai-Helper.git",
    repository_layout="standalone",
    source_branch="main",
    required_files=(
        "scripts/civitai_helper.py",
        "scripts/image_metadata.py",
        "ch_lib/civitai.py",
        "ch_lib/downloader.py",
        "ch_lib/js_action_civitai.py",
        "ch_lib/model.py",
        "ch_lib/model_action_civitai.py",
        "ch_lib/sections.py",
        "browser/browser.py",
        "browser/supported_models.py",
        "browser/templates/container.html",
        "javascript/civitai_helper.js",
        "style.css",
    ),
    javascript_files=("javascript/civitai_helper.js",),
    css_files=("style.css",),
    routes=("/forge-neo/extensions/civitai-helper-status",),
    source_callbacks=(
        "script_callbacks.on_ui_settings(on_ui_settings)",
        "script_callbacks.on_ui_tabs(on_ui_tabs)",
        "script_callbacks.on_before_image_saved(add_resource_metadata)",
    ),
    notes=(
        "Source extension provides Civitai scan, metadata, download and browser tabs.",
        "Forge Neo keeps the source Gradio UI and adapts model paths plus Extra Networks card buttons for Gradio 6.",
    ),
)

MULTIMODAL_MEDIA_PROFILE = ForgeNeoExtensionProfile(
    name=MULTIMODAL_MEDIA_EXTENSION,
    display_name="Multimodal Media",
    family="multimodal-tools",
    support_level="runtime-adapter",
    adapter_scope="ui-tab",
    remote_url="https://github.com/exo101/sd-webui-multimodal-media.git",
    repository_layout="standalone",
    source_branch="main",
    source_commit="ccb3186",
    source_commit_date="2026-03-22 04:03:18 +0800",
    required_files=(
        "extension.py",
        "scripts/multimodal_media_main.py",
        "scripts/video_frame_extractor.py",
        "scripts/qwen3_tts_ui.py",
        "scripts/qwen_video/main_ui.py",
        "scripts/qwen_video/api_handler.py",
        "scripts/latent_sync_ui.py",
        "LatentSync",
        "scripts/ace_step_ui.py",
        "ACE-Step-1.5",
        "scripts/indextts_ui.py",
        "index-tts",
    ),
    source_callbacks=(
        "script_callbacks.on_ui_tabs(multimodal_media_tab)",
        "on_app_started",
    ),
    runtime_files=("forge_neo/multimodal_media.py",),
    routes=("/forge-neo/extensions/multimodal-media-status",),
    notes=(
        "Source extension provides media extraction, Qwen video, TTS, ACE-Step and LatentSync UI tabs.",
        "Forge Neo exposes video frame extraction in a Gradio 6 tab and reports heavy audio/video dependency status without running the source installer.",
        "Forge Neo exposes Qwen3-TTS speech generation as a native Gradio 6 subtab and loads the source model code only when users generate audio.",
        "Forge Neo exposes Qwen Video generation and task query as a native Gradio 6 subtab using the source DashScope API modules.",
        "Forge Neo exposes LatentSync video/audio lip-sync generation as a native Gradio 6 subtab and loads the source inference module only when users run a task.",
        "Forge Neo exposes ACE-Step music generation and reference-audio analysis as a native Gradio 6 subtab and loads the source model code only when users run a task.",
        "Forge Neo exposes IndexTTS-2 speech generation and emotion controls as a native Gradio 6 subtab and loads the source model code only when users generate audio.",
    ),
)

QWEN_VISION_CHAT_PROFILE = ForgeNeoExtensionProfile(
    name=QWEN_VISION_CHAT_EXTENSION,
    display_name="Qwen Vision Chat",
    family="vision-chat",
    support_level="runtime-adapter",
    adapter_scope="ui-tab",
    remote_url="https://github.com/exo101/sd-webui-qwen-vision-chat.git",
    repository_layout="standalone",
    source_branch="main",
    source_commit="db26bbc",
    source_commit_date="2026-04-10 19:34:17 +0800",
    required_files=(
        "scripts/sd_qwen_vision_chat.py",
        "scripts/quick_description.py",
        "scripts/image_management.py",
        "scripts/prompt_templates.py",
        "scripts/tag_management.py",
        "ollama/ollama_api.py",
    ),
    source_callbacks=(
        "script_callbacks.on_ui_tabs(vision_chat_tab)",
        "script_callbacks.on_app_started(on_app_started)",
    ),
    runtime_files=("forge_neo/qwen_vision_chat.py",),
    routes=("/forge-neo/extensions/qwen-vision-chat-status",),
    notes=(
        "Source extension provides an Ollama-backed Qwen vision chat tab.",
        "Forge Neo exposes a Gradio 6 tab that calls the same local Ollama /api/chat endpoint without importing the classic WebUI tab.",
    ),
)

SAM_MATTING_PROFILE = ForgeNeoExtensionProfile(
    name=SAM_MATTING_EXTENSION,
    display_name="SAM Matting",
    family="segmentation",
    support_level="runtime-adapter",
    adapter_scope="ui-tab",
    remote_url="https://github.com/exo101/sd-webui-sam-matting.git",
    repository_layout="standalone",
    source_branch="main",
    source_commit="b1e8e09",
    source_commit_date="2026-04-10 19:28:06 +0800",
    required_files=(
        "scripts/sd_segment_anything.py",
        "scripts/segment_anything_ui.py",
        "scripts/image_matting.py",
        "scripts/cleaner_ui.py",
        "install_dependencies.py",
    ),
    source_callbacks=(
        "script_callbacks.on_ui_tabs(segmentation_tab)",
        "script_callbacks.on_app_started(on_app_started)",
    ),
    runtime_files=("forge_neo/sam_matting.py",),
    routes=("/forge-neo/extensions/sam-matting-status",),
    notes=(
        "Source extension provides SAM segmentation, matting and cleaner tabs.",
        "Forge Neo exposes a dedicated Gradio 6 tab and loads rembg, segment_anything or litelama only when users run a task.",
        "Forge Neo exposes source point segmentation through Gradio image select events.",
    ),
)

SEE_THROUGH_PROFILE = ForgeNeoExtensionProfile(
    name=SEE_THROUGH_EXTENSION,
    display_name="See-Through Layer Decomposition",
    family="layer-decomposition",
    support_level="runtime-adapter",
    adapter_scope="ui-tab",
    remote_url="https://github.com/shitagaki-lab/see-through",
    repository_layout="bundled-upstream",
    required_files=(
        "scripts/see_through.py",
        "see-through",
        "requirements.txt",
        "requirements-inference-bnb.txt",
        "README.md",
    ),
    source_callbacks=(
        "scripts.AlwaysVisible",
        "script_callbacks.on_ui_settings(on_ui_settings)",
        "script_callbacks.on_app_started(on_app_started)",
    ),
    runtime_files=("forge_neo/see_through.py",),
    routes=("/forge-neo/extensions/see-through-status",),
    notes=(
        "Local wrapper is not a standalone git checkout; remote URL points to the upstream research project.",
        "Forge Neo exposes a dedicated Gradio 6 tab that calls the installed see-through inference script on demand.",
    ),
)

STORYBOARD_ASSISTANT_PROFILE = ForgeNeoExtensionProfile(
    name=STORYBOARD_ASSISTANT_EXTENSION,
    display_name="Storyboard Assistant",
    family="storyboard",
    support_level="runtime-adapter",
    adapter_scope="ui-tab",
    remote_url="https://github.com/exo101/sd-webui-Storyboard-Assistant.git",
    repository_layout="standalone",
    source_branch="main",
    source_commit="795e83d",
    source_commit_date="2026-03-29 19:48:27 +0800",
    required_files=(
        "scripts/sd_MultiModal.py",
        "scripts/storyboard_assistant.py",
        "scripts/announcement.py",
        "javascript/storyboard.js",
        "scripts/storyboard_data/storyboard.json",
        "scripts/storyboard_data/script.json",
    ),
    javascript_files=("javascript/storyboard.js",),
    runtime_files=("forge_neo/storyboard.py",),
    routes=("/forge-neo/extensions/storyboard-assistant-status",),
    source_callbacks=("script_callbacks.on_ui_tabs(storyboard_tab)",),
    notes=(
        "Source extension provides storyboard planning and media helper tabs.",
        "Forge Neo exposes its native storyboard wall as a top-level Gradio 6 tab when this extension profile is installed.",
    ),
)

TRELLIS2_PROFILE = ForgeNeoExtensionProfile(
    name=TRELLIS2_EXTENSION,
    display_name="TRELLIS.2",
    family="3d-generation",
    support_level="runtime-adapter",
    adapter_scope="ui-tab",
    remote_url="https://github.com/microsoft/TRELLIS.2",
    repository_layout="bundled-upstream",
    required_files=(
        "extension.json",
        "scripts/trellis2_script.py",
        "TRELLIS.2",
        "download_model.py",
        "check_env.py",
    ),
    source_callbacks=(
        "scripts.Script",
        "script_callbacks.on_ui_tabs(on_ui_tabs)",
    ),
    runtime_files=("forge_neo/trellis2.py",),
    routes=("/forge-neo/extensions/trellis2-status",),
    notes=(
        "Local wrapper is not a standalone git checkout; remote URL points to the TRELLIS.2 upstream project.",
        "Forge Neo exposes a Gradio 6 tab that imports the source script only when users start a TRELLIS.2 generation.",
    ),
)

STYLE_ORGANIZER_PROFILE = ForgeNeoExtensionProfile(
    name=STYLE_ORGANIZER_EXTENSION,
    display_name="Style Grid",
    family="prompt-style",
    support_level="runtime-adapter",
    adapter_scope="prompt-style",
    remote_url="https://github.com/KazeKaze93/sd-webui-style-organizer.git",
    repository_layout="standalone",
    source_branch="master",
    source_commit="5ff9f40",
    source_commit_date="2026-05-05 22:45:28 +0400",
    required_files=(
        "scripts/style_grid.py",
        "stylegrid/config.py",
        "stylegrid/csv_io.py",
        "stylegrid/routes.py",
        "stylegrid/wildcards.py",
        "javascript/sg_prompt_utils.js",
        "javascript/style_grid.js",
        "style.css",
        "ui/dist/index.html",
    ),
    javascript_files=(
        "javascript/sg_prompt_utils.js",
        "javascript/style_grid.js",
    ),
    css_files=("style.css",),
    runtime_files=(
        "forge_neo/style_grid.py",
        "data",
        "styles",
        "samples",
    ),
    routes=(
        "/style_grid/styles",
        "/style_grid/reload",
        "/style_grid/check_update",
        "/style_grid/conflicts",
        "/style_grid/export",
        "/style_grid/import",
        "/style_grid/category_order/save",
        "/style_grid/presets",
        "/style_grid/presets/save",
        "/style_grid/presets/delete",
        "/style_grid/presets/list",
        "/style_grid/usage",
        "/style_grid/usage/increment",
        "/style_grid/style/save",
        "/style_grid/style/delete",
        "/style_grid/backup",
        "/style_grid/thumbnails/list",
        "/style_grid/thumbnail",
        "/style_grid/thumbnail/upload",
        "/style_grid/thumbnail/gen_status",
        "/style_grid/thumbnail/generate",
        "/style_grid/thumbnails/cleanup",
        "/style_grid/ui",
        "/forge-neo/extensions/style-grid-status",
    ),
    source_routes=(
        "/style_grid/styles",
        "/style_grid/reload",
        "/style_grid/check_update",
        "/style_grid/conflicts",
        "/style_grid/export",
        "/style_grid/import",
        "/style_grid/category_order/save",
        "/style_grid/presets",
        "/style_grid/presets/save",
        "/style_grid/presets/delete",
        "/style_grid/presets/list",
        "/style_grid/usage",
        "/style_grid/usage/increment",
        "/style_grid/style/save",
        "/style_grid/style/delete",
        "/style_grid/backup",
        "/style_grid/thumbnails/list",
        "/style_grid/thumbnail",
        "/style_grid/thumbnail/upload",
        "/style_grid/thumbnail/gen_status",
        "/style_grid/thumbnail/generate",
        "/style_grid/thumbnails/cleanup",
        "/style_grid/ui",
    ),
    source_callbacks=(
        "scripts.AlwaysVisible",
        "script_callbacks.on_app_started(register_api)",
        "StyleGridScript.process",
    ),
    notes=(
        "Forge Neo serves the Style Grid API routes locally because the source package imports WebUI modules at import time.",
        "Source JavaScript, CSS and React UI assets remain loaded from the installed extension directory.",
    ),
)

PROMPT_EXTENSION_PROFILES = (TAGCOMPLETE_PROFILE, PROMPT_ALL_IN_ONE_PROFILE)
API_ROUTE_EXTENSION_PROFILE_OBJECTS = (AUTO_PHOTOSHOP_PROFILE,)
UI_HELPER_EXTENSION_PROFILE_OBJECTS = (ASPECT_RATIO_HELPER_PROFILE,)
UI_TAB_EXTENSION_PROFILE_OBJECTS = (
    CIVITAI_HELPER_PROFILE,
    CAMERA_ANGLE_SELECTOR_PROFILE,
    STORYBOARD_ASSISTANT_PROFILE,
    AESTHETIC_ENHANCEMENT_PROFILE,
    MULTIMODAL_MEDIA_PROFILE,
    QWEN_VISION_CHAT_PROFILE,
    SAM_MATTING_PROFILE,
    SEE_THROUGH_PROFILE,
    TRELLIS2_PROFILE,
)
PROMPT_STYLE_EXTENSION_PROFILE_OBJECTS = (STYLE_ORGANIZER_PROFILE,)
PROFILE_ONLY_EXTENSION_PROFILE_OBJECTS: tuple[ForgeNeoExtensionProfile, ...] = ()
EXTENSION_PROFILES = (
    *PROMPT_EXTENSION_PROFILES,
    TIPO_PROFILE,
    DYNAMIC_PROMPTS_PROFILE,
    WD14_TAGGER_PROFILE,
    ADETAILER_PROFILE,
    REGIONAL_PROMPTER_PROFILE,
    FORGE_COUPLE_PROFILE,
    INFINITE_BROWSING_PROFILE,
    *API_ROUTE_EXTENSION_PROFILE_OBJECTS,
    *UI_HELPER_EXTENSION_PROFILE_OBJECTS,
    *UI_TAB_EXTENSION_PROFILE_OBJECTS,
    *PROMPT_STYLE_EXTENSION_PROFILE_OBJECTS,
    *PROFILE_ONLY_EXTENSION_PROFILE_OBJECTS,
)
SUPPORTED_EXTENSION_PROFILES = tuple(profile.name for profile in EXTENSION_PROFILES)
PROMPT_EXTENSION_PROFILE_BY_NAME = {profile.name: profile for profile in PROMPT_EXTENSION_PROFILES}
EXTENSION_PROFILE_BY_NAME = {profile.name: profile for profile in EXTENSION_PROFILES}
EXCLUDED_EXTENSION_PROFILES: dict[str, str] = {
    AUTO_COMPLETE_EXTENSION: "Excluded by user request; do not load auto complete.",
}


def extension_backend_root() -> Path:
    return WEBUI_ROOT


def extension_allowed_paths() -> list[str]:
    return [str(USER_EXTENSIONS_DIR), str(BUILTIN_EXTENSIONS_DIR), str(ROOT / "tmp")]


def extension_reference_sample_roots() -> list[str]:
    values: list[str] = []
    env_roots = os.environ.get("FORGE_NEO_EXTENSION_SAMPLE_ROOTS")
    if env_roots:
        values.extend(item for item in env_roots.split(os.pathsep) if item.strip())
    values.extend(
        [
            str(ROOT.parent / "sd-webui-forge-neo-v3" / "webui" / "extensions"),
            str(ROOT.parent / "sd-webui-forge-neo-v3" / "extensions"),
        ]
    )
    roots: list[str] = []
    seen: set[str] = set()
    user_key = os.path.normcase(str(USER_EXTENSIONS_DIR.resolve()))
    for value in values:
        path = Path(value).expanduser()
        if not path.is_dir():
            continue
        try:
            resolved = path.resolve()
        except OSError:
            continue
        key = os.path.normcase(str(resolved))
        if key == user_key or key in seen:
            continue
        seen.add(key)
        roots.append(str(resolved))
    return roots


def extension_reference_sample_names() -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for root_text in extension_reference_sample_roots():
        root = Path(root_text)
        for item in sorted(root.iterdir(), key=lambda value: value.name.lower()):
            key = item.name.lower()
            if item.is_dir() and not item.name.startswith(".") and key not in seen:
                seen.add(key)
                names.append(item.name)
    return names


def _reference_sample_dir(name: str) -> Path | None:
    profile = EXTENSION_PROFILE_BY_NAME.get(name)
    candidates = [name]
    if profile is not None and profile.extension_dirname:
        candidates.insert(0, profile.extension_dirname)
    for root_text in extension_reference_sample_roots():
        for dirname in candidates:
            candidate = Path(root_text) / dirname
            if candidate.is_dir():
                return candidate
    return None


def _extension_dir(name: str) -> Path:
    profile = EXTENSION_PROFILE_BY_NAME.get(name)
    dirname = profile.extension_dirname if profile is not None and profile.extension_dirname else name
    return USER_EXTENSIONS_DIR / dirname


def _extension_exists(name: str) -> bool:
    return _extension_dir(name).is_dir()


def _missing_required_files(base: Path, required_files: tuple[str, ...]) -> list[str]:
    missing: list[str] = []
    for rel in required_files:
        if not (base / rel).exists():
            missing.append(rel)
    return missing


def _extension_profile_ready(name: str) -> bool:
    profile = EXTENSION_PROFILE_BY_NAME.get(name)
    if profile is None:
        return False
    path = _extension_dir(name)
    return path.is_dir() and not _missing_required_files(path, profile.required_files)


def extension_profile_available(name: str) -> bool:
    return _extension_enabled(name) and _extension_profile_ready(name)


def builtin_extension_available(name: str, required_files: tuple[str, ...] = ()) -> bool:
    path = BUILTIN_EXTENSIONS_DIR / name
    if not path.is_dir() or _missing_required_files(path, required_files):
        return False
    try:
        from forge_neo.extensions import _extension_runtime_options

        disabled, disable_all = _extension_runtime_options()
    except Exception:
        disabled, disable_all = set(), "none"
    if str(disable_all).lower() == "all":
        return False
    return name.lower() not in {str(item).lower() for item in disabled}


def _extension_enabled(name: str) -> bool:
    if not _extension_exists(name):
        return False
    try:
        from forge_neo.extensions import _extension_runtime_options

        disabled, disable_all = _extension_runtime_options()
    except Exception:
        disabled, disable_all = set(), "none"
    lower_disabled = {str(item).lower() for item in disabled}
    if str(disable_all).lower() in {"all", "extra"}:
        return False
    return name.lower() not in lower_disabled


def active_prompt_extension_names() -> list[str]:
    return [name for name in SUPPORTED_PROMPT_EXTENSIONS if extension_profile_available(name)]


def active_adapter_extension_names() -> list[str]:
    adapter_scopes = {"api-adapter", "api-route", "alwayson-args", "ui-helper", "ui-route", "prompt-style"}
    return [
        profile.name
        for profile in EXTENSION_PROFILES
        if (profile.adapter_scope in adapter_scopes or profile.name in UI_TAB_EXTENSION_PROFILES)
        and extension_profile_available(profile.name)
    ]


def extension_profile_statuses() -> list[dict[str, Any]]:
    active = set(active_prompt_extension_names())
    active_adapters = set(active_adapter_extension_names())
    active_all = active | active_adapters
    rows: list[dict[str, Any]] = []
    for profile in EXTENSION_PROFILES:
        install_dir = _extension_dir(profile.name)
        sample_dir = _reference_sample_dir(profile.name)
        installed = install_dir.is_dir()
        enabled = _extension_enabled(profile.name) if installed else False
        sample_available = sample_dir is not None
        missing_installed = _missing_required_files(install_dir, profile.required_files) if installed else list(profile.required_files)
        missing_sample = _missing_required_files(sample_dir, profile.required_files) if sample_dir is not None else list(profile.required_files)
        if profile.name in active:
            state = "active"
        elif profile.name in active_adapters:
            state = "active-adapter"
        elif installed and missing_installed:
            state = "installed-incomplete"
        elif installed and not enabled:
            state = "installed-disabled"
        elif installed:
            state = "installed-profile-only"
        elif sample_available:
            state = "sample-only"
        else:
            state = "not-installed"
        rows.append(
            {
                "name": profile.name,
                "display_name": profile.display_name,
                "family": profile.family,
                "support_level": profile.support_level,
                "extension_dirname": profile.extension_dirname or profile.name,
                "adapter_scope": profile.adapter_scope,
                "remote_url": profile.remote_url,
                "repository_layout": profile.repository_layout,
                "repository_subdir": profile.repository_subdir,
                "source_branch": profile.source_branch,
                "source_commit": profile.source_commit,
                "source_commit_date": profile.source_commit_date,
                "state": state,
                "installed": installed,
                "enabled": enabled,
                "active": profile.name in active_all,
                "install_dir": str(install_dir),
                "sample_available": sample_available,
                "sample_dir": str(sample_dir or ""),
                "missing_required_files": missing_installed,
                "missing_sample_files": missing_sample,
                "required_files": list(profile.required_files),
                "javascript_files": list(profile.javascript_files),
                "css_files": list(profile.css_files),
                "runtime_files": list(profile.runtime_files),
                "routes": list(profile.routes),
                "source_routes": list(profile.source_routes),
                "source_callbacks": list(profile.source_callbacks),
                "notes": list(profile.notes),
            }
        )
    return rows


def prepare_extension_runtime_files() -> None:
    if _extension_enabled(TAGCOMPLETE_EXTENSION):
        tags_dir = _extension_dir(TAGCOMPLETE_EXTENSION) / "tags"
        temp_dir = tags_dir / "temp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        for filename, default_text in TAGCOMPLETE_EMPTY_TEMP_FILES.items():
            path = temp_dir / filename
            if not path.exists():
                path.write_text(default_text, encoding="utf-8")
        tmp_dir = ROOT / "tmp"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        (tmp_dir / "tagAutocompletePath.txt").write_text(tags_dir.as_posix(), encoding="utf-8")
        (tmp_dir / "modelKeywordPath.txt").write_text(",", encoding="utf-8")
    if _extension_enabled(PROMPT_ALL_IN_ONE_EXTENSION):
        (_extension_dir(PROMPT_ALL_IN_ONE_EXTENSION) / "storage").mkdir(parents=True, exist_ok=True)
    if _extension_enabled(STYLE_ORGANIZER_EXTENSION):
        from forge_neo.style_grid import prepare_style_grid_runtime_files

        prepare_style_grid_runtime_files()


def _relative_asset(path: Path) -> str | None:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return None


def extension_javascript_paths() -> list[str]:
    active = active_prompt_extension_names()
    active_adapters = set(active_adapter_extension_names())
    paths: list[Path] = []
    if active or STYLE_ORGANIZER_EXTENSION in active_adapters or CIVITAI_HELPER_EXTENSION in active_adapters:
        paths.append(BRIDGE_JS)
    if TAGCOMPLETE_EXTENSION in active:
        ext_dir = _extension_dir(TAGCOMPLETE_EXTENSION)
        paths.extend(ext_dir / rel for rel in TAGCOMPLETE_JS_FILES)
    if PROMPT_ALL_IN_ONE_EXTENSION in active:
        paths.append(_extension_dir(PROMPT_ALL_IN_ONE_EXTENSION) / "javascript" / "main.entry.js")
    if DYNAMIC_PROMPTS_EXTENSION in active_adapters:
        ext_dir = _extension_dir(DYNAMIC_PROMPTS_EXTENSION)
        paths.append(DYNAMIC_PROMPTS_JS)
        paths.append(ext_dir / "javascript" / "dynamic_prompting.js")
        paths.append(ext_dir / "javascript" / "dynamic_prompting_hints.js")
    if ASPECT_RATIO_HELPER_EXTENSION in active_adapters:
        paths.append(ASPECT_RATIO_HELPER_JS)
    if CAMERA_ANGLE_SELECTOR_EXTENSION in active_adapters:
        paths.append(CAMERA_ANGLE_SELECTOR_JS)
    if CIVITAI_HELPER_EXTENSION in active_adapters:
        paths.append(_extension_dir(CIVITAI_HELPER_EXTENSION) / "javascript" / "civitai_helper.js")
    if STYLE_ORGANIZER_EXTENSION in active_adapters:
        ext_dir = _extension_dir(STYLE_ORGANIZER_EXTENSION)
        paths.append(ext_dir / "javascript" / "sg_prompt_utils.js")
        paths.append(ext_dir / "javascript" / "style_grid.js")
    return [rel for path in paths if path.exists() for rel in [_relative_asset(path)] if rel]


def extension_css_paths() -> list[str]:
    active = active_prompt_extension_names()
    active_adapters = set(active_adapter_extension_names())
    paths: list[Path] = []
    if active or STYLE_ORGANIZER_EXTENSION in active_adapters or CIVITAI_HELPER_EXTENSION in active_adapters:
        paths.append(BRIDGE_CSS)
    if PROMPT_ALL_IN_ONE_EXTENSION in active:
        paths.append(_extension_dir(PROMPT_ALL_IN_ONE_EXTENSION) / "style.css")
    if DYNAMIC_PROMPTS_EXTENSION in active_adapters:
        paths.append(_extension_dir(DYNAMIC_PROMPTS_EXTENSION) / "style.css")
    if ASPECT_RATIO_HELPER_EXTENSION in active_adapters:
        paths.append(ASPECT_RATIO_HELPER_CSS)
    if CAMERA_ANGLE_SELECTOR_EXTENSION in active_adapters:
        paths.append(CAMERA_ANGLE_SELECTOR_CSS)
    if CIVITAI_HELPER_EXTENSION in active_adapters:
        paths.append(_extension_dir(CIVITAI_HELPER_EXTENSION) / "style.css")
    if STYLE_ORGANIZER_EXTENSION in active_adapters:
        paths.append(_extension_dir(STYLE_ORGANIZER_EXTENSION) / "style.css")
    return [rel for path in paths if path.exists() for rel in [_relative_asset(path)] if rel]


def extension_adapter_manifest() -> dict[str, Any]:
    active = active_prompt_extension_names()
    active_adapters = active_adapter_extension_names()
    catalog = extension_profile_catalog_payload()
    from forge_neo.style_grid import style_grid_status_payload

    return {
        "webui_root": str(WEBUI_ROOT),
        "extensions_dir": str(USER_EXTENSIONS_DIR),
        "catalog_path": str(CATALOG_PATH),
        "catalog": catalog,
        "supported": list(SUPPORTED_EXTENSION_PROFILES),
        "supported_prompt_extensions": list(SUPPORTED_PROMPT_EXTENSIONS),
        "first_batch_profiles": list(FIRST_BATCH_PROMPT_EXTENSION_PROFILES),
        "priority_profiles": list(PRIORITY_EXTENSION_PROFILES),
        "api_route_profiles": list(API_ROUTE_EXTENSION_PROFILES),
        "ui_helper_profiles": list(UI_HELPER_EXTENSION_PROFILES),
        "ui_tab_profiles": list(UI_TAB_EXTENSION_PROFILES),
        "prompt_style_profiles": list(PROMPT_STYLE_EXTENSION_PROFILES),
        "profiles": extension_profile_statuses(),
        "active": active,
        "active_adapters": active_adapters,
        "auto_photoshop": auto_photoshop_status_payload(),
        "aspect_ratio_helper": aspect_ratio_helper_status_payload(),
        "camera_angle_selector": camera_angle_selector_status_payload(),
        "civitai_helper": civitai_helper_status_payload(),
        "storyboard_assistant": storyboard_assistant_status_payload(),
        "aesthetic_enhancement": aesthetic_enhancement_status_payload(),
        "multimodal_media": multimodal_media_status_payload(),
        "qwen_vision_chat": qwen_vision_chat_status_payload(),
        "sam_matting": sam_matting_status_payload(),
        "see_through": see_through_status_payload(),
        "trellis2": trellis2_status_payload(),
        "style_grid": style_grid_status_payload(),
        "not_loaded": [AUTO_COMPLETE_EXTENSION],
        "excluded_profiles": EXCLUDED_EXTENSION_PROFILES,
        "javascript": extension_javascript_paths(),
        "css": extension_css_paths(),
        "reference_sample_roots": extension_reference_sample_roots(),
        "reference_sample_names": extension_reference_sample_names(),
        "reference_samples_loaded": False,
    }


def _json_file(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def extension_profile_catalog_path() -> Path:
    return CATALOG_PATH


def _profile_catalog_from_runtime() -> dict[str, Any]:
    profiles = [
        {
            "name": profile.name,
            "display_name": profile.display_name,
            "family": profile.family,
            "support_level": profile.support_level,
            "extension_dirname": profile.extension_dirname or profile.name,
            "adapter_scope": profile.adapter_scope,
            "remote_url": profile.remote_url,
            "repository_layout": profile.repository_layout,
            "repository_subdir": profile.repository_subdir,
            "install_dir": (Path("forge_neo") / "webui" / "extensions" / (profile.extension_dirname or profile.name)).as_posix(),
            "source_branch": profile.source_branch,
            "source_commit": profile.source_commit,
            "source_commit_date": profile.source_commit_date,
            "required_files": list(profile.required_files),
            "javascript_files": list(profile.javascript_files),
            "css_files": list(profile.css_files),
            "runtime_files": list(profile.runtime_files),
            "routes": list(profile.routes),
            "source_routes": list(profile.source_routes),
            "source_callbacks": list(profile.source_callbacks),
            "notes": list(profile.notes),
        }
        for profile in EXTENSION_PROFILES
    ]
    return {
        "schema_version": 1,
        "kind": "forge-neo-extension-profile-catalog",
        "install_extensions_root": "forge_neo/webui/extensions",
        "supported": list(SUPPORTED_EXTENSION_PROFILES),
        "supported_prompt_extensions": list(SUPPORTED_PROMPT_EXTENSIONS),
        "first_batch_profiles": list(FIRST_BATCH_PROMPT_EXTENSION_PROFILES),
        "priority_profiles": list(PRIORITY_EXTENSION_PROFILES),
        "api_route_profiles": list(API_ROUTE_EXTENSION_PROFILES),
        "ui_helper_profiles": list(UI_HELPER_EXTENSION_PROFILES),
        "ui_tab_profiles": list(UI_TAB_EXTENSION_PROFILES),
        "prompt_style_profiles": list(PROMPT_STYLE_EXTENSION_PROFILES),
        "not_loaded": [AUTO_COMPLETE_EXTENSION],
        "excluded_profiles": dict(EXCLUDED_EXTENSION_PROFILES),
        "nodes": [
            {
                "id": profile.name,
                "display_name": profile.display_name,
                "family": profile.family,
                "support_level": profile.support_level,
                "extension_dirname": profile.extension_dirname or profile.name,
                "adapter_scope": profile.adapter_scope,
                "remote_url": profile.remote_url,
                "repository_layout": profile.repository_layout,
                "repository_subdir": profile.repository_subdir,
                "install_dir": (Path("forge_neo") / "webui" / "extensions" / (profile.extension_dirname or profile.name)).as_posix(),
                "source_branch": profile.source_branch,
                "source_commit": profile.source_commit,
                "source_commit_date": profile.source_commit_date,
            }
            for profile in EXTENSION_PROFILES
        ],
        "profiles": profiles,
    }


def extension_profile_catalog_payload() -> dict[str, Any]:
    data = _json_file(CATALOG_PATH, {})
    if (
        isinstance(data, dict)
        and isinstance(data.get("supported"), list)
        and isinstance(data.get("profiles"), list)
        and data.get("install_extensions_root") == "forge_neo/webui/extensions"
    ):
        return data
    return _profile_catalog_from_runtime()


def _mask_private_values(value: Any) -> Any:
    if isinstance(value, dict):
        masked: dict[str, Any] = {}
        for key, item in value.items():
            if SENSITIVE_KEY_RE.search(str(key)) and item:
                masked[str(key)] = "********"
            else:
                masked[str(key)] = _mask_private_values(item)
        return masked
    if isinstance(value, list):
        return [_mask_private_values(item) for item in value]
    return value


def _storage_dir() -> Path:
    path = _extension_dir(PROMPT_ALL_IN_ONE_EXTENSION) / "storage"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _storage_path(key: object) -> Path:
    text = str(key or "default").strip() or "default"
    text = text.replace("\\", "_").replace("/", "_").replace(":", "_")
    text = re.sub(r"[^A-Za-z0-9._ -]+", "_", text).strip(" ._") or "default"
    return _storage_dir() / f"{text[:160]}.json"


def _storage_get(key: object, default: Any = None) -> Any:
    path = _storage_path(key)
    if not path.exists():
        return default
    return _json_file(path, default)


def _storage_set(key: object, value: Any) -> None:
    path = _storage_path(key)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def _storage_list(key: object) -> list[Any]:
    value = _storage_get(key, [])
    return value if isinstance(value, list) else []


def _save_storage_list(key: object, value: list[Any]) -> None:
    _storage_set(key, value)


def _history_key(kind: str, item_type: str) -> str:
    safe_type = str(item_type or "txt2img")
    return f"{kind}.{safe_type}"


def _history_items(kind: str, item_type: str) -> list[dict[str, Any]]:
    return [item for item in _storage_list(_history_key(kind, item_type)) if isinstance(item, dict)]


def _save_history_items(kind: str, item_type: str, items: list[dict[str, Any]]) -> None:
    _save_storage_list(_history_key(kind, item_type), items[-100:])


def _new_history_item(tags: Any, prompt: Any, name: Any = "") -> dict[str, Any]:
    return {
        "id": str(uuid.uuid1()),
        "time": int(time.time()),
        "name": str(name or ""),
        "tags": tags,
        "prompt": prompt,
    }


def _find_item(items: list[dict[str, Any]], item_id: Any) -> dict[str, Any] | None:
    text_id = str(item_id)
    for item in items:
        if str(item.get("id", "")) == text_id:
            return item
    return None


def _physton_root() -> Path:
    return _extension_dir(PROMPT_ALL_IN_ONE_EXTENSION)


def _physton_styles_root() -> Path:
    return _physton_root() / "styles"


def _ensure_extension_import_path(root: Path) -> None:
    root_text = str(root)
    if root_text not in sys.path:
        sys.path.insert(0, root_text)

    try:
        scripts_pkg = importlib.import_module("scripts")
    except Exception:
        scripts_pkg = sys.modules.get("scripts")
    scripts_root = str(root / "scripts")
    package_path = getattr(scripts_pkg, "__path__", None)
    if package_path is None:
        return
    if scripts_root in list(package_path):
        return
    try:
        package_path.insert(0, scripts_root)
    except Exception:
        try:
            package_path.append(scripts_root)
        except Exception:
            pass


def _ensure_physton_import_path(root: Path) -> None:
    _ensure_extension_import_path(root)


def _infinite_browsing_root() -> Path:
    return _extension_dir(INFINITE_BROWSING_EXTENSION)


def wd14_tagger_available() -> bool:
    return extension_profile_available(WD14_TAGGER_EXTENSION)


def adetailer_available() -> bool:
    return extension_profile_available(ADETAILER_EXTENSION)


def dynamic_prompts_available() -> bool:
    return extension_profile_available(DYNAMIC_PROMPTS_EXTENSION)


def tipo_available() -> bool:
    return extension_profile_available(TIPO_EXTENSION)


def regional_prompter_available() -> bool:
    return extension_profile_available(REGIONAL_PROMPTER_EXTENSION)


def forge_couple_available() -> bool:
    return extension_profile_available(FORGE_COUPLE_EXTENSION)


def infinite_browsing_available() -> bool:
    return extension_profile_available(INFINITE_BROWSING_EXTENSION)


def infinite_browsing_mount_error() -> str:
    return _INFINITE_BROWSING_MOUNT_ERROR


def infinite_browsing_url() -> str:
    return INFINITE_BROWSING_BASE


def _state_is_english(lang: object | None) -> bool:
    if isinstance(lang, dict):
        lang = lang.get("__lang")
    return str(lang or "").lower().startswith("en")


def infinite_browsing_iframe_html(lang: object | None = None) -> str:
    english = _state_is_english(lang)
    if not infinite_browsing_available():
        title = "Infinite Browsing is unavailable." if english else "Infinite Browsing 不可用。"
        message = (
            f"Install {INFINITE_BROWSING_EXTENSION} with its vue/dist files, then reload Forge Neo."
            if english
            else f"请安装带 vue/dist 文件的 {INFINITE_BROWSING_EXTENSION}，然后重载 Forge Neo。"
        )
        return (
            '<div class="forge-neo-infinite-browsing-unavailable">'
            f"<strong>{html.escape(title)}</strong>"
            f"<span>{html.escape(message)}</span>"
            "</div>"
        )

    label = "Infinite Browsing" if english else "无边图像浏览"
    open_label = "Open in a separate tab" if english else "新窗口打开"
    url = html.escape(infinite_browsing_url())
    return (
        '<div class="forge-neo-infinite-browsing-wrap">'
        '<div class="forge-neo-infinite-browsing-toolbar">'
        f'<a href="{url}" target="_blank" rel="noopener noreferrer">{html.escape(open_label)}</a>'
        "</div>"
        f'<iframe class="forge-neo-infinite-browsing-frame" src="{url}" title="{html.escape(label)}" loading="lazy"></iframe>'
        "</div>"
    )


def _infinite_browsing_config_payload() -> dict[str, str]:
    from forge_neo.runtime import outputs_dir
    from forge_neo.settings import load_settings

    output_root = outputs_dir(load_settings())
    extras_root = output_root / "extras"
    grids_root = output_root / "grids"
    saved_root = output_root / "saved"
    for path in (output_root, extras_root, grids_root, saved_root):
        path.mkdir(parents=True, exist_ok=True)
    output_text = str(output_root)
    grids_text = str(grids_root)
    return {
        "outdir_txt2img_samples": output_text,
        "outdir_img2img_samples": output_text,
        "outdir_save": str(saved_root),
        "outdir_extras_samples": str(extras_root),
        "outdir_grids": grids_text,
        "outdir_img2img_grids": grids_text,
        "outdir_samples": output_text,
        "outdir_txt2img_grids": grids_text,
    }


def _write_infinite_browsing_config() -> Path:
    path = ROOT / "tmp" / "infinite_browsing_config.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_infinite_browsing_config_payload(), ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _load_module_from_path(module_name: str, path: Path) -> Any:
    cached = sys.modules.get(module_name)
    if cached is not None:
        return cached
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def mount_infinite_browsing_routes(app: Any) -> bool:
    global _INFINITE_BROWSING_MOUNT_ERROR

    state = getattr(app, "state", None)
    if bool(getattr(state, "forge_neo_infinite_browsing_mounted", False)):
        return True
    if not infinite_browsing_available():
        return False

    try:
        root = _infinite_browsing_root()
        _ensure_extension_import_path(root)
        module = _load_module_from_path("forge_neo_infinite_browsing_app", root / "app.py")
        config_path = _write_infinite_browsing_config()
        app_utils = module.AppUtils(
            sd_webui_config=str(config_path),
            sd_webui_path_relative_to_config=False,
            base=INFINITE_BROWSING_BASE,
            export_fe_fn=True,
        )
        app_utils.wrap_app(app)
        if state is not None:
            state.forge_neo_infinite_browsing_mounted = True
        _INFINITE_BROWSING_MOUNT_ERROR = ""
        return True
    except Exception as exc:
        _INFINITE_BROWSING_MOUNT_ERROR = str(exc)
        return False


def _auto_photoshop_root() -> Path:
    return _extension_dir(AUTO_PHOTOSHOP_EXTENSION)


def _auto_photoshop_server_root() -> Path:
    return _auto_photoshop_root() / "server" / "python_server"


def auto_photoshop_available() -> bool:
    return _extension_enabled(AUTO_PHOTOSHOP_EXTENSION) and _extension_profile_ready(AUTO_PHOTOSHOP_EXTENSION)


def auto_photoshop_mount_error() -> str:
    return _AUTO_PHOTOSHOP_MOUNT_ERROR


def auto_photoshop_url() -> str:
    return AUTO_PHOTOSHOP_BASE


def _auto_photoshop_manifest() -> dict[str, Any]:
    data = _json_file(_auto_photoshop_root() / "manifest.json", {})
    return data if isinstance(data, dict) else {}


def _auto_photoshop_version() -> str:
    version = str(_auto_photoshop_manifest().get("version") or "0.0.0").strip() or "0.0.0"
    return f"v{version}" if not version.startswith("v") else version


def _auto_photoshop_runtime_dir(name: str) -> Path:
    path = _auto_photoshop_server_root() / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def _auto_photoshop_output_dir(document_id: object) -> tuple[Path, str]:
    safe = str(document_id or uuid.uuid4()).strip() or str(uuid.uuid4())
    safe = safe.replace("\\", "_").replace("/", "_").replace(":", "_")
    safe = re.sub(r"[^A-Za-z0-9._ -]+", "_", safe).strip(" ._") or str(uuid.uuid4())
    path = _auto_photoshop_runtime_dir("output") / safe
    path.mkdir(parents=True, exist_ok=True)
    return path, safe


def _auto_photoshop_prompt_shortcut_path() -> Path:
    return _auto_photoshop_server_root() / "prompt_shortcut.json"


def _auto_photoshop_prompt_shortcuts() -> dict[str, str]:
    data = _json_file(_auto_photoshop_prompt_shortcut_path(), {})
    if not isinstance(data, dict):
        return {}
    return {str(key): str(value) for key, value in data.items()}


def _auto_photoshop_write_prompt_shortcuts(data: Any) -> dict[str, Any]:
    value = data if isinstance(data, dict) else {}
    path = _auto_photoshop_prompt_shortcut_path()
    path.write_text(json.dumps(value, ensure_ascii=False, indent=4), encoding="utf-8")
    return value


def _auto_photoshop_apply_prompt_shortcuts(text: object, shortcuts: dict[str, str]) -> str:
    source = str(text or "")
    if not shortcuts:
        return source

    def replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        return shortcuts.get(key, match.group(0))

    return re.sub(r"\{(.*?)\}", replace, source)


def _auto_photoshop_prepare_prompt_payload(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if data.get("use_prompt_shortcut"):
        shortcuts = _auto_photoshop_prompt_shortcuts()
        extra = data.get("prompt_shortcut_ui_dict")
        if isinstance(extra, dict):
            shortcuts.update({str(key): str(value) for key, value in extra.items()})
        data["prompt"] = _auto_photoshop_apply_prompt_shortcuts(data.get("prompt"), shortcuts)
        data["negative_prompt"] = _auto_photoshop_apply_prompt_shortcuts(data.get("negative_prompt"), shortcuts)
    return data


def _auto_photoshop_strip_data_url(value: object) -> str:
    text = str(value or "").strip()
    if "," in text and text.lower().startswith("data:"):
        return text.split(",", 1)[1]
    return text


def _auto_photoshop_decode_image(value: object) -> Image.Image:
    text = _auto_photoshop_strip_data_url(value)
    if not text:
        raise HTTPException(status_code=422, detail="Image data is required.")
    try:
        with Image.open(io.BytesIO(base64.b64decode(text))) as image:
            return image.convert("RGBA").copy()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid base64 image.") from exc


def _auto_photoshop_encode_image(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _auto_photoshop_save_base64(value: object, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(_auto_photoshop_strip_data_url(value)))


def _auto_photoshop_metadata_json(info: object) -> dict[str, Any]:
    try:
        module = _load_module_from_path(
            "forge_neo_auto_photoshop_metadata_to_json",
            _auto_photoshop_server_root() / "metadata_to_json.py",
        )
        result = module.convertMetadataToJson(str(info or ""))
        return result if isinstance(result, dict) else {}
    except Exception:
        return {}


def _auto_photoshop_reserve_border_pixels(original: Image.Image, changed: Image.Image) -> Image.Image:
    pixels = original.load()
    changed_pixels = changed.load()
    width, height = original.size
    for x in range(width):
        changed_pixels[x, 0] = pixels[x, 0]
        changed_pixels[x, height - 1] = pixels[x, height - 1]
    for y in range(height):
        changed_pixels[0, y] = pixels[0, y]
        changed_pixels[width - 1, y] = pixels[width - 1, y]
    return changed


def _auto_photoshop_expand_mask(mask_image: Image.Image, mask_expansion: object, blur: object = 10) -> Image.Image:
    try:
        iterations = max(0, int(mask_expansion))
    except Exception:
        iterations = 0
    try:
        blur_radius = max(0.0, float(blur))
    except Exception:
        blur_radius = 10.0
    expanded = mask_image.copy()
    for _ in range(iterations):
        expanded = expanded.filter(ImageFilter.MaxFilter(3))
    if blur_radius:
        expanded = expanded.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    return _auto_photoshop_reserve_border_pixels(mask_image, expanded)


async def _auto_photoshop_post_sdapi(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    import httpx

    url = f"{_AUTO_PHOTOSHOP_SD_URL.rstrip('/')}/sdapi/v1/{path.lstrip('/')}"
    async with httpx.AsyncClient() as client:
        response = await client.post(url=url, json=payload, timeout=None)
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    data = response.json()
    return data if isinstance(data, dict) else {}


async def _auto_photoshop_proxy(path: str, request: Request, method: str) -> Response:
    import httpx

    url = f"{_AUTO_PHOTOSHOP_SD_URL.rstrip('/')}/{path.lstrip('/')}"
    headers: dict[str, str] = {}
    content_type = request.headers.get("content-type")
    if content_type:
        headers["content-type"] = content_type
    async with httpx.AsyncClient() as client:
        if method.upper() == "GET":
            response = await client.get(url=url, params=request.query_params, timeout=None)
        else:
            response = await client.request(
                method=method.upper(),
                url=url,
                params=request.query_params,
                content=await request.body(),
                headers=headers,
                timeout=None,
            )
    return Response(
        content=response.content,
        status_code=response.status_code,
        media_type=response.headers.get("content-type"),
    )


async def _auto_photoshop_save_generation_images(api_data: dict[str, Any], document_id: object) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    import httpx

    output_dir, dir_name = _auto_photoshop_output_dir(document_id)
    images_info: list[dict[str, Any]] = []
    metadata: list[dict[str, Any]] = []
    async with httpx.AsyncClient() as client:
        for item in api_data.get("images") or []:
            image = _auto_photoshop_decode_image(item)
            png_info = PngImagePlugin.PngInfo()
            metadata_info = ""
            try:
                png_response = await client.post(
                    url=f"{_AUTO_PHOTOSHOP_SD_URL.rstrip('/')}/sdapi/v1/png-info",
                    json={"image": "data:image/png;base64," + _auto_photoshop_strip_data_url(item)},
                    timeout=None,
                )
                if png_response.status_code < 400:
                    metadata_info = str((png_response.json() or {}).get("info") or "")
                    if metadata_info:
                        png_info.add_text("parameters", metadata_info)
            except Exception:
                metadata_info = ""
            image_name = f"output- {time.time()}.png"
            image_path = output_dir / image_name
            image.convert("RGB").save(image_path, pnginfo=png_info)
            rel_path = f"output/{dir_name}/{image_name}"
            images_info.append({"base64": _auto_photoshop_strip_data_url(item), "path": rel_path})
            metadata.append(_auto_photoshop_metadata_json(metadata_info))
    return dir_name, images_info, metadata


async def _auto_photoshop_txt2img_payload(payload: dict[str, Any]) -> dict[str, Any]:
    data = _auto_photoshop_prepare_prompt_payload(payload)
    api_data = await _auto_photoshop_post_sdapi("txt2img", data)
    dir_name, images_info, metadata = await _auto_photoshop_save_generation_images(api_data, data.get("uniqueDocumentId"))
    return {"payload": data, "dir_name": dir_name, "images_info": images_info, "metadata": metadata}


async def _auto_photoshop_img2img_payload(payload: dict[str, Any]) -> dict[str, Any]:
    data = _auto_photoshop_prepare_prompt_payload(payload)
    init_name = str(data.get("init_image_name") or "").strip()
    if init_name:
        init_path = _auto_photoshop_runtime_dir("init_images") / Path(init_name).name
        if not init_path.is_file():
            raise HTTPException(status_code=404, detail=f"Init image not found: {init_name}")
        with Image.open(init_path) as image:
            data["init_images"] = [_auto_photoshop_encode_image(image.convert("RGBA"))]
    mask_name = str(data.get("init_image_mask_name") or "").strip()
    if mask_name:
        mask_path = _auto_photoshop_runtime_dir("init_images") / Path(mask_name).name
        if mask_path.is_file():
            with Image.open(mask_path) as mask:
                mask_image = mask.convert("RGBA")
            if not data.get("use_sharp_mask", False):
                mask_image = _auto_photoshop_expand_mask(mask_image, data.get("mask_expansion", 0), 0)
            data["mask"] = _auto_photoshop_encode_image(mask_image)
    api_data = await _auto_photoshop_post_sdapi("img2img", data)
    dir_name, images_info, metadata = await _auto_photoshop_save_generation_images(api_data, data.get("uniqueDocumentId"))
    return {"payload": data, "dir_name": dir_name, "images_info": images_info, "metadata": metadata}


def aspect_ratio_helper_available() -> bool:
    return _extension_enabled(ASPECT_RATIO_HELPER_EXTENSION) and _extension_profile_ready(ASPECT_RATIO_HELPER_EXTENSION)


def aspect_ratio_helper_config_payload() -> dict[str, Any]:
    return {
        "enabled": aspect_ratio_helper_available(),
        "txt2img": {
            "width_id": "forge_neo_width",
            "height_id": "forge_neo_height",
            "switch_button_id": "forge_neo_res_switch_btn",
            "select_id": "forge_neo_arh_txt2img_ratio",
        },
        "img2img": {
            "width_id": "forge_neo_img2img_width",
            "height_id": "forge_neo_img2img_height",
            "switch_button_id": "forge_neo_img2img_res_switch_btn",
            "select_id": "forge_neo_arh_img2img_ratio",
        },
        "choices": ["Off", "Lock", "1:1", "3:2", "4:3", "5:4", "16:9", "9:16", "21:9"],
        "default": "Off",
        "min_dimension": 64,
        "max_dimension": 2048,
        "step": 8,
    }


def aspect_ratio_helper_status_payload() -> dict[str, Any]:
    return {
        "extension": ASPECT_RATIO_HELPER_EXTENSION,
        "available": aspect_ratio_helper_available(),
        "javascript": _relative_asset(ASPECT_RATIO_HELPER_JS) if ASPECT_RATIO_HELPER_JS.exists() else "",
        "css": _relative_asset(ASPECT_RATIO_HELPER_CSS) if ASPECT_RATIO_HELPER_CSS.exists() else "",
        "config_route": "/forge-neo/extensions/aspect-ratio-helper-config",
        "config": aspect_ratio_helper_config_payload(),
    }


def _camera_angle_selector_root() -> Path:
    return _extension_dir(CAMERA_ANGLE_SELECTOR_EXTENSION)


def _camera_angle_selector_view_path() -> Path:
    return _camera_angle_selector_root() / "scripts" / "camera_3d_view.html"


def camera_angle_selector_available() -> bool:
    return _extension_enabled(CAMERA_ANGLE_SELECTOR_EXTENSION) and _extension_profile_ready(CAMERA_ANGLE_SELECTOR_EXTENSION)


def camera_angle_selector_config_payload() -> dict[str, Any]:
    return {
        "enabled": camera_angle_selector_available(),
        "base": CAMERA_ANGLE_SELECTOR_BASE,
        "view": f"{CAMERA_ANGLE_SELECTOR_BASE}/view",
        "iframe_id": "forge_neo_camera_angle_iframe",
        "txt2img_prompt_id": "forge_neo_prompt",
        "img2img_prompt_id": "forge_neo_img2img_prompt",
        "message_request_type": "GET_CURRENT_ANGLE",
        "message_response_type": "ANGLE_SELECTED",
    }


def camera_angle_selector_status_payload() -> dict[str, Any]:
    return {
        "extension": CAMERA_ANGLE_SELECTOR_EXTENSION,
        "available": camera_angle_selector_available(),
        "base": CAMERA_ANGLE_SELECTOR_BASE,
        "view": f"{CAMERA_ANGLE_SELECTOR_BASE}/view",
        "html": str(_camera_angle_selector_view_path()) if _camera_angle_selector_view_path().is_file() else "",
        "javascript": _relative_asset(CAMERA_ANGLE_SELECTOR_JS) if CAMERA_ANGLE_SELECTOR_JS.exists() else "",
        "css": _relative_asset(CAMERA_ANGLE_SELECTOR_CSS) if CAMERA_ANGLE_SELECTOR_CSS.exists() else "",
        "config_route": "/forge-neo/extensions/camera-angle-selector-config",
        "config": camera_angle_selector_config_payload(),
    }


def _civitai_helper_root() -> Path:
    return _extension_dir(CIVITAI_HELPER_EXTENSION)


def civitai_helper_available() -> bool:
    return _extension_enabled(CIVITAI_HELPER_EXTENSION) and _extension_profile_ready(CIVITAI_HELPER_EXTENSION)


def civitai_helper_status_payload() -> dict[str, Any]:
    root = _civitai_helper_root()
    return {
        "extension": CIVITAI_HELPER_EXTENSION,
        "available": civitai_helper_available(),
        "tab_ids": ["civitai_helper", "civitai_helper_browser"],
        "script": str(root / "scripts" / "civitai_helper.py") if (root / "scripts" / "civitai_helper.py").is_file() else "",
        "javascript": _relative_asset(root / "javascript" / "civitai_helper.js") if (root / "javascript" / "civitai_helper.js").is_file() else "",
        "css": _relative_asset(root / "style.css") if (root / "style.css").is_file() else "",
        "source_ui": {
            "extension_dirname": CIVITAI_HELPER_EXTENSION,
            "script": "scripts/civitai_helper.py",
            "callback": "on_ui_tabs",
        },
    }


def storyboard_assistant_available() -> bool:
    return _extension_enabled(STORYBOARD_ASSISTANT_EXTENSION) and _extension_profile_ready(STORYBOARD_ASSISTANT_EXTENSION)


def storyboard_assistant_status_payload() -> dict[str, Any]:
    try:
        from forge_neo.storyboard import load_storyboards, storyboard_dir, storyboard_file

        directory = storyboard_dir()
        file_path = storyboard_file()
        item_count = len(load_storyboards())
    except Exception:
        directory = Path("")
        file_path = Path("")
        item_count = 0
    return {
        "extension": STORYBOARD_ASSISTANT_EXTENSION,
        "available": storyboard_assistant_available(),
        "tab_id": "forge_neo_storyboard_tab",
        "data_dir": str(directory) if directory else "",
        "storyboard_file": str(file_path) if file_path else "",
        "item_count": item_count,
    }


def aesthetic_enhancement_available() -> bool:
    return _extension_enabled(AESTHETIC_ENHANCEMENT_EXTENSION) and _extension_profile_ready(AESTHETIC_ENHANCEMENT_EXTENSION)


def aesthetic_enhancement_status_payload() -> dict[str, Any]:
    try:
        from forge_neo.aesthetic_enhancement import aesthetic_asset_root, aesthetic_counts, aesthetic_qwen_analysis_defaults

        asset_root = aesthetic_asset_root()
        counts = aesthetic_counts()
        qwen_analysis = aesthetic_qwen_analysis_defaults()
    except Exception:
        asset_root = Path("")
        counts = {"artists": 0, "artist_styles": 0, "composition": 0, "lighting": 0, "styles": []}
        qwen_analysis = {"available": False, "models": [], "analysis_types": []}
    return {
        "extension": AESTHETIC_ENHANCEMENT_EXTENSION,
        "available": aesthetic_enhancement_available(),
        "tab_id": "forge_neo_aesthetic_enhancement_tab",
        "asset_root": str(asset_root) if asset_root else "",
        "counts": counts,
        "qwen_analysis": qwen_analysis,
    }


def qwen_vision_chat_available() -> bool:
    return _extension_enabled(QWEN_VISION_CHAT_EXTENSION) and _extension_profile_ready(QWEN_VISION_CHAT_EXTENSION)


def multimodal_media_available() -> bool:
    return _extension_enabled(MULTIMODAL_MEDIA_EXTENSION) and _extension_profile_ready(MULTIMODAL_MEDIA_EXTENSION)


def multimodal_media_status_payload() -> dict[str, Any]:
    try:
        from forge_neo.multimodal_media import multimodal_media_status

        status = multimodal_media_status()
    except Exception:
        status = {}
    return {
        "extension": MULTIMODAL_MEDIA_EXTENSION,
        "available": multimodal_media_available(),
        "tab_id": "forge_neo_multimodal_media_tab",
        **status,
    }


def qwen_vision_chat_status_payload() -> dict[str, Any]:
    try:
        from forge_neo.qwen_vision_chat import qwen_vision_chat_defaults

        defaults = qwen_vision_chat_defaults()
    except Exception:
        defaults = {}
    return {
        "extension": QWEN_VISION_CHAT_EXTENSION,
        "available": qwen_vision_chat_available(),
        "tab_id": "forge_neo_qwen_vision_chat_tab",
        "ollama_host": defaults.get("ollama_host", "http://localhost:11434"),
        "vision_models": list(defaults.get("vision_models", [])),
        "language_models": list(defaults.get("language_models", [])),
        "endpoint": f"{defaults.get('ollama_host', 'http://localhost:11434').rstrip('/')}/api/chat",
    }


def sam_matting_available() -> bool:
    return _extension_enabled(SAM_MATTING_EXTENSION) and _extension_profile_ready(SAM_MATTING_EXTENSION)


def sam_matting_status_payload() -> dict[str, Any]:
    try:
        from forge_neo.sam_matting import sam_matting_status

        status = sam_matting_status()
    except Exception:
        status = {}
    return {
        "extension": SAM_MATTING_EXTENSION,
        "available": sam_matting_available(),
        "tab_id": "forge_neo_sam_matting_tab",
        **status,
    }


def see_through_available() -> bool:
    return _extension_enabled(SEE_THROUGH_EXTENSION) and _extension_profile_ready(SEE_THROUGH_EXTENSION)


def see_through_status_payload() -> dict[str, Any]:
    try:
        from forge_neo.see_through import see_through_status

        status = see_through_status()
    except Exception:
        status = {}
    return {
        "extension": SEE_THROUGH_EXTENSION,
        "available": see_through_available(),
        "tab_id": "forge_neo_see_through_tab",
        **status,
    }


def trellis2_available() -> bool:
    return _extension_enabled(TRELLIS2_EXTENSION) and _extension_profile_ready(TRELLIS2_EXTENSION)


def trellis2_status_payload() -> dict[str, Any]:
    try:
        from forge_neo.trellis2 import trellis2_status

        status = trellis2_status()
    except Exception:
        status = {}
    return {
        "extension": TRELLIS2_EXTENSION,
        "available": trellis2_available(),
        "tab_id": "forge_neo_trellis2_tab",
        **status,
    }


def camera_angle_selector_iframe_html(lang: object | None = None) -> str:
    english = _state_is_english(lang)
    if not camera_angle_selector_available():
        title = "Camera Angle Selector is unavailable." if english else "相机角度选择器不可用。"
        message = (
            f"Install {CAMERA_ANGLE_SELECTOR_EXTENSION}, then reload Forge Neo."
            if english
            else f"请安装 {CAMERA_ANGLE_SELECTOR_EXTENSION}，然后重载 Forge Neo。"
        )
        return (
            '<div class="forge-neo-camera-angle-unavailable">'
            f"<strong>{html.escape(title)}</strong>"
            f"<span>{html.escape(message)}</span>"
            "</div>"
        )

    view = html.escape(f"{CAMERA_ANGLE_SELECTOR_BASE}/view")
    title = "Camera Angle Selector" if english else "相机角度选择器"
    txt2img_label = "Apply to txt2img" if english else "应用到文生图"
    img2img_label = "Apply to img2img" if english else "应用到图生图"
    return (
        '<div class="forge-neo-camera-angle-wrap">'
        '<div class="forge-neo-camera-angle-framebar">'
        f'<button type="button" class="forge-neo-camera-angle-apply" data-forge-neo-camera-target="txt2img">{html.escape(txt2img_label)}</button>'
        f'<button type="button" class="forge-neo-camera-angle-apply" data-forge-neo-camera-target="img2img">{html.escape(img2img_label)}</button>'
        '<span class="forge-neo-camera-angle-status" aria-live="polite"></span>'
        "</div>"
        f'<iframe id="forge_neo_camera_angle_iframe" class="forge-neo-camera-angle-frame" src="{view}" title="{html.escape(title)}"></iframe>'
        "</div>"
    )


def auto_photoshop_status_payload(app: Any | None = None) -> dict[str, Any]:
    state = getattr(app, "state", None) if app is not None else None
    return {
        "extension": AUTO_PHOTOSHOP_EXTENSION,
        "available": auto_photoshop_available(),
        "mounted": bool(getattr(state, "forge_neo_auto_photoshop_mounted", False)),
        "base": AUTO_PHOTOSHOP_BASE,
        "version": _auto_photoshop_version() if _auto_photoshop_root().is_dir() else "",
        "sd_url": _AUTO_PHOTOSHOP_SD_URL,
        "server_dir": str(_auto_photoshop_server_root()) if _auto_photoshop_server_root().is_dir() else "",
        "error": auto_photoshop_mount_error(),
    }


def _auto_photoshop_router() -> APIRouter:
    router = APIRouter(prefix=AUTO_PHOTOSHOP_BASE)

    @router.get("")
    @router.get("/")
    async def _auto_photoshop_root_route():
        return {"Hello": "World"}

    @router.get("/version")
    async def _auto_photoshop_version_route():
        return {"version": _auto_photoshop_version()}

    @router.get("/heartbeat")
    async def _auto_photoshop_heartbeat_route():
        return {"heartbeat": True}

    @router.post("/sd_url/")
    async def _auto_photoshop_change_sd_url(request: Request):
        global _AUTO_PHOTOSHOP_SD_URL
        data = await _request_json(request)
        url = str(data.get("sd_url") or "").strip()
        if url:
            _AUTO_PHOTOSHOP_SD_URL = url.rstrip("/")
        return {"sd_url": _AUTO_PHOTOSHOP_SD_URL}

    @router.get("/config")
    async def _auto_photoshop_config(request: Request):
        return await _auto_photoshop_proxy("config", request, "GET")

    @router.get("/sdapi/v1/{path:path}")
    async def _auto_photoshop_get_sdapi(path: str, request: Request):
        return await _auto_photoshop_proxy(f"sdapi/v1/{path}", request, "GET")

    @router.post("/sdapi/v1/{path:path}")
    async def _auto_photoshop_post_sdapi_route(path: str, request: Request):
        return await _auto_photoshop_proxy(f"sdapi/v1/{path}", request, "POST")

    @router.post("/txt2img/")
    async def _auto_photoshop_txt2img(request: Request):
        return await _auto_photoshop_txt2img_payload(await _request_json(request))

    @router.post("/img2img/")
    async def _auto_photoshop_img2img(request: Request):
        return await _auto_photoshop_img2img_payload(await _request_json(request))

    @router.post("/save/png/")
    async def _auto_photoshop_save_png(request: Request):
        data = await _request_json(request)
        name = str(data.get("image_name") or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="image_name is required.")
        path = _auto_photoshop_runtime_dir("init_images") / Path(name).name
        _auto_photoshop_save_base64(data.get("base64"), path)
        return {"status": f"{path.name} has been saved"}

    @router.post("/getInitImage/")
    async def _auto_photoshop_get_init_image(request: Request):
        data = await _request_json(request)
        name = str(data.get("init_image_name") or data.get("image_name") or "").strip()
        path = _auto_photoshop_runtime_dir("init_images") / Path(name).name
        if not name or not path.is_file():
            return {"payload": data, "init_image_str": ""}
        with Image.open(path) as image:
            return {"payload": data, "init_image_str": _auto_photoshop_encode_image(image.convert("RGBA"))}

    @router.post("/mask/expansion/")
    async def _auto_photoshop_mask_expansion(request: Request):
        data = await _request_json(request)
        mask = _auto_photoshop_decode_image(data.get("mask"))
        expanded = _auto_photoshop_expand_mask(mask, data.get("mask_expansion"), data.get("blur", 10))
        return {"mask": _auto_photoshop_encode_image(expanded)}

    @router.post("/history/load")
    async def _auto_photoshop_history(request: Request):
        data = await _request_json(request)
        _, dir_name = _auto_photoshop_output_dir(data.get("uniqueDocumentId"))
        output_dir = _auto_photoshop_runtime_dir("output") / dir_name
        image_paths = sorted(output_dir.glob("*.png"), key=lambda item: item.stat().st_mtime, reverse=True)
        rel_paths: list[str] = []
        metadata: list[dict[str, Any]] = []
        images: list[str] = []
        for path in image_paths:
            rel_paths.append(f"output/{dir_name}/{path.name}")
            with Image.open(path) as image:
                images.append(_auto_photoshop_encode_image(image.convert("RGBA")))
                metadata.append(_auto_photoshop_metadata_json(image.info.get("parameters", "")))
        return {"image_paths": rel_paths, "metadata_jsons": metadata, "base64_images": images}

    @router.post("/prompt_shortcut/load")
    async def _auto_photoshop_prompt_shortcut_load():
        return {"prompt_shortcut": _auto_photoshop_prompt_shortcuts()}

    @router.post("/prompt_shortcut/save")
    async def _auto_photoshop_prompt_shortcut_save(request: Request):
        data = await _request_json(request)
        return {"prompt_shortcut": _auto_photoshop_write_prompt_shortcuts(data.get("prompt_shortcut"))}

    @router.post("/search/image/")
    async def _auto_photoshop_search_image(request: Request):
        data = await _request_json(request)
        try:
            _ensure_extension_import_path(_auto_photoshop_server_root())
            search_module = _load_module_from_path("forge_neo_auto_photoshop_search", _auto_photoshop_server_root() / "search.py")
            images = await search_module.imageSearch(data.get("keywords") or "cute dogs")
            return {"images": images}
        except Exception as exc:
            return {"images": [], "error": str(exc)}

    @router.post("/readPngMetadata")
    async def _auto_photoshop_read_png_metadata(request: Request):
        try:
            with Image.open(io.BytesIO(await request.body())) as image:
                return {"metadata": dict(image.info)}
        except Exception as exc:
            return {"status": "failed", "message": str(exc)}

    @router.post("/swapModel")
    async def _auto_photoshop_swap_model(request: Request):
        data = await _request_json(request)
        model_title = data.get("title") or data.get("sd_model_checkpoint") or data.get("model")
        if not model_title:
            return {}
        await _auto_photoshop_post_sdapi("options", {"sd_model_checkpoint": model_title})
        return {}

    @router.get("/lora/list")
    async def _auto_photoshop_lora_list():
        try:
            from forge_neo.models import lora_names

            return {name: name for name in lora_names()}
        except Exception:
            return {}

    @router.get("/vae/list")
    async def _auto_photoshop_vae_list():
        return {}

    @router.post("/controlnet/filter")
    async def _auto_photoshop_controlnet_filter(request: Request):
        data = await _request_json(request)
        keyword = str(data.get("keyword") or data.get("body") or "All")
        preprocessor_list = data.get("preprocessor_list") if isinstance(data.get("preprocessor_list"), list) else []
        model_list = data.get("model_list") if isinstance(data.get("model_list"), list) else []
        try:
            module = _load_module_from_path("forge_neo_auto_photoshop_global_state", _auto_photoshop_server_root() / "global_state.py")
            filtered_preprocessors, filtered_models, default_option, default_model = module.filter_selected_helper(keyword, preprocessor_list, model_list)
            return {
                "keywords": list(module.preprocessor_filters.keys()),
                "module_list": filtered_preprocessors,
                "model_list": filtered_models,
                "default_option": default_option,
                "default_model": default_model,
            }
        except Exception as exc:
            return {
                "keywords": ["All"],
                "module_list": preprocessor_list,
                "model_list": model_list,
                "default_option": "none",
                "default_model": "None",
                "error": str(exc),
            }

    @router.post("/open/url/")
    async def _auto_photoshop_open_url(request: Request):
        data = await _request_json(request)
        return {"url": str(data.get("url") or "")}

    return router


def mount_auto_photoshop_routes(app: Any) -> bool:
    global _AUTO_PHOTOSHOP_MOUNT_ERROR

    state = getattr(app, "state", None)
    if bool(getattr(state, "forge_neo_auto_photoshop_mounted", False)):
        return True
    if not auto_photoshop_available():
        return False

    try:
        app.include_router(_auto_photoshop_router())
        if state is not None:
            state.forge_neo_auto_photoshop_mounted = True
        _AUTO_PHOTOSHOP_MOUNT_ERROR = ""
        return True
    except Exception as exc:
        _AUTO_PHOTOSHOP_MOUNT_ERROR = str(exc)
        return False


def _physton_translate_payload(data: dict[str, Any], *, batch: bool = False) -> dict[str, Any]:
    text_key = "texts" if batch else "text"
    translated_empty: Any = [] if batch else ""
    for key in (text_key, "from_lang", "to_lang", "api", "api_config"):
        if key not in data:
            return {"success": False, "message": f"{key} is required", "translated_text": translated_empty}

    root = _physton_root()
    if not root.is_dir():
        return {
            "success": False,
            "message": f"{PROMPT_ALL_IN_ONE_EXTENSION} is not installed.",
            "translated_text": translated_empty,
        }

    try:
        _ensure_physton_import_path(root)
        translate_module = importlib.import_module("scripts.physton_prompt.translate")
        translate_fn = getattr(translate_module, "translate")
        result = translate_fn(
            data.get(text_key),
            data.get("from_lang"),
            data.get("to_lang"),
            data.get("api"),
            data.get("api_config") or {},
        )
    except Exception as exc:
        return {"success": False, "message": str(exc), "translated_text": translated_empty}

    if isinstance(result, dict):
        return result
    return {"success": False, "message": "translator returned an invalid response", "translated_text": translated_empty}


def _safe_join(root: Path, requested: object) -> Path | None:
    value = str(requested or "").replace("\\", "/").lstrip("/")
    candidate = (root / value).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate if candidate.exists() else None


def _csv_entries() -> list[dict[str, Any]]:
    roots = [
        (_physton_root() / "tags", "\\extensions\\sd-webui-prompt-all-in-one-forgeneo\\tags\\"),
        (_extension_dir(TAGCOMPLETE_EXTENSION) / "tags", "\\extensions\\sd-webui-tagcomplete-neo\\tags\\"),
    ]
    rows: list[dict[str, Any]] = []
    for root, prefix in roots:
        if not root.is_dir():
            continue
        for path in sorted(root.glob("*.csv"), key=lambda item: item.name.lower()):
            rows.append(
                {
                    "key": prefix + path.name,
                    "name": path.name,
                    "size": path.stat().st_size,
                    "path": str(path),
                }
            )
    return rows


def _csv_path_from_key(key: object) -> Path | None:
    text = str(key or "")
    for entry in _csv_entries():
        if text == entry["key"] or text == entry["name"] or text.endswith("\\" + entry["name"]):
            path = Path(str(entry["path"]))
            return path if path.exists() else None
    return None


def _extension_css_list() -> list[dict[str, Any]]:
    styles_root = _physton_styles_root()
    ext_root = styles_root / "extensions"
    if not ext_root.is_dir():
        return []
    rows: list[dict[str, Any]] = []
    for item in sorted(ext_root.iterdir(), key=lambda value: value.name.lower()):
        manifest = item / "manifest.json"
        style = item / "style.min.css"
        if not item.is_dir() or not manifest.exists() or not style.exists():
            continue
        rows.append(
            {
                "dir": item.name,
                "dataName": f"extensionSelect.{item.name}",
                "selected": bool(_storage_get(f"extensionSelect.{item.name}", False)),
                "manifest": manifest.read_text(encoding="utf-8", errors="ignore"),
                "style": f"extensions/{item.name}/style.min.css",
            }
        )
    return rows


def _group_tags(lang: object) -> str:
    tags_root = _physton_root() / "group_tags"
    candidates = [str(lang or ""), str(lang or "").replace("-", "_"), "default"]
    for value in candidates:
        value = value.strip()
        if not value:
            continue
        path = tags_root / f"{value}.yaml"
        if path.exists():
            return path.read_text(encoding="utf-8", errors="ignore")
    return ""


def _token_count(text: object) -> dict[str, int]:
    tokens = re.findall(r"\S+", str(text or ""))
    return {"token_count": len(tokens), "max_length": 75}


def _wd14_models_root() -> Path:
    return _extension_dir(WD14_TAGGER_EXTENSION) / "models"


def _wd14_model_entries() -> dict[str, dict[str, Path]]:
    root = _wd14_models_root()
    if not root.is_dir():
        return {}
    rows: dict[str, dict[str, Path]] = {}
    for item in sorted(root.iterdir(), key=lambda value: value.name.lower()):
        if not item.is_dir():
            continue
        model = item / "model.onnx"
        tags = item / "selected_tags.csv"
        if model.is_file() and tags.is_file():
            rows[item.name] = {"model": model, "tags": tags}
    return rows


def wd14_interrogator_names() -> list[str]:
    return list(_wd14_model_entries())


def _wd14_default_model() -> str:
    names = wd14_interrogator_names()
    if "wd14-vit-v2-git" in names:
        return "wd14-vit-v2-git"
    return names[0] if names else ""


_WD14_SESSION_CACHE: dict[str, Any] = {}
_WD14_TAG_CACHE: dict[str, list[str]] = {}


def _wd14_model_entry(name: object) -> tuple[str, dict[str, Path]]:
    entries = _wd14_model_entries()
    if not entries:
        raise HTTPException(status_code=404, detail="No local WD14 interrogator models are available.")
    selected = str(name or "").strip() or _wd14_default_model()
    if selected not in entries:
        raise HTTPException(status_code=404, detail=f"Unknown WD14 interrogator model: {selected}")
    return selected, entries[selected]


def _wd14_decode_image(value: object) -> Image.Image:
    text = str(value or "").strip()
    if not text:
        raise HTTPException(status_code=404, detail="Image not found")
    if text.startswith("data:") and "," in text:
        text = text.split(",", 1)[1]
    try:
        raw = base64.b64decode(text)
        with Image.open(io.BytesIO(raw)) as image:
            return image.convert("RGBA").copy()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid base64 image.") from exc


def _wd14_tags(model_name: str, tags_path: Path) -> list[str]:
    cached = _WD14_TAG_CACHE.get(model_name)
    if cached is not None:
        return cached
    tags: list[str] = []
    with tags_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            name = str(row.get("name") or "").strip()
            if name:
                tags.append(name)
    _WD14_TAG_CACHE[model_name] = tags
    return tags


def _wd14_session(model_name: str, model_path: Path) -> Any:
    cached = _WD14_SESSION_CACHE.get(model_name)
    if cached is not None:
        return cached
    try:
        import onnxruntime as ort
    except Exception as exc:
        raise HTTPException(status_code=500, detail="onnxruntime is not available.") from exc
    available = set(ort.get_available_providers())
    providers = ["CPUExecutionProvider"] if "CPUExecutionProvider" in available else None
    session = ort.InferenceSession(str(model_path), providers=providers or None)
    _WD14_SESSION_CACHE[model_name] = session
    return session


def _wd14_image_size(session: Any) -> int:
    shape = list(getattr(session.get_inputs()[0], "shape", []) or [])
    for index in (1, 2):
        if index < len(shape) and isinstance(shape[index], int) and shape[index] > 1:
            return int(shape[index])
    for value in shape:
        if isinstance(value, int) and value > 16:
            return int(value)
    return 448


def _wd14_prepare_image(image: Image.Image, size: int) -> Any:
    import numpy as np

    rgba = image.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    background.alpha_composite(rgba)
    rgb = background.convert("RGB")
    array = np.asarray(rgb, dtype=np.uint8)[:, :, ::-1]
    height, width = array.shape[:2]
    side = max(height, width)
    square = np.full((side, side, 3), 255, dtype=np.uint8)
    top = (side - height) // 2
    left = (side - width) // 2
    square[top : top + height, left : left + width] = array
    try:
        import cv2

        interpolation = cv2.INTER_AREA if side > size else cv2.INTER_CUBIC
        resized = cv2.resize(square, (size, size), interpolation=interpolation)
    except Exception:
        resized = np.asarray(Image.fromarray(square[:, :, ::-1]).resize((size, size), Image.Resampling.LANCZOS), dtype=np.uint8)[:, :, ::-1]
    return np.expand_dims(resized.astype(np.float32), 0)


def wd14_interrogate_payload(payload: dict[str, Any]) -> dict[str, dict[str, float]]:
    model_name, entry = _wd14_model_entry(payload.get("model") or payload.get("interrogator"))
    image = _wd14_decode_image(payload.get("image"))
    threshold = payload.get("threshold", 0.35)
    try:
        threshold_value = max(0.0, min(float(threshold), 1.0))
    except Exception:
        threshold_value = 0.35
    session = _wd14_session(model_name, entry["model"])
    tags = _wd14_tags(model_name, entry["tags"])
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    scores = session.run([output_name], {input_name: _wd14_prepare_image(image, _wd14_image_size(session))})[0]
    values = [float(item) for item in scores[0]]
    captions: dict[str, float] = {}
    for tag, score in zip(tags[:4], values[:4]):
        captions[tag] = score
    for tag, score in zip(tags[4:], values[4:]):
        if score >= threshold_value:
            captions[tag] = score
    return {"caption": captions}


async def _request_json(request: Any) -> dict[str, Any]:
    try:
        data = await request.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _response_not_configured(message: str = "Feature is not configured in Forge Neo.") -> dict[str, Any]:
    return {"success": False, "message": message}


def install_extension_adapter_routes(app: Any) -> None:
    prepare_extension_runtime_files()
    mount_infinite_browsing_routes(app)
    mount_auto_photoshop_routes(app)
    from forge_neo.style_grid import mount_style_grid_routes

    mount_style_grid_routes(app)

    @app.get("/forge-neo/extensions/adapter-manifest")
    async def _forge_neo_extension_adapter_manifest():
        return extension_adapter_manifest()

    @app.get("/forge-neo/extensions/profile-catalog")
    async def _forge_neo_extension_profile_catalog():
        return extension_profile_catalog_payload()

    @app.get("/forge-neo/extensions/infinite-browsing-status")
    async def _forge_neo_infinite_browsing_status():
        return {
            "extension": INFINITE_BROWSING_EXTENSION,
            "available": infinite_browsing_available(),
            "mounted": bool(getattr(getattr(app, "state", None), "forge_neo_infinite_browsing_mounted", False)),
            "base": INFINITE_BROWSING_BASE,
            "error": infinite_browsing_mount_error(),
        }

    @app.get("/forge-neo/extensions/auto-photoshop-status")
    async def _forge_neo_auto_photoshop_status():
        mount_auto_photoshop_routes(app)
        return auto_photoshop_status_payload(app)

    @app.get("/forge-neo/extensions/aspect-ratio-helper-status")
    async def _forge_neo_aspect_ratio_helper_status():
        return aspect_ratio_helper_status_payload()

    @app.get("/forge-neo/extensions/aspect-ratio-helper-config")
    async def _forge_neo_aspect_ratio_helper_config():
        return aspect_ratio_helper_config_payload()

    @app.get(f"{CAMERA_ANGLE_SELECTOR_BASE}/view")
    async def _forge_neo_camera_angle_selector_view():
        path = _camera_angle_selector_view_path()
        if not camera_angle_selector_available() or not path.is_file():
            raise HTTPException(status_code=404, detail="Camera Angle Selector view is not available.")
        return FileResponse(path, media_type="text/html")

    @app.get("/forge-neo/extensions/camera-angle-selector-status")
    async def _forge_neo_camera_angle_selector_status():
        return camera_angle_selector_status_payload()

    @app.get("/forge-neo/extensions/camera-angle-selector-config")
    async def _forge_neo_camera_angle_selector_config():
        return camera_angle_selector_config_payload()

    @app.get("/forge-neo/extensions/civitai-helper-status")
    async def _forge_neo_civitai_helper_status():
        return civitai_helper_status_payload()

    @app.get("/forge-neo/extensions/storyboard-assistant-status")
    async def _forge_neo_storyboard_assistant_status():
        return storyboard_assistant_status_payload()

    @app.get("/forge-neo/extensions/aesthetic-enhancement-status")
    async def _forge_neo_aesthetic_enhancement_status():
        return aesthetic_enhancement_status_payload()

    @app.get("/forge-neo/extensions/multimodal-media-status")
    async def _forge_neo_multimodal_media_status():
        return multimodal_media_status_payload()

    @app.get("/forge-neo/extensions/qwen-vision-chat-status")
    async def _forge_neo_qwen_vision_chat_status():
        return qwen_vision_chat_status_payload()

    @app.get("/forge-neo/extensions/sam-matting-status")
    async def _forge_neo_sam_matting_status():
        return sam_matting_status_payload()

    @app.get("/forge-neo/extensions/see-through-status")
    async def _forge_neo_see_through_status():
        return see_through_status_payload()

    @app.get("/forge-neo/extensions/trellis2-status")
    async def _forge_neo_trellis2_status():
        return trellis2_status_payload()

    @app.get("/tagger/v1/interrogators")
    async def _wd14_interrogators():
        return {"models": wd14_interrogator_names()}

    @app.post("/tagger/v1/interrogate")
    async def _wd14_interrogate(request: Request):
        data = await _request_json(request)
        return wd14_interrogate_payload(data)

    @app.get("/adetailer/v1/version")
    async def _adetailer_version():
        return {"version": adetailer_version()}

    @app.get("/adetailer/v1/schema")
    async def _adetailer_schema():
        return adetailer_schema_payload()

    @app.get("/adetailer/v1/ad_model")
    async def _adetailer_ad_model():
        return {"ad_model": adetailer_model_names(include_none=False)}

    @app.get("/regional-prompter/v1/schema")
    async def _regional_prompter_schema():
        return regional_prompter_schema_payload()

    @app.get("/regional-prompter/v1/defaults")
    async def _regional_prompter_defaults():
        return {"script": REGIONAL_PROMPTER_SCRIPT_NAME, "args": regional_prompter_default_args()}

    @app.get("/forge-couple/v1/schema")
    async def _forge_couple_schema():
        return forge_couple_schema_payload()

    @app.get("/forge-couple/v1/defaults")
    async def _forge_couple_defaults():
        return {"script": FORGE_COUPLE_SCRIPT_NAME, "args": forge_couple_default_args()}

    @app.post("/tacapi/v1/refresh-temp-files")
    async def _tac_refresh_temp_files():
        prepare_extension_runtime_files()
        return {"ok": True}

    @app.post("/tacapi/v1/refresh-embeddings")
    async def _tac_refresh_embeddings():
        prepare_extension_runtime_files()
        return {"ok": True}

    @app.get("/tacapi/v1/lora-info/{lora_name}")
    async def _tac_lora_info(lora_name: str):
        return {"name": lora_name, "aliases": [], "hash": "NOFILE", "sha256": "NOFILE", "metadata": {}}

    @app.get("/tacapi/v1/lyco-info/{lyco_name}")
    async def _tac_lyco_info(lyco_name: str):
        return {"name": lyco_name, "aliases": [], "hash": "NOFILE", "sha256": "NOFILE", "metadata": {}}

    @app.get("/tacapi/v1/civitai-trigger-words/{lora_name}")
    async def _tac_civitai_trigger_words(lora_name: str):
        return {"name": lora_name, "keywords": []}

    @app.get("/tacapi/v1/lora-cached-hash/{lora_name}")
    async def _tac_lora_cached_hash(lora_name: str):
        return "NOFILE"

    @app.get("/tacapi/v1/thumb-preview/{filename:path}")
    async def _tac_thumb_preview(filename: str):
        return Response(status_code=404)

    @app.get("/tacapi/v1/thumb-preview-blob/{filename:path}")
    async def _tac_thumb_preview_blob(filename: str):
        return Response(status_code=404)

    @app.get("/tacapi/v1/wildcard-contents")
    async def _tac_wildcard_contents(basepath: str = "", filename: str = ""):
        return ""

    @app.get("/tacapi/v1/refresh-styles-if-changed")
    async def _tac_refresh_styles_if_changed():
        return {"changed": False}

    @app.post("/tacapi/v1/increase-use-count")
    async def _tac_increase_use_count(tagname: str = "", ttype: str = "", neg: bool = False):
        return {"result": 0}

    @app.get("/tacapi/v1/get-use-count")
    async def _tac_get_use_count(tagname: str = "", ttype: str = "", neg: bool = False):
        return {"result": 0}

    @app.post("/tacapi/v1/get-use-count-list")
    async def _tac_get_use_count_list(request: Request):
        await _request_json(request)
        return {"result": []}

    @app.put("/tacapi/v1/reset-use-count")
    async def _tac_reset_use_count(tagname: str = "", ttype: str = "", pos: int = 0, neg: int = 0):
        return {"result": 0}

    @app.get("/tacapi/v1/get-all-use-counts")
    async def _tac_get_all_use_counts():
        return {"result": []}

    @app.get("/physton_prompt/get_version")
    async def _physton_get_version():
        return {"version": "forge-neo-adapter", "latest_version": ""}

    @app.get("/physton_prompt/get_remote_versions")
    async def _physton_get_remote_versions(page: int = 1, per_page: int = 100):
        return {"versions": []}

    @app.get("/physton_prompt/get_config")
    async def _physton_get_config():
        root = _physton_root()
        return {
            "i18n": _json_file(root / "i18n.json", {}),
            "translate_apis": _mask_private_values(_json_file(root / "translate_apis.json", {})),
            "packages_state": [],
            "python": sys.executable,
        }

    @app.post("/physton_prompt/install_package")
    async def _physton_install_package(request: Request):
        return {"result": "Package installation is disabled in Forge Neo extension adapter."}

    @app.get("/physton_prompt/get_extensions")
    async def _physton_get_extensions():
        items = []
        if USER_EXTENSIONS_DIR.is_dir():
            items = [item.name for item in sorted(USER_EXTENSIONS_DIR.iterdir(), key=lambda value: value.name.lower()) if item.is_dir()]
        return {"extensions": items, "extends": items}

    @app.post("/physton_prompt/token_counter")
    async def _physton_token_counter(request: Request):
        data = await _request_json(request)
        return _token_count(data.get("text", ""))

    @app.get("/physton_prompt/get_data")
    async def _physton_get_data(key: str):
        return {"data": _mask_private_values(_storage_get(key))}

    @app.get("/physton_prompt/get_datas")
    async def _physton_get_datas(keys: str):
        rows = {}
        for key in [item for item in keys.split(",") if item]:
            rows[key] = _mask_private_values(_storage_get(key))
        return {"datas": rows}

    @app.post("/physton_prompt/set_data")
    async def _physton_set_data(request: Request):
        data = await _request_json(request)
        if "key" not in data:
            return {"success": False, "message": "key is required"}
        _storage_set(data["key"], data.get("data"))
        return {"success": True}

    @app.post("/physton_prompt/set_datas")
    async def _physton_set_datas(request: Request):
        data = await _request_json(request)
        rows = data.get("datas", data)
        if not isinstance(rows, dict):
            return {"success": False, "message": "datas must be a dict"}
        for key, value in rows.items():
            _storage_set(key, value)
        return {"success": True}

    @app.get("/physton_prompt/get_data_list_item")
    async def _physton_get_data_list_item(key: str, index: int):
        rows = _storage_list(key)
        return {"item": rows[index] if 0 <= int(index) < len(rows) else None}

    @app.post("/physton_prompt/push_data_list")
    async def _physton_push_data_list(request: Request):
        data = await _request_json(request)
        rows = _storage_list(data.get("key"))
        rows.append(data.get("item"))
        _save_storage_list(data.get("key"), rows)
        return {"success": True}

    @app.post("/physton_prompt/pop_data_list")
    async def _physton_pop_data_list(request: Request):
        data = await _request_json(request)
        rows = _storage_list(data.get("key"))
        item = rows.pop() if rows else None
        _save_storage_list(data.get("key"), rows)
        return {"success": True, "item": item}

    @app.post("/physton_prompt/shift_data_list")
    async def _physton_shift_data_list(request: Request):
        data = await _request_json(request)
        rows = _storage_list(data.get("key"))
        item = rows.pop(0) if rows else None
        _save_storage_list(data.get("key"), rows)
        return {"success": True, "item": item}

    @app.post("/physton_prompt/remove_data_list")
    async def _physton_remove_data_list(request: Request):
        data = await _request_json(request)
        rows = _storage_list(data.get("key"))
        index = int(data.get("index", -1))
        if 0 <= index < len(rows):
            rows.pop(index)
        _save_storage_list(data.get("key"), rows)
        return {"success": True}

    @app.post("/physton_prompt/clear_data_list")
    async def _physton_clear_data_list(request: Request):
        data = await _request_json(request)
        _save_storage_list(data.get("key"), [])
        return {"success": True}

    @app.get("/physton_prompt/get_histories")
    async def _physton_get_histories(type: str):
        histories = _history_items("history", type)
        favorite_ids = {str(item.get("id")) for item in _history_items("favorite", type)}
        for item in histories:
            item["is_favorite"] = str(item.get("id")) in favorite_ids
        return {"histories": histories}

    @app.get("/physton_prompt/get_favorites")
    async def _physton_get_favorites(type: str):
        return {"favorites": _history_items("favorite", type)}

    @app.post("/physton_prompt/push_history")
    async def _physton_push_history(request: Request):
        data = await _request_json(request)
        item_type = str(data.get("type", "txt2img"))
        rows = _history_items("history", item_type)
        rows.append(_new_history_item(data.get("tags"), data.get("prompt"), data.get("name", "")))
        _save_history_items("history", item_type, rows)
        return {"success": True}

    @app.post("/physton_prompt/push_favorite")
    async def _physton_push_favorite(request: Request):
        data = await _request_json(request)
        item_type = str(data.get("type", "txt2img"))
        rows = _history_items("favorite", item_type)
        rows.append(_new_history_item(data.get("tags"), data.get("prompt"), data.get("name", "")))
        _save_history_items("favorite", item_type, rows)
        return {"success": True}

    @app.post("/physton_prompt/move_up_favorite")
    async def _physton_move_up_favorite(request: Request):
        data = await _request_json(request)
        item_type = str(data.get("type", "txt2img"))
        rows = _history_items("favorite", item_type)
        success = False
        for index, item in enumerate(rows):
            if str(item.get("id")) == str(data.get("id")) and index > 0:
                rows[index - 1], rows[index] = rows[index], rows[index - 1]
                success = True
                break
        _save_history_items("favorite", item_type, rows)
        return {"success": success}

    @app.post("/physton_prompt/move_down_favorite")
    async def _physton_move_down_favorite(request: Request):
        data = await _request_json(request)
        item_type = str(data.get("type", "txt2img"))
        rows = _history_items("favorite", item_type)
        success = False
        for index, item in enumerate(rows):
            if str(item.get("id")) == str(data.get("id")) and index < len(rows) - 1:
                rows[index + 1], rows[index] = rows[index], rows[index + 1]
                success = True
                break
        _save_history_items("favorite", item_type, rows)
        return {"success": success}

    @app.get("/physton_prompt/get_latest_history")
    async def _physton_get_latest_history(type: str):
        rows = _history_items("history", type)
        return {"history": rows[-1] if rows else None}

    @app.post("/physton_prompt/set_history")
    async def _physton_set_history(request: Request):
        data = await _request_json(request)
        item_type = str(data.get("type", "txt2img"))
        rows = _history_items("history", item_type)
        item = _find_item(rows, data.get("id"))
        if item:
            item.update({"tags": data.get("tags"), "prompt": data.get("prompt"), "name": str(data.get("name", ""))})
        _save_history_items("history", item_type, rows)
        return {"success": bool(item)}

    @app.post("/physton_prompt/set_history_name")
    async def _physton_set_history_name(request: Request):
        data = await _request_json(request)
        item_type = str(data.get("type", "txt2img"))
        rows = _history_items("history", item_type)
        item = _find_item(rows, data.get("id"))
        if item:
            item["name"] = str(data.get("name", ""))
        _save_history_items("history", item_type, rows)
        return {"success": bool(item)}

    @app.post("/physton_prompt/set_favorite_name")
    async def _physton_set_favorite_name(request: Request):
        data = await _request_json(request)
        item_type = str(data.get("type", "txt2img"))
        rows = _history_items("favorite", item_type)
        item = _find_item(rows, data.get("id"))
        if item:
            item["name"] = str(data.get("name", ""))
        _save_history_items("favorite", item_type, rows)
        return {"success": bool(item)}

    @app.post("/physton_prompt/dofavorite")
    async def _physton_dofavorite(request: Request):
        data = await _request_json(request)
        item_type = str(data.get("type", "txt2img"))
        favorites = _history_items("favorite", item_type)
        if _find_item(favorites, data.get("id")):
            return {"success": False}
        history = _find_item(_history_items("history", item_type), data.get("id"))
        if history:
            favorites.append(dict(history))
            _save_history_items("favorite", item_type, favorites)
            return {"success": True}
        return {"success": False}

    @app.post("/physton_prompt/unfavorite")
    async def _physton_unfavorite(request: Request):
        data = await _request_json(request)
        item_type = str(data.get("type", "txt2img"))
        rows = [item for item in _history_items("favorite", item_type) if str(item.get("id")) != str(data.get("id"))]
        before = len(_history_items("favorite", item_type))
        _save_history_items("favorite", item_type, rows)
        return {"success": len(rows) != before}

    @app.post("/physton_prompt/delete_history")
    async def _physton_delete_history(request: Request):
        data = await _request_json(request)
        item_type = str(data.get("type", "txt2img"))
        rows = [item for item in _history_items("history", item_type) if str(item.get("id")) != str(data.get("id"))]
        before = len(_history_items("history", item_type))
        _save_history_items("history", item_type, rows)
        return {"success": len(rows) != before}

    @app.post("/physton_prompt/delete_histories")
    async def _physton_delete_histories(request: Request):
        data = await _request_json(request)
        _save_history_items("history", str(data.get("type", "txt2img")), [])
        return {"success": True}

    @app.post("/physton_prompt/translate")
    async def _physton_translate(request: Request):
        data = await _request_json(request)
        return _physton_translate_payload(data)

    @app.post("/physton_prompt/translates")
    async def _physton_translates(request: Request):
        data = await _request_json(request)
        return _physton_translate_payload(data, batch=True)

    @app.get("/physton_prompt/get_csvs")
    async def _physton_get_csvs():
        return {"csvs": _csv_entries()}

    @app.get("/physton_prompt/get_csv")
    async def _physton_get_csv(key: str):
        path = _csv_path_from_key(key)
        if not path:
            return Response(status_code=404)
        return FileResponse(path, media_type="text/csv", filename=path.name)

    @app.get("/physton_prompt/styles")
    async def _physton_styles(file: str, hash: str = ""):
        path = _safe_join(_physton_styles_root(), file)
        if not path:
            return Response(status_code=404)
        media_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        return FileResponse(path, media_type=media_type, filename=path.name)

    @app.get("/physton_prompt/get_extension_css_list")
    async def _physton_get_extension_css_list():
        return {"css_list": _extension_css_list()}

    @app.get("/physton_prompt/get_extra_networks")
    async def _physton_get_extra_networks():
        return {
            "extra_networks": [
                {"name": "textual inversion", "title": "Textual Inversion", "items": []},
                {"name": "lora", "title": "Lora", "items": []},
                {"name": "lycoris", "title": "LyCORIS", "items": []},
                {"name": "hypernetworks", "title": "Hypernetworks", "items": []},
            ]
        }

    @app.post("/physton_prompt/gen_openai")
    async def _physton_gen_openai(request: Request):
        return _response_not_configured("OpenAI prompt generation is not configured in Forge Neo.")

    @app.post("/physton_prompt/mbart50_initialize")
    async def _physton_mbart50_initialize(request: Request):
        return _response_not_configured("MBart50 is not configured in Forge Neo.")

    @app.get("/physton_prompt/get_group_tags")
    async def _physton_get_group_tags(lang: str):
        return {"tags": _group_tags(lang)}


def adapter_status_html(lang: object | None = None) -> str:
    active = active_prompt_extension_names()
    active_adapters = active_adapter_extension_names()
    if active:
        names = ", ".join(html.escape(name) for name in active)
    else:
        names = html.escape("None")
    adapter_names = ", ".join(html.escape(name) for name in active_adapters) if active_adapters else html.escape("None")
    return (
        '<div class="forge-neo-extension-adapter-status">'
        f"<p>Forge Neo prompt extension adapter: {names}</p>"
        f"<p>Forge Neo API/generation adapters: {adapter_names}</p>"
        f"<p>Auto complete extension is not loaded: {html.escape(AUTO_COMPLETE_EXTENSION)}</p>"
        "</div>"
    )


def extension_adapter_signature() -> str:
    payload = json.dumps(extension_adapter_manifest(), sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]
