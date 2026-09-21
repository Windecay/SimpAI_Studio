import csv
import json
import logging
import os
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import threading
from collections import defaultdict

import modules.canvas_danbooru_policy as canvas_danbooru_policy


logger = logging.getLogger(__name__)
_CANVAS_DANBOORU_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


_canvas_danbooru_tag_cache = {}
_canvas_danbooru_autocomplete_cache = {}
_canvas_danbooru_character_index_cache = {}
_canvas_danbooru_character_fast_resolution_cache = {}
_canvas_gallery_tag_cache = {}
_canvas_danbooru_fast_backend_cache = {}
_canvas_danbooru_fast_lookup_cache = {}
_canvas_danbooru_fast_runtime_status_cache = {}
_canvas_danbooru_fast_build_lock = threading.Lock()
_canvas_danbooru_autocomplete_lock = threading.Lock()

_CANVAS_DANBOORU_CATEGORY_LABELS = {
    "0": "general",
    "1": "artist",
    "3": "copyright",
    "4": "character",
    "5": "meta",
}


def _canvas_danbooru_fast_exe_name():
    return "danbooru-tags.exe" if os.name == "nt" else "danbooru-tags"


def _canvas_danbooru_fast_runtime_status():
    status = _canvas_danbooru_fast_runtime_status_cache if isinstance(_canvas_danbooru_fast_runtime_status_cache, dict) else {}
    return {
        "state": str(status.get("state") or "unknown"),
        "level": str(status.get("level") or "info"),
        "message": str(status.get("message") or ""),
        "message_cn": str(status.get("message_cn") or ""),
        "backend": str(status.get("backend") or ""),
        "auto_build": bool(status.get("auto_build")),
    }


def _canvas_danbooru_fast_set_runtime_status(state, message="", message_cn="", level="info", backend="", auto_build=False):
    _canvas_danbooru_fast_runtime_status_cache.clear()
    _canvas_danbooru_fast_runtime_status_cache.update({
        "state": str(state or "unknown"),
        "level": str(level or "info"),
        "message": str(message or ""),
        "message_cn": str(message_cn or ""),
        "backend": str(backend or ""),
        "auto_build": bool(auto_build),
    })


def _canvas_danbooru_fast_vendor_root():
    return os.path.abspath(os.path.join(_CANVAS_DANBOORU_ROOT, "vendor", "danbooru-tags"))


def _canvas_danbooru_fast_is_repo_vendor_root(root):
    try:
        return os.path.normcase(os.path.abspath(root)) == os.path.normcase(_canvas_danbooru_fast_vendor_root())
    except Exception:
        return False


def _canvas_danbooru_fast_chmod_executable(path):
    if os.name == "nt" or not os.path.isfile(path):
        return
    try:
        current_mode = os.stat(path).st_mode
        os.chmod(path, current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    except OSError as exc:
        logger.warning("Danbooru Rust backend exists but could not be marked executable: %s", exc)


def _canvas_danbooru_fast_prepare_linux_runtime(root, exe_path):
    if os.name == "nt" or not _canvas_danbooru_fast_is_repo_vendor_root(root):
        return False
    if os.path.isfile(exe_path):
        if not os.access(exe_path, os.X_OK):
            _canvas_danbooru_fast_chmod_executable(exe_path)
        return False

    source_root = _CANVAS_DANBOORU_ROOT
    manifest = os.path.join(source_root, "rust", "danbooru-tags", "Cargo.toml")
    cargo = shutil.which("cargo")
    if not cargo:
        _canvas_danbooru_fast_set_runtime_status(
            "fallback",
            "Linux Danbooru Rust backend is not built. Install Rust/Cargo or provide vendor/danbooru-tags/bin/danbooru-tags; falling back to Python/CSV lookup.",
            "Linux Danbooru Rust 后端尚未构建。请安装 Rust/Cargo，或提供 vendor/danbooru-tags/bin/danbooru-tags；当前回退到 Python/CSV 查询。",
            level="warning",
            backend=exe_path,
        )
        logger.warning(_canvas_danbooru_fast_runtime_status_cache["message"])
        return False
    if not os.path.isfile(manifest):
        _canvas_danbooru_fast_set_runtime_status(
            "fallback",
            "Linux Danbooru Rust backend source is missing; falling back to Python/CSV lookup.",
            "Linux Danbooru Rust 后端源码不存在；当前回退到 Python/CSV 查询。",
            level="warning",
            backend=exe_path,
        )
        logger.warning(_canvas_danbooru_fast_runtime_status_cache["message"])
        return False

    with _canvas_danbooru_fast_build_lock:
        if os.path.isfile(exe_path):
            _canvas_danbooru_fast_chmod_executable(exe_path)
            return True

        _canvas_danbooru_fast_set_runtime_status(
            "building",
            "Linux Danbooru Rust backend is missing; building it now. The first lookup may take a while.",
            "Linux Danbooru Rust 后端不存在，正在现场构建。首次查询可能需要等待一段时间。",
            level="info",
            backend=exe_path,
            auto_build=True,
        )
        logger.info(_canvas_danbooru_fast_runtime_status_cache["message"])
        timeout = _canvas_danbooru_fast_int_env("SIMPAI_DANBOORU_BUILD_TIMEOUT", 600, 60, 1800)
        try:
            completed = subprocess.run(
                [cargo, "build", "--release", "--manifest-path", manifest],
                cwd=source_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                check=False,
            )
        except Exception as exc:
            _canvas_danbooru_fast_set_runtime_status(
                "fallback",
                f"Linux Danbooru Rust backend build could not start: {exc}; falling back to Python/CSV lookup.",
                f"Linux Danbooru Rust 后端构建无法启动：{exc}；当前回退到 Python/CSV 查询。",
                level="warning",
                backend=exe_path,
                auto_build=True,
            )
            logger.warning(_canvas_danbooru_fast_runtime_status_cache["message"])
            return False
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "").strip().replace("\r", "\n")
            detail = "\n".join(line for line in detail.splitlines()[-8:])[:1200]
            _canvas_danbooru_fast_set_runtime_status(
                "fallback",
                "Linux Danbooru Rust backend build failed; falling back to Python/CSV lookup.",
                "Linux Danbooru Rust 后端构建失败；当前回退到 Python/CSV 查询。",
                level="warning",
                backend=exe_path,
                auto_build=True,
            )
            logger.warning("%s\n%s", _canvas_danbooru_fast_runtime_status_cache["message"], detail)
            return False

        built_exe = os.path.join(source_root, "rust", "danbooru-tags", "target", "release", "danbooru-tags")
        if not os.path.isfile(built_exe):
            _canvas_danbooru_fast_set_runtime_status(
                "fallback",
                "Linux Danbooru Rust backend build completed but the output binary was not found; falling back to Python/CSV lookup.",
                "Linux Danbooru Rust 后端构建完成，但没有找到输出文件；当前回退到 Python/CSV 查询。",
                level="warning",
                backend=exe_path,
                auto_build=True,
            )
            logger.warning(_canvas_danbooru_fast_runtime_status_cache["message"])
            return False

        os.makedirs(os.path.dirname(exe_path), exist_ok=True)
        shutil.copy2(built_exe, exe_path)
        _canvas_danbooru_fast_chmod_executable(exe_path)
        _canvas_danbooru_fast_set_runtime_status(
            "ready",
            "Linux Danbooru Rust backend was built and enabled.",
            "Linux Danbooru Rust 后端已构建并启用。",
            level="info",
            backend=exe_path,
            auto_build=True,
        )
        logger.info(_canvas_danbooru_fast_runtime_status_cache["message"])
        return True

# Legacy identity fallback only. Character/copyright knowledge should come from
# the local Danbooru index and tags/character_glossary.csv first; visual
# attributes and persona traits belong in the prompt pipeline or system prompt.
_CANVAS_DANBOORU_HINT_SEED_TAGS = {
    "原神": ["genshin_impact"],
    "甘雨": ["ganyu_(genshin_impact)", "genshin_impact"],
    "ganyu": ["ganyu_(genshin_impact)", "genshin_impact"],
    "纳西妲": ["nahida_(genshin_impact)", "genshin_impact"],
    "草神": ["nahida_(genshin_impact)", "genshin_impact"],
    "小吉祥草王": ["nahida_(genshin_impact)", "genshin_impact"],
    "nahida": ["nahida_(genshin_impact)", "genshin_impact"],
    "kusanali": ["nahida_(genshin_impact)", "genshin_impact"],
    "原神胡桃": ["hu_tao_(genshin_impact)", "genshin_impact"],
    "胡桃": ["hu_tao_(genshin_impact)", "genshin_impact"],
    "胡桃（原神）": ["hu_tao_(genshin_impact)", "genshin_impact"],
    "胡桃(原神)": ["hu_tao_(genshin_impact)", "genshin_impact"],
    "hu tao": ["hu_tao_(genshin_impact)", "genshin_impact"],
    "hutao": ["hu_tao_(genshin_impact)", "genshin_impact"],
    "genshin impact": ["genshin_impact"],
    "\u53ef\u8389": ["klee_(genshin_impact)", "genshin_impact"],
    "klee": ["klee_(genshin_impact)", "genshin_impact"],
    "\u4e3d\u838e": ["lisa_(genshin_impact)", "genshin_impact"],
    "\u539f\u795e\u4e3d\u838e": ["lisa_(genshin_impact)", "genshin_impact"],
    "lisa minci": ["lisa_(genshin_impact)", "genshin_impact"],
    "马里奥": ["mario", "mario_(series)"],
    "超级马里奥": ["mario", "mario_(series)"],
    "mario": ["mario", "mario_(series)"],
    "super mario": ["mario", "mario_(series)"],
    "原神钟离": ["zhongli_(genshin_impact)", "genshin_impact"],
    "钟离": ["zhongli_(genshin_impact)", "genshin_impact"],
    "zhongli": ["zhongli_(genshin_impact)", "genshin_impact"],
    "原神温迪": ["venti_(genshin_impact)", "genshin_impact"],
    "温迪": ["venti_(genshin_impact)", "genshin_impact"],
    "溫迪": ["venti_(genshin_impact)", "genshin_impact"],
    "venti": ["venti_(genshin_impact)", "genshin_impact"],
    "原神雷电将军": ["raiden_shogun", "genshin_impact"],
    "雷电将军": ["raiden_shogun", "genshin_impact"],
    "raiden shogun": ["raiden_shogun", "genshin_impact"],
    "原神闲云": ["xianyun_(genshin_impact)", "genshin_impact"],
    "闲云": ["xianyun_(genshin_impact)", "genshin_impact"],
    "xianyun": ["xianyun_(genshin_impact)", "genshin_impact"],
    "远坂凛": ["tohsaka_rin", "fate/stay_night"],
    "凛（fate）": ["tohsaka_rin", "fate/stay_night"],
    "凛(fate)": ["tohsaka_rin", "fate/stay_night"],
    "tohsaka rin": ["tohsaka_rin", "fate/stay_night"],
    "rin tohsaka": ["tohsaka_rin", "fate/stay_night"],
    "\u95f4\u6850\u6a31": ["matou_sakura", "fate/stay_night"],
    "\u9593\u6850\u6afb": ["matou_sakura", "fate/stay_night"],
    "matou sakura": ["matou_sakura", "fate/stay_night"],
    "\u7eeb\u6ce2\u4e3d": ["ayanami_rei"],
    "\u7dbe\u6ce2\u9e97": ["ayanami_rei"],
    "ayanami rei": ["ayanami_rei"],
    "\u5fa1\u5742\u7f8e\u7434": ["misaka_mikoto"],
    "misaka mikoto": ["misaka_mikoto"],
    "\u521d\u97f3\u672a\u6765": ["hatsune_miku"],
    "hatsune miku": ["hatsune_miku"],
    "芙莉莲": ["frieren_(sousou_no_frieren)", "sousou_no_frieren"],
    "芙莉蓮": ["frieren_(sousou_no_frieren)", "sousou_no_frieren"],
    "frieren": ["frieren_(sousou_no_frieren)", "sousou_no_frieren"],
    "菲伦": ["fern_(sousou_no_frieren)", "sousou_no_frieren"],
    "菲倫": ["fern_(sousou_no_frieren)", "sousou_no_frieren"],
    "fern": ["fern_(sousou_no_frieren)", "sousou_no_frieren"],
    "修塔尔克": ["stark_(sousou_no_frieren)", "sousou_no_frieren"],
    "修塔爾克": ["stark_(sousou_no_frieren)", "sousou_no_frieren"],
    "stark": ["stark_(sousou_no_frieren)", "sousou_no_frieren"],
    "葬送的芙莉莲": ["sousou_no_frieren"],
    "sousou no frieren": ["sousou_no_frieren"],
    "玛奇玛": ["makima", "chainsaw_man"],
    "瑪奇瑪": ["makima", "chainsaw_man"],
    "makima": ["makima", "chainsaw_man"],
    "电锯人": ["chainsaw_man"],
    "chainsaw man": ["chainsaw_man"],
    "后藤一里": ["gotou_hitori", "bocchi_the_rock!"],
    "後藤一里": ["gotou_hitori", "bocchi_the_rock!"],
    "gotou hitori": ["gotou_hitori", "bocchi_the_rock!"],
    "伊地知虹夏": ["ijichi_nijika", "bocchi_the_rock!"],
    "ijichi nijika": ["ijichi_nijika", "bocchi_the_rock!"],
    "山田凉": ["yamada_ryou", "bocchi_the_rock!"],
    "山田涼": ["yamada_ryou", "bocchi_the_rock!"],
    "yamada ryou": ["yamada_ryou", "bocchi_the_rock!"],
    "喜多郁代": ["kita_ikuya", "bocchi_the_rock!"],
    "kita ikuya": ["kita_ikuya", "bocchi_the_rock!"],
    "孤独摇滚": ["bocchi_the_rock!"],
    "孤獨搖滾": ["bocchi_the_rock!"],
    "bocchi the rock": ["bocchi_the_rock!"],
    "\u7ed3\u675f\u4e50\u961f": ["gotou_hitori", "ijichi_nijika", "yamada_ryou", "kita_ikuya", "bocchi_the_rock!"],
    "\u7d50\u675f\u6a02\u968a": ["gotou_hitori", "ijichi_nijika", "yamada_ryou", "kita_ikuya", "bocchi_the_rock!"],
    "kessoku band": ["gotou_hitori", "ijichi_nijika", "yamada_ryou", "kita_ikuya", "bocchi_the_rock!"],
    "星野爱": ["hoshino_ai", "oshi_no_ko"],
    "星野愛": ["hoshino_ai", "oshi_no_ko"],
    "hoshino ai": ["hoshino_ai", "oshi_no_ko"],
    "我推的孩子": ["oshi_no_ko"],
    "oshi no ko": ["oshi_no_ko"],
    "樱巫女": ["sakura_miko", "hololive"],
    "櫻巫女": ["sakura_miko", "hololive"],
    "sakura miko": ["sakura_miko", "hololive"],
    "星街彗星": ["hoshimachi_suisei", "hololive"],
    "hoshimachi suisei": ["hoshimachi_suisei", "hololive"],
    "hololive": ["hololive"],
    "阿米娅": ["amiya_(arknights)", "arknights"],
    "阿米婭": ["amiya_(arknights)", "arknights"],
    "amiya": ["amiya_(arknights)", "arknights"],
    "凯尔希": ["kal'tsit_(arknights)", "arknights"],
    "凱爾希": ["kal'tsit_(arknights)", "arknights"],
    "kal'tsit": ["kal'tsit_(arknights)", "arknights"],
    "明日方舟": ["arknights"],
    "arknights": ["arknights"],
    "蔚蓝档案": ["blue_archive"],
    "蔚藍檔案": ["blue_archive"],
    "\u851a\u84dd\u6863\u6848": ["blue_archive"],
    "blue archive": ["blue_archive"],
    "hina": ["sorasaki_hina", "blue_archive"],
    "sorasaki hina": ["sorasaki_hina", "blue_archive"],
    "空崎日奈": ["sorasaki_hina", "blue_archive"],
    "\u7231\u4e3d\u4e1d\u83f2\u5c14": ["irisviel_(fate)", "fate"],
    "\u611b\u9e97\u7d72\u83f2\u723e": ["irisviel_(fate)", "fate"],
    "irisviel": ["irisviel_(fate)", "fate"],
    "irisviel von einzbern": ["irisviel_(fate)", "fate"],
    "fgo": ["fate"],
    "德克萨斯": ["texas_(arknights)", "arknights"],
    "德克薩斯": ["texas_(arknights)", "arknights"],
    "texas": ["texas_(arknights)", "arknights"],
    "拉普兰德": ["lappland_(arknights)", "arknights"],
    "拉普蘭德": ["lappland_(arknights)", "arknights"],
    "lappland": ["lappland_(arknights)", "arknights"],
    "优菈": ["eula_(genshin_impact)", "genshin_impact"],
    "優菈": ["eula_(genshin_impact)", "genshin_impact"],
    "eula": ["eula_(genshin_impact)", "genshin_impact"],
    "saber alter": ["saber_alter", "fate/stay_night"],
    "black saber": ["saber_alter", "fate/stay_night"],
    "dark saber": ["saber_alter", "fate/stay_night"],
    "\u9ed1saber": ["saber_alter", "fate/stay_night"],
    "\u9ed1 saber": ["saber_alter", "fate/stay_night"],
}

# Backward-compatible export for older UI wiring. Internally this table is now
# treated as identity seed hints, not a general visual/persona prompt dictionary.
_CANVAS_DANBOORU_HINT_TAGS = _CANVAS_DANBOORU_HINT_SEED_TAGS


def _canvas_danbooru_identity_hint_tag_set():
    try:
        index = _canvas_load_danbooru_character_index()
    except Exception:
        index = {}
    if isinstance(index, dict):
        identity_tags = set(index.get("character_tags") or set()).union(set(index.get("copyright_tags") or set()))
        if identity_tags:
            return identity_tags
    fallback = set()
    for tags in _CANVAS_DANBOORU_HINT_SEED_TAGS.values():
        for tag in tags or []:
            clean = str(tag or "").strip()
            if clean and (
                clean.endswith(")")
                or "_(" in clean
                or "/" in clean
                or clean in {"genshin_impact", "blue_archive", "arknights", "hololive", "mario_(series)"}
            ):
                fallback.add(clean)
    return fallback


def _canvas_danbooru_seed_identity_hint_tag_set():
    fallback = set()
    for tags in _CANVAS_DANBOORU_HINT_SEED_TAGS.values():
        for tag in tags or []:
            clean = str(tag or "").strip()
            if clean:
                fallback.add(clean)
    return fallback


def _canvas_danbooru_hint_tags(query, include_identity=True, include_prompt=True, identity_tag_set=None):
    text = str(query or "")
    lower_text = text.lower()
    if include_identity:
        identity_tag_set = set(identity_tag_set or []) if identity_tag_set is not None else _canvas_danbooru_identity_hint_tag_set()
    else:
        identity_tag_set = set()
    tags = []
    for phrase, mapped in _CANVAS_DANBOORU_HINT_SEED_TAGS.items():
        phrase_text = str(phrase or "")
        if not phrase_text:
            continue
        phrase_lower = phrase_text.lower()
        index_at = text.find(phrase_text)
        if index_at < 0:
            index_at = lower_text.find(phrase_lower)
        if index_at < 0 or _canvas_hint_phrase_negated(text, index_at, phrase_text):
            continue
        mapped_tags = []
        for tag in mapped or []:
            clean = str(tag or "").strip()
            if clean and clean not in mapped_tags:
                mapped_tags.append(clean)
        identity_tags = [tag for tag in mapped_tags if tag in identity_tag_set]
        if include_identity and identity_tags:
            for tag in identity_tags:
                if tag not in tags:
                    tags.append(tag)
        if include_prompt and not identity_tags:
            for tag in mapped_tags:
                if tag not in tags:
                    tags.append(tag)
    return tags


def _canvas_danbooru_tag_source_mode(value=None):
    mode = str(value or "curated").strip().lower()
    if mode in {"all", "full", "full_db", "danbooru_all", "danbooru"}:
        return "all"
    return "curated"


