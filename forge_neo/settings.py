from __future__ import annotations

import json
import platform
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import args_manager
from forge_neo.bootstrap import ensure_config
from forge_neo.forge_couple_compat import FORGE_COUPLE_SETTING_DEFAULTS
from forge_neo.models import SOURCE_BRANCH, SOURCE_COMMIT, SOURCE_LICENSE, SOURCE_PROJECT


@dataclass(frozen=True)
class ForgeNeoSettingInfo:
    key: str
    default: Any
    section: str
    label_en: str
    label_cn: str


PRESET_ARCHES: tuple[str, ...] = ("anima", "flux", "klein", "krea2", "lumina", "qwen", "qwen21", "sd", "xl", "zit")
PRESET_DISPLAY_NAMES: dict[str, str] = {arch: arch.upper() for arch in PRESET_ARCHES}
PRESET_DISPLAY_NAMES["qwen21"] = "Qwen Image 2.1"
PRESET_SAMPLERS: dict[str, str] = {
    "sd": "Euler a",
    "xl": "Euler a",
    "flux": "Euler",
    "klein": "Euler",
    "krea2": "Euler",
    "qwen": "Euler",
    "qwen21": "Euler",
    "lumina": "Res Multistep",
    "zit": "Euler",
    "anima": "ER SDE",
}
PRESET_SCHEDULERS: dict[str, str] = {
    "sd": "Automatic",
    "xl": "Automatic",
    "flux": "Beta",
    "klein": "Beta",
    "krea2": "Simple",
    "qwen": "Beta",
    "qwen21": "Simple",
    "lumina": "Simple",
    "zit": "Beta",
    "anima": "Simple",
}
PRESET_STEPS: dict[str, int] = {
    "sd": 32,
    "xl": 24,
    "flux": 20,
    "klein": 4,
    "krea2": 8,
    "qwen": 8,
    "qwen21": 25,
    "lumina": 32,
    "zit": 9,
    "anima": 32,
}
PRESET_CFG: dict[str, float] = {
    "sd": 6.0,
    "xl": 4.5,
    "flux": 1.0,
    "klein": 1.0,
    "krea2": 1.0,
    "qwen": 1.0,
    "qwen21": 1.0,
    "lumina": 4.0,
    "zit": 1.0,
    "anima": 4.0,
}
PRESET_DISTILL: dict[str, float] = {"flux": 3.0}
PRESET_SHIFT: dict[str, float] = {
    "xl": -9.0,
    "lumina": 6.0,
    "zit": 9.0,
    "anima": 3.0,
}
PRESET_FRAMES: dict[str, int] = {}


def _preset_setting_infos() -> tuple[ForgeNeoSettingInfo, ...]:
    items: list[ForgeNeoSettingInfo] = []
    for arch in PRESET_ARCHES:
        section = f"ui_{arch}"
        sampler = PRESET_SAMPLERS[arch]
        scheduler = PRESET_SCHEDULERS[arch]
        step = PRESET_STEPS[arch]
        cfg = PRESET_CFG[arch]
        items.extend(
            [
                ForgeNeoSettingInfo(f"{arch}_t2i_sampler", sampler, section, "txt2img Sampler", "txt2img 采样器"),
                ForgeNeoSettingInfo(f"{arch}_t2i_scheduler", scheduler, section, "txt2img Scheduler", "txt2img 调度器"),
                ForgeNeoSettingInfo(f"{arch}_i2i_sampler", sampler, section, "img2img Sampler", "img2img 采样器"),
                ForgeNeoSettingInfo(f"{arch}_i2i_scheduler", scheduler, section, "img2img Scheduler", "img2img 调度器"),
                ForgeNeoSettingInfo(f"{arch}_t2i_step", step, section, "txt2img Steps", "txt2img 步数"),
                ForgeNeoSettingInfo(f"{arch}_t2i_hr_step", step, section, "txt2img Hires. Steps", "txt2img Hires. 步数"),
                ForgeNeoSettingInfo(f"{arch}_i2i_step", step, section, "img2img Steps", "img2img 步数"),
                ForgeNeoSettingInfo(f"{arch}_t2i_cfg", cfg, section, "txt2img CFG", "txt2img CFG"),
                ForgeNeoSettingInfo(f"{arch}_t2i_hr_cfg", cfg, section, "txt2img Hires. CFG", "txt2img Hires. CFG"),
                ForgeNeoSettingInfo(f"{arch}_i2i_cfg", cfg, section, "img2img CFG", "img2img CFG"),
            ]
        )
        if arch in PRESET_DISTILL:
            distill = PRESET_DISTILL[arch]
            items.extend(
                [
                    ForgeNeoSettingInfo(f"{arch}_t2i_dcfg", distill, section, "txt2img Distilled CFG", "txt2img Distilled CFG"),
                    ForgeNeoSettingInfo(f"{arch}_t2i_hr_dcfg", distill, section, "txt2img Hires. Distilled CFG", "txt2img Hires. Distilled CFG"),
                    ForgeNeoSettingInfo(f"{arch}_i2i_dcfg", distill, section, "img2img Distilled CFG", "img2img Distilled CFG"),
                ]
            )
        if arch in PRESET_SHIFT:
            shift = PRESET_SHIFT[arch]
            items.extend(
                [
                    ForgeNeoSettingInfo(f"{arch}_show_shift", shift > 0.0, section, "Display Shift Slider", "显示 Shift 滑条"),
                    ForgeNeoSettingInfo(f"{arch}_t2i_dcfg", abs(shift), section, "txt2img Shift", "txt2img Shift"),
                    ForgeNeoSettingInfo(f"{arch}_t2i_hr_dcfg", abs(shift), section, "txt2img Hires. Shift", "txt2img Hires. Shift"),
                    ForgeNeoSettingInfo(f"{arch}_i2i_dcfg", abs(shift), section, "img2img Shift", "img2img Shift"),
                ]
            )
        if PRESET_FRAMES.get(arch, 1) > 1:
            items.extend(
                [
                    ForgeNeoSettingInfo(f"{arch}_t2i_batch_size", 1, section, "txt2img Frames", "txt2img 帧数"),
                    ForgeNeoSettingInfo(f"{arch}_i2i_batch_size", 1, section, "img2img Frames", "img2img 帧数"),
                ]
            )
        else:
            items.extend(
                [
                    ForgeNeoSettingInfo(f"{arch}_t2i_batch_size", 1, section, "txt2img Batch Size", "txt2img 批量大小"),
                    ForgeNeoSettingInfo(f"{arch}_i2i_batch_size", 1, section, "img2img Batch Size", "img2img 批量大小"),
                ]
            )
        items.extend(
            [
                ForgeNeoSettingInfo(f"{arch}_t2i_width", 0, section, "txt2img Width", "txt2img 宽度"),
                ForgeNeoSettingInfo(f"{arch}_i2i_width", 0, section, "img2img Width", "img2img 宽度"),
                ForgeNeoSettingInfo(f"{arch}_t2i_height", 0, section, "txt2img Height", "txt2img 高度"),
                ForgeNeoSettingInfo(f"{arch}_i2i_height", 0, section, "img2img Height", "img2img 高度"),
            ]
        )
    return tuple(items)


PRESET_SETTINGS_SCHEMA = _preset_setting_infos()
PRESET_SETTING_KEYS: tuple[str, ...] = tuple(info.key for info in PRESET_SETTINGS_SCHEMA)


CALLBACK_PRIORITY_CHOICES: dict[str, tuple[str, ...]] = {
    "app_started": (
        "sd_forge_controlnet/controlnet.py/app_started",
        "sd_forge_lora/lora_script.py/app_started",
    ),
    "ui_settings": (
        "sd_forge_controlnet/controlnet.py/ui_settings",
    ),
    "after_component": (
        "sd_forge_controlnet/controlnet.py/after_component",
    ),
    "infotext_pasted": (
        "sd_forge_controlnet/controlnet.py/infotext_pasted",
        "sd_forge_lora/lora_script.py/infotext_pasted",
        "sd_forge_lora/lora_script.py/infotext_pasted-1",
    ),
    "before_ui": (
        "sd_forge_lora/lora_script.py/before_ui",
    ),
    "on_reload": (
        "sd_forge_controlnet/controlnet.py/on_reload",
    ),
    "script_before_process": (
        "extra-options-section/extra_options_section.py/script_before_process/ExtraOptionsSection",
    ),
    "script_process": (
        "sd_forge_controlnet/controlnet.py/script_process/ControlNetForForgeOfficial",
        "sd_forge_image_stitch/image_stitch.py/script_process/ImageStitch",
        "sd_forge_neveroom/forge_never_oom.py/script_process/NeverOOMForForge",
        "base/comments.py/script_process/Comments",
    ),
    "script_process_batch": (
        "sd_forge_compile/compile.py/script_process_batch/TorchCompileForForge",
    ),
    "script_postprocess": (
        "sd_forge_controlnet/controlnet.py/script_postprocess/ControlNetForForgeOfficial",
        "sd_forge_mod_guidance/mod_guidance.py/script_postprocess/ModulationGuidanceForForge",
        "base/refiner.py/script_postprocess/ScriptRefiner",
    ),
    "script_postprocess_batch_list": (
        "sd_forge_controlnet/controlnet.py/script_postprocess_batch_list/ControlNetForForgeOfficial",
    ),
    "script_post_sample": (
        "soft-inpainting/soft_inpainting.py/script_post_sample/Script",
    ),
    "script_on_mask_blend": (
        "soft-inpainting/soft_inpainting.py/script_on_mask_blend/Script",
    ),
    "script_postprocess_maskoverlay": (
        "soft-inpainting/soft_inpainting.py/script_postprocess_maskoverlay/Script",
    ),
    "script_after_component": (
        "sd_forge_image_stitch/image_stitch.py/script_after_component/ImageStitch",
    ),
}
CALLBACK_PRIORITY_KEYS: tuple[str, ...] = tuple(f"prioritized_callbacks_{category}" for category in CALLBACK_PRIORITY_CHOICES)
CALLBACK_PRIORITY_SETTINGS_SCHEMA: tuple[ForgeNeoSettingInfo, ...] = tuple(
    ForgeNeoSettingInfo(
        f"prioritized_callbacks_{category}",
        [],
        "callbacks",
        f"{category} callback priority",
        f"{category} callback 优先级",
    )
    for category in CALLBACK_PRIORITY_CHOICES
)

