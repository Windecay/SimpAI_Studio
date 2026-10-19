(function (root) {
    'use strict';
    if (root.SimpAIRegionalJsonPrompt) return;
    const clone = value => JSON.parse(JSON.stringify(value));
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
    const roles = ['object', 'character', 'text'];
    const referenceFits = ['contain', 'match', 'stretch', 'cover'];
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
    function validateDraft(draft, allowEmpty = false, editing = false, { unfinished = false, nativeSize = false } = {}) {
        const required = ['width', 'height', 'summary', 'items', 'bbox_coord_space', 'bbox_format'];
        fields(draft, required, required, 'Layout');
        if (nativeSize) requireValue([draft.width, draft.height].every(value =>
            Number.isInteger(value) && value > 0 && value <= 2048), 'Invalid reference image dimensions');
        else dimensions(draft.width, draft.height);
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
            if (item.label === 'text' || Object.hasOwn(item, 'text')) {
                nonempty(item.text, `${location}.text`, editing || item.label !== 'text');
            }
            for (const key of ['tags', 'palette']) {
                if (Object.hasOwn(item, key)) strings(item[key], `${location}.${key}`);
            }
            requireValue(Array.isArray(item.bbox) && item.bbox.length === 4
                && item.bbox.every(value => typeof value === 'number' && Number.isFinite(value)),
            'Expected four finite coordinates', `${location}.bbox`);
            const [x0, y0, x1, y1] = item.bbox;
            requireValue(unfinished || (0 <= x0 && x0 < x1 && x1 <= draft.width && 0 <= y0 && y0 < y1 && y1 <= draft.height),
                'Region is empty or outside the canvas', `${location}.bbox`);
        });
        return draft;
    }
    function modelRegion(item) {
        const value = clone(item);
        if (value.label !== 'text') delete value.text;
        return value;
    }
    function compile(draft, { allowIncomplete = false } = {}) {
        validateDraft(draft, true, allowIncomplete);
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
            return { ...modelRegion(item), bbox };
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
    function importLayout(value, width, height, { fitToBounds = false } = {}) {
        dimensions(width, height);
        let input = value;
        if (typeof input === 'string') {
            const fenced = input.trim().match(/^```(?:json)?[ \t]*\r?\n([\s\S]*)\r?\n```$/i);
            if (fenced) input = fenced[1];
        }
        const text = typeof input === 'string' ? input.trim() : input;
        const data = typeof text === 'string' && text.startsWith('{') ? JSON.parse(text)
            : typeof text === 'object' && text !== null ? clone(text) : null;
        let sourceWidth = width, sourceHeight = height, estimatedCanvas = false;
        if (data?.bbox_coord_space === 'abs_centralized' && data.bbox_format === 'yxyx') {
            const hasWidth = Object.hasOwn(data, 'width'), hasHeight = Object.hasOwn(data, 'height');
            requireValue(hasWidth === hasHeight, 'Provide both source width and height');
            if (hasWidth) {
                dimensions(data.width, data.height);
                sourceWidth = data.width; sourceHeight = data.height;
                delete data.width; delete data.height;
            } else {
                requireValue(Array.isArray(data.items), 'Add a region', 'items');
                let maxX = 0, maxY = 0;
                data.items.forEach(item => {
                    requireValue(Array.isArray(item.bbox) && item.bbox.length === 4 && item.bbox.every(Number.isInteger),
                        'Compiled coordinates must be integers', 'bbox');
                    maxX = Math.max(maxX, Math.abs(item.bbox[1]), Math.abs(item.bbox[3]));
                    maxY = Math.max(maxY, Math.abs(item.bbox[0]), Math.abs(item.bbox[2]));
                });
                // This is a containing canvas, not a reconstruction of an unknown source size.
                const boundWidth = Math.max(16, Math.ceil(maxX * 2 / 16) * 16);
                const boundHeight = Math.max(16, Math.ceil(maxY * 2 / 16) * 16);
                if (data.items.length && (fitToBounds || boundWidth > width || boundHeight > height)) {
                    sourceWidth = boundWidth;
                    sourceHeight = boundHeight;
                }
                dimensions(sourceWidth, sourceHeight);
                estimatedCanvas = sourceWidth !== width || sourceHeight !== height;
            }
        }
        const draft = parse(data || input, sourceWidth, sourceHeight, { editing: true });
        return {
            draft, estimatedCanvas,
            canvasChanged: draft.width !== width || draft.height !== height,
        };
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

    function optimizationRequest(draft, scope = 'all', selected = -1, instruction = '') {
        validateDraft(draft, true, true);
        requireValue(['all', 'summary', 'region'].includes(scope), 'Invalid optimization scope');
        requireValue(scope !== 'region' || !!draft.items[selected], 'Select a region to optimize');
        requireValue(draft.summary.caption.trim() || draft.items.some(item => item.caption.trim()
            || (item.label === 'text' && item.text?.trim()))
            || String(instruction).trim(), 'Enter a description or editing instruction');
        return {
            version: 1, scope, selected_id: scope === 'region' ? `r${selected + 1}` : null,
            instruction: String(instruction).trim(), width: draft.width, height: draft.height,
            summary: clone(draft.summary),
            regions: draft.items.map((item, index) => ({ ...modelRegion(item), id: `r${index + 1}` })),
        };
    }
    function mergeOptimization(draft, request, response) {
        let value = typeof response === 'string' ? response.trim() : clone(response);
        if (typeof value === 'string') {
            value = value.replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/i, '$1').trim();
            value = JSON.parse(value);
        }
        const keys = request.scope === 'summary' ? ['summary']
            : request.scope === 'region' ? ['regions'] : ['summary', 'regions'];
        fields(value, keys, keys, 'Optimization result');
        const next = clone(draft);
        if (Object.hasOwn(value, 'summary')) {
            nonempty(value.summary, 'summary', !!draft.items.length);
            next.summary.caption = value.summary;
        }
        if (Object.hasOwn(value, 'regions')) {
            const expected = new Set(request.scope === 'region' ? [request.selected_id] : request.regions.map(item => item.id));
            requireValue(Array.isArray(value.regions) && value.regions.length === expected.size,
                'Optimization must preserve every requested region');
            const indices = new Map(request.regions.map((item, index) => [item.id, index]));
            const seen = new Set();
            value.regions.forEach(item => {
                fields(item, ['id', 'caption'], ['id', 'caption'], 'Optimization region');
                requireValue(typeof item.id === 'string' && expected.has(item.id) && !seen.has(item.id),
                    'Optimization returned an unknown or duplicate region');
                nonempty(item.caption, 'caption');
                seen.add(item.id);
                next.items[indices.get(item.id)].caption = item.caption;
            });
        }
        return validateDraft(next, true, true);
    }

    function referencePlacement(width, height, imageWidth, imageHeight, fit = 'contain') {
        requireValue([width, height, imageWidth, imageHeight].every(value => Number.isFinite(value) && value > 0),
            'Invalid reference image dimensions');
        requireValue(referenceFits.includes(fit), 'Invalid reference fit mode');
        if (fit === 'stretch' || fit === 'match') return { x: 0, y: 0, width, height };
        const scale = Math[fit === 'cover' ? 'max' : 'min'](width / imageWidth, height / imageHeight);
        return { x: (width - imageWidth * scale) / 2, y: (height - imageHeight * scale) / 2,
            width: imageWidth * scale, height: imageHeight * scale };
    }
    function matchedReferenceSize(width, height, imageWidth, imageHeight) {
        dimensions(width, height);
        referencePlacement(width, height, imageWidth, imageHeight);
        const scale = Math.min(Math.sqrt(width * height / (imageWidth * imageHeight)),
            16384 / imageWidth, 16384 / imageHeight);
        const align = value => Math.max(16, Math.min(16384, Math.round(value / 16) * 16));
        return { width: align(imageWidth * scale), height: align(imageHeight * scale) };
    }
    function sourceBox(box, rect) {
        return box.map((edge, index) => (edge - (index % 2 ? rect.y : rect.x)) / (index % 2 ? rect.height : rect.width));
    }
    function projectSourceBox(box, rect, width, height) {
        const projected = box.map((edge, index) => edge * (index % 2 ? rect.height : rect.width) + (index % 2 ? rect.y : rect.x));
        const bounded = projected.map((edge, index) =>
            Number(Math.max(0, Math.min(index % 2 ? height : width, edge)).toFixed(9)));
        const outside = bounded[2] - bounded[0] <= 1e-9 || bounded[3] - bounded[1] <= 1e-9;
        return { bbox: outside ? [0, 0, 1, 1] : bounded, outside };
    }
    function reframeReference(draft, regionUi, reference, fromFit, toFit, width, height, nextReference = reference) {
        validateDraft(draft, true, true);
        dimensions(width, height);
        const previous = referencePlacement(draft.width, draft.height, reference.width, reference.height, fromFit);
        const nextRect = referencePlacement(width, height, nextReference.width, nextReference.height, toFit);
        const next = clone(draft), flags = normalizeRegionUi(regionUi, draft.items.length);
        next.width = width; next.height = height;
        next.items.forEach((item, index) => {
            const anchor = flags[index].sourceBox || sourceBox(item.bbox, previous);
            const projected = projectSourceBox(anchor, nextRect, width, height);
            item.bbox = projected.bbox;
            flags[index].sourceBox = [...anchor];
            if (projected.outside) flags[index].outside = true;
            else delete flags[index].outside;
        });
        return { draft: next, regionUi: flags };
    }
    function visibleDraft(draft, regionUi) {
        return { ...clone(draft), items: draft.items.filter((_, index) => !regionUi?.[index]?.outside).map(clone) };
    }
    function annotatedReferenceDraft(source, reference, width, height, fit) {
        validateDraft(source, false, false, { nativeSize: true });
        requireValue(source.width === reference.width && source.height === reference.height,
            'Reference annotation dimensions do not match the image');
        const rect = referencePlacement(width, height, reference.width, reference.height, fit);
        const draft = { ...clone(source), width, height };
        const regionUi = source.items.map((item, index) => {
            const anchor = item.bbox.map((edge, axis) => edge / (axis % 2 ? source.height : source.width));
            const projected = projectSourceBox(anchor, rect, width, height);
            draft.items[index].bbox = projected.bbox;
            return { locked: false, hidden: false, sourceBox: anchor, ...(projected.outside ? { outside: true } : {}) };
        });
        return { draft: validateDraft(draft), regionUi };
    }
    function generationRequest(draft, mode, instruction = '', reference = null) {
        validateDraft(draft, true, true);
        requireValue(['text', 'image'].includes(mode), 'Invalid layout generation mode');
        const request = { version: 1, mode, instruction: String(instruction).trim(), draft: clone(draft) };
        request.draft.items = request.draft.items.map(modelRegion);
        requireValue(request.instruction.length <= 4000, 'Layout generation instruction is too long');
        if (mode === 'image') {
            requireValue(reference?.source && /^data:image\/(?:png|jpeg|webp);base64,/.test(reference.source),
                'Upload a reference image');
            request.image = reference.source;
            request.image_fit = referenceFits.includes(reference.fit) ? reference.fit : 'contain';
        } else requireValue(request.instruction || draft.summary.caption.trim()
            || draft.items.some(item => item.caption.trim() || (item.label === 'text' && item.text?.trim())),
        'Enter a layout description');
        return request;
    }
    function generationResult(response, request) {
        let value = typeof response === 'string' ? response.trim() : clone(response);
        if (typeof value === 'string') {
            value = value.replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/i, '$1').trim();
            value = JSON.parse(value);
        }
        const cropped = request.mode === 'image' && request.image_fit === 'cover';
        validateDraft(value, cropped, cropped && value?.items?.length === 0);
        requireValue(value.width === request.draft.width && value.height === request.draft.height,
            'Layout dimensions must match the requested canvas');
        return clone(value);
    }
    async function decodeReference(source) {
        const image = new root.Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error('Reference image could not be decoded'));
            image.src = source;
        });
        return image;
    }
    async function readReferenceFile(file) {
        let type = String(file.type || '').toLowerCase();
        if (!type || type === 'application/octet-stream') {
            type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[
                String(file.name || '').split('.').pop().toLowerCase()
            ] || '';
            if (type) file = new root.File([file], file.name, { type });
        }
        requireValue(['image/png', 'image/jpeg', 'image/webp'].includes(type),
            'Choose a PNG, JPEG or WebP reference image');
        requireValue(file.size <= 20 * 1024 * 1024, 'Reference image file is too large');
        const url = root.URL.createObjectURL(file);
        try {
            const image = await decodeReference(url);
            requireValue(image.naturalWidth * image.naturalHeight <= 64000000,
                'Reference image dimensions are too large');
            const scale = Math.min(1, 1536 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            const source = canvas.toDataURL('image/jpeg', 0.92);
            requireValue(source.length <= 2800000, 'Reference image is too large');
            return { source, width: canvas.width, height: canvas.height, name: file.name,
                opacity: 0.5, visible: true };
        } finally { root.URL.revokeObjectURL(url); }
    }

    function referenceTransferFiles(transfer) {
        const files = Array.from(transfer?.files || []);
        return files.length ? files : Array.from(transfer?.items || [])
            .filter(item => item.kind === 'file').map(item => item.getAsFile?.()).filter(Boolean);
    }
    function referenceTransferUrl(transfer) {
        if (typeof transfer?.getData !== 'function') return '';
        const read = type => String(transfer.getData(type) || '').trim();
        let source = read('application/x-simpleai-gallery-original-url');
        if (!source && read('text/html')) {
            const doc = new root.DOMParser().parseFromString(read('text/html'), 'text/html');
            source = doc.querySelector('img[src]')?.getAttribute('src') || '';
        }
        if (!source) source = read('text/uri-list').split(/\r?\n/).find(line => line && !line.startsWith('#')) || '';
        if (!source && /^(?:https?:|blob:|data:image\/|\/)/i.test(read('text/plain'))) source = read('text/plain');
        if (!source) return '';
        try {
            const url = new root.URL(source, document.baseURI);
            return /^(?:https?:|blob:)$/.test(url.protocol)
                || /^data:image\/(?:png|jpeg|webp);base64,/i.test(source) ? url.href : '';
        } catch (_) { return ''; }
    }
    async function referenceFileFromUrl(source, signal) {
        const response = await root.fetch(source, { credentials: 'same-origin', signal });
        requireValue(response.ok, 'Reference image could not be loaded');
        requireValue(Number(response.headers.get('content-length') || 0) <= 20 * 1024 * 1024,
            'Reference image file is too large');
        const reader = response.body?.getReader();
        let blob;
        if (reader) {
            const parts = [];
            let size = 0;
            try {
                for (;;) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    size += chunk.value.byteLength;
                    requireValue(size <= 20 * 1024 * 1024, 'Reference image file is too large');
                    parts.push(chunk.value);
                }
                blob = new root.Blob(parts, { type: response.headers.get('content-type') || '' });
            } finally { await reader.cancel().catch(() => {}); }
        } else blob = await response.blob();
        const mime = blob.type.split(';')[0];
        let name = 'reference.' + ({ 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime] || 'png');
        try {
            const url = new root.URL(source, document.baseURI);
            if (/^https?:$/.test(url.protocol)) name = decodeURIComponent(url.pathname.split('/').pop()) || name;
        } catch (_) {}
        return new root.File([blob], name, { type: mime });
    }

    function normalizeRegionUi(value, count) {
        return Array.from({ length: count }, (_, index) => ({
            locked: value?.[index]?.locked === true,
            hidden: value?.[index]?.hidden === true,
            ...(value?.[index]?.outside === true ? { outside: true } : {}),
            ...(Array.isArray(value?.[index]?.sourceBox) && value[index].sourceBox.length === 4
                && value[index].sourceBox.every(edge => typeof edge === 'number' && Number.isFinite(edge))
                && value[index].sourceBox[0] < value[index].sourceBox[2] && value[index].sourceBox[1] < value[index].sourceBox[3]
                ? { sourceBox: [...value[index].sourceBox] } : {}),
        }));
    }
    function referenceDimensions(value) {
        return [value?.width, value?.height].every(edge => Number.isInteger(edge) && edge > 0 && edge <= 2048)
            ? { width: value.width, height: value.height } : null;
    }

    function normalizeSnapshot(value) {
        try {
            if (value?.version !== 1) return null;
            const layout = item => clone(validateDraft(item, true, true, { unfinished: true }));
            const draft = layout(value.draft);
            const history = items => (Array.isArray(items) ? items.slice(-60) : []).flatMap(item => {
                try {
                    const draft = layout(item?.draft || item);
                    const frame = {};
                    if (referenceFits.includes(item?.referenceFit)) frame.referenceFit = item.referenceFit;
                    const referenceSize = referenceDimensions(item?.referenceSize);
                    if (referenceSize) frame.referenceSize = referenceSize;
                    try {
                        dimensions(item?.fixedCanvas?.width, item?.fixedCanvas?.height);
                        frame.fixedCanvas = { width: item.fixedCanvas.width, height: item.fixedCanvas.height };
                    } catch (_) {}
                    return [{ draft, regionUi: normalizeRegionUi(item?.regionUi, draft.items.length), ...frame }];
                } catch (_) { return []; }
            });
            let optimizedSnapshot = '';
            try {
                if (value.optimizedSnapshot) optimizedSnapshot = JSON.stringify(layout(JSON.parse(value.optimizedSnapshot)));
            } catch (_) {}
            return {
                version: 1, draft, regionUi: normalizeRegionUi(value.regionUi, draft.items.length),
                raw: typeof value.raw === 'string' ? value.raw
                    : JSON.stringify(visibleDraft(draft, value.regionUi), null, 2),
                rawDirty: value.rawDirty === true,
                selected: Number.isInteger(value.selected) ? Math.max(-1, Math.min(value.selected, draft.items.length - 1)) : -1,
                mode: value.mode === 'draw' ? 'draw' : 'select',
                tab: value.tab === 'json' ? 'json' : 'layout',
                detailsOpen: value.detailsOpen === true,
                undo: history(value.undo), redo: history(value.redo), optimizedSnapshot,
                aiScope: ['all', 'region', 'summary'].includes(value.aiScope) ? value.aiScope : 'all',
                aiInstruction: typeof value.aiInstruction === 'string' ? value.aiInstruction.slice(0, 4000) : '',
                aiMode: ['text', 'image'].includes(value.aiMode) ? value.aiMode : 'optimize',
                referenceFit: referenceFits.includes(value.referenceFit) ? value.referenceFit : 'contain',
                fixedCanvas: (() => {
                    try {
                        dimensions(value.fixedCanvas?.width, value.fixedCanvas?.height);
                        return { width: value.fixedCanvas.width, height: value.fixedCanvas.height };
                    } catch (_) { return { width: draft.width, height: draft.height }; }
                })(),
            };
        } catch (_) { return null; }
    }

    let active = null, windowFrame = null, windowMaximized = false;
    function open(options = {}) {
        active?.close();
        const state = options.langState || root.simpleaiTopbarSystemParams || {};
        const t = key => state.__lang === 'en' ? key : (root.localization?.[key] || key);
        const label = role => t({ object: 'Object', character: 'Character', text: 'Text' }[role]);
        const icon = (action, glyph, title, extra = '') =>
            `<button type="button" data-rjp-action="${action}" title="${esc(t(title))}" aria-label="${esc(t(title))}" ${extra}><i class="fa-solid fa-${glyph}" aria-hidden="true"></i></button>`;
        let draft, initialError = null, imported = null;
        try {
            imported = importLayout(options.value || '', options.width, options.height);
            draft = imported.draft;
        }
        catch (error) {
            initialError = error;
            draft = { width: options.width, height: options.height, summary: { caption: '' }, items: [],
                bbox_coord_space: 'abs', bbox_format: 'xyxy' };
        }
        let appliedLayout = normalizeSnapshot(options.reference?.layoutState);
        if (appliedLayout) {
            try {
                if (compile(visibleDraft(appliedLayout.draft, appliedLayout.regionUi), { allowIncomplete: true })
                    !== compile(draft, { allowIncomplete: true })) appliedLayout = null;
            } catch (_) { appliedLayout = null; }
        }
        const restored = normalizeSnapshot(options.snapshot) || appliedLayout;
        if (restored) { draft = restored.draft; initialError = null; }
        let regionUi = normalizeRegionUi(restored?.regionUi, draft.items.length);
        let selected = restored ? restored.selected : (draft.items.length ? 0 : -1);
        let mode = restored?.mode || 'select', tab = restored?.tab || (initialError ? 'json' : 'layout');
        let gesture = null, editingField = null;
        let rawDirty = restored ? restored.rawDirty : !!initialError;
        let optimizing = false, closed = false, aiPreview = null, aiGeneration = 0;
        let reference = null, referenceImage = null, referenceRevision = 0, loadingReference = false;
        let referenceAbort = null, referenceDragDepth = 0;
        let referenceFit = restored?.referenceFit
            || (referenceFits.includes(options.reference?.fit) ? options.reference.fit : 'contain');
        let fixedCanvas = restored?.fixedCanvas || { width: draft.width, height: draft.height };
        let optimizedSnapshot = restored?.optimizedSnapshot || '';
        const undo = restored?.undo || [], redo = restored?.redo || [];
        const previousFocus = document.activeElement;
        const host = document.createElement('div');
        host.className = 'sai-rjp-overlay';
        host.innerHTML = `<div class="sai-rjp-backdrop" data-rjp-action="close"></div>
          <section class="sai-rjp-dialog" role="dialog" aria-modal="true" aria-labelledby="sai-rjp-title">
            <div class="sai-rjp-reference-drop" data-rjp-reference-drop role="status" aria-live="polite" aria-hidden="true" hidden>
              <i class="fa-solid fa-image" aria-hidden="true"></i><strong data-rjp-drop-label>${esc(t('Drop reference image here'))}</strong>
            </div>
            <header><h2 id="sai-rjp-title">${esc(t('Regional Prompt'))}</h2>
              <select aria-label="${esc(t('Model'))}" data-rjp-model><option>MOSS-Image</option></select>
              ${icon('maximize', 'maximize', 'Maximize window', 'aria-pressed="false"')}
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
                <div class="sai-rjp-tools" role="group" aria-label="${esc(t('Canvas size tools'))}">
                  ${icon('scale', 'arrows-to-circle', 'Scale to current output size')}
                  ${icon('fit-canvas', 'crop-simple', 'Fit canvas to region bounds')}
                </div>
              </div>
              <div class="sai-rjp-tabs" role="tablist">
                <button type="button" role="tab" data-rjp-tab="layout">${esc(t('Layout'))}</button>
                <button type="button" role="tab" data-rjp-tab="json">JSON</button>
              </div>
            </div>
            <div class="sai-rjp-layout">
              <div class="sai-rjp-main">
                <label>${esc(t('Whole image description (optional)'))}<textarea data-rjp-field="summary" rows="3"></textarea></label>
                <div class="sai-rjp-reference-tools" role="group" aria-label="${esc(t('Reference image'))}">
                  ${icon('upload-reference', 'image', 'Upload reference image')}
                  <span data-rjp-reference-name>${esc(t('Reference image'))}</span>
                  <div class="sai-rjp-reference-controls" data-rjp-reference-controls hidden>
                    <select data-rjp-reference-fit aria-label="${esc(t('Reference image fit'))}">
                      <option value="contain">${esc(t('Contain image'))}</option>
                      <option value="match">${esc(t('Match image ratio'))}</option>
                      <option value="stretch">${esc(t('Stretch to fill'))}</option>
                      <option value="cover">${esc(t('Crop to fill'))}</option>
                    </select>
                    ${icon('toggle-reference', 'eye', 'Show reference image')}
                    <label>${esc(t('Image opacity'))}<input data-rjp-reference-opacity type="range" min="0" max="100" step="1" value="50"></label>
                    ${icon('remove-reference', 'trash-can', 'Remove reference image')}
                  </div>
                </div>
                <div class="sai-rjp-viewport"><div class="sai-rjp-board"><canvas tabindex="0" aria-label="${esc(t('Region canvas'))}"></canvas></div></div>
                <details><summary>${esc(t('Compiled prompt'))}</summary><textarea data-rjp-output readonly rows="3" aria-label="${esc(t('Compiled prompt'))}"></textarea></details>
              </div>
              <aside>
                <div class="sai-rjp-region-heading"><h3>${esc(t('Regions'))} <span data-rjp-count></span></h3>
                  <select data-rjp-add-type aria-label="${esc(t('New region type'))}">${roles.map(role => `<option value="${role}">${esc(label(role))}</option>`).join('')}</select>
                  ${icon('add', 'plus', 'Add region')}</div>
                <div class="sai-rjp-regions" role="list" aria-label="${esc(t('Regions'))}"></div>
                <div class="sai-rjp-region-form">
                  <div class="sai-rjp-region-heading">
                    <h3 data-rjp-selection></h3>
                    <select data-rjp-field="label" aria-label="${esc(t('Region type'))}">${roles.map(role => `<option value="${role}">${esc(label(role))}</option>`).join('')}</select>
                    ${icon('duplicate', 'clone', 'Duplicate region')}${icon('delete', 'trash-can', 'Delete region')}
                  </div>
                  <label>${esc(t('Region description'))}<textarea data-rjp-field="caption" rows="2"></textarea></label>
                  <label data-rjp-text-wrap>${esc(t('Literal text'))}<textarea data-rjp-field="text" rows="2"></textarea></label>
                  <details class="sai-rjp-region-details" data-rjp-details>
                    <summary>${esc(t('Position and palette'))}</summary>
                    <div class="sai-rjp-region-geometry">
                      <div class="sai-rjp-coordinates">${['Left', 'Top', 'Right', 'Bottom'].map((name, index) =>
                          `<label>${esc(t(name))}<input type="number" min="0" step="any" data-rjp-coordinate="${index}"></label>`).join('')}</div>
                      <div><label for="sai-rjp-palette-values">${esc(t('Palette'))}</label>
                        <div class="sai-rjp-palette">
                          <input type="color" data-rjp-field="palette_color" data-rjp-palette-color aria-label="${esc(t('Palette color'))}">
                          <input id="sai-rjp-palette-values" data-rjp-field="palette" type="text">
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              </aside>
            </div>
            <div class="sai-rjp-json" hidden><textarea data-rjp-json spellcheck="false" aria-label="${esc(t('Editable layout JSON'))}"></textarea>
              <div class="sai-rjp-tools">
                <button type="button" data-rjp-action="load-json"><i class="fa-solid fa-file-import" aria-hidden="true"></i> ${esc(t('Load JSON'))}</button>
                ${icon('reset-json', 'rotate-left', 'Restore JSON from layout')}
              </div></div>
            <div class="sai-rjp-ai-bar">
              <select data-rjp-ai-mode aria-label="${esc(t('Agent operation'))}">
                <option value="optimize">${esc(t('Optimize descriptions'))}</option>
                <option value="text">${esc(t('Text to layout'))}</option>
                <option value="image">${esc(t('Image to layout'))}</option>
              </select>
              <select data-rjp-ai-scope aria-label="${esc(t('Optimization scope'))}">
                <option value="all">${esc(t('All descriptions'))}</option>
                <option value="region">${esc(t('Selected region'))}</option>
                <option value="summary">${esc(t('Whole image description'))}</option>
              </select>
              <input data-rjp-ai-instruction type="text" maxlength="4000"
                aria-label="${esc(t('Editing instruction'))}" placeholder="${esc(t('Editing instruction (optional)'))}">
              ${icon('optimize', 'wand-magic-sparkles', 'Optimize with agent')}
            </div>
            <section class="sai-rjp-ai-preview" data-rjp-ai-preview hidden aria-label="${esc(t('Optimization preview'))}">
              <div class="sai-rjp-ai-preview-heading"><h3>${esc(t('Optimization preview'))}</h3>
                ${icon('apply-optimization', 'check', 'Apply suggestions')}
                ${icon('discard-optimization', 'xmark', 'Discard suggestions')}
              </div>
              <div class="sai-rjp-ai-preview-list" data-rjp-ai-changes></div>
            </section>
            <footer><div data-rjp-status role="status" aria-live="polite"></div>
              <div class="sai-rjp-footer-tools">
                ${icon('import', 'file-import', 'Import layout JSON')}${icon('export', 'download', 'Download editable JSON')}
                ${icon('copy', 'copy', 'Copy compiled prompt')}
                <button type="button" data-rjp-action="apply" class="sai-rjp-apply"><i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(t('Apply prompt'))}</button>
              </div>
            </footer><input type="file" accept=".json,application/json" data-rjp-file hidden>
            <input type="file" accept="image/png,image/jpeg,image/webp" data-rjp-reference-file hidden>
          </section>`;
        const q = selector => host.querySelector(selector);
        const dialog = q('.sai-rjp-dialog');
        const compactWindow = () => root.innerWidth <= 700 || root.matchMedia?.('(pointer: coarse)')?.matches;
        let popupFrame = null, maximized = false, restoreFrame = null;
        function setWindowFrame(frame) {
            for (const [key, value] of Object.entries(frame)) dialog.style.setProperty(key, `${value}px`, 'important');
            for (const [key, value] of Object.entries({ right: 'auto', bottom: 'auto', transform: 'none' }))
                dialog.style.setProperty(key, value, 'important');
            dialog.dataset.simpleaiResizeManaged = '1';
        }
        function syncMaximizeControl() {
            const button = q('[data-rjp-action="maximize"]');
            button.title = t(maximized ? 'Restore window' : 'Maximize window');
            button.setAttribute('aria-label', button.title);
            button.setAttribute('aria-pressed', String(maximized));
            q('[data-rjp-action="maximize"] i').className = maximized
                ? 'fa-solid fa-window-restore' : 'fa-solid fa-maximize';
            if (popupFrame) q('#sai-rjp-title').title = maximized ? '' : t('Drag window');
        }
        function syncWindowViewport() {
            if (maximized) {
                popupFrame?.cancelInteraction?.();
                setWindowFrame({ left: 0, top: 0, width: root.innerWidth, height: root.innerHeight });
            } else if (compactWindow()) {
                popupFrame?.cancelInteraction?.();
                for (const key of ['left', 'top', 'right', 'bottom', 'width', 'height', 'transform']) {
                    dialog.style.removeProperty(key);
                }
                delete dialog.dataset.simpleaiResizeManaged;
            } else popupFrame?.ensureWithinViewport?.(false);
        }
        function toggleMaximize() {
            popupFrame?.cancelInteraction?.();
            if (maximized) {
                maximized = false;
                delete dialog.dataset.rjpMaximized;
                if (restoreFrame && !compactWindow()) {
                    const width = Math.min(restoreFrame.width, root.innerWidth - 24);
                    const height = Math.min(restoreFrame.height, root.innerHeight - 24);
                    setWindowFrame({ width, height,
                        left: Math.max(12, Math.min(restoreFrame.left, root.innerWidth - width - 12)),
                        top: Math.max(12, Math.min(restoreFrame.top, root.innerHeight - height - 12)) });
                }
            } else {
                const rect = dialog.getBoundingClientRect();
                restoreFrame = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
                maximized = true;
                dialog.dataset.rjpMaximized = '1';
            }
            windowMaximized = maximized;
            syncMaximizeControl();
            syncWindowViewport();
            if (tab === 'layout') draw();
        }
        const canvas = q('canvas'), viewport = q('.sai-rjp-viewport'), board = q('.sai-rjp-board');
        const raw = q('[data-rjp-json]');
        const editableDraft = () => visibleDraft(draft, regionUi);
        raw.value = restored ? restored.raw : (initialError ? String(options.value || '') : JSON.stringify(editableDraft(), null, 2));
        q('[data-rjp-ai-scope]').value = restored?.aiScope || 'all';
        q('[data-rjp-ai-instruction]').value = restored?.aiInstruction || '';
        q('[data-rjp-ai-mode]').value = restored?.aiMode || 'optimize';
        q('[data-rjp-details]').open = restored?.detailsOpen || false;
        function persistDraft() {
            if (closed || typeof options.onDraftChange !== 'function') return;
            // Preserve unfinished edits without compiling them or saving API settings.
            const snapshot = normalizeSnapshot({
                version: 1, draft, regionUi, raw: rawDirty ? raw.value : JSON.stringify(editableDraft(), null, 2),
                rawDirty, selected, mode, tab, undo, redo, optimizedSnapshot,
                referenceFit, fixedCanvas,
                detailsOpen: q('[data-rjp-details]').open,
                aiScope: q('[data-rjp-ai-scope]').value,
                aiInstruction: q('[data-rjp-ai-instruction]').value,
                aiMode: q('[data-rjp-ai-mode]').value,
            });
            if (snapshot) {
                try { options.onDraftChange(snapshot); } catch (_) {}
            }
        }
        function status(error = null, isError = true) {
            const node = q('[data-rjp-status]');
            node.textContent = error ? `${t(error.message || String(error))}${error.field ? `: ${error.field}` : ''}` : '';
            node.classList.toggle('is-error', !!error && isError);
        }
        function importStatus() {
            if (!imported?.canvasChanged) return;
            if (draft.width === options.width && draft.height === options.height) return;
            try { validateDraft(draft, true, true); } catch (_) { return; }
            status({
                message: imported.estimatedCanvas
                    ? 'Canvas inferred from region bounds; original canvas size is unknown. Applying also updates the output size.'
                    : 'Imported source canvas. Applying also updates the output size.',
                field: `${draft.width} x ${draft.height}`,
            }, false);
        }
        const capture = () => ({ draft: clone(draft), regionUi: clone(regionUi), referenceFit, fixedCanvas: { ...fixedCanvas },
            ...(reference ? { referenceSize: referenceDimensions(reference) } : {}) });
        function restore(snapshot) {
            draft = clone(snapshot.draft);
            regionUi = normalizeRegionUi(snapshot.regionUi, draft.items.length);
            if (referenceFits.includes(snapshot.referenceFit)) referenceFit = snapshot.referenceFit;
            fixedCanvas = snapshot.fixedCanvas ? { ...snapshot.fixedCanvas } : { width: draft.width, height: draft.height };
            if (reference && snapshot.referenceSize
                && (snapshot.referenceSize.width !== reference.width || snapshot.referenceSize.height !== reference.height)) {
                const size = referenceFit === 'match'
                    ? matchedReferenceSize(fixedCanvas.width, fixedCanvas.height, reference.width, reference.height)
                    : { width: draft.width, height: draft.height };
                const next = reframeReference(draft, regionUi, snapshot.referenceSize, referenceFit,
                    referenceFit, size.width, size.height, reference);
                draft = next.draft; regionUi = next.regionUi;
            }
            referenceRevision++;
            rememberReference();
            rawDirty = false;
            raw.value = JSON.stringify(editableDraft(), null, 2);
        }
        function remember(snapshot = capture()) {
            undo.push(clone(snapshot));
            if (undo.length > 60) undo.shift();
            redo.length = 0;
            editingField = null;
        }
        function updateOutput() {
            try {
                q('[data-rjp-output]').value = compile(editableDraft(), { allowIncomplete: true });
                if (!optimizing) {
                    try {
                        if (draft.items.length || draft.summary.caption.trim()) validateDraft(draft, true);
                        status();
                        importStatus();
                        const outside = regionUi.filter(item => item.outside).length;
                        if (outside) status({ message: 'Regions outside the canvas are temporarily excluded',
                            field: String(outside) }, false);
                    }
                    catch (error) {
                        status({ message: 'Some descriptions or literal text are empty. You can still apply the prompt.',
                            field: error.field }, false);
                    }
                }
            }
            catch (error) {
                q('[data-rjp-output]').value = '';
                status(['Enter a description or literal text', 'Add a region'].includes(error.message) ? null : error);
            }
            q('[data-rjp-action="undo"]').disabled = !undo.length;
            q('[data-rjp-action="redo"]').disabled = !redo.length;
            q('[data-rjp-action="fit-canvas"]').disabled = !draft.items.length;
        }
        function renderAiPreview() {
            q('[data-rjp-ai-preview]').hidden = !aiPreview;
            q('[data-rjp-ai-changes]').innerHTML = aiPreview ? aiPreview.changes.map(change =>
                `<div class="sai-rjp-ai-change"><strong>${esc(change.label)}</strong>
                  <div><span>${esc(t('Original description'))}</span><p>${esc(change.before || t('Empty'))}</p></div>
                  <div><span>${esc(t('Suggested'))}</span><p>${esc(change.after || t('Empty'))}</p></div>
                </div>`
            ).join('') : '';
        }
        function renderAiMode() {
            const generating = q('[data-rjp-ai-mode]').value !== 'optimize';
            q('.sai-rjp-ai-bar').classList.toggle('is-layout-generation', generating);
            q('[data-rjp-ai-scope]').hidden = generating;
            const button = q('[data-rjp-action="optimize"]');
            const title = t(generating ? 'Generate layout with agent' : 'Optimize with agent');
            button.title = title;
            button.setAttribute('aria-label', title);
            q('[data-rjp-ai-instruction]').placeholder = t(generating ? 'Layout description (optional for image)' : 'Editing instruction (optional)');
        }
        function renderReference() {
            q('[data-rjp-reference-controls]').hidden = !reference;
            q('[data-rjp-reference-name]').textContent = reference?.name || t('Reference image');
            q('[data-rjp-reference-name]').title = reference?.name || '';
            q('[data-rjp-reference-opacity]').value = reference ? Math.round(reference.opacity * 100) : 50;
            q('[data-rjp-reference-fit]').value = referenceFit;
            q('[data-rjp-reference-fit]').disabled = !reference || optimizing || loadingReference || applying;
            const toggle = q('[data-rjp-action="toggle-reference"]');
            toggle.setAttribute('aria-pressed', String(reference?.visible === true));
            toggle.title = t(reference?.visible ? 'Hide reference image' : 'Show reference image');
            toggle.setAttribute('aria-label', toggle.title);
            q('[data-rjp-action="toggle-reference"] i').className = reference?.visible
                ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
        }
        function rememberReference() {
            try { options.onReferenceChange?.(reference ? { ...reference, fit: referenceFit } : null); } catch (_) {}
        }
        function updateAnchor(index) {
            if (!reference || !draft.items[index] || regionUi[index]?.outside) return;
            const box = draft.items[index].bbox;
            if (!box.every(Number.isFinite) || box[0] >= box[2] || box[1] >= box[3]) return;
            regionUi[index].sourceBox = sourceBox(box,
                referencePlacement(draft.width, draft.height, reference.width, reference.height, referenceFit));
        }
        function setFrame(fit, width, height, record = true) {
            const next = reframeReference(draft, regionUi, reference, referenceFit, fit, width, height);
            if (record) remember();
            const optimized = optimizedSnapshot === JSON.stringify(draft);
            draft = next.draft; regionUi = next.regionUi;
            if (optimized) optimizedSnapshot = JSON.stringify(draft);
            referenceFit = fit;
            referenceRevision++;
            aiPreview = null;
            raw.value = JSON.stringify(editableDraft(), null, 2); rawDirty = false;
            rememberReference();
        }
        function changeReferenceFit(fit) {
            requireValue(referenceFits.includes(fit), 'Invalid reference fit mode');
            if (fit === referenceFit) return;
            requireValue(reference && !optimizing && !applying && !loadingReference, 'Reference fit cannot change during an operation');
            if (rawDirty) loadRaw();
            const previousFixed = { ...fixedCanvas };
            let size = { width: draft.width, height: draft.height };
            if (fit === 'match') size = matchedReferenceSize(draft.width, draft.height, reference.width, reference.height);
            else if (referenceFit === 'match') size = fixedCanvas;
            const fromFit = referenceFit, beforeSize = { width: draft.width, height: draft.height };
            setFrame(fit, size.width, size.height);
            fixedCanvas = fit === 'match' && fromFit !== 'match' ? beforeSize : previousFixed;
            render();
        }
        function resizeReferenceCanvas(width, height, editedAxis) {
            if (referenceFit === 'match') {
                if (editedAxis === 'width') height = Math.max(16, Math.round(width * reference.height / reference.width / 16) * 16);
                else if (editedAxis === 'height') width = Math.max(16, Math.round(height * reference.width / reference.height / 16) * 16);
                else ({ width, height } = matchedReferenceSize(width, height, reference.width, reference.height));
            }
            dimensions(width, height);
            setFrame(referenceFit, width, height, false);
            fixedCanvas = { width, height };
            for (const key of ['width', 'height']) q(`[data-rjp-field="${key}"]`).value = draft[key];
            host.querySelectorAll('[data-rjp-coordinate]').forEach(node => {
                if (draft.items[selected]) node.value = draft.items[selected].bbox[Number(node.dataset.rjpCoordinate)];
            });
        }
        async function setReference(value, restoring = false) {
            const revision = ++referenceRevision;
            const image = value ? await decodeReference(value.source) : null;
            if (closed || revision !== referenceRevision) return;
            const previous = reference;
            const nextReference = value ? { ...value, width: image.naturalWidth, height: image.naturalHeight,
                opacity: Number.isFinite(value.opacity) ? Math.max(0, Math.min(1, value.opacity)) : 0.5,
                visible: value.visible !== false } : null;
            if (nextReference && !restoring && (previous || referenceFit === 'match')) {
                const size = referenceFit === 'match'
                    ? matchedReferenceSize(fixedCanvas.width, fixedCanvas.height, nextReference.width, nextReference.height)
                    : { width: draft.width, height: draft.height };
                const next = reframeReference(draft, regionUi, previous || nextReference,
                    referenceFit, referenceFit, size.width, size.height, nextReference);
                draft = next.draft; regionUi = next.regionUi;
                if (!rawDirty) raw.value = JSON.stringify(editableDraft(), null, 2);
            }
            reference = nextReference;
            referenceImage = image;
            renderReference();
            rememberReference();
            draw();
        }
        function setOptimizing(value) {
            optimizing = value;
            q('[data-rjp-action="optimize"]').disabled = value;
            q('[data-rjp-action="optimize"] i').className = value
                ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-wand-magic-sparkles';
            q('[data-rjp-ai-scope]').disabled = value;
            q('[data-rjp-ai-instruction]').disabled = value;
            q('[data-rjp-ai-mode]').disabled = value;
            q('[data-rjp-action="upload-reference"]').disabled = value || loadingReference;
            q('[data-rjp-action="remove-reference"]').disabled = value;
            q('[data-rjp-reference-fit]').disabled = value || !reference || loadingReference;
            q('[data-rjp-action="apply"]').disabled = value || applying;
        }
        function assertAiSnapshot(snapshot, request, selection) {
            requireValue(!closed, 'The layout editor was closed');
            options.assertContext?.();
            requireValue(!rawDirty && JSON.stringify(draft) === snapshot
                && (request.scope !== 'region' || selected === selection),
            'The layout changed. Request new suggestions.');
        }
        async function optimize() {
            if (optimizing || applying) return;
            requireValue(!loadingReference, 'Reference image is still loading');
            if (q('[data-rjp-ai-mode]').value !== 'optimize') return generateLayout();
            if (typeof options.onOptimize !== 'function') throw new Error('Agent optimization is unavailable in this view.');
            if (rawDirty) loadRaw();
            options.assertContext?.();
            const selection = selected;
            const indices = draft.items.flatMap((_, index) => regionUi[index].outside ? [] : [index]);
            const contextDraft = editableDraft();
            const request = optimizationRequest(contextDraft, q('[data-rjp-ai-scope]').value || 'all', indices.indexOf(selected),
                q('[data-rjp-ai-instruction]').value || '');
            const snapshot = JSON.stringify(draft), originalDraft = clone(draft);
            const generation = ++aiGeneration;
            aiPreview = null;
            renderAiPreview();
            setOptimizing(true);
            status({ message: 'Generating description suggestions...' }, false);
            try {
                const result = await options.onOptimize({ input: JSON.stringify(request), request: clone(request) });
                if (closed || generation !== aiGeneration) return;
                assertAiSnapshot(snapshot, request, selection);
                if (result?.ok === false) throw new Error(result.error || 'Regional optimization failed.');
                const visible = mergeOptimization(contextDraft, request,
                    typeof result === 'string' ? result : result?.text);
                const next = clone(originalDraft);
                next.summary = visible.summary;
                indices.forEach((index, visibleIndex) => { next.items[index] = visible.items[visibleIndex]; });
                const changes = [];
                if (next.summary.caption !== originalDraft.summary.caption) changes.push({
                    label: t('Whole image description'), before: originalDraft.summary.caption, after: next.summary.caption,
                });
                next.items.forEach((item, index) => {
                    if (item.caption !== originalDraft.items[index].caption) changes.push({
                        label: `${index + 1} ${label(item.label)}`,
                        before: originalDraft.items[index].caption, after: item.caption,
                    });
                });
                requireValue(changes.length, 'No description changes were returned.');
                aiPreview = { snapshot, request, selection, next, changes };
                renderAiPreview();
                status({ message: 'Suggestions are ready for review.' }, false);
            } catch (error) {
                if (!closed && generation === aiGeneration) throw error;
            } finally {
                if (!closed && generation === aiGeneration) setOptimizing(false);
            }
        }
        async function generateLayout() {
            requireValue(!loadingReference, 'Reference image is still loading');
            requireValue(typeof options.onGenerate === 'function', 'Agent optimization is unavailable in this view.');
            if (rawDirty) loadRaw();
            options.assertContext?.();
            const request = generationRequest(editableDraft(), q('[data-rjp-ai-mode]').value,
                q('[data-rjp-ai-instruction]').value, reference ? { ...reference, fit: referenceFit } : null);
            const snapshot = JSON.stringify(draft), imageRevision = referenceRevision;
            const generation = ++aiGeneration;
            aiPreview = null;
            renderAiPreview();
            setOptimizing(true);
            status({ message: 'Generating layout...' }, false);
            try {
                const result = await options.onGenerate({ input: JSON.stringify(request), request: clone(request) });
                if (closed || generation !== aiGeneration) return;
                assertAiSnapshot(snapshot, request, selected);
                requireValue(request.mode !== 'image' || imageRevision === referenceRevision,
                    'The reference image changed. Generate the layout again.');
                if (result?.ok === false) throw new Error(result.error || 'Layout generation failed.');
                const next = generationResult(typeof result === 'string' ? result : result?.text, request);
                const annotated = request.mode === 'image' && result?.source_layout
                    ? annotatedReferenceDraft(result.source_layout, reference, next.width, next.height, referenceFit) : null;
                remember();
                draft = annotated?.draft || next;
                regionUi = annotated?.regionUi || normalizeRegionUi(null, next.items.length);
                selected = draft.items.length ? 0 : -1;
                if (!annotated && reference) draft.items.forEach((_, index) => updateAnchor(index));
                optimizedSnapshot = JSON.stringify(draft);
                raw.value = JSON.stringify(editableDraft(), null, 2); rawDirty = false;
                tab = 'layout';
                render();
                status({ message: 'Layout generated.' }, false);
            } finally {
                if (!closed && generation === aiGeneration) setOptimizing(false);
            }
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
            if (referenceImage && reference?.visible) {
                const rect = referencePlacement(draft.width, draft.height, reference.width, reference.height, referenceFit);
                ctx.save();
                ctx.globalAlpha = reference.opacity;
                ctx.drawImage(referenceImage, rect.x, rect.y, rect.width, rect.height);
                ctx.restore();
            }
            draft.items.forEach((item, index) => {
                if (regionUi[index].hidden || regionUi[index].outside) return;
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
                if (index === selected && !regionUi[index].locked) {
                    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
                        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 4 * unit, y - 4 * unit, 8 * unit, 8 * unit);
                        ctx.strokeRect(x - 4 * unit, y - 4 * unit, 8 * unit, 8 * unit);
                    }
                }
            });
        }
        function revealSelectedRegion() {
            const list = q('.sai-rjp-regions');
            const row = q(`[data-rjp-region="${selected}"]`)?.closest?.('.sai-rjp-region-row');
            if (selected < 0 || !row || !list.clientHeight) return;
            const bounds = list.getBoundingClientRect(), item = row.getBoundingClientRect();
            if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top;
            else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
        }
        function renderRegionList() {
            const list = q('.sai-rjp-regions'), scrollTop = list.scrollTop || 0;
            q('[data-rjp-count]').textContent = `(${draft.items.length})`;
            list.innerHTML = draft.items.map((item, index) => {
                const ui = regionUi[index];
                const extra = flag => `data-rjp-index="${index}" aria-pressed="${ui[flag]}"`;
                return `<div class="sai-rjp-region-row${ui.hidden || ui.outside ? ' is-hidden' : ''}" role="listitem" style="--region-color:${regionColor(item, index)}">
                  <button type="button" class="sai-rjp-region-select" aria-pressed="${index === selected}" data-rjp-region="${index}" ${ui.outside ? `title="${esc(t('Outside canvas; restored when the image fit changes'))}"` : ''}><span>${index + 1}</span><span>${esc(label(item.label))}${ui.outside ? ' <i class="fa-solid fa-crop-simple" aria-hidden="true"></i>' : ''}<small>${esc(item.label === 'text' ? item.text || item.caption : item.caption)}</small></span></button>
                  ${icon('lock', ui.locked ? 'lock' : 'lock-open', ui.locked ? 'Unlock region' : 'Lock region', extra('locked'))}
                  ${icon('hide', ui.hidden ? 'eye-slash' : 'eye', ui.hidden ? 'Show region on canvas' : 'Hide region on canvas (still included in generation)', extra('hidden'))}
                </div>`;
            }).join('');
            list.scrollTop = scrollTop;
        }
        function render({ revealSelected = true } = {}) {
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
            q('[data-rjp-action="delete"]').disabled = !item || regionUi[selected].locked;
            if (item) {
                q('[data-rjp-selection]').textContent = t('Region {number}').replace('{number}', selected + 1);
                for (const key of ['label', 'caption', 'text']) q(`[data-rjp-field="${key}"]`).value = item[key] || '';
                q('[data-rjp-field="palette"]').value = (item.palette || []).join(', ');
                q('[data-rjp-palette-color]').value = regionColor(item, selected);
                q('[data-rjp-text-wrap]').hidden = item.label !== 'text';
                host.querySelectorAll('[data-rjp-coordinate]').forEach(node => {
                    node.value = item.bbox[Number(node.dataset.rjpCoordinate)];
                    node.disabled = regionUi[selected].locked || regionUi[selected].outside === true;
                });
            }
            updateOutput();
            renderAiPreview();
            renderAiMode();
            renderReference();
            if (tab === 'layout') draw();
            if (revealSelected) revealSelectedRegion();
            persistDraft();
        }
        q('[data-rjp-details]').addEventListener('toggle', () => {
            if (closed) return;
            revealSelectedRegion();
            persistDraft();
        });
        function close(preserve = true) {
            if (closed) return;
            if (gesture) endGesture();
            if (preserve) persistDraft();
            else {
                try { options.onDraftChange?.(null); } catch (_) {}
            }
            closed = true;
            referenceAbort?.abort();
            for (const [name, handler] of referenceEvents) root.removeEventListener?.(name, handler, true);
            aiGeneration++;
            referenceRevision++;
            referenceImage = null;
            aiPreview = null;
            windowMaximized = maximized;
            if (maximized && restoreFrame && (!compactWindow() || restoreFrame.width > 700)) windowFrame = { ...restoreFrame };
            else if (!compactWindow() && dialog.dataset.simpleaiResizeManaged === '1') {
                const rect = dialog.getBoundingClientRect();
                windowFrame = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            }
            popupFrame?.destroy?.();
            root.removeEventListener?.('resize', syncWindowViewport);
            root.removeEventListener?.('pagehide', persistDraft);
            observer?.disconnect();
            host.remove();
            if (active?.host === host) active = null;
            if (previousFocus?.isConnected) previousFocus.focus();
        }
        function loadRaw(replace = false) {
            const result = importLayout(raw.value, draft.width, draft.height);
            let next = result.draft;
            const previousItems = draft.items;
            const current = editableDraft();
            if (replace || JSON.stringify(next) !== JSON.stringify(current)) {
                remember();
                if (!replace && next.width === draft.width && next.height === draft.height
                    && next.items.length === current.items.length) {
                    let visibleIndex = 0;
                    next.items = draft.items.map((item, index) =>
                        regionUi[index].outside ? clone(item) : next.items[visibleIndex++]);
                } else if (!replace && next.width === draft.width && next.height === draft.height
                    && regionUi.some(item => item.outside)) {
                    const items = [], flags = [];
                    let visibleIndex = 0;
                    draft.items.forEach((item, index) => {
                        if (regionUi[index].outside) {
                            items.push(clone(item)); flags.push(clone(regionUi[index]));
                        } else if (visibleIndex < next.items.length) {
                            items.push(next.items[visibleIndex++]); flags.push({ locked: false, hidden: false });
                        }
                    });
                    while (visibleIndex < next.items.length) {
                        items.push(next.items[visibleIndex++]); flags.push({ locked: false, hidden: false });
                    }
                    next = validateDraft({ ...next, items }, true, true);
                    regionUi = flags;
                } else regionUi = normalizeRegionUi(null, next.items.length);
            } else next = draft;
            draft = next;
            draft.items.forEach((item, index) => {
                if (!regionUi[index]?.sourceBox || JSON.stringify(item.bbox) !== JSON.stringify(previousItems[index]?.bbox))
                    updateAnchor(index);
            });
            if (result.canvasChanged) fixedCanvas = { width: draft.width, height: draft.height };
            imported = result;
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
            if (next === 'json' && tab !== 'json' && !rawDirty) raw.value = JSON.stringify(editableDraft(), null, 2);
            tab = next;
            render();
            if (loadError) {
                status({ message: 'JSON could not be loaded. Your JSON edits are preserved; the previous layout is shown.',
                    field: loadError.field || loadError.message });
            } else importStatus();
        }
        function addRegion() {
            requireValue(draft.items.length < 200, 'Too many regions');
            remember();
            const label = q('[data-rjp-add-type]').value;
            draft.items.push({ label, caption: '', ...(label === 'text' ? { text: '' } : {}),
                bbox: [draft.width / 4, draft.height / 4, draft.width * 3 / 4, draft.height * 3 / 4] });
            regionUi.push({ locked: false, hidden: false });
            selected = draft.items.length - 1;
            updateAnchor(selected);
            render();
            q('[data-rjp-field="caption"]').focus();
        }
        let applying = false;
        async function action(name, index = selected) {
            try {
                if (closed || (name === 'apply' && (applying || optimizing))) return;
                if (name === 'close') return close();
                if (name === 'maximize') return toggleMaximize();
                if (name === 'optimize') return await optimize();
                if (name === 'upload-reference' && !optimizing && !loadingReference && !applying) q('[data-rjp-reference-file]').click();
                if (name === 'remove-reference' && !optimizing && !loadingReference) {
                    await setReference(null);
                }
                if (name === 'toggle-reference' && reference) {
                    reference.visible = !reference.visible;
                    renderReference(); rememberReference(); draw();
                }
                if (name === 'discard-optimization') {
                    aiPreview = null; renderAiPreview(); status();
                }
                if (name === 'apply-optimization' && aiPreview) {
                    const preview = aiPreview;
                    try { assertAiSnapshot(preview.snapshot, preview.request, preview.selection); }
                    catch (error) { aiPreview = null; renderAiPreview(); throw error; }
                    remember();
                    draft = clone(preview.next);
                    optimizedSnapshot = JSON.stringify(draft);
                    raw.value = JSON.stringify(editableDraft(), null, 2);
                    rawDirty = false;
                    aiPreview = null;
                    render();
                    status({ message: 'Suggestions applied to layout.' }, false);
                }
                if (name === 'select' || name === 'draw') { mode = name; render(); }
                if (name === 'add') addRegion();
                if ((name === 'lock' || name === 'hide') && Number.isInteger(index) && regionUi[index]) {
                    remember();
                    const key = name === 'lock' ? 'locked' : 'hidden';
                    regionUi[index][key] = !regionUi[index][key];
                    render({ revealSelected: false });
                    q(`[data-rjp-action="${name}"][data-rjp-index="${index}"]`)?.focus({ preventScroll: true });
                }
                if (name === 'undo' && undo.length) { redo.push(capture()); restore(undo.pop()); selected = Math.min(selected, draft.items.length - 1); render(); }
                if (name === 'redo' && redo.length) { undo.push(capture()); restore(redo.pop()); selected = Math.min(selected, draft.items.length - 1); render(); }
                if ((name === 'delete' || name === 'duplicate') && draft.items[selected]) {
                    if (name === 'delete' && regionUi[selected].locked) return;
                    if (name === 'duplicate') requireValue(draft.items.length < 200, 'Too many regions');
                    remember();
                    if (name === 'delete') {
                        draft.items.splice(selected, 1); regionUi.splice(selected, 1);
                        selected = Math.min(selected, draft.items.length - 1);
                    }
                    else {
                        draft.items.splice(selected + 1, 0, clone(draft.items[selected]));
                        regionUi.splice(selected + 1, 0, { ...clone(regionUi[selected]), locked: false, hidden: false }); selected++;
                    }
                    render();
                }
                if (name === 'load-json') { loadRaw(); render(); importStatus(); }
                if (name === 'reset-json') { raw.value = JSON.stringify(editableDraft(), null, 2); rawDirty = false; status(); }
                if (name === 'scale') {
                    if (rawDirty) loadRaw();
                    const size = options.currentSize?.() || { width: options.width, height: options.height };
                    remember();
                    if (reference) resizeReferenceCanvas(size.width, size.height);
                    else draft = scaleDraft(draft, size.width, size.height);
                    raw.value = JSON.stringify(editableDraft(), null, 2); render();
                }
                if (name === 'fit-canvas') {
                    if (rawDirty) loadRaw();
                    requireValue(editableDraft().items.length, 'Add a region', 'items');
                    const result = importLayout(compile(editableDraft(), { allowIncomplete: true }),
                        draft.width, draft.height, { fitToBounds: true });
                    const dx = (result.draft.width - draft.width) / 2;
                    const dy = (result.draft.height - draft.height) / 2;
                    if (dx || dy) {
                        remember();
                        if (reference) {
                            setFrame(referenceFit === 'match' ? 'contain' : referenceFit,
                                result.draft.width, result.draft.height, false);
                        } else {
                            const next = clone(draft);
                            next.width = result.draft.width; next.height = result.draft.height;
                            next.items.forEach(item => { item.bbox = item.bbox.map((value, index) => value + (index % 2 ? dy : dx)); });
                            draft = next;
                        }
                        fixedCanvas = { width: draft.width, height: draft.height };
                        rememberReference();
                    }
                    imported = { ...result, draft };
                    raw.value = JSON.stringify(editableDraft(), null, 2); rawDirty = false;
                    render(); importStatus();
                }
                if (name === 'import') q('[data-rjp-file]').click();
                if (name === 'export') {
                    if (rawDirty) loadRaw();
                    validateDraft(editableDraft(), true, true);
                    const url = URL.createObjectURL(new Blob([JSON.stringify(editableDraft(), null, 2)], { type: 'application/json' }));
                    const link = document.createElement('a');
                    link.href = url; link.download = 'moss-layout.json'; link.click();
                    root.setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
                if (name === 'copy' || name === 'apply') {
                    if (rawDirty) loadRaw();
                    const output = editableDraft();
                    requireValue(!draft.items.length || output.items.length || output.summary.caption.trim(),
                        'All regions are outside the canvas');
                    const prompt = compile(output, { allowIncomplete: true });
                    if (name === 'copy') await navigator.clipboard.writeText(prompt);
                    else {
                        const button = q('[data-rjp-action="apply"]');
                        applying = true;
                        button.disabled = true;
                        try {
                            if (await options.onApply?.({
                                prompt, draft: output, width: draft.width, height: draft.height,
                                referenceLayout: { version: 1, ...capture() },
                                optimized: optimizedSnapshot === JSON.stringify(draft),
                            }) !== false) close(false);
                        } finally {
                            applying = false;
                            button.disabled = false;
                        }
                    }
                }
            } catch (error) { status(error); }
            finally { persistDraft(); }
        }
        host.addEventListener('click', event => {
            const button = event.target.closest('button,[data-rjp-action="close"]');
            if (!button) return;
            if (button.dataset.rjpAction) void action(button.dataset.rjpAction,
                button.dataset.rjpIndex === undefined ? selected : Number(button.dataset.rjpIndex));
            if (button.dataset.rjpTab) {
                try { setTab(button.dataset.rjpTab); } catch (error) { status(error); }
            }
            if (button.dataset.rjpRegion !== undefined) { selected = Number(button.dataset.rjpRegion); render(); }
        });
        function updateField(event) {
            if (closed) return;
            if (event.target === raw) { rawDirty = true; persistDraft(); return; }
            if (event.target === q('[data-rjp-reference-fit]')) {
                try { changeReferenceFit(event.target.value); }
                catch (error) { renderReference(); status(error); }
                return;
            }
            if (event.target === q('[data-rjp-reference-opacity]') && reference) {
                reference.opacity = Math.max(0, Math.min(1, Number(event.target.value) / 100));
                rememberReference(); draw(); return;
            }
            if (event.target === q('[data-rjp-ai-mode]')) {
                aiPreview = null; renderAiPreview(); renderAiMode(); persistDraft(); return;
            }
            if (event.target === q('[data-rjp-ai-scope]') || event.target === q('[data-rjp-ai-instruction]')) {
                persistDraft(); return;
            }
            const field = event.target.dataset.rjpField;
            const coordinate = event.target.dataset.rjpCoordinate;
            if (!field && coordinate === undefined) return;
            if (coordinate !== undefined && (regionUi[selected]?.locked || regionUi[selected]?.outside)) return;
            // Blur repeats the last input as change; replacing rows here would discard the pending button click.
            const currentItem = draft.items[selected], value = event.target.value;
            if ((coordinate !== undefined && currentItem?.bbox[Number(coordinate)] === Number(value))
                || (['width', 'height'].includes(field) && draft[field] === Number(value))
                || (field === 'summary' && draft.summary.caption === value)
                || (['label', 'caption', 'text'].includes(field) && (currentItem?.[field] || '') === value)
                || (field === 'palette_color' && currentItem?.palette?.[0] === value)
                || (field === 'palette' && JSON.stringify(currentItem?.palette || [])
                    === JSON.stringify(value.split(',').map(entry => entry.trim()).filter(Boolean)))) return;
            const changedType = field === 'label' && draft.items[selected]?.label !== event.target.value;
            if (editingField !== event.target || changedType) { remember(); editingField = event.target; }
            if (field === 'width' || field === 'height') {
                const value = Number(event.target.value);
                try {
                    const width = field === 'width' ? value : draft.width, height = field === 'height' ? value : draft.height;
                    dimensions(width, height);
                    if (reference) resizeReferenceCanvas(width, height, field);
                    else { draft[field] = value; fixedCanvas = { width: draft.width, height: draft.height }; }
                }
                catch (error) {
                    if (event.type === 'change') render();
                    status(error); return;
                }
            } else if (field === 'summary') draft.summary.caption = event.target.value;
            else if (draft.items[selected]) {
                const item = draft.items[selected];
                if (coordinate !== undefined) {
                    item.bbox[Number(coordinate)] = Number(event.target.value);
                    updateAnchor(selected);
                }
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
            persistDraft();
        }
        host.addEventListener('input', updateField);
        host.addEventListener('change', updateField);
        host.addEventListener('focusout', event => { if (editingField === event.target) editingField = null; });
        q('[data-rjp-file]').addEventListener('change', async event => {
            const file = event.target.files[0];
            if (!file) return;
            try {
                requireValue(file.size <= 2 * 1024 * 1024, 'Layout JSON is too large');
                const text = await file.text();
                if (closed) return;
                raw.value = text; rawDirty = true; loadRaw(true); tab = 'layout'; render(); importStatus();
            } catch (error) { tab = 'json'; render(); status(error); }
            finally { persistDraft(); }
            event.target.value = '';
        });
        async function loadReference(source) {
            if (closed) return;
            if (optimizing || loadingReference || applying) {
                status({ message: 'Wait for the current operation before adding a reference image.' }, false);
                return;
            }
            loadingReference = true;
            referenceAbort = new root.AbortController();
            const timer = root.setTimeout(() => referenceAbort?.abort(), 15000);
            q('[data-rjp-action="upload-reference"]').disabled = true;
            q('[data-rjp-action="remove-reference"]').disabled = true;
            renderReference();
            status({ message: 'Loading reference image...' }, false);
            try {
                const file = typeof source === 'string' ? await referenceFileFromUrl(source, referenceAbort.signal) : source;
                const value = await readReferenceFile(file);
                if (closed) return;
                options.assertContext?.();
                await setReference(value);
                if (closed) return;
                q('[data-rjp-ai-mode]').value = 'image';
                tab = 'layout';
                render();
                aiPreview = null; renderAiPreview(); renderAiMode();
                status(); persistDraft();
            } catch (error) {
                if (!closed) status(referenceAbort.signal.aborted
                    ? { message: 'Reference image loading timed out' }
                    : ['TypeError', 'AbortError'].includes(error.name)
                        ? { message: 'Reference image could not be loaded' } : error);
            }
            finally {
                root.clearTimeout(timer);
                referenceAbort = null;
                loadingReference = false;
                q('[data-rjp-action="upload-reference"]').disabled = optimizing;
                q('[data-rjp-action="remove-reference"]').disabled = optimizing;
                if (!closed) renderReference();
            }
        }
        q('[data-rjp-reference-file]').addEventListener('change', async event => {
            const file = event.target.files[0];
            if (file) await loadReference(file);
            event.target.value = '';
        });
        function showReferenceDrop(show) {
            const overlay = q('[data-rjp-reference-drop]');
            overlay.hidden = !show;
            overlay.setAttribute('aria-hidden', String(!show));
            q('[data-rjp-drop-label]').textContent = t(optimizing || loadingReference || applying
                ? 'Wait for the current operation before adding a reference image.' : 'Drop reference image here');
            if (!show) referenceDragDepth = 0;
        }
        function referenceTransferAvailable(transfer) {
            return !!transfer && (transfer.files?.length
                || Array.from(transfer.items || []).some(item => item.kind === 'file')
                || Array.from(transfer.types || []).some(type => [
                    'files', 'text/uri-list', 'text/html', 'application/x-simpleai-gallery-original-url',
                ].includes(String(type).toLowerCase())));
        }
        function claimReferenceEvent(event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
        }
        function handleReferenceDrag(event) {
            if (closed || !host.contains(event.target) || !referenceTransferAvailable(event.dataTransfer)) return;
            claimReferenceEvent(event);
            event.dataTransfer.dropEffect = optimizing || loadingReference || applying ? 'none' : 'copy';
            referenceDragDepth = event.type === 'dragenter' ? referenceDragDepth + 1 : Math.max(1, referenceDragDepth);
            showReferenceDrop(true);
        }
        function clearReferenceDrop() { showReferenceDrop(false); }
        const referenceEvents = [
            ['dragenter', handleReferenceDrag], ['dragover', handleReferenceDrag],
            ['dragleave', event => {
                if (!host.contains(event.target)) return;
                referenceDragDepth--;
                if (referenceDragDepth <= 0 && !host.contains(event.relatedTarget)) clearReferenceDrop();
            }],
            ['drop', event => {
                if (closed || !host.contains(event.target)) return;
                const transfer = event.dataTransfer;
                if (!referenceTransferAvailable(transfer)) return;
                const files = referenceTransferFiles(transfer);
                const image = files.find(file => /^image\//i.test(file.type)
                    || (!file.type || file.type === 'application/octet-stream') && /\.(?:png|jpe?g|webp)$/i.test(file.name));
                const source = image || (!files.length && referenceTransferUrl(transfer));
                clearReferenceDrop();
                if (!files.length && !source) return;
                claimReferenceEvent(event);
                if (source) void loadReference(source);
                else status({ message: 'Choose a PNG, JPEG or WebP reference image' });
            }],
            ['paste', event => {
                if (closed || event.defaultPrevented || !host.contains(event.target)) return;
                const file = referenceTransferFiles(event.clipboardData).find(file => /^image\//i.test(file.type)
                    || (!file.type || file.type === 'application/octet-stream') && /\.(?:png|jpe?g|webp)$/i.test(file.name));
                if (!file) return;
                claimReferenceEvent(event);
                clearReferenceDrop();
                void loadReference(file);
            }],
            ['dragend', clearReferenceDrop], ['blur', clearReferenceDrop],
        ];
        for (const [name, handler] of referenceEvents) root.addEventListener?.(name, handler, true);
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
            const [x, y] = point(event), before = capture();
            let handle = null;
            const tolerance = 10 * draft.width / canvas.getBoundingClientRect().width;
            const box = draft.items[selected]?.bbox;
            if (mode === 'select' && box && !regionUi[selected].hidden && !regionUi[selected].outside && !regionUi[selected].locked) {
                handle = [[0, 1], [2, 1], [0, 3], [2, 3]].find(([xi, yi]) =>
                    Math.abs(x - box[xi]) <= tolerance && Math.abs(y - box[yi]) <= tolerance);
            }
            if (mode === 'draw') {
                if (draft.items.length >= 200) return;
                const label = q('[data-rjp-add-type]').value;
                draft.items.push({ label, caption: '', ...(label === 'text' ? { text: '' } : {}), bbox: [x, y, x, y] });
                regionUi.push({ locked: false, hidden: false });
                selected = draft.items.length - 1;
            } else if (!handle) {
                selected = draft.items.findLastIndex((item, index) => !regionUi[index].hidden && !regionUi[index].outside
                    && x >= item.bbox[0] && x <= item.bbox[2] && y >= item.bbox[1] && y <= item.bbox[3]);
            }
            gesture = selected < 0 || regionUi[selected].locked ? null
                : { before, start: [x, y], bbox: [...draft.items[selected].bbox], handle, draw: mode === 'draw' };
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
            if (cancel || !box || box[2] - box[0] < 1 || box[3] - box[1] < 1) restore(gesture.before);
            else if (JSON.stringify(draft) !== JSON.stringify(gesture.before.draft)) {
                updateAnchor(selected);
                remember(gesture.before);
            }
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
        if (typeof root.installResizablePopup === 'function') {
            popupFrame = root.installResizablePopup(dialog, {
                modal: host, dragHandle: q('.sai-rjp-dialog > header'),
                minWidth: 720, minHeight: 480, margin: 12,
                disabled: () => maximized || compactWindow(), isHidden: () => closed || host.isConnected === false,
                resizeLabel: t('Resize window'),
            });
            q('#sai-rjp-title').title = t('Drag window');
            if (windowFrame && !compactWindow()) {
                for (const [key, value] of Object.entries(windowFrame)) dialog.style.setProperty(key, `${value}px`, 'important');
                dialog.dataset.simpleaiResizeManaged = '1';
            }
        }
        root.addEventListener?.('resize', syncWindowViewport);
        syncMaximizeControl();
        if (windowMaximized) toggleMaximize();
        else syncWindowViewport();
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (tab === 'layout') draw(); }) : null;
        observer?.observe(viewport);
        active = { host, close };
        root.addEventListener?.('pagehide', persistDraft);
        render();
        if (options.reference) void setReference(options.reference, true).catch(error => { if (!closed) status(error); });
        if (initialError) status(initialError);
        else if (restored) status({ message: 'Draft restored.' }, false);
        else importStatus();
        q('button[data-rjp-action="close"]').focus();
        return host;
    }
    const api = {
        open, compile, parse, importLayout, validateDraft, scaleDraft, regionColor, wrapPreviewText, fitPreviewText,
        optimizationRequest, mergeOptimization, normalizeSnapshot,
        referencePlacement, matchedReferenceSize, reframeReference, visibleDraft, annotatedReferenceDraft,
        generationRequest, generationResult,
    };
    root.SimpAIRegionalJsonPrompt = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