def _canvas_danbooru_env_bool(name, default=True):
    value = os.environ.get(name)
    if value is None:
        return bool(default)
    clean = str(value).strip().lower()
    if clean in {"0", "false", "no", "off", "disabled"}:
        return False
    if clean in {"1", "true", "yes", "on", "enabled"}:
        return True
    return bool(default)


def _canvas_danbooru_fast_lookup_enabled():
    return _canvas_danbooru_env_bool("SIMPAI_DANBOORU_FAST_LOOKUP", True)


def _canvas_danbooru_fast_skip_full_csv_enabled():
    return _canvas_danbooru_env_bool("SIMPAI_DANBOORU_FAST_SKIP_FULL_CSV", True)


def _canvas_danbooru_fast_skip_local_csv_enabled():
    return _canvas_danbooru_env_bool("SIMPAI_DANBOORU_FAST_SKIP_LOCAL_CSV", True)


def _canvas_danbooru_fast_skip_cjk_local_csv_enabled():
    return _canvas_danbooru_env_bool("SIMPAI_DANBOORU_FAST_SKIP_CJK_LOCAL_CSV", True)


def _canvas_danbooru_fast_int_env(name, default, minimum, maximum):
    try:
        value = int(float(os.environ.get(name, default)))
    except Exception:
        value = default
    return max(int(minimum), min(int(maximum), int(value)))


def _canvas_danbooru_fast_repo_data_files(data_root):
    root = os.path.abspath(os.path.expandvars(os.path.expanduser(str(data_root or ""))))
    if not root:
        return []
    files = []
    for name in ("danbooru_all.csv", "weilin_tagcart.csv", "custom_tags.csv", "character_glossary.csv"):
        for path in (os.path.join(root, "tags", name), os.path.join(root, name)):
            if os.path.isfile(path):
                files.append(path)
                break
    return files


def _canvas_danbooru_fast_repo_data_root(candidate_root):
    candidates = [
        os.environ.get("SIMPAI_TAGS_ROOT"),
        os.environ.get("SIMPAI_DANBOORU_TAGS_DATA"),
        _CANVAS_DANBOORU_ROOT,
        candidate_root,
        os.path.dirname(str(candidate_root or "")),
        os.path.dirname(os.path.dirname(str(candidate_root or ""))),
    ]
    seen = set()
    for raw in candidates:
        if not raw:
            continue
        root = os.path.abspath(os.path.expandvars(os.path.expanduser(str(raw))))
        key = os.path.normcase(root)
        if key in seen:
            continue
        seen.add(key)
        files = _canvas_danbooru_fast_repo_data_files(root)
        if any(os.path.basename(path).lower() == "danbooru_all.csv" for path in files):
            return root
    return ""


def _canvas_danbooru_fast_signature_item(path):
    try:
        stat = os.stat(path)
    except OSError:
        return None
    return (os.path.normcase(path), int(stat.st_mtime_ns), int(stat.st_size))


def _canvas_danbooru_fast_runtime_cache_signature():
    vendor_root = _canvas_danbooru_fast_vendor_root()
    exe_path = os.path.join(vendor_root, "bin", _canvas_danbooru_fast_exe_name())
    manifest = os.path.join(_CANVAS_DANBOORU_ROOT, "rust", "danbooru-tags", "Cargo.toml")
    cargo_path = shutil.which("cargo") if os.name != "nt" else ""
    return (
        os.name,
        _canvas_danbooru_fast_signature_item(exe_path),
        _canvas_danbooru_fast_signature_item(manifest),
        cargo_path or "",
    )


def _canvas_danbooru_fast_backend_from_candidate(candidate):
    raw = str(candidate or "").strip()
    if not raw:
        return None
    path = os.path.abspath(os.path.expandvars(os.path.expanduser(raw)))
    if os.path.isfile(path):
        exe_path = path
        root = os.path.dirname(os.path.dirname(path)) if os.path.basename(os.path.dirname(path)).lower() == "bin" else os.path.dirname(path)
    else:
        root = path
        exe_path = os.path.join(root, "bin", _canvas_danbooru_fast_exe_name())
    _canvas_danbooru_fast_prepare_linux_runtime(root, exe_path)
    sqlite_path = os.path.join(root, "tags_index.sqlite")
    csv_path = os.path.join(root, "anima-1.0.csv")
    cache_path = os.path.join(root, "tags_cache.bin")
    if not os.path.isfile(cache_path):
        cache_path = os.path.join(root, "tags_cache.tsv")
    lookup_path = os.path.join(root, "tags_lookup.bin")
    lookup_values_path = os.path.join(root, "tags_lookup_values.bin")
    lookup_records_path = os.path.join(root, "tags_lookup_records.bin")
    data_root = _canvas_danbooru_fast_repo_data_root(root)
    data_files = _canvas_danbooru_fast_repo_data_files(data_root) if data_root else []
    has_repo_data = bool(data_files)
    root_key = os.path.normcase(os.path.abspath(root))
    repo_key = os.path.normcase(os.path.abspath(_CANVAS_DANBOORU_ROOT))
    local_first_party_candidate = root_key == repo_key or root_key.startswith(repo_key + os.sep)
    explicit_data_root = bool(os.environ.get("SIMPAI_TAGS_ROOT") or os.environ.get("SIMPAI_DANBOORU_TAGS_DATA"))
    has_sqlite = os.path.isfile(sqlite_path)
    has_lookup = os.path.isfile(lookup_path) and os.path.isfile(lookup_values_path) and os.path.isfile(lookup_records_path)
    if not os.path.isfile(exe_path):
        return None
    if not has_sqlite and not has_lookup and not (has_repo_data and (local_first_party_candidate or explicit_data_root)):
        return None
    signature = []
    exe_signature = _canvas_danbooru_fast_signature_item(exe_path)
    if not exe_signature:
        return None
    signature.append(exe_signature)
    if has_sqlite:
        db_signature = _canvas_danbooru_fast_signature_item(sqlite_path)
        if db_signature:
            signature.append(db_signature)
    if os.path.isfile(cache_path):
        cache_signature = _canvas_danbooru_fast_signature_item(cache_path)
        if cache_signature:
            signature.append(cache_signature)
    for lookup_item in (lookup_path, lookup_values_path, lookup_records_path):
        if os.path.isfile(lookup_item):
            lookup_signature = _canvas_danbooru_fast_signature_item(lookup_item)
            if lookup_signature:
                signature.append(lookup_signature)
    for item in data_files:
        file_signature = _canvas_danbooru_fast_signature_item(item)
        if file_signature:
            signature.append(file_signature)
    return {
        "root": root,
        "exe": exe_path,
        "sqlite": sqlite_path if has_sqlite else "",
        "csv": csv_path if os.path.isfile(csv_path) else "",
        "cache": cache_path if os.path.isfile(cache_path) else "",
        "lookup": lookup_path if os.path.isfile(lookup_path) else "",
        "lookup_values": lookup_values_path if os.path.isfile(lookup_values_path) else "",
        "lookup_records": lookup_records_path if os.path.isfile(lookup_records_path) else "",
        "data_root": data_root,
        "signature": tuple(signature),
    }


def _canvas_danbooru_fast_backend_candidates():
    root = _CANVAS_DANBOORU_ROOT
    parent = os.path.dirname(root)
    grandparent = os.path.dirname(parent)
    env_candidates = [
        os.environ.get("SIMPAI_DANBOORU_TAGS_DIR"),
        os.environ.get("DANBOORU_TAGS_DIR"),
        os.environ.get("SIMPAI_DANBOORU_TAGS_EXE"),
        os.environ.get("DANBOORU_TAGS_EXE"),
    ]
    local_candidates = [
        os.path.join(root, "vendor", "danbooru-tags"),
        os.path.join(root, "third_party", "danbooru-tags"),
        os.path.join(root, "data", "danbooru-tags"),
        os.path.join(root, "danbooru-tags"),
        os.path.join(root, "skills", "comfyui-good-anima", "danbooru-tags"),
        os.path.join(root, "skills", "danbooru-tags"),
        os.path.join(parent, "comfyui-good-anima", "danbooru-tags"),
        os.path.join(grandparent, "comfyui-good-anima", "danbooru-tags"),
    ]
    user_home = os.path.expanduser("~")
    home_candidates = [
        os.path.join(user_home, ".codex", "skills", "comfyui-good-anima", "danbooru-tags"),
        os.path.join(user_home, ".codex", "skills", "danbooru-tags"),
        os.path.join(user_home, ".snow", "skills", "comfyui-good-anima", "danbooru-tags"),
        os.path.join(user_home, ".snow", "skills", "danbooru-tags"),
    ]
    output = []
    for item in env_candidates + local_candidates + home_candidates:
        if item and item not in output:
            output.append(item)
    return output


def _canvas_danbooru_fast_backend():
    if not _canvas_danbooru_fast_lookup_enabled():
        return None
    env_signature = (
        os.environ.get("SIMPAI_DANBOORU_TAGS_DIR") or "",
        os.environ.get("DANBOORU_TAGS_DIR") or "",
        os.environ.get("SIMPAI_DANBOORU_TAGS_EXE") or "",
        os.environ.get("DANBOORU_TAGS_EXE") or "",
        os.environ.get("SIMPAI_DANBOORU_FAST_LOOKUP") or "",
        _canvas_danbooru_fast_runtime_cache_signature(),
    )
    cached = _canvas_danbooru_fast_backend_cache.get("backend") if isinstance(_canvas_danbooru_fast_backend_cache, dict) else None
    if isinstance(cached, dict) and cached.get("env_signature") == env_signature:
        return cached.get("backend")
    backend = None
    for candidate in _canvas_danbooru_fast_backend_candidates():
        backend = _canvas_danbooru_fast_backend_from_candidate(candidate)
        if backend:
            break
    _canvas_danbooru_fast_backend_cache["backend"] = {
        "env_signature": env_signature,
        "backend": backend,
    }
    if backend:
        status = _canvas_danbooru_fast_runtime_status()
        if status.get("state") in ("unknown", "fallback", ""):
            _canvas_danbooru_fast_set_runtime_status(
                "ready",
                "Danbooru Rust backend is enabled.",
                "Danbooru Rust 后端已启用。",
                level="info",
                backend=backend.get("exe") or backend.get("root") or "",
                auto_build=bool(status.get("auto_build")),
            )
        logger.info("Danbooru fast tag backend enabled: %s", backend.get("root"))
    else:
        status = _canvas_danbooru_fast_runtime_status()
        if status.get("state") in ("unknown", ""):
            _canvas_danbooru_fast_set_runtime_status(
                "fallback",
                "Danbooru Rust backend is unavailable; falling back to Python/CSV lookup.",
                "Danbooru Rust 后端不可用；当前回退到 Python/CSV 查询。",
                level="warning",
            )
    return backend


def _canvas_danbooru_fast_backend_available():
    return bool(_canvas_danbooru_fast_backend())


def _canvas_danbooru_clean_fast_query_value(value):
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r"\\([()])", r"\1", text)
    text = re.sub(r"^\s*[\[({]+", "", text)
    text = re.sub(r"[\])}]+\s*$", "", text)
    text = re.sub(r":\s*[0-9]+(?:\.[0-9]+)?\s*$", "", text)
    text = re.sub(r"\s+", " ", text).strip(" ,;")
    return text[:96]


def _canvas_danbooru_fast_query_values(query, max_queries=32):
    text = str(query or "")
    if not text.strip():
        return []
    stop_values = {
        "masterpiece", "best quality", "very aesthetic", "amazing quality",
        "highres", "absurdres", "newest", "recent", "mid", "early", "old",
        "safe", "sensitive", "nsfw", "explicit", "prompt", "image",
    }
    values = []

    def add(value):
        clean = _canvas_danbooru_clean_fast_query_value(value)
        if not clean:
            return
        norm = clean.lower().replace("_", " ").strip()
        if norm in stop_values or len(norm) < 2:
            return
        if len(norm) < 3 and norm not in {"1girl", "1boy"}:
            return
        if norm not in values:
            values.append(norm)

    for chunk in re.split(r"[,;\n]+", text):
        clean = _canvas_danbooru_clean_fast_query_value(chunk)
        if not clean:
            continue
        if len(clean.split()) <= 8 and len(clean) <= 80:
            add(clean)
            if "_" in clean:
                add(clean.replace("_", " "))
    light_terms = re.findall(r"[a-zA-Z0-9_@][a-zA-Z0-9_@().'/-]*", text.lower())
    light_terms.extend(re.findall(r"[\u3400-\u9fff]{1,12}", text))
    for term in light_terms:
        add(term)
        if "_" in term:
            add(term.replace("_", " "))
    english_words = [
        word for word in re.findall(r"[a-zA-Z][a-zA-Z0-9_'-]+", text.lower())
        if len(word) >= 3 and word not in stop_values
    ]
    for index in range(max(0, len(english_words) - 1)):
        add(english_words[index] + " " + english_words[index + 1])
    return values[:max(1, min(int(max_queries or 32), 80))]


def _canvas_danbooru_fast_category(value):
    key = str(value or "").strip().lower()
    if key in {"artist", "artists"}:
        return "artist"
    if key in {"character", "characters"}:
        return "character"
    if key in {"series", "copyright", "copyrights", "ip"}:
        return "copyright"
    if key in {"meta", "metadata"}:
        return "meta"
    return key or "general"


def _canvas_danbooru_fast_row(raw, source_query="", confirmed=True):
    if not isinstance(raw, dict):
        return None
    tag = str(raw.get("tag") or raw.get("prompt_tag") or "").strip()
    if not tag:
        return None
    tag = re.sub(r"\s+", "_", tag).lower() if not tag.startswith("@") else tag.lower()
    if tag in _CANVAS_DANBOORU_LOW_SIGNAL_TAGS or _canvas_is_forbidden_positive_tag(tag):
        return None
    match_score = float(raw.get("match_score") or raw.get("score") or 0)
    query_norm = re.sub(r"\s+", "_", str(source_query or "").strip().lower())
    if query_norm and query_norm == tag:
        match_score += 80
    if str(source_query or "").strip().startswith("@") and tag.startswith("@"):
        match_score += 60
    match_score += 100 if confirmed else 35
    return {
        "tag": tag,
        "prompt_tag": _canvas_prompt_safe_danbooru_tag(tag),
        "category": _canvas_danbooru_fast_category(raw.get("category") or raw.get("source_category")),
        "count": _canvas_safe_int(raw.get("count")),
        "aliases": "",
        "translation": "",
        "group": str(raw.get("category") or "").strip(),
        "top_group": str(raw.get("category") or "").strip(),
        "sub_group": "",
        "path_group": str(raw.get("source_category") or raw.get("category") or "").strip(),
        "source": _canvas_danbooru_fast_exe_name(),
        "score": round(match_score, 3),
        "match": "fast_confirmed" if confirmed else "fast_candidate",
    }


def _canvas_danbooru_fast_flatten_result(result, query_by_id, limit=80):
    rows = []
    if not isinstance(result, dict):
        return rows
    results = result.get("results") if isinstance(result.get("results"), dict) else {"q0": result}
    for query_id, payload in results.items():
        if not isinstance(payload, dict):
            continue
        source_query = query_by_id.get(str(query_id), "")
        for confirmed, key in ((True, "confirmed_tags"), (False, "candidate_tags")):
            groups = payload.get(key) if isinstance(payload.get(key), dict) else {}
            for items in groups.values():
                if not isinstance(items, list):
                    continue
                for raw in items:
                    item = _canvas_danbooru_fast_row(raw, source_query=source_query, confirmed=confirmed)
                    if item:
                        rows.append(item)
    return _canvas_merge_tag_rows(rows, limit=limit)


def _canvas_lookup_danbooru_tags_fast(query, limit=24, source_mode="curated"):
    backend = _canvas_danbooru_fast_backend()
    if not backend:
        return None
    max_limit = max(1, min(int(limit or 24), 80))
    mode = _canvas_danbooru_tag_source_mode(source_mode)
    values = _canvas_danbooru_fast_query_values(query, max_queries=36 if mode == "all" else 28)
    if not values:
        return []
    cache_key = (
        backend.get("signature"),
        mode,
        str(query or "")[:1600],
        max_limit,
        tuple(values),
    )
    cached = _canvas_danbooru_fast_lookup_cache.get(cache_key) if isinstance(_canvas_danbooru_fast_lookup_cache, dict) else None
    if cached is not None:
        return list(cached)
    per_query_limit = max(3, min(8, max_limit))
    queries = []
    query_by_id = {}
    for index, value in enumerate(values):
        query_id = f"q{index}"
        item = {"id": query_id, "keyword": value, "limit": per_query_limit}
        if value.startswith("@"):
            item["group"] = "artist"
        queries.append(item)
        query_by_id[query_id] = value
    batch = {"queries": queries}
    batch_path = ""
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", prefix="simpai_danbooru_", delete=False) as handle:
            json.dump(batch, handle, ensure_ascii=False, separators=(",", ":"))
            batch_path = handle.name
        workers = _canvas_danbooru_fast_int_env("SIMPAI_DANBOORU_FAST_WORKERS", 8, 1, 16)
        timeout = _canvas_danbooru_fast_int_env("SIMPAI_DANBOORU_FAST_TIMEOUT", 5, 1, 30)
        command = [
            backend.get("exe"),
            "--batch-workers",
            str(workers),
            "--batch-file",
            batch_path,
            "--for-prompt",
            "--json",
            "--compact",
        ]
        run_kwargs = {}
        if os.name == "nt":
            run_kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        child_env = os.environ.copy()
        if backend.get("data_root"):
            child_env.setdefault("SIMPAI_TAGS_ROOT", backend.get("data_root"))
        if backend.get("cache"):
            child_env.setdefault("SIMPAI_DANBOORU_TAGS_CACHE", backend.get("cache"))
        if backend.get("lookup"):
            child_env.setdefault("SIMPAI_DANBOORU_TAGS_LOOKUP", backend.get("lookup"))
        completed = subprocess.run(
            command,
            cwd=backend.get("root"),
            env=child_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            **run_kwargs,
        )
        if completed.returncode != 0:
            logger.warning("Danbooru fast lookup failed: returncode=%s stderr=%s", completed.returncode, (completed.stderr or "").strip()[:500])
            return None
        parsed = json.loads(completed.stdout or "{}")
        rows = _canvas_danbooru_fast_flatten_result(parsed, query_by_id, limit=max_limit * 3)
        if mode == "curated":
            rows = [
                row for row in rows
                if float(row.get("score") or 0) >= 140 or str(row.get("tag") or "").startswith("@")
            ]
        rows = _canvas_merge_tag_rows(rows, limit=max_limit)
        if len(_canvas_danbooru_fast_lookup_cache) > 512:
            _canvas_danbooru_fast_lookup_cache.clear()
        _canvas_danbooru_fast_lookup_cache[cache_key] = list(rows)
        return rows
    except Exception as exc:
        logger.warning("Danbooru fast lookup unavailable for this query: %s", exc)
        return None
    finally:
        if batch_path:
            try:
                os.remove(batch_path)
            except OSError:
                pass


def _canvas_danbooru_tag_paths(source_mode="curated"):
    root = _CANVAS_DANBOORU_ROOT
    mode = _canvas_danbooru_tag_source_mode(source_mode)
    paths = [os.path.join(root, "tags", "weilin_tagcart.csv")]
    if mode == "all":
        paths.append(os.path.join(root, "tags", "danbooru_all.csv"))
    config_module = sys.modules.get("modules.config")
    userhome = str(getattr(config_module, "path_userhome", "") or "").strip() if config_module else ""
    if userhome:
        paths.append(os.path.join(userhome, "tags", "custom_tags.csv"))
    paths.append(os.path.join(root, "tags", "custom_tags.csv"))
    return [path for path in paths if path and os.path.exists(path)]


