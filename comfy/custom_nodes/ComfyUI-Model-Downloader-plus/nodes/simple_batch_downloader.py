import os
import requests
import json
import sys
from pathlib import Path
import time
from comfy_execution.graph import ExecutionBlocker
import threading
import folder_paths
from tqdm import tqdm
from urllib.parse import urlparse

class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False

ANY = AnyType("*")

class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False
any_type = AlwaysEqualProxy("*")
def get_folder_group(folder_name):
    """获取文件夹所属的组，用于跨文件夹检测文件是否存在"""
    folder_groups = {
        'checkpoints': ['checkpoints', 'diffusion_models', 'unet'],
        'diffusion_models': ['checkpoints', 'diffusion_models', 'unet'],
        'unet': ['checkpoints', 'diffusion_models', 'unet'],
        'clip': ['clip', 'text_encoders'],
        'text_encoders': ['clip', 'text_encoders'],
        'sams': ['sams', 'inpaint'],
        'inpaint': ['sams', 'inpaint'],
    }
    return folder_groups.get(folder_name, [folder_name])

def find_existing_file(file_name, model_folder):
    """在文件夹组中查找已存在的文件"""
    group = get_folder_group(model_folder)
    for folder in group:
        try:
            full_path = folder_paths.get_full_path(folder, file_name)
            if full_path and os.path.exists(full_path):
                return full_path
        except:
            pass

        manual_path = os.path.join(folder_paths.models_dir, folder, file_name)
        if os.path.exists(manual_path):
            return manual_path

    return None

def is_trusted_url(url):
    """检查URL是否属于可信站点范围"""
    trusted_domains = [
        'huggingface.co',
        'hf-mirror.com',
        'modelscope.cn',
        'github.com',
        'githubusercontent.com'
    ]

    try:
        parsed_url = urlparse(url)
        domain = parsed_url.netloc

        for trusted_domain in trusted_domains:
            if domain == trusted_domain or domain.endswith(f'.{trusted_domain}'):
                return True

        return False
    except Exception:
        return False

def replace_domain(url, from_domain, to_domain):
    """替换URL中的域名"""
    try:
        parsed_url = urlparse(url)
        if parsed_url.netloc == from_domain or parsed_url.netloc.endswith(f'.{from_domain}'):
            new_netloc = parsed_url.netloc.replace(from_domain, to_domain)
            new_url = parsed_url._replace(netloc=new_netloc).geturl()
            return new_url
        return url
    except Exception:
        return url

def download_file_with_temp(url, file_path, overwrite=False, max_retries=3, retry_delay=5):
    """下载单个文件到指定路径，使用临时文件（共享函数），支持重试和字节数验证"""
    try:
        if not is_trusted_url(url):
            error_msg = f"URL验证失败: {url} 不在可信站点范围内（目前支持的可信模型站点huggingface.co、hf-mirror.com、modelscope.cn、github.com、githubusercontent.com）"
            print(error_msg)
            return False, error_msg

        retry_mapping = {
            'huggingface.co': 'hf-mirror.com',
            'hf-mirror.com': 'huggingface.co'
        }

        success, message = attempt_download(url, file_path, overwrite, max_retries, retry_delay)

        if not success:
            parsed_url = urlparse(url)
            original_domain = None

            for domain in retry_mapping.keys():
                if parsed_url.netloc == domain or parsed_url.netloc.endswith(f'.{domain}'):
                    original_domain = domain
                    break

            if original_domain and retry_mapping[original_domain] != original_domain:
                retry_url = replace_domain(url, original_domain, retry_mapping[original_domain])
                print(f"从原始URL下载失败，尝试使用替代URL: {retry_url}")

                success, message = attempt_download(retry_url, file_path, overwrite, max_retries, retry_delay)

        return success, message

    except Exception as e:
        error_msg = f"下载过程中发生错误: {str(e)}"
        print(error_msg)
        return False, error_msg

