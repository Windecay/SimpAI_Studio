(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
    const t = UTILS.t || ((en, cn) => cn || en);

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createMediaViewerContext(source) {
        const context = source || {};
        return {
            assetDisplaySrc: delegate(context, 'assetDisplaySrc'),
            assetMediaKind: delegate(context, 'assetMediaKind'),
            detectWorkbenchTheme: delegate(context, 'detectWorkbenchTheme'),
            ensureWorkbenchFormFieldNames: delegate(context, 'ensureWorkbenchFormFieldNames'),
            getNode: delegate(context, 'getNode'),
            getSelectedResultAsset: delegate(context, 'getSelectedResultAsset'),
            readAssetInfo: delegate(context, 'readAssetInfo'),
            readImageInfo: delegate(context, 'readImageInfo'),
            refreshCompareDom: delegate(context, 'refreshCompareDom'),
            renderCompareControls: delegate(context, 'renderCompareControls'),
            renderCompareStageHtml: delegate(context, 'renderCompareStageHtml'),
            safeAssetDisplaySrc: delegate(context, 'safeAssetDisplaySrc'),
            showToast: delegate(context, 'showToast'),
            startComparePositionDrag: delegate(context, 'startComparePositionDrag'),
            updateCompareParam: delegate(context, 'updateCompareParam')
        };
    }

    function decodeAssetPathText(value) {
        let text = String(value || '').trim();
        if (!text) return '';
        if (text.startsWith('/file=')) text = text.slice('/file='.length);
        if (text.startsWith('/gradio_api/file=')) text = text.slice('/gradio_api/file='.length);
        try {
            text = decodeURIComponent(text);
        } catch (err) {}
        return text.split(/[?#]/, 1)[0].replace(/\\/g, '/').replace(/\/+/g, '/');
    }

    function hasProjectAssetReference(asset) {
        if (!asset || typeof asset !== 'object') return false;
        if (asset.asset_relative_path || asset.relative_path) return true;
        return [asset.path, asset.output_path, asset.original_output_path, asset.preview_url, asset.thumb]
            .some(value => decodeAssetPathText(value).includes('/canvas_workbench/assets/'));
    }

    function specialNodeImageAsset(node) {
        if (node?.type === 'pose_studio') return node.pose_studio?.output_asset || null;
        if (node?.type === 'gaussian_studio') {
            return node.gaussian_studio?.render_asset || node.gaussian_studio?.output_asset || null;
        }
        if (node?.type === 'liveportrait_expression') return node.liveportrait_expression?.output_asset || null;
        return null;
    }

    function getNodeImageSrc(node) {
        const asset = node?.asset || {};
        if (typeof window.SimpAICanvasWorkbenchAssetNodes?.assetDisplaySrc === 'function') {
            const src = window.SimpAICanvasWorkbenchAssetNodes.assetDisplaySrc(asset);
            if (src) return src;
        }
        if (hasProjectAssetReference(asset)) {
            if (asset.data_url) return asset.data_url;
        } else {
            const directSrc = asset.data_url || asset.preview_url || asset.thumb || '';
            if (directSrc) return directSrc;
        }
        const fallback = specialNodeImageAsset(node);
        if (!fallback) return asset.data_url || asset.preview_url || asset.thumb || '';
        if (typeof window.SimpAICanvasWorkbenchAssetNodes?.assetDisplaySrc === 'function') {
            const src = window.SimpAICanvasWorkbenchAssetNodes.assetDisplaySrc(fallback);
            if (src) return src;
        }
        return fallback.data_url || fallback.preview_url || fallback.thumb || '';
    }

    function nodeHasViewableImage(node, context) {
        const asset = node?.type === 'result'
            ? call(context, 'getSelectedResultAsset', null, node)
            : node?.asset;
        if (!asset) return false;
        const fallback = asset.thumb || asset.preview_url || asset.data_url || '';
        return !!call(context, 'safeAssetDisplaySrc', '', asset, fallback);
    }

    function openImageViewer(node, context) {
        const src = getNodeImageSrc(node);
        if (!src) {
            call(context, 'showToast', null, t('This node has no viewable image.', '当前节点没有可查看的图片'));
            return;
        }
        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-image-viewer">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(node.title || 'Image')}</span>
    <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-image-viewer-body"><img src="${escapeHtml(src)}" alt=""></div>
  <div class="sai-image-viewer-foot">${escapeHtml(call(context, 'readImageInfo', [], node).join(' / '))}</div>
</div>`;
        call(context, 'ensureWorkbenchFormFieldNames', null, modal, 'image_viewer');
        document.body.appendChild(modal);
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) modal.remove();
        });
    }

    function openAssetViewer(asset, title, context) {
        if (!asset) {
            call(context, 'showToast', null, t('Current result has no viewable asset.', '当前结果没有可查看资产'));
            return;
        }
        const kind = call(context, 'assetMediaKind', 'image', asset);
        if (kind === 'video' || kind === 'audio') {
            openMediaViewer({ title: title || asset.name || 'Result media', type: kind, asset }, context);
            return;
        }
        openImageViewer({ title: title || asset.name || 'Result image', asset }, context);
    }

    function openNodeMediaFullscreen(node, context) {
        const asset = node?.type === 'result' ? call(context, 'getSelectedResultAsset', null, node) : node?.asset;
        const src = call(context, 'assetDisplaySrc', '', asset || {});
        const kind = call(context, 'assetMediaKind', 'image', asset || {});
        if (!src || kind !== 'video') {
            call(context, 'showToast', null, t('This node has no fullscreen video asset.', '当前节点没有可全屏播放的视频资产'));
            return;
        }
        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal sai-media-fullscreen-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-media-fullscreen-panel">
  <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  <video src="${escapeHtml(src)}" controls controlsList="nofullscreen nodownload noremoteplayback" disablePictureInPicture autoplay playsinline></video>
</div>`;
        call(context, 'ensureWorkbenchFormFieldNames', null, modal, 'media_fullscreen');
        const close = () => {
            if (modal.isConnected) modal.remove();
            document.removeEventListener('fullscreenchange', onFullscreenChange, true);
        };
        const onFullscreenChange = () => {
            if (!document.fullscreenElement && modal.isConnected) {
                modal.classList.add('is-windowed');
            }
        };
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) close();
        });
        document.addEventListener('fullscreenchange', onFullscreenChange, true);
        document.body.appendChild(modal);
        const video = modal.querySelector('video');
        const fullscreenTarget = modal?.requestFullscreen ? modal : video;
        const promise = fullscreenTarget?.requestFullscreen?.();
        if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {
                modal.classList.add('is-windowed');
                video?.play?.().catch(() => {});
            });
        }
    }

    function openMediaViewer(node, context) {
        const src = call(context, 'assetDisplaySrc', '', node?.asset || {});
        if (!src) {
            call(context, 'showToast', null, t('This media node has no playable asset.', '当前媒体节点没有可播放资产'));
            return;
        }
        const type = node?.type === 'audio' || node?.type === 'video' ? node.type : call(context, 'assetMediaKind', 'image', node?.asset || {});
        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-image-viewer">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(node.title || type)}</span>
    <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-image-viewer-body">${type === 'audio'
    ? `<audio src="${escapeHtml(src)}" controls autoplay></audio>`
    : `<video src="${escapeHtml(src)}" controls controlsList="nofullscreen nodownload noremoteplayback" disablePictureInPicture autoplay></video>`}</div>
  <div class="sai-image-viewer-foot">${escapeHtml(call(context, 'readAssetInfo', [], node.asset || {}, false).join(' / '))}</div>
