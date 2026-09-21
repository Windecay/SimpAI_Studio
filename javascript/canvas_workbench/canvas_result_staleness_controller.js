(function () {
    'use strict';

    function createCanvasResultStalenessController(context) {
        const scope = context?.resultStalenessSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const fingerprintSource = scope.fingerprintSource || {};
        const resultSource = scope.resultSource || {};
        const patchSource = scope.patchSource || {};

        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = (id) => call(nodeSource, 'getNode', null, id);
        const resultNodeHasOutput = (node) => !!call(resultSource, 'resultNodeHasOutput', false, node);
        const buildResultStaleStatePatch = (...args) => call(
            patchSource,
            'buildResultStaleStatePatch',
            {},
            ...args
        );
        const buildResultFingerprintPatch = (...args) => call(
            patchSource,
            'buildResultFingerprintPatch',
            {},
            ...args
        );
        const computePresetRunFingerprint = (...args) => call(
            fingerprintSource,
            'computePresetRunFingerprint',
            '',
            ...args
        );
        const computeTimelineRunFingerprint = (...args) => call(
            fingerprintSource,
            'computeTimelineRunFingerprint',
            '',
            ...args
        );
        const computeQwenTtsRunFingerprint = (...args) => call(
            fingerprintSource,
            'computeQwenTtsRunFingerprint',
            '',
            ...args
        );

        function computeResultProducerFingerprint(node) {
            if (!node || node.type !== 'result') return '';
            const presetId = node.producer?.preset_node_id;
            const timelineId = node.producer?.timeline_node_id;
            const qwenTtsId = node.producer?.qwen_tts_node_id;
            if (presetId) return computePresetRunFingerprint(getNode(presetId));
            if (timelineId) return computeTimelineRunFingerprint(getNode(timelineId));
            if (qwenTtsId) return computeQwenTtsRunFingerprint(getNode(qwenTtsId));
            return '';
        }

        function setResultStaleState(node, stale, currentFingerprint) {
            Object.assign(node, buildResultStaleStatePatch(node, { stale, currentFingerprint }));
        }

        function isResultStale(node) {
            return !!(node && node.type === 'result' && (node.source?.stale || node.producer?.stale));
        }

        function isResultRefreshing(node) {
            return !!(node && node.type === 'result' && (node.source?.refreshing || node.producer?.refreshing));
        }

        function refreshResultStaleFlags() {
            const project = getProject();
            let changed = false;
            (project.nodes || []).filter(node => node.type === 'result').forEach((node) => {
                const currentFingerprint = computeResultProducerFingerprint(node);
                const storedFingerprint = node.source?.input_fingerprint || node.producer?.fingerprint || '';
                const hasOutput = resultNodeHasOutput(node);
                const shouldTrack = !!currentFingerprint && hasOutput;
                if (!shouldTrack) {
                    const wasStale = !!(node.source?.stale || node.producer?.stale);
                    if (wasStale) {
                        setResultStaleState(node, false, currentFingerprint);
                        changed = true;
                    }
                    return;
                }
                if (!storedFingerprint) {
                    Object.assign(node, buildResultFingerprintPatch(node, currentFingerprint));
                    changed = true;
                    return;
                }
                const stale = currentFingerprint !== storedFingerprint;
                if (stale !== !!(node.source?.stale || node.producer?.stale)
                    || node.source?.current_fingerprint !== currentFingerprint) {
                    setResultStaleState(node, stale, currentFingerprint);
                    changed = true;
                }
            });
            return changed;
        }

        return {
            computeResultProducerFingerprint,
            setResultStaleState,
            isResultStale,
            isResultRefreshing,
            refreshResultStaleFlags
        };
    }

    window.SimpAICanvasWorkbenchResultStaleness = Object.assign({}, window.SimpAICanvasWorkbenchResultStaleness || {}, {
        createCanvasResultStalenessController
    });
})();
