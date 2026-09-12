(function () {
    'use strict';

    function createCanvasTextControlContextController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getWindow = () => typeof scope.getWindow === 'function'
            ? scope.getWindow()
            : (typeof window !== 'undefined' ? window : null);
        const getNavigator = () => {
            const win = getWindow();
            return win?.navigator || (typeof navigator !== 'undefined' ? navigator : null);
        };
        const translate = typeof scope.t === 'function' ? scope.t : (en, cn) => cn || en;

        function editableTextControlFromTarget(target) {
            const el = target?.closest?.('textarea,input,[contenteditable="true"],[contenteditable="plaintext-only"]');
            if (!el) return null;
            const tag = String(el.tagName || '').toLowerCase();
            if (tag === 'textarea') return el;
            if (tag === 'input') {
                const type = String(el.getAttribute?.('type') || 'text').toLowerCase();
                const textTypes = new Set(['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number']);
                return textTypes.has(type) ? el : null;
            }
            return el.isContentEditable ? el : null;
        }

        function textControlIsReadonly(el) {
            if (!el) return true;
            if (el.disabled) return true;
            if (el.readOnly) return true;
            if (el.getAttribute?.('aria-readonly') === 'true') return true;
            const editable = el.getAttribute?.('contenteditable');
            if (editable != null && String(editable).toLowerCase() === 'false') return true;
            return false;
        }

        function textControlValue(el) {
            if (!el) return '';
            if ('value' in el) return String(el.value || '');
            return String(el.innerText || el.textContent || '');
        }

        function textControlSelection(el) {
            if (!el) return { start: 0, end: 0, text: '' };
            if ('selectionStart' in el && 'selectionEnd' in el) {
                const value = textControlValue(el);
                const start = Math.max(0, Number(el.selectionStart || 0));
                const end = Math.max(start, Number(el.selectionEnd || start));
                return { start, end, text: value.slice(start, end) };
            }
            const selection = getWindow()?.getSelection?.();
            if (!selection || !selection.rangeCount) return { start: 0, end: 0, text: '' };
            const anchorInside = el.contains(selection.anchorNode);
            const focusInside = el.contains(selection.focusNode);
            if (!anchorInside || !focusInside) return { start: 0, end: 0, text: '' };
            return { start: 0, end: 0, text: String(selection.toString() || '') };
        }

        function selectAllTextControl(el) {
            if (!el) return;
            el.focus?.({ preventScroll: true });
            if (typeof el.select === 'function') {
                el.select();
                return;
            }
            const doc = getDocument();
            const range = doc?.createRange?.();
            if (!range) return;
            range.selectNodeContents(el);
            const selection = getWindow()?.getSelection?.();
            if (!selection) return;
            selection.removeAllRanges();
            selection.addRange(range);
        }

        function dispatchTextControlInput(el, inputType, data) {
            if (!el) return;
            const win = getWindow();
            const InputEventCtor = win?.InputEvent || (typeof InputEvent !== 'undefined' ? InputEvent : null);
            const EventCtor = win?.Event || (typeof Event !== 'undefined' ? Event : null);
            let event = null;
            try {
                event = InputEventCtor ? new InputEventCtor('input', {
                    bubbles: true,
                    cancelable: false,
                    inputType: inputType || 'insertText',
                    data: data == null ? null : String(data)
                }) : null;
            } catch (err) {
                event = null;
            }
            if (!event && EventCtor) event = new EventCtor('input', { bubbles: true });
            if (event) el.dispatchEvent(event);
        }

        async function writeClipboardText(text) {
            const value = String(text || '');
            if (!value) return false;
            const clipboard = getNavigator()?.clipboard;
            if (clipboard && typeof clipboard.writeText === 'function') {
                try {
                    await clipboard.writeText(value);
                    return true;
                } catch (err) {
                    // Fall back to execCommand below for older or restricted browser shells.
                }
            }
            const doc = getDocument();
            if (!doc?.createElement || !doc.body) return false;
            const helper = doc.createElement('textarea');
            helper.value = value;
            helper.setAttribute('readonly', '');
            helper.style.position = 'fixed';
            helper.style.left = '-9999px';
            helper.style.top = '0';
            doc.body.appendChild(helper);
            helper.select();
            let ok = false;
            try {
                ok = doc.execCommand('copy');
            } catch (err) {
                ok = false;
            }
            helper.remove();
            return ok;
        }

        function insertTextIntoControl(el, text) {
            if (!el || textControlIsReadonly(el)) return false;
            const value = String(text || '');
            el.focus?.({ preventScroll: true });
            if ('value' in el) {
                const current = textControlValue(el);
                const start = Number.isFinite(Number(el.selectionStart)) ? Number(el.selectionStart) : current.length;
                const end = Number.isFinite(Number(el.selectionEnd)) ? Number(el.selectionEnd) : start;
                if (typeof el.setRangeText === 'function') {
                    el.setRangeText(value, start, end, 'end');
                } else {
                    el.value = current.slice(0, start) + value + current.slice(end);
                    const cursor = start + value.length;
                    try { el.setSelectionRange(cursor, cursor); } catch (err) {}
                }
                dispatchTextControlInput(el, 'insertFromPaste', value);
                return true;
            }
            const win = getWindow();
            const doc = getDocument();
            const selection = win?.getSelection?.();
            if (selection) {
                if (!selection.rangeCount || !el.contains(selection.anchorNode) || !el.contains(selection.focusNode)) {
                    const range = doc?.createRange?.();
                    if (range) {
                        range.selectNodeContents(el);
                        range.collapse(false);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            }
            let ok = false;
            try {
                ok = !!doc?.execCommand?.('insertText', false, value);
            } catch (err) {
                ok = false;
            }
            if (!ok && selection?.rangeCount && doc?.createTextNode) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const node = doc.createTextNode(value);
                range.insertNode(node);
                range.setStartAfter(node);
                range.setEndAfter(node);
                selection.removeAllRanges();
                selection.addRange(range);
                ok = true;
            }
            if (ok) dispatchTextControlInput(el, 'insertFromPaste', value);
            return ok;
        }

        function cutTextControlSelection(el) {
            if (!el || textControlIsReadonly(el)) return '';
            const selected = textControlSelection(el).text;
            if (!selected) return '';
            if ('value' in el) {
                const current = textControlValue(el);
                const start = Number(el.selectionStart || 0);
                const end = Number(el.selectionEnd || start);
                if (typeof el.setRangeText === 'function') {
                    el.setRangeText('', start, end, 'start');
                } else {
                    el.value = current.slice(0, start) + current.slice(end);
                    try { el.setSelectionRange(start, start); } catch (err) {}
                }
                dispatchTextControlInput(el, 'deleteByCut', null);
                return selected;
            }
            const selection = getWindow()?.getSelection?.();
            if (selection?.rangeCount && el.contains(selection.anchorNode) && el.contains(selection.focusNode)) {
                selection.deleteFromDocument();
                dispatchTextControlInput(el, 'deleteByCut', null);
                return selected;
            }
            return '';
        }

        function onTextControlContextMenu(evt) {
            const field = editableTextControlFromTarget(evt?.target);
            if (!field) return;
            evt.preventDefault?.();
            evt.stopPropagation?.();
            openTextControlContextMenu(field, evt.clientX, evt.clientY);
        }

        function openTextControlContextMenu(field, x, y) {
            const value = textControlValue(field);
            const selection = textControlSelection(field);
            const selectedText = selection.text;
            const readonly = textControlIsReadonly(field);
            call('openContextMenu', x, y, [
                {
                    label: translate('Select all', '全选'),
                    icon: 'fa-i-cursor',
                    disabled: !value,
                    action: () => selectAllTextControl(field)
                },
                {
                    label: translate('Copy', '复制'),
                    icon: 'fa-copy',
                    disabled: !(selectedText || value),
                    action: async () => {
                        const ok = await writeClipboardText(selectedText || value);
                        call('showToast', ok ? translate('Text copied.', '文本已复制') : translate('Copy failed.', '复制失败'));
                    }
                },
                {
                    label: translate('Paste text', '黏贴文本'),
                    icon: 'fa-paste',
                    disabled: readonly,
                    action: async () => {
                        try {
                            const text = await getNavigator()?.clipboard?.readText?.();
                            if (text == null) throw new Error('clipboard read unavailable');
                            if (insertTextIntoControl(field, text)) {
                                call('showToast', translate('Text pasted.', '文本已黏贴'));
                            } else {
                                call('showToast', translate('Paste failed.', '黏贴失败'));
                            }
                        } catch (err) {
                            call('showToast', translate('Clipboard paste is blocked by the browser. Use Ctrl+V.', '浏览器阻止了菜单黏贴，请使用 Ctrl+V。'));
                        }
                    }
                },
                {
                    label: translate('Cut', '剪切'),
                    icon: 'fa-scissors',
                    disabled: readonly || !selectedText,
                    action: async () => {
                        const text = textControlSelection(field).text;
                        const ok = await writeClipboardText(text);
                        if (ok) {
                            cutTextControlSelection(field);
                            call('showToast', translate('Text cut.', '文本已剪切'));
                        } else {
                            call('showToast', translate('Cut failed.', '剪切失败'));
                        }
                    }
                }
            ], 80);
        }

        return {
            editableTextControlFromTarget,
            onTextControlContextMenu,
            openTextControlContextMenu,
            dispatchTextControlInput,
            textControlIsReadonly,
            textControlSelection,
            textControlValue
        };
    }

    window.SimpAICanvasWorkbenchTextControlContext = Object.assign({}, window.SimpAICanvasWorkbenchTextControlContext || {}, {
        createCanvasTextControlContextController
    });
})();
