(function () {
    'use strict';

    function createCanvasAgentTargetController(source) {
        const scope = source || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);

        function getNode(id) {
            return call('getNode', null, id);
        }

        function nodeHasViewableImage(node) {
            const viewer = call('getMediaViewerContext', null) || {
                getSelectedResultAsset: typeof scope.getSelectedResultAsset === 'function'
                    ? scope.getSelectedResultAsset
                    : () => null,
                safeAssetDisplaySrc: typeof scope.safeAssetDisplaySrc === 'function'
                    ? scope.safeAssetDisplaySrc
                    : () => ''
            };
            return !!call('mediaViewerNodeHasViewableImage', false, node, viewer);
        }

        function isCanvasAgentImageTarget(node) {
            if (!node) return false;
            if (node.type === 'image') return nodeHasViewableImage(node);
            if (node.type === 'pose_studio') return !!call('isPoseStudioImageSource', false, node);
            if (node.type === 'gaussian_studio') return !!call('isGaussianStudioImageSource', false, node);
            if (node.type === 'liveportrait_expression') return !!call('isLivePortraitExpressionImageSource', false, node);
            if (node.type === 'result') {
                const asset = call('getSelectedResultAsset', null, node);
                return !!asset && call('assetMediaKind', '', asset) === 'image' && nodeHasViewableImage({ type: 'image', asset });
            }
            return false;
        }

        function isCanvasAgentVideoTarget(node) {
            if (!node) return false;
            if (node.type === 'video') return !!node.asset;
            if (node.type === 'result') {
                const asset = call('getSelectedResultAsset', null, node);
                return !!asset && call('assetMediaKind', '', asset) === 'video';
            }
            return false;
        }

        function isCanvasAgentAudioTarget(node) {
            if (!node) return false;
            if (node.type === 'audio') return !!node.asset;
            if (node.type === 'result') {
                const asset = call('getSelectedResultAsset', null, node);
                return !!asset && call('assetMediaKind', '', asset) === 'audio';
            }
            return false;
        }

        function isCanvasAgentGeneratorTarget(node) {
            return !!node && ['preset', 'classic'].includes(node.type);
        }

        function isCanvasAgentTextTarget(node) {
            return !!node && node.type === 'text';
        }

        function isCanvasAgentMediaReferenceTarget(node) {
            if (!node || call('isNodeIgnored', false, node)) return false;
            if (node.type === 'text') return true;
            if (node.type === 'image') return nodeHasViewableImage(node);
            if (['video', 'audio'].includes(node.type)) return !!node.asset;
            if (node.type === 'result') return !!call('getSelectedResultAsset', null, node);
            return false;
        }

        function getCanvasAgentTargetMediaKind(node) {
            if (!node) return '';
            if (isCanvasAgentImageTarget(node)) return 'image';
            if (isCanvasAgentVideoTarget(node)) return 'video';
            if (isCanvasAgentAudioTarget(node)) return 'audio';
            if (isCanvasAgentTextTarget(node)) return 'text';
            if (isCanvasAgentGeneratorTarget(node)) return 'generator';
            return call('getCanvasAgentReferenceKind', '', node);
        }

        function isCanvasAgentSupportedTarget(node) {
            return !node
                || isCanvasAgentImageTarget(node)
                || isCanvasAgentGeneratorTarget(node)
                || isCanvasAgentTextTarget(node)
                || isCanvasAgentMediaReferenceTarget(node);
        }

        function getCanvasAgentTargetNode() {
            const ids = call('getSelectedNodeIdList', []).filter(id => !!getNode(id));
            if (ids.length === 1) {
                const node = getNode(ids[0]);
                return isCanvasAgentSupportedTarget(node) ? node : null;
            }
            if (ids.length > 1) return null;
            const selectedNodeId = call('getSelectedNodeId', '');
            if (selectedNodeId && call('hasSelectedNode', false, selectedNodeId) && getNode(selectedNodeId)) {
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

        return {
            getCanvasAgentTargetNode,
            canvasAgentTargetLabel,
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
