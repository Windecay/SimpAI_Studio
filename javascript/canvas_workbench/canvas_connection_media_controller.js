(function () {
    'use strict';

    function createCanvasConnectionMediaController(context) {
        const scope = context?.connectionMediaSource || context || {};
        const slotSource = scope.slotSource || {};
        const batchSource = scope.batchSource || {};
        const resultSource = scope.resultSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getUploadSlotMediaKind = (slotKey) => String(call(
            slotSource,
            'getUploadSlotMediaKind',
            'image',
            slotKey
        ) || 'image').toLowerCase();
        const batchAnyCanConnectToSlot = (node, slotKey) => !!call(
            batchSource,
            'batchAnyCanConnectToSlot',
            false,
            node,
            slotKey
        );
        const getSelectedResultAsset = (node) => call(
            resultSource,
            'getSelectedResultAsset',
            node?.asset || null,
            node
        );

        function canNodeConnectToUploadSlot(node, slotKey) {
            const kind = getUploadSlotMediaKind(slotKey);
            if (node?.type === 'batch_any') return batchAnyCanConnectToSlot(node, slotKey);
            const asset = node?.type === 'result' ? getSelectedResultAsset(node) : node?.asset;
            const mime = String(asset?.mime || '').toLowerCase();
            if (kind === 'audio') return node?.type === 'audio' || (node?.type === 'result' && mime.startsWith('audio/'));
            if (kind === 'video') {
                if (node?.type === 'camera_motion') {
                    return ['scene_reference_video', 'scene_reference_video2'].includes(String(slotKey || '').toLowerCase());
                }
                if (node?.type === 'sam3_video_mask') {
                    const key = String(slotKey || '').toLowerCase();
                    return key === 'sam3_mask_video' || (key.includes('mask') && key.includes('video'));
                }
                return node?.type === 'video' || (node?.type === 'result' && mime.startsWith('video/'));
            }
            return node?.type === 'image'
                || node?.type === 'mask'
                || node?.type === 'pose_studio'
                || node?.type === 'gaussian_studio'
                || node?.type === 'liveportrait_expression'
                || (node?.type === 'result' && (!mime || mime.startsWith('image/')));
        }

        function presetEngineType(presetNode) {
            return String(presetNode?.runtime?.engine_type || presetNode?.schema?.engine_type || '').toLowerCase();
        }

        function isPresetNode(node) {
            return !!node && ['preset', 'classic'].includes(node.type);
        }

        function canPresetOutputConnectToUploadSlot(presetNode, slotKey) {
            if (!isPresetNode(presetNode)) return false;
            const slotKind = getUploadSlotMediaKind(slotKey);
            const engineType = presetEngineType(presetNode);
            if (slotKind === 'audio') return engineType.includes('audio');
            if (slotKind === 'video') return engineType.includes('video');
            return !engineType.includes('audio') && !engineType.includes('video');
        }

        function presetOutputMediaKind(presetNode) {
            if (!isPresetNode(presetNode)) return '';
            const engineType = presetEngineType(presetNode);
            if (engineType.includes('audio')) return 'audio';
            if (engineType.includes('video')) return 'video';
            return 'image';
        }

        function isImageProducingPresetNode(node) {
            return presetOutputMediaKind(node) === 'image';
        }

        return {
            canNodeConnectToUploadSlot,
            canPresetOutputConnectToUploadSlot,
            presetOutputMediaKind,
            isImageProducingPresetNode
        };
    }

    window.SimpAICanvasWorkbenchConnectionMedia = Object.assign(
        {},
        window.SimpAICanvasWorkbenchConnectionMedia || {},
        { createCanvasConnectionMediaController }
    );
})();
