(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const ASSETS = window.SimpAICanvasWorkbenchAssetNodes || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
    const t = UTILS.t || ((en, cn) => cn || en);
    const uid = UTILS.uid || ((prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`);

    function editor() {
        return window.SimpAIPoseStudioEditor || {};
    }

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createPoseStudioNodeContext(source) {
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
            isPoseStudioImageSource: delegate(context, 'isPoseStudioImageSource'),
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
            showToast: delegate(context, 'showToast'),
            buildAssetReference: delegate(context, 'buildAssetReference'),
            buildProjectNodeAppendPatch: delegate(context, 'buildProjectNodeAppendPatch'),
            buildPoseStudioStatePatch: delegate(context, 'buildPoseStudioStatePatch'),
            buildPoseStudioConfirmPatch: delegate(context, 'buildPoseStudioConfirmPatch')
        };
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

    function isImageSource(node, context) {
        if (!node) return false;
        if (node.type === 'image') return true;
        if (node.type === 'pose_studio') return isSource(node, context);
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

    function poseMediaAspectStyle(asset, state, context) {
        const direct = mediaAspectStyle(asset, context);
        if (direct) return direct;
        const exportParams = state?.editor_state?.export_params || {};
        const referenceSize = state?.editor_state?.reference_size || {};
        const width = Number(exportParams.view_width || referenceSize.width || 0);
        const height = Number(exportParams.view_height || referenceSize.height || 0);
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

    function poseState(node, context) {
        const fallback = {
            pose_studio: Object.assign({
            pose_data: {},
            editor_state: {},
            reference_asset: null,
            output_asset: null,
            updated_at: ''
            }, node?.pose_studio || {})
        };
        const patch = call(context, 'buildPoseStudioStatePatch', fallback, node);
        return patch?.pose_studio || fallback.pose_studio;
    }

    function hasStoredPose(data) {
        if (!data || typeof data !== 'object') return false;
        const pose = Array.isArray(data.poses) ? (data.poses[0] || {}) : data;
        if (!pose || typeof pose !== 'object') return false;
        return Object.keys(pose).some((key) => {
            const value = pose[key];
            if (value == null) return false;
            if (Array.isArray(value)) return value.length > 0;
            if (typeof value === 'object') return Object.keys(value).length > 0;
            return value !== '';
        });
    }

    function hasStoredPoseState(state) {
        const editorState = state?.editor_state || {};
        return hasStoredPose(state?.pose_data)
            || hasStoredPose(editorState.viewer_pose)
            || hasStoredPose(editorState.sam3d_pose_data);
    }

    function renderNodeStateBadges(node, context) {
        return call(context, 'renderNodeStateBadges', '', node);
    }

    function renderNodeHtml(node, context) {
        const state = poseState(node, context);
        const source = inputSourceForNode(node, context);
        const asset = node.asset || state.output_asset || {};
        const src = assetDisplaySrc(asset, context);
        const info = readAssetInfo(asset || {}, context);
        const status = node.status?.message || '';
        const hasStoredReference = !!(state.reference_asset?.path || state.reference_asset?.preview_url || state.reference_asset?.data_url || state.reference_asset?.thumb);
        const referenceLabel = source
            ? (source.title || source.id)
            : (hasStoredReference ? t('Loaded reference', '已载入参考图') : notConnectedText(context));
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(t('Pose', '姿势'))}</span>
  <span class="sai-node-title">${escapeHtml(node.title || 'Pose Studio')}</span>
  ${renderNodeStateBadges(node, context)}
  <button type="button" data-node-action="edit-pose-studio" title="${escapeHtml(t('Open Pose Studio', '打开 Pose Studio'))}"><i class="fa-solid fa-person-walking"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-text-input-row sai-pose-studio-reference-row" title="${escapeHtml(t('Connect an image/result as reference', '连接图像 / 结果作为参考'))}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-pose-studio-reference-in title="${escapeHtml(t('Reference image input', '参考图输入'))}"></button>
  <i class="fa-solid fa-image"></i><span>${escapeHtml(t('Reference', '参考图'))}</span><b>${escapeHtml(referenceLabel)}</b><small>${escapeHtml(portHintText(context))}</small>
</div>
<div class="sai-node-media sai-pose-studio-media"${poseMediaAspectStyle(asset, state, context)}>${src ? `<img src="${escapeHtml(src)}" alt="" draggable="false">` : `<div class="sai-node-empty">${escapeHtml(t('No pose image', '无姿势图'))}</div>`}</div>
${info.length ? `<div class="sai-node-info">${info.map(bit => `<span>${escapeHtml(bit)}</span>`).join('')}</div>` : ''}
${status ? `<div class="sai-node-foot">${escapeHtml(status)}</div>` : ''}
<button type="button" class="sai-node-primary" data-node-action="edit-pose-studio"><i class="fa-solid fa-person-walking"></i><span>${escapeHtml(t('Edit Pose', '编辑姿势'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="image" title="${escapeHtml(t('Pose image output', '姿势图输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const source = inputSourceForNode(node, context);
        const info = readAssetInfo(node.asset || poseState(node, context).output_asset || {}, context);
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(node.title || 'Pose Studio')}</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Reference', '参考图'))}</span><b>${escapeHtml(source?.title || source?.id || notConnectedText(context))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Output', '输出'))}</span><b>${escapeHtml(info.join(' / ') || t('No pose image', '无姿势图'))}</b></div>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="edit-pose-studio"><i class="fa-solid fa-person-walking"></i><span>${escapeHtml(t('Edit', '编辑'))}</span></button>
  <button type="button" data-inspector-action="view-media" ${node.asset ? '' : 'disabled'}><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtml(t('View', '查看'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
    }

    function createNode(world, options, context) {
        const project = getProject(context);
        const opts = options || {};
        const size = call(context, 'defaultNodeSize', { w: 380, h: 520 }, 'pose_studio') || { w: 380, h: 520 };
        if (opts.history !== false) call(context, 'pushHistory', null, 'Add Pose Studio node');
        const node = {
            id: opts.id || uid('pose'),
            type: 'pose_studio',
            x: world?.x || 0,
            y: world?.y || 0,
            w: opts.w || size.w,
            h: opts.h || size.h,
            title: opts.title || 'Pose Studio',
            input_node_id: opts.input_node_id || null,
            asset: opts.asset || null,
            pose_studio: opts.pose_studio || {},
            source: { kind: 'pose_studio', module: 'ui.services.pose_studio' },
            status: {
                state: opts.asset ? 'finished' : 'idle',
                message: opts.asset ? t('Pose image ready.', '姿势图已就绪。') : t('Open Pose Studio to export a pose image.', '打开 Pose Studio 导出姿势图。')
            }
        };
        Object.assign(node, call(context, 'buildPoseStudioStatePatch', {
            pose_studio: Object.assign({
                pose_data: {},
                editor_state: {},
                reference_asset: opts.reference_asset || null,
                output_asset: opts.asset || null,
                updated_at: ''
            }, opts.pose_studio || {})
        }, node, {
            initialState: {
                reference_asset: opts.reference_asset || null,
                output_asset: opts.asset || null
            }
        }));
        call(context, 'placeNodeAvoidingOverlap', null, node, world || { x: node.x, y: node.y });
        appendProjectNode(project, node, context);
        call(context, 'setSelectedNode', null, node.id);
        if (opts.render !== false) call(context, 'mutate', null);
        if (opts.toast !== false) call(context, 'showToast', null, t('Pose Studio node added', '已添加 Pose Studio 节点'));
        return node;
    }

    function openEditor(node, context) {
        if (!node || node.type !== 'pose_studio') return null;
        const runtimeEditor = editor();
        if (typeof runtimeEditor.open !== 'function') {
            call(context, 'showToast', null, 'Pose Studio editor is not loaded.');
            return null;
        }
        const state = poseState(node, context);
        const referenceSource = inputSourceForNode(node, context);
        const referenceAsset = sourceAssetForNode(node, context) || state.reference_asset || null;
        const referenceAssetSource = referenceSource
            ? serializeAssetSourceForRun(referenceSource, context)
            : (referenceAsset ? {
                node_id: node.id,
                type: 'pose_reference',
                title: 'Pose reference',
                asset: referenceAsset,
                source: { kind: 'pose_studio_reference' }
            } : null);
        const referenceSrc = assetDisplaySrc(referenceAsset || {}, context);
        return runtimeEditor.open({
            title: node.title || 'Pose Studio',
            context: 'canvas',
            projectId: getProject(context).id || (typeof context?.getProjectId === 'function' ? context.getProjectId() : '') || 'default',
            node,
            referenceSrc,
            referenceAsset,
            referenceAssetSource,
            referenceWidth: Number(referenceAsset?.width || 0),
            referenceHeight: Number(referenceAsset?.height || 0),
            autoParseReference: !!referenceAssetSource && !hasStoredPoseState(state),
            poseData: state.pose_data || {},
            editorState: state.editor_state || {},
            detectTheme: () => call(context, 'detectWorkbenchTheme', 'dark'),
            ensureFormNames: (scope, prefix) => call(context, 'ensureWorkbenchFormFieldNames', null, scope, prefix),
            onConfirm: (response) => {
                call(context, 'pushHistory', null, 'Update Pose Studio output');
                const current = getNode(node.id, context) || node;
                Object.assign(current, call(context, 'buildPoseStudioConfirmPatch', {}, current, {
                    response,
                    referenceAsset,
                    sourcePatch: {
                        kind: 'pose_studio',
                        module: 'ui.services.pose_studio',
                        reference_node_id: inputSourceForNode(current, context)?.id || ''
                    },
                    status: {
                        state: 'finished',
                        message: t('Pose image exported.', '姿势图已导出。')
                    }
                }));
                call(context, 'setSelectedNode', null, current.id);
                call(context, 'mutate', null);
            }
        });
    }

    function isSource(node, context) {
        if (!node || node.type !== 'pose_studio') return false;
        const asset = node.asset || poseState(node, context).output_asset || {};
        const mime = String(asset.mime || '').toLowerCase();
        const hasAsset = !!(asset.path || asset.preview_url || asset.data_url || asset.thumb || asset.asset_id || asset.asset_relative_path || asset.relative_path);
        return hasAsset && (!mime || mime.startsWith('image/'));
    }

    window.SimpAICanvasWorkbenchPoseStudioNode = {
        createPoseStudioNodeContext,
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
