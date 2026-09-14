(function () {
    'use strict';

    function createCanvasAgentTargetController(source) {
        const scope = source?.targetSource || source || {};
        const languageSource = scope.languageSource || {};
        const nodeSource = scope.nodeSource || {};
        const selectionSource = scope.selectionSource || {};
        const filterSource = scope.filterSource || {};
        const assetSource = scope.assetSource || {};
        const imageSource = scope.imageSource || {};
        const mediaViewerSource = scope.mediaViewerSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const nodeCall = (name, fallback, ...args) => call(nodeSource, name, fallback, ...args);
        const selectionCall = (name, fallback, ...args) => call(selectionSource, name, fallback, ...args);
        const filterCall = (name, fallback, ...args) => call(filterSource, name, fallback, ...args);
        const assetCall = (name, fallback, ...args) => call(assetSource, name, fallback, ...args);
        const imageCall = (name, fallback, ...args) => call(imageSource, name, fallback, ...args);
        const mediaViewerCall = (name, fallback, ...args) => call(mediaViewerSource, name, fallback, ...args);
        const t = languageSource.t || ((en, cn) => cn || en);

        function getNode(id) {
            return nodeCall('getNode', null, id);
        }

        function nodeHasViewableImage(node) {
            const viewer = mediaViewerCall('getMediaViewerContext', null) || {
                getSelectedResultAsset: (...args) => assetCall('getSelectedResultAsset', null, ...args),
                safeAssetDisplaySrc: (...args) => assetCall('safeAssetDisplaySrc', '', ...args)
            };
            return !!mediaViewerCall('mediaViewerNodeHasViewableImage', false, node, viewer);
        }

        function isCanvasAgentImageTarget(node) {
            if (!node) return false;
            if (node.type === 'image') return nodeHasViewableImage(node);
            if (node.type === 'pose_studio') return !!imageCall('isPoseStudioImageSource', false, node);
            if (node.type === 'gaussian_studio') return !!imageCall('isGaussianStudioImageSource', false, node);
            if (node.type === 'liveportrait_expression') return !!imageCall('isLivePortraitExpressionImageSource', false, node);
            if (node.type === 'result') {
                const asset = assetCall('getSelectedResultAsset', null, node);
                return !!asset && assetCall('assetMediaKind', '', asset) === 'image' && nodeHasViewableImage({ type: 'image', asset });
            }
            return false;
        }

        function isCanvasAgentVideoTarget(node) {
            if (!node) return false;
            if (node.type === 'video') return !!node.asset;
            if (node.type === 'result') {
                const asset = assetCall('getSelectedResultAsset', null, node);
                return !!asset && assetCall('assetMediaKind', '', asset) === 'video';
            }
            return false;
        }

        function isCanvasAgentAudioTarget(node) {
            if (!node) return false;
            if (node.type === 'audio') return !!node.asset;
            if (node.type === 'result') {
                const asset = assetCall('getSelectedResultAsset', null, node);
                return !!asset && assetCall('assetMediaKind', '', asset) === 'audio';
            }
            return false;
        }

        function isCanvasAgentGeneratorTarget(node) {
            return !!node && ['preset', 'classic'].includes(node.type);
        }

        function isCanvasAgentTextTarget(node) {
            return !!node && node.type === 'text';
        }

        function getCanvasAgentReferenceAsset(node) {
            if (!node || node.type === 'text') return null;
            return node.type === 'result'
                ? assetCall('getSelectedResultAsset', null, node)
                : node.asset;
        }

        function getCanvasAgentReferenceKind(node) {
            if (!node) return '';
            if (node.type === 'text') return 'text';
            const asset = getCanvasAgentReferenceAsset(node);
            return asset ? assetCall('assetMediaKind', '', asset) : '';
        }

        function isCanvasAgentMediaReferenceTarget(node) {
            if (!node || filterCall('isNodeIgnored', false, node)) return false;
            if (node.type === 'text') return true;
            if (node.type === 'image') return nodeHasViewableImage(node);
            if (['video', 'audio'].includes(node.type)) return !!node.asset;
            if (node.type === 'result') return !!assetCall('getSelectedResultAsset', null, node);
            return false;
        }

        function getCanvasAgentTargetMediaKind(node) {
            if (!node) return '';
            if (isCanvasAgentImageTarget(node)) return 'image';
            if (isCanvasAgentVideoTarget(node)) return 'video';
            if (isCanvasAgentAudioTarget(node)) return 'audio';
            if (isCanvasAgentTextTarget(node)) return 'text';
            if (isCanvasAgentGeneratorTarget(node)) return 'generator';
            return getCanvasAgentReferenceKind(node);
        }

        function isCanvasAgentSupportedTarget(node) {
            return !node
                || isCanvasAgentImageTarget(node)
                || isCanvasAgentGeneratorTarget(node)
                || isCanvasAgentTextTarget(node)
                || isCanvasAgentMediaReferenceTarget(node);
        }

        function getCanvasAgentTargetNode() {
            const ids = selectionCall('getSelectedNodeIdList', []).filter(id => !!getNode(id));
            if (ids.length === 1) {
                const node = getNode(ids[0]);
                return isCanvasAgentSupportedTarget(node) ? node : null;
            }
            if (ids.length > 1) return null;
            const selectedNodeId = selectionCall('getSelectedNodeId', '');
            if (selectedNodeId && selectionCall('hasSelectedNode', false, selectedNodeId) && getNode(selectedNodeId)) {
                const node = getNode(selectedNodeId);
                return isCanvasAgentSupportedTarget(node) ? node : null;
            }
            return null;
        }

        function canvasAgentTargetLabel(node) {
            if (!node) return t('Canvas Agent', '画布 Agent');
            const type = String(node.type || '').toUpperCase();
            return `${t('Agent on', 'Agent 作用于')} ${type} · ${node.title || node.id}`;
        }

        function canvasAgentShortNodeLabel(node) {
            if (!node) return '';
            return `${String(node.type || '').toUpperCase()} · ${node.title || node.id}`;
        }

        return {
            getCanvasAgentTargetNode,
            canvasAgentTargetLabel,
            canvasAgentShortNodeLabel,
            getCanvasAgentReferenceAsset,
            getCanvasAgentReferenceKind,
            isCanvasAgentImageTarget,
            isCanvasAgentVideoTarget,
            isCanvasAgentAudioTarget,
            getCanvasAgentTargetMediaKind,
            isCanvasAgentGeneratorTarget,
            isCanvasAgentTextTarget,
            isCanvasAgentMediaReferenceTarget,
            isCanvasAgentSupportedTarget
        };
    }

    window.SimpAICanvasWorkbenchCanvasAgentTarget = Object.assign(
        {},
        window.SimpAICanvasWorkbenchCanvasAgentTarget || {},
        { createCanvasAgentTargetController }
    );
})();
