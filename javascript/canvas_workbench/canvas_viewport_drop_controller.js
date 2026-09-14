(function () {
    'use strict';

    function createCanvasViewportDropController(context) {
        const scope = context?.viewportDropSource || context || {};
        const domSource = scope.domSource || {};
        const transferSource = scope.transferSource || {};
        const mediaBrowserSource = scope.mediaBrowserSource || {};
        const fileSource = scope.fileSource || {};
        const viewportSource = scope.viewportSource || {};
        const sourceCall = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getViewport = () => sourceCall(domSource, 'getViewport', null);
        const getTransferStation = () => sourceCall(transferSource, 'getTransferStation', null);
        const mediaBrowserCall = (name, fallback, ...args) => sourceCall(mediaBrowserSource, name, fallback, ...args);
        const transferCall = (name, fallback, ...args) => sourceCall(transferSource, name, fallback, ...args);
        const fileCall = (name, fallback, ...args) => sourceCall(fileSource, name, fallback, ...args);
        const viewportCall = (name, fallback, ...args) => sourceCall(viewportSource, name, fallback, ...args);
        const dataTransferValue = (dataTransfer, type) => typeof dataTransfer?.getData === 'function'
            ? dataTransfer.getData(type)
            : '';

        async function handleDropData(dataTransfer, world) {
            if (!dataTransfer) return;
            const mediaBrowserPayload = mediaBrowserCall('mediaBrowserPayloadFromDataTransfer', null, dataTransfer);
            if (mediaBrowserPayload) {
                mediaBrowserCall('clearMediaBrowserDragPayload', undefined);
                await mediaBrowserCall('addMediaBrowserPayloadToCanvas', undefined, mediaBrowserPayload, world);
                return;
            }
            const transferId = dataTransferValue(dataTransfer, 'application/x-simpleai-transfer-id');
            const transferStation = getTransferStation();
            if (transferId && transferStation) {
                await transferCall('importTransferItemAt', undefined, transferId, world);
                return;
            }
            const droppedFiles = Array.from(dataTransfer.files || []);
            const projectFile = droppedFiles.find(file => fileCall('isWorkbenchProjectFile', false, file));
            if (projectFile) {
                await fileCall('importWorkbenchProjectFromFile', undefined, projectFile, { persist: false });
                return;
            }
            const files = droppedFiles.filter(file => fileCall('isMediaFile', false, file));
            if (files.length) {
                let offset = 0;
                for (const file of files) {
                    await fileCall('addMediaNodeFromFile', undefined, file, { x: world.x + offset, y: world.y + offset });
                    offset += 28;
                }
                return;
            }
            const uri = dataTransferValue(dataTransfer, 'text/uri-list') || dataTransferValue(dataTransfer, 'text/plain') || '';
            if (uri.trim() && transferStation && typeof transferStation.addUrl === 'function') {
                const item = await transferStation.addUrl(uri.trim());
                if (item) await transferCall('importTransferItemAt', undefined, item.id, world);
            }
        }

        function onViewportDragOver(evt) {
            if (!evt) return;
            evt.preventDefault?.();
            getViewport()?.classList?.add?.('is-drop-target');
        }

        function onViewportDragLeave() {
            getViewport()?.classList?.remove?.('is-drop-target');
        }

        async function onViewportDrop(evt) {
            if (!evt) return;
            evt.preventDefault?.();
            getViewport()?.classList?.remove?.('is-drop-target');
            const world = viewportCall('clientToWorld', { x: evt.clientX, y: evt.clientY }, evt.clientX, evt.clientY);
            viewportCall('setLastPointerWorld', undefined, world);
            await handleDropData(evt.dataTransfer, world);
        }

        return {
            handleDropData,
            onViewportDragLeave,
            onViewportDragOver,
            onViewportDrop
        };
    }

    window.SimpAICanvasWorkbenchViewportDrop = Object.assign({}, window.SimpAICanvasWorkbenchViewportDrop || {}, {
        createCanvasViewportDropController
    });
})();
