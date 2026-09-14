(function () {
    'use strict';

    function createCanvasModeController(context) {
        const scope = context?.modeSource || context || {};
        const domSource = scope.domSource || {};
        const stateSource = scope.stateSource || {};
        const paletteSource = scope.paletteSource || {};
        const call = (sourceObject, name, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : undefined;
        const getRoot = () => call(domSource, 'getRoot') || null;
        const getViewport = () => call(domSource, 'getViewport') || null;
        const getMode = () => call(stateSource, 'getMode');

        function setMode(nextMode) {
            const resolvedMode = ['select', 'hand', 'connect', 'preset'].includes(nextMode) ? nextMode : 'select';
            call(stateSource, 'setModeState', resolvedMode);
            if (resolvedMode === 'preset') {
                call(paletteSource, 'openPresetPalette', call(paletteSource, 'viewportCenterWorld'));
                call(stateSource, 'setModeState', 'select');
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
