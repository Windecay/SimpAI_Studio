(function (root, factory) {
    const api = factory(root);
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.SimpAIH3Director = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
    "use strict";
    const META = 14;
    const MODES = ["text", "first_frame", "first_last", "reference", "continue"];
    const LABELS = {
        text: ["Text to video", "\u6587\u751f\u89c6\u9891"],
        first_frame: ["First frame", "\u9996\u5e27\u56fe\u751f"],
        first_last: ["First and last frames", "\u9996\u5c3e\u5e27\u56fe\u751f"],
        reference: ["Multimodal references", "\u591a\u6a21\u6001\u53c2\u8003"],
        continue: ["Continue video", "\u89c6\u9891\u7eed\u63a5"],
    };
    let results = {};
    let resultTimer = null;
    let busy = false;
    let rendering = false;
    let refreshPending = false;
    let specialClick = false;
    let projectId = "";
    let viewedVersions = {};
    let observedResultValue = "";
    const params = () => root.simpleaiTopbarSystemParams || {};
    function text(en, cn) {
        const lang = String(params().__lang || "zh").toLowerCase();
        return lang.startsWith("en") ? en : cn;
    }
    function isFamily(state = params()) {
        const preset = String(state.__preset || state.preset || state.preset_name || "").replace(/\.json$/, "");
        const engine = state.engine_type || (state.default_engine || {}).engine_type;
        return /^MiniMax-H3\((T2V|I2V|R2V|R2C|Avatar|Motion|Transition|Edit|Swap|Swap-SAM3|Region|Upscale)\)$/.test(preset) && engine !== "image";
    }
    function capability(state = params()) {
        if (!isFamily(state)) return null;
        return {
            h3_unified: true, director_supported: true,
            image_policy: "optional", audio_policy: "optional", video_policy: "optional",
            min_images: 0, max_images: 9, max_audios: 3, max_videos: 3,
            image_modes: ["none", "first_frame", "first_last", "reference_set"],
            video_modes: ["explicit", "previous_segment"], chain_output: "timeline",
            requires_sequential: true, mixed_segments: true, duration_strategy: "shot",
            segment_duration_param: "scene_video_duration", audio_output: "generated",
            min_segment_duration: 0.2, max_segment_duration: 30, timeline_format: "None",
        };
    }
    function id() {
        return root.crypto?.randomUUID ? root.crypto.randomUUID().replace(/-/g, "") :
            Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    function defaultMode(state, count) {
        const preset = String(state.__preset || state.preset || "");
        if (preset.includes("(R2V)")) return "reference";
        if (preset.includes("(R2C)")) return "continue";
        if (preset.includes("(I2V)")) return count >= 2 ? "first_last" : "first_frame";
        return "text";
    }
    function metadata(row, state = params()) {
        const saved = Array.isArray(row) ? row[META] : row;
        const meta = {};
        if (saved && typeof saved === "object") {
            ["id", "mode", "sampling_profile", "included", "source_segment_id"].forEach(key => {
                if (key in saved) meta[key] = saved[key];
            });
            if (saved.mode_bindings && typeof saved.mode_bindings === "object") {
                meta.mode_bindings = {};
                MODES.forEach(mode => {
                    const bindings = saved.mode_bindings[mode];
                    if (Array.isArray(bindings) && bindings.length === 11) meta.mode_bindings[mode] = bindings.slice();
                });
            }
            if (saved.prompt_state && typeof saved.prompt_state === "object") {
                meta.prompt_state = JSON.parse(JSON.stringify(saved.prompt_state));
            }
            if (saved.transition && typeof saved.transition === "object") {
                meta.transition = JSON.parse(JSON.stringify(saved.transition));
            }
        }
        if (!meta.id) meta.id = id();
        if (!meta.mode) meta.mode = defaultMode(state, Array.isArray(row) ? row.slice(3, 12).filter(Boolean).length : 0);
        if (!meta.sampling_profile) meta.sampling_profile = "Basic";
        meta.included = meta.included !== false;
        meta.source_segment_id = String(meta.source_segment_id || "");
        return meta;
    }
    function shotCapability(capability, mode) {
        if (!capability.h3Unified) return capability;
        return {
            ...capability, h3Mode: mode,
            imagePolicy: mode === "text" ? "forbidden" : "optional", minImages: 0,
            maxImages: mode === "text" ? 0 : mode === "first_frame" ? 1 : mode === "first_last" ? 2 : 9,
            audioPolicy: ["reference", "transition"].includes(mode) ? "optional" : "forbidden",
            maxAudios: ["reference", "transition"].includes(mode) ? 3 : 0,
            videoPolicy: ["reference", "continue"].includes(mode) ? "optional" : "forbidden",
            maxVideos: mode === "continue" ? 1 : mode === "reference" ? 3 : 0,
        };
    }
    function syncShotControls(rowNode) {
        const mode = rowNode.querySelector('[data-h3-field="mode"]')?.value || rowNode.__h3Meta?.mode;
        const visibility = {image: mode !== "text", audio: mode === "reference", video: ["reference", "continue"].includes(mode)};
        ["image", "audio", "video"].forEach(kind => {
            const selector = kind === "image" ? ".scene-director-image-refs-field" : `[data-scene-director-field="${kind}_ref"]`;
            const field = rowNode.querySelector(selector);
            const label = kind === "image" ? field : field?.closest("label");
            if (label) {
                if (visibility[kind]) label.style.removeProperty("display");
                else label.style.setProperty("display", "none", "important");
            }
        });
        const sourceField = rowNode.querySelector("[data-h3-source-field]");
        if (sourceField) {
            const refs = [
                ...(root.sceneDirectorSelectedImageRefs?.(rowNode) || []),
                ...(root.sceneDirectorMediaRefsFromValue?.(rowNode.querySelector('[data-scene-director-field="video_ref"]')?.value, "video") || []),
            ];
            sourceField.hidden = mode === "text" || !refs.some(ref => ref.startsWith("previous_segment"));
        }
        const references = rowNode.querySelector(".h3-shot-reference-grid");
        if (references) references.hidden = mode === "text";
        const tail = rowNode.querySelector("[data-scene-director-inherit-tail]");
        const tailControl = tail?.closest(".scene-director-inherit-tail");
        if (tailControl) tailControl.hidden = !["first_frame", "first_last"].includes(mode) ||
            (Number(rowNode.getAttribute("data-scene-director-index")) <= 0 && !tail.checked);
    }
    function query(selector) {
        return root.sceneDirectorQuery ? root.sceneDirectorQuery(selector) : root.document?.querySelector(selector);
    }
    function promptTarget(field = null, segmentId = "") {
        if (!isFamily() || !root.sceneDirectorGenerateEnabled?.()) return null;
        const editor = query("#scene_director_editor_root");
        if (!editor) return null;
        const nodes = Array.from(editor.querySelectorAll("[data-scene-director-shot]"));
        const transitionId = segmentId || field?.closest?.("[data-h3-transition]")?.dataset?.h3Transition;
        const owner = transitionId && nodes.find(item => item.__h3Meta?.transition?.id === transitionId);
        if (owner) {
            const transition = owner.__h3Meta.transition;
            if (!transition.enabled) return null;
            const rows = root.sceneDirectorRowsFromEditor(editor);
            const images = transition.images || [];
            const row = [0, transition.duration, transition.prompt, ...images, ...Array(Math.max(0, 9 - images.length)).fill(""),
                root.sceneDirectorSerializeMediaRefs(transition.audio || []), "",
                { ...transition, mode: "transition" }];
            return { editor, node: owner, index: nodes.indexOf(owner), rows, row, meta: row[META],
                transition: true, promptNode: editor.querySelector(`[data-h3-transition="${transitionId}"] textarea`) };
        }
        const node = segmentId ? nodes.find(item => item.__h3Meta?.id === segmentId)
            : field ? field.closest?.("[data-scene-director-shot]")
                : nodes.find(item => item.getAttribute("aria-current") === "true") || nodes[0];
        const index = nodes.indexOf(node);
        if (index < 0) return null;
        const rows = root.sceneDirectorRowsFromEditor(editor);
        const row = rows[index];
        return row ? { editor, node, index, rows, row, meta: metadata(row) } : null;
    }
    function promptInventory(target) {
        const pool = root.sceneDirectorReadMediaState();
        const images = target.row.slice(3, 12).filter(Boolean);
        const audios = root.sceneDirectorMediaRefsFromValue(target.row[12], "audio");
        const videos = root.sceneDirectorMediaRefsFromValue(target.row[13], "video");
        const slots = {
            image: ["scene_canvas_image", ...Array.from({length: 8}, (_, i) => `scene_input_image${i + 1}`)],
            audio: ["scene_audio", "scene_audio2", "scene_audio3"],
            video: ["scene_video", "scene_reference_video", "scene_reference_video2"],
        };
        const inventory = {};
        for (const [kind, refs] of Object.entries({ image: images, audio: audios, video: videos })) {
            inventory[kind + "_refs"] = refs.map((ref, index) => {
                const item = pool[ref] || {};
                const source = results.shots?.find(shot => shot.id === target.meta.source_segment_id);
                const version = source?.versions?.find(candidate => candidate.id === source.selected);
                const path = item.path || item.src || (ref.startsWith("previous_segment") ? version?.url : "") || "";
                const fileUrl = path && !/^(?:https?:|\/|data:)/.test(path)
                    ? `/gradio_api/file=${encodeURIComponent(path)}` : path;
                return {
                    slot: slots[kind][index], source_ref: ref, asset_id: item.asset_id || "",
                    source_identity: root.sceneDirectorMediaMap().get(ref)?.identity ||
                        `${target.meta.source_segment_id}:${source?.selected || ""}:${ref}`,
                    preview: kind === "image" ? root.sceneDirectorMediaMap().get(ref)?.src || "" : fileUrl,
                    preview_url: kind === "image" ? root.sceneDirectorMediaMap().get(ref)?.src || "" : fileUrl,
                    mime: item.mime || `${kind}/${kind === "image" ? "png" : kind === "audio" ? "wav" : "mp4"}`,
                    name: item.name || ref, duration: item.duration, waveform: item.waveform,
                };
            });
        }
        return inventory;
    }
    function savePromptState(segmentId, prompt, state, expectedMode) {
        const target = promptTarget(null, segmentId);
        if (!target || target.meta.mode !== expectedMode) throw new Error("director_prompt_target_changed");
        if (target.transition) {
            target.node.__h3Meta.transition = { ...target.meta, prompt,
                prompt_state: JSON.parse(JSON.stringify(state)) };
            if (target.promptNode) target.promptNode.value = prompt;
            root.sceneDirectorWriteRows(root.sceneDirectorRowsFromEditor(target.editor));
            sync();
            return true;
        }
        const field = target.node.querySelector('[data-scene-director-field="prompt"]');
        if (!field) return false;
        field.value = prompt;
        target.node.__h3Meta = { ...target.meta, prompt_state: JSON.parse(JSON.stringify(state)) };
        root.sceneDirectorWriteRows(root.sceneDirectorRowsFromEditor(target.editor));
        return true;
    }
    async function attachCharacterMedia(segmentId, card) {
        const target = promptTarget(null, segmentId);
        if (!target) throw new Error("director_prompt_target_changed");
        const cap = shotCapability(root.sceneDirectorCapability(), target.meta.mode);
        const api = root.SimpAIVisualPromptEditor;
        const poolText = root.sceneDirectorMediaStateField()?.value;
        const pool = { ...root.sceneDirectorReadMediaState() };
        const selected = {
            image: target.row.slice(3, 12).filter(Boolean),
            audio: root.sceneDirectorMediaRefsFromValue(target.row[12], "audio"),
        };
        const limits = { image: cap.maxImages, audio: cap.maxAudios };
        const assignments = [], skipped = [], seen = new Set();
        for (const asset of card.media || []) {
            if (!asset.asset_id || seen.has(asset.asset_id)) continue;
            seen.add(asset.asset_id);
            const kind = String(asset.mime || "").startsWith("image/") ? "image"
                : String(asset.mime || "").startsWith("audio/") ? "audio" : "";
            if (!kind) throw new Error("unsupported_media_type");
            if (!limits[kind]) {
                skipped.push({ asset_id: asset.asset_id, kind, reason: "unsupported_media_kind" });
                continue;
            }
            let ref = Object.keys(pool).find(key => key.startsWith(kind + "_") && pool[key]?.asset_id === asset.asset_id);
            if (ref && selected[kind].includes(ref)) continue;
            if (selected[kind].length >= limits[kind]) throw new Error("reference_capacity");
            if (!ref) {
                ref = Array.from({length: kind === "image" ? 9 : 5}, (_, i) => `${kind}_${i + 1}`)
                    .find(key => !pool[key]?.path && !pool[key]?.data_url && !pool[key]?.src && !pool[key]?.thumb &&
                        !root.sceneDirectorImageUploadPending?.(key));
                if (!ref) throw new Error("reference_capacity");
                pool[ref] = { asset_id: asset.asset_id };
                assignments.push({ ref, asset_id: asset.asset_id, kind });
            }
            selected[kind].push(ref);
        }
        if (seen.size && skipped.length === seen.size) throw new Error("reference_media_unsupported");
        if (assignments.length) {
            const response = await api.request("resolve", { asset_ids: assignments.map(item => item.asset_id) }, params());
            for (const assignment of assignments) {
                const asset = response.assets?.find(item => item.asset_id === assignment.asset_id);
                if (!asset?.path || !String(asset.mime || "").startsWith(assignment.kind + "/")) throw new Error("asset_not_found");
                let thumb = "";
                if (assignment.kind === "image" && asset.preview_url) {
                    const controller = new root.AbortController();
                    const timer = root.setTimeout(() => controller.abort(), 15000);
                    try {
                        const preview = await root.fetch(asset.preview_url, {credentials: "same-origin", signal: controller.signal});
                        if (preview.ok) thumb = await root.sceneDirectorImageThumbnail(await preview.blob()).catch(() => "");
                    } catch (error) {
                        throw new Error(error.name === "AbortError" ? "media_request_timeout" : "asset_not_found");
                    } finally {
                        root.clearTimeout(timer);
                    }
                }
                pool[assignment.ref] = { type: assignment.kind, asset_id: asset.asset_id, path: asset.path,
                    name: asset.name, mime: asset.mime, size: asset.size, thumb,
                    duration: asset.duration, waveform: asset.waveform };
            }
        }
        const current = promptTarget(null, segmentId);
        if (!current || current.meta.mode !== target.meta.mode) throw new Error("director_prompt_target_changed");
        if (root.sceneDirectorMediaStateField()?.value !== poolText ||
                JSON.stringify(current.row.slice(3, 14)) !== JSON.stringify(target.row.slice(3, 14))) throw new Error("media_slot_occupied");
        if (assignments.length) root.sceneDirectorWriteMediaState(pool);
        if (current.transition) {
            current.node.__h3Meta.transition = { ...current.meta, images: selected.image, audio: selected.audio };
        } else {
            root.sceneDirectorSetSelectedImageRefs(current.node, selected.image, cap);
            root.sceneDirectorSetSelectedMediaRefs(current.node, "audio", selected.audio, cap);
        }
        root.sceneDirectorWriteRows(root.sceneDirectorRowsFromEditor(current.editor));
        root.sceneDirectorRenderMediaPreview();
        return { inventory: promptInventory(promptTarget(null, segmentId)), skipped };
    }
    function promptContext(field = null, segmentId = "") {
        const target = promptTarget(field, segmentId);
        if (!target) return null;
        segmentId = target.meta.id;
        const mode = target.meta.mode;
        const cap = root.sceneDirectorCapability();
        return {
            segment_id: segmentId, mode, duration: Number(target.row[1]) - Number(target.row[0]),
            min_duration: cap.minSegmentDuration, max_duration: cap.maxSegmentDuration,
            inventory: promptInventory(target), prompt_state: target.meta.prompt_state || {},
            getInventory() {
                const current = promptTarget(null, segmentId);
                if (!current || current.meta.mode !== mode) throw new Error("director_prompt_target_changed");
                return promptInventory(current);
            },
            attachMedia: card => attachCharacterMedia(segmentId, card),
            save: (prompt, state) => savePromptState(segmentId, prompt, state, mode),
        };
    }
    function promptButtons() {
        return icon("characters", "address-card", text("Characters & prompts", "\u89d2\u8272\u4e0e\u63d0\u793a\u8bcd")) +
            icon("storyboard", "list", text("H3 Storyboard", "H3 \u5206\u955c\u8868"));
    }
    async function openPromptEditor(node, kind) {
        const editor = query("#scene_director_editor_root");
        const segmentId = node.dataset?.h3Transition || node.__h3Meta?.id;
        if (!segmentId) return false;
        root.sceneDirectorSetActiveShot(editor, Number(node.getAttribute("data-scene-director-index")));
        root.sceneDirectorWriteRows(root.sceneDirectorRowsFromEditor(editor));
        await root.SimpAILazyAssetLoader?.loadGroup("h3StoryboardEditor");
        const target = promptTarget(null, segmentId);
        if (!target) throw new Error(text("The target shot is no longer available.", "\u76ee\u6807\u5206\u955c\u5df2\u4e0d\u53ef\u7528\u3002"));
        const field = target.promptNode || target.node.querySelector('[data-scene-director-field="prompt"]');
        const api = root.SimpAIH3StoryboardEditor;
        if (!field?.isConnected || !api) throw new Error(text("Prompt editor is not loaded.", "\u63d0\u793a\u8bcd\u7f16\u8f91\u5668\u5c1a\u672a\u52a0\u8f7d\u3002"));
        if (kind === "storyboard") return api.openScenePreset(field, segmentId);
        const config = api.visualPromptContext(field, segmentId);
        return root.SimpAIVisualPromptEditor.open({ ...config, value: field.value });
    }
    function field(name) {
        return query("#scene_director_h3_" + name)?.querySelector("textarea, input");
    }
    function write(name, value) {
        const input = field(name);
        if (!input) return false;
        root.sceneDirectorSetTextFieldValue(input, JSON.stringify(value), true);
        return true;
    }
    function escape(value) {
        return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function icon(action, glyph, title, disabled = false, className = "", tooltip = title, target = null) {
        const targetAttrs = target ? `data-h3-segment-id="${escape(target.segment_id)}" data-h3-version-id="${escape(target.version_id || "")}"` : "";
        return `<button type="button" class="h3-command ${escape(className)}" data-h3-action="${action}" ${targetAttrs} title="${escape(tooltip)}" aria-label="${escape(title)}" ${disabled ? "disabled" : ""}><i class="fa-solid fa-${glyph}" aria-hidden="true"></i><span>${escape(title)}</span></button>`;
    }
    function referenceOptions(kind, options, selectedRefs, mediaMap, rowIndex = 0) {
        return options.filter(ref => {
            if (!ref || selectedRefs.includes(ref)) return true;
            if (ref === "previous_segment") return rowIndex > 0;
            const media = mediaMap.get(ref);
            return !!(media?.src || media?.path);
        });
    }
    function mediaButton(kind) {
        const names = {image: ["Add images", "\u6dfb\u52a0\u56fe\u7247"], audio: ["Add audio", "\u6dfb\u52a0\u97f3\u9891"], video: ["Add videos", "\u6dfb\u52a0\u89c6\u9891"]};
        return icon("media-" + kind, "plus", text(...names[kind]), false, "h3-add-reference");
    }
    function showMedia(kind) {
        const panel = query("#scene_director_media_accordion");
        const toggle = panel?.querySelector("button.label-wrap");
        if (toggle && !toggle.classList.contains("open")) toggle.click();
        setTimeout(() => {
            const group = kind === "image" ? "images" : kind;
            (query(`[data-scene-director-kind-group="${group}"]`) || panel)?.scrollIntoView({block: "nearest", behavior: "smooth"});
        }, 80);
    }
    function mediaWorkspaceMarkup(counts, expanded, imageAvailable = counts.image < 9) {
        const summary = text(`${counts.image} images \u00b7 ${counts.video} videos \u00b7 ${counts.audio} audio`,
            `${counts.image} \u5f20\u56fe\u7247 \u00b7 ${counts.video} \u6bb5\u89c6\u9891 \u00b7 ${counts.audio} \u4e2a\u97f3\u9891`);
        return `<div class="h3-media-library-title"><i class="fa-solid fa-photo-film" aria-hidden="true"></i><strong>${text("Project media", "\u9879\u76ee\u7d20\u6750")}</strong><span class="h3-media-library-count" role="status">${summary}</span></div>
            <div class="h3-media-library-actions">${icon("media-image", "image", text("Add images", "\u6dfb\u52a0\u56fe\u7247"), !imageAvailable, "", imageAvailable ? text("Add images", "\u6dfb\u52a0\u56fe\u7247") : text("All image slots are occupied. Clear a slot before adding an image.", "\u56fe\u7247\u4f4d\u7f6e\u5df2\u6ee1\uff0c\u8bf7\u6e05\u9664\u4e00\u5f20\u56fe\u7247\u540e\u518d\u6dfb\u52a0\u3002"))}${icon("media-video", "film", text("Add videos", "\u6dfb\u52a0\u89c6\u9891"))}${icon("media-audio", "music", text("Add audio", "\u6dfb\u52a0\u97f3\u9891"))}<button type="button" class="h3-command h3-media-fold" data-h3-action="media-toggle" aria-expanded="${expanded}" aria-controls="scene_director_media_accordion" title="${text(expanded ? "Collapse media" : "Show media", expanded ? "\u6536\u8d77\u7d20\u6750" : "\u5c55\u5f00\u7d20\u6750")}" aria-label="${text(expanded ? "Collapse media" : "Show media", expanded ? "\u6536\u8d77\u7d20\u6750" : "\u5c55\u5f00\u7d20\u6750")}"><i class="fa-solid fa-chevron-${expanded ? "up" : "down"}" aria-hidden="true"></i></button></div>`;
    }
    function syncMediaWorkspace(enabled) {
        const panel = query("#scene_director_media_accordion");
        if (!panel) return;
        let heading = query("[data-h3-media-library]");
        if (!isFamily()) {
            if (heading) heading.hidden = true;
            delete panel.dataset.h3MediaEntered;
            return;
        }
        const toggle = panel.querySelector("button.label-wrap");
        if (!heading) {
            heading = root.document.createElement("div");
            heading.className = "h3-media-library-bar";
            heading.dataset.h3MediaLibrary = "1";
            panel.before(heading);
            heading.onclick = event => {
                const button = event.target.closest("[data-h3-action]");
                if (!button || button.disabled || !heading.contains(button)) return;
                if (button.dataset.h3Action === "media-toggle") panel.querySelector("button.label-wrap")?.click();
                else {
                    const kind = button.dataset.h3Action.slice(6);
                    showMedia(kind);
                    if (kind === "image") root.sceneDirectorOpenImageFileDialog();
                    else root.sceneDirectorOpenMediaFileDialog(kind);
                }
                setTimeout(sync, 0);
            };
        }
        heading.hidden = false;
        // Mode changes keep the same media bar and the user's fold choice.
        if (enabled && !panel.dataset.h3MediaEntered && toggle) {
            panel.dataset.h3MediaEntered = "1";
            if (!toggle.classList.contains("open")) toggle.click();
        }
        const counts = {image: 0, video: 0, audio: 0};
        (root.sceneDirectorMediaMap?.() || new Map()).forEach((item, ref) => {
            const kind = ref.split("_")[0];
            if (kind in counts && (item?.src || item?.path)) counts[kind]++;
        });
        const html = mediaWorkspaceMarkup(counts, !!toggle?.classList.contains("open"), !!root.sceneDirectorAvailableImageRef?.());
        if (heading.__signature !== html) {
            heading.innerHTML = html;
            heading.__signature = html;
        }
    }
    function syncGenerationScope(enabled) {
        const resolution = query("#aspect_ratios_accordion");
        let heading = query("[data-h3-generation-scope]");
        if (enabled && resolution && !heading) {
            heading = root.document.createElement("div");
            heading.className = "h3-generation-scope";
            heading.dataset.h3GenerationScope = "1";
            resolution.before(heading);
        }
        if (heading) {
            heading.hidden = !enabled;
            const title = text("Shot generation settings", "\u5206\u955c\u751f\u6210\u8bbe\u7f6e");
            if (heading.textContent !== title) heading.textContent = title;
        }
        const advanced = query("#scene_advanced_parameters_accordion button.label-wrap");
        const label = advanced?.querySelector("span:not(.icon)");
        if (label && (enabled || advanced.__h3ScopeOriginal)) {
            if (enabled && !advanced.__h3ScopeOriginal) {
                advanced.__h3ScopeOriginal = {label: label.textContent, title: advanced.title, lang: params().__lang};
            }
            const original = advanced.__h3ScopeOriginal;
            const title = enabled ? text("Preset advanced parameters", "\u5f53\u524d\u9884\u7f6e\u9ad8\u7ea7\u53c2\u6570")
                : original.lang === params().__lang ? original.label : text("Advanced Parameters", "\u9ad8\u7ea7\u53c2\u6570");
            if (label.textContent !== title) label.textContent = title;
            advanced.title = enabled ? text("Preset-specific values are replaced by each director shot's mode and sampling settings.",
                "\u9884\u7f6e\u4e13\u7528\u6570\u503c\u4f1a\u6309\u5404\u5206\u955c\u7684\u6a21\u5f0f\u548c\u91c7\u6837\u8bbe\u7f6e\u91cd\u65b0\u8d4b\u503c\u3002") : original.title;
            if (!enabled) delete advanced.__h3ScopeOriginal;
        }
    }
    function mainToolbar(completed, total, disabled, transitions = []) {
        const transitionReady = transitions.filter(edge => selectedResult(edge.id, "transitions").version).length;
        return `<div class="h3-generate-actions">${icon("missing", "circle-play", text("Generate missing shots", "\u751f\u6210\u672a\u5b8c\u6210\u5206\u955c"), disabled, "h3-primary")}
            ${busy ? icon("stop-generation", "stop", text("Stop generation", "\u505c\u6b62\u751f\u6210")) : ""}
            <span class="h3-project-status" role="status">${busy ? text("Generating", "\u751f\u6210\u4e2d") : `${completed} / ${total} ${text("ready", "\u5df2\u751f\u6210")}${transitions.length ? ` \u00b7 ${text("Transitions", "\u8f6c\u573a")} ${transitionReady} / ${transitions.length}` : ""}`}</span></div>
            <div class="h3-project-actions">${icon("all", "arrows-rotate", text("Regenerate all shots", "\u5168\u90e8\u91cd\u751f\u6210"), disabled)}
                ${icon("refresh", "rotate", text("Refresh results", "\u5237\u65b0\u7ed3\u679c"), disabled, "h3-icon-only")}</div>`;
    }
    function timelineToolbar(disabled, readiness = {}) {
        const current = !!results.preview?.current;
        const blocked = refreshPending || readiness.ready === false;
        const update = readiness.transitionUpdate;
        const adopt = update?.action === "select";
        const status = rendering ? text("Rendering", "\u6e32\u67d3\u4e2d") :
            refreshPending ? text("Checking shot results", "\u6b63\u5728\u68c0\u67e5\u5206\u955c") :
            adopt ? text("A new transition is waiting to be adopted", "\u65b0\u8f6c\u573a\u5c1a\u672a\u91c7\u7528") :
            readiness.transitionError ? readiness.transitionError :
            readiness.transitionMissing ? text(`${readiness.transitionMissing} transition(s) not generated`, `${readiness.transitionMissing} \u4e2a\u8f6c\u573a\u672a\u751f\u6210`) :
            readiness.review ? text(`${readiness.review} shot(s) need review`, `${readiness.review} \u6bb5\u5f85\u68c0\u67e5`) :
            readiness.missing ? text(`${readiness.missing} shot(s) not generated`, `${readiness.missing} \u6bb5\u672a\u751f\u6210`) :
            readiness.ready === false ? text("No included shots", "\u672a\u9009\u62fc\u63a5\u5206\u955c") :
            current ? text("Reviewed", "\u5df2\u9884\u89c8") :
            results.preview?.url ? text("Preview out of date", "\u9884\u89c8\u5df2\u8fc7\u671f") : text("Not previewed", "\u672a\u9884\u89c8");
        const updateLabel = adopt ? text("Use new transition", "\u91c7\u7528\u65b0\u7248\u8f6c\u573a") :
            text("Regenerate transition", "\u91cd\u751f\u6210\u8f6c\u573a");
        const previewLabel = results.preview?.url && !current ? text("Update preview", "\u66f4\u65b0\u9884\u89c8") :
            text("Preview movie", "\u9884\u89c8\u6210\u7247");
        return `<span class="h3-preview-state" role="status">${status}</span>
            ${update ? icon(update.action, adopt ? "check" : "play", updateLabel, disabled || refreshPending, "h3-primary", updateLabel, update) : ""}
            ${icon("preview", "film", previewLabel, disabled || blocked)}
            ${icon("export", "download", text("Export movie", "\u8f93\u51fa\u6210\u7247"), disabled || blocked || !current, "h3-primary")}
            ${rendering ? icon("cancel", "stop", text("Cancel rendering", "\u53d6\u6d88\u6e32\u67d3")) : ""}`;
    }
    function transitionPlan(rows) {
        rows = Array.isArray(rows) ? rows : [];
        const included = rows.filter(row => row[META]?.included !== false);
        return rows.flatMap(row => {
            const edge = row[META]?.transition;
            if (!edge?.enabled) return [];
            const index = included.findIndex(item => item[META]?.id === row[META]?.id);
            return [{ ...edge, from_segment_id: row[META].id,
                adjacent: index >= 0 && included[index + 1]?.[META]?.id === edge.to_segment_id }];
        });
    }
    function outputRows(rows) {
        rows = snapTransitions(Array.isArray(rows) ? rows : []);
        const edges = transitionPlan(rows).filter(item => item.adjacent);
        const outgoing = new Map(edges.map(item => [item.from_segment_id, item]));
        let offset = 0;
        let baseEnd = 0;
        let originalEnd = 0;
        const output = [];
        rows.forEach((row, index) => {
            if (row[META]?.included === false) return;
            const shifted = row.slice();
            const baseStart = edges.length ? baseEnd + Math.round((Number(row[0]) - originalEnd) * 24) / 24 : Number(row[0]);
            const duration = edges.length ? Math.round((Number(row[1]) - Number(row[0])) * 24) / 24 : Number(row[1]) - Number(row[0]);
            baseEnd = baseStart + duration;
            originalEnd = Number(row[1]);
            shifted[0] = baseStart + offset;
            shifted[1] = baseEnd + offset;
            shifted[META] = { ...row[META], timeline_source_index: index };
            output.push(shifted);
            const edge = outgoing.get(row[META]?.id);
            if (!edge) return;
            const inserted = Math.round(Number(edge.duration) * 24) / 24;
            const transitionRow = [shifted[1], shifted[1] + inserted, edge.prompt || "", ...Array(11).fill(""),
                { id: edge.id, mode: "transition", included: true, timeline_owner_index: index }];
            output.push(transitionRow);
            offset += inserted;
        });
        return output;
    }
    function newTransition(toId) {
        return { id: id(), to_segment_id: toId, enabled: false, duration: 1, overlap: 0.75,
            prompt: text("Create a continuous audiovisual transition from the preceding video's outgoing motion into the following video's opening. Preserve compatible motion, ambience and sound continuity.",
                "\u4ece\u524d\u6bb5\u89c6\u9891\u672b\u5c3e\u7684\u8fd0\u52a8\u81ea\u7136\u8fc7\u6e21\u5230\u540e\u6bb5\u89c6\u9891\u7684\u5f00\u5934\uff0c\u4fdd\u6301\u8fd0\u52a8\u65b9\u5411\u3001\u73af\u5883\u58f0\u548c\u58f0\u97f3\u7684\u8fde\u7eed\u6027\u3002"),
            images: [], audio: [] };
    }
    function gapTransition(rows, fromId, toId) {
        const included = rows.map((row, index) => ({ row, index })).filter(item => item.row[META]?.included !== false);
        const position = included.findIndex(item => item.row[META]?.id === fromId);
        const before = included[position], after = included[position + 1];
        if (!before || !after || after.row[META]?.id !== toId || before.row[META]?.transition?.enabled) return null;
        const gap = Number(after.row[0]) - Number(before.row[1]);
        const frames = Math.round(gap * 24);
        if (frames < 5 || frames > 720) return null;
        const output = rows.map(row => row.slice());
        const saved = before.row[META]?.transition;
        output[before.index][META] = { ...before.row[META], transition: {
            ...(saved?.to_segment_id === toId ? saved : newTransition(toId)),
            enabled: true, duration: frames / 24,
        } };
        output.forEach((row, index) => {
            if (index >= after.index) {
                row[0] = Number((Number(row[0]) - gap).toFixed(12));
                row[1] = Number((Number(row[1]) - gap).toFixed(12));
            }
        });
        return output;
    }
    function snapTransitions(rows) {
        const output = rows.map(row => row.slice());
        const included = output.map((row, index) => ({ row, index })).filter(item => item.row[META]?.included !== false);
        included.slice(1).forEach((after, index) => {
            const before = included[index];
            const edge = before.row[META]?.transition;
            if (!edge?.enabled || edge.to_segment_id !== after.row[META]?.id) return;
            const gap = Number(after.row[0]) - Number(before.row[1]);
            if (!Number.isFinite(gap) || Math.abs(gap) < 0.001) return;
            const frames = Math.max(5, Math.min(720, Math.round((Number(edge.duration) + gap) * 24)));
            before.row[META] = { ...before.row[META], transition: { ...edge, duration: frames / 24 } };
            output.forEach((row, rowIndex) => {
                if (rowIndex >= after.index) {
                    row[0] = Number((Number(row[0]) - gap).toFixed(12));
                    row[1] = Number((Number(row[1]) - gap).toFixed(12));
                }
            });
        });
        return output;
    }
    function timelineDrag(rows, index, mode, delta, minDuration, maxDuration) {
        if (!transitionPlan(rows).length || !rows[index]) return null;
        const output = rows.map(row => row.slice());
        if (mode === "transition-end") {
            const saved = rows[index][META]?.transition;
            if (!saved?.enabled) return null;
            const frames = Math.max(5, Math.min(720, Math.round(Number(saved.duration) * 24) + Math.round(delta * 24)));
            output[index][META] = { ...rows[index][META], transition: { ...saved, duration: frames / 24 } };
            return output;
        }
        const included = rows.map((row, index) => ({ row, index })).filter(item => item.row[META]?.included !== false);
        const position = included.findIndex(item => item.index === index);
        if (position < 0) return null;
        const connected = (before, after) => before && after && before.row[META]?.transition?.enabled
            && before.row[META].transition.to_segment_id === after.row[META]?.id
            && Math.abs(Number(before.row[1]) - Number(after.row[0])) < 0.001;
        const incoming = connected(included[position - 1], included[position]) ? included[position - 1] : null;
        const outgoing = connected(included[position], included[position + 1]) ? included[position] : null;
        const edgeFrames = item => Math.round(Number(item.row[META].transition.duration) * 24);
        const setEdge = (item, change) => {
            const row = output[item.index];
            row[META] = { ...row[META], transition: { ...row[META].transition, duration: (edgeFrames(item) + change) / 24 } };
        };
        const duration = Number(rows[index][1]) - Number(rows[index][0]);
        if ((mode === "move" && (incoming || outgoing)) || (mode === "start" && incoming) || (mode === "end" && outgoing)) {
            let lower = -Infinity, upper = Infinity;
            if (mode === "move" || mode === "start") {
                if (incoming) {
                    lower = 5 - edgeFrames(incoming);
                    upper = 720 - edgeFrames(incoming);
                } else {
                    const previousEnd = Math.max(0, ...included.slice(0, position).map(item => Number(item.row[1])));
                    lower = Math.ceil((previousEnd - Number(rows[index][0])) * 24 - 1e-8);
                    upper = Math.floor((86400 - Math.max(...rows.slice(index).map(row => Number(row[1])))) * 24);
                }
            }
            if ((mode === "move" || mode === "end") && outgoing) {
                lower = Math.max(lower, edgeFrames(outgoing) - 720);
                upper = Math.min(upper, edgeFrames(outgoing) - 5);
            }
            if (mode === "start" || mode === "end") {
                lower = Math.max(lower, Math.ceil((mode === "start" ? duration - maxDuration : minDuration - duration) * 24 - 1e-8));
                upper = Math.min(upper, Math.floor((mode === "start" ? duration - minDuration : maxDuration - duration) * 24 + 1e-8));
            }
            const frames = Math.max(lower, Math.min(upper, Math.round(delta * 24)));
            if (lower > upper) return output;
            const shift = frames / 24;
            if (incoming && mode !== "end") setEdge(incoming, frames);
            if (outgoing && mode !== "start") setEdge(outgoing, -frames);
            if (mode !== "move" || !incoming) {
                const baseShift = mode === "start" ? -shift : shift;
                output.forEach((row, rowIndex) => {
                    if (rowIndex >= index) {
                        if (mode === "move" || rowIndex > index) row[0] = Number((Number(row[0]) + baseShift).toFixed(12));
                        row[1] = Number((Number(row[1]) + baseShift).toFixed(12));
                    }
                });
            }
            return output;
        }
        let first = position, last = position;
        while (connected(included[first - 1], included[first])) first--;
        while (connected(included[last], included[last + 1])) last++;
        const groupStart = Number(included[first].row[0]), groupEnd = Number(included[last].row[1]);
        const previousEnd = Math.max(0, ...included.slice(0, first).map(item => Number(item.row[1])));
        const nextStart = Math.min(86400, ...included.slice(last + 1).map(item => Number(item.row[0])));
        let lower = previousEnd - groupStart, upper = nextStart - groupEnd;
        if (mode === "start") {
            lower = Math.max(lower, duration - maxDuration);
            upper = duration - minDuration;
        } else if (mode === "end") {
            lower = minDuration - duration;
            upper = Math.min(upper, maxDuration - duration);
        }
        const lowFrame = Math.ceil(lower * 24 - 1e-8), highFrame = Math.floor(upper * 24 + 1e-8);
        if (lowFrame > highFrame) return output;
        const shift = Math.max(lowFrame, Math.min(highFrame, Math.round(delta * 24))) / 24;
        // Preserve source durations when moving; only a dragged edge changes generation settings.
        included.slice(first, last + 1).forEach(item => {
            const row = output[item.index];
            if (mode === "start" ? item.index <= index : mode === "end" ? item.index >= index : true) {
                if (mode !== "end" || item.index !== index) row[0] = Number((Number(row[0]) + shift).toFixed(12));
                if (mode !== "start" || item.index !== index) row[1] = Number((Number(row[1]) + shift).toFixed(12));
            }
        });
        return output;
    }
    function timelineGaps(rows) {
        const included = outputRows(rows).filter(row => row[META]?.mode !== "transition");
        return included.slice(1).flatMap((after, index) => {
            const before = included[index];
            if (before[META]?.transition?.enabled || Number(after[0]) <= Number(before[1])) return [];
            const frames = Math.round((Number(after[0]) - Number(before[1])) * 24);
            return [{ fromId: before[META].id, toId: after[META].id, start: Number(before[1]), end: Number(after[0]),
                duration: frames / 24, disabled: busy || rendering || frames < 5 || frames > 720 }];
        });
    }
    function selectedResult(sid, kind = "shots") {
        const result = results[kind]?.find(item => item.id === sid);
        const version = result?.versions?.find(item => item.id === result.selected && item.available);
        return { result, version };
    }
    function transitionUpdate(items) {
        const result = items.find(item => item?.stale && !item.blocked);
        if (!result) return null;
        const candidate = [...(result.versions || [])].reverse().find(version =>
            version.id !== result.selected && version.available && version.current);
        return { action: candidate ? "select" : "single", segment_id: result.id, version_id: candidate?.id || "" };
    }
    function transitionMarkup(owner, following, rows, disabled) {
        const meta = owner.__h3Meta;
        const edge = meta.transition;
        const fromIndex = rows.indexOf(owner) + 1;
        const target = rows.find(row => row.__h3Meta?.id === edge?.to_segment_id) || following;
        const toIndex = target ? rows.indexOf(target) + 1 : 0;
        const heading = `${text("Shot", "\u5206\u955c")} ${fromIndex} \u2192 ${text("Shot", "\u5206\u955c")} ${toIndex || "?"}`;
        const enabled = edge?.enabled === true;
        const sources = [selectedResult(meta.id), selectedResult(edge?.to_segment_id)];
        const sourceMarkup = sources.map((source, i) => `<div class="h3-transition-source"><span>${text(i ? "Following video" : "Preceding video", i ? "\u540e\u6bb5\u89c6\u9891" : "\u524d\u6bb5\u89c6\u9891")} ${source.version ? `\u00b7 ${text("Version", "\u7248\u672c")} ${source.result.versions.indexOf(source.version) + 1}` : ""}</span>${source.version ? `<video controls preload="metadata" src="${escape(source.version.url)}"></video>` : `<span class="h3-transition-wait">${text("Waiting for adopted video", "\u7b49\u5f85\u5df2\u91c7\u7528\u89c6\u9891")}</span>`}</div>`).join("");
        const pool = root.sceneDirectorMediaMap?.() || new Map();
        const references = ["image", "audio"].map(kind => {
            const selected = edge?.[kind === "image" ? "images" : "audio"] || [];
            const refs = Array.from(new Set([...Array.from(pool.keys()).filter(ref => ref.startsWith(kind + "_") && pool.get(ref)?.src), ...selected]));
            return `<fieldset><legend>${text(kind === "image" ? "Pictures" : "Audio", kind === "image" ? "\u56fe\u7247" : "\u97f3\u9891")}</legend>${refs.map(ref => {
                const active = selected.includes(ref);
                const item = pool.get(ref);
                const blocked = !active && selected.length >= (kind === "image" ? 9 : 3);
                return `<label class="h3-transition-reference ${active ? "is-used" : ""}"><input type="checkbox" data-h3-transition-ref="${ref}" ${active ? "checked" : ""} ${disabled || blocked ? "disabled" : ""}>${kind === "image" && item?.src ? `<img src="${escape(item.src)}" alt="">` : ""}<span>${escape(root.sceneDirectorMediaLabel(ref))}</span><small>${active ? text("Used", "\u5df2\u5f15\u7528") : text("Not used", "\u672a\u5f15\u7528")}</small></label>`;
            }).join("") || `<span>${text("No uploaded media", "\u6682\u65e0\u5df2\u4e0a\u4f20\u7d20\u6750")}</span>`}</fieldset>`;
        }).join("");
        return `<div class="h3-transition-heading"><span>${escape(heading)}</span><div class="h3-transition-mode" role="group" aria-label="${text("Connection", "\u8fde\u63a5\u65b9\u5f0f")}">${[false, true].map(value => `<label><input type="radio" name="h3-connection-${meta.id}" data-h3-transition-field="enabled" value="${value}" ${enabled === value ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${value ? text("H3 transition", "H3 \u8f6c\u573a") : text("Direct join", "\u76f4\u63a5\u62fc\u63a5")}</span></label>`).join("")}</div></div>
            ${enabled ? `<div class="h3-transition-body">${sourceMarkup}
            <label class="h3-transition-duration"><span>${text("Inserted duration (s)", "\u65b0\u589e\u8fc7\u6e21\u65f6\u957f (\u79d2)")}</span><input type="number" min="0.2" max="30" step="0.1" data-h3-transition-field="duration" value="${escape(edge.duration)}" ${disabled ? "disabled" : ""}></label>
            <label class="h3-transition-prompt"><span class="h3-transition-prompt-heading"><span>${text("Transition prompt", "\u8f6c\u573a\u63d0\u793a\u8bcd")}</span><span>${promptButtons()}</span></span><textarea rows="3" data-h3-transition-field="prompt" ${disabled ? "disabled" : ""}>${escape(edge.prompt)}</textarea></label>
            <details class="h3-transition-advanced"><summary>${text("Context & references", "\u4e0a\u4e0b\u6587\u4e0e\u53c2\u8003\u7d20\u6750")}</summary><label><span>${text("Context per side (s)", "\u6bcf\u4fa7\u4e0a\u4e0b\u6587 (\u79d2)")}</span><input type="number" min="0.1" max="3" step="0.05" data-h3-transition-field="overlap" value="${escape(edge.overlap)}" ${disabled ? "disabled" : ""}></label>${references}</details>
            <div class="h3-transition-actions">${icon("single", "play", text("Generate transition", "\u751f\u6210\u8f6c\u573a"), disabled || sources.some(source => !source.version))}${icon("transition_preview", "film", text("Preview connection", "\u9884\u89c8\u8854\u63a5"), true)}<span data-h3-transition-status role="status"></span></div><div data-h3-transition-results></div></div>` : ""}`;
    }
    function syncTransitions(editor, rows, disabled) {
        editor.querySelectorAll("[data-h3-transition-owner]").forEach(group => {
            if (!rows.some(row => row.__h3Meta?.id === group.dataset.h3TransitionOwner)) group.remove();
        });
        const included = rows.filter(row => row.__h3Meta?.included !== false);
        rows.forEach(owner => {
            const index = included.indexOf(owner);
            const following = index >= 0 ? included[index + 1] : null;
            const edge = owner.__h3Meta?.transition;
            let group = editor.querySelector(`[data-h3-transition-owner="${owner.__h3Meta?.id}"]`);
            if (!following && !edge?.enabled) { group?.remove(); return; }
            if (!group) {
                group = root.document.createElement("section");
                group.className = "h3-transition";
                group.dataset.h3TransitionOwner = owner.__h3Meta.id;
                owner.after(group);
            }
            group.dataset.h3Transition = edge?.id || "";
            const html = transitionMarkup(owner, following, rows, disabled);
            const editing = group.contains(root.document.activeElement) && root.document.activeElement?.matches("textarea, input[type=number]");
            if (!editing && group.__signature !== html) {
                const open = group.querySelector("details")?.open;
                group.innerHTML = html;
                if (open) group.querySelector("details")?.setAttribute("open", "");
                group.__signature = html;
            }
            const { result, version } = selectedResult(edge?.id, "transitions");
            const holder = group.querySelector("[data-h3-transition-results]");
            if (!holder) return;
            const status = group.querySelector("[data-h3-transition-status]");
            const waiting = !selectedResult(owner.__h3Meta.id).version || !selectedResult(edge.to_segment_id).version;
            const update = transitionUpdate([result]);
            status.textContent = result?.validation_error || result?.error ||
                (update?.action === "select" ? text("A new transition is waiting to be adopted", "\u65b0\u8f6c\u573a\u5c1a\u672a\u91c7\u7528") :
                 result?.stale ? text("Sources or settings changed", "\u6765\u6e90\u6216\u53c2\u6570\u5df2\u53d8\u5316") :
                 result?.status === "running" ? text("Generating", "\u751f\u6210\u4e2d") :
                 waiting ? text("Waiting for both source videos", "\u7b49\u5f85\u4e24\u4fa7\u89c6\u9891") :
                 version ? text("Ready", "\u5df2\u751f\u6210") : text("Not generated", "\u672a\u751f\u6210"));
            const generateButton = group.querySelector('[data-h3-action="single"]');
            generateButton.disabled = disabled || waiting || result?.blocked;
            generateButton.querySelector("span").textContent = result?.versions?.length
                ? text("Regenerate transition", "\u91cd\u751f\u6210\u8f6c\u573a") : text("Generate transition", "\u751f\u6210\u8f6c\u573a");
            const preview = group.querySelector('[data-h3-action="transition_preview"]');
            preview.disabled = disabled || refreshPending || !version || result?.stale || result?.blocked;
            const versions = result?.versions || [];
            const viewed = versions.find(v => v.id === (viewedVersions[edge.id] || update?.version_id || result?.selected)) || version;
            const resultHtml = versions.length ? `<div class="h3-result-toolbar"><select data-h3-version aria-label="${text("Transition version", "\u8f6c\u573a\u7248\u672c")}">${versions.map((v, i) => `<option value="${escape(v.id)}" ${v.id === viewed?.id ? "selected" : ""}>${text("Version", "\u7248\u672c")} ${i + 1}${v.id === result.selected ? text(" (selected)", " (\u5df2\u91c7\u7528)") : ""}</option>`).join("")}</select>${icon("select", "check", text("Use this version", "\u91c7\u7528\u6b64\u7248\u672c"), disabled || !viewed?.available || viewed?.id === result.selected)}</div><div class="h3-transition-players">${viewed?.available ? `<label><span>${text("Generated transition", "\u8f6c\u573a\u751f\u6210\u7ed3\u679c")}</span><video controls preload="metadata" src="${escape(viewed.url)}"></video></label>` : ""}${result.preview?.url ? `<label><span>${result.preview.current ? text("Connection preview", "\u8854\u63a5\u9884\u89c8") : text("Connection preview out of date", "\u8854\u63a5\u9884\u89c8\u5df2\u8fc7\u671f")}</span><video controls preload="metadata" src="${escape(result.preview.url)}"></video></label>` : ""}</div>` : "";
            if (holder.__signature !== resultHtml) { holder.innerHTML = resultHtml; holder.__signature = resultHtml; }
        });
    }
    function changeTransition(editor, input) {
        const group = input.closest("[data-h3-transition-owner]");
        if (!group) return;
        const rows = Array.from(editor.querySelectorAll("[data-scene-director-shot]"));
        const owner = rows.find(row => row.__h3Meta?.id === group.dataset.h3TransitionOwner);
        if (!owner) return;
        let edge = owner.__h3Meta.transition;
        if (!edge) {
            const included = rows.filter(row => row.__h3Meta?.included !== false);
            const next = included[included.indexOf(owner) + 1];
            if (!next) return;
            edge = newTransition(next.__h3Meta.id);
        }
        const key = input.dataset.h3TransitionField;
        const wasEnabled = edge.enabled;
        if (key === "enabled") edge.enabled = input.value === "true";
        else if (key) edge[key] = input.type === "number" ? Number(input.value) : input.value;
        else if (input.dataset.h3TransitionRef) {
            const ref = input.dataset.h3TransitionRef;
            const kind = ref.startsWith("image_") ? "images" : "audio";
            const selected = new Set(edge[kind] || []);
            if (input.checked) selected.add(ref); else selected.delete(ref);
            edge[kind] = Array.from(selected);
        }
        owner.__h3Meta = { ...owner.__h3Meta, transition: edge };
        if (edge.enabled) {
            const fps = root.sceneDirectorControlValue("#scene_director_fps");
            if (Number(fps) !== 24) root.sceneDirectorSetControlValue?.("#scene_director_fps", 24, true);
        }
        let savedRows = root.sceneDirectorRowsFromEditor(editor);
        if (key === "enabled" && edge.enabled && !wasEnabled) {
            const preceding = savedRows.find(row => row[META]?.id === owner.__h3Meta.id);
            preceding[META] = { ...preceding[META], transition: { ...edge, enabled: false } };
            savedRows = gapTransition(savedRows, owner.__h3Meta.id, edge.to_segment_id)
                || savedRows.map(row => row === preceding ? [...row.slice(0, META), { ...row[META], transition: edge }] : row);
        }
        root.sceneDirectorWriteRows(savedRows);
        sync();
    }
    function editorProject(editor) {
        if (editor?.project_id && editor.project_id !== projectId) {
            projectId = String(editor.project_id);
            results = {};
            refreshPending = false;
            viewedVersions = {};
        }
        if (!projectId) projectId = id();
        if (results.project_id !== projectId) {
            try {
                const saved = JSON.parse(query("#scene_director_h3_results")?.querySelector("textarea, input")?.value || "{}");
                if (saved.project_id === projectId) {
                    results = { ...saved, preview: { ...saved.preview, current: false } };
                }
            } catch (_error) {}
        }
        return projectId;
    }
    function resetProject() {
        projectId = "";
        results = {};
        refreshPending = false;
        viewedVersions = {};
    }
    function controls(row, index, rows) {
        if (!isFamily()) return "";
        const meta = metadata(row);
        const earlier = rows.slice(0, index).map((item, i) => ({ id: item[META]?.id, label: `${text("Shot", "\u5206\u955c")} ${i + 1}` }));
        if (meta.source_segment_id && !earlier.some(item => item.id === meta.source_segment_id)) {
            earlier.push({ id: meta.source_segment_id, label: text("Unavailable source", "\u6765\u6e90\u4e0d\u53ef\u7528") });
        }
        const options = (items, selected) => items.map(([value, label]) =>
            `<option value="${escape(value)}" ${selected === value ? "selected" : ""}>${escape(label)}</option>`).join("");
        return `<div class="h3-shot-controls">
            <label><span>${text("Mode", "\u6a21\u5f0f")}</span><select data-h3-field="mode">${options(MODES.map(mode => [mode, text(...LABELS[mode])]), meta.mode)}</select></label>
            <label><span>${text("Sampling", "\u91c7\u6837")}</span><select data-h3-field="sampling_profile">${options([["Basic", text("Basic", "\u57fa\u7840")], ["2 pass", text("2 pass", "\u53cc\u91c7\u6837")]], meta.sampling_profile)}</select></label>
            <label data-h3-source-field hidden><span>${text("Source shot", "\u6765\u6e90\u5206\u955c")}</span><select data-h3-field="source_segment_id">${options([["", text("Previous shot", "\u4e0a\u4e00\u5206\u955c")], ...earlier.map(item => [item.id, item.label])], meta.source_segment_id)}</select></label>
            <label class="h3-include"><input type="checkbox" data-h3-field="included" ${meta.included ? "checked" : ""}><span>${text("Include in timeline", "\u53c2\u4e0e\u62fc\u63a5")}</span></label>
            <div class="h3-shot-actions">${icon("single", "play", text("Generate shot", "\u751f\u6210\u672c\u6bb5"), busy)}
            ${icon("affected", "diagram-project", text("Regenerate this shot and dependent shots", "\u91cd\u751f\u6210\u672c\u6bb5\u53ca\u5173\u8054\u6bb5"), busy)}</div>
        </div>`;
    }
    function collect(rowNode, row, index, rows) {
        const meta = metadata(row);
        const previousMode = meta.mode;
        rowNode.querySelectorAll("[data-h3-field]").forEach(input => {
            meta[input.dataset.h3Field] = input.type === "checkbox" ? input.checked : input.value;
        });
        if (meta.mode !== previousMode && MODES.includes(meta.mode)) {
            meta.mode_bindings = meta.mode_bindings || {};
            meta.mode_bindings[previousMode] = row.slice(3, 14);
            const bindings = meta.mode_bindings[meta.mode] || row.slice(3, 14);
            let images = bindings.slice(0, 9).filter(Boolean);
            let audio = bindings[9] || "";
            let video = bindings[10] || "";
            if (meta.mode === "text") images = [];
            else if (meta.mode === "first_frame") images = images.slice(0, 1);
            else if (meta.mode === "first_last") images = images.slice(0, 2);
            else images = images.filter(ref => ref !== "previous_segment_last_frame");
            if (meta.mode !== "reference") audio = "";
            if (!["reference", "continue"].includes(meta.mode)) video = "";
            if (meta.mode === "continue") {
                const refs = root.sceneDirectorMediaRefsFromValue(video, "video");
                video = root.sceneDirectorSerializeMediaRefs(refs.slice(0, 1));
            }
            row.splice(3, 11, ...images, ...Array(9 - images.length).fill(""), audio, video);
            root.sceneDirectorSetSelectedImageRefs?.(rowNode, images);
            root.sceneDirectorSetSelectedMediaRefs?.(rowNode, "audio", audio);
            root.sceneDirectorSetSelectedMediaRefs?.(rowNode, "video", video);
        }
        const hasDependency = row.slice(3, 12).includes("previous_segment_last_frame") || String(row[13]).includes("previous_segment");
        if (hasDependency && !meta.source_segment_id && index > 0) meta.source_segment_id = rows[index - 1]?.[META]?.id || "";
        row[META] = meta;
        rowNode.__h3Meta = { ...meta };
        return row;
    }
    function snapshot(action, segmentId) {
        const editorRoot = query("#scene_director_editor_root");
        if (editorRoot && root.sceneDirectorRowsFromEditor) root.sceneDirectorWriteRows(root.sceneDirectorRowsFromEditor(editorRoot));
        let editor = {};
        try { editor = JSON.parse(root.sceneDirectorEditorField()?.value || "{}"); } catch (_error) {}
        return {
            action, segment_id: segmentId, editor,
            media_state: root.sceneDirectorMediaStateField()?.value || "{}",
            width: root.sceneDirectorControlValue("#scene_director_width"),
            height: root.sceneDirectorControlValue("#scene_director_height"),
            fps: root.sceneDirectorControlValue("#scene_director_fps"),
            duration: root.sceneDirectorControlValue("#scene_director_duration"),
            nonce: id(),
        };
    }
    function generate(action = "missing", segmentId = "") {
        if (busy || rendering || !isFamily() || !root.sceneDirectorGenerateEnabled?.()) return;
        const button = query("#generate_button")?.querySelector("button") || query("#generate_button");
        if (!button || button.disabled) return;
        write("request", snapshot(action, segmentId));
        specialClick = true;
        button.click();
        specialClick = false;
    }
    function action(request) {
        if (request.action === "cancel") {
            write("cancel", { nonce: id() });
            return;
        }
        if ((busy || rendering) && request.action !== "refresh") return;
        if (refreshPending && ["preview", "export"].includes(request.action)) return;
        clearTimeout(resultTimer);
        resultTimer = null;
        if (["preview", "export", "transition_preview"].includes(request.action)) rendering = true;
        const editor = query("#scene_director_editor_root");
        if (editor && request.action !== "refresh") root.sceneDirectorWriteRows(root.sceneDirectorRowsFromEditor(editor));
        write("action", { ...request, nonce: id() });
        sync();
    }
    function scheduleRefresh() {
        if (!isFamily() || busy || rendering || !root.sceneDirectorGenerateEnabled?.()) return;
        clearTimeout(resultTimer);
        resultTimer = setTimeout(() => action({ action: "refresh" }), 350);
        refreshPending = true;
        results.preview = { ...(results.preview || {}), current: false };
        const exportButton = query('[data-h3-action="export"]');
        if (exportButton) exportButton.disabled = true;
        sync();
    }
    function renderResults() {
        if (!isFamily()) return;
        const editor = query("#scene_director_editor_root");
        if (!editor) return;
        const disabled = busy || rendering || !root.sceneDirectorGenerateEnabled?.();
        editor.querySelectorAll("[data-scene-director-shot]").forEach(row => {
            syncShotControls(row);
            row.querySelectorAll('[data-h3-action="single"], [data-h3-action="affected"]').forEach(button => {
                button.disabled = disabled;
            });
            const shot = (results.shots || []).find(item => item.id === row.__h3Meta?.id);
            const holder = row.querySelector("[data-h3-shot-results]");
            if (!holder) return;
            const versions = shot?.versions || [];
            const versionId = viewedVersions[shot?.id] || shot?.selected || versions[versions.length - 1]?.id;
            const version = versions.find(item => item.id === versionId);
            const labels = { pending: ["Pending", "\u672a\u751f\u6210"], running: ["Generating", "\u751f\u6210\u4e2d"], ready: ["Ready", "\u5df2\u751f\u6210"], stopped: ["Stopped", "\u5df2\u505c\u6b62"], failed: ["Failed", "\u751f\u6210\u5931\u8d25"] };
            const status = shot?.stale ? text("Settings or source changed", "\u53c2\u6570\u6216\u6765\u6e90\u5df2\u53d8\u5316") : text(...(labels[shot?.status] || labels.pending));
            const statusNode = row.querySelector("[data-h3-shot-status]");
            if (statusNode) {
                statusNode.textContent = status;
                statusNode.classList.toggle("h3-stale", !!shot?.stale);
                statusNode.title = shot?.error || "";
            }
            const generate = row.querySelector('[data-h3-action="single"]');
            if (generate) {
                const label = versions.length ? text("Regenerate shot", "\u91cd\u751f\u6210\u672c\u6bb5") : text("Generate shot", "\u751f\u6210\u672c\u6bb5");
                generate.querySelector("span").textContent = label;
                generate.title = label;
                generate.setAttribute("aria-label", label);
            }
            holder.hidden = !versions.length;
            row.classList.toggle("h3-has-result", !!versions.length);
            const html = `<div class="h3-result-toolbar">
                ${versions.length ? `<select data-h3-version aria-label="${text("Result version", "\u7ed3\u679c\u7248\u672c")}">${versions.map((v, i) => `<option value="${escape(v.id)}" ${v.id === versionId ? "selected" : ""}>${text("Version", "\u7248\u672c")} ${i + 1}${v.id === shot.selected ? text(" (selected)", " (\u5df2\u91c7\u7528)") : ""}${!v.available ? text(" (missing)", " (\u6587\u4ef6\u7f3a\u5931)") : ""}</option>`).join("")}</select>${icon("select", "check", text("Use this version", "\u91c7\u7528\u6b64\u7248\u672c"), disabled || !version?.available || versionId === shot.selected)}` : ""}
                ${shot?.stale ? icon("keep", "thumbtack", text("Keep the selected old result", "\u4fdd\u7559\u5df2\u9009\u65e7\u7ed3\u679c"), disabled) : ""}</div>
                ${version?.available ? `<video controls preload="metadata" src="${escape(version.url)}"></video>` : ""}`;
            if (holder.__signature !== html) {
                holder.innerHTML = html;
                holder.__signature = html;
            }
        });
        const exportButton = query('[data-h3-action="export"]');
        if (exportButton) exportButton.disabled = exportButton.disabled || disabled || refreshPending || !results.preview?.current;
    }
    function setResults(value) {
        let next;
        try { next = typeof value === "string" ? JSON.parse(value) : value; } catch (_error) { return; }
        if (!next || next.project_id !== projectId) return;
        if (next.completed_nonce) {
            let request = {};
            try { request = JSON.parse(query("#scene_director_h3_action")?.querySelector("textarea, input")?.value || "{}"); } catch (_error) {}
            if (request.nonce && request.nonce !== next.completed_nonce) return;
        }
        observedResultValue = typeof value === "string" ? value : JSON.stringify(next);
        if (["preview", "export", "transition_preview"].includes(next.completed_action)) rendering = false;
        results = next;
        refreshPending = false;
        sync();
        renderResults();
    }
    function resultActionFailed() {
        rendering = false;
        sync();
        scheduleRefresh();
    }
    function sync() {
        const active = isFamily();
        if (active) {
            const value = query("#scene_director_h3_results")?.querySelector("textarea, input")?.value || "";
            if (value && value !== observedResultValue) {
                observedResultValue = value;
                setResults(value);
            }
        }
        root.document?.documentElement.classList.toggle("simpai-h3-director", active);
        const directorEnabled = active && !!root.sceneDirectorGenerateEnabled?.();
        syncMediaWorkspace(directorEnabled);
        syncGenerationScope(directorEnabled);
        if (active) root.sceneDirectorSetComponentLabel?.("#scene_director_h3_video", "Timeline preview");
        const settings = query("#scene_director_output_accordion");
        // Mount settings once before folding so draft restoration can read their values.
        if (active && settings && !settings.dataset.h3InitialFolded && query("#scene_director_width input")) {
            settings.dataset.h3InitialFolded = "1";
            settings.querySelector("button.label-wrap")?.click();
        }
        const editor = query("#scene_director_editor_root");
        if (!editor) return;
        let toolbar = query("#scene_director_h3_toolbar [data-h3-toolbar]") || editor.querySelector("[data-h3-toolbar]");
        if (!toolbar) {
            toolbar = root.document.createElement("div");
            toolbar.className = "h3-director-toolbar";
            toolbar.dataset.h3Toolbar = "1";
            editor.prepend(toolbar);
        }
        toolbar.hidden = !active;
        const disabled = busy || rendering || !root.sceneDirectorGenerateEnabled?.();
        const rows = Array.from(editor.querySelectorAll("[data-scene-director-shot]"));
        if (active) syncTransitions(editor, rows, disabled);
        const completed = rows.filter(row => {
            const shot = results.shots?.find(item => item.id === row.__h3Meta?.id);
            return shot?.versions?.some(version => version.id === shot.selected && version.available);
        }).length;
        const html = mainToolbar(completed, rows.length, disabled, rows.map(row => row.__h3Meta?.transition).filter(edge => edge?.enabled));
        if (toolbar.__signature !== html) {
            toolbar.innerHTML = html;
            toolbar.__signature = html;
        }
        let output = editor.querySelector("[data-h3-output-toolbar]");
        const timeline = editor.querySelector("[data-scene-director-timeline-preview]");
        if (!output && timeline) {
            output = root.document.createElement("div");
            output.className = "h3-output-toolbar";
            output.dataset.h3OutputToolbar = "1";
            timeline.append(output);
        }
        if (output) {
            output.hidden = !active;
            const included = rows.filter(row => row.querySelector('[data-h3-field="included"]')?.checked !== false);
            const shots = included.map(row => results.shots?.find(shot => shot.id === row.__h3Meta?.id));
            const missing = shots.filter(shot => !shot?.versions?.some(version => version.id === shot.selected && version.available)).length;
            const review = shots.filter(shot => shot?.stale).length;
            const edges = included.map(row => row.__h3Meta?.transition).filter(edge => edge?.enabled);
            const transitions = edges.map(edge => selectedResult(edge.id, "transitions").result);
            const transitionMissing = transitions.filter(item => !item?.versions?.some(version => version.id === item.selected && version.available)).length;
            const transitionError = transitions.find(item => item?.blocked)?.validation_error ||
                (transitions.some(item => item?.stale) ? text("Transitions need updating", "\u8f6c\u573a\u9700\u8981\u66f4\u65b0") : "");
            const orphan = rows.some(row => row.__h3Meta?.transition?.enabled && row.__h3Meta?.included === false);
            const outputHtml = timelineToolbar(disabled, {ready: included.length > 0 && !missing && !review && !transitionMissing && !transitionError && !orphan,
                missing, review, transitionMissing,
                transitionUpdate: !orphan && !review && !missing ? transitionUpdate(transitions) : null,
                transitionError: transitionError || (orphan ? text("A transition source is excluded", "\u8f6c\u573a\u6765\u6e90\u672a\u53c2\u4e0e\u62fc\u63a5") : "")});
            if (output.__signature !== outputHtml) {
                output.innerHTML = outputHtml;
                output.__signature = outputHtml;
            }
        }
        [["#scene_director_media_accordion", text("Project media", "\u9879\u76ee\u7d20\u6750")],
         ["#scene_director_output_accordion", text("Final output settings", "\u6210\u7247\u8f93\u51fa\u8bbe\u7f6e")]].forEach(([selector, title]) => {
            const label = query(selector)?.querySelector("button.label-wrap > span");
            if (active && label && label.textContent !== title) label.textContent = title;
        });
        const onAction = event => {
            const button = event.target.closest("[data-h3-action]");
            if (!button || button.disabled) return;
            event.stopPropagation();
            button.closest("details")?.removeAttribute("open");
            const command = button.dataset.h3Action;
            if (command === "add-gap-transition") {
                if (busy || rendering) return;
                const changed = gapTransition(root.sceneDirectorReadRows(), button.dataset.h3GapFrom, button.dataset.h3GapTo);
                if (!changed) return;
                root.sceneDirectorSetControlValue?.("#scene_director_fps", 24, true);
                root.sceneDirectorWriteRows(changed);
                root.sceneDirectorRenderEditor(changed);
                return;
            }
            if (command === "locate-transition") {
                const group = editor.querySelector(`[data-h3-transition="${button.dataset.h3TransitionLink}"]`);
                group?.scrollIntoView({ block: "center", behavior: "smooth" });
                group?.querySelector("textarea")?.focus({ preventScroll: true });
                return;
            }
            if (command.startsWith("media-")) { showMedia(command.slice(6)); return; }
            if (command === "stop-generation") {
                const stop = query("#stop_button");
                (stop?.querySelector("button") || stop)?.click();
                return;
            }
            const row = button.closest("[data-scene-director-shot]");
            const connection = button.closest("[data-h3-transition]");
            if (["characters", "storyboard"].includes(command) && (row || connection)) {
                button.disabled = true;
                openPromptEditor(connection || row, command).catch(error => root.alert(error.message))
                    .finally(() => { button.disabled = false; });
                return;
            }
            const segmentId = button.dataset.h3SegmentId || connection?.dataset.h3Transition || row?.__h3Meta?.id || "";
            if (["single", "affected", "all", "missing"].includes(command)) generate(command, segmentId);
            else action({ action: command, segment_id: segmentId,
                version_id: button.dataset.h3VersionId || (connection || row)?.querySelector("[data-h3-version]")?.value });
        };
        if (!toolbar.__h3Bound) {
            toolbar.__h3Bound = true;
            toolbar.addEventListener("click", onAction);
        }
        if (!editor.__h3Bound) {
            editor.__h3Bound = true;
            editor.addEventListener("change", event => {
                if (event.target.matches("[data-h3-transition-field], [data-h3-transition-ref]")) {
                    changeTransition(editor, event.target);
                    return;
                }
                const row = event.target.closest("[data-scene-director-shot]");
                if (event.target.matches("[data-h3-field]")) {
                    root.sceneDirectorWriteRows(root.sceneDirectorRowsFromEditor(editor));
                    root.sceneDirectorRefreshEditorPreviews(editor);
                } else if (event.target.matches("[data-h3-version]")) {
                    const connection = event.target.closest("[data-h3-transition]");
                    const sid = connection?.dataset.h3Transition || row?.__h3Meta?.id;
                    if (sid) viewedVersions[sid] = event.target.value;
                    sync();
                }
            });
            editor.addEventListener("input", event => {
                if (event.target.matches('textarea[data-h3-transition-field], input[type="number"][data-h3-transition-field]')) changeTransition(editor, event.target);
            });
            editor.addEventListener("click", onAction);
            const generateRoot = query("#generate_button");
            generateRoot?.addEventListener("click", () => {
                if (!isFamily() || !root.sceneDirectorGenerateEnabled?.()) return;
                if (!specialClick) write("request", snapshot("missing", ""));
                busy = true;
                sync();
                renderResults();
            }, true);
        }
        renderResults();
    }
    function generationFinished() {
        busy = false;
        if (isFamily()) {
            write("request", {});
            sync();
            scheduleRefresh();
        }
    }
    return { META, MODES, capability, isFamily, metadata, defaultMode, editorProject, resetProject,
        controls, collect, shotCapability, syncShotControls, referenceOptions, mediaButton, mainToolbar, timelineToolbar,
        transitionPlan, outputRows, transitionMarkup, transitionUpdate, timelineDrag, timelineGaps, gapTransition, snapTransitions,
        mediaWorkspaceMarkup, syncMediaWorkspace,
        canEditTimeline: () => !busy && !rendering,
        promptContext, promptButtons, openPromptEditor,
        scheduleRefresh, setResults, sync, generationFinished, resultActionFailed, text, escape,
        modeLabel: mode => text(...(LABELS[mode] || LABELS.text)) };
});
