(function () {
    'use strict';

    function createCanvasViewportFitController(context) {
        const scope = context?.viewportFitSource || context || {};
        const source = name => scope[name] && typeof scope[name] === 'object' ? scope[name] : {};
        const projectSource = source('projectSource');
        const groupSource = source('groupSource');
        const selectionSource = source('selectionSource');
        const layoutSource = source('layoutSource');
        const viewportSource = source('viewportSource');
        const actionSource = source('actionSource');
        const renderSource = source('renderSource');
        const persistenceSource = source('persistenceSource');
        const call = (target, name, fallback, ...args) => typeof target[name] === 'function'
            ? target[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const ensureProjectGroups = () => call(
            projectSource,
            'ensureProjectGroups',
            Array.isArray(getProject().groups) ? getProject().groups : []
        ) || [];
        const getNode = id => typeof projectSource.getNode === 'function'
            ? projectSource.getNode(id) || null
            : (Array.isArray(getProject().nodes) ? getProject().nodes.find(node => node?.id === id) : null) || null;
        const getGroup = id => typeof projectSource.getGroup === 'function'
            ? projectSource.getGroup(id) || null
            : ensureProjectGroups().find(group => group?.id === id) || null;
        const getGroupRect = group => call(groupSource, 'getGroupRect', null, group);
        const defaultNodeSize = type => call(layoutSource, 'defaultNodeSize', { w: 220, h: 250 }, type);
        const clamp = (value, min, max) => call(
            viewportSource,
            'clamp',
            Math.max(min, Math.min(max, value)),
            value,
            min,
            max
        );
        const viewportRect = () => {
            const viewport = call(viewportSource, 'getViewport', null);
            return viewport?.getBoundingClientRect?.() || { width: 0, height: 0 };
        };
        const applyViewportPatch = patch => call(viewportSource, 'applyProjectViewportPatch', undefined, patch);
        const renderAll = options => call(renderSource, 'renderAll', undefined, options);
        const scheduleSave = () => call(persistenceSource, 'scheduleSave', undefined);

        function getNodesBounds() {
            const project = getProject();
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const node of project.nodes) {
                const size = defaultNodeSize(node.type);
                const x = node.x || 0;
                const y = node.y || 0;
                const w = node.w || size.w;
                const h = node.h || size.h;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w);
                maxY = Math.max(maxY, y + h);
            }
            for (const group of ensureProjectGroups()) {
                const rect = getGroupRect(group);
                minX = Math.min(minX, rect.x);
                minY = Math.min(minY, rect.y);
                maxX = Math.max(maxX, rect.x + rect.w);
                maxY = Math.max(maxY, rect.y + rect.h);
            }
            if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
            return { minX, minY, maxX, maxY };
        }

        function centerCanvas() {
            const rect = viewportRect();
            applyViewportPatch({
                x: Math.round(rect.width / 2),
                y: Math.round(rect.height / 2),
                zoom: 1
            });
            renderAll({ inspector: false });
            scheduleSave();
        }

        function centerViewportOnWorld(worldX, worldY) {
            const rect = viewportRect();
            const zoom = getProject().viewport.zoom || 1;
            applyViewportPatch({
                x: Math.round(rect.width / 2 - worldX * zoom),
                y: Math.round(rect.height / 2 - worldY * zoom)
            });
            renderAll({ inspector: false });
            scheduleSave();
        }

        function fitAll() {
            const project = getProject();
            if (!project.nodes.length && !ensureProjectGroups().length) {
                centerCanvas();
                return;
            }
            const bounds = getNodesBounds();
            const rect = viewportRect();
            const width = Math.max(1, bounds.maxX - bounds.minX);
            const height = Math.max(1, bounds.maxY - bounds.minY);
            const zoom = clamp(Math.min((rect.width - 180) / width, (rect.height - 140) / height), 0.15, 1.5);
            applyViewportPatch({
                zoom,
                x: Math.round(rect.width / 2 - (bounds.minX + width / 2) * zoom),
                y: Math.round(rect.height / 2 - (bounds.minY + height / 2) * zoom)
            });
            renderAll({ inspector: false });
            scheduleSave();
        }

        function fitSelection() {
            const selectedGroupId = call(selectionSource, 'getSelectedGroupId', null);
            if (selectedGroupId) {
                call(actionSource, 'focusGroup', undefined, getGroup(selectedGroupId));
                return;
            }
            const node = getNode(call(selectionSource, 'getSelectedNodeId', null));
            if (!node) {
                fitAll();
                return;
            }
            const rect = viewportRect();
            const size = defaultNodeSize(node.type);
            const w = node.w || size.w;
            const h = node.h || size.h;
            const zoom = clamp(Math.min((rect.width - 180) / Math.max(1, w), (rect.height - 140) / Math.max(1, h)), 0.3, 1.6);
            applyViewportPatch({
                zoom,
                x: Math.round(rect.width / 2 - ((node.x || 0) + w / 2) * zoom),
                y: Math.round(rect.height / 2 - ((node.y || 0) + h / 2) * zoom)
            });
            renderAll({ inspector: false });
            scheduleSave();
        }

        return { fitAll, fitSelection, centerCanvas, centerViewportOnWorld, getNodesBounds };
    }

    window.SimpAICanvasWorkbenchViewportFit = Object.assign({}, window.SimpAICanvasWorkbenchViewportFit || {}, {
        createCanvasViewportFitController
    });
})();
