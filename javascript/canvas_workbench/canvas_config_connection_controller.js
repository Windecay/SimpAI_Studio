(function () {
    'use strict';

    function createCanvasConfigConnectionController(context) {
        const scope = context?.configConnectionSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const configSource = scope.configSource || {};
        const classicSource = scope.classicSource || {};
        const sceneSource = scope.sceneSource || {};
        const edgeSource = scope.edgeSource || {};
        const patchSource = scope.patchSource || {};
        const catalogSource = scope.catalogSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const timeSource = scope.timeSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const parseDetectionSlot = slot => call(configSource, 'parseDetectionSlot', -1, slot);
        const getPresetConfigSource = (node, kind) => call(configSource, 'getPresetConfigSource', {}, node, kind);
        const buildInitialConfigValues = (...args) => call(configSource, 'buildInitialConfigValues', {}, ...args);
        const buildConfigStatePatch = (...args) => call(patchSource, 'buildConfigStatePatch', {}, ...args);
        const buildPresetConfigPatch = (...args) => call(patchSource, 'buildPresetConfigPatch', {}, ...args);
        const refreshModelConfigCatalog = (...args) => call(catalogSource, 'refreshModelConfigCatalog', undefined, ...args);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(uiSource, 'showToast', undefined, message);

        function writeConfigConnection(from, to, kind, targetRegionIndex) {
            call(edgeSource, 'filterProjectEdges', undefined,
                edge => !(edge.type === 'config' && edge.to === to.id && edge.slot === kind));
            call(edgeSource, 'appendProjectEdge', undefined,
                call(edgeSource, 'buildCanvasEdge', null, 'config', { from: from.id, to: to.id, slot: kind }));
            Object.assign(from, buildConfigStatePatch(from, Object.assign(
                { targetPresetId: to.id },
                targetRegionIndex !== undefined ? { targetRegionIndex } : {}
            )));
            applyConfigNodeToPreset(from);
        }

        function connectPendingConfigSource(from, to) {
            if (!from || !to || from.type !== 'config' || !['preset', 'classic'].includes(to.type)
                || (!call(configSource, 'isPresetConfigKind', false, from.config_kind)
                    && !(from.config_kind === 'detection' && to.type === 'classic'))) return '';
            const isDetection = from.config_kind === 'detection';
            const kind = isDetection
                ? call(configSource, 'detectionSlotForRegion', '', Number(from.target_region_index || 0))
                : from.config_kind;
            writeConfigConnection(from, to, kind, isDetection ? Math.max(0, parseDetectionSlot(kind)) : undefined);
            if (from.config_kind === 'models') refreshModelConfigCatalog(from, to);
            return t('and connected {kind} config automatically', '并已自动连接 {kind} config').replace('{kind}', kind);
        }

        function createConfigEdge(fromId, toId, kind, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            const detectionIndex = parseDetectionSlot(kind);
            const isDetection = detectionIndex >= 0;
            if (!from || !to || from.type !== 'config' || !['preset', 'classic'].includes(to.type)
                || (!call(configSource, 'isPresetConfigKind', false, kind) && !isDetection)) {
                showToast(t('Config nodes can only connect to preset/classic config inputs.', 'Config 节点只能连接到 preset/classic 的配置输入'));
                return;
            }
            if ((!isDetection && from.config_kind !== kind) || (isDetection && from.config_kind !== 'detection')) {
                showToast(t('Config type does not match the input port.', 'Config 类型和输入端口不一致'));
                return;
            }
            if (isDetection && to.type !== 'classic') {
                showToast(t('Detection Config can only connect to Classic Enhance Region.', 'Detection Config 只能连接到 Classic Enhance Region'));
                return;
            }
            if (call(nodeSource, 'isNodeLocked', false, from) || call(nodeSource, 'isNodeLocked', false, to)) {
                showToast(t('Locked nodes cannot change connections', '锁定的节点不能修改连接'));
                return;
            }
            if (!options || !options.silent) call(historySource, 'pushHistory', undefined, 'Connect config edge');
            refreshConfigNodeForPreset(from, to, kind);
            writeConfigConnection(from, to, kind, isDetection ? detectionIndex : undefined);
            call(selectionSource, 'selectConnectionNode', undefined, fromId);
            if (from.config_kind === 'models') refreshModelConfigCatalog(from, to);
            if (options && options.silent) return;
            call(renderSource, 'mutate', undefined);
            showToast(t('{kind} config connected.', '{kind} config 已连接').replace('{kind}', kind));
        }

        function syncResolutionConfigForPresetInputs(presetNode) {
            if (!presetNode || presetNode.type !== 'preset') return;
            const edge = (getProject().edges || []).find(item => item.type === 'config'
                && item.to === presetNode.id && item.slot === 'resolution');
            const configNode = edge ? getNode(edge.from) : null;
            if (!configNode || configNode.config_kind !== 'resolution') return;
            const current = configNode.config?.values || {};
            if (current.manual) return;
            const sourceConfig = getPresetConfigSource(presetNode, 'resolution');
            sourceConfig.overrides = Object.assign({}, sourceConfig.overrides || {}, current);
            Object.assign(configNode, buildConfigStatePatch(configNode, {
                values: buildInitialConfigValues('resolution', sourceConfig, presetNode),
                touchUpdatedAt: true
            }));
            applyConfigNodeToPreset(configNode);
        }

        function refreshConfigNodeForPreset(configNode, presetNode, kind) {
            const detectionIndex = parseDetectionSlot(kind);
            const isDetection = detectionIndex >= 0;
            const sourceConfig = isDetection
                ? {
                    defaults: call(classicSource, 'getClassicEnhanceRegionValues', {}, presetNode, detectionIndex),
                    overrides: configNode.config?.values || {}
                }
                : getPresetConfigSource(presetNode, kind);
            const configPatch = kind === 'models' ? { catalog: null } : {};
            Object.assign(configNode, buildConfigStatePatch(configNode, Object.assign({
                defaults: sourceConfig.defaults || {},
                values: buildInitialConfigValues(isDetection ? 'detection' : kind, sourceConfig, presetNode, detectionIndex),
                targetPresetId: presetNode.id,
                configPatch,
                touchUpdatedAt: true
            }, isDetection ? { targetRegionIndex: detectionIndex } : {})));
            if (kind === 'models') refreshModelConfigCatalog(configNode, presetNode);
        }

        function applyConfigNodeToPreset(configNode) {
            const edge = (getProject().edges || []).find(item => item.type === 'config' && item.from === configNode.id);
            const preset = edge ? getNode(edge.to) : getNode(configNode.target_preset_id);
            if (!preset || !['preset', 'classic'].includes(preset.type)) return;
            if (configNode.config_kind === 'detection') {
                const index = parseDetectionSlot(edge?.slot) >= 0
                    ? parseDetectionSlot(edge.slot)
                    : Number(configNode.target_region_index || 0);
                call(classicSource, 'applyClassicEnhanceRegionValues', undefined,
                    preset, index, configNode.config?.values || {}, configNode.id);
                return;
            }
            const configKey = call(configSource, 'configKeyForKind', '', configNode.config_kind);
            const defaults = configNode.config?.defaults && typeof configNode.config.defaults === 'object'
                ? Object.assign({}, configNode.config.defaults) : {};
            const overrides = configNode.config?.values && typeof configNode.config.values === 'object'
                ? Object.assign({}, configNode.config.values) : {};
            if (configNode.config_kind === 'advanced') {
                const stepProps = call(sceneSource, 'getSceneGenerationConfigPropsForConfigNode', {},
                    configNode, 'overwrite_step') || {};
                if (stepProps.interactive === false) {
                    delete overrides.overwrite_step;
                    delete overrides.steps;
                    const fixedStep = stepProps.value ?? call(sceneSource, 'getSceneGenerationConfigDefaultForConfigNode',
                        undefined, configNode, 'overwrite_step');
                    if (fixedStep !== undefined) defaults.overwrite_step = fixedStep;
                }
            }
            Object.assign(preset, buildPresetConfigPatch(preset, {
                configKey,
                presetConfig: {
                    mode: 'external_override',
                    defaults,
                    overrides,
                    source_node_id: configNode.id,
                    updated_at: call(timeSource, 'nowIso', '')
                }
            }));
        }

        function getConfigTargetPreset(configNode) {
            if (!configNode || configNode.type !== 'config') return null;
            const edge = (getProject().edges || []).find(item => item.type === 'config' && item.from === configNode.id);
            return edge ? getNode(edge.to) : getNode(configNode.target_preset_id);
        }

        function getConfigTargetPresetNode(configNode) {
            const target = getConfigTargetPreset(configNode);
            return target && ['preset', 'classic'].includes(target.type) ? target : null;
        }

        return { createConfigEdge, syncResolutionConfigForPresetInputs, refreshConfigNodeForPreset, applyConfigNodeToPreset,
            getConfigTargetPreset, getConfigTargetPresetNode, connectPendingConfigSource };
    }

    window.SimpAICanvasWorkbenchConfigConnection = Object.assign(
        {}, window.SimpAICanvasWorkbenchConfigConnection || {}, { createCanvasConfigConnectionController }
    );
})();
