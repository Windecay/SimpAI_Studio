(function () {
    'use strict';


    function createCanvasAgentVlmInstructionController(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const uid = scope.uid || ((prefix) => `${prefix || 'id'}_${Date.now()}`);
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const schedule = typeof scope.setTimeout === 'function' ? scope.setTimeout : globalThis.setTimeout;
        const unschedule = typeof scope.clearTimeout === 'function' ? scope.clearTimeout : globalThis.clearTimeout;
        const getPlannerTimeoutMs = () => Math.max(5000, Number(call('getPlannerTimeoutMs', 90000) || 90000));
        let activeRequest = null;

        function getDefaultProjectId() {
            return String(call('getDefaultProjectId', 'default') || 'default').trim() || 'default';
        }

        function projectIdFor(project) {
            return String(project?.id || getDefaultProjectId()).trim() || getDefaultProjectId();
        }

        function canvasAgentVlmCancelPayload(payload) {
            const body = payload || {};
            const params = body.params && typeof body.params === 'object' ? body.params : {};
            return {
                project_id: String(body.project_id || getDefaultProjectId()).trim(),
                node_id: String(body.node_id || params.node_id || '').trim(),
                conversation_id: String(body.conversation_id || params.conversation_id || '').trim(),
                request_id: String(body.request_id || params.request_id || '').trim()
            };
        }

        function canvasAgentVlmAgentContextPayload(options) {
            const opts = options || {};
            const context = Object.assign({}, call('buildVlmAgentContext', {}, null, {
                userPrompt: opts.userPrompt || opts.prompt || ''
            }) || {}, {
                agent_references: call('normalizeCanvasAgentReferences', []).map(ref => ({
                    role: ref.role,
                    kind: ref.kind,
                    node_id: ref.nodeId || ref.node_id,
                    label: ref.label,
                    meta: ref.meta || {}
                }))
            });
            if (opts.promptTarget && typeof opts.promptTarget === 'object') {
                context.prompt_generation_targets = Object.assign({}, context.prompt_generation_targets || {}, {
                    text_to_image: Object.assign({}, opts.promptTarget)
                });
            }
            return context;
        }

        function projectRequestStillCurrent(request) {
            const currentProject = call('getProject', {}) || {};
            const currentId = projectIdFor(currentProject);
            if (currentId !== request.projectId) return false;
            if (typeof scope.isProjectRequestCurrent === 'function') {
                return scope.isProjectRequestCurrent(request, currentProject) !== false;
            }
            return !request.projectRef || currentProject === request.projectRef;
        }

        function requestStillActive(request) {
            return activeRequest === request && !request.cancelled && !request.timedOut && !request.superseded;
        }

        function resolveInterruptedRequest(request, result) {
            if (typeof request.resolveInterrupted === 'function') {
                request.resolveInterrupted(result);
                request.resolveInterrupted = null;
            }
        }

        function deactivateRequest(request) {
            if (activeRequest === request) activeRequest = null;
        }

        function scheduleBackendCancel(request) {
            const sendCancel = scope.sendCanvasVlmCancelRequest;
            if (typeof sendCancel !== 'function') return Promise.resolve({ ok: false, error: 'VLM cancel API is unavailable' });
            return Promise.resolve(sendCancel(canvasAgentVlmCancelPayload(request.payload))).catch((err) => ({
                ok: false,
                error: err?.message || String(err || 'VLM cancel failed')
            }));
        }

        function interruptRequest(request, kind, error) {
            if (!request || request.finished) return;
            request[kind] = true;
            deactivateRequest(request);
            try { request.controller?.abort(); } catch (err) {}
            resolveInterruptedRequest(request, {
                ok: false,
                aborted: true,
                cancelled: kind === 'cancelled',
                timeout: kind === 'timedOut',
                stale: kind === 'superseded',
                error: error || (kind === 'cancelled'
                    ? t('VLM planner cancelled.', 'VLM 计划已取消。')
                    : (kind === 'timedOut'
                        ? t('VLM planner timed out. The local plan will be used.', 'VLM 计划超时，将使用本地计划。')
                        : t('VLM planner response is no longer current.', 'VLM 计划响应已过期。')))
            });
        }

        async function requestCanvasAgentVlmInstructionPlan(rawPrompt, requestedAction) {
            const prompt = String(rawPrompt || '').trim();
            if (!prompt) return { ok: false, error: t('The Agent instruction is empty.', 'Agent 指令为空。') };

            if (activeRequest) {
                const previousRequest = activeRequest;
                interruptRequest(previousRequest, 'superseded');
                await scheduleBackendCancel(previousRequest);
            }

            const project = call('getProject', {}) || {};
            const projectId = projectIdFor(project);
            const model = String(call('getCanvasAgentRewriteModel', '') || '').trim();
            const target = call('getCanvasAgentTargetNode', null);
            const requestId = uid('vlm_plan');
            const payload = {
                project_id: projectId,
                node_id: 'canvas_agent_instruction_planner',
                request_id: requestId,
                asset_sources: call('getCanvasAgentVlmReferenceSources', [], { fallbackTarget: target }),
                conversation_id: `canvas_agent_plan:${projectId}`,
                chat_messages: [],
                agent_context: canvasAgentVlmAgentContextPayload({ userPrompt: prompt }),
                params: Object.assign({
                    version: model,
                    mode: 'chat',
                    request_id: requestId,
                    prompt: call('canvasAgentInstructionPlanPrompt', '', prompt, requestedAction),
                    system_prompt: 'You are a strict JSON planner and prompt recommender for SimpAI Studio. Use built-in skill docs and image prompting target rules. Return one JSON object only.',
                    save_context: false,
                    agent_use_skills: true,
                    agent_use_canvas_context: true,
                    agent_action_hints: false,
                    output_chinese: false,
                    video_frames: Number(call('getCanvasAgentSettings', {})?.videoFrames || 0),
                    max_tokens: 900,
                    temperature: 0.1,
                    top_p: 0.8,
                    top_k: 20,
                    repetition_penalty: 1.05,
                    seed: -1,
                    free_after: false
                }, model === 'Custom' ? (call('getCanvasAgentCustomRuntimeParams', {}) || {}) : {})
            };
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const request = {
                requestId,
                projectId,
                projectRef: project,
                payload,
                controller,
                cancelled: false,
                timedOut: false,
                superseded: false,
                finished: false,
                resolveInterrupted: null
            };
            activeRequest = request;

            let timer = null;
            const interrupted = new Promise(resolve => {
                request.resolveInterrupted = resolve;
            });
            const responsePromise = Promise.resolve()
                .then(() => call('sendCanvasVlmRunRequest', null, payload, controller ? { signal: controller.signal } : {}))
                .catch(err => ({ ok: false, error: err?.message || String(err || 'VLM planner failed') }));
            if (getPlannerTimeoutMs() > 0) {
                timer = schedule(() => {
                    request.timedOut = true;
                    interruptRequest(request, 'timedOut');
                    scheduleBackendCancel(request).catch(() => {});
                }, getPlannerTimeoutMs());
            }

            try {
                const response = await Promise.race([responsePromise, interrupted]);
                if (request.timedOut) {
                    return {
                        ok: false,
                        timeout: true,
                        error: t('VLM planner timed out. The local plan will be used.', 'VLM 计划超时，将使用本地计划。')
                    };
                }
                if (request.cancelled) {
                    return {
                        ok: false,
                        cancelled: true,
                        error: t('VLM planner cancelled.', 'VLM 计划已取消。')
                    };
                }
                if (request.superseded || !requestStillActive(request)) {
                    return { ok: false, stale: true, error: t('VLM planner response is no longer current.', 'VLM 计划响应已过期。') };
                }
                if (!projectRequestStillCurrent(request)) {
                    deactivateRequest(request);
                    return { ok: false, projectChanged: true, stale: true, error: t('The project changed while the Agent was thinking.', 'Agent 思考期间项目已发生变化。') };
                }
                if (!response?.ok) {
                    return { ok: false, error: response?.details || response?.error || t('VLM planner failed.', 'VLM 计划失败。') };
                }
                const parsed = call('extractCanvasAgentJsonObject', null, response.text || '');
                if (!parsed) {
                    return { ok: false, error: t('VLM planner returned no JSON.', 'VLM 计划没有返回 JSON。'), text: response.text || '' };
                }
                const plan = call('normalizeCanvasAgentInstructionPlan', null, parsed, prompt, 'vlm_agent');
                if (!plan) {
                    return { ok: false, error: t('VLM planner returned an invalid plan.', 'VLM 计划格式无效。'), text: response.text || '' };
                }
                return { ok: true, plan, text: response.text || '', request_id: requestId };
            } finally {
                request.finished = true;
                if (timer) unschedule(timer);
                if (activeRequest === request) activeRequest = null;
            }
        }

        async function cancelCanvasAgentVlmInstruction() {
            const request = activeRequest;
            if (!request) return { ok: false, cancelled: false, error: 'no active VLM planner request' };
            request.cancelled = true;
            interruptRequest(request, 'cancelled');
            const cancelResult = await scheduleBackendCancel(request);
            return Object.assign({ ok: true, cancelled: true, request_id: request.requestId }, cancelResult?.ok === false ? { cancel_error: cancelResult.error } : {});
        }

        function getCanvasAgentVlmInstructionRequestState() {
            if (!activeRequest) return null;
            return {
                request_id: activeRequest.requestId,
                project_id: activeRequest.projectId,
                cancelled: !!activeRequest.cancelled,
                timed_out: !!activeRequest.timedOut,
                superseded: !!activeRequest.superseded
            };
        }

        return {
            canvasAgentVlmAgentContextPayload,
            requestCanvasAgentVlmInstructionPlan,
            cancelCanvasAgentVlmInstruction,
            getCanvasAgentVlmInstructionRequestState,
            plannerTimeoutMs: getPlannerTimeoutMs()
        };
    }

    window.SimpAICanvasWorkbenchVlmInstruction = Object.assign({}, window.SimpAICanvasWorkbenchVlmInstruction || {}, {
        createCanvasAgentVlmInstructionController
    });
})();
