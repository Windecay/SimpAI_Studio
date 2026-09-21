import math

import numpy as np
from PIL import Image, ImageFilter


LANCZOS = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS
MIN_INPAINT_CONTEXT = 384


def resample_image(image, width, height):
    return np.array(Image.fromarray(image).resize((int(width), int(height)), resample=LANCZOS))


def get_image_shape_ceil(image):
    height, width = image.shape[:2]
    return math.ceil(((height * width) ** 0.5) / 64.0) * 64.0


def set_image_shape_ceil(image, shape_ceil):
    shape_ceil = float(shape_ceil)
    origin_height, origin_width = image.shape[:2]
    height, width = origin_height, origin_width
    for _ in range(256):
        current = math.ceil(((height * width) ** 0.5) / 64.0) * 64.0
        if abs(current - shape_ceil) < 0.1:
            break
        scale = shape_ceil / current
        height = int(round(float(height) * scale / 64.0) * 64)
        width = int(round(float(width) * scale / 64.0) * 64)
    if height == origin_height and width == origin_width:
        return image
    return resample_image(image, width, height)


def _odd_kernel_size(size, ratio, max_size):
    kernel = max(1, min(int(max_size), int(round(float(size) * ratio))))
    if kernel % 2 == 0:
        kernel = kernel + 1 if kernel < max_size else kernel - 1
    return max(1, kernel)


def mask_blend_parameters(image_height, image_width):
    short_side = max(1, min(int(image_height), int(image_width)))
    dilation_kernel_size = _odd_kernel_size(short_side, 0.02, 65)
    blur_kernel_size = _odd_kernel_size(short_side, 0.05, 129)
    return dilation_kernel_size, blur_kernel_size, max(0.2, blur_kernel_size / 5)


def _blend_parameters_for_mask(mask):
    indices = np.where(mask > 0)
    if len(indices[0]) == 0:
        height, width = mask.shape[:2]
    else:
        height = int(np.max(indices[0]) - np.min(indices[0]) + 1)
        width = int(np.max(indices[1]) - np.min(indices[1]) + 1)
    _, blur_kernel_size, sigma = mask_blend_parameters(height, width)
    blur_kernel_size = max(3, blur_kernel_size)
    return blur_kernel_size, max(0.2, blur_kernel_size / 5)


def _blend_extent(area, processing_shape=None):
    top, bottom, left, right = area
    height, width = max(1, bottom - top), max(1, right - left)
    sample_height, sample_width = processing_shape[:2] if processing_shape is not None else (height, width)
    dilation, _, sigma = mask_blend_parameters(sample_height, sample_width)
    scale = max(height / sample_height, width / sample_width)
    # Keep the sampling mask's grown region, then transition beyond its blur.
    inner = ((dilation - 1) / 2 + sigma) * scale
    transition = max(2.0, 4 * sigma * scale)
    return inner, inner + transition


def _blend_inpaint(foreground, background, mask, area, processing_shape=None):
    import cv2

    inner, outer = _blend_extent(area, processing_shape)
    weight = mask.astype(np.float32) / 255.0
    core = mask == 255
    if core.any():
        distance = cv2.distanceTransform((~core).astype(np.uint8), cv2.DIST_L2, 5)
        t = np.clip((outer - distance) / (outer - inner), 0.0, 1.0)
        # The decoded continuation outside the user's mask belongs to the edit too.
        weight = np.maximum(weight, t * t * (3.0 - 2.0 * t))
    else:
        distance = None

    fg = foreground.astype(np.float32)
    bg = background.astype(np.float32)
    top, bottom, left, right = _clip_area_to_image(*area, background.shape)
    valid = np.zeros(mask.shape, dtype=bool)
    valid[top:bottom, left:right] = True
    weight *= valid
    if distance is not None:
        context = valid & (mask == 0) & (distance > outer) & (distance <= outer + (outer - inner))
        if np.count_nonzero(context) >= 64:
            # Only unchanged context can identify a common decode colour offset.
            delta = bg[context] - fg[context]
            offset = np.median(delta, axis=0)
            residual = np.percentile(np.abs(delta - offset), 80, axis=0)
            if np.max(np.abs(offset)) <= 24 and np.max(residual) <= 12:
                fg = fg + offset

    weight = weight[:, :, None]
    return np.rint(fg.clip(0, 255) * weight + bg * (1.0 - weight)).clip(0, 255).astype(np.uint8)


def _mask_to_image_shape(mask, image):
    import cv2

    image_height, image_width = image.shape[:2]
    mask = np.asarray(mask)
    if mask.ndim == 3:
        mask = np.max(mask, axis=2)
    if mask.size > 0 and float(np.nanmax(mask)) <= 1.0:
        mask = mask * 255.0
    mask = np.nan_to_num(mask, nan=0.0, posinf=255.0, neginf=0.0)
    mask = np.clip(mask, 0, 255).astype(np.uint8)
    if mask.shape[:2] != (image_height, image_width):
        mask = cv2.resize(mask, (image_width, image_height), interpolation=cv2.INTER_NEAREST)
    return np.ascontiguousarray(mask)


