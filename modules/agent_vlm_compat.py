"""Normalize external completion clients into the bounded local inference contract."""

from typing import Literal

from pydantic import Field, model_validator

from modules.agent_vlm_contract import ChatCompletion, Model


MAX_OUTPUT_TOKENS = 8192
MAX_CONTEXT_TOKENS = 32768


class ThinkingTemplateOptions(Model):
    enable_thinking: bool | None = None


def model_limits(context_limit):
    context = min(MAX_CONTEXT_TOKENS, int(context_limit))
    return {"context_window": context, "max_output_tokens": min(MAX_OUTPUT_TOKENS, context - 1)}


class CompatibleChatCompletion(ChatCompletion):
    # SDK defaults are ceilings, not a request to allocate that many tokens.
    # The local request below retains all original execution and resource limits.
    max_tokens: int | None = Field(default=None, ge=1, le=2147483647)
    max_completion_tokens: int | None = Field(default=None, ge=1, le=2147483647)
    n_ctx: int | None = Field(default=None, ge=1024, le=MAX_CONTEXT_TOKENS)
    vram_policy: Literal["cpu", "relaxed", "standard", "extreme"] | None = Field(
        default=None, description="If omitted, use the key's saved preference, or GPU priority (extreme).")
    store: Literal[False] | None = Field(default=None, description="Only false is supported; conversations remain in the client.")
    enable_thinking: bool | None = None
    reasoning_effort: Literal["none", "off", "minimal", "low", "medium", "high", "xhigh", "max"] | None = Field(
        default=None, description="none/off disable thinking; other levels enable it without assigning a per-level compute budget.")
    chat_template_kwargs: ThinkingTemplateOptions | None = None

    @model_validator(mode="after")
    def sampling(self):
        self.validate_sampling_options()
        values = [self.enable_thinking]
        if self.reasoning_effort is not None:
            values.append(self.reasoning_effort not in {"none", "off"})
        if self.chat_template_kwargs is not None:
            values.append(self.chat_template_kwargs.enable_thinking)
        if len({value for value in values if value is not None}) > 1:
            raise ValueError("enable_thinking, reasoning_effort and chat_template_kwargs.enable_thinking must agree.")
        return self

    def local_request(self, context_limit, default_vram_policy="extreme"):
        limits = model_limits(context_limit)
        context = self.n_ctx if self.n_ctx is not None else limits["context_window"]
        data = self.model_dump(exclude={"store", "reasoning_effort", "chat_template_kwargs"}, exclude_none=True)
        thinking = self.enable_thinking
        if self.reasoning_effort is not None:
            thinking = self.reasoning_effort not in {"none", "off"}
        if self.chat_template_kwargs is not None and self.chat_template_kwargs.enable_thinking is not None:
            thinking = self.chat_template_kwargs.enable_thinking
        data["enable_thinking"] = thinking
        data["vram_policy"] = self.vram_policy or default_vram_policy
        data["n_ctx"] = context
        field = "max_completion_tokens" if self.max_completion_tokens is not None else "max_tokens"
        data[field] = min(self.max_tokens or self.max_completion_tokens or 1024,
                          limits["max_output_tokens"], context - 1)
        return ChatCompletion.model_validate(data)
