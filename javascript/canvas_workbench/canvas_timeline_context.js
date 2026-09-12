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
        const controllers = {};

        controllers.dom = createController(modules.dom, 'createCanvasTimelineDomController', {
            getDocument: scope.getDocument,
            cssEscape: scope.cssEscape,
            clamp: scope.clamp,
            formatAssetDuration: scope.formatAssetDuration,
            timelineBuildTrackClipLayout: scope.timelineBuildTrackClipLayout,
            timelineNormalizeKeyframes: scope.timelineNormalizeKeyframes
        });
        const domMethod = name => method(controllers.dom, name);

        controllers.playhead = createController(modules.playhead, 'createCanvasTimelinePlayheadController', {
            getDocument: scope.getDocument,
            getNode: scope.getNode,
            isNodeLocked: scope.isNodeLocked,
            clamp: scope.clamp,
            performanceNow: scope.performanceNow,
            setSuppressWheelUntil: scope.setSuppressWheelUntil,
            pushHistoryBatch: scope.pushHistoryBatch,
            refreshTimelinePlayheadDom: (...args) => domMethod('refreshTimelinePlayheadDom')?.(...args),
            refreshTimelinePreviewDom: scope.refreshTimelinePreviewDom,
            buildTimelineParamsPatch: scope.buildTimelineParamsPatch,
            scheduleSave: scope.scheduleSave
        });
        const playheadMethod = name => method(controllers.playhead, name);

        controllers.preview = createController(modules.preview, 'createCanvasTimelinePreviewController', {
            getDocument: scope.getDocument,
            getNode: scope.getNode,
            isNodeLocked: scope.isNodeLocked,
            getClipAtTime: scope.getClipAtTime,
            clamp: scope.clamp,
            selectTimelineClip: scope.selectTimelineClip,
            refreshTimelinePreviewDom: scope.refreshTimelinePreviewDom,
            pushHistoryBatch: scope.pushHistoryBatch,
            timelineMaskLayerGeometry: scope.timelineMaskLayerGeometry,
            remapTimelineClipMaskForGeometryChange: scope.remapTimelineClipMaskForGeometryChange,
            syncTimelineClipTransformKeyframeAtPlayhead: scope.syncTimelineClipTransformKeyframeAtPlayhead,
            buildTimelineClipPatch: scope.buildTimelineClipPatch,
            refreshTimelineKeyframeMarkersDom: (...args) => domMethod('refreshTimelineKeyframeMarkersDom')?.(...args),
            refreshTimelinePreviewClipLayersDom: scope.refreshTimelinePreviewClipLayersDom,
            scheduleSave: scope.scheduleSave,
            getSelectedNodeId: scope.getSelectedNodeId,
            renderInspector: scope.renderInspector
        });
        const previewMethod = name => method(controllers.preview, name);

        controllers.playback = createController(modules.playback, 'createCanvasTimelinePlaybackController', {
            getNode: scope.getNode,
            getNodeElement: scope.getNodeElement,
            performanceNow: scope.performanceNow,
            requestAnimationFrame: scope.requestAnimationFrame,
            cancelAnimationFrame: scope.cancelAnimationFrame,
            syncTimelinePreviewVideos: scope.syncTimelinePreviewVideos,
            refreshTimelinePlayheadDom: (...args) => domMethod('refreshTimelinePlayheadDom')?.(...args),
            refreshTimelinePreviewDom: scope.refreshTimelinePreviewDom,
            buildTimelineParamsPatch: scope.buildTimelineParamsPatch,
            scheduleSave: scope.scheduleSave
        });
        const playbackMethod = name => method(controllers.playback, name);

        controllers.keyframe = createController(modules.keyframe, 'createCanvasTimelineKeyframeController', {
            getDocument: scope.getDocument,
            getNode: scope.getNode,
            isNodeLocked: scope.isNodeLocked,
            clamp: scope.clamp,
            performanceNow: scope.performanceNow,
            setSuppressWheelUntil: scope.setSuppressWheelUntil,
            pushHistoryBatch: scope.pushHistoryBatch,
            refreshTimelineKeyframeMarkersDom: (...args) => domMethod('refreshTimelineKeyframeMarkersDom')?.(...args),
            refreshTimelinePlayheadDom: (...args) => domMethod('refreshTimelinePlayheadDom')?.(...args),
            refreshTimelinePreviewDom: scope.refreshTimelinePreviewDom,
            buildTimelineKeyframesPatch: scope.buildTimelineKeyframesPatch,
            buildTimelineParamsPatch: scope.buildTimelineParamsPatch,
            scheduleSave: scope.scheduleSave,
            getSelectedNodeId: scope.getSelectedNodeId,
            renderInspector: scope.renderInspector
        });
        const keyframeMethod = name => method(controllers.keyframe, name);

        controllers.clip = createController(modules.clip, 'createCanvasTimelineClipController', {
            getDocument: scope.getDocument,
            getNode: scope.getNode,
            isNodeLocked: scope.isNodeLocked,
            clamp: scope.clamp,
            performanceNow: scope.performanceNow,
            setSuppressWheelUntil: scope.setSuppressWheelUntil,
            pushHistory: scope.pushHistory,
            selectTimelineClip: scope.selectTimelineClip,
            timelineLaneInfoFromTarget: (...args) => domMethod('timelineLaneInfoFromTarget')?.(...args),
            buildTimelineClipPatch: scope.buildTimelineClipPatch,
            buildTimelineParamsPatch: scope.buildTimelineParamsPatch,
            snapTimelineTime: scope.snapTimelineTime,
            timelineTrackCompatible: scope.timelineTrackCompatible,
            timelineClipAvailableDuration: scope.timelineClipAvailableDuration,
            enforceTimelineClipMediaBounds: scope.enforceTimelineClipMediaBounds,
            normalizeNode: scope.normalizeNode,
            refreshTimelineClipDom: (...args) => domMethod('refreshTimelineClipDom')?.(...args),
            refreshTimelineTrackRowsDom: (...args) => domMethod('refreshTimelineTrackRowsDom')?.(...args),
            refreshTimelinePlayheadDom: (...args) => domMethod('refreshTimelinePlayheadDom')?.(...args),
            refreshTimelinePreviewDom: scope.refreshTimelinePreviewDom,
            renderEdges: scope.renderEdges,
            scheduleSave: scope.scheduleSave,
            getSelectedNodeId: scope.getSelectedNodeId,
            renderInspector: scope.renderInspector
        });
        const clipMethod = name => method(controllers.clip, name);

        controllers.mask = createController(modules.mask, 'createCanvasTimelineMaskController', {
            getDocument: scope.getDocument,
            getNode: scope.getNode,
            isNodeLocked: scope.isNodeLocked,
            clamp: scope.clamp,
            performanceNow: scope.performanceNow,
            setSuppressWheelUntil: scope.setSuppressWheelUntil,
            getTimelinePenAnchorTarget: scope.getTimelinePenAnchorTarget,
            closeTimelinePendingPenPath: scope.closeTimelinePendingPenPath,
            buildTimelineClipMaskPatch: scope.buildTimelineClipMaskPatch,
            buildTimelineClipMaskPointPatch: scope.buildTimelineClipMaskPointPatch,
            syncTimelinePreviewVideos: scope.syncTimelinePreviewVideos,
            timelineMaskPointFromEvent: scope.timelineMaskPointFromEvent,
            timelineMaskDimensions: scope.timelineMaskDimensions,
            timelineMaskPointDistancePx: scope.timelineMaskPointDistancePx,
            timelineMaskCloseSnapPx: scope.timelineMaskCloseSnapPx,
            exportTimelineMaskDataUrl: scope.exportTimelineMaskDataUrl,
            selectTimelineClip: scope.selectTimelineClip,
            refreshTimelinePenOverlayDom: scope.refreshTimelinePenOverlayDom,
            pushHistoryBatch: scope.pushHistoryBatch,
            scheduleSave: scope.scheduleSave,
            getSelectedNodeId: scope.getSelectedNodeId,
            renderInspector: scope.renderInspector
        });
        const maskMethod = name => method(controllers.mask, name);

        controllers.directorTimelineDrag = createController(
            modules.directorTimelineDrag,
            'createCanvasDirectorTimelineDragController',
            {
                getDocument: scope.getDocument,
                getNode: scope.getNode,
                isDirectorTimelineNode: scope.isDirectorTimelineNode,
                isNodeLocked: scope.isNodeLocked,
                normalizeDirectorTimelineForNode: scope.normalizeDirectorTimelineForNode,
                normalizeTimeline: scope.normalizeTimeline,
                directorTimelineNeighborBounds: scope.directorTimelineNeighborBounds,
                directorTimelineTotalSeconds: scope.directorTimelineTotalSeconds,
                directorTimelineClampSeconds: scope.directorTimelineClampSeconds,
                directorTimelineRoundSeconds: scope.directorTimelineRoundSeconds,
                buildDirectorTimelineStatePatch: scope.buildDirectorTimelineStatePatch,
                pushHistoryBatch: scope.pushHistoryBatch,
                updateDirectorStatus: scope.updateDirectorStatus,
                mutate: scope.mutate,
                getSelectedNodeId: scope.getSelectedNodeId,
                scheduleSave: scope.scheduleSave
            }
        );
        const directorTimelineDragMethod = name => method(controllers.directorTimelineDrag, name);

        controllers.frame = createController(modules.frame, 'createCanvasTimelineFrameController', {
            getDocument: scope.getDocument,
            getNode: scope.getNode,
            getNodesLayer: scope.getNodesLayer,
            cssEscape: scope.cssEscape,
            clamp: scope.clamp,
            getTimelineSourceAsset: scope.getTimelineSourceAsset,
            assetMediaKind: scope.assetMediaKind,
            assetDisplaySrc: scope.assetDisplaySrc,
            getMediaEditRange: scope.getMediaEditRange,
            loadImageElementForCanvas: scope.loadImageElementForCanvas,
            effectiveClipIn: scope.effectiveClipIn,
            normalizeTimelineNode: scope.normalizeTimelineNode,
            serializeTimelineRenderPayload: scope.serializeTimelineRenderPayload,
            clipMaskDataUrl: scope.clipMaskDataUrl,
            timelineClipLayerGeometry: scope.timelineClipLayerGeometry
        });

        controllers.render = createController(modules.render, 'createCanvasTimelineRenderController', {
            getProject: scope.getProject,
            getProjectId: scope.getProjectId,
            getNode: scope.getNode,
            isNodeLocked: scope.isNodeLocked,
            defaultNodeSize: scope.defaultNodeSize,
            uid: scope.uid,
            t: scope.t,
            placeNodeAvoidingOverlap: scope.placeNodeAvoidingOverlap,
            ensureGenerateEdge: scope.ensureGenerateEdge,
            setSelectedNodeId: scope.setSelectedNodeId,
            setSelectedNodeIds: scope.setSelectedNodeIds,
            setSelectedEdgeId: scope.setSelectedEdgeId,
            pushHistory: scope.pushHistory,
            mutate: scope.mutate,
            showToast: scope.showToast,
            serializeTimelineRenderPayload: scope.serializeTimelineRenderPayload,
            buildTimelineOutputResultNode: scope.buildTimelineOutputResultNode,
            buildProjectNodeAppendPatch: scope.buildProjectNodeAppendPatch,
            buildTimelineResultPatch: scope.buildTimelineResultPatch,
            buildTimelineRenderAsset: scope.buildTimelineRenderAsset,
            buildTimelinePreviewAsset: scope.buildTimelinePreviewAsset,
            stableHash: scope.stableHash,
            renderTimelinePreviewFrameDataUrl: scope.renderTimelinePreviewFrameDataUrl,
            sendCanvasRenderTimelineRequest: scope.sendCanvasRenderTimelineRequest,
            refreshMainGalleryAfterCanvasRun: scope.refreshMainGalleryAfterCanvasRun
        });

        controllers.compare = createController(modules.compare, 'createCanvasTimelineCompareController', {
            getProject: scope.getProject,
            getProjectId: scope.getProjectId,
            uid: scope.uid,
            t: scope.t,
            clamp: scope.clamp,
            defaultNodeSize: scope.defaultNodeSize,
            placeNodeAvoidingOverlap: scope.placeNodeAvoidingOverlap,
            setSelectedNodeId: scope.setSelectedNodeId,
            setSelectedNodeIds: scope.setSelectedNodeIds,
            setSelectedEdgeId: scope.setSelectedEdgeId,
            mutate: scope.mutate,
            showToast: scope.showToast,
            nowIso: scope.nowIso,
            normalizeTimelineNode: scope.normalizeTimelineNode,
            serializeTimelineRenderPayload: scope.serializeTimelineRenderPayload,
            buildTimelineCompareResultNode: scope.buildTimelineCompareResultNode,
            buildProjectNodeAppendPatch: scope.buildProjectNodeAppendPatch,
            buildTimelineResultPatch: scope.buildTimelineResultPatch,
            buildTimelineCompareAsset: scope.buildTimelineCompareAsset,
            buildTimelineDebugPatch: scope.buildTimelineDebugPatch,
            renderTimelinePreviewFrameDataUrl: scope.renderTimelinePreviewFrameDataUrl,
            getActiveTimelineVisualClips: scope.getActiveTimelineVisualClips,
            compareTimelineFrameImages: scope.compareTimelineFrameImages,
            sendCanvasRenderTimelineFrameRequest: scope.sendCanvasRenderTimelineFrameRequest,
            assetDisplaySrc: scope.assetDisplaySrc
        });

        controllers.param = createController(modules.param, 'createCanvasTimelineParamController', {
            getNode: scope.getNode,
            getSelectedNodeId: scope.getSelectedNodeId,
            getNodeElement: scope.getNodeElement,
            isNodeLocked: scope.isNodeLocked,
            clamp: scope.clamp,
            captureTimelineMaskGeometry: scope.captureTimelineMaskGeometry,
            remapTimelineMasksAfterCanvasResize: scope.remapTimelineMasksAfterCanvasResize,
            applyTimelineMaskFeatherToSelectedClip: scope.applyTimelineMaskFeatherToSelectedClip,
            normalizeTimelineNode: scope.normalizeTimelineNode,
            enforceTimelineClipMediaBounds: scope.enforceTimelineClipMediaBounds,
            timelineMaskLayerGeometry: scope.timelineMaskLayerGeometry,
            buildTimelineParamsPatch: scope.buildTimelineParamsPatch,
            buildTimelineParamUpdatePatch: scope.buildTimelineParamUpdatePatch,
            buildTimelineClipParamUpdatePatch: scope.buildTimelineClipParamUpdatePatch,
            syncTimelineClipTransformKeyframeAtPlayhead: scope.syncTimelineClipTransformKeyframeAtPlayhead,
            remapTimelineClipMaskForGeometryChange: scope.remapTimelineClipMaskForGeometryChange,
            getTimelineDefaultParams: scope.getTimelineDefaultParams,
            getTimelineSourceAsset: scope.getTimelineSourceAsset,
            getMediaEditRange: scope.getMediaEditRange,
            pushHistoryBatch: scope.pushHistoryBatch,
            scheduleSave: scope.scheduleSave,
            mutate: scope.mutate,
            refreshTimelineFeatherControlDom: scope.refreshTimelineFeatherControlDom,
            refreshTimelineMaskFeatherDom: scope.refreshTimelineMaskFeatherDom,
            refreshTimelineAllClipDom: (...args) => domMethod('refreshTimelineAllClipDom')?.(...args),
            refreshTimelinePlayheadDom: (...args) => domMethod('refreshTimelinePlayheadDom')?.(...args),
            refreshTimelinePreviewDom: scope.refreshTimelinePreviewDom,
            refreshTimelineClipDom: (...args) => domMethod('refreshTimelineClipDom')?.(...args),
            refreshTimelineInlineValue: scope.refreshTimelineInlineValue
        });
        const paramMethod = name => method(controllers.param, name);

        controllers.command = createController(modules.command, 'createCanvasTimelineCommandController', {
            getNode: scope.getNode,
            isNodeLocked: scope.isNodeLocked,
            clamp: scope.clamp,
            setSelectedNodeId: scope.setSelectedNodeId,
            setSelectedNodeIds: scope.setSelectedNodeIds,
            setSelectedEdgeId: scope.setSelectedEdgeId,
            updateTimelineParam: (...args) => paramMethod('updateTimelineParam')?.(...args),
            resetTimelineParam: (...args) => paramMethod('resetTimelineParam')?.(...args),
            resetTimelineClipParam: (...args) => paramMethod('resetTimelineClipParam')?.(...args),
            timelineSelectedVisualClip: scope.timelineSelectedVisualClip,
            timelineKeyframeTime: scope.timelineKeyframeTime,
            timelineKeyframeIndexAt: scope.timelineKeyframeIndexAt,
            timelineKeyframeValuesAtPlayhead: scope.timelineKeyframeValuesAtPlayhead,
            timelineNormalizedKeyframes: (...args) => domMethod('timelineNormalizedKeyframes')?.(...args),
            syncTimelineClipTransformKeyframeAtPlayhead: scope.syncTimelineClipTransformKeyframeAtPlayhead,
            buildTimelineParamsPatch: scope.buildTimelineParamsPatch,
            buildTimelineTracksPatch: scope.buildTimelineTracksPatch,
            buildTimelineKeyframesPatch: scope.buildTimelineKeyframesPatch,
            buildTimelineClipResetPatch: scope.buildTimelineClipResetPatch,
            buildTimelineClipDeletePatch: scope.buildTimelineClipDeletePatch,
            buildProjectTimelineClipEdgeDeletePatch: scope.buildProjectTimelineClipEdgeDeletePatch,
            normalizeTimelineNode: scope.normalizeTimelineNode,
            uid: scope.uid,
            pushHistory: scope.pushHistory,
            pushHistoryBatch: scope.pushHistoryBatch,
            scheduleSave: scope.scheduleSave,
            mutate: scope.mutate,
            showToast: scope.showToast,
            t: scope.t,
            openContextMenu: scope.openContextMenu,
            getProject: scope.getProject,
            deleteEdge: scope.deleteEdge,
            centerViewportOnWorld: scope.centerViewportOnWorld,
            defaultNodeSize: scope.defaultNodeSize,
            captureTimelineMaskGeometry: scope.captureTimelineMaskGeometry,
            remapTimelineMasksAfterCanvasResize: scope.remapTimelineMasksAfterCanvasResize,
            timelineDuration: scope.timelineDuration
        });
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
