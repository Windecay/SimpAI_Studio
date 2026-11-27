from PIL import Image
import logging
import struct
import numpy as np
import comfy.utils
import folder_paths
import simpai_ws_recovery
import time


_RECOVERY_SUBFOLDER = simpai_ws_recovery.RECOVERY_SUBFOLDER
PREVIEW_AUDIO_EVENT = 6
_AUDIO_FORMAT_CODES = {
    "flac": 20,
    "mp3": 21,
    "wav": 22,
    "opus": 23,
    "ogg": 24,
    "m4a": 25,
    "aac": 26,
}
_OPUS_SAMPLE_RATES = (8000, 12000, 16000, 24000, 48000)


def _save_recovery_image(image):
    return simpai_ws_recovery.save_image(
        folder_paths.get_temp_directory(),
        image,
    )


def _save_recovery_video(data, extension):
    return simpai_ws_recovery.save_bytes(
        folder_paths.get_temp_directory(),
        data,
        extension,
    )


def _save_recovery_audio(data, extension):
    return simpai_ws_recovery.save_bytes(
        folder_paths.get_temp_directory(),
        data,
        extension,
    )


def _notify_websocket_result(pbar, value, total, preview):
    try:
        pbar.update_absolute(value, total, preview)
    except Exception as exc:
        logging.warning("WebSocket result notification failed; history output remains available: %s", exc)


def _notify_websocket_audio(data, extension):
    fmt = str(extension or "").strip().lower().lstrip(".")
    fmt_code = _AUDIO_FORMAT_CODES.get(fmt)
    if fmt_code is None:
        return
    try:
        from server import PromptServer
        instance = getattr(PromptServer, "instance", None)
        if instance is not None and callable(getattr(instance, "send_sync", None)):
            payload = struct.pack(">I", fmt_code) + bytes(data)
            instance.send_sync(PREVIEW_AUDIO_EVENT, payload, getattr(instance, "client_id", None))
    except Exception as exc:
        logging.warning("WebSocket audio notification failed; history output remains available: %s", exc)


def _finalize_recovery_video(pbar, data, extension):
    result = _save_recovery_video(data, extension)
    _notify_websocket_result(pbar, 0, 1, (extension, data, None))
    return result


def _finalize_recovery_audio(data, extension):
    result = _save_recovery_audio(data, extension)
    _notify_websocket_audio(data, extension)
    return result

#You can use this node to save full size images through the websocket, the
#images will be sent in exactly the same format as the image previews: as
#binary images on the websocket with a 8 byte header indicating the type
#of binary message (first 4 bytes) and the image format (next 4 bytes).

#Note that no metadata will be put in the images saved with this node.

class SaveImageWebsocket:
    @classmethod
    def INPUT_TYPES(s):
        return {"required":
                    {"images": ("IMAGE", ),
                    # "format": (["PNG", "JPEG", "WEBP"], {"default": "PNG"})
                    }
                }

    RETURN_TYPES = ()
    FUNCTION = "save_images"

    OUTPUT_NODE = True

    CATEGORY = "api/image"

    def save_images(self, images): #, format):
        format = 'png'
        pbar = comfy.utils.ProgressBar(images.shape[0])
        step = 0
        results = []
        for image in images:
            i = 255. * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            result = _save_recovery_image(img)
            if result is not None:
                results.append(result)
            _notify_websocket_result(pbar, step, images.shape[0], (format, img, None))
            step += 1

        return {"ui": {"images": results}}

    @classmethod
    def IS_CHANGED(s, images): #, format):
        return time.time()

class SaveImageWebsocketLazy:
    @classmethod
    def INPUT_TYPES(s):
        return {"required":
                    {"images": ("IMAGE", ),
                     "format": (["PNG", "JPEG", "WEBP"], {"default": "PNG"})
                    }
                }

    RETURN_TYPES = ("IMAGE", )
    RETURN_NAMES = ("images", )

    FUNCTION = "save_images"

    OUTPUT_NODE = False

    CATEGORY = "api/image"

    def save_images(self, images, format):
        format = format.lower()
        pbar = comfy.utils.ProgressBar(images.shape[0])
        step = 0
        results = []
        for image in images:
            i = 255. * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            result = _save_recovery_image(img)
            if result is not None:
                results.append(result)
            _notify_websocket_result(pbar, step, images.shape[0], (format, img, None))
            step += 1

        return {"ui": {"images": results}, "result": (images,)}