def _canvas_safe_int(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return default


def _canvas_danbooru_cache_signature(paths):
    parts = []
    for path in paths:
        try:
            stat = os.stat(path)
            parts.append((path, int(stat.st_mtime_ns), int(stat.st_size)))
        except OSError:
            parts.append((path, 0, 0))
    return tuple(parts)


def _canvas_load_danbooru_tag_rows(source_mode="curated"):
    mode = _canvas_danbooru_tag_source_mode(source_mode)
    paths = _canvas_danbooru_tag_paths(mode)
    signature = _canvas_danbooru_cache_signature(paths)
    cached = _canvas_danbooru_tag_cache.get(mode) if isinstance(_canvas_danbooru_tag_cache, dict) else None
    if isinstance(cached, dict) and cached.get("signature") == signature:
        return list(cached.get("rows") or [])

    rows = []
    for path in paths:
        source = os.path.basename(path)
        try:
            with open(path, "r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.reader(handle)
                for raw in reader:
                    if not raw:
                        continue
                    name = re.sub(r"\s+", "_", str(raw[0] if len(raw) > 0 else "").strip().lower())
                    if not name:
                        continue
                    if source == "custom_tags.csv":
                        category = "custom"
                        count = 0
                        aliases = str(raw[2] if len(raw) > 2 else "").strip()
                        translation = str(raw[1] if len(raw) > 1 else "").strip()
                        group = "custom"
                    else:
                        category = str(raw[1] if len(raw) > 1 else "").strip()
                        count = _canvas_safe_int(raw[2] if len(raw) > 2 else 0)
                        aliases = str(raw[3] if len(raw) > 3 else "").strip()
                        translation = str(raw[4] if len(raw) > 4 else "").strip()
                        group = str(raw[5] if len(raw) > 5 else "").strip()
                    top_group = str(raw[5] if len(raw) > 5 else "").strip()
                    sub_group = str(raw[6] if len(raw) > 6 else "").strip()
                    path_group = str(raw[7] if len(raw) > 7 else "").strip()
                    rows.append(
                        {
                            "tag": name,
                            "category": _CANVAS_DANBOORU_CATEGORY_LABELS.get(category, category or "general"),
                            "count": count,
                            "aliases": aliases,
                            "translation": translation,
                            "group": group,
                            "top_group": top_group,
                            "sub_group": sub_group,
                            "path_group": path_group,
                            "source": source,
                        }
                    )
        except Exception as exc:
            logger.warning("Failed to load Danbooru tag file %s: %s", path, exc)

    _canvas_danbooru_tag_cache[mode] = {"signature": signature, "rows": rows}
    return list(rows)


def _canvas_danbooru_query_terms(query):
    text = str(query or "")
    lower = text.lower()
    english = re.findall(r"[a-zA-Z0-9_][a-zA-Z0-9_().'/-]*", lower)
    chinese = re.findall(r"[\u3400-\u9fff]{1,12}", text)
    terms = []
    for item in english + chinese:
        item = str(item or "").strip().lower()
        if item and item not in terms:
            terms.append(item)
    return terms


def _canvas_hint_phrase_negated(text, start, phrase):
    prefix = str(text or "")[max(0, int(start or 0) - 18):int(start or 0)].lower()
    suffix = str(text or "")[int(start or 0):int(start or 0) + len(str(phrase or "")) + 18].lower()
    return bool(
        re.search(r"(?:不是|并非|不要|别画|別畫|别像|別像|not|without)\s*$", prefix, re.I)
        or re.search(r"(?:像|类似|類似|look(?:s)?\s+like|like)\s*$", prefix, re.I)
        or re.search(r"^(?:[^，。,.;；]{0,10})(?:但|但是|but)?\s*(?:不是|并非|not)\b", suffix, re.I)
    )


def _canvas_danbooru_direct_hint_tags(query, identity_tag_set=None):
    if identity_tag_set is None:
        identity_tag_set = _canvas_danbooru_seed_identity_hint_tag_set()
    return _canvas_danbooru_hint_tags(query, include_identity=True, include_prompt=False, identity_tag_set=identity_tag_set)


def _canvas_danbooru_prompt_hint_tags(query):
    return _canvas_danbooru_hint_tags(query, include_identity=False, include_prompt=True)


def _canvas_danbooru_aliases(value):
    aliases = []
    for item in re.split(r"[,|]", str(value or "")):
        item = item.strip().strip('"').lower()
        if item:
            aliases.append(item)
    return aliases


def _canvas_gallery_root():
    return os.path.join(
        _CANVAS_DANBOORU_ROOT,
        "comfy",
        "custom_nodes",
        "ComfyUI-Danbooru-Gallery",
    )


def _canvas_gallery_db_path():
    return os.path.join(_canvas_gallery_root(), "py", "shared", "data", "tags_cache.db")


def _canvas_gallery_zh_cn_dir():
    return os.path.join(_canvas_gallery_root(), "py", "danbooru_gallery", "zh_cn")


def _canvas_gallery_source_paths():
    zh_dir = _canvas_gallery_zh_cn_dir()
    return [
        _canvas_gallery_db_path(),
        os.path.join(zh_dir, "all_tags_cn.json"),
        os.path.join(zh_dir, "danbooru.csv"),
        os.path.join(zh_dir, "wai_characters.csv"),
    ]


def _canvas_gallery_signature():
    return _canvas_danbooru_cache_signature([path for path in _canvas_gallery_source_paths() if path])


def _canvas_gallery_db_connect():
    path = _canvas_gallery_db_path()
    if not os.path.exists(path):
        return None
    uri_path = os.path.abspath(path).replace("\\", "/")
    return sqlite3.connect(f"file:{uri_path}?mode=ro", uri=True)


def _canvas_gallery_category_values(categories=None):
    if not categories:
        return []
    category_values = []
    reverse = {v: k for k, v in _CANVAS_DANBOORU_CATEGORY_LABELS.items()}
    for category in categories:
        key = str(category or "").strip()
        if key in reverse:
            category_values.append(reverse[key])
        elif key in _CANVAS_DANBOORU_CATEGORY_LABELS:
            category_values.append(key)
    return category_values


def _canvas_tag_category_to_label(value):
    raw = str(value if value is not None else "").strip()
    return _CANVAS_DANBOORU_CATEGORY_LABELS.get(raw, raw or "general")


def _canvas_normalize_gallery_tag(value):
    tag = str(value or "").strip().lower()
    tag = tag.replace("\\(", "(").replace("\\)", ")")
    tag = re.sub(r"\s+", "_", tag)
    tag = re.sub(r"_+\(", "_(", tag)
    return tag


def _canvas_gallery_load_translation_map():
    signature = _canvas_gallery_signature()
    cached = _canvas_gallery_tag_cache.get("translation_map") if isinstance(_canvas_gallery_tag_cache, dict) else None
    if isinstance(cached, dict) and cached.get("signature") == signature:
        return dict(cached.get("map") or {})

    zh_dir = _canvas_gallery_zh_cn_dir()
    translations = {}

    def add(en_tag, cn_text):
        tag = _canvas_normalize_gallery_tag(en_tag)
        text = str(cn_text or "").strip()
        if tag and text and tag not in translations:
            translations[tag] = text

    json_path = os.path.join(zh_dir, "all_tags_cn.json")
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8-sig") as handle:
                data = json.load(handle)
            if isinstance(data, dict):
                for en_tag, cn_text in data.items():
                    add(en_tag, cn_text)
        except Exception as exc:
            logger.warning("Failed to load Gallery translation JSON %s: %s", json_path, exc)

    csv_specs = [
        (os.path.join(zh_dir, "danbooru.csv"), False),
        (os.path.join(zh_dir, "wai_characters.csv"), True),
    ]
    for path, reverse in csv_specs:
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.reader(handle)
                for raw in reader:
                    if len(raw) < 2:
                        continue
                    if reverse:
                        add(raw[1], raw[0])
                    else:
                        add(raw[0], raw[1])
        except Exception as exc:
            logger.warning("Failed to load Gallery translation CSV %s: %s", path, exc)

    _canvas_gallery_tag_cache["translation_map"] = {"signature": signature, "map": translations}
    return dict(translations)


def _canvas_gallery_row_to_tag(row):
    tag = _canvas_normalize_gallery_tag(row.get("tag") if isinstance(row, dict) else "")
    if not tag:
        return None
    translation = str((row or {}).get("translation_cn") or "").strip()
    if not translation:
        translation = _canvas_gallery_load_translation_map().get(tag, "")
    aliases_raw = (row or {}).get("aliases")
    aliases = ""
    if aliases_raw:
        try:
            parsed = json.loads(aliases_raw) if isinstance(aliases_raw, str) else aliases_raw
            if isinstance(parsed, list):
                aliases = ",".join(str(item).strip() for item in parsed if str(item).strip())
            else:
                aliases = str(parsed or "").strip()
        except Exception:
            aliases = str(aliases_raw or "").strip()
    return {
        "tag": tag,
        "category": _canvas_tag_category_to_label((row or {}).get("category")),
        "count": _canvas_safe_int((row or {}).get("post_count")),
        "aliases": aliases,
        "translation": translation,
        "group": "",
        "source": "ComfyUI-Danbooru-Gallery/tags_cache.db",
    }


def _canvas_gallery_load_seed_rows(categories=None, max_rows=0):
    signature = (_canvas_gallery_signature(), tuple(_canvas_gallery_category_values(categories)), int(max_rows or 0))
    cache_key = f"seed:{signature[1]}:{signature[2]}"
    cached = _canvas_gallery_tag_cache.get(cache_key) if isinstance(_canvas_gallery_tag_cache, dict) else None
    if isinstance(cached, dict) and cached.get("signature") == signature:
        return list(cached.get("rows") or [])

    rows = []
    conn = None
    try:
        conn = _canvas_gallery_db_connect()
        if conn is None:
            return []
        conn.row_factory = sqlite3.Row
        category_values = list(signature[1])
        where_category = ""
        params = []
        if category_values:
            placeholders = ",".join("?" for _ in category_values)
            where_category = f" WHERE category IN ({placeholders})"
            params.extend(category_values)
        limit_clause = ""
        if int(max_rows or 0) > 0:
            limit_clause = " LIMIT ?"
            params.append(int(max_rows))
        cursor = conn.execute(
            f"""
            SELECT tag, category, post_count, translation_cn, aliases
            FROM hot_tags
            {where_category}
            ORDER BY post_count DESC
            {limit_clause}
            """,
            params,
        )
        for row in cursor.fetchall():
            item = _canvas_gallery_row_to_tag(dict(row))
            if item:
                rows.append(item)
    except Exception as exc:
        logger.warning("Gallery seed load failed: %s", exc)
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
    _canvas_gallery_tag_cache[cache_key] = {"signature": signature, "rows": rows}
    return list(rows)


def _canvas_gallery_query_rows(query, limit=24, categories=None):
    text = str(query or "").strip()
    if not text:
        return []
    limit = max(1, min(int(limit or 24), 80))
    category_values = _canvas_gallery_category_values(categories)
    has_chinese = bool(re.search(r"[\u3400-\u9fff]", text))
    tag_query = _canvas_normalize_gallery_tag(text)
    rows = []
    seen = set()

    def append_row(raw, score=0):
        item = _canvas_gallery_row_to_tag(raw)
        if not item:
            return
        tag = item.get("tag")
        if tag in seen:
            return
        if item["category"] == "general" and tag.lower() in _CANVAS_DANBOORU_LOW_SIGNAL_TAGS:
            return
        if _canvas_is_forbidden_positive_tag(tag):
            return
        item["score"] = round(float(score or 0), 3)
        seen.add(tag)
        rows.append(item)

    conn = None
    try:
        conn = _canvas_gallery_db_connect()
        if conn is None:
            return []
        conn.row_factory = sqlite3.Row
        where_category = ""
        params_category = []
        if category_values:
            placeholders = ",".join("?" for _ in category_values)
            where_category = f" AND category IN ({placeholders})"
            params_category.extend(category_values)

        if has_chinese:
            queries = [
                ("translation_cn = ?", [text], 190),
                ("translation_cn LIKE ? || '%'", [text], 150),
                ("translation_cn LIKE '%' || ? || '%'", [text], 110),
            ]
            for condition, params, base_score in queries:
                if len(rows) >= limit:
                    break
                cursor = conn.execute(
                    f"""
                    SELECT tag, category, post_count, translation_cn, aliases
                    FROM hot_tags
                    WHERE {condition}{where_category}
                    ORDER BY post_count DESC
                    LIMIT ?
                    """,
                    params + params_category + [limit],
                )
                for row in cursor.fetchall():
                    append_row(dict(row), base_score + min(max(_canvas_safe_int(row["post_count"]), 0), 1_000_000) / 1_000_000)

            if len(rows) < limit:
                try:
                    cursor = conn.execute(
                        f"""
                        SELECT h.tag, h.category, h.post_count, h.translation_cn, h.aliases
                        FROM hot_tags_fts f
                        JOIN hot_tags h ON f.rowid = h.rowid
                        WHERE hot_tags_fts MATCH ?{where_category.replace('category', 'h.category')}
                        ORDER BY f.rank, h.post_count DESC
                        LIMIT ?
                        """,
                        [text.replace('"', '""')] + params_category + [limit],
                    )
                    for row in cursor.fetchall():
                        append_row(dict(row), 95 + min(max(_canvas_safe_int(row["post_count"]), 0), 1_000_000) / 1_000_000)
                except Exception:
                    pass
        else:
            variants = [tag_query]
            if "_" in tag_query:
                variants.append(tag_query.replace("_", " "))
            for variant in variants:
                if len(rows) >= limit:
                    break
                cursor = conn.execute(
                    f"""
                    SELECT tag, category, post_count, translation_cn, aliases
                    FROM hot_tags
                    WHERE (tag = ? OR tag LIKE ? || '%'){where_category}
                    ORDER BY CASE WHEN tag = ? THEN 0 ELSE 1 END, post_count DESC
                    LIMIT ?
                    """,
                    [variant, variant] + params_category + [variant, limit],
                )
                for row in cursor.fetchall():
                    append_row(dict(row), (190 if row["tag"] == variant else 125) + min(max(_canvas_safe_int(row["post_count"]), 0), 1_000_000) / 1_000_000)
    except Exception as exc:
        logger.warning("Gallery tag query failed: %s", exc)
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
    return sorted(rows, key=lambda item: (-float(item.get("score") or 0), -int(item.get("count") or 0), str(item.get("tag") or "")))[:limit]


def _canvas_merge_tag_rows(*groups, limit=24):
    best = {}
    for group in groups:
        for raw in group or []:
            if not isinstance(raw, dict):
                continue
            tag = str(raw.get("tag") or "").strip()
            if not tag:
                continue
            item = dict(raw)
            score = float(item.get("score") or 0)
            current = best.get(tag)
            item["prompt_tag"] = _canvas_prompt_safe_danbooru_tag(tag)
            if not current:
                best[tag] = item
                continue
            current_score = float(current.get("score") or 0)
            if score > current_score:
                merged = dict(item)
                current_is_gallery = str(current.get("source") or "").startswith("ComfyUI-Danbooru-Gallery")
                item_is_gallery = str(item.get("source") or "").startswith("ComfyUI-Danbooru-Gallery")
                if current.get("translation") and (not merged.get("translation") or (item_is_gallery and not current_is_gallery)):
                    merged["translation"] = current.get("translation")
                if current.get("aliases") and not merged.get("aliases"):
                    merged["aliases"] = current.get("aliases")
                merged["count"] = max(_canvas_safe_int(current.get("count")), _canvas_safe_int(merged.get("count")))
                best[tag] = merged
            else:
                if not current.get("translation") and item.get("translation"):
                    current["translation"] = item.get("translation")
                if not current.get("aliases") and item.get("aliases"):
                    current["aliases"] = item.get("aliases")
                current["count"] = max(_canvas_safe_int(current.get("count")), _canvas_safe_int(item.get("count")))
    return sorted(best.values(), key=lambda item: (-float(item.get("score") or 0), -int(item.get("count") or 0), str(item.get("tag") or "")))[: max(1, min(int(limit or 24), 80))]


_CANVAS_CHARACTER_GLOSSARY_HEADER = [
    "source_term",
    "character_tag",
    "copyright_tag",
    "aliases",
    "translation",
    "status",
    "source",
    "notes",
]


def _canvas_character_glossary_path():
    return os.path.join(_CANVAS_DANBOORU_ROOT, "tags", "character_glossary.csv")


def _canvas_character_glossary_signature():
    path = _canvas_character_glossary_path()
    try:
        stat = os.stat(path)
        return (path, int(stat.st_mtime), int(stat.st_size))
    except OSError:
        return (path, 0, 0)


def _canvas_normalize_character_lookup_text(value):
    text = str(value or "").strip().lower()
    text = text.replace("\\(", "(").replace("\\)", ")")
    text = text.replace("（", "(").replace("）", ")")
    text = re.sub(r"[\s_\-./:,'\"`~!@#$%^&*=+()[\]{}<>?，。！？；：、·]+", "", text)
    return text


def _canvas_split_character_field(value):
    items = []
    for item in re.split(r"[,|;/\n\r]+", str(value or "")):
        item = item.strip().strip('"')
        if item and item not in items:
            items.append(item)
    return items


def _canvas_expand_character_lookup_value(value):
    text = str(value or "").strip()
    if not text:
        return []
    output = [text]
    normalized = text.replace("（", "(").replace("）", ")")
    if normalized != text:
        output.append(normalized)
    stripped = re.sub(r"\s*\([^)]*\)\s*", "", normalized).strip()
    if stripped:
        output.append(stripped)
    for inner in re.findall(r"\(([^)]+)\)", normalized):
        inner = str(inner or "").strip()
        if inner:
            output.append(inner)
    deduped = []
    for item in output:
        if item and item not in deduped:
            deduped.append(item)
    return deduped


def _canvas_load_character_glossary_rows():
    path = _canvas_character_glossary_path()
    if not os.path.exists(path):
        return []
    rows = []
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for raw in reader:
                if not isinstance(raw, dict):
                    continue
                source_term = str(raw.get("source_term") or "").strip()
                character_tag = re.sub(r"\s+", "_", str(raw.get("character_tag") or "").strip().lower())
                copyright_tag = re.sub(r"\s+", "_", str(raw.get("copyright_tag") or "").strip().lower())
                aliases = str(raw.get("aliases") or "").strip()
                translation = str(raw.get("translation") or "").strip()
                status = str(raw.get("status") or "confirmed").strip().lower() or "confirmed"
                source = str(raw.get("source") or "user_glossary").strip()
                notes = str(raw.get("notes") or "").strip()
                if status in {"rejected", "disabled", "deprecated"}:
                    continue
                if character_tag:
                    rows.append({
                        "tag": character_tag,
                        "category": "character",
                        "count": 0,
                        "aliases": aliases,
                        "translation": translation or source_term,
                        "group": copyright_tag,
                        "source": "character_glossary.csv",
                        "source_term": source_term,
                        "glossary_status": status,
                        "glossary_source": source,
                        "notes": notes,
                    })
                if copyright_tag:
                    rows.append({
                        "tag": copyright_tag,
                        "category": "copyright",
                        "count": 0,
                        "aliases": "",
                        "translation": "",
                        "group": "glossary",
                        "source": "character_glossary.csv",
                        "source_term": source_term,
                        "glossary_status": status,
                        "glossary_source": source,
                        "notes": notes,
                    })
    except Exception as exc:
        logger.warning("Failed to load character glossary %s: %s", path, exc)
    return rows


def _canvas_danbooru_character_index_signature():
    root = _CANVAS_DANBOORU_ROOT
    paths = [
        os.path.join(root, "tags", "danbooru_all.csv"),
        _canvas_character_glossary_path(),
        *_canvas_gallery_source_paths(),
    ]
    return _canvas_danbooru_cache_signature([path for path in paths if path])


def _canvas_load_danbooru_character_index():
    signature = (_canvas_danbooru_character_index_signature(), _canvas_character_glossary_signature())
    cached = _canvas_danbooru_character_index_cache.get("local") if isinstance(_canvas_danbooru_character_index_cache, dict) else None
    if isinstance(cached, dict) and cached.get("signature") == signature:
        return cached

    rows = []
    by_tag = {}

    def add_row(row, priority=0):
        tag = str(row.get("tag") or "").strip()
        category = str(row.get("category") or "").strip()
        if not tag or category not in {"character", "copyright"}:
            return
        item = dict(row)
        item["tag"] = tag
        item["category"] = category
        item["_priority"] = priority
        current = by_tag.get((category, tag))
        if not current:
            by_tag[(category, tag)] = item
            return
        # Higher priority sources should repair weak seed data. The Gallery zh_CN
        # files are more reliable for Chinese lookup than stale danbooru_all
        # translations, while user glossary rows remain authoritative.
        if priority > int(current.get("_priority") or 0):
            current_priority = int(current.get("_priority") or 0)
            merged = dict(item)
            merged_values = list(current.get("_merged_lookup_values") or [])
            merged_values.extend(item.get("_merged_lookup_values") or [])
            for key in ("translation", "aliases", "group", "source_term"):
                current_value = str(current.get(key) or "").strip()
                item_value = str(item.get(key) or "").strip()
                if current_value and current_value != item_value and current_value not in merged_values:
                    merged_values.append(current_value)
            if current.get("translation") and (current_priority >= 4 or not item.get("translation")):
                merged["translation"] = current.get("translation")
            if current.get("aliases") and (current_priority >= 4 or not item.get("aliases")):
                merged["aliases"] = current.get("aliases")
            merged["count"] = max(_canvas_safe_int(current.get("count")), _canvas_safe_int(item.get("count")))
            if merged_values:
                merged["_merged_lookup_values"] = merged_values
            by_tag[(category, tag)] = merged
        else:
            if not current.get("translation") and item.get("translation"):
                current["translation"] = item.get("translation")
            elif current.get("translation") and item.get("translation") and current.get("translation") != item.get("translation"):
                current.setdefault("_merged_lookup_values", [])
                if item.get("translation") not in current["_merged_lookup_values"]:
                    current["_merged_lookup_values"].append(item.get("translation"))
            if not current.get("aliases") and item.get("aliases"):
                current["aliases"] = item.get("aliases")
            elif current.get("aliases") and item.get("aliases") and current.get("aliases") != item.get("aliases"):
                current.setdefault("_merged_lookup_values", [])
                if item.get("aliases") not in current["_merged_lookup_values"]:
                    current["_merged_lookup_values"].append(item.get("aliases"))
            current["count"] = max(_canvas_safe_int(current.get("count")), _canvas_safe_int(item.get("count")))

    root = _CANVAS_DANBOORU_ROOT
    danbooru_all_path = os.path.join(root, "tags", "danbooru_all.csv")
    if os.path.exists(danbooru_all_path):
        try:
            with open(danbooru_all_path, "r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.reader(handle)
                for raw in reader:
                    if not raw:
                        continue
                    category_raw = str(raw[1] if len(raw) > 1 else "").strip()
                    category = _CANVAS_DANBOORU_CATEGORY_LABELS.get(category_raw, category_raw)
                    if category not in {"character", "copyright"}:
                        continue
                    tag = re.sub(r"\s+", "_", str(raw[0] if len(raw) > 0 else "").strip().lower())
                    if not tag:
                        continue
                    add_row({
                        "tag": tag,
                        "category": category,
                        "count": _canvas_safe_int(raw[2] if len(raw) > 2 else 0),
                        "aliases": str(raw[3] if len(raw) > 3 else "").strip(),
                        "translation": str(raw[4] if len(raw) > 4 else "").strip(),
                        "group": str(raw[5] if len(raw) > 5 else "").strip(),
                        "source": "danbooru_all.csv",
                    }, priority=1)
        except Exception as exc:
            logger.warning("Failed to load local Danbooru character index %s: %s", danbooru_all_path, exc)
    for row in _canvas_gallery_load_seed_rows(categories=("character", "copyright")):
        add_row(row, priority=2)
    for row in _canvas_load_character_glossary_rows():
        add_row(row, priority=4 if str(row.get("glossary_status") or "") == "confirmed" else 3)

    rows = list(by_tag.values())
    character_tags = {str(row.get("tag") or "") for row in rows if row.get("category") == "character"}
    copyright_tags = {str(row.get("tag") or "") for row in rows if row.get("category") == "copyright"}
    lookup_exact = {}

    def add_lookup_value(value, index):
        normalized = _canvas_normalize_character_lookup_text(value)
        if not normalized:
            return
        min_len = 2 if re.search(r"[\u3400-\u9fff]", str(value or "")) else 3
        if len(normalized) < min_len:
            return
        lookup_exact.setdefault(normalized, []).append(index)

    for index, row in enumerate(rows):
        for value in _canvas_character_row_lookup_values(row):
            add_lookup_value(value, index)
        tag = str(row.get("tag") or "")
        for part in re.split(r"[_()]+", tag):
            add_lookup_value(part, index)
    payload = {
        "signature": signature,
        "rows": rows,
        "character_tags": character_tags,
        "copyright_tags": copyright_tags,
        "lookup_exact": lookup_exact,
    }
    _canvas_danbooru_character_index_cache["local"] = payload
    return payload


def _canvas_character_row_lookup_values(row):
    values = [str(row.get("tag") or ""), str(row.get("tag") or "").replace("_", " ")]
    values.extend(_canvas_danbooru_aliases(row.get("aliases")))
    values.extend(_canvas_split_character_field(row.get("translation")))
    values.extend(_canvas_split_character_field(row.get("source_term")))
    values.extend(_canvas_split_character_field(row.get("group")))
    for merged_value in row.get("_merged_lookup_values") or []:
        values.extend(_canvas_split_character_field(merged_value))
    expanded = []
    for value in values:
        for item in _canvas_expand_character_lookup_value(value):
            if item and item not in expanded:
                expanded.append(item)
    return expanded


def _canvas_character_row_primary_lookup_values(row):
    values = [str(row.get("tag") or ""), str(row.get("tag") or "").replace("_", " ")]
    values.extend(_canvas_danbooru_aliases(row.get("aliases")))
    translation = str(row.get("translation") or "")
    if not translation.lstrip().startswith("|"):
        values.extend(_canvas_split_character_field(translation))
    values.extend(_canvas_split_character_field(row.get("source_term")))
    for merged_value in row.get("_merged_lookup_values") or []:
        values.extend(_canvas_split_character_field(merged_value))
    output = []
    for value in values:
        text = str(value or "").strip()
        if not text:
            continue
        normalized = text.replace("\uff08", "(").replace("\uff09", ")")
        stripped = re.sub(r"\s*\([^)]*\)\s*", "", normalized).strip()
        for item in (text, normalized, stripped):
            if item and item not in output:
                output.append(item)
    return output


def _canvas_character_row_mentions_copyright(row, copyright_terms):
    if not copyright_terms:
        return False
    haystack = " ".join(_canvas_character_row_lookup_values(row)).lower()
    compact = _canvas_normalize_character_lookup_text(haystack)
    return any(term and (term in haystack or term in compact) for term in copyright_terms)


def _canvas_character_row_variant_depth(row):
    tag = str((row or {}).get("tag") or "")
    return max(0, len(re.findall(r"\([^)]*\)", tag)) - 1)


def _canvas_character_row_matches_lookup_term(row, term):
    normalized = _canvas_normalize_character_lookup_text(term)
    if not normalized:
        return False
    for value in _canvas_character_row_lookup_values(row):
        if _canvas_normalize_character_lookup_text(value) == normalized:
            return True
    return False


def _canvas_character_row_matches_primary_lookup_term(row, term):
    normalized = _canvas_normalize_character_lookup_text(term)
    if not normalized:
        return False
    for value in _canvas_character_row_primary_lookup_values(row):
        if _canvas_normalize_character_lookup_text(value) == normalized:
            return True
    return False


def _canvas_character_row_has_explicit_lookup_hit(row, query, terms=None, lookup_index=None):
    query_text = str(query or "")
    compact_query = _canvas_normalize_character_lookup_text(query_text)
    normalized_terms = {
        _canvas_normalize_character_lookup_text(term)
        for term in (terms or [])
        if _canvas_normalize_character_lookup_text(term)
    }
    for value in _canvas_character_row_primary_lookup_values(row):
        normalized = _canvas_normalize_character_lookup_text(value)
        if not normalized:
            continue
        min_len = 2 if re.search(r"[\u3400-\u9fff]", str(value or "")) else 3
        if len(normalized) < min_len:
            continue
        if re.search(r"[\u3400-\u9fff]", normalized):
            if _canvas_lookup_term_spans(lookup_index or {}, query_text, normalized):
                return True
        elif normalized in normalized_terms:
            return True
        elif len(normalized) >= 6 and normalized in compact_query:
            return True
    return False


def _canvas_score_danbooru_character_row(row, query, terms, direct_tags=None, copyright_terms=None, lookup_index=None):
    query_text = str(query or "")
    query_lower = query_text.lower()
    compact_query = _canvas_normalize_character_lookup_text(query_text)
    tag = str(row.get("tag") or "").strip().lower()
    category = str(row.get("category") or "")
    direct_tags = set(direct_tags or [])
    copyright_terms = set(copyright_terms or [])
    values = _canvas_character_row_lookup_values(row)
    normalized_values = {_canvas_normalize_character_lookup_text(item): item for item in values}
    score = 0.0

    def cjk_term_allowed_as_name(term):
        text = str(term or "")
        if not re.search(r"[\u3400-\u9fff]", text):
            return True
        if _canvas_normalize_character_lookup_text(query_text) == _canvas_normalize_character_lookup_text(text):
            return True
        return bool(_canvas_lookup_term_spans(lookup_index or {}, query_text, _canvas_normalize_character_lookup_text(text)))

    if tag in direct_tags:
        score += 260
    if tag in terms:
        score += 190
    if compact_query and _canvas_normalize_character_lookup_text(tag) == compact_query:
        score += 190

    for raw, _original in normalized_values.items():
        if not raw:
            continue
        if category == "character" and raw in copyright_terms:
            continue
        raw_min_len = 2 if re.search(r"[\u3400-\u9fff]", raw) else 3
        if raw == compact_query:
            score += 180
            break
        if len(raw) >= raw_min_len and raw in compact_query and cjk_term_allowed_as_name(raw):
            score += 105
            break
        if len(raw) >= raw_min_len and any(raw == _canvas_normalize_character_lookup_text(term) for term in terms) and cjk_term_allowed_as_name(raw):
            score += 170 if raw_min_len == 2 else 120
            break

    aliases = _canvas_danbooru_aliases(row.get("aliases"))
    for alias in aliases:
        alias_norm = _canvas_normalize_character_lookup_text(alias)
        if len(alias_norm) < 3:
            continue
        if alias and (alias in terms or alias_norm == compact_query or (len(alias_norm) >= 3 and alias_norm in compact_query)):
            score += 140
            break

    translation = str(row.get("translation") or "")
    if translation:
        translation_norm = _canvas_normalize_character_lookup_text(translation)
        translation_min_len = 2 if re.search(r"[\u3400-\u9fff]", translation) else 3
        if (len(translation_norm) >= translation_min_len and translation in query_text and cjk_term_allowed_as_name(translation)) or translation_norm == compact_query:
            score += 155
        elif len(translation_norm) >= translation_min_len:
            if re.search(r"[\u3400-\u9fff]", translation_norm):
                if any(_canvas_normalize_character_lookup_text(term) == translation_norm for term in terms) and cjk_term_allowed_as_name(translation_norm):
                    score += 70
            elif any(term and term in translation.lower() for term in terms):
                score += 70

    source_term = str(row.get("source_term") or "")
    if source_term:
        source_norm = _canvas_normalize_character_lookup_text(source_term)
        if source_norm and (source_norm == compact_query or source_norm in compact_query):
            score += 200

    explicit_lookup_hit = bool(
        category == "character"
        and _canvas_character_row_has_explicit_lookup_hit(row, query_text, terms, lookup_index)
    )
    multi_explicit_character_terms = False
    if explicit_lookup_hit and copyright_terms and isinstance(lookup_index, dict):
        try:
            multi_explicit_character_terms = len(_canvas_explicit_character_lookup_terms(lookup_index, query_text, terms, direct_tags=direct_tags)) > 1
        except Exception:
            multi_explicit_character_terms = False
    if explicit_lookup_hit:
        score += 70

    tag_parts = [part for part in re.split(r"[_()]+", tag) if len(part) >= 3]
    for part in tag_parts:
        if category == "character" and part in copyright_terms:
            continue
        if part in terms or part in query_lower:
            score += 22
            if category == "character" and copyright_terms and (part in terms or part in compact_query):
                score += 95
    if category == "copyright" and tag_parts:
        primary_part = tag_parts[0]
        if primary_part in terms or primary_part in query_lower:
            score += 95

    if category == "character":
        score += 8
        if _canvas_character_row_mentions_copyright(row, copyright_terms):
            score += 125
        elif copyright_terms and not (explicit_lookup_hit and multi_explicit_character_terms):
            score -= 120
    elif category == "copyright":
        score += 4

    if str(row.get("source") or "") == "character_glossary.csv":
        score += 80 if str(row.get("glossary_status") or "") == "confirmed" else 35
    score += min(max(_canvas_safe_int(row.get("count")), 0), 1_000_000) / 1_000_000
    return score


_CANVAS_CHARACTER_QUERY_STOP_TERMS = {
    "draw", "make", "generate", "image", "picture", "photo", "portrait", "girl", "girls", "boy", "boys",
    "man", "men", "woman", "women", "male", "males", "female", "females",
    "one", "two", "three", "four", "five", "six",
    "a", "an", "the", "and", "or", "with", "without", "from", "into", "inside", "outside", "under", "over",
    "near", "beside", "between", "after", "before", "while", "during", "in", "on", "at", "by", "for", "to", "of",
    "hold", "holds", "holding", "held", "share", "shares", "shared", "sharing",
    "generation", "complete", "attached", "here", "finished", "result",
    "character", "person", "solo", "style", "prompt", "tag", "tags", "anime", "anima",
    "detail", "detailed", "scene", "setting", "background", "simple", "transparent",
    "avatar", "icon", "sticker", "reference", "sheet", "bust", "upper", "body",
    "illustration", "dynamic", "battle", "fight", "fighting", "motion", "rain", "rainy",
    "street", "night", "library", "office", "reading", "singing", "window",
    "forest", "garden", "processing", "documents",
    "travel", "traveling", "tour", "tourist", "tourism", "sightseeing", "station",
    "airport", "suitcase", "backpack", "camera", "photo", "map", "leisure",
    "flower", "flowers", "grass", "park", "city", "beach", "seaside", "ocean",
    "steam", "fog", "mist", "reflect", "reflection", "reflections", "water", "wave",
    "waves", "horizon", "ramen", "noodle", "noodles", "eating", "catgirl", "cat", "ears",
    "kendo", "dojo", "shinai", "wooden", "martial", "arts", "student", "students",
    "schoolyard", "campus", "kitchen", "cooking", "apron", "frying", "pan",
    "stove", "volleyball", "sports", "swimsuit", "swimsuits", "blue", "white", "cloud",
    "clouds", "cyberpunk", "futuristic", "neon", "lights", "transparent",
    "background", "v", "sign", "peace", "side", "profile", "smile",
    "black", "red", "orange", "pink", "purple", "yellow", "brown", "grey", "gray",
    "silver", "gold", "golden", "blonde", "blond", "aqua", "cyan", "teal",
    "hair", "black hair", "red hair", "orange hair", "pink hair", "purple hair",
    "yellow hair", "brown hair", "white hair", "blue hair", "green hair",
    "silver hair", "grey hair", "gray hair", "blonde hair", "blond hair",
    "green", "eye", "eyes", "green eyes", "red eyes", "orange eyes", "pink eyes",
    "purple eyes", "yellow eyes", "brown eyes", "white eyes", "blue eyes",
    "grey eyes", "gray eyes", "silver eyes", "golden eyes", "emerald",
    "streak", "streaks", "streaked", "highlight", "highlights", "stripe", "striped",
    "twintails", "twin tails", "twin-tails", "white streak", "hair streak",
    "fur", "patch", "ear", "cat ears", "magic", "magical", "magical girl",
    "daily", "relax", "cafe", "coffee", "picnic", "shopping", "romance",
    "romantic", "couple", "date", "dating", "hug", "kiss", "kissing",
    "yuri", "yaoi", "lesbian", "girls_love", "boys_love", "shoujo_ai",
    "shounen_ai", "outdoor", "park",
    "旅行", "旅游", "出游", "观光", "行李", "车站", "机场", "拍照", "相机", "地图",
    "休闲", "放松", "咖啡", "咖啡馆", "茶馆", "野餐", "逛街", "购物", "日常",
    "两性互动", "情侣", "约会", "恋爱", "牵手", "拥抱", "暧昧", "男女互动",
    "户外", "外景", "自然", "公园", "海边", "海滩", "草地",
    "详细", "场景", "情景", "需要", "背景", "简单", "简洁", "透明", "头像", "贴纸",
    "设定图", "角色设定图", "半身", "半身照", "上半身", "全身", "立绘", "画面", "丰富",
    "画", "画图", "生成", "图片", "图像", "照片", "角色", "人物", "女孩", "少女", "男孩",
    "一个", "一张", "画一张", "提示词", "标签", "动漫", "二次元", "原创", "我的",
    "美丽", "漂亮", "风景", "风景画", "横屏", "竖屏", "背景", "壁纸",
    "动态", "插画", "战斗", "动作", "雨夜", "街道", "夜晚", "图书馆", "办公室",
    "阅读", "读书", "唱歌", "窗边", "森林", "花园", "处理", "文件",
    "继续", "继续画", "再来", "再来一张", "再画", "再画一张", "换一张", "另一张", "上一张", "同样",
    "场景照", "场景图", "情景图",
    "蒸汽", "雾气", "薄雾", "倒影", "反射", "拉面", "猫娘", "猫耳娘", "猫耳",
    "剑道", "道场", "木刀", "道服", "厨房", "做饭", "炒菜", "围裙", "炒菜锅",
    "沙滩排球", "排球", "泳装", "蓝天", "白云", "未来", "霓虹", "校园", "学生",
    "透明背景", "比耶", "比耶手势", "侧面", "侧脸", "谢幕", "排练室", "乐器",
    "魔法少女", "魔法女孩", "侦探", "下雨", "路灯", "转身", "回头", "看镜头",
    "天使", "心跳",
    "黑发", "黑色头发", "黑色双马尾", "双马尾", "翠绿眼睛", "绿色眼睛", "绿眼",
    "猫耳娘", "猫娘", "猫耳", "挑染白发", "白发挑染", "白色挑染",
    "耳朵根部有白毛", "耳根白毛", "给我看看你的样子", "你的样子",
    "想看", "来看", "来张", "给我", "帮我", "游戏", "游戏角色", "跳跃", "跳起来",
    "打怪", "动作感", "强一点", "场面", "场面图", "一起", "雨中", "撑伞", "打伞",
    "神社", "鸟居", "夜景", "夜景图", "白天", "晚上",
}


def _canvas_character_term_blocked_by_object_context(term, query):
    normalized = _canvas_normalize_character_lookup_text(term)
    if not normalized:
        return False
    source = str(query or "").lower()
    if normalized == "umbrella":
        if re.search(r"\bskullgirls\b", source):
            return False
        return bool(re.search(
            r"\b(?:sharing|shared|holding|hold|holds|held|under|with|open|opened|carry|carries|carrying|rain|rainy|street|puddle|wet)\b.{0,40}\bumbrellas?\b"
            r"|\bumbrellas?\b.{0,40}\b(?:rain|rainy|street|puddle|wet|sharing|shared|holding|hold|under|with|open|opened|carry|carries|carrying)\b",
            source,
            re.I,
        ))
    raw = str(term or "").strip()
    if raw and re.search(rf"{re.escape(raw)}\s*(?:画风|畫風|风格|風格|style|artist)", source, re.I):
        return True
    return False


def _canvas_strip_cjk_character_request_prefix(value):
    text = str(value or "").strip()
    if not text:
        return ""
    return re.sub(
        r"^(?:请|請|帮我|幫我|给我|給我|用|画|畫|绘|繪|生成|做|来|來|把|一张|一張|一个|一個)+",
        "",
        text,
    ).strip()


def _canvas_character_entity_terms(query):
    text = str(query or "")
    terms = []
    lower = text.lower()
    english = re.findall(r"[a-zA-Z0-9_][a-zA-Z0-9_().'-]{2,}", text)
    chinese = re.findall(r"[\u3400-\u9fff]{2,12}", text)
    for item in english + chinese:
        clean = str(item or "").strip()
        if not clean:
            continue
        if re.search(r"[\u3400-\u9fff]", clean):
            clean = _canvas_strip_cjk_character_request_prefix(clean) or clean
        lowered = clean.lower()
        if lowered in _CANVAS_CHARACTER_QUERY_STOP_TERMS:
            continue
        if _canvas_character_term_blocked_by_object_context(lowered, text):
            continue
        if clean in terms or lowered in terms:
            continue
        # Avoid treating ordinary descriptive Chinese sentences as named entities.
        if re.search(r"[\u3400-\u9fff]", clean) and len(clean) > 5 and not any(marker in lower for marker in ("角色", "人物", "oc", "名叫", "叫做", "来自", "画", "生成")):
            continue
        terms.append(lowered if re.search(r"[a-zA-Z]", clean) else clean)
    return terms[:12]


def _canvas_character_candidate_indices(index, query, terms, direct_tags=None):
    lookup = index.get("lookup_exact") if isinstance(index, dict) else {}
    if not isinstance(lookup, dict):
        return None
    keys = []

    def add_key(value):
        normalized = _canvas_normalize_character_lookup_text(value)
        if normalized and normalized not in keys:
            keys.append(normalized)

    add_key(query)
    for term in terms or []:
        add_key(term)
    for tag in direct_tags or []:
        add_key(tag)
        for part in re.split(r"[_()]+", str(tag or "")):
            add_key(part)

    matched = set()
    for key in keys:
        if len(key) < 2:
            continue
        for index_value in lookup.get(key) or []:
            matched.add(index_value)
    if not matched and (_canvas_character_entity_terms(query) or direct_tags):
        return []
    if not matched:
        return None
    return sorted(matched)


def _canvas_character_row_has_negated_lookup_hit(row, source):
    text = str(source or "")
    if not text:
        return False
    values = []
    try:
        values = list(_canvas_character_row_lookup_values(row))
    except Exception:
        values = []
    for value in values:
        phrase = str(value or "").strip()
        if len(phrase) < 2:
            continue
        start = text.lower().find(phrase.lower())
        if start >= 0 and _canvas_hint_phrase_negated(text, start, phrase):
            return True
    return False


def _canvas_lookup_has_category(index, value, category):
    lookup = index.get("lookup_exact") if isinstance(index, dict) else {}
    rows = list(index.get("rows") or []) if isinstance(index, dict) else []
    normalized = _canvas_normalize_character_lookup_text(value)
    if not normalized:
        return False
    return any(
        0 <= idx < len(rows) and rows[idx].get("category") == category
        for idx in (lookup.get(normalized) or [])
    )


_CANVAS_CJK_LOOKUP_LEFT_BOUNDARY_CHARS = set(
    "\u753b\u7ed9\u505a\u8981\u6765\u628a\u540c\u548c\u4e0e\u8ddf\u53ca\u5e76\u5e26\u6709\u52a0\u4e0a"
    "\u6362\u6210\u5f20\u5e45\u4e2a\u500b\u4f4d\u540d\u53ea\u6b3e\u4e0b\u7684\u3001\uff0c,:\uff1a \t\n"
)
_CANVAS_CJK_LOOKUP_RIGHT_BOUNDARY_CHARS = set(
    "\u548c\u4e0e\u8ddf\u53ca\u5e76\u540c\u7684\u5728\u7ed9\u88ab\u3001\uff0c,\u3002.!?\uff01\uff1f \t\n"
    "\u4eb2\u62b1\u7275\u7761\u6218\u6253\u8d70\u5750\u7ad9\u5531\u8df3\u73a9\u7a7f\u62ff\u6491\u4e3e\u770b\u7b11\u54ed"
    "\u8eba\u7740\u4e0a\u5165\u6d17\u6ce1\u6c90"
)
_CANVAS_CJK_LOOKUP_LEFT_BOUNDARY_RE = re.compile(
    "(?:\u753b|\u7ed8|\u505a|\u751f\u6210|\u6765|\u8981|\u7ed9|\u628a|\u540c|\u548c|\u4e0e|\u8ddf|\u4ee5\u53ca|\u8fd8\u6709|\u89d2\u8272|\u4eba\u7269|\u540c\u4eba|\u6765\u81ea)$"
)
_CANVAS_CJK_LOOKUP_RIGHT_BOUNDARY_RE = re.compile(
    "^(?:\u548c|\u4e0e|\u8ddf|\u4ee5\u53ca|\u8fd8\u6709|\u7684|\u5728|\u7ed9|"
    "\u4eb2\u5634|\u63a5\u543b|\u4eb2\u543b|\u4eb2\u4e00\u4e0b|\u62e5\u62b1|\u62b1|\u7275\u624b|\u5408\u7167|\u4e92\u52a8|\u7ea6\u4f1a|"
    "\u53e3\u4ea4|\u53e3\u7206|\u6df1\u5589|\u624b\u4ea4|\u4e73\u4ea4|\u809b\u4ea4|\u6027\u4ea4|\u505a\u7231|\u505a\u611b|\u63d2\u5165|"
    "\u88ab|\u989c\u5c04|\u984f\u5c04|\u5c04\u6ee1\u8138|\u5c04\u6eff\u81c9|\u5c04\u5728\u8138\u4e0a|\u5c04\u5728\u81c9\u4e0a|"
    "\u7761\u89c9|\u719f\u7761|\u8eba|\u8eba\u5728|\u6218\u6597|\u6253\u6597|\u65c5\u884c|\u65c5\u6e38|\u6563\u6b65|\u8d70\u8def|"
    "\u7a7f|\u7a7f\u7740|\u6cf3\u88c5|\u6d77\u8fb9|\u6c99\u6ee9|\u57ce\u5e02|\u8857\u9053|\u96e8\u591c|\u56fe|\u56fe\u7247|\u89d2\u8272|\u573a\u666f)"
)


def _canvas_cjk_lookup_term_boundary_ok(index, source, start, end):
    text = str(source or "")
    left_char = text[start - 1] if start > 0 else ""
    right_char = text[end] if end < len(text) else ""
    left_text = text[max(0, start - 8):start]
    right_text = text[end:end + 8]
    cjk = r"[\u3400-\u9fff]"

    def cjk_char(value):
        return bool(value and re.search(cjk, value))

    def adjacent_to_copyright_side(value, side):
        for size in range(min(8, len(value)), 1, -1):
            piece = value[-size:] if side == "left" else value[:size]
            if _canvas_lookup_has_category(index, piece, "copyright"):
                return True
        return False

    left_ok = True
    if cjk_char(left_char):
        left_ok = bool(
            left_char in _CANVAS_CJK_LOOKUP_LEFT_BOUNDARY_CHARS
            or _CANVAS_CJK_LOOKUP_LEFT_BOUNDARY_RE.search(left_text)
            or adjacent_to_copyright_side(left_text, "left")
        )
    right_ok = True
    if cjk_char(right_char):
        right_ok = bool(
            right_char in _CANVAS_CJK_LOOKUP_RIGHT_BOUNDARY_CHARS
            or _CANVAS_CJK_LOOKUP_RIGHT_BOUNDARY_RE.search(right_text)
            or adjacent_to_copyright_side(right_text, "right")
        )
    return left_ok and right_ok

    left_ok = True
    if cjk_char(left_char):
        left_ok = bool(
            left_char in "画绘做要来给把同和与跟及张幅个位名只款下、，,（("
            or re.search(r"(?:画|绘|做|生成|来|要|给|把|同|和|与|跟|以及|还有|角色|人物)$", left_text)
            or adjacent_to_copyright_side(left_text, "left")
        )
    right_ok = True
    if cjk_char(right_char):
        right_ok = bool(
            right_char in "和与跟及同的在给、，,）)"
            or re.search(r"^(?:和|与|跟|以及|还有|的|在|给|亲|吻|接吻|亲嘴|拥抱|抱|合照|互动|牵手|睡|战斗|旅行|散步|图|图片|角色|场景)", right_text)
            or adjacent_to_copyright_side(right_text, "right")
        )
    return left_ok and right_ok


def _canvas_lookup_term_spans(index, source, term):
    text = str(source or "")
    normalized = _canvas_normalize_character_lookup_text(term)
    if not text or not normalized:
        return []
    spans = []
    if re.search(r"[\u3400-\u9fff]", normalized):
        start = 0
        while True:
            index_at = text.find(normalized, start)
            if index_at < 0:
                break
            end = index_at + len(normalized)
            if _canvas_cjk_lookup_term_boundary_ok(index, text, index_at, end):
                spans.append((index_at, end))
            start = index_at + 1
    else:
        pattern = re.compile(rf"(?<![a-z0-9_]){re.escape(str(term or '').lower())}(?![a-z0-9_])", re.I)
        spans.extend((match.start(), match.end()) for match in pattern.finditer(text.lower()))
    return spans


def _canvas_explicit_character_lookup_terms(index, query, terms, direct_tags=None):
    lookup = index.get("lookup_exact") if isinstance(index, dict) else {}
    rows = list(index.get("rows") or []) if isinstance(index, dict) else []
    matches = []
    direct_tags = set(direct_tags or [])
    character_tags = set(index.get("character_tags") or set()) if isinstance(index, dict) else set()
    direct_character_tags = {tag for tag in direct_tags if tag in character_tags}
    direct_norms = {_canvas_normalize_character_lookup_text(tag) for tag in direct_tags if tag}
    direct_character_norms = {_canvas_normalize_character_lookup_text(tag) for tag in direct_character_tags if tag}
    for term in terms or []:
        normalized = _canvas_normalize_character_lookup_text(term)
        if not normalized or len(normalized) < 2:
            continue
        if normalized not in direct_norms and any(normalized in direct_term and normalized != direct_term for direct_term in direct_norms):
            continue
        matched = lookup.get(normalized) or []
        if (
            _canvas_lookup_has_category(index, normalized, "copyright")
            and normalized not in direct_character_norms
        ):
            continue
        has_primary_character_match = any(
            0 <= idx < len(rows)
            and rows[idx].get("category") == "character"
            and _canvas_character_row_matches_primary_lookup_term(rows[idx], normalized)
            for idx in matched
        )
        if normalized not in direct_norms and _canvas_lookup_has_category(index, normalized, "copyright") and not has_primary_character_match:
            continue
        if not has_primary_character_match:
            continue
        if any(item["term"] == normalized for item in matches):
            continue
        spans = _canvas_lookup_term_spans(index, query, normalized)
        if not spans and not re.search(r"[\u3400-\u9fff]", normalized) and len(normalized) >= 6:
            if normalized in _canvas_normalize_character_lookup_text(query):
                spans = [(-1, -1)]
        if not spans and normalized not in direct_tags:
            continue
        start, end = spans[0] if spans else (-1, -1)
        matches.append({"term": normalized, "start": start, "end": end, "length": len(normalized)})
    for tag in direct_character_tags:
        normalized = _canvas_normalize_character_lookup_text(tag)
        if normalized and not any(item["term"] == normalized for item in matches):
            matches.append({"term": normalized, "start": -1, "end": -1, "length": len(normalized)})
    selected = []
    occupied = []
    for item in sorted(matches, key=lambda data: (-int(data.get("length") or 0), int(data.get("start") if data.get("start") is not None else 9999), data.get("term") or "")):
        start = int(item.get("start") or -1)
        end = int(item.get("end") or -1)
        term = str(item.get("term") or "")
        if any(term and term != str(used.get("term") or "") and term in str(used.get("term") or "") for used in selected):
            continue
        if start >= 0 and any(not (end <= used_start or start >= used_end) for used_start, used_end in occupied):
            continue
        selected.append(item)
        if start >= 0:
            occupied.append((start, end))
    selected.sort(key=lambda data: (999999 if int(data.get("start") or -1) < 0 else int(data.get("start") or 0), -(int(data.get("length") or 0))))
    return [item["term"] for item in selected[:6]]


def _canvas_select_character_for_lookup_term(candidates, term):
    matches = [
        item for item in candidates or []
        if item.get("category") == "character" and _canvas_character_row_matches_primary_lookup_term(item, term)
    ]
    if not matches:
        return None
    term_text = str(term or "")
    normalized_term = _canvas_normalize_character_lookup_text(term_text)
    exact_tag_matches = [
        item for item in matches
        if _canvas_normalize_character_lookup_text(item.get("tag")) == normalized_term
    ]
    if exact_tag_matches:
        return sorted(exact_tag_matches, key=lambda item: (
            -float(item.get("score") or 0),
            _canvas_character_row_variant_depth(item),
            -_canvas_safe_int(item.get("count")),
            str(item.get("tag") or ""),
        ))[0]
    generic_short_name = bool(re.search(r"[\u3400-\u9fff]", term_text) and len(term_text) <= 3)
    base_lookup_name = bool(term_text and not re.search(r"[():：]", term_text))
    if generic_short_name or base_lookup_name:
        return sorted(matches, key=lambda item: (
            _canvas_character_row_variant_depth(item),
            -_canvas_safe_int(item.get("count")),
            -float(item.get("score") or 0),
            str(item.get("tag") or ""),
        ))[0]
    return sorted(matches, key=lambda item: (
        -float(item.get("score") or 0),
        _canvas_character_row_variant_depth(item),
        -_canvas_safe_int(item.get("count")),
        str(item.get("tag") or ""),
    ))[0]


def _canvas_filter_copyright_hits_for_resolved(copyright_hits, resolved):
    if not copyright_hits or not resolved:
        return copyright_hits
    parent_terms = []
    for row in resolved:
        tag = str((row or {}).get("tag") or "")
        for parenthetical in re.findall(r"\(([^)]+)\)", tag):
            term = _canvas_clean_prompt_tag_name(parenthetical)
            if term and term not in parent_terms:
                parent_terms.append(term)
    if not parent_terms:
        return copyright_hits[:1]

    exact_preferred = []
    loose_preferred = []
    for hit in copyright_hits:
        tag = _canvas_clean_prompt_tag_name((hit or {}).get("tag"))
        for term in parent_terms:
            exact_tags = {term, f"{term}_(series)"}
            if tag in exact_tags:
                exact_preferred.append(hit)
                break
            if tag.startswith(term + "/") or tag.startswith(term + "_"):
                loose_preferred.append(hit)
                break
    if exact_preferred:
        return exact_preferred[:2]
    if loose_preferred:
        return loose_preferred[:2]
    return copyright_hits[:1]


def _canvas_derive_copyright_hits_from_resolved(resolved, index):
    if not resolved or not isinstance(index, dict):
        return []
    copyright_tags = set(index.get("copyright_tags") or set())
    rows = list(index.get("rows") or [])
    by_tag = {
        str(row.get("tag") or ""): row
        for row in rows
        if isinstance(row, dict) and row.get("category") == "copyright" and row.get("tag")
    }
    output = []

    def add_candidate_tags(candidates):
        for candidate in candidates:
            if candidate in copyright_tags and candidate not in {item.get("tag") for item in output}:
                output.append(dict(by_tag.get(candidate) or {"tag": candidate, "category": "copyright", "count": 0}))
                return True
        return False

    for row in resolved:
        tag = str((row or {}).get("tag") or "")
        for parenthetical in re.findall(r"\(([^)]+)\)", tag):
            clean = _canvas_clean_prompt_tag_name(parenthetical)
            if not clean:
                continue
            add_candidate_tags([clean, f"{clean}_(series)"])
        if output:
            continue
        for value in _canvas_character_row_lookup_values(row):
            for parenthetical in re.findall(r"\(([^)]+)\)", str(value or "")):
                clean = _canvas_clean_prompt_tag_name(parenthetical)
                if not clean:
                    continue
                candidates = [clean, f"{clean}_(series)"]
                if clean == "fate":
                    candidates = ["fate/stay_night", "fate_(series)", "fate/grand_order", "fate/extra"]
                if add_candidate_tags(candidates):
                    break
            if output:
                break
    return output[:2]


def _canvas_fast_character_resolution_signature():
    root = _CANVAS_DANBOORU_ROOT
    paths = [
        os.path.join(root, "tags", "danbooru_all.csv"),
        _canvas_character_glossary_path(),
        _canvas_gallery_db_path(),
    ]
    return _canvas_danbooru_cache_signature([path for path in paths if path])


def _canvas_fast_character_lookup_terms(source):
    text = str(source or "")
    if not re.search(r"[\u3400-\u9fff]", text):
        return []
    terms = []

    def add(value):
        raw = str(value or "").strip()
        normalized = _canvas_normalize_character_lookup_text(raw)
        if len(normalized) < 2:
            return
        if normalized in _CANVAS_CHARACTER_QUERY_STOP_TERMS:
            return
        if _canvas_character_term_blocked_by_object_context(normalized, text):
            return
        if normalized not in terms:
            terms.append(normalized)

    for item in _canvas_character_entity_terms(text):
        add(item)
    for chunk in re.findall(r"[\u3400-\u9fff]{2,18}", text):
        chunk = _canvas_strip_cjk_character_request_prefix(chunk) or chunk
        if _canvas_normalize_character_lookup_text(chunk) in _CANVAS_CHARACTER_QUERY_STOP_TERMS:
            continue
        max_len = min(8, len(chunk))
        for size in range(max_len, 1, -1):
            for start_index in range(0, len(chunk) - size + 1):
                add(chunk[start_index:start_index + size])
    terms.sort(key=lambda item: (-len(item), item))
    return terms[:80]


def _canvas_add_fast_character_row(rows, seen, row, source_suffix="targeted"):
    if not isinstance(row, dict):
        return
    tag = str(row.get("tag") or "").strip()
    category = str(row.get("category") or "").strip()
    if not tag or category not in {"character", "copyright"}:
        return
    key = (category, tag)
    if key in seen:
        current = next((item for item in rows if (item.get("category"), item.get("tag")) == key), None)
        if current:
            current["count"] = max(_canvas_safe_int(current.get("count")), _canvas_safe_int(row.get("count")))
            for field in ("aliases", "translation", "group", "source_term"):
                current_value = str(current.get(field) or "").strip()
                next_value = str(row.get(field) or "").strip()
                if not current_value and next_value:
                    current[field] = row.get(field)
                elif current_value and next_value and current_value != next_value:
                    current.setdefault("_merged_lookup_values", [])
                    if next_value not in current["_merged_lookup_values"]:
                        current["_merged_lookup_values"].append(next_value)
            current["_targeted_match_len"] = max(
                int(current.get("_targeted_match_len") or 0),
                int(row.get("_targeted_match_len") or 0),
            )
        return
    item = dict(row)
    item["tag"] = tag
    item["category"] = category
    item["source"] = str(item.get("source") or source_suffix)
    rows.append(item)
    seen.add(key)


def _canvas_fast_identity_rows_from_danbooru_all(source, terms, max_rows=160):
    path = os.path.join(_CANVAS_DANBOORU_ROOT, "tags", "danbooru_all.csv")
    if not os.path.exists(path) or not terms:
        return []
    rows = []
    seen = set()
    term_set = set(terms or [])
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle)
            for raw in reader:
                if not raw:
                    continue
                category_raw = str(raw[1] if len(raw) > 1 else "").strip()
                category = _CANVAS_DANBOORU_CATEGORY_LABELS.get(category_raw, category_raw)
                if category not in {"character", "copyright"}:
                    continue
                tag = re.sub(r"\s+", "_", str(raw[0] if len(raw) > 0 else "").strip().lower())
                if not tag:
                    continue
                count = _canvas_safe_int(raw[2] if len(raw) > 2 else 0)
                aliases = str(raw[3] if len(raw) > 3 else "").strip()
                translation = str(raw[4] if len(raw) > 4 else "").strip()
                group = str(raw[5] if len(raw) > 5 else "").strip()
                haystack = _canvas_normalize_character_lookup_text(
                    " ".join([tag, tag.replace("_", " "), aliases, translation, group])
                )
                matched_terms = [term for term in term_set if term and term in haystack]
                if not matched_terms:
                    continue
                item = {
                    "tag": tag,
                    "category": category,
                    "count": count,
                    "aliases": aliases,
                    "translation": translation,
                    "group": group,
                    "source": "danbooru_all.csv:targeted",
                    "_targeted_match_len": max(len(term) for term in matched_terms),
                }
                _canvas_add_fast_character_row(rows, seen, item, "danbooru_all.csv:targeted")
    except Exception as exc:
        logger.warning("Targeted Danbooru character scan failed %s: %s", path, exc)
    rows.sort(key=lambda item: (
        -int(item.get("_targeted_match_len") or 0),
        0 if item.get("category") == "character" else 1,
        -_canvas_safe_int(item.get("count")),
        str(item.get("tag") or ""),
    ))
    row_limit = max(1, int(max_rows or 160))
    character_limit = max(1, int(row_limit * 0.75))
    copyright_limit = max(1, row_limit - character_limit)
    character_rows = [item for item in rows if item.get("category") == "character"][:character_limit]
    copyright_rows = [item for item in rows if item.get("category") == "copyright"][:copyright_limit]
    return character_rows + copyright_rows


def _canvas_derived_copyright_rows_for_fast_index(rows):
    output = []
    seen = set()

    def add_candidate(candidate):
        tag = _canvas_clean_prompt_tag_name(candidate)
        if not tag or len(tag) < 3 or tag in _CANVAS_DANBOORU_LOW_SIGNAL_TAGS:
            return
        if re.search(r"[\u3400-\u9fff]", tag):
            return
        if (tag.startswith("@") or tag in {"cosplay", "character", "series"}):
            return
        key = ("copyright", tag)
        if key in seen:
            return
        seen.add(key)
        output.append({
            "tag": tag,
            "category": "copyright",
            "count": 0,
            "aliases": "",
            "translation": "",
            "group": "derived",
            "source": "character_parenthetical:targeted",
        })

    for row in rows or []:
        if not isinstance(row, dict) or row.get("category") != "character":
            continue
        values = [row.get("tag"), row.get("aliases"), row.get("translation"), row.get("source_term")]
        for value in values:
            for inner in re.findall(r"\(([^)]+)\)", str(value or "").replace("（", "(").replace("）", ")")):
                clean = _canvas_clean_prompt_tag_name(inner)
                if not clean:
                    continue
                if clean == "fate":
                    for candidate in ("fate/stay_night", "fate_(series)", "fate/grand_order"):
                        add_candidate(candidate)
                else:
                    add_candidate(clean)
                    add_candidate(f"{clean}_(series)")
    return output


def _canvas_character_index_from_rows(rows, signature):
    deduped = []
    seen = set()
    for row in rows or []:
        _canvas_add_fast_character_row(deduped, seen, row, "targeted_character_index")
    for row in _canvas_derived_copyright_rows_for_fast_index(deduped):
        _canvas_add_fast_character_row(deduped, seen, row, "character_parenthetical:targeted")

    character_tags = {str(row.get("tag") or "") for row in deduped if row.get("category") == "character"}
    copyright_tags = {str(row.get("tag") or "") for row in deduped if row.get("category") == "copyright"}
    lookup_exact = {}

    def add_lookup_value(value, index):
        normalized = _canvas_normalize_character_lookup_text(value)
        if not normalized:
            return
        min_len = 2 if re.search(r"[\u3400-\u9fff]", str(value or "")) else 3
        if len(normalized) < min_len:
            return
        lookup_exact.setdefault(normalized, []).append(index)

    for index, row in enumerate(deduped):
        for value in _canvas_character_row_lookup_values(row):
            add_lookup_value(value, index)
        tag = str(row.get("tag") or "")
        for part in re.split(r"[_()]+", tag):
            add_lookup_value(part, index)
    return {
        "signature": signature,
        "rows": deduped,
        "character_tags": character_tags,
        "copyright_tags": copyright_tags,
        "lookup_exact": lookup_exact,
    }


def _canvas_fast_resolve_danbooru_characters(query, limit=12):
    source = str(query or "").strip()
    if not source or not re.search(r"[\u3400-\u9fff]", source):
        return None
    terms = _canvas_fast_character_lookup_terms(source)
    if not terms:
        return None
    signature = (_canvas_fast_character_resolution_signature(), tuple(terms[:80]), source[:500])
    cached = _canvas_danbooru_character_fast_resolution_cache.get(signature) if isinstance(_canvas_danbooru_character_fast_resolution_cache, dict) else None
    if isinstance(cached, dict):
        return dict(cached)

    rows = []
    seen = set()

    def resolved_from_rows(current_rows):
        if not current_rows:
            return None
        mini_index = _canvas_character_index_from_rows(current_rows, signature)
        result = _canvas_resolve_danbooru_characters(source, limit=limit, index=mini_index)
        if isinstance(result, dict) and result.get("state") in {"resolved", "copyright_only"}:
            result = dict(result)
            result["source"] = "targeted_character_lookup"
            return result
        return None

    for row in _canvas_load_character_glossary_rows():
        values = " ".join(str(row.get(key) or "") for key in ("tag", "aliases", "translation", "source_term", "group"))
        haystack = _canvas_normalize_character_lookup_text(values)
        if any(term in haystack for term in terms):
            _canvas_add_fast_character_row(rows, seen, row, "character_glossary.csv:targeted")
    for row in _canvas_fast_identity_rows_from_danbooru_all(source, terms, max_rows=160):
        _canvas_add_fast_character_row(rows, seen, row, "danbooru_all.csv:targeted")
    result = resolved_from_rows(rows)
    if result:
        _canvas_danbooru_character_fast_resolution_cache[signature] = result
        return dict(result)

    for term in terms[:28]:
        for row in _canvas_gallery_query_rows(term, limit=8, categories=("character", "copyright")):
            _canvas_add_fast_character_row(rows, seen, row, "ComfyUI-Danbooru-Gallery/tags_cache.db:targeted")
    if not rows:
        _canvas_danbooru_character_fast_resolution_cache[signature] = None
        return None

    result = resolved_from_rows(rows)
    if result:
        _canvas_danbooru_character_fast_resolution_cache[signature] = result
        return dict(result)
    _canvas_danbooru_character_fast_resolution_cache[signature] = None
    return None


def _canvas_resolve_danbooru_characters(query, limit=10, index=None):
    source = str(query or "").strip()
    index = index if isinstance(index, dict) else _canvas_load_danbooru_character_index()
    rows = list(index.get("rows") or [])
    character_tag_set = set(index.get("character_tags") or set())
    copyright_tag_set = set(index.get("copyright_tags") or set())
    identity_tags = character_tag_set.union(copyright_tag_set)
    direct_tags = {tag for tag in _canvas_danbooru_direct_hint_tags(source, identity_tag_set=identity_tags) if tag in identity_tags}
    entity_terms = _canvas_character_entity_terms(source)
    empty_resolution = {
        "state": "none",
        "resolved": [],
        "candidates": [],
        "copyright_candidates": [],
        "unresolved_terms": [],
        "source": "local_danbooru_all_gallery_and_character_glossary",
    }
    if not direct_tags and not entity_terms:
        return dict(empty_resolution)
    if (
        "blue_archive" in direct_tags
        and not (direct_tags & character_tag_set)
        and re.search(r"(?:\u54ea\u4e2a\u5b66\u751f\u90fd\u884c|\u54ea\u500b\u5b78\u751f\u90fd\u884c|\u4efb\u610f\u5b66\u751f|\u968f\u4fbf.{0,4}\u5b66\u751f|\u5b66\u751f\u90fd\u884c|any\s+student)", source, re.I)
    ):
        copyright_rows = [
            dict(row, score=999.0)
            for row in rows
            if row.get("category") == "copyright"
            and str(row.get("tag") or "").strip().lower() == "blue_archive"
        ]
        if copyright_rows:
            result = dict(empty_resolution)
            result["state"] = "copyright_only"
            result["copyright_candidates"] = copyright_rows[:8]
            return result
    if direct_tags and not entity_terms and not (direct_tags & character_tag_set):
        copyright_rows = [
            dict(row, score=999.0)
            for row in rows
            if row.get("category") == "copyright"
            and str(row.get("tag") or "").strip().lower() in direct_tags
        ]
        if copyright_rows:
            result = dict(empty_resolution)
            result["state"] = "copyright_only"
            result["copyright_candidates"] = copyright_rows[:8]
            return result
    terms = []

    def add_term(item):
        item = str(item or "").strip().lower()
        if (
            item
            and item not in _CANVAS_CHARACTER_QUERY_STOP_TERMS
            and not _canvas_character_term_blocked_by_object_context(item, source)
            and item not in terms
        ):
            terms.append(item)

    english_tokens = re.findall(r"[a-zA-Z0-9_][a-zA-Z0-9_().'/-]*", source.lower())
    for size in (4, 3, 2):
        for start_index in range(0, max(0, len(english_tokens) - size + 1)):
            add_term(" ".join(english_tokens[start_index:start_index + size]))
    for item in english_tokens + re.findall(r"[\u3400-\u9fff]{1,12}", source):
        add_term(item)
    for chunk in re.findall(r"[\u3400-\u9fff]{3,16}", source):
        chunk = str(chunk or "").strip()
        max_len = min(6, len(chunk))
        for size in range(max_len, 1, -1):
            for start_index in range(0, len(chunk) - size + 1):
                piece = chunk[start_index:start_index + size]
                add_term(piece)
    for tag in direct_tags:
        if tag not in terms:
            terms.append(tag)
    if not terms and not direct_tags:
        return dict(empty_resolution)
    candidate_indices = _canvas_character_candidate_indices(index, source, terms, direct_tags=direct_tags)
    rows_to_score = [rows[i] for i in candidate_indices if 0 <= i < len(rows)] if isinstance(candidate_indices, list) else rows
    rows_to_score = [
        row for row in rows_to_score
        if not _canvas_character_row_has_negated_lookup_hit(row, source)
    ]

    copyright_hits = []
    for row in rows_to_score:
        if row.get("category") != "copyright":
            continue
        score = _canvas_score_danbooru_character_row(row, source, terms, direct_tags=direct_tags, lookup_index=index)
        if score >= 85:
            item = dict(row)
            item["score"] = round(score, 3)
            copyright_hits.append(item)
    copyright_hits = sorted(copyright_hits, key=lambda item: (-float(item.get("score") or 0), -int(item.get("count") or 0), str(item.get("tag") or "")))[:8]
    copyright_hits_for_terms = list(copyright_hits)
    if len(copyright_hits) > 1:
        first_score = float(copyright_hits[0].get("score") or 0)
        second_score = float(copyright_hits[1].get("score") or 0)
        if first_score - second_score >= 22 or first_score >= 220:
            copyright_hits_for_terms = [copyright_hits[0]]
    copyright_terms = {
        _canvas_normalize_character_lookup_text(item.get("tag"))
        for item in copyright_hits_for_terms
        if item.get("tag")
    }
    for item in copyright_hits_for_terms:
        copyright_terms.update(_canvas_normalize_character_lookup_text(value) for value in _canvas_character_row_lookup_values(item))
    copyright_terms = {item for item in copyright_terms if len(item) >= 3}

    candidates = []
    for row in rows_to_score:
        score = _canvas_score_danbooru_character_row(row, source, terms, direct_tags=direct_tags, copyright_terms=copyright_terms, lookup_index=index)
        if score < 145:
            continue
        item = dict(row)
        item["score"] = round(score, 3)
        candidates.append(item)
    sorted_candidates = sorted(candidates, key=lambda item: (
        -float(item.get("score") or 0),
        0 if item.get("category") == "character" else 1,
        -int(item.get("count") or 0),
        str(item.get("tag") or ""),
    ))
    candidate_limit = max(1, min(int(limit or 10), 40))
    explicit_hit_candidates = []
    try:
        explicit_terms_for_candidates = _canvas_explicit_character_lookup_terms(index, source, terms, direct_tags=direct_tags)
    except Exception:
        explicit_terms_for_candidates = []
    for term in explicit_terms_for_candidates:
        selected = _canvas_select_character_for_lookup_term(sorted_candidates, term)
        if selected:
            explicit_hit_candidates.append(selected)
    if not explicit_hit_candidates:
        explicit_hit_candidates = [
            item for item in sorted_candidates
            if item.get("category") == "character"
            and _canvas_character_row_has_explicit_lookup_hit(item, source, terms, index)
        ][:8]
    candidates = []
    seen_candidate_tags = set()
    for item in list(sorted_candidates[:candidate_limit]) + explicit_hit_candidates:
        tag = str(item.get("tag") or "")
        if tag and tag not in seen_candidate_tags:
            candidates.append(item)
            seen_candidate_tags.add(tag)

    character_candidates = [item for item in candidates if item.get("category") == "character"]
    resolved = []
    state = "none"
    if character_candidates:
        explicit_character_terms = _canvas_explicit_character_lookup_terms(index, source, terms, direct_tags=direct_tags)
        explicit_resolved = []
        seen_explicit_tags = set()
        for term in explicit_character_terms:
            selected = _canvas_select_character_for_lookup_term(character_candidates, term)
            tag = str((selected or {}).get("tag") or "")
            if selected and tag and tag not in seen_explicit_tags:
                explicit_resolved.append(selected)
                seen_explicit_tags.add(tag)
        direct_character_candidates = [
            item for item in character_candidates
            if str(item.get("tag") or "").strip().lower() in direct_tags
        ]
        if direct_character_candidates:
            direct_tags_seen = {str(item.get("tag") or "").strip().lower() for item in direct_character_candidates}
            seen_explicit_tags = {
                str(item.get("tag") or "").strip()
                for item in explicit_resolved
                if str(item.get("tag") or "").strip()
            }
            if "saber_alter" in direct_tags_seen:
                explicit_resolved = [
                    item for item in explicit_resolved
                    if str(item.get("tag") or "").strip().lower() != "saber_(fate)"
                ]
                seen_explicit_tags.discard("saber_(fate)")
            for item in reversed(direct_character_candidates):
                tag = str(item.get("tag") or "").strip()
                if tag and tag not in seen_explicit_tags:
                    explicit_resolved.insert(0, item)
                    seen_explicit_tags.add(tag)
        if len(explicit_resolved) > 1:
            resolved.extend(explicit_resolved[:6])
            state = "resolved"
        elif len(direct_character_candidates) > 1:
            resolved.extend(direct_character_candidates[:6])
            state = "resolved"
        else:
            first = explicit_resolved[0] if explicit_resolved else character_candidates[0]
            if explicit_resolved and copyright_terms and not _canvas_character_row_mentions_copyright(first, copyright_terms):
                contextual = next(
                    (item for item in character_candidates if _canvas_character_row_mentions_copyright(item, copyright_terms)),
                    None,
                )
                if contextual and float(contextual.get("score") or 0) >= float(first.get("score") or 0):
                    first = contextual
            first_tag = str(first.get("tag") or "")
            second = next((item for item in character_candidates if str(item.get("tag") or "") != first_tag), None)
            first_score = float(first.get("score") or 0)
            second_score = float(second.get("score") or 0) if second else 0
            first_count = max(_canvas_safe_int(first.get("count")), 0)
            second_count = max(_canvas_safe_int(second.get("count")), 0) if second else 0
            count_preferred = bool(second and first_score >= 145 and first_count >= max(1000, second_count * 5))
            base_variant_preferred = bool(
                explicit_resolved
                and second
                and _canvas_character_row_variant_depth(first) < _canvas_character_row_variant_depth(second)
                and first_count >= max(1000, second_count * 2)
            )
            if first_score >= 145 and (not second or first_score - second_score >= 22 or first_score >= 230 or count_preferred or base_variant_preferred):
                resolved.append(first)
                state = "resolved"
            else:
                state = "ambiguous"
    elif copyright_hits:
        state = "copyright_only"

    if state in {"none", "copyright_only"} and _canvas_character_entity_terms(source):
        if not candidates:
            state = "unresolved"
    if resolved:
        copyright_hits = _canvas_filter_copyright_hits_for_resolved(copyright_hits, resolved)
        if not copyright_hits:
            copyright_hits = _canvas_derive_copyright_hits_from_resolved(resolved, index)

    return {
        "state": state,
        "resolved": resolved[:3],
        "candidates": candidates,
        "copyright_candidates": copyright_hits,
        "unresolved_terms": [] if candidates else _canvas_character_entity_terms(source),
        "source": "local_danbooru_all_gallery_and_character_glossary",
    }


def _canvas_requested_character_resolution(user_prompt, prompt=""):
    source = str(user_prompt or "").strip()
    fallback_prompt = str(prompt or "").strip()
    lookup_source = source or fallback_prompt
    empty_resolution = {
        "state": "none",
        "resolved": [],
        "candidates": [],
        "copyright_candidates": [],
        "unresolved_terms": [],
        "source": "character_lookup_skipped_no_entity_terms",
    }
    if lookup_source and not _canvas_character_entity_terms(lookup_source) and not _canvas_danbooru_direct_hint_tags(lookup_source):
        return dict(empty_resolution)
    fast_resolution = _canvas_fast_resolve_danbooru_characters(source or fallback_prompt, limit=12)
    if isinstance(fast_resolution, dict) and fast_resolution.get("state") in {"resolved", "copyright_only"}:
        return fast_resolution
    resolution = _canvas_resolve_danbooru_characters(source or fallback_prompt, limit=12)
    if resolution.get("state") == "resolved":
        return resolution
    if source and fallback_prompt:
        source_identity_terms = _canvas_character_entity_terms(source)
        try:
            index = _canvas_load_danbooru_character_index()
            identity_tags = set(index.get("character_tags") or set()).union(set(index.get("copyright_tags") or set()))
        except Exception:
            identity_tags = set()
        source_direct_identity = [
            tag for tag in _canvas_danbooru_direct_hint_tags(source)
            if tag in identity_tags
        ]
        source_is_context_continuation = bool(re.search(
            r"(?:\u518d\u6765|\u7ee7\u7eed|\u7e7c\u7e8c|\u540c\u6837|\u4e0a\u4e00\u5f20|\u4e0a\u4e00\u5f35|\u6362\u4e00\u5f20|\u63db\u4e00\u5f35|\bretry\b|\bagain\b|\banother\b|\bsame\b|\bcontinue\b)",
            source,
            re.I,
        ))
        source_has_lookup_candidates = (
            resolution.get("state") in {"ambiguous", "copyright_only"}
            and bool(resolution.get("candidates") or resolution.get("copyright_candidates"))
        )
        if not (source_has_lookup_candidates or source_direct_identity or source_is_context_continuation):
            return resolution
        identity_tags = _canvas_known_identity_prompt_tags(fallback_prompt)
        fallback_hint = ", ".join(identity_tags) if identity_tags else fallback_prompt
        fallback = _canvas_resolve_danbooru_characters(f"{source}\n{fallback_hint}", limit=12)
        if fallback.get("state") == "resolved":
            return fallback
    return resolution


def _canvas_merge_character_candidates_into_matches(matches, character_resolution, limit=28):
    output = []
    seen = set()
    for item in (matches or []):
        if not isinstance(item, dict):
            continue
        tag = str(item.get("tag") or "")
        if not tag or tag in seen:
            continue
        seen.add(tag)
        output.append(item)
    for bucket in ("resolved", "candidates", "copyright_candidates"):
        for item in (character_resolution or {}).get(bucket) or []:
            if not isinstance(item, dict):
                continue
            tag = str(item.get("tag") or "")
            if not tag or tag in seen:
                continue
            seen.add(tag)
            output.append(item)
    return output[: max(1, min(int(limit or 28), 80))]


def _canvas_clean_prompt_tag_name(tag):
    return canvas_danbooru_policy.clean_prompt_tag_name(tag)


_CANVAS_PROMPT_WEIGHT_RE = re.compile(
    r"^\((?P<tag>[^():][^()]*?):(?P<weight>[+-]?(?:\d+(?:\.\d*)?|\.\d+))\)$"
)


def _canvas_prompt_display_danbooru_tag(tag, *, escape_parentheses=True, preserve_wrapping_parentheses=None):
    raw = str(tag or "").strip()
    unescaped = raw.replace("\\(", "(").replace("\\)", ")")
    if preserve_wrapping_parentheses is None:
        preserve_wrapping_parentheses = bool(re.fullmatch(r"\([^:()]+\)", unescaped))

    clean = _canvas_clean_prompt_tag_name(raw)
    if not clean:
        return ""
    display = clean.replace("_", " ")
    if preserve_wrapping_parentheses and not (display.startswith("(") and display.endswith(")")):
        display = f"({display})"
    if escape_parentheses:
        display = display.replace("(", r"\(").replace(")", r"\)")
    return display


def _canvas_prompt_safe_danbooru_tag(tag):
    return _canvas_prompt_display_danbooru_tag(tag)


def _canvas_prompt_safe_danbooru_text(text):
    source = str(text or "")
    if not source:
        return source
    parts = re.split(r"([,;\n]+)", source)
    changed = False
    output = []
    for part in parts:
        if not part or re.fullmatch(r"[,;\n]+", part):
            output.append(part)
            continue
        stripped = part.strip()
        if not stripped:
            output.append(part)
            continue
        if "_" not in stripped and "(" not in stripped and ")" not in stripped:
            output.append(part)
            continue

        weight_match = _CANVAS_PROMPT_WEIGHT_RE.match(stripped.replace("\\(", "(").replace("\\)", ")"))
        if weight_match:
            safe_tag = _canvas_prompt_display_danbooru_tag(
                weight_match.group("tag"),
                escape_parentheses=False,
                preserve_wrapping_parentheses=False,
            )
            safe = f"({safe_tag}:{weight_match.group('weight')})" if safe_tag else ""
        else:
            safe = _canvas_prompt_safe_danbooru_tag(stripped)

        if not safe or safe == stripped:
            output.append(part)
            continue
        prefix = part[:len(part) - len(part.lstrip())]
        suffix = part[len(part.rstrip()):]
        output.append(prefix + safe + suffix)
        changed = True
    return "".join(output) if changed else source


def _canvas_unknown_character_like_prompt_tags(prompt):
    suspicious = []
    for raw in str(prompt or "").split(","):
        tag = _canvas_clean_prompt_tag_name(raw)
        if not tag:
            continue
        if re.search(r"_\([^)]+\)$", tag) or re.search(r"\([^)]+\)", tag):
            suspicious.append(tag)
        elif tag.count("_") >= 4 and not re.search(r"^(masterpiece|best_quality|very_aesthetic|amazing_quality|looking_at_viewer|depth_of_field)$", tag):
            suspicious.append(tag)
    if not suspicious:
        return []
    index = _canvas_load_danbooru_character_index()
    known = set(index.get("character_tags") or set()).union(set(index.get("copyright_tags") or set()))
    unknown = []
    for tag in suspicious:
        if not tag or tag in known:
            continue
        if tag in _CANVAS_DANBOORU_LOW_SIGNAL_TAGS:
            continue
        if _canvas_is_forbidden_positive_tag(tag):
            continue
        if re.search(r"_\([^)]+\)$", tag) or re.search(r"\([^)]+\)", tag):
            if tag not in unknown:
                unknown.append(tag)
        elif (tag.count("_") >= 4 and not re.search(r"^(masterpiece|best_quality|very_aesthetic|amazing_quality|looking_at_viewer|depth_of_field)$", tag)):
            if tag not in unknown:
                unknown.append(tag)
    return unknown[:12]


def _canvas_known_identity_prompt_tags(prompt):
    index = _canvas_load_danbooru_character_index()
    known = set(index.get("character_tags") or set()).union(set(index.get("copyright_tags") or set()))
    output = []
    for raw in str(prompt or "").split(","):
        tag = _canvas_clean_prompt_tag_name(raw)
        if tag and tag in known and tag not in output:
            output.append(tag)
    return output[:12]


def _canvas_read_character_glossary_dicts():
    path = _canvas_character_glossary_path()
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            return [dict(row) for row in reader if isinstance(row, dict)]
    except Exception as exc:
        logger.warning("Failed to read character glossary %s: %s", path, exc)
        return []


def _canvas_write_character_glossary_dicts(rows):
    path = _canvas_character_glossary_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=_CANVAS_CHARACTER_GLOSSARY_HEADER)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: str((row or {}).get(key) or "") for key in _CANVAS_CHARACTER_GLOSSARY_HEADER})
    _canvas_danbooru_character_index_cache.pop("local", None)


