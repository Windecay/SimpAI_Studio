(function () {
    'use strict';

    function createCanvasModeController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const getViewport = () => typeof scope.getViewport === 'function' ? scope.getViewport() : null;
        const getMode = () => typeof scope.getMode === 'function' ? scope.getMode() : null;

        function setMode(nextMode) {
            const resolvedMode = ['select', 'hand', 'connect', 'preset'].includes(nextMode) ? nextMode : 'select';
            call('setModeState', resolvedMode);
            if (resolvedMode === 'preset') {
                call('openPresetPalette', call('viewportCenterWorld'));
                call('setModeState', 'select');
            }
            renderMode();
        }

        function renderMode() {
            const root = getRoot();
            const viewport = getViewport();
            if (!root || !viewport) return;
            root.querySelectorAll('[data-canvas-mode]').forEach((button) => {
                button.classList.toggle('is-active', button.getAttribute('data-canvas-mode') === getMode());
            });
            viewport.classList.toggle('is-hand-mode', getMode() === 'hand');
            viewport.classList.toggle('is-connect-mode', getMode() === 'connect');
        }

        return { setMode, renderMode };
    }

    window.SimpAICanvasWorkbenchMode = Object.assign({}, window.SimpAICanvasWorkbenchMode || {}, {
        createCanvasModeController
    });
})();
