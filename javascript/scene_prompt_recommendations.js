(function initScenePromptRecommendations() {
    if (window.__simpleaiScenePromptRecommendationsLoaded) return;
    window.__simpleaiScenePromptRecommendationsLoaded = true;

    const TARGET_LABELS = {
        positive_prompt: ["Prompt", "主提示词"],
        scene_additional_prompt: ["Additional", "附加提示词"],
        scene_additional_prompt_2: ["Additional 2", "附加提示词 2"],
    };

    let modal = null;
    let activeItems = [];
    let clickBoundButton = null;
    let randomPromptPending = false;
    let randomPromptPromise = null;
    let randomPromptRequestSerial = 0;
    let recentRandomHistory = [];
    let promptCatalog = null;
    const promptCatalogCache = { sfw: null, nsfw: null };
    const promptCatalogPending = { sfw: null, nsfw: null };
    let modalView = "recommendations";
    let autoRandomGenerateBypass = false;
    let autoRandomGeneratePending = false;
    const randomPanelState = {
        tab: "random",
        contentMode: "sfw",
        subjectMode: "auto",
        includeCharacter: true,
        everyGeneration: false,
        everyGenerationMode: "random",
        writeModes: { random: "replace", word_bank: "append", builder: "replace" },
        randomItem: null,
        error: "",
        catalogError: "",
        wordCategory: "all",
        wordSearch: "",
        wordSelected: [],
        builderValues: {},
        builderLocks: {},
    };
    const RANDOM_HISTORY_LIMIT = 10;
    const RANDOM_HISTORY_TAG_LIMIT = 80;

    function paramsSource() {
        return window.simpleaiTopbarSystemParams
            || (typeof topbarLastSystemParams !== "undefined" ? topbarLastSystemParams : null)
            || {};
    }

    function currentLang() {
        const params = paramsSource();
        const lang = String(params.state?.__lang || params.__lang || window.locale_lang || "").toLowerCase();
        return lang.startsWith("en") ? "en" : "cn";
    }

    function text(en, cn) {
        return currentLang() === "en" ? (en || cn || "") : (cn || en || "");
    }

    function isSceneMode() {
        const params = paramsSource();
        if (params && typeof params === "object" && Object.prototype.hasOwnProperty.call(params, "__is_scene_frontend")) {
            return !!params.__is_scene_frontend;
        }
        if (document.documentElement?.classList?.contains("simpai-scene-frontend")) return true;
        const panel = typeof getGradioRootById === "function" ? getGradioRootById("scene_panel") : document.getElementById("scene_panel");
        if (!panel) return false;
        const style = window.getComputedStyle(panel);
        return style.display !== "none" && style.visibility !== "hidden" && panel.offsetParent !== null;
    }

    function selectedSceneTheme() {
        const params = paramsSource();
        const direct = String(params.__scene_theme || params.scene_theme || "").trim();
        if (direct) return direct;
        const root = typeof getGradioRootById === "function" ? getGradioRootById("scene_theme") : document.getElementById("scene_theme");
        const checked = root?.querySelector?.('input[type="radio"]:checked');
        if (checked?.value) return checked.value;
        const input = root?.querySelector?.("input, textarea");
        return String(input?.value || "").trim();
    }

    function currentPreset() {
        const params = paramsSource();
        return String(params.__preset || params.preset || "").trim();
    }

    function promptButton() {
        const root = typeof getGradioRootById === "function" ? getGradioRootById("random_prompt_button") : document.getElementById("random_prompt_button");
        if (!root) return null;
        return root.matches?.("button") ? root : root.querySelector?.("button");
    }

    function generationButton() {
        const root = typeof getGradioRootById === "function" ? getGradioRootById("generate_button") : document.getElementById("generate_button");
        if (!root) return null;
        return root.matches?.("button") ? root : root.querySelector?.("button");
    }

    function setPromptButtonLabel() {
        const button = promptButton();
        if (!button) return;
        const label = isSceneMode() ? text("Prompt Picks", "推荐提示词") : text("Random Prompt", "随机提示词");
        const autoActive = randomPanelState.everyGeneration && !isSceneMode();
        const autoModeLabel = randomPanelState.everyGenerationMode === "builder"
            ? text("Builder every generation", "每次生成随机拼句")
            : text("Tags every generation", "每次生成随机 Tag");
        const displayLabel = autoActive ? text("Auto Random", "自动随机") : label;
        const title = autoActive ? displayLabel + " · " + autoModeLabel : label;
        if (button.textContent !== displayLabel) button.textContent = displayLabel;
        button.classList.toggle("simpleai-random-auto-active", autoActive);
        button.setAttribute("data-auto-random-mode", autoActive ? randomPanelState.everyGenerationMode : "");
        if (button.getAttribute("title") !== title) button.setAttribute("title", title);
        if (button.getAttribute("aria-label") !== title) button.setAttribute("aria-label", title);
    }

    function syncPromptButtonAutoState() {
        setPromptButtonLabel();
    }

    async function postJson(url, payload) {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload || {}),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) {
            throw new Error(data.details || data.error || response.statusText || "Request failed");
        }
        return data;
    }

    function ensureModal() {
        if (modal && document.body.contains(modal)) return modal;
        modal = document.createElement("div");
        modal.className = "simpleai-prompt-recommendation-modal";
        modal.innerHTML = `
            <div class="simpleai-prompt-recommendation-backdrop" data-action="close"></div>
            <section class="simpleai-prompt-recommendation-panel" role="dialog" aria-modal="true">
                <header class="simpleai-prompt-recommendation-header">
                    <div>
                        <h2 data-role="title"></h2>
                        <p data-role="subtitle"></p>
                    </div>
                    <button type="button" class="simpleai-prompt-recommendation-icon-button" data-action="close" aria-label="Close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </header>
                <div class="simpleai-prompt-recommendation-list" data-role="list"></div>
            </section>`;
        modal.addEventListener("click", (evt) => {
            const action = evt.target?.closest?.("[data-action]")?.getAttribute("data-action");
            if (action === "close") {
                closeModal();
                return;
            }
            if (modalView === "random" && handleRandomPanelAction(action, evt)) return;
            if (action === "apply") {
                const itemEl = evt.target.closest("[data-item-index]");
                const item = activeItems[Number(itemEl?.getAttribute("data-item-index"))];
                if (item) applyPromptItem(item);
            }
        });
        modal.addEventListener("change", (evt) => {
            if (modalView === "random") handleRandomPanelChange(evt);
        });
        modal.addEventListener("input", (evt) => {
            if (modalView === "random") handleRandomPanelInput(evt);
        });
        document.body.appendChild(modal);
        return modal;
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
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

    function targetLabel(target) {
        const pair = TARGET_LABELS[target] || TARGET_LABELS.positive_prompt;
        return text(pair[0], pair[1]);
    }

    function renderItems(items, preset, sceneTheme) {
        const node = ensureModal();
        modalView = "recommendations";
        node.dataset.view = modalView;
        node.dataset.lang = currentLang();
        activeItems = Array.isArray(items) ? items : [];
        node.querySelector('[data-role="title"]').textContent = text("Prompt Picks", "推荐提示词");
        const sub = [preset, sceneTheme].filter(Boolean).join(" / ");
        node.querySelector('[data-role="subtitle"]').textContent = sub || text("Local prompt files", "本地提示词文件");
        const list = node.querySelector('[data-role="list"]');
        list.className = "simpleai-prompt-recommendation-list";
        if (!activeItems.length) {
            list.innerHTML = `<div class="simpleai-prompt-recommendation-empty">${escapeHtml(text("No prompt file matched this preset.", "当前 preset 还没有推荐提示词文件。"))}</div>`;
            return;
        }
        list.innerHTML = activeItems.map((item, index) => `
            <article class="simpleai-prompt-recommendation-item" data-item-index="${index}">
                <div class="simpleai-prompt-recommendation-item-main">
                    <div class="simpleai-prompt-recommendation-item-title">${escapeHtml(item.title || item.title_cn || item.title_en || item.id || "")}</div>
                    <div class="simpleai-prompt-recommendation-item-prompt">${escapeHtml(item.prompt || "")}</div>
                    <div class="simpleai-prompt-recommendation-item-meta">
                        <span>${escapeHtml(targetLabel(item.target))}</span>
                        ${(item.seed_terms || []).slice(0, 4).map((term) => `<span>${escapeHtml(term)}</span>`).join("")}
                    </div>
                </div>
                <button type="button" data-action="apply" class="simpleai-prompt-recommendation-apply">
                    <i class="fa-solid fa-plus"></i>
                    <span>${escapeHtml(text("Use", "使用"))}</span>
                </button>
            </article>
        `).join("");
    }

    function setTextboxValue(rootId, value) {
        if (typeof setGradioTextboxValue === "function" && setGradioTextboxValue(rootId, value)) return true;
        const root = typeof getGradioRootById === "function" ? getGradioRootById(rootId) : document.getElementById(rootId);
        const field = root?.querySelector?.("textarea, input");
        if (!field) return false;
        field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function currentTextboxValue(rootId) {
        const root = typeof getGradioRootById === "function" ? getGradioRootById(rootId) : document.getElementById(rootId);
        const field = root?.querySelector?.("textarea, input");
        return String(field?.value || "");
    }

    function applyPromptItem(item) {
        const target = item.target || "positive_prompt";
        const incoming = String(item.prompt || "").trim();
        if (!incoming) return;
        const mode = item.mode === "append" ? "append" : "replace";
        let next = incoming;
        if (mode === "append") {
            const current = currentTextboxValue(target).trim();
            const hasChinese = /[\u3400-\u9fff]/.test(incoming);
            const separator = hasChinese && /[。！？.!?]$/.test(current) ? "\n" : (hasChinese ? "，" : ", ");
            next = current ? `${current}${separator}${incoming}` : incoming;
        }
        if (setTextboxValue(target, next)) {
            if (target === "positive_prompt" && typeof syncPositivePromptMetaState === "function") {
                try { syncPositivePromptMetaState(); } catch (e) {}
            }
            closeModal();
        }
    }

    function catalogCategories() {
        return Array.isArray(promptCatalog?.categories) ? promptCatalog.categories : [];
    }

    function catalogCategory(categoryId) {
        return catalogCategories().find((category) => category.id === categoryId) || null;
    }

    function categoryLabel(category) {
        if (!category) return "";
        return currentLang() === "en"
            ? (category.label_en || category.label_cn || category.id)
            : (category.label_cn || category.label_en || category.id);
    }

    function wordEntryKey(categoryId, itemId) {
        return categoryId + ":" + itemId;
    }

    function allWordEntries() {
        const entries = [];
        catalogCategories().forEach((category) => {
            (category.items || []).forEach((item) => {
                entries.push({
                    key: wordEntryKey(category.id, item.id),
                    category,
                    item,
                });
            });
        });
        return entries;
    }

    function selectedWordEntries() {
        const byKey = new Map(allWordEntries().map((entry) => [entry.key, entry]));
        return randomPanelState.wordSelected.map((key) => byKey.get(key)).filter(Boolean);
    }

    function filteredWordEntries() {
        const categoryId = randomPanelState.wordCategory;
        const query = randomPanelState.wordSearch.trim().toLowerCase();
        return allWordEntries().filter((entry) => {
            if (categoryId !== "all" && entry.category.id !== categoryId) return false;
            if (!query) return true;
            const haystack = String(entry.item.text || "") + " " + String(entry.item.id || "");
            return haystack.toLowerCase().includes(query);
        });
    }

    function composeWordBankPrompt() {
        const phrases = selectedWordEntries().map((entry) => String(entry.item.text || "").trim()).filter(Boolean);
        return phrases.length ? phrases.join("，") + "。" : "";
    }

    function builderSlots() {
        const configured = Array.isArray(promptCatalog?.builder_slots) ? promptCatalog.builder_slots : [];
        return configured.filter((slotId) => catalogCategory(slotId)?.builder !== false);
    }

    function catalogItem(categoryId, itemId) {
        return (catalogCategory(categoryId)?.items || []).find((item) => item.id === itemId) || null;
    }

    function builderSubjectMode() {
        const subject = catalogItem("subject", randomPanelState.builderValues.subject);
        return Array.isArray(subject?.modes) ? subject.modes[0] || "" : "";
    }

    function builderRules() {
        return promptCatalog?.builder_rules && typeof promptCatalog.builder_rules === "object"
            ? promptCatalog.builder_rules
            : {};
    }

    function builderProfiles() {
        return Array.isArray(builderRules().profiles) ? builderRules().profiles : [];
    }

    function builderContentPreferences() {
        const preferences = builderRules().content_preferences?.[randomPanelState.contentMode];
        return preferences && typeof preferences === "object" ? preferences : {};
    }

    function builderItemThemeIds(slotId, item) {
        if (!item) return [];
        if (slotId === "theme") return item.id ? [item.id] : [];
        const sourceThemes = Array.isArray(item.source_themes) ? item.source_themes : [];
        const themes = sourceThemes.length ? sourceThemes : (Array.isArray(item.themes) ? item.themes : []);
        return themes.filter((themeId) => themeId && themeId !== "all");
    }

    function builderItemSpecialties(slotId, itemId) {
        if (!slotId || !itemId) return [];
        const specialties = builderRules().specialties || {};
        return Object.entries(specialties).reduce((result, [specialtyId, slots]) => {
            const itemIds = Array.isArray(slots?.[slotId]) ? slots[slotId] : [];
            if (itemIds.includes(itemId)) result.push(specialtyId);
            return result;
        }, []);
    }

    function builderContextProfile(targetSlotId) {
        const profiles = builderProfiles();
        if (!profiles.length) return null;
        const configuredSlots = Array.isArray(builderRules().context_slots) ? builderRules().context_slots : [];
        const contextSlots = configuredSlots.length ? configuredSlots : ["theme", "action", "setting"];
        const populated = contextSlots.filter((slotId) =>
            slotId !== targetSlotId && randomPanelState.builderValues[slotId]);
        const locked = populated.filter((slotId) => randomPanelState.builderLocks[slotId]);
        const selectedContextSlots = locked.length ? locked : populated;
        const scores = new Map(profiles.map((profile) => [profile.id, 0]));

        selectedContextSlots.forEach((slotId) => {
            const item = catalogItem(slotId, randomPanelState.builderValues[slotId]);
            const itemThemes = builderItemThemeIds(slotId, item);
            const weight = (slotId === "theme" ? 8 : 3) + (randomPanelState.builderLocks[slotId] ? 12 : 0);
            profiles.forEach((profile) => {
                const profileThemes = Array.isArray(profile.theme_ids) ? profile.theme_ids : [];
                if (itemThemes.some((themeId) => profileThemes.includes(themeId))) {
                    scores.set(profile.id, (scores.get(profile.id) || 0) + weight);
                }
            });
        });

        builderSlots().forEach((slotId) => {
            if (
                slotId === targetSlotId
                || contextSlots.includes(slotId)
                || !randomPanelState.builderLocks[slotId]
                || !randomPanelState.builderValues[slotId]
            ) return;
            const item = catalogItem(slotId, randomPanelState.builderValues[slotId]);
            const itemThemes = builderItemThemeIds(slotId, item);
            const specialties = builderItemSpecialties(slotId, item?.id);
            profiles.forEach((profile) => {
                const profileThemes = Array.isArray(profile.theme_ids) ? profile.theme_ids : [];
                const allowed = Array.isArray(profile.allow_specialties) ? profile.allow_specialties : [];
                if (itemThemes.some((themeId) => profileThemes.includes(themeId))) {
                    scores.set(profile.id, (scores.get(profile.id) || 0) + 12);
                }
                if (specialties.some((specialtyId) => allowed.includes(specialtyId))) {
                    scores.set(profile.id, (scores.get(profile.id) || 0) + 10);
                }
            });
        });

        let selected = null;
        let selectedScore = 0;
        profiles.forEach((profile) => {
            const score = scores.get(profile.id) || 0;
            if (score > selectedScore) {
                selected = profile;
                selectedScore = score;
            }
        });
        return selected;
    }

    function builderModeCandidates(slotId) {
        const category = catalogCategory(slotId);
        const currentMode = builderSubjectMode();
        return (category?.items || []).filter((item) => {
            const itemModes = Array.isArray(item.modes) ? item.modes : [];
            if (slotId === "theme") {
                return !currentMode || !itemModes.length || itemModes.includes(currentMode);
            }
            if (slotId !== "subject" && currentMode && itemModes.length && !itemModes.includes(currentMode)) {
                return false;
            }
            return true;
        });
    }

    function builderCandidates(slotId) {
        const currentTheme = randomPanelState.builderValues.theme || "";
        const profile = slotId === "theme" ? null : builderContextProfile(slotId);
        return builderModeCandidates(slotId).filter((item) => {
            if (slotId === "theme") return true;
            const itemThemes = Array.isArray(item.themes) ? item.themes : [];
            const themeCompatible = !currentTheme
                || !itemThemes.length
                || itemThemes.includes("all")
                || itemThemes.includes(currentTheme);
            return themeCompatible && (!profile || !!builderCandidateTier(slotId, item, profile));
        });
    }

    function pickDifferentItem(items, currentId) {
        if (!items.length) return null;
        const alternatives = items.filter((item) => item.id !== currentId);
        const pool = alternatives.length ? alternatives : items;
        return pool[Math.floor(Math.random() * pool.length)] || null;
    }

    function builderCandidateTier(slotId, item, profile) {
        if (!profile) return "neutral";
        const profileThemes = Array.isArray(profile.theme_ids) ? profile.theme_ids : [];
        if (slotId === "theme") return profileThemes.includes(item.id) ? "exact" : "";

        const itemThemes = builderItemThemeIds(slotId, item);
        const demoted = Array.isArray(builderContentPreferences().demote?.[slotId])
            ? builderContentPreferences().demote[slotId]
            : [];
        if (demoted.includes(item.id)) return "neutral";
        const currentTheme = randomPanelState.builderValues.theme || "";
        if (currentTheme && itemThemes.includes(currentTheme)) return "exact";
        const preferred = Array.isArray(profile.preferred?.[slotId]) ? profile.preferred[slotId] : [];
        if (preferred.includes(item.id)) return "exact";
        const promoted = Array.isArray(builderContentPreferences().promote?.[slotId])
            ? builderContentPreferences().promote[slotId]
            : [];
        if (promoted.includes(item.id)) return "exact";
        if (itemThemes.some((themeId) => profileThemes.includes(themeId))) return "related";

        const specialties = builderItemSpecialties(slotId, item.id);
        const allowed = Array.isArray(profile.allow_specialties) ? profile.allow_specialties : [];
        if (specialties.some((specialtyId) => allowed.includes(specialtyId))) return "contextual";
        if (itemThemes.length || specialties.length) return "";
        return "neutral";
    }

    function builderItemPickWeight(slotId, item, profile) {
        let weight = 1;
        const preferred = Array.isArray(profile?.preferred?.[slotId]) ? profile.preferred[slotId] : [];
        if (preferred.includes(item.id)) weight *= 3;
        const configured = Number(builderContentPreferences().item_weights?.[slotId]?.[item.id]);
        if (Number.isFinite(configured) && configured >= 0) weight *= configured;
        return weight;
    }

    function pickContextualBuilderItem(slotId, items, currentId) {
        if (!items.length) return null;
        const profile = builderContextProfile(slotId);
        if (!profile) return pickDifferentItem(items, currentId);
        const tiers = ["exact", "related", "contextual", "neutral"];
        const visualSlots = ["camera", "lighting", "art", "atmosphere"];
        const weightGroup = visualSlots.includes(slotId) ? "visual" : "core";
        const configuredWeights = builderRules().selection_weights?.[weightGroup] || {};
        const weights = Object.assign(
            weightGroup === "visual"
                ? { exact: 55, related: 30, contextual: 10, neutral: 5 }
                : { exact: 88, related: 9, contextual: 2, neutral: 1 },
            configuredWeights,
        );
        const buildBuckets = (pool) => {
            const buckets = Object.fromEntries(tiers.map((tier) => [tier, []]));
            pool.forEach((item) => {
                const tier = builderCandidateTier(slotId, item, profile);
                if (tier && buckets[tier]) buckets[tier].push(item);
            });
            return buckets;
        };
        const alternatives = items.filter((item) => item.id !== currentId);
        let buckets = buildBuckets(alternatives);
        if (!tiers.some((tier) => buckets[tier].length)) buckets = buildBuckets(items);
        const available = tiers.filter((tier) => buckets[tier].length && Number(weights[tier]) > 0);
        if (!available.length) {
            return pickDifferentItem(builderCandidates(slotId), currentId) || pickDifferentItem(items, currentId);
        }
        const totalWeight = available.reduce((total, tier) => total + Number(weights[tier]), 0);
        let roll = Math.random() * totalWeight;
        let selectedTier = available[available.length - 1];
        for (const tier of available) {
            roll -= Number(weights[tier]);
            if (roll < 0) {
                selectedTier = tier;
                break;
            }
        }
        const pool = buckets[selectedTier];
        const itemWeights = pool.map((item) => builderItemPickWeight(slotId, item, profile));
        const itemWeightTotal = itemWeights.reduce((total, weight) => total + weight, 0);
        if (itemWeightTotal <= 0) return pool[Math.floor(Math.random() * pool.length)] || null;
        let itemRoll = Math.random() * itemWeightTotal;
        for (let index = 0; index < pool.length; index += 1) {
            itemRoll -= itemWeights[index];
            if (itemRoll < 0) return pool[index];
        }
        return pool[pool.length - 1] || null;
    }

    function normalizeBuilderSelections(changedSlot) {
        for (const slotId of builderSlots()) {
            if (slotId === changedSlot || randomPanelState.builderLocks[slotId]) continue;
            const candidates = builderCandidates(slotId);
            const current = randomPanelState.builderValues[slotId];
            if (!current || !candidates.some((item) => item.id === current)) {
                randomPanelState.builderValues[slotId] = pickContextualBuilderItem(
                    slotId,
                    builderModeCandidates(slotId),
                    current,
                )?.id || "";
            }
        }
    }

    function randomizeBuilderSlot(slotId, normalize = true) {
        const current = randomPanelState.builderValues[slotId] || "";
        randomPanelState.builderValues[slotId] = pickContextualBuilderItem(
            slotId,
            builderModeCandidates(slotId),
            current,
        )?.id || "";
        if (normalize && (slotId === "theme" || slotId === "subject")) normalizeBuilderSelections(slotId);
    }

    function randomizeBuilderAll() {
        if (!promptCatalog) return;
        const slots = builderSlots();
        slots.forEach((slotId) => {
            if (!randomPanelState.builderLocks[slotId]) randomPanelState.builderValues[slotId] = "";
        });
        slots.forEach((slotId) => {
            if (!randomPanelState.builderLocks[slotId]) randomizeBuilderSlot(slotId, false);
        });
    }

    function ensureBuilderValues() {
        if (!promptCatalog || Object.keys(randomPanelState.builderValues).length) return;
        randomizeBuilderAll();
    }

    function composeBuilderPrompt() {
        const phrases = [];
        builderSlots().forEach((slotId) => {
            const item = catalogItem(slotId, randomPanelState.builderValues[slotId]);
            const value = String(item?.text || "").trim();
            if (!value) return;
            phrases.push(slotId === "theme" ? "题材：" + value : value);
        });
        if (!phrases.length) return "";
        const suffix = String(promptCatalog?.quality_suffix || "").trim();
        return phrases.join("，") + "。" + suffix;
    }

    function currentPanelPrompt() {
        if (randomPanelState.tab === "word_bank") return composeWordBankPrompt();
        if (randomPanelState.tab === "builder") return composeBuilderPrompt();
        return String(randomPanelState.randomItem?.prompt || "").trim();
    }

    function currentPanelItem() {
        const prompt = currentPanelPrompt();
        if (!prompt) return null;
        const mode = randomPanelState.writeModes[randomPanelState.tab] || "replace";
        if (randomPanelState.tab === "random") {
            return Object.assign({}, randomPanelState.randomItem, { mode });
        }
        const contentPrefix = randomPanelState.contentMode === "nsfw" ? "local_nsfw_chinese_" : "local_sfw_chinese_";
        return {
            id: "random_panel_" + randomPanelState.tab,
            target: "positive_prompt",
            mode,
            title: text("Chinese Prompt", "中文提示词"),
            prompt,
            source: contentPrefix + (randomPanelState.tab === "word_bank" ? "word_bank" : "builder"),
        };
    }

    function renderRandomTab() {
        const nsfwMode = randomPanelState.contentMode === "nsfw";
        const subjectModes = nsfwMode
            ? [["person", text("Adults", "成年人")]]
            : [
                ["auto", text("Auto", "自动")],
                ["person", text("People", "人物")],
                ["animal", text("Animal", "动物")],
                ["scenery", text("Scenery", "风景")],
            ];
        const subjectButtons = subjectModes.map(([value, label]) => {
            const active = randomPanelState.subjectMode === value ? " is-active" : "";
            const pressed = randomPanelState.subjectMode === value ? "true" : "false";
            return '<button type="button" class="simpleai-random-segment' + active + '" data-action="subject-mode" data-value="' +
                value + '" aria-pressed="' + pressed + '">' + escapeHtml(label) + '</button>';
        }).join("");
        const characterDisabled = !nsfwMode && ["animal", "scenery"].includes(randomPanelState.subjectMode);
        const recipe = randomPanelState.randomItem?.recipe || {};
        const recipeValues = [recipe.subject, recipe.theme, recipe.visual_direction, recipe.art_direction].filter(Boolean);
        const status = randomPromptPending
            ? '<div class="simpleai-random-status"><i class="fa-solid fa-spinner fa-spin"></i><span>' +
                escapeHtml(text("Generating...", "生成中...")) + '</span></div>'
            : "";
        const error = randomPanelState.error
            ? '<div class="simpleai-random-error">' + escapeHtml(randomPanelState.error) + '</div>'
            : "";
        const meta = recipeValues.length
            ? '<div class="simpleai-random-recipe-meta">' + recipeValues.map((value) =>
                '<span>' + escapeHtml(value) + '</span>').join("") + '</div>'
            : "";
        return '<div class="simpleai-random-options">' +
            '<div class="simpleai-random-field">' +
                '<div class="simpleai-random-field-label">' + escapeHtml(text("Subject", "主体")) + '</div>' +
                '<div class="simpleai-random-segments" role="group" aria-label="' +
                    escapeHtml(text("Subject", "主体")) + '">' + subjectButtons + '</div>' +
            '</div>' +
            '<label class="simpleai-random-toggle' + (characterDisabled ? " is-disabled" : "") + '">' +
                '<input type="checkbox" data-role="include-character"' +
                    (randomPanelState.includeCharacter && !characterDisabled ? " checked" : "") +
                    (characterDisabled ? " disabled" : "") + '>' +
                '<span class="simpleai-random-toggle-track" aria-hidden="true"></span>' +
                '<span>' + escapeHtml(nsfwMode
                    ? text("Include known character", "加入知名角色")
                    : text("Known character for people", "人物时加入知名角色")) + '</span>' +
            '</label>' +
            status + error + meta +
        '</div>';
    }

    function renderCatalogState() {
        if (randomPanelState.catalogError) {
            return '<div class="simpleai-random-catalog-state">' +
                '<span>' + escapeHtml(randomPanelState.catalogError) + '</span>' +
                '<button type="button" class="simpleai-random-secondary-button" data-action="retry-catalog">' +
                    '<i class="fa-solid fa-rotate-right"></i><span>' + escapeHtml(text("Retry", "重试")) + '</span>' +
                '</button></div>';
        }
        return '<div class="simpleai-random-catalog-state"><i class="fa-solid fa-spinner fa-spin"></i><span>' +
            escapeHtml(text("Loading...", "加载中...")) + '</span></div>';
    }

    function wordResultsMarkup() {
        const entries = filteredWordEntries();
        const visible = entries.slice(0, 80);
        const selected = new Set(randomPanelState.wordSelected);
        if (!entries.length) {
            return '<div class="simpleai-random-catalog-state">' +
                escapeHtml(text("No matching entries", "没有匹配词条")) + '</div>';
        }
        return visible.map((entry) => {
            const active = selected.has(entry.key);
            return '<button type="button" class="simpleai-word-bank-item' + (active ? " is-selected" : "") +
                '" data-action="word-toggle" data-key="' + escapeHtml(entry.key) +
                '" aria-pressed="' + (active ? "true" : "false") + '">' +
                '<span>' + escapeHtml(entry.item.text || "") + '</span>' +
                '<small>' + escapeHtml(categoryLabel(entry.category)) + '</small>' +
            '</button>';
        }).join("");
    }

    function renderWordBankTab() {
        if (!promptCatalog) return renderCatalogState();
        const categoryOptions = ['<option value="all">' + escapeHtml(text("All categories", "全部分类")) + '</option>']
            .concat(catalogCategories().map((category) =>
                '<option value="' + escapeHtml(category.id) + '"' +
                    (randomPanelState.wordCategory === category.id ? " selected" : "") + '>' +
                    escapeHtml(categoryLabel(category)) + '</option>'))
            .join("");
        const resultCount = filteredWordEntries().length;
        return '<div class="simpleai-word-bank">' +
            '<div class="simpleai-word-bank-toolbar">' +
                '<label><span>' + escapeHtml(text("Category", "分类")) + '</span>' +
                    '<select data-role="word-category">' + categoryOptions + '</select></label>' +
                '<label class="simpleai-word-bank-search"><span>' + escapeHtml(text("Search", "搜索")) + '</span>' +
                    '<div><i class="fa-solid fa-magnifying-glass"></i>' +
                    '<input type="search" data-role="word-search" value="' + escapeHtml(randomPanelState.wordSearch) +
                    '" placeholder="' + escapeHtml(text("Search Chinese entries", "搜索中文词条")) + '"></div></label>' +
            '</div>' +
            '<div class="simpleai-word-bank-summary">' +
                escapeHtml(text("Selected", "已选")) + ' ' + randomPanelState.wordSelected.length +
                '<span>' + resultCount + ' ' + escapeHtml(text("results", "项结果")) + '</span>' +
            '</div>' +
            '<div class="simpleai-word-bank-results" data-role="word-results">' + wordResultsMarkup() + '</div>' +
        '</div>';
    }

    function renderBuilderTab() {
        if (!promptCatalog) return renderCatalogState();
        ensureBuilderValues();
        const rows = builderSlots().map((slotId, index) => {
            const category = catalogCategory(slotId);
            const currentId = randomPanelState.builderValues[slotId] || "";
            const currentItem = catalogItem(slotId, currentId);
            const candidates = builderCandidates(slotId).slice();
            const profile = slotId === "theme" ? null : builderContextProfile(slotId);
            const tierOrder = { exact: 0, related: 1, contextual: 2, neutral: 3 };
            if (profile) {
                candidates.sort((left, right) => {
                    const tierDifference = (tierOrder[builderCandidateTier(slotId, left, profile)] ?? 4)
                        - (tierOrder[builderCandidateTier(slotId, right, profile)] ?? 4);
                    return tierDifference || builderItemPickWeight(slotId, right, profile)
                        - builderItemPickWeight(slotId, left, profile);
                });
            }
            if (currentItem && !candidates.some((item) => item.id === currentItem.id)) candidates.unshift(currentItem);
            const options = ['<option value="">' + escapeHtml(text("Not selected", "未选择")) + '</option>']
                .concat(candidates.map((item) =>
                    '<option value="' + escapeHtml(item.id) + '"' + (item.id === currentId ? " selected" : "") + '>' +
                        escapeHtml(item.text || "") + '</option>'))
                .join("");
            const locked = !!randomPanelState.builderLocks[slotId];
            return '<div class="simpleai-builder-row" data-builder-slot="' + escapeHtml(slotId) + '">' +
                '<span class="simpleai-builder-step">' + (index + 1) + '</span>' +
                '<label><span>' + escapeHtml(categoryLabel(category)) + '</span>' +
                    '<select data-role="builder-select" data-slot="' + escapeHtml(slotId) + '">' + options + '</select></label>' +
                '<div class="simpleai-builder-tools">' +
                    '<button type="button" class="' + (locked ? "is-active" : "") + '" data-action="builder-lock" data-slot="' +
                        escapeHtml(slotId) + '" title="' + escapeHtml(locked ? text("Unlock", "解锁") : text("Lock", "锁定")) +
                        '" aria-label="' + escapeHtml(locked ? text("Unlock", "解锁") : text("Lock", "锁定")) + '">' +
                        '<i class="fa-solid fa-' + (locked ? "lock" : "lock-open") + '"></i></button>' +
                    '<button type="button" data-action="builder-random" data-slot="' + escapeHtml(slotId) +
                        '" title="' + escapeHtml(text("Randomize this slot", "随机当前项")) + '" aria-label="' +
                        escapeHtml(text("Randomize this slot", "随机当前项")) + '">' +
                        '<i class="fa-solid fa-shuffle"></i></button>' +
                    '<button type="button" data-action="builder-clear" data-slot="' + escapeHtml(slotId) +
                        '" title="' + escapeHtml(text("Clear", "清除")) + '" aria-label="' +
                        escapeHtml(text("Clear", "清除")) + '">' +
                        '<i class="fa-solid fa-eraser"></i></button>' +
                '</div>' +
            '</div>';
        }).join("");
        return '<div class="simpleai-builder-list">' + rows + '</div>';
    }

    function renderPanelPreview() {
        const prompt = currentPanelPrompt();
        return '<section class="simpleai-random-preview">' +
            '<div class="simpleai-random-preview-label"><i class="fa-regular fa-eye"></i><span>' +
                escapeHtml(text("Preview", "预览")) + '</span></div>' +
            '<div class="simpleai-random-preview-text" data-role="panel-preview">' +
                (prompt ? escapeHtml(prompt) : '<span class="is-empty">' + escapeHtml(text("No content", "暂无内容")) + '</span>') +
            '</div>' +
        '</section>';
    }

    function renderPanelFooter() {
        const activeMode = randomPanelState.writeModes[randomPanelState.tab] || "replace";
        const modeButton = (value, en, cn) =>
            '<button type="button" class="simpleai-random-segment' + (activeMode === value ? " is-active" : "") +
                '" data-action="write-mode" data-value="' + value + '" aria-pressed="' +
                (activeMode === value ? "true" : "false") + '">' + escapeHtml(text(en, cn)) + '</button>';
        let secondary = "";
        if (randomPanelState.tab === "random") {
            secondary = '<button type="button" class="simpleai-random-secondary-button" data-action="generate-random"' +
                (randomPromptPending ? " disabled" : "") + '><i class="fa-solid fa-shuffle"></i><span>' +
                escapeHtml(text("Regenerate", "重新生成")) + '</span></button>';
        } else if (randomPanelState.tab === "word_bank") {
            secondary = '<button type="button" class="simpleai-random-secondary-button" data-action="word-clear"' +
                (randomPanelState.wordSelected.length ? "" : " disabled") + '><i class="fa-regular fa-trash-can"></i><span>' +
                escapeHtml(text("Clear", "清空")) + '</span></button>';
        } else {
            secondary = '<button type="button" class="simpleai-random-secondary-button" data-action="builder-random-all">' +
                '<i class="fa-solid fa-shuffle"></i><span>' + escapeHtml(text("Randomize unlocked", "随机未锁项")) +
                '</span></button>';
        }
        return '<footer class="simpleai-random-footer">' +
            '<div class="simpleai-random-write-mode"><span>' + escapeHtml(text("Write mode", "写入方式")) + '</span>' +
                '<div class="simpleai-random-segments" role="group" aria-label="' +
                    escapeHtml(text("Write mode", "写入方式")) + '">' +
                    modeButton("replace", "Replace", "替换") + modeButton("append", "Append", "追加") +
                '</div></div>' +
            '<div class="simpleai-random-footer-actions">' + secondary +
                '<button type="button" class="simpleai-random-primary-button" data-action="apply-panel"' +
                    (currentPanelPrompt() ? "" : " disabled") + '><i class="fa-solid fa-arrow-right-to-bracket"></i><span>' +
                    escapeHtml(text("Write prompt", "写入提示词")) + '</span></button>' +
            '</div>' +
        '</footer>';
    }

    function renderPanelModeBar() {
        const mode = randomPanelState.contentMode;
        const autoMode = ["random", "builder"].includes(randomPanelState.tab)
            ? randomPanelState.tab
            : randomPanelState.everyGenerationMode;
        const autoLabel = autoMode === "builder"
            ? text("Random builder on every generation", "每次生成随机拼句")
            : text("Random tags on every generation", "每次生成随机 Tag");
        const autoDisabled = randomPanelState.tab === "word_bank" && !randomPanelState.everyGeneration;
        const modeButton = (value, label) =>
            '<button type="button" class="simpleai-random-segment' + (mode === value ? " is-active" : "") +
                '" data-action="content-mode" data-value="' + value + '" aria-pressed="' +
                (mode === value ? "true" : "false") + '">' + label + '</button>';
        return '<div class="simpleai-random-mode-bar">' +
            '<div class="simpleai-random-content-mode">' +
                '<span>' + escapeHtml(text("Content", "内容")) + '</span>' +
                '<div class="simpleai-random-segments" role="group" aria-label="' +
                    escapeHtml(text("Content", "内容")) + '">' +
                    modeButton("sfw", "SFW") + modeButton("nsfw", "NSFW") +
                '</div>' +
            '</div>' +
            '<label class="simpleai-random-toggle' + (autoDisabled ? " is-disabled" : "") + '">' +
                '<input type="checkbox" data-role="every-generation"' +
                    (randomPanelState.everyGeneration ? " checked" : "") +
                    (autoDisabled ? " disabled" : "") + '>' +
                '<span class="simpleai-random-toggle-track" aria-hidden="true"></span>' +
                '<span>' + escapeHtml(autoLabel) + '</span>' +
            '</label>' +
        '</div>';
    }

    function renderRandomPanel() {
        const node = ensureModal();
        modalView = "random";
        node.dataset.view = modalView;
        node.dataset.lang = currentLang();
        node.querySelector('[data-role="title"]').textContent = text("Prompt Studio", "提示词工坊");
        node.querySelector('[data-role="subtitle"]').textContent = randomPanelState.contentMode === "nsfw"
            ? text("NSFW · Suggestive", "NSFW · 性感擦边")
            : "SFW";
        const closeButton = node.querySelector('[data-action="close"].simpleai-prompt-recommendation-icon-button');
        if (closeButton) {
            closeButton.title = text("Close", "关闭");
            closeButton.setAttribute("aria-label", text("Close", "关闭"));
        }
        const tabs = [
            ["random", "fa-shuffle", text("Random", "随机")],
            ["word_bank", "fa-book-open", text("Word Bank", "词库")],
            ["builder", "fa-puzzle-piece", text("Builder", "拼句")],
        ];
        const tabMarkup = tabs.map(([value, icon, label]) =>
            '<button type="button" role="tab" class="' + (randomPanelState.tab === value ? "is-active" : "") +
                '" data-action="panel-tab" data-value="' + value + '" aria-selected="' +
                (randomPanelState.tab === value ? "true" : "false") + '"><i class="fa-solid ' + icon +
                '"></i><span>' + escapeHtml(label) + '</span></button>').join("");
        let tabContent = renderRandomTab();
        if (randomPanelState.tab === "word_bank") tabContent = renderWordBankTab();
        if (randomPanelState.tab === "builder") tabContent = renderBuilderTab();
        const content = node.querySelector('[data-role="list"]');
        content.className = "simpleai-random-prompt-content";
        content.innerHTML = '<div class="simpleai-random-panel">' +
            renderPanelModeBar() +
            '<nav class="simpleai-random-tabs" role="tablist">' + tabMarkup + '</nav>' +
            '<div class="simpleai-random-tab-body">' + tabContent + '</div>' +
            renderPanelPreview() + renderPanelFooter() +
        '</div>';
    }

    function loadPromptCatalog(force) {
        const mode = randomPanelState.contentMode === "nsfw" ? "nsfw" : "sfw";
        if (promptCatalogCache[mode] && !force) {
            promptCatalog = promptCatalogCache[mode];
            ensureBuilderValues();
            return Promise.resolve(promptCatalog);
        }
        if (promptCatalogPending[mode] && !force) return promptCatalogPending[mode];
        if (force) {
            promptCatalogCache[mode] = null;
            promptCatalog = null;
        }
        randomPanelState.catalogError = "";
        promptCatalogPending[mode] = postJson("/simpleai/random-prompt", {
            panel_mode: "catalog",
            content_mode: mode,
            __lang: currentLang(),
        }).then((payload) => {
            if (!payload.catalog || !Array.isArray(payload.catalog.categories)) {
                throw new Error(text("Prompt catalog is unavailable.", "提示词库不可用。"));
            }
            promptCatalogCache[mode] = payload.catalog;
            if (randomPanelState.contentMode === mode) {
                promptCatalog = payload.catalog;
                ensureBuilderValues();
            }
            return payload.catalog;
        }).catch((error) => {
            if (randomPanelState.contentMode === mode) {
                randomPanelState.catalogError = error.message || String(error);
            }
            return null;
        }).finally(() => {
            promptCatalogPending[mode] = null;
            if (
                randomPanelState.contentMode === mode
                && modalView === "random"
                && modal?.classList.contains("is-open")
            ) renderRandomPanel();
        });
        return promptCatalogPending[mode];
    }

    function handleRandomPanelAction(action, evt) {
        if (!action) return false;
        const actionNode = evt.target.closest("[data-action]");
        if (action === "panel-tab") {
            const tab = actionNode?.getAttribute("data-value");
            if (["random", "word_bank", "builder"].includes(tab)) {
                randomPanelState.tab = tab;
                if (["random", "builder"].includes(tab)) randomPanelState.everyGenerationMode = tab;
                renderRandomPanel();
                if (tab !== "random" && !promptCatalog) loadPromptCatalog(false);
                syncPromptButtonAutoState();
            }
            return true;
        }
        if (action === "content-mode") {
            const mode = actionNode?.getAttribute("data-value") === "nsfw" ? "nsfw" : "sfw";
            if (mode !== randomPanelState.contentMode) {
                randomPanelState.contentMode = mode;
                if (mode === "nsfw") randomPanelState.subjectMode = "person";
                promptCatalog = promptCatalogCache[mode];
                randomPanelState.wordSelected = [];
                randomPanelState.builderValues = {};
                randomPanelState.builderLocks = {};
                randomPanelState.randomItem = null;
                randomPanelState.catalogError = "";
                renderRandomPanel();
                loadPromptCatalog(false);
                if (randomPanelState.tab === "random") generateRandomPrompt(true);
            }
            return true;
        }
        if (action === "subject-mode") {
            const mode = actionNode?.getAttribute("data-value");
            if (["auto", "person", "animal", "scenery"].includes(mode)) randomPanelState.subjectMode = mode;
            renderRandomPanel();
            return true;
        }
        if (action === "write-mode") {
            const mode = actionNode?.getAttribute("data-value") === "append" ? "append" : "replace";
            randomPanelState.writeModes[randomPanelState.tab] = mode;
            renderRandomPanel();
            return true;
        }
        if (action === "generate-random") {
            generateRandomPrompt();
            return true;
        }
        if (action === "apply-panel") {
            const item = currentPanelItem();
            if (item) applyPromptItem(item);
            return true;
        }
        if (action === "retry-catalog") {
            renderRandomPanel();
            loadPromptCatalog(true);
            return true;
        }
        if (action === "word-toggle") {
            const key = actionNode?.getAttribute("data-key") || "";
            const index = randomPanelState.wordSelected.indexOf(key);
            if (index >= 0) randomPanelState.wordSelected.splice(index, 1);
            else if (key) randomPanelState.wordSelected.push(key);
            renderRandomPanel();
            return true;
        }
        if (action === "word-clear") {
            randomPanelState.wordSelected = [];
            renderRandomPanel();
            return true;
        }
        if (action === "builder-lock") {
            const slotId = actionNode?.getAttribute("data-slot") || "";
            randomPanelState.builderLocks[slotId] = !randomPanelState.builderLocks[slotId];
            renderRandomPanel();
            return true;
        }
        if (action === "builder-random") {
            randomizeBuilderSlot(actionNode?.getAttribute("data-slot") || "");
            renderRandomPanel();
            return true;
        }
        if (action === "builder-clear") {
            const slotId = actionNode?.getAttribute("data-slot") || "";
            randomPanelState.builderValues[slotId] = "";
            renderRandomPanel();
            return true;
        }
        if (action === "builder-random-all") {
            randomizeBuilderAll();
            renderRandomPanel();
            return true;
        }
        return false;
    }

    function handleRandomPanelChange(evt) {
        const role = evt.target?.getAttribute?.("data-role");
        if (role === "include-character") {
            randomPanelState.includeCharacter = !!evt.target.checked;
            return;
        }
        if (role === "every-generation") {
            randomPanelState.everyGeneration = !!evt.target.checked;
            if (randomPanelState.everyGeneration && ["random", "builder"].includes(randomPanelState.tab)) {
                randomPanelState.everyGenerationMode = randomPanelState.tab;
            }
            syncPromptButtonAutoState();
            renderRandomPanel();
            return;
        }
        if (role === "word-category") {
            randomPanelState.wordCategory = evt.target.value || "all";
            renderRandomPanel();
            return;
        }
        if (role === "builder-select") {
            const slotId = evt.target.getAttribute("data-slot") || "";
            randomPanelState.builderValues[slotId] = evt.target.value || "";
            if (slotId === "theme" || slotId === "subject") normalizeBuilderSelections(slotId);
            renderRandomPanel();
        }
    }

    function handleRandomPanelInput(evt) {
        if (evt.target?.getAttribute?.("data-role") !== "word-search") return;
        randomPanelState.wordSearch = evt.target.value || "";
        const results = modal?.querySelector('[data-role="word-results"]');
        if (results) results.innerHTML = wordResultsMarkup();
        const count = modal?.querySelector(".simpleai-word-bank-summary span");
        if (count) {
            count.textContent = filteredWordEntries().length + " " + text("results", "项结果");
        }
    }

    function openRandomPromptPanel() {
        const node = ensureModal();
        renderRandomPanel();
        node.classList.add("is-open");
        node.removeAttribute("aria-hidden");
        loadPromptCatalog(false);
        generateRandomPrompt();
    }

    function rememberRandomPrompt(item) {
        if (item?.source !== "developer_nsfw_random_prompt") return;
        const recipe = item.recipe && typeof item.recipe === "object" ? item.recipe : {};
        const axes = recipe.axes && typeof recipe.axes === "object" ? recipe.axes : {};
        const tags = String(item.prompt || "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, RANDOM_HISTORY_TAG_LIMIT);
        recentRandomHistory.push({
            profile: String(recipe.profile || ""),
            content_level: String(recipe.content_level || ""),
            axes: Object.assign({}, axes),
            tags,
        });
        if (recentRandomHistory.length > RANDOM_HISTORY_LIMIT) {
            recentRandomHistory = recentRandomHistory.slice(-RANDOM_HISTORY_LIMIT);
        }
    }

    async function openRecommendations() {
        const preset = currentPreset();
        const sceneTheme = selectedSceneTheme();
        renderItems([], preset, sceneTheme);
        const node = ensureModal();
        node.querySelector('[data-role="list"]').innerHTML = `<div class="simpleai-prompt-recommendation-empty">${escapeHtml(text("Loading...", "加载中..."))}</div>`;
        node.classList.add("is-open");
        node.removeAttribute("aria-hidden");
        try {
            const payload = await postJson("/simpleai/prompt-recommendations", {
                preset,
                scene_theme: sceneTheme,
                __lang: currentLang(),
                limit: 24,
            });
            renderItems(payload.items || [], payload.preset || preset, payload.scene_theme || sceneTheme);
        } catch (error) {
            node.querySelector('[data-role="list"]').innerHTML = `<div class="simpleai-prompt-recommendation-empty">${escapeHtml(error.message || String(error))}</div>`;
        }
    }

    function generateRandomPrompt(force) {
        if (randomPromptPending && !force) return randomPromptPromise;
        const requestSerial = ++randomPromptRequestSerial;
        const requestMode = randomPanelState.contentMode;
        randomPromptPending = true;
        randomPanelState.error = "";
        if (modalView === "random") renderRandomPanel();
        const requestPromise = (async () => {
            try {
                const payload = await postJson("/simpleai/random-prompt", {
                    panel_mode: "random",
                    content_mode: requestMode,
                    preset: currentPreset(),
                    scene_theme: selectedSceneTheme(),
                    __lang: currentLang(),
                    prompt_head: currentTextboxValue("positive_prompt").slice(0, 64),
                    recent_history: recentRandomHistory,
                    subject_mode: randomPanelState.subjectMode,
                    include_character: randomPanelState.includeCharacter && !["animal", "scenery"].includes(randomPanelState.subjectMode),
                });
                if (
                    payload.item
                    && requestSerial === randomPromptRequestSerial
                    && requestMode === randomPanelState.contentMode
                ) {
                    rememberRandomPrompt(payload.item);
                    randomPanelState.randomItem = payload.item;
                    return payload.item;
                }
                return null;
            } catch (error) {
                if (
                    requestSerial === randomPromptRequestSerial
                    && requestMode === randomPanelState.contentMode
                ) randomPanelState.error = error.message || String(error);
                console.warn("[UI-TRACE] random_prompt.local_failed", error);
                return null;
            } finally {
                if (requestSerial === randomPromptRequestSerial) {
                    randomPromptPending = false;
                    setPromptButtonLabel();
                    if (modalView === "random" && modal?.classList.contains("is-open")) renderRandomPanel();
                }
            }
        })();
        randomPromptPromise = requestPromise;
        return requestPromise;
    }

    async function prepareEveryGenerationPrompt() {
        if (randomPanelState.everyGenerationMode === "builder") {
            const catalog = await loadPromptCatalog(false);
            if (!catalog) return false;
            randomizeBuilderAll();
            const prompt = composeBuilderPrompt();
            if (!prompt) return false;
            const mode = randomPanelState.writeModes.builder || "replace";
            const contentPrefix = randomPanelState.contentMode === "nsfw" ? "local_nsfw_chinese_" : "local_sfw_chinese_";
            applyPromptItem({
                id: "random_panel_builder_auto",
                target: "positive_prompt",
                mode,
                title: text("Chinese Prompt", "中文提示词"),
                prompt,
                source: contentPrefix + "builder",
            });
            return true;
        }
        const item = await generateRandomPrompt();
        if (!item) return false;
        applyPromptItem(Object.assign({}, item, {
            mode: randomPanelState.writeModes.random || "replace",
        }));
        return true;
    }

    function onEveryGenerationClick(evt) {
        if (autoRandomGenerateBypass || !randomPanelState.everyGeneration || isSceneMode()) return;
        const button = generationButton();
        if (!button || evt.target !== button && !button.contains(evt.target)) return;
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        if (autoRandomGeneratePending) return;
        autoRandomGeneratePending = true;
        button.classList.add("simpleai-auto-random-preparing");
        Promise.resolve(prepareEveryGenerationPrompt())
            .catch((error) => {
                console.warn("[UI-TRACE] random_prompt.auto_prepare_failed", error);
            })
            .finally(() => {
                autoRandomGeneratePending = false;
                button.classList.remove("simpleai-auto-random-preparing");
                const currentButton = generationButton() || button;
                currentButton.classList.remove("simpleai-auto-random-preparing");
                autoRandomGenerateBypass = true;
                try {
                    currentButton.click();
                } finally {
                    autoRandomGenerateBypass = false;
                }
            });
    }

    function onRandomPromptClick(evt) {
        const button = promptButton();
        if (!button || evt.target !== button && !button.contains(evt.target)) return;
        evt.preventDefault();
        evt.stopPropagation();
        if (isSceneMode()) {
            openRecommendations();
        } else {
            openRandomPromptPanel();
        }
    }

    function bindButton() {
        const button = promptButton();
        setPromptButtonLabel();
        if (!button || clickBoundButton === button) return;
        if (clickBoundButton) clickBoundButton.removeEventListener("click", onRandomPromptClick, true);
        button.addEventListener("click", onRandomPromptClick, true);
        clickBoundButton = button;
    }

    document.addEventListener("click", onEveryGenerationClick, true);

    document.addEventListener("keydown", (evt) => {
        if (evt.key === "Escape") closeModal();
    });

    window.refreshSimpleAIPromptRecommendationButton = function refreshSimpleAIPromptRecommendationButton() {
        bindButton();
    };

    if (typeof onUiLoaded === "function") onUiLoaded(bindButton);
    if (typeof onAfterUiUpdate === "function") onAfterUiUpdate(bindButton);
})();
