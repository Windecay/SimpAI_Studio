(function () {
    'use strict';

    function createCanvasAgentPanelViewsController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const escapeHtml = scope.escapeHtml || (value => String(value ?? ''));
        const getAgentState = (...args) => call('getAgentState', {}, ...args) || {};
        const normalizeCanvasAgentReferences = (...args) => call('normalizeCanvasAgentReferences', [], ...args) || [];
        const canvasAgentReferenceNode = (...args) => call('canvasAgentReferenceNode', null, ...args);
        const getCanvasAgentReferenceKind = (...args) => call('getCanvasAgentReferenceKind', '', ...args);
        const canvasAgentReferenceIcon = (...args) => call('canvasAgentReferenceIcon', 'fa-paperclip', ...args);
        const getCanvasAgentReferenceAsset = (...args) => call('getCanvasAgentReferenceAsset', null, ...args);
        const assetDisplaySrc = (...args) => call('assetDisplaySrc', '', ...args);
        const shouldEnableDanbooruAutocomplete = (...args) => call('shouldEnableDanbooruAutocomplete', false, ...args);
        const danbooruAutocompleteAttrs = (...args) => call('danbooruAutocompleteAttrs', '', ...args);
        const canvasAgentContextualQuickTools = (...args) => call('canvasAgentContextualQuickTools', [], ...args) || [];
        const getMaxExtraImageReferences = () => typeof scope.getMaxExtraImageReferences === 'function' ? scope.getMaxExtraImageReferences() : 0;
        const getMaxVideoReferences = () => typeof scope.getMaxVideoReferences === 'function' ? scope.getMaxVideoReferences() : 0;
        const getMaxAudioReferences = () => typeof scope.getMaxAudioReferences === 'function' ? scope.getMaxAudioReferences() : 0;
        const getCanvasAgentResolutionState = (...args) => call('getCanvasAgentResolutionState', { aspect: 'auto', multiplier: 1 }, ...args) || { aspect: 'auto', multiplier: 1 };
        const canvasAgentResolutionCompactLabel = (...args) => call('canvasAgentResolutionCompactLabel', '', ...args);
        const canvasAgentModelSummary = (...args) => call('canvasAgentModelSummary', { icon: 'fa-microchip', label: '', title: '' }, ...args) || { icon: 'fa-microchip', label: '', title: '' };
        const canvasAgentDefaultLocalRewriteModel = (...args) => call('canvasAgentDefaultLocalRewriteModel', '', ...args);
        const canvasAgentLocalRewriteModels = (...args) => call('canvasAgentLocalRewriteModels', [], ...args) || [];
        const getVlmCustomProvider = (...args) => call('getVlmCustomProvider', { label: 'Custom API', baseUrl: '' }, ...args) || { label: 'Custom API', baseUrl: '' };
        const canvasAgentCustomParamsFromSettings = (...args) => call('canvasAgentCustomParamsFromSettings', {}, ...args) || {};
        const getVlmCustomApiProfile = (...args) => call('getVlmCustomApiProfile', null, ...args);
        const getCanvasAgentCustomModelChoices = (...args) => call('getCanvasAgentCustomModelChoices', [], ...args) || [];
        const canvasAgentPresetOptionHtml = (...args) => call('canvasAgentPresetOptionHtml', '', ...args);
        const vlmModelOptionsHtml = (...args) => call('vlmModelOptionsHtml', '', ...args);
        const canvasAgentVideoQuickToolChoiceFromSettings = (...args) => call('canvasAgentVideoQuickToolChoiceFromSettings', '', ...args);
        const canvasAgentVideoQuickToolChoiceOptionHtml = (...args) => call('canvasAgentVideoQuickToolChoiceOptionHtml', '', ...args);
        const canvasAgentVideoUpscalePresetEntries = (...args) => call('canvasAgentVideoUpscalePresetEntries', [], ...args) || [];
        const vlmModelDisplayLabel = (...args) => call('vlmModelDisplayLabel', String(args[0] || ''), ...args);
        const getAspectOptions = () => typeof scope.getAspectOptions === 'function' ? scope.getAspectOptions() : [];
        const getCustomApiProviders = () => typeof scope.getCustomApiProviders === 'function' ? scope.getCustomApiProviders() : [];

        function renderCanvasAgentDecision(decision) {
            if (!decision) return '';
            const actions = Array.isArray(decision.actions) && decision.actions.length
                ? decision.actions
                : [{ value: 'ok', label: t('OK', '确定'), primary: true }, { value: 'cancel', label: t('Cancel', '取消') }];
            const facts = Array.isArray(decision.facts) ? decision.facts.filter(item => item && item.value !== undefined && item.value !== null && item.value !== '') : [];
            const fields = Array.isArray(decision.fields) ? decision.fields.filter(item => item && item.key) : [];
            const form = decision.form && typeof decision.form === 'object' ? decision.form : {};
            const decisionBusy = !!decision.busy;
            const hasPromptEditor = fields.some(field => field.key === 'prompt' && field.type === 'textarea');
            return `
<div class="sai-canvas-agent-decision" data-canvas-agent-decision="${escapeHtml(decision.id || '')}">
  <div class="sai-canvas-agent-decision-title">${escapeHtml(decision.title || t('Agent confirmation', 'Agent 确认'))}</div>
  ${decision.message ? `<div class="sai-canvas-agent-decision-msg">${escapeHtml(decision.message)}</div>` : ''}
  ${fields.length ? `<div class="sai-canvas-agent-decision-fields">${fields.map(field => {
      const current = form[field.key] != null ? String(form[field.key]) : String(field.value || '');
      const labelClass = field.wide || field.type === 'textarea' ? ' class="sai-canvas-agent-decision-field-wide"' : '';
      if (field.type === 'range') {
          const min = Number(field.min ?? 0);
          const max = Number(field.max ?? 100);
          const val = Number(current || field.value || 0);
          return `<label class="sai-canvas-agent-decision-range"><span>${escapeHtml(field.label || field.key)}</span><div class="sai-canvas-agent-range-row"><input data-canvas-agent-decision-field="${escapeHtml(field.key)}" type="range" min="${min}" max="${max}" value="${val}" ${decisionBusy ? 'disabled' : ''}><output>${val}${field.unit || '%'}</output></div></label>`;
      }
      if (field.type === 'textarea') {
          const rows = Math.max(2, Number(field.rows || 3) || 3);
          const autocompleteAttrs = shouldEnableDanbooruAutocomplete(field.key, 'canvas-agent-decision-field', { disabled: decisionBusy }) ? danbooruAutocompleteAttrs(field.key) : '';
          return `<label${labelClass}><span>${escapeHtml(field.label || field.key)}</span><textarea data-canvas-agent-decision-field="${escapeHtml(field.key)}" rows="${rows}" placeholder="${escapeHtml(field.placeholder || '')}" ${decisionBusy ? 'disabled' : ''}${autocompleteAttrs}>${escapeHtml(current)}</textarea></label>`;
      }
      if (field.type === 'text') {
          const autocompleteAttrs = shouldEnableDanbooruAutocomplete(field.key, 'canvas-agent-decision-field', { disabled: decisionBusy }) ? danbooruAutocompleteAttrs(field.key) : '';
          return `<label${labelClass}><span>${escapeHtml(field.label || field.key)}</span><input data-canvas-agent-decision-field="${escapeHtml(field.key)}" value="${escapeHtml(current)}" placeholder="${escapeHtml(field.placeholder || '')}" ${decisionBusy ? 'disabled' : ''}${autocompleteAttrs}></label>`;
      }
      const options = Array.isArray(field.options) ? field.options : [];
      return `<label${labelClass}><span>${escapeHtml(field.label || field.key)}</span><select data-canvas-agent-decision-field="${escapeHtml(field.key)}" ${decisionBusy ? 'disabled' : ''}>${options.map(option => `<option value="${escapeHtml(option.value || '')}" ${String(option.value || '') === current ? 'selected' : ''}>${escapeHtml(option.label || option.value || '')}</option>`).join('')}</select></label>`;
  }).join('')}</div>` : ''}
  ${facts.length ? `<div class="sai-canvas-agent-payload">${facts.map(item => `<div><span>${escapeHtml(item.label || '')}</span><b>${escapeHtml(item.value || '')}</b></div>`).join('')}</div>` : ''}
  ${decision.details && !hasPromptEditor ? `<pre>${escapeHtml(decision.details)}</pre>` : ''}
  ${decisionBusy ? `<div class="sai-canvas-agent-decision-busy"><i class="fa-solid fa-rotate fa-spin"></i><span>${escapeHtml(decision.busyMessage || t('Working...', '处理中...'))}</span></div>` : ''}
  ${decision.note ? `<div class="sai-canvas-agent-decision-note">${escapeHtml(decision.note)}</div>` : ''}
  <div class="sai-canvas-agent-decision-actions">
    ${actions.map(action => `<button type="button" class="${action.primary ? 'is-primary' : ''} ${action.danger ? 'danger' : ''}" data-canvas-agent-action="decision:${escapeHtml(action.value || 'ok')}" ${decisionBusy ? 'disabled' : ''}>${action.icon ? `<i class="fa-solid ${escapeHtml(action.icon)}"></i>` : ''}<span>${escapeHtml(action.label || action.value || 'OK')}</span></button>`).join('')}
  </div>
</div>`;
        }

        function renderCanvasAgentRunInfo(info) {
            if (!info) return '';
            const rows = [
                info.stage ? { label: t('Stage', '阶段'), value: info.stage } : null,
                info.preset ? { label: 'Preset', value: info.preset } : null,
                info.model ? { label: t('LLM/VLM', 'LLM/VLM'), value: info.model } : null
            ].filter(Boolean);
            if (!rows.length) return '';
            const cancelAction = String(info.cancelAction || '').trim();
            const cancelButton = cancelAction
                ? `<button type="button" class="danger" data-canvas-agent-action="${escapeHtml(cancelAction)}" title="${escapeHtml(t('Stop thinking', '停止思考'))}"><i class="fa-solid fa-stop"></i><span>${escapeHtml(t('Stop', '停止'))}</span></button>`
                : '';
            return `<div class="sai-canvas-agent-run-info">${rows.map(item => `<span><b>${escapeHtml(item.label)}</b>${escapeHtml(item.value)}</span>`).join('')}${cancelButton}</div>`;
        }

        function renderCanvasAgentReferenceChip(ref, index, options) {
            const opts = options || {};
            const node = canvasAgentReferenceNode(ref);
            const kind = ref.kind || getCanvasAgentReferenceKind(node);
            const icon = canvasAgentReferenceIcon(kind);
            const thumb = kind !== 'audio' && kind !== 'text' ? (ref.thumb || assetDisplaySrc(getCanvasAgentReferenceAsset(node)) || '') : '';
            const primaryButton = kind === 'image' && ref.role !== 'primary'
                ? `<button type="button" data-canvas-agent-action="promote-reference:${index}" title="${escapeHtml(t('Set as main image', '设为主图'))}"><i class="fa-solid fa-star"></i></button>`
                : '';
            return `<span class="sai-canvas-agent-ref-chip ${ref.role === 'primary' ? 'is-primary-ref' : ''}" title="${escapeHtml(ref.label || '')}">
  ${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : `<i class="fa-solid ${escapeHtml(icon)}"></i>`}
  <b>${escapeHtml(ref.role === 'primary' ? t('Main', '主图') : (kind === 'audio' ? t('Audio', '音频') : (kind === 'text' ? t('Text', '文本') : t('Ref', '参考'))))}</b>
  <span>${escapeHtml(ref.label || node?.title || node?.id || kind)}</span>
  ${primaryButton}
  <button type="button" data-canvas-agent-action="remove-reference:${index}" ${opts.disabled ? 'disabled' : ''} title="${escapeHtml(t('Remove reference', '移除引用'))}"><i class="fa-solid fa-xmark"></i></button>
</span>`;
        }

        function renderCanvasAgentInlineReferences(disabled) {
            const refs = normalizeCanvasAgentReferences();
            if (!refs.length) return '';
            return `<div class="sai-canvas-agent-inline-refs" aria-label="${escapeHtml(t('Attached references', '已挂载引用'))}">
  ${refs.map((ref, index) => {
      const node = canvasAgentReferenceNode(ref);
      const kind = ref.kind || getCanvasAgentReferenceKind(node);
      const icon = canvasAgentReferenceIcon(kind);
      const thumb = kind !== 'audio' && kind !== 'text' ? (ref.thumb || assetDisplaySrc(getCanvasAgentReferenceAsset(node)) || '') : '';
      const role = ref.role === 'primary' ? t('Main', '主图') : (kind === 'text' ? t('Text', '文本') : (kind === 'audio' ? t('Audio', '音频') : t('Ref', '参考')));
      return `<span class="sai-canvas-agent-inline-ref ${ref.role === 'primary' ? 'is-primary-ref' : ''}" title="${escapeHtml(`${role} · ${ref.label || ''}`)}">
  ${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : `<i class="fa-solid ${escapeHtml(icon)}"></i>`}
  <b>${escapeHtml(role)}</b>
  <button type="button" data-canvas-agent-action="remove-reference:${index}" ${disabled ? 'disabled' : ''} title="${escapeHtml(t('Remove reference', '移除引用'))}"><i class="fa-solid fa-xmark"></i></button>
</span>`;
  }).join('')}
</div>`;
        }

        function renderCanvasAgentReferences(disabled) {
            const refs = normalizeCanvasAgentReferences();
            const main = refs.filter(ref => ref.kind === 'image' && ref.role === 'primary');
            const imageRefs = refs.filter(ref => ref.kind === 'image' && ref.role !== 'primary');
            const videos = refs.filter(ref => ref.kind === 'video');
            const audio = refs.filter(ref => ref.kind === 'audio');
            const texts = refs.filter(ref => ref.kind === 'text');
            const group = (label, list, empty) => `
<div class="sai-canvas-agent-ref-group">
  <span>${escapeHtml(label)}</span>
  <div>${list.length ? list.map(ref => renderCanvasAgentReferenceChip(ref, refs.indexOf(ref), { disabled })).join('') : `<em>${escapeHtml(empty)}</em>`}</div>
</div>`;
            return `<div class="sai-canvas-agent-refs">
  ${group(t('Main', '主素材'), main, t('No main image', '暂无主图'))}
  ${group(t('Image references', '图片参考'), imageRefs, t('Up to {count} extra images', '最多 {count} 张额外参考图').replace('{count}', getMaxExtraImageReferences()))}
  ${group(t('Video', '视频'), videos, t('Up to {count} video references', '最多 {count} 个视频引用').replace('{count}', getMaxVideoReferences()))}
  ${group(t('Audio', '音频'), audio, t('Up to {count} audio references', '最多 {count} 个音频引用').replace('{count}', getMaxAudioReferences()))}
  ${texts.length ? group(t('Prompt text', '提示词文本'), texts, '') : ''}
</div>`;
        }

        function renderCanvasAgentToolShelf(disabled) {
            const tools = canvasAgentContextualQuickTools();
            return `<div class="sai-canvas-agent-tool-shelf" aria-label="${escapeHtml(t('Quick tools', '快捷工具'))}">
  ${tools.map(tool => `<button type="button" data-canvas-agent-action="tool:${escapeHtml(tool.key)}" ${disabled ? 'disabled' : ''} title="${escapeHtml(tool.label)}"><i class="fa-solid ${escapeHtml(tool.icon)}"></i><span>${escapeHtml(tool.label)}</span></button>`).join('')}
</div>`;
        }

        function renderCanvasAgentCompactToolbar(disabled, pickActive) {
            const tools = canvasAgentContextualQuickTools();
            const hasRefs = normalizeCanvasAgentReferences().length > 0;
            return `<div class="sai-canvas-agent-quick-toolbar" aria-label="${escapeHtml(t('Agent quick toolbar', 'Agent 快捷工具栏'))}">
  ${tools.map(tool => `<button type="button" data-canvas-agent-action="tool:${escapeHtml(tool.key)}" ${disabled ? 'disabled' : ''} title="${escapeHtml(tool.label)}" aria-label="${escapeHtml(tool.label)}"><i class="fa-solid ${escapeHtml(tool.icon)}"></i></button>`).join('')}
  <span class="sai-canvas-agent-quick-separator" aria-hidden="true"></span>
  <button type="button" data-canvas-agent-action="use-selected" ${disabled ? 'disabled' : ''} title="${escapeHtml(t('Use selected', '引用选中'))}" aria-label="${escapeHtml(t('Use selected', '引用选中'))}"><i class="fa-solid fa-square-check"></i></button>
  <button type="button" class="${pickActive ? 'is-active' : ''}" data-canvas-agent-action="${pickActive ? 'cancel-pick-reference' : 'pick-reference'}" ${disabled ? 'disabled' : ''} title="${escapeHtml(pickActive ? t('Cancel pick', '取消选择') : t('Pick from canvas', '从画布选择'))}" aria-label="${escapeHtml(pickActive ? t('Cancel pick', '取消选择') : t('Pick from canvas', '从画布选择'))}"><i class="fa-solid fa-crosshairs"></i></button>
  <button type="button" data-canvas-agent-action="clear-references" ${disabled || !hasRefs ? 'disabled' : ''} title="${escapeHtml(t('Clear refs', '清空引用'))}" aria-label="${escapeHtml(t('Clear refs', '清空引用'))}"><i class="fa-solid fa-trash-can"></i></button>
</div>`;
        }

        function renderCanvasAgentResolutionControls(disabled) {
            const state = getCanvasAgentResolutionState();
            const scale = Number(state.multiplier || 1).toFixed(1);
            return `<div class="sai-canvas-agent-resolution">
  <div class="sai-canvas-agent-resolution-head">
    <span>${escapeHtml(t('Quality', '画质'))}</span>
    <b data-canvas-agent-scale-label>${escapeHtml(scale)}x</b>
  </div>
  <div class="sai-canvas-agent-aspects" role="group">
    ${getAspectOptions().map((item) => `<button type="button" data-canvas-agent-action="aspect:${escapeHtml(item.key)}" class="${state.aspect === item.key ? 'is-active' : ''}" ${disabled ? 'disabled' : ''}>${item.icon ? `<i class="fa-solid ${escapeHtml(item.icon)}"></i>` : '<i></i>'}<span>${escapeHtml(item.label)}</span></button>`).join('')}
  </div>
  <label class="sai-canvas-agent-scale"><span>${escapeHtml(t('Resolution scale', '分辨率倍率'))}</span><input data-canvas-agent-scale type="range" min="1" max="2" step="0.1" value="${escapeHtml(scale)}" ${disabled ? 'disabled' : ''}><input data-canvas-agent-scale type="number" min="1" max="2" step="0.1" value="${escapeHtml(scale)}" ${disabled ? 'disabled' : ''}></label>
</div>`;
        }

        function renderCanvasAgentResolutionButton(disabled) {
            const state = getAgentState();
            const open = !!state.resolutionOpen;
            return `<div class="sai-canvas-agent-resolution-line">
  <button type="button" class="sai-canvas-agent-resolution-button ${open ? 'is-active' : ''}" data-canvas-agent-action="toggle-resolution-picker" ${disabled ? 'disabled' : ''} title="${escapeHtml(t('Resolution', '分辨率'))}"><i class="fa-solid fa-crop-simple"></i><b data-canvas-agent-resolution-label>${escapeHtml(canvasAgentResolutionCompactLabel())}</b><i class="fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}"></i></button>
</div>`;
        }

        function renderCanvasAgentModelChip(settings, disabled) {
            const state = getAgentState();
            const summary = canvasAgentModelSummary(settings);
            return `<button type="button" class="sai-canvas-agent-model-chip ${state.modelPickerOpen ? 'is-active' : ''}" data-canvas-agent-action="toggle-model-picker" ${disabled ? 'disabled' : ''} title="${escapeHtml(summary.title)}" aria-label="${escapeHtml(t('Choose Agent model', '选择 Agent 模型'))}">
  <i class="fa-solid ${escapeHtml(summary.icon)}"></i>
  <span>${escapeHtml(summary.label)}</span>
</button>`;
        }

        function renderCanvasAgentModelPicker(settings, disabled) {
            const custom = settings.rewriteModel === 'Custom';
            const localModels = canvasAgentLocalRewriteModels(settings.rewriteModel);
            const selectedLocalModel = custom ? canvasAgentDefaultLocalRewriteModel() : (settings.rewriteModel || canvasAgentDefaultLocalRewriteModel());
            const provider = getVlmCustomProvider(settings.customProvider || 'openai');
            const modelChoices = getCanvasAgentCustomModelChoices();
            const localModelOptions = localModels.map(model => {
                const label = vlmModelDisplayLabel(model, model);
                return `<option value="${escapeHtml(model)}" ${model === selectedLocalModel ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            }).join('');
            const providerOptions = getCustomApiProviders().map(item => `<option value="${escapeHtml(item.key)}" ${item.key === (settings.customProvider || 'openai') ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
            const customModelControl = modelChoices.length
                ? `<select data-canvas-agent-setting="customModel" ${disabled ? 'disabled' : ''}><option value="">${escapeHtml(t('Select model...', '选择模型...'))}</option>${modelChoices.map(item => `<option value="${escapeHtml(item)}" ${item === settings.customModel ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}</select>`
                : `<input data-canvas-agent-setting="customModel" value="${escapeHtml(settings.customModel || '')}" placeholder="gpt-4o-mini / Qwen-VL" ${disabled ? 'disabled' : ''}>`;
            return `<div class="sai-canvas-agent-model-popover" data-canvas-agent-model-popover>
  <label>
    <span>${escapeHtml(t('Source', '来源'))}</span>
    <select data-canvas-agent-model-mode ${disabled ? 'disabled' : ''}>
      <option value="local" ${custom ? '' : 'selected'}>${escapeHtml(t('Local VLM', '本地 VLM'))}</option>
      <option value="custom" ${custom ? 'selected' : ''}>Custom API</option>
    </select>
  </label>
  ${custom ? `
  <label>
    <span>${escapeHtml(t('Provider', '服务商'))}</span>
    <select data-canvas-agent-setting="customProvider" ${disabled ? 'disabled' : ''}>${providerOptions}</select>
  </label>
  <label>
    <span>${escapeHtml(t('API model', 'API 模型'))}</span>
    ${customModelControl}
  </label>
  <div class="sai-canvas-agent-model-actions">
    <button type="button" data-canvas-agent-action="fetch-agent-custom-models-inline" ${disabled ? 'disabled' : ''}><i class="fa-solid fa-arrows-rotate"></i><span>${escapeHtml(t('Fetch Models', '拉取模型'))}</span></button>
    <button type="button" data-canvas-agent-action="open-settings"><i class="fa-solid fa-gear"></i><span>${escapeHtml(t('API settings', 'API 设置'))}</span></button>
  </div>
  <div class="sai-canvas-agent-model-note">${escapeHtml(provider.baseUrl || settings.customBaseUrl || t('Base URL is configured in Agent settings.', 'Base URL 在 Agent 设置里配置。'))}</div>` : `
  <label>
    <span>${escapeHtml(t('Model', '模型'))}</span>
    <select data-canvas-agent-setting="rewriteModel" ${disabled ? 'disabled' : ''}>${localModelOptions}</select>
  </label>`}
</div>`;
        }

        function renderCanvasAgentCustomApiSettings(settings) {
            const src = settings || {};
            const provider = getVlmCustomProvider(src.customProvider || 'openai');
            const params = canvasAgentCustomParamsFromSettings(src, false);
            const profile = getVlmCustomApiProfile(params);
            const collapsed = src.customApiCollapsed !== false;
            const modelChoices = getCanvasAgentCustomModelChoices();
            const modelControl = modelChoices.length
                ? `<select data-canvas-agent-setting="customModel"><option value="">${escapeHtml(t('Select model...', '选择模型...'))}</option>${modelChoices.map(item => `<option value="${escapeHtml(item)}" ${item === src.customModel ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}</select>`
                : `<input data-canvas-agent-setting="customModel" value="${escapeHtml(src.customModel || '')}" placeholder="gpt-4o-mini / Qwen-VL">`;
            return `<section class="sai-settings-section sai-agent-custom-api ${collapsed ? 'is-collapsed' : ''}">
      <div class="sai-settings-section-head">
        <h3>${escapeHtml(t('Custom API', 'Custom API'))}</h3>
        <button type="button" data-canvas-settings-action="toggle-agent-custom-api"><i class="fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i><span>${escapeHtml(collapsed ? t('Expand', '展开') : t('Collapse', '折叠'))}</span></button>
      </div>
      <div class="sai-settings-status">${escapeHtml(`${src.customApiName || provider.label || 'Custom'}${src.customModel ? ` · ${src.customModel}` : ''}`)}</div>
      ${collapsed ? '' : `
      <label><span>${escapeHtml(t('API Name', 'API 名称'))}</span><input data-canvas-agent-setting="customApiName" value="${escapeHtml(src.customApiName || provider.label || '')}" placeholder="OpenAI / SiliconFlow"></label>
      <label><span>${escapeHtml(t('Provider', '服务商'))}</span><select data-canvas-agent-setting="customProvider">${getCustomApiProviders().map(item => `<option value="${escapeHtml(item.key)}" ${item.key === (src.customProvider || 'openai') ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select></label>
      <label><span>${escapeHtml(t('API Base URL', 'API Base URL'))}</span><input data-canvas-agent-setting="customBaseUrl" value="${escapeHtml(src.customBaseUrl || provider.baseUrl || '')}" placeholder="https://api.openai.com/v1"></label>
      <label><span>${escapeHtml(t('API Format', '接口格式'))}</span><select data-canvas-agent-setting="customApiFormat"><option value="openai_compatible" ${src.customApiFormat === 'openai_compatible' ? 'selected' : ''}>OpenAI Chat Completions</option><option value="openai_responses" ${src.customApiFormat === 'openai_responses' ? 'selected' : ''}>OpenAI Responses</option></select></label>
      <label><span>${escapeHtml(t('Model', '模型'))}</span>${modelControl}</label>
      <label><span>${escapeHtml(t('API Key', 'API Key'))}</span><input data-canvas-agent-custom-key type="password" value="${escapeHtml(profile?.api_key || '')}" placeholder="${escapeHtml(profile?.api_key ? t('Secret loaded locally', '已从本地读取密钥') : t('Optional for Ollama/LM Studio', 'Ollama/LM Studio 可留空'))}"></label>
      <label class="sai-settings-check"><input type="checkbox" data-canvas-agent-setting="customSupportsImages" ${src.customSupportsImages !== false ? 'checked' : ''}><span>${escapeHtml(t('Selected model supports image input', '当前模型支持图像输入'))}</span></label>
      <div class="sai-settings-actions sai-agent-custom-api-actions">
        <button type="button" data-canvas-settings-action="save-agent-custom-api-key"><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(t('Save Key', '保存秘钥'))}</span></button>
        <button type="button" data-canvas-settings-action="fetch-agent-custom-models"><i class="fa-solid fa-arrows-rotate"></i><span>${escapeHtml(t('Fetch Models', '拉取模型'))}</span></button>
        <button type="button" data-canvas-settings-action="test-agent-custom-api"><i class="fa-solid fa-vial-circle-check"></i><span>${escapeHtml(t('Test API', '测试 API'))}</span></button>
        <button type="button" data-canvas-settings-action="sync-agent-custom-from-vlm"><i class="fa-solid fa-arrow-down"></i><span>${escapeHtml(t('From VLM', '从 VLM 同步'))}</span></button>
        <button type="button" data-canvas-settings-action="sync-agent-custom-to-vlm"><i class="fa-solid fa-arrow-up"></i><span>${escapeHtml(t('To VLM', '同步到 VLM'))}</span></button>
      </div>`}
    </section>`;
        }

        function renderCanvasAgentSettingsTab(settings, scanState, readyCountValue) {
            const src = settings || {};
            const scan = scanState || {};
            const scanBusy = scan.state === 'checking';
            const readyCount = Number.isFinite(Number(readyCountValue)) ? Number(readyCountValue) : 0;
            const promptStrategyOptions = [
                ['ask', t('Ask every time', '每次询问')],
                ['rewrite', t('Always refine', '总是优化')],
                ['direct', t('Use original', '直接使用原文')]
            ];
            const executionRouteOptions = [
                ['programmatic', t('Programmatic helper', '程序化执行')],
                ['vlm_plan', t('Thinking mode', 'Thinking 思考模式')]
            ];
            const presetModeOptions = [
                ['auto', t('Auto fallback queue', '自动 fallback 队列')],
                ['preferred', t('Preferred ready preset', '优先指定 preset')]
            ];
            const upscaleModeOptions = [
                ['uov_auto', t('Use T2I preset UOV auto', '使用文生图 preset 的 UOV Auto')],
                ['dedicated_preset', t('Dedicated upscale preset', '专用放大 preset')]
            ];
            const rewriteOptions = vlmModelOptionsHtml(src.rewriteModel);
            const selectOptions = (list, value) => list.map(([key, label]) => `<option value="${escapeHtml(key)}" ${key === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
            return `
    <section class="sai-settings-section">
      <h3>${escapeHtml(t('Agent Companion', 'Agent 伴随小窗'))}</h3>
      <label class="sai-settings-check"><input type="checkbox" data-canvas-agent-setting="enabled" ${src.enabled ? 'checked' : ''}><span>${escapeHtml(t('Show Agent mini window', '显示 Agent 小窗'))}</span></label>
      <label><span>${escapeHtml(t('Execution route', '执行路线'))}</span><select data-canvas-agent-setting="executionRoute">${selectOptions(executionRouteOptions, src.executionRoute)}</select></label>
      <label><span>${escapeHtml(t('Prompt strategy', '提示词策略'))}</span><select data-canvas-agent-setting="promptStrategy">${selectOptions(promptStrategyOptions, src.promptStrategy)}</select></label>
      <label><span>${escapeHtml(t('Refine LLM/VLM', '优化使用 LLM/VLM'))}</span><select data-canvas-agent-setting="rewriteModel">${rewriteOptions}</select></label>
      <label><span>${escapeHtml(t('Video frames', '视频抽帧数'))}</span><input data-canvas-agent-setting="videoFrames" type="number" min="1" max="32" step="1" value="${escapeHtml(src.videoFrames)}"></label>
      <label class="sai-settings-check"><input type="checkbox" data-canvas-agent-setting="allowPresetInstructionOverride" ${src.allowPresetInstructionOverride ? 'checked' : ''}><span>${escapeHtml(t('Allow prompt to override preset', '允许提示词指定 preset 覆盖偏好'))}</span></label>
    </section>
    ${src.rewriteModel === 'Custom' ? renderCanvasAgentCustomApiSettings(src) : ''}
    <section class="sai-settings-section">
      <div class="sai-settings-section-head">
        <h3>${escapeHtml(t('Ready Presets', '可用 Preset'))}</h3>
        <button type="button" data-canvas-settings-action="refresh-agent-presets" ${scanBusy ? 'disabled' : ''}><i class="fa-solid fa-rotate"></i><span>${escapeHtml(scanBusy ? t('Checking', '检查中') : t('Refresh', '刷新'))}</span></button>
      </div>
      <div class="sai-settings-status" data-state="${escapeHtml(scan.state || 'idle')}">${escapeHtml(scanBusy ? t('Checking {checked}/{total}; ready {ready}', '正在检查 {checked}/{total}；可用 {ready}').replace('{checked}', scan.checked || 0).replace('{total}', scan.total || 0).replace('{ready}', readyCount) : (scan.message || t('Dropdowns only show presets whose model files are ready.', '下拉列表只显示模型文件齐全可用的 preset。')))}</div>
      <label><span>${escapeHtml(t('Text-to-image mode', '文生图模式'))}</span><select data-canvas-agent-setting="t2iPresetMode">${selectOptions(presetModeOptions, src.t2iPresetMode)}</select></label>
      <label><span>${escapeHtml(t('Text-to-image preset', '文生图 preset'))}</span><select data-canvas-agent-setting="t2iPreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.t2iPreset)}</select></label>
      <label><span>${escapeHtml(t('Image-edit mode', '图片编辑模式'))}</span><select data-canvas-agent-setting="editPresetMode">${selectOptions(presetModeOptions, src.editPresetMode)}</select></label>
      <label><span>${escapeHtml(t('Image-edit preset', '图片编辑预设'))}</span><select data-canvas-agent-setting="editPreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.editPreset)}</select></label>
      <label><span>${escapeHtml(t('Image-to-video mode', '图生视频模式'))}</span><select data-canvas-agent-setting="i2vPresetMode">${selectOptions(presetModeOptions, src.i2vPresetMode)}</select></label>
      <label><span>${escapeHtml(t('Image-to-video preset', '图生视频预设'))}</span><select data-canvas-agent-setting="i2vPreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.i2vPreset)}</select></label>
      <label><span>${escapeHtml(t('Text-to-video mode', '文生视频模式'))}</span><select data-canvas-agent-setting="t2vPresetMode">${selectOptions(presetModeOptions, src.t2vPresetMode)}</select></label>
      <label><span>${escapeHtml(t('Text-to-video preset', '文生视频预设'))}</span><select data-canvas-agent-setting="t2vPreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.t2vPreset)}</select></label>
      <label><span>${escapeHtml(t('Video-edit mode', '视频编辑模式'))}</span><select data-canvas-agent-setting="videoEditPresetMode">${selectOptions(presetModeOptions, src.videoEditPresetMode)}</select></label>
      <label><span>${escapeHtml(t('Video-edit preset', '视频编辑预设'))}</span><select data-canvas-agent-setting="videoEditPreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.videoEditPreset)}</select></label>
      <label><span>${escapeHtml(t('Audio mode', '音频模式'))}</span><select data-canvas-agent-setting="audioPresetMode">${selectOptions(presetModeOptions, src.audioPresetMode)}</select></label>
      <label><span>${escapeHtml(t('Audio preset', '音频预设'))}</span><select data-canvas-agent-setting="audioPreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.audioPreset)}</select></label>
    </section>
    <section class="sai-settings-section">
      <h3>${escapeHtml(t('Quick Tool Presets', '快捷工具 Preset'))}</h3>
      <label><span>${escapeHtml(t('Outpaint preset', '扩图 preset'))}</span><select data-canvas-agent-setting="outpaintPreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.outpaintPreset)}</select></label>
      <label><span>${escapeHtml(t('Erase preset', '擦除 preset'))}</span><select data-canvas-agent-setting="erasePreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.erasePreset)}</select></label>
      <label><span>${escapeHtml(t('Replace preset', '替换 preset'))}</span><select data-canvas-agent-setting="replacePreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.replacePreset)}</select></label>
      <label><span>${escapeHtml(t('Upscale mode', '放大模式'))}</span><select data-canvas-agent-setting="upscalePresetMode">${selectOptions(upscaleModeOptions, src.upscalePresetMode)}</select></label>
      <label><span>${escapeHtml(t('Upscale scene preset', '专用放大 SCENE'))}</span><select data-canvas-agent-setting="upscalePreset" ${readyCount && src.upscalePresetMode === 'dedicated_preset' ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.upscalePreset)}</select></label>
    </section>
    <section class="sai-settings-section">
      <h3>${escapeHtml(t('Video Quick Tool Presets', '视频快捷工具 Preset'))}</h3>
      <label><span>${escapeHtml(t('Video outpaint preset', '视频扩图 preset'))}</span><select data-canvas-agent-setting="videoOutpaintPreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.videoOutpaintPreset)}</select></label>
      <label><span>${escapeHtml(t('Video erase preset', '视频擦除 preset'))}</span><select data-canvas-agent-setting="videoErasePreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.videoErasePreset)}</select></label>
      <label><span>${escapeHtml(t('Video edit preset', '视频编辑 preset'))}</span><select data-canvas-agent-setting="videoReplacePreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.videoReplacePreset)}</select></label>
      <label><span>${escapeHtml(t('Video face swap route', '视频换脸路线'))}</span><select data-canvas-agent-setting="videoFaceSwapChoice">${canvasAgentVideoQuickToolChoiceOptionHtml('face_swap', canvasAgentVideoQuickToolChoiceFromSettings('face_swap'))}</select></label>
      <label><span>${escapeHtml(t('Motion transfer route', '动作迁移路线'))}</span><select data-canvas-agent-setting="videoMotionTransferChoice">${canvasAgentVideoQuickToolChoiceOptionHtml('motion_transfer', canvasAgentVideoQuickToolChoiceFromSettings('motion_transfer'))}</select></label>
      <label><span>${escapeHtml(t('Video upscale preset', '视频放大 preset'))}</span><select data-canvas-agent-setting="videoUpscalePreset" ${readyCount ? '' : 'disabled'}>${canvasAgentPresetOptionHtml(src.videoUpscalePreset, { entries: canvasAgentVideoUpscalePresetEntries(src.videoUpscalePreset) })}</select></label>
    </section>
    <section class="sai-settings-section">
      <h3>${escapeHtml(t('Fallback Rules', 'Fallback 规则'))}</h3>
      <div class="sai-settings-note">${escapeHtml(t('If a ready preset is selected, Agent tries it before the local queue. Auto queues: T2I starts with Z-imageT, image edit with Flux2-KleinEdit then MiniMax-H3(R2I), I2V with Wan(I2V), T2V with Wan(T2V), and video edit with Wan-Extent. Audio has no default queue until you configure an audio-capable preset. If your prompt names a preset, Agent can use that as a temporary override when enabled.', '如果已选择 ready preset，Agent 会先尝试它，再走本地队列。Auto 队列：文生图从 Z-imageT 开始，图片编辑依次尝试 Flux2-KleinEdit 和 MiniMax-H3(R2I)，图生视频从 Wan(I2V) 开始，文生视频从 Wan(T2V) 开始，视频编辑从 Wan-Extent 开始。音频默认不绑定队列，直到你配置支持音频的 preset。开启指令覆盖后，如果提示词里点名 preset，Agent 会临时采用它。'))}</div>
    </section>`;
        }

        return {
            renderCanvasAgentDecision,
            renderCanvasAgentRunInfo,
            renderCanvasAgentReferenceChip,
            renderCanvasAgentInlineReferences,
            renderCanvasAgentReferences,
            renderCanvasAgentToolShelf,
            renderCanvasAgentCompactToolbar,
            renderCanvasAgentResolutionControls,
            renderCanvasAgentResolutionButton,
            renderCanvasAgentModelChip,
            renderCanvasAgentModelPicker,
            renderCanvasAgentCustomApiSettings,
            renderCanvasAgentSettingsTab
        };
    }

    window.SimpAICanvasWorkbenchPanelViews = Object.assign({}, window.SimpAICanvasWorkbenchPanelViews || {}, {
        createCanvasAgentPanelViewsController
    });
})();
