(function () {
    'use strict';

    const DEFAULT_UTILS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchUtils || {} : {};
    const DEFAULT_ASSETS = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchAssetNodes || {} : {};
    const DEFAULT_API = typeof window !== 'undefined' ? window.SimpAICanvasWorkbenchApi || {} : {};
    const escapeHtmlFallback = (value) => String(value ?? '');
    const clampFallback = (value, min, max) => Math.max(min, Math.min(max, value));
    const translateFallback = (en, cn) => cn || en;
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

    function buildStatus(state, message, context) {
        return call(context, 'buildCanvasRunStatus', { state, message }, state, message);
    }

    function createCameraMotionNodeContext(source) {
        const scope = source || {};
        const utilitySource = scope.utilitySource || {};
        const assetSource = scope.assetSource || {};
        const apiSource = scope.apiSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const pick = (group, name) => delegate(group, name) || delegate(scope, name);
        return {
            escapeHtml: pick(utilitySource, 'escapeHtml'),
            clamp: pick(utilitySource, 'clamp'),
            t: pick(utilitySource, 't'),
            getProject: pick(scope, 'getProject'),
            getProjectId: pick(scope, 'getProjectId'),
            uid: pick(scope, 'uid'),
            assetDisplaySrc: pick(assetSource, 'assetDisplaySrc'),
            buildCanvasRunStatus: pick(scope, 'buildCanvasRunStatus'),
            defaultNodeSize: pick(scope, 'defaultNodeSize'),
            getNode: pick(scope, 'getNode'),
            isNodeIgnored: pick(scope, 'isNodeIgnored'),
            isNodeLocked: pick(scope, 'isNodeLocked'),
            mediaAspectStyle: pick(assetSource, 'mediaAspectStyle'),
            mutate: pick(scope, 'mutate'),
            placeNodeAvoidingOverlap: pick(scope, 'placeNodeAvoidingOverlap'),
            pushHistory: pick(scope, 'pushHistory'),
            pushHistoryBatch: pick(scope, 'pushHistoryBatch'),
            readAssetInfo: pick(assetSource, 'readAssetInfo'),
            renderNodeStateBadges: pick(scope, 'renderNodeStateBadges'),
            scheduleSave: pick(scope, 'scheduleSave'),
            setTimeout: pick(runtimeSource, 'setTimeout'),
            clearTimeout: pick(runtimeSource, 'clearTimeout'),
            generateCameraMotionReference: pick(apiSource, 'generateCameraMotionReference'),
            setSelectedNode: pick(scope, 'setSelectedNode'),
            showToast: pick(scope, 'showToast'),
            buildCameraMotionParamsPatch: pick(scope, 'buildCameraMotionParamsPatch'),
            buildCameraMotionSourcePatch: pick(scope, 'buildCameraMotionSourcePatch'),
            buildCameraMotionStatePatch: pick(scope, 'buildCameraMotionStatePatch'),
            buildProjectNodeAppendPatch: pick(scope, 'buildProjectNodeAppendPatch'),
            buildVideoResponseAsset: pick(scope, 'buildVideoResponseAsset')
        };
    }

    const DEFAULT_CAMERA_MOTION_CONTEXT = createCameraMotionNodeContext({
        utilitySource: {
            escapeHtml: DEFAULT_UTILS.escapeHtml || escapeHtmlFallback,
            clamp: DEFAULT_UTILS.clamp || clampFallback,
            t: DEFAULT_UTILS.t || translateFallback
        },
        assetSource: DEFAULT_ASSETS,
        apiSource: DEFAULT_API
    });

    function contextOf(context) {
        return context || DEFAULT_CAMERA_MOTION_CONTEXT;
    }

    function escapeHtmlValue(context, value) {
        return call(contextOf(context), 'escapeHtml', escapeHtmlFallback(value), value);
    }

    function translateValue(context, en, cn) {
        return call(contextOf(context), 't', translateFallback(en, cn), en, cn);
    }

    function clampValue(context, value, min, max) {
        return call(contextOf(context), 'clamp', clampFallback(value, min, max), value, min, max);
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
        if (typeof contextOf(context).assetDisplaySrc === 'function') return contextOf(context).assetDisplaySrc(asset || {});
        return asset?.preview_url || asset?.data_url || '';
    }

    function readAssetInfo(asset, context) {
        if (typeof contextOf(context).readAssetInfo === 'function') return contextOf(context).readAssetInfo(asset || {});
        return [];
    }

    function mediaAspectStyle(asset, context) {
        if (typeof contextOf(context).mediaAspectStyle === 'function') return contextOf(context).mediaAspectStyle(asset || {});
        return '';
    }

    function selectOptions(items, current, context) {
        return items.map(([value, en, cn]) => `<option value="${escapeHtmlValue(context, value)}" ${value === current ? 'selected' : ''}>${escapeHtmlValue(context, translateValue(context, en, cn))}</option>`).join('');
    }

    function rangeField(key, en, cn, value, context) {
        const [min, max, step] = NUMERIC_LIMITS[key];
        return `<label class="sai-node-field sai-node-range"><span>${escapeHtmlValue(context, translateValue(context, en, cn))}</span><div class="sai-range-pair"><input data-camera-motion-param="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${escapeHtmlValue(context, value)}"><input data-camera-motion-param="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeHtmlValue(context, value)}"></div></label>`;
    }

    function renderNodeHtml(node, context) {
        const ctx = contextOf(context);
        const params = Object.assign(defaultParams(), node.params || {});
        const asset = node.asset || {};
        const src = assetDisplaySrc(asset, ctx);
        const info = readAssetInfo(asset, ctx);
        const running = String(node.status?.state || '').toLowerCase() === 'running';
        const status = node.status?.message || '';
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">Uni3C</span>
  <span class="sai-node-title">${escapeHtmlValue(ctx, node.title || translateValue(ctx, 'Uni3C Camera Motion', 'Uni3C 运镜'))}</span>
  ${call(ctx, 'renderNodeStateBadges', '', node)}
  <button type="button" data-node-action="generate-camera-motion-reference" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Generate reference video', '生成参考视频'))}"><i class="fa-solid fa-camera-rotate"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-node-field-row">
  <label><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Motion', '运镜类型'))}</span><select data-camera-motion-param="motion_type">${selectOptions(MOTION_TYPES, params.motion_type, ctx)}</select></label>
  <label><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Direction', '方向'))}</span><select data-camera-motion-param="direction">${selectOptions(DIRECTIONS, params.direction, ctx)}</select></label>
</div>
${rangeField('speed', 'Speed', '速度', params.speed, ctx)}
${rangeField('amplitude', 'Amplitude', '幅度', params.amplitude, ctx)}
${rangeField('duration', 'Duration (s)', '时长（秒）', params.duration, ctx)}
<div class="sai-node-field-row">
  <label><span>FPS</span><input data-camera-motion-param="fps" type="number" min="4" max="120" step="1" value="${escapeHtmlValue(ctx, params.fps)}"></label>
  <label><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Frame Size', '画面尺寸'))}</span><span>${escapeHtmlValue(ctx, params.width)} × ${escapeHtmlValue(ctx, params.height)}</span></label>
</div>
<div class="sai-node-field-row">
  <label><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Width', '宽度'))}</span><input data-camera-motion-param="width" type="number" min="64" max="4096" step="2" value="${escapeHtmlValue(ctx, params.width)}"></label>
  <label><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Height', '高度'))}</span><input data-camera-motion-param="height" type="number" min="64" max="4096" step="2" value="${escapeHtmlValue(ctx, params.height)}"></label>
</div>
<div class="sai-node-media sai-node-video-media"${mediaAspectStyle(asset, ctx)}>${src ? `<video src="${escapeHtmlValue(ctx, src)}" muted loop playsinline preload="metadata" controls></video>` : `<div class="sai-node-empty">${escapeHtmlValue(ctx, translateValue(ctx, 'No camera reference generated', '尚未生成运镜参考视频'))}</div>`}</div>
${info.length ? `<div class="sai-node-info">${info.map(bit => `<span>${escapeHtmlValue(ctx, bit)}</span>`).join('')}</div>` : ''}
${status ? `<div class="sai-node-foot">${escapeHtmlValue(ctx, status)}</div>` : ''}
<button type="button" class="sai-node-primary" data-node-action="generate-camera-motion-reference" ${running ? 'disabled' : ''}><i class="fa-solid ${running ? 'fa-spinner fa-spin' : 'fa-camera-rotate'}"></i><span>${escapeHtmlValue(ctx, running ? translateValue(ctx, 'Generating...', '正在生成…') : translateValue(ctx, 'Generate Reference Video', '生成参考视频'))}</span></button>
<button type="button" class="sai-node-secondary" data-node-action="clear-camera-motion-reference" ${node.asset ? '' : 'disabled'}><i class="fa-solid fa-eraser"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Clear Reference', '清除参考'))}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="video" title="${escapeHtmlValue(ctx, translateValue(ctx, 'Uni3C reference video output', 'Uni3C 参考视频输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const ctx = contextOf(context);
        const params = Object.assign(defaultParams(), node.params || {});
        const info = readAssetInfo(node.asset || {}, ctx);
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtmlValue(ctx, translateValue(ctx, 'Uni3C Camera Motion', 'Uni3C 运镜'))}</h3>
  <label>${escapeHtmlValue(ctx, translateValue(ctx, 'Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtmlValue(ctx, node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Motion', '运镜'))}</span><b>${escapeHtmlValue(ctx, params.motion_type)} / ${escapeHtmlValue(ctx, params.direction)}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Output', '输出'))}</span><b>${escapeHtmlValue(ctx, info.join(' / ') || translateValue(ctx, 'Not generated', '尚未生成'))}</b></div>
  <p>${escapeHtmlValue(ctx, translateValue(ctx, 'Connect the video output to a Uni3C preset Reference Video input.', '把视频输出连接到 Uni3C Preset 的“参考视频”输入。'))}</p>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="generate-camera-motion-reference"><i class="fa-solid fa-camera-rotate"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Generate', '生成'))}</span></button>
  <button type="button" data-inspector-action="clear-camera-motion-reference" ${node.asset ? '' : 'disabled'}><i class="fa-solid fa-eraser"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Clear', '清除'))}</span></button>
  <button type="button" data-inspector-action="view-media" ${node.asset ? '' : 'disabled'}><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'View', '查看'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtmlValue(ctx, translateValue(ctx, 'Delete', '删除'))}</span></button>
</div>`;
    }

    function normalizeParam(key, value, context) {
        if (key === 'motion_type') return MOTION_TYPES.some(item => item[0] === value) ? value : 'orbit';
        if (key === 'direction') return DIRECTIONS.some(item => item[0] === value) ? value : 'forward';
        if (!NUMERIC_LIMITS[key]) return value;
        const [min, max, step] = NUMERIC_LIMITS[key];
        let parsed = Number(value);
        if (!Number.isFinite(parsed)) parsed = defaultParams()[key];
        parsed = clampValue(context, parsed, min, max);
        if (key === 'fps') return Math.round(parsed);
        if (key === 'width' || key === 'height') return Math.max(64, Math.round(parsed / step) * step);
        return Math.round(parsed * 1000) / 1000;
    }

    function updateParam(nodeId, key, value, inputType, context) {
        const node = getNode(nodeId, context);
        if (!node || node.type !== 'camera_motion' || !key || call(context, 'isNodeLocked', false, node)) return;
        const next = normalizeParam(key, value, context);
        const current = Object.assign(defaultParams(), node.params || {})[key];
        if (String(current) === String(next)) return;
        call(context, 'pushHistoryBatch', null, `camera_motion:${nodeId}:${key}`, 'Edit Uni3C camera motion parameter');
        const nextParams = Object.assign(defaultParams(), node.params || {}, { [key]: next });
        const statePatch = { params: nextParams };
        const hadAsset = !!node.asset;
        if (hadAsset) {
            statePatch.asset = null;
            statePatch.status = buildStatus('idle', translateValue(context, 'Settings changed. Generate a new reference video.', '参数已变化，请重新生成参考视频。'), context);
        }
        Object.assign(node, call(context, 'buildCameraMotionStatePatch', statePatch, node, { statePatch }));
        call(context, 'scheduleSave', null);
        if (hadAsset || refreshTimers.has(nodeId)) {
            if (refreshTimers.has(nodeId)) {
                call(context, 'clearTimeout', null, refreshTimers.get(nodeId));
                refreshTimers.delete(nodeId);
            }
            const timer = call(context, 'setTimeout', null, () => {
                refreshTimers.delete(nodeId);
                call(context, 'mutate', null);
            }, 220);
            if (timer !== null && timer !== undefined) refreshTimers.set(nodeId, timer);
        }
    }

    function createNode(world, options, context) {
        const opts = options || {};
        if (opts.history !== false) call(context, 'pushHistory', null, 'Add Uni3C camera motion node');
        const size = call(context, 'defaultNodeSize', { w: 380, h: 680 }, 'camera_motion');
        const defaultSource = { kind: 'camera_motion_reference', module: 'enhanced.camera_motion_reference' };
        const defaultStatus = { state: 'idle', message: translateValue(context, 'Set the motion and generate a reference video.', '设置运镜参数后生成参考视频。') };
        const node = {
            id: call(context, 'uid', 'camotion-node', 'camotion'),
            type: 'camera_motion',
            x: world.x,
            y: world.y,
            w: size.w,
            h: size.h,
            title: opts.title || translateValue(context, 'Uni3C Camera Motion', 'Uni3C 运镜'),
            params: Object.assign(defaultParams(), opts.params || {}),
            asset: opts.asset || null,
            source: Object.assign(defaultSource, opts.source || {}),
            status: opts.status || defaultStatus
        };
        const initialState = {
            params: node.params,
            asset: node.asset,
            source: node.source,
            status: node.status
        };
        Object.assign(node, call(context, 'buildCameraMotionStatePatch', initialState, node, {
            defaults: {
                params: defaultParams(),
                asset: null,
                source: defaultSource,
                status: defaultStatus
            },
            initialState
        }));
        call(context, 'placeNodeAvoidingOverlap', null, node, world);
        const project = getProject(context);
        appendProjectNode(project, node, context);
        call(context, 'setSelectedNode', null, node.id);
        if (opts.render !== false) call(context, 'mutate', null);
        if (opts.toast !== false) call(context, 'showToast', null, translateValue(context, 'Uni3C Camera Motion node added', '已添加 Uni3C 运镜节点'));
        return node;
    }

    async function runNode(node, context) {
        const ctx = contextOf(context);
        if (!node || node.type !== 'camera_motion') return { ok: false, error: 'Uni3C Camera Motion node is unavailable' };
        if (call(ctx, 'isNodeLocked', false, node)) return { ok: false, error: 'node is locked' };
        if (call(ctx, 'isNodeIgnored', false, node)) return { ok: false, error: 'node is skipped' };
        if (String(node.status?.state || '').toLowerCase() === 'running') return { ok: false, error: 'already running' };
        if (typeof ctx.generateCameraMotionReference !== 'function') return { ok: false, error: 'camera motion API is unavailable' };

        call(ctx, 'pushHistory', null, 'Generate Uni3C camera motion reference');
        const runningPatch = {
            status: buildStatus('running', translateValue(ctx, 'Generating camera reference video...', '正在生成运镜参考视频…'), ctx)
        };
        Object.assign(node, call(ctx, 'buildCameraMotionStatePatch', runningPatch, node, { statePatch: runningPatch }));
        call(ctx, 'mutate', null);
        const response = await ctx.generateCameraMotionReference({
            project_id: getProject(ctx).id || (typeof ctx?.getProjectId === 'function' ? ctx.getProjectId() : '') || 'default',
            node_id: node.id,
            params: Object.assign(defaultParams(), node.params || {})
        });
        const current = getNode(node.id, ctx);
        if (!current) return response || { ok: false, error: 'node was removed' };
        if (response?.ok) {
            const ref = response.reference_video || response.asset_ref || {};
            const responseSettings = response.settings;
            const settings = Object.assign(defaultParams(), responseSettings || current.params || {});
            const persistedSettings = responseSettings || settings;
            const generatedAsset = call(ctx, 'buildVideoResponseAsset', null, {
                assetRef: ref,
                kind: 'generated_camera_motion_reference',
                mime: 'video/mp4',
                metadata: { camera_motion_settings: persistedSettings }
            });
            const successPatch = {
                params: settings,
                asset: generatedAsset,
                source: { settings: persistedSettings },
                status: buildStatus('finished', translateValue(ctx, 'Camera reference video generated.', '运镜参考视频已生成。'), ctx)
            };
            Object.assign(current, call(ctx, 'buildCameraMotionStatePatch', successPatch, current, {
                statePatch: successPatch,
                sourceSettings: persistedSettings
            }));
            call(ctx, 'setSelectedNode', null, current.id);
            call(ctx, 'mutate', null);
            call(ctx, 'showToast', null, translateValue(ctx, 'Camera reference video generated', '运镜参考视频已生成'));
        } else {
            const failurePatch = {
                status: buildStatus('failed', response?.details || response?.error || translateValue(ctx, 'Camera reference generation failed.', '运镜参考视频生成失败。'), ctx)
            };
            Object.assign(current, call(ctx, 'buildCameraMotionStatePatch', failurePatch, current, { statePatch: failurePatch }));
            call(ctx, 'mutate', null);
            call(ctx, 'showToast', null, `${translateValue(ctx, 'Camera reference failed', '运镜参考生成失败')}：${current.status.message}`);
        }
        return response;
    }

    function clearNode(node, context) {
        if (!node || node.type !== 'camera_motion' || call(context, 'isNodeLocked', false, node)) return false;
        call(context, 'pushHistory', null, 'Clear Uni3C camera motion reference');
        const clearPatch = {
            asset: null,
            status: buildStatus('idle', translateValue(context, 'Reference cleared. Generate a new video when needed.', '参考视频已清除，需要时可重新生成。'), context)
        };
        Object.assign(node, call(context, 'buildCameraMotionStatePatch', clearPatch, node, { statePatch: clearPatch }));
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
