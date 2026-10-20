"""Run with an isolated Python environment containing tools/requirements-mcp.txt."""

import argparse
import asyncio
import base64
import json
import os
from pathlib import Path
import sys
from urllib.parse import quote, unquote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from modules.agent_mcp_client import ConnectionError, StudioConnection


ADAPTER_VERSION = "1.0.3"
IMAGE_READ_TOOL = "simpai.assets.read"
MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024
IMAGE_MIMES = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/tiff"}


def asset_read_hints(data):
    if not isinstance(data, dict):
        return data

    def describe(asset):
        if not isinstance(asset, dict) or not isinstance(asset.get("asset_id"), str):
            return asset
        asset = {**asset, "resource_uri": "simpai://assets/" + quote(asset["asset_id"], safe="")}
        if not asset.get("mime") or asset["mime"] in IMAGE_MIMES:
            asset["read_image"] = {"name": IMAGE_READ_TOOL, "arguments": {"asset_id": asset["asset_id"]}}
        return asset

    data = describe(data)
    if isinstance(data.get("assets"), list):
        data = {**data, "assets": [describe(asset) for asset in data["assets"]]}
    return data


def create_server(connection):
    import mcp_types as types
    from mcp.server import Server

    async def list_tools(ctx, params):
        catalog = await asyncio.to_thread(connection.tools)
        items = catalog.get("tools", []) if isinstance(catalog, dict) else catalog
        tools = []
        for item in items:
            if item["name"] == IMAGE_READ_TOOL:
                continue
            description = item["description"]
            if item["name"] in {"simpai.runs.get", "simpai.runs.submit", "simpai.workflows.submit", "simpai.assets.upload"}:
                description += " To view an image, call simpai.assets.read with its asset_id; a filesystem read tool is not needed."
            tools.append(types.Tool(
                name=item["name"], description=description, input_schema=item["input_schema"],
                annotations=types.ToolAnnotations(read_only_hint=bool(item["read_only"]),
                                                  destructive_hint=item["name"] == "simpai.runs.cancel",
                                                  idempotent_hint=bool(item["read_only"])),
            ))
        tools.append(types.Tool(
            name=IMAGE_READ_TOOL,
            description="View an owned uploaded image, mask or generated image. Returns native MCP image content, "
                        "not just a URL or text containing base64. Supply the asset_id from upload or runs.get; "
                        "no filesystem read tool or resources/read support is needed. Requires existing read permission. "
                        "Original image bytes up to 10 MiB; use resources/read for larger originals, video or audio. "
                        "Does not run a VLM, generate, modify or delete media.",
            input_schema={"type": "object", "properties": {
                "asset_id": {"type": "string", "pattern": r"^(?:asset|file):[0-9a-f]{24,64}$",
                             "description": "Owned Studio image asset ID; never a filesystem path or external URL."}},
                          "required": ["asset_id"], "additionalProperties": False},
            annotations=types.ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True),
        ))
        return types.ListToolsResult(tools=tools)

    async def call_tool(ctx, params):
        try:
            arguments = params.arguments or {}
            images = []
            if params.name == IMAGE_READ_TOOL:
                if (not isinstance(arguments, dict) or set(arguments) != {"asset_id"}
                        or not isinstance(arguments.get("asset_id"), str)):
                    raise ConnectionError("invalid_request", {
                        "code": "invalid_request", "message": "Supply only an owned image asset_id.",
                    })
                binary, mime = await asyncio.to_thread(connection.asset, arguments["asset_id"],
                                                       max_bytes=MAX_INLINE_IMAGE_BYTES)
                if mime not in IMAGE_MIMES:
                    raise ConnectionError("unsupported_image_type", {
                        "code": "unsupported_image_type",
                        "message": "This asset is not a supported image. Use resources/read for video or audio.",
                    })
                images.append(types.ImageContent(type="image", data=base64.b64encode(binary).decode("ascii"),
                                                 mime_type=mime))
                data = {"asset_id": arguments["asset_id"], "mime": mime, "size": len(binary)}
            else:
                data = await asyncio.to_thread(connection.call_tool, params.name, arguments)
            data = asset_read_hints(data)
            result = {"ok": True, "data": data}
            return types.CallToolResult(content=[
                types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False)), *images],
                                        structured_content=result)
        except ConnectionError as exc:
            error = exc.public_error
            if params.name == IMAGE_READ_TOOL and exc.code == "asset_too_large":
                error = {**error, "message": "The image exceeds the 10 MiB inline limit. Use resources/read for the original."}
            result = {"ok": False, "error": error}
            return types.CallToolResult(content=[types.TextContent(type="text", text=json.dumps(result))],
                                        structured_content=result, is_error=True)

    async def templates(ctx, params):
        return types.ListResourceTemplatesResult(resource_templates=[types.ResourceTemplate(
            uri_template="simpai://assets/{asset_id}", name="Studio media",
            description="Read an owned result or uploaded asset using the private Studio connection.",
        )])

    async def resources(ctx, params):
        return types.ListResourcesResult(resources=[])

    async def read_resource(ctx, params):
        uri = str(params.uri)
        if not uri.startswith("simpai://assets/"):
            raise ValueError("Unsupported resource URI")
        binary, mime = await asyncio.to_thread(connection.asset, unquote(uri[len("simpai://assets/"):]))
        return types.ReadResourceResult(contents=[types.BlobResourceContents(
            uri=uri, mime_type=mime, blob=base64.b64encode(binary).decode("ascii"),
        )])

    return Server("simpai-studio", version=ADAPTER_VERSION, on_list_tools=list_tools, on_call_tool=call_tool,
                  on_list_resources=resources, on_list_resource_templates=templates, on_read_resource=read_resource,
                  instructions="Discover current presets and schemas, preview the route, and submit only within user authorization. "
                               "Read simpai.prompts.guidance and its skills before writing a model prompt. "
                               "Use simpai.prompts.tags for Anima/Danbooru, then simpai.prompts.validate. "
                               "For image tag inference, check simpai.prompts.wd14_status and call simpai.prompts.wd14 "
                               "with an owned image asset_id; it never downloads missing models. Tags are candidates, not identity or age proof. "
                               "Keep the user's instruction separate from the final model prompt and verify returned text before generation. "
                               "Model download permission is separate. Reuse request_id only with the same request. "
                               "View uploaded images, masks and finished images with simpai.assets.read(asset_id); "
                               "it returns native image content through tools/call and needs no filesystem read tool. "
                               "Only claim to have inspected an image after reading its image content. "
                               "Other original media is available through resources/read using simpai://assets/{asset_id}. "
                               "Authentication belongs to the private connection.")


