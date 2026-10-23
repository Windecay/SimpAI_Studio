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
        const isBatchAnyRunning = node => call(batchSource, 'isBatchAnyRunning', false, node);

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

        const activeImports = new WeakSet();

        async function addBatchAnyFilesToNode(node, files) {
            if (!node || node.type !== 'batch_any' || call(nodeSource, 'isNodeLocked', false, node)) return;
            const project = call(projectSource, 'getProject', null);
            const projectId = project?.id;
            const isAttached = () => project?.id === projectId && (project?.nodes || []).includes(node);
            const isCurrent = () => call(projectSource, 'getProject', null) === project && isAttached() && node.type === 'batch_any';
            const canImport = () => isCurrent() && !call(nodeSource, 'isNodeLocked', false, node);
            if (!isCurrent()) return false;
            if (activeImports.has(node)) {
                showToast(t('A file import is already in progress.', '正在导入文件，请等待完成。'));
                return;
            }
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
            if (!call(batchSource, 'batchAnyAcceptsMediaKind', true, node, firstKind)) {
                showToast(t('Selected files do not match this Batch type or its connected inputs.', '所选文件与 Batch 类型或已连接的输入槽不匹配。'));
                return;
            }
            const accepted = selected.filter(file => call(batchSource, 'batchAnyMediaKindFromFile', '', file) === firstKind);
            const skipped = selected.length - accepted.length;
            if (!accepted.length) {
                showToast(t('Selected files do not match this Batch type.', '所选文件与当前批次类型不一致。'));
                return;
            }
            call(historySource, 'pushHistory', undefined, 'Import Batch Any files');
            const ownsImportState = !isBatchAnyRunning(node);
            let imported = 0;
            let failure = null;
            let canceled = false;
            const canceledMessage = () => t('Import stopped because the Batch target changed or was locked.', '导入已停止：Batch 目标已变更或被锁定。');
            activeImports.add(node);
            try {
                applyBatchAnyStatePatch(node, {
                    statePatch: {
                        media_kind: firstKind,
                        items: Array.isArray(node.items) ? node.items.slice() : []
                    },
                    batchPatch: ownsImportState ? { state: 'importing', last_error: '' } : { last_error: '' }
                });
                call(renderSource, 'mutate', undefined, { inspector: true });
                for (const file of accepted) {
                    if (!canImport()) { canceled = true; break; }
                    const item = await createBatchAnyItemFromFile(file, firstKind);
                    if (!canImport()) { canceled = true; break; }
                    if (!item) throw new Error(t('Failed to prepare a batch item.', '无法创建批量素材。'));
                    const items = Array.isArray(node.items) ? node.items.slice() : [];
                    items.push(item);
                    const patchOptions = { statePatch: { items } };
                    if (items.length === 1 && !isBatchAnyRunning(node)) {
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
                    imported += 1;
                    if (item.asset?.data_url) {
                        call(storageSource, 'materializeBatchAnyItemForStorage', Promise.resolve(), node.id, item.id)
                            .catch(err => warn('[SimpAI Canvas] batch item materialize skipped:', err));
                    }
                }
                if (!canceled && !node.asset && node.items.length && !isBatchAnyRunning(node)) {
                    call(batchSource, 'setBatchAnyCurrentItem', undefined, node, 0, { render: false });
                }
            } catch (err) {
                if (!canImport()) canceled = true;
                else failure = err;
            } finally {
                activeImports.delete(node);
                if (isCurrent()) {
                    const batchPatch = { last_error: canceled ? canceledMessage() : failure ? (failure.message || String(failure)) : '' };
                    if (!failure && !canceled) batchPatch.imported_at = nowIso();
                    if (ownsImportState && node.batch?.state === 'importing' && !isBatchAnyRunning(node)) {
                        batchPatch.state = canceled ? 'canceled' : failure ? 'failed' : 'idle';
                    }
                    applyBatchAnyStatePatch(node, { batchPatch });
                    call(renderSource, 'mutate', undefined, { inspector: true });
                } else if (ownsImportState && isAttached() && node.batch?.state === 'importing') {
                    // End this operation on its original project without refreshing the newly active project.
                    applyBatchAnyStatePatch(node, { batchPatch: { state: 'canceled', last_error: canceledMessage() } });
                }
            }
            if (canceled) {
                if (isCurrent()) showToast(canceledMessage());
                return false;
            }
            if (failure) {
                showToast(t('Import failed after {count} item(s): {error}', '已导入 {count} 个素材，后续导入失败：{error}')
                    .replace('{count}', imported).replace('{error}', failure.message || String(failure)));
                throw failure;
            }
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
                try {
                    await addBatchAnyFilesToNode(node, files);
                } catch (err) {
                    warn('[SimpAI Canvas] batch file import failed:', err);
                }
            }, { once: true });
            input.click();
        }

        return { addBatchAnyNode, createBatchAnyItemFromFile, addBatchAnyFilesToNode, openBatchAnyFilePicker };
    }

    window.SimpAICanvasWorkbenchBatchAnyCreation = Object.assign(
        {}, window.SimpAICanvasWorkbenchBatchAnyCreation || {}, { createCanvasBatchAnyCreationController }
    );
})();
