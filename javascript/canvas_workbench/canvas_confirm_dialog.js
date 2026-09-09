(function () {
    'use strict';

    function createCanvasConfirmDialogController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const escapeHtml = scope.escapeHtml || (value => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;'));

        function getDocument() {
            return scope.document || (typeof document !== 'undefined' ? document : null);
        }

        function requestCanvasConfirmDialog(options) {
            const opts = options || {};
            const doc = getDocument();
            if (!doc?.createElement) return Promise.resolve(false);
            return new Promise((resolve) => {
                const modal = doc.createElement('div');
                const theme = typeof scope.detectWorkbenchTheme === 'function' ? scope.detectWorkbenchTheme() : '';
                modal.className = `sai-canvas-modal sai-canvas-confirm-modal ${theme === 'dark' ? 'theme-dark' : ''}`;
                modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-canvas-confirm-panel ${opts.danger ? 'is-danger' : ''}">
  <div class="sai-canvas-confirm-body">
    <div class="sai-canvas-confirm-icon"><i class="fa-solid ${escapeHtml(opts.icon || (opts.danger ? 'fa-trash' : 'fa-circle-question'))}"></i></div>
    <div class="sai-canvas-confirm-copy">
      <h3>${escapeHtml(opts.title || t('Confirm action', '确认操作'))}</h3>
      ${opts.message ? `<p>${escapeHtml(opts.message)}</p>` : ''}
      ${opts.detail ? `<small>${escapeHtml(opts.detail)}</small>` : ''}
    </div>
  </div>
  <div class="sai-canvas-confirm-actions">
    <button type="button" data-confirm-cancel>${escapeHtml(opts.cancelLabel || t('Cancel', '取消'))}</button>
    <button type="button" class="primary ${opts.danger ? 'danger' : ''}" data-confirm-ok>${escapeHtml(opts.confirmLabel || t('Confirm', '确认'))}</button>
  </div>
</div>`;
                let settled = false;
                const cleanup = (value) => {
                    if (settled) return;
                    settled = true;
                    doc.removeEventListener?.('keydown', onKeyDown);
                    if (typeof modal.remove === 'function') modal.remove();
                    else modal.parentNode?.removeChild?.(modal);
                    resolve(!!value);
                };
                const onKeyDown = (evt) => {
                    if (evt.key === 'Escape') {
                        evt.preventDefault();
                        cleanup(false);
                    } else if (evt.key === 'Enter') {
                        evt.preventDefault();
                        cleanup(true);
                    }
                };
                modal.addEventListener?.('click', (evt) => {
                    const target = evt.target;
                    if (target === modal || target?.closest?.('[data-confirm-cancel]')) cleanup(false);
                    if (target?.closest?.('[data-confirm-ok]')) cleanup(true);
                });
                doc.addEventListener?.('keydown', onKeyDown);
                doc.body?.appendChild?.(modal);
                modal.querySelector?.('[data-confirm-ok]')?.focus?.({ preventScroll: true });
            });
        }

        return { requestCanvasConfirmDialog };
    }

    window.SimpAICanvasWorkbenchConfirmDialog = Object.assign({}, window.SimpAICanvasWorkbenchConfirmDialog || {}, {
        createCanvasConfirmDialogController
    });
})();
