(function () {
    'use strict';

    function createCanvasTextNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const nowIso = typeof scope.nowIso === 'function' ? scope.nowIso : () => new Date().toISOString();
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const defaultNodeSize = typeof scope.defaultNodeSize === 'function'
            ? scope.defaultNodeSize
            : () => ({ w: 340, h: 360 });
        const tagCartLabel = typeof scope.tagCartLabel === 'function'
            ? scope.tagCartLabel
            : () => t('Tag Cart', '标签选择器');

        function buildTextNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            return {
                id: uid('text'),
                type: 'text',
                x: position.x,
                y: position.y,
                w: 300,
                h: 220,
                title: opts.title || 'Text',
                text: {
                    value: opts.value || '',
                    updated_at: nowIso()
                },
                source: { kind: opts.source_kind || 'manual_text' }
            };
        }

        function buildTextMergeNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            const size = defaultNodeSize('text_merge') || { w: 340, h: 360 };
            return {
                id: uid('text_merge'),
                type: 'text_merge',
                x: position.x,
                y: position.y,
                w: Number(opts.w || size.w || 340),
                h: Number(opts.h || size.h || 360),
                title: opts.title || t('Multi-text Merge', '多文本合并'),
                input_slots: Array.isArray(opts.input_slots) && opts.input_slots.length ? opts.input_slots.slice() : ['input_1', 'input_2'],
                text_inputs: Object.assign({}, opts.text_inputs || {}),
                params: Object.assign({ separator: '' }, opts.params || {}),
                source: { kind: 'text_merge' }
            };
        }

        function buildTranslationNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            return {
                id: uid('translation'),
                type: 'translation',
                x: position.x,
                y: position.y,
                w: 320,
                h: 300,
                title: opts.title || 'Translation',
                text_input: opts.text_input || null,
                input_text: opts.input_text || '',
                params: Object.assign({
                    direction: 'toggle',
                    method: ''
                }, opts.params || {}),
                text: {
                    value: opts.value || '',
                    updated_at: nowIso()
                },
                status: {
                    state: 'idle',
                    message: 'Connect text, then translate.'
                },
                source: { kind: 'translation', module: 'enhanced.translator' }
            };
        }

        function buildTagCartNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            const size = defaultNodeSize('tag_cart') || { w: 340, h: 360 };
            return {
                id: uid('tag_cart'),
                type: 'tag_cart',
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: opts.title || tagCartLabel(),
                text_input: opts.text_input || null,
                params: Object.assign({
                    target_kind: 'positive',
                    action: 'append'
                }, opts.params || {}),
                text: {
                    value: opts.value || '',
                    updated_at: nowIso()
                },
                source: { kind: 'tag_cart', module: 'javascript.tag_cart' }
            };
        }

        function buildWd14Node(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            return {
                id: uid('wd14'),
                type: 'wd14',
                x: position.x,
                y: position.y,
                w: 320,
                h: 360,
                title: opts.title || 'WD14 Tagger',
                input_node_id: opts.input_node_id || null,
                params: Object.assign({
                    threshold: 0.35,
                    character_threshold: 0.85,
                    exclude_tags: ''
                }, opts.params || {}),
                text: {
                    value: opts.value || '',
                    updated_at: nowIso()
                },
                status: {
                    state: 'idle',
                    message: 'Connect an image or result node, then tag it.'
                },
                source: { kind: 'wd14_tagger', module: 'extras.wd14tagger' }
            };
        }

        return {
            buildTextNode,
            buildTextMergeNode,
            buildTranslationNode,
            buildTagCartNode,
            buildWd14Node
        };
    }

    window.SimpAICanvasWorkbenchTextNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchTextNodeFactory || {}, {
        createCanvasTextNodeFactoryController
    });
})();
