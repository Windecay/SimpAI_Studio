import os
import re
import torch
import tarfile
import time
from threading import RLock
try:
    import translators as ts
except Exception as exc:
    ts = None
    TRANSLATORS_IMPORT_ERROR = exc
else:
    TRANSLATORS_IMPORT_ERROR = None

from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, pipeline
from modules.config import paths_llms
from modules.model_loader import load_file_from_url
from download import download
from functools import lru_cache
from modules.util import is_chinese
import logging
from enhanced.logger import format_name
logger = logging.getLogger(format_name(__name__))
_translation_api_dependency_warning_shown = False

Q_punct = '｀～！＠＃＄％＾＆＊（）＿＋＝－｛｝［］：＂；｜＜＞？，．／。　１２３４５６７８９０'
B_punct = '`~!@#$%^&*()_+=-{}[]:";|<>?,./. 1234567890'
Q_alphabet = 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ'
B_alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

# Ordered services verified for both directions. Google depends on region/proxy
# configuration and must not be selected automatically.
translator_org = ('alibaba', 'cloudTranslation', 'iflyrec', 'youdao', 'translateCom')
_TRANSLATION_REQUEST_TIMEOUT = 5.0
_TRANSLATION_RETRY_BUDGET = 20.0
_TRANSLATION_CHUNK_SIZE = 1500  # Below the smallest provider limit (2000).
_translation_api_lock = RLock()
_translation_literal_pattern = re.compile(
    r'(<[^>\r\n]+>|__[^\r\n]+?__|'
    r'\[(?:image|picture|video|audio|图片|图像|视频|音频)\s*\d+\]|'
    r'\r\n|\r|\n|[()\[\]{}:|])',
    re.IGNORECASE,
)
translator_path = os.path.join(paths_llms[0], 'nllb-200-distilled-600M')
translator_slim_path = os.path.join(paths_llms[0], 'Helsinki-NLP/opus-mt-zh-en')

translator_path_old = os.path.join(paths_llms[0], '../translator')
if os.path.exists(translator_path_old) and not os.path.exists(paths_llms[0]):
    os.rename(translator_path_old, paths_llms[0])


g_tokenizer = ''
g_model = ''
g_model_type = ''

def singularize_word(word: str) -> str:
    if not word:
        return word

    lower = word.lower()
    oe_plural_s_only = {
        "shoes",
        "toes",
        "canoes",
        "oboes",
        "aloes",
        "floes",
    }
    irregular = {
        "men": "man",
        "women": "woman",
        "children": "child",
        "people": "person",
        "mice": "mouse",
        "geese": "goose",
        "teeth": "tooth",
        "feet": "foot",
    }
    if lower in irregular:
        base = irregular[lower]
    elif len(lower) <= 3:
        base = lower
    elif lower.endswith("ies") and len(lower) > 4:
        base = lower[:-3] + "y"
    elif lower.endswith("oes") and lower in oe_plural_s_only:
        base = lower[:-1]
    elif lower.endswith(("ses", "xes", "zes", "ches", "shes", "oes")) and len(lower) > 4:
        base = lower[:-2]
    elif lower.endswith("s") and not lower.endswith(("ss", "us", "is", "as", "os")) and len(lower) > 3:
        base = lower[:-1]
    else:
        base = lower

    if word.isupper():
        return base.upper()
    if word[:1].isupper() and word[1:].islower():
        return base[:1].upper() + base[1:]
    return base

def normalize_prompt(prompt_text: str) -> str:
    if prompt_text is None:
        return prompt_text
    text = str(prompt_text).strip()
    if not text:
        return text

    parts = [p.strip() for p in re.split(r"[，,]", text) if p and p.strip()]
    normalized_parts = []
    for part in parts:
        words = part.split()
        normalized_words = []
        for w in words:
            m = re.match(r"^([^A-Za-z]*)([A-Za-z][A-Za-z'-]*)([^A-Za-z]*)$", w)
            if not m:
                normalized_words.append(w)
                continue
            prefix, core, suffix = m.group(1), m.group(2), m.group(3)
            normalized_words.append(prefix + singularize_word(core) + suffix)
        normalized_parts.append(" ".join(normalized_words).strip())

    return ", ".join([p for p in normalized_parts if p])

