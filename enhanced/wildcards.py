import os
import re
import json
import math
import random
import gradio as gr
import enhanced.translator as translator
from modules.access_mode import is_local_mode, user_has_full_local_access
import logging
from enhanced.logger import format_name
from ui.update_helpers import dataset_update, dropdown_update, gr_update, skip_update
logger = logging.getLogger(format_name(__name__))

from modules.util import get_files_from_folder
from args_manager import args

def _default_userhome_path():
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "users"))


wildcards_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../wildcards/'))
wildcards_max_bfs_depth = 64

wildcards = {}
wildcards_list = {}
wildcards_translation = {}
wildcards_words_translation = {}
wildcards_template = {}
wildcards_weight_range = {}
wildcards_cache = {}

array_regex = re.compile(r'\[([\w\(\)\.\s,;:-]+)\]')
array_regex1 = re.compile(r'\[([\w\(\)\s\u4e00-\u9fa5\u3000-\u303F\uFF00-\uFFEF,;.:\"\'-]+)\]')
tag_regex0 = re.compile(r'([\s\w\(\);-]+)')
tag_regex1 = re.compile(r'([\s\w\(\),-]+)')
tag_regex2 = re.compile(r'__([\w-]+)__')
tag_regex3 = re.compile(r'__([\w-]+)__:([\d]+)')
tag_regex4 = re.compile(r'__([\w-]+)__:([RLrl]){1}([\d]*)')
tag_regex5 = re.compile(r'__([\w-]+)__:([RLrl]){1}([\d]*):([\d]+)')
tag_regex6 = re.compile(r'__([\w-]+)__:([\d]+):([\d]+)')

wildcard_regex = re.compile(r'-([\w-]+)-')

def set_wildcard_path_list(name, list_value):
    global wildcards_list
    if name in wildcards_list.keys():
        if list_value not in wildcards_list[name]:
            wildcards_list[name].append(list_value)
    else:
        wildcards_list.update({name: [list_value]})

def _get_cache_key(user_did):
    return user_did if user_did else "__public__"

def _is_guest_user(user_did):
    try:
        import shared
        if shared.token is None or user_did is None:
            return True
        return shared.token.is_guest(user_did)
    except Exception:
        return True

def _get_user_wildcards_dir(user_did):
    if not user_did:
        if not is_local_mode():
            return None
        try:
            import shared
            token = getattr(shared, "token", None)
            if token is not None and hasattr(token, "get_guest_did"):
                user_did = token.get_guest_did()
        except Exception:
            user_did = None
        user_did = user_did or "guest"
    if not user_has_full_local_access(user_did):
        return None
    try:
        import shared
        if shared.token is not None and hasattr(shared.token, "get_path_in_user_dir"):
            path = shared.token.get_path_in_user_dir(user_did, "wildcards")
        else:
            path = os.path.join(getattr(shared, "path_userhome", "") or _default_userhome_path(), str(user_did), "wildcards")
        os.makedirs(path, exist_ok=True)
        return path
    except Exception:
        path = os.path.join(_default_userhome_path(), str(user_did), "wildcards")
        os.makedirs(path, exist_ok=True)
        return path

def _get_public_wildcards_dirs():
    dirs = []
    if os.path.isdir(wildcards_path):
        dirs.append(wildcards_path)
    try:
        import modules.config as config
        for p in getattr(config, "paths_wildcards", []) or []:
            ap = os.path.abspath(p)
            if os.path.isdir(ap) and ap not in dirs:
                dirs.append(ap)
    except Exception:
        pass
    return dirs

def _get_wildcards_dirs(user_did=None):
    dirs = []
    user_dir = _get_user_wildcards_dir(user_did)
    if user_dir and os.path.isdir(user_dir):
        dirs.append(user_dir)
    dirs += _get_public_wildcards_dirs()
    return dirs

def _to_wildcard_key(rel_path):
    if rel_path.lower().endswith(".txt"):
        rel_path = rel_path[:-4]
    return rel_path.replace("\\", "/")

