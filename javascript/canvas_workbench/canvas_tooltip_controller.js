(function () {
    'use strict';

    function createCanvasTooltipController(context) {
        const scope = context || {};
        const getDocument = () => scope.document || (typeof document !== 'undefined' ? document : null);
        const getWindow = () => scope.window || (typeof window !== 'undefined' ? window : { innerWidth: 0, innerHeight: 0 });
        const getRoot = () => typeof scope.getRoot === 'function' ? scope.getRoot() : null;
        const isCanvasPointerGestureActive = () => (
            typeof scope.isCanvasPointerGestureActive === 'function'
            && scope.isCanvasPointerGestureActive()
        );
        let tooltipEl = null;
        let tooltipTarget = null;
        let tooltipText = '';

        function tooltipElementFromTarget(target) {
            if (!target?.closest) return null;
            if (target.closest('[data-canvas-agent-panel]')) return null;
            if (target.closest('[data-vlm-chat-image]')) return null;
            if (target.closest('[data-hover-preview-kind],[data-model-preview-param],[data-model-preview-lora-index]')) return null;
            const explicit = target.closest('[data-sai-tooltip],[title]');
            if (explicit) return explicit;
            const aria = target.closest('[aria-label]');
            if (!aria) return null;
            const interactive = 'button,[role="button"],input,textarea,select,a,[tabindex],[data-canvas-action],[data-node-action],[data-inspector-action],[data-ref-action],[data-disk-action],[data-project-row-action]';
            return aria.matches?.(interactive) ? aria : null;
        }

        function getTooltipText(el) {
            if (!el) return '';
            return String(el.getAttribute('data-sai-tooltip') || el.getAttribute('title') || el.getAttribute('data-sai-native-title') || el.getAttribute('aria-label') || '').trim();
        }

        function ensureCanvasTooltip() {
            if (tooltipEl && tooltipEl.isConnected) return tooltipEl;
            const doc = getDocument();
            if (!doc?.createElement) return null;
            tooltipEl = doc.createElement('div');
            tooltipEl.className = 'sai-canvas-tooltip';
            tooltipEl.setAttribute('role', 'tooltip');
            tooltipEl.hidden = true;
            getRoot()?.appendChild?.(tooltipEl);
            return tooltipEl;
        }

        function showCanvasTooltipFor(el, clientX, clientY) {
            const root = getRoot();
            const text = getTooltipText(el);
            if (!text || !root || root.hidden) return;
            if (el.hasAttribute?.('title')) {
                el.setAttribute('data-sai-native-title', el.getAttribute('title') || '');
                el.removeAttribute('title');
            }
            tooltipTarget = el;
            tooltipText = text;
            const tip = ensureCanvasTooltip();
            if (!tip) return;
            tip.textContent = text;
            tip.hidden = false;
            tip.classList.add('is-visible');
            positionCanvasTooltip(clientX, clientY);
        }

        function positionCanvasTooltip(clientX, clientY) {
            if (!tooltipEl || tooltipEl.hidden) return;
            const pad = 12;
            const offset = 14;
            const rect = tooltipEl.getBoundingClientRect();
            const viewport = getWindow();
            let left = clientX + offset;
            let top = clientY + offset;
            if (left + rect.width + pad > viewport.innerWidth) left = Math.max(pad, clientX - rect.width - offset);
            if (top + rect.height + pad > viewport.innerHeight) top = Math.max(pad, clientY - rect.height - offset);
            tooltipEl.style.left = `${Math.round(left)}px`;
            tooltipEl.style.top = `${Math.round(top)}px`;
        }

        function restoreTooltipTitle(el) {
            if (!el || !el.hasAttribute?.('data-sai-native-title')) return;
            el.setAttribute('title', el.getAttribute('data-sai-native-title') || '');
            el.removeAttribute('data-sai-native-title');
        }

        function hideCanvasTooltip() {
            if (tooltipTarget) restoreTooltipTitle(tooltipTarget);
            tooltipTarget = null;
            tooltipText = '';
            if (tooltipEl) {
                tooltipEl.classList.remove('is-visible');
                tooltipEl.hidden = true;
            }
        }

        function onTooltipPointerOver(evt) {
            if (isCanvasPointerGestureActive()) {
                if (tooltipTarget) hideCanvasTooltip();
                return;
            }
            const el = tooltipElementFromTarget(evt.target);
            if (!el || el === tooltipTarget) return;
            hideCanvasTooltip();
            showCanvasTooltipFor(el, evt.clientX, evt.clientY);
        }

        function onTooltipPointerMove(evt) {
            if (isCanvasPointerGestureActive()) {
                if (tooltipTarget) hideCanvasTooltip();
                return;
            }
            if (!tooltipTarget) return;
            positionCanvasTooltip(evt.clientX, evt.clientY);
        }

        function onTooltipPointerOut(evt) {
            if (!tooltipTarget) return;
            if (evt.relatedTarget && tooltipTarget.contains?.(evt.relatedTarget)) return;
            hideCanvasTooltip();
        }

        function onTooltipFocusIn(evt) {
            if (isCanvasPointerGestureActive()) return;
            const el = tooltipElementFromTarget(evt.target);
            if (!el) return;
            const rect = el.getBoundingClientRect();
            showCanvasTooltipFor(el, rect.left + rect.width / 2, rect.bottom);
        }

        return {
            tooltipElementFromTarget,
            getTooltipText,
            ensureCanvasTooltip,
            showCanvasTooltipFor,
            positionCanvasTooltip,
            restoreTooltipTitle,
            hideCanvasTooltip,
            onTooltipPointerOver,
            onTooltipPointerMove,
            onTooltipPointerOut,
            onTooltipFocusIn
        };
    }

    window.SimpAICanvasWorkbenchTooltip = Object.assign({}, window.SimpAICanvasWorkbenchTooltip || {}, {
        createCanvasTooltipController
    });
})();
