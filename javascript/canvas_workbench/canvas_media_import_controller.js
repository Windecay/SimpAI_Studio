(function () {
    'use strict';

    function createCanvasMediaImportController(context) {
        const scope = context?.mediaImportSource || context || {};
        const domSource = scope.domSource || {};
        const transferSource = scope.transferSource || {};
        const mediaBrowserSource = scope.mediaBrowserSource || {};
        const fileSource = scope.fileSource || {};
        const factorySource = scope.factorySource || {};
        const layoutSource = scope.layoutSource || {};
        const projectSource = scope.projectSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const storageSource = scope.storageSource || {};
        const metadataSource = scope.metadataSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        let importFileInput = null;
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const warn = typeof uiSource.warn === 'function' ? uiSource.warn : console.warn;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function finishImportedNode(node, world, logKind) {
            if (!node) return null;
            call(layoutSource, 'placeNodeAvoidingOverlap', undefined, node, world);
            const project = call(projectSource, 'getProject', {}) || {};
            Object.assign(project, call(projectSource, 'buildProjectNodeAppendPatch', {}, project, node));
            call(selectionSource, 'selectImportedNode', undefined, node.id);
            call(renderSource, 'mutate', undefined);
            call(storageSource, 'materializeNodeAssetForStorage', Promise.resolve(), node.id)
                .catch(err => warn(`[SimpAI Canvas] ${logKind} materialize skipped:`, err));
            return node;
        }

        async function addImageNodeFromFile(file, world) {
            const dataUrl = await call(fileSource, 'readFileAsDataUrl', '', file);
            const dimensions = await call(fileSource, 'getImageDimensions', {}, dataUrl);
            const thumb = await call(fileSource, 'createThumbnailDataUrl', '', dataUrl, 1024);
            call(historySource, 'pushHistory', undefined, 'Add image node');
            const node = call(factorySource, 'buildImageNodeFromFile', null, file, world, dataUrl, dimensions, thumb);
            if (!node) return null;
            call(layoutSource, 'fitImageNodeToAssetBounds', undefined, node, node.asset, { preserveCenter: false });
            return finishImportedNode(node, world, 'image');
        }

        async function addMediaNodeFromFile(file, world) {
            if (call(fileSource, 'isImageFile', false, file)) return addImageNodeFromFile(file, world);
            const type = call(fileSource, 'isVideoFile', false, file) ? 'video' : 'audio';
            const dataUrl = await call(fileSource, 'readFileAsDataUrl', '', file);
            const metadata = await call(fileSource, 'getMediaMetadata', {}, dataUrl, type);
            const previewFrames = type === 'video'
                ? await call(fileSource, 'createVideoStoryboardDataUrls', [], dataUrl, metadata.duration, 8) : [];
            const waveform = type === 'audio' ? await call(fileSource, 'createAudioWaveformPeaks', [], file, 96) : [];
            call(historySource, 'pushHistory', undefined, `Add ${type} node`);
            const node = call(factorySource, 'buildMediaNodeFromFile', null, file, type, world, dataUrl, metadata, previewFrames, waveform);
            return finishImportedNode(node, world, 'media');
        }

        function addOutputGalleryMediaNode(item, world) {
            if (!item) return null;
            const mediaType = item.media_type === 'video' ? 'video' : 'image';
            const generationMetadata = call(metadataSource, 'mediaBrowserItemMetadata', {}, item);
            call(historySource, 'pushHistory', undefined, mediaType === 'video' ? 'Add gallery video node' : 'Add gallery image node');
            const node = call(factorySource, 'buildOutputGalleryMediaNode', null, item, world, generationMetadata);
            if (!node) return null;
            call(layoutSource, 'placeNodeAvoidingOverlap', undefined, node, world || call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 }));
            const project = call(projectSource, 'getProject', {}) || {};
            Object.assign(project, call(projectSource, 'buildProjectNodeAppendPatch', {}, project, node));
            call(selectionSource, 'selectGalleryNode', undefined, node.id);
            call(renderSource, 'mutate', undefined);
            return node;
        }

        async function addImageNodeFromTransferItem(item, world) {
            const dimensions = await call(fileSource, 'getImageDimensions', {}, item.dataUrl || item.previewUrl || '');
            const thumb = item.dataUrl
                ? await call(fileSource, 'createThumbnailDataUrl', '', item.dataUrl, 1024) : (item.previewUrl || '');
            call(historySource, 'pushHistory', undefined, 'Add image node');
            const node = call(factorySource, 'buildImageNodeFromTransferItem', null, item, world, dimensions, thumb);
            if (!node) return null;
            call(layoutSource, 'fitImageNodeToAssetBounds', undefined, node, node.asset, { preserveCenter: false });
            call(layoutSource, 'placeNodeAvoidingOverlap', undefined, node, world);
            const project = call(projectSource, 'getProject', {}) || {};
            Object.assign(project, call(projectSource, 'buildProjectNodeAppendPatch', {}, project, node));
            call(selectionSource, 'selectImportedNode', undefined, node.id);
            call(renderSource, 'mutate', undefined);
            call(uiSource, 'showToast', undefined, t('Image node imported.', '已导入图片节点'));
            return node;
        }

        async function importSelectedTransferAt(world) {
            const station = call(transferSource, 'getTransferStation', null);
            if (!station) {
                call(uiSource, 'showToast', undefined, t('Transfer Station API is not ready.', '中转站 API 未就绪'));
                return;
            }
            let items = [];
            if (typeof station.getItems === 'function') {
                items = await station.getItems({ dataUrl: true, file: false });
            } else if (typeof station.getAllItems === 'function') {
                items = await station.getAllItems({ dataUrl: true, file: false });
            } else if (typeof station.getSelectedItem === 'function') {
                const item = await station.getSelectedItem({ dataUrl: true, file: false });
                if (item) items = [item];
            }
            if (!items.length) {
                call(uiSource, 'showToast', undefined, t('Transfer Station has no importable images.', '中转站没有可导入图片'));
                return;
            }
            let offset = 0;
            let importedCount = 0;
            for (const item of items) {
                const node = await addImageNodeFromTransferItem(item, { x: world.x + offset, y: world.y + offset });
                if (node) importedCount += 1;
                offset += 28;
            }
            if (importedCount) {
                call(uiSource, 'showToast', undefined, t('Imported {count} transfer-station image(s).', '已导入 {count} 张中转站图片').replace('{count}', importedCount));
            }
        }

        async function importTransferItemAt(id, world) {
            const station = call(transferSource, 'getTransferStation', null);
            if (!station || typeof station.getItem !== 'function') {
                call(uiSource, 'showToast', undefined, t('Transfer Station API is not ready.', '中转站 API 未就绪'));
                return;
            }
            const item = await station.getItem(id, { dataUrl: true, file: false });
            if (!item) return;
            return addImageNodeFromTransferItem(item, world);
        }

        function openImageFilePicker(world) {
            const doc = call(domSource, 'getDocument', null);
            importFileInput = importFileInput || doc.createElement('input');
            importFileInput.type = 'file';
            importFileInput.accept = 'image/*,video/*,audio/*';
            importFileInput.multiple = false;
            try { importFileInput.webkitdirectory = false; } catch (err) {}
            try { importFileInput.directory = false; } catch (err) {}
            importFileInput.removeAttribute('webkitdirectory');
            importFileInput.removeAttribute('directory');
            importFileInput.hidden = true;
            if (!importFileInput.isConnected) doc.body.appendChild(importFileInput);
            importFileInput.onchange = async () => {
                const files = Array.from(importFileInput.files || [])
                    .filter(file => call(fileSource, 'isMediaFile', false, file)).slice(0, 1);
                let offset = 0;
                let importedCount = 0;
                for (const file of files) {
                    const node = await addMediaNodeFromFile(file, { x: world.x + offset, y: world.y + offset });
                    if (node) importedCount += 1;
                    offset += 28;
                }
                importFileInput.value = '';
                if (importedCount) {
                    call(uiSource, 'showToast', undefined, t('Imported {count} local media file(s).', '已导入 {count} 个本地媒体').replace('{count}', importedCount));
                }
            };
            importFileInput.click();
        }

        async function importSelectedMediaBrowserItem(modal) {
            const item = call(mediaBrowserSource, 'selectedMediaBrowserItem', null, modal);
            if (!item) return;
            const state = modal.__mediaBrowserState || call(mediaBrowserSource, 'mediaBrowserInitialState', {},
                call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 }));
            const world = state.world || call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 });
            await addMediaBrowserItemToCanvas(item, state, world);
        }

        async function addMediaBrowserItemToCanvas(item, state, world) {
            if (!item) return null;
            try {
                const position = world || call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 });
                if (state?.tab === 'danbooru') {
                    return await call(mediaBrowserSource, 'importDanbooruGalleryPost', null, item, position);
                }
                const node = addOutputGalleryMediaNode(item, position);
                if (!node) {
                    call(uiSource, 'showToast', undefined, t('Media import failed.', '媒体导入失败。'));
                    return null;
                }
                call(uiSource, 'showToast', undefined, t('Gallery media added to canvas.', '画廊媒体已加入画布。'));
                return node;
            } catch (err) {
                warn('[CanvasWorkbench] media browser import failed', err);
                call(uiSource, 'showToast', undefined, t('Media import failed.', '媒体导入失败。'));
            }
            return null;
        }

        async function addMediaBrowserPayloadToCanvas(payload, world) {
            if (!payload?.item) return null;
            const state = call(mediaBrowserSource, 'normalizeMediaBrowserState', {}, payload.state || {},
                world || call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 }));
            state.tab = payload.tab === 'danbooru' || state.tab === 'danbooru' ? 'danbooru' : 'outputs';
            state.mediaType = payload.media_type === 'video' || state.mediaType === 'video' ? 'video' : 'image';
            state.selectedId = String(payload.item.id || state.selectedId || '');
            return addMediaBrowserItemToCanvas(payload.item, state,
                world || call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 }));
        }

        return {
            addImageNodeFromFile, addMediaNodeFromFile, addOutputGalleryMediaNode, addImageNodeFromTransferItem,
            importSelectedTransferAt, importTransferItemAt, openImageFilePicker,
            importSelectedMediaBrowserItem, addMediaBrowserItemToCanvas, addMediaBrowserPayloadToCanvas
        };
    }

    window.SimpAICanvasWorkbenchMediaImport = Object.assign(
        {}, window.SimpAICanvasWorkbenchMediaImport || {}, { createCanvasMediaImportController }
    );
})();