TAGCOMPLETE_UNDERSCORE_EXCLUSION_DEFAULT = "0_0,(o)_(o),+_+,+_-,._.,<o>_<o>,<|>_<|>,=_=,>_<,3_3,6_9,>_o,@_@,^_^,o_o,u_u,x_x,|_|,||_||"
TAGCOMPLETE_KEYMAP_DEFAULT = json.dumps(
    {
        "MoveUp": "ArrowUp",
        "MoveDown": "ArrowDown",
        "JumpUp": "PageUp",
        "JumpDown": "PageDown",
        "JumpToStart": "Home",
        "JumpToEnd": "End",
        "ChooseSelected": "Enter",
        "ChooseFirstOrSelected": "Tab",
        "Close": "Escape",
    },
    ensure_ascii=False,
    indent=4,
)
TAGCOMPLETE_COLORMAP_DEFAULT = json.dumps(
    {
        "danbooru": {
            "-1": ["red", "maroon"],
            "0": ["lightblue", "dodgerblue"],
            "1": ["indianred", "firebrick"],
            "3": ["violet", "darkorchid"],
            "4": ["lightgreen", "darkgreen"],
            "5": ["orange", "darkorange"],
        },
        "e621": {
            "-1": ["red", "maroon"],
            "0": ["lightblue", "dodgerblue"],
            "1": ["gold", "goldenrod"],
            "3": ["violet", "darkorchid"],
            "4": ["lightgreen", "darkseagreen"],
            "5": ["tomato", "darksalmon"],
            "6": ["red", "maroon"],
            "7": ["whitesmoke", "black"],
            "8": ["seagreen", "darkseagreen"],
        },
        "derpibooru": {
            "-1": ["red", "maroon"],
            "0": ["#60d160", "#3d9d3d"],
            "1": ["#fff956", "#918e2e"],
            "3": ["#fd9961", "#a14c2e"],
            "4": ["#cf5bbe", "#6c1e6c"],
            "5": ["#3c8ad9", "#1e5e93"],
            "6": ["#a6a6a6", "#555555"],
            "7": ["#47abc1", "#1f6c7c"],
            "8": ["#7871d0", "#392f7d"],
            "9": ["#df3647", "#8e1c2b"],
            "10": ["#c98f2b", "#7b470e"],
            "11": ["#e87ebe", "#a83583"],
        },
        "danbooru_e621_merged": {
            "-1": ["red", "maroon"],
            "0": ["lightblue", "dodgerblue"],
            "1": ["indianred", "firebrick"],
            "3": ["violet", "darkorchid"],
            "4": ["lightgreen", "darkgreen"],
            "5": ["orange", "darkorange"],
            "6": ["red", "maroon"],
            "7": ["lightblue", "dodgerblue"],
            "8": ["gold", "goldenrod"],
            "9": ["gold", "goldenrod"],
            "10": ["violet", "darkorchid"],
            "11": ["lightgreen", "darkgreen"],
            "12": ["tomato", "darksalmon"],
            "14": ["whitesmoke", "black"],
            "15": ["seagreen", "darkseagreen"],
        },
    },
    ensure_ascii=False,
    indent=4,
)
TAGCOMPLETE_SETTINGS_SCHEMA: tuple[ForgeNeoSettingInfo, ...] = (
    ForgeNeoSettingInfo("tac_tagFile", "danbooru.csv", "tag_complete", "Tag filename", "标签文件"),
    ForgeNeoSettingInfo("tac_active", True, "tag_complete", "Enable Tag Autocompletion", "启用标签补全"),
    ForgeNeoSettingInfo("tac_activeIn.txt2img", True, "tag_complete", "Active in txt2img", "文生图启用"),
    ForgeNeoSettingInfo("tac_activeIn.img2img", True, "tag_complete", "Active in img2img", "图生图启用"),
    ForgeNeoSettingInfo("tac_activeIn.negativePrompts", True, "tag_complete", "Active in negative prompts", "反向提示词启用"),
    ForgeNeoSettingInfo("tac_activeIn.thirdParty", True, "tag_complete", "Active in third party textboxes", "第三方文本框启用"),
    ForgeNeoSettingInfo("tac_activeIn.modelList", "", "tag_complete", "Black/Whitelist models", "模型黑白名单"),
    ForgeNeoSettingInfo("tac_activeIn.modelListMode", "Blacklist", "tag_complete", "Mode to use for model list", "模型名单模式"),
    ForgeNeoSettingInfo("tac_slidingPopup", True, "tag_complete", "Move completion popup together with text cursor", "候选框跟随光标移动"),
    ForgeNeoSettingInfo("tac_maxResults", 5, "tag_complete", "Maximum results", "最大候选数"),
    ForgeNeoSettingInfo("tac_showAllResults", False, "tag_complete", "Show all results", "显示所有候选"),
    ForgeNeoSettingInfo("tac_resultStepLength", 100, "tag_complete", "How many results to load at once", "每次加载候选数"),
    ForgeNeoSettingInfo("tac_delayTime", 100, "tag_complete", "Time in ms to wait before triggering completion again", "再次触发补全前等待毫秒数"),
    ForgeNeoSettingInfo("tac_useIndexedSearch", True, "tag_complete", "Use indexed search", "使用索引搜索"),
    ForgeNeoSettingInfo("tac_useWildcards", True, "tag_complete", "Search for wildcards", "搜索通配符"),
    ForgeNeoSettingInfo("tac_sortWildcardResults", True, "tag_complete", "Sort wildcard file contents alphabetically", "通配符内容按字母排序"),
    ForgeNeoSettingInfo("tac_wildcardExclusionList", "", "tag_complete", "Wildcard folder exclusion list", "通配符排除目录"),
    ForgeNeoSettingInfo("tac_skipWildcardRefresh", False, "tag_complete", "Do not re-scan wildcard files when refreshing extra networks", "刷新额外网络时不重新扫描通配符"),
    ForgeNeoSettingInfo("tac_useEmbeddings", True, "tag_complete", "Search for embeddings", "搜索 Embeddings"),
    ForgeNeoSettingInfo("tac_forceRefreshEmbeddings", False, "tag_complete", "Force refresh embeddings when refreshing extra networks", "刷新额外网络时强制刷新 Embeddings"),
    ForgeNeoSettingInfo("tac_includeEmbeddingsInNormalResults", False, "tag_complete", "Include embeddings in normal tag results", "普通标签候选中包含 Embeddings"),
    ForgeNeoSettingInfo("tac_useLoras", True, "tag_complete", "Search for Loras", "搜索 LoRA"),
    ForgeNeoSettingInfo("tac_useLycos", True, "tag_complete", "Search for LyCORIS/LoHa", "搜索 LyCORIS/LoHa"),
    ForgeNeoSettingInfo("tac_useLoraPrefixForLycos", True, "tag_complete", "Use the '<lora:' prefix for LyCORIS models", "LyCORIS 使用 '<lora:' 前缀"),
    ForgeNeoSettingInfo("tac_showWikiLinks", False, "tag_complete", "Show wiki links next to tags", "显示标签 Wiki 链接"),
    ForgeNeoSettingInfo("tac_showExtraNetworkPreviews", True, "tag_complete", "Show preview thumbnails for extra networks", "显示额外网络预览图"),
    ForgeNeoSettingInfo("tac_modelSortOrder", "Name", "tag_complete", "Model sort order", "模型排序方式"),
    ForgeNeoSettingInfo("tac_useStyleVars", False, "tag_complete", "Search for webui style names", "搜索 WebUI 样式名"),
    ForgeNeoSettingInfo("tac_frequencySort", True, "tag_complete", "Locally record tag usage and sort frequent tags higher", "记录本地使用频率并提高常用标签排序"),
    ForgeNeoSettingInfo("tac_frequencyFunction", "Logarithmic (weak)", "tag_complete", "Function to use for frequency sorting", "频率排序函数"),
    ForgeNeoSettingInfo("tac_frequencyMinCount", 3, "tag_complete", "Minimum number of uses for a tag to be considered frequent", "计入常用标签的最小使用次数"),
    ForgeNeoSettingInfo("tac_frequencyMaxAge", 30, "tag_complete", "Maximum days since last use for a tag to be considered frequent", "计入常用标签的最长未使用天数"),
    ForgeNeoSettingInfo("tac_frequencyRecommendCap", 10, "tag_complete", "Maximum number of recommended tags", "推荐标签最大数量"),
    ForgeNeoSettingInfo("tac_frequencyIncludeAlias", False, "tag_complete", "Frequency sorting matches aliases for frequent tags", "频率排序匹配别名"),
    ForgeNeoSettingInfo("tac_replaceUnderscores", True, "tag_complete", "Replace underscores with spaces on insertion", "插入时将下划线替换为空格"),
    ForgeNeoSettingInfo("tac_undersocreReplacementExclusionList", TAGCOMPLETE_UNDERSCORE_EXCLUSION_DEFAULT, "tag_complete", "Underscore replacement exclusion list", "下划线替换排除列表"),
    ForgeNeoSettingInfo("tac_escapeParentheses", True, "tag_complete", "Escape parentheses on insertion", "插入时转义括号"),
    ForgeNeoSettingInfo("tac_appendComma", True, "tag_complete", "Append comma on tag autocompletion", "补全后追加逗号"),
    ForgeNeoSettingInfo("tac_appendSpace", True, "tag_complete", "Append space on tag autocompletion", "补全后追加空格"),
    ForgeNeoSettingInfo("tac_alwaysSpaceAtEnd", True, "tag_complete", "Always append space if inserting at the end of the textbox", "在文本框末尾插入时总是追加空格"),
    ForgeNeoSettingInfo("tac_modelKeywordCompletion", "Never", "tag_complete", "Try to add known trigger words for LORA/LyCO models", "尝试加入 LoRA/LyCO 触发词"),
    ForgeNeoSettingInfo("tac_modelKeywordLocation", "Start of prompt", "tag_complete", "Where to insert the trigger keyword", "触发词插入位置"),
    ForgeNeoSettingInfo("tac_modelKeywordCivitai", False, "tag_complete", "Fetch trigger words from CivitAI if not found locally", "本地未找到时从 CivitAI 获取触发词"),
    ForgeNeoSettingInfo("tac_civitaiApiKey", "", "tag_complete", "CivitAI API key for trigger word lookups", "用于触发词查询的 CivitAI API key"),
    ForgeNeoSettingInfo("tac_wildcardCompletionMode", "To next folder level", "tag_complete", "How to complete nested wildcard paths", "嵌套通配符路径补全方式"),
    ForgeNeoSettingInfo("tac_alias.searchByAlias", True, "tag_complete", "Search by alias", "按别名搜索"),
    ForgeNeoSettingInfo("tac_alias.onlyShowAlias", False, "tag_complete", "Only show alias", "仅显示别名"),
    ForgeNeoSettingInfo("tac_translation.translationFile", "None", "tag_complete", "Translation filename", "翻译文件"),
    ForgeNeoSettingInfo("tac_translation.oldFormat", False, "tag_complete", "Translation file uses old 3-column format", "翻译文件使用旧三列格式"),
    ForgeNeoSettingInfo("tac_translation.searchByTranslation", True, "tag_complete", "Search by translation", "按翻译搜索"),
    ForgeNeoSettingInfo("tac_translation.liveTranslation", False, "tag_complete", "Show live tag translation below prompt", "在提示词下方显示实时标签翻译"),
    ForgeNeoSettingInfo("tac_extra.extraFile", "extra-quality-tags.csv", "tag_complete", "Extra filename", "额外标签文件"),
    ForgeNeoSettingInfo("tac_extra.addMode", "Insert before", "tag_complete", "Mode to add extra tags to the main tag list", "额外标签加入方式"),
    ForgeNeoSettingInfo("tac_chantFile", "demo-chants.json", "tag_complete", "Chant filename", "长提示文件"),
    ForgeNeoSettingInfo("tac_keymap", TAGCOMPLETE_KEYMAP_DEFAULT, "tag_complete", "Configure Hotkeys", "快捷键 JSON"),
    ForgeNeoSettingInfo("tac_colormap", TAGCOMPLETE_COLORMAP_DEFAULT, "tag_complete", "Configure colors", "颜色 JSON"),
)
TAGCOMPLETE_SETTING_KEYS: tuple[str, ...] = tuple(info.key for info in TAGCOMPLETE_SETTINGS_SCHEMA)