def _build_wildcards_context(user_did=None):
    dirs = _get_wildcards_dirs(user_did)
    wildcard_sources = {}
    signature_items = []

    for root_dir in dirs:
        try:
            files = get_files_from_folder(root_dir, ['.txt'], None, variation=False)
        except Exception:
            continue
        for rel in files:
            key = _to_wildcard_key(rel)
            if key in wildcard_sources:
                continue
            full_path = os.path.join(root_dir, rel)
            if not os.path.isfile(full_path):
                continue
            wildcard_sources[key] = full_path
            try:
                signature_items.append((root_dir, rel.replace("\\", "/"), int(os.path.getmtime(full_path))))
            except Exception:
                signature_items.append((root_dir, rel.replace("\\", "/"), 0))

    signature = tuple(sorted(signature_items))

    ctx = {
        "user_did": user_did,
        "dirs": dirs,
        "signature": signature,
        "wildcards": {},
        "wildcards_list": {},
        "wildcards_template": {},
        "wildcards_weight_range": {},
    }

    for wildcard, file_path in sorted(wildcard_sources.items(), key=lambda x: x[0].casefold()):
        try:
            words = open(file_path, encoding='utf-8').read().splitlines()
        except Exception:
            words = []
        words = [x.split('?')[0] for x in words if x != '' and not wildcard_regex.findall(x)]

        templates = [x for x in words if '|' in x]
        for line in templates:
            parts = line.split("|")
            word = parts[0]
            template = parts[1] if len(parts) > 1 else ''
            weight_range = parts[2] if len(parts) > 2 else ''
            if word is None or word == '':
                ctx["wildcards_template"][wildcard] = template
                if len(weight_range.strip()) > 0:
                    ctx["wildcards_weight_range"][wildcard] = weight_range
            else:
                ctx["wildcards_template"][f'{wildcard}/{word}'] = template
                if len(weight_range.strip()) > 0:
                    ctx["wildcards_weight_range"][f'{wildcard}/{word}'] = weight_range

        words = [x.split("|")[0] for x in words]
        ctx["wildcards"][wildcard] = words

    wildcards_list_local = {}
    def set_list(name, list_value):
        if name in wildcards_list_local:
            if list_value not in wildcards_list_local[name]:
                wildcards_list_local[name].append(list_value)
        else:
            wildcards_list_local[name] = [list_value]

    for wildcard in ctx["wildcards"].keys():
        wildcard_path = wildcard.split("/")
        if len(wildcard_path) == 1:
            set_list("root", wildcard_path[0])
        elif len(wildcard_path) == 2:
            set_list(wildcard_path[0], wildcard_path[1])
        elif len(wildcard_path) == 3:
            set_list(f'{wildcard_path[0]}/{wildcard_path[1]}', wildcard_path[2])
            set_list(wildcard_path[0], wildcard_path[1])
        else:
            logger.info(f'The level of wildcards is too depth: {wildcard}.')

    for k in list(wildcards_list_local.keys()):
        wildcards_list_local[k] = sorted(wildcards_list_local[k], key=lambda s: s.casefold())

    ctx["wildcards_list"] = wildcards_list_local
    return ctx

def ensure_wildcards_loaded(user_did=None, reload_flag=False):
    global wildcards_cache, wildcards, wildcards_list, wildcards_template, wildcards_weight_range
    cache_key = _get_cache_key(user_did)
    ctx = wildcards_cache.get(cache_key, None)
    if ctx is None or reload_flag:
        new_ctx = _build_wildcards_context(user_did)
        wildcards_cache[cache_key] = new_ctx
        ctx = new_ctx
    else:
        new_ctx = _build_wildcards_context(user_did)
        if new_ctx["signature"] != ctx.get("signature"):
            wildcards_cache[cache_key] = new_ctx
            ctx = new_ctx

    if user_did is None:
        wildcards = ctx["wildcards"]
        wildcards_list = ctx["wildcards_list"]
        wildcards_template = ctx["wildcards_template"]
        wildcards_weight_range = ctx["wildcards_weight_range"]
    return ctx

def _normalize_wildcards_lang(lang=None, state_params=None):
    if isinstance(lang, dict) and state_params is None:
        state_params = lang
        lang = None
    if lang is None and isinstance(state_params, dict):
        lang = state_params.get("__lang")
    lang = str(lang or args.language or "cn").lower()
    return "en" if lang.startswith("en") else "cn"

def _load_wildcards_list_translation():
    global wildcards_path, wildcards_translation
    if len(wildcards_translation.keys()) == 0:
        wildcards_translation_file = os.path.join(wildcards_path, 'cn_list.json')
        if os.path.exists(wildcards_translation_file):
            with open(wildcards_translation_file, "r", encoding="utf-8") as json_file:
                wildcards_translation.update(json.load(json_file))

def get_wildcard_translation(x, lang=None):
    if _normalize_wildcards_lang(lang) != 'cn':
        return x
    _load_wildcards_list_translation()
    return x if f'list/{x}' not in wildcards_translation else wildcards_translation[f'list/{x}']

def get_wildcards_samples(path="root", trans=True, user_did=None, lang=None):
    ctx = ensure_wildcards_loaded(user_did)
    if path not in ctx["wildcards_list"] or len(ctx["wildcards_list"][path]) == 0:
        return []

    if not trans or _normalize_wildcards_lang(lang) != 'cn':
        return [[x] for x in ctx["wildcards_list"][path]]

    return [[get_wildcard_translation(x, lang=lang)] for x in ctx["wildcards_list"][path]]

def load_words_translation(reload_flag=False):
    global wildcards_path, wildcards_words_translation
    if len(wildcards_words_translation.keys())==0 or reload_flag:
        translation_file = os.path.join(wildcards_path, 'cn_words.json')
        if os.path.exists(translation_file):
            with open(translation_file, "r", encoding="utf-8") as json_file:
                wildcards_words_translation.update(json.load(json_file))

def get_words_of_wildcard_samples(wildcard="root", user_did=None, lang=None):
    global wildcards_words_translation

    ctx = ensure_wildcards_loaded(user_did)
    if wildcard == "root":
        root_list = ctx["wildcards_list"].get("root", [])
        if len(root_list) == 0:
            return []
        wildcard = root_list[0]

    words_source = ctx["wildcards"].get(wildcard, [])
    if _normalize_wildcards_lang(lang) == 'cn':
        if len(wildcards_words_translation.keys()) == 0:
            load_words_translation()
        return [[x if x not in wildcards_words_translation else wildcards_words_translation[x]] for x in words_source]
    return [[x] for x in words_source]

