(function () {
    'use strict';

    function createCanvasGroupFactoryController(context) {
        const scope = context || {};
        const uid = typeof scope.uid === 'function' ? scope.uid : (type) => `${type}-node`;
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const clamp = typeof scope.clamp === 'function'
            ? scope.clamp
            : ((value, min, max) => Math.max(min, Math.min(max, value)));
        const normalizeCanvasColor = typeof scope.normalizeCanvasColor === 'function'
            ? scope.normalizeCanvasColor
            : ((value, fallback) => {
                const text = String(value || '').trim();
                return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(text) ? text : fallback;
            });

        function buildAgentWorkflowGroup(rect, title) {
            const bounds = rect || { x: 0, y: 0, w: 320, h: 180 };
            return {
                id: uid('group'),
                title: title || t('Agent workflow', 'Agent 工作流'),
                x: bounds.x,
                y: bounds.y,
                w: bounds.w,
                h: bounds.h,
                color: '#f97316',
                alpha: 0.12,
                shortcut: '',
                locked: false
            };
        }

        function buildAreaGroup(rect, overrides) {
            const bounds = rect || { x: 0, y: 0, w: 400, h: 240 };
            return Object.assign({
                id: uid('group'),
                title: t('New Group', '新分组'),
                x: bounds.x,
                y: bounds.y,
                w: Math.max(220, bounds.w),
                h: Math.max(140, bounds.h),
                color: '#14b8a6',
                alpha: 0.16,
                shortcut: '',
                locked: false
            }, overrides || {});
        }

        function buildGroupIdPatch(group, options) {
            const config = options || {};
            return {
                id: group?.id || config.fallbackId || uid('group')
            };
        }

        function buildGroupFieldPatch(group, key, value) {
            const field = String(key || '');
            if (field === 'locked') return { locked: !!value };
            if (field === 'alpha') return { alpha: clamp(Number(value ?? 0.16), 0.04, 0.72) };
            if (field === 'color') return { color: normalizeCanvasColor(value, '#14b8a6') };
            if (['x', 'y', 'w', 'h'].includes(field)) {
                const next = Math.round(Number(value || 0));
                return {
                    [field]: field === 'w' ? Math.max(180, next) : (field === 'h' ? Math.max(120, next) : next)
                };
            }
            if (field === 'shortcut') return { shortcut: String(value || '').trim().slice(0, 12) };
            return { [field]: String(value || '') };
        }

        return { buildAgentWorkflowGroup, buildAreaGroup, buildGroupIdPatch, buildGroupFieldPatch };
    }

    window.SimpAICanvasWorkbenchGroupFactory = Object.assign({}, window.SimpAICanvasWorkbenchGroupFactory || {}, {
        createCanvasGroupFactoryController
    });
})();
