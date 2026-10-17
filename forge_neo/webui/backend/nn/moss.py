"""Native MOSS-Image inference, following ComfyUI's MOSS-Image implementation."""

import torch
from torch import nn
import torch.nn.functional as F

from backend.attention import attention_function
from backend.nn.flux import EmbedND, timestep_embedding


def situ(hidden, gate):
    return (4.0 * torch.tanh(gate / 4.0) * torch.sigmoid(gate)) * (25.0 * torch.tanh(hidden / 25.0))


def rope_split_half(x, pe):
    value = x.to(pe.dtype).unflatten(-1, (2, -1)).movedim(-2, -1).unsqueeze(-2)
    return (pe[..., 0] * value[..., 0] + pe[..., 1] * value[..., 1]).movedim(-1, -2).flatten(-2).to(x.dtype)


def attention(q, k, v, q_norm, k_norm, pe, heads, transformer_options):
    batch, length, _ = q.shape
    q = rope_split_half(q_norm(q.view(batch, length, heads, -1)), pe)
    k = rope_split_half(k_norm(k.view(batch, length, heads, -1)), pe)
    v = v.view(batch, length, heads, -1)
    return attention_function(
        q.transpose(1, 2), k.transpose(1, 2), v.transpose(1, 2), heads,
        skip_reshape=True, transformer_options=transformer_options,
    ).to(q.dtype)


