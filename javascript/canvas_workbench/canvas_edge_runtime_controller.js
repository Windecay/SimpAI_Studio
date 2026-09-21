(function () {
    'use strict';

    function sourceCall(source, name, fallback, ...args) {
        return typeof source?.[name] === 'function' ? source[name](...args) : fallback;
    }

    function sourceValue(source, name, fallback, ...args) {
        const value = source?.[name];
        if (typeof value === 'function') return value(...args);
        return value === undefined ? fallback : value;
    }

    function createCanvasEdgeRuntimeController(source) {
        const scope = source?.edgeRuntimeSource || source || {};
        const domSource = scope.domSource || {};
        const projectSource = scope.projectSource || {};
        const interactionSource = scope.interactionSource || {};
        const timingSource = scope.timingSource || {};
        const configSource = scope.configSource || {};
        const renderSource = scope.renderSource || {};

        let edgeIncidentIndex = null;
        let edgeIncidentIndexWarmupTimer = 0;
        let svgFallbackUntil = 0;
        let svgFallbackLock = 0;

        const getProject = () => sourceCall(projectSource, 'getProject', {}) || {};
        const getRoot = () => sourceCall(domSource, 'getRoot', null);
        const getEdgesCanvas = () => sourceCall(domSource, 'getEdgesCanvas', null);
        const isPanning = () => !!sourceCall(interactionSource, 'isPanning', false);
        const performanceNow = () => Number(sourceCall(timingSource, 'performanceNow', 0)) || 0;
        const setTimeoutSource = (...args) => sourceCall(timingSource, 'setTimeout', undefined, ...args);
        const clearTimeoutSource = (...args) => sourceCall(timingSource, 'clearTimeout', undefined, ...args);
        const renderEdges = (...args) => sourceCall(renderSource, 'renderEdges', undefined, ...args);
        const incidentIndexMinEdges = () => Math.max(
            0,
            Number(sourceValue(configSource, 'edgeIncidentIndexMinEdges', 900)) || 0
        );

        function buildEdgeIncidentIndex() {
            const edges = Array.isArray(getProject().edges) ? getProject().edges : [];
            const byNodeId = new Map();
            edges.forEach((edge, order) => {
                if (!edge || !edge.id) return;
                const record = { edge, order };
                [edge.from, edge.to].filter(Boolean).forEach((nodeId) => {
                    if (!byNodeId.has(nodeId)) byNodeId.set(nodeId, []);
                    byNodeId.get(nodeId).push(record);
                });
            });
            return { edgeRef: edges, edgeCount: edges.length, byNodeId };
        }

        function getEdgeIncidentIndex() {
            const edges = Array.isArray(getProject().edges) ? getProject().edges : [];
            if (edges.length < incidentIndexMinEdges()) return null;
            if (!edgeIncidentIndex || edgeIncidentIndex.edgeRef !== edges || edgeIncidentIndex.edgeCount !== edges.length) {
                edgeIncidentIndex = buildEdgeIncidentIndex();
            }
            return edgeIncidentIndex;
        }

        function getIncidentEdgeRecordsForNodeIds(idSet) {
            const index = getEdgeIncidentIndex();
            const edges = Array.isArray(getProject().edges) ? getProject().edges : [];
            if (!index || !idSet?.size) {
                return {
                    indexed: false,
                    records: edges.map((edge, order) => ({ edge, order }))
                };
            }
            const recordsByOrder = new Map();
            idSet.forEach((nodeId) => {
                (index.byNodeId.get(nodeId) || []).forEach((record) => {
                    recordsByOrder.set(record.order, record);
                });
            });
            const records = Array.from(recordsByOrder.values()).sort((a, b) => a.order - b.order);
            return { indexed: true, records };
        }

        function cancelEdgeIncidentIndexWarmup() {
            if (!edgeIncidentIndexWarmupTimer) return;
            clearTimeoutSource(edgeIncidentIndexWarmupTimer);
            edgeIncidentIndexWarmupTimer = 0;
        }

        function scheduleEdgeIncidentIndexWarmup() {
            const edges = Array.isArray(getProject().edges) ? getProject().edges : [];
            if (edges.length < incidentIndexMinEdges() || edgeIncidentIndexWarmupTimer) return;
            edgeIncidentIndexWarmupTimer = setTimeoutSource(() => {
                edgeIncidentIndexWarmupTimer = 0;
                const root = getRoot();
                if (!root || root.hidden) return;
                getEdgeIncidentIndex();
            }, 80);
        }

        function setEdgeIncidentIndex(value) {
            edgeIncidentIndex = value || null;
        }

        function shouldUseCanvasEdgeRendering() {
            const edgesCanvas = getEdgesCanvas();
            const project = getProject();
            return !!edgesCanvas
                && project.settings?.canvasEdges !== false
                && svgFallbackLock <= 0
                && !isPanning()
                && performanceNow() >= svgFallbackUntil
                && !project.settings?.edgeLabels
                && typeof edgesCanvas.getContext === 'function';
        }

        function preferSvgEdgesForViewportInteraction(durationMs) {
            const duration = Number(durationMs || 600);
            svgFallbackUntil = Math.max(svgFallbackUntil, performanceNow() + duration);
        }

        function renderEdgesWithSvgFallback() {
            svgFallbackLock += 1;
            try {
                renderEdges();
            } finally {
                svgFallbackLock = Math.max(0, svgFallbackLock - 1);
            }
        }

        function renderEdgesWithCanvasPreferred() {
            const fallbackUntil = svgFallbackUntil;
            const fallbackLock = svgFallbackLock;
            svgFallbackUntil = 0;
            svgFallbackLock = 0;
            try {
                renderEdges();
            } finally {
                svgFallbackUntil = fallbackUntil;
                svgFallbackLock = fallbackLock;
            }
        }

        return {
            buildEdgeIncidentIndex,
            getEdgeIncidentIndex,
            getIncidentEdgeRecordsForNodeIds,
            cancelEdgeIncidentIndexWarmup,
            scheduleEdgeIncidentIndexWarmup,
            setEdgeIncidentIndex,
            shouldUseCanvasEdgeRendering,
            preferSvgEdgesForViewportInteraction,
            renderEdgesWithSvgFallback,
            renderEdgesWithCanvasPreferred,
            getSvgFallbackUntil: () => svgFallbackUntil,
            getSvgFallbackLock: () => svgFallbackLock,
            isSvgFallbackActive: () => performanceNow() < svgFallbackUntil
        };
    }

    window.SimpAICanvasWorkbenchEdgeRuntime = Object.assign(
        {},
        window.SimpAICanvasWorkbenchEdgeRuntime || {},
        { createCanvasEdgeRuntimeController }
    );
})();