def get_words_with_wildcard(wildcard, rng, method='R', number=1, start_at=1, user_did=None):
    ctx = ensure_wildcards_loaded(user_did)

    if wildcard is None or wildcard=='':
        words = []
    else:
        words = ctx["wildcards"].get(wildcard, [])
    words_result = []
    number0 = number
    if method=='L' or method=='l':
        if number == 0:
            words_result = words
        else:
            if number < 0:
                number = 1
            start = start_at - 1
            if number > len(words):
                number = len(words)
            if (start + number)>len(words):
                words_result = words[start:] + words[:start + number - len(words)]
            else:
                words_result = words[start:start + number]
    else:
        if number < 1:
            number = 1
        if number > len(words):
            number = len(words)
        nums = 1 if start_at<=1 else start_at
        for i in range(number):
            words_each = rng.sample(words, nums)
            words_result.append(words_each[0] if nums==1 else ", ".join(words_each))
    words_result = [replace_wildcard(txt, rng, user_did=user_did) for txt in words_result]
    logger.info(f'Get words from wildcard:__{wildcard}__, method:{method}, number:{number}, start_at:{start_at}, result:{words_result}')
    return words_result


def compile_arrays(text, rng, user_did=None, allow_plain_bracket_arrays=True):
    global wildcards, wildcards_max_bfs_depth, array_regex, array_regex1, tag_regex1, tag_regex2, tag_regex3, tag_regex4, tag_regex5, tag_regex6

    _ = ensure_wildcards_loaded(user_did)
    tag_arrays = array_regex1.findall(text)
    arrays = []
    mult = 1
    seed_fixed = True
    has_active_arrays = False

    if len(tag_arrays) > 0:
        for tag in tag_arrays:
            tag = tag.strip()
            if tag == '':
                arrays.append([''])
                continue

            if '__' in tag:
                has_active_arrays = True
                colon_counter = tag.count(':')
                wildcard = ''
                number = 1
                method = 'R'
                start_at = 1
                found = False

                if colon_counter >= 2:
                    parts = tag_regex5.findall(tag)
                    if parts:
                        parts = list(parts[0])
                        wildcard = parts[0]
                        method = parts[1]
                        if parts[2]:
                            number = int(parts[2])
                        start_at = int(parts[3])
                        found = True
                    else:
                        parts = tag_regex6.findall(tag)
                        if parts:
                            parts = list(parts[0])
                            wildcard = parts[0]
                            number = int(parts[1])
                            start_at = int(parts[2])
                            found = True

                if not found and colon_counter >= 1:
                    parts = tag_regex4.findall(tag)
                    if parts:
                        parts = list(parts[0])
                        wildcard = parts[0]
                        method = parts[1]
                        if parts[2]:
                            number = int(parts[2])
                        found = True
                    else:
                        parts = tag_regex3.findall(tag)
                        if parts:
                            parts = list(parts[0])
                            wildcard = parts[0]
                            number = int(parts[1])
                            found = True

                if not found:
                    sub_parts = tag_regex2.findall(tag)
                    if sub_parts:
                        wildcard = sub_parts[0]
                        found = True

                if found and wildcard:
                    words = get_words_with_wildcard(wildcard, rng, method, number, start_at, user_did=user_did)
                    arrays.append(words if len(words) > 0 else [''])
                    if not method.isupper():
                        seed_fixed = False
                else:
                    delimiter = ';' if ';' in tag else ','
                    words = [x.strip() for x in tag.split(delimiter) if x.strip() != '']
                    arrays.append(words if len(words) > 0 else [''])
                    if delimiter == ';':
                        seed_fixed = False
            else:
                if allow_plain_bracket_arrays and (',' in tag or ';' in tag):
                    has_active_arrays = True
                    delimiter = ';' if ';' in tag else ','
                    words = [x.strip() for x in tag.split(delimiter) if x.strip() != '']
                    arrays.append(words if len(words) > 0 else [''])
                    if delimiter == ';':
                        seed_fixed = False
                else:
                    arrays.append([f'[{tag}]'])

        for arr in arrays:
            mult *= max(1, len(arr))

    if (len(arrays) == 0) or (not has_active_arrays):
        arrays = []
        mult = 0

    # Support for naked wildcards with parameters (e.g. __wildcard__:3)
    def get_replacement(wildcard, method, number, start_at):
        words = get_words_with_wildcard(wildcard, rng, method, number, start_at, user_did=user_did)
        delimiter = ',' if method.isupper() else ';'
        if delimiter == ';':
            nonlocal seed_fixed
            seed_fixed = False
        joiner = ', ' if delimiter == ',' else '; '
        return joiner.join(words)

    def sub_outside_arrays(pattern, repl, input_text):
        parts = []
        last = 0
        for m in array_regex1.finditer(input_text):
            outside = input_text[last:m.start()]
            parts.append(pattern.sub(repl, outside))
            parts.append(input_text[m.start():m.end()])
            last = m.end()
        parts.append(pattern.sub(repl, input_text[last:]))
        return ''.join(parts)

    # Regex 5: __name__:M[N]:S
    text = sub_outside_arrays(tag_regex5, lambda m: get_replacement(
        m.group(1), m.group(2), int(m.group(3)) if m.group(3) else 1, int(m.group(4))
    ), text)

    # Regex 6: __name__:N:S
    text = sub_outside_arrays(tag_regex6, lambda m: get_replacement(
        m.group(1), 'R', int(m.group(2)), int(m.group(3))
    ), text)

    # Regex 4: __name__:M[N]
    text = sub_outside_arrays(tag_regex4, lambda m: get_replacement(
        m.group(1), m.group(2), int(m.group(3)) if m.group(3) else 1, 1
    ), text)

    # Regex 3: __name__:N
    text = sub_outside_arrays(tag_regex3, lambda m: get_replacement(
        m.group(1), 'R', int(m.group(2)), 1
    ), text)

    logger.info(f'Copmile text in prompt to arrays: {text} -> arrays:{arrays}, mult:{mult}')
    return text, arrays, mult, seed_fixed

