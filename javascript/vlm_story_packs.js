(function () {
    'use strict';

    function create(options) {
        const t = options.t, esc = options.escapeHtml;
        let element = null, pack = null, stored = false, busy = false, controller = null;
        let rows = [], activeId = 'example', opener = null, sequence = 0;
        const text = key => esc(t(key));
        const actionHelp = {
            capture: 'Read the current story into a starting draft: characters, player, scene, world book and outline. Review the preview, then save it. Chat history and story progress are excluded.',
            import: 'Choose a .story.json file created with Export story pack. Importing opens a preview; you can save it to your library or start a new story. Character cards and chat archives have their own import entries.',
            export: 'Download the preview as a .story.json file for sharing or use on another device. Chat history and model/API settings are excluded.',
            save: 'Save the preview to your account\'s story-pack library for reuse. Starting a story and downloading a file are separate actions.',
            copy: 'Save the edited preview as a new story pack. The existing library pack is kept.',
            start: 'Create a separate conversation from this preview with fresh story progress, using your current model/API. This does not save the preview to your story-pack library.',
            delete: 'Delete this saved pack from your library after confirmation. Stories already started from it are kept.',
            close: 'Close story packs. Unsaved preview changes will be discarded.',
            images: 'Include character, player and scene reference images when importing, starting, saving or exporting. Files will be larger. Turn this off to use text settings only.'
        };
        const button = (action, icon, label) => `<button type="button" data-story-pack-${action}
            title="${text(actionHelp[action] || label)}" aria-label="${text(label)}" aria-description="${text(actionHelp[action] || label)}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${text(label)}</span></button>`;
        const field = selector => element?.querySelector(selector);
        const feedback = (message, error = false) => {
            const node = field('[data-story-pack-status]');
            if (!node) return;
            node.textContent = message;
            node.classList.toggle('is-error', error);
        };
        const controls = () => {
            element?.querySelectorAll('button,input,textarea').forEach(node => {
                if (!node.hasAttribute('data-story-pack-close')) node.disabled = busy;
            });
            for (const action of ['start', 'save', 'export']) {
                const node = field(`[data-story-pack-${action}]`);
                if (node) node.disabled = busy || !pack;
            }
            const remove = field('[data-story-pack-delete]');
            if (remove) remove.disabled = busy || !pack || !stored;
            const save = field('[data-story-pack-save]');
            if (save) {
                const label = t(stored ? 'Save a copy' : 'Save story pack');
                save.querySelector('span').textContent = label;
                save.title = t(stored ? actionHelp.copy : actionHelp.save);
                save.setAttribute('aria-description', save.title);
                save.setAttribute('aria-label', label);
            }
            element?.setAttribute('aria-busy', String(busy));
        };
        const run = async action => {
            if (busy || !element) return;
            const token = sequence;
            controller = new AbortController();
            const taskController = controller;
            const timeout = window.setTimeout(() => {
                taskController.abort();
                if (sequence !== token || !element) return;
                sequence++;
                busy = false;
                controls();
                feedback(t('The story pack operation timed out. Please try again.'), true);
            }, 120000);
            busy = true;
            controls();
            try {
                await action(controller.signal, () => element && sequence === token);
            } catch (error) {
                if (element && sequence === token && error?.name !== 'AbortError') {
                    feedback(options.errorText(error), true);
                }
            } finally {
                window.clearTimeout(timeout);
                if (sequence === token) {
                    busy = false;
                    controller = null;
                    controls();
                }
            }
        };
        function close(restoreFocus = true) {
            sequence++;
            controller?.abort();
            element?.remove();
            element = null;
            controller = null;
            busy = false;
            if (restoreFocus) opener?.focus?.();
            opener = null;
            pack = null;
            rows = [];
            stored = false;
        }
        function readDraft() {
            if (!pack) return null;
            const result = JSON.parse(JSON.stringify(pack));
            result.name = field('[data-story-pack-name]').value.trim();
            result.description = field('[data-story-pack-description]').value.trim();
            result.opening = field('[data-story-pack-opening]').value.trim();
            result.suggested_actions = field('[data-story-pack-actions]').value.split('\n').map(value => value.trim()).filter(Boolean).slice(0, 6);
            result.settings.persona.name = field('[data-story-pack-player]').value.trim();
            return result;
        }
        function renderList() {
            field('[data-story-pack-list]').innerHTML = [
                { id: 'example', name: t('Moonlit ruins'), description: t('Adventure example'), builtin: true },
                ...rows
            ].map(row => `<button type="button" data-story-pack-select="${esc(row.id)}"
                class="${row.id === activeId ? 'is-selected' : ''}" aria-pressed="${row.id === activeId}">
                <i class="fa-solid ${row.builtin ? 'fa-compass' : 'fa-book-bookmark'}" aria-hidden="true"></i>
                <span><strong title="${esc(row.name)}">${esc(row.name)}</strong><small>${esc(row.description || row.location || t('Story pack'))}</small></span>
            </button>`).join('');
        }
        function renderPreview() {
            const preview = field('[data-story-pack-preview]');
            const helpOpen = preview.querySelector('[data-story-pack-help]')?.open;
            const help = `<details class="story-pack-help" data-story-pack-help${helpOpen ? ' open' : ''}>
                <summary><i class="fa-solid fa-circle-question" aria-hidden="true"></i><span>${text('Story pack guide')}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>
                <dl>
                  <dt>${text('What is included')}</dt><dd>${text('A reusable starting setup with characters, player identity, scene, world book and outline. Each start creates an independent story.')}</dd>
                  <dt>${text('Try the example')}</dt><dd>${text('Choose Moonlit ruins from the list, review the player and opening, then select Start new story.')}</dd>
                  <dt>${text('Use a file')}</dt><dd>${text(actionHelp.import)}</dd>
                  <dt>${text('Reuse your own setup')}</dt><dd>${text('Use current setup reads this conversation into the preview. Review and name it, then save it to your library or export a .story.json file.')}</dd>
                  <dt>${text('Choose the right import')}</dt><dd>${text('Character card PNG/JSON: Character library. World book JSON or a card with embedded lore: World book import. SimpAI chat archive JSON: Import conversation in the bottom toolbar.')}</dd>
                </dl>
              </details>`;
            if (!pack) {
                preview.innerHTML = help + `<p>${text('Choose a story pack')}</p>`;
                controls();
                return;
            }
            const settings = pack.settings, characters = Object.entries(settings.characters);
            const present = settings.scene.present_character_ids || [];
            preview.innerHTML = help + `
              <div class="story-pack-step"><span>1</span><strong>${text('Starting configuration')}</strong></div>
              <label><span>${text('Story pack name')}</span><input data-story-pack-name maxlength="120" value="${esc(pack.name)}"></label>
              <label><span>${text('Description')}</span><textarea data-story-pack-description rows="2" maxlength="1200">${esc(pack.description)}</textarea></label>
              <div class="story-pack-counts">
                <span><i class="fa-solid fa-users" aria-hidden="true"></i>${characters.length} ${text('Characters')}</span>
                <span><i class="fa-solid fa-book" aria-hidden="true"></i>${settings.world_book.entries.length} ${text('World entries')}</span>
                <span><i class="fa-solid fa-route" aria-hidden="true"></i>${settings.story_outline.nodes.length} ${text('Story beats')}</span>
              </div>
              <div class="story-pack-step"><span>2</span><strong>${text('Player and cast')}</strong></div>
              <label><span>${text('Player name')}</span><input data-story-pack-player maxlength="200" value="${esc(settings.persona.name || t('Player'))}"></label>
              <p class="story-pack-persona">${esc(settings.persona.identity || settings.persona.appearance)}</p>
              <div class="story-pack-cast">${characters.map(([id, card]) => {
                  const portrait = pack.assets[card.avatar_asset_id || card.reference_asset_ids?.[0]];
                  const image = portrait?.thumbnail_url || portrait?.data_url;
                  return `<div>${image ? `<img src="${esc(image)}" alt="${esc(card.name)}">` : '<i class="fa-solid fa-user" aria-hidden="true"></i>'}
                    <span><strong>${esc(card.name || t('Character'))}</strong><small>${esc(card.identity || card.appearance)}</small></span>
                    <small class="${present.includes(id) ? 'is-present' : ''}">${text(present.includes(id) ? 'Present' : 'Absent')}</small></div>`;
              }).join('')}</div>
              <div class="story-pack-step"><span>3</span><strong>${text('Opening scene')}</strong></div>
              <dl class="story-pack-scene"><dt>${text('Location')}</dt><dd>${esc(settings.scene.location || t('Not set'))}</dd>
                ${settings.scene.time ? `<dt>${text('Time')}</dt><dd>${esc(settings.scene.time)}</dd>` : ''}
                ${settings.scene.current_event ? `<dt>${text('Current event')}</dt><dd>${esc(settings.scene.current_event)}</dd>` : ''}</dl>
              <label><span>${text('Opening message')}</span><textarea data-story-pack-opening rows="4" maxlength="12000">${esc(pack.opening)}</textarea></label>
              <details><summary>${text('Starting actions')}</summary><label><span>${text('One action per line')}</span><textarea data-story-pack-actions rows="3" aria-description="${text('Up to six opening choices. Selecting one fills the chat input; the player decides when to send it.')}">${esc((pack.suggested_actions || []).join('\n'))}</textarea></label><small class="story-pack-field-help">${text('Up to six opening choices. Selecting one fills the chat input; the player decides when to send it.')}</small></details>
              <div class="story-pack-model" title="${text('Uses the model/API currently selected in chat. Story packs do not change model settings.')}"><i class="fa-solid fa-microchip" aria-hidden="true"></i><span>${text('Reply model')}</span><strong>${esc(options.modelLabel() || t('Not selected'))}</strong></div>`;
            controls();
        }
        async function refresh(signal) {
            const response = await options.api('list', {}, signal);
            if (signal.aborted || !element) return;
            rows = response.packs || [];
            renderList();
        }
        async function select(id, signal, alive) {
            feedback(t('Loading story pack...'));
            const response = id === 'example'
                ? await options.api('prepare', { pack: options.example(), include_images: false }, signal)
                : await options.api('load', { id }, signal);
            if (!alive()) return;
            pack = response.pack;
            stored = id !== 'example';
            activeId = id;
            renderList();
            renderPreview();
            feedback(t('Ready to start a new story.'));
        }
        async function open(source) {
            close();
            opener = source;
            sequence++;
            pack = null;
            stored = false;
            activeId = 'example';
            element = document.createElement('section');
            element.className = 'describe-vlm-chat-story-packs';
            element.setAttribute('role', 'dialog');
            element.setAttribute('aria-modal', 'true');
            element.setAttribute('aria-label', t('Story packs'));
            element.innerHTML = `
              <header><strong><i class="fa-solid fa-book-open" aria-hidden="true"></i>${text('Story packs')}</strong>
                <div class="story-pack-tools"><label class="story-pack-images" title="${text(actionHelp.images)}"><input type="checkbox" data-story-pack-images checked aria-label="${text('Include reference images')}" aria-description="${text(actionHelp.images)}"><span class="story-pack-images-wide">${text('Include reference images')}</span><span class="story-pack-images-short">${text('Images')}</span></label>${button('capture', 'fa-file-circle-plus', 'Use current setup')}${button('import', 'fa-file-import', 'Import story pack')}
                  ${button('close', 'fa-xmark', 'Close')}</div></header>
              <div class="story-pack-body"><nav data-story-pack-list aria-label="${text('Story packs')}"></nav>
                <div class="story-pack-preview" data-story-pack-preview></div></div>
              <footer><small data-story-pack-status role="status" aria-live="polite"></small>
                <div class="story-pack-tools">${button('delete', 'fa-trash', 'Delete story pack')}${button('export', 'fa-file-export', 'Export story pack')}
                  ${button('save', 'fa-floppy-disk', 'Save story pack')}${button('start', 'fa-play', 'Start new story')}</div></footer>
              <input data-story-pack-file type="file" accept=".json,application/json" hidden>`;
            options.mount().append(element);
            element.addEventListener('keydown', event => {
                event.stopPropagation();
                if (event.key === 'Escape') close();
                if (event.key === 'Tab') {
                    const nodes = [...element.querySelectorAll('button,input,textarea,summary')]
                        .filter(node => !node.disabled && node.getClientRects().length);
                    const first = nodes[0], last = nodes.at(-1);
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
                }
            });
            element.addEventListener('input', event => {
                event.stopPropagation();
                if (pack && !busy) feedback(t('Starting changes are not saved to a pack.'));
            });
            element.addEventListener('change', event => {
                event.stopPropagation();
                if (!event.target.matches('[data-story-pack-file]')) return;
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                run(async (signal, alive) => {
                    if (file.size > 48 * 1024 * 1024) throw new Error('story_pack_too_large');
                    feedback(t('Reading story pack...'));
                    const value = JSON.parse(await file.text());
                    if (value.schema !== 'simpai.vlm_roleplay.story_pack') throw new Error('story_pack_invalid');
                    const response = await options.api('prepare', { pack: value, include_images: field('[data-story-pack-images]').checked }, signal);
                    if (!alive()) return;
                    pack = response.pack;
                    stored = false;
                    activeId = '';
                    renderList();
                    renderPreview();
                    feedback(t('Imported preview. Save the pack or start a new story.'));
                });
            });
            element.addEventListener('click', event => {
                event.stopPropagation();
                if (event.target.closest('[data-story-pack-close]')) return close();
                if (busy) return;
                const selection = event.target.closest('[data-story-pack-select]');
                if (selection) return run((signal, alive) => select(selection.dataset.storyPackSelect, signal, alive));
                if (event.target.closest('[data-story-pack-import]')) return field('[data-story-pack-file]').click();
                if (event.target.closest('[data-story-pack-capture]')) return run(async (signal, alive) => {
                    feedback(t('Preparing current setup and reference images...'));
                    const includeImages = field('[data-story-pack-images]').checked;
                    const value = await options.capture(signal, includeImages);
                    const response = await options.api('prepare', { pack: value, include_images: includeImages }, signal);
                    if (!alive()) return;
                    pack = response.pack;
                    stored = false;
                    activeId = '';
                    renderList();
                    renderPreview();
                    feedback(t('Current setup is ready. Name the pack and save.'));
                    field('[data-story-pack-name]')?.focus();
                });
                if (!pack) return;
                if (event.target.closest('[data-story-pack-save]')) return run(async (signal, alive) => {
                    feedback(t('Saving story pack...'));
                    const response = await options.api('save', { pack: readDraft(), include_images: field('[data-story-pack-images]').checked }, signal);
                    if (!alive()) return;
                    pack = response.pack;
                    stored = true;
                    activeId = pack.id;
                    await refresh(signal);
                    if (!alive()) return;
                    renderPreview();
                    feedback(t('Story pack saved.'));
                });
                if (event.target.closest('[data-story-pack-delete]')) {
                    if (!stored || !window.confirm(t('Delete story pack "{name}"?').replace('{name}', pack.name))) return;
                    return run(async (signal, alive) => {
                        await options.api('delete', { id: pack.id }, signal);
                        await refresh(signal);
                        if (!alive()) return;
                        await select('example', signal, alive);
                        feedback(t('Story pack deleted.'));
                    });
                }
                if (event.target.closest('[data-story-pack-export]')) return run(async (signal, alive) => {
                    const response = await options.api('prepare', { pack: readDraft(), include_images: field('[data-story-pack-images]').checked }, signal);
                    if (!alive()) return;
                    const filename = response.pack.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || 'story';
                    options.download(new Blob([JSON.stringify(response.pack, null, 2)], { type: 'application/json;charset=utf-8' }), filename + '.story.json');
                    feedback(t('Story pack exported.'));
                });
                if (event.target.closest('[data-story-pack-start]')) return run(async (signal, alive) => {
                    feedback(t('Starting a new story...'));
                    const response = await options.api('prepare', { pack: readDraft(), include_images: field('[data-story-pack-images]').checked }, signal);
                    if (!alive()) return;
                    await options.start(response.pack, signal);
                    if (alive()) close(false);
                });
            });
            renderList();
            renderPreview();
            await run(async (signal, alive) => {
                await refresh(signal);
                if (alive()) await select('example', signal, alive);
            });
            field('[data-story-pack-close]')?.focus();
        }
        return { open, close };
    }
    window.SimpAIStoryPacks = { create };
})();
