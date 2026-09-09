(function () {
    'use strict';

    function createCanvasDocumentPasteController(context) {
        const scope = context || {};
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;

        async function onDocumentPaste(evt) {
            const root = getRoot();
            if (!root || root.hidden || call('isEditableElement', evt?.target)) return;
            const items = Array.from(evt?.clipboardData?.items || []);
            const imageItems = items.filter(item => item?.type && item.type.startsWith('image/'));
            if (!imageItems.length) return;
            evt.preventDefault?.();
            let offset = 0;
            const base = call('viewportCenterWorld') || { x: 0, y: 0 };
            for (const item of imageItems) {
                const file = typeof item?.getAsFile === 'function' ? item.getAsFile() : null;
                if (!file) continue;
                await call('addImageNodeFromFile', file, { x: base.x + offset, y: base.y + offset });
                offset += 28;
            }
        }

        return {
            onDocumentPaste
        };
    }

    window.SimpAICanvasWorkbenchDocumentPaste = Object.assign({}, window.SimpAICanvasWorkbenchDocumentPaste || {}, {
        createCanvasDocumentPasteController
    });
})();
