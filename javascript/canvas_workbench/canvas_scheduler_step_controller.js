(function () {
    'use strict';

    function createCanvasSchedulerStepController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const nodeSource = sourceObject('nodeSource');
        const runSource = sourceObject('runSource');
        const getNode = (...args) => sourceCall(nodeSource, 'getNode', null, ...args);
        const isQwenTtsNode = (...args) => sourceCall(nodeSource, 'isQwenTtsNode', false, ...args);
        const runTranslationNode = (...args) => sourceCall(runSource, 'runTranslationNode', {
            ok: false,
            error: 'translation runner unavailable'
        }, ...args);
        const runWd14Node = (...args) => sourceCall(runSource, 'runWd14Node', {
            ok: false,
            error: 'wd14 runner unavailable'
        }, ...args);
        const runVlmNode = (...args) => sourceCall(runSource, 'runVlmNode', {
            ok: false,
            error: 'vlm runner unavailable'
        }, ...args);
        const runQwenTtsNode = (...args) => sourceCall(runSource, 'runQwenTtsNode', {
            ok: false,
            error: 'qwen tts runner unavailable'
        }, ...args);
        const renderTimelineToResult = (...args) => sourceCall(runSource, 'renderTimelineToResult', {
            ok: false,
            error: 'timeline runner unavailable'
        }, ...args);
        const runPresetNode = (...args) => sourceCall(runSource, 'runPresetNode', {
            ok: false,
            error: 'preset runner unavailable'
        }, ...args);

        async function runSchedulerStep(nodeId, step) {
            const node = getNode(nodeId);
            if (!node) return { ok: false, error: 'node not found' };
            if (step?.missing_inputs?.length) return { ok: false, error: `missing ${step.missing_inputs.join(', ')}` };
            if (node.type === 'translation') return runTranslationNode(node);
            if (node.type === 'wd14') return runWd14Node(node);
            if (node.type === 'vlm') return runVlmNode(node);
            if (isQwenTtsNode(node)) return runQwenTtsNode(node, { reuseExistingResult: true, initialDelayMs: 900, skipInputPreflight: true });
            if (node.type === 'timeline') return renderTimelineToResult(node);
            if (node.type === 'classic') return runPresetNode(node, { reuseExistingResult: true, initialDelayMs: 900, skipInputPreflight: true });
            if (node.type === 'preset') return runPresetNode(node, { reuseExistingResult: true, initialDelayMs: 900, skipInputPreflight: true });
            return { ok: false, error: `unsupported node type: ${node.type}` };
        }

        return { runSchedulerStep };
    }

    window.SimpAICanvasWorkbenchSchedulerStep = Object.assign(
        {},
        window.SimpAICanvasWorkbenchSchedulerStep || {},
        { createCanvasSchedulerStepController }
    );
})();