def _canvas_upsert_character_glossary_entry(entry):
    data = entry if isinstance(entry, dict) else {}
    source_term = str(data.get("source_term") or data.get("term") or data.get("query") or "").strip()
    character_tag = re.sub(r"\s+", "_", str(data.get("character_tag") or data.get("tag") or "").strip().lower())
    copyright_tag = re.sub(r"\s+", "_", str(data.get("copyright_tag") or data.get("copyright") or "").strip().lower())
    aliases = str(data.get("aliases") or "").strip()
    translation = str(data.get("translation") or "").strip()
    status = str(data.get("status") or "confirmed").strip().lower() or "confirmed"
    source = str(data.get("source") or "user").strip()
    notes = str(data.get("notes") or "").strip()
    if not source_term and not character_tag:
        raise ValueError("source_term or character_tag is required")
    rows = _canvas_read_character_glossary_dicts()
    match_index = -1
    for index, row in enumerate(rows):
        row_term = str(row.get("source_term") or "").strip()
        row_tag = re.sub(r"\s+", "_", str(row.get("character_tag") or "").strip().lower())
        if (character_tag and row_tag == character_tag) or (source_term and row_term == source_term):
            match_index = index
            break
    next_row = {
        "source_term": source_term,
        "character_tag": character_tag,
        "copyright_tag": copyright_tag,
        "aliases": aliases,
        "translation": translation,
        "status": status,
        "source": source,
        "notes": notes,
    }
    if match_index >= 0:
        current = rows[match_index]
        merged = dict(current)
        for key, value in next_row.items():
            if key == "translation" and str(current.get(key) or "").strip():
                continue
            if key == "aliases" and str(current.get(key) or "").strip() and value:
                existing = _canvas_split_character_field(current.get(key))
                for alias in _canvas_split_character_field(value):
                    if alias not in existing:
                        existing.append(alias)
                merged[key] = ",".join(existing)
                continue
            if value and not str(current.get(key) or "").strip():
                merged[key] = value
        rows[match_index] = merged
    else:
        rows.append(next_row)
    _canvas_write_character_glossary_dicts(rows)
    return rows[match_index if match_index >= 0 else len(rows) - 1]


