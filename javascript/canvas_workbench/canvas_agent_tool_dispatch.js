(function () {
    'use strict';

    function createCanvasAgentToolDispatchController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getCanvasAgentTargetNode = (...args) => call('getCanvasAgentTargetNode', null, ...args);
        const getCanvasAgentPrimaryImageReference = (...args) => call('getCanvasAgentPrimaryImageReference', null, ...args);
        const getCanvasAgentPrimaryReferenceByKind = (...args) => call('getCanvasAgentPrimaryReferenceByKind', null, ...args);
        const canvasAgentReferenceNode = (...args) => call('canvasAgentReferenceNode', null, ...args);
        const isCanvasAgentImageTarget = (...args) => call('isCanvasAgentImageTarget', false, ...args);
        const isCanvasAgentVideoTarget = (...args) => call('isCanvasAgentVideoTarget', false, ...args);
        const isCanvasAgentAudioTarget = (...args) => call('isCanvasAgentAudioTarget', false, ...args);
        const canvasAgentQuickTools = (...args) => call('canvasAgentQuickTools', [], ...args);
        const canvasAgentVideoQuickTools = (...args) => call('canvasAgentVideoQuickTools', [], ...args);
        const canvasAgentAudioQuickTools = (...args) => call('canvasAgentAudioQuickTools', [], ...args);
        const runCanvasAgentQuickTool = (...args) => call('runCanvasAgentQuickTool', null, ...args);
        const runCanvasAgentVideoQuickTool = (...args) => call('runCanvasAgentVideoQuickTool', null, ...args);
        const runCanvasAgentAudioQuickTool = (...args) => call('runCanvasAgentAudioQuickTool', null, ...args);

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