</div>`;
        call(context, 'ensureWorkbenchFormFieldNames', null, modal, 'media_viewer');
        document.body.appendChild(modal);
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) modal.remove();
        });
    }

    function openCompareFullscreen(node, context) {
        if (!node || node.type !== 'compare') return;
        let zoom = 1;
        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal sai-compare-fullscreen';
        modal.dataset.compareNodeId = node.id;
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        const restoreScroll = (anchor) => {
            const body = modal.querySelector('.sai-compare-full-body');
            const stageEl = modal.querySelector('.sai-compare-stage');
            if (!body || !stageEl) return;
            window.requestAnimationFrame(() => {
                const bodyRect = body.getBoundingClientRect();
                const stageRect = stageEl.getBoundingClientRect();
                if (!bodyRect.width || !bodyRect.height || !stageRect.width || !stageRect.height) return;
                if (anchor) {
                    const targetX = body.scrollLeft + (stageRect.left - bodyRect.left) + anchor.xRatio * stageRect.width;
                    const targetY = body.scrollTop + (stageRect.top - bodyRect.top) + anchor.yRatio * stageRect.height;
                    body.scrollLeft = clamp(targetX - anchor.clientX + bodyRect.left, 0, Math.max(0, body.scrollWidth - body.clientWidth));
                    body.scrollTop = clamp(targetY - anchor.clientY + bodyRect.top, 0, Math.max(0, body.scrollHeight - body.clientHeight));
                } else {
                    body.scrollLeft = Math.max(0, (body.scrollWidth - body.clientWidth) / 2);
                    body.scrollTop = Math.max(0, (body.scrollHeight - body.clientHeight) / 2);
                }
            });
        };
        const renderBody = (anchor) => {
            const current = call(context, 'getNode', null, node.id) || node;
            modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-compare-viewer">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(current.title || 'Image Compare')}</span>
    <div class="sai-compare-full-tools">
      <span>${Math.round(zoom * 100)}%</span>
      <button type="button" data-compare-zoom="reset" title="${escapeHtml(t('Reset zoom', '重置缩放'))}"><i class="fa-solid fa-crosshairs"></i></button>
      <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>
  ${call(context, 'renderCompareControls', '', current)}
  <div class="sai-compare-full-body">
    <div class="sai-compare-full-stage">${call(context, 'renderCompareStageHtml', '', current, { maxW: Math.max(360, window.innerWidth), maxH: Math.max(260, window.innerHeight - 104), zoom })}</div>
  </div>
</div>`;
            call(context, 'ensureWorkbenchFormFieldNames', null, modal, 'compare_fullscreen');
            modal.querySelectorAll('[data-compare-position]').forEach((field) => {
                field.addEventListener('input', () => {
                    call(context, 'updateCompareParam', null, current.id, 'position', Number(field.value), 'number', { render: false });
                    call(context, 'refreshCompareDom', null, current.id);
                });
                field.addEventListener('change', () => {
                    call(context, 'updateCompareParam', null, current.id, 'position', Number(field.value), 'number', { render: true });
                    renderBody();
                });
            });
            modal.querySelectorAll('[data-compare-mode]').forEach((button) => {
                button.addEventListener('click', () => {
                    call(context, 'updateCompareParam', null, current.id, 'mode', button.getAttribute('data-compare-mode'), 'text', { render: true });
                    renderBody();
                });
            });
            modal.querySelectorAll('[data-compare-zoom]').forEach((button) => {
                button.addEventListener('click', () => {
                    zoom = 1;
                    renderBody();
                });
            });
            restoreScroll(anchor || null);
        };
        renderBody();
        document.body.appendChild(modal);
        modal.addEventListener('wheel', (evt) => {
            const body = evt.target.closest('.sai-compare-full-body');
            if (!body || !modal.contains(body)) return;
            evt.preventDefault();
            evt.stopPropagation();
            const stageEl = body.querySelector('.sai-compare-stage');
            const stageRect = stageEl ? stageEl.getBoundingClientRect() : null;
            const anchor = stageRect && stageRect.width && stageRect.height ? {
                xRatio: clamp((evt.clientX - stageRect.left) / stageRect.width, 0, 1),
                yRatio: clamp((evt.clientY - stageRect.top) / stageRect.height, 0, 1),
                clientX: evt.clientX,
                clientY: evt.clientY
            } : null;
            const factor = Math.exp(-evt.deltaY * 0.0014);
            zoom = clamp(zoom * factor, 0.25, 8);
            renderBody(anchor);
        }, { passive: false });
        modal.addEventListener('pointerdown', (evt) => {
            if (evt.button !== 0) return;
            const stageEl = evt.target.closest('.sai-compare-stage');
            if (!stageEl) return;
            call(context, 'startComparePositionDrag', null, call(context, 'getNode', null, node.id) || node, stageEl, evt);
        }, true);
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) modal.remove();
        });
    }

    window.SimpAICanvasWorkbenchMediaViewers = {
        createMediaViewerContext,
        getNodeImageSrc,
        nodeHasViewableImage,
        openAssetViewer,
        openCompareFullscreen,
        openImageViewer,
        openMediaViewer,
        openNodeMediaFullscreen
    };
})();
