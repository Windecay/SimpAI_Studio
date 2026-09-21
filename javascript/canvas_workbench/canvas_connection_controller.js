(function () {
    'use strict';

    function createCanvasConnectionController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const domSource = sourceObject('domSource');
        const viewportSource = sourceObject('viewportSource');
        const runtimeSource = sourceObject('runtimeSource');
        const uiSource = sourceObject('uiSource');
        const selectionSource = sourceObject('selectionSource');
        const nodeSource = sourceObject('nodeSource');
        const spatialSource = sourceObject('spatialSource');
        const mediaSource = sourceObject('mediaSource');
        const configSource = sourceObject('configSource');
        const batchSource = sourceObject('batchSource');
        const textSource = sourceObject('textSource');
        const timelineSource = sourceObject('timelineSource');
        const edgeSource = sourceObject('edgeSource');
        const projectSource = sourceObject('projectSource');
        const renderSource = sourceObject('renderSource');
        const actionSource = sourceObject('actionSource');
        const pendingSource = sourceObject('pendingSource');
        const automaticSource = sourceObject('automaticSource');
        const languageSource = sourceObject('languageSource');
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : null;
        const clientToWorld = (clientX, clientY) => sourceCall(
            viewportSource,
            'clientToWorld',
            { x: clientX, y: clientY },
            clientX,
            clientY
        ) || { x: clientX, y: clientY };
        const getPerformanceNow = () => typeof runtimeSource.performanceNow === 'function'
            ? runtimeSource.performanceNow()
            : 0;
        const uiCall = (name, fallback, ...args) => sourceCall(uiSource, name, fallback, ...args);
        const selectionCall = (name, fallback, ...args) => sourceCall(selectionSource, name, fallback, ...args);
        const nodeCall = (name, fallback, ...args) => sourceCall(nodeSource, name, fallback, ...args);
        const spatialCall = (name, fallback, ...args) => sourceCall(spatialSource, name, fallback, ...args);
        const mediaCall = (name, ...args) => sourceCall(mediaSource, name, false, ...args);
        const renderCall = (name, fallback, ...args) => sourceCall(renderSource, name, fallback, ...args);
        const actionCall = (name, fallback, ...args) => sourceCall(actionSource, name, fallback, ...args);
        const t = (en, cn) => {
            const state = sourceCall(languageSource, 'getLanguageState', {}) || {};
            return sourceCall(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        let connectState = null;

        function inputTargetAcceptsMultiple(target) {
            return ['batch_any', 'timeline', 'director_media_group'].includes(target?.kind);
        }

        function inputTargetEdges(target) {
            if (!target?.toId || !nodeCall('getNode', null, target.toId)) return [];
            const project = sourceCall(projectSource, 'getProject', {}) || {};
            const edges = Array.isArray(project.edges) ? project.edges : [];
            if (target.kind === 'director_media_group') {
                return edges.filter(edge => edge.type === 'media' && edge.to === target.toId
                    && sourceCall(mediaSource, 'directorMediaSourceKind', '', nodeCall('getNode', null, edge.from)) === target.slot);
            }
            if (target.kind === 'batch_any') return edges.filter(edge => edge.type === 'batch_input' && edge.to === target.toId);
            if (target.kind === 'timeline') return edges.filter(edge => edge.type === 'timeline' && edge.to === target.toId);
            const typeByKind = {
                upload: 'upload',
                config: 'config',
                text: 'text',
                wd14: 'image',
                vlm: 'image',
                mask_source: 'image',
                sam3_video: 'media',
                pose_reference: 'image',
                gaussian_reference: 'image',
                liveportrait_source: 'image',
                liveportrait_reference: 'image',
                qwen_tts_audio: 'media',
                director_media: 'media',
                compare: 'compare',
                generate: 'generate'
            };
            const edgeType = typeByKind[target.kind];
            if (!edgeType) return [];
            return edges.filter(edge => edge.type === edgeType && edge.to === target.toId
                && (target.kind === 'generate' || String(edge.slot || '') === String(target.slot || '')));
        }

        function findNearestConnectionTarget(clientX, clientY) {
            if (!connectState) return null;
            const nodesLayer = sourceCall(domSource, 'getNodesLayer', null);
            const selector = sourceCall(domSource, 'getInputPortHandleSelector', '');
            if (!nodesLayer || !selector) return null;
            const candidates = nodesLayer.querySelectorAll(selector);
            const radius = spatialCall('getConnectionSnapRadiusPx', 36);
            let nearest = null;
            let nearestDistance = radius * radius;
            candidates.forEach(handle => {
                const target = nodeCall('getConnectionTargetFromHandle', null, handle);
                if (!target || !isConnectionTargetCompatible(connectState.from || '', target)) return;
                const rect = handle.getBoundingClientRect();
                if (!rect.width && !rect.height) return;
                const dx = (rect.left + rect.width / 2) - clientX;
                const dy = (rect.top + rect.height / 2) - clientY;
                const distance = dx * dx + dy * dy;
                if (distance <= nearestDistance) {
                    nearestDistance = distance;
                    nearest = target;
                }
            });
            return nearest;
        }

        function isConnectionTargetCompatible(fromId, target) {
            const from = nodeCall('getNode', null, fromId);
            const to = nodeCall('getNode', null, target?.toId);
            if (!from || !to || !target || from.id === to.id) return false;
            if (target.kind === 'upload') return (to.type === 'preset' || to.type === 'classic')
                && (mediaCall('canNodeConnectToUploadSlot', from, target.slot)
                    || mediaCall('canPresetOutputConnectToUploadSlot', from, target.slot));
            if (target.kind === 'config') {
                if (from.type !== 'config' || !['preset', 'classic'].includes(to.type)) return false;
                const detectionIndex = sourceCall(configSource, 'parseDetectionSlot', -1, target.slot);
                if (detectionIndex >= 0) return from.config_kind === 'detection' && to.type === 'classic';
                return from.config_kind === target.slot && sourceCall(configSource, 'isPresetConfigKind', false, target.slot);
            }
            if (target.kind === 'text') {
                if (['preset', 'classic'].includes(to.type)
                    && sourceCall(batchSource, 'batchAnyCanConnectToTextSlot', false, from, target.slot)) return true;
                return sourceCall(textSource, 'isTextOutputNode', false, from)
                    && ['preset', 'classic', 'text', 'text_merge', 'translation', 'tag_cart'].includes(to.type);
            }
            if (target.kind === 'wd14') return ['image', 'result'].includes(from.type) && to.type === 'wd14';
            if (target.kind === 'vlm') {
                if (to.type !== 'vlm') return false;
                return (to.params?.mode || 'single') === 'chat'
                    ? ['image', 'result'].includes(from.type)
                    : mediaCall('isVlmMediaSource', from);
            }
            if (target.kind === 'mask_source') return ['image', 'result'].includes(from.type) && to.type === 'mask';
            if (target.kind === 'sam3_video') return mediaCall('isSam3VideoMaskSource', from) && to.type === 'sam3_video_mask';
            if (target.kind === 'pose_reference') return to.type === 'pose_studio'
                && (mediaCall('isPoseStudioImageSource', from) || mediaCall('isImageProducingPresetNode', from));
            if (target.kind === 'gaussian_reference') return (mediaCall('isGaussianStudioImageSource', from)
                || mediaCall('isImageProducingPresetNode', from)) && to.type === 'gaussian_studio';
            if (target.kind === 'liveportrait_source' || target.kind === 'liveportrait_reference') {
                return to.type === 'liveportrait_expression'
                    && (mediaCall('isLivePortraitExpressionImageSource', from) || mediaCall('isImageProducingPresetNode', from));
            }
            if (target.kind === 'qwen_tts_audio') return mediaCall('isQwenTtsAudioSource', from) && nodeCall('isQwenTtsNode', false, to);
            if (target.kind === 'director_media') return nodeCall('isDirectorTimelineNode', false, to)
                && mediaCall('isDirectorMediaSourceForSlot', from, target.slot);
            if (target.kind === 'director_media_group') return nodeCall('isDirectorTimelineNode', false, to)
                && mediaCall('directorMediaSourceKind', from) === target.slot;
            if (target.kind === 'compare') return mediaCall('isImageCompareSource', from) && to.type === 'compare';
            if (target.kind === 'batch_any') return to.type === 'batch_any'
                && sourceCall(batchSource, 'batchAnyAcceptsSource', false, to, from);
            if (target.kind === 'timeline') {
                if (!sourceCall(timelineSource, 'isTimelineSource', false, from) || to.type !== 'timeline') return false;
                if (!target.slot || target.slot === 'media') return true;
                const asset = sourceCall(timelineSource, 'getTimelineSourceAsset', null, from) || {};
                const kind = sourceCall(timelineSource, 'assetMediaKind', '', asset);
                const pseudoClip = { kind, track_id: target.slot };
                return sourceCall(timelineSource, 'trackCompatible', false, pseudoClip, target.slot, to);
            }
            if (target.kind === 'generate') return (['preset', 'classic', 'timeline'].includes(from.type)
                || nodeCall('isQwenTtsNode', false, from)) && to.type === 'result';
            return false;
        }

        function connectSourceToTarget(fromId, target, options) {
            if (!fromId || !target || !isConnectionTargetCompatible(fromId, target)) return false;
            const opts = options || {};
            let name;
            let args = [fromId, target.toId, target.slot, opts];
            switch (target.kind) {
                case 'upload': {
                    const fromNode = nodeCall('getNode', null, fromId);
                    if (fromNode && ['preset', 'classic'].includes(fromNode.type)) {
                        name = 'createPresetToPresetBridgeEdge';
                        args = [fromId, target.toId, target.slot];
                    } else name = 'createUploadEdge';
                    break;
                }
                case 'config': name = 'createConfigEdge'; break;
                case 'text': name = 'createTextEdge'; break;
                case 'vlm': name = 'createVlmImageEdge'; break;
                case 'liveportrait_source':
                case 'liveportrait_reference': name = 'createLivePortraitExpressionImageEdge'; break;
                case 'qwen_tts_audio': name = 'createQwenTtsAudioEdge'; break;
                case 'director_media': name = 'createDirectorTimelineMediaEdge'; break;
                case 'director_media_group':
                    name = 'createDirectorTimelineMediaEdge';
                    args = [fromId, target.toId, '', Object.assign({}, opts, { kind: target.slot })];
                    break;
                case 'compare': name = 'createCompareImageEdge'; break;
                case 'timeline':
                    name = 'createTimelineClipEdge';
                    args = [fromId, target.toId, Object.assign({}, opts, { track_id: target.slot === 'media' ? null : target.slot })];
                    break;
                default: {
                    const nodeRoutes = {
                        wd14: 'createWd14ImageEdge',
                        mask_source: 'createMaskImageEdge',
                        sam3_video: 'createSam3VideoMaskEdge',
                        pose_reference: 'createPoseStudioReferenceEdge',
                        gaussian_reference: 'createGaussianStudioReferenceEdge',
                        batch_any: 'createBatchAnyInputEdge',
                        generate: 'createGenerateEdge'
                    };
                    name = nodeRoutes[target.kind];
                    args = [fromId, target.toId, opts];
                }
            }
            if (!Object.prototype.hasOwnProperty.call(edgeSource, name) || typeof edgeSource[name] !== 'function') return false;
            edgeSource[name](...args);
            return true;
        }

        function completePendingConnectionToNode(node) {
            const inputTarget = sourceCall(pendingSource, 'getPendingInputTarget', null);
            if (inputTarget && node && node.id !== inputTarget.toId) {
                sourceCall(pendingSource, 'clearPendingInputTarget', undefined);
                if (connectSourceToTarget(node.id, inputTarget, { silent: true, render: false, history: false, select: false, toast: false })) {
                    return t('and connected to the selected input automatically', '并已自动连接到所选输入端点');
                }
                uiCall('showToast', undefined, t('The created node does not match this input type.', '创建的节点与该输入端点类型不匹配。'));
                return '';
            }
            const from = sourceCall(pendingSource, 'getPendingConnectionSource', null);
            if (!from || !node || from.id === node.id) return '';
            let name = '';
            if (node.type === 'batch_any' && sourceCall(batchSource, 'isBatchAnySourceNode', false, from)) {
                name = 'connectPendingBatchSource';
            } else if ((node.type === 'preset' || node.type === 'classic') && (['image', 'result', 'video', 'audio', 'pose_studio', 'gaussian_studio', 'liveportrait_expression'].includes(from.type) || (from.type === 'batch_any' && sourceCall(batchSource, 'batchAnyMediaKind', '', from) && sourceCall(batchSource, 'batchAnyMediaKind', '', from) !== 'text'))) {
                name = 'connectPendingUploadSource';
            } else if (['image', 'result'].includes(from.type) && node.type === 'wd14') {
                name = 'connectPendingWd14Source';
            } else if ((mediaCall('isImageProducingPresetNode', from) || mediaCall('isPoseStudioImageSource', from)) && node.type === 'pose_studio') {
                name = 'connectPendingPoseSource';
            } else if (mediaCall('isGaussianStudioImageSource', from) && node.type === 'gaussian_studio') {
                name = 'connectPendingGaussianSource';
            } else if ((mediaCall('isImageProducingPresetNode', from) || mediaCall('isLivePortraitExpressionImageSource', from)) && node.type === 'liveportrait_expression') {
                name = 'connectPendingLivePortraitSource';
            } else if (mediaCall('isVlmMediaSource', from) && node.type === 'vlm') {
                name = 'connectPendingVlmSource';
            } else if (mediaCall('isQwenTtsAudioSource', from) && nodeCall('isQwenTtsNode', false, node)) {
                name = 'connectPendingQwenSource';
            } else if (nodeCall('isDirectorTimelineNode', false, node) && mediaCall('directorMediaSourceKind', from)) {
                name = 'connectPendingDirectorSource';
            } else if (mediaCall('isImageCompareSource', from) && node.type === 'compare') {
                name = 'connectPendingCompareSource';
            } else if (sourceCall(timelineSource, 'isTimelineSource', false, from) && node.type === 'timeline') {
                name = 'connectPendingTimelineSource';
            } else if (['preset', 'classic'].includes(from.type) && ['preset', 'classic'].includes(node.type)) {
                name = 'connectPendingPresetSource';
            } else if ((['preset', 'classic', 'timeline'].includes(from.type) || nodeCall('isQwenTtsNode', false, from)) && node.type === 'result') {
                name = 'connectPendingResultSource';
            } else if (from.type === 'config' && (node.type === 'preset' || node.type === 'classic') && (sourceCall(configSource, 'isPresetConfigKind', false, from.config_kind) || (from.config_kind === 'detection' && node.type === 'classic'))) {
                name = 'connectPendingConfigSource';
            } else if (sourceCall(textSource, 'isTextOutputNode', false, from) && (node.type === 'preset' || node.type === 'classic')) {
                name = 'connectPendingTextSource';
            } else if (sourceCall(textSource, 'isTextOutputNode', false, from) && ['text', 'text_merge', 'translation', 'tag_cart'].includes(node.type)) {
                name = 'connectPendingTextSource';
            }
            const message = name ? sourceCall(automaticSource, name, '', from, node) : '';
            sourceCall(pendingSource, 'clearPendingConnection', undefined);
            return message;
        }

        function connectUploadEdgeApi(fromId, toId, slot, options) {
            sourceCall(edgeSource, 'createUploadEdge', undefined, fromId, toId, slot, options || {});
            const target = nodeCall('getNode', null, toId);
            const project = sourceCall(projectSource, 'getProject', {}) || {};
            const edge = (project.edges || []).find(item => item.type === 'upload'
                && item.from === fromId && item.to === toId && item.slot === slot) || null;
            return {
                ok: !!edge && target?.upload_slots?.[slot] === fromId,
                edge_id: edge?.id || '',
                from: fromId || '',
                to: toId || '',
                slot: slot || '',
                target_upload: target?.upload_slots?.[slot] || ''
            };
        }

        function updateTempEdge() {
            renderCall('renderTempEdge', undefined, connectState);
        }

        function bindConnectionListeners() {
            const doc = getDocument();
            doc?.addEventListener('pointermove', onConnectionMove, true);
            doc?.addEventListener('pointerup', stopConnection, true);
        }

        function removeConnectionListeners() {
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onConnectionMove, true);
            doc?.removeEventListener('pointerup', stopConnection, true);
        }

        function startConnection(node, evt) {
            if (!node || !evt) return;
            uiCall('hideCanvasTooltip', undefined);
            uiCall('hideHoverPreview', undefined);
            uiCall('closePreviewSelectMenu', undefined);
            uiCall('setSuppressWheelUntil', undefined, getPerformanceNow() + 420);
            selectionCall('selectNode', undefined, node.id);
            connectState = {
                from: node.id,
                fromPoint: nodeCall('getOutputPoint', undefined, node),
                currentPoint: clientToWorld(evt.clientX, evt.clientY)
            };
            updateTempEdge();
            bindConnectionListeners();
        }

        function startInputConnection(target, evt) {
            if (!target?.handle || !target.toId || !evt) return;
            uiCall('hideCanvasTooltip', undefined);
            uiCall('hideHoverPreview', undefined);
            uiCall('closePreviewSelectMenu', undefined);
            uiCall('setSuppressWheelUntil', undefined, getPerformanceNow() + 420);
            selectionCall('selectInputConnectionTarget', undefined, target.toId);
            const point = nodeCall('getHandleCenterWorldPoint', undefined, target.handle);
            connectState = {
                mode: 'input',
                target: Object.assign({}, target, { handle: null }),
                fromPoint: point,
                currentPoint: point,
                startClientX: Number(evt.clientX || 0),
                startClientY: Number(evt.clientY || 0),
                moved: false
            };
            bindConnectionListeners();
        }

        function onConnectionMove(evt) {
            if (!connectState || !evt) return;
            if (connectState.mode === 'input') {
                const dx = Number(evt.clientX || 0) - Number(connectState.startClientX || 0);
                const dy = Number(evt.clientY || 0) - Number(connectState.startClientY || 0);
                if (!connectState.moved && (dx * dx + dy * dy) < 36) return;
                connectState.moved = true;
                connectState.currentPoint = clientToWorld(evt.clientX, evt.clientY);
                updateTempEdge();
                return;
            }
            const snapTarget = findNearestConnectionTarget(evt.clientX, evt.clientY);
            connectState.currentPoint = snapTarget
                ? nodeCall('getHandleCenterWorldPoint', undefined, snapTarget.handle)
                : clientToWorld(evt.clientX, evt.clientY);
            updateTempEdge();
        }

        function stopConnection(evt) {
            if (!connectState || !evt) return;
            if (connectState.mode === 'input') {
                const state = connectState;
                const menuWorld = clientToWorld(evt.clientX, evt.clientY);
                connectState = null;
                renderCall('renderTempEdge', undefined, null);
                removeConnectionListeners();
                if (state.moved) {
                    renderCall('renderAll', undefined);
                    actionCall('openInputPortCreateMenu', undefined, state.target, evt.clientX, evt.clientY, menuWorld);
                }
                return;
            }
            const snapTarget = findNearestConnectionTarget(evt.clientX, evt.clientY);
            const connected = !!(snapTarget && connectSourceToTarget(connectState.from, snapTarget));
            const menuWorld = clientToWorld(evt.clientX, evt.clientY);
            const pendingFromId = connectState.from;
            connectState = null;
            renderCall('renderTempEdge', undefined, null);
            removeConnectionListeners();
            if (connected) renderCall('renderAll', undefined);
            else {
                actionCall('setPendingConnection', undefined, pendingFromId, menuWorld);
                renderCall('renderAll', undefined);
                actionCall('openAddNodeMenu', undefined, evt.clientX, evt.clientY, menuWorld, false, 420);
            }
        }

        function cancelConnection() {
            if (!connectState) return;
            connectState = null;
            renderCall('renderTempEdge', undefined, null);
            removeConnectionListeners();
            renderCall('renderAll', undefined);
        }

        return {
            inputTargetAcceptsMultiple,
            inputTargetEdges,
            findNearestConnectionTarget,
            isConnectionTargetCompatible,
            connectSourceToTarget,
            completePendingConnectionToNode,
            connectUploadEdgeApi,
            startConnection,
            startInputConnection,
            onConnectionMove,
            stopConnection,
            cancelConnection,
            updateTempEdge,
            isConnecting: () => !!connectState,
            getConnectingFromId: () => connectState?.from || ''
        };
    }

    window.SimpAICanvasWorkbenchConnection = Object.assign({}, window.SimpAICanvasWorkbenchConnection || {}, {
        createCanvasConnectionController
    });
})();
