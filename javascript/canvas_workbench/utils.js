(function () {
    'use strict';

    function uid(prefix, options) {
        const rnd = Math.random().toString(16).slice(2, 8);
        const nowSource = options && typeof options === 'object' ? options.now : null;
        const timestamp = typeof nowSource === 'function' ? Number(nowSource()) : Date.now();
        const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
        return `${prefix}_${safeTimestamp.toString(36)}_${rnd}`;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function formatLocalTime(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value || '');
        return date.toLocaleString();
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizePresetName(name) {
        return String(name || '').replace(/\u2B07/g, '').trim();
    }

    function sanitizeStoragePart(value) {
        return String(value || 'guest')
            .trim()
            .replace(/[^a-zA-Z0-9_.:-]/g, '_')
            .slice(0, 80) || 'guest';
    }

    function shortIdentity(value) {
        const text = String(value || '').trim();
        if (!text) return 'guest';
        if (text.length <= 18) return text;
        return `${text.slice(0, 8)}...${text.slice(-6)}`;
    }

    function formatBytes(bytes) {
        const value = Number(bytes || 0);
        if (!Number.isFinite(value) || value <= 0) return '';
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        return `${(value / 1024 / 1024).toFixed(1)} MB`;
    }

    function readCookie(name) {
        if (window.SimpAII18n?.readCookie) return window.SimpAII18n.readCookie(name);
        try {
            const prefix = `${name}=`;
            const item = String(document.cookie || '')
                .split(';')
                .map(part => part.trim())
                .find(part => part.startsWith(prefix));
            if (!item) return '';
            const raw = item.slice(prefix.length);
            try {
                return decodeURIComponent(raw);
            } catch (err) {
                return raw;
            }
        } catch (err) {
            return '';
        }
    }

    function getUiLang(source) {
        if (window.SimpAII18n?.getUiLang) return window.SimpAII18n.getUiLang(source);
        const params = window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === 'object'
            ? window.simpleaiTopbarSystemParams
            : {};
        const candidates = [
            source && typeof source === 'object' ? source.__lang : source,
            source && typeof source === 'object' ? source.lang : '',
            source && typeof source === 'object' ? source.language : '',
            source && typeof source === 'object' ? source.__language : '',
            params.__lang,
            params.lang,
            params.language,
            params.__language
        ];
        try {
            const search = new URLSearchParams(window.location.search || '');
            candidates.push(search.get('__lang'));
        } catch (err) {}
        if (typeof window.locale_lang === 'string') candidates.push(window.locale_lang);
        try {
            candidates.push(localStorage.getItem('ailang'));
        } catch (err) {}
        candidates.push(readCookie('ailang'));
        const raw = candidates.map(value => String(value || '').trim().toLowerCase()).find(Boolean) || 'en';
        return raw.startsWith('en') ? 'en' : 'cn';
    }

    function isEnglishUi(source) {
        return getUiLang(source) === 'en';
    }

    function t(en, cn, langSource) {
        if (window.SimpAII18n?.t) return window.SimpAII18n.t(en, cn, langSource);
        const source = String(en ?? '');
        if (isEnglishUi(langSource)) return source;
        const dict = window.localization && typeof window.localization === 'object' ? window.localization : {};
        return dict[source] || String(cn ?? source);
    }

    function localizeValue(value, fallback, source) {
        if (window.SimpAII18n?.localize) return window.SimpAII18n.localize(value, fallback, source);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return t(value.en ?? fallback ?? '', value.cn ?? value.zh ?? fallback ?? value.en ?? '', source);
        }
        return String(value ?? fallback ?? '');
    }

    function tOption(value, cnMap, langSource) {
        const source = String(value ?? '');
        if (!source || isEnglishUi(langSource)) return source;
        if (cnMap && Object.prototype.hasOwnProperty.call(cnMap, source)) return cnMap[source];
        const dict = window.localization && typeof window.localization === 'object' ? window.localization : {};
        return dict[source] || source;
    }

    window.SimpAICanvasWorkbenchUtils = {
        uid,
        nowIso,
        formatLocalTime,
        clamp,
        escapeHtml,
        normalizePresetName,
        sanitizeStoragePart,
        shortIdentity,
        formatBytes,
        getUiLang,
        isEnglishUi,
        t,
        localizeValue,
        tOption
    };
})();