FORGE_COUPLE_SETTINGS_SCHEMA: tuple[ForgeNeoSettingInfo, ...] = (
    ForgeNeoSettingInfo(
        "fc_do_interrupt",
        FORGE_COUPLE_SETTING_DEFAULTS["fc_do_interrupt"],
        "forge_couple",
        "Interrupt on Error",
        "发生错误时中断生成",
    ),
    ForgeNeoSettingInfo(
        "fc_no_presets",
        FORGE_COUPLE_SETTING_DEFAULTS["fc_no_presets"],
        "forge_couple",
        "Disable the Presets feature in Advanced mode",
        "禁用 Advanced 模式的预设功能",
    ),
    ForgeNeoSettingInfo(
        "fc_no_tile",
        FORGE_COUPLE_SETTING_DEFAULTS["fc_no_tile"],
        "forge_couple",
        "Disable the Tile mode in img2img",
        "禁用 img2img 的 Tile 模式",
    ),
    ForgeNeoSettingInfo(
        "fc_adv_newline",
        FORGE_COUPLE_SETTING_DEFAULTS["fc_adv_newline"],
        "forge_couple",
        "Keep newline characters in Advanced mode dataframe",
        "在 Advanced 表格中保留换行符",
    ),
)
FORGE_COUPLE_SETTING_KEYS: tuple[str, ...] = tuple(info.key for info in FORGE_COUPLE_SETTINGS_SCHEMA)


