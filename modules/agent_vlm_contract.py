"""Bounded local inference requests; no server paths, remote providers or credentials."""

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


ASSET_PATTERN = r"^(?:asset|file):[0-9a-f]{24,64}$"


class Model(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class VLMModels(Model):
    query: str = Field(default="", max_length=200)
    installed_only: bool = True
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=30, ge=1, le=100)


class VLMStatus(Model):
    model: str = Field(min_length=1, max_length=180)


class ImageURL(Model):
    url: str = Field(min_length=1, max_length=12 * 1024 * 1024)
    detail: Literal["auto", "low", "high"] = "auto"


class ContentPart(Model):
    type: Literal["text", "image_url", "image_asset"]
    text: str | None = Field(default=None, max_length=32000)
    image_url: ImageURL | None = None
    asset_id: str | None = Field(default=None, pattern=ASSET_PATTERN)

    @model_validator(mode="after")
    def matching_field(self):
        fields = {"text": self.text, "image_url": self.image_url, "image_asset": self.asset_id}
        if fields[self.type] is None or sum(value is not None for value in fields.values()) != 1:
            raise ValueError("A content part must contain exactly its declared payload.")
        return self


class FunctionCall(Model):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$")
    arguments: str = Field(max_length=16000)


class ToolCall(Model):
    id: str = Field(min_length=1, max_length=96)
    type: Literal["function"] = "function"
    function: FunctionCall


class Message(Model):
    role: Literal["system", "developer", "user", "assistant", "tool"]
    content: str | list[ContentPart] | None = None
    tool_calls: list[ToolCall] | None = Field(default=None, max_length=32)
    tool_call_id: str | None = Field(default=None, max_length=96)

    @model_validator(mode="after")
    def role_fields(self):
        if self.tool_calls and self.role != "assistant":
            raise ValueError("Only assistant messages may contain tool_calls.")
        if (self.role == "tool") != bool(self.tool_call_id):
            raise ValueError("Tool messages require tool_call_id; other roles cannot provide it.")
        if self.content is None and not self.tool_calls:
            raise ValueError("A message requires content or assistant tool_calls.")
        if isinstance(self.content, list) and (not self.content or len(self.content) > 16):
            raise ValueError("Content must contain 1 to 16 parts.")
        if self.role != "user" and isinstance(self.content, list) and any(p.type != "text" for p in self.content):
            raise ValueError("Only user messages may contain images.")
        return self


class Function(Model):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$")
    description: str = Field(default="", max_length=2000)
    parameters: dict = Field(default_factory=lambda: {"type": "object", "properties": {}})
    strict: bool = False

    @model_validator(mode="after")
    def bounded_schema(self):
        if self.strict:
            raise ValueError("Strict function schema enforcement is not supported by this local adapter.")
        encoded = json.dumps(self.parameters, allow_nan=False)
        if len(encoded) > 16000:
            raise ValueError("Function schema exceeds its limit.")
        def visit(value, depth=0):
            if depth > 16:
                raise ValueError("Function schema is too deeply nested.")
            if isinstance(value, dict):
                if "$ref" in value and not str(value["$ref"]).startswith("#/"):
                    raise ValueError("External schema references are not supported.")
                for item in value.values():
                    visit(item, depth + 1)
            elif isinstance(value, list):
                for item in value:
                    visit(item, depth + 1)
        visit(self.parameters)
        return self


class Tool(Model):
    type: Literal["function"] = "function"
    function: Function


class ResponseFormat(Model):
    type: Literal["text", "json_object"] = "text"


class StreamOptions(Model):
    include_usage: bool = False


