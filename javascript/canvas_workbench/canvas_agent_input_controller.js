(function () {
    'use strict';

    function createCanvasAgentInputController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const closest = (evt, selector) => evt?.target?.closest?.(selector) || null;

        function applyDecisionFormPatch(decision, key, value) {
            const formPatch = { [key]: value };
            const patch = call('buildAgentDecisionFormPatch', decision, { formPatch });
            if (patch && typeof patch === 'object' && patch.form
                && typeof patch.form === 'object' && !Array.isArray(patch.form)) {
                Object.assign(decision, patch);
                return;
            }
            const currentForm = decision.form && typeof decision.form === 'object' && !Array.isArray(decision.form)
                ? decision.form
                : {};
            Object.assign(decision, { form: Object.assign({}, currentForm, formPatch) });
        }

        function updateDecisionRange(field) {
            const key = field?.getAttribute?.('data-canvas-agent-decision-field');
            const output = field?.closest?.('.sai-canvas-agent-range-row')?.querySelector?.('output');
            if (output) output.textContent = `${field.value}%`;
            const state = call('getAgentState') || {};
            const decision = state.pendingDecision;
            if (decision?.form && key) applyDecisionFormPatch(decision, key, Number(field.value));
        }

        function isSettingInputHandledByChange(field) {
            const tag = String(field?.tagName || '').toLowerCase();
            const type = String(field?.type || '').toLowerCase();
            return tag === 'select'
                || tag === 'textarea'
                || (tag === 'input' && !['checkbox', 'range', 'number'].includes(type));
        }

        function onInput(evt) {
            let handled = false;
            const agentInput = closest(evt, '[data-canvas-agent-input]');
            if (agentInput) {
                call('setAgentInput', agentInput.value || '');
                handled = true;
            }

            const agentScale = closest(evt, '[data-canvas-agent-scale]');
            if (agentScale) {
                call('setCanvasAgentResolutionPatch', { multiplier: agentScale.value }, { render: false });
                return true;
            }

            const decisionRange = closest(evt, '.sai-canvas-agent-decision-range input[type="range"]');
            if (decisionRange) {
                updateDecisionRange(decisionRange);
                return true;
            }

            const decisionField = closest(evt, '[data-canvas-agent-decision-field]');
            if (decisionField) {
                call('handleCanvasAgentDecisionFieldInput', decisionField);
                return true;
            }

            if (call('onOutpaintSliderInput', evt)) return true;

            const agentSetting = closest(evt, '[data-canvas-agent-setting]');
            if (agentSetting) {
                if (isSettingInputHandledByChange(agentSetting)) return true;
                call('handleCanvasAgentSettingInput', agentSetting);
                return true;
            }
            return handled;
        }

        function onChange(evt) {
            const decisionField = closest(evt, '[data-canvas-agent-decision-field]');
            if (decisionField) {
                call('handleCanvasAgentDecisionFieldInput', decisionField);
                return true;
            }

            const agentScale = closest(evt, '[data-canvas-agent-scale]');
            if (agentScale) {
                call('setResolutionOpen', false);
                call('setCanvasAgentResolutionPatch', { multiplier: agentScale.value });
                return true;
            }

            const agentModelMode = closest(evt, '[data-canvas-agent-model-mode]');
            if (agentModelMode) {
                call('handleCanvasAgentModelModeInput', agentModelMode);
                return true;
            }

            const agentSetting = closest(evt, '[data-canvas-agent-setting]');
            if (agentSetting) {
                call('handleCanvasAgentSettingInput', agentSetting);
                return true;
            }
            return false;
        }

        function onKeyDown(evt) {
            const agentInput = closest(evt, '[data-canvas-agent-input]');
            if (agentInput && evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
                call('consumeWorkbenchShortcut', evt);
                call('handleCanvasAgentAction', call('canvasAgentPrimaryAction'));
                return true;
            }
            return false;
        }

        return { onInput, onChange, onKeyDown };
    }

    window.SimpAICanvasWorkbenchCanvasAgentInput = Object.assign({}, window.SimpAICanvasWorkbenchCanvasAgentInput || {}, {
        createCanvasAgentInputController
    });
})();
