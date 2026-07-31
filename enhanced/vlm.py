import os
import gc
import json
import re
import base64
import io
import torch
import shared
import threading
import numpy as np
import modules.config as config
import modules.flags as flags
import modules.prompt_actions as prompt_actions
import enhanced.translator as translator
import enhanced.superprompter as superprompter
import ldm_patched.modules.model_management
import modules.default_pipeline as pipeline
import enhanced.all_parameters as ads
from modules.model_path_utils import find_model_in_dirs, first_model_dir
import logging
from enhanced.llamacpp_vlm import llamacpp_vlm
from enhanced.comfy_textgen_vlm import comfy_textgen_vlm
from enhanced.logger import format_name
logger = logging.getLogger(format_name(__name__))

from PIL import Image, ImageOps
from transformers import AutoTokenizer, AutoModel
from modules.util import HWC3, resize_image, is_chinese
from enhanced.simpleai import comfyd, p2p_task
from modules.custom_llm_api import (
    OPENAI_CHAT_COMPLETIONS,
    api_format_supported,
    custom_llm_url,
    extract_response_text,
    models_url,
    prepare_completion_request,
    request_json,
)

DEFAULT_VLM_VERSION = "Qwen3.5-9B-abliterated-Q4_K_M"
CUSTOM_VLM_IMAGE_MAX_SIDE = 1688
CUSTOM_VLM_IMAGE_JPEG_QUALITY = 85
HUIHUI_QWEN35_MODEL_DIR = "Huihui-Qwen3.5-9B-abliterated"
HUIHUI_QWEN35_MODELSCOPE_BASE = (
    "https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/"
    "SimpleModels/LLM/Huihui-Qwen3.5-9B-abliterated"
)
HUIHUI_QWEN35_MMPROJ = "Huihui-Qwen3.5-9B-abliterated.mmproj-Q8_0.gguf"
GEMMA4_HERETIC_MODEL_DIR = "gemma-4-12B-it-heretic"
GEMMA4_HERETIC_MODELSCOPE_BASE = (
    "https://modelscope.cn/models/SC117/gemma-4-12B-it-heretic-QAT-GGUF/resolve/master"
)
GEMMA4_HERETIC_GGUF = "gemma-4-12B-it-heretic-QAT-UD-Q4_K_XL.gguf"
GEMMA4_HERETIC_MMPROJ = "mmproj-BF16.gguf"
COMFY_GEMMA3_12B_FILE = "gemma_3_12B_it_fpmixed.safetensors"
COMFY_QWEN3VL_4B_FILE = "qwen3vl_4b_fp8_scaled.safetensors"


def _safe_stop_comfyd_for_vlm():
    try:
        comfyd.stop()
    except ValueError as exc:
        if "closed file" not in str(exc).lower():
            raise
        try:
            logger.warning("Ignored Comfyd stop output error during VLM setup: %s", exc)
        except Exception:
            pass


def _huihui_qwen35_vlm_config(quant):
    gguf_file = f"Huihui-Qwen3.5-9B-abliterated.{quant}.gguf"
    return {
        "model": HUIHUI_QWEN35_MODEL_DIR,
        "chat_handler": "Qwen3.5",
        "gguf_file": gguf_file,
        "mmproj_file": HUIHUI_QWEN35_MMPROJ,
        "n_ctx": 8192,
        "model_urls": {
            gguf_file: f"{HUIHUI_QWEN35_MODELSCOPE_BASE}/{gguf_file}",
            HUIHUI_QWEN35_MMPROJ: f"{HUIHUI_QWEN35_MODELSCOPE_BASE}/{HUIHUI_QWEN35_MMPROJ}",
        },
        "is_llamacpp": True,
        "backend": "llamacpp",
        "source_catalog": "LLM",
        "architecture": "qwen3.5",
        "capabilities": ["text", "image"],
        "recommended": True,
    }


def _gemma4_heretic_vlm_config():
    return {
        "label": "Gemma 4 12B Heretic Q4_K_XL",
        "model": GEMMA4_HERETIC_MODEL_DIR,
        "chat_handler": "Gemma4",
        "gguf_file": GEMMA4_HERETIC_GGUF,
        "mmproj_file": GEMMA4_HERETIC_MMPROJ,
        "n_ctx": 8192,
        "model_urls": {
            GEMMA4_HERETIC_GGUF: f"{GEMMA4_HERETIC_MODELSCOPE_BASE}/{GEMMA4_HERETIC_GGUF}",
            GEMMA4_HERETIC_MMPROJ: f"{GEMMA4_HERETIC_MODELSCOPE_BASE}/{GEMMA4_HERETIC_MMPROJ}",
        },
        "is_llamacpp": True,
        "backend": "llamacpp",
        "source_catalog": "LLM",
        "architecture": "gemma4",
        "capabilities": ["text", "image"],
        "recommended": True,
    }


def _comfy_textgen_vlm_config(label, clip_name, clip_type, architecture, model_url, model_size):
    return {
        "label": label,
        "model": clip_name,
        "model_file": clip_name,
        "clip_name": clip_name,
        "clip_type": clip_type,
        "backend": "comfy_textgen",
        "source_catalog": "text_encoders",
        "architecture": architecture,
        "capabilities": ["text", "image"],
        "n_ctx": 32768,
        "model_url": model_url,
        "model_size": int(model_size),
        "is_llamacpp": False,
        "recommended": True,
    }


def _superprompt_first_text(*values):
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _superprompt_scene_value(state, theme, key, default=""):
    try:
        return flags.get_value_by_scene_theme(state if isinstance(state, dict) else {}, theme, key, default)
    except Exception:
        return default


def _superprompt_target_key(backend_engine, task_method, target_text):
    haystack = f"{backend_engine} {task_method} {target_text}".lower()
    if "anima" in haystack:
        return "anima_aio"
    if any(token in haystack for token in (
        "il_v_pre", "illustrious", "chenkin", "noob", "newbie",
        "pony", "animagine", "sd15_aio",
    )):
        return "sdxl_danbooru"
    if "flux" in haystack:
        return "flux_t5_en"
    if "wan" in haystack or "video" in haystack or any(token in haystack for token in ("t2v", "i2v", "v2v", "av2v", "ltx")):
        return "wan_video_cn"
    if "qwen" in haystack:
        return "qwen_natural"
    if "t5" in haystack:
        return "flux_t5_en"
    if "_cn" in haystack or "中文" in haystack or "chinese" in haystack:
        return "natural_zh"
    return "natural_en"


def _superprompt_target_from_state(state):
    state = state if isinstance(state, dict) else {}
    scene_frontend = state.get("scene_frontend") if isinstance(state.get("scene_frontend"), dict) else {}
    theme = _superprompt_first_text(
        state.get("scene_theme"),
        state.get("__scene_theme"),
        scene_frontend.get("theme", [""])[0] if isinstance(scene_frontend.get("theme"), list) and scene_frontend.get("theme") else "",
    )
    backend_engine = _superprompt_first_text(
        state.get("backend_engine"),
        state.get("__backend_engine"),
        state.get("engine"),
        config.backend_engine,
    )
    task_method = _superprompt_first_text(
        _superprompt_scene_value(state, theme, "task_method", "") if scene_frontend else "",
        state.get("task_method"),
    )
    label = _superprompt_first_text(
        theme,
        state.get("__preset"),
        state.get("preset"),
        scene_frontend.get("theme_title") if isinstance(scene_frontend, dict) else "",
        backend_engine,
    )
    prompt_format = _superprompt_first_text(
        _superprompt_scene_value(state, theme, "prompt_format", "") if scene_frontend else "",
        state.get("prompt_format"),
    )
    text_encoder = _superprompt_first_text(
        _superprompt_scene_value(state, theme, "text_encoder", "") if scene_frontend else "",
        state.get("text_encoder"),
        state.get("clip_model"),
    )
    model_hint = _superprompt_first_text(
        state.get("base_model"),
        state.get("checkpoint"),
        state.get("default_model"),
        state.get("model"),
    )
    target_text = " ".join(
        item
        for item in (label, prompt_format, text_encoder, model_hint, str(scene_frontend.get("theme_title") or ""))
        if str(item or "").strip()
    )
    target_key = _superprompt_target_key(backend_engine, task_method, target_text)
    target = {
        "key": target_key,
        "label": label,
        "name": label,
        "backend_engine": backend_engine,
        "task_method": task_method,
        "text_encoder": text_encoder,
        "prompt_format": prompt_format,
        "source": "main_webui_superprompt",
    }
    capability = prompt_actions.prompt_action_capability_from_state(state)
    if capability:
        target["director_capability"] = capability
    if model_hint:
        target["model_list"] = [model_hint]
    agent_prompt = _superprompt_scene_value(state, theme, "agent_prompt", "") if scene_frontend else ""
    return target, str(agent_prompt or "").strip()


