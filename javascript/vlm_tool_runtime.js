(function (root) {
    'use strict';

    async function postJson(url, payload, options) {
        const response = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {}),
            signal: options?.signal
        });
        let data = null;
        try {
            data = await response.json();
        } catch (_error) {
            data = { ok: false, error: 'Invalid tool response.' };
        }
        if (!response.ok && data?.ok !== false) {
            data = { ok: false, error: `Tool request failed (${response.status}).`, details: data };
        }
        return data;
    }

    const api = {
        listSkills(options = {}) {
            return postJson('/describe-image/vlm-skills', {
                action: 'list',
                include_user: options.include_user !== false,
                max_skills: options.max_skills
            }, options);
        },
        loadSkill(name, options = {}) {
            return postJson('/describe-image/vlm-skills', {
                action: 'load',
                name: String(name || '').trim()
            }, options);
        },
        listTools(options = {}) {
            return postJson('/describe-image/vlm-tools', { action: 'list' }, options);
        },
        call(name, argumentsValue = {}, options = {}) {
            return postJson('/describe-image/vlm-tools', {
                action: 'call',
                name: String(name || '').trim(),
                arguments: argumentsValue && typeof argumentsValue === 'object' ? argumentsValue : {},
                tool_call_id: String(options.tool_call_id || '').slice(0, 160),
                include_user: options.include_user !== false
            }, options);
        }
    };

    root.SimpAIVlmTools = Object.freeze(api);
})(window);
