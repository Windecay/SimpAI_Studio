(function () {
    'use strict';

    function createCanvasTimelineConnectionController(context) {
        const scope = context?.timelineConnectionSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const directorSource = scope.directorSource || {};
        const timelineSource = scope.timelineSource || {};
        const edgeSource = scope.edgeSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const isNodeLocked = node => !!call(nodeSource, 'isNodeLocked', false, node);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(uiSource, 'showToast', undefined, message);
        const isTimelineSource = source => !!call(timelineSource, 'isTimelineSource', false, source);
        const isDirectorMediaSourceForSlot = (source, slot) => !!call(directorSource, 'isDirectorMediaSourceForSlot', false, source, slot);
        const appendEdge = (type, edge) => call(edgeSource, 'appendProjectEdge', undefined,
            call(edgeSource, 'buildCanvasEdge', null, type, edge));

        function finishConnection(toId, options) {
            call(selectionSource, 'selectConnectionNode', undefined, toId);
            if (options && options.silent) return false;
            call(renderSource, 'mutate', undefined);
            return true;
        }

        function timelineTrackForSource(node, source) {
            const asset = call(timelineSource, 'getTimelineSourceAsset', null, source) || {};
            const kind = typeof timelineSource.timelineAssetMediaKind === 'function'
                ? timelineSource.timelineAssetMediaKind(asset)
                : call(timelineSource, 'assetMediaKind', 'image', asset);
            return call(timelineSource, 'timelineDefaultTrackId', kind === 'audio' ? 'a1' : 'v1', kind);
        }

        function addTimelineClipFromSource(timelineNode, source, options) {
            if (!timelineNode || timelineNode.type !== 'timeline' || !isTimelineSource(source)) return null;
            const opts = options || {};
            if (isNodeLocked(timelineNode)) {
                showToast(t('Locked timeline cannot be edited', '锁定的时间轴不能编辑'));
                return null;
            }
            if (opts.history !== false) call(historySource, 'pushHistory', undefined, 'Add timeline clip');
            call(timelineSource, 'timelineNormalizeNode', undefined, timelineNode);
            const trackId = opts.track_id || timelineTrackForSource(timelineNode, source);
            const start = Number.isFinite(Number(opts.start))
                ? Number(opts.start)
                : call(timelineSource, 'timelineNextStartForTrack', 0, timelineNode, trackId);
            const clipFactory = typeof timelineSource.timelineCreateClipFromSource === 'function'
                ? timelineSource.timelineCreateClipFromSource
                : timelineSource.timelineCreateFallbackClipFromSource;
            if (typeof clipFactory !== 'function') return null;
            const clip = clipFactory(source, {
                id: call(nodeSource, 'uid', '', 'clip'), track_id: trackId, start
            }, call(timelineSource, 'getNodeContext', {}));
            if (!clip) return null;
            Object.assign(timelineNode, call(timelineSource, 'timelineBuildClipAppendPatch', {}, timelineNode, clip));
            call(timelineSource, 'timelineNormalizeNode', undefined, timelineNode);
            if (opts.edge !== false) appendEdge('timeline', { from: source.id, to: timelineNode.id, slot: clip.id });
            if (opts.render !== false) call(renderSource, 'mutate', undefined);
            return clip;
        }

        function writeDirectorConnection(fromId, to, targetSlot) {
            call(edgeSource, 'filterProjectEdges', undefined,
                edge => !(edge.type === 'media' && edge.to === to.id && edge.slot === targetSlot));
            appendEdge('media', { from: fromId, to: to.id, slot: targetSlot });
            Object.assign(to, call(directorSource, 'buildDirectorTimelineStatePatch', {}, to, {
                mediaInputsPatch: { [targetSlot]: fromId }
            }));
            call(directorSource, 'updateDirectorStatus', undefined, to);
        }

        function connectPendingDirectorSource(from, to) {
            if (!from || !to || !call(directorSource, 'isDirectorTimelineNode', false, to)) return '';
            const specs = call(directorSource, 'getMediaSlotSpecs', []);
            const slots = Array.isArray(specs) ? specs : [];
            const slot = slots.find(item => isDirectorMediaSourceForSlot(from, item.key) && !to.media_inputs?.[item.key])
                || slots.find(item => isDirectorMediaSourceForSlot(from, item.key));
            if (!slot) return '';
            writeDirectorConnection(from.id, to, slot.key);
            return t('connected to {slot}', '已连接到 {slot}').replace('{slot}', slot.label || slot.key);
        }

        function createDirectorTimelineMediaEdge(fromId, toId, slot, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            const specs = call(directorSource, 'getMediaSlotSpecs', []);
            const slots = Array.isArray(specs) ? specs : [];
            const requestedKind = ['image', 'audio', 'video'].includes(options?.kind) ? options.kind : '';
            const exactSlot = slots.find(item => item.key === slot && isDirectorMediaSourceForSlot(from, item.key));
            const matchingSlots = slots.filter(item => (!requestedKind || item.kind === requestedKind) && isDirectorMediaSourceForSlot(from, item.key));
            const targetSlot = exactSlot?.key
                || matchingSlots.find(item => !to?.media_inputs?.[item.key])?.key
                || matchingSlots[0]?.key
                || '';
            if (!from || !to || !call(directorSource, 'isDirectorTimelineNode', false, to)
                || !targetSlot || !isDirectorMediaSourceForSlot(from, targetSlot)) {
                showToast(t('Director Timeline accepts image, video, audio, or matching Result nodes.', '导演时间轴接受图片、视频、音频或匹配的 Result 节点。'));
                return;
            }
            if (isNodeLocked(from) || isNodeLocked(to)) {
                showToast(t('Locked nodes cannot change connections', '锁定节点不能修改连接'));
                return;
            }
            if (!options || !options.silent) call(historySource, 'pushHistory', undefined, 'Connect Director media');
            writeDirectorConnection(fromId, to, targetSlot);
            if (finishConnection(toId, options)) {
                showToast(t('Director media connected to {slot}', '已连接导演媒体到 {slot}').replace('{slot}', targetSlot));
            }
        }

        function connectPendingTimelineSource(from, node) {
            const clip = addTimelineClipFromSource(node, from, { history: false, render: false, edge: false });
            if (!clip) return '';
            appendEdge('timeline', { from: from.id, to: node.id, slot: clip.id });
            return t('added to timeline', '已添加到 Timeline');
        }

        function createTimelineClipEdge(fromId, toId, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            if (!from || !to || !isTimelineSource(from) || to.type !== 'timeline') {
                showToast(t('Timeline only accepts Image / Video / Audio / Result nodes', '时间轴只接受图像 / 视频 / 音频 / 结果节点'));
                return;
            }
            if (isNodeLocked(from) || isNodeLocked(to)) {
                showToast(t('Locked nodes cannot change connections', '锁定节点不能修改连接'));
                return;
            }
            if (!options || !options.silent) call(historySource, 'pushHistory', undefined, 'Connect timeline clip');
            const clip = addTimelineClipFromSource(to, from, { history: false, render: false, edge: false, track_id: options?.track_id });
            if (!clip) return;
            appendEdge('timeline', { from: fromId, to: toId, slot: clip.id });
            if (finishConnection(toId, options)) {
                showToast(t('Media added to timeline', '素材已添加到时间轴'));
            }
        }

        return { timelineTrackForSource, addTimelineClipFromSource, createDirectorTimelineMediaEdge, createTimelineClipEdge,
            connectPendingDirectorSource, connectPendingTimelineSource };
    }

    window.SimpAICanvasWorkbenchTimelineConnection = Object.assign(
        {}, window.SimpAICanvasWorkbenchTimelineConnection || {}, { createCanvasTimelineConnectionController }
    );
})();
