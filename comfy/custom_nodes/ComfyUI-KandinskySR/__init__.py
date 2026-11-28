"""ComfyUI-KandinskySR: Kandinsky 6.0 Video Super-Resolution 2.0 and Kandinsky ImageSR 2.0 as native ComfyUI nodes."""
from typing_extensions import override

from comfy_api.latest import ComfyExtension, io

from .kandinsky_sr.image import nodes as image_nodes
from .kandinsky_sr.studio import SimpAIKandinskySaveImage, SimpAIKandinskySaveVideo
from .kandinsky_sr.video import nodes as video_nodes


class KandinskySRExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [*video_nodes.NODES, *image_nodes.NODES, SimpAIKandinskySaveImage, SimpAIKandinskySaveVideo]


async def comfy_entrypoint() -> KandinskySRExtension:
    return KandinskySRExtension()
