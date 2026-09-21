(function () {
    'use strict';

    function createCanvasAuxNodeCreationController(context) {
        const scope = context?.auxNodeCreationSource || context || {};
        const factorySource = scope.factorySource || {};
        const projectSource = scope.projectSource || {};
        const layoutSource = scope.layoutSource || {};
        const connectionSource = scope.connectionSource || {};
        const selectionSource = scope.selectionSource || {};
        const historySource = scope.historySource || {};
        const renderSource = scope.renderSource || {};
        const refreshSource = scope.refreshSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getProject = () => call(projectSource, 'getProject', {});
        const buildProjectNodeAppendPatch = (...args) => call(projectSource, 'buildProjectNodeAppendPatch', {}, ...args);
        const buildWildcardsHelperNode = (...args) => call(factorySource, 'buildWildcardsHelperNode', null, ...args);
        const buildMediaBrowserNode = (...args) => call(factorySource, 'buildMediaBrowserNode', null, ...args);
        const buildNoteNode = (...args) => call(factorySource, 'buildNoteNode', null, ...args);
        const placeNodeAvoidingOverlap = (...args) => call(layoutSource, 'placeNodeAvoidingOverlap', undefined, ...args);
        const viewportCenterWorld = () => call(layoutSource, 'viewportCenterWorld', null);
        const completePendingConnectionToNode = node => call(connectionSource, 'completePendingConnectionToNode', undefined, node);
        const selectAuxNode = (...args) => call(selectionSource, 'selectAuxNode', undefined, ...args);
        const pushHistory = label => call(historySource, 'pushHistory', undefined, label);
        const mutate = (...args) => call(renderSource, 'mutate', undefined, ...args);
        const refreshWildcardsCatalog = (...args) => call(refreshSource, 'refreshWildcardsCatalog', undefined, ...args);
        const refreshMediaBrowserNode = (...args) => call(refreshSource, 'refreshMediaBrowserNode', undefined, ...args);
        const showToast = text => call(uiSource, 'showToast', undefined, text);
        const warn = (...args) => call(uiSource, 'warn', undefined, ...args);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function addWildcardsHelperNode(world, options) {
            const opts = options || {};
            if (opts.history !== false) pushHistory('Add wildcards helper node');
            const node = buildWildcardsHelperNode(world, opts);
            placeNodeAvoidingOverlap(node, world);
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            completePendingConnectionToNode(node);
            selectAuxNode(node.id, false);
            refreshWildcardsCatalog(node, { force: true, render: false }).finally(() => mutate());
            showToast(t('Wildcards Helper node added.', '已添加通配符小助手节点。'));
            return node;
        }

        function addMediaBrowserNode(world, options) {
            const opts = options || {};
            if (opts.history !== false) pushHistory('Add media browser node');
            const node = buildMediaBrowserNode(world, opts);
            placeNodeAvoidingOverlap(node, world || viewportCenterWorld());
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            selectAuxNode(node.id, true);
            mutate({ inspector: true });
            refreshMediaBrowserNode(node).catch((err) => warn('[SimpAI Canvas] media browser node refresh failed', err));
            showToast(t('Media Browser node added.', '已添加媒体浏览器节点。'));
            return node;
        }

        function addNoteNode(world, options) {
            if (!options || options.history !== false) pushHistory('Add tip note');
            const node = buildNoteNode(world, options);
            placeNodeAvoidingOverlap(node, world, { keepVisible: options?.keepVisible });
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            selectAuxNode(node.id, true);
            mutate();
            showToast(t('Tip note added.', '已添加提示贴。'));
            return node;
        }

        return { addWildcardsHelperNode, addMediaBrowserNode, addNoteNode };
    }

    window.SimpAICanvasWorkbenchAuxNodeCreation = Object.assign(
        {}, window.SimpAICanvasWorkbenchAuxNodeCreation || {}, { createCanvasAuxNodeCreationController }
    );
})();
