(function () {
    'use strict';

    function createCanvasGalleryRefreshController(source) {
        const scope = source?.galleryRefreshSource || source || {};
        const windowSource = scope.windowSource || {};
        const timingSource = scope.timingSource || {};
        const domSource = scope.domSource || {};
        const uiSource = scope.uiSource || {};
        const diagnosticsSource = scope.diagnosticsSource || {};

        const getWindow = () => typeof windowSource.getWindow === 'function' ? (windowSource.getWindow() || {}) : {};
        const getDocument = () => typeof domSource.getDocument === 'function' ? (domSource.getDocument() || {}) : {};
        const warn = (...args) => {
            if (typeof diagnosticsSource.warn === 'function') diagnosticsSource.warn(...args);
        };
        const info = (...args) => {
            if (typeof diagnosticsSource.info === 'function') diagnosticsSource.info(...args);
        };
        const clickGradioButton = (...args) => typeof uiSource.clickGradioButton === 'function'
            ? uiSource.clickGradioButton(...args)
            : false;
        const getGradioApp = () => typeof uiSource.getGradioApp === 'function'
            ? (uiSource.getGradioApp() || getDocument())
            : getDocument();

        function refreshMainGalleryAfterCanvasRun(result) {
            const galleryEngineType = result?.gallery?.engine_type || 'image';
            try {
                const win = getWindow();
                if (typeof win.syncGalleryMediaSwitch === 'function') {
                    win.syncGalleryMediaSwitch(galleryEngineType, 2600);
                }
            } catch (err) {
                warn('[SimpAI Canvas] gallery media switch sync skipped', err);
            }
            if (result?.gallery?.stat) {
                try {
                    const win = getWindow();
                    if (typeof win.refresh_finished_images_catalog_label === 'function') {
                        win.refresh_finished_images_catalog_label(result.gallery.stat, galleryEngineType);
                    }
                } catch (err) {
                    warn('[SimpAI Canvas] catalog label refresh skipped', err);
                }
            }
            try {
                const trigger = (delay, fallback) => {
                    if (typeof timingSource.setTimeout !== 'function') return;
                    timingSource.setTimeout(() => {
                        let clicked = false;
                        if (typeof uiSource.clickGradioButton === 'function') {
                            clicked = clickGradioButton('canvas_gallery_refresh_btn');
                        }
                        const fallbackButtonId = galleryEngineType === 'video' ? 'gallery_videos_btn' : 'gallery_images_btn';
                        if (!clicked && fallback && typeof uiSource.clickGradioButton === 'function') {
                            clicked = clickGradioButton(fallbackButtonId);
                        }
                        if (!clicked) {
                            const app = getGradioApp();
                            const doc = getDocument();
                            const appGetElementById = typeof app?.getElementById === 'function'
                                ? app.getElementById.bind(app)
                                : null;
                            const documentGetElementById = typeof doc?.getElementById === 'function'
                                ? doc.getElementById.bind(doc)
                                : null;
                            const refreshButton = (appGetElementById ? appGetElementById('canvas_gallery_refresh_btn') : null)
                                || (documentGetElementById ? documentGetElementById('canvas_gallery_refresh_btn') : null)
                                || (fallback ? ((appGetElementById ? appGetElementById(fallbackButtonId) : null)
                                    || (documentGetElementById ? documentGetElementById(fallbackButtonId) : null)) : null);
                            const button = refreshButton && typeof refreshButton.matches === 'function' && refreshButton.matches('button')
                                ? refreshButton
                                : refreshButton?.querySelector?.('button');
                            if (button && typeof button.click === 'function') {
                                button.click();
                                clicked = true;
                            }
                        }
                        info('[SimpAI Canvas] requested main gallery refresh', {
                            clicked,
                            delay,
                            fallback,
                            gallery: result?.gallery || null
                        });
                    }, delay);
                };
                trigger(250, false);
                trigger(1100, false);
                trigger(2300, true);
            } catch (err) {
                warn('[SimpAI Canvas] gallery refresh failed', err);
            }
        }

        return { refreshMainGalleryAfterCanvasRun };
    }

    window.SimpAICanvasWorkbenchGalleryRefresh = Object.assign(
        {},
        window.SimpAICanvasWorkbenchGalleryRefresh || {},
        { createCanvasGalleryRefreshController }
    );
})();
