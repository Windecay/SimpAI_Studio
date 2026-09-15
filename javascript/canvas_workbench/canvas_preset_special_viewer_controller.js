(function () {
    'use strict';

    function createCanvasPresetSpecialViewerController(context) {
        const scope = context?.presetSpecialViewerSource || context || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const stateSource = scope.stateSource || {};
        const patchSource = scope.patchSource || {};
        const renderSource = scope.renderSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const timingSource = scope.timingSource || {};
        const utilitySource = scope.utilitySource || {};
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : null;
        const getRoot = () => typeof domSource.getRoot === 'function'
            ? domSource.getRoot()
            : null;
        const getNodesLayer = () => typeof domSource.getNodesLayer === 'function'
            ? domSource.getNodesLayer()
            : null;
        const getNode = (id) => typeof nodeSource.getNode === 'function'
            ? nodeSource.getNode(id)
            : null;
        const isNodeLocked = (node) => typeof nodeSource.isNodeLocked === 'function'
            ? !!nodeSource.isNodeLocked(node)
            : false;
        const getControllerKind = (node) => typeof stateSource.getPresetSpecialControllerKind === 'function'
            ? stateSource.getPresetSpecialControllerKind(node)
            : '';
        const getControllerState = (node, kind) => typeof stateSource.presetSpecialControllerState === 'function'
            ? stateSource.presetSpecialControllerState(node, kind)
            : {};
        const normalizeState = (kind, state) => typeof stateSource.normalizePresetSpecialState === 'function'
            ? stateSource.normalizePresetSpecialState(kind, state)
            : (state || {});
        const promptFromState = (kind, state) => typeof stateSource.presetSpecialPromptFromState === 'function'
            ? stateSource.presetSpecialPromptFromState(kind, state)
            : '';
        const inputAssetUrl = (node) => typeof stateSource.presetSpecialInputAssetUrl === 'function'
            ? stateSource.presetSpecialInputAssetUrl(node)
            : '';
        const buildControllerStatePatch = (node, options) => typeof patchSource.buildPresetSpecialControllerStatePatch === 'function'
            ? patchSource.buildPresetSpecialControllerStatePatch(node, options)
            : {};
        const buildNodeParamsPatch = (node, options) => typeof patchSource.buildNodeParamsPatch === 'function'
            ? patchSource.buildNodeParamsPatch(node, options)
            : {};
        const refreshControllerDom = (nodeId) => typeof renderSource.refreshPresetSpecialControllerDom === 'function'
            ? renderSource.refreshPresetSpecialControllerDom(nodeId)
            : undefined;
        const refreshNodeDom = (node, options) => typeof renderSource.refreshPresetSpecialNodeDom === 'function'
            ? renderSource.refreshPresetSpecialNodeDom(node, options)
            : undefined;
        const nowIso = () => typeof persistenceSource.nowIso === 'function'
            ? persistenceSource.nowIso()
            : '';
        const scheduleSave = () => typeof persistenceSource.scheduleSave === 'function'
            ? persistenceSource.scheduleSave()
            : undefined;
        const schedule = (callback, delay) => typeof timingSource.setTimeout === 'function'
            ? timingSource.setTimeout(callback, delay)
            : undefined;
        const cssEscape = typeof utilitySource.cssEscape === 'function'
            ? utilitySource.cssEscape
            : (value) => String(value ?? '').replace(/["\\]/g, '\\$&');

        function bindPresetSpecialViewerEvents(nodeEl, node) {
            if (!node || node.type !== 'preset') return;
            nodeEl?.querySelectorAll?.('[data-preset-special-viewer]').forEach((iframe) => {
                if (iframe.__simpaiPresetSpecialBound) return;
                iframe.__simpaiPresetSpecialBound = true;
                const sync = () => schedule(() => syncPresetSpecialViewerIframe(iframe), 30);
                iframe.addEventListener?.('load', sync);
                sync();
            });
        }

        function findPresetSpecialIframeByWindow(sourceWindow) {
            if (!sourceWindow) return null;
            const scopeRoot = getRoot() || getDocument();
            const iframes = Array.from(scopeRoot?.querySelectorAll?.('[data-preset-special-viewer]') || []);
            return iframes.find((iframe) => iframe.contentWindow === sourceWindow) || null;
        }

        function syncPresetSpecialViewerIframe(iframe) {
            if (!iframe || !iframe.contentWindow) return;
            const nodeId = iframe.closest?.('[data-node-id]')?.getAttribute?.('data-node-id') || '';
            const node = getNode(nodeId);
            const kind = iframe.getAttribute?.('data-preset-special-viewer') || getControllerKind(node);
            if (!node || !kind) return;
            const state = getControllerState(node, kind);
            iframe.contentWindow.postMessage?.({
                type: 'SYNC_ANGLES',
                horizontal: state.horizontal,
                vertical: state.vertical,
                zoom: state.zoom,
                lightColor: state.lightColor,
                useDefaultPrompts: false,
                cameraView: !!state.cameraView
            }, '*');
            iframe.contentWindow.postMessage?.({
                type: 'UPDATE_IMAGE',
                imageUrl: inputAssetUrl(node)
            }, '*');
            refreshControllerDom(node.id);
        }

        function handlePresetSpecialViewerMessage(evt) {
            const iframe = findPresetSpecialIframeByWindow(evt?.source);
            if (!iframe) return;
            const data = evt.data || {};
            const type = String(data.type || '');
            if (!['VIEWER_READY', 'ANGLE_UPDATE', 'SET_CAMERA_VIEW'].includes(type)) return;
            const nodeId = iframe.closest?.('[data-node-id]')?.getAttribute?.('data-node-id') || '';
            const node = getNode(nodeId);
            const kind = iframe.getAttribute?.('data-preset-special-viewer') || getControllerKind(node);
            if (!node || !kind) return;
            if (type === 'VIEWER_READY') {
                syncPresetSpecialViewerIframe(iframe);
                return;
            }
            if (isNodeLocked(node)) {
                syncPresetSpecialViewerIframe(iframe);
                return;
            }
            if (type === 'SET_CAMERA_VIEW') {
                const statePatch = Object.assign({}, getControllerState(node, kind), {
                    kind,
                    cameraView: !!data.cameraView
                });
                const patch = buildControllerStatePatch(node, {
                    statePatch,
                    updatedAt: nowIso()
                });
                if (patch && typeof patch === 'object') Object.assign(node, patch);
                refreshNodeDom(node, { syncViewer: false });
                scheduleSave();
                return;
            }
            const state = normalizeState(kind, Object.assign({}, getControllerState(node, kind), {
                horizontal: data.horizontal,
                vertical: data.vertical,
                zoom: data.zoom,
                lightColor: data.lightColor
            }));
            const patch = buildControllerStatePatch(node, {
                statePatch: state,
                updatedAt: nowIso()
            });
            if (patch && typeof patch === 'object') Object.assign(node, patch);
            Object.assign(node, buildNodeParamsPatch(node, {
                paramsPatch: {
                    scene_additional_prompt_2: promptFromState(kind, state)
                }
            }));
            refreshNodeDom(node, { syncViewer: false });
            scheduleSave();
        }

        return {
            bindPresetSpecialViewerEvents,
            findPresetSpecialIframeByWindow,
            syncPresetSpecialViewerIframe,
            handlePresetSpecialViewerMessage
        };
    }

    window.SimpAICanvasWorkbenchPresetSpecialViewer = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPresetSpecialViewer || {},
        { createCanvasPresetSpecialViewerController }
    );
})();
