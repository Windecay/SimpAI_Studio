(function () {
    'use strict';

    function createCanvasAgentPanelController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const escapeHtml = scope.escapeHtml || (value => String(value ?? ''));
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getMaxImageReferences = () => Number(call('getMaxImageReferences', 0) || 0);
        const getMaxVideoReferences = () => Number(call('getMaxVideoReferences', 0) || 0);
        const getMaxAudioReferences = () => Number(call('getMaxAudioReferences', 0) || 0);
        const getAgentState = () => call('getAgentState', {}) || {};
        const getCanvasAgentPanel = () => call('getCanvasAgentPanel', null);
        const getViewport = () => call('getViewport', null);
        const getWorkbenchRoot = () => call('getWorkbenchRoot', null);
        const getCanvasAgentSettings = () => call('getCanvasAgentSettings', {}) || {};
        const getCanvasAgentTargetNode = () => call('getCanvasAgentTargetNode', null);
        const getProject = () => call('getProject', {}) || {};
        const getNodeRect = (...args) => call('getNodeRect', null, ...args);
        const getOutpaintOverlayState = () => call('getOutpaintOverlayState', {}) || {};
        const getCanvasAgentReferenceCounts = () => call('canvasAgentReferenceCounts', {}) || {};
        const normalizeCanvasAgentReferences = () => call('normalizeCanvasAgentReferences', []) || [];
        const getCanvasAgentPrimaryActionMeta = (...args) => call('canvasAgentPrimaryActionMeta', {}, ...args) || {};
        const canvasAgentTargetLabel = (...args) => call('canvasAgentTargetLabel', '', ...args);
        const renderOutpaintControlPanel = () => call('renderOutpaintControlPanel', '') || '';
        const ensureOutpaintOverlayMatchesAgentTarget = (...args) => call('ensureOutpaintOverlayMatchesAgentTarget', null, ...args);
        const ensureWorkbenchFormFieldNames = (...args) => call('ensureWorkbenchFormFieldNames', null, ...args);
        const renderView = (name, ...args) => call(name, '', ...args) || '';
        const setCanvasAgentLayoutPatch = (...args) => call('setCanvasAgentLayoutPatch', null, ...args);
        const setCanvasAgentSuppressClickUntil = (...args) => call('setCanvasAgentSuppressClickUntil', null, ...args);
        const clamp = scope.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
        const requestRenderCanvasAgentPanel = () => call('renderCanvasAgentPanel', null);
        const nowIso = typeof scope.nowIso === 'function' ? scope.nowIso : () => new Date().toISOString();
        const schedule = typeof scope.setTimeout === 'function' ? scope.setTimeout : globalThis.setTimeout;
        let dragState = null;
        const escapeSelector = (value) => {
            const text = String(value ?? '');
            if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') return globalThis.CSS.escape(text);
            return text.replace(/["\\]/g, '\\$&');
        };

        function applyCanvasAgentDecisionFormPatch(decision, formPatch) {
            const patch = call('buildAgentDecisionFormPatch', null, decision, { formPatch });
            if (patch && typeof patch === 'object' && patch.form
                && typeof patch.form === 'object' && !Array.isArray(patch.form)) {
                Object.assign(decision, patch);
                return;
            }
            const currentForm = decision.form && typeof decision.form === 'object' && !Array.isArray(decision.form)
                ? decision.form
                : {};
            Object.assign(decision, { form: Object.assign({}, currentForm, formPatch || {}) });
        }

        function setCanvasAgentRunInfo(info) {
            const state = getAgentState();
            state.currentRun = info && typeof info === 'object' ? Object.assign({ updated_at: nowIso() }, info) : null;
            state.busy = !!state.currentRun;
            requestRenderCanvasAgentPanel();
        }

        function clearCanvasAgentRunInfo(delayMs) {
            const state = getAgentState();
            const run = state.currentRun;
            if (!run) {
                state.busy = false;
                requestRenderCanvasAgentPanel();
                return;
            }
            const token = run.token || '';
            schedule(() => {
                if (state.currentRun === run || (token && state.currentRun?.token === token)) {
                    state.currentRun = null;
                    state.busy = false;
                    requestRenderCanvasAgentPanel();
                }
            }, Math.max(0, Number(delayMs || 0)));
        }

        function resetCanvasAgentRunInfo() {
            const state = getAgentState();
            state.currentRun = null;
            state.busy = false;
            requestRenderCanvasAgentPanel();
        }

        function setCanvasAgentMessage(message) {
            const state = getAgentState();
            state.lastMessage = String(message || '');
            requestRenderCanvasAgentPanel();
        }

        function resolveCanvasAgentDecision(value) {
            const state = getAgentState();
            const decision = state.pendingDecision;
            if (!decision) return;
            const cleanValue = value || 'ok';
            const action = Array.isArray(decision.actions)
                ? decision.actions.find(item => String(item.value || 'ok') === String(cleanValue))
                : null;
            if (action?.keepOpen) {
                decision.busy = true;
                decision.busyAction = cleanValue;
                decision.busyMessage = action.busyMessage || t('Working...', '处理中...');
                requestRenderCanvasAgentPanel();
                if (typeof decision.resolve === 'function') decision.resolve(cleanValue);
                return;
            }
            state.pendingDecision = null;
            requestRenderCanvasAgentPanel();
            if (typeof decision.resolve === 'function') decision.resolve(cleanValue);
        }

        function askCanvasAgentDecision(options = {}) {
            const state = getAgentState();
            if (state.pendingDecision && typeof state.pendingDecision.resolve === 'function') {
                state.pendingDecision.resolve('cancel');
            }
            call('revealCanvasAgentPanelForToolCard', null);
            return new Promise((resolve) => {
                state.pendingDecision = {
                    id: call('uid', `agent_decision_${Date.now()}`),
                    title: options.title || t('Agent confirmation', 'Agent 确认'),
                    message: options.message || '',
                    details: options.details || '',
                    note: options.note || '',
                    facts: Array.isArray(options.facts) ? options.facts : [],
                    fields: Array.isArray(options.fields) ? options.fields : [],
                    form: options.form && typeof options.form === 'object' ? options.form : {},
                    promptField: options.promptField || '',
                    promptPresetField: options.promptPresetField || '',
                    promptFallback: options.promptFallback || '',
                    promptAutoValue: options.promptAutoValue || '',
                    promptEdited: !!options.promptEdited,
                    actions: Array.isArray(options.actions) ? options.actions : [],
                    resolve
                };
                requestRenderCanvasAgentPanel();
            });
        }

        function syncCanvasAgentDecisionPromptFromPreset(decision, presetName) {
            if (!decision || !decision.form || typeof decision.form !== 'object') return;
            const promptKey = decision.promptField || 'prompt';
            if (!promptKey || !decision.promptPresetField) return;
            const route = call('decodeCanvasAgentVideoToolChoice', { preset: presetName }, presetName);
            const entry = call('findCanvasAgentPresetEntryByAlias', null, route.preset || presetName);
            if (!entry) return;
            const nextPrompt = call('canvasAgentPresetDefaultPromptForTheme', '', entry, route.theme || '', decision.promptFallback || '');
            if (!nextPrompt) return;
            const currentPrompt = String(decision.form[promptKey] || '').trim();
            const autoPrompt = String(decision.promptAutoValue || '').trim();
            if (decision.promptEdited && currentPrompt && currentPrompt !== autoPrompt) return;
            applyCanvasAgentDecisionFormPatch(decision, { [promptKey]: nextPrompt });
            decision.promptAutoValue = nextPrompt;
            decision.promptEdited = false;
            const panel = getCanvasAgentPanel();
            const field = panel?.querySelector?.(`[data-canvas-agent-decision-field="${escapeSelector(promptKey)}"]`);
            if (field && field.value !== nextPrompt) field.value = nextPrompt;
        }

        function handleCanvasAgentDecisionFieldInput(field) {
            const state = getAgentState();
            const decision = state.pendingDecision;
            if (!decision || !decision.form || typeof decision.form !== 'object') return;
            const key = field?.getAttribute?.('data-canvas-agent-decision-field');
            if (!key) return;
            const value = String(field.type || '').toLowerCase() === 'range' ? Number(field.value) : field.value;
            applyCanvasAgentDecisionFormPatch(decision, { [key]: value });
            if (key === (decision.promptField || 'prompt')) {
                const autoPrompt = String(decision.promptAutoValue || '').trim();
                const currentPrompt = String(value || '').trim();
                decision.promptEdited = !!currentPrompt && currentPrompt !== autoPrompt;
                return;
            }
            if (key === decision.promptPresetField) syncCanvasAgentDecisionPromptFromPreset(decision, value);
        }

        function renderCanvasAgentPanel() {
            const panel = getCanvasAgentPanel();
            const root = getWorkbenchRoot();
            if (!panel || !root || root.hidden) return;
            const settings = getCanvasAgentSettings();
            if (!settings.enabled) {
                panel.hidden = true;
                const state = getAgentState();
                state.pickReference = false;
                root.classList.remove('is-agent-picking-reference');
                return;
            }
            panel.hidden = false;
            const state = getAgentState();
            const target = getCanvasAgentTargetNode();
            ensureOutpaintOverlayMatchesAgentTarget(target);
            const overlay = getOutpaintOverlayState();
            const primary = getCanvasAgentPrimaryActionMeta(target);
            const input = state.input || '';
            const decision = state.pendingDecision;
            const decisionActive = !!decision;
            const runActive = !!state.currentRun || !!state.busy;
            const expanded = !!state.expanded;
            const pickActive = !!state.pickReference;
            const attachPaused = !!state.attachPaused || !!settings.attachPaused;
            const minimized = !!settings.minimized;
            const referenceCounts = getCanvasAgentReferenceCounts();
            panel.classList.toggle('is-attached', !!target && !attachPaused);
            panel.classList.toggle('is-floating', !target || attachPaused);
            panel.classList.toggle('is-attach-paused', attachPaused);
            panel.classList.toggle('is-busy', runActive);
            panel.classList.toggle('is-expanded', expanded);
            panel.classList.toggle('is-minimized', minimized);
            panel.classList.toggle('is-picking-reference', pickActive);
            root.classList.toggle('is-agent-picking-reference', pickActive);
            if (minimized) {
                panel.innerHTML = `
<button type="button" class="sai-canvas-agent-bubble" data-canvas-agent-drag-handle data-canvas-agent-action="restore-minimized" title="${escapeHtml(t('Restore Canvas Agent', '还原 Canvas Agent'))}" aria-label="${escapeHtml(t('Restore Canvas Agent', '还原 Canvas Agent'))}">
  <i class="fa-solid fa-wand-magic-sparkles"></i>
</button>`;
                ensureWorkbenchFormFieldNames(panel, 'canvas_agent');
                positionCanvasAgentPanel();
                call('syncOutpaintOverlayPosition', null);
                return;
            }
            const composerBody = `
${expanded ? '' : renderView('renderCanvasAgentCompactToolbar', runActive, pickActive)}
<div class="sai-canvas-agent-compose-box">
  ${expanded ? '' : renderView('renderCanvasAgentInlineReferences', decisionActive || runActive)}
  <textarea data-canvas-agent-input rows="2" placeholder="${escapeHtml(target || referenceCounts.images ? t('Tell the Agent what to make or change...', '告诉 Agent 要生成或修改什么...') : t('Describe an image. The Agent will create a queued preset node and run it after confirmation.', '描述一张图，Agent 会在确认后创建队列预设节点并运行。'))}" ${decisionActive || runActive ? 'disabled' : ''}>${escapeHtml(input)}</textarea>
</div>
${expanded ? `
<div class="sai-canvas-agent-ref-actions">
  <button type="button" data-canvas-agent-action="use-selected" ${decisionActive || runActive ? 'disabled' : ''}><i class="fa-solid fa-square-check"></i><span>${escapeHtml(t('Use selected', '引用选中'))}</span></button>
  <button type="button" class="${pickActive ? 'is-active' : ''}" data-canvas-agent-action="${pickActive ? 'cancel-pick-reference' : 'pick-reference'}" ${decisionActive || runActive ? 'disabled' : ''}><i class="fa-solid fa-crosshairs"></i><span>${escapeHtml(pickActive ? t('Cancel pick', '取消选择') : t('Pick from canvas', '从画布选择'))}</span></button>
  <button type="button" data-canvas-agent-action="clear-references" ${decisionActive || runActive || !normalizeCanvasAgentReferences().length ? 'disabled' : ''}><i class="fa-solid fa-trash-can"></i><span>${escapeHtml(t('Clear refs', '清空引用'))}</span></button>
  <button type="button" disabled title="${escapeHtml(t('Upload reference will be connected later.', '上传引用稍后接入。'))}"><i class="fa-solid fa-upload"></i><span>${escapeHtml(t('Upload', '上传'))}</span></button>
</div>
${renderView('renderCanvasAgentReferences', decisionActive || runActive)}
${renderView('renderCanvasAgentToolShelf', decisionActive || runActive)}
<div class="sai-canvas-agent-limit-note">${escapeHtml(t(
    'Reference capacity: {images} images, {videos} videos, and {audios} audio clips.',
    '引用容量：{images} 张图片、{videos} 个视频、{audios} 个音频。'
).replace('{images}', getMaxImageReferences()).replace('{videos}', getMaxVideoReferences()).replace('{audios}', getMaxAudioReferences()))}</div>` : ''}
<div class="sai-canvas-agent-actions">
  <button type="button" class="is-primary" data-canvas-agent-action="${escapeHtml(primary.action)}" ${primary.enabled && !decisionActive && !runActive ? '' : 'disabled'}><i class="fa-solid ${escapeHtml(primary.icon)}"></i><span>${escapeHtml(primary.label)}</span></button>
  <button type="button" data-canvas-agent-action="clear-input" ${runActive ? 'disabled' : ''}><i class="fa-solid fa-eraser"></i><span>${escapeHtml(t('Clear', '清空'))}</span></button>
  <span class="sai-canvas-agent-actions-spacer" aria-hidden="true"></span>
  ${renderView('renderCanvasAgentResolutionButton', decisionActive || runActive)}
</div>
${state.resolutionOpen ? renderView('renderCanvasAgentResolutionControls', decisionActive || runActive) : ''}`;
            panel.innerHTML = `
<div class="sai-canvas-agent-head" data-canvas-agent-drag-handle>
  <div class="sai-canvas-agent-title"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(canvasAgentTargetLabel(target))}</span></div>
  ${renderView('renderCanvasAgentModelChip', settings, decisionActive || runActive)}
  <button type="button" class="sai-canvas-agent-head-btn ${attachPaused ? 'is-active' : ''}" data-canvas-agent-action="toggle-attach" title="${escapeHtml(attachPaused ? t('Enable attach to selection', '启用吸附到选中节点') : t('Pause attach to selection', '暂停吸附到选中节点'))}"><i class="fa-solid ${attachPaused ? 'fa-link' : 'fa-link-slash'}"></i></button>
  <button type="button" class="sai-canvas-agent-head-btn" data-canvas-agent-action="toggle-expanded" title="${escapeHtml(expanded ? t('Collapse composer', '收起输入器') : t('Expand composer', '展开输入器'))}"><i class="fa-solid ${expanded ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'}"></i></button>
  <button type="button" class="sai-canvas-agent-head-btn" data-canvas-agent-action="toggle-minimized" title="${escapeHtml(t('Minimize Agent', '最小化 Agent'))}"><i class="fa-solid fa-minus"></i></button>
  <button type="button" class="sai-canvas-agent-head-btn" data-canvas-agent-action="open-settings" title="${escapeHtml(t('Agent settings', 'Agent 设置'))}"><i class="fa-solid fa-gear"></i></button>
</div>
${state.modelPickerOpen ? renderView('renderCanvasAgentModelPicker', settings, decisionActive || runActive) : ''}
${renderView('renderCanvasAgentRunInfo', state.currentRun)}
${overlay.active ? renderOutpaintControlPanel() : (decisionActive ? renderView('renderCanvasAgentDecision', decision) : composerBody)}
${state.lastMessage ? `<div class="sai-canvas-agent-note">${escapeHtml(state.lastMessage)}</div>` : ''}`;
            ensureWorkbenchFormFieldNames(panel, 'canvas_agent');
            positionCanvasAgentPanel();
        }

        async function handleCanvasAgentPanelAction(action) {
            const state = getAgentState();
            if (action === 'open-settings') {
                state.modelPickerOpen = false;
                call('openCanvasSettingsPanel', null, 'agent');
                return true;
            }
            if (action === 'cancel-vlm-plan') {
                const result = await call('cancelCanvasAgentVlmInstruction', { ok: false, cancelled: false });
                if (result?.cancel_error) {
                    call('showToast', null, t('The VLM request was stopped, but the backend may still be finishing cleanup.', 'VLM 请求已停止，但后端可能仍在完成清理。'));
                }
                return true;
            }
            const settings = getCanvasAgentSettings();
            if (!settings.enabled) {
                call('showToast', null, t('Canvas Agent is disabled in Settings.', '画布 Agent 已在设置中关闭'));
                return true;
            }
            if (String(action || '').startsWith('decision:')) {
                resolveCanvasAgentDecision(String(action).slice('decision:'.length) || 'ok');
                return true;
            }
            if (action === 'toggle-expanded') {
                state.expanded = !state.expanded;
                if (!state.expanded) state.pickReference = false;
                requestRenderCanvasAgentPanel();
                return true;
            }
            if (action === 'toggle-minimized') {
                state.pickReference = false;
                state.resolutionOpen = false;
                state.modelPickerOpen = false;
                setCanvasAgentLayoutPatch({ minimized: true });
                return true;
            }
            if (action === 'restore-minimized') {
                setCanvasAgentLayoutPatch({ minimized: false });
                return true;
            }
            if (action === 'toggle-model-picker') {
                state.modelPickerOpen = !state.modelPickerOpen;
                if (state.modelPickerOpen) state.resolutionOpen = false;
                requestRenderCanvasAgentPanel();
                return true;
            }
            if (action === 'fetch-agent-custom-models-inline') {
                state.modelPickerOpen = true;
                await call('fetchCanvasAgentCustomModels', null);
                return true;
            }
            if (action === 'toggle-resolution-picker') {
                state.resolutionOpen = !state.resolutionOpen;
                if (state.resolutionOpen) state.modelPickerOpen = false;
                requestRenderCanvasAgentPanel();
                return true;
            }
            if (action === 'toggle-attach') {
                const nextPaused = !(!!state.attachPaused || !!settings.attachPaused);
                state.attachPaused = nextPaused;
                setCanvasAgentLayoutPatch(nextPaused ? { attachPaused: true, panelPosition: null } : { attachPaused: false }, { render: false });
                setCanvasAgentMessage(nextPaused
                    ? t('Agent attach paused. The panel will stay in the floating position.', 'Agent 吸附已暂停，小窗会停在浮动位置。')
                    : t('Agent attach enabled. The panel will follow the selected target.', 'Agent 吸附已启用，小窗会跟随选中目标。'));
                requestRenderCanvasAgentPanel();
                return true;
            }
            if (action === 'use-selected') {
                call('addSelectedCanvasAgentReferences', null);
                return true;
            }
            if (action === 'pick-reference') {
                state.expanded = true;
                state.pickReference = true;
                setCanvasAgentMessage(t('Click an image, result, video, audio, or Text node to add it as a reference.', '点击图片、结果、视频、音频或 Text 节点，将其加入引用。'));
                requestRenderCanvasAgentPanel();
                return true;
            }
            if (action === 'cancel-pick-reference') {
                state.pickReference = false;
                setCanvasAgentMessage('');
                requestRenderCanvasAgentPanel();
                return true;
            }
            if (String(action || '').startsWith('remove-reference:')) {
                call('removeCanvasAgentReference', null, String(action).slice('remove-reference:'.length));
                return true;
            }
            if (String(action || '').startsWith('promote-reference:')) {
                call('promoteCanvasAgentReference', null, String(action).slice('promote-reference:'.length));
                return true;
            }
            if (action === 'confirm-outpaint') {
                await call('confirmOutpaintFromOverlay', null);
                return true;
            }
            if (action === 'cancel-outpaint') {
                call('hideOutpaintOverlay', null);
                requestRenderCanvasAgentPanel();
                return true;
            }
            if (String(action || '').startsWith('aspect:')) {
                state.resolutionOpen = false;
                call('setCanvasAgentResolutionPatch', null, { aspect: String(action).slice('aspect:'.length) || 'auto' });
                return true;
            }
            if (action === 'clear-references') {
                state.references = [];
                state.pickReference = false;
                requestRenderCanvasAgentPanel();
                return true;
            }
            if (String(action || '').startsWith('tool:')) {
                await call('runCanvasAgentTool', null, String(action).slice('tool:'.length));
                return true;
            }
            if (state.busy || state.currentRun) {
                call('showToast', null, t('Agent is still working. Please wait for the current step to finish.', 'Agent 当前步骤还在运行，请等待完成。'));
                return true;
            }
            if (action === 'clear-input') {
                if (state.pendingDecision) resolveCanvasAgentDecision('cancel');
                state.input = '';
                state.lastMessage = '';
                requestRenderCanvasAgentPanel();
                return true;
            }
            return false;
        }

        function positionCanvasAgentPanel() {
            const panel = getCanvasAgentPanel();
            const viewport = getViewport();
            const root = getWorkbenchRoot();
            if (!panel || !viewport || !root || root.hidden) return;
            const settings = getCanvasAgentSettings();
            const vpRect = viewport.getBoundingClientRect();
            const gap = 12;
            const placeFloating = (point, fallback) => {
                const panelWidth = Math.min(panel.offsetWidth || fallback.width || 340, Math.max(48, vpRect.width - gap * 2));
                const panelHeight = Math.min(panel.offsetHeight || fallback.height || 188, Math.max(48, vpRect.height - gap * 2));
                const x = point ? point.x : fallback.x;
                const y = point ? point.y : fallback.y;
                panel.dataset.placement = 'manual';
                panel.style.left = `${Math.round(clamp(Number(x || 0), gap, Math.max(gap, vpRect.width - panelWidth - gap)))}px`;
                panel.style.top = `${Math.round(clamp(Number(y || 0), gap, Math.max(gap, vpRect.height - panelHeight - gap)))}px`;
                panel.style.bottom = '';
                if (!settings.minimized) panel.style.width = `${panelWidth}px`;
                else panel.style.width = '';
            };
            if (settings.minimized) {
                const fallback = { x: Math.max(gap, vpRect.width - 62), y: Math.max(gap, vpRect.height - 70), width: 50, height: 50 };
                placeFloating(settings.bubblePosition, fallback);
                return;
            }
            const target = getCanvasAgentTargetNode();
            if (!target || getAgentState().attachPaused || settings.attachPaused) {
                delete panel.dataset.placement;
                const desiredWidth = 386;
                const panelWidth = Math.min(desiredWidth, Math.max(280, vpRect.width - gap * 2));
                const useManualFloatingPosition = (getAgentState().attachPaused || settings.attachPaused) && !!settings.panelPosition;
                if (useManualFloatingPosition) {
                    placeFloating(settings.panelPosition, {
                        x: 72,
                        y: Math.max(gap, vpRect.height - Math.min(panel.offsetHeight || 188, vpRect.height - gap * 2) - 18),
                        width: panelWidth,
                        height: 188
                    });
                } else {
                    const left = clamp(72, gap, Math.max(gap, vpRect.width - panelWidth - gap));
                    panel.style.left = `${Math.round(left)}px`;
                    panel.style.top = '';
                    panel.style.bottom = '18px';
                    panel.style.width = `${panelWidth}px`;
                }
                return;
            }
            const rect = getNodeRect(target);
            if (!rect) return;
            const project = getProject();
            const zoom = project.viewport?.zoom || 1;
            const desiredWidth = 386;
            const panelWidth = Math.min(desiredWidth, Math.max(280, vpRect.width - gap * 2));
            const panelHeight = Math.min(Math.max(panel.offsetHeight || 188, 188), Math.max(188, vpRect.height - 24));
            const nodeLeft = rect.x * zoom + (project.viewport?.x || 0);
            const nodeTop = rect.y * zoom + (project.viewport?.y || 0);
            const nodeRight = (rect.x + rect.w) * zoom + (project.viewport?.x || 0);
            const nodeBottom = (rect.y + rect.h) * zoom + (project.viewport?.y || 0);
            let left = clamp(nodeLeft, gap, Math.max(gap, vpRect.width - panelWidth - gap));
            let top = nodeBottom + gap;
            let placement = 'below';
            if (top + panelHeight > vpRect.height - gap) {
                if (nodeRight + gap + panelWidth <= vpRect.width - gap) {
                    left = nodeRight + gap;
                    top = clamp(nodeTop, gap, Math.max(gap, vpRect.height - panelHeight - gap));
                    placement = 'right';
                } else if (nodeLeft - gap - panelWidth >= gap) {
                    left = nodeLeft - gap - panelWidth;
                    top = clamp(nodeTop, gap, Math.max(gap, vpRect.height - panelHeight - gap));
                    placement = 'left';
                } else {
                    top = nodeBottom + gap;
                    placement = 'below-partial';
                }
            }
            panel.dataset.placement = placement;
            panel.style.width = `${panelWidth}px`;
            panel.style.left = `${Math.round(left)}px`;
            panel.style.top = `${Math.round(top)}px`;
            panel.style.bottom = '';
        }

        function onCanvasAgentPointerDown(evt) {
            const panel = getCanvasAgentPanel();
            const viewport = getViewport();
            if (!panel || !viewport || evt.button !== 0) return;
            const handle = evt.target.closest?.('[data-canvas-agent-drag-handle]');
            if (!handle || !panel.contains(handle)) return;
            const settings = getCanvasAgentSettings();
            const isBubble = !!settings.minimized;
            if (!isBubble && evt.target.closest?.('button,input,textarea,select,a,[contenteditable="true"]')) return;
            const vpRect = viewport.getBoundingClientRect();
            const rect = panel.getBoundingClientRect();
            dragState = {
                pointerId: evt.pointerId,
                kind: isBubble ? 'bubble' : 'panel',
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startLeft: rect.left - vpRect.left,
                startTop: rect.top - vpRect.top,
                width: rect.width,
                height: rect.height,
                moved: false
            };
            try { handle.setPointerCapture?.(evt.pointerId); } catch (err) {}
            document.addEventListener('pointermove', onCanvasAgentPointerMove, true);
            document.addEventListener('pointerup', onCanvasAgentPointerUp, true);
            document.addEventListener('pointercancel', onCanvasAgentPointerUp, true);
        }

        function onCanvasAgentPointerMove(evt) {
            const state = dragState;
            const panel = getCanvasAgentPanel();
            const viewport = getViewport();
            if (!state || evt.pointerId !== state.pointerId || !panel || !viewport) return;
            const dx = evt.clientX - state.startClientX;
            const dy = evt.clientY - state.startClientY;
            if (!state.moved && Math.hypot(dx, dy) < 3) return;
            state.moved = true;
            evt.preventDefault();
            const vpRect = viewport.getBoundingClientRect();
            const gap = 12;
            const left = clamp(state.startLeft + dx, gap, Math.max(gap, vpRect.width - state.width - gap));
            const top = clamp(state.startTop + dy, gap, Math.max(gap, vpRect.height - state.height - gap));
            panel.dataset.placement = 'manual';
            panel.style.left = `${Math.round(left)}px`;
            panel.style.top = `${Math.round(top)}px`;
            panel.style.bottom = '';
            if (state.kind === 'panel') {
                const agentState = getAgentState();
                agentState.attachPaused = true;
                panel.classList.add('is-floating', 'is-attach-paused');
                setCanvasAgentLayoutPatch({ attachPaused: true, panelPosition: { x: Math.round(left), y: Math.round(top) } }, { render: false });
            } else {
                setCanvasAgentLayoutPatch({ bubblePosition: { x: Math.round(left), y: Math.round(top) } }, { render: false });
            }
        }

        function onCanvasAgentPointerUp(evt) {
            const state = dragState;
            if (!state || evt.pointerId !== state.pointerId) return;
            if (state.moved) setCanvasAgentSuppressClickUntil(Date.now() + 220);
            dragState = null;
            document.removeEventListener('pointermove', onCanvasAgentPointerMove, true);
            document.removeEventListener('pointerup', onCanvasAgentPointerUp, true);
            document.removeEventListener('pointercancel', onCanvasAgentPointerUp, true);
            if (state.kind === 'panel' && state.moved) requestRenderCanvasAgentPanel();
        }

        return {
            setCanvasAgentRunInfo,
            clearCanvasAgentRunInfo,
            resetCanvasAgentRunInfo,
            setCanvasAgentMessage,
            resolveCanvasAgentDecision,
            askCanvasAgentDecision,
            syncCanvasAgentDecisionPromptFromPreset,
            handleCanvasAgentDecisionFieldInput,
            renderCanvasAgentPanel,
            handleCanvasAgentPanelAction,
            positionCanvasAgentPanel,
            onCanvasAgentPointerDown,
            onCanvasAgentPointerMove,
            onCanvasAgentPointerUp
        };
    }

    window.SimpAICanvasWorkbenchPanelController = Object.assign({}, window.SimpAICanvasWorkbenchPanelController || {}, {
        createCanvasAgentPanelController
    });
})();
