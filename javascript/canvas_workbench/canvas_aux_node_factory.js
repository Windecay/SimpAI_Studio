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

        function buildWildcardsHelperNode(world, options) {
            const opts = options || {};
            const position = world || { x: 0, y: 0 };
            const size = defaultNodeSize('wildcards_helper') || { w: 340, h: 430 };
            return {
                id: uid('wildcards_helper'),
                type: 'wildcards_helper',
                x: position.x,
                y: position.y,
                w: size.w,
                h: size.h,
                title: opts.title || t('Wildcards Helper', '通配符小助手'),
                params: Object.assign({
                    target: 'Array (batch)',
                    method: 'Random Select',
                    seed_mode: 'Fixed seed',
                    name: '',
                    count: 1,
                    start: 1,
                    group_size: 1
                }, opts.params || {}),
                text: { value: '', updated_at: nowIso() },
                source: { kind: 'wildcards_helper', module: 'enhanced.wildcards' }
            };
        }

        function buildMediaBrowserNode(world, options) {
            const opts = options || {};
            const position = world || getViewportCenterWorld();
            const size = defaultNodeSize('media_browser') || { w: 900, h: 640 };
            return {
                id: uid('media_browser'),
                type: 'media_browser',
                x: Math.round(Number(world?.x || 0)),
                y: Math.round(Number(world?.y || 0)),
                w: Number(opts.w || size.w || 900),
                h: Number(opts.h || size.h || 640),
                title: opts.title || mediaBrowserLabel(),
                media_browser: serializableMediaBrowserState(opts.state || mediaBrowserInitialState(position)),
                source: { kind: 'output_media_browser' }
            };
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

        return { buildWildcardsHelperNode, buildMediaBrowserNode, buildNoteNode };
    }

    window.SimpAICanvasWorkbenchAuxNodeFactory = Object.assign({}, window.SimpAICanvasWorkbenchAuxNodeFactory || {}, {
        createCanvasAuxNodeFactoryController
    });
})();
