(function () {
    'use strict';

    function createCanvasAuxNodeCreationController(context) {
        const scope = context?.auxNodeCreationSource || context || {};
        const factorySource = scope.factorySource || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
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
        const getNode = (...args) => call(nodeSource, 'getNode', null, ...args);
        const buildProjectNodeAppendPatch = (...args) => call(projectSource, 'buildProjectNodeAppendPatch', {}, ...args);
        const buildWildcardsHelperNode = (...args) => call(factorySource, 'buildWildcardsHelperNode', null, ...args);
        const buildMediaBrowserNode = (...args) => call(factorySource, 'buildMediaBrowserNode', null, ...args);
        const buildNoteNode = (...args) => call(factorySource, 'buildNoteNode', null, ...args);
        const buildTranslationNode = (...args) => call(factorySource, 'buildTranslationNode', null, ...args);
        const buildTagCartNode = (...args) => call(factorySource, 'buildTagCartNode', null, ...args);
        const buildWd14Node = (...args) => call(factorySource, 'buildWd14Node', null, ...args);
        const buildVlmNode = (...args) => call(factorySource, 'buildVlmNode', null, ...args);
        const buildMaskNode = (...args) => call(factorySource, 'buildMaskNode', null, ...args);
        const buildTextNode = (...args) => call(factorySource, 'buildTextNode', null, ...args);
        const buildTextMergeNode = (...args) => call(factorySource, 'buildTextMergeNode', null, ...args);
        const buildManualOutputNode = (...args) => call(factorySource, 'buildManualOutputNode', null, ...args);
        const buildClassicNode = (...args) => call(factorySource, 'buildClassicNode', null, ...args);
        const buildPresetNode = (...args) => call(factorySource, 'buildPresetNode', null, ...args);
        const buildStyleSelectorNode = (...args) => call(factorySource, 'buildStyleSelectorNode', null, ...args);
        const placeNodeAvoidingOverlap = (...args) => call(layoutSource, 'placeNodeAvoidingOverlap', undefined, ...args);
        const buildNodeLayoutPatch = (...args) => call(layoutSource, 'buildNodeLayoutPatch', {}, ...args);
        const viewportCenterWorld = () => call(layoutSource, 'viewportCenterWorld', null);
        const completePendingConnectionToNode = node => call(connectionSource, 'completePendingConnectionToNode', undefined, node);
        const selectAuxNode = (...args) => call(selectionSource, 'selectAuxNode', undefined, ...args);
        const selectManualOutputNode = (...args) => call(selectionSource, 'selectManualOutputNode', undefined, ...args);
        const selectPresetNode = nodeId => call(selectionSource, 'selectPresetNode', undefined, nodeId);
        const setSelectedStyle = (...args) => call(scope.actionSource || {}, 'setSelectedStyle', undefined, ...args);
        const linkStyleSelectorToPreset = (...args) => call(scope.actionSource || {}, 'linkStyleSelectorToPreset', undefined, ...args);
        const pushHistory = label => call(historySource, 'pushHistory', undefined, label);
        const mutate = (...args) => call(renderSource, 'mutate', undefined, ...args);
        const refreshWildcardsCatalog = (...args) => call(refreshSource, 'refreshWildcardsCatalog', undefined, ...args);
        const refreshMediaBrowserNode = (...args) => call(refreshSource, 'refreshMediaBrowserNode', undefined, ...args);
        const scheduleAutoPresetModelChecks = () => call(refreshSource, 'scheduleAutoPresetModelChecks', undefined);
        const showToast = text => call(uiSource, 'showToast', undefined, text);
        const warn = (...args) => call(uiSource, 'warn', undefined, ...args);
        const openTagCartForNode = (...args) => call(scope.actionSource || {}, 'openTagCartForNode', undefined, ...args);
        const findStyleSelectorForPreset = (...args) => call(scope.actionSource || {}, 'findStyleSelectorForPreset', null, ...args);
        const isNodeLocked = node => !!call(nodeSource, 'isNodeLocked', false, node);
        const getNodeRect = (...args) => call(layoutSource, 'getNodeRect', null, ...args);
        const defaultNodeSize = (...args) => call(layoutSource, 'defaultNodeSize', { w: 220, h: 250 }, ...args);
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

        function addTranslationNode(world, options) {
            if (!options || options.history !== false) pushHistory('Add translation node');
            const node = buildTranslationNode(world, options);
            placeNodeAvoidingOverlap(node, world);
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            const autoMessage = completePendingConnectionToNode(node);
            selectAuxNode(node.id, false);
            mutate();
            showToast(autoMessage
                ? t('Translation node added, {message}', '已添加翻译节点，{message}').replace('{message}', autoMessage)
                : t('Translation node added', '已添加翻译节点'));
            return node;
        }

        function addTextNode(world, options) {
            if (!options || options.history !== false) pushHistory('Add text node');
            const node = buildTextNode(world, options);
            placeNodeAvoidingOverlap(node, world);
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            const autoMessage = completePendingConnectionToNode(node);
            selectAuxNode(node.id, false);
            mutate();
            showToast(autoMessage
                ? t('Text node added, {message}', '已添加文本节点，{message}').replace('{message}', autoMessage)
                : t('Text node added', '已添加文本节点'));
            return node;
        }

        function addTextMergeNode(world, options) {
            const opts = options || {};
            if (opts.history !== false) pushHistory('Add multi-text merge node');
            const node = buildTextMergeNode(world, opts);
            placeNodeAvoidingOverlap(node, world);
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            const autoMessage = completePendingConnectionToNode(node);
            selectAuxNode(node.id, false);
            mutate();
            showToast(autoMessage || t('Multi-text Merge node added.', '已添加多文本合并节点。'));
            return node;
        }

        function addTagCartNode(world, options) {
            if (!options || options.history !== false) pushHistory('Add Tag Cart node');
            const node = buildTagCartNode(world, options);
            placeNodeAvoidingOverlap(node, world);
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            const autoMessage = completePendingConnectionToNode(node);
            selectAuxNode(node.id, false);
            mutate();
            openTagCartForNode(node);
            showToast(autoMessage
                ? `${t('Tag Cart node added', '已添加标签选择器节点')}${t(', ', '，')}${autoMessage}`
                : t('Tag Cart node added', '已添加标签选择器节点'));
            return node;
        }

        function addWd14Node(world, options) {
            if (!options || options.history !== false) pushHistory('Add WD14 node');
            const node = buildWd14Node(world, options);
            placeNodeAvoidingOverlap(node, world);
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            const autoMessage = completePendingConnectionToNode(node);
            selectAuxNode(node.id, false);
            mutate();
            showToast(autoMessage
                ? t('WD14 node added, {message}', '已添加 WD14 节点，{message}').replace('{message}', autoMessage)
                : t('WD14 node added', '已添加 WD14 节点'));
            return node;
        }

        function addVlmNode(world, options) {
            if (!options || options.history !== false) pushHistory('Add VLM node');
            const node = buildVlmNode(world, options);
            placeNodeAvoidingOverlap(node, world);
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            const autoMessage = completePendingConnectionToNode(node);
            selectAuxNode(node.id, false);
            mutate();
            showToast(autoMessage
                ? t('VLM node added, {message}', '已添加 VLM 节点，{message}').replace('{message}', autoMessage)
                : t('VLM node added', '已添加 VLM 节点'));
            return node;
        }

        function addMaskNode(world, options) {
            if (!options || options.history !== false) pushHistory('Add advanced masking node');
            const node = buildMaskNode(world, options);
            placeNodeAvoidingOverlap(node, world);
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            selectAuxNode(node.id, false);
            mutate();
            showToast(t('Advanced Masking node added', '已添加高级遮罩节点'));
            return node;
        }

        function addManualOutputNode(world) {
            pushHistory('Add output node');
            const node = buildManualOutputNode(world);
            placeNodeAvoidingOverlap(node, world);
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            const autoMessage = completePendingConnectionToNode(node);
            selectManualOutputNode(node.id);
            mutate();
            showToast(autoMessage
                ? t('Manual output node added, {message}', '已添加手动输出节点，{message}').replace('{message}', autoMessage)
                : t('Manual output node added', '已添加手动输出节点'));
            return node;
        }

        function createPresetLikeNode(entry, world, options, kind) {
            const opts = options || {};
            const classic = kind === 'classic';
            if (opts.history !== false) pushHistory(classic ? 'Add classic node' : 'Add preset node');
            const node = classic ? buildClassicNode(entry, world, opts) : buildPresetNode(entry, world, opts);
            if (opts.avoidOverlap === false || opts.source?.kind === 'canvas_agent_created') {
                Object.assign(node, buildNodeLayoutPatch(node, {
                    x: Math.round(world.x || 0),
                    y: Math.round(world.y || 0)
                }));
            } else {
                placeNodeAvoidingOverlap(node, world);
            }
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            const autoMessage = completePendingConnectionToNode(node);
            selectPresetNode(node.id);
            if (opts.render !== false) mutate();
            scheduleAutoPresetModelChecks();
            const label = classic ? 'Added classic node' : 'Added preset node';
            const localizedLabel = classic ? '已添加 classic 节点' : '已添加预设节点';
            showToast(autoMessage ? t(label + ', {message}', localizedLabel + '，{message}').replace('{message}', autoMessage) : t(label, localizedLabel));
            return node;
        }

        function addClassicNode(entry, world, options) {
            return createPresetLikeNode(entry, world, options, 'classic');
        }

        function addPresetNode(entry, world, options) {
            const opts = options || {};
            const isScene = !!entry.scene || !!(entry.schema && typeof entry.schema === 'object' && entry.schema.scene_frontend);
            if (!isScene) return addClassicNode(entry, world, opts);
            return createPresetLikeNode(entry, world, opts, 'preset');
        }

        function addStyleSelectorNode(world, options) {
            const opts = options || {};
            if (opts.history !== false) pushHistory('Add Style Selector node');
            const node = buildStyleSelectorNode(world, opts);
            if (opts.selectedName) setSelectedStyle(node, opts.selectedName);
            if (opts.avoidOverlap === false) {
                Object.assign(node, buildNodeLayoutPatch(node, {
                    x: Math.round(world?.x || 0),
                    y: Math.round(world?.y || 0)
                }));
            } else {
                placeNodeAvoidingOverlap(node, world || viewportCenterWorld());
            }
            Object.assign(getProject(), buildProjectNodeAppendPatch(getProject(), node));
            if (opts.targetPresetId) linkStyleSelectorToPreset(node, getNode(opts.targetPresetId), { silent: true });
            completePendingConnectionToNode(node);
            if (opts.select !== false) selectAuxNode(node.id, true);
            if (opts.render !== false) mutate({ inspector: true });
            if (opts.toast !== false) showToast(t('Style Selector node added.', '已添加 Style Selector 节点。'));
            return node;
        }

        function ensureStyleSelectorForPreset(presetNode, options) {
            if (!presetNode || presetNode.type !== 'preset') return null;
            if (isNodeLocked(presetNode)) {
                showToast(t('Locked preset cannot change Style Selector links.', '已锁定的 preset 无法修改 Style Selector 连接。'));
                return null;
            }
            const opts = options || {};
            let selector = findStyleSelectorForPreset(presetNode);
            if (!selector) {
                const presetRect = getNodeRect(presetNode);
                const size = defaultNodeSize('style_selector');
                const world = {
                    x: Math.round(presetRect.x - size.w - 90),
                    y: Math.round(presetRect.y)
                };
                selector = addStyleSelectorNode(world, {
                    targetPresetId: presetNode.id,
                    history: opts.history,
                    render: false,
                    toast: false,
                    select: false,
                    avoidOverlap: opts.avoidOverlap
                });
            } else {
                linkStyleSelectorToPreset(selector, presetNode, { silent: true });
            }
            if (opts.select !== false && selector) selectAuxNode(selector.id, true);
            if (opts.render !== false) mutate({ inspector: true });
            if (opts.toast !== false) {
                showToast(selector
                    ? t('Style Selector linked to Style Transfer+.', 'Style Selector 已连接到 Style Transfer+。')
                    : t('Style Selector could not be created.', '无法创建 Style Selector。'));
            }
            return selector;
        }

        return { addWildcardsHelperNode, addMediaBrowserNode, addNoteNode, addTranslationNode, addTagCartNode,
            addClassicNode, addPresetNode, addStyleSelectorNode,
            ensureStyleSelectorForPreset,
            addWd14Node, addVlmNode, addMaskNode, addTextNode, addTextMergeNode, addManualOutputNode };
    }

    window.SimpAICanvasWorkbenchAuxNodeCreation = Object.assign(
        {}, window.SimpAICanvasWorkbenchAuxNodeCreation || {}, { createCanvasAuxNodeCreationController }
    );
})();
