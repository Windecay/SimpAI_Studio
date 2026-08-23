var re_num = /^[.\d]+$/;

function simpaiUiTraceEnabled() {
    try {
        return window.__SIMP_AI_UI_TRACE__ === true || window.localStorage.getItem("simpai.uiTrace") === "1";
    } catch (e) {
        return false;
    }
}

function simpaiUiTrace(level, ...args) {
    if (!simpaiUiTraceEnabled()) return;
    try {
        const fn = console[level] || console.log;
        fn.apply(console, args);
    } catch (e) {}
}

window.globalAutoAddLoraTriggerWord = function(triggerWordElemId, modelElemId, directTriggerWord) {
    try {
        function getGradioRoot() {
            const elems = document.getElementsByTagName('gradio-app');
            const elem = elems.length == 0 ? document : elems[0];
            return elem.shadowRoot ? elem.shadowRoot : elem;
        }

        function addTriggerWordToPrompt(triggerWord) {
            const root = getGradioRoot();
            const positivePrompt = root.querySelector('#positive_prompt textarea');
            if (positivePrompt) {
                const currentText = positivePrompt.value.trim();
                const separator = currentText ? ', ' : '';
                positivePrompt.value = currentText + separator + triggerWord;
                positivePrompt.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('Added trigger word to prompt:', triggerWord);
            } else {
                console.error('Positive prompt textarea not found');
            }
        }

        if (typeof directTriggerWord === 'string') {
            addTriggerWordToPrompt(directTriggerWord);
        } else {
            const root = getGradioRoot();
            const triggerWordElem = root.querySelector(`#${triggerWordElemId} textarea`);
            const modelElem = root.querySelector(`#${modelElemId}`);

            if (modelElem && modelElem.value !== 'None' && triggerWordElem && triggerWordElem.value) {
                addTriggerWordToPrompt(triggerWordElem.value);
            }
        }
    } catch (error) {
        console.error('Error in globalAutoAddLoraTriggerWord:', error);
    }
};

// Alias for backward compatibility if needed, but we will update webui.py
window.autoAddLoraTriggerWord = window.globalAutoAddLoraTriggerWord;

var original_lines = {};
var translated_lines = {};
var reverseLocalization = null;

function getReverseLocalization() {
    if (reverseLocalization === null && window.localization) {
        reverseLocalization = {};
        for (const [en, cn] of Object.entries(window.localization)) {
            reverseLocalization[cn] = en;
        }
    }
    return reverseLocalization;
}

const browser={
    device: function(){
           var u = navigator.userAgent;
           return {
                is_mobile: !!u.match(/AppleWebKit.*Mobile.*/),
                is_pc: (u.indexOf('Macintosh') > -1 || u.indexOf('Windows NT') > -1),
		is_wx_mini: (u.indexOf('miniProgram') > -1),
            };
         }(),
    language: (navigator.browserLanguage || navigator.language).toLowerCase()
}

function hasLocalization() {
    return window.localization && Object.keys(window.localization).length > 0;
}

function textNodesUnder(el) {
    var n, a = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    while ((n = walk.nextNode())) a.push(n);
    return a;
}

function isTagCartLocalizationExcluded(target) {
    if (!target) return false;

    const element = target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    if (!element || !element.closest) return false;

    return !!element.closest(
        '#draggable-container, #custom-tags-editor, #selected-tags-container, #tag-display-container, .tagcart-panel, .tagcart-editor'
    );
}

function canBeTranslated(node, text) {
    if (!text) return false;
    if (!node.parentElement) return false;
    if (isTagCartLocalizationExcluded(node)) return false;
    var parentType = node.parentElement.nodeName;
    if (parentType == 'SCRIPT' || parentType == 'STYLE' || parentType == 'TEXTAREA') return false;
    if (re_num.test(text)) return false;
    return true;
}

function getTranslation(text) {
    if (!text) return undefined;

    if (translated_lines[text] === undefined) {
        original_lines[text] = 1;
    }

    var tl = localization[text];
    if (tl !== undefined) {
        translated_lines[tl] = 1;
    }

    return tl;
}

function localizePlaceholderNode(node, explicitEnglishText) {
    if (!node) return;

    const rev = getReverseLocalization();
    let identity =
        explicitEnglishText ||
        (node.getAttribute ? node.getAttribute("data-original-placeholder") : null) ||
        node.placeholder ||
        "";

    if (rev && rev[identity]) {
        identity = rev[identity];
    }

    if (!identity) return;

    try {
        if (node.getAttribute && node.getAttribute("data-original-placeholder") !== identity) {
            node.setAttribute("data-original-placeholder", identity);
        }
    } catch (e) {}

    const tl = getTranslation(identity);
    if (tl !== undefined && node.placeholder !== tl) {
        node.placeholder = tl;
    }
}

function resolvePlaceholderTarget(root) {
    if (!root) return null;

    try {
        if (typeof root.placeholder === "string") {
            return root;
        }
    } catch (e) {}

    try {
        if (root.querySelector) {
            return root.querySelector('input[placeholder], textarea[placeholder], [placeholder]');
        }
    } catch (e) {}

    return null;
}

function processTextNode(node) {
    var text = node.textContent.trim();
    if (!canBeTranslated(node, text)) return;

    const rev = getReverseLocalization();
    const parent = node.parentElement;
    const originalFromAttr =
        (parent && parent.getAttribute && parent.getAttribute('data-original-text')) ||
        (parent && parent.closest && parent.closest('label') && parent.closest('label').getAttribute('data-original-text')) ||
        (parent && parent.closest && parent.closest('span') && parent.closest('span').getAttribute('data-original-text')) ||
        null;

    const hasCJK = (s) => /[\u4e00-\u9fff]/.test(String(s || ""));
    let identity = text;
    if (originalFromAttr) {
        const tlFromAttr = (typeof localization !== 'undefined' && localization) ? localization[originalFromAttr] : undefined;
        const isEnglishLocale = (typeof locale_lang !== 'undefined' && locale_lang === 'en');
        const useOriginal =
            text === originalFromAttr ||
            (tlFromAttr !== undefined && text === tlFromAttr) ||
            (isEnglishLocale && hasCJK(text) && !hasCJK(originalFromAttr));
        if (useOriginal) {
            identity = originalFromAttr;
        }
    }
    var tl = getTranslation(identity);
    let originalText = identity;

    if (tl === undefined) {
        if (rev && rev[text]) {
            identity = rev[text];
            originalText = identity;
            tl = getTranslation(identity);
        }
        if (tl === undefined) {
            if (identity && identity !== text) {
                tl = identity;
            } else {
                tl = text;
            }
        }
    }

    if (tl !== undefined) {
        if (node.textContent.trim() !== tl) {
            node.textContent = tl;
        }
    }

    if (originalText && node.parentElement) {
        let p = node.parentElement;

        if ((p.nodeName === 'SPAN' || p.nodeName === 'LABEL') && p.getAttribute("data-original-text") !== originalText) {
             p.setAttribute("data-original-text", originalText);
        }

        let label = p.closest('label');
        if (label && label.getAttribute("data-original-text") !== originalText) {
             label.setAttribute("data-original-text", originalText);
        }

        let closestSpan = p.closest('span');
        if (closestSpan && closestSpan.getAttribute("data-original-text") !== originalText) {
            closestSpan.setAttribute("data-original-text", originalText);
        }

        let galleryDiv = p.closest('div.gallery');
        if (galleryDiv && galleryDiv.getAttribute("data-original-text") !== originalText) {
             galleryDiv.setAttribute("data-original-text", originalText);
        }
    }
}

