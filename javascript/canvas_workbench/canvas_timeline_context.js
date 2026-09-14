(function () {
    'use strict';

    const modules = {
        dom: window.SimpAICanvasWorkbenchTimelineDom || {},
        playhead: window.SimpAICanvasWorkbenchTimelinePlayhead || {},
        preview: window.SimpAICanvasWorkbenchTimelinePreview || {},
        playback: window.SimpAICanvasWorkbenchTimelinePlayback || {},
        keyframe: window.SimpAICanvasWorkbenchTimelineKeyframe || {},
        clip: window.SimpAICanvasWorkbenchTimelineClip || {},
        mask: window.SimpAICanvasWorkbenchTimelineMask || {},
        directorTimelineDrag: window.SimpAICanvasWorkbenchDirectorTimelineDrag || {},
        frame: window.SimpAICanvasWorkbenchTimelineFrame || {},
        render: window.SimpAICanvasWorkbenchTimelineRender || {},
        compare: window.SimpAICanvasWorkbenchTimelineCompare || {},
        param: window.SimpAICanvasWorkbenchTimelineParam || {},
        command: window.SimpAICanvasWorkbenchTimelineCommand || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchTimelineContext(source) {
        const scope = source?.timelineSource || source || {};
        const domSource = scope.domSource || {};
        const playheadSource = scope.playheadSource || {};
        const previewSource = scope.previewSource || {};
        const playbackSource = scope.playbackSource || {};
        const keyframeSource = scope.keyframeSource || {};
        const clipSource = scope.clipSource || {};
        const maskSource = scope.maskSource || {};
        const directorTimelineDragSource = scope.directorTimelineDragSource || {};
        const frameSource = scope.frameSource || {};
        const renderSource = scope.renderSource || {};
        const compareSource = scope.compareSource || {};
        const paramSource = scope.paramSource || {};
        const commandSource = scope.commandSource || {};
        const controllers = {};

        controllers.dom = createController(modules.dom, 'createCanvasTimelineDomController', domSource);
        const domMethod = name => method(controllers.dom, name);

        const playheadControllerSource = Object.assign({}, playheadSource, {
            domSource: Object.assign({}, playheadSource.domSource || {}, {
                refreshTimelinePlayheadDom: (...args) => domMethod('refreshTimelinePlayheadDom')?.(...args)
            })
        });
        controllers.playhead = createController(modules.playhead, 'createCanvasTimelinePlayheadController', playheadControllerSource);
        const playheadMethod = name => method(controllers.playhead, name);

        const previewControllerSource = Object.assign({}, previewSource, {
            domSource: Object.assign({}, previewSource.domSource || {}, {
                refreshTimelineKeyframeMarkersDom: (...args) => domMethod('refreshTimelineKeyframeMarkersDom')?.(...args)
            })
        });
        controllers.preview = createController(modules.preview, 'createCanvasTimelinePreviewController', previewControllerSource);
        const previewMethod = name => method(controllers.preview, name);

        const playbackControllerSource = Object.assign({}, playbackSource, {
            domSource: Object.assign({}, playbackSource.domSource || {}, {
                refreshTimelinePlayheadDom: (...args) => domMethod('refreshTimelinePlayheadDom')?.(...args)
            })
        });
        controllers.playback = createController(modules.playback, 'createCanvasTimelinePlaybackController', playbackControllerSource);
        const playbackMethod = name => method(controllers.playback, name);

        const keyframeControllerSource = Object.assign({}, keyframeSource, {
            domSource: Object.assign({}, keyframeSource.domSource || {}, {
                refreshTimelineKeyframeMarkersDom: (...args) => domMethod('refreshTimelineKeyframeMarkersDom')?.(...args),
                refreshTimelinePlayheadDom: (...args) => domMethod('refreshTimelinePlayheadDom')?.(...args)
            })
        });
        controllers.keyframe = createController(modules.keyframe, 'createCanvasTimelineKeyframeController', keyframeControllerSource);
        const keyframeMethod = name => method(controllers.keyframe, name);

        const clipControllerSource = Object.assign({}, clipSource, {
            domSource: Object.assign({}, clipSource.domSource || {}, {
                timelineLaneInfoFromTarget: (...args) => domMethod('timelineLaneInfoFromTarget')?.(...args),
                refreshTimelineClipDom: (...args) => domMethod('refreshTimelineClipDom')?.(...args),
                refreshTimelineTrackRowsDom: (...args) => domMethod('refreshTimelineTrackRowsDom')?.(...args),
                refreshTimelinePlayheadDom: (...args) => domMethod('refreshTimelinePlayheadDom')?.(...args)
            })
        });
        controllers.clip = createController(modules.clip, 'createCanvasTimelineClipController', clipControllerSource);
        const clipMethod = name => method(controllers.clip, name);

        controllers.mask = createController(modules.mask, 'createCanvasTimelineMaskController', maskSource);
        const maskMethod = name => method(controllers.mask, name);

        controllers.directorTimelineDrag = createController(
            modules.directorTimelineDrag,
            'createCanvasDirectorTimelineDragController',
            directorTimelineDragSource
        );
        const directorTimelineDragMethod = name => method(controllers.directorTimelineDrag, name);

        controllers.frame = createController(modules.frame, 'createCanvasTimelineFrameController', frameSource);
        const frameMethod = name => method(controllers.frame, name);

        controllers.render = createController(modules.render, 'createCanvasTimelineRenderController', renderSource);

        const compareControllerSource = Object.assign({}, compareSource, {
            frameSource: Object.assign({}, compareSource.frameSource || {}, {
                renderTimelinePreviewFrameDataUrl: (...args) => frameMethod('renderTimelinePreviewFrameDataUrl')?.(...args),
                getActiveTimelineVisualClips: (...args) => frameMethod('getActiveTimelineVisualClips')?.(...args),
                compareTimelineFrameImages: (...args) => frameMethod('compareTimelineFrameImages')?.(...args)
            })
        });
        controllers.compare = createController(modules.compare, 'createCanvasTimelineCompareController', compareControllerSource);

        const paramControllerSource = Object.assign({}, paramSource, {
            domSource: Object.assign({}, paramSource.domSource || {}, {
                refreshTimelineAllClipDom: (...args) => domMethod('refreshTimelineAllClipDom')?.(...args),
                refreshTimelinePlayheadDom: (...args) => domMethod('refreshTimelinePlayheadDom')?.(...args),
                refreshTimelineClipDom: (...args) => domMethod('refreshTimelineClipDom')?.(...args)
            })
        });
        controllers.param = createController(modules.param, 'createCanvasTimelineParamController', paramControllerSource);
        const paramMethod = name => method(controllers.param, name);

        const commandControllerSource = Object.assign({}, commandSource, {
            domSource: Object.assign({}, commandSource.domSource || {}, {
                timelineNormalizedKeyframes: (...args) => domMethod('timelineNormalizedKeyframes')?.(...args)
            }),
            paramSource: Object.assign({}, commandSource.paramSource || {}, {
                updateTimelineParam: (...args) => paramMethod('updateTimelineParam')?.(...args),
                resetTimelineParam: (...args) => paramMethod('resetTimelineParam')?.(...args),
                resetTimelineClipParam: (...args) => paramMethod('resetTimelineClipParam')?.(...args)
            })
        });
        controllers.command = createController(modules.command, 'createCanvasTimelineCommandController', commandControllerSource);
        const commandMethod = name => method(controllers.command, name);

        return {
            CANVAS_TIMELINE_DOM_CONTROLLER: controllers.dom,
            timelineLaneInfoFromTarget: domMethod('timelineLaneInfoFromTarget'),
            refreshTimelineTrackRowsDom: domMethod('refreshTimelineTrackRowsDom'),
            refreshTimelineClipDom: domMethod('refreshTimelineClipDom'),
            refreshTimelineAllClipDom: domMethod('refreshTimelineAllClipDom'),
            refreshTimelinePlayheadDom: domMethod('refreshTimelinePlayheadDom'),
            timelineNormalizedKeyframes: domMethod('timelineNormalizedKeyframes'),
            refreshTimelineKeyframeMarkersDom: domMethod('refreshTimelineKeyframeMarkersDom'),
            CANVAS_TIMELINE_PLAYHEAD_CONTROLLER: controllers.playhead,
            startTimelinePlayheadDrag: playheadMethod('startTimelinePlayheadDrag'),
            isTimelinePlayheadDragging: playheadMethod('isDragging'),
            CANVAS_TIMELINE_PREVIEW_CONTROLLER: controllers.preview,
            startTimelinePreviewDrag: previewMethod('startTimelinePreviewDrag'),
            isTimelinePreviewDragging: previewMethod('isDragging'),
            CANVAS_TIMELINE_PLAYBACK_CONTROLLER: controllers.playback,
            toggleTimelinePreviewPlayback: playbackMethod('toggleTimelinePreviewPlayback'),
            playTimelineFromStart: playbackMethod('playTimelineFromStart'),
            stopTimelinePlayback: playbackMethod('stopTimelinePlayback'),
            isTimelinePlaying: playbackMethod('isPlaying'),
            CANVAS_TIMELINE_KEYFRAME_CONTROLLER: controllers.keyframe,
            startTimelineKeyframeDrag: keyframeMethod('startTimelineKeyframeDrag'),
            isTimelineKeyframeDragging: keyframeMethod('isDragging'),
            CANVAS_TIMELINE_CLIP_CONTROLLER: controllers.clip,
            startTimelineClipDrag: clipMethod('startTimelineClipDrag'),
            isTimelineClipDragging: clipMethod('isDragging'),
            CANVAS_TIMELINE_MASK_CONTROLLER: controllers.mask,
            startTimelineMaskAnchorDrag: maskMethod('startTimelineMaskAnchorDrag'),
            startTimelineMaskDraw: maskMethod('startTimelineMaskDraw'),
            isTimelineMaskPointerActive: maskMethod('isPointerActive'),
            CANVAS_DIRECTOR_TIMELINE_DRAG_CONTROLLER: controllers.directorTimelineDrag,
            startDirectorTimelinePreviewDrag: directorTimelineDragMethod('startDirectorTimelinePreviewDrag'),
            isDirectorTimelineDragging: directorTimelineDragMethod('isDragging'),
            CANVAS_TIMELINE_FRAME_CONTROLLER: controllers.frame,
            CANVAS_TIMELINE_RENDER_CONTROLLER: controllers.render,
            CANVAS_TIMELINE_COMPARE_CONTROLLER: controllers.compare,
            CANVAS_TIMELINE_PARAM_CONTROLLER: controllers.param,
            updateTimelineParam: paramMethod('updateTimelineParam'),
            updateTimelineClipParam: paramMethod('updateTimelineClipParam'),
            handleTimelineNodeParamEvent: paramMethod('handleTimelineNodeParamEvent'),
            resetTimelineParam: paramMethod('resetTimelineParam'),
            resetTimelineClipParam: paramMethod('resetTimelineClipParam'),
            handleInspectorTimelineParamChange: paramMethod('handleInspectorTimelineParamChange'),
            handleInspectorTimelineClipParamChange: paramMethod('handleInspectorTimelineClipParamChange'),
            bindInspectorTimelineParamEvents: paramMethod('bindInspectorTimelineParamEvents'),
            CANVAS_TIMELINE_COMMAND_CONTROLLER: controllers.command,
            selectTimelineClip: commandMethod('selectTimelineClip'),
            moveTimelineTrack: commandMethod('moveTimelineTrack'),
            handleTimelineClick: commandMethod('handleTimelineClick'),
            resetTimelineActiveTool: commandMethod('resetTimelineActiveTool'),
            upsertTimelineClipKeyframe: commandMethod('upsertTimelineClipKeyframe'),
            deleteTimelineClipKeyframeAtPlayhead: commandMethod('deleteTimelineClipKeyframeAtPlayhead'),
            jumpTimelineToKeyframe: commandMethod('jumpTimelineToKeyframe'),
            jumpTimelineKeyframeFromElement: commandMethod('jumpTimelineKeyframeFromElement'),
            setTimelineKeyframeEasing: commandMethod('setTimelineKeyframeEasing'),
            jumpTimelineClipKeyframe: commandMethod('jumpTimelineClipKeyframe'),
            openTimelineKeyframeContextMenu: commandMethod('openTimelineKeyframeContextMenu'),
            handleTimelineAction: commandMethod('handleTimelineAction'),
            setTimelineDurationToPlayhead: commandMethod('setTimelineDurationToPlayhead'),
            setTimelineDurationToContent: commandMethod('setTimelineDurationToContent'),
            swapTimelineSize: commandMethod('swapTimelineSize'),
            deleteTimelineClipById: commandMethod('deleteTimelineClipById'),
            focusTimelineClipSource: commandMethod('focusTimelineClipSource'),
            openTimelineClipContextMenu: commandMethod('openTimelineClipContextMenu')
        };
    }

    window.SimpAICanvasWorkbenchTimelineContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchTimelineContext || {},
        { createCanvasWorkbenchTimelineContext }
    );
})();
