(function () {
    'use strict';

    function createCanvasAgentWorkflowLayoutController(context) {
        const scope = context?.workflowLayoutSource || context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function'
            ? scope[name](...args)
            : fallback;
        const getProject = () => call('getProject', {}) || {};
        const getNodeRect = (...args) => call('getNodeRect', null, ...args);
        const getVisibleWorldRect = (...args) => call('getVisibleWorldRect', null, ...args);
        const defaultNodeSize = (...args) => call('defaultNodeSize', { w: 160, h: 120 }, ...args) || { w: 160, h: 120 };
        const defaultResultNodeSize = (...args) => call('defaultResultNodeSize', { w: 240, h: 260 }, ...args) || { w: 240, h: 260 };
        const viewportCenterWorld = (...args) => call('viewportCenterWorld', { x: 0, y: 0 }, ...args) || { x: 0, y: 0 };
        const ensureProjectGroups = (...args) => call('ensureProjectGroups', [], ...args) || [];
        const getGroup = (...args) => call('getGroup', null, ...args);
        const updateGroupPositionDom = (...args) => call('updateGroupPositionDom', null, ...args);
        const centerViewportOnWorld = (...args) => call('centerViewportOnWorld', null, ...args);
        const buildNodeLayoutPatch = (...args) => call('buildNodeLayoutPatch', {}, ...args) || {};
        const buildResultLayoutPatch = (...args) => call('buildResultLayoutPatch', {}, ...args) || {};
        const buildGroupFieldPatch = (...args) => call('buildGroupFieldPatch', {}, ...args) || {};
        const buildAgentWorkflowGroup = (...args) => call('buildAgentWorkflowGroup', null, ...args);
        const buildProjectGroupAppendPatch = (...args) => call('buildProjectGroupAppendPatch', {}, ...args) || {};
        const buildAgentCreatedNodePatch = (...args) => call('buildAgentCreatedNodePatch', {}, ...args) || {};
        const buildAgentWorkflowPresetPatch = (...args) => call('buildAgentWorkflowPresetPatch', {}, ...args) || {};
        const normalizePresetName = typeof scope.normalizePresetName === 'function'
            ? scope.normalizePresetName
            : (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
        const getCollapsedPromptNodeDefaultHeight = () => Number(
            call('getCollapsedPromptNodeDefaultHeight', 280) || 280
        );
        const setSelectedGroupId = (...args) => call('setSelectedGroupId', null, ...args);
        const rectsOverlap = (...args) => {
            if (typeof scope.rectsOverlap === 'function') return scope.rectsOverlap(...args);
            const [a, b, padding] = args;
            const pad = Number(padding || 0);
            return !!a && !!b
                && a.x < b.x + b.w + pad
                && a.x + a.w + pad > b.x
                && a.y < b.y + b.h + pad
                && a.y + a.h + pad > b.y;
        };

        function canvasAgentWorkflowPresetPosition(target, options) {
            const opts = options || {};
            const sourceRect = target ? getNodeRect(target) : null;
            const visible = target?.type === 'vlm' ? getVisibleWorldRect() : null;
            const sourcePad = target?.type === 'vlm' ? 260 : 140;
            const base = sourceRect
                ? {
                    x: Math.round(Math.max(
                        sourceRect.x + sourceRect.w + sourcePad,
                        visible ? visible.x + visible.w * 0.56 : -Infinity
                    )),
                    y: Math.round(sourceRect.y)
                }
                : (() => {
                    const center = viewportCenterWorld();
                    return { x: Math.round(center.x - 390), y: Math.round(center.y - 190) };
                })();
            const defaultPreset = defaultNodeSize('preset');
            const presetSize = opts.presetSize || {
                w: Math.max(430, Number(defaultPreset?.w || 0)),
                h: Math.max(520, Number(defaultPreset?.h || 0))
            };
            const resultSize = opts.resultSize || defaultResultNodeSize();
            return findOpenCanvasAgentWorkflowPresetPosition(base, presetSize, resultSize, opts);
        }

        function canvasAgentWorkflowPairRect(position, presetSize, resultSize) {
            const x = Math.round(position?.x || 0);
            const y = Math.round(position?.y || 0);
            const presetW = Number(presetSize?.w || 360);
            const presetH = Number(presetSize?.h || 260);
            const resultW = Number(resultSize?.w || 240);
            const resultH = Number(resultSize?.h || 260);
            const resultX = x + presetW + 140;
            const resultY = y + 20;
            const minX = Math.min(x, resultX);
            const minY = Math.min(y, resultY);
            const maxX = Math.max(x + presetW, resultX + resultW);
            const maxY = Math.max(y + presetH, resultY + resultH);
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }

        function canvasAgentWorkflowOccupiedRects(excludeIds) {
            const excluded = new Set(excludeIds || []);
            const project = getProject();
            const nodeRects = (Array.isArray(project.nodes) ? project.nodes : [])
                .filter(node => node && !excluded.has(node.id))
                .map(node => getNodeRect(node))
                .filter(Boolean);
            const groupRects = ensureProjectGroups()
                .filter(group => group && !excluded.has(group.id))
                .map(group => ({ x: group.x || 0, y: group.y || 0, w: group.w || 0, h: group.h || 0 }))
                .filter(rect => rect.w > 0 && rect.h > 0);
            return nodeRects.concat(groupRects);
        }

        function findOpenCanvasAgentWorkflowPresetPosition(base, presetSize, resultSize, options) {
            const opts = options || {};
            const padding = Number(opts.padding ?? 42);
            const occupied = canvasAgentWorkflowOccupiedRects(opts.excludeIds);
            const pairSize = canvasAgentWorkflowPairRect({ x: 0, y: 0 }, presetSize, resultSize);
            const stepX = Number(opts.stepX || pairSize.w + padding + 80);
            const stepY = Number(opts.stepY || pairSize.h + padding + 64);
            const isFree = (candidate) => {
                const rect = canvasAgentWorkflowPairRect(candidate, presetSize, resultSize);
                return !occupied.some(used => rectsOverlap(rect, used, padding));
            };
            const start = { x: Math.round(base?.x || 0), y: Math.round(base?.y || 0) };
            if (isFree(start)) return start;
            const offsets = [];
            for (let ring = 1; ring <= 10; ring += 1) {
                offsets.push([ring, 0], [ring, 1], [ring, -1], [0, ring], [0, -ring]);
                for (let dy = -ring; dy <= ring; dy += 1) offsets.push([ring, dy]);
                for (let dx = -ring; dx <= ring; dx += 1) offsets.push([dx, ring], [dx, -ring]);
            }
            const seen = new Set();
            for (const [dx, dy] of offsets) {
                const candidate = { x: Math.round(start.x + dx * stepX), y: Math.round(start.y + dy * stepY) };
                const key = `${candidate.x},${candidate.y}`;
                if (seen.has(key)) continue;
                seen.add(key);
                if (isFree(candidate)) return candidate;
            }
            return { x: Math.round(start.x + stepX), y: Math.round(start.y + stepY) };
        }

        function canvasAgentReferenceWorkflowRect(position, presetSize, referenceSize) {
            const presetX = Math.round(position?.x || 0);
            const presetY = Math.round(position?.y || 0);
            const presetW = Number(presetSize?.w || 430);
            const presetH = Number(presetSize?.h || getCollapsedPromptNodeDefaultHeight());
            const referenceW = Number(referenceSize?.w || 264);
            const referenceH = Number(referenceSize?.h || 300);
            const gap = 90;
            const referenceX = Math.round(presetX - referenceW - gap);
            const referenceY = presetY;
            const minX = Math.min(referenceX, presetX);
            const minY = Math.min(referenceY, presetY);
            const maxX = Math.max(referenceX + referenceW, presetX + presetW);
            const maxY = Math.max(referenceY + referenceH, presetY + presetH);
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }

        function findOpenCanvasAgentReferencePresetPosition(base, presetSize, referenceSize, options) {
            const opts = options || {};
            const padding = Number(opts.padding ?? 42);
            const occupied = canvasAgentWorkflowOccupiedRects(opts.excludeIds);
            const workflowSize = canvasAgentReferenceWorkflowRect({ x: 0, y: 0 }, presetSize, referenceSize);
            const stepX = Number(opts.stepX || workflowSize.w + padding + 80);
            const stepY = Number(opts.stepY || workflowSize.h + padding + 64);
            const isFree = (candidate) => {
                const rect = canvasAgentReferenceWorkflowRect(candidate, presetSize, referenceSize);
                return !occupied.some(used => rectsOverlap(rect, used, padding));
            };
            const start = { x: Math.round(base?.x || 0), y: Math.round(base?.y || 0) };
            if (isFree(start)) return start;
            const offsets = [];
            for (let ring = 1; ring <= 10; ring += 1) {
                offsets.push([ring, 0], [ring, 1], [ring, -1], [0, ring], [0, -ring]);
                for (let dy = -ring; dy <= ring; dy += 1) offsets.push([ring, dy]);
                for (let dx = -ring; dx <= ring; dx += 1) offsets.push([dx, ring], [dx, -ring]);
            }
            const seen = new Set();
            for (const [dx, dy] of offsets) {
                const candidate = { x: Math.round(start.x + dx * stepX), y: Math.round(start.y + dy * stepY) };
                const key = `${candidate.x},${candidate.y}`;
                if (seen.has(key)) continue;
                seen.add(key);
                if (isFree(candidate)) return candidate;
            }
            return { x: Math.round(start.x + stepX), y: Math.round(start.y + stepY) };
        }

        function canvasAgentReferenceWorkflowPresetPosition(target, options) {
            const opts = options || {};
            const sourceRect = target ? getNodeRect(target) : null;
            const visible = target?.type === 'vlm' ? getVisibleWorldRect() : null;
            const defaultPreset = defaultNodeSize('preset');
            const defaultImage = defaultNodeSize('image');
            const referenceGap = 90;
            const presetSize = opts.presetSize || {
                w: Math.max(430, Number(defaultPreset?.w || 0)),
                h: Math.max(getCollapsedPromptNodeDefaultHeight(), Number(defaultPreset?.h || 0))
            };
            const referenceSize = opts.referenceSize || {
                w: Math.max(264, Number(defaultImage?.w || 0)),
                h: Math.max(300, Number(defaultImage?.h || 0))
            };
            const sourcePad = target?.type === 'vlm' ? 300 : 140;
            const base = sourceRect
                ? {
                    x: Math.round(Math.max(
                        sourceRect.x + sourceRect.w + sourcePad + referenceSize.w + referenceGap,
                        visible ? visible.x + visible.w * 0.56 + referenceSize.w : -Infinity
                    )),
                    y: Math.round(sourceRect.y)
                }
                : (() => {
                    const center = viewportCenterWorld();
                    return { x: Math.round(center.x + referenceSize.w / 2), y: Math.round(center.y - 160) };
                })();
            return findOpenCanvasAgentReferencePresetPosition(base, presetSize, referenceSize, opts);
        }

        function positionCanvasAgentReferenceWorkflow(target, presetNode, referenceNode) {
            if (!presetNode || !referenceNode) return;
            const defaultPreset = defaultNodeSize(presetNode.type || 'preset');
            const defaultReference = defaultNodeSize(referenceNode.type || 'image');
            const presetSize = {
                w: Math.max(430, Number(presetNode.w || defaultPreset?.w || 0)),
                h: Math.max(getCollapsedPromptNodeDefaultHeight(), Number(presetNode.h || defaultPreset?.h || 0))
            };
            const referenceSize = {
                w: Math.max(264, Number(referenceNode.w || defaultReference?.w || 0)),
                h: Math.max(300, Number(referenceNode.h || defaultReference?.h || 0))
            };
            const position = canvasAgentReferenceWorkflowPresetPosition(target, {
                presetSize,
                referenceSize,
                excludeIds: [presetNode.id, referenceNode.id]
            });
            Object.assign(presetNode, buildNodeLayoutPatch(presetNode, {
                x: Math.round(position.x),
                y: Math.round(position.y)
            }));
            Object.assign(referenceNode, buildNodeLayoutPatch(referenceNode, {
                x: Math.round(position.x - referenceSize.w - 90),
                y: Math.round(position.y)
            }));
        }

        function positionCanvasAgentVideoMaskWorkflow(sourceNode, sam3Node, presetNode, resultNode) {
            if (!sam3Node || !presetNode) return;
            const sourceRect = sourceNode ? getNodeRect(sourceNode) : null;
            const sam3Size = defaultNodeSize('sam3_video_mask');
            const presetSize = defaultNodeSize(presetNode.type);
            const sam3W = Number(sam3Node.w || sam3Size.w || 360);
            const sam3H = Number(sam3Node.h || sam3Size.h || 560);
            const presetW = Number(presetNode.w || presetSize.w || 360);
            const baseX = sourceRect
                ? Math.round(sourceRect.x + sourceRect.w + 120)
                : Math.round((presetNode.x || 0) - sam3W - 100);
            const baseY = sourceRect
                ? Math.round(sourceRect.y + Math.max(0, (sourceRect.h - sam3H) / 2))
                : Math.round(presetNode.y || 0);
            Object.assign(sam3Node, buildNodeLayoutPatch(sam3Node, { x: baseX, y: baseY }));
            Object.assign(presetNode, buildNodeLayoutPatch(presetNode, {
                x: Math.round(baseX + sam3W + 100),
                y: Math.round(baseY)
            }));
            if (resultNode) {
                Object.assign(resultNode, buildResultLayoutPatch(resultNode, {
                    x: Math.round(presetNode.x + presetW + 140),
                    y: Math.round(presetNode.y + 20)
                }));
            }
        }

        function markCanvasAgentCreatedNode(node, options) {
            if (!node) return node;
            Object.assign(node, buildAgentCreatedNodePatch(node, options));
            return node;
        }

        function vlmCanvasAgentWorkflowKey(vlmNodeId, kind, presetName) {
            const cleanNodeId = String(vlmNodeId || '').trim();
            const cleanKind = String(kind || 't2i').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 't2i';
            const cleanPreset = normalizePresetName(presetName || '').toLowerCase() || 'default';
            return cleanNodeId ? `vlm_chat:${cleanNodeId}:${cleanKind}:${cleanPreset}` : '';
        }

        function findCanvasAgentWorkflowPresetByKey(workflowKey, presetName) {
            const key = String(workflowKey || '').trim();
            if (!key) return null;
            const wantedPreset = normalizePresetName(presetName || '');
            const project = getProject();
            return (Array.isArray(project.nodes) ? project.nodes : []).find(node => {
                if (!node || !['preset', 'classic'].includes(node.type)) return false;
                if (node.source?.agent_workflow_key !== key) return false;
                if (!wantedPreset) return true;
                const nodePreset = normalizePresetName(node.preset?.name || node.preset?.display_name || node.title || '');
                return nodePreset === wantedPreset;
            }) || null;
        }

        function tagCanvasAgentWorkflowPreset(node, options) {
            if (!node) return node;
            Object.assign(node, buildAgentWorkflowPresetPatch(node, options));
            return node;
        }

        function canvasAgentWorkflowBounds(nodes, padding) {
            const list = (Array.isArray(nodes) ? nodes : []).filter(Boolean);
            if (!list.length) return null;
            const rects = list.map(node => getNodeRect(node)).filter(Boolean);
            if (!rects.length) return null;
            const pad = Number(padding ?? 48);
            const minX = Math.min(...rects.map(rect => rect.x));
            const minY = Math.min(...rects.map(rect => rect.y));
            const maxX = Math.max(...rects.map(rect => rect.x + rect.w));
            const maxY = Math.max(...rects.map(rect => rect.y + rect.h));
            return {
                x: Math.round(minX - pad),
                y: Math.round(minY - pad),
                w: Math.max(320, Math.round(maxX - minX + pad * 2)),
                h: Math.max(180, Math.round(maxY - minY + pad * 2))
            };
        }

        function fitCanvasAgentWorkflowGroup(groupOrId, nodes, padding) {
            const group = typeof groupOrId === 'string' ? getGroup(groupOrId) : groupOrId;
            const rect = canvasAgentWorkflowBounds(nodes, padding);
            if (!group || !rect) return group || null;
            Object.assign(group, buildGroupFieldPatch(group, 'x', rect.x));
            Object.assign(group, buildGroupFieldPatch(group, 'y', rect.y));
            Object.assign(group, buildGroupFieldPatch(group, 'w', rect.w));
            Object.assign(group, buildGroupFieldPatch(group, 'h', rect.h));
            updateGroupPositionDom(group.id);
            return group;
        }

        function centerCanvasAgentWorkflow(nodes) {
            const rect = canvasAgentWorkflowBounds(nodes, 0);
            if (!rect) return;
            const panelEl = typeof document !== 'undefined'
                ? document.querySelector('.sai-canvas-agent-panel')
                : null;
            const panelWidth = panelEl ? panelEl.offsetWidth : 360;
            const project = getProject();
            const agentOffset = (panelWidth / 2 + 20) / (project.viewport?.zoom || 1);
            centerViewportOnWorld(rect.x + rect.w / 2 + agentOffset, rect.y + rect.h / 2);
        }

        function createCanvasAgentWorkflowGroup(nodes, title) {
            const list = (Array.isArray(nodes) ? nodes : []).filter(Boolean);
            const rect = canvasAgentWorkflowBounds(list, 48);
            if (!rect) return null;
            const normalizedTitle = String(title || '').trim();
            const existing = ensureProjectGroups().find((group) => {
                if (!group) return false;
                const groupTitle = String(group.title || '');
                const isAgentGroup = group.color === '#f97316' || /agent/i.test(groupTitle);
                if (!isAgentGroup) return false;
                const gx = Number(group.x || 0);
                const gy = Number(group.y || 0);
                const gw = Number(group.w || 0);
                const gh = Number(group.h || 0);
                const left = Math.max(gx, rect.x);
                const top = Math.max(gy, rect.y);
                const right = Math.min(gx + gw, rect.x + rect.w);
                const bottom = Math.min(gy + gh, rect.y + rect.h);
                const area = Math.max(0, right - left) * Math.max(0, bottom - top);
                return area > Math.min(Math.max(1, gw * gh), Math.max(1, rect.w * rect.h)) * 0.45;
            });
            if (existing) {
                fitCanvasAgentWorkflowGroup(existing, list, 48);
                if (normalizedTitle) Object.assign(existing, buildGroupFieldPatch(existing, 'title', normalizedTitle));
                setSelectedGroupId(existing.id);
                return existing;
            }
            const group = buildAgentWorkflowGroup(rect, title);
            if (!group) return null;
            const project = getProject();
            Object.assign(project, buildProjectGroupAppendPatch(project, group));
            setSelectedGroupId(group.id);
            return group;
        }

        return {
            canvasAgentWorkflowPresetPosition,
            canvasAgentWorkflowPairRect,
            canvasAgentWorkflowOccupiedRects,
            findOpenCanvasAgentWorkflowPresetPosition,
            canvasAgentReferenceWorkflowRect,
            findOpenCanvasAgentReferencePresetPosition,
            canvasAgentReferenceWorkflowPresetPosition,
            positionCanvasAgentReferenceWorkflow,
            positionCanvasAgentVideoMaskWorkflow,
            markCanvasAgentCreatedNode,
            vlmCanvasAgentWorkflowKey,
            findCanvasAgentWorkflowPresetByKey,
            tagCanvasAgentWorkflowPreset,
            canvasAgentWorkflowBounds,
            fitCanvasAgentWorkflowGroup,
            centerCanvasAgentWorkflow,
            createCanvasAgentWorkflowGroup
        };
    }

    window.SimpAICanvasWorkbenchAgentWorkflowLayout = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAgentWorkflowLayout || {},
        { createCanvasAgentWorkflowLayoutController }
    );
})();