def Q2B_number_punctuation(text):
    global Q_punct, B_punct

    texts = list(text)
    Bpunct = list(B_punct)
    for i in range(0,len(texts)):
        j = Q_punct.find(texts[i])
        if j >= 0:
            texts[i] = Bpunct[j]
    return ''.join(texts)

def Q2B_alphabet(text):
    global Q_alphabet, B_alphabet

    texts = list(text)
    Balphabet = list(B_alphabet)
    for i in range(0,len(texts)):
        j = Q_alphabet.find(texts[i])
        if j >= 0:
            texts[i] = Balphabet[j]
    return ''.join(texts)


def translate2en_model(model, tokenizer, text_zh):
    inputs = tokenizer(text_zh, return_tensors="pt")
    translated_tokens = model.generate(
        **inputs, forced_bos_token_id=tokenizer.convert_tokens_to_ids("eng_Latn"), max_length=60
    )
    return tokenizer.batch_decode(translated_tokens, skip_special_tokens=True)[0].lower()

def translate2zh_model(model, tokenizer, text_en):
    inputs = tokenizer(text_en, return_tensors="pt")
    translated_tokens = model.generate(
        **inputs, forced_bos_token_id=tokenizer.convert_tokens_to_ids("zho_Hans"), max_length=60
    )
    return tokenizer.batch_decode(translated_tokens, skip_special_tokens=True)[0].lower()


def _translation_api_available():
    global _translation_api_dependency_warning_shown
    if ts is not None:
        return True
    if not _translation_api_dependency_warning_shown:
        _translation_api_dependency_warning_shown = True
        logger.warning(
            "Online translation APIs are unavailable; returning the original text. Import error: %s",
            TRANSLATORS_IMPORT_ERROR,
        )
    return False


class _OnlineTranslationError(RuntimeError):
    pass


@lru_cache(maxsize=128)
def _translate_api_chunk(text, from_language, to_language):
    # Exceptions are deliberately allowed out of the cached function: a failed
    # request must not make the original text a cached translation.
    deadline = time.monotonic() + _TRANSLATION_RETRY_BUDGET
    for provider in translator_org:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            result = ts.translate_text(
                text,
                translator=provider,
                from_language=from_language,
                to_language=to_language,
                timeout=min(_TRANSLATION_REQUEST_TIMEOUT, remaining),
            )
            if not isinstance(result, str) or not result.strip() or result.strip() == text.strip():
                raise _OnlineTranslationError('Empty, invalid or unchanged translation')
            logger.info('Online translation succeeded: provider=%s direction=%s->%s',
                        provider, from_language, to_language)
            return result.strip()
        except Exception as exc:
            logger.warning('Online translation failed: provider=%s direction=%s->%s error=%s: %s',
                           provider, from_language, to_language, type(exc).__name__, exc)
            logger.debug('Online translation exception', exc_info=True)
    raise _OnlineTranslationError('No translation service succeeded within the retry budget')


def _translation_chunks(text):
    while len(text) > _TRANSLATION_CHUNK_SIZE:
        boundary = max(text.rfind(mark, 0, _TRANSLATION_CHUNK_SIZE)
                       for mark in ('。', '！', '？', '，', '.', '!', '?', ',', ';', ' ', '\t'))
        end = boundary + 1 if boundary >= _TRANSLATION_CHUNK_SIZE // 2 else _TRANSLATION_CHUNK_SIZE
        yield text[:end]
        text = text[end:]
    if text:
        yield text