_CANVAS_DANBOORU_LOW_SIGNAL_TAGS = {
    "black",
    "green",
    "white",
    "blue",
    "red",
    "pink",
    "yellow",
    "purple",
    "brown",
    "gray",
    "grey",
    "silver",
    "_hair",
    "eye",
    "eyes",
    "hair",
    "fur",
    "patch",
    "cat",
    "facial",
    "face",
    "lighting",
    "illustration",
    "day",
    "holding",
    "style",
    "feature",
    "features",
    "detail",
    "detailed",
    "quality",
    "high",
    "soft",
    "base",
    "root",
    "roots",
    "outfit",
    "wearing",
    "cute",
    "anime",
    "character",
    "bad_tag",
    "tagme",
    "commentary",
    "commentary_request",
    "missing_commentary",
    "check_commentary",
    "delete_request",
    "model_request",
    "watermark",
    "sample_watermark",
    "weibo_watermark",
    "miyoushe_watermark",
    "commission_watermark",
    "too_many_watermarks",
    "character_watermark",
    "artist_name",
    "signature",
    "logo",
    "text",
    "double_fox_shadow_puppet",
}


_CANVAS_DANBOORU_FORBIDDEN_POSITIVE_TAGS = canvas_danbooru_policy.FORBIDDEN_POSITIVE_TAGS


