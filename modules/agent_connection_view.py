"""Public connection instructions. No credentials or private server paths are embedded."""

import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STRINGS = (
    "Asset storage",
    "Before writing a model prompt, read prompts.guidance for the selected preset, then read its recommended skills. Use prompts.tags for Anima/Danbooru lookup and prompts.validate before preview/submission. Keep the original user instruction separate from the final model prompt.",
    "For image tag inference, check prompts.wd14_status and call prompts.wd14 with an owned image asset_id. Missing models are not downloaded automatically; candidate tags are not proof of identity or age.",
    "Send JSON as UTF-8 bytes. In Windows PowerShell, read a UTF-8 JSON file with System.IO.File.ReadAllBytes and send application/json; charset=utf-8. Do not pipe Chinese Python source through the default PowerShell encoding. Compare preview source_instruction and prompt with the original text; question marks or replacement characters mean the request must be corrected before generation.",
    "Agent API / MCP", "Connect an external agent to Studio", "Studio address", "Copy address",
    "Connection instructions", "Copy instructions", "Capabilities", "Tools", "OpenAPI", "Authorization",
    "Built-in Agent", "External Agent", "MCP client setup", "Checking connection mode...",
    "Local mode: tools use this Studio workspace.",
    "Multi-user mode: pair in your browser before using protected tools.",
    "Multi-user pairing requires HTTPS or a real loopback connection. Open Studio through that address before pairing.",
    "Connection mode could not be read. Check that Studio is still running.",
    "The built-in Harness calls Studio tools directly. It does not need this MCP adapter.",
    "The model decides whether to query tools and continue. The Harness returns results for another model turn, within its call and time limits.",
    "Generation and model downloads still follow user approval and session settings. Web search is not currently a built-in Studio tool.",
    "Agents with HTTP tools can use the Agent API directly without deploying MCP.",
    "The external MCP client starts a local Python process. That process connects to Studio over HTTP. The Studio URL is not an HTTP MCP endpoint.",
    "MCP adapter folder on the client computer", "Independent MCP Python interpreter", "Fill in the client-side MCP adapter folder to create the configuration.",
    "1. Install the independent MCP environment", "2. Pair in multi-user mode", "3. Add the server to your MCP client",
    "Local mode does not require pairing. Run this once in a terminal using the same OS account as your MCP client.",
    "Add this server alongside your existing configuration. Do not replace other MCP servers.",
    "Generic JSON", "Codex TOML", "Copy", "Copied", "Copy failed; select and copy the text.",
    "First GET auth/discovery and inspect pairing_available and next_step. If next_step is use_local_endpoint, use its published local_endpoint only on the Studio computer, read that discovery_url and verify the same service_id before pairing. Do not guess addresses or scan ports. If no usable endpoint is published, explain the remaining connection requirement. Complete browser pairing through the private connection layer, then read session and capabilities. Follow tool_index_url to search by query or category; read only the selected tools' detail_url for their parameters, then use call_url. Do not read the full tool catalog or OpenAPI document before every task. Request only necessary scopes; keep device codes and tokens out of model messages.",
    "Studio has opened a local endpoint on this computer. Use the displayed address for pairing and external tools.",
    "Configure the independent Python environment on the computer running the external agent. Do not install MCP dependencies into Studio's main Python environment.",
    "For Codex, add this to ~/.codex/config.toml. In desktop Settings > MCP servers, you can also add a STDIO server.",
    "Use your MCP client's server settings to merge this JSON configuration.",
    "Enter absolute paths. Leave Python blank to use runtime/python.exe on Windows or .venv-mcp/bin/python on other systems.",
    "On Windows, extract SimpAI_MCP_win.zip to this folder; setup downloads and verifies the independent runtime. No virtual environment is needed. Other systems use a compatible independent Python environment.",
    "This address cannot complete Agent pairing", "Local mode does not require pairing.",
    "The Studio webpage can use HTTP, but external authorization credentials require HTTPS or a real loopback connection. Being on the same computer does not make a LAN address loopback.",
    "Same computer: Studio must actually listen on 127.0.0.1 or ::1. The existing --listen 127.0.0.1 option allows local access only. If LAN access is also needed, --listen 0.0.0.0 listens on all interfaces, including loopback; choose this deliberately. Restart after changing the launch configuration and use the resulting port and deployment prefix.",
    "Other computers: use an HTTPS endpoint configured by the administrator. Changing http to https does not enable TLS. Do not use a ComfyD or Forge port for Studio authorization.",
    "Configure a reachable HTTPS or loopback address, then reopen this page to create pairing and client configuration.",
    "Local LLM API", "Installed local models", "Authorize local VLM inference", "Tool index",
    "If tool_index_url is not provided, use the server's published tools_url instead of guessing an index endpoint.",
    "Compatible Chat Completions clients use this base address. Models are discovered from Studio; credentials belong to the client's private connection layer.",
    "Local text and vision inference requires vlm.infer authorization. Models must already be installed; inference does not download files, call cloud providers or delete media.",
)


