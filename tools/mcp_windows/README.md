# SimpAI Studio MCP For Windows

This is the small stdio adapter package, not Studio or a model package.
Agents that already support HTTP can use Studio's Agent API directly and do
not need this package.

1. Extract this ZIP to a new folder on the computer running the MCP client.
2. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1`.
   Setup downloads the exact runtime from the pinned SimpAI_dev ModelScope
   repository, verifies SHA256, and installs it into `runtime`. No system
   Python, pip installation, administrator access, or virtual environment is
   required. Do not use Studio's main Python environment.
   The runtime ZIP is published at the repository root, not in `libs/mcp`.
3. Read the actual Studio URL from its Agent / API connection page.
   Local mode needs no pairing. In multi-user mode, a human must run:

```powershell
.\runtime\python.exe .\tools\studio_mcp.py --base-url "ACTUAL_STUDIO_URL" --pair
```

4. Configure the MCP client with absolute paths:

```json
{
  "mcpServers": {
    "simpai": {
      "command": "C:/SimpAI-MCP/runtime/python.exe",
      "args": ["C:/SimpAI-MCP/tools/studio_mcp.py"],
      "env": {"SIMPAI_STUDIO_URL": "ACTUAL_STUDIO_URL"}
    }
  }
}
```

Keep existing MCP servers. Do not put `--pair` in the MCP startup arguments.
Studio must already be running. This adapter is not an HTTP MCP endpoint.

Setup can also use the separately published runtime ZIP offline:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -Archive "C:/Downloads/SimpAI_MCP_runtime_win_x64_py313_2.3.0.zip"
```

Setup never overwrites an existing unmanaged or different runtime directory.
Use a new extraction folder for updates. Credentials are encrypted with the
current Windows user's DPAPI and stored outside this package in
`%LOCALAPPDATA%/SimpAI/agent-connections`. Never package or give these files,
tokens, browser cookies, identity passwords, or QR codes to a model.

Missing runtime artifacts or checksum failures stop installation. Do not
replace the source with an unrelated archive. Linux/macOS use an appropriate
separate Python environment and the same stdio adapter, or use HTTP directly.

The initial adapter package used a `libs/mcp` URL. With root-level publication,
replace that adapter with version 1.0.1 or newer; the runtime ZIP is unchanged.

Version 1.0.2 supports the server's local VLM tools and their bounded inference
timeouts. Browser approval must explicitly include `vlm.infer`; ordinary read
permission does not authorize inference. The MCP client may also need its own
tool-call timeout adjusted. Model/runtime archives do not need to be replaced.

Version 1.0.3 adds `simpai.assets.read`. Call it with an image `asset_id` from
upload or `simpai.runs.get` to receive native MCP image content. It also reads
owned masks and needs no filesystem `read` tool, `resources/read` support or
local VLM inference. The client must pass image content to a vision-capable
model. Original images up to 10 MiB are supported without re-encoding; use the
resource URI for larger originals, video or audio.

To update an existing 1.0.x installation, stop its MCP process and extract this
small ZIP over the same adapter folder, then reload the MCP connection in your
client. Keep `runtime`, your client configuration and the private authorization
store. The runtime ZIP is unchanged and no new dependencies are installed.
The existing Studio asset endpoint is reused, so this fix does not require a
new Studio ZIP.
