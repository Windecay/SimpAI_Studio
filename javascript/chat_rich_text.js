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
        const pattern = /“[^”\r\n]+”|"[^"\r\n]+"/g;
        let html = '', start = 0;
        for (const match of value.matchAll(pattern)) {
            html += escape(value.slice(start, match.index)) + '<strong class="describe-vlm-chat-dialogue">' + escape(match[0]) + '</strong>';
            start = match.index + match[0].length;
        }
        return html + escape(value.slice(start));
    };

    window.SimpAIChatRichText = Object.freeze({
        render(text, options = {}) {
            return md.render(String(text || ''), { emphasizeDialogue: options.emphasizeDialogue === true });
        }
    });
})();
