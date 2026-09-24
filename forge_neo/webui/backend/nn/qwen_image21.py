import torch
import torch.nn as nn
import torch.nn.functional as F

from backend.attention import attention_flash, attention_function, attention_pytorch
from backend.nn.flux import EmbedND, timestep_embedding
from backend.quant_ops import ck


class ZeroCenteredRMSNorm(nn.Module):
    def __init__(self, dim, eps=1e-6, device=None, dtype=None):
        super().__init__()
        self.weight = nn.Parameter(torch.empty(dim, device=device, dtype=dtype))
        self.eps = eps

    def forward(self, x):
        x_float = x.float()
        scale = torch.rsqrt(x_float.square().mean(dim=-1, keepdim=True) + self.eps)
        return (x_float * scale * (self.weight.float() + 1.0)).to(x.dtype)


class TextProjection(nn.Module):
    def __init__(self, in_dim, hidden_size, eps=1e-6, device=None, dtype=None, operations=nn):
        super().__init__()
        self.text_norm = ZeroCenteredRMSNorm(in_dim, eps=eps, device=device, dtype=dtype)
        self.in_layer = operations.Linear(in_dim, hidden_size, bias=False, device=device, dtype=dtype)
        self.out_layer = operations.Linear(hidden_size, hidden_size, bias=False, device=device, dtype=dtype)

    def forward(self, x):
        return self.out_layer(F.gelu(self.in_layer(self.text_norm(x)), approximate="tanh"))


class TimestepEmbedding(nn.Module):
    def __init__(self, embedding_dim, device=None, dtype=None, operations=nn):
        super().__init__()
        self.linear_1 = operations.Linear(256, embedding_dim, bias=False, device=device, dtype=dtype)
        self.linear_2 = operations.Linear(embedding_dim, embedding_dim, bias=False, device=device, dtype=dtype)

    def forward(self, timestep):
        return self.linear_2(F.silu(self.linear_1(timestep)))


class TimestepProjEmbeddings(nn.Module):
    def __init__(self, embedding_dim, device=None, dtype=None, operations=nn):
        super().__init__()
        self.timestep_embedder = TimestepEmbedding(embedding_dim, device=device, dtype=dtype, operations=operations)

    def forward(self, timestep, dtype):
        return self.timestep_embedder(timestep_embedding(timestep.float(), 256).to(dtype))


class SwiGLUFeedForward(nn.Module):
    def __init__(self, dim, hidden_dim, device=None, dtype=None, operations=nn):
        super().__init__()
        self.gate_up = operations.Linear(dim, 2 * hidden_dim, bias=False, device=device, dtype=dtype)
        self.out = operations.Linear(hidden_dim, dim, bias=False, device=device, dtype=dtype)

    def forward(self, x):
        gate, up = self.gate_up(x).chunk(2, dim=-1)
        return self.out(F.silu(gate) * up)


class Attention(nn.Module):
    def __init__(self, dim, heads, dim_head, eps=1e-6, device=None, dtype=None, operations=nn):
        super().__init__()
        inner_dim = heads * dim_head
        self.heads = heads
        self.to_q = operations.Linear(dim, inner_dim, bias=False, device=device, dtype=dtype)
        self.to_k = operations.Linear(dim, inner_dim, bias=False, device=device, dtype=dtype)
        self.to_v = operations.Linear(dim, inner_dim, bias=False, device=device, dtype=dtype)
        self.to_out = nn.ModuleList([operations.Linear(inner_dim, dim, bias=False, device=device, dtype=dtype)])
        self.norm_q = operations.RMSNorm(dim_head, eps=eps, device=device, dtype=dtype)
        self.norm_k = operations.RMSNorm(dim_head, eps=eps, device=device, dtype=dtype)

    def forward(self, x, pe, attn_fn):
        batch, tokens, _ = x.shape
        q = self.norm_q(self.to_q(x).view(batch, tokens, self.heads, -1))
        k = self.norm_k(self.to_k(x).view(batch, tokens, self.heads, -1))
        v = self.to_v(x).view(batch, tokens, self.heads, -1)
        q, k = ck.apply_rope(q, k, pe)
        return self.to_out[0](attn_fn(q, k, v, self.heads).to(x.dtype))


