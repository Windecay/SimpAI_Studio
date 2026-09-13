(function () {
    'use strict';

    function createCanvasOutpaintController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const escapeHtml = scope.escapeHtml || (value => String(value ?? ''));
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getState = () => typeof scope.getOutpaintOverlayState === 'function'
            ? scope.getOutpaintOverlayState()
            : null;
        const getProject = () => typeof scope.getProject === 'function'
            ? scope.getProject()
            : null;
        const getOverlayElement = () => typeof scope.getOutpaintOverlayElement === 'function'
            ? scope.getOutpaintOverlayElement()
            : null;
        const getCanvasAgentSettings = () => typeof scope.getCanvasAgentSettings === 'function'
            ? (scope.getCanvasAgentSettings() || {})
            : {};
        const getNodeElement = (nodeId) => {
            if (typeof scope.getOutpaintNodeElement === 'function') {
                return scope.getOutpaintNodeElement(nodeId);
            }
            return null;
        };
        const getStage = () => typeof scope.getOutpaintStage === 'function'
            ? scope.getOutpaintStage()
            : null;
        const getDefaultNodeSize = (type) => typeof scope.defaultNodeSize === 'function'
            ? (scope.defaultNodeSize(type) || {})
            : {};
        const getViewportZoom = () => {
            const value = typeof scope.getViewportZoom === 'function' ? scope.getViewportZoom() : 1;
            return Math.max(0.01, Number(value) || 1);
        };
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : (value, min, max) => Math.max(min, Math.min(max, value));
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const edgeKeys = {
            top: 'up',
            bottom: 'down',
            left: 'left',
            right: 'right'
        };
        let dragState = null;

        const getTargetNode = () => {
            if (typeof scope.getOutpaintTargetNode === 'function') {
                return scope.getOutpaintTargetNode();
            }
            const state = getState();
            const project = getProject();
            return state?.nodeId
                ? project?.nodes?.find(node => node.id === state.nodeId) || null
                : null;
        };

        const isImageTarget = (node) => typeof scope.isCanvasAgentImageTarget === 'function'
            ? !!scope.isCanvasAgentImageTarget(node)
            : true;

        const requestOverlaySync = () => {
            if (typeof scope.syncOutpaintOverlayPosition === 'function') {
                return scope.syncOutpaintOverlayPosition();
            }
            return syncOutpaintOverlayPosition();
        };

        const getMediaSize = (node) => typeof scope.getOutpaintMediaSize === 'function'
            ? scope.getOutpaintMediaSize(node)
            : getOutpaintMediaSize(node);

        function edgeValue(state, edge) {
            const key = edgeKeys[edge];
            return key ? Number(state?.[key] || 0) : 0;
        }

        function setEdgeValue(state, edge, value) {
            const key = edgeKeys[edge];
            if (key) state[key] = value;
        }

        function startOutpaintEdgeDrag(edge, evt) {
            const state = getState();
            if (!state?.active || !edgeKeys[edge] || !evt) return;
            evt.preventDefault();
            evt.stopPropagation();
            dragState = {
                pointerId: evt.pointerId,
                edge,
                startX: evt.clientX,
                startY: evt.clientY,
                initialValue: edgeValue(state, edge)
            };
            const doc = getDocument();
            doc?.addEventListener('pointermove', onOutpaintDragMove, true);
            doc?.addEventListener('pointerup', stopOutpaintEdgeDrag, true);
            doc?.addEventListener('pointercancel', stopOutpaintEdgeDrag, true);
        }

        function onOutpaintDragMove(evt) {
            const current = dragState;
            if (!current || !evt || evt.pointerId !== current.pointerId) return;
            const state = getState();
            const node = getTargetNode();
            if (!state?.active || !node) return;
            const size = getMediaSize(node) || {};
            const mediaW = Math.max(1, Number(size.width ?? size.w) || 1);
            const mediaH = Math.max(1, Number(size.height ?? size.h) || 1);
            const zoom = getViewportZoom();
            const dx = (evt.clientX - current.startX) / zoom;
            const dy = (evt.clientY - current.startY) / zoom;
            let pixelDelta = 0;
            if (current.edge === 'top') pixelDelta = -dy;
            else if (current.edge === 'bottom') pixelDelta = dy;
            else if (current.edge === 'left') pixelDelta = -dx;
            else if (current.edge === 'right') pixelDelta = dx;
            const baseSize = current.edge === 'top' || current.edge === 'bottom' ? mediaH : mediaW;
            setEdgeValue(state, current.edge, clamp(Math.round(current.initialValue + (pixelDelta / baseSize) * 100), 0, 100));
            requestOverlaySync();
            syncOutpaintAgentPanel();
            evt.preventDefault();
        }

        function persistOutpaintSettings() {
            const state = getState();
            if (!state) return;
            try {
                call('setCanvasAgentSettingsPatch', {
                    outpaintUpPercent: state.up,
                    outpaintDownPercent: state.down,
                    outpaintLeftPercent: state.left,
                    outpaintRightPercent: state.right
                }, { silentHistory: true });
            } catch (err) {}
        }

        function stopOutpaintEdgeDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const state = dragState;
            removeDragListeners();
            dragState = null;
            if (!state) return;
            persistOutpaintSettings();
        }

        function removeDragListeners() {
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onOutpaintDragMove, true);
            doc?.removeEventListener('pointerup', stopOutpaintEdgeDrag, true);
            doc?.removeEventListener('pointercancel', stopOutpaintEdgeDrag, true);
        }

        function cancelOutpaintEdgeDrag() {
            if (!dragState) return;
            dragState = null;
            removeDragListeners();
        }

        function updateOutpaintFromSlider(edge, value) {
            const state = getState();
            if (!state?.active || !edgeKeys[edge]) return;
            setEdgeValue(state, edge, clamp(Number(value) || 0, 0, 100));
            requestOverlaySync();
        }

        function onOutpaintOverlayPointerDown(evt) {
            const edge = evt?.target?.closest?.('.sai-outpaint-edge');
            if (edge) {
                startOutpaintEdgeDrag(edge.getAttribute('data-edge'), evt);
                return;
            }
            evt?.stopPropagation?.();
        }

        function onOutpaintSliderInput(evt) {
            const slider = evt?.target?.closest?.('[data-outpaint-slider]');
            const state = getState();
            if (!slider || !state?.active) return false;
            const edge = slider.getAttribute('data-outpaint-slider');
            const panel = typeof scope.getCanvasAgentPanel === 'function' ? scope.getCanvasAgentPanel() : null;
            const output = panel?.querySelector?.(`[data-outpaint-output="${edge}"]`);
            if (output) output.textContent = slider.value + '%';
            updateOutpaintFromSlider(edge, slider.value);
            return true;
        }

        function syncOutpaintAgentPanel() {
            const state = getState();
            const panel = typeof scope.getCanvasAgentPanel === 'function' ? scope.getCanvasAgentPanel() : null;
            if (!state?.active || !panel) return;
            Object.keys(edgeKeys).forEach(edge => {
                const slider = panel.querySelector?.(`[data-outpaint-slider="${edge}"]`);
                const output = panel.querySelector?.(`[data-outpaint-output="${edge}"]`);
                const value = edgeValue(state, edge);
                if (slider) slider.value = value;
                if (output) output.textContent = `${value}%`;
            });
        }

        function renderOutpaintControlPanel() {
            const state = getState();
            if (!state?.active) return '';
            const rows = [
                { key: 'top', label: t('Up', '上'), icon: '↑', value: state.up },
                { key: 'bottom', label: t('Down', '下'), icon: '↓', value: state.down },
                { key: 'left', label: t('Left', '左'), icon: '←', value: state.left },
                { key: 'right', label: t('Right', '右'), icon: '→', value: state.right }
            ];
            return `
<div class="sai-outpaint-control">
  <div class="sai-outpaint-control-title">
    <i class="fa-solid fa-expand"></i>
    <span>${escapeHtml(t('Outpaint Range', '扩图范围'))}</span>
  </div>
  <div class="sai-outpaint-control-grid">
    ${rows.map(row => `<div class="sai-outpaint-control-edge">
      <span class="sai-outpaint-edge-label">${escapeHtml(row.icon)} ${escapeHtml(row.label)}</span>
      <input type="range" data-outpaint-slider="${row.key}" min="0" max="100" value="${row.value}">
      <output data-outpaint-output="${row.key}">${row.value}%</output>
    </div>`).join('')}
  </div>
  <div class="sai-outpaint-control-actions">
    <button type="button" class="is-primary" data-canvas-agent-action="confirm-outpaint"><i class="fa-solid fa-play"></i><span>${escapeHtml(t('Confirm & Run', '确认运行'))}</span></button>
    <button type="button" data-canvas-agent-action="cancel-outpaint"><i class="fa-solid fa-xmark"></i><span>${escapeHtml(t('Cancel', '取消'))}</span></button>
  </div>
  <div class="sai-outpaint-control-note">${escapeHtml(t('Drag edges on canvas or use sliders. Enter to confirm, Esc to cancel.', '拖动画布边框或使用滑块。Enter 确认，Esc 取消。'))}</div>
</div>`;
        }

        function showOutpaintOverlay(nodeId, initialPcts) {
            const overlay = getOverlayElement();
            if (!overlay) return;
            const project = getProject();
            const node = project?.nodes?.find(item => item.id === nodeId);
            if (!node) return;
            const state = getState();
            if (!state) return;
            const settings = getCanvasAgentSettings();
            state.active = true;
            state.nodeId = nodeId;
            state.up = clamp(Number(initialPcts?.up ?? settings.outpaintUpPercent ?? 15), 0, 100);
            state.down = clamp(Number(initialPcts?.down ?? settings.outpaintDownPercent ?? 15), 0, 100);
            state.left = clamp(Number(initialPcts?.left ?? settings.outpaintLeftPercent ?? 15), 0, 100);
            state.right = clamp(Number(initialPcts?.right ?? settings.outpaintRightPercent ?? 15), 0, 100);
            overlay.hidden = false;
            syncOutpaintOverlayPosition();
        }

        function hideOutpaintOverlay() {
            const overlay = getOverlayElement();
            cancelOutpaintEdgeDrag();
            if (overlay) overlay.hidden = true;
            const state = getState();
            if (state) {
                state.active = false;
                state.nodeId = '';
            }
        }

        function getOutpaintMediaGeometry(node) {
            if (!node) return null;
            const nodeEl = getNodeElement(node.id);
            const mediaEl = nodeEl?.querySelector?.('.sai-node-media');
            const stage = getStage();
            const zoom = getViewportZoom();
            const stageRect = stage?.getBoundingClientRect?.();
            const mediaRect = mediaEl?.getBoundingClientRect?.();
            if (nodeEl && mediaEl && stageRect && mediaRect) {
                return {
                    x: (mediaRect.left - stageRect.left) / zoom,
                    y: (mediaRect.top - stageRect.top) / zoom,
                    width: mediaRect.width / zoom,
                    height: mediaRect.height / zoom
                };
            }
            const size = getDefaultNodeSize(node.type);
            return {
                x: node.x || 0,
                y: node.y || 0,
                width: node.w || size.w,
                height: node.h || size.h
            };
        }

        function getOutpaintMediaSize(node) {
            const geometry = getOutpaintMediaGeometry(node);
            return geometry ? { width: geometry.width, height: geometry.height } : null;
        }

        function syncOutpaintOverlayPosition() {
            const overlay = getOverlayElement();
            const state = getState();
            if (!overlay || !state?.active) return;
            const node = getTargetNode();
            if (!node) {
                hideOutpaintOverlay();
                return;
            }
            const media = getOutpaintMediaGeometry(node);
            if (!media) return;
            const mediaX = media.x;
            const mediaY = media.y;
            const mediaW = media.width;
            const mediaH = media.height;
            const exUp = mediaH * (state.up / 100);
            const exDown = mediaH * (state.down / 100);
            const exLeft = mediaW * (state.left / 100);
            const exRight = mediaW * (state.right / 100);
            const outerX = mediaX - exLeft;
            const outerY = mediaY - exUp;
            const outerW = mediaW + exLeft + exRight;
            const outerH = mediaH + exUp + exDown;
            overlay.style.left = `${outerX}px`;
            overlay.style.top = `${outerY}px`;
            overlay.style.width = `${outerW}px`;
            overlay.style.height = `${outerH}px`;
            const outer = overlay.querySelector('.sai-outpaint-outer');
            if (outer) {
                outer.style.left = '0';
                outer.style.top = '0';
                outer.style.width = `${outerW}px`;
                outer.style.height = `${outerH}px`;
            }
            const inner = overlay.querySelector('.sai-outpaint-inner');
            if (inner) {
                inner.style.left = `${exLeft}px`;
                inner.style.top = `${exUp}px`;
                inner.style.width = `${mediaW}px`;
                inner.style.height = `${mediaH}px`;
            }
            const edgeW = 10;
            const hTop = overlay.querySelector('[data-edge="top"]');
            const hBot = overlay.querySelector('[data-edge="bottom"]');
            const hL = overlay.querySelector('[data-edge="left"]');
            const hR = overlay.querySelector('[data-edge="right"]');
            if (hTop) { hTop.style.left = '0'; hTop.style.top = '0'; hTop.style.width = `${outerW}px`; hTop.style.height = `${Math.max(edgeW, exUp)}px`; }
            if (hBot) { hBot.style.left = '0'; hBot.style.top = `${exUp + mediaH}px`; hBot.style.width = `${outerW}px`; hBot.style.height = `${Math.max(edgeW, exDown)}px`; }
            if (hL) { hL.style.left = '0'; hL.style.top = '0'; hL.style.width = `${Math.max(edgeW, exLeft)}px`; hL.style.height = `${outerH}px`; }
            if (hR) { hR.style.left = `${exLeft + mediaW}px`; hR.style.top = '0'; hR.style.width = `${Math.max(edgeW, exRight)}px`; hR.style.height = `${outerH}px`; }
            const lTop = overlay.querySelector('[data-dim="top"]');
            const lBot = overlay.querySelector('[data-dim="bottom"]');
            const lL = overlay.querySelector('[data-dim="left"]');
            const lR = overlay.querySelector('[data-dim="right"]');
            if (lTop && exUp > 6) { lTop.textContent = `${state.up}%`; lTop.style.left = `${outerW / 2}px`; lTop.style.top = `${exUp / 2}px`; lTop.style.transform = 'translate(-50%, -50%)'; }
            if (lBot && exDown > 6) { lBot.textContent = `${state.down}%`; lBot.style.left = `${outerW / 2}px`; lBot.style.top = `${exUp + mediaH + exDown / 2}px`; lBot.style.transform = 'translate(-50%, -50%)'; }
            if (lL && exLeft > 6) { lL.textContent = `${state.left}%`; lL.style.left = `${exLeft / 2}px`; lL.style.top = `${outerH / 2}px`; lL.style.transform = 'translate(-50%, -50%)'; }
            if (lR && exRight > 6) { lR.textContent = `${state.right}%`; lR.style.left = `${exLeft + mediaW + exRight / 2}px`; lR.style.top = `${outerH / 2}px`; lR.style.transform = 'translate(-50%, -50%)'; }
        }

        function ensureOutpaintOverlayMatchesAgentTarget(target) {
            const state = getState();
            if (!state?.active) return;
            if (!target || target.id !== state.nodeId || !isImageTarget(target)) {
                hideOutpaintOverlay();
            }
        }

        return {
            startOutpaintEdgeDrag,
            onOutpaintDragMove,
            stopOutpaintEdgeDrag,
            cancelOutpaintEdgeDrag,
            onOutpaintOverlayPointerDown,
            onOutpaintSliderInput,
            updateOutpaintFromSlider,
            syncOutpaintAgentPanel,
            renderOutpaintControlPanel,
            showOutpaintOverlay,
            hideOutpaintOverlay,
            getOutpaintTargetNode: getTargetNode,
            getOutpaintMediaGeometry,
            getOutpaintMediaSize,
            syncOutpaintOverlayPosition,
            ensureOutpaintOverlayMatchesAgentTarget,
            isDragging: () => !!dragState
        };
    }

    window.SimpAICanvasWorkbenchOutpaint = Object.assign({}, window.SimpAICanvasWorkbenchOutpaint || {}, {
        createCanvasOutpaintController
    });
})();
