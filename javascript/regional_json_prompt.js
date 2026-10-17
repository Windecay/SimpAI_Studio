(function (root) {
    'use strict';
    if (root.SimpAIRegionalJsonPrompt) return;
    const clone = value => JSON.parse(JSON.stringify(value));
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
    const roles = ['object', 'character', 'text'];
    const regionColors = ['#ff8a00', '#5b9bd5', '#c96b91', '#c7a340', '#8c80c2', '#638d94'];
    function regionColor(item, index = 0) {
        const color = (item?.palette || []).find(value => /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(value));
        if (color?.length === 4) return '#' + [...color.slice(1)].map(ch => ch + ch).join('');
        return color || regionColors[Math.max(0, index) % regionColors.length];
    }
    function wrapPreviewText(value, width, measure) {
        const lines = [];
        for (const paragraph of String(value || '').split('\n')) {
            let line = '';
            for (const token of paragraph.match(/\S+\s*|\s+/gu) || []) {
                if (measure(line + token) <= width) { line += token; continue; }
                if (line.trim()) { lines.push(line.trimEnd()); line = ''; }
                if (measure(token.trimEnd()) <= width) line = token.trimStart();
                else for (const char of token) {
                    if (line && measure(line + char) > width) { lines.push(line); line = ''; }
                    line += char;
                }
            }
            lines.push(line.trimEnd());
        }
        return lines;
    }
    function fitPreviewText(value, width, height, measure, reservedCorner = null) {
        const layout = fontSize => {
            const lines = wrapPreviewText(value, width, text => measure(text, fontSize));
            const lineHeight = fontSize * 1.35;
            const widths = lines.map(line => measure(line, fontSize));
            return { fontSize, lineHeight, lines, fits: lines.length * lineHeight <= height
                && widths.every(value => value <= width)
                && (!reservedCorner || lines.every((line, index) => !line
                    || (width - widths[index]) / 2 >= reservedCorner.width
                    || (height - lines.length * lineHeight) / 2 + index * lineHeight >= reservedCorner.height)) };
        };
        let result = layout(14);
        if (!result.fits) {
            let low = 8, high = 14;
            result = layout(low);
            if (result.fits) {
                for (let index = 0; index < 7; index++) {
                    const candidate = layout((low + high) / 2);
                    if (candidate.fits) low = candidate.fontSize;
                    else high = candidate.fontSize;
                }
                result = layout(Math.floor(low * 4) / 4);
            }
        }
        if (!result.fits && reservedCorner) {
            const belowHeight = height - reservedCorner.height;
            const besideWidth = width - reservedCorner.width;
            if (belowHeight >= 8 * 1.35) {
                return { ...fitPreviewText(value, width, belowHeight, measure),
                    offsetY: reservedCorner.height / 2 };
            }
            if (besideWidth > 0) {
                return { ...fitPreviewText(value, besideWidth, height, measure),
                    offsetX: reservedCorner.width / 2 };
            }
        }
        const visibleLines = Math.max(0, Math.floor(height / result.lineHeight));
        if (!result.fits && visibleLines && (result.lines.length > visibleLines
            || result.lines.some(line => measure(line, result.fontSize) > width))) {
            const suffix = measure('...', result.fontSize) <= width ? '...' : '';
            result.lines = result.lines.slice(0, visibleLines);
            let last = result.lines[result.lines.length - 1];
            while (last && measure(last + suffix, result.fontSize) > width) last = Array.from(last).slice(0, -1).join('');
            result.lines[result.lines.length - 1] = last + suffix;
        } else if (!visibleLines) result.lines = [];
        return result;
    }
    function requireValue(ok, code, field = '') {
        if (!ok) {
            const error = new Error(code);
            error.field = field;
            throw error;
        }
    }
    function fields(value, allowed, required, location) {
        requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Expected an object', location);
        requireValue(Object.keys(value).every(key => allowed.includes(key)), 'Unknown JSON field', location);
        requireValue(required.every(key => Object.hasOwn(value, key)), 'Missing JSON field', location);
    }
    function nonempty(value, field, editing = false) {
        requireValue(typeof value === 'string' && (editing || value.trim()), 'Enter a description or literal text', field);
    }
    function strings(value, field) {
        requireValue(Array.isArray(value), 'Expected a text array', field);
        value.forEach(item => nonempty(item, field));
    }
    function dimensions(width, height) {
        for (const [name, value] of Object.entries({ width, height })) {
            requireValue(Number.isInteger(value) && value > 0 && value <= 16384 && value % 16 === 0,
                'Dimensions must be multiples of 16 between 16 and 16384', name);
        }
    }
    function validateDraft(draft, allowEmpty = false, editing = false) {
        const required = ['width', 'height', 'summary', 'items', 'bbox_coord_space', 'bbox_format'];
        fields(draft, required, required, 'Layout');
        dimensions(draft.width, draft.height);
        requireValue(draft.bbox_coord_space === 'abs' && draft.bbox_format === 'xyxy',
            'Editable layouts use abs and xyxy', 'Layout');
        fields(draft.summary, ['caption', 'meta', 'canvas', 'palette'], ['caption'], 'summary');
        nonempty(draft.summary.caption, 'summary.caption', editing || (Array.isArray(draft.items) && draft.items.length > 0));
        if (Object.hasOwn(draft.summary, 'canvas')) requireValue(
            ['single', 'multi_panel', 'collage'].includes(draft.summary.canvas), 'Invalid canvas type', 'summary.canvas');
        for (const key of ['meta', 'palette']) {
            if (Object.hasOwn(draft.summary, key)) strings(draft.summary[key], `summary.${key}`);
        }
        requireValue(Array.isArray(draft.items) && (allowEmpty || draft.items.length), 'Add a region', 'items');
        requireValue(draft.items.length <= 200, 'Too many regions', 'items');
        draft.items.forEach((item, index) => {
            const location = `items[${index}]`;
            fields(item, ['label', 'caption', 'bbox', 'text', 'tags', 'palette'], ['label', 'caption', 'bbox'], location);
            requireValue(roles.includes(item.label), 'Invalid region type', location);
            nonempty(item.caption, `${location}.caption`, editing);
            if (item.label === 'text' || Object.hasOwn(item, 'text')) nonempty(item.text, `${location}.text`, editing);
            for (const key of ['tags', 'palette']) {
                if (Object.hasOwn(item, key)) strings(item[key], `${location}.${key}`);
            }
            requireValue(Array.isArray(item.bbox) && item.bbox.length === 4
                && item.bbox.every(value => typeof value === 'number' && Number.isFinite(value)),
            'Expected four finite coordinates', `${location}.bbox`);
            const [x0, y0, x1, y1] = item.bbox;
            requireValue(0 <= x0 && x0 < x1 && x1 <= draft.width && 0 <= y0 && y0 < y1 && y1 <= draft.height,
                'Region is empty or outside the canvas', `${location}.bbox`);
        });
        return draft;
    }
    function compile(draft) {
        validateDraft(draft, true);
        if (!draft.items.length) return draft.summary.caption;
        // Match OpenMOSS compile_prompt.py and Comfy's MOSSImageLayoutPrompt.
        const edge = value => Number(value.toFixed(9));
        const items = draft.items.map(item => {
            const [x0, y0, x1, y1] = item.bbox;
            const bbox = [
                Math.floor(edge(y0)) - draft.height / 2, Math.floor(edge(x0)) - draft.width / 2,
                Math.ceil(edge(y1)) - draft.height / 2, Math.ceil(edge(x1)) - draft.width / 2
            ];
            requireValue(bbox[0] < bbox[2] && bbox[1] < bbox[3],
                'Region is empty or outside the canvas', 'bbox');
            return { ...clone(item), bbox };
        });
        return JSON.stringify({
            summary: clone(draft.summary), items, bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx'
        });
    }
    function parse(value, width, height, { editing = false } = {}) {
        dimensions(width, height);
        const input = typeof value === 'string' ? value.trim() : value;
        if (typeof input === 'string' && !input.startsWith('{')) return {
            width, height, summary: { caption: value }, items: [], bbox_coord_space: 'abs', bbox_format: 'xyxy'
        };
        const data = typeof input === 'string' ? JSON.parse(input) : clone(input);
        if (data.bbox_coord_space === 'abs') return clone(validateDraft(data, true, editing));
        if (Object.hasOwn(data, 'caption')) {
            fields(data, ['caption'], ['caption'], 'Caption');
            nonempty(data.caption, 'caption', editing);
            return parse(data.caption, width, height, { editing });
        }
        fields(data, ['summary', 'items', 'bbox_coord_space', 'bbox_format'],
            ['summary', 'items', 'bbox_coord_space', 'bbox_format'], 'Layout');
        requireValue(data.bbox_coord_space === 'abs_centralized' && data.bbox_format === 'yxyx',
            'Unsupported coordinate format', 'Layout');
        requireValue(Array.isArray(data.items), 'Add a region', 'items');
        const draft = {
            ...data, width, height, bbox_coord_space: 'abs', bbox_format: 'xyxy',
            items: data.items.map(item => {
                requireValue(Array.isArray(item.bbox) && item.bbox.length === 4 && item.bbox.every(Number.isInteger),
                    'Compiled coordinates must be integers', 'bbox');
                const [y0, x0, y1, x1] = item.bbox;
                return { ...item, bbox: [x0 + width / 2, y0 + height / 2, x1 + width / 2, y1 + height / 2] };
            })
        };
        return clone(validateDraft(draft, editing, editing));
    }
    function scaleDraft(draft, width, height) {
        dimensions(width, height);
        const next = clone(draft);
        next.items.forEach(item => {
            item.bbox = item.bbox.map((value, index) => value * (index % 2 ? height / draft.height : width / draft.width));
        });
        next.width = width;
        next.height = height;
        return next;
    }

    let active = null;
    function open(options = {}) {
        active?.close();
        const state = options.langState || root.simpleaiTopbarSystemParams || {};
        const t = key => state.__lang === 'en' ? key : (root.localization?.[key] || key);
        const label = role => t({ object: 'Object', character: 'Character', text: 'Text' }[role]);
        const icon = (action, glyph, title, extra = '') =>
            `<button type="button" data-rjp-action="${action}" title="${esc(t(title))}" aria-label="${esc(t(title))}" ${extra}><i class="fa-solid fa-${glyph}" aria-hidden="true"></i></button>`;
        let draft, initialError = null;
        try { draft = parse(options.value || '', options.width, options.height, { editing: true }); }
        catch (error) {
            initialError = error;
            draft = { width: options.width, height: options.height, summary: { caption: '' }, items: [],
                bbox_coord_space: 'abs', bbox_format: 'xyxy' };
        }
        let selected = draft.items.length ? 0 : -1;
        let mode = 'select', tab = initialError ? 'json' : 'layout', gesture = null, editingField = null;
        let rawDirty = !!initialError;
        const undo = [], redo = [];
        const previousFocus = document.activeElement;
        const host = document.createElement('div');
        host.className = 'sai-rjp-overlay';
        host.innerHTML = `<div class="sai-rjp-backdrop" data-rjp-action="close"></div>
          <section class="sai-rjp-dialog" role="dialog" aria-modal="true" aria-labelledby="sai-rjp-title">
            <header><h2 id="sai-rjp-title">${esc(t('Regional Prompt'))}</h2>
              <select aria-label="${esc(t('Model'))}" data-rjp-model><option>MOSS-Image</option></select>
              ${icon('close', 'xmark', 'Close')}</header>
            <div class="sai-rjp-toolbar">
              <div class="sai-rjp-tools" role="group" aria-label="${esc(t('Layout tools'))}">
                ${icon('select', 'arrow-pointer', 'Select and move')}
                ${icon('draw', 'vector-square', 'Draw a region')}
                ${icon('undo', 'rotate-left', 'Undo')}${icon('redo', 'rotate-right', 'Redo')}
              </div>
              <div class="sai-rjp-dimensions">
                <label>${esc(t('Width'))}<input data-rjp-field="width" type="number" min="16" max="16384" step="16"></label>
                <span aria-hidden="true">&times;</span>
                <label>${esc(t('Height'))}<input data-rjp-field="height" type="number" min="16" max="16384" step="16"></label>
                ${icon('scale', 'arrows-to-circle', 'Scale to current output size')}
              </div>
              <div class="sai-rjp-tabs" role="tablist">
                <button type="button" role="tab" data-rjp-tab="layout">${esc(t('Layout'))}</button>
                <button type="button" role="tab" data-rjp-tab="json">JSON</button>
              </div>
            </div>
            <div class="sai-rjp-layout">
              <div class="sai-rjp-main">
                <label>${esc(t('Whole image description (optional)'))}<textarea data-rjp-field="summary" rows="3"></textarea></label>
                <div class="sai-rjp-viewport"><div class="sai-rjp-board"><canvas tabindex="0" aria-label="${esc(t('Region canvas'))}"></canvas></div></div>
                <details><summary>${esc(t('Compiled prompt'))}</summary><textarea data-rjp-output readonly rows="3" aria-label="${esc(t('Compiled prompt'))}"></textarea></details>
              </div>
              <aside>
                <div class="sai-rjp-region-heading"><h3>${esc(t('Regions'))}</h3>
                  <select data-rjp-add-type aria-label="${esc(t('New region type'))}">${roles.map(role => `<option value="${role}">${esc(label(role))}</option>`).join('')}</select>
                  ${icon('add', 'plus', 'Add region')}</div>
                <div class="sai-rjp-regions" role="listbox" aria-label="${esc(t('Regions'))}"></div>
                <div class="sai-rjp-region-form">
                  <div class="sai-rjp-region-heading">
                    <select data-rjp-field="label" aria-label="${esc(t('Region type'))}">${roles.map(role => `<option value="${role}">${esc(label(role))}</option>`).join('')}</select>
                    ${icon('duplicate', 'clone', 'Duplicate region')}${icon('delete', 'trash-can', 'Delete region')}
                  </div>
                  <label>${esc(t('Region description'))}<textarea data-rjp-field="caption" rows="3"></textarea></label>
                  <label data-rjp-text-wrap>${esc(t('Literal text'))}<textarea data-rjp-field="text" rows="2"></textarea></label>
                  <div class="sai-rjp-coordinates">${['Left', 'Top', 'Right', 'Bottom'].map((name, index) =>
                      `<label>${esc(t(name))}<input type="number" min="0" step="any" data-rjp-coordinate="${index}"></label>`).join('')}</div>
                  <div><label for="sai-rjp-palette-values">${esc(t('Palette'))}</label>
                    <div class="sai-rjp-palette">
                      <input type="color" data-rjp-field="palette_color" data-rjp-palette-color aria-label="${esc(t('Palette color'))}">
                      <input id="sai-rjp-palette-values" data-rjp-field="palette" type="text">
                    </div>
                  </div>
                </div>
              </aside>
            </div>
            <div class="sai-rjp-json" hidden><textarea data-rjp-json spellcheck="false" aria-label="${esc(t('Editable layout JSON'))}"></textarea>
              <div class="sai-rjp-tools">
                <button type="button" data-rjp-action="load-json"><i class="fa-solid fa-file-import" aria-hidden="true"></i> ${esc(t('Load JSON'))}</button>
                ${icon('reset-json', 'rotate-left', 'Restore JSON from layout')}
              </div></div>
            <footer><div data-rjp-status role="status" aria-live="polite"></div>
              <div class="sai-rjp-footer-tools">
                ${icon('import', 'file-import', 'Import layout JSON')}${icon('export', 'download', 'Download editable JSON')}
                ${icon('copy', 'copy', 'Copy compiled prompt')}
                <button type="button" data-rjp-action="apply" class="sai-rjp-apply"><i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(t('Apply prompt'))}</button>
              </div>
            </footer><input type="file" accept=".json,application/json" data-rjp-file hidden>
          </section>`;
        const q = selector => host.querySelector(selector);
        const canvas = q('canvas'), viewport = q('.sai-rjp-viewport'), board = q('.sai-rjp-board');
        const raw = q('[data-rjp-json]');
        raw.value = initialError ? String(options.value || '') : JSON.stringify(draft, null, 2);
        function status(error = null) {
            const node = q('[data-rjp-status]');
            node.textContent = error ? `${t(error.message || String(error))}${error.field ? `: ${error.field}` : ''}` : '';
            node.classList.toggle('is-error', !!error);
        }
        function remember(snapshot = draft) {
            undo.push(clone(snapshot));
            if (undo.length > 60) undo.shift();
            redo.length = 0;
            editingField = null;
        }
        function updateOutput() {
            try { q('[data-rjp-output]').value = compile(draft); status(); }
            catch (error) {
                q('[data-rjp-output]').value = '';
                status(['Enter a description or literal text', 'Add a region'].includes(error.message) ? null : error);
            }
            q('[data-rjp-action="undo"]').disabled = !undo.length;
            q('[data-rjp-action="redo"]').disabled = !redo.length;
        }
        function draw() {
            const width = Math.max(1, Math.min(viewport.clientWidth - 24,
                (viewport.clientHeight - 24) * draft.width / draft.height));
            const height = width * draft.height / draft.width;
            board.style.width = `${width}px`;
            board.style.height = `${height}px`;
            const dpr = root.devicePixelRatio || 1;
            canvas.width = Math.max(1, Math.round(width * dpr));
            canvas.height = Math.max(1, Math.round(height * dpr));
            const ctx = canvas.getContext('2d');
            ctx.scale(canvas.width / draft.width, canvas.height / draft.height);
            const unit = draft.width / width;
            ctx.fillStyle = '#f6f7f8';
            ctx.fillRect(0, 0, draft.width, draft.height);
            ctx.lineWidth = unit;
            ctx.strokeStyle = '#e0e4e8';
            for (let n = 1; n < 8; n++) {
                ctx.beginPath(); ctx.moveTo(draft.width * n / 8, 0); ctx.lineTo(draft.width * n / 8, draft.height); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, draft.height * n / 8); ctx.lineTo(draft.width, draft.height * n / 8); ctx.stroke();
            }
            draft.items.forEach((item, index) => {
                const [x0, y0, x1, y1] = item.bbox;
                const color = regionColor(item, index);
                ctx.fillStyle = `${color}20`; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
                ctx.strokeStyle = color; ctx.lineWidth = (index === selected ? 2.5 : 1.5) * unit;
                ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
                const boxWidth = (x1 - x0) / unit, boxHeight = (y1 - y0) / unit;
                const badgeWidth = Math.min(25, boxWidth / 2);
                const badgeHeight = Math.min(22, boxHeight / 3);
                const badgeFont = Math.min(12, badgeHeight * 0.7, badgeWidth / String(index + 1).length);
                ctx.fillStyle = color; ctx.fillRect(x0, y0, badgeWidth * unit, badgeHeight * unit);
                ctx.fillStyle = '#ffffff'; ctx.font = `600 ${badgeFont * unit}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
                ctx.fillText(String(index + 1), x0 + badgeWidth * unit / 2,
                    y0 + (badgeHeight + badgeFont * 0.7) * unit / 2);
                const paddingPixels = Math.min(8, boxWidth / 16, boxHeight / 16);
                const badgeGap = Math.min(4, paddingPixels);
                const padding = paddingPixels * unit;
                const contentWidth = Math.max(0, x1 - x0 - padding * 2);
                const contentHeight = Math.max(0, y1 - y0 - padding * 2);
                if (contentWidth > 0 && contentHeight > 0) {
                    ctx.save();
                    ctx.beginPath(); ctx.rect(x0 + padding, y0 + padding, contentWidth, contentHeight); ctx.clip();
                    const textLayout = fitPreviewText(
                        item.label === 'text' ? item.text || item.caption : item.caption,
                        contentWidth / unit, contentHeight / unit, (text, fontSize) => {
                            ctx.font = `${fontSize * unit}px sans-serif`;
                            return ctx.measureText(text).width / unit;
                        }, { width: badgeWidth + badgeGap - paddingPixels, height: badgeHeight + badgeGap - paddingPixels });
                    ctx.font = `${textLayout.fontSize * unit}px sans-serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillStyle = item.label === 'text' ? color : '#30343a';
                    const lineHeight = textLayout.lineHeight * unit;
                    const centerX = (x0 + x1) / 2 + (textLayout.offsetX || 0) * unit;
                    const firstLineY = (y0 + y1) / 2 + (textLayout.offsetY || 0) * unit
                        - (textLayout.lines.length - 1) * lineHeight / 2;
                    textLayout.lines.forEach((line, lineIndex) => {
                        ctx.fillText(line, centerX, firstLineY + lineIndex * lineHeight);
                    });
                    ctx.restore();
                }
                if (index === selected) {
                    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
                        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 4 * unit, y - 4 * unit, 8 * unit, 8 * unit);
                        ctx.strokeRect(x - 4 * unit, y - 4 * unit, 8 * unit, 8 * unit);
                    }
                }
            });
        }
        function renderRegionList() {
            q('.sai-rjp-regions').innerHTML = draft.items.map((item, index) =>
                `<button type="button" role="option" aria-selected="${index === selected}" data-rjp-region="${index}" style="--region-color:${regionColor(item, index)}"><span>${index + 1}</span><span>${esc(label(item.label))}<small>${esc(item.text || item.caption)}</small></span></button>`
            ).join('');
        }
        function render() {
            q('.sai-rjp-layout').hidden = tab !== 'layout';
            q('.sai-rjp-json').hidden = tab !== 'json';
            host.querySelectorAll('[data-rjp-tab]').forEach(node => node.setAttribute('aria-selected', String(node.dataset.rjpTab === tab)));
            for (const name of ['select', 'draw']) q(`[data-rjp-action="${name}"]`).setAttribute('aria-pressed', String(mode === name));
            canvas.style.cursor = mode === 'draw' ? 'crosshair' : 'default';
            for (const key of ['width', 'height']) q(`[data-rjp-field="${key}"]`).value = draft[key];
            q('[data-rjp-field="summary"]').value = draft.summary.caption;
            renderRegionList();
            q('.sai-rjp-region-form').hidden = !draft.items[selected];
            const item = draft.items[selected];
            if (item) {
                for (const key of ['label', 'caption', 'text']) q(`[data-rjp-field="${key}"]`).value = item[key] || '';
                q('[data-rjp-field="palette"]').value = (item.palette || []).join(', ');
                q('[data-rjp-palette-color]').value = regionColor(item, selected);
                q('[data-rjp-text-wrap]').hidden = item.label !== 'text';
                host.querySelectorAll('[data-rjp-coordinate]').forEach(node => { node.value = item.bbox[Number(node.dataset.rjpCoordinate)]; });
            }
            updateOutput();
            if (tab === 'layout') draw();
        }
        function close() {
            observer?.disconnect();
            host.remove();
            if (active?.host === host) active = null;
            if (previousFocus?.isConnected) previousFocus.focus();
        }
        function loadRaw() {
            const next = parse(raw.value, draft.width, draft.height, { editing: true });
            if (JSON.stringify(next) !== JSON.stringify(draft)) remember();
            draft = next;
            selected = draft.items.length ? 0 : -1;
            initialError = null;
            rawDirty = false;
            return true;
        }
        function setTab(next) {
            let loadError = null;
            if (tab === 'json' && next !== tab && rawDirty) {
                try { loadRaw(); } catch (error) { loadError = error; }
            }
            if (next === 'json' && tab !== 'json' && !rawDirty) raw.value = JSON.stringify(draft, null, 2);
            tab = next;
            render();
            if (loadError) {
                status({ message: 'JSON could not be loaded. Your JSON edits are preserved; the previous layout is shown.',
                    field: loadError.field || loadError.message });
            }
        }
        function addRegion() {
            requireValue(draft.items.length < 200, 'Too many regions');
            remember();
            const label = q('[data-rjp-add-type]').value;
            draft.items.push({ label, caption: '', ...(label === 'text' ? { text: '' } : {}),
                bbox: [draft.width / 4, draft.height / 4, draft.width * 3 / 4, draft.height * 3 / 4] });
            selected = draft.items.length - 1;
            render();
            q('[data-rjp-field="caption"]').focus();
        }
        let applying = false;
        async function action(name) {
            try {
                if (name === 'apply' && applying) return;
                if (name === 'close') return close();
                if (name === 'select' || name === 'draw') { mode = name; render(); }
                if (name === 'add') addRegion();
                if (name === 'undo' && undo.length) { redo.push(clone(draft)); draft = undo.pop(); selected = Math.min(selected, draft.items.length - 1); render(); }
                if (name === 'redo' && redo.length) { undo.push(clone(draft)); draft = redo.pop(); selected = Math.min(selected, draft.items.length - 1); render(); }
                if ((name === 'delete' || name === 'duplicate') && draft.items[selected]) {
                    remember();
                    if (name === 'delete') { draft.items.splice(selected, 1); selected = Math.min(selected, draft.items.length - 1); }
                    else {
                        requireValue(draft.items.length < 200, 'Too many regions');
                        draft.items.splice(selected + 1, 0, clone(draft.items[selected])); selected++;
                    }
                    render();
                }
                if (name === 'load-json') { loadRaw(); render(); }
                if (name === 'reset-json') { raw.value = JSON.stringify(draft, null, 2); rawDirty = false; status(); }
                if (name === 'scale') {
                    if (rawDirty) loadRaw();
                    const size = options.currentSize?.() || { width: options.width, height: options.height };
                    const next = scaleDraft(draft, size.width, size.height);
                    remember(); draft = next;
                    raw.value = JSON.stringify(draft, null, 2); render();
                }
                if (name === 'import') q('[data-rjp-file]').click();
                if (name === 'export') {
                    if (rawDirty) loadRaw();
                    validateDraft(draft, true, true);
                    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
                    const link = document.createElement('a');
                    link.href = url; link.download = 'moss-layout.json'; link.click();
                    root.setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
                if (name === 'copy' || name === 'apply') {
                    if (rawDirty) loadRaw();
                    const prompt = compile(draft);
                    if (name === 'copy') await navigator.clipboard.writeText(prompt);
                    else {
                        const button = q('[data-rjp-action="apply"]');
                        applying = true;
                        button.disabled = true;
                        try {
                            if (await options.onApply?.({ prompt, draft: clone(draft), width: draft.width, height: draft.height }) !== false) close();
                        } finally {
                            applying = false;
                            button.disabled = false;
                        }
                    }
                }
            } catch (error) { status(error); }
        }
        host.addEventListener('click', event => {
            const button = event.target.closest('button,[data-rjp-action="close"]');
            if (!button) return;
            if (button.dataset.rjpAction) void action(button.dataset.rjpAction);
            if (button.dataset.rjpTab) {
                try { setTab(button.dataset.rjpTab); } catch (error) { status(error); }
            }
            if (button.dataset.rjpRegion !== undefined) { selected = Number(button.dataset.rjpRegion); render(); }
        });
        function updateField(event) {
            if (event.target === raw) { rawDirty = true; return; }
            const field = event.target.dataset.rjpField;
            const coordinate = event.target.dataset.rjpCoordinate;
            if (!field && coordinate === undefined) return;
            if (editingField !== event.target) { remember(); editingField = event.target; }
            if (field === 'width' || field === 'height') {
                const value = Number(event.target.value);
                try { dimensions(field === 'width' ? value : draft.width, field === 'height' ? value : draft.height); draft[field] = value; }
                catch (error) {
                    if (event.type === 'change') render();
                    status(error); return;
                }
            } else if (field === 'summary') draft.summary.caption = event.target.value;
            else if (draft.items[selected]) {
                const item = draft.items[selected];
                if (coordinate !== undefined) item.bbox[Number(coordinate)] = Number(event.target.value);
                else if (field === 'palette_color') {
                    item.palette = [event.target.value, ...(item.palette || []).slice(1)];
                    q('[data-rjp-field="palette"]').value = item.palette.join(', ');
                }
                else if (field === 'palette') {
                    const entries = event.target.value.split(',').map(value => value.trim()).filter(Boolean);
                    if (entries.length) item.palette = entries;
                    else delete item.palette;
                    q('[data-rjp-palette-color]').value = regionColor(item, selected);
                } else {
                    item[field] = event.target.value;
                    if (field === 'label' && item.label === 'text' && item.text === undefined) item.text = '';
                }
            }
            if (field === 'label') render();
            else {
                renderRegionList();
                updateOutput();
                draw();
            }
        }
        host.addEventListener('input', updateField);
        host.addEventListener('change', updateField);
        host.addEventListener('focusout', event => { if (editingField === event.target) editingField = null; });
        q('[data-rjp-file]').addEventListener('change', async event => {
            const file = event.target.files[0];
            if (!file) return;
            try {
                requireValue(file.size <= 2 * 1024 * 1024, 'Layout JSON is too large');
                raw.value = await file.text(); rawDirty = true; loadRaw(); tab = 'layout'; render();
            } catch (error) { tab = 'json'; render(); status(error); }
            event.target.value = '';
        });
        const point = event => {
            const rect = canvas.getBoundingClientRect();
            return [
                Math.round(Math.max(0, Math.min(draft.width, (event.clientX - rect.left) * draft.width / rect.width))),
                Math.round(Math.max(0, Math.min(draft.height, (event.clientY - rect.top) * draft.height / rect.height)))
            ];
        };
        canvas.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            const [x, y] = point(event), before = clone(draft);
            let handle = null;
            const tolerance = 10 * draft.width / canvas.getBoundingClientRect().width;
            const box = draft.items[selected]?.bbox;
            if (mode === 'select' && box) {
                handle = [[0, 1], [2, 1], [0, 3], [2, 3]].find(([xi, yi]) =>
                    Math.abs(x - box[xi]) <= tolerance && Math.abs(y - box[yi]) <= tolerance);
            }
            if (mode === 'draw') {
                if (draft.items.length >= 200) return;
                const label = q('[data-rjp-add-type]').value;
                draft.items.push({ label, caption: '', ...(label === 'text' ? { text: '' } : {}), bbox: [x, y, x, y] });
                selected = draft.items.length - 1;
            } else if (!handle) {
                selected = draft.items.findLastIndex(item => x >= item.bbox[0] && x <= item.bbox[2] && y >= item.bbox[1] && y <= item.bbox[3]);
            }
            gesture = selected < 0 ? null : { before, start: [x, y], bbox: [...draft.items[selected].bbox], handle, draw: mode === 'draw' };
            canvas.setPointerCapture(event.pointerId);
            render();
        });
        canvas.addEventListener('pointermove', event => {
            if (!gesture) return;
            const [x, y] = point(event), item = draft.items[selected], box = gesture.bbox;
            if (gesture.draw) {
                item.bbox = [Math.min(x, gesture.start[0]), Math.min(y, gesture.start[1]), Math.max(x, gesture.start[0]), Math.max(y, gesture.start[1])];
            } else if (gesture.handle) {
                const [xi, yi] = gesture.handle;
                item.bbox[xi] = xi === 0 ? Math.min(x, item.bbox[2] - 1) : Math.max(x, item.bbox[0] + 1);
                item.bbox[yi] = yi === 1 ? Math.min(y, item.bbox[3] - 1) : Math.max(y, item.bbox[1] + 1);
            } else {
                const dx = Math.max(-box[0], Math.min(draft.width - box[2], x - gesture.start[0]));
                const dy = Math.max(-box[1], Math.min(draft.height - box[3], y - gesture.start[1]));
                item.bbox = [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy];
            }
            draw();
        });
        function endGesture(cancel = false) {
            if (!gesture) return;
            const box = draft.items[selected]?.bbox;
            if (cancel || !box || box[2] - box[0] < 1 || box[3] - box[1] < 1) draft = gesture.before;
            else if (JSON.stringify(draft) !== JSON.stringify(gesture.before)) remember(gesture.before);
            selected = Math.min(selected, draft.items.length - 1);
            gesture = null;
            render();
        }
        canvas.addEventListener('pointerup', () => endGesture());
        canvas.addEventListener('pointercancel', () => endGesture(true));
        host.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            if (event.key === 'Tab') {
                const nodes = [...host.querySelectorAll('button,input,select,textarea,canvas')].filter(node => !node.disabled && node.getClientRects().length);
                const first = nodes[0], last = nodes[nodes.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
            if (event.target !== canvas) return;
            if (['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); void action('delete'); }
            if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
                event.preventDefault(); void action(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
            }
        });
        document.body.appendChild(host);
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (tab === 'layout') draw(); }) : null;
        observer?.observe(viewport);
        active = { host, close };
        render();
        if (initialError) status(initialError);
        q('[data-rjp-action="close"]').focus();
        return host;
    }
    const api = { open, compile, parse, validateDraft, scaleDraft, regionColor, wrapPreviewText, fitPreviewText };
    root.SimpAIRegionalJsonPrompt = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
