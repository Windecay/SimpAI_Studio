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
        const getProject = () => typeof nodeSource.getProject === 'function'
            ? nodeSource.getProject()
            : null;
        const getVisibleClassicUploadSlots = (node) => typeof nodeSource.getVisibleClassicUploadSlots === 'function'
            ? nodeSource.getVisibleClassicUploadSlots(node)
            : [];
        const getVisibleUploadSlots = (node) => typeof nodeSource.getVisibleUploadSlots === 'function'
            ? nodeSource.getVisibleUploadSlots(node)
            : [];
        const getSelectedResultAsset = (node) => typeof nodeSource.getSelectedResultAsset === 'function'
            ? nodeSource.getSelectedResultAsset(node)
            : null;
        const safeAssetDisplaySrc = (asset, fallback) => typeof nodeSource.safeAssetDisplaySrc === 'function'
            ? nodeSource.safeAssetDisplaySrc(asset, fallback)
            : (fallback || '');
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
        function presetSpecialInputAssetUrl(node) {
            const slots = node?.upload_slots || {};
            const preferredSlots = ['scene_canvas_image', 'scene_input_image1', 'scene_input_image2', 'scene_input_image3', 'scene_input_image4', 'scene_input_image5', 'scene_input_image6', 'scene_input_image7', 'scene_input_image8'];
            for (const slot of preferredSlots) {
                const source = getNode(slots[slot]);
                if (!source) continue;
                const asset = source.type === 'result' ? getSelectedResultAsset(source) : source.asset;
                const src = safeAssetDisplaySrc(asset, asset?.thumb || asset?.preview_url || asset?.data_url || '');
                if (src) return src;
            }
            return '';
        }

        function presetSpecialViewerUrl(kind) {
            return `/canvas-workbench/special-viewer/${encodeURIComponent(kind)}`;
        }

        const inputAssetUrl = presetSpecialInputAssetUrl;
        const buildControllerStatePatch = (node, options) => typeof patchSource.buildPresetSpecialControllerStatePatch === 'function'
            ? patchSource.buildPresetSpecialControllerStatePatch(node, options)
            : {};
        const buildNodeParamsPatch = (node, options) => typeof patchSource.buildNodeParamsPatch === 'function'
            ? patchSource.buildNodeParamsPatch(node, options)
            : {};
        function ensurePresetSpecialControllerState(node, kind) {
            const controllerKind = kind || getControllerKind(node);
            if (!controllerKind || !node) return '';
            const state = getControllerState(node, controllerKind);
            const statePatch = Object.assign({}, state, { kind: controllerKind });
            const patch = buildControllerStatePatch(node, {
                statePatch,
                updatedAt: node.special_ui?.updated_at || nowIso()
            });
            if (patch && typeof patch === 'object') Object.assign(node, patch);
            Object.assign(node, buildNodeParamsPatch(node, {
                paramsPatch: {
                    scene_additional_prompt_2: promptFromState(controllerKind, state)
                }
            }));
            return controllerKind;
        }
        const nodeRenderKey = (node) => typeof renderSource.nodeRenderKey === 'function'
            ? renderSource.nodeRenderKey(node)
            : undefined;
        const notConnectedText = () => typeof renderSource.notConnectedText === 'function'
            ? renderSource.notConnectedText()
            : '';
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

        function refreshPresetSpecialControllerDom(nodeId) {
            const nodesLayer = getNodesLayer();
            if (!nodeId || !nodesLayer) return;
            const node = getNode(nodeId);
            const kind = getControllerKind(node);
            if (!node || !kind) return;
            const state = getControllerState(node, kind);
            const nodeEl = nodesLayer.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`);
            if (!nodeEl) return;
            const values = nodeEl.querySelector('[data-preset-special-values]');
            if (values) values.textContent = `${state.horizontal}° / ${state.vertical}° / ${state.zoom.toFixed(1)}${kind === 'flux-anglelight' ? ` / ${state.lightColor}` : ''}`;
            const prompt = nodeEl.querySelector('[data-preset-special-prompt]');
            if (prompt) prompt.textContent = promptFromState(kind, state);
        }

        function refreshPresetUploadSlotsDom(nodeId) {
            const nodesLayer = getNodesLayer();
            if (!nodeId || !nodesLayer) return;
            const node = getNode(nodeId);
            if (!node || !['preset', 'classic'].includes(node.type)) return;
            const nodeEl = nodesLayer.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`);
            if (!nodeEl) return;
            const slots = node.type === 'classic' ? getVisibleClassicUploadSlots(node) : getVisibleUploadSlots(node);
            slots.forEach((slotInfo) => {
                const slot = slotInfo.key;
                const row = nodeEl.querySelector(`[data-slot-row="${cssEscape(slot)}"]`);
                if (!row) return;
                const boundNode = node.upload_slots?.[slot] ? getNode(node.upload_slots[slot]) : null;
                const label = row.querySelector('b');
                if (label) label.textContent = boundNode ? (boundNode.title || boundNode.id) : notConnectedText();
            });
        }

        function syncPresetSpecialViewersForNode(nodeId) {
            const nodeEl = getNodesLayer()?.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`);
            if (!nodeEl) return;
            nodeEl.querySelectorAll('[data-preset-special-viewer]').forEach((iframe) => syncPresetSpecialViewerIframe(iframe));
        }

        function refreshPresetSpecialNodeDom(node, options) {
            const kind = getControllerKind(node);
            const nodesLayer = getNodesLayer();
            if (!node || !kind || !nodesLayer) return;
            refreshPresetUploadSlotsDom(node.id);
            refreshPresetSpecialControllerDom(node.id);
            if (options?.syncViewer) syncPresetSpecialViewersForNode(node.id);
            const nodeEl = nodesLayer.querySelector(`[data-node-id="${cssEscape(node.id)}"]`);
            if (nodeEl && options?.renderKey !== false) nodeEl.__simpaiRenderKey = nodeRenderKey(node);
        }

        function syncPresetSpecialViewersForAssetNode(sourceNodeId) {
            if (!sourceNodeId) return;
            (getProject()?.edges || [])
                .filter(edge => edge.type === 'upload' && edge.from === sourceNodeId)
                .forEach((edge) => {
                    const preset = getNode(edge.to);
                    if (getControllerKind(preset)) {
                        refreshPresetSpecialNodeDom(preset, { syncViewer: true });
                    }
                });
        }

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
            refreshPresetSpecialControllerDom(node.id);
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
                refreshPresetSpecialNodeDom(node, { syncViewer: false });
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
            refreshPresetSpecialNodeDom(node, { syncViewer: false });
            scheduleSave();
        }

        return {
            ensurePresetSpecialControllerState,
            presetSpecialViewerUrl,
            presetSpecialInputAssetUrl,
            bindPresetSpecialViewerEvents,
            findPresetSpecialIframeByWindow,
            refreshPresetSpecialNodeDom,
            syncPresetSpecialViewersForAssetNode,
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
