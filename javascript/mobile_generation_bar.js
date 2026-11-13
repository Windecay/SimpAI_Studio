(function () {
    "use strict";

    if (window.SimpAIMobileGenerationBar) return;
    const media = window.matchMedia("(max-width: 767px)");
    let bar, previewButton, actionButton, skipButton, status;
    let observer, frame = 0, lockedUntil = 0, unlockTimer;
    let running = false, baseline = "", lastResult = "", awaitingResult = false, unread = false;

    function root(id) {
        return document.getElementById(id)
            || (typeof gradioApp === "function" ? gradioApp()?.getElementById?.(id) : null);
    }

    function visible(node) {
        if (!node?.isConnected) return false;
        for (let parent = node; parent?.nodeType === 1; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (parent.hidden || parent.getAttribute("aria-hidden") === "true"
                || style.display === "none" || style.visibility === "hidden") return false;
        }
        return node.getClientRects().length > 0;
    }

    function button(id) {
        const node = root(id);
        return node?.matches("button") ? node : node?.querySelector("button");
    }

    function enabled(node) {
        return visible(node) && !node.disabled && node.getAttribute("aria-disabled") !== "true"
            && !node.closest("[inert]") && !node.classList.contains("disabled");
    }

    function text(english, chinese) {
        if (window.SimpAII18n?.t) return window.SimpAII18n.t(english, chinese, window.simpleaiTopbarSystemParams);
        const lang = String(window.simpleaiTopbarSystemParams?.__lang || document.documentElement.lang);
        return /^(cn|zh)/i.test(lang) ? chinese : english;
    }

    function setText(node, value) {
        if (node.textContent !== value) node.textContent = value;
    }

    function setValue(node, key, value) {
        if (node[key] !== value) node[key] = value;
    }

    function setActive(active) {
        const classes = document.documentElement.classList;
        if (classes.contains("simpai-mobile-generation-bar-active") !== active) {
            classes.toggle("simpai-mobile-generation-bar-active", active);
        }
    }

    function preview() {
        return root("main_layout_row")?.querySelector(".preview_column");
    }

    function resultSignature() {
        return ["finished_gallery", "final_gallery", "video_player"].flatMap(id => {
            const node = root(id);
            if (!visible(node)) return [];
            return Array.from(node.querySelectorAll("img, video")).filter(visible)
                .map(item => item.currentSrc || item.src || "").filter(Boolean);
        }).join("|");
    }

    function obstructed() {
        const active = document.activeElement;
        const editing = active?.matches("textarea, [contenteditable]:not([contenteditable='false']), input:not([type])")
            || (active?.matches("input") && /^(text|search|email|url|tel|number|password)$/.test(active.type));
        if (editing || document.fullscreenElement) return true;
        // The chat launcher is a persistent portal, not an open dialog.
        return Array.from(document.querySelectorAll(
            "#lightboxModal, .modal, .simpleai-floating-portal-node:not(#describe_vlm_chat_button), [role='dialog'], [aria-modal='true'], dialog[open], .block.fullscreen, .is-zoomed-active"
        )).some(visible);
    }

    function create() {
        if (bar?.isConnected) return;
        bar = document.createElement("section");
        bar.id = "simpai_mobile_generation_bar";
        status = document.createElement("div");
        status.className = "simpai-mobile-generation-status";
        const actions = document.createElement("div");
        actions.className = "simpai-mobile-generation-actions";
        [previewButton, skipButton, actionButton] = Array.from({ length: 3 }, () => {
            const node = document.createElement("button");
            node.type = "button";
            return node;
        });
        previewButton.dataset.action = "preview";
        skipButton.dataset.action = "skip";
        actionButton.dataset.action = "primary";
        actions.append(previewButton, skipButton, actionButton);
        bar.append(status, actions);
        bar.setAttribute("aria-label", text("Generation controls", "\u751f\u6210\u64cd\u4f5c"));
        bar.hidden = true;
        document.body.append(bar);
        previewButton.addEventListener("click", () => {
            if (!visible(bar)) return;
            const target = preview();
            if (!visible(target)) return;
            unread = false;
            target.scrollIntoView({
                block: "start",
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            });
            schedule();
        });
        actionButton.addEventListener("click", () => activate(actionButton.dataset.target));
        skipButton.addEventListener("click", () => activate("skip_button"));
    }

    function activate(id) {
        // Resolve the live Gradio button again: a render may have replaced it.
        sync();
        const target = button(id);
        if (!media.matches || !visible(bar) || Date.now() < lockedUntil || !enabled(target)) return;
        const current = actionButton.dataset.target;
        if (id !== "skip_button" && id !== current) return;
        lockedUntil = Date.now() + 1200;
        clearTimeout(unlockTimer);
        unlockTimer = window.setTimeout(schedule, 1220);
        target.click();
        schedule();
    }

    function sync() {
        if (!media.matches || !visible(preview()) || !visible(root("prompt_action_row"))) {
            if (bar) setValue(bar, "hidden", true);
            setActive(false);
            if (!media.matches) {
                observer?.disconnect();
                observer = null;
            }
            return;
        }
        create();
        observe();
        const stop = button("stop_button"), skip = button("skip_button");
        const load = button("load_parameter_button"), generate = button("generate_button");
        const nextRunning = visible(stop) || visible(skip)
            || document.documentElement.classList.contains("simpai-generation-awaiting-result");
        const signature = resultSignature();
        if (nextRunning && !running) {
            baseline = lastResult || signature;
            awaitingResult = true;
            unread = false;
        }
        if (!nextRunning && awaitingResult && signature && signature !== baseline) {
            unread = true;
            awaitingResult = false;
        }
        if (!nextRunning && signature) lastResult = signature;
        running = nextRunning;
        const target = visible(stop) ? stop : visible(load) ? load : !running && visible(generate) ? generate : null;
        const id = target === stop ? "stop_button" : target === load ? "load_parameter_button" : "generate_button";
        setValue(actionButton.dataset, "target", target ? id : "");
        setText(actionButton, target?.textContent?.trim() || text("Generating", "\u751f\u6210\u4e2d"));
        setValue(actionButton, "disabled", !enabled(target) || Date.now() < lockedUntil);
        setValue(skipButton, "hidden", !visible(skip));
        setText(skipButton, skip?.textContent?.trim() || text("Skip", "\u8df3\u8fc7"));
        setValue(skipButton, "disabled", !enabled(skip) || Date.now() < lockedUntil);
        setText(previewButton, unread
            ? text("New result", "\u67e5\u770b\u65b0\u7ed3\u679c")
            : text("View preview", "\u67e5\u770b\u9884\u89c8"));
        const progress = root("progress-bar") || root("progress_html");
        setText(status, running
            ? (visible(progress) && progress.textContent.trim().slice(0, 100)) || text("Generating", "\u751f\u6210\u4e2d")
            : unread ? text("New result ready", "\u65b0\u7ed3\u679c\u5df2\u5c31\u7eea") : "");
        setValue(status, "hidden", !status.textContent);
        const theme = getComputedStyle(root("prompt_action_row"));
        ["--block-background-fill", "--body-text-color", "--border-color-primary",
            "--button-secondary-background-fill", "--button-primary-background-fill", "--button-primary-text-color"]
            .forEach(name => {
                const value = theme.getPropertyValue(name).trim();
                if (bar.style.getPropertyValue(name) !== value) bar.style.setProperty(name, value);
            });
        const show = !obstructed() && !!(target || running);
        setValue(bar, "hidden", !show);
        setActive(show);
    }

    function schedule() {
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; sync(); });
    }

    function observe() {
        if (observer) return;
        observer = new MutationObserver(records => {
            if (records.some(record => !bar.contains(record.target)
                && !(record.target === document.documentElement && record.attributeName === "class"))) schedule();
        });
        observer.observe(document.body, {
            subtree: true, childList: true, characterData: true, attributes: true,
            attributeFilter: ["class", "style", "hidden", "disabled", "aria-disabled", "aria-hidden", "src", "open"],
        });
    }

    media.addEventListener("change", schedule);
    window.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    document.addEventListener("fullscreenchange", schedule);
    if (typeof onUiLoaded === "function") onUiLoaded(schedule);
    if (typeof onAfterUiUpdate === "function") onAfterUiUpdate(schedule);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once: true });
    else schedule();
    window.SimpAIMobileGenerationBar = { sync: schedule };
})();
