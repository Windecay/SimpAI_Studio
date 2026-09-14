(function () {
    'use strict';

    function call(context, name, fallback, ...args) {
        return typeof context?.[name] === 'function' ? context[name](...args) : fallback;
    }

    function t(context, en, cn) {
        return call(context, 't', cn || en, en, cn);
    }

    function escapeHtml(context, value) {
        return call(context, 'escapeHtml', String(value ?? ''), value);
    }

    function clamp(context, value, min, max) {
        return call(context, 'clamp', Math.max(min, Math.min(max, value)), value, min, max);
    }

    function uid(context, prefix) {
        const fallback = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
        return call(context, 'uid', fallback, prefix);
    }

    function nowIso(context) {
        return call(context, 'nowIso', new Date().toISOString());
    }

    function getDocument(context) {
        return call(context, 'getDocument', typeof document !== 'undefined' ? document : null);
    }

    function getImageConstructor(context) {
        return typeof context?.Image === 'function'
            ? context.Image
            : (typeof Image !== 'undefined' ? Image : null);
    }

    function schedule(context, ...args) {
        if (typeof context?.setTimeout === 'function') return context.setTimeout(...args);
        if (typeof globalThis?.setTimeout === 'function') return globalThis.setTimeout(...args);
        return undefined;
    }

    function delegate(context, name) {
        if (typeof context?.[name] !== 'function') return undefined;
        return (...args) => context[name](...args);
    }

    function createMaskEditorContext(source) {
        const scope = source?.maskEditorSource || source || {};
        const languageSource = scope.languageSource || {};
        const utilitySource = scope.utilitySource || {};
        const domSource = scope.domSource || {};
        const mediaSource = scope.mediaSource || {};
        const nodeSource = scope.nodeSource || {};
        const viewSource = scope.viewSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const uiSource = scope.uiSource || {};
        return {
            t: typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en),
            escapeHtml: typeof utilitySource.escapeHtml === 'function' ? utilitySource.escapeHtml : (value => String(value ?? '')),
            clamp: typeof utilitySource.clamp === 'function' ? utilitySource.clamp : ((value, min, max) => Math.max(min, Math.min(max, value))),
            uid: typeof utilitySource.uid === 'function' ? utilitySource.uid : undefined,
            nowIso: typeof utilitySource.nowIso === 'function' ? utilitySource.nowIso : undefined,
            getDocument: () => typeof domSource.getDocument === 'function'
                ? domSource.getDocument()
                : domSource.document || (typeof document !== 'undefined' ? document : null),
            Image: mediaSource.Image || (typeof Image !== 'undefined' ? Image : null),
            setTimeout: mediaSource.setTimeout || (typeof globalThis?.setTimeout === 'function' ? globalThis.setTimeout : undefined),
            applyImageFileToNode: delegate(nodeSource, 'applyImageFileToNode'),
            getNodeImageSrc: delegate(nodeSource, 'getNodeImageSrc'),
            buildMediaNodeStatePatch: delegate(nodeSource, 'buildMediaNodeStatePatch'),
            isNodeLocked: delegate(nodeSource, 'isNodeLocked'),
            detectWorkbenchTheme: delegate(viewSource, 'detectWorkbenchTheme'),
            ensureWorkbenchFormFieldNames: delegate(viewSource, 'ensureWorkbenchFormFieldNames'),
            createThumbnailDataUrl: delegate(runtimeSource, 'createThumbnailDataUrl'),
            mutate: delegate(runtimeSource, 'mutate'),
            pushHistory: delegate(runtimeSource, 'pushHistory'),
            showToast: delegate(uiSource, 'showToast')
        };
    }

    async function replaceNodeImage(node, context) {
        if (!node || !['image', 'result'].includes(node.type)) return;
        if (call(context, 'isNodeLocked', false, node)) {
            call(context, 'showToast', null, t(context, 'Locked node cannot be edited', '锁定节点不能编辑'));
            return;
        }
        const doc = getDocument(context);
        if (!doc?.createElement || !doc.body) return;
        const input = doc.createElement('input');
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
        doc.body.appendChild(input);
        input.click();
    }

    function openMaskEditor(node, context) {
        const src = call(context, 'getNodeImageSrc', '', node);
        if (call(context, 'isNodeLocked', false, node)) {
            call(context, 'showToast', null, t(context, 'Locked node cannot be edited', '锁定节点不能编辑'));
            return;
        }
        if (!node || node.type !== 'image' || !src) {
            call(context, 'showToast', null, t(context, 'Current image node cannot paint a Mask.', '当前图片节点无法绘制 Mask'));
            return;
        }
        const doc = getDocument(context);
        if (!doc?.createElement || !doc.body) return;
        const modal = doc.createElement('div');
        modal.className = 'sai-canvas-modal';
        modal.classList.toggle('theme-dark', call(context, 'detectWorkbenchTheme', 'dark') === 'dark');
        modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-mask-editor">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(context, t(context, 'Paint Mask', '绘制 Mask'))}</span>
    <button type="button" data-modal-close title="${escapeHtml(context, t(context, 'Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-mask-toolbar">
    <label>${escapeHtml(context, t(context, 'Brush', '笔刷'))} <input data-mask-size type="range" min="4" max="96" value="28"></label>
    <button type="button" data-mask-clear><i class="fa-solid fa-eraser"></i><span>${escapeHtml(context, t(context, 'Clear', '清空'))}</span></button>
    <button type="button" data-mask-save><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(context, t(context, 'Save', '保存'))}</span></button>
  </div>
  <div class="sai-mask-canvas-wrap">
    <img src="${escapeHtml(context, src)}" alt="">
    <canvas></canvas>
  </div>
</div>`;
        call(context, 'ensureWorkbenchFormFieldNames', null, modal, `mask_${node.id || 'node'}`);
        doc.body.appendChild(modal);
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
            const ImageCtor = getImageConstructor(context);
            if (!ImageCtor) return;
            const mask = new ImageCtor();
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
        schedule(context, resize, 0);
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
                const mask = {
                    kind: 'canvas_mask',
                    asset_id: uid(context, 'mask'),
                    name: `${node.title || node.id || 'image'}.mask.png`,
                    mime: 'image/png',
                    width: canvas.width,
                    height: canvas.height,
                    data_url: dataUrl,
                    thumb,
                    updated_at: nowIso(context)
                };
                const patch = call(context, 'buildMediaNodeStatePatch', {}, node, { mask });
                Object.assign(node, patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'mask')
                    ? patch
                    : { mask });
                modal.remove();
                call(context, 'mutate', null);
                call(context, 'showToast', null, t(context, 'Mask saved to image node.', 'Mask 已保存到图片节点'));
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
