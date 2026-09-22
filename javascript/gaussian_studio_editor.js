(function () {
    'use strict';

    const API = window.SimpAICanvasWorkbenchApi || {};
    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const ASSETS = window.SimpAICanvasWorkbenchAssetNodes || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const t = UTILS.t || ((en, cn) => cn || en);

    const VIEWER_VERSION = 'gaussian-default-scale-20260530-2';
    const DEFAULT_VIEWER_URL = `/gaussian-studio/vendor/viewer_gaussian_v2.html?v=${VIEWER_VERSION}`;
    const DEFAULT_GAUSSIAN_PRECISION = 'auto';
    const VALID_GAUSSIAN_PRECISIONS = new Set(['auto', 'bf16', 'fp16', 'fp32']);
    let modal = null;
    let state = null;
    let pendingRender = null;
    let pendingCameraCapture = null;
    let sceneBridgeOpen = false;
    let sceneBridgeCache = null;
    let backdropPointerStarted = false;
    let viewerContextGuardActive = false;
    let viewerContextGuardUntil = 0;

    function postJson(endpoint, payload) {
        if (typeof API.postJson === 'function') return API.postJson(endpoint, payload || {});
        return fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {})
        }).then(async (response) => {
            const data = await response.json().catch(() => null);
            if (!response.ok) return Object.assign({ ok: false, error: `HTTP ${response.status}` }, data || {});
            return data || { ok: false, error: 'empty response' };
        }).catch((err) => ({ ok: false, error: err?.message || String(err || 'request failed') }));
    }

    function gaussianStatus(payload) {
        return typeof API.gaussianStudioStatus === 'function'
            ? API.gaussianStudioStatus(payload || {})
            : postJson('/gaussian-studio/status', payload || {});
    }

    function gaussianPredict(payload) {
        return typeof API.gaussianStudioPredict === 'function'
            ? API.gaussianStudioPredict(payload || {})
            : postJson('/gaussian-studio/predict', payload || {});
    }

    function gaussianExport(payload) {
        return typeof API.gaussianStudioExport === 'function'
            ? API.gaussianStudioExport(payload || {})
            : postJson('/gaussian-studio/canvas/export', payload || {});
    }

    function call(fn, fallback, ...args) {
        return typeof fn === 'function' ? fn(...args) : fallback;
    }

    function assetDisplaySrc(asset, fallback) {
        if (!asset || typeof asset !== 'object') return fallback || '';
        if (typeof ASSETS.assetDisplaySrc === 'function') return ASSETS.assetDisplaySrc(asset) || fallback || '';
        return asset.preview_url || asset.data_url || asset.thumb || fallback || '';
    }

    function assetUrl(asset) {
        if (!asset || typeof asset !== 'object') return '';
        return asset.preview_url || asset.data_url || asset.url || '';
    }

    function hasPly(target) {
        const current = target || state || {};
        const ply = current.plyAsset || current.ply_asset || {};
        return !!(ply.preview_url || ply.path || ply.output_path || ply.data_url || current.plyPath || current.ply_path);
    }

    function hasReference(target) {
        const current = target || state || {};
        const ref = current.referenceAsset || current.reference_asset || {};
        return !!(current.referenceAssetSource || current.referenceDataUrl || current.reference_data_url || current.referenceSrc || current.reference_src || ref.preview_url || ref.path || ref.output_path || ref.data_url);
    }

    function hasCameraState(cameraState) {
        return !!(cameraState && typeof cameraState === 'object' && (cameraState.position || cameraState.target || cameraState.fx || cameraState.fy));
    }

    function compactSignatureParts(parts) {
        return (parts || []).map(value => String(value || '').trim()).filter(Boolean).join('|');
    }

    function dataUrlSignature(value) {
        const text = String(value || '');
        if (!text) return '';
        if (!text.startsWith('data:')) return text;
        return compactSignatureParts(['data', text.length, text.slice(0, 96), text.slice(-96)]);
    }

    function imagePixelSignature(dataUrl) {
        return new Promise((resolve) => {
            if (!dataUrl || !String(dataUrl).startsWith('data:')) return resolve('');
            const img = new Image();
            img.onload = () => {
                try {
                    const width = img.naturalWidth || img.width || 0;
                    const height = img.naturalHeight || img.height || 0;
                    if (!width || !height) return resolve('');
                    const canvas = document.createElement('canvas');
                    canvas.width = 24;
                    canvas.height = 24;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    if (!ctx) return resolve('');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                    let hash = 2166136261;
                    for (let i = 0; i < pixels.length; i += 4) {
                        hash ^= pixels[i];
                        hash = Math.imul(hash, 16777619);
                        hash ^= pixels[i + 1];
                        hash = Math.imul(hash, 16777619);
                        hash ^= pixels[i + 2];
                        hash = Math.imul(hash, 16777619);
                    }
                    resolve(compactSignatureParts(['img', `${width}x${height}`, (hash >>> 0).toString(16)]));
                } catch (err) {
                    resolve('');
                }
            };
            img.onerror = () => resolve('');
            img.src = dataUrl;
        });
    }

    function assetSignature(asset) {
        if (!asset || typeof asset !== 'object') return '';
        return compactSignatureParts([
            asset.asset_id,
            asset.asset_relative_path || asset.relative_path,
            asset.path,
            asset.output_path,
            asset.original_output_path,
            asset.preview_url,
            asset.thumb,
            asset.name,
            asset.size,
            asset.width && asset.height ? `${asset.width}x${asset.height}` : '',
            dataUrlSignature(asset.data_url)
        ]);
    }

    function sourceSignature(source) {
        if (!source || typeof source !== 'object') return '';
        return compactSignatureParts([
            'source',
            source.node_id,
            source.type,
            assetSignature(source.asset || null),
            source.mask ? assetSignature(source.mask) : ''
        ]);
    }

    function referenceSignatureFrom(target) {
        const current = target || state || {};
        const referenceAsset = current.referenceAsset || current.reference_asset || null;
        const referenceAssetSource = current.referenceAssetSource || current.reference_asset_source || null;
        const sourceSig = sourceSignature(referenceAssetSource);
        const assetSig = assetSignature(referenceAsset);
        const captureSig = current.referenceCaptureSignature || current.reference_capture_signature || '';
        const dataSig = current.referenceDataSignature || current.reference_data_signature || dataUrlSignature(current.referenceDataUrl || current.reference_data_url || '');
        const inlineSig = captureSig || dataSig || ((current.sceneBridge || current.scene_bridge) ? '' : (current.referenceSrc || current.reference_src || ''));
        return compactSignatureParts([
            (current.sceneBridge || current.scene_bridge) ? (inlineSig || sourceSig || assetSig) : (sourceSig || assetSig || inlineSig),
            current.referenceWidth || current.reference_width || '',
            current.referenceHeight || current.reference_height || ''
        ]);
    }

    function currentReferenceSignature() {
        return referenceSignatureFrom(state);
    }

    function referenceSignatureMatches(previousSignature, nextSignature) {
        if (!previousSignature || previousSignature === nextSignature) return true;
        if (!state) return false;
        const alternatives = [
            state.referenceCaptureSignature,
            state.referenceDataSignature,
            dataUrlSignature(state.referenceDataUrl || ''),
            nextSignature
        ].filter(Boolean);
        return alternatives.includes(previousSignature);
    }

    function referenceEvidenceMatches(previousCapture, previousData, nextCapture, nextData) {
        if (previousCapture && nextCapture) return previousCapture === nextCapture;
        if (previousData && nextData) return previousData === nextData;
        return false;
    }

    function cachePayload(includeDataUrl) {
        if (!state) return {};
        const params = readParams();
        const referenceSignature = currentReferenceSignature() || state.referenceSignature || '';
        if (referenceSignature) state.referenceSignature = referenceSignature;
        return {
            reference_asset: state.referenceAsset || null,
            reference_src: state.referenceSrc || '',
            reference_data_url: includeDataUrl ? (state.referenceDataUrl || '') : '',
            reference_signature: referenceSignature || '',
            reference_capture_signature: state.referenceCaptureSignature || '',
            reference_data_signature: state.referenceDataSignature || dataUrlSignature(state.referenceDataUrl || ''),
            reference_width: state.referenceWidth || null,
            reference_height: state.referenceHeight || null,
            ply_asset: state.plyAsset || null,
            ply_path: state.plyPath || '',
            render_asset: state.renderAsset || null,
            output_asset: state.renderAsset || null,
            camera_state: state.cameraState || {},
            extrinsics: state.extrinsics || null,
            intrinsics: state.intrinsics || null,
            params,
            updated_at: new Date().toISOString()
        };
    }

    function persistCache(reason, options) {
        if (!state) return;
        const payload = cachePayload(!!options?.includeDataUrl);
        if (sceneBridgeOpen) {
            sceneBridgeCache = Object.assign({}, sceneBridgeCache || {}, payload);
            setBridgeValue('gaussian_studio_scene_state', JSON.stringify(sceneBridgeCache));
        }
        state.cachedReferenceSignature = payload.reference_signature || state.cachedReferenceSignature || '';
        state.cachedReferenceCaptureSignature = payload.reference_capture_signature || state.cachedReferenceCaptureSignature || '';
        state.cachedReferenceDataSignature = payload.reference_data_signature || state.cachedReferenceDataSignature || '';
        if (typeof state.onStateChange === 'function') state.onStateChange(payload, reason || 'cache');
    }

    function setBusy(busy, message) {
        if (!modal) return;
        modal.classList.toggle('is-busy', !!busy);
        modal.querySelectorAll('[data-gaussian-action]').forEach((button) => {
            const action = button.getAttribute('data-gaussian-action');
            if (action !== 'close') button.disabled = !!busy;
        });
        if (message) setStatus(message);
    }

    function setStatus(message, isError) {
        if (!modal) return;
        const box = modal.querySelector('[data-gaussian-status]');
        if (!box) return;
        box.textContent = String(message || '');
        box.classList.toggle('is-error', !!isError);
    }

    function readParams() {
        if (!modal) return {};
        const precision = normalizePrecision(modal.querySelector('[data-gaussian-param="precision"]')?.value);
        const focal = Number(modal.querySelector('[data-gaussian-param="focal_length_mm"]')?.value || 30);
        const resolution = Number(modal.querySelector('[data-gaussian-param="resolution"]')?.value || 1024);
        const aspectRatio = modal.querySelector('[data-gaussian-param="aspect_ratio"]')?.value || 'source';
        return {
            precision,
            focal_length_mm: Number.isFinite(focal) ? focal : 30,
            resolution: Number.isFinite(resolution) ? resolution : 1024,
            aspect_ratio: aspectRatio
        };
    }

    function normalizePrecision(value) {
        const precision = String(value || '').trim().toLowerCase();
        if (!precision || !VALID_GAUSSIAN_PRECISIONS.has(precision)) return DEFAULT_GAUSSIAN_PRECISION;
        return precision;
    }

    function normalizeParams(params) {
        const next = Object.assign({}, params && typeof params === 'object' ? params : {});
        next.precision = normalizePrecision(next.precision);
        return next;
    }

    function sourceOutputSize(params) {
        if (!state || !state.sceneBridge || params?.aspect_ratio !== 'source') return {};
        const width = Math.round(Number(state.referenceWidth || 0));
        const height = Math.round(Number(state.referenceHeight || 0));
        if (width > 0 && height > 0) return { width, height };
        const intrinsics = state.intrinsics;
        const cx = Array.isArray(intrinsics?.[0]) ? Number(intrinsics[0][2] || 0) : 0;
        const cy = Array.isArray(intrinsics?.[1]) ? Number(intrinsics[1][2] || 0) : 0;
        const intrinsicWidth = Math.round(cx * 2);
        const intrinsicHeight = Math.round(cy * 2);
        if (intrinsicWidth > 0 && intrinsicHeight > 0) return { width: intrinsicWidth, height: intrinsicHeight };
        return {};
    }

    function applyParamsToControls(params) {
        if (!modal || !params || typeof params !== 'object') return;
        const normalized = normalizeParams(params);
        Object.entries({
            precision: normalized.precision,
            focal_length_mm: normalized.focal_length_mm,
            resolution: normalized.resolution,
            aspect_ratio: normalized.aspect_ratio
        }).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            const control = modal.querySelector(`[data-gaussian-param="${key}"]`);
            if (!control) return;
            control.value = String(value);
        });
    }

    function updateReferencePreview() {
        if (!modal || !state) return;
        const img = modal.querySelector('[data-gaussian-reference-preview]');
        const label = modal.querySelector('[data-gaussian-reference-label]');
        const src = state.referenceSrc || state.referenceDataUrl || assetDisplaySrc(state.referenceAsset || {}, '');
        if (img) {
            img.src = src || '';
            img.hidden = !src;
        }
        if (label) label.textContent = src ? t('Reference ready', '参考图已就绪') : t('No reference', '无参考图');
    }

    function updateOutputPreview() {
        if (!modal || !state) return;
        const img = modal.querySelector('[data-gaussian-output-preview]');
        const src = state.renderedImageDataUrl || assetDisplaySrc(state.renderAsset || {}, '');
        if (img) {
            img.src = src || '';
            img.hidden = !src;
        }
        const ply = modal.querySelector('[data-gaussian-ply-label]');
        if (ply) {
            ply.textContent = hasPly(state) ? t('PLY ready', 'PLY 已生成') : t('PLY pending', '等待 PLY');
        }
    }

    function clearViewerMesh(reason) {
        iframeWindow()?.postMessage({ type: 'CLEAR_MESH', reason: reason || 'reference_changed' }, '*');
    }

    function clearGeneratedStateForReferenceChange(referenceSignature, reason) {
        if (!state) return;
        state.referenceSignature = referenceSignature || currentReferenceSignature() || '';
        state.referenceAsset = null;
        state.plyAsset = null;
        state.plyPath = '';
        state.renderAsset = null;
        state.renderedImageDataUrl = '';
        state.cameraState = {};
        state.extrinsics = null;
        state.intrinsics = null;
        state.pendingApplyCameraState = false;
        state.autoBuildStarted = false;
        state.referenceStale = false;
        clearViewerMesh(reason);
        updateOutputPreview();
        setStatus(t('Reference changed. Rebuilding 3D Gaussian...', '参考图已更新，正在重新生成 3D 高斯...'));
        persistCache('reference_changed');
    }

    function clearMissingPlyState(reason) {
        if (!state) return;
        state.plyAsset = null;
        state.plyPath = '';
        state.extrinsics = null;
        state.intrinsics = null;
        state.pendingApplyCameraState = false;
        state.autoBuildStarted = false;
        state.autoBuildInFlight = false;
        clearViewerMesh(reason || 'ply_missing');
        persistCache('ply_missing');
        updateOutputPreview();
    }

    function reconcileReferenceChange(reason) {
        if (!state) return false;
        const nextSignature = currentReferenceSignature();
        if (!nextSignature) return false;
        const previousSignature = state.referenceSignature || '';
        if (state.sceneBridge && hasPly(state)) {
            state.cachedReferenceSignature = state.cachedReferenceSignature || previousSignature || '';
            const previousCapture = state.cachedReferenceCaptureSignature || '';
            const previousData = state.cachedReferenceDataSignature || '';
            const nextCapture = state.referenceCaptureSignature || '';
            const nextData = state.referenceDataSignature || '';
            if (!previousCapture && !previousData) {
                if (previousSignature && !referenceSignatureMatches(previousSignature, nextSignature)) {
                    clearGeneratedStateForReferenceChange(nextSignature, reason || 'reference_changed');
                    return true;
                }
                state.referenceSignature = nextSignature;
                persistCache('reference_migrated');
                return false;
            }
            if (!nextCapture && !nextData) return false;
            if (!referenceEvidenceMatches(previousCapture, previousData, nextCapture, nextData)) {
                clearGeneratedStateForReferenceChange(nextSignature, reason || 'reference_changed');
                return true;
            }
            state.referenceStale = false;
            state.referenceSignature = nextSignature;
            return false;
        }
        if (previousSignature && !referenceSignatureMatches(previousSignature, nextSignature)) {
            clearGeneratedStateForReferenceChange(nextSignature, reason || 'reference_changed');
            return true;
        }
        state.referenceSignature = nextSignature;
        return false;
    }

    function buildModal(options) {
        const title = escapeHtml(options?.title || 'Gaussian Studio');
        const viewerUrl = escapeHtml(options?.viewerUrl || DEFAULT_VIEWER_URL);
        const shell = document.createElement('div');
        shell.className = 'sai-canvas-modal sai-gaussian-studio-modal';
        shell.innerHTML = `
<div class="sai-canvas-modal-panel sai-gaussian-studio-panel">
  <div class="sai-canvas-modal-head">
    <span><i class="fa-solid fa-cube"></i>${title}</span>
    <div class="sai-gaussian-studio-head-actions">
      <button type="button" data-gaussian-action="build" title="${escapeHtml(t('Build 3D Gaussian', '生成 3D 高斯'))}"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
      <button type="button" data-gaussian-action="render" title="${escapeHtml(t('Render current view', '渲染当前视角'))}"><i class="fa-solid fa-camera"></i></button>
      <button type="button" class="sai-gaussian-studio-confirm" data-gaussian-action="confirm" title="${escapeHtml(t('Export image', '导出图像'))}"><i class="fa-solid fa-check"></i></button>
      <button type="button" data-gaussian-action="close" title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>
  <div class="sai-gaussian-studio-body">
    <aside class="sai-gaussian-studio-controls">
      <div class="sai-gaussian-studio-preview">
        <img data-gaussian-reference-preview alt="" hidden>
        <span data-gaussian-reference-label>${escapeHtml(t('No reference', '无参考图'))}</span>
      </div>
      <label><span>${escapeHtml(t('Precision', '精度'))}</span><select data-gaussian-param="precision">
        <option value="auto" selected>auto</option>
        <option value="fp32">fp32</option>
        <option value="bf16">bf16</option>
        <option value="fp16">fp16</option>
      </select></label>
      <label><span>${escapeHtml(t('Focal mm', '焦距 mm'))}</span><input data-gaussian-param="focal_length_mm" type="number" min="0" max="500" step="0.1" value="30"></label>
      <label><span>${escapeHtml(t('Resolution', '分辨率'))}</span><select data-gaussian-param="resolution">
        <option value="768">768</option>
        <option value="1024" selected>1024</option>
        <option value="1536">1536</option>
        <option value="2048">2048</option>
      </select></label>
      <label><span>${escapeHtml(t('Aspect', '比例'))}</span><select data-gaussian-param="aspect_ratio">
        <option value="source">${escapeHtml(t('Source', '源图'))}</option>
        <option value="1:1">1:1</option>
        <option value="4:3">4:3</option>
        <option value="3:4">3:4</option>
        <option value="16:9">16:9</option>
        <option value="9:16">9:16</option>
      </select></label>
      <div class="sai-gaussian-studio-ply" data-gaussian-ply-label>${escapeHtml(t('PLY pending', '等待 PLY'))}</div>
    </aside>
    <main class="sai-gaussian-studio-viewer">
      <iframe data-gaussian-viewer src="${viewerUrl}" title="Gaussian Viewer"></iframe>
      <div class="sai-gaussian-studio-busy" data-gaussian-busy><i class="fa-solid fa-spinner fa-spin"></i></div>
    </main>
    <aside class="sai-gaussian-studio-output">
      <div class="sai-gaussian-studio-preview">
        <img data-gaussian-output-preview alt="" hidden>
        <span>${escapeHtml(t('Render output', '渲染输出'))}</span>
      </div>
      <div class="sai-gaussian-studio-status" data-gaussian-status></div>
    </aside>
  </div>
</div>`;
        call(options?.ensureFormNames, null, shell, 'gaussian_studio');
        document.body.appendChild(shell);
        return shell;
    }

    function close() {
        if (pendingRender) {
            pendingRender.reject(new Error('closed'));
            pendingRender = null;
        }
        if (pendingCameraCapture) {
            pendingCameraCapture.reject(new Error('closed'));
            pendingCameraCapture = null;
        }
        if (modal) modal.remove();
        modal = null;
        state = null;
        sceneBridgeOpen = false;
        backdropPointerStarted = false;
        viewerContextGuardActive = false;
        viewerContextGuardUntil = 0;
    }

    function closeWithCameraCapture() {
        if (!state || !hasPly(state)) {
            close();
            return;
        }
        const closingState = state;
        captureCameraState(900)
            .catch(() => ({}))
            .finally(() => {
                if (state !== closingState) return;
                persistCache('close');
                close();
            });
    }

    function closeScenePreset() {
        if (sceneBridgeOpen) close();
    }

    function iframeWindow() {
        return modal?.querySelector('[data-gaussian-viewer]')?.contentWindow || null;
    }

    function waitForIframe() {
        const iframe = modal?.querySelector('[data-gaussian-viewer]');
        if (!iframe) return Promise.reject(new Error('viewer iframe missing'));
        if (iframe.dataset.loaded === '1') return Promise.resolve(iframe);
        return new Promise((resolve) => {
            iframe.addEventListener('load', () => {
                iframe.dataset.loaded = '1';
                resolve(iframe);
            }, { once: true });
        });
    }

    async function loadPlyIntoViewer() {
        if (!hasPly(state)) {
            updateOutputPreview();
            return;
        }
        const url = assetUrl(state.plyAsset || {}) || state.plyPath || '';
        if (!url) {
            setStatus(t('PLY asset has no readable URL.', 'PLY 资产没有可读取的地址。'), true);
            return;
        }
        setBusy(true, t('Loading viewer asset...', '正在载入 Viewer 资产...'));
        try {
            await waitForIframe();
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = await response.arrayBuffer();
            iframeWindow()?.postMessage({
                type: 'LOAD_MESH_DATA',
                data: buffer,
                filename: state.plyAsset?.name || state.plyPath || 'gaussian.ply',
                extrinsics: state.extrinsics || null,
                intrinsics: state.intrinsics || null,
                camera_state: hasCameraState(state.cameraState) ? state.cameraState : null
            }, '*', [buffer]);
            state.pendingApplyCameraState = hasCameraState(state.cameraState);
            if (state.pendingApplyCameraState) {
                setTimeout(() => applyCameraStateToViewer('ply_load_fallback'), 1200);
            }
            setStatus(state.referenceStale
                ? t('Reference changed. Click Build to rebuild.', '参考图已更新，点击生成按钮重新解析。')
                : t('Viewer ready.', 'Viewer 已就绪。'));
        } catch (err) {
            setStatus(`${t('Viewer load failed', 'Viewer 载入失败')}: ${err?.message || err}`, true);
            clearMissingPlyState('ply_load_failed');
            maybeAutoBuild('ply_missing');
        } finally {
            setBusy(false);
            updateOutputPreview();
        }
    }

    function applyCameraStateToViewer(reason) {
        if (!state || !hasCameraState(state.cameraState)) return false;
        iframeWindow()?.postMessage({
            type: 'APPLY_CAMERA_STATE',
            camera_state: state.cameraState,
            reason: reason || 'restore'
        }, '*');
        return true;
    }

    function captureCameraState(timeoutMs, options) {
        if (!state || pendingCameraCapture) return pendingCameraCapture?.promise || Promise.resolve(state?.cameraState || {});
        const opts = options || {};
        const requestId = `gaussian_camera_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const promise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const fallback = state?.cameraState || {};
                pendingCameraCapture = null;
                if (opts.required && !hasCameraState(fallback)) reject(new Error(t('Camera capture timed out.', '相机捕获超时。')));
                else resolve(fallback);
            }, Number(timeoutMs || 1200));
            pendingCameraCapture = {
                requestId,
                promise: null,
                resolve: (value) => {
                    clearTimeout(timeout);
                    pendingCameraCapture = null;
                    const cameraState = value || {};
                    if (opts.required && !hasCameraState(cameraState)) reject(new Error(t('Camera capture failed.', '相机捕获失败。')));
                    else resolve(cameraState);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    pendingCameraCapture = null;
                    reject(err);
                }
            };
        });
        if (pendingCameraCapture) pendingCameraCapture.promise = promise;
        iframeWindow()?.postMessage({ type: 'CAPTURE_CAMERA_STATE', request_id: requestId }, '*');
        return promise;
    }

    function renderCurrentView() {
        if (!hasPly(state)) return Promise.reject(new Error(t('Build PLY first.', '请先生成 PLY。')));
        if (pendingRender) return pendingRender.promise;
        const params = readParams();
        const requestId = `gaussian_render_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        let promise = null;
        promise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pendingRender = null;
                reject(new Error('render timeout'));
            }, 30000);
            pendingRender = {
                requestId,
                resolve: (value) => {
                    clearTimeout(timeout);
                    pendingRender = null;
                    resolve(value);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    pendingRender = null;
                    reject(err);
                },
                promise: null
            };
        });
        if (pendingRender) pendingRender.promise = promise;
        const outputSize = sourceOutputSize(params);
        iframeWindow()?.postMessage({
            type: 'RENDER_REQUEST',
            request_id: requestId,
            output_resolution: params.resolution,
            output_aspect_ratio: params.aspect_ratio,
            output_width: outputSize.width || null,
            output_height: outputSize.height || null
        }, '*');
        return promise;
    }

    async function urlToDataUrl(url) {
        if (!url || String(url).startsWith('data:')) return url || '';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('read failed'));
            reader.readAsDataURL(blob);
        });
    }

    async function ensureReferenceDataUrl() {
        if (state.referenceAssetSource) return '';
        if (state.referenceDataUrl) {
            if (!state.referenceWidth || !state.referenceHeight) {
                const size = await measureDataUrl(state.referenceDataUrl);
                if (size.width && size.height) {
                    state.referenceWidth = size.width;
                    state.referenceHeight = size.height;
                }
            }
            return state.referenceDataUrl;
        }
        if (state.referenceSrc) {
            state.referenceDataUrl = await urlToDataUrl(state.referenceSrc);
            const size = await measureDataUrl(state.referenceDataUrl);
            if (size.width && size.height) {
                state.referenceWidth = size.width;
                state.referenceHeight = size.height;
            }
            updateReferencePreview();
            return state.referenceDataUrl;
        }
        return '';
    }

    async function buildGaussian() {
        if (!state) return;
        setBusy(true, t('Building 3D Gaussian...', '正在生成 3D 高斯...'));
        try {
            const referenceDataUrl = await ensureReferenceDataUrl();
            if (!state.referenceAssetSource && !referenceDataUrl) throw new Error(t('No reference image.', '没有参考图。'));
            if (referenceDataUrl && !state.referenceDataSignature) state.referenceDataSignature = dataUrlSignature(referenceDataUrl);
            if (referenceDataUrl && !state.referenceCaptureSignature && state.sceneBridge) {
                state.referenceCaptureSignature = await imagePixelSignature(referenceDataUrl);
            }
            state.referenceSignature = currentReferenceSignature();
            const buildReferenceSignature = state.referenceSignature || '';
            const params = readParams();
            const response = await gaussianPredict({
                project_id: state.projectId,
                node_id: state.nodeId,
                asset_source: state.referenceAssetSource || null,
                reference_asset: state.referenceAsset || null,
                reference_data_url: referenceDataUrl || '',
                reference_width: state.referenceWidth || null,
                reference_height: state.referenceHeight || null,
                precision: params.precision,
                focal_length_mm: params.focal_length_mm,
                output_prefix: `sharp_${state.nodeId || 'gaussian'}`
            });
            if (!response?.ok) throw new Error([response?.error, response?.details].filter(Boolean).join(': ') || 'predict failed');
            if (buildReferenceSignature && buildReferenceSignature !== currentReferenceSignature()) {
                throw new Error(t('Reference changed during build. Please build again.', '生成期间参考图已变化，请重新生成。'));
            }
            state.plyAsset = response.ply_asset || null;
            state.plyPath = response.ply_path || '';
            state.referenceAsset = response.reference_asset || state.referenceAsset || null;
            state.referenceSignature = currentReferenceSignature() || buildReferenceSignature;
            state.cachedReferenceSignature = state.referenceSignature || '';
            state.cachedReferenceCaptureSignature = state.referenceCaptureSignature || '';
            state.cachedReferenceDataSignature = state.referenceDataSignature || dataUrlSignature(state.referenceDataUrl || '');
            state.referenceStale = false;
            state.extrinsics = response.extrinsics || null;
            state.intrinsics = response.intrinsics || null;
            state.renderedImageDataUrl = '';
            state.renderAsset = null;
            setStatus(response.message || t('PLY generated.', 'PLY 已生成。'));
            updateReferencePreview();
            persistCache('build');
            await loadPlyIntoViewer();
        } catch (err) {
            setStatus(`${t('Build failed', '生成失败')}: ${err?.message || err}`, true);
        } finally {
            setBusy(false);
            updateOutputPreview();
        }
    }

    async function renderViewAction() {
        setBusy(true, t('Rendering current view...', '正在渲染当前视角...'));
        try {
            const dataUrl = await renderCurrentView();
            state.renderedImageDataUrl = dataUrl;
            setStatus(t('Render ready.', '渲染已就绪。'));
            updateOutputPreview();
            persistCache('render_preview', { includeDataUrl: sceneBridgeOpen });
        } catch (err) {
            setStatus(`${t('Render failed', '渲染失败')}: ${err?.message || err}`, true);
        } finally {
            setBusy(false);
        }
    }

    function measureDataUrl(dataUrl) {
        return new Promise((resolve) => {
            if (!dataUrl) return resolve({});
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth || img.width || null, height: img.naturalHeight || img.height || null });
            img.onerror = () => resolve({});
            img.src = dataUrl;
        });
    }

    function setBridgeValue(id, value) {
        const root = document.getElementById(id);
        const field = root?.querySelector?.('textarea, input') || root;
        if (!field) return false;
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function getBridgeValue(id) {
        const root = document.getElementById(id);
        const field = root?.querySelector?.('textarea, input') || root;
        return field ? String(field.value || '') : '';
    }

    function readSceneBridgeState() {
        const raw = getBridgeValue('gaussian_studio_scene_state');
        if (!raw.trim()) return null;
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (err) {
            return null;
        }
    }

    function delay(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function sourceFromObject(value, depth = 0) {
        if (!value || typeof value !== 'object' || depth > 4) return '';
        for (const key of ['image', 'image_data_url', 'data_url', 'preview_url', 'thumb', 'url', 'path', 'output_path', 'original_output_path']) {
            const source = value[key];
            if (typeof source === 'string' && source.trim()) return source.trim();
        }
        for (const key of ['render_asset', 'asset_ref', 'gaussian_image']) {
            const source = sourceFromObject(value[key], depth + 1);
            if (source) return source;
        }
        return '';
    }

    function parseSketchPayload(raw) {
        if (!String(raw || '').trim()) return null;
        try {
            const payload = JSON.parse(raw);
            if (!payload || typeof payload !== 'object') return null;
            const image = typeof payload.image === 'string' ? payload.image : '';
            const mask = typeof payload.mask === 'string' ? payload.mask : '';
            if (!image && !mask) return null;
            return { image, mask };
        } catch (err) {
            return null;
        }
    }

    function scenePayloadSketchValue() {
        const raw = getBridgeValue('gaussian_studio_scene_payload');
        if (!raw.trim()) return null;
        try {
            const payload = JSON.parse(raw);
            const image = sourceFromObject(payload);
            return image ? { image, mask: '' } : null;
        } catch (err) {
            return null;
        }
    }

    async function applySketchValue(root, api, payload) {
        if (!payload) return false;
        try {
            if (api?.setValue) {
                return !!(await api.setValue(payload, { change: false }));
            }
            if (root && typeof window.SimpAISketch?.setValue === 'function') {
                return !!(await window.SimpAISketch.setValue(root, payload, { change: false }));
            }
        } catch (err) {
            console.warn('[SimpAI Gaussian Studio] canvas sync failed', err);
        }
        return false;
    }

    async function syncSceneCanvasFromBridge(options = {}) {
        const requestedAttempts = Number(options.attempts);
        const requestedWaitMs = Number(options.waitMs);
        const attempts = Number.isFinite(requestedAttempts) ? Math.max(1, requestedAttempts) : 12;
        const waitMs = Number.isFinite(requestedWaitMs) ? Math.max(20, requestedWaitMs) : 80;
        for (let index = 0; index < attempts; index += 1) {
            const root = document.getElementById('scene_canvas');
            const field = root?.querySelector?.('textarea, input[type="text"], input:not([type])');
            const payload = scenePayloadSketchValue() || parseSketchPayload(field?.value || '');
            const api = root ? (window.SimpAISketch?.get?.(root) || root.__simpaiSketch) : null;
            if (await applySketchValue(root, api, payload)) return true;
            if (index < attempts - 1) await delay(waitMs);
        }
        return false;
    }

    function clickBridge(id) {
        const root = document.getElementById(id);
        const button = root?.querySelector?.('button') || root;
        if (button && typeof button.click === 'function') {
            button.click();
            return true;
        }
        return false;
    }

    function applySceneBridge(response) {
        if (!sceneBridgeOpen) return;
        const payload = JSON.stringify(response || {});
        setBridgeValue('gaussian_studio_scene_payload', payload);
        setBridgeValue('gaussian_studio_scene_target', state?.sceneTarget || 'scene_canvas_image');
        clickBridge('gaussian_studio_scene_apply_btn');
    }

    async function confirmExport() {
        if (!state) return;
        setBusy(true, t('Exporting render...', '正在导出渲染...'));
        try {
            const dataUrl = await renderCurrentView();
            state.renderedImageDataUrl = dataUrl;
            const size = await measureDataUrl(dataUrl);
            const params = readParams();
            state.referenceSignature = currentReferenceSignature() || state.referenceSignature || '';
            const response = await gaussianExport({
                project_id: state.projectId,
                node_id: state.nodeId,
                image_data_url: dataUrl,
                width: size.width,
                height: size.height,
                ply_asset: state.plyAsset || null,
                ply_path: state.plyPath || '',
                reference_asset: state.referenceAsset || null,
                reference_signature: state.referenceSignature || '',
                reference_capture_signature: state.referenceCaptureSignature || '',
                reference_data_signature: state.referenceDataSignature || dataUrlSignature(state.referenceDataUrl || ''),
                camera_state: state.cameraState || {},
                extrinsics: state.extrinsics || null,
                intrinsics: state.intrinsics || null,
                params
            });
            if (!response?.ok) throw new Error([response?.error, response?.details].filter(Boolean).join(': ') || 'export failed');
            const finalResponse = Object.assign({}, response, {
                image_data_url: dataUrl,
                render_asset: response.render_asset || response.asset_ref || null,
                asset_ref: response.asset_ref || response.render_asset || null,
                ply_asset: state.plyAsset || null,
                ply_path: state.plyPath || '',
                reference_asset: state.referenceAsset || null,
                reference_signature: state.referenceSignature || '',
                reference_capture_signature: state.referenceCaptureSignature || '',
                reference_data_signature: state.referenceDataSignature || dataUrlSignature(state.referenceDataUrl || ''),
                camera_state: state.cameraState || {},
                extrinsics: state.extrinsics || null,
                intrinsics: state.intrinsics || null,
                params,
                gaussian_state: Object.assign({}, response.gaussian_state || {}, cachePayload(false), {
                    render_asset: response.render_asset || response.asset_ref || null,
                    output_asset: response.render_asset || response.asset_ref || null
                })
            });
            state.renderAsset = finalResponse.render_asset;
            updateOutputPreview();
            persistCache('confirm');
            applySceneBridge(finalResponse);
            if (typeof state.onConfirm === 'function') state.onConfirm(finalResponse);
            close();
        } catch (err) {
            setStatus(`${t('Export failed', '导出失败')}: ${err?.message || err}`, true);
        } finally {
            setBusy(false);
        }
    }

    function handleMessage(event) {
        const data = event?.data || {};
        if (!data || typeof data !== 'object') return;
        if (data.type === 'GAUSSIAN_VIEWER_CONTEXT_GUARD') {
            const suppressMs = Math.max(300, Math.min(3000, Number(data.suppress_ms || (data.active ? 1800 : 700))));
            viewerContextGuardActive = !!data.active;
            viewerContextGuardUntil = Date.now() + suppressMs;
            return;
        }
        if (!state) return;
        if (data.type === 'SET_CAMERA_PARAMS') {
            state.cameraState = data.camera_state || {};
            setStatus(t('Camera captured.', '相机已记录。'));
            persistCache('camera');
            if (pendingCameraCapture) {
                pendingCameraCapture.resolve(state.cameraState);
            }
            return;
        }
        if (data.type === 'MESH_LOADED') {
            if (state.pendingApplyCameraState && hasCameraState(state.cameraState)) {
                state.pendingApplyCameraState = false;
                applyCameraStateToViewer('mesh_loaded');
                setTimeout(() => applyCameraStateToViewer('mesh_loaded_confirm'), 160);
            }
            return;
        }
        if (data.type === 'RENDER_RESULT' && pendingRender && data.request_id === pendingRender.requestId) {
            if (hasCameraState(data.camera_state)) {
                state.cameraState = data.camera_state || {};
                persistCache('camera');
            }
            pendingRender.resolve(data.image || '');
            return;
        }
        if (data.type === 'RENDER_ERROR' && pendingRender && data.request_id === pendingRender.requestId) {
            pendingRender.reject(new Error(data.error || 'render error'));
            return;
        }
        if (data.type === 'SCREENSHOT_V2' && data.image) {
            state.renderedImageDataUrl = data.image;
            updateOutputPreview();
            persistCache('screenshot', { includeDataUrl: sceneBridgeOpen });
            return;
        }
        if (data.type === 'PRESET_CONFIRM_REQUEST') {
            const confirmed = window.confirm(data.message || data.title || 'Confirm');
            iframeWindow()?.postMessage({
                type: 'PRESET_CONFIRM_RESULT',
                request_id: data.request_id,
                confirmed
            }, '*');
        }
    }

    function viewerContextGuarded() {
        return !!modal && (viewerContextGuardActive || Date.now() < viewerContextGuardUntil);
    }

    function isGaussianModalContextMenu(evt) {
        const target = evt?.target;
        return !!modal && (target === modal || (target && typeof modal.contains === 'function' && modal.contains(target)));
    }

    function isGaussianViewerCanvasHit(evt) {
        const viewerFrame = modal?.querySelector('[data-gaussian-viewer]');
        if (!viewerFrame || evt?.target !== viewerFrame) return false;
        const x = Number(evt.clientX);
        const y = Number(evt.clientY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        try {
            const canvas = viewerFrame.contentDocument?.getElementById('canvas');
            if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return false;
            const frameRect = viewerFrame.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            if (canvasRect.width <= 0 || canvasRect.height <= 0) return false;
            const left = frameRect.left + canvasRect.left;
            const top = frameRect.top + canvasRect.top;
            return x >= left && x <= left + canvasRect.width && y >= top && y <= top + canvasRect.height;
        } catch (err) {
            return false;
        }
    }

    function suppressViewerContextMenu(evt) {
        if (!viewerContextGuarded() && !isGaussianModalContextMenu(evt)) return;
        viewerContextGuardActive = false;
        viewerContextGuardUntil = Date.now() + 500;
        if (typeof evt.preventDefault === 'function') evt.preventDefault();
        if (typeof evt.stopPropagation === 'function') evt.stopPropagation();
        if (typeof evt.stopImmediatePropagation === 'function') evt.stopImmediatePropagation();
    }

    function guardViewerIframeRightPointer(evt) {
        if (evt?.button !== 2) return;
        viewerContextGuardActive = true;
        viewerContextGuardUntil = Date.now() + 2200;
        if (!isGaussianViewerCanvasHit(evt)) {
            if (typeof evt.preventDefault === 'function') evt.preventDefault();
            if (typeof evt.stopPropagation === 'function') evt.stopPropagation();
        }
    }

    function releaseViewerContextGuard(evt) {
        if (!viewerContextGuardActive) return;
        if (evt && evt.button !== undefined && evt.button !== 2) return;
        viewerContextGuardActive = false;
        viewerContextGuardUntil = Date.now() + 700;
    }

    function handleModalScrollBoundary(evt) {
        if (!modal || !modal.contains(evt.target)) return;
        evt.stopPropagation();
        if (typeof evt.preventDefault === 'function') evt.preventDefault();
    }

    function bindModalEvents() {
        modal.addEventListener('wheel', handleModalScrollBoundary, { passive: false });
        modal.addEventListener('touchmove', handleModalScrollBoundary, { passive: false });
        modal.addEventListener('pointerdown', (evt) => {
            backdropPointerStarted = evt.target === modal && (evt.button === undefined || evt.button === 0);
        }, true);
        modal.addEventListener('mousedown', (evt) => {
            backdropPointerStarted = evt.target === modal && (evt.button === undefined || evt.button === 0);
        }, true);
        modal.addEventListener('click', (evt) => {
            const button = evt.target.closest('[data-gaussian-action]');
            if (!button) {
                if (evt.target === modal && backdropPointerStarted) closeWithCameraCapture();
                backdropPointerStarted = false;
                return;
            }
            backdropPointerStarted = false;
            const action = button.getAttribute('data-gaussian-action');
            if (action === 'close') closeWithCameraCapture();
            else if (action === 'build') buildGaussian();
            else if (action === 'render') renderViewAction();
            else if (action === 'confirm') confirmExport();
        });
        modal.querySelector('[data-gaussian-viewer]')?.addEventListener('load', (evt) => {
            evt.currentTarget.dataset.loaded = '1';
        });
        const viewerFrame = modal.querySelector('[data-gaussian-viewer]');
        if (viewerFrame) {
            viewerFrame.addEventListener('contextmenu', suppressViewerContextMenu, true);
            viewerFrame.addEventListener('pointerdown', guardViewerIframeRightPointer, true);
            viewerFrame.addEventListener('mousedown', guardViewerIframeRightPointer, true);
        }
    }

    document.addEventListener('contextmenu', suppressViewerContextMenu, true);
    window.addEventListener('contextmenu', suppressViewerContextMenu, true);
    document.addEventListener('mouseup', releaseViewerContextGuard, true);
    document.addEventListener('pointerup', releaseViewerContextGuard, true);

    async function hydrateStatus() {
        try {
            const status = await gaussianStatus({});
            if (state) state.sharpModelReady = !!status?.sharp_model?.ready;
            if (status?.sharp_model?.ready) setStatus(t('SHARP model ready.', 'SHARP 模型已就绪。'));
            else setStatus(t('SHARP model will download on first build.', '首次生成时会下载 SHARP 模型。'));
            maybeAutoBuild('status');
        } catch (err) {
            if (state) state.sharpModelReady = false;
            setStatus(t('Status check skipped.', '状态检查已跳过。'));
        }
    }

    function maybeAutoBuild(reason) {
        if (!state || !state.autoBuild || state.autoBuildStarted || state.autoBuildInFlight) return;
        if (hasPly(state) || !hasReference(state)) return;
        state.autoBuildStarted = true;
        state.autoBuildInFlight = true;
        Promise.resolve()
            .then(() => buildGaussian())
            .catch((err) => setStatus(`${t('Build failed', '生成失败')}: ${err?.message || err}`, true))
            .finally(() => {
                if (state) state.autoBuildInFlight = false;
            });
    }

    function open(options) {
        close();
        const opts = options || {};
        const sourceState = opts.gaussianState || opts.state || {};
        const cachedReferenceSignature = sourceState.reference_signature || referenceSignatureFrom({
            reference_asset: sourceState.reference_asset || null,
            reference_src: sourceState.reference_src || '',
            reference_data_url: sourceState.reference_data_url || '',
            reference_capture_signature: sourceState.reference_capture_signature || '',
            reference_data_signature: sourceState.reference_data_signature || '',
            reference_width: sourceState.reference_width || 0,
            reference_height: sourceState.reference_height || 0
        });
        state = {
            projectId: opts.projectId || 'default',
            nodeId: opts.node?.id || opts.nodeId || `gaussian_${Date.now().toString(36)}`,
            node: opts.node || null,
            sceneBridge: !!opts.sceneBridge,
            sceneTarget: opts.sceneTarget || 'scene_canvas_image',
            referenceSrc: opts.referenceSrc || sourceState.reference_src || '',
            referenceDataUrl: opts.referenceDataUrl || sourceState.reference_data_url || '',
            referenceAsset: opts.referenceAsset || sourceState.reference_asset || null,
            referenceAssetSource: opts.referenceAssetSource || null,
            referenceWidth: opts.referenceWidth || sourceState.reference_width || sourceState.reference_asset?.width || opts.referenceAsset?.width || 0,
            referenceHeight: opts.referenceHeight || sourceState.reference_height || sourceState.reference_asset?.height || opts.referenceAsset?.height || 0,
            referenceSignature: opts.referenceSignature || cachedReferenceSignature || '',
            referenceCaptureSignature: opts.referenceCaptureSignature || sourceState.reference_capture_signature || '',
            referenceDataSignature: opts.referenceDataSignature || sourceState.reference_data_signature || dataUrlSignature(opts.referenceDataUrl || sourceState.reference_data_url || ''),
            cachedReferenceSignature: cachedReferenceSignature || '',
            cachedReferenceCaptureSignature: sourceState.reference_capture_signature || '',
            cachedReferenceDataSignature: sourceState.reference_data_signature || '',
            plyAsset: opts.plyAsset || sourceState.ply_asset || null,
            plyPath: opts.plyPath || sourceState.ply_path || '',
            renderAsset: opts.renderAsset || sourceState.render_asset || sourceState.output_asset || null,
            renderedImageDataUrl: opts.renderedImageDataUrl || sourceState.rendered_image_data_url || '',
            cameraState: opts.cameraState || sourceState.camera_state || {},
            extrinsics: opts.extrinsics || sourceState.extrinsics || null,
            intrinsics: opts.intrinsics || sourceState.intrinsics || null,
            params: normalizeParams(opts.params || sourceState.params || {}),
            autoBuild: opts.autoBuild !== false,
            autoBuildStarted: false,
            autoBuildInFlight: false,
            deferInitialPlyLoad: !!opts.deferInitialPlyLoad,
            referenceStale: false,
            sharpModelReady: false,
            pendingApplyCameraState: false,
            onConfirm: opts.onConfirm || null,
            onStateChange: opts.onStateChange || null
        };
        sceneBridgeOpen = !!opts.sceneBridge;
        modal = buildModal(opts);
        bindModalEvents();
        applyParamsToControls(state.params);
        if (!state.deferInitialPlyLoad) reconcileReferenceChange('open');
        updateReferencePreview();
        updateOutputPreview();
        hydrateStatus();
        if (!state.deferInitialPlyLoad) waitForIframe().then(() => loadPlyIntoViewer()).catch(() => {});
        return modal;
    }

    function firstImageInfo(root) {
        if (!root) return { src: '', width: 0, height: 0 };
        const img = root.querySelector?.('img[src]');
        const src = img?.currentSrc || img?.getAttribute('src') || '';
        if (!src || src === 'about:blank' || src.startsWith('data:image/svg')) return { src: '', width: 0, height: 0 };
        return {
            src,
            width: img?.naturalWidth || img?.width || 0,
            height: img?.naturalHeight || img?.height || 0
        };
    }

    function firstImageDataUrl(root) {
        return firstImageInfo(root).src || '';
    }

    async function captureSceneReference() {
        const sourceId = 'scene_input_image1';
        const root = document.getElementById(sourceId);
        const imageInfo = firstImageInfo(root);
        const src = imageInfo.src;
        if (!src) return { src: '', dataUrl: '', signature: '', dataSignature: '', sourceId, width: 0, height: 0 };
        try {
            const dataUrl = await urlToDataUrl(src);
            const dataSignature = dataUrlSignature(dataUrl);
            const pixelSignature = await imagePixelSignature(dataUrl);
            const size = await measureDataUrl(dataUrl);
            return {
                src,
                dataUrl,
                signature: pixelSignature,
                dataSignature,
                sourceId,
                width: size.width || imageInfo.width || 0,
                height: size.height || imageInfo.height || 0
            };
        } catch (err) {
            const dataUrl = src.startsWith('data:') ? src : '';
            const dataSignature = dataUrl ? dataUrlSignature(dataUrl) : '';
            const pixelSignature = await imagePixelSignature(dataUrl);
            const size = await measureDataUrl(dataUrl);
            return {
                src,
                dataUrl,
                signature: pixelSignature,
                dataSignature,
                sourceId,
                width: size.width || imageInfo.width || 0,
                height: size.height || imageInfo.height || 0
            };
        }
    }

    function setSceneBridgeStatus(message, isError) {
        const host = document.getElementById('gaussian_studio_scene_control');
        const status = host?.querySelector?.('[data-gaussian-studio-scene-status]');
        if (status) {
            delete status.dataset.saiGaussianDefaultStatus;
            status.textContent = String(message || '');
            status.classList.toggle('is-error', !!isError);
        }
    }

    async function openScenePresetBridge() {
        setSceneBridgeStatus(t('Checking Input Image 1...', '正在检查 Input Image 1...'), false);
        const ref = await captureSceneReference();
        if (!ref.src && !ref.dataUrl) {
            setSceneBridgeStatus(t('Upload Reference Image before opening Gaussian Studio.', '请先上传参考图片(2)，再打开 Gaussian Studio。'), true);
            return null;
        }
        setSceneBridgeStatus(t('Input Image 1 ready. Opening Gaussian Studio...', 'Input Image 1 已就绪，正在打开 Gaussian Studio...'), false);
        const cachedState = sceneBridgeCache || readSceneBridgeState() || {};
        sceneBridgeCache = cachedState && typeof cachedState === 'object' ? cachedState : null;
        const popup = open({
            title: 'Gaussian Studio',
            projectId: 'scene',
            nodeId: 'scene_gaussian_studio',
            sceneBridge: true,
            sceneTarget: 'scene_canvas_image',
            state: cachedState,
            gaussianState: cachedState,
            autoBuild: true,
            deferInitialPlyLoad: true
        });
        if (!state || !popup?.isConnected) return popup;
        state.referenceSrc = ref.src || '';
        state.referenceDataUrl = ref.dataUrl || '';
        state.referenceCaptureSignature = ref.signature || '';
        state.referenceDataSignature = ref.dataSignature || '';
        state.referenceWidth = ref.width || 0;
        state.referenceHeight = ref.height || 0;
        const changed = reconcileReferenceChange('reference');
        updateReferencePreview();
        if (!changed && hasPly(state)) loadPlyIntoViewer();
        maybeAutoBuild('reference');
        return popup;
    }

    function attachScenePresetBridge() {
        document.addEventListener('click', (evt) => {
            if (!evt.target.closest('[data-gaussian-studio-scene-open]')) return;
            evt.preventDefault();
            openScenePresetBridge();
        }, true);
        document.addEventListener('keydown', (evt) => {
            if (evt.key !== 'Enter' && evt.key !== ' ') return;
            if (!evt.target.closest('[data-gaussian-studio-scene-open]')) return;
            evt.preventDefault();
            openScenePresetBridge();
        }, true);
    }

    window.addEventListener('message', handleMessage);
    attachScenePresetBridge();

    window.SimpAIGaussianStudioEditor = {
        close,
        closeScenePreset,
        open,
        openScenePresetBridge,
        syncSceneCanvasFromBridge
    };
})();
