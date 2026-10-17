"""Qwen3.5 text-only conditioning with the training-compatible hybrid layers."""

from types import SimpleNamespace

import torch
from torch import nn
import torch.nn.functional as F

from backend.attention import attention_function
from backend.nn.llm.llama import apply_rope, precompute_freqs_cis


class RMSNorm(nn.Module):
    def __init__(self, dim, eps=1e-6, add=True):
        super().__init__()
        self.weight = nn.Parameter(torch.empty(dim))
        self.eps, self.add = eps, add

    def forward(self, x):
        value = x.float()
        weight = self.weight.to(device=x.device, dtype=torch.float32)
        return (value * torch.rsqrt(value.square().mean(-1, keepdim=True) + self.eps) * (weight + int(self.add))).to(x.dtype)


def chunk_gated_delta(query, key, value, g, beta, chunk_size=64):
    # The reference chunked DeltaNet rule; recurrent state and gates stay fp32.
    dtype = query.dtype
    query, key = F.normalize(query, dim=-1), F.normalize(key, dim=-1)
    query, key, value, beta, g = [
        tensor.transpose(1, 2).contiguous().float() for tensor in (query, key, value, beta, g)
    ]
    batch, heads, length, key_dim = key.shape
    value_dim = value.shape[-1]
    padding = (-length) % chunk_size
    query, key, value = [F.pad(tensor, (0, 0, 0, padding)) for tensor in (query, key, value)]
    beta, g = F.pad(beta, (0, padding)), F.pad(g, (0, padding))
    query = query * (key_dim ** -0.5)
    k_beta, v_beta = key * beta.unsqueeze(-1), value * beta.unsqueeze(-1)
    query, key, value, k_beta, v_beta = [
        tensor.reshape(batch, heads, -1, chunk_size, tensor.shape[-1])
        for tensor in (query, key, value, k_beta, v_beta)
    ]
    g = g.reshape(batch, heads, -1, chunk_size).cumsum(-1)
    mask = torch.ones(chunk_size, chunk_size, device=query.device, dtype=torch.bool).triu()
    decay = (g.unsqueeze(-1) - g.unsqueeze(-2)).tril().exp().tril()
    attention = -((k_beta @ key.transpose(-1, -2)) * decay).masked_fill(mask, 0)
    for index in range(1, chunk_size):
        row, previous = attention[..., index, :index].clone(), attention[..., :index, :index].clone()
        attention[..., index, :index] = row + (row.unsqueeze(-1) * previous).sum(-2)
    attention = attention + torch.eye(chunk_size, device=query.device)
    values = attention @ v_beta
    cumulative_keys = attention @ (k_beta * g.exp().unsqueeze(-1))
    state = torch.zeros(batch, heads, key_dim, value_dim, device=query.device)
    outputs = []
    causal = mask.triu(1)
    for index in range(query.shape[2]):
        q, k = query[:, :, index], key[:, :, index]
        scores = (q @ k.transpose(-1, -2) * decay[:, :, index]).masked_fill(causal, 0)
        adjusted = values[:, :, index] - cumulative_keys[:, :, index] @ state
        outputs.append((q * g[:, :, index, :, None].exp()) @ state + scores @ adjusted)
        state = (
            state * g[:, :, index, -1, None, None].exp()
            + (k * (g[:, :, index, -1, None] - g[:, :, index]).exp()[..., None]).transpose(-1, -2) @ adjusted
        )
    return torch.cat(outputs, dim=2)[:, :, :length].transpose(1, 2).contiguous().to(dtype)