def _block_causal_attention(segments, transformer_options):
    def attend(q, k, v, heads):
        outputs = []
        for start, end, mask in segments:
            if mask is None:
                mask = torch.ones((end - start, end), dtype=torch.bool, device=q.device)
            attend_impl = attention_pytorch if attention_function is attention_flash else attention_function
            outputs.append(
                attend_impl(
                    q[:, start:end].transpose(1, 2),
                    k[:, :end].transpose(1, 2),
                    v[:, :end].transpose(1, 2),
                    heads,
                    mask=mask,
                    skip_reshape=True,
                    transformer_options=transformer_options,
                )
            )
        return torch.cat(outputs, dim=1)

    return attend


def _split_rows(x):
    return x[-1:].unsqueeze(1), x[:-1].unsqueeze(1)


def _modulated_norm(norm, x, scale, prefix_len):
    prefix_scale, target_scale = scale
    x = norm(x)
    return torch.cat(
        (
            x[:, :prefix_len] * (1.0 + prefix_scale),
            x[:, prefix_len:] * (1.0 + target_scale),
        ),
        dim=1,
    )


def _gated_residual(x, value, gate, prefix_len):
    prefix_gate, target_gate = gate
    x[:, prefix_len:] = x[:, prefix_len:] + value[:, prefix_len:] * target_gate
    if prefix_len:
        x[:, :prefix_len] = x[:, :prefix_len] + value[:, :prefix_len] * prefix_gate
    return x


class QwenImage21TransformerBlock(nn.Module):
    def __init__(self, dim, heads, head_dim, mlp_ratio=3, eps=1e-6, device=None, dtype=None, operations=nn):
        super().__init__()
        self.img_norm1 = operations.LayerNorm(dim, elementwise_affine=False, eps=eps, device=device, dtype=dtype)
        self.attn = Attention(dim, heads, head_dim, eps=eps, device=device, dtype=dtype, operations=operations)
        self.img_norm2 = operations.LayerNorm(dim, elementwise_affine=False, eps=eps, device=device, dtype=dtype)
        self.img_mlp = SwiGLUFeedForward(dim, dim * mlp_ratio, device=device, dtype=dtype, operations=operations)

    def forward(self, x, modulation, pe, attn_fn, prefix_len):
        scale1, gate1, scale2, gate2 = modulation
        x = _gated_residual(x, self.attn(_modulated_norm(self.img_norm1, x, scale1, prefix_len), pe, attn_fn), gate1, prefix_len)
        x = _gated_residual(x, self.img_mlp(_modulated_norm(self.img_norm2, x, scale2, prefix_len)), gate2, prefix_len)
        if x.dtype == torch.float16:
            x = x.clamp(-65504, 65504)
        return x


class LastLayer(nn.Module):
    def __init__(self, dim, eps=1e-6, device=None, dtype=None, operations=nn):
        super().__init__()
        self.linear = operations.Linear(dim, dim, bias=False, device=device, dtype=dtype)
        self.norm = operations.LayerNorm(dim, eps=eps, elementwise_affine=False, device=device, dtype=dtype)

    def forward(self, x, timestep_embedding):
        scale = self.linear(F.silu(timestep_embedding)).unsqueeze(1)
        return self.norm(x) * (1.0 + scale)


