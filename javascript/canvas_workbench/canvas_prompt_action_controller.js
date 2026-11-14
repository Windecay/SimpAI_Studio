(function () {
    'use strict';

    function createCanvasPromptActionController(context) {
        const pending = new WeakSet();
        const localize = key => context.localize(key);
        const identity = () => JSON.stringify(context.getUserContext());

        function canOptimize(node) {
            return ['preset', 'classic'].includes(node?.type) && !context.isNodeLocked(node)
                && !context.isPromptReadOnly(node) && !context.getPromptTextSourceNode(node, 'prompt');
        }

        function syncButtons(node, busy) {
            for (const root of context.getFieldRoots(node)) {
                root?.querySelectorAll('[data-node-action="optimize-prompt"]').forEach(button => {
                    button.disabled = busy || !canOptimize(node);
                    button.setAttribute('aria-busy', String(busy));
                    button.title = localize(busy ? 'Optimizing prompt...' : 'Optimize with this preset’s skill');
                    const label = button.querySelector('span');
                    if (label) label.textContent = localize(busy ? 'Optimizing...' : 'Smart optimize');
                });
            }
        }

        async function optimizePrompt(node, button) {
            if (!canOptimize(node) || button?.disabled || pending.has(node)) return { ok: false };
            const project = context.getProject();
            const payload = context.buildPayload(node);
            const original = String(payload.preset_node?.params?.prompt || '');
            if (!original.trim()) {
                context.showToast(localize('Enter a prompt before optimizing it.'));
                return { ok: false };
            }
            const owner = identity();
            // Include function, models, references and all editable parameters in the snapshot.
            const snapshot = JSON.stringify(payload);
            const current = () => context.getProject() === project && context.getNode(node.id) === node
                && identity() === owner && canOptimize(node)
                && JSON.stringify(context.buildPayload(node)) === snapshot;
            const controller = new AbortController();
            let timeout;
            pending.add(node);
            syncButtons(node, true);
            try {
                const response = await Promise.race([
                    context.request({ ...payload, text: original, action_id: 'smart_expand' }, { signal: controller.signal }),
                    new Promise((resolve, reject) => {
                        timeout = setTimeout(() => {
                            controller.abort();
                            reject(new Error(localize('Prompt optimization timed out. The original prompt was preserved.')));
                        }, context.timeoutMs || 300000);
                    })
                ]);
                if (!current()) {
                    context.showToast(localize('The prompt or preset changed. The optimization result was not applied.'));
                    return { ok: false, stale: true };
                }
                const text = String(response?.text || '').trim();
                if (response?.http_status === 404) throw new Error(localize('Reload the Studio service to enable Canvas prompt optimization.'));
                if (!response?.ok || !text) throw new Error(response?.details || response?.error || localize('Prompt optimization failed.'));
                if (text !== original) {
                    context.pushHistory(localize('Smart optimize'));
                    context.updateNodeParam(node.id, 'prompt', text, 'textarea');
                    for (const root of context.getFieldRoots(node)) {
                        root?.querySelectorAll('textarea[data-node-param="prompt"], textarea[data-inspector-param="prompt"]').forEach(field => {
                            const start = field.selectionStart, end = field.selectionEnd, scroll = field.scrollTop;
                            field.value = text;
                            field.setSelectionRange(Math.min(start, text.length), Math.min(end, text.length));
                            field.scrollTop = scroll;
                        });
                    }
                }
                context.showToast(localize('Prompt optimized. You can undo this change.'));
                return { ok: true, text };
            } catch (error) {
                if (current()) context.showToast(localize(error.message || 'Prompt optimization failed.'));
                return { ok: false, error: error.message };
            } finally {
                clearTimeout(timeout);
                pending.delete(node);
                if (context.getProject() === project && context.getNode(node.id) === node) syncButtons(node, false);
            }
        }

        return { optimizePrompt, isPending: node => pending.has(node) };
    }

    window.SimpAICanvasWorkbenchPromptAction = { createCanvasPromptActionController };
})();
