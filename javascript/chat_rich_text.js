(function () {
    'use strict';

    const md = window.markdownit({ html: false, breaks: true, linkify: false, maxNesting: 32 });
    const escape = md.utils.escapeHtml;
    // Attachments use Studio's media controls; Markdown must not fetch remote images.
    md.renderer.rules.image = (tokens, index) => escape(tokens[index].content);
    md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
        env.linkDepth = (env.linkDepth || 0) + 1;
        tokens[index].attrSet('target', '_blank');
        tokens[index].attrSet('rel', 'noopener noreferrer');
        return renderer.renderToken(tokens, index, options);
    };
    md.renderer.rules.link_close = (tokens, index, options, env, renderer) => {
        env.linkDepth = Math.max(0, (env.linkDepth || 0) - 1);
        return renderer.renderToken(tokens, index, options);
    };
    md.renderer.rules.table_open = () => '<div class="describe-vlm-chat-table-scroll"><table>\n';
    md.renderer.rules.table_close = () => '</table></div>\n';
    md.renderer.rules.text = (tokens, index, options, env) => {
        const value = tokens[index].content;
        if (!env.emphasizeDialogue || env.linkDepth) return escape(value);
        const pattern = /“[^”\r\n]+”|"[^"\r\n]+"|「[^」\r\n]+」|『[^』\r\n]+』/g;
        let html = '', start = 0;
        for (const match of value.matchAll(pattern)) {
            html += escape(value.slice(start, match.index)) + '<strong class="describe-vlm-chat-dialogue">' + escape(match[0]) + '</strong>';
            start = match.index + match[0].length;
        }
        return html + escape(value.slice(start));
    };

    function normalizeReplyOptions(values) {
        const result = [];
        let total = 0;
        for (const item of Array.isArray(values) ? values : []) {
            if (typeof item !== 'string') continue;
            const text = item.trim();
            if (!text || text.length > 1000 || result.includes(text) || total + text.length > 10000) continue;
            result.push(text);
            total += text.length;
            if (result.length >= 20) break;
        }
        return result;
    }

    function replyOptions(text, values = [], streaming = false) {
        const source = String(text || '');
        const protectedRanges = Array.from(source.matchAll(/(`{3,}|~{3,})[\s\S]*?(?:\1|$)|(`+)[^\r\n]*?\2/g),
            match => [match.index, match.index + match[0].length]);
        const options = Array.isArray(values) ? values.slice() : [];
        const pieces = [];
        let cursor = 0;
        for (const opening of source.matchAll(/<options\s*>/gi)) {
            if (opening.index < cursor || protectedRanges.some(([start, end]) => start <= opening.index && opening.index < end)) continue;
            pieces.push(source.slice(cursor, opening.index));
            const closePattern = /<\/options\s*>/gi;
            closePattern.lastIndex = opening.index + opening[0].length;
            const closing = closePattern.exec(source);
            if (!closing) { cursor = source.length; break; }
            const template = document.createElement('template');
            template.innerHTML = source.slice(opening.index, closing.index + closing[0].length);
            template.content.querySelectorAll('script,style,iframe,object,template').forEach(node => node.remove());
            template.content.querySelectorAll('options > option').forEach(node => options.push(node.textContent));
            cursor = closing.index + closing[0].length;
        }
        pieces.push(source.slice(cursor));
        let visible = pieces.join('');
        if (streaming) {
            const start = visible.lastIndexOf('<');
            const tail = visible.slice(start).toLowerCase();
            if (start >= 0 && tail.length >= 2 && '<options>'.startsWith(tail)
                && !protectedRanges.some(([left, right]) => left <= start && start < right)) visible = visible.slice(0, start);
        }
        return { text: visible.trim(), options: normalizeReplyOptions(options) };
    }

    window.SimpAIChatRichText = Object.freeze({
        normalizeReplyOptions,
        replyOptions,
        render(text, options = {}) {
            return md.render(String(text || ''), { emphasizeDialogue: options.emphasizeDialogue === true });
        }
    });
})();
