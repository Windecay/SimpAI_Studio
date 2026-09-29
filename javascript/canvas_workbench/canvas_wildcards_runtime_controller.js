(function () {
    'use strict';

    function createCanvasWildcardsRuntimeController(context) {
        const scope = context?.wildcardsRuntimeSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const apiSource = scope.apiSource || {};
        const projectSource = scope.projectSource || {};
        const runtimeSource = scope.runtimeSource || {};
        const serializationSource = scope.serializationSource || {};
        const patchSource = scope.patchSource || {};

        function canvasRunPromptParamText(value) {
            return value == null ? '' : String(value);
        }

        async function refreshWildcardsCatalog(node, options) {
            const opts = options || {};
            if (!node || nodeSource.isNodeLocked(node)) return null;
            if (!opts.force && Array.isArray(node.wildcards_catalog?.flat_names) && node.wildcards_catalog.flat_names.length) {
                return node.wildcards_catalog;
            }
            const requestCatalog = apiSource.getWildcardsCatalog();
            const response = typeof requestCatalog === 'function'
                ? await requestCatalog({ user_context: runtimeSource.getWorkbenchUserContext(), path: 'root', trans: false })
                : null;
            if (!response?.ok) {
                runtimeSource.showToast(response?.error || 'Wildcards catalog failed');
                return null;
            }
            const catalog = {
                flat_names: Array.isArray(response.flat_names) ? response.flat_names : [],
                names: Array.isArray(response.names) ? response.names : [],
                words: Array.isArray(response.words) ? response.words : [],
                access: response.access || {},
                updated_at: runtimeSource.nowIso()
            };
            const paramsPatch = node.type === 'wildcards_helper'
                && !node.params?.name
                && catalog.flat_names.length
                ? { name: catalog.flat_names[0] }
                : undefined;
            Object.assign(node, patchSource.buildWildcardsHelperStatePatch(node, {
                wildcardsCatalog: catalog,
                paramsPatch
            }));
            if (opts.render !== false) runtimeSource.mutate({ inspector: true });
            else if (projectSource.getProject().nodes.includes(node)) runtimeSource.scheduleSave();
            return node.wildcards_catalog;
        }

        async function buildWildcardPreviewForNode(node) {
            if (!node || !['preset', 'classic'].includes(node.type)) return null;
            const requestPreview = apiSource.getWildcardsPreview();
            if (typeof requestPreview !== 'function') return null;
            const params = node.type === 'classic'
                ? serializationSource.serializeClassicNodeForRun(node).params
                : serializationSource.serializePresetForRun(node).params;
            const seedRandom = params.seed_random !== false && params.seed_random !== 'false';
            const seed = seedRandom ? -1 : (params.image_seed ?? params.seed ?? -1);
            const response = await requestPreview({
                user_context: runtimeSource.getWorkbenchUserContext(),
                prompt: canvasRunPromptParamText(params.prompt),
                negative_prompt: canvasRunPromptParamText(params.negative_prompt),
                seed,
                image_number: params.image_number || serializationSource.presetGenerationImageNumberValue(node) || params.scene_image_number || 1,
                max_samples: 3
            });
            if (response?.ok) {
                Object.assign(node, patchSource.buildPresetWildcardPreviewPatch(node, { preview: response }));
                return response;
            }
            return null;
        }

        return { refreshWildcardsCatalog, buildWildcardPreviewForNode, canvasRunPromptParamText };
    }

    window.SimpAICanvasWorkbenchWildcardsRuntime = Object.assign(
        {}, window.SimpAICanvasWorkbenchWildcardsRuntime || {}, { createCanvasWildcardsRuntimeController }
    );
})();