def _canvas_is_forbidden_positive_tag(tag):
    return canvas_danbooru_policy.is_forbidden_positive_tag(tag)


def _canvas_danbooru_score_row(row, query, terms):
    query_lower = str(query or "").lower()
    compact_query = re.sub(r"\s+", "_", query_lower)
    tag = str(row.get("tag") or "").lower()
    if tag in _CANVAS_DANBOORU_LOW_SIGNAL_TAGS:
        return 0.0
    if _canvas_is_forbidden_positive_tag(tag):
        return 0.0
    if "shadow_puppet" in tag and not re.search(r"shadow[-_\s]?puppet|手影|影子戏|皮影", str(query or ""), re.I):
        return 0.0
    tag_spaces = tag.replace("_", " ")
    translation = str(row.get("translation") or "").lower()
    aliases = _canvas_danbooru_aliases(row.get("aliases"))
    score = 0.0

    if tag and tag in terms:
        score += 120
    elif tag and len(tag) >= 4 and (re.search(rf"(?<![a-z0-9_]){re.escape(tag)}(?![a-z0-9_])", compact_query) or re.search(rf"(?<![a-z0-9]){re.escape(tag_spaces)}(?![a-z0-9])", query_lower)):
        score += 120
    alias_hit = False
    for alias in aliases:
        if not alias:
            continue
        alias_spaces = alias.replace("_", " ")
        if alias in terms:
            alias_hit = True
            break
        if len(alias) >= 4 and (re.search(rf"(?<![a-z0-9_]){re.escape(alias)}(?![a-z0-9_])", compact_query) or re.search(rf"(?<![a-z0-9]){re.escape(alias_spaces)}(?![a-z0-9])", query_lower)):
            alias_hit = True
            break
    if alias_hit:
        score += 95
    if translation:
        if translation in query_lower:
            score += 90
        for term in terms:
            if term and len(term) >= 3 and term in translation:
                score += 45
                break
    tag_parts = [part for part in tag.split("_") if len(part) >= 3]
    if any(part in terms for part in tag_parts):
        score += 20
    if str(row.get("source") or "") == "weilin_tagcart.csv":
        score += 12
    elif str(row.get("source") or "") == "custom_tags.csv":
        score += 20
    score += min(max(int(row.get("count") or 0), 0), 1_000_000) / 1_000_000
    return score


