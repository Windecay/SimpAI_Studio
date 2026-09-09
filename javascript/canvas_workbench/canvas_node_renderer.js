(function () {
    'use strict';

    function createCanvasNodeRenderer(context) {
        const {
            t, escapeHtml, nodeEffectiveRenderMode,
            renderConfigNodeHtml, renderClassicNodeHtml, renderPresetNodeHtml, renderResultNodeHtml,
            renderCompareNodeHtml, renderBatchAnyNodeHtml, renderXyzMatrixNodeHtml, renderTimelineNodeHtml,
            renderDirectorTimelineNodeHtml, renderMediaBrowserNodeHtml, renderStyleSelectorNodeHtml,
            renderVideoNodeHtml, renderAudioNodeHtml, renderNoteNodeHtml, renderWildcardsHelperNodeHtml,
            renderTextNodeHtml, renderTextMergeNodeHtml, renderTranslationNodeHtml, renderTagCartNodeHtml,
            renderWd14NodeHtml, renderVlmNodeHtml, renderMaskNodeHtml, renderSam3VideoMaskNodeHtml,
            renderCameraMotionNodeHtml, renderPoseStudioNodeHtml, renderGaussianStudioNodeHtml,
            renderLivePortraitExpressionNodeHtml, renderQwenTtsNodeHtml, renderImageNodeHtml,
            isDirectorTimelineNode, isQwenTtsNode, nodeStatusState, mediaBrowserLabel, tagCartLabel,
            getSelectedResultAsset, getNode, getVlmSourceAsset, getTimelineSourceAsset, safeAssetDisplaySrc,
            mediaBrowserRuntimeFor, readAssetInfo, getVisibleClassicUploadSlots, getVisibleUploadSlots,
            localizeCanvasLabel, detectionSlotForRegion, getDetectionConfigLabel, textMergeInputSlots,
            qwenTtsAudioInputSlots, batchAnyPortKind, getUploadSlotMediaKind, collapsedKeepClass,
            isNodeLocked, isNodeIgnored, isNodeCollapsed, isResultRefreshing, isResultStale, isCanvasRunActiveState,
            getPresetConfigKinds: getPresetConfigKindsFromContext,
            getVlmImageSlots: getVlmImageSlotsFromContext,
            getDirectorTimelineMediaKindGroups: getDirectorTimelineMediaKindGroupsFromContext
        } = context;
        const getPresetConfigKinds = () => {
            const value = typeof getPresetConfigKindsFromContext === 'function' ? getPresetConfigKindsFromContext() : [];
            return Array.isArray(value) ? value : [];
        };
        const getVlmImageSlots = () => {
            const value = typeof getVlmImageSlotsFromContext === 'function' ? getVlmImageSlotsFromContext() : [];
            return Array.isArray(value) ? value : [];
        };
        const getDirectorTimelineMediaKindGroups = () => typeof getDirectorTimelineMediaKindGroupsFromContext === 'function'
            ? getDirectorTimelineMediaKindGroupsFromContext()
            : [];

        function renderNodeHtml(node, options) {
            if (nodeEffectiveRenderMode(node, options) === 'overview') return renderNodeOverviewHtml(node);
            if (node.type === 'config') return renderConfigNodeHtml(node);
            if (node.type === 'classic') return renderClassicNodeHtml(node);
            if (node.type === 'preset') return renderPresetNodeHtml(node);
            if (node.type === 'result') return renderResultNodeHtml(node);
            if (node.type === 'compare') return renderCompareNodeHtml(node);
            if (node.type === 'batch_any') return renderBatchAnyNodeHtml(node);
            if (node.type === 'xy_matrix' || node.type === 'xyz_matrix') return renderXyzMatrixNodeHtml(node);
            if (node.type === 'timeline') return renderTimelineNodeHtml(node);
            if (isDirectorTimelineNode(node)) return renderDirectorTimelineNodeHtml(node);
            if (node.type === 'media_browser') return renderMediaBrowserNodeHtml(node);
            if (node.type === 'style_selector') return renderStyleSelectorNodeHtml(node);
            if (node.type === 'video') return renderVideoNodeHtml(node);
            if (node.type === 'audio') return renderAudioNodeHtml(node);
            if (node.type === 'note') return renderNoteNodeHtml(node);
            if (node.type === 'wildcards_helper') return renderWildcardsHelperNodeHtml(node);
            if (node.type === 'text') return renderTextNodeHtml(node);
            if (node.type === 'text_merge') return renderTextMergeNodeHtml(node);
            if (node.type === 'translation') return renderTranslationNodeHtml(node);
            if (node.type === 'tag_cart') return renderTagCartNodeHtml(node);
            if (node.type === 'wd14') return renderWd14NodeHtml(node);
            if (node.type === 'vlm') return renderVlmNodeHtml(node);
            if (node.type === 'mask') return renderMaskNodeHtml(node);
            if (node.type === 'sam3_video_mask') return renderSam3VideoMaskNodeHtml(node);
            if (node.type === 'camera_motion') return renderCameraMotionNodeHtml(node);
            if (node.type === 'pose_studio') return renderPoseStudioNodeHtml(node);
            if (node.type === 'gaussian_studio') return renderGaussianStudioNodeHtml(node);
            if (node.type === 'liveportrait_expression') return renderLivePortraitExpressionNodeHtml(node);
            if (isQwenTtsNode(node)) return renderQwenTtsNodeHtml(node);
            return renderImageNodeHtml(node);
        }

        function renderNodeOverviewHtml(node) {
            const kind = overviewNodeKindLabel(node);
            const asset = overviewNodeAsset(node);
            const thumb = overviewNodeThumbSrc(asset);
            const state = nodeStatusState(node) || node.status?.state || '';
            const message = node.status?.message || '';
            const inputPorts = overviewInputPorts(node);
            const outputKind = overviewOutputKind(node);
            const bodyMinHeight = Math.max(48, 54 + Math.max(0, inputPorts.length - 1) * 24);
            return `
<div class="sai-node-head">
  <span class="sai-node-kind">${escapeHtml(kind)}</span>
  <span class="sai-node-title">${escapeHtml(node.title || kind)}</span>
  ${renderNodeStateBadges(node)}
</div>
<div class="sai-node-overview-body" style="min-height:${bodyMinHeight}px">
  ${thumb ? `<img class="sai-node-overview-thumb" src="${escapeHtml(thumb)}" alt="" draggable="false">` : `<i class="fa-solid ${escapeHtml(overviewNodeIcon(node))}"></i>`}
  <div class="sai-node-overview-meta">
    <b>${escapeHtml(overviewNodeMeta(node))}</b>
    ${state || message ? `<span>${escapeHtml([state, message].filter(Boolean).join(' / '))}</span>` : ''}
  </div>
</div>
${inputPorts.map((port, index) => renderOverviewPort(port, index, inputPorts.length, 'in')).join('')}
${outputKind ? renderOverviewPort({ kind: outputKind, title: overviewOutputTitle(node, outputKind) }, 0, 1, 'out') : ''}`;
        }

        function overviewNodeKindLabel(node) {
            if (isQwenTtsNode(node)) return 'TTS';
            if (node.type === 'config') return configLabelForKind(node.config_kind);
            if (node.type === 'classic') return t('Classic', '经典');
            if (node.type === 'preset') return t('Scene', '场景');
            if (node.type === 'result') return t('Result', '结果');
            if (node.type === 'batch_any') return t('Batch Any', '批量素材');
            if (node.type === 'xy_matrix') return t('XY Matrix', 'XY 矩阵');
            if (node.type === 'xyz_matrix') return t('XYZ Matrix', 'XYZ 矩阵');
            if (isDirectorTimelineNode(node)) return t('Director', '导演');
            if (node.type === 'media_browser') return mediaBrowserLabel();
            if (node.type === 'style_selector') return t('Style', '风格');
            if (node.type === 'mask') return t('Mask', '遮罩');
            if (node.type === 'vlm') return 'VLM';
            if (node.type === 'tag_cart') return tagCartLabel();
            if (node.type === 'wd14') return 'WD14';
            if (node.type === 'sam3_video_mask') return 'SAM3';
            if (node.type === 'camera_motion') return 'Uni3C';
            if (node.type === 'pose_studio') return t('Pose', '姿势');
            if (node.type === 'gaussian_studio') return '3DGS';
            if (node.type === 'liveportrait_expression') return t('Live Exp', '表情');
            if (node.type === 'wildcards_helper') return t('Wildcards', '通配符');
            if (node.type === 'text_merge') return t('Text Merge', '文本合并');
            return String(node.type || 'Node').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
        }

        function overviewNodeIcon(node) {
            if (['image', 'result', 'mask', 'wd14', 'batch_any'].includes(node.type)) return 'fa-image';
            if (node.type === 'xy_matrix' || node.type === 'xyz_matrix') return 'fa-table-cells-large';
            if (isDirectorTimelineNode(node)) return 'fa-timeline';
            if (['video', 'sam3_video_mask', 'camera_motion', 'timeline', 'media_browser'].includes(node.type)) return 'fa-film';
            if (node.type === 'audio' || isQwenTtsNode(node)) return 'fa-wave-square';
            if (node.type === 'style_selector') return 'fa-palette';
            if (node.type === 'pose_studio') return 'fa-person';
            if (node.type === 'gaussian_studio') return 'fa-cube';
            if (node.type === 'liveportrait_expression') return 'fa-face-smile';
            if (node.type === 'text_merge') return 'fa-code-merge';
            if (['text', 'translation', 'tag_cart', 'wildcards_helper', 'vlm'].includes(node.type)) return 'fa-align-left';
            if (node.type === 'config') return configIconForKind(node.config_kind);
            if (node.type === 'compare') return 'fa-code-compare';
            return 'fa-cube';
        }

        function overviewNodeAsset(node) {
            if (!node) return null;
            if (node.type === 'result') return getSelectedResultAsset(node) || node.asset || node.preview || null;
            if (['image', 'video', 'audio', 'mask', 'batch_any'].includes(node.type) || isQwenTtsNode(node)) return node.asset || null;
            if (node.type === 'compare') {
                const source = getNode(node.inputs?.a || node.inputs?.b || '');
                return getVlmSourceAsset(source) || null;
            }
            if (node.type === 'timeline') {
                const clip = Array.isArray(node.clips) ? node.clips.find(item => item?.source_node_id) : null;
                return getTimelineSourceAsset(getNode(clip?.source_node_id)) || null;
            }
            if (isDirectorTimelineNode(node)) {
                const mediaInputs = node.media_inputs || {};
                const sourceId = Object.values(mediaInputs).find(Boolean);
                const source = sourceId ? getNode(sourceId) : null;
                if (source?.type === 'result') return getSelectedResultAsset(source) || source.asset || null;
                return source?.asset || null;
            }
            return node.asset || null;
        }

        function overviewNodeThumbSrc(asset) {
            if (!asset || typeof asset !== 'object') return '';
            const fallback = asset.thumb || asset.preview_url || '';
            const src = safeAssetDisplaySrc(asset, fallback);
            if (!src || (src.startsWith('data:') && src.length > 240000)) return '';
            return src;
        }

        function overviewNodeMeta(node) {
            if (node.type === 'result') {
                const count = Array.isArray(node.assets) ? node.assets.length : 0;
                return count > 1 ? `${count} results` : 'Output';
            }
            if (node.type === 'timeline') return `${Array.isArray(node.clips) ? node.clips.length : 0} clips`;
            if (isDirectorTimelineNode(node)) return `${Array.isArray(node.director?.segments) ? node.director.segments.length : 0} shots`;
            if (node.type === 'compare') return 'Compare';
            if (node.type === 'media_browser') {
                const runtime = mediaBrowserRuntimeFor(node.id);
                const count = Array.isArray(runtime.data?.items) ? runtime.data.items.length : 0;
                return runtime.loading ? 'Loading media' : `${count} items`;
            }
            if (node.type === 'vlm') return (node.params?.mode || 'single') === 'chat' ? 'Chat' : 'Single';
            if (node.type === 'classic') return node.classic_mode || 'classic';
            if (node.type === 'preset') return node.runtime?.task_method || node.runtime?.backend_engine || 'workflow';
            if (node.type === 'style_selector') return node.style_selector?.selected_name || 'Style prompt';
            if (node.type === 'pose_studio') return node.asset ? 'Pose image' : 'Pose Studio';
            if (node.type === 'gaussian_studio') return node.asset ? 'Gaussian render' : 'Gaussian Studio';
            if (node.type === 'liveportrait_expression') return node.asset ? 'Expression image' : 'LivePortrait Exp';
            if (node.type === 'config') return node.config_kind || 'config';
            return readAssetInfo(overviewNodeAsset(node) || {}).slice(0, 2).join(' / ') || overviewNodeKindLabel(node);
        }

        function renderOverviewPort(port, index, total, side) {
            const top = total > 1 ? Math.round(34 + index * 24) : 54;
            const sideClass = side === 'out' ? 'sai-node-handle-out' : 'sai-node-handle-in';
            const attrs = overviewPortAttributes(port, side);
            return `<button type="button" class="sai-node-handle ${sideClass} sai-node-overview-port" ${attrs} style="top:${top}px" title="${escapeHtml(port.title || port.slot || port.kind || '')}"></button>`;
        }

        function overviewPortAttributes(port, side) {
            const slot = escapeHtml(port.slot || '');
            if (side === 'out') return `data-handle-out="${escapeHtml(port.kind || 'output')}"`;
            if (port.kind === 'upload') return `data-handle-in="${slot}"`;
            if (port.kind === 'config') return `data-config-in="${slot}"`;
            if (port.kind === 'text') return `data-text-in="${slot}"`;
            if (port.kind === 'text_node') return 'data-text-node-in';
            if (port.kind === 'text_merge') return `data-text-node-in="${slot}"`;
            if (port.kind === 'translation_text') return 'data-translation-text-in';
            if (port.kind === 'tagcart_text') return 'data-tagcart-text-in';
            if (port.kind === 'wd14') return 'data-wd14-image-in';
            if (port.kind === 'vlm') return `data-vlm-image-in="${slot || 'image_1'}"`;
            if (port.kind === 'mask_source') return 'data-mask-source-in';
            if (port.kind === 'sam3_video') return 'data-sam3-video-in';
            if (port.kind === 'pose_reference') return 'data-pose-studio-reference-in';
            if (port.kind === 'gaussian_reference') return 'data-gaussian-studio-reference-in';
            if (port.kind === 'liveportrait_source') return 'data-liveportrait-expression-source-in';
            if (port.kind === 'liveportrait_reference') return 'data-liveportrait-expression-reference-in';
            if (port.kind === 'qwen_tts_audio') return `data-qwen-tts-audio-in="${slot}"`;
            if (port.kind === 'director_media') return `data-director-media-in="${slot}"`;
            if (port.kind === 'director_media_group') return `data-director-media-group-in="${slot}"`;
            if (port.kind === 'compare') return `data-compare-image-in="${slot || 'a'}"`;
            if (port.kind === 'timeline') return 'data-timeline-media-in';
            if (port.kind === 'generate') return 'data-handle-in-result="generate"';
            return `data-handle-in="${slot}"`;
        }

        function overviewInputPorts(node) {
            const ports = [];
            const add = (kind, slot, title) => ports.push({ kind, slot: slot || '', title: title || slot || kind });
            if (node.type === 'preset' || node.type === 'classic') {
                const slots = node.type === 'classic' ? getVisibleClassicUploadSlots(node) : getVisibleUploadSlots(node);
                slots.forEach(slot => add('upload', slot.key, localizeCanvasLabel(slot.label || slot.key)));
                getPresetConfigKinds().forEach(kind => add('config', kind, `${kind} config`));
                if (node.type === 'classic') [0, 1, 2].forEach(index => add('config', detectionSlotForRegion(index), getDetectionConfigLabel(index)));
                ['prompt', 'negative_prompt'].forEach(slot => add('text', slot, slot === 'prompt' ? 'Prompt' : 'Negative prompt'));
            } else if (node.type === 'result') add('generate', 'generate', 'Generation input');
            else if (node.type === 'text') add('text_node', 'input', 'Text input');
            else if (node.type === 'text_merge') textMergeInputSlots(node).forEach((slot, index) => add('text_merge', slot, t('Text input {number}', '文本输入 {number}').replace('{number}', index + 1)));
            else if (node.type === 'translation') add('translation_text', 'input', 'Text input');
            else if (node.type === 'tag_cart') add('tagcart_text', 'input', 'Text input');
            else if (node.type === 'wd14') add('wd14', 'image', 'Image input');
            else if (node.type === 'vlm') {
                const imageSlots = getVlmImageSlots();
                const slots = (node.params?.mode || 'single') === 'chat' ? imageSlots.slice(0, 1) : imageSlots;
                slots.forEach(slot => add('vlm', slot.key, slot.label));
            } else if (node.type === 'mask') add('mask_source', 'source', t('Image source', '图像来源'));
            else if (node.type === 'sam3_video_mask') add('sam3_video', 'source', t('Video source', '视频来源'));
            else if (node.type === 'pose_studio') add('pose_reference', 'reference', t('Reference image', '参考图'));
            else if (node.type === 'gaussian_studio') add('gaussian_reference', 'reference', t('Reference image', '参考图'));
            else if (node.type === 'liveportrait_expression') {
                add('liveportrait_source', 'source', t('Source image', '源图'));
                add('liveportrait_reference', 'reference', t('Reference expression', '参考表情'));
            }
            else if (isQwenTtsNode(node)) qwenTtsAudioInputSlots(node).forEach(slot => add('qwen_tts_audio', slot.key, slot.label || slot.key));
            else if (isDirectorTimelineNode(node)) {
                const configuredGroups = getDirectorTimelineMediaKindGroups();
                const groups = Array.isArray(configuredGroups)
                    ? configuredGroups
                    : [
                        { kind: 'image', portLabel: t('Image pool', '图片素材池') },
                        { kind: 'audio', portLabel: t('Audio pool', '音频素材池') },
                        { kind: 'video', portLabel: t('Video pool', '视频素材池') }
                    ];
                groups.forEach(group => add('director_media_group', group.kind, group.portLabel || group.label || group.kind));
            }
            else if (node.type === 'compare') ['a', 'b'].forEach(slot => add('compare', slot, `Image ${slot.toUpperCase()}`));
            else if (node.type === 'timeline') add('timeline', 'media', 'Media input');
            return ports;
        }

        function overviewOutputKind(node) {
            if (isQwenTtsNode(node)) return 'audio';
            if (node.type === 'config') return 'config';
            if (node.type === 'preset' || node.type === 'classic') return 'preset';
            if (node.type === 'image' || node.type === 'mask') return 'image';
            if (node.type === 'batch_any') return batchAnyPortKind(node);
            if (node.type === 'pose_studio') return 'image';
            if (node.type === 'gaussian_studio') return 'image';
            if (node.type === 'liveportrait_expression') return 'image';
            if (node.type === 'video' || node.type === 'sam3_video_mask' || node.type === 'camera_motion') return 'video';
            if (node.type === 'audio') return 'audio';
            if (node.type === 'result') return 'result';
            if (['text', 'text_merge', 'translation', 'tag_cart', 'wd14', 'vlm', 'wildcards_helper', 'style_selector'].includes(node.type)) return 'text';
            if (node.type === 'timeline') return 'timeline';
            if (isDirectorTimelineNode(node)) return 'text';
            return '';
        }

        function overviewOutputTitle(node, kind) {
            if (kind === 'config') return 'Config output';
            if (kind === 'preset') return 'Generated output';
            if (kind === 'timeline') return 'Timeline output';
            if (kind === 'any') return 'Any output';
            if (kind === 'text') return 'Text output';
            if (kind === 'audio') return 'Audio output';
            if (kind === 'video') return 'Video output';
            return 'Output';
        }

        function notConnectedText() {
            return t('Not connected', '未连接');
        }

        function portHintText() {
            return t('Double-click port', '双击接口');
        }

        function slotPortHintText(slotKey) {
            const kind = getUploadSlotMediaKind(slotKey);
            if (slotKey === 'sam3_mask_video') return t('Double-click for SAM3', '双击 SAM3');
            if (kind === 'video') return t('Double-click upload', '双击上传');
            if (kind === 'audio') return t('Drag audio here', '拖入音频');
            return portHintText();
        }

        function slotPortTitle(slotKey) {
            if (slotKey === 'sam3_input_video') return t('Double-click to upload source video; connect this video to a SAM3 Video Mask node input', '双击上传源视频；此视频应连接到 SAM3 视频遮罩节点输入');
            if (slotKey === 'sam3_mask_video') return t('Double-click to create/select SAM3 Video Mask; connect the SAM3 output here', '双击创建/选择 SAM3 视频遮罩；SAM3 输出接到这里');
            if (slotKey === 'scene_video') return t('Double-click to upload scene video; right-click port to disconnect', '双击上传场景视频；右键接口断开');
            if (slotKey === 'scene_reference_video' || slotKey === 'scene_reference_video2') return t('Double-click to upload reference video; right-click port to disconnect', '双击上传参考视频；右键接口断开');
            if (slotKey === 'scene_audio' || slotKey === 'scene_audio2' || slotKey === 'scene_audio3') return t('Connect an Audio node here; right-click port to disconnect', '连接音频节点到这里；右键接口断开');
            return imagePortTitle();
        }

        function slotPortButtonTitle(slotKey) {
            if (slotKey === 'sam3_input_video' || slotKey === 'scene_video' || slotKey === 'scene_reference_video' || slotKey === 'scene_reference_video2') return t('Double-click to upload video', '双击上传视频');
            if (slotKey === 'sam3_mask_video') return t('Double-click to add SAM3 Video Mask', '双击添加 SAM3 视频遮罩');
            if (slotKey === 'scene_audio' || slotKey === 'scene_audio2' || slotKey === 'scene_audio3') return t('Audio input', '音频输入');
            return imagePortButtonTitle();
        }

        function imagePortTitle() {
            return t('Double-click port to create Image node; right-click port to disconnect', '双击接口创建图像节点；右键接口断开');
        }

        function imagePortButtonTitle() {
            return t('Double-click to create Image node', '双击创建图像节点');
        }

        function configPortTitle(kind) {
            return t('Double-click to create or select {kind} Config', '双击创建或选择 {kind} 配置').replace('{kind}', kind);
        }

        function configInputTitle(kind) {
            return t('{kind} Config input', '{kind} 配置输入').replace('{kind}', kind);
        }

        function configTitleForKind(kind) {
            if (kind === 'styles') return t('Styles Config', '风格配置');
            if (kind === 'resolution') return t('Resolution Config', '分辨率配置');
            if (kind === 'advanced') return t('Advanced Config', '高级配置');
            if (kind === 'detection') return t('Detection Config', '检测配置');
            return t('Models Config', '模型配置');
        }

        function configLabelForKind(kind) {
            if (kind === 'styles') return t('Styles', '风格');
            if (kind === 'resolution') return t('Resolution', '分辨率');
            if (kind === 'advanced') return t('Advanced', '高级');
            if (kind === 'detection') return t('Detection', '检测');
            return t('Models', '模型');
        }

        function configIconForKind(kind) {
            if (kind === 'styles') return 'fa-palette';
            if (kind === 'resolution') return 'fa-ruler-combined';
            if (kind === 'advanced') return 'fa-sliders';
            if (kind === 'detection') return 'fa-crosshairs';
            return 'fa-cubes';
        }

        function renderPresetConfigPortRow(node, kind) {
            const label = configLabelForKind(kind);
            return `<div class="sai-config-port-row${collapsedKeepClass(node, 'config', kind)}" data-config-interface="${escapeHtml(kind)}" title="${escapeHtml(configPortTitle(label))}">
    <button type="button" class="sai-node-handle sai-node-handle-in" data-config-in="${escapeHtml(kind)}" title="${escapeHtml(configInputTitle(label))}"></button>
    <i class="fa-solid ${escapeHtml(configIconForKind(kind))}"></i><span>${escapeHtml(configTitleForKind(kind))}</span><small>${escapeHtml(portHintText())}</small>
  </div>`;
        }

        function renderNodeStateBadges(node) {
            const badges = [];
            if (isNodeLocked(node)) badges.push('<span class="sai-node-state-badge" title="Locked"><i class="fa-solid fa-lock"></i></span>');
            if (isNodeIgnored(node)) badges.push('<span class="sai-node-state-badge is-ignored" title="Skipped"><i class="fa-solid fa-forward-step"></i></span>');
            if (isNodeCollapsed(node)) badges.push(`<span class="sai-node-state-badge is-collapsed" title="${escapeHtml(t('Collapsed', '已折叠'))}"><i class="fa-solid fa-down-left-and-up-right-to-center"></i></span>`);
            if (isResultRefreshing(node)) badges.push(`<span class="sai-node-state-badge is-stale" title="${escapeHtml(t('Result refresh in progress', '结果正在刷新'))}"><i class="fa-solid fa-hourglass-half"></i></span>`);
            if (isResultStale(node)) badges.push(`<span class="sai-node-state-badge is-stale" title="${escapeHtml(t('Stale result: upstream inputs changed', '结果已过期：上游输入已变化'))}"><i class="fa-solid fa-triangle-exclamation"></i></span>`);
            return badges.join('');
        }

        function renderRunnableNodeStatusFoot(node) {
            const state = String(nodeStatusState(node) || '').toLowerCase();
            if (!state || state === 'idle' || state === 'finished') return '';
            if (!isCanvasRunActiveState(state) && !['blocked', 'failed', 'canceled', 'skipped'].includes(state)) return '';
            const message = typeof node.status === 'object' && node.status?.message ? node.status.message : state;
            return `<div class="sai-node-foot">${escapeHtml(message)}</div>`;
        }

        return {
            renderNodeHtml,
            overviewNodeKindLabel,
            overviewNodeAsset,
            overviewInputPorts,
            overviewOutputKind,
            notConnectedText,
            portHintText,
            slotPortHintText,
            slotPortTitle,
            slotPortButtonTitle,
            imagePortTitle,
            imagePortButtonTitle,
            configPortTitle,
            configInputTitle,
            configTitleForKind,
            configLabelForKind,
            configIconForKind,
            renderPresetConfigPortRow,
            renderNodeStateBadges,
            renderRunnableNodeStatusFoot
        };
    }

    window.SimpAICanvasWorkbenchNodeRenderer = Object.assign({}, window.SimpAICanvasWorkbenchNodeRenderer || {}, {
        createCanvasNodeRenderer
    });
})();
