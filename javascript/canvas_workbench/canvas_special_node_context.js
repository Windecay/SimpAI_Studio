(function () {
    'use strict';

    const modules = {
        sam3VideoMask: window.SimpAICanvasWorkbenchSam3VideoMaskNode || {},
        cameraMotion: window.SimpAICanvasWorkbenchCameraMotionNode || {},
        poseStudio: window.SimpAICanvasWorkbenchPoseStudioNode || {},
        gaussianStudio: window.SimpAICanvasWorkbenchGaussianStudioNode || {},
        livePortraitExpression: window.SimpAICanvasWorkbenchLivePortraitExpressionNode || {},
        qwenTts: window.SimpAICanvasWorkbenchQwenTtsNode || {},
        styleSelector: window.SimpAICanvasWorkbenchStyleSelectorNode || {},
        directorTimeline: window.SimpAICanvasWorkbenchDirectorTimelineNode || {}
    };

    function createContext(module, factoryName, source) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(source || {}) || {}) : {};
    }

    function createCanvasWorkbenchSpecialNodeContext(source) {
        const scope = source?.specialNodeSource || source || {};
        return {
            SAM3_VIDEO_MASK_NODE_CONTEXT: createContext(
                modules.sam3VideoMask,
                'createSam3VideoMaskNodeContext',
                scope.sam3VideoMaskNodeSource
            ),
            CAMERA_MOTION_NODE_CONTEXT: createContext(
                modules.cameraMotion,
                'createCameraMotionNodeContext',
                scope.cameraMotionNodeSource
            ),
            POSE_STUDIO_NODE_CONTEXT: createContext(
                modules.poseStudio,
                'createPoseStudioNodeContext',
                scope.poseStudioNodeSource
            ),
            GAUSSIAN_STUDIO_NODE_CONTEXT: createContext(
                modules.gaussianStudio,
                'createGaussianStudioNodeContext',
                scope.gaussianStudioNodeSource
            ),
            LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT: createContext(
                modules.livePortraitExpression,
                'createLivePortraitExpressionNodeContext',
                scope.livePortraitExpressionNodeSource
            ),
            QWEN_TTS_NODE_CONTEXT: createContext(
                modules.qwenTts,
                'createQwenTtsNodeContext',
                scope.qwenTtsNodeSource
            ),
            STYLE_SELECTOR_NODE_CONTEXT: createContext(
                modules.styleSelector,
                'createStyleSelectorNodeContext',
                scope.styleSelectorNodeSource
            ),
            DIRECTOR_TIMELINE_NODE_CONTEXT: createContext(
                modules.directorTimeline,
                'createDirectorTimelineNodeContext',
                scope.directorTimelineNodeSource
            )
        };
    }

    window.SimpAICanvasWorkbenchSpecialNodeContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchSpecialNodeContext || {},
        { createCanvasWorkbenchSpecialNodeContext }
    );
})();