function processNode(node) {
    if (!node) return;
    if (isTagCartLocalizationExcluded(node)) return;
    if (node.nodeType == 3) {
        processTextNode(node);
        return;
    }

    if (node.title) {
        let tl = getTranslation(node.title);
        if (tl !== undefined) {
            node.title = tl;
        }
    }

    if (node.placeholder) {
        localizePlaceholderNode(node);
    }

    textNodesUnder(node).forEach(function(node) {
	processTextNode(node);
    });
}

function refresh_style_localization() {
    const node = document.querySelector('.style_selections');
    if (!node) return;
    processNode(node);
}

function refresh_qwen_tts_localization() {
    const targets = [
        ["#qwen_design_text", "Enter text here...[pause=800ms] or [pause=0.8s] can add pause between sentences."],
        ["#qwen_design_instruct", "e.g. A cheerful young woman..."],
        ["#qwen_design_style_preset_name", "Character Name for Your Role/Style"],
        ["#qwen_clone_ref_text", "Recommended: the spoken content in reference audio"],
        ["#qwen_clone_target_text", "Enter text here...[pause=800ms] or [pause=0.8s] can add pause between sentences."],
        ["#qwen_custom_text", "Enter text here...[pause=800ms] or [pause=0.8s] can add pause between sentences."],
        ["#qwen_custom_style_preset_name", "Character Name for Your Role/Style"],
        ["#qwen_dialogue_script", "Format: Character Name: Text (one sentence per line) \n\nCharacter 1: Hello, what shall we talk about today? \nCharacter 2: I'd like to learn about Qwen3-TTS voice cloning. \nCharacter 3: Let me summarize the key points of parameter settings. \nNarrator: They started a relaxed conversation."],
    ];
    targets.forEach(([selector, englishText]) => {
        try {
            const root = gradioApp().querySelector(selector);
            const node = resolvePlaceholderTarget(root);
            if (node) {
                localizePlaceholderNode(node, englishText);
            }
        } catch (e) {}
    });

    const currentLang = (() => {
        try {
            return window.SimpAII18n?.getUiLang(window.simpleaiTopbarSystemParams) || (locale_lang === 'en' ? 'en' : 'cn');
        } catch (e) {
            return 'en';
        }
    })();
    const roleDefaults = [
        ['#qwen_role_1_name', 'Role 1', '角色1'],
        ['#qwen_role_2_name', 'Role 2', '角色2'],
        ['#qwen_role_3_name', 'Role 3', '角色3'],
        ['#qwen_role_4_name', 'Narrator', '旁白'],
    ];
    roleDefaults.forEach(([selector, englishValue, chineseValue]) => {
        try {
            const root = gradioApp().querySelector(selector);
            const input = root?.matches?.('input') ? root : root?.querySelector?.('input');
            if (!input) return;
            const current = String(input.value || '').trim();
            const knownDefaults = new Set([englishValue, chineseValue]);
            if (!knownDefaults.has(current)) return;
            const next = currentLang === 'en' ? englishValue : chineseValue;
            if (input.value === next) return;
            input.value = next;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {}
    });
}

let styleGridOriginalElements = [];
let styleSelectionsOriginalElements = [];
let styleGridHandlersAttached = false;
let isHandlingClick = false;
let lastKnownGoodStyles = new Set();
let lastAvailableStyleSet = new Set(); // 记录上一次看到的可用风格集合

let styleLayoutObserverAttached = false;
let styleLayoutRefreshScheduled = false;
let styleLayoutRefreshTimers = [];

function isStyleLayoutNode(node) {
    try {
        if (!(node instanceof Element)) return false;
        return !!node.closest?.('.style_grid, .style_selections, .style_selections_tab, #style_visual_layout_container, #selected_styles_preview');
    } catch (e) {
        return false;
    }
}

function hasStyleLayoutNode(node) {
    try {
        if (!(node instanceof Element)) return false;
        return isStyleLayoutNode(node) || !!node.querySelector?.('.style_grid, .style_selections, .style_selections_tab, #style_visual_layout_container, #selected_styles_preview');
    } catch (e) {
        return false;
    }
}

function isStyleLayoutMutation(mutation) {
    try {
        if (isStyleLayoutNode(mutation.target)) return true;
        for (const node of mutation.addedNodes || []) {
            if (hasStyleLayoutNode(node)) return true;
        }
        for (const node of mutation.removedNodes || []) {
            if (hasStyleLayoutNode(node)) return true;
        }
    } catch (e) {}
    return false;
}

function isStyleLayoutPresent() {
    return !!document.querySelector('.style_grid, .style_selections, #style_visual_layout_container, #selected_styles_preview');
}

function isStyleLayoutVisible() {
    try {
        const node = document.querySelector('.style_grid, .style_selections, #style_visual_layout_container, #selected_styles_preview');
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    } catch (e) {
        return false;
    }
}

function styleSampleUrlForName(styleName) {
    const fallback = '/gradio_api/file=sdxl_styles/samples/fooocus_v2.jpg';
    const samplesPath = document.querySelector("meta[name='samples-path']")?.getAttribute("content") || fallback;
    const normalizedName = String(styleName || '')
        .toLowerCase()
        .replaceAll(" ", "_")
        .replace(/[^a-z0-9_]/g, '');
    return samplesPath.replace(/fooocus_v2(?=\.[a-z0-9]+(?:\?|$))/i, normalizedName || 'default_style');
}

function defaultStyleSampleUrl() {
    return styleSampleUrlForName('default_style');
}

function schedule_style_layout_refresh(reason = 'manual') {
    if (styleLayoutRefreshScheduled) return;
    styleLayoutRefreshScheduled = true;
    styleLayoutRefreshTimers.forEach((timer) => clearTimeout(timer));
    styleLayoutRefreshTimers = [];
    simpaiUiTrace("log", '[UI-TRACE] schedule_style_layout_refresh', { reason });
    const run = (phase) => {
        try {
            refresh_style_localization();
            refresh_style_layout();
        } catch (e) {
            try { console.warn('[UI-TRACE] style_layout_refresh_failed', reason, phase, e); } catch (_e) {}
        }
    };
    const scheduleRun = (delay, phase) => {
        const timer = setTimeout(() => run(phase), delay);
        styleLayoutRefreshTimers.push(timer);
    };
    const release = () => {
        styleLayoutRefreshScheduled = false;
        styleLayoutRefreshTimers = [];
    };
    const start = () => {
        run('raf');
        scheduleRun(180, 'settle');
        scheduleRun(800, 'late');
        scheduleRun(1800, 'final');
        const releaseTimer = setTimeout(release, 1900);
        styleLayoutRefreshTimers.push(releaseTimer);
    };
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(start);
    } else {
        const timer = setTimeout(start, 0);
        styleLayoutRefreshTimers.push(timer);
    }
}

function notify_style_state_changed(reason = 'manual') {
    const target = document.querySelector("#gradio_receiver_style_selections textarea");
    if (!target) {
        schedule_style_layout_refresh(reason);
        return;
    }
    target.value = `${reason} ${Date.now()} ${Math.random()}`;
    const event = new Event("input", { bubbles: true });
    try {
        Object.defineProperty(event, "target", { value: target });
    } catch (e) {}
    target.dispatchEvent(event);
    schedule_style_layout_refresh(reason);
}