def _canvas_lookup_danbooru_tags(query, limit=24, source_mode="curated"):
    raw_query = str(query or "").strip()
    if not raw_query:
        return []
    mode = _canvas_danbooru_tag_source_mode(source_mode)
    max_limit = max(1, min(int(limit or 24), 80))
    fast_matches = _canvas_lookup_danbooru_tags_fast(raw_query, limit=max_limit, source_mode=mode)
    local_source_mode = mode
    if fast_matches is not None and mode == "all" and _canvas_danbooru_fast_skip_full_csv_enabled():
        local_source_mode = "curated"
    query_has_cjk = bool(re.search(r"[\u3400-\u9fff]", raw_query))
    enough_fast_matches = bool(fast_matches is not None and len(fast_matches) >= min(max_limit, 3))
    skip_local_csv = bool(
        fast_matches is not None
        and (
            (enough_fast_matches and not query_has_cjk)
            or (query_has_cjk and _canvas_danbooru_fast_skip_cjk_local_csv_enabled())
        )
        and _canvas_danbooru_fast_skip_local_csv_enabled()
    )
    best = {}
    if not skip_local_csv:
        terms = _canvas_danbooru_query_terms(raw_query)
        for row in _canvas_load_danbooru_tag_rows(source_mode=local_source_mode):
            tag = str(row.get("tag") or "").strip()
            if not tag:
                continue
            if tag.lower() in _CANVAS_DANBOORU_LOW_SIGNAL_TAGS:
                continue
            if len(tag) < 3 and tag not in {"1girl", "1boy"}:
                continue
            score = _canvas_danbooru_score_row(row, raw_query, terms)
            if score < 45:
                continue
            current = best.get(tag)
            if not current or score > current.get("score", 0):
                item = dict(row)
                item["score"] = round(score, 3)
                best[tag] = item
    local_matches = sorted(best.values(), key=lambda item: (-float(item.get("score") or 0), -int(item.get("count") or 0), str(item.get("tag") or "")))[:max_limit]
    gallery_matches = _canvas_gallery_query_rows(raw_query, limit=max_limit, categories=None)
    return _canvas_merge_tag_rows(local_matches, fast_matches or [], gallery_matches, limit=max_limit)


def _canvas_danbooru_autocomplete_translation_terms(value):
    terms = []
    for item in re.split(r"[|;/]", str(value or "")):
        clean = item.strip()
        if clean:
            terms.append(clean)
    return terms


def _canvas_danbooru_autocomplete_norm(value):
    return re.sub(r"\s+", "", str(value or "").strip().lower()).replace("（", "(").replace("）", ")")


def _canvas_danbooru_autocomplete_match_score(query, row):
    raw_query = str(query or "").strip()
    if not raw_query:
        return 0.0, "", ""
    query_lower = raw_query.lower()
    query_tag = re.sub(r"\s+", "_", query_lower)
    query_spaces = re.sub(r"[_\s]+", " ", query_lower).strip()
    query_norm = _canvas_danbooru_autocomplete_norm(raw_query)
    query_has_cjk = bool(re.search(r"[\u3400-\u9fff]", raw_query))
    allow_contains = len(query_norm) >= (1 if query_has_cjk else 2)

    tag = str(row.get("tag") or "").strip().lower()
    tag_spaces = tag.replace("_", " ")
    score = 0.0
    match = ""
    match_value = ""

    def apply(candidate_score, candidate_match, candidate_value=""):
        nonlocal score, match, match_value
        if candidate_score > score:
            score = float(candidate_score)
            match = candidate_match
            match_value = str(candidate_value or "").strip()

    if tag:
        if tag == query_tag or tag_spaces == query_spaces:
            apply(360, "tag_exact", tag)
        elif tag.startswith(query_tag) or tag_spaces.startswith(query_spaces):
            apply(310, "tag_prefix", tag)
        elif allow_contains and (query_tag in tag or query_spaces in tag_spaces):
            apply(190, "tag_contains", tag)

    for alias in _canvas_danbooru_aliases(row.get("aliases")):
        alias = str(alias or "").strip().lower()
        if not alias:
            continue
        alias_spaces = alias.replace("_", " ")
        if alias == query_tag or alias_spaces == query_spaces:
            apply(300, "alias_exact", alias)
        elif alias.startswith(query_tag) or alias_spaces.startswith(query_spaces):
            apply(250, "alias_prefix", alias)
        elif allow_contains and (query_tag in alias or query_spaces in alias_spaces):
            apply(165, "alias_contains", alias)

    for term in _canvas_danbooru_autocomplete_translation_terms(row.get("translation")):
        term_norm = _canvas_danbooru_autocomplete_norm(term)
        if not term_norm:
            continue
        if term_norm == query_norm:
            apply(330, "translation_exact", term)
        elif term_norm.startswith(query_norm):
            apply(285, "translation_prefix", term)
        elif allow_contains and query_norm in term_norm:
            apply(170, "translation_contains", term)

    if allow_contains:
        for key in ("group", "top_group", "sub_group", "path_group"):
            value_norm = _canvas_danbooru_autocomplete_norm(row.get(key))
            if value_norm and query_norm in value_norm:
                apply(70, f"{key}_contains", row.get(key))

    if score <= 0:
        return 0.0, "", ""
    source = str(row.get("source") or "")
    if source == "custom_tags.csv":
        score += 12
    score += min(max(_canvas_safe_int(row.get("count")), 0), 1_000_000) / 1_000_000
    return score, match, match_value


def _canvas_danbooru_join_pipe_values(*values):
    result = []
    seen = set()
    for value in values:
        for item in _canvas_danbooru_autocomplete_translation_terms(value):
            key = _canvas_danbooru_autocomplete_norm(item)
            if key and key not in seen:
                result.append(item)
                seen.add(key)
    return "|".join(result)


def _canvas_danbooru_autocomplete_prefix_keys(value):
    text = str(value or "").strip().lower()
    if not text:
        return []
    variants = {text, text.replace("_", " ")}
    keys = set()
    for item in variants:
        clean = re.sub(r"\s+", " ", item).strip()
        if not clean:
            continue
        for size in range(1, min(3, len(clean)) + 1):
            keys.add(clean[:size])
    return list(keys)


def _canvas_danbooru_autocomplete_item_texts(query, tag, translation, match, match_value):
    raw_query = str(query or "").strip()
    clean_tag = str(tag or "").strip()
    clean_translation = str(translation or "").strip()
    clean_match = str(match_value or "").strip()
    query_has_cjk = bool(re.search(r"[\u3400-\u9fff]", raw_query))
    match_kind = str(match or "").strip()

    if query_has_cjk and match_kind.startswith("translation_"):
        insert_text = clean_match
        if not insert_text:
            query_norm = _canvas_danbooru_autocomplete_norm(raw_query)
            for term in _canvas_danbooru_autocomplete_translation_terms(clean_translation):
                term_norm = _canvas_danbooru_autocomplete_norm(term)
                if term_norm and (term_norm.startswith(query_norm) or query_norm in term_norm):
                    insert_text = term
                    break
        if insert_text:
            return {
                "display_text": insert_text,
                "insert_text": insert_text,
                "secondary_text": clean_tag if clean_tag != insert_text else "",
                "append_separator": False,
                "completion_kind": "translation",
            }

    return {
        "display_text": clean_tag,
        "insert_text": clean_tag,
        "secondary_text": clean_translation,
        "append_separator": True,
        "completion_kind": "tag",
    }


def _canvas_danbooru_autocomplete_index(source_mode="all"):
    mode = _canvas_danbooru_tag_source_mode(source_mode)
    paths = _canvas_danbooru_tag_paths(mode)
    signature = _canvas_danbooru_cache_signature(paths)
    cached = _canvas_danbooru_autocomplete_cache.get(mode) if isinstance(_canvas_danbooru_autocomplete_cache, dict) else None
    if isinstance(cached, dict) and cached.get("signature") == signature:
        return cached

    with _canvas_danbooru_autocomplete_lock:
        cached = _canvas_danbooru_autocomplete_cache.get(mode) if isinstance(_canvas_danbooru_autocomplete_cache, dict) else None
        if isinstance(cached, dict) and cached.get("signature") == signature:
            return cached

        all_rows = _canvas_load_danbooru_tag_rows(source_mode=mode)
        canonical_rows = {
            str(row.get("tag") or "").strip(): row
            for row in all_rows
            if str(row.get("source") or "") == "danbooru_all.csv" and str(row.get("tag") or "").strip()
        }
        rows = [
            row for row in all_rows
            if mode != "all" or str(row.get("source") or "") in {"danbooru_all.csv", "custom_tags.csv"}
        ]
        entries = []
        prefix_index = defaultdict(list)
        cjk_index = defaultdict(list)
        for row in rows:
            tag = str(row.get("tag") or "").strip()
            if not tag:
                continue
            canonical = canonical_rows.get(tag) or row
            aliases = []
            for alias in _canvas_danbooru_aliases(canonical.get("aliases")) + _canvas_danbooru_aliases(row.get("aliases")):
                if alias not in aliases:
                    aliases.append(alias)
            translation = _canvas_danbooru_join_pipe_values(canonical.get("translation"), row.get("translation"))
            group = str(canonical.get("top_group") or canonical.get("group") or row.get("top_group") or row.get("group") or "").strip()
            sub_group = str(canonical.get("sub_group") or row.get("sub_group") or "").strip()
            entry = {
                "row": row,
                "canonical": canonical,
                "tag": tag,
                "aliases": aliases,
                "translation": translation,
                "group": group,
                "sub_group": sub_group,
            }
            index = len(entries)
            entries.append(entry)
            for value in [tag] + aliases:
                for key in _canvas_danbooru_autocomplete_prefix_keys(value):
                    prefix_index[key].append(index)
            cjk_source = "|".join([translation, group, sub_group, str(row.get("path_group") or "")])
            for char in set(re.findall(r"[\u3400-\u9fff]", cjk_source)):
                cjk_index[char].append(index)

        result = {
            "signature": signature,
            "entries": entries,
            "prefix_index": dict(prefix_index),
            "cjk_index": dict(cjk_index),
            "canonical_rows": canonical_rows,
        }
        _canvas_danbooru_autocomplete_cache[mode] = result
        return result


