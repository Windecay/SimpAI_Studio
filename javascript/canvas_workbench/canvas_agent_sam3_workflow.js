(function () {
    'use strict';

    function createCanvasAgentSam3WorkflowController(source) {
        const scope = source?.sam3WorkflowSource || source || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function'
            ? scope[name](...args)
            : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const getProject = () => call('getProject', {}) || {};
        const getNode = (...args) => call('getNode', null, ...args);
        const getGroup = (...args) => call('getGroup', null, ...args);
        const buildSam3SourcePatch = (...args) => call('buildSam3SourcePatch', {}, ...args) || {};
        const buildSam3StatePatch = (...args) => call('buildSam3StatePatch', {}, ...args) || {};
        const buildGroupFieldPatch = (...args) => call('buildGroupFieldPatch', {}, ...args) || {};
        const renderGroups = (...args) => call('renderGroups', null, ...args);
        const findCanvasAgentReservedResultNodeForPreset = (...args) => call('findCanvasAgentReservedResultNodeForPreset', null, ...args);
        const setCanvasAgentMessage = (...args) => call('setCanvasAgentMessage', null, ...args);
        const scheduleSave = (...args) => call('scheduleSave', null, ...args);

        function canvasAgentManualMaskWorkflowNodes(presetNode, resultNode, maskNode) {
            const seen = new Set();
            return [presetNode, resultNode, maskNode].filter((node) => {
                if (!node || seen.has(node.id)) return false;
                seen.add(node.id);
                return true;
            });
        }

        function canvasAgentSam3WorkflowNodes(workflow, sam3Node, presetNode, resultNode) {
            return canvasAgentManualMaskWorkflowNodes(presetNode, resultNode, sam3Node);
        }

        function canvasAgentSam3WorkflowTitle(workflow, stateLabel) {
            const tool = workflow?.tool_label || t('Video quick tool', '视频快捷工具');
            const base = workflow?.group_title_base || `${t('Agent video quick tool', 'Agent 视频快捷工具')}: ${tool}`;
            const suffix = String(stateLabel || '').trim();
            return suffix ? `${base} · ${suffix}` : base;
        }

        function setCanvasAgentSam3WorkflowState(sam3Node, patch, stateLabel) {
            const node = getNode(sam3Node?.id) || sam3Node;
            if (!node) return null;
            const workflow = Object.assign({}, node.source?.agent_video_mask_workflow || {}, patch || {});
            Object.assign(node, buildSam3SourcePatch(node, {
                sourcePatch: { agent_video_mask_workflow: workflow }
            }));
            if (workflow.group_id && stateLabel !== undefined) {
                const group = getGroup(workflow.group_id);
                if (group) {
                    Object.assign(group, buildGroupFieldPatch(group, 'title', canvasAgentSam3WorkflowTitle(workflow, stateLabel)));
                    renderGroups();
                }
            }
            return workflow;
        }

        function canvasAgentSam3WorkflowMaskSignature(sam3Node, response, details) {
            const asset = sam3Node?.asset || {};
            return [
                details?.origin || sam3Node?.source?.mask_origin || '',
                asset.asset_id || asset.id || '',
                asset.path || asset.output_path || asset.preview_url || '',
                response?.mask_video?.path || response?.asset_ref?.path || '',
                response?.mask_video?.asset_id || response?.asset_ref?.asset_id || ''
            ].filter(Boolean).join('|') || `${sam3Node?.id || 'sam3'}:${Date.now()}`;
        }

        function findCanvasAgentSam3WorkflowForPreset(presetNode) {
            if (!presetNode?.id) return null;
            const project = getProject();
            return (Array.isArray(project.nodes) ? project.nodes : []).find(node => {
                const workflow = node?.source?.agent_video_mask_workflow;
                return node?.type === 'sam3_video_mask' && workflow?.preset_node_id === presetNode.id;
            }) || null;
        }

        function canvasAgentResultForPresetRun(presetNode, requestedResult) {
            if (requestedResult) return requestedResult;
            const workflowSam3 = findCanvasAgentSam3WorkflowForPreset(presetNode);
            const resultId = workflowSam3?.source?.agent_video_mask_workflow?.result_node_id || '';
            const resultNode = resultId ? getNode(resultId) : null;
            if (resultNode?.type === 'result') return resultNode;
            return findCanvasAgentReservedResultNodeForPreset(presetNode);
        }

        function handleCanvasAgentSam3VideoMaskEditorClosed(sam3Node) {
            const currentSam3 = getNode(sam3Node?.id) || sam3Node;
            const workflow = currentSam3?.source?.agent_video_mask_workflow;
            if (!workflow || currentSam3?.asset) return;
            setCanvasAgentMessage(t('SAM3 editor closed. Generate or upload a video mask to auto-run the reserved result.', 'SAM3 编辑器已关闭。生成或上传视频蒙版后会自动运行预留结果。'));
        }

        function handleCanvasAgentSam3VideoMaskState(sam3Node, state, response, details) {
            const currentSam3 = getNode(sam3Node?.id) || sam3Node;
            const workflow = currentSam3?.source?.agent_video_mask_workflow;
            if (!workflow) return;
            const stateKey = String(state || '').toLowerCase();
            const message = response?.details || response?.error || response?.message || '';
            if (stateKey === 'cancelled' || stateKey === 'canceled') {
                setCanvasAgentSam3WorkflowState(currentSam3, {
                    last_auto_run_state: 'mask_cancelled',
                    last_auto_run_error: message || 'SAM3 mask generation cancelled'
                }, t('Mask cancelled', '蒙版已取消'));
                setCanvasAgentMessage(t('SAM3 mask generation was cancelled. Generate or upload a mask to continue the reserved workflow.', 'SAM3 蒙版生成已取消。生成或上传蒙版后可继续预留工作流。'));
                scheduleSave();
                return;
            }
            if (stateKey === 'failed') {
                setCanvasAgentSam3WorkflowState(currentSam3, {
                    last_auto_run_state: details?.origin === 'upload' ? 'mask_upload_failed' : 'mask_failed',
                    last_auto_run_error: message || 'SAM3 mask generation failed'
                }, t('Mask failed', '蒙版失败'));
                setCanvasAgentMessage(t('SAM3 mask failed. The Agent workflow is preserved; generate or upload another mask to retry.', 'SAM3 蒙版失败。Agent 工作流已保留；生成或上传新的蒙版即可重试。'));
                scheduleSave();
            }
        }

        return {
            canvasAgentManualMaskWorkflowNodes,
            canvasAgentSam3WorkflowNodes,
            canvasAgentSam3WorkflowTitle,
            setCanvasAgentSam3WorkflowState,
            canvasAgentSam3WorkflowMaskSignature,
            findCanvasAgentSam3WorkflowForPreset,
            canvasAgentResultForPresetRun,
            handleCanvasAgentSam3VideoMaskEditorClosed,
            handleCanvasAgentSam3VideoMaskState
        };
    }

    window.SimpAICanvasWorkbenchAgentSam3Workflow = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAgentSam3Workflow || {},
        { createCanvasAgentSam3WorkflowController }
    );
})();
