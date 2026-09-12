(function () {
    'use strict';

    const RUNNABLE_TYPES = new Set(['preset', 'classic', 'wd14', 'vlm', 'translation', 'timeline', 'qwen_tts_voice_design', 'qwen_tts_voice_clone', 'qwen_tts_custom_voice', 'qwen_tts_dialogue']);
    const TERMINAL_STATES = new Set(['finished', 'failed', 'canceled', 'skipped']);

    function cloneSchedulerValue(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value ?? fallback));
        } catch (err) {
            return fallback;
        }
    }

    function schedulerTimestamp(options) {
        return typeof options?.nowIso === 'function' ? options.nowIso() : new Date().toISOString();
    }

    function buildSchedulerBlockedState(options) {
        const config = options || {};
        const plan = config.plan || {};
        const steps = Array.isArray(config.steps) ? config.steps : (Array.isArray(plan.steps) ? plan.steps : []);
        const startedAt = config.startedAt !== undefined ? config.startedAt : schedulerTimestamp(config);
        const updatedAt = config.updatedAt !== undefined ? config.updatedAt : schedulerTimestamp(config);
        const state = {
            state: 'blocked',
            mode: config.mode || plan.mode || 'selected',
            version: plan.version || 1,
            total: config.total ?? steps.length,
            index: config.index ?? 0,
            started_at: startedAt,
            updated_at: updatedAt,
            steps: cloneSchedulerValue(steps, []),
            warnings: cloneSchedulerValue(config.warnings ?? plan.warnings ?? [], []),
            cycles: cloneSchedulerValue(config.cycles ?? plan.cycles ?? [], []),
            error: config.error || ''
        };
        if (Object.prototype.hasOwnProperty.call(config, 'currentNodeId')) state.current_node_id = config.currentNodeId || '';
        if (Object.prototype.hasOwnProperty.call(config, 'currentTitle')) state.current_title = config.currentTitle || '';
        return state;
    }

    function buildSchedulerWaitingState(options) {
        const config = options || {};
        const plan = config.plan || {};
        const steps = Array.isArray(config.steps) ? config.steps : (Array.isArray(plan.steps) ? plan.steps : []);
        const startedAt = config.startedAt !== undefined ? config.startedAt : schedulerTimestamp(config);
        const updatedAt = config.updatedAt !== undefined ? config.updatedAt : schedulerTimestamp(config);
        return {
            state: 'waiting',
            mode: config.mode || plan.mode || 'selected',
            version: plan.version || 1,
            total: config.total ?? steps.length,
            index: config.index ?? 0,
            started_at: startedAt,
            updated_at: updatedAt,
            current_node_id: config.currentNodeId || '',
            current_title: config.currentTitle || '',
            waiting_source_ids: cloneSchedulerValue(config.waitingSourceIds || [], []),
            steps: cloneSchedulerValue(steps, []),
            warnings: cloneSchedulerValue(config.warnings ?? plan.warnings ?? [], []),
            error: config.error || ''
        };
    }

    function buildSchedulerRunningState(options) {
        const config = options || {};
        const plan = config.plan || {};
        const steps = Array.isArray(config.steps) ? config.steps : (Array.isArray(plan.steps) ? plan.steps : []);
        return {
            state: 'running',
            mode: config.mode || plan.mode || 'selected',
            version: plan.version || 1,
            total: config.total ?? steps.length,
            index: config.index ?? 0,
            started_at: config.startedAt !== undefined ? config.startedAt : schedulerTimestamp(config),
            steps: cloneSchedulerValue(steps, [])
        };
    }

    function buildSchedulerResetPatch(options) {
        return {
            state: 'idle',
            error: '',
            warnings: [],
            steps: [],
            current_node_id: '',
            current_title: '',
            updated_at: schedulerTimestamp(options || {})
        };
    }

    function buildSchedulerResumePatch(options) {
        return {
            state: 'idle',
            error: '',
            waiting_source_ids: [],
            updated_at: schedulerTimestamp(options || {})
        };
    }

    function buildSchedulerStepStartPatch(step, index, options) {
        return {
            state: 'running',
            index,
            current_node_id: step?.node_id || '',
            current_title: step?.title || '',
            updated_at: schedulerTimestamp(options || {})
        };
    }

    function buildSchedulerStepEndPatch(index, options) {
        return {
            index,
            updated_at: schedulerTimestamp(options || {})
        };
    }

    function buildSchedulerErrorPatch(step, error, options) {
        return {
            state: 'failed',
            failed_node_id: step?.node_id || '',
            error: error?.error || error?.message || String(error),
            updated_at: schedulerTimestamp(options || {})
        };
    }

    function buildSchedulerFinishedPatch(options) {
        return {
            state: 'finished',
            finished_at: schedulerTimestamp(options || {}),
            updated_at: schedulerTimestamp(options || {})
        };
    }

    function buildSchedulerStepStatePatch(step, options) {
        const config = options || {};
        const patch = {};
        if (Object.prototype.hasOwnProperty.call(config, 'state')) {
            patch.state = config.state;
        }
        if (Object.prototype.hasOwnProperty.call(config, 'error')) {
            patch.error = config.error?.error || config.error?.message || String(config.error ?? '');
        }
        if (Object.prototype.hasOwnProperty.call(config, 'result')) {
            patch.result = cloneSchedulerValue(config.result, null);
        }
        return patch;
    }

    function nodeLabel(node) {
        return node?.title || node?.preset?.name || node?.id || 'node';
    }

    function isIgnored(node) {
        return !!(node && (node.ignored || node.skip || node.flags?.ignored));
    }

    function isRunnable(node) {
        return !!(node && RUNNABLE_TYPES.has(node.type));
    }

    function hasUsableOutput(node) {
        if (!node) return false;
        if (['image', 'video', 'audio'].includes(node.type)) return !!node.asset;
        if (node.type === 'pose_studio') {
            const asset = node.asset || node.pose_studio?.output_asset || {};
            const mime = String(asset.mime || '').toLowerCase();
            const hasAsset = !!(asset.path || asset.output_path || asset.preview_url || asset.data_url || asset.thumb || asset.asset_id || asset.asset_relative_path || asset.relative_path);
            return hasAsset && (!mime || mime.startsWith('image/'));
        }
        if (node.type === 'gaussian_studio') {
            const asset = node.asset || node.gaussian_studio?.render_asset || node.gaussian_studio?.output_asset || {};
            const mime = String(asset.mime || '').toLowerCase();
            const hasAsset = !!(asset.path || asset.output_path || asset.preview_url || asset.data_url || asset.thumb || asset.asset_id || asset.asset_relative_path || asset.relative_path);
            return hasAsset && (!mime || mime.startsWith('image/'));
        }
        if (node.type === 'liveportrait_expression') {
            const asset = node.asset || node.liveportrait_expression?.output_asset || {};
            const mime = String(asset.mime || '').toLowerCase();
            const hasAsset = !!(asset.path || asset.output_path || asset.preview_url || asset.data_url || asset.thumb || asset.asset_id || asset.asset_relative_path || asset.relative_path);
            return hasAsset && (!mime || mime.startsWith('image/'));
        }
        if (node.type === 'result') {
            if (node.source?.stale || node.producer?.stale) return false;
            if (node.source?.refreshing || node.producer?.refreshing) return false;
            const state = String(node.status?.state || node.status || '').toLowerCase();
            if (['waiting', 'queued', 'running', 'rendering', 'task_ready', 'args_ready', 'dry_run_ready', 'cancelling', 'skipping'].includes(state)) return false;
            return !!(node.asset || (Array.isArray(node.assets) && node.assets.length));
        }
        if (node.type === 'text') return !!String(node.text?.value || node.params?.text || node.value || '').trim();
        if (node.type === 'style_selector') {
            const selector = node.style_selector || {};
            return !!String(selector.prompt || node.text?.value || '').trim();
        }
        if (['translation', 'tag_cart', 'wd14', 'vlm'].includes(node.type)) return !!String(node.text?.value || '').trim();
        if (node.type && String(node.type).startsWith('qwen_tts_')) {
            const state = String(node.status?.state || node.status || '').toLowerCase();
            return TERMINAL_STATES.has(state) && state === 'finished';
        }
        if (['preset', 'classic'].includes(node.type)) {
            const state = String(node.status?.state || node.status || '').toLowerCase();
            return TERMINAL_STATES.has(state) && state === 'finished';
        }
        return false;
    }

    function cloneNodes(project) {
        return Array.isArray(project?.nodes) ? project.nodes.slice() : [];
    }

    function cloneEdges(project) {
        return Array.isArray(project?.edges) ? project.edges.slice() : [];
    }

    function getNodeMap(project) {
        const map = new Map();
        cloneNodes(project).forEach(node => {
            if (node?.id) map.set(node.id, node);
        });
        return map;
    }

    function inputEdgesFor(nodeId, project) {
        return cloneEdges(project).filter(edge => edge && edge.to === nodeId);
    }

    function outputEdgesFor(nodeId, project) {
        return cloneEdges(project).filter(edge => edge && edge.from === nodeId);
    }

    function edgeLabel(edge) {
        const slot = edge?.slot || '';
        if (slot) return slot;
        return edge?.type || 'input';
    }

    function missingDetail(label, edge, source, reason) {
        return {
            label,
            slot: edge?.slot || '',
            edge_id: edge?.id || '',
            edge_type: edge?.type || '',
            source_node_id: source?.id || edge?.from || '',
            source_type: source?.type || '',
            reason: reason || 'missing'
        };
    }

    function missingReasonForSource(source) {
        if (!source) return 'source_missing';
        if (source.type === 'result' && (source.source?.stale || source.producer?.stale)) return 'source_stale';
        if (source.type === 'result' && (source.source?.refreshing || source.producer?.refreshing)) return 'source_refreshing';
        return 'source_not_ready';
    }

    function producerIdForResult(source, project) {
        if (!source || source.type !== 'result') return '';
        return source.producer?.preset_node_id
            || source.producer?.timeline_node_id
            || source.producer?.qwen_tts_node_id
            || inputEdgesFor(source.id, project).find(edge => edge.type === 'generate')?.from
            || '';
    }

    function implicitDependencyIds(node, project, wanted) {
        const nodeMap = getNodeMap(project);
        const deps = new Set();
        inputEdgesFor(node?.id, project).forEach(edge => {
            if (!edge?.from) return;
            const source = nodeMap.get(edge.from);
            const producerId = producerIdForResult(source, project);
            if (producerId && wanted.has(producerId)) {
                deps.add(producerId);
                return;
            }
            if (wanted.has(edge.from)) deps.add(edge.from);
        });
        return deps;
    }

    function expandSelectedBridgeIds(ids, project) {
        const nodeMap = getNodeMap(project);
        const expanded = new Set(ids || []);
        Array.from(expanded).forEach(id => {
            inputEdgesFor(id, project).forEach(edge => {
                const source = nodeMap.get(edge?.from);
                const producerId = producerIdForResult(source, project);
                if (source?.id && producerId && expanded.has(producerId)) expanded.add(source.id);
            });
        });
        return expanded;
    }

    function upstreamIds(startIds, project) {
        const seen = new Set();
        const visit = (id) => {
            inputEdgesFor(id, project).forEach(edge => {
                if (!edge.from || seen.has(edge.from)) return;
                seen.add(edge.from);
                visit(edge.from);
            });
        };
        startIds.forEach(visit);
        return seen;
    }

    function downstreamIds(startIds, project) {
        const seen = new Set();
        const visit = (id) => {
            outputEdgesFor(id, project).forEach(edge => {
                if (!edge.to || seen.has(edge.to)) return;
                seen.add(edge.to);
                visit(edge.to);
            });
        };
        startIds.forEach(visit);
        return seen;
    }

    function topoSort(ids, project) {
        const nodeMap = getNodeMap(project);
        const wanted = new Set(ids);
        const visited = new Set();
        const visiting = new Set();
        const ordered = [];
        const visit = (id) => {
            if (!wanted.has(id) || visited.has(id)) return;
            if (visiting.has(id)) return;
            visiting.add(id);
            inputEdgesFor(id, project).forEach(edge => {
                if (wanted.has(edge.from)) {
                    visit(edge.from);
                    return;
                }
                const source = nodeMap.get(edge.from);
                const producerId = producerIdForResult(source, project);
                if (producerId && wanted.has(producerId)) visit(producerId);
            });
            const node = nodeMap.get(id);
            implicitDependencyIds(node, project, wanted).forEach(depId => visit(depId));
            visiting.delete(id);
            visited.add(id);
            if (node) ordered.push(node);
        };
        Array.from(wanted).forEach(visit);
        return ordered;
    }

    function isPlannedResultSource(source, project, plannedIds) {
        if (!source || source.type !== 'result' || !plannedIds) return false;
        const producerId = producerIdForResult(source, project);
        return !!(producerId && plannedIds.has(producerId));
    }

    function isPlannedOutputSource(source, project, plannedIds) {
        if (!source || !plannedIds) return false;
        if (isPlannedResultSource(source, project, plannedIds)) return true;
        if (!plannedIds.has(source.id)) return false;
        return ['wd14', 'vlm', 'translation', 'timeline'].includes(source.type) || (source.type && String(source.type).startsWith('qwen_tts_'));
    }

    function missingInputsFor(node, project, plannedIds) {
        if (!node) return [missingDetail('Missing node', null, null, 'node_missing')];
        const nodeMap = getNodeMap(project);
        const missing = [];
        if (node.type === 'wd14') {
            const edge = inputEdgesFor(node.id, project).find(item => item.type === 'image' && item.slot === 'image');
            const source = nodeMap.get(node.input_node_id) || nodeMap.get(edge?.from);
            if (!hasUsableOutput(source) && !isPlannedOutputSource(source, project, plannedIds)) {
                missing.push(missingDetail('image input', edge, source, missingReasonForSource(source)));
            }
        }
        if (node.type === 'vlm') {
            const imageEdges = inputEdgesFor(node.id, project).filter(edge => edge.type === 'image');
            const hasImage = imageEdges.some(edge => {
                const source = nodeMap.get(edge.from);
                return hasUsableOutput(source) || isPlannedOutputSource(source, project, plannedIds);
            });
            if (!hasImage) {
                const edge = imageEdges[0] || null;
                missing.push(missingDetail('image input', edge, nodeMap.get(edge?.from), missingReasonForSource(nodeMap.get(edge?.from))));
            }
            if (!String(node.params?.prompt || '').trim()) missing.push(missingDetail('instruction', null, null, 'param_empty'));
        }
        if (node.type === 'translation') {
            const textEdge = inputEdgesFor(node.id, project).find(item => item.type === 'text');
            const source = nodeMap.get(textEdge?.from);
            const ownText = String(node.input_text || '').trim();
            if (!ownText && !hasUsableOutput(source) && !isPlannedOutputSource(source, project, plannedIds)) {
                missing.push(missingDetail('text input', textEdge, source, missingReasonForSource(source)));
            }
        }
        if (node.type === 'qwen_tts_voice_design') {
            if (!String(node.params?.text || '').trim()) missing.push(missingDetail('text to speech', null, null, 'param_empty'));
        }
        if (node.type === 'qwen_tts_custom_voice') {
            if (!String(node.params?.text || '').trim()) missing.push(missingDetail('text to speech', null, null, 'param_empty'));
            if (!String(node.params?.speaker || node.params?.custom_speaker_name || '').trim()) missing.push(missingDetail('speaker', null, null, 'param_empty'));
        }
        if (node.type === 'qwen_tts_voice_clone') {
            const edge = inputEdgesFor(node.id, project).find(item => item.type === 'media' && item.slot === 'ref_audio');
            const source = nodeMap.get(node.audio_inputs?.ref_audio) || nodeMap.get(edge?.from);
            if (!hasUsableOutput(source) && !isPlannedOutputSource(source, project, plannedIds)) {
                missing.push(missingDetail('reference audio', edge, source, missingReasonForSource(source)));
            }
            if (!String(node.params?.target_text || '').trim()) missing.push(missingDetail('target text', null, null, 'param_empty'));
        }
        if (node.type === 'qwen_tts_dialogue') {
            if (!String(node.params?.script || '').trim()) missing.push(missingDetail('script', null, null, 'param_empty'));
            inputEdgesFor(node.id, project)
                .filter(edge => edge.type === 'media' && String(edge.slot || '').startsWith('role_'))
                .forEach(edge => {
                    const source = nodeMap.get(edge.from);
                    if (!hasUsableOutput(source) && !isPlannedOutputSource(source, project, plannedIds)) {
                        missing.push(missingDetail(`${edge.slot} input`, edge, source, missingReasonForSource(source)));
                    }
                });
        }
        if (['preset', 'classic'].includes(node.type)) {
            inputEdgesFor(node.id, project)
                .filter(edge => edge.type === 'upload' || edge.type === 'text')
                .forEach(edge => {
                    const source = nodeMap.get(edge.from);
                    if (!source) {
                        missing.push(missingDetail(`${edgeLabel(edge)} input`, edge, source, 'source_missing'));
                    } else if (edge.type === 'upload' && !hasUsableOutput(source) && !isPlannedOutputSource(source, project, plannedIds)) {
                        missing.push(missingDetail(`${edge.slot || 'image'} input`, edge, source, missingReasonForSource(source)));
                    } else if (edge.type === 'text' && !hasUsableOutput(source) && !isPlannedOutputSource(source, project, plannedIds)) {
                        missing.push(missingDetail(`${edge.slot || 'text'} input`, edge, source, missingReasonForSource(source)));
                    }
                });
        }
        if (node.type === 'timeline') {
            const clips = Array.isArray(node.clips) ? node.clips : [];
            if (!clips.length) missing.push(missingDetail('media clips', null, null, 'no_clips'));
            clips.forEach((clip, index) => {
                const source = nodeMap.get(clip.source_node_id);
                if (!hasUsableOutput(source) && !isPlannedOutputSource(source, project, plannedIds)) {
                    missing.push({
                        label: `clip ${index + 1} source`,
                        slot: clip.id || '',
                        edge_id: inputEdgesFor(node.id, project).find(edge => edge.type === 'timeline' && edge.slot === clip.id)?.id || '',
                        edge_type: 'timeline',
                        source_node_id: source?.id || clip.source_node_id || '',
                        source_type: source?.type || '',
                        reason: missingReasonForSource(source)
                    });
                }
            });
        }
        return missing;
    }

    function detectCycles(ids, project) {
        const wanted = new Set(ids || []);
        const nodeMap = getNodeMap(project);
        const cycles = [];
        const visiting = new Set();
        const visited = new Set();
        const stack = [];
        const dependencyIds = (id) => {
            const node = nodeMap.get(id);
            const deps = new Set();
            inputEdgesFor(id, project).forEach(edge => {
                if (wanted.has(edge.from)) deps.add(edge.from);
                const source = nodeMap.get(edge.from);
                const producerId = producerIdForResult(source, project);
                if (producerId && wanted.has(producerId)) deps.add(producerId);
            });
            implicitDependencyIds(node, project, wanted).forEach(depId => deps.add(depId));
            return Array.from(deps).filter(depId => depId && depId !== id);
        };
        const visit = (id) => {
            if (!wanted.has(id) || visited.has(id)) return;
            if (visiting.has(id)) {
                const start = stack.indexOf(id);
                if (start >= 0) cycles.push(stack.slice(start).concat(id));
                return;
            }
            visiting.add(id);
            stack.push(id);
            dependencyIds(id).forEach(visit);
            stack.pop();
            visiting.delete(id);
            visited.add(id);
        };
        Array.from(wanted).forEach(visit);
        return cycles;
    }

    function buildPlan(project, options) {
        const opts = options || {};
        const nodeMap = getNodeMap(project);
        const startIds = (opts.nodeIds || []).filter(Boolean);
        const mode = opts.mode || 'selected';
        const seed = startIds.length ? startIds : cloneNodes(project).filter(node => node.selected).map(node => node.id);
        let ids = new Set(seed);
        if (mode === 'upstream' || mode === 'to-here') {
            ids = upstreamIds(seed, project);
            seed.forEach(id => ids.add(id));
        } else if (mode === 'downstream' || mode === 'from-here') {
            ids = downstreamIds(seed, project);
            seed.forEach(id => ids.add(id));
        } else if (mode === 'selected') {
            ids = new Set(seed);
        }
        ids = expandSelectedBridgeIds(ids, project);
        const steps = [];
        const skipped = [];
        const warnings = [];
        topoSort(ids, project).forEach(node => {
            if (!isRunnable(node)) return;
            if (isIgnored(node)) {
                skipped.push({ node_id: node.id, title: nodeLabel(node), reason: 'ignored' });
                return;
            }
            const missingDetails = missingInputsFor(node, project, ids);
            const missing = missingDetails.map(item => item.label || 'input');
            const step = {
                node_id: node.id,
                type: node.type,
                title: nodeLabel(node),
                dependencies: Array.from(implicitDependencyIds(node, project, ids)).filter(depId => depId !== node.id),
                auto_included: !seed.includes(node.id),
                missing_inputs: missing,
                missing_details: missingDetails,
                state: 'pending'
            };
            if (missing.length) warnings.push(`${nodeLabel(node)} missing ${missing.join(', ')}`);
            steps.push(step);
        });
        seed.forEach(id => {
            if (!nodeMap.has(id)) warnings.push(`Missing selected node: ${id}`);
        });
        const cycles = detectCycles(ids, project);
        cycles.forEach(cycle => {
            const titles = cycle.map(id => nodeLabel(nodeMap.get(id))).join(' -> ');
            warnings.push(`Cycle detected: ${titles}`);
        });
        return {
            ok: steps.length > 0 && !cycles.length,
            version: 2,
            mode,
            node_ids: Array.from(ids),
            steps,
            skipped,
            warnings,
            cycles
        };
    }

    async function runPlan(plan, handlers) {
        const h = handlers || {};
        if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) return { ok: false, error: 'empty plan' };
        if (typeof h.onStart === 'function') h.onStart(plan);
        for (let index = 0; index < plan.steps.length; index += 1) {
            const step = plan.steps[index];
            Object.assign(step, buildSchedulerStepStatePatch(step, { state: 'running' }));
            if (typeof h.onStepStart === 'function') h.onStepStart(step, index, plan);
            try {
                const result = await h.runNode(step.node_id, step, index, plan);
                if (result && result.ok === false) {
                    const error = result.error || result.message || 'step failed';
                    Object.assign(step, buildSchedulerStepStatePatch(step, { state: 'failed', error }));
                    if (typeof h.onStepEnd === 'function') h.onStepEnd(step, index, plan, result);
                    if (typeof h.onError === 'function') h.onError(step, result, plan);
                    return { ok: false, failed_step: step, error: step.error, plan };
                }
                Object.assign(step, buildSchedulerStepStatePatch(step, { state: 'finished', result: result || null }));
                if (typeof h.onStepEnd === 'function') h.onStepEnd(step, index, plan, result);
            } catch (err) {
                Object.assign(step, buildSchedulerStepStatePatch(step, { state: 'failed', error: err }));
                if (typeof h.onError === 'function') h.onError(step, err, plan);
                return { ok: false, failed_step: step, error: step.error, plan };
            }
        }
        if (typeof h.onFinish === 'function') h.onFinish(plan);
        return { ok: true, plan };
    }

    window.SimpAICanvasWorkbenchScheduler = {
        buildSchedulerBlockedState,
        buildSchedulerWaitingState,
        buildSchedulerRunningState,
        buildSchedulerResetPatch,
        buildSchedulerResumePatch,
        buildSchedulerStepStartPatch,
        buildSchedulerStepEndPatch,
        buildSchedulerErrorPatch,
        buildSchedulerFinishedPatch,
        buildSchedulerStepStatePatch,
        buildPlan,
        runPlan,
        isRunnable,
        hasUsableOutput
    };
})();
