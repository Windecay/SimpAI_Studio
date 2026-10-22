(function () {
    'use strict';

    const UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const studioEndpointUrl = UTILS.studioEndpointUrl || (url => url);
    const escapeHtml = UTILS.escapeHtml || ((value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])));
    const SAMPLE_PART_OPTIONS = [
        ['OnlyExpression', 'Expression', '表情'],
        ['OnlyRotation', 'Rotation', '头部旋转'],
        ['OnlyMouth', 'Mouth', '嘴部'],
        ['OnlyEyes', 'Eyes', '眼睛'],
        ['All', 'All', '全部']
    ];
    const PARAM_GROUPS = [
        {
            title: ['Rotation', '旋转'],
            items: [
                ['rotate_pitch', 'Pitch', '俯仰', 0, -20, 20, 0.5],
                ['rotate_yaw', 'Yaw', '左右转头', 0, -20, 20, 0.5],
                ['rotate_roll', 'Roll', '歪头', 0, -20, 20, 0.5]
            ]
        },
        {
            title: ['Eyes', '眼睛'],
            items: [
                ['blink', 'Blink', '眨眼', 0, -20, 5, 0.5],
                ['eyebrow', 'Eyebrow', '眉毛', 0, -10, 15, 0.5],
                ['wink', 'Wink', '单眼眨眼', 0, 0, 25, 0.5],
                ['pupil_x', 'Pupil X', '瞳孔左右', 0, -45, 45, 0.5],
                ['pupil_y', 'Pupil Y', '瞳孔上下', 0, -60, 60, 0.5]
            ]
        },
        {
            title: ['Mouth', '嘴型'],
            items: [
                ['aaa', 'AAA', '张嘴', 0, -30, 120, 1],
                ['eee', 'EEE', '咧嘴', 0, -20, 15, 0.2],
                ['woo', 'WOO', '嘟嘴', 0, -20, 15, 0.2],
                ['smile', 'Smile', '笑容', 0, -0.3, 1.3, 0.01]
            ]
        },
        {
            title: ['Blend', '混合'],
            items: [
                ['src_ratio', 'Source Ratio', '源表情保留', 1, 0, 1, 0.01],
                ['sample_ratio', 'Reference Strength', '参考强度', 1, -0.2, 1.2, 0.01],
                ['crop_factor', 'Crop Factor', '裁剪范围', 1.7, 1.0, 2.5, 0.05]
            ]
        }
    ];
    const DEFAULT_PARAMS = {};
    PARAM_GROUPS.forEach((group) => group.items.forEach((item) => { DEFAULT_PARAMS[item[0]] = item[3]; }));
    DEFAULT_PARAMS.sample_parts = 'OnlyExpression';

    let activeModal = null;
    let lastPreview = null;
    let sceneBridgeAttached = false;
    let previewRequestSeq = 0;
    let previewRunning = false;
    let previewRunningRequestId = 0;
    let pendingAutoPreview = false;
    let activeSession = null;
    let sourcePreviewRequestSeq = 0;
    let initialSourcePreviewLoaded = false;
    let modalScrollGuardsActive = false;
    let modalTouchPoint = null;
    let faceDetectionRequestSeq = 0;
    let cropOverlayTimer = 0;

    function getLangSource() {
        const state = window.simpleaiTopbarSystemParams || window.topbarLastSystemParams || {};
        const lang = state.__lang || state.lang || window.locale_lang || 'en';
        return Object.assign({}, state, { __lang: lang });
    }

    function isEnglish() {
        const state = getLangSource();
        const raw = String(state.__lang || '').toLowerCase();
        return raw.startsWith('en');
    }

    function t(en, cn) {
        if (window.SimpAII18n?.t) return window.SimpAII18n.t(en, cn, getLangSource());
        if (UTILS.t) return UTILS.t(en, cn, getLangSource());
        return isEnglish() ? en : (cn || en);
    }

    function eventTargetElement(target) {
        if (!target) return null;
        if (target.nodeType === 1) return target;
        return target.parentElement || null;
    }

    function canModalScrollAxis(node, axis, delta) {
        if (!node || !delta) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
        const overflow = axis === 'y' ? `${style?.overflowY || ''} ${style?.overflow || ''}` : `${style?.overflowX || ''} ${style?.overflow || ''}`;
        if (!/(auto|scroll|overlay)/i.test(overflow)) return false;
        const max = axis === 'y' ? node.scrollHeight - node.clientHeight : node.scrollWidth - node.clientWidth;
        if (max <= 1) return false;
        const position = axis === 'y' ? node.scrollTop : node.scrollLeft;
        return delta < 0 ? position > 0 : position < max - 1;
    }

    function findModalScrollTarget(target, modal, deltaX, deltaY) {
        const dialog = modal?.querySelector?.('.sai-lpe-modal');
        let node = eventTargetElement(target);
        while (node && dialog?.contains(node)) {
            if (canModalScrollAxis(node, 'y', deltaY) || canModalScrollAxis(node, 'x', deltaX)) return node;
            if (node === dialog) break;
            node = node.parentElement;
        }
        return null;
    }

    function containModalWheel(event) {
        if (!activeModal || !activeModal.contains(event.target)) return;
        const scroller = findModalScrollTarget(event.target, activeModal, Number(event.deltaX || 0), Number(event.deltaY || 0));
        if (!scroller) event.preventDefault();
        event.stopPropagation();
    }

    function containModalTouchStart(event) {
        if (!activeModal || !activeModal.contains(event.target)) return;
        const touch = event.touches?.[0] || null;
        modalTouchPoint = touch ? { x: touch.clientX, y: touch.clientY } : null;
        event.stopPropagation();
    }

    function containModalTouchMove(event) {
        if (!activeModal || !activeModal.contains(event.target)) return;
        const touch = event.touches?.[0] || null;
        const deltaX = modalTouchPoint && touch ? modalTouchPoint.x - touch.clientX : 0;
        const deltaY = modalTouchPoint && touch ? modalTouchPoint.y - touch.clientY : 0;
        modalTouchPoint = touch ? { x: touch.clientX, y: touch.clientY } : modalTouchPoint;
        const scroller = findModalScrollTarget(event.target, activeModal, deltaX, deltaY);
        if (!scroller) event.preventDefault();
        event.stopPropagation();
    }

    function resetModalTouchPoint(event) {
        if (activeModal && activeModal.contains(event.target)) event.stopPropagation();
        modalTouchPoint = null;
    }

    function bindModalScrollGuards() {
        if (modalScrollGuardsActive) return;
        modalScrollGuardsActive = true;
        document.addEventListener('wheel', containModalWheel, { capture: true, passive: false });
        document.addEventListener('touchstart', containModalTouchStart, { capture: true, passive: true });
        document.addEventListener('touchmove', containModalTouchMove, { capture: true, passive: false });
        document.addEventListener('touchend', resetModalTouchPoint, true);
        document.addEventListener('touchcancel', resetModalTouchPoint, true);
    }

    function unbindModalScrollGuards() {
        if (!modalScrollGuardsActive) return;
        modalScrollGuardsActive = false;
        document.removeEventListener('wheel', containModalWheel, true);
        document.removeEventListener('touchstart', containModalTouchStart, true);
        document.removeEventListener('touchmove', containModalTouchMove, true);
        document.removeEventListener('touchend', resetModalTouchPoint, true);
        document.removeEventListener('touchcancel', resetModalTouchPoint, true);
        modalTouchPoint = null;
    }

    function tr(pair) {
        return t(pair[0], pair[1]);
    }

    function gradioRoot() {
        try {
            if (typeof window.gradioApp === 'function') return window.gradioApp();
        } catch (err) {}
        return document;
    }

    function findById(id) {
        const root = gradioRoot();
        return (root && typeof root.getElementById === 'function' ? root.getElementById(id) : null) || document.getElementById(id);
    }

    function setNativeValue(el, value) {
        if (!el) return false;
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
        const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function bridgeInput(id) {
        const host = findById(id);
        return host?.querySelector?.('textarea, input') || (host?.matches?.('textarea,input') ? host : null);
    }

    function setBridgeValue(id, value) {
        return setNativeValue(bridgeInput(id), value);
    }

    function readBridgeValue(id) {
        return bridgeInput(id)?.value || '';
    }

    function clickBridgeButton(id) {
        const host = findById(id);
        const button = host?.querySelector?.('button') || (host?.matches?.('button') ? host : null);
        if (!button) return false;
        button.click();
        return true;
    }

    function postJson(endpoint, payload) {
        return fetch(studioEndpointUrl(endpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {})
        }).then(async (response) => {
            const data = await response.json().catch(() => null);
            if (!response.ok) return Object.assign({ ok: false, error: `HTTP ${response.status}` }, data || {});
            return data || { ok: false, error: 'empty response' };
        }).catch((err) => ({ ok: false, error: err?.message || String(err || 'request failed') }));
    }

    function injectStyles() {
        if (document.getElementById('liveportrait_expression_editor_styles')) return;
        const style = document.createElement('style');
        style.id = 'liveportrait_expression_editor_styles';
        style.textContent = `
.sai-lpe-backdrop{position:fixed;inset:0;z-index:99980;display:flex;align-items:center;justify-content:center;background:rgba(8,10,14,.56);backdrop-filter:blur(8px);padding:18px;overscroll-behavior:contain}
.sai-lpe-modal{width:min(1360px,calc(100vw - 28px));max-height:calc(100vh - 32px);display:grid;grid-template-rows:auto 1fr auto;background:color-mix(in srgb,var(--body-background-fill, #111827) 94%,#101014);color:var(--body-text-color,#f7f7f8);border:1px solid color-mix(in srgb,var(--border-color-primary,#3f3f46) 70%,#ffffff 10%);border-radius:8px;box-shadow:0 28px 90px rgba(0,0,0,.42);overflow:hidden;overscroll-behavior:contain}
.sai-lpe-header,.sai-lpe-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08)}
.sai-lpe-footer{border-top:1px solid rgba(255,255,255,.08);border-bottom:0;justify-content:flex-end}
.sai-lpe-title{display:flex;align-items:center;gap:10px;font-weight:650;font-size:15px}
.sai-lpe-title i{color:var(--button-primary-background-fill,#f97316)}
.sai-lpe-body{display:grid;grid-template-columns:minmax(500px,.95fr) minmax(360px,1.05fr);gap:16px;min-height:0;overflow:auto;padding:16px;overscroll-behavior:contain}
.sai-lpe-body>*{min-width:0;max-width:100%;box-sizing:border-box}
.sai-lpe-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.sai-lpe-section{border:1px solid color-mix(in srgb,var(--border-color-primary,#3f3f46) 78%,transparent);border-radius:8px;background:color-mix(in srgb,var(--block-background-fill,#24262b) 92%,#050608);padding:12px;min-width:0;max-width:100%;box-sizing:border-box;overflow:hidden}
.sai-lpe-section h3{font-size:13px;margin:0 0 10px;font-weight:650}
.sai-lpe-row{display:grid;grid-template-columns:minmax(56px,76px) minmax(0,1fr) 64px 28px;align-items:center;gap:6px;margin:8px 0;min-width:0;width:100%;max-width:100%;box-sizing:border-box;overflow:hidden}
.sai-lpe-row>*{min-width:0;box-sizing:border-box}
.sai-lpe-row label{font-size:12px;color:color-mix(in srgb,currentColor 78%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sai-lpe-row input[type=range]{width:100%;accent-color:var(--button-primary-background-fill,#f97316)}
.sai-lpe-row input[type=number]{width:100%;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:color-mix(in srgb,var(--input-background-fill,#1f2024) 86%,#000);color:inherit;padding:0 7px;box-sizing:border-box}
.sai-lpe-icon-btn{width:28px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:color-mix(in srgb,currentColor 76%,transparent);display:grid;place-items:center;cursor:pointer;padding:0}
.sai-lpe-icon-btn:hover,.sai-lpe-icon-btn:focus-visible{border-color:color-mix(in srgb,var(--button-primary-background-fill,#f97316) 66%,#fff);color:var(--body-text-color,#f3f4f6);outline:none}
.sai-lpe-parts{display:grid;grid-template-columns:132px minmax(0,1fr);gap:10px;align-items:start}
.sai-lpe-part-buttons{display:flex;gap:8px;flex-wrap:wrap;min-width:0}
.sai-lpe-part-btn{height:30px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:inherit;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;line-height:1;cursor:pointer}
.sai-lpe-part-btn[aria-pressed="true"]{border-color:color-mix(in srgb,var(--button-primary-background-fill,#f97316) 72%,#fff);background:color-mix(in srgb,var(--block-background-fill,#24262b) 72%,var(--button-primary-background-fill,#f97316));color:var(--button-primary-text-color,#fff7ed)}
.sai-lpe-part-btn:disabled,.sai-lpe-icon-btn:disabled{opacity:.55;cursor:not-allowed}
.sai-lpe-preview-pane{display:grid;grid-template-rows:auto minmax(240px,1fr) auto;gap:10px;min-width:0;max-width:100%;min-height:0;border:1px solid color-mix(in srgb,var(--border-color-primary,#3f3f46) 70%,transparent);border-radius:8px;background:color-mix(in srgb,var(--block-background-fill,#24262b) 86%,#050608);padding:12px;box-sizing:border-box;overflow:hidden}
.sai-lpe-image-frame{width:100%;max-width:100%;min-width:0;min-height:260px;border:1px dashed rgba(255,255,255,.16);border-radius:8px;display:grid;place-items:center;background:rgba(0,0,0,.18);overflow:auto;box-sizing:border-box;contain:layout paint;overscroll-behavior:contain;scrollbar-gutter:stable both-edges;position:relative}
.sai-lpe-image-stage{position:relative;display:inline-block;line-height:0;max-width:100%;max-height:100%}
.sai-lpe-image-stage img{max-width:100% !important;max-height:100% !important;width:auto !important;height:auto !important;object-fit:contain;object-position:center center;display:block}
.sai-lpe-image-frame.is-long-image{place-items:start center}
.sai-lpe-image-frame.is-long-image .sai-lpe-image-stage{width:100%;max-height:none}
.sai-lpe-image-frame.is-long-image img{width:100% !important;height:auto !important;max-height:none !important;object-position:center top}
.sai-lpe-face-layer{position:absolute;inset:0;pointer-events:none}
.sai-lpe-face-box{position:absolute;border:1px solid color-mix(in srgb,var(--button-primary-background-fill,#f97316) 76%,#ffffff 10%);background:transparent;color:#ffffff;border-radius:6px;min-width:22px;min-height:22px;display:flex;align-items:flex-start;justify-content:flex-start;padding:0;cursor:pointer;pointer-events:auto;opacity:.46;box-shadow:0 0 0 1px rgba(0,0,0,.38)}
.sai-lpe-face-box:hover,.sai-lpe-face-box:focus-visible{opacity:.95;outline:none}
.sai-lpe-face-box span{font-size:11px;line-height:17px;min-width:17px;height:17px;padding:0 5px;border-radius:0 0 6px 0;background:color-mix(in srgb,var(--button-primary-background-fill,#f97316) 82%,#000 12%);color:#fff;opacity:0}
.sai-lpe-image-frame:hover .sai-lpe-face-box span,.sai-lpe-face-box:hover span,.sai-lpe-face-box:focus-visible span,.sai-lpe-face-box[aria-pressed="true"] span{opacity:1}
.sai-lpe-face-box[aria-pressed="true"]{border-color:var(--button-primary-background-fill,#f97316);background:rgba(0,0,0,.03);opacity:.86;box-shadow:0 0 0 1px rgba(0,0,0,.42),0 0 0 2px color-mix(in srgb,var(--button-primary-background-fill,#f97316) 70%,transparent)}
.sai-lpe-crop-box{position:absolute;border:1px dashed #34d399;background:rgba(52,211,153,.04);box-shadow:0 0 0 1px rgba(0,0,0,.28);pointer-events:none;border-radius:4px;opacity:0;transition:opacity .14s ease}
.sai-lpe-crop-box span{position:absolute;left:0;top:0;transform:translateY(-100%);font-size:11px;line-height:18px;padding:0 6px;border-radius:4px 4px 0 0;background:#047857;color:#ffffff;white-space:nowrap;opacity:0}
.sai-lpe-image-frame:hover .sai-lpe-crop-box,.sai-lpe-image-frame.is-crop-active .sai-lpe-crop-box{opacity:.78}
.sai-lpe-image-frame:hover .sai-lpe-crop-box span,.sai-lpe-image-frame.is-crop-active .sai-lpe-crop-box span{opacity:1}
.sai-lpe-image-frame>[data-lpe-preview-empty]{font-size:13px;color:color-mix(in srgb,currentColor 68%,transparent);text-align:center;padding:12px}
.sai-lpe-status{font-size:12px;line-height:1.45;color:color-mix(in srgb,currentColor 76%,transparent);min-height:18px}
.sai-lpe-status.is-error{color:#fb7185}
.sai-lpe-actions{display:flex;gap:8px;flex-wrap:wrap}
.sai-lpe-toggle{height:32px;display:inline-flex;align-items:center;gap:8px;font-size:13px;color:inherit}
.sai-lpe-toggle input{width:16px;height:16px;accent-color:var(--button-primary-background-fill,#f97316)}
.sai-lpe-toggle input:disabled{opacity:.55}
.sai-lpe-btn{height:32px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:inherit;padding:0 11px;display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:13px}
.sai-lpe-btn.primary{background:var(--button-primary-background-fill,#f97316);border-color:color-mix(in srgb,var(--button-primary-background-fill,#f97316) 78%,#ffffff);color:var(--button-primary-text-color,#fff7ed)}
.sai-lpe-btn:disabled{opacity:.55;cursor:not-allowed}
.sai-lpe-close{width:32px;height:32px;display:grid;place-items:center;padding:0}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"]{--lpe-canvas-accent:var(--sai-canvas-accent,#1f8f7a);--lpe-canvas-panel:var(--sai-canvas-panel,#242424);--lpe-canvas-surface:var(--sai-canvas-surface,#2b2b2b);--lpe-canvas-text:var(--sai-canvas-text,#e7e7e7);--lpe-canvas-border:var(--sai-canvas-border,#3a3a3a);background:rgba(10,12,12,.62)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-modal{background:var(--lpe-canvas-panel);color:var(--lpe-canvas-text);border-color:color-mix(in srgb,var(--lpe-canvas-border) 82%,#ffffff 8%)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-header,.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-footer{border-color:color-mix(in srgb,var(--lpe-canvas-border) 84%,transparent)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-title i{color:var(--lpe-canvas-accent)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-section,.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-preview-pane{background:var(--lpe-canvas-surface);border-color:color-mix(in srgb,var(--lpe-canvas-border) 86%,transparent)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-image-frame{background:rgba(0,0,0,.2);border-color:color-mix(in srgb,var(--lpe-canvas-border) 72%,transparent)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-row input[type=range],.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-toggle input{accent-color:var(--lpe-canvas-accent)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-face-box{border-color:color-mix(in srgb,var(--lpe-canvas-accent) 84%,#ffffff 12%)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-face-box span{background:var(--lpe-canvas-accent)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-face-box[aria-pressed="true"]{box-shadow:0 0 0 1px rgba(0,0,0,.42),0 0 0 2px color-mix(in srgb,var(--lpe-canvas-accent) 70%,transparent)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-crop-box{border-color:color-mix(in srgb,var(--lpe-canvas-accent) 82%,#ffffff 14%);background:color-mix(in srgb,var(--lpe-canvas-accent) 8%,transparent)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-crop-box span{background:var(--lpe-canvas-accent)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-row input[type=number]{background:color-mix(in srgb,var(--lpe-canvas-panel) 76%,#000);border-color:color-mix(in srgb,var(--lpe-canvas-border) 86%,#ffffff 8%)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-icon-btn,.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-btn,.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-part-btn{background:color-mix(in srgb,var(--lpe-canvas-surface) 82%,#ffffff 6%);border-color:color-mix(in srgb,var(--lpe-canvas-border) 88%,#ffffff 8%)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-icon-btn:hover,.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-icon-btn:focus-visible{border-color:color-mix(in srgb,var(--lpe-canvas-accent) 74%,#ffffff 18%);color:var(--lpe-canvas-text)}
.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-part-btn[aria-pressed="true"],.sai-lpe-backdrop[data-liveportrait-expression-context="canvas"] .sai-lpe-btn.primary{background:var(--lpe-canvas-accent);border-color:color-mix(in srgb,var(--lpe-canvas-accent) 82%,#ffffff 18%);color:#ffffff}
@media (max-width: 1040px){.sai-lpe-body{grid-template-columns:1fr}.sai-lpe-grid{grid-template-columns:1fr}.sai-lpe-row{grid-template-columns:minmax(62px,86px) minmax(0,1fr) 64px 28px}.sai-lpe-parts{grid-template-columns:1fr}.sai-lpe-backdrop{padding:8px}.sai-lpe-modal{width:calc(100vw - 12px);max-height:calc(100vh - 12px)}}`;
        document.head.appendChild(style);
    }

    function safeJsonParse(value) {
        if (!value) return {};
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (err) {
            return {};
        }
    }

    function clamp(value, min, max) {
        const number = Number(value);
        if (!Number.isFinite(number)) return min;
        return Math.max(min, Math.min(max, number));
    }

    function paramsFromStateValue(raw, initialParams) {
        const parsed = safeJsonParse(raw);
        const source = initialParams && typeof initialParams === 'object'
            ? initialParams
            : (parsed.params && typeof parsed.params === 'object' ? parsed.params : parsed);
        const params = Object.assign({}, DEFAULT_PARAMS);
        PARAM_GROUPS.forEach((group) => group.items.forEach((item) => {
            const [key, , , defaultValue, min, max] = item;
            params[key] = clamp(source[key] ?? defaultValue, min, max);
        }));
        const sampleParts = String(source.sample_parts || parsed.sample_parts || DEFAULT_PARAMS.sample_parts);
        params.sample_parts = SAMPLE_PART_OPTIONS.some((item) => item[0] === sampleParts) ? sampleParts : DEFAULT_PARAMS.sample_parts;
        return params;
    }

    function paramsDifferFromDefault(params) {
        const source = params && typeof params === 'object' ? params : {};
        for (const group of PARAM_GROUPS) {
            for (const item of group.items) {
                const key = item[0];
                const defaultValue = item[3];
                if (Math.abs(Number(source[key] ?? defaultValue) - Number(defaultValue)) > 0.000001) return true;
            }
        }
        return String(source.sample_parts || DEFAULT_PARAMS.sample_parts) !== DEFAULT_PARAMS.sample_parts;
    }

    function shouldPreviewSavedStateOnOpen(options, params) {
        const opts = options || {};
        const raw = String(opts.expressionState || opts.state || readBridgeValue('scene_additional_prompt_2') || '').trim();
        if (!raw && !(opts.params && typeof opts.params === 'object')) return false;
        return paramsDifferFromDefault(params);
    }

    function normalizeFaceBBox(value) {
        let data = value;
        if (typeof data === 'string') {
            data = safeJsonParse(data);
        }
        if (!data || typeof data !== 'object') return null;
        let x;
        let y;
        let width;
        let height;
        if (Array.isArray(data) && data.length >= 4) {
            const x1 = Number(data[0]);
            const y1 = Number(data[1]);
            const x2 = Number(data[2]);
            const y2 = Number(data[3]);
            x = Math.min(x1, x2);
            y = Math.min(y1, y2);
            width = Math.abs(x2 - x1);
            height = Math.abs(y2 - y1);
        } else if ('x' in data && 'y' in data && 'width' in data && 'height' in data) {
            x = Number(data.x);
            y = Number(data.y);
            width = Number(data.width);
            height = Number(data.height);
        } else if ('x1' in data && 'y1' in data && 'x2' in data && 'y2' in data) {
            const x1 = Number(data.x1);
            const y1 = Number(data.y1);
            const x2 = Number(data.x2);
            const y2 = Number(data.y2);
            x = Math.min(x1, x2);
            y = Math.min(y1, y2);
            width = Math.abs(x2 - x1);
            height = Math.abs(y2 - y1);
        } else {
            return null;
        }
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
        if (Math.max(Math.abs(x), Math.abs(y), Math.abs(width), Math.abs(height)) > 1.5) return null;
        const nx = clamp(x, 0, 1);
        const ny = clamp(y, 0, 1);
        const nw = clamp(width, 0, 1 - nx);
        const nh = clamp(height, 0, 1 - ny);
        if (nw <= 0 || nh <= 0) return null;
        return { x: nx, y: ny, width: nw, height: nh };
    }

    function faceBBoxText(value) {
        const box = normalizeFaceBBox(value);
        if (!box) return '';
        return JSON.stringify({
            x: Number(box.x.toFixed(6)),
            y: Number(box.y.toFixed(6)),
            width: Number(box.width.toFixed(6)),
            height: Number(box.height.toFixed(6))
        });
    }

    function faceBBoxKey(value) {
        const box = normalizeFaceBBox(value);
        if (!box) return '';
        return [box.x, box.y, box.width, box.height].map((number) => Number(number).toFixed(5)).join(',');
    }

    function faceSelectionFromStateValue(raw, options) {
        const opts = options || {};
        const parsed = safeJsonParse(raw);
        const params = parsed.params && typeof parsed.params === 'object' ? parsed.params : {};
        return {
            source_face_bbox: normalizeFaceBBox(opts.sourceFaceBBox || opts.source_face_bbox || parsed.source_face_bbox || params.source_face_bbox),
            reference_face_bbox: normalizeFaceBBox(opts.referenceFaceBBox || opts.reference_face_bbox || parsed.reference_face_bbox || params.reference_face_bbox)
        };
    }

    function storedParams(options) {
        const opts = options || {};
        return paramsFromStateValue(opts.expressionState || opts.state || readBridgeValue('scene_additional_prompt_2'), opts.params);
    }

    function statePayload(params) {
        const payload = {
            version: '1',
            feature: 'LivePortrait Exp',
            params: Object.assign({}, params || readParams()),
            updated_at: new Date().toISOString()
        };
        const sourceFaceBBox = faceBBoxText(activeSession?.faceSelection?.source_face_bbox);
        const referenceFaceBBox = faceBBoxText(activeSession?.faceSelection?.reference_face_bbox);
        if (sourceFaceBBox) payload.source_face_bbox = safeJsonParse(sourceFaceBBox);
        if (referenceFaceBBox) payload.reference_face_bbox = safeJsonParse(referenceFaceBBox);
        return payload;
    }

    function writeScenePromptState(params) {
        setBridgeValue('scene_additional_prompt', '');
        setBridgeValue('scene_additional_prompt_2', JSON.stringify(statePayload(params), null, 2));
    }

    function writeActiveState(params) {
        const payload = statePayload(params);
        if (activeSession?.context === 'scene_preset') {
            writeScenePromptState(params);
        } else if (activeSession) {
            activeSession.params = Object.assign({}, params);
            activeSession.expressionState = JSON.stringify(payload);
            if (typeof activeSession.onStateChange === 'function') {
                activeSession.onStateChange({
                    params: Object.assign({}, params),
                    expression_state: activeSession.expressionState,
                    face_selection: Object.assign({}, activeSession.faceSelection || {}),
                    updated_at: payload.updated_at
                });
            }
        }
        return payload;
    }

    function activeExportLabel() {
        if (canvasExportIsParamsOnly()) return t('Save Params', '保存参数');
        if (activeSession?.context === 'canvas') return t('Export To Canvas', '导出到画布');
        if (sceneExportIsParamsOnly()) return t('Save Params', '保存参数');
        return t('Export To Input 1', '导出到输入图 1');
    }

    function sceneExpressionConfig() {
        if (activeSession?.context !== 'scene_preset') {
            return {
                source: 'scene_input_image1',
                reference: 'scene_input_image2',
                exportTarget: 'scene_input_image1',
                exportMode: 'image'
            };
        }
        const host = findById('liveportrait_expression_scene_control');
        const dataset = host?.dataset || {};
        return {
            source: dataset.liveportraitExpressionSource || 'scene_input_image1',
            reference: dataset.liveportraitExpressionReference || 'scene_input_image2',
            exportTarget: dataset.liveportraitExpressionExportTarget || 'scene_input_image1',
            exportMode: dataset.liveportraitExpressionExportMode || 'image'
        };
    }

    function sceneExportIsParamsOnly() {
        return activeSession?.context === 'scene_preset' && sceneExpressionConfig().exportMode === 'params';
    }

    function canvasExportIsParamsOnly() {
        return activeSession?.context === 'canvas' && activeSession?.exportMode === 'params';
    }

    function sceneSourceIsVideoFirstFrame() {
        return activeSession?.context === 'scene_preset' && sceneExpressionConfig().source === 'scene_video_first_frame';
    }

    function sourceMissingMessage() {
        if (canvasExportIsParamsOnly()) return t('Connect a source video, then open Preview.', '连接源视频后可打开预览。');
        if (activeSession?.context === 'canvas') return t('Connect a source image, then open Preview.', '连接源图后可打开预览。');
        if (sceneSourceIsVideoFirstFrame()) return t('Upload a source video first.', '请先上传源视频。');
        return t('Upload the source face to Input Image 1.', '请把源人脸图上传到输入图 1。');
    }

    function sourceLoadedMessage() {
        if (canvasExportIsParamsOnly()) return t('First frame loaded from source video. Preview will render the expression result.', '已加载源视频首帧。点击预览会生成表情结果。');
        if (activeSession?.context === 'canvas') return t('Source image loaded. Preview will render the expression result.', '源图已加载。点击预览会生成表情结果。');
        if (sceneSourceIsVideoFirstFrame()) return t('First frame loaded from source video. Preview will render the expression result.', '已加载源视频首帧。点击预览会生成表情结果。');
        return t('Source image loaded from Input Image 1. Preview will render the expression result.', '已从输入图 1 加载源图。点击预览会生成表情结果。');
    }

    function previewReadyMessage() {
        if (canvasExportIsParamsOnly()) return t('Preview ready. Save Params will keep these expression settings for Generate.', '预览已生成。保存参数会让 Generate 使用当前表情设置。');
        if (activeSession?.context === 'canvas') return t('Preview ready. Export writes it to the canvas node.', '预览已生成，导出会写入画布节点。');
        if (sceneExportIsParamsOnly()) return t('Preview ready. Save Params will keep these expression settings for Generate.', '预览已生成。保存参数会让 Generate 使用当前表情设置。');
        if (sceneSourceIsVideoFirstFrame()) return t('Preview ready. Export writes it to Input Image 1 as the video reference image.', '预览已生成，导出会写入输入图 1 作为视频参考图。');
        return t('Preview ready. Export writes it to Input Image 1.', '预览已生成，导出会写入输入图 1。');
    }

    function sceneInitialStatusMessage() {
        if (canvasExportIsParamsOnly()) return t('Source video first frame previews expression params. Generate reads the current JSON settings.', '源视频首帧用于预览表情参数，Generate 会读取当前 JSON 设置。');
        if (activeSession?.context === 'canvas') return t('Source image is edited here. Optional reference image can guide expression.', '在这里编辑源图表情，也可以连接参考表情图。');
        if (sceneExportIsParamsOnly()) return t('Source video first frame previews expression params. Generate reads the current JSON settings.', '源视频首帧用于预览表情参数，Generate 会读取当前 JSON 设置。');
        if (sceneSourceIsVideoFirstFrame()) return t('Source video first frame is edited here. Export writes the reference image to Input Image 1.', '这里编辑源视频首帧，导出会写入输入图 1 作为参考表情图。');
        return t('Input Image 1 is source. Input Image 2 can provide reference expression.', '输入图 1 是源人脸，输入图 2 可作为参考表情。');
    }

    function markPreviewDirty() {
        lastPreview = null;
        previewRequestSeq += 1;
    }

    function isAutoPreviewEnabled() {
        return !!activeModal?.querySelector?.('[data-lpe-auto-preview]')?.checked;
    }

    function requestAutoPreview(reason) {
        if (!activeModal || !isAutoPreviewEnabled()) return null;
        if (previewRunning) {
            pendingAutoPreview = true;
            setStatus(t('Please wait for the current preview.', '请等待当前预览完成。'));
            return null;
        }
        return preview({ auto: true, reason });
    }

    function setBusy(busy, message) {
        if (!activeModal) return;
        activeModal.classList.toggle('is-busy', !!busy);
        activeModal.querySelectorAll('[data-lpe-action]').forEach((button) => {
            if (button.getAttribute('data-lpe-action') !== 'close') button.disabled = !!busy;
        });
        activeModal.querySelectorAll('[data-lpe-param], [data-lpe-auto-preview], [data-lpe-reset-param], [data-lpe-sample-part], [data-lpe-face-index]').forEach((control) => {
            control.disabled = !!busy;
        });
        if (message) setStatus(message);
    }

    function setStatus(message, isError) {
        if (!activeModal) return;
        const box = activeModal.querySelector('[data-lpe-status]');
        if (box) {
            box.textContent = String(message || '');
            box.classList.toggle('is-error', !!isError);
        }
        const host = activeSession?.context === 'scene_preset' ? findById('liveportrait_expression_scene_control') : null;
        const status = host?.querySelector?.('[data-liveportrait-expression-scene-status]');
        if (status && message) {
            status.textContent = String(message || '');
            status.classList.toggle('is-error', !!isError);
            status.dataset.saiLiveportraitDefaultStatus = '0';
        }
    }

    function paramDefinition(key) {
        for (const group of PARAM_GROUPS) {
            for (const item of group.items) {
                if (item[0] === key) return item;
            }
        }
        return null;
    }

    function syncParamInputs(key, value, source) {
        if (!activeModal) return;
        const def = paramDefinition(key);
        const number = def ? clamp(value, def[4], def[5]) : Number(value || 0);
        activeModal.querySelectorAll(`[data-lpe-param="${key}"]`).forEach((input) => {
            if (input === source) return;
            input.value = String(number);
        });
    }

    function setSamplePartValue(value) {
        if (!activeModal) return DEFAULT_PARAMS.sample_parts;
        const sampleParts = SAMPLE_PART_OPTIONS.some((item) => item[0] === value) ? value : DEFAULT_PARAMS.sample_parts;
        const input = activeModal.querySelector('input[type="hidden"][data-lpe-param="sample_parts"]');
        if (input) input.value = sampleParts;
        activeModal.querySelectorAll('[data-lpe-sample-part]').forEach((button) => {
            const selected = button.getAttribute('data-lpe-sample-part') === sampleParts;
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
        return sampleParts;
    }

    function readParams() {
        const params = Object.assign({}, DEFAULT_PARAMS);
        if (!activeModal) return params;
        PARAM_GROUPS.forEach((group) => group.items.forEach((item) => {
            const [key, , , defaultValue, min, max] = item;
            const input = activeModal.querySelector(`input[type="number"][data-lpe-param="${key}"]`) || activeModal.querySelector(`[data-lpe-param="${key}"]`);
            params[key] = clamp(input?.value ?? defaultValue, min, max);
        }));
        const samplePartsInput = activeModal.querySelector('input[type="hidden"][data-lpe-param="sample_parts"]');
        const sampleParts = samplePartsInput?.value || DEFAULT_PARAMS.sample_parts;
        params.sample_parts = SAMPLE_PART_OPTIONS.some((item) => item[0] === sampleParts) ? sampleParts : DEFAULT_PARAMS.sample_parts;
        return params;
    }

    function renderParamRow(item, params) {
        const [key, en, cn, defaultValue, min, max, step] = item;
        const value = params[key] ?? defaultValue;
        const resetLabel = `${t('Reset', '重置')} ${t(en, cn)}`;
        return `<div class="sai-lpe-row">
  <label title="${escapeHtml(en)}">${escapeHtml(t(en, cn))}</label>
  <input type="range" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}" data-lpe-param="${escapeHtml(key)}">
  <input type="number" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}" data-lpe-param="${escapeHtml(key)}">
  <button type="button" class="sai-lpe-icon-btn" data-lpe-reset-param="${escapeHtml(key)}" title="${escapeHtml(resetLabel)}"><i class="fa-solid fa-rotate-left"></i></button>
</div>`;
    }

    function renderControls(params) {
        const groups = PARAM_GROUPS.map((group) => `<section class="sai-lpe-section">
  <h3>${escapeHtml(tr(group.title))}</h3>
  ${group.items.map((item) => renderParamRow(item, params)).join('')}
</section>`).join('');
        const sampleParts = SAMPLE_PART_OPTIONS.some((item) => item[0] === params.sample_parts) ? params.sample_parts : DEFAULT_PARAMS.sample_parts;
        const options = SAMPLE_PART_OPTIONS.map(([value, en, cn]) => `<button type="button" class="sai-lpe-part-btn" data-lpe-sample-part="${escapeHtml(value)}" aria-pressed="${sampleParts === value ? 'true' : 'false'}">${escapeHtml(t(en, cn))}</button>`).join('');
        return `<div class="sai-lpe-grid">${groups}</div>
<section class="sai-lpe-section">
  <div class="sai-lpe-parts">
    <label>${escapeHtml(t('Reference Parts', '参考部位'))}</label>
    <div class="sai-lpe-part-buttons" role="group" aria-label="${escapeHtml(t('Reference Parts', '参考部位'))}">
      ${options}
      <input type="hidden" data-lpe-param="sample_parts" value="${escapeHtml(sampleParts)}">
    </div>
  </div>
</section>`;
    }

    function createModal(options) {
        const opts = options || {};
        injectStyles();
        const params = storedParams(opts);
        const faceSelection = faceSelectionFromStateValue(opts.expressionState || opts.state || readBridgeValue('scene_additional_prompt_2'), opts);
        activeSession = Object.assign({
            context: 'scene_preset',
            params,
            faceSelection,
            sourceFaces: [],
            sourceFaceFingerprint: '',
            expressionState: JSON.stringify(statePayload(params)),
            previewOnOpen: shouldPreviewSavedStateOnOpen(opts, params)
        }, opts, {
            params,
            faceSelection
        });
        writeActiveState(params);
        const modal = document.createElement('div');
        modal.className = 'sai-lpe-backdrop';
        modal.dataset.liveportraitExpressionContext = activeSession.context;
        modal.innerHTML = `<div class="sai-lpe-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('LivePortrait Expression', 'LivePortrait 表情编辑'))}">
  <header class="sai-lpe-header">
    <div class="sai-lpe-title"><i class="fa-solid fa-face-smile"></i><span>${escapeHtml(t('LivePortrait Expression', 'LivePortrait 表情编辑'))}</span></div>
    <button type="button" class="sai-lpe-btn sai-lpe-close" data-lpe-action="close" title="${escapeHtml(t('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </header>
  <div class="sai-lpe-body">
    <div>${renderControls(params)}</div>
    <aside class="sai-lpe-preview-pane">
      <div class="sai-lpe-status" data-lpe-status>${escapeHtml(sceneInitialStatusMessage())}</div>
      <div class="sai-lpe-image-frame">
        <div class="sai-lpe-image-stage" data-lpe-image-stage hidden><img data-lpe-preview-img alt="" hidden><div class="sai-lpe-face-layer" data-lpe-face-layer hidden></div></div>
        <span data-lpe-preview-empty>${escapeHtml(t('Preview appears here', '预览会显示在这里'))}</span>
      </div>
      <div class="sai-lpe-actions">
        <label class="sai-lpe-toggle"><input type="checkbox" data-lpe-auto-preview checked><span>${escapeHtml(t('Auto Preview', '自动预览'))}</span></label>
        <button type="button" class="sai-lpe-btn" data-lpe-action="status"><i class="fa-solid fa-list-check"></i><span>${escapeHtml(t('Check Resources', '检查资源'))}</span></button>
        <button type="button" class="sai-lpe-btn" data-lpe-action="reset"><i class="fa-solid fa-rotate-left"></i><span>${escapeHtml(t('Reset', '重置'))}</span></button>
        <button type="button" class="sai-lpe-btn primary" data-lpe-action="preview"><i class="fa-solid fa-play"></i><span>${escapeHtml(t('Preview', '预览'))}</span></button>
      </div>
    </aside>
  </div>
  <footer class="sai-lpe-footer">
    <button type="button" class="sai-lpe-btn" data-lpe-action="close">${escapeHtml(t('Close', '关闭'))}</button>
    <button type="button" class="sai-lpe-btn primary" data-lpe-action="export"><i class="fa-solid fa-file-export"></i><span>${escapeHtml(activeExportLabel())}</span></button>
  </footer>
</div>`;
        bindModal(modal);
        return modal;
    }

    function resolveModalMount(options) {
        const opts = options || {};
        const direct = opts.modalMount || opts.mount;
        if (direct && direct.nodeType === 1 && direct.isConnected) return direct;
        const selector = String(opts.mountSelector || '').trim();
        if (selector) {
            try {
                const found = document.querySelector(selector);
                if (found && found.nodeType === 1) return found;
            } catch (err) {}
        }
        if (opts.context === 'canvas') {
            const canvasRoot = document.getElementById('simpai-infinite-canvas-workbench');
            if (canvasRoot) return canvasRoot;
        }
        return document.body || document.documentElement;
    }

    function sourceImageFingerprint(source) {
        const dataUrl = String(source?.dataUrl || '');
        if (!dataUrl) return '';
        return dataUrl;
    }

    function sourceCropBoxForFace(faceBox) {
        const box = normalizeFaceBBox(faceBox);
        const img = activeModal?.querySelector?.('[data-lpe-preview-img]');
        const imageWidth = Number(img?.naturalWidth || 0);
        const imageHeight = Number(img?.naturalHeight || 0);
        if (!box || imageWidth <= 0 || imageHeight <= 0) return null;
        const cropFactor = clamp(readParams().crop_factor, 1.0, 2.5);
        const x1 = box.x * imageWidth;
        const y1 = box.y * imageHeight;
        const bboxWidth = box.width * imageWidth;
        const bboxHeight = box.height * imageHeight;
        let cropSize = Math.max(bboxWidth * cropFactor, bboxHeight * cropFactor);
        const kernelX = Math.trunc(x1 + bboxWidth / 2);
        const kernelY = Math.trunc(y1 + bboxHeight / 2);
        let newX1 = Math.trunc(kernelX - cropSize / 2);
        let newX2 = Math.trunc(kernelX + cropSize / 2);
        let newY1 = Math.trunc(kernelY - cropSize / 2);
        let newY2 = Math.trunc(kernelY + cropSize / 2);
        if (newX1 < 0) {
            newX2 -= newX1;
            newX1 = 0;
        } else if (imageWidth < newX2) {
            newX1 -= (newX2 - imageWidth);
            newX2 = imageWidth;
            if (newX1 < 0) {
                newX2 -= newX1;
                newX1 = 0;
            }
        }
        if (newY1 < 0) {
            newY2 -= newY1;
            newY1 = 0;
        } else if (imageHeight < newY2) {
            newY1 -= (newY2 - imageHeight);
            newY2 = imageHeight;
            if (newY1 < 0) {
                newY2 -= newY1;
                newY1 = 0;
            }
        }
        if (imageWidth < newX2 && imageHeight < newY2) {
            const overMin = Math.min(newX2 - imageWidth, newY2 - imageHeight);
            newX2 -= overMin;
            newY2 -= overMin;
        }
        const visibleX1 = clamp(newX1, 0, imageWidth);
        const visibleY1 = clamp(newY1, 0, imageHeight);
        const visibleX2 = clamp(newX2, 0, imageWidth);
        const visibleY2 = clamp(newY2, 0, imageHeight);
        if (visibleX2 <= visibleX1 || visibleY2 <= visibleY1) return null;
        return {
            x: visibleX1 / imageWidth,
            y: visibleY1 / imageHeight,
            width: (visibleX2 - visibleX1) / imageWidth,
            height: (visibleY2 - visibleY1) / imageHeight
        };
    }

    function boxStyle(box) {
        return [
            `left:${(box.x * 100).toFixed(4)}%`,
            `top:${(box.y * 100).toFixed(4)}%`,
            `width:${(box.width * 100).toFixed(4)}%`,
            `height:${(box.height * 100).toFixed(4)}%`
        ].join(';');
    }

    function showCropOverlayTemporarily() {
        const frame = activeModal?.querySelector?.('.sai-lpe-image-frame');
        if (!frame) return;
        frame.classList.add('is-crop-active');
        if (cropOverlayTimer) window.clearTimeout(cropOverlayTimer);
        cropOverlayTimer = window.setTimeout(() => {
            frame.classList.remove('is-crop-active');
            cropOverlayTimer = 0;
        }, 1400);
    }

    function renderFaceBoxes(facesOverride) {
        if (!activeModal) return;
        const layer = activeModal.querySelector('[data-lpe-face-layer]');
        const img = activeModal.querySelector('[data-lpe-preview-img]');
        if (!layer) return;
        const faces = Array.isArray(facesOverride) ? facesOverride : (activeSession?.sourceFaces || []);
        if (!faces.length || !img || img.hidden || !img.getAttribute('src')) {
            layer.innerHTML = '';
            layer.hidden = true;
            return;
        }
        const selectedKey = faceBBoxKey(activeSession?.faceSelection?.source_face_bbox);
        const cropBox = sourceCropBoxForFace(activeSession?.faceSelection?.source_face_bbox);
        const cropHtml = cropBox
            ? `<div class="sai-lpe-crop-box" style="${boxStyle(cropBox)}" title="${escapeHtml(t('Actual crop range', '实际裁剪范围'))}"><span>${escapeHtml(t('Crop', '裁剪范围'))}</span></div>`
            : '';
        layer.innerHTML = cropHtml + faces.map((face, index) => {
            const box = normalizeFaceBBox(face?.normalized || face?.bbox);
            if (!box) return '';
            const pressed = selectedKey && selectedKey === faceBBoxKey(box);
            const label = face?.label || String(index + 1);
            return `<button type="button" class="sai-lpe-face-box" style="${boxStyle(box)}" data-lpe-face-index="${index}" aria-pressed="${pressed ? 'true' : 'false'}" title="${escapeHtml(t('Select face', '选择人脸'))} ${escapeHtml(label)}"><span>${escapeHtml(label)}</span></button>`;
        }).join('');
        layer.hidden = !layer.innerHTML;
    }

    function selectSourceFace(index, options) {
        if (!activeSession || previewRunning) return false;
        const faces = activeSession.sourceFaces || [];
        const face = faces[Number(index)];
        const box = normalizeFaceBBox(face?.normalized || face?.bbox);
        if (!box) return false;
        activeSession.faceSelection = Object.assign({}, activeSession.faceSelection || {}, { source_face_bbox: box });
        writeActiveState(readParams());
        renderFaceBoxes();
        showCropOverlayTemporarily();
        markPreviewDirty();
        const label = face?.label || String(Number(index) + 1);
        if (!options?.quiet) setStatus(t(`Selected face ${label}.`, `已选择第 ${label} 张脸。`));
        if (isAutoPreviewEnabled()) requestAutoPreview('source_face');
        return true;
    }

    async function loadSourceFaces(source, options) {
        const opts = options || {};
        if (!activeSession) return null;
        const fingerprint = sourceImageFingerprint(source);
        if (!fingerprint) {
            activeSession.sourceFaces = [];
            activeSession.sourceFaceFingerprint = '';
            renderFaceBoxes([]);
            return null;
        }
        if (activeSession.sourceFaceFingerprint === fingerprint && Array.isArray(activeSession.sourceFaces)) {
            renderFaceBoxes();
            return activeSession.sourceFaces;
        }
        const requestId = ++faceDetectionRequestSeq;
        activeSession.sourceFaceFingerprint = fingerprint;
        activeSession.sourceFaces = [];
        renderFaceBoxes([]);
        const data = await postJson('/liveportrait-expression/faces', {
            source_image: source.dataUrl,
            source_size: { width: source.width, height: source.height }
        });
        if (requestId !== faceDetectionRequestSeq || !activeModal || !activeSession) return null;
        if (!data?.ok) {
            activeSession.sourceFaceFingerprint = '';
            if (!opts.quiet) setStatus(data?.details || data?.error || t('Face detection failed.', '人脸检测失败。'), true);
            return null;
        }
        const faces = Array.isArray(data.faces) ? data.faces.map((face) => Object.assign({}, face, {
            normalized: normalizeFaceBBox(face.normalized || face.bbox)
        })).filter((face) => face.normalized) : [];
        activeSession.sourceFaces = faces;
        if (!faces.length) {
            activeSession.faceSelection = Object.assign({}, activeSession.faceSelection || {}, { source_face_bbox: null });
            writeActiveState(readParams());
            renderFaceBoxes([]);
            if (!opts.quiet) setStatus(t('No face detected in the source image.', '源图未检测到人脸。'), true);
            return faces;
        }
        const selectedKey = faceBBoxKey(activeSession.faceSelection?.source_face_bbox);
        let selectedIndex = faces.findIndex((face) => selectedKey && selectedKey === faceBBoxKey(face.normalized));
        if (selectedIndex < 0) selectedIndex = Math.max(0, Math.min(faces.length - 1, Number(data.default_index || 0)));
        activeSession.faceSelection = Object.assign({}, activeSession.faceSelection || {}, {
            source_face_bbox: normalizeFaceBBox(faces[selectedIndex].normalized)
        });
        writeActiveState(readParams());
        renderFaceBoxes();
        if (!opts.quiet && faces.length > 1) {
            setStatus(t(`Detected ${faces.length} faces. Selected face ${selectedIndex + 1}.`, `检测到 ${faces.length} 张脸，已选择第 ${selectedIndex + 1} 张。`));
        }
        return faces;
    }

    function updatePreviewImageFit(img) {
        const frame = img?.closest?.('.sai-lpe-image-frame');
        const stage = img?.closest?.('[data-lpe-image-stage]');
        if (!frame) return;
        frame.classList.remove('is-long-image');
        frame.scrollTop = 0;
        frame.scrollLeft = 0;
        if (stage) stage.hidden = !!(img?.hidden);
        if (!img || img.hidden || !img.naturalWidth || !img.naturalHeight) return;
        const frameWidth = Math.max(0, frame.clientWidth - 2);
        const frameHeight = Math.max(0, frame.clientHeight - 2);
        const scaledHeight = frameWidth > 0 ? (img.naturalHeight / img.naturalWidth) * frameWidth : 0;
        if (frameHeight > 0 && scaledHeight > frameHeight * 1.12) frame.classList.add('is-long-image');
        renderFaceBoxes();
    }

    function setPreviewImage(dataUrl) {
        if (!activeModal) return;
        const img = activeModal.querySelector('[data-lpe-preview-img]');
        const empty = activeModal.querySelector('[data-lpe-preview-empty]');
        const frame = activeModal.querySelector('.sai-lpe-image-frame');
        const stage = activeModal.querySelector('[data-lpe-image-stage]');
        if (img) {
            img.onload = () => updatePreviewImageFit(img);
            if (dataUrl) {
                img.src = dataUrl;
                img.hidden = false;
                if (stage) stage.hidden = false;
                requestAnimationFrame(() => updatePreviewImageFit(img));
            } else {
                img.removeAttribute('src');
                img.hidden = true;
                if (stage) stage.hidden = true;
                frame?.classList.remove('is-long-image');
                frame?.scrollTo?.(0, 0);
                renderFaceBoxes([]);
            }
        }
        if (empty) empty.hidden = !!dataUrl;
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function imageSrcToDataUrl(src) {
        const rawValue = String(src || '');
        const value = /^\/(?:file=|gradio_api\/file=)/.test(rawValue)
            ? studioEndpointUrl(rawValue)
            : rawValue;
        if (!value) return '';
        if (value === 'about:blank' || value.startsWith('data:image/svg')) return '';
        if (value.startsWith('data:image/')) return value;
        try {
            const response = await fetch(value);
            const blob = await response.blob();
            if (blob?.type?.startsWith('image/') && blob.type !== 'image/svg+xml') return await blobToDataUrl(blob);
        } catch (err) {}
        try {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = value;
            });
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width || 1;
            canvas.height = image.naturalHeight || image.height || 1;
            canvas.getContext('2d').drawImage(image, 0, 0);
            return canvas.toDataURL('image/png');
        } catch (err) {
            return '';
        }
    }

    function localFilePathToUrl(path) {
        const value = String(path || '').trim();
        if (!value) return '';
        if (/^(data:image\/|blob:|https?:\/\/|\/file=)/i.test(value)) return value;
        if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/')) {
            return `/file=${encodeURIComponent(value)}`;
        }
        return value;
    }

    function imageDataUrlSize(dataUrl) {
        return new Promise((resolve) => {
            const src = String(dataUrl || '');
            if (!src) {
                resolve({ width: 0, height: 0 });
                return;
            }
            const image = new Image();
            image.onload = () => resolve({ width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 });
            image.onerror = () => resolve({ width: 0, height: 0 });
            image.src = src;
        });
    }

    async function readBackendSceneVideoFirstFrame() {
        const id = 'scene_video_first_frame';
        const framePath = readBridgeValue('scene_video_first_frame_path');
        const dataUrl = await imageSrcToDataUrl(localFilePathToUrl(framePath));
        if (!dataUrl) return { id, dataUrl: '', width: 0, height: 0 };
        const size = await imageDataUrlSize(dataUrl);
        return { id, dataUrl, width: size.width, height: size.height };
    }

    function waitForMediaEvent(target, eventName, timeoutMs) {
        return new Promise((resolve) => {
            if (!target?.addEventListener) {
                resolve(false);
                return;
            }
            let done = false;
            let timer = null;
            const finish = (value) => {
                if (done) return;
                done = true;
                if (timer) window.clearTimeout(timer);
                target.removeEventListener(eventName, onEvent);
                target.removeEventListener('error', onError);
                resolve(value);
            };
            const onEvent = () => finish(true);
            const onError = () => finish(false);
            target.addEventListener(eventName, onEvent, { once: true });
            target.addEventListener('error', onError, { once: true });
            timer = window.setTimeout(() => finish(false), timeoutMs || 1600);
        });
    }

    async function ensureVideoFrameReady(video) {
        if (!video) return false;
        if (video.readyState >= 2 && video.videoWidth && video.videoHeight) return true;
        try { video.load?.(); } catch (err) {}
        await waitForMediaEvent(video, 'loadeddata', 2200);
        return !!(video.readyState >= 2 && video.videoWidth && video.videoHeight);
    }

    async function seekVideoFrame(video, time) {
        if (!video) return;
        const duration = Number(video.duration || 0);
        if (!Number.isFinite(duration) || duration <= 0) return;
        const target = Math.max(0, Math.min(Number(time || 0), Math.max(0, duration - 0.001)));
        if (Math.abs(Number(video.currentTime || 0) - target) < 0.04) return;
        const seeked = waitForMediaEvent(video, 'seeked', 1400);
        try {
            video.currentTime = target;
        } catch (err) {
            return;
        }
        await seeked;
    }

    async function readSceneVideoFirstFrame() {
        const id = 'scene_video_first_frame';
        const backendFrame = await readBackendSceneVideoFirstFrame();
        if (backendFrame?.dataUrl) return backendFrame;
        const host = findById('scene_video');
        const video = host?.querySelector?.('video');
        if (!video) return { id, dataUrl: '', width: 0, height: 0 };
        const previousTime = Number(video.currentTime || 0);
        const wasPaused = !!video.paused;
        try {
            try { video.pause?.(); } catch (err) {}
            const ready = await ensureVideoFrameReady(video);
            if (!ready) return { id, dataUrl: '', width: 0, height: 0 };
            await seekVideoFrame(video, 0);
            const width = Number(video.videoWidth || 0);
            const height = Number(video.videoHeight || 0);
            if (!width || !height) return { id, dataUrl: '', width: 0, height: 0 };
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(video, 0, 0, width, height);
            return { id, dataUrl: canvas.toDataURL('image/png'), width, height };
        } catch (err) {
            return { id, dataUrl: '', width: 0, height: 0 };
        } finally {
            if (previousTime > 0.04) {
                try { await seekVideoFrame(video, previousTime); } catch (err) {}
            }
            if (!wasPaused) {
                try {
                    const playResult = video.play?.();
                    if (playResult?.catch) playResult.catch(() => {});
                } catch (err) {}
            }
        }
    }

    function canvasHasContent(canvas) {
        if (!canvas || !canvas.width || !canvas.height) return false;
        try {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const stepX = Math.max(1, Math.floor(canvas.width / 24));
            const stepY = Math.max(1, Math.floor(canvas.height / 24));
            for (let y = 0; y < canvas.height; y += stepY) {
                for (let x = 0; x < canvas.width; x += stepX) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    if (pixel[3] > 4 && (pixel[0] < 248 || pixel[1] < 248 || pixel[2] < 248)) return true;
                }
            }
        } catch (err) {}
        return false;
    }

    async function readSceneImage(id) {
        const host = findById(id);
        if (!host) return { id, dataUrl: '', width: 0, height: 0 };
        const images = Array.from(host.querySelectorAll?.('img') || []);
        for (const img of images) {
            const src = img?.currentSrc || img?.getAttribute?.('src') || img?.src || '';
            const width = img?.naturalWidth || img?.width || 0;
            const height = img?.naturalHeight || img?.height || 0;
            if (!src || src === 'about:blank' || src.startsWith('data:image/svg')) continue;
            if (width && height && (width < 24 || height < 24)) continue;
            const dataUrl = await imageSrcToDataUrl(src);
            if (dataUrl) {
                return {
                    id,
                    dataUrl,
                    width,
                    height
                };
            }
        }
        const canvas = host.querySelector?.('canvas');
        if (canvasHasContent(canvas)) {
            return { id, dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
        }
        return { id, dataUrl: '', width: 0, height: 0 };
    }

    function imageLikeSrc(value) {
        if (!value || typeof value !== 'object') return '';
        return value.data_url || value.preview_url || value.thumb || value.path || value.output_path || value.original_output_path || '';
    }

    async function readOptionImage(id, dataUrlKey, srcKey, assetKey, sizeKey) {
        const session = activeSession || {};
        const direct = String(session[dataUrlKey] || '').trim();
        const asset = session[assetKey] && typeof session[assetKey] === 'object' ? session[assetKey] : {};
        const src = direct || String(session[srcKey] || '').trim() || imageLikeSrc(asset);
        const dataUrl = await imageSrcToDataUrl(src);
        const size = session[sizeKey] && typeof session[sizeKey] === 'object' ? session[sizeKey] : {};
        return {
            id,
            dataUrl,
            width: Number(size.width || asset.width || 0),
            height: Number(size.height || asset.height || 0)
        };
    }

    async function readActiveSourceImage() {
        if (activeSession?.context === 'canvas') {
            return await readOptionImage('canvas_source', 'sourceDataUrl', 'sourceSrc', 'sourceAsset', 'sourceSize');
        }
        const source = sceneExpressionConfig().source || 'scene_input_image1';
        return source === 'scene_video_first_frame'
            ? await readSceneVideoFirstFrame()
            : await readSceneImage(source);
    }

    async function readActiveReferenceImage() {
        if (activeSession?.context === 'canvas') {
            return await readOptionImage('canvas_reference', 'referenceDataUrl', 'referenceSrc', 'referenceAsset', 'referenceSize');
        }
        const reference = sceneExpressionConfig().reference || 'scene_input_image2';
        if (reference === 'none') return { id: 'none', dataUrl: '', width: 0, height: 0 };
        return await readSceneImage(reference);
    }

    async function loadInitialSourcePreview() {
        const requestId = ++sourcePreviewRequestSeq;
        initialSourcePreviewLoaded = false;
        const source = await readActiveSourceImage();
        if (requestId !== sourcePreviewRequestSeq || !activeModal) return null;
        if (!source?.dataUrl) {
            setPreviewImage('');
            setStatus(sourceMissingMessage());
            return null;
        }
        if (!lastPreview?.image_data_url) {
            setPreviewImage(source.dataUrl);
            initialSourcePreviewLoaded = true;
            setStatus(sourceLoadedMessage());
            await loadSourceFaces(source);
        }
        return source;
    }

    async function buildPreviewPayload(isCurrent) {
        const params = readParams();
        const expressionPayload = writeActiveState(params);
        const source = await readActiveSourceImage();
        if (!isCurrent()) return null;
        const reference = await readActiveReferenceImage();
        if (!isCurrent()) return null;
        await loadSourceFaces(source, { quiet: true });
        if (!isCurrent()) return null;
        const sourceFaceBBox = faceBBoxText(activeSession?.faceSelection?.source_face_bbox);
        const referenceFaceBBox = faceBBoxText(activeSession?.faceSelection?.reference_face_bbox);
        return {
            expression_state: JSON.stringify(expressionPayload),
            params,
            source_image: source.dataUrl,
            reference_image: reference.dataUrl,
            source_size: { width: source.width, height: source.height },
            reference_size: { width: reference.width, height: reference.height },
            source_face_bbox: sourceFaceBBox,
            reference_face_bbox: referenceFaceBBox,
            project_id: activeSession?.projectId || 'default',
            node_id: activeSession?.nodeId || activeSession?.node?.id || '',
            source_asset: activeSession?.sourceAsset || null,
            reference_asset: activeSession?.referenceAsset || null
        };
    }

    function resourceMessage(data) {
        if (!data || data.ready) return t('Resources ready.', '资源已就绪。');
        const missing = Array.isArray(data.missing) ? data.missing : [];
        const deps = Array.isArray(data.dependency_missing) ? data.dependency_missing : [];
        const names = missing.map((item) => `${item.category}/${item.filename}`).concat(deps.map((name) => `python:${name}`));
        return names.length ? `${t('Missing resources', '缺少资源')}: ${names.join(', ')}` : t('Resources are not ready.', '资源未就绪。');
    }

    async function checkResources(options) {
        const opts = options || {};
        setBusy(true, t('Checking resources...', '正在检查资源...'));
        const data = await postJson('/liveportrait-expression/status', {});
        setBusy(false);
        const status = data?.status || data;
        if (!(opts.preserveReadyStatus && status?.ready && initialSourcePreviewLoaded)) {
            setStatus(resourceMessage(status), !status?.ready);
        }
        return status;
    }

    async function preview(options) {
        const opts = options || {};
        if (!activeModal || !activeSession) return null;
        if (previewRunning) {
            pendingAutoPreview = true;
            return null;
        }
        previewRunning = true;
        const requestId = ++previewRequestSeq;
        previewRunningRequestId = requestId;
        const modal = activeModal;
        const session = activeSession;
        const isCurrent = () => requestId === previewRequestSeq && activeModal === modal && activeSession === session;
        try {
            setBusy(true, opts.auto ? t('Please wait, updating preview...', '请等待，正在更新预览...') : t('Rendering preview...', '正在生成预览...'));
            const payload = await buildPreviewPayload(isCurrent);
            if (!isCurrent() || !payload) return null;
            if (!payload.source_image) {
                setStatus(sourceMissingMessage(), !opts.auto);
                return null;
            }
            const data = await postJson('/liveportrait-expression/preview', payload);
            if (!isCurrent()) return null;
            if (!data?.ok) {
                const status = data?.status || {};
                setStatus(status?.ready === false ? resourceMessage(status) : (data?.details || data?.error || t('Preview failed.', '预览失败。')), true);
                return null;
            }
            lastPreview = Object.assign({}, data, { params: payload.params, reference_size: payload.reference_size });
            initialSourcePreviewLoaded = false;
            setPreviewImage(data.image_data_url || data.expression_image?.data_url || '');
            setStatus(previewReadyMessage());
            return lastPreview;
        } catch (error) {
            if (isCurrent()) throw error;
            return null;
        } finally {
            if (previewRunningRequestId === requestId) {
                previewRunning = false;
                previewRunningRequestId = 0;
                setBusy(false);
                if (pendingAutoPreview && activeModal && isAutoPreviewEnabled()) {
                    pendingAutoPreview = false;
                    requestAutoPreview('pending');
                }
            }
        }
    }

    async function exportToScene() {
        const session = activeSession;
        const modal = activeModal;
        const isCurrent = () => !!session && activeSession === session && activeModal === modal;
        if (!isCurrent()) return;
        if (sceneExportIsParamsOnly()) {
            writeActiveState(readParams());
            setStatus(t('Parameters saved. Generate uses the current expression JSON.', '参数已保存。Generate 会使用当前表情 JSON。'));
            closeActiveModal();
            return;
        }
        let result = lastPreview;
        if (!result?.image_data_url) {
            result = await preview({ manual: true });
        }
        if (!isCurrent()) return;
        if (!result?.image_data_url) return;
        const payload = {
            image_data_url: result.image_data_url,
            expression_image: result.expression_image || { data_url: result.image_data_url },
            params: readParams(),
            expression_state: JSON.stringify(statePayload(readParams())),
            source_face_bbox: faceBBoxText(activeSession?.faceSelection?.source_face_bbox),
            reference_face_bbox: faceBBoxText(activeSession?.faceSelection?.reference_face_bbox),
            reference_size: result.reference_size || {}
        };
        const target = sceneExpressionConfig().exportTarget || 'scene_input_image1';
        setBridgeValue('liveportrait_expression_scene_target', target);
        setBridgeValue('liveportrait_expression_scene_payload', JSON.stringify(payload));
        clickBridgeButton('liveportrait_expression_scene_apply_btn');
        setStatus(sceneSourceIsVideoFirstFrame()
            ? t('Exported to Input Image 1 as the video reference image.', '已导出到输入图 1，作为视频参考表情图。')
            : t('Exported to Input Image 1. Generate uses the current JSON state.', '已导出到输入图 1。Generate 会使用当前 JSON 状态。'));
        closeActiveModal();
    }

    async function exportToCanvas() {
        const session = activeSession;
        const modal = activeModal;
        const isCurrent = () => !!session && activeSession === session && activeModal === modal;
        if (!isCurrent()) return;
        if (canvasExportIsParamsOnly()) {
            const params = readParams();
            const payload = writeActiveState(params);
            const response = {
                ok: true,
                params,
                expression_state: JSON.stringify(payload),
                source_face_bbox: faceBBoxText(activeSession?.faceSelection?.source_face_bbox),
                reference_face_bbox: faceBBoxText(activeSession?.faceSelection?.reference_face_bbox),
                exported_at: payload.updated_at
            };
            if (typeof session.onConfirm === 'function') session.onConfirm(response);
            if (!isCurrent()) return;
            setStatus(t('Parameters saved. Generate uses the current expression JSON.', '参数已保存。Generate 会使用当前表情 JSON。'));
            closeActiveModal();
            return;
        }
        let result = lastPreview;
        if (!result?.image_data_url) {
            result = await preview({ manual: true });
        }
        if (!isCurrent()) return;
        if (!result?.image_data_url) return;
        const params = readParams();
        const expressionState = JSON.stringify(statePayload(params));
        const sourceAsset = session.sourceAsset || null;
        const referenceAsset = session.referenceAsset || null;
        const sourceFaceBBox = faceBBoxText(session.faceSelection?.source_face_bbox);
        const referenceFaceBBox = faceBBoxText(session.faceSelection?.reference_face_bbox);
        const source = await readOptionImage('canvas_source', 'sourceDataUrl', 'sourceSrc', 'sourceAsset', 'sourceSize');
        if (!isCurrent()) return;
        const reference = await readOptionImage('canvas_reference', 'referenceDataUrl', 'referenceSrc', 'referenceAsset', 'referenceSize');
        if (!isCurrent()) return;
        setBusy(true, t('Exporting to canvas...', '正在导出到画布...'));
        try {
            const data = await postJson('/liveportrait-expression/canvas/export', {
                project_id: session.projectId || 'default',
                node_id: session.nodeId || session.node?.id || '',
                image_data_url: result.image_data_url,
                expression_state: expressionState,
                params,
                source_image: source.dataUrl,
                reference_image: reference.dataUrl,
                source_size: { width: source.width, height: source.height },
                reference_size: { width: reference.width, height: reference.height },
                source_face_bbox: sourceFaceBBox,
                reference_face_bbox: referenceFaceBBox,
                source_asset: sourceAsset,
                reference_asset: referenceAsset
            });
            if (!isCurrent()) return;
            if (!data?.ok) {
                setStatus(data?.details || data?.error || t('Export failed.', '导出失败。'), true);
                return;
            }
            const response = Object.assign({}, data, {
                params,
                expression_state: expressionState,
                preview_image: result.expression_image || { data_url: result.image_data_url },
                source_asset: sourceAsset,
                reference_asset: referenceAsset
            });
            if (typeof session.onConfirm === 'function') session.onConfirm(response);
            if (!isCurrent()) return;
            setStatus(t('Exported to canvas node.', '已导出到画布节点。'));
            closeActiveModal();
        } finally {
            if (isCurrent()) setBusy(false);
        }
    }

    function resetParams() {
        PARAM_GROUPS.forEach((group) => group.items.forEach((item) => {
            syncParamInputs(item[0], item[3], null);
        }));
        setSamplePartValue(DEFAULT_PARAMS.sample_parts);
        markPreviewDirty();
        initialSourcePreviewLoaded = false;
        writeActiveState(DEFAULT_PARAMS);
        if (isAutoPreviewEnabled()) {
            requestAutoPreview('reset');
        } else {
            loadInitialSourcePreview();
            setStatus(t('Parameters reset.', '参数已重置。'));
        }
    }

    function resetSingleParam(key) {
        const def = paramDefinition(key);
        if (!def) return;
        syncParamInputs(key, def[3], null);
        handleParamChange(`reset:${key}`);
    }

    function handleParamChange(reason) {
        writeActiveState(readParams());
        renderFaceBoxes();
        if (String(reason || '').includes('crop_factor')) showCropOverlayTemporarily();
        markPreviewDirty();
        if (isAutoPreviewEnabled()) {
            requestAutoPreview(reason);
        } else {
            setStatus(t('Parameters updated.', '参数已更新。'));
        }
    }

    function recordParamDraft(source) {
        writeActiveState(readParams());
        renderFaceBoxes();
        if (source?.getAttribute?.('data-lpe-param') === 'crop_factor') showCropOverlayTemporarily();
        markPreviewDirty();
        if (isAutoPreviewEnabled()) {
            const isRange = String(source?.type || '').toLowerCase() === 'range';
            setStatus(isRange ? t('Release to update preview.', '松开后更新预览。') : t('Confirm the value to update preview.', '确认数值后更新预览。'));
        } else {
            setStatus(t('Parameters updated.', '参数已更新。'));
        }
    }

    function bindModal(modal) {
        modal.addEventListener('click', (event) => {
            const faceButton = event.target.closest?.('[data-lpe-face-index]');
            if (faceButton) {
                event.preventDefault();
                selectSourceFace(faceButton.getAttribute('data-lpe-face-index'));
                return;
            }
            const resetButton = event.target.closest?.('[data-lpe-reset-param]');
            if (resetButton) {
                event.preventDefault();
                resetSingleParam(resetButton.getAttribute('data-lpe-reset-param'));
                return;
            }
            const samplePartButton = event.target.closest?.('[data-lpe-sample-part]');
            if (samplePartButton) {
                event.preventDefault();
                setSamplePartValue(samplePartButton.getAttribute('data-lpe-sample-part'));
                handleParamChange('sample_parts');
                return;
            }
            const actionButton = event.target.closest?.('[data-lpe-action]');
            if (!actionButton) {
                if (event.target === modal) closeActiveModal();
                return;
            }
            const action = actionButton.getAttribute('data-lpe-action');
            if (action === 'close') closeActiveModal();
            else if (action === 'status') checkResources();
            else if (action === 'reset') resetParams();
            else if (action === 'preview') preview({ manual: true });
            else if (action === 'export') {
                if (activeSession?.context === 'canvas') exportToCanvas();
                else exportToScene();
            }
        });
        modal.addEventListener('input', (event) => {
            const input = event.target.closest?.('[data-lpe-param]');
            if (!input || input.tagName === 'SELECT' || input.type === 'hidden') return;
            const key = input.getAttribute('data-lpe-param');
            syncParamInputs(key, input.value, input);
            recordParamDraft(input);
        });
        modal.addEventListener('change', (event) => {
            const autoToggle = event.target.closest?.('[data-lpe-auto-preview]');
            if (autoToggle) {
                pendingAutoPreview = false;
                if (autoToggle.checked) {
                    requestAutoPreview('toggle');
                } else {
                    setStatus(t('Auto preview is off. Use Preview when ready.', '自动预览已关闭，可手动点击预览。'));
                }
                return;
            }
            const input = event.target.closest?.('[data-lpe-param]');
            if (!input) return;
            if (input.type === 'hidden') return;
            if (previewRunning && input.tagName !== 'SELECT') return;
            if (input.tagName !== 'SELECT') syncParamInputs(input.getAttribute('data-lpe-param'), input.value, input);
            handleParamChange('change');
        });
    }

    function closeActiveModal() {
        previewRequestSeq += 1;
        sourcePreviewRequestSeq += 1;
        faceDetectionRequestSeq += 1;
        if (cropOverlayTimer) window.clearTimeout(cropOverlayTimer);
        cropOverlayTimer = 0;
        lastPreview = null;
        previewRunning = false;
        previewRunningRequestId = 0;
        pendingAutoPreview = false;
        initialSourcePreviewLoaded = false;
        if (activeModal && activeModal.parentElement) activeModal.remove();
        activeModal = null;
        activeSession = null;
        unbindModalScrollGuards();
        return true;
    }

    function closeScenePreset() {
        if (activeSession?.context && activeSession.context !== 'scene_preset') return false;
        return closeActiveModal();
    }

    async function initializeOpenPreview() {
        const session = activeSession;
        const source = await loadInitialSourcePreview();
        if (!activeModal || activeSession !== session) return;
        if (!source?.dataUrl) return;
        if (session?.previewOnOpen && isAutoPreviewEnabled()) {
            requestAutoPreview('open_saved_state');
        }
    }

    function open(options) {
        closeActiveModal();
        const opts = options || {};
        activeModal = createModal(opts);
        resolveModalMount(opts).appendChild(activeModal);
        bindModalScrollGuards();
        initializeOpenPreview();
        checkResources({ preserveReadyStatus: true });
        return true;
    }

    function openScenePreset() {
        return open({ context: 'scene_preset' });
    }

    function bindSceneEntry() {
        if (sceneBridgeAttached) return;
        sceneBridgeAttached = true;
        document.addEventListener('click', (event) => {
            const target = event.target.closest?.('[data-liveportrait-expression-scene-open]');
            if (!target) return;
            event.preventDefault();
            openScenePreset();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const target = event.target.closest?.('[data-liveportrait-expression-scene-open]');
            if (!target) return;
            event.preventDefault();
            openScenePreset();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && activeModal) closeActiveModal();
        });
    }

    bindSceneEntry();

    window.SimpAILivePortraitExpressionEditor = Object.assign(window.SimpAILivePortraitExpressionEditor || {}, {
        open,
        openScenePreset,
        close: closeActiveModal,
        closeScenePreset,
        readParams,
        writeScenePromptState
    });
})();
