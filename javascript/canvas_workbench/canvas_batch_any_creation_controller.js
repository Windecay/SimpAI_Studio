(function () {
    'use strict';

    function createCanvasBatchAnyCreationController(context) {
        const scope = context?.batchAnyCreationSource || context || {};
        const fileSource = scope.fileSource || {};
        const factorySource = scope.factorySource || {};
        const nodeSource = scope.nodeSource || {};
        const batchSource = scope.batchSource || {};
        const projectSource = scope.projectSource || {};
        const layoutSource = scope.layoutSource || {};
        const connectionSource = scope.connectionSource || {};
        const selectionSource = scope.selectionSource || {};
        const historySource = scope.historySource || {};
        const renderSource = scope.renderSource || {};
        const storageSource = scope.storageSource || {};
        const timeSource = scope.timeSource || {};
        const domSource = scope.domSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(uiSource, 'showToast', undefined, message);
        const warn = typeof uiSource.warn === 'function' ? uiSource.warn : console.warn;
        const nowIso = () => call(timeSource, 'nowIso', '');
        const applyBatchAnyStatePatch = (node, options) => call(batchSource, 'applyBatchAnyStatePatch', undefined, node, options);

        function addBatchAnyNode(world, options) {
            const opts = options || {};
            if (opts.history !== false) call(historySource, 'pushHistory', undefined, 'Add Batch Any node');
            const node = call(factorySource, 'buildBatchAnyNode', null, world, opts);
            call(layoutSource, 'placeNodeAvoidingOverlap', undefined, node, world, opts);
            const project = call(projectSource, 'getProject', {}) || {};
            Object.assign(project, call(projectSource, 'buildProjectNodeAppendPatch', {}, project, node));
            const autoMessage = call(connectionSource, 'completePendingConnectionToNode', '', node);
            call(selectionSource, 'selectBatchNode', undefined, node.id);
            if (opts.render !== false) call(renderSource, 'mutate', undefined, { inspector: true });
            if (opts.toast !== false) showToast(autoMessage
                ? t('Batch Any node added, {message}', 'Batch Any 节点已添加，{message}').replace('{message}', autoMessage)
                : t('Batch Any node added', 'Batch Any 节点已添加'));
            return node;
        }

        async function createBatchAnyItemFromFile(file, kind) {
            if (kind === 'text') {
                const text = await call(fileSource, 'readFileAsText', '', file);
                return call(factorySource, 'buildTextBatchItemFromFile', null, file, text);
            }
            const dataUrl = await call(fileSource, 'readFileAsDataUrl', '', file);
            let metadata = { width: null, height: null, duration: null, fps: null, frame_count: null };
            let thumb = '';
            let previewFrames = [];
            let waveform = [];
            if (kind === 'image') {
                metadata = await call(fileSource, 'getImageDimensions', {}, dataUrl);
                thumb = await call(fileSource, 'createThumbnailDataUrl', '', dataUrl, 1024);
            } else {
                metadata = await call(fileSource, 'getMediaMetadata', {}, dataUrl, kind);
                previewFrames = kind === 'video'
                    ? await call(fileSource, 'createVideoStoryboardDataUrls', [], dataUrl, metadata.duration, 8) : [];
                waveform = kind === 'audio' ? await call(fileSource, 'createAudioWaveformPeaks', [], file, 96) : [];
                thumb = previewFrames[0]?.thumb || '';
            }
            return call(factorySource, 'buildMediaBatchItemFromFile', null, file, kind, dataUrl, metadata, thumb, previewFrames, waveform);
        }

        async function addBatchAnyFilesToNode(node, files) {
            if (!node || node.type !== 'batch_any' || call(nodeSource, 'isNodeLocked', false, node)) return;
            const selected = Array.from(files || []).filter(file => call(fileSource, 'isMediaFile', false, file)
                || call(batchSource, 'isBatchTextFile', false, file));
            if (!selected.length) {
                showToast(t('No supported files selected.', '没有可用的文件。'));
                return;
            }
            const currentKind = call(batchSource, 'batchAnyMediaKind', '', node);
            const firstKind = currentKind || call(batchSource, 'batchAnyMediaKindFromFile', '', selected[0]);
            if (!firstKind) {
                showToast(t('Unsupported first file.', '第一个文件不支持。'));
                return;
            }
            const accepted = selected.filter(file => call(batchSource, 'batchAnyMediaKindFromFile', '', file) === firstKind);
            const skipped = selected.length - accepted.length;
            if (!accepted.length) {
                showToast(t('Selected files do not match this Batch type.', '所选文件与当前批次类型不一致。'));
                return;
            }
            call(historySource, 'pushHistory', undefined, 'Import Batch Any files');
            applyBatchAnyStatePatch(node, {
                statePatch: {
                    media_kind: firstKind,
                    items: Array.isArray(node.items) ? node.items.slice() : []
                },
                batchPatch: { state: 'importing', last_error: '' }
            });
            call(renderSource, 'mutate', undefined, { inspector: true });
            for (const file of accepted) {
                const item = await createBatchAnyItemFromFile(file, firstKind);
                const items = Array.isArray(node.items) ? node.items.slice() : [];
                items.push(item);
                const patchOptions = { statePatch: { items } };
                if (items.length === 1) {
                    patchOptions.statePatch.current_index = 0;
                    patchOptions.statePatch.asset = item.asset || null;
                    if (item.media_kind === 'text') {
                        patchOptions.textPatch = {
                            value: call(batchSource, 'batchAnyTextFromItem', '', item),
                            updated_at: item.added_at || nowIso()
                        };
                    }
                }
                applyBatchAnyStatePatch(node, patchOptions);
                if (item.asset?.data_url) {
                    call(storageSource, 'materializeBatchAnyItemForStorage', Promise.resolve(), node.id, item.id)
                        .catch(err => warn('[SimpAI Canvas] batch item materialize skipped:', err));
                }
            }
            if (!node.asset && node.items.length) call(batchSource, 'setBatchAnyCurrentItem', undefined, node, 0, { render: false });
            applyBatchAnyStatePatch(node, {
                batchPatch: { state: 'idle', imported_at: nowIso(), last_error: '' }
            });
            call(renderSource, 'mutate', undefined, { inspector: true });
            showToast(skipped
                ? t('Imported {count} item(s); skipped {skipped} mismatched file(s).', '已导入 {count} 个素材；跳过 {skipped} 个类型不一致的文件。').replace('{count}', accepted.length).replace('{skipped}', skipped)
                : t('Imported {count} item(s).', '已导入 {count} 个素材。').replace('{count}', accepted.length));
        }

        function openBatchAnyFilePicker(node) {
            if (!node || node.type !== 'batch_any') return;
            const doc = call(domSource, 'getDocument', null);
            const input = doc.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,video/*,audio/*,text/plain,.txt,.md';
            input.multiple = true;
            input.hidden = true;
            doc.body.appendChild(input);
            input.addEventListener('change', async () => {
                const files = Array.from(input.files || []);
                input.remove();
                await addBatchAnyFilesToNode(node, files);
            }, { once: true });
            input.click();
        }

        return { addBatchAnyNode, createBatchAnyItemFromFile, addBatchAnyFilesToNode, openBatchAnyFilePicker };
    }

    window.SimpAICanvasWorkbenchBatchAnyCreation = Object.assign(
        {}, window.SimpAICanvasWorkbenchBatchAnyCreation || {}, { createCanvasBatchAnyCreationController }
    );
})();
