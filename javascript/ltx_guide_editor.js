(function () {
    'use strict';

    const DEFAULT_CONFIG = Object.freeze({
        version: 1,
        first_strength: 1.0,
        last_strength: 1.0,
        middle: Object.freeze([
            Object.freeze({ frame_idx: 0, strength: 0.7 }),
            Object.freeze({ frame_idx: 0, strength: 0.7 }),
            Object.freeze({ frame_idx: 0, strength: 0.7 })
        ])
    });
    const DEFAULT_EXTENT_CONFIG = Object.freeze({
        version: 1,
        mode: 'video_extent',
        context_frames: 17,
        source_strength: 1.0,
        guides: Object.freeze(Array.from({ length: 5 }, () => (
            Object.freeze({ frame_idx: 0, strength: 0.7 })
        )))
    });

    let activeModal = null;
    let activeOptions = null;

    function languageState(source) {
        if (source && typeof source === 'object') return source;
        return window.simpleaiTopbarSystemParams || window.topbarLastSystemParams || { __lang: window.locale_lang || 'en' };
    }

    function isEnglish(source) {
        return String(languageState(source).__lang || '').trim().toLowerCase().startsWith('en');
    }

    function t(en, cn, source) {
        if (window.SimpAII18n?.t) return window.SimpAII18n.t(en, cn, languageState(source));
        return isEnglish(source) ? en : cn;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    function clampNumber(value, fallback, minimum, maximum) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(maximum, Math.max(minimum, number));
    }

    function configSource(value) {
        let source = value;
        if (typeof source === 'string') {
            try {
                source = source.trim() ? JSON.parse(source) : {};
            } catch (error) {
                source = {};
            }
        }
        if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
        return source;
    }

    function stateMode(source) {
        const state = languageState(source);
        const taskMethods = state?.scene_frontend?.task_method;
        const text = [
            state?.__preset,
            state?.preset,
            state?.task_method,
            ...(taskMethods && typeof taskMethods === 'object' ? Object.values(taskMethods) : [])
        ].filter(Boolean).join(' ').toLowerCase();
        return text.includes('ltx_extent') || /ltx\s*\(extent\)/.test(text)
            ? 'video_extent'
            : 'keyframes';
    }

    function configMode(value, source, explicitMode) {
        const parsed = configSource(value);
        if (String(explicitMode || '').toLowerCase() === 'video_extent') return 'video_extent';
        if (String(parsed.mode || '').toLowerCase() === 'video_extent') return 'video_extent';
        return stateMode(source);
    }

    function normalizeContextFrames(value) {
        const requested = Math.round(clampNumber(value, DEFAULT_EXTENT_CONFIG.context_frames, 1, 257));
        return Math.min(257, Math.max(1, Math.round((requested - 1) / 8) * 8 + 1));
    }

    function normalize(value, modeHint) {
        const source = configSource(value);
        const mode = String(modeHint || source.mode || '').toLowerCase();
        if (mode === 'video_extent') {
            const guideSource = Array.isArray(source.guides) ? source.guides : [];
            const legacyMiddle = Array.isArray(source.middle) ? source.middle : [];
            const legacyStrengths = [
                source.first_strength ?? 0.7,
                legacyMiddle[0]?.strength ?? 0.7,
                legacyMiddle[1]?.strength ?? 0.7,
                legacyMiddle[2]?.strength ?? 0.7,
                source.last_strength ?? 0.7
            ];
            const legacyFrames = [
                0,
                legacyMiddle[0]?.frame_idx ?? 0,
                legacyMiddle[1]?.frame_idx ?? 0,
                legacyMiddle[2]?.frame_idx ?? 0,
                0
            ];
            return {
                version: 1,
                mode: 'video_extent',
                context_frames: normalizeContextFrames(source.context_frames),
                source_strength: clampNumber(source.source_strength, DEFAULT_EXTENT_CONFIG.source_strength, 0, 10),
                guides: DEFAULT_EXTENT_CONFIG.guides.map((defaults, index) => {
                    const item = guideSource[index] && typeof guideSource[index] === 'object' ? guideSource[index] : {};
                    return {
                        frame_idx: Math.round(clampNumber(item.frame_idx ?? legacyFrames[index], defaults.frame_idx, 0, 9999)),
                        strength: clampNumber(item.strength ?? legacyStrengths[index], defaults.strength, 0, 10)
                    };
                })
            };
        }
        const middleSource = Array.isArray(source.middle) ? source.middle : [];
        const middle = DEFAULT_CONFIG.middle.map((defaults, index) => {
            const item = middleSource[index] && typeof middleSource[index] === 'object' ? middleSource[index] : {};
            const position = index + 1;
            return {
                frame_idx: Math.round(clampNumber(
                    item.frame_idx ?? source[`middle_frame_idx_${position}`],
                    defaults.frame_idx,
                    0,
                    9999
                )),
                strength: clampNumber(
                    item.strength ?? source[`middle_strength_${position}`],
                    defaults.strength,
                    0,
                    10
                )
            };
        });
        return {
            version: 1,
            first_strength: clampNumber(source.first_strength, DEFAULT_CONFIG.first_strength, 0, 10),
            last_strength: clampNumber(source.last_strength, DEFAULT_CONFIG.last_strength, 0, 10),
            middle
        };
    }

    function serialize(value, pretty, modeHint) {
        return JSON.stringify(normalize(value, modeHint), null, pretty ? 2 : 0);
    }

    function gradioRoot() {
        try {
            if (typeof window.gradioApp === 'function') return window.gradioApp();
        } catch (error) {}
        return document;
    }

    function findById(id) {
        const root = gradioRoot();
        return root?.getElementById?.(id) || document.getElementById(id);
    }

    function bridgeInput(id) {
        const host = findById(id);
        return host?.querySelector?.('textarea, input') || (host?.matches?.('textarea,input') ? host : null);
    }

    function readBridgeValue(id) {
        return bridgeInput(id)?.value || '';
    }

    function setNativeValue(input, value) {
        if (!input) return false;
        const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
        const setter = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value')?.set : null;
        if (setter) setter.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function formatStrength(value) {
        const fixed = clampNumber(value, 0, 0, 10).toFixed(2);
        return fixed.replace(/0+$/, '').replace(/\.$/, '');
    }

    function formatFrameIndex(value, state) {
        const frameIndex = Math.round(clampNumber(value, 0, 0, 9999));
        return frameIndex === 0 ? t('Auto', '自动', state) : String(frameIndex);
    }

    function configStatus(config, state, modeHint) {
        const normalized = normalize(config, modeHint);
        if (normalized.mode === 'video_extent') {
            const guides = normalized.guides.map((item, index) => (
                `${t(`G${index + 1}`, `图${index + 1}`, state)} ${formatFrameIndex(item.frame_idx, state)}/${formatStrength(item.strength)}`
            )).join(' · ');
            return t(
                `Context ${normalized.context_frames}/${formatStrength(normalized.source_strength)} | ${guides}`,
                `上下文 ${normalized.context_frames}/${formatStrength(normalized.source_strength)} | ${guides}`,
                state
            );
        }
        const middle = normalized.middle.map((item, index) => (
            `${t(`M${index + 1}`, `中${index + 1}`, state)} ${formatFrameIndex(item.frame_idx, state)}/${formatStrength(item.strength)}`
        )).join(' · ');
        return t(
            `First ${formatStrength(normalized.first_strength)} | ${middle} | Last ${formatStrength(normalized.last_strength)}`,
            `首帧 ${formatStrength(normalized.first_strength)} | ${middle} | 尾帧 ${formatStrength(normalized.last_strength)}`,
            state
        );
    }

    function syncSceneControl(state) {
        const host = findById('ltx_guide_scene_control');
        if (!host) return false;
        const source = languageState(state);
        const value = readBridgeValue('scene_additional_prompt');
        const mode = configMode(value, source);
        const isExtent = mode === 'video_extent';
        const label = host.querySelector('[data-ltx-guide-scene-label]');
        const status = host.querySelector('[data-ltx-guide-scene-status]');
        const button = host.querySelector('[data-ltx-guide-scene-open]');
        if (label) label.textContent = isExtent
            ? t('Extent Guides', '续写引导', source)
            : t('Keyframe Guides', '关键帧引导', source);
        if (status) status.textContent = configStatus(value, source, mode);
        if (button) button.title = isExtent
            ? t('Edit LTX extent guides', '编辑 LTX 续写引导', source)
            : t('Edit LTX keyframe guides', '编辑 LTX 关键帧引导', source);
        return true;
    }

    function injectStyles() {
        if (document.getElementById('simpai_ltx_guide_editor_styles')) return;
        const style = document.createElement('style');
        style.id = 'simpai_ltx_guide_editor_styles';
        style.textContent = `
.sai-ltxg-backdrop{position:fixed;inset:0;z-index:99982;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,10,14,.62);backdrop-filter:blur(6px);overscroll-behavior:contain}
.sai-ltxg-modal{width:min(860px,calc(100vw - 28px));max-height:calc(100vh - 32px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;color:var(--body-text-color,#f4f4f5);background:var(--body-background-fill,#18181b);border:1px solid var(--border-color-primary,#4b5563);border-radius:8px;box-shadow:0 24px 72px rgba(0,0,0,.42);overflow:hidden;letter-spacing:0}
.sai-ltxg-header,.sai-ltxg-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:var(--block-background-fill,#24262b)}
.sai-ltxg-header{border-bottom:1px solid var(--border-color-primary,#3f3f46)}
.sai-ltxg-footer{justify-content:flex-end;border-top:1px solid var(--border-color-primary,#3f3f46)}
.sai-ltxg-title{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:700}
.sai-ltxg-title i{color:var(--button-primary-background-fill,#f97316)}
.sai-ltxg-close{width:34px;height:34px;display:grid;place-items:center;padding:0;color:inherit;background:transparent;border:1px solid transparent;border-radius:6px;cursor:pointer}
.sai-ltxg-close:hover,.sai-ltxg-close:focus-visible{border-color:var(--border-color-primary,#52525b);background:rgba(255,255,255,.06);outline:none}
.sai-ltxg-body{min-height:0;padding:16px;overflow:auto}
.sai-ltxg-table{display:grid;grid-template-columns:minmax(128px,1fr) minmax(150px,.8fr) minmax(250px,1.5fr);align-items:center;border-top:1px solid var(--border-color-primary,#3f3f46);border-left:1px solid var(--border-color-primary,#3f3f46)}
.sai-ltxg-cell{min-width:0;min-height:58px;display:flex;align-items:center;gap:9px;padding:10px 12px;border-right:1px solid var(--border-color-primary,#3f3f46);border-bottom:1px solid var(--border-color-primary,#3f3f46);box-sizing:border-box}
.sai-ltxg-cell.is-head{min-height:36px;color:var(--body-text-color-subdued,#aab4c8);background:var(--block-background-fill,#24262b);font-size:12px;font-weight:700;text-transform:none}
.sai-ltxg-guide-label{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:650}
.sai-ltxg-guide-label i{width:22px;height:22px;display:grid;place-items:center;color:#fff;background:var(--button-primary-background-fill,#f97316);border-radius:50%;font-size:11px}
.sai-ltxg-fixed{font-variant-numeric:tabular-nums;color:var(--body-text-color-subdued,#aab4c8)}
.sai-ltxg-cell input[type=number]{width:100%;height:34px;padding:0 9px;color:inherit;background:var(--input-background-fill,#15171a);border:1px solid var(--border-color-primary,#52525b);border-radius:6px;box-sizing:border-box;font-variant-numeric:tabular-nums}
.sai-ltxg-strength{display:grid;grid-template-columns:minmax(90px,1fr) 76px;align-items:center;gap:9px;width:100%;min-width:0}
.sai-ltxg-strength input[type=range]{width:100%;accent-color:var(--button-primary-background-fill,#f97316)}
.sai-ltxg-summary{min-height:20px;margin-top:12px;color:var(--body-text-color-subdued,#aab4c8);font-size:12px;text-align:right;font-variant-numeric:tabular-nums}
.sai-ltxg-button{height:36px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 14px;color:inherit;background:rgba(255,255,255,.055);border:1px solid var(--border-color-primary,#52525b);border-radius:6px;cursor:pointer;font-weight:650}
.sai-ltxg-button.is-primary{color:var(--button-primary-text-color,#fff);background:var(--button-primary-background-fill,#f97316);border-color:var(--button-primary-background-fill,#f97316)}
.sai-ltxg-button:hover,.sai-ltxg-button:focus-visible{filter:brightness(1.08);outline:none}
.sai-ltxg-reset{margin-right:auto}
@media(max-width:700px){.sai-ltxg-backdrop{padding:8px}.sai-ltxg-modal{width:100%;max-height:calc(100vh - 16px)}.sai-ltxg-body{padding:10px}.sai-ltxg-table{grid-template-columns:minmax(96px,.8fr) minmax(100px,.7fr) minmax(170px,1.25fr)}.sai-ltxg-cell{padding:8px;gap:6px}.sai-ltxg-strength{grid-template-columns:minmax(64px,1fr) 64px}.sai-ltxg-footer{flex-wrap:wrap}}
`;
        document.head.appendChild(style);
    }

    function guideLabel(kind, index, state) {
        if (kind === 'first') return t('First frame', '首帧', state);
        if (kind === 'last') return t('Last frame', '尾帧', state);
        return t(`Middle ${index + 1}`, `中间帧 ${index + 1}`, state);
    }

    function strengthControl(key, value) {
        const safeKey = escapeHtml(key);
        const safeValue = escapeHtml(formatStrength(value));
        return `<div class="sai-ltxg-strength"><input type="range" min="0" max="10" step="0.01" value="${safeValue}" data-ltxg-strength-range="${safeKey}"><input type="number" min="0" max="10" step="0.01" value="${safeValue}" data-ltxg-strength-number="${safeKey}"></div>`;
    }

    function rowHtml(kind, index, config, state) {
        const isMiddle = kind === 'middle';
        const item = isMiddle ? config.middle[index] : null;
        const key = isMiddle ? `middle.${index}.strength` : `${kind}_strength`;
        const strength = isMiddle ? item.strength : config[key];
        const frame = kind === 'first'
            ? '<span class="sai-ltxg-fixed">0</span>'
            : (kind === 'last'
                ? `<span class="sai-ltxg-fixed">${escapeHtml(t('End', '末帧', state))}</span>`
                : `<input type="number" min="0" max="9999" step="1" value="${escapeHtml(item.frame_idx)}" data-ltxg-frame="${index}" title="${escapeHtml(t('0 selects automatic position', '0 表示自动位置', state))}">`);
        const icon = kind === 'middle' ? 'fa-diamond' : (kind === 'first' ? 'fa-play' : 'fa-flag-checkered');
        return `<div class="sai-ltxg-cell"><span class="sai-ltxg-guide-label"><i class="fa-solid ${icon}"></i>${escapeHtml(guideLabel(kind, index, state))}</span></div><div class="sai-ltxg-cell">${frame}</div><div class="sai-ltxg-cell">${strengthControl(key, strength)}</div>`;
    }

    function extentSourceRowHtml(config, state) {
        return `<div class="sai-ltxg-cell"><span class="sai-ltxg-guide-label"><i class="fa-solid fa-film"></i>${escapeHtml(t('Source context', '源视频上下文', state))}</span></div><div class="sai-ltxg-cell"><input type="number" min="1" max="257" step="8" value="${escapeHtml(config.context_frames)}" data-ltxg-context-frames title="${escapeHtml(t('Tail context frames, normalized to 8n+1', '尾部上下文帧数，自动调整为 8n+1', state))}"></div><div class="sai-ltxg-cell">${strengthControl('source_strength', config.source_strength)}</div>`;
    }

    function extentGuideRowHtml(index, config, state) {
        const item = config.guides[index];
        const key = `guides.${index}.strength`;
        return `<div class="sai-ltxg-cell"><span class="sai-ltxg-guide-label"><i class="fa-solid fa-diamond"></i>${escapeHtml(t(`Image ${index + 1}`, `图片 ${index + 1}`, state))}</span></div><div class="sai-ltxg-cell"><input type="number" min="0" max="9999" step="1" value="${escapeHtml(item.frame_idx)}" data-ltxg-extent-frame="${index}" title="${escapeHtml(t('Relative to continuation start; 0 selects automatic position', '相对续写起点；0 表示自动位置', state))}"></div><div class="sai-ltxg-cell">${strengthControl(key, item.strength)}</div>`;
    }

    function setConfigValue(config, key, value) {
        if (key.startsWith('guides.')) {
            const parts = key.split('.');
            config.guides[Number(parts[1])].strength = clampNumber(value, 0.7, 0, 10);
            return;
        }
        if (key.startsWith('middle.')) {
            const parts = key.split('.');
            const index = Number(parts[1]);
            config.middle[index].strength = clampNumber(value, 0.7, 0, 10);
            return;
        }
        config[key] = clampNumber(value, 1, 0, 10);
    }

    function close() {
        if (!activeModal) return false;
        activeModal.remove();
        activeModal = null;
        activeOptions = null;
        document.documentElement.classList.remove('sai-ltxg-modal-open');
        return true;
    }

    function closeScenePreset() {
        if (activeOptions?.context && activeOptions.context !== 'scene_preset') return false;
        return close();
    }

    function open(options) {
        const opts = options && typeof options === 'object' ? options : {};
        close();
        injectStyles();
        const state = languageState(opts.langState);
        const initialValue = opts.guideConfig ?? opts.value ?? opts.state ?? (opts.context === 'scene_preset' ? readBridgeValue('scene_additional_prompt') : '');
        const mode = configMode(initialValue, state, opts.mode);
        const isExtent = mode === 'video_extent';
        let config = normalize(initialValue, mode);
        const rows = isExtent
            ? `${extentSourceRowHtml(config, state)}${config.guides.map((_item, index) => extentGuideRowHtml(index, config, state)).join('')}`
            : `${rowHtml('first', 0, config, state)}${rowHtml('middle', 0, config, state)}${rowHtml('middle', 1, config, state)}${rowHtml('middle', 2, config, state)}${rowHtml('last', 0, config, state)}`;
        const modalTitle = opts.title || (isExtent
            ? t('LTX Extent Guides', 'LTX 续写引导', state)
            : t('LTX Keyframe Guides', 'LTX 关键帧引导', state));
        const backdrop = document.createElement('div');
        backdrop.className = 'sai-ltxg-backdrop';
        backdrop.innerHTML = `<section class="sai-ltxg-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(modalTitle)}">
  <header class="sai-ltxg-header"><div class="sai-ltxg-title"><i class="fa-solid fa-sliders"></i><span>${escapeHtml(modalTitle)}</span></div><button type="button" class="sai-ltxg-close" data-ltxg-action="close" title="${escapeHtml(t('Close', '关闭', state))}"><i class="fa-solid fa-xmark"></i></button></header>
  <div class="sai-ltxg-body"><div class="sai-ltxg-table"><div class="sai-ltxg-cell is-head">${escapeHtml(t('Guide', '引导帧', state))}</div><div class="sai-ltxg-cell is-head">${escapeHtml(isExtent ? t('Frames / relative idx', '帧数 / 相对序号', state) : t('Frame index', '帧序号', state))}</div><div class="sai-ltxg-cell is-head">${escapeHtml(t('Strength', '权重', state))}</div>${rows}</div><div class="sai-ltxg-summary" data-ltxg-summary>${escapeHtml(configStatus(config, state, mode))}</div></div>
  <footer class="sai-ltxg-footer"><button type="button" class="sai-ltxg-button sai-ltxg-reset" data-ltxg-action="reset"><i class="fa-solid fa-arrow-rotate-left"></i><span>${escapeHtml(t('Reset', '重置', state))}</span></button><button type="button" class="sai-ltxg-button" data-ltxg-action="cancel">${escapeHtml(t('Cancel', '取消', state))}</button><button type="button" class="sai-ltxg-button is-primary" data-ltxg-action="apply"><i class="fa-solid fa-check"></i><span>${escapeHtml(t('Apply', '应用', state))}</span></button></footer>
</section>`;

        const refreshValues = () => {
            backdrop.querySelectorAll('[data-ltxg-strength-range]').forEach((range) => {
                const key = range.dataset.ltxgStrengthRange;
                const value = key.startsWith('guides.')
                    ? config.guides[Number(key.split('.')[1])].strength
                    : (key.startsWith('middle.') ? config.middle[Number(key.split('.')[1])].strength : config[key]);
                range.value = formatStrength(value);
                const number = backdrop.querySelector(`[data-ltxg-strength-number="${CSS.escape(key)}"]`);
                if (number) number.value = formatStrength(value);
            });
            backdrop.querySelectorAll('[data-ltxg-frame]').forEach((input) => {
                input.value = String(config.middle[Number(input.dataset.ltxgFrame)].frame_idx);
            });
            backdrop.querySelectorAll('[data-ltxg-extent-frame]').forEach((input) => {
                input.value = String(config.guides[Number(input.dataset.ltxgExtentFrame)].frame_idx);
            });
            const contextFrames = backdrop.querySelector('[data-ltxg-context-frames]');
            if (contextFrames) contextFrames.value = String(config.context_frames);
            const summary = backdrop.querySelector('[data-ltxg-summary]');
            if (summary) summary.textContent = configStatus(config, state, mode);
        };

        backdrop.addEventListener('input', (event) => {
            const target = event.target;
            if (target.matches('[data-ltxg-strength-range]')) {
                const key = target.dataset.ltxgStrengthRange;
                setConfigValue(config, key, target.value);
                refreshValues();
            } else if (target.matches('[data-ltxg-strength-number]')) {
                if (target.value === '') return;
                const key = target.dataset.ltxgStrengthNumber;
                setConfigValue(config, key, target.value);
                const range = backdrop.querySelector(`[data-ltxg-strength-range="${CSS.escape(key)}"]`);
                if (range) range.value = formatStrength(key.startsWith('guides.')
                    ? config.guides[Number(key.split('.')[1])].strength
                    : (key.startsWith('middle.') ? config.middle[Number(key.split('.')[1])].strength : config[key]));
                const summary = backdrop.querySelector('[data-ltxg-summary]');
                if (summary) summary.textContent = configStatus(config, state, mode);
            } else if (target.matches('[data-ltxg-frame]')) {
                if (target.value === '') return;
                const index = Number(target.dataset.ltxgFrame);
                config.middle[index].frame_idx = Math.round(clampNumber(target.value, 0, 0, 9999));
                const summary = backdrop.querySelector('[data-ltxg-summary]');
                if (summary) summary.textContent = configStatus(config, state, mode);
            } else if (target.matches('[data-ltxg-extent-frame]')) {
                if (target.value === '') return;
                const index = Number(target.dataset.ltxgExtentFrame);
                config.guides[index].frame_idx = Math.round(clampNumber(target.value, 0, 0, 9999));
                const summary = backdrop.querySelector('[data-ltxg-summary]');
                if (summary) summary.textContent = configStatus(config, state, mode);
            } else if (target.matches('[data-ltxg-context-frames]')) {
                if (target.value === '') return;
                config.context_frames = normalizeContextFrames(target.value);
                const summary = backdrop.querySelector('[data-ltxg-summary]');
                if (summary) summary.textContent = configStatus(config, state, mode);
            }
        });
        backdrop.addEventListener('change', (event) => {
            if (event.target.matches('[data-ltxg-strength-number],[data-ltxg-frame],[data-ltxg-extent-frame],[data-ltxg-context-frames]')) refreshValues();
        });
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) {
                close();
                return;
            }
            const action = event.target.closest?.('[data-ltxg-action]')?.dataset?.ltxgAction;
            if (!action) return;
            if (action === 'close' || action === 'cancel') {
                close();
            } else if (action === 'reset') {
                config = normalize({}, mode);
                refreshValues();
            } else if (action === 'apply') {
                const guideConfig = serialize(config, false, mode);
                if (opts.context === 'scene_preset') {
                    setNativeValue(bridgeInput('scene_additional_prompt'), guideConfig);
                    syncSceneControl(state);
                }
                if (typeof opts.onConfirm === 'function') opts.onConfirm({ config: normalize(config, mode), guide_config: guideConfig });
                close();
            }
        });
        backdrop.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
            }
        });

        activeModal = backdrop;
        activeOptions = Object.assign({}, opts, { mode });
        const mount = opts.modalMount?.appendChild ? opts.modalMount : document.body;
        mount.appendChild(backdrop);
        document.documentElement.classList.add('sai-ltxg-modal-open');
        backdrop.querySelector('[data-ltxg-action="close"]')?.focus();
        return backdrop;
    }

    function openScenePreset() {
        return open({ context: 'scene_preset', langState: languageState() });
    }

    document.addEventListener('click', (event) => {
        const target = event.target.closest?.('[data-ltx-guide-scene-open]');
        if (!target) return;
        event.preventDefault();
        openScenePreset();
    });
    document.addEventListener('keydown', (event) => {
        const target = event.target.closest?.('[data-ltx-guide-scene-open]');
        if (!target || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        openScenePreset();
    });
    document.addEventListener('input', (event) => {
        if (event.target === bridgeInput('scene_additional_prompt')) syncSceneControl(languageState());
    });

    window.SimpAILTXGuideEditor = Object.assign(window.SimpAILTXGuideEditor || {}, {
        DEFAULT_CONFIG,
        DEFAULT_EXTENT_CONFIG,
        normalize,
        parse: normalize,
        serialize,
        configStatus,
        open,
        openScenePreset,
        close,
        closeScenePreset,
        syncSceneControl
    });
    window.setTimeout(() => syncSceneControl(languageState()), 0);
})();
