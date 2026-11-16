"""Public Qwen TTS requests, independent of preset and Canvas node schemas."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TTSModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TTSVoiceQuery(TTSModel):
    query: str = Field(default="", max_length=200)
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=20, ge=1, le=100)


class TTSParameters(TTSModel):
    model_choice: Literal["0.6B", "1.7B"] = "1.7B"
    language: Literal["Auto", "Chinese", "English", "Japanese", "Korean", "French",
                      "German", "Spanish", "Portuguese", "Russian", "Italian"] = "Auto"
    device: Literal["auto", "cuda", "cpu", "mps"] = "auto"
    precision: Literal["bf16", "fp32"] = "bf16"
    attention: Literal["auto", "sdpa", "eager"] = "auto"
    seed: int = Field(default=-1, ge=-1, le=2147483647)
    max_new_tokens: int = Field(default=4096, ge=128, le=8192)
    top_p: float = Field(default=0.8, gt=0, le=1)
    top_k: int = Field(default=20, ge=0, le=100)
    temperature: float = Field(default=1.0, gt=0, le=2)
    repetition_penalty: float = Field(default=1.05, ge=1, le=2)
    batch_size: int = Field(default=4, ge=1, le=16)
    decode_batch_size: int = Field(default=2, ge=1, le=8)
    max_chars: int = Field(default=200, ge=20, le=1000)
    hard_max_chars: int = Field(default=260, ge=20, le=2000)
    lock_timbre_with_first_segment: bool = True
    x_vector_only: bool = False
    pause_linebreak: float = Field(default=0.5, ge=0, le=5)
    period_pause: float = Field(default=0.4, ge=0, le=5)
    comma_pause: float = Field(default=0.2, ge=0, le=5)
    question_pause: float = Field(default=0.6, ge=0, le=5)
    hyphen_pause: float = Field(default=0.3, ge=0, le=5)

    @model_validator(mode="after")
    def segment_limits(self):
        if self.hard_max_chars < self.max_chars:
            raise ValueError("hard_max_chars must be at least max_chars")
        return self


class TTSRole(TTSModel):
    name: str = Field(min_length=1, max_length=80, pattern=r"^[^:\r\n：]+$")
    audio_asset_id: str = Field(pattern=r"^(?:asset|file):[0-9a-f]{24,64}$")
    ref_text: str = Field(min_length=1, max_length=4000)


class TTSPreview(TTSModel):
    mode: Literal["voice_design", "voice_clone", "custom_voice", "dialogue"] = "custom_voice"
    text: str = Field(default="", max_length=16000, description="Exact words to speak, in their original language; not an image prompt.")
    instruct: str = Field(default="", max_length=2000, description="Voice or delivery description, separate from the spoken text.")
    voice_id: str = Field(default="", max_length=240, description="Optional description ID returned by tts.voices.list. Do not invent an ID.")
    speaker: str = Field(default="", max_length=80, description="Built-in speaker key returned by tts.voices.list; custom_voice mode only.")
    ref_audio_asset_id: str = Field(default="", pattern=r"^(?:(?:asset|file):[0-9a-f]{24,64})?$")
    ref_text: str = Field(default="", max_length=4000, description="Transcript of the reference audio; required for cloning unless x_vector_only=true.")
    script: str = Field(default="", max_length=16000, description="Dialogue only: one 'role name: spoken text' per line, with roles supplied below.")
    roles: list[TTSRole] = Field(default_factory=list, max_length=4)
    parameters: TTSParameters = Field(default_factory=TTSParameters)


class TTSSubmit(TTSPreview):
    request_id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.:-]+$",
                            description="Reuse the same ID and body only when retrying the same speech task.")
