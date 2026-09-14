(function () {
    'use strict';

    function createCanvasAgentToolDispatchController(context) {
        const scope = context?.toolDispatchSource || context || {};
        const targetSource = scope.targetSource || {};
        const referenceSource = scope.referenceSource || {};
        const toolSource = scope.toolSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getCanvasAgentTargetNode = (...args) => call(targetSource, 'getCanvasAgentTargetNode', null, ...args);
        const isCanvasAgentImageTarget = (...args) => !!call(targetSource, 'isCanvasAgentImageTarget', false, ...args);
        const isCanvasAgentVideoTarget = (...args) => !!call(targetSource, 'isCanvasAgentVideoTarget', false, ...args);
        const isCanvasAgentAudioTarget = (...args) => !!call(targetSource, 'isCanvasAgentAudioTarget', false, ...args);
        const getCanvasAgentPrimaryImageReference = (...args) => call(referenceSource, 'getCanvasAgentPrimaryImageReference', null, ...args);
        const getCanvasAgentPrimaryReferenceByKind = (...args) => call(referenceSource, 'getCanvasAgentPrimaryReferenceByKind', null, ...args);
        const canvasAgentReferenceNode = (...args) => call(referenceSource, 'canvasAgentReferenceNode', null, ...args);
        const canvasAgentQuickTools = (...args) => call(toolSource, 'canvasAgentQuickTools', [], ...args);
        const canvasAgentVideoQuickTools = (...args) => call(toolSource, 'canvasAgentVideoQuickTools', [], ...args);
        const canvasAgentAudioQuickTools = (...args) => call(toolSource, 'canvasAgentAudioQuickTools', [], ...args);
        const runCanvasAgentQuickTool = (...args) => call(toolSource, 'runCanvasAgentQuickTool', null, ...args);
        const runCanvasAgentVideoQuickTool = (...args) => call(toolSource, 'runCanvasAgentVideoQuickTool', null, ...args);
        const runCanvasAgentAudioQuickTool = (...args) => call(toolSource, 'runCanvasAgentAudioQuickTool', null, ...args);

        function canvasAgentCurrentMediaKind() {
            const target = getCanvasAgentTargetNode();
            if (target) {
                if (isCanvasAgentImageTarget(target)) return 'image';
                if (isCanvasAgentVideoTarget(target)) return 'video';
                if (isCanvasAgentAudioTarget(target)) return 'audio';
            }
            const primaryRef = getCanvasAgentPrimaryImageReference();
            if (primaryRef) {
                const refNode = canvasAgentReferenceNode(primaryRef);
                if (refNode) {
                    if (isCanvasAgentVideoTarget(refNode)) return 'video';
                    if (isCanvasAgentImageTarget(refNode)) return 'image';
                    if (isCanvasAgentAudioTarget(refNode)) return 'audio';
                }
            }
            const audioRef = getCanvasAgentPrimaryReferenceByKind('audio');
            const audioNode = canvasAgentReferenceNode(audioRef);
            if (isCanvasAgentAudioTarget(audioNode)) return 'audio';
            return '';
        }

        function canvasAgentContextualQuickTools() {
            const kind = canvasAgentCurrentMediaKind();
            if (kind === 'video') return canvasAgentVideoQuickTools();
            if (kind === 'audio') return canvasAgentAudioQuickTools();
            return canvasAgentQuickTools();
        }

        function canvasAgentToolFamily(toolKey) {
            const key = String(toolKey || '');
            if (key.startsWith('video_')) return 'video';
            if (key.startsWith('audio_')) return 'audio';
            return 'image';
        }

        async function runCanvasAgentTool(toolKey, options) {
            const key = String(toolKey || '');
            const family = canvasAgentToolFamily(key);
            if (family === 'video') return runCanvasAgentVideoQuickTool(key.slice('video_'.length), options);
            if (family === 'audio') return runCanvasAgentAudioQuickTool(key.slice('audio_'.length), options);
            return runCanvasAgentQuickTool(key, options);
        }

        return {
            canvasAgentCurrentMediaKind,
            canvasAgentContextualQuickTools,
            canvasAgentToolFamily,
            runCanvasAgentTool
        };
    }

    window.SimpAICanvasWorkbenchToolDispatch = Object.assign({}, window.SimpAICanvasWorkbenchToolDispatch || {}, {
        createCanvasAgentToolDispatchController
    });
})();
