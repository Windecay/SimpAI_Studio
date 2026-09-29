(function () {
    'use strict';

    function createCanvasNodeRenderSignature(context) {
        const scope = context || {};
        const assetSource = scope.assetSource || {};
        const nodeSource = scope.nodeSource || {};
        const projectSource = scope.projectSource || {};
        const timelineSource = scope.timelineSource || {};
        const mediaBrowserSource = scope.mediaBrowserSource || {};
        const overviewSource = scope.overviewSource || {};
        const getSelectedResultAsset = (...args) => assetSource.getSelectedResultAsset?.(...args) || null;
        const inferChatImageRelativePath = (...args) => assetSource.inferChatImageRelativePath?.(...args) || '';
        const getAssetRoot = () => String(assetSource.getAssetRoot?.() || '');
        const nodeStatusState = (...args) => nodeSource.nodeStatusState?.(...args) || '';
        const compareSourceSignature = (...args) => nodeSource.compareSourceSignature?.(...args) || '';
        const getNode = (...args) => projectSource.getNode?.(...args) || null;
        const getTimelineSourceAsset = (...args) => timelineSource.getTimelineSourceAsset?.(...args) || null;
        const serializableMediaBrowserState = (...args) => mediaBrowserSource.serializableMediaBrowserState?.(...args) || {};
        const mediaBrowserRuntimeSignature = (...args) => mediaBrowserSource.mediaBrowserRuntimeSignature?.(...args) || '';

        function mediaAssetRenderRootKey(asset) {
            return inferChatImageRelativePath(asset) ? getAssetRoot() : '';
        }

        function mediaAssetRenderKey(asset) {
            if (!asset) return '';
            return [
                asset.asset_id || '',
                asset.path || '',
                asset.output_path || '',
                asset.original_output_path || '',
                asset.preview_url || '',
                asset.thumb || '',
                asset.asset_relative_path || '',
                asset.relative_path || '',
                asset.asset_root_key || '',
                mediaAssetRenderRootKey(asset),
                asset.data_url ? String(asset.data_url).slice(0, 128) : '',
                asset.mime || '',
                asset.width || '',
                asset.height || '',
                asset.duration || '',
                asset.size || ''
            ].join('|');
        }

        function nodeOverviewRenderSignature(node) {
            if (!node) return '';
            const asset = overviewSource.overviewNodeAsset?.(node);
            const ports = overviewSource.overviewInputPorts?.(node) || [];
            return JSON.stringify({
                type: node.type,
                title: node.title || '',
                kind: overviewSource.overviewNodeKindLabel?.(node),
                state: nodeStatusState(node) || node.status?.state || '',
                message: node.status?.message || '',
                selected: !!overviewSource.isNodeSelected?.(node),
                locked: !!node.locked,
                ignored: !!node.ignored,
                stale: !!(overviewSource.isResultStale?.(node) || node.source?.stale || node.producer?.stale),
                asset: mediaAssetRenderKey(asset),
                inputs: ports.map(port => String(port.kind) + ':' + (port.slot || '')).join('|'),
                output: overviewSource.overviewOutputKind?.(node)
            });
        }

        function nodeRenderSignature(node) {
            if (!node) return '';
            const mediaAsset = node.type === 'result' ? getSelectedResultAsset(node) : node.asset;
            const mediaKey = mediaAssetRenderKey(mediaAsset);
            if (['video', 'audio', 'image', 'mask'].includes(node.type)) {
                return JSON.stringify({
                    type: node.type,
                    title: node.title,
                    mediaKey,
                    displayMode: node.type === 'image' ? (node.display_mode || '') : undefined,
                    mask: node.mask?.thumb || node.mask?.data_url || '',
                    params: node.type === 'mask' ? node.params || {} : undefined,
                    input: node.type === 'mask' ? node.input_node_id || '' : undefined,
                    locked: !!node.locked,
                    ignored: !!node.ignored,
                    status: nodeStatusState(node)
                });
            }
            if (node.type === 'result') {
                return JSON.stringify({
                    type: node.type,
                    title: node.title,
                    mediaKey,
                    selected: node.selected_asset_index || 0,
                    assetCount: Array.isArray(node.assets) ? node.assets.length : 0,
                    preview: mediaAssetRenderKey(node.preview),
                    previewFrames: Array.isArray(node.preview_frames) ? node.preview_frames.map(frame => mediaAssetRenderKey(frame)) : [],
                    status: node.status || {},
                    sourceKind: node.source?.kind || '',
                    stale: !!(node.source?.stale || node.producer?.stale),
                    refreshing: !!(node.source?.refreshing || node.producer?.refreshing),
                    locked: !!node.locked,
                    ignored: !!node.ignored
                });
            }
            if (node.type === 'compare') {
                return JSON.stringify({
                    type: node.type,
                    title: node.title,
                    w: node.w,
                    h: node.h,
                    inputs: node.inputs || {},
                    sourceA: compareSourceSignature(node, 'a'),
                    sourceB: compareSourceSignature(node, 'b'),
                    params: node.params || {},
                    locked: !!node.locked,
                    ignored: !!node.ignored
                });
            }
            if (node.type === 'timeline') {
                return JSON.stringify({
                    type: node.type,
                    title: node.title,
                    w: node.w,
                    h: node.h,
                    params: node.params || {},
                    tracks: node.tracks || [],
                    clips: (node.clips || []).map(clip => {
                        const source = getNode(clip.source_node_id);
                        const asset = getTimelineSourceAsset(source);
                        return Object.assign({}, clip, {
                            asset_key: mediaAssetRenderKey(asset)
                        });
                    }),
                    locked: !!node.locked,
                    ignored: !!node.ignored
                });
            }
            if (node.type === 'media_browser') {
                return JSON.stringify({
                    type: node.type,
                    title: node.title,
                    w: node.w,
                    h: node.h,
                    media_browser: serializableMediaBrowserState(node.media_browser || {}),
                    runtime: mediaBrowserRuntimeSignature(node.id),
                    locked: !!node.locked,
                    ignored: !!node.ignored
                });
            }
            if (node.type === 'vlm') {
                const chat = node.chat || {};
                const messageSignature = (message) => {
                    const images = Array.isArray(message?.images) ? message.images : [];
                    return {
                        role: message?.role || '',
                        content: message?.content || '',
                        notice: message?.notice || '',
                        pending: !!message?.pending,
                        image_count: message?.image_count || 0,
                        actions: Array.isArray(message?.actions) ? message.actions.length : 0,
                        images: images.map(image => [
                            image?.id || '',
                            image?.name || '',
                            image?.thumb || '',
                            image?.preview_url || '',
                            image?.path || '',
                            image?.output_path || '',
                            image?.original_output_path || '',
                            image?.asset_relative_path || '',
                            image?.relative_path || '',
                            image?.asset_root_key || '',
                            mediaAssetRenderRootKey(image),
                            image?.data_url ? String(image.data_url).slice(0, 96) : ''
                        ])
                    };
                };
                return JSON.stringify({
                    type: node.type,
                    title: node.title,
                    w: node.w,
                    h: node.h,
                    params: node.params || {},
                    image_inputs: node.image_inputs || {},
                    chat: {
                        conversation_id: chat.conversation_id || '',
                        messages: Array.isArray(chat.messages) ? chat.messages.map(messageSignature) : [],
                        pending_images: Array.isArray(chat.pending_images) ? chat.pending_images.map(image => [
                            image?.id || '',
                            image?.name || '',
                            image?.mime || '',
                            image?.thumb || '',
                            image?.preview_url || '',
                            image?.path || '',
                            image?.output_path || '',
                            image?.original_output_path || '',
                            image?.asset_relative_path || '',
                            image?.relative_path || '',
                            image?.asset_root_key || '',
                            mediaAssetRenderRootKey(image),
                            image?.data_url ? String(image.data_url).slice(0, 96) : ''
                        ]) : []
                    },
                    text: node.text?.value || '',
                    status: node.status || {},
                    vlm_model_status: node.vlm_model_status || {},
                    custom_model_choices: node.custom_model_choices || [],
                    locked: !!node.locked,
                    ignored: !!node.ignored
                });
            }
            if (node.type === 'note') {
                return JSON.stringify({
                    type: node.type,
                    title: node.title,
                    w: node.w,
                    h: node.h,
                    text: node.text || '',
                    style: node.style || {},
                    locked: !!node.locked,
                    ignored: !!node.ignored
                });
            }
            return JSON.stringify(node);
        }

        return { mediaAssetRenderRootKey, mediaAssetRenderKey, nodeOverviewRenderSignature, nodeRenderSignature };
    }

    window.SimpAICanvasWorkbenchNodeRenderSignature = Object.assign({}, window.SimpAICanvasWorkbenchNodeRenderSignature || {}, {
        createCanvasNodeRenderSignature
    });
})();
