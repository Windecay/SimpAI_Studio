(function () {
    'use strict';

    function createCanvasDirectorSegmentTimelineController(context) {
        const scope = context?.directorSegmentTimelineSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const resultSource = scope.resultSource || {};
        const layoutSource = scope.layoutSource || {};
        const factorySource = scope.factorySource || {};
        const edgeSource = scope.edgeSource || {};
        const timelineSource = scope.timelineSource || {};
        const languageSource = scope.languageSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getProject = () => call(projectSource, 'getProject', {});
        const getNode = (...args) => call(nodeSource, 'getNode', null, ...args);
        const presetResultBasePosition = (...args) => call(layoutSource, 'presetResultBasePosition', { x: 0, y: 0 }, ...args);
        const defaultResultNodeSize = (...args) => call(layoutSource, 'defaultResultNodeSize', { w: 640, h: 480 }, ...args);
        const buildDirectorSegmentResultNode = (...args) => call(resultSource, 'buildDirectorSegmentResultNode', null, ...args);
        const buildCanvasRunStatus = (...args) => call(resultSource, 'buildCanvasRunStatus', {}, ...args);
        const placeNodeAvoidingOverlap = (...args) => call(layoutSource, 'placeNodeAvoidingOverlap', undefined, ...args);
        const buildProjectNodeAppendPatch = (...args) => call(projectSource, 'buildProjectNodeAppendPatch', {}, ...args);
        const ensureGenerateEdge = (...args) => call(edgeSource, 'ensureGenerateEdge', undefined, ...args);
        const addTimelineNode = (...args) => call(timelineSource, 'addTimelineNode', null, ...args);
        const addTimelineClipFromSource = (...args) => call(timelineSource, 'addTimelineClipFromSource', null, ...args);
        const timelineNormalizeNode = (...args) => call(timelineSource, 'timelineNormalizeNode', undefined, ...args);
        const timelineBuildSourcePatch = (...args) => call(factorySource, 'timelineBuildSourcePatch', {}, ...args);
        const timelineBuildClipPatch = (...args) => call(factorySource, 'timelineBuildClipPatch', {}, ...args);
        const timelineBuildParamsPatch = (...args) => call(factorySource, 'timelineBuildParamsPatch', {}, ...args);
        const filterProjectEdges = (...args) => call(projectSource, 'filterProjectEdges', [], ...args);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {});
            return call(languageSource, 't', en, en, cn, state);
        };

        function createDirectorSegmentResultNode(presetNode, plan, segment, index, runId, runToken) {
            const basePosition = presetResultBasePosition(presetNode);
            const size = defaultResultNodeSize();
            const total = plan.segments.length;
            const node = buildDirectorSegmentResultNode({
                position: {
                    x: basePosition.x,
                    y: basePosition.y + index * (size.h + 42)
                },
                size,
                title: `${presetNode.title || 'Preset'} ${t('Shot {index}', '分镜 {index}').replace('{index}', String(index + 1))}`,
                producer: {
                    preset_node_id: presetNode.id,
                    run_id: runId,
                    run_token: runToken,
                    task_id: null,
                    fingerprint: '',
                    pending_fingerprint: '',
                    pending_run_token: runToken,
                    refreshing: true,
                    stale: false
                },
                status: buildCanvasRunStatus(
                    'queued',
                    t('Director segment {index}/{total} queued.', 'Director 分镜 {index}/{total} 已进入队列。')
                        .replace('{index}', String(index + 1))
                        .replace('{total}', String(total)),
                    { queuePosition: null, step: index + 1, totalSteps: total, percent: 0 }
                ),
                source: {
                    kind: 'director_segment_result',
                    director_node_id: plan.director.id,
                    preset_node_id: presetNode.id,
                    segment_index: index,
                    segment_id: segment?.id || `shot_${index + 1}`,
                    refreshing: true
                }
            });
            if (!node) return null;
            placeNodeAvoidingOverlap(node, { x: node.x, y: node.y }, { maxAttempts: 8 });
            const project = getProject();
            Object.assign(project, buildProjectNodeAppendPatch(project, node));
            ensureGenerateEdge(presetNode.id, node.id);
            return node;
        }

        function findDirectorSegmentTimelineNode(presetNode) {
            const project = getProject();
            const resultIds = new Set(project.edges.filter(edge => edge.type === 'generate' && edge.from === presetNode.id).map(edge => edge.to));
            for (const edge of project.edges) {
                if (edge.type !== 'timeline' || !resultIds.has(edge.from)) continue;
                const timeline = getNode(edge.to);
                if (timeline?.type === 'timeline') return timeline;
            }
            return project.nodes.find(item => item?.type === 'timeline' && item.source?.kind === 'director_segment_timeline' && item.source?.preset_node_id === presetNode.id) || null;
        }

        function clearDirectorPresetClipsFromTimeline(timelineNode, presetNodeId) {
            if (!timelineNode || timelineNode.type !== 'timeline') return;
            const removedClipIds = new Set();
            timelineNode.clips = (Array.isArray(timelineNode.clips) ? timelineNode.clips : []).filter((clip) => {
                const source = getNode(clip?.source_node_id);
                const samePreset = source?.type === 'result' && source.producer?.preset_node_id === presetNodeId;
                const directorOwned = source?.source?.kind === 'director_segment_result' || source?.source?.kind === 'template_result_placeholder';
                if (samePreset && directorOwned) {
                    removedClipIds.add(clip.id);
                    return false;
                }
                return true;
            });
            if (removedClipIds.size) {
                filterProjectEdges(edge => !(edge.type === 'timeline' && edge.to === timelineNode.id && removedClipIds.has(edge.slot)));
            }
        }

        function prepareDirectorSegmentTimeline(presetNode, plan, segmentResults) {
            let timeline = findDirectorSegmentTimelineNode(presetNode);
            if (!timeline) {
                const base = presetResultBasePosition(presetNode);
                timeline = addTimelineNode({ x: base.x, y: base.y + (segmentResults.length + 1) * (defaultResultNodeSize().h + 42) }, {
                    history: false,
                    render: false,
                    toast: false,
                    title: t('Director Segment Timeline', 'Director 分镜 Timeline')
                });
            }
            Object.assign(timeline, timelineBuildSourcePatch(timeline, {
                kind: 'director_segment_timeline',
                director_node_id: plan.director.id,
                preset_node_id: presetNode.id
            }));
            const width = Math.max(16, Math.round(Number(plan.payload?.width || timeline.params.width || 1280)));
            const height = Math.max(16, Math.round(Number(plan.payload?.height || timeline.params.height || 720)));
            const fps = Math.max(1, Math.min(120, Number(plan.payload?.fps || timeline.params.fps || 24)));
            clearDirectorPresetClipsFromTimeline(timeline, presetNode.id);
            let cursor = 0;
            segmentResults.forEach((result, index) => {
                const segment = plan.segments[index] || {};
                const duration = call(scope.segmentSource || {}, 'directorSegmentTimelineSeconds', 0, segment, plan, result);
                const clip = addTimelineClipFromSource(timeline, result, { history: false, render: false, edge: true, start: cursor, track_id: 'v1' });
                if (clip) {
                    Object.assign(clip, timelineBuildClipPatch({
                        title: `${result.title || 'Shot'} ${index + 1}`,
                        start: cursor,
                        duration: Math.max(0.05, duration),
                        in: 0,
                        out: Math.max(0.05, duration),
                        fit: 'contain'
                    }));
                }
                cursor += Math.max(0.05, duration);
            });
            Object.assign(timeline, timelineBuildParamsPatch(timeline, {
                width,
                height,
                aspect: `${width}:${height}`,
                size_preset: `${width}x${height}`,
                fps,
                fps_preset: String(fps),
                duration: Math.max(0.05, cursor, Number(plan.payload?.duration || 0)),
                playhead: 0
            }));
            if (typeof timelineSource.timelineNormalizeNode === 'function') timelineNormalizeNode(timeline);
            return timeline;
        }

        return {
            createDirectorSegmentResultNode,
            findDirectorSegmentTimelineNode,
            clearDirectorPresetClipsFromTimeline,
            prepareDirectorSegmentTimeline
        };
    }

    window.SimpAICanvasWorkbenchDirectorSegmentTimeline = Object.assign(
        {}, window.SimpAICanvasWorkbenchDirectorSegmentTimeline || {}, { createCanvasDirectorSegmentTimelineController }
    );
})();