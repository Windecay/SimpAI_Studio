(function () {
    'use strict';

    const PAGE_SIZE = 36;
    const TYPE_LABELS = {
        base: { en: 'Base Model', cn: '基础模型' },
        refiner: { en: 'Refiner', cn: '精修模型' },
        lora: { en: 'LoRA', cn: 'LoRA' },
        style: { en: 'Style Model', cn: '风格模型' },
        upscale: { en: 'Upscale Model', cn: '放大模型' },
        clip: { en: 'CLIP / Text Encoder', cn: 'CLIP / 文本编码器' },
        vae: { en: 'VAE', cn: 'VAE' }
    };
    const KNOWN_TEXT = {
        'Model Browser': { en: 'Model Browser', cn: '模型浏览器' },
        'Browse Base Model': { en: 'Browse Base Model', cn: '浏览基础模型' },
        'Browse Refiner Model': { en: 'Browse Refiner Model', cn: '浏览精修模型' },
        'Browse CLIP / Text Encoder': { en: 'Browse CLIP / Text Encoder', cn: '浏览 CLIP / 文本编码器' },
        'Browse VAE': { en: 'Browse VAE', cn: '浏览 VAE' },
        'Browse Upscale Model': { en: 'Browse Upscale Model', cn: '浏览放大模型' }
    };
    const TYPE_BY_DROPDOWN = {
        model_dropdown_base: 'base',
        model_dropdown_refiner: 'refiner',
        model_dropdown_clip: 'clip',
        model_dropdown_vae: 'vae',
        model_dropdown_upscale: 'upscale'
    };
    const REMOTE_DISABLED_TYPES = new Set(['clip', 'vae']);
    const ARCH_FAMILY_OPTIONS = [
        ['unknown', { en: 'Unknown / keep visible', cn: '未知 / 保持显示' }],
        ['sdxl', { en: 'SDXL / SD1.5-compatible', cn: 'SDXL / SD1.5 兼容' }],
        ['sd3', { en: 'SD3', cn: 'SD3' }],
        ['sd2', { en: 'SD2', cn: 'SD2' }],
        ['flux', { en: 'Flux', cn: 'Flux' }],
        ['wan', { en: 'Wan', cn: 'Wan' }],
        ['ltx2', { en: 'LTX', cn: 'LTX' }],
        ['anima', { en: 'Anima', cn: 'Anima' }],
        ['qwen', { en: 'Qwen', cn: 'Qwen' }],
        ['z_image', { en: 'Z-image', cn: 'Z-image' }],
        ['hunyuan', { en: 'Hunyuan', cn: 'Hunyuan' }],
        ['sdpose', { en: 'SDPose', cn: 'SDPose' }],
        ['melband_roformer', { en: 'MelBand RoFormer', cn: 'MelBand RoFormer' }],
        ['newbie', { en: 'NewBie', cn: 'NewBie' }]
    ];
    const I18N = window.SimpAII18n || {};

    let modal = null;
    let debounceTimer = null;
    let requestId = 0;
    let state = initialState();

    function initialState() {
        return {
            open: false,
            loading: false,
            type: 'base',
            title: 'Model Browser',
            search: '',
            folder: 'All folders',
            sort: 'name',
            page: 1,
            pageSize: PAGE_SIZE,
            total: 0,
            hasMore: false,
            folders: ['All folders'],
            types: [],
            items: [],
            selectedId: '',
            checkedIds: new Set(),
            status: '',
            context: {},
            useModelFilter: true,
            allowTypeSwitch: false,
            onSelect: null,
            batch: null,
            mobileBatchExpanded: false,
            mobileDetailOpen: false
        };
    }

    function mobileLayoutActive() {
        return !!window.matchMedia?.('(max-width: 640px), (pointer: coarse) and (max-width: 900px)')?.matches;
    }

    function langSource() {
        return state?.context || {};
    }

    function tr(en, cn) {
        const i18n = window.SimpAII18n || I18N;
        if (i18n.t) return i18n.t(en, cn, langSource());
        const text = String(en ?? '');
        if (String(window.locale_lang || '').toLowerCase().startsWith('en')) return text;
        return String(cn ?? text);
    }

    function localize(value, fallback) {
        const i18n = window.SimpAII18n || I18N;
        if (i18n.localize) return i18n.localize(value, fallback, langSource());
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return tr(value.en ?? fallback ?? '', value.cn ?? value.zh ?? fallback ?? value.en ?? '');
        }
        return String(value ?? fallback ?? '');
    }

    function knownText(value, fallback) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return localize(value, fallback);
        }
        const text = String(value || '').trim();
        if (KNOWN_TEXT[text]) return localize(KNOWN_TEXT[text], text);
        return text || localize(fallback || KNOWN_TEXT['Model Browser'], 'Model Browser');
    }

    function typeLabel(type) {
        const key = normalizeType(type);
        return localize(TYPE_LABELS[key] || TYPE_LABELS.base, key);
    }

    function allFoldersLabel() {
        return tr('All folders', '全部文件夹');
    }

    function mergeContext(opts) {
        const options = opts || {};
        const context = Object.assign({}, options.context || {});
        const lang = options.__lang || options.lang || options.language || window.simpleaiTopbarSystemParams?.__lang || window.locale_lang || '';
        if (lang && !context.__lang) context.__lang = lang;
        const topbar = window.simpleaiTopbarSystemParams || {};
        if (!context.state_params && topbar && typeof topbar === 'object') context.state_params = topbar;
        if (!context.engine && !context.backend_engine) {
            context.backend_engine = topbar.backend_engine || topbar.__backend_engine || topbar.task_class_name || '';
        }
        if (!context.task_method) {
            context.task_method = topbar.task_method || topbar.__scene_task_method || '';
        }
        return context;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function safeHttpUrl(value) {
        try {
            const url = new URL(String(value || ''));
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch (err) {
            return '';
        }
    }

    function formatNumber(value) {
        const number = Number(value || 0);
        return Number.isFinite(number) ? new Intl.NumberFormat().format(number) : '';
    }

    function normalizeType(value) {
        const text = String(value || '').toLowerCase();
        if (text.startsWith('lora')) return 'lora';
        if (text.includes('refiner')) return 'refiner';
        if (text.includes('clip')) return 'clip';
        if (text.includes('vae')) return 'vae';
        if (text.includes('upscale')) return 'upscale';
        if (text.includes('style')) return 'style';
        return TYPE_LABELS[text] ? text : 'base';
    }

    function normalizeModelReference(value) {
        return String(value ?? '')
            .trim()
            .replaceAll('\\', '/')
            .replace(/^\.\/+/, '')
            .replace(/\/{2,}/g, '/')
            .toLowerCase();
    }

    function modelItemLabel(item) {
        return String(item?.file_name || item?.display_name || item?.name || '').trim();
    }

    function isModelPlaceholder(value) {
        const text = String(value || '').trim().toLowerCase();
        return !text || ['none', 'default', 'default (model)'].includes(text);
    }

    function currentModelNames() {
        const raw = Array.isArray(state?.context?.current_model_names)
            ? state.context.current_model_names
            : [];
        const seen = new Set();
        return raw
            .map(value => String(value || '').trim())
            .filter(value => !isModelPlaceholder(value))
            .filter(value => {
                const key = normalizeModelReference(value);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function isCurrentModel(item) {
        const current = new Set(currentModelNames().map(normalizeModelReference));
        if (!current.size) return false;
        return [item?.name, item?.relative_path, item?.display_name, item?.file_name]
            .map(normalizeModelReference)
            .filter(Boolean)
            .some(value => current.has(value));
    }

    function modelFilterAvailableForType(type) {
        return normalizeType(type) !== 'style';
    }

    function boolOption(value, fallback) {
        if (value === undefined || value === null) return fallback;
        if (typeof value === 'boolean') return value;
        const text = String(value).trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(text)) return true;
        if (['0', 'false', 'no', 'off'].includes(text)) return false;
        return fallback;
    }

    function readMainModelFilterEnabled() {
        const roots = [];
        try {
            const app = typeof gradioApp === 'function' ? gradioApp() : null;
            if (app) roots.push(app);
        } catch (err) {}
        roots.push(document);
        for (const root of roots) {
            const input = root?.querySelector?.('.use_model_filter_checkbox input[type="checkbox"], [data-testid="Use Model Filters"] input[type="checkbox"]');
            if (input) return !!input.checked;
        }
        return true;
    }

    function resolveInitialModelFilter(opts, context) {
        const options = opts || {};
        return boolOption(
            options.useModelFilter ?? options.use_model_filter ?? context?.use_model_filter ?? context?.model_filter ?? context?.modelFilter,
            readMainModelFilterEnabled()
        );
    }

    async function postJson(url, payload) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {})
        });
        let data = null;
        try {
            data = await response.json();
        } catch (err) {
            data = null;
        }
        if (!response.ok) {
            const message = data?.error || data?.details || `HTTP ${response.status}`;
            throw new Error(message);
        }
        return data || { ok: false, error: 'empty response' };
    }

    function scrollableOverflow(value) {
        return /auto|scroll|overlay/i.test(String(value || ''));
    }

    function findModalWheelScroller(target, root) {
        let node = target instanceof Element ? target : target?.parentElement;
        while (node && node !== root && node !== document.documentElement) {
            const style = getComputedStyle(node);
            const canScrollY = scrollableOverflow(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
            const canScrollX = scrollableOverflow(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
            if (canScrollY || canScrollX) return node;
            node = node.parentElement;
        }
        return null;
    }

    function canWheelScrollAxis(scroller, axis, delta) {
        if (!scroller || Math.abs(delta || 0) < 0.01) return false;
        if (axis === 'x') {
            const maxLeft = scroller.scrollWidth - scroller.clientWidth;
            if (maxLeft <= 1) return false;
            return delta < 0 ? scroller.scrollLeft > 0 : scroller.scrollLeft < maxLeft - 1;
        }
        const maxTop = scroller.scrollHeight - scroller.clientHeight;
        if (maxTop <= 1) return false;
        return delta < 0 ? scroller.scrollTop > 0 : scroller.scrollTop < maxTop - 1;
    }

    function containModelBrowserWheel(event) {
        if (!state.open || !modal || modal.hidden) return;
        const scroller = findModalWheelScroller(event.target, modal);
        const canScroll = scroller && (
            canWheelScrollAxis(scroller, 'y', event.deltaY) ||
            canWheelScrollAxis(scroller, 'x', event.deltaX)
        );
        if (!canScroll) event.preventDefault();
        event.stopPropagation();
    }

    function ensureModal(container) {
        const mount = container && container.appendChild ? container : document.body;
        if (modal && modal.isConnected) {
            if (modal.parentElement !== mount) mount.appendChild(modal);
            return modal;
        }
        modal = document.createElement('section');
        modal.className = 'sai-model-browser-v2';
        modal.hidden = true;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'sai-model-browser-title');
        mount.appendChild(modal);
        modal.addEventListener('click', onClick);
        modal.addEventListener('input', onInput);
        modal.addEventListener('change', onChange);
        modal.addEventListener('wheel', containModelBrowserWheel, { passive: false, capture: true });
        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (state.mobileDetailOpen && mobileLayoutActive()) {
                    state.mobileDetailOpen = false;
                    render({ preserveScroll: true });
                } else {
                    close();
                }
                return;
            }
            if ((event.key === 'Enter' || event.key === ' ') && event.target?.closest?.('[data-smb-select]')) {
                event.preventDefault();
                const selected = event.target.closest('[data-smb-select]');
                state.selectedId = selected.getAttribute('data-smb-select');
                state.mobileDetailOpen = mobileLayoutActive();
                render({ preserveScroll: true });
            }
        });
        return modal;
    }

    function currentPayload(extra) {
        return Object.assign({}, state.context || {}, {
            type: state.type,
            search: state.search,
            folder: state.folder,
            sort: state.sort,
            page: state.page,
            page_size: state.pageSize,
            use_model_filter: modelFilterAvailableForType(state.type) ? !!state.useModelFilter : false
        }, extra || {});
    }

    async function query(options) {
        const id = ++requestId;
        state.loading = true;
        state.status = '';
        render(options);
        const payloadExtra = options?.forceRefresh ? { force_refresh: true } : null;
        try {
            const data = await postJson('/model-browser/query', currentPayload(payloadExtra));
            if (id !== requestId) return;
            state.items = Array.isArray(data.items) ? data.items : [];
            state.total = Number(data.total || 0);
            state.hasMore = !!data.has_more;
            state.folders = Array.isArray(data.folders) && data.folders.length ? data.folders : ['All folders'];
            state.types = Array.isArray(data.types) ? data.types : [];
            state.loading = false;
            if (!state.items.some(item => item.id === state.selectedId)) {
                state.selectedId = state.items[0]?.id || '';
            }
            render(options);
        } catch (err) {
            if (id !== requestId) return;
            state.loading = false;
            state.status = err?.message || String(err || tr('Model browser query failed', '模型浏览器查询失败'));
            render(options);
        }
    }

    function selectedItem() {
        return state.items.find(item => item.id === state.selectedId) || state.items[0] || null;
    }

    function checkedItems() {
        return state.items.filter(item => state.checkedIds.has(item.id));
    }

    function fetchableBatchItems() {
        const checked = checkedItems();
        const items = checked.length ? checked : [selectedItem()].filter(Boolean);
        return items.filter(item => item.remote_enabled && !item.synthetic);
    }

    function needsRemoteFetch(item) {
        if (item?.remote_status === 'not_found' && item?.metadata_status !== 'missing') return false;
        return !!item && item.remote_enabled && !item.synthetic && (!item.preview_url || item.metadata_status === 'missing');
    }

    function manageableItem(item) {
        return !!item && !item.synthetic && item.path_exists !== false;
    }

    function architectureItem(item) {
        return manageableItem(item) && !!item.arch_family_manageable;
    }

    function inspectableBatchItems() {
        const checked = checkedItems().filter(architectureItem);
        if (checked.length) return checked;
        const item = selectedItem();
        return architectureItem(item) ? [item] : [];
    }

    function selectablePageItems() {
        return state.items.filter(item => item && !item.synthetic);
    }

    function allSelectablePageItemsChecked() {
        const items = selectablePageItems();
        return items.length > 0 && items.every(item => state.checkedIds.has(item.id));
    }

    function architectureAvailableForType(type) {
        return ['base', 'refiner', 'lora'].includes(normalizeType(type));
    }

    function remoteFetchEnabledForType() {
        return !REMOTE_DISABLED_TYPES.has(normalizeType(state.type));
    }

    function itemSubtitle(item) {
        const bits = [];
        if (item.folder && item.folder !== 'Root') bits.push(item.folder);
        if (item.arch_family && item.arch_family !== 'unknown') bits.push(archFamilyLabel(item.arch_family));
        if (item.size_label) bits.push(item.size_label);
        if (item.modified_label) bits.push(item.modified_label);
        return bits.join(' - ');
    }

    function hashSourceLabel(source) {
        const key = String(source || '').toLowerCase();
        if (key === 'computed') return tr('computed', '已计算');
        if (key === 'sidecar') return tr('local', '本地');
        if (key === 'models_info') return tr('models_info', '索引表');
        if (key === 'cached') return tr('cached', '缓存');
        if (key === 'civitai-header-match') return tr('header matched', '模型头匹配');
        if (key === 'civitai') return tr('Civitai', 'Civitai');
        return source || '';
    }

    function archFamilyLabel(value) {
        const key = String(value || 'unknown').toLowerCase();
        const found = ARCH_FAMILY_OPTIONS.find(option => option[0] === key);
        return found ? localize(found[1], key) : (value || tr('Unknown', '未知'));
    }

    function archFamilySourceLabel(value) {
        const key = String(value || '').toLowerCase();
        if (key === 'weight_inspector') return tr('Model header', '模型头');
        if (key === 'manual') return tr('Manual', '手动');
        if (key === 'builtin_model_arch_family_cache') return tr('SimpAI cache', 'SimpAI 缓存');
        if (key === 'name_rule') return tr('Name rule', '名称规则');
        if (key === 'civitai') return tr('Civitai base model', 'Civitai 基础模型');
        return key || tr('Not set', '未设置');
    }

    function renderThumb(item) {
        if (item.preview_url) {
            return `<img src="${escapeHtml(item.preview_url)}" alt="" loading="lazy">`;
        }
        const icon = item.synthetic ? 'fa-circle-dot' : item.type === 'lora' ? 'fa-cubes' : 'fa-boxes-stacked';
        return `<span class="sai-model-browser-empty-thumb"><i class="fa-solid ${icon}"></i></span>`;
    }

    function renderCard(item) {
        const checked = state.checkedIds.has(item.id);
        const selected = state.selectedId === item.id;
        const current = isCurrentModel(item);
        const label = modelItemLabel(item);
        const fetchable = item.remote_enabled && !item.synthetic;
        return `<article class="sai-model-browser-card ${selected ? 'is-selected ' : ''}${current ? 'is-current' : ''}" data-smb-item="${escapeHtml(item.id)}">
  <div role="button" tabindex="0" class="sai-model-browser-card-main" data-smb-select="${escapeHtml(item.id)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
    <span class="sai-model-browser-thumb">${renderThumb(item)}</span>
    ${current ? `<span class="sai-model-browser-current-badge"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>${escapeHtml(tr('In use', '使用中'))}</span></span>` : ''}
    <span class="sai-model-browser-card-title" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
    <span class="sai-model-browser-card-sub">${escapeHtml(itemSubtitle(item) || typeLabel(item.type) || item.type_label || '')}</span>
  </div>
  <div class="sai-model-browser-card-actions">
    <button type="button" data-smb-toggle="${escapeHtml(item.id)}" class="${checked ? 'is-on' : ''}" title="${escapeHtml(tr('Select for batch', '加入批量选择'))}"><i class="fa-solid ${checked ? 'fa-square-check' : 'fa-square'}"></i></button>
    ${fetchable ? `<button type="button" data-smb-fetch="${escapeHtml(item.id)}" title="${escapeHtml(tr('Analyze model and fetch information', '分析模型并获取信息'))}"><i class="fa-solid fa-cloud-arrow-down"></i></button>` : ''}
    <button type="button" data-smb-choose="${escapeHtml(item.id)}" title="${escapeHtml(tr('Use this model', '使用此模型'))}"><i class="fa-solid fa-check"></i></button>
  </div>
</article>`;
    }

    function triggerWordsSourceLabel(item) {
        const source = String(item?.trigger_words_source || '').toLowerCase();
        if (source === 'user') return tr('CSV user setting', 'CSV 用户设定');
        if (source === 'metadata') return tr('Metadata fallback', '元数据 fallback');
        return tr('No trigger words', '无触发词');
    }

    function triggerWordsText(item) {
        if (typeof item?.trigger_words_text === 'string') return item.trigger_words_text;
        return Array.isArray(item?.trained_words) ? item.trained_words.join(', ') : '';
    }

    function renderTriggerWordsPanel(item) {
        if (!item || item.type !== 'lora' || item.synthetic) return '';
        const words = Array.isArray(item.trained_words) ? item.trained_words : [];
        const source = String(item.trigger_words_source || 'none').toLowerCase();
        const saveLabel = source === 'user' ? tr('Save', '保存') : tr('Save as user setting', '保存为用户设定');
        const chips = words.length
            ? words.slice(0, 30).map(word => `<button type="button" data-smb-trigger-word="${escapeHtml(word)}" title="${escapeHtml(tr('Send this trigger word to prompt', '发送这个触发词到提示词'))}">${escapeHtml(word)}</button>`).join('')
            : `<span>${escapeHtml(tr('No trigger words', '无触发词'))}</span>`;
        return `<section class="sai-model-browser-trigger-words">
  <div class="sai-model-browser-trigger-head">
    <b>${escapeHtml(tr('Trigger words', '触发词'))}</b>
    <small>${escapeHtml(triggerWordsSourceLabel(item))}</small>
  </div>
  <div class="sai-model-browser-trigger-tags">${chips}</div>
  <textarea data-smb-trigger-input rows="3" placeholder="${escapeHtml(tr('Input LoRA trigger words', '输入 LoRA 触发词'))}">${escapeHtml(triggerWordsText(item))}</textarea>
  <div class="sai-model-browser-trigger-actions">
    <button type="button" data-smb-trigger-send><i class="fa-solid fa-paper-plane"></i><span>${escapeHtml(tr('Send to prompt', '发送到提示词'))}</span></button>
    <button type="button" class="is-primary" data-smb-trigger-save><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(saveLabel)}</span></button>
  </div>
</section>`;
    }

    function renderArchitecturePanel(item) {
        if (!architectureItem(item)) return '';
        const current = String(item.arch_family || 'unknown').toLowerCase() || 'unknown';
        const options = ARCH_FAMILY_OPTIONS
            .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(localize(label, value))}</option>`)
            .join('');
        return `<section class="sai-model-browser-arch">
  <div class="sai-model-browser-arch-head">
    <b>${escapeHtml(tr('Architecture classification', '架构分类'))}</b>
    <small>${escapeHtml(archFamilySourceLabel(item.arch_family_source))}</small>
  </div>
  <div class="sai-model-browser-arch-current">
    <span>${escapeHtml(archFamilyLabel(current))}</span>
    <small>${escapeHtml(tr('Used by model filters', '用于模型过滤'))}</small>
  </div>
  <div class="sai-model-browser-arch-edit">
    <select data-smb-arch-family>${options}</select>
    <button type="button" data-smb-arch-save><i class="fa-solid fa-floppy-disk"></i><span>${escapeHtml(tr('Save', '保存'))}</span></button>
  </div>
  <button type="button" class="is-primary" data-smb-arch-inspect="${escapeHtml(item.id)}"><i class="fa-solid fa-magnifying-glass-chart"></i><span>${escapeHtml(tr('Read model header', '读取模型头'))}</span></button>
