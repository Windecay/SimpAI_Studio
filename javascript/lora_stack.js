(function () {
    'use strict';

    const selector = '[data-simpai-lora-stack]';
    let nextId = 0;
    let activeMenu = null;

    function parseItems(value) {
        const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : (value || []);
        const items = Array.isArray(parsed) ? parsed : parsed.items;
        if (!Array.isArray(items)) throw new Error(text(null, 'Invalid LoRA stack', 'LoRA 堆格式错误'));
        return items.map(item => ({
            enabled: item.enabled !== false,
            model: String(item.model || item.name || ''),
            strength_model: Number(item.strength_model ?? item.weight ?? 1),
            strength_clip: Number(item.strength_clip ?? 0),
            target: String(item.target || 'auto'),
        }));
    }

    function promptTags(prompt) {
        return Array.from(String(prompt || '').matchAll(/<lora:([^:<>]+):\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*>/g), match => ({
            model: match[1], weight: Number(match[2]),
        }));
    }

    function language(root) {
        const state = window.simpleaiTopbarSystemParams || {};
        return String(state.__lang || root?.dataset.lang || 'cn').toLowerCase();
    }

    function text(root, english, chinese) {
        return /^(cn|zh)/.test(language(root)) ? chinese : english;
    }

    function element(tag, className, content) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = content;
        return node;
    }

    function icon(name) {
        const node = element('i', `fa-solid fa-${name}`);
        node.setAttribute('aria-hidden', 'true');
        return node;
    }

    function closeMenu() {
        if (!activeMenu) return;
        const { menu, control } = activeMenu;
        control.setAttribute('aria-expanded', 'false');
        control.removeAttribute('aria-controls');
        control.removeAttribute('aria-activedescendant');
        menu.remove();
        activeMenu = null;
    }

    function positionMenu() {
        if (!activeMenu) return;
        const { anchor, menu } = activeMenu;
        if (!anchor.isConnected) { closeMenu(); return; }
        const rect = anchor.getBoundingClientRect();
        const viewport = window.visualViewport;
        const leftEdge = (viewport?.offsetLeft || 0) + 8;
        const topEdge = (viewport?.offsetTop || 0) + 8;
        const rightEdge = leftEdge + (viewport?.width || window.innerWidth) - 16;
        const bottomEdge = topEdge + (viewport?.height || window.innerHeight) - 16;
        const width = Math.min(Math.max(rect.width, 160), rightEdge - leftEdge);
        const below = Math.max(0, bottomEdge - rect.bottom - 4);
        const above = Math.max(0, rect.top - topEdge - 4);
        const opensBelow = below >= Math.min(menu.scrollHeight, 180) || below >= above;
        const maxHeight = Math.min(260, opensBelow ? below : above);
        menu.style.width = `${width}px`;
        menu.style.maxHeight = `${maxHeight}px`;
        menu.style.left = `${Math.max(leftEdge, Math.min(rect.left, rightEdge - width))}px`;
        menu.style.top = `${opensBelow ? rect.bottom + 4 : Math.max(topEdge, rect.top - Math.min(menu.scrollHeight, maxHeight) - 4)}px`;
    }

    function highlightOption(index) {
        if (!activeMenu?.choices.length) return;
        activeMenu.index = Math.max(0, Math.min(index, activeMenu.choices.length - 1));
        const options = activeMenu.menu.querySelectorAll('[role="option"]');
        options.forEach((option, optionIndex) => {
            option.classList.toggle('is-active', optionIndex === activeMenu.index);
        });
        const option = options[activeMenu.index];
        activeMenu.control.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
    }

    function openMenu(root, anchor, control, choices, commit) {
        closeMenu();
        const menu = element('div', 'simpai-stack-menu');
        menu.id = `simpai-stack-menu-${++nextId}`;
        menu.setAttribute('role', 'listbox');
        menu.setAttribute('aria-label', control.getAttribute('aria-label') || '');
        // Canvas nodes have local theme variables that the body-level popup must inherit.
        const style = window.getComputedStyle(root);
        ['input-background-fill', 'body-text-color', 'body-text-color-subdued',
            'border-color-primary', 'button-primary-background-fill', 'button-primary-text-color'].forEach(name => {
            menu.style.setProperty(`--${name}`, style.getPropertyValue(`--${name}`));
        });
        activeMenu = { root, anchor, control, menu, choices, commit, index: -1 };
        choices.forEach(([value, label], index) => {
            const option = element('div', 'simpai-stack-option', label);
            option.id = `${menu.id}-${index}`;
            option.title = label;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(value === control.value));
            option.addEventListener('pointerdown', event => event.preventDefault());
            option.addEventListener('click', () => {
                closeMenu();
                commit(value);
                control.focus({ preventScroll: true });
            });
            menu.append(option);
        });
        if (!choices.length) menu.append(element('div', 'simpai-stack-note', text(root, 'No matches', '没有匹配项')));
        document.body.append(menu);
        control.setAttribute('aria-expanded', 'true');
        control.setAttribute('aria-controls', menu.id);
        positionMenu();
    }

    function menuKeydown(event, control, open) {
        const current = activeMenu?.control === control ? activeMenu : null;
        if (event.key === 'Escape') {
            if (current) { event.preventDefault(); closeMenu(); }
        } else if (event.key === 'Tab') {
            closeMenu();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!current) open();
            if (activeMenu?.control === control) highlightOption(
                activeMenu.index < 0 ? (event.key === 'ArrowDown' ? 0 : activeMenu.choices.length - 1)
                    : activeMenu.index + (event.key === 'ArrowDown' ? 1 : -1));
        } else if (event.key === 'Enter' && current?.index >= 0) {
            event.preventDefault();
            const value = current.choices[current.index][0];
            closeMenu();
            current.commit(value);
        }
    }

    function targetSelect(root, value) {
        const wrapper = element('div', 'simpai-stack-select');
        const select = element('select', 'simpai-stack-select-value');
        select.hidden = true;
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        const choices = [
            ['auto', 'Auto', '自动'],
            ['main', 'Main', '主模型'], ['high', 'High noise', '高噪'],
            ['low', 'Low noise', '低噪'], ['both', 'High + low', '高低噪'],
        ];
        choices.forEach(([key, english, chinese]) => {
            const option = element('option', '', text(root, english, chinese));
            option.value = key;
            select.append(option);
        });
        select.value = value || 'auto';
        const control = element('button', 'simpai-stack-button simpai-stack-select-trigger');
        control.type = 'button';
        control.setAttribute('role', 'combobox');
        control.setAttribute('aria-haspopup', 'listbox');
        control.setAttribute('aria-expanded', 'false');
        control.setAttribute('aria-label', text(root, 'LoRA target', 'LoRA 作用范围'));
        const label = element('span');
        const update = () => {
            const choice = choices.find(([key]) => key === select.value) || choices[0];
            label.textContent = text(root, choice[1], choice[2]);
            control.title = label.textContent;
            control.value = select.value;
        };
        select.addEventListener('change', update);
        control.append(label, icon('chevron-down'));
        const open = () => openMenu(root, wrapper, control,
            choices.map(([key, english, chinese]) => [key, text(root, english, chinese)]), selected => {
                select.value = selected;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
        control.addEventListener('click', () => activeMenu?.control === control ? closeMenu() : open());
        control.addEventListener('keydown', event => menuKeydown(event, control, open));
        wrapper.append(select, control);
        wrapper.updateLabel = update;
        update();
        return wrapper;
    }

    function button(root, english, chinese, handler, iconName, showText = false) {
        const label = text(root, english, chinese);
        const control = element('button', `simpai-stack-button${showText ? '' : ' simpai-stack-icon-button'}`);
        control.type = 'button';
        control.title = label;
        control.setAttribute('aria-label', label);
        control.append(icon(iconName));
        if (showText) control.append(element('span', '', label));
        control.addEventListener('click', handler);
        return control;
    }

    function modelPicker(root, value, commit) {
        const wrapper = element('div', 'simpai-stack-model-picker');
        const input = element('input', 'simpai-stack-model');
        input.type = 'text';
        input.value = value;
        input.title = value;
        input.placeholder = text(root, 'Select or enter a LoRA', '选择或输入 LoRA');
        input.setAttribute('aria-label', text(root, 'LoRA model', 'LoRA 模型'));
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        const open = (query = '') => {
            const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
            const models = Array.from(new Set(JSON.parse(root.dataset.models || '[]').map(String)))
                .filter(name => name && name.toLowerCase() !== 'none' && terms.every(term => name.toLowerCase().includes(term)));
            openMenu(root, wrapper, input, models.map(name => [name, name]), selected => {
                input.value = selected;
                input.title = selected;
                commit(selected);
            });
        };
        input.addEventListener('focus', () => open());
        input.addEventListener('click', () => { if (activeMenu?.control !== input) open(); });
        input.addEventListener('input', () => open(input.value));
        input.addEventListener('change', () => { input.title = input.value; commit(input.value); });
        input.addEventListener('keydown', event => menuKeydown(event, input, () => open(input.value)));
        const toggle = button(root, 'Select LoRA', '选择 LoRA', () => {
            const isOpen = activeMenu?.control === input;
            input.focus({ preventScroll: true });
            if (isOpen) closeMenu();
            else open();
        }, 'chevron-down');
        toggle.classList.add('simpai-stack-model-toggle');
        toggle.addEventListener('pointerdown', event => event.preventDefault());
        wrapper.append(input, toggle);
        return wrapper;
    }

    function read(root) {
        if (!root) return {};
        mount(root);
        return {
            lora_stack: parseItems(root.querySelector('[data-stack-value]').value),
            lora_stack_target: root.querySelector('[data-stack-target]').value,
        };
    }

    function notify(root) {
        const hidden = root.querySelector('[data-stack-value]');
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
        root.dispatchEvent(new CustomEvent('simpai:lora-stack-change', { bubbles: true }));
    }

    function save(root, items, render = true) {
        root.querySelector('[data-stack-value]').value = JSON.stringify(items);
        if (render) renderRows(root);
        notify(root);
    }

    function renderTags(root) {
        const preview = root.querySelector('[data-stack-tags]');
        if (!preview) return;
        const prompt = root.closest('[data-simpai-models-js-root]')
            ? document.querySelector('#positive_prompt textarea')?.value || '' : '';
        const tags = promptTags(prompt);
        const scope = root.querySelector('[data-stack-prompt-scope]');
        scope.hidden = root.dataset.canvas === '1' ? root.dataset.showScope !== '1' : tags.length === 0;
        preview.hidden = tags.length === 0;
        preview.replaceChildren();
        tags.forEach(item => {
            const row = element('div', 'simpai-stack-tag');
            row.append(element('span', '', item.model), element('span', '', String(item.weight)),
                element('span', 'simpai-stack-note', text(root, 'Read only', '只读')));
            preview.append(row);
        });
    }

    function renderRows(root) {
        if (activeMenu?.root === root) closeMenu();
        const list = root.querySelector('[data-stack-rows]');
        const items = parseItems(root.querySelector('[data-stack-value]').value);
        list.replaceChildren();
        items.forEach((item, index) => {
            const row = element('div', 'simpai-stack-row');
            const enabled = element('input');
            enabled.type = 'checkbox';
            enabled.checked = item.enabled;
            enabled.setAttribute('aria-label', text(root, 'Enable LoRA', '启用 LoRA'));
            row.classList.toggle('is-disabled', !item.enabled);
            enabled.addEventListener('change', () => {
                items[index].enabled = enabled.checked;
                row.classList.toggle('is-disabled', !enabled.checked);
                save(root, items, false);
            });
            const model = modelPicker(root, item.model, value => { items[index].model = value; save(root, items, false); });
            row.append(enabled, model);
            const fields = element('div', 'simpai-stack-fields');
            [['strength_model', 'Model', '模型'], ['strength_clip', 'CLIP', 'CLIP']].forEach(([key, english, chinese]) => {
                const label = element('label', 'simpai-stack-weight');
                const input = element('input');
                input.type = 'number';
                input.step = '0.05';
                input.value = String(item[key]);
                const fullLabel = text(root, `${english} weight`, `${chinese}权重`);
                input.setAttribute('aria-label', fullLabel);
                label.title = fullLabel;
                input.addEventListener('change', () => {
                    if (!input.value.trim() || !Number.isFinite(Number(input.value))) return;
                    items[index][key] = Number(input.value);
                    save(root, items, false);
                });
                label.append(element('span', '', text(root, english, chinese)), input);
                fields.append(label);
            });
            const targetPicker = targetSelect(root, item.target);
            const target = targetPicker.querySelector('select');
            target.addEventListener('change', () => { items[index].target = target.value; save(root, items, false); });
            fields.append(targetPicker);
            const actions = element('div', 'simpai-stack-actions');
            const up = button(root, 'Up', '上移', () => {
                [items[index - 1], items[index]] = [items[index], items[index - 1]];
                save(root, items);
            }, 'arrow-up');
            up.disabled = index === 0;
            const down = button(root, 'Down', '下移', () => {
                [items[index + 1], items[index]] = [items[index], items[index + 1]];
                save(root, items);
            }, 'arrow-down');
            down.disabled = index === items.length - 1;
            actions.append(up, down, button(root, 'Remove', '删除', () => { items.splice(index, 1); save(root, items); }, 'trash-can'));
            row.append(actions, fields);
            list.append(row);
        });
        if (!items.length) list.append(element('div', 'simpai-stack-note', text(root, 'No extra LoRAs', '暂无扩展 LoRA')));
        root.querySelector('[data-stack-count]').textContent = text(root, `${items.length} items`, `${items.length} 项`);
    }

    function mount(root) {
        if (!root || root.dataset.stackMounted === '1') return;
        root.dataset.stackMounted = '1';
        root.dataset.renderLang = language(root);
        const hidden = element('input');
        hidden.type = 'hidden';
        hidden.dataset.stackValue = '1';
        hidden.value = root.dataset.items || '[]';
        if (root.dataset.canvas === '1') hidden.dataset.configParam = 'lora_stack';
        const header = element('div', 'simpai-stack-header');
        const count = element('span', 'simpai-stack-note');
        count.dataset.stackCount = '1';
        header.append(element('strong', '', text(root, 'Extra LoRA stack', '扩展 LoRA 堆')), count,
            button(root, 'Add LoRA', '添加 LoRA', () => {
                const items = read(root).lora_stack;
                items.push({ enabled: true, model: '', strength_model: 1, strength_clip: 0, target: 'auto' });
                save(root, items);
            }, 'plus', true));
        if (root.dataset.canvas === '1') {
            const settings = button(root, 'More settings', '更多设置', () => {
                root.dataset.showScope = root.dataset.showScope === '1' ? '0' : '1';
                settings.setAttribute('aria-expanded', String(root.dataset.showScope === '1'));
                renderTags(root);
            }, 'gear');
            settings.setAttribute('aria-expanded', String(root.dataset.showScope === '1'));
            header.append(settings);
        }
        const help = element('button', 'sai-help-button simpai-stack-help-button');
        help.type = 'button';
        help.dataset.studioHelp = 'lora_stack';
        help.dataset.studioHelpSource = root.dataset.canvas === '1' ? 'canvas' : 'main';
        help.title = text(root, 'Extra LoRA stack guide', '扩展 LoRA 堆指引');
        help.setAttribute('aria-label', help.title);
        help.setAttribute('aria-haspopup', 'dialog');
        help.append(icon('circle-question'));
        header.append(help);
        const rows = element('div');
        rows.dataset.stackRows = '1';
        const targetLabel = element('div', 'simpai-stack-target');
        targetLabel.dataset.stackPromptScope = '1';
        const targetPicker = targetSelect(root, root.dataset.target);
        const target = targetPicker.querySelector('select');
        target.dataset.stackTarget = '1';
        if (root.dataset.canvas === '1') target.dataset.configParam = 'lora_stack_target';
        target.addEventListener('change', () => root.dispatchEvent(new CustomEvent('simpai:lora-stack-change', { bubbles: true })));
        targetPicker.querySelector('button').setAttribute('aria-label', text(root, 'Prompt LoRA target', '提示词中的 LoRA 作用范围'));
        targetLabel.append(element('span', '', text(root, 'LoRAs in prompt', '提示词中的 LoRA')), targetPicker);
        const preview = element('div', 'simpai-stack-tags');
        preview.dataset.stackTags = '1';
        root.append(hidden, header, rows, targetLabel, preview);
        renderRows(root);
        renderTags(root);
    }

    function set(root, items, target) {
        if (!root) return;
        mount(root);
        root.querySelector('[data-stack-value]').value = JSON.stringify(parseItems(items));
        const targetSelect = root.querySelector('[data-stack-target]');
        targetSelect.value = target || 'auto';
        targetSelect.parentElement.updateLabel();
        renderRows(root);
        renderTags(root);
    }

    function refresh(container, lang) {
        container.querySelectorAll(selector).forEach(root => {
            if (lang) root.dataset.lang = lang;
            const currentLang = language(root);
            if (root.dataset.renderLang && root.dataset.renderLang !== currentLang) {
                if (activeMenu?.root === root) closeMenu();
                const current = read(root);
                root.dataset.items = JSON.stringify(current.lora_stack);
                root.dataset.target = current.lora_stack_target;
                root.replaceChildren();
                delete root.dataset.stackMounted;
            }
            mount(root);
            root.dataset.renderLang = currentLang;
        });
    }

    window.SimpAILoraStackEditor = { parseItems, promptTags, mount, read, set, refresh };
    document.addEventListener('input', event => {
        if (event.target.closest?.('#positive_prompt')) document.querySelectorAll(selector).forEach(renderTags);
    });
    document.addEventListener('pointerdown', event => {
        if (activeMenu && !activeMenu.menu.contains(event.target) && !activeMenu.anchor.contains(event.target)) closeMenu();
    });
    document.addEventListener('focusin', event => {
        if (activeMenu && !activeMenu.menu.contains(event.target) && !activeMenu.anchor.contains(event.target)) closeMenu();
    });
    document.addEventListener('scroll', event => {
        if (activeMenu && !activeMenu.menu.contains(event.target)) closeMenu();
    }, true);
    window.addEventListener('resize', positionMenu);
    window.visualViewport?.addEventListener('resize', positionMenu);
    window.visualViewport?.addEventListener('scroll', positionMenu);
    function start() {
        refresh(document);
        new MutationObserver(records => {
            if (activeMenu && !activeMenu.anchor.isConnected) closeMenu();
            records.forEach(record => record.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                if (node.matches(selector)) mount(node);
                node.querySelectorAll(selector).forEach(mount);
            }));
        }).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
