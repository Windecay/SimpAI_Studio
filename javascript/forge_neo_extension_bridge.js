(function () {
  "use strict";

  const callbacksLoaded = [];
  const callbacksUpdate = [];
  let loadedFired = false;
  let loadedCheckTimer = 0;
  const compatIds = [
    "txt2img_token_counter",
    "txt2img_negative_token_counter",
    "img2img_token_counter",
    "img2img_negative_token_counter",
    "txt2img_token_button",
    "txt2img_negative_token_button",
    "img2img_token_button",
    "img2img_negative_token_button",
    "txt2img_style_apply",
    "img2img_style_apply",
    "txt2img_styles",
    "img2img_styles",
    "txt2img_tools",
    "img2img_tools",
    "quicksettings",
    "settings"
  ];

  const idAliases = {
    txt2img_prompt: "forge_neo_prompt",
    txt2img_neg_prompt: "forge_neo_negative_prompt",
    img2img_prompt: "forge_neo_img2img_prompt",
    img2img_neg_prompt: "forge_neo_img2img_negative_prompt",
    txt2img_steps: "forge_neo_steps",
    img2img_steps: "forge_neo_img2img_steps",
    txt2img_generate: "forge_neo_generate",
    img2img_generate: "forge_neo_img2img_generate"
  };

  const lazyPromptCompat = {
    forge_neo_img2img_prompt: {
      compatId: "forge_neo_img2img_prompt_compat",
      toolbarId: "phystonPrompt_img2img_prompt"
    },
    forge_neo_img2img_negative_prompt: {
      compatId: "forge_neo_img2img_negative_prompt_compat",
      toolbarId: "phystonPrompt_img2img_neg_prompt"
    }
  };

  const lazyStepCompat = {
    forge_neo_img2img_steps: "forge_neo_img2img_steps_compat"
  };

  const promptToolbarTargets = {
    phystonPrompt_txt2img_prompt: "forge_neo_prompt",
    phystonPrompt_txt2img_neg_prompt: "forge_neo_negative_prompt",
    phystonPrompt_img2img_prompt: "forge_neo_img2img_prompt",
    phystonPrompt_img2img_neg_prompt: "forge_neo_img2img_negative_prompt"
  };

  const promptTranslateActionLabels = [
    "一键翻译所有关键词",
    "翻译关键词到本地语言",
    "翻译所有关键词到英文",
    "翻译为英文",
    "one translate all keywords",
    "translate keywords to local language",
    "translate all keywords to english",
    "translate keyword to english"
  ];

  const selectorAliases = Object.entries(idAliases).map(([from, to]) => {
    return [new RegExp(`#${from}(?=$|[\\s,>+~.#:\\[]|\\))`, "g"), `#${to}`];
  });

  const keymap = {
    Enter: "ChooseSelected",
    ArrowUp: "NavigateUp",
    ArrowDown: "NavigateDown",
    ArrowLeft: "NavigateLeft",
    ArrowRight: "NavigateRight",
    PageUp: "NavigateFirst",
    PageDown: "NavigateLast",
    Escape: "Close",
    Tab: "ChooseSelected"
  };

  const colorMap = {
    danbooru: {
      "-1": ["#ef4444", "#7f1d1d"],
      "0": ["#93c5fd", "#1d4ed8"],
      "1": ["#fca5a5", "#b91c1c"],
      "3": ["#d8b4fe", "#7e22ce"],
      "4": ["#86efac", "#15803d"],
      "5": ["#fdba74", "#c2410c"]
    }
  };

  const tacDefaults = {
    tac_tagFile: "danbooru.csv",
    tac_active: true,
    "tac_activeIn.txt2img": true,
    "tac_activeIn.img2img": true,
    "tac_activeIn.negativePrompts": true,
    "tac_activeIn.thirdParty": true,
    "tac_activeIn.modelList": "",
    "tac_activeIn.modelListMode": "Blacklist",
    tac_slidingPopup: true,
    tac_maxResults: 5,
    tac_showAllResults: false,
    tac_resultStepLength: 100,
    tac_delayTime: 100,
    tac_useIndexedSearch: true,
    tac_useWildcards: true,
    tac_sortWildcardResults: true,
    tac_wildcardExclusionList: "",
    tac_skipWildcardRefresh: false,
    tac_useEmbeddings: true,
    tac_forceRefreshEmbeddings: false,
    tac_includeEmbeddingsInNormalResults: false,
    tac_useLoras: true,
    tac_useLycos: true,
    tac_useLoraPrefixForLycos: true,
    tac_showWikiLinks: false,
    tac_showExtraNetworkPreviews: false,
    tac_modelSortOrder: "Name",
    tac_useStyleVars: false,
    tac_frequencySort: true,
    tac_frequencyFunction: "Logarithmic (weak)",
    tac_frequencyMinCount: 3,
    tac_frequencyMaxAge: 30,
    tac_frequencyRecommendCap: 10,
    tac_frequencyIncludeAlias: false,
    tac_replaceUnderscores: true,
    tac_undersocreReplacementExclusionList: "0_0,(o)_(o),+_+,+_-,._.,<o>_<o>,<|>_<|>,=_=,>_<,3_3,6_9,>_o,@_@,^_^,o_o,u_u,x_x,|_|,||_||",
    tac_escapeParentheses: true,
    tac_appendComma: true,
    tac_appendSpace: true,
    tac_alwaysSpaceAtEnd: true,
    tac_modelKeywordCompletion: "Never",
    tac_modelKeywordLocation: "Start of prompt",
    tac_modelKeywordCivitai: false,
    tac_civitaiApiKey: "",
    tac_wildcardCompletionMode: "To next folder level",
    "tac_alias.searchByAlias": true,
    "tac_alias.onlyShowAlias": false,
    "tac_translation.translationFile": "None",
    "tac_translation.oldFormat": false,
    "tac_translation.searchByTranslation": false,
    "tac_translation.liveTranslation": false,
    "tac_extra.extraFile": "None",
    "tac_extra.addMode": "Insert before",
    tac_chantFile: "None",
    tac_keymap: JSON.stringify(keymap),
    tac_colormap: JSON.stringify(colorMap),
    extra_networks_default_multiplier: 1,
    extra_networks_add_text_separator: " "
  };

  window.opts = Object.assign({}, tacDefaults, window.opts || {});
  window.gradio_config = window.gradio_config || {};

  function idSelector(id) {
    const text = String(id || "");
    if (window.CSS && typeof window.CSS.escape === "function") {
      return `#${window.CSS.escape(text)}`;
    }
    return `#${text.replace(/([ !"#$%&'()*+,./:;<=>?@[\]\\^`{|}~])/g, "\\$1")}`;
  }

  function shadowRoot() {
    const app = document.getElementsByTagName("gradio-app")[0];
    return app && app.shadowRoot ? app.shadowRoot : null;
  }

  function findElementById(id) {
    const found = nativeGetElementById(id);
    if (found) return found;
    const shadow = shadowRoot();
    return shadow ? shadow.querySelector(idSelector(id)) : null;
  }

  function compatElementForId(id) {
    const promptInfo = lazyPromptCompat[id];
    if (promptInfo) return nativeGetElementById(promptInfo.compatId);
    const stepId = lazyStepCompat[id];
    if (stepId) return nativeGetElementById(stepId);
    return null;
  }

  function compatElementForSelector(selector) {
    const text = String(selector || "").trim();
    for (const id of Object.keys(lazyPromptCompat)) {
      if (text === idSelector(id) || text === `#${id}`) return compatElementForId(id);
    }
    for (const id of Object.keys(lazyStepCompat)) {
      if (text === idSelector(id) || text === `#${id}`) return compatElementForId(id);
    }
    return null;
  }

  function ensureLegacyTabs(container) {
    if (!container || container.querySelector(idSelector("tabs"))) return;
    const tabs = document.createElement("div");
    tabs.id = "tabs";
    tabs.hidden = true;
    tabs.setAttribute("data-forge-neo-extension-compat", "1");
    container.appendChild(tabs);
  }

  function gradioContainer() {
    const shadow = shadowRoot();
    if (shadow) {
      const containers = shadow.querySelectorAll(".gradio-container");
      for (let index = 0; index < containers.length; index += 1) {
        if (containers[index].querySelector(idSelector("tabs"))) {
          return containers[index];
        }
      }
      if (containers.length) {
        ensureLegacyTabs(containers[0]);
        return containers[0];
      }
    }
    return document.body;
  }

  function appRoot() {
    return gradioContainer() || document.querySelector("gradio-app") || document.body;
  }

  function mapSelector(selector) {
    let mapped = String(selector || "");
    selectorAliases.forEach(([from, to]) => {
      mapped = mapped.replace(from, to);
    });
    return mapped;
  }

  function ensureCompatControls() {
    const root = appRoot();
    let holder = document.getElementById("forge_neo_extension_compat_runtime");
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "forge_neo_extension_compat_runtime";
      holder.className = "forge-neo-extension-compat-runtime";
      root.appendChild(holder);
    }
    compatIds.forEach((id) => {
      if (document.getElementById(id)) return;
      const node = document.createElement("div");
      node.id = id;
      node.setAttribute("data-forge-neo-extension-compat", "1");
      holder.appendChild(node);
    });
    if (!document.getElementById("sd_checkpoint_hash")) {
      const node = document.createElement("div");
      node.id = "sd_checkpoint_hash";
      node.title = "";
      holder.appendChild(node);
    }
    Object.values(lazyPromptCompat).forEach((info) => {
      if (nativeGetElementById(info.compatId)) return;
      const outer = document.createElement("div");
      outer.hidden = true;
      outer.setAttribute("data-forge-neo-extension-compat", "1");
      const middle = document.createElement("div");
      const prompt = document.createElement("div");
      const textarea = document.createElement("textarea");
      prompt.id = info.compatId;
      prompt.setAttribute("data-forge-neo-extension-compat", "1");
      prompt.appendChild(textarea);
      middle.appendChild(prompt);
      outer.appendChild(middle);
      holder.appendChild(outer);
    });
    Object.values(lazyStepCompat).forEach((compatId) => {
      if (nativeGetElementById(compatId)) return;
      const outer = document.createElement("div");
      outer.hidden = true;
      outer.setAttribute("data-forge-neo-extension-compat", "1");
      const middle = document.createElement("div");
      const steps = document.createElement("div");
      const input = document.createElement("input");
      steps.id = compatId;
      input.type = "number";
      input.value = "20";
      steps.appendChild(input);
      middle.appendChild(steps);
      outer.appendChild(middle);
      holder.appendChild(outer);
    });
  }

  function patchQuery(root) {
    if (!root || root.__forgeNeoExtensionBridgePatched) return;
    const nativeQuery = root.querySelector.bind(root);
    const nativeAll = root.querySelectorAll.bind(root);
    root.querySelector = function (selector) {
      const mapped = mapSelector(selector);
      return nativeQuery(mapped) || compatElementForSelector(mapped);
    };
    root.querySelectorAll = function (selector) {
      return nativeAll(mapSelector(selector));
    };
    root.getElementById = function (id) {
      const mapped = idAliases[id] || id;
      return nativeQuery(idSelector(mapped)) || nativeQuery(idSelector(id)) || compatElementForId(mapped) || compatElementForId(id);
    };
    root.__forgeNeoExtensionBridgePatched = true;
  }

  const nativeGetElementById = document.getElementById.bind(document);
  document.getElementById = function (id) {
    const mapped = idAliases[id] || id;
    return findElementById(mapped) || findElementById(id) || compatElementForId(mapped) || compatElementForId(id);
  };

  function promptControlsReady() {
    return Boolean(
      document.getElementById("txt2img_prompt") &&
        document.getElementById("txt2img_neg_prompt") &&
        document.getElementById("img2img_prompt") &&
        document.getElementById("img2img_neg_prompt")
    );
  }

  function textareaFor(node) {
    return node ? node.getElementsByTagName("textarea")[0] : null;
  }

  function inputEvent() {
    return new Event("input", { bubbles: true });
  }

  function changeEvent() {
    return new Event("change", { bubbles: true });
  }

  function setNativeValue(element, value) {
    if (!element) return;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : Object.getPrototypeOf(element);
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
      return;
    }
    element.value = value;
  }

  function dispatchInputValue(element) {
    if (!element) return;
    const event = inputEvent();
    try {
      Object.defineProperty(event, "target", { value: element });
    } catch (_) {
      // Some browsers expose target as read-only only after dispatch.
    }
    element.dispatchEvent(event);
  }

  function dispatchChangeValue(element) {
    if (!element) return;
    const event = changeEvent();
    try {
      Object.defineProperty(event, "target", { value: element });
    } catch (_) {
      // Some browsers expose target as read-only only after dispatch.
    }
    element.dispatchEvent(event);
  }

  function syncTextareaValue(target, value, source) {
    if (!target || target.__forgeNeoSyncingTextarea || target.value === value) return;
    target.__forgeNeoSyncingTextarea = source || true;
    setNativeValue(target, value);
    dispatchInputValue(target);
    window.setTimeout(() => {
      if (target.__forgeNeoSyncingTextarea === source || target.__forgeNeoSyncingTextarea === true) {
        target.__forgeNeoSyncingTextarea = "";
      }
    }, 0);
  }

  function syncInitialTextareaValues(realTextarea, compatTextarea) {
    if (!realTextarea || !compatTextarea || realTextarea.value === compatTextarea.value) return;
    if (compatTextarea.value && !realTextarea.value) {
      syncTextareaValue(realTextarea, compatTextarea.value, "compat-initial");
      return;
    }
    syncTextareaValue(compatTextarea, realTextarea.value, "real-initial");
  }

  function bindTextareaSync(realTextarea, compatTextarea) {
    if (!realTextarea || !compatTextarea || compatTextarea.__forgeNeoSyncBound) return;
    const syncToReal = () => {
      if (compatTextarea.__forgeNeoSyncingTextarea || realTextarea.__forgeNeoComposing || compatTextarea.__forgeNeoComposing) return;
      syncTextareaValue(realTextarea, compatTextarea.value, "compat");
    };
    const syncToCompat = (event) => {
      if (realTextarea.__forgeNeoSyncingTextarea || realTextarea.__forgeNeoComposing || (event && event.isComposing)) return;
      syncTextareaValue(compatTextarea, realTextarea.value, "real");
    };
    realTextarea.addEventListener("compositionstart", () => { realTextarea.__forgeNeoComposing = true; });
    realTextarea.addEventListener("compositionend", () => {
      realTextarea.__forgeNeoComposing = false;
      queueMicrotask(syncToCompat);
    });
    realTextarea.addEventListener("input", (event) => {
      if (realTextarea.__forgeNeoComposing || event.isComposing) {
        event.stopImmediatePropagation();
      }
    }, true);
    realTextarea.addEventListener("keydown", (event) => {
      if (!realTextarea.__forgeNeoComposing && !event.isComposing && event.keyCode !== 229) return;
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp" || event.keyCode === 229) {
        event.stopImmediatePropagation();
      }
    }, true);
    compatTextarea.addEventListener("input", syncToReal);
    compatTextarea.addEventListener("change", syncToReal);
    realTextarea.addEventListener("input", syncToCompat);
    realTextarea.addEventListener("change", syncToCompat);
    realTextarea.__forgeNeoPromptBridgePeer = compatTextarea;
    compatTextarea.__forgeNeoPromptBridgePeer = realTextarea;
    compatTextarea.__forgeNeoSyncBound = true;
    queueMicrotask(() => syncInitialTextareaValues(realTextarea, compatTextarea));
  }

  function trackPromptTextarea(textarea) {
    if (!textarea || textarea.__forgeNeoPromptTracked) return;
    const markDirty = (event) => {
      if (event && event.isTrusted === false) return;
      textarea.__forgeNeoPromptDirtyAt = Date.now();
      textarea.__forgeNeoPromptDirtyValue = textarea.value;
    };
    textarea.addEventListener("input", markDirty);
    textarea.addEventListener("change", markDirty);
    textarea.__forgeNeoPromptTracked = true;
  }

  function promptToolbarForAction(node) {
    return node ? node.closest("[data-forge-neo-prompt-toolbar]") : null;
  }

  function promptTextareaForToolbar(toolbar) {
    if (!toolbar || !toolbar.dataset || !toolbar.dataset.forgeNeoPromptToolbar) return null;
    return textareaFor(findElementById(toolbar.dataset.forgeNeoPromptToolbar));
  }

  function promptActionLabel(node) {
    const action = node ? node.closest("[data-tippy-content]") : null;
    return action ? String(action.getAttribute("data-tippy-content") || "").trim().toLowerCase() : "";
  }

  function isPromptTranslateAction(node) {
    const label = promptActionLabel(node);
    if (!label) return false;
    return promptTranslateActionLabels.some((item) => label === item || label.indexOf(item) === 0);
  }

  function promptTextareaNeedsFreshTags(textarea) {
    if (!textarea || !textarea.__forgeNeoPromptDirtyAt) return false;
    return textarea.__forgeNeoPromptDirtyValue === textarea.value;
  }

  function replayPromptAction(action) {
    if (!action) return;
    action.__forgeNeoPromptReplayClick = true;
    action.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  document.addEventListener(
    "click",
    (event) => {
      const action = event.target ? event.target.closest("[data-tippy-content]") : null;
      if (!action || action.__forgeNeoPromptReplayClick) {
        if (action) action.__forgeNeoPromptReplayClick = false;
        return;
      }
      const toolbar = promptToolbarForAction(action);
      if (!toolbar || !isPromptTranslateAction(action)) return;
      const textarea = promptTextareaForToolbar(toolbar);
      if (!promptTextareaNeedsFreshTags(textarea)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.updateInput(textarea);
      textarea.blur();
      if (typeof action.focus === "function") {
        action.focus({ preventScroll: true });
      }
      textarea.__forgeNeoPromptDirtyAt = 0;
      window.setTimeout(() => replayPromptAction(action), 1500);
    },
    true
  );

  function promptToolbarAnchor(realId) {
    const realPrompt = findElementById(realId);
    if (!realPrompt || realPrompt.closest(".forge-neo-extension-compat-runtime")) return null;
    return realPrompt.closest(".block") || realPrompt;
  }

  function markPromptToolbar(toolbar, realId) {
    if (!toolbar) return;
    toolbar.dataset.forgeNeoPromptToolbar = realId;
  }

  function restorePromptColumnLayout(anchor) {
    const column = anchor && anchor.closest(".forge-neo-left");
    if (!column) return;
    column.style.flexDirection = "column";
    column.style.alignItems = "stretch";
    column.style.minWidth = "0";
  }

  function movePromptToolbar(toolbarId, realId) {
    const toolbar = nativeGetElementById(toolbarId);
    const anchor = promptToolbarAnchor(realId);
    if (!toolbar || !anchor) return;
    markPromptToolbar(toolbar, realId);
    trackPromptTextarea(textareaFor(findElementById(realId)));
    restorePromptColumnLayout(anchor);
    if (toolbar.previousElementSibling !== anchor) {
      anchor.after(toolbar);
    }
  }

  function moveLazyPromptToolbar(realId, info) {
    const realPrompt = findElementById(realId);
    const compatPrompt = nativeGetElementById(info.compatId);
    if (!realPrompt || !compatPrompt) return;
    bindTextareaSync(textareaFor(realPrompt), textareaFor(compatPrompt));
    movePromptToolbar(info.toolbarId, realId);
  }

  function syncLazyPromptToolbars() {
    Object.entries(lazyPromptCompat).forEach(([realId, info]) => moveLazyPromptToolbar(realId, info));
  }

  function relocatePromptAllInOneToolbars() {
    Object.entries(promptToolbarTargets).forEach(([toolbarId, realId]) => movePromptToolbar(toolbarId, realId));
  }

  function scheduleLoadedCheck(delay = 100) {
    if (loadedFired || loadedCheckTimer) return;
    loadedCheckTimer = window.setTimeout(() => {
      loadedCheckTimer = 0;
      loaded();
    }, delay);
  }

  window.gradioApp = function () {
    ensureCompatControls();
    const root = appRoot();
    patchQuery(root);
    return root;
  };

  window.onUiLoaded = function (callback) {
    if (typeof callback !== "function") return;
    callbacksLoaded.push(callback);
    if (loadedFired) {
      queueMicrotask(callback);
      return;
    }
    if (document.readyState !== "loading") scheduleLoadedCheck(0);
  };

  window.onUiUpdate = function (callback) {
    if (typeof callback !== "function") return;
    callbacksUpdate.push(callback);
    if (document.readyState !== "loading") queueMicrotask(callback);
  };

  window.updateInput = function (element) {
    if (!element) return;
    const value = element.value;
    setNativeValue(element, value);
    if (element.__forgeNeoPromptBridgePeer) {
      syncTextareaValue(element.__forgeNeoPromptBridgePeer, value, "updateInput");
    }
    dispatchInputValue(element);
    dispatchChangeValue(element);
  };

  function fireCallbacks(callbacks) {
    callbacks.slice().forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error("[Forge Neo extension bridge]", error);
      }
    });
  }

  function tick() {
    ensureCompatControls();
    patchQuery(appRoot());
    syncLazyPromptToolbars();
    relocatePromptAllInOneToolbars();
    fireCallbacks(callbacksUpdate);
  }

  function loaded() {
    ensureCompatControls();
    patchQuery(appRoot());
    if (!promptControlsReady()) {
      scheduleLoadedCheck(300);
      return;
    }
    if (loadedFired) {
      tick();
      return;
    }
    loadedFired = true;
    fireCallbacks(callbacksLoaded);
    tick();
  }

  document.addEventListener("DOMContentLoaded", loaded, { once: true });
  window.addEventListener("load", loaded, { once: true });
  document.addEventListener("gradio:loaded", loaded);
  setInterval(tick, 1200);

  window.forgeNeoExtensionBridge = {
    mapSelector,
    aliases: idAliases,
    active: true
  };
})();
