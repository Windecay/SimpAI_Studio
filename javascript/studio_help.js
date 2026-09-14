(function () {
    'use strict';
    if (window.SimpAIStudioHelp) return;
    const content = window.SimpAIStudioHelpContent;
    if (!content) return;
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const state = () => window.simpleaiTopbarSystemParams || {};
    const t = (en, cn) => content.text({ en, cn }, state());
    const label = topic => content.text(content.titles[topic] || content.titles.home, state());
    let dialog = null;
    let activeTopic = 'home';
    let source = 'main';
    let history = [];
    let opener = null;
    let restoreOpener = true;
    let scheduled = false;
    let revision = '';
    const initializedAccordions = new WeakSet();

    function button(topic, origin = 'main') {
        return `<button type="button" class="sai-help-button" data-studio-help="${escape(topic)}" data-studio-help-source="${escape(origin)}" title="${escape(label(topic))}" aria-label="${escape(label(topic))}" aria-haspopup="dialog"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></button>`;
    }

    function notice(status, origin = 'main', version = '') {
        const reason = content.availability(typeof status === 'string' ? { reason: status } : status);
        if (!content.notices[reason]) return '';
        const topic = reason === 'files_missing' || reason === 'vision_missing' ? 'local' : 'setup';
        const modelVersion = String(version || '').trim();
        const action = modelVersion && (reason === 'files_missing' || reason === 'vision_missing')
            ? `<button type="button" data-studio-help-download-model="${escape(modelVersion)}" data-studio-help-download-source="${escape(origin)}" title="${escape(t('Download model', '下载模型'))}" aria-label="${escape(t('Download model', '下载模型'))}"><i class="fa-solid fa-download" aria-hidden="true"></i>${escape(t('Download model', '下载模型'))}</button>`
            : `<button type="button" data-studio-help="${topic}" data-studio-help-source="${escape(origin)}"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>${escape(label(topic))}</button>`;
        return `<div class="sai-help-notice"><span>${escape(content.text(content.notices[reason], state()))}</span>${action}</div>`;
    }

    function modelReason(version, apiMissing) {
        if (version === 'Custom') return apiMissing ? 'api_missing' : '';
        const item = window.SimpAICanvasWorkbenchRegistry?.VLM_MODEL_CATALOG?.find(row => row.id === version);
        if (item?.installed === false) return item.backend === 'custom_api' ? 'api_missing' : 'files_missing';
        if (item?.vision_status === 'missing') return 'vision_missing';
        return '';
    }

    function modelNotice(version, apiMissing = false) {
        return `<span data-studio-help-model="${escape(version || '')}" data-help-api-missing="${apiMissing ? 'true' : 'false'}">${notice(modelReason(version, apiMissing), 'canvas', version)}</span>`;
    }

    function sectionsHtml(topic) {
        return (topic.sections || []).map(([title, items]) =>
            `<section><h3>${escape(content.text(title, state()))}</h3><ol>${items.map(item =>
                `<li>${escape(content.text(item, state()))}</li>`).join('')}</ol></section>`).join('');
    }

    function currentPreset() {
        return state().__studio_help?.preset || {};
    }

    function safeLegacyUrl(raw) {
        if (!raw) return '';
        try {
            const url = new URL(raw, window.location.href);
            if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return '';
            const path = decodeURIComponent(url.pathname).replace(/\\/g, '/');
            const prefix = '/file=presets/html/';
            const offset = path.indexOf(prefix);
            const filename = offset >= 0 ? path.slice(offset + prefix.length) : '';
            if (!/^[^/]+\.html$/.test(filename) || filename === 'blank.inc.html') return '';
            return url.href;
        } catch (_) {
            return '';
        }
    }

    function presetDetails() {
        const preset = currentPreset();
        const fields = [];
        if (preset.theme) fields.push(`<p><b>${escape(t('Mode', '当前模式'))}</b> ${escape(preset.theme_label || preset.theme)}</p>`);
        if (preset.requirements?.length) {
            const maskLabel = content.presetTopic(state()).links.includes('sam3')
                ? t('Prepare a video mask: track, draw fixed polygons, or upload a mask video', '准备视频蒙版：跟踪、固定多边形或上传 mask 视频')
                : t('Draw a mask', '绘制蒙版');
            const requirements = preset.requirements.map(key => key === 'mask' ? maskLabel : key);
            fields.push(`<p><b>${escape(t('Required interactions', '操作要求'))}</b> ${escape(requirements.join(', '))}</p>`);
        }
        if (preset.model_files?.length) {
            fields.push(`<details><summary>${escape(t('Model files', '模型文件'))} (${preset.model_files.length})</summary><ul>${preset.model_files.map(file => `<li><code>${escape(file)}</code></li>`).join('')}</ul></details>`);
        }
        const legacy = safeLegacyUrl(state().__preset_url);
        if (legacy) {
            fields.push(`<details data-studio-help-legacy><summary>${escape(t('Dedicated preset instructions', '预置包专属说明'))}</summary><iframe title="${escape(t('Dedicated preset instructions', '预置包专属说明'))}" data-help-src="${escape(legacy)}" sandbox="allow-same-origin" loading="lazy"></iframe></details>`);
        }
        return fields.join('');
    }

    function settingsTarget() {
        if (source === 'canvas') {
            return document.querySelector('[data-canvas-agent-action="open-settings"]');
        }
        const panel = document.getElementById('describe_vlm_custom_panel');
        if (panel && panel.getClientRects().length && getComputedStyle(panel).display !== 'none') return panel;
        const target = document.getElementById('describe_vlm_api_settings_btn');
        if (!target || getComputedStyle(target).display === 'none' || target.classList.contains('simpai-mounted-hidden')) return null;
        return target.matches('button') ? target : target.querySelector('button');
    }

    function render() {
        const topic = activeTopic === 'preset' ? content.presetTopic(state()) : content.topics[activeTopic] || content.topics.home;
        dialog.classList.toggle('theme-dark', state().__theme === 'dark');
        dialog.lang = /^(cn|zh)/i.test(state().__lang || '') ? 'zh-CN' : 'en';
        const dirs = activeTopic === 'local' ? state().__studio_help?.local_model_dirs : null;
        const directoryHtml = dirs?.length
            ? `<section><h3>${escape(t('Configured GGUF model directories', '已配置的 GGUF 模型目录'))}</h3><ul>${dirs.map(dir => `<li><code>${escape(dir)}</code></li>`).join('')}</ul></section>` : '';
        dialog.innerHTML = `
<header class="sai-help-header">
  <button type="button" class="sai-help-icon" data-help-back ${history.length ? '' : 'disabled'} title="${escape(t('Back', '返回'))}" aria-label="${escape(t('Back', '返回'))}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
  <h2 id="studio_help_title">${escape(topic.title || label(activeTopic))}</h2>
  <button type="button" class="sai-help-icon" data-help-home title="${escape(label('home'))}" aria-label="${escape(label('home'))}"><i class="fa-solid fa-house" aria-hidden="true"></i></button>
  <button type="button" class="sai-help-icon" data-help-close title="${escape(t('Close', '关闭'))}" aria-label="${escape(t('Close', '关闭'))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
</header>
<div class="sai-help-body" tabindex="0">
  <p>${escape(content.text(topic.intro, state()))}</p>
  ${activeTopic === 'preset' && source === 'canvas' ? `<p>${escape(t('This is the main Studio preset. Canvas Agent may choose a different preset for its task; inspect the generated node for that selection.', '这里显示的是 Studio 主界面当前预置包。画布 Agent 可能按任务选择其他预置包，请查看生成节点中的实际选择。'))}</p>` : ''}
  ${activeTopic === 'preset' ? presetDetails() : ''}
  ${directoryHtml}${sectionsHtml(topic)}
  ${topic.links?.length ? `<nav aria-label="${escape(t('Related topics', '相关指引'))}">${topic.links.map(key => `<button type="button" data-help-topic="${key}"><span>${escape(label(key))}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`).join('')}</nav>` : ''}
  <p class="sai-help-action-status" role="status" hidden></p>
</div>
${topic.actions?.includes('settings') ? `<footer><button type="button" data-help-settings><i class="fa-solid fa-gear" aria-hidden="true"></i>${escape(source === 'canvas' ? t('Open Agent settings', '打开 Agent 设置') : t('Open API settings', '打开 API 设置'))}</button></footer>` : ''}`;
        const legacy = dialog.querySelector('[data-studio-help-legacy]');
        legacy?.addEventListener('toggle', () => {
            const frame = legacy.querySelector('iframe');
            if (legacy.open && frame && !frame.hasAttribute('src')) frame.src = frame.dataset.helpSrc;
        });
    }

    function close(restoreFocus = true) {
        restoreOpener = restoreFocus;
        dialog?.close();
    }

    function ensureDialog() {
        if (dialog) return dialog;
        dialog = document.createElement('dialog');
        dialog.id = 'studio_help_dialog';
        dialog.className = 'sai-help-dialog';
        dialog.setAttribute('aria-labelledby', 'studio_help_title');
        document.body.appendChild(dialog);
        dialog.addEventListener('close', () => {
            if (dialog.open) return;
            history = [];
            if (restoreOpener && opener?.isConnected) opener.focus({ preventScroll: true });
        });
        dialog.addEventListener('click', event => {
            const target = event.target;
            if (target.closest('[data-help-close]')) close();
            if (target.closest('[data-help-back]') && history.length) navigate(history.pop(), false);
            if (target.closest('[data-help-home]')) navigate('home');
            const link = target.closest('[data-help-topic]');
            if (link) navigate(link.dataset.helpTopic);
            if (target.closest('[data-help-settings]')) {
                const settings = settingsTarget();
                if (!settings || settings.disabled) {
                    const message = dialog.querySelector('.sai-help-action-status');
                    message.hidden = false;
                    message.textContent = source === 'canvas'
                        ? t('Open Canvas Agent, then use its gear button. This entry may be unavailable in the current view.', '请打开画布 Agent，再使用其齿轮按钮。当前视图可能未提供该入口。')
                        : t('Open Describe Media in the main settings area. API profiles may require administrator access.', '请在主界面设置区域打开“描述媒体”。编辑 API 配置可能需要管理员权限。');
                    return;
                }
                close(false);
                if (settings.matches('button')) settings.click();
                settings.scrollIntoView({ block: 'center', behavior: 'smooth' });
                settings.focus({ preventScroll: true });
            }
        });
        return dialog;
    }

    function navigate(topic, remember = true) {
        if (!content.titles[topic]) topic = 'home';
        if (remember && activeTopic !== topic) history.push(activeTopic);
        activeTopic = topic;
        render();
        dialog.querySelector('.sai-help-body').focus({ preventScroll: true });
    }

    function open(topic = 'home', options = {}) {
        ensureDialog();
        if (!dialog.open) {
            opener = options.opener || document.activeElement;
            restoreOpener = true;
            source = options.source === 'canvas' ? 'canvas' : 'main';
            history = [];
        }
        navigate(topic, dialog.open);
        if (!dialog.open) dialog.showModal();
        dialog.querySelector('.sai-help-body').focus({ preventScroll: true });
    }

    function replaceHtml(element, html) {
        if (element && element.__studioHelpHtml !== html) {
            element.__studioHelpHtml = html;
            element.innerHTML = html;
        }
    }

    function mountInlineHelp(selector, topic) {
        const host = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!host) return;
        const existing = host.querySelector(':scope > .sai-help-inline');
        if (existing) {
            if (existing.dataset.studioHelpSlot !== topic) existing.dataset.studioHelpSlot = topic;
            return;
        }
        const slot = document.createElement('span');
        slot.className = 'sai-help-inline';
        slot.dataset.studioHelpSlot = topic;
        host.appendChild(slot);
    }

    function syncTabHelp(root, topics) {
        if (!root) return;
        const bar = root.querySelector(':scope > .tab-wrapper');
        if (!bar) return;
        // Gradio 6 marks an overflow selection without rendering a selected role=tab.
        const active = bar.querySelector('[role="tab"][aria-selected="true"]')
            || bar.querySelector('.overflow-dropdown > button.selected');
        const topic = topics[active?.dataset.tabId] || topics[active?.dataset.originalText] || topics[active?.textContent?.trim()];
        const existing = bar.querySelector(':scope > .sai-help-inline');
        if (!topic) {
            if (existing && !existing.hidden) existing.hidden = true;
            return;
        }
        bar.classList.add('sai-help-tabbar');
        mountInlineHelp(bar, topic);
        const slot = bar.querySelector(':scope > .sai-help-inline');
        if (slot?.hidden) slot.hidden = false;
    }

    function syncWorkspaceHelp() {
        const imageTabs = document.getElementById('image_input_tabs');
        const imageTabBar = imageTabs?.querySelector(':scope > .tab-wrapper');
        if (imageTabBar) {
            if (imageTabBar.style.minWidth !== '0px') imageTabBar.style.minWidth = '0px';
            if (imageTabBar.style.maxWidth !== '100%') imageTabBar.style.maxWidth = '100%';
            // The engine badge is positioned over this navigation from a separate Gradio block.
            const badgeWidth = document.querySelector('#engine_class .engineClass')?.getBoundingClientRect().width || 0;
            const reserved = `${badgeWidth > 0 ? Math.ceil(badgeWidth) + 12 : 0}px`;
            if (imageTabBar.style.paddingInlineEnd !== reserved) {
                imageTabBar.style.paddingInlineEnd = reserved;
            }
        }
        syncTabHelp(imageTabs, {
            ip_tab: 'image_prompt', uov_tab: 'image_uov', inpaint_tab: 'image_inpaint', enhance_tab: 'image_enhance',
            'Image Prompt': 'image_prompt', 'Upscale or Variation': 'image_uov',
            'Inpaint or Outpaint': 'image_inpaint', 'Enhance+': 'image_enhance',
            '图片提示': 'image_prompt', '放大与变化': 'image_uov', '内外重绘': 'image_inpaint', '增强修图': 'image_enhance',
        });
        syncTabHelp(document.getElementById('general_setting_tabs'), {
            general: 'general', advanced: 'sampling', control: 'control', inpaint: 'inpaint',
            General: 'general', Advanced: 'sampling', Control: 'control', Inpaint: 'inpaint',
            '常规': 'general', '高级': 'sampling', '控图': 'control', '重绘': 'inpaint',
        });
        syncTabHelp(document.querySelector('[role="tab"][data-tab-id="describe_tab"], [role="tab"][data-tab-id="metadata_tab"], [role="tab"][data-tab-id="image_encrypt_tab"]')?.closest('.tabs'), {
            describe_tab: 'describe', metadata_tab: 'metadata', image_encrypt_tab: 'obfuscate',
            'Describe Media': 'describe', Metadata: 'metadata', 'Image Encrypt': 'obfuscate',
            '媒体内容反推': 'describe', '生成参数提取': 'metadata', '图片混淆': 'obfuscate',
        });
        syncTabHelp(document.getElementById('identity_settings_tabs'), {
            application: 'application', local_system: 'system', users: 'access',
            Application: 'application', 'Local System': 'system', Users: 'access',
            '应用设置': 'application', '本地系统': 'system', '用户': 'access',
        });
        const styleSearch = document.querySelector('.style_selections_tab textarea')?.closest('.row');
        if (styleSearch) {
            styleSearch.classList.add('sai-help-search-row');
            mountInlineHelp(styleSearch, 'styles');
        }
        for (const [id, topic] of [['aspect_ratios_accordion', 'resolution'], ['sam3_video_mask_accordion', 'sam3']]) {
            const accordion = document.getElementById(id);
            if (accordion) {
                accordion.classList.add('sai-help-accordion');
                mountInlineHelp(accordion, topic);
            }
        }
    }

    function syncGenerationHelp() {
        document.querySelectorAll('[data-simpai-models-js-root] [data-simpai-model-card]').forEach(field => {
            const topics = { base: 'models', refiner: 'refiner', clip: 'clip', vae: 'vae', upscale: 'upscale', refiner_switch: 'refiner' };
            const topic = topics[field.dataset.simpaiModelCard];
            if (!topic || field.parentElement.classList.contains('sai-help-model-field')) return;
            // Keep help outside the label and its disabled-control synchronization.
            const wrapper = document.createElement('div');
            wrapper.className = 'sai-help-model-field';
            field.replaceWith(wrapper);
            wrapper.appendChild(field);
            const slot = document.createElement('span');
            slot.className = 'sai-help-inline';
            slot.dataset.studioHelpSlot = topic;
            wrapper.appendChild(slot);
        });
        mountInlineHelp('[data-simpai-models-js-root] .simpai-models-js-subhead', 'lora');
        mountInlineHelp('#guidance_scale .head > label', 'cfg');
        const info = document.querySelector('#guidance_scale .head > label .prose');
        if (info) {
            const summary = content.text(content.cfgSummary, state());
            // Existing servers still send the former Python info until restarted.
            if (info.textContent.trim() !== summary) info.textContent = summary;
            if (info.dataset.originalText !== content.cfgSummary.en) info.dataset.originalText = content.cfgSummary.en;
        }
    }

    function sync() {
        scheduled = false;
        syncGenerationHelp();
        syncWorkspaceHelp();
        mountInlineHelp('.advanced_check_row', 'home');
        mountInlineHelp('#describe_vlm_model_bar', 'setup');
        mountInlineHelp('.preset-store-titlebar > div', 'store');
        const modelInput = document.querySelector('#describe_vlm_model_dropdown input');
        if (modelInput) {
            const modelState = document.querySelector('#describe_vlm_model_status .describe-vlm-model-state');
            const title = [modelInput.value, modelState?.title].filter(Boolean).join('\n');
            const name = t('Agent model', '智能体模型');
            if (modelInput.title !== title) modelInput.title = title;
            if (modelInput.getAttribute('aria-label') !== name) modelInput.setAttribute('aria-label', name);
        }
        // Also restore the initial collapsed state on a server started before this update.
        const accordion = document.getElementById('preset_instruction_accordion');
        if (accordion && !initializedAccordions.has(accordion)) {
            initializedAccordions.add(accordion);
            accordion.querySelector(':scope > button.label-wrap.open')?.click();
        }
        document.querySelectorAll('[data-studio-help-slot]').forEach(slot => {
            const caption = slot.hasAttribute('data-studio-help-caption')
                ? `<span class="sai-help-caption">${escape(label(slot.dataset.studioHelpSlot))}</span>` : '';
            replaceHtml(slot, caption + button(slot.dataset.studioHelpSlot, slot.dataset.studioHelpSource));
        });
        document.querySelectorAll('[data-studio-help-notice]').forEach(slot => {
            replaceHtml(slot, notice(slot.dataset.studioHelpNotice, slot.dataset.studioHelpSource, slot.dataset.studioHelpVersion));
        });
        document.querySelectorAll('[data-studio-help-model]').forEach(slot => {
            replaceHtml(slot, notice(modelReason(slot.dataset.studioHelpModel, slot.dataset.helpApiMissing === 'true'), 'canvas', slot.dataset.studioHelpModel));
        });
        document.querySelectorAll('[data-studio-help]').forEach(node => {
            if (!node.classList.contains('sai-help-button')) return;
            const title = label(node.dataset.studioHelp);
            if (node.title !== title) node.title = title;
            if (node.getAttribute('aria-label') !== title) node.setAttribute('aria-label', title);
        });
        const intro = document.getElementById('studio_preset_intro');
        if (intro) {
            const topic = content.presetTopic(state());
            const facts = [
                [t('Inputs', '素材'), topic.inputs],
                [t('Key settings', '关键设置'), topic.keyPoint],
                [t('Mode', '模式'), topic.mode],
            ].filter(([, value]) => value);
            replaceHtml(intro, `<div class="sai-help-preset-summary"><strong>${escape(topic.title)}</strong>${button('preset')}<p>${escape(topic.intro)}</p><dl class="sai-help-preset-facts">${facts.map(([name, value]) => `<dt>${escape(name)}</dt><dd>${escape(value)}</dd>`).join('')}</dl></div>`);
        }
        const legacyTitle = document.querySelector('[data-studio-legacy-title]');
        if (legacyTitle) {
            const title = t('Dedicated preset instructions', '预置包专属说明');
            if (legacyTitle.textContent !== title) legacyTitle.textContent = title;
            const hidden = !safeLegacyUrl(state().__preset_url);
            if (legacyTitle.parentElement.hidden !== hidden) legacyTitle.parentElement.hidden = hidden;
        }
        const next = JSON.stringify([
            state().__lang, state().__theme, state().__preset_url, state().__studio_help,
            state().__scene_theme, state().__scene_theme_preset, state().__scene_task_method,
            state().__scene_disvisible, state().__engine_disvisible,
        ]);
        if (next !== revision) {
            revision = next;
            if (dialog?.open) {
                const scroll = dialog.querySelector('.sai-help-body')?.scrollTop || 0;
                const hadFocus = dialog.contains(document.activeElement);
                render();
                if (hadFocus) dialog.querySelector('.sai-help-body').focus({ preventScroll: true });
                dialog.querySelector('.sai-help-body').scrollTop = scroll;
            }
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(sync);
    }

    document.addEventListener('click', event => {
        const download = event.target.closest?.('[data-studio-help-download-model]');
        if (download) {
            const version = String(download.dataset.studioHelpDownloadModel || '').trim();
            const triggered = version && typeof window.triggerMissingModelCheck === 'function'
                ? window.triggerMissingModelCheck({ kind: 'vlm', version })
                : false;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            if (!triggered) console.warn('[UI-TRACE] studio_help.missing_model_download_unavailable', version);
            return;
        }
        const target = event.target.closest?.('[data-studio-help]');
        if (!target) {
            if (event.target.closest?.('[role="tab"]') || event.target.closest?.('.sai-help-tabbar .overflow-dropdown button')) schedule();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        open(target.dataset.studioHelp, { source: target.dataset.studioHelpSource, opener: target });
    }, true);
    document.addEventListener('pointerdown', event => {
        if (event.target.closest?.('[data-studio-help]')) event.stopPropagation();
    }, true);
    // Keep chat and canvas shortcuts inactive while the help dialog owns focus.
    window.addEventListener('keydown', event => {
        if (!dialog?.open) return;
        event.stopImmediatePropagation();
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    }, true);
    window.addEventListener('simpai:system-params-updated', schedule);
    window.addEventListener('simpai:vlm-model-catalog', schedule);
    window.addEventListener('simpai:preset-store-opened', schedule);
    if (typeof onUiLoaded === 'function') onUiLoaded(schedule);
    if (typeof onUiUpdate === 'function') onUiUpdate(schedule);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
    else schedule();
    window.SimpAIStudioHelp = { open, close, button, notice, modelNotice, sync: schedule, safeLegacyUrl };
})();
