(function () {
    'use strict';

    function createCanvasAgentPatchFactoryController(context) {
        const scope = context || {};
        const nowIso = typeof scope.nowIso === 'function'
            ? scope.nowIso
            : (() => new Date().toISOString());
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            });

        function isRecord(value) {
            return !!value && typeof value === 'object' && !Array.isArray(value);
        }

        function buildAgentDecisionFormPatch(decision, options) {
            if (!decision || typeof decision !== 'object') return {};
            const config = options || {};
            const currentForm = isRecord(decision.form) ? cloneRunValue(decision.form, {}) : {};
            const form = isRecord(currentForm) ? currentForm : {};
            const formPatch = isRecord(config.formPatch) ? cloneRunValue(config.formPatch, {}) : {};
            if (isRecord(formPatch)) Object.assign(form, formPatch);
            return { form };
        }

        function buildAgentCreatedNodePatch(node, options) {
            if (!node) return {};
            const opts = options || {};
            const sourcePatch = opts.sourcePatch && typeof opts.sourcePatch === 'object' && !Array.isArray(opts.sourcePatch)
                ? cloneRunValue(opts.sourcePatch, {})
                : {};
            return {
                collapsed: true,
                source: Object.assign({}, cloneRunValue(node.source || {}, {}), sourcePatch, {
                    kind: 'canvas_agent_created',
                    created_at: node.source?.created_at || nowIso()
                })
            };
        }

        function buildAgentWorkflowPresetPatch(node, options) {
            if (!node) return {};
            const opts = options || {};
            const source = node.source || {};
            return {
                source: Object.assign({}, cloneRunValue(source, {}), {
                    agent_workflow_key: opts.workflowKey || source.agent_workflow_key || '',
                    agent_workflow_kind: opts.kind || source.agent_workflow_kind || '',
                    agent_workflow_owner_node_id: opts.ownerNodeId || source.agent_workflow_owner_node_id || '',
                    agent_workflow_preset: opts.presetName || source.agent_workflow_preset || '',
                    updated_at: nowIso()
                })
            };
        }

        function buildAgentReferencePlaceholderPatch(node, options) {
            if (!node) return {};
            const opts = options || {};
            const source = node.source || {};
            return {
                source: Object.assign({}, cloneRunValue(source, {}), {
                    kind: 'canvas_agent_reference_placeholder',
                    agent_tool: opts.toolKey || source.agent_tool || '',
                    target_node_id: opts.targetNodeId || source.target_node_id || '',
                    target_slot: opts.targetSlot || source.target_slot || '',
                    created_at: source.created_at || opts.createdAt || nowIso()
                })
            };
        }

        return {
            buildAgentDecisionFormPatch,
            buildAgentCreatedNodePatch,
            buildAgentWorkflowPresetPatch,
            buildAgentReferencePlaceholderPatch
        };
    }

    window.SimpAICanvasWorkbenchAgentPatchFactory = Object.assign({}, window.SimpAICanvasWorkbenchAgentPatchFactory || {}, {
        createCanvasAgentPatchFactoryController
    });
})();