def render_connection_page(lang, theme, nonce, prefix=""):
    lang = "cn" if lang == "cn" else "en"
    dictionary = json.loads((ROOT / "language/cn.json").read_text(encoding="utf-8")) if lang == "cn" else {}
    strings = {key: dictionary.get(key, key) for key in STRINGS}
    def t(key):
        return html.escape(strings[key], quote=True)
    def copy_button(target, label="Copy"):
        return f'<button type="button" data-connect-copy="{target}">{t(label)}</button>'
    config = json.dumps({"state": {"__lang": lang, "__theme": theme}, "strings": strings,
                         "prefix": prefix}, ensure_ascii=False).replace("<", "\\u003c")
    script_url = html.escape(prefix + "/api/v1/connect/script", quote=True)
    return f'''<!doctype html><html lang="{"zh-CN" if lang == "cn" else "en"}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{t("Agent API / MCP")} · SimpAI Studio</title>
<style nonce="{nonce}">
:root{{color-scheme:light dark;--bg:#f4f5f7;--card:#fff;--fg:#202631;--muted:#596270;--border:#d9dce3;--accent:#cc5b12}}
@media(prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#16191f;--card:#20242c;--fg:#edf0f5;--muted:#b0b8c6;--border:#3d4654;--accent:#ffa35d}}}}
:root[data-theme=dark]{{--bg:#16191f;--card:#20242c;--fg:#edf0f5;--muted:#b0b8c6;--border:#3d4654;--accent:#ffa35d}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,sans-serif}}
main{{max-width:960px;margin:auto;padding:30px 24px 60px}}header{{display:flex;justify-content:space-between;align-items:start;gap:16px}}h1{{font-size:27px;margin:0}}h2,summary{{font-size:18px;font-weight:650}}h2{{margin:0 0 10px}}h3{{font-size:16px}}p{{margin:8px 0}}.muted{{color:var(--muted)}}
section,details{{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-top:18px}}summary{{cursor:pointer}}a{{color:var(--accent)}}nav,.row,.tabs{{display:flex;gap:10px;flex-wrap:wrap;align-items:center}}nav{{margin-top:14px}}nav a{{padding:4px 0;margin-right:12px}}button,input,select{{font:inherit}}button,select{{color:var(--fg);background:var(--card);border:1px solid var(--border);border-radius:7px;padding:7px 12px;cursor:pointer}}button:hover{{border-color:var(--accent)}}button:disabled{{opacity:.5;cursor:default}}button[aria-pressed=true]{{color:var(--accent);border-color:var(--accent)}}input,textarea{{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--fg)}}.row input{{flex:1;min-width:200px}}label{{display:block;margin-top:14px}}pre{{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;background:var(--bg);border:1px solid var(--border);padding:14px;border-radius:8px;font:13px/1.6 ui-monospace,Consolas,monospace}}#copy-status{{min-height:1.5em}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.grid section{{margin-top:18px}}@media(max-width:620px){{main{{padding:20px 14px}}.grid{{display:block}}section,details{{padding:16px}}h1{{font-size:23px}}header{{flex-wrap:wrap}}}}
.scope-choice{{display:flex;gap:8px;align-items:center}}.scope-choice input{{width:16px;height:16px;margin:0;flex:none}}
</style></head><body><main id="agent-connection-page">
<header><div><h1>{t("Agent API / MCP")}</h1><p class="muted">{t("Connect an external agent to Studio")}</p></div>
<select id="connect-language" aria-label="Language"><option value="cn">中文</option><option value="en">English</option></select></header>
<section><h2>{t("Studio address")}</h2><div class="row"><input id="studio-base" readonly aria-label="{t("Studio address")}">{copy_button("studio-base", "Copy address")}</div>
<p id="connection-mode" class="muted" role="status">{t("Checking connection mode...")}</p>
<div id="connection-transport-help" hidden><h3>{t("This address cannot complete Agent pairing")}</h3>
<p>{t("The Studio webpage can use HTTP, but external authorization credentials require HTTPS or a real loopback connection. Being on the same computer does not make a LAN address loopback.")}</p>
<p>{t("Same computer: Studio must actually listen on 127.0.0.1 or ::1. The existing --listen 127.0.0.1 option allows local access only. If LAN access is also needed, --listen 0.0.0.0 listens on all interfaces, including loopback; choose this deliberately. Restart after changing the launch configuration and use the resulting port and deployment prefix.")}</p>
<p>{t("Other computers: use an HTTPS endpoint configured by the administrator. Changing http to https does not enable TLS. Do not use a ComfyD or Forge port for Studio authorization.")}</p></div>
<nav>{''.join(f'<a data-connect-link="{key}" target="_blank" rel="noopener">{t(label)}</a>' for key, label in [('capabilities', 'Capabilities'), ('tools', 'Tool index'), ('openapi', 'OpenAPI'), ('authorization', 'Authorization')])}<a href="{html.escape(prefix, quote=True)}/api/v1/assets/manage?lang={lang}" target="_blank" rel="noopener">{t('Asset storage')}</a></nav></section>
<div class="grid"><section><h2>{t("Built-in Agent")}</h2><p>{t("The built-in Harness calls Studio tools directly. It does not need this MCP adapter.")}</p><p>{t("The model decides whether to query tools and continue. The Harness returns results for another model turn, within its call and time limits.")}</p><p class="muted">{t("Generation and model downloads still follow user approval and session settings. Web search is not currently a built-in Studio tool.")}</p></section>
<section><h2>{t("External Agent")}</h2><p>{t("Agents with HTTP tools can use the Agent API directly without deploying MCP.")}</p><pre id="connection-instructions"></pre>{copy_button("connection-instructions", "Copy instructions")}</section></div>
<section><h2>{t("Local LLM API")}</h2><div class="row"><input id="llm-base" readonly aria-label="{t("Local LLM API")}">{copy_button("llm-base", "Copy address")}</div>
<p>{t("Compatible Chat Completions clients use this base address. Models are discovered from Studio; credentials belong to the client's private connection layer.")}</p>
<p class="muted">{t("Local text and vision inference requires vlm.infer authorization. Models must already be installed; inference does not download files, call cloud providers or delete media.")}</p>
<a id="vlm-models-link" target="_blank" rel="noopener">{t("Installed local models")}</a></section>
<details open><summary>{t("MCP client setup")}</summary><p>{t("The external MCP client starts a local Python process. That process connects to Studio over HTTP. The Studio URL is not an HTTP MCP endpoint.")}</p>
<p class="muted">{t("On Windows, extract SimpAI_MCP_win.zip to this folder; setup downloads and verifies the independent runtime. No virtual environment is needed. Other systems use a compatible independent Python environment.")}</p>
<label for="mcp-folder">{t("MCP adapter folder on the client computer")}</label><input id="mcp-folder" placeholder="C:/SimpAI-MCP" autocomplete="off" spellcheck="false">
<label for="mcp-python">{t("Independent MCP Python interpreter")}</label><input id="mcp-python" placeholder="C:/SimpAI-MCP/runtime/python.exe" autocomplete="off" spellcheck="false">
<p class="muted">{t("Enter absolute paths. Leave Python blank to use runtime/python.exe on Windows or .venv-mcp/bin/python on other systems.")}</p>
<p class="muted">{t("Configure the independent Python environment on the computer running the external agent. Do not install MCP dependencies into Studio's main Python environment.")}</p>
<h3>{t("1. Install the independent MCP environment")}</h3><pre id="mcp-install"></pre>{copy_button("mcp-install")}
<h3>{t("2. Pair in multi-user mode")}</h3><p>{t("Local mode does not require pairing. Run this once in a terminal using the same OS account as your MCP client.")}</p>
<label class="scope-choice"><input id="connect-vlm-scope" type="checkbox">{t("Authorize local VLM inference")}</label>
<pre id="mcp-pair"></pre>{copy_button("mcp-pair")}
<h3>{t("3. Add the server to your MCP client")}</h3><p>{t("Add this server alongside your existing configuration. Do not replace other MCP servers.")}</p>
<div class="tabs"><button type="button" data-connect-format="json" aria-pressed="true">{t("Generic JSON")}</button><button type="button" data-connect-format="toml" aria-pressed="false">{t("Codex TOML")}</button></div>
<p id="mcp-config-location" class="muted"></p>
<pre id="mcp-config"></pre>{copy_button("mcp-config")}</details>
<p id="copy-status" role="status" class="muted"></p>
</main><script type="application/json" id="agent-connection-data">{config}</script><script src="{script_url}"></script></body></html>'''
