(function () {
    'use strict';

    function createCanvasAgentTextNodesController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const getProject = () => call('getProject', {}) || {};
        const getNode = (...args) => call('getNode', null, ...args);
        const applyTextMergeStatePatch = (node, options) => {
            const patch = call('buildTextMergeStatePatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        };
        const batchAnyMediaKind = (...args) => call('batchAnyMediaKind', '', ...args);
        const batchAnyCurrentItem = (...args) => call('batchAnyCurrentItem', null, ...args);
        const batchAnyTextFromItem = (...args) => call('batchAnyTextFromItem', '', ...args);
        const isDirectorTimelineNode = (...args) => !!call('isDirectorTimelineNode', false, ...args);
        const directorTimelinePayload = (...args) => call('directorTimelinePayload', null, ...args);
        const getStyleSelectorPrompt = (...args) => call('getStyleSelectorPrompt', '', ...args);

        function isTextOutputNode(node) {
            if (!node) return false;
            if (node.type === 'batch_any') return batchAnyMediaKind(node) === 'text';
            return ['text', 'text_merge', 'wildcards_helper', 'translation', 'tag_cart', 'wd14', 'vlm', 'style_selector'].includes(node.type)
                || isDirectorTimelineNode(node);
        }

        function getTextNodeInputSource(node) {
            if (!node || !['text', 'translation', 'tag_cart'].includes(node.type)) return null;
            const project = getProject();
            const fromId = node.text_input
                || (Array.isArray(project.edges)
                    ? project.edges.find(edge => edge.type === 'text' && edge.to === node.id && edge.slot === 'input')?.from
                    : '');
            const source = fromId ? getNode(fromId) : null;
            return isTextOutputNode(source) ? source : null;
        }

        function getPromptTextSourceNode(node, slot) {
            if (!node || !['prompt', 'negative_prompt'].includes(slot)) return null;
            const fromId = node.text_inputs?.[slot];
            const source = fromId ? getNode(fromId) : null;
            return isTextOutputNode(source) ? source : null;
        }

        function wildcardHelperBuildTag(params) {
            const p = Object.assign({
                target: 'Array (batch)',
                method: 'Random Select',
                seed_mode: 'Fixed seed',
                name: '',
                count: 1,
                start: 1,
                group_size: 1
            }, params || {});
            const name = String(p.name || '').trim();
            if (!name) return '';
            const count = Math.max(1, Math.floor(Number(p.count || 1)));
            const start = Math.max(1, Math.floor(Number(p.start || 1)));
            const groupSize = Math.max(1, Math.floor(Number(p.group_size || 1)));
            const fixedSeed = p.seed_mode !== 'Random seed';
            const inOrder = p.method === 'In order';
            const methodLetter = inOrder ? (fixedSeed ? 'L' : 'l') : (fixedSeed ? 'R' : 'r');
            if (p.target === 'Single in prompt') {
                if (inOrder) return `__${name}__:${methodLetter}${count}:${start}`;
                if (groupSize > 1) return `__${name}__:${methodLetter}${count}:${groupSize}`;
                if (count > 1) return `__${name}__:${methodLetter}${count}`;
                return `__${name}__`;
            }
            if (inOrder) return `[__${name}__:${methodLetter}${count}:${start}]`;
            if (groupSize > 1) return `[__${name}__:${methodLetter}${count}:${groupSize}]`;
            return `[__${name}__:${methodLetter}${count}]`;
        }

        function getNodeTextOutput(node, visited) {
            if (!isTextOutputNode(node)) return '';
            const seen = visited || new Set();
            if (seen.has(node.id)) return '';
            seen.add(node.id);
            if (node.type === 'style_selector') {
                return getStyleSelectorPrompt(node) || String(node.text?.value || '');
            }
            if (isDirectorTimelineNode(node)) {
                const payload = directorTimelinePayload(node);
                return String(payload?.prompt_override || '');
            }
            if (node.type === 'text') {
                const source = getTextNodeInputSource(node);
                if (source) return getNodeTextOutput(source, seen);
            }
            if (node.type === 'text_merge') {
                return getTextMergeOutput(node, seen);
            }
            if (node.type === 'translation') {
                return String(node.text?.value || '');
            }
            if (node.type === 'tag_cart') {
                const value = String(node.text?.value || '');
                if (value) return value;
                const source = getTextNodeInputSource(node);
                return source ? getNodeTextOutput(source, seen) : '';
            }
            if (node.type === 'batch_any') {
                return batchAnyTextFromItem(batchAnyCurrentItem(node)) || String(node.text?.value || '');
            }
            if (node.type === 'wildcards_helper') {
                return wildcardHelperBuildTag(node.params || {});
            }
            return String(node.text?.value || '');
        }
        const cssTextMergeInputSlots = node => {
            if (!node || node.type !== 'text_merge') return [];
            const project = getProject();
            const stored = Array.isArray(node.input_slots) ? node.input_slots : [];
            const edgeSlots = (Array.isArray(project.edges) ? project.edges : [])
                .filter(edge => edge.type === 'text' && edge.to === node.id && edge.slot)
                .map(edge => String(edge.slot));
            const slots = Array.from(new Set([...stored, ...edgeSlots].map(slot => String(slot || '').trim()).filter(Boolean)));
            slots.sort((a, b) => {
                const aNumber = Number(String(a).match(/(\d+)$/)?.[1] || Number.MAX_SAFE_INTEGER);
                const bNumber = Number(String(b).match(/(\d+)$/)?.[1] || Number.MAX_SAFE_INTEGER);
                return aNumber - bNumber || a.localeCompare(b);
            });
            let nextNumber = 1;
            while (slots.length < 2) {
                while (slots.includes(`input_${nextNumber}`)) nextNumber += 1;
                slots.push(`input_${nextNumber}`);
                nextNumber += 1;
            }
            applyTextMergeStatePatch(node, {
                inputSlots: slots,
                textInputs: node.text_inputs || {}
            });
            return slots;
        };

        function getTextMergeInputSource(node, slot) {
            if (!node || node.type !== 'text_merge' || !slot) return null;
            const project = getProject();
            const edge = (Array.isArray(project.edges) ? project.edges : [])
                .find(item => item.type === 'text' && item.to === node.id && item.slot === slot);
            const fromId = node.text_inputs?.[slot] || edge?.from || '';
            const source = fromId ? getNode(fromId) : null;
            return isTextOutputNode(source) ? source : null;
        }

        function decodeTextMergeSeparator(value) {
            return String(value ?? '')
                .replace(/\\r/g, '\r')
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t');
        }

        function getTextMergeOutput(node, visited) {
            const seen = visited || new Set();
            const values = cssTextMergeInputSlots(node)
                .map(slot => getTextMergeInputSource(node, slot))
                .filter(Boolean)
                .map(source => getNodeTextOutput(source, new Set(seen)))
                .filter(value => value !== '');
            return values.join(decodeTextMergeSeparator(node.params?.separator || ''));
        }

        function wouldCreateTextCycle(fromId, toId) {
            if (!fromId || !toId || fromId === toId) return true;
            const seen = new Set();
            const stack = [getNode(fromId)];
            while (stack.length) {
                const current = stack.pop();
                if (!current || seen.has(current.id)) continue;
                if (current.id === toId) return true;
                seen.add(current.id);
                if (current.type === 'text_merge') {
                    cssTextMergeInputSlots(current).forEach(slot => {
                        const source = getTextMergeInputSource(current, slot);
                        if (source) stack.push(source);
                    });
                } else if (['text', 'translation', 'tag_cart'].includes(current.type)) {
                    const source = getTextNodeInputSource(current);
                    if (source) stack.push(source);
                }
            }
            return false;
        }

        return {
            isTextOutputNode,
            getNodeTextOutput,
            getTextNodeInputSource,
            getPromptTextSourceNode,
            wildcardHelperBuildTag,
            textMergeInputSlots: cssTextMergeInputSlots,
            getTextMergeInputSource,
            decodeTextMergeSeparator,
            getTextMergeOutput,
            wouldCreateTextCycle
        };
    }

    window.SimpAICanvasWorkbenchTextNodes = Object.assign({}, window.SimpAICanvasWorkbenchTextNodes || {}, {
        createCanvasAgentTextNodesController
    });
})();