function ensure_style_layout_observer() {
    if (styleLayoutObserverAttached) return;
    styleLayoutObserverAttached = true;
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (!isStyleLayoutMutation(mutation)) continue;
            schedule_style_layout_refresh('mutation');
            break;
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('button, [role="tab"]');
        const text = (tab?.textContent || '').trim().toLowerCase();
        const originalText = (tab?.getAttribute('data-original-text') || tab?.dataset?.originalText || '').trim();
        if (text === 'styles' || text === 'style' || originalText === 'Styles') {
            schedule_style_layout_refresh('style_tab_click');
        }
    }, true);
    schedule_style_layout_refresh('observer_init');
}

function init_style_grid_handlers() {
    if (styleGridHandlersAttached) {
        const currentContainer = document.querySelector(".style_grid");
        if (currentContainer && currentContainer.getAttribute('data-handlers-attached') !== 'true') {
            styleGridHandlersAttached = false;
        } else {
            return;
        }
    }
    const container = document.querySelector(".style_grid");
    if (!container) return;

    container.setAttribute('data-handlers-attached', 'true');

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.style-button');
        if (!btn) return;

        const styleName = btn.getAttribute('data-style-name');
        if (!styleName) return;

        const selections = document.querySelector('.style_selections');
        if (!selections) return;

        const labels = selections.querySelectorAll('label');
        let found = false;
        const cleanStyle = styleName.toLowerCase().replace(/[- _]/g, '');

        const rev = getReverseLocalization();

        for (const label of labels) {
            const input = label.querySelector('input[type="checkbox"]');
            if (!input) continue;

            const labelText = label.textContent.trim();

            let identity = (input.value && input.value !== 'on') ? input.value : null;
            
            if (!identity) {
                identity = label.getAttribute('data-original-text') || 
                           (label.querySelector('span') ? label.querySelector('span').getAttribute('data-original-text') : null) ||
                           (rev ? rev[labelText] : null) ||
                           labelText;
            }

            if (!identity) continue;
            const cleanIdentity = identity.toLowerCase().replace(/[- _]/g, '');

            if (cleanIdentity === cleanStyle) {
                const willBeChecked = !input.checked;
                isHandlingClick = true;

                if (willBeChecked) {
                    lastKnownGoodStyles.add(cleanStyle);
                } else {
                    lastKnownGoodStyles.delete(cleanStyle);
                }

                input.click();

                window.styleExpectedState = {
                    name: cleanStyle,
                    state: willBeChecked,
                    timestamp: Date.now()
                };

                sync_style_grid_state();

                setTimeout(() => {
                    if (isHandlingClick) {
                        isHandlingClick = false;
                        sync_style_grid_state();
                    }
                }, 2000);

                found = true;
                break;
            }
        }
        if (!found) {
            console.warn(`[StyleClick] Could not find checkbox matching style: ${styleName}`);
        }
    });

    container.addEventListener('contextmenu', (e) => {
        const btn = e.target.closest('.style-button');
        if (!btn) return;
        e.preventDefault();
        const styleDataRaw = btn.parentElement.getAttribute('data-style-data');
        if (!styleDataRaw) return;
        try {
            const styleData = JSON.parse(styleDataRaw);
            const prompt = styleData.prompt || '';
            const negativePrompt = styleData.negative_prompt || '';
            const promptTextarea = document.querySelector('#positive_prompt textarea, #positive_prompt [data-testid="textbox"]');
            const negativePromptTextarea = document.querySelector('#negative_prompt textarea, #negative_prompt [data-testid="textbox"]');
            const applyTemplate = (template, userText) => {
                const t = (template || '').trim();
                const u = (userText || '').trim();
                if (!t) return u;
                if (t.includes('{prompt}')) {
                    const replaced = t.replace(/\{prompt\}/gi, u);
                    return replaced.replace(/\s+\.\s+/g, '. ').replace(/\s{2,}/g, ' ').trim();
                }
                return u ? `${u}, ${t}` : t;
            };
            if (promptTextarea && (prompt || promptTextarea.value)) {
                const current = promptTextarea.value;
                promptTextarea.value = applyTemplate(prompt, current);
                promptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (negativePromptTextarea && (negativePrompt || negativePromptTextarea.value)) {
                const currentNeg = negativePromptTextarea.value;
                negativePromptTextarea.value = applyTemplate(negativePrompt, currentNeg);
                negativePromptTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } catch (err) {}
    });

    styleGridHandlersAttached = true;

    ['mousedown', 'click'].forEach(eventType => {
        document.addEventListener(eventType, (e) => {
            const target = e.target;

            let targetBtn = null;
            if (target.classList.contains('bar_button')) {
                targetBtn = target;
            } else {
                targetBtn = target.closest('button');
                if (targetBtn && !targetBtn.closest('.preset_store') && !targetBtn.classList.contains('bar_button')) {
                    targetBtn = null;
                }
            }

            if (targetBtn) {
                let isAlreadyActive = false;
                if (targetBtn) {
                    const bg = targetBtn.style.background || '';
                    const color = targetBtn.style.color || '';

                    if (color === 'white' || bg.includes('secondary-200') || (targetBtn.closest('.preset_store') && targetBtn.classList.contains('primary'))) {
                         isAlreadyActive = true;
                    }
                }

                if (isAlreadyActive) {
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }

                if (eventType === 'mousedown') {
                    if (targetBtn.closest('.preset_store') || targetBtn.classList.contains('bar_button')) {
                         isHandlingClick = false;
                         lastKnownGoodStyles.clear();
                         window.styleExpectedState = null; // Clear any pending style enforcement

                         // Set a global lock to prevent style syncing from interfering with preset loading
                         window.presetLoadingLock = Date.now();

                         return;
                    }

                    isHandlingClick = false;
                    lastKnownGoodStyles.clear();
                    lastAvailableStyleSet.clear();

                    const selections = document.querySelector('.style_selections');
                    if (selections) {
                        const inputs = selections.querySelectorAll('input[type="checkbox"]');
                        inputs.forEach(input => {
                            if (input.checked) {
                                input.checked = false;
                            }
                        });
                    }

                    sync_style_grid_state();
                }
            }
        }, true);
    });

    const selections = document.querySelector('.style_selections');
    if (selections) {
        const observer = new MutationObserver(() => { sync_style_grid_state(); });
        observer.observe(selections, { childList: true, subtree: true, attributes: true });
        sync_style_grid_state();
    }
}

function sync_style_grid_state() {
    const selections = document.querySelector('.style_selections');
    if (!selections) return;
    const container = document.querySelector(".style_grid");
    if (!container) return;

    const labels = selections.querySelectorAll('label');
    const currentAvailableStyles = new Set();
    const rev = getReverseLocalization();

    labels.forEach(label => {
        const input = label.querySelector('input[type="checkbox"]');
        if (!input) return;
        let identity = (input.value && input.value !== 'on') ? input.value : null;
        if (!identity) {
            const labelText = label.textContent.trim();
            identity = label.getAttribute('data-original-text') ||
                       (label.querySelector('span') ? label.querySelector('span').getAttribute('data-original-text') : null) ||
                       (rev ? rev[labelText] : null) ||
                       labelText;
        }
        if (identity) {
            currentAvailableStyles.add(identity.toLowerCase().replace(/[- _]/g, ''));
        }
    });

    if (lastAvailableStyleSet.size > 0) {
        let changed = false;
        if (currentAvailableStyles.size !== lastAvailableStyleSet.size) {
            changed = true;
        } else {
            for (let s of currentAvailableStyles) {
                if (!lastAvailableStyleSet.has(s)) {
                    changed = true;
                    break;
                }
            }
        }
        if (changed && isHandlingClick) {
            isHandlingClick = false;
        }
    }
    lastAvailableStyleSet = currentAvailableStyles;

    const selectedStyles = new Set();
    const currentDOMSelected = new Set();

    labels.forEach(label => {
        const input = label.querySelector('input[type="checkbox"]');
        if (!input) return;

        const labelText = label.textContent.trim();
        let identity = (input.value && input.value !== 'on') ? input.value : null;

        if (!identity) {
            identity = label.getAttribute('data-original-text') ||
                       (label.querySelector('span') ? label.querySelector('span').getAttribute('data-original-text') : null) ||
                       (rev ? rev[labelText] : null) ||
                       labelText;
        }

        if (identity) {
            const cleanText = identity.toLowerCase().replace(/[- _]/g, '');

            // Check lock first
            if (window.presetLoadingLock && Date.now() - window.presetLoadingLock < 500) {
                isHandlingClick = false;
                lastKnownGoodStyles = new Set(currentDOMSelected);
                // We still let the function run to update UI classes
            }
            // Enforce expected state if mismatch detected within 1s (Only if not locked)
            else if (window.styleExpectedState &&
                window.styleExpectedState.name === cleanText &&
                Date.now() - window.styleExpectedState.timestamp < 1000) {

                if (input.checked !== window.styleExpectedState.state) {
                    // console.warn(`[StyleSync] State mismatch for ${identity}! Expected ${window.styleExpectedState.state}, got ${input.checked}. Enforcing and notifying.`);
                    input.checked = window.styleExpectedState.state;
                    // Dispatch event to ensure Gradio frontend framework is aware of the change
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }

            if (isHandlingClick && (!window.presetLoadingLock || Date.now() - window.presetLoadingLock >= 500)) {
                if (input.checked) {
                    if (!lastKnownGoodStyles.has(cleanText)) {
                            lastKnownGoodStyles.add(cleanText);
                    }
                    selectedStyles.add(cleanText);
                } else {

                    if (lastKnownGoodStyles.has(cleanText)) {
                            lastKnownGoodStyles.delete(cleanText);
                    }
                }
            } else {
                if (input.checked) {
                    selectedStyles.add(cleanText);
                    currentDOMSelected.add(cleanText);
                }
            }
        }
    });

    if (!isHandlingClick) {
        lastKnownGoodStyles = new Set(currentDOMSelected);
    }

    const buttons = container.querySelectorAll('.style-button');
    buttons.forEach(btn => {
        const styleName = btn.getAttribute('data-style-name');
        if (!styleName) return;
        const cleanName = styleName.toLowerCase().replace(/[- _]/g, '');
        if (selectedStyles.has(cleanName)) {
            btn.classList.add('primary');
            btn.classList.remove('secondary');
        } else {
            btn.classList.remove('primary');
            btn.classList.add('secondary');
        }
    });

    const styleItems = container.querySelectorAll('.style_item');
    styleItems.forEach(item => {
        const btn = item.querySelector('button');
        const rawName = btn?.getAttribute('data-style-name');
        if (!rawName) return;
        const cleanName = rawName.toLowerCase().replace(/[- _]/g, '');
        const isSelected = selectedStyles.has(cleanName);

        if (isSelected) {
            btn.classList.add('primary');
            btn.classList.remove('secondary');
            item.style.order = 0;
        } else {
            btn.classList.remove('primary');
            btn.classList.add('secondary');
            item.style.order = 1;
        }
    });
}

function refresh_style_layout() {
    const start = performance.now();
    const gridContainer = document.querySelector(".style_grid");
    const selectionsContainer = document.querySelector('.style_selections');
    
    if (!gridContainer && !selectionsContainer) return;

    if (gridContainer) {
        init_style_grid_handlers();
    }

    if (!selectionsContainer) return;

    const labels = selectionsContainer.querySelectorAll('label');
    let selectedStylesClean = new Set();
    const rev = getReverseLocalization();

    labels.forEach(label => {
        const cb = label.querySelector('input[type="checkbox"]');
        if (!cb) return;

        const labelText = label.textContent.trim();
        let identity = (cb.value && cb.value !== 'on') ? cb.value : null;

        if (!identity) {
            identity = label.getAttribute('data-original-text') ||
                       (label.querySelector('span') ? label.querySelector('span').getAttribute('data-original-text') : null) ||
                       (rev ? rev[labelText] : null) ||
                       labelText;
        }

        if (identity) {
            const cleanText = identity.toLowerCase().replace(/[- _]/g, '');
            if (cb.checked) {
                selectedStylesClean.add(cleanText);
            }
        }
    });

    if (isHandlingClick) {
        lastKnownGoodStyles.forEach(s => selectedStylesClean.add(s));
    }

    const searchBar = gradioApp().querySelector('textarea[data-testid="textbox"][placeholder*="搜索风格"], textarea[data-testid="textbox"][placeholder*="search styles"]');
    const searchText = (searchBar?.value?.trim() || '').toLowerCase();
    const cleanSearchText = searchText.replace(/[- _]/g, '');

    if (gridContainer) {
        if (styleGridOriginalElements.length === 0) {
            styleGridOriginalElements = [...gridContainer.querySelectorAll('.style_item')];
        }

        styleGridOriginalElements.forEach((item) => {
            const btn = item.querySelector('button');
            const btnText = btn?.textContent.trim();
            const rawName = btn?.getAttribute('data-style-name') || btnText;
            if (!rawName) return;

            const cleanName = rawName.toLowerCase().replace(/[- _]/g, '');
            const isSelected = selectedStylesClean.has(cleanName);

            const matchesSearch = cleanName.includes(cleanSearchText) || 
                                  btnText.toLowerCase().includes(searchText);
            const isVisible = isSelected || matchesSearch;

            if (isVisible) {
                item.style.setProperty('display', 'block', 'important');
                item.style.order = isSelected ? 0 : 1;

                if (!btn.style.backgroundImage || btn.style.backgroundImage === 'none') {
                    const defaultUrl = defaultStyleSampleUrl();
                    const candidateUrls = [styleSampleUrlForName(rawName)];

                    btn.style.backgroundImage = `url("${defaultUrl}")`;

                    let candidateIndex = 0;
                    const probe = new Image();
                    probe.onload = () => {
                        const url = candidateUrls[candidateIndex];
                        if (url) {
                            btn.style.backgroundImage = `url("${url}")`;
                        }
                    };
                    probe.onerror = () => {
                        candidateIndex += 1;
                        if (candidateIndex < candidateUrls.length) {
                            probe.src = candidateUrls[candidateIndex];
                        }
                    };
                    probe.src = candidateUrls[candidateIndex];
                }

                if (isSelected) {
                    btn.classList.add('primary');
                    btn.classList.remove('secondary');
                } else {
                    btn.classList.add('secondary');
                    btn.classList.remove('primary');
                }
            } else {
                item.style.setProperty('display', 'none', 'important');
            }
        });
    }

    const checkboxGroup = selectionsContainer.querySelector('.wrap[data-testid="checkbox-group"]');
    if (checkboxGroup) {
        const labels = checkboxGroup.querySelectorAll('label');
        labels.forEach((label) => {
            const labelText = label.textContent.trim();
            const identity = label.getAttribute('data-original-text') ||
                             (label.querySelector('span') ? label.querySelector('span').getAttribute('data-original-text') : null) ||
                             (rev ? rev[labelText] : null) ||
                             labelText;

            if (!identity) return;

            const cleanText = identity.toLowerCase().replace(/[- _]/g, '');
            const isSelected = selectedStylesClean.has(cleanText);
            
            const translatedText = label.textContent.trim().toLowerCase();
            
            const matchesSearch = cleanText.includes(cleanSearchText) || 
                                  translatedText.includes(searchText);
            const isVisible = isSelected || matchesSearch;

            if (isVisible) {
                label.style.setProperty('display', 'flex', 'important');
                label.style.order = isSelected ? 0 : 1;
            } else {
                label.style.setProperty('display', 'none', 'important');
            }
        });
    }
}



let sceneDirectorLocalizationRefreshScheduled = false;

function scheduleSceneDirectorLocalizationRefresh() {
    if (sceneDirectorLocalizationRefreshScheduled) return;
    sceneDirectorLocalizationRefreshScheduled = true;
    const run = () => {
        sceneDirectorLocalizationRefreshScheduled = false;
        if (typeof refresh_scene_director_localization === "function") refresh_scene_director_localization();
    };
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(run);
    } else {
        setTimeout(run, 0);
    }
}

function refresh_scene_localization() {
    const node = document.querySelector('.scene_aspect_ratio_selections');
    if (node) processNode(node);
    scheduleSceneDirectorLocalizationRefresh();
}

function refresh_aspect_ratios_label(value) {
    var root = document.getElementById('aspect_ratios_accordion');
    if (!root) return;
    var label = root.querySelector('button span') || root.querySelector('summary span');
    if (!label) {
        var candidates = Array.from(root.querySelectorAll('span'));
        label = candidates.find((node) => (node.textContent || '').trim().startsWith('Aspect Ratios')) || null;
    }
    if (!label) return;
    var translation = getTranslation("Resolution");
    if (typeof translation == "undefined") {
        translation = "Resolution";
    }
    value = (value || "").split(",")[0];
    value = htmlDecode(value)
        .replace(/<[^>]*>/g, "")
        .replace(/\s*\|\s*/g, " | ")
        .replace(/\s+/g, " ")
        .trim();

    var multiplier = 1.0;
    try {
        var mRoot = document.getElementById('resolution_multiplier');
        var mNumberInput = mRoot ? mRoot.querySelector('input[type="number"]') : null;
        var mRangeInput = mRoot ? mRoot.querySelector('input[type="range"]') : null;
        var mRaw = (mNumberInput && mNumberInput.value) ? mNumberInput.value : (mRangeInput ? mRangeInput.value : null);
        var m = parseFloat(mRaw);
        if (Number.isFinite(m) && m > 0) {
            multiplier = m;
        }
    } catch (e) {}

    var baseW = null;
    var baseH = null;
    try {
        var owRoot = document.getElementById('overwrite_width');
        var ohRoot = document.getElementById('overwrite_height');
        var owInput = owRoot ? owRoot.querySelector('input[type="number"]') : null;
        var ohInput = ohRoot ? ohRoot.querySelector('input[type="number"]') : null;
        var ow = owInput ? parseInt(owInput.value, 10) : NaN;
        var oh = ohInput ? parseInt(ohInput.value, 10) : NaN;
        if (Number.isFinite(ow) && Number.isFinite(oh) && ow > 0 && oh > 0) {
            baseW = ow;
            baseH = oh;
        }
    } catch (e) {}

    if (baseW == null || baseH == null) {
        try {
            var m2 = String(value).match(/(\d+)\D+(\d+)/);
            if (m2) {
                baseW = parseInt(m2[1], 10);
                baseH = parseInt(m2[2], 10);
            }
        } catch (e) {}
    }

    var suffix = "";
    if (baseW != null && baseH != null && multiplier > 1.0) {
        var readQuantizeStep = function() {
            try {
                var sRoot = document.getElementById('resolution_quantize_step');
                var sInput = sRoot ? sRoot.querySelector('input[type="number"]') : null;
                var raw = sInput ? parseInt(sInput.value, 10) : NaN;
                var step = Number.isFinite(raw) ? raw : 8;
                return [8, 16, 32, 64].includes(step) ? step : 8;
            } catch (e) {
                return 8;
            }
        };
        var quantizeByStep = function(v) {
            var step = readQuantizeStep();
            var q = Math.round(v / step) * step;
            if (!(q > 0)) q = step;
            return q;
        };
        var effW = quantizeByStep(baseW * multiplier);
        var effH = quantizeByStep(baseH * multiplier);
        if (Number.isFinite(effW) && Number.isFinite(effH) && effW > 0 && effH > 0) {
            suffix = " \u2192 " + effW + "\u00d7" + effH;
        }
    }

    label.textContent = translation + " - " + value + suffix;
}

function init_aspect_ratios_label_multiplier_binding() {
    try {
        var mRoot = document.getElementById('resolution_multiplier');
        if (!mRoot) return;
        if (mRoot.dataset.aspectRatiosBound === '1') return;
        mRoot.dataset.aspectRatiosBound = '1';

        var mNumberInput = mRoot.querySelector('input[type="number"]');
        var mRangeInput = mRoot.querySelector('input[type="range"]');
        var sRoot = document.getElementById('resolution_quantize_step');
        var sNumberInput = sRoot ? sRoot.querySelector('input[type="number"]') : null;
        var readAspectValue = function() {
            var root = document.getElementById('aspect_ratios_selection');
            if (!root) return "";
            var input = root.querySelector('input, textarea');
            return input ? (input.value || "") : "";
        };
        var refresh = function() {
            refresh_aspect_ratios_label(readAspectValue());
        };

        if (mNumberInput) {
            mNumberInput.addEventListener('input', refresh, { passive: true });
            mNumberInput.addEventListener('change', refresh, { passive: true });
        }
        if (mRangeInput) {
            mRangeInput.addEventListener('input', refresh, { passive: true });
            mRangeInput.addEventListener('change', refresh, { passive: true });
        }
        if (sNumberInput) {
            sNumberInput.addEventListener('input', refresh, { passive: true });
            sNumberInput.addEventListener('change', refresh, { passive: true });
        }
        refresh();
    } catch (e) {}
}

if (typeof onUiLoaded === 'function') {
    onUiLoaded(init_aspect_ratios_label_multiplier_binding);
    onUiLoaded(ensure_style_layout_observer);
}
if (typeof onAfterUiUpdate === 'function') {
    onAfterUiUpdate(init_aspect_ratios_label_multiplier_binding);
    onAfterUiUpdate(() => {
        if (isStyleLayoutPresent()) {
            schedule_style_layout_refresh('after_ui_update');
        }
    });
}


function is_finished_images_catalog_open() {
    var root = document.getElementById("finished_images_catalog");
    if (!root) return false;
    try {
        if (typeof isSimpleAIPresetGallerySuppressed === "function" && isSimpleAIPresetGallerySuppressed()) return false;
        if (root.dataset && root.dataset.simpleaiPresetSwitchCatalogCollapsed === "1") return false;
        if (root.classList && root.classList.contains("simpai-preset-switch-catalog-collapsed")) return false;
    } catch (e) {}
    var labelButton = root.querySelector("button.label-wrap");
    if (labelButton) {
        var expanded = labelButton.getAttribute("aria-expanded");
        if (expanded === "true") return true;
        if (expanded === "false") return false;
    }
    var body = labelButton ? labelButton.nextElementSibling : null;
    if (!body) return false;
    try {
        var style = window.getComputedStyle(body);
        if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    } catch (e) {}
    return !!(body.offsetHeight || body.getClientRects().length);
}

function refresh_finished_images_catalog_label(value, type, options) {
    var root = document.getElementById("finished_images_catalog");
    var label = root ? root.querySelector('button.label-wrap > span:not(.icon)') : null;
    if (!label && root) {
        label = Array.from(root.querySelectorAll('span')).find(function (span) {
            return !span.classList.contains("icon") && !span.closest("[data-simpleai-gallery-frost-control]");
        });
    }
    if (!label || typeof value === "undefined" || value === null) {
        return;
    }
    var requestedType = type == "video" ? "video" : (type == "image" ? "image" : "");
    var activeGalleryType = "";
    var galleryBrowserBusy = false;
    try {
        if (typeof finishedGalleryBrowserState !== "undefined" && finishedGalleryBrowserState) {
            galleryBrowserBusy = !!(finishedGalleryBrowserState.loading || finishedGalleryBrowserState.pendingPayload);
            var pendingPayload = finishedGalleryBrowserState.pendingPayload || null;
            if (pendingPayload && pendingPayload.media_type) {
                activeGalleryType = pendingPayload.media_type == "video" ? "video" : "image";
            } else if (finishedGalleryBrowserState.mediaType) {
                activeGalleryType = finishedGalleryBrowserState.mediaType == "video" ? "video" : "image";
            }
        }
        if (typeof getActiveGalleryMediaSwitchLock === "function") {
            var mediaLock = getActiveGalleryMediaSwitchLock();
            if (mediaLock && mediaLock.mode) activeGalleryType = mediaLock.mode == "video" ? "video" : "image";
        }
        if (!activeGalleryType && typeof getFinishedGalleryBrowserMode === "function") {
            activeGalleryType = getFinishedGalleryBrowserMode(requestedType || undefined);
        }
    } catch (e) {}
    if (activeGalleryType == "video" && (galleryBrowserBusy || is_finished_images_catalog_open())) {
        requestedType = "video";
    } else if (!requestedType && activeGalleryType) {
        requestedType = activeGalleryType;
    }
    type = requestedType || "image";
    var translation = getTranslation("Finished Images Catalog");
    if (typeof translation == "undefined") {
        translation = "Finished Images Catalog";
    }
    var translation_stat = getTranslation("total: xxx images and yyy pages");
    if (typeof translation_stat == "undefined") {
        translation_stat = "total: xxx images and yyy pages";
    }
    if (type != "video" && document.getElementById("gallery_browser_load_btn")) {
        translation_stat = getTranslation("total: xxx images");
        if (typeof translation_stat == "undefined") {
            translation_stat = "total: xxx images";
        }
    }
    if (type == "video") {
        translation = getTranslation("Finished Videos Catalog");
        if (typeof translation == "undefined") {
            translation = getTranslation("Finished Videoes");
        }
	translation_stat = getTranslation("total: xxx videos");
        if (typeof translation_stat == "undefined") {
            translation_stat = getTranslation("total: xxx videoes");
        }
	if (typeof translation == "undefined") {
            translation = "Finished Videos";
	}
	if (typeof translation_stat == "undefined") {
	    translation_stat = "total: xxx videoes";
	}
    }
    value = String(value);
    var xxx = value.split(",")[0];
    var yyy = value.split(",")[1];
    var finished_label = translation + " - " + htmlDecode(translation_stat.replace(/xxx/g, xxx).replace(/yyy/g, yyy));
    label.innerHTML = finished_label;
    try {
        label.setAttribute("data-original-text", finished_label);
        var labelButtonForOriginal = label.closest ? label.closest("button.label-wrap") : null;
        if (labelButtonForOriginal) labelButtonForOriginal.setAttribute("data-original-text", finished_label);
    } catch (e) {}
    try {
        var params = window.simpleaiTopbarSystemParams || (typeof topbarLastSystemParams !== "undefined" ? topbarLastSystemParams : null) || {};
        var skipRefresh = !!(params && params.__skip_gallery_browser_refresh_once);
        if (skipRefresh) {
            params.__skip_gallery_browser_refresh_once = false;
            if (window.simpleaiTopbarSystemParams) window.simpleaiTopbarSystemParams.__skip_gallery_browser_refresh_once = false;
            if (typeof topbarLastSystemParams !== "undefined" && topbarLastSystemParams) topbarLastSystemParams.__skip_gallery_browser_refresh_once = false;
        }
        var targetType = type == "video" ? "video" : "image";
        var suppressSwitchRefresh = false;
        var resultSurfaceActive = false;
        try {
            var switchSuppress = window.__simpleaiGalleryMediaSwitchSuppressRefresh;
            suppressSwitchRefresh = !!(
                switchSuppress
                && switchSuppress.mode === targetType
                && Date.now() < Number(switchSuppress.until || 0)
            );
        } catch (e) {}
        try {
            resultSurfaceActive = document.documentElement.classList.contains("simpai-post-generation-result-surface")
                || document.documentElement.classList.contains("simpai-comparison-preview")
                || document.documentElement.classList.contains("simpai-video-result-preview");
        } catch (e) {}
        var catalogOpen = is_finished_images_catalog_open();
        var shouldRefresh = !skipRefresh && !suppressSwitchRefresh && (
            !!(options && options.refresh === true)
            || (!(options && options.refresh === false) && !resultSurfaceActive && catalogOpen)
        );
        var shouldSyncSwitch = !(options && options.syncSwitch === false) && (
            galleryBrowserBusy
            || shouldRefresh
            || (!resultSurfaceActive && catalogOpen)
        );
        if (shouldSyncSwitch && typeof syncGalleryMediaSwitch === "function") {
            syncGalleryMediaSwitch(targetType);
        }
        if (typeof scheduleFinishedGalleryBrowserRefresh === "function") {
            if (shouldRefresh) scheduleFinishedGalleryBrowserRefresh(targetType);
        }
    } catch (e) {}
}

function refresh_identity_center_label(role) {
    let label = document.getElementById("identity_center");
    if (!label) {
        return;
    }
    var translation = getTranslation("IdentityCenter");
    if (typeof translation == "undefined") {
        translation = "IdentityCenter";
    }
    const isEnglishLocale = (typeof locale_lang !== 'undefined' && locale_lang === 'en');
    const roleLabels = isEnglishLocale
        ? { local: "local", admin: "admin", member: "user", guest: "guest" }
        : { local: '本机', admin: '管理员', member: '用户', guest: '游客' };
    let displayName = String(nickname || "").trim();
    if (roleLabels[role]) {
        displayName = displayName ? displayName + ", " + roleLabels[role] : roleLabels[role];
    }
    label.textContent = displayName ? translation + "(" + displayName + ")" : translation;
}
function refresh_input_image_tab_label() {
    var items = ["Image Prompt", "Upscale or Variation", "Inpaint or Outpaint"]
    var imageInputTabs = document.getElementById('image_input_tabs');
    var tabNav = imageInputTabs.querySelector('.tab-nav');
    var buttons = tabNav.querySelectorAll('button');
    buttons.forEach(function(button) {
	let itemText = button.getAttribute('data-original-text');
	if (items.includes(itemText)) {
	    var translation = getTranslation(itemText);
	    if (typeof translation == "undefined") {
                translation = itemText;
            }
	    let class_name = task_class_name !== "Fooocus" ? "." + task_class_name : "";
	    const localizedText = translation + class_name;
	    button.textContent = localizedText;
	    button.dataset.localizedLabel = localizedText;
	    if (button.dataset.localizedLabelBound !== '1') {
	        button.dataset.localizedLabelBound = '1';
	        button.addEventListener('click', function() {
                    const nextText = button.dataset.localizedLabel;
                    if (nextText && button.textContent !== nextText) {
                        button.textContent = nextText;
                    }
                });
	    }
	}
    });
}

function localizeWholePage() {
    processNode(gradioApp());
    processNode(document.getElementById("simpleai_floating_host"));

    function elem(comp) {
        var elem_id = comp.props.elem_id ? comp.props.elem_id : "component-" + comp.id;
        return gradioApp().getElementById(elem_id);
    }

    for (var comp of window.gradio_config.components) {
        if (comp.props.webui_tooltip) {
            let e = elem(comp);

            let tl = e ? getTranslation(e.title) : undefined;
            if (tl !== undefined) {
                e.title = tl;
            }
        }
        if (comp.props.placeholder) {
            let e = elem(comp);
            let textbox = resolvePlaceholderTarget(e);
            if (textbox) {
                localizePlaceholderNode(textbox, comp.props.placeholder);
            }
        }
    }

    refresh_qwen_tts_localization();
    refresh_scene_localization();
    syncLocalizedCssContent();
    syncGradioUploadPromptLanguage();
}

function syncLocalizedCssContent() {
    try {
        const vlmModelLabel = getTranslation("\uD83E\uDD16 VLM Model:") || "\uD83E\uDD16 VLM Model:";
        const value = JSON.stringify(vlmModelLabel);
        if (document.documentElement.style.getPropertyValue("--simpai-vlm-model-label") !== value) {
            document.documentElement.style.setProperty("--simpai-vlm-model-label", value);
        }
    } catch (e) {}
}

let fullLocalizationRefreshScheduled = false;

function scheduleFullLocalizationRefresh(reason) {
    if (fullLocalizationRefreshScheduled || !hasLocalization()) return;
    fullLocalizationRefreshScheduled = true;
    const run = () => {
        fullLocalizationRefreshScheduled = false;
        try {
            localizeWholePage();
        } catch (e) {
            try { console.warn("[UI-TRACE] localization.full_refresh_failed", reason, e); } catch (_e) {}
        }
    };
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(run);
    } else {
        setTimeout(run, 0);
    }
    setTimeout(() => {
        try { localizeWholePage(); } catch (e) {}
    }, 220);
}

