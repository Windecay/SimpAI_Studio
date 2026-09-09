(function () {
    'use strict';

    function createCanvasVlmNodeView(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const escapeHtml = scope.escapeHtml || (value => String(value ?? ''));
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getArrayConfig = (name, fallback) => {
            const value = call(name, fallback);
            return Array.isArray(value) ? value : fallback;
        };
        const getNumberConfig = (name, fallback) => Number(call(name, fallback)) || fallback;
        const VLM_VERSION_CHOICES = (() => {
            const value = getArrayConfig('getVlmVersionChoices', ['Custom']);
            return value.length ? value : ['Custom'];
        })();
        const VLM_CHAT_TOOL_COMMANDS = getArrayConfig('getVlmChatToolCommands', []);
        const VLM_CHAT_DEFAULT_FONT_SIZE = getNumberConfig('getVlmChatDefaultFontSize', 14);
        const VLM_CHAT_DEFAULT_MAX_HISTORY = getNumberConfig('getVlmChatDefaultMaxHistory', 12);
        const VLM_CHAT_CONTEXT_CHARS_MIN = getNumberConfig('getVlmChatContextCharsMin', 1200);
        const VLM_CHAT_DEFAULT_CONTEXT_CHARS = getNumberConfig('getVlmChatDefaultContextChars', 6000);
        const VLM_IMAGE_SLOTS = getArrayConfig('getVlmImageSlots', []);
        const VLM_AGENT_MODE_CHOICES = getArrayConfig('getVlmAgentModeChoices', []);
        const VLM_CUSTOM_API_PROVIDERS = getArrayConfig('getVlmCustomApiProviders', []);
        const getNode = (...args) => call('getNode', null, ...args);
        const notConnectedText = (...args) => call('notConnectedText', t('Not connected', '未连接'), ...args);
        const getVlmSourceAsset = (...args) => call('getVlmSourceAsset', null, ...args);
        const safeAssetDisplaySrc = (...args) => call('safeAssetDisplaySrc', '', ...args);
        const nodeStatusState = (...args) => call('nodeStatusState', '', ...args);
        const isVlmNodeBusy = (...args) => !!call('isVlmNodeBusy', false, ...args);
        const normalizeVlmAgentMode = (...args) => call('normalizeVlmAgentMode', 'raw', ...args);
        const vlmChatContextBudgetMax = (...args) => call('vlmChatContextBudgetMax', VLM_CHAT_DEFAULT_CONTEXT_CHARS, ...args);
        const clampVlmChatContextBudget = (...args) => call('clampVlmChatContextBudget', VLM_CHAT_DEFAULT_CONTEXT_CHARS, ...args);
        const vlmModelOptionsHtml = (...args) => call('vlmModelOptionsHtml', '', ...args);
        const renderNodeStateBadges = (...args) => call('renderNodeStateBadges', '', ...args);
        const renderVlmChatLog = (...args) => call('renderVlmChatLog', '', ...args);
        const renderVlmSystemPromptTemplatePicker = (...args) => call('renderVlmSystemPromptTemplatePicker', '', ...args);
        const renderTranslatableTextarea = (...args) => call('renderTranslatableTextarea', '', ...args);
        const getTranslationFieldState = (...args) => call('getTranslationFieldState', null, ...args);
        const getVlmCustomProvider = (...args) => call('getVlmCustomProvider', {}, ...args);
        const getVlmCustomApiProfile = (...args) => call('getVlmCustomApiProfile', null, ...args);

        function renderVlmModelStatusHtml(node) {
            const status = node?.vlm_model_status && typeof node.vlm_model_status === 'object' ? node.vlm_model_status : {};
            const state = String(status.state || (status.ready ? 'ready' : 'unknown')).toLowerCase();
            const missingCount = Number(status.missing_count ?? 0);
            const countText = Number.isFinite(missingCount) && missingCount > 0 ? ` ${missingCount}` : '';
            const icons = {
                ready: 'fa-circle-check',
                missing: 'fa-triangle-exclamation',
                checking: 'fa-spinner fa-spin',
                queued: 'fa-cloud-arrow-down',
                custom: 'fa-plug',
                error: 'fa-circle-xmark',
                unknown: 'fa-circle-question'
            };
            const labels = {
                ready: t('Model ready', '模型已就绪'),
                missing: `${t('Missing', '缺失')}${countText}`,
                checking: t('Checking', '检查中'),
                queued: `${t('Queued', '已排队')}${countText}`,
                custom: t('Custom API', 'Custom API'),
                error: t('Check failed', '检查失败'),
                unknown: t('Check model', '检查模型')
            };
            const message = status.message || (state === 'unknown' ? t('Check before run to avoid hidden downloads.', '运行前检查，避免暗箱下载。') : '');
            return `<div class="sai-preset-model-row sai-vlm-model-row" data-model-state="${escapeHtml(state)}">
  <button type="button" data-node-action="check-vlm-model" title="${escapeHtml(t('Check or queue required VLM model files', '检查或排队下载所需 VLM 模型'))}">
    <i class="fa-solid ${icons[state] || icons.unknown}"></i><span>${escapeHtml(labels[state] || labels.unknown)}</span>
  </button>
  <small>${escapeHtml(message)}</small>
</div>`;
        }

        function renderVlmCustomApiConfig(node) {
            const params = node.params || {};
            const provider = getVlmCustomProvider(params.custom_provider || 'openai');
            const profile = getVlmCustomApiProfile(params);
            const apiName = params.custom_api_name || provider.label || 'OpenAI';
            const baseUrl = params.custom_base_url || provider.baseUrl || '';
            const format = params.custom_api_format || provider.format || 'openai_compatible';
            const model = params.custom_model || '';
            const supportsImages = params.custom_supports_images != null ? !!params.custom_supports_images : provider.supportsImages !== false;
            const modelChoices = Array.isArray(node.custom_model_choices) ? node.custom_model_choices : [];
            const collapsed = params.custom_api_collapsed === true;
            const modelControl = modelChoices.length
                ? `<select data-vlm-param="custom_model"><option value="">${escapeHtml(t('Select model...', '选择模型...'))}</option>${modelChoices.map(item => `<option value="${escapeHtml(item)}" ${item === model ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}</select>`
                : `<input data-vlm-param="custom_model" value="${escapeHtml(model)}" placeholder="gpt-4o-mini / deepseek-ai/DeepSeek-V3.2">`;
            return `<div class="sai-vlm-custom-api ${collapsed ? 'is-collapsed' : ''}">
  <div class="sai-vlm-custom-head">
    <b>${escapeHtml(t('Custom API', 'Custom API'))}</b>
    <span>${escapeHtml(`${apiName}${model ? ` · ${model}` : ''}`)}</span>
    <button type="button" data-node-action="toggle-vlm-custom-api" title="${escapeHtml(collapsed ? t('Expand API settings', '展开 API 设置') : t('Collapse API settings', '折叠 API 设置'))}"><i class="fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i></button>
  </div>
  ${collapsed ? '' : `
  <div class="sai-vlm-custom-grid">
    <label class="sai-node-field"><span>${escapeHtml(t('API Name', 'API 名称'))}</span><input data-vlm-param="custom_api_name" value="${escapeHtml(apiName)}" placeholder="OpenAI / SiliconFlow"></label>
    <label class="sai-node-field"><span>${escapeHtml(t('Provider', '服务商'))}</span><select data-vlm-param="custom_provider">${VLM_CUSTOM_API_PROVIDERS.map(item => `<option value="${escapeHtml(item.key)}" ${item.key === (params.custom_provider || 'openai') ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select></label>
    <label class="sai-node-field"><span>${escapeHtml(t('API Format', '接口格式'))}</span><select data-vlm-param="custom_api_format"><option value="openai_compatible" ${format === 'openai_compatible' ? 'selected' : ''}>OpenAI Chat Completions</option><option value="openai_responses" ${format === 'openai_responses' ? 'selected' : ''}>OpenAI Responses</option></select></label>
    <label class="sai-node-field"><span>${escapeHtml(t('API Base URL', 'API Base URL'))}</span><input data-vlm-param="custom_base_url" value="${escapeHtml(baseUrl)}" placeholder="https://api.openai.com/v1"></label>
    <label class="sai-node-field sai-vlm-api-key-field"><span>${escapeHtml(t('API Key', 'API Key'))}</span><input data-vlm-custom-key type="password" value="${escapeHtml(profile?.api_key || '')}" placeholder="${escapeHtml(profile?.api_key ? t('Secret loaded locally', '已从本地读取密钥') : t('Optional for Ollama/LM Studio', 'Ollama/LM Studio 可留空'))}"></label>
    <label class="sai-node-field"><span>${escapeHtml(t('Model', '模型'))}</span>${modelControl}</label>
  </div>
  <div class="sai-vlm-custom-actions">
    <button type="button" data-node-action="load-vlm-custom-secret"><i class="fa-solid fa-key"></i><span>${escapeHtml(t('Read Key', '读取秘钥'))}</span></button>
    <button type="button" data-node-action="save-vlm-custom-secret"><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(t('Save Key', '保存秘钥'))}</span></button>
    <button type="button" data-node-action="delete-vlm-custom-secret"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete Key', '删除秘钥'))}</span></button>
    <button type="button" data-node-action="fetch-vlm-custom-models"><i class="fa-solid fa-arrows-rotate"></i><span>${escapeHtml(t('Fetch Models', '拉取模型列表'))}</span></button>
    <button type="button" data-node-action="test-vlm-custom-api"><i class="fa-solid fa-vial-circle-check"></i><span>${escapeHtml(t('Test API', '测试 API'))}</span></button>
    <button type="button" data-node-action="sync-vlm-custom-from-agent"><i class="fa-solid fa-arrow-down"></i><span>${escapeHtml(t('Use Agent API', '使用 Agent API'))}</span></button>
    <button type="button" data-node-action="sync-vlm-custom-to-agent"><i class="fa-solid fa-arrow-up"></i><span>${escapeHtml(t('Save to Agent', '同步到 Agent'))}</span></button>
  </div>
  <label class="sai-node-check sai-vlm-custom-vision"><input data-vlm-param="custom_supports_images" type="checkbox" ${supportsImages ? 'checked' : ''}><span>${escapeHtml(t('Selected model supports image input', '当前模型支持图像输入'))}</span></label>
  `}
</div>`;
        }

        function renderVlmInputRows(node, options) {
            const opts = options || {};
            const imageInputs = node.image_inputs || {};
            return `<div class="sai-vlm-input-list">
  ${VLM_IMAGE_SLOTS.map((slot) => {
      const inputNode = getNode(imageInputs[slot.key]);
      return `<div class="sai-vlm-input-row">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-vlm-image-in="${escapeHtml(slot.key)}" title="${escapeHtml(slot.label)}"></button>
  <i class="fa-solid ${opts.video ? 'fa-photo-film' : 'fa-image'}"></i><span>${escapeHtml(opts.video ? t('Media', '媒体') : slot.label)}</span><b>${inputNode ? escapeHtml(inputNode.title || inputNode.id) : escapeHtml(notConnectedText())}</b>
</div>`;
  }).join('')}
</div>`;
        }

        function renderVlmPendingImages(node) {
            const pending = Array.isArray(node.chat?.pending_images) ? node.chat.pending_images : [];
            const connectedSlots = (node?.params?.mode || 'single') === 'chat' ? VLM_IMAGE_SLOTS.slice(0, 1) : VLM_IMAGE_SLOTS;
            const connected = connectedSlots.map((slot) => {
                const source = getNode(node?.image_inputs?.[slot.key]);
                if (!source || !['image', 'result'].includes(source.type)) return null;
                const asset = getVlmSourceAsset(source) || {};
                const src = safeAssetDisplaySrc(asset, asset.thumb || asset.preview_url || asset.data_url || '');
                return {
                    slot: slot.key,
                    name: source.title || asset.name || slot.label,
                    src
                };
            }).filter(Boolean);
            if (!pending.length && !connected.length) return '';
            return `<div class="sai-vlm-compose-images">${connected.map((item) => `
<span class="sai-vlm-image-chip is-connected" title="${escapeHtml(item.name || 'connected image')}">
  ${item.src ? `<img src="${escapeHtml(item.src)}" alt="">` : `<i class="fa-solid fa-image"></i>`}
  <b>${escapeHtml(item.name || 'connected image')}</b>
  <button type="button" data-vlm-disconnect-image="${escapeHtml(item.slot)}" title="${escapeHtml(t('Disconnect', '断开'))}"><i class="fa-solid fa-link-slash"></i></button>
</span>`).join('')}${pending.map((item, index) => {
            const src = item.thumb || item.data_url || '';
            return `<span class="sai-vlm-image-chip" title="${escapeHtml(item.name || 'image')}">
  ${src ? `<img src="${escapeHtml(src)}" alt="">` : `<i class="fa-solid fa-image"></i>`}
  <b>${escapeHtml(item.name || `image ${index + 1}`)}</b>
  <button type="button" data-vlm-remove-pending-image="${index}" title="${escapeHtml(t('Remove', '移除'))}"><i class="fa-solid fa-xmark"></i></button>
</span>`;
        }).join('')}</div>`;
        }

        function renderVlmAgentModeSelect(params) {
            const mode = normalizeVlmAgentMode(params || {});
            return `<label class="sai-node-field"><span>${escapeHtml(t('Identity', '身份'))}</span><select data-vlm-param="agent_mode">${VLM_AGENT_MODE_CHOICES.map(item => `<option value="${escapeHtml(item.key)}" ${item.key === mode ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select></label>`;
        }

        function renderVlmInspector(node) {
            const params = node.params || {};
            const state = node.status?.state || 'idle';
            const imageInputs = node.image_inputs || {};
            const version = String(params.version || '').trim() || VLM_VERSION_CHOICES[0];
            const mode = params.mode || 'single';
            const isChat = mode === 'chat';
            const isBusy = isVlmNodeBusy(node);
            const keepModelLoaded = params.keep_model_loaded !== false && !params.free_after;
            const contextBudgetMax = vlmChatContextBudgetMax(params);
            const contextBudget = clampVlmChatContextBudget(params.context_chars ?? VLM_CHAT_DEFAULT_CONTEXT_CHARS, params);
            const defaultPrompt = 'Write a detailed caption and generation prompt for this image. Output only the result.';
            const prompt = params.prompt != null ? params.prompt : (isChat ? '' : defaultPrompt);
            const inputRows = isChat
                ? `<div class="sai-inspector-kv"><span>${escapeHtml(t('Chat asset endpoint', '聊天资产端点'))}</span><b>${escapeHtml(getNode(imageInputs.image_1)?.title || notConnectedText())}</b></div>`
                : VLM_IMAGE_SLOTS.map(slot => `<div class="sai-inspector-kv"><span>${escapeHtml(slot.label)}</span><b>${escapeHtml(getNode(imageInputs[slot.key])?.title || notConnectedText())}</b></div>`).join('');
            return `
<div class="sai-inspector-section">
  <h3>VLM Agent</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Status', '状态'))}</span><b>${escapeHtml(state)}</b></div>
  ${inputRows}
  ${node.status?.message ? `<p>${escapeHtml(node.status.message)}</p>` : ''}
</div>
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Parameters', '参数'))}</h3>
  <label>${escapeHtml(t('Model', '模型'))}<select data-vlm-param="version">${vlmModelOptionsHtml(version)}</select></label>
  <label>${escapeHtml(t('Mode', '模式'))}<select data-vlm-param="mode"><option value="single" ${mode !== 'chat' ? 'selected' : ''}>${escapeHtml(t('Single Run', '单次运行'))}</option><option value="chat" ${mode === 'chat' ? 'selected' : ''}>${escapeHtml(t('Chat Context', '上下文聊天'))}</option></select></label>
  ${isChat ? renderVlmAgentModeSelect(params) : ''}
  ${version === 'Custom' ? renderVlmCustomApiConfig(node) : ''}
  ${isChat ? renderVlmSystemPromptTemplatePicker(params) : ''}
  ${isChat ? `<label>${escapeHtml(t('System Prompt', '系统提示词'))}<textarea data-vlm-param="system_prompt" rows="3">${escapeHtml(params.system_prompt || '')}</textarea></label>` : ''}
  ${isChat ? `<label>${escapeHtml(t('Assistant Name', '助手名称'))}<input data-vlm-param="assistant_name" value="${escapeHtml(params.assistant_name || '')}" placeholder="${escapeHtml(t('Assistant', '助手'))}"></label>` : ''}
  <label>${escapeHtml(isChat ? t('Message', '消息') : t('Instruction', '指令'))}${renderTranslatableTextarea('data-vlm-param="prompt" rows="6"', prompt, { target: 'vlm-param', key: 'prompt', state: getTranslationFieldState(node, 'vlm-param', 'prompt', prompt) })}</label>
  <label>${escapeHtml(t('Max Tokens', '最大 Token'))}<input data-vlm-param="max_tokens" type="number" min="64" max="8192" step="64" value="${escapeHtml(params.max_tokens ?? 1024)}"></label>
  <label>Temperature<input data-vlm-param="temperature" type="number" min="0" max="2" step="0.05" value="${escapeHtml(params.temperature ?? 0.8)}"></label>
  <label>Top P<input data-vlm-param="top_p" type="number" min="0" max="1" step="0.05" value="${escapeHtml(params.top_p ?? 0.9)}"></label>
  <label>${escapeHtml(t('Seed', '种子'))}<input data-vlm-param="seed" type="number" step="1" value="${escapeHtml(params.seed ?? -1)}"></label>
  ${isChat ? `<label>${escapeHtml(t('Chat Font Size', '聊天字号'))}<input data-vlm-param="chat_font_size" type="number" min="11" max="24" step="1" value="${escapeHtml(params.chat_font_size ?? VLM_CHAT_DEFAULT_FONT_SIZE)}"></label>` : ''}
  ${isChat ? `<label>${escapeHtml(t('Rolling Context Turns', '滚动上下文轮数'))}<input data-vlm-param="max_history" type="number" min="1" max="80" step="1" value="${escapeHtml(params.max_history ?? VLM_CHAT_DEFAULT_MAX_HISTORY)}"></label>` : ''}
  ${isChat ? `<label>${escapeHtml(t('Context Budget Chars', '上下文字符预算'))}<input data-vlm-param="context_chars" type="number" min="${escapeHtml(VLM_CHAT_CONTEXT_CHARS_MIN)}" max="${escapeHtml(contextBudgetMax)}" step="500" value="${escapeHtml(contextBudget)}"></label>` : ''}
  <label class="sai-node-check"><input data-vlm-param="output_chinese" type="checkbox" ${params.output_chinese ? 'checked' : ''}><span>${escapeHtml(t('Output Chinese', '输出中文'))}</span></label>
  ${isChat ? `<label class="sai-node-check"><input data-vlm-param="save_context" type="checkbox" ${params.save_context !== false ? 'checked' : ''}><span>${escapeHtml(t('Keep chat context', '保留聊天上下文'))}</span></label>` : ''}
  ${isChat ? `<label class="sai-node-check"><input data-vlm-param="enable_danbooru_review" type="checkbox" ${params.enable_danbooru_review ? 'checked' : ''}><span>${escapeHtml(t('Review/Refine Prompt', '审查/优化提示词'))}</span></label>` : ''}
  ${isChat ? `<label>${escapeHtml(t('Review/Refine Mode', '审查/优化模式'))}<select data-vlm-param="danbooru_review_mode">${['repair_and_enrich', 'small_fix', 'score_only'].map((mode) => `<option value="${escapeHtml(mode)}" ${String(params.danbooru_review_mode || 'repair_and_enrich') === mode ? 'selected' : ''}>${escapeHtml(mode)}</option>`).join('')}</select></label>` : ''}
  ${isChat ? `<label>${escapeHtml(t('Prompt Variation', '提示词扩展'))}<select data-vlm-param="prompt_variation_strength">${['off', 'light', 'balanced', 'rich'].map((mode) => `<option value="${escapeHtml(mode)}" ${String(params.prompt_variation_strength || 'balanced') === mode ? 'selected' : ''}>${escapeHtml(mode)}</option>`).join('')}</select></label>` : ''}
  <label class="sai-node-check"><input data-vlm-param="keep_model_loaded" type="checkbox" ${keepModelLoaded ? 'checked' : ''}><span>${escapeHtml(t('Keep model loaded', '保留模型加载'))}</span></label>
</div>
${isChat ? `<div class="sai-inspector-section"><h3>${escapeHtml(t('Chat', '对话'))}</h3>${renderVlmChatLog(node)}</div>` : ''}
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Output', '输出'))}</h3>
  <label>${escapeHtml(t('Text', '文本'))}${renderTranslatableTextarea('data-inspector-text-value rows="10"', node.text?.value || '', { target: 'text-value', state: getTranslationFieldState(node, 'text-value', '', node.text?.value || '') })}</label>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="${isChat && isBusy ? 'stop-vlm-chat' : 'run-vlm'}"><i class="fa-solid ${isChat && isBusy ? 'fa-stop' : 'fa-comments'}"></i><span>${escapeHtml(isChat && isBusy ? t('Stop reply', '停止回答') : (isChat ? t('Send', '发送') : t('Run VLM', '运行 VLM')))}</span></button>
  ${isChat ? `<button type="button" data-inspector-action="clear-vlm-chat"><i class="fa-solid fa-broom"></i><span>${escapeHtml(t('Clear Chat', '清空对话'))}</span></button>` : ''}
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
        }

        function renderVlmNodeHtml(node) {
            const params = node.params || {};
            const state = node.status?.state || 'idle';
            const version = String(params.version || '').trim() || VLM_VERSION_CHOICES[0];
            const mode = params.mode || 'single';
            const isChat = mode === 'chat';
            const agentMode = normalizeVlmAgentMode(params);
            const isBusy = nodeStatusState(node) === 'running' || nodeStatusState(node) === 'waiting';
            const keepModelLoaded = params.keep_model_loaded !== false && !params.free_after;
            const contextBudgetMax = vlmChatContextBudgetMax(params);
            const contextBudget = clampVlmChatContextBudget(params.context_chars ?? VLM_CHAT_DEFAULT_CONTEXT_CHARS, params);
            const resetButton = (key, title) => `<button type="button" class="sai-vlm-inline-reset" data-vlm-param-reset="${escapeHtml(key)}" title="${escapeHtml(title)}"><i class="fa-solid fa-rotate-left"></i></button>`;
            const defaultPrompt = 'Write a detailed caption and generation prompt for this image. Output only the result.';
            const prompt = params.prompt != null ? params.prompt : (isChat ? '' : defaultPrompt);
            const modelSelect = `<label class="sai-node-field"><span>${escapeHtml(t('Model', '模型'))}</span><select data-vlm-param="version">${vlmModelOptionsHtml(version)}</select></label>`;
            const modeSelect = `<label class="sai-node-field"><span>${escapeHtml(t('Mode', '模式'))}</span><select data-vlm-param="mode"><option value="single" ${mode !== 'chat' ? 'selected' : ''}>${escapeHtml(t('Single Analysis', '单次分析'))}</option><option value="chat" ${mode === 'chat' ? 'selected' : ''}>${escapeHtml(t('Chat Context', '上下文聊天'))}</option></select></label>`;
            const identitySelect = renderVlmAgentModeSelect(params);
            const commandHints = agentMode === 'raw' ? '' : `<div class="sai-vlm-command-hints">${VLM_CHAT_TOOL_COMMANDS.map(item => `<button type="button" data-vlm-command="${escapeHtml(item.command)}"><b>${escapeHtml(item.command)}</b><span>${escapeHtml(item.label)}</span></button>`).join('')}</div>`;
            if (isChat) {
                return `
<div class="sai-node-head">
  <span class="sai-node-kind">VLM</span>
  <span class="sai-node-title">${escapeHtml(node.title || 'VLM Chat')}</span>
  ${renderNodeStateBadges(node)}
  <button type="button" data-node-action="check-vlm-model" title="${escapeHtml(t('Check VLM model files', '检查 VLM 模型文件'))}"><i class="fa-solid fa-cloud-arrow-down"></i></button>
  ${isBusy ? `<button type="button" data-node-action="stop-vlm-chat" title="${escapeHtml(t('Stop reply', '停止回答'))}"><i class="fa-solid fa-stop"></i></button>` : ''}
  <button type="button" data-node-action="unload-vlm-model" title="${escapeHtml(t('Unload VLM model', '卸载 VLM 模型'))}"><i class="fa-solid fa-memory"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-vlm-window sai-vlm-chat-window">
  <div class="sai-vlm-topbar sai-vlm-chat-topbar">${modelSelect}${modeSelect}${identitySelect}</div>
  ${renderVlmModelStatusHtml(node)}
  ${version === 'Custom' ? renderVlmCustomApiConfig(node) : ''}
  <label class="sai-node-field"><span>${escapeHtml(t('Assistant Name', '助手名称'))}</span><input data-vlm-param="assistant_name" value="${escapeHtml(params.assistant_name || '')}" placeholder="${escapeHtml(t('Assistant', '助手'))}"></label>
  ${renderVlmSystemPromptTemplatePicker(params)}
  <label class="sai-node-field sai-text-node-field sai-vlm-system-field"><span>${escapeHtml(t('System Prompt', '系统提示词'))}</span><textarea data-vlm-param="system_prompt" rows="1" placeholder="${escapeHtml(t('Optional persona or assistant behavior...', '可选：设置人格或助手行为...'))}">${escapeHtml(params.system_prompt || '')}</textarea></label>
  <div class="sai-vlm-collapsed-chat-keep sai-collapsed-keep">
  ${renderVlmChatLog(node)}
  <div class="sai-vlm-readable-controls">
    <label><i class="fa-solid fa-text-height"></i><span>${escapeHtml(t('Font', '字号'))}</span><input data-vlm-param="chat_font_size" type="range" min="11" max="24" step="1" value="${escapeHtml(params.chat_font_size ?? VLM_CHAT_DEFAULT_FONT_SIZE)}"><b>${escapeHtml(params.chat_font_size ?? VLM_CHAT_DEFAULT_FONT_SIZE)}px</b>${resetButton('chat_font_size', t('Reset font size', '恢复默认字号'))}</label>
    <label><i class="fa-solid fa-clock-rotate-left"></i><span>${escapeHtml(t('Context', '上下文'))}</span><input data-vlm-param="max_history" type="range" min="1" max="80" step="1" value="${escapeHtml(params.max_history ?? VLM_CHAT_DEFAULT_MAX_HISTORY)}"><b>${escapeHtml(params.max_history ?? VLM_CHAT_DEFAULT_MAX_HISTORY)}</b>${resetButton('max_history', t('Reset context turns', '恢复默认上下文轮数'))}</label>
    <label><i class="fa-solid fa-compress"></i><span>${escapeHtml(t('Budget', '预算'))}</span><input data-vlm-param="context_chars" type="number" min="${escapeHtml(VLM_CHAT_CONTEXT_CHARS_MIN)}" max="${escapeHtml(contextBudgetMax)}" step="500" value="${escapeHtml(contextBudget)}" title="${escapeHtml(t('Text history budget, capped to leave room for prompt, image tokens, and output.', '历史文本预算，会预留当前提示词、图像 token 和输出空间。'))}"><b>${escapeHtml(t('chars', '字符'))}</b>${resetButton('context_chars', t('Reset context budget', '恢复默认上下文预算'))}</label>
  </div>
  <div class="sai-vlm-compose" data-vlm-chat-drop>
    <button type="button" class="sai-node-handle sai-node-handle-in sai-vlm-compose-port" data-vlm-image-in="image_1" title="${escapeHtml(t('Connect image/result asset', '接入 image/result 资产'))}"></button>
    ${renderVlmPendingImages(node)}
    <div class="sai-vlm-compose-asset">
      <button type="button" data-node-action="attach-vlm-image" title="${escapeHtml(t('Upload images', '上传图片'))}"><i class="fa-solid fa-images"></i></button>
    </div>
    <textarea data-vlm-param="prompt" rows="3" placeholder="${escapeHtml(agentMode === 'raw' ? t('Type a message...', '输入消息...') : t('Chat, or ask for an image with /t2i...', '聊天，或用 /t2i 请求生成图片...'))}">${escapeHtml(prompt)}</textarea>
    <button type="button" class="sai-vlm-send ${isBusy ? 'sai-vlm-stop' : ''}" data-node-action="${isBusy ? 'stop-vlm-chat' : 'run-vlm'}" title="${escapeHtml(isBusy ? t('Stop reply', '停止回答') : t('Send', '发送'))}"><i class="fa-solid ${isBusy ? 'fa-stop' : 'fa-paper-plane'}"></i></button>
  </div>
  </div>
  ${commandHints}
  <div class="sai-vlm-chat-actions">
    <div class="sai-vlm-chat-toggle-row">
      <label class="sai-node-check"><input data-vlm-param="save_context" type="checkbox" ${params.save_context !== false ? 'checked' : ''}><span>${escapeHtml(t('Keep context', '保留上下文'))}</span></label>
      <label class="sai-node-check"><input data-vlm-param="keep_model_loaded" type="checkbox" ${keepModelLoaded ? 'checked' : ''}><span>${escapeHtml(t('Keep model loaded', '保留模型加载'))}</span></label>
      <label class="sai-node-check" title="${escapeHtml(t('Run an isolated second-pass review/refine for final prompts before confirmation. Danbooru targets are checked as tags; natural-language targets are expanded as text.', '在确认前独立审查/优化最终提示词：Danbooru 目标检查 tags，自然语言目标扩写文本。'))}"><input data-vlm-param="enable_danbooru_review" type="checkbox" ${params.enable_danbooru_review ? 'checked' : ''}><span>${escapeHtml(t('Review/Refine Prompt', '审查/优化提示词'))}</span></label>
      <label title="${escapeHtml(t('Second-pass review/refine behavior for generated prompts.', '生成提示词的二次审查/优化行为。'))}"><span>${escapeHtml(t('Review/Refine mode', '审查/优化模式'))}</span><select data-vlm-param="danbooru_review_mode">
        ${['repair_and_enrich', 'small_fix', 'score_only'].map((mode) => `<option value="${escapeHtml(mode)}" ${String(params.danbooru_review_mode || 'repair_and_enrich') === mode ? 'selected' : ''}>${escapeHtml(mode)}</option>`).join('')}
      </select></label>
      <label title="${escapeHtml(t('Stable prompt enrichment strength for SDXL/Danbooru prompts.', 'SDXL/Danbo 提示词稳定扩展强度。'))}"><span>${escapeHtml(t('Variation', '扩展'))}</span><select data-vlm-param="prompt_variation_strength">
        ${['off', 'light', 'balanced', 'rich'].map((mode) => `<option value="${escapeHtml(mode)}" ${String(params.prompt_variation_strength || 'balanced') === mode ? 'selected' : ''}>${escapeHtml(mode)}</option>`).join('')}
      </select></label>
    </div>
    <div class="sai-vlm-chat-button-row">
      <button type="button" data-node-action="clear-vlm-chat"><i class="fa-solid fa-broom"></i><span>${escapeHtml(t('Clear history', '清空记录'))}</span></button>
      <button type="button" data-node-action="unload-vlm-model"><i class="fa-solid fa-memory"></i><span>${escapeHtml(t('Unload model', '卸载模型'))}</span></button>
    </div>
  </div>
</div>
<button type="button" class="sai-node-handle sai-node-handle-out sai-vlm-chat-output-port" data-handle-out="text" title="${escapeHtml(t('Last reply output', '最后回复输出'))}"></button>`;
            }
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">VLM</span>
  <span class="sai-node-title">${escapeHtml(node.title || 'VLM Agent')}</span>
  ${renderNodeStateBadges(node)}
  <button type="button" data-node-action="check-vlm-model" title="${escapeHtml(t('Check VLM model files', '检查 VLM 模型文件'))}"><i class="fa-solid fa-cloud-arrow-down"></i></button>
  <button type="button" data-node-action="run-vlm" title="${escapeHtml(t('Run VLM', '运行 VLM'))}"><i class="fa-solid fa-play"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-vlm-window sai-vlm-single-window">
${modelSelect}
${modeSelect}
${renderVlmModelStatusHtml(node)}
${version === 'Custom' ? renderVlmCustomApiConfig(node) : ''}
${renderVlmInputRows(node, { video: true })}
<label class="sai-node-field sai-text-node-field"><span>${escapeHtml(t('Instruction', '指令'))}</span>${renderTranslatableTextarea('data-vlm-param="prompt" rows="4"', prompt, { target: 'vlm-param', key: 'prompt', state: getTranslationFieldState(node, 'vlm-param', 'prompt', prompt) })}</label>
<div class="sai-node-field-row">
  <label><span>${escapeHtml(t('Max Tokens', '最大 Token'))}</span><input data-vlm-param="max_tokens" type="number" min="64" max="8192" step="64" value="${escapeHtml(params.max_tokens ?? 1024)}"></label>
  <label><span>${escapeHtml(t('Video Frames', '视频帧'))}</span><input data-vlm-param="video_frames" type="number" min="1" max="32" step="1" value="${escapeHtml(params.video_frames ?? 25)}"></label>
  <label><span>Temp</span><input data-vlm-param="temperature" type="number" min="0" max="2" step="0.05" value="${escapeHtml(params.temperature ?? 0.8)}"></label>
</div>
<div class="sai-node-field-row">
  <label><span>Top P</span><input data-vlm-param="top_p" type="number" min="0" max="1" step="0.05" value="${escapeHtml(params.top_p ?? 0.9)}"></label>
  <label><span>${escapeHtml(t('Seed', '种子'))}</span><input data-vlm-param="seed" type="number" step="1" value="${escapeHtml(params.seed ?? -1)}"></label>
</div>
<label class="sai-node-check sai-node-field"><input data-vlm-param="output_chinese" type="checkbox" ${params.output_chinese ? 'checked' : ''}><span>${escapeHtml(t('Output Chinese', '输出中文'))}</span></label>
<label class="sai-node-check sai-node-field"><input data-vlm-param="keep_model_loaded" type="checkbox" ${keepModelLoaded ? 'checked' : ''}><span>${escapeHtml(t('Keep model loaded', '保留模型加载'))}</span></label>
<label class="sai-node-field sai-text-node-field"><span>${escapeHtml(t('Output', '输出'))} ${state ? `<small>${escapeHtml(state)}</small>` : ''}</span>${renderTranslatableTextarea('data-text-value rows="6"', node.text?.value || '', { target: 'text-value', state: getTranslationFieldState(node, 'text-value', '', node.text?.value || '') })}</label>
<div class="sai-vlm-action-row">
  <button type="button" class="sai-node-primary" data-node-action="run-vlm"><i class="fa-solid fa-comments"></i><span>${escapeHtml(t('Run VLM', '运行 VLM'))}</span></button>
  <button type="button" class="sai-node-secondary" data-node-action="unload-vlm-model" title="${escapeHtml(t('Unload VLM model', '卸载 VLM 模型'))}"><i class="fa-solid fa-memory"></i><span>${escapeHtml(t('Unload', '卸载'))}</span></button>
</div>
</div>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="text" title="${escapeHtml(t('Text output', '文本输出'))}"></button>`;
        }

        return {
            renderVlmModelStatusHtml,
            renderVlmCustomApiConfig,
            renderVlmInputRows,
            renderVlmPendingImages,
            renderVlmAgentModeSelect,
            renderVlmInspector,
            renderVlmNodeHtml
        };
    }

    window.SimpAICanvasWorkbenchVlmNodeView = Object.assign({}, window.SimpAICanvasWorkbenchVlmNodeView || {}, {
        createCanvasVlmNodeView
    });
})();
