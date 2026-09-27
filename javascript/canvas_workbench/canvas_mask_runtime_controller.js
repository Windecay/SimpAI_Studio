(function () {
    'use strict';

    function createCanvasMaskRuntimeController(context) {
        const scope = context?.maskRuntimeSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const stateSource = scope.stateSource || {};
        const assetSource = scope.assetSource || {};
        const serializationSource = scope.serializationSource || {};
        const requestSource = scope.requestSource || {};
        const selectionSource = scope.selectionSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const languageSource = scope.languageSource || {};
        const localizeSource = scope.localizeSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(runtimeSource, 'showToast', undefined, message);
        const mutate = () => call(runtimeSource, 'mutate', undefined);

        async function runMaskNode(node) {
            if (!node || node.type !== 'mask') return { ok: false, error: 'Advanced Masking node is unavailable' };
            if (call(nodeSource, 'isNodeIgnored', false, node)) {
                showToast(t('This Advanced Masking node is marked as skipped.', '这个高级遮罩节点已标记为跳过。'));
                return { ok: false, error: 'mask node is skipped' };
            }
            const project = call(projectSource, 'getProject', {}) || {};
            const edge = (project.edges || []).find(item => item.type === 'image' && item.to === node.id && item.slot === 'source');
            const source = call(nodeSource, 'getNode', null, node.input_node_id) || call(nodeSource, 'getNode', null, edge?.from);
            if (!source || !['image', 'result'].includes(source.type)) {
                showToast(t('Connect a source image/result node first.', '请先连接源图像 / 结果节点。'));
                return { ok: false, error: 'Connect a source image/result node first.' };
            }
            const asset = source.type === 'result'
                ? call(nodeSource, 'getSelectedResultAsset', null, source)
                : source.asset;
            if (!asset) {
                showToast(t('The connected source has no image asset.', '已连接来源没有图像资源。'));
                return { ok: false, error: 'The connected source has no image asset.' };
            }
            call(runtimeSource, 'pushHistory', undefined, 'Generate advanced mask');
            Object.assign(node, call(stateSource, 'buildMaskStatePatch', {}, node, {
                inputNodeId: source.id,
                status: call(stateSource, 'buildMaskStatus', {}, 'running', t('Generating mask...', '正在生成遮罩...'))
            }));
            mutate();
            const response = await call(requestSource, 'sendCanvasGenerateMaskRequest', null, {
                project_id: project.id || call(projectSource, 'getProjectId', ''),
                node_id: node.id,
                asset_source: call(serializationSource, 'serializeAssetSourceForRun', null, source),
                params: call(serializationSource, 'cloneRunValue', {}, node.params || {}, {})
            });
            const current = call(nodeSource, 'getNode', null, node.id);
            if (!current) return response || { ok: false, error: 'mask node was removed' };
            if (response?.ok) {
                const mask = response.mask || {};
                const assetRef = response.asset_ref || {};
                const generatedAsset = call(assetSource, 'buildGeneratedMaskAsset', {}, {
                    assetRef: response.mask || response.asset_ref || {},
                    kind: 'generated_mask',
                    mime: mask.mime || assetRef.mime || 'image/png',
                    width: mask.width || assetRef.width || null,
                    height: mask.height || assetRef.height || null,
                    path: mask.path || assetRef.path || '',
                    previewUrl: mask.preview_url || assetRef.preview_url || ''
                });
                Object.assign(current, call(stateSource, 'buildMaskStatePatch', {}, current, {
                    asset: generatedAsset,
                    sourcePatch: {
                        source_node_id: source.id,
                        mask_model: current.params?.mask_model || ''
                    },
                    status: call(stateSource, 'buildMaskStatus', {}, 'finished', t('Mask generated.', '遮罩已生成。'))
                }));
                call(selectionSource, 'selectMaskNode', undefined, current.id);
                mutate();
                showToast(t('Mask generated', '遮罩已生成'));
            } else {
                Object.assign(current, call(stateSource, 'buildMaskStatePatch', {}, current, {
                    status: call(stateSource, 'buildMaskStatus', {}, 'failed', response?.details || response?.error || t('Mask generation failed.', '遮罩生成失败。'))
                }));
                mutate();
                const message = call(localizeSource, 'localizeMaskStatus', current.status.message, current.status.message);
                showToast(t('Mask failed', '遮罩失败') + '：' + message);
            }
            return response;
        }

        return { runMaskNode };
    }

    window.SimpAICanvasWorkbenchMaskRuntime = Object.assign(
        {}, window.SimpAICanvasWorkbenchMaskRuntime || {}, { createCanvasMaskRuntimeController }
    );
})();