SETTINGS_SCHEMA: tuple[ForgeNeoSettingInfo, ...] = (
    ForgeNeoSettingInfo(
        "output_dir",
        "",
        "paths",
        "Output Directory (if empty, default to userhome\\ForgeNeo)",
        "输出目录（留空时使用 userhome\\ForgeNeo）",
    ),
    ForgeNeoSettingInfo("outdir_txt2img_samples", "output\\images", "paths", "Output Directory for txt2img Images", "文生图图片输出目录"),
    ForgeNeoSettingInfo("outdir_img2img_samples", "output\\images", "paths", "Output Directory for img2img Images", "图生图图片输出目录"),
    ForgeNeoSettingInfo("outdir_extras_samples", "output\\images", "paths", "Output Directory for Extras Images", "附加功能图片输出目录"),
    ForgeNeoSettingInfo("outdir_video", "output\\videos", "paths", "Output Directory for Videos", "视频输出目录"),
    ForgeNeoSettingInfo(
        "outdir_grids",
        "",
        "paths",
        "Output Directory for Grids (if empty, default to the two folders below)",
        "宫格图输出目录（留空时使用下面两个目录）",
    ),
    ForgeNeoSettingInfo("outdir_txt2img_grids", "output\\grids", "paths", "Output Directory for txt2img Grids", "文生图宫格输出目录"),
    ForgeNeoSettingInfo("outdir_img2img_grids", "output\\grids", "paths", "Output Directory for img2img Grids", "图生图宫格输出目录"),
    ForgeNeoSettingInfo(
        "outdir_save",
        "output\\images",
        "paths",
        'Directory for manually saving images via the "Save" button',
        "使用“保存”按钮手动保存图片的目录",
    ),
    ForgeNeoSettingInfo(
        "outdir_init_images",
        "output\\init-images",
        "paths",
        "Directory for saving img2img init images if enabled",
        "启用时保存图生图初始图的目录",
    ),
    ForgeNeoSettingInfo(
        "save_samples",
        True,
        "saving",
        'Automatically save every generated image (if disabled, images will needed to be manually saved via the "Save Image" button)',
        "自动保存每张生成图片（关闭后需要使用“保存图片”按钮手动保存）",
    ),
    ForgeNeoSettingInfo("enable_pnginfo", True, "infotext", "Write infotext to metadata of generated images", "将生成信息写入图片 metadata"),
    ForgeNeoSettingInfo("save_txt", False, "infotext", "Write infotext to a text file next to every generated image", "为每张生成图保存同名生成信息文本"),
    ForgeNeoSettingInfo(
        "save_write_log_csv",
        True,
        "saving",
        'Write generation parameters to log.csv when using the "Save" button',
        '使用 "Save" 按钮时写入 log.csv',
    ),
    ForgeNeoSettingInfo(
        "save_selected_only",
        True,
        "saving",
        'When using the "Save" button, only save the selected image',
        '使用 "Save" 按钮时只保存选中的图片',
    ),
    ForgeNeoSettingInfo("samples_format", "png", "saving", "Samples file format", "图片格式"),
    ForgeNeoSettingInfo("samples_filename_pattern", "", "saving", "Samples filename pattern", "文件名模板"),
    ForgeNeoSettingInfo("save_images_add_number", True, "saving", "Append an ascending number to the filename", "文件名追加递增编号"),
    ForgeNeoSettingInfo("save_images_existing_action", "Number Suffix", "saving", "Behavior when saving image to an existing filename", "保存到已有文件名时的行为"),
    ForgeNeoSettingInfo("grid_save", True, "saving", "Automatically save every generated image grid (e.g. for X/Y/Z Plot)", "自动保存生成宫格图（例如 X/Y/Z Plot）"),
    ForgeNeoSettingInfo("grid_format", "png", "saving", "Image Format for Grids", "宫格图格式"),
    ForgeNeoSettingInfo("grid_extended_filename", False, "saving", "Append extended info (seed, prompt, etc.) to the filename when saving grids", "保存宫格图时在文件名追加扩展信息（seed、prompt 等）"),
    ForgeNeoSettingInfo("grid_only_if_multiple", True, "saving", "Do not save grids that contain only one image", "不保存只包含一张图的宫格"),
    ForgeNeoSettingInfo("grid_prevent_empty_spots", False, "saving", "Prevent empty gaps within a grid", "避免宫格图出现空位"),
    ForgeNeoSettingInfo("grid_zip_filename_pattern", "", "saving", "Zip filename pattern", "Zip 文件名模板"),
    ForgeNeoSettingInfo("grid_row_count", -1, "saving", "Grid Row Count (-1 for autodetect; 0 for the same as batch size)", "宫格行数（-1 自动检测；0 等于批量大小）"),
    ForgeNeoSettingInfo("grid_text_color", "#000000", "saving", "Text Color for image grids", "宫格图文字颜色"),
    ForgeNeoSettingInfo("grid_inactive_text_color", "#999999", "saving", "Inactive Text Color for image grids", "宫格图非活动文字颜色"),
    ForgeNeoSettingInfo("grid_background_color", "#ffffff", "saving", "Background Color for image grids", "宫格图背景颜色"),
    ForgeNeoSettingInfo("save_init_img", False, "saving", "Save a copy of the init image before img2img", "图生图前保存初始图副本"),
    ForgeNeoSettingInfo("save_before_face_restoration", False, "saving", "Save a copy of the image before face restoration", "面部修复前保存图片副本"),
    ForgeNeoSettingInfo("save_before_highres_fix", False, "saving", "Save a copy of the image before Hires. fix", "高清修复前保存图片副本"),
    ForgeNeoSettingInfo("save_before_color_correction", False, "saving", "Save a copy of the image before color correction", "颜色校正前保存图片副本"),
    ForgeNeoSettingInfo("save_mask", False, "saving", "For inpainting, save a copy of the greyscale mask", "局部重绘时保存灰度蒙版副本"),
    ForgeNeoSettingInfo("save_mask_composite", False, "saving", "For inpainting, save the masked composite", "局部重绘时保存蒙版合成图"),
    ForgeNeoSettingInfo("jpeg_quality", 80, "saving", "JPEG Quality", "JPEG 质量"),
    ForgeNeoSettingInfo("webp_lossless", False, "saving", "Lossless WebP", "无损 WebP"),
    ForgeNeoSettingInfo("save_large_images_as_jpg", False, "saving", "Save copies of large images as JPG (if the following limits are met)", "满足下面限制时将大图副本保存为 JPG"),
    ForgeNeoSettingInfo("large_image_jpg_file_limit", 4, "saving", "File Size limit for the above option (in MB)", "上述选项的文件大小限制（MB）"),
    ForgeNeoSettingInfo("large_image_jpg_dimension_limit", 4000, "saving", "Width/height limit for the above option", "上述选项的宽高限制"),
    ForgeNeoSettingInfo("video_save_frames", False, "saving_videos", "Save intermediate frames when generating video", "生成视频时保存中间帧"),
    ForgeNeoSettingInfo("video_play_on_finish", True, "saving_videos", "Play the generated video when done", "完成后播放生成视频"),
    ForgeNeoSettingInfo("video_loop_playback", False, "saving_videos", "Make the video player loop the playback", "让视频播放器循环播放"),
    ForgeNeoSettingInfo("video_crf", 23, "saving_videos", "CRF", "CRF"),
    ForgeNeoSettingInfo("video_preset", "medium", "saving_videos", "Preset", "预设"),
    ForgeNeoSettingInfo("video_profile", "main", "saving_videos", "Profile", "Profile"),
    ForgeNeoSettingInfo("video_extension", "mp4", "saving_videos", "Extension", "扩展名"),
    ForgeNeoSettingInfo("save_to_dirs", False, "saving_subdirectory", "Save Images to Subdirectory", "保存图片到子目录"),
    ForgeNeoSettingInfo("grid_save_to_dirs", False, "saving_subdirectory", "Save Grids to Subdirectory", "保存宫格图到子目录"),
    ForgeNeoSettingInfo(
        "save_to_dirs_for_ui",
        False,
        "saving_subdirectory",
        'Save to subdirectory when manually saving images via the "Save" button',
        "通过“保存”按钮手动保存图片时保存到子目录",
    ),
    ForgeNeoSettingInfo("directories_filename_pattern", "[date]", "saving_subdirectory", "[wiki] Folder name pattern for subdirectories", "[wiki] 子目录文件夹名称模板"),
    ForgeNeoSettingInfo("directories_max_prompt_words", 8, "saving_subdirectory", "Max length of prompts for the [prompt_words] pattern", "[prompt_words] 模板的最大提示词长度"),
    ForgeNeoSettingInfo(
        "control_net_models_path",
        "",
        "control_net",
        "Extra Path to look for ControlNet Models (e.g. training output directory)",
        "额外 ControlNet 模型路径（例如训练输出目录）",
    ),
    ForgeNeoSettingInfo("control_net_unit_count", 3, "control_net", "Number of ControlNet Units (requires Reload UI)", "ControlNet 单元数量（需要重载 UI）"),
    ForgeNeoSettingInfo(
        "control_net_model_cache_size",
        3,
        "control_net",
        "Number of Models to Cache in Memory (requires Reload UI)",
        "内存中缓存的模型数量（需要重载 UI）",
    ),
    ForgeNeoSettingInfo(
        "control_net_sync_field_args",
        True,
        "control_net",
        "Read ControlNet parameters from Infotext (requires Reload UI)",
        "从 Infotext 读取 ControlNet 参数（需要重载 UI）",
    ),
    ForgeNeoSettingInfo("control_net_no_detectmap", False, "control_net", "Do not append detectmap to output", "不将 detectmap 附加到输出"),
    ForgeNeoSettingInfo("cross_attention_optimization", "Automatic", "optimizations", "Cross Attention Optimization", "Cross Attention 优化"),
    ForgeNeoSettingInfo(
        "persistent_cond_cache",
        True,
        "optimizations",
        "Persistent Cond Cache (do not re-encode prompts if only the Seed changes; note: may cause certain Infotext to be missing)",
        "持久化 Cond 缓存（仅种子变化时不重新编码提示词；注意：可能导致部分生成信息缺失）",
    ),
    ForgeNeoSettingInfo(
        "skip_early_cond",
        0.0,
        "optimizations",
        "Ignore Negative Prompt during Early Steps (in percentage of total steps; 0 = disable; higher = faster)",
        "早期采样忽略负面提示词（占总步数比例；0 为禁用；越高越快）",
    ),
    ForgeNeoSettingInfo(
        "s_min_uncond",
        0.0,
        "optimizations",
        'Skip Negative Prompt during Later Steps (in "sigma"; 0 = disable; higher = faster)',
        '后期采样跳过负面提示词（按 "sigma"；0 为禁用；越高越快）',
    ),
    ForgeNeoSettingInfo(
        "s_min_uncond_all",
        False,
        "optimizations",
        "For the above option, skip every step (otherwise, only skip every other step)",
        "对上方选项每一步都跳过（否则隔步跳过）",
    ),
    ForgeNeoSettingInfo(
        "token_merging_ratio",
        0.0,
        "optimizations",
        "Token Merging Ratio (0 = disable; higher = faster)",
        "Token Merging 比例（0 为禁用；越高越快）",
    ),
    ForgeNeoSettingInfo(
        "token_merging_ratio_img2img",
        0.0,
        "optimizations",
        "Token Merging Ratio for img2img (overrides base ratio if non-zero)",
        "图生图 Token Merging 比例（非零时覆盖基础比例）",
    ),
    ForgeNeoSettingInfo(
        "token_merging_ratio_hr",
        0.0,
        "optimizations",
        "Token Merging Ratio for Hires. fix (overrides base ratio if non-zero)",
        "高清修复 Token Merging 比例（非零时覆盖基础比例）",
    ),
    ForgeNeoSettingInfo("token_merging_stride", 2, "optimizations", "Token Merging - Stride (higher = faster)", "Token Merging - 步幅（越高越快）"),
    ForgeNeoSettingInfo(
        "token_merging_downsample",
        1,
        "optimizations",
        "Token Merging - Max Downsample (higher = faster)",
        "Token Merging - 最大下采样（越高越快）",
    ),
    ForgeNeoSettingInfo(
        "token_merging_no_rand",
        False,
        "optimizations",
        "Token Merging - No Random (reduce randomness by always fusing the same regions)",
        "Token Merging - 固定融合区域（减少随机性）",
    ),
    ForgeNeoSettingInfo("show_refiner", False, "refiner", "Display the Refiner Accordion", "显示 Refiner 折叠面板"),
    ForgeNeoSettingInfo("refiner_fast_sd", False, "refiner", 'Reload "state_dict" Only', '仅重载 "state_dict"'),
    ForgeNeoSettingInfo("refiner_use_steps", False, "refiner", 'Switch based on "steps" instead', '改为基于 "steps" 切换'),
    ForgeNeoSettingInfo("refiner_lora_replacement", "", "refiner", "Lora Replacements", "Lora 替换"),
    ForgeNeoSettingInfo("hide_samplers", [], "sampler_parameters", "Hide Samplers (requires Reload UI)", "隐藏采样器（需要重载 UI）"),
    ForgeNeoSettingInfo("sd_unet", "Automatic", "stable_diffusion", "SD UNet", "SD UNet"),
    ForgeNeoSettingInfo("emphasis", "Original", "stable_diffusion", "Emphasis Mode", "强调模式"),
    ForgeNeoSettingInfo("scaling_factor", 1.0, "stable_diffusion", "Epsilon Scaling", "Epsilon 缩放"),
    ForgeNeoSettingInfo("CLIP_stop_at_last_layers", 2, "stable_diffusion", "Clip Skip", "Clip Skip"),
    ForgeNeoSettingInfo("comma_padding_backtrack", 16, "stable_diffusion", "Token Wrap Length", "Token 换行长度"),
    ForgeNeoSettingInfo("tiling", False, "stable_diffusion", "Tiling", "平铺"),
    ForgeNeoSettingInfo("randn_source", "CPU", "stable_diffusion", "Random Number Generator", "随机数生成器"),
    ForgeNeoSettingInfo("sd_noise_schedule", "Default", "stable_diffusion", "Noise Schedule", "噪声计划"),
    ForgeNeoSettingInfo("sdxl_crop_top", 0, "stable_diffusion", "[SDXL] Crop-Top Coordinate", "[SDXL] 顶部裁剪坐标"),
    ForgeNeoSettingInfo("sdxl_crop_left", 0, "stable_diffusion", "[SDXL] Crop-Left Coordinate", "[SDXL] 左侧裁剪坐标"),
    ForgeNeoSettingInfo("sdxl_refiner_low_aesthetic_score", 2.5, "stable_diffusion", "[SDXL] Low Aesthetic Score", "[SDXL] 低美学分数"),
    ForgeNeoSettingInfo("sdxl_refiner_high_aesthetic_score", 6.0, "stable_diffusion", "[SDXL] High Aesthetic Score", "[SDXL] 高美学分数"),
    ForgeNeoSettingInfo(
        "sdxl_zero_neg",
        False,
        "stable_diffusion",
        "[SDXL] Zero out the conditioning when negative prompt is empty",
        "[SDXL] 负面提示词为空时清零 conditioning",
    ),
    ForgeNeoSettingInfo("neta_template_positive", "You are an assistant designed to generate anime images with the highest degree of image-text alignment based on danbooru tags. <Prompt Start>", "stable_diffusion", "[Lumina] Positive Template", "[Lumina] 正向模板"),
    ForgeNeoSettingInfo("neta_template_negative", "You are an assistant designed to generate low-quality images based on textual prompts. <Prompt Start>", "stable_diffusion", "[Lumina] Negative Template", "[Lumina] 负向模板"),
    ForgeNeoSettingInfo(
        "qwen_vae_resize",
        False,
        "stable_diffusion",
        "[Qwen-Image-Edit] Resize input image to 1 megapixel for ref_latent",
        "[Qwen-Image-Edit] 将输入图缩放到 1 百万像素用于 ref_latent",
    ),
    ForgeNeoSettingInfo(
        "klein_no_reference",
        False,
        "stable_diffusion",
        "[Klein] Disable Reference",
        "[Klein] 禁用参考",
    ),
    ForgeNeoSettingInfo("sd_vae", "Automatic", "vae", "SD VAE", "SD VAE"),
    ForgeNeoSettingInfo("sd_vae_encode_method", "Full", "vae", "VAE for Encoding", "VAE 编码方式"),
    ForgeNeoSettingInfo("sd_vae_decode_method", "Full", "vae", "VAE for Decoding", "VAE 解码方式"),
    ForgeNeoSettingInfo("inpainting_mask_weight", 1.0, "img2img", "Inpainting Conditioning Mask Strength", "局部重绘条件蒙版强度"),
    ForgeNeoSettingInfo("initial_noise_multiplier", 1.0, "img2img", "Noise Multiplier for img2img", "图生图噪声倍率"),
    ForgeNeoSettingInfo(
        "img2img_extra_noise",
        0.0,
        "img2img",
        "Extra Noise Multiplier for img2img and Hires. fix",
        "图生图和高清修复额外噪声倍率",
    ),
    ForgeNeoSettingInfo(
        "img2img_color_correction",
        False,
        "img2img",
        "Apply color correction to img2img results to match original colors",
        "对图生图结果应用颜色校正以匹配原图颜色",
    ),
    ForgeNeoSettingInfo(
        "img2img_fix_steps",
        False,
        "img2img",
        "During img2img, do exactly the number of Steps the slider specifies",
        "图生图时严格使用采样步数滑条指定的步数",
    ),
    ForgeNeoSettingInfo(
        "img2img_background_color",
        "#808080",
        "img2img",
        "For img2img, fill the transparent parts of the input image with this color",
        "图生图时用此颜色填充输入图透明区域",
    ),
    ForgeNeoSettingInfo("img2img_sketch_default_brush_color", "#ff0000", "img2img", "Initial Brush Color for Sketch", "Sketch 初始画笔颜色"),
    ForgeNeoSettingInfo("img2img_inpaint_mask_brush_color", "#808080", "img2img", "Brush Color for Inpaint Mask", "局部重绘蒙版画笔颜色"),
    ForgeNeoSettingInfo(
        "img2img_inpaint_sketch_default_brush_color",
        "#ff0000",
        "img2img",
        "Initial Brush Color for Inpaint Sketch",
        "局部重绘 Sketch 初始画笔颜色",
    ),
    ForgeNeoSettingInfo(
        "img2img_inpaint_mask_high_contrast",
        True,
        "img2img",
        "Use high-contrast brush for inpainting",
        "局部重绘使用高对比度画笔",
    ),
    ForgeNeoSettingInfo("img2img_inpaint_mask_scribble_alpha", 75, "img2img", "Inpaint mask alpha (transparency)", "局部重绘蒙版透明度"),
    ForgeNeoSettingInfo("return_mask", False, "img2img", "For inpainting, append the greyscale mask to results", "局部重绘时将灰度蒙版附加到结果"),
    ForgeNeoSettingInfo("return_mask_composite", False, "img2img", "For inpainting, append the masked composite to results", "局部重绘时将蒙版合成图附加到结果"),
    ForgeNeoSettingInfo(
        "img2img_batch_show_results_limit",
        32,
        "img2img",
        "Show the first N batch of img2img results in UI",
        "在界面显示前 N 个图生图批量结果",
    ),
    ForgeNeoSettingInfo(
        "overlay_inpaint",
        True,
        "img2img",
        "For inpainting, overlay the resulting image back onto the original image",
        "局部重绘时将结果叠回原图",
    ),
    ForgeNeoSettingInfo(
        "img2img_autosize",
        False,
        "img2img",
        "Automatically update the Width and Height when uploading image to img2img input",
        "上传图生图输入图时自动更新宽高",
    ),
    ForgeNeoSettingInfo(
        "img2img_batch_use_original_name",
        False,
        "img2img",
        "In img2img Batch, use the input filenames when saving",
        "图生图批量保存时使用输入文件名",
    ),
    ForgeNeoSettingInfo(
        "img2img_inpaint_precise_mask",
        False,
        "img2img",
        'Process the "Mask blur" in fp32 instead of uint8 precision',
        '用 fp32 而非 uint8 精度处理 "Mask blur"',
    ),
    ForgeNeoSettingInfo(
        "txt2img_upscale_single_batch",
        True,
        "txt2img",
        "When using the [✨] button, lock the Batch Count and Batch Size to 1 regardless of the UI values",
        "使用 [✨] 按钮时无论界面值如何都将批次数和批大小锁定为 1",
    ),
    ForgeNeoSettingInfo(
        "txt2img_upscale_same_seed",
        True,
        "txt2img",
        "When using the [✨] button, pass the Seed of the input image instead of the UI value",
        "使用 [✨] 按钮时传入输入图的 Seed，而不是界面当前值",
    ),
    ForgeNeoSettingInfo(
        "hires_button_gallery_insert",
        False,
        "txt2img",
        "When using the [✨] button, insert the upscaled image to the gallery",
        "使用 [✨] 按钮时将放大图插入图库",
    ),
    ForgeNeoSettingInfo(
        "hires_insert_index",
        True,
        "txt2img",
        "When the above option is enabled, automatically select the upscaled image",
        "启用上方选项时自动选择放大后的图片",
    ),
    ForgeNeoSettingInfo(
        "use_old_hires_fix_width_height",
        False,
        "txt2img",
        "For Hires. Fix, use Width/Height sliders to set the final resolution",
        "高清修复使用宽高滑条设置最终分辨率",
    ),
    ForgeNeoSettingInfo(
        "hires_fix_use_firstpass_conds",
        False,
        "txt2img",
        "For Hires. Fix, calculate conds of Hires. pass using Extra Networks of the normal pass",
        "高清修复使用普通阶段的 Extra Networks 计算高清阶段 conds",
    ),
    ForgeNeoSettingInfo("enable_prompt_comments", True, "ui_comments", "Remove Comments from Prompts", "从提示词中移除注释"),
    ForgeNeoSettingInfo("save_prompt_comments", False, "ui_comments", "Save Raw Comments", "保存原始注释"),
    ForgeNeoSettingInfo("forge_canvas_height", 512, "ui_forgecanvas", "Canvas Height", "画布高度"),
    ForgeNeoSettingInfo("forge_canvas_toolbar_always", False, "ui_forgecanvas", "Always Visible Toolbar", "工具栏始终可见"),
    ForgeNeoSettingInfo("forge_canvas_consistent_brush", False, "ui_forgecanvas", "Fixed Brush Size", "固定画笔尺寸"),
    ForgeNeoSettingInfo("forge_canvas_plain", False, "ui_forgecanvas", "Plain Background", "纯色背景"),
    ForgeNeoSettingInfo("forge_canvas_plain_color", "#808080", "ui_forgecanvas", "Solid Color for Plain Background", "纯色背景颜色"),
    ForgeNeoSettingInfo("do_not_show_images", False, "ui_gallery", "Do not show any image in gallery", "图库中不显示任何图片"),
    ForgeNeoSettingInfo("gallery_height", "", "ui_gallery", "Gallery Height", "图库高度"),
    ForgeNeoSettingInfo("return_grid", True, "ui_gallery", "Show Grids in gallery", "在图库中显示宫格图"),
    ForgeNeoSettingInfo("js_modal_lightbox", True, "ui_gallery", 'Enable "Lightbox"', "启用 Lightbox"),
    ForgeNeoSettingInfo("js_modal_lightbox_initially_zoomed", True, "ui_gallery", "[Lightbox]: show images zoomed in by default", "[Lightbox] 默认放大显示图片"),
    ForgeNeoSettingInfo("js_modal_lightbox_gamepad", False, "ui_gallery", "[Lightbox]: navigate with gamepad", "[Lightbox] 使用手柄导航"),
    ForgeNeoSettingInfo("js_modal_lightbox_gamepad_repeat", 250, "ui_gallery", "[Lightbox]: gamepad repeat period", "[Lightbox] 手柄重复间隔"),
    ForgeNeoSettingInfo(
        "sd_webui_modal_lightbox_icon_opacity",
        1.0,
        "ui_gallery",
        "[Lightbox]: control icon unfocused opacity",
        "[Lightbox] 控制图标非聚焦透明度",
    ),
    ForgeNeoSettingInfo(
        "sd_webui_modal_lightbox_toolbar_opacity",
        0.9,
        "ui_gallery",
        "[Lightbox]: tool bar opacity",
        "[Lightbox] 工具栏透明度",
    ),
    ForgeNeoSettingInfo("open_dir_button_choice", "Subdirectory", "ui_gallery", "What directory the [📂] button opens", "[📂] 按钮打开的目录"),
    ForgeNeoSettingInfo("add_model_name_to_info", True, "infotext", "Add model name to infotext", "生成信息中加入模型名称"),
    ForgeNeoSettingInfo("add_model_hash_to_info", True, "infotext", "Add model hash to infotext", "生成信息中加入模型哈希"),
    ForgeNeoSettingInfo("add_user_name_to_info", False, "infotext", "Add user name to infotext when authenticated", "认证时生成信息中加入用户名"),
    ForgeNeoSettingInfo("add_version_to_infotext", True, "infotext", "Add webui version to infotext", "生成信息中加入 WebUI 版本"),
    ForgeNeoSettingInfo("disable_weights_auto_swap", True, "infotext", "Ignore the Checkpoint when reading infotext", "读取生成信息时忽略 Checkpoint"),
    ForgeNeoSettingInfo("disable_modules_auto_swap", True, "infotext", "Ignore the VAE / Text Encoder when reading infotext", "读取生成信息时忽略 VAE / Text Encoder"),
    ForgeNeoSettingInfo("infotext_skip_pasting", [], "infotext", "Ignore fields when reading infotext", "读取生成信息时忽略字段"),
    ForgeNeoSettingInfo("infotext_styles", "Apply if any", "infotext", "Infer Styles when reading infotext", "读取生成信息时推断 Styles"),
    ForgeNeoSettingInfo(
        "keyedit_precision_attention",
        0.1,
        "ui_prompt_editing",
        "Precision for (attention:1.1) when editing the prompt with Ctrl + Up/Down",
        "使用 Ctrl + 上/下编辑 (attention:1.1) 时的精度",
    ),
    ForgeNeoSettingInfo(
        "keyedit_precision_extra",
        0.05,
        "ui_prompt_editing",
        "Precision for <lora:0.9> when editing the prompt with Ctrl + Up/Down",
        "使用 Ctrl + 上/下编辑 <lora:0.9> 时的精度",
    ),
    ForgeNeoSettingInfo(
        "keyedit_delimiters",
        r".,\/!?%^*;:{}=`~() ",
        "ui_prompt_editing",
        "RegEx Delimiters when editing the prompt with Ctrl + Up/Down",
        "使用 Ctrl + 上/下编辑提示词时的正则分隔符",
    ),
    ForgeNeoSettingInfo(
        "keyedit_delimiters_whitespace",
        ["Tab", "Carriage Return", "Line Feed"],
        "ui_prompt_editing",
        "Whitespace Delimiters when editing the prompt with Ctrl + Up/Down",
        "使用 Ctrl + 上/下编辑提示词时的空白分隔符",
    ),
    ForgeNeoSettingInfo("keyedit_move", True, "ui_prompt_editing", "Alt + Left/Right moves prompt chunks", "Alt + 左/右移动提示词片段"),
    ForgeNeoSettingInfo("disable_token_counters", False, "ui_prompt_editing", "Disable Token Counter", "禁用 Token 计数器"),
    ForgeNeoSettingInfo("include_styles_into_token_counters", True, "ui_prompt_editing", "Include enabled Styles in Token Count", "Token 计数包含已启用 Styles"),
) + TAGCOMPLETE_SETTINGS_SCHEMA + (
    ForgeNeoSettingInfo("extra_options_txt2img", [], "settings_in_ui", "Settings for txt2img", "txt2img 界面附加设置"),
    ForgeNeoSettingInfo("extra_options_img2img", [], "settings_in_ui", "Settings for img2img", "img2img 界面附加设置"),
    ForgeNeoSettingInfo("extra_options_cols", 1, "settings_in_ui", "Number of columns for added settings", "附加设置列数"),
    ForgeNeoSettingInfo("extra_options_accordion", False, "settings_in_ui", "Place added settings into an accordion", "将附加设置放入折叠面板"),
    ForgeNeoSettingInfo("show_rescale_cfg", False, "ui_alternatives", "Display the Rescale CFG Slider", "显示 Rescale CFG 滑条"),
    ForgeNeoSettingInfo("show_mahiro", False, "ui_alternatives", "Display the MaHiRo Toggle", "显示 MaHiRo 开关"),
    ForgeNeoSettingInfo(
        "paste_safe_guard",
        False,
        "ui_alternatives",
        'Disable the "Read generation parameters" button (↙️) when negative prompt is not empty',
        "反向提示词非空时禁用读取生成参数按钮（↙️）",
    ),
    ForgeNeoSettingInfo(
        "ctrl_enter_interrupt",
        False,
        "ui_alternatives",
        "Revert [Ctrl + Enter] to only interrupt the generation",
        "将 Ctrl + Enter 恢复为仅中断生成",
    ),
    ForgeNeoSettingInfo("quicksettings_accordion", False, "ui_alternatives", "Place the Quicksettings under an Accordion", "将 Quicksettings 放入折叠面板"),
    ForgeNeoSettingInfo("quicksettings_accordion_starts_closed", False, "ui_alternatives", "Close the Accordion on startup", "启动时关闭 Quicksettings 折叠面板"),
    ForgeNeoSettingInfo(
        "remove_image_on_hover",
        True,
        "ui_alternatives",
        "For image inputs in Extras and PNG Info, remove the current image when dragging another image over it",
        "Extras 和 PNG Info 图片输入区拖入新图时移除当前图片",
    ),
    ForgeNeoSettingInfo("forbidden_knowledge", False, "ui_alternatives", "Forbidden Knowledge", "Forbidden Knowledge"),
    ForgeNeoSettingInfo("hires_fix_show_sampler", False, "ui_alternatives", "[Hires. fix]: Show checkpoint, sampler, scheduler, and cfg options", "[Hires. fix] 显示 checkpoint、采样器、调度器和 CFG 选项"),
    ForgeNeoSettingInfo("hires_fix_show_prompts", False, "ui_alternatives", "[Hires. fix]: Show prompt and negative prompt textboxes", "[Hires. fix] 显示正向和反向提示词输入框"),
    ForgeNeoSettingInfo("txt2img_settings_accordion", False, "ui_alternatives", "Put txt2img parameters under Accordion", "将 txt2img 参数放入折叠面板"),
    ForgeNeoSettingInfo("img2img_settings_accordion", False, "ui_alternatives", "Put img2img parameters under Accordion", "将 img2img 参数放入折叠面板"),
    ForgeNeoSettingInfo(
        "interrupt_after_current",
        False,
        "ui_alternatives",
        "Don't Interrupt in the middle",
        "不要在中途立刻中断",
    ),
    ForgeNeoSettingInfo("live_previews_enable", True, "preview", "Show live previews during sampling", "采样时显示预览"),
    ForgeNeoSettingInfo("show_progressbar", True, "preview", "Show progress bar", "显示进度条"),
    ForgeNeoSettingInfo("live_preview_refresh_period", 500, "preview", "Preview refresh period (ms)", "预览刷新间隔（毫秒）"),
    ForgeNeoSettingInfo("extra_networks_default_multiplier", 1.0, "extra_networks", "Default weight for Extra Networks", "Extra Networks 默认权重"),
    ForgeNeoSettingInfo("extra_networks_add_text_separator", ", ", "extra_networks", "Extra Networks token separator", "额外网络 token 分隔符"),
    ForgeNeoSettingInfo("extra_networks_card_width", 0, "extra_networks", "Card width", "卡片宽度"),
    ForgeNeoSettingInfo("extra_networks_card_height", 0, "extra_networks", "Card height", "卡片高度"),
    ForgeNeoSettingInfo("localization", "None", "ui", "Localization", "本地化"),
    ForgeNeoSettingInfo("quicksettings_list", [], "ui", "Quicksettings List", "Quicksettings 列表"),
    ForgeNeoSettingInfo("ui_tab_order", [], "ui", "UI Tab Order", "UI 标签顺序"),
    ForgeNeoSettingInfo("hidden_tabs", [], "ui", "Hide UI Tabs", "隐藏 UI 标签"),
    ForgeNeoSettingInfo("ui_reorder_list", [], "ui", "Parameter order for txt2img / img2img", "txt2img / img2img 参数顺序"),
    ForgeNeoSettingInfo("gradio_theme", "Default", "ui", "Gradio Theme", "Gradio 主题"),
    ForgeNeoSettingInfo("gradio_themes_cache", True, "ui", "Cache selected theme locally", "本地缓存选中的主题"),
    ForgeNeoSettingInfo("show_progress_in_title", True, "ui", "Show generation progress in window title", "窗口标题显示生成进度"),
    ForgeNeoSettingInfo("send_seed", True, "ui", 'Send the Seed information when using the "Send to" buttons', '使用 "Send to" 按钮时发送 Seed 信息'),
    ForgeNeoSettingInfo("send_cfg", True, "ui", 'Send the CFG information when using the "Send to" buttons', '使用 "Send to" 按钮时发送 CFG 信息'),
    ForgeNeoSettingInfo("send_size", True, "ui", 'Send the Resolution information when using the "Send to" buttons', '使用 "Send to" 按钮时发送分辨率信息'),
    ForgeNeoSettingInfo(
        "send_image_info_not_ui",
        False,
        "ui",
        'Send the Parameters in the infotext instead of the UI fields when using the "Send to" buttons',
        '使用 "Send to" 按钮时发送生成信息中的参数而非 UI 字段',
    ),
    ForgeNeoSettingInfo(
        "allow_i2i_send_info",
        False,
        "ui",
        'Send the Parameters too when using the "Send to" buttons in img2img tab',
        '在 img2img 标签中使用 "Send to" 按钮时也发送参数',
    ),
    ForgeNeoSettingInfo("enable_reloading_ui_scripts", False, "ui", 'Additionally reload the "modules.ui" scripts when using "Reload UI"', '使用 "Reload UI" 时额外重新加载 modules.ui 脚本'),
    ForgeNeoSettingInfo("sd_checkpoint_dropdown_use_short", False, "ui_alternatives", "Show filenames without folder in the Checkpoint dropdown", "Checkpoint 下拉只显示不带目录的文件名"),
    ForgeNeoSettingInfo("dimensions_and_batch_together", True, "ui_alternatives", "Show Width/Height and Batch sliders in same row", "宽高和批量滑条显示在同一行"),
    ForgeNeoSettingInfo("prompt_box_style", "Default", "ui_alternatives", "Prompt Layout", "提示词布局"),
    ForgeNeoSettingInfo("api_enable_requests", True, "api", 'Allow "http://" and "https://" URLs as input images', "允许将 http/https URL 作为输入图片"),
    ForgeNeoSettingInfo("api_forbid_local_requests", True, "api", "Forbid URLs to local resources", "禁止访问本地资源 URL"),
    ForgeNeoSettingInfo("api_useragent", "", "api", "User Agent for Requests", "请求使用的 User Agent"),
) + CALLBACK_PRIORITY_SETTINGS_SCHEMA + (
    ForgeNeoSettingInfo("profiling_enable", False, "profiler", "Enable Profiling", "启用性能分析"),
    ForgeNeoSettingInfo("profiling_activities", ["CPU"], "profiler", "Activities", "活动"),
    ForgeNeoSettingInfo("profiling_record_shapes", True, "profiler", "Record Shapes", "记录张量形状"),
    ForgeNeoSettingInfo("profiling_profile_memory", True, "profiler", "Profile Memory", "分析内存"),
    ForgeNeoSettingInfo("profiling_with_stack", True, "profiler", "Include Python Stack", "包含 Python 调用栈"),
    ForgeNeoSettingInfo("profiling_filename", "trace.json", "profiler", "Profile Filename", "性能分析文件名"),
    ForgeNeoSettingInfo("setting_allocated_vram", 1.0, "system", "GPU Weights", "GPU 权重"),
    ForgeNeoSettingInfo("res_step", 64, "system", "Resolution Step", "分辨率步进"),
    ForgeNeoSettingInfo("auto_launch_browser", "Local", "system", "Launch the webui in browser on startup", "启动时在浏览器打开 WebUI"),
    ForgeNeoSettingInfo("enable_console_prompts", False, "system", "Print the generation prompts to console", "在控制台打印生成提示词"),
    ForgeNeoSettingInfo("samples_log_stdout", False, "system", "Print the generation infotxt to console", "在控制台打印生成信息"),
    ForgeNeoSettingInfo("show_warnings", False, "system", "Show warnings in console", "在控制台显示警告"),
    ForgeNeoSettingInfo("show_gradio_deprecation_warnings", False, "system", "Show gradio deprecation warnings in console", "在控制台显示 Gradio 弃用警告"),
    ForgeNeoSettingInfo("memmon_poll_rate", 5, "system", "VRAM usage polls per second during generation", "生成时每秒查询 VRAM 次数"),
    ForgeNeoSettingInfo("multiple_tqdm", True, "system", "Add an additional progress bar to the console to show the total progress of an entire job", "在控制台显示任务总进度条"),
    ForgeNeoSettingInfo("enable_upscale_progressbar", True, "system", "Show a progress bar in the console for tiled upscaling", "分块放大时在控制台显示进度条"),
    ForgeNeoSettingInfo("list_hidden_files", True, "system", "List the models/files under hidden directories", "列出隐藏目录下的模型/文件"),
    ForgeNeoSettingInfo("dump_stacks_on_signal", False, "system", "Print the stack trace before terminating the webui via Ctrl + C", "Ctrl+C 结束前打印调用栈"),
    ForgeNeoSettingInfo("no_spellcheck", False, "system", "Disable auto-correct / spellcheck for prompt fields", "禁用提示词输入框自动更正/拼写检查"),
    ForgeNeoSettingInfo("face_restoration", False, "face_restoration", "Restore Faces", "修复面部"),
    ForgeNeoSettingInfo("face_restoration_model", "CodeFormer", "face_restoration", "Face Restoration Model", "面部修复模型"),
    ForgeNeoSettingInfo("code_former_weight", 0.5, "face_restoration", "CodeFormer Strength", "CodeFormer 强度"),
    ForgeNeoSettingInfo("face_restoration_unload", False, "face_restoration", "Move the model to CPU after restoration", "修复后将模型移到 CPU"),
    ForgeNeoSettingInfo("postprocessing_enable_in_main_ui", [], "postprocessing", "Enable Postprocessing operations in txt2img and img2img", "在 txt2img 和 img2img 中启用后处理操作"),
    ForgeNeoSettingInfo("postprocessing_disable_in_extras", [], "postprocessing", "Disable Postprocessing operations in Extras tab", "在 Extras 中禁用后处理操作"),
    ForgeNeoSettingInfo("postprocessing_operation_order", [], "postprocessing", "Order of Postprocessing operations", "后处理操作顺序"),
    ForgeNeoSettingInfo("ESRGAN_tile", 256, "upscaling", "Tile Size for Upscalers", "放大器分块尺寸"),
    ForgeNeoSettingInfo("ESRGAN_tile_overlap", 16, "upscaling", "Tile Overlap for Upscalers", "放大器分块重叠"),
    ForgeNeoSettingInfo("composite_tiles_on_gpu", False, "upscaling", "Composite the Tiles on GPU", "在 GPU 上合成分块"),
    ForgeNeoSettingInfo("upscaler_for_img2img", "None", "upscaling", "Upscaler for img2img", "img2img 放大器"),
    ForgeNeoSettingInfo("upscaling_max_images_in_cache", 4, "upscaling", "Number of upscaled images to cache", "缓存的放大图片数量"),
    ForgeNeoSettingInfo("set_scale_by_when_changing_upscaler", True, "upscaling", 'Automatically set the "Scale by" factor based on the name of the selected Upscaler', '根据所选放大器名称自动设置 "Scale by" 倍率'),
    ForgeNeoSettingInfo("prefer_fp16_upscalers", False, "upscaling", "Prefer to load Upscaler in half precision", "优先以半精度加载放大器"),
    ForgeNeoSettingInfo("svdq_cpu_offload", False, "nunchaku", "CPU Offload", "CPU Offload"),
    ForgeNeoSettingInfo("svdq_cache_threshold", 0.0, "nunchaku", "Cache Threshold", "缓存阈值"),
    ForgeNeoSettingInfo("svdq_attention", "nunchaku-fp16", "nunchaku", "Attention", "Attention"),
    ForgeNeoSettingInfo("svdq_use_pin_memory", False, "nunchaku", "Use Pinned Memory", "使用 Pinned Memory"),
    ForgeNeoSettingInfo("svdq_num_blocks_on_gpu", 60, "nunchaku", "Blocks on GPU", "GPU 上的 Blocks 数量"),
) + FORGE_COUPLE_SETTINGS_SCHEMA + PRESET_SETTINGS_SCHEMA

