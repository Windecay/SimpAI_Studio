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
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            });

        function cloneValue(value, fallback) {
            return cloneRunValue(value, fallback);
        }

        function mergeObject(previous, next) {
            return Object.assign(
                {},
                previous && typeof previous === 'object' && !Array.isArray(previous) ? cloneValue(previous, {}) : {},
                next && typeof next === 'object' && !Array.isArray(next) ? cloneValue(next, {}) : {}
            );
        }

        function objectOrEmpty(value) {
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        }

        function hasOwn(target, key) {
            return !!target && Object.prototype.hasOwnProperty.call(target, key);
        }

        function buildTranslationStatePatch(node, options) {
            const config = options || {};
            const defaults = {
                text_input: null,
                input_text: '',
                params: {
                    direction: 'toggle',
                    method: ''
                },
                text: {
                    value: '',
                    updated_at: ''
                },
                status: {
                    state: 'idle',
                    message: 'Connect text, then translate.'
                },
                source: {
                    kind: 'translation',
                    module: 'enhanced.translator'
                }
            };
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node || {}, {}),
                cloneValue(statePatch, {})
            );
            const params = mergeObject(
                mergeObject(
                    mergeObject(defaults.params, initialState.params),
                    node?.params
                ),
                statePatch.params
            );
            const text = mergeObject(
                mergeObject(
                    mergeObject(defaults.text, initialState.text),
                    node?.text
                ),
                statePatch.text
            );
            const source = mergeObject(
                mergeObject(
                    mergeObject(defaults.source, initialState.source),
                    node?.source
                ),
                statePatch.source
            );
            let status = hasOwn(config, 'status')
                ? cloneValue(config.status, {})
                : mergeObject(
                    mergeObject(
                        mergeObject(defaults.status, initialState.status),
                        node?.status
                    ),
                    statePatch.status
                );
            if (hasOwn(config, 'statusPatch')) status = mergeObject(status, config.statusPatch);
            const patch = {
                text_input: hasOwn(config, 'textInputId') ? config.textInputId ?? null : state.text_input ?? null,
                input_text: hasOwn(config, 'inputText') ? config.inputText ?? '' : state.input_text ?? '',
                params: mergeObject(params, config.paramsPatch),
                text: mergeObject(text, config.textPatch),
                status,
                source: mergeObject(source, config.sourcePatch)
            };
            const hasCache = hasOwn(node, 'translation_cache')
                || hasOwn(initialState, 'translation_cache')
                || hasOwn(statePatch, 'translation_cache')
                || hasOwn(config, 'translationCachePatch')
                || hasOwn(config, 'translationCache');
            if (hasCache) {
                let cache = mergeObject(
                    mergeObject(initialState.translation_cache, node?.translation_cache),
                    statePatch.translation_cache
                );
                if (hasOwn(config, 'translationCache')) cache = cloneValue(config.translationCache, null);
                else cache = mergeObject(cache, config.translationCachePatch);
                patch.translation_cache = cache;
            }
            return patch;
        }

        function buildTagCartStatePatch(node, options) {
            const config = options || {};
            const defaults = {
                text_input: null,
                params: {
                    target_kind: 'positive',
                    action: 'append'
                },
                text: {
                    value: '',
                    updated_at: ''
                },
                source: {
                    kind: 'tag_cart',
                    module: 'javascript.tag_cart'
                }
            };
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node || {}, {}),
                cloneValue(statePatch, {})
            );
            const params = mergeObject(
                mergeObject(
                    mergeObject(defaults.params, initialState.params),
                    node?.params
                ),
                statePatch.params
            );
            const text = mergeObject(
                mergeObject(
                    mergeObject(defaults.text, initialState.text),
                    node?.text
                ),
                statePatch.text
            );
            const source = mergeObject(
                mergeObject(
                    mergeObject(defaults.source, initialState.source),
                    node?.source
                ),
                statePatch.source
            );
            return {
                text_input: hasOwn(config, 'textInputId') ? config.textInputId ?? null : state.text_input ?? null,
                params: mergeObject(params, config.paramsPatch),
                text: mergeObject(text, config.textPatch),
                source: mergeObject(source, config.sourcePatch)
            };
        }

        function buildTagCartSizePatch(node) {
            if (!node || node.type !== 'tag_cart') return {};
            const size = defaultNodeSize('tag_cart') || { w: 340, h: 360 };
            const width = Number(size.w || 0);
            const height = Number(size.h || 0);
            const patch = {};
            if (Number(node.w) < width) patch.w = width;
            if (Number(node.h) < height) patch.h = height;
            return patch;
        }

        function buildTextMergeStatePatch(node, options) {
            const config = options || {};
            const defaults = {
                input_slots: ['input_1', 'input_2'],
                text_inputs: {},
                params: { separator: '' },
                source: { kind: 'text_merge' }
            };
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node || {}, {}),
                cloneValue(statePatch, {})
            );
            const normalizeSlots = (value) => {
                const slots = Array.isArray(value)
                    ? Array.from(new Set(value.map(slot => String(slot || '').trim()).filter(Boolean)))
                    : [];
                return slots.length ? slots : ['input_1', 'input_2'];
            };
            const inputSlots = hasOwn(config, 'inputSlots')
                ? normalizeSlots(config.inputSlots)
                : normalizeSlots(state.input_slots);
            const textInputs = hasOwn(config, 'textInputs')
                ? (objectOrEmpty(config.textInputs) && cloneValue(config.textInputs, {}))
                : mergeObject(
                    mergeObject(
                        mergeObject(defaults.text_inputs, initialState.text_inputs),
                        node?.text_inputs
                    ),
                    statePatch.text_inputs
                );
            if (config.textInputsPatch && typeof config.textInputsPatch === 'object' && !Array.isArray(config.textInputsPatch)) {
                Object.assign(textInputs, cloneValue(config.textInputsPatch, {}));
            }
            (Array.isArray(config.deleteTextInputKeys) ? config.deleteTextInputKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete textInputs[name];
            });
            const params = hasOwn(config, 'params')
                ? (objectOrEmpty(config.params) && cloneValue(config.params, {}))
                : mergeObject(
                    mergeObject(
                        mergeObject(defaults.params, initialState.params),
                        node?.params
                    ),
                    statePatch.params
                );
            if (config.paramsPatch && typeof config.paramsPatch === 'object' && !Array.isArray(config.paramsPatch)) {
                Object.assign(params, cloneValue(config.paramsPatch, {}));
            }
            (Array.isArray(config.deleteParamKeys) ? config.deleteParamKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete params[name];
            });
            const source = mergeObject(
                mergeObject(
                    mergeObject(defaults.source, initialState.source),
                    node?.source
                ),
                statePatch.source
            );
            if (config.sourcePatch && typeof config.sourcePatch === 'object' && !Array.isArray(config.sourcePatch)) {
                Object.assign(source, cloneValue(config.sourcePatch, {}));
            }
            const patch = {
                input_slots: inputSlots,
                text_inputs: cloneValue(textInputs, {}),
                params: cloneValue(params, {}),
                source: cloneValue(source, {})
            };
            if (hasOwn(config, 'height') || hasOwn(config, 'h')) {
                const height = Number(hasOwn(config, 'height') ? config.height : config.h);
                if (Number.isFinite(height)) patch.h = height;
            }
            return patch;
        }

        function buildWd14StatePatch(node, options) {
            const config = options || {};
            const defaults = {
                input_node_id: null,
                params: {
                    threshold: 0.35,
                    character_threshold: 0.85,
                    exclude_tags: ''
                },
                text: {
                    value: '',
                    updated_at: ''
                },
                status: {
                    state: 'idle',
                    message: 'Connect an image or result node, then tag it.'
                },
                source: {
                    kind: 'wd14_tagger',
                    module: 'extras.wd14tagger'
                }
            };
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node || {}, {}),
                cloneValue(statePatch, {})
            );
            const params = mergeObject(
                mergeObject(
                    mergeObject(defaults.params, initialState.params),
                    node?.params
                ),
                statePatch.params
            );
            const text = mergeObject(
                mergeObject(
                    mergeObject(defaults.text, initialState.text),
                    node?.text
                ),
                statePatch.text
            );
            const source = mergeObject(
                mergeObject(
                    mergeObject(defaults.source, initialState.source),
                    node?.source
                ),
                statePatch.source
            );
            let status = hasOwn(config, 'status')
                ? cloneValue(config.status, {})
                : mergeObject(
                    mergeObject(
                        mergeObject(defaults.status, initialState.status),
                        node?.status
                    ),
                    statePatch.status
                );
            if (hasOwn(config, 'statusPatch')) status = mergeObject(status, config.statusPatch);
            const patch = {
                input_node_id: hasOwn(config, 'inputNodeId') ? config.inputNodeId ?? null : state.input_node_id ?? null,
                params: mergeObject(params, config.paramsPatch),
                text: mergeObject(text, config.textPatch),
                status,
                source: mergeObject(source, config.sourcePatch)
            };
            const hasLastResponse = hasOwn(node, 'last_response')
                || hasOwn(initialState, 'last_response')
                || hasOwn(statePatch, 'last_response')
                || hasOwn(config, 'lastResponse')
                || hasOwn(config, 'lastResponsePatch');
            if (hasLastResponse) {
                let lastResponse = cloneValue(initialState.last_response, null);
                if (hasOwn(node, 'last_response')) lastResponse = cloneValue(node.last_response, null);
                if (hasOwn(statePatch, 'last_response')) lastResponse = cloneValue(statePatch.last_response, null);
                if (hasOwn(config, 'lastResponse')) lastResponse = cloneValue(config.lastResponse, null);
                else if (hasOwn(config, 'lastResponsePatch')) lastResponse = mergeObject(lastResponse, config.lastResponsePatch);
                patch.last_response = lastResponse;
            }
            return patch;
        }

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

        function buildTextNodeStatePatch(node, options) {
            const config = options || {};
            const defaults = {
                text: {
                    value: '',
                    updated_at: ''
                },
                source: {
                    kind: 'manual_text'
                }
            };
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
            const state = Object.assign(
                {},
                cloneValue(defaults, {}),
                cloneValue(initialState, {}),
                cloneValue(node || {}, {}),
                cloneValue(statePatch, {})
            );
            const text = hasOwn(config, 'text')
                ? (objectOrEmpty(config.text) && cloneValue(config.text, {}))
                : mergeObject(
                    mergeObject(
                        mergeObject(defaults.text, initialState.text),
                        node?.text
                    ),
                    statePatch.text
                );
            if (config.textPatch && typeof config.textPatch === 'object' && !Array.isArray(config.textPatch)) {
                Object.assign(text, cloneValue(config.textPatch, {}));
            }
            const source = mergeObject(
                mergeObject(
                    mergeObject(defaults.source, initialState.source),
                    node?.source
                ),
                statePatch.source
            );
            if (config.sourcePatch && typeof config.sourcePatch === 'object' && !Array.isArray(config.sourcePatch)) {
                Object.assign(source, cloneValue(config.sourcePatch, {}));
            }
            const patch = {
                text: cloneValue(text, {}),
                source: cloneValue(source, {})
            };
            const hasTextInput = hasOwn(node, 'text_input')
                || hasOwn(initialState, 'text_input')
                || hasOwn(statePatch, 'text_input')
                || hasOwn(config, 'textInputId');
            if (hasTextInput) {
                patch.text_input = hasOwn(config, 'textInputId') ? config.textInputId ?? null : state.text_input ?? null;
            }
            return patch;
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
            const node = {
                id: uid('translation'),
                type: 'translation',
                x: position.x,
                y: position.y,
                w: 320,
                h: 300,
                title: opts.title || 'Translation'
            };
            return Object.assign(node, buildTranslationStatePatch(node, {
                textInputId: opts.text_input || null,
                inputText: opts.input_text || '',
                paramsPatch: opts.params,
                textPatch: {
                    value: opts.value || '',
                    updated_at: nowIso()
                }
            }));
        }

        function buildTranslationStatus(state, message) {
            return { state, message };
        }

        function buildWd14Status(state, message) {
            return { state, message };
        }

        function buildTagCartNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            const size = defaultNodeSize('tag_cart') || { w: 340, h: 360 };
            const node = {
                id: uid('tag_cart'),
                type: 'tag_cart',
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: opts.title || tagCartLabel()
            };
            return Object.assign(node, buildTagCartStatePatch(node, {
                textInputId: opts.text_input || null,
                paramsPatch: opts.params,
                textPatch: {
                    value: opts.value || '',
                    updated_at: nowIso()
                }
            }));
        }

        function buildWd14Node(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            const node = {
                id: uid('wd14'),
                type: 'wd14',
                x: position.x,
                y: position.y,
                w: 320,
                h: 360,
                title: opts.title || 'WD14 Tagger'
            };
            return Object.assign(node, buildWd14StatePatch(node, {
                inputNodeId: opts.input_node_id || null,
                paramsPatch: opts.params,
                textPatch: {
                    value: opts.value || '',
                    updated_at: nowIso()
                }
            }));
        }

        return {
            buildTextNode,
            buildTextNodeStatePatch,
            buildTextMergeNode,
            buildTranslationNode,
            buildTranslationStatus,
            buildTranslationStatePatch,
            buildTextMergeStatePatch,
            buildWd14Status,
            buildWd14StatePatch,
            buildTagCartNode,
            buildTagCartStatePatch,
            buildTagCartSizePatch,
            buildWd14Node
        };
    }

    window.SimpAICanvasWorkbenchTextNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchTextNodeFactory || {}, {
        createCanvasTextNodeFactoryController
    });
})();
