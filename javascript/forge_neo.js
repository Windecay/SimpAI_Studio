(function () {
    "use strict";

    function forceForgeNeoDarkThemeUrl() {
        let url;
        try {
            url = new URL(window.location.href);
        } catch (error) {
            return;
        }
        if (url.searchParams.get("__theme") === "dark") return;
        url.searchParams.set("__theme", "dark");
        window.location.replace(url.toString());
    }

    forceForgeNeoDarkThemeUrl();

    function normalizeLang(value) {
        const raw = String(value || "").trim().toLowerCase();
        if (raw.startsWith("en")) return "en";
        if (raw.startsWith("cn") || raw.startsWith("zh")) return "cn";
        return "";
    }

    function readCookie(name) {
        const prefix = name + "=";
        return document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix))?.slice(prefix.length) || "";
    }

    function writeCookie(name, value, days) {
        const expires = new Date(Date.now() + Number(days || 365) * 86400000).toUTCString();
        document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/";
    }

    function storedLang() {
        const runtime = document.querySelector(".forge-neo-hidden-runtime");
        let search = null;
        try {
            search = new URLSearchParams(window.location.search);
        } catch (error) {
            search = null;
        }
        const candidates = [
            search ? search.get("__lang") : "",
            window.simpleaiTopbarSystemParams && window.simpleaiTopbarSystemParams.__lang,
            window.locale_lang,
            (() => {
                try {
                    return localStorage.getItem("ailang");
                } catch (error) {
                    return "";
                }
            })(),
            readCookie("ailang"),
            runtime ? runtime.getAttribute("data-lang") : ""
        ];
        for (const candidate of candidates) {
            const lang = normalizeLang(candidate);
            if (lang) return lang;
        }
        return "cn";
    }

    function langSource() {
        const lang = storedLang();
        return {
            __lang: lang,
            state: window.simpleaiTopbarSystemParams || {}
        };
    }

    function t(en, cn) {
        if (window.SimpAII18n && typeof window.SimpAII18n.t === "function") {
            return window.SimpAII18n.t(en, cn, langSource());
        }
        const raw = String(langSource().__lang || "").toLowerCase();
        return raw.startsWith("en") ? en : cn;
    }

    window.forgeNeoTranslate = t;

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function languageFromState(state) {
        if (state && typeof state === "object" && state.__lang) {
            return String(state.__lang).toLowerCase();
        }
        return String(langSource().__lang || "").toLowerCase();
    }

    function textForLang(state, en, cn) {
        return languageFromState(state).startsWith("en") ? en : cn;
    }

    function settingsNativeTablist() {
        const wrapper = document.querySelector("#forge_neo_settings > .tab-wrapper");
        if (!wrapper) return null;
        const tablists = Array.from(wrapper.querySelectorAll(".tab-container[role='tablist']"));
        return tablists.find(function (tabs) {
            return !tabs.closest(".overflow-menu") &&
                !tabs.classList.contains("visually-hidden") &&
                tabs.querySelector("#forge_neo_settings_paths_for_saving-button");
        }) || tablists.find(function (tabs) {
            return !tabs.closest(".overflow-menu") && !tabs.classList.contains("visually-hidden");
        }) || tablists[0] || null;
    }

    function normalizedSettingsText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function settingsNativeTabButtons() {
        const wrapper = document.querySelector("#forge_neo_settings > .tab-wrapper");
        if (!wrapper) return [];
        return Array.from(wrapper.querySelectorAll(".tab-container[role='tablist'] button[role='tab'], .overflow-dropdown button")).filter(function (button) {
            return normalizedSettingsText(button.textContent);
        });
    }

    function settingsTabButtonFor(panelId, label) {
        const direct = panelId ? document.getElementById(panelId + "-button") : null;
        const normalizedLabel = normalizedSettingsText(label);
        const buttons = settingsNativeTabButtons();
        return direct || buttons.find(function (button) {
            return panelId && button.getAttribute("aria-controls") === panelId;
        }) || buttons.find(function (button) {
            return normalizedSettingsText(button.textContent) === normalizedLabel;
        }) || null;
    }

    function isSettingsPanelVisible(panelId) {
        const panel = panelId ? document.getElementById(panelId) : null;
        return isVisibleElement(panel);
    }

    let settingsStaticSelectedPanelId = "forge_neo_settings_paths_for_saving";

    function settingsStaticNavPageDefinitions() {
        return [
            { type: "group", key: "saving_paths", en: "Saving & Paths", cn: "保存与路径" },
            { type: "tab", panelId: "forge_neo_settings_paths_for_saving", en: "Paths for Saving", cn: "保存路径" },
            { type: "tab", panelId: "forge_neo_settings_saving_images_grids", en: "Saving Images/Grids", cn: "图像/宫格保存" },
            { type: "tab", panelId: "forge_neo_settings_saving_subdirectory", en: "Saving to Subdirectory", cn: "保存到子目录" },
            { type: "group", key: "models_sampling", en: "Models & Sampling", cn: "模型与采样" },
            { type: "tab", panelId: "forge_neo_settings_control_net", en: "ControlNet", cn: "ControlNet" },
            { type: "tab", panelId: "forge_neo_settings_extra_networks", en: "Extra Networks", cn: "额外网络" },
            { type: "tab", panelId: "forge_neo_settings_optimizations", en: "Optimizations", cn: "优化" },
            { type: "tab", panelId: "forge_neo_settings_refiner", en: "Refiner", cn: "精修" },
            { type: "tab", panelId: "forge_neo_settings_sampler_parameters", en: "Sampler Parameters", cn: "采样器参数" },
            { type: "tab", panelId: "forge_neo_settings_stable_diffusion", en: "Stable Diffusion", cn: "Stable Diffusion" },
            { type: "tab", panelId: "forge_neo_settings_vae", en: "VAE", cn: "VAE" },
            { type: "tab", panelId: "forge_neo_settings_img2img", en: "img2img", cn: "图生图" },
            { type: "tab", panelId: "forge_neo_settings_txt2img", en: "txt2img", cn: "文生图" },
            { type: "group", key: "interface_info", en: "Interface & Info", cn: "界面与信息" },
            { type: "tab", panelId: "forge_neo_settings_comments", en: "Comments", cn: "评论" },
            { type: "tab", panelId: "forge_neo_settings_forge_canvas", en: "Forge Canvas", cn: "Forge Canvas" },
            { type: "tab", panelId: "forge_neo_settings_gallery", en: "Gallery", cn: "图库" },
            { type: "tab", panelId: "forge_neo_settings_infotext", en: "Infotext", cn: "生成信息" },
            { type: "tab", panelId: "forge_neo_settings_live_previews", en: "Live Previews", cn: "实时预览" },
            { type: "tab", panelId: "forge_neo_settings_prompt_editing", en: "Prompt Editing", cn: "提示词编辑" },
            { type: "tab", panelId: "forge_neo_settings_tagcomplete", en: "Tag Autocomplete", cn: "标签补全" },
            { type: "tab", panelId: "forge_neo_settings_forge_couple", en: "Forge Couple", cn: "Forge Couple", optional: true },
            { type: "tab", panelId: "forge_neo_settings_settings_in_ui", en: "Settings in UI", cn: "UI 内设置" },
            { type: "tab", panelId: "forge_neo_settings_ui_alternatives", en: "UI Alternatives", cn: "UI Alternatives" },
            { type: "tab", panelId: "forge_neo_settings_user_interface", en: "User Interface", cn: "界面" },
            { type: "group", key: "model_presets", en: "Model Presets", cn: "模型预设" },
            { type: "tab", panelId: "forge_neo_settings_anima", en: "ANIMA", cn: "ANIMA" },
            { type: "tab", panelId: "forge_neo_settings_flux", en: "FLUX", cn: "FLUX" },
            { type: "tab", panelId: "forge_neo_settings_klein", en: "KLEIN", cn: "KLEIN" },
            { type: "tab", panelId: "forge_neo_settings_krea2", en: "KREA2", cn: "KREA2" },
            { type: "tab", panelId: "forge_neo_settings_lumina", en: "LUMINA", cn: "LUMINA" },
            { type: "tab", panelId: "forge_neo_settings_qwen", en: "QWEN", cn: "QWEN" },
            { type: "tab", panelId: "forge_neo_settings_sd_arch", en: "SD", cn: "SD" },
            { type: "tab", panelId: "forge_neo_settings_xl", en: "XL", cn: "XL" },
            { type: "tab", panelId: "forge_neo_settings_zit", en: "ZIT", cn: "ZIT" },
            { type: "group", key: "runtime_api", en: "Runtime & API", cn: "运行与接口" },
            { type: "tab", panelId: "forge_neo_settings_api", en: "API", cn: "API" },
            { type: "tab", panelId: "forge_neo_settings_callbacks", en: "Callbacks", cn: "回调" },
            { type: "tab", panelId: "forge_neo_settings_profiler", en: "Profiler", cn: "性能分析" },
            { type: "tab", panelId: "forge_neo_settings_system", en: "System", cn: "系统" },
            { type: "group", key: "postprocessing_tools", en: "Postprocessing Tools", cn: "后期处理工具" },
            { type: "tab", panelId: "forge_neo_settings_face_restoration", en: "Face Restoration", cn: "面部修复" },
            { type: "tab", panelId: "forge_neo_settings_postprocessing", en: "Postprocessing", cn: "后处理" },
            { type: "tab", panelId: "forge_neo_settings_upscaling", en: "Upscaling", cn: "放大" },
            { type: "group", key: "low_bit_runtime", en: "Low-bit Runtime", cn: "低位推理" },
            { type: "tab", panelId: "forge_neo_settings_nunchaku", en: "Nunchaku", cn: "Nunchaku" },
            { type: "group", key: "other", en: "Other", cn: "其他" },
            { type: "tab", panelId: "forge_neo_settings_defaults", en: "Defaults", cn: "默认值" },
            { type: "tab", panelId: "forge_neo_settings_sysinfo", en: "Sysinfo", cn: "系统信息" },
            { type: "tab", panelId: "forge_neo_settings_actions", en: "Actions", cn: "操作" },
            { type: "tab", panelId: "forge_neo_settings_licenses", en: "Licenses", cn: "许可证" }
        ];
    }

    function settingsStaticNavEntries() {
        const settings = document.querySelector("#forge_neo_settings");
        const wrapper = settings ? settings.querySelector(":scope > .tab-wrapper") : null;
        if (!settings || !wrapper) return [];

        const selected = wrapper.querySelector(".tab-container[role='tablist'] button[aria-selected='true'], .tab-container[role='tablist'] button.selected, .overflow-dropdown button.selected");
        const visiblePanel = Array.from(settings.querySelectorAll(":scope > [role='tabpanel']")).find(function (panel) {
            return panel.id && isVisibleElement(panel);
        });
        const selectedPanelId = (selected ? selected.getAttribute("aria-controls") || "" : "") || (visiblePanel ? visiblePanel.id : "") || settingsStaticSelectedPanelId;
        const selectedLabel = selected ? normalizedSettingsText(selected.textContent) : "";

        const entries = settingsStaticNavPageDefinitions().filter(function (entry) {
            return !entry.optional || document.getElementById(entry.panelId);
        }).map(function (entry) {
            if (entry.type === "group") {
                return { ...entry, text: t(entry.en, entry.cn) };
            }
            const text = t(entry.en, entry.cn);
            return {
                ...entry,
                key: entry.panelId,
                text,
                selected: (entry.panelId && entry.panelId === selectedPanelId) || text === selectedLabel
            };
        });

        return entries;
    }

    function showSettingsStaticPanel(panelId) {
        const settings = document.querySelector("#forge_neo_settings");
        const panel = panelId ? document.getElementById(panelId) : null;
        if (!settings || !panel) return false;
        settings.querySelectorAll(":scope > [role='tabpanel']").forEach(function (item) {
            const active = item.id === panelId;
            item.hidden = !active;
            item.setAttribute("aria-hidden", active ? "false" : "true");
            item.style.display = active ? "" : "none";
        });
        document.querySelectorAll("#forge_neo_settings > .tab-wrapper button[role='tab']").forEach(function (button) {
            const active = button.getAttribute("aria-controls") === panelId;
            button.classList.toggle("selected", active);
            button.setAttribute("aria-selected", active ? "true" : "false");
        });
        return true;
    }

    function clickSettingsNativeTab(panelId, label) {
        const wrapper = document.querySelector("#forge_neo_settings > .tab-wrapper");
        if (!wrapper) return;
        if (panelId) settingsStaticSelectedPanelId = panelId;
        const target = settingsTabButtonFor(panelId, label);
        const fallbackPanel = function () {
            if (panelId && !isSettingsPanelVisible(panelId)) {
                showSettingsStaticPanel(panelId);
            }
        };
        if (target) {
            target.click();
        } else {
            fallbackPanel();
        }
        window.requestAnimationFrame(fallbackPanel);
        window.setTimeout(fallbackPanel, 80);
        window.setTimeout(fallbackPanel, 240);
    }

    function syncSettingsNavGroups() {
        const settings = document.querySelector("#forge_neo_settings");
        const wrapper = settings ? settings.querySelector(":scope > .tab-wrapper") : null;
        const tabs = settingsNativeTablist();
        if (!settings || !wrapper || !tabs) return;

        wrapper.setAttribute("aria-hidden", "true");

        let nav = settings.querySelector(":scope > .forge-neo-settings-static-nav");
        if (!nav) {
            nav = document.createElement("div");
            nav.className = "forge-neo-settings-static-nav";
            nav.setAttribute("role", "tablist");
            nav.setAttribute("aria-label", "Settings");
            settings.insertBefore(nav, wrapper);
        }

        nav.textContent = "";
        const entries = settingsStaticNavEntries();
        entries.forEach(function (entry) {
            if (entry.type === "group") {
                const label = document.createElement("div");
                label.className = "forge-neo-settings-static-group";
                label.setAttribute("aria-hidden", "true");
                label.textContent = entry.text;
                nav.appendChild(label);
                return;
            }

            const button = document.createElement("button");
            button.type = "button";
            button.className = "forge-neo-settings-static-tab";
            if (entry.selected) button.classList.add("is-selected");
            button.setAttribute("data-forge-neo-settings-target", entry.panelId);
            button.setAttribute("data-forge-neo-settings-label", entry.text);
            button.setAttribute("aria-selected", entry.selected ? "true" : "false");
            button.textContent = entry.text;
            button.addEventListener("click", function () {
                clickSettingsNativeTab(entry.panelId, entry.text);
                window.requestAnimationFrame(syncSettingsNavGroups);
                window.setTimeout(syncSettingsNavGroups, 80);
            });
            nav.appendChild(button);
        });
    }

    function notificationResultHtml(state, status, detail) {
        const title = textForLang(state, "Browser notifications", "浏览器通知");
        const statusLabel = textForLang(state, "Permission", "权限状态");
        const detailLabel = textForLang(state, "Detail", "说明");
        return [
            '<div class="forge-neo-notification-result">',
            "<strong>" + escapeHtml(title) + "</strong>",
            '<table id="forge_neo_settings_notification_table" class="forge-neo-notification-table"><tbody>',
            "<tr><th>" + escapeHtml(statusLabel) + "</th><td>" + escapeHtml(status) + "</td></tr>",
            "<tr><th>" + escapeHtml(detailLabel) + "</th><td>" + escapeHtml(detail) + "</td></tr>",
            "</tbody></table>",
            "</div>"
        ].join("");
    }

    function gradioUpdate(value) {
        return { __type__: "update", value: value, visible: true };
    }

    function appRoot() {
        const root = (window.gradio_config && window.gradio_config.root) || "";
        return root && root !== "/" ? root.replace(/\/$/, "") : "";
    }

    function isVisibleElement(element) {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }

    const forgeNeoRepeatGenerationTargets = {
        txt2img: {
            generate: "#forge_neo_generate",
            stop: "#forge_neo_stop"
        },
        img2img: {
            generate: "#forge_neo_img2img_generate",
            stop: "#forge_neo_img2img_stop"
        },
        extras: {
            generate: "#forge_neo_extras_generate",
            stop: "#forge_neo_extras_stop"
        }
    };
    let forgeNeoRepeatGenerationTimer = null;
    let forgeNeoRepeatLastTriggerAt = 0;

    function forgeNeoContextMenuRoot() {
        if (typeof window.gradioApp === "function") {
            const root = window.gradioApp();
            if (root) return root;
        }
        return document.body;
    }

    function removeForgeNeoContextMenu() {
        const oldMenu = document.querySelector("#context-menu.forge-neo-context-menu");
        if (oldMenu) oldMenu.remove();
    }

    function forgeNeoContextMenuPosition(event) {
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const pageX = Number.isFinite(event.pageX) ? event.pageX : Number(event.clientX || 0) + scrollLeft;
        const pageY = Number.isFinite(event.pageY) ? event.pageY : Number(event.clientY || 0) + scrollTop;
        return { left: pageX, top: pageY, scrollLeft: scrollLeft, scrollTop: scrollTop };
    }

    function clampForgeNeoContextMenu(contextMenu, position) {
        const margin = 4;
        const width = contextMenu.offsetWidth + margin;
        const height = contextMenu.offsetHeight + margin;
        const maxLeft = position.scrollLeft + window.innerWidth - width;
        const maxTop = position.scrollTop + window.innerHeight - height;
        const left = Math.max(position.scrollLeft + margin, Math.min(position.left, maxLeft));
        const top = Math.max(position.scrollTop + margin, Math.min(position.top, maxTop));
        contextMenu.style.left = left + "px";
        contextMenu.style.top = top + "px";
    }

    function showForgeNeoContextMenu(event, entries) {
        removeForgeNeoContextMenu();
        const contextMenu = document.createElement("nav");
        contextMenu.id = "context-menu";
        contextMenu.className = "forge-neo-context-menu";
        const position = forgeNeoContextMenuPosition(event);
        contextMenu.style.left = position.left + "px";
        contextMenu.style.top = position.top + "px";

        const contextMenuList = document.createElement("ul");
        contextMenuList.className = "context-menu-items";
        entries.forEach(function (entry) {
            const item = document.createElement("a");
            item.textContent = entry.name;
            item.href = "#";
            item.addEventListener("click", function (clickEvent) {
                clickEvent.preventDefault();
                removeForgeNeoContextMenu();
                entry.func();
            });
            contextMenuList.appendChild(item);
        });
        contextMenu.appendChild(contextMenuList);
        forgeNeoContextMenuRoot().appendChild(contextMenu);
        clampForgeNeoContextMenu(contextMenu, position);
    }

    function stopForgeNeoRepeatGeneration() {
        if (forgeNeoRepeatGenerationTimer) {
            window.clearInterval(forgeNeoRepeatGenerationTimer);
            forgeNeoRepeatGenerationTimer = null;
        }
        forgeNeoRepeatLastTriggerAt = 0;
    }

    function forgeNeoGenerateIsRunning(target) {
        const generate = document.querySelector(target.generate);
        const stop = document.querySelector(target.stop);
        const box = generate ? generate.closest(".forge-neo-generate-box") : null;
        return Boolean((box && box.classList.contains("is-running")) || isVisibleElement(stop));
    }

    function forgeNeoGenerateIsDisabled(generate) {
        return Boolean(generate && (generate.disabled || generate.getAttribute("aria-disabled") === "true"));
    }

    function startForgeNeoRepeatGeneration(target) {
        const forceTriggerAfterMs = 45000;
        const tryGenerate = function () {
            const generate = document.querySelector(target.generate);
            if (!generate) return;
            const now = Date.now();
            if (!forgeNeoRepeatLastTriggerAt) forgeNeoRepeatLastTriggerAt = now;
            if (forgeNeoGenerateIsRunning(target)) return;
            const blockedMs = now - forgeNeoRepeatLastTriggerAt;
            if (forgeNeoGenerateIsDisabled(generate) && blockedMs < forceTriggerAfterMs) return;
            if (forgeNeoGenerateIsDisabled(generate)) {
                generate.disabled = false;
                generate.setAttribute("aria-disabled", "false");
            }
            generate.click();
            forgeNeoRepeatLastTriggerAt = now;
        };

        stopForgeNeoRepeatGeneration();
        tryGenerate();
        forgeNeoRepeatGenerationTimer = window.setInterval(tryGenerate, 500);
    }

    function forgeNeoRepeatTargetForElement(element) {
        if (!element || !element.closest) return null;
        for (const target of Object.values(forgeNeoRepeatGenerationTargets)) {
            if (element.closest(target.generate) || element.closest(target.stop)) return target;
        }
        return null;
    }

    function openForgeNeoGenerateContextMenu(event) {
        const target = forgeNeoRepeatTargetForElement(event.target);
        if (!target) return false;
        showForgeNeoContextMenu(event, [
            {
                name: t("Generate forever", "无限生成"),
                func: function () {
                    startForgeNeoRepeatGeneration(target);
                }
            },
            {
                name: t("Cancel generate forever", "停止无限生成"),
                func: stopForgeNeoRepeatGeneration
            }
        ]);
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    function populateForgeNeoLicenses() {
        const root = document.querySelector("#forge_neo_settings_licenses_html .forge-neo-source-licenses");
        if (!root || !isVisibleElement(root)) return;
        root.querySelectorAll("pre[data-license-url]").forEach(function (target) {
            if (target.getAttribute("data-license-state")) return;
            const url = target.getAttribute("data-license-url");
            if (!url) return;
            target.setAttribute("data-license-state", "loading");
            target.textContent = t("Loading license...", "正在加载许可证...");
            fetch(url, { cache: "force-cache" }).then(function (response) {
                if (!response.ok) throw new Error("HTTP " + response.status);
                return response.text();
            }).then(function (licenseText) {
                target.textContent = licenseText;
                target.setAttribute("data-license-state", "loaded");
            }).catch(function () {
                target.textContent = t("Unable to load license text.", "许可证文本加载失败。");
                target.setAttribute("data-license-state", "error");
            });
        });
    }

    function restartReload() {
        document.body.style.backgroundColor = "var(--body-background-fill, var(--background-fill-primary, #111))";
        document.body.innerHTML = [
            '<h1 style="font-family:monospace;margin-top:20%;color:lightgray;text-align:center;">',
            escapeHtml(t("Reloading...", "正在重载...")),
            "</h1>"
        ].join("");

        const requestPing = async function () {
            try {
                const response = await fetch(appRoot() + "/config", { cache: "no-store" });
                if (response.ok) {
                    window.location.reload();
                    return;
                }
            } catch (error) {
                // Keep polling until the rebuilt Gradio app is available again.
            }
            window.setTimeout(requestPing, 500);
        };

        window.setTimeout(requestPing, 4000);
        return [];
    }

    function requestReloadUi(currentState) {
        restartReload();
        return currentState;
    }

    function setForgeNeoLanguage(currentState, newLanguage) {
        const lang = normalizeLang(newLanguage) || "cn";
        const state = currentState && typeof currentState === "object" ? currentState : {};
        state.__lang = lang;
        state.app = "forge_neo";
        const runtime = document.querySelector(".forge-neo-hidden-runtime");
        if (runtime) runtime.setAttribute("data-lang", lang);
        if (window.simpleaiTopbarSystemParams && typeof window.simpleaiTopbarSystemParams === "object") {
            window.simpleaiTopbarSystemParams.__lang = lang;
        }
        try {
            localStorage.setItem("ailang", lang);
        } catch (error) {
            console.error("set Forge Neo language localStorage failed:", error);
        }
        try {
            writeCookie("ailang", lang, 365);
            const url = new URL(window.location.href);
            url.searchParams.set("__lang", lang);
            url.searchParams.set("t", `${Date.now()}.${Math.floor(Math.random() * 10000)}`);
            window.history.replaceState(null, "", url.toString());
        } catch (error) {
            console.error("set Forge Neo language URL failed:", error);
        }
        try {
            if (typeof window.set_language === "function") {
                window.set_language(lang);
            } else if (typeof set_language === "function") {
                set_language(lang);
            }
        } catch (error) {
            console.error("set Forge Neo localization failed:", error);
        }
        restartReload();
        return state;
    }

    function parseJsonList(value) {
        if (Array.isArray(value)) return value;
        const text = String(value || "").trim();
        if (!text) return [];
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return text.split(/[;,]/).map(function (item) {
                return item.trim();
            }).filter(Boolean);
        }
    }

    function collectExtensionApplyInputs(currentState, disableAll, disabledList, updateList) {
        const disabled = [];
        const update = [];
        const table = document.querySelector("#forge_neo_extensions_installed_table");
        if (table) {
            table.querySelectorAll("input[type='checkbox']").forEach(function (checkbox) {
                const name = String(checkbox.getAttribute("name") || "");
                if (name.startsWith("enable_") && !checkbox.checked) {
                    disabled.push(name.substring(7));
                }
                if (name.startsWith("update_") && checkbox.checked) {
                    update.push(name.substring(7));
                }
            });
        }
        restartReload();
        return [
            currentState,
            disableAll,
            JSON.stringify(table ? disabled : parseJsonList(disabledList)),
            JSON.stringify(table && update.length ? update : parseJsonList(updateList))
        ];
    }

    function syncExtensionMasterToggle(table) {
        const targetTable = table || document.querySelector("#forge_neo_extensions_installed_table");
        if (!targetTable) return;
        const master = targetTable.querySelector(".forge-neo-extension-master-toggle");
        const toggles = Array.from(targetTable.querySelectorAll(".forge-neo-extension-toggle"));
        if (!master || !toggles.length) return;
        const checkedCount = toggles.filter(function (checkbox) {
            return checkbox.checked;
        }).length;
        master.checked = checkedCount === toggles.length;
        master.indeterminate = checkedCount > 0 && checkedCount < toggles.length;
    }

    function setExtensionTogglesFromMaster(master) {
        const table = master && master.closest("#forge_neo_extensions_installed_table");
        if (!table) return;
        table.querySelectorAll(".forge-neo-extension-toggle").forEach(function (checkbox) {
            checkbox.checked = master.checked;
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        });
        syncExtensionMasterToggle(table);
    }

    function setComponentValue(root, value) {
        const input = root && root.querySelector("textarea, input");
        if (!input) return false;
        input.value = value == null ? "" : String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function setComponentInputValue(rootSelector, value) {
        return setComponentValue(document.querySelector(rootSelector), value);
    }

    const forgeNeoPresetChoices = ["sd", "xl", "flux", "klein", "qwen", "qwen21", "krea2", "lumina", "zit", "anima"];
    let forgeNeoPresetRestoreDone = false;

    function normalizeForgeNeoPreset(value) {
        const preset = String(value || "").trim().toLowerCase();
        return forgeNeoPresetChoices.includes(preset) ? preset : "";
    }

    function rememberForgeNeoPreset(value) {
        return value;
    }

    async function readForgeNeoPresetForRestore() {
        try {
            const response = await fetch(appRoot() + "/forge-neo/api/options", { cache: "no-store" });
            if (!response.ok) return "";
            const payload = await response.json();
            return normalizeForgeNeoPreset(payload && payload.forge_preset);
        } catch (error) {
            console.error("read Forge Neo preset restore value failed:", error);
            return "";
        }
    }

    function scheduleForgeNeoPresetRestore() {
        if (forgeNeoPresetRestoreDone) return;
        window.setTimeout(restoreForgeNeoPresetFromBrowser, 300);
    }

    async function restoreForgeNeoPresetFromBrowser() {
        if (forgeNeoPresetRestoreDone) return;
        if (
            !document.querySelector("#forge_neo_preset input")
            || !document.querySelector("#forge_neo_preset_restore textarea, #forge_neo_preset_restore input")
            || !document.querySelector("#forge_neo_preset_restore_apply")
        ) {
            scheduleForgeNeoPresetRestore();
            return;
        }
        const preset = await readForgeNeoPresetForRestore();
        if (!preset) {
            forgeNeoPresetRestoreDone = true;
            return;
        }
        if (setComponentInputValue("#forge_neo_preset_restore", preset) && clickComponentButton("#forge_neo_preset_restore_apply")) {
            forgeNeoPresetRestoreDone = true;
        } else {
            scheduleForgeNeoPresetRestore();
        }
    }

    function clickComponentButton(rootSelector) {
        const root = document.querySelector(rootSelector);
        const button = root && (root.matches("button") ? root : root.querySelector("button"));
        if (!button) return false;
        button.click();
        return true;
    }

    function clickExtraBrowserAction(browser, suffix) {
        const root = browser && browser.querySelector("[id$='" + suffix + "']");
        const button = root && (root.matches("button") ? root : root.querySelector("button"));
        if (!button) return false;
        button.click();
        return true;
    }

    function markExtraCardSelected(card) {
        const grid = card && card.closest(".forge-neo-extra-grid");
        if (!grid) return;
        grid.querySelectorAll(".forge-neo-extra-card.is-selected").forEach(function (item) {
            item.classList.remove("is-selected");
            item.setAttribute("aria-pressed", "false");
        });
        card.classList.add("is-selected");
        card.setAttribute("aria-pressed", "true");
    }

    function normalizeExtraNetworkPath(value) {
        return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
    }

    function handleExtraNetworkDirButton(button) {
        const pane = button && button.closest(".forge-neo-extra-pane");
        if (!pane) return false;
        const dir = normalizeExtraNetworkPath(button.getAttribute("data-dir") || "");
        const dirKey = dir.toLocaleLowerCase();
        const browser = pane.closest(".forge-neo-extra-browser");
        const searchRoot = browser && browser.querySelector(".forge-neo-extra-search");
        pane.querySelectorAll(".forge-neo-extra-dir").forEach(function (item) {
            const active = item === button;
            item.classList.toggle("is-active", active);
            item.setAttribute("aria-pressed", active ? "true" : "false");
        });
        pane.querySelectorAll(".forge-neo-extra-card[data-path]").forEach(function (card) {
            const path = normalizeExtraNetworkPath(card.getAttribute("data-path") || "").toLocaleLowerCase();
            card.hidden = Boolean(dirKey) && !path.startsWith(dirKey);
        });
        setComponentValue(searchRoot, dir);
        return true;
    }

    function extraTokenName(name) {
        const text = String(name || "").replace(/\\/g, "/").replace(/^\/+/, "");
        const base = text.split("/").pop() || text;
        return base.replace(/\.(safetensors|ckpt|pt|bin|pth)$/i, "");
    }

    function promptTargetForExtraBrowser(browser) {
        const id = String((browser && browser.id) || "");
        return id.indexOf("img2img") >= 0 ? "#forge_neo_img2img_prompt" : "#forge_neo_prompt";
    }

    function negativeTargetForExtraBrowser(browser) {
        const id = String((browser && browser.id) || "");
        return id.indexOf("img2img") >= 0 ? "#forge_neo_img2img_negative_prompt" : "#forge_neo_negative_prompt";
    }

    function appendExtraNetworkPromptToken(browser, token) {
        const root = document.querySelector(promptTargetForExtraBrowser(browser));
        const input = root && root.querySelector("textarea, input");
        const clean = String(token || "").trim();
        if (!input || !clean) return false;
        const current = String(input.value || "").trim();
        return setComponentValue(root, [current, clean].filter(Boolean).join(", "));
    }

    function appendExtraNetworkNegativeToken(browser, token) {
        const root = document.querySelector(negativeTargetForExtraBrowser(browser));
        const input = root && root.querySelector("textarea, input");
        const clean = String(token || "").trim();
        if (!input || !clean) return false;
        const current = String(input.value || "").trim();
        return setComponentValue(root, [current, clean].filter(Boolean).join(", "));
    }

    function extraNetworkCardMetadataText(card, attr) {
        return String((card && card.getAttribute(attr)) || "").trim();
    }

    function cardLoraWeight(card) {
        const value = card && card.getAttribute("data-weight");
        const number = Number.parseFloat(value || "");
        return Number.isFinite(number) ? String(number) : "1";
    }

    function handleExtraNetworkCardPrompt(card, browser, kind, name) {
        if (kind === "lora") {
            const loraToken = "<lora:" + extraTokenName(name) + ":" + cardLoraWeight(card) + ">";
            const activationText = extraNetworkCardMetadataText(card, "data-activation-text");
            const promptChanged = appendExtraNetworkPromptToken(browser, [loraToken, activationText].filter(Boolean).join(", "));
            const negativeChanged = appendExtraNetworkNegativeToken(browser, extraNetworkCardMetadataText(card, "data-negative-text"));
            return Boolean(promptChanged || negativeChanged);
        }
        if (kind === "textual_inversion") {
            return appendExtraNetworkPromptToken(browser, extraTokenName(name));
        }
        return false;
    }

    function handleExtraNetworkCard(card) {
        const browser = card && card.closest(".forge-neo-extra-browser");
        const kind = card && card.getAttribute("data-kind");
        const name = card && card.getAttribute("data-name");
        if (!browser || !kind || !name) return false;
        const selector = browser.querySelector("[id$='_select']");
        setComponentValue(selector, name);
        markExtraCardSelected(card);

        if (kind === "checkpoints") {
            setComponentInputValue("#forge_neo_checkpoint", name);
            return true;
        }
        if (kind === "textual_inversion") {
            return handleExtraNetworkCardPrompt(card, browser, kind, name);
        }
        if (kind === "lora") {
            return handleExtraNetworkCardPrompt(card, browser, kind, name);
        }
        return false;
    }

    function extraNetworkPage(kind) {
        if (kind === "lora") return "lora";
        if (kind === "textual_inversion") return "textual_inversion";
        return "checkpoints";
    }

    function extraNetworkCardTitle(card) {
        return (card && (card.querySelector(".forge-neo-extra-name") || card).textContent || "").trim();
    }

    function showExtraNetworkToast(message) {
        let toast = document.querySelector(".forge-neo-extra-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.className = "forge-neo-extra-toast";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("is-visible");
        window.clearTimeout(showExtraNetworkToast.timer);
        showExtraNetworkToast.timer = window.setTimeout(function () {
            toast.classList.remove("is-visible");
        }, 1800);
    }

    function copyExtraNetworkText(text) {
        const value = String(text || "");
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(value);
        }
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
            return Promise.resolve();
        } finally {
            textarea.remove();
        }
    }

    function closeExtraNetworkModal() {
        const existing = document.getElementById("forge_neo_extra_network_modal");
        if (existing) existing.remove();
    }

    function normalizeExtraNetworkMetadataPayload(payload) {
        if (typeof payload === "string") {
            return { metadata: payload || "{}", internal_metadata: {}, user_metadata: {} };
        }
        const normalized = payload && typeof payload === "object" ? Object.assign({}, payload) : {};
        if (!normalized.metadata) normalized.metadata = "{}";
        if (!normalized.internal_metadata || typeof normalized.internal_metadata !== "object" || Array.isArray(normalized.internal_metadata)) {
            normalized.internal_metadata = {};
        }
        if (!normalized.user_metadata || typeof normalized.user_metadata !== "object" || Array.isArray(normalized.user_metadata)) {
            normalized.user_metadata = {};
        }
        if (!Array.isArray(normalized.vae_te)) normalized.vae_te = [];
        if (!Array.isArray(normalized.vae_te_choices)) normalized.vae_te_choices = [];
        return normalized;
    }

    function extraNetworkOptionHtml(value, selectedValues) {
        const text = String(value || "");
        const selected = selectedValues.indexOf(text) >= 0 ? " selected" : "";
        return '<option value="' + escapeHtml(text) + '"' + selected + ">" + escapeHtml(text) + "</option>";
    }

    function extraNetworkPreviewHtml(payload) {
        const previewUrl = String(payload.preview_url || "");
        if (previewUrl) {
            return '<div class="forge-neo-extra-edit-preview"><img src="' + escapeHtml(previewUrl) + '" alt=""></div>';
        }
        return '<div class="forge-neo-extra-edit-preview forge-neo-extra-edit-preview-empty">' + escapeHtml(t("No preview", "无预览")) + "</div>";
    }

    function extraNetworkMetadataTableHtml(payload) {
        const rows = [
            [t("Filename:", "文件名："), payload.display_filename || payload.filename || ""],
            [t("File size:", "文件大小："), payload.file_size_text || ""],
            [t("Modified:", "修改时间："), payload.modified_text || ""]
        ];
        return '<table class="forge-neo-extra-file-metadata">' + rows.map(function (row) {
            return "<tr><th>" + escapeHtml(row[0]) + "</th><td>" + escapeHtml(row[1]) + "</td></tr>";
        }).join("") + "</table>";
    }

    function extraNetworkBaseModelHtml(payload) {
        const value = String(payload.base_model || "Unknown");
        return ["SD1", "SDXL", "Flux", "Unknown"].map(function (choice) {
            const checked = choice === value ? " checked" : "";
            const label = choice === "Unknown" ? t("Unknown", "未知") : choice;
            return '<label class="forge-neo-extra-base-option"><input type="radio" name="forge_neo_extra_base_model" value="' + escapeHtml(choice) + '"' + checked + "><span>" + escapeHtml(label) + "</span></label>";
        }).join("");
    }

    function extraNetworkLoraPresetHtml(payload) {
        const userMetadata = payload.user_metadata || {};
        const value = extraNetworkMetadataValue(userMetadata, "sd version") || String(payload.base_model || "Unknown");
        const choices = ["SD1", "SD2", "SDXL", "Flux", "Unknown"];
        return '<select class="forge-neo-extra-lora-preset">' + choices.map(function (choice) {
            const selected = choice === value ? " selected" : "";
            return '<option value="' + escapeHtml(choice) + '"' + selected + ">" + escapeHtml(choice) + "</option>";
        }).join("") + "</select>";
    }

    function extraNetworkVaeSelectHtml(payload) {
        const selected = payload.vae_te.map(function (item) { return String(item || ""); }).filter(Boolean);
        const choices = ["Built in"].concat(payload.vae_te_choices || []);
        selected.forEach(function (item) {
            if (choices.indexOf(item) < 0) choices.push(item);
        });
        const unique = choices.filter(function (item, index) { return item && choices.indexOf(item) === index; });
        return '<select class="forge-neo-extra-vae-select" multiple size="1">' + unique.map(function (item) {
            return extraNetworkOptionHtml(item, selected);
        }).join("") + "</select>";
    }

    function extraNetworkMetadataValue(userMetadata, key) {
        const value = userMetadata && Object.prototype.hasOwnProperty.call(userMetadata, key) ? userMetadata[key] : "";
        return value == null ? "" : String(value);
    }

    function extraNetworkPreferredWeightValue(userMetadata) {
        const number = Number.parseFloat(extraNetworkMetadataValue(userMetadata, "preferred weight"));
        if (!Number.isFinite(number)) return "0";
        return String(Math.max(0, Math.min(2, number)));
    }

    function extraNetworkPreferredWeightHtml(userMetadata) {
        const value = extraNetworkPreferredWeightValue(userMetadata);
        return [
            '<div class="forge-neo-extra-weight-control">',
            '<input class="forge-neo-extra-preferred-weight-range" type="range" min="0" max="2" step="0.01" value="' + escapeHtml(value) + '">',
            '<input class="forge-neo-extra-preferred-weight" type="number" min="0" max="2" step="0.01" value="' + escapeHtml(value) + '">',
            "</div>"
        ].join("");
    }

    function extraNetworkPlainMetadataObject(payload) {
        if (payload && payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)) return payload.metadata;
        try {
            const parsed = JSON.parse(String(payload && payload.metadata ? payload.metadata : "{}"));
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (_error) {
            return {};
        }
    }

    function extraNetworkInternalMetadataRows(metadata, depth) {
        const rows = [];
        Object.keys(metadata || {}).sort().forEach(function (key) {
            const value = metadata[key];
            if (value && typeof value === "object" && !Array.isArray(value)) {
                rows.push('<tr class="is-group"><th colspan="2" style="padding-left: ' + String(10 + depth * 18) + 'px">' + escapeHtml(key) + "</th></tr>");
                rows.push(extraNetworkInternalMetadataRows(value, depth + 1));
            } else {
                const text = Array.isArray(value) ? JSON.stringify(value) : String(value == null ? "" : value);
                rows.push(
                    '<tr><th style="padding-left: ' + String(10 + depth * 18) + 'px">' + escapeHtml(key) + "</th><td>" + escapeHtml(text) + "</td></tr>"
                );
            }
        });
        return rows.join("");
    }

    function extraNetworkInternalMetadataHtml(payload) {
        const internal = payload && payload.internal_metadata && typeof payload.internal_metadata === "object" && !Array.isArray(payload.internal_metadata)
            ? payload.internal_metadata
            : {};
        const metadata = Object.keys(internal).length ? internal : extraNetworkPlainMetadataObject(payload);
        if (!Object.keys(metadata).length) {
            return '<div class="forge-neo-extra-metadata-empty">' + escapeHtml(t("No internal metadata.", "没有内部 metadata。")) + "</div>";
        }
        return [
            '<table class="forge-neo-extra-internal-metadata">',
            "<thead><tr><th>key</th><th>value</th></tr></thead>",
            "<tbody>",
            extraNetworkInternalMetadataRows(metadata, 0),
            "</tbody></table>"
        ].join("");
    }

    function extraNetworkEditFormHtml(payload) {
        const userMetadata = payload.user_metadata || {};
        const isLora = String(payload.page || "") === "lora";
        const fields = [
            '<div class="forge-neo-extra-edit-grid">',
            '<div class="forge-neo-extra-edit-left">',
            '<div class="forge-neo-extra-edit-name">' + escapeHtml(payload.name || "") + "</div>",
            '<label class="forge-neo-extra-edit-label">' + escapeHtml(t("Description", "描述")) + "</label>",
            '<textarea class="forge-neo-extra-description" rows="4">' + escapeHtml(userMetadata.description || "") + "</textarea>",
            extraNetworkMetadataTableHtml(payload),
            "</div>",
            '<div class="forge-neo-extra-edit-right">',
            extraNetworkPreviewHtml(payload),
            "</div>",
            "</div>",
        ];
        if (isLora) {
            fields.push(
                '<label class="forge-neo-extra-edit-label">' + escapeHtml(t("Preset", "预设")) + "</label>",
                '<div class="forge-neo-extra-lora-preset-row">' + extraNetworkLoraPresetHtml(payload) + "</div>",
                '<label class="forge-neo-extra-edit-label">' + escapeHtml(t("Trigger words", "触发词")) + "</label>",
                '<div class="forge-neo-extra-edit-info">' + escapeHtml(t("Will be added to prompt along with Lora", "会和 Lora 一起添加到提示词中")) + "</div>",
                '<textarea class="forge-neo-extra-activation-text" rows="3">' + escapeHtml(extraNetworkMetadataValue(userMetadata, "activation text")) + "</textarea>",
                '<label class="forge-neo-extra-edit-label">' + escapeHtml(t("Preferred weight", "推荐权重")) + "</label>",
                '<div class="forge-neo-extra-edit-info">' + escapeHtml(t("Set to 0 to disable", "设置为 0 以禁用")) + "</div>",
                extraNetworkPreferredWeightHtml(userMetadata),
                '<label class="forge-neo-extra-edit-label">' + escapeHtml(t("Negative prompt", "反向提示词")) + "</label>",
                '<div class="forge-neo-extra-edit-info">' + escapeHtml(t("Will be added to negative prompts", "会被添加到反向提示词中")) + "</div>",
                '<textarea class="forge-neo-extra-negative-text" rows="3">' + escapeHtml(extraNetworkMetadataValue(userMetadata, "negative text")) + "</textarea>"
            );
        } else {
            fields.push(
                '<label class="forge-neo-extra-edit-label">' + escapeHtml(t("Base model", "基础模型")) + "</label>",
                '<div class="forge-neo-extra-base-model">' + extraNetworkBaseModelHtml(payload) + "</div>",
                '<label class="forge-neo-extra-edit-label">' + escapeHtml(t("Preferred VAE / Text encoder(s)", "首选 VAE / 文本编码器")) + "</label>",
                '<div class="forge-neo-extra-vae-row">' + extraNetworkVaeSelectHtml(payload) + '<button type="button" class="forge-neo-extra-vae-refresh" title="' + escapeHtml(t("Refresh", "刷新")) + '">↻</button></div>'
            );
        }
        fields.push(
            '<label class="forge-neo-extra-edit-label">' + escapeHtml(t("Notes", "备注")) + "</label>",
            '<textarea class="forge-neo-extra-notes" rows="4">' + escapeHtml(userMetadata.notes || "") + "</textarea>",
            '<input type="file" class="forge-neo-extra-preview-file" accept="image/*" hidden>',
            '<div class="forge-neo-extra-edit-actions">',
            '<button type="button" class="forge-neo-extra-edit-cancel">' + escapeHtml(t("Cancel", "取消")) + "</button>",
            '<button type="button" class="forge-neo-extra-preview-replace">' + escapeHtml(t("Replace preview", "替换预览")) + "</button>",
            '<button type="button" class="forge-neo-extra-metadata-save">' + escapeHtml(t("Save", "保存")) + "</button>",
            "</div>",
            '<div class="forge-neo-extra-metadata-status"></div>'
        );
        return fields.join("");
    }

    function selectedExtraNetworkVaeValues(overlay) {
        const select = overlay.querySelector(".forge-neo-extra-vae-select");
        return select ? Array.from(select.selectedOptions).map(function (option) { return option.value; }).filter(Boolean) : [];
    }

    function selectedExtraNetworkBaseModel(overlay) {
        const checked = overlay.querySelector('input[name="forge_neo_extra_base_model"]:checked');
        return checked ? checked.value : "Unknown";
    }

    function selectedExtraNetworkLoraPreset(overlay) {
        const select = overlay.querySelector(".forge-neo-extra-lora-preset");
        return select ? select.value : "Unknown";
    }

    function extraNetworkPreferredWeightFromInput(overlay) {
        const input = overlay.querySelector(".forge-neo-extra-preferred-weight");
        const raw = input ? String(input.value || "").trim() : "0";
        const number = Number.parseFloat(raw);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(2, number));
    }

    function syncExtraNetworkPreferredWeightControl(overlay) {
        const range = overlay.querySelector(".forge-neo-extra-preferred-weight-range");
        const input = overlay.querySelector(".forge-neo-extra-preferred-weight");
        if (!range || !input) return;
        const sync = function (source, target) {
            const value = Math.max(0, Math.min(2, Number.parseFloat(source.value || "0") || 0));
            source.value = String(value);
            target.value = String(value);
        };
        range.addEventListener("input", function () { sync(range, input); });
        input.addEventListener("input", function () { sync(input, range); });
        sync(input, range);
    }

    function extraNetworkEditedMetadata(card, payload, overlay) {
        const original = Object.assign({}, payload.user_metadata || {});
        const description = overlay.querySelector(".forge-neo-extra-description");
        const activationText = overlay.querySelector(".forge-neo-extra-activation-text");
        const negativeText = overlay.querySelector(".forge-neo-extra-negative-text");
        const notes = overlay.querySelector(".forge-neo-extra-notes");
        const page = extraNetworkPage(card.getAttribute("data-kind"));
        original.description = description ? description.value : "";
        original.notes = notes ? notes.value : "";
        if (page === "lora") {
            original["activation text"] = activationText ? activationText.value : "";
            original["negative text"] = negativeText ? negativeText.value : "";
            original["preferred weight"] = extraNetworkPreferredWeightFromInput(overlay);
            original["sd version"] = selectedExtraNetworkLoraPreset(overlay);
            delete original.sd_version_str;
            delete original.vae_te;
        } else {
            const baseModel = selectedExtraNetworkBaseModel(overlay);
            delete original["activation text"];
            delete original["negative text"];
            delete original["preferred weight"];
            delete original["sd version"];
            original.sd_version_str = "SdVersion." + baseModel;
            original.vae_te = selectedExtraNetworkVaeValues(overlay);
        }
        return original;
    }

    function updateExtraNetworkCardPreview(card, previewUrl) {
        if (!card || !previewUrl) return;
        const thumb = card.querySelector(".forge-neo-extra-thumb");
        if (!thumb) return;
        thumb.classList.add("forge-neo-extra-thumb-has-image");
        thumb.setAttribute("data-preview", previewUrl);
        thumb.innerHTML = '<img src="' + escapeHtml(previewUrl) + '" alt="" loading="lazy">';
    }

    function updateExtraNetworkCardMetadata(card, metadata) {
        if (!card || !metadata) return;
        if (String(card.getAttribute("data-kind") || "") !== "lora") return;
        const activationText = metadata["activation text"];
        const negativeText = metadata["negative text"];
        card.setAttribute("data-activation-text", activationText == null ? "" : String(activationText));
        card.setAttribute("data-negative-text", negativeText == null ? "" : String(negativeText));
        const rawWeight = metadata["preferred weight"];
        const numericWeight = Number.parseFloat(rawWeight == null ? "" : String(rawWeight));
        if (Number.isFinite(numericWeight)) {
            card.setAttribute("data-weight", String(numericWeight));
        } else if (rawWeight == null || !String(rawWeight).trim()) {
            card.removeAttribute("data-weight");
        } else {
            card.setAttribute("data-weight", "1");
        }
    }

    function readExtraNetworkPreviewFile(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || "")); };
            reader.onerror = function () { reject(reader.error || new Error("Failed to read image")); };
            reader.readAsDataURL(file);
        });
    }

    async function refreshExtraNetworkVaeChoices(overlay) {
        const select = overlay.querySelector(".forge-neo-extra-vae-select");
        if (!select) return;
        const selected = selectedExtraNetworkVaeValues(overlay);
        const response = await fetch(resolveAppPath("./sdapi/v1/sd-modules"), { cache: "no-store" });
        const rows = await response.json();
        const choices = ["Built in"].concat((Array.isArray(rows) ? rows : []).map(function (row) {
            return String(row.model_name || "");
        }).filter(Boolean));
        selected.forEach(function (item) {
            if (choices.indexOf(item) < 0) choices.push(item);
        });
        select.innerHTML = choices.filter(function (item, index) { return item && choices.indexOf(item) === index; }).map(function (item) {
            return extraNetworkOptionHtml(item, selected);
        }).join("");
    }

    function showExtraNetworkMetadataModal(card, metadataPayload, editable, errorText) {
        closeExtraNetworkModal();
        const payload = normalizeExtraNetworkMetadataPayload(metadataPayload);
        const title = payload.name || extraNetworkCardTitle(card) || card.getAttribute("data-name") || "";
        const page = extraNetworkPage(card.getAttribute("data-kind"));
        const item = card.getAttribute("data-name") || "";
        const overlay = document.createElement("div");
        overlay.id = "forge_neo_extra_network_modal";
        overlay.className = "forge-neo-profile-modal forge-neo-extra-network-modal" + (editable ? " is-editor" : "");
        payload.name = title;
        payload.page = page;
        const body = errorText
            ? '<p class="forge-neo-profile-error">' + escapeHtml(errorText) + "</p>"
            : editable
                ? extraNetworkEditFormHtml(payload)
                : extraNetworkInternalMetadataHtml(payload);
        overlay.innerHTML = [
            '<div class="forge-neo-profile-card forge-neo-extra-metadata-card" role="dialog" aria-modal="true">',
            editable ? "" : '<button type="button" class="forge-neo-profile-close" aria-label="' + escapeHtml(t("Close", "关闭")) + '">x</button>',
            editable ? "" : "<h2>" + escapeHtml(t("Metadata", "Metadata")) + "</h2>",
            editable ? "" : '<p class="forge-neo-extra-metadata-name">' + escapeHtml(title) + "</p>",
            body,
            "</div>"
        ].join("");
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay || event.target.closest(".forge-neo-profile-close") || event.target.closest(".forge-neo-extra-edit-cancel")) closeExtraNetworkModal();
        });
        syncExtraNetworkPreferredWeightControl(overlay);
        const refreshButton = overlay.querySelector(".forge-neo-extra-vae-refresh");
        if (refreshButton) refreshButton.addEventListener("click", async function () {
            const status = overlay.querySelector(".forge-neo-extra-metadata-status");
            refreshButton.disabled = true;
            if (status) status.textContent = t("Refreshing...", "正在刷新...");
            try {
                await refreshExtraNetworkVaeChoices(overlay);
                if (status) status.textContent = "";
            } catch (error) {
                if (status) status.textContent = error && error.message ? error.message : String(error || "");
            } finally {
                refreshButton.disabled = false;
            }
        });
        const replaceButton = overlay.querySelector(".forge-neo-extra-preview-replace");
        const fileInput = overlay.querySelector(".forge-neo-extra-preview-file");
        if (replaceButton && fileInput) replaceButton.addEventListener("click", function () {
            fileInput.click();
        });
        if (fileInput) fileInput.addEventListener("change", async function () {
            const status = overlay.querySelector(".forge-neo-extra-metadata-status");
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            if (status) status.textContent = t("Replacing preview...", "正在替换预览...");
            try {
                const imageData = await readExtraNetworkPreviewFile(file);
                const response = await fetch(resolveAppPath("./sd_extra_networks/preview"), {
                    method: "POST",
                    cache: "no-store",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ page: page, item: item, image_data: imageData })
                });
                const saved = await response.json().catch(function () { return {}; });
                if (!response.ok) throw new Error(saved.detail || "HTTP " + response.status);
                const previewUrl = String(saved.preview_url || "");
                const stamped = previewUrl ? previewUrl + (previewUrl.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now() : "";
                const previewBox = overlay.querySelector(".forge-neo-extra-edit-preview");
                if (previewBox && stamped) {
                    previewBox.classList.remove("forge-neo-extra-edit-preview-empty");
                    previewBox.innerHTML = '<img src="' + escapeHtml(stamped) + '" alt="">';
                }
                updateExtraNetworkCardPreview(card, stamped);
                if (status) status.textContent = t("Preview replaced.", "预览已替换。");
                showExtraNetworkToast(t("Preview replaced.", "预览已替换。"));
            } catch (error) {
                if (status) status.textContent = error && error.message ? error.message : String(error || "");
            } finally {
                fileInput.value = "";
            }
        });
        const saveButton = overlay.querySelector(".forge-neo-extra-metadata-save");
        if (saveButton) {
            saveButton.addEventListener("click", async function () {
                const status = overlay.querySelector(".forge-neo-extra-metadata-status");
                saveButton.disabled = true;
                if (status) status.textContent = t("Saving...", "正在保存...");
                try {
                    const metadata = editable ? extraNetworkEditedMetadata(card, payload, overlay) : {};
                    const response = await fetch(resolveAppPath("./sd_extra_networks/metadata"), {
                        method: "POST",
                        cache: "no-store",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ page: page, item: item, metadata: metadata })
                    });
                    const savedPayload = await response.json().catch(function () { return {}; });
                    if (!response.ok) throw new Error(savedPayload.detail || "HTTP " + response.status);
                    updateExtraNetworkCardMetadata(card, metadata);
                    if (status) status.textContent = t("Saved.", "已保存。");
                    showExtraNetworkToast(t("Metadata saved.", "Metadata 已保存。"));
                    closeExtraNetworkModal();
                } catch (error) {
                    if (status) status.textContent = error && error.message ? error.message : String(error || "");
                } finally {
                    saveButton.disabled = false;
                }
            });
        }
        document.body.appendChild(overlay);
    }

    async function requestExtraNetworkMetadata(card, editable) {
        const params = new URLSearchParams({
            page: extraNetworkPage(card.getAttribute("data-kind")),
            item: card.getAttribute("data-name") || ""
        });
        let metadataPayload = { metadata: "{}", user_metadata: {} };
        let errorText = "";
        try {
            const response = await fetch(resolveAppPath("./sd_extra_networks/metadata?" + params.toString()), { cache: "no-store" });
            const payload = await response.json().catch(function () { return {}; });
            if (!response.ok) throw new Error(payload.detail || "HTTP " + response.status);
            metadataPayload = payload;
        } catch (error) {
            errorText = error && error.message ? error.message : String(error || "");
        }
        showExtraNetworkMetadataModal(card, metadataPayload, editable, errorText);
    }

    function handleExtraNetworkCardTool(tool) {
        const card = tool && tool.closest(".forge-neo-extra-card[data-kind][data-name]");
        const action = tool && tool.getAttribute("data-extra-action");
        if (!card || !action) return false;
        if (action === "copy") {
            const text = card.getAttribute("data-filename") || card.getAttribute("data-path") || card.getAttribute("data-name") || "";
            copyExtraNetworkText(text).then(function () {
                showExtraNetworkToast(t("Path copied.", "路径已复制。"));
            }).catch(function (error) {
                showExtraNetworkToast(error && error.message ? error.message : t("Copy failed.", "复制失败。"));
            });
            return true;
        }
        if (action === "edit") {
            requestExtraNetworkMetadata(card, true);
            return true;
        }
        if (action === "metadata") {
            requestExtraNetworkMetadata(card, false);
            return true;
        }
        return false;
    }

    function sortExtraNetworkCards(browser, key) {
        const grid = browser && browser.querySelector(".forge-neo-extra-grid");
        if (!grid) return false;
        const sortKey = key || browser.dataset.forgeNeoSortKey || "path";
        const direction = browser.dataset.forgeNeoSortDir || "asc";
        browser.dataset.forgeNeoSortKey = sortKey;
        const cards = Array.from(grid.querySelectorAll(".forge-neo-extra-card"));
        const more = grid.querySelector(".forge-neo-extra-more");
        const valueFor = function (card) {
            if (sortKey === "name") return card.getAttribute("data-sort-name") || card.getAttribute("data-name") || "";
            if (sortKey === "created") return Number(card.getAttribute("data-sort-created") || 0);
            if (sortKey === "modified") return Number(card.getAttribute("data-sort-modified") || 0);
            return card.getAttribute("data-path") || card.getAttribute("data-name") || "";
        };
        cards.sort(function (a, b) {
            const av = valueFor(a);
            const bv = valueFor(b);
            const result = typeof av === "number" || typeof bv === "number"
                ? Number(av) - Number(bv)
                : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
            return direction === "desc" ? -result : result;
        });
        cards.forEach(function (card) { grid.appendChild(card); });
        if (more) grid.appendChild(more);
        browser.querySelectorAll(".forge-neo-extra-sort-tools button[data-extra-sort]").forEach(function (button) {
            button.classList.toggle("is-active", button.getAttribute("data-extra-sort") === sortKey);
        });
        return true;
    }

    function handleExtraNetworkToolbarButton(button) {
        const browser = button && button.closest(".forge-neo-extra-browser");
        if (!browser) return false;
        const sortKey = button.getAttribute("data-extra-sort");
        const control = button.getAttribute("data-extra-control");
        if (sortKey) return sortExtraNetworkCards(browser, sortKey);
        if (control === "direction") {
            const next = browser.dataset.forgeNeoSortDir === "desc" ? "asc" : "desc";
            browser.dataset.forgeNeoSortDir = next;
            button.textContent = next === "desc" ? "↑" : "↓";
            sortExtraNetworkCards(browser);
            return true;
        }
        if (control === "dirs") {
            browser.classList.toggle("forge-neo-extra-dirs-hidden");
            button.classList.toggle("is-active", !browser.classList.contains("forge-neo-extra-dirs-hidden"));
            return true;
        }
        if (control === "refresh") {
            showExtraNetworkToast(t("Refreshing models...", "正在刷新模型..."));
            return clickComponentButton("#forge_neo_refresh_models");
        }
        return false;
    }

    function decorateExtraNetworkBrowsers() {
        document.querySelectorAll(".forge-neo-extra-sort-tools").forEach(function (sortTools) {
            if (sortTools.dataset.forgeNeoExpanded === "1") return;
            sortTools.dataset.forgeNeoExpanded = "1";
            sortTools.innerHTML = [
                "<span>" + escapeHtml(t("Sort:", "排序：")) + "</span>",
                '<button type="button" data-extra-sort="path" aria-label="Folder">▣</button>',
                '<button type="button" data-extra-sort="name" aria-label="Name">A</button>',
                '<button type="button" data-extra-sort="created" aria-label="Date created">◷＋</button>',
                '<button type="button" data-extra-sort="modified" aria-label="Date modified">◷✎</button>',
                '<button type="button" data-extra-control="direction" aria-label="Sort direction">↓</button>',
                '<button type="button" data-extra-control="dirs" aria-label="Tree view">▤</button>',
                '<button type="button" data-extra-control="refresh" aria-label="Refresh">↻</button>'
            ].join("");
        });
        document.querySelectorAll(".forge-neo-extra-card").forEach(function (card) {
            const existingTools = card.querySelector(".forge-neo-extra-card-tools");
            const isLora = String(card.getAttribute("data-kind") || "") === "lora";
            if (existingTools) {
                const metadataTool = existingTools.querySelector('[data-extra-action="metadata"]');
                if (isLora && !metadataTool) {
                    const tool = document.createElement("span");
                    tool.className = "forge-neo-extra-card-tool forge-neo-extra-card-tool-metadata";
                    tool.setAttribute("data-extra-action", "metadata");
                    tool.setAttribute("title", "Show internal metadata");
                    tool.textContent = "i";
                    const editTool = existingTools.querySelector('[data-extra-action="edit"]');
                    existingTools.insertBefore(tool, editTool || null);
                } else if (!isLora && metadataTool) {
                    metadataTool.remove();
                }
                return;
            }
            const tools = document.createElement("span");
            tools.className = "forge-neo-extra-card-tools";
            tools.setAttribute("aria-hidden", "true");
            tools.innerHTML = [
                '<span class="forge-neo-extra-card-tool" data-extra-action="copy" title="Copy path">⎘</span>',
                isLora ? '<span class="forge-neo-extra-card-tool forge-neo-extra-card-tool-metadata" data-extra-action="metadata" title="Show internal metadata">i</span>' : "",
                '<span class="forge-neo-extra-card-tool" data-extra-action="edit" title="Edit metadata">🛠</span>'
            ].join("");
            const text = card.querySelector(".forge-neo-extra-card-text");
            card.insertBefore(tools, text || null);
        });
    }

    function installExtensionFromIndex(button, url, dirname, branch) {
        if (button) {
            button.disabled = true;
            button.textContent = t("Installing...", "安装中...");
        }
        let clicked = false;
        function runInstall() {
            if (clicked) return;
            const urlReady = setComponentInputValue("#forge_neo_extensions_install_url", url);
            const branchReady = setComponentInputValue("#forge_neo_extensions_install_branch", branch || "");
            const dirnameReady = setComponentInputValue("#forge_neo_extensions_install_dirname", dirname || "");
            const buttonReady = urlReady && branchReady && dirnameReady && clickComponentButton("#forge_neo_extensions_install");
            if (buttonReady) {
                clicked = true;
            } else if (button) {
                button.disabled = false;
                button.textContent = t("Install", "安装");
            }
        }
        runInstall();
        window.setTimeout(runInstall, 150);
    }

    async function requestNotifications(state) {
        if (!("Notification" in window)) {
            return [gradioUpdate(notificationResultHtml(
                state,
                textForLang(state, "unavailable", "不可用"),
                textForLang(state, "This browser does not expose the Notification API.", "当前浏览器不支持 Notification API。")
            ))];
        }
        let permission = Notification.permission || "default";
        if (permission === "default" && typeof Notification.requestPermission === "function") {
            try {
                permission = await Notification.requestPermission();
            } catch (error) {
                return [gradioUpdate(notificationResultHtml(
                    state,
                    textForLang(state, "error", "错误"),
                    error && error.message ? error.message : String(error || "Notification request failed")
                ))];
            }
        }
        const details = {
            granted: ["Notifications are enabled for this browser.", "浏览器通知已允许。"],
            denied: ["Notifications are blocked by this browser.", "浏览器通知已被阻止。"],
            default: ["The browser has not granted notification permission.", "浏览器尚未授予通知权限。"]
        };
        const pair = details[permission] || [String(permission), String(permission)];
        return [gradioUpdate(notificationResultHtml(state, permission, textForLang(state, pair[0], pair[1])))];
    }

    function resolveAppPath(path) {
        const normalized = String(path || "").replace(/^\.\//, "/");
        if (/^https?:\/\//i.test(normalized)) return normalized;
        return appRoot() + (normalized.startsWith("/") ? normalized : "/" + normalized);
    }

    function closeProfileModal() {
        const existing = document.getElementById("forge_neo_profile_modal");
        if (existing) existing.remove();
    }

    function profileRowsHtml(records) {
        const entries = Object.entries(records || {}).map(function (entry) {
            return [entry[0], Number(entry[1]) || 0];
        }).sort(function (a, b) {
            return b[1] - a[1];
        });
        if (!entries.length) {
            return '<tr><td colspan="2">' + escapeHtml(t("No profile records.", "暂无启动记录。")) + "</td></tr>";
        }
        return entries.map(function (entry) {
            return "<tr><td>" + escapeHtml(entry[0]) + "</td><td>" + escapeHtml(entry[1].toFixed(3)) + "</td></tr>";
        }).join("");
    }

    async function showProfile(path) {
        closeProfileModal();
        let payload = null;
        let errorText = "";
        try {
            const response = await fetch(resolveAppPath(path), { cache: "no-store" });
            if (!response.ok) throw new Error("HTTP " + response.status);
            payload = await response.json();
        } catch (error) {
            errorText = error && error.message ? error.message : String(error || "Profile request failed");
        }
        const total = payload ? Number(payload.total || 0) : 0;
        const overlay = document.createElement("div");
        overlay.id = "forge_neo_profile_modal";
        overlay.className = "forge-neo-profile-modal";
        overlay.innerHTML = [
            '<div class="forge-neo-profile-card" role="dialog" aria-modal="true">',
            '<button type="button" class="forge-neo-profile-close" aria-label="' + escapeHtml(t("Close", "关闭")) + '">x</button>',
            "<h2>" + escapeHtml(t("Startup Profile", "启动 Profile")) + "</h2>",
            payload
                ? "<p>" + escapeHtml(t("total", "总计")) + ": " + escapeHtml(total.toFixed(3)) + "s</p>"
                : '<p class="forge-neo-profile-error">' + escapeHtml(errorText) + "</p>",
            '<table class="forge-neo-profile-table"><thead><tr><th>' + escapeHtml(t("record", "记录")) + "</th><th>" + escapeHtml(t("seconds", "秒")) + "</th></tr></thead>",
            "<tbody>" + profileRowsHtml(payload && payload.records) + "</tbody></table>",
            "</div>"
        ].join("");
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay || event.target.closest(".forge-neo-profile-close")) closeProfileModal();
        });
        document.body.appendChild(overlay);
    }

    const styleEditorModalSelector = ".forge-neo-style-modal-card";
    const styleEditorBackdropSelector = "#forge_neo_style_modal_backdrop, #forge_neo_img2img_style_modal_backdrop";

    function isStyleEditorModalVisible(modal) {
        if (!modal) return false;
        const style = window.getComputedStyle(modal);
        return style.display !== "none" && style.visibility !== "hidden";
    }

    function closeStyleEditorModal(modal) {
        const closeButton = modal && modal.querySelector("[id$='style_close_top'], [id$='style_close_top'] button, [id$='edit_style_close'], [id$='edit_style_close'] button");
        if (closeButton) closeButton.click();
    }

    function closeStyleEditorFromBackdrop(backdrop) {
        const id = String((backdrop && backdrop.id) || "");
        const closeButton = document.querySelector(id.indexOf("img2img") >= 0 ? "#forge_neo_img2img_style_close_top" : "#forge_neo_style_close_top");
        if (closeButton) closeButton.click();
    }

    function initStyleEditorModals() {
        document.querySelectorAll(styleEditorBackdropSelector).forEach(function (backdrop) {
            if (backdrop.dataset.forgeNeoStyleBackdropReady === "1") return;
            backdrop.dataset.forgeNeoStyleBackdropReady = "1";
            backdrop.addEventListener("click", function () {
                closeStyleEditorFromBackdrop(backdrop);
            });
        });
    }

    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        const modal = Array.from(document.querySelectorAll(styleEditorModalSelector)).find(isStyleEditorModalVisible);
        if (!modal) return;
        closeStyleEditorModal(modal);
        event.preventDefault();
    });

    async function footerReload() {
        try {
            await fetch(appRoot() + "/forge-neo/api/reload-ui", { method: "POST", cache: "no-store" });
        } catch (error) {
            // The page reload loop below also covers the brief server shutdown window.
        }
        restartReload();
        return false;
    }

    function localizeControlledTexts() {
        const status = document.querySelector("#forge_neo_status .forge-neo-output-status");
        if (status && !status.textContent.trim()) status.textContent = t("Ready.", "就绪。");
        const imgStatus = document.querySelector("#forge_neo_img2img_status .forge-neo-output-status");
        if (imgStatus && !imgStatus.textContent.trim()) imgStatus.textContent = t("Ready.", "就绪。");
        const refresh = document.querySelector("#forge_neo_refresh_models button, #forge_neo_refresh_models");
        if (refresh && refresh.textContent.trim() === "Refresh") refresh.textContent = t("Refresh", "刷新");
        [
            ["#forge_neo_unload_models", "Unload models to RAM", "卸载模型到内存"],
            ["#forge_neo_refresh_models", "Refresh models", "刷新模型"],
            ["#forge_neo_paste_params", "Read generation parameters from prompt or last generated image", "从提示词或上次生成的图片中读取生成参数"],
            ["#forge_neo_img2img_paste_params", "Read generation parameters from prompt or last generated image", "从提示词或上次生成的图片中读取生成参数"],
            ["#forge_neo_clear_prompt", "Clear prompt", "清空提示词"],
            ["#forge_neo_img2img_clear_prompt", "Clear prompt", "清空提示词"],
            ["#forge_neo_style_apply", "Apply selected styles", "应用所选样式"],
            ["#forge_neo_img2img_style_apply", "Apply selected styles", "应用所选样式"],
            ["#forge_neo_style_apply_dialog", "Apply selected styles to prompt", "发送所选样式到提示词"],
            ["#forge_neo_img2img_style_apply_dialog", "Apply selected styles to prompt", "发送所选样式到提示词"],
            ["#forge_neo_style_copy", "Copy prompt to style", "复制提示词到样式"],
            ["#forge_neo_img2img_style_copy", "Copy prompt to style", "复制提示词到样式"],
            ["#forge_neo_style_edit", "Edit styles.csv", "编辑 styles.csv"],
            ["#forge_neo_img2img_style_edit", "Edit styles.csv", "编辑 styles.csv"],
            ["#forge_neo_style_close_top", "Close", "关闭"],
            ["#forge_neo_img2img_style_close_top", "Close", "关闭"],
            ["#forge_neo_res_switch_btn", "Switch width and height", "互换宽高"],
            ["#forge_neo_img2img_res_switch_btn", "Switch width and height", "互换宽高"],
            ["#forge_neo_img2img_detect_image_size_btn", "Read size from input image", "读取输入图尺寸"],
            ["#forge_neo_seed_random", "Random seed", "随机种子"],
            ["#forge_neo_img2img_seed_random", "Random seed", "随机种子"],
            ["#forge_neo_seed_reuse", "Reuse last seed", "复用上次种子"],
            ["#forge_neo_img2img_seed_reuse", "Reuse last seed", "复用上次种子"],
            ["#forge_neo_style_refresh", "Refresh styles.csv", "刷新 styles.csv"],
            ["#forge_neo_img2img_style_refresh", "Refresh styles.csv", "刷新 styles.csv"],
            ["#forge_neo_txt2img_open_folder", "Open output folder", "打开输出目录"],
            ["#forge_neo_img2img_open_folder", "Open output folder", "打开输出目录"],
            ["#forge_neo_extras_open_folder", "Open output folder", "打开输出目录"],
            ["#forge_neo_save_txt2img", "Save image", "保存图片"],
            ["#forge_neo_save_img2img", "Save image", "保存图片"],
            ["#forge_neo_save_zip_txt2img", "Save images as ZIP", "保存 ZIP"],
            ["#forge_neo_save_zip_img2img", "Save images as ZIP", "保存 ZIP"],
            ["#forge_neo_txt2img_send_to_img2img", "Send to img2img", "发送到图生图"],
            ["#forge_neo_img2img_send_to_img2img", "Send to img2img", "发送到图生图"],
            ["#forge_neo_extras_send_to_img2img", "Send to img2img", "发送到图生图"],
            ["#forge_neo_txt2img_send_to_inpaint", "Send to inpaint", "发送到重绘"],
            ["#forge_neo_img2img_send_to_inpaint", "Send to inpaint", "发送到重绘"],
            ["#forge_neo_extras_send_to_inpaint", "Send to inpaint", "发送到重绘"],
            ["#forge_neo_txt2img_send_to_extras", "Send to extras", "发送到附加"],
            ["#forge_neo_img2img_send_to_extras", "Send to extras", "发送到附加"],
            ["#forge_neo_extras_send_to_extras", "Send to extras", "发送到附加"],
            ["#forge_neo_txt2img_send_to_storyboard", "Send to storyboard", "发送到分镜"],
            ["#forge_neo_img2img_send_to_storyboard", "Send to storyboard", "发送到分镜"],
            ["#forge_neo_txt2img_upscale", "Upscale with hires fix", "使用高清修复放大"]
        ].forEach(function (item) {
            const root = document.querySelector(item[0]);
            const button = document.querySelector(item[0] + " button");
            const label = t(item[1], item[2]);
            [root, button].forEach(function (el) {
                if (!el) return;
                el.setAttribute("title", label);
                el.setAttribute("aria-label", label);
            });
        });
        [
            ["[id$='controlnet_open_new_canvas'], [id*='controlnet_unit_'][id$='_open_new_canvas']", "Open new canvas", "新建画布"],
            ["[id$='controlnet_send_dimensions'], [id*='controlnet_unit_'][id$='_send_dimensions']", "Send dimensions to stable diffusion", "发送尺寸到主分辨率"],
            ["[id$='controlnet_trigger_preprocessor'], [id*='controlnet_unit_'][id$='_trigger_preprocessor']", "Run preprocessor", "运行预处理器"],
            ["[id$='controlnet_refresh_models'], [id*='controlnet_unit_'][id$='_refresh_models']", "Refresh ControlNet models", "刷新 ControlNet 模型"]
        ].forEach(function (item) {
            document.querySelectorAll(item[0]).forEach(function (root) {
                const button = root.tagName === "BUTTON" ? root : root.querySelector("button");
                const label = t(item[1], item[2]);
                [root, button].forEach(function (el) {
                    if (!el) return;
                    el.setAttribute("title", label);
                    el.setAttribute("aria-label", label);
                });
            });
        });
        localizeImageEditorLayerLabels();
    }

    function localizeImageEditorLayerLabels() {
        const label = t("Layer 1", "图层 1");
        document.querySelectorAll("#forge_neo_root .forge-neo-canvas-lite").forEach(function (root) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const text = String(node.nodeValue || "");
                const trimmed = text.trim();
                if (trimmed === "Layer 1" || trimmed === "图层 1") {
                    node.nodeValue = text.replace(/Layer 1|图层 1/g, label);
                }
            }
        });
    }

    const promptCounterTargets = [
        ["#forge_neo_prompt", 999],
        ["#forge_neo_negative_prompt", 75],
        ["#forge_neo_img2img_prompt", 999],
        ["#forge_neo_img2img_negative_prompt", 75]
    ];

    function promptLength(value) {
        return Array.from(String(value || "").replace(/\r\n/g, "\n")).length;
    }

    function updatePromptCounter(root, input, counter, max) {
        const length = promptLength(input.value);
        counter.textContent = length + "/" + max;
        counter.classList.toggle("is-over", length > max);
        root.classList.toggle("forge-neo-counter-host", true);
    }

    function ensurePromptCounter(selector, max) {
        const root = document.querySelector(selector);
        const input = root && root.querySelector("textarea, input");
        if (!root || !input) return;
        let counter = root.querySelector(".forge-neo-prompt-counter");
        if (!counter) {
            counter = document.createElement("div");
            counter.className = "forge-neo-prompt-counter";
            counter.setAttribute("aria-hidden", "true");
            root.appendChild(counter);
            input.addEventListener("input", function () {
                updatePromptCounter(root, input, counter, max);
            });
            input.addEventListener("change", function () {
                updatePromptCounter(root, input, counter, max);
            });
        }
        updatePromptCounter(root, input, counter, max);
    }

    function syncPromptCounters() {
        promptCounterTargets.forEach(function (target) {
            ensurePromptCounter(target[0], target[1]);
        });
    }

    function setImg2imgMode(mode) {
        const inpaint = document.querySelector("#forge_neo_img2img_inpaint_controls");
        if (inpaint) {
            inpaint.classList.toggle("is-active", ["inpaint", "inpaint_sketch", "inpaint_upload"].includes(mode));
            inpaint.classList.toggle("is-inpaint-sketch", mode === "inpaint_sketch");
        }
    }

    function syncImg2imgMode() {
        const selected = document.querySelector("#forge_neo_img2img_mode_tabs button[role='tab'][aria-selected='true']");
        const modeById = {
            "forge_neo_img2img_mode_img2img-button": "img2img",
            "forge_neo_img2img_mode_sketch-button": "sketch",
            "forge_neo_img2img_mode_inpaint-button": "inpaint",
            "forge_neo_img2img_mode_inpaint_sketch-button": "inpaint_sketch",
            "forge_neo_img2img_mode_inpaint_upload-button": "inpaint_upload",
            "forge_neo_img2img_mode_batch-button": "batch"
        };
        setImg2imgMode(modeById[selected && selected.id] || "img2img");
    }

    function boolData(root, key) {
        return String(root.dataset[key] || "").toLowerCase() === "true";
    }

    function intData(root, key, fallback) {
        const value = parseInt(root.dataset[key] || "", 10);
        return Number.isFinite(value) ? value : fallback;
    }

    function initForgeCanvasWidgets() {
        if (!window.ForgeCanvas) return;
        document.querySelectorAll("#forge_neo_root .forge-container[data-forge-neo-canvas='1']:not([data-forge-neo-ready='1'])").forEach(function (container) {
            const uuid = container.dataset.forgeNeoCanvasUuid;
            if (!uuid) return;
            const background = document.querySelector("#" + uuid + ".logical_image_background textarea");
            const foreground = document.querySelector("#" + uuid + ".logical_image_foreground textarea");
            if (!background || !foreground) return;
            try {
                new window.ForgeCanvas(
                    uuid,
                    boolData(container, "noUpload"),
                    boolData(container, "noScribbles"),
                    boolData(container, "contrastScribbles"),
                    intData(container, "height", 512),
                    container.dataset.scribbleColor || "#000000",
                    boolData(container, "scribbleColorFixed"),
                    intData(container, "scribbleWidth", 25),
                    boolData(container, "scribbleWidthFixed"),
                    boolData(container, "scribbleWidthConsistent"),
                    intData(container, "scribbleAlpha", 100),
                    boolData(container, "scribbleAlphaFixed"),
                    intData(container, "scribbleSoftness", 0),
                    boolData(container, "scribbleSoftnessFixed")
                );
                container.dataset.forgeNeoReady = "1";
            } catch (error) {
                console.warn("Forge Neo canvas init failed", error);
            }
        });
    }

    function scheduleForgeCanvasInit() {
        [0, 80, 240, 700].forEach(function (delay) {
            window.setTimeout(initForgeCanvasWidgets, delay);
        });
    }

    function syncControlNetUnitBadges() {
        document.querySelectorAll("#forge_neo_root .forge-neo-integrated-accordion[id$='_controlnet']").forEach(function (accordion) {
            const labelText = accordion.querySelector(".label-wrap span:first-child");
            const checkboxes = accordion.querySelectorAll(
                [
                    "[id$='_controlnet_enable'] input[type='checkbox']",
                    "[id*='_controlnet_unit_'][id$='_enable'] input[type='checkbox']"
                ].join(", ")
            );
            let enabledCount = 0;
            checkboxes.forEach(function (checkbox) {
                if (checkbox.checked) enabledCount += 1;
            });
            if (enabledCount > 0) {
                accordion.setAttribute("data-controlnet-units", String(enabledCount));
                if (labelText) labelText.setAttribute("data-controlnet-units", String(enabledCount));
            } else {
                accordion.removeAttribute("data-controlnet-units");
                if (labelText) labelText.removeAttribute("data-controlnet-units");
            }
        });
    }

    function syncControlNetPixelPerfectProcessor() {
        document.querySelectorAll(
            [
                "#forge_neo_root [id$='controlnet_pixel_perfect']",
                "#forge_neo_root [id*='controlnet_unit_'][id$='_pixel_perfect']"
            ].join(", ")
        ).forEach(function (root) {
            const checkbox = root.querySelector("input[type='checkbox']");
            const processor = document.getElementById(String(root.id || "").replace(/_pixel_perfect$/, "_processor_res"));
            if (!processor) return;
            processor.classList.toggle("forge-neo-pixel-perfect-hidden", Boolean(checkbox && checkbox.checked));
        });
    }

    function scheduleControlNetPixelPerfectSync() {
        [0, 120, 420, 900].forEach(function (delay) {
            window.setTimeout(syncControlNetPixelPerfectProcessor, delay);
        });
    }

    function clickById(id) {
        const button = document.getElementById(id);
        if (!button) return false;
        button.click();
        return true;
    }

    function switchForgeNeoTab(tab) {
        const ids = {
            txt2img: "forge_neo_txt2img_tab-button",
            img2img: "forge_neo_img2img_tab-button",
            extras: "forge_neo_extras_tab-button",
            pnginfo: "forge_neo_pnginfo_tab-button"
        };
        const id = ids[tab];
        return id ? clickById(id) : false;
    }

    function switchForgeNeoImg2imgMode(mode) {
        const ids = {
            img2img: "forge_neo_img2img_mode_img2img-button",
            sketch: "forge_neo_img2img_mode_sketch-button",
            inpaint: "forge_neo_img2img_mode_inpaint-button",
            inpaint_sketch: "forge_neo_img2img_mode_inpaint_sketch-button",
            inpaint_upload: "forge_neo_img2img_mode_inpaint_upload-button",
            batch: "forge_neo_img2img_mode_batch-button"
        };
        if (clickById(ids[mode] || ids.img2img)) {
            setImg2imgMode(mode || "img2img");
            scheduleForgeCanvasInit();
            return true;
        }
        return false;
    }

    function canvasCopyTargetForClick(target) {
        const button = target.closest("[id^='forge_neo_img2img_copy_to_']");
        if (!button || button.hasAttribute("disabled")) return null;
        const match = (button.id || "").match(/^forge_neo_img2img_copy_to_(.+)_from_/);
        return match ? match[1] : null;
    }

    function scheduleCanvasCopyTargetSwitch(mode) {
        if (!mode) return;
        [80, 850].forEach(function (delay) {
            window.setTimeout(function () {
                switchForgeNeoImg2imgMode(mode);
                syncImg2imgMode();
            }, delay);
        });
    }

    function sendTargetForClick(target) {
        const button = target.closest(
            [
                "#forge_neo_txt2img_send_to_img2img",
                "#forge_neo_txt2img_send_to_inpaint",
                "#forge_neo_txt2img_send_to_extras",
                "#forge_neo_txt2img_send_to_storyboard",
                "#forge_neo_img2img_send_to_img2img",
                "#forge_neo_img2img_send_to_inpaint",
                "#forge_neo_img2img_send_to_extras",
                "#forge_neo_img2img_send_to_storyboard",
                "#forge_neo_extras_send_to_img2img",
                "#forge_neo_extras_send_to_inpaint",
                "#forge_neo_extras_send_to_extras",
                "#forge_neo_txt2img_upscale",
                "#forge_neo_pnginfo_send_to_txt2img",
                "#forge_neo_pnginfo_send_to_img2img",
                "#forge_neo_pnginfo_send_to_inpaint",
                "#forge_neo_pnginfo_send_to_extras"
            ].join(", ")
        );
        if (!button) return null;
        const id = button.id || "";
        if (id.endsWith("_send_to_txt2img")) return { tab: "txt2img" };
        if (id.endsWith("_send_to_img2img")) return { tab: "img2img", mode: "img2img" };
        if (id.endsWith("_send_to_inpaint")) return { tab: "img2img", mode: "inpaint" };
        if (id.endsWith("_send_to_extras")) return { tab: "extras" };
        if (id.endsWith("_upscale")) return { tab: "extras" };
        return null;
    }

    function switchToSendTarget(target) {
        if (!target) return;
        switchForgeNeoTab(target.tab);
        if (target.tab === "img2img") {
            window.setTimeout(function () {
                switchForgeNeoImg2imgMode(target.mode || "img2img");
                syncImg2imgMode();
            }, 80);
        }
    }

    function scheduleSendTargetSwitch(target) {
        if (!target) return;
        window.setTimeout(function () {
            switchToSendTarget(target);
        }, 80);
        window.setTimeout(function () {
            switchToSendTarget(target);
        }, 850);
    }

    function progressUrl(idLivePreview) {
        const root = (window.gradio_config && window.gradio_config.root) || "";
        const prefix = root && root !== "/" ? root.replace(/\/$/, "") : "";
        const params = new URLSearchParams();
        if (Number.isFinite(Number(idLivePreview)) && Number(idLivePreview) >= 0) {
            params.set("id_live_preview", String(Math.round(Number(idLivePreview))));
        }
        const query = params.toString();
        return prefix + "/forge-neo/api/progress" + (query ? "?" + query : "");
    }

    function progressImageSource(payload) {
        const value = (payload && (payload.live_preview || payload.current_image)) || "";
        if (!value) return "";
        const text = String(value);
        if (text.startsWith("data:image/")) return text;
        if (text.startsWith("/9j/")) return "data:image/jpeg;base64," + text;
        if (text.startsWith("UklGR")) return "data:image/webp;base64," + text;
        if (text.startsWith("R0lG")) return "data:image/gif;base64," + text;
        return "data:image/png;base64," + text;
    }

    function formatEta(seconds) {
        const value = Math.max(0, Math.round(Number(seconds || 0)));
        if (!value) return "";
        if (value < 60) return " ETA: " + value + "s";
        return " ETA: " + Math.floor(value / 60) + "m " + String(value % 60).padStart(2, "0") + "s";
    }

    function progressTextInfo(payload) {
        if (!payload) return "";
        const en = String(payload.textinfo_en || "");
        const cn = String(payload.textinfo_cn || "");
        if (en || cn) return t(en || cn, cn || en);
        return String(payload.textinfo || "");
    }

    function progressLabel(payload) {
        const state = payload && payload.state ? payload.state : {};
        const status = String(state.status || "").toLowerCase();
        if (status === "running") {
            const progress = Math.max(0, Math.min(1, Number((payload && payload.progress) || 0)));
            if (progress > 0) {
                const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
                return percent + "%" + formatEta(payload && payload.eta_relative);
            }
            return progressTextInfo(payload) || t("Waiting...", "等待中...");
        }
        if (status === "stopped" || state.interrupted || state.stopping_generation) {
            return t("Stopped.", "已停止。");
        }
        if (status === "skipped" || state.skipped) {
            return t("Skipped.", "已跳过。");
        }
        if (status === "finished" || status === "backend_pending") {
            return t("Finished.", "已完成。");
        }
        return t("Ready.", "就绪。");
    }

    let activeProgressGalleryId = "";
    let activeProgressElements = null;
    let activeLivePreviewId = -1;
    let progressStartedAt = 0;
    let progressPollIntervalMs = 900;
    let progressCompletionWatchTimer = null;
    let progressOutputBaseline = null;
    let lastProgressStatus = "idle";
    let activeProgressGenerateId = "";
    const progressStartGraceMs = 180000;

    function progressGenerateIdForTrigger(trigger) {
        const root = trigger && trigger.closest ? trigger.closest("#forge_neo_generate, #forge_neo_img2img_generate, #forge_neo_extras_generate") : null;
        return root ? root.id : "";
    }

    function progressGalleryIdForTrigger(trigger) {
        const root = trigger && trigger.closest ? trigger.closest("#forge_neo_generate, #forge_neo_img2img_generate, #forge_neo_extras_generate") : null;
        if (!root) return "";
        if (root.id === "forge_neo_img2img_generate") return "forge_neo_img2img_gallery";
        if (root.id === "forge_neo_extras_generate") return "forge_neo_extras_gallery";
        return "forge_neo_gallery";
    }

    function visibleProgressGalleryId() {
        const candidates = ["forge_neo_gallery", "forge_neo_img2img_gallery", "forge_neo_extras_gallery"];
        for (const id of candidates) {
            const gallery = document.getElementById(id);
            if (isVisibleElement(gallery)) return id;
        }
        return "forge_neo_gallery";
    }

    function setGenerateBoxesRunning(running) {
        const targetId = activeProgressGenerateId;
        document.querySelectorAll("#forge_neo_generate, #forge_neo_img2img_generate, #forge_neo_extras_generate").forEach(function (root) {
            const box = root.closest(".forge-neo-generate-box");
            const isActive = Boolean(running) && (!targetId || root.id === targetId);
            if (box) box.classList.toggle("is-running", isActive);
        });
    }

    function clearGalleryProgress(options) {
        const keepGenerateRunning = Boolean(options && options.keepGenerateRunning);
        if (activeProgressElements) {
            const elements = activeProgressElements;
            if (elements.wrapper && elements.wrapper.parentNode) elements.wrapper.parentNode.removeChild(elements.wrapper);
            if (elements.livePreview && elements.livePreview.parentNode) elements.livePreview.parentNode.removeChild(elements.livePreview);
        }
        ["forge_neo_gallery", "forge_neo_img2img_gallery", "forge_neo_extras_gallery"].forEach(function (id) {
            const gallery = document.getElementById(id);
            if (!gallery) return;
            if (gallery.parentNode) {
                gallery.parentNode.classList.remove("progress-container");
                gallery.parentNode.querySelectorAll(":scope > .progressDiv").forEach(function (node) {
                    node.remove();
                });
            }
            gallery.querySelectorAll(":scope > .livePreview").forEach(function (node) {
                node.remove();
            });
        });
        activeProgressElements = null;
        activeProgressGalleryId = "";
        activeLivePreviewId = -1;
        progressOutputBaseline = null;
        if (!keepGenerateRunning) {
            setGenerateBoxesRunning(false);
            activeProgressGenerateId = "";
        }
    }

    function outputImageSignature(image) {
        if (!image || image.closest(".livePreview")) return "";
        if (Number(image.naturalWidth || 0) <= 0 || Number(image.naturalHeight || 0) <= 0) return "";
        const source = String(image.currentSrc || image.src || "");
        return [
            image.naturalWidth,
            image.naturalHeight,
            source.length,
            source.slice(0, 96),
            source.slice(-96),
        ].join("|");
    }

    function outputGallerySignature(gallery) {
        if (!gallery) return "";
        return Array.from(gallery.querySelectorAll("img"))
            .map(outputImageSignature)
            .filter(Boolean)
            .join("||");
    }

    function outputGalleryHasImage(gallery) {
        if (!gallery) return false;
        return Array.from(gallery.querySelectorAll("img")).some(function (image) {
            return Boolean(outputImageSignature(image));
        });
    }

    function infotextIdForGalleryId(galleryId) {
        if (galleryId === "forge_neo_img2img_gallery") return "forge_neo_img2img_infotext";
        if (galleryId === "forge_neo_extras_gallery") return "forge_neo_extras_infotext";
        return "forge_neo_infotext";
    }

    function captureProgressOutputState(galleryId) {
        const id = galleryId || visibleProgressGalleryId();
        const gallery = document.getElementById(id);
        const infotext = document.getElementById(infotextIdForGalleryId(id));
        return {
            galleryId: id,
            imageSignature: outputGallerySignature(gallery),
            infotext: infotext ? String(infotext.textContent || "").trim() : "",
        };
    }

    function outputChangedSinceProgressStart(galleryId) {
        const current = captureProgressOutputState(galleryId || activeProgressGalleryId || visibleProgressGalleryId());
        const baseline = progressOutputBaseline || { imageSignature: "", infotext: "" };
        if (current.imageSignature && current.imageSignature !== baseline.imageSignature) return true;
        if (current.infotext && current.infotext !== baseline.infotext) return true;
        return false;
    }

    function clearProgressAfterOutputUpdate() {
        if (!activeProgressGalleryId) return;
        if (!outputChangedSinceProgressStart(activeProgressGalleryId)) return;
        window.setTimeout(pollProgress, 0);
        if (lastProgressStatus === "running") return;
        clearGalleryProgress();
        stopProgressCompletionWatch();
    }

    function scheduleProgressOutputCleanup() {
        window.setTimeout(clearProgressAfterOutputUpdate, 0);
        window.setTimeout(clearProgressAfterOutputUpdate, 250);
        window.setTimeout(clearProgressAfterOutputUpdate, 900);
    }

    function stopProgressCompletionWatch() {
        if (!progressCompletionWatchTimer) return;
        window.clearInterval(progressCompletionWatchTimer);
        progressCompletionWatchTimer = null;
    }

    function ensureProgressCompletionWatch() {
        if (progressCompletionWatchTimer) return;
        progressCompletionWatchTimer = window.setInterval(function () {
            if (!activeProgressGalleryId) {
                stopProgressCompletionWatch();
                return;
            }
            pollProgress();
        }, Math.max(500, progressPollIntervalMs));
    }

    function ensureGalleryProgress(galleryId) {
        const id = galleryId || activeProgressGalleryId || visibleProgressGalleryId();
        const gallery = document.getElementById(id);
        if (!gallery || !gallery.parentNode) return null;
        if (activeProgressElements && activeProgressElements.galleryId === id && activeProgressElements.wrapper && activeProgressElements.wrapper.isConnected) {
            return activeProgressElements;
        }
        clearGalleryProgress({ keepGenerateRunning: true });

        gallery.parentNode.classList.add("progress-container");

        const wrapper = document.createElement("div");
        wrapper.className = "progressDiv";
        wrapper.setAttribute("data-status", "running");
        const fill = document.createElement("div");
        fill.className = "progress";
        wrapper.appendChild(fill);
        gallery.parentNode.insertBefore(wrapper, gallery);

        const livePreview = document.createElement("div");
        livePreview.className = "livePreview";
        livePreview.style.display = "none";
        const previewPlaceholder = document.createElement("span");
        previewPlaceholder.className = "forge-neo-preview-pending";
        previewPlaceholder.textContent = t("Generating image...", "正在生成图像…");
        livePreview.appendChild(previewPlaceholder);
        gallery.insertBefore(livePreview, gallery.firstElementChild);

        activeProgressGalleryId = id;
        activeLivePreviewId = -1;
        activeProgressElements = { galleryId: id, wrapper: wrapper, fill: fill, text: fill, livePreview: livePreview, previewPlaceholder: previewPlaceholder };
        return activeProgressElements;
    }

    function progressStatus(payload) {
        const state = payload && payload.state ? payload.state : {};
        return String(state.status || "idle").toLowerCase();
    }

    function progressPayloadForDisplay(payload) {
        const status = progressStatus(payload || {});
        if (status === "idle" && activeProgressGalleryId && Date.now() - progressStartedAt < progressStartGraceMs) {
            return { progress: 0, state: { status: "running" }, textinfo: t("Waiting...", "等待中..."), textinfo_en: "Waiting...", textinfo_cn: "等待中..." };
        }
        return payload || {};
    }

    function progressRefreshPeriod(payload) {
        const raw = Number(payload && payload.live_preview_refresh_period);
        if (!Number.isFinite(raw) || raw <= 0) return progressPollIntervalMs;
        return Math.max(100, Math.min(5000, Math.round(raw)));
    }

    function syncProgressPollingPeriod(payload) {
        const nextInterval = progressRefreshPeriod(payload || {});
        if (nextInterval === progressPollIntervalMs) return;
        progressPollIntervalMs = nextInterval;
        if (progressTimer) {
            window.clearInterval(progressTimer);
            progressTimer = window.setInterval(pollProgress, progressPollIntervalMs);
        }
    }

    function syncGenerateBoxes(payload) {
        const state = payload && payload.state ? payload.state : {};
        const running = String(state.status || "").toLowerCase() === "running";
        setGenerateBoxesRunning(running);
    }

    function renderProgress(payload) {
        const displayPayload = progressPayloadForDisplay(payload);
        const status = progressStatus(displayPayload);
        lastProgressStatus = status;
        const running = status === "running";
        const progress = Math.max(0, Math.min(1, Number((displayPayload && displayPayload.progress) || 0)));
        const label = progressLabel(displayPayload || {});
        syncGenerateBoxes(displayPayload || {});
        if (!running) {
            clearGalleryProgress();
            stopProgressCompletionWatch();
            return;
        }
        const elements = ensureGalleryProgress(activeProgressGalleryId || visibleProgressGalleryId());
        if (!elements) return;
        if (elements.fill) elements.fill.style.width = Math.round(progress * 100) + "%";
        if (elements.text) elements.text.textContent = label;
        if (elements.wrapper) elements.wrapper.setAttribute("data-status", status);
        const imageSource = progressImageSource(displayPayload || {});
        const previewId = Number((displayPayload && displayPayload.id_live_preview) || 0);
        if (elements.livePreview) {
            elements.livePreview.style.display = "flex";
            if (elements.previewPlaceholder) {
                elements.previewPlaceholder.style.display = elements.livePreview.querySelector("img") ? "none" : "";
            }
        }
        if (imageSource && elements.livePreview && previewId !== activeLivePreviewId) {
            const image = new Image();
            image.alt = "Live preview";
            image.onload = function () {
                if (!elements.livePreview || !elements.livePreview.isConnected) return;
                elements.livePreview.style.display = "flex";
                if (elements.previewPlaceholder) elements.previewPlaceholder.style.display = "none";
                elements.livePreview.appendChild(image);
                const previewImages = elements.livePreview.querySelectorAll("img");
                for (let index = 0; index < previewImages.length - 2; index += 1) {
                    previewImages[index].remove();
                }
            };
            image.src = imageSource;
            activeLivePreviewId = previewId;
        }
    }

    let progressTimer = null;
    let progressBusy = false;

    async function pollProgress() {
        if (progressBusy) return;
        progressBusy = true;
        try {
            const response = await fetch(progressUrl(activeLivePreviewId), { cache: "no-store" });
            if (response.ok) {
                const payload = await response.json();
                syncProgressPollingPeriod(payload);
                renderProgress(payload);
                const status = progressStatus(progressPayloadForDisplay(payload));
                if (status !== "running" && progressTimer) {
                    window.clearInterval(progressTimer);
                    progressTimer = null;
                }
            }
        } catch (error) {
            renderProgress({ progress: 0, state: { status: "idle" }, textinfo: "" });
            if (progressTimer) {
                window.clearInterval(progressTimer);
                progressTimer = null;
            }
        } finally {
            progressBusy = false;
        }
    }

    function ensureProgressPolling() {
        if (progressTimer) return;
        progressTimer = window.setInterval(pollProgress, progressPollIntervalMs);
        pollProgress();
    }

    function markProgressStarting(trigger) {
        activeProgressGenerateId = progressGenerateIdForTrigger(trigger);
        activeProgressGalleryId = progressGalleryIdForTrigger(trigger) || visibleProgressGalleryId();
        progressStartedAt = Date.now();
        ensureGalleryProgress(activeProgressGalleryId);
        progressOutputBaseline = captureProgressOutputState(activeProgressGalleryId);
        renderProgress({ progress: 0, state: { status: "running" }, textinfo: t("Waiting...", "等待中..."), textinfo_en: "Waiting...", textinfo_cn: "等待中..." });
        ensureProgressPolling();
        ensureProgressCompletionWatch();
        window.setTimeout(pollProgress, 120);
        window.setTimeout(pollProgress, 900);
        window.setTimeout(pollProgress, 1800);
        window.setTimeout(pollProgress, 3200);
        window.setTimeout(scheduleProgressOutputCleanup, 5000);
        window.setTimeout(scheduleProgressOutputCleanup, 12000);
    }

    document.addEventListener("click", function (event) {
        if (!event.target.closest("#context-menu.forge-neo-context-menu")) {
            removeForgeNeoContextMenu();
        }
        const modeButton = event.target.closest("#forge_neo_img2img_mode_tabs button[role='tab']");
        const batchButton = event.target.closest("#forge_neo_img2img_batch_source button[role='tab']");
        const controlnetTabButton = event.target.closest(".forge-neo-controlnet-tabs button[role='tab']");
        const integratedAccordion = event.target.closest(".forge-neo-integrated-accordion .label-wrap");
        if (modeButton || batchButton) {
            window.setTimeout(syncImg2imgMode, 0);
        }
        if (modeButton || controlnetTabButton || integratedAccordion) {
            scheduleForgeCanvasInit();
        }
        const generateTrigger = event.target.closest("#forge_neo_generate, #forge_neo_img2img_generate, #forge_neo_extras_generate");
        if (generateTrigger) {
            markProgressStarting(generateTrigger);
        }
        if (event.target.closest("#forge_neo_stop, #forge_neo_img2img_stop, #forge_neo_extras_stop, #forge_neo_skip, #forge_neo_img2img_skip, #forge_neo_extras_skip")) {
            window.setTimeout(pollProgress, 160);
        }
        if (event.target.closest("#forge_neo_settings_licenses-button")) {
            window.setTimeout(populateForgeNeoLicenses, 120);
            window.setTimeout(populateForgeNeoLicenses, 900);
        }
        const topTabButton = event.target.closest("#forge_neo_tabs > .tab-wrapper button");
        const topTabText = topTabButton ? normalizedSettingsText(topTabButton.textContent) : "";
        if (topTabButton && (topTabText === "Settings" || topTabText === "设置")) {
            window.requestAnimationFrame(syncSettingsNavGroups);
            window.setTimeout(syncSettingsNavGroups, 60);
            window.setTimeout(syncSettingsNavGroups, 180);
        }
        const extraNetworkTool = event.target.closest(".forge-neo-extra-card-tool[data-extra-action]");
        if (extraNetworkTool && handleExtraNetworkCardTool(extraNetworkTool)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const extraNetworkToolbarButton = event.target.closest(".forge-neo-extra-sort-tools button");
        if (extraNetworkToolbarButton && handleExtraNetworkToolbarButton(extraNetworkToolbarButton)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const extraNetworkDir = event.target.closest(".forge-neo-extra-dir[data-dir]");
        if (extraNetworkDir && handleExtraNetworkDirButton(extraNetworkDir)) {
            event.preventDefault();
            return;
        }
        const extraNetworkCard = event.target.closest(".forge-neo-extra-card[data-kind][data-name]");
        if (extraNetworkCard && handleExtraNetworkCard(extraNetworkCard)) {
            event.preventDefault();
            return;
        }
        if (event.target.closest(".forge-neo-integrated-accordion[id$='_controlnet'] input[type='checkbox']")) {
            window.setTimeout(syncControlNetUnitBadges, 0);
            scheduleControlNetPixelPerfectSync();
        }
        if (event.target.closest("[id$='controlnet_module'], [id*='controlnet_unit_'][id$='_module']")) {
            scheduleControlNetPixelPerfectSync();
        }
        scheduleCanvasCopyTargetSwitch(canvasCopyTargetForClick(event.target));
        scheduleSendTargetSwitch(sendTargetForClick(event.target));
    });

    document.addEventListener("contextmenu", openForgeNeoGenerateContextMenu, true);

    document.addEventListener("change", function (event) {
        const master = event.target.closest(".forge-neo-extension-master-toggle");
        if (master) {
            setExtensionTogglesFromMaster(master);
            return;
        }
        if (event.target.closest(".forge-neo-extension-toggle")) {
            syncExtensionMasterToggle(event.target.closest("#forge_neo_extensions_installed_table"));
        }
    });

    const progressCleanupObserver = new MutationObserver(function (mutations) {
        if (!activeProgressGalleryId) return;
        const shouldCheck = mutations.some(function (mutation) {
            const target = mutation.target;
            const element = target instanceof Element ? target : target.parentElement;
            if (!element) return false;
            if (element.closest(".livePreview")) return false;
            return element.closest("#forge_neo_gallery, #forge_neo_img2img_gallery, #forge_neo_extras_gallery, #forge_neo_infotext, #forge_neo_img2img_infotext, #forge_neo_extras_infotext");
        });
        if (shouldCheck) scheduleProgressOutputCleanup();
    });

    function boot() {
        localizeControlledTexts();
        syncSettingsNavGroups();
        syncImg2imgMode();
        syncPromptCounters();
        scheduleForgeCanvasInit();
        syncControlNetUnitBadges();
        syncControlNetPixelPerfectProcessor();
        syncExtensionMasterToggle();
        renderProgress({ progress: 0, state: { status: "idle" }, textinfo: "" });
        ensureProgressPolling();
        populateForgeNeoLicenses();
        decorateExtraNetworkBrowsers();
        initStyleEditorModals();
        restoreForgeNeoPresetFromBrowser();
        if (document.body && !document.body.dataset.forgeNeoProgressCleanupObserver) {
            document.body.dataset.forgeNeoProgressCleanupObserver = "1";
            progressCleanupObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
        }
    }

    document.addEventListener("DOMContentLoaded", boot);
    document.addEventListener("gradio:loaded", boot);
    window.setInterval(localizeControlledTexts, 1200);
    window.setInterval(syncSettingsNavGroups, 1200);
    window.setInterval(syncPromptCounters, 1200);
    window.setInterval(initForgeCanvasWidgets, 1200);
    window.setInterval(syncControlNetUnitBadges, 1200);
    window.setInterval(syncControlNetPixelPerfectProcessor, 1200);
    window.setInterval(syncExtensionMasterToggle, 1200);
    window.setInterval(decorateExtraNetworkBrowsers, 1200);
    window.setInterval(initStyleEditorModals, 1200);
    window.setInterval(populateForgeNeoLicenses, 1800);
    window.forgeNeoRequestNotifications = requestNotifications;
    window.forgeNeoExtensionsApply = collectExtensionApplyInputs;
    window.forgeNeoInstallExtensionFromIndex = installExtensionFromIndex;
    window.forgeNeoRequestReload = requestReloadUi;
    window.forgeNeoSetLanguage = setForgeNeoLanguage;
    window.forgeNeoRememberPreset = rememberForgeNeoPreset;
    window.forgeNeoShowProfile = showProfile;
    window.forgeNeoFooterReload = footerReload;
})();