def _superprompt_payload_from_state(state, target_override=None, use_scene_agent_prompt=True):
    target, agent_prompt = _superprompt_target_from_state(state)
    if isinstance(target_override, dict) and target_override:
        target = dict(target_override)
        target.setdefault("source", "main_webui_prompt_action")
    if not use_scene_agent_prompt:
        agent_prompt = ""
    return {
        "project_id": "main_webui",
        "node_id": "canvas_agent_prompt_rewrite:main_webui_superprompt",
        "agent_context": {
            "prompt_generation_targets": {
                "text_to_image": target,
            },
        },
    }, agent_prompt


def _superprompt_image_input(input_images):
    if isinstance(input_images, (list, tuple)):
        images = [image for image in input_images if image is not None]
        if not images:
            return None
        supports_multiple = VLM.is_llamacpp or VLM.backend == "comfy_textgen" or VLM.is_custom_version()
        return images if supports_multiple and len(images) > 1 else images[0]
    return input_images


def _superprompt_action_target_override(action, options, state):
    action = action if isinstance(action, dict) else {}
    options = options if isinstance(options, dict) else {}
    target_kind = str(action.get("target_kind") or "").strip().lower()
    if target_kind == "danbooru":
        return {
            "key": "sdxl_danbooru",
            "label": "Prompt Action / Danbooru Tags",
            "name": "Prompt Action / Danbooru Tags",
            "backend_engine": "PromptAction",
            "task_method": "natural_to_tags",
            "text_encoder": "clip",
            "prompt_format": "danbooru_tags_en",
            "source": "main_webui_prompt_action",
        }
    if target_kind == "natural":
        language = str(options.get("language") or "auto").strip().lower()
        if language == "auto":
            state_data = state if isinstance(state, dict) else {}
            language_hint = str(state_data.get("__lang") or state_data.get("lang") or "cn").lower()
            language = "en" if language_hint.startswith("en") else "cn"
        is_english = language in {"en", "eng", "english"}
        return {
            "key": "natural_en" if is_english else "natural_zh",
            "label": "Prompt Action / Natural Language",
            "name": "Prompt Action / Natural Language",
            "backend_engine": "PromptAction",
            "task_method": "tags_to_natural_en" if is_english else "tags_to_natural_cn",
            "text_encoder": "natural_language",
            "prompt_format": "natural_en" if is_english else "natural_zh",
            "source": "main_webui_prompt_action",
        }
    return None


def _superprompt_prompt_from_json_object(data):
    if not isinstance(data, dict):
        return ""
    for key in ("final_prompt", "prompt", "positive_prompt", "recommended_prompt", "Rewritten", "rewritten", "text"):
        value = str(data.get(key) or "").strip()
        if value:
            return value
    return ""


def _superprompt_extract_json_prompt(text):
    source = str(text or "")
    if "{" not in source:
        return ""
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", source):
        try:
            data, _ = decoder.raw_decode(source, match.start())
        except Exception:
            continue
        prompt = _superprompt_prompt_from_json_object(data)
        if prompt:
            return prompt
    return ""


def _superprompt_clean_output(text, fallback=""):
    output = str(text or "").strip()
    for prefix in getattr(VLM, "remove_prefixs", []):
        if output.startswith(prefix):
            output = output[len(prefix):].strip()
    if output.startswith("```"):
        output = re.sub(r"^```(?:json|text|prompt)?\s*", "", output, flags=re.I).strip()
        output = re.sub(r"\s*```$", "", output).strip()
    output = re.sub(r"(?is)<think\b[^>]*>.*?</think>", "", output).strip()
    json_prompt = _superprompt_extract_json_prompt(output)
    if json_prompt:
        output = json_prompt
    else:
        label_matches = list(
            re.finditer(
                r"(?im)^\s*(?:final\s+prompt|positive\s+prompt|rewritten|output)\s*[:：]\s*",
                output,
            )
        )
        if label_matches:
            output = output[label_matches[-1].end():].strip()
        elif re.match(r"(?is)^\s*(?:thinking\s+process|analysis|reasoning|chain[-\s]*of[-\s]*thought)\s*[:：]", output):
            return str(fallback or "").strip()
        elif re.match(r"(?is)^\s*<think\b", output):
            return str(fallback or "").strip()
    output = re.sub(
        r"(?is)^\s*(?:final\s+prompt|prompt|positive\s+prompt|rewritten|output)\s*[:：]\s*",
        "",
        output,
    ).strip()
    if len(output) >= 2 and output[0] == output[-1] and output[0] in {'"', "'"}:
        output = output[1:-1].strip()
    return output or str(fallback or "").strip()


def _custom_llm_url(base_url, suffix):
    return custom_llm_url(base_url, suffix)


def _custom_llm_request_json(url, payload=None, api_key="", method="POST", timeout=120):
    return request_json(url, payload, api_key=api_key, method=method, timeout=timeout)


def _extract_openai_compatible_text(response):
    return extract_response_text(response)


def _custom_vlm_image_to_data_url(image):
    if image is None:
        return ""
    if isinstance(image, str) and os.path.exists(image):
        try:
            with Image.open(image) as source:
                pil_image = ImageOps.exif_transpose(source).copy()
        except Exception:
            return ""
    elif isinstance(image, np.ndarray):
        pil_image = Image.fromarray(HWC3(image))
    elif isinstance(image, Image.Image):
        pil_image = ImageOps.exif_transpose(image).copy()
    else:
        return ""

    if pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")
    width, height = pil_image.size
    longest_side = max(width, height)
    if longest_side > CUSTOM_VLM_IMAGE_MAX_SIDE:
        scale = CUSTOM_VLM_IMAGE_MAX_SIDE / float(longest_side)
        target = (max(1, round(width * scale)), max(1, round(height * scale)))
        resampling = getattr(Image, "Resampling", Image).LANCZOS
        pil_image = pil_image.resize(target, resampling)

    buffer = io.BytesIO()
    pil_image.save(
        buffer,
        format="JPEG",
        quality=CUSTOM_VLM_IMAGE_JPEG_QUALITY,
        optimize=True,
    )
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def _custom_vlm_image_data_urls(image):
    images = image if isinstance(image, (list, tuple)) else [image]
    urls = []
    for item in images:
        if item is None:
            continue
        url = _custom_vlm_image_to_data_url(item)
        if url:
            urls.append(url)
    return urls