function shouldSkipFullLocalizationClick(target) {
    if (!target || !target.closest) return false;
    try {
        return !!target.closest("#scene_director_accordion");
    } catch (e) {
        return false;
    }
}

function syncGradioUploadPromptLanguage(root) {
    try {
        const isEnglish = (typeof locale_lang !== 'undefined' && locale_lang === 'en');
        if (!isEnglish) return;
        const replacements = {
            '将图像拖放到此处': 'Drop image here',
            '将文件拖放到此处': 'Drop file here',
            '- 或 -': '- or -',
            '点击上传': 'Click to upload'
        };
        const targetRoot = root && root.querySelectorAll ? root : gradioApp();
        if (!targetRoot) return;
        const walker = document.createTreeWalker(targetRoot, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const text = (node.nodeValue || '').trim();
                if (!replacements[text]) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent || !parent.closest) return NodeFilter.FILTER_REJECT;
                return parent.closest('.wrap, .upload-container, .file-preview-holder, .image-container')
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((node) => {
            const text = (node.nodeValue || '').trim();
            if (replacements[text]) {
                node.nodeValue = node.nodeValue.replace(text, replacements[text]);
            }
        });
    } catch (e) {}
}
window.syncGradioUploadPromptLanguage = syncGradioUploadPromptLanguage;

