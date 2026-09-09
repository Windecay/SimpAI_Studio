(function () {
    'use strict';

    function createCanvasAgentDecisionController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const normalizePresetName = scope.normalizePresetName || ((value) => String(value || '').trim());

        function call(name, fallback, ...args) {
            return typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        }

        function canvasAgentPresetDecisionOptions(selectedEntry, options) {
            const opts = options || {};
            const selectedName = normalizePresetName(selectedEntry?.name || selectedEntry?.display_name || '');
            const rows = [];
            const add = (name, label) => {
                const clean = normalizePresetName(name || label || '');
                if (!clean || rows.some(item => item.value === clean)) return;
                rows.push({ value: clean, label: label || clean });
            };
            if (!opts.task || canvasAgentPresetSupportsTask(selectedEntry, opts.task)) {
                add(selectedName, selectedEntry?.display_name || selectedEntry?.name || selectedName);
            }
            const catalog = call('getPresetCatalog', []);
            const readyEntries = call('getReadyPresetEntries', []);
            const entries = Array.isArray(opts.entries) ? opts.entries
                : (opts.task
                    ? (Array.isArray(catalog) ? catalog : []).filter(entry => canvasAgentPresetSupportsTask(entry, opts.task))
                    : (Array.isArray(readyEntries) ? readyEntries : []));
            entries.forEach(entry => add(entry.name || entry.display_name, entry.display_name || entry.name));
            if (!rows.length && selectedName && !opts.task) add(selectedName, selectedName);
            return rows;
        }

        function canvasAgentPresetImageCapacity(entry) {
            const declared = Number(entry?.media_capability?.max_images ?? entry?.schema?.director_capability?.max_images);
            if (Number.isFinite(declared)) return Math.max(0, Math.round(declared));
            const probe = call('createCanvasAgentPresetProbeNode', null, entry);
            const slots = call('canvasAgentUploadSlotsForNode', [], probe);
            return (Array.isArray(slots) ? slots : [])
                .filter(slot => call('getUploadSlotMediaKind', '', slot?.key) === 'image')
                .length;
        }

        function canvasAgentPresetMediaCapacity(entry, kind) {
            if (kind === 'image') return canvasAgentPresetImageCapacity(entry);
            const plural = kind === 'video' ? 'videos' : 'audios';
            const declared = Number(entry?.media_capability?.[`max_${plural}`] ?? entry?.schema?.director_capability?.[`max_${plural}`]);
            if (Number.isFinite(declared)) return Math.max(0, Math.round(declared));
            const probe = call('createCanvasAgentPresetProbeNode', null, entry);
            const slots = call('canvasAgentUploadSlotsForNode', [], probe);
            return (Array.isArray(slots) ? slots : [])
                .filter(slot => !call('isCanvasAgentMaskSlot', false, slot) && call('getUploadSlotMediaKind', '', slot?.key) === kind)
                .length;
        }

        function canvasAgentPresetSupportsTask(entry, task) {
            const requested = String(task || '').trim().toLowerCase().replace(/[- ]/g, '_');
            if (!requested) return true;
            const declared = Array.isArray(entry?.media_capability?.supported_tasks)
                ? entry.media_capability.supported_tasks
                : (Array.isArray(entry?.supported_tasks) ? entry.supported_tasks : []);
            if (!declared.length) return true;
            return declared.some(value => String(value || '').trim().toLowerCase().replace(/[- ]/g, '_') === requested);
        }

        function canvasAgentRequestedMediaCounts(options) {
            const opts = options || {};
            const source = opts.mediaCounts && typeof opts.mediaCounts === 'object' ? opts.mediaCounts : {};
            const read = (kind, legacyValue) => {
                const value = Number(source[kind] ?? source[`${kind}s`] ?? legacyValue ?? 0);
                return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
            };
            return {
                image: read('image', opts.imageCount),
                video: read('video', opts.videoCount),
                audio: read('audio', opts.audioCount)
            };
        }

        function canvasAgentPresetSupportsMediaRequest(entry, counts, task) {
            if (!entry) return false;
            const requested = counts && typeof counts === 'object' ? counts : {};
            return ['image', 'video', 'audio'].every(kind => (
                Math.max(0, Number(requested[kind]) || 0) <= canvasAgentPresetMediaCapacity(entry, kind)
            )) && canvasAgentPresetSupportsTask(entry, task);
        }

        function canvasAgentPresetMediaCapacityMessage(name, kind, requested, capacity) {
            const labels = {
                image: t('images', '张图片'),
                video: t('videos', '个视频'),
                audio: t('audio clips', '个音频')
            };
            return t(
                '{preset}: accepts {capacity} {kind}, but {requested} are attached',
                '{preset}：支持 {capacity}{kind}，当前挂载了 {requested}{kind}'
            )
                .replaceAll('{preset}', name)
                .replaceAll('{capacity}', String(capacity))
                .replaceAll('{requested}', String(requested))
                .replaceAll('{kind}', labels[kind] || kind);
        }

        async function chooseCanvasAgentPresetEntry(kind, options) {
            const opts = options || {};
            const settings = call('getCanvasAgentSettings', {}) || {};
            const queueConfig = call('canvasAgentPresetQueueConfig', {
                key: 't2i',
                setting: 't2iPreset',
                fallback: []
            }, kind);
            const preferred = normalizePresetName(settings[queueConfig.setting] || '');
            const queued = call('getCanvasAgentPresetQueue', [], kind);
            const queue = Array.isArray(queued)
                ? queued.slice()
                : [];
            const explicitOverride = call('findCanvasAgentPresetEntryByAlias', null, opts.presetName || opts.overridePreset || '');
            const overrideEntry = explicitOverride || call('findCanvasAgentPresetInstructionOverride', null, opts.prompt || '');
            const overrideName = normalizePresetName(overrideEntry?.name || overrideEntry?.display_name || '');
            if (overrideName && !queue.includes(overrideName)) {
                if (preferred && queue[0] === preferred) queue.splice(1, 0, overrideName);
                else queue.unshift(overrideName);
            }
            const uniqueQueue = Array.from(new Set(queue.filter(Boolean)));
            const checked = [];
            const requiredMediaCounts = canvasAgentRequestedMediaCounts(opts);
            const requiredImageCount = requiredMediaCounts.image;
            const requiredTask = String(opts.task || '').trim().toLowerCase().replace(/[- ]/g, '_');
            for (const name of uniqueQueue) {
                const entry = call('findPresetCatalogEntryByName', null, name);
                if (!entry) {
                    checked.push(`${name}: not in preset list`);
                    continue;
                }
                if (entry.missing) {
                    checked.push(`${name}: marked missing`);
                    continue;
                }
                if (requiredImageCount && canvasAgentPresetImageCapacity(entry) < requiredImageCount) {
                    checked.push(canvasAgentPresetMediaCapacityMessage(
                        name,
                        'image',
                        requiredImageCount,
                        canvasAgentPresetImageCapacity(entry)
                    ));
                    continue;
                }
                const incompatibleKind = ['video', 'audio'].find(mediaKind => (
                    requiredMediaCounts[mediaKind] > canvasAgentPresetMediaCapacity(entry, mediaKind)
                ));
                if (incompatibleKind) {
                    checked.push(canvasAgentPresetMediaCapacityMessage(
                        name,
                        incompatibleKind,
                        requiredMediaCounts[incompatibleKind],
                        canvasAgentPresetMediaCapacity(entry, incompatibleKind)
                    ));
                    continue;
                }
                if (requiredTask && !canvasAgentPresetSupportsTask(entry, requiredTask)) {
                    checked.push(t(
                        '{preset}: does not support {task}',
                        '{preset}：不支持 {task}'
                    ).replace('{preset}', name).replace('{task}', requiredTask));
                    continue;
                }
                const status = await call('getCanvasAgentPresetStatus', null, entry);
                if (status?.ok && status.ready) {
                    return {
                        entry,
                        status,
                        queue: uniqueQueue,
                        checked,
                        override: overrideEntry && normalizePresetName(entry.name || '') === normalizePresetName(overrideEntry.name || '')
                    };
                }
                checked.push(`${name}: ${status?.message || status?.error || 'not ready'}`);
            }
            const firstAvailable = uniqueQueue
                .map(name => call('findPresetCatalogEntryByName', null, name))
                .find(entry => canvasAgentPresetSupportsMediaRequest(entry, requiredMediaCounts, requiredTask));
            return { entry: firstAvailable || null, status: null, queue: uniqueQueue, checked, override: false };
        }

        async function canvasAgentPromptPreflight(prompt, target, purpose, options) {
            const opts = options || {};
            const defaults = opts.presetDefaults || call('canvasAgentPresetPromptDefaults', {}, opts.entry || opts.node || null);
            const payload = {
                prompt: String(prompt || '').trim(),
                action: opts.action || purpose || '',
                purpose: purpose || '',
                user_prompt: String(opts.userPrompt || opts.originalPrompt || opts.plan?.prompt || opts.plan?.original_prompt || opts.plan?.user_prompt || '').trim(),
                prompt_target: Object.assign({}, target || {}),
                preset_defaults: defaults,
                wildcard_preview: opts.wildcardPreview || null
            };
            if (typeof scope.promptPreflight === 'function') {
                try {
                    const response = await scope.promptPreflight(payload);
                    if (response?.ok) return response;
                } catch (err) {
                    console.warn('[SimpAI Canvas Agent] prompt preflight failed', err);
                }
            }
            const fallbackCheck = call('canvasAgentPromptValidationFact', null, prompt, target);
            return {
                ok: true,
                state: fallbackCheck ? 'warning' : 'pass',
                summary: fallbackCheck ? String(fallbackCheck.value || '') : 'Prompt preflight passed.',
                checks: fallbackCheck
                    ? [{ level: 'warning', code: 'local_check', message: fallbackCheck.value || '' }]
                    : [{ level: 'pass', code: 'local_check', message: 'Prompt is present.' }],
                matches: [],
                unmatched_terms: [],
                preset_defaults: defaults,
                prompt_target: target || {}
            };
        }

        function canvasAgentPromptPreflightFacts(preflight) {
            if (!preflight || preflight.ok === false) return [];
            const state = String(preflight.state || '').toLowerCase();
            const checks = Array.isArray(preflight.checks) ? preflight.checks : [];
            const facts = [
                { label: t('Preflight', 'Preflight 检查'), value: `${state || 'unknown'}: ${preflight.summary || ''}`.trim() }
            ];
            const blocking = checks.filter(item => item?.level === 'block').map(item => item.message || item.code).filter(Boolean);
            const warnings = checks.filter(item => item?.level === 'warning').map(item => item.message || item.code).filter(Boolean);
            if (blocking.length) facts.push({ label: t('Blocked by', '阻止原因'), value: blocking.slice(0, 2).join('; ') });
            if (warnings.length) facts.push({ label: t('Warnings', '警告'), value: warnings.slice(0, 2).join('; ') });
            const matches = Array.isArray(preflight.matches) ? preflight.matches : [];
            if (matches.length) {
                facts.push({ label: t('Danbooru tags', 'Danbooru 标签'), value: matches.slice(0, 8).map(item => item?.tag || '').filter(Boolean).join(', ') });
            }
            const characterResolution = preflight.character_resolution || {};
            const resolvedCharacters = Array.isArray(characterResolution.resolved) ? characterResolution.resolved : [];
            if (resolvedCharacters.length) {
                facts.push({ label: t('Character tags', 'Character tags'), value: resolvedCharacters.slice(0, 5).map(item => item?.tag || '').filter(Boolean).join(', ') });
            }
            const unknownCharacterTags = Array.isArray(preflight.unknown_character_tags) ? preflight.unknown_character_tags : [];
            if (unknownCharacterTags.length) facts.push({ label: t('Unknown character tags', 'Unknown character tags'), value: unknownCharacterTags.slice(0, 6).join(', ') });
            const unmatched = Array.isArray(preflight.unmatched_terms) ? preflight.unmatched_terms : [];
            if (unmatched.length) facts.push({ label: t('Unmatched terms', '未命中词'), value: unmatched.slice(0, 8).join(', ') });
            facts.push(...call('wildcardPreviewFacts', [], preflight.wildcard_preview));
            return facts.filter(item => item && item.value);
        }

        async function ensureCanvasAgentPromptPreflightAllows(prompt, target, purpose, options) {
            const opts = options || {};
            let currentPrompt = String(prompt || '').trim();
            let preflight = await canvasAgentPromptPreflight(currentPrompt, target, purpose, opts);
            if (String(preflight?.state || '') !== 'block') return { ok: true, prompt: currentPrompt, preflight };
            if (opts.autoStart) {
                return { ok: false, prompt: currentPrompt, preflight, error: preflight.summary || 'prompt preflight blocked' };
            }
            while (String(preflight?.state || '') === 'block') {
                const form = { prompt: currentPrompt };
                const choice = await call('askCanvasAgentDecision', 'cancel', {
                    title: t('Prompt preflight blocked', '提示词预检查已阻止'),
                    message: t('The final prompt does not match the target model format. Edit it, regenerate it, or cancel.', '最终提示词不符合目标模型格式。请编辑、重新生成或取消。'),
                    form,
                    fields: [canvasAgentPromptDecisionField(t('Prompt to fix', '需要修正的提示词'))],
                    facts: [
                        call('canvasAgentPromptTargetFact', null, target),
                        ...canvasAgentPromptPreflightFacts(preflight)
                    ].filter(Boolean),
                    details: currentPrompt,
                    actions: [
                        { value: 'check', label: t('Check edited prompt', '检查已编辑提示词'), icon: 'fa-check', primary: true, keepOpen: true, busyMessage: t('Checking prompt...', '正在检查提示词...') },
                        { value: 'rewrite', label: t('Regenerate', '重新生成'), icon: 'fa-rotate', keepOpen: true, busyMessage: t('Regenerating prompt...', '正在重新生成提示词...') },
                        { value: 'cancel', label: t('Cancel', '取消'), icon: 'fa-xmark' }
                    ]
                });
                if (choice === 'cancel') return { ok: false, prompt: currentPrompt, preflight, error: 'prompt preflight cancelled' };
                currentPrompt = String(form.prompt || currentPrompt).trim();
                if (choice === 'rewrite') {
                    try {
                        const rewritten = await call('rewriteCanvasAgentPromptWithLlm', null,
                            currentPrompt,
                            purpose,
                            Object.assign({}, opts, { promptTarget: target })
                        );
                        if (rewritten?.ok && rewritten.prompt) currentPrompt = String(rewritten.prompt).trim();
                    } catch (err) {
                        console.warn('[SimpAI Canvas Agent] preflight regenerate failed', err);
                    }
                }
                preflight = await canvasAgentPromptPreflight(currentPrompt, target, purpose, opts);
            }
            return { ok: true, prompt: currentPrompt, preflight };
        }

        function canvasAgentPromptDecisionField(label, rows = 5) {
            return {
                key: 'prompt',
                label: label || t('Prompt to submit', '提交提示词'),
                type: 'textarea',
                rows,
                wide: true
            };
        }

        function canvasAgentPromptFromDecision(form, fallback) {
            return String(form?.prompt || fallback || '').trim();
        }

        return {
            canvasAgentPresetDecisionOptions,
            canvasAgentPresetImageCapacity,
            canvasAgentPresetMediaCapacity,
            canvasAgentPresetSupportsTask,
            canvasAgentRequestedMediaCounts,
            canvasAgentPresetSupportsMediaRequest,
            canvasAgentPresetMediaCapacityMessage,
            chooseCanvasAgentPresetEntry,
            canvasAgentPromptPreflight,
            canvasAgentPromptPreflightFacts,
            ensureCanvasAgentPromptPreflightAllows,
            canvasAgentPromptDecisionField,
            canvasAgentPromptFromDecision
        };
    }

    window.SimpAICanvasWorkbenchCanvasAgentDecision = Object.assign({}, window.SimpAICanvasWorkbenchCanvasAgentDecision || {}, {
        createCanvasAgentDecisionController
    });
})();
