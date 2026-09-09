(function () {
    'use strict';

    function createCanvasAgentAudioToolsController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const maxAudioReferences = () => Math.max(1, Number(call('getMaxAudioReferences', 3) || 3));
        const getAgentState = () => call('getAgentState', {}) || {};
        const showToast = (...args) => call('showToast', null, ...args);
        const setCanvasAgentMessage = (...args) => call('setCanvasAgentMessage', null, ...args);
        const renderCanvasAgentPanel = (...args) => call('renderCanvasAgentPanel', null, ...args);
        const normalizeCanvasAgentReferences = (...args) => call('normalizeCanvasAgentReferences', [], ...args);
        const canvasAgentReferenceKey = (...args) => call('canvasAgentReferenceKey', '', ...args);
        const canvasAgentReferenceCounts = (...args) => call('canvasAgentReferenceCounts', {}, ...args);
        const addCanvasAgentReferenceFromNode = (...args) => call('addCanvasAgentReferenceFromNode', false, ...args);
        const isCanvasAgentAudioTarget = (...args) => call('isCanvasAgentAudioTarget', false, ...args);
        const runCanvasAgentAudioEdit = (...args) => call('runCanvasAgentAudioEdit', null, ...args);
        const runCanvasAgentTextToAudio = (...args) => call('runCanvasAgentTextToAudio', null, ...args);
        const runCanvasAgentAudioToVideo = (...args) => call('runCanvasAgentAudioToVideo', null, ...args);
        const setCanvasAgentSelection = (...args) => call('setCanvasAgentSelection', null, ...args);

        function canvasAgentAudioQuickToolSpec(key) {
            const specs = {
                edit: {
                    label: t('Audio Edit', '音频编辑'),
                    icon: 'fa-wave-square',
                    prompt: t('Edit or process the selected audio.', '编辑或处理选中的音频。')
                },
                generate: {
                    label: t('Text to Audio', '文生音频'),
                    icon: 'fa-music',
                    prompt: t('Generate audio from this prompt.', '根据提示词生成音频。')
                }
            };
            return specs[key] || null;
        }

        function canvasAgentAudioQuickTools() {
            return [
                { key: 'audio_edit', label: t('A-Edit', '音频编辑'), icon: 'fa-wave-square' },
                { key: 'audio_generate', label: t('A-Generate', '音频生成'), icon: 'fa-music' }
            ];
        }

        async function runCanvasAgentAudioQuickTool(audioToolKey, options) {
            const opts = options || {};
            const spec = canvasAgentAudioQuickToolSpec(audioToolKey);
            if (!spec) {
                showToast(t('Unknown audio quick tool.', '未知音频快捷工具'));
                return;
            }
            const state = getAgentState();
            if (state.busy || state.currentRun) {
                showToast(t('Agent is still working. Please wait for the current step to finish.', 'Agent 当前步骤还在运行，请等待完成。'));
                return;
            }
            const rawPrompt = String(state.input || '').trim();
            const prompt = rawPrompt || spec.prompt;
            if (audioToolKey === 'edit') {
                await runCanvasAgentAudioEdit(prompt, {
                    originalPrompt: rawPrompt || prompt,
                    targetNodeId: opts.targetNodeId || ''
                });
                return;
            }
            if (audioToolKey === 'generate') {
                await runCanvasAgentTextToAudio(prompt, { originalPrompt: rawPrompt || prompt });
                return;
            }
            showToast(t('Unknown audio quick tool.', '未知音频快捷工具'));
        }

        function setCanvasAgentAudioBridgeSource(node, options) {
            const opts = options || {};
            if (!isCanvasAgentAudioTarget(node)) {
                if (!opts.silent) showToast(t('Select an Audio node or audio Result first.', '请先选择音频节点或音频结果。'));
                return false;
            }
            normalizeCanvasAgentReferences();
            const key = canvasAgentReferenceKey(node, 'audio');
            let ref = normalizeCanvasAgentReferences().find(item => item.key === key) || null;
            if (!ref) {
                if (canvasAgentReferenceCounts().audio >= maxAudioReferences()) {
                    const message = t(
                        'Only {count} audio references are supported.',
                        '最多支持 {count} 个音频引用。'
                    ).replace('{count}', maxAudioReferences());
                    setCanvasAgentMessage(message);
                    showToast(message);
                    renderCanvasAgentPanel();
                    return false;
                }
                if (!addCanvasAgentReferenceFromNode(node, { role: 'audio', silent: true })) return false;
                normalizeCanvasAgentReferences();
                ref = normalizeCanvasAgentReferences().find(item => item.key === key) || null;
                if (!ref) return false;
            }
            normalizeCanvasAgentReferences();
            if (!opts.keepSelection) setCanvasAgentSelection(node.id);
            if (!opts.silent) {
                setCanvasAgentMessage(t('Audio source attached to Agent: {label}', '已将音频源挂载到 Agent：{label}').replace('{label}', ref.label));
                renderCanvasAgentPanel();
                showToast(t('Audio source attached to Agent.', '已挂载音频源到 Agent。'));
            }
            return true;
        }

        async function runCanvasAgentAudioBridgeFromNode(node, bridgeAction) {
            if (!setCanvasAgentAudioBridgeSource(node, { silent: true, keepSelection: true })) return;
            renderCanvasAgentPanel();
            if (bridgeAction === 'audio_to_video') {
                await runCanvasAgentAudioToVideo(getAgentState().input || t('Create a video guided by this audio.', '根据这段音频生成视频。'), {
                    originalPrompt: getAgentState().input || '',
                    targetNodeId: node?.id || ''
                });
                return;
            }
            await runCanvasAgentAudioEdit(getAgentState().input || t('Edit or process this audio.', '编辑或处理这段音频。'), {
                originalPrompt: getAgentState().input || '',
                targetNodeId: node?.id || ''
            });
        }

        return {
            canvasAgentAudioQuickToolSpec,
            canvasAgentAudioQuickTools,
            runCanvasAgentAudioQuickTool,
            setCanvasAgentAudioBridgeSource,
            runCanvasAgentAudioBridgeFromNode
        };
    }

    window.SimpAICanvasWorkbenchAudioTools = Object.assign({}, window.SimpAICanvasWorkbenchAudioTools || {}, {
        createCanvasAgentAudioToolsController
    });
})();
