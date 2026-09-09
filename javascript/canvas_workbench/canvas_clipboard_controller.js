(function () {
    'use strict';

    function createCanvasClipboardController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const getVlmImageSlots = () => {
            const value = typeof scope.getVlmImageSlots === 'function' ? scope.getVlmImageSlots() : [];
            return Array.isArray(value) ? value : [];
        };
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const cloneValue = (value) => {
            if (typeof scope.cloneRunValue === 'function') return scope.cloneRunValue(value, {});
            try {
                return JSON.parse(JSON.stringify(value));
            } catch (err) {
                return Object.assign({}, value || {});
            }
        };
        const uid = typeof scope.uid === 'function'
            ? scope.uid
            : (prefix) => `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
        const nowIso = typeof scope.nowIso === 'function' ? scope.nowIso : () => new Date().toISOString();
        let canvasClipboard = null;

        function translate(en, cn) {
            return t(en, cn) || en;
        }

        function getSelectionState() {
            const state = typeof scope.getSelectionState === 'function'
                ? (scope.getSelectionState() || {})
                : scope;
            return {
                selectedNodeId: state.selectedNodeId || null,
                selectedNodeIds: state.selectedNodeIds instanceof Set
                    ? new Set(state.selectedNodeIds)
                    : new Set(Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []),
                selectedEdgeId: state.selectedEdgeId || null,
                selectedGroupId: state.selectedGroupId || null
            };
        }

        function setSelectionState(next) {
            const state = Object.assign(getSelectionState(), next || {});
            state.selectedNodeIds = state.selectedNodeIds instanceof Set
                ? new Set(state.selectedNodeIds)
                : new Set(Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []);
            if (typeof scope.setSelectionState === 'function') scope.setSelectionState(state);
            else Object.assign(scope, state);
        }

        function getSelectedNodeIdList() {
            const ids = call('getSelectedNodeIdList');
            if (Array.isArray(ids)) return ids.filter(Boolean);
            const state = getSelectionState();
            if (state.selectedNodeIds.size) return Array.from(state.selectedNodeIds);
            return state.selectedNodeId ? [state.selectedNodeId] : [];
        }

        function getNodeRect(node) {
            const rect = call('getNodeRect', node);
            if (rect && Number.isFinite(Number(rect.x)) && Number.isFinite(Number(rect.y))) {
                return {
                    x: Number(rect.x),
                    y: Number(rect.y),
                    w: Math.max(1, Number(rect.w) || 1),
                    h: Math.max(1, Number(rect.h) || 1)
                };
            }
            return {
                x: Number(node?.x) || 0,
                y: Number(node?.y) || 0,
                w: Math.max(1, Number(node?.width || node?.w) || 1),
                h: Math.max(1, Number(node?.height || node?.h) || 1)
            };
        }

        function buildSelectionClipboard(ids) {
            const project = getProject();
            const idSet = new Set(ids || []);
            const nodes = (project.nodes || [])
                .filter(node => idSet.has(node.id))
                .map(node => cloneValue(node));
            const edges = (project.edges || [])
                .filter(edge => idSet.has(edge.from) && idSet.has(edge.to))
                .map(edge => cloneValue(edge));
            const inputEdges = (project.edges || [])
                .filter(edge => idSet.has(edge.to) && !idSet.has(edge.from))
                .map(edge => cloneValue(edge));
            const inputIds = new Set(inputEdges.map(edge => edge.from));
            const inputNodes = (project.nodes || [])
                .filter(node => inputIds.has(node.id))
                .map(node => cloneValue(node));
            return {
                schema: 'simpai.canvas.clipboard.v1',
                created_at: nowIso(),
                nodes,
                edges,
                input_nodes: inputNodes,
                input_edges: inputEdges
            };
        }

        function copyCanvasSelection() {
            const ids = getSelectedNodeIdList();
            if (!ids.length) {
                call('showToast', translate('No selected nodes to copy.', '没有选中的节点可复制'));
                return null;
            }
            canvasClipboard = buildSelectionClipboard(ids);
            call('showToast', translate('Copied {count} node(s).', '已复制 {count} 个节点').replace('{count}', canvasClipboard.nodes.length));
            return canvasClipboard;
        }

        function normalizePastedNode(node) {
            node.locked = false;
            if (node.type === 'preset' || node.type === 'classic') {
                node.upload_slots = {};
                node.text_inputs = {};
                const slots = node.type === 'classic'
                    ? (call('getVisibleClassicUploadSlots', node) || [])
                    : (call('getVisibleUploadSlots', node) || []);
                slots.forEach((slot) => {
                    if (slot?.key) node.upload_slots[slot.key] = null;
                });
                ['models_config', 'styles_config', 'resolution_config', 'generation_config'].forEach((key) => {
                    if (node[key]) node[key] = Object.assign({}, node[key], { source_node_id: null });
                });
                if (node.type === 'classic') node.enhance_detection_configs = {};
                node.status = 'idle';
            }
            if (node.type === 'config') node.target_preset_id = null;
            if (node.type === 'text_merge') {
                node.text_inputs = {};
                node.input_slots = Array.isArray(node.input_slots) && node.input_slots.length
                    ? node.input_slots
                    : ['input_1', 'input_2'];
                node.params = Object.assign({ separator: '' }, node.params || {});
            }
            if (node.type === 'result') {
                node.producer = Object.assign({}, node.producer || {}, { preset_node_id: null, run_id: null, task_id: null });
                if (node.status && !node.asset) {
                    node.status = Object.assign({}, node.status, {
                        state: 'manual',
                        message: translate('Copied result node; replace manually or continue connecting.', '复制出的结果节点，请手动替换或继续连接。')
                    });
                }
            }
            if (node.type === 'wd14') {
                node.input_node_id = null;
                node.status = Object.assign({}, node.status || {}, {
                    state: 'idle',
                    message: translate('Connect an image or result node, then tag it.', '请连接图像或结果节点，再进行标签识别。')
                });
            }
            if (node.type === 'text') node.text_input = null;
            if (node.type === 'wildcards_helper') node.wildcards_catalog = null;
            if (node.type === 'translation') {
                node.text_input = null;
                node.status = Object.assign({}, node.status || {}, {
                    state: 'idle',
                    message: translate('Connect text, then translate.', '请连接文本，再进行翻译。')
                });
            }
            if (node.type === 'tag_cart') node.text_input = null;
            if (node.type === 'style_selector') {
                node.style_selector = Object.assign({}, node.style_selector || {}, { target_preset_id: '' });
            }
            if (node.type === 'pose_studio') {
                node.input_node_id = null;
                node.pose_studio = Object.assign({}, node.pose_studio || {}, { reference_asset: null });
                node.status = Object.assign({}, node.status || {}, {
                    state: node.asset ? 'finished' : 'idle',
                    message: node.asset
                        ? translate('Pose image ready.', '姿态图已准备好。')
                        : translate('Open Pose Studio to export a pose image.', '请打开 Pose Studio 导出姿态图。')
                });
            }
            if (node.type === 'gaussian_studio') {
                node.input_node_id = null;
                node.gaussian_studio = Object.assign({}, node.gaussian_studio || {}, { reference_asset: null });
                node.status = Object.assign({}, node.status || {}, {
                    state: node.asset ? 'finished' : 'idle',
                    message: node.asset
                        ? translate('Gaussian render ready.', 'Gaussian 渲染结果已准备好。')
                        : translate('Open Gaussian Studio to build a view.', '请打开 Gaussian Studio 创建视图。')
                });
            }
            if (node.type === 'liveportrait_expression') {
                node.input_node_id = null;
                node.reference_node_id = null;
                node.liveportrait_expression = Object.assign({}, node.liveportrait_expression || {}, {
                    source_node_id: '',
                    reference_node_id: '',
                    source_asset: null,
                    reference_asset: null
                });
                node.status = Object.assign({}, node.status || {}, {
                    state: node.asset ? 'finished' : 'idle',
                    message: node.asset
                        ? translate('Expression image ready.', '表情图已准备好。')
                        : translate('Connect a source image, then edit expression.', '请连接源图，再编辑表情。')
                });
            }
            if (node.type === 'vlm') {
                node.image_inputs = {};
                node.chat = { messages: [], updated_at: nowIso() };
                node.params = Object.assign({}, node.params || {}, { conversation_id: uid('vlm_chat') });
                node.status = Object.assign({}, node.status || {}, {
                    state: 'idle',
                    message: translate('Connect image/result nodes and write an instruction.', '请连接图像或结果节点，并输入指令。')
                });
            }
            if (node.type === 'compare') {
                node.inputs = { a: null, b: null };
                node.params = Object.assign({ position: 50, mode: 'fit' }, node.params || {});
            }
            if (node.type === 'timeline') call('normalizeTimelineNode', node);
            return node;
        }

        function getClipboardSourceEdges(options) {
            const edges = Array.isArray(canvasClipboard?.edges) ? canvasClipboard.edges : [];
            if (!options?.withInputConnections) return edges;
            const seen = new Set();
            return [
                ...(Array.isArray(canvasClipboard?.input_edges) ? canvasClipboard.input_edges : []),
                ...edges
            ].filter((edge) => {
                const key = `${edge?.from || ''}:${edge?.to || ''}:${edge?.type || ''}:${edge?.slot || edge?.config_kind || ''}`;
                if (!edge?.from || !edge?.to || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        function getClipboardBounds(nodes) {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            (nodes || []).forEach((node) => {
                const rect = getNodeRect(node);
                minX = Math.min(minX, rect.x);
                minY = Math.min(minY, rect.y);
                maxX = Math.max(maxX, rect.x + rect.w);
                maxY = Math.max(maxY, rect.y + rect.h);
            });
            if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 1, height: 1 };
            return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
        }

        function textMergeInputSlots(node) {
            const slots = call('textMergeInputSlots', node);
            return Array.isArray(slots) ? slots : (Array.isArray(node?.input_slots) ? node.input_slots : ['input_1', 'input_2']);
        }

        function isTextOutputNode(node) {
            return !!call('isTextOutputNode', node);
        }

        function wouldCreateTextCycle(fromId, toId) {
            return !!call('wouldCreateTextCycle', fromId, toId);
        }

        function applyPastedEdgeRelation(edge) {
            const to = call('getNode', edge.to);
            const from = call('getNode', edge.from);
            if (!to || !from) return;
            if (edge.type === 'upload' && to.type === 'preset') {
                to.upload_slots = to.upload_slots || {};
                to.upload_slots[edge.slot] = from.id;
            } else if (edge.type === 'config' && from.type === 'config' && (to.type === 'preset' || to.type === 'classic')) {
                from.target_preset_id = to.id;
                call('applyConfigNodeToPreset', from);
            } else if (edge.type === 'generate' && to.type === 'result') {
                to.producer = Object.assign({}, to.producer || {}, { preset_node_id: from.id, run_id: null, task_id: null });
            } else if (edge.type === 'text' && isTextOutputNode(from) && (to.type === 'preset' || to.type === 'classic')) {
                to.text_inputs = Object.assign({}, to.text_inputs || {}, { [edge.slot || 'prompt']: from.id });
                if (from.type === 'style_selector' && (edge.slot || 'prompt') === 'prompt') {
                    from.style_selector = Object.assign({}, from.style_selector || {}, { target_preset_id: to.id });
                    to.style_transfer_selector_id = from.id;
                }
            } else if (edge.type === 'text' && isTextOutputNode(from) && to.type === 'text_merge' && textMergeInputSlots(to).includes(edge.slot) && !wouldCreateTextCycle(from.id, to.id)) {
                to.text_inputs = Object.assign({}, to.text_inputs || {}, { [edge.slot]: from.id });
            } else if (edge.type === 'text' && isTextOutputNode(from) && ['text', 'translation', 'tag_cart'].includes(to.type) && edge.slot === 'input' && !wouldCreateTextCycle(from.id, to.id)) {
                to.text_input = from.id;
            } else if (edge.type === 'image' && ['image', 'result'].includes(from.type) && to.type === 'wd14') {
                to.input_node_id = from.id;
                to.status = Object.assign({}, to.status || {}, { state: 'ready', message: translate('Image connected.', '图像已连接。') });
            } else if (edge.type === 'image' && call('isPoseStudioImageSource', from) && to.type === 'pose_studio') {
                to.input_node_id = from.id;
                to.status = Object.assign({}, to.status || {}, { state: 'ready', message: translate('Reference image connected.', '参考图已连接。') });
            } else if (edge.type === 'image' && call('isLivePortraitExpressionImageSource', from) && to.type === 'liveportrait_expression') {
                const slot = edge.slot === 'reference' ? 'reference' : 'source';
                to.liveportrait_expression = Object.assign({}, to.liveportrait_expression || {});
                if (slot === 'reference') {
                    to.reference_node_id = from.id;
                    to.liveportrait_expression.reference_node_id = from.id;
                } else {
                    to.input_node_id = from.id;
                    to.liveportrait_expression.source_node_id = from.id;
                }
                to.status = Object.assign({}, to.status || {}, {
                    state: 'ready',
                    message: slot === 'reference'
                        ? translate('Reference expression connected.', '参考表情已连接。')
                        : translate('Source image connected.', '源图已连接。')
                });
            } else if (edge.type === 'image' && call('isVlmMediaSource', from) && to.type === 'vlm') {
                const slots = getVlmImageSlots();
                const slot = slots.some(item => item.key === edge.slot) ? edge.slot : 'image_1';
                to.image_inputs = Object.assign({}, to.image_inputs || {}, { [slot]: from.id });
                to.status = Object.assign({}, to.status || {}, { state: 'ready', message: translate('Media connected.', '媒体已连接。') });
            } else if (edge.type === 'media' && call('isSam3VideoMaskSource', from) && to.type === 'sam3_video_mask') {
                to.input_node_id = from.id;
                to.status = Object.assign({}, to.status || {}, { state: 'ready', message: translate('Source video connected.', '源视频已连接。') });
            } else if (edge.type === 'media' && call('isQwenTtsAudioSource', from) && call('isQwenTtsNode', to)) {
                to.audio_inputs = Object.assign({}, to.audio_inputs || {}, { [edge.slot || 'ref_audio']: from.id });
                to.status = Object.assign({}, to.status || {}, { state: 'ready', message: translate('Reference audio connected.', '参考音频已连接。') });
            } else if (edge.type === 'media' && call('isDirectorTimelineNode', to) && call('isDirectorMediaSourceForSlot', from, edge.slot)) {
                to.media_inputs = Object.assign({}, to.media_inputs || {}, { [edge.slot || 'image_1']: from.id });
                call('updateDirectorStatus', to);
            } else if (edge.type === 'compare' && call('isImageCompareSource', from) && to.type === 'compare') {
                const slot = ['a', 'b'].includes(edge.slot) ? edge.slot : 'a';
                to.inputs = Object.assign({ a: null, b: null }, to.inputs || {}, { [slot]: from.id });
            } else if (edge.type === 'timeline' && call('isTimelineSource', from) && to.type === 'timeline') {
                if (!Array.isArray(to.clips) || !to.clips.some(clip => clip.id === edge.slot)) {
                    call('addTimelineClipFromSource', to, from, { history: false, render: false, edge: false });
                }
            }
        }

        function pasteCanvasClipboard(world, options) {
            if (!canvasClipboard || !Array.isArray(canvasClipboard.nodes) || !canvasClipboard.nodes.length) {
                call('showToast', translate('Clipboard has no canvas nodes.', '剪贴板没有画布节点'));
                return [];
            }
            const project = getProject();
            const opts = options || {};
            call('pushHistory', opts.label || 'Paste nodes');
            const sourceNodes = canvasClipboard.nodes;
            const bounds = getClipboardBounds(sourceNodes);
            const target = world || call('viewportCenterWorld') || { x: 0, y: 0 };
            const dx = Math.round(Number(target.x || 0) - (bounds.minX + bounds.width / 2));
            const dy = Math.round(Number(target.y || 0) - (bounds.minY + bounds.height / 2));
            const idMap = {};
            const pasted = [];
            const stepOffset = opts.stagger === false ? 0 : 10;
            sourceNodes.forEach((source, index) => {
                const node = normalizePastedNode(cloneValue(source));
                const oldId = node.id;
                node.id = uid(node.type || 'node');
                idMap[oldId] = node.id;
                node.x = Math.round((node.x || 0) + dx + index * stepOffset);
                node.y = Math.round((node.y || 0) + dy + index * stepOffset);
                if (node.type === 'note' && node.tail?.target) {
                    node.tail = Object.assign({}, node.tail, {
                        target: {
                            x: Math.round(Number(node.tail.target.x || 0) + dx + index * stepOffset),
                            y: Math.round(Number(node.tail.target.y || 0) + dy + index * stepOffset)
                        }
                    });
                }
                node.title = `${node.title || node.type || 'Node'} Copy`;
                pasted.push(node);
            });
            project.nodes = Array.isArray(project.nodes) ? project.nodes : [];
            project.edges = Array.isArray(project.edges) ? project.edges : [];
            project.nodes.push(...pasted);
            getClipboardSourceEdges(opts).forEach((edge) => {
                const toId = idMap[edge.to];
                if (!toId) return;
                const fromId = idMap[edge.from] || (opts.withInputConnections && call('getNode', edge.from) ? edge.from : null);
                if (!fromId) return;
                const next = cloneValue(edge);
                next.id = uid('edge');
                next.from = fromId;
                next.to = toId;
                project.edges.push(next);
                applyPastedEdgeRelation(next);
            });
            setSelectionState({
                selectedNodeIds: new Set(pasted.map(node => node.id)),
                selectedNodeId: pasted[pasted.length - 1]?.id || null,
                selectedEdgeId: null,
                selectedGroupId: null
            });
            call('mutate');
            if (opts.showToast !== false) {
                call('showToast', translate('Pasted {count} node(s).', '已粘贴 {count} 个节点').replace('{count}', pasted.length));
            }
            return pasted;
        }

        function duplicateSelection(options) {
            const opts = options || {};
            const ids = getSelectedNodeIdList();
            if (!ids.length) return [];
            canvasClipboard = buildSelectionClipboard(ids);
            const bounds = getClipboardBounds(canvasClipboard.nodes);
            pasteCanvasClipboard({
                x: bounds.minX + bounds.width / 2 + (Number.isFinite(opts.offsetX) ? opts.offsetX : 42),
                y: bounds.minY + bounds.height / 2 + (Number.isFinite(opts.offsetY) ? opts.offsetY : 42)
            }, {
                label: opts.label || 'Duplicate nodes',
                showToast: opts.showToast,
                stagger: opts.stagger
            });
            return getSelectedNodeIdList().map(id => call('getNode', id)).filter(Boolean);
        }

        return {
            buildSelectionClipboard,
            copyCanvasSelection,
            duplicateSelection,
            getClipboardBounds,
            pasteCanvasClipboard
        };
    }

    window.SimpAICanvasWorkbenchClipboard = Object.assign({}, window.SimpAICanvasWorkbenchClipboard || {}, {
        createCanvasClipboardController
    });
})();