function bindSceneNativeImageDropChrome(root) {
    try {
        const app = gradioApp();
        const selectors = [
            '#scene_input_image1',
            '#scene_input_image2',
            '#scene_input_image3',
            '#scene_input_image4',
            '#scene_input_image5',
            '#scene_input_image6',
            '#scene_input_image7',
            '#scene_input_image8',
            '#describe_input_image',
            '#metadata_input_image',
            '#image_encrypt_input_image',
        ];
        const selectorText = selectors.join(', ');
        const clearDropChrome = () => {
            selectors.forEach((selector) => {
                app?.querySelectorAll(selector).forEach((node) => {
                    node.classList.remove('simpai-native-image-drag-over');
                });
            });
        };
        const activateDropChrome = (target) => {
            selectors.forEach((selector) => {
                app?.querySelectorAll(selector).forEach((node) => {
                    node.classList.toggle('simpai-native-image-drag-over', node === target);
                });
            });
        };
        const targetFromPoint = (event) => {
            const hovered = document.elementFromPoint(event.clientX, event.clientY);
            if (hovered?.closest?.('#scene_input_images.sai-gaussian-studio-image-flow #scene_input_image1')) {
                return null;
            }
            return hovered?.closest?.(selectorText) || null;
        };
        const updateDropChromeFromEvent = (event) => {
            const target = targetFromPoint(event);
            if (!target) {
                clearDropChrome();
                return;
            }
            activateDropChrome(target);
        };
        const searchRoot = root && root.querySelectorAll ? root : app;
        if (searchRoot) {
            const targets = [];
            selectors.forEach((selector) => {
                if (searchRoot.matches && searchRoot.matches(selector)) {
                    targets.push(searchRoot);
                }
                searchRoot.querySelectorAll(selector).forEach((node) => targets.push(node));
            });
            targets.forEach((target) => {
                if (!target || target.dataset.sceneNativeDropChromeBound === '1') return;
                target.dataset.sceneNativeDropChromeBound = '1';
                target.addEventListener('drop', clearDropChrome, true);
            });
        }
        if (app && app.dataset.sceneNativeDropChromeGlobalBound !== '1') {
            app.dataset.sceneNativeDropChromeGlobalBound = '1';
            document.addEventListener('dragenter', updateDropChromeFromEvent, true);
            document.addEventListener('dragover', updateDropChromeFromEvent, true);
            document.addEventListener('dragleave', (event) => {
                const hovered = document.elementFromPoint(event.clientX, event.clientY);
                if (!hovered?.closest?.(selectorText)) {
                    clearDropChrome();
                }
            }, true);
            document.addEventListener('drop', clearDropChrome, true);
            document.addEventListener('dragend', clearDropChrome, true);
            document.addEventListener('mouseleave', clearDropChrome, true);
            window.addEventListener('blur', clearDropChrome);
        }
    } catch (e) {}
}
window.bindSceneNativeImageDropChrome = bindSceneNativeImageDropChrome;

