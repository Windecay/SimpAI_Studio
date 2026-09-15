(function () {
    'use strict';

    const modules = {
        image: window.SimpAICanvasWorkbenchImageNode || {},
        video: window.SimpAICanvasWorkbenchVideoNode || {},
        audio: window.SimpAICanvasWorkbenchAudioNode || {}
    };

    function createContext(module, factoryName, source) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(source || {}) || {}) : {};
    }

    function createCanvasWorkbenchMediaNodeContext(source) {
        const scope = source?.mediaNodeSource || source || {};
        return {
            IMAGE_NODE_CONTEXT: createContext(
                modules.image,
                'createImageNodeContext',
                scope.imageNodeSource
            ),
            VIDEO_NODE_CONTEXT: createContext(
                modules.video,
                'createVideoNodeContext',
                scope.videoNodeSource
            ),
            AUDIO_NODE_CONTEXT: createContext(
                modules.audio,
                'createAudioNodeContext',
                scope.audioNodeSource
            )
        };
    }

    window.SimpAICanvasWorkbenchMediaNodeContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchMediaNodeContext || {},
        { createCanvasWorkbenchMediaNodeContext }
    );
})();
