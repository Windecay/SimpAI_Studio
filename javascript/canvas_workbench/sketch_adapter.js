(function () {
    'use strict';

    const SOURCE_CLASS = 'simpai-custom-sketch-source';

    function call(source, name, fallback, ...args) {
        return typeof source?.[name] === 'function' ? source[name](...args) : fallback;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function createSketchAdapter(source) {
        const scope = source?.sketchAdapterSource || source || {};
        const domSource = scope.domSource || {};
        const identitySource = scope.identitySource || {};
        const runtimeSource = scope.runtimeSource || {};
        const timingSource = scope.timingSource || {};
        const windowSource = scope.windowSource || {};
        const getDocument = () => call(domSource, 'getDocument', null);
        const getTheme = (...args) => call(domSource, 'getTheme', 'dark', ...args);
        const getViewportSize = (...args) => call(domSource, 'getViewportSize', { width: 880, height: 760 }, ...args);
        const getSketch = (...args) => call(windowSource, 'getSketch', null, ...args);
        const loadLazyAssetGroup = (...args) => call(runtimeSource, 'loadLazyAssetGroup', null, ...args);
        const performanceNow = (...args) => call(timingSource, 'performanceNow', 0, ...args);
        const schedule = (...args) => call(timingSource, 'setTimeout', null, ...args);
        let fallbackUid = 0;
        const uid = (...args) => {
            const provided = call(identitySource, 'uid', null, ...args);
            if (provided) return String(provided);
            fallbackUid += 1;
            return `${String(args[0] || 'sai-workbench-sketch')}-${fallbackUid}`;
        };

        function waitForSketch(root, timeoutMs) {
            const started = performanceNow();
            return new Promise((resolve, reject) => {
                const tick = () => {
                    const api = getSketch(root) || root?.__simpaiSketch;
                    if (api) {
                        resolve(api);
                        return;
                    }
                    if (performanceNow() - started > (timeoutMs || 2600)) {
                        reject(new Error('Sketch editor did not initialize.'));
                        return;
                    }
                    const timer = schedule(tick, 80);
                    if (timer === null || timer === undefined) {
                        reject(new Error('Sketch editor timer is unavailable.'));
                    }
                };
                tick();
            });
        }

        function viewportSketchSize() {
            const viewport = getViewportSize() || {};
            const viewportWidth = Number(viewport.width);
            const viewportHeight = Number(viewport.height);
            const width = Math.max(720, Math.min(1420, Math.floor((Number.isFinite(viewportWidth) ? viewportWidth : 880) * 0.82)));
            const height = Math.max(560, Math.min(900, Math.floor((Number.isFinite(viewportHeight) ? viewportHeight : 760) * 0.72)));
            return { width, height };
        }

        async function open(options) {
            const opts = options || {};
            const image = opts.image || opts.asset?.data_url || opts.asset?.preview_url || opts.asset?.thumb || '';
            if (!image) {
                throw new Error('No image available for Sketch.');
            }
            const doc = getDocument();
            if (!doc?.createElement || !doc.body) {
                throw new Error('Sketch document is unavailable.');
            }
            const mask = opts.mask || '';
            const title = opts.title || 'Sketch';
            const sketchSize = viewportSketchSize();
            const modal = doc.createElement('div');
            modal.className = 'sai-canvas-modal sai-sketch-adapter-modal';
            const theme = getTheme(modal) || 'dark';
            modal.classList.toggle('theme-dark', theme === 'dark');
            modal.classList.toggle('theme-light', theme !== 'dark');
            modal.innerHTML = `
<div class="sai-canvas-modal-panel sai-sketch-adapter-panel">
  <div class="sai-canvas-modal-head">
    <span>${escapeHtml(title)}</span>
    <button type="button" data-sketch-close title="Close"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="sai-sketch-adapter-body">
    <div class="${SOURCE_CLASS} sai-workbench-sketch-source simpai-sketch-width-${sketchSize.width} simpai-sketch-height-${sketchSize.height}">
      <textarea id="${escapeHtml(uid('sai_workbench_sketch'))}" name="sai_workbench_sketch_payload" autocomplete="off"></textarea>
    </div>
  </div>
  <div class="sai-sketch-adapter-foot">
    <button type="button" data-sketch-action="apply"><i class="fa-solid fa-floppy-disk"></i><span>Apply</span></button>
    <button type="button" data-sketch-action="save-new"><i class="fa-solid fa-clone"></i><span>Save New</span></button>
    <button type="button" data-sketch-close><span>Cancel</span></button>
  </div>
</div>`;
            doc.body.appendChild(modal);
            const source = modal.querySelector(`.${SOURCE_CLASS}`);
            const textarea = modal.querySelector('textarea');
            const initialPayload = JSON.stringify({ image, mask });
            textarea.value = initialPayload;
            if (!getSketch(source)) {
                await loadLazyAssetGroup('customSketch');
            }

            let closed = false;
            const close = () => {
                closed = true;
                modal.remove();
            };
            modal.addEventListener('click', (evt) => {
                if (evt.target === modal || evt.target.closest('[data-sketch-close]')) close();
            });

            const api = await waitForSketch(source);
            if (closed) return null;
            await api.setValue({ image, mask }, { change: false });

            modal.querySelectorAll('[data-sketch-action]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const action = button.getAttribute('data-sketch-action');
                    button.disabled = true;
                    try {
                        await api.flush?.({ force: true });
                        const value = api.getValue?.();
                        if (!value?.image) throw new Error('Sketch has no image.');
                        const imageData = String(value.image || '').startsWith('data:')
                            ? value.image
                            : api.imageCanvas?.toDataURL?.('image/png');
                        if (!imageData) throw new Error('Sketch image could not be serialized.');
                        const payload = {
                            image: imageData,
                            mask: value.mask || '',
                            width: value.width || null,
                            height: value.height || null,
                            mode: action === 'apply' ? 'apply' : 'new',
                            metadata: {
                                source: 'workbench_sketch',
                                title
                            }
                        };
                        if (typeof opts.onSave === 'function') {
                            await opts.onSave(payload);
                        }
                        close();
                    } catch (err) {
                        console.warn('[SimpAI Canvas] Sketch save failed', err);
                        if (typeof opts.onError === 'function') opts.onError(err);
                        button.disabled = false;
                    }
                });
            });

            return { modal, api, close };
        }

        return { open };
    }

    const defaultAdapter = createSketchAdapter({
        domSource: {
            getDocument: () => typeof document !== 'undefined' ? document : null,
            getTheme: () => {
                const doc = typeof document !== 'undefined' ? document : null;
                return doc?.querySelector?.('.sai-canvas-workbench')?.dataset?.canvasTheme || 'dark';
            },
            getViewportSize: () => ({
                width: typeof window !== 'undefined' ? window.innerWidth : 880,
                height: typeof window !== 'undefined' ? window.innerHeight : 760
            })
        },
        identitySource: {
            uid: (...args) => typeof window !== 'undefined'
                ? window.SimpAICanvasWorkbenchUtils?.uid?.(...args)
                : undefined
        },
        runtimeSource: {
            loadLazyAssetGroup: () => typeof window !== 'undefined' && typeof window.loadSimpleAILazyAssetGroup === 'function'
                ? window.loadSimpleAILazyAssetGroup('customSketch')
                : null
        },
        timingSource: {
            performanceNow: () => typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : 0,
            setTimeout: (...args) => typeof window !== 'undefined' && typeof window.setTimeout === 'function'
                ? window.setTimeout(...args)
                : undefined
        },
        windowSource: {
            getSketch: root => typeof window !== 'undefined' ? window.SimpAISketch?.get?.(root) : null
        }
    });
    window.SimpAIWorkbenchSketchAdapter = Object.assign(
        {},
        window.SimpAIWorkbenchSketchAdapter || {},
        {
            createSketchAdapter,
            open: (...args) => defaultAdapter.open(...args)
        }
    );
})();
