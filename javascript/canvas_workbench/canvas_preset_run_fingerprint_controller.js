(function () {
    'use strict';

    function createCanvasPresetRunFingerprintController(context) {
        const scope = context?.presetRunFingerprintSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const presetSource = scope.presetSource || {};
        const assetSource = scope.assetSource || {};
        const fingerprintSource = scope.fingerprintSource || {};
        const serializationSource = scope.serializationSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const isNodeIgnored = (...args) => !!call(nodeSource, 'isNodeIgnored', false, ...args);
        const getPresetUploadRunEdges = (...args) => call(presetSource, 'getPresetUploadRunEdges', [], ...args) || [];
        const serializeClassicNodeForRun = (...args) => call(presetSource, 'serializeClassicNodeForRun', null, ...args);
        const serializePresetForRun = (...args) => call(presetSource, 'serializePresetForRun', null, ...args);
        const serializeAssetSourceForRun = (...args) => call(assetSource, 'serializeAssetSourceForRun', null, ...args);
        const stableStringify = value => call(fingerprintSource, 'stableStringify', JSON.stringify(value), value);
        const stableHash = (value) => call(fingerprintSource, 'stableHash', '', value);
        const cloneRunValue = (value, fallback) => call(
            serializationSource,
            'cloneRunValue',
            fallback,
            value,
            fallback
        );

        function serializeAssetSourceForFingerprint(node) {
            const next = serializeAssetSourceForRun(node);
            if (!next) return null;
            if (next.source && typeof next.source === 'object') {
                next.source = {
                    kind: next.source.kind || '',
                    output_path: next.source.output_path || '',
                    source_node_id: next.source.source_node_id || '',
                    timeline_node_id: next.source.timeline_node_id || '',
                    input_fingerprint: next.source.input_fingerprint || node?.producer?.fingerprint || ''
                };
            }
            return next;
        }

        function normalizeRunEdgesForFingerprint(edges) {
            return cloneRunValue(edges || [], [])
                .map(edge => ({
                    type: edge.type || '',
                    from: edge.from || '',
                    to: edge.to || '',
                    slot: edge.slot || '',
                    config_kind: edge.config_kind || ''
                }))
                .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
        }

        function buildPresetAssetSourcesFromUploadEdges(uploadEdges) {
            const assetSources = {};
            (Array.isArray(uploadEdges) ? uploadEdges : []).forEach((edge) => {
                const source = getNode(edge?.from);
                if (source && edge?.slot) {
                    assetSources[edge.slot] = serializeAssetSourceForFingerprint(source);
                }
            });
            return assetSources;
        }

        function buildPresetRunFingerprintPayload(presetNode) {
            if (!presetNode) return null;
            const project = getProject();
            const edges = Array.isArray(project.edges) ? project.edges : [];
            const uploadEdges = getPresetUploadRunEdges(presetNode);
            const configEdges = edges.filter(edge => (
                edge.type === 'config'
                && edge.to === presetNode.id
                && !isNodeIgnored(getNode(edge.from))
            ));
            const textEdges = edges.filter(edge => (
                edge.type === 'text'
                && edge.to === presetNode.id
                && !isNodeIgnored(getNode(edge.from))
            ));
            const assetSources = buildPresetAssetSourcesFromUploadEdges(uploadEdges);
            const presetNodePayload = presetNode.type === 'classic'
                ? serializeClassicNodeForRun(presetNode)
                : serializePresetForRun(presetNode);
            if (!presetNodePayload) return null;
            presetNodePayload.upload_slot_sources = cloneRunValue(assetSources, {});
            return {
                schema: 'simpai.canvas.run_fingerprint.v1',
                producer_node_id: presetNode.id,
                producer_type: presetNode.type,
                preset_node: presetNodePayload,
                upload_edges: normalizeRunEdgesForFingerprint(uploadEdges),
                config_edges: normalizeRunEdgesForFingerprint(configEdges),
                text_edges: normalizeRunEdgesForFingerprint(textEdges),
                asset_sources: assetSources
            };
        }

        function computePresetRunFingerprint(presetNode) {
            const payload = buildPresetRunFingerprintPayload(presetNode);
            return payload ? stableHash(payload) : '';
        }

        return {
            serializeAssetSourceForFingerprint,
            normalizeRunEdgesForFingerprint,
            buildPresetRunFingerprintPayload,
            computePresetRunFingerprint
        };
    }

    window.SimpAICanvasWorkbenchPresetRunFingerprint = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPresetRunFingerprint || {},
        { createCanvasPresetRunFingerprintController }
    );
})();
