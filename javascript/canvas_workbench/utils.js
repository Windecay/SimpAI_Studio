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

    function stableStringify(value) {
        if (value === null || value === undefined) return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
        if (typeof value === 'object') {
            return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
        }
        return JSON.stringify(value);
    }

    function stableHash(value) {
        const text = typeof value === 'string' ? value : stableStringify(value);
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
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

    function isOutfitTransferRequest(value) {
        const clothes = '(?:衣服|服装|外套|夹克|衬衫|裙子|连衣裙|西装|裤子|上衣|套装)';
        const pattern = new RegExp(
            '换装|换衣(?!服?(?:的)?(?:颜色|图案|材质))|服装迁移|衣服迁移|'
            + `(?:穿上|换上|改穿|穿到|换到|换成|更换|替换).{0,28}${clothes}|${clothes}.{0,28}(?:穿上|换上|穿到|换到|换成|穿在)|`
            + '\\b(?:outfit|clothing|clothes|garment)[-_ ]+(?:swap|transfer)\\b|'
            + '\\b(?:wear|put\\s+on|swap|replace|transfer|change\\s+into)\\b.{0,40}\\b(?:outfit|clothes|clothing|garment|coat|jacket|shirt|dress|suit|trousers|pants)\\b|'
            + '\\bput\\b.{0,40}\\b(?:outfit|clothes|clothing|garment|coat|jacket|shirt|dress|suit|trousers|pants)\\b.{0,24}\\bon(?:to)?\\b|'
            + '\\bdress\\b.{0,40}\\b(?:person|woman|man|character|model)\\b', 'i'
        );
        const attributeEdit = new RegExp(
            `${clothes}(?:的|上(?:的)?)?(?:颜色|色彩|配色|材质|纹理|图案)|`
            + '(?:颜色|色彩|配色|材质|纹理|图案).{0,12}迁移|'
            + '\\b(?:color|colour|texture|material|pattern)\\s+transfer\\b|'
            + '\\b(?:change|replace|swap|transfer|apply|copy)\\b.{0,45}\\b(?:color|colour|texture|material|pattern)\\b', 'i'
        );
        return String(value || '').split(/[，,。.!?;；！？\n]|但是|但|并且|\b(?:and|but)\b/i).some(part => {
            const text = part.trim();
            const match = pattern.exec(text);
            if (!match || attributeEdit.test(text)) return false;
            return !/(?:不要|别|不用|不需要|无需|保持|保留|\b(?:keep|preserve|retain|not|never)\b|don't\b)/i.test(text.slice(0, match.index));
        });
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

    const COMMON_CANVAS_LABELS_CN = {
        preset: '预设',
        Preset: '预设',
        image: '图像',
        Image: '图像',
        video: '视频',
        Video: '视频',
        audio: '音频',
        Audio: '音频',
        scene: '场景',
        Scene: '场景',
        Basic: '基础',
        basic: '基础',
        workflow: '工作流',
        Workflow: '工作流',
        Theme: '主题',
        theme: '主题',
        Mode: '模式',
        mode: '模式',
        Current: '当前',
        Mask: '遮罩',
        mask: '遮罩',
        'Advanced Masking': '高级遮罩',
        'Source Image': '源图像',
        'Image source': '图像来源',
        'Video source': '视频来源',
        'No mask generated': '尚未生成遮罩',
        'Tag Cart': '标签选择器',
        tag_cart: '标签选择器',
        Tags: '标签',
        tags: '标签',
        'Media Browser': '媒体浏览器',
        media_browser: '媒体浏览器',
        Browser: '浏览器',
        Result: '结果',
        Output: '输出',
        Wildcards: '通配符'
    };

    function localizeCanvasLabel(value, cnMap, langSource) {
        const text = String(value ?? '').trim();
        if (!text) return '';
        return tOption(text, Object.assign({}, COMMON_CANVAS_LABELS_CN, cnMap || {}), langSource);
    }

    function localizedDefaultTitle(value, defaultEn, defaultCn, langSource) {
        const text = String(value || '').trim();
        if (!text || text === defaultEn) return t(defaultEn, defaultCn, langSource);
        return text;
    }

    function workbenchStaticFilePath(path, documentRef) {
        const rel = String(path || '').replace(/^\/+/, '');
        if (!rel) return '';
        const doc = documentRef || (typeof document !== 'undefined' ? document : null);
        const script = doc?.currentScript || doc?.querySelector?.('script[src*="javascript/infinite_canvas_workbench.js"]');
        const src = script?.getAttribute?.('src') || '';
        const marker = 'file=';
        const markerIndex = src.indexOf(marker);
        if (markerIndex >= 0) return `${src.slice(0, markerIndex + marker.length)}${rel}`;
        return `/${rel}`;
    }

    function resolveWorkbenchStaticPath(path, documentRef) {
        const value = String(path || '').trim();
        if (!value || /^(https?:|data:|blob:|\/)/i.test(value)) return value;
        return workbenchStaticFilePath(value, documentRef);
    }

    function localizeMaskStatus(value, langSource) {
        const text = String(value || '').trim();
        if (!text) return '';
        return tOption(text, {
            'Connect a source image, then generate a black/white mask.': '连接源图像后生成黑白遮罩。',
            'Source image connected.': '源图像已连接。',
            'Generating mask...': '正在生成遮罩...',
            'Mask generated.': '遮罩已生成。',
            'Mask generation failed.': '遮罩生成失败。',
            'Mask model changed. Generate a new mask.': '遮罩模型已更改，请重新生成遮罩。'
        }, langSource);
    }

    window.SimpAICanvasWorkbenchUtils = {
        uid,
        nowIso,
        formatLocalTime,
        clamp,
        stableStringify,
        stableHash,
        escapeHtml,
        normalizePresetName,
        isOutfitTransferRequest,
        sanitizeStoragePart,
        shortIdentity,
        formatBytes,
        getUiLang,
        isEnglishUi,
        t,
        localizeValue,
        tOption,
        localizeCanvasLabel,
        localizedDefaultTitle,
        workbenchStaticFilePath,
        resolveWorkbenchStaticPath,
        localizeMaskStatus
    };
})();