def _clip_area_to_image(a, b, c, d, image_shape):
    image_height, image_width = image_shape[:2]
    return (max(0, min(int(a), image_height)), max(0, min(int(b), image_height)),
            max(0, min(int(c), image_width)), max(0, min(int(d), image_width)))


def _box_blur(image, radius):
    return np.array(Image.fromarray(image).filter(ImageFilter.BoxBlur(radius)))


def _morphological_open(mask):
    import cv2

    values = np.zeros_like(mask, dtype=np.int16)
    values[mask > 127] = 256
    for _ in range(32):
        values = np.maximum(cv2.dilate(values, np.ones((3, 3), dtype=np.int16)) - 8, values)
    return np.clip(values, 0, 255).astype(np.uint8)


def _compute_initial_area(mask):
    indices = np.where(mask)
    if len(indices[0]) == 0:
        height, width = mask.shape[:2]
        return 0, height, 0, width
    top, bottom = np.min(indices[0]), np.max(indices[0])
    left, right = np.min(indices[1]), np.max(indices[1])
    center_y, half_height = (bottom + top) // 2, (bottom - top) // 2
    center_x, half_width = (right + left) // 2, (right - left) // 2
    radius = int(max(half_height, half_width) * 1.15)
    return _clip_area_to_image(center_y - radius, center_y + radius + 1,
                               center_x - radius, center_x + radius + 1, mask.shape)


def _expand_area(mask, area, respective_field):
    top, bottom, left, right = area
    height, width = mask.shape[:2]
    while bottom - top < height * respective_field or right - left < width * respective_field:
        add_height = bottom - top < right - left or right - left == width
        add_width = not add_height or bottom - top == height
        if add_height:
            top -= 1
            bottom += 1
        if add_width:
            left -= 1
            right += 1
        top, bottom, left, right = _clip_area_to_image(top, bottom, left, right, mask.shape)
    return top, bottom, left, right


def _expand_area_to_minimum(area, image_shape, minimum_size=MIN_INPAINT_CONTEXT):
    top, bottom, left, right = area
    image_height, image_width = image_shape[:2]
    short_side = min(image_height, image_width)
    minimum_size = max(1, int(minimum_size))
    if short_side >= minimum_size:
        minimum_height = minimum_size
        minimum_width = minimum_size
    else:
        minimum_short_side = max(1, short_side // 2)
        if image_height <= image_width:
            minimum_height = minimum_short_side
            minimum_width = min(image_width, int(round(minimum_short_side * image_width / image_height)))
        else:
            minimum_width = minimum_short_side
            minimum_height = min(image_height, int(round(minimum_short_side * image_height / image_width)))

    target_height = max(bottom - top, minimum_height)
    target_width = max(right - left, minimum_width)

    center_y = (top + bottom) / 2.0
    center_x = (left + right) / 2.0
    top = int(round(center_y - target_height / 2.0))
    left = int(round(center_x - target_width / 2.0))
    top = max(0, min(top, image_height - target_height))
    left = max(0, min(left, image_width - target_width))
    return top, top + target_height, left, left + target_width


def _fill_image(image, mask):
    current = image.copy()
    area = np.where(mask < 127)
    original = image[area]
    for radius, repeats in ((512, 2), (256, 2), (128, 4), (64, 4), (33, 8), (15, 8), (5, 16), (3, 16)):
        for _ in range(repeats):
            current = _box_blur(current, radius)
            current[area] = original
    return current


class InpaintWorker:
    def __init__(self, image, mask, use_fill=True, k=0.618, use_upscale_model=False):
        mask = _mask_to_image_shape(mask, image)
        self.interested_area = _expand_area_to_minimum(
            _expand_area(mask, _compute_initial_area(mask > 0), float(k)),
            mask.shape,
        )
        top, bottom, left, right = self.interested_area
        self.interested_mask = mask[top:bottom, left:right]
        self.interested_image = set_image_shape_ceil(image[top:bottom, left:right], 1024)
        height, width = self.interested_image.shape[:2]
        self.interested_mask = (resample_image(self.interested_mask, width, height) > 127).astype(np.uint8) * 255
        self.interested_fill = _fill_image(self.interested_image, self.interested_mask) if use_fill else self.interested_image.copy()
        self.mask = _morphological_open(mask)
        self.blend_mask = mask
        self.image = image

    def color_correction(self, image):
        image_height, image_width = self.image.shape[:2]
        if image.shape[:2] != (image_height, image_width):
            image = resample_image(image, image_width, image_height)
        mask = _mask_to_image_shape(getattr(self, 'blend_mask', self.mask), self.image)
        return _blend_inpaint(
            image, self.image, mask,
            getattr(self, 'interested_area', (0, image_height, 0, image_width)),
            getattr(self, 'interested_image', image).shape,
        )

    def post_process(self, image):
        top, bottom, left, right = _clip_area_to_image(*self.interested_area, self.image.shape)
        if bottom <= top or right <= left:
            return self.image.copy()
        result = self.image.copy()
        result[top:bottom, left:right] = resample_image(image, right - left, bottom - top)
        return self.color_correction(result)