def _translate_online(text, from_language, to_language):
    try:
        # translators keeps mutable provider sessions; serialize access and
        # consult the cache inside the lock, including concurrent duplicates.
        with _translation_api_lock:
            parts = []
            for index, part in enumerate(_translation_literal_pattern.split(text)):
                if index % 2:
                    parts.append(part)
                    continue
                translated_chunks = []
                for chunk in _translation_chunks(part):
                    source = chunk.strip()
                    needs_translation = (is_chinese(source) if from_language == 'zh'
                                         else bool(re.search(r'[A-Za-z]', source)))
                    if not source or not needs_translation:
                        translated_chunks.append(chunk)
                        continue
                    translated = _translate_api_chunk(source, from_language, to_language)
                    if to_language == 'en':
                        translated = Q2B_alphabet(Q2B_number_punctuation(translated))
                    leading = chunk[:len(chunk) - len(chunk.lstrip())]
                    trailing = chunk[len(chunk.rstrip()):]
                    value = leading + translated + trailing
                    if (to_language == 'en' and translated_chunks and translated_chunks[-1]
                            and translated_chunks[-1][-1].isalnum() and value[0].isalnum()):
                        translated_chunks.append(' ')
                    translated_chunks.append(value)
                parts.append(''.join(translated_chunks))
            return ''.join(parts)
    except _OnlineTranslationError:
        logger.warning('Online translation unavailable (%s->%s); returning the original text.',
                       from_language, to_language)
        return text


def translate2zh_apis(text):
    if not text:
        return text
    if not _translation_api_available():
        return text
    return _translate_online(text, 'en', 'zh')


def translate2en_apis(text):
    if not text:
        return text
    if not _translation_api_available():
        return text
    return _translate_online(text, 'zh', 'en')

def init_or_load_translator_model(method='Slim Model'):
    global g_tokenizer, g_model, g_model_type

    if 'g_tokenizer' not in globals():
        globals()['g_tokenizer'] = None
    if 'g_model' not in globals():
        globals()['g_model'] = None

    logger.info(f'init_or_load_translator_model: {method}')
    if method != g_model_type or g_tokenizer is None or g_model is None:
        if method == "Big Model":
            # NLLB-200 requires several files to work with AutoTokenizer and AutoModel
            required_files = [
                'config.json',
                'pytorch_model.bin',
                'tokenizer_config.json',
                'sentencepiece.bpe.model',
                'special_tokens_map.json',
                'tokenizer.json'
            ]
            hf_repo = "facebook/nllb-200-distilled-600M"

            if not os.path.exists(translator_path):
                os.makedirs(translator_path)
                url = 'https://gitee.com/metercai/SimpleSDXL/releases/download/win64/nllb_200_distilled_600m.tar.gz'
                cached_file = os.path.join(translator_path, 'nllb_200_distilled_600m.tar.gz')
                try:
                    download(url, cached_file, progressbar=True)
                    with tarfile.open(cached_file, 'r:gz') as tarf:
                        tarf.extractall(translator_path)
                    os.remove(cached_file)
                except Exception as e:
                    logger.warning(f"Failed to download or extract from Gitee: {e}. Will try Hugging Face.")

            # Check and download each missing file from Hugging Face
            for file_name in required_files:
                file_path = os.path.join(translator_path, file_name)
                if not os.path.exists(file_path):
                    load_file_from_url(
                        url=f'https://huggingface.co/{hf_repo}/resolve/main/{file_name}',
                        model_dir=translator_path,
                        file_name=file_name)

            logger.info(f'load model form : {translator_path}')
            g_tokenizer = AutoTokenizer.from_pretrained(translator_path, src_lang="zho_Hans")
            g_model = AutoModelForSeq2SeqLM.from_pretrained(translator_path)
        else:
            # Opus-MT requires several files
            required_files = [
                'config.json',
                'pytorch_model.bin',
                'source.spm',
                'target.spm',
                'vocab.json',
                'tokenizer_config.json'
            ]
            hf_repo = "Helsinki-NLP/opus-mt-zh-en"

            if not os.path.exists(translator_slim_path):
                os.makedirs(translator_slim_path)
                url = 'https://gitee.com/metercai/SimpleSDXL/releases/download/win64/opus_mt_zh_en.tar.gz'
                cached_file = os.path.join(translator_slim_path, 'opus_mt_zh_en.tar.gz')
                try:
                    download(url, cached_file, progressbar=True)
                    with tarfile.open(cached_file, 'r:gz') as tarf:
                        tarf.extractall(translator_slim_path)
                    os.remove(cached_file)
                except Exception as e:
                    logger.warning(f"Failed to download or extract from Gitee: {e}. Will try Hugging Face.")

            # Check and download each missing file from Hugging Face
            for file_name in required_files:
                file_path = os.path.join(translator_slim_path, file_name)
                if not os.path.exists(file_path):
                    load_file_from_url(
                        url=f'https://huggingface.co/{hf_repo}/resolve/main/{file_name}',
                        model_dir=translator_slim_path,
                        file_name=file_name)

            logger.info(f'load slim model form : {translator_slim_path}')
            g_tokenizer = AutoTokenizer.from_pretrained(translator_slim_path)
            g_model = AutoModelForSeq2SeqLM.from_pretrained(translator_slim_path).eval()
        g_model_type = method
    return g_tokenizer, g_model

