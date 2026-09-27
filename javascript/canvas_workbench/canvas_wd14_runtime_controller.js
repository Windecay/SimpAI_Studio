(function () {
    'use strict';

    function createCanvasWd14RuntimeController(context) {
        const scope = context?.wd14RuntimeSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const stateSource = scope.stateSource || {};
        const serializationSource = scope.serializationSource || {};
        const requestSource = scope.requestSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const languageSource = scope.languageSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(runtimeSource, 'showToast', undefined, message);
        const mutate = () => call(runtimeSource, 'mutate', undefined);

        async function runWd14Node(node) {
            if (!node || node.type !== 'wd14') return { ok: false, error: 'WD14 node is unavailable' };
            if (call(nodeSource, 'isNodeIgnored', false, node)) {
                showToast(t('This WD14 node is marked as skipped.', '这个 WD14 节点已标记为跳过。'));
                return { ok: false, error: 'WD14 node is skipped' };
            }
            const project = call(projectSource, 'getProject', {}) || {};
            const edge = (project.edges || []).find(item => item.type === 'image' && item.to === node.id && item.slot === 'image');
            const source = call(nodeSource, 'getNode', null, node.input_node_id) || call(nodeSource, 'getNode', null, edge?.from);
            if (!source || !['image', 'result'].includes(source.type)) {
                const error = 'Connect an image/result node to WD14 first.';
                showToast(t(error, '请先将图像 / 结果节点连接到 WD14。'));
                return { ok: false, error };
            }
            const asset = source.type === 'result'
                ? call(nodeSource, 'getSelectedResultAsset', null, source)
                : source.asset;
            if (!asset) {
                const error = 'The connected node has no image asset.';
                showToast(t(error, '已连接节点没有图像资源。'));
                return { ok: false, error };
            }
            call(runtimeSource, 'pushHistory', undefined, 'Run WD14 node');
            Object.assign(node, call(stateSource, 'buildWd14StatePatch', {}, node, {
                inputNodeId: source.id,
                status: call(stateSource, 'buildWd14Status', {}, 'running', t('Running extras.wd14tagger...', '正在运行 extras.wd14tagger...'))
            }));
            mutate();
            const response = await call(requestSource, 'sendCanvasWd14TagRequest', null, {
                project_id: project.id || call(projectSource, 'getProjectId', ''),
                node_id: node.id,
                asset_source: call(serializationSource, 'serializeAssetSourceForRun', null, source),
                params: call(serializationSource, 'cloneRunValue', {}, node.params || {}, {})
            });
            const current = call(nodeSource, 'getNode', null, node.id);
            if (!current) return;
            if (response?.ok) {
                Object.assign(current, call(stateSource, 'buildWd14StatePatch', {}, current, {
                    textPatch: {
                        value: response.text || '',
                        updated_at: call(runtimeSource, 'nowIso', '')
                    },
                    status: call(stateSource, 'buildWd14Status', {}, 'finished', response.text
                        ? t('Tags generated.', '标签已生成。')
                        : t('WD14 finished with empty tags.', 'WD14 已完成，但没有生成标签。')),
                    lastResponse: response
                }));
                showToast(t('WD14 tags generated', 'WD14 标签已生成'));
                mutate();
                return { ok: true, text: current.text.value };
            }
            Object.assign(current, call(stateSource, 'buildWd14StatePatch', {}, current, {
                status: call(stateSource, 'buildWd14Status', {}, 'failed', response?.details || response?.error || t('WD14 failed', 'WD14 运行失败')),
                lastResponse: response || {}
            }));
            showToast(t('WD14 failed: {error}', 'WD14 运行失败：{error}').replace('{error}', response?.error || 'unknown error'));
            mutate();
            return { ok: false, error: current.status.message };
        }

        return { runWd14Node };
    }

    window.SimpAICanvasWorkbenchWd14Runtime = Object.assign(
        {}, window.SimpAICanvasWorkbenchWd14Runtime || {}, { createCanvasWd14RuntimeController }
    );
})();
