(function () {
    'use strict';

    const MAX_FILE_BYTES = 256 * 1024;
    const MAX_TEXT_CHARS = 128000;
    const MAX_PENDING = 8;
    const MAX_TURN_CHARS = 256000;
    const MAX_CONTEXT_CHARS = 512000;
    const MAX_CONTEXT_FILES = 24;
    const reference = /^chat-document:[A-Za-z0-9_.:-]{1,160}$/;
    const supported = file => /\.(txt|md|json)$/i.test(String(file?.name || ''));

    function normalize(document, options = {}) {
        if (!document || typeof document !== 'object' || !reference.test(String(document.ref || ''))) return null;
        const rawName = String(document.name || '').split(/[/\\]/).pop();
        if (!supported({ name: rawName })) return null;
        const extension = rawName.split('.').pop();
        const name = rawName.length > 180 ? rawName.slice(0, 179 - extension.length) + '.' + extension : rawName;
        const hasText = typeof document.text === 'string' && document.text.length <= MAX_TEXT_CHARS;
        const available = !options.metadataOnly && document.available !== false && hasText;
        return {
            ref: document.ref, name, kind: name.split('.').pop().toLowerCase(),
            text: available ? document.text : '', available,
            chars: available ? document.text.length : Math.max(0, Math.min(MAX_TEXT_CHARS, Number(document.chars) || 0)),
            size_bytes: Math.max(0, Math.min(MAX_FILE_BYTES, Number(document.size_bytes) || 0)),
            encoding: String(document.encoding || 'utf-8').slice(0, 20),
        };
    }

    async function read(file, ref) {
        if (!supported(file)) throw new Error('document_type');
        if (file.size > MAX_FILE_BYTES) throw new Error('document_size');
        const bytes = new Uint8Array(await file.arrayBuffer());
        let encoding = 'utf-8';
        if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
        if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
        let text;
        try {
            text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
        } catch {
            throw new Error('document_encoding');
        }
        if (text.includes('\0')) throw new Error('document_encoding');
        if (text.length > MAX_TEXT_CHARS) throw new Error('document_size');
        return normalize({ ref, name: file.name, text, size_bytes: file.size, encoding });
    }

    function context(documents, current, message = '') {
        const currentRefs = new Set(current.map(item => item.ref));
        const mentioned = String(message || '').toLowerCase();
        const candidates = [
            ...current,
            ...documents.filter(item => mentioned.includes(String(item.name).toLowerCase())),
            ...documents,
        ];
        const result = [], seen = new Set();
        let chars = 0;
        for (const item of candidates) {
            const document = normalize(item);
            if (!document || seen.has(document.ref) || result.length >= MAX_CONTEXT_FILES) continue;
            if (chars + document.text.length > MAX_CONTEXT_CHARS) continue;
            seen.add(document.ref);
            chars += document.text.length;
            result.push({ ...document, current: currentRefs.has(document.ref) });
        }
        return result;
    }

    window.SimpAIChatDocuments = Object.freeze({
        MAX_FILE_BYTES, MAX_TEXT_CHARS, MAX_PENDING, MAX_TURN_CHARS, MAX_CONTEXT_FILES,
        supported, normalize, read, context,
    });
})();
