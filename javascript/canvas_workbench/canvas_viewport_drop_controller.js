(function () {
    'use strict';

    function createCanvasViewportDropController(context) {
        const scope = context || {};
        const getViewport = () => typeof scope.getViewport === 'function' ? scope.getViewport() : null;
        const getTransferStation = () => typeof scope.getTransferStation === 'function' ? scope.getTransferStation() : null;
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const dataTransferValue = (dataTransfer, type) => typeof dataTransfer?.getData === 'function'
            ? dataTransfer.getData(type)
            : '';

        async function handleDropData(dataTransfer, world) {
            if (!dataTransfer) return;
            const mediaBrowserPayload = call('mediaBrowserPayloadFromDataTransfer', dataTransfer);
            if (mediaBrowserPayload) {
                call('clearMediaBrowserDragPayload');
                await call('addMediaBrowserPayloadToCanvas', mediaBrowserPayload, world);
                return;
            }
            const transferId = dataTransferValue(dataTransfer, 'application/x-simpleai-transfer-id');
            const transferStation = getTransferStation();
            if (transferId && transferStation) {
                await call('importTransferItemAt', transferId, world);
                return;
            }
            const droppedFiles = Array.from(dataTransfer.files || []);
            const projectFile = droppedFiles.find(file => call('isWorkbenchProjectFile', file));
            if (projectFile) {
                await call('importWorkbenchProjectFromFile', projectFile, { persist: false });
                return;
            }
            const files = droppedFiles.filter(file => call('isMediaFile', file));
            if (files.length) {
                let offset = 0;
                for (const file of files) {
                    await call('addMediaNodeFromFile', file, { x: world.x + offset, y: world.y + offset });
                    offset += 28;
                }
                return;
            }
            const uri = dataTransferValue(dataTransfer, 'text/uri-list') || dataTransferValue(dataTransfer, 'text/plain') || '';
            if (uri.trim() && transferStation && typeof transferStation.addUrl === 'function') {
                const item = await transferStation.addUrl(uri.trim());
                if (item) await call('importTransferItemAt', item.id, world);
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
            const world = call('clientToWorld', evt.clientX, evt.clientY);
            call('setLastPointerWorld', world);
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