class QwenImage21Transformer2DModel(nn.Module):
    def __init__(
        self,
        in_channels=64,
        out_channels=64,
        num_layers=32,
        attention_head_dim=128,
        num_attention_heads=32,
        context_in_dim=4096,
        mlp_ratio=3,
        axes_dims_rope=(16, 56, 56),
        eps=1e-6,
        device=None,
        dtype=None,
        operations=nn,
        **kwargs,
    ):
        super().__init__()
        self.out_channels = out_channels
        self.inner_dim = num_attention_heads * attention_head_dim
        self.pe_embedder = EmbedND(dim=attention_head_dim, theta=10000, axes_dim=list(axes_dims_rope))
        self.time_text_embed = TimestepProjEmbeddings(self.inner_dim, device=device, dtype=dtype, operations=operations)
        self.txt_in = TextProjection(context_in_dim, self.inner_dim, eps=eps, device=device, dtype=dtype, operations=operations)
        self.img_in = operations.Linear(in_channels, self.inner_dim, bias=False, device=device, dtype=dtype)
        self.modulation = nn.Sequential(
            nn.SiLU(),
            operations.Linear(self.inner_dim, 4 * self.inner_dim, bias=False, device=device, dtype=dtype),
        )
        self.transformer_blocks = nn.ModuleList(
            [
                QwenImage21TransformerBlock(
                    self.inner_dim,
                    num_attention_heads,
                    attention_head_dim,
                    mlp_ratio=mlp_ratio,
                    eps=eps,
                    device=device,
                    dtype=dtype,
                    operations=operations,
                )
                for _ in range(num_layers)
            ]
        )
        self.norm_out = LastLayer(self.inner_dim, eps=eps, device=device, dtype=dtype, operations=operations)
        self.proj_out = operations.Linear(self.inner_dim, out_channels, bias=False, device=device, dtype=dtype)

    def build_sequence(self, x, context, ref_latents, image_slots):
        text = self.txt_in(context)
        slots = (image_slots + [text.shape[1]] * len(ref_latents))[: len(ref_latents)]
        bounds = [0] + slots + [text.shape[1]]
        parts, ids, segments = [], [], []
        position, length = 0, 0

        for (start, end), image in zip(zip(bounds[:-1], bounds[1:]), ref_latents + [x]):
            text_length = end - start
            if text_length:
                parts.append(text[:, start:end])
                ids.append(
                    torch.arange(position, position + text_length, device=x.device, dtype=torch.float32)
                    .unsqueeze(1)
                    .expand(text_length, 3)
                )
                text_mask = torch.ones((text_length, length + text_length), dtype=torch.bool, device=x.device)
                segments.append((length, length + text_length, text_mask.tril(length)))
                position += text_length
                length += text_length

            height, width = image.shape[-2:]
            parts.append(self.img_in(image.flatten(2).transpose(1, 2)))
            rows = torch.arange(height, device=x.device, dtype=torch.float32) - (height - height // 2)
            cols = torch.arange(width, device=x.device, dtype=torch.float32) - (width - width // 2)
            rows = rows + 0.5 * (height % 2 - x.shape[-2] % 2)
            cols = cols + 0.5 * (width % 2 - x.shape[-1] % 2)
            ids.append(
                torch.stack(
                    (
                        torch.full((height, width), position, device=x.device, dtype=torch.float32),
                        rows[:, None].expand(height, width),
                        cols[None, :].expand(height, width),
                    ),
                    dim=-1,
                ).flatten(0, 1)
            )
            image_length = height * width
            segments.append((length, length + image_length, None))
            position += max(height, width)
            length += image_length

        positional_embedding = self.pe_embedder(torch.cat(ids, dim=0).unsqueeze(0)).transpose(1, 2).contiguous()
        return torch.cat(parts, dim=1), positional_embedding, segments

    def forward(self, x, timestep, context, ref_latents=None, image_slots=None, transformer_options=None, **kwargs):
        from backend.args import dynamic_args

        transformer_options = transformer_options or {}
        if ref_latents is None:
            ref_latents = dynamic_args.ref_latents if dynamic_args.qwen_image21 else []
        if image_slots is None:
            image_slots = dynamic_args.qwen_image21_image_slots

        batch, _, height, width = x.shape
        refs = [ref.to(device=x.device, dtype=x.dtype) for ref in (ref_latents or [])]
        refs = [ref.expand(batch, -1, -1, -1) if ref.shape[0] == 1 and batch > 1 else ref for ref in refs]
        image_slots = list(image_slots or [])
        hidden_states, pe, segments = self.build_sequence(x, context, refs, image_slots)
        prefix_len = hidden_states.shape[1] - height * width

        timesteps = torch.as_tensor(timestep, device=x.device).reshape(-1)
        if timesteps.numel() == 1 and batch > 1:
            timesteps = timesteps.expand(batch)
        timestep_embeddings = self.time_text_embed(torch.cat((timesteps, timesteps.new_zeros(1))), x.dtype)
        scale1, gate1, scale2, gate2 = self.modulation(timestep_embeddings).chunk(4, dim=-1)
        modulation = (
            _split_rows(scale1),
            _split_rows(gate1.tanh()),
            _split_rows(scale2),
            _split_rows(gate2.tanh()),
        )
        attn_fn = _block_causal_attention(segments, transformer_options)

        for block in self.transformer_blocks:
            hidden_states = block(hidden_states, modulation, pe, attn_fn, prefix_len)

        target = self.norm_out(hidden_states[:, prefix_len:], timestep_embeddings[:-1])
        target = self.proj_out(target)
        return target.transpose(1, 2).reshape(batch, self.out_channels, height, width)
