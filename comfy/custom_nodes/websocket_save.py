from PIL import Image
import logging
import numpy as np
import comfy.utils
import folder_paths
import simpai_ws_recovery
import time


_RECOVERY_SUBFOLDER = simpai_ws_recovery.RECOVERY_SUBFOLDER


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


def _notify_websocket_result(pbar, value, total, preview):
    try:
        pbar.update_absolute(value, total, preview)
    except Exception as exc:
        logging.warning("WebSocket result notification failed; history output remains available: %s", exc)


def _finalize_recovery_video(pbar, data, extension):
    result = _save_recovery_video(data, extension)
    _notify_websocket_result(pbar, 0, 1, (extension, data, None))
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


NODE_CLASS_MAPPINGS = {
    "SaveImageWebsocket": SaveImageWebsocket,
    "SaveImageWebsocketLazy": SaveImageWebsocketLazy,
    "SaveVideoWebsocket": SaveVideoWebsocket,
}
