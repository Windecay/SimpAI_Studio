(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const ASSETS = window.SimpAICanvasWorkbenchAssetNodes || {};
    const API = window.SimpAICanvasWorkbenchApi || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
    const t = UTILS.t || ((en, cn) => cn || en);
    const uid = UTILS.uid || ((prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`);
    const runningControllers = new Map();

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function getProject(context) {
        return context?.project && typeof context.project === 'object' ? context.project : { id: 'default', nodes: [], edges: [] };
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
        if (!node) return false;
        if (node.type === 'video') return true;
        if (node.type !== 'result') return false;
        const asset = selectedResultAsset(node, context) || {};
        return String(asset.mime || '').toLowerCase().startsWith('video/');
    }

    function sourceEdgeForNode(node, context) {
        const edges = Array.isArray(getProject(context).edges) ? getProject(context).edges : [];
        return edges.find(item => item.type === 'media' && item.to === node?.id && item.slot === 'source') || null;
    }

    function inputSourceForNode(node, context) {
        const edge = sourceEdgeForNode(node, context);
        const source = getNode(node?.input_node_id, context) || getNode(edge?.from, context);
        return isSource(source, context) ? source : null;
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
        if (asset?.duration) bits.push(`${asset.duration}s`);
        if (asset?.fps) bits.push(`${asset.fps} fps`);
        if (asset?.frame_count) bits.push(`${asset.frame_count} frames`);
        if (asset?.mime) bits.push(asset.mime);
        return bits;
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

    function renderNodeStateBadges(node, context) {
        return call(context, 'renderNodeStateBadges', '', node);
    }

    function notConnectedText(context) {
        return call(context, 'notConnectedText', t('Not connected', '未连接'));
    }

    function portHintText(context) {
        return call(context, 'portHintText', t('Double-click', '双击'));
    }

    function defaultParams() {
        return {
            prompt: '',
            score_threshold_detection: 0.5,
            new_det_thresh: 0.7,
            fill_hole_area: 16,
            recondition_every_nth_frame: 16,
            postprocess_strength: 0,
            invert_mask: false
        };
    }

    function isRunning(node) {
        return String(node?.status?.state || '').toLowerCase() === 'running' || runningControllers.has(node?.id || '');
    }

    function displayTitle(node) {
        const title = String(node?.title || '').trim();
        if (!title || title === 'SAM3 Video Mask' || title === 'SAM3 视频蒙版') {
            return t('SAM3 Video Mask', 'SAM3 视频蒙版');
        }
        return title;
    }

    function cloneValue(value, fallback) {
        if (typeof window.structuredClone === 'function') {
            try { return window.structuredClone(value ?? fallback); } catch (err) {}
        }
        try {
            return JSON.parse(JSON.stringify(value ?? fallback));
        } catch (err) {
            return fallback;
        }
    }

    function serializeAssetSourceForRun(node, context) {
        if (typeof context?.serializeAssetSourceForRun === 'function') return context.serializeAssetSourceForRun(node);
        if (typeof ASSETS.serializeAssetSourceForRun === 'function') {
            return ASSETS.serializeAssetSourceForRun(node, {
                getSelectedResultAsset: item => selectedResultAsset(item, context),
                cloneValue
            });
        }
        if (!node) return null;
        const asset = selectedResultAsset(node, context) || {};
        return {
            node_id: node.id,
            type: node.type,
            title: node.title || '',
            asset: typeof ASSETS.serializeAssetForRun === 'function' ? ASSETS.serializeAssetForRun(asset) : cloneValue(asset, {}),
            mask: typeof ASSETS.serializeMaskForRun === 'function' ? ASSETS.serializeMaskForRun(node.mask, `${node.title || node.id || 'image'}.mask.png`) : null,
            source: cloneValue(node.source || {}, {})
        };
    }

    function sourceMediaEditForRun(asset) {
        if (typeof ASSETS.mediaEditRange !== 'function') return null;
        const range = ASSETS.mediaEditRange(asset || {});
        if (!range?.clipped) return null;
        const start = Number(range.start || 0);
        const end = Number(range.end || 0);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
        return {
            trim_start: Math.round(start * 1000) / 1000,
            trim_end: Math.round(end * 1000) / 1000,
            duration: Math.round(Math.max(0, end - start) * 1000) / 1000,
            enabled: true
        };
    }

    function serializeSourceWithMediaEdit(source, context) {
        const payload = serializeAssetSourceForRun(source, context);
        const edit = sourceMediaEditForRun(selectedResultAsset(source, context));
        if (payload?.asset && edit) {
            payload.asset = Object.assign({}, payload.asset || {}, {
                edit: Object.assign({}, payload.asset.edit || {}, edit)
            });
        }
        return { payload, edit };
    }

    function projectId(context) {
        return getProject(context).id || context?.projectId || 'default';
    }

    function setSelectedNode(id, context) {
        call(context, 'setSelectedNode', null, id);
    }

    function notifyMaskReady(node, response, context, details) {
        if (typeof context?.onMaskReady !== 'function') return;
        try {
            const result = context.onMaskReady(node, response, details || {});
            if (result && typeof result.catch === 'function') {
                result.catch((err) => console.warn('[SimpAI Canvas] SAM3 mask ready callback failed', err));
            }
        } catch (err) {
            console.warn('[SimpAI Canvas] SAM3 mask ready callback failed', err);
        }
    }

    function notifyEditorClosed(node, context) {
        if (typeof context?.onEditorClosed !== 'function') return;
        try {
            context.onEditorClosed(node);
        } catch (err) {
            console.warn('[SimpAI Canvas] SAM3 editor close callback failed', err);
        }
    }

    function notifyMaskState(node, state, response, context, details) {
        if (typeof context?.onMaskState !== 'function') return;
        try {
            context.onMaskState(node, state, response || {}, details || {});
        } catch (err) {
            console.warn('[SimpAI Canvas] SAM3 mask state callback failed', err);
        }
    }

    function renderNodeHtml(node, context) {
        const params = node.params || {};
        const source = inputSourceForNode(node, context);
        const asset = node.asset || {};
        const src = assetDisplaySrc(asset, context);
        const info = readAssetInfo(asset || {}, context);
        const status = node.status?.message || '';
        const running = isRunning(node);
        const uploadedMask = !!(node.source?.mask_origin === 'upload' && asset && (asset.path || asset.preview_url || asset.data_url || asset.asset_relative_path || asset.relative_path));
        const maskAction = uploadedMask ? 'unload-sam3-mask' : 'upload-sam3-mask';
        const maskIcon = uploadedMask ? 'fa-eject' : 'fa-upload';
        const maskLabel = uploadedMask ? t('Unload Mask', '卸载蒙版') : t('Upload Mask', '上传蒙版');
        const maskTitle = uploadedMask ? t('Unload uploaded mask and return to generated output mode', '卸载上传蒙版，恢复为生成输出模式') : t('Upload prepared mask video/image', '上传已做好的蒙版视频 / 图片');
        return `
<div class="sai-node-head">
  <span class="sai-node-kind">SAM3</span>
  <span class="sai-node-title">${escapeHtml(displayTitle(node))}</span>
  ${renderNodeStateBadges(node, context)}
  ${running ? `<button type="button" data-node-action="stop-sam3-video-mask" title="${escapeHtml(t('Stop mask generation', '停止生成遮罩'))}"><i class="fa-solid fa-stop"></i></button>` : `<button type="button" data-node-action="run-sam3-video-mask" title="${escapeHtml(t('Generate mask video', '生成视频遮罩'))}"><i class="fa-solid fa-wand-magic-sparkles"></i></button>`}
  <button type="button" data-node-action="edit-sam3-points" title="${escapeHtml(t('Open point / box editor', '打开点选 / 框选编辑器'))}"><i class="fa-solid fa-crosshairs"></i></button>
  <button type="button" data-node-action="${maskAction}" title="${escapeHtml(maskTitle)}"><i class="fa-solid ${maskIcon}"></i></button>
  <button type="button" data-node-action="delete" title="${escapeHtml(t('Delete', '删除'))}"><i class="fa-solid fa-xmark"></i></button>
</div>
<div class="sai-text-input-row" data-sam3-video-row title="${escapeHtml(t('Double-click to upload a source video, or drag a video/result output here', '双击上传源视频，或拖入视频 / 结果输出'))}">
  <button type="button" class="sai-node-handle sai-node-handle-in" data-sam3-video-in title="${escapeHtml(t('Source video input', '源视频输入'))}"></button>
  <i class="fa-solid fa-film"></i><span>${escapeHtml(t('Source Video', '源视频'))}</span><b>${source ? escapeHtml(source.title || source.id) : escapeHtml(notConnectedText(context))}</b><small>${escapeHtml(portHintText(context))}</small>
</div>
<label class="sai-node-field sai-text-node-field"><span>${escapeHtml(t('Segmentation Prompt', '分割提示词'))}</span><input data-sam3-video-param="prompt" type="text" value="${escapeHtml(params.prompt || '')}" placeholder="${escapeHtml(t('person, dress, object...', '人物、裙子、物体...'))}"></label>
<div class="sai-node-field-row">
  <label><span>${escapeHtml(t('Detect Score', '检测分数'))}</span><input data-sam3-video-param="score_threshold_detection" type="number" min="0" max="1" step="0.05" value="${escapeHtml(params.score_threshold_detection ?? 0.5)}"></label>
  <label><span>${escapeHtml(t('New Det', '新检测'))}</span><input data-sam3-video-param="new_det_thresh" type="number" min="0" max="1" step="0.05" value="${escapeHtml(params.new_det_thresh ?? 0.7)}"></label>
</div>
<div class="sai-node-field-row">
  <label><span>${escapeHtml(t('Fill Hole', '填洞'))}</span><input data-sam3-video-param="fill_hole_area" type="number" min="0" max="512" step="1" value="${escapeHtml(params.fill_hole_area ?? 16)}"></label>
  <label><span>${escapeHtml(t('Recondition', '重检测间隔'))}</span><input data-sam3-video-param="recondition_every_nth_frame" type="number" min="1" max="128" step="1" value="${escapeHtml(params.recondition_every_nth_frame ?? 16)}"></label>
</div>
<div class="sai-node-field-row">
  <label><span>${escapeHtml(t('Smooth', '平滑'))}</span><input data-sam3-video-param="postprocess_strength" type="number" min="0" max="5" step="1" value="${escapeHtml(params.postprocess_strength ?? 0)}"></label>
  <label class="sai-node-check"><input data-sam3-video-param="invert_mask" type="checkbox" ${params.invert_mask ? 'checked' : ''}><span>${escapeHtml(t('Invert', '反相'))}</span></label>
</div>
<div class="sai-node-media sai-node-video-media"${mediaAspectStyle(asset, context)}>${src ? `<video src="${escapeHtml(src)}" muted preload="metadata" controls></video>` : `<div class="sai-node-empty">${escapeHtml(t('No mask video', '无视频遮罩'))}</div>`}</div>
${info.length ? `<div class="sai-node-info">${info.map(bit => `<span>${escapeHtml(bit)}</span>`).join('')}</div>` : ''}
${status ? `<div class="sai-node-foot">${escapeHtml(status)}</div>` : ''}
${running
    ? `<button type="button" class="sai-node-primary is-danger" data-node-action="stop-sam3-video-mask"><i class="fa-solid fa-stop"></i><span>${escapeHtml(t('Stop', '停止'))}</span></button>`
    : `<button type="button" class="sai-node-primary" data-node-action="run-sam3-video-mask"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(t('Generate Mask Video', '生成视频遮罩'))}</span></button>`}
<button type="button" class="sai-node-secondary" data-node-action="edit-sam3-points"><i class="fa-solid fa-crosshairs"></i><span>${escapeHtml(t('Point Editor', '点选编辑器'))}</span></button>
<button type="button" class="sai-node-secondary ${uploadedMask ? 'is-danger' : ''}" data-node-action="${maskAction}"><i class="fa-solid ${maskIcon}"></i><span>${escapeHtml(maskLabel)}</span></button>
<button type="button" class="sai-node-handle sai-node-handle-out" data-handle-out="video" title="${escapeHtml(t('Mask video output', '遮罩视频输出'))}"></button>`;
    }

    function renderInspector(node, context) {
        const source = inputSourceForNode(node, context);
        const info = readAssetInfo(node.asset || {}, context);
        return `
<div class="sai-inspector-section">
  <h3>${escapeHtml(t('SAM3 Video Mask', 'SAM3 视频蒙版'))}</h3>
  <label>${escapeHtml(t('Title', '标题'))}<input data-inspector-node-field="title" value="${escapeHtml(node.title || '')}"></label>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Source', '来源'))}</span><b>${escapeHtml(source?.title || source?.id || t('Not connected', '未连接'))}</b></div>
  <div class="sai-inspector-kv"><span>${escapeHtml(t('Output', '输出'))}</span><b>${escapeHtml(info.join(' / ') || t('No mask video generated', '尚未生成蒙版视频'))}</b></div>
  <p>${escapeHtml(t('Generate a black-white mask video, then connect this node to a scene preset SAM3 Mask Video slot.', '生成黑白视频遮罩，然后把该节点连接到 scene preset 的 SAM3 Mask Video 槽。'))}</p>
</div>
<div class="sai-inspector-actions">
  <button type="button" data-inspector-action="run-sam3-video-mask"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(t('Generate', '生成'))}</span></button>
  ${isRunning(node) ? `<button type="button" data-inspector-action="stop-sam3-video-mask" class="danger"><i class="fa-solid fa-stop"></i><span>${escapeHtml(t('Stop', '停止'))}</span></button>` : ''}
  <button type="button" data-inspector-action="view-media" ${node.asset ? '' : 'disabled'}><i class="fa-solid fa-magnifying-glass-plus"></i><span>${escapeHtml(t('View', '查看'))}</span></button>
  <button type="button" data-inspector-action="duplicate"><i class="fa-solid fa-copy"></i><span>${escapeHtml(t('Duplicate', '复制'))}</span></button>
  <button type="button" data-inspector-action="delete" class="danger"><i class="fa-solid fa-trash"></i><span>${escapeHtml(t('Delete', '删除'))}</span></button>
</div>`;
    }

    function updateParam(nodeId, key, value, inputType, context) {
        const node = getNode(nodeId, context);
        if (!node || node.type !== 'sam3_video_mask' || !key) return;
        if (call(context, 'isNodeLocked', false, node)) return;
        call(context, 'pushHistoryBatch', null, `sam3_video_mask:${nodeId}:${key}`, 'Edit SAM3 video mask parameter');
        node.params = node.params || {};
        if (inputType === 'checkbox') {
            node.params[key] = !!value;
        } else if (inputType === 'number' || ['score_threshold_detection', 'new_det_thresh', 'fill_hole_area', 'recondition_every_nth_frame', 'postprocess_strength'].includes(key)) {
            const parsed = Number(value);
            node.params[key] = Number.isFinite(parsed) ? parsed : value;
        } else {
            node.params[key] = value;
        }
        call(context, 'scheduleSave', null);
    }

    function createNode(world, options, context) {
        const opts = options || {};
        if (opts.history !== false) call(context, 'pushHistory', null, 'Add SAM3 video mask node');
        const size = call(context, 'defaultNodeSize', { w: 360, h: 560 }, 'sam3_video_mask');
        const node = {
            id: uid('sam3v'),
            type: 'sam3_video_mask',
            x: world.x,
            y: world.y,
            w: size.w,
            h: size.h,
            title: opts.title || t('SAM3 Video Mask', 'SAM3 视频蒙版'),
            input_node_id: opts.input_node_id || null,
            params: Object.assign(defaultParams(), opts.params || {}),
            asset: opts.asset || null,
            source: { kind: 'sam3_video_mask', module: 'enhanced.sam3_video_mask' },
            status: {
                state: 'idle',
                message: 'Connect a source video, enter a target prompt, then generate a mask video.'
            }
        };
        call(context, 'placeNodeAvoidingOverlap', null, node, world);
        const project = getProject(context);
        if (!Array.isArray(project.nodes)) project.nodes = [];
        project.nodes.push(node);
        setSelectedNode(node.id, context);
        if (opts.render !== false) call(context, 'mutate', null);
        if (opts.toast !== false) call(context, 'showToast', null, t('SAM3 Video Mask node added', '已添加 SAM3 视频蒙版节点'));
        return node;
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('read_failed'));
            reader.onload = () => resolve(String(reader.result || ''));
            reader.readAsDataURL(file);
        });
    }

    function getImageDimensions(src) {
        return new Promise((resolve) => {
            if (!src) {
                resolve({ width: null, height: null });
                return;
            }
            const image = new Image();
            image.onload = () => resolve({ width: image.naturalWidth || image.width || null, height: image.naturalHeight || image.height || null });
            image.onerror = () => resolve({ width: null, height: null });
            image.src = src;
        });
    }

    function getMediaMetadata(src, type) {
        return new Promise((resolve) => {
            if (!src) {
                resolve({ width: null, height: null, duration: null, fps: null, frame_count: null });
                return;
            }
            const media = document.createElement(type === 'video' ? 'video' : 'audio');
            media.preload = 'metadata';
            media.onloadedmetadata = () => {
                resolve({
                    width: media.videoWidth || null,
                    height: media.videoHeight || null,
                    duration: Number.isFinite(media.duration) ? Math.round(media.duration * 100) / 100 : null,
                    fps: null,
                    frame_count: null
                });
            };
            media.onerror = () => resolve({ width: null, height: null, duration: null, fps: null, frame_count: null });
            media.src = src;
        });
    }

    async function generateSam3VideoMask(payload, options) {
        if (typeof API.generateSam3VideoMask !== 'function') {
            return { ok: false, error: t('SAM3 video mask API is unavailable', 'SAM3 视频蒙版 API 不可用') };
        }
        return API.generateSam3VideoMask(Object.assign({}, payload || {}, { signal: options?.signal }));
    }

    async function cancelSam3VideoMask(payload) {
        if (typeof API.cancelSam3VideoMask !== 'function') {
            return { ok: false, error: t('SAM3 cancel API is unavailable', 'SAM3 取消 API 不可用') };
        }
        return API.cancelSam3VideoMask(payload);
    }

    async function normalizeSam3MaskVideo(payload) {
        if (typeof API.normalizeSam3MaskVideo !== 'function') {
            return { ok: false, error: t('SAM3 mask upload API is unavailable', 'SAM3 蒙版上传 API 不可用') };
        }
        return API.normalizeSam3MaskVideo(payload);
    }

    function openPointEditor(node, context) {
        if (!node || node.type !== 'sam3_video_mask') return;
        const source = inputSourceForNode(node, context);
        if (!source || !isSource(source, context)) {
            call(context, 'showToast', null, 'Connect a source video/result node first.');
            return;
        }
        const asset = selectedResultAsset(source, context);
        const src = assetDisplaySrc(asset || {}, context);
        if (!src) {
            call(context, 'showToast', null, 'The connected source has no playable video asset.');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal';
        const theme = call(context, 'detectWorkbenchTheme', '', null);
        modal.classList.toggle('theme-dark', theme === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-sam3-editor">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(t('SAM3 Point Editor', 'SAM3 点选编辑器'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-sam3-toolbar">
    <button type="button" data-sam3-mode="point" class="is-active"><i class="fa-solid fa-location-dot"></i><span>${escapeHtml(t('Point', '点选'))}</span></button>
    <button type="button" data-sam3-mode="box"><i class="fa-regular fa-square"></i><span>${escapeHtml(t('Box', '框选'))}</span></button>
    <button type="button" data-sam3-clear><i class="fa-solid fa-eraser"></i><span>${escapeHtml(t('Clear', '清空'))}</span></button>
  </div>
  <div class="sai-sam3-stage">
    <video data-sam3-editor-video src="${escapeHtml(src)}" muted playsinline preload="metadata"></video>
    <canvas data-sam3-editor-canvas></canvas>
  </div>
  <div class="sai-sam3-footer">
    <input data-sam3-time type="range" min="0" max="1000" value="0">
    <span data-sam3-time-label>0.00s</span>
    <button type="button" class="sai-node-primary" data-sam3-generate><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(t('Generate', '生成'))}</span></button>
  </div>
</div>`;
        call(context, 'ensureWorkbenchFormFieldNames', null, modal, `sam3_point_${node.id || 'node'}`);
        document.body.appendChild(modal);

        const video = modal.querySelector('[data-sam3-editor-video]');
        const canvas = modal.querySelector('[data-sam3-editor-canvas]');
        const ctx = canvas?.getContext?.('2d');
        const timeSlider = modal.querySelector('[data-sam3-time]');
        const timeLabel = modal.querySelector('[data-sam3-time-label]');
        const state = {
            mode: 'point',
            positive: [],
            negative: [],
            box: null,
            boxDraft: null,
            duration: 0,
            width: 0,
            height: 0,
            drawingBox: false
        };

        const setMode = (mode) => {
            state.mode = mode === 'box' ? 'box' : 'point';
            modal.querySelectorAll('[data-sam3-mode]').forEach(button => {
                button.classList.toggle('is-active', button.getAttribute('data-sam3-mode') === state.mode);
            });
        };
        const canvasPoint = (evt) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: clamp((evt.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
                y: clamp((evt.clientY - rect.top) / Math.max(1, rect.height), 0, 1)
            };
        };
        const drawPoint = (point, color) => {
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, Math.max(6, canvas.width * 0.008), 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0,0,0,0.72)';
            ctx.stroke();
        };
        const drawBox = (box, color) => {
            if (!box) return;
            const x0 = box.x0 * canvas.width;
            const y0 = box.y0 * canvas.height;
            const x1 = box.x1 * canvas.width;
            const y1 = box.y1 * canvas.height;
            const x = Math.min(x0, x1);
            const y = Math.min(y0, y1);
            const w = Math.abs(x1 - x0);
            const h = Math.abs(y1 - y0);
            if (w < 2 || h < 2) return;
            ctx.fillStyle = 'rgba(20,184,166,0.14)';
            ctx.fillRect(x, y, w, h);
            ctx.lineWidth = Math.max(2, canvas.width * 0.003);
            ctx.strokeStyle = color;
            ctx.strokeRect(x, y, w, h);
        };
        const draw = () => {
            if (!ctx || !video || !state.width || !state.height) return;
            canvas.width = state.width;
            canvas.height = state.height;
            try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            } catch (err) {
                ctx.fillStyle = '#05070a';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            state.positive.forEach(point => drawPoint(point, '#70ff81'));
            state.negative.forEach(point => drawPoint(point, '#ff6b6b'));
            drawBox(state.box, 'rgba(45,212,191,1)');
            drawBox(state.boxDraft, 'rgba(45,212,191,0.9)');
        };
        const seekTo = (time, skipSlider) => {
            const duration = Math.max(0, Number(state.duration || 0));
            const next = clamp(Number(time || 0), 0, duration || 0);
            if (timeLabel) timeLabel.textContent = `${next.toFixed(2)}s`;
            if (timeSlider && !skipSlider) timeSlider.value = duration > 0 ? String(Math.round((next / duration) * 1000)) : '0';
            try {
                video.currentTime = next;
            } catch (err) {
                draw();
            }
        };

        video.addEventListener('loadedmetadata', () => {
            state.duration = Number.isFinite(video.duration) ? video.duration : 0;
            state.width = video.videoWidth || asset?.width || 640;
            state.height = video.videoHeight || asset?.height || 360;
            seekTo(0);
        });
        video.addEventListener('seeked', draw);
        video.addEventListener('loadeddata', draw);
        timeSlider?.addEventListener('input', () => {
            const value = Number(timeSlider.value || 0) / 1000;
            seekTo(value * Math.max(0, state.duration || 0), true);
        });
        canvas?.addEventListener('contextmenu', (evt) => evt.preventDefault());
        canvas?.addEventListener('pointerdown', (evt) => {
            evt.preventDefault();
            const point = canvasPoint(evt);
            if (state.mode === 'box') {
                if (evt.button === 2) {
                    state.box = null;
                    state.boxDraft = null;
                    draw();
                    return;
                }
                state.drawingBox = true;
                state.boxDraft = { x0: point.x, y0: point.y, x1: point.x, y1: point.y };
                try { canvas.setPointerCapture(evt.pointerId); } catch (err) {}
                draw();
                return;
            }
            if (evt.button === 2) state.negative.push(point);
            else state.positive.push(point);
            draw();
        });
        canvas?.addEventListener('pointermove', (evt) => {
            if (!state.drawingBox || state.mode !== 'box' || !state.boxDraft) return;
            const point = canvasPoint(evt);
            state.boxDraft.x1 = point.x;
            state.boxDraft.y1 = point.y;
            draw();
        });
        const finishBox = () => {
            if (!state.drawingBox) return;
            state.drawingBox = false;
            if (state.boxDraft) {
                const box = state.boxDraft;
                state.boxDraft = null;
                if (Math.abs(box.x1 - box.x0) > 0.002 && Math.abs(box.y1 - box.y0) > 0.002) state.box = box;
            }
            draw();
        };
        canvas?.addEventListener('pointerup', finishBox);
        canvas?.addEventListener('pointercancel', finishBox);
        modal.querySelectorAll('[data-sam3-mode]').forEach(button => {
            button.addEventListener('click', () => setMode(button.getAttribute('data-sam3-mode')));
        });
        modal.querySelector('[data-sam3-clear]')?.addEventListener('click', () => {
            state.positive = [];
            state.negative = [];
            state.box = null;
            state.boxDraft = null;
            draw();
        });
        modal.querySelector('[data-sam3-generate]')?.addEventListener('click', () => {
            const payload = {
                frame_time: Number(video.currentTime || 0),
                positive_coords: state.positive.map(point => ({ x: point.x, y: point.y })),
                negative_coords: state.negative.map(point => ({ x: point.x, y: point.y })),
                bbox: state.box ? { x0: state.box.x0, y0: state.box.y0, x1: state.box.x1, y1: state.box.y1 } : null
            };
            if (!payload.positive_coords.length && !payload.negative_coords.length && !payload.bbox) {
                call(context, 'showToast', null, 'Mark at least one point or box first.');
                return;
            }
            const current = getNode(node.id, context);
            if (current) {
                current.params = Object.assign({}, current.params || {}, {
                    editor_payload: JSON.stringify(payload),
                    segmentation_mode: 'points'
                });
            }
            modal.remove();
            if (current) runNode(current, { editorPayload: JSON.stringify(payload) }, context);
        });
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) {
                modal.remove();
                notifyEditorClosed(getNode(node.id, context) || node, context);
            }
        });
    }

    async function runNode(node, options, context) {
        if (!node || node.type !== 'sam3_video_mask') return { ok: false, error: t('SAM3 Video Mask node is unavailable', 'SAM3 视频蒙版节点不可用') };
        const opts = options || {};
        if (isRunning(node)) {
            call(context, 'showToast', null, t('SAM3 mask generation is already running.', 'SAM3 蒙版正在生成。'));
            return { ok: false, error: t('SAM3 mask generation is already running.', 'SAM3 蒙版正在生成。') };
        }
        if (call(context, 'isNodeIgnored', false, node)) {
            call(context, 'showToast', null, t('This SAM3 Video Mask node is marked as skipped.', '该 SAM3 视频蒙版节点已标记为跳过。'));
            return { ok: false, error: t('SAM3 Video Mask node is skipped', 'SAM3 视频蒙版节点已跳过') };
        }
        const source = inputSourceForNode(node, context);
        if (!source || !isSource(source, context)) {
            call(context, 'showToast', null, t('Connect a source video/result node first.', '请先连接源视频或 Result 节点。'));
            return { ok: false, error: t('Connect a source video/result node first.', '请先连接源视频或 Result 节点。') };
        }
        const asset = selectedResultAsset(source, context);
        if (!asset) {
            call(context, 'showToast', null, t('The connected source has no video asset.', '已连接的来源没有视频素材。'));
            return { ok: false, error: t('The connected source has no video asset.', '已连接的来源没有视频素材。') };
        }
        const editorPayload = String(opts.editorPayload || node.params?.editor_payload || '').trim();
        if (!String(node.params?.prompt || '').trim() && !editorPayload) {
            call(context, 'showToast', null, t('Enter a SAM3 prompt, or open Point Editor and mark a target.', '请输入 SAM3 提示词，或打开点选编辑器标记目标。'));
            return { ok: false, error: t('SAM3 prompt/editor payload is empty.', 'SAM3 提示词和编辑器数据为空。') };
        }
        call(context, 'pushHistory', null, t('Generate SAM3 video mask', '生成 SAM3 视频蒙版'));
        node.input_node_id = source.id;
        node.status = { state: 'running', message: t('Generating SAM3 mask video...', '正在生成 SAM3 蒙版视频...') };
        call(context, 'mutate', null);
        const controller = new AbortController();
        runningControllers.set(node.id, controller);
        const params = cloneValue(node.params || {}, {});
        const sourcePayload = serializeSourceWithMediaEdit(source, context);
        if (editorPayload) {
            params.editor_payload = editorPayload;
            params.segmentation_mode = 'points';
        }
        if (sourcePayload.edit) params.source_edit = sourcePayload.edit;
        const requestPayload = {
            project_id: projectId(context),
            node_id: node.id,
            asset_source: sourcePayload.payload,
            params
        };
        let response = null;
        try {
            response = await generateSam3VideoMask(requestPayload, { signal: controller.signal });
        } finally {
            runningControllers.delete(node.id);
        }
        const current = getNode(node.id, context);
        if (!current) return response || { ok: false, error: t('SAM3 Video Mask node was removed', 'SAM3 视频蒙版节点已被删除') };
        if (response?.ok) {
            const ref = response.mask_video || response.asset_ref || {};
            current.asset = Object.assign({}, ref, {
                kind: ref.kind || 'generated_sam3_mask_video',
                mime: ref.mime || 'video/mp4',
                path: ref.path || '',
                preview_url: ref.preview_url || ''
            });
            current.status = {
                state: 'finished',
                message: t('SAM3 mask video generated.', 'SAM3 蒙版视频已生成。')
            };
            current.source = Object.assign({}, current.source || {}, {
                source_node_id: source.id,
                prompt: current.params?.prompt || '',
                mask_origin: editorPayload ? 'generated_points' : 'generated_prompt'
            });
            setSelectedNode(current.id, context);
            call(context, 'mutate', null);
            call(context, 'showToast', null, t('SAM3 mask video generated', 'SAM3 蒙版视频已生成'));
            notifyMaskReady(current, response, context, { origin: editorPayload ? 'generated_points' : 'generated_prompt' });
        } else if (response?.cancelled || controller.signal.aborted) {
            current.status = {
                state: 'cancelled',
                message: response?.error || t('SAM3 mask generation stopped.', 'SAM3 蒙版生成已停止。')
            };
            call(context, 'mutate', null);
            call(context, 'showToast', null, t('SAM3 mask generation stopped.', 'SAM3 蒙版生成已停止。'));
            notifyMaskState(current, 'cancelled', response, context, { origin: 'generate' });
        } else {
            current.status = {
                state: 'failed',
                message: response?.details || response?.error || t('SAM3 video mask generation failed.', 'SAM3 视频蒙版生成失败。')
            };
            call(context, 'mutate', null);
            call(context, 'showToast', null, t(`SAM3 mask failed: ${current.status.message}`, `SAM3 蒙版失败：${current.status.message}`));
            notifyMaskState(current, 'failed', response, context, { origin: 'generate' });
        }
        return response;
    }

    async function stopNode(node, context) {
        if (!node || node.type !== 'sam3_video_mask') return { ok: false, error: t('SAM3 Video Mask node is unavailable', 'SAM3 视频蒙版节点不可用') };
        const controller = runningControllers.get(node.id);
        if (controller && !controller.signal.aborted) controller.abort();
        const response = await cancelSam3VideoMask({
            project_id: projectId(context),
            node_id: node.id
        });
        const current = getNode(node.id, context);
        if (current) {
            current.status = {
                state: 'cancelled',
                message: t('SAM3 stop requested.', '已请求停止 SAM3。')
            };
            call(context, 'mutate', null);
            notifyMaskState(current, 'cancelled', response, context, { origin: 'stop' });
        }
        call(context, 'showToast', null, t('SAM3 stop requested.', '已请求停止 SAM3。'));
        return response;
    }

    async function uploadMaskForNode(node, context) {
        if (!node || node.type !== 'sam3_video_mask') return { ok: false, error: t('SAM3 Video Mask node is unavailable', 'SAM3 视频蒙版节点不可用') };
        if (call(context, 'isNodeLocked', false, node)) return { ok: false, error: t('node is locked', '节点已锁定') };
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*,image/*';
        input.style.display = 'none';
        document.body.appendChild(input);
        const file = await new Promise((resolve) => {
            input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null), { once: true });
            input.click();
        });
        input.remove();
        if (!file) return { ok: false, error: t('no file selected', '未选择文件') };

        const dataUrl = await readFileAsDataUrl(file);
        const mime = file.type || (/\.(png|jpg|jpeg|webp|bmp)$/i.test(file.name || '') ? 'image/png' : 'video/mp4');
        const isImage = String(mime).toLowerCase().startsWith('image/');
        const meta = isImage ? await getImageDimensions(dataUrl) : await getMediaMetadata(dataUrl, 'video');
        const source = inputSourceForNode(node, context);
        if (isImage && (!source || !isSource(source, context))) {
            call(context, 'showToast', null, t('Connect a source video before uploading an image mask.', '上传图片蒙版前请先连接源视频。'));
            return { ok: false, error: t('Connect a source video before uploading an image mask.', '上传图片蒙版前请先连接源视频。') };
        }

        call(context, 'pushHistory', null, t('Upload SAM3 mask video', '上传 SAM3 蒙版视频'));
        if (source && isSource(source, context)) node.input_node_id = source.id;
        node.status = { state: 'running', message: t('Normalizing uploaded mask...', '正在处理上传的蒙版...') };
        call(context, 'mutate', null);
        const sourcePayload = source && isSource(source, context) ? serializeSourceWithMediaEdit(source, context) : { payload: null, edit: null };
        const response = await normalizeSam3MaskVideo({
            project_id: projectId(context),
            node_id: node.id,
            asset_source: sourcePayload.payload,
            params: sourcePayload.edit ? { source_edit: sourcePayload.edit } : {},
            mask_source: {
                node_id: node.id,
                type: isImage ? 'image' : 'video',
                title: file.name || 'uploaded mask',
                asset: {
                    kind: 'browser_upload',
                    name: file.name || 'uploaded_mask',
                    mime,
                    size: file.size || null,
                    width: meta.width || null,
                    height: meta.height || null,
                    duration: meta.duration || null,
                    data_url: dataUrl
                }
            }
        });
        const current = getNode(node.id, context);
        if (!current) return response || { ok: false, error: t('SAM3 Video Mask node was removed', 'SAM3 视频蒙版节点已被删除') };
        if (response?.ok) {
            const ref = response.mask_video || response.asset_ref || {};
            current.asset = Object.assign({}, ref, {
                kind: ref.kind || 'uploaded_sam3_mask_video',
                mime: ref.mime || 'video/mp4',
                path: ref.path || '',
                preview_url: ref.preview_url || ''
            });
            current.status = {
                state: 'finished',
                message: response.matched_to_source
                    ? t('Uploaded mask matched to source frames.', '上传的蒙版已匹配源视频帧。')
                    : t('Uploaded mask video attached.', '已挂载上传的蒙版视频。')
            };
            current.source = Object.assign({}, current.source || {}, {
                source_node_id: source?.id || current.source?.source_node_id || '',
                uploaded_mask_name: file.name || '',
                mask_origin: 'upload'
            });
            setSelectedNode(current.id, context);
            call(context, 'mutate', null);
            call(context, 'showToast', null, current.status.message);
            notifyMaskReady(current, response, context, { origin: 'upload' });
        } else {
            current.status = {
                state: 'failed',
                message: response?.details || response?.error || t('Uploaded mask normalization failed.', '上传的蒙版处理失败。')
            };
            call(context, 'mutate', null);
            call(context, 'showToast', null, t(`SAM3 mask upload failed: ${current.status.message}`, `SAM3 蒙版上传失败：${current.status.message}`));
            notifyMaskState(current, 'failed', response, context, { origin: 'upload' });
        }
        return response;
    }

    function unloadMaskForNode(node, context) {
        if (!node || node.type !== 'sam3_video_mask') return false;
        if (call(context, 'isNodeLocked', false, node)) {
            call(context, 'showToast', null, t('Locked node cannot be edited', '锁定的节点无法编辑'));
            return false;
        }
        if (!node.asset && node.source?.mask_origin !== 'upload') {
            call(context, 'showToast', null, t('No uploaded SAM3 mask to unload.', '没有可卸载的 SAM3 上传蒙版。'));
            return false;
        }
        call(context, 'pushHistory', null, t('Unload SAM3 uploaded mask', '卸载 SAM3 上传蒙版'));
        node.asset = null;
        node.source = Object.assign({}, node.source || {}, {
            uploaded_mask_name: '',
            mask_origin: ''
        });
        node.status = {
            state: 'idle',
            message: t('Uploaded mask unloaded. Generate a mask or upload another one.', '上传的蒙版已卸载，请生成或上传新的蒙版。')
        };
        call(context, 'mutate', null);
        call(context, 'showToast', null, t('Uploaded SAM3 mask unloaded.', '已卸载上传的 SAM3 蒙版。'));
        return true;
    }

    window.SimpAICanvasWorkbenchSam3VideoMaskNode = {
        createNode,
        defaultParams,
        inputSourceForNode,
        isSource,
        openPointEditor,
        renderInspector,
        renderNodeHtml,
        runNode,
        stopNode,
        unloadMaskForNode,
        updateParam,
        uploadMaskForNode
    };
})();