const gradioFullscreenPortalActive = new Set();
const gradioFullscreenPortalState = new WeakMap();
let gradioFullscreenPortalScheduled = false;

function getGradioFullscreenPortalHost() {
    let host = document.getElementById('simpleai_gradio_fullscreen_portal_host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'simpleai_gradio_fullscreen_portal_host';
        document.body.appendChild(host);
    }
    return host;
}

function portalGradioFullscreenBlock(block) {
    if (!block || gradioFullscreenPortalState.has(block)) return;
    if (!block.querySelector?.('[data-testid="image"].image-container')) return;
    const parent = block.parentNode;
    if (!parent) return;
    const placeholder = document.createComment('simpleai-gradio-fullscreen-placeholder');
    parent.insertBefore(placeholder, block);
    gradioFullscreenPortalState.set(block, { parent, placeholder });
    gradioFullscreenPortalActive.add(block);
    block.classList.add('simpleai-gradio-fullscreen-portal-node');
    getGradioFullscreenPortalHost().appendChild(block);
}

function restoreGradioFullscreenBlock(block) {
    const state = gradioFullscreenPortalState.get(block);
    if (!state) return;
    block.classList.remove('simpleai-gradio-fullscreen-portal-node');
    if (state.placeholder?.parentNode) {
        state.placeholder.parentNode.insertBefore(block, state.placeholder);
        state.placeholder.remove();
    }
    gradioFullscreenPortalState.delete(block);
    gradioFullscreenPortalActive.delete(block);
}

