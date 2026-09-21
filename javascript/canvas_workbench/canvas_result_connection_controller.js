(function () {
    'use strict';

    function createCanvasResultConnectionController(context) {
        const scope = context?.resultConnectionSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const edgeSource = scope.edgeSource || {};
        const patchSource = scope.patchSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const isQwenTtsNode = node => !!call(nodeSource, 'isQwenTtsNode', false, node);
        const showToast = message => call(uiSource, 'showToast', undefined, message);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const buildCanvasEdge = (fromId, toId) => call(edgeSource, 'buildCanvasEdge', null, 'generate', { from: fromId, to: toId });

        function writeResultConnection(fromId, toId, from, to, automatic) {
            call(edgeSource, 'filterProjectEdges', undefined, edge => !(edge.type === 'generate' && edge.to === toId));
            call(edgeSource, 'appendProjectEdge', undefined, buildCanvasEdge(fromId, toId));
            const producer = isQwenTtsNode(from)
                ? { qwen_tts_node_id: fromId, preset_node_id: null, timeline_node_id: null }
                : (from.type === 'timeline'
                    ? { timeline_node_id: fromId, preset_node_id: null, qwen_tts_node_id: null }
                    : { preset_node_id: fromId, timeline_node_id: null, qwen_tts_node_id: null });
            if (automatic) Object.assign(producer, { run_id: null, task_id: null });
            Object.assign(to, call(patchSource, 'buildResultProducerPatch', {}, to, producer));
            let message;
            if (automatic) {
                message = isQwenTtsNode(from)
                    ? (to.asset
                        ? t('Qwen TTS output connected automatically.', '已自动连接 Qwen TTS 输出。')
                        : t('Qwen TTS output accepted automatically.', '已自动承接 Qwen TTS 输出。'))
                    : from.type === 'timeline'
                        ? (to.asset
                            ? t('Timeline output connected automatically.', '已自动连接 Timeline 输出。')
                            : t('Timeline output accepted automatically.', '已自动承接 Timeline 输出。'))
                        : (to.asset
                            ? t('Preset output connected automatically.', '已自动连接 preset 输出。')
                            : t('Preset output accepted automatically.', '已自动承接 preset 输出。'));
            } else {
                message = isQwenTtsNode(from)
                    ? (to.asset
                        ? t('Qwen TTS connected; it can continue as downstream input.', '已连接 Qwen TTS，可作为下游输入继续使用。')
                        : t('Qwen TTS output accepted; this node can show audio generation progress and results.', '已承接 Qwen TTS 输出，此节点可展示音频生成进度和结果。'))
                    : from.type === 'timeline'
                        ? (to.asset
                            ? t('Timeline connected; it can continue as downstream input.', '已连接 Timeline，可作为下游输入继续使用。')
                            : t('Timeline output accepted; click To Result on Timeline to generate preview and payload.', '已承接 Timeline 输出，点击 Timeline 的 To Result 生成预览和 payload。'))
                        : (to.asset
                            ? t('Preset connected; it can continue as downstream input.', '已连接 preset，可作为下游输入继续使用。')
                            : t('Preset output accepted; this node can show progress and results during runs.', '已承接 preset 输出，运行时可复用此节点展示进度和结果。'));
            }
            Object.assign(to, call(patchSource, 'buildResultStatusPatch', {}, to, {
                status: call(patchSource, 'mergeCanvasRunStatus', {}, to.status, to.asset ? 'ready' : 'reserved', message)
            }));
        }

        function createGenerateEdge(fromId, toId, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            if (!from || !to || (!['preset', 'classic', 'timeline'].includes(from.type) && !isQwenTtsNode(from)) || to.type !== 'result') {
                showToast(t('Outputs can only connect to result/manual output nodes.', '输出只能连接到结果/手动输出节点'));
                return;
            }
            if (call(nodeSource, 'isNodeLocked', false, from) || call(nodeSource, 'isNodeLocked', false, to)) {
                showToast(t('Locked nodes cannot change connections', '锁定节点不能修改连接'));
                return;
            }
            if (!options || options.history !== false) call(historySource, 'pushHistory', undefined, 'Connect result edge');
            writeResultConnection(fromId, toId, from, to, false);
            call(selectionSource, 'selectConnectionNode', undefined, toId);
            if (options && options.silent) {
                call(persistenceSource, 'scheduleSave', undefined);
                return;
            }
            call(renderSource, 'mutate', undefined);
            showToast(t('Connected to output receiver node.', '已连接到输出承接节点'));
        }

        function connectPendingResultSource(from, node) {
            if (!from || !node || node.type !== 'result'
                || (!['preset', 'classic', 'timeline'].includes(from.type) && !isQwenTtsNode(from))) return '';
            writeResultConnection(from.id, node.id, from, node, true);
            return isQwenTtsNode(from)
                ? t('and connected Qwen TTS output automatically', '并已自动连接 Qwen TTS 输出')
                : from.type === 'timeline'
                    ? t('and connected Timeline output automatically', '并已自动连接 Timeline 输出')
                    : t('and connected preset output automatically', '并已自动连接 preset 输出');
        }

        function ensureGenerateEdge(fromId, toId) {
            const project = getProject();
            const edges = Array.isArray(project.edges) ? project.edges : [];
            const existing = edges.find(edge => edge.type === 'generate' && edge.from === fromId && edge.to === toId);
            if (existing) return existing;
            const edge = buildCanvasEdge(fromId, toId);
            call(edgeSource, 'appendProjectEdge', undefined, edge);
            return edge;
        }

        return { createGenerateEdge, ensureGenerateEdge, connectPendingResultSource };
    }

    window.SimpAICanvasWorkbenchResultConnection = Object.assign(
        {}, window.SimpAICanvasWorkbenchResultConnection || {}, { createCanvasResultConnectionController }
    );
})();
