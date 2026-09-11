import argparse
import ast
import importlib.util
import json
import os
import tempfile
import unittest


class TestComfydLaunchArgsContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "enhanced", "simpleai.py"))
        with open(path, "r", encoding="utf-8") as f:
            cls.content = f.read()
        args_manager_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "args_manager.py"))
        with open(args_manager_path, "r", encoding="utf-8") as f:
            cls.args_manager_content = f.read()
        comfyd_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "main_comfyd.py"))
        with open(comfyd_path, "r", encoding="utf-8") as f:
            cls.comfyd_content = f.read()
        cuda_malloc_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "cuda_malloc.py"))
        with open(cuda_malloc_path, "r", encoding="utf-8") as f:
            cls.cuda_malloc_content = f.read()
        comfy_main_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "main.py"))
        with open(comfy_main_path, "r", encoding="utf-8") as f:
            cls.comfy_main_content = f.read()
        simpai_extra_paths_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "simpai_extra_paths.py"))
        with open(simpai_extra_paths_path, "r", encoding="utf-8") as f:
            cls.simpai_extra_paths_content = f.read()
        hunyuan_foley_path = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "..",
                "comfy",
                "custom_nodes",
                "ComfyUI-HunyuanVideo_Foley",
                "hunyuan_foley.py",
            )
        )
        with open(hunyuan_foley_path, "r", encoding="utf-8") as f:
            cls.hunyuan_foley_content = f.read()
        server_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "server.py"))
        with open(server_path, "r", encoding="utf-8") as f:
            cls.server_content = f.read()
        model_management_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "comfy", "model_management.py"))
        with open(model_management_path, "r", encoding="utf-8") as f:
            cls.model_management_content = f.read()
        reserved_vram_node_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "comfy", "custom_nodes", "ComfyUI-ReservedVRAM", "nodes.py")
        )
        with open(reserved_vram_node_path, "r", encoding="utf-8") as f:
            cls.reserved_vram_node_content = f.read()
        launch_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "launch.py"))
        with open(launch_path, "r", encoding="utf-8") as f:
            cls.launch_content = f.read()
        requirements_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "requirements.txt"))
        with open(requirements_path, "r", encoding="utf-8") as f:
            cls.requirements_content = f.read()
        comfy_requirements_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "comfy", "requirements.txt")
        )
        with open(comfy_requirements_path, "r", encoding="utf-8") as f:
            cls.comfy_requirements_content = f.read()
        simpleai_update_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "simpleai_update.py"))
        with open(simpleai_update_path, "r", encoding="utf-8") as f:
            cls.simpleai_update_content = f.read()
        optional_accel_requirements_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "requirements-optional-accel.txt")
        )
        with open(optional_accel_requirements_path, "r", encoding="utf-8") as f:
            cls.optional_accel_requirements_content = f.read()

    def test_compiler_disabled_by_default_without_disabling_dynamic_vram(self):
        tree = ast.parse(self.content)
        tree.body = [
            node for node in tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name in {"_build_comfyd_launch_args", "_append_comfyd_arg"}
        ]
        namespace = {
            "_launch_arg_was_set": lambda flag, argv: flag in (argv or []),
            "_default_non_nvidia_comfyd_guards": lambda argv: [],
        }
        exec(compile(tree, "<comfyd-launch-args>", "exec"), namespace)
        build = namespace["_build_comfyd_launch_args"]
        for argv in ([], ["--disable-comfy-compiler"]):
            self.assertEqual(build(argv), [["--disable-comfy-compiler"]])
        self.assertEqual(build(["--enable-comfy-compiler"]), [["--enable-comfy-compiler"]])
        self.assertEqual(build(["--use-sage-attention"]), [
            ["--disable-comfy-compiler"], ["--use-sage-attention"],
        ])
        self.assertIn('comfy_compiler_group.add_argument("--enable-comfy-compiler"', self.args_manager_content)
        self.assertIn('comfy_compiler_group.add_argument("--disable-comfy-compiler"', self.args_manager_content)

    def test_direct_comfyd_entry_defaults_compiler_off_before_core_parsing(self):
        tree = ast.parse(self.comfyd_content)
        tree.body = [
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "_comfyd_compiler_args"
        ]
        namespace = {"argparse": argparse}
        exec(compile(tree, "<comfyd-compiler-args>", "exec"), namespace)
        normalize = namespace["_comfyd_compiler_args"]
        self.assertEqual(normalize([]), ["--disable-comfy-compiler"])
        self.assertEqual(normalize(["--disable-comfy-compiler"]), ["--disable-comfy-compiler"])
        self.assertEqual(normalize(["--enable-comfy-compiler"]), [])
        unchanged = ["--port", "8187", "--reserve-vram", "1", "--use-sage-attention"]
        self.assertEqual(normalize(unchanged), unchanged + ["--disable-comfy-compiler"])
        self.assertEqual(normalize(unchanged + ["--enable-comfy-compiler"]), unchanged)
        with self.assertRaises(SystemExit):
            normalize(["--enable-comfy-compiler", "--disable-comfy-compiler"])
        self.assertLess(
            self.comfyd_content.index("sys.argv[1:] = _comfyd_compiler_args(sys.argv[1:])"),
            self.comfyd_content.index("from comfy.cli_args import"),
        )

    def test_launch_installs_required_onnxruntime_cuda13_build(self):
        self.assertIn("ORT_CUDA13_INDEX_URL", self.launch_content)
        self.assertIn("ORT_CUDA13_DEFAULT_WHEEL_URL", self.launch_content)
        self.assertIn("ORT_CUDA13_WHEEL_URL", self.launch_content)
        self.assertIn("def _default_ort_cuda13_wheel_url", self.launch_content)
        self.assertIn('platform.system() == "Windows"', self.launch_content)
        self.assertIn("sys.version_info[:2] == (3, 13)", self.launch_content)
        self.assertIn('ORT_CUDA13_PACKAGE = os.environ.get("ORT_CUDA13_PACKAGE", ORT_CUDA13_DEFAULT_PACKAGE)', self.launch_content)
        self.assertIn("onnxruntime_gpu-1.27.0.dev20260511001-cp313-cp313-win_amd64.whl", self.launch_content)
        self.assertIn("ort-cuda-13-nightly", self.launch_content)
        self.assertIn("CUDA version used in build", self.launch_content)
        self.assertIn("pip uninstall -y onnxruntime onnxruntime-gpu", self.launch_content)
        self.assertIn('--no-deps --force-reinstall "{ORT_CUDA13_WHEEL_URL}"', self.launch_content)
        self.assertIn("--no-deps --force-reinstall --index-url {ORT_CUDA13_INDEX_URL} {ORT_CUDA13_PACKAGE}", self.launch_content)
        self.assertIn("def _onnxruntime_cuda13_install_attempts", self.launch_content)
        self.assertIn("install_onnxruntime_gpu_cuda13()", self.launch_content)
        self.assertNotIn("ORT_CUDA13_PRE_DEPS", self.launch_content)
        self.assertNotIn("install_package_with_retry(pkg_name)", self.launch_content)
        self.assertNotIn("('onnxruntime-gpu', '1.25.1')", self.launch_content)

        active_requirements = "\n".join(
            line.strip()
            for line in self.requirements_content.splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        )
        self.assertNotIn("onnxruntime-gpu", active_requirements)
        self.assertNotIn("bitsandbytes==0.45.5; platform_system == \"Linux\" or platform_system == \"Windows\"", active_requirements)
        self.assertIn("Custom cu12x environments must install their matching onnxruntime-gpu wheel manually.", self.requirements_content)
        self.assertIn("requirements-optional-accel.txt", self.requirements_content)
        self.assertIn("bitsandbytes==0.45.5; platform_system == \"Linux\" or platform_system == \"Windows\"", self.optional_accel_requirements_content)

    def test_project_requirements_track_comfyd_upstream_runtime_packages(self):
        active_requirements = {
            line.strip()
            for line in self.requirements_content.splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
        active_comfy_requirements = {
            line.strip()
            for line in self.comfy_requirements_content.splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }

        for requirement in [
            "comfyui-frontend-package==1.51.10",
            "comfyui-workflow-templates==0.11.59",
            "comfyui-embedded-docs==0.5.11",
            "comfy-kitchen==0.2.33",
            "comfy-aimdo==0.5.3",
            "av>=17.0.0",
            "PyOpenGL>=3.1.8",
            "comfy-angle",
        ]:
            self.assertIn(requirement, active_requirements)
            self.assertIn(requirement, active_comfy_requirements)

        for stale_requirement in [
            "comfyui-workflow-templates==0.11.55",
            "comfy-aimdo==0.5.2",
            "comfyui-frontend-package==1.51.9",
            "comfyui-workflow-templates==0.11.50",
            "comfyui-embedded-docs==0.5.10",
            "comfy-kitchen==0.2.31",
            "comfy-aimdo==0.4.15",
            "comfyui-frontend-package==1.45.21",
            "comfyui-workflow-templates==0.11.12",
            "comfyui-embedded-docs==0.5.8",
            "comfy-kitchen==0.2.22",
            "comfy-kitchen==0.2.28",
            "comfy-aimdo==0.4.10",
            "comfyui-frontend-package==1.47.12",
            "comfyui-workflow-templates==0.11.27",
            "comfy-aimdo==0.4.11",
            "comfyui-frontend-package==1.45.20",
            "comfyui-workflow-templates==0.11.6",
            "comfyui-embedded-docs==0.5.7",
            "comfy-kitchen==0.2.18",
            "comfyui-frontend-package==1.48.7",
            "comfyui-workflow-templates==0.11.39",
            "comfyui-embedded-docs==0.5.9",
            "comfy-kitchen==0.2.30",
            "comfyui-frontend-package==1.49.6",
            "comfyui-workflow-templates==0.11.44",
            "comfy-aimdo==0.4.13",
            "av>=16.0.0",
            "glfw",
        ]:
            self.assertNotIn(stale_requirement, active_requirements)
            self.assertNotIn(stale_requirement, active_comfy_requirements)

        for launcher_requirement in [
            "('comfyui-frontend-package', '1.51.10', None)",
            "('comfyui-workflow-templates', '0.11.59', None)",
            "('comfyui-embedded-docs', '0.5.11', None)",
            "('comfy-kitchen', '0.2.33', None)",
            "('comfy-aimdo', '0.5.3', None)",
            "('av', '17.0.0', None)",
            "('PyOpenGL', None, '>=3.1.8')",
            "('comfy-angle', None, None)",
        ]:
            self.assertIn(launcher_requirement, self.launch_content)

        for updater_requirement in [
            '("comfyui-frontend-package", "1.51.10", None)',
            '("comfyui-workflow-templates", "0.11.59", None)',
            '("comfyui-embedded-docs", "0.5.11", None)',
            '("comfy-kitchen", "0.2.33", None)',
            '("comfy-aimdo", "0.5.3", None)',
            '("av", "17.0.0", None)',
            '("PyOpenGL", None, ">=3.1.8")',
            '("comfy-angle", None, None)',
        ]:
            self.assertIn(updater_requirement, self.simpleai_update_content)

        self.assertIn("def _package_requirement_met", self.launch_content)
        self.assertIn("packaging_specifiers.SpecifierSet(version_specifier)", self.launch_content)
        self.assertIn('pip install -U "{install_spec}"', self.launch_content)
        self.assertIn("version_specifier=update_pkg_specifier", self.launch_content)
        self.assertIn('OPTIONAL_ACCEL_REQUIREMENTS_FILE = os.environ.get("OPTIONAL_ACCEL_REQUIREMENTS_FILE", "requirements-optional-accel.txt")', self.launch_content)
        self.assertIn('success = install_package_with_retry("bitsandbytes", bnb_version)', self.launch_content)
        self.assertNotIn("('comfy-kitchen', '0.2.12')", self.launch_content)

    def test_launch_validates_simpleai_base_wheel_hash_before_install(self):
        self.assertIn("SIMPLEAI_BASE_WHEEL_SHA256", self.launch_content)
        self.assertIn("simpleai_base-0.3.53-cp313-cp313-win_amd64.whl", self.launch_content)
        self.assertIn("e181a55ff32a2f49115db1399762fee8d8f7ca2622f4ecfccf85097b182b15e9", self.launch_content)
        self.assertIn('ver_required = "0.3.53"', self.launch_content)
        self.assertIn("def _remote_sha256_from_headers", self.launch_content)
        self.assertIn('requests.head(url, allow_redirects=True, timeout=(5, 20))', self.launch_content)
        build_launcher_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "build_launcher.py"))
        with open(build_launcher_path, "r", encoding="utf-8") as f:
            build_launcher_content = f.read()
        self.assertIn('requests.get(url, allow_redirects=True, stream=True, timeout=(5, 30))', build_launcher_content)
        self.assertIn('"X-Linked-Etag"', self.launch_content)
        self.assertIn("def _expected_simpleai_base_wheel_sha256", self.launch_content)
        self.assertIn("def _file_sha256", self.launch_content)
        self.assertIn("def _simpleai_base_wheel_hash_matches", self.launch_content)
        self.assertIn("def _ensure_simpleai_base_wheel", self.launch_content)
        self.assertIn("_delete_simpleai_base_wheel(base_path)", self.launch_content)
        self.assertIn("redownloaded = download_if_updated(base_url, base_path)", self.launch_content)
        self.assertIn("has_update_whl, has_valid_base_wheel = _ensure_simpleai_base_wheel(base_url, base_path, base_file)", self.launch_content)
        self.assertIn("if has_valid_base_wheel:", self.launch_content)
        self.assertIn("安装包未通过完整性校验，已阻止安装", self.launch_content)

    def test_comfyd_direct_entry_installs_cuda13_onnxruntime_only_for_cu130(self):
        self.assertIn("def install_onnxruntime_gpu_cuda13_for_comfyd", self.comfyd_content)
        self.assertIn("def _torch_version_noimport", self.comfyd_content)
        self.assertIn('if "+cu130" not in torch_version:', self.comfyd_content)
        self.assertIn('"onnxruntime-gpu==1.27.0.dev20260511001"', self.comfyd_content)
        self.assertIn("ORT_CUDA13_DEFAULT_WHEEL_URL", self.comfyd_content)
        self.assertIn("ORT_CUDA13_WHEEL_URL", self.comfyd_content)
        self.assertIn("def _default_ort_cuda13_wheel_url", self.comfyd_content)
        self.assertIn('platform.system() == "Windows"', self.comfyd_content)
        self.assertIn("sys.version_info[:2] == (3, 13)", self.comfyd_content)
        self.assertIn("onnxruntime_gpu-1.27.0.dev20260511001-cp313-cp313-win_amd64.whl", self.comfyd_content)
        self.assertIn('"--no-deps"', self.comfyd_content)
        self.assertIn('"--force-reinstall"', self.comfyd_content)
        self.assertIn("install_onnxruntime_gpu_cuda13_for_comfyd()", self.comfyd_content)
        self.assertIn('"pip", "uninstall", "-y", "onnxruntime", "onnxruntime-gpu"', self.comfyd_content)
        self.assertIn("def _onnxruntime_cuda13_install_commands", self.comfyd_content)
        self.assertIn("CUDA version used in build", self.comfyd_content)

    def test_comfyd_direct_entry_installs_llama_cpp_runtime_before_comfy_imports(self):
        installer_block = self.comfyd_content.split(
            "def install_llama_cpp_runtime_for_comfyd():", 1
        )[1].split("def install_requirements_sequential():", 1)[0]
        startup_block = self.comfyd_content.split('if __name__ == "__main__":', 1)[1].split(
            "import comfy.options", 1
        )[0]

        self.assertIn('os.path.join(target_dir, "modules", "llama_cpp_runtime.py")', self.comfyd_content)
        self.assertNotIn("sys.path.append(target_dir)", self.comfyd_content)
        self.assertIn("LLAMA_CPP_RUNTIME_VERSION", self.comfyd_content)
        self.assertIn("llama_cpp_version_matches", self.comfyd_content)
        self.assertIn("select_llama_cpp_wheel", self.comfyd_content)
        self.assertIn('SIMPAI_SKIP_LLAMA_CPP_RUNTIME', installer_block)
        self.assertIn('if "+cu" not in torch_version.lower():', installer_block)
        self.assertIn("artifact = select_llama_cpp_wheel()", installer_block)
        self.assertIn("_llama_cpp_runtime_probe_for_comfyd()", installer_block)
        self.assertIn("#sha256={artifact['sha256']}", installer_block)
        self.assertIn('"--no-deps"', installer_block)
        self.assertIn('"--force-reinstall"', installer_block)
        self.assertIn('"--no-cache-dir"', installer_block)
        self.assertIn("env=_pip_env()", installer_block)
        self.assertIn("install_llama_cpp_runtime_for_comfyd()", startup_block)
        self.assertLess(
            self.comfyd_content.index("install_llama_cpp_runtime_for_comfyd()", self.comfyd_content.index(startup_block)),
            self.comfyd_content.index("import comfy.options"),
        )

        probe_block = self.comfyd_content.split(
            "def _llama_cpp_runtime_probe_for_comfyd():", 1
        )[1].split("def _cleanup_legacy_llama_cpp_wheel_cache_for_comfyd", 1)[0]
        self.assertIn("ggml_backend_load_all_from_path", probe_block)
        self.assertLess(probe_block.index("backend_loader(ctypes.c_char_p"), probe_block.index("gpu_probe()"))
        self.assertIn("_torch_lib_dir_noimport()", probe_block)
        self.assertIn('probe_env["PATH"] = torch_lib +', probe_block)

    def test_comfyd_requirements_installer_allows_dependencies(self):
        installer_block = self.comfyd_content.split("def install_requirements_sequential():", 1)[1].split('if __name__ == "__main__":', 1)[0]
        self.assertIn('"--force-reinstall"', installer_block)
        self.assertNotIn('"--no-deps"', installer_block)

    def test_direct_comfyd_entry_uses_backend_aware_cuda_malloc_policy(self):
        self.assertIn("import cuda_malloc", self.comfyd_content)
        self.assertIn("import cuda_malloc", self.comfy_main_content)
        self.assertIn("def get_raw_cuda_version", self.cuda_malloc_content)
        self.assertIn('if not args.cuda_malloc:', self.cuda_malloc_content)
        self.assertIn('if args.disable_cuda_malloc:', self.cuda_malloc_content)
        self.assertIn('if int(version[0]) >= 2 and "+cu" in version:', self.cuda_malloc_content)
        self.assertIn('if PerformanceFeature.AutoTune not in args.fast:', self.cuda_malloc_content)
        self.assertIn('args.cuda_malloc = cuda_malloc_supported()', self.cuda_malloc_content)
        self.assertIn("backend:cudaMallocAsync", self.cuda_malloc_content)

    def test_launch_args_are_mapped_locally_for_comfyd(self):
        self.assertIn("def _build_comfyd_launch_args", self.content)
        self.assertIn("def _default_comfyd_cuda_malloc_arg", self.content)
        self.assertIn("def _torch_runtime_backend_kind", self.content)
        self.assertIn("def _windows_display_vendor_ids", self.content)
        self.assertIn("def _log_default_comfyd_cuda_malloc_decision", self.content)
        self.assertNotIn("comfyd.args_mapping(sys.argv)", self.content)

        expected_mappings = (
            ('"--gpu-device-id", "gpu_device_id", "--cuda-device"'),
            ('"--preview-option", "preview_option", "--preview-method"'),
            ('"--reserve-vram", "reserve_vram", "--reserve-vram"'),
            ('"--vram-headroom", "vram_headroom", "--vram-headroom"'),
            ('"--disable-attention-upcast", "--dont-upcast-attention"'),
            ('"--all-in-fp32", "--force-fp32"'),
            ('"--all-in-fp16", "--force-fp16"'),
            ('"--unet-in-bf16", "--bf16-unet"'),
            ('"--unet-in-fp16", "--fp16-unet"'),
            ('"--unet-in-fp8-e4m3fn", "--fp8_e4m3fn-unet"'),
            ('"--unet-in-fp8-e5m2", "--fp8_e5m2-unet"'),
            ('"--vae-in-fp16", "--fp16-vae"'),
            ('"--vae-in-fp32", "--fp32-vae"'),
            ('"--vae-in-bf16", "--bf16-vae"'),
            ('"--vae-in-cpu", "--cpu-vae"'),
            ('"--clip-in-fp8-e4m3fn", "--fp8_e4m3fn-text-enc"'),
            ('"--clip-in-fp8-e5m2", "--fp8_e5m2-text-enc"'),
            ('"--clip-in-fp16", "--fp16-text-enc"'),
            ('"--clip-in-fp32", "--fp32-text-enc"'),
            ('"--attention-split", "--use-split-cross-attention"'),
            ('"--attention-quad", "--use-quad-cross-attention"'),
            ('"--attention-pytorch", "--use-pytorch-cross-attention"'),
            ('"--use-sage-attention", "--use-sage-attention"'),
            ('"--use-flash-attention", "--use-flash-attention"'),
            ('"--always-high-vram", "--highvram"'),
            ('"--always-no-vram", "--novram"'),
            ('"--pytorch-deterministic", "--deterministic"'),
            ('"--disable-metadata", "--disable-metadata"'),
        )
        for mapping in expected_mappings:
            self.assertIn(mapping, self.content)

        self.assertIn('_append_comfyd_arg(mapped, "--directml"', self.content)
        self.assertIn('_append_comfyd_arg(mapped, "--highvram")', self.content)
        self.assertIn('_append_comfyd_arg(mapped, "--disable-smart-memory")', self.content)
        self.assertIn('_append_comfyd_arg(mapped, "--disable-xformers")', self.content)
        self.assertIn("_GPU_VENDOR_NVIDIA", self.content)
        self.assertIn("_GPU_VENDOR_AMD", self.content)
        self.assertIn('if backend_kind == "cuda":', self.content)
        self.assertIn('if backend_kind in {"hip", "directml", "cpu"}:', self.content)
        self.assertIn('vendor_ids = _windows_display_vendor_ids()', self.content)
        self.assertIn('Detected torch backend: cuda; leaving cuda-malloc to Comfy defaults.', self.content)
        self.assertIn('defaulting to --disable-cuda-malloc.', self.content)
        self.assertIn('preserving NVIDIA-first defaults and leaving cuda-malloc to Comfy defaults.', self.content)
        self.assertIn('return "--disable-cuda-malloc"', self.content)
        self.assertIn('default_cuda_malloc_arg = _default_comfyd_cuda_malloc_arg()', self.content)
        self.assertIn('"--always-normal-vram"', self.content)
        self.assertNotIn('("--always-normal-vram", "--normalvram")', self.content)
        self.assertNotIn('"--normalvram"', self.content)
        self.assertNotIn("'--normalvram'", self.content)

    def test_disable_offload_suppresses_default_disable_smart_memory(self):
        memory_mode_block = self.content.split("has_launch_memory_mode = any(_launch_arg_was_set(flag) for flag in (", 1)[1].split("))", 1)[0]
        self.assertIn('"--disable-offload-from-vram"', memory_mode_block)
        self.assertNotIn('"--always-offload-from-vram"', memory_mode_block)
        self.assertIn("disable_smart_memory = bool(ads.get_admin_default('disable_smart_memory_checkbox'))", self.content)
        self.assertIn("if disable_smart_memory and not has_launch_memory_mode and shared.sysinfo['gpu_memory'] >= 8180", self.content)

    def test_runtime_memory_checkboxes_control_comfyd_args(self):
        self.assertIn("dynamic_vram_enabled = bool(ads.get_admin_default('dynamic_vram_checkbox'))", self.content)
        self.assertIn("dynamic_vram = [] if dynamic_vram_enabled else [['--disable-dynamic-vram']]", self.content)
        self.assertIn("def set_dynamic_vram", self.content)
        self.assertIn("def set_disable_smart_memory", self.content)

    def test_reserved_vram_setting_controls_both_comfyd_headroom_arguments(self):
        self.assertIn("reserved_vram = ads.get_admin_default('reserved_vram')", self.content)
        self.assertIn("[['--reserve-vram', f'{reserved_vram}']]", self.content)
        self.assertIn("[['--vram-headroom', f'{reserved_vram}']]", self.content)
        self.assertIn("not _launch_arg_was_set(\"--reserve-vram\")", self.content)
        self.assertIn("not _launch_arg_was_set(\"--vram-headroom\")", self.content)
        self.assertIn("+ reserve_vram + vram_headroom +", self.content)
        self.assertIn('args_parser.parser.add_argument("--vram-headroom", type=float, default=None', self.args_manager_content)

    def test_comfyd_cache_ram_disabled_launches_classic_cache(self):
        self.assertIn("def _build_comfyd_cache_args", self.content)
        self.assertIn("if cache_ram_enable and cache_ram_value_num > 0:", self.content)
        self.assertIn('return [["--cache-ram", f"{cache_ram_value}"]]', self.content)
        self.assertIn('return [["--cache-classic"]]', self.content)
        self.assertIn("cache_ram = _build_comfyd_cache_args(cache_ram_enable, cache_ram_value)", self.content)

    def test_runtime_reserved_vram_updates_dynamic_vram_headroom(self):
        self.assertIn("def _default_extra_reserved_vram", self.model_management_content)
        self.assertIn("reserved_mb = 1024 if WINDOWS else 400", self.model_management_content)
        self.assertIn("EXTRA_RESERVED_VRAM = _default_extra_reserved_vram()", self.model_management_content)
        self.assertIn("def _sync_aimdo_simple_vram_headroom", self.model_management_content)
        self.assertIn("comfy.memory_management.aimdo_enabled", self.model_management_content)
        self.assertIn('getattr(aimdo_control, "lib", None) is None', self.model_management_content)
        self.assertIn("aimdo_control.lib.set_simple_vram_headroom(int(reserved_vram))", self.model_management_content)
        self.assertNotIn("aimdo_control.init(simple_vram_headroom=int(reserved_vram))", self.model_management_content)
        self.assertIn("default_reserved = _default_extra_reserved_vram()", self.model_management_content)
        self.assertIn("_sync_aimdo_simple_vram_headroom(default_reserved)", self.model_management_content)
        self.assertIn("_sync_aimdo_simple_vram_headroom(reserved_vram)", self.model_management_content)
        self.assertIn("comfy.model_management.set_extra_reserved_vram(json_data['reserved_vram'])", self.server_content)

    def test_reserved_vram_node_uses_runtime_setter(self):
        self.assertIn("def set_reserved_vram", self.reserved_vram_node_content)
        self.assertIn("def sync_dynamic_vram_headroom", self.reserved_vram_node_content)
        self.assertIn('hasattr(model_management, "set_extra_reserved_vram")', self.reserved_vram_node_content)
        self.assertIn("model_management.set_extra_reserved_vram(reserved_gb)", self.reserved_vram_node_content)
        self.assertIn('getattr(memory_management, "aimdo_enabled", False)', self.reserved_vram_node_content)
        self.assertIn('getattr(aimdo_control.lib, "set_simple_vram_headroom", None)', self.reserved_vram_node_content)
        self.assertNotIn("aimdo_control.init(simple_vram_headroom=int(reserved_vram))", self.reserved_vram_node_content)
        self.assertIn("sync_dynamic_vram_headroom(reserved_vram)", self.reserved_vram_node_content)
        self.assertEqual(self.reserved_vram_node_content.count("model_management.EXTRA_RESERVED_VRAM ="), 1)

    def test_comfyd_port_selection_reserves_frontend_port(self):
        self.assertIn("reserved_ports=None", self.content)
        self.assertIn("port not in excluded_ports and is_port_available(port, host)", self.content)
        self.assertIn('frontend_port = getattr(args_manager.args, "port", None)', self.content)
        self.assertIn("reserved_backend_ports = {frontend_port} if frontend_port is not None else set()", self.content)
        self.assertIn(
            "find_available_port(args_manager.args.backend_port, suppress_logging=True, reserved_ports=reserved_backend_ports)",
            self.content,
        )
        self.assertIn("find_available_port(8187, reserved_ports=reserved_backend_ports)", self.content)

    def test_comfyd_direct_launch_writes_simpai_extra_model_paths(self):
        self.assertIn("def write_simpai_extra_model_paths_from_config", self.comfyd_content)
        self.assertIn('return simpai_extra_paths.write_simpai_extra_model_paths_from_config(yaml_path)', self.comfyd_content)
        self.assertIn("write_simpai_extra_model_paths_from_config(extra_model_paths_config_path)", self.comfyd_content)
        self.assertIn("write_simpai_extra_model_paths_from_config(extra_model_paths_config_path)", self.comfy_main_content)
        self.assertIn("utils.extra_config.load_extra_path_config(extra_model_paths_config_path)", self.comfyd_content)
        self.assertIn("utils.extra_config.load_extra_path_config(extra_model_paths_config_path)", self.comfy_main_content)
        self.assertIn('os.path.join(repo_root, "..", "..", "users", "config.txt")', self.simpai_extra_paths_content)
        self.assertIn('"checkpoints": ("path_diffusion_models", "path_checkpoints")', self.simpai_extra_paths_content)
        self.assertIn('"diffusion_models": ("path_unet", "path_diffusion_models", "path_checkpoints")', self.simpai_extra_paths_content)
        self.assertIn('"text_encoders": ("path_text_encoders", "path_clip")', self.simpai_extra_paths_content)
        self.assertIn('"background_removal": ("path_background_removal",)', self.simpai_extra_paths_content)
        self.assertIn('"detection": ("path_detection",)', self.simpai_extra_paths_content)
        self.assertIn('"lsnet": ("path_lsnet",)', self.simpai_extra_paths_content)
        self.assertIn('"frame_interpolation": ("path_frame_interpolation",)', self.simpai_extra_paths_content)
        self.assertIn('"geometry_estimation": ("path_geometry_estimation",)', self.simpai_extra_paths_content)
        self.assertIn('"optical_flow": ("path_optical_flow",)', self.simpai_extra_paths_content)
        self.assertIn('"ultralytics": ("path_ultralytics",)', self.simpai_extra_paths_content)
        self.assertIn('"bbox": ("path_bbox",)', self.simpai_extra_paths_content)
        self.assertIn('"segm": ("path_segm",)', self.simpai_extra_paths_content)
        self.assertIn('"hunyuan_foley": ("path_hunyuan_foley",)', self.simpai_extra_paths_content)
        self.assertIn("def infer_extra_model_roots", self.simpai_extra_paths_content)
        self.assertIn('return _dedupe_paths(paths)', self.simpai_extra_paths_content)
        self.assertIn("def ensure_simpai_config_from_env", self.simpai_extra_paths_content)
        self.assertIn('"SIMPLEAI_MODELS_ROOT"', self.simpai_extra_paths_content)
        self.assertIn("def ensure_simpai_config_from_launch_context", self.simpai_extra_paths_content)
        self.assertIn("def package_models_root(repo_root):", self.simpai_extra_paths_content)
        self.assertIn("paths.extend(model_root_category_dirs(folder_name, package_models_root(repo_root)))", self.simpai_extra_paths_content)
        self.assertIn('"../../SimpleModels"', self.simpai_extra_paths_content)

    def test_comfyd_legacy_launch_without_env_uses_outer_simplemodels(self):
        module_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "simpai_extra_paths.py"))
        spec = importlib.util.spec_from_file_location("simpai_extra_paths_contract_legacy", module_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        env_keys = ("simpleai_userhome", "SIMPLEAI_USERHOME", "simpleai_models_root", "SIMPLEAI_MODELS_ROOT")
        previous_env = {key: os.environ.get(key) for key in env_keys}
        try:
            for key in env_keys:
                os.environ.pop(key, None)
            with tempfile.TemporaryDirectory(prefix="simpai_comfyd_legacy_layout_") as tmp:
                repo_root = os.path.join(tmp, "SimpAI_Studio_win", "SimpAI_Studio")
                yaml_path = os.path.join(repo_root, "comfy", "extra_model_paths.yaml")
                os.makedirs(os.path.dirname(yaml_path), exist_ok=True)

                self.assertTrue(module.write_simpai_extra_model_paths_from_config(yaml_path))

                config_path = os.path.join(tmp, "users", "config.txt")
                config = json.loads(open(config_path, "r", encoding="utf-8").read())
                self.assertEqual(config["path_models_root"], "../../SimpleModels")
                yaml_text = open(yaml_path, "r", encoding="utf-8").read()
                self.assertIn("models_root: ../../SimpleModels", yaml_text)
                self.assertIn("../../SimpleModels/diffusion_models", yaml_text.replace("\\", "/"))
                self.assertIn("models/diffusion_models", yaml_text.replace("\\", "/"))
                self.assertIn("models/checkpoints", yaml_text.replace("\\", "/"))
                self.assertIn("models/loras", yaml_text.replace("\\", "/"))
                self.assertNotIn(os.path.join(repo_root, "models"), yaml_text)
        finally:
            for key, value in previous_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_comfyd_env_bootstrap_creates_missing_config_and_yaml(self):
        module_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "simpai_extra_paths.py"))
        spec = importlib.util.spec_from_file_location("simpai_extra_paths_contract", module_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        env_keys = ("simpleai_userhome", "SIMPLEAI_USERHOME", "simpleai_models_root", "SIMPLEAI_MODELS_ROOT")
        previous_env = {key: os.environ.get(key) for key in env_keys}
        try:
            with tempfile.TemporaryDirectory(prefix="simpai_comfyd_env_config_") as tmp:
                user_home = os.path.join(tmp, "users")
                models_root = os.path.join(tmp, "SimpleModels")
                yaml_path = os.path.join(tmp, "SimpAI_Studio", "comfy", "extra_model_paths.yaml")
                os.makedirs(os.path.dirname(yaml_path), exist_ok=True)
                os.environ["simpleai_userhome"] = user_home
                os.environ["SIMPLEAI_MODELS_ROOT"] = models_root

                self.assertTrue(module.write_simpai_extra_model_paths_from_config(yaml_path))

                config_path = os.path.join(user_home, "config.txt")
                config = json.loads(open(config_path, "r", encoding="utf-8").read())
                self.assertEqual(config["path_models_root"], models_root)
                yaml_text = open(yaml_path, "r", encoding="utf-8").read()
                self.assertIn(f"models_root: {models_root}", yaml_text)
        finally:
            for key, value in previous_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_comfyd_env_bootstrap_preserves_existing_models_root(self):
        module_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "simpai_extra_paths.py"))
        spec = importlib.util.spec_from_file_location("simpai_extra_paths_contract_existing", module_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        env_keys = ("simpleai_userhome", "SIMPLEAI_USERHOME", "simpleai_models_root", "SIMPLEAI_MODELS_ROOT")
        previous_env = {key: os.environ.get(key) for key in env_keys}
        try:
            with tempfile.TemporaryDirectory(prefix="simpai_comfyd_existing_config_") as tmp:
                user_home = os.path.join(tmp, "users")
                os.makedirs(user_home, exist_ok=True)
                config_path = os.path.join(user_home, "config.txt")
                with open(config_path, "w", encoding="utf-8") as f:
                    json.dump({"path_models_root": "X:/keep"}, f)
                os.environ["simpleai_userhome"] = user_home
                os.environ["SIMPLEAI_MODELS_ROOT"] = "X:/new"

                module.ensure_simpai_config_from_env(tmp)

                config = json.loads(open(config_path, "r", encoding="utf-8").read())
                self.assertEqual(config["path_models_root"], "X:/keep")
        finally:
            for key, value in previous_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_comfyd_repo_relative_model_paths_stay_relative_in_yaml(self):
        module_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "simpai_extra_paths.py"))
        spec = importlib.util.spec_from_file_location("simpai_extra_paths_contract_repo_relative", module_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory(prefix="simpai_comfyd_repo_relative_") as tmp:
            repo_root = os.path.join(tmp, "Studio291package", "SimpAI_Studio")
            user_home = os.path.join(tmp, "users")
            yaml_path = os.path.join(repo_root, "comfy", "extra_model_paths.yaml")
            os.makedirs(os.path.dirname(yaml_path), exist_ok=True)
            os.makedirs(user_home, exist_ok=True)
            with open(os.path.join(user_home, "config.txt"), "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "path_models_root": "../../SimpleModels",
                        "path_checkpoints": ["../../SimpleModels/checkpoints", "models/checkpoints"],
                        "path_loras": ["../../SimpleModels/loras", "models/loras"],
                    },
                    f,
                )

            self.assertTrue(module.write_simpai_extra_model_paths_from_config(yaml_path))

            yaml_text = open(yaml_path, "r", encoding="utf-8").read()
            self.assertIn("models_root: ../../SimpleModels", yaml_text)
            self.assertIn("../../SimpleModels/checkpoints", yaml_text.replace("\\", "/"))
            self.assertIn("models/checkpoints", yaml_text.replace("\\", "/"))
            self.assertIn("models/loras", yaml_text.replace("\\", "/"))
            self.assertNotIn(os.path.normpath(os.path.join(repo_root, "models")), yaml_text)

    def test_comfyd_user_absolute_models_root_stays_absolute(self):
        module_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "comfy", "simpai_extra_paths.py"))
        spec = importlib.util.spec_from_file_location("simpai_extra_paths_contract_absolute", module_path)
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory(prefix="simpai_comfyd_absolute_models_") as tmp:
            repo_root = os.path.join(tmp, "SimpAI_Studio_win", "SimpAI_Studio")
            user_home = os.path.join(tmp, "users")
            models_root = os.path.join(tmp, "external_models")
            yaml_path = os.path.join(repo_root, "comfy", "extra_model_paths.yaml")
            os.makedirs(os.path.dirname(yaml_path), exist_ok=True)
            os.makedirs(user_home, exist_ok=True)
            with open(os.path.join(user_home, "config.txt"), "w", encoding="utf-8") as f:
                json.dump({"path_models_root": models_root}, f)

            self.assertTrue(module.write_simpai_extra_model_paths_from_config(yaml_path))

            yaml_text = open(yaml_path, "r", encoding="utf-8").read()
            self.assertIn(f"models_root: {os.path.normpath(models_root)}", yaml_text)
            self.assertIn(os.path.normpath(os.path.join(models_root, "diffusion_models")), yaml_text)

    def test_hunyuan_foley_loader_uses_configured_model_paths(self):
        self.assertIn('FOLEY_FOLDER_NAME = "hunyuan_foley"', self.hunyuan_foley_content)
        self.assertIn("folder_paths.get_folder_paths(FOLEY_FOLDER_NAME)", self.hunyuan_foley_content)
        self.assertIn(
            "_resolve_hunyuan_foley_model_path(model_path_name, foley_checkpoint_name)",
            self.hunyuan_foley_content,
        )
        self.assertIn("_resolve_hunyuan_foley_vae_path(vae_name)", self.hunyuan_foley_content)
        self.assertIn("ensure_vae_downloaded(_default_hunyuan_foley_model_dir())", self.hunyuan_foley_content)
        self.assertNotIn('model_dir = os.path.join(folder_paths.models_dir, "hunyuan_foley")', self.hunyuan_foley_content)

    def test_comfyd_local_entry_and_io_runtime_update_are_preserved(self):
        self.assertIn("allow_loopback_bypass = is_loopback(request.remote)", self.server_content)
        self.assertIn("if (not allow_loopback_bypass) and (not key_point or", self.server_content)
        self.assertIn('response.set_cookie("sstoken", key_point or "bypass_auth"', self.server_content)
        self.assertIn('if "inputs" in json_data:', self.server_content)
        self.assertIn("folder_paths.set_input_directory(json_data['inputs'])", self.server_content)

    def test_comfyd_local_entry_clears_official_workspace_state_before_frontend_boot(self):
        self.assertIn("def _comfyd_index_response(web_root):", self.server_content)
        self.assertIn("response = _comfyd_index_response(self.web_root)", self.server_content)
        for key in (
            "Comfy.Workspace.Current",
            "Comfy.Workspace.Token",
            "Comfy.Workspace.ExpiresAt",
            "Comfy.Workspace.OwnerUid",
            "Comfy.Workspace.LastWorkspaceId",
        ):
            self.assertIn(key, self.server_content)
        self.assertIn("data-simpai-comfyd-workspace-reset", self.server_content)
        self.assertNotIn("_comfyd_index_response(self.web_root)", self.comfy_main_content)

    def test_launch_does_not_own_simpleai_base_comfyd_user_site_isolation(self):
        self.assertNotIn("def _simpleai_base_has_comfyd_usersite_isolation", self.launch_content)
        self.assertNotIn("has_comfyd_usersite_isolation", self.launch_content)


if __name__ == "__main__":
    unittest.main()