function syncGradioFullscreenPortal(root) {
    try {
        const searchRoot = root && root.querySelectorAll ? root : document;
        Array.from(gradioFullscreenPortalActive).forEach((block) => {
            if (!block.isConnected || !block.classList.contains('fullscreen')) {
                restoreGradioFullscreenBlock(block);
            }
        });
        const candidates = [];
        if (searchRoot.matches?.('.block.fullscreen')) candidates.push(searchRoot);
        searchRoot.querySelectorAll?.('.block.fullscreen').forEach((block) => candidates.push(block));
        candidates.forEach(portalGradioFullscreenBlock);
    } catch (e) {}
}

function scheduleGradioFullscreenPortal(root) {
    if (gradioFullscreenPortalScheduled) return;
    gradioFullscreenPortalScheduled = true;
    requestAnimationFrame(() => {
        gradioFullscreenPortalScheduled = false;
        syncGradioFullscreenPortal(root);
    });
}
window.syncGradioFullscreenPortal = syncGradioFullscreenPortal;

document.addEventListener("DOMContentLoaded", function() {
    bindSceneNativeImageDropChrome();
    syncGradioFullscreenPortal();
    try {
        window.addEventListener("simpai:scene-director-capability-updated", () => {
            if (typeof refresh_scene_director_editor !== "function") return;
            const query = typeof sceneDirectorQuery === "function" ? sceneDirectorQuery : (selector) => document.querySelector(selector);
            const editor = query("#scene_director_editor_root");
            if (editor) {
                delete editor.dataset.sceneDirectorRefreshSignature;
                if (typeof refresh_scene_director_editor === "function") refresh_scene_director_editor();
            }
        });
    } catch (e) {}
    try {
        if (typeof refresh_scene_director_editor === "function") refresh_scene_director_editor();
    } catch (e) {}
    const fullscreenPortalObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                scheduleGradioFullscreenPortal(mutation.target);
                continue;
            }
            if (mutation.type === 'childList') {
                scheduleGradioFullscreenPortal(mutation.target);
            }
        }
    });
    fullscreenPortalObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
    });
    if (!hasLocalization()) {
        return;
    }

    onUiUpdate(function(m) {
        m.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                processNode(node);
                syncGradioUploadPromptLanguage(node);
                bindSceneNativeImageDropChrome(node);
                syncGradioFullscreenPortal(node);
            });
            if (mutation.target) {
                processNode(mutation.target);
                syncGradioUploadPromptLanguage(mutation.target);
                bindSceneNativeImageDropChrome(mutation.target);
                syncGradioFullscreenPortal(mutation.target);
            }
        });
        try {
            refresh_qwen_tts_localization();
            refresh_scene_localization();
        } catch (e) {}
    });

    localizeWholePage();

    function bind_global_dynamic_localization_observer() {
        const roots = [
            gradioApp(),
            document.getElementById("simpleai_floating_host"),
        ].filter(Boolean);

        roots.forEach((root) => {
            if (root.__simpleaiGlobalLocalizationObserverBound === true) return;
            if (root.dataset && root.dataset.globalLocalizationObserverBound === '1') return;
            root.__simpleaiGlobalLocalizationObserverBound = true;
            if (root.dataset) root.dataset.globalLocalizationObserverBound = '1';
            try {
                processNode(root);
                syncGradioUploadPromptLanguage(root);
                syncLocalizedCssContent();
            } catch (e) {}

            let scheduled = false;
            const pending = new Set();

            const scheduleFlush = () => {
                if (scheduled) return;
                scheduled = true;
                requestAnimationFrame(() => {
                    scheduled = false;
                    const nodes = Array.from(pending);
                    pending.clear();
                    nodes.forEach((n) => {
                        try {
                            processNode(n);
                            syncGradioUploadPromptLanguage(n);
                            bindSceneNativeImageDropChrome(n);
                            syncGradioFullscreenPortal(n);
                        } catch (e) {}
                    });
                    try {
                        refresh_qwen_tts_localization();
                        refresh_scene_localization();
                        syncLocalizedCssContent();
                    } catch (e) {}
                });
            };

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((n) => pending.add(n));
                        if (mutation.target) pending.add(mutation.target);
                    } else if (mutation.type === 'characterData') {
                        if (mutation.target) pending.add(mutation.target);
                        const p = mutation.target && mutation.target.parentElement ? mutation.target.parentElement : null;
                        if (p) pending.add(p);
                    } else if (mutation.type === 'attributes') {
                        if (mutation.target) pending.add(mutation.target);
                    }
                }
                scheduleFlush();
            });

            observer.observe(root, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['title', 'placeholder'],
            });
        });
    }

    bind_global_dynamic_localization_observer();
    document.addEventListener("click", (event) => {
        const target = event.target && event.target.closest
            ? event.target.closest('[role="tab"], .tab-nav button, button[aria-controls]')
            : null;
        if (shouldSkipFullLocalizationClick(target)) return;
        if (target) scheduleFullLocalizationRefresh("tab_click");
    }, true);
    if (typeof onAfterUiUpdate === 'function') {
        onAfterUiUpdate(() => {
            bind_global_dynamic_localization_observer();
        });
    }

    if (localization.rtl) { // if the language is from right to left,
        (new MutationObserver((mutations, observer) => { // wait for the style to load
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.tagName === 'STYLE') {
                        observer.disconnect();

                        for (const x of node.sheet.rules) { // find all rtl media rules
                            if (Array.from(x.media || []).includes('rtl')) {
                                x.media.appendMedium('all'); // enable them
                            }
                        }
                    }
                });
            });
        })).observe(gradioApp(), {childList: true});
    }
});
