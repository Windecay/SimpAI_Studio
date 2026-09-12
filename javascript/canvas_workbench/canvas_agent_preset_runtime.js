(function () {
    'use strict';

    function createCanvasAgentPresetRuntimeController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const normalizePresetName = scope.normalizePresetName || ((value) => String(value || '').trim());
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const queueStorageKey = String(scope.presetQueueStorageKey || 'simpai.canvas.agentPresetQueues.v1');
        const defaultQueues = {
            t2i: Array.isArray(scope.defaultT2iPresetQueue) ? scope.defaultT2iPresetQueue : ['Z-imageT'],
            edit: Array.isArray(scope.defaultEditPresetQueue) ? scope.defaultEditPresetQueue : ['Flux2-KleinEdit', 'MiniMax-H3(R2I)'],
            i2v: Array.isArray(scope.defaultI2vPresetQueue) ? scope.defaultI2vPresetQueue : ['Wan(I2V)', 'MiniMax-H3(I2V)', 'MiniMax-H3(R2V)', 'Dasiwa(I2V)'],
            t2v: Array.isArray(scope.defaultT2vPresetQueue) ? scope.defaultT2vPresetQueue : ['Wan(T2V)', 'MiniMax-H3(T2V)', 'Wan-TTP'],
            video_edit: Array.isArray(scope.defaultVideoEditPresetQueue) ? scope.defaultVideoEditPresetQueue : ['Bernini-VideoEdit', 'Wan-Extent', 'Dasiwa-Extent'],
            reference_to_video: Array.isArray(scope.defaultReferenceToVideoPresetQueue) ? scope.defaultReferenceToVideoPresetQueue : ['MiniMax-H3(R2V)'],
            audio_to_video: Array.isArray(scope.defaultAudioToVideoPresetQueue) ? scope.defaultAudioToVideoPresetQueue : ['MiniMax-H3(R2V)', 'LTX(TA2V)', 'LTX(IA2V)'],
            audio_image_to_video: Array.isArray(scope.defaultAudioImageToVideoPresetQueue) ? scope.defaultAudioImageToVideoPresetQueue : ['MiniMax-H3(R2V)', 'LTX(IA2V)', 'LTX(TA2V)'],
            audio: Array.isArray(scope.defaultAudioPresetQueue) ? scope.defaultAudioPresetQueue : []
        };
        const statusCacheTtlMs = Math.max(0, Number(scope.presetStatusCacheTtlMs ?? 5 * 60 * 1000));
        const statusScanConcurrency = Math.max(1, Number(scope.presetStatusScanConcurrency || 4));
        const statusCache = new Map();
        let scanState = {
            state: 'idle',
            entries: [],
            checked: 0,
            total: 0,
            checkedAt: '',
            message: ''
        };

        function getPresetCatalog() {
            const catalog = call('getPresetCatalog', []);
            return Array.isArray(catalog) ? catalog : [];
        }

        function getCanvasAgentSettings() {
            const settings = call('getCanvasAgentSettings', {});
            return settings && typeof settings === 'object' ? settings : {};
        }

        function cloneRunValue(value, fallback) {
            if (typeof scope.cloneRunValue === 'function') return scope.cloneRunValue(value, fallback);
            try {
                return JSON.parse(JSON.stringify(value ?? fallback));
            } catch (err) {
                return fallback;
            }
        }

        function getStorage() {
            if (typeof scope.getStorage === 'function') return scope.getStorage();
            if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
            return null;
        }

        function nowIso() {
            const value = call('nowIso', '', ...[]);
            return String(value || new Date().toISOString());
        }

        function nextUid(prefix) {
            const value = call('uid', '', prefix);
            return String(value || `${prefix || 'id'}_${Date.now()}`);
        }

        function escapeHtml(value) {
            return call('escapeHtml', String(value ?? ''), value);
        }

        function canvasAgentPresetSearchText(entry) {
            const parts = [
                entry?.name,
                entry?.display_name,
                entry?.task_method,
                entry?.backend_engine,
                entry?.engine_type,
                entry?.schema?.theme_title,
                entry?.schema?.default_theme,
                entry?.default_engine?.backend_params?.task_method,
                entry?.default_engine?.backend_params?.backend_engine,
                entry?.default_engine?.scene_frontend?.theme_title
            ];
            return parts.filter(Boolean).join(' ').toLowerCase();
        }

        function isCanvasAgentNonUpscalePresetEntry(entry) {
            const text = canvasAgentPresetSearchText(entry);
            if (!text) return false;
            return /\bscail\b|motion[\s_-]*transfer|动作迁移/i.test(text);
        }

        function isCanvasAgentUpscalePresetEntry(entry) {
            if (isCanvasAgentNonUpscalePresetEntry(entry)) return false;
            const text = canvasAgentPresetSearchText(entry);
            if (!text) return false;
            return /(upscale|uov|super[\s_-]*resolution|esrgan|realesrgan|upscaler|ttp|sr\b|vsr\b|放大|超分|高清|高分辨率|无损放大)/i.test(text);
        }

        function findCanvasAgentPresetEntryByAlias(value) {
            const text = String(value || '').trim();
            if (!text) return null;
            return findPresetCatalogEntryByName(text)
                || getPresetCatalog().find(entry => canvasAgentPromptMentionsPreset(`使用 ${text}`, [entry.name, entry.display_name].filter(Boolean)))
                || null;
        }

        function canvasAgentUpscalePresetEntries(selectedEntry) {
            const settings = getCanvasAgentSettings();
            const rows = [];
            const add = (entry) => {
                const name = normalizePresetName(entry?.name || entry?.display_name || '');
                if (!entry || !name || rows.some(item => normalizePresetName(item.name || item.display_name || '') === name)) return;
                rows.push(entry);
            };
            add(findCanvasAgentPresetEntryByAlias(settings.upscalePreset));
            if (isCanvasAgentUpscalePresetEntry(selectedEntry)) add(selectedEntry);
            canvasAgentReadyPresetEntries().filter(isCanvasAgentUpscalePresetEntry).forEach(add);
            getPresetCatalog().filter(isCanvasAgentUpscalePresetEntry).forEach(add);
            if (!rows.length) add(selectedEntry);
            return rows;
        }

        function canvasAgentPreferredUpscalePresetEntry() {
            const settings = getCanvasAgentSettings();
            if (settings.upscalePresetMode === 'dedicated_preset' && settings.upscalePreset) {
                const configured = findCanvasAgentPresetEntryByAlias(settings.upscalePreset);
                if (configured) return configured;
            }
            return canvasAgentReadyPresetEntries().find(isCanvasAgentUpscalePresetEntry)
                || getPresetCatalog().find(isCanvasAgentUpscalePresetEntry)
                || null;
        }

        function canvasAgentVideoUpscalePresetEntries(selectedName) {
            const rows = [];
            const add = (entry) => {
                const name = normalizePresetName(entry?.name || entry?.display_name || '');
                if (!entry || !name || !isCanvasAgentUpscalePresetEntry(entry)) return;
                if (rows.some(item => normalizePresetName(item.name || item.display_name || '') === name)) return;
                rows.push(entry);
            };
            add(findCanvasAgentPresetEntryByAlias(selectedName));
            canvasAgentReadyPresetEntries().forEach(add);
            getPresetCatalog().forEach(add);
            return rows;
        }

        function canvasAgentPresetQueueConfig(kind) {
            const key = String(kind || 't2i').trim().toLowerCase().replace(/-/g, '_');
            if (key === 'edit' || key === 'image_edit') return { key: 'edit', setting: 'editPreset', fallback: defaultQueues.edit };
            if (key === 'i2v' || key === 'image_to_video') return { key: 'i2v', setting: 'i2vPreset', fallback: defaultQueues.i2v };
            if (key === 't2v' || key === 'text_to_video') return { key: 't2v', setting: 't2vPreset', fallback: defaultQueues.t2v };
            if (key === 'video' || key === 'video_edit' || key === 'edit_video') return { key: 'video_edit', setting: 'videoEditPreset', fallback: defaultQueues.video_edit };
            if (key === 'reference_to_video' || key === 'video_audio_to_video' || key === 'r2v') return { key: 'reference_to_video', setting: 'i2vPreset', fallback: defaultQueues.reference_to_video };
            if (key === 'audio_to_video' || key === 'ta2v') return { key: 'audio_to_video', setting: 'audioToVideoPreset', fallback: defaultQueues.audio_to_video };
            if (key === 'audio_image_to_video' || key === 'ia2v') return { key: 'audio_image_to_video', setting: 'audioImageToVideoPreset', fallback: defaultQueues.audio_image_to_video };
            if (key === 'audio' || key === 'audio_edit' || key === 'audio_generate') return { key: 'audio', setting: 'audioPreset', fallback: defaultQueues.audio };
            return { key: 't2i', setting: 't2iPreset', fallback: defaultQueues.t2i };
        }

        function getCanvasAgentPresetQueue(kind) {
            const config = canvasAgentPresetQueueConfig(kind);
            const fallback = config.fallback || defaultQueues.t2i;
            const settings = getCanvasAgentSettings();
            const preferred = normalizePresetName(settings[config.setting] || '');
            try {
                const storage = getStorage();
                const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(queueStorageKey) : '{}';
                const stored = JSON.parse(raw || '{}');
                const values = Array.isArray(stored?.[config.key]) ? stored[config.key] : fallback;
                const queue = values.map(item => normalizePresetName(item)).filter(Boolean);
                if (preferred) queue.unshift(preferred);
                return Array.from(new Set(queue));
            } catch (err) {
                const queue = fallback.map(item => normalizePresetName(item)).filter(Boolean);
                if (preferred) queue.unshift(preferred);
                return Array.from(new Set(queue));
            }
        }

        function canvasAgentPresetMatchTokens(value) {
            const clean = normalizePresetName(value || '').toLowerCase();
            const compact = clean.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '');
            const tokens = [clean, compact].filter(Boolean);
            clean.split(/[^a-z0-9\u4e00-\u9fff]+/gi).forEach(part => {
                if (part && part.length >= 3) tokens.push(part);
            });
            if (compact.endsWith('t') && compact.length > 3) tokens.push(compact.slice(0, -1));
            if (compact.includes('image')) tokens.push(compact.replace(/image/g, 'img'));
            if (compact.includes('img')) tokens.push(compact.replace(/img/g, 'image'));
            return Array.from(new Set(tokens.filter(item => item.length >= 3)));
        }

        function canvasAgentInstructionAliasPresetNames(prompt) {
            const text = String(prompt || '').toLowerCase();
            if (!text || !/(?:preset|scene|模型|预设|使用|用|采用|指定|选择|run|运行|生成)/i.test(text)) return [];
            const compact = text.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '');
            const aliases = [];
            const add = (names) => {
                (names || []).forEach(name => {
                    if (name && !aliases.includes(name)) aliases.push(name);
                });
            };
            const hasCompactAlias = (...needles) => needles.some(needle => compact.includes(needle));
            const hasLooseAlias = (pattern, compactNeedles, names) => {
                if (pattern.test(text) || hasCompactAlias(...(compactNeedles || []))) add(names);
            };
            hasLooseAlias(
                /(?:^|[\s,，。:：;；/])(?:preset|模型|预设|用|使用|采用|指定|选择)?\s*(?:z|zt|zit|zimage|z-image)(?:$|[\s,，。:：;；/])/i,
                ['用z', '使用z', '采用z', '指定z', '选择z', '模型z', '预设z', 'presetz', '生成zimage', '用zimage'],
                ['Z-imageT', 'Z-TTP']
            );
            hasLooseAlias(
                /\b(?:krea|krea2)\b/i,
                ['用krea', '使用krea', '采用krea', '指定krea', '选择krea', '模型krea', '预设krea'],
                ['Krea2-Turbo']
            );
            hasLooseAlias(
                /\bklein\b/i,
                ['用klein', '使用klein', '采用klein', '指定klein', '选择klein', '模型klein', '预设klein'],
                ['Flux2-Klein', 'Flux2-KleinEdit', 'Flux2-KleinPose']
            );
            hasLooseAlias(
                /\bflux(?:1|2)?\b/i,
                ['用flux', '使用flux', '采用flux', '指定flux', '选择flux', '模型flux', '预设flux'],
                ['Flux1-dev', 'Flux2-Klein', 'Flux2-KleinEdit']
            );
            hasLooseAlias(
                /\bwan\b/i,
                ['用wan', '使用wan', '采用wan', '指定wan', '选择wan', '模型wan', '预设wan'],
                ['Wan(T2I)', 'Wan(T2V)', 'Wan(I2V)', 'Wan-Swap', 'Wan-Animate']
            );
            hasLooseAlias(
                /\bbernini\b/i,
                ['用bernini', '使用bernini', '采用bernini', '指定bernini', '选择bernini', '模型bernini', '预设bernini'],
                ['Bernini-ImageEdit', 'Bernini-MultiI2V', 'Bernini-VideoEdit']
            );
            hasLooseAlias(
                /\banima\b/i,
                ['用anima', '使用anima', '采用anima', '指定anima', '选择anima', '模型anima', '预设anima'],
                ['Anima']
            );
            return aliases;
        }

        function canvasAgentPromptMentionsPreset(prompt, names) {
            const text = String(prompt || '').toLowerCase();
            const compactText = text.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '');
            const hasIntent = /(?:preset|scene|模型|预设|使用|用|采用|指定|run|运行|生成)/i.test(text);
            if (!hasIntent) return false;
            return (names || []).some(name => {
                const tokens = canvasAgentPresetMatchTokens(name);
                return tokens.some(token => text.includes(token) || compactText.includes(token));
            });
        }

        function findCanvasAgentPresetInstructionOverride(prompt) {
            const settings = getCanvasAgentSettings();
            if (!settings.allowPresetInstructionOverride) return null;
            if (!String(prompt || '').trim()) return null;
            const aliasEntry = canvasAgentInstructionAliasPresetNames(prompt)
                .map(name => findPresetCatalogEntryByName(name))
                .find(Boolean);
            if (aliasEntry) return aliasEntry;
            const entries = getPresetCatalog()
                .map(entry => ({
                    entry,
                    names: [entry.name, entry.display_name].map(normalizePresetName).filter(Boolean)
                }))
                .filter(item => item.names.length)
                .sort((a, b) => Math.max(...b.names.map(name => name.length)) - Math.max(...a.names.map(name => name.length)));
            return entries.find(item => canvasAgentPromptMentionsPreset(prompt, item.names))?.entry || null;
        }

        function findPresetCatalogEntryByName(name) {
            const wanted = normalizePresetName(name);
            if (!wanted) return null;
            const catalog = getPresetCatalog();
            return catalog.find(entry => normalizePresetName(entry.name || entry.display_name || '') === wanted)
                || catalog.find(entry => normalizePresetName(entry.display_name || entry.name || '') === wanted)
                || null;
        }

        function createCanvasAgentPresetProbeNode(entry, options) {
            const opts = options || {};
            const cleanName = normalizePresetName(entry?.name || entry?.display_name || '');
            const sharedProbe = call('apiBuildPresetRunNode', null, entry, {
                id: `agent_probe_${cleanName || 'preset'}`,
                sceneTheme: opts.sceneTheme,
                prompt: ''
            });
            if (sharedProbe) return sharedProbe;
            const isScene = !!entry?.scene || !!(entry?.schema && typeof entry.schema === 'object' && entry.schema.scene_frontend);
            const defaultEngine = entry?.default_engine && typeof entry.default_engine === 'object' ? entry.default_engine : {};
            const backendParams = defaultEngine.backend_params && typeof defaultEngine.backend_params === 'object' ? defaultEngine.backend_params : {};
            const schema = entry?.schema && typeof entry.schema === 'object' ? cloneRunValue(entry.schema, {}) : {};
            const themes = Array.isArray(schema.themes) ? schema.themes : [];
            const sceneTheme = opts.sceneTheme && themes.includes(opts.sceneTheme)
                ? opts.sceneTheme
                : (schema.default_theme || themes[0] || '');
            const themeInfo = schema.per_theme && typeof schema.per_theme === 'object' ? (schema.per_theme[sceneTheme] || {}) : {};
            return {
                id: `agent_probe_${cleanName || 'preset'}`,
                type: isScene ? 'preset' : 'classic',
                title: entry?.display_name || cleanName,
                preset: {
                    name: cleanName,
                    display_name: entry?.display_name || cleanName
                },
                runtime: {
                    backend_engine: entry?.backend_engine || backendParams.backend_engine || 'Current',
                    engine_type: entry?.engine_type || 'image',
                    scene_frontend: isScene ? 'scene' : '',
                    scene_theme: sceneTheme,
                    task_method: themeInfo.task_method || entry?.task_method || backendParams.task_method || ''
                },
                schema,
                params: { prompt: '' },
                upload_slots: {},
                models_config: { mode: 'preset_default', defaults: entry?.models_config || {}, overrides: {} },
                resolution_config: { mode: 'preset_default', defaults: entry?.resolution_config || {}, overrides: {} },
                generation_config: { mode: 'preset_default', defaults: entry?.generation_config || {}, overrides: {} },
                model_requirements: {
                    model_list: Array.isArray(entry?.model_list) ? cloneRunValue(entry.model_list, []) : [],
                    has_model_probe: !!entry?.has_model_probe,
                    source: entry?.source || ''
                },
                classic_mode: 't2i',
                classic_ip_count: 1
            };
        }

        function canvasAgentPresetStatusCacheKey(entry) {
            return [
                normalizePresetName(entry?.name || entry?.display_name || ''),
                entry?.task_method || '',
                entry?.backend_engine || '',
                Array.isArray(entry?.model_list) ? entry.model_list.join('|') : ''
            ].join('::');
        }

        async function getCanvasAgentPresetStatus(entry, options) {
            const opts = options || {};
            const key = canvasAgentPresetStatusCacheKey(entry);
            const now = Date.now();
            const cached = key ? statusCache.get(key) : null;
            if (!opts.force && cached && (now - cached.at) < statusCacheTtlMs) return cached.status;
            const probe = createCanvasAgentPresetProbeNode(entry);
            let status = null;
            try {
                status = await call('sendCanvasPresetModelStatusRequest', null, probe);
            } catch (err) {
                status = { ok: false, error: err?.message || String(err) };
            }
            if (key) statusCache.set(key, { at: now, status });
            return status;
        }

        function canvasAgentReadyPresetEntries() {
            return Array.isArray(scanState.entries) ? scanState.entries : [];
        }

        function getCanvasAgentPresetScanState() {
            return scanState;
        }

        function canvasAgentPresetOptionHtml(selectedName, options) {
            const opts = options || {};
            const entries = Array.isArray(opts.entries) ? opts.entries : canvasAgentReadyPresetEntries();
            if (!entries.length) {
                return `<option value="">${escapeHtml(t('Refresh ready presets first', '请先刷新可用 preset'))}</option>`;
            }
            const selected = normalizePresetName(selectedName || '');
            const hasSelected = entries.some(item => normalizePresetName(item.name) === selected);
            return [
                `<option value="">${escapeHtml(t('Choose ready preset', '选择可用 preset'))}</option>`,
                ...entries.map(item => {
                    const name = normalizePresetName(item.name || item.display_name || '');
                    const label = item.display_name || name;
                    return `<option value="${escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                }),
                selected && !hasSelected ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(t('{preset} (not in ready list)', '{preset}（不在 ready 列表）').replace('{preset}', selected))}</option>` : ''
            ].join('');
        }

        function canvasAgentPresetAliasTokensForEntry(entry) {
            const name = normalizePresetName(entry?.name || entry?.display_name || '').toLowerCase();
            const aliases = [];
            const add = (...values) => values.forEach(value => {
                if (value && !aliases.includes(value)) aliases.push(value);
            });
            if (/(^|[^a-z0-9])z(?:-|_|\b)|zimage|z-ttp|ztp/i.test(name)) add('z', 'zt', 'zit', 'zimage', 'z-image');
            if (name.includes('krea')) add('krea', 'krea2');
            if (name.includes('klein')) add('klein');
            if (name.includes('flux')) add('flux', 'flux1', 'flux2');
            if (name.includes('wan')) add('wan');
            if (name.includes('bernini')) add('bernini');
            if (name.includes('anima')) add('anima');
            return aliases;
        }

        async function refreshCanvasAgentAvailablePresets(options) {
            if (scanState.state === 'checking') return;
            const opts = options || {};
            const catalog = getPresetCatalog().filter(entry => !entry.missing);
            const scanToken = nextUid('agent_preset_scan');
            scanState = {
                state: 'checking',
                entries: [],
                checked: 0,
                total: catalog.length,
                checkedAt: '',
                scanToken,
                message: opts.force
                    ? t('Checking preset model files...', '正在检查 preset 模型文件...')
                    : t('Checking preset model files with cache...', '正在使用缓存检查 preset 模型文件...')
            };
            call('renderCanvasSettingsPanel', null);
            let nextIndex = 0;
            let lastRenderAt = 0;
            const maybeRenderProgress = () => {
                const now = Date.now();
                if (scanState.checked === scanState.total || now - lastRenderAt > 180) {
                    lastRenderAt = now;
                    call('renderCanvasSettingsPanel', null);
                }
            };
            const worker = async () => {
                while (nextIndex < catalog.length && scanState.scanToken === scanToken) {
                    const index = nextIndex++;
                    const entry = catalog[index];
                    const status = await getCanvasAgentPresetStatus(entry, { force: opts.force });
                    if (scanState.scanToken !== scanToken) return;
                    scanState.checked += 1;
                    if (status?.ok && status.ready) {
                        scanState.entries.push({
                            index,
                            name: normalizePresetName(entry.name || entry.display_name || ''),
                            display_name: entry.display_name || entry.name || '',
                            task_method: entry.task_method || '',
                            status
                        });
                    }
                    maybeRenderProgress();
                }
            };
            const concurrency = Math.max(1, Math.min(statusScanConcurrency, catalog.length || 1));
            await Promise.all(Array.from({ length: concurrency }, () => worker()));
            if (scanState.scanToken !== scanToken) return;
            scanState.entries.sort((a, b) => (a.index || 0) - (b.index || 0));
            scanState.state = 'ready';
            scanState.checkedAt = nowIso();
            scanState.message = t('{count} ready preset(s) found.', '已找到 {count} 个可用 preset。').replace('{count}', scanState.entries.length);
            call('renderCanvasSettingsPanel', null);
        }

        function canvasAgentPresetDefaultPromptForTheme(entry, theme, fallback) {
            if (!entry) return fallback || '';
            const promptSource = theme ? createCanvasAgentPresetProbeNode(entry, { sceneTheme: theme }) : entry;
            return typeof scope.canvasAgentPresetDefaultPrompt === 'function'
                ? (scope.canvasAgentPresetDefaultPrompt(promptSource, fallback) || '')
                : (fallback || '');
        }

        return {
            canvasAgentPresetSearchText,
            isCanvasAgentUpscalePresetEntry,
            isCanvasAgentNonUpscalePresetEntry,
            canvasAgentUpscalePresetEntries,
            canvasAgentPreferredUpscalePresetEntry,
            canvasAgentVideoUpscalePresetEntries,
            canvasAgentPresetQueueConfig,
            getCanvasAgentPresetQueue,
            canvasAgentPresetMatchTokens,
            canvasAgentInstructionAliasPresetNames,
            canvasAgentPromptMentionsPreset,
            findCanvasAgentPresetEntryByAlias,
            findCanvasAgentPresetInstructionOverride,
            findPresetCatalogEntryByName,
            createCanvasAgentPresetProbeNode,
            canvasAgentPresetStatusCacheKey,
            getCanvasAgentPresetStatus,
            canvasAgentReadyPresetEntries,
            getCanvasAgentPresetScanState,
            canvasAgentPresetOptionHtml,
            canvasAgentPresetAliasTokensForEntry,
            refreshCanvasAgentAvailablePresets,
            canvasAgentPresetDefaultPromptForTheme
        };
    }

    window.SimpAICanvasWorkbenchAgentPresetRuntime = Object.assign({}, window.SimpAICanvasWorkbenchAgentPresetRuntime || {}, {
        createCanvasAgentPresetRuntimeController
    });
})();