async def serve(connection):
    from mcp.server.stdio import stdio_server
    server = create_server(connection)
    async with stdio_server() as (reader, writer):
        await server.run(reader, writer, server.create_initialization_options())


def main():
    parser = argparse.ArgumentParser(description="SimpAI Studio MCP stdio adapter")
    parser.add_argument("--base-url", default=os.environ.get("SIMPAI_STUDIO_URL"))
    parser.add_argument("--pair", action="store_true", help="Pair in a human terminal before starting the MCP client")
    parser.add_argument("--scope", action="append", help="Pairing scopes; include read. Download requires models.download")
    parser.add_argument("--expected-did", default="")
    parser.add_argument("--days", type=int, default=30, choices=range(1, 31))
    args = parser.parse_args()
    if not args.base_url:
        parser.error("Set --base-url or SIMPAI_STUDIO_URL to the actual Studio service address")
    try:
        connection = StudioConnection(args.base_url)
        if args.pair:
            connection.pair(lambda url, code: print(f"Open in the Studio browser: {url}\nPairing code: {code}", file=sys.stderr),
                            args.scope, args.expected_did, args.days)
            print("Authorization saved in the private connection store.", file=sys.stderr)
        else:
            asyncio.run(serve(connection))
    except ConnectionError as exc:
        hint = ""
        if exc.code in {"credentials_require_https", "secure_transport_required"}:
            hint = (" Use a configured HTTPS endpoint or a reachable loopback listener on the Studio computer. "
                    "A LAN IP on the same computer is not loopback. Read /api/v1/connect for launch options; "
                    "do not guess HTTPS ports or use a backend port.")
        elif exc.code == "pairing_required":
            hint = " Run --pair in a human terminal using the same OS account as the MCP client."
        print(f"Studio connection: {exc.code}.{hint}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
