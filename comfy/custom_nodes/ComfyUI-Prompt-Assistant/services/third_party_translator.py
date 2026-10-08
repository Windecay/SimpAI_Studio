
import random
import logging
import re
import time
import asyncio
import warnings
from functools import lru_cache
from threading import RLock

# Suppress 'Unable to find server backend' warning from translators library
try:
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message=".*Unable to find server backend.*")
        import translators as ts
except Exception as exc:
    ts = None
    TRANSLATORS_IMPORT_ERROR = exc
else:
    TRANSLATORS_IMPORT_ERROR = None

from ..utils.common import ProgressBar, log_prepare, log_error, TASK_TRANSLATE, SOURCE_NODE

logger = logging.getLogger(__name__)
translator_org = ('alibaba', 'cloudTranslation', 'iflyrec', 'youdao', 'translateCom')
_translation_lock = RLock()
_REQUEST_TIMEOUT = 5.0
_RETRY_BUDGET = 20.0


@lru_cache(maxsize=128)
def _translate_cached(text, from_lang, to_lang):
    if from_lang == to_lang:
        return text
    if ts is None:
        raise RuntimeError(f'Third-party translation is unavailable: {TRANSLATORS_IMPORT_ERROR}')
    deadline = time.monotonic() + _RETRY_BUDGET
    failures = []
    for provider in translator_org:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            result = ts.translate_text(
                text, translator=provider, from_language=from_lang, to_language=to_lang,
                timeout=min(_REQUEST_TIMEOUT, remaining),
            )
            if not isinstance(result, str) or not result.strip() or result.strip() == text.strip():
                raise ValueError('Empty, invalid or unchanged translation')
            logger.info('Online translation succeeded: provider=%s direction=%s->%s',
                        provider, from_lang, to_lang)
            return result
        except Exception as exc:
            failures.append(f'{provider}: {type(exc).__name__}')
            logger.warning('Online translation failed: provider=%s direction=%s->%s error=%s: %s',
                           provider, from_lang, to_lang, type(exc).__name__, exc)
            logger.debug('Online translation exception', exc_info=True)
    # Raising, rather than returning the input, keeps failures out of the cache
    # and preserves the frontend/node success=False error contract.
    raise RuntimeError('No translation service succeeded: ' + '; '.join(failures))


def _translate(text, from_lang, to_lang):
    if not text:
        return text
    with _translation_lock:
        return _translate_cached(text, from_lang, to_lang)


def translate2zh_apis(text):
    return _translate(text, 'en', 'zh')


def translate2en_apis(text):
    return _translate(text, 'zh', 'en')

class ThirdPartyTranslateService:
    @staticmethod
    async def translate(text, from_lang='auto', to_lang='zh', request_id=None, cancel_event=None, task_type=None, source=None, **kwargs):
        """
        Use Third-party APIs for translation (extracted from enhanced/translator.py)
        """
        request_id = request_id or f"third_api_{int(time.time())}_{random.randint(1000, 9999)}"
        
        if not text or text.strip() == '':
            return {"success": False, "error": "Input text cannot be empty"}

        task_type = task_type or TASK_TRANSLATE
        
        pbar = ProgressBar(
            request_id=request_id,
            service_name="Third-party APIs",
            streaming=False,
            extra_info=f"Length:{len(text)}",
            task_type=task_type,
            source=source
        )

        try:
            loop = asyncio.get_running_loop()
            
            if cancel_event and cancel_event.is_set():
                return {"success": False, "error": "Task cancelled"}

            aliases = {'cn': 'zh', 'zh-cn': 'zh', 'zh-chs': 'zh', 'zh-hans': 'zh'}
            source_language = str(from_lang or 'auto').lower()
            target_language = str(to_lang or 'zh').lower()
            source_language = aliases.get(source_language, source_language)
            target_language = aliases.get(target_language, target_language)
            if target_language not in ('en', 'zh'):
                raise ValueError(f'Unsupported target language: {to_lang}')
            if source_language == 'auto' and re.search(r'[\u3400-\u9fff]', text):
                # Mixed prompts may still contain English to translate to Chinese.
                source_language = ('en' if target_language == 'zh' and re.search(r'[A-Za-z]', text)
                                   else 'zh')

            def do_translate():
                if cancel_event and cancel_event.is_set():
                    raise RuntimeError('Task cancelled')
                return _translate(text, source_language, target_language)

            start_time = time.perf_counter()
            
            translated_text = await loop.run_in_executor(
                None, 
                do_translate
            )
            
            if cancel_event and cancel_event.is_set():
                return {"success": False, "error": "Task cancelled"}

            return {
                "success": True, 
                "data": {
                    "translated": translated_text,
                    "from_lang": from_lang,
                    "to_lang": to_lang
                }
            }
            
        except Exception as e:
            log_error(task_type, request_id, str(e), source=source)
            return {"success": False, "error": str(e)}
