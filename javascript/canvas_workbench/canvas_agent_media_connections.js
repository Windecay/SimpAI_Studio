(function () {
    'use strict';

    function createCanvasAgentMediaConnectionsController(context) {
        const scope = context || {};
        const call = (name, fallback, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : fallback;
        const t = scope.t || ((en, cn) => cn || en);
        const runtimeUiLang = (...args) => call('runtimeUiLang', 'en', ...args);
        const canvasAgentUploadSlotsForNode = (...args) => {
            const slots = call('canvasAgentUploadSlotsForNode', [], ...args);
            return Array.isArray(slots) ? slots : [];
        };
        const isCanvasAgentMaskSlot = (...args) => !!call('isCanvasAgentMaskSlot', false, ...args);
        const getUploadSlotMediaKind = (...args) => call('getUploadSlotMediaKind', 'image', ...args);
        const canNodeConnectToUploadSlot = (...args) => !!call('canNodeConnectToUploadSlot', false, ...args);
        const createUploadEdge = (...args) => call('createUploadEdge', null, ...args);
        const createCanvasAgentPresetProbeNode = (...args) => call('createCanvasAgentPresetProbeNode', null, ...args);
        const getCanvasAgentTargetMediaKind = (...args) => call('getCanvasAgentTargetMediaKind', '', ...args);
        const getVisibleClassicUploadSlots = (...args) => call('getVisibleClassicUploadSlots', [], ...args);
        const getVisibleUploadSlots = (...args) => call('getVisibleUploadSlots', [], ...args);
        const buildClassicNodeStatePatch = (...args) => call('buildClassicNodeStatePatch', {}, ...args) || {};
        const createEmptyImageNodeForInput = (...args) => call('createEmptyImageNodeForInput', null, ...args);
        const getSlotLabel = (...args) => call('getSlotLabel', 'upload', ...args);
        const buildMediaNodeStatePatch = (...args) => call('buildMediaNodeStatePatch', {}, ...args) || {};
        const buildAgentReferencePlaceholderPatch = (...args) => call('buildAgentReferencePlaceholderPatch', {}, ...args) || {};

        function connectCanvasAgentImagesToGenerator(generator, mainNode, extraNodes) {
            const uploadSlots = canvasAgentUploadSlotsForNode(generator).filter(slot => !isCanvasAgentMaskSlot(slot));
            const usedSlots = new Set();
            const mainSlot = uploadSlots.find(item => canNodeConnectToUploadSlot(mainNode, item.key))?.key || '';
            if (!mainSlot) return { ok: false, mainSlot: '', refCount: 0 };
            createUploadEdge(mainNode.id, generator.id, mainSlot, { silent: true });
            usedSlots.add(mainSlot);
            let refCount = 0;
            (Array.isArray(extraNodes) ? extraNodes : []).forEach((refNode) => {
                if (!refNode || refNode.id === mainNode.id) return;
                const refSlot = uploadSlots.find(item => !usedSlots.has(item.key) && canNodeConnectToUploadSlot(refNode, item.key))?.key || '';
                if (!refSlot) return;
                usedSlots.add(refSlot);
                createUploadEdge(refNode.id, generator.id, refSlot, { silent: true });
                refCount += 1;
            });
            return { ok: true, mainSlot, refCount };
        }

        function connectCanvasAgentMediaToGenerator(generator, groupedNodes) {
            const grouped = groupedNodes && typeof groupedNodes === 'object' ? groupedNodes : {};
            const uploadSlots = canvasAgentUploadSlotsForNode(generator).filter(slot => !isCanvasAgentMaskSlot(slot));
            const usedSlots = new Set(Object.keys(generator?.upload_slots || {}).filter(key => generator.upload_slots?.[key]));
            const connected = { image: 0, video: 0, audio: 0 };
            const missing = { image: 0, video: 0, audio: 0 };
            ['image', 'video', 'audio'].forEach((kind) => {
                const nodes = Array.isArray(grouped[kind]) ? grouped[kind] : [];
                nodes.forEach((sourceNode) => {
                    const slot = uploadSlots.find(item => (
                        !usedSlots.has(item.key)
                        && getUploadSlotMediaKind(item.key) === kind
                        && canNodeConnectToUploadSlot(sourceNode, item.key)
                    ))?.key || '';
                    if (!slot) {
                        missing[kind] += 1;
                        return;
                    }
                    usedSlots.add(slot);
                    createUploadEdge(sourceNode.id, generator.id, slot, { silent: true });
                    connected[kind] += 1;
                });
            });
            const totalConnected = connected.image + connected.video + connected.audio;
            const totalMissing = missing.image + missing.video + missing.audio;
            return {
                ok: totalConnected > 0 && totalMissing === 0,
                connected,
                missing,
                totalConnected,
                totalMissing
            };
        }

        function canvasAgentMediaConnectionError(result) {
            const missing = result?.missing || {};
            const partsEn = [];
            const partsCn = [];
            if (missing.image) {
                partsEn.push(`${missing.image} image${missing.image === 1 ? '' : 's'}`);
                partsCn.push(`${missing.image} 张图片`);
            }
            if (missing.video) {
                partsEn.push(`${missing.video} video${missing.video === 1 ? '' : 's'}`);
                partsCn.push(`${missing.video} 个视频`);
            }
            if (missing.audio) {
                partsEn.push(`${missing.audio} audio clip${missing.audio === 1 ? '' : 's'}`);
                partsCn.push(`${missing.audio} 个音频`);
            }
            return t(
                'The selected preset has no free compatible slots for: {media}.',
                '所选 preset 没有足够的兼容槽位：{media}。'
            ).replace('{media}', runtimeUiLang() === 'cn' ? partsCn.join('、') : partsEn.join(', '));
        }

        function previewCanvasAgentMediaInputSlot(entry, target, options) {
            if (!entry || !target) return null;
            const opts = options || {};
            const probe = createCanvasAgentPresetProbeNode(entry, { sceneTheme: opts.sceneTheme || '' });
            if (!probe || typeof probe !== 'object') return null;
            if (probe.type === 'classic' && (opts.classicMode || getCanvasAgentTargetMediaKind(target) === 'image')) {
                Object.assign(probe, buildClassicNodeStatePatch(probe, {
                    classicMode: opts.classicMode || 'uov'
                }));
            }
            const uploadSlots = probe.type === 'classic'
                ? getVisibleClassicUploadSlots(probe)
                : getVisibleUploadSlots(probe);
            const visibleSlots = Array.isArray(uploadSlots) ? uploadSlots : [];
            return visibleSlots.find(item => !isCanvasAgentMaskSlot(item) && canNodeConnectToUploadSlot(target, item.key))
                || (opts.compatibleOnly ? null : visibleSlots.find(item => !isCanvasAgentMaskSlot(item)))
                || null;
        }

        function canvasAgentMaskUploadSlot(node) {
            return canvasAgentUploadSlotsForNode(node).find(slot => isCanvasAgentMaskSlot(slot))?.key || '';
        }

        function canvasAgentVideoMaskUploadSlot(node) {
            const slots = canvasAgentUploadSlotsForNode(node);
            return slots.find(slot => String(slot?.key || '').toLowerCase() === 'sam3_mask_video')?.key
                || slots.find(slot => {
                    const key = String(slot?.key || '').toLowerCase();
                    const label = String(slot?.label || '').toLowerCase();
                    return key.includes('mask') && key.includes('video')
                        || label.includes('mask') && label.includes('video');
                })?.key
                || canvasAgentMaskUploadSlot(node);
        }

        function canvasAgentVideoSourceUploadSlot(node, sourceNode) {
            return canvasAgentUploadSlotsForNode(node)
                .filter(slot => !isCanvasAgentMaskSlot(slot))
                .find(slot => canNodeConnectToUploadSlot(sourceNode, slot.key))?.key || '';
        }

        function canvasAgentReferenceUploadSlotForGenerator(generator, mainSlot) {
            if (!generator) return '';
            const probeImageNode = { type: 'image', asset: null };
            return canvasAgentUploadSlotsForNode(generator)
                .filter(slot => !isCanvasAgentMaskSlot(slot) && getUploadSlotMediaKind(slot.key) === 'image')
                .find(slot => slot.key !== mainSlot && !generator.upload_slots?.[slot.key] && canNodeConnectToUploadSlot(probeImageNode, slot.key))?.key
                || '';
        }

        function createCanvasAgentReferencePlaceholderForGenerator(generator, mainSlot, toolKey, spec) {
            const refSlot = canvasAgentReferenceUploadSlotForGenerator(generator, mainSlot);
            if (!refSlot) return null;
            const label = spec?.label || t('Quick tool', '快捷工具');
            const imageNode = createEmptyImageNodeForInput(generator, getSlotLabel(generator, refSlot), null);
            if (!imageNode) return null;
            Object.assign(imageNode, buildMediaNodeStatePatch(imageNode, {
                title: t('{tool} Ref Image', '{tool} 参考图').replace('{tool}', label)
            }));
            Object.assign(imageNode, buildAgentReferencePlaceholderPatch(imageNode, {
                toolKey,
                targetNodeId: generator.id,
                targetSlot: refSlot
            }));
            createUploadEdge(imageNode.id, generator.id, refSlot, { silent: true });
            return imageNode;
        }

        function findCanvasAgentUploadSlotForTarget(node, target, preferredKey) {
            const uploadSlots = canvasAgentUploadSlotsForNode(node).filter(slotItem => !isCanvasAgentMaskSlot(slotItem));
            if (preferredKey && uploadSlots.some(item => item.key === preferredKey && canNodeConnectToUploadSlot(target, item.key))) {
                return preferredKey;
            }
            return uploadSlots.find(item => canNodeConnectToUploadSlot(target, item.key))?.key || '';
        }

        return {
            connectCanvasAgentImagesToGenerator,
            connectCanvasAgentMediaToGenerator,
            canvasAgentMediaConnectionError,
            previewCanvasAgentMediaInputSlot,
            canvasAgentMaskUploadSlot,
            canvasAgentVideoMaskUploadSlot,
            canvasAgentVideoSourceUploadSlot,
            canvasAgentReferenceUploadSlotForGenerator,
            createCanvasAgentReferencePlaceholderForGenerator,
            findCanvasAgentUploadSlotForTarget
        };
    }

    window.SimpAICanvasWorkbenchAgentMediaConnections = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAgentMediaConnections || {},
        { createCanvasAgentMediaConnectionsController }
    );
})();
