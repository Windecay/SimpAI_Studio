(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? ''));
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
    const t = UTILS.t || ((en, cn) => cn || en);
    const uid = UTILS.uid || ((prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`);
    const nowIso = UTILS.nowIso || (() => new Date().toISOString());

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createMaskEditorContext(source) {
        const context = source || {};
        return {
            applyImageFileToNode: delegate(context, 'applyImageFileToNode'),
            createThumbnailDataUrl: delegate(context, 'createThumbnailDataUrl'),
            detectWorkbenchTheme: delegate(context, 'detectWorkbenchTheme'),
            ensureWorkbenchFormFieldNames: delegate(context, 'ensureWorkbenchFormFieldNames'),
            getNodeImageSrc: delegate(context, 'getNodeImageSrc'),
            isNodeLocked: delegate(context, 'isNodeLocked'),
            mutate: delegate(context, 'mutate'),
            pushHistory: delegate(context, 'pushHistory'),
            showToast: delegate(context, 'showToast')
        };
    }

    async function replaceNodeImage(node, context) {
        if (!node || !['image', 'result'].includes(node.type)) return;
        if (call(context, 'isNodeLocked', false, node)) {
            call(context, 'showToast', null, t('Locked node cannot be edited', '锁定节点不能编辑'));
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.hidden = true;
        input.addEventListener('change', async () => {
            try {
                const file = input.files && input.files[0];
                if (!file) return;
                await call(context, 'applyImageFileToNode', null, node, file, { history: 'Replace image', sourceKind: 'manual_upload' });
            } finally {
                input.remove();
            }
        }, { once: true });
        document.body.appendChild(input);
        input.click();
    }

    function openMaskEditor(node, context) {
        const src = call(context, 'getNodeImageSrc', '', node);
        if (call(context, 'isNodeLocked', false, node)) {
            call(context, 'showToast', null, t('Locked node cannot be edited', '锁定节点不能编辑'));
            return;
        }
        if (!node || node.type !== 'image' || !src) {
            call(context, 'showToast', null, t('Current image node cannot paint a Mask.', '当前图片节点无法绘制 Mask'));
            return;
        }
        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-mask-editor">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(t('Paint Mask', '绘制 Mask'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-mask-toolbar">
    <label>${escapeHtml(t('Brush', '笔刷'))} <input data-mask-size type="range" min="4" max="96" value="28"></label>
    <button type="button" data-mask-clear><i class="fa-solid fa-eraser"></i><span>${escapeHtml(t('Clear', '清空'))}</span></button>
    <button type="button" data-mask-save><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(t('Save', '保存'))}</span></button>
  </div>
  <div class="sai-mask-canvas-wrap">
    <img src="${escapeHtml(src)}" alt="">
    <canvas></canvas>
  </div>
</div>`;
        call(context, 'ensureWorkbenchFormFieldNames', null, modal, `mask_${node.id || 'node'}`);
        document.body.appendChild(modal);
        const img = modal.querySelector('img');
        const canvas = modal.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        let drawing = false;
        let lastPoint = null;
        let strokeStartPoint = null;
        const existingMaskUrl = node.mask?.data_url || '';
        const naturalSize = () => ({
            width: Math.max(1, Math.round(img.naturalWidth || node.asset?.width || canvas.width || 1)),
            height: Math.max(1, Math.round(img.naturalHeight || node.asset?.height || canvas.height || 1))
        });
        const drawExistingMask = () => {
            if (!existingMaskUrl) return;
            const mask = new Image();
            mask.onload = () => ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
            mask.src = existingMaskUrl;
        };
        const resize = () => {
            const rect = img.getBoundingClientRect();
            const wrapRect = img.parentElement.getBoundingClientRect();
            const size = naturalSize();
            const changed = canvas.width !== size.width || canvas.height !== size.height;
            if (changed) {
                canvas.width = size.width;
                canvas.height = size.height;
                drawExistingMask();
            }
            canvas.style.width = `${Math.round(rect.width)}px`;
            canvas.style.height = `${Math.round(rect.height)}px`;
            canvas.style.left = `${Math.round(rect.left - wrapRect.left + img.parentElement.scrollLeft)}px`;
            canvas.style.top = `${Math.round(rect.top - wrapRect.top + img.parentElement.scrollTop)}px`;
        };
        img.onload = resize;
        setTimeout(resize, 0);
        const point = (evt) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / Math.max(1, rect.width);
            const scaleY = canvas.height / Math.max(1, rect.height);
            return {
                x: clamp((evt.clientX - rect.left) * scaleX, 0, canvas.width),
                y: clamp((evt.clientY - rect.top) * scaleY, 0, canvas.height)
            };
        };
        const constrainPoint = (p, evt) => {
            if (!evt.shiftKey || !strokeStartPoint) return p;
            const dx = Math.abs(p.x - strokeStartPoint.x);
            const dy = Math.abs(p.y - strokeStartPoint.y);
            return dx >= dy
                ? { x: p.x, y: strokeStartPoint.y }
                : { x: strokeStartPoint.x, y: p.y };
        };
        const paintLine = (from, to) => {
            const size = Number(modal.querySelector('[data-mask-size]').value || 28);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        };
        const paintDot = (p) => {
            const size = Number(modal.querySelector('[data-mask-size]').value || 28);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
            ctx.fill();
        };
        canvas.addEventListener('pointerdown', (evt) => {
            evt.preventDefault();
            drawing = true;
            canvas.setPointerCapture(evt.pointerId);
            strokeStartPoint = point(evt);
            lastPoint = strokeStartPoint;
            paintDot(lastPoint);
        });
        canvas.addEventListener('pointermove', (evt) => {
            if (!drawing) return;
            evt.preventDefault();
            const nextPoint = constrainPoint(point(evt), evt);
            paintLine(lastPoint || nextPoint, nextPoint);
            lastPoint = nextPoint;
        });
        const stopDrawing = () => {
            drawing = false;
            lastPoint = null;
            strokeStartPoint = null;
        };
        canvas.addEventListener('pointerup', stopDrawing);
        canvas.addEventListener('pointercancel', stopDrawing);
        modal.querySelector('[data-mask-clear]').addEventListener('click', () => ctx.clearRect(0, 0, canvas.width, canvas.height));
        modal.querySelector('[data-mask-save]').addEventListener('click', () => {
            const dataUrl = canvas.toDataURL('image/png');
            call(context, 'createThumbnailDataUrl', Promise.resolve(''), dataUrl, 720).then((thumb) => {
                call(context, 'pushHistory', null, 'Save mask');
                node.mask = {
                    kind: 'canvas_mask',
                    asset_id: uid('mask'),
                    name: `${node.title || node.id || 'image'}.mask.png`,
                    mime: 'image/png',
                    width: canvas.width,
                    height: canvas.height,
                    data_url: dataUrl,
                    thumb,
                    updated_at: nowIso()
                };
                modal.remove();
                call(context, 'mutate', null);
                call(context, 'showToast', null, t('Mask saved to image node.', 'Mask 已保存到图片节点'));
            });
        });
        modal.addEventListener('click', (evt) => {
            if (evt.target === modal || evt.target.closest('[data-modal-close]')) modal.remove();
        });
    }

    window.SimpAICanvasWorkbenchMaskEditor = {
        createMaskEditorContext,
        openMaskEditor,
        replaceNodeImage
    };
})();
