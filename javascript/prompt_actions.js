(function initSimpleAIPromptActions() {
    if (window.__simpleaiPromptActionsLoaded) return;
    window.__simpleaiPromptActionsLoaded = true;

    let modal = null;
    let toast = null;
    let boundButton = null;
    let pending = false;
    let pendingActionId = "";
    let pendingAgentService = null;
    let previousPrompt = "";
    let lastFocused = null;
    let activePromptField = null;
    let pendingPromptField = null;
    let pendingDirectRequest = null;
    let lastAppliedPromptField = null;
    let lastAppliedPreviousPrompt = "";

    function catalogItems() {
        const catalog = window.SimpAIPromptActionCatalog;
        return Array.isArray(catalog?.items) ? catalog.items : [];
    }

    function paramsSource() {
        return window.simpleaiTopbarSystemParams
            || (typeof topbarLastSystemParams !== "undefined" ? topbarLastSystemParams : null)
            || {};
    }

    function currentLang() {
        const params = paramsSource();
        const lang = String(params.__lang || params.state?.__lang || window.locale_lang || "").toLowerCase();
        return lang.startsWith("en") ? "en" : "cn";
    }

    function text(en, cn) {
        return currentLang() === "en" ? (en || cn || "") : (cn || en || "");
    }

    function rootById(id) {
        return typeof getGradioRootById === "function" ? getGradioRootById(id) : document.getElementById(id);
    }

    function fieldById(id) {
        return rootById(id)?.querySelector?.("textarea, input") || null;
    }

    function readField(id) {
        return String(fieldById(id)?.value || "");
    }

    function setField(id, value) {
        if (typeof setGradioTextboxValue === "function" && setGradioTextboxValue(id, value)) return true;
        const field = fieldById(id);
        if (!field) return false;
        field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function promptButton() {
        const root = rootById("super_prompter_button");
        if (!root) return null;
        return root.matches?.("button") ? root : root.querySelector?.("button");
    }

    function directorModeEnabled() {
        const root = rootById("scene_director_enabled");
        return !!root?.querySelector?.('input[type="checkbox"]')?.checked;
    }

    function activeDirectorPromptField() {
        if (!directorModeEnabled()) return null;
        const editor = rootById("scene_director_editor_root") || document.querySelector("#scene_director_editor_root");
        return editor?.querySelector?.('.scene-director-shot.is-active-shot [data-scene-director-field="prompt"]')
            || editor?.querySelector?.('[data-scene-director-shot][aria-current="true"] [data-scene-director-field="prompt"]')
            || null;
    }

    function defaultPromptField() {
        return activeDirectorPromptField() || fieldById("positive_prompt");
    }

    function usablePromptField(field) {
        if (!field || !field.isConnected) return null;
        if (field.matches?.('[data-scene-director-field="prompt"]') && !directorModeEnabled()) return null;
        return field;
    }

    function promptField(field = null) {
        return usablePromptField(field) || defaultPromptField();
    }

    function setPromptFieldValue(field, value) {
        const target = usablePromptField(field);
        if (!target) return false;
        if (target === fieldById("positive_prompt")) return setField("positive_prompt", value);
        target.value = String(value ?? "");
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function currentPrompt() {
        return String(promptField(activePromptField)?.value || "");
    }

    function isSceneMode() {
        const params = paramsSource();
        if (params && typeof params === "object" && Object.prototype.hasOwnProperty.call(params, "__is_scene_frontend")) {
            return !!params.__is_scene_frontend;
        }
        if (document.documentElement?.classList?.contains("simpai-scene-frontend")) return true;
        const panel = rootById("scene_panel");
        if (!panel) return false;
        const style = window.getComputedStyle(panel);
        return style.display !== "none" && style.visibility !== "hidden" && panel.offsetParent !== null;
    }

    function isVlmEnabled() {
        if (typeof getGradioCheckboxById === "function") {
            const input = getGradioCheckboxById("vlm_checkbox");
            if (input) return !!input.checked;
        }
        const root = rootById("vlm_checkbox");
        const input = root?.querySelector?.('input[type="checkbox"]');
        return input ? !!input.checked : true;
    }

    function isGenerationActive() {
        const visible = (id) => {
            const root = rootById(id);
            if (!root) return false;
            if (typeof elementIsVisible === "function") return elementIsVisible(root);
            return root.offsetParent !== null;
        };
        return visible("skip_button") || visible("stop_button");
    }

    function videoSlotAvailable(slot) {
        const key = String(slot || "").trim();
        if (!key) return false;
        if (key === "scene_video" && readField("scene_video_first_frame_path").trim()) return true;
        const root = rootById(key);
        if (!root) return false;
        const video = root.querySelector?.("video");
        const sources = [
            video?.currentSrc,
            video?.src,
            video?.getAttribute?.("src"),
            ...Array.from(root.querySelectorAll?.("video source") || []).map((source) => source?.src || source?.getAttribute?.("src")),
        ].map((value) => String(value || "").trim()).filter(Boolean);
        if (sources.some((value) => !/^(about:blank|data:,)$/.test(value))) return true;

        // Gradio may expose the selected file before the compressed preview has
        // been written back to the component. Treat that state as available so
        // the prompt action does not silently fall back to an older media value.
        const fileInput = root.querySelector?.('input[type="file"]');
        if (fileInput?.files?.length) return true;
        return !!root.querySelector?.(".file-preview-holder, [data-testid^='file-preview']");
    }

    function videoSlotEnabled(slot) {
        const key = String(slot || "").trim();
        if (!key) return false;
        if (!isSceneMode()) return key === "scene_video";
        const params = paramsSource();
        const sceneFrontend = currentSceneFrontend(params);
        const hasResolvedHidden = Object.prototype.hasOwnProperty.call(params, "__scene_disvisible");
        const hidden = sceneList(hasResolvedHidden ? params.__scene_disvisible : sceneFrontend.disvisible);
        return !hidden.has(key);
    }

    function preferredVideoSlot() {
        const reference2Available = videoSlotEnabled("scene_reference_video2") && videoSlotAvailable("scene_reference_video2");
        const referenceAvailable = videoSlotEnabled("scene_reference_video") && videoSlotAvailable("scene_reference_video");
        const mainAvailable = videoSlotEnabled("scene_video") && videoSlotAvailable("scene_video");
        const compiler = currentPromptCompiler();
        if (reference2Available && /minimax[_\s-]*h3/i.test(compiler) && /ref2va|r2v|reference/i.test(compiler)) {
            return "scene_reference_video2";
        }
        if (referenceAvailable && /minimax[_\s-]*h3/i.test(compiler) && /ref2va|r2v|reference/i.test(compiler)) {
            return "scene_reference_video";
        }
        if (mainAvailable) return "scene_video";
        if (referenceAvailable) return "scene_reference_video";
        if (reference2Available) return "scene_reference_video2";
        return "";
    }

    function mainVideoAvailable() {
        return !!preferredVideoSlot();
    }

    function videoContextLabel(slot) {
        return slot === "scene_reference_video" || slot === "scene_reference_video2"
            ? text(
                "Use the reference video for visual expansion (up to 8 frames)",
                "扩写时读取参考视频（最多 8 帧）",
            )
            : text(
                "Use the main video for visual expansion (up to 8 frames)",
                "扩写时读取主要传入视频（最多 8 帧）",
            );
    }

    function currentSceneFrontend(params = paramsSource()) {
        const prepared = params?.__preset_prepared;
        const candidates = [
            params?.scene_frontend,
            prepared?.engine?.scene_frontend,
            prepared?.default_engine?.scene_frontend,
            params?.default_engine?.scene_frontend,
        ];
        return candidates.find((value) => value && typeof value === "object") || {};
    }

    function currentPromptCompiler() {
        const params = paramsSource();
        const sceneFrontend = currentSceneFrontend(params);
        const theme = String(params.__scene_theme || params.scene_theme || "").trim();
        const raw = sceneFrontend.prompt_compiler;
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            if (theme && Object.prototype.hasOwnProperty.call(raw, theme)) return String(raw[theme] || "");
            if (raw.id || raw.compiler || raw.name) return JSON.stringify(raw);
            const firstKey = Object.keys(raw).find((key) => raw[key] !== undefined && raw[key] !== null && raw[key] !== "");
            return firstKey ? String(raw[firstKey] || "") : "";
        }
        return String(raw || "");
    }

    function usesMiniMaxH3PromptCompiler() {
        return /minimax[_\s-]*h3/i.test(currentPromptCompiler());
    }

    function sceneList(value) {
        const items = Array.isArray(value) ? value : String(value || "").split(",");
        return new Set(items.map((item) => String(item || "").trim()).filter(Boolean));
    }

    function presetAcceptsMainVideo() {
        if (!isSceneMode()) return false;
        const params = paramsSource();
        const sceneFrontend = currentSceneFrontend(params);
        const hasResolvedHidden = Object.prototype.hasOwnProperty.call(params, "__scene_disvisible");
        const hidden = sceneList(hasResolvedHidden ? params.__scene_disvisible : sceneFrontend.disvisible);
        if (hidden.has("scene_video") && hidden.has("scene_reference_video") && hidden.has("scene_reference_video2")) return false;

        const theme = String(params.__scene_theme || params.scene_theme || "").trim();
        const rawCapability = sceneFrontend.director_capability;
        const capability = rawCapability && typeof rawCapability === "object" && !Object.prototype.hasOwnProperty.call(rawCapability, "video_policy")
            ? rawCapability[theme]
            : rawCapability;
        return String(capability?.video_policy || "").trim().toLowerCase() !== "forbidden";
    }

    function mainVideoContextAvailable() {
        return presetAcceptsMainVideo() && mainVideoAvailable();
    }

    function currentContextText() {
        const params = paramsSource();
        const preset = String(params.__preset || params.preset || "").trim();
        const theme = String(params.__scene_theme || params.scene_theme || "").trim();
        const mode = isSceneMode() ? text("Scene mode", "场景模式") : text("Classic mode", "经典模式");
        return [mode, preset, theme].filter(Boolean).join(" · ");
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        })[ch]);
    }

    function actionLabel(item) {
        return currentLang() === "en" ? (item.label_en || item.label_cn || item.id) : (item.label_cn || item.label_en || item.id);
    }

    function actionDescription(item) {
        return currentLang() === "en"
            ? (item.description_en || item.description_cn || "")
            : (item.description_cn || item.description_en || "");
    }

    function actionAvailability(item) {
        const mode = isSceneMode() ? "scene" : "classic";
        if (Array.isArray(item.modes) && !item.modes.includes(mode)) {
            return { enabled: false, reason: text("Unavailable in this mode", "当前模式不可用") };
        }
        if ((item.requires_vlm || (mode === "scene" && item.requires_vlm_scene)) && !isVlmEnabled()) {
            return { enabled: false, reason: text("Enable VLM first", "需要启用 VLM") };
        }
        if (!currentPrompt().trim() && !["smart_expand", "detailed_expand"].includes(item.id)) {
            return { enabled: false, reason: text("Enter a prompt for this action", "此功能需要先填写提示词") };
        }
        return { enabled: !pending, reason: "" };
    }

    function ensureModal() {
        if (modal && document.body.contains(modal)) return modal;
        modal = document.createElement("div");
        modal.className = "simpleai-prompt-action-modal";
        modal.setAttribute("aria-hidden", "true");
        modal.innerHTML = `
            <div class="simpleai-prompt-action-backdrop" data-prompt-action="close"></div>
            <section class="simpleai-prompt-action-panel" role="dialog" aria-modal="true" aria-labelledby="simpleai-prompt-action-title">
                <header class="simpleai-prompt-action-header">
                    <div>
                        <h2 id="simpleai-prompt-action-title" data-role="title"></h2>
                        <p data-role="context"></p>
                    </div>
                    <button type="button" class="simpleai-prompt-action-icon-button" data-prompt-action="close" aria-label="Close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </header>
                <label class="simpleai-prompt-action-video-option" data-role="video-option">
                    <span>
                        <i class="fa-solid fa-film"></i>
                        <span data-role="video-label"></span>
                    </span>
                    <input type="checkbox" data-role="use-video" checked>
                </label>
                <label class="simpleai-prompt-action-instruction" data-role="instruction-wrap" hidden>
                    <span class="simpleai-prompt-action-instruction-title">
                        <span data-role="instruction-label"></span>
                        <small data-role="instruction-hint"></small>
                    </span>
                    <textarea data-role="instruction" rows="1" maxlength="4000"></textarea>
                </label>
                <div class="simpleai-prompt-action-list" data-role="list"></div>
                <div class="simpleai-prompt-action-status" data-role="status" aria-live="polite"></div>
            </section>`;
        modal.addEventListener("click", (event) => {
            const control = event.target?.closest?.("[data-prompt-action]");
            const action = control?.getAttribute?.("data-prompt-action");
            if (action === "close") {
                closeModal();
                return;
            }
            if (action === "run") {
                const actionId = control.getAttribute("data-action-id") || "";
                runAction(actionId);
            }
        });
        document.body.appendChild(modal);
        return modal;
    }

    function setStatus(message, kind) {
        const node = ensureModal().querySelector('[data-role="status"]');
        if (!node) return;
        node.textContent = String(message || "");
        node.classList.remove("has-agent-service");
        node.classList.toggle("is-error", kind === "error");
        node.classList.toggle("is-busy", kind === "busy");
        node.removeAttribute("title");
    }

    function readControlValue(id) {
        const root = rootById(id);
        const control = root?.matches?.("input, select, textarea")
            ? root
            : root?.querySelector?.("input, select, textarea");
        return String(control?.value || "").trim();
    }

    function currentAgentService(item) {
        const serviceKind = String(
            item?.service_kind || (item?.id === "toggle_tag_separators" ? "local_script" : "agent")
        ).trim();
        if (serviceKind === "local_script") {
            return {
                agent_service_kind: "local_script",
                agent_model: "",
                agent_provider: text("Local script", "本地脚本"),
            };
        }

        const rawSelection = readControlValue("describe_vlm_model_dropdown")
            || readControlValue("describe_vlm_model");
        const modelUnavailable = /[⚠⬇↓]/.test(rawSelection);
        if (item?.id === "smart_expand" && !isSceneMode() && (!isVlmEnabled() || modelUnavailable)) {
            return {
                agent_service_kind: "agent",
                agent_model: "superprompt-v1",
                agent_provider: text("Local", "本地"),
            };
        }

        let display = rawSelection.replace(/[✓✔⚠⬇↓]/g, "").trim();
        let provider = "";
        const apiMatch = display.match(/^\[API\]\s*(.*)$/i);
        if (apiMatch) {
            const parts = apiMatch[1].split(/\s+·\s+/).map((part) => part.trim()).filter(Boolean);
            if (parts.length > 1) {
                provider = parts.shift() || "";
                display = parts.join(" · ");
            } else {
                display = parts[0] || "";
            }
        } else {
            display = display.replace(/^\[[^\]]+\]\s*/, "").trim();
            provider = text("Local VLM", "本地 VLM");
        }
        return {
            agent_service_kind: "agent",
            agent_model: display || text("Current Agent model", "当前 Agent 模型"),
            agent_provider: provider,
        };
    }

    function resolvedAgentService(result, fallback) {
        const source = result && typeof result === "object" ? result : {};
        const kind = String(source.agent_service_kind || fallback?.agent_service_kind || "agent").trim();
        if (kind === "local_script") {
            return {
                agent_service_kind: "local_script",
                agent_model: "",
                agent_provider: text("Local script", "本地脚本"),
            };
        }
        return {
            agent_service_kind: "agent",
            agent_model: String(source.agent_model || fallback?.agent_model || text("Current Agent model", "当前 Agent 模型")).trim(),
            agent_provider: String(source.agent_provider || fallback?.agent_provider || "").trim(),
        };
    }

    function agentServiceLabel(service) {
        if (service?.agent_service_kind === "local_script") return text("Local script", "本地脚本");
        return String(service?.agent_model || text("Current Agent model", "当前 Agent 模型")).trim();
    }

    function agentServiceTitle(service) {
        const label = agentServiceLabel(service);
        const provider = String(service?.agent_provider || "").trim();
        return provider && provider !== label ? `${provider} · ${label}` : label;
    }

    function setAgentStatus(service, phase, detail = "") {
        const node = ensureModal().querySelector('[data-role="status"]');
        if (!node) return;
        const label = agentServiceLabel(service);
        const isEnglish = currentLang() === "en";
        let prefix = "";
        let suffix = "";
        if (phase === "error") {
            prefix = isEnglish ? "“" : "「";
            suffix = isEnglish ? `” failed: ${detail}` : `」处理失败：${detail}`;
        } else {
            prefix = isEnglish ? "Using “" : "正在使用「";
            suffix = isEnglish ? "” to process the prompt..." : "」处理提示词…";
        }
        const model = document.createElement("span");
        model.className = "simpleai-prompt-action-status-model";
        model.textContent = label;
        model.setAttribute("title", agentServiceTitle(service));
        node.replaceChildren(document.createTextNode(prefix), model, document.createTextNode(suffix));
        node.classList.add("has-agent-service");
        node.classList.toggle("is-error", phase === "error");
        node.classList.toggle("is-busy", phase !== "error");
        node.setAttribute("title", `${prefix}${label}${suffix}${service?.agent_provider ? ` · ${service.agent_provider}` : ""}`);
    }

    function renderModal() {
        const node = ensureModal();
        node.querySelector('[data-role="title"]').textContent = text("Prompt Tools", "提示工具");
        node.querySelector('[data-role="context"]').textContent = currentContextText();
        const videoSlot = preferredVideoSlot();
        const hasVideo = mainVideoContextAvailable();
        const videoOption = node.querySelector('[data-role="video-option"]');
        videoOption.hidden = !hasVideo;
        node.querySelector('[data-role="use-video"]').disabled = !hasVideo;
        node.querySelector('[data-role="video-label"]').textContent = videoContextLabel(videoSlot);
        const instructionWrap = node.querySelector('[data-role="instruction-wrap"]');
        const instructionField = node.querySelector('[data-role="instruction"]');
        const instructionLabel = node.querySelector('[data-role="instruction-label"]');
        const instructionHint = node.querySelector('[data-role="instruction-hint"]');

        const mode = isSceneMode() ? "scene" : "classic";
        const h3Compiler = mode === "scene" && usesMiniMaxH3PromptCompiler();
        const items = catalogItems().filter((item) => !Array.isArray(item.modes) || item.modes.includes(mode));
        const supportsExtraInstruction = items.some((item) => item.id === "smart_expand" || item.id === "detailed_expand");
        instructionWrap.hidden = !supportsExtraInstruction;
        instructionLabel.textContent = text("Extra instructions", "额外指令");
        instructionField.placeholder = text(
            "Optional constraints for duration, shots, action, camera, or output format",
            "可选：补充时长、分镜、动作、镜头或输出格式要求",
        );
        instructionField.setAttribute("aria-label", text("Extra instructions", "额外指令"));
        instructionHint.textContent = text(
            "Applied as constraints to Smart Expand and Detailed Expand.",
            "仅作为智能扩写和详细扩写的约束。",
        );
        const list = node.querySelector('[data-role="list"]');
        if (!items.length) {
            list.innerHTML = `<div class="simpleai-prompt-action-empty">${escapeHtml(text("No prompt actions are registered.", "没有可用的提示词能力。"))}</div>`;
            return;
        }
        list.innerHTML = items.map((item) => {
            const availability = actionAvailability(item);
            const badges = [];
            if (item.id === "smart_expand" && h3Compiler) badges.push(text("H3 compiler", "H3 编译器"));
            else if (item.id === "smart_expand" && mode === "scene") badges.push(text("Scene agent", "场景智能体"));
            if (hasVideo && item.media_policy === "main_video_auto") badges.push(text("Video", "视频"));
            if (item.requires_vlm || (mode === "scene" && item.requires_vlm_scene)) badges.push("VLM");
            const busy = pending && pendingActionId === item.id;
            const stateText = busy ? text("Working...", "处理中…") : availability.reason;
            const label = item.id === "smart_expand" && h3Compiler
                ? text("Compile MiniMax H3 Prompt", "编译 MiniMax H3 提示词")
                : actionLabel(item);
            const description = item.id === "smart_expand" && h3Compiler
                ? text("Build and validate the required H3 audiovisual prompt structure.", "生成并检查 H3 所需的结构化视听提示词。")
                : actionDescription(item);
            return `
                <button type="button"
                        class="simpleai-prompt-action-item${item.featured ? " is-featured" : ""}${busy ? " is-busy" : ""}"
                        data-prompt-action="run"
                        data-action-id="${escapeHtml(item.id)}"
                        ${availability.enabled ? "" : "disabled"}>
                    <span class="simpleai-prompt-action-item-icon"><i class="fa-solid ${escapeHtml(item.icon || "fa-wand-magic-sparkles")}"></i></span>
                    <span class="simpleai-prompt-action-item-main">
                        <span class="simpleai-prompt-action-item-title">${escapeHtml(label)}</span>
                        <span class="simpleai-prompt-action-item-description">${escapeHtml(description)}</span>
                        ${badges.length ? `<span class="simpleai-prompt-action-item-badges">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</span>` : ""}
                        ${stateText ? `<span class="simpleai-prompt-action-item-state">${escapeHtml(stateText)}</span>` : ""}
                    </span>
                    <span class="simpleai-prompt-action-item-arrow"><i class="fa-solid ${busy ? "fa-spinner fa-spin" : "fa-chevron-right"}"></i></span>
                </button>`;
        }).join("");
    }

    function openModal(field = null) {
        activePromptField = promptField(field);
        if (isGenerationActive()) return;
        lastFocused = document.activeElement;
        renderModal();
        setStatus("", "");
        const node = ensureModal();
        node.classList.add("is-open");
        node.removeAttribute("aria-hidden");
        requestAnimationFrame(() => node.querySelector('[data-prompt-action="close"]')?.focus?.());
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        const instruction = modal.querySelector('[data-role="instruction"]');
        if (instruction) instruction.value = "";
        if (lastFocused?.focus) requestAnimationFrame(() => lastFocused.focus());
    }

    function hiddenTriggerButton() {
        const root = rootById("prompt_action_trigger");
        if (!root) return null;
        return root.matches?.("button") ? root : root.querySelector?.("button");
    }

    async function clickPromptActionTrigger(trigger) {
        let flushOk = true;
        try {
            if (window.SimpAISketch?.flushAll) {
                // Dirty canvases are serialized by flushAll itself. Avoid forcing
                // unchanged high-resolution canvases through another input cycle.
                flushOk = await window.SimpAISketch.flushAll({
                    cache: true,
                    cacheWaitMs: 1500,
                    refreshCache: true
                });
            }
        } catch (error) {
            flushOk = false;
            console.warn("[UI-TRACE] prompt_action_sketch_flush_failed", error);
        }
        if (flushOk === false) {
            const messageKey = "Canvas data could not be restored. Reload the source image and try again.";
            const langState = window.simpleaiTopbarSystemParams || {};
            const message = window.SimpAII18n?.localize
                ? window.SimpAII18n.localize(messageKey, messageKey, langState)
                : messageKey;
            try { window.alert(message); } catch (error) {}
            throw new Error(message);
        }
        trigger.click();
    }

    function runAction(actionId) {
        if (pending) return;
        const item = catalogItems().find((candidate) => candidate.id === actionId);
        if (!item) return;
        const availability = actionAvailability(item);
        if (!availability.enabled) {
            setStatus(availability.reason, "error");
            return;
        }
        const trigger = hiddenTriggerButton();
        if (!trigger) {
            setStatus(text("Prompt action bridge is unavailable.", "提示工具执行组件不可用。"), "error");
            return;
        }

        pendingPromptField = promptField(activePromptField);
        previousPrompt = String(pendingPromptField?.value || "");
        const useVideoInput = ensureModal().querySelector('[data-role="use-video"]');
        const options = {
            use_video: item.media_policy === "main_video_auto" && mainVideoContextAvailable()
                ? !!useVideoInput?.checked
                : false,
            preferred_video_slot: item.media_policy === "main_video_auto" && mainVideoContextAvailable()
                ? preferredVideoSlot()
                : "",
            language: currentLang(),
            direction: "auto",
        };
        if (item.id === "smart_expand" || item.id === "detailed_expand") {
            const instruction = String(ensureModal().querySelector('[data-role="instruction"]')?.value || "").trim();
            if (instruction) options.instruction = instruction;
        }
        if (!setField("prompt_action_input", previousPrompt)
                || !setField("prompt_action_id", actionId)
                || !setField("prompt_action_options", JSON.stringify(options))) {
            pendingPromptField = null;
            setStatus(text("Prompt action parameters could not be prepared.", "提示工具参数写入失败。"), "error");
            return;
        }

        pending = true;
        pendingActionId = actionId;
        pendingAgentService = currentAgentService(item);
        setAgentStatus(pendingAgentService, "busy");
        renderModal();
        void clickPromptActionTrigger(trigger).catch((error) => {
            const service = pendingAgentService;
            pending = false;
            pendingActionId = "";
            pendingAgentService = null;
            pendingPromptField = null;
            previousPrompt = "";
            renderModal();
            setAgentStatus(service, "error", String(error?.message || error || text("Prompt action bridge is unavailable.", "提示工具执行组件不可用。")));
        });
    }

    function ensureToast() {
        if (toast && document.body.contains(toast)) return toast;
        toast = document.createElement("div");
        toast.className = "simpleai-prompt-action-toast";
        toast.innerHTML = `
            <span data-role="message"></span>
            <button type="button" data-role="undo"></button>`;
        toast.querySelector('[data-role="undo"]').addEventListener("click", () => {
            if (setPromptFieldValue(lastAppliedPromptField, lastAppliedPreviousPrompt)) {
                toast.classList.remove("is-open");
                if (typeof syncPositivePromptMetaState === "function") {
                    try { syncPositivePromptMetaState(); } catch (error) {}
                }
            }
        });
        document.body.appendChild(toast);
        return toast;
    }

    function showSuccessToast(result, service) {
        const node = ensureToast();
        const frames = Number(result?.media?.sampled_frames || 0);
        const label = agentServiceLabel(service);
        const message = frames > 0
            ? text(`“${label}” finished · Prompt updated · read ${frames} video frames`, `「${label}」处理完成 · 提示词已更新 · 已读取 ${frames} 帧视频`)
            : text(`“${label}” finished · Prompt updated`, `「${label}」处理完成 · 提示词已更新`);
        const messageNode = node.querySelector('[data-role="message"]');
        messageNode.textContent = message;
        messageNode.setAttribute("title", `${message} · ${agentServiceTitle(service)}`);
        node.querySelector('[data-role="undo"]').textContent = text("Undo", "撤销");
        node.classList.add("is-open");
        window.clearTimeout(node.__simpleaiHideTimer);
        node.__simpleaiHideTimer = window.setTimeout(() => node.classList.remove("is-open"), 7000);
    }

    function parseResult(value) {
        if (value && typeof value === "object") return value;
        try {
            const parsed = JSON.parse(String(value || "{}"));
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    window.completeSimpleAIPromptAction = function completeSimpleAIPromptAction(value) {
        const result = parseResult(value);
        const target = pendingPromptField;
        const directRequest = pendingDirectRequest;
        const service = resolvedAgentService(result, pendingAgentService);
        pending = false;
        pendingActionId = "";
        pendingAgentService = null;
        pendingDirectRequest = null;
        if (directRequest) {
            pendingPromptField = null;
            previousPrompt = "";
            directRequest.resolve(result);
            return;
        }
        if (result.ok) {
            if (!setPromptFieldValue(target, String(result.text ?? previousPrompt))) {
                pendingPromptField = null;
                renderModal();
                setAgentStatus(service, "error", text("The target prompt is no longer available.", "目标提示词已不可用。"));
                return;
            }
            lastAppliedPromptField = target;
            lastAppliedPreviousPrompt = previousPrompt;
            pendingPromptField = null;
            closeModal();
            showSuccessToast(result, service);
            if (typeof syncPositivePromptMetaState === "function") {
                try { syncPositivePromptMetaState(); } catch (error) {}
            }
            return;
        }
        pendingPromptField = null;
        renderModal();
        setAgentStatus(service, "error", result.error || text("Prompt action failed.", "提示词处理失败。"));
    };

    function setButtonLabel() {
        const button = promptButton();
        if (!button) return;
        const label = text("Prompt Tools", "提示工具");
        const title = text("Open prompt tools", "打开提示工具");
        if (button.textContent !== label) button.textContent = label;
        if (button.getAttribute("title") !== title) button.setAttribute("title", title);
        if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
    }

    function onButtonClick(event) {
        const button = promptButton();
        if (!button || (event.target !== button && !button.contains(event.target))) return;
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled || button.getAttribute("aria-disabled") === "true") return;
        openModal(defaultPromptField());
    }

    function bindButton() {
        const button = promptButton();
        setButtonLabel();
        if (!button || boundButton === button) return;
        if (boundButton) boundButton.removeEventListener("click", onButtonClick, true);
        button.addEventListener("click", onButtonClick, true);
        boundButton = button;
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal?.classList.contains("is-open")) closeModal();
    });

    window.refreshSimpleAIPromptToolsButton = bindButton;
    window.openSimpleAIPromptToolsForField = function openSimpleAIPromptToolsForField(field) {
        openModal(field);
    };
    window.runSimpleAIPromptActionForField = function runSimpleAIPromptActionForField(actionId, field) {
        const target = promptField(field);
        if (!target) return false;
        openModal(target);
        runAction(actionId);
        return pending && pendingActionId === actionId;
    };
    window.runSimpleAIPromptActionDirect = function runSimpleAIPromptActionDirect(actionId, inputText, options = {}) {
        return new Promise((resolve, reject) => {
            if (pending) {
                reject(new Error(text("Another prompt action is already running.", "已有提示词任务正在处理。")));
                return;
            }
            const item = catalogItems().find((candidate) => candidate.id === actionId);
            if (!item) {
                reject(new Error(text("Unknown prompt action.", "未找到对应的提示词功能。")));
                return;
            }
            const availability = actionAvailability(item);
            if (!availability.enabled) {
                reject(new Error(availability.reason || text("Prompt action is unavailable.", "当前无法使用该提示词功能。")));
                return;
            }
            if (isGenerationActive()) {
                reject(new Error(text("Prompt actions are unavailable during generation.", "生成期间无法处理提示词。")));
                return;
            }
            const trigger = hiddenTriggerButton();
            if (!trigger) {
                reject(new Error(text("Prompt action bridge is unavailable.", "提示词执行组件不可用。")));
                return;
            }

            const original = String(inputText ?? "");
            if (!original.trim() && !["smart_expand", "detailed_expand"].includes(item.id)) {
                reject(new Error(text("Prompt is empty.", "提示词不能为空。")));
                return;
            }
            const directOptions = options && typeof options === "object" && !Array.isArray(options)
                ? { ...options }
                : {};
            if (!Object.prototype.hasOwnProperty.call(directOptions, "use_video")) {
                directOptions.use_video = item.media_policy === "main_video_auto" && mainVideoContextAvailable();
            }
            if (!Object.prototype.hasOwnProperty.call(directOptions, "preferred_video_slot")
                    && item.media_policy === "main_video_auto"
                    && mainVideoContextAvailable()) {
                directOptions.preferred_video_slot = preferredVideoSlot();
            }
            if (!Object.prototype.hasOwnProperty.call(directOptions, "language")) directOptions.language = currentLang();
            if (!Object.prototype.hasOwnProperty.call(directOptions, "direction")) directOptions.direction = "auto";
            if (!setField("prompt_action_input", original)
                    || !setField("prompt_action_id", actionId)
                    || !setField("prompt_action_options", JSON.stringify(directOptions))) {
                reject(new Error(text("Prompt action parameters could not be prepared.", "提示词参数写入失败。")));
                return;
            }

            pending = true;
            pendingActionId = actionId;
            pendingAgentService = currentAgentService(item);
            pendingPromptField = null;
            previousPrompt = original;
            pendingDirectRequest = { resolve, reject };
            clickPromptActionTrigger(trigger).catch((error) => {
                pending = false;
                pendingActionId = "";
                pendingAgentService = null;
                pendingDirectRequest = null;
                previousPrompt = "";
                reject(error);
            });
        });
    };
    window.simpleAIPromptToolsHasText = function simpleAIPromptToolsHasText() {
        // The prompt tool is also the place where users can enter extra
        // instructions before an empty prompt is sent to the LLM.
        return !!promptButton();
    };
    if (typeof onUiLoaded === "function") onUiLoaded(bindButton);
    if (typeof onAfterUiUpdate === "function") onAfterUiUpdate(bindButton);
})();
