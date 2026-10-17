(function () {
    'use strict';

    if (window.simpaiDescribeResultCopyInstalled) return;
    window.simpaiDescribeResultCopyInstalled = true;
    const fields = '#describe_result_raw, #describe_result_candidate';
    const feedbackTimers = new WeakMap();

    function text(key) {
        return window.SimpAII18n?.localize(key, key, window.simpleaiTopbarSystemParams) || key;
    }

    async function copyText(value) {
        if (!value) return false;
        try {
            if (typeof navigator.clipboard?.writeText === 'function') {
                await navigator.clipboard.writeText(value);
                return true;
            }
        } catch (_) {}

        const previousFocus = document.activeElement;
        const temporary = document.createElement('textarea');
        temporary.value = value;
        temporary.setAttribute('readonly', '');
        temporary.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(temporary);
        try {
            temporary.focus({ preventScroll: true });
            temporary.select();
            temporary.setSelectionRange(0, value.length);
            return Boolean(document.execCommand('copy'));
        } catch (_) {
            return false;
        } finally {
            temporary.remove();
            try { previousFocus?.focus({ preventScroll: true }); } catch (_) {}
        }
    }

    function feedback(button, copied) {
        clearTimeout(feedbackTimers.get(button));
        button.dataset.descriptionCopyState = copied ? 'copied' : 'failed';
        const label = text(copied ? 'Copied' : 'Copy failed; select and copy the text.');
        button.setAttribute('title', label);
        button.setAttribute('aria-label', label);
        feedbackTimers.set(button, setTimeout(() => {
            delete button.dataset.descriptionCopyState;
            button.setAttribute('title', text('Copy'));
            button.setAttribute('aria-label', text('Copy'));
        }, 1500));
    }

    document.addEventListener('click', async event => {
        const button = event.composedPath().find(node => node?.tagName === 'BUTTON');
        const field = button?.closest(fields);
        if (!field || !button.closest('.icon-button-wrapper')) return;
        const input = field.querySelector('textarea, input[type="text"]');
        if (!input) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        feedback(button, await copyText(input.value));
    }, true);
})();