class GatedDeltaNet(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.key_heads, self.value_heads = config.linear_num_key_heads, config.linear_num_value_heads
        self.key_head_dim, self.value_head_dim = config.linear_key_head_dim, config.linear_value_head_dim
        self.key_dim = self.key_heads * self.key_head_dim
        self.value_dim = self.value_heads * self.value_head_dim
        channels = 2 * self.key_dim + self.value_dim
        self.in_proj_qkv = nn.Linear(config.hidden_size, channels, bias=False)
        self.in_proj_z = nn.Linear(config.hidden_size, self.value_dim, bias=False)
        self.in_proj_b = nn.Linear(config.hidden_size, self.value_heads, bias=False)
        self.in_proj_a = nn.Linear(config.hidden_size, self.value_heads, bias=False)
        self.out_proj = nn.Linear(self.value_dim, config.hidden_size, bias=False)
        self.dt_bias = nn.Parameter(torch.empty(self.value_heads))
        self.A_log = nn.Parameter(torch.empty(self.value_heads))
        self.conv1d = nn.Conv1d(channels, channels, config.conv_kernel_size, groups=channels, bias=False)
        self.norm = RMSNorm(self.value_head_dim, config.rms_norm_eps, add=False)
        self.kernel_size = config.conv_kernel_size

    def forward(self, x):
        batch, length, _ = x.shape
        mixed = self.in_proj_qkv(x).transpose(1, 2)
        mixed = F.silu(F.conv1d(
            mixed, self.conv1d.weight.to(mixed), padding=self.kernel_size - 1, groups=mixed.shape[1],
        )[:, :, :length]).transpose(1, 2)
        query, key, value = mixed.split((self.key_dim, self.key_dim, self.value_dim), dim=-1)
        query = query.reshape(batch, length, self.key_heads, self.key_head_dim)
        key = key.reshape(batch, length, self.key_heads, self.key_head_dim)
        value = value.reshape(batch, length, self.value_heads, self.value_head_dim)
        repeat = self.value_heads // self.key_heads
        query, key = query.repeat_interleave(repeat, 2), key.repeat_interleave(repeat, 2)
        beta = self.in_proj_b(x).sigmoid()
        decay = -self.A_log.to(device=x.device, dtype=torch.float32).exp()
        g = decay * F.softplus(self.in_proj_a(x).float() + self.dt_bias.to(device=x.device, dtype=torch.float32))
        output = chunk_gated_delta(query, key, value, g, beta)
        gate = self.in_proj_z(x).reshape(batch, length, self.value_heads, self.value_head_dim)
        output = self.norm(output) * F.silu(gate)
        return self.out_proj(output.reshape(batch, length, self.value_dim))


class GatedAttention(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.heads, self.kv_heads, self.head_dim = config.num_attention_heads, config.num_key_value_heads, config.head_dim
        self.rotary_dim = int(self.head_dim * config.partial_rotary_factor)
        self.q_proj = nn.Linear(config.hidden_size, self.heads * self.head_dim * 2, bias=False)
        self.k_proj = nn.Linear(config.hidden_size, self.kv_heads * self.head_dim, bias=False)
        self.v_proj = nn.Linear(config.hidden_size, self.kv_heads * self.head_dim, bias=False)
        self.o_proj = nn.Linear(self.heads * self.head_dim, config.hidden_size, bias=False)
        self.q_norm = RMSNorm(self.head_dim, config.rms_norm_eps)
        self.k_norm = RMSNorm(self.head_dim, config.rms_norm_eps)

    def forward(self, x, positions):
        batch, length, _ = x.shape
        query, gate = self.q_proj(x).view(batch, length, self.heads, 2 * self.head_dim).chunk(2, -1)
        key = self.k_proj(x).view(batch, length, self.kv_heads, self.head_dim)
        value = self.v_proj(x).view(batch, length, self.kv_heads, self.head_dim)
        query, key = self.q_norm(query).transpose(1, 2), self.k_norm(key).transpose(1, 2)
        q_rot, k_rot = apply_rope(query[..., :self.rotary_dim], key[..., :self.rotary_dim], positions)
        query = torch.cat((q_rot, query[..., self.rotary_dim:]), -1)
        key = torch.cat((k_rot, key[..., self.rotary_dim:]), -1)
        repeat = self.heads // self.kv_heads
        key, value = key.repeat_interleave(repeat, 1), value.transpose(1, 2).repeat_interleave(repeat, 1)
        mask = torch.ones(length, length, device=x.device, dtype=torch.bool).tril()
        output = attention_function(query, key, value, self.heads, skip_reshape=True, mask=mask).to(x.dtype)
        return self.o_proj(output * gate.flatten(2).sigmoid())


class MLP(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.gate_proj = nn.Linear(config.hidden_size, config.intermediate_size, bias=False)
        self.up_proj = nn.Linear(config.hidden_size, config.intermediate_size, bias=False)
        self.down_proj = nn.Linear(config.intermediate_size, config.hidden_size, bias=False)

    def forward(self, x):
        return self.down_proj(F.silu(self.gate_proj(x)) * self.up_proj(x))


class Block(nn.Module):
    def __init__(self, config, index):
        super().__init__()
        self.linear = (index + 1) % config.full_attention_interval != 0
        if self.linear:
            self.linear_attn = GatedDeltaNet(config)
        else:
            self.self_attn = GatedAttention(config)
        self.input_layernorm = RMSNorm(config.hidden_size, config.rms_norm_eps)
        self.post_attention_layernorm = RMSNorm(config.hidden_size, config.rms_norm_eps)
        self.mlp = MLP(config)

    def forward(self, x, positions):
        hidden = self.input_layernorm(x)
        x = x + (self.linear_attn(hidden) if self.linear else self.self_attn(hidden, positions))
        return x + self.mlp(self.post_attention_layernorm(x))


class Qwen35TextModel(nn.Module):
    def __init__(self, config):
        super().__init__()
        values = {
            "hidden_size": 4096, "intermediate_size": 12288, "vocab_size": 248320,
            "num_hidden_layers": 32, "num_attention_heads": 16, "num_key_value_heads": 4,
            "head_dim": 256, "partial_rotary_factor": 0.25, "linear_num_key_heads": 16,
            "linear_num_value_heads": 32, "linear_key_head_dim": 128, "linear_value_head_dim": 128,
            "conv_kernel_size": 4, "rms_norm_eps": 1e-6, "rope_theta": 10000000.0,
            "full_attention_interval": 4,
        }
        values.update(config.get("text_config", config))
        if "linear_conv_kernel_dim" in values:
            values["conv_kernel_size"] = values["linear_conv_kernel_dim"]
        self.config = SimpleNamespace(**values)
        self.num_layers = self.config.num_hidden_layers
        self.model = nn.Module()
        self.model.embed_tokens = nn.Embedding(self.config.vocab_size, self.config.hidden_size)
        self.model.layers = nn.ModuleList([Block(self.config, index) for index in range(self.num_layers)])
        self.model.norm = RMSNorm(self.config.hidden_size, self.config.rms_norm_eps)
        self.computation_dtype = torch.bfloat16

    def get_input_embeddings(self):
        return self.model.embed_tokens

    def forward(self, input_ids=None, attention_mask=None, embeds=None, **kwargs):
        hidden = self.model.embed_tokens(input_ids) if embeds is None else embeds
        hidden = hidden.to(dtype=self.computation_dtype)
        if attention_mask is not None and not bool(attention_mask.all()):
            raise ValueError("Qwen3.5 MOSS text must be encoded at its actual token length.")
        positions = precompute_freqs_cis(
            int(self.config.head_dim * self.config.partial_rotary_factor),
            torch.arange(hidden.shape[1], device=hidden.device).unsqueeze(0),
            self.config.rope_theta, device=hidden.device,
        )
        for layer in self.model.layers:
            hidden = layer(hidden, positions)
        hidden = self.model.norm(hidden)
        return hidden, hidden
