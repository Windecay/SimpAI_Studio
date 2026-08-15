import torch
import numpy as np
import math

from PIL import Image, ImageFilter
import cv2


inpaint_head_model = None


LANCZOS = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS


def resample_image(im, width, height):
    im = Image.fromarray(im)
    im = im.resize((int(width), int(height)), resample=LANCZOS)
    return np.array(im)


def get_image_shape_ceil(im):
    height, width = im.shape[:2]
    return math.ceil(((height * width) ** 0.5) / 64.0) * 64.0


def set_image_shape_ceil(im, shape_ceil):
    shape_ceil = float(shape_ceil)
    origin_height, origin_width = im.shape[:2]
    height, width = origin_height, origin_width
    for _ in range(256):
        current = math.ceil(((height * width) ** 0.5) / 64.0) * 64.0
        if abs(current - shape_ceil) < 0.1:
            break
        scale = shape_ceil / current
        height = int(round(float(height) * scale / 64.0) * 64)
        width = int(round(float(width) * scale / 64.0) * 64)
    if height == origin_height and width == origin_width:
        return im
    return resample_image(im, width=width, height=height)


def perform_upscale(img):
    from modules.upscaler import perform_upscale as _perform_upscale
    return _perform_upscale(img)


class InpaintHead(torch.nn.Module):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.head = torch.nn.Parameter(torch.empty(size=(320, 5, 3, 3), device='cpu'))

    def __call__(self, x):
        x = torch.nn.functional.pad(x, (1, 1, 1, 1), "replicate")
        return torch.nn.functional.conv2d(input=x, weight=self.head)


current_task = None
MIN_INPAINT_CONTEXT = 384


def _odd_kernel_size(size, ratio, max_size):
    k = int(round(float(size) * ratio))
    k = max(1, min(int(max_size), k))
    if k % 2 == 0:
        k = k + 1 if k < max_size else k - 1
    return max(1, k)


def mask_blend_parameters(image_height, image_width):
    short_side = max(1, min(int(image_height), int(image_width)))
    dilation_kernel_size = _odd_kernel_size(short_side, 0.02, 65)
    blur_kernel_size = _odd_kernel_size(short_side, 0.05, 129)
    blur_radius = max(0.2, blur_kernel_size / 5)
    return dilation_kernel_size, blur_kernel_size, blur_radius


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


def _mask_to_image_shape(mask, image):
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
    a = max(0, min(int(a), image_height))
    b = max(0, min(int(b), image_height))
    c = max(0, min(int(c), image_width))
    d = max(0, min(int(d), image_width))
    return a, b, c, d


def box_blur(x, k):
    x = Image.fromarray(x)
    x = x.filter(ImageFilter.BoxBlur(k))
    return np.array(x)


def max_filter_opencv(x, ksize=3):
    # Use OpenCV maximum filter
    # Make sure the input type is int16
    return cv2.dilate(x, np.ones((ksize, ksize), dtype=np.int16))


def morphological_open(x):
    # Convert array to int16 type via threshold operation
    x_int16 = np.zeros_like(x, dtype=np.int16)
    x_int16[x > 127] = 256

    for i in range(32):
        # Use int16 type to avoid overflow
        maxed = max_filter_opencv(x_int16, ksize=3) - 8
        x_int16 = np.maximum(maxed, x_int16)

    # Clip negative values to 0 and convert back to uint8 type
    x_uint8 = np.clip(x_int16, 0, 255).astype(np.uint8)
    return x_uint8


def up255(x, t=0):
    y = np.zeros_like(x).astype(np.uint8)
    y[x > t] = 255
    return y


def imsave(x, path):
    x = Image.fromarray(x)
    x.save(path)


def regulate_abcd(x, a, b, c, d):
    H, W = x.shape[:2]
    if a < 0:
        a = 0
    if a > H:
        a = H
    if b < 0:
        b = 0
    if b > H:
        b = H
    if c < 0:
        c = 0
    if c > W:
        c = W
    if d < 0:
        d = 0
    if d > W:
        d = W
    return int(a), int(b), int(c), int(d)


def compute_initial_abcd(x):
    indices = np.where(x)
    if len(indices[0]) == 0:
        h, w = x.shape[:2]
        return 0, h, 0, w
    a = np.min(indices[0])
    b = np.max(indices[0])
    c = np.min(indices[1])
    d = np.max(indices[1])
    abp = (b + a) // 2
    abm = (b - a) // 2
    cdp = (d + c) // 2
    cdm = (d - c) // 2
    l = int(max(abm, cdm) * 1.15)
    a = abp - l
    b = abp + l + 1
    c = cdp - l
    d = cdp + l + 1
    a, b, c, d = regulate_abcd(x, a, b, c, d)
    return a, b, c, d


def solve_abcd(x, a, b, c, d, k):
    k = float(k)
    assert 0.0 <= k <= 1.0

    H, W = x.shape[:2]
    if k == 1.0:
        return 0, H, 0, W
    while True:
        if b - a >= H * k and d - c >= W * k:
            break

        add_h = (b - a) < (d - c)
        add_w = not add_h

        if b - a == H:
            add_w = True

        if d - c == W:
            add_h = True

        if add_h:
            a -= 1
            b += 1

        if add_w:
            c -= 1
            d += 1

        a, b, c, d = regulate_abcd(x, a, b, c, d)
    return a, b, c, d