def free_translator_model():
    global g_tokenizer, g_model
    if 'g_tokenizer' in globals():
        del g_tokenizer
    if 'g_model' in globals():
        del g_model
    return

def toggle(text: str, method: str = 'Slim Model') -> str:
    if is_chinese(text):
        return convert(text, method)
    else:
        return convert(text, method, 'cn')


def convert(text: str, method: str = 'Slim Model', lang: str = 'en' ) -> str:
    global Q_alphabet, B_puncti

    start = time.perf_counter()

    if method == 'Third APIs':
        translated = translate2zh_apis(text) if lang == 'cn' else translate2en_apis(text)
        logger.info('Online translation completed in %.2fs (changed=%s)',
                    time.perf_counter() - start, translated != text)
        return translated

    if lang=='cn':
        tokenizer, model = init_or_load_translator_model(method)
        text_zh = translate2zh_model(model, tokenizer, text)
        ts_method = method
        stop = time.perf_counter()
        logger.info(f'Translate by "{ts_method}" in {(stop-start):.2f}s: "{text}" to "{text_zh}"')
        return text_zh
    is_chinese_ext = lambda x: (Q_alphabet + B_punct).find(x) < -1 
    #text = Q2B_number_punctuation(text)
    if is_chinese(text):
        tokenizer, model = init_or_load_translator_model(method)


        def T_ZH2EN(text_zh):
            if method=="Slim Model":
                encoded = tokenizer([text_zh], return_tensors="pt")
                sequences = model.generate(**encoded)
                return 'Slim Model', tokenizer.batch_decode(sequences, skip_special_tokens=True)[0]
            elif method=="Big Model":
                inputs = tokenizer(text_zh, return_tensors="pt")
                translated_tokens = model.generate(**inputs, forced_bos_token_id=tokenizer.convert_tokens_to_ids("eng_Latn"), max_length=60)
                return 'Big Model', tokenizer.batch_decode(translated_tokens, skip_special_tokens=True)[0].lower()


        text_eng = ""
        text_zh = ""
        for _char in iter(text):
            if is_chinese(_char):
                text_zh += _char
            else:
                if len(text_zh) > 0:
                    if is_chinese_ext(_char):
                        text_zh += _char
                        continue
                    else:
                        #text_zh = Q2B_alphabet(text_zh)
                        ts_methods, text_en=T_ZH2EN(text_zh)
                        text_eng += text_en  
                        text_zh = ""
                text_eng += _char
        if len(text_zh) > 0:
            ts_methods, text_en=T_ZH2EN(text_zh)
            text_eng += text_en
        text_eng = Q2B_number_punctuation(text_eng)
        text_eng = Q2B_alphabet(text_eng)
        stop = time.perf_counter()
        logger.info(f'Translate by "{ts_methods}" in {(stop-start):.2f}s: "{text}" to "{text_eng}"')
        return text_eng
    return text


