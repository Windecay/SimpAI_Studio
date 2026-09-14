(function () {
    'use strict';

    function createCanvasInputNodeFactoryController(context) {
        const scope = context?.inputNodeFactorySource || context || {};
        const identitySource = scope.identitySource || {};
        const languageSource = scope.languageSource || {};
        const layoutSource = scope.layoutSource || {};
        const uid = typeof identitySource.uid === 'function' ? identitySource.uid : (prefix) => `${prefix}-node`;
        const t = typeof languageSource.t === 'function' ? languageSource.t : ((en, cn) => cn || en);
        const defaultNodeSize = typeof layoutSource.defaultNodeSize === 'function'
            ? layoutSource.defaultNodeSize
            : (type) => type === 'image' ? { w: 264, h: 300 } : { w: 220, h: 250 };

        function buildEmptyImageNodeForInput(targetNode, slotLabel, base, size) {
            const position = base || { x: 0, y: 0 };
            const nodeSize = size || { w: 264, h: 300 };
            return {
                id: uid('img'),
                type: 'image',
                x: position.x,
                y: position.y,
                w: nodeSize.w,
                h: nodeSize.h,
                title: slotLabel ? `${slotLabel} Image` : 'Input Image',
                display_mode: 'frameless',
                asset: null,
                source: {
                    kind: 'manual_input_placeholder',
                    target_node_id: targetNode?.id || '',
                    target_slot: slotLabel || ''
                }
            };
        }

        function buildEmptyMediaNodeForInput(targetNode, mediaKind, slotLabel, base, size) {
            if (!['video', 'audio'].includes(mediaKind)) return null;
            const position = base || { x: 0, y: 0 };
            const nodeSize = size || defaultNodeSize(mediaKind) || { w: 220, h: 250 };
            return {
                id: uid(mediaKind === 'video' ? 'vid' : 'aud'),
                type: mediaKind,
                x: position.x,
                y: position.y,
                w: nodeSize.w,
                h: nodeSize.h,
                title: slotLabel || t(mediaKind === 'video' ? 'Input Video' : 'Input Audio', mediaKind === 'video' ? '输入视频' : '输入音频'),
                asset: null,
                source: {
                    kind: 'manual_input_placeholder',
                    target_node_id: targetNode?.id || '',
                    target_slot: slotLabel || ''
                }
            };
        }

        return { buildEmptyImageNodeForInput, buildEmptyMediaNodeForInput };
    }

    window.SimpAICanvasWorkbenchInputNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchInputNodeFactory || {}, {
        createCanvasInputNodeFactoryController
    });
})();
