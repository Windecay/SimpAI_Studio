(function () {
    'use strict';

    function createCanvasNodeSpatialIndexController(context) {
        const scope = context || {};
        const readValue = (name, fallback) => {
            const value = scope[name];
            if (typeof value === 'function') return value();
            return value === undefined ? fallback : value;
        };
        const getProject = () => typeof scope.getProject === 'function' ? scope.getProject() : scope.project;
        const getNodeRect = typeof scope.getNodeRect === 'function'
            ? scope.getNodeRect
            : (node) => ({
                x: Math.round(Number(node?.x || 0)),
                y: Math.round(Number(node?.y || 0)),
                w: Math.max(1, Number(node?.w || 1)),
                h: Math.max(1, Number(node?.h || 1))
            });
        const isNodeVisuallyRunning = typeof scope.isNodeVisuallyRunning === 'function'
            ? scope.isNodeVisuallyRunning
            : () => false;
        const isResultRefreshing = typeof scope.isResultRefreshing === 'function'
            ? scope.isResultRefreshing
            : () => false;
        const rectsOverlap = typeof scope.rectsOverlap === 'function'
            ? scope.rectsOverlap
            : () => false;
        const shouldRenderNodeInViewport = typeof scope.shouldRenderNodeInViewport === 'function'
            ? scope.shouldRenderNodeInViewport
            : () => true;
        const getPerfStats = () => typeof scope.getPerfStats === 'function' ? (scope.getPerfStats() || {}) : {};
        const setNodeRenderCoverageRect = typeof scope.setNodeRenderCoverageRect === 'function'
            ? scope.setNodeRenderCoverageRect
            : () => {};
        const minNodes = Math.max(0, Number(scope.nodeSpatialIndexMinNodes ?? 180));
        const cellSize = Math.max(1, Number(scope.nodeSpatialIndexCellSize ?? 960));
        const overviewExitZoom = Number(scope.canvasOverviewExitZoom ?? 0.42);
        const panPreviewNodeBudget = Math.max(0, Number(scope.panPreviewNodeBudget ?? 140));
        const nodeRenderOverscanPx = Math.max(0, Number(scope.nodeRenderOverscanPx ?? 560));
        const panPreviewDeferCoveragePadPx = Math.max(0, Number(scope.panPreviewDeferCoveragePadPx ?? 1200));
        let nodeSpatialIndex = null;
        let nodeSpatialIndexDirty = true;

        function invalidateNodeSpatialIndex() {
            nodeSpatialIndexDirty = true;
        }

        function rectCellRange(rect, size) {
            const cell = Math.max(1, Number(size || cellSize));
            const x1 = Math.floor(Number(rect?.x || 0) / cell);
            const y1 = Math.floor(Number(rect?.y || 0) / cell);
            const x2 = Math.floor((Number(rect?.x || 0) + Math.max(1, Number(rect?.w || 1))) / cell);
            const y2 = Math.floor((Number(rect?.y || 0) + Math.max(1, Number(rect?.h || 1))) / cell);
            return { x1, y1, x2, y2 };
        }

        function spatialIndexCellKeysForRect(rect) {
            const range = rectCellRange(rect, cellSize);
            const keys = [];
            for (let x = range.x1; x <= range.x2; x += 1) {
                for (let y = range.y1; y <= range.y2; y += 1) {
                    keys.push(`${x}:${y}`);
                }
            }
            return keys;
        }

        function addSpatialRecordToCells(index, record, keys) {
            if (!index || !record) return;
            const cellKeys = Array.isArray(keys) ? keys : spatialIndexCellKeysForRect(record.rect);
            record.cellKeys = cellKeys;
            cellKeys.forEach((key) => {
                if (!index.cells.has(key)) index.cells.set(key, []);
                index.cells.get(key).push(record);
            });
        }

        function removeSpatialRecordFromCells(index, record) {
            if (!index || !record || !Array.isArray(record.cellKeys)) return;
            record.cellKeys.forEach((key) => {
                const records = index.cells.get(key);
                if (!records) return;
                const nextRecords = records.filter((item) => item !== record);
                if (nextRecords.length) index.cells.set(key, nextRecords);
                else index.cells.delete(key);
            });
            record.cellKeys = [];
        }

        function buildNodeSpatialIndex() {
            const project = getProject();
            const nodes = Array.isArray(project?.nodes) ? project.nodes : [];
            const records = [];
            const cells = new Map();
            const recordsById = new Map();
            const visualStateRecords = [];
            const projectIds = new Set();
            nodes.forEach((node, order) => {
                if (!node || !node.id) return;
                projectIds.add(node.id);
                const rect = getNodeRect(node);
                const record = { node, rect, order };
                records.push(record);
                recordsById.set(node.id, record);
                if (isNodeVisuallyRunning(node) || isResultRefreshing(node)) visualStateRecords.push(record);
                addSpatialRecordToCells({ cells }, record);
            });
            return { records, cells, recordsById, visualStateRecords, projectIds, totalNodes: nodes.length };
        }

        function getNodeSpatialIndex() {
            const project = getProject();
            const nodes = Array.isArray(project?.nodes) ? project.nodes : [];
            if (nodes.length < minNodes) return null;
            if (!nodeSpatialIndex || nodeSpatialIndexDirty || nodeSpatialIndex.totalNodes !== nodes.length) {
                nodeSpatialIndex = buildNodeSpatialIndex();
                nodeSpatialIndexDirty = false;
            }
            return nodeSpatialIndex;
        }

        function collectForceFullNodeIds() {
            const ids = new Set();
            const selectedNodeId = readValue('getSelectedNodeId', '');
            const selectedNodeIds = readValue('getSelectedNodeIds', new Set());
            if (selectedNodeId) ids.add(selectedNodeId);
            selectedNodeIds?.forEach?.((id) => {
                if (id) ids.add(id);
            });
            const connectingFromId = readValue('getConnectingFromId', '');
            if (connectingFromId) ids.add(connectingFromId);
            const draggingNodeIds = readValue('getDraggingNodeIds', []);
            draggingNodeIds?.forEach?.((id) => {
                if (id) ids.add(id);
            });
            const resizeNodeId = readValue('getNodeResizeNodeId', '');
            if (resizeNodeId) ids.add(resizeNodeId);
            const activeInlineTagCartNodeId = readValue('getActiveInlineTagCartNodeId', '');
            if (activeInlineTagCartNodeId) ids.add(activeInlineTagCartNodeId);
            return ids;
        }

        function refreshNodeSpatialIndexRecord(node) {
            if (!node || !node.id || !nodeSpatialIndex || nodeSpatialIndexDirty) {
                invalidateNodeSpatialIndex();
                return;
            }
            const record = nodeSpatialIndex.recordsById.get(node.id);
            if (!record) {
                invalidateNodeSpatialIndex();
                return;
            }
            const nextRect = getNodeRect(node);
            const nextKeys = spatialIndexCellKeysForRect(nextRect);
            const oldKeys = Array.isArray(record.cellKeys) ? record.cellKeys : [];
            const sameCells = oldKeys.length === nextKeys.length && oldKeys.every((key, index) => key === nextKeys[index]);
            record.rect = nextRect;
            if (sameCells) return;
            removeSpatialRecordFromCells(nodeSpatialIndex, record);
            addSpatialRecordToCells(nodeSpatialIndex, record, nextKeys);
        }

        function queryNodeRecordsForRect(rect, includeForceFull) {
            const project = getProject();
            const index = getNodeSpatialIndex();
            if (!index || !rect) {
                return {
                    indexed: false,
                    records: (Array.isArray(project?.nodes) ? project.nodes : []).map((node, order) => ({ node, order }))
                };
            }
            const candidatesByOrder = new Map();
            const addRecord = (record) => {
                if (!record || !record.node) return;
                candidatesByOrder.set(record.order, record);
            };
            const range = rectCellRange(rect, cellSize);
            for (let x = range.x1; x <= range.x2; x += 1) {
                for (let y = range.y1; y <= range.y2; y += 1) {
                    const records = index.cells.get(`${x}:${y}`);
                    if (!records) continue;
                    records.forEach(addRecord);
                }
            }
            if (includeForceFull) {
                collectForceFullNodeIds().forEach((id) => addRecord(index.recordsById.get(id)));
                index.visualStateRecords.forEach(addRecord);
            }
            const records = Array.from(candidatesByOrder.values()).sort((a, b) => a.order - b.order);
            return { indexed: true, records, candidateCount: records.length, projectIds: index.projectIds };
        }

        function querySpatialNodeRecords(renderWindow, options) {
            return queryNodeRecordsForRect(renderWindow, true);
        }

        function pointInsideRect(point, rect, padding) {
            if (!point || !rect) return false;
            const pad = Math.max(0, Number(padding || 0));
            const x = Number(point.x);
            const y = Number(point.y);
            const left = Number(rect.x || 0) - pad;
            const top = Number(rect.y || 0) - pad;
            const right = Number(rect.x || 0) + Math.max(1, Number(rect.w || 1)) + pad;
            const bottom = Number(rect.y || 0) + Math.max(1, Number(rect.h || 1)) + pad;
            return Number.isFinite(x) && Number.isFinite(y) && x >= left && x <= right && y >= top && y <= bottom;
        }

        function canvasNodePointerFallbackPadding() {
            const project = getProject();
            const zoom = Math.max(0.05, Number(project?.viewport?.zoom || 1) || 1);
            const renderMode = readValue('getCanvasRenderMode', 'full');
            if (renderMode !== 'overview' && zoom > overviewExitZoom) return 0;
            return Math.max(2, 4 / zoom);
        }

        function getMarqueeNodeRecords(selectionRect) {
            const query = queryNodeRecordsForRect(selectionRect);
            const matchingRecords = query.records.filter((record) => {
                if (!record?.node?.id) return false;
                const rect = record.rect || getNodeRect(record.node);
                return rectsOverlap(rect, selectionRect, 0);
            });
            const perfStats = getPerfStats();
            perfStats.marqueeSpatialIndexHit = query.indexed ? 1 : 0;
            perfStats.marqueeSpatialCandidates = query.indexed ? Number(query.candidateCount || query.records.length || 0) : 0;
            return matchingRecords;
        }

        function findCanvasNodeAtWorldPoint(world, options) {
            if (!world) return null;
            const padding = Number(options?.padding ?? canvasNodePointerFallbackPadding());
            const queryRect = {
                x: Number(world.x || 0) - padding,
                y: Number(world.y || 0) - padding,
                w: Math.max(1, padding * 2 + 1),
                h: Math.max(1, padding * 2 + 1)
            };
            const query = queryNodeRecordsForRect(queryRect, true);
            const records = Array.isArray(query.records) ? query.records : [];
            for (let index = records.length - 1; index >= 0; index -= 1) {
                const record = records[index];
                if (!record?.node?.id) continue;
                const rect = record.rect || getNodeRect(record.node);
                if (pointInsideRect(world, rect, padding)) return record.node;
            }
            return null;
        }

        function getVisibleNodeRecords(renderWindow, options) {
            const query = querySpatialNodeRecords(renderWindow, options);
            const visibleRecords = query.records.filter((record) => shouldRenderNodeInViewport(record.node, renderWindow));
            const project = getProject();
            const perfStats = getPerfStats();
            perfStats.nodeSpatialIndexHit = query.indexed ? 1 : 0;
            perfStats.nodeSpatialCandidates = query.indexed ? Number(query.candidateCount || query.records.length || 0) : 0;
            return {
                records: visibleRecords,
                nodes: visibleRecords.map((record) => record.node),
                projectIds: query.projectIds || new Set((Array.isArray(project?.nodes) ? project.nodes : []).map(node => node.id)),
                indexed: query.indexed
            };
        }

        function countVisibleNodesForRenderWindow(renderWindow, limit) {
            const maxCount = Number(limit || 0);
            let count = 0;
            const query = querySpatialNodeRecords(renderWindow);
            for (const record of query.records) {
                if (!shouldRenderNodeInViewport(record.node, renderWindow)) continue;
                count += 1;
                if (maxCount > 0 && count > maxCount) return count;
            }
            return count;
        }

        function expandWorldRect(rect, padding) {
            const pad = Math.max(0, Number(padding || 0));
            return {
                x: Number(rect?.x || 0) - pad,
                y: Number(rect?.y || 0) - pad,
                w: Math.max(1, Number(rect?.w || 1) + pad * 2),
                h: Math.max(1, Number(rect?.h || 1) + pad * 2)
            };
        }

        function shouldDeferPanNodeRender(renderWindow) {
            if (!readValue('isPanning', false) || !renderWindow) return false;
            const visibleCount = countVisibleNodesForRenderWindow(renderWindow, panPreviewNodeBudget);
            if (visibleCount <= panPreviewNodeBudget) return false;
            const project = getProject();
            const zoom = Math.max(0.05, Number(project?.viewport?.zoom || 1) || 1);
            const pad = Math.max(nodeRenderOverscanPx, Math.ceil(panPreviewDeferCoveragePadPx / zoom));
            setNodeRenderCoverageRect(expandWorldRect(renderWindow, pad));
            return true;
        }

        return {
            invalidateNodeSpatialIndex,
            refreshNodeSpatialIndexRecord,
            queryNodeRecordsForRect,
            querySpatialNodeRecords,
            getMarqueeNodeRecords,
            findCanvasNodeAtWorldPoint,
            getVisibleNodeRecords,
            countVisibleNodesForRenderWindow,
            shouldDeferPanNodeRender
        };
    }

    window.SimpAICanvasWorkbenchNodeSpatialIndex = Object.assign({}, window.SimpAICanvasWorkbenchNodeSpatialIndex || {}, {
        createCanvasNodeSpatialIndexController
    });
})();
