(function () {
    'use strict';

    const SOURCE_CLASS = 'simpai-custom-sketch-source';

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function waitForSketch(root, timeoutMs) {
        const started = performance.now();
        return new Promise((resolve, reject) => {
            const tick = () => {
                const api = window.SimpAISketch?.get?.(root) || root.__simpaiSketch;
                if (api) {
                    resolve(api);
                    return;
                }
                if (performance.now() - started > (timeoutMs || 2600)) {
                    reject(new Error('Sketch editor did not initialize.'));
                    return;
                }
                window.setTimeout(tick, 80);
            };
            tick();
        });
    }

    function viewportSketchSize() {
        const width = Math.max(720, Math.min(1420, Math.floor(window.innerWidth * 0.82)));
        const height = Math.max(560, Math.min(900, Math.floor(window.innerHeight * 0.72)));
        return { width, height };
    }

    async function open(options) {
        const opts = options || {};
        const image = opts.image || opts.asset?.data_url || opts.asset?.preview_url || opts.asset?.thumb || '';
        if (!image) {
            throw new Error('No image available for Sketch.');
        }
        const mask = opts.mask || '';
        const title = opts.title || 'Sketch';
        const sketchSize = viewportSketchSize();
        const modal = document.createElement('div');
        modal.className = 'sai-canvas-modal sai-sketch-adapter-modal';
        const theme = document.querySelector('.sai-canvas-workbench')?.dataset?.canvasTheme || 'dark';
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
      <textarea id="sai_workbench_sketch_${Date.now()}" name="sai_workbench_sketch_payload" autocomplete="off"></textarea>
    </div>
  </div>
  <div class="sai-sketch-adapter-foot">
    <button type="button" data-sketch-action="apply"><i class="fa-solid fa-floppy-disk"></i><span>Apply</span></button>
    <button type="button" data-sketch-action="save-new"><i class="fa-solid fa-clone"></i><span>Save New</span></button>
    <button type="button" data-sketch-close><span>Cancel</span></button>
  </div>
</div>`;
        document.body.appendChild(modal);
        const source = modal.querySelector(`.${SOURCE_CLASS}`);
        const textarea = modal.querySelector('textarea');
        const initialPayload = JSON.stringify({ image, mask });
        textarea.value = initialPayload;
        if (!window.SimpAISketch?.get && typeof window.loadSimpleAILazyAssetGroup === 'function') {
            await window.loadSimpleAILazyAssetGroup('customSketch');
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

    window.SimpAIWorkbenchSketchAdapter = {
        open
    };
})();