DEFAULT_SETTINGS: dict[str, Any] = {item.key: item.default for item in SETTINGS_SCHEMA}

SECTION_LABELS: dict[str, tuple[str, str]] = {
    "paths": ("Paths for Saving", "保存路径"),
    "saving": ("Saving Images/Grids", "图像/宫格保存"),
    "saving_videos": ("Saving Videos", "视频保存"),
    "saving_subdirectory": ("Saving to Subdirectory", "保存到子目录"),
    "control_net": ("ControlNet", "ControlNet"),
    "optimizations": ("Optimizations", "优化"),
    "refiner": ("Refiner", "精修"),
    "sampler_parameters": ("Sampler Parameters", "采样器参数"),
    "stable_diffusion": ("Stable Diffusion", "Stable Diffusion"),
    "vae": ("VAE", "VAE"),
    "img2img": ("img2img", "图生图"),
    "txt2img": ("txt2img", "文生图"),
    "ui_comments": ("Comments", "评论"),
    "ui_forgecanvas": ("Forge Canvas", "Forge Canvas"),
    "ui_gallery": ("Gallery", "图库"),
    "infotext": ("Infotext", "生成信息"),
    "ui_prompt_editing": ("Prompt Editing", "提示词编辑"),
    "tag_complete": ("Tag Autocomplete", "标签补全"),
    "forge_couple": ("Forge Couple", "Forge Couple"),
    "settings_in_ui": ("Settings in UI", "UI 内设置"),
    "ui_alternatives": ("UI Alternatives", "UI Alternatives"),
    "preview": ("Live Previews", "实时预览"),
    "extra_networks": ("Extra Networks", "额外网络"),
    "ui": ("User Interface", "界面"),
    "api": ("API", "API"),
    "callbacks": ("Callbacks", "回调"),
    "profiler": ("Profiler", "性能分析"),
    "system": ("System", "系统"),
    "face_restoration": ("Face Restoration", "面部修复"),
    "postprocessing": ("Postprocessing", "后处理"),
    "upscaling": ("Upscaling", "放大"),
    "nunchaku": ("Nunchaku", "Nunchaku"),
    **{f"ui_{arch}": (PRESET_DISPLAY_NAMES[arch], PRESET_DISPLAY_NAMES[arch]) for arch in PRESET_ARCHES},
}


