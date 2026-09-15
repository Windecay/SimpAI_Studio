(function () {
    'use strict';

    function createVlmAgentContext(source) {
        const scope = source || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const projectSource = sourceObject('projectSource');
        const projectCall = (name, fallback, ...args) => typeof projectSource[name] === 'function'
            ? projectSource[name](...args)
            : fallback;
        const selectionSource = sourceObject('selectionSource');
        const selectionCall = (name, fallback, ...args) => typeof selectionSource[name] === 'function'
            ? selectionSource[name](...args)
            : fallback;
        const nodeSource = sourceObject('nodeSource');
        const nodeCall = (name, fallback, ...args) => typeof nodeSource[name] === 'function'
            ? nodeSource[name](...args)
            : fallback;
        const statusSource = sourceObject('statusSource');
        const statusCall = (name, fallback, ...args) => typeof statusSource[name] === 'function'
            ? statusSource[name](...args)
            : fallback;
        const promptSource = sourceObject('promptSource');
        const promptCall = (name, fallback, ...args) => typeof promptSource[name] === 'function'
            ? promptSource[name](...args)
            : fallback;
        const languageSource = sourceObject('languageSource');
        const languageCall = (name, fallback, ...args) => typeof languageSource[name] === 'function'
            ? languageSource[name](...args)
            : fallback;
        const actionSource = sourceObject('actionSource');
        const actionCall = (name, fallback, ...args) => typeof actionSource[name] === 'function'
            ? actionSource[name](...args)
            : fallback;
        const getDefaultProjectId = () => String(projectCall('getDefaultProjectId', '') || '').trim();
        const t = (...args) => languageCall('t', args[0] || '', ...args);
        const getVlmAgentActionTargetId = (...args) => String(actionCall('getVlmAgentActionTargetId', '', ...args) || '').trim();

        function selectedNodeIds() {
            const value = selectionCall('getSelectedNodeIds', null);
            if (Array.isArray(value)) return value.slice();
            if (value && typeof value !== 'string' && typeof value[Symbol.iterator] === 'function') return Array.from(value);
            const selectedId = String(selectionCall('getSelectedNodeId', '') || '').trim();
            return selectedId ? [selectedId] : [];
        }

        function summarizeNode(node) {
            return nodeCall('summarizeVlmAgentNode', summarizeVlmAgentNode(node), node) || {};
        }

        function isQwenTtsNode(node) {
            return !!nodeCall('isQwenTtsNode', String(node?.type || '').startsWith('qwen_tts_'), node);
        }

        function summarizeVlmAgentNode(node) {
            const title = String(node?.title || node?.type || '').trim();
            const base = {
                id: node?.id || '',
                type: node?.type || '',
                title: title || node?.id || '',
                x: Math.round(Number(node?.x || 0)),
                y: Math.round(Number(node?.y || 0)),
                ignored: !!node?.ignored,
                locked: !!node?.locked
            };
            if (node?.type === 'text' || node?.type === 'note') {
                const value = node.type === 'text' ? node.text?.value : node.text;
                base.text_preview = String(value || '').slice(0, 240);
            } else if (node?.type === 'preset') {
                base.preset = node.preset?.name || node.title || '';
            } else if (node?.type === 'classic') {
                base.workflow = 'CLASSIC';
                base.prompt_preview = String(node.prompt || node.params?.prompt || '').slice(0, 240);
            } else if (node?.type === 'result') {
                base.asset_count = Array.isArray(node.assets) ? node.assets.length : (node.asset ? 1 : 0);
                base.status = node.status?.state || node.producer?.state || '';
            } else if (isQwenTtsNode(node)) {
                base.mode = node.qwen_tts_mode || '';
                base.status = node.status?.state || '';
            } else if (node?.type === 'vlm') {
                base.mode = node.params?.mode || 'single';
                base.model = node.params?.version || '';
            } else if (node?.type === 'timeline') {
                base.clip_count = Array.isArray(node.clips) ? node.clips.length : 0;
            }
            return base;
        }

        function nodeStatusState(node) {
            return String(statusCall(
                'nodeStatusState',
                node?.status?.state || node?.producer?.state || '',
                node
            ) || '').toLowerCase();
        }

        function isCanvasRunActiveState(state) {
            return !!statusCall(
                'isCanvasRunActiveState',
                ['queued', 'running', 'waiting', 'task_ready', 'args_ready', 'dry_run_ready', 'cancelling', 'skipping']
                    .includes(String(state || '').toLowerCase()),
                state
            );
        }

        function isTerminalRunState(state) {
            return !!statusCall(
                'isTerminalRunState',
                ['finished', 'failed', 'canceled', 'skipped'].includes(String(state || '').toLowerCase()),
                state
            );
        }

        function cloneValue(value) {
            let fallback = value;
            if (value && typeof value === 'object') {
                try {
                    fallback = JSON.parse(JSON.stringify(value));
                } catch (err) {
                    fallback = value;
                }
            }
            return statusCall('cloneRunValue', fallback, value, {});
        }

        function classifyVlmAgentToolStatus(state, run, resultNode) {
            const normalized = String(state || '').toLowerCase();
            const outputCount = Number(run?.output_count ?? (Array.isArray(resultNode?.assets) ? resultNode.assets.length : (resultNode?.asset ? 1 : 0)) ?? 0);
            const userCancel = String(run?.user_cancel_action || run?.last_response?.user_cancel_action || '').toLowerCase();
            if (['queued', 'waiting', 'task_ready', 'args_ready', 'dry_run_ready'].includes(normalized)) return 'pending';
            if (normalized === 'running') return 'running';
            if (['cancelling', 'skipping'].includes(normalized)) return 'user_interrupt_pending';
            if (normalized === 'finished' && outputCount > 0) return 'succeeded';
            if (normalized === 'finished') return 'finished_without_output';
            if (normalized === 'failed') return 'failed';
            if (normalized === 'canceled' || userCancel === 'stop') return 'user_stopped';
            if (normalized === 'skipped' || userCancel === 'skip') return 'user_skipped';
            if (isCanvasRunActiveState(normalized)) return 'running';
            if (isTerminalRunState(normalized)) return 'terminal';
            return normalized || 'unknown';
        }

        function summarizeVlmAgentRun(run) {
            if (!run || typeof run !== 'object') return null;
            const resultNode = nodeCall('getNode', null, run.placeholder_node_id);
            const state = String(run.state || nodeStatusState(resultNode) || '').toLowerCase();
            return {
                run_id: run.id || run.run_id || '',
                task_id: run.task_id || '',
                preset_node_id: run.preset_node_id || run.qwen_tts_node_id || resultNode?.producer?.preset_node_id || resultNode?.producer?.qwen_tts_node_id || '',
                result_node_id: run.placeholder_node_id || resultNode?.id || '',
                state,
                status_kind: classifyVlmAgentToolStatus(state, run, resultNode),
                active: isCanvasRunActiveState(state),
                terminal: isTerminalRunState(state),
                percent: Number(run.percent || resultNode?.status?.percent || 0),
                output_count: Number(run.output_count ?? (Array.isArray(resultNode?.assets) ? resultNode.assets.length : (resultNode?.asset ? 1 : 0)) ?? 0),
                message: String(run.message || resultNode?.status?.message || '').slice(0, 300),
                error: String(run.error || resultNode?.error_details?.error || '').slice(0, 300),
                user_cancel_action: String(run.user_cancel_action || run.last_response?.user_cancel_action || ''),
                created_at: run.created_at || run.backend_created_at || '',
                updated_at: run.updated_at || '',
                finished_at: run.finished_at || '',
                last_event: Array.isArray(run.events) && run.events.length ? cloneValue(run.events[run.events.length - 1]) : null
            };
        }

        function summarizeVlmAgentResultStatus(node) {
            if (!node || node.type !== 'result') return null;
            const project = projectCall('getProject', {}) || {};
            const run = (Array.isArray(project.runs) ? project.runs : []).find(item => item.id && item.id === node.producer?.run_id);
            const state = String(run?.state || nodeStatusState(node) || '').toLowerCase();
            return {
                node_id: node.id,
                title: node.title || '',
                producer_node_id: node.producer?.preset_node_id || node.producer?.timeline_node_id || node.producer?.qwen_tts_node_id || '',
                run_id: node.producer?.run_id || run?.id || '',
                state,
                status_kind: classifyVlmAgentToolStatus(state, run, node),
                active: isCanvasRunActiveState(state) || !!node.source?.refreshing || !!node.producer?.refreshing,
                terminal: isTerminalRunState(state),
                output_count: Array.isArray(node.assets) ? node.assets.length : (node.asset ? 1 : 0),
                has_preview: !!node.preview,
                stale: !!node.source?.stale || !!node.producer?.stale,
                refreshing: !!node.source?.refreshing || !!node.producer?.refreshing,
                message: String(node.status?.message || '').slice(0, 300),
                error: String(node.error_details?.error || '').slice(0, 300)
            };
        }

        function buildVlmAgentToolStatus() {
            const project = projectCall('getProject', {}) || {};
            const runs = (Array.isArray(project.runs) ? project.runs : [])
                .slice()
                .sort((a, b) => (parseDate(b.updated_at || b.created_at || '') || 0) - (parseDate(a.updated_at || a.created_at || '') || 0))
                .slice(0, 20)
                .map(summarizeVlmAgentRun)
                .filter(Boolean);
            const resultStatuses = (Array.isArray(project.nodes) ? project.nodes : [])
                .filter(item => item?.type === 'result')
                .map(summarizeVlmAgentResultStatus)
                .filter(Boolean)
                .filter(item => item.active || item.terminal || item.stale || item.error)
                .slice(0, 30);
            return {
                terminal_states: ['finished', 'failed', 'canceled', 'skipped'],
                active_states: ['queued', 'running', 'waiting', 'task_ready', 'args_ready', 'dry_run_ready', 'cancelling', 'skipping'],
                status_kinds: ['pending', 'running', 'user_interrupt_pending', 'succeeded', 'finished_without_output', 'failed', 'user_stopped', 'user_skipped', 'unknown'],
                scheduler: project.scheduler ? cloneValue({
                    state: project.scheduler.state || '',
                    mode: project.scheduler.mode || '',
                    current_node_id: project.scheduler.current_node_id || '',
                    current_title: project.scheduler.current_title || '',
                    error: project.scheduler.error || '',
                    waiting_source_ids: project.scheduler.waiting_source_ids || [],
                    updated_at: project.scheduler.updated_at || ''
                }) : null,
                runs,
                results: resultStatuses
            };
        }

        function latestVlmAgentRunForTarget(targetId) {
            const project = projectCall('getProject', {}) || {};
            const runs = Array.isArray(project.runs) ? project.runs : [];
            const target = nodeCall('getNode', null, targetId);
            const runId = target?.producer?.run_id || targetId || '';
            return runs.find(item => item.id === runId || item.run_id === runId)
                || runs.find(item => item.placeholder_node_id === targetId || item.preset_node_id === targetId || item.qwen_tts_node_id === targetId || item.producer_node_id === targetId)
                || runs.slice().sort((a, b) => (parseDate(b.updated_at || b.created_at || '') || 0) - (parseDate(a.updated_at || a.created_at || '') || 0))[0]
                || null;
        }

        function describeVlmAgentToolStatus(action) {
            const targetId = getVlmAgentActionTargetId(action);
            const target = nodeCall('getNode', null, targetId);
            const run = latestVlmAgentRunForTarget(targetId);
            const resultNode = target?.type === 'result' ? target : nodeCall('getNode', null, run?.placeholder_node_id);
            const state = String(run?.state || nodeStatusState(resultNode || target) || '').toLowerCase();
            const statusKind = classifyVlmAgentToolStatus(state, run, resultNode);
            const outputCount = Number(run?.output_count ?? (Array.isArray(resultNode?.assets) ? resultNode.assets.length : (resultNode?.asset ? 1 : 0)) ?? 0);
            const title = target?.title || resultNode?.title || run?.placeholder_node_id || run?.preset_node_id || targetId || t('latest run', '最近任务');
            const detail = run?.message || resultNode?.status?.message || run?.error || resultNode?.error_details?.error || '';
            const labels = {
                pending: t('waiting or preflight-ready', '等待或预检中'),
                running: t('running', '正在运行'),
                user_interrupt_pending: t('user interruption requested', '用户已请求中断，等待后端确认'),
                succeeded: t('succeeded', '已成功'),
                finished_without_output: t('finished without output', '已结束但无输出'),
                failed: t('failed', '错误中断'),
                user_stopped: t('stopped by user', '用户手动停止'),
                user_skipped: t('skipped by user', '用户手动跳过'),
                terminal: t('terminal', '已结束'),
                unknown: t('unknown', '未知')
            };
            const message = `${title}: ${labels[statusKind] || statusKind || labels.unknown}${outputCount ? `, ${outputCount} output(s)` : ''}${detail ? ` · ${detail}` : ''}`;
            return { ok: !!(run || target), message, target_id: target?.id || resultNode?.id || '', status_kind: statusKind };
        }

        function findVlmAgentBrokenEdges() {
            const project = projectCall('getProject', {}) || {};
            const edges = Array.isArray(project.edges) ? project.edges : [];
            const broken = edges
                .filter(edge => !nodeCall('getNode', null, edge.from) || !nodeCall('getNode', null, edge.to))
                .map(edge => `${edge.id || 'edge'} ${edge.type || ''}: ${edge.from || '?'} -> ${edge.to || '?'}${edge.slot ? ` (${edge.slot})` : ''}`);
            if (!broken.length) return { ok: true, message: t('No broken edges found.', '未发现断开的连线') };
            return {
                ok: true,
                message: t('Broken edges found: {items}', '发现断开的连线：{items}').replace('{items}', broken.slice(0, 4).join('; ') + (broken.length > 4 ? `; +${broken.length - 4}` : ''))
            };
        }

        function buildVlmAgentContext(node, options) {
            const opts = options || {};
            const project = projectCall('getProject', {}) || {};
            const nodes = Array.isArray(project.nodes) ? project.nodes : [];
            const edges = Array.isArray(project.edges) ? project.edges : [];
            const instructionPrompt = String(opts.userPrompt || opts.prompt || opts.instruction || '').trim();
            const instructionOverrideEntry = promptCall('findCanvasAgentPresetInstructionOverride', null, instructionPrompt);
            const instructionPresetName = String(promptCall(
                'normalizePresetName',
                String(instructionOverrideEntry?.name || instructionOverrideEntry?.display_name || ''),
                instructionOverrideEntry?.name || instructionOverrideEntry?.display_name || ''
            ) || '').trim();
            const selectedIds = selectedNodeIds();
            const selectedSet = new Set(selectedIds);
            const connectedIds = new Set([node?.id || '']);
            const textToImageTarget = promptCall('canvasAgentPromptTargetFromPurpose', {}, 'text-to-image', { presetName: instructionPresetName }) || {};
            const imageEditTarget = promptCall('canvasAgentPromptTargetFromPurpose', {}, 'image edit', { presetName: instructionPresetName }) || {};
            const withInstructionPresetOverride = (target) => Object.assign({}, target || {}, instructionPresetName ? {
                preset_instruction_override: true,
                instruction_preset: instructionPresetName,
                instruction_override_source: 'user_prompt'
            } : {}, {
                instruction: promptCall('canvasAgentPromptTargetInstruction', '', target),
                context_line: promptCall('canvasAgentPromptTargetContextLine', '', target)
            });

            edges.forEach((edge) => {
                if (edge.from === node?.id) connectedIds.add(edge.to);
                if (edge.to === node?.id) connectedIds.add(edge.from);
                if (selectedSet.has(edge.from)) connectedIds.add(edge.to);
                if (selectedSet.has(edge.to)) connectedIds.add(edge.from);
            });
            const selectedNodes = selectedIds.map((id) => nodeCall('getNode', null, id)).filter(Boolean).map(summarizeNode);
            const nearbyNodes = nodes
                .filter(item => item && item.id !== node?.id && (connectedIds.has(item.id) || selectedSet.has(item.id)))
                .slice(0, 24)
                .map(summarizeNode);
            const nodeTypes = {};
            nodes.forEach((item) => {
                const key = item?.type || 'unknown';
                nodeTypes[key] = (nodeTypes[key] || 0) + 1;
            });
            const brokenEdges = edges
                .filter(edge => !nodeCall('getNode', null, edge.from) || !nodeCall('getNode', null, edge.to))
                .slice(0, 20)
                .map(edge => ({ id: edge.id, type: edge.type, from: edge.from, to: edge.to, slot: edge.slot || '' }));
            const groups = projectCall('ensureProjectGroups', [],);
            return {
                project_id: project.id || getDefaultProjectId(),
                project_title: project.title || '',
                stage: {
                    __lang: languageCall('runtimeUiLang', 'en')
                },
                current_node_id: node?.id || '',
                selected_node_ids: selectedIds.slice(0, 20),
                totals: {
                    nodes: nodes.length,
                    edges: edges.length,
                    groups: Array.isArray(groups) ? groups.length : 0
                },
                node_types: nodeTypes,
                prompt_generation_targets: {
                    text_to_image: withInstructionPresetOverride(textToImageTarget),
                    image_edit: withInstructionPresetOverride(imageEditTarget)
                },
                preset_instruction_override: instructionPresetName ? {
                    enabled: true,
                    preset: instructionPresetName,
                    source: 'user_prompt'
                } : null,
                selected_nodes: selectedNodes,
                related_nodes: nearbyNodes,
                edges: edges.slice(0, 80).map(edge => ({
                    id: edge.id,
                    type: edge.type,
                    from: edge.from,
                    to: edge.to,
                    slot: edge.slot || ''
                })),
                broken_edges: brokenEdges,
                tool_status: statusCall('buildVlmAgentToolStatus', buildVlmAgentToolStatus())
            };
        }

        return {
            buildVlmAgentContext,
            buildVlmAgentToolStatus,
            latestVlmAgentRunForTarget,
            describeVlmAgentToolStatus,
            findVlmAgentBrokenEdges
        };
    }

    function createCanvasVlmChatController(context) {
        const scope = context || {};
        const agentContextSource = scope.agentContextSource && typeof scope.agentContextSource === 'object'
            ? scope.agentContextSource
            : {};
        const agentContextCall = (name, fallback, ...args) => typeof agentContextSource[name] === 'function'
            ? agentContextSource[name](...args)
            : fallback;
        const generationSource = scope.generationSource && typeof scope.generationSource === 'object'
            ? scope.generationSource
            : {};
        const generationCall = (name, fallback, ...args) => typeof generationSource[name] === 'function'
            ? generationSource[name](...args)
            : fallback;
        const promptSource = scope.promptSource && typeof scope.promptSource === 'object'
            ? scope.promptSource
            : {};
        const promptCall = (name, fallback, ...args) => typeof promptSource[name] === 'function'
            ? promptSource[name](...args)
            : fallback;
        const agentActionSource = scope.agentActionSource && typeof scope.agentActionSource === 'object'
            ? scope.agentActionSource
            : {};
        const agentActionCall = (name, fallback, ...args) => typeof agentActionSource[name] === 'function'
            ? agentActionSource[name](...args)
            : fallback;
        const transportSource = scope.transportSource && typeof scope.transportSource === 'object'
            ? scope.transportSource
            : {};
        const transportCall = (name, fallback, ...args) => typeof transportSource[name] === 'function'
            ? transportSource[name](...args)
            : fallback;
        const customApiSource = scope.customApiSource && typeof scope.customApiSource === 'object'
            ? scope.customApiSource
            : {};
        const customApiCall = (name, fallback, ...args) => typeof customApiSource[name] === 'function'
            ? customApiSource[name](...args)
            : fallback;
        const schedulerSource = scope.schedulerSource && typeof scope.schedulerSource === 'object'
            ? scope.schedulerSource
            : {};
        const schedulerCall = (name, fallback, ...args) => typeof schedulerSource[name] === 'function'
            ? schedulerSource[name](...args)
            : fallback;
        const wildcardSource = scope.wildcardSource && typeof scope.wildcardSource === 'object'
            ? scope.wildcardSource
            : {};
        const wildcardCall = (name, fallback, ...args) => typeof wildcardSource[name] === 'function'
            ? wildcardSource[name](...args)
            : fallback;
        const uiSource = scope.uiSource && typeof scope.uiSource === 'object'
            ? scope.uiSource
            : {};
        const uiCall = (name, fallback, ...args) => typeof uiSource[name] === 'function'
            ? uiSource[name](...args)
            : fallback;
        const renderSource = scope.renderSource && typeof scope.renderSource === 'object'
            ? scope.renderSource
            : {};
        const renderCall = (name, fallback, ...args) => typeof renderSource[name] === 'function'
            ? renderSource[name](...args)
            : fallback;
        const nodeSource = scope.nodeSource && typeof scope.nodeSource === 'object'
            ? scope.nodeSource
            : {};
        const nodeCall = (name, fallback, ...args) => typeof nodeSource[name] === 'function'
            ? nodeSource[name](...args)
            : fallback;
        const configSource = scope.configSource && typeof scope.configSource === 'object'
            ? scope.configSource
            : {};
        const configCall = (name, fallback, ...args) => typeof configSource[name] === 'function'
            ? configSource[name](...args)
            : fallback;
        const modelStatusSource = scope.modelStatusSource && typeof scope.modelStatusSource === 'object'
            ? scope.modelStatusSource
            : {};
        const modelStatusCall = (name, fallback, ...args) => typeof modelStatusSource[name] === 'function'
            ? modelStatusSource[name](...args)
            : fallback;
        const agentSettingsSource = scope.agentSettingsSource && typeof scope.agentSettingsSource === 'object'
            ? scope.agentSettingsSource
            : {};
        const agentSettingsCall = (name, fallback, ...args) => typeof agentSettingsSource[name] === 'function'
            ? agentSettingsSource[name](...args)
            : fallback;
        const assetSource = scope.assetSource && typeof scope.assetSource === 'object'
            ? scope.assetSource
            : {};
        const assetCall = (name, fallback, ...args) => typeof assetSource[name] === 'function'
            ? assetSource[name](...args)
            : fallback;
        const inputMediaSource = scope.inputMediaSource && typeof scope.inputMediaSource === 'object'
            ? scope.inputMediaSource
            : {};
        const inputMediaCall = (name, fallback, ...args) => typeof inputMediaSource[name] === 'function'
            ? inputMediaSource[name](...args)
            : fallback;
        const stateSource = scope.stateSource && typeof scope.stateSource === 'object'
            ? scope.stateSource
            : {};
        const stateCall = (name, fallback, ...args) => typeof stateSource[name] === 'function'
            ? stateSource[name](...args)
            : fallback;
        const resultSource = scope.resultSource && typeof scope.resultSource === 'object'
            ? scope.resultSource
            : {};
        const resultCall = (name, fallback, ...args) => typeof resultSource[name] === 'function'
            ? resultSource[name](...args)
            : fallback;
        const historySource = scope.historySource && typeof scope.historySource === 'object'
            ? scope.historySource
            : {};
        const historyCall = (name, fallback, ...args) => typeof historySource[name] === 'function'
            ? historySource[name](...args)
            : fallback;
        const languageSource = scope['languageSource'] && typeof scope['languageSource'] === 'object'
            ? scope['languageSource']
            : {};
        const languageCall = (name, fallback, ...args) => typeof languageSource[name] === 'function'
            ? languageSource[name](...args)
            : fallback;
        const utilitySource = scope.utilitySource && typeof scope.utilitySource === 'object'
            ? scope.utilitySource
            : {};
        const utilityCall = (name, fallback, ...args) => typeof utilitySource[name] === 'function'
            ? utilitySource[name](...args)
            : fallback;
        const uiStateSource = scope.uiStateSource && typeof scope.uiStateSource === 'object'
            ? scope.uiStateSource
            : {};
        const uiStateCall = (name, fallback, ...args) => typeof uiStateSource[name] === 'function'
            ? uiStateSource[name](...args)
            : fallback;
        const backendContextSource = scope.backendContextSource && typeof scope.backendContextSource === 'object'
            ? scope.backendContextSource
            : {};
        const backendContextCall = (name, fallback, ...args) => typeof backendContextSource[name] === 'function'
            ? backendContextSource[name](...args)
            : fallback;
        const getObjectConfig = (name, fallback) => {
            const value = configCall(name, fallback);
            return value && typeof value === 'object' ? value : fallback;
        };
        const getArrayConfig = (name, fallback) => {
            const value = configCall(name, fallback);
            return Array.isArray(value) ? value : fallback;
        };
        const getNumberConfig = (name, fallback) => Number(configCall(name, fallback)) || fallback;
        const VLM_CONTEXT_WINDOWS = getObjectConfig('getVlmContextWindows', {});
        const VLM_DEFAULT_VERSION = String(configCall('getVlmDefaultVersion', Object.keys(VLM_CONTEXT_WINDOWS)[0] || '') || Object.keys(VLM_CONTEXT_WINDOWS)[0] || '');
        const VLM_CHAT_DEFAULT_FONT_SIZE = getNumberConfig('getVlmChatDefaultFontSize', 14);
        const VLM_CHAT_DEFAULT_MAX_HISTORY = getNumberConfig('getVlmChatDefaultMaxHistory', 12);
        const VLM_CHAT_CONTEXT_CHARS_MIN = getNumberConfig('getVlmChatContextCharsMin', 1200);
        const VLM_CHAT_DEFAULT_CONTEXT_CHARS = getNumberConfig('getVlmChatDefaultContextChars', 6000);
        const VLM_CHAT_CONTEXT_CHARS_HARD_MAX = getNumberConfig('getVlmChatContextCharsHardMax', 18000);
        const VLM_IMAGE_SLOTS = getArrayConfig('getVlmImageSlots', []);
        const getDefaultProjectId = () => String(nodeCall('getDefaultProjectId', '') || '').trim();
        const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));
        const getLanguageState = (...args) => languageCall('getLanguageState', { __lang: 'en' }, ...args);
        const escapeHtml = (...args) => utilityCall('escapeHtml', String(args[0] ?? ''), ...args);
        const VLM_AGENT_CLEAN_ACTION_PROMPT_UNSET = {};
        const vlmAgentCleanActionPromptOverride = (...args) => promptCall('vlmAgentCleanActionPrompt', VLM_AGENT_CLEAN_ACTION_PROMPT_UNSET, ...args);
        const stripCanvasAgentInlineGenerationParams = (...args) => generationCall('stripCanvasAgentInlineGenerationParams', String(args[0] ?? ''), ...args);
        const canvasAgentUserExplicitNegativePrompt = (...args) => !!generationCall('canvasAgentUserExplicitNegativePrompt', false, ...args);
        const vlmAgentUserPromptHasAssistantPersonaImageIntent = (...args) => !!promptCall('vlmAgentUserPromptHasAssistantPersonaImageIntent', false, ...args);
        const normalizeVlmAgentMode = (...args) => configCall('normalizeVlmAgentMode', 'persona', ...args);
        const findCanvasAgentPresetInstructionOverride = (...args) => promptCall('findCanvasAgentPresetInstructionOverride', null, ...args);
        const normalizePresetName = (...args) => promptCall('normalizePresetName', String(args[0] ?? ''), ...args);
        const stripCanvasAgentPresetFromPrompt = (...args) => promptCall('stripCanvasAgentPresetFromPrompt', String(args[0] ?? ''), ...args);
        const findCanvasAgentPresetEntryByAlias = (...args) => promptCall('findCanvasAgentPresetEntryByAlias', null, ...args);
        const canvasAgentPromptNeedsTargetRewrite = (...args) => !!promptCall('canvasAgentPromptNeedsTargetRewrite', false, ...args);
        const vlmAgentDanbooruPromptNeedsForcedCanonicalRepair = (...args) => !!promptCall('vlmAgentDanbooruPromptNeedsForcedCanonicalRepair', false, ...args);
        const canvasAgentDanbooruFallbackRewrite = (...args) => promptCall('canvasAgentDanbooruFallbackRewrite', '', ...args);
        const canvasAgentMergeDanbooruPromptWithContext = (...args) => promptCall('canvasAgentMergeDanbooruPromptWithContext', String(args[0] ?? ''), ...args);
        const canvasAgentCanonicalizeDanbooruPrompt = (...args) => promptCall('canvasAgentCanonicalizeDanbooruPrompt', String(args[0] ?? ''), ...args);
        const canvasAgentPromptDefaultsForPurpose = (...args) => promptCall('canvasAgentPromptDefaultsForPurpose', {}, ...args);
        const extractCanvasAgentAspectFromText = (...args) => generationCall('extractCanvasAgentAspectFromText', '', ...args);
        const canvasAgentPromptTargetFromPurpose = (...args) => promptCall('canvasAgentPromptTargetFromPurpose', null, ...args);
        const canvasAgentPromptTargetEntryForPurpose = (...args) => promptCall('canvasAgentPromptTargetEntryForPurpose', null, ...args);
        const canvasAgentPresetPromptDefaults = (...args) => promptCall('canvasAgentPresetPromptDefaults', {}, ...args);
        const canvasAgentPromptTargetContextLine = (...args) => promptCall('canvasAgentPromptTargetContextLine', '', ...args);
        const canvasAgentPromptPreflightFacts = (...args) => promptCall('canvasAgentPromptPreflightFacts', [], ...args);
        const canvasAgentPromptPreflight = (...args) => promptCall('canvasAgentPromptPreflight', null, ...args);
        const ensureCanvasAgentPromptMatchesTarget = (...args) => promptCall('ensureCanvasAgentPromptMatchesTarget', { ok: false }, ...args);
        const vlmAgentPreparedPromptFastPath = (...args) => !!promptCall('vlmAgentPreparedPromptFastPath', false, ...args);
        const vlmAgentLocalPromptPreflightPass = (...args) => promptCall('vlmAgentLocalPromptPreflightPass', null, ...args);
        const getWorkbenchUserContext = (...args) => backendContextCall('getWorkbenchUserContext', {}, ...args);
        const wildcardsPreview = (...args) => wildcardCall('wildcardsPreview', null, ...args);
        const prepareVlmAgentImageActionStart = (...args) => agentActionCall('prepareVlmAgentImageActionStart', undefined, ...args);
        const vlmCanvasAgentWorkflowKey = (...args) => agentActionCall('vlmCanvasAgentWorkflowKey', '', ...args);
        const runCanvasAgentImageEdit = (...args) => agentActionCall('runCanvasAgentImageEdit', null, ...args);
        const runCanvasAgentQuickTool = (...args) => agentActionCall('runCanvasAgentQuickTool', null, ...args);
        const runCanvasAgentTextToImage = (...args) => agentActionCall('runCanvasAgentTextToImage', null, ...args);
        const sendVlmRun = (...args) => transportCall('sendVlmRun', null, ...args);
        const sendVlmCancel = (...args) => transportCall('sendVlmCancel', null, ...args);
        const sendVlmUnload = (...args) => transportCall('sendVlmUnload', null, ...args);
        const sendVlmModelDownloads = (...args) => transportCall('sendVlmModelDownloads', { ok: false, error: 'VLM model download API is unavailable' }, ...args);
        const sendVlmCustomModels = (...args) => transportCall('sendVlmCustomModels', { ok: false, error: 'VLM custom model API is unavailable' }, ...args);
        const getVlmCustomKeyValue = (...args) => customApiCall('getVlmCustomKeyValue', '', ...args);
        const setVlmCustomKeyValue = (...args) => customApiCall('setVlmCustomKeyValue', undefined, ...args);
        const readVlmCustomApiProfiles = (...args) => customApiCall('readVlmCustomApiProfiles', {}, ...args);
        const writeVlmCustomApiProfiles = (...args) => customApiCall('writeVlmCustomApiProfiles', undefined, ...args);
        const getVlmCustomProfileKey = (...args) => customApiCall('getVlmCustomProfileKey', 'openai', ...args);
        const getVlmCustomProvider = (...args) => customApiCall('getVlmCustomProvider', {}, ...args);
        const getCanvasAgentCustomParams = (...args) => agentSettingsCall('getCanvasAgentCustomParams', {}, ...args);
        const setCanvasAgentCustomSettings = (...args) => agentSettingsCall('setCanvasAgentCustomSettings', undefined, ...args);
        const getVlmChatUiAreas = (...args) => {
            const areas = uiCall('getVlmChatUiAreas', [], ...args);
            return Array.isArray(areas) ? areas : [];
        };
        const addVlmAgentActionRunLock = (...args) => agentActionCall('addVlmAgentActionRunLock', undefined, ...args);
        const deleteVlmAgentActionRunLock = (...args) => agentActionCall('deleteVlmAgentActionRunLock', undefined, ...args);
        const hasVlmAgentActionRunLock = (...args) => !!agentActionCall('hasVlmAgentActionRunLock', false, ...args);
        const describeVlmAgentToolStatus = (...args) => agentActionCall('describeVlmAgentToolStatus', { ok: false }, ...args);
        const findVlmAgentBrokenEdges = (...args) => agentActionCall('findVlmAgentBrokenEdges', { ok: false }, ...args);
        const getNode = (...args) => nodeCall('getNode', null, ...args);
        const getNodeRect = (...args) => nodeCall('getNodeRect', null, ...args);
        const setVlmAgentTargetSelection = (...args) => nodeCall('setVlmAgentTargetSelection', undefined, ...args);
        const centerViewportOnWorld = (...args) => nodeCall('centerViewportOnWorld', undefined, ...args);
        const renderNodes = (...args) => renderCall('renderNodes', undefined, ...args);
        const renderEdges = (...args) => renderCall('renderEdges', undefined, ...args);
        const renderInspector = (...args) => renderCall('renderInspector', undefined, ...args);
        const renderMinimap = (...args) => renderCall('renderMinimap', undefined, ...args);
        const selectNodeLight = (...args) => renderCall('selectNodeLight', undefined, ...args);
        const getProject = (...args) => nodeCall('getProject', null, ...args);
        const buildVlmAgentContext = (...args) => agentContextCall('buildVlmAgentContext', null, ...args);
        const isVlmMediaSource = (...args) => !!nodeCall('isVlmMediaSource', false, ...args);
        const sendVlmModelStatus = (...args) => modelStatusCall('sendVlmModelStatus', null, ...args);
        const getVlmModelStatusCacheTtlMs = (...args) => Number(configCall('getVlmModelStatusCacheTtlMs', 5 * 60 * 1000, ...args)) || 5 * 60 * 1000;
        const openVlmMissingModelModal = (...args) => modelStatusCall('openVlmMissingModelModal', undefined, ...args);
        const applyVlmModelStatus = (...args) => modelStatusCall('applyVlmModelStatus', undefined, ...args);
        const renderAll = (...args) => renderCall('renderAll', undefined, ...args);
        const getSelectedResultAsset = (...args) => assetCall('getSelectedResultAsset', null, ...args);
        const getVlmSourceAsset = (...args) => assetCall('getVlmSourceAsset', null, ...args);
        const openVlmAssetViewer = (...args) => assetCall('openVlmAssetViewer', undefined, ...args);
        const refreshVlmChatAssetRoot = (...args) => assetCall('refreshVlmChatAssetRoot', false, ...args);
        const hasVlmChatAssetRoot = (...args) => !!assetCall('hasVlmChatAssetRoot', false, ...args);
        const safeVlmChatFallbackSrc = (...args) => assetCall('safeVlmChatFallbackSrc', '', ...args);
        const isImageFile = (...args) => !!inputMediaCall('isImageFile', false, ...args);
        const readFileAsDataUrl = (...args) => inputMediaCall('readFileAsDataUrl', '', ...args);
        const getImageDimensions = (...args) => inputMediaCall('getImageDimensions', { width: 0, height: 0 }, ...args);
        const createThumbnailDataUrl = (...args) => inputMediaCall('createThumbnailDataUrl', '', ...args);
        const serializeAssetForRun = (...args) => assetCall('serializeAssetForRun', null, ...args);
        const serializeAssetSourceForRun = (...args) => assetCall('serializeAssetSourceForRun', null, ...args);
        const safeAssetDisplaySrc = (...args) => assetCall('safeAssetDisplaySrc', '', ...args);
        const inferChatImageRelativePath = (...args) => assetCall('inferChatImageRelativePath', '', ...args);
        const safeVlmChatAssetThumb = (...args) => assetCall('safeVlmChatAssetThumb', '', ...args);
        const buildVlmChatStatePatch = (...args) => stateCall('buildVlmChatStatePatch', {}, ...args);
        const buildVlmChatToolStatePatch = (...args) => stateCall('buildVlmChatToolStatePatch', {}, ...args);
        const buildVlmParamsPatch = (...args) => stateCall('buildVlmParamsPatch', {}, ...args);
        const buildVlmTextPatch = (...args) => stateCall('buildVlmTextPatch', {}, ...args);
        const buildVlmLastResponsePatch = (...args) => stateCall('buildVlmLastResponsePatch', {}, ...args);
        const buildVlmCustomModelChoicesPatch = (...args) => stateCall('buildVlmCustomModelChoicesPatch', {}, ...args);
        const buildVlmRunStatusPatch = (...args) => stateCall('buildVlmRunStatusPatch', {}, ...args);
        const buildVlmModelStatusPatch = (...args) => modelStatusCall('buildVlmModelStatusPatch', {}, ...args);
        const buildVlmModelCheckingStatus = (...args) => modelStatusCall('buildVlmModelCheckingStatus', null, ...args);
        const nowIso = (...args) => utilityCall('nowIso', '', ...args);
        const now = (...args) => Number(utilityCall('now', 0, ...args)) || 0;
        const parseDate = (...args) => Number(utilityCall('parseDate', 0, ...args)) || 0;
        const generatedResultNodesForPreset = (...args) => resultCall('generatedResultNodesForPreset', [], ...args);
        const resultNodeHasOutput = (...args) => resultCall('resultNodeHasOutput', false, ...args);
        const t = (...args) => {
            const en = args[0] || '';
            const cn = args.length > 1 ? args[1] : en;
            const state = args.length > 2 ? args[2] : getLanguageState();
            return languageCall('t', en, en, cn, state);
        };
        const uid = (...args) => utilityCall('uid', '', ...args);
        const isNodeLocked = (...args) => !!nodeCall('isNodeLocked', false, ...args);
        const isNodeIgnored = (...args) => !!nodeCall('isNodeIgnored', false, ...args);
        const nodeStatusState = (...args) => nodeCall(
            'nodeStatusState',
            args[0]?.status?.state || args[0]?.producer?.state || '',
            ...args
        );
        const pushHistory = (...args) => historyCall('pushHistory', undefined, ...args);
        const pushHistoryBatch = (...args) => historyCall('pushHistoryBatch', undefined, ...args);
        const cloneRunValue = (...args) => stateCall('cloneRunValue', args[0], ...args);

        function applyVlmChatState(node, options) {
            if (!node || node.type !== 'vlm') return;
            const patch = buildVlmChatStatePatch(node, options || {});
            if (patch && typeof patch === 'object') {
                Object.assign(node, { chat: Object.assign({}, node.chat || {}, patch) });
            }
        }

        function applyVlmText(node, options) {
            if (!node || node.type !== 'vlm') return;
            const patch = buildVlmTextPatch(node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'text')) {
                Object.assign(node, patch);
            }
        }

        function applyVlmLastResponse(node, options) {
            if (!node || node.type !== 'vlm') return;
            const patch = buildVlmLastResponsePatch(node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'last_response')) {
                Object.assign(node, patch);
            }
        }

        function applyVlmCustomModelChoices(node, choices) {
            if (!node || node.type !== 'vlm') return;
            const patch = buildVlmCustomModelChoicesPatch(node, choices);
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'custom_model_choices')) {
                Object.assign(node, patch);
            }
        }

        function applyVlmRunStatus(node, options) {
            if (!node || node.type !== 'vlm') return;
            const patch = buildVlmRunStatusPatch(node, options || {});
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, 'status')) {
                Object.assign(node, patch);
            }
        }

        function getVlmCustomApiProfile(params) {
            const profiles = readVlmCustomApiProfiles();
            if (!profiles || typeof profiles !== 'object') return null;
            return profiles[getVlmCustomProfileKey(params || {})] || null;
        }

        function getVlmCustomApiKey(node) {
            if (!node || node.type !== 'vlm') return '';
            const visibleKey = String(getVlmCustomKeyValue(node) || '').trim();
            if (visibleKey) return visibleKey;
            const profile = getVlmCustomApiProfile(node.params || {});
            return String(profile?.api_key || '').trim();
        }

        function getVlmCustomRuntimeParams(node) {
            const params = cloneRunValue(node?.params || {}, {});
            if (!String(params.version || '').trim()) {
                params.version = VLM_DEFAULT_VERSION;
            }
            if (params.version === 'Custom') {
                params.custom_api_key = getVlmCustomApiKey(node);
                const provider = getVlmCustomProvider(params.custom_provider || 'openai') || {};
                if (!params.custom_api_format) params.custom_api_format = provider.format || 'openai_compatible';
                if (!params.custom_base_url) params.custom_base_url = provider.baseUrl || '';
                if (params.custom_supports_images == null) params.custom_supports_images = provider.supportsImages !== false;
            }
            return params;
        }

        function cleanVlmToolPrompt(prompt) {
            return String(prompt || '').replace(/^\/(?:t2i|generate|image|draw)\b[:：]?\s*/i, '').trim();
        }

        function extractVlmPreparedImagePrompt(text) {
            const source = String(text || '').trim();
            if (!source) return '';
            const cleanPreparedBlock = (value) => {
                return String(value || '')
                    .replace(/```(?:text|prompt)?/gi, '')
                    .replace(/```/g, '')
                    .split(/\r?\n/)
                    .map(line => line.replace(/^\s*>\s?/, '').trim())
                    .filter(Boolean)
                    .join(', ')
                    .replace(/\s*,\s*,+/g, ', ')
                    .replace(/^["“”'`]+|["“”'`]+$/g, '')
                    .trim();
            };
            const blockPatterns = [
                /(?:Prompt|Image prompt|Recommended prompt|Danbooru-style Tags)[^\n\r]*[:：]?\s*\n\s*([\s\S]{1,1600}?)(?=\n\s*(?:\*\*)?\s*(?:Negative Prompt|中文描述|Image Generation Recommendation|推荐操作|操作建议)\b|\n\s*---|$)/i,
                /(?:提示词|推荐提示词|生成提示词|图像提示词)[^\n\r]*[:：]?\s*\n\s*([\s\S]{1,1600}?)(?=\n\s*(?:\*\*)?\s*(?:负面提示词|Negative Prompt|中文描述|推荐操作|操作建议)\b|\n\s*---|$)/i
            ];
            for (const pattern of blockPatterns) {
                const prompt = cleanPreparedBlock(source.match(pattern)?.[1] || '');
                if (prompt) return cleanVlmToolPrompt(prompt) || prompt;
            }
            const patterns = [
                /(?:\*\*)?\s*(?:提示词|推荐提示词|生成提示词|图像提示词|Prompt|Image prompt|Prompt to submit)\s*(?:\*\*)?\s*[:：]\s*["“”']?([^\n\r]+)/i,
                /(?:\*\*)?\s*(?:prompt|image_prompt|recommended_prompt)\s*(?:\*\*)?\s*=\s*["“”']?([^\n\r]+)/i
            ];
            for (const pattern of patterns) {
                const match = source.match(pattern);
                const prompt = String(match?.[1] || '').replace(/^["“”'`]+|["“”'`]+$/g, '').trim();
                if (prompt) return cleanVlmToolPrompt(prompt) || prompt;
            }
            return '';
        }

        const markVlmChatStickToBottom = (...args) => uiStateCall('markVlmChatStickToBottom', undefined, ...args);
        const mutate = (...args) => uiStateCall('mutate', undefined, ...args);
        const scrollVlmChatToBottom = (...args) => uiStateCall('scrollVlmChatToBottom', undefined, ...args);
        const showToast = (...args) => uiStateCall('showToast', undefined, ...args);
        const copyVlmChatText = (...args) => uiStateCall('copyVlmChatText', false, ...args);
        const confirmDialog = (...args) => !!uiStateCall('confirmDialog', false, ...args);
        const focusVlmChatPromptInput = (...args) => uiCall('focusVlmChatPromptInput', false, ...args);
        const schedule = (callback, delay) => {
            if (typeof schedulerSource.schedule === 'function') return schedulerSource.schedule(callback, delay);
            if (typeof callback === 'function') return callback();
            return undefined;
        };
        const scheduleTimeout = (...args) => schedulerCall('scheduleTimeout', null, ...args);
        const clearScheduledTimeout = (...args) => schedulerCall('clearScheduledTimeout', undefined, ...args);
        const activeVlmChatRequests = new Map();

        function startVlmChatRequest(nodeId, options) {
            const params = options && typeof options === 'object' ? options : {};
            const safeNodeId = String(nodeId || params.nodeId || '').trim();
            const state = {
                controller: typeof AbortController === 'function' ? new AbortController() : null,
                requestId: String(params.requestId || uid('vlm_chat_req')).trim(),
                conversationId: String(params.conversationId || '').trim(),
                nodeId: safeNodeId,
                projectId: String(params.projectId || getDefaultProjectId() || '').trim()
            };
            if (safeNodeId) activeVlmChatRequests.set(safeNodeId, state);
            return state;
        }

        function getVlmChatRequest(nodeId) {
            return activeVlmChatRequests.get(String(nodeId || '').trim()) || null;
        }

        function isVlmChatRequestActive(nodeId, requestId) {
            const active = getVlmChatRequest(nodeId);
            return !!active && active.requestId === String(requestId || '');
        }

        function clearVlmChatRequest(nodeId, requestId) {
            const safeNodeId = String(nodeId || '').trim();
            const active = getVlmChatRequest(safeNodeId);
            if (!active || (requestId && active.requestId !== requestId)) return false;
            activeVlmChatRequests.delete(safeNodeId);
            return true;
        }

        function abortVlmChatRequest(nodeId, requestId) {
            const active = getVlmChatRequest(nodeId);
            if (!active || (requestId && active.requestId !== requestId)) return null;
            try { active.controller?.abort(); } catch (err) {}
            return active;
        }

        function canvasVlmChatCancelPayload(node, requestState) {
            const currentProject = getProject() || {};
            return canvasVlmCancelPayloadFromRunPayload({
                project_id: requestState?.projectId || currentProject.id || getDefaultProjectId(),
                node_id: node?.id || requestState?.nodeId || '',
                conversation_id: requestState?.conversationId || node?.params?.conversation_id || node?.chat?.conversation_id || '',
                request_id: requestState?.requestId || ''
            });
        }

        async function cancelVlmChatRequest(node, requestState) {
            const active = requestState || getVlmChatRequest(node?.id);
            const nodeId = node?.id || active?.nodeId || '';
            const requestId = active?.requestId || '';
            const payload = canvasVlmChatCancelPayload(node, active);
            abortVlmChatRequest(nodeId, requestId);
            clearVlmChatRequest(nodeId, requestId);
            return sendVlmCancelRequest(payload);
        }

        async function stopVlmChatNode(node) {
            if (!node || node.type !== 'vlm' || (node.params?.mode || 'single') !== 'chat') {
                return { ok: false, error: 'VLM chat node is unavailable' };
            }
            const liveNode = getNode(node.id) || node;
            const requestState = getVlmChatRequest(liveNode.id);
            const cancelPromise = cancelVlmChatRequest(liveNode, requestState);
            replaceVlmChatPendingMessage(liveNode, t('Stopped.', '已停止。'));
            applyVlmRunStatus(liveNode, {
                status: {
                    state: 'idle',
                    message: t('VLM chat reply stopped.', 'VLM chat 回复已停止。')
                }
            });
            applyVlmLastResponse(liveNode, {
                responsePatch: {
                    ok: false,
                    aborted: true,
                    cancelled: true,
                    message: 'VLM chat reply stopped.'
                }
            });
            mutate();
            scrollVlmChatToBottom(liveNode.id);
            const response = await cancelPromise;
            showToast(response?.ok
                ? t('VLM chat reply stopped.', 'VLM chat 回复已停止。')
                : t('VLM stop request sent locally.', '已在本地停止 VLM 回复。'));
            return response;
        }

        function canvasVlmCancelPayloadFromRunPayload(payload) {
            const body = payload || {};
            const params = body.params && typeof body.params === 'object' ? body.params : {};
            return {
                project_id: String(body.project_id || getDefaultProjectId() || '').trim(),
                node_id: String(body.node_id || params.node_id || '').trim(),
                conversation_id: String(body.conversation_id || params.conversation_id || '').trim(),
                request_id: String(body.request_id || params.request_id || '').trim()
            };
        }

        async function requestVlmCancelForRunPayload(payload) {
            const cancelPayload = canvasVlmCancelPayloadFromRunPayload(payload);
            if (!cancelPayload.node_id && !cancelPayload.conversation_id && !cancelPayload.request_id) return;
            try {
                await sendVlmCancelRequest(cancelPayload);
            } catch (err) {
                console.warn('[SimpAI Canvas] VLM cancel after timeout failed', err);
            }
        }

        async function sendVlmRunRequest(payload, options) {
            const opts = options || {};
            const timeoutMs = Math.max(0, Number(opts.timeoutMs || 0));
            const canUseTimeout = timeoutMs > 0
                && !opts.signal
                && typeof AbortController === 'function'
                && typeof schedulerSource.scheduleTimeout === 'function';
            const controller = canUseTimeout ? new AbortController() : null;
            let timer = null;
            let timedOut = false;
            if (controller) {
                timer = scheduleTimeout(() => {
                    timedOut = true;
                    controller.abort();
                }, timeoutMs);
            }
            const response = await sendVlmRun(payload, Object.assign({}, opts, controller ? { signal: controller.signal } : {}));
            if (timer !== null && typeof schedulerSource.clearScheduledTimeout === 'function') clearScheduledTimeout(timer);
            if (timedOut && response?.aborted) {
                await requestVlmCancelForRunPayload(payload);
                return Object.assign({}, response, {
                    ok: false,
                    timeout: true,
                    error: opts.timeoutError || t('VLM request timed out.', 'VLM 请求超时。')
                });
            }
            return response;
        }

        async function sendVlmCancelRequest(payload) {
            if (typeof transportSource.sendVlmCancel !== 'function') {
                return { ok: false, error: 'VLM cancel API is unavailable' };
            }
            return sendVlmCancel(payload || {});
        }

        function normalizeVlmExecutableActionType(type) {
            return String(type || '').trim().toLowerCase().replace(/-/g, '_');
        }

        function vlmAgentActionPurpose(type) {
            const normalized = normalizeVlmExecutableActionType(type);
            if (normalized === 'edit_image') return 'image edit';
            if (normalized === 'outpaint_image' || normalized === 'erase_image' || normalized === 'replace_image') return 'image edit';
            if (normalized === 'upscale_image') return 'image upscale';
            return 'text-to-image';
        }

        function isVlmImageToolActionType(type) {
            return ['generate_image', 'text_to_image', 'edit_image', 'outpaint_image', 'erase_image', 'replace_image', 'upscale_image'].includes(normalizeVlmExecutableActionType(type));
        }

        function vlmAgentAutoConfirmEnabled(node, params) {
            return !!(node?.params?.agent_auto_confirm_generation || params?.agent_auto_confirm_generation);
        }

        function vlmAgentActionRequiresManualConfirm() {
            return false;
        }

        function vlmAgentActionWasSynthesized(action) {
            return String(action?._frontend_fallback || '').toLowerCase() === 'true'
                || String(action?._backend_synthesized || '').toLowerCase() === 'true';
        }

        function isVlmAgentPromptReviewRejected(action) {
            const review = action?.prompt_review && typeof action.prompt_review === 'object' ? action.prompt_review : null;
            return String(review?.state || '').toLowerCase() === 'reject'
                || String(action?._prompt_review_rejected || '').toLowerCase() === 'true';
        }

        function isVlmAgentPromptReviewBypassable(action) {
            if (String(action?._safety_blocked || '').toLowerCase() === 'true') return false;
            const review = action?.prompt_review && typeof action.prompt_review === 'object' ? action.prompt_review : null;
            if (review && review.bypassable === false) return false;
            const issues = Array.isArray(review?.issues) ? review.issues : [];
            return !issues.some((item) => {
                const code = String(item?.code || '').toLowerCase();
                return ['adult_character_blocked', 'minor_coded_adult_character_blocked', 'safety_blocked'].includes(code);
            });
        }

        function extractVlmAgentActionsFromText(text) {
            const source = String(text || '');
            if (!source) return [];
            const actions = [];
            const add = (item) => {
                if (!item || typeof item !== 'object' || Array.isArray(item)) return;
                let action = normalizeVlmExecutableActionType(item.action || item.type || '');
                let payload = item;
                if (!action && item.action && typeof item.action === 'object' && !Array.isArray(item.action)) {
                    const nestedKey = Object.keys(item.action).find(key => normalizeVlmExecutableActionType(key));
                    const nestedAction = normalizeVlmExecutableActionType(nestedKey || '');
                    if (nestedAction && item.action[nestedKey] && typeof item.action[nestedKey] === 'object') {
                        action = nestedAction;
                        payload = Object.assign({}, item.action[nestedKey], { action });
                    }
                }
                if (!isVlmImageToolActionType(action) && !['focus_node', 'select_node', 'explain_node', 'inspect_tool_status'].includes(action)) return;
                actions.push(Object.assign({}, payload, { action }));
            };
            const visit = (parsed) => {
                if (Array.isArray(parsed)) parsed.forEach(add);
                else add(parsed);
            };
            const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
            const candidates = [fenced ? fenced[1] : '', source].filter(Boolean);
            for (const candidate of candidates) {
                try {
                    visit(JSON.parse(candidate.trim()));
                    if (actions.length) return actions.slice(0, 6);
                } catch (err) {}
            }
            const textSource = source;
            for (let index = 0; index < textSource.length && actions.length < 6; index += 1) {
                if (textSource[index] !== '{' && textSource[index] !== '[') continue;
                for (let end = textSource.length; end > index; end -= 1) {
                    const last = textSource[end - 1];
                    if ((textSource[index] === '{' && last !== '}') || (textSource[index] === '[' && last !== ']')) continue;
                    try {
                        visit(JSON.parse(textSource.slice(index, end)));
                        break;
                    } catch (err) {}
                }
            }
            if (!actions.length) {
                const actionMatch = source.match(/^\s*(?:action|tool)\s*[:：]\s*([a-zA-Z_ -]+)\s*$/im);
                const promptMatch = source.match(/^\s*(?:prompt|image_prompt|final_prompt)\s*[:：]\s*([\s\S]*?)(?=^\s*(?:negative_prompt|summary|reason|confidence|action|tool)\s*[:：]|\s*$)/im);
                if (actionMatch && promptMatch) {
                    add({
                        action: normalizeVlmExecutableActionType(actionMatch[1] || ''),
                        prompt: String(promptMatch[1] || '').trim(),
                        summary: 'Create an image from this request after confirmation.'
                    });
                }
            }
            return actions.slice(0, 6);
        }

        function vlmAgentUserExplicitlyRequestedGenerationControl(text, keys) {
            const source = String(text || '').toLowerCase();
            if (!source) return false;
            const list = Array.isArray(keys) ? keys : [keys];
            if (list.some(key => key === 'resolution_scale')) {
                if (/(?:resolution[_\s-]*scale|scale|upscale|2x|1x|\d+(?:\.\d+)?\s*x|倍率|倍图|放大|高清|高分辨率|超清|大图)/i.test(source)) return true;
            }
            if (list.some(key => key === 'steps')) {
                if (/(?:steps?|步数|采样步数)\s*[:：]?\s*\d+/i.test(source)) return true;
            }
            if (list.some(key => key === 'cfg_scale')) {
                if (/(?:cfg|guidance|引导|提示词相关性)\s*[:：]?\s*\d+/i.test(source)) return true;
            }
            if (list.some(key => key === 'seed')) {
                if (/(?:seed|种子)\s*[:：]?\s*-?\d+|固定种子|随机种子/i.test(source)) return true;
            }
            if (list.some(key => key === 'dimensions')) {
                if (/(?:\d{3,5})\s*(?:x|×|\*)\s*(?:\d{3,5})/.test(source)) return true;
                if (/(?:width|height|size|resolution|像素|尺寸|宽度|高度|宽|高)\s*[:=：]?\s*\d{3,5}/i.test(source)) return true;
            }
            return false;
        }

        function extractRequestedImageCount(text) {
            const source = String(text || '').trim();
            if (!source) return null;
            const digitMatch = source.match(/(?:生成|画|来|要|出|做|make|generate|create|draw)?\s*(\d{1,2})\s*(?:张|幅|images?|imgs?|pictures?)/i);
            if (digitMatch) return clampValue(Math.round(Number(digitMatch[1])), 1, 16);
            const cnDigits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
            const cnMatch = source.match(/(?:生成|画|来|要|出|做)?\s*([一二两三四五六七八九十])\s*(?:张|幅)(?:图|图片|照片|画|作品)?/);
            if (cnMatch && cnDigits[cnMatch[1]]) return cnDigits[cnMatch[1]];
            return null;
        }

        function vlmAgentActionHasBackendResolution(action) {
            const source = String(action?.resolution_source || action?.resolutionSource || '').trim().toLowerCase();
            const composer = action?.prompt_composer && typeof action.prompt_composer === 'object' ? action.prompt_composer : {};
            const composerResolution = composer.generation_resolution && typeof composer.generation_resolution === 'object' ? composer.generation_resolution : {};
            return source === 'backend_random_sdxl'
                || String(composerResolution.source || '').trim().toLowerCase() === 'backend_random_sdxl';
        }

        function vlmAgentActionExecutionPlan(action, canvasAction, prompt, userPrompt) {
            const plan = Object.assign({}, action || {});
            plan.source = 'vlm_agent';
            plan.action = canvasAction;
            plan.prompt = prompt;
            plan.recommendedPrompt = prompt;
            plan.recommended_prompt = prompt;
            plan.preset = action?.preset || '';
            plan.reason = action?.reason || action?.summary || '';
            const controlSource = String(userPrompt || '').trim();
            const requestedAspect = extractCanvasAgentAspectFromText(controlSource);
            if (requestedAspect) plan.aspect_ratio = requestedAspect;
            const requestedCount = extractRequestedImageCount(controlSource);
            if (requestedCount && requestedCount > 1) {
                plan.image_number = requestedCount;
            } else {
                delete plan.image_number;
                delete plan.images;
                delete plan.count;
                delete plan.batch_size;
            }
            if (!vlmAgentUserExplicitlyRequestedGenerationControl(controlSource, 'resolution_scale')) {
                delete plan.resolution_scale;
                delete plan.scale;
                delete plan.upscale;
            }
            if (!vlmAgentUserExplicitlyRequestedGenerationControl(controlSource, 'dimensions') && !vlmAgentActionHasBackendResolution(action)) {
                delete plan.width;
                delete plan.height;
                delete plan.overwrite_width;
                delete plan.overwrite_height;
                delete plan.resolution;
                delete plan.size;
            }
            plan.resolution_scale = vlmAgentUserExplicitlyRequestedGenerationControl(controlSource, 'resolution_scale')
                ? (plan.resolution_scale ?? plan.scale ?? plan.upscale ?? null)
                : 1;
            if (!vlmAgentUserExplicitlyRequestedGenerationControl(controlSource, 'steps')) delete plan.steps;
            if (!vlmAgentUserExplicitlyRequestedGenerationControl(controlSource, 'cfg_scale')) {
                delete plan.cfg_scale;
                delete plan.guidance_scale;
                delete plan.cfg;
                delete plan.guidance;
            }
            if (!vlmAgentUserExplicitlyRequestedGenerationControl(controlSource, 'seed')) {
                delete plan.seed;
                delete plan.image_seed;
                delete plan.seed_random;
                delete plan.random_seed;
                delete plan.randomize_seed;
            }
            return plan;
        }

        function mergeVlmImageGenerationActions(actions, userPrompt) {
            const list = Array.isArray(actions) ? actions : [];
            const imageActions = list.filter(item => isVlmImageToolActionType(item?.action || item?.type || ''));
            if (imageActions.length <= 1) return list;
            const firstIndex = list.findIndex(item => imageActions.includes(item));
            const primary = Object.assign({}, imageActions[0]);
            const requestedCount = extractRequestedImageCount(userPrompt);
            if (requestedCount && requestedCount > 1) {
                primary.image_number = clampValue(Math.round(requestedCount), 1, 16);
            } else {
                delete primary.image_number;
                delete primary.images;
                delete primary.count;
                delete primary.batch_size;
            }
            primary.summary = primary.summary || t('Generate the requested image batch after confirmation.', '确认后生成请求的图片批次。');
            const merged = list.filter(item => !imageActions.includes(item));
            merged.splice(Math.max(0, firstIndex), 0, primary);
            return merged;
        }

        function findVlmAutoConfirmActionIndex(message, enabled) {
            if (!enabled) return -1;
            const actions = Array.isArray(message?.actions) ? message.actions : [];
            return actions.findIndex(item => isVlmImageToolActionType(item?.action || item?.type || '')
                && !isVlmAgentPromptReviewRejected(item)
                && !vlmAgentActionRequiresManualConfirm(item));
        }

        function isVlmAgentRunAlreadyPreparingResult(result) {
            const text = [
                result?.error,
                result?.message,
                result?.runResponse?.error,
                result?.runResponse?.message
            ].map(item => String(item || '').toLowerCase()).join(' ');
            return /\brun already (?:preparing|active)\b|already has an active run|already preparing/.test(text);
        }

        function vlmAgentActionResultState(result, existingRunPreparing) {
            return result?.ok
                ? (result?.runResponse?.state || 'done')
                : (existingRunPreparing ? 'running' : 'failed');
        }

        function vlmAgentActionResultMessage(result) {
            return result?.message || (result?.ok ? t('Done.', '已完成') : t('Failed.', '执行失败'));
        }

        function vlmAgentToolResultMessage(type, result, existingRunPreparing, hasResultNode) {
            if (!isVlmImageToolActionType(type) || !result?.runResponse) return null;
            if (result.ok && hasResultNode) {
                return {
                    content: t('Generation complete. The image is now attached here.', '生成完成，图片已附加到这里。'),
                    state: 'finished'
                };
            }
            if (!result.ok && !existingRunPreparing) {
                return {
                    content: result.message || t('Generation failed.', '生成失败。'),
                    state: 'failed'
                };
            }
            return null;
        }

        function vlmAgentActionExecutionGate(action, lockActive) {
            if (lockActive) {
                return {
                    allowed: false,
                    state: 'running',
                    message: t('This Agent action is already running.', '这个 Agent 动作正在执行中。')
                };
            }
            const existingState = String(action?.execution?.state || '').trim();
            if (existingState && !['failed', 'queued', 'checking'].includes(existingState)) {
                return {
                    allowed: false,
                    state: '',
                    message: t('This Agent action has already been handled.', '这个 Agent 动作已经处理过。')
                };
            }
            return { allowed: true, state: '', message: '' };
        }

        function vlmAgentActionPrompt(node, messageIndex, action) {
            const direct = vlmAgentCleanActionPrompt(action?.final_prompt || action?.recommended_prompt || action?.prompt || action?.image_prompt || '');
            if (direct) return direct;
            const assistantPrompt = vlmAgentCleanActionPrompt(
                extractVlmPreparedImagePrompt(getVlmChatMessage(node, messageIndex)?.content || '')
            );
            if (assistantPrompt) return assistantPrompt;
            const userPrompt = vlmAgentCleanActionPrompt(action?.user_prompt || '');
            if (userPrompt) return userPrompt;
            const messages = Array.isArray(node?.chat?.messages) ? node.chat.messages : [];
            for (let i = Number(messageIndex) - 1; i >= 0; i -= 1) {
                const message = messages[i];
                if (message?.role === 'user' && String(message.content || '').trim()) {
                    return cleanVlmToolPrompt(message.content) || String(message.content || '').trim();
                }
            }
            return String(action?.summary || action?.reason || '').trim();
        }

        function vlmAgentPreviousUserPrompt(node, messageIndex) {
            const messages = Array.isArray(node?.chat?.messages) ? node.chat.messages : [];
            for (let i = Number(messageIndex) - 1; i >= 0; i -= 1) {
                const message = messages[i];
                if (message?.role === 'user' && String(message.content || '').trim()) return String(message.content || '').trim();
            }
            return '';
        }

        function vlmAgentActionTargetId(action) {
            return String(action?.target_node_id || action?.node_id || action?.run_id || '').trim();
        }

        function markVlmAgentActionCardBusy(card, message) {
            if (!card) return;
            const buttons = card.querySelector?.('.sai-vlm-agent-action-buttons');
            if (buttons) buttons.innerHTML = `<small class="is-running">${escapeHtml(message || t('Running...', '正在运行...'))}</small>`;
            card.querySelectorAll?.('button,input').forEach(item => {
                item.disabled = true;
            });
        }

        function ignoreVlmAgentAction(node, messageIndex, actionIndex) {
            const action = getVlmAgentAction(node, messageIndex, actionIndex);
            if (!action) {
                setVlmAgentActionExecution(node, messageIndex, actionIndex, {
                    state: 'failed',
                    message: t('Agent action was not found.', '未找到 Agent 动作。')
                });
                return { ok: false, message: 'Agent action was not found.' };
            }
            setVlmAgentActionExecution(node, messageIndex, actionIndex, {
                state: 'ignored',
                message: t('Ignored by user.', '已忽略')
            });
            showToast(t('Agent action ignored.', '已忽略 Agent action'));
        }

        function retryVlmAgentAction(node, messageIndex, actionIndex) {
            const liveNode = getNode(node?.id || '') || node;
            if (!liveNode || liveNode.type !== 'vlm') return;
            if (isVlmNodeBusy(liveNode)) {
                showToast(t('VLM is still thinking. Please wait before retrying.', 'VLM 还在思考，请稍后重试'));
                return;
            }
            const retryContext = prepareVlmAgentRetryContext(liveNode, messageIndex, actionIndex);
            if (!retryContext.ok) {
                showToast(t('No source request was found for retry.', '没有找到可重试的原始请求'));
                return;
            }
            applyVlmChatContextEdit(liveNode, retryContext.keptMessages, 'Retry VLM agent request', 'Retrying from the same prior chat context.');
            applyVlmChatState(liveNode, {
                pendingImages: retryContext.pendingImages,
                updatedAt: nowIso()
            });
            Object.assign(liveNode, buildVlmParamsPatch(liveNode, {
                paramsPatch: { prompt: retryContext.sourceUserPrompt }
            }));
            mutate({ inspector: true });
            runVlmNode(liveNode);
        }

        function allowRejectedVlmAgentAction(node, messageIndex, actionIndex) {
            const liveNode = getNode(node?.id || '') || node;
            if (!liveNode || liveNode.type !== 'vlm') return;
            if (isVlmNodeBusy(liveNode)) {
                showToast(t('VLM is still thinking. Please wait before allowing another action.', 'VLM 还在思考，请稍后再放行'));
                return;
            }
            const action = getVlmAgentAction(liveNode, messageIndex, actionIndex);
            if (!action) return;
            const bypass = prepareVlmAgentPromptReviewBypass(action);
            if (!bypass.ok) {
                showToast(bypass.message, 3600);
                return;
            }
            patchVlmAgentAction(liveNode, messageIndex, actionIndex, bypass.patch, 'Bypass VLM prompt review');
            executeVlmAgentAction(liveNode, messageIndex, actionIndex, { bypassPromptReview: true });
        }

        function focusVlmAgentTarget(targetId) {
            const target = getNode(targetId);
            if (!target) return { ok: false, message: t('Target node was not found.', '目标节点不存在') };
            setVlmAgentTargetSelection(target.id, { clearGroup: true });
            const rect = getNodeRect(target);
            centerViewportOnWorld(rect.x + rect.w / 2, rect.y + rect.h / 2);
            renderNodes();
            renderEdges();
            renderInspector();
            renderMinimap();
            return { ok: true, node: target, message: t('Focused node: {title}', '已定位节点：{title}').replace('{title}', target.title || target.id) };
        }

        function selectVlmAgentTarget(targetId) {
            const target = getNode(targetId);
            if (!target) return { ok: false, message: t('Target node was not found.', '目标节点不存在') };
            selectNodeLight(target.id);
            return { ok: true, node: target, message: t('Selected node: {title}', '已选中节点：{title}').replace('{title}', target.title || target.id) };
        }

        function maybeRunVlmAgentActionFromAutoConfirmToggle(node, field) {
            if (!node || node.type !== 'vlm' || !field || field.type !== 'checkbox' || !field.checked) return false;
            const token = String(field.getAttribute('data-vlm-agent-action-auto-confirm') || '').trim();
            if (!token) return false;
            const [messageIndex, actionIndex] = token.split(':').map(Number);
            if (!Number.isFinite(messageIndex) || !Number.isFinite(actionIndex)) return false;
            const action = getVlmAgentAction(node, messageIndex, actionIndex);
            const type = normalizeVlmExecutableActionType(action?.action || action?.type || '');
            if (!isVlmImageToolActionType(type) || isVlmAgentPromptReviewRejected(action)) return false;
            const state = String(action?.execution?.state || '').trim().toLowerCase();
            if (state && state !== 'failed') return false;
            const lockKey = `${node.id}:${messageIndex}:${actionIndex}`;
            if (hasVlmAgentActionRunLock(lockKey)) return true;
            setVlmAgentActionExecution(node, messageIndex, actionIndex, {
                state: 'queued',
                message: t('Auto-confirmed; preparing generation...', '已自动确认，正在准备生成...'),
                at: nowIso()
            });
            executeVlmAgentAction(node, messageIndex, actionIndex, { autoConfirmed: true, rememberAutoConfirm: true });
            return true;
        }

        function vlmAgentActionNegativePrompt(action) {
            return String(action?.negative_prompt || action?.negativePrompt || action?.negative || action?.negative_image_prompt || '').trim();
        }

        function vlmAgentSubjectCountHintFromAction(action) {
            const counts = action?.subject_counts || action?.subject_count || action?.subjects || null;
            if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return null;
            const girls = Number(counts.girls ?? counts.female ?? counts.females ?? counts.women ?? 0) || 0;
            const boys = Number(counts.boys ?? counts.male ?? counts.males ?? counts.men ?? 0) || 0;
            const others = Number(counts.others ?? counts.other ?? counts.unnamed ?? counts.extra ?? 0) || 0;
            const total = Number(counts.total ?? counts.people ?? counts.characters ?? 0) || 0;
            return {
                girls: Math.max(0, Math.round(girls)),
                boys: Math.max(0, Math.round(boys)),
                others: Math.max(0, Math.round(others)),
                total: Math.max(0, Math.round(total), Math.round(girls) + Math.round(boys) + Math.round(others))
            };
        }

        function sanitizeVlmAgentGenerationControlFields(action, userPrompt) {
            const next = Object.assign({}, action || {});
            const source = String(userPrompt || '').trim();
            const promptText = [next.prompt, next.image_prompt, next.recommended_prompt, next.final_prompt].filter(Boolean).join('\n');
            const requestedAspect = extractCanvasAgentAspectFromText(source);
            const promptAspect = extractCanvasAgentAspectFromText(promptText);
            if ((requestedAspect || promptAspect) && !next.aspect_ratio && !next.aspect && !next.ratio && !next.orientation) {
                next.aspect_ratio = requestedAspect || promptAspect;
            }
            ['prompt', 'image_prompt', 'recommended_prompt', 'final_prompt'].forEach((key) => {
                if (next[key]) next[key] = stripCanvasAgentInlineGenerationParams(next[key]);
            });
            const requestedCount = extractRequestedImageCount(source);
            if (requestedCount && requestedCount > 1) {
                next.image_number = requestedCount;
                delete next.images;
                delete next.count;
                delete next.batch_size;
            } else {
                delete next.image_number;
                delete next.images;
                delete next.count;
                delete next.batch_size;
            }
            if (!vlmAgentUserExplicitlyRequestedGenerationControl(source, 'resolution_scale')) {
                delete next.resolution_scale;
                delete next.scale;
                delete next.upscale;
            }
            if (!vlmAgentUserExplicitlyRequestedGenerationControl(source, 'dimensions') && !vlmAgentActionHasBackendResolution(next)) {
                delete next.width;
                delete next.height;
                delete next.overwrite_width;
                delete next.overwrite_height;
                delete next.resolution;
                delete next.size;
            }
            if (!vlmAgentUserExplicitlyRequestedGenerationControl(source, 'steps')) {
                delete next.overwrite_step;
                delete next.steps;
                delete next.scene_steps;
            }
            if (!vlmAgentUserExplicitlyRequestedGenerationControl(source, 'cfg_scale')) {
                delete next.cfg_scale;
                delete next.guidance_scale;
                delete next.cfg;
                delete next.guidance;
            }
            if (!vlmAgentUserExplicitlyRequestedGenerationControl(source, 'seed')) {
                delete next.seed;
                delete next.image_seed;
                delete next.seed_random;
                delete next.random_seed;
                delete next.randomize_seed;
            }
            return next;
        }

        function stripVlmAgentUnrequestedNegativePrompt(action, userPrompt) {
            if (!action || typeof action !== 'object' || canvasAgentUserExplicitNegativePrompt(userPrompt)) return action;
            const next = Object.assign({}, action);
            delete next.negative_prompt;
            delete next.negativePrompt;
            delete next.negative;
            delete next.negative_image_prompt;
            return next;
        }

        function detectVlmImageGenerationIntent(prompt) {
            const text = String(prompt || '').trim();
            if (!text) return false;
            if (/^\/(?:t2i|generate|image|draw)\b/i.test(text)) return true;
            const imageObject = '(?:自拍|照片|图片|图像|图|画面|场景|插画|画作|作品|风景画|风景图|风景照|场景图|背景图|概念图|设定图|壁纸|海报|头像|image|picture|illustration|poster|avatar|selfie|wallpaper|background|landscape|concept art)';
            const drawAction = '(?:画|绘制|生成|创建|做|来|出|draw|generate|create|make)';
            const requestAction = '(?:给我|帮我|为我|我要|想要|需要|弄|整|来|出|make|give me|create)';
            if (new RegExp(`${drawAction}.{0,32}${imageObject}`, 'i').test(text)) return true;
            if (new RegExp(`${requestAction}.{0,32}${imageObject}`, 'i').test(text)) return true;
            if (/(自拍|selfie).{0,24}(画|绘制|生成|创建|做|来|draw|generate|create|make)/i.test(text)) return true;
            if (/(上一张|上张|刚才|刚生成|previous|last).{0,24}(图|图片|image|picture).{0,24}(编辑|修改|继续|改|edit|modify|continue)/i.test(text)) return 'edit_image';
            return new RegExp(`${drawAction}.{0,24}${imageObject}`, 'i').test(text)
                || /(generate|create|draw|make).{0,24}(image|picture|illustration|poster|avatar|wallpaper|background|landscape|concept art)/i.test(text);
        }

        function vlmAssistantPretendsGenerationComplete(text) {
            return /generation\s+complete|image\s+is\s+now\s+attached|already\s+generated|已.{0,12}生成|生成完成|请查收/i.test(String(text || ''));
        }

        function vlmVisualScenePromptHint(prompt) {
            const text = String(prompt || '').trim();
            return !!text && /画面|场景|情景|背景|沙滩|海边|海滩|泳装|泳衣|比基尼|穿着|玩耍|嬉戏|街|街上|街道|牵手|手牵手|走路|行走|做爱|性爱|接吻|亲吻|被喂|投喂|喂食|洗澡|浴室|scene|background|beach|seaside|street|city|holding\s+hands|walking|swimsuit|bikini|playing|sex|kiss|feed(?:ing)?|bathroom|bathing/i.test(text);
        }

        function vlmAgentPositiveVisualContextText(userPrompt, assistantText) {
            const user = String(userPrompt || '').trim();
            let assistant = String(assistantText || '').trim();
            if (assistant) {
                assistant = assistant
                    .replace(/```json[\s\S]*?```/gi, '')
                    .replace(/```\s*[\s\S]*?```/g, '')
                    .replace(/"negative_prompt"\s*:\s*"[^"]*"/gi, '')
                    .replace(/(?:^|\n)\s*(?:negative prompt|negative_prompt|负面提示词|负向提示词)\s*[:：][^\n\r]*/gi, '')
                    .replace(/(?:low quality|worst quality|bad anatomy|missing [a-z_ ]+|wrong [a-z_ ]+|blue eyes)/gi, '')
                    .trim();
            }
            return [user, assistant].filter(Boolean).join('\n');
        }

        function vlmAgentDanbooruContextTextForPrompt(userPrompt, assistantText) {
            const user = String(userPrompt || '').trim();
            if (!vlmAgentUserPromptHasAssistantPersonaImageIntent(user)) return user;
            return vlmAgentPositiveVisualContextText(userPrompt, assistantText);
        }

        function vlmFallbackToolActionsForPrompt(node, prompt, assistantText) {
            const mode = normalizeVlmAgentMode(node?.params || {});
            const preparedPrompt = extractVlmPreparedImagePrompt(assistantText);
            const assistantSuggestsGeneration = /confirm|confirmation card|Image Generation Recommendation|生成图片|生成这张|确认卡片|点击.*确认|回复.*生成/i.test(String(assistantText || ''));
            const assistantPretendsGenerated = vlmAssistantPretendsGenerationComplete(assistantText);
            const intent = detectVlmImageGenerationIntent(prompt)
                || ((preparedPrompt && assistantSuggestsGeneration) ? true : false)
                || vlmVisualScenePromptHint(prompt)
                || (assistantPretendsGenerated && vlmVisualScenePromptHint(prompt));
            if (mode === 'raw' || !intent) return [];
            const originalPrompt = cleanVlmToolPrompt(prompt) || String(prompt || '').trim();
            const presetEntry = findCanvasAgentPresetInstructionOverride(originalPrompt);
            const presetName = normalizePresetName(presetEntry?.name || presetEntry?.display_name || '');
            const cleanPrompt = presetName
                ? (stripCanvasAgentPresetFromPrompt(preparedPrompt || originalPrompt, presetEntry) || preparedPrompt || originalPrompt)
                : (preparedPrompt || originalPrompt);
            const isEdit = intent === 'edit_image';
            return [{
                action: isEdit ? 'edit_image' : 'generate_image',
                prompt: cleanPrompt,
                user_prompt: originalPrompt,
                preset: presetName,
                _frontend_fallback: 'true',
                summary: isEdit
                    ? t('Edit the previous generated image after confirmation.', '确认后编辑上一张生成图片。')
                    : t('Create an image from this request after confirmation.', '确认后根据这个请求生成图片。'),
                reason: preparedPrompt
                    ? t('Assistant prepared an image prompt in this reply.', 'Assistant 已在本次回复中准备好图片提示词。')
                    : t('Detected an explicit image generation request.', '检测到明确的图片生成请求。'),
                confidence: preparedPrompt ? '0.84' : '0.72'
            }];
        }

        async function prepareVlmAgentActionsForDisplay(node, actions, userPrompt, assistantText) {
            if (!Array.isArray(actions) || !actions.length) return [];
            const preparedFromText = extractVlmPreparedImagePrompt(assistantText);
            const positiveContextText = vlmAgentDanbooruContextTextForPrompt(userPrompt, assistantText);
            const preparedActions = [];
            const mergedActions = mergeVlmImageGenerationActions(actions, userPrompt);
            for (const rawAction of mergedActions.slice(0, 6)) {
                let action = stripVlmAgentUnrequestedNegativePrompt(sanitizeVlmAgentGenerationControlFields(rawAction, userPrompt), userPrompt);
                const type = normalizeVlmExecutableActionType(action?.action || action?.type || '');
                if (!isVlmImageToolActionType(type)) {
                    preparedActions.push(action);
                    continue;
                }
                if (!String(action?.preset || '').trim()) {
                    const presetEntry = findCanvasAgentPresetInstructionOverride(userPrompt);
                    const presetName = normalizePresetName(presetEntry?.name || presetEntry?.display_name || '');
                    if (presetName) action = Object.assign({}, action, { preset: presetName });
                }
                const purpose = vlmAgentActionPurpose(type);
                const target = canvasAgentPromptTargetFromPurpose(purpose, { presetName: action?.preset || '' });
                let prompt = vlmAgentCleanActionPrompt(action.prompt || action.image_prompt || action.recommended_prompt || action.final_prompt || '') || stripCanvasAgentInlineGenerationParams(preparedFromText) || '';
                const actionPresetEntry = findCanvasAgentPresetEntryByAlias(action?.preset || '');
                if (prompt && actionPresetEntry) {
                    prompt = stripCanvasAgentPresetFromPrompt(prompt, actionPresetEntry) || prompt;
                }
                const backendLocked = String(action?._backend_repaired || action?._canonical_locked || '').toLowerCase() === 'true';
                if (prompt && String(target?.key || '') === 'qwen_natural' && canvasAgentPromptNeedsTargetRewrite(prompt, target)) {
                    const naturalFallback = cleanVlmToolPrompt(action?.user_prompt || userPrompt) || String(userPrompt || '').trim();
                    if (naturalFallback && !canvasAgentPromptNeedsTargetRewrite(naturalFallback, target)) {
                        prompt = naturalFallback;
                    }
                }
                const promptAspect = extractCanvasAgentAspectFromText([action.prompt, action.image_prompt, action.recommended_prompt, action.final_prompt, preparedFromText].filter(Boolean).join('\n'));
                if (promptAspect && !action.aspect_ratio && !action.aspect && !action.ratio && !action.orientation) {
                    action.aspect_ratio = promptAspect;
                }
                const subjectCounts = vlmAgentSubjectCountHintFromAction(action);
                const forceDanbooruRepair = String(target?.key || '') === 'sdxl_danbooru'
                    && vlmAgentDanbooruPromptNeedsForcedCanonicalRepair(prompt, userPrompt, subjectCounts);
                if ((!backendLocked || forceDanbooruRepair) && prompt && canvasAgentPromptNeedsTargetRewrite(prompt, target)) {
                    const fallback = await canvasAgentDanbooruFallbackRewrite(prompt, target, purpose, {
                        action: type,
                        presetName: action?.preset || '',
                        promptSource: 'vlm_agent_card_prepare',
                        presetDefaults: canvasAgentPromptDefaultsForPurpose(purpose, { presetName: action?.preset || '' })
                    });
                    if (fallback) prompt = fallback;
                }
                if ((!backendLocked || forceDanbooruRepair) && prompt && String(target?.key || '') === 'sdxl_danbooru') {
                    prompt = canvasAgentMergeDanbooruPromptWithContext(
                        prompt,
                        positiveContextText,
                        target,
                        purpose,
                        {
                            action: type,
                            presetName: action?.preset || '',
                            presetDefaults: canvasAgentPromptDefaultsForPurpose(purpose, { presetName: action?.preset || '' }),
                            userPrompt,
                            subjectCounts
                        }
                    );
                    prompt = canvasAgentCanonicalizeDanbooruPrompt(
                        prompt,
                        positiveContextText,
                        target,
                        purpose,
                        {
                            action: type,
                            presetName: action?.preset || '',
                            presetDefaults: canvasAgentPromptDefaultsForPurpose(purpose, { presetName: action?.preset || '' }),
                            userPrompt,
                            subjectCounts
                        }
                    );
                }
                if (prompt) {
                    action = Object.assign({}, action, {
                        prompt,
                        recommended_prompt: prompt,
                        final_prompt: prompt
                    });
                }
                if (
                    node?.params?.enable_danbooru_review
                    && String(target?.key || '') === 'sdxl_danbooru'
                    && !(action?.prompt_review && typeof action.prompt_review === 'object')
                    && String(action?._frontend_fallback || '').toLowerCase() !== 'true'
                ) {
                    action = Object.assign({}, action, {
                        _prompt_review_rejected: 'true',
                        prompt_review: {
                            schema_version: 1,
                            state: 'reject',
                            score: 0,
                            intent_alignment: 0,
                            tag_validity: 0,
                            conflict_check: 0,
                            subject_integrity: 0,
                            safety_policy: 0,
                            prompt_readiness: 0,
                            issues: [{
                                code: 'frontend_unreviewed_action',
                                message: 'Review/Refine Prompt is enabled, but the backend did not return a reviewed Danbooru action. Send again after the backend reloads.'
                            }],
                            changes: [],
                            original_prompt: prompt,
                            final_prompt: prompt,
                            needs_user_confirmation: false,
                            source: 'frontend_guard'
                        }
                    });
                }
                preparedActions.push(action);
            }
            return preparedActions;
        }

        async function prepareVlmAgentActionExecution(node, messageIndex, action, type, sourceUserPrompt, assistantText) {
            let prompt = vlmAgentActionPrompt(node, messageIndex, action);
            const purpose = vlmAgentActionPurpose(type);
            const promptTarget = canvasAgentPromptTargetFromPurpose(purpose, { presetName: action?.preset || '' });
            const targetEntry = canvasAgentPromptTargetEntryForPurpose(purpose, { presetName: action?.preset || '' });
            const backendLocked = String(action?._backend_repaired || action?._canonical_locked || '').toLowerCase() === 'true';
            const subjectCounts = vlmAgentSubjectCountHintFromAction(action);
            const forceDanbooruRepair = String(promptTarget?.key || '') === 'sdxl_danbooru'
                && vlmAgentDanbooruPromptNeedsForcedCanonicalRepair(prompt, sourceUserPrompt, subjectCounts);
            if (prompt && String(promptTarget?.key || '') === 'qwen_natural' && canvasAgentPromptNeedsTargetRewrite(prompt, promptTarget)) {
                const naturalFallback = cleanVlmToolPrompt(action?.user_prompt || sourceUserPrompt) || String(sourceUserPrompt || '').trim();
                if (naturalFallback && !canvasAgentPromptNeedsTargetRewrite(naturalFallback, promptTarget)) {
                    prompt = naturalFallback;
                }
            }
            if ((!backendLocked || forceDanbooruRepair) && prompt && String(promptTarget?.key || '') === 'sdxl_danbooru') {
                const positiveContextText = vlmAgentDanbooruContextTextForPrompt(sourceUserPrompt, assistantText);
                prompt = canvasAgentMergeDanbooruPromptWithContext(prompt, positiveContextText, promptTarget, purpose, {
                    entry: targetEntry,
                    action: type,
                    presetName: action?.preset || '',
                    presetDefaults: canvasAgentPresetPromptDefaults(targetEntry),
                    userPrompt: sourceUserPrompt,
                    subjectCounts
                });
                prompt = canvasAgentCanonicalizeDanbooruPrompt(prompt, positiveContextText, promptTarget, purpose, {
                    entry: targetEntry,
                    action: type,
                    presetName: action?.preset || '',
                    presetDefaults: canvasAgentPresetPromptDefaults(targetEntry),
                    userPrompt: sourceUserPrompt,
                    subjectCounts
                });
            }
            const backendLockedMatchesTarget = backendLocked && !canvasAgentPromptNeedsTargetRewrite(prompt, promptTarget);
            const useFastPath = backendLockedMatchesTarget || vlmAgentPreparedPromptFastPath(prompt, promptTarget);
            let preparedPromptOverride = '';
            let preflight = null;
            if (useFastPath) {
                preparedPromptOverride = prompt;
                preflight = vlmAgentLocalPromptPreflightPass(prompt, promptTarget, type, purpose);
            } else {
                const rewriteContext = {
                    entry: targetEntry,
                    action: type,
                    presetName: action?.preset || '',
                    promptSource: 'vlm_agent_prepared',
                    presetDefaults: canvasAgentPresetPromptDefaults(targetEntry),
                    userPrompt: sourceUserPrompt
                };
                const localFallback = canvasAgentPromptNeedsTargetRewrite(prompt, promptTarget)
                    ? await canvasAgentDanbooruFallbackRewrite(prompt, promptTarget, purpose, rewriteContext)
                    : '';
                if (localFallback && vlmAgentPreparedPromptFastPath(localFallback, promptTarget)) {
                    prompt = localFallback;
                    preparedPromptOverride = prompt;
                    preflight = vlmAgentLocalPromptPreflightPass(prompt, promptTarget, type, purpose);
                } else {
                    const targetRewrite = await ensureCanvasAgentPromptMatchesTarget(prompt, promptTarget, purpose, rewriteContext);
                    if (targetRewrite.ok && targetRewrite.prompt) {
                        prompt = targetRewrite.prompt;
                        preparedPromptOverride = prompt;
                    }
                    const wildcardPreview = await wildcardsPreview({
                        user_context: getWorkbenchUserContext(),
                        prompt,
                        negative_prompt: '',
                        seed: -1,
                        image_number: 1,
                        max_samples: 3
                    });
                    preflight = await canvasAgentPromptPreflight(prompt, promptTarget, purpose, {
                        entry: targetEntry,
                        action: type,
                        presetName: action?.preset || '',
                        userPrompt: sourceUserPrompt,
                        wildcardPreview: wildcardPreview?.ok ? wildcardPreview : null
                    });
                }
            }
            if (String(preflight?.state || '') === 'block') {
                return {
                    ok: false,
                    state: 'blocked',
                    message: preflight.summary || t('Prompt preflight blocked generation.', '提示词预检查阻止了生成。'),
                    preflight
                };
            }
            return {
                ok: true,
                prompt,
                purpose,
                prompt_target: promptTarget,
                prompt_preflight: preflight,
                prompt_override: preparedPromptOverride
            };
        }

        async function executeVlmAgentImageAction(node, messageIndex, actionIndex, action, type, options) {
            const prompt = String(options?.promptOverride || vlmAgentActionPrompt(node, messageIndex, action) || '').trim();
            if (!prompt) return { ok: false, message: t('No image prompt was found for this action.', '没有找到可用于生成图片的提示词。') };
            prepareVlmAgentImageActionStart(prompt);
            const sourceVlmNodeId = node?.id || '';
            const sourceUserPrompt = vlmAgentPreviousUserPrompt(node, messageIndex) || action?.user_prompt || '';
            const presetHint = normalizePresetName(action?.preset || '');
            const t2iWorkflowKey = presetHint ? vlmCanvasAgentWorkflowKey(sourceVlmNodeId, 't2i', presetHint) : '';
            let runResponse = null;
            if (type === 'edit_image') {
                const target = getNode(action?.target_node_id || action?.node_id || '') || latestVlmChatResultNode(node);
                runResponse = await runCanvasAgentImageEdit(prompt, {
                    originalPrompt: prompt,
                    presetName: action?.preset || '',
                    negativePrompt: vlmAgentActionNegativePrompt(action, prompt),
                    recommendedPrompt: prompt,
                    skipPromptResolve: true,
                    skipPromptTargetChecks: true,
                    promptPreflight: options?.promptPreflight || null,
                    autoStart: true,
                    promptSource: 'vlm_agent_prepared',
                    sourceVlmNodeId,
                    targetNodeId: target?.id || '',
                    ignoreSelectedTarget: true,
                    plan: vlmAgentActionExecutionPlan(action, 'image_edit', prompt, sourceUserPrompt)
                });
            } else if (type === 'outpaint_image') {
                await runCanvasAgentQuickTool('outpaint');
            } else if (type === 'erase_image') {
                await runCanvasAgentQuickTool('erase');
            } else if (type === 'replace_image') {
                await runCanvasAgentQuickTool('replace');
            } else if (type === 'upscale_image') {
                await runCanvasAgentQuickTool('upscale');
            } else {
                runResponse = await runCanvasAgentTextToImage(prompt, {
                    originalPrompt: prompt,
                    presetName: action?.preset || '',
                    negativePrompt: vlmAgentActionNegativePrompt(action, prompt),
                    recommendedPrompt: prompt,
                    skipPromptResolve: true,
                    skipPromptTargetChecks: true,
                    promptPreflight: options?.promptPreflight || null,
                    autoStart: true,
                    promptSource: 'vlm_agent_prepared',
                    sourceVlmNodeId,
                    workflowKey: t2iWorkflowKey,
                    reuseExistingWorkflowResult: true,
                    ignoreSelectedTarget: true,
                    plan: vlmAgentActionExecutionPlan(action, 'text_to_image', prompt, sourceUserPrompt)
                });
            }
            if (runResponse) {
                rememberVlmChatToolResult(node, type === 'edit_image' ? 'edit' : 't2i', runResponse);
            }
            return runResponse
                ? {
                    ok: !!runResponse.ok,
                    message: runResponse.ok
                        ? t('Generation finished and was added to this chat.', '生成已完成，并已加入当前聊天。')
                        : (runResponse.error || t('Generation failed.', '生成失败。')),
                    runResponse
                }
                : { ok: true, message: t('Agent action started.', 'Agent 动作已启动。') };
        }

        async function executeVlmAgentImageActionWithLock(node, messageIndex, actionIndex, action, type, options) {
            const opts = options || {};
            const lockKey = `${node?.id || ''}:${messageIndex}:${actionIndex}`;
            addVlmAgentActionRunLock(lockKey);
            setVlmAgentActionExecution(node, messageIndex, actionIndex, {
                state: 'running',
                message: opts.autoConfirmed
                    ? t('Auto-confirmed; running generation...', '已自动确认，正在生成...')
                    : t('Confirmed; running generation...', '已确认，正在生成...')
            });
            try {
                return await executeVlmAgentImageAction(node, messageIndex, actionIndex, action, type, {
                    promptOverride: opts.promptOverride || '',
                    promptPreflight: opts.promptPreflight || null
                });
            } catch (err) {
                return { ok: false, message: err?.message || String(err) || t('Action failed.', '动作失败。') };
            } finally {
                deleteVlmAgentActionRunLock(lockKey);
            }
        }

        function finalizeVlmAgentActionExecution(node, messageIndex, actionIndex, type, result) {
            const existingRunPreparing = isVlmAgentRunAlreadyPreparingResult(result);
            let finalResult = result;
            if (existingRunPreparing) {
                finalResult = Object.assign({}, finalResult || {}, {
                    message: t('A generation is already preparing or running; focusing the current task.', '已有生成正在准备或运行中，已定位到当前任务。')
                });
            }
            setVlmAgentActionExecution(node, messageIndex, actionIndex, {
                state: vlmAgentActionResultState(finalResult, existingRunPreparing),
                message: vlmAgentActionResultMessage(finalResult)
            });
            if (isVlmImageToolActionType(type) && finalResult?.runResponse) {
                const liveNode = getNode(node?.id || '');
                const resultNode = getNode(finalResult.runResponse.result_node_id || '');
                const toolMessage = vlmAgentToolResultMessage(type, finalResult, existingRunPreparing, !!resultNode);
                if (liveNode && toolMessage) {
                    appendVlmChatToolMessage(liveNode.id, toolMessage.content, Object.assign({}, toolMessage, {
                        resultNode: finalResult.ok ? resultNode : null
                    }));
                }
            }
            showToast(finalResult?.message || (finalResult?.ok ? t('Agent action executed.', 'Agent action 已执行') : t('Agent action failed.', 'Agent action 执行失败')), finalResult?.ok ? 2200 : 3600);
            return { result: finalResult, existingRunPreparing };
        }

        function executeVlmAgentSafeAction(type, action, targetId) {
            const normalized = normalizeVlmExecutableActionType(type);
            if (normalized === 'focus_node') return focusVlmAgentTarget(targetId);
            if (normalized === 'select_node' || normalized === 'explain_node') return selectVlmAgentTarget(targetId);
            if (normalized === 'inspect_tool_status') {
                const result = describeVlmAgentToolStatus(action);
                if (result?.target_id) focusVlmAgentTarget(result.target_id);
                return result;
            }
            if (normalized === 'find_broken_edges') return findVlmAgentBrokenEdges();
            if (normalized === 'summarize_canvas' || normalized === 'suggest_next_node') {
                return { ok: true, message: t('This action is advisory; review the assistant message.', '这是建议类 action，请查看助手消息') };
            }
            return { ok: false, message: t('Unsupported safe action: {action}', '不支持的安全 action：{action}').replace('{action}', normalized || 'unknown') };
        }

        function prepareVlmAgentRetryContext(node, messageIndex, actionIndex) {
            const messages = Array.isArray(node?.chat?.messages) ? node.chat.messages.slice() : [];
            const action = getVlmAgentAction(node, messageIndex, actionIndex);
            const sourceUserPrompt = vlmAgentPreviousUserPrompt(node, messageIndex) || action?.user_prompt || '';
            if (!String(sourceUserPrompt || '').trim()) return { ok: false, reason: 'missing_source_prompt' };
            let userIndex = -1;
            for (let i = Number(messageIndex) - 1; i >= 0; i -= 1) {
                if (messages[i]?.role === 'user' && String(messages[i]?.content || '').trim()) {
                    userIndex = i;
                    break;
                }
            }
            const sourceUserMessage = userIndex >= 0 ? messages[userIndex] : null;
            const pendingImages = Array.isArray(sourceUserMessage?.images)
                ? sourceUserMessage.images
                    .filter(item => item && item.data_url)
                    .map(item => cloneRunValue(item, {}))
                    .slice(0, 4)
                : [];
            const keptMessages = userIndex >= 0 ? messages.slice(0, userIndex) : messages.slice(0, Number(messageIndex));
            return {
                ok: true,
                sourceUserPrompt: String(sourceUserPrompt || '').trim(),
                pendingImages,
                keptMessages,
                userIndex
            };
        }

        function prepareVlmAgentPromptReviewBypass(action) {
            if (!isVlmAgentPromptReviewBypassable(action)) {
                return {
                    ok: false,
                    message: t('This rejection is a local safety block and cannot be bypassed.', '这是本地安全拦截，不能放行。')
                };
            }
            const review = action?.prompt_review && typeof action.prompt_review === 'object' ? action.prompt_review : {};
            const issues = Array.isArray(review.issues) ? review.issues.slice() : [];
            issues.push({
                code: 'user_bypassed_prompt_review',
                message: 'User chose to bypass the optional prompt review gate.'
            });
            return {
                ok: true,
                patch: {
                    _prompt_review_rejected: 'false',
                    _prompt_review_bypassed: 'true',
                    prompt_review: Object.assign({}, review, {
                        state: 'warn',
                        needs_user_confirmation: true,
                        bypassed: true,
                        issues
                    }),
                    execution: {
                        state: 'queued',
                        message: t('Prompt review bypassed by user; preparing generation...', '用户已放行审查结果，正在准备生成...'),
                        at: nowIso()
                    }
                }
            };
        }

        async function prepareVlmAgentImageExecution(node, messageIndex, action, type, sourceUserPrompt, assistantText, bypassPromptReview) {
            const promptReviewGate = vlmAgentPromptReviewGate(action, !!bypassPromptReview);
            if (!promptReviewGate.allowed) {
                return {
                    ok: false,
                    message: promptReviewGate.message,
                    execution: {
                        state: 'blocked',
                        message: promptReviewGate.message,
                        prompt_review: promptReviewGate.prompt_review
                    }
                };
            }
            const promptPreparation = await prepareVlmAgentActionExecution(
                node,
                messageIndex,
                action,
                type,
                sourceUserPrompt,
                assistantText
            );
            if (!promptPreparation.ok) {
                return {
                    ok: false,
                    message: promptPreparation.message,
                    execution: {
                        state: 'blocked',
                        message: promptPreparation.message,
                        preflight: promptPreparation.preflight
                    }
                };
            }
            return {
                ok: true,
                promptPreflight: promptPreparation.prompt_preflight,
                promptOverride: promptPreparation.prompt_override || ''
            };
        }

        async function executeVlmAgentAction(node, messageIndex, actionIndex, options) {
            const opts = options || {};
            const liveNode = getNode(node?.id || '');
            if (liveNode) node = liveNode;
            const action = getVlmAgentAction(node, messageIndex, actionIndex);
            if (!action) return null;
            const type = normalizeVlmExecutableActionType(action.action || action.type || '');
            const lockKey = `${node.id}:${messageIndex}:${actionIndex}`;

            try {
                const executionGate = vlmAgentActionExecutionGate(action, hasVlmAgentActionRunLock(lockKey));
                if (!executionGate.allowed) {
                    if (executionGate.state) {
                        setVlmAgentActionExecution(node, messageIndex, actionIndex, {
                            state: executionGate.state,
                            message: executionGate.message
                        });
                    }
                    showToast(executionGate.message);
                    return { ok: false, message: executionGate.message };
                }
                if (opts.rememberAutoConfirm && isVlmImageToolActionType(type)) {
                    pushHistoryBatch(`vlm-agent-auto-confirm:${node.id}`, 'Enable VLM agent auto confirm');
                    Object.assign(node, buildVlmParamsPatch(node, {
                        paramsPatch: { agent_auto_confirm_generation: true }
                    }));
                }

                const targetId = vlmAgentActionTargetId(action);
                const sourceUserPrompt = vlmAgentPreviousUserPrompt(node, messageIndex) || action?.user_prompt || '';
                const assistantMessage = Array.isArray(node?.chat?.messages) ? node.chat.messages[messageIndex] : null;
                const assistantText = vlmChatMessageContextText(assistantMessage);
                let result;
                if (isVlmImageToolActionType(type)) {
                    const imagePreparation = await prepareVlmAgentImageExecution(
                        node,
                        messageIndex,
                        action,
                        type,
                        sourceUserPrompt,
                        assistantText,
                        !!opts.bypassPromptReview
                    );
                    if (!imagePreparation.ok) {
                        setVlmAgentActionExecution(node, messageIndex, actionIndex, {
                            ...(imagePreparation.execution || {}),
                            state: imagePreparation.execution?.state || 'blocked',
                            message: imagePreparation.message
                        });
                        showToast(imagePreparation.message);
                        return { ok: false, message: imagePreparation.message };
                    }
                    result = await executeVlmAgentImageActionWithLock(
                        node,
                        messageIndex,
                        actionIndex,
                        action,
                        type,
                        {
                            promptOverride: imagePreparation.promptOverride || '',
                            promptPreflight: imagePreparation.promptPreflight,
                            autoConfirmed: !!opts.autoConfirmed
                        }
                    );
                } else {
                    result = executeVlmAgentSafeAction(type, action, targetId);
                }
                const finalized = finalizeVlmAgentActionExecution(
                    node,
                    messageIndex,
                    actionIndex,
                    type,
                    result
                );
                return finalized?.result || result;
            } catch (err) {
                const message = err?.message || String(err || '') || t('Agent action failed.', 'Agent action 执行失败');
                const failure = { ok: false, message };
                const finalized = finalizeVlmAgentActionExecution(
                    node,
                    messageIndex,
                    actionIndex,
                    type,
                    failure
                );
                return finalized?.result || failure;
            }
        }

        async function finalizeVlmNodeRunResponse(node, response, options) {
            const opts = options || {};
            const current = getNode(node?.id || '') || node;
            if (!current) return;
            const isChat = !!opts.isChat;
            const params = opts.params && typeof opts.params === 'object' ? opts.params : {};
            const userPrompt = String(opts.userPrompt || '').trim();
            const submittedPendingImages = Array.isArray(opts.submittedPendingImages) ? opts.submittedPendingImages : [];
            const rollingHistoryInfo = opts.rollingHistoryInfo || { omitted: 0, chars: 0, max_history: 0, budget: 0 };

            if (isChat && (response?.aborted || response?.cancelled)) {
                replaceVlmChatPendingMessage(current, t('Stopped.', '已停止。'));
                applyVlmRunStatus(current, {
                    status: {
                        state: 'idle',
                        message: t('VLM chat reply stopped.', 'VLM chat 回复已停止。')
                    }
                });
                applyVlmLastResponse(current, {
                    response: response || { ok: false, aborted: true, cancelled: true }
                });
                mutate();
                scrollVlmChatToBottom(current.id);
                return { ok: false, aborted: true, cancelled: true };
            }

            if (response?.ok) {
                let autoActionIndex = -1;
                let autoAssistantIndex = -1;
                if (isChat) {
                    const messages = Array.isArray(current.chat?.messages) ? current.chat.messages.slice() : [];
                    let responseActions = Array.isArray(response.agent_actions) ? response.agent_actions : [];
                    if (!responseActions.length) responseActions = extractVlmAgentActionsFromText(response.text || '');
                    if (!responseActions.length) responseActions = vlmFallbackToolActionsForPrompt(current, userPrompt, response.text || '');
                    responseActions = await prepareVlmAgentActionsForDisplay(current, responseActions, userPrompt, response.text || '');
                    const autoConfirmEnabled = vlmAgentAutoConfirmEnabled(current, params);
                    const responseState = prepareVlmChatAssistantResponse(
                        messages,
                        response,
                        responseActions,
                        rollingHistoryInfo,
                        { autoConfirmEnabled, conversationId: params.conversation_id }
                    );
                    autoAssistantIndex = responseState.assistant_index;
                    autoActionIndex = responseState.auto_action_index;
                    applyVlmChatState(current, {
                        messages: responseState.messages,
                        pendingImages: Array.isArray(current.chat?.pending_images) ? current.chat.pending_images : [],
                        conversationId: responseState.conversation_id,
                        agentToolState: current.chat?.agent_tool_state || {},
                        updatedAt: nowIso()
                    });
                    Object.assign(current, buildVlmParamsPatch(current, {
                        paramsPatch: { conversation_id: responseState.conversation_id }
                    }));
                    markVlmChatStickToBottom(current.id);
                }
                applyVlmText(current, {
                    text: {
                        value: response.text || '',
                        updated_at: nowIso()
                    }
                });
                applyVlmRunStatus(current, {
                    status: {
                        state: 'finished',
                        message: response?.params?.stateless_llamacpp_chat
                            ? t('VLM chat response received with rolling context.', 'VLM 已使用滚动上下文返回回复。')
                            : (response.text ? (isChat ? 'VLM chat response received.' : 'VLM output generated.') : 'VLM finished with empty output.')
                    }
                });
                applyVlmLastResponse(current, { response });
                showToast(isChat ? 'VLM chat response received' : 'VLM output generated');
                mutate();
                if (isChat) scrollVlmChatToBottom(current.id);
                if (isChat && autoActionIndex >= 0) {
                    const autoNodeId = current.id;
                    schedule(() => {
                        const liveNode = getNode(autoNodeId);
                        if (!liveNode) return;
                        const liveMessages = Array.isArray(liveNode.chat?.messages) ? liveNode.chat.messages : [];
                        const liveIndex = Math.min(autoAssistantIndex, liveMessages.length - 1);
                        executeVlmAgentAction(liveNode, liveIndex, autoActionIndex, { autoConfirmed: true });
                    }, 80);
                }
                return { ok: true, text: current.text.value };
            }

            if (isChat) {
                const messages = Array.isArray(current.chat?.messages) ? current.chat.messages.slice() : [];
                const failureState = prepareVlmChatFailureResponse(messages, response, {
                    currentPrompt: current.params?.prompt || '',
                    currentPendingImages: current.chat?.pending_images,
                    submittedPendingImages,
                    userPrompt
                });
                applyVlmChatState(current, {
                    messages: failureState.messages,
                    pendingImages: failureState.pending_images,
                    updatedAt: nowIso()
                });
                if (failureState.restore_prompt) {
                    Object.assign(current, buildVlmParamsPatch(current, {
                        paramsPatch: { prompt: failureState.prompt }
                    }));
                }
                markVlmChatStickToBottom(current.id);
            }
            applyVlmRunStatus(current, {
                status: {
                    state: 'failed',
                    message: response?.details || response?.error || 'VLM failed'
                }
            });
            applyVlmLastResponse(current, { response: response || {} });
            showToast(`VLM failed: ${response?.error || 'unknown error'}`);
            mutate();
            if (isChat) scrollVlmChatToBottom(current.id);
            return { ok: false, error: current.status.message };
        }

        function clearVlmChatNode(node) {
            if (!node || node.type !== 'vlm' || isNodeLocked(node)) return;
            if (!confirmDialog(t(
                'Clear chat history? Your current input and attached images will stay.',
                '清空聊天记录？当前输入和待发送图片会保留。'
            ))) return;
            const currentPrompt = String(node.params?.prompt || '');
            const pendingImages = Array.isArray(node.chat?.pending_images) ? node.chat.pending_images : [];
            const agentToolState = node.chat?.agent_tool_state || {};
            const requestState = getVlmChatRequest(node.id);
            cancelVlmChatRequest(node, requestState).catch(() => {});
            const conversationId = uid('vlm_chat');
            pushHistory('Clear VLM chat');
            applyVlmChatState(node, {
                messages: [],
                conversationId,
                pendingImages,
                agentToolState,
                updatedAt: nowIso()
            });
            Object.assign(node, buildVlmParamsPatch(node, {
                paramsPatch: {
                    conversation_id: conversationId,
                    prompt: currentPrompt
                }
            }));
            applyVlmText(node, {
                text: { value: '', updated_at: nowIso() }
            });
            applyVlmRunStatus(node, {
                statusPatch: {
                    state: 'idle',
                    message: 'Chat context cleared. Send a new message to start again.'
                }
            });
            mutate();
            showToast('VLM chat cleared');
        }

        async function unloadVlmNodeModel(node) {
            if (!node || node.type !== 'vlm') return { ok: false, error: 'VLM node is unavailable' };
            applyVlmRunStatus(node, {
                statusPatch: {
                    state: 'waiting',
                    message: 'Unloading VLM model...'
                }
            });
            mutate({ inspector: true });
            const project = getProject() || {};
            const response = await sendVlmUnload({
                project_id: project.id || getDefaultProjectId(),
                node_id: node.id,
                conversation_id: node.params?.conversation_id || '',
                clear_context: false
            });
            const current = getNode(node.id);
            if (!current) return response || { ok: false, error: 'node removed' };
            if (response?.ok) {
                applyVlmRunStatus(current, {
                    status: {
                        state: 'idle',
                        message: response.message || 'VLM model unloaded.'
                    }
                });
                showToast(t('VLM model unloaded.', 'VLM 模型已卸载'));
            } else {
                applyVlmRunStatus(current, {
                    status: {
                        state: 'failed',
                        message: response?.details || response?.error || 'VLM unload failed'
                    }
                });
                showToast(`VLM unload failed: ${response?.error || 'unknown error'}`);
            }
            mutate();
            return response;
        }

        async function checkVlmModelAction(node) {
            const status = await checkVlmModelStatus(node);
            if (!status?.ok) {
                showToast(`VLM model check failed: ${status?.error || status?.details || 'unknown error'}`);
                return status;
            }
            if (status.ready) {
                showToast(String(status.state || '').toLowerCase() === 'custom'
                    ? (status.message || 'Custom API is ready.')
                    : (status.vision_status === 'missing'
                        ? t('Vision model missing (mmproj); image input is unavailable.', '缺少视觉模型（mmproj），当前无法输入图像。')
                        : 'VLM model files are ready.'));
                return status;
            }
            if (String(status.state || '').toLowerCase() === 'custom') {
                showToast(status.message || 'Complete Custom API settings before running.');
                return status;
            }
            openVlmMissingModelModal(getNode(node?.id) || node);
            const count = Number(status.missing_count || 0);
            showToast(`VLM is missing ${count} model file(s). Download before running.`);
            return status;
        }

        async function queueVlmModelDownloads(node, options) {
            if (!node || node.type !== 'vlm') return { ok: false, error: 'VLM node is unavailable' };
            Object.assign(node, buildVlmModelStatusPatch(node, {
                statusPatch: {
                    state: 'checking',
                    message: 'Queuing VLM model downloads...'
                }
            }));
            renderAll({ inspector: false });
            const response = await sendVlmModelDownloads(node, options || {});
            const current = getNode(node.id);
            if (current) {
                applyVlmModelStatus(current, response);
                if (response?.ok && response.state === 'queued') {
                    Object.assign(current, buildVlmModelStatusPatch(current, {
                        statusPatch: {
                            state: 'queued',
                            message: response.message || `Queued ${response.queued_count || 0} VLM model download task(s).`
                        }
                    }));
                }
                mutate({ inspector: false });
            }
            if (response?.ok) {
                showToast(response.message || 'VLM model downloads queued.');
                openVlmMissingModelModal(getNode(node.id) || node);
            } else {
                showToast(`VLM model download failed: ${response?.error || response?.details || 'unknown error'}`);
            }
            return response;
        }

        async function fetchVlmCustomModels(node) {
            if (!node || node.type !== 'vlm') return { ok: false, error: 'VLM node is unavailable' };
            persistVlmCustomSecretIfPresent(node);
            applyVlmRunStatus(node, {
                statusPatch: {
                    state: 'checking',
                    message: 'Fetching custom model list...'
                }
            });
            mutate({ inspector: false });
            const response = await sendVlmCustomModels(node);
            const current = getNode(node.id);
            if (!current) return response;
            if (response?.ok) {
                applyVlmCustomModelChoices(current, Array.isArray(response.models) ? response.models : []);
                if (!current.params?.custom_model && current.custom_model_choices.length) {
                    Object.assign(current, buildVlmParamsPatch(current, {
                        paramsPatch: { custom_model: current.custom_model_choices[0] }
                    }));
                }
                applyVlmRunStatus(current, {
                    statusPatch: {
                        state: 'idle',
                        message: `Fetched ${current.custom_model_choices.length} model(s).`
                    }
                });
                showToast(`Fetched ${current.custom_model_choices.length} custom model(s).`);
            } else {
                applyVlmRunStatus(current, {
                    statusPatch: {
                        state: 'error',
                        message: response?.details || response?.error || 'Custom model fetch failed.'
                    }
                });
                showToast(`Fetch models failed: ${current.status.message}`);
            }
            mutate({ inspector: true });
            return response;
        }

        function persistVlmCustomSecretIfPresent(node) {
            if (!node || node.type !== 'vlm') return;
            const temporaryKey = String(getVlmCustomKeyValue(node) || '').trim();
            if (!temporaryKey) return;
            const profiles = readVlmCustomApiProfiles();
            const key = getVlmCustomProfileKey(node.params || {});
            profiles[key] = Object.assign({}, profiles[key] || {}, {
                api_key: temporaryKey,
                updated_at: nowIso()
            });
            writeVlmCustomApiProfiles(profiles);
        }

        function toggleVlmCustomApi(node) {
            if (!node || node.type !== 'vlm') return;
            pushHistoryBatch(`vlm:${node.id}:custom-api-collapse`, 'Toggle Custom API panel');
            Object.assign(node, buildVlmParamsPatch(node, {
                paramsPatch: { custom_api_collapsed: node.params?.custom_api_collapsed !== true }
            }));
            mutate({ inspector: true });
        }

        async function testVlmCustomApi(node) {
            if (!node || node.type !== 'vlm') return { ok: false, error: 'VLM node unavailable' };
            const params = getVlmCustomRuntimeParams(node);
            const runtime = Object.assign({}, params || {}, {
                version: 'Custom',
                mode: 'single',
                prompt: 'Reply with OK.',
                system_prompt: 'You are an API connectivity tester. Reply with OK only.',
                max_tokens: 16,
                temperature: 0,
                top_p: 1,
                seed: -1,
                disable_thinking: true,
                free_after: false
            });
            if (!runtime.custom_base_url || !runtime.custom_model) {
                showToast(t(
                    'Custom API settings incomplete: Base URL and Model are required. API Key can stay empty for Ollama/LM Studio.',
                    'Custom API 设置不完整：需要 Base URL 和 Model；Ollama/LM Studio 可不填 API Key'
                ));
                return { ok: false, error: 'Custom API settings incomplete' };
            }
            showToast(t('Testing Custom API...', '正在测试 Custom API...'));
            const project = getProject() || {};
            const response = await sendVlmRunRequest({
                project_id: project.id || getDefaultProjectId(),
                node_id: `custom_api_test:${node.id || 'vlm'}`,
                asset_sources: [],
                conversation_id: '',
                params: runtime
            });
            if (response?.ok) {
                showToast(t('Custom API test succeeded: {text}', 'Custom API 测试成功：{text}').replace('{text}', String(response.text || 'OK').slice(0, 80)));
            } else {
                showToast(t('Custom API test failed: {error}', 'Custom API 测试失败：{error}').replace('{error}', response?.details || response?.error || 'unknown error'));
            }
            return response;
        }

        function saveVlmCustomSecret(node) {
            if (!node || node.type !== 'vlm') return;
            const apiKey = String(getVlmCustomKeyValue(node) || '').trim();
            if (!apiKey) {
                showToast(t('Paste an API key first.', '请先粘贴 API Key'));
                return;
            }
            const profiles = readVlmCustomApiProfiles();
            const key = getVlmCustomProfileKey(node.params || {});
            profiles[key] = Object.assign({}, profiles[key] || {}, {
                api_key: apiKey,
                api_name: node.params?.custom_api_name || key,
                provider: node.params?.custom_provider || 'openai',
                base_url: node.params?.custom_base_url || getVlmCustomProvider(node.params?.custom_provider || 'openai')?.baseUrl || '',
                updated_at: nowIso()
            });
            writeVlmCustomApiProfiles(profiles);
            showToast(t('API key saved in browser local storage.', 'API Key 已保存到浏览器本地存储'));
        }

        function loadVlmCustomSecret(node) {
            if (!node || node.type !== 'vlm') return;
            const profile = readVlmCustomApiProfiles()[getVlmCustomProfileKey(node.params || {})] || null;
            if (profile?.api_key) setVlmCustomKeyValue(node, profile.api_key);
            showToast(profile?.api_key
                ? t('API key loaded.', 'API Key 已读取')
                : t('No saved key for this API name.', '当前 API 名称没有保存的密钥'));
        }

        function deleteVlmCustomSecret(node) {
            if (!node || node.type !== 'vlm') return;
            const profiles = readVlmCustomApiProfiles();
            const key = getVlmCustomProfileKey(node.params || {});
            delete profiles[key];
            writeVlmCustomApiProfiles(profiles);
            setVlmCustomKeyValue(node, '');
            showToast(t('API key deleted from browser local storage.', 'API Key 已从浏览器本地存储删除'));
        }

        function syncVlmCustomFromAgent(node) {
            if (!node || node.type !== 'vlm') return;
            const params = getCanvasAgentCustomParams() || {};
            pushHistory('Sync Custom API from Agent');
            Object.assign(node, buildVlmParamsPatch(node, {
                paramsPatch: {
                    version: 'Custom',
                    custom_provider: params.custom_provider,
                    custom_api_name: params.custom_api_name,
                    custom_api_format: params.custom_api_format,
                    custom_base_url: params.custom_base_url,
                    custom_model: params.custom_model,
                    custom_supports_images: params.custom_supports_images,
                    custom_api_collapsed: false
                }
            }));
            Object.assign(node, buildVlmModelStatusPatch(node, {
                status: {
                    state: 'unknown',
                    ready: false,
                    version: 'Custom',
                    message: 'Custom API settings changed. Test or check before running.'
                }
            }));
            mutate({ inspector: true });
            showToast(t('VLM node synced from Agent Custom API settings.', 'VLM 节点已从 Agent Custom API 设置同步'));
        }

        function syncVlmCustomToAgent(node) {
            if (!node || node.type !== 'vlm') return;
            const params = node.params || {};
            setCanvasAgentCustomSettings({
                rewriteModel: 'Custom',
                customProvider: params.custom_provider || 'openai',
                customApiName: params.custom_api_name || 'Custom',
                customApiFormat: params.custom_api_format || 'openai_compatible',
                customBaseUrl: params.custom_base_url || '',
                customModel: params.custom_model || '',
                customSupportsImages: params.custom_supports_images !== false,
                customApiCollapsed: false
            }, { silentHistory: true });
            showToast(t('Agent Custom API settings synced from this VLM node.', 'Agent Custom API 设置已从该 VLM 节点同步'));
        }

        function finalizeVlmNodeModelGateFailure(node, modelGate, options) {
            const opts = options || {};
            const current = getNode(node?.id || '') || node;
            const nodeId = node?.id || current?.id || '';
            if (opts.isChat) clearVlmChatRequest(nodeId, opts.requestId || '');
            if (!current) return modelGate;
            const message = modelGate?.error || modelGate?.details || 'VLM model check failed';
            if (opts.isChat) {
                const messages = Array.isArray(current.chat?.messages) ? current.chat.messages.slice() : [];
                const pendingIndex = messages.findIndex(messageItem => messageItem?.role === 'assistant' && messageItem?.pending);
                const errorMessage = {
                    role: 'assistant',
                    content: message,
                    at: nowIso()
                };
                if (pendingIndex >= 0) messages[pendingIndex] = errorMessage;
                else messages.push(errorMessage);
                applyVlmChatState(current, {
                    messages: messages.slice(-40),
                    pendingImages: Array.isArray(opts.submittedPendingImages) ? opts.submittedPendingImages : [],
                    updatedAt: nowIso()
                });
                if (!String(current.params?.prompt || '').trim()) {
                    Object.assign(current, buildVlmParamsPatch(current, {
                        paramsPatch: { prompt: String(opts.userPrompt || '') }
                    }));
                }
                markVlmChatStickToBottom(current.id);
            }
            applyVlmRunStatus(current, {
                status: {
                    state: modelGate?.model_status && modelGate.model_status.ready === false ? 'blocked' : 'failed',
                    message
                }
            });
            mutate();
            if (opts.isChat) scrollVlmChatToBottom(current.id);
            return modelGate;
        }

        function isVlmNodeBusy(node) {
            const state = String(nodeStatusState(node) || '').toLowerCase();
            return ['running', 'waiting', 'queued', 'preparing', 'checking'].includes(state);
        }

        async function checkVlmModelStatus(node) {
            if (!node || node.type !== 'vlm') return { ok: false, error: 'VLM node is unavailable' };
            const checkingStatus = buildVlmModelCheckingStatus('Checking VLM model files...') || {
                state: 'checking',
                message: 'Checking VLM model files...'
            };
            Object.assign(node, buildVlmModelStatusPatch(node, {
                statusPatch: checkingStatus
            }));
            renderAll({ inspector: false });
            const response = await sendVlmModelStatus(node);
            const current = getNode(node.id);
            if (current) {
                applyVlmModelStatus(current, response);
                mutate({ inspector: false });
            }
            return response;
        }

        function isVlmModelStatusFresh(node) {
            const status = node?.vlm_model_status || {};
            if (!status.ready) return false;
            const currentVersion = String(node?.params?.version || '').trim();
            if (currentVersion && String(status.version || '').trim() && String(status.version || '').trim() !== currentVersion) return false;
            const checkedAt = parseDate(status.checked_at || '');
            if (!Number.isFinite(checkedAt)) return false;
            return now() - checkedAt < getVlmModelStatusCacheTtlMs();
        }

        async function runVlmNode(node) {
            if (!node || node.type !== 'vlm') return { ok: false, error: 'VLM node is unavailable' };
            if (isNodeIgnored(node)) {
                showToast('This VLM node is marked as skipped.');
                return { ok: false, error: 'VLM node is skipped' };
            }
            if (isVlmNodeBusy(node)) {
                showToast(t('VLM is still thinking. You can keep editing the next message while it finishes.', 'VLM 还在思考中。你可以继续编辑下一条消息，等待它完成。'));
                return { ok: false, error: 'VLM node is busy' };
            }
            const runContext = prepareVlmNodeRunContext(node);
            const { params, isChat, connectedSources, userPrompt } = runContext;
            if (!String(params.prompt || '').trim()) {
                showToast('VLM instruction cannot be empty.');
                return { ok: false, error: 'VLM instruction cannot be empty.' };
            }
            const runInput = prepareVlmNodeRunInput(node, {
                params,
                isChat,
                connectedSources,
                userPrompt
            });
            const {
                submittedPendingImages,
                assetSources,
                displayHistoryMessages,
                rollingHistory,
                historyMessages,
                chatRequestState,
                chatRequestId,
                chatImages
            } = runInput;
            prepareVlmNodeRunState(node, {
                isChat,
                params,
                displayHistoryMessages,
                userPrompt,
                assetSources,
                chatImages,
                conversationId: params.conversation_id || ''
            });
            return executeVlmNodeRun(node, {
                isChat,
                params,
                requestId: chatRequestId,
                assetSources,
                historyMessages,
                displayHistoryMessages,
                rollingHistoryInfo: rollingHistory.info,
                userPrompt,
                chatRequestState,
                submittedPendingImages
            });
        }

        function prepareVlmNodeRunState(node, options) {
            const opts = options || {};
            const isChat = !!opts.isChat;
            const params = opts.params && typeof opts.params === 'object' ? opts.params : {};
            const displayHistoryMessages = Array.isArray(opts.displayHistoryMessages) ? opts.displayHistoryMessages : [];
            const chatImages = Array.isArray(opts.chatImages) ? opts.chatImages : [];
            const assetSources = Array.isArray(opts.assetSources) ? opts.assetSources : [];
            const conversationId = String(opts.conversationId || params.conversation_id || '');
            const userPrompt = String(opts.userPrompt || '').trim();
            pushHistory('Run VLM node');
            applyVlmRunStatus(node, {
                status: {
                    state: 'running',
                    message: `${isChat ? 'Starting chat with' : 'Starting'} ${params.version || VLM_DEFAULT_VERSION}...`
                }
            });
            if (isChat) {
                const messages = displayHistoryMessages.slice();
                messages.push({
                    role: 'user',
                    content: userPrompt,
                    image_count: assetSources.length,
                    images: chatImages,
                    at: nowIso()
                });
                messages.push({
                    role: 'assistant',
                    content: t('Thinking', '思考中'),
                    pending: true,
                    at: nowIso()
                });
                applyVlmChatState(node, {
                    messages: messages.slice(-40),
                    pendingImages: [],
                    conversationId,
                    agentToolState: node.chat?.agent_tool_state || {},
                    updatedAt: nowIso()
                });
                Object.assign(node, buildVlmParamsPatch(node, {
                    paramsPatch: {
                        conversation_id: conversationId,
                        prompt: ''
                    }
                }));
                markVlmChatStickToBottom(node.id);
            }
            mutate();
            if (isChat) scrollVlmChatToBottom(node.id);
            return node;
        }

        function prepareVlmNodeRunContext(node) {
            const current = node || {};
            const params = getVlmCustomRuntimeParams(current) || {};
            const imageInputs = current.image_inputs || {};
            const isChat = (params.mode || 'single') === 'chat';
            const connectedSlots = isChat ? VLM_IMAGE_SLOTS.slice(0, 1) : VLM_IMAGE_SLOTS;
            const connectedSources = connectedSlots
                .map(slot => getNode(imageInputs[slot.key]))
                .filter(source => isVlmMediaSource(source)
                    && (!isChat || ['image', 'result'].includes(source.type))
                    && getVlmSourceAsset(source));
            return {
                params,
                isChat,
                connectedSources,
                userPrompt: String(params.prompt || '').trim()
            };
        }

        function prepareVlmNodeRunInput(node, options) {
            const opts = options || {};
            const params = opts.params && typeof opts.params === 'object' ? opts.params : {};
            const isChat = !!opts.isChat;
            if (isChat) {
                getVlmChatUiAreas(node).forEach((area) => {
                    if (!area?.querySelectorAll) return;
                    area.querySelectorAll('textarea[data-vlm-param="prompt"], input[data-vlm-param="prompt"]').forEach((field) => {
                        if (field && !field.readOnly && !field.disabled) field.value = '';
                    });
                });
            }
            const connectedSources = Array.isArray(opts.connectedSources) ? opts.connectedSources : [];
            const pendingImages = isChat && Array.isArray(node?.chat?.pending_images)
                ? node.chat.pending_images.filter(item => item?.data_url)
                : [];
            const submittedPendingImages = cloneRunValue(pendingImages, []);
            const assetSources = connectedSources.map(source => serializeAssetSourceForRun(source));
            pendingImages.forEach((item, index) => assetSources.push(serializeVlmPendingImageSource(node, item, index)));
            const userPrompt = String(opts.userPrompt ?? params.prompt ?? '').trim();
            const displayHistoryMessages = isChat && Array.isArray(node?.chat?.messages)
                ? cloneRunValue(node.chat.messages.slice(-40), [])
                : [];
            const rollingHistory = isChat
                ? buildVlmRollingHistoryMessages(node, displayHistoryMessages)
                : { messages: [], info: { omitted: 0, chars: 0, max_history: 0, budget: 0 } };
            if (isChat && !params.conversation_id) {
                const project = getProject() || {};
                params.conversation_id = `${project.id || getDefaultProjectId()}:${node.id}`;
                Object.assign(node, buildVlmParamsPatch(node, {
                    paramsPatch: { conversation_id: params.conversation_id }
                }));
            }
            const chatRequestState = isChat
                ? startVlmChatRequest(node.id, {
                    conversationId: params.conversation_id || '',
                    nodeId: node.id,
                    projectId: getProject()?.id || getDefaultProjectId()
                })
                : null;
            const chatRequestId = chatRequestState?.requestId || '';
            const chatImages = isChat ? snapshotVlmChatImages(pendingImages, connectedSources) : [];
            return {
                pendingImages,
                submittedPendingImages,
                assetSources,
                userPrompt,
                displayHistoryMessages,
                rollingHistory,
                historyMessages: rollingHistory.messages,
                chatRequestState,
                chatRequestId,
                chatImages
            };
        }

        async function ensureVlmModelsBeforeRun(node) {
            if (isVlmModelStatusFresh(node)) {
                return { ok: true, cached: true };
            }
            const status = await checkVlmModelStatus(node);
            if (status?.ok && status.ready) return { ok: true };
            if (status?.ok && !status.ready) {
                if (String(status.state || '').toLowerCase() === 'custom') {
                    showToast(status.message || 'Complete Custom API settings before running.');
                    return { ok: false, error: status.message || 'Custom API settings are incomplete', model_status: status };
                }
                const count = Number(status.missing_count || 0);
                openVlmMissingModelModal(getNode(node?.id) || node);
                const current = getNode(node?.id) || node;
                if (current) {
                    applyVlmRunStatus(current, {
                        status: {
                            state: 'blocked',
                            message: `Missing ${count} VLM model file(s).`
                        }
                    });
                    renderAll({ inspector: false });
                }
                return { ok: false, error: 'VLM model files are missing', model_status: status };
            }
            return { ok: false, error: status?.details || status?.error || 'VLM model check failed' };
        }

        async function executeVlmNodeRun(node, options) {
            const opts = options || {};
            const isChat = !!opts.isChat;
            const params = opts.params && typeof opts.params === 'object' ? opts.params : {};
            const requestId = String(opts.requestId || '').trim();
            const userPrompt = String(opts.userPrompt || '').trim();
            const rollingHistoryInfo = opts.rollingHistoryInfo
                || opts.rollingHistory?.info
                || {};
            const modelGate = await ensureVlmModelsBeforeRun(getNode(node?.id) || node);
            if (isChat && !isVlmChatRequestActive(node?.id || '', requestId)) {
                return { ok: false, aborted: true, cancelled: true };
            }
            if (!modelGate.ok) {
                return finalizeVlmNodeModelGateFailure(node, modelGate, {
                    isChat,
                    requestId,
                    userPrompt,
                    submittedPendingImages: opts.submittedPendingImages
                });
            }
            const requestPayload = prepareVlmNodeRunRequest(node, {
                isChat,
                params,
                requestId,
                assetSources: opts.assetSources,
                historyMessages: opts.historyMessages,
                displayHistoryMessages: opts.displayHistoryMessages,
                rollingHistoryInfo,
                userPrompt
            });
            const response = await sendVlmRunRequest(requestPayload, {
                signal: opts.chatRequestState?.controller?.signal
            });
            return settleVlmNodeRunResponse(node, response, {
                isChat,
                requestId,
                params,
                rollingHistoryInfo,
                userPrompt,
                submittedPendingImages: opts.submittedPendingImages
            });
        }

        function prepareVlmNodeRunRequest(node, options) {
            const opts = options || {};
            const params = opts.params && typeof opts.params === 'object' ? opts.params : {};
            const isChat = !!opts.isChat;
            const requestId = String(opts.requestId || '');
            const current = getNode(node?.id || '') || node;
            const project = getProject() || {};
            if (current) {
                applyVlmRunStatus(current, {
                    status: {
                        state: 'running',
                        message: `${isChat ? 'Chatting with' : 'Running'} ${params.version || VLM_DEFAULT_VERSION}...`
                    }
                });
                mutate({ inspector: false });
            }
            const requestParams = isChat ? Object.assign({}, params, { request_id: requestId }) : params;
            return {
                project_id: project.id || getDefaultProjectId(),
                node_id: node?.id || '',
                asset_sources: Array.isArray(opts.assetSources) ? opts.assetSources : [],
                conversation_id: params.conversation_id || '',
                request_id: requestId,
                chat_messages: Array.isArray(opts.historyMessages) ? opts.historyMessages : [],
                chat_messages_full: Array.isArray(opts.displayHistoryMessages) ? opts.displayHistoryMessages : [],
                context: opts.rollingHistoryInfo || {},
                agent_context: isChat ? buildVlmAgentContext(node, { userPrompt: opts.userPrompt || '' }) : null,
                params: requestParams
            };
        }

        async function settleVlmNodeRunResponse(node, response, options) {
            const opts = options || {};
            if (opts.isChat && !isVlmChatRequestActive(node?.id || '', opts.requestId || '')) {
                return { ok: false, aborted: !!response?.aborted, cancelled: !!response?.cancelled };
            }
            if (opts.isChat) clearVlmChatRequest(node?.id || '', opts.requestId || '');
            return finalizeVlmNodeRunResponse(node, response, opts);
        }

        function vlmAgentPromptReviewGate(action, bypassPromptReview) {
            const promptReview = action?.prompt_review && typeof action.prompt_review === 'object'
                ? action.prompt_review
                : null;
            if (!bypassPromptReview && isVlmAgentPromptReviewRejected(action)) {
                const issueText = Array.isArray(promptReview?.issues)
                    ? promptReview.issues.slice(0, 3)
                        .map(item => String(item?.message || item?.code || item || '').trim())
                        .filter(Boolean)
                        .join('; ')
                    : '';
                const message = issueText
                    ? t('Prompt review rejected this action: {issues}', '提示词审查已拒绝该动作：{issues}').replace('{issues}', issueText)
                    : t('Prompt review rejected this action.', '提示词审查已拒绝该动作。');
                return { allowed: false, message, prompt_review: promptReview };
            }
            return { allowed: true, message: '', prompt_review: promptReview };
        }

        function prepareVlmChatAssistantResponse(messages, response, actions, rollingInfo, options) {
            const opts = options || {};
            const assistantMessage = {
                role: 'assistant',
                content: response?.text || '',
                raw_text: response?.raw_text || '',
                actions: Array.isArray(actions) ? actions : [],
                at: nowIso()
            };
            if (response?.params?.stateless_llamacpp_chat) {
                const rolling = response?.params?.rolling_context || rollingInfo || {};
                const omittedTurns = Number(rolling.omitted || 0) || 0;
                assistantMessage.notice = t(
                    omittedTurns
                        ? `Rolling context mode kept the latest turns and omitted ${omittedTurns} older turn(s) to fit the local model context.`
                        : 'Rolling context mode kept this chat inside the local model context window.',
                    omittedTurns
                        ? `滚动上下文已保留最近对话，并省略 ${omittedTurns} 条较早消息以适配本地模型上下文。`
                        : '滚动上下文已将本次对话控制在本地模型上下文窗口内。'
                );
            }
            const nextMessages = Array.isArray(messages) ? messages.slice() : [];
            const pendingIndex = nextMessages.findIndex(message => message?.role === 'assistant' && message?.pending);
            let assistantMessageIndex = -1;
            if (pendingIndex >= 0) {
                nextMessages[pendingIndex] = assistantMessage;
                assistantMessageIndex = pendingIndex;
            } else {
                nextMessages.push(assistantMessage);
                assistantMessageIndex = nextMessages.length - 1;
            }
            const finalSliceStart = Math.max(0, nextMessages.length - 40);
            const finalMessages = nextMessages.slice(finalSliceStart);
            const assistantIndex = assistantMessageIndex >= finalSliceStart
                ? assistantMessageIndex - finalSliceStart
                : finalMessages.length - 1;
            const autoActionIndex = findVlmAutoConfirmActionIndex(
                finalMessages[assistantIndex],
                !!opts.autoConfirmEnabled
            );
            if (autoActionIndex >= 0) {
                const autoMessage = finalMessages[assistantIndex] || {};
                const autoActions = Array.isArray(autoMessage.actions) ? autoMessage.actions.slice() : [];
                autoActions[autoActionIndex] = Object.assign({}, autoActions[autoActionIndex] || {}, {
                    execution: {
                        state: 'queued',
                        message: t('Auto-confirmed; preparing generation...', '已自动确认，正在准备生成...'),
                        at: nowIso()
                    }
                });
                finalMessages[assistantIndex] = Object.assign({}, autoMessage, { actions: autoActions });
            }
            return {
                messages: finalMessages,
                assistant_index: assistantIndex,
                auto_action_index: autoActionIndex,
                conversation_id: response?.conversation_id || opts.conversationId || ''
            };
        }

        function prepareVlmChatFailureResponse(messages, response, options) {
            const opts = options || {};
            const nextMessages = Array.isArray(messages) ? messages.slice() : [];
            const pendingIndex = nextMessages.findIndex(message => message?.role === 'assistant' && message?.pending);
            const errorMessage = {
                role: 'assistant',
                content: response?.details || response?.error || 'VLM failed',
                at: nowIso()
            };
            if (pendingIndex >= 0) nextMessages[pendingIndex] = errorMessage;
            else nextMessages.push(errorMessage);
            const currentPrompt = String(opts.currentPrompt || '');
            const currentPendingImages = Array.isArray(opts.currentPendingImages) ? opts.currentPendingImages : [];
            const submittedPendingImages = Array.isArray(opts.submittedPendingImages) ? opts.submittedPendingImages : [];
            const preserveCurrentImages = !!currentPrompt.trim() || currentPendingImages.length > 0;
            return {
                messages: nextMessages.slice(-40),
                pending_images: preserveCurrentImages ? currentPendingImages : submittedPendingImages,
                restore_prompt: !currentPrompt.trim(),
                prompt: String(opts.userPrompt || '')
            };
        }

        function vlmAgentActionExecutionState(action) {
            const execution = action?.execution && typeof action.execution === 'object' ? action.execution : null;
            return String(execution?.state || '').trim();
        }

        function vlmAgentActionNeedsVisibleControls(action) {
            const type = normalizeVlmExecutableActionType(action?.action || action?.type || '');
            if (!isVlmImageToolActionType(type)) return false;
            const executionState = vlmAgentActionExecutionState(action);
            if (isVlmAgentPromptReviewRejected(action) && !executionState) return true;
            if (!executionState) return true;
            return executionState === 'failed' || executionState === 'blocked';
        }

        function shouldCollapseVlmChatActionDetails(message) {
            const actions = Array.isArray(message?.actions) ? message.actions : [];
            if (!actions.length) return false;
            const imageActions = actions.filter(action => isVlmImageToolActionType(normalizeVlmExecutableActionType(action?.action || action?.type || '')));
            if (!imageActions.length) return false;
            return !imageActions.some(vlmAgentActionNeedsVisibleControls);
        }

        function vlmChatActionStateLabel(action) {
            const executionState = vlmAgentActionExecutionState(action);
            if (executionState === 'done') return t('done', '已完成');
            if (executionState === 'running') return t('running', '运行中');
            if (executionState === 'queued') return t('queued', '排队中');
            if (executionState === 'checking') return t('checking', '检查中');
            if (executionState === 'confirming') return t('confirming', '确认中');
            if (executionState === 'ignored') return t('ignored', '已忽略');
            if (executionState === 'failed') return t('failed', '失败');
            if (executionState) return executionState;
            if (isVlmAgentPromptReviewRejected(action)) return t('blocked', '已拦截');
            return t('ready', '待确认');
        }

        function renderVlmChatActionSummary(actions, assistantText, imageCount) {
            const list = Array.isArray(actions) ? actions : [];
            const primary = list.find(action => isVlmImageToolActionType(normalizeVlmExecutableActionType(action?.action || action?.type || ''))) || list[0] || {};
            const type = String(primary?.action || primary?.type || 'action').trim() || 'action';
            const stateLabel = vlmChatActionStateLabel(primary);
            const directPrompt = vlmAgentCleanActionPrompt(primary?.prompt || primary?.image_prompt || primary?.recommended_prompt || primary?.final_prompt || '');
            const preparedPrompt = extractVlmPreparedImagePrompt(assistantText);
            const promptPreview = (directPrompt || preparedPrompt || '').replace(/\s+/g, ' ').trim();
            const composer = primary?.prompt_composer && typeof primary.prompt_composer === 'object' ? primary.prompt_composer : null;
            const review = primary?.prompt_review && typeof primary.prompt_review === 'object' ? primary.prompt_review : null;
            const reviewScore = Number.isFinite(Number(review?.score)) ? Math.round(Number(review.score)) : null;
            const facts = [
                stateLabel,
                composer?.generation_resolution?.label ? composer.generation_resolution.label : '',
                reviewScore !== null ? `${t('review', '审查')} ${reviewScore}` : '',
                imageCount ? t('{count} image(s)', '{count} 张图片').replace('{count}', imageCount) : '',
            ].filter(Boolean);
            const detail = promptPreview
                ? promptPreview.slice(0, 96) + (promptPreview.length > 96 ? '...' : '')
                : (String(primary?.summary || primary?.reason || primary?.message || '').trim() || t('Image generation details', '生图详情'));
            return `<span class="sai-vlm-chat-action-summary"><i class="fa-solid fa-wand-magic-sparkles"></i><b>${escapeHtml(type)}</b><span>${escapeHtml(facts.join(' · '))}</span><em title="${escapeHtml(promptPreview || detail)}">${escapeHtml(detail)}</em></span>`;
        }

        function cleanVlmAssistantDisplayText(text, actions) {
            let source = String(text || '').trim();
            if (!source) return source;
            source = source.replace(/!\[[^\]]*]\((?:sandbox\.github\.io|https?:\/\/sandbox\.github\.io|[^)]*github\.io[^)]*|sandbox:[^)]*)[^)]*\)/gi, '');
            source = source.replace(/!\[[^\]]*]\([^)]*\)/g, '');
            source = source.replace(/(?:https?:\/\/)?sandbox\.github\.io\/\S+/gi, '');
            if (!Array.isArray(actions) || !actions.length) {
                return source.replace(/\n{3,}/g, '\n\n').trim();
            }
            const visualMarker = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:中文描述|预期(?:效果|画面)描述|画面描述|视觉描述|视角描述|Expected visual|Visual description)\s*(?:\*\*)?\s*[:：]?\s*/i;
            const markerMatch = source.match(visualMarker);
            if (markerMatch && markerMatch.index >= 0) {
                source = source.slice(markerMatch.index + markerMatch[0].length).trim();
            }
            source = source.replace(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:[\u{1f300}-\u{1faff}]\s*)?(?:推荐提示词|生成提示词|图像提示词|生图提示词|英文\s*Danbooru-style\s*Tags|Danbooru-style\s*Tags|Negative Prompt|Prompt|Image prompt|Recommended prompt)\s*(?:\([^)]*\))?\s*(?:\*\*)?\s*[:：]?\s*\n\s*```[\s\S]*?```/giu, '\n');
            source = source.replace(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:[\u{1f300}-\u{1faff}]\s*)?(?:推荐操作|操作建议|生成建议|生成操作|Action JSON|JSON Action)\s*(?:\([^)]*\))?\s*(?:\*\*)?\s*[:：]?\s*[\s\S]*?(?=\n\s*(?:#{1,6}\s*)?(?:中文描述|预期(?:效果|画面)描述|画面描述|视觉描述|视角描述|Expected visual|Visual description)\b|$)/giu, '\n');
            source = source.replace(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:[\u{1f300}-\u{1faff}]\s*)?(?:图像生成建议|Image Generation Recommendation|推荐提示词|生成提示词|图像提示词|生图提示词|英文\s*Danbooru-style\s*Tags|Danbooru-style\s*Tags|Negative Prompt|Prompt|Image prompt|Recommended prompt)\s*(?:\([^)]*\))?\s*(?:\*\*)?\s*[:：]?\s*[\s\S]*?(?=\n\s*(?:#{1,6}\s*)?(?:中文描述|预期(?:效果|画面)描述|画面描述|视觉描述|视角描述|推荐操作|操作建议|生成建议|生成操作|Action JSON|JSON Action|Expected visual|Visual description)\b|\n\s*---|$)/giu, '\n');
            source = source.replace(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:空Latent节点配置|K采样器配置|正面提示词|负面提示词|参数配置|执行报告|Latent config|Sampler config|Positive prompt|Negative prompt|Execution report)\s*(?:\*\*)?\s*[:：]?\s*[\s\S]*?(?=\n\s*(?:#{1,6}\s*)?(?:中文描述|预期(?:效果|画面)描述|画面描述|视觉描述|视角描述|Expected visual|Visual description)\b|\n\s*---|$)/giu, '\n');
            source = source.replace(/```json[\s\S]*?"action"\s*:\s*"[^"]+"[\s\S]*?```/gi, '\n');
            source = source.replace(/```[\s\S]*?```/g, '\n');
            source = source.replace(/(?:如果您需要|请确认|确认上述|如果一切就绪)[^\n]*(?:生成|执行|工具|配置|图像)[^\n]*/g, '');
            source = source.replace(/\n{3,}/g, '\n\n').trim();
            return source;
        }

        function renderVlmChatLog(node) {
            const params = node?.params || {};
            const chatFontSize = clampValue(Number(params.chat_font_size ?? VLM_CHAT_DEFAULT_FONT_SIZE), 11, 24);
            const allMessages = Array.isArray(node?.chat?.messages) ? node.chat.messages : [];
            const baseMessageIndex = Math.max(0, allMessages.length - 12);
            const messages = allMessages.slice(-12);
            const jumpButton = `<button type="button" class="sai-vlm-chat-jump" data-vlm-chat-jump-bottom title="${escapeHtml(t('Jump to latest message', '跳到最新消息'))}" aria-label="${escapeHtml(t('Jump to latest message', '跳到最新消息'))}"><i class="fa-solid fa-arrow-down"></i></button>`;
            if (!messages.length) {
                return `<div class="sai-vlm-chat-shell" style="--sai-vlm-chat-font-size:${chatFontSize}px"><div class="sai-vlm-chat-log" data-vlm-chat-log="${escapeHtml(node?.id || '')}"><div class="sai-vlm-chat-empty">${escapeHtml(t('No chat yet. Send a message to start context.', '暂无对话。发送消息后开始保留上下文。'))}</div></div>${jumpButton}</div>`;
            }
            return `<div class="sai-vlm-chat-shell" style="--sai-vlm-chat-font-size:${chatFontSize}px"><div class="sai-vlm-chat-log" data-vlm-chat-log="${escapeHtml(node?.id || '')}">${messages.map((message, localIndex) => {
                const messageIndex = baseMessageIndex + localIndex;
                const role = message?.role === 'assistant' ? 'assistant' : 'user';
                const pending = !!message?.pending;
                const imageCount = Number(message?.image_count || 0);
                const imageChips = Array.isArray(message?.images) ? message.images : [];
                const displayContent = role === 'assistant' ? cleanVlmAssistantDisplayText(message?.content || '', message?.actions) : String(message?.content || '');
                const rawModelContent = role === 'assistant' ? String(message?.raw_text || '').trim() : '';
                const showRawModelContent = !!(rawModelContent && rawModelContent !== String(message?.content || '').trim() && rawModelContent !== displayContent);
                const actionsHtml = renderVlmAgentActions(node, message?.actions, messageIndex, message?.content || '');
                const rawHtml = showRawModelContent ? `<details class="sai-vlm-chat-raw"><summary>${escapeHtml(t('Raw model output', '\u539f始模型输出'))}</summary><pre>${escapeHtml(rawModelContent)}</pre></details>` : '';
                const noticeHtml = message?.notice ? `<small class="sai-vlm-chat-notice">${escapeHtml(message.notice)}</small>` : '';
                const imageCountHtml = imageCount ? `<small>${escapeHtml(t('{count} image(s)', '{count} 张图片').replace('{count}', imageCount))}</small>` : '';
                const collapseActionDetails = role === 'assistant' && !pending && shouldCollapseVlmChatActionDetails(message);
                const actionDetailsHtml = collapseActionDetails
                    ? `<details class="sai-vlm-chat-action-details"><summary>${renderVlmChatActionSummary(message?.actions, message?.content || '', imageCount)}</summary><div class="sai-vlm-chat-action-detail-body">${rawHtml}${noticeHtml}${actionsHtml}</div></details>`
                    : `${rawHtml}${noticeHtml}${actionsHtml}`;
                const label = role === 'assistant' ? (String(params.assistant_name || '').trim() || t('Assistant', '助手')) : t('You', '你');
                return `<div class="sai-vlm-chat-msg is-${role} ${pending ? 'is-pending' : ''}" data-vlm-chat-message="${messageIndex}">
  <div class="sai-vlm-chat-msg-head"><b>${escapeHtml(label)}</b><span>
    <button type="button" data-vlm-chat-copy="${messageIndex}" title="${escapeHtml(t('Copy message', '复制消息'))}"><i class="fa-solid fa-copy"></i></button>
    <button type="button" data-vlm-chat-quote="${messageIndex}" title="${escapeHtml(t('Quote to input', '引用到输入'))}"><i class="fa-solid fa-reply"></i></button>
    <button type="button" data-vlm-chat-rollback="${messageIndex}" title="${escapeHtml(t('Move this message back to input', '把这条消息放回输入框'))}"><i class="fa-solid fa-clock-rotate-left"></i></button>
    <button type="button" class="is-danger" data-vlm-chat-delete="${messageIndex}" title="${escapeHtml(t('Delete this message from context', '从上下文删除此消息'))}"><i class="fa-solid fa-trash"></i></button>
  </span></div>
  ${imageChips.length ? `<div class="sai-vlm-chat-images">${imageChips.map((item, index) => {
      const src = vlmChatImageDisplaySrc(item);
      const imageAsset = vlmChatImageAsset(item);
      const imageName = String(imageAsset.name || item.name || `image ${index + 1}`);
      const imageWidth = Number(imageAsset.width || item.width || 0) || '';
      const imageHeight = Number(imageAsset.height || item.height || 0) || '';
      return `<button type="button" class="sai-vlm-chat-image-chip" data-vlm-chat-image="${messageIndex}:${index}" data-vlm-chat-image-name="${escapeHtml(imageName)}" data-vlm-chat-image-width="${escapeHtml(imageWidth)}" data-vlm-chat-image-height="${escapeHtml(imageHeight)}" aria-label="${escapeHtml(imageName)}">${src ? `<img src="${escapeHtml(src)}" alt="">` : `<i class="fa-solid fa-image"></i>`}<em>${escapeHtml(imageName)}</em></button>`;
  }).join('')}</div>` : ''}
  ${displayContent ? `<p>${escapeHtml(displayContent)}</p>` : ''}
  ${actionDetailsHtml}
  ${imageCountHtml}
</div>`;
            }).join('')}</div>${jumpButton}</div>`;
        }

        function renderVlmAgentActions(node, actions, messageIndex, assistantText) {
            if (!Array.isArray(actions) || !actions.length) return '';
            const preparedPrompt = extractVlmPreparedImagePrompt(assistantText);
            return `<div class="sai-vlm-agent-actions">${actions.slice(0, 6).map((action, actionIndex) => {
                const type = String(action?.action || action?.type || '').trim();
                const normalizedType = normalizeVlmExecutableActionType(type);
                const promptTarget = isVlmImageToolActionType(normalizedType)
                    ? canvasAgentPromptTargetFromPurpose(vlmAgentActionPurpose(normalizedType), { presetName: action?.preset || '' })
                    : null;
                const target = String(action?.target_node_id || action?.node_id || action?.run_id || action?.title || '').trim();
                const summary = String(action?.summary || action?.reason || action?.message || '').trim();
                const directPrompt = vlmAgentCleanActionPrompt(action?.prompt || action?.image_prompt || action?.recommended_prompt || action?.final_prompt || '');
                const promptPreview = directPrompt || preparedPrompt || '';
                const execution = action?.execution && typeof action.execution === 'object' ? action.execution : null;
                const executionState = String(execution?.state || '').trim();
                const preflightFacts = canvasAgentPromptPreflightFacts(execution?.preflight);
                const review = action?.prompt_review && typeof action.prompt_review === 'object' ? action.prompt_review : null;
                const reviewState = String(review?.state || '').trim();
                const reviewScore = Number.isFinite(Number(review?.score)) ? Math.round(Number(review.score)) : null;
                const reviewIssues = Array.isArray(review?.issues) ? review.issues : [];
                const reviewRejected = isVlmAgentPromptReviewRejected(action);
                const reviewBypassable = isVlmAgentPromptReviewBypassable(action);
                const reviewSummary = review
                    ? [
                        `${t('Review', '审查')}: ${reviewState || 'checked'}${reviewScore !== null ? ` ${reviewScore}/100` : ''}`,
                        reviewIssues.slice(0, 3).map(item => String(item?.message || item?.code || item || '').trim()).filter(Boolean).join('; ')
                    ].filter(Boolean).join(' · ')
                    : '';
                const composer = action?.prompt_composer && typeof action.prompt_composer === 'object' ? action.prompt_composer : null;
                const composerFacts = composer ? [
                    composer.subject_source ? `subject=${composer.subject_source}` : '',
                    composer.scene_branch ? `branch=${composer.scene_branch}` : '',
                    composer.composition_archetype ? `archetype=${composer.composition_archetype}` : '',
                    composer.generation_resolution?.label ? `resolution=${composer.generation_resolution.label}` : '',
                    composer.variation_seed ? `seed=${String(composer.variation_seed).slice(0, 36)}` : '',
                    composer.prompt_format ? `format=${composer.prompt_format}` : ''
                ].filter(Boolean) : [];
                const composerSummary = composerFacts.length ? composerFacts.join(' | ') : '';
                const draftMeta = action?.llm_draft_canonicalization && typeof action.llm_draft_canonicalization === 'object' ? action.llm_draft_canonicalization : null;
                const draftFacts = draftMeta ? [
                    `draft=${draftMeta.original_tag_count || '?'}`,
                    `canonical=${draftMeta.canonical_tag_count || '?'}`,
                    action?.llm_draft_retry ? 'retry=true' : '',
                    draftMeta.source ? `source=${draftMeta.source}` : ''
                ].filter(Boolean) : (action?.llm_draft_retry ? ['retry=true'] : []);
                const draftSummary = draftFacts.length ? draftFacts.join(' | ') : '';
                const executionMessage = String(execution?.message || '').toLowerCase();
                const failedBecauseExistingRun = executionState === 'failed' && /\brun already (?:preparing|active)\b|already has an active run|already preparing/.test(executionMessage);
                const canRun = (!executionState || (executionState === 'failed' && !failedBecauseExistingRun)) && !reviewRejected;
                const isImageTool = isVlmImageToolActionType(normalizedType);
                const autoConfirmOn = !!node?.params?.agent_auto_confirm_generation;
                const autoConfirmChoice = isImageTool
                    ? `<label class="sai-vlm-agent-auto-confirm"><input type="checkbox" data-vlm-param="agent_auto_confirm_generation" data-vlm-agent-action-auto-confirm="${escapeHtml(`${messageIndex}:${actionIndex}`)}" ${autoConfirmOn ? 'checked' : ''}><span>${escapeHtml(t('No more confirms in this chat', '当前聊天不再确认'))}</span></label>`
                    : '';
                const buttons = canRun
                    ? `<div class="sai-vlm-agent-action-buttons">
    <button type="button" data-vlm-agent-action-run="${escapeHtml(`${messageIndex}:${actionIndex}`)}"><i class="fa-solid fa-check"></i><span>${escapeHtml(t('Confirm', '确认'))}</span></button>
    <button type="button" data-vlm-agent-action-ignore="${escapeHtml(`${messageIndex}:${actionIndex}`)}"><i class="fa-solid fa-xmark"></i><span>${escapeHtml(t('Cancel', '取消'))}</span></button>
  </div>`
                    : (reviewRejected && !executionState ? `<small class="is-reject">${escapeHtml(reviewBypassable ? t('Blocked by prompt review. Edit the request and send again, or retry from the same context.', '已被提示词审查拦截，请修改请求后重新发送，或从同一上下文重试。') : t('Blocked by local safety rules. Edit the request and send again.', '已被本地安全规则拦截，请修改请求后重新发送。'))}</small>
  <div class="sai-vlm-agent-action-buttons">
    <button type="button" data-vlm-agent-action-retry="${escapeHtml(`${messageIndex}:${actionIndex}`)}"><i class="fa-solid fa-rotate-right"></i><span>${escapeHtml(t('Retry', '重试'))}</span></button>
    ${reviewBypassable ? `<button type="button" data-vlm-agent-action-allow="${escapeHtml(`${messageIndex}:${actionIndex}`)}"><i class="fa-solid fa-shield-halved"></i><span>${escapeHtml(t('Allow', '放行'))}</span></button>` : ''}
  </div>` : '');
                return `<div class="sai-vlm-agent-action" data-vlm-agent-action-card="${escapeHtml(`${messageIndex}:${actionIndex}`)}">
  <div class="sai-vlm-agent-action-main"><b>${escapeHtml(type || 'action')}</b>${target ? `<span>${escapeHtml(target)}</span>` : ''}</div>
  ${summary ? `<em>${escapeHtml(summary)}</em>` : ''}
  ${promptPreview ? `<small title="${escapeHtml(promptPreview)}">${escapeHtml(t('Prompt: {prompt}', '提示词：{prompt}').replace('{prompt}', promptPreview))}</small>` : ''}
  ${promptTarget ? `<small>${escapeHtml(t('Prompt target: {target}', '提示词目标：{target}').replace('{target}', canvasAgentPromptTargetContextLine(promptTarget)))}</small>` : ''}
  ${composerSummary ? `<small class="sai-vlm-agent-composer" title="${escapeHtml(JSON.stringify(composer || {}, null, 2))}">${escapeHtml(composerSummary)}</small>` : ''}
  ${draftSummary ? `<small class="sai-vlm-agent-composer" title="${escapeHtml(JSON.stringify({ draft: draftMeta || {}, retry_reason: action?.retry_reason || '', validation: action?.draft_validation_issues || [] }, null, 2))}">${escapeHtml(draftSummary)}</small>` : ''}
  ${reviewSummary ? `<small class="is-${escapeHtml(reviewState || 'checked')}" title="${escapeHtml(JSON.stringify(review || {}, null, 2))}">${escapeHtml(reviewSummary)}</small>` : ''}
  ${preflightFacts.length ? `<small>${escapeHtml(preflightFacts.map(item => `${item.label}: ${item.value}`).join(' | '))}</small>` : ''}
  ${executionState ? `<small class="is-${escapeHtml(executionState)}">${escapeHtml(execution?.message || executionState)}</small>` : ''}
  ${autoConfirmChoice}
  ${buttons}
</div>`;
            }).join('')}</div>`;
        }

        function snapshotVlmChatImages(pendingImages, connectedSources) {
            const pending = (Array.isArray(pendingImages) ? pendingImages : []).map((item, index) => ({
                id: item.id || `pending:${index}`,
                name: item.name || `image ${index + 1}`,
                mime: item.mime || 'image/png',
                width: item.width || null,
                height: item.height || null,
                thumb: item.thumb || item.data_url || '',
                data_url: item.data_url || item.thumb || ''
            }));
            const connected = (Array.isArray(connectedSources) ? connectedSources : []).map((source, index) => {
                const asset = getVlmSourceAsset(source) || {};
                const rel = inferChatImageRelativePath(asset);
                return {
                    id: source.id || `source:${index}`,
                    name: source.title || asset.name || `source ${index + 1}`,
                    mime: asset.mime || '',
                    width: asset.width || null,
                    height: asset.height || null,
                    thumb: safeVlmChatAssetThumb(asset),
                    data_url: asset.data_url || '',
                    preview_url: asset.preview_url || '',
                    path: asset.path || asset.output_path || '',
                    output_path: asset.output_path || '',
                    original_output_path: asset.original_output_path || '',
                    asset_relative_path: rel || asset.asset_relative_path || asset.relative_path || '',
                    relative_path: rel || asset.relative_path || asset.asset_relative_path || '',
                    asset_root_key: asset.asset_root_key || (rel ? 'project_asset_root' : '')
                };
            });
            return pending.concat(connected).filter(item => item.thumb || item.data_url || inferChatImageRelativePath(item)).slice(0, 12);
        }

        async function addVlmPendingImageFromFile(node, file) {
            if (!node || node.type !== 'vlm' || !isImageFile(file)) return false;
            const dataUrl = await readFileAsDataUrl(file);
            const dimensions = await getImageDimensions(dataUrl);
            const thumb = await createThumbnailDataUrl(dataUrl, 480);
            const pending = Array.isArray(node.chat?.pending_images) ? node.chat.pending_images.slice() : [];
            pending.push({
                id: uid('vlm_img'),
                name: file.name || 'image',
                mime: file.type || 'image/png',
                size: file.size || 0,
                width: dimensions.width || null,
                height: dimensions.height || null,
                data_url: dataUrl,
                thumb,
                added_at: nowIso()
            });
            applyVlmChatState(node, {
                pendingImages: pending,
                updatedAt: nowIso()
            });
            mutate({ inspector: true });
            return true;
        }

        function removeVlmPendingImage(node, index) {
            if (!node || node.type !== 'vlm' || isNodeLocked(node)) return;
            const pending = Array.isArray(node.chat?.pending_images) ? node.chat.pending_images.slice() : [];
            if (index < 0 || index >= pending.length) return;
            pending.splice(index, 1);
            applyVlmChatState(node, {
                pendingImages: pending,
                updatedAt: nowIso()
            });
            mutate({ inspector: true });
        }

        function serializeVlmPendingImageSource(node, item, index) {
            const assetId = item?.id || uid('vlm_img');
            return {
                node_id: `${node.id}:chat:${assetId}:${index}`,
                type: 'image',
                title: item?.name || `chat image ${index + 1}`,
                asset: serializeAssetForRun({
                    kind: 'browser_upload',
                    asset_id: assetId,
                    mime: item?.mime || 'image/png',
                    size: item?.size || 0,
                    width: item?.width || null,
                    height: item?.height || null,
                    data_url: item?.data_url || '',
                    thumb: item?.thumb || ''
                }),
                mask: null,
                source: { kind: 'vlm_chat_attachment', node_id: node.id }
            };
        }

        function getVlmChatMessage(node, messageIndex) {
            const messages = Array.isArray(node?.chat?.messages) ? node.chat.messages : [];
            return messages[Number(messageIndex)] || null;
        }

        function getVlmChatToolState(node) {
            return node?.chat?.agent_tool_state && typeof node.chat.agent_tool_state === 'object'
                ? node.chat.agent_tool_state
                : {};
        }

        function lastVlmAssistantText(messages) {
            const list = Array.isArray(messages) ? messages : [];
            for (let i = list.length - 1; i >= 0; i -= 1) {
                const message = list[i];
                if (message?.role === 'assistant' && !message.pending) {
                    return String(message.content || '');
                }
            }
            return '';
        }

        function pendingVlmChatMessages(node) {
            return (Array.isArray(node?.chat?.messages) ? node.chat.messages : [])
                .filter(message => message && message.pending)
                .map(message => cloneRunValue(message, {}));
        }

        function hasPendingVlmChatMessage(node) {
            return (Array.isArray(node?.chat?.messages) ? node.chat.messages : [])
                .some(message => message?.role === 'assistant' && message?.pending);
        }

        function setVlmChatToolState(node, patch) {
            if (!node || node.type !== 'vlm') return;
            const toolStatePatch = buildVlmChatToolStatePatch(node, patch);
            applyVlmChatState(node, {
                agentToolState: toolStatePatch?.agent_tool_state,
                updatedAt: nowIso()
            });
        }

        function rememberVlmChatToolResult(node, kind, runResponse) {
            if (!node || node.type !== 'vlm') return;
            const resultNodeId = runResponse?.result_node_id || runResponse?.placeholder_node_id || '';
            const presetNodeId = runResponse?.preset_node_id || runResponse?.generator_id || '';
            const state = getVlmChatToolState(node);
            const workflows = Object.assign({}, state.workflows || {});
            const workflowKey = runResponse?.workflow_key || '';
            if (workflowKey || kind) {
                workflows[workflowKey || kind] = {
                    kind: kind || '',
                    workflow_key: workflowKey,
                    preset_node_id: presetNodeId,
                    result_node_id: resultNodeId,
                    updated_at: nowIso()
                };
            }
            setVlmChatToolState(node, {
                workflows,
                last_result_node_id: resultNodeId || state.last_result_node_id || '',
                last_preset_node_id: presetNodeId || state.last_preset_node_id || '',
                last_workflow_key: workflowKey || state.last_workflow_key || '',
                last_tool_kind: kind || state.last_tool_kind || ''
            });
        }

        function latestVlmChatResultNode(node) {
            const state = getVlmChatToolState(node);
            const direct = getNode(state.last_result_node_id || '');
            if (direct?.type === 'result') return direct;
            const project = getProject() || {};
            const ownerId = node?.id || '';
            const workflowPresets = (Array.isArray(project.nodes) ? project.nodes : [])
                .filter(item => item && ['preset', 'classic'].includes(item.type) && item.source?.agent_workflow_owner_node_id === ownerId)
                .sort((a, b) => (parseDate(b.source?.updated_at || b.source?.created_at || '') || 0) - (parseDate(a.source?.updated_at || a.source?.created_at || '') || 0));
            for (const preset of workflowPresets) {
                const result = generatedResultNodesForPreset(preset).find(resultNode => resultNodeHasOutput(resultNode));
                if (result) return result;
            }
            return null;
        }

        function appendVlmChatToolMessage(nodeId, content, options) {
            const node = getNode(nodeId);
            if (!node || node.type !== 'vlm') return;
            const opts = options || {};
            const messages = Array.isArray(node.chat?.messages) ? node.chat.messages.slice() : [];
            const images = opts.resultNode ? vlmChatImagesFromResultNode(opts.resultNode) : [];
            const text = String(content || '');
            messages.push({
                role: 'assistant',
                content: text,
                images,
                image_count: images.length,
                notice: opts.notice || '',
                at: nowIso()
            });
            applyVlmChatState(node, {
                messages: messages.slice(-40),
                pendingImages: Array.isArray(node.chat?.pending_images) ? node.chat.pending_images : [],
                updatedAt: nowIso()
            });
            applyVlmText(node, {
                text: {
                    value: text,
                    updated_at: nowIso()
                }
            });
            if (hasPendingVlmChatMessage(node)) {
                applyVlmRunStatus(node, {
                    statusPatch: {
                        state: 'running',
                        message: node.status?.message || t('VLM is still thinking...', 'VLM 仍在思考中...')
                    }
                });
            } else {
                applyVlmRunStatus(node, {
                    statusPatch: {
                        state: opts.state || 'finished',
                        message: text
                    }
                });
            }
            markVlmChatStickToBottom(node.id);
            mutate({ inspector: true });
            scrollVlmChatToBottom(node.id);
        }

        function replaceVlmChatPendingMessage(node, content) {
            if (!node || node.type !== 'vlm') return false;
            const messages = Array.isArray(node.chat?.messages) ? node.chat.messages.slice() : [];
            const pendingIndex = messages.findIndex(message => message?.role === 'assistant' && message?.pending);
            const assistant = {
                role: 'assistant',
                content,
                at: nowIso()
            };
            if (pendingIndex >= 0) messages[pendingIndex] = assistant;
            else messages.push(assistant);
            applyVlmChatState(node, {
                messages: messages.slice(-40),
                updatedAt: nowIso()
            });
            markVlmChatStickToBottom(node.id);
            return true;
        }

        function applyVlmChatContextEdit(node, messages, historyLabel, statusMessage, options) {
            if (!node || node.type !== 'vlm') return false;
            if (isNodeLocked(node)) return false;
            const opts = options || {};
            const hasPrompt = Object.prototype.hasOwnProperty.call(opts, 'prompt');
            const nextPendingImages = Array.isArray(opts.pendingImages)
                ? opts.pendingImages
                : (Array.isArray(node.chat?.pending_images) ? node.chat.pending_images : []);
            const cleanMessages = (Array.isArray(messages) ? messages : [])
                .filter(message => message && !message.pending)
                .slice(-40);
            const nextMessages = opts.preservePending === false
                ? cleanMessages
                : cleanMessages.concat(pendingVlmChatMessages(node)).slice(-40);
            const conversationId = uid('vlm_chat');
            pushHistoryBatch(`vlm-chat-context-edit:${node.id}:${now()}`, historyLabel || 'Edit VLM chat context');
            applyVlmChatState(node, {
                messages: nextMessages,
                conversationId,
                pendingImages: nextPendingImages,
                agentToolState: node.chat?.agent_tool_state || {},
                updatedAt: nowIso()
            });
            const paramsPatch = { conversation_id: conversationId };
            if (hasPrompt) paramsPatch.prompt = String(opts.prompt || '');
            Object.assign(node, buildVlmParamsPatch(node, { paramsPatch }));
            applyVlmText(node, {
                text: {
                    value: lastVlmAssistantText(nextMessages),
                    updated_at: nowIso()
                }
            });
            applyVlmRunStatus(node, {
                statusPatch: {
                    state: 'idle',
                    message: statusMessage || t(
                        'Chat context edited. Next reply will use the edited context.',
                        '聊天上下文已编辑。下一次回复将使用编辑后的上下文。'
                    )
                }
            });
            markVlmChatStickToBottom(node.id);
            mutate({ inspector: true });
            scrollVlmChatToBottom(node.id);
            return true;
        }

        function rollbackVlmChatToMessage(node, messageIndex) {
            if (!node || node.type !== 'vlm') return;
            const messages = Array.isArray(node.chat?.messages) ? node.chat.messages.slice() : [];
            const index = Number(messageIndex);
            if (!Number.isInteger(index) || index < 0 || index >= messages.length) return;
            const selectedMessage = messages[index];
            if (selectedMessage?.pending) {
                showToast(t(
                    'The active thinking message cannot be moved while the model is running.',
                    '模型运行中的思考消息不能回退到输入框。'
                ));
                return;
            }
            const draft = vlmChatMessageText(selectedMessage);
            const pendingImages = selectedMessage?.role === 'user' && Array.isArray(selectedMessage.images)
                ? selectedMessage.images
                    .filter(item => item && (item.data_url || item.thumb))
                    .map(item => cloneRunValue(item, {}))
                    .slice(0, 4)
                : (Array.isArray(node.chat?.pending_images) ? node.chat.pending_images : []);
            const kept = messages.slice(0, index);
            if (applyVlmChatContextEdit(node, kept, 'Rollback VLM chat message to input', 'Message moved back to the input box.', {
                prompt: draft,
                pendingImages
            })) {
                schedule(() => focusVlmChatPromptInput(node.id, true), 0);
                showToast(t('Message moved back to input.', '消息已回到输入框'));
            }
        }

        function deleteVlmChatMessage(node, messageIndex) {
            if (!node || node.type !== 'vlm') return;
            const messages = Array.isArray(node.chat?.messages) ? node.chat.messages.slice() : [];
            const index = Number(messageIndex);
            if (!Number.isInteger(index) || index < 0 || index >= messages.length) return;
            if (messages[index]?.pending) {
                showToast(t(
                    'The active thinking message will disappear when the response arrives.',
                    '模型回复完成后思考消息会自动消失。'
                ));
                return;
            }
            messages.splice(index, 1);
            if (applyVlmChatContextEdit(node, messages, 'Delete VLM chat message', 'Message deleted from chat context.')) {
                showToast(t('Message deleted from context.', '消息已从上下文删除'));
            }
        }

        function setVlmAgentActionExecution(node, messageIndex, actionIndex, execution) {
            if (!node || node.type !== 'vlm') return;
            const messages = Array.isArray(node.chat?.messages) ? node.chat.messages.slice() : [];
            const message = messages[Number(messageIndex)];
            if (!message || !Array.isArray(message.actions) || !message.actions[Number(actionIndex)]) return;
            const actions = message.actions.slice();
            actions[Number(actionIndex)] = Object.assign({}, actions[Number(actionIndex)] || {}, {
                execution: Object.assign({ at: nowIso() }, execution || {})
            });
            messages[Number(messageIndex)] = Object.assign({}, message, { actions });
            pushHistoryBatch(`vlm-agent-action:${node.id}:${messageIndex}:${actionIndex}`, 'Update VLM agent action');
            applyVlmChatState(node, {
                messages,
                updatedAt: nowIso()
            });
            mutate({ inspector: true });
        }

        function patchVlmAgentAction(node, messageIndex, actionIndex, patch, historyLabel) {
            if (!node || node.type !== 'vlm') return false;
            const messages = Array.isArray(node.chat?.messages) ? node.chat.messages.slice() : [];
            const message = messages[Number(messageIndex)];
            if (!message || !Array.isArray(message.actions) || !message.actions[Number(actionIndex)]) return false;
            const actions = message.actions.slice();
            actions[Number(actionIndex)] = Object.assign({}, actions[Number(actionIndex)] || {}, patch || {});
            messages[Number(messageIndex)] = Object.assign({}, message, { actions });
            pushHistoryBatch(`vlm-agent-action-patch:${node.id}:${messageIndex}:${actionIndex}`, historyLabel || 'Update VLM agent action');
            applyVlmChatState(node, {
                messages,
                updatedAt: nowIso()
            });
            mutate({ inspector: true });
            return true;
        }

        function vlmChatMessageContextText(message) {
            if (!message || message.pending) return '';
            const content = message.content;
            if (Array.isArray(content)) {
                return content.map(item => {
                    if (typeof item === 'string') return item;
                    if (item && typeof item === 'object' && item.type === 'text') return item.text || '';
                    return '';
                }).filter(Boolean).join('\n').trim();
            }
            return String(content || '').trim();
        }

        function vlmChatMessageText(message) {
            return vlmChatMessageContextText(message);
        }

        function copyVlmChatMessage(node, messageIndex) {
            const text = vlmChatMessageText(getVlmChatMessage(node, messageIndex));
            if (!text.trim()) {
                showToast(t('No message text to copy.', '没有可复制的消息文本'));
                return Promise.resolve(false);
            }
            return Promise.resolve(copyVlmChatText(text)).then((ok) => {
                showToast(ok ? t('Message copied.', '消息已复制') : t('Copy failed.', '复制失败'));
                return !!ok;
            }, () => {
                showToast(t('Copy failed.', '复制失败'));
                return false;
            });
        }

        function quoteVlmChatMessage(node, messageIndex) {
            const message = getVlmChatMessage(node, messageIndex);
            if (!node || node.type !== 'vlm' || !message) return false;
            const text = vlmChatMessageText(message);
            if (!text.trim()) {
                showToast(t('No message text to quote.', '没有可引用的消息文本'));
                return false;
            }
            const quote = `> ${text.replace(/\n/g, '\n> ')}\n\n`;
            pushHistoryBatch(`vlm-quote:${node.id}`, 'Quote VLM chat message');
            Object.assign(node, buildVlmParamsPatch(node, {
                paramsPatch: { prompt: `${quote}${node.params?.prompt || ''}` }
            }));
            mutate({ inspector: true });
            showToast(t('Message quoted to input.', '已引用到输入框'));
            return true;
        }

        function vlmChatContextWindowForVersion(version) {
            return Number(VLM_CONTEXT_WINDOWS[String(version || '')] || 8192) || 8192;
        }

        function vlmChatContextBudgetMax(params) {
            const windowSize = vlmChatContextWindowForVersion(params?.version || VLM_DEFAULT_VERSION);
            const softMax = windowSize <= 8192
                ? VLM_CHAT_DEFAULT_CONTEXT_CHARS
                : Math.min(VLM_CHAT_CONTEXT_CHARS_HARD_MAX, Math.max(8000, Math.floor(windowSize * 0.55)));
            return clampValue(Math.round(softMax), VLM_CHAT_CONTEXT_CHARS_MIN, VLM_CHAT_CONTEXT_CHARS_HARD_MAX);
        }

        function clampVlmChatContextBudget(value, params) {
            const parsed = Number(value);
            return Number.isFinite(parsed)
                ? clampValue(Math.round(parsed), VLM_CHAT_CONTEXT_CHARS_MIN, vlmChatContextBudgetMax(params || {}))
                : VLM_CHAT_DEFAULT_CONTEXT_CHARS;
        }

        function vlmDefaultParamValue(key, node) {
            if (key === 'chat_font_size') return VLM_CHAT_DEFAULT_FONT_SIZE;
            if (key === 'max_history') return VLM_CHAT_DEFAULT_MAX_HISTORY;
            if (key === 'context_chars') return Math.min(VLM_CHAT_DEFAULT_CONTEXT_CHARS, vlmChatContextBudgetMax(node?.params || {}));
            return undefined;
        }

        function buildVlmRollingHistoryMessages(node, messages) {
            const params = node?.params || {};
            const source = Array.isArray(messages) ? messages : [];
            if (params.save_context === false) {
                return { messages: [], info: { omitted: source.length, chars: 0, max_history: 0, budget: 0 } };
            }
            const maxHistory = clampValue(Math.round(Number(params.max_history ?? VLM_CHAT_DEFAULT_MAX_HISTORY) || VLM_CHAT_DEFAULT_MAX_HISTORY), 1, 80);
            const budget = clampVlmChatContextBudget(params.context_chars ?? VLM_CHAT_DEFAULT_CONTEXT_CHARS, params);
            const selected = [];
            let used = 0;
            let omitted = 0;
            for (let i = source.length - 1; i >= 0; i -= 1) {
                const message = source[i];
                const role = message?.role === 'assistant' ? 'assistant' : (message?.role === 'system' ? 'system' : 'user');
                let content = vlmChatMessageContextText(message);
                if (!content) {
                    omitted += 1;
                    continue;
                }
                const maxOne = Math.max(500, Math.min(1800, Math.floor(budget / 3)));
                if (content.length > maxOne) content = content.slice(-maxOne).trimStart();
                const cost = content.length + role.length + 16;
                if (selected.length >= maxHistory || (selected.length && used + cost > budget)) {
                    omitted += 1;
                    continue;
                }
                selected.push({
                    role,
                    content,
                    at: message?.at || '',
                    image_count: Number(message?.image_count || 0) || 0
                });
                used += cost;
            }
            selected.reverse();
            return { messages: selected, info: { omitted, chars: used, max_history: maxHistory, budget } };
        }

        function getVlmChatImageLinkedAsset(item) {
            if (!item || typeof item !== 'object') return null;
            const nodeId = item.node_id || item.id || '';
            const source = nodeId ? getNode(nodeId) : null;
            return getVlmSourceAsset(source) || null;
        }

        function vlmChatImageAsset(item) {
            const linkedAsset = getVlmChatImageLinkedAsset(item);
            return Object.assign({}, linkedAsset || {}, item || {});
        }

        function vlmChatImageDisplaySrc(item) {
            if (!item || typeof item !== 'object') return '';
            const snapshotSrc = safeAssetDisplaySrc(item, item.thumb || item.preview_url || item.data_url || '');
            if (snapshotSrc) return snapshotSrc;
            const linkedAsset = getVlmChatImageLinkedAsset(item);
            const sourceAsset = linkedAsset || item;
            const resolvedSrc = safeAssetDisplaySrc(sourceAsset, sourceAsset.thumb || sourceAsset.preview_url || sourceAsset.data_url || '');
            if (resolvedSrc) return resolvedSrc;
            return item.data_url || sourceAsset.data_url || '';
        }

        function openVlmChatImage(node, messageIndex, imageIndex) {
            const message = getVlmChatMessage(node, messageIndex);
            const image = Array.isArray(message?.images) ? message.images[Number(imageIndex)] : null;
            if (!image) {
                showToast(t('This message has no image to preview.', '这条消息没有可预览图片'));
                return false;
            }
            const viewAsset = vlmChatImageAsset(image);
            const previewSrc = vlmChatImageDisplaySrc(image);
            if (!previewSrc && inferChatImageRelativePath(viewAsset) && !hasVlmChatAssetRoot()) {
                showToast(t('Restoring asset path...', '正在恢复资产路径...'));
                return Promise.resolve(refreshVlmChatAssetRoot({ render: true })).then((ok) => {
                    if (ok) return openVlmChatImage(node, messageIndex, imageIndex);
                    showToast(t('This node has no viewable image.', '当前节点没有可查看的图片'));
                    return false;
                });
            }
            openVlmAssetViewer({
                kind: 'vlm_chat_image',
                name: viewAsset.name || image.name || `chat image ${Number(imageIndex) + 1}`,
                mime: viewAsset.mime || image.mime || 'image/png',
                width: viewAsset.width || image.width || null,
                height: viewAsset.height || image.height || null,
                data_url: viewAsset.data_url || '',
                preview_url: viewAsset.preview_url || '',
                thumb: previewSrc || safeVlmChatFallbackSrc(viewAsset, viewAsset.thumb || ''),
                path: viewAsset.path || viewAsset.output_path || '',
                output_path: viewAsset.output_path || '',
                original_output_path: viewAsset.original_output_path || '',
                asset_relative_path: viewAsset.asset_relative_path || viewAsset.relative_path || '',
                relative_path: viewAsset.relative_path || viewAsset.asset_relative_path || '',
                asset_root_key: viewAsset.asset_root_key || ''
            }, viewAsset.name || image.name || 'VLM chat image');
            return true;
        }

        function vlmChatImageFromResultNode(resultNode) {
            if (!resultNode || resultNode.type !== 'result') return null;
            const asset = getSelectedResultAsset(resultNode) || resultNode.asset || null;
            if (!asset) return null;
            const rel = inferChatImageRelativePath(asset);
            return {
                id: resultNode.id,
                node_id: resultNode.id,
                name: resultNode.title || asset.name || 'generated image',
                mime: asset.mime || 'image/png',
                width: asset.width || null,
                height: asset.height || null,
                thumb: safeVlmChatAssetThumb(asset),
                data_url: asset.data_url || '',
                preview_url: asset.preview_url || '',
                path: asset.path || asset.output_path || '',
                output_path: asset.output_path || '',
                original_output_path: asset.original_output_path || '',
                asset_relative_path: rel || asset.asset_relative_path || asset.relative_path || '',
                relative_path: rel || asset.relative_path || asset.asset_relative_path || '',
                asset_root_key: asset.asset_root_key || (rel ? 'project_asset_root' : '')
            };
        }

        function vlmChatImagesFromResultNode(resultNode) {
            if (!resultNode || resultNode.type !== 'result') return [];
            const assets = Array.isArray(resultNode.assets) && resultNode.assets.length
                ? resultNode.assets
                : [getSelectedResultAsset(resultNode) || resultNode.asset].filter(Boolean);
            return assets.map((asset, index) => {
                const rel = inferChatImageRelativePath(asset);
                return {
                    id: `${resultNode.id}:${asset?.asset_id || asset?.id || index}`,
                    node_id: resultNode.id,
                    name: asset?.name || `${resultNode.title || 'generated image'} ${index + 1}`,
                    mime: asset?.mime || 'image/png',
                    width: asset?.width || null,
                    height: asset?.height || null,
                    thumb: safeVlmChatAssetThumb(asset),
                    data_url: asset?.data_url || '',
                    preview_url: asset?.preview_url || '',
                    path: asset?.path || asset?.output_path || '',
                    output_path: asset?.output_path || '',
                    original_output_path: asset?.original_output_path || '',
                    asset_relative_path: rel || asset?.asset_relative_path || asset?.relative_path || '',
                    relative_path: rel || asset?.relative_path || asset?.asset_relative_path || '',
                    asset_root_key: asset?.asset_root_key || (rel ? 'project_asset_root' : '')
                };
            }).filter(item => item.thumb || item.data_url || item.relative_path || item.path);
        }

        function getVlmAgentAction(node, messageIndex, actionIndex) {
            const message = getVlmChatMessage(node, messageIndex);
            const actions = Array.isArray(message?.actions) ? message.actions : [];
            return actions[Number(actionIndex)] || null;
        }

        function vlmAgentCleanActionPrompt(value) {
            const injected = vlmAgentCleanActionPromptOverride(value);
            if (injected !== VLM_AGENT_CLEAN_ACTION_PROMPT_UNSET) return injected;
            const text = stripCanvasAgentInlineGenerationParams(cleanVlmToolPrompt(value || ''));
            if (!text) return '';
            const compact = text.trim();
            if (/^["']?(?:preset|aspect_ratio|resolution_scale|steps|cfg_scale|seed_random|summary)["']?\s*:/i.test(compact)) return '';
            if (/"(?:preset|aspect_ratio|resolution_scale|steps|cfg_scale|seed_random|summary)"\s*:/.test(compact) && compact.includes('{')) return '';
            if (/^\{[\s\S]*\}$/.test(compact)) {
                try {
                    const parsed = JSON.parse(compact);
                    const nested = parsed?.prompt || parsed?.image_prompt || parsed?.recommended_prompt || parsed?.final_prompt || '';
                    return nested && nested !== value ? vlmAgentCleanActionPrompt(nested) : '';
                } catch (err) {
                    return '';
                }
            }
            return compact;
        }

        return {
            applyVlmChatState,
            getVlmCustomApiKey,
            getVlmCustomRuntimeParams,
            cleanVlmToolPrompt,
            extractVlmPreparedImagePrompt,
            vlmAgentCleanActionPrompt,
            vlmAgentActionExecutionState,
            vlmAgentActionNeedsVisibleControls,
            shouldCollapseVlmChatActionDetails,
            vlmChatActionStateLabel,
            renderVlmChatActionSummary,
            normalizeVlmExecutableActionType,
            vlmAgentActionPurpose,
            isVlmImageToolActionType,
            vlmAgentAutoConfirmEnabled,
            vlmAgentActionRequiresManualConfirm,
            vlmAgentActionWasSynthesized,
            isVlmAgentPromptReviewRejected,
            isVlmAgentPromptReviewBypassable,
            extractVlmAgentActionsFromText,
            vlmAgentUserExplicitlyRequestedGenerationControl,
            extractRequestedImageCount,
            vlmAgentActionHasBackendResolution,
            vlmAgentActionExecutionPlan,
            mergeVlmImageGenerationActions,
            findVlmAutoConfirmActionIndex,
            isVlmAgentRunAlreadyPreparingResult,
            vlmAgentActionResultState,
            vlmAgentActionResultMessage,
            vlmAgentToolResultMessage,
            vlmAgentActionExecutionGate,
            vlmAgentActionPrompt,
            vlmAgentActionTargetId,
            markVlmAgentActionCardBusy,
            ignoreVlmAgentAction,
            retryVlmAgentAction,
            allowRejectedVlmAgentAction,
            focusVlmAgentTarget,
            selectVlmAgentTarget,
            maybeRunVlmAgentActionFromAutoConfirmToggle,
            vlmAgentActionNegativePrompt,
            vlmAgentSubjectCountHintFromAction,
            sanitizeVlmAgentGenerationControlFields,
            stripVlmAgentUnrequestedNegativePrompt,
            detectVlmImageGenerationIntent,
            vlmAssistantPretendsGenerationComplete,
            vlmVisualScenePromptHint,
            vlmAgentPositiveVisualContextText,
            vlmAgentDanbooruContextTextForPrompt,
            vlmFallbackToolActionsForPrompt,
            prepareVlmAgentActionsForDisplay,
            vlmAgentPreviousUserPrompt,
            prepareVlmAgentActionExecution,
            executeVlmAgentImageAction,
            executeVlmAgentImageActionWithLock,
            executeVlmAgentAction,
            finalizeVlmNodeRunResponse,
            finalizeVlmNodeModelGateFailure,
            runVlmNode,
            isVlmNodeBusy,
            checkVlmModelStatus,
            isVlmModelStatusFresh,
            prepareVlmNodeRunContext,
            prepareVlmNodeRunState,
            prepareVlmNodeRunInput,
            ensureVlmModelsBeforeRun,
            executeVlmNodeRun,
            prepareVlmNodeRunRequest,
            settleVlmNodeRunResponse,
            finalizeVlmAgentActionExecution,
            canvasVlmCancelPayloadFromRunPayload,
            startVlmChatRequest,
            getVlmChatRequest,
            isVlmChatRequestActive,
            clearVlmChatRequest,
            abortVlmChatRequest,
            cancelVlmChatRequest,
            stopVlmChatNode,
            clearVlmChatNode,
            unloadVlmNodeModel,
            checkVlmModelAction,
            queueVlmModelDownloads,
            fetchVlmCustomModels,
            toggleVlmCustomApi,
            testVlmCustomApi,
            saveVlmCustomSecret,
            loadVlmCustomSecret,
            deleteVlmCustomSecret,
            syncVlmCustomFromAgent,
            syncVlmCustomToAgent,
            sendVlmRunRequest,
            sendVlmCancelRequest,
            executeVlmAgentSafeAction,
            prepareVlmAgentRetryContext,
            prepareVlmAgentPromptReviewBypass,
            prepareVlmAgentImageExecution,
            vlmAgentPromptReviewGate,
            prepareVlmChatAssistantResponse,
            prepareVlmChatFailureResponse,
            cleanVlmAssistantDisplayText,
            renderVlmChatLog,
            renderVlmAgentActions,
            snapshotVlmChatImages,
            addVlmPendingImageFromFile,
            removeVlmPendingImage,
            serializeVlmPendingImageSource,
            getVlmChatMessage,
            getVlmChatToolState,
            lastVlmAssistantText,
            pendingVlmChatMessages,
            hasPendingVlmChatMessage,
            setVlmChatToolState,
            rememberVlmChatToolResult,
            latestVlmChatResultNode,
            appendVlmChatToolMessage,
            replaceVlmChatPendingMessage,
            copyVlmChatMessage,
            quoteVlmChatMessage,
            applyVlmChatContextEdit,
            rollbackVlmChatToMessage,
            deleteVlmChatMessage,
            setVlmAgentActionExecution,
            patchVlmAgentAction,
            vlmChatMessageContextText,
            vlmChatMessageText,
            vlmChatContextWindowForVersion,
            vlmChatContextBudgetMax,
            clampVlmChatContextBudget,
            vlmDefaultParamValue,
            buildVlmRollingHistoryMessages,
            getVlmChatImageLinkedAsset,
            vlmChatImageAsset,
            vlmChatImageDisplaySrc,
            openVlmChatImage,
            vlmChatImageFromResultNode,
            vlmChatImagesFromResultNode,
            getVlmAgentAction
        };
    }

    window.SimpAICanvasWorkbenchVlmChat = Object.assign({}, window.SimpAICanvasWorkbenchVlmChat || {}, {
        createVlmAgentContext,
        createCanvasVlmChatController
    });
})();