</section>`;
    }

    function renderDetail(item) {
        if (!item) {
            return `<aside class="sai-model-browser-detail"><p>${escapeHtml(tr('Select a model to inspect it.', '选择一个模型查看详情。'))}</p></aside>`;
        }
        const current = isCurrentModel(item);
        const label = modelItemLabel(item);
        const tags = [...(item.trained_words || []), ...(item.tags || [])].slice(0, 16);
        const hashSource = hashSourceLabel(item.hash_source);
        const hashValue = String(item.sha256 || '');
        const hashLabel = hashValue || (item.hash_stale ? tr('Stale; recompute required', '文件已变化，需要重新计算') : tr('Unknown', '未知'));
        const civitaiUrl = safeHttpUrl(item.civitai_url);
        return `<aside class="sai-model-browser-detail">
  <div class="sai-model-browser-detail-preview">${renderThumb(item)}</div>
  <h3 title="${escapeHtml(label)}">${escapeHtml(label)}</h3>
  ${current ? `<div class="sai-model-browser-current-detail"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>${escapeHtml(tr('In use', '使用中'))}</span></div>` : ''}
  <dl>
    <dt>${escapeHtml(tr('Type', '类型'))}</dt><dd>${escapeHtml(typeLabel(item.type) || item.type_label || item.type || '')}</dd>
    <dt>${escapeHtml(tr('Folder', '文件夹'))}</dt><dd>${escapeHtml(item.folder || tr('Root', '根目录'))}</dd>
    <dt>${escapeHtml(tr('SHA256', 'SHA256'))}</dt><dd class="sai-model-browser-hash"><code title="${escapeHtml(hashLabel)}">${escapeHtml(hashLabel)}</code>${hashValue ? `<button type="button" data-smb-copy-hash="${escapeHtml(hashValue)}" title="${escapeHtml(tr('Copy full SHA256', '复制完整 SHA256'))}"><i class="fa-regular fa-copy"></i></button>` : ''}${hashSource ? `<small>${escapeHtml(hashSource)}</small>` : ''}</dd>
    <dt>${escapeHtml(tr('Preview', '预览'))}</dt><dd>${escapeHtml(item.preview_source || tr('none', '无'))}</dd>
    <dt>${escapeHtml(tr('Metadata', '元数据'))}</dt><dd>${escapeHtml(item.metadata_status || tr('missing', '缺失'))}</dd>
    ${item.metadata_origin ? `<dt>${escapeHtml(tr('Source', '信息来源'))}</dt><dd>${escapeHtml(item.metadata_origin)}</dd>` : ''}
    ${item.remote_model_name ? `<dt>${escapeHtml(tr('Model', '模型'))}</dt><dd>${escapeHtml(item.remote_model_name)}</dd>` : ''}
    ${item.remote_version_name ? `<dt>${escapeHtml(tr('Version', '版本'))}</dt><dd>${escapeHtml(item.remote_version_name)}</dd>` : ''}
    ${item.base_model ? `<dt>${escapeHtml(tr('Base', '基础'))}</dt><dd>${escapeHtml(item.base_model)}</dd>` : ''}
    ${item.creator ? `<dt>${escapeHtml(tr('Creator', '作者'))}</dt><dd>${escapeHtml(item.creator)}</dd>` : ''}
    ${Number(item.download_count || 0) > 0 ? `<dt>${escapeHtml(tr('Downloads', '下载量'))}</dt><dd>${escapeHtml(formatNumber(item.download_count))}</dd>` : ''}
    ${Number(item.rating || 0) > 0 ? `<dt>${escapeHtml(tr('Rating', '评分'))}</dt><dd>${escapeHtml(Number(item.rating).toFixed(2))}</dd>` : ''}
    ${civitaiUrl ? `<dt>Civitai</dt><dd><a class="sai-model-browser-link" href="${escapeHtml(civitaiUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tr('Open model page', '打开模型页面'))}<i class="fa-solid fa-arrow-up-right-from-square"></i></a></dd>` : ''}
  </dl>
  ${renderArchitecturePanel(item)}
  ${tags.length ? `<div class="sai-model-browser-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
  ${renderTriggerWordsPanel(item)}
  ${item.description ? `<p class="sai-model-browser-desc">${escapeHtml(item.description)}</p>` : ''}
  <div class="sai-model-browser-detail-actions">
    ${manageableItem(item) ? `<button type="button" data-smb-set-preview="${escapeHtml(item.id)}"><i class="fa-solid fa-image"></i><span>${escapeHtml(item.preview_url ? tr('Replace preview', '替换预览图') : tr('Set preview', '设置预览图'))}</span></button>` : ''}
    ${item.remote_enabled && !item.synthetic ? `<button type="button" data-smb-fetch="${escapeHtml(item.id)}"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(tr('Analyze and fetch', '分析并获取'))}</span></button>` : ''}
    ${manageableItem(item) ? `<button type="button" data-smb-hash="${escapeHtml(item.id)}"><i class="fa-solid fa-fingerprint"></i><span>${escapeHtml(item.sha256 ? tr('Recompute hash', '重新计算哈希') : tr('Compute hash', '计算哈希'))}</span></button>` : ''}
    ${manageableItem(item) ? `<button type="button" class="is-danger" data-smb-delete="${escapeHtml(item.id)}"><i class="fa-solid fa-trash"></i><span>${escapeHtml(tr('Delete model', '删除模型'))}</span></button>` : ''}
    <button type="button" class="is-primary" data-smb-choose="${escapeHtml(item.id)}"><i class="fa-solid fa-check"></i><span>${escapeHtml(tr('Use model', '使用模型'))}</span></button>
  </div>
</aside>`;
    }

    function renderProgress() {
        if (!state.batch) return '';
        const total = Math.max(1, Number(state.batch.total || 1));
        const done = Math.min(total, Number(state.batch.done || 0));
        const pct = Math.round(done / total * 100);
        return `<div class="sai-model-browser-progress">
  <div><b>${escapeHtml(state.batch.label || tr('Fetching', '正在获取'))}</b><span>${done}/${total}</span></div>
  <span><i style="width:${pct}%"></i></span>
  <small>${escapeHtml(state.batch.message || '')}</small>
</div>`;
    }

    function renderBatchBar() {
        const checkedCount = checkedItems().length;
        const totalCheckedCount = state.checkedIds.size;
        const batchCount = fetchableBatchItems().length;
        const inspectCount = inspectableBatchItems().length;
        const canRemoteFetch = remoteFetchEnabledForType();
        const canInspectFilter = architectureAvailableForType(state.type);
        const selectableCount = selectablePageItems().length;
        const pageChecked = allSelectablePageItemsChecked();
        const batchBusy = !!state.batch && Number(state.batch.done || 0) < Math.max(1, Number(state.batch.total || 1));
        const selectedLabel = checkedCount
            ? `${tr('Analyze checked', '分析已勾选')} (${checkedCount})`
            : tr('Analyze selected', '分析当前选择');
        const selectedTitle = canRemoteFetch
            ? tr('Fetch previews and metadata for the selected or checked models', '获取已选择/已勾选模型的预览与元数据')
            : tr('{type} is selectable, but remote preview fetching is disabled', '{type} 可以浏览和选择，但已关闭远端预览获取').replace('{type}', typeLabel(state.type));
        const batchHint = canRemoteFetch
            ? tr('Analyze missing models using the current type, search, and folder filter.', '分析缺失项会使用当前类型、搜索词和文件夹筛选。')
            : tr('{type} can be browsed and selected; remote preview fetching is disabled.', '{type} 可以浏览和选择；远端预览获取已关闭。').replace('{type}', typeLabel(state.type));
        const mobileBatchSummary = totalCheckedCount
            ? tr('{count} selected', '已选 {count} 个').replace('{count}', totalCheckedCount)
            : tr('No selection', '未选择');
        const mobileBatchOpen = state.mobileBatchExpanded || batchBusy;
        const currentNames = currentModelNames();
        const currentUsage = currentNames.length
            ? `<div class="sai-model-browser-current-usage">
  <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
  <div><b>${escapeHtml(tr('Currently in use', '当前使用中'))}</b><span>${currentNames.map(name => `<span title="${escapeHtml(name)}">${escapeHtml(name)}</span>`).join('')}</span></div>
</div>`
            : '';
        return `<div class="sai-model-browser-batchbar ${mobileBatchOpen ? 'is-mobile-open' : ''}">
  ${currentUsage}
  <button type="button" class="sai-model-browser-batchtoggle" data-smb-batch-toggle aria-expanded="${mobileBatchOpen ? 'true' : 'false'}">
    <span><i class="fa-solid fa-list-check"></i>${escapeHtml(tr('Batch tools', '批量操作'))}</span>
    <small>${escapeHtml(mobileBatchSummary)}</small>
    <i class="fa-solid fa-chevron-${mobileBatchOpen ? 'up' : 'down'}"></i>
  </button>
  <div class="sai-model-browser-batchcopy">
    <b>${escapeHtml(tr('Batch model information', '批量模型信息'))}</b>
    <span>${escapeHtml(batchHint)}</span>
  </div>
  ${renderProgress()}
  <div class="sai-model-browser-batchactions">
    <button type="button" data-smb-select-page ${selectableCount && !batchBusy ? '' : 'disabled'} title="${escapeHtml(tr('Select or deselect every model on the current page', '选择或取消当前页的全部模型'))}">
      <i class="fa-solid ${pageChecked ? 'fa-square-minus' : 'fa-list-check'}"></i><span>${escapeHtml(pageChecked ? tr('Deselect page', '取消本页') : tr('Select page', '全选本页'))}</span>
    </button>
    <button type="button" data-smb-clear-selection ${totalCheckedCount && !batchBusy ? '' : 'disabled'} title="${escapeHtml(tr('Clear checked models', '取消全部勾选'))}">
      <i class="fa-solid fa-xmark"></i><span>${escapeHtml(tr('Clear', '取消选择'))}</span>
    </button>
    <button type="button" data-smb-batch-selected ${batchCount && !batchBusy ? '' : 'disabled'} title="${escapeHtml(selectedTitle)}">
      <i class="fa-solid fa-cloud-arrow-down"></i><span>${escapeHtml(selectedLabel)}</span>
    </button>
    <button type="button" class="is-primary" data-smb-batch-all-info ${canRemoteFetch && !batchBusy ? '' : 'disabled'} title="${escapeHtml(canRemoteFetch ? tr('Analyze every model in the current filter', '分析当前筛选范围内的全部模型') : tr('Remote preview fetching is disabled for this model type', '此模型类型已关闭远端预览获取'))}">
      <i class="fa-solid fa-cloud-arrow-down"></i><span>${escapeHtml(tr('Analyze all info', '读取全部信息'))}</span>
    </button>
    <button type="button" data-smb-batch-missing ${canRemoteFetch && !batchBusy ? '' : 'disabled'} title="${escapeHtml(canRemoteFetch ? tr('Fetch missing previews and metadata for the current filter', '获取当前筛选范围内缺失的预览与元数据') : tr('Remote preview fetching is disabled for this model type', '此模型类型已关闭远端预览获取'))}">
      <i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(tr('Analyze missing in filter', '分析筛选内缺失项'))}</span>
    </button>
    <button type="button" data-smb-batch-inspect ${inspectCount && !batchBusy ? '' : 'disabled'} title="${escapeHtml(tr('Read model headers for the selected or checked models', '读取当前选择/已勾选模型的模型头'))}">
      <i class="fa-solid fa-magnifying-glass-chart"></i><span>${escapeHtml(checkedCount ? tr('Identify checked', '识别已勾选') : tr('Identify selected', '识别当前'))}</span>
    </button>
    <button type="button" data-smb-batch-all-headers ${canInspectFilter && !batchBusy ? '' : 'disabled'} title="${escapeHtml(tr('Read model headers for every classifiable model in the current filter', '读取当前筛选范围内全部可分类模型的模型头'))}">
      <i class="fa-solid fa-layer-group"></i><span>${escapeHtml(tr('Read all headers', '读取全部模型头'))}</span>
    </button>
  </div>
</div>`;
    }

    function captureScrollState() {
        if (!modal) return null;
        const grid = modal.querySelector('.sai-model-browser-grid');
        const detail = modal.querySelector('.sai-model-browser-detail');
        return {
            gridTop: grid ? grid.scrollTop : 0,
            gridLeft: grid ? grid.scrollLeft : 0,
            detailTop: detail ? detail.scrollTop : 0
        };
    }

    function restoreScrollState(scroll) {
        if (!scroll || !modal) return;
        requestAnimationFrame(() => {
            const grid = modal.querySelector('.sai-model-browser-grid');
            const detail = modal.querySelector('.sai-model-browser-detail');
            if (grid) {
                grid.scrollTop = scroll.gridTop || 0;
                grid.scrollLeft = scroll.gridLeft || 0;
            }
            if (detail) detail.scrollTop = scroll.detailTop || 0;
        });
    }

    function captureSearchFocusState() {
        if (!modal || !modal.contains(document.activeElement)) return null;
        const field = document.activeElement;
        if (!field?.matches?.('[data-smb-search]')) return null;
        let start = null;
        let end = null;
        let direction = 'none';
        try {
            start = field.selectionStart;
            end = field.selectionEnd;
            direction = field.selectionDirection || 'none';
        } catch (err) {}
        return { selector: '[data-smb-search]', start, end, direction };
    }

    function restoreSearchFocusState(focusState) {
        if (!focusState || !modal) return;
        requestAnimationFrame(() => {
            const field = modal.querySelector(focusState.selector);
            if (!field) return;
            field.focus({ preventScroll: true });
            if (typeof field.setSelectionRange === 'function') {
                const length = String(field.value || '').length;
                const start = Math.min(focusState.start ?? length, length);
                const end = Math.min(focusState.end ?? start, length);
                try {
                    field.setSelectionRange(start, end, focusState.direction || 'none');
                } catch (err) {}
            }
        });
    }

    function render(options) {
        if (!modal) return;
        const scroll = options?.preserveScroll ? captureScrollState() : null;
        const focus = captureSearchFocusState();
        const item = selectedItem();
        const start = state.total ? (state.page - 1) * state.pageSize + 1 : 0;
        const end = Math.min(state.total, state.page * state.pageSize);
        const totalPages = Math.max(1, Math.ceil((state.total || 0) / state.pageSize));
        const canPrev = state.page > 1;
        const canNext = state.hasMore;
        const mobileDetailOpen = !!state.mobileDetailOpen && mobileLayoutActive();
        const headerTitle = mobileDetailOpen
            ? tr('Model details', '模型详情')
            : knownText(state.title, TYPE_LABELS[state.type] || KNOWN_TEXT['Model Browser']);
        const typeOptions = (state.types.length ? state.types : Object.keys(TYPE_LABELS).map(value => ({ value, label: typeLabel(value) })))
            .map(type => `<option value="${escapeHtml(type.value)}" ${type.value === state.type ? 'selected' : ''}>${escapeHtml(typeLabel(type.value) || localize(type.label, type.label))}</option>`)
            .join('');
        const folderOptions = state.folders.map(folder => `<option value="${escapeHtml(folder)}" ${folder === state.folder ? 'selected' : ''}>${escapeHtml(folder === 'All folders' ? allFoldersLabel() : folder)}</option>`).join('');
        const filterToggle = modelFilterAvailableForType(state.type)
            ? `<label class="sai-model-browser-filter-toggle" title="${escapeHtml(tr('Use architecture filters from Weight Inspector', '使用 Weight Inspector 的模型架构过滤'))}"><input type="checkbox" data-smb-model-filter ${state.useModelFilter ? 'checked' : ''}><span>${escapeHtml(tr('Model filter', '模型过滤'))}</span></label>`
            : `<span class="sai-model-browser-filter-toggle is-disabled">${escapeHtml(tr('No model filter', '无模型过滤'))}</span>`;
        modal.innerHTML = `<div class="sai-model-browser-backdrop" data-smb-close></div>
<div class="sai-model-browser-panel ${mobileDetailOpen ? 'is-mobile-detail-open' : ''}">
  <header class="sai-model-browser-head">
    <div>
      <button type="button" class="sai-model-browser-mobile-back" data-smb-detail-close aria-label="${escapeHtml(tr('Back to models', '返回模型列表'))}" title="${escapeHtml(tr('Back to models', '返回模型列表'))}"><i class="fa-solid fa-arrow-left"></i></button>
      <i class="sai-model-browser-head-icon fa-solid fa-magnifying-glass"></i>
      <h2 id="sai-model-browser-title">${escapeHtml(headerTitle)}</h2>
    </div>
    <button type="button" data-smb-close aria-label="${escapeHtml(tr('Close', '关闭'))}" title="${escapeHtml(tr('Close', '关闭'))}"><i class="fa-solid fa-xmark"></i></button>
  </header>
  <div class="sai-model-browser-toolbar">
    <input type="search" data-smb-search value="${escapeHtml(state.search)}" placeholder="${escapeHtml(tr('Search name, folder, tags', '搜索名称、文件夹、标签'))}">
    <div class="sai-model-browser-filterrail">
      <select data-smb-type ${state.allowTypeSwitch ? '' : 'disabled'}>${typeOptions}</select>
      <select data-smb-folder>${folderOptions}</select>
      <select data-smb-sort>
        <option value="name" ${state.sort === 'name' ? 'selected' : ''}>${escapeHtml(tr('Name', '名称'))}</option>
        <option value="folder" ${state.sort === 'folder' ? 'selected' : ''}>${escapeHtml(tr('Folder', '文件夹'))}</option>
        <option value="modified_desc" ${state.sort === 'modified_desc' ? 'selected' : ''}>${escapeHtml(tr('Newest', '最新'))}</option>
        <option value="size_desc" ${state.sort === 'size_desc' ? 'selected' : ''}>${escapeHtml(tr('Size', '大小'))}</option>
        <option value="preview" ${state.sort === 'preview' ? 'selected' : ''}>${escapeHtml(tr('Preview first', '预览优先'))}</option>
      </select>
      ${filterToggle}
    </div>
    <button type="button" data-smb-refresh aria-label="${escapeHtml(tr('Refresh', '刷新'))}" title="${escapeHtml(tr('Refresh', '刷新'))}"><i class="fa-solid fa-rotate"></i></button>
  </div>
  ${renderBatchBar()}
  <main class="sai-model-browser-main ${mobileDetailOpen ? 'is-mobile-detail-open' : ''}">
    <section class="sai-model-browser-grid">
      ${state.loading ? Array.from({ length: 12 }).map(() => '<div class="sai-model-browser-card is-loading"></div>').join('') : ''}
      ${!state.loading && state.items.length ? state.items.map(renderCard).join('') : ''}
      ${!state.loading && !state.items.length ? `<div class="sai-model-browser-empty">${escapeHtml(tr('No models found.', '没有找到模型。'))}</div>` : ''}
    </section>
    ${renderDetail(item)}
  </main>
  <footer class="sai-model-browser-foot">
    <span>${state.status ? escapeHtml(state.status) : escapeHtml(tr('Showing {start}-{end} / {total}', '显示 {start}-{end} / {total}').replace('{start}', start).replace('{end}', end).replace('{total}', state.total))}</span>
    <div class="sai-model-browser-pagebar">
      <button type="button" data-smb-page="prev" ${canPrev ? '' : 'disabled'}><i class="fa-solid fa-chevron-left"></i><span>${escapeHtml(tr('Prev', '上一页'))}</span></button>
      <strong>${escapeHtml(tr('Page {page} / {pages}', '第 {page} / {pages} 页').replace('{page}', state.page).replace('{pages}', totalPages))}</strong>
      <button type="button" data-smb-page="next" ${canNext ? '' : 'disabled'}><span>${escapeHtml(tr('Next', '下一页'))}</span><i class="fa-solid fa-chevron-right"></i></button>
    </div>
  </footer>
</div>`;
        restoreScrollState(scroll);
        restoreSearchFocusState(focus);
    }

    function findItem(id) {
        return state.items.find(item => item.id === id) || null;
    }

    function choose(id) {
        const item = findItem(id) || selectedItem();
        if (!item) return;
        if (typeof state.onSelect === 'function') state.onSelect(item);
        close();
    }

    function confirmDeleteModel(item) {
        const expected = item?.file_name || item?.display_name || item?.name || '';
        return new Promise((resolve) => {
            if (!modal || !expected) {
                resolve('');
                return;
            }
            const overlay = document.createElement('div');
            overlay.className = 'sai-model-browser-confirm';
            overlay.innerHTML = `<div class="sai-model-browser-confirm-backdrop" data-smb-confirm-cancel></div>
<section class="sai-model-browser-confirm-panel" role="alertdialog" aria-modal="true">
  <h3>${escapeHtml(tr('Delete model file?', '删除模型文件？'))}</h3>
  <p>${escapeHtml(tr('This removes the model file and same-name local preview/metadata files. Projects that reference it will not be changed.', '这会删除模型文件和同名本地预览/元数据文件；已引用它的项目不会被修改。'))}</p>
  <p>${escapeHtml(tr('Type the file name to confirm:', '输入文件名确认：'))}</p>
  <code>${escapeHtml(expected)}</code>
  <input type="text" data-smb-confirm-input autocomplete="off">
  <div>
    <button type="button" data-smb-confirm-cancel>${escapeHtml(tr('Cancel', '取消'))}</button>
    <button type="button" class="is-danger" data-smb-confirm-ok disabled>${escapeHtml(tr('Delete', '删除'))}</button>
  </div>
</section>`;
            modal.appendChild(overlay);
            const input = overlay.querySelector('[data-smb-confirm-input]');
            const ok = overlay.querySelector('[data-smb-confirm-ok]');
            const cleanup = (value) => {
                overlay.remove();
                resolve(value);
            };
            input?.addEventListener('input', () => {
                ok.disabled = input.value.trim() !== expected;
            });
            overlay.addEventListener('click', (event) => {
                if (event.target.closest('[data-smb-confirm-cancel]')) {
                    event.preventDefault();
                    cleanup('');
                    return;
                }
                if (event.target.closest('[data-smb-confirm-ok]')) {
                    event.preventDefault();
                    cleanup(input?.value?.trim() === expected ? expected : '');
                }
            });
            overlay.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    cleanup('');
                }
            });
            setTimeout(() => input?.focus(), 0);
        });
    }

    async function fetchOne(item, options) {
        if (!item || !item.remote_enabled || item.synthetic) return { ok: false, skipped: true, item };
        return postJson('/model-browser/fetch-metadata', {
            type: item.type,
            name: item.name,
            force: !!options?.force,
            compute_hash: true,
            force_hash: !!options?.forceHash
        });
    }

    async function collectItemsForFilter(predicate) {
        const out = [];
        const seen = new Set();
        let page = 1;
        for (;;) {
            const data = await postJson('/model-browser/query', currentPayload({
                page,
                page_size: 500
            }));
            for (const item of Array.isArray(data.items) ? data.items : []) {
                if ((typeof predicate === 'function' && !predicate(item)) || seen.has(item.id)) continue;
                seen.add(item.id);
                out.push(item);
            }
            if (!data.has_more) break;
            page += 1;
            if (page > 200) break;
        }
        return out;
    }

    async function computeHash(item, force) {
        if (!manageableItem(item)) return;
        state.batch = { label: tr('Computing hash for {name}', '正在计算 {name} 的哈希').replace('{name}', item.file_name || item.name || ''), done: 0, total: 1, message: tr('Large files can take a moment.', '大文件可能需要一点时间。') };
        render({ preserveScroll: true });
        try {
            const result = await postJson('/model-browser/compute-hash', {
                type: item.type,
                name: item.name,
                force: !!force
            });
            state.batch = { label: tr('Hash ready', '哈希已就绪'), done: 1, total: 1, message: result.sha256 ? result.sha256.slice(0, 16) : tr('Updated', '已更新') };
            await query({ preserveScroll: true });
            render({ preserveScroll: true });
        } catch (err) {
            state.batch = { label: tr('Hash failed', '哈希计算失败'), done: 1, total: 1, message: err?.message || String(err || tr('Hash failed', '哈希计算失败')) };
            render({ preserveScroll: true });
        }
    }

    function readImageFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error(tr('No image selected.', '没有选择图片。')));
                return;
            }
            if (!String(file.type || '').startsWith('image/')) {
                reject(new Error(tr('Please choose an image file.', '请选择图片文件。')));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error(tr('Image read failed.', '图片读取失败。')));
            reader.readAsDataURL(file);
        });
    }

    function choosePreviewFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/*';
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            input.addEventListener('change', () => {
                const file = input.files && input.files[0] ? input.files[0] : null;
                input.remove();
                resolve(file);
            }, { once: true });
            document.body.appendChild(input);
            input.click();
        });
    }

    async function setLocalPreview(item) {
        if (!manageableItem(item)) return;
        const file = await choosePreviewFile();
        if (!file) return;
        state.batch = { label: tr('Saving preview for {name}', '正在保存 {name} 的预览图').replace('{name}', item.file_name || item.name || ''), done: 0, total: 1, message: '' };
        render({ preserveScroll: true });
        try {
            const imageData = await readImageFileAsDataUrl(file);
            const result = await postJson('/model-browser/set-preview', {
                type: item.type,
                name: item.name,
                image_name: file.name,
                image_data: imageData
            });
            state.batch = { label: tr('Preview saved', '预览图已保存'), done: 1, total: 1, message: result?.message || tr('Saved as the model same-name webp.', '已保存为模型同名 webp。') };
            await query({ preserveScroll: true });
            render({ preserveScroll: true });
        } catch (err) {
            state.batch = { label: tr('Preview save failed', '预览图保存失败'), done: 1, total: 1, message: err?.message || String(err || tr('Preview save failed', '预览图保存失败')) };
            render({ preserveScroll: true });
        }
    }

    function replaceItem(updated) {
        if (!updated || !updated.id) return;
        const index = state.items.findIndex(item => item.id === updated.id);
        if (index >= 0) state.items[index] = Object.assign({}, state.items[index], updated);
        state.selectedId = updated.id;
    }

    function currentTriggerInputValue() {
        const field = modal?.querySelector?.('[data-smb-trigger-input]');
        return field ? String(field.value || '').trim() : '';
    }

    function sendTriggerText(text) {
        const value = String(text || '').trim();
        if (!value) {
            state.status = tr('No trigger words to send.', '没有可发送的触发词。');
            render({ preserveScroll: true });
            return;
        }
        if (typeof window.globalAutoAddLoraTriggerWord === 'function') {
            window.globalAutoAddLoraTriggerWord('', '', value);
            state.status = tr('Trigger words sent to prompt.', '触发词已发送到提示词。');
        } else if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(value).catch(() => {});
            state.status = tr('Trigger words copied.', '触发词已复制。');
        } else {
            state.status = value;
        }
        render({ preserveScroll: true });
    }

    function isPresetNavActive() {
        const classes = document.documentElement?.classList;
        return !!(
            classes?.contains('simpai-preset-nav-active') ||
            classes?.contains('simpai-preset-switch-gallery-suppressed')
        );
    }

    async function autoSendTriggerWordsForModel(modelName, enabled) {
        const shouldSend = enabled === true || enabled === 1 || String(enabled || '').toLowerCase() === 'true';
        if (!shouldSend) return;
        if (isPresetNavActive()) return;
        const name = String(modelName || '').trim();
        if (!name || name.toLowerCase() === 'none') return;
        try {
            const result = await postJson('/model-browser/detail', {
                type: 'lora',
                name
            });
            const item = result?.item || {};
            const text = typeof item.trigger_words_text === 'string'
                ? item.trigger_words_text
                : (Array.isArray(item.trained_words) ? item.trained_words.join(', ') : '');
            if (text) sendTriggerText(text);
        } catch (err) {
            console.warn('autoSendTriggerWordsForModel failed', err);
        }
    }

    async function saveTriggerWords(item) {
        if (!item || item.type !== 'lora') return;
        const text = currentTriggerInputValue();
        state.batch = { label: tr('Saving trigger words', '正在保存触发词'), done: 0, total: 1, message: item.file_name || item.name || '' };
        render({ preserveScroll: true });
        try {
            const result = await postJson('/model-browser/update-trigger-words', {
                type: item.type,
                name: item.name,
                trigger_words_text: text
            });
            replaceItem(result.item);
            state.batch = { label: tr('Trigger words saved', '触发词已保存'), done: 1, total: 1, message: tr('Saved to lora_trigger_words.csv', '已保存到 lora_trigger_words.csv') };
            render({ preserveScroll: true });
            setTimeout(() => {
                if (state.batch?.label === tr('Trigger words saved', '触发词已保存')) {
                    state.batch = null;
                    render({ preserveScroll: true });
                }
            }, 1800);
        } catch (err) {
            state.batch = { label: tr('Trigger words save failed', '触发词保存失败'), done: 1, total: 1, message: err?.message || String(err || tr('Save failed', '保存失败')) };
            render({ preserveScroll: true });
        }
    }

    function currentArchFamilyValue() {
        const field = modal?.querySelector?.('[data-smb-arch-family]');
        return field ? String(field.value || 'unknown').trim().toLowerCase() : 'unknown';
    }

    async function inspectArchitecture(item) {
        if (!architectureItem(item)) return;
        state.batch = { label: tr('Reading model header', '正在读取模型头'), done: 0, total: 1, message: item.file_name || item.name || '' };
        render({ preserveScroll: true });
        try {
            const result = await postJson('/model-browser/inspect-arch', {
                type: item.type,
                name: item.name
            });
            replaceItem(result.item);
            state.batch = {
                label: tr('Classification updated', '分类已更新'),
                done: 1,
                total: 1,
                message: archFamilyLabel(result.arch_family || result.item?.arch_family || 'unknown')
            };
            render({ preserveScroll: true });
        } catch (err) {
            state.batch = { label: tr('Classification failed', '分类失败'), done: 1, total: 1, message: err?.message || String(err || tr('Classification failed', '分类失败')) };
            render({ preserveScroll: true });
        }
    }

    async function saveArchitecture(item) {
        if (!architectureItem(item)) return;
        const archFamily = currentArchFamilyValue();
        state.batch = { label: tr('Saving classification', '正在保存分类'), done: 0, total: 1, message: archFamilyLabel(archFamily) };
        render({ preserveScroll: true });
        try {
            const result = await postJson('/model-browser/update-arch-family', {
                type: item.type,
                name: item.name,
                arch_family: archFamily
            });
            replaceItem(result.item);
            state.batch = { label: tr('Classification saved', '分类已保存'), done: 1, total: 1, message: archFamilyLabel(result.arch_family || archFamily) };
            render({ preserveScroll: true });
        } catch (err) {
            state.batch = { label: tr('Save failed', '保存失败'), done: 1, total: 1, message: err?.message || String(err || tr('Save failed', '保存失败')) };
            render({ preserveScroll: true });
        }
    }

    async function inspectArchitectureItems(items, options) {
        const opts = options || {};
        if (!items.length) {
            state.status = opts.emptyMessage || tr('No classifiable models selected.', '没有可分类的已选模型。');
            render({ preserveScroll: true });
            return;
        }
        let success = 0;
        let failed = 0;
        state.batch = { label: opts.progressLabel || tr('Reading model headers', '正在读取模型头'), done: 0, total: items.length, message: '' };
        render({ preserveScroll: true });
        for (const item of items) {
            state.batch.message = item.file_name || item.name || '';
            render({ preserveScroll: true });
            try {
                const result = await postJson('/model-browser/inspect-arch', {
                    type: item.type,
                    name: item.name
                });
                if (result.ok) {
                    success += 1;
                    replaceItem(result.item);
                } else {
                    failed += 1;
                }
            } catch (err) {
                failed += 1;
                state.batch.message = err?.message || String(err || tr('Classification failed', '分类失败'));
            }
            state.batch.done += 1;
            render({ preserveScroll: true });
        }
        if (opts.clearSelection) state.checkedIds.clear();
        await query({ preserveScroll: true });
        state.batch = {
            label: opts.completeLabel || tr('Classification complete', '分类完成'),
            done: items.length,
            total: items.length,
            message: tr('{success} updated, {failed} failed', '{success} 个已更新，{failed} 个失败')
                .replace('{success}', success)
                .replace('{failed}', failed)
        };
        render({ preserveScroll: true });
    }

    function inspectSelectedArchitectures() {
        return inspectArchitectureItems(inspectableBatchItems(), { clearSelection: true });
    }

    async function inspectAllArchitecturesInFilter() {
        state.batch = {
            label: tr('Collecting models in filter', '正在读取筛选范围'),
            done: 0,
            total: 1,
            message: tr('Using current type, search, and folder.', '使用当前类型、搜索词和文件夹。')
        };
        render({ preserveScroll: true });
        try {
            const items = await collectItemsForFilter(architectureItem);
            if (!items.length) {
                state.batch = {
                    label: tr('No classifiable models', '没有可分类模型'),
                    done: 1,
                    total: 1,
                    message: tr('No model headers matched the current filter.', '当前筛选范围内没有可读取的模型头。')
                };
                render({ preserveScroll: true });
                return;
            }
            await inspectArchitectureItems(items, {
                progressLabel: tr('Reading all model headers', '正在读取全部模型头'),
                completeLabel: tr('All headers complete', '全部模型头读取完成'),
                emptyMessage: tr('No classifiable models in filter.', '筛选范围内没有可分类模型。'),
                clearSelection: false
            });
        } catch (err) {
            state.batch = {
                label: tr('Header scan failed', '模型头读取失败'),
                done: 1,
                total: 1,
                message: err?.message || String(err || tr('Header scan failed', '模型头读取失败'))
            };
            render({ preserveScroll: true });
        }
    }

    function formatDeleteMessage(result) {
        const summary = result?.delete_summary || {};
        const deleted = Array.isArray(result?.deleted) ? result.deleted : [];
        const modelCount = Number(summary.model_count ?? (summary.model_deleted ? 1 : 0)) || 0;
        const relatedCount = Number(summary.related_count ?? Math.max(0, deleted.length - modelCount)) || 0;
        const failedCount = Array.isArray(result?.failed) ? result.failed.length : 0;
        let message = '';
        if (modelCount > 0) {
            message = relatedCount > 0
                ? tr('Deleted 1 model; cleaned {count} related file(s).', '已删除 1 个模型；同时清理 {count} 个关联文件。').replace('{count}', relatedCount)
                : tr('Deleted 1 model.', '已删除 1 个模型。');
        } else if (relatedCount > 0) {
            message = tr('Cleaned {count} related file(s).', '已清理 {count} 个关联文件。').replace('{count}', relatedCount);
        } else {
            message = tr('No files were removed.', '没有删除任何文件。');
        }
        if (failedCount > 0) {
            message += ' ' + tr('{count} item(s) could not be removed.', '{count} 项未能删除。').replace('{count}', failedCount);
        }
        return message;
    }

    function resultHasPreview(result) {
        return !!(result?.preview_ok || result?.item?.preview_url);
    }

    function formatFetchResultMessage(result) {
        if (!result?.ok) return result?.error || tr('Fetch failed', '获取失败');
        if (result?.remote_found === false) {
            return tr('No Civitai match; local hash and architecture were saved.', 'Civitai 未找到匹配项，已保存本地哈希与架构信息。');
        }
        if (resultHasPreview(result)) return tr('Updated preview and metadata', '已更新预览与元数据');
        const detail = result?.preview_message || tr('No usable remote preview was found.', '未找到可用的远端预览。');
        return tr('Updated metadata only; preview was not generated: {detail}', '仅更新了元数据；预览未生成：{detail}').replace('{detail}', detail);
    }

    function formatFetchCounts(success, partial, failed, skipped) {
        if (partial > 0) {
            return tr('{success} with preview, {partial} metadata only, {failed} failed, {skipped} skipped', '{success} 个有预览，{partial} 个仅元数据，{failed} 个失败，{skipped} 个跳过')
                .replace('{success}', success)
                .replace('{partial}', partial)
                .replace('{failed}', failed)
                .replace('{skipped}', skipped);
        }
        return tr('{success} success, {failed} failed, {skipped} skipped', '{success} 个成功，{failed} 个失败，{skipped} 个跳过')
            .replace('{success}', success)
            .replace('{failed}', failed)
            .replace('{skipped}', skipped);
    }

    async function deleteModel(item) {
        if (!manageableItem(item)) return;
        const confirmName = await confirmDeleteModel(item);
        if (!confirmName) return;
        state.batch = { label: tr('Deleting {name}', '正在删除 {name}').replace('{name}', item.file_name || item.name || ''), done: 0, total: 1, message: '' };
        render({ preserveScroll: true });
        try {
            const result = await postJson('/model-browser/delete', {
                type: item.type,
                name: item.name,
                confirm_name: confirmName,
                delete_previews: true
            });
            state.checkedIds.delete(item.id);
            state.selectedId = '';
            state.batch = { label: tr('Delete complete', '删除完成'), done: 1, total: 1, message: formatDeleteMessage(result) };
            await query({ preserveScroll: true });
            render({ preserveScroll: true });
        } catch (err) {
            state.batch = { label: tr('Delete failed', '删除失败'), done: 1, total: 1, message: err?.message || String(err || tr('Delete failed', '删除失败')) };
            render({ preserveScroll: true });
        }
    }

    async function fetchModelInformationItems(items, options) {
        const opts = options || {};
        let success = 0;
        let partial = 0;
        let failed = 0;
        let skipped = 0;
        state.batch = { label: opts.progressLabel || tr('Analyzing models', '正在分析模型'), done: 0, total: items.length, message: '' };
        render({ preserveScroll: true });
        for (const item of items) {
            state.batch.message = tr('Analyzing {name}', '正在分析 {name}').replace('{name}', item.file_name || item.name || '');
            render({ preserveScroll: true });
            try {
                const result = await fetchOne(item);
                if (result.skipped) skipped += 1;
                else if (result.ok && resultHasPreview(result)) success += 1;
                else if (result.ok) partial += 1;
                else failed += 1;
            } catch (err) {
                failed += 1;
                state.batch.message = err?.message || String(err || tr('fetch failed', '获取失败'));
            }
            state.batch.done += 1;
            state.batch.message = formatFetchCounts(success, partial, failed, skipped);
            render({ preserveScroll: true });
        }
        if (opts.clearSelection) state.checkedIds.clear();
        await query({ preserveScroll: true });
        state.batch = {
            label: opts.completeLabel || tr('Analysis complete', '分析完成'),
            done: items.length,
            total: items.length,
            message: formatFetchCounts(success, partial, failed, skipped)
        };
        render({ preserveScroll: true });
    }

    async function fetchSelected() {
        const items = fetchableBatchItems();
        if (!items.length) {
            state.status = remoteFetchEnabledForType()
                ? tr('No fetchable models selected.', '没有可获取的已选模型。')
                : tr('{type} does not support remote preview fetch.', '{type} 不支持远端预览获取。').replace('{type}', typeLabel(state.type));
            render({ preserveScroll: true });
            return;
        }
        await fetchModelInformationItems(items, {
            progressLabel: tr('Analyzing selected models', '正在分析已选模型'),
            completeLabel: tr('Selected analysis complete', '已选模型分析完成'),
            clearSelection: true
        });
    }

    async function collectAndFetchFilter(predicate, options) {
        if (!remoteFetchEnabledForType()) {
            state.status = tr('{type} does not support remote preview fetch.', '{type} 不支持远端预览获取。').replace('{type}', typeLabel(state.type));
            render({ preserveScroll: true });
            return;
        }
        const opts = options || {};
        state.batch = {
            label: opts.collectLabel || tr('Collecting models in filter', '正在读取筛选范围'),
            done: 0,
            total: 1,
            message: tr('Using current type, search, and folder.', '使用当前类型、搜索词和文件夹。')
        };
        render({ preserveScroll: true });
        try {
            const items = await collectItemsForFilter(predicate);
            if (!items.length) {
                state.batch = {
                    label: opts.emptyLabel || tr('No models to analyze', '没有需要分析的模型'),
                    done: 1,
                    total: 1,
                    message: opts.emptyMessage || tr('The current filter contains no matching models.', '当前筛选范围内没有符合条件的模型。')
                };
                render({ preserveScroll: true });
                return;
            }
            await fetchModelInformationItems(items, opts);
        } catch (err) {
            state.batch = { label: tr('Analysis failed', '分析失败'), done: 1, total: 1, message: err?.message || String(err || tr('Analysis failed', '分析失败')) };
            render({ preserveScroll: true });
        }
    }

    function fetchMissing() {
        return collectAndFetchFilter(needsRemoteFetch, {
            collectLabel: tr('Scanning missing model information', '正在检查缺失模型信息'),
            progressLabel: tr('Analyzing missing models', '正在分析缺失模型'),
            completeLabel: tr('Missing analysis complete', '缺失模型分析完成'),
            emptyLabel: tr('Nothing missing', '没有缺失项'),
            emptyMessage: tr('Current filter is already complete.', '当前筛选范围已完整。')
        });
    }

    function fetchAllInformationInFilter() {
        return collectAndFetchFilter(
            item => !!item && item.remote_enabled && !item.synthetic,
            {
                collectLabel: tr('Collecting all models', '正在读取全部模型'),
                progressLabel: tr('Analyzing all model information', '正在读取全部模型信息'),
                completeLabel: tr('All model information complete', '全部模型信息读取完成'),
                emptyLabel: tr('No models to analyze', '没有可分析模型')
            }
        );
    }

    async function copyHash(value) {
        const text = String(value || '').trim();
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            const field = document.createElement('textarea');
            field.value = text;
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.appendChild(field);
            field.select();
            document.execCommand('copy');
            field.remove();
        }
        state.status = tr('Full SHA256 copied.', '已复制完整 SHA256。');
        render({ preserveScroll: true });
    }

    function onClick(event) {
        const closeButton = event.target.closest('[data-smb-close]');
        if (closeButton) {
            event.preventDefault();
            close();
            return;
        }
        const detailClose = event.target.closest('[data-smb-detail-close]');
        if (detailClose) {
            event.preventDefault();
            state.mobileDetailOpen = false;
            render({ preserveScroll: true });
            return;
        }
        const batchToggle = event.target.closest('[data-smb-batch-toggle]');
        if (batchToggle) {
            event.preventDefault();
            state.mobileBatchExpanded = !state.mobileBatchExpanded;
            render({ preserveScroll: true });
            return;
        }
        const refresh = event.target.closest('[data-smb-refresh]');
        if (refresh) {
            event.preventDefault();
            query({ forceRefresh: true });
            return;
        }
        const page = event.target.closest('[data-smb-page]');
        if (page) {
            event.preventDefault();
            const action = page.getAttribute('data-smb-page');
            state.page = Math.max(1, state.page + (action === 'next' ? 1 : -1));
            state.checkedIds.clear();
            state.mobileDetailOpen = false;
            query();
            return;
        }
        const toggle = event.target.closest('[data-smb-toggle]');
        if (toggle) {
            event.preventDefault();
            const id = toggle.getAttribute('data-smb-toggle');
            if (state.checkedIds.has(id)) state.checkedIds.delete(id);
            else state.checkedIds.add(id);
            render({ preserveScroll: true });
            return;
        }
        const copyHashButton = event.target.closest('[data-smb-copy-hash]');
        if (copyHashButton) {
            event.preventDefault();
            copyHash(copyHashButton.getAttribute('data-smb-copy-hash'));
            return;
        }
        const hashButton = event.target.closest('[data-smb-hash]');
        if (hashButton) {
            event.preventDefault();
            const item = findItem(hashButton.getAttribute('data-smb-hash'));
            if (item) computeHash(item, !!item.sha256);
            return;
        }
        const deleteButton = event.target.closest('[data-smb-delete]');
        if (deleteButton) {
            event.preventDefault();
            const item = findItem(deleteButton.getAttribute('data-smb-delete'));
            if (item) deleteModel(item);
            return;
        }
        const previewButton = event.target.closest('[data-smb-set-preview]');
        if (previewButton) {
            event.preventDefault();
            const item = findItem(previewButton.getAttribute('data-smb-set-preview'));
            if (item) setLocalPreview(item);
            return;
        }
        const triggerWord = event.target.closest('[data-smb-trigger-word]');
        if (triggerWord) {
            event.preventDefault();
            sendTriggerText(triggerWord.getAttribute('data-smb-trigger-word'));
            return;
        }
        const triggerSend = event.target.closest('[data-smb-trigger-send]');
        if (triggerSend) {
            event.preventDefault();
            sendTriggerText(currentTriggerInputValue());
            return;
        }
        const triggerSave = event.target.closest('[data-smb-trigger-save]');
        if (triggerSave) {
            event.preventDefault();
            saveTriggerWords(selectedItem());
            return;
        }
        const archInspect = event.target.closest('[data-smb-arch-inspect]');
        if (archInspect) {
            event.preventDefault();
            const item = findItem(archInspect.getAttribute('data-smb-arch-inspect')) || selectedItem();
            inspectArchitecture(item);
            return;
        }
        const archSave = event.target.closest('[data-smb-arch-save]');
        if (archSave) {
            event.preventDefault();
            saveArchitecture(selectedItem());
            return;
        }
        const fetchButton = event.target.closest('[data-smb-fetch]');
        if (fetchButton) {
            event.preventDefault();
            const item = findItem(fetchButton.getAttribute('data-smb-fetch'));
            if (!item) return;
            state.batch = { label: tr('Fetching {name}', '正在获取 {name}').replace('{name}', item.file_name || item.name || ''), done: 0, total: 1, message: '' };
            render({ preserveScroll: true });
            fetchOne(item).then(async (result) => {
                state.batch = { label: tr('Fetch complete', '获取完成'), done: 1, total: 1, message: formatFetchResultMessage(result) };
                await query({ preserveScroll: true });
                render({ preserveScroll: true });
            }).catch((err) => {
                state.batch = { label: tr('Fetch failed', '获取失败'), done: 1, total: 1, message: err?.message || String(err || tr('fetch failed', '获取失败')) };
                render({ preserveScroll: true });
            });
            return;
        }
        const chooseButton = event.target.closest('[data-smb-choose]');
        if (chooseButton) {
            event.preventDefault();
            choose(chooseButton.getAttribute('data-smb-choose'));
            return;
        }
        const selected = event.target.closest('[data-smb-select]');
        if (selected) {
            event.preventDefault();
            state.selectedId = selected.getAttribute('data-smb-select');
            state.mobileDetailOpen = mobileLayoutActive();
            render({ preserveScroll: true });
            return;
        }
        const selectPage = event.target.closest('[data-smb-select-page]');
        if (selectPage) {
            event.preventDefault();
            const items = selectablePageItems();
            const deselect = allSelectablePageItemsChecked();
            for (const item of items) {
                if (deselect) state.checkedIds.delete(item.id);
                else state.checkedIds.add(item.id);
            }
            state.status = deselect
                ? tr('Current page selection cleared.', '已取消当前页选择。')
                : tr('{count} model(s) selected on this page.', '当前页已选择 {count} 个模型。').replace('{count}', items.length);
            render({ preserveScroll: true });
            return;
        }
        const clearSelection = event.target.closest('[data-smb-clear-selection]');
        if (clearSelection) {
            event.preventDefault();
            state.checkedIds.clear();
            state.status = tr('Selection cleared.', '已取消全部选择。');
            render({ preserveScroll: true });
            return;
        }
        const batchSelected = event.target.closest('[data-smb-batch-selected]');
        if (batchSelected) {
            event.preventDefault();
            fetchSelected();
            return;
        }
        const batchMissing = event.target.closest('[data-smb-batch-missing]');
        if (batchMissing) {
            event.preventDefault();
            fetchMissing();
            return;
        }
        const batchAllInfo = event.target.closest('[data-smb-batch-all-info]');
        if (batchAllInfo) {
            event.preventDefault();
            fetchAllInformationInFilter();
            return;
        }
        const batchInspect = event.target.closest('[data-smb-batch-inspect]');
        if (batchInspect) {
            event.preventDefault();
            inspectSelectedArchitectures();
            return;
        }
        const batchAllHeaders = event.target.closest('[data-smb-batch-all-headers]');
        if (batchAllHeaders) {
            event.preventDefault();
            inspectAllArchitecturesInFilter();
        }
    }

    function onInput(event) {
        const search = event.target.closest('[data-smb-search]');
        if (!search) return;
        state.search = search.value || '';
        state.page = 1;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(query, 220);
    }

    function onChange(event) {
        const modelFilter = event.target.closest('[data-smb-model-filter]');
        if (modelFilter) {
            state.useModelFilter = !!modelFilter.checked;
            state.page = 1;
            state.folder = 'All folders';
            state.checkedIds.clear();
            query({ forceRefresh: true });
            return;
        }
        const type = event.target.closest('[data-smb-type]');
        if (type && state.allowTypeSwitch) {
            state.type = normalizeType(type.value);
            state.page = 1;
            state.folder = 'All folders';
            state.checkedIds.clear();
            query({ forceRefresh: true });
            return;
        }
        const folder = event.target.closest('[data-smb-folder]');
        if (folder) {
            state.folder = folder.value || 'All folders';
            state.page = 1;
            query();
            return;
        }
        const sort = event.target.closest('[data-smb-sort]');
        if (sort) {
            state.sort = sort.value || 'name';
            state.page = 1;
            query();
        }
    }

    function setNativeValue(field, value) {
        const proto = field instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : field instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor?.set) descriptor.set.call(field, value);
        else field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function getGradioRoot(id) {
        const app = typeof gradioApp === 'function' ? gradioApp() : document;
        return document.getElementById(id) || app?.getElementById?.(id) || null;
    }

    function setDropdownValue(dropdownId, value) {
        const root = getGradioRoot(dropdownId);
        if (!root) return false;
        const select = root.matches?.('select') ? root : root.querySelector?.('select');
        if (select) {
            if (![...select.options].some(option => option.value === value)) {
                select.add(new Option(value, value));
            }
            setNativeValue(select, value);
            select.title = String(value || '');
            return true;
        }
        const inputs = Array.from(root.querySelectorAll?.('input, textarea') || []);
        if (!inputs.length) return false;
        inputs.forEach(input => {
            setNativeValue(input, value);
            input.title = String(value || '');
        });
        root.__simpaiLastModelBrowserValue = value;
        return true;
    }

    function dropdownChoices(dropdownId) {
        const root = getGradioRoot(dropdownId);
        const select = root?.matches?.('select') ? root : root?.querySelector?.('select');
        if (!select) return [];
        return Array.from(select.options || [])
            .map(option => option.value || option.textContent || '')
            .filter(Boolean);
    }

    function dropdownValue(dropdownId) {
        const root = getGradioRoot(dropdownId);
        const select = root?.matches?.('select') ? root : root?.querySelector?.('select');
        if (select) return String(select.value || '').trim();
        const input = root?.querySelector?.('input, textarea');
        return String(input?.value || '').trim();
    }

    function dropdownType(dropdownId, fallback) {
        if (TYPE_BY_DROPDOWN[dropdownId]) return TYPE_BY_DROPDOWN[dropdownId];
        if (/^lora_dropdown_\d+$/.test(String(dropdownId || ''))) return 'lora';
        return normalizeType(fallback);
    }

    function open(options) {
        const opts = options || {};
        ensureModal(opts.container);
        const type = normalizeType(opts.type || opts.targetType || 'base');
        const context = mergeContext(opts);
        state = Object.assign(initialState(), {
            open: true,
            type,
            title: opts.title || TYPE_LABELS[type] || KNOWN_TEXT['Model Browser'],
            selectedId: '',
            context,
            useModelFilter: resolveInitialModelFilter(opts, context),
            allowTypeSwitch: !!opts.allowTypeSwitch,
            onSelect: typeof opts.onSelect === 'function' ? opts.onSelect : null
        });
        modal.hidden = false;
        modal.classList.add('is-open');
        query();
    }

    function openForDropdown(options) {
        const opts = options || {};
        const type = dropdownType(opts.dropdownId, opts.type);
        const context = mergeContext(opts);
        if (!Array.isArray(context.choices) || !context.choices.length) {
            const choices = dropdownChoices(opts.dropdownId);
            if (choices.length) context.choices = choices;
            else delete context.choices;
        }
        if (!Array.isArray(context.current_model_names)) {
            const current = dropdownValue(opts.dropdownId);
            if (!isModelPlaceholder(current)) context.current_model_names = [current];
        }
        open({
            type,
            title: opts.title || TYPE_LABELS[type] || KNOWN_TEXT['Model Browser'],
            context,
            container: opts.container,
            onSelect: (item) => {
                setDropdownValue(opts.dropdownId, item.name);
                if (typeof opts.onSelect === 'function') opts.onSelect(item);
            }
        });
    }

    function close() {
        requestId += 1;
        if (modal) {
            modal.hidden = true;
            modal.classList.remove('is-open');
        }
        state.open = false;
        state.mobileDetailOpen = false;
    }

    window.SimpAIModelBrowser = {
        open,
        openForDropdown,
        close,
        setDropdownValue,
        autoSendTriggerWordsForModel
    };
})();