def replace_wildcard(text, rng, user_did=None):
    global wildcards_max_bfs_depth, tag_regex2
    ctx = ensure_wildcards_loaded(user_did)
    parts = tag_regex2.findall(text)
    i = 1
    while parts:
        for wildcard in parts:
            if wildcard in ctx["wildcards"]:
                text = text.replace(f'__{wildcard}__', rng.choice(ctx["wildcards"][wildcard]), 1)
        parts = tag_regex2.findall(text)
        i += 1
        if i > wildcards_max_bfs_depth:
            break
    return text


def get_words(arrays, totalMult, index):
    if(len(arrays) == 1):
        word = arrays[0][index]
        #if word[0] == '(' and word[-1] == ')':
        #    word = word[1:-1]
        return [word]
    else:
        words = arrays[0]
        word = words[index % len(words)]
        #if word[0] == '(' and word[-1] == ')':
        #    word = word[1:-1]
        index -= index % len(words)
        index /= len(words)
        index = math.floor(index)
        return [word] + get_words(arrays[1:], math.floor(totalMult/len(words)), index)


def apply_arrays(text, index, arrays, mult):
    if len(arrays) == 0 or mult == 0:
        return text
    
    tags = array_regex1.findall(text)

    index %= mult
    chosen_words = get_words(arrays, mult, index)

    i = 0
    for arr in arrays:
        if i<len(tags) and i<len(chosen_words):
            if not tag_regex2.findall(chosen_words[i]):
                text = text.replace(f'[{tags[i]}]', chosen_words[i], 1)
            else:
                text = text.replace(f'[{tags[i]}]', tags[i], 1)
        i = i+1

    return text


def apply_wildcards(wildcard_text, rng, user_did=None):
    global tag_regex2
    ctx = ensure_wildcards_loaded(user_did)

    for _ in range(wildcards_max_bfs_depth):
        placeholders = tag_regex2.findall(wildcard_text)
        if len(placeholders) == 0:
            return wildcard_text

        logger.info(f'[Wildcards] processing: {wildcard_text}')
        for placeholder in placeholders:
            try:
                words = ctx["wildcards"][placeholder]
                assert len(words) > 0
                wildcard_text = wildcard_text.replace(f'__{placeholder}__', rng.choice(words), 1)
            except:
                logger.info(f'[Wildcards] Warning: {placeholder}.txt missing or empty. '
                      f'Using "{placeholder}" as a normal word.')
                wildcard_text = wildcard_text.replace(f'__{placeholder}__', placeholder)
            logger.info(f'[Wildcards] {wildcard_text}')

    logger.info(f'[Wildcards] BFS stack overflow. Current text: {wildcard_text}')
    return wildcard_text


def _get_user_did_from_state(state_params):
    try:
        if isinstance(state_params, dict) and "user" in state_params and state_params["user"] is not None:
            user = state_params["user"]
            if hasattr(user, "get_did"):
                return user.get_did()
    except Exception:
        pass
    if is_local_mode():
        try:
            import shared
            token = getattr(shared, "token", None)
            if token is not None and hasattr(token, "get_guest_did"):
                return token.get_guest_did()
        except Exception:
            pass
        return "guest"
    return None

def add_wildcards_and_array_to_prompt(wildcard, prompt, state_params):
    user_did = _get_user_did_from_state(state_params)
    lang = _normalize_wildcards_lang(state_params=state_params)
    ctx = ensure_wildcards_loaded(user_did)
    root_list = ctx["wildcards_list"].get("root", [])
    if not root_list:
        return gr_update(value=prompt), dataset_update(label=':', samples=[]), gr_update(open=True)

    wildcard = root_list[wildcard]
    state_params.update({"wildcard_in_wildcards": wildcard})
    if len(prompt)>0:
        if prompt[-1]=='[':
            state_params["array_wildcards_mode"] = '['
            prompt = prompt[:-1]
        elif prompt[-1]=='_':
            state_params["array_wildcards_mode"] = '_'
            if len(prompt)==1 or len(prompt)>2 and prompt[-2]!='_':
                prompt = prompt[:-1]
        else:
            state_params["array_wildcards_mode"] = '_'
    else:
        state_params["array_wildcards_mode"] = '_'
    
    if state_params["array_wildcards_mode"] == '[':
        new_tag = f'[__{wildcard}__]'
    else:
        new_tag = f'__{wildcard}__'
    prompt = f'{prompt.strip()} {new_tag}'
    return gr_update(value=prompt), dataset_update(label=f'{get_wildcard_translation(wildcard, lang=lang)}:', samples=get_words_of_wildcard_samples(wildcard, user_did=user_did, lang=lang)), gr_update(open=True)