class SaveVideoWebsocket:
    @classmethod
    def INPUT_TYPES(s):
        return {"required":
                    {"images": ("IMAGE", ),
                     "format": (["MP4", "WEBM"], {"default": "WEBM"}),
                     "codec": (["h264", "h265", "vp9", "av1"], {"default": "vp9"}),
                     "fps": ("FLOAT", {"default": 24.0, "min": 0.01, "max": 60.0, "step": 0.01}),
                     "crf": ("INT", {"default": 32, "min": 0, "max": 63, "step": 1}),
                    },
                "optional":
                    {"audio": ("AUDIO", ),
                    }
                }

    RETURN_TYPES = ("IMAGE", )
    FUNCTION = "save_video"

    OUTPUT_NODE = True

    CATEGORY = "api/video"

    def save_video(self, images, format, codec, fps, crf, audio=None):
        import av
        import io
        import torch
        from tqdm import tqdm
        from fractions import Fraction
        import math

        codec_map = {
            "h264": "libx264",
            "h265": "libx265",
            "vp9": "libvpx-vp9",
            "av1": "libaom-av1"
        }

        if format == "MP4" and codec in ["vp9", "av1"]:
            codec = "h264"
        elif format == "WEBM" and codec in ["h264", "h265"]:
            codec = "vp9"
        if crf > 51 and format == "MP4":
            crf = 51

        buffer = io.BytesIO()

        container = av.open(buffer, mode='w', format=format.lower())

        stream = container.add_stream(codec_map[codec], rate=Fraction(round(fps * 1000), 1000))

        height, width = images[0].shape[0], images[0].shape[1]
        stream.width = width
        stream.height = height
        stream.pix_fmt = 'yuv420p'

        stream.options = {'crf': str(crf)}

        if audio is not None:
            try:
                audio_waveform = audio['waveform']
                audio_sample_rate = audio['sample_rate']
                # audio_stream = container.add_stream('aac', rate=audio_sample_rate)
                audio_codec = 'aac' if format == 'MP4' else 'libvorbis'
                audio_stream = container.add_stream(audio_codec, rate=audio_sample_rate)
            except Exception as e:
                msg = str(e)
                if "Output file does not contain any stream" in msg:
                    print("Warning: No audio stream found in input video. Saving without audio.")
                else:
                    print(f"Warning: Could not extract audio from input: {e}")
                audio = None
            
        pbar = comfy.utils.ProgressBar(len(images))

        for i, img in tqdm(enumerate(images), desc="Encoding Frame", unit="frame", total=len(images)):
            frame_data = torch.clamp(img[..., :3] * 255, min=0, max=255).to(device=torch.device("cpu"), dtype=torch.uint8).numpy()
            frame = av.VideoFrame.from_ndarray(frame_data, format='rgb24')
            for packet in stream.encode(frame):
                container.mux(packet)
            pbar.update(1)

        for packet in stream.encode():
            container.mux(packet)

        if audio is not None:

            waveform = audio_waveform[0] # [channels, samples]
            
            # Ensure it's CPU and numpy
            waveform = waveform.cpu().numpy()
            
            if not waveform.flags['C_CONTIGUOUS']:
                waveform = np.ascontiguousarray(waveform)

            layout = 'stereo' if waveform.shape[0] > 1 else 'mono'

            frame = av.AudioFrame.from_ndarray(waveform, format='fltp', layout=layout)
            frame.sample_rate = audio_sample_rate
            frame.pts = 0
            
            for packet in audio_stream.encode(frame):
                container.mux(packet)
                
            for packet in audio_stream.encode():
                container.mux(packet)

        container.close()

        video_data = buffer.getvalue()

        result = _finalize_recovery_video(pbar, video_data, format)
        return {"ui": {"video": [result] if result is not None else []}, "result": (images, )}

    @classmethod
    def IS_CHANGED(s, images, format, codec, fps, crf, audio=None):
        return time.time()


