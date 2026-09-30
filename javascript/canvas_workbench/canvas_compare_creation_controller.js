(function () {
    'use strict';

    function createCanvasCompareCreationController(context) {
        const scope = context?.compareCreationSource || context || {};
        const factorySource = scope.factorySource || {};
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
        const selectCompareNode = nodeId => call(selectionSource, 'selectCompareNode', undefined, nodeId);
        const addCompareImageEdge = (...args) => call(connectionSource, 'createCompareImageEdge', undefined, ...args);

        function addCompareNode(world, options) {
            const opts = options || {};
            return call(factorySource, 'addCompareNode', null, world, opts);
        }

        function createCompareNodeFromSources(sources) {
            const pair = (sources || []).filter(source => call(scope.nodeSource || {}, 'isImageCompareSource', false, source)).slice(0, 2);
            if (pair.length < 2) {
                showToast(t('Select two Image or image Result nodes first.', '请先选择两个图像或图像结果节点。'));
                return null;
            }
            const rectA = call(layoutSource, 'getNodeRect', {}, pair[0]) || {};
            const rectB = call(layoutSource, 'getNodeRect', {}, pair[1]) || {};
            const size = call(layoutSource, 'defaultNodeSize', { w: 560, h: 520 }, 'compare') || { w: 560, h: 520 };
            const base = {
                x: Math.round(Math.max(rectA.x + rectA.w, rectB.x + rectB.w) + 80),
                y: Math.round((Math.min(rectA.y, rectB.y) + Math.max(rectA.y + rectA.h, rectB.y + rectB.h)) / 2 - size.h / 2)
            };
            call(historySource, 'pushHistory', undefined, 'Create compare node');
            const node = addCompareNode(base, {
                history: false,
                render: false,
                toast: false,
                title: (pair[0].title || 'Image A') + ' / ' + (pair[1].title || 'Image B')
            });
            if (!node) return null;
            addCompareImageEdge(pair[0].id, node.id, 'a', { silent: true });
            addCompareImageEdge(pair[1].id, node.id, 'b', { silent: true });
            selectCompareNode(node.id);
            call(renderSource, 'mutate', undefined);
            showToast(t('Compare node created from selected images.', 'Compare 节点已从选中图片创建'));
            return node;
        }

        return { addCompareNode, createCompareNodeFromSources };
    }

    window.SimpAICanvasWorkbenchCompareCreation = Object.assign(
        {}, window.SimpAICanvasWorkbenchCompareCreation || {}, { createCanvasCompareCreationController }
    );
})();