def add_word_to_prompt(wildcard, index, prompt, state_params):
    user_did = _get_user_did_from_state(state_params)
    ctx = ensure_wildcards_loaded(user_did)
    root_list = ctx["wildcards_list"].get("root", [])
    if not root_list:
        return gr_update(value=prompt)

    wildcard = root_list[wildcard]
    words = ctx["wildcards"].get(wildcard, [])
    if index < 0 or index >= len(words):
        return gr_update(value=prompt)
    word = words[index]
    prompt = prompt.strip()
    for tag in [f'[__{wildcard}__]', f'__{wildcard}__']:
        if prompt.endswith(tag):
            prompt = prompt[:-1*len(tag)]
            break
    prompt = f'{prompt.strip()} {word}'
    return gr_update(value=prompt)

def normalize_int(v, default_value=1, min_value=1):
    try:
        iv = int(v)
    except Exception:
        return default_value
    return max(min_value, iv)

def build_wildcards_helper_tag(target, method, seed_mode, name, count, start, group_size):
    name = "" if name is None else str(name).strip()
    if name == "":
        return ""

    count = normalize_int(count, 1, 1)
    start = normalize_int(start, 1, 1)
    group_size = normalize_int(group_size, 1, 1)

    fixed_seed = (seed_mode == "Fixed seed")
    in_order = (method == "In order")
    method_letter = ("L" if fixed_seed else "l") if in_order else ("R" if fixed_seed else "r")

    if target == "Single in prompt":
        if in_order:
            return f"__{name}__:{method_letter}{count}:{start}"
        if group_size > 1:
            return f"__{name}__:{method_letter}{count}:{group_size}"
        if count > 1:
            return f"__{name}__:{method_letter}{count}"
        return f"__{name}__"

    if in_order:
        return f"[__{name}__:{method_letter}{count}:{start}]"
    if group_size > 1:
        return f"[__{name}__:{method_letter}{count}:{group_size}]"
    return f"[__{name}__:{method_letter}{count}]"

def update_wildcards_helper_controls(target, method, *_):
    return skip_update(), skip_update()

def update_wildcards_helper_preview(target, method, seed_mode, name, count, start, group_size):
    tag = build_wildcards_helper_tag(target, method, seed_mode, name, count, start, group_size)
    if tag == "":
        return ""
    return f"<div><b>Preview</b>: <code>{tag}</code></div>"

def append_wildcards_helper_tag_to_prompt(prompt_text, target, method, seed_mode, name, count, start, group_size):
    tag = build_wildcards_helper_tag(target, method, seed_mode, name, count, start, group_size)
    if tag == "":
        return prompt_text
    prompt_text = "" if prompt_text is None else str(prompt_text)
    if prompt_text.strip() == "":
        return tag
    return f"{prompt_text.strip()} {tag}"

def refresh_wildcards_components(state_params):
    user_did = _get_user_did_from_state(state_params)
    lang = _normalize_wildcards_lang(state_params=state_params)
    samples = get_wildcards_samples(user_did=user_did, lang=lang)
    names = [x[0] for x in get_wildcards_samples(trans=False, user_did=user_did)]
    words = get_words_of_wildcard_samples("root", user_did=user_did, lang=lang)
    name_value = names[0] if len(names) > 0 else None
    return (
        dataset_update(samples=samples),
        dropdown_update(choices=names, value=name_value),
        dataset_update(samples=words),
    )

def _sanitize_personal_wildcard_name(name):
    s = "" if name is None else str(name)
    s = s.strip().replace("\\", "/")
    if "/" in s:
        s = s.split("/")[-1]
    s = s.strip(" .")
    s = re.sub(r"[\\/:*?\"<>|\r\n\t]+", "_", s)
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s[:80]

def _normalize_newlines(text):
    s = "" if text is None else str(text)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    return s

def _personal_wildcards_action_updates(name, can_delete):
    can_save = bool(("" if name is None else str(name)).strip())
    return gr_update(interactive=can_save), gr_update(interactive=bool(can_delete))

def personal_wildcards_update_actions(name):
    return _personal_wildcards_action_updates(name, False)

def _get_personal_wildcards_dir_from_state(state_params):
    user_did = _get_user_did_from_state(state_params)
    if user_did is None:
        return None, None, "Please sign in to manage personal wildcards."
    if not user_has_full_local_access(user_did):
        return None, None, "Guest users cannot manage personal wildcards."
    user_dir = _get_user_wildcards_dir(user_did)
    if user_dir is None:
        return None, None, "Personal wildcards directory is unavailable."
    return user_did, user_dir, ""

def personal_wildcards_access_info(state_params=None, user_did=None):
    if user_did is None:
        user_did = _get_user_did_from_state(state_params)
    can_manage = bool(user_did is not None and user_has_full_local_access(user_did))
    user_dir = _get_user_wildcards_dir(user_did) if can_manage else None
    return {
        "user_did": user_did or "guest",
        "can_manage": can_manage,
        "mode": "local" if is_local_mode() else "multi-user",
        "user_dir": user_dir or "",
    }

