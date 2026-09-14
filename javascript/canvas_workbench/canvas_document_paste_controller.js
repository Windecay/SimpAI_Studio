(function () {
    'use strict';

    function createCanvasDocumentPasteController(context) {
        const scope = context?.documentPasteSource || context || {};
        const domSource = scope.domSource || {};
        const inputSource = scope.inputSource || {};
        const viewportSource = scope.viewportSource || {};
        const actionSource = scope.actionSource || {};
        const sourceCall = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getRoot = () => sourceCall(domSource, 'getRoot', null);
        const isEditableElement = (target) => !!sourceCall(inputSource, 'isEditableElement', false, target);
        const viewportCenterWorld = () => sourceCall(viewportSource, 'viewportCenterWorld', { x: 0, y: 0 }) || { x: 0, y: 0 };
        const addImageNodeFromFile = (...args) => sourceCall(actionSource, 'addImageNodeFromFile', undefined, ...args);

        async function onDocumentPaste(evt) {
            const root = getRoot();
            if (!root || root.hidden || isEditableElement(evt?.target)) return;
            const items = Array.from(evt?.clipboardData?.items || []);
            const imageItems = items.filter(item => item?.type && item.type.startsWith('image/'));
            if (!imageItems.length) return;
            evt.preventDefault?.();
            let offset = 0;
            const base = viewportCenterWorld();
            for (const item of imageItems) {
                const file = typeof item?.getAsFile === 'function' ? item.getAsFile() : null;
                if (!file) continue;
                await addImageNodeFromFile(file, { x: base.x + offset, y: base.y + offset });
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
