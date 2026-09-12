(function () {
    'use strict';

    function createCanvasAuxNodeFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const nowIso = typeof scope.nowIso === 'function' ? scope.nowIso : () => new Date().toISOString();
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const defaultNodeSize = typeof scope.defaultNodeSize === 'function'
            ? scope.defaultNodeSize
            : () => ({ w: 340, h: 430 });
        const mediaBrowserLabel = typeof scope.mediaBrowserLabel === 'function'
            ? scope.mediaBrowserLabel
            : () => t('Media Browser', '媒体浏览器');
        const mediaBrowserInitialState = typeof scope.mediaBrowserInitialState === 'function'
            ? scope.mediaBrowserInitialState
            : world => ({ world: { x: Math.round(Number(world?.x || 0)), y: Math.round(Number(world?.y || 0)) } });
        const serializableMediaBrowserState = typeof scope.serializableMediaBrowserState === 'function'
            ? scope.serializableMediaBrowserState
            : state => state || {};
        const getViewportCenterWorld = typeof scope.getViewportCenterWorld === 'function'
            ? scope.getViewportCenterWorld
            : () => ({ x: 0, y: 0 });
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

        function objectOrEmpty(value) {
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        }

        function hasOwn(target, key) {
            return !!target && Object.prototype.hasOwnProperty.call(target, key);
        }

        function mergeObject(previous, next) {
            return Object.assign(
                {},
                previous && typeof previous === 'object' && !Array.isArray(previous) ? cloneValue(previous, {}) : {},
                next && typeof next === 'object' && !Array.isArray(next) ? cloneValue(next, {}) : {}
            );
        }

        function buildWildcardsHelperStatePatch(node, options) {
            const config = options || {};
            const defaults = {
                params: {
                    target: 'Array (batch)',
                    method: 'Random Select',
                    seed_mode: 'Fixed seed',
                    name: '',
                    count: 1,
                    start: 1,
                    group_size: 1
                },
                text: {
                    value: '',
                    updated_at: ''
                },
                source: {
                    kind: 'wildcards_helper',
                    module: 'enhanced.wildcards'
                }
            };
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
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
            const patch = {
                params: mergeObject(params, config.paramsPatch),
                text: mergeObject(text, config.textPatch),
                source: mergeObject(source, config.sourcePatch)
            };
            const hasCatalog = hasOwn(node, 'wildcards_catalog')
                || hasOwn(initialState, 'wildcards_catalog')
                || hasOwn(statePatch, 'wildcards_catalog')
                || hasOwn(config, 'wildcardsCatalog')
                || hasOwn(config, 'wildcardsCatalogPatch');
            if (hasCatalog) {
                let catalog = hasOwn(initialState, 'wildcards_catalog')
                    ? cloneValue(initialState.wildcards_catalog, null)
                    : null;
                if (hasOwn(node, 'wildcards_catalog')) catalog = cloneValue(node.wildcards_catalog, null);
                if (hasOwn(statePatch, 'wildcards_catalog')) catalog = cloneValue(statePatch.wildcards_catalog, null);
                if (hasOwn(config, 'wildcardsCatalog')) catalog = cloneValue(config.wildcardsCatalog, null);
                else if (hasOwn(config, 'wildcardsCatalogPatch')) catalog = mergeObject(catalog, config.wildcardsCatalogPatch);
                patch.wildcards_catalog = catalog;
            }
            return patch;
        }

        function buildMediaBrowserStatePatch(node, options) {
            const config = options || {};
            const initialState = objectOrEmpty(config.initialState);
            const statePatch = objectOrEmpty(config.statePatch);
            let state = mergeObject(
                mergeObject(
                    initialState,
                    node?.media_browser || node?.params
                ),
                statePatch
            );
            if (hasOwn(config, 'state')) state = cloneValue(config.state, {});
            const serializable = serializableMediaBrowserState(cloneValue(state, {}));
            return { media_browser: cloneValue(serializable, {}) };
        }

        function buildWildcardsHelperNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            const size = defaultNodeSize('wildcards_helper') || { w: 340, h: 430 };
            const node = {
                id: uid('wildcards_helper'),
                type: 'wildcards_helper',
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: opts.title || t('Wildcards Helper', '通配符小助手')
            };
            return Object.assign(node, buildWildcardsHelperStatePatch(node, {
                paramsPatch: opts.params,
                textPatch: { value: '', updated_at: nowIso() }
            }));
        }

        function buildMediaBrowserNode(world, options) {
            const opts = options || {};
            const position = world || getViewportCenterWorld();
            const size = defaultNodeSize('media_browser') || { w: 900, h: 640 };
            const node = {
                id: uid('media_browser'),
                type: 'media_browser',
                x: Math.round(Number(world?.x || 0)),
                y: Math.round(Number(world?.y || 0)),
                w: Number(opts.w || size.w || 900),
                h: Number(opts.h || size.h || 640),
                title: opts.title || mediaBrowserLabel(),
                source: { kind: 'output_media_browser' }
            };
            return Object.assign(node, buildMediaBrowserStatePatch(node, {
                state: opts.state || mediaBrowserInitialState(position)
            }));
        }

        function buildNoteNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            return {
                id: uid('note'),
                type: 'note',
                x: Math.round(position.x),
                y: Math.round(position.y),
                w: Number(opts.w || 280),
                h: Number(opts.h || 180),
                title: opts.title || t('Tip Note', '提示贴'),
                text: opts.text || t('Write a note for this work area.', '在这里记录这个工作区域的提示。'),
                style: Object.assign({
                    color: '#f8fafc',
                    background: '#164e63',
                    font_size: 14
                }, opts.style || {}),
                source: { kind: 'canvas_note' }
            };
        }

        function buildNoteStatePatch(node, options) {
            const config = options || {};
            const defaults = {
                text: '',
                style: {
                    color: '#f8fafc',
                    background: '#164e63',
                    font_size: 14
                },
                tail: {
                    enabled: false,
                    target: { x: null, y: null }
                },
                source: { kind: 'canvas_note' }
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
            const style = hasOwn(config, 'style')
                ? cloneValue(config.style, {})
                : mergeObject(
                    mergeObject(
                        mergeObject(defaults.style, initialState.style),
                        node?.style
                    ),
                    statePatch.style
                );
            if (config.stylePatch && typeof config.stylePatch === 'object' && !Array.isArray(config.stylePatch)) {
                Object.assign(style, cloneValue(config.stylePatch, {}));
            }
            (Array.isArray(config.deleteStyleKeys) ? config.deleteStyleKeys : []).forEach((key) => {
                const name = String(key || '').trim();
                if (name) delete style[name];
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
            const hasTail = hasOwn(node, 'tail')
                || hasOwn(initialState, 'tail')
                || hasOwn(statePatch, 'tail')
                || hasOwn(config, 'tail')
                || (config.tailPatch && typeof config.tailPatch === 'object')
                || (config.tailTargetPatch && typeof config.tailTargetPatch === 'object');
            const patch = {
                text: hasOwn(config, 'text') ? String(config.text ?? '') : String(state.text ?? ''),
                style: cloneValue(style, {}),
                source: cloneValue(source, {})
            };
            if (hasTail) {
                const tail = hasOwn(config, 'tail')
                    ? cloneValue(config.tail, {})
                    : mergeObject(
                        mergeObject(
                            mergeObject(defaults.tail, initialState.tail),
                            node?.tail
                        ),
                        statePatch.tail
                    );
                if (config.tailPatch && typeof config.tailPatch === 'object' && !Array.isArray(config.tailPatch)) {
                    Object.assign(tail, cloneValue(config.tailPatch, {}));
                }
                const tailTarget = mergeObject(
                    mergeObject(
                        mergeObject(defaults.tail.target, initialState.tail?.target),
                        node?.tail?.target
                    ),
                    statePatch.tail?.target
                );
                Object.assign(tailTarget, cloneValue(config.tail?.target, {}));
                if (config.tailTargetPatch && typeof config.tailTargetPatch === 'object' && !Array.isArray(config.tailTargetPatch)) {
                    Object.assign(tailTarget, cloneValue(config.tailTargetPatch, {}));
                }
                tail.target = tailTarget;
                patch.tail = cloneValue(tail, {});
            }
            if (hasOwn(config, 'width') || hasOwn(config, 'w')) {
                const width = Number(hasOwn(config, 'width') ? config.width : config.w);
                if (Number.isFinite(width)) patch.w = width;
            }
            if (hasOwn(config, 'height') || hasOwn(config, 'h')) {
                const height = Number(hasOwn(config, 'height') ? config.height : config.h);
                if (Number.isFinite(height)) patch.h = height;
            }
            return patch;
        }

        return {
            buildWildcardsHelperNode,
            buildWildcardsHelperStatePatch,
            buildMediaBrowserNode,
            buildMediaBrowserStatePatch,
            buildNoteNode,
            buildNoteStatePatch
        };
    }

    window.SimpAICanvasWorkbenchAuxNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchAuxNodeFactory || {}, {
        createCanvasAuxNodeFactoryController
    });
})();
