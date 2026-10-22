(function () {
    'use strict';

    function createCanvasTranslationController(context) {
        const scope = context?.translationSource || context || {};
        const requestSource = scope.requestSource || {};
        const timingSource = scope.timingSource || {};
        const timeSource = scope.timeSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const currentTime = () => {
            const value = Number(call(timeSource, 'now', NaN));
            return Number.isFinite(value) ? value : NaN;
        };
        const wait = (delayMs) => new Promise((resolve) => {
            timingSource.setTimeout(resolve, delayMs);
        });

        async function requestTranslation(text, options) {
            const current = () => typeof options?.shouldContinue !== 'function' || options.shouldContinue();
            if (!current()) return { ok: false, stale: true };
            const start = await call(requestSource, 'sendCanvasTranslateRunRequest', null, {
                text,
                direction: options?.direction || 'toggle',
                method: options?.method || ''
            });
            if (!current()) return { ok: false, stale: true };
            if (!start?.ok || !start.job_id) return start || { ok: false, error: 'translate request failed' };
            const startedAt = currentTime();
            if (!Number.isFinite(startedAt) || typeof timingSource.setTimeout !== 'function') {
                return { ok: false, error: 'translate timing unavailable', job_id: start.job_id };
            }
            const deadline = startedAt + 120000;
            while (currentTime() < deadline) {
                await wait(650);
                if (!current()) return { ok: false, stale: true };
                const result = await call(requestSource, 'sendCanvasTranslatePollRequest', null, start.job_id);
                if (!current()) return { ok: false, stale: true };
                if (!result?.ok && result?.state !== 'failed') return result || { ok: false, error: 'translate poll failed' };
                if (result.state === 'finished') return result;
                if (result.state === 'failed') return result;
            }
            return { ok: false, error: 'translate timeout', job_id: start.job_id };
        }



        const runtimeSource = scope.runtimeSource || {};
        const runtimeCall = (name, ...args) => call(runtimeSource, name, undefined, ...args);
        const operations = new WeakMap();
        function beginOperation(node, key) {
            const project = runtimeCall('getProject');
            const current = operations.get(node) || new Map();
            const operation = {};
            current.set(key, operation);
            operations.set(node, current);
            return (allowLocked = false) => current.get(key) === operation
                && (typeof runtimeSource.getProject !== 'function' || runtimeCall('getProject') === project)
                && (typeof runtimeSource.getNode !== 'function' || runtimeCall('getNode', node.id) === node)
                && (allowLocked || !runtimeCall('isNodeLocked', node));
        }
        const languageSource = scope.languageSource || {};
        const t = (en, cn) => call(languageSource, 't', cn || en, en, cn, call(languageSource, 'getLanguageState', {}));

        function getTranslateCacheKey(target, key) {
            return `${target || 'text'}:${key || ''}`;
        }

        function getTranslationCacheBucket(node, target, key) {
            const bucket = node?.translation_cache?.[getTranslateCacheKey(target, key)];
            if (!bucket) return null;
            if (Array.isArray(bucket.entries)) return bucket;
            if (bucket.before || bucket.after) return { entries: [bucket] };
            return null;
        }

        function getTranslationCacheEntry(node, target, key, text) {
            const entries = getTranslationCacheBucket(node, target, key)?.entries || [];
            return entries.find(entry => entry && (entry.before === text || entry.after === text)) || null;
        }

        function getTranslationFieldState(node, target, key, value) {
            const text = String(value || '');
            const entry = getTranslationCacheEntry(node, target, key, text);
            if (!entry) return 'idle';
            return entry.after === text ? 'translated' : 'original';
        }

        function rememberTranslation(node, target, key, entry) {
            if (!node || !entry) return;
            const cacheKey = getTranslateCacheKey(target, key);
            const entries = getTranslationCacheBucket(node, target, key)?.entries?.slice() || [];
            const existingIndex = entries.findIndex(item => item && item.before === entry.before);
            if (existingIndex >= 0) entries.splice(existingIndex, 1);
            entries.unshift(entry);
            Object.assign(node, runtimeCall('buildTranslationStatePatch', node, {
                translationCachePatch: {
                    [cacheKey]: {
                        entries: entries.slice(0, 24),
                        updated_at: runtimeCall('nowIso')
                    }
                }
            }) || {});
        }

        function setTranslatedFieldValue(node, target, key, value, field) {
            if (!node) return false;
            if (target === 'node-param') runtimeCall('updateNodeParam', node.id, key, value, 'textarea');
            else if (target === 'vlm-param') runtimeCall('updateVlmParam', node.id, key || 'prompt', value, 'textarea');
            else runtimeCall('updateTextNodeValue', node.id, value);
            if (field) field.value = value;
            return true;
        }

        function bindInspectorTranslateEvents(inspector) {
            if (!inspector?.querySelectorAll) return false;
            const node = runtimeCall('getNode', runtimeCall('getSelectedNodeId'));
            const project = runtimeCall('getProject');
            inspector.querySelectorAll('[data-translate-action]').forEach((button) => {
                button.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    if (node && runtimeCall('getSelectedNodeId') === node.id
                        && runtimeCall('getNode', node.id) === node
                        && runtimeCall('getProject') === project) handleTranslateButton(node, button);
                });
            });
            return true;
        }

        async function runTranslationNode(node) {
            if (!node || node.type !== 'translation' || runtimeCall('isNodeLocked', node)) return { ok: false, error: 'translation node is unavailable' };
            const source = runtimeCall('getTextNodeInputSource', node);
            const inputText = String(source ? runtimeCall('getNodeTextOutput', source) : (node.input_text || ''));
            const text = inputText.trim();
            if (!text) {
                const message = t('Translation node has no input text.', '翻译节点没有输入文本。');
                runtimeCall('showToast', message);
                return { ok: false, error: message };
            }
            const direction = node.params?.direction || 'toggle';
            const method = node.params?.method || '';
            const sourceVersion = [source?.text?.updated_at, source?.producer?.run_id, source?.producer?.run_token];
            const ownsOperation = beginOperation(node, 'run');
            const owns = () => ownsOperation()
                && runtimeCall('getTextNodeInputSource', node) === source
                && String(source ? runtimeCall('getNodeTextOutput', source) : (node.input_text || '')) === inputText
                && [source?.text?.updated_at, source?.producer?.run_id, source?.producer?.run_token]
                    .every((value, index) => value === sourceVersion[index])
                && (node.params?.direction || 'toggle') === direction && (node.params?.method || '') === method;
            if (!owns()) return { ok: false, stale: true };
            runtimeCall('pushHistoryBatch', 'translation:' + node.id + ':run', 'Run translation node');
            Object.assign(node, runtimeCall('buildTranslationStatePatch', node, {
                status: runtimeCall('buildTranslationStatus', 'running', t('Translating...', '正在翻译...'))
            }) || {});
            const runningStatus = node.status;
            runtimeCall('mutate');
            try {
                const result = await requestTranslation(text, { direction, method, shouldContinue: owns });
                if (!owns()) return { ok: false, stale: true };
                if (!result?.ok || result.state === 'failed') {
                    Object.assign(node, runtimeCall('buildTranslationStatePatch', node, {
                        status: runtimeCall('buildTranslationStatus', 'failed', result?.details || result?.error || t('Translation failed.', '翻译失败。'))
                    }) || {});
                    runtimeCall('showToast', t('Translation failed: {error}', '翻译失败：{error}').replace('{error}', node.status.message));
                    runtimeCall('mutate');
                    return { ok: false, error: node.status.message };
                }
                const translated = String(result.translated_text || '').trim();
                const translatedAt = runtimeCall('nowIso');
                Object.assign(node, runtimeCall('buildTranslationStatePatch', node, {
                    textPatch: { value: translated, updated_at: translatedAt },
                    status: runtimeCall('buildTranslationStatus', 'finished', t(
                        'Translated' + (result.method ? ' with ' + result.method : '') + '.',
                        '已翻译' + (result.method ? '（' + result.method + '）' : '') + '。'
                    ))
                }) || {});
                rememberTranslation(node, 'text-value', '', {
                    before: text, after: translated, method: result.method || '',
                    direction: result.direction || node.params?.direction || 'toggle', translated_at: translatedAt
                });
                runtimeCall('mutate');
                return { ok: true, text: translated };
            } catch (err) {
                if (!owns()) return { ok: false, stale: true };
                Object.assign(node, runtimeCall('buildTranslationStatePatch', node, {
                    status: runtimeCall('buildTranslationStatus', 'failed', err?.message || String(err))
                }) || {});
                runtimeCall('showToast', t('Translation failed: {error}', '翻译失败：{error}').replace('{error}', node.status.message));
                runtimeCall('mutate');
                return { ok: false, error: node.status.message };
            } finally {
                if (ownsOperation(true) && node.status === runningStatus && node.status?.state === 'running') {
                    Object.assign(node, runtimeCall('buildTranslationStatePatch', node, {
                        status: runtimeCall('buildTranslationStatus', 'idle', '')
                    }) || {});
                    runtimeCall('mutate');
                }
            }
        }

        function handleTranslateClick(node, evt) {
            if (!evt?.target) return false;
            const button = evt.target.closest('[data-translate-action]');
            if (!button) return false;
            evt.preventDefault();
            evt.stopPropagation();
            handleTranslateButton(node, button);
            return true;
        }

        async function handleTranslateButton(node, button) {
            if (!node || !button || button.disabled || runtimeCall('isNodeLocked', node)) return;
            const wrap = button.closest('.sai-translate-wrap');
            const field = wrap ? wrap.querySelector('textarea') : null;
            if (!field || field.readOnly || field.disabled) return;
            const target = button.getAttribute('data-translate-target') || 'text-value';
            const key = button.getAttribute('data-translate-key') || '';
            const text = String(field.value || '');
            if (!text.trim()) {
                runtimeCall('showToast', t('No text to translate.', '没有可翻译的文本'));
                return;
            }
            const cacheKey = getTranslateCacheKey(target, key);
            const storedValue = () => target === 'node-param' || target === 'vlm-param'
                ? node.params?.[key || (target === 'vlm-param' ? 'prompt' : '')] : node.text?.value;
            const originalValue = storedValue();
            const ownsOperation = beginOperation(node, cacheKey);
            let edited = false;
            const invalidate = () => { edited = true; };
            const owns = () => ownsOperation() && !edited
                && String(field.value || '') === text && storedValue() === originalValue
                && field.isConnected !== false && button.isConnected !== false
                && !field.readOnly && !field.disabled;
            if (!owns()) return;
            const cached = getTranslationCacheEntry(node, target, key, text);
            if (cached && text === cached.after) {
                runtimeCall('pushHistoryBatch', 'translate:' + node.id + ':' + cacheKey, 'Restore source text');
                setTranslatedFieldValue(node, target, key, cached.before || '', field);
                runtimeCall('showToast', t('Restored source text', '已恢复原文'));
                runtimeCall('renderAll', { inspector: false });
                return;
            }
            if (cached && text === cached.before) {
                runtimeCall('pushHistoryBatch', 'translate:' + node.id + ':' + cacheKey, 'Apply cached translation');
                setTranslatedFieldValue(node, target, key, cached.after || '', field);
                runtimeCall('showToast', t(
                    'Applied cached translation' + (cached.method ? ' (' + cached.method + ')' : ''),
                    '已应用缓存的翻译' + (cached.method ? '（' + cached.method + '）' : '')
                ));
                runtimeCall('renderAll', { inspector: false });
                return;
            }
            const cache = getTranslationCacheBucket(node, target, key)?.entries?.find(entry => entry && (entry.before === text || entry.after === text));
            if (cache && text === cache.after) {
                runtimeCall('pushHistoryBatch', 'translate:' + node.id + ':' + cacheKey, 'Restore translated text');
                setTranslatedFieldValue(node, target, key, cache.before || '', field);
                runtimeCall('showToast', t('Restored pre-translation text.', '已回退到翻译前文本'));
                runtimeCall('renderAll', { inspector: false });
                return;
            }
            button.disabled = true;
            button.classList.add('is-busy');
            field.addEventListener?.('input', invalidate);
            field.addEventListener?.('change', invalidate);
            try {
                const result = await requestTranslation(text, { direction: 'toggle', shouldContinue: owns });
                if (!owns()) return;
                if (!result?.ok || result.state === 'failed') {
                    runtimeCall('showToast', t('Translation failed: {error}', '翻译失败：{error}').replace('{error}', result?.details || result?.error || 'unknown error'));
                    return;
                }
                const translated = String(result.translated_text || '').trim();
                if (!translated) {
                    runtimeCall('showToast', t('Translation result is empty.', '翻译结果为空'));
                    return;
                }
                runtimeCall('pushHistoryBatch', 'translate:' + node.id + ':' + cacheKey, 'Translate text');
                rememberTranslation(node, target, key, {
                    before: text, after: translated, method: result.method || '',
                    direction: result.direction || 'toggle', translated_at: runtimeCall('nowIso')
                });
                setTranslatedFieldValue(node, target, key, translated, field);
                runtimeCall('showToast', t('Translated and replaced{method}', '已翻译并替换{method}').replace('{method}', result.method ? ' (' + result.method + ')' : ''));
                runtimeCall('renderAll', { inspector: false });
            } catch (err) {
                if (owns()) runtimeCall('showToast', t('Translation failed: {error}', '翻译失败：{error}').replace('{error}', err?.message || String(err)));
            } finally {
                field.removeEventListener?.('input', invalidate);
                field.removeEventListener?.('change', invalidate);
                button.disabled = false;
                button.classList.remove('is-busy');
            }
        }

        return {
            requestTranslation,
            runTranslationNode,
            handleTranslateButton,
            handleTranslateClick,
            bindInspectorTranslateEvents,
            getTranslateCacheKey,
            getTranslationCacheBucket,
            getTranslationCacheEntry,
            getTranslationFieldState,
            rememberTranslation,
            setTranslatedFieldValue
        };
    }

    window.SimpAICanvasWorkbenchTranslation = Object.assign(
        {},
        window.SimpAICanvasWorkbenchTranslation || {},
        { createCanvasTranslationController }
    );
})();
