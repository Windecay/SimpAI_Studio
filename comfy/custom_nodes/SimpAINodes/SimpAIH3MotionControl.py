import torch


DEPTH_BLEND_ALPHA = 0.45
POSE_BLEND_ALPHA = 1.0


class SimpAIH3MotionControl:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "use_depth": ("BOOLEAN", {"default": False}),
                "use_pose": ("BOOLEAN", {"default": False}),
                "strength": ("FLOAT", {"default": 0.8, "min": 0.0, "max": 2.0, "step": 0.05}),
            },
            "optional": {
                "depth_video": ("IMAGE",),
                "pose_video": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("IMAGE", "FLOAT")
    RETURN_NAMES = ("control_video", "effective_strength")
    FUNCTION = "select"
    CATEGORY = "SimpAI/MiniMax H3"

    def select(self, use_depth, use_pose, strength, depth_video=None, pose_video=None):
        if not use_depth and not use_pose:
            return None, 0.0

        if use_depth and depth_video is None:
            raise ValueError("Depth control is enabled but the depth video is unavailable.")
        if use_pose and pose_video is None:
            raise ValueError("Pose control is enabled but the pose video is unavailable.")

        if use_depth and use_pose:
            if depth_video.shape != pose_video.shape:
                raise ValueError("Depth and pose control videos must share the same frame layout.")
            # Keep the depth map as a faint structural base, then overlay the
            # pose lines at full visibility so the skeleton stays readable.
            control_video = (
                depth_video[..., :3] * DEPTH_BLEND_ALPHA
                + pose_video[..., :3] * POSE_BLEND_ALPHA
            )
        elif use_depth:
            control_video = depth_video[..., :3]
        else:
            control_video = pose_video[..., :3]

        if not torch.isfinite(control_video).all():
            raise ValueError("Control video must contain only finite values.")
        return control_video.clamp(0, 1), float(strength)


NODE_CLASS_MAPPINGS = {
    "SimpAIH3MotionControl": SimpAIH3MotionControl,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIH3MotionControl": "H3 Motion Control Selector",
}