def _encode_audio_waveform_bytes(waveform, sample_rate, fmt, quality="320k"):
    import av
    import io
    import torch

    fmt = str(fmt or "flac").strip().lower().lstrip(".")
    if fmt not in ("flac", "mp3", "opus", "wav"):
        raise ValueError(f"Unsupported SaveAudioWebsocket format: {fmt!r}")

    if isinstance(waveform, torch.Tensor):
        wf = waveform.detach().cpu().float()
    else:
        wf = torch.as_tensor(waveform, dtype=torch.float32)

    if wf.ndim == 1:
        wf = wf.unsqueeze(0)
    elif wf.ndim > 2:
        wf = wf.reshape(wf.shape[-2], wf.shape[-1])
    if wf.shape[0] > 2:
        wf = wf[:2]

    target_rate = int(sample_rate or 44100)
    if fmt == "opus":
        if target_rate > 48000:
            target_rate = 48000
        elif target_rate not in _OPUS_SAMPLE_RATES:
            for candidate in _OPUS_SAMPLE_RATES:
                if candidate > target_rate:
                    target_rate = candidate
                    break
            if target_rate not in _OPUS_SAMPLE_RATES:
                target_rate = 48000
        if target_rate != int(sample_rate or 44100):
            import comfy.audio
            wf = comfy.audio.resample(wf, int(sample_rate or 44100), target_rate)

    layout = "mono" if wf.shape[0] == 1 else "stereo"
    interleaved = np.ascontiguousarray(wf.movedim(0, 1).reshape(1, -1).numpy())

    buffer = io.BytesIO()
    container = av.open(buffer, mode="w", format=fmt)
    try:
        if fmt == "wav":
            out_stream = container.add_stream("pcm_s16le", rate=target_rate, layout=layout)
            pcm_s16 = np.round(np.clip(interleaved, -1.0, 1.0) * 32767.0).astype(np.int16)
            frame = av.AudioFrame.from_ndarray(pcm_s16, format="s16", layout=layout)
        elif fmt == "opus":
            out_stream = container.add_stream("libopus", rate=target_rate, layout=layout)
            bitrate_map = {"64k": 64000, "96k": 96000, "128k": 128000, "192k": 192000, "320k": 320000, "V0": 192000}
            if quality in bitrate_map:
                out_stream.bit_rate = bitrate_map[quality]
            frame = av.AudioFrame.from_ndarray(interleaved, format="flt", layout=layout)
        elif fmt == "mp3":
            out_stream = container.add_stream("libmp3lame", rate=target_rate, layout=layout)
            if quality == "V0":
                out_stream.codec_context.qscale = 1
            elif quality == "128k":
                out_stream.bit_rate = 128000
            elif quality == "192k":
                out_stream.bit_rate = 192000
            else:
                out_stream.bit_rate = 320000
            frame = av.AudioFrame.from_ndarray(interleaved, format="flt", layout=layout)
        else:
            out_stream = container.add_stream("flac", rate=target_rate, layout=layout)
            frame = av.AudioFrame.from_ndarray(interleaved, format="flt", layout=layout)

        frame.sample_rate = target_rate
        frame.pts = 0
        for packet in out_stream.encode(frame):
            container.mux(packet)
        for packet in out_stream.encode(None):
            container.mux(packet)
    finally:
        container.close()

    return buffer.getvalue()


class SaveAudioWebsocket:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio": ("AUDIO",),
                "format": (["FLAC", "MP3", "OPUS", "WAV"], {"default": "FLAC"}),
            },
            "optional": {
                "quality": (["V0", "128k", "192k", "320k"], {"default": "320k"}),
                "use_mp3": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "save_audio"
    OUTPUT_NODE = True
    CATEGORY = "api/audio"

    def save_audio(self, audio, format="FLAC", quality="320k", use_mp3=False):
        if audio is None or "waveform" not in audio:
            raise ValueError("SaveAudioWebsocket: input audio is empty or missing waveform.")

        effective_format = "mp3" if bool(use_mp3) else str(format or "FLAC").strip().lower()
        sample_rate = int(audio.get("sample_rate") or 44100)
        waveforms = audio["waveform"]
        if getattr(waveforms, "ndim", 0) == 2:
            batch_items = [waveforms]
        else:
            batch_items = [waveforms[idx] for idx in range(waveforms.shape[0])]

        pbar = comfy.utils.ProgressBar(max(1, len(batch_items)))
        results = []
        for waveform in batch_items:
            audio_bytes = _encode_audio_waveform_bytes(
                waveform,
                sample_rate=sample_rate,
                fmt=effective_format,
                quality=str(quality or "320k"),
            )
            result = _finalize_recovery_audio(audio_bytes, effective_format)
            if result is not None:
                results.append(result)
            pbar.update(1)

        return {"ui": {"audio": results}, "result": (audio,)}

    @classmethod
    def IS_CHANGED(s, audio, format="FLAC", quality="320k", use_mp3=False):
        return time.time()


NODE_CLASS_MAPPINGS = {
    "SaveImageWebsocket": SaveImageWebsocket,
    "SaveImageWebsocketLazy": SaveImageWebsocketLazy,
    "SaveVideoWebsocket": SaveVideoWebsocket,
    "SaveAudioWebsocket": SaveAudioWebsocket,
}