def wildcard_catalog_payload(path="root", trans=False, user_did=None, lang=None):
    ctx = ensure_wildcards_loaded(user_did)
    flat_names = [x[0] for x in get_wildcards_samples(path=path or "root", trans=False, user_did=user_did)]
    selected = flat_names[0] if flat_names else ""
    return {
        "names": get_wildcards_samples(path=path or "root", trans=trans, user_did=user_did, lang=lang),
        "flat_names": flat_names,
        "selected": selected,
        "words": get_words_of_wildcard_samples(selected or "root", user_did=user_did, lang=lang),
        "templates": ctx.get("wildcards_template", {}),
        "weight_ranges": ctx.get("wildcards_weight_range", {}),
        "access": personal_wildcards_access_info(user_did=user_did),
    }

def _wildcard_tokens(text):
    result = []
    for token in tag_regex2.findall("" if text is None else str(text)):
        if token not in result:
            result.append(token)
    return result

def preview_wildcards(prompt, negative_prompt="", seed=-1, image_number=1, user_did=None, max_samples=3):
    prompt = "" if prompt is None else str(prompt)
    negative_prompt = "" if negative_prompt is None else str(negative_prompt)
    try:
        seed = int(seed)
    except Exception:
        seed = -1
    if seed < 0:
        seed = random.randint(0, 1125899906842623)
    try:
        image_number = max(1, int(image_number))
    except Exception:
        image_number = 1
    max_samples = max(1, min(int(max_samples or 3), 12))
    rng = random.Random(seed)
    compiled_prompt, arrays, arrays_mult, seed_fixed = compile_arrays(prompt, rng, user_did=user_did)
    total = image_number if arrays_mult == 0 else arrays_mult
    ctx = ensure_wildcards_loaded(user_did)
    tokens = _wildcard_tokens(prompt + "\n" + negative_prompt)
    matched = [token for token in tokens if token in ctx.get("wildcards", {})]
    unmatched = [token for token in tokens if token not in ctx.get("wildcards", {})]
    samples = []
    for i in range(min(max_samples, max(1, total))):
        task_seed = (seed + i) % 1125899906842624
        task_rng = random.Random(task_seed)
        expanded_prompt = apply_arrays(compiled_prompt, i, arrays, arrays_mult)
        expanded_prompt = replace_wildcard(expanded_prompt, task_rng, user_did=user_did)
        expanded_negative = apply_wildcards(negative_prompt, task_rng, user_did=user_did)
        samples.append({
            "index": i,
            "seed": task_seed,
            "prompt": expanded_prompt,
            "negative_prompt": expanded_negative,
        })
    return {
        "raw_prompt": prompt,
        "raw_negative_prompt": negative_prompt,
        "seed": seed,
        "image_number": image_number,
        "arrays_mult": arrays_mult,
        "seed_fixed": seed_fixed,
        "total": total,
        "matched": matched,
        "unmatched": unmatched,
        "samples": samples,
        "user_did": user_did or personal_wildcards_access_info(user_did=user_did).get("user_did") or "guest",
    }

def personal_wildcards_json_list(state_params=None, user_did=None):
    info = personal_wildcards_access_info(state_params, user_did)
    if not info["can_manage"] or not info["user_dir"]:
        return {**info, "keys": [], "selected": "", "content": "", "error": "Personal wildcards are read-only for this user."}
    keys = _list_personal_wildcard_keys(info["user_dir"])
    selected = keys[0] if keys else ""
    content = ""
    if selected:
        file_path, _ = _personal_wildcard_file_path(info["user_dir"], selected)
        if file_path and os.path.isfile(file_path):
            with open(file_path, "rb") as f:
                content = _normalize_newlines(f.read().decode("utf-8", errors="ignore"))
    return {**info, "keys": keys, "selected": selected, "content": content}

def personal_wildcards_json_load(name, state_params=None, user_did=None):
    info = personal_wildcards_access_info(state_params, user_did)
    if not info["can_manage"] or not info["user_dir"]:
        return {**info, "ok": False, "error": "Personal wildcards are read-only for this user."}
    file_path, safe_key = _personal_wildcard_file_path(info["user_dir"], name)
    if not file_path or not os.path.isfile(file_path):
        return {**info, "ok": False, "name": safe_key, "content": "", "error": "File not found."}
    with open(file_path, "rb") as f:
        content = _normalize_newlines(f.read().decode("utf-8", errors="ignore"))
    return {**info, "ok": True, "name": safe_key, "content": content}

