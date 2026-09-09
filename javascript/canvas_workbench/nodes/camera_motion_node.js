(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const ASSETS = window.SimpAICanvasWorkbenchAssetNodes || {};
    const API = window.SimpAICanvasWorkbenchApi || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
    const t = UTILS.t || ((en, cn) => cn || en);
    const uid = UTILS.uid || ((prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`);
    const refreshTimers = new Map();

    const MOTION_TYPES = [
        ['orbit', 'Orbit', '环绕'],
        ['pan', 'Pan', '摇摄'],
        ['dolly', 'Dolly', '推拉'],
        ['truck', 'Truck', '横移'],
        ['crane', 'Crane', '升降'],
        ['roll', 'Roll', '旋转'],
        ['orbit_dolly', 'Orbit + Dolly', '环绕 + 推拉']
    ];
    const DIRECTIONS = [
        ['forward', 'Forward', '正向'],
        ['reverse', 'Reverse', '反向']
    ];
    const NUMERIC_LIMITS = {
        speed: [0.1, 2, 0.1],
        amplitude: [0, 2, 0.1],
        duration: [0.1, 60, 0.1],
        fps: [4, 120, 1],
        width: [64, 4096, 2],
        height: [64, 4096, 2]
    };

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createCameraMotionNodeContext(source) {
        const context = source || {};
        return {
            getProject: delegate(context, 'getProject'),
            getProjectId: delegate(context, 'getProjectId'),
            assetDisplaySrc: delegate(context, 'assetDisplaySrc'),
            defaultNodeSize: delegate(context, 'defaultNodeSize'),
            getNode: delegate(context, 'getNode'),
            isNodeIgnored: delegate(context, 'isNodeIgnored'),
            isNodeLocked: delegate(context, 'isNodeLocked'),
            mediaAspectStyle: delegate(context, 'mediaAspectStyle'),
            mutate: delegate(context, 'mutate'),
            placeNodeAvoidingOverlap: delegate(context, 'placeNodeAvoidingOverlap'),
            pushHistory: delegate(context, 'pushHistory'),
            pushHistoryBatch: delegate(context, 'pushHistoryBatch'),
            readAssetInfo: delegate(context, 'readAssetInfo'),
            renderNodeStateBadges: delegate(context, 'renderNodeStateBadges'),
            scheduleSave: delegate(context, 'scheduleSave'),
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

    function defaultParams() {
        return {
            motion_type: 'orbit',
            direction: 'forward',
            speed: 1,
            amplitude: 1,
            duration: 5,
            fps: 16,
            width: 640,
            height: 640
        };
    }

    function assetDisplaySrc(asset, context) {
        if (typeof context?.assetDisplaySrc === 'function') return context.assetDisplaySrc(asset || {});
        if (typeof ASSETS.assetDisplaySrc === 'function') return ASSETS.assetDisplaySrc(asset || {});
        return asset?.preview_url || asset?.data_url || '';
    }

    function readAssetInfo(asset, context) {
        if (typeof context?.readAssetInfo === 'function') return context.readAssetInfo(asset || {});
        if (typeof ASSETS.readAssetInfo === 'function') return ASSETS.readAssetInfo(asset || {});
        return [];
    }

    function mediaAspectStyle(asset, context) {
        if (typeof context?.mediaAspectStyle === 'function') return context.mediaAspectStyle(asset || {});
        if (typeof ASSETS.mediaAspectStyle === 'function') return ASSETS.mediaAspectStyle(asset || {});
        return '';
    }

    function selectOptions(items, current) {
        return items.map(([value, en, cn]) => `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(t(en, cn))}</option>`).join('');
    }

    function rangeField(key, en, cn, value) {
        const [min, max, step] = NUMERIC_LIMITS[key];
        return `<label class="sai-node-field sai-node-range"><span>${escapeHtml(t(en, cn))}</span><div class="sai-range-pair"><input data-camera-motion-param="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}"><input data-camera-motion-param="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}"></div></label>`;
    }

    function renderNodeHtml(node, context) {
        const params = Object.assign(defaultParams(), node.params || {});
        const asset = node.asset || {};
        const src = assetDisplaySrc(asset, context);
        const info = readAssetInfo(asset, context);
        const running = String(node.status?.state || '').toLowerCase() === 'running';
        const status = node.status?.message || '';
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">Uni3C</span>
  <span class="sai-node-title">${escapeHtml(node.title || t('Uni3C Camera Motion', 'Uni3C 运镜'))}</span>
  ${call(context, 'renderNodeStateBadges', '', node)}
  <button type="button" data-node-action="generate-camera-motion-reference" title="${escapeHtml(t('Generate reference video', '生成参考视频'))}"><i class="fa-solid fa-camera-rotate"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-node-field-row">
  <label><span>${escapeHtml(t('Motion', '运镜类型'))}</span><select data-camera-motion-param="motion_type">${selectOptions(MOTION_TYPES, params.motion_type)}</select></label>
  <label><span>${escapeHtml(t('Direction', '方向'))}</span><select data-camera-motion-param="direction">${selectOptions(DIRECTIONS, params.direction)}</select></label>
</div>
${rangeField('speed', 'Speed', '速度', params.speed)}
${rangeField('amplitude', 'Amplitude', '幅度', params.amplitude)}
${rangeField('duration', 'Duration (s)', '时长（秒）', params.duration)}
<div class="sai-node-field-row">
  <label><span>FPS</span><input data-camera-motion-param="fps" type="number" min="4" max="120" step="1" value="${escapeHtml(params.fps)}"></label>
  <label><span>${escapeHtml(t('Frame Size', '画面尺寸'))}</span><span>${escapeHtml(params.width)} × ${escapeHtml(params.height)}</span></label>
</div>
<div class="sai-node-field-row">
  <label><span>${escapeHtml(t('Width', '宽度'))}</span><input data-camera-motion-param="width" type="number" min="64" max="4096" step="2" value="${escapeHtml(params.width)}"></label>
  <label><span>${escapeHtml(t('Height', '高度'))}</span><input data-camera-motion-param="height" type="number" min="64" max="4096" step="2" value="${escapeHtml(params.height)}"></label>
</div>
<div class="sai-node-media sai-node-video-media"${mediaAspectStyle(asset, context)}>${src ? `<video src="${escapeHtml(src)}" muted loop playsinline preload="metadata" controls></video>` : `<div class="sai-node-empty">${escapeHtml(t('No camera reference generated', '尚未生成运镜参考视频'))}</div>`}</div>
${info.length ? `<div class="sai-node-info">${info.map(bit => `<span>${escapeHtml(bit)}</span>`).join('')}</div>` : ''}
${status ? `<div class="sai-node-foot">${escapeHtml(status)}</div>` : ''}
<button type="button" class="sai-node-primary" data-node-action="generate-camera-motion-reference" ${running ? 'disabled' : ''}><i class="fa-solid ${running ? 'fa-spinner fa-spin' : 'fa-camera-rotate'}"></i><span>${escapeHtml(running ? t('Generating...', '正在生成…') : t('Generate Reference Video', '生成参考视频'))}</span></button>
<button type="button" class="sai-node-secondary" data-node-action="clear-camera-motion-reference" ${node.asset ? '' : 'disabled'}><i class="fa-solid fa-eraser"></i><span>${escapeHtml(t('Clear Reference', '清除参考'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="video" title="${escapeHtml(t('Uni3C reference video output', 'Uni3C 参考视频输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const params = Object.assign(defaultParams(), node.params || {});
        const info = readAssetInfo(node.asset || {}, context);
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('Uni3C Camera Motion', 'Uni3C 运镜'))}</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Motion', '运镜'))}</span><b>${escapeHtml(params.motion_type)} / ${escapeHtml(params.direction)}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Output', '输出'))}</span><b>${escapeHtml(info.join(' / ') || t('Not generated', '尚未生成'))}</b></div>
  <p>${escapeHtml(t('Connect the video output to a Uni3C preset Reference Video input.', '把视频输出连接到 Uni3C Preset 的“参考视频”输入。'))}</p>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="generate-camera-motion-reference"><i class="fa-solid fa-camera-rotate"></i><span>${escapeHtml(t('Generate', '生成'))}</span></button>
  <button type="button" data-inspector-action="clear-camera-motion-reference" ${node.asset ? '' : 'disabled'}><i class="fa-solid fa-eraser"></i><span>${escapeHtml(t('Clear', '清除'))}</span></button>
  <button type="button" data-inspector-action="view-media" ${node.asset ? '' : 'disabled'}><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtml(t('View', '查看'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
    }

    function normalizeParam(key, value) {
        if (key === 'motion_type') return MOTION_TYPES.some(item => item[0] === value) ? value : 'orbit';
        if (key === 'direction') return DIRECTIONS.some(item => item[0] === value) ? value : 'forward';
        if (!NUMERIC_LIMITS[key]) return value;
        const [min, max, step] = NUMERIC_LIMITS[key];
        let parsed = Number(value);
        if (!Number.isFinite(parsed)) parsed = defaultParams()[key];
        parsed = clamp(parsed, min, max);
        if (key === 'fps') return Math.round(parsed);
        if (key === 'width' || key === 'height') return Math.max(64, Math.round(parsed / step) * step);
        return Math.round(parsed * 1000) / 1000;
    }

    function updateParam(nodeId, key, value, inputType, context) {
        const node = getNode(nodeId, context);
        if (!node || node.type !== 'camera_motion' || !key || call(context, 'isNodeLocked', false, node)) return;
        const next = normalizeParam(key, value);
        const current = Object.assign(defaultParams(), node.params || {})[key];
        if (String(current) === String(next)) return;
        call(context, 'pushHistoryBatch', null, `camera_motion:${nodeId}:${key}`, 'Edit Uni3C camera motion parameter');
        node.params = Object.assign(defaultParams(), node.params || {}, { [key]: next });
        const hadAsset = !!node.asset;
        if (hadAsset) {
            node.asset = null;
            node.status = { state: 'idle', message: t('Settings changed. Generate a new reference video.', '参数已变化，请重新生成参考视频。') };
        }
        call(context, 'scheduleSave', null);
        if (hadAsset || refreshTimers.has(nodeId)) {
            if (refreshTimers.has(nodeId)) window.clearTimeout(refreshTimers.get(nodeId));
            refreshTimers.set(nodeId, window.setTimeout(() => {
                refreshTimers.delete(nodeId);
                call(context, 'mutate', null);
            }, 220));
        }
    }

    function createNode(world, options, context) {
        const opts = options || {};
        if (opts.history !== false) call(context, 'pushHistory', null, 'Add Uni3C camera motion node');
        const size = call(context, 'defaultNodeSize', { w: 380, h: 680 }, 'camera_motion');
        const node = {
            id: uid('camotion'),
            type: 'camera_motion',
            x: world.x,
            y: world.y,
            w: size.w,
            h: size.h,
            title: opts.title || t('Uni3C Camera Motion', 'Uni3C 运镜'),
            params: Object.assign(defaultParams(), opts.params || {}),
            asset: opts.asset || null,
            source: Object.assign({ kind: 'camera_motion_reference', module: 'enhanced.camera_motion_reference' }, opts.source || {}),
            status: opts.status || { state: 'idle', message: t('Set the motion and generate a reference video.', '设置运镜参数后生成参考视频。') }
        };
        call(context, 'placeNodeAvoidingOverlap', null, node, world);
        const project = getProject(context);
        if (!Array.isArray(project.nodes)) project.nodes = [];
        project.nodes.push(node);
        call(context, 'setSelectedNode', null, node.id);
        if (opts.render !== false) call(context, 'mutate', null);
        if (opts.toast !== false) call(context, 'showToast', null, t('Uni3C Camera Motion node added', '已添加 Uni3C 运镜节点'));
        return node;
    }

    async function runNode(node, context) {
        if (!node || node.type !== 'camera_motion') return { ok: false, error: 'Uni3C Camera Motion node is unavailable' };
        if (call(context, 'isNodeLocked', false, node)) return { ok: false, error: 'node is locked' };
        if (call(context, 'isNodeIgnored', false, node)) return { ok: false, error: 'node is skipped' };
        if (String(node.status?.state || '').toLowerCase() === 'running') return { ok: false, error: 'already running' };
        if (typeof API.generateCameraMotionReference !== 'function') return { ok: false, error: 'camera motion API is unavailable' };

        call(context, 'pushHistory', null, 'Generate Uni3C camera motion reference');
        node.status = { state: 'running', message: t('Generating camera reference video...', '正在生成运镜参考视频…') };
        call(context, 'mutate', null);
        const response = await API.generateCameraMotionReference({
            project_id: getProject(context).id || (typeof context?.getProjectId === 'function' ? context.getProjectId() : '') || 'default',
            node_id: node.id,
            params: Object.assign(defaultParams(), node.params || {})
        });
        const current = getNode(node.id, context);
        if (!current) return response || { ok: false, error: 'node was removed' };
        if (response?.ok) {
            const ref = response.reference_video || response.asset_ref || {};
            current.params = Object.assign(defaultParams(), response.settings || current.params || {});
            current.asset = Object.assign({}, ref, {
                kind: ref.kind || 'generated_camera_motion_reference',
                mime: ref.mime || 'video/mp4',
                camera_motion_settings: Object.assign({}, response.settings || current.params || {})
            });
            current.source = Object.assign({}, current.source || {}, { settings: Object.assign({}, response.settings || current.params || {}) });
            current.status = { state: 'finished', message: t('Camera reference video generated.', '运镜参考视频已生成。') };
            call(context, 'setSelectedNode', null, current.id);
            call(context, 'mutate', null);
            call(context, 'showToast', null, t('Camera reference video generated', '运镜参考视频已生成'));
        } else {
            current.status = { state: 'failed', message: response?.details || response?.error || t('Camera reference generation failed.', '运镜参考视频生成失败。') };
            call(context, 'mutate', null);
            call(context, 'showToast', null, `${t('Camera reference failed', '运镜参考生成失败')}：${current.status.message}`);
        }
        return response;
    }

    function clearNode(node, context) {
        if (!node || node.type !== 'camera_motion' || call(context, 'isNodeLocked', false, node)) return false;
        call(context, 'pushHistory', null, 'Clear Uni3C camera motion reference');
        node.asset = null;
        node.status = { state: 'idle', message: t('Reference cleared. Generate a new video when needed.', '参考视频已清除，需要时可重新生成。') };
        call(context, 'mutate', null);
        return true;
    }

    window.SimpAICanvasWorkbenchCameraMotionNode = {
        createCameraMotionNodeContext,
        clearNode,
        createNode,
        defaultParams,
        renderInspector,
        renderNodeHtml,
        runNode,
        updateParam
    };
})();
