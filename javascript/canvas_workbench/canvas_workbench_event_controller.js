(function () {
    'use strict';

    function createCanvasWorkbenchEventController(context) {
        const source = context?.workbenchEventSource || context || {};
        const call = (name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getHandler = name => typeof source[name] === 'function' ? source[name] : undefined;
        let presetSpecialMessageBound = false;

        function bindWorkbenchEvents() {
            const root = call('getRoot', null);
            const viewport = call('getViewport', null);
            const palette = call('getPalette', null);
            const win = call('getWindow', null);
            if (!root || !viewport || !palette || !win) return false;

            root.addEventListener('click', getHandler('onCanvasWorkbenchClick'));
            call('bindCanvasInputEvents', undefined);
            viewport.addEventListener('pointerdown', getHandler('onViewportPointerDown'));
            viewport.addEventListener('wheel', getHandler('onViewportWheel'), { passive: false });
            viewport.addEventListener('dragover', getHandler('onViewportDragOver'));
            viewport.addEventListener('dragleave', getHandler('onViewportDragLeave'));
            viewport.addEventListener('drop', getHandler('onViewportDrop'));
            viewport.addEventListener('contextmenu', getHandler('onViewportContextMenu'));
            viewport.addEventListener('dblclick', getHandler('onViewportDoubleClick'));
            viewport.addEventListener('auxclick', (evt) => {
                if (evt.button === 1) evt.preventDefault();
            });
            root.addEventListener('pointerover', getHandler('onVlmChatImagePreviewPointerOver'), true);
            root.addEventListener('pointermove', getHandler('onVlmChatImagePreviewPointerMove'), true);
            root.addEventListener('pointerout', getHandler('onVlmChatImagePreviewPointerOut'), true);

            const minimap = call('getMinimap', null);
            if (minimap) minimap.addEventListener('pointerdown', getHandler('onMinimapPointerDown'));
            const outpaintOverlay = call('getOutpaintOverlay', null);
            if (outpaintOverlay) outpaintOverlay.addEventListener('pointerdown', getHandler('onOutpaintOverlayPointerDown'));

            if (!presetSpecialMessageBound) {
                presetSpecialMessageBound = true;
                win.addEventListener('message', getHandler('handlePresetSpecialViewerMessage'));
            }

            palette.querySelector('[data-palette-close]').addEventListener('click', getHandler('closePresetPalette'));
            palette.querySelector('.sai-canvas-palette-search').addEventListener('input', getHandler('renderPresetPalette'));
            palette.addEventListener('click', (evt) => call('handlePresetPaletteClick', undefined, evt));

            win.addEventListener('resize', () => {
                const currentRoot = call('getRoot', null);
                if (!currentRoot || currentRoot.hidden) return;
                call('renderAll', undefined, { inspector: false });
                if (call('hasDanbooruAutocompleteField', false)) call('positionDanbooruAutocompleteDropdown', undefined);
            });
            return true;
        }

        return { bindWorkbenchEvents };
    }

    window.SimpAICanvasWorkbenchEvent = Object.assign(
        window.SimpAICanvasWorkbenchEvent || {},
        { createCanvasWorkbenchEventController }
    );
})();