def _is_english(lang: object | None = None) -> bool:
    return str(lang or "cn").lower().startswith("en")


def setting_section_label(section: str, lang: object | None = None) -> str:
    en, cn = SECTION_LABELS.get(section, (section, section))
    return en if _is_english(lang) else cn


def setting_label(info: ForgeNeoSettingInfo, lang: object | None = None) -> str:
    return info.label_en if _is_english(lang) else info.label_cn


def _coerce_value(key: str, value: Any) -> Any:
    default = DEFAULT_SETTINGS[key]
    if isinstance(default, list):
        if value is None:
            return list(default)
        if isinstance(value, (list, tuple, set)):
            return [str(item) for item in value if str(item or "").strip()]
        text = str(value or "").strip()
        return [text] if text else list(default)
    if isinstance(default, bool):
        return bool(value)
    if isinstance(default, int) and not isinstance(default, bool):
        try:
            return int(value)
        except Exception:
            return int(default)
    if isinstance(default, float):
        try:
            return float(value)
        except Exception:
            return float(default)
    return str(value or "")


def settings_path() -> Path:
    config = ensure_config()
    base = Path(getattr(config, "path_userhome", "") or ".")
    path = base / "forge_neo" / "forge_neo_settings.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def normalize_settings(values: dict[str, Any] | None) -> dict[str, Any]:
    data = dict(DEFAULT_SETTINGS)
    for key in DEFAULT_SETTINGS:
        if values and key in values:
            data[key] = _coerce_value(key, values[key])
    return data


