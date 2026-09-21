(function () {
    'use strict';

    function createCanvasTimelineCreationController(context) {
        const scope = context?.timelineCreationSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const timelineSource = scope.timelineSource || {};
        const layoutSource = scope.layoutSource || {};
        const connectionSource = scope.connectionSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(uiSource, 'showToast', undefined, message);
        const isTimelineSource = source => !!call(timelineSource, 'isTimelineSource', false, source);
        const selectTimeline = node => call(selectionSource, 'selectTimelineNode', undefined, node.id);
        const appendClips = (node, sources) => sources.reduce((count, source) => count + (
            call(connectionSource, 'addTimelineClipFromSource', null, node, source, { history: false, render: false }) ? 1 : 0
        ), 0);

        function addTimelineNode(world, options) {
            const opts = options || {};
            if (opts.history !== false) call(historySource, 'pushHistory', undefined, 'Add media timeline node');
            const node = call(timelineSource, 'timelineCreateNode', null, world,
                Object.assign({}, opts, { title: opts.title || t('Media Timeline', '媒体时间轴') }),
                call(timelineSource, 'getNodeContext', {}));
            if (!node) {
                showToast(t('Unable to create Timeline.', '无法创建时间轴。'));
                return null;
            }
            call(layoutSource, 'placeNodeAvoidingOverlap', undefined, node, world, opts);
            call(timelineSource, 'timelineNormalizeNode', undefined, node);
            const project = call(projectSource, 'getProject', {}) || {};
            Object.assign(project, call(projectSource, 'buildProjectNodeAppendPatch', {}, project, node));
            const autoMessage = call(connectionSource, 'completePendingConnectionToNode', '', node);
            selectTimeline(node);
            if (opts.render !== false) call(renderSource, 'mutate', undefined);
            if (opts.toast !== false) showToast(autoMessage
                ? t('Timeline added, {message}', 'Timeline 已添加，{message}').replace('{message}', autoMessage)
                : t('Timeline added', 'Timeline 已添加'));
            return node;
        }

        function addSelectedMediaToTimeline(timelineNode) {
            if (!timelineNode || timelineNode.type !== 'timeline') return;
            if (call(nodeSource, 'isNodeLocked', false, timelineNode)) {
                showToast(t('Locked timeline cannot be edited', '锁定的时间轴不能编辑'));
                return;
            }
            const sources = call(selectionSource, 'getSelectedNodeIdList', [])
                .map(id => call(nodeSource, 'getNode', null, id))
                .filter(source => source && source.id !== timelineNode.id && isTimelineSource(source));
            if (!sources.length) {
                showToast(t('Select Image / Video / Audio / Result nodes together with the timeline first.',
                    '请先同时选中时间轴与图像 / 视频 / 音频 / 结果节点。'));
                return;
            }
            call(historySource, 'pushHistory', undefined, 'Add selected media to timeline');
            const count = appendClips(timelineNode, sources);
            if (!count) {
                showToast(t('No media items were added to Timeline.', '没有素材添加到时间轴。'));
                return;
            }
            selectTimeline(timelineNode);
            call(renderSource, 'mutate', undefined);
            showToast(t('Added {count} media item(s) to Timeline.', '已添加 {count} 个素材到 Timeline').replace('{count}', count));
        }

        function createTimelineNodeFromSources(sources) {
            const list = (sources || []).filter(isTimelineSource);
            if (!list.length) {
                showToast(t('Select Image / Video / Audio / Result nodes first.', '请先选中图像 / 视频 / 音频 / 结果节点。'));
                return null;
            }
            const rects = list.map(source => call(layoutSource, 'getNodeRect', {}, source));
            const minY = Math.min(...rects.map(rect => rect.y));
            const maxX = Math.max(...rects.map(rect => rect.x + rect.w));
            const base = { x: Math.round(maxX + 80), y: Math.round(minY) };
            call(historySource, 'pushHistory', undefined, 'Create media timeline');
            const node = addTimelineNode(base, { history: false, render: false, toast: false, title: t('Media Timeline', '媒体时间轴') });
            if (!node) return null;
            const count = appendClips(node, list);
            selectTimeline(node);
            call(renderSource, 'mutate', undefined);
            showToast(count
                ? t('Timeline created from {count} media item(s).', 'Timeline 已从 {count} 个素材创建').replace('{count}', count)
                : t('Timeline created, but no media items were added.', '时间轴已创建，但没有添加素材。'));
            return node;
        }

        return { addTimelineNode, addSelectedMediaToTimeline, createTimelineNodeFromSources };
    }

    window.SimpAICanvasWorkbenchTimelineCreation = Object.assign(
        {}, window.SimpAICanvasWorkbenchTimelineCreation || {}, { createCanvasTimelineCreationController }
    );
})();
