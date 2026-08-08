from __future__ import annotations

import os
import sys
import time
import webbrowser
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


_LOCAL_PROXY_BYPASS_HOSTS = ("127.0.0.1", "localhost", "::1")


def _proxy_bypass_values(value: str | None) -> list[str]:
    if not value:
        return []
    values: list[str] = []
    for item in value.replace(";", ",").split(","):
        token = item.strip()
        if token and token not in values:
            values.append(token)
    return values


def _ensure_local_proxy_bypass() -> None:
    for key in ("NO_PROXY", "no_proxy"):
        values = _proxy_bypass_values(os.environ.get(key))
        normalized = {value.lower() for value in values}
        for host in _LOCAL_PROXY_BYPASS_HOSTS:
            if host.lower() not in normalized:
                values.append(host)
                normalized.add(host.lower())
        os.environ[key] = ",".join(values)


ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
os.chdir(ROOT)
_ensure_local_proxy_bypass()


def _default_userhome_path() -> str:
    return os.path.abspath(os.path.join(ROOT, "..", "..", "users"))


def _ensure_forge_neo_userhome_path(args_manager_module) -> None:
    args = getattr(args_manager_module, "args", None)
    if args is None:
        return
    args.forge_neo_read_only_user_config = True
    if getattr(args, "userhome_path", None):
        return
    args.userhome_path = _default_userhome_path()


def _browser_dark_url(url: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["__theme"] = "dark"
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _launch() -> tuple[object, str, str | None]:
    import args_manager

    _ensure_forge_neo_userhome_path(args_manager)

    import modules.constants as constants
    import shared
    from forge_neo.api import install_api_routes
    from forge_neo.assets import apply_assets
    from forge_neo.bootstrap import ensure_config, ensure_shared_token
    from forge_neo.extension_adapter import extension_allowed_paths, install_extension_adapter_routes
    from forge_neo.restart import ensure_server_state
    from forge_neo.tipo_runtime import ensure_tipo_kgen_startup
    from forge_neo.ui import create_app
    from modules.auth import auth_enabled, check_auth
    from ui.bootstrap import launch_root_app

    ensure_shared_token()
    ensure_server_state()
    modules_config = ensure_config()
    apply_assets()
    ensure_tipo_kgen_startup(python_executable=sys.executable)
    try:
        from forge_neo.runtime_backend.source_runtime import start_source_backend_service

        source_backend = start_source_backend_service()
        print(
            "[Forge Neo]: source backend standby service "
            f"pid={source_backend.get('pid')} model_loaded={source_backend.get('model_loaded')}",
            flush=True,
        )
    except Exception as exc:
        print(f"[Forge Neo]: source backend standby service failed: {type(exc).__name__}: {exc}", flush=True)
    shared.gradio_root = create_app()

    allowed_paths = [
        os.path.abspath("."),
        os.path.abspath("./javascript"),
        os.path.abspath("./css"),
        os.path.abspath("./html"),
        os.path.abspath("./webfonts"),
        os.path.abspath("./language"),
        os.path.abspath("./presets"),
        modules_config.path_userhome,
        modules_config.get_path_models_root(),
        *modules_config.paths_checkpoints,
        *modules_config.paths_loras,
        *modules_config.paths_vae,
        *modules_config.paths_text_encoders,
        *modules_config.paths_clip,
        *modules_config.paths_diffusion_models,
        *extension_allowed_paths(),
    ]

    launch_kwargs = dict(
        inbrowser=args_manager.args.in_browser,
        server_name=args_manager.args.listen,
        server_port=args_manager.args.port,
        share=args_manager.args.share,
        root_path=args_manager.args.webroot,
        auth=check_auth if (args_manager.args.share or args_manager.args.listen) and auth_enabled else None,
        allowed_paths=list(dict.fromkeys(os.path.abspath(path) for path in allowed_paths if path)),
        blocked_paths=[constants.AUTH_FILENAME],
        footer_links=[],
        prevent_thread_lock=True,
    )

    if not args_manager.args.in_browser:
        app, local_url, share_url = launch_root_app(shared.gradio_root, **launch_kwargs)
        install_api_routes(app)
        install_extension_adapter_routes(app)
        return app, local_url, share_url

    original_open = webbrowser.open

    def open_dark(url: str, *args, **kwargs):
        return original_open(_browser_dark_url(url), *args, **kwargs)

    webbrowser.open = open_dark
    try:
        app, local_url, share_url = launch_root_app(shared.gradio_root, **launch_kwargs)
        install_api_routes(app)
        install_extension_adapter_routes(app)
        return app, local_url, share_url
    finally:
        webbrowser.open = original_open


def _close_gradio_root() -> None:
    import shared

    root = getattr(shared, "gradio_root", None)
    close = getattr(root, "close", None)
    if callable(close):
        close()


def _run_forever() -> None:
    from forge_neo.restart import ensure_server_state

    state = ensure_server_state()
    while True:
        _launch()
        try:
            while True:
                server_command = state.wait_for_server_command(timeout=5)
                if server_command in ("stop", "restart", "kill"):
                    break
                if server_command:
                    print(f"Unknown Forge Neo server command: {server_command}")
        except KeyboardInterrupt:
            print("Caught KeyboardInterrupt, stopping Forge Neo UI...")
            server_command = "stop"

        if server_command == "stop":
            print("Stopping Forge Neo UI...")
            _close_gradio_root()
            break

        if server_command == "kill":
            print("Killing Forge Neo UI...")
            _close_gradio_root()
            os._exit(0)

        os.environ.setdefault("SD_WEBUI_RESTARTING", "1")
        print("Reloading Forge Neo UI...")
        time.sleep(1.0)
        _close_gradio_root()
        time.sleep(0.5)


if __name__ == "__main__":
    _run_forever()
