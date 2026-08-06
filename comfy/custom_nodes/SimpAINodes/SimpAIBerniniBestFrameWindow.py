from comfy_api.latest import io


def _ceil_4n1(value):
    value = max(1, int(value))
    return 1 + ((value - 1 + 3) // 4) * 4


def _floor_4n1(value):
    value = max(1, int(value))
    return 1 + ((value - 1) // 4) * 4


def _window_bounds(min_frames, max_frames):
    min_window = _ceil_4n1(min_frames)
    max_window = _floor_4n1(max_frames)
    if max_window < min_window:
        max_window = min_window
    return min_window, max_window


def _best_segment_frames(total_frames, target_frames, force_size, min_frames, max_frames):
    total_frames = max(1, int(total_frames))
    min_frames, max_frames = _window_bounds(min_frames, max_frames)

    if force_size > 1:
        forced = _ceil_4n1(force_size)
        return max(min_frames, min(forced, max_frames))

    if total_frames <= min_frames:
        return min_frames

    target_frames = max(min_frames, min(_floor_4n1(target_frames), max_frames))
    if total_frames <= target_frames:
        return min(max(min_frames, _ceil_4n1(total_frames)), target_frames)
    return target_frames


class SimpAIBerniniBestFrameWindow(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIBerniniBestFrameWindow",
            display_name="SimpAI Bernini Best Frame Window",
            category="image/video",
            description=(
                "Choose a legal 4n+1 segment frame count while keeping the target as a VRAM limit."
            ),
            inputs=[
                io.Int.Input("total_frames", default=81, min=1, max=100000, step=1),
                io.Int.Input("target_frames", default=81, min=1, max=100000, step=1),
                io.Int.Input("force_size", default=1, min=1, max=1025, step=4),
                io.Int.Input("min_frames", default=33, min=1, max=100000, step=4),
                io.Int.Input("max_frames", default=185, min=1, max=100000, step=4),
            ],
            outputs=[
                io.Int.Output(display_name="segment_frames"),
            ],
        )

    @classmethod
    def execute(cls, total_frames, target_frames, force_size, min_frames, max_frames) -> io.NodeOutput:
        return io.NodeOutput(
            _best_segment_frames(total_frames, target_frames, force_size, min_frames, max_frames)
        )


NODE_CLASS_MAPPINGS = {
    "SimpAIBerniniBestFrameWindow": SimpAIBerniniBestFrameWindow,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIBerniniBestFrameWindow": "SimpAI Bernini Best Frame Window",
}
