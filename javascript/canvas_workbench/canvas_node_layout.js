(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const clamp = UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));

    function createCanvasNodeLayoutController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const utilitySource = sourceObject('utilitySource');
        const nodeSource = sourceObject('nodeSource');
        const projectSource = sourceObject('projectSource');
        const viewportSource = sourceObject('viewportSource');
        const patchSource = sourceObject('patchSource');
        const persistenceSource = sourceObject('persistenceSource');
        const sourceCall = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args)
            : fallback;
        const defaultNodeSize = (type) => {
            const size = sourceCall(nodeSource, 'defaultNodeSize', null, type);
            return size && typeof size === 'object' ? size : { w: 220, h: 250 };
        };
        const supportsCollapsedPromptHeight = (node) => !!sourceCall(
            nodeSource,
            'supportsCollapsedPromptHeight',
            false,
            node
        );
        const collapsedPromptNodeHeight = (node) => sourceCall(
            nodeSource,
            'collapsedPromptNodeHeight',
            0,
            node
        );
        const getMeasuredNodeLayout = (id) => sourceCall(nodeSource, 'getMeasuredNodeLayout', null, id);
        const getProjectNodes = () => sourceCall(projectSource, 'getProjectNodes', [],) || [];
        const getVisibleWorldRect = () => sourceCall(viewportSource, 'getVisibleWorldRect', null);
        const viewportGetNodeRect = typeof viewportSource.viewportGetNodeRect === 'function'
            ? viewportSource.viewportGetNodeRect
            : null;
        const viewportFindOpenNodePosition = typeof viewportSource.viewportFindOpenNodePosition === 'function'
            ? viewportSource.viewportFindOpenNodePosition
            : null;
        const scheduleSave = (...args) => {
            sourceCall(persistenceSource, 'scheduleSave', undefined, ...args);
        };
        const buildResultLayoutPatch = typeof patchSource.buildResultLayoutPatch === 'function'
            ? patchSource.buildResultLayoutPatch
            : (_resultNode, patch) => Object.assign({}, patch || {});
        const buildNodeLayoutPatch = typeof patchSource.buildNodeLayoutPatch === 'function'
            ? patchSource.buildNodeLayoutPatch
            : (_node, patch) => Object.assign({}, patch || {});
        const clamp = typeof utilitySource.clamp === 'function' ? utilitySource.clamp : UTILS.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
        const collapsedPromptMinHeight = Math.max(1, Number(nodeSource.collapsedPromptMinHeight || 220));

        function applyNodeLayoutPatch(node, options) {
            const patch = buildNodeLayoutPatch(node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        }

        function defaultResultNodeSize(asset) {
            const base = defaultNodeSize('result');
            const width = Number(asset?.width || asset?.preview_width || asset?.display_width || asset?.source_width || 0);
            const height = Number(asset?.height || asset?.preview_height || asset?.display_height || asset?.source_height || 0);
            if (!width || !height) {
                return {
                    w: Math.max(340, Number(base.w || 340)),
                    h: Math.max(330, Number(base.h || 330))
                };
            }
            const aspect = width / Math.max(1, height);
            if (aspect <= 0.84) {
                return {
                    w: Math.max(360, Number(base.w || 340)),
                    h: Math.max(420, Number(base.h || 330))
                };
            }
            if (aspect >= 1.2) {
                return {
                    w: Math.max(420, Number(base.w || 340)),
                    h: Math.max(330, Number(base.h || 330))
                };
            }
            return {
                w: Math.max(380, Number(base.w || 340)),
                h: Math.max(380, Number(base.h || 330))
            };
        }

        function boundedImageNodeSizeForAsset(asset) {
            const minW = 180;
            const minH = 160;
            const maxW = 640;
            const maxH = 520;
            const width = Number(asset?.width || asset?.preview_width || asset?.display_width || asset?.source_width || 0);
            const height = Number(asset?.height || asset?.preview_height || asset?.display_height || asset?.source_height || 0);
            if (!width || !height) return { w: 360, h: 360 };
            const minAspect = minW / maxH;
            const maxAspect = maxW / minH;
            const aspect = clamp(width / Math.max(1, height), minAspect, maxAspect);
            let w = maxW;
            let h = w / aspect;
            if (h > maxH) {
                h = maxH;
                w = h * aspect;
            }
            return {
                w: Math.round(clamp(w, minW, maxW)),
                h: Math.round(clamp(h, minH, maxH))
            };
        }

        function fitImageNodeToAssetBounds(node, asset, options) {
            if (!node || node.type !== 'image' || !asset) return false;
            const displayMode = String(node.display_mode || node.image_display_mode || '').toLowerCase();
            if (displayMode === 'card') return false;
            const size = boundedImageNodeSizeForAsset(asset);
            const previousW = Number(node.w || defaultNodeSize('image').w || size.w);
            const previousH = Number(node.h || defaultNodeSize('image').h || size.h);
            if (Math.abs(previousW - size.w) < 1 && Math.abs(previousH - size.h) < 1) return false;
            const layoutPatch = { w: size.w, h: size.h };
            if (options?.preserveCenter !== false) {
                layoutPatch.x = Math.round(Number(node.x || 0) + (previousW - size.w) / 2);
                layoutPatch.y = Math.round(Number(node.y || 0) + (previousH - size.h) / 2);
            }
            applyNodeLayoutPatch(node, layoutPatch);
            return true;
        }

        function ensureResultNodeReadableSize(resultNode, asset) {
            if (!resultNode || resultNode.type !== 'result') return false;
            const size = defaultResultNodeSize(asset);
            let changed = false;
            const layoutPatch = {};
            if (Number(resultNode.w || 0) < size.w) {
                layoutPatch.w = size.w;
                changed = true;
            }
            if (Number(resultNode.h || 0) < size.h) {
                layoutPatch.h = size.h;
                changed = true;
            }
            if (changed) Object.assign(resultNode, buildResultLayoutPatch(resultNode, layoutPatch));
            return changed;
        }

        function minResizableNodeSize(node) {
            if (supportsCollapsedPromptHeight(node)) {
                return { w: 260, h: collapsedPromptMinHeight };
            }
            if (node?.type === 'vlm' && (node.params?.mode || 'single') === 'chat') {
                return { w: 420, h: 680 };
            }
            if (node?.type === 'media_browser') {
                return { w: 520, h: 420 };
            }
            const defaults = defaultNodeSize(node?.type || 'fallback');
            return {
                w: Math.max(160, Math.min(Number(defaults.w || 220), 260)),
                h: Math.max(120, Math.min(Number(defaults.h || 250), 220))
            };
        }

        function ensureMediaBrowserNodeReadableSize(node) {
            if (!node || node.type !== 'media_browser') return false;
            const size = minResizableNodeSize(node);
            let changed = false;
            const layoutPatch = {};
            if (Number(node.w || 0) < size.w) {
                layoutPatch.w = size.w;
                changed = true;
            }
            if (Number(node.h || 0) < size.h) {
                layoutPatch.h = size.h;
                changed = true;
            }
            if (changed) {
                applyNodeLayoutPatch(node, layoutPatch);
                scheduleSave();
            }
            return changed;
        }

        function getNodeLayoutSize(node) {
            if (!node) return null;
            const defaults = defaultNodeSize(node.type);
            const fallback = {
                w: Number(node.w || defaults.w),
                h: Number(node.h || defaults.h)
            };
            if (node.type === 'group') return fallback;
            if (supportsCollapsedPromptHeight(node)) {
                return {
                    w: fallback.w,
                    h: collapsedPromptNodeHeight(node)
                };
            }
            const measured = getMeasuredNodeLayout(node.id || '');
            if (!measured || !Number.isFinite(measured.w) || !Number.isFinite(measured.h)) return fallback;
            return {
                w: Math.max(1, measured.w),
                h: Math.max(1, measured.h)
            };
        }

        function getNodeRect(node, position) {
            return typeof viewportGetNodeRect === 'function'
                ? viewportGetNodeRect(node, position, { defaultNodeSize, getNodeLayoutSize })
                : (() => {
                    const size = getNodeLayoutSize(node) || defaultNodeSize(node?.type);
                    return {
                        x: Math.round(position?.x ?? node?.x ?? 0),
                        y: Math.round(position?.y ?? node?.y ?? 0),
                        w: Number(size.w),
                        h: Number(size.h)
                    };
                })();
        }

        function findOpenNodePosition(base, sizeOrType, options) {
            const opts = Object.assign({
                visibleRect: getVisibleWorldRect(),
                visibleMargin: 32
            }, options || {});
            if (options?.keepVisible === false) {
                delete opts.visibleRect;
                delete opts.visibleMargin;
            }
            return typeof viewportFindOpenNodePosition === 'function'
                ? viewportFindOpenNodePosition(
                    getProjectNodes(),
                    base,
                    sizeOrType,
                    Object.assign({ defaultNodeSize, getNodeLayoutSize }, opts)
                )
                : { x: Math.round(base?.x || 0), y: Math.round(base?.y || 0) };
        }

        function placeNodeAvoidingOverlap(node, base, options) {
            const reserved = options?.reserved;
            const position = findOpenNodePosition(
                base || { x: node.x || 0, y: node.y || 0 },
                { w: node.w || defaultNodeSize(node.type).w, h: node.h || defaultNodeSize(node.type).h },
                options
            );
            applyNodeLayoutPatch(node, { x: position.x, y: position.y });
            if (Array.isArray(reserved)) reserved.push(getNodeRect(node));
            return node;
        }

        return {
            boundedImageNodeSizeForAsset,
            defaultResultNodeSize,
            ensureResultNodeReadableSize,
            ensureMediaBrowserNodeReadableSize,
            fitImageNodeToAssetBounds,
            findOpenNodePosition,
            getNodeRect,
            getNodeLayoutSize,
            minResizableNodeSize,
            placeNodeAvoidingOverlap
        };
    }

    window.SimpAICanvasWorkbenchNodeLayout = Object.assign({}, window.SimpAICanvasWorkbenchNodeLayout || {}, {
        createCanvasNodeLayoutController
    });
})();
