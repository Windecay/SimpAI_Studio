(function () {
    'use strict';

    function createCanvasConfigCreationController(context) {
        const scope = context?.configCreationSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const configSource = scope.configSource || {};
        const classicSource = scope.classicSource || {};
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
        const buildConfigNode = options => call(factorySource, 'buildConfigNode', null, options);
        const buildInitialConfigValues = (...args) => call(configSource, 'buildInitialConfigValues', {}, ...args);
        const placeNodeAvoidingOverlap = (...args) => call(layoutSource, 'placeNodeAvoidingOverlap', undefined, ...args);
        const createConfigEdge = (...args) => call(connectionSource, 'createConfigEdge', undefined, ...args);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(uiSource, 'showToast', undefined, message);

        function ensureConfigNode(presetNode, kind) {
            if (!presetNode || !['preset', 'classic'].includes(presetNode.type)) return;
            const detectionIndex = call(configSource, 'parseDetectionSlot', -1, kind);
            if (detectionIndex < 0 && !call(configSource, 'isPresetConfigKind', false, kind)) return;
            if (detectionIndex >= 0 && presetNode.type !== 'classic') {
                showToast(t('Detection Config can only connect to Classic Enhance Region.', 'Detection Config 只能连接到 Classic Enhance Region'));
                return;
            }
            if (call(nodeSource, 'isNodeLocked', false, presetNode)) {
                showToast(t('Locked node cannot change config links', '锁定的节点不能修改配置连接'));
                return;
            }
            const project = call(projectSource, 'getProject', {}) || {};
            const existingEdge = (project.edges || []).find(edge => edge.type === 'config'
                && edge.to === presetNode.id && edge.slot === kind);
            const existingNode = existingEdge ? call(nodeSource, 'getNode', null, existingEdge.from) : null;
            if (existingNode) {
                call(selectionSource, 'selectConnectionNode', undefined, existingNode.id);
                call(renderSource, 'renderAll', undefined);
                return;
            }
            call(historySource, 'pushHistory', undefined, `Add ${kind} config node`);
            const sourceConfig = detectionIndex >= 0
                ? { defaults: call(classicSource, 'getClassicEnhanceRegionValues', {}, presetNode, detectionIndex), overrides: {} }
                : call(configSource, 'getPresetConfigSource', {}, presetNode, kind);
            const isDetection = detectionIndex >= 0;
            const nodeKind = isDetection ? 'detection' : kind;
            const configOffsets = { models: 0, styles: 170, resolution: 340, advanced: 510 };
            const configHeights = { models: 560, styles: 520, resolution: 560, advanced: 285 };
            const configWidths = { resolution: 380 };
            const nodeWidth = isDetection ? 320 : (configWidths[kind] || 320);
            const baseY = (presetNode.y || 0) + (isDetection ? 240 + detectionIndex * 52 : (configOffsets[kind] || 0));
            const node = buildConfigNode({
                configKind: nodeKind,
                x: (presetNode.x || 0) - nodeWidth - 40,
                y: baseY,
                w: nodeWidth,
                h: isDetection ? 520 : (configHeights[kind] || 360),
                title: isDetection
                    ? call(configSource, 'getDetectionConfigLabel', '', detectionIndex)
                    : call(configSource, 'configTitleForKind', kind, kind),
                targetPresetId: presetNode.id,
                targetRegionIndex: isDetection ? detectionIndex : null,
                defaults: sourceConfig.defaults || {},
                values: buildInitialConfigValues(nodeKind, sourceConfig, presetNode, detectionIndex)
            });
            if (!node) return;
            placeNodeAvoidingOverlap(node, { x: (presetNode.x || 0) - 360, y: baseY });
            Object.assign(project, call(projectSource, 'buildProjectNodeAppendPatch', {}, project, node));
            createConfigEdge(node.id, presetNode.id, kind, { silent: true });
            call(selectionSource, 'selectConnectionNode', undefined, node.id);
            call(renderSource, 'mutate', undefined);
            showToast(t('{title} added before preset.', '{title} 已添加到 preset 前方').replace('{title}', node.title));
        }

        return { ensureConfigNode };
    }

    window.SimpAICanvasWorkbenchConfigCreation = Object.assign(
        {}, window.SimpAICanvasWorkbenchConfigCreation || {}, { createCanvasConfigCreationController }
    );
})();