class InferenceParameters(VLMStatus):
    max_tokens: int | None = Field(default=None, ge=1, le=8192)
    max_completion_tokens: int | None = Field(default=None, ge=1, le=8192)
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float = Field(default=0.9, gt=0, le=1)
    seed: int | None = Field(default=None, ge=-1, le=4294967295)
    stop: str | list[str] | None = None
    vram_policy: Literal["cpu", "relaxed", "standard", "extreme"] = "standard"
    n_ctx: int = Field(default=8192, ge=1024, le=32768)
    timeout_seconds: int = Field(default=120, ge=1, le=600)

    @model_validator(mode="after")
    def sampling(self):
        if self.max_tokens is not None and self.max_completion_tokens is not None:
            raise ValueError("Use max_tokens or max_completion_tokens, not both.")
        if self.stop is not None:
            stops = [self.stop] if isinstance(self.stop, str) else self.stop
            if not 1 <= len(stops) <= 4 or any(not isinstance(s, str) or not s or len(s) > 128 for s in stops):
                raise ValueError("Provide 1 to 4 stop strings of at most 128 characters.")
        if (self.max_tokens or self.max_completion_tokens or 1024) >= self.n_ctx:
            raise ValueError("Output token limit must leave room for the input context.")
        return self


class ChatCompletion(InferenceParameters):
    messages: list[Message] = Field(min_length=1, max_length=64)
    stream: bool = False
    stream_options: StreamOptions | None = None
    n: Literal[1] = 1
    tools: list[Tool] | None = Field(default=None, max_length=32)
    tool_choice: Literal["auto", "none", "required"] | dict | None = None
    response_format: ResponseFormat | None = None

    @model_validator(mode="after")
    def bounded_messages(self):
        text_chars = sum(len(m.content) if isinstance(m.content, str) else
                         sum(len(p.text or "") for p in m.content or []) for m in self.messages)
        text_chars += sum(len(json.dumps(t.model_dump(), allow_nan=False)) for t in self.tools or [])
        text_chars += sum(len(json.dumps(call.model_dump(), allow_nan=False))
                          for message in self.messages for call in message.tool_calls or [])
        if text_chars > 64000:
            raise ValueError("Text and tool schemas exceed the 64000-character limit.")
        images = [part for message in self.messages if isinstance(message.content, list)
                  for part in message.content if part.type != "text"]
        if len(images) > 4 or sum(len(part.image_url.url) for part in images if part.image_url) > 16 * 1024 * 1024:
            raise ValueError("Use at most 4 images and 16 MiB of encoded image URLs.")
        names = [t.function.name for t in self.tools or []]
        if len(names) != len(set(names)):
            raise ValueError("Function names must be unique.")
        if self.tool_choice not in (None, "none") and not names:
            raise ValueError("tool_choice requires tools.")
        if isinstance(self.tool_choice, dict):
            function = self.tool_choice.get("function")
            if not isinstance(function, dict):
                raise ValueError("Select a declared function.")
            name = function.get("name")
            if self.tool_choice != {"type": "function", "function": {"name": name}} or name not in names:
                raise ValueError("Select a declared function.")
        pending = set()
        for message in self.messages:
            if message.role == "tool":
                if message.tool_call_id not in pending:
                    raise ValueError("Tool response does not match a preceding assistant call.")
                pending.remove(message.tool_call_id)
            else:
                if pending:
                    raise ValueError("Provide all tool responses before continuing the conversation.")
                if message.tool_calls:
                    ids = [call.id for call in message.tool_calls]
                    if len(set(ids)) != len(ids):
                        raise ValueError("Tool call IDs must be unique.")
                    pending.update(ids)
        if pending:
            raise ValueError("Provide tool responses before requesting another completion.")
        return self


class VLMChat(ChatCompletion):
    @model_validator(mode="after")
    def tool_result_not_stream(self):
        if self.stream:
            raise ValueError("MCP tools return a complete result; use the HTTP completion endpoint for streaming.")
        return self


class VLMAnalyze(InferenceParameters):
    asset_ids: list[str] = Field(min_length=1, max_length=4)
    instruction: str = Field(default="Describe the visible content of these images.", min_length=1, max_length=16000)

    @model_validator(mode="after")
    def owned_ids(self):
        import re
        if any(not re.fullmatch(ASSET_PATTERN, value) for value in self.asset_ids):
            raise ValueError("Use owned image asset IDs, never paths or URLs.")
        return self
