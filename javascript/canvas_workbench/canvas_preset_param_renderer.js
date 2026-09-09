(function () {
    'use strict';

    function createCanvasPresetParamRenderer(context) {
        const {
            t, clamp, escapeHtml, localizeCanvasLabel,
            getPromptTextSourceNode, presetParamValue, isPromptTextParam,
            shouldEnableDanbooruAutocomplete, danbooruAutocompleteAttrs,
            getTranslationFieldState, getPresetThemeInfo
        } = context;

        function localizedPresetParamLabel(param) {
            return localizeCanvasLabel(param?.label || param?.key);
        }

        function wildcardPreviewFacts(preview) {
            if (!preview || !Array.isArray(preview.samples)) return [];
            const facts = [];
            const matched = Array.isArray(preview.matched) ? preview.matched : [];
            const unmatched = Array.isArray(preview.unmatched) ? preview.unmatched : [];
            if (matched.length || unmatched.length || Number(preview.arrays_mult || 0) > 0) {
                facts.push({ label: t('Wildcards', '通配符'), value: [
                    matched.length ? `${t('matched', '命中')}: ${matched.join(', ')}` : '',
                    unmatched.length ? `${t('unmatched', '未命中')}: ${unmatched.join(', ')}` : '',
                    Number(preview.arrays_mult || 0) > 0 ? `${t('batch', '批量')}: ${preview.arrays_mult}` : ''
                ].filter(Boolean).join(' | ') || t('no wildcard tokens', '没有通配符 token') });
            }
            const sample = preview.samples[0]?.prompt || '';
            if (sample && sample !== preview.raw_prompt) {
                facts.push({ label: t('Expanded prompt', '展开预览'), value: sample.length > 220 ? `${sample.slice(0, 220).trim()}...` : sample });
            }
            return facts;
        }

        const CANVAS_RELIGHT_LIGHT_DIRECTIONS = Object.freeze([
            { value: '1', icon: '↖', en: 'Top left', cn: '左上' },
            { value: '2', icon: '↑', en: 'Top', cn: '上' },
            { value: '3', icon: '↗', en: 'Top right', cn: '右上' },
            { value: '4', icon: '←', en: 'Left', cn: '左' },
            { value: '5', icon: '•', en: 'Center', cn: '中心' },
            { value: '6', icon: '→', en: 'Right', cn: '右' },
            { value: '7', icon: '↙', en: 'Bottom left', cn: '左下' },
            { value: '8', icon: '↓', en: 'Bottom', cn: '下' },
            { value: '9', icon: '↘', en: 'Bottom right', cn: '右下' },
            { value: '10', icon: '', en: 'Random', cn: '随机', random: true }
        ]);

        function canvasRelightLightValue(value) {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return '10';
            return String(clamp(Math.round(parsed), 1, 10));
        }

        function canvasRelightLightOption(value) {
            const normalized = canvasRelightLightValue(value);
            return CANVAS_RELIGHT_LIGHT_DIRECTIONS.find(item => item.value === normalized)
                || CANVAS_RELIGHT_LIGHT_DIRECTIONS[CANVAS_RELIGHT_LIGHT_DIRECTIONS.length - 1];
        }

        function isCanvasRelightLightDirectionParam(node, param) {
            if (!node || !param || param.key !== 'scene_var_number') return false;
            const themeInfo = getPresetThemeInfo(node);
            const taskMethod = String(themeInfo?.task_method || node.runtime?.task_method || '').toLowerCase();
            if (taskMethod.includes('relight_fc')) return true;
            const presetName = String(node.preset?.name || node.title || '').toLowerCase();
            return presetName.includes('relight') && Number(param.max) === 10;
        }

        function renderCanvasRelightLightDirectionControl(node, param, attrName, options) {
            const opts = options || {};
            const disabled = opts.disabled ? 'disabled' : '';
            const value = canvasRelightLightValue(opts.value);
            const selected = canvasRelightLightOption(value);
            const attr = `${attrName}="${escapeHtml(param.key)}"`;
            const label = escapeHtml(t('Light Direction', '光源方向'));
            const current = escapeHtml(t(selected.en, selected.cn));
            const resetButton = opts.resetButton || '';
            const buttonHtml = CANVAS_RELIGHT_LIGHT_DIRECTIONS.map((item) => {
                const isSelected = item.value === value;
                const title = escapeHtml(t(item.en, item.cn));
                const classes = [
                    'sai-canvas-relight-light-button',
                    item.random ? 'sai-canvas-relight-light-random' : '',
                    isSelected ? 'is-selected' : ''
                ].filter(Boolean).join(' ');
                const icon = item.random
                    ? '<i class="fa-solid fa-shuffle" aria-hidden="true"></i>'
                    : `<span aria-hidden="true">${escapeHtml(item.icon)}</span>`;
                return `<button type="button" class="${classes}" ${attr} value="${escapeHtml(item.value)}" data-relight-light-value="${escapeHtml(item.value)}" aria-pressed="${isSelected ? 'true' : 'false'}" title="${title}" ${disabled}>${icon}<small>${title}</small></button>`;
            }).join('');
            return `<div class="sai-canvas-relight-light-control" data-canvas-relight-light-control>
  <div class="sai-canvas-relight-light-head">
    <span class="sai-canvas-relight-light-title">${label}${resetButton}</span>
    <span class="sai-canvas-relight-light-current">${current}</span>
  </div>
  <div class="sai-canvas-relight-light-grid" role="group" aria-label="${label}">
    ${buttonHtml}
  </div>
</div>`;
        }

        function renderPresetParamControl(node, param, attrName) {
            const key = escapeHtml(param.key);
            const label = escapeHtml(localizedPresetParamLabel(param));
            const textSource = getPromptTextSourceNode(node, param.key);
            const disabled = param.interactive === false || textSource ? 'disabled' : '';
            const value = presetParamValue(node, param);
            const attr = `${attrName}="${key}"`;
            const useDanbooruAutocomplete = shouldEnableDanbooruAutocomplete(param.key, 'node-param', { disabled: !!disabled });
            const resetButton = disabled ? '' : `<button type="button" class="sai-param-reset" data-param-reset="${key}" title="Reset to default"><i class="fa-solid fa-rotate-left"></i></button>`;
            const labelHtml = `<span>${label}${resetButton}</span>`;
            if (param.type === 'textarea') {
                const textHandle = isPromptTextParam(param.key)
                    ? `<button type="button" class="sai-node-handle sai-node-handle-in" data-text-in="${escapeHtml(param.key)}" title="${param.key === 'negative_prompt' ? 'Negative prompt input' : 'Prompt input'}"></button>`
                    : '';
                const sourceLabel = textSource ? `<small>from ${escapeHtml(textSource.title || textSource.id)}</small>` : '';
                const textLabel = `<span>${label}${sourceLabel}${resetButton}</span>`;
                const collapsedKeep = param.key === 'prompt' ? ' sai-collapsed-keep sai-collapsed-prompt' : '';
                return `<label class="sai-node-field ${textHandle ? 'sai-prompt-input-field' : ''}${collapsedKeep}">${textHandle}${textLabel}${renderTranslatableTextarea(`${attr} rows="3" ${disabled}`, value || '', { target: 'node-param', key: param.key, disabled: !!disabled, tagCart: isPromptTextParam(param.key) && !disabled, wildcardInsert: isPromptTextParam(param.key) && !disabled, danbooruAutocomplete: useDanbooruAutocomplete, autocompleteRole: param.key, state: getTranslationFieldState(node, 'node-param', param.key, value || '') })}</label>`;
            }
            if (param.type === 'checkbox') {
                const checked = value === true || value === 'true' || value === 1 || value === '1' ? 'checked' : '';
                return `<label class="sai-node-check"><input ${attr} type="checkbox" ${checked} ${disabled}><span>${label}</span>${resetButton}</label>`;
            }
            if (param.type === 'choice') {
                const choices = Array.isArray(param.choices) ? param.choices : [];
                return `<label class="sai-node-field">${labelHtml}<select ${attr} ${disabled}>${choices.map(choice => `<option value="${escapeHtml(choice)}" ${String(choice) === String(value) ? 'selected' : ''}>${escapeHtml(choice)}</option>`).join('')}</select></label>`;
            }
            if (isCanvasRelightLightDirectionParam(node, param)) {
                return renderCanvasRelightLightDirectionControl(node, param, attrName, {
                    value,
                    disabled: !!disabled,
                    resetButton
                });
            }
            const numeric = Number(value);
            const min = param.min !== undefined && param.min !== null && param.min !== '' ? Number(param.min) : 0;
            const maxRaw = param.max !== undefined && param.max !== null && param.max !== '' ? Number(param.max) : NaN;
            const max = Number.isFinite(maxRaw) ? maxRaw : Math.max(100, Number.isFinite(numeric) ? numeric * 2 : 100);
            const step = inferPresetNumberStep(param, value, min, max);
            return `<label class="sai-node-field sai-node-range">${labelHtml}<div class="sai-range-pair"><input ${attr} type="range" min="${escapeHtml(min)}" max="${escapeHtml(max)}" step="${escapeHtml(step)}" value="${escapeHtml(value ?? min)}" ${disabled}><input ${attr} type="number" min="${escapeHtml(min)}" max="${escapeHtml(max)}" step="${escapeHtml(step)}" value="${escapeHtml(value ?? min)}" ${disabled}></div></label>`;
        }

        function renderTranslatableTextarea(attrs, value, options) {
            const opts = options || {};
            const rawTarget = opts.target || 'text';
            const rawKey = opts.key || '';
            const target = escapeHtml(rawTarget);
            const key = escapeHtml(rawKey);
            const disabled = opts.disabled ? 'disabled' : '';
            const state = escapeHtml(opts.state || 'idle');
            const title = state === 'translated'
                ? t('Translated - click to restore', '已翻译 - 点击恢复原文')
                : (state === 'original' ? t('Cached - click to apply translation', '已有缓存 - 点击应用翻译') : t('Translate', '翻译'));
            const label = state === 'translated' ? t('T', '译') : (state === 'original' ? t('O', '原') : '');
            const wildcardButton = opts.wildcardInsert
                ? `<button type="button" class="sai-prompt-tool-btn sai-wildcard-btn" data-node-action="open-wildcards-insert:${key}" ${disabled} title="${escapeHtml(t('Insert wildcard', '插入通配符'))}"><i class="fa-solid fa-dice"></i></button>`
                : '';
            const tagButton = opts.tagCart
                ? `<button type="button" class="sai-prompt-tool-btn sai-tagcart-btn" data-tag-cart-action="open" data-translate-target="${target}" data-translate-key="${key}" ${disabled} title="${escapeHtml(t('Open Tag Cart', '打开标签选择器'))}"><i class="fa-solid fa-tags"></i></button>`
                : '';
            const autocompleteAttrs = shouldEnableDanbooruAutocomplete(rawKey, rawTarget, opts)
                ? danbooruAutocompleteAttrs(opts.autocompleteRole || rawKey || rawTarget || 'prompt')
                : '';
            const tools = [wildcardButton, tagButton, `<button type="button" class="sai-prompt-tool-btn sai-translate-btn is-${state}" data-translate-action="replace" data-translate-target="${target}" data-translate-key="${key}" data-translate-state="${state}" ${disabled} title="${escapeHtml(title)}"><i class="fa-solid fa-language"></i>${label ? `<span>${escapeHtml(label)}</span>` : ''}</button>`].filter(Boolean).join('');
            return `<div class="sai-translate-wrap"><textarea ${attrs}${autocompleteAttrs}>${escapeHtml(value || '')}</textarea>${tools ? `<div class="sai-prompt-textarea-tools">${tools}</div>` : ''}</div>`;
        }

        function inferPresetNumberStep(param, value, min, max) {
            if (param.step !== undefined && param.step !== null && param.step !== '') return param.step;
            const values = [value, param.default, min, max]
                .map(item => Number(item))
                .filter(item => Number.isFinite(item));
            return values.some(item => !Number.isInteger(item)) ? 0.05 : 1;
        }

        return {
            renderPresetParamControl,
            renderTranslatableTextarea,
            wildcardPreviewFacts,
            canvasRelightLightValue,
            canvasRelightLightOption,
            isCanvasRelightLightDirectionParam,
            renderCanvasRelightLightDirectionControl,
            inferPresetNumberStep,
            localizedPresetParamLabel
        };
    }

    window.SimpAICanvasWorkbenchPresetParamRenderer = Object.assign({}, window.SimpAICanvasWorkbenchPresetParamRenderer || {}, {
        createCanvasPresetParamRenderer
    });
})();
