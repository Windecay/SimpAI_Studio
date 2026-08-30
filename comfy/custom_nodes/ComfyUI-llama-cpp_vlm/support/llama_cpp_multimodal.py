MEDIA_CONTENT_TYPES = frozenset({
    "image",
    "image_url",
    "input_image",
    "audio",
    "audio_url",
    "input_audio",
    "video",
    "video_url",
    "input_video",
})


def messages_have_media(messages):
    for message in messages if isinstance(messages, list) else []:
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, list):
            continue
        for item in content:
            if not isinstance(item, dict):
                continue
            content_type = str(item.get("type") or "").strip().lower()
            if content_type in MEDIA_CONTENT_TYPES:
                return True
            if any(key in item for key in MEDIA_CONTENT_TYPES):
                return True
    return False


def metadata_text_chat_handler(llm):
    handlers = getattr(llm, "_chat_handlers", None)
    if not isinstance(handlers, dict):
        return None

    candidates = []
    chat_format = getattr(llm, "chat_format", None)
    if chat_format:
        candidates.append(str(chat_format))
    candidates.append("chat_template.default")

    for name in candidates:
        handler = handlers.get(name)
        if callable(handler):
            return handler
    return None


def create_text_only_chat_completion(llm, *, messages, text_handler=None, **kwargs):
    if messages_have_media(messages):
        return llm.create_chat_completion(messages=messages, **kwargs)

    if callable(text_handler):
        return text_handler(llama=llm, messages=messages, **kwargs)

    if getattr(llm, "chat_handler", None) is None:
        return llm.create_chat_completion(messages=messages, **kwargs)

    handler = metadata_text_chat_handler(llm)
    if handler is None:
        return llm.create_chat_completion(messages=messages, **kwargs)

    return handler(llama=llm, messages=messages, **kwargs)