def expand_area_to_minimum(area, image_shape, minimum_size=MIN_INPAINT_CONTEXT):
    a, b, c, d = area
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

    target_height = max(b - a, minimum_height)
    target_width = max(d - c, minimum_width)

    center_y = (a + b) / 2.0
    center_x = (c + d) / 2.0
    a = int(round(center_y - target_height / 2.0))
    c = int(round(center_x - target_width / 2.0))
    a = max(0, min(a, image_height - target_height))
    c = max(0, min(c, image_width - target_width))
    return a, a + target_height, c, c + target_width


def fooocus_fill(image, mask):
    current_image = image.copy()
    raw_image = image.copy()
    area = np.where(mask < 127)
    store = raw_image[area]

    for k, repeats in [(512, 2), (256, 2), (128, 4), (64, 4), (33, 8), (15, 8), (5, 16), (3, 16)]:
        for _ in range(repeats):
            current_image = box_blur(current_image, k)
            current_image[area] = store

    return current_image


class InpaintWorker:
    def __init__(self, image, mask, use_fill=True, k=0.618, use_upscale_model=True):
        mask = _mask_to_image_shape(mask, image)
        a, b, c, d = compute_initial_abcd(mask > 0)
        a, b, c, d = solve_abcd(mask, a, b, c, d, k=k)
        a, b, c, d = expand_area_to_minimum((a, b, c, d), mask.shape)

        # interested area
        self.interested_area = (a, b, c, d)
        self.interested_mask = mask[a:b, c:d]
        self.interested_image = image[a:b, c:d]

        # super resolution
        if use_upscale_model and get_image_shape_ceil(self.interested_image) < 1024:
            self.interested_image = perform_upscale(self.interested_image)

        # resize to make images ready for diffusion
        self.interested_image = set_image_shape_ceil(self.interested_image, 1024)
        self.interested_fill = self.interested_image.copy()
        H, W, C = self.interested_image.shape

        # process mask
        self.interested_mask = up255(resample_image(self.interested_mask, W, H), t=127)

        # compute filling
        if use_fill:
            self.interested_fill = fooocus_fill(self.interested_image, self.interested_mask)

        # soft pixels
        self.mask = morphological_open(mask)
        self.blend_mask = mask
        self.image = image

        # ending
        self.latent = None
        self.latent_after_swap = None
        self.swapped = False
        self.latent_mask = None
        self.inpaint_head_feature = None
        return

    def load_latent(self, latent_fill, latent_mask, latent_swap=None):
        self.latent = latent_fill
        self.latent_mask = latent_mask
        self.latent_after_swap = latent_swap
        return

    def patch(self, inpaint_head_model_path, inpaint_latent, inpaint_latent_mask, model):
        global inpaint_head_model

        if inpaint_head_model is None:
            inpaint_head_model = InpaintHead()
            sd = torch.load(inpaint_head_model_path, map_location='cpu', weights_only=True)
            inpaint_head_model.load_state_dict(sd)

        feed = torch.cat([
            inpaint_latent_mask,
            model.model.process_latent_in(inpaint_latent)
        ], dim=1)

        inpaint_head_model.to(device=feed.device, dtype=feed.dtype)
        inpaint_head_feature = inpaint_head_model(feed)

        def input_block_patch(h, transformer_options):
            if transformer_options["block"][1] == 0:
                h = h + inpaint_head_feature.to(h)
            return h

        m = model.clone()
        m.set_model_input_block_patch(input_block_patch)
        return m

    def swap(self):
        if self.swapped:
            return

        if self.latent is None:
            return

        if self.latent_after_swap is None:
            return

        self.latent, self.latent_after_swap = self.latent_after_swap, self.latent
        self.swapped = True
        return

    def unswap(self):
        if not self.swapped:
            return

        if self.latent is None:
            return

        if self.latent_after_swap is None:
            return

        self.latent, self.latent_after_swap = self.latent_after_swap, self.latent
        self.swapped = False
        return

    def color_correction(self, img):
        image_height, image_width = self.image.shape[:2]
        if img.shape[:2] != (image_height, image_width):
            img = resample_image(img, image_width, image_height)

        fg = img.astype(np.float32)
        bg = self.image.copy().astype(np.float32)
        
        mask = _mask_to_image_shape(getattr(self, 'blend_mask', self.mask), self.image)
        blur_kernel_size, sigma = _blend_parameters_for_mask(mask)
        w = cv2.GaussianBlur(
            mask,
            (blur_kernel_size, blur_kernel_size),
            sigma,
            borderType=cv2.BORDER_REPLICATE
        )
             
        w = w[:, :, None].astype(np.float32) / 255.0
        y = fg * w + bg * (1 - w)
        
        return y.clip(0, 255).astype(np.uint8)

    def post_process(self, img):
        a, b, c, d = self.interested_area
        a, b, c, d = _clip_area_to_image(a, b, c, d, self.image.shape)
        if b <= a or d <= c:
            return self.image.copy()

        content = resample_image(img, d - c, b - a)
        result = self.image.copy()
        result[a:b, c:d] = content
        result = self.color_correction(result)
        return result

    def visualize_mask_processing(self):
        return [self.interested_fill, self.interested_mask, self.interested_image]

