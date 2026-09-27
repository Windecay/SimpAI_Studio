(function () {
    'use strict';

    function cloneRunValue(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value ?? fallback));
        } catch (err) {
            return fallback;
        }
    }

    window.SimpAICanvasWorkbenchRunValueSerializer = Object.assign(
        {},
        window.SimpAICanvasWorkbenchRunValueSerializer || {},
        { cloneRunValue }
    );
})();
