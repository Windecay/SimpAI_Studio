(function () {
    'use strict';

    const TARGETS = new Map([
        ['scene_audio', { kind: 'audio' }],
        ['scene_video', { kind: 'video' }],
        ['sam3_input_video', { kind: 'video' }],
        ['sam3_output_mask_video', { kind: 'video', claimDrop: false, dropKinds: ['video', 'image'] }],
    ]);
    const DRAG_OVER_CLASS = 'simpai-media-replacement-drag-over';
    const FILE_INPUT_WAIT_MS = 2000;
    const activeReplacements = new Set();
    const EXTENSIONS = {
        audio: /\.(?:aac|aiff?|flac|m4a|mp3|ogg|opus|wav|wma)$/i,
        image: /\.(?:bmp|gif|jpe?g|png|webp)$/i,
        video: /\.(?:avi|m4v|mkv|mov|mp4|mpeg|mpg|webm)$/i,
    };

    function supports(componentId) {
        return TARGETS.has(String(componentId || ''));
    }

    function fileMatchesKind(file, kind) {
        if (!(file instanceof File)) return false;
        const mime = String(file.type || '').toLowerCase();
        if (mime.startsWith(`${kind}/`)) return true;
        return !mime && !!EXTENSIONS[kind]?.test(String(file.name || ''));
    }

    function transferFiles(dataTransfer) {
        const files = Array.from(dataTransfer?.files || []).filter((file) => file instanceof File);
        if (files.length || !dataTransfer?.items) return files;
        return Array.from(dataTransfer.items)
            .filter((item) => item?.kind === 'file')
            .map((item) => item.getAsFile?.())
            .filter((file) => file instanceof File);
    }

    function transferContainsFile(dataTransfer) {
        if (!dataTransfer) return false;
        if (dataTransfer.files?.length) return true;
        return Array.from(dataTransfer.items || []).some((item) => item?.kind === 'file');
    }

    function transferMayMatch(dataTransfer, kind) {
        const files = transferFiles(dataTransfer);
        if (files.length) return files.some((file) => fileMatchesKind(file, kind));
        return Array.from(dataTransfer?.items || []).some((item) => {
            if (item?.kind !== 'file') return false;
            const mime = String(item.type || '').toLowerCase();
            return !mime || mime.startsWith(`${kind}/`);
        });
    }

    function transferMayMatchTarget(dataTransfer, config) {
        const kinds = Array.isArray(config?.dropKinds) && config.dropKinds.length
            ? config.dropKinds
            : [config?.kind];
        return kinds.filter(Boolean).some((kind) => transferMayMatch(dataTransfer, kind));
    }

    function targetForEvent(event) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const hovered = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
            ? document.elementFromPoint(event.clientX, event.clientY)
            : null;
        for (const [componentId, config] of TARGETS) {
            const root = document.getElementById(componentId);
            if (!root) continue;
            if (
                path.some((node) => node === root)
                || root.contains(event.target)
                || root.contains(hovered)
            ) {
                return { componentId, config, root };
            }
        }
        return null;
    }

    function findClearButton(root) {
        const wrappers = Array.from(root?.querySelectorAll('.icon-button-wrapper') || []);
        for (let index = wrappers.length - 1; index >= 0; index -= 1) {
            const buttons = wrappers[index].querySelectorAll('button');
            if (buttons.length) return buttons[buttons.length - 1];
        }
        return null;
    }

    function waitForFileInput(root, timeoutMs = FILE_INPUT_WAIT_MS) {
        const currentInput = root?.querySelector('input[type="file"]');
        if (currentInput) return Promise.resolve(currentInput);
        if (!root) return Promise.resolve(null);

        return new Promise((resolve) => {
            let timer = 0;
            const observer = new MutationObserver(() => {
                const input = root.querySelector('input[type="file"]');
                if (!input) return;
                observer.disconnect();
                if (timer) window.clearTimeout(timer);
                resolve(input);
            });
            observer.observe(root, { childList: true, subtree: true });
            timer = window.setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeoutMs);
        });
    }

    function submitFile(input, file) {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    async function replaceFile(componentId, file) {
        const perf = window.SimpAIStudioPerformance;
        const startedAt = perf ? performance.now() : 0;
        const config = TARGETS.get(String(componentId || ''));
        const root = document.getElementById(componentId);
        perf?.mark('media_replacement.begin', {
            component_id: componentId,
            kind: config?.kind || '',
            file,
            root_found: Boolean(root),
            active_before: activeReplacements.has(componentId),
        });
        if (!config || !root || !fileMatchesKind(file, config.kind)) {
            perf?.mark('media_replacement.rejected', {
                component_id: componentId,
                reason: !config ? 'unsupported' : !root ? 'root-missing' : 'file-kind-mismatch',
            });
            return false;
        }
        if (activeReplacements.has(componentId)) {
            perf?.mark('media_replacement.rejected', { component_id: componentId, reason: 'already-active' }, { urgent: true });
            return false;
        }

        activeReplacements.add(componentId);
        let outcome = 'failed';
        try {
            let input = root.querySelector('input[type="file"]');
            if (!input) {
                const clearButton = findClearButton(root);
                if (!clearButton) {
                    outcome = 'clear-button-missing';
                    return false;
                }
                perf?.mark('media_replacement.clear', { component_id: componentId });
                clearButton.click();
                input = await waitForFileInput(root);
                perf?.mark('media_replacement.input_wait_complete', {
                    component_id: componentId,
                    input_found: Boolean(input),
                    elapsed_ms: performance.now() - startedAt,
                });
            }
            if (!input) {
                outcome = 'file-input-missing';
                return false;
            }
            perf?.mark('media_replacement.submit', { component_id: componentId, file });
            submitFile(input, file);
            outcome = 'submitted';
            return true;
        } catch (error) {
            outcome = 'error';
            perf?.mark('media_replacement.error', { component_id: componentId, error }, { urgent: true });
            console.warn('[SimpAI] Media replacement upload failed.', componentId, error);
            return false;
        } finally {
            activeReplacements.delete(componentId);
            perf?.mark('media_replacement.finish', {
                component_id: componentId,
                outcome,
                elapsed_ms: performance.now() - startedAt,
                active_after: activeReplacements.has(componentId),
                active_count: activeReplacements.size,
            }, { urgent: outcome !== 'submitted' });
        }
    }

    function stopNativeDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }

    function clearDragStates() {
        for (const componentId of TARGETS.keys()) {
            document.getElementById(componentId)?.classList.remove(DRAG_OVER_CLASS);
        }
    }

    function handleDrag(event) {
        const target = targetForEvent(event);
        if (!target || !transferContainsFile(event.dataTransfer)) return;
        if (target.config.claimDrop !== false) stopNativeDrop(event);
        if (transferMayMatchTarget(event.dataTransfer, target.config)) {
            target.root.classList.add(DRAG_OVER_CLASS);
        }
    }

    document.addEventListener('dragenter', handleDrag, true);
    document.addEventListener('dragover', handleDrag, true);
    document.addEventListener('dragleave', (event) => {
        const target = targetForEvent(event);
        if (!target) clearDragStates();
    }, true);
    document.addEventListener('drop', (event) => {
        const target = targetForEvent(event);
        if (!target || !transferContainsFile(event.dataTransfer)) return;
        clearDragStates();
        if (target.config.claimDrop === false) return;
        stopNativeDrop(event);
        const file = transferFiles(event.dataTransfer)
            .find((candidate) => fileMatchesKind(candidate, target.config.kind));
        window.SimpAIStudioPerformance?.mark('media_replacement.drop_claimed', {
            component_id: target.componentId,
            kind: target.config.kind,
            matching_file_found: Boolean(file),
            file,
        }, { urgent: true });
        if (file) void replaceFile(target.componentId, file);
    }, true);
    document.addEventListener('dragend', clearDragStates, true);
    window.addEventListener('blur', clearDragStates);

    window.SimpAIGradioMediaReplacement = {
        supports,
        replaceFile,
    };
})();
