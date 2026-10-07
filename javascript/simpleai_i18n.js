(function () {
    'use strict';

    function readCookie(name) {
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

    function collectLangCandidates(source) {
        const candidates = [];
        const pushFrom = (value) => {
            if (!value) return;
            if (typeof value === 'string') {
                candidates.push(value);
                return;
            }
            if (typeof value !== 'object') return;
            candidates.push(value.__lang, value.lang, value.language, value.__language, value.locale);
            if (value.state && typeof value.state === 'object') pushFrom(value.state);
            if (value.settings && typeof value.settings === 'object') pushFrom(value.settings);
        };
        pushFrom(source);
        pushFrom(window.simpleaiTopbarSystemParams);
        try {
            const search = new URLSearchParams(window.location.search || '');
            candidates.push(search.get('__lang'), search.get('lang'), search.get('language'));
        } catch (err) {}
        // The page bootstrap declares locale_lang with let, so it is not a
        // window property. Use that initial language before UI state arrives.
        if (typeof locale_lang === 'string') candidates.push(locale_lang);
        try {
            candidates.push(localStorage.getItem('ailang'));
        } catch (err) {}
        candidates.push(readCookie('ailang'));
        return candidates;
    }

    function normalizeLang(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return '';
        if (raw.startsWith('en')) return 'en';
        if (raw.startsWith('cn') || raw.startsWith('zh')) return 'cn';
        return '';
    }

    function getUiLang(source) {
        const match = collectLangCandidates(source)
            .map(normalizeLang)
            .find(Boolean);
        return match || 'en';
    }

    function isEnglishUi(source) {
        return getUiLang(source) === 'en';
    }

    function t(en, cn, source) {
        const english = String(en ?? '');
        if (isEnglishUi(source)) return english;
        const dict = window.localization && typeof window.localization === 'object' ? window.localization : {};
        return dict[english] || String(cn ?? english);
    }

    function localize(value, fallback, source) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const en = value.en ?? value.english ?? fallback ?? '';
            const cn = value.cn ?? value.zh ?? value.zh_CN ?? value.chinese ?? fallback ?? en;
            return t(en, cn, source);
        }
        const text = String(value ?? fallback ?? '');
        if (!text || isEnglishUi(source)) return text;
        const dict = window.localization && typeof window.localization === 'object' ? window.localization : {};
        return dict[text] || text;
    }

    window.SimpAII18n = Object.assign({}, window.SimpAII18n || {}, {
        readCookie,
        normalizeLang,
        getUiLang,
        isEnglishUi,
        t,
        localize
    });
})();