def attempt_download(url, file_path, overwrite=False, max_retries=3, retry_delay=5):
    """尝试执行单次下载，支持重试和字节数验证"""
    for attempt in range(max_retries + 1):
        try:
            if os.path.exists(file_path):
                if not overwrite:
                    return True, f"文件已存在，跳过下载: {file_path}"
                else:
                    print(f"文件已存在，将在下载完成后覆盖: {file_path}")

            partial_file_path = file_path + ".partial"

            os.makedirs(os.path.dirname(file_path), exist_ok=True)

            print(f"开始下载: {url} 到 {file_path} (尝试 {attempt + 1}/{max_retries + 1})")
            start_time = time.time()

            try:
                with requests.get(url, stream=True, allow_redirects=True, timeout=30) as response:
                    response.raise_for_status()

                    total_size = int(response.headers.get('content-length', 0))
                    downloaded_size = 0

                    filename = os.path.basename(file_path)
                    with tqdm(total=total_size, unit='B', unit_scale=True, unit_divisor=1024,
                              desc=f"下载 {filename}", ascii=True, miniters=10, bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}] {postfix}') as pbar:

                        with open(partial_file_path, 'wb') as f:
                            start_time = time.time()
                            downloaded_size = 0
                            last_update_time = 0
                            update_interval = 0.5

                            for chunk in response.iter_content(chunk_size=8192):
                                if chunk:
                                    f.write(chunk)
                                    chunk_size = len(chunk)
                                    downloaded_size += chunk_size

                                    pbar.update(chunk_size)

                                    current_time = time.time()
                                    if current_time - last_update_time >= update_interval:
                                        elapsed_time = current_time - start_time
                                        if elapsed_time > 0.5:
                                            speed = downloaded_size / elapsed_time / 1024 / 1024  # MB/s
                                            pbar.set_postfix(speed=f"{speed:.2f} MB/s")
                                        last_update_time = current_time

            except Exception as e:
                if os.path.exists(partial_file_path):
                    try:
                        os.remove(partial_file_path)
                    except:
                        pass

                if attempt < max_retries:
                    print(f"下载失败，将在 {retry_delay} 秒后重试 (尝试 {attempt + 1}/{max_retries + 1}): {str(e)}")
                    time.sleep(retry_delay)
                    continue
                else:
                    return False, f"下载过程出错: {str(e)}"

            # 验证下载的文件字节数
            if os.path.exists(partial_file_path):
                actual_size = os.path.getsize(partial_file_path)

                # 如果服务器提供了文件大小信息，验证下载的字节数
                if total_size > 0 and actual_size != total_size:
                    print(f"警告: 下载的文件大小不匹配。期望: {total_size} 字节，实际: {actual_size} 字节")

                    if attempt < max_retries:
                        print(f"文件大小不匹配，将在 {retry_delay} 秒后重试 (尝试 {attempt + 1}/{max_retries + 1})")
                        try:
                            os.remove(partial_file_path)
                        except:
                            pass
                        time.sleep(retry_delay)
                        continue
                    else:
                        try:
                            os.remove(partial_file_path)
                        except:
                            pass
                        return False, f"下载文件大小不匹配。期望: {total_size} 字节，实际: {actual_size} 字节"

                if os.path.exists(file_path):
                    if overwrite:
                        try:
                            os.remove(file_path)
                            print(f"已删除原有文件: {file_path}")
                        except Exception as e:
                            os.remove(partial_file_path)
                            return False, f"删除原有文件失败: {str(e)}"
                    else:
                        os.remove(partial_file_path)
                        return False, f"文件已存在且未设置覆盖标志: {file_path}"

                try:
                    os.rename(partial_file_path, file_path)

                    # 最终验证文件大小
                    final_size = os.path.getsize(file_path)
                    if total_size > 0 and final_size != total_size:
                        print(f"警告: 最终文件大小不匹配。期望: {total_size} 字节，实际: {final_size} 字节")
                        return False, f"最终文件大小不匹配。期望: {total_size} 字节，实际: {final_size} 字节"

                    print(f"下载完成: {file_path} (大小: {final_size} 字节)")
                    return True, f"下载完成: {file_path} (大小: {final_size} 字节)"
                except Exception as e:
                    return False, f"重命名文件失败: {str(e)}"

            return False, "下载完成但临时文件不存在"

        except Exception as e:
            try:
                if 'partial_file_path' in locals() and os.path.exists(partial_file_path):
                    os.remove(partial_file_path)
            except:
                pass

            if attempt < max_retries:
                print(f"下载失败，将在 {retry_delay} 秒后重试 (尝试 {attempt + 1}/{max_retries + 1}): {str(e)}")
                time.sleep(retry_delay)
                continue
            else:
                error_msg = f"下载失败: {url}. 错误: {str(e)}"
                print(error_msg)
                return False, error_msg

    return False, f"下载失败: 达到最大重试次数 ({max_retries})"


