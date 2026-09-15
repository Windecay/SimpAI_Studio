(function () {
    'use strict';

    const DEFAULT_UTILS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchUtils || {} : {};
    const DEFAULT_ASSETS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchAssetNodes || {} : {};
    const escapeHtmlFallback = (value) => String(value ?? '');
    const clampFallback = (value, min, max) => Math.max(min, Math.min(max, value));
    const translateFallback = (en, cn) => cn || en;
    const DEFAULT_GAUSSIAN_PRECISION = 'auto';
    const VALID_GAUSSIAN_PRECISIONS = new Set(['auto', 'bf16', 'fp16', 'fp32']);

    function editor(context) {
        return call(context, 'getEditor', {});
    }

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createGaussianStudioNodeContext(source) {
        const scope = source || {};
        const utilitySource = scope.utilitySource || {};
        const assetSource = scope.assetSource || {};
        const editorSource = scope.editorSource || {};
        const pick = (group, name) => delegate(group, name) || delegate(scope, name);
        return {
            escapeHtml: pick(utilitySource, 'escapeHtml'),
            clamp: pick(utilitySource, 'clamp'),
            t: pick(utilitySource, 't'),
            getProject: pick(scope, 'getProject'),
            getProjectId: pick(scope, 'getProjectId'),
            uid: pick(scope, 'uid'),
            getEditor: pick(editorSource, 'getEditor'),
            assetDisplaySrc: pick(assetSource, 'assetDisplaySrc'),
            defaultNodeSize: pick(scope, 'defaultNodeSize'),
            detectWorkbenchTheme: pick(scope, 'detectWorkbenchTheme'),
            ensureWorkbenchFormFieldNames: pick(scope, 'ensureWorkbenchFormFieldNames'),
            getNode: pick(scope, 'getNode'),
            getSelectedResultAsset: pick(scope, 'getSelectedResultAsset'),
            isNodeIgnored: pick(scope, 'isNodeIgnored'),
            isNodeLocked: pick(scope, 'isNodeLocked'),
            mediaAspectStyle: pick(assetSource, 'mediaAspectStyle'),
            mutate: pick(scope, 'mutate'),
            notConnectedText: pick(scope, 'notConnectedText'),
            placeNodeAvoidingOverlap: pick(scope, 'placeNodeAvoidingOverlap'),
            portHintText: pick(scope, 'portHintText'),
            pushHistory: pick(scope, 'pushHistory'),
            readAssetInfo: pick(assetSource, 'readAssetInfo'),
            renderNodeStateBadges: pick(scope, 'renderNodeStateBadges'),
            scheduleSave: pick(scope, 'scheduleSave'),
            serializeAssetSourceForRun: pick(assetSource, 'serializeAssetSourceForRun'),
            setSelectedNode: pick(scope, 'setSelectedNode'),
            showToast: pick(scope, 'showToast'),
            buildAssetReference: pick(scope, 'buildAssetReference'),
            buildProjectNodeAppendPatch: pick(scope, 'buildProjectNodeAppendPatch'),
            buildGaussianStudioStatePatch: pick(scope, 'buildGaussianStudioStatePatch'),
            buildGaussianCachePatch: pick(scope, 'buildGaussianCachePatch'),
            buildGaussianConfirmPatch: pick(scope, 'buildGaussianConfirmPatch')
        };
    }

    const DEFAULT_GAUSSIAN_STUDIO_CONTEXT = createGaussianStudioNodeContext({
        utilitySource: {
            escapeHtml: DEFAULT_UTILS.escapeHtml || escapeHtmlFallback,
            clamp: DEFAULT_UTILS.clamp || clampFallback,
            t: DEFAULT_UTILS.t || translateFallback
        },
        assetSource: DEFAULT_ASSETS
    });

    function contextOf(context) {
        return context || DEFAULT_GAUSSIAN_STUDIO_CONTEXT;
    }

    function escapeHtml(value, context) {
        return call(contextOf(context), 'escapeHtml', escapeHtmlFallback(value), value);
    }

    function clamp(value, min, max, context) {
        return call(contextOf(context), 'clamp', clampFallback(value, min, max), value, min, max);
    }

    function t(en, cn, context) {
        return call(contextOf(context), 't', translateFallback(en, cn), en, cn);
    }

    function getProject(context) {
        const project = typeof context?.getProject === 'function' ? context.getProject() : null;
        return project && typeof project === 'object' ? project : { id: 'default', nodes: [], edges: [] };
    }

    function appendProjectNode(project, node, context) {
        const patch = call(context, 'buildProjectNodeAppendPatch', null, project, node);
        if (patch && typeof patch === 'object' && Array.isArray(patch.nodes)) {
            Object.assign(project, patch);
            return;
        }
        const nodes = Array.isArray(project?.nodes) ? project.nodes.slice() : [];
        if (node && typeof node === 'object') nodes.push(node);
        Object.assign(project, { nodes });
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
        if (!node || node.type !== 'gaussian_studio') return false;
        const state = gaussianState(node, context);
        const asset = node.asset || state.render_asset || state.output_asset || {};
        const mime = String(asset.mime || '').toLowerCase();
        const hasAsset = !!(asset.path || asset.preview_url || asset.data_url || asset.thumb || asset.asset_id || asset.asset_relative_path || asset.relative_path);
        return hasAsset && (!mime || mime.startsWith('image/'));
    }

    function isImageSource(node, context) {
        if (!node) return false;
        if (node.type === 'image') return !!node.asset;
        if (node.type === 'gaussian_studio') return isSource(node, context);
        if (node.type === 'pose_studio') {
            const asset = node.asset || node.pose_studio?.output_asset || {};
            const mime = String(asset.mime || '').toLowerCase();
            return !!(asset.path || asset.preview_url || asset.data_url || asset.thumb || asset.asset_id || asset.asset_relative_path || asset.relative_path) && (!mime || mime.startsWith('image/'));
        }
        if (node.type === 'result') {
            const asset = selectedResultAsset(node, context);
            return !!asset && String(asset.mime || '').toLowerCase().startsWith('image/');
        }
        return false;
    }

    function sourceEdgeForNode(node, context) {
        const edges = Array.isArray(getProject(context).edges) ? getProject(context).edges : [];
        return edges.find(item => item.type === 'image' && item.to === node?.id && item.slot === 'reference') || null;
    }

    function inputSourceForNode(node, context) {
        const edge = sourceEdgeForNode(node, context);
        const source = getNode(node?.input_node_id, context) || getNode(edge?.from, context);
        return isImageSource(source, context) ? source : null;
    }

    function sourceAssetForNode(node, context) {
        const source = inputSourceForNode(node, context);
        return source ? selectedResultAsset(source, context) : null;
    }

    function assetDisplaySrc(asset, context) {
        const ctx = contextOf(context);
        if (typeof ctx.assetDisplaySrc === 'function') return ctx.assetDisplaySrc(asset || {});
        return asset?.preview_url || asset?.data_url || asset?.thumb || '';
    }

    function readAssetInfo(asset, context) {
        const ctx = contextOf(context);
        if (typeof ctx.readAssetInfo === 'function') return ctx.readAssetInfo(asset || {});
        const bits = [];
        if (asset?.width && asset?.height) bits.push(`${asset.width} x ${asset.height}`);
        if (asset?.mime) bits.push(asset.mime);
        return bits;
    }

    function serializeAssetSourceForRun(node, context) {
        if (!node) return null;
        const ctx = contextOf(context);
        if (typeof ctx.serializeAssetSourceForRun === 'function') return ctx.serializeAssetSourceForRun(node);
        return null;
    }

    function mediaAspectStyle(asset, context) {
        const ctx = contextOf(context);
        if (typeof ctx.mediaAspectStyle === 'function') return ctx.mediaAspectStyle(asset || {});
        const width = Number(asset?.width || 0);
        const height = Number(asset?.height || 0);
        if (!width || !height) return '';
        const aspect = clamp(width / height, 0.25, 4, context);
        return ` style="--sai-media-aspect:${aspect.toFixed(5)}" data-aspect="true"`;
    }

    function notConnectedText(context) {
        return call(context, 'notConnectedText', t('Not connected', '未连接', context));
    }

    function portHintText(context) {
        return call(context, 'portHintText', t('Double-click', '双击', context));
    }

    function gaussianState(node, context) {
        const fallback = {
            gaussian_studio: Object.assign({
            reference_asset: null,
            reference_signature: '',
            reference_capture_signature: '',
            reference_data_signature: '',
            ply_asset: null,
            ply_path: '',
            render_asset: null,
            output_asset: null,
            camera_state: {},
            extrinsics: null,
            intrinsics: null,
            params: { precision: DEFAULT_GAUSSIAN_PRECISION, focal_length_mm: 30 },
            updated_at: ''
            }, node?.gaussian_studio || {})
        };
        const patch = call(context, 'buildGaussianStudioStatePatch', fallback, node);
        const state = patch?.gaussian_studio || fallback.gaussian_studio;
        const params = state.params && typeof state.params === 'object' ? state.params : {};
        const precision = String(params.precision || '').trim().toLowerCase();
        state.params = Object.assign({}, params, {
            precision: (!precision || !VALID_GAUSSIAN_PRECISIONS.has(precision)) ? DEFAULT_GAUSSIAN_PRECISION : precision
        });
        return state;
    }

    function renderNodeStateBadges(node, context) {
        return call(context, 'renderNodeStateBadges', '', node);
    }

    function renderNodeHtml(node, context) {
        const state = gaussianState(node, context);
        const source = inputSourceForNode(node, context);
        const asset = node.asset || state.render_asset || state.output_asset || {};
        const src = assetDisplaySrc(asset, context);
        const info = readAssetInfo(asset || {}, context);
        const status = node.status?.message || '';
        const hasStoredReference = !!(state.reference_asset?.path || state.reference_asset?.preview_url || state.reference_asset?.data_url || state.reference_asset?.thumb);
        const hasPly = !!(state.ply_asset?.path || state.ply_asset?.preview_url || state.ply_path);
        const referenceLabel = source
            ? (source.title || source.id)
            : (hasStoredReference ? t('Loaded reference', '已载入参考图', context) : notConnectedText(context));
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml('3DGS', context)}</span>
  <span class="sai-node-title">${escapeHtml(node.title || 'Gaussian Studio', context)}</span>
  ${renderNodeStateBadges(node, context)}
  <button type="button" data-node-action="edit-gaussian-studio" title="${escapeHtml(t('Open Gaussian Studio', '打开 Gaussian Studio', context), context)}"><i class="fa-solid fa-cube"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除', context), context)}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-text-input-row sai-gaussian-studio-reference-row" title="${escapeHtml(t('Connect an image/result as reference', '连接图像 / 结果作为参考', context), context)}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-gaussian-studio-reference-in title="${escapeHtml(t('Reference image input', '参考图输入', context), context)}"></button>
  <i class="fa-solid fa-image"></i><span>${escapeHtml(t('Reference', '参考图', context), context)}</span><b>${escapeHtml(referenceLabel, context)}</b><small>${escapeHtml(portHintText(context), context)}</small>
</div>
<div class="sai-node-media sai-gaussian-studio-media"${mediaAspectStyle(asset, context)}>${src ? `<img src="${escapeHtml(src, context)}" alt="" draggable="false">` : `<div class="sai-node-empty">${escapeHtml(t('No render', '无渲染图', context), context)}</div>`}</div>
<div class="sai-node-info"><span>${escapeHtml(hasPly ? t('PLY ready', 'PLY 已生成', context) : t('PLY pending', '等待 PLY', context), context)}</span>${info.map(bit => `<span>${escapeHtml(bit, context)}</span>`).join('')}</div>
${status ? `<div class="sai-node-foot">${escapeHtml(status, context)}</div>` : ''}
<button type="button" class="sai-node-primary" data-node-action="edit-gaussian-studio"><i class="fa-solid fa-cube"></i><span>${escapeHtml(t('Open 3D View', '打开 3D 视角', context), context)}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="image" title="${escapeHtml(t('Rendered image output', '渲染图输出', context), context)}"></button>`;
    }

    function renderInspector(node, context) {
        const source = inputSourceForNode(node, context);
        const state = gaussianState(node, context);
        const info = readAssetInfo(node.asset || state.render_asset || state.output_asset || {}, context);
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(node.title || 'Gaussian Studio', context)}</h3>
  <label>${escapeHtml(t('Title', '标题', context), context)}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '', context)}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Reference', '参考图', context), context)}</span><b>${escapeHtml(source?.title || source?.id || notConnectedText(context), context)}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml('PLY', context)}</span><b>${escapeHtml(state.ply_asset?.name || state.ply_path || t('Not generated', '未生成', context), context)}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Output', '输出', context), context)}</span><b>${escapeHtml(info.join(' / ') || t('No render', '无渲染图', context), context)}</b></div>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="edit-gaussian-studio"><i class="fa-solid fa-cube"></i><span>${escapeHtml(t('Edit', '编辑', context), context)}</span></button>
  <button type="button" data-inspector-action="view-media" ${node.asset ? '' : 'disabled'}><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtml(t('View', '查看', context), context)}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制', context), context)}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除', context), context)}</span></button>
</div>`;
    }

    function createNode(world, options, context) {
        const project = getProject(context);
        const opts = options || {};
        const size = call(context, 'defaultNodeSize', { w: 400, h: 560 }, 'gaussian_studio') || { w: 400, h: 560 };
        if (opts.history !== false) call(context, 'pushHistory', null, 'Add Gaussian Studio node');
        const node = {
            id: opts.id || call(context, 'uid', 'gaussian-node', 'gaussian'),
            type: 'gaussian_studio',
            x: world?.x || 0,
            y: world?.y || 0,
            w: opts.w || size.w,
            h: opts.h || size.h,
            title: opts.title || 'Gaussian Studio',
            input_node_id: opts.input_node_id || null,
            asset: opts.asset || null,
            gaussian_studio: opts.gaussian_studio || {},
            source: { kind: 'gaussian_studio', module: 'ui.services.gaussian_studio' },
            status: {
                state: opts.asset ? 'finished' : 'idle',
                message: opts.asset ? t('Gaussian render ready.', '高斯渲染图已就绪。', context) : t('Open Gaussian Studio to build a view.', '打开 Gaussian Studio 生成视角。', context)
            }
        };
        Object.assign(node, call(context, 'buildGaussianStudioStatePatch', {
            gaussian_studio: Object.assign({
                reference_asset: opts.reference_asset || null,
                reference_signature: '',
                reference_capture_signature: '',
                reference_data_signature: '',
                ply_asset: null,
                ply_path: '',
                render_asset: opts.asset || null,
                output_asset: opts.asset || null,
                camera_state: {},
                extrinsics: null,
                intrinsics: null,
                params: { precision: DEFAULT_GAUSSIAN_PRECISION, focal_length_mm: 30 },
                updated_at: ''
            }, opts.gaussian_studio || {})
        }, node, {
            initialState: {
                reference_asset: opts.reference_asset || null,
                render_asset: opts.asset || null,
                output_asset: opts.asset || null
            }
        }));
        call(context, 'placeNodeAvoidingOverlap', null, node, world || { x: node.x, y: node.y });
        appendProjectNode(project, node, context);
        call(context, 'setSelectedNode', null, node.id);
        if (opts.render !== false) call(context, 'mutate', null);
        if (opts.toast !== false) call(context, 'showToast', null, t('Gaussian Studio node added', '已添加 Gaussian Studio 节点', context));
        return node;
    }

    function openEditor(node, context) {
        if (!node || node.type !== 'gaussian_studio') return null;
        const runtimeEditor = editor(context);
        if (typeof runtimeEditor.open !== 'function') {
            call(context, 'showToast', null, 'Gaussian Studio editor is not loaded.');
            return null;
        }
        const state = gaussianState(node, context);
        const referenceSource = inputSourceForNode(node, context);
        const referenceAsset = sourceAssetForNode(node, context) || state.reference_asset || null;
        const referenceAssetSource = referenceSource
            ? serializeAssetSourceForRun(referenceSource, context)
            : (referenceAsset ? {
                node_id: node.id,
                type: 'gaussian_reference',
                title: 'Gaussian reference',
                asset: referenceAsset,
                source: { kind: 'gaussian_studio_reference' }
            } : null);
        const referenceSrc = assetDisplaySrc(referenceAsset || {}, context);
        return runtimeEditor.open({
            title: node.title || 'Gaussian Studio',
            projectId: getProject(context).id || (typeof context?.getProjectId === 'function' ? context.getProjectId() : '') || 'default',
            node,
            nodeId: node.id,
            referenceSrc,
            referenceAsset,
            referenceAssetSource,
            referenceWidth: Number(referenceAsset?.width || 0),
            referenceHeight: Number(referenceAsset?.height || 0),
            state,
            gaussianState: state,
            plyAsset: state.ply_asset || null,
            plyPath: state.ply_path || '',
            renderAsset: state.render_asset || state.output_asset || node.asset || null,
            cameraState: state.camera_state || {},
            referenceSignature: state.reference_signature || '',
            referenceCaptureSignature: state.reference_capture_signature || '',
            referenceDataSignature: state.reference_data_signature || '',
            extrinsics: state.extrinsics || null,
            intrinsics: state.intrinsics || null,
            detectTheme: () => call(context, 'detectWorkbenchTheme', 'dark'),
            ensureFormNames: (scope, prefix) => call(context, 'ensureWorkbenchFormFieldNames', null, scope, prefix),
            onStateChange: (cache, reason) => {
                const current = getNode(node.id, context) || node;
                Object.assign(current, call(context, 'buildGaussianStudioStatePatch', {
                    gaussian_studio: gaussianState(current, context)
                }, current));
                Object.assign(current, call(context, 'buildGaussianCachePatch', {}, current, {
                    cache: cache || {},
                    reason,
                    referenceAsset,
                    referenceChangedStatus: {
                        state: 'idle',
                        message: t('Reference changed. Rebuild the 3D Gaussian.', '参考图已更新，需重新生成 3D 高斯。', context)
                    },
                    plyReadyStatus: {
                        state: reason === 'build' ? 'ready' : 'idle',
                        message: t('PLY ready. Rotate and export a view.', 'PLY 已生成，可旋转并导出视角。', context)
                    }
                }));
                call(context, 'setSelectedNode', null, current.id);
                call(context, 'mutate', null, { inspector: true });
            },
            onConfirm: (response) => {
                call(context, 'pushHistory', null, 'Update Gaussian Studio output');
                const current = getNode(node.id, context) || node;
                Object.assign(current, call(context, 'buildGaussianStudioStatePatch', {
                    gaussian_studio: gaussianState(current, context)
                }, current));
                Object.assign(current, call(context, 'buildGaussianConfirmPatch', {}, current, {
                    response,
                    referenceAsset,
                    sourcePatch: {
                        kind: 'gaussian_studio',
                        module: 'ui.services.gaussian_studio',
                        reference_node_id: inputSourceForNode(current, context)?.id || ''
                    },
                    status: {
                        state: 'finished',
                        message: t('Gaussian render exported.', '高斯渲染图已导出。', context)
                    }
                }));
                call(context, 'setSelectedNode', null, current.id);
                call(context, 'mutate', null);
            }
        });
    }

    window.SimpAICanvasWorkbenchGaussianStudioNode = {
        createGaussianStudioNodeContext,
        createNode,
        inputSourceForNode,
        isImageSource,
        isSource,
        openEditor,
        renderInspector,
        renderNodeHtml,
        sourceAssetForNode
    };
})();
