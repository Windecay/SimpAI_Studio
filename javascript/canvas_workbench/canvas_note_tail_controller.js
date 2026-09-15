(function () {
    'use strict';

    function createCanvasNoteTailController(context) {
        const scope = context?.noteTailSource || context || {};
        const projectSource = scope.projectSource || {};
        const domSource = scope.domSource || {};
        const nodeSource = scope.nodeSource || {};
        const geometrySource = scope.geometrySource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const sourceCall = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const projectCall = (name, fallback, ...args) => sourceCall(projectSource, name, fallback, ...args);
        const getProject = () => projectCall('getProject', {}) || {};
        const getDocument = () => typeof domSource.getDocument === 'function'
            ? domSource.getDocument()
            : null;
        const nodeCall = (name, fallback, ...args) => sourceCall(nodeSource, name, fallback, ...args);
        const geometryCall = (name, fallback, ...args) => sourceCall(geometrySource, name, fallback, ...args);
        const languageCall = (name, fallback, ...args) => sourceCall(languageSource, name, fallback, ...args);
        const uiCall = (name, fallback, ...args) => sourceCall(uiSource, name, fallback, ...args);
        const selectionCall = (name, fallback, ...args) => sourceCall(selectionSource, name, fallback, ...args);
        const renderCall = (name, fallback, ...args) => sourceCall(renderSource, name, fallback, ...args);
        const historyCall = (name, fallback, ...args) => sourceCall(historySource, name, fallback, ...args);
        const persistenceCall = (name, fallback, ...args) => sourceCall(persistenceSource, name, fallback, ...args);
        const getNode = (id) => nodeCall('getNode', null, id);
        const isNodeLocked = (node) => !!nodeCall('isNodeLocked', false, node);
        const ensureNoteTailTarget = (node) => nodeCall('ensureNoteTailTarget', null, node);
        const snapCanvasCoord = (value) => geometryCall('snapCanvasCoord', value, value);
        const buildNoteStatePatch = (node, options) => {
            const patch = geometryCall('buildNoteStatePatch', {}, node, options || {});
            return patch && typeof patch === 'object' ? patch : {};
        };
        const t = typeof languageSource.t === 'function' ? languageSource.t : (en) => en;
        let dragState = null;

        function startNoteTailDrag(node, evt) {
            if (!node || node.type !== 'note' || !evt) return;
            if (isNodeLocked(node)) {
                uiCall('showToast', undefined, t('Locked note pointer cannot be moved.', '锁定的提示贴不能移动指引点。'));
                return;
            }
            const target = ensureNoteTailTarget(node);
            if (!target) return;
            selectionCall('selectNodeForTailDrag', undefined, node.id);
            dragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startX: Number(target.x || 0),
                startY: Number(target.y || 0),
                historyPushed: false
            };
            selectionCall('updateSelectionDomClasses', undefined);
            renderCall('renderEdges', undefined);
            renderCall('renderInspector', undefined);
            const doc = getDocument();
            doc?.addEventListener('pointermove', onNoteTailDragMove, true);
            doc?.addEventListener('pointerup', stopNoteTailDrag, true);
            doc?.addEventListener('pointercancel', stopNoteTailDrag, true);
        }

        function onNoteTailDragMove(evt) {
            if (!dragState || !evt || evt.pointerId !== dragState.pointerId) return;
            const node = getNode(dragState.nodeId);
            if (!node || node.type !== 'note') return;
            evt.preventDefault();
            const project = getProject();
            const zoom = project.viewport?.zoom || 1;
            const dx = (evt.clientX - dragState.startClientX) / zoom;
            const dy = (evt.clientY - dragState.startClientY) / zoom;
            if (!dragState.historyPushed && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
                historyCall('pushHistory', undefined, 'Move tip note pointer');
                dragState.historyPushed = true;
            }
            const nextTarget = {
                x: Math.round(dragState.startX + dx),
                y: Math.round(dragState.startY + dy)
            };
            if (project.settings?.snap) {
                nextTarget.x = snapCanvasCoord(nextTarget.x);
                nextTarget.y = snapCanvasCoord(nextTarget.y);
            }
            Object.assign(node, buildNoteStatePatch(node, {
                tailPatch: { enabled: true },
                tailTargetPatch: nextTarget
            }));
            renderCall('renderEdges', undefined);
        }

        function stopNoteTailDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const nodeId = dragState.nodeId;
            dragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onNoteTailDragMove, true);
            doc?.removeEventListener('pointerup', stopNoteTailDrag, true);
            doc?.removeEventListener('pointercancel', stopNoteTailDrag, true);
            persistenceCall('scheduleSave', undefined);
            if (selectionCall('getSelectedNodeId', null) === nodeId) renderCall('renderInspector', undefined);
        }

        return {
            startNoteTailDrag,
            onNoteTailDragMove,
            stopNoteTailDrag,
            isDragging: () => !!dragState,
            getDraggingNodeId: () => dragState?.nodeId || null
        };
    }

    window.SimpAICanvasWorkbenchNoteTail = Object.assign({}, window.SimpAICanvasWorkbenchNoteTail || {}, {
        createCanvasNoteTailController
    });
})();
