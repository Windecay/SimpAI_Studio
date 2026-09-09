(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const ASSETS = window.SimpAICanvasWorkbenchAssetNodes || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
    const t = UTILS.t || ((en, cn) => cn || en);
    const uid = UTILS.uid || ((prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`);

    function editor() {
        return window.SimpAILivePortraitExpressionEditor || {};
    }

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createLivePortraitExpressionNodeContext(source) {
        const context = source || {};
        return {
            getProject: delegate(context, 'getProject'),
            getProjectId: delegate(context, 'getProjectId'),
            assetDisplaySrc: delegate(context, 'assetDisplaySrc'),
            defaultNodeSize: delegate(context, 'defaultNodeSize'),
            detectWorkbenchTheme: delegate(context, 'detectWorkbenchTheme'),
            ensureWorkbenchFormFieldNames: delegate(context, 'ensureWorkbenchFormFieldNames'),
            getNode: delegate(context, 'getNode'),
            getSelectedResultAsset: delegate(context, 'getSelectedResultAsset'),
            isLivePortraitExpressionImageSource: delegate(context, 'isLivePortraitExpressionImageSource'),
            isNodeIgnored: delegate(context, 'isNodeIgnored'),
            isNodeLocked: delegate(context, 'isNodeLocked'),
            mediaAspectStyle: delegate(context, 'mediaAspectStyle'),
            mutate: delegate(context, 'mutate'),
            notConnectedText: delegate(context, 'notConnectedText'),
            placeNodeAvoidingOverlap: delegate(context, 'placeNodeAvoidingOverlap'),
            portHintText: delegate(context, 'portHintText'),
            pushHistory: delegate(context, 'pushHistory'),
            readAssetInfo: delegate(context, 'readAssetInfo'),
            renderNodeStateBadges: delegate(context, 'renderNodeStateBadges'),
            scheduleSave: delegate(context, 'scheduleSave'),
            serializeAssetSourceForRun: delegate(context, 'serializeAssetSourceForRun'),
            setSelectedNode: delegate(context, 'setSelectedNode'),
            showToast: delegate(context, 'showToast')
        };
    }

    function getProject(context) {
        const project = typeof context?.getProject === 'function' ? context.getProject() : null;
        return project && typeof project === 'object' ? project : { id: 'default', nodes: [], edges: [] };
    }

    function getNode(id, context) {
        if (!id) return null;
        if (typeof context?.getNode === 'function') return context.getNode(id);
        return (getProject(context).nodes || []).find(node => node.id === id) || null;
    }

    function selectedResultAsset(node, context) {
        if (node?.type !== 'result') return node?.asset || null;
        return call(context, 'getSelectedResultAsset', node?.asset || null, node);
    }

    function isSource(node, context) {
        if (!node || node.type !== 'liveportrait_expression') return false;
        const asset = node.asset || livePortraitState(node).output_asset || {};
        const mime = String(asset.mime || '').toLowerCase();
        const hasAsset = !!(asset.path || asset.preview_url || asset.data_url || asset.thumb || asset.asset_id || asset.asset_relative_path || asset.relative_path);
        return hasAsset && (!mime || mime.startsWith('image/'));
    }

    function isImageSource(node, context) {
        if (!node) return false;
        if (typeof context?.isLivePortraitExpressionImageSource === 'function') return context.isLivePortraitExpressionImageSource(node);
        if (node.type === 'image') return !!node.asset;
        if (node.type === 'liveportrait_expression') return isSource(node, context);
        if (node.type === 'pose_studio') {
            const asset = node.asset || node.pose_studio?.output_asset || {};
            const mime = String(asset.mime || '').toLowerCase();
            return !!(asset.path || asset.preview_url || asset.data_url || asset.thumb || asset.asset_id || asset.asset_relative_path || asset.relative_path) && (!mime || mime.startsWith('image/'));
        }
        if (node.type === 'gaussian_studio') {
            const asset = node.asset || node.gaussian_studio?.render_asset || node.gaussian_studio?.output_asset || {};
            const mime = String(asset.mime || '').toLowerCase();
            return !!(asset.path || asset.preview_url || asset.data_url || asset.thumb || asset.asset_id || asset.asset_relative_path || asset.relative_path) && (!mime || mime.startsWith('image/'));
        }
        if (node.type === 'result') {
            const asset = selectedResultAsset(node, context);
            return !!asset && String(asset.mime || '').toLowerCase().startsWith('image/');
        }
        return false;
    }

    function edgeForSlot(node, slot, context) {
        const edges = Array.isArray(getProject(context).edges) ? getProject(context).edges : [];
        return edges.find(item => item.type === 'image' && item.to === node?.id && item.slot === slot) || null;
    }

    function stateNodeId(node, slot) {
        const state = livePortraitState(node);
        return slot === 'reference'
            ? (state.reference_node_id || node.reference_node_id || '')
            : (state.source_node_id || node.input_node_id || '');
    }

    function inputSourceForSlot(node, slot, context) {
        const edge = edgeForSlot(node, slot, context);
        const source = getNode(stateNodeId(node, slot), context) || getNode(edge?.from, context);
        return isImageSource(source, context) ? source : null;
    }

    function sourceAssetForSlot(node, slot, context) {
        const source = inputSourceForSlot(node, slot, context);
        return source ? selectedResultAsset(source, context) : null;
    }

    function assetDisplaySrc(asset, context) {
        if (typeof context?.assetDisplaySrc === 'function') return context.assetDisplaySrc(asset || {});
        if (typeof ASSETS.assetDisplaySrc === 'function') return ASSETS.assetDisplaySrc(asset || {});
        return asset?.preview_url || asset?.data_url || asset?.thumb || '';
    }

    function readAssetInfo(asset, context) {
        if (typeof context?.readAssetInfo === 'function') return context.readAssetInfo(asset || {});
        if (typeof ASSETS.readAssetInfo === 'function') return ASSETS.readAssetInfo(asset || {});
        const bits = [];
        if (asset?.width && asset?.height) bits.push(`${asset.width} x ${asset.height}`);
        if (asset?.mime) bits.push(asset.mime);
        return bits;
    }

    function serializeAssetSourceForRun(node, context) {
        if (!node) return null;
        if (typeof context?.serializeAssetSourceForRun === 'function') return context.serializeAssetSourceForRun(node);
        if (typeof ASSETS.serializeAssetSourceForRun === 'function') {
            return ASSETS.serializeAssetSourceForRun(node, {
                getSelectedResultAsset: item => selectedResultAsset(item, context)
            });
        }
        return null;
    }

    function mediaAspectStyle(asset, context) {
        if (typeof context?.mediaAspectStyle === 'function') return context.mediaAspectStyle(asset || {});
        if (typeof ASSETS.mediaAspectStyle === 'function') return ASSETS.mediaAspectStyle(asset || {});
        const width = Number(asset?.width || 0);
        const height = Number(asset?.height || 0);
        if (!width || !height) return '';
        const aspect = clamp(width / height, 0.25, 4);
        return ` style="--sai-media-aspect:${aspect.toFixed(5)}" data-aspect="true"`;
    }

    function notConnectedText(context) {
        return call(context, 'notConnectedText', t('Not connected', '未连接'));
    }

    function portHintText(context) {
        return call(context, 'portHintText', t('Double-click', '双击'));
    }

    function livePortraitState(node) {
        node.liveportrait_expression = Object.assign({
            source_node_id: '',
            reference_node_id: '',
            source_asset: null,
            reference_asset: null,
            output_asset: null,
            params: {},
            expression_state: '',
            updated_at: ''
        }, node.liveportrait_expression || {});
        return node.liveportrait_expression;
    }

    function renderNodeStateBadges(node, context) {
        return call(context, 'renderNodeStateBadges', '', node);
    }

    function sourceLabel(source, storedAsset, context) {
        if (source) return source.title || source.id;
        const hasStored = !!(storedAsset?.path || storedAsset?.preview_url || storedAsset?.data_url || storedAsset?.thumb);
        return hasStored ? t('Loaded image', '已载入图像') : notConnectedText(context);
    }

    function renderInputRow(node, slot, source, storedAsset, context) {
        const isReference = slot === 'reference';
        const attr = isReference ? 'data-liveportrait-expression-reference-in' : 'data-liveportrait-expression-source-in';
        const icon = isReference ? 'fa-face-smile' : 'fa-image';
        const label = isReference ? t('Reference', '参考表情') : t('Source', '源图');
        const title = isReference
            ? t('Optional reference expression image', '可选参考表情图')
            : t('Required source face image', '必需源人脸图');
        return `<div class="sai-text-input-row sai-liveportrait-expression-input-row" title="${escapeHtml(title)}">
  <button type="button" class="sai-node-handle sai-node-handle-in" ${attr} title="${escapeHtml(title)}"></button>
  <i class="fa-solid ${icon}"></i><span>${escapeHtml(label)}</span><b>${escapeHtml(sourceLabel(source, storedAsset, context))}</b><small>${escapeHtml(portHintText(context))}</small>
</div>`;
    }

    function renderNodeHtml(node, context) {
        const state = livePortraitState(node);
        const source = inputSourceForSlot(node, 'source', context);
        const reference = inputSourceForSlot(node, 'reference', context);
        const asset = node.asset || state.output_asset || {};
        const src = assetDisplaySrc(asset, context);
        const info = readAssetInfo(asset || {}, context);
        const status = node.status?.message || '';
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(t('Live Exp', '表情'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || 'LivePortrait Exp')}</span>
  ${renderNodeStateBadges(node, context)}
  <button type="button" data-node-action="edit-liveportrait-expression" title="${escapeHtml(t('Open LivePortrait Exp', '打开 LivePortrait Exp'))}"><i class="fa-solid fa-face-smile"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
${renderInputRow(node, 'source', source, state.source_asset, context)}
${renderInputRow(node, 'reference', reference, state.reference_asset, context)}
<div class="sai-node-media sai-liveportrait-expression-media"${mediaAspectStyle(asset, context)}>${src ? `<img src="${escapeHtml(src)}" alt="" draggable="false">` : `<div class="sai-node-empty">${escapeHtml(t('No expression image', '无表情输出'))}</div>`}</div>
${info.length ? `<div class="sai-node-info">${info.map(bit => `<span>${escapeHtml(bit)}</span>`).join('')}</div>` : ''}
${status ? `<div class="sai-node-foot">${escapeHtml(status)}</div>` : ''}
<button type="button" class="sai-node-primary" data-node-action="edit-liveportrait-expression"><i class="fa-solid fa-face-smile"></i><span>${escapeHtml(t('Edit Expression', '编辑表情'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="image" title="${escapeHtml(t('Expression image output', '表情图输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const state = livePortraitState(node);
        const source = inputSourceForSlot(node, 'source', context);
        const reference = inputSourceForSlot(node, 'reference', context);
        const info = readAssetInfo(node.asset || state.output_asset || {}, context);
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(node.title || 'LivePortrait Exp')}</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Source', '源图'))}</span><b>${escapeHtml(source?.title || source?.id || notConnectedText(context))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Reference', '参考表情'))}</span><b>${escapeHtml(reference?.title || reference?.id || t('Optional', '可选'))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Output', '输出'))}</span><b>${escapeHtml(info.join(' / ') || t('No expression image', '无表情输出'))}</b></div>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="edit-liveportrait-expression"><i class="fa-solid fa-face-smile"></i><span>${escapeHtml(t('Edit', '编辑'))}</span></button>
  <button type="button" data-inspector-action="view-media" ${node.asset ? '' : 'disabled'}><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtml(t('View', '查看'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
    }

    function createNode(world, options, context) {
        const project = getProject(context);
        const opts = options || {};
        const size = call(context, 'defaultNodeSize', { w: 420, h: 600 }, 'liveportrait_expression') || { w: 420, h: 600 };
        if (opts.history !== false) call(context, 'pushHistory', null, 'Add LivePortrait Exp node');
        const node = {
            id: opts.id || uid('liveportrait'),
            type: 'liveportrait_expression',
            x: world?.x || 0,
            y: world?.y || 0,
            w: opts.w || size.w,
            h: opts.h || size.h,
            title: opts.title || 'LivePortrait Exp',
            input_node_id: opts.input_node_id || opts.source_node_id || '',
            reference_node_id: opts.reference_node_id || '',
            asset: opts.asset || null,
            liveportrait_expression: Object.assign({
                source_node_id: opts.input_node_id || opts.source_node_id || '',
                reference_node_id: opts.reference_node_id || '',
                source_asset: opts.source_asset || null,
                reference_asset: opts.reference_asset || null,
                output_asset: opts.asset || null,
                params: opts.params || {},
                expression_state: opts.expression_state || '',
                updated_at: ''
            }, opts.liveportrait_expression || {}),
            source: { kind: 'liveportrait_expression', module: 'ui.services.liveportrait_expression' },
            status: {
                state: opts.asset ? 'finished' : 'idle',
                message: opts.asset ? t('Expression image ready.', '表情图已就绪。') : t('Connect a source image, then edit expression.', '连接源图后编辑表情。')
            }
        };
        call(context, 'placeNodeAvoidingOverlap', null, node, world || { x: node.x, y: node.y });
        if (Array.isArray(project.nodes)) project.nodes.push(node);
        call(context, 'setSelectedNode', null, node.id);
        if (opts.render !== false) call(context, 'mutate', null);
        if (opts.toast !== false) call(context, 'showToast', null, t('LivePortrait Exp node added', '已添加 LivePortrait Exp 节点'));
        return node;
    }

    function openEditor(node, context) {
        if (!node || node.type !== 'liveportrait_expression') return null;
        const runtimeEditor = editor();
        if (typeof runtimeEditor.open !== 'function') {
            call(context, 'showToast', null, t('LivePortrait Exp editor is not loaded.', 'LivePortrait Exp 编辑器尚未加载。'));
            return null;
        }
        const state = livePortraitState(node);
        const sourceSource = inputSourceForSlot(node, 'source', context);
        const referenceSource = inputSourceForSlot(node, 'reference', context);
        const sourceAsset = sourceAssetForSlot(node, 'source', context) || state.source_asset || null;
        const referenceAsset = sourceAssetForSlot(node, 'reference', context) || state.reference_asset || null;
        const sourceSrc = assetDisplaySrc(sourceAsset || {}, context);
        const referenceSrc = assetDisplaySrc(referenceAsset || {}, context);
        if (!sourceAsset && !sourceSrc) {
            call(context, 'showToast', null, t('Connect a source image first.', '请先连接源图。'));
        }
        return runtimeEditor.open({
            title: node.title || 'LivePortrait Exp',
            context: 'canvas',
            projectId: getProject(context).id || (typeof context?.getProjectId === 'function' ? context.getProjectId() : '') || 'default',
            node,
            nodeId: node.id,
            params: state.params || {},
            expressionState: state.expression_state || '',
            sourceSrc,
            sourceAsset,
            sourceAssetSource: sourceSource ? serializeAssetSourceForRun(sourceSource, context) : null,
            sourceSize: { width: Number(sourceAsset?.width || 0), height: Number(sourceAsset?.height || 0) },
            referenceSrc,
            referenceAsset,
            referenceAssetSource: referenceSource ? serializeAssetSourceForRun(referenceSource, context) : null,
            referenceSize: { width: Number(referenceAsset?.width || 0), height: Number(referenceAsset?.height || 0) },
            modalMount: typeof context?.canvasOverlayHost === 'function' ? context.canvasOverlayHost() : null,
            mountSelector: '#simpai-infinite-canvas-workbench',
            detectTheme: () => call(context, 'detectWorkbenchTheme', 'dark'),
            ensureFormNames: (scope, prefix) => call(context, 'ensureWorkbenchFormFieldNames', null, scope, prefix),
            onStateChange: (cache) => {
                const current = getNode(node.id, context) || node;
                const nextState = livePortraitState(current);
                nextState.params = cache?.params || nextState.params || {};
                nextState.expression_state = cache?.expression_state || nextState.expression_state || '';
                nextState.updated_at = cache?.updated_at || new Date().toISOString();
            },
            onConfirm: (response) => {
                call(context, 'pushHistory', null, 'Update LivePortrait Exp output');
                const current = getNode(node.id, context) || node;
                const nextState = livePortraitState(current);
                current.asset = response.asset_ref || response.expression_image || null;
                nextState.output_asset = current.asset;
                nextState.params = response.params || nextState.params || {};
                nextState.expression_state = response.expression_state || nextState.expression_state || '';
                nextState.source_asset = response.source_asset || sourceAsset || nextState.source_asset || null;
                nextState.reference_asset = response.reference_asset || referenceAsset || nextState.reference_asset || null;
                nextState.source_node_id = inputSourceForSlot(current, 'source', context)?.id || nextState.source_node_id || '';
                nextState.reference_node_id = inputSourceForSlot(current, 'reference', context)?.id || nextState.reference_node_id || '';
                current.input_node_id = nextState.source_node_id;
                current.reference_node_id = nextState.reference_node_id;
                nextState.updated_at = response.exported_at || new Date().toISOString();
                current.source = Object.assign({}, current.source || {}, {
                    kind: 'liveportrait_expression',
                    module: 'ui.services.liveportrait_expression',
                    source_node_id: nextState.source_node_id,
                    reference_node_id: nextState.reference_node_id
                });
                current.status = {
                    state: 'finished',
                    message: t('Expression image exported.', '表情图已导出。')
                };
                call(context, 'setSelectedNode', null, current.id);
                call(context, 'mutate', null);
            }
        });
    }

    window.SimpAICanvasWorkbenchLivePortraitExpressionNode = {
        createLivePortraitExpressionNodeContext,
        createNode,
        inputSourceForSlot,
        isImageSource,
        isSource,
        livePortraitState,
        openEditor,
        renderInspector,
        renderNodeHtml,
        sourceAssetForSlot
    };
})();
