(function () {
    'use strict';

    function createCanvasNoteTailController(context) {
        const scope = context || {};
        const getProject = () => typeof scope.getProject === 'function'
            ? (scope.getProject() || {})
            : {};
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getNode = (id) => typeof scope.getNode === 'function' ? scope.getNode(id) : null;
        const isNodeLocked = (node) => typeof scope.isNodeLocked === 'function' ? !!scope.isNodeLocked(node) : false;
        const ensureNoteTailTarget = (node) => typeof scope.ensureNoteTailTarget === 'function'
            ? scope.ensureNoteTailTarget(node)
            : null;
        const snapCanvasCoord = (value) => typeof scope.snapCanvasCoord === 'function'
            ? scope.snapCanvasCoord(value)
            : value;
        const buildNoteStatePatch = (node, options) => {
            const patch = call('buildNoteStatePatch', node, options || {});
            return patch && typeof patch === 'object' ? patch : {};
        };
        const t = typeof scope.t === 'function' ? scope.t : (en) => en;
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        let dragState = null;

        function startNoteTailDrag(node, evt) {
            if (!node || node.type !== 'note' || !evt) return;
            if (isNodeLocked(node)) {
                call('showToast', t('Locked note pointer cannot be moved.', '锁定的提示贴不能移动指引点。'));
                return;
            }
            const target = ensureNoteTailTarget(node);
            if (!target) return;
            call('selectNodeForTailDrag', node.id);
            dragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startX: Number(target.x || 0),
                startY: Number(target.y || 0),
                historyPushed: false
            };
            call('updateSelectionDomClasses');
            call('renderEdges');
            call('renderInspector');
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
                call('pushHistory', 'Move tip note pointer');
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
            call('renderEdges');
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
            call('scheduleSave');
            if (call('getSelectedNodeId') === nodeId) call('renderInspector');
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
