/*
 * Native Forge layout tools. Uses Studio's regional editor and the MOSS layout schema.
 * Qwen color names and annotation wording follow eduardoabreu81/sd-regional-boxes-neo.
 * No third-party extension installation is required.
 */
(function (root) {
    'use strict';
    const palette = [
        ['red', '#ff0000'], ['blue', '#0050ff'], ['green', '#00b400'], ['yellow', '#ffd400'],
        ['magenta', '#ff00ff'], ['orange', '#ff8000'], ['cyan', '#00d0ff'], ['purple', '#8000ff'],
    ];
    const drafts = new Map();
    const references = new Map();
    const storageKey = 'forge-neo-layout-v1';
    let translations = {};
    function stage() {
        return { __lang: (typeof document === 'undefined' ? null : document.querySelector('.forge-neo-hidden-runtime')?.dataset.lang)
            || root.simpleaiTopbarSystemParams?.__lang || 'cn' };
    }
    function t(key) { return stage().__lang === 'en' ? key : translations[key] || key; }
    function field(id) { return document.querySelector(`#${id} textarea, #${id} input[type="number"]`); }
    function setValue(input, value) {
        if (!input) throw new Error(t('The destination is unavailable.'));
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
        if (setter) setter.call(input, String(value));
        else input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function targetIds(target) {
        const prefix = target === 'img2img' ? 'forge_neo_img2img' : 'forge_neo';
        return { prompt: prefix + '_prompt', width: prefix + '_width', height: prefix + '_height' };
    }
    function currentSize(target) {
        const ids = targetIds(target);
        return { width: Number(field(ids.width)?.value) || 1024, height: Number(field(ids.height)?.value) || 1024 };
    }
    function splitNetworks(prompt) {
        const tags = String(prompt || '').match(/<(?:lora|lyco|hypernet):[^<>]+>/gi) || [];
        return { text: String(prompt || '').replace(/<(?:lora|lyco|hypernet):[^<>]+>/gi, '').trim(), tags };
    }
    function qwenLayout(draft, imageRect = null) {
        root.SimpAIRegionalJsonPrompt.validateDraft(draft, false);
        if (draft.items.length > palette.length) throw new Error(t('Qwen layouts support one to eight regions.'));
        const descriptions = draft.items.map((item, index) => {
            const text = item.label === 'text' ? ` ${JSON.stringify(item.text)}` : '';
            return `Inside the ${palette[index][0]} box: ${item.caption.trim().replace(/[.\s]+$/, '')}${text}.`;
        });
        const names = draft.items.map((_, index) => palette[index][0]);
        const joined = names.length < 2 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
        const rect = imageRect || { x: 0, y: 0, width: draft.width, height: draft.height };
        const boxes = draft.items.map((item, index) => {
            const bbox = item.bbox.map((value, axis) =>
                (value - (axis % 2 ? rect.y : rect.x)) / (axis % 2 ? rect.height : rect.width));
            if (bbox.some(value => value < -1e-9 || value > 1 + 1e-9))
                throw new Error(t('Draw Qwen regions inside the input image.'));
            return { color: palette[index][0], bbox: bbox.map(value => Math.max(0, Math.min(1, value))) };
        });
        return {
            prompt: [draft.summary.caption.trim(), ...descriptions,
                `Remove the ${joined} box ${names.length === 1 ? 'outline' : 'outlines'} from the image. Keep everything else exactly as it is.`].filter(Boolean).join(' '),
            boxes,
        };
    }
    function persist() {
        try { sessionStorage.setItem(storageKey, JSON.stringify([...drafts])); } catch (_) {}
    }
    function readSource() {
        const host = document.querySelector('#forge_neo_img2img_input_image [data-forge-neo-canvas-uuid]');
        const uuid = host?.dataset.forgeNeoCanvasUuid;
        return uuid ? document.querySelector(`[id="${uuid}"].logical_image_background textarea`)?.value || '' : '';
    }
    async function sourceImage() {
        const data = readSource();
        if (!data.startsWith('data:image/')) return null;
        const image = new Image();
        image.src = data;
        await image.decode();
        return { data, width: image.naturalWidth, height: image.naturalHeight };
    }
    function activePreset() {
        const host = document.getElementById('forge_neo_preset');
        return host?.querySelector('input')?.value || host?.textContent?.trim() || '';
    }
    function notify(message) {
        const node = document.querySelector('[data-forge-layout-status]');
        if (node) node.textContent = message;
    }
    async function open(target = 'txt2img') {
        const editor = root.SimpAIRegionalJsonPrompt;
        if (!editor) return;
        const ids = targetIds(target), promptInput = field(ids.prompt);
        const prompt = splitNetworks(promptInput?.value);
        const previous = drafts.get(target);
        const size = currentSize(target);
        const width = Math.max(64, Math.round(size.width / 16) * 16);
        const height = Math.max(64, Math.round(size.height / 16) * 16);
        const source = target === 'img2img' ? await sourceImage() : null;
        const reference = source ? references.get(target)?.source === source.data ? references.get(target) : null
            : references.get(target);
        let model = previous?.model || (/qwen21/i.test(activePreset()) ? 'qwen21' : 'moss');
        const originalSource = source?.data || '';
        editor.open({
            value: prompt.text, width, height, langState: stage(), translate: t,
            snapshot: previous?.snapshot, outputModel: model, agentEnabled: false,
            outputModels: [{ value: 'moss', label: 'MOSS JSON' }, { value: 'qwen21', label: 'Qwen2.1 color boxes' }],
            applyTargets: [{ value: 'txt2img', label: 'txt2img' }, { value: 'img2img', label: 'img2img' }],
            applyTarget: target,
            reference: reference || (source ? { source: source.data, name: t('Input image'), width: source.width,
                height: source.height, fit: 'stretch' } : undefined),
            currentSize: () => currentSize(target),
            compilePrompt: (draft, outputModel) => outputModel === 'qwen21'
                ? qwenLayout(draft).prompt : editor.compile(draft, { allowIncomplete: true }),
            regionColor: (_item, index, outputModel) => outputModel === 'qwen21' ? palette[index % palette.length][1] : null,
            onOutputModelChange(value) {
                model = value;
                const saved = drafts.get(target);
                if (saved) { saved.model = model; persist(); }
            },
            onReferenceChange(value) { if (value) references.set(target, value); else references.delete(target); },
            onDraftChange(snapshot) {
                // Keep the editable source after Apply, as well as unfinished edits after closing.
                if (snapshot) { drafts.set(target, { model, snapshot }); persist(); }
            },
            async onApply(result) {
                const destination = result.target || target;
                const output = targetIds(destination);
                if ([result.width, result.height].some(value => value < 64 || value > 2048 || value % 16))
                    throw new Error(t('Forge layout dimensions must be multiples of 16 between 64 and 2048.'));
                const networkTags = [...new Set([...prompt.tags, ...splitNetworks(field(output.prompt)?.value).tags])];
                const finalPrompt = [result.prompt, ...networkTags].filter(Boolean).join(' ');
                let payload = '';
                if (result.outputModel === 'moss' && !/^moss$/i.test(activePreset()))
                    throw new Error(t('MOSS JSON requires the MOSS preset.'));
                if (result.outputModel === 'qwen21') {
                    if (target !== 'img2img' || destination !== 'img2img' || !/^qwen21$/i.test(activePreset()))
                        throw new Error(t('Qwen color boxes require the Qwen Image 2.1 preset and img2img.'));
                    const current = await sourceImage();
                    if (!current) throw new Error(t('Add an img2img input image before using Qwen color boxes.'));
                    if (originalSource && current.data !== originalSource)
                        throw new Error(t('The input image changed. Reopen the layout editor.'));
                    if (references.get(target)?.source !== current.data)
                        throw new Error(t('Use the img2img input as the Qwen layout reference.'));
                    const rect = editor.referencePlacement(result.width, result.height, current.width, current.height,
                        result.referenceLayout.referenceFit);
                    payload = JSON.stringify({ format: 'qwen21-marks', prompt: finalPrompt,
                        boxes: qwenLayout(result.draft, rect).boxes, source_size: [current.width, current.height],
                        output_size: [result.width, result.height] });
                }
                // Check all destinations before changing the prompt or dimensions.
                const targets = [field(output.prompt), field(output.width), field(output.height)];
                if (targets.some(value => !value)) throw new Error(t('The destination is unavailable.'));
                if (destination === 'img2img') {
                    setValue(field('forge_neo_layout_marks'), payload);
                    document.getElementById('forge_neo_img2img_resize_to-button')?.click();
                    document.getElementById('forge_neo_img2img_mode_img2img-button')?.click();
                }
                setValue(targets[0], finalPrompt);
                setValue(targets[1], result.width);
                setValue(targets[2], result.height);
                const saved = drafts.get(target);
                if (saved) { drafts.set(destination, structuredClone(saved)); persist(); }
                notify(t('Layout applied.'));
                const tabId = destination === 'img2img' ? 'forge_neo_img2img_tab-button' : 'forge_neo_txt2img_tab-button';
                document.getElementById(tabId)?.click();
                return true;
            },
        });
    }
    function init() {
        const config = document.querySelector('[data-forge-layout-translations]');
        if (config) {
            try { translations = JSON.parse(config.dataset.forgeLayoutTranslations); } catch (_) {}
        }
        for (const target of ['txt2img', 'img2img']) {
            const button = document.getElementById(target === 'img2img' ? 'forge_neo_img2img_layout' : 'forge_neo_layout');
            if (!button || button.dataset.layoutReady) continue;
            button.dataset.layoutReady = '1';
            button.title = t('Regional layout');
            button.setAttribute('aria-label', button.title);
        }
        const clear = document.getElementById('forge_neo_layout_clear');
        if (clear && !clear.dataset.layoutReady) {
            clear.dataset.layoutReady = '1';
            clear.title = t('Clear color boxes');
            clear.setAttribute('aria-label', clear.title);
        }
    }
    const api = { open, qwenLayout, splitNetworks, targetIds, init };
    root.ForgeNeoLayout = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document === 'undefined') return;
    try { for (const [key, value] of JSON.parse(sessionStorage.getItem(storageKey) || '[]')) drafts.set(key, value); } catch (_) {}
    // Gradio mounts inactive tabs lazily; delegation also covers their first click.
    document.addEventListener('click', event => {
        const button = event.target.closest('#forge_neo_layout, #forge_neo_img2img_layout, #forge_neo_layout_clear');
        if (!button) return;
        init();
        if (button.id === 'forge_neo_layout_clear') {
            setValue(field('forge_neo_layout_marks'), '');
            notify(t('Color boxes cleared.'));
        } else void open(button.id === 'forge_neo_img2img_layout' ? 'img2img' : 'txt2img')
            .catch(error => notify(t(error.message)));
    });
    document.addEventListener('input', event => {
        const host = document.querySelector('#forge_neo_img2img_input_image [data-forge-neo-canvas-uuid]');
        const source = event.target.closest('.logical_image_background');
        if (!source || !host || source.id !== host.dataset.forgeNeoCanvasUuid) return;
        const marks = field('forge_neo_layout_marks');
        if (marks?.value) {
            setValue(marks, '');
            notify(t('The input image changed. Color boxes cleared.'));
        }
    });
    document.addEventListener('DOMContentLoaded', init);
    document.addEventListener('gradio:loaded', init);
    root.onUiLoaded?.(init);
    root.onAfterUiUpdate?.(init);
    root.setInterval(init, 1200);
    if (document.readyState !== 'loading') init();
})(typeof window !== 'undefined' ? window : globalThis);
