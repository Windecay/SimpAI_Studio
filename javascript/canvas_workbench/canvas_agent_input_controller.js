(function () {
    'use strict';

    function createCanvasAgentInputController(context) {
        const scope = context?.agentInputSource || context || {};
        const stateSource = scope.stateSource || {};
        const decisionSource = scope.decisionSource || {};
        const resolutionSource = scope.resolutionSource || {};
        const outpaintSource = scope.outpaintSource || {};
        const settingsSource = scope.settingsSource || {};
        const shortcutSource = scope.shortcutSource || {};
        const actionSource = scope.actionSource || {};
        const call = (sourceObject, name, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : undefined;
        const stateCall = (name, ...args) => call(stateSource, name, ...args);
        const decisionCall = (name, ...args) => call(decisionSource, name, ...args);
        const resolutionCall = (name, ...args) => call(resolutionSource, name, ...args);
        const outpaintCall = (name, ...args) => call(outpaintSource, name, ...args);
        const settingsCall = (name, ...args) => call(settingsSource, name, ...args);
        const shortcutCall = (name, ...args) => call(shortcutSource, name, ...args);
        const actionCall = (name, ...args) => call(actionSource, name, ...args);
        const closest = (evt, selector) => evt?.target?.closest?.(selector) || null;

        function applyDecisionFormPatch(decision, key, value) {
            const formPatch = { [key]: value };
            const patch = decisionCall('buildAgentDecisionFormPatch', decision, { formPatch });
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
            const state = stateCall('getAgentState') || {};
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
                stateCall('setAgentInput', agentInput.value || '');
                handled = true;
            }

            const agentScale = closest(evt, '[data-canvas-agent-scale]');
            if (agentScale) {
                resolutionCall('setCanvasAgentResolutionPatch', { multiplier: agentScale.value }, { render: false });
                return true;
            }

            const decisionRange = closest(evt, '.sai-canvas-agent-decision-range input[type="range"]');
            if (decisionRange) {
                updateDecisionRange(decisionRange);
                return true;
            }

            const decisionField = closest(evt, '[data-canvas-agent-decision-field]');
            if (decisionField) {
                decisionCall('handleCanvasAgentDecisionFieldInput', decisionField);
                return true;
            }

            if (outpaintCall('onOutpaintSliderInput', evt)) return true;

            const agentSetting = closest(evt, '[data-canvas-agent-setting]');
            if (agentSetting) {
                if (isSettingInputHandledByChange(agentSetting)) return true;
                settingsCall('handleCanvasAgentSettingInput', agentSetting);
                return true;
            }
            return handled;
        }

        function onChange(evt) {
            const decisionField = closest(evt, '[data-canvas-agent-decision-field]');
            if (decisionField) {
                decisionCall('handleCanvasAgentDecisionFieldInput', decisionField);
                return true;
            }

            const agentScale = closest(evt, '[data-canvas-agent-scale]');
            if (agentScale) {
                resolutionCall('setCanvasAgentResolutionOpen', false);
                resolutionCall('setCanvasAgentResolutionPatch', { multiplier: agentScale.value });
                return true;
            }

            const agentModelMode = closest(evt, '[data-canvas-agent-model-mode]');
            if (agentModelMode) {
                settingsCall('handleCanvasAgentModelModeInput', agentModelMode);
                return true;
            }

            const agentSetting = closest(evt, '[data-canvas-agent-setting]');
            if (agentSetting) {
                settingsCall('handleCanvasAgentSettingInput', agentSetting);
                return true;
            }
            return false;
        }

        function onKeyDown(evt) {
            const agentInput = closest(evt, '[data-canvas-agent-input]');
            if (agentInput && evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) {
                shortcutCall('consumeWorkbenchShortcut', evt);
                actionCall('handleCanvasAgentAction', actionCall('canvasAgentPrimaryAction'));
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
