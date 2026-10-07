(function (root) {
    'use strict';
    function connectionUrls(base) {
        const url = new URL(base);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid Studio URL');
        url.search = ''; url.hash = '';
        const studio = url.href.replace(/\/+$/, '');
        return { studio, guide: studio + '/api/v1/connect', discovery: studio + '/api/v1/auth/discovery',
            capabilities: studio + '/api/v1/capabilities', tools: studio + '/api/v1/tools/index',
            openapi: studio + '/api/v1/openapi.json', authorization: studio + '/api/v1/auth/authorize',
            llm: studio + '/api/v1/llm', vlmModels: studio + '/api/v1/vlm/models', storage: studio + '/api/v1/assets/manage' };
    }
    function configurations(folder, python, base, lang = 'cn', inference = false) {
        folder = String(folder || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
        if (!/^(?:[A-Za-z]:\/|\/)/.test(folder) || /[\r\n\x00]/.test(folder)) return null;
        const windows = /^[A-Za-z]:\//.test(folder) || folder.startsWith('//');
        const existingPython = String(python || '').trim().replace(/\\/g, '/');
        python = existingPython || folder + (windows ? '/runtime/python.exe' : '/.venv-mcp/bin/python');
        if (!/^(?:[A-Za-z]:\/|\/)/.test(python) || /[\r\n\x00]/.test(python)) return null;
        const script = folder + '/tools/studio_mcp.py';
        const studio = connectionUrls(base).studio;
        const quote = value => "'" + value.replace(/'/g, windows ? "''" : "'\\''") + "'";
        const invoke = windows ? '& ' : '';
        const command = invoke + quote(python) + ' ' + quote(script);
        return {
            json: JSON.stringify({mcpServers: {simpai: {command: python, args: [script], env: {SIMPAI_STUDIO_URL: studio}}}}, null, 2),
            toml: '[mcp_servers.simpai]\ncommand = ' + JSON.stringify(python) + '\nargs = [' + JSON.stringify(script)
                + ']\n\n[mcp_servers.simpai.env]\nSIMPAI_STUDIO_URL = ' + JSON.stringify(studio),
            install: windows && !existingPython
                ? 'powershell -NoProfile -ExecutionPolicy Bypass -File ' + quote(folder + '/setup.ps1') + (lang === 'en' ? ' -Lang en' : '')
                : (existingPython ? '' : 'python3 -m venv ' + quote(folder + '/.venv-mcp') + '\n')
                    + invoke + quote(python) + ' -m pip install --timeout 30 --retries 1 -r ' + quote(folder + '/tools/requirements-mcp.txt'),
            pair: command + ' --base-url ' + quote(studio) + ' --pair'
                + (inference ? ' --scope read --scope assets.write --scope runs.submit --scope runs.cancel --scope vlm.infer' : ''),
        };
    }
    function connectionState(data, base) {
        if (!data || !['local', 'multi-user'].includes(data.access_mode)) throw new Error('Unknown Studio mode');
        const url = new URL(base);
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        const canPair = typeof data.pairing_available === 'boolean' ? data.pairing_available
            : url.protocol === 'https:' || loopback;
        return {mode: data.access_mode, canPair, ready: data.access_mode === 'local' || canPair,
            blocked: data.access_mode === 'multi-user' && !canPair};
    }
    function localEndpoint(data, base) {
        const item = data?.local_endpoint;
        if (data?.next_step !== 'use_local_endpoint' || !item || item.same_machine_only !== true) return null;
        const target = new URL(item.base_url);
        if (target.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(target.hostname)
            || target.username || target.password || target.search || target.hash
            || target.pathname.replace(/\/+$/, '') !== new URL(base).pathname.replace(/\/+$/, '')
            || !data.service_id || item.service_id !== data.service_id) throw new Error('Invalid local Studio endpoint');
        return connectionUrls(target.href);
    }
    const api = { connectionUrls, configurations, connectionState, localEndpoint };
    root.SimpAIAgentConnection = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document === 'undefined') return;

    function syncFooter() {
        const state = root.simpleaiTopbarSystemParams || {};
        const lang = root.SimpAII18n?.getUiLang(state) || (state.__lang === 'cn' ? 'cn' : 'en');
        for (const footer of document.querySelectorAll('footer[aria-label="Gradio footer navigation"]')) {
            let link = footer.querySelector('[data-studio-agent-connection]');
            if (!link) {
                link = document.createElement('a');
                link.dataset.studioAgentConnection = '';
                link.setAttribute('translate', 'no');
                link.style.cssText = 'color:inherit;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center';
                link.target = '_blank'; link.rel = 'noopener';
                footer.prepend(link);
            }
            if (link.getAttribute('translate') !== 'no') link.setAttribute('translate', 'no');
            const supplied = root.gradio_config?.root;
            const fallback = new URL('.', root.location.href).href;
            let urls;
            try { urls = connectionUrls(supplied ? new URL(supplied, root.location.href).href : fallback); } catch (_) { continue; }
            const url = new URL(urls.guide);
            url.searchParams.set('lang', lang);
            if (state.__theme) url.searchParams.set('theme', String(state.__theme).includes('dark') ? 'dark' : 'light');
            if (link.href !== url.href) link.href = url.href;
            const label = lang === 'cn' ? (root.localization?.['Agent API / MCP'] || 'Agent API / MCP') : 'Agent API / MCP';
            if (link.textContent !== label) link.textContent = label;
            let storage = footer.querySelector('[data-studio-asset-storage]');
            if (!storage) {
                storage = document.createElement('a');
                storage.dataset.studioAssetStorage = '';
                storage.setAttribute('translate', 'no');
                storage.style.cssText = link.style.cssText;
                storage.target = '_blank'; storage.rel = 'noopener';
                footer.appendChild(storage);
            }
            const storageUrl = new URL(urls.storage);
            storageUrl.searchParams.set('lang', lang);
            if (storage.href !== storageUrl.href) storage.href = storageUrl.href;
            const storageLabel = lang === 'cn' ? (root.localization?.['Asset storage'] || '资产空间管理') : 'Asset storage';
            if (storage.textContent !== storageLabel) storage.textContent = storageLabel;
        }
    }
    api.syncFooter = syncFooter;

    async function startGuide() {
        const dataElement = document.getElementById('agent-connection-data');
        if (!dataElement) {
            syncFooter();
            if (!document.querySelector('footer[aria-label="Gradio footer navigation"]')) {
                const observer = new MutationObserver(() => {
                    if (!document.querySelector('footer[aria-label="Gradio footer navigation"]')) return;
                    syncFooter(); observer.disconnect(); clearTimeout(timeout);
                });
                observer.observe(document.body, {childList: true, subtree: true});
                const timeout = setTimeout(() => observer.disconnect(), 15000);
            }
            return;
        }
        const data = JSON.parse(dataElement.textContent);
        const state = data.state;
        const t = key => data.strings[key] || key;
        let urls = connectionUrls(root.location.origin + (data.prefix || ''));
        document.documentElement.dataset.theme = state.__theme || '';
        document.getElementById('connect-language').value = state.__lang;
        document.getElementById('studio-base').value = urls.studio;
        document.querySelectorAll('[data-connect-link]').forEach(link => {
            link.href = urls[link.dataset.connectLink];
            if (link.dataset.connectLink === 'authorization') link.hidden = true;
        });
        const instructionText = [
            t("First GET auth/discovery and inspect pairing_available and next_step. If next_step is use_local_endpoint, use its published local_endpoint only on the Studio computer, read that discovery_url and verify the same service_id before pairing. Do not guess addresses or scan ports. If no usable endpoint is published, explain the remaining connection requirement. Complete browser pairing through the private connection layer, then read session and capabilities. Follow tool_index_url to search by query or category; read only the selected tools' detail_url for their parameters, then use call_url. Do not read the full tool catalog or OpenAPI document before every task. Request only necessary scopes; keep device codes and tokens out of model messages."),
            t("If tool_index_url is not provided, use the server's published tools_url instead of guessing an index endpoint."),
            t('Before writing a model prompt, read prompts.guidance for the selected preset, then read its recommended skills. Use prompts.tags for Anima/Danbooru lookup and prompts.validate before preview/submission. Keep the original user instruction separate from the final model prompt.'),
            t('For image tag inference, check prompts.wd14_status and call prompts.wd14 with an owned image asset_id. Missing models are not downloaded automatically; candidate tags are not proof of identity or age.'),
            t('Send JSON as UTF-8 bytes. In Windows PowerShell, read a UTF-8 JSON file with System.IO.File.ReadAllBytes and send application/json; charset=utf-8. Do not pipe Chinese Python source through the default PowerShell encoding. Compare preview source_instruction and prompt with the original text; question marks or replacement characters mean the request must be corrected before generation.'),
        ].join('\n\n');
        let instructions = 'Studio: ' + urls.studio + '\nGET ' + urls.discovery + '\n\n' + instructionText;
        document.getElementById('connection-instructions').textContent = instructions;
        let connection = null;
        let connectionMessage = t('Checking connection mode...');
        let format = 'json';
        function updateConfig() {
            document.getElementById('llm-base').value = urls.llm;
            document.getElementById('vlm-models-link').href = urls.vlmModels;
            const configs = configurations(document.getElementById('mcp-folder').value, document.getElementById('mcp-python').value, urls.studio, state.__lang,
                document.getElementById('connect-vlm-scope').checked);
            for (const [id, key] of [['mcp-install', 'install'], ['mcp-pair', 'pair'], ['mcp-config', format]]) {
                const requiresConnection = key !== 'install';
                const unnecessaryPairing = key === 'pair' && connection?.mode === 'local';
                const available = !!configs && (!requiresConnection || connection?.ready) && !unnecessaryPairing;
                document.getElementById(id).textContent = unnecessaryPairing ? t('Local mode does not require pairing.')
                    : requiresConnection && !connection?.ready ? connectionMessage
                    : configs?.[key] || t('Fill in the client-side MCP adapter folder to create the configuration.');
                document.querySelector(`[data-connect-copy="${id}"]`).disabled = !available;
            }
            document.getElementById('mcp-config-location').textContent = t(format === 'toml'
                ? 'For Codex, add this to ~/.codex/config.toml. In desktop Settings > MCP servers, you can also add a STDIO server.'
                : "Use your MCP client's server settings to merge this JSON configuration.");
        }
        document.getElementById('mcp-folder').addEventListener('input', updateConfig);
        document.getElementById('mcp-python').addEventListener('input', updateConfig);
        document.getElementById('connect-vlm-scope').addEventListener('change', updateConfig);
        document.querySelectorAll('[data-connect-format]').forEach(button => button.addEventListener('click', () => {
            format = button.dataset.connectFormat;
            document.querySelectorAll('[data-connect-format]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
            updateConfig();
        }));
        document.getElementById('connect-language').addEventListener('change', event => {
            const url = new URL(root.location.href); url.searchParams.set('lang', event.target.value); root.location.assign(url.href);
        });
        document.querySelectorAll('[data-connect-copy]').forEach(button => button.addEventListener('click', async () => {
            const target = document.getElementById(button.dataset.connectCopy);
            const text = target.value ?? target.textContent;
            let success = false;
            try { await navigator.clipboard.writeText(text); success = true; } catch (_) {
                const field = document.createElement('textarea'); field.value = text;
                document.body.appendChild(field); field.select();
                try { success = document.execCommand('copy'); } catch (_) {}
                field.remove(); button.focus();
            }
            document.getElementById('copy-status').textContent = t(success ? 'Copied' : 'Copy failed; select and copy the text.');
        }));
        updateConfig();
        const status = document.getElementById('connection-mode');
        try {
            const response = await fetch(urls.discovery, {signal: AbortSignal.timeout(8000), credentials: 'same-origin'});
            if (!response.ok) throw new Error('discovery failed');
            const discovery = (await response.json()).data;
            const local = localEndpoint(discovery, urls.studio);
            if (local) {
                urls = local;
                document.getElementById('studio-base').value = urls.studio;
                document.querySelectorAll('[data-connect-link]').forEach(link => { link.href = urls[link.dataset.connectLink]; });
                instructions = 'Studio: ' + urls.studio + '\nservice_id: ' + discovery.service_id
                    + '\nGET ' + urls.discovery + '\n\n' + instructionText;
            }
            connection = connectionState(local ? {...discovery, pairing_available: true} : discovery, urls.studio);
            connectionMessage = t(local ? 'Studio has opened a local endpoint on this computer. Use the displayed address for pairing and external tools.' : connection.blocked
                ? 'Configure a reachable HTTPS or loopback address, then reopen this page to create pairing and client configuration.'
                : connection.mode === 'local' ? 'Local mode does not require pairing.'
                    : 'Multi-user mode: pair in your browser before using protected tools.');
            status.textContent = local ? connectionMessage : t(connection.mode === 'local' ? 'Local mode: tools use this Studio workspace.'
                : connection.blocked
                    ? 'Multi-user pairing requires HTTPS or a real loopback connection. Open Studio through that address before pairing.'
                    : 'Multi-user mode: pair in your browser before using protected tools.');
            document.getElementById('connection-transport-help').hidden = !connection.blocked;
            const authorization = document.querySelector('[data-connect-link="authorization"]');
            authorization.hidden = !connection.canPair;
            if (!connection.canPair) authorization.removeAttribute('href');
        } catch (_) {
            connectionMessage = t('Connection mode could not be read. Check that Studio is still running.');
            status.textContent = connectionMessage;
        }
        document.getElementById('connection-instructions').textContent = connectionMessage + '\n\n' + instructions;
        updateConfig();
    }
    root.addEventListener('simpai:system-params-updated', syncFooter);
    if (typeof onUiLoaded === 'function') onUiLoaded(syncFooter);
    if (typeof onUiUpdate === 'function') onUiUpdate(syncFooter);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startGuide, {once: true});
    else startGuide();
})(typeof window !== 'undefined' ? window : globalThis);