class SimpleBatchDownloader:
    """批量下载模型节点，可以同时下载多个URL"""
    NAME = "SimpleBatchDownloader"
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "url1": ("STRING", {"default": "", "multiline": False, "tooltip": "url1 for download"}),
                "url2": ("STRING", {"default": "", "multiline": False, "tooltip": "url2 for download"}),
                "url3": ("STRING", {"default": "", "multiline": False, "tooltip": "url3 for download"}),
                "url4": ("STRING", {"default": "", "multiline": False, "tooltip": "url4 for download"}),
                "url5": ("STRING", {"default": "", "multiline": False, "tooltip": "url5 for download"}),
                "model_folder": ("STRING", {"default": "checkpoints", "multiline": False, "tooltip": "model folder for download"}),
                "run_download": ("BOOLEAN", {"default": True, "tooltip": "run download"}),
                "overwrite_existing": ("BOOLEAN", {"default": False, "tooltip": "overwrite existing"}),
            },
            "optional": {
                "anything": (any_type, {})
            },
        }

    RETURN_TYPES = (any_type,"STRING")
    RETURN_NAMES = ("output", "system_message")
    FUNCTION = "download_files"
    CATEGORY = "utils/download"

    def __init__(self):
        self.download_lock = threading.Lock()

    def download_files(self, url1, url2, url3, url4, url5, model_folder, run_download=True, overwrite_existing=False, anything=None):
        """下载所有非空URL的文件"""
        if not run_download:
            return ("下载已取消",)

        urls = [url for url in [url1, url2, url3, url4, url5] if url.strip()]

        if not urls:
            return ("没有提供有效的URL",)

        results = []
        with self.download_lock:
            for url in urls:
                try:
                    file_name = url.split('/')[-1].split('?')[0]

                    # 检查是否已在文件夹组中存在
                    if not overwrite_existing:
                        existing_path = find_existing_file(file_name, model_folder)
                        if existing_path:
                            results.append(f"文件已存在于组中，跳过下载: {existing_path}")
                            continue

                    model_dir = os.path.join(folder_paths.models_dir, model_folder)
                    os.makedirs(model_dir, exist_ok=True)

                    file_path = os.path.join(model_dir, file_name)

                    success, message = download_file_with_temp(url, file_path, overwrite_existing)
                    results.append(message)

                except Exception as e:
                    results.append(f"处理URL {url} 时出错: {str(e)}")

        final_message = "\n".join(results)

        return (anything, final_message)

class SimpleModelDownloader:
    """单URL下载节点，下载模型并返回模型名称"""

    NAME = "SimpleModelDownloader"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model_url": ("STRING", {"default": "", "multiline": False, "tooltip": "model url for download"}),
                "model_folder": ("STRING", {"default": "checkpoints", "multiline": False, "tooltip": "model folder for download"}),
                "run_download": ("BOOLEAN", {"default": True, "tooltip": "run download"}),
                "overwrite_existing": ("BOOLEAN", {"default": False, "tooltip": "overwrite existing"}),
            },
            "optional": {
                "anything": (any_type, {}),
                "allow_download": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = (ANY, "STRING")
    RETURN_NAMES = ("model_name", "download_message")
    FUNCTION = "download_model"
    CATEGORY = "utils/download"

    def __init__(self):

        self.download_lock = threading.Lock()

    def download_model(self, model_url, model_folder, run_download=True, overwrite_existing=False, anything=None, allow_download=True):
        """下载模型并返回带后缀的模型名称"""
        if not run_download:
            return ("", "下载已取消")
        if not allow_download:
            model_name_with_ext = model_url.split('/')[-1].split('?')[0]
            existing_path = find_existing_file(model_name_with_ext, model_folder) if model_name_with_ext else None
            if existing_path:
                return (model_name_with_ext, f"使用已有模型: {existing_path}")
            raise FileNotFoundError(
                f"Required local model '{model_name_with_ext}' is missing and downloads are disabled."
            )
        
        if not model_url.strip():
            return ("", "没有提供有效的URL")
        
        try:
            model_name_with_ext = model_url.split('/')[-1].split('?')[0]

            # 检查是否已在文件夹组中存在
            if not overwrite_existing:
                existing_path = find_existing_file(model_name_with_ext, model_folder)
                if existing_path:
                    # 如果找到了，返回已存在的文件名（不含路径，因为 ComfyUI 节点通常只需要文件名）
                    # 这里的 model_name_with_ext 就是我们要的文件名
                    return (model_name_with_ext, f"文件已存在于组中，跳过下载: {existing_path}")

            model_dir = os.path.join(folder_paths.models_dir, model_folder)
            os.makedirs(model_dir, exist_ok=True)

            file_path = os.path.join(model_dir, model_name_with_ext)
            
            with self.download_lock:
                success, message = download_file_with_temp(model_url, file_path, overwrite_existing)
                
                if success:
                    return (model_name_with_ext, message)
                else:
                    return ("", message)
                    
        except Exception as e:
            error_msg = f"处理URL时出错: {str(e)}"
            return ("", error_msg)
