(function () {
    'use strict';

    function createCanvasVlmChatImagePreviewController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getDocument = () => scope.document || (typeof document !== 'undefined' ? document : null);
        const getWindow = () => scope.window || (typeof window !== 'undefined' ? window : { innerWidth: 0, innerHeight: 0 });
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        let previewEl = null;
        let previewTarget = null;

        function sizeFromDimensions(sourceW, sourceH) {
            const width = Number.isFinite(sourceW) && sourceW > 0 ? sourceW : 1;
            const height = Number.isFinite(sourceH) && sourceH > 0 ? sourceH : 1;
            const configuredTargetPixels = Number(call('getTargetPixels', 40000));
            const targetPixels = configuredTargetPixels > 0 ? configuredTargetPixels : 40000;
            let scale = Math.sqrt(targetPixels / Math.max(1, width * height));
            const longSide = Math.max(width, height) * scale;
            if (longSide < 180) scale *= 180 / Math.max(1, longSide);
            if (longSide > 360) scale *= 360 / Math.max(1, longSide);
            return {
                width: Math.max(36, Math.round(width * scale)),
                height: Math.max(36, Math.round(height * scale))
            };
        }

        function ensureVlmChatImagePreview() {
            if (previewEl && previewEl.isConnected) return previewEl;
            const doc = getDocument();
            if (!doc?.createElement) return null;
            previewEl = doc.createElement('div');
            previewEl.className = 'sai-vlm-chat-image-preview';
            previewEl.hidden = true;
            previewEl.setAttribute('role', 'tooltip');
            (getRoot() || doc.body)?.appendChild?.(previewEl);
            return previewEl;
        }

        function sizeForTarget(target) {
            const img = target?.querySelector?.('img');
            const sourceW = Number(target?.getAttribute?.('data-vlm-chat-image-width') || img?.naturalWidth || 0);
            const sourceH = Number(target?.getAttribute?.('data-vlm-chat-image-height') || img?.naturalHeight || 0);
            return sizeFromDimensions(sourceW, sourceH);
        }

        function breakablePreviewName(name) {
            const escapeHtml = typeof scope.escapeHtml === 'function' ? scope.escapeHtml : value => String(value || '');
            const escaped = escapeHtml(name);
            return escaped
                .replace(/([_.-])/g, '$1<wbr>')
                .replace(/([a-zA-Z0-9]{12})/g, '$1<wbr>');
        }

        function positionVlmChatImagePreview(clientX, clientY) {
            if (!previewEl || previewEl.hidden) return;
            const pad = 12;
            const offset = 16;
            const rect = previewEl.getBoundingClientRect();
            const viewport = getWindow();
            let left = clientX + offset;
            let top = clientY + offset;
            if (left + rect.width + pad > viewport.innerWidth) left = Math.max(pad, clientX - rect.width - offset);
            if (top + rect.height + pad > viewport.innerHeight) top = Math.max(pad, clientY - rect.height - offset);
            previewEl.style.left = `${Math.round(left)}px`;
            previewEl.style.top = `${Math.round(top)}px`;
        }

        function showVlmChatImagePreview(target, clientX, clientY) {
            const root = getRoot();
            if (!target || root?.hidden) return false;
            const img = target.querySelector?.('img');
            const src = img?.currentSrc || img?.src || '';
            const name = String(target.getAttribute?.('data-vlm-chat-image-name') || target.querySelector?.('em')?.textContent || '').trim();
            if (!src && !name) return false;
            if (typeof scope.hideCanvasTooltip === 'function') scope.hideCanvasTooltip();
            previewTarget = target;
            const preview = ensureVlmChatImagePreview();
            if (!preview) return false;
            const size = sizeForTarget(target);
            const panelWidth = Math.max(180, Math.min(240, Number(size.width || 0) || 180));
            const imageScale = Math.min(1, panelWidth / Math.max(1, Number(size.width || 0) || 1));
            const imageWidth = Math.max(36, Math.round(size.width * imageScale));
            const imageHeight = Math.max(36, Math.round(size.height * imageScale));
            preview.style.width = `${panelWidth}px`;
            preview.style.maxWidth = 'calc(100vw - 24px)';
            preview.innerHTML = `${src ? `<img src="${(scope.escapeHtml || String)(src)}" alt="" style="width:${imageWidth}px;height:${imageHeight}px">` : '<i class="fa-solid fa-image"></i>'}${name ? `<span class="sai-vlm-chat-image-preview-name">${breakablePreviewName(name)}</span>` : ''}`;
            preview.hidden = false;
            preview.classList.add('is-visible');
            positionVlmChatImagePreview(clientX, clientY);
            return true;
        }

        function hideVlmChatImagePreview() {
            previewTarget = null;
            if (previewEl) {
                previewEl.classList.remove('is-visible');
                previewEl.hidden = true;
            }
        }

        function onVlmChatImagePreviewPointerOver(evt) {
            const target = evt.target?.closest?.('[data-vlm-chat-image]');
            if (!target || target === previewTarget) return;
            showVlmChatImagePreview(target, evt.clientX, evt.clientY);
        }

        function onVlmChatImagePreviewPointerMove(evt) {
            if (!previewTarget) return;
            if (!previewTarget.isConnected) {
                hideVlmChatImagePreview();
                return;
            }
            positionVlmChatImagePreview(evt.clientX, evt.clientY);
        }

        function onVlmChatImagePreviewPointerOut(evt) {
            if (!previewTarget) return;
            if (evt.relatedTarget && previewTarget.contains?.(evt.relatedTarget)) return;
            hideVlmChatImagePreview();
        }

        return {
            sizeFromDimensions,
            ensureVlmChatImagePreview,
            sizeForTarget,
            breakablePreviewName,
            positionVlmChatImagePreview,
            showVlmChatImagePreview,
            hideVlmChatImagePreview,
            onVlmChatImagePreviewPointerOver,
            onVlmChatImagePreviewPointerMove,
            onVlmChatImagePreviewPointerOut
        };
    }

    window.SimpAICanvasWorkbenchVlmChatImagePreview = Object.assign({}, window.SimpAICanvasWorkbenchVlmChatImagePreview || {}, {
        createCanvasVlmChatImagePreviewController
    });
})();