def _canvas_autocomplete_danbooru_tags(query, limit=32, source_mode="all"):
    raw_query = str(query or "").strip()
    if not raw_query:
        return []
    max_limit = max(1, min(int(limit or 32), 80))
    mode = _canvas_danbooru_tag_source_mode(source_mode)
    index = _canvas_danbooru_autocomplete_index(mode)
    entries = index.get("entries") or []
    prefix_index = index.get("prefix_index") or {}
    cjk_index = index.get("cjk_index") or {}
    raw_lower = raw_query.lower()
    query_tag = re.sub(r"\s+", "_", raw_lower)
    query_spaces = re.sub(r"[_\s]+", " ", raw_lower).strip()
    query_has_cjk = bool(re.search(r"[\u3400-\u9fff]", raw_query))
    candidate_indices = []
    if query_has_cjk:
        chars = re.findall(r"[\u3400-\u9fff]", raw_query)
        if chars:
            buckets = [cjk_index.get(char, []) for char in chars[:2]]
            if len(buckets) > 1 and all(buckets):
                other = set(buckets[1])
                candidate_indices = [idx for idx in buckets[0] if idx in other]
            elif len(buckets) == 1 and buckets[0]:
                candidate_indices = list(buckets[0] if buckets else [])
    else:
        keys = set()
        for value in (query_tag, query_spaces):
            clean = str(value or "").strip()
            if clean:
                keys.add(clean[:min(3, len(clean))])
        for key in keys:
            candidate_indices.extend(prefix_index.get(key, []))
    if not candidate_indices:
        if query_has_cjk:
            return []
        candidate_indices = range(len(entries))

    best = {}
    seen_indices = set()
    for entry_index in candidate_indices:
        if entry_index in seen_indices:
            continue
        seen_indices.add(entry_index)
        if not isinstance(entry_index, int) or entry_index < 0 or entry_index >= len(entries):
            continue
        entry = entries[entry_index]
        row = entry.get("row") or {}
        tag = str(entry.get("tag") or row.get("tag") or "").strip()
        if not tag:
            continue
        score, match, match_value = _canvas_danbooru_autocomplete_match_score(raw_query, row)
        if score <= 0:
            continue
        canonical = entry.get("canonical") or row
        aliases = entry.get("aliases") or []
        translation = entry.get("translation") or ""
        group = entry.get("group") or ""
        sub_group = entry.get("sub_group") or ""
        item_texts = _canvas_danbooru_autocomplete_item_texts(raw_query, tag, translation, match, match_value)
        if _canvas_danbooru_autocomplete_norm(item_texts.get("insert_text")) == _canvas_danbooru_autocomplete_norm(raw_query):
            continue
        item = {
            "tag": tag,
            "value": tag,
            **item_texts,
            "translation": translation,
            "category": str(canonical.get("category") or row.get("category") or "").strip(),
            "count": _canvas_safe_int(canonical.get("count") if canonical else row.get("count")),
            "aliases": aliases[:8],
            "group": group,
            "sub_group": sub_group,
            "source": str(row.get("source") or "").strip(),
            "canonical_source": str(canonical.get("source") or "").strip(),
            "score": round(score, 3),
            "match": match,
        }
        current = best.get(tag)
        if (
            not current
            or score > float(current.get("score") or 0)
            or (
                score == float(current.get("score") or 0)
                and item["count"] > _canvas_safe_int(current.get("count"))
            )
        ):
            best[tag] = item
    return sorted(
        best.values(),
        key=lambda item: (-float(item.get("score") or 0), -_canvas_safe_int(item.get("count")), str(item.get("tag") or "")),
    )[:max_limit]


def _canvas_danbooru_model_notes(model_hint="", preset_defaults=None, source_mode="curated"):
    hint = str(model_hint or "").lower()
    mode = _canvas_danbooru_tag_source_mode(source_mode)
    defaults = preset_defaults if isinstance(preset_defaults, dict) else {}
    styles = defaults.get("styles") if isinstance(defaults.get("styles"), list) else []
    negative = str(defaults.get("negative_prompt") or "").strip()
    notes = [
        "Use local curated canonical tags from tags/weilin_tagcart.csv plus user custom tags.",
        "Named characters and copyrights are resolved locally from tags/character_glossary.csv, tags/danbooru_all.csv, and the read-only ComfyUI-Danbooru-Gallery tags_cache.db seed; do not rely on model memory for character names.",
        "Character/copyright tags must come from lookup or the user glossary. If a named character is uncertain, ask for confirmation or use generic visual tags instead of inventing a tag.",
        "Never use literal placeholder tags such as character, female, male, person, or no_humans for a visible named character. Use 1girl/1boy/solo plus the resolved character tag instead.",
        "Do not put halo in the positive prompt unless the user explicitly asks for a halo; many anime checkpoints over-associate it with Blue Archive-style character features.",
        "Weight syntax is allowed sparingly: (tag) is stronger, ((tag)) is stronger again, and (tag:1.2) sets an explicit multiplier.",
        "If a canonical tag contains literal parentheses, escape them in A1111/Fooocus-style prompts, e.g. character_\\(series\\).",
        "Do not invent pseudo-tags by replacing spaces in prose with underscores. If no canonical tag is known, use a shorter parent tag or omit the phrase.",
        "Prefer compact canonical atoms over made-up prose phrases, but choose atoms from the current user request and lookup results only; examples in guidance are not default visual content.",
    ]
    if mode == "all":
        notes.insert(1, "Full Danbooru tag database is enabled for this lookup; prefer curated/weilin tags when both sources match.")
    else:
        notes.insert(1, "The full tags/danbooru_all.csv database is intentionally excluded from Agent lookup to avoid noisy low-value candidates.")
    if _canvas_danbooru_fast_backend_available():
        notes.insert(2, "Fast local Rust/SQLite Danbooru lookup is enabled; use returned candidates as local indexed evidence, while preserving the existing character/glossary and safety rules.")
    else:
        status = _canvas_danbooru_fast_runtime_status()
        if status.get("message"):
            notes.insert(2, "Fast local Rust Danbooru lookup notice: " + status.get("message"))
    notes.append("Offline-first policy: do not fetch Hugging Face or other network sources during prompt preparation; only local CSV/cache data is trusted.")
    if "illustrious" in hint or any(str(style).lower() == "illustrious" for style in styles):
        notes.append("Illustrious: prefer focused comma-separated Danbooru tags; useful local style suffix includes masterpiece, best quality, absurdres, newest, very aesthetic, amazing quality, highres.")
    if "noob" in hint or "newbie" in hint or "nai-xl" in hint:
        notes.append("NoobAI/NAI-XL: common positive prefix is masterpiece, best quality, newest, absurdres, highres; some v-pred derivatives prefer short prompts and light or empty negatives, so prefer the preset default negative when present.")
    if negative:
        notes.append(f"Preset default negative prompt: {negative[:700]}")
    return notes


def _canvas_danbooru_agent_contract():
    return "\n".join([
        "SDXL/Danbooru action prompt contract:",
        "- Treat the JSON prompt field as a tag list generator, not a caption writer.",
        "- The JSON action shape must be flat: {\"action\":\"generate_image\",\"prompt\":\"...\"}. Never nest the action name as an object such as {\"action\":{\"generate_image\":{...}}}.",
        "- Output exactly one comma-separated tag list in the JSON prompt field. No markdown, no prose, no numbered sections, no explanation inside prompt.",
        "- Build the tag list in this order: subject count, resolved identity tag, body/camera/composition, pose/action/expression, outfit/accessories, setting/background, lighting/rendering, quality/model tags. The word character is an instruction label, not a prompt tag.",
        "- Persona tags are subject-scoped, not a global style prefix. Use the assistant/system-prompt persona only when the user's current request explicitly asks to draw you, your selfie, your appearance/avatar, or an image where you are a participant.",
        "- For explicit persona/selfie requests, convert stable visual identity into tags before scene details: hair color/style, eye color, ears/tail, outfit, expression, camera angle.",
        "- Requests like 'show me your look' or '给我看看你的样子' are persona portrait requests when the system prompt defines a visual character; preserve only the persona traits that are explicitly part of that visible subject, using compact canonical tags.",
        "- For named characters, third-party characters, objects, and pure scenery, do not mix in assistant persona traits. Example: 原神甘雨 should be ganyu_(genshin_impact), genshin_impact and character-appropriate traits, not assistant appearance tags unless the user asked for a crossover.",
        "- For named characters and copyrights, use only tags returned by local Danbooru lookup or the user character glossary. Do not guess character tags from memory, translations, or romanization.",
        "- For named character requests, never add no_humans, character, female, male, or assistant persona traits unless the user explicitly asks for that crossover.",
        "- Avoid halo in positive prompts unless the user explicitly asks for it; it often causes unwanted Blue Archive-like halos.",
        "- If lookup reports multiple character candidates or no canonical character tag, do not fabricate a long tag; ask for confirmation or fall back to generic visual traits.",
        "- For pure scenery/background/wallpaper requests, do not inject a generic person. Use scenery, landscape, no_humans, outdoors, wide_shot, and specific environment tags unless the user asked for a character.",
        "- If the action also includes draft_prompt, it must follow the same structured tag-list contract as prompt: comma-separated English tags only, no prose sentence, no markdown, no ratio/parameter text.",
        "- Use multiple short canonical tags instead of one descriptive tag. Example: first-person view holding hands on a city street -> pov, holding_hands, city, street, looking_at_viewer.",
        "- Never create long underscore phrases from prose. Split the request into compact canonical atoms for subject count, identity, action, setting, props, and lighting.",
        "- Never use bare color/property fragments as tags. Use complete visual attributes only when the current request or local lookup context provides them.",
        "- If a proper copyright/character tag is uncertain, do not guess a fake tag; use generic visual tags instead.",
        "- Keep generation controls outside prompt: aspect_ratio, width, height, image_number, seed, steps, cfg_scale, and resolution_scale are JSON fields, not tags.",
        "- Internal self-check before final answer: comma-separated English tags only, no Chinese in prompt, no prose, no fake markdown image links, one generate_image action for a batch, visible chat stays brief.",
    ])


def _canvas_danbooru_lookup_text(query, model_hint="", preset_defaults=None, limit=24, source_mode="curated"):
    mode = _canvas_danbooru_tag_source_mode(source_mode)
    character_resolution = _canvas_resolve_danbooru_characters(query, limit=12)
    matches = _canvas_lookup_danbooru_tags(query, limit=limit, source_mode=mode)
    matches = _canvas_merge_character_candidates_into_matches(matches, character_resolution, limit=limit)
    direct_hints = _canvas_danbooru_direct_hint_tags(query)
    prompt_hints = _canvas_danbooru_prompt_hint_tags(query)
    notes = _canvas_danbooru_model_notes(model_hint, preset_defaults, source_mode=mode)
    if not matches and not direct_hints and not prompt_hints and not notes:
        return ""
    lines = ["Danbooru tag lookup and SDXL guidance:", _canvas_danbooru_agent_contract()]
    if direct_hints:
        lines.append("Direct mapped identity tags from the current request: " + ", ".join(_canvas_prompt_safe_danbooru_tag(tag) for tag in direct_hints[:24]))
    if prompt_hints:
        lines.append("Direct mapped visual hint tags from the current request: " + ", ".join(_canvas_prompt_safe_danbooru_tag(tag) for tag in prompt_hints[:24]))
    if matches:
        formatted = []
        for item in matches[:limit]:
            prompt_tag = str(item.get("prompt_tag") or _canvas_prompt_safe_danbooru_tag(item.get("tag")) or item.get("tag") or "")
            details = []
            if prompt_tag and prompt_tag != str(item.get("tag") or ""):
                details.append("prompt-safe literal tag")
            if item.get("translation"):
                details.append(str(item.get("translation")))
            if item.get("category"):
                details.append(str(item.get("category")))
            formatted.append(f"{prompt_tag} ({'; '.join(details)})" if details else prompt_tag)
        lines.append("Candidate canonical tags: " + ", ".join(formatted))
    if character_resolution.get("state") not in {"none", ""}:
        resolved_tags = [str(item.get("tag") or "") for item in character_resolution.get("resolved") or [] if item.get("tag")]
        copyright_tags = [str(item.get("tag") or "") for item in character_resolution.get("copyright_candidates") or [] if item.get("tag")]
        candidate_tags = [str(item.get("tag") or "") for item in character_resolution.get("candidates") or [] if item.get("tag")]
        if resolved_tags:
            lines.append("Resolved local character tags: " + ", ".join(_canvas_prompt_safe_danbooru_tag(tag) for tag in resolved_tags[:8]))
            required_identity_tags = []
            for tag in resolved_tags[:4] + copyright_tags[:4]:
                if tag and tag not in required_identity_tags:
                    required_identity_tags.append(tag)
            if required_identity_tags:
                lines.append(
                    "MANDATORY named-character identity tags for this request: "
                    + ", ".join(_canvas_prompt_safe_danbooru_tag(tag) for tag in required_identity_tags)
                    + ". Include these exact canonical tags in the final prompt. Do not replace them with generic tags such as character, female, or person."
                )
                lines.append(
                    "For this named-character request, do not add assistant persona tags or no_humans unless the user explicitly requested a crossover or a person-free scene."
                )
        if copyright_tags:
            lines.append("Resolved local copyright tags: " + ", ".join(_canvas_prompt_safe_danbooru_tag(tag) for tag in copyright_tags[:8]))
        if character_resolution.get("state") == "ambiguous" and candidate_tags:
            lines.append("Ambiguous character candidates, choose one before finalizing: " + ", ".join(_canvas_prompt_safe_danbooru_tag(tag) for tag in candidate_tags[:8]))
        elif character_resolution.get("state") == "unresolved":
            lines.append("Unresolved possible character terms: " + ", ".join(character_resolution.get("unresolved_terms") or []))
    lines.extend(f"- {note}" for note in notes)
    lines.append("For SDXL/Danbooru targets, final prompt should be comma-separated tags. Do not put the negative prompt into the positive prompt; rely on preset defaults unless a separate negative field exists.")
    return "\n".join(lines)


def _canvas_gallery_db_stats():
    path = _canvas_gallery_db_path()
    result = {
        "ok": False,
        "exists": os.path.exists(path),
        "path": path,
        "readonly": True,
        "total": 0,
        "categories": {},
        "fts5_available": False,
        "translation_sources": {},
    }
    translation_map = _canvas_gallery_load_translation_map()
    result["translation_sources"]["merged_known_translations"] = len(translation_map)
    conn = None
    try:
        conn = _canvas_gallery_db_connect()
        if conn is None:
            result["error"] = "Gallery tags_cache.db not found."
            return result
        conn.row_factory = sqlite3.Row
        result["total"] = _canvas_safe_int(conn.execute("SELECT COUNT(*) FROM hot_tags").fetchone()[0])
        for row in conn.execute("SELECT category, COUNT(*) AS count FROM hot_tags GROUP BY category ORDER BY category").fetchall():
            result["categories"][_canvas_tag_category_to_label(row["category"])] = _canvas_safe_int(row["count"])
        fts_row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='hot_tags_fts'").fetchone()
        result["fts5_available"] = bool(fts_row)
        result["ok"] = True
        return result
    except Exception as exc:
        result["error"] = str(exc)
        return result
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def _canvas_local_tag_translation_map():
    priority_by_source = {
        "weilin_tagcart.csv": 1,
        "danbooru_all.csv": 2,
        "custom_tags.csv": 3,
    }
    known = {}
    for row in _canvas_load_danbooru_tag_rows(source_mode="all"):
        tag = str(row.get("tag") or "").strip()
        if not tag:
            continue
        source = str(row.get("source") or "")
        priority = priority_by_source.get(source, 0)
        current = known.get(tag)
        if current and int(current.get("_priority") or 0) > priority:
            continue
        known[tag] = {
            "tag": tag,
            "category": str(row.get("category") or ""),
            "translation": str(row.get("translation") or "").strip(),
            "source": source,
            "_priority": priority,
        }
    for row in _canvas_load_character_glossary_rows():
        tag = str(row.get("tag") or "").strip()
        if not tag:
            continue
        known[tag] = {
            "tag": tag,
            "category": "character",
            "translation": str(row.get("translation") or "").strip(),
            "source": "character_glossary.csv",
            "_priority": 4,
        }
    return known


def _canvas_gallery_import_preview(sample_queries=None, limit_conflicts=50):
    limit_conflicts = max(1, min(int(limit_conflicts or 50), 200))
    stats = _canvas_gallery_db_stats()
    local_by_tag = _canvas_local_tag_translation_map()
    gallery_rows = _canvas_gallery_load_seed_rows()
    new_tags = []
    fill_translations = []
    conflicts = []
    for row in gallery_rows:
        tag = str(row.get("tag") or "").strip()
        if not tag:
            continue
        gallery_translation = str(row.get("translation") or "").strip()
        current = local_by_tag.get(tag)
        if not current:
            if len(new_tags) < limit_conflicts:
                new_tags.append({
                    "tag": tag,
                    "category": row.get("category") or "",
                    "translation": gallery_translation,
                    "source": row.get("source") or "",
                })
            continue
        local_translation = str(current.get("translation") or "").strip()
        if gallery_translation and not local_translation:
            if len(fill_translations) < limit_conflicts:
                fill_translations.append({
                    "tag": tag,
                    "category": row.get("category") or current.get("category") or "",
                    "translation": gallery_translation,
                    "local_source": current.get("source") or "",
                })
        elif gallery_translation and local_translation and gallery_translation != local_translation:
            if len(conflicts) < limit_conflicts:
                conflicts.append({
                    "tag": tag,
                    "category": row.get("category") or current.get("category") or "",
                    "local_translation": local_translation,
                    "gallery_translation": gallery_translation,
                    "local_source": current.get("source") or "",
                })

    samples = []
    queries = sample_queries if isinstance(sample_queries, list) and sample_queries else ["甘雨", "初音未来", "saber fate"]
    for raw_query in queries[:12]:
        query = str(raw_query or "").strip()
        if not query:
            continue
        resolution = _canvas_resolve_danbooru_characters(query, limit=8)
        matches = _canvas_lookup_danbooru_tags(query, limit=8, source_mode="curated")
        samples.append({
            "query": query,
            "character_resolution": resolution,
            "matches": matches,
        })

    return {
        "ok": bool(stats.get("ok")),
        "mode": "preview_only",
        "will_modify_files": False,
        "policy": "Fill missing translations only; never overwrite local/manual translations automatically.",
        "stats": stats,
        "counts": {
            "gallery_rows_scanned": len(gallery_rows),
            "local_tags_known": len(local_by_tag),
            "new_tags": sum(1 for row in gallery_rows if str(row.get("tag") or "").strip() not in local_by_tag),
            "fill_translation_candidates": sum(
                1 for row in gallery_rows
                if str(row.get("tag") or "").strip() in local_by_tag
                and str(row.get("translation") or "").strip()
                and not str(local_by_tag[str(row.get("tag") or "").strip()].get("translation") or "").strip()
            ),
            "translation_conflicts": sum(
                1 for row in gallery_rows
                if str(row.get("tag") or "").strip() in local_by_tag
                and str(row.get("translation") or "").strip()
                and str(local_by_tag[str(row.get("tag") or "").strip()].get("translation") or "").strip()
                and str(row.get("translation") or "").strip() != str(local_by_tag[str(row.get("tag") or "").strip()].get("translation") or "").strip()
            ),
        },
        "samples": {
            "new_tags": new_tags,
            "fill_translations": fill_translations,
            "translation_conflicts": conflicts,
            "query_improvements": samples,
        },
    }
