(function () {
    'use strict';

    function createCanvasGenerationMetadataController(context) {
        const scope = context?.generationMetadataSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const selectionSource = scope.selectionSource || {};
        const layoutSource = scope.layoutSource || {};
        const presetSource = scope.presetSource || {};
        const patchSource = scope.patchSource || {};
        const historySource = scope.historySource || {};
        const timeSource = scope.timeSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getProject = () => call(projectSource, 'getProject', { nodes: [], edges: [] });
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const toast = text => call(uiSource, 'showToast', undefined, text);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function nodeGenerationMetadata(node) {
            if (!node) return {};
            const asset = node.type === 'result' ? call(nodeSource, 'getSelectedResultAsset', null, node) : node.asset;
            const candidates = [
                asset?.generation_metadata,
                node.asset?.generation_metadata,
                node.source?.generation_metadata,
                asset?.metadata,
                node.metadata
            ];
            return candidates.find(item => item && typeof item === 'object') || {};
        }

        function generationMetadataPrompt(metadata) {
            if (!metadata || typeof metadata !== 'object') return '';
            return String(metadata.prompt || metadata.positive_prompt || metadata.positive || '').trim();
        }

        function generationMetadataNegativePrompt(metadata) {
            if (!metadata || typeof metadata !== 'object') return '';
            return String(metadata.negative_prompt || metadata.negative || '').trim();
        }

        function generationMetadataParameters(metadata) {
            const params = metadata?.parameters;
            return params && typeof params === 'object' ? params : {};
        }

        function generationMetadataParam(metadata, keys) {
            const params = generationMetadataParameters(metadata);
            const lowerMap = {};
            Object.keys(params).forEach(key => { lowerMap[String(key).toLowerCase()] = key; });
            for (const key of keys || []) {
                if (Object.prototype.hasOwnProperty.call(params, key) && params[key] !== '') return params[key];
                const realKey = lowerMap[String(key).toLowerCase()];
                if (realKey && params[realKey] !== '') return params[realKey];
            }
            return undefined;
        }

        function generationMetadataSeed(metadata) {
            const raw = generationMetadataParam(metadata, ['seed', 'Seed', 'image_seed']);
            const seed = Number.parseInt(String(raw ?? '').trim(), 10);
            return Number.isFinite(seed) && seed >= 0 ? seed : null;
        }

        function isGenerationPromptTargetNode(node) {
            return !!node && (node.type === 'preset' || node.type === 'classic');
        }

        function generationPromptTargetLabel(node) {
            if (!node) return '';
            return node.title || node.preset?.display_name || node.preset?.name || node.id || '';
        }

        function nodeDistanceScore(node, world) {
            const x = Number(node?.x || 0);
            const y = Number(node?.y || 0);
            const wx = Number(world?.x || 0);
            const wy = Number(world?.y || 0);
            return Math.hypot(x - wx, y - wy);
        }

        function resolveGenerationPromptTarget(sourceNode, world) {
            const addUnique = (list, node) => {
                if (isGenerationPromptTargetNode(node) && node.id !== sourceNode?.id && !list.some(item => item.id === node.id)) list.push(node);
            };
            const candidates = [];
            call(selectionSource, 'getSelectedNodeIdList', []).forEach(id => addUnique(candidates, getNode(id)));
            const selectedNodeId = call(selectionSource, 'getSelectedNodeId', null);
            if (selectedNodeId) addUnique(candidates, getNode(selectedNodeId));
            if (sourceNode?.producer?.preset_node_id) addUnique(candidates, getNode(sourceNode.producer.preset_node_id));
            if (sourceNode?.id) {
                getProject().edges
                    .filter(edge => edge.from === sourceNode.id && ['upload', 'media', 'text'].includes(edge.type))
                    .forEach(edge => addUnique(candidates, getNode(edge.to)));
            }
            const origin = world || (sourceNode ? { x: sourceNode.x || 0, y: sourceNode.y || 0 }
                : call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 }));
            getProject().nodes
                .filter(isGenerationPromptTargetNode)
                .sort((a, b) => nodeDistanceScore(a, origin) - nodeDistanceScore(b, origin))
                .slice(0, 6)
                .forEach(node => addUnique(candidates, node));
            return candidates[0] || null;
        }

        function applyMetadataParamIfVisible(target, metadata, sourceKeys, targetKeys, paramsPatch) {
            if (!target || !metadata) return false;
            const raw = generationMetadataParam(metadata, sourceKeys);
            if (raw === undefined || raw === null || raw === '') return false;
            const visibleKeys = new Set([
                ...Object.keys(target.params || {}),
                ...call(presetSource, 'getVisiblePresetParams', [], target).map(param => param.key)
            ]);
            const targetKey = (targetKeys || []).find(key => visibleKeys.has(key));
            if (!targetKey || !paramsPatch || typeof paramsPatch !== 'object') return false;
            const numeric = Number(raw);
            paramsPatch[targetKey] = Number.isFinite(numeric) && String(raw).trim() !== '' ? numeric : String(raw);
            return true;
        }

        function applyGenerationMetadataToPromptTarget(target, metadata, options) {
            if (!isGenerationPromptTargetNode(target)) return false;
            if (call(nodeSource, 'isNodeLocked', false, target)) {
                toast(t('Locked generator node cannot be changed.', '锁定的生成节点不能修改。'));
                return false;
            }
            const prompt = generationMetadataPrompt(metadata);
            const negativePrompt = generationMetadataNegativePrompt(metadata);
            if (!prompt && !negativePrompt) {
                toast(t('No prompt metadata to apply.', '没有可回填的提示词元数据。'));
                return false;
            }
            const promptSource = call(nodeSource, 'getPromptTextSourceNode', null, target, 'prompt');
            const negativeSource = call(nodeSource, 'getPromptTextSourceNode', null, target, 'negative_prompt');
            if (prompt && promptSource) {
                toast(t('Generator prompt is connected from another text node.', '生成节点的 Prompt 已由文本节点连接。'));
                return false;
            }
            call(historySource, 'pushHistory', undefined, 'Apply generation metadata prompt');
            const paramsPatch = {};
            let changed = false;
            if (prompt) {
                paramsPatch.prompt = prompt;
                changed = true;
            }
            if (negativePrompt && !negativeSource) {
                paramsPatch.negative_prompt = negativePrompt;
                changed = true;
            }
            const seed = generationMetadataSeed(metadata);
            if (seed !== null) {
                paramsPatch.seed_random = false;
                paramsPatch.image_seed = seed;
                changed = true;
            }
            changed = applyMetadataParamIfVisible(target, metadata, ['steps', 'Steps'], ['steps', 'sample_steps'], paramsPatch) || changed;
            changed = applyMetadataParamIfVisible(target, metadata, ['guidance_scale', 'cfg_scale', 'CFG scale'], ['guidance_scale', 'cfg_scale'], paramsPatch) || changed;
            changed = applyMetadataParamIfVisible(target, metadata, ['sampler', 'Sampler'], ['sampler'], paramsPatch) || changed;
            changed = applyMetadataParamIfVisible(target, metadata, ['scheduler', 'Scheduler'], ['scheduler'], paramsPatch) || changed;
            if (!changed) {
                toast(t('No compatible metadata fields were applied.', '没有可兼容回填的元数据字段。'));
                return false;
            }
            Object.assign(target, call(patchSource, 'buildNodeParamsPatch', {}, target, { paramsPatch }));
            Object.assign(target, call(patchSource, 'buildGenerationMetadataPatch', {}, target, {
                metadata: {
                    source: metadata.source || '',
                    scheme: metadata.scheme || '',
                    label: options?.sourceLabel || '',
                    applied_at: call(timeSource, 'nowIso', '')
                }
            }));
            call(selectionSource, 'selectMetadataTarget', undefined, target.id);
            call(renderSource, 'mutate', undefined, { inspector: true });
            toast(t('Metadata prompt filled into {target}.', '元数据提示词已填入 {target}。').replace('{target}', generationPromptTargetLabel(target)));
            return true;
        }

        return {
            nodeGenerationMetadata, generationMetadataPrompt, generationMetadataNegativePrompt,
            generationMetadataParameters, generationPromptTargetLabel, resolveGenerationPromptTarget,
            applyGenerationMetadataToPromptTarget
        };
    }

    window.SimpAICanvasWorkbenchGenerationMetadata = Object.assign(
        {}, window.SimpAICanvasWorkbenchGenerationMetadata || {}, { createCanvasGenerationMetadataController }
    );
})();
