(function () {
    'use strict';

    function createCanvasToastController(context) {
        const scope = context?.toastSource || context || {};
        const domSource = scope.domSource || {};
        const timingSource = scope.timingSource || {};
        const getToastElement = () => typeof domSource.getToastElement === 'function'
            ? domSource.getToastElement()
            : null;
        const schedule = (...args) => typeof timingSource.setTimeout === 'function'
            ? timingSource.setTimeout(...args)
            : undefined;
        const cancel = (handle) => {
            if (typeof timingSource.clearTimeout === 'function') timingSource.clearTimeout(handle);
        };
        let hideTimer = null;

        function showToast(message, durationMs) {
            const toastEl = getToastElement();
            if (!toastEl) return;
            toastEl.textContent = message;
            toastEl.hidden = false;
            if (hideTimer !== null) cancel(hideTimer);
            hideTimer = schedule(() => {
                const current = getToastElement();
                if (current) current.hidden = true;
                hideTimer = null;
            }, Math.max(1200, Number(durationMs || 1800)));
        }

        return { showToast };
    }

    window.SimpAICanvasWorkbenchToast = Object.assign(
        {},
        window.SimpAICanvasWorkbenchToast || {},
        { createCanvasToastController }
    );
})();
