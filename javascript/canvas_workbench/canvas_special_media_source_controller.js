(function () {
    'use strict';

    function createCanvasSpecialMediaSourceController(context) {
        const scope = context?.specialMediaSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const resultSource = scope.resultSource || {};
        const assetSource = scope.assetSource || {};
        const presetSource = scope.presetSource || {};
        const specialNodeSource = scope.specialNodeSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const isNodeIgnored = (node) => !!call(nodeSource, 'isNodeIgnored', false, node);
        const getSelectedResultAsset = (node) => call(
            resultSource,
            'getSelectedResultAsset',
            node?.asset || null,
            node
        );
        const assetMediaKind = (asset) => call(assetSource, 'assetMediaKind', 'image', asset);
        const presetOutputMediaKind = (node) => call(presetSource, 'presetOutputMediaKind', '', node);
        const isPoseStudioSource = (node) => !!call(specialNodeSource, 'isPoseStudioSource', false, node);
        const isGaussianStudioSource = (node) => !!call(specialNodeSource, 'isGaussianStudioSource', false, node);
        const isLivePortraitExpressionSource = (node) => !!call(
            specialNodeSource,
            'isLivePortraitExpressionSource',
            false,
            node
        );

        function presetOutputKind(node) {
            const kind = String(presetOutputMediaKind(node) || '').toLowerCase();
            return ['image', 'video', 'audio'].includes(kind) ? kind : '';
        }

        function resultExpectedMediaKind(node) {
            if (!node || node.type !== 'result') return '';
            const asset = getSelectedResultAsset(node);
            if (asset) return assetMediaKind(asset);
            const sourceKind = String(node.source?.kind || '').toLowerCase();
            const explicit = String(node.source?.expected_media_kind || node.producer?.expected_media_kind || '').toLowerCase();
            if (['image', 'video', 'audio'].includes(explicit)) return explicit;
            if (node.producer?.qwen_tts_node_id) return 'audio';
            if (node.producer?.timeline_node_id) return 'video';
            const project = getProject();
            const presetId = node.producer?.preset_node_id
                || (Array.isArray(project.edges)
                    ? project.edges.find(edge => edge.type === 'generate' && edge.to === node.id)?.from
                    : '')
                || '';
            const preset = getNode(presetId);
            const presetKind = presetOutputKind(preset);
            if (presetKind) return presetKind;
            if (sourceKind === 'manual_output' || sourceKind === 'auto_bridge') return 'image';
            return '';
        }

        function isResultImageReferenceSource(node) {
            if (!node || node.type !== 'result') return false;
            const asset = getSelectedResultAsset(node);
            if (asset) return assetMediaKind(asset) === 'image';
            const expectedKind = resultExpectedMediaKind(node);
            if (expectedKind) return expectedKind === 'image';
            return !(node.producer?.qwen_tts_node_id || node.producer?.timeline_node_id);
        }

        function isImageAssetResultSource(node) {
            if (!node || node.type !== 'result') return false;
            const asset = getSelectedResultAsset(node);
            return !!asset && assetMediaKind(asset) === 'image';
        }

        function isPoseStudioImageSource(node) {
            if (!node || isNodeIgnored(node)) return false;
            if (node.type === 'image') return true;
            if (node.type === 'pose_studio') return isPoseStudioSource(node);
            if (node.type === 'result') return isResultImageReferenceSource(node);
            return false;
        }

        function isGaussianStudioImageSource(node) {
            if (!node || isNodeIgnored(node)) return false;
            if (node.type === 'image') return true;
            if (node.type === 'pose_studio') return isPoseStudioImageSource(node);
            if (node.type === 'gaussian_studio') return isGaussianStudioSource(node);
            if (node.type === 'liveportrait_expression') return isLivePortraitExpressionSource(node);
            if (node.type === 'result') return isImageAssetResultSource(node);
            return false;
        }

        function isLivePortraitExpressionImageSource(node) {
            if (!node || isNodeIgnored(node)) return false;
            if (node.type === 'image') return true;
            if (node.type === 'pose_studio') return isPoseStudioImageSource(node);
            if (node.type === 'gaussian_studio') return isGaussianStudioImageSource(node);
            if (node.type === 'liveportrait_expression') return isLivePortraitExpressionSource(node);
            if (node.type === 'result') return isImageAssetResultSource(node);
            return false;
        }

        function isImageCompareSource(node) {
            if (!node || isNodeIgnored(node)) return false;
            if (node.type === 'image') return true;
            if (node.type === 'pose_studio') return isPoseStudioImageSource(node);
            if (node.type === 'gaussian_studio') return isGaussianStudioImageSource(node);
            if (node.type === 'liveportrait_expression') return isLivePortraitExpressionImageSource(node);
            if (node.type === 'result') return isImageAssetResultSource(node);
            return false;
        }

        return {
            resultExpectedMediaKind,
            isResultImageReferenceSource,
            isPoseStudioImageSource,
            isGaussianStudioImageSource,
            isLivePortraitExpressionImageSource,
            isImageCompareSource
        };
    }

    window.SimpAICanvasWorkbenchSpecialMediaSource = Object.assign(
        {},
        window.SimpAICanvasWorkbenchSpecialMediaSource || {},
        { createCanvasSpecialMediaSourceController }
    );
})();