def load_settings() -> dict[str, Any]:
    path = settings_path()
    if not path.exists():
        return dict(DEFAULT_SETTINGS)
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return dict(DEFAULT_SETTINGS)
    return normalize_settings(loaded if isinstance(loaded, dict) else {})


def save_settings(values: dict[str, Any]) -> dict[str, Any]:
    data = normalize_settings(values)
    settings_path().write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def reset_settings() -> dict[str, Any]:
    return save_settings(dict(DEFAULT_SETTINGS))


def settings_json(values: dict[str, Any] | None = None) -> str:
    return json.dumps(normalize_settings(values), ensure_ascii=False, indent=2)


def settings_search_rows(
    query: object = "",
    *,
    include_all: bool = False,
    values: dict[str, Any] | None = None,
    lang: object | None = None,
) -> dict[str, Any]:
    data = normalize_settings(values or load_settings())
    normalized_query = str(query or "").strip().lower()
    rows: list[dict[str, Any]] = []
    for info in SETTINGS_SCHEMA:
        section_en, section_cn = SECTION_LABELS.get(info.section, (info.section, info.section))
        searchable = " ".join([info.key, info.label_en, info.label_cn, section_en, section_cn]).lower()
        if not include_all and (not normalized_query or normalized_query not in searchable):
            continue
        rows.append(
            {
                "key": info.key,
                "section": setting_section_label(info.section, lang),
                "label": setting_label(info, lang),
                "value": data.get(info.key, info.default),
                "default": info.default,
            }
        )
    return {
        "query": str(query or ""),
        "include_all": include_all,
        "rows": rows,
        "total_count": len(rows),
    }


