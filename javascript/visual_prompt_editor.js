(function (root) {
    'use strict';
    if (root.SimpAIVisualPromptEditor) return;
    const scriptSource = typeof document !== 'undefined' ? document.currentScript?.src : '';
    let waveformHelperTask = null;
    async function loadWaveformHelper() {
        if (root.SimpAICanvasWorkbenchMediaHelpers?.createAudioWaveformPeaks) return root.SimpAICanvasWorkbenchMediaHelpers.createAudioWaveformPeaks;
        if (!waveformHelperTask && scriptSource && root.SimpAILazyAssetLoader?.loadScriptOnce) {
            const url = new URL(scriptSource);
            url.pathname = url.pathname.replace(/visual_prompt_editor\.js$/, 'canvas_workbench/media_helpers.js');
            waveformHelperTask = root.SimpAILazyAssetLoader.loadScriptOnce(url.href).catch(() => { waveformHelperTask = null; });
        }
        await waveformHelperTask;
        return root.SimpAICanvasWorkbenchMediaHelpers?.createAudioWaveformPeaks;
    }
    const clone = value => JSON.parse(JSON.stringify(value));
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const tokenPattern = /<(Picture|Video|Audio)\s+(\d+)>/g;
    const language = state => String(state?.__lang || '').toLowerCase().startsWith('en');
    const text = (state, en, cn) => language(state) ? en : cn;
    const safeUrl = value => {
        const url = String(value || '').replace(/^\/file=/, '/gradio_api/file=');
        return /^(?:\/(?!\/)|https?:\/\/|blob:|data:image\/(?:png|jpeg|webp);base64,)/i.test(url) ? url : '';
    };
    function mediaFilename(value) {
        try {
            return decodeURIComponent(String(value || '')).replace(/\\/g, '/').split('/').pop().split('?')[0];
        } catch { return ''; }
    }
    function matchingAsset(ref, asset) {
        if (ref.asset_id === asset.asset_id) return true;
        // Gradio copies media to its cache but preserves the stored filename.
        const filename = mediaFilename(asset.preview_url || asset.path);
        return !!filename && filename === mediaFilename(ref.preview_url || ref.preview);
    }
    function sourceIdentity(item) {
        if (String(item.preview || '').startsWith('waveform:')) return '';
        if (item.asset_id) return String(item.asset_id);
        if (!item.preview) return String(item.source_id || item.slot || '');
        let hash = 2166136261;
        for (const char of String(item.preview)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
        return `source:${(hash >>> 0).toString(16)}`;
    }
    function references(inventory = {}) {
        return ['image', 'video', 'audio'].flatMap(kind => (inventory[`${kind}_refs`] || []).map((item, index) => ({
            ...item, kind, token: `<${{ image: 'Picture', video: 'Video', audio: 'Audio' }[kind]} ${index + 1}>`,
            identity: sourceIdentity(item),
        })));
    }
    function normalizeBindings(value) {
        if (!Array.isArray(value)) return [];
        return value.slice(0, 100).filter(item => item && typeof item === 'object' && item.card?.id).map((item, index) => ({
            speaker_id: /^S[1-9]\d*$/.test(item.speaker_id || '') ? item.speaker_id : `S${index + 1}`,
            card: {
                id: String(item.card.id), revision: Number(item.card.revision) || 1,
                name: String(item.card.name || ''), appearance: String(item.card.appearance || ''),
                voice_description: String(item.card.voice_description || ''),
            },
            references: (Array.isArray(item.references) ? item.references : []).slice(0, 12).map(ref => ({
                asset_id: String(ref.asset_id || ''), token: String(ref.token || ''),
                slot: String(ref.slot || ''), identity: String(ref.identity || ''),
            })),
        }));
    }
    function planMediaAttachments(media, inventory, slots) {
        const current = references(inventory);
        const ordered = Array.isArray(slots) ? slots : [];
        const assignments = [], reused = [], skipped = [], seen = new Set();
        for (const asset of media || []) {
            if (!asset.asset_id || seen.has(asset.asset_id)) continue;
            seen.add(asset.asset_id);
            const kind = String(asset.mime || '').startsWith('image/') ? 'image'
                : String(asset.mime || '').startsWith('audio/') ? 'audio' : '';
            if (!kind) throw new Error('unsupported_media_type');
            const candidates = ordered.filter(slot => slot.kind === kind);
            if (!candidates.length) {
                skipped.push({ asset_id: asset.asset_id, kind, reason: 'unsupported_media_kind' });
                continue;
            }
            const existing = current.find(ref => matchingAsset(ref, asset) && ref.kind === kind);
            if (existing) { reused.push({ asset_id: asset.asset_id, slot: existing.slot }); continue; }
            // Append only: filling an earlier gap would renumber existing prompt tokens.
            const occupied = current.filter(ref => ref.kind === kind).map(ref => ref.slot);
            const last = Math.max(-1, ...occupied.map(slot => candidates.findIndex(item => item.key === slot)),
                ...candidates.map((slot, index) => slot.occupied ? index : -1));
            const target = candidates.find((slot, index) => index > last
                && !slot.occupied && !occupied.includes(slot.key)
                && !assignments.some(item => item.slot === slot.key));
            if (!target) throw new Error('reference_capacity');
            assignments.push({ asset_id: asset.asset_id, slot: target.key });
        }
        if (!assignments.length && !reused.length && skipped.length) throw new Error('reference_media_unsupported');
        return { assignments, reused, skipped };
    }
    function validateBindings(bindings, inventory) {
        const refs = references(inventory);
        return normalizeBindings(bindings).flatMap(binding => binding.references.flatMap(saved => {
            const current = refs.find(ref => ref.slot === saved.slot && ref.identity === saved.identity);
            return current?.identity && current.token === saved.token ? [] : [{ name: binding.card.name, token: saved.token }];
        }));
    }
    function serializeDom(node) {
        if (node.nodeType === 3) return node.textContent;
        if (node.nodeType === 1 && node.hasAttribute('data-vpe-raw')) return node.getAttribute('data-vpe-raw');
        if (node.nodeName === 'BR') return '\n';
        return Array.from(node.childNodes || []).map((child, index) => {
            const prefix = index && /^(DIV|P)$/.test(child.nodeName) ? '\n' : '';
            return prefix + serializeDom(child);
        }).join('');
    }
    function renderPrompt(value, refs, characters = [], state = {}) {
        const names = characters.map(card => card.name).filter(Boolean).sort((a, b) => b.length - a.length);
        const escapedNames = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const pattern = new RegExp('<(?:Picture|Video|Audio|Subject)\\s+\\d+>|\\[Shot\\s+\\d+\\]|<\\/?d>|\\[(?:Chinese|English)\\]|^(?:subject_definitions|retention_analysis|summary|detailed_description|integrated_multimodal_description|overall_soundscape|non_diegetic_music):' + (escapedNames.length ? `|${escapedNames.join('|')}` : ''), 'gm');
        let output = '', offset = 0;
        for (const match of String(value).matchAll(pattern)) {
            output += escape(value.slice(offset, match.index));
            const ref = refs.find(item => item.token === match[0]);
            const card = characters.find(item => item.name === match[0]);
            const portrait = card?.media?.find(item => item.mime?.startsWith('image/'));
            const preview = safeUrl(portrait?.preview_url || (ref?.kind === 'image' ? ref.preview_url || ref.preview : ''));
            const kind = card ? 'character' : /^<d>|^<\/d>|^\[(Chinese|English)\]/.test(match[0]) ? 'dialogue' : (ref ? 'media' : 'marker');
            const icon = card ? 'user' : ref?.kind === 'audio' ? 'volume-high' : ref?.kind === 'video' ? 'film' : 'image';
            const label = ref ? text(state, `${ref.kind} ${match[0].match(/\d+/)[0]}`, `${{image: '图片', audio: '声音', video: '视频'}[ref.kind]} ${match[0].match(/\d+/)[0]}`) : match[0];
            output += `<span class="sai-vpe-token is-${kind}" contenteditable="false" data-vpe-raw="${escape(match[0])}" title="${escape(match[0])}">${preview ? `<img src="${escape(preview)}" alt="">` : (card || ref ? `<i class="fa-solid fa-${icon}"></i> ` : '')}${escape(label)}</span>`;
            offset = match.index + match[0].length;
        }
        return output + escape(value.slice(offset));
    }
    async function request(action, payload, state) {
        const controller = /^(voice|image)-/.test(action) ? new AbortController() : null;
        const timer = controller && root.setTimeout(() => controller.abort(),
            /-(poll|stop)$/.test(action) ? 15000 : 120000);
        try {
            const response = await fetch(`/describe-image/visual-characters/${action}`, {
                method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, user_did: state?.user_did || state?.__user_did || '', __lang: state?.__lang }),
                ...(controller ? { signal: controller.signal } : {}),
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                const code = action.startsWith('image-') && result.error === 'unknown_character_action'
                    ? 'character_image_service_outdated' : result.error || `HTTP ${response.status}`;
                const error = new Error(code);
                error.status = response.status;
                throw error;
            }
            return result;
        } catch (error) {
            if (error.name === 'AbortError') throw new Error(action.startsWith('image-') ? 'image_request_timeout' : 'voice_request_timeout');
            throw error;
        } finally {
            if (timer) root.clearTimeout(timer);
        }
    }
    function voiceDefaults(voice, state) {
        return {
            instruction: '', sample_text: text(state,
                'Hello. It is good to meet you. Let us begin our story.',
                '你好，很高兴见到你。让我们从这里开始，讲述一段新的故事。'),
            language: language(state) ? 'English' : 'Chinese', seed: 0, ...(voice || {}),
        };
    }
    function addGeneratedVoice(card, result) {
        if (result.character_id !== card.id || !result.asset?.mime?.startsWith('audio/')) throw new Error('voice_result_missing');
        if (card.media.some(ref => ref.asset_id === result.asset.asset_id)) return;
        if (card.media.filter(ref => ref.mime?.startsWith('audio/')).length >= 3) throw new Error('too_many_audios');
        card.media.push(clone(result.asset));
    }
    function imagePresetRoute(entry) {
        if (!entry || ['video', 'audio'].includes(entry.engine_type || entry.default_engine?.engine_type)
                || ['video', 'audio'].includes(entry.media_capability?.output_type)
                || entry.media_capability?.interaction_requirements?.length) return null;
        const themes = entry.schema?.themes || [];
        const theme = themes.find(key => entry.schema?.per_theme?.[key]?.supported_tasks?.includes('text_to_image'));
        if (theme) return { theme };
        const tasks = entry.media_capability?.supported_tasks;
        if (tasks?.length && !tasks.includes('text_to_image')) return null;
        if (!tasks?.length && /edit|kontext|inpaint|outpaint|repair|pose|a2r/i.test(`${entry.name} ${entry.task_method || ''}`)) return null;
        return { theme: entry.schema?.default_theme || themes[0] || '' };
    }
    function addGeneratedImage(card, result) {
        if (result.character_id !== card.id || !result.asset?.mime?.startsWith('image/')) throw new Error('character_image_result_missing');
        if (card.media.some(ref => ref.asset_id === result.asset.asset_id)) return;
        if (card.media.filter(ref => ref.mime?.startsWith('image/')).length >= 9) throw new Error('too_many_images');
        card.media.unshift(clone(result.asset));
    }
    function audioTime(value) {
        const seconds = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    function waveformBars(values) {
        return (Array.isArray(values) ? values : []).slice(0, 160)
            .filter(value => Number.isFinite(Number(value))).map(value =>
                `<i style="height:${Math.max(2, Math.min(100, Math.abs(Number(value)) * 100)).toFixed(2)}%"></i>`).join('');
    }
    function audioPlayerHtml(ref, state) {
        const url = safeUrl(ref.preview_url || ref.preview);
        if (!url) return '';
        const bars = waveformBars(ref.waveform);
        const label = ref.name || text(state, 'Character voice', '角色声音');
        return `<div class="sai-vpe-audio" data-vpe-audio>
<audio src="${escape(url)}" preload="metadata" hidden></audio>
<button type="button" data-vpe-audio-toggle title="${escape(text(state, 'Play', '播放'))}" aria-label="${escape(text(state, `Play ${label}`, `播放 ${label}`))}" data-vpe-audio-label="${escape(label)}"><i class="fa-solid fa-play"></i></button>
<div class="sai-vpe-wave-track"><div class="sai-vpe-wave-bars" data-vpe-waveform${bars ? ' data-ready="true"' : ''} aria-hidden="true">${bars}</div><div class="sai-vpe-wave-bars is-played" data-vpe-waveform-played aria-hidden="true">${bars}</div><b class="sai-vpe-wave-cursor" aria-hidden="true"></b>
<input type="range" data-vpe-audio-seek min="0" max="1000" step="1" value="0" disabled aria-label="${escape(text(state, `Seek ${label}`, `试听位置 ${label}`))}"></div>
<output data-vpe-audio-time>0:00 / ${audioTime(ref.duration)}</output>
<span data-vpe-audio-error role="status" hidden></span></div>`;
    }
    function previewPlacement(anchor, viewport, image = {}) {
        const margin = 12, gap = 10;
        const maxWidth = Math.max(1, Math.min(480, viewport.width - margin * 2));
        const maxHeight = Math.max(1, Math.min(360, viewport.height - margin * 2 - 36));
        const naturalWidth = Number(image.width) || 480, naturalHeight = Number(image.height) || 320;
        const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
        const width = Math.max(1, naturalWidth * scale);
        const imageHeight = Math.max(1, naturalHeight * scale), height = imageHeight + 36;
        const left = Math.max(margin, Math.min(anchor.left, viewport.width - width - margin));
        const below = anchor.bottom + gap;
        const top = below + height <= viewport.height - margin ? below
            : Math.max(margin, Math.min(anchor.top - height - gap, viewport.height - height - margin));
        return { left, top, width, imageHeight };
    }
    function createMediaPreviewController(host, state) {
        const t = (en, cn) => text(state, en, cn);
        const players = new Set(), peaks = new Map(), controllers = new Set();
        let disposed = false, previewAnchor = null;
        const preview = document.createElement('div');
        preview.className = 'sai-vpe-image-preview';
        preview.hidden = true;
        preview.setAttribute('role', 'tooltip');
        preview.innerHTML = '<img alt=""><span></span>';
        // This is a sibling of the dialog, outside every scrolling/editor container.
        host.appendChild(preview);
        const hidePreview = () => { preview.hidden = true; previewAnchor = null; };
        const positionPreview = () => {
            if (!previewAnchor?.isConnected) { hidePreview(); return; }
            const image = preview.querySelector('img');
            const box = previewPlacement(previewAnchor.getBoundingClientRect(),
                { width: root.innerWidth, height: root.innerHeight },
                { width: image.naturalWidth, height: image.naturalHeight });
            Object.assign(preview.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px` });
            image.style.height = `${box.imageHeight}px`;
        };
        preview.querySelector('img').addEventListener('load', positionPreview);
        preview.querySelector('img').addEventListener('error', hidePreview);
        host.addEventListener('pointerover', event => {
            const token = event.target.closest?.('.sai-vpe-token');
            const image = token?.querySelector('img') || (event.target.matches?.('img') ? event.target : null);
            if (!image || preview.contains(image)) return;
            const anchor = token || image;
            if (previewAnchor === anchor) return;
            const url = safeUrl(image.currentSrc || image.src);
            if (!url) return;
            previewAnchor = anchor;
            const label = token?.getAttribute('data-vpe-raw')
                || image.closest('.sai-vpe-character')?.querySelector('strong')?.textContent
                || t('Character reference', '角色参考图');
            preview.querySelector('img').src = url;
            preview.querySelector('img').alt = label;
            preview.querySelector('span').textContent = label;
            preview.hidden = false; positionPreview();
        });
        host.addEventListener('pointerout', event => {
            if (previewAnchor && !previewAnchor.contains(event.relatedTarget)) hidePreview();
        });
        host.addEventListener('scroll', hidePreview, true);
        host.addEventListener('pointerdown', hidePreview);
        root.addEventListener('resize', hidePreview);

        async function loadWaveform(audio, bars, played, error) {
            if (bars.dataset.ready || disposed) return;
            const url = audio.currentSrc || audio.src;
            const helper = await loadWaveformHelper();
            if (disposed || !bars.isConnected) return;
            if (!helper) {
                error.textContent = t('Waveform unavailable; audio playback is still available.', '波形暂不可用，仍可试听音频。');
                error.hidden = false; return;
            }
            if (!peaks.has(url)) {
                const controller = new AbortController();
                controllers.add(controller);
                peaks.set(url, (async () => {
                    try {
                        const response = await fetch(url, { signal: controller.signal });
                        if (!response.ok || Number(response.headers.get('content-length')) > 20 * 1024 * 1024) return [];
                        const blob = await response.blob();
                        return !disposed && blob.size <= 20 * 1024 * 1024 ? await helper(blob, 96) : [];
                    } catch { return []; }
                    finally { controllers.delete(controller); }
                })());
            }
            const values = await peaks.get(url);
            if (!disposed && bars.isConnected) {
                const html = waveformBars(values);
                bars.innerHTML = html; played.innerHTML = html;
                if (html) bars.dataset.ready = 'true';
                else {
                    peaks.delete(url);
                    error.textContent = t('Waveform unavailable; audio playback is still available.', '波形暂不可用，仍可试听音频。');
                    error.hidden = false;
                }
            }
        }
        function release(audio) {
            audio.pause(); audio.removeAttribute('src'); audio.load();
            players.delete(audio);
        }
        function sync() {
            hidePreview();
            for (const audio of players) if (!host.contains(audio)) release(audio);
            host.querySelectorAll('[data-vpe-audio]').forEach(player => {
                const audio = player.querySelector('audio');
                if (players.has(audio)) return;
                players.add(audio);
                const toggle = player.querySelector('[data-vpe-audio-toggle]');
                const seek = player.querySelector('[data-vpe-audio-seek]');
                const output = player.querySelector('[data-vpe-audio-time]');
                const error = player.querySelector('[data-vpe-audio-error]');
                const bars = player.querySelector('[data-vpe-waveform]');
                const played = player.querySelector('[data-vpe-waveform-played]');
                let scrubbing = false;
                const update = () => {
                    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
                    const ratio = duration > 0 ? Math.max(0, Math.min(1, audio.currentTime / duration)) : 0;
                    player.style.setProperty('--vpe-playhead', `${(ratio * 100).toFixed(3)}%`);
                    if (!scrubbing) seek.value = String(Math.round(ratio * 1000));
                    seek.disabled = duration <= 0 || !!audio.error;
                    seek.setAttribute('aria-valuetext', `${audioTime(audio.currentTime)} / ${audioTime(duration)}`);
                    output.textContent = `${audioTime(audio.currentTime)} / ${audioTime(duration)}`;
                    toggle.title = audio.paused ? t('Play', '播放') : t('Pause', '暂停');
                    toggle.setAttribute('aria-label', `${toggle.title} ${toggle.dataset.vpeAudioLabel}`);
                    toggle.querySelector('i').className = `fa-solid fa-${audio.paused ? 'play' : 'pause'}`;
                };
                const play = async () => {
                    for (const other of players) if (other !== audio) other.pause();
                    error.hidden = true;
                    try { await audio.play(); }
                    catch (failure) {
                        if (failure.name !== 'AbortError' && !disposed && host.contains(audio)) {
                            error.textContent = t('Audio could not be played.', '音频无法播放。'); error.hidden = false;
                        }
                    }
                    if (disposed || !host.contains(audio)) audio.pause();
                    else update();
                };
                toggle.addEventListener('click', event => {
                    event.stopPropagation();
                    if (audio.paused) { audio.ontimeupdate = null; if (audio.error) audio.load(); play(); loadWaveform(audio, bars, played, error); }
                    else audio.pause();
                });
                seek.addEventListener('pointerdown', () => { scrubbing = true; audio.ontimeupdate = null; });
                const endScrub = () => { scrubbing = false; update(); };
                seek.addEventListener('pointerup', endScrub);
                seek.addEventListener('pointercancel', endScrub);
                seek.addEventListener('lostpointercapture', endScrub);
                seek.addEventListener('input', () => {
                    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
                    audio.ontimeupdate = null;
                    audio.currentTime = Math.min(audio.duration, audio.duration * Number(seek.value) / 1000);
                    update();
                    if (audio.paused && audio.currentTime < audio.duration) play();
                });
                for (const event of ['timeupdate', 'durationchange', 'pause', 'ended', 'seeking', 'seeked']) audio.addEventListener(event, update);
                audio.addEventListener('play', () => {
                    for (const other of players) if (other !== audio) other.pause();
                    update();
                });
                audio.addEventListener('loadedmetadata', () => { update(); loadWaveform(audio, bars, played, error); });
                audio.addEventListener('error', () => {
                    if (disposed || !host.contains(audio)) return;
                    error.textContent = t('Audio could not be loaded.', '音频无法加载。'); error.hidden = false; update();
                });
                if (audio.readyState >= 1) { update(); loadWaveform(audio, bars, played, error); }
            });
        }
        return {
            sync, hidePreview,
            pauseAll() { for (const audio of players) audio.pause(); },
            dispose() {
                disposed = true; hidePreview();
                root.removeEventListener('resize', hidePreview);
                for (const controller of controllers) controller.abort();
                for (const audio of players) release(audio);
                peaks.clear(); preview.remove();
            },
        };
    }
    let active = null;
    function open(options = {}) {
        if (typeof document === 'undefined') return null;
        active?.close();
        if (active) return active.host;
        const state = options.langState || root.simpleaiTopbarSystemParams || {};
        const t = (en, cn) => text(state, en, cn);
        let inventory = options.inventory || {};
        let refs = references(inventory);
        let value = String(options.value || '');
        const targets = options.targets || [];
        let targetId = options.activeTarget || targets[0]?.id || '';
        const targetValues = Object.fromEntries(targets.map(target => [target.id, String(target.value || '')]));
        if (targets.length) value = targetValues[targetId] || '';
        let bindings = normalizeBindings(options.bindings);
        let cards = [], draft = null, dirty = false, busy = false, composing = false;
        let usingCard = '';
        let rawMode = false, savedSelection = { start: value.length, end: value.length }, mentionStart = null;
        let history = [], redo = [], lastSnapshot = { value, bindings: clone(bindings), targets: clone(targetValues) };
        let voiceJob = null, voiceTimer = null, pollingVoice = false;
        let imageJob = null, imageTimer = null, pollingImage = false;
        let imageMessage = '';
        let imagePresets = [], imagePresetsLoading = false, imagePresetsLoaded = false;
        const previousFocus = document.activeElement;
        const host = document.createElement('div');
        host.className = 'sai-vpe-backdrop';
        const button = (action, icon, label) => `<button type="button" data-vpe-action="${action}" title="${escape(label)}" aria-label="${escape(label)}"><i class="fa-solid fa-${icon}"></i></button>`;
        host.innerHTML = `<section class="sai-vpe-dialog" role="dialog" aria-modal="true" aria-label="${escape(t('Characters & prompts', '角色与提示词'))}">
<header><strong>${escape(t('Characters & prompts', '角色与提示词'))}</strong><div class="sai-vpe-actions">${button('undo', 'rotate-left', t('Undo', '撤销'))}${button('redo', 'rotate-right', t('Redo', '重做'))}${button('close', 'xmark', t('Close', '关闭'))}</div></header>
<div class="sai-vpe-body"><aside class="sai-vpe-library">
<div class="sai-vpe-actions"><strong>${escape(t('Character library', '角色库'))}</strong>${button('new', 'plus', t('New audiovisual character', '新建视听角色'))}${button('refresh', 'arrows-rotate', t('Refresh', '刷新'))}</div>
<select data-vpe-category aria-label="${escape(t('Category', '分类'))}"><option value="audiovisual">${escape(t('Audiovisual', '视听创作'))}</option><option value="roleplay">${escape(t('Roleplay', '角色扮演'))}</option><option value="all">${escape(t('All', '全部'))}</option></select>
<input type="search" data-vpe-search aria-label="${escape(t('Search characters', '搜索角色'))}" placeholder="${escape(t('Search characters', '搜索角色'))}">
<div data-vpe-cards class="sai-vpe-cards"></div>
<strong>${escape(t('Current references', '当前参考素材'))}</strong><div data-vpe-refs class="sai-vpe-refs"></div>
</aside><main class="sai-vpe-main">${targets.length ? `<label class="sai-vpe-target">${escape(t('Editing', '编辑位置'))}<select data-vpe-target>${targets.map(target => `<option value="${escape(target.id)}"${target.id === targetId ? ' selected' : ''}>${escape(target.label)}</option>`).join('')}</select></label>` : ''}<div class="sai-vpe-mode" role="group" aria-label="${escape(t('Editing mode', '编辑模式'))}"><button type="button" data-vpe-mode="visual" aria-pressed="true">${escape(t('Visual', '可视化'))}</button><button type="button" data-vpe-mode="raw" aria-pressed="false">${escape(t('Source', '原文'))}</button></div>
<div class="sai-vpe-rich" data-vpe-rich contenteditable="true" role="textbox" aria-multiline="true" aria-label="${escape(t('Prompt', '提示词'))}" spellcheck="false"></div>
<textarea data-vpe-raw-editor class="sai-vpe-raw" aria-label="${escape(t('Prompt source', '提示词原文'))}" hidden spellcheck="false"></textarea>
<div data-vpe-mentions class="sai-vpe-mentions" role="listbox" hidden></div>
<div data-vpe-bindings class="sai-vpe-bindings"></div>
</main><aside class="sai-vpe-detail" data-vpe-detail hidden></aside></div>
<footer><span data-vpe-status role="status" aria-live="polite"></span><div class="sai-vpe-actions"><button type="button" data-vpe-action="close">${escape(t('Cancel', '取消'))}</button><button type="button" data-vpe-action="apply" class="is-primary"><i class="fa-solid fa-check"></i> ${escape(targets.length ? t('Apply to storyboard', '写回分镜表') : t('Apply', '应用'))}</button></div></footer></section>`;
        const query = selector => host.querySelector(selector);
        const mediaPreviews = createMediaPreviewController(host, state);
        const rich = query('[data-vpe-rich]'), raw = query('[data-vpe-raw-editor]');
        const status = message => { query('[data-vpe-status]').textContent = message; };
        const imageStatus = message => {
            imageMessage = message;
            status(message);
            const output = query('[data-vpe-image-status]');
            if (output) { output.textContent = message; output.hidden = !message; }
        };
        const errorText = error => {
            const code = error?.message || String(error);
            const messages = {
                character_image_prompt_required: t('Enter an appearance or image prompt.', '请填写外观描述或生图提示词。'),
                character_image_service_outdated: t('Studio has not loaded character image generation yet. Restart Studio, then refresh this page.', '当前 Studio 尚未加载角色生图接口。请重启 Studio，再刷新页面。'),
                character_image_preset_required: t('Select an image preset.', '请选择生图预设。'),
                character_image_models_missing: t('The selected preset has missing models. Choose an installed preset.', '所选预设缺少模型，请选择已安装模型的预设。'),
                character_image_run_not_found: t('This image task is unavailable.', '生图任务已不可用。'),
                character_image_result_missing: t('The task did not return one character sheet.', '任务未返回一张有效的角色设定图。'),
                character_image_save_failed: t('The generated sheet could not be saved. Check progress to retry.', '生成图片保存失败，可检查进度重试。'),
                image_request_timeout: t('Image request timed out. Check progress to retry.', '生图请求超时，可检查进度重试。'),
                image_api_unavailable: t('Image generation is unavailable. Reload the page.', '生图模块未加载，请刷新页面。'),
                character_name_required: t('Enter a character name.', '请填写角色名称。'),
                character_revision_conflict: t('This card changed elsewhere. Refresh before saving.', '角色卡已在其他位置修改，请刷新后重新编辑。'),
                unsupported_or_oversized_media: t('Unsupported media, or file exceeds 20 MB.', '媒体格式不支持，或文件超过 20 MB。'),
                asset_not_found: t('Reference asset is unavailable.', '参考素材已不可用。'),
                reference_capacity: t('Not enough appendable reference slots. Existing inputs were not replaced.', '可追加的参考槽位不足，未替换现有输入。'),
                reference_media_unsupported: t('This preset does not accept the reference types on this card. Use a character with compatible media or insert its description.', '当前预设不接收这张卡片的素材类型，可选择含适用素材的角色或使用角色描述。'),
                media_slot_occupied: t('A reference slot is now occupied. Refresh and retry.', '参考槽位已被占用，请刷新后重试。'),
                invalid_trim_range: t('Enter a valid audio time range.', '请输入有效的音频起止时间。'),
                audio_trim_unavailable: t('Audio trimming requires ffmpeg.', '当前音频裁剪需要 ffmpeg。'),
                audio_trim_failed: t('Audio trimming failed. The original is unchanged.', '音频裁剪失败，原音频未改变。'),
                media_apply_timeout: t('Input update timed out. Check the input slots before retrying.', '输入更新超时，请检查素材槽位后重试。'),
                voice_style_model_unavailable: t('Enable and configure the existing VLM before expanding voice style.', '请先启用并配置项目已有的 VLM，再生成声音风格。'),
                voice_style_empty: t('No voice style was returned.', '声音风格生成结果为空。'),
                voice_style_failed: t('Voice style generation failed. Your existing style is unchanged.', '声音风格生成失败，原有风格未改变。'),
                voice_design_fields_required: t('Enter voice style and sample text.', '请填写声音风格和试听文本。'),
                voice_run_not_found: t('This voice task is unavailable or belongs to another user.', '音色任务不存在、已过期或不属于当前用户。'),
                voice_request_timeout: t('Request timed out. The voice task may still be running.', '请求超时，音色任务可能仍在运行。'),
                voice_generation_failed: t('Voice generation failed. Existing media is unchanged.', '音色生成失败，原有素材未改变。'),
                voice_result_missing: t('No valid character audio was returned.', '没有返回有效的角色音频。'),
                too_many_audios: t('A character supports up to three audio references.', '每个角色最多保存三段参考声音。'),
                invalid_voice_seed: t('Seed must be an integer from 0 to 2147483647.', '种子需为 0 到 2147483647 之间的整数。'),
                invalid_voice_language: t('Select a supported voice language.', '请选择支持的语音语言。'),
            };
            return messages[code] || `${t('Operation failed', '操作失败')}: ${code}`;
        };
        function selection() {
            if (rawMode) return { start: raw.selectionStart, end: raw.selectionEnd };
            const selected = root.getSelection();
            if (!selected?.rangeCount || !rich.contains(selected.anchorNode) || !rich.contains(selected.focusNode)) return savedSelection;
            const range = selected.getRangeAt(0);
            const before = range.cloneRange();
            before.selectNodeContents(rich);
            before.setEnd(range.startContainer, range.startOffset);
            const start = serializeDom(before.cloneContents()).length;
            return { start, end: start + serializeDom(range.cloneContents()).length };
        }
        function restoreCaret(offset) {
            if (rawMode) { raw.focus(); raw.setSelectionRange(offset, offset); return; }
            rich.focus();
            const range = document.createRange();
            let remaining = offset, placed = false;
            for (const child of rich.childNodes) {
                const length = serializeDom(child).length;
                if (remaining <= length) {
                    if (child.nodeType === 3) range.setStart(child, remaining);
                    else if (remaining === 0) range.setStartBefore(child);
                    else range.setStartAfter(child);
                    placed = true; break;
                }
                remaining -= length;
            }
            if (!placed) { range.selectNodeContents(rich); range.collapse(false); }
            range.collapse(true);
            const selected = root.getSelection();
            selected.removeAllRanges(); selected.addRange(range);
            savedSelection = { start: offset, end: offset };
        }
        function record() {
            const next = { value, bindings: clone(bindings), targets: { ...targetValues, ...(targetId ? { [targetId]: value } : {}) } };
            if (JSON.stringify(next) === JSON.stringify(lastSnapshot)) return;
            history.push(lastSnapshot);
            if (history.length > 100) history.shift();
            redo = []; lastSnapshot = next;
        }
        function renderText(caret) {
            mediaPreviews.hidePreview();
            rich.innerHTML = renderPrompt(value, refs, bindings.map(binding => cards.find(card => card.id === binding.card.id) || binding.card), state);
            raw.value = value;
            if (caret !== undefined) restoreCaret(caret);
            query('[data-vpe-action="undo"]').disabled = !history.length;
            query('[data-vpe-action="redo"]').disabled = !redo.length;
            query('[data-vpe-bindings]').innerHTML = bindings.map((binding, index) =>
                `<div class="sai-vpe-binding"><div class="sai-vpe-binding-title"><strong>${escape(binding.card.name)}</strong><small>${escape(binding.speaker_id)}</small><button type="button" data-vpe-unbind="${index}" title="${escape(t('Remove binding', '移除绑定'))}" aria-label="${escape(t('Remove binding', '移除绑定'))}"><i class="fa-solid fa-xmark"></i></button></div>${['Picture', 'Audio'].map(kind => {
                    const assigned = binding.references.filter(ref => ref.token.startsWith(`<${kind} `));
                    const label = kind === 'Picture' ? t('Appearance', '外观参考') : t('Voice', '声音参考');
                    return `<div class="sai-vpe-binding-media"><span>${escape(label)}</span>${assigned.length ? assigned.map(saved => {
                        const current = refs.find(ref => ref.slot === saved.slot && ref.identity === saved.identity);
                        const preview = kind === 'Picture' ? safeUrl(current?.preview_url || current?.preview) : '';
                        return `<button type="button" data-vpe-insert="${escape(saved.token)}" title="${escape(saved.token)}">${preview ? `<img src="${escape(preview)}" alt="">` : `<i class="fa-solid fa-${kind === 'Picture' ? 'image' : 'volume-high'}"></i>`}<span>${escape(saved.token)}</span></button>`;
                    }).join('') : `<small>${escape(t('Not assigned', '未关联'))}</small>`}</div>`;
                }).join('')}</div>`).join('');
        }
        function insert(inserted, character, keepText = false) {
            const { start, end } = savedSelection;
            const from = mentionStart ?? start;
            const definitionTarget = options.definitionTarget;
            const atDefinitions = character?.references?.length && definitionTarget && targetId === definitionTarget;
            if (!atDefinitions && !keepText) value = value.slice(0, from) + inserted + value.slice(end);
            let caret = keepText ? end : from + inserted.length;
            if (character && definitionTarget) {
                const api = root.SimpAIH3StoryboardEditor;
                if (definitionTarget === 'prompt' && api) {
                    value = api.definePromptCharacters(value, [character], state, true);
                    caret = value.length;
                } else if (Object.hasOwn(targetValues, definitionTarget) && api) {
                    targetValues[targetId] = value;
                    targetValues[definitionTarget] = api.characterSubjectDefinitions(targetValues[definitionTarget], [character], state, true);
                    if (atDefinitions) { value = targetValues[definitionTarget]; caret = value.length; }
                }
            }
            mentionStart = null; query('[data-vpe-mentions]').hidden = true;
            record(); renderText(caret);
        }
        function mediaHtml(ref) {
            const url = safeUrl(ref.preview_url || ref.preview);
            if (!url) return '<i class="fa-solid fa-file"></i>';
            if (String(ref.mime || ref.kind).startsWith('image')) return `<img src="${escape(url)}" alt="" loading="lazy">`;
            if (String(ref.mime || ref.kind).startsWith('audio')) return audioPlayerHtml(ref, state);
            return `<video src="${escape(url)}" controls preload="none"></video>`;
        }
        function renderCards() {
            const filter = query('[data-vpe-search]').value.toLowerCase();
            query('[data-vpe-cards]').innerHTML = cards.filter(card => `${card.name} ${card.appearance}`.toLowerCase().includes(filter)).map(card => {
                const image = card.media?.find(ref => ref.mime?.startsWith('image/'));
                const voice = card.media?.find(ref => ref.mime?.startsWith('audio/'));
                return `<article class="sai-vpe-character${bindings.some(binding => binding.card.id === card.id) ? ' is-used' : ''}">
<button type="button" data-vpe-card="${escape(card.id)}" class="sai-vpe-portrait" aria-label="${escape(t(`Use ${card.name}`, `使用 ${card.name}`))}">${image ? mediaHtml(image) : `<span class="sai-vpe-monogram">${escape(Array.from(card.name || '?').slice(0, 2).join(''))}</span>`}</button>
<div class="sai-vpe-card-heading"><strong>${escape(card.name)}</strong><button type="button" data-vpe-edit="${escape(card.id)}" aria-label="${escape(t(`Edit ${card.name}`, `编辑 ${card.name}`))}" title="${escape(t('Edit character', '编辑角色'))}"><i class="fa-solid fa-pen"></i></button></div>
<small>${escape(card.category === 'roleplay' ? t('Roleplay', '角色扮演') : t('Audiovisual', '视听创作'))}${voice ? ` · ${escape(t('Voice ready', '已有音色'))}` : ''}</small>
<p class="sai-vpe-card-description">${escape(card.appearance || card.voice_description || t('No description', '暂无描述'))}</p>
${voice ? mediaHtml(voice) : ''}
<button type="button" class="sai-vpe-use" data-vpe-card="${escape(card.id)}"><i class="fa-solid fa-plus"></i> ${escape(t('Use character', '使用角色'))}</button></article>`;
            }).join('') || `<p>${escape(t('No characters', '暂无角色'))}</p>`;
            updateUseControls();
            mediaPreviews.sync();
        }
        function updateUseControls() {
            host.querySelectorAll('button,input,textarea,select').forEach(element => {
                if (usingCard) {
                    if (!element.hasAttribute('data-vpe-use-disabled')) element.dataset.vpeUseDisabled = String(element.disabled);
                    element.disabled = true;
                } else if (element.hasAttribute('data-vpe-use-disabled')) {
                    element.disabled = element.dataset.vpeUseDisabled === 'true';
                    delete element.dataset.vpeUseDisabled;
                }
                if (element.matches('.sai-vpe-use[data-vpe-card]')) {
                    const pending = element.dataset.vpeCard === usingCard;
                    element.innerHTML = `<i class="fa-solid fa-${pending ? 'spinner fa-spin' : 'plus'}"></i> ${escape(pending ? t('Adding...', '正在使用...') : t('Use character', '使用角色'))}`;
                }
            });
            rich.contentEditable = usingCard || voiceJob || imageJob ? 'false' : 'true';
            if (!usingCard && !voiceJob && !imageJob) {
                query('[data-vpe-action="undo"]').disabled = !history.length;
                query('[data-vpe-action="redo"]').disabled = !redo.length;
            }
        }
        async function refresh() {
            const result = await request('list', { category: query('[data-vpe-category]').value }, state);
            if (!host.isConnected) return;
            cards = result.characters; renderCards(); renderReferences(); renderText();
        }
        function discardDraft() {
            return !dirty || root.confirm(t('Discard unsaved character changes?', '放弃尚未保存的角色卡修改？'));
        }
        async function saveDraft() {
            if (!draft || (!dirty && draft.id && draft.category !== 'roleplay')) return;
            if (!draft.name?.trim()) throw new Error('character_name_required');
            const card = { ...draft, media_ids: (draft.media || []).map(ref => ref.asset_id) };
            if (card.category === 'roleplay') { card.source_roleplay_id = card.id; delete card.id; delete card.revision; }
            const result = await request('save', { character: card }, state);
            draft = result.character; dirty = false;
            await refresh();
        }
        function draftMediaHtml() {
            return `<div class="sai-vpe-media">${(draft.media || []).map((ref, index) => `
<div class="sai-vpe-media-row" data-vpe-media-index="${index}">
${mediaHtml(ref)}<span>${escape(ref.name || ref.asset_id)}</span>
<button type="button" data-vpe-remove-media="${index}" title="${escape(t('Remove media', '移除素材'))}" aria-label="${escape(t('Remove media', '移除素材'))}"><i class="fa-solid fa-xmark"></i></button>
${ref.mime?.startsWith('audio/') ? `<details class="sai-vpe-audio-tools"><summary>${escape(t('Trim audio', '裁剪声音'))}</summary><div class="sai-vpe-trim">
<label>${escape(t('Start (s)', '开始（秒）'))}<input type="number" min="0" step="0.01" data-vpe-trim-start value="0"></label>
<label>${escape(t('End (s)', '结束（秒）'))}<input type="number" min="0" step="0.01" data-vpe-trim-end value="${escape(ref.duration || '')}"></label>
${button(`preview-trim:${index}`, 'play', t('Preview range', '试听区间'))}${button(`trim:${index}`, 'scissors', t('Trim to new audio', '裁剪为新音频'))}
${ref.trim_source_asset_id ? button(`restore-audio:${index}`, 'rotate-left', t('Restore original audio', '恢复原音频')) : ''}</div></details>` : ''}</div>`).join('')}</div>`;
        }
        function renderImagePresets() {
            const select = query('[data-vpe-field="image_preset"]');
            if (!select || !draft) return;
            const selected = draft.image_preset || (imagePresets.find(entry => entry.name === 'Krea2-Turbo' && !entry.missing)
                || imagePresets.find(entry => !entry.missing) || imagePresets[0])?.name || '';
            select.innerHTML = `<option value="">${escape(imagePresetsLoading ? t('Loading presets...', '正在读取预设…') : t('Select image preset', '选择生图预设'))}</option>`
                + imagePresets.map(entry => `<option value="${escape(entry.name)}"${entry.name === selected ? ' selected' : ''}>${escape(entry.display_name || entry.name)}${entry.missing ? escape(t(' (models missing)', '（缺少模型）')) : ''}</option>`).join('')
                + (selected && !imagePresets.some(entry => entry.name === selected) ? `<option selected value="${escape(selected)}">${escape(selected)} ${escape(t('(unavailable)', '（不可用）'))}</option>` : '');
        }
        async function loadImagePresets() {
            if (imagePresetsLoading) return;
            imagePresetsLoading = true; renderImagePresets();
            try {
                const api = root.SimpAICanvasWorkbenchApi;
                if (!api?.presetCatalog) throw new Error('image_api_unavailable');
                const result = await api.presetCatalog({ user_context: state });
                if (!result?.ok) throw new Error(result?.error || 'image_api_unavailable');
                imagePresets = (result.presets || []).filter(entry => imagePresetRoute(entry));
            } catch (error) { status(errorText(error)); }
            finally {
                imagePresetsLoading = false; imagePresetsLoaded = true;
                if (host.isConnected) renderImagePresets();
            }
        }
        function renderDetail() {
            const detail = query('[data-vpe-detail]');
            const voiceExpanded = detail.querySelector('[data-vpe-voice-section]')?.open;
            detail.hidden = !draft;
            if (!draft) { detail.innerHTML = ''; mediaPreviews.sync(); return; }
            const imported = draft.category === 'roleplay';
            draft.voice = voiceDefaults(draft.voice, state);
            detail.innerHTML = `<div class="sai-vpe-actions"><strong>${escape(t('Edit character', '编辑角色'))}</strong>${button('save-card', 'floppy-disk', imported ? t('Save audiovisual copy', '保存为视听副本') : t('Save character', '保存角色'))}${!imported && draft.id ? button('delete-card', 'trash', t('Delete character', '删除角色')) : ''}${button('close-detail', 'xmark', t('Close character settings', '收起角色设置'))}</div>
<button type="button" class="is-primary sai-vpe-use" data-vpe-action="insert-character"><i class="fa-solid fa-plus"></i> ${escape(t('Use character', '使用角色'))}</button>
<div class="sai-vpe-actions"><strong>${escape(t('Portrait & voice', '角色图片与声音'))}</strong>${button('upload', 'file-arrow-up', t('Upload image or audio', '上传图片或音频'))}<input type="file" data-vpe-upload accept="image/png,image/jpeg,image/webp,audio/wav,audio/mpeg,audio/ogg,audio/flac,audio/mp4" hidden></div>
${draftMediaHtml()}
<label>${escape(t('Name', '名称'))}<input data-vpe-field="name" value="${escape(draft.name)}" maxlength="200"></label>
<label>${escape(t('Appearance', '外观描述'))}<textarea data-vpe-field="appearance" rows="5">${escape(draft.appearance)}</textarea></label>
<section class="sai-vpe-sheet" aria-label="${escape(t('Character sheet', '角色设定图'))}">
<div class="sai-vpe-actions"><strong>${escape(t('Character sheet · 1 image', '角色设定图 · 单张'))}</strong>${button('image-presets', 'arrows-rotate', t('Refresh image presets', '刷新生图预设'))}</div>
<label>${escape(t('Image preset', '生图预设'))}<select data-vpe-field="image_preset"></select></label>
<label>${escape(t('Additional image prompt', '额外生图提示词'))}<textarea data-vpe-field="image_prompt" rows="3" maxlength="12000">${escape(draft.image_prompt || '')}</textarea></label>
<div class="sai-vpe-sheet-layout"><span>${escape(t('White background', '白底'))}</span><span>${escape(t('Close-up + front / side / back', '特写 + 正面 / 侧面 / 背面'))}</span></div>
<div class="sai-vpe-voice-actions"><button type="button" class="is-primary" data-vpe-action="image-start"><i class="fa-solid fa-wand-magic-sparkles"></i> ${escape(t('Generate character sheet', '生成角色设定图'))}</button>
${imageJob ? `${button('image-stop', 'stop', t('Stop image generation', '停止生图'))}${button('image-poll', 'arrows-rotate', t('Check image progress', '检查生图进度'))}<progress data-vpe-image-progress max="1" value="0" aria-label="${escape(t('Image progress', '生图进度'))}"></progress>` : ''}</div>
<p data-vpe-image-status role="status" aria-live="polite"${imageMessage ? '' : ' hidden'}>${escape(imageMessage)}</p></section>
<label>${escape(t('Personality', '性格描述'))}<textarea data-vpe-field="personality" rows="2" maxlength="4000">${escape(draft.personality)}</textarea></label>
<label>${escape(t('Voice', '声音描述'))}<textarea data-vpe-field="voice_description" rows="3">${escape(draft.voice_description)}</textarea></label>
<details data-vpe-voice-section${voiceExpanded || voiceJob ? ' open' : ''}><summary>${escape(t('Voice design', '声音设计'))} · QwenTTS</summary><fieldset class="sai-vpe-voice">
<label>${escape(t('Voice style', '声音风格'))}<textarea data-vpe-voice-field="instruction" rows="3" maxlength="4000">${escape(draft.voice.instruction)}</textarea></label>
<button type="button" data-vpe-action="voice-style"><i class="fa-solid fa-wand-magic-sparkles"></i> ${escape(t('Design voice style', '生成声音风格'))}</button>
<label>${escape(t('Sample text', '试听文本'))}<textarea data-vpe-voice-field="sample_text" rows="3" maxlength="1000">${escape(draft.voice.sample_text)}</textarea></label>
<details><summary>${escape(t('Voice settings', '音色设置'))}</summary><label>${escape(t('Voice language', '语音语言'))}<select data-vpe-voice-field="language">${[
                ['Auto', t('Auto', '自动')], ['Chinese', t('Chinese', '中文')], ['English', t('English', '英文')],
                ['Japanese', t('Japanese', '日语')], ['Korean', t('Korean', '韩语')]
            ].map(([key, label]) => `<option value="${key}"${draft.voice.language === key ? ' selected' : ''}>${escape(label)}</option>`).join('')}</select></label>
<label>${escape(t('Voice seed', '音色种子'))}<input type="number" data-vpe-voice-field="seed" min="0" max="2147483647" step="1" value="${escape(draft.voice.seed)}"></label></details>
<div class="sai-vpe-voice-actions"><button type="button" data-vpe-action="voice-start"><i class="fa-solid fa-microphone"></i> ${escape(t('Generate character voice', '生成角色音色'))}</button>
${voiceJob ? `${button('voice-stop', 'stop', t('Stop voice generation', '停止音色生成'))}${button('voice-poll', 'arrows-rotate', t('Check voice progress', '检查音色进度'))}<progress data-vpe-voice-progress max="1" value="0" aria-label="${escape(t('Voice progress', '音色生成进度'))}"></progress>` : ''}</div></fieldset></details>
<details><summary>${escape(t('Reference settings', '参考素材设置'))}</summary>
${options.onAttachMedia ? `<button type="button" data-vpe-action="attach-media"><i class="fa-solid fa-arrow-right-to-bracket"></i> ${escape(t('Add references only', '仅添加参考素材'))}</button>` : ''}
<div data-vpe-mappings>${(draft.media || []).map(ref => {
                const kind = ref.mime.startsWith('image/') ? 'image' : 'audio';
                return `<label>${escape(ref.name || ref.asset_id)}<select data-vpe-map="${escape(ref.asset_id)}"><option value="">${escape(t('Automatic', '自动选择'))}</option>${refs.filter(item => item.kind === kind).map(item => `<option value="${escape(item.token)}"${matchingAsset(item, ref) ? ' selected' : ''}>${escape(item.token)} ${escape(language(state) ? item.label_en : item.label_cn)}</option>`).join('')}</select></label>`;
            }).join('')}</div>
<button type="button" data-vpe-action="insert-description">${escape(t('Use description only', '仅使用描述'))}</button></details>`;
            lockVoiceControls();
            renderImagePresets();
            if (!imagePresetsLoaded) loadImagePresets();
            mediaPreviews.sync();
        }
        function lockVoiceControls() {
            host.querySelectorAll('button,input,textarea,select').forEach(element => {
                if (['voice-stop', 'voice-poll', 'image-stop', 'image-poll'].includes(element.dataset.vpeAction)) return;
                if (imageJob?.finished && element.dataset.vpeAction === 'close') {
                    element.disabled = false; return;
                }
                if (voiceJob || imageJob) {
                    if (!element.hasAttribute('data-vpe-voice-disabled')) element.dataset.vpeVoiceDisabled = String(element.disabled);
                    element.disabled = true;
                } else if (element.hasAttribute('data-vpe-voice-disabled')) {
                    element.disabled = element.dataset.vpeVoiceDisabled === 'true';
                    delete element.dataset.vpeVoiceDisabled;
                }
            });
            rich.contentEditable = voiceJob || imageJob ? 'false' : 'true';
        }
        async function pollImage(stop = false) {
            if (!imageJob || pollingImage) return;
            root.clearTimeout(imageTimer); pollingImage = true;
            try {
                const result = await request(stop ? 'image-stop' : 'image-poll', { run_id: imageJob.run_id }, state);
                const progress = query('[data-vpe-image-progress]');
                if (progress) progress.value = Number(result.percent) || 0;
                if (['finished', 'failed', 'canceled', 'cancelled', 'stopped'].includes(result.state)) {
                    if (result.state === 'finished') {
                        addGeneratedImage(draft, result); dirty = true;
                        imageJob = null; lockVoiceControls();
                        await saveDraft();
                        imageStatus(t('Character sheet saved as one image.', '单张角色设定图已保存到角色卡。'));
                    } else {
                        imageJob = null; lockVoiceControls();
                        imageStatus(result.state === 'failed' ? t('Image generation failed. ', '生图失败。') + (result.message || '')
                            : t('Image generation stopped.', '生图已停止。'));
                    }
                    renderDetail();
                } else {
                    imageStatus(t('Generating character sheet', '正在生成角色设定图') + ` ${Math.round((Number(result.percent) || 0) * 100)}%`);
                    imageTimer = root.setTimeout(() => pollImage(), 1500);
                }
            } catch (error) {
                if (['character_image_run_not_found', 'character_image_result_missing'].includes(error.message)
                        || [401, 403, 404].includes(error.status)) imageJob = null;
                else if (error.message === 'character_image_save_failed' && imageJob) imageJob.finished = true;
                lockVoiceControls(); renderDetail();
                imageStatus(errorText(error));
            } finally { pollingImage = false; }
        }
        async function pollVoice(stop = false) {
            if (!voiceJob || pollingVoice) return;
            root.clearTimeout(voiceTimer);
            pollingVoice = true;
            try {
                const result = await request(stop ? 'voice-stop' : 'voice-poll', { run_id: voiceJob.run_id }, state);
                const progress = query('[data-vpe-voice-progress]');
                if (progress) progress.value = Number(result.percent) || 0;
                if (['finished', 'failed', 'canceled'].includes(result.state)) {
                    voiceJob = null;
                    lockVoiceControls();
                    if (result.state === 'finished') {
                        addGeneratedVoice(draft, result); dirty = true;
                        await saveDraft();
                        status(t('Voice saved to character.', '音色已保存到角色卡。'));
                    } else {
                        status(result.state === 'canceled' ? t('Voice generation stopped.', '音色生成已停止。')
                            : `${errorText(new Error('voice_generation_failed'))} ${result.details || ''}`);
                    }
                    renderDetail();
                } else {
                    status(t('QwenTTS voice generation', 'QwenTTS 音色生成中') + ` ${Math.round((Number(result.percent) || 0) * 100)}%`);
                    voiceTimer = root.setTimeout(() => pollVoice(), 1500);
                }
            } catch (error) {
                if (error?.message === 'voice_run_not_found' || (error.status >= 400 && error.status < 500) || !voiceJob) {
                    voiceJob = null; lockVoiceControls(); renderDetail();
                    status(errorText(error));
                } else {
                    status(`${errorText(error)} ${t('Use Check voice progress to retry.', '可点击“检查音色进度”重试。')}`);
                }
            } finally { pollingVoice = false; }
        }
        function updateMentions() {
            const menu = query('[data-vpe-mentions]');
            savedSelection = selection();
            const match = value.slice(0, savedSelection.start).match(/@([^\s@<>]*)$/);
            if (!match || savedSelection.start !== savedSelection.end) { menu.hidden = true; mentionStart = null; return; }
            mentionStart = savedSelection.start - match[0].length;
            const needle = match[1].toLowerCase();
            menu.innerHTML = refs.filter(ref => `${ref.token} ${ref.label_cn} ${ref.label_en}`.toLowerCase().includes(needle)).map(ref =>
                `<button type="button" role="option" data-vpe-insert="${escape(ref.token)}">${escape(ref.token)} ${escape(language(state) ? ref.label_en : ref.label_cn)}</button>`).join('') +
                cards.filter(card => card.name.toLowerCase().includes(needle)).map(card =>
                    `<button type="button" role="option" data-vpe-card="${escape(card.id)}"><i class="fa-solid fa-user"></i> ${escape(card.name)}</button>`).join('');
            menu.hidden = !menu.childElementCount;
        }
        function close(force = false) {
            if (imageJob && !imageJob.finished) { status(t('Stop image generation before closing.', '请停止生图后再关闭。')); return; }
            if (voiceJob) { status(t('Stop voice generation before closing.', '请停止音色生成后再关闭。')); return; }
            if (busy || (!force && !discardDraft())) return;
            root.clearTimeout(voiceTimer);
            root.clearTimeout(imageTimer);
            mediaPreviews.dispose();
            host.remove(); if (active?.host === host) active = null;
            previousFocus?.isConnected && previousFocus.focus();
        }
        async function handleAction(action) {
            const skippedNotice = skipped => {
                if (!skipped?.length) return '';
                const kinds = [...new Set(skipped.map(item => item.kind))].map(kind =>
                    kind === 'audio' ? t('audio', '声音') : t('images', '图片')).join(t(', ', '、'));
                return t(` · Skipped ${kinds}: not supported by this preset.`,
                    ` · 已跳过${kinds}：当前预设不接收此类参考素材。`);
            };
            if (action === 'image-presets') { await loadImagePresets(); return; }
            if (action === 'image-poll' || action === 'image-stop') { await pollImage(action === 'image-stop'); return; }
            if (action === 'image-start') {
                if (!draft.appearance?.trim() && !draft.image_prompt?.trim()) throw new Error('character_image_prompt_required');
                const selected = query('[data-vpe-field="image_preset"]')?.value;
                const entry = imagePresets.find(item => item.name === selected);
                if (!entry) throw new Error('character_image_preset_required');
                if (entry.missing) throw new Error('character_image_models_missing');
                const api = root.SimpAICanvasWorkbenchApi;
                if (!api?.buildPresetRunNode) throw new Error('image_api_unavailable');
                imageStatus(t('Saving character and submitting image task...', '正在保存角色并提交生图任务…'));
                if (draft.image_preset !== selected) { draft.image_preset = selected; dirty = true; }
                // Unnamed drafts can generate immediately; the editable card gets a meaningful default name.
                if (!draft.name?.trim()) { draft.name = t('New character', '新角色'); dirty = true; }
                await saveDraft();
                const presetNode = api.buildPresetRunNode(entry, {
                    prompt: draft.appearance, imageNumber: 1, aspectRatio: '3:2',
                    sceneTheme: imagePresetRoute(entry).theme,
                });
                imageJob = await request('image-start', {
                    character_id: draft.id, revision: draft.revision, preset_node: presetNode,
                }, state);
                renderDetail(); imageStatus(t('Character sheet queued.', '角色设定图任务已排队。'));
                imageTimer = root.setTimeout(() => pollImage(), 500);
                return;
            }
            if (action === 'voice-poll' || action === 'voice-stop') { await pollVoice(action === 'voice-stop'); return; }
            if (action === 'voice-style') {
                const result = await request('voice-style', { character: draft }, state);
                draft.voice.instruction = result.instruction; dirty = true; renderDetail();
                status(t('Voice style is ready.', '声音风格已生成。'));
                return;
            }
            if (action === 'voice-start') {
                await saveDraft();
                voiceJob = await request('voice-start', { character_id: draft.id, revision: draft.revision }, state);
                renderDetail();
                status(t('QwenTTS voice task queued.', 'QwenTTS 音色任务已排队。'));
                voiceTimer = root.setTimeout(() => pollVoice(), 500);
                return;
            }
            if (action === 'close') { close(); return; }
            if (action === 'close-detail') { await saveDraft(); draft = null; renderDetail(); return; }
            if (action === 'undo' || action === 'redo') {
                const source = action === 'undo' ? history : redo;
                const target = action === 'undo' ? redo : history;
                if (!source.length) return;
                target.push({ value, bindings: clone(bindings), targets: { ...targetValues, ...(targetId ? { [targetId]: value } : {}) } });
                const snapshot = source.pop(); value = snapshot.value; bindings = clone(snapshot.bindings);
                Object.assign(targetValues, snapshot.targets || {});
                lastSnapshot = clone(snapshot); renderText(value.length); return;
            }
            if (action === 'refresh') { if (discardDraft()) { draft = null; dirty = false; renderDetail(); await refresh(); } return; }
            if (action === 'new') {
                if (dirty) await saveDraft();
                mediaPreviews.pauseAll();
                draft = { name: '', appearance: '', voice_description: '', category: 'audiovisual', media: [], media_ids: [] };
                dirty = false; imageMessage = ''; renderDetail(); query('[data-vpe-field="name"]').focus(); return;
            }
            if (action === 'upload') { query('[data-vpe-upload]')?.click(); return; }
            if (action === 'attach-media') {
                await saveDraft();
                if (!draft.media?.length) {
                    status(t('This character has no reference media.', '该角色尚无参考素材。')); return;
                }
                const result = await options.onAttachMedia(clone(draft));
                inventory = result.inventory;
                refs = references(inventory);
                renderReferences(); renderDetail(); renderText();
                status(t('Character references added.', '角色参考素材已添加。') + skippedNotice(result.skipped));
                return;
            }
            if (/^(trim|preview-trim|restore-audio):/.test(action)) {
                const [operation, rawIndex] = action.split(':');
                const index = Number(rawIndex), ref = draft.media[index];
                const row = query(`[data-vpe-media-index="${index}"]`);
                if (operation === 'restore-audio') {
                    const result = await request('resolve', { asset_ids: [ref.trim_source_asset_id] }, state);
                    draft.media[index] = result.assets[0]; dirty = true; renderDetail(); return;
                }
                const start = Number(row.querySelector('[data-vpe-trim-start]').value);
                const end = Number(row.querySelector('[data-vpe-trim-end]').value);
                if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start
                        || (ref.duration && end > Number(ref.duration) + 0.001)) throw new Error('invalid_trim_range');
                if (operation === 'preview-trim') {
                    const audio = row.querySelector('audio');
                    if (!audio) throw new Error('asset_not_found');
                    audio.currentTime = start;
                    audio.ontimeupdate = () => { if (audio.currentTime >= end) audio.pause(); };
                    await audio.play();
                } else {
                    const result = await request('trim', { asset_id: ref.asset_id, start, end }, state);
                    draft.media[index] = result.asset; dirty = true; renderDetail();
                    status(t('Trimmed audio is ready. Card changes are not saved yet.', '裁剪音频已就绪，角色卡修改尚未保存。'));
                }
                return;
            }
            if (action === 'save-card') {
                await saveDraft(); renderDetail();
                status(t('Character saved.', '角色卡已保存。')); return;
            }
            if (action === 'delete-card') {
                if (!root.confirm(t(`Delete ${draft.name}?`, `删除 ${draft.name}？`))) return;
                await request('delete', { character_id: draft.id }, state);
                draft = null; dirty = false; renderDetail(); await refresh(); return;
            }
            if (action === 'insert-description' || action === 'insert-character') {
                if (!draft?.name?.trim()) throw new Error('character_name_required');
                await saveDraft();
                const mapped = [];
                let skipped = [];
                if (action === 'insert-character') {
                    refs = references(options.getInventory?.() || inventory);
                    if (options.onAttachMedia && draft.media?.some(asset => !refs.some(ref => matchingAsset(ref, asset)))) {
                        const result = await options.onAttachMedia(clone(draft));
                        inventory = result.inventory; refs = references(inventory);
                        skipped = result.skipped || [];
                        renderReferences();
                    }
                    for (const ref of draft.media || []) {
                        if (skipped.some(item => item.asset_id === ref.asset_id && item.reason === 'unsupported_media_kind')) continue;
                        const token = Array.from(host.querySelectorAll('[data-vpe-map]')).find(el => el.dataset.vpeMap === ref.asset_id)?.value;
                        const current = refs.find(item => item.token === token) || refs.find(item => matchingAsset(item, ref));
                        if (!current?.identity) {
                            throw new Error('reference_capacity');
                        }
                        mapped.push({ asset_id: ref.asset_id, token: current.token, slot: current.slot, identity: current.identity });
                    }
                }
                const existingBinding = bindings.find(binding => binding.card.id === draft.id);
                const existingSpeaker = existingBinding?.speaker_id;
                const nextSpeaker = `S${Math.max(0, ...bindings.map(binding => Number(binding.speaker_id?.slice(1)) || 0)) + 1}`;
                const snapshot = normalizeBindings([{ card: draft, references: mapped, speaker_id: existingSpeaker || nextSpeaker }])[0];
                bindings = bindings.filter(binding => binding.card.id !== draft.id).concat(snapshot);
                const alreadyUsed = !!existingBinding && value.includes(draft.name)
                    && mentionStart === null && savedSelection.start === savedSelection.end;
                const inserted = action === 'insert-description'
                    ? [draft.name, draft.appearance, draft.voice_description].filter(Boolean).join(' ') : draft.name;
                insert(inserted + ' ', snapshot, alreadyUsed);
                renderCards();
                mediaPreviews.pauseAll();
                query('[data-vpe-detail]').hidden = true;
                const images = mapped.filter(ref => ref.token.startsWith('<Picture ')).length;
                const audios = mapped.filter(ref => ref.token.startsWith('<Audio ')).length;
                status(t(`${draft.name} added · ${images} images · ${audios} audio references`,
                    `${draft.name} 已使用 · 图片 ${images} · 声音 ${audios}`) + skippedNotice(skipped)); return;
            }
            if (action === 'apply') {
                if (dirty) await saveDraft();
                if (targetId) targetValues[targetId] = value;
                const result = await options.onApply?.({ value, bindings: clone(bindings), targets: targetValues });
                if (result === false) return;
                dirty = false;
                // The outer action runner temporarily sets busy; closing here is intentional.
                busy = false; close(true);
            }
        }
        async function run(action, reportImage = false, cardId = '') {
            if (busy) return;
            busy = true; host.setAttribute('aria-busy', 'true');
            usingCard = cardId;
            if (usingCard) {
                status(t('Adding character and references...', '正在使用角色并关联素材...'));
                updateUseControls();
            }
            try { await action(); } catch (error) {
                if (reportImage) imageStatus(errorText(error));
                else status(errorText(error) + (usingCard ? t(' Prompt unchanged.', ' 提示词未改变。') : ''));
            }
            finally {
                usingCard = ''; updateUseControls();
                busy = false; host.removeAttribute('aria-busy');
            }
        }
        async function selectCharacter(cardId, edit = false) {
            if (dirty) await saveDraft();
            mediaPreviews.pauseAll();
            draft = clone(cards.find(card => card.id === cardId));
            dirty = false; imageMessage = '';
            query('[data-vpe-mentions]').hidden = true;
            if (edit) {
                renderDetail();
            } else {
                const detail = query('[data-vpe-detail]');
                detail.hidden = true;
                detail.innerHTML = '';
                await handleAction('insert-character');
            }
        }
        host.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
        host.addEventListener('pointerdown', event => {
            if (rich.contains(document.activeElement) || document.activeElement === raw) savedSelection = selection();
            if (event.target.closest('[data-vpe-insert],[data-vpe-card],[data-vpe-edit]')) event.preventDefault();
        });
        host.addEventListener('click', event => {
            event.stopPropagation();
            const target = event.target.closest('button');
            if (!target || busy) return;
            if ((voiceJob || imageJob) && !['voice-stop', 'voice-poll', 'image-stop', 'image-poll'].includes(target.dataset.vpeAction)
                    && !(imageJob?.finished && target.dataset.vpeAction === 'close')) return;
            if (target.dataset.vpeAction === 'close') { close(); return; }
            if (target.dataset.vpeInsert) { insert(target.dataset.vpeInsert + ' '); return; }
            if (target.dataset.vpeCard) {
                run(() => selectCharacter(target.dataset.vpeCard), false, target.dataset.vpeCard);
                return;
            }
            if (target.dataset.vpeEdit) {
                run(() => selectCharacter(target.dataset.vpeEdit, true));
                return;
            }
            if (target.dataset.vpeMode) {
                savedSelection = selection(); rawMode = target.dataset.vpeMode === 'raw';
                raw.hidden = !rawMode; rich.hidden = rawMode;
                host.querySelectorAll('[data-vpe-mode]').forEach(el => el.setAttribute('aria-pressed', String(el === target)));
                renderText(savedSelection.start); return;
            }
            if (target.hasAttribute('data-vpe-remove-media')) {
                draft.media.splice(Number(target.dataset.vpeRemoveMedia), 1); dirty = true; renderDetail(); return;
            }
            if (target.hasAttribute('data-vpe-unbind')) {
                bindings.splice(Number(target.dataset.vpeUnbind), 1); record(); renderText(); return;
            }
            if (target.dataset.vpeAction) run(() => handleAction(target.dataset.vpeAction), target.dataset.vpeAction.startsWith('image-'),
                target.dataset.vpeAction === 'insert-character' ? draft?.id || 'draft' : '');
        });
        host.addEventListener('input', event => {
            if (event.target.dataset.vpeField) { draft[event.target.dataset.vpeField] = event.target.value; dirty = true; }
            if (event.target.dataset.vpeVoiceField) {
                const key = event.target.dataset.vpeVoiceField;
                draft.voice[key] = key === 'seed' ? Number(event.target.value) : event.target.value;
                dirty = true;
            }
            if (event.target.matches('[data-vpe-search]')) renderCards();
            if (event.target === raw || event.target === rich) {
                value = event.target === raw ? raw.value : serializeDom(rich);
                if (!composing) { savedSelection = selection(); record(); updateMentions(); }
                query('[data-vpe-action="undo"]').disabled = !history.length;
                query('[data-vpe-action="redo"]').disabled = !redo.length;
            }
        });
        rich.addEventListener('compositionstart', () => { composing = true; });
        rich.addEventListener('compositionend', () => {
            composing = false; value = serializeDom(rich); savedSelection = selection();
            record(); renderText(savedSelection.start); updateMentions();
        });
        rich.addEventListener('blur', () => { if (!composing) renderText(); });
        rich.addEventListener('paste', event => {
            event.preventDefault(); savedSelection = selection(); insert(event.clipboardData.getData('text/plain'));
        });
        rich.addEventListener('beforeinput', event => {
            if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
                event.preventDefault(); savedSelection = selection(); insert('\n');
            }
        });
        host.addEventListener('change', event => {
            if (event.target.matches('[data-vpe-target]')) {
                targetValues[targetId] = value; targetId = event.target.value;
                value = targetValues[targetId] || '';
                history = []; redo = []; lastSnapshot = { value, bindings: clone(bindings), targets: clone(targetValues) };
                savedSelection = { start: value.length, end: value.length };
                renderText(value.length);
            }
            if (event.target.matches('[data-vpe-category]')) run(refresh);
            if (event.target.matches('[data-vpe-upload]')) {
                const file = event.target.files?.[0];
                if (!file) return;
                run(async () => {
                    if (file.size > 20 * 1024 * 1024) throw new Error('unsupported_or_oversized_media');
                    const dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader(); reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
                    });
                    const result = await request('upload', { name: file.name, data_url: dataUrl }, state);
                    draft.media.push(result.asset); dirty = true; renderDetail();
                });
            }
        });
        host.addEventListener('keydown', event => {
            event.stopPropagation();
            if (composing || event.isComposing) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                mediaPreviews.hidePreview();
                if (!query('[data-vpe-mentions]').hidden) { query('[data-vpe-mentions]').hidden = true; mentionStart = null; }
                else close();
            }
            if (event.key === 'Tab') {
                const focusable = Array.from(host.querySelectorAll('button,input,select,textarea,[contenteditable="true"]')).filter(el => !el.disabled && el.getClientRects().length);
                const index = focusable.indexOf(document.activeElement);
                if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === focusable.length - 1)) {
                    event.preventDefault(); focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
                }
            }
            if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()) && (event.target === raw || event.target === rich)) {
                event.preventDefault(); handleAction(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
            }
            if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key) && !query('[data-vpe-mentions]').hidden) {
                const items = Array.from(query('[data-vpe-mentions]').querySelectorAll('button'));
                if (items.length) {
                    event.preventDefault();
                    const index = items.indexOf(document.activeElement);
                    if (event.key === 'Enter') (items[index] || items[0]).click();
                    else items[index < 0
                        ? (event.key === 'ArrowUp' ? items.length - 1 : 0)
                        : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length].focus();
                }
            }
        });
        function renderReferences() {
            query('[data-vpe-refs]').innerHTML = refs.map(ref => {
                const asset = cards.flatMap(card => card.media || []).find(asset => matchingAsset(ref, asset));
                const preview = { ...ref, waveform: asset?.waveform || ref.waveform,
                    duration: asset?.duration || ref.duration, name: asset?.name || ref.name };
                return `<div class="sai-vpe-ref-row">${mediaHtml(preview)}<button type="button" data-vpe-insert="${escape(ref.token)}">${escape(ref.token)}</button></div>`;
            }).join('') || `<p>${escape(t('No uploaded references', '暂无已上传参考素材'))}</p>`;
            mediaPreviews.sync();
        }
        document.body.appendChild(host);
        active = { host, close };
        renderReferences(); renderText(); restoreCaret(value.length);
        run(refresh);
        return host;
    }
    function attach(field, context) {
        if (!field || field.readOnly || field.disabled) return;
        if (field.__visualPromptButton?.isConnected) return;
        const state = root.simpleaiTopbarSystemParams || {};
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'sai-vpe-entry';
        button.title = text(state, 'Visual prompt and characters', '可视化提示词与角色');
        button.setAttribute('aria-label', button.title);
        button.innerHTML = '<i class="fa-solid fa-address-card"></i>';
        button.addEventListener('click', async event => {
            event.preventDefault(); event.stopPropagation();
            button.disabled = true;
            try {
                const config = await context();
                if (!config) throw new Error(text(state, 'Prompt editor is not loaded.', '提示词编辑器尚未加载。'));
                open({ ...config, value: field.value });
            } catch (error) {
                root.alert(error?.message || text(state, 'Prompt editor could not be opened.', '无法打开提示词编辑器。'));
            } finally {
                button.disabled = false;
            }
        });
        field.parentElement.classList.add('sai-vpe-input-host');
        field.insertAdjacentElement('afterend', button);
        field.__visualPromptButton = button;
    }
    const api = { open, attach, references, normalizeBindings, validateBindings, serializeDom, renderPrompt, safeUrl, sourceIdentity, planMediaAttachments, matchingAsset, request, voiceDefaults, addGeneratedVoice, imagePresetRoute, addGeneratedImage, audioTime, waveformBars, audioPlayerHtml, previewPlacement };
    root.SimpAIVisualPromptEditor = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document !== 'undefined') {
        let observedPrompt = null;
        let promptLayoutFrame = null;
        function syncPromptTools() {
            promptLayoutFrame = null;
            if (!observedPrompt?.isConnected) return;
            const column = observedPrompt.closest('#prompt_text_column');
            if (!column) return;
            const style = root.getComputedStyle(observedPrompt);
            const borders = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
            const scrollbar = Math.max(0, Math.round(observedPrompt.offsetWidth - observedPrompt.clientWidth - borders));
            const value = `${scrollbar}px`;
            if (column.style.getPropertyValue('--sai-prompt-scrollbar-space') !== value) {
                column.style.setProperty('--sai-prompt-scrollbar-space', value);
            }
        }
        function schedulePromptLayout() {
            if (promptLayoutFrame === null) promptLayoutFrame = root.requestAnimationFrame(syncPromptTools);
        }
        const promptResizeObserver = typeof root.ResizeObserver === 'function'
            ? new root.ResizeObserver(schedulePromptLayout) : null;
        function observePromptLayout(field) {
            if (field !== observedPrompt) {
                promptResizeObserver?.disconnect();
                observedPrompt?.removeEventListener('input', schedulePromptLayout);
                observedPrompt?.removeEventListener('change', schedulePromptLayout);
                observedPrompt = field;
                field?.addEventListener('input', schedulePromptLayout);
                field?.addEventListener('change', schedulePromptLayout);
                if (field) promptResizeObserver?.observe(field);
            }
            if (field) schedulePromptLayout();
        }
        function mountPromptEntry() {
            const field = document.querySelector('#positive_prompt textarea');
            attach(field, async () => {
                if (!root.SimpAIH3StoryboardEditor) await root.SimpAILazyAssetLoader?.loadGroup('h3StoryboardEditor');
                return root.SimpAIH3StoryboardEditor?.visualPromptContext(field);
            });
            observePromptLayout(field);
        }
        // Gradio 6 mounts and replaces controls after the script has loaded.
        if (typeof onUiLoaded === 'function') onUiLoaded(mountPromptEntry);
        if (typeof onAfterUiUpdate === 'function') onAfterUiUpdate(mountPromptEntry);
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', mountPromptEntry, { once: true });
        }
        mountPromptEntry();
        document.addEventListener('focusin', event => {
            if (event.target.matches?.('#positive_prompt textarea')) mountPromptEntry();
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
