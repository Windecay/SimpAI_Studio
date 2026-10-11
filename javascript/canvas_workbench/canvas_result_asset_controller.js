(function () {
    'use strict';

    function createCanvasResultAssetController(context) {
        const scope = context?.resultAssetSource || context || {};
        const resultSource = scope.resultSource || {};
        const serializationSource = scope.serializationSource || {};
        const utilitySource = scope.utilitySource || {};
        const uiSource = scope.uiSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const cloneRunValue = (value, fallback) => call(
            serializationSource,
            'cloneRunValue',
            fallback,
            value,
            fallback
        );
        const clampValue = (value, min, max) => call(
            utilitySource,
            'clamp',
            Math.max(min, Math.min(max, value)),
            value,
            min,
            max
        );
        const buildResultAssetPatch = (...args) => call(
            resultSource,
            'buildResultAssetPatch',
            {},
            ...args
        );
        const buildResultAssetSelectionPatch = (...args) => call(
            resultSource,
            'buildResultAssetSelectionPatch',
            {},
            ...args
        );

        function getSelectedResultAsset(node) {
            if (!node) return null;
            const assets = Array.isArray(node.assets) ? node.assets : [];
            const index = clampValue(Number(node.selected_asset_index || 0), 0, Math.max(assets.length - 1, 0));
            return assets[index] || node.asset || null;
        }

        function getResultAssetAt(node, index) {
            if (!node) return null;
            const assets = Array.isArray(node.assets) ? node.assets : [];
            if (!assets.length) return node.asset || null;
            const safeIndex = clampValue(Number(index || 0), 0, Math.max(assets.length - 1, 0));
            return assets[safeIndex] || node.asset || null;
        }

        function selectResultAsset(node, index) {
            if (!node || node.type !== 'result') return null;
            const assets = Array.isArray(node.assets) ? node.assets : [];
            const safeIndex = clampValue(Number(index || 0), 0, Math.max(assets.length - 1, 0));
            if (assets[safeIndex]) {
                Object.assign(node, buildResultAssetPatch(node, {
                    asset: cloneRunValue(assets[safeIndex], node.asset || null),
                    selectedAssetIndex: safeIndex
                }));
                Object.assign(node, buildResultAssetSelectionPatch(node, node.asset));
            }
            return getResultAssetAt(node, safeIndex);
        }

        function positionResultMetadataPopover(wrap) {
            const popup = wrap?.querySelector?.('.sai-result-metadata-popover');
            const nodeEl = wrap?.closest?.('.sai-canvas-node');
            const viewport = wrap?.ownerDocument?.defaultView;
            if (!popup || !nodeEl || !viewport) return false;
            const scale = nodeEl.getBoundingClientRect().width / nodeEl.offsetWidth || 1;
            const pad = 12;
            const canvasRect = wrap.closest('.sai-canvas-viewport')?.getBoundingClientRect();
            const bounds = {
                left: Math.max(0, canvasRect?.left ?? 0) + pad,
                top: Math.max(0, canvasRect?.top ?? 0) + pad,
                right: Math.min(viewport.innerWidth, canvasRect?.right ?? viewport.innerWidth) - pad,
                bottom: Math.min(viewport.innerHeight, canvasRect?.bottom ?? viewport.innerHeight) - pad
            };
            popup.style.transform = 'none';
            popup.style.maxWidth = `${Math.max(1, (bounds.right - bounds.left) / scale)}px`;
            popup.style.maxHeight = `${Math.max(1, (bounds.bottom - bounds.top) / scale)}px`;
            let rect = popup.getBoundingClientRect();
            const anchor = wrap.getBoundingClientRect();
            let left = anchor.right + pad;
            let top = anchor.top;
            if (left + rect.width > bounds.right) {
                left = anchor.left - pad - rect.width;
                if (left < bounds.left) {
                    left = anchor.right - rect.width;
                    const below = bounds.bottom - anchor.bottom - pad;
                    const above = anchor.top - pad - bounds.top;
                    const useBelow = below >= rect.height || below >= above;
                    const availableHeight = Math.max(1, useBelow ? below : above);
                    popup.style.maxHeight = `${availableHeight / scale}px`;
                    rect = popup.getBoundingClientRect();
                    top = useBelow ? anchor.bottom + pad : anchor.top - pad - rect.height;
                }
            }
            left = Math.max(bounds.left, Math.min(left, bounds.right - rect.width));
            top = Math.max(bounds.top, Math.min(top, bounds.bottom - rect.height));
            const x = left - rect.left;
            const y = top - rect.top;
            popup.style.transform = `translate(${x / scale}px, ${y / scale}px)`;
            popup.classList.toggle('is-repositioned', !!(x || y));
            return true;
        }

        function handleResultMetadataToggle(node, evt) {
            if (!node || node.type !== 'result' || !evt?.target) return false;
            const button = evt.target.closest?.('[data-result-metadata-toggle]');
            if (!button) return false;
            evt.preventDefault();
            evt.stopPropagation();
            const wrap = button.closest?.('[data-result-metadata]');
            if (wrap) {
                wrap.classList.toggle('is-pinned');
                const pinned = !!wrap.classList.contains?.('is-pinned');
                button.setAttribute?.('aria-expanded', String(pinned));
                if (!pinned) button.blur?.();
                positionResultMetadataPopover(wrap);
            }
            return true;
        }

        function handleResultAssetClick(node, evt) {
            if (!evt?.target) return false;
            const button = evt.target.closest?.('[data-result-asset-index]');
            if (!button) return false;
            evt.preventDefault();
            evt.stopPropagation();
            selectResultAsset(node, Number(button.getAttribute('data-result-asset-index')) || 0);
            call(uiSource, 'mutate', undefined);
            return true;
        }

        function resultNodeHasOutput(node) {
            return !!(node && node.type === 'result' && (node.asset || (Array.isArray(node.assets) && node.assets.length)));
        }

        return {
            getSelectedResultAsset,
            getResultAssetAt,
            selectResultAsset,
            resultNodeHasOutput,
            positionResultMetadataPopover,
            handleResultMetadataToggle,
            handleResultAssetClick
        };
    }

    window.SimpAICanvasWorkbenchResultAsset = Object.assign(
        {},
        window.SimpAICanvasWorkbenchResultAsset || {},
        { createCanvasResultAssetController }
    );
})();