class TextBlock(nn.Module):
    def __init__(self, dim, ffn_dim, heads, device=None, dtype=None):
        super().__init__()
        self.heads = heads
        self.norm1 = nn.RMSNorm(dim, eps=1e-6, device=device, dtype=dtype)
        self.norm2 = nn.RMSNorm(dim, eps=1e-6, device=device, dtype=dtype)
        self.q_norm = nn.RMSNorm(dim // heads, eps=1e-6, device=device, dtype=dtype)
        self.k_norm = nn.RMSNorm(dim // heads, eps=1e-6, device=device, dtype=dtype)
        self.qkv = nn.Linear(dim, 3 * dim, device=device, dtype=dtype)
        self.proj = nn.Linear(dim, dim, device=device, dtype=dtype)
        self.ffn_gate = nn.Linear(dim, ffn_dim, device=device, dtype=dtype)
        self.ffn_up = nn.Linear(dim, ffn_dim, device=device, dtype=dtype)
        self.ffn_down = nn.Linear(ffn_dim, dim, device=device, dtype=dtype)

    def forward(self, x, pe, options):
        q, k, v = self.qkv(self.norm1(x)).chunk(3, dim=-1)
        x = x + self.proj(attention(q, k, v, self.q_norm, self.k_norm, pe, self.heads, options))
        y = self.norm2(x)
        return x + self.ffn_down(situ(self.ffn_up(y), self.ffn_gate(y)))


class TextEmbedder(nn.Module):
    def __init__(self, text_dim, dim, ffn_dim, heads, device=None, dtype=None):
        super().__init__()
        self.proj = nn.Linear(text_dim, dim, device=device, dtype=dtype)
        self.blocks = nn.ModuleList([TextBlock(dim, ffn_dim, heads, device, dtype) for _ in range(2)])

    def forward(self, x, pe, options):
        x = self.proj(x)
        for block in self.blocks:
            x = block(x, pe, options)
        return x


class Block(nn.Module):
    def __init__(self, dim, ffn_dim, heads, fused_qkv=False, device=None, dtype=None):
        super().__init__()
        self.heads, self.fused_qkv = heads, fused_qkv
        self.norm1 = nn.RMSNorm(dim, eps=1e-6, device=device, dtype=dtype)
        self.norm2 = nn.RMSNorm(dim, eps=1e-6, device=device, dtype=dtype)
        self.q_norm = nn.RMSNorm(dim // heads, eps=1e-6, device=device, dtype=dtype)
        self.k_norm = nn.RMSNorm(dim // heads, eps=1e-6, device=device, dtype=dtype)
        names = ("qkv", "o") if fused_qkv else ("q", "k", "v", "o")
        self.proj = nn.ModuleDict({
            name: nn.Linear(dim, 3 * dim if name == "qkv" else dim, bias=False, device=device, dtype=dtype)
            for name in names
        })
        self.proj["ffn_up_gate"] = nn.Linear(dim, 2 * ffn_dim, bias=False, device=device, dtype=dtype)
        self.proj["ffn_down"] = nn.Linear(ffn_dim, dim, bias=False, device=device, dtype=dtype)

    def forward(self, x, mod, pe, options):
        shift_a, scale_a, gate_a, shift_f, scale_f, gate_f = mod
        y = self.norm1(x) * (1 + scale_a) + shift_a
        q, k, v = self.proj["qkv"](y).chunk(3, dim=-1) if self.fused_qkv else (
            self.proj["q"](y), self.proj["k"](y), self.proj["v"](y),
        )
        x = x + self.proj["o"](attention(q, k, v, self.q_norm, self.k_norm, pe, self.heads, options)) * gate_a
        y = self.norm2(x) * (1 + scale_f) + shift_f
        hidden, gate = self.proj["ffn_up_gate"](y).chunk(2, dim=-1)
        return x + self.proj["ffn_down"](situ(hidden, gate)) * gate_f


class MOSSImageTransformer(nn.Module):
    def __init__(
        self, dim=3072, ffn_dim=8192, num_heads=24, num_layers=42, text_dim=4096,
        latent_channels=128, fused_qkv=False, device=None, dtype=None, **kwargs,
    ):
        super().__init__()
        self.latent_channels = latent_channels
        head_dim = dim // num_heads
        if head_dim % 8:
            raise ValueError("MOSS attention head dimensions must be divisible by eight.")
        self.pe_embedder = EmbedND(head_dim, 10000, [head_dim // 4] * 4)
        self.video_embedder = nn.Linear(latent_channels, dim, device=device, dtype=dtype)
        self.text_embedder = TextEmbedder(text_dim, dim, ffn_dim, num_heads, device, dtype)
        self.time_embedding = nn.Sequential(
            nn.Linear(256, dim, device=device, dtype=dtype), nn.SiLU(),
            nn.Linear(dim, dim, device=device, dtype=dtype),
        )
        self.shared_block_modulation = nn.Linear(dim, 6 * dim, device=device, dtype=dtype)
        self.layers = nn.ModuleList([
            Block(dim, ffn_dim, num_heads, fused_qkv, device, dtype) for _ in range(num_layers)
        ])
        self.final_norm_video = nn.RMSNorm(dim, eps=1e-6, device=device, dtype=dtype)
        self.final_linear_video = nn.Linear(dim, latent_channels, bias=False, device=device, dtype=dtype)
        self.video_head_modulation = nn.Linear(dim, 2 * dim, device=device, dtype=dtype)

    def rope(self, height, width, text_length, device):
        ids = torch.zeros(height * width + text_length, 4, device=device, dtype=torch.float32)
        ids[:height * width, 1] = text_length
        ids[:height * width, 2] = (torch.arange(height, device=device) - (height - 1) / 2).repeat_interleave(width)
        ids[:height * width, 3] = (torch.arange(width, device=device) - (width - 1) / 2).repeat(height)
        ids[height * width:, 1] = torch.arange(text_length, device=device)
        return self.pe_embedder(ids.unsqueeze(0)).transpose(1, 2).contiguous()

    def forward(self, x, timestep, context, attention_mask=None, transformer_options=None, **kwargs):
        options = dict(transformer_options or {})
        batch, _, height, width = x.shape
        times = torch.as_tensor(timestep, device=x.device).reshape(-1).expand(batch)
        vec = self.time_embedding(timestep_embedding(times, 256).to(x.dtype))
        modulation = self.shared_block_modulation(vec).unflatten(-1, (6, -1)).unsqueeze(2)
        head = self.video_head_modulation(vec).unflatten(-1, (2, -1)).unsqueeze(2)
        branches = options.get("cond_or_uncond", [0])
        if not branches or batch % len(branches):
            raise ValueError("MOSS conditional batch does not match the sampler branches.")
        outputs = []
        replacements = options.get("patches_replace", {}).get("dit", {})
        for sample in range(batch):
            text = context[sample:sample + 1]
            if attention_mask is not None:
                text = text[:, attention_mask[sample].bool()]
            if not text.shape[1]:
                raise ValueError("MOSS conditioning needs at least one text token.")
            pe = self.rope(height, width, text.shape[1], x.device)
            text = self.text_embedder(text, pe[:, height * width:], options)
            hidden = torch.cat((self.video_embedder(x[sample:sample + 1].flatten(2).transpose(1, 2)), text), dim=1)
            mod = modulation[sample:sample + 1].unbind(1)
            is_negative = branches[sample // (batch // len(branches))] == 1
            skip = options.get("moss_uncond_skip_layers", (22,)) if is_negative else ()
            options.update(total_blocks=len(self.layers), block_type="single")
            for index, block in enumerate(self.layers):
                if index in skip:
                    continue
                options["block_index"] = index
                if ("single_block", index) in replacements:
                    def original(args, current=block):
                        return {"img": current(args["img"], args["mod"], args["pe"], args["transformer_options"])}
                    hidden = replacements[("single_block", index)](
                        {"img": hidden, "vec": vec[sample:sample + 1], "mod": mod, "pe": pe, "transformer_options": options},
                        {"original_block": original},
                    )["img"]
                else:
                    hidden = block(hidden, mod, pe, options)
            shift, scale = head[sample:sample + 1].unbind(1)
            output = self.final_linear_video(self.final_norm_video(hidden[:, :height * width]) * (1 + scale) + shift)
            outputs.append(output.transpose(1, 2).reshape(1, self.latent_channels, height, width))
        return torch.cat(outputs)
