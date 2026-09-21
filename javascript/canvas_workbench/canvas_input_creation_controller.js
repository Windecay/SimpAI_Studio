(function () {
    'use strict';

    function createCanvasInputCreationController(context) {
        const scope = context?.inputCreationSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const projectSource = scope.projectSource || {};
        const factorySource = scope.factorySource || {};
        const portSource = scope.portSource || {};
        const layoutSource = scope.layoutSource || {};
        const creationSource = scope.creationSource || {};
        const fileSource = scope.fileSource || {};
        const mediaSource = scope.mediaSource || {};
        const connectionSource = scope.connectionSource || {};
        const edgeSource = scope.edgeSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(uiSource, 'showToast', undefined, message);
        const create = (name, ...args) => call(creationSource, name, null, ...args);
        const setPendingInputTarget = (...args) => call(connectionSource, 'setPendingInputTarget', undefined, ...args);

        function inputTargetDisplayLabel(target) {
            const node = getNode(target?.toId);
            if (!node || !target) return t('Input', '输入');
            if (target.kind === 'upload') return call(portSource, 'getSlotLabel', '', node, target.slot);
            if (target.kind === 'config') return `${target.slot} Config`;
            if (target.kind === 'text') {
                if (target.slot === 'negative_prompt') return t('Negative Prompt', '负向提示词');
                if (target.slot === 'prompt') return t('Prompt', '提示词');
                return t('Text input', '文本输入');
            }
            if (target.kind === 'generate') return t('Generation output', '生成输出');
            if (target.kind === 'qwen_tts_audio') return t('Reference audio', '参考音频');
            if (target.kind === 'director_media_group') return t('{kind} pool', '{kind} 素材池').replace('{kind}', target.slot || t('Media', '媒体'));
            if (target.kind === 'director_media') return target.slot || t('Director media', '导演媒体');
            if (target.kind === 'compare') return t('Compare image {slot}', '对比图像 {slot}').replace('{slot}', String(target.slot || 'a').toUpperCase());
            if (target.kind === 'timeline') return t('Timeline media', '时间线媒体');
            if (target.kind === 'batch_any') return t('Batch item', '批量素材');
            if (target.kind === 'sam3_video') return t('Source video', '源视频');
            if (['wd14', 'vlm', 'mask_source', 'pose_reference', 'gaussian_reference', 'liveportrait_source', 'liveportrait_reference'].includes(target.kind)) return t('Image input', '图像输入');
            return t('Input', '输入');
        }

        function mediaCreationOption(kind, imported) {
            const labels = {
                image: imported ? [t('Import Image node...', '导入图像节点...'), 'fa-image'] : [t('Image node', '图像节点'), 'fa-image'],
                video: imported ? [t('Import Video node...', '导入视频节点...'), 'fa-film'] : [t('Video node', '视频节点'), 'fa-film'],
                audio: imported ? [t('Import Audio node...', '导入音频节点...'), 'fa-wave-square'] : [t('Audio node', '音频节点'), 'fa-wave-square']
            };
            const entry = labels[kind] || labels.image;
            return { key: imported ? `import_${kind}` : kind, label: entry[0], icon: entry[1] };
        }

        function inputTargetCreationOptions(target) {
            const node = getNode(target?.toId);
            if (!node || !target) return [];
            if (target.kind === 'text') return [
                { key: 'text', label: t('Text node', '文本节点'), icon: 'fa-font' },
                { key: 'text_merge', label: t('Multi-text Merge node', '多文本合并节点'), icon: 'fa-code-merge' }
            ];
            if (target.kind === 'config') return [{
                key: 'config', label: call(portSource, 'configTitleForKind', '', target.slot),
                icon: call(portSource, 'configIconForKind', '', target.slot)
            }];
            if (target.kind === 'generate') return [
                { key: 'classic', label: t('Classic generation node', '经典生成节点'), icon: 'fa-wand-magic-sparkles' },
                { key: 'preset', label: t('Choose Preset / Scene...', '选择 Preset / 场景...'), icon: 'fa-diagram-project' },
                { key: 'timeline', label: t('Media Timeline node', '媒体时间线节点'), icon: 'fa-clapperboard' },
                { key: 'qwen_tts', label: t('Qwen TTS node', 'Qwen TTS 节点'), icon: 'fa-microphone-lines' }
            ];
            if (target.kind === 'upload') {
                if (target.slot === 'inpaint_mask') return [
                    { key: 'mask', label: t('Advanced Masking node', '高级遮罩节点'), icon: 'fa-wand-magic-sparkles' },
                    mediaCreationOption('image', false)
                ];
                if (target.slot === 'sam3_mask_video') return [
                    { key: 'sam3', label: t('SAM3 Video Mask node', 'SAM3 视频遮罩节点'), icon: 'fa-wand-magic-sparkles' },
                    mediaCreationOption('video', false)
                ];
                if (target.slot === 'scene_reference_video' || target.slot === 'scene_reference_video2') return [
                    mediaCreationOption('video', false),
                    { key: 'camera_motion', label: t('Uni3C Camera Motion node', 'Uni3C 运镜节点'), icon: 'fa-camera-rotate' }
                ];
                return [mediaCreationOption(call(portSource, 'getUploadSlotMediaKind', '', target.slot) || 'image', false)];
            }
            if (['wd14', 'mask_source', 'pose_reference', 'gaussian_reference', 'liveportrait_source', 'liveportrait_reference', 'compare'].includes(target.kind)) return [mediaCreationOption('image', false)];
            if (target.kind === 'vlm') {
                return (node.params?.mode || 'single') === 'chat'
                    ? [mediaCreationOption('image', false)]
                    : [mediaCreationOption('image', false), mediaCreationOption('video', false)];
            }
            if (target.kind === 'sam3_video') return [mediaCreationOption('video', false)];
            if (target.kind === 'qwen_tts_audio') return [mediaCreationOption('audio', false)];
            if (target.kind === 'director_media' || target.kind === 'director_media_group') {
                const kind = target.kind === 'director_media_group'
                    ? target.slot
                    : (String(target.slot || '').split('_')[0] || 'image');
                return [mediaCreationOption(['image', 'video', 'audio'].includes(kind) ? kind : 'image', false)];
            }
            if (target.kind === 'timeline') return [mediaCreationOption('image', false), mediaCreationOption('video', false), mediaCreationOption('audio', false)];
            if (target.kind === 'batch_any') {
                const kind = call(portSource, 'batchAnyMediaKind', '', node);
                if (kind === 'text' || !kind) {
                    const items = [
                        { key: 'text', label: t('Text node', '文本节点'), icon: 'fa-font' },
                        { key: 'text_merge', label: t('Multi-text Merge node', '多文本合并节点'), icon: 'fa-code-merge' }
                    ];
                    if (!kind) items.push(mediaCreationOption('image', true), mediaCreationOption('video', true), mediaCreationOption('audio', true));
                    return items;
                }
                return [mediaCreationOption(kind, true)];
            }
            return [];
        }

        function getInputImageNodePosition(targetNode, handle, size) {
            const point = handle ? call(layoutSource, 'getHandleCenterWorldPoint', null, handle) : null;
            const targetRect = call(layoutSource, 'getNodeRect', {}, targetNode);
            return {
                x: Math.round(targetRect.x - size.w - 80),
                y: Math.round((point ? point.y : targetRect.y + targetRect.h / 2) - size.h / 2)
            };
        }

        function createEmptyImageNodeForInput(targetNode, slotLabel, handle) {
            const size = { w: 264, h: 300 };
            const base = getInputImageNodePosition(targetNode, handle, size);
            const node = call(factorySource, 'buildEmptyImageNodeForInput', null, targetNode, slotLabel, base, size);
            if (!node) return null;
            call(layoutSource, 'placeNodeAvoidingOverlap', undefined, node, base, { excludeIds: [targetNode?.id].filter(Boolean) });
            const project = call(projectSource, 'getProject', {}) || {};
            Object.assign(project, call(projectSource, 'buildProjectNodeAppendPatch', {}, project, node));
            return node;
        }

        function createEmptyMediaNodeForInput(targetNode, mediaKind, slotLabel, handle) {
            if (!['video', 'audio'].includes(mediaKind)) return null;
            const size = call(layoutSource, 'defaultNodeSize', {}, mediaKind);
            const base = getInputImageNodePosition(targetNode, handle, size);
            const node = call(factorySource, 'buildEmptyMediaNodeForInput', null, targetNode, mediaKind, slotLabel, base, size);
            if (!node) return null;
            call(layoutSource, 'placeNodeAvoidingOverlap', undefined, node, base, { excludeIds: [targetNode?.id].filter(Boolean) });
            const project = call(projectSource, 'getProject', {}) || {};
            Object.assign(project, call(projectSource, 'buildProjectNodeAppendPatch', {}, project, node));
            return node;
        }

        function createNodeForUploadInput(targetNode, slot, handle) {
            if (slot === 'sam3_mask_video') return createSam3VideoMaskNodeForPresetInput(targetNode, handle);
            if (call(portSource, 'getUploadSlotMediaKind', '', slot) === 'video') return createVideoNodeForUploadInput(targetNode, slot, handle);
            return createImageNodeForUploadInput(targetNode, slot, handle);
        }

        function finishCreatedMediaInput(node, buildMessage) {
            call(selectionSource, 'selectInputSource', undefined, node.id);
            call(renderSource, 'mutate', undefined);
            showToast(buildMessage());
            return node;
        }

        async function createVideoNodeForUploadInput(targetNode, slot, handle) {
            if (!targetNode || !slot || !['preset', 'classic'].includes(targetNode.type)) return null;
            if (call(nodeSource, 'isNodeLocked', false, targetNode)) {
                showToast(t('Locked node cannot change inputs', '锁定节点不能修改输入'));
                return null;
            }
            const existingId = targetNode.upload_slots?.[slot];
            const existingNode = existingId ? getNode(existingId) : null;
            if (existingNode?.type === 'video' || existingNode?.type === 'result') {
                call(selectionSource, 'selectNode', undefined, existingNode.id);
                showToast(t('{slot} already has a video source.', '{slot} 已有视频源').replace('{slot}',
                    call(portSource, 'getSlotLabel', '', targetNode, slot)));
                return existingNode;
            }
            const file = await call(fileSource, 'pickLocalVideoFile', null);
            if (!file) return null;
            const size = call(layoutSource, 'defaultNodeSize', {}, 'video');
            const base = getInputImageNodePosition(targetNode, handle, size);
            const videoNode = await call(fileSource, 'addMediaNodeFromFile', null, file, base);
            if (!videoNode || videoNode.type !== 'video') return null;
            call(edgeSource, 'createUploadEdge', undefined, videoNode.id, targetNode.id, slot, { silent: true });
            return finishCreatedMediaInput(videoNode, () =>
                t('{slot} video node added.', '{slot} 视频节点已添加').replace('{slot}', call(portSource, 'getSlotLabel', '', targetNode, slot)));
        }

        function createImageNodeForUploadInput(targetNode, slot, handle) {
            if (!targetNode || !slot || !['preset', 'classic'].includes(targetNode.type)) return null;
            if (call(nodeSource, 'isNodeLocked', false, targetNode)) {
                showToast(t('Locked node cannot change inputs', '锁定节点不能修改输入'));
                return null;
            }
            if (slot === 'sam3_mask_video') return createSam3VideoMaskNodeForPresetInput(targetNode, handle);
            if (call(portSource, 'getUploadSlotMediaKind', '', slot) !== 'image') {
                showToast(t('Only image input ports support double-click creation of Image nodes.', '当前只有图片输入口支持双击创建图像节点'));
                return null;
            }
            const existingId = targetNode.upload_slots?.[slot];
            const existingNode = existingId ? getNode(existingId) : null;
            if (existingNode) {
                call(selectionSource, 'selectNode', undefined, existingNode.id);
                showToast(t('{slot} already has an image node.', '{slot} 已有图片节点').replace('{slot}',
                    call(portSource, 'getSlotLabel', '', targetNode, slot)));
                return existingNode;
            }
            call(historySource, 'pushHistory', undefined, 'Add input image node');
            const imageNode = createEmptyImageNodeForInput(targetNode, call(portSource, 'getSlotLabel', '', targetNode, slot), handle);
            if (!imageNode) {
                showToast(t('Unable to create image input node.', '无法创建图像输入节点。'));
                return null;
            }
            call(edgeSource, 'createUploadEdge', undefined, imageNode.id, targetNode.id, slot, { silent: true });
            return finishCreatedMediaInput(imageNode, () =>
                t('{slot} image node added.', '{slot} 图片节点已添加').replace('{slot}', call(portSource, 'getSlotLabel', '', targetNode, slot)));
        }

        function createImageNodeForImageInput(targetNode, kind, slot, handle) {
            if (!targetNode || !kind) return null;
            if (call(nodeSource, 'isNodeLocked', false, targetNode)) {
                showToast(t('Locked node cannot change inputs', '锁定节点不能修改输入'));
                return null;
            }
            const existingId = kind === 'vlm'
                ? targetNode.image_inputs?.[slot || 'image_1']
                : kind === 'compare'
                ? targetNode.inputs?.[['a', 'b'].includes(slot) ? slot : 'a']
                : kind === 'liveportrait_expression_source'
                ? targetNode.liveportrait_expression?.source_node_id || targetNode.input_node_id
                : kind === 'liveportrait_expression_reference'
                ? targetNode.liveportrait_expression?.reference_node_id || targetNode.reference_node_id
                : targetNode.input_node_id;
            const existingNode = existingId ? getNode(existingId) : null;
            if (existingNode) {
                call(selectionSource, 'selectNode', undefined, existingNode.id);
                showToast(t('This input already has an image node.', '输入口已有图片节点'));
                return existingNode;
            }
            const label = kind === 'vlm'
                ? (call(portSource, 'getVlmImageSlots', []).find(item => item.key === slot)?.label || slot || 'Image')
                : kind === 'pose_studio'
                ? t('Reference', '参考图')
                : kind === 'gaussian_studio'
                ? t('Reference', '参考图')
                : kind === 'mask_source'
                ? t('Source', '来源图')
                : kind === 'compare'
                ? `Compare ${String(['a', 'b'].includes(slot) ? slot : 'a').toUpperCase()}`
                : kind === 'liveportrait_expression_source'
                ? t('Source', '源图')
                : kind === 'liveportrait_expression_reference'
                ? t('Reference Expression', '参考表情')
                : 'Image';
            call(historySource, 'pushHistory', undefined, 'Add input image node');
            const imageNode = createEmptyImageNodeForInput(targetNode, label, handle);
            if (!imageNode) {
                showToast(t('Unable to create image input node.', '无法创建图像输入节点。'));
                return null;
            }
            if (kind === 'vlm') call(edgeSource, 'createVlmImageEdge', undefined, imageNode.id, targetNode.id, slot, { silent: true });
            else if (kind === 'mask_source') call(edgeSource, 'createMaskImageEdge', undefined, imageNode.id, targetNode.id, { silent: true });
            else if (kind === 'compare') call(edgeSource, 'createCompareImageEdge', undefined, imageNode.id, targetNode.id, slot, { silent: true });
            else if (kind === 'pose_studio') call(edgeSource, 'createPoseStudioReferenceEdge', undefined, imageNode.id, targetNode.id, { silent: true });
            else if (kind === 'gaussian_studio') call(edgeSource, 'createGaussianStudioReferenceEdge', undefined, imageNode.id, targetNode.id, { silent: true });
            else if (kind === 'liveportrait_expression_source' || kind === 'liveportrait_expression_reference') call(edgeSource, 'createLivePortraitExpressionImageEdge', undefined, imageNode.id, targetNode.id, slot || (kind === 'liveportrait_expression_reference' ? 'reference' : 'source'), { silent: true });
            else call(edgeSource, 'createWd14ImageEdge', undefined, imageNode.id, targetNode.id, { silent: true });
            return finishCreatedMediaInput(imageNode, () => t('{label} node added.', '{label} 节点已添加').replace('{label}', label));
        }

        async function uploadSourceVideoForSam3Node(targetNode, handle) {
            if (!targetNode || targetNode.type !== 'sam3_video_mask') return null;
            if (call(nodeSource, 'isNodeLocked', false, targetNode)) {
                showToast(t('Locked node cannot change inputs', '锁定节点不能修改输入'));
                return null;
            }
            const file = await call(fileSource, 'pickLocalVideoFile', null);
            if (!file) return null;
            const size = call(layoutSource, 'defaultNodeSize', {}, 'video');
            const base = getInputImageNodePosition(targetNode, handle, size);
            const videoNode = await call(fileSource, 'addMediaNodeFromFile', null, file, base);
            if (!videoNode || videoNode.type !== 'video') return null;
            call(edgeSource, 'createSam3VideoMaskEdge', undefined, videoNode.id, targetNode.id, { silent: true });
            return finishCreatedMediaInput(videoNode, () =>
                t('Source video uploaded and connected to SAM3.', '源视频已上传并连接到 SAM3'));
        }

        function createAdvancedMaskNodeForClassicInput(targetNode, handle) {
            if (!targetNode || targetNode.type !== 'classic') return null;
            if (call(nodeSource, 'isNodeLocked', false, targetNode)) {
                showToast(t('Locked node cannot change inputs', '锁定节点不能修改输入'));
                return null;
            }
            const existingId = targetNode.upload_slots?.inpaint_mask;
            const existingNode = existingId ? getNode(existingId) : null;
            if (existingNode?.type === 'mask') {
                call(selectionSource, 'selectNode', undefined, existingNode.id);
                showToast(t('Advanced Masking node already connected', '高级遮罩节点已连接'));
                return existingNode;
            }
            const size = call(layoutSource, 'defaultNodeSize', {}, 'mask');
            const base = getInputImageNodePosition(targetNode, handle, size);
            call(historySource, 'pushHistory', undefined, 'Add advanced masking node');
            const maskNode = create('addMaskNode', base, { history: false });
            if (!maskNode) {
                showToast(t('Unable to create Advanced Masking node.', '无法创建高级遮罩节点。'));
                return null;
            }
            const sourceId = targetNode.upload_slots?.inpaint_image || null;
            const sourceNode = sourceId ? getNode(sourceId) : null;
            if (sourceNode && ['image', 'result'].includes(sourceNode.type)) {
                call(edgeSource, 'createMaskImageEdge', undefined, sourceNode.id, maskNode.id, { silent: true });
            }
            call(edgeSource, 'createUploadEdge', undefined, maskNode.id, targetNode.id, 'inpaint_mask', { silent: true });
            Object.assign(targetNode, call(factorySource, 'buildNodeParamsPatch', {}, targetNode, {
                paramsPatch: { inpaint_advanced_masking_checkbox: true }
            }));
            return finishCreatedMediaInput(maskNode, () => sourceNode
                ? t('Advanced Masking added and connected to Source Image.', '高级遮罩已添加并接入源图像')
                : t('Advanced Masking added; connect a Source Image.', '高级遮罩已添加，请连接源图像'));
        }

        function createSam3VideoMaskNodeForPresetInput(targetNode, handle) {
            if (!targetNode || !['preset', 'classic'].includes(targetNode.type)) return null;
            const existingId = targetNode.upload_slots?.sam3_mask_video;
            const existingNode = existingId ? getNode(existingId) : null;
            if (existingNode?.type === 'sam3_video_mask') {
                call(selectionSource, 'selectNode', undefined, existingNode.id);
                showToast(t('SAM3 Video Mask node already connected', 'SAM3 视频遮罩节点已连接'));
                return existingNode;
            }
            const size = call(layoutSource, 'defaultNodeSize', {}, 'sam3_video_mask');
            const base = getInputImageNodePosition(targetNode, handle, size);
            call(historySource, 'pushHistory', undefined, 'Add SAM3 video mask node');
            const sam3Node = create('addSam3VideoMaskNode', base, { history: false, render: false, toast: false });
            if (!sam3Node) {
                showToast(t('Unable to create SAM3 Video Mask node.', '无法创建 SAM3 视频遮罩节点。'));
                return null;
            }
            const sourceId = targetNode.upload_slots?.sam3_input_video || targetNode.upload_slots?.scene_video || null;
            const sourceNode = sourceId ? getNode(sourceId) : null;
            if (sourceNode && call(mediaSource, 'isSam3VideoMaskSource', false, sourceNode)) {
                call(edgeSource, 'createSam3VideoMaskEdge', undefined, sourceNode.id, sam3Node.id, { silent: true });
            }
            call(edgeSource, 'createUploadEdge', undefined, sam3Node.id, targetNode.id, 'sam3_mask_video', { silent: true });
            return finishCreatedMediaInput(sam3Node, () => sourceNode
                ? t('SAM3 Video Mask added and connected to source video.', 'SAM3 视频遮罩已添加并接入源视频。')
                : t('SAM3 Video Mask added; connect a source video.', 'SAM3 视频遮罩已添加，请连接源视频。'));
        }

        function inputUpstreamWorld(target, nodeType) {
            const targetNode = getNode(target?.toId);
            const size = call(layoutSource, 'defaultNodeSize', {}, nodeType || 'text');
            if (!targetNode) return call(layoutSource, 'viewportCenterWorld', { x: 0, y: 0 });
            return getInputImageNodePosition(targetNode, target?.handle || null, size);
        }

        function finishCreatedInputSource(sourceNode, target) {
            if (!sourceNode || !target) return null;
            if (!call(connectionSource, 'connectSourceToTarget', false, sourceNode.id, target,
                { silent: true, render: false, history: false, select: false, toast: false })) {
                showToast(t('The created node does not match this input type.', '创建的节点与该输入端点类型不匹配。'));
                return sourceNode;
            }
            call(selectionSource, 'selectInputSource', undefined, sourceNode.id);
            call(renderSource, 'mutate', undefined, { inspector: true });
            showToast(t('{type} created and connected.', '{type} 已创建并连接。').replace('{type}', sourceNode.title || sourceNode.type));
            return sourceNode;
        }

        async function importMediaInputSource(target, mediaKind, world) {
            const picker = mediaKind === 'image' ? 'pickLocalImageFile' : (mediaKind === 'video' ? 'pickLocalVideoFile' : 'pickLocalAudioFile');
            const file = await call(fileSource, picker, null);
            if (!file) return null;
            const node = await call(fileSource, 'addMediaNodeFromFile', null, file, world || inputUpstreamWorld(target, mediaKind));
            return finishCreatedInputSource(node, target);
        }

        function createInputSourceByOption(target, optionKey, world) {
            const targetNode = getNode(target?.toId);
            if (!targetNode || call(nodeSource, 'isNodeLocked', false, targetNode)) return null;
            const key = String(optionKey || '');
            if (key === 'config') {
                create('ensureConfigNode', targetNode, target.slot);
                return null;
            }
            if (key === 'preset') {
                setPendingInputTarget(target, world);
                create('openPresetPalette', world || inputUpstreamWorld(target, 'preset'));
                return null;
            }
            if (key.startsWith('import_')) return importMediaInputSource(target, key.slice('import_'.length), world);
            const typeForPosition = key === 'classic' ? 'classic' : (key === 'qwen_tts' ? 'qwen_tts_voice_design' : key);
            const nodeWorld = inputUpstreamWorld(target, typeForPosition);
            if (key === 'image') {
                call(historySource, 'pushHistory', undefined, 'Add input image node');
                return finishCreatedInputSource(createEmptyImageNodeForInput(targetNode, inputTargetDisplayLabel(target), target.handle), target);
            }
            if (key === 'video' || key === 'audio') {
                call(historySource, 'pushHistory', undefined, `Add input ${key} node`);
                return finishCreatedInputSource(createEmptyMediaNodeForInput(targetNode, key, inputTargetDisplayLabel(target), target.handle), target);
            }
            setPendingInputTarget(target, nodeWorld);
            if (key === 'text') return create('addTextNode', nodeWorld);
            if (key === 'text_merge') return create('addTextMergeNode', nodeWorld);
            if (key === 'mask') return create('addMaskNode', nodeWorld);
            if (key === 'sam3') return create('addSam3VideoMaskNode', nodeWorld);
            if (key === 'camera_motion') return create('addCameraMotionNode', nodeWorld);
            if (key === 'classic') return create('addClassicNode', { name: 'default', display_name: t('Classic', '经典'), backend_engine: 'Fooocus', engine_type: 'image' }, nodeWorld);
            if (key === 'timeline') return create('addTimelineNode', nodeWorld);
            if (key === 'qwen_tts') return create('addQwenTtsNode', 'voice_design', nodeWorld);
            call(connectionSource, 'clearPendingInputTarget', undefined);
            return null;
        }

        function openInputPortCreateMenu(target, x, y, world) {
            const options = inputTargetCreationOptions(target);
            if (!options.length) {
                showToast(t('This input has no registered default source yet.', '这个输入端点还没有登记默认前置节点。'));
                return;
            }
            call(uiSource, 'openContextMenu', undefined, x, y, options.map(option => ({
                label: option.label,
                icon: option.icon,
                action: () => createInputSourceByOption(target, option.key, world)
            })));
        }

        function createDefaultInputSource(target) {
            const option = inputTargetCreationOptions(target)[0];
            if (!option) {
                showToast(t('This input has no registered default source yet.', '这个输入端点还没有登记默认前置节点。'));
                return null;
            }
            return createInputSourceByOption(target, option.key, inputUpstreamWorld(target, option.key));
        }

        function openInputPortContextMenu(target, x, y) {
            const edges = call(portSource, 'inputTargetEdges', [], target);
            const createItems = inputTargetCreationOptions(target).map(option => ({
                label: t('Create {type}', '创建 {type}').replace('{type}', option.label),
                icon: option.icon,
                action: () => createInputSourceByOption(target, option.key, inputUpstreamWorld(target, option.key))
            }));
            const items = [
                { label: t('Expected input: {type}', '需要的输入：{type}').replace('{type}', inputTargetDisplayLabel(target)), icon: 'fa-circle-info', disabled: true },
                ...createItems
            ];
            if (edges.length) {
                items.push({ separator: true });
                edges.forEach((edge, index) => {
                    const source = getNode(edge.from);
                    items.push({
                        label: t('Disconnect {name}', '断开 {name}').replace('{name}', source?.title || source?.id || `${index + 1}`),
                        icon: 'fa-link-slash',
                        action: () => call(portSource, 'deleteEdge', undefined, edge.id)
                    });
                });
            }
            call(uiSource, 'openContextMenu', undefined, x, y, items);
        }

        return {
            getInputImageNodePosition, createEmptyImageNodeForInput, createEmptyMediaNodeForInput,
            createNodeForUploadInput, createVideoNodeForUploadInput, createImageNodeForUploadInput, createImageNodeForImageInput,
            uploadSourceVideoForSam3Node, createAdvancedMaskNodeForClassicInput, createSam3VideoMaskNodeForPresetInput,
            inputTargetDisplayLabel, mediaCreationOption, inputTargetCreationOptions, inputUpstreamWorld,
            finishCreatedInputSource, importMediaInputSource, createInputSourceByOption,
            openInputPortCreateMenu, createDefaultInputSource, openInputPortContextMenu
        };
    }

    window.SimpAICanvasWorkbenchInputCreation = Object.assign(
        {}, window.SimpAICanvasWorkbenchInputCreation || {}, { createCanvasInputCreationController }
    );
})();