def personal_wildcards_json_save(name, content, state_params=None, user_did=None):
    info = personal_wildcards_access_info(state_params, user_did)
    if not info["can_manage"] or not info["user_dir"]:
        return {**info, "ok": False, "error": "Personal wildcards are read-only for this user."}
    file_path, safe_key = _personal_wildcard_file_path(info["user_dir"], name)
    if not file_path:
        return {**info, "ok": False, "error": "Invalid wildcard name."}
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    final_content = _normalize_newlines(content)
    with open(file_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(final_content)
    ensure_wildcards_loaded(info["user_did"], reload_flag=True)
    return {**personal_wildcards_json_list(state_params, info["user_did"]), "ok": True, "selected": safe_key, "content": final_content, "message": f"Saved: {safe_key}.txt"}

def personal_wildcards_json_delete(name, state_params=None, user_did=None):
    info = personal_wildcards_access_info(state_params, user_did)
    if not info["can_manage"] or not info["user_dir"]:
        return {**info, "ok": False, "error": "Personal wildcards are read-only for this user."}
    file_path, safe_key = _personal_wildcard_file_path(info["user_dir"], name)
    if file_path and os.path.isfile(file_path):
        os.remove(file_path)
        ensure_wildcards_loaded(info["user_did"], reload_flag=True)
    return {**personal_wildcards_json_list(state_params, info["user_did"]), "ok": True, "message": f"Deleted: {safe_key}.txt"}

def _list_personal_wildcard_keys(user_dir):
    keys = []
    try:
        files = get_files_from_folder(user_dir, ['.txt'], None, variation=False)
    except Exception:
        files = []
    for rel in files:
        key = _to_wildcard_key(rel)
        if key:
            keys.append(key)
    keys = sorted(set(keys), key=lambda s: s.casefold())
    return keys

def _personal_wildcard_file_path(user_dir, key):
    try:
        key = "" if key is None else str(key).strip().replace("\\", "/").strip("/")
        if key.lower().endswith(".txt"):
            key = key[:-4]
        key = _sanitize_personal_wildcard_name(key)
        if key == "":
            return None, ""
        user_dir_abs = os.path.abspath(user_dir)
        full_path = os.path.abspath(os.path.join(user_dir_abs, f"{key}.txt"))
        if os.path.commonpath([user_dir_abs, full_path]) != user_dir_abs:
            return None, ""
        return full_path, key
    except Exception:
        return None, ""

def personal_wildcards_open(state_params):
    user_did, user_dir, err = _get_personal_wildcards_dir_from_state(state_params)
    if err:
        return (
            gr_update(visible=True),
            dropdown_update(choices=[], value=None),
            "",
            "",
            f"**Note**: {err}",
            *(_personal_wildcards_action_updates("", False)),
        )
    keys = _list_personal_wildcard_keys(user_dir)
    selected = keys[0] if keys else None
    content = ""
    can_delete = False
    if selected:
        try:
            file_path, _ = _personal_wildcard_file_path(user_dir, selected)
            if file_path and os.path.isfile(file_path):
                with open(file_path, "rb") as f:
                    content = _normalize_newlines(f.read().decode("utf-8", errors="ignore"))
                can_delete = True
        except Exception:
            content = ""
    return (
        gr_update(visible=True),
        dropdown_update(choices=keys, value=selected),
        selected or "",
        content,
        f"**User**: {user_did}",
        *(_personal_wildcards_action_updates(selected or "", can_delete)),
    )

def personal_wildcards_close():
    return gr_update(visible=False)

def personal_wildcards_refresh(state_params, current_value=None):
    user_did, user_dir, err = _get_personal_wildcards_dir_from_state(state_params)
    if err:
        return (dropdown_update(choices=[], value=None), "", "", f"**Note**: {err}", *(_personal_wildcards_action_updates("", False)))
    keys = _list_personal_wildcard_keys(user_dir)
    value = current_value if current_value in keys else (keys[0] if keys else None)
    content = ""
    can_delete = False
    if value:
        try:
            file_path, _ = _personal_wildcard_file_path(user_dir, value)
            if file_path and os.path.isfile(file_path):
                with open(file_path, "rb") as f:
                    content = _normalize_newlines(f.read().decode("utf-8", errors="ignore"))
                can_delete = True
        except Exception:
            content = ""
    return (dropdown_update(choices=keys, value=value), value or "", content, f"**User**: {user_did}", *(_personal_wildcards_action_updates(value or "", can_delete)))

def personal_wildcards_load(state_params, key):
    user_did, user_dir, err = _get_personal_wildcards_dir_from_state(state_params)
    if err:
        return ("", "", f"**Note**: {err}", *(_personal_wildcards_action_updates("", False)))
    file_path, safe_key = _personal_wildcard_file_path(user_dir, key)
    if not file_path:
        return ("", "", "**Note**: Invalid filename.", *(_personal_wildcards_action_updates("", False)))
    if not os.path.isfile(file_path):
        return (safe_key, "", f"**Note**: File not found: {safe_key}.txt", *(_personal_wildcards_action_updates(safe_key, False)))
    try:
        with open(file_path, "rb") as f:
            content = _normalize_newlines(f.read().decode("utf-8", errors="ignore"))
        return (safe_key, content, f"**User**: {user_did}", *(_personal_wildcards_action_updates(safe_key, True)))
    except Exception as e:
        return (safe_key, "", f"**Note**: Failed to read: {e}", *(_personal_wildcards_action_updates(safe_key, False)))

def personal_wildcards_save(state_params, name, content):
    user_did, user_dir, err = _get_personal_wildcards_dir_from_state(state_params)
    if err:
        return (
            f"**Note**: {err}",
            skip_update(),
            "" if name is None else str(name),
            "" if content is None else str(content),
            *(_personal_wildcards_action_updates("" if name is None else str(name), False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )
    try:
        file_path, safe_key = _personal_wildcard_file_path(user_dir, name)
    except Exception as e:
        return (
            f"**Note**: Failed to parse filename: {e}",
            skip_update(),
            "" if name is None else str(name),
            "" if content is None else str(content),
            *(_personal_wildcards_action_updates("" if name is None else str(name), False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )
    if not file_path:
        return (
            "**Note**: Invalid filename (avoid path separators and special characters).",
            skip_update(),
            "" if name is None else str(name),
            "" if content is None else str(content),
            *(_personal_wildcards_action_updates("" if name is None else str(name), False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        final_content = _normalize_newlines(content)
        with open(file_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(final_content)
        ensure_wildcards_loaded(user_did, reload_flag=True)
        return (
            f"**Saved**: {safe_key}.txt",
            dropdown_update(choices=_list_personal_wildcard_keys(user_dir), value=safe_key),
            safe_key,
            final_content,
            *(_personal_wildcards_action_updates(safe_key, True)),
            *refresh_wildcards_components(state_params),
        )
    except Exception as e:
        return (
            f"**Note**: Failed to save: {e}",
            skip_update(),
            "" if name is None else str(name),
            "" if content is None else str(content),
            *(_personal_wildcards_action_updates("" if name is None else str(name), False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )

def personal_wildcards_delete(state_params, name):
    user_did, user_dir, err = _get_personal_wildcards_dir_from_state(state_params)
    if err:
        return (
            f"**Note**: {err}",
            skip_update(),
            "",
            "",
            *(_personal_wildcards_action_updates("" if name is None else str(name), False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )
    file_path, safe_key = _personal_wildcard_file_path(user_dir, name)
    if not file_path:
        return (
            "**Note**: Invalid filename.",
            skip_update(),
            "",
            "",
            *(_personal_wildcards_action_updates("" if name is None else str(name), False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )
    if not os.path.isfile(file_path):
        return (
            f"**Note**: File not found: {safe_key}.txt",
            skip_update(),
            safe_key,
            "",
            *(_personal_wildcards_action_updates(safe_key, False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )
    try:
        os.remove(file_path)
        ensure_wildcards_loaded(user_did, reload_flag=True)
        keys = _list_personal_wildcard_keys(user_dir)
        selected = keys[0] if keys else None
        content = ""
        can_delete = False
        if selected:
            try:
                selected_path, _ = _personal_wildcard_file_path(user_dir, selected)
                if selected_path and os.path.isfile(selected_path):
                    with open(selected_path, "rb") as f:
                        content = _normalize_newlines(f.read().decode("utf-8", errors="ignore"))
                    can_delete = True
            except Exception:
                content = ""
        return (
            f"**Deleted**: {safe_key}.txt",
            dropdown_update(choices=keys, value=selected),
            selected or "",
            content,
            *(_personal_wildcards_action_updates(selected or "", can_delete)),
            *refresh_wildcards_components(state_params),
        )
    except Exception as e:
        return (
            f"**Note**: Failed to delete: {e}",
            skip_update(),
            safe_key,
            "",
            *(_personal_wildcards_action_updates(safe_key, False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )

def _get_uploaded_file_path(upload_file):
    if upload_file is None:
        return None
    if isinstance(upload_file, str):
        return upload_file
    try:
        if isinstance(upload_file, dict) and upload_file.get("name"):
            return upload_file.get("name")
    except Exception:
        pass
    try:
        if hasattr(upload_file, "name"):
            return upload_file.name
    except Exception:
        pass
    return None

def personal_wildcards_upload(state_params, upload_file, save_as):
    user_did, user_dir, err = _get_personal_wildcards_dir_from_state(state_params)
    if err:
        return (
            skip_update(),
            "",
            "",
            f"**Note**: {err}",
            *(_personal_wildcards_action_updates("", False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )
    upload_file_path = _get_uploaded_file_path(upload_file)
    if not upload_file_path:
        return (
            skip_update(),
            "",
            "",
            "**Note**: Please choose a .txt file to upload.",
            *(_personal_wildcards_action_updates("", False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )
    raw_name = save_as
    if not raw_name:
        try:
            raw_name = os.path.splitext(os.path.basename(str(upload_file_path)))[0]
        except Exception:
            raw_name = ""
    file_path, safe_key = _personal_wildcard_file_path(user_dir, raw_name)
    if not file_path:
        return (
            skip_update(),
            "",
            "",
            "**Note**: Invalid filename.",
            *(_personal_wildcards_action_updates("" if save_as is None else str(save_as), False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )
    try:
        if not os.path.isfile(upload_file_path):
            raise ValueError("Invalid upload file path.")
        with open(upload_file_path, "rb") as f:
            raw = f.read()
        content = _normalize_newlines(raw.decode("utf-8", errors="ignore"))
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
        ensure_wildcards_loaded(user_did, reload_flag=True)
        keys = _list_personal_wildcard_keys(user_dir)
        select_update = dropdown_update(choices=keys, value=safe_key)
        return (
            select_update,
            safe_key,
            content,
            f"**Uploaded**: {safe_key}.txt",
            *(_personal_wildcards_action_updates(safe_key, True)),
            *refresh_wildcards_components(state_params),
        )
    except Exception as e:
        return (
            skip_update(),
            safe_key,
            "",
            f"**Note**: Failed to upload: {e}",
            *(_personal_wildcards_action_updates(safe_key, False)),
            skip_update(),
            skip_update(),
            skip_update(),
        )
