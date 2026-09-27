(function () {
    'use strict';

    function createCanvasChainRunOverlayRenderer(context) {
        const scope = context?.overlayRendererSource || context || {};
        const domSource = scope.domSource || {};
        const selectionSource = scope.selectionSource || {};
        const projectSource = scope.projectSource || {};
        const geometrySource = scope.geometrySource || {};
        const schedulerSource = scope.schedulerSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};

        function call(source, name, fallback, ...args) {
            return typeof source?.[name] === 'function' ? source[name](...args) : fallback;
        }

        function renderSelectedChainOverlay() {
            const overlay = call(domSource, 'getOverlay', null);
            if (!overlay) return;
            const ids = (call(selectionSource, 'getSelectedNodeIdList', []) || [])
                .filter(id => call(projectSource, 'getNode', null, id));
            if (ids.length < 2 || call(selectionSource, 'isMarqueeSelecting', false)) {
                overlay.hidden = true;
                return;
            }
            const compareSources = ids.map(id => call(projectSource, 'getNode', null, id))
                .filter(node => call(projectSource, 'isImageCompareSource', false, node));
            const canCompare = ids.length === 2 && compareSources.length === 2;
            const project = call(projectSource, 'getProject', {});
            const plan = call(schedulerSource, 'buildPlan', null, project, { mode: 'selected', nodeIds: ids });
            const runnable = !!plan?.steps?.length && !plan.steps.some(step =>
                Array.isArray(step.missing_inputs) && step.missing_inputs.length);
            const canRun = runnable && project.scheduler?.state !== 'running';
            if (!canCompare && !canRun) {
                overlay.hidden = true;
                return;
            }
            const rects = ids.map(id => call(geometrySource, 'getNodeRect', null,
                call(projectSource, 'getNode', null, id))).filter(Boolean);
            if (!rects.length) {
                overlay.hidden = true;
                return;
            }
            const minX = Math.min(...rects.map(rect => rect.x));
            const minY = Math.min(...rects.map(rect => rect.y));
            const maxX = Math.max(...rects.map(rect => rect.x + rect.w));
            const maxY = Math.max(...rects.map(rect => rect.y + rect.h));
            const pad = 18;
            overlay.style.left = Math.round(minX - pad) + 'px';
            overlay.style.top = Math.round(minY - pad) + 'px';
            overlay.style.width = Math.round(maxX - minX + pad * 2) + 'px';
            overlay.style.height = Math.round(maxY - minY + pad * 2) + 'px';
            overlay.classList.toggle('is-compare', canCompare);
            const button = overlay.querySelector('button');
            if (button) {
                const action = canCompare ? 'compare-selected-nodes' : 'run-selected-chain';
                const title = canCompare
                    ? call(languageSource, 't', 'Create image compare node', 'Create image compare node', '创建图像对比节点')
                    : call(languageSource, 't', 'Run selected chain', 'Run selected chain', '运行选中链路');
                button.setAttribute('data-canvas-action', action);
                button.title = title;
                button.setAttribute('aria-label', title);
                button.innerHTML = canCompare
                    ? call(renderSource, 'renderIconHtml', '', 'sai-compare-glyph')
                    : call(renderSource, 'renderIconHtml', '', 'fa-play');
            }
            overlay.hidden = false;
        }

        return { renderSelectedChainOverlay };
    }

    window.SimpAICanvasWorkbenchChainRunOverlay = Object.assign({}, window.SimpAICanvasWorkbenchChainRunOverlay || {}, {
        createCanvasChainRunOverlayRenderer
    });
})();