class VLM:
    prompt_i2t = "Write a highly detailed and descriptive caption for this image. Output only the caption text without any preamble or explanation."
    output_chinese = "and output it in Chinese. Only provide the Chinese text, no other explanation."
    prompt_extend = "Expand the following description to obtain a descriptive caption with more details in image. Output only the expanded description without any preamble or explanation: "
    prompt_translator = "Translate the following text into English. Output only the translation itself, no other text or explanation:"
    prompt_translator_cn = "Translate the following text into Chinese. Output only the translation itself, no other text or explanation:"
    prompt_tts_style_director = (
        "You are an expert AI Voice Director specialized in acoustic traits and dramatic performance. "
        "Your task is to write extremely high-precision natural-language Style Instruction prompts for Qwen3-TTS.\n\n"
        "Goal:\n"
        "- Convert the user's short description into one coherent, extremely detailed instruction that covers physiology, emotion, vocal technique, and inner psychology.\n\n"
        "Knowledge:\n"
        "- Control dimensions: gender, age, vocal range, timbre texture, speaking rate, pitch contour.\n"
        "- Micro-details: breath support, vowel tension, throatiness, vocal fry, etc.\n"
        "- Emotion/psychology: go beyond labels; describe nuanced mental states.\n\n"
        "Constraints:\n"
        "- Output must be a single coherent natural-language paragraph (Chinese or English).\n"
        "- If user did not specify language, prefer English for precision.\n"
        "- Must include both physiology and psychology.\n"
        "- Only output the instruction itself; no explanations.\n\n"
        "Few-shot:\n"
        "User Input: 一个紧张的年轻男生。\n"
        'Output: "Male, 17 years old, tenor range, gaining confidence - deeper breath support now, though vowels still tighten when nervous."\n\n'
        "User Input: 一个撒娇的二次元萝莉。\n"
        'Output: "体现撒娇稚嫩的萝莉女声，音调偏高且起伏明显，营造出黏人、做作又刻意卖萌的听觉效果。"\n\n'
        "User Input: 极度愤怒并带着哭腔。\n"
        'Output: "Speak in a very angry tone, shouting, fast paced, with unstable breath and cracking voice, as if holding back tears of frustration."\n'
    )

    DEFAULT_VERSION = DEFAULT_VLM_VERSION
    CUSTOM_VERSION = "Custom"

    # Version configuration.
    VERSIONS = {
        "Qwen3.5-9B-abliterated-Q4_K_M": _huihui_qwen35_vlm_config("Q4_K_M"),
        "Qwen3.5-9B-abliterated-Q2_K": _huihui_qwen35_vlm_config("Q2_K"),
        "Qwen3.5-9B-abliterated-Q6_K": _huihui_qwen35_vlm_config("Q6_K"),
        "Qwen3.5-9B-abliterated-Q8_0": _huihui_qwen35_vlm_config("Q8_0"),
        "Gemma4-12B-it-heretic-Q4_K_XL": _gemma4_heretic_vlm_config(),
        "Gemma3-12B-TextEncoder": _comfy_textgen_vlm_config(
            "Gemma 3 12B · Reuse Text Encoder",
            COMFY_GEMMA3_12B_FILE,
            "ltxv",
            "gemma3_12b",
            "https://www.modelscope.cn/models/Comfy-Org/ltx-2/resolve/master/split_files/text_encoders/gemma_3_12B_it_fpmixed.safetensors",
            13708659515,
        ),
        "Qwen3VL-4B-TextEncoder": _comfy_textgen_vlm_config(
            "Qwen 3 VL 4B · Reuse Text Encoder",
            COMFY_QWEN3VL_4B_FILE,
            "krea2",
            "qwen3vl_4b",
            "https://modelscope.cn/models/Comfy-Org/Krea-2/resolve/master/text_encoders/qwen3vl_4b_fp8_scaled.safetensors",
            5242467968,
        ),
    }

    # 运行时参数（由 set_version 统一管理）
    model = ""
    model_file = ""
    model_url = None
    model_urls = {}
    backend = ""
    source_catalog = ""
    is_llamacpp = False
    chat_handler = ""
    gguf_file = ""
    mmproj_file = ""
    clip_name = ""
    clip_type = ""
    capabilities = ["text"]
    n_ctx = 8192
    image_min_tokens = 0
    image_max_tokens = 0
    current_version = ""
    custom_api_name = "Custom"
    custom_api_format = OPENAI_CHAT_COMPLETIONS
    custom_base_url = ""
    custom_model = ""
    custom_api_key = ""
    custom_supports_images = True

    remove_prefixs = [
        'A descriptive caption for this image could be: "',
        '"',
        ]

    lock = threading.Lock()
    model_runtime = None
    tokenizer = None
    enable = True
    bf16_support = ( torch.cuda.is_available() and torch.cuda.get_device_capability(torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu"))[0] >= 8 )

    # 状态标记
    is_processing = False
    processing_lock = threading.Lock()

    @classmethod
    def resolve_version(cls, version):
        if not version or version == 'None':
            return cls.DEFAULT_VERSION
        version = str(version).strip()
        if version == cls.CUSTOM_VERSION:
            return cls.CUSTOM_VERSION
        if version in cls.VERSIONS:
            return version
        if isinstance(version, str) and version.endswith("-Thinking"):
            base_version = version[:-len("-Thinking")]
            if base_version in cls.VERSIONS:
                return base_version
        try:
            item = cls.get_version_catalog_item(version)
            if item:
                return str(item.get("id") or version)
        except Exception:
            pass
        if version.startswith(("llamacpp:", "comfy:")):
            return version
        return cls.DEFAULT_VERSION

    @classmethod
    def _text_encoder_roots(cls):
        roots = []
        for value in (config.paths_text_encoders, config.paths_clip):
            if isinstance(value, (list, tuple, set)):
                roots.extend(value)
            elif value:
                roots.append(value)
        return roots

    @classmethod
    def get_model_catalog(cls, refresh=False):
        from modules.vlm_model_catalog import build_model_catalog

        return build_model_catalog(
            curated_configs=cls.VERSIONS,
            default_version=cls.DEFAULT_VERSION,
            custom_version=cls.CUSTOM_VERSION,
            llm_roots=config.paths_LLM,
            text_encoder_roots=cls._text_encoder_roots(),
            refresh=refresh,
        )

    @classmethod
    def get_version_catalog_item(cls, version, refresh=False):
        from modules.vlm_model_catalog import catalog_item

        return catalog_item(cls.get_model_catalog(refresh=refresh), version)

    @classmethod
    def get_version_config(cls, version):
        if version in cls.VERSIONS:
            return cls.VERSIONS[version]
        if isinstance(version, str) and version.endswith("-Thinking"):
            base_version = version[:-len("-Thinking")]
            if base_version in cls.VERSIONS:
                return cls.VERSIONS[base_version]
        item = cls.get_version_catalog_item(version)
        runtime_config = item.get("runtime_config") if isinstance(item, dict) else None
        return runtime_config if isinstance(runtime_config, dict) and runtime_config else None

    @classmethod
    def is_custom_version(cls, version=None):
        return str(version if version is not None else cls.current_version or "").strip() == cls.CUSTOM_VERSION

    @classmethod
    def set_custom_config(
        cls,
        api_name=None,
        base_url=None,
        model=None,
        api_key=None,
        api_format=None,
        supports_images=None,
    ):
        with cls.lock:
            if api_name is not None:
                cls.custom_api_name = str(api_name or "").strip() or "Custom"
            if base_url is not None:
                cls.custom_base_url = str(base_url or "").strip()
            if model is not None:
                cls.custom_model = str(model or "").strip()
            if api_key is not None:
                cls.custom_api_key = str(api_key or "").strip()
            if api_format is not None:
                cls.custom_api_format = str(api_format or "openai_compatible").strip() or "openai_compatible"
            if supports_images is not None:
                cls.custom_supports_images = bool(supports_images)

    @classmethod
    def get_custom_settings(cls):
        return {
            "api_name": cls.custom_api_name,
            "api_format": cls.custom_api_format,
            "base_url": cls.custom_base_url,
            "model": cls.custom_model,
            "api_key": cls.custom_api_key,
            "supports_images": cls.custom_supports_images,
        }

    @classmethod
    def get_custom_missing_settings(cls):
        missing = []
        if not str(cls.custom_base_url or "").strip():
            missing.append("API Base URL")
        if not str(cls.custom_model or "").strip():
            missing.append("Model")
        if not api_format_supported(cls.custom_api_format):
            missing.append(f"Unsupported API format: {cls.custom_api_format}")
        return missing

    @classmethod
    def custom_config_ready(cls):
        return not cls.get_custom_missing_settings()

    @classmethod
    def set_version(cls, version):
        original_version = version
        version = cls.resolve_version(version)

        if cls.is_custom_version(version):
            with cls.lock:
                cls.current_version = cls.CUSTOM_VERSION
                cls.model = ""
                cls.model_file = ""
                cls.model_url = None
                cls.model_urls = {}
                cls.backend = "custom_api"
                cls.source_catalog = "custom"
                cls.is_llamacpp = False
                cls.chat_handler = ""
                cls.gguf_file = ""
                cls.mmproj_file = ""
                cls.clip_name = ""
                cls.clip_type = ""
                cls.capabilities = ["text", "image"] if cls.custom_supports_images else ["text"]
            logger.debug("设置 VLM 模型: 版本=Custom, backend=%s", cls.custom_api_format)
            return

        config_data = cls.get_version_config(version)
        if not config_data:
            if str(version).startswith(("llamacpp:", "comfy:")):
                with cls.lock:
                    cls.current_version = str(version)
                    cls.model = ""
                    cls.model_file = ""
                    cls.model_url = None
                    cls.model_urls = {}
                    cls.backend = ""
                    cls.source_catalog = ""
                    cls.is_llamacpp = False
                    cls.chat_handler = ""
                    cls.gguf_file = ""
                    cls.mmproj_file = ""
                    cls.clip_name = ""
                    cls.clip_type = ""
                    cls.capabilities = ["text"]
                    cls.n_ctx = 8192
                    cls.image_min_tokens = 0
                    cls.image_max_tokens = 0
                logger.warning("Selected local VLM model is unavailable: %s", version)
                return
            logger.warning(f"Unknown VLM version: {original_version}. Falling back to {cls.DEFAULT_VERSION}")
            version = cls.DEFAULT_VERSION
            config_data = cls.VERSIONS[version]

        with cls.lock:
            cls.current_version = version
            cls.model = config_data["model"]
            cls.backend = str(config_data.get("backend") or ("llamacpp" if config_data.get("is_llamacpp") else "transformers"))
            cls.source_catalog = str(config_data.get("source_catalog") or "")
            cls.is_llamacpp = config_data.get("is_llamacpp", False)
            cls.chat_handler = config_data.get("chat_handler", "")
            cls.gguf_file = config_data.get("gguf_file", "")
            cls.mmproj_file = config_data.get("mmproj_file", "")
            cls.clip_name = config_data.get("clip_name", "")
            cls.clip_type = config_data.get("clip_type", "")
            cls.capabilities = list(config_data.get("capabilities") or ["text"])
            cls.n_ctx = int(config_data.get("n_ctx", 8192) or 8192)
            cls.image_min_tokens = int(config_data.get("image_min_tokens", 0) or 0)
            cls.image_max_tokens = int(config_data.get("image_max_tokens", 0) or 0)
            cls.model_url = config_data.get("model_url")
            cls.model_urls = config_data.get("model_urls", {})
            model_file_name = config_data.get("model_file")
            if cls.backend in ("llamacpp", "comfy_textgen") and model_file_name:
                cls.model_file = str(model_file_name)
            elif model_file_name:
                cls.model_file = os.path.join(cls.model, model_file_name)
            else:
                cls.model_file = os.path.join(cls.model, cls.model)

            logger.debug(f"设置 VLM 模型: 版本={version}, 模型路径={cls.model}, is_llamacpp={cls.is_llamacpp}")

    def __init__(self):
        pass

    @classmethod
    def set_enable(cls, flag):
        with cls.lock:
            cls.enable = True

    @classmethod
    def get_enable(cls):
        return True

    @classmethod
    def get_version_missing_files(cls, version):
        original_version = str(version or "").strip()
        if original_version and original_version != cls.CUSTOM_VERSION and not cls.get_version_config(original_version):
            return ["Unknown or removed VLM model"]
        version = cls.resolve_version(version)
        if cls.is_custom_version(version):
            return cls.get_custom_missing_settings()
        config_data = cls.get_version_config(version)
        if not config_data:
            return []

        model_name = config_data.get("model") or version
        missing = []
        backend = str(config_data.get("backend") or ("llamacpp" if config_data.get("is_llamacpp") else "transformers"))
        if backend == "comfy_textgen":
            clip_name = str(config_data.get("clip_name") or config_data.get("model_file") or model_name)
            if not find_model_in_dirs(cls._text_encoder_roots(), clip_name):
                missing.append(clip_name.replace("\\", "/"))
            return missing
        model_urls = config_data.get("model_urls") or {}
        if model_urls:
            for file_name in model_urls:
                rel_path = os.path.join(model_name, file_name)
                if not find_model_in_dirs(config.paths_LLM, rel_path):
                    missing.append(rel_path.replace("\\", "/"))
            return missing

        model_file_name = config_data.get("model_file")
        if backend == "llamacpp" and model_file_name:
            rel_path = str(model_file_name)
        else:
            rel_path = os.path.join(model_name, model_file_name) if model_file_name else os.path.join(model_name, model_name)
        search_dirs = config.paths_LLM if backend == "llamacpp" else config.paths_llms
        if not find_model_in_dirs(search_dirs, rel_path):
            missing.append(rel_path.replace("\\", "/"))
        mmproj_file = str(config_data.get("mmproj_file") or "").strip()
        if backend == "llamacpp" and mmproj_file and not find_model_in_dirs(search_dirs, mmproj_file):
            missing.append(mmproj_file.replace("\\", "/"))
        return missing

    @classmethod
    def model_exists_for_version(cls, version):
        original_version = str(version or "").strip()
        if original_version and original_version != cls.CUSTOM_VERSION and not cls.get_version_config(original_version):
            return False
        version = cls.resolve_version(version)
        if cls.is_custom_version(version):
            return cls.custom_config_ready()
        return len(cls.get_version_missing_files(version)) == 0

    @classmethod
    def get_version_status(cls, version):
        original_version = str(version or "").strip()
        if original_version and original_version != cls.CUSTOM_VERSION and not cls.get_version_config(original_version):
            return {
                "version": original_version,
                "exists": False,
                "icon": "⚠",
                "label": "Unavailable",
                "missing_files": ["Unknown or removed VLM model"],
            }
        version = cls.resolve_version(version)
        if cls.is_custom_version(version):
            missing = cls.get_custom_missing_settings()
            exists = not missing
            return {
                "version": cls.CUSTOM_VERSION,
                "exists": exists,
                "icon": "✓" if exists else "⚠",
                "label": "Ready" if exists else "Missing",
                "missing_files": missing,
            }
        config_data = cls.get_version_config(version)
        if not config_data:
            return {
                "version": str(version or ""),
                "exists": False,
                "icon": "⚠",
                "label": "Unavailable",
                "missing_files": ["Unknown or removed VLM model"],
            }
        missing_files = cls.get_version_missing_files(version)
        exists = len(missing_files) == 0
        return {
            "version": version,
            "exists": exists,
            "icon": "✓" if exists else "⚠",
            "label": "Ready" if exists else "Missing",
            "missing_files": missing_files,
        }

    @classmethod
    def ensure_model_files_ready(cls, version=None):
        original_version = str(version or cls.current_version or cls.DEFAULT_VERSION).strip()
        if original_version and original_version != cls.CUSTOM_VERSION and not cls.get_version_config(original_version):
            raise RuntimeError(f"Unknown or removed VLM model: {original_version}")
        version = cls.resolve_version(version or cls.current_version or cls.DEFAULT_VERSION)
        if cls.is_custom_version(version):
            if not cls.custom_config_ready():
                missing = ", ".join(cls.get_custom_missing_settings())
                raise RuntimeError(f"Custom VLM settings incomplete: {missing}")
            return True
        missing = cls.get_version_missing_files(version)
        if missing:
            shown = ", ".join(missing[:3])
            if len(missing) > 3:
                shown += f", +{len(missing) - 3} more"
            raise RuntimeError(f"VLM model files are missing: {shown}. Open the model download panel before running.")
        return True

    @classmethod
    def set_processing_status(cls, status):
        with cls.processing_lock:
            previous_status = cls.is_processing
            cls.is_processing = status
            if previous_status != status:
                logger.debug(f"VLM processing status changed to: {'processing' if status else 'idle'}")

    @classmethod
    def get_processing_status(cls):
        with cls.processing_lock:
            return cls.is_processing
    def load_model(self, download=False):
        if VLM.is_custom_version():
            return
        if VLM.backend == "comfy_textgen":
            return
        if VLM.is_llamacpp:
            model_dir = ""
            resolved_gguf_path = None
            if VLM.gguf_file:
                resolved_gguf_path = find_model_in_dirs(config.paths_LLM, os.path.join(VLM.model, VLM.gguf_file))
                if resolved_gguf_path:
                    model_dir = os.path.dirname(resolved_gguf_path)

            # Check for multi-file download (Qwen3-VL style)
            if VLM.model_urls:
                if not model_dir:
                    model_dir = os.path.join(first_model_dir(config.paths_LLM), VLM.model)
                    existing_model_file = next(iter(VLM.model_urls.keys()), "")
                    existing_model_path = find_model_in_dirs(config.paths_LLM, os.path.join(VLM.model, existing_model_file)) if existing_model_file else None
                    if existing_model_path:
                        model_dir = os.path.dirname(existing_model_path)
                if not os.path.exists(model_dir):
                    os.makedirs(model_dir, exist_ok=True)

                all_files_exist = True
                for file_name in VLM.model_urls:
                    file_path = find_model_in_dirs(config.paths_LLM, os.path.join(VLM.model, file_name)) or os.path.join(model_dir, file_name)
                    if not os.path.exists(file_path):
                        all_files_exist = False
                        break

                if not all_files_exist:
                    if download:
                        from modules.model_loader import load_file_from_url
                        logger.info(f"正在为 {VLM.current_version} 下载模型文件...")
                        for file_name, url in VLM.model_urls.items():
                            load_file_from_url(url, model_dir=model_dir, file_name=file_name)
                    else:
                        logger.warning(f"模型文件缺失，自动下载失败: {model_dir}")
                        return

            # For llama.cpp, we use the llamacpp_vlm module
            if not model_dir and VLM.gguf_file:
                resolved_gguf_path = find_model_in_dirs(config.paths_LLM, os.path.join(VLM.model, VLM.gguf_file))
                if resolved_gguf_path:
                    model_dir = os.path.dirname(resolved_gguf_path)
            if not model_dir:
                for base_dir in config.paths_LLM:
                    candidate = os.path.join(base_dir, VLM.model)
                    if not os.path.isdir(candidate):
                        continue
                    directory_ggufs = [
                        f for f in os.listdir(candidate)
                        if f.endswith('.gguf') and "mmproj" not in f.lower()
                    ]
                    if directory_ggufs:
                        model_dir = candidate
                        break
            if not model_dir:
                existing_dir = find_model_in_dirs(config.paths_LLM, VLM.model)
                if existing_dir and os.path.isdir(existing_dir):
                    model_dir = existing_dir
                else:
                    model_dir = os.path.join(first_model_dir(config.paths_LLM), VLM.model)
            if not os.path.exists(model_dir):
                logger.error(f"Model directory not found: {model_dir}")
                return

            gguf_files = [f for f in os.listdir(model_dir) if f.endswith('.gguf') and "mmproj" not in f.lower()]
            if not gguf_files:
                logger.error(f"No .gguf file found in {model_dir}")
                return
            selected_gguf = None
            if VLM.gguf_file:
                candidate = os.path.join(model_dir, VLM.gguf_file)
                if os.path.exists(candidate):
                    selected_gguf = VLM.gguf_file
                else:
                    logger.warning(f"Configured gguf file not found: {candidate}. Falling back to auto-detect.")

            if not selected_gguf:
                gguf_files = sorted(gguf_files, key=lambda s: s.lower())
                selected_gguf = gguf_files[0]

            model_file = os.path.join(VLM.model, selected_gguf)
            chat_handler_name = VLM.chat_handler or "None"
            llamacpp_vlm.load_model(
                model_file,
                chat_handler_name,
                n_ctx=VLM.n_ctx,
                image_min_tokens=VLM.image_min_tokens,
                image_max_tokens=VLM.image_max_tokens,
                mmproj_name=VLM.mmproj_file or None,
            )
            return

        if not shared.modelsinfo.exists_model(catalog="llms", model_path=VLM.model_file):
            logger.warning("VLM model files are missing: %s", VLM.model_file)
            return
        import sys
        from typing import List
        sys.modules[__name__].__builtins__['List'] = List
        MODEL_PATH = find_model_in_dirs(config.paths_llms, VLM.model) or os.path.join(first_model_dir(config.paths_llms), VLM.model)
        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True, low_cpu_mem_usage=False, local_files_only=True, device_map="cpu")
        text_model = AutoModel.from_pretrained(MODEL_PATH, trust_remote_code=True, low_cpu_mem_usage=False, local_files_only=True,
                attn_implementation="sdpa", dtype=torch.bfloat16 if VLM.bf16_support else torch.float16, device_map="cpu")
        text_model.eval()
        with VLM.lock:
            VLM.model_runtime = text_model
            VLM.tokenizer = tokenizer
        ldm_patched.modules.model_management.print_memory_info("after load vlm model")
        return

    def free_model(self):
        llamacpp_vlm.free_model()
        if VLM.backend == "comfy_textgen":
            comfy_textgen_vlm.free_model()
            return
        if VLM.model_runtime is None and VLM.tokenizer is None:
            return
        with VLM.lock:
            del VLM.model_runtime
            del VLM.tokenizer
            VLM.model_runtime = None
            VLM.tokenizer = None
        translator.free_translator_model()
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()
        gc.collect()
        ldm_patched.modules.model_management.print_memory_info("after free vlm model")

    @classmethod
    def list_custom_models(cls, base_url=None, api_key=None):
        base_url = str(base_url if base_url is not None else cls.custom_base_url or "").strip()
        api_key = str(api_key if api_key is not None else cls.custom_api_key or "").strip()
        if not base_url:
            return {"ok": False, "error": "API Base URL is required."}
        try:
            response = _custom_llm_request_json(
                models_url(base_url),
                None,
                api_key=api_key,
                method="GET",
                timeout=30,
            )
            rows = response.get("data") if isinstance(response, dict) else []
            models = []
            for item in rows or []:
                if isinstance(item, dict) and item.get("id"):
                    models.append(str(item.get("id")))
                elif isinstance(item, str):
                    models.append(item)
            return {"ok": True, "models": sorted(list(dict.fromkeys(models))), "raw_count": len(rows or [])}
        except Exception as exc:
            return {"ok": False, "error": "Custom LLM model list failed", "details": str(exc)}

    def inference_custom(self, image, prompt, max_tokens=2048, temperature=0.7, top_p=0.8, seed=-1, system_prompt=None):
        missing = VLM.get_custom_missing_settings()
        if missing:
            raise RuntimeError(f"Custom VLM settings incomplete: {', '.join(missing)}")
        settings = VLM.get_custom_settings()
        if not api_format_supported(settings["api_format"]):
            raise RuntimeError(f"Unsupported Custom VLM API format: {settings['api_format']}")

        messages = []
        system_prompt = str(system_prompt or "").strip()
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        prompt = str(prompt or "")
        image_urls = _custom_vlm_image_data_urls(image) if settings["supports_images"] else []
        if image_urls:
            messages.append({
                "role": "user",
                "content": [{"type": "text", "text": prompt}] + [
                    {"type": "image_url", "image_url": {"url": image_url}}
                    for image_url in image_urls
                ],
            })
        else:
            messages.append({"role": "user", "content": prompt})

        request_payload = {
            "model": settings["model"],
            "messages": messages,
            "temperature": float(temperature),
            "top_p": float(top_p),
            "max_tokens": int(max_tokens),
            "stream": False,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        try:
            seed_value = int(seed)
        except Exception:
            seed_value = -1
        if seed_value >= 0:
            request_payload["seed"] = seed_value
        request_url, request_payload = prepare_completion_request(
            settings["base_url"],
            settings["api_format"],
            request_payload,
        )
        response = _custom_llm_request_json(
            request_url,
            request_payload,
            api_key=settings["api_key"],
            method="POST",
            timeout=180,
        )
        return _extract_openai_compatible_text(response).strip()

    def inference(self, image, prompt, max_tokens=2048, temperature=0.7, top_p=0.8, top_k=100, repetition_penalty=1.05, seed=-1, system_prompt=None):
        # 设置为处理中状态
        VLM.set_processing_status(True)
        logger.debug("Starting VLM local inference...")
        try:
            if VLM.is_custom_version():
                return self.inference_custom(
                    image,
                    prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    seed=seed,
                    system_prompt=system_prompt,
                )
            if system_prompt is None and ads.get_admin_default('p2p_active_checkbox') and ads.get_admin_default('p2p_remote_process').lower()=='out':
                if isinstance(image, (list, tuple)):
                    image = next((img for img in image if img is not None), None)
                if isinstance(image, np.ndarray):
                    image = p2p_task.ndarray_to_webp_bytes(image)
                args = (image, prompt, max_tokens, temperature, top_p, top_k, repetition_penalty, seed)
                task = p2p_task.AsyncTask(method="vlm_inference", args=args)
                p2p_task.request_p2p_task(task)
                result = task.wait(30)
                return result[0]
            else:
                return self.inference_local(image, prompt, max_tokens, temperature, top_p, top_k, repetition_penalty, seed, system_prompt=system_prompt)
        finally:
            # 无论成功还是失败，都设置为非处理中状态
            VLM.set_processing_status(False)
            logger.debug("VLM local inference completed")

    def clear_conversation(self, conversation_id=None):
        if VLM.is_llamacpp:
            llamacpp_vlm.clear_conversation(conversation_id)
        elif VLM.backend == "comfy_textgen":
            comfy_textgen_vlm.clear_conversation(conversation_id)

    def reset_runtime_context(self):
        if VLM.is_llamacpp:
            llamacpp_vlm.reset_runtime_context()

    def chat(self, image, prompt, conversation_id="default", system_prompt="", save_state=True, max_history=24,
             max_tokens=2048, temperature=0.7, top_p=0.8, top_k=100, repetition_penalty=1.05, seed=-1):
        if VLM.is_custom_version():
            return self.inference(
                image,
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                repetition_penalty=repetition_penalty,
                seed=seed,
                system_prompt=system_prompt,
            )
        VLM.set_processing_status(True)
        logger.debug("Starting VLM chat inference...")
        try:
            return self.chat_local(
                image=image,
                prompt=prompt,
                conversation_id=conversation_id,
                system_prompt=system_prompt,
                save_state=save_state,
                max_history=max_history,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                repetition_penalty=repetition_penalty,
                seed=seed
            )
        finally:
            VLM.set_processing_status(False)
            logger.debug("VLM chat inference completed")

    @torch.no_grad()
    @torch.inference_mode()
    def chat_local(self, image, prompt, conversation_id="default", system_prompt="", save_state=True, max_history=24,
                   max_tokens=2048, temperature=0.7, top_p=0.8, top_k=100, repetition_penalty=1.05, seed=-1):
        try:
            self.set_processing_status(True)
            logger.debug("VLM chat_local started")

            if VLM.backend == "comfy_textgen":
                VLM.ensure_model_files_ready(VLM.current_version)
                if image is not None and "image" not in VLM.capabilities:
                    raise RuntimeError(f"{VLM.current_version} supports text input only.")
                llamacpp_vlm.free_model()
                pipeline.free_everything()
                return comfy_textgen_vlm.chat(
                    clip_name=VLM.clip_name or VLM.model_file,
                    clip_type=VLM.clip_type or "stable_diffusion",
                    image=image,
                    prompt=prompt,
                    conversation_id=conversation_id,
                    system_prompt=system_prompt,
                    save_state=save_state,
                    max_history=max_history,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    repetition_penalty=repetition_penalty,
                    seed=seed,
                    thinking=str(VLM.current_version).endswith("-Thinking"),
                )

            _safe_stop_comfyd_for_vlm()
            pipeline.free_everything()
            ldm_patched.modules.model_management.print_vram_info_by_nvml("before vlm chat inference")

            if VLM.is_llamacpp:
                VLM.ensure_model_files_ready(VLM.current_version)
                self.load_model(download=False)
                return llamacpp_vlm.chat(
                    image=image,
                    prompt=prompt,
                    conversation_id=conversation_id,
                    system_prompt=system_prompt,
                    save_state=save_state,
                    max_history=max_history,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    repetition_penalty=repetition_penalty,
                    seed=seed
                )

            logger.info("Current VLM backend does not support persistent chat; falling back to one-shot inference.")
            return self.inference_local(image, prompt, max_tokens, temperature, top_p, top_k, repetition_penalty, seed, system_prompt=system_prompt)
        finally:
            self.set_processing_status(False)
            logger.debug("VLM chat_local finished")

    @torch.no_grad()
    @torch.inference_mode()
    def inference_local(self, image, prompt, max_tokens=2048, temperature=0.7, top_p=0.8, top_k=100, repetition_penalty=1.05, seed=-1, system_prompt=None):
        try:
            # 设置处理状态为True
            self.set_processing_status(True)
            logger.debug("VLM inference_local started")

            if VLM.backend == "comfy_textgen":
                VLM.ensure_model_files_ready(VLM.current_version)
                if image is not None and "image" not in VLM.capabilities:
                    raise RuntimeError(f"{VLM.current_version} supports text input only.")
                llamacpp_vlm.free_model()
                pipeline.free_everything()
                return comfy_textgen_vlm.inference(
                    clip_name=VLM.clip_name or VLM.model_file,
                    clip_type=VLM.clip_type or "stable_diffusion",
                    image=image,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    repetition_penalty=repetition_penalty,
                    seed=seed,
                    system_prompt=system_prompt,
                    thinking=str(VLM.current_version).endswith("-Thinking"),
                )

            _safe_stop_comfyd_for_vlm()
            pipeline.free_everything()
            ldm_patched.modules.model_management.print_vram_info_by_nvml("before vlm inference")

            if VLM.is_llamacpp:
                VLM.ensure_model_files_ready(VLM.current_version)
                self.load_model(download=False)
                res = llamacpp_vlm.inference(
                    image=image,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    repetition_penalty=repetition_penalty,
                    seed=seed,
                    system_prompt=system_prompt
                )
                return res

            if VLM.model_runtime is None or VLM.tokenizer is None:
                VLM.ensure_model_files_ready(VLM.current_version)
                self.load_model(download=False)

            if hasattr(torch, 'cuda') and torch.cuda.is_available():
                device = torch.device('cuda')
                VLM.model_runtime = VLM.model_runtime.to(device)
            else:
                device = torch.device('cpu')

            image = image if image is None else Image.fromarray(resize_image(image, min_side=768, resize_mode=3))
            effective_prompt = prompt
            if system_prompt is not None and str(system_prompt or "").strip():
                effective_prompt = f"{str(system_prompt).strip()}\n\n{prompt}"
            msgs = [{'role': 'user', 'content': [image, effective_prompt]}]

            res = VLM.model_runtime.chat(
                image=None,
                msgs=msgs,
                tokenizer=VLM.tokenizer,
                sampling=True,
                top_k=top_k,
                top_p=top_p,
                repetition_penalty=repetition_penalty,
                max_tokens=max_tokens,
                temperature=temperature,
                seed=seed
            )

            if hasattr(torch, 'cuda') and torch.cuda.is_available():
                VLM.model_runtime = VLM.model_runtime.to('cpu')

            generated_text = res
            logger.debug(f'The generated text:{generated_text}')
            ldm_patched.modules.model_management.print_memory_info("after vlm inference")
            return generated_text
        finally:
            self.set_processing_status(False)
            logger.debug("VLM inference_local finished")

    def interrogate(self, image, output_chinese=False, prompt=None, additional_prompt=None):
        VLM.set_processing_status(True)
        try:
            if prompt is not None:
                logger.debug(f'The prompt of image: {prompt}')
                return self.inference(image, prompt)
            if additional_prompt:
                prompt = additional_prompt
            else:
                prompt = VLM.prompt_i2t

            if output_chinese:
                prompt = f'{prompt}, {VLM.output_chinese}'
            logger.debug(f'The prompt of image: {prompt}')
            result_prompt = self.inference(image, prompt)

            for prefix in VLM.remove_prefixs:
                if result_prompt.startswith(prefix):
                    result_prompt = result_prompt[len(prefix):]
            if result_prompt.endswith('"'):
                result_prompt = result_prompt[:-1]
            return result_prompt
        finally:
            VLM.set_processing_status(False)

    def model_exists(self):
        return VLM.model_exists_for_version(VLM.current_version)

    def extended_prompt_with_skills(
        self,
        input_text,
        prompt,
        input_images,
        state,
        translation_methods='Third APIs',
        action=None,
        media_context=None,
        options=None,
    ):
        input_text = str(input_text or "").strip()
        if not input_text:
            return input_text
        if not VLM.get_enable() or not self.model_exists():
            return None
        try:
            import modules.canvas_vlm_agent as canvas_vlm_agent
            action_data = action if isinstance(action, dict) else {}
            action_id = str(action_data.get("id") or "smart_expand").strip() or "smart_expand"
            action_options = options if isinstance(options, dict) else {}
            target_override = _superprompt_action_target_override(action_data, action_options, state)
            payload, preset_agent_prompt = _superprompt_payload_from_state(
                state,
                target_override=target_override,
                use_scene_agent_prompt=bool(action_data.get("use_scene_agent_prompt", True)),
            )
            if action_id != "smart_expand":
                payload["node_id"] = f"canvas_agent_prompt_rewrite:main_webui_{action_id}"
            params = {
                "mode": "chat",
                "node_id": payload["node_id"],
                "agent_mode": "canvas_agent",
                "compact_agent_prompt": True,
                "agent_use_skills": True,
                "agent_use_canvas_context": False,
                "agent_action_hints": False,
                "user_system_prompt": preset_agent_prompt,
            }
            system_prompt = canvas_vlm_agent.build_vlm_agent_system_prompt(params, payload, input_text)
            if not str(system_prompt or "").strip():
                return None
            resource_contract = prompt_actions.prompt_action_resource_contract_note(media_context)
            if resource_contract:
                system_prompt = f"{system_prompt}\n\n{resource_contract}"
            prompt_prefix = str(prompt or "").strip()
            action_instruction = str(action_data.get("instruction") or "").strip()
            if str(action_data.get("target_kind") or "").strip().lower() == "natural":
                target_key = str((target_override or {}).get("key") or "").strip().lower()
                language_instruction = (
                    "Write the final prompt in fluent English only."
                    if target_key == "natural_en"
                    else "Write the final prompt in fluent Simplified Chinese only."
                )
                action_instruction = "\n".join(
                    part for part in (action_instruction, language_instruction) if part
                )
            media_note = prompt_actions.prompt_action_media_note(media_context)
            text_context_note = prompt_actions.prompt_action_text_context_note(media_context, input_text)
            if not action_instruction and not media_note and not text_context_note:
                user_prompt = (
                    f"{prompt_prefix}\n\nUser prompt:\n{input_text}"
                    if prompt_prefix
                    else f"Rewrite this prompt for the current generation target:\n{input_text}"
                )
            else:
                request_parts = []
                if action_instruction:
                    request_parts.append(action_instruction)
                if media_note:
                    request_parts.append(media_note)
                if text_context_note:
                    request_parts.append(text_context_note)
                if action_data.get("handler") == "smart_expand" and prompt_prefix:
                    request_parts.append(prompt_prefix)
                request_parts.append(f"User prompt:\n{input_text}")
                user_prompt = "\n\n".join(request_parts)
            target = (
                payload.get("agent_context", {})
                .get("prompt_generation_targets", {})
                .get("text_to_image", {})
            )
            logger.info(
                "Using VLM prompt action: action=%s target=%s task_method=%s video_frames=%s",
                action_id,
                target.get("key") if isinstance(target, dict) else "",
                target.get("task_method") if isinstance(target, dict) else "",
                int((media_context or {}).get("sampled_frames") or 0) if isinstance(media_context, dict) else 0,
            )
            result = self.inference(
                _superprompt_image_input(input_images),
                user_prompt,
                max_tokens=1024,
                temperature=0.65,
                top_p=0.85,
                top_k=40,
                repetition_penalty=1.05,
                seed=-1,
                system_prompt=system_prompt,
            )
            return _superprompt_clean_output(result, fallback=input_text)
        except Exception as exc:
            logger.warning("VLM prompt action failed; falling back to legacy prompt expansion: %s", exc)
            return None

    def extended_prompt(
        self,
        input_text,
        prompt,
        input_images,
        state,
        translation_methods='Third APIs',
        action=None,
        media_context=None,
        options=None,
    ):
        input_text = str(input_text or "")
        if not input_text.strip():
            return input_text
        state = state if isinstance(state, dict) else {}
        skill_result = self.extended_prompt_with_skills(
            input_text,
            prompt,
            input_images,
            state,
            translation_methods,
            action=action,
            media_context=media_context,
            options=options,
        )
        if skill_result:
            return skill_result

        if 'scene_frontend' in state:
            theme = state.get('scene_theme') or state.get('__scene_theme') or ''
            prompt_prompt = flags.get_value_by_scene_theme(state, theme, 'agent_prompt', '')
            if prompt_prompt and VLM.get_enable() and self.model_exists():
                logger.debug(f"Using {'LlamaCpp' if VLM.is_llamacpp else 'VLM'} for scene extended prompt")
                media_note = prompt_actions.prompt_action_media_note(media_context)
                legacy_prompt = "\n\n".join(part for part in (prompt_prompt, media_note, input_text) if str(part or "").strip())
                return self.interrogate(_superprompt_image_input(input_images), prompt=legacy_prompt)

        if not VLM.get_enable() or not self.model_exists():
            return superprompter.answer(input_text=translator.convert(f'{prompt}{input_text}', translation_methods))

        logger.debug(f"Using {'LlamaCpp' if VLM.is_llamacpp else 'VLM'} for standard extended prompt")
        media_note = prompt_actions.prompt_action_media_note(media_context)
        fallback_prompt = "\n\n".join(part for part in (media_note, f'{VLM.prompt_extend}{input_text}') if str(part or "").strip())
        result = self.inference(_superprompt_image_input(input_images), prompt=fallback_prompt)
        return _superprompt_clean_output(result, fallback=input_text)

    def run_prompt_action(
        self,
        action_id,
        input_text,
        prompt_prefix,
        input_images,
        state,
        translation_methods='Third APIs',
        options=None,
        video_path="",
        video_first_frame_path="",
        scene_resources=None,
    ):
        original = str(input_text or "")
        if not original.strip():
            return {"ok": False, "text": original, "action_id": str(action_id or ""), "error": "Prompt is empty."}

        action = prompt_actions.get_prompt_action(action_id)
        if not action:
            return {"ok": False, "text": original, "action_id": str(action_id or ""), "error": "Unknown prompt action."}
        state_data = state if isinstance(state, dict) else {}
        mode = prompt_actions.prompt_action_mode(state_data)
        if mode not in action.get("modes", []):
            return {"ok": False, "text": original, "action_id": action["id"], "error": "Prompt action is unavailable in this mode."}

        action_options = prompt_actions.normalize_prompt_action_options(options)
        handler = str(action.get("handler") or "")
        if handler == "tag_separator_toggle":
            try:
                output, direction, changed_tags = prompt_actions.transform_prompt_tag_separators(
                    original,
                    action_options.get("direction") or "auto",
                )
            except ValueError as exc:
                return {"ok": False, "text": original, "action_id": action["id"], "error": str(exc)}
            if not changed_tags:
                return {
                    "ok": False,
                    "text": original,
                    "action_id": action["id"],
                    "error": "No convertible tag spaces or underscores were found.",
                    "media": {"video_requested": False, "video_used": False, "sampled_frames": 0},
                }
            return {
                "ok": True,
                "text": output,
                "action_id": action["id"],
                "transform": {"direction": direction, "changed_tags": changed_tags},
                "media": {"video_requested": False, "video_used": False, "sampled_frames": 0},
            }
        if handler == "translate":
            if not VLM.get_enable() or not self.model_exists():
                return {
                    "ok": False,
                    "text": original,
                    "action_id": action["id"],
                    "error": "The configured LLM is unavailable.",
                    "media": {"video_requested": False, "video_used": False, "sampled_frames": 0},
                }
            direction = str(action_options.get("direction") or "auto").strip().lower()
            if direction == "auto":
                direction = "to_en" if is_chinese(original) else "to_cn"
            if direction == "to_en":
                output = self.inference(None, prompt=f'{VLM.prompt_translator}{original}')
            elif direction == "to_cn":
                output = self.inference(None, prompt=f'{VLM.prompt_translator_cn}{original}')
            else:
                return {"ok": False, "text": original, "action_id": action["id"], "error": "Unsupported translation direction."}
            translated = str(output or "").strip()
            if not translated or translated == original.strip():
                return {
                    "ok": False,
                    "text": original,
                    "action_id": action["id"],
                    "error": "Translation returned unchanged text.",
                    "media": {"video_requested": False, "video_used": False, "sampled_frames": 0},
                }
            return {
                "ok": True,
                "text": translated,
                "action_id": action["id"],
                "media": {"video_requested": False, "video_used": False, "sampled_frames": 0},
            }

        if handler not in {"smart_expand", "agent_rewrite"}:
            return {"ok": False, "text": original, "action_id": action["id"], "error": "Prompt action handler is unavailable."}

        requires_vlm = bool(action.get("requires_vlm")) or (mode == "scene" and bool(action.get("requires_vlm_scene")))
        if requires_vlm and (not VLM.get_enable() or not self.model_exists()):
            return {
                "ok": False,
                "text": original,
                "action_id": action["id"],
                "error": "The configured VLM is unavailable.",
                "media": {"video_requested": False, "video_used": False, "sampled_frames": 0},
            }

        media_policy = str(action.get("media_policy") or "none")
        if media_policy == "none":
            resource_images, resource_context = [], {}
        else:
            resource_values = dict(scene_resources or {})
            if not scene_resources:
                resource_values.update({
                    "video_path": video_path,
                    "video_first_frame_path": video_first_frame_path,
                    "legacy_video_direct": True,
                })
            resource_images, resource_context = prompt_actions.prepare_prompt_action_resources(
                state_data,
                input_images,
                resource_values,
                input_text=original,
            )
        resolved_video_path = str(resource_context.get("video_path") or "")
        resolved_first_frame_path = str(resource_context.get("video_first_frame_path") or "")
        video_sources = [
            prompt_actions.normalize_media_path(value)
            for value in (resolved_video_path, resolved_first_frame_path)
        ]
        video_source_available = any(path and os.path.exists(path) for path in video_sources)
        wants_video = (
            media_policy in {"main_video_auto", "main_video_required"}
            and prompt_actions.prompt_action_option_bool(action_options, "use_video", True)
            and video_source_available
        )
        wants_images = media_policy != "none" and bool(resource_images)
        if (wants_video or wants_images) and VLM.is_custom_version() and not bool(VLM.get_custom_settings().get("supports_images")):
            return {
                "ok": False,
                "text": original,
                "action_id": action["id"],
                "error": "The configured custom model does not accept image input. Disable video context or choose a vision model.",
                "media": {"video_requested": True, "video_used": False, "sampled_frames": 0},
            }
        media_options = dict(action_options)
        media_options["video_frame_mode"] = "multi_frame" if VLM.is_llamacpp and not VLM.is_custom_version() else "contact_sheet"
        prepared_images, media_meta = prompt_actions.prepare_prompt_action_media(
            action["id"],
            resource_images,
            video_path=resolved_video_path,
            first_frame_path=resolved_first_frame_path,
            options=media_options,
            resource_context=resource_context,
        )
        public_media = {
            key: media_meta.get(key)
            for key in (
                "video_requested",
                "video_used",
                "sampled_frames",
                "duration_seconds",
                "used_first_frame_only",
                "cache_hit",
                "image_descriptors",
                "video_source",
                "video_visual_mode",
                "video_visual_count",
                "target_duration_seconds",
                "audio_present",
                "director",
            )
            if key in media_meta
        }

        if handler == "smart_expand":
            output = self.extended_prompt(
                original,
                prompt_prefix,
                prepared_images,
                state_data,
                translation_methods,
                action=action,
                media_context=media_meta,
                options=action_options,
            )
        elif handler == "agent_rewrite":
            output = self.extended_prompt_with_skills(
                original,
                prompt_prefix,
                prepared_images,
                state_data,
                translation_methods,
                action=action,
                media_context=media_meta,
                options=action_options,
            )
        cleaned = str(output or "").strip()
        if str(action.get("target_kind") or "").strip().lower() == "danbooru":
            cleaned = prompt_actions.prompt_tags_with_spaces(cleaned)
        if not cleaned:
            return {
                "ok": False,
                "text": original,
                "action_id": action["id"],
                "error": "Prompt action returned no text.",
                "media": public_media,
            }
        return {
            "ok": True,
            "text": cleaned,
            "action_id": action["id"],
            "media": public_media,
        }

    def translate(self, input_text, method=None):
        if not input_text:
            return input_text or ''
        if not is_chinese(input_text):
            return input_text
        if VLM.get_enable() and self.model_exists() and method in [None, 'Big Model']:
            logger.debug(f"Using {'LlamaCpp' if VLM.is_llamacpp else 'VLM'} for translation to English")
            return self.inference(None, prompt=f'{VLM.prompt_translator}{input_text}')
        else:
            return translator.convert(input_text, method)

    def translate_cn(self, input_text, method=None):
        if is_chinese(input_text):
            return input_text
        if VLM.get_enable() and self.model_exists() and method in [None, 'Big Model']:
            logger.debug(f"Using {'LlamaCpp' if VLM.is_llamacpp else 'VLM'} for translation to Chinese")
            return self.inference(None, prompt=f'{VLM.prompt_translator_cn}{input_text}')
        else:
            return translator.convert(input_text, method, 'cn')

    def expand_tts_style_instruction(self, style_text):
        prompt = f"{VLM.prompt_tts_style_director}\n\nUser Input: {style_text}\n\nOutput:"
        result = self.inference(None, prompt=prompt)
        return "" if result is None else str(result).strip()
       
# 初始化模型版本
VLM.set_version(ads.get_admin_default('vlm_version'))

vlm = VLM()
default_interrogator = vlm.interrogate