def settings_summary() -> dict[str, Any]:
    config = ensure_config()
    return {
        "entry": "webui-forge-neo.py",
        "source_project": SOURCE_PROJECT,
        "source_branch": SOURCE_BRANCH,
        "source_commit": SOURCE_COMMIT,
        "source_license": SOURCE_LICENSE,
        "gradio": getattr(args_manager.args, "gradio_version", ""),
        "python": platform.python_version(),
        "userhome": str(getattr(config, "path_userhome", "")),
        "models_root": str(getattr(config, "path_models_root", "")),
        "settings_file": str(settings_path()),
    }


def sysinfo_snapshot() -> dict[str, Any]:
    return {
        "mode": "forge-neo-sysinfo",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **settings_summary(),
        "settings": load_settings(),
        "settings_schema": [
            {
                "key": item.key,
                "default": item.default,
                "section": item.section,
                "label_en": item.label_en,
                "label_cn": item.label_cn,
            }
            for item in SETTINGS_SCHEMA
        ],
    }


def sysinfo_path() -> Path:
    config = ensure_config()
    base = Path(getattr(config, "path_userhome", "") or ".")
    path = base / "forge_neo" / "forge_neo_sysinfo.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def save_sysinfo() -> tuple[Path, dict[str, Any]]:
    data = sysinfo_snapshot()
    path = sysinfo_path()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return path, data


def _sysinfo_file_path(value: Any) -> Path | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return _sysinfo_file_path(value[0] if value else None)
    if isinstance(value, dict):
        for key in ("path", "name", "orig_name"):
            if value.get(key):
                return Path(str(value[key]))
        return None
    name = getattr(value, "name", None)
    if name:
        return Path(str(name))
    return Path(str(value))


def check_sysinfo_file(value: Any) -> dict[str, Any]:
    path = _sysinfo_file_path(value)
    if path is None:
        return {"valid": False, "message": "No sysinfo file selected.", "path": ""}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"valid": False, "message": "Invalid JSON sysinfo file.", "path": str(path), "error": str(exc)}
    if not isinstance(data, dict):
        return {"valid": False, "message": "Sysinfo JSON must be an object.", "path": str(path)}
    required = {
        "entry": "webui-forge-neo.py",
        "source_project": SOURCE_PROJECT,
        "source_branch": SOURCE_BRANCH,
        "source_commit": SOURCE_COMMIT,
    }
    missing = [key for key, expected in required.items() if data.get(key) != expected]
    if missing:
        return {
            "valid": False,
            "message": "Sysinfo file does not match Forge Neo.",
            "path": str(path),
            "missing": missing,
        }
    return {
        "valid": True,
        "message": "Valid Forge Neo sysinfo file.",
        "path": str(path),
        "entry": data.get("entry", ""),
        "generated_at": data.get("generated_at", ""),
    }
