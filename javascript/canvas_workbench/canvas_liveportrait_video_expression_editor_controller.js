(function () {
    'use strict';

    function createCanvasLivePortraitVideoExpressionEditorController(context) {
        const scope = context?.livePortraitVideoExpressionEditorSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const projectSource = scope.projectSource || {};
        const editorSource = scope.editorSource || {};
        const stateSource = scope.stateSource || {};
        const serializationSource = scope.serializationSource || {};
        const domSource = scope.domSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const selectionSource = scope.selectionSource || {};
        const languageSource = scope.languageSource || {};
        const editorSessions = new WeakMap();
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(runtimeSource, 'showToast', undefined, message);

        function presetUploadSourceForSlot(node, slot) {
            if (!node || !slot) return null;
            const project = call(projectSource, 'getProject', {}) || {};
            const edge = (Array.isArray(project.edges) ? project.edges : []).find(item =>
                item.type === 'upload' && item.to === node.id && item.slot === slot
            );
            const sourceId = node.upload_slots?.[slot] || edge?.from || '';
            return sourceId ? call(nodeSource, 'getNode', null, sourceId) : null;
        }

        function livePortraitVideoExpressionSourceInfo(node) {
            const sourceNode = presetUploadSourceForSlot(node, 'scene_video');
            const asset = sourceNode?.type === 'result'
                ? call(nodeSource, 'getSelectedResultAsset', null, sourceNode)
                : sourceNode?.asset || null;
            const fallback = asset?.preview_url || asset?.thumb || asset?.data_url || asset?.url || '';
            const src = call(nodeSource, 'safeAssetFullDisplaySrc', fallback, asset || {}, fallback);
            return { sourceNode, asset, src };
        }

        async function openLivePortraitVideoExpressionPresetEditor(node) {
            if (!call(nodeSource, 'isLivePortraitVideoExpressionPresetNode', false, node)) return null;
            if (call(nodeSource, 'isNodeLocked', false, node)) {
                showToast(t('Node is locked.', '节点已锁定。'));
                return null;
            }
            const project = call(projectSource, 'getProject', {}) || {};
            if (call(nodeSource, 'getNode', null, node.id) !== node) return null;
            const sourceInfo = livePortraitVideoExpressionSourceInfo(node);
            const inputVersion = () => {
                const currentSource = livePortraitVideoExpressionSourceInfo(node);
                return JSON.stringify({
                    asset: currentSource.asset, src: currentSource.src,
                    expression: node.params?.scene_additional_prompt_2 || '',
                    state: node.liveportrait_video_expression || {}
                });
            };
            const session = { version: inputVersion() };
            editorSessions.set(node, session);
            const owns = () => call(projectSource, 'getProject', null) === project
                && call(nodeSource, 'getNode', null, node.id) === node
                && editorSessions.get(node) === session
                && livePortraitVideoExpressionSourceInfo(node).sourceNode === sourceInfo.sourceNode
                && inputVersion() === session.version;
            const ready = await call(runtimeSource, 'ensureWorkbenchLazyRuntime', false,
                'livePortraitExpression',
                () => call(editorSource, 'isLoaded', false),
                t('Loading LivePortrait Video...', '正在加载 LivePortrait Video...'),
                t('LivePortrait Exp editor is not loaded.', 'LivePortrait Exp 编辑器尚未加载。')
            );
            if (!ready || !owns()) return null;
            if (!sourceInfo.sourceNode || !sourceInfo.src) {
                showToast(t('Connect a source video first.', '请先连接源视频。'));
                return null;
            }
            const frame = await call(nodeSource, 'extractVideoFirstFrameDataUrl', null, sourceInfo.src);
            if (!owns()) return null;
            if (!frame?.dataUrl) {
                showToast(t('Could not read the first frame from this video.', '无法读取这个视频的首帧。'));
                return null;
            }
            const stored = node.liveportrait_video_expression || {};
            const expressionState = String(node.params?.scene_additional_prompt_2 || stored.expression_state || stored.expression_state_draft || '');
            const sourceFrameAsset = Object.assign({}, sourceInfo.asset || {}, {
                kind: 'liveportrait_video_first_frame',
                mime: 'image/png',
                width: frame.width,
                height: frame.height,
                source_video_node_id: sourceInfo.sourceNode.id
            });
            return call(editorSource, 'open', undefined, {
                title: t('LivePortrait Video', 'LivePortrait 视频表情'),
                context: 'canvas',
                exportMode: 'params',
                projectId: project.id || call(projectSource, 'getProjectId', ''),
                node,
                nodeId: node.id,
                params: stored.params && typeof stored.params === 'object' && Object.keys(stored.params).length
                    ? stored.params
                    : undefined,
                expressionState,
                sourceDataUrl: frame.dataUrl,
                sourceSrc: frame.dataUrl,
                sourceAsset: sourceFrameAsset,
                sourceAssetSource: call(serializationSource, 'serializeAssetSourceForRun', null, sourceInfo.sourceNode),
                sourceSize: { width: frame.width, height: frame.height },
                referenceDataUrl: '',
                referenceSrc: '',
                referenceAsset: null,
                referenceSize: { width: 0, height: 0 },
                modalMount: call(domSource, 'canvasOverlayHost', null),
                mountSelector: '#simpai-infinite-canvas-workbench',
                detectTheme: (...args) => call(domSource, 'detectWorkbenchTheme', undefined, ...args),
                ensureFormNames: (...args) => call(domSource, 'ensureWorkbenchFormFieldNames', undefined, ...args),
                onStateChange: (cache) => {
                    if (!owns()) return;
                    const current = node;
                    Object.assign(current, call(stateSource, 'buildLivePortraitVideoExpressionStatePatch', {}, current, {
                        statePatch: {
                            params: cache?.params || {},
                            expression_state_draft: cache?.expression_state || '',
                            source_node_id: sourceInfo.sourceNode.id,
                            source_asset: sourceInfo.asset || null,
                            source_frame_size: { width: frame.width, height: frame.height },
                            face_selection: cache?.face_selection || {}
                        },
                        updatedAt: cache?.updated_at || call(runtimeSource, 'nowIso', '')
                    }));
                    session.version = inputVersion();
                },
                onConfirm: (response) => {
                    if (!owns()) return;
                    call(runtimeSource, 'pushHistory', undefined, 'Update LivePortrait Video expression params');
                    const current = node;
                    const expression = response?.expression_state || expressionState || '';
                    Object.assign(current, call(stateSource, 'buildNodeParamsPatch', {}, current, {
                        paramsPatch: { scene_additional_prompt_2: expression }
                    }));
                    Object.assign(current, call(stateSource, 'buildLivePortraitVideoExpressionStatePatch', {}, current, {
                        statePatch: {
                            params: response?.params || {},
                            expression_state: expression,
                            expression_state_draft: '',
                            source_node_id: sourceInfo.sourceNode.id,
                            source_asset: sourceInfo.asset || null,
                            source_frame_size: { width: frame.width, height: frame.height },
                            source_face_bbox: response?.source_face_bbox || '',
                            reference_face_bbox: response?.reference_face_bbox || ''
                        },
                        updatedAt: response?.exported_at || call(runtimeSource, 'nowIso', '')
                    }));
                    Object.assign(current, call(stateSource, 'buildSpecialNodeStatusPatch', {}, current, {
                        status: call(stateSource, 'mergeCanvasRunStatus', current.status, current.status, 'ready', t('Expression params saved.', '表情参数已保存。'))
                    }));
                    editorSessions.delete(node);
                    call(selectionSource, 'selectNode', undefined, current.id);
                    call(runtimeSource, 'mutate', undefined, { inspector: true });
                    showToast(t('Expression params saved.', '表情参数已保存。'));
                }
            });
        }

        return {
            openLivePortraitVideoExpressionPresetEditor,
            presetUploadSourceForSlot,
            livePortraitVideoExpressionSourceInfo
        };
    }

    window.SimpAICanvasWorkbenchLivePortraitVideoExpressionEditor = Object.assign(
        {}, window.SimpAICanvasWorkbenchLivePortraitVideoExpressionEditor || {},
        { createCanvasLivePortraitVideoExpressionEditorController }
    );
})();
