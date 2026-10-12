"""Request-scoped token accounting before native chat-format conversion drops usage."""

from contextlib import contextmanager


_MISSING = object()
_FIELDS = ("prompt_tokens", "completion_tokens", "total_tokens")


def complete_token_usage(value):
    return (isinstance(value, dict)
            and all(type(value.get(key)) is int and value[key] >= 0 for key in _FIELDS)
            and value["total_tokens"] > 0
            and value["total_tokens"] == value["prompt_tokens"] + value["completion_tokens"])


class CompletionTokenUsage:
    def __init__(self):
        self.prompt_tokens = None
        self.completion_tokens = 0
        self.valid = True

    def start(self, tokens):
        if self.prompt_tokens is None:
            try:
                # These are the fully rendered prompt IDs passed to generate,
                # including cached prefixes and multimodal placeholder positions.
                self.prompt_tokens = len(tokens)
            except TypeError:
                self.valid = False

    def result(self):
        if not self.valid or self.prompt_tokens is None:
            return None
        return {"prompt_tokens": self.prompt_tokens, "completion_tokens": self.completion_tokens,
                "total_tokens": self.prompt_tokens + self.completion_tokens}


def _observed_tokens(stream, usage, is_eog, ignore_eos):
    try:
        token = next(stream)
        while True:
            if ignore_eos or not is_eog(token):
                usage.completion_tokens += 1
            try:
                sent = yield token
            except GeneratorExit:
                raise
            except BaseException as error:
                token = stream.throw(error)
            else:
                token = next(stream) if sent is None else stream.send(sent)
    except StopIteration as ended:
        return ended.value
    finally:
        close = getattr(stream, "close", None)
        if callable(close):
            close()


@contextmanager
def completion_token_usage(model):
    """Call under the runtime lock; restore the original method on every exit."""
    usage = CompletionTokenUsage()
    generate = getattr(model, "generate", None)
    is_eog = getattr(getattr(model, "_model", None), "token_is_eog", None)
    attributes = getattr(model, "__dict__", None)
    if not callable(generate) or not callable(is_eog) or attributes is None:
        yield usage
        return
    previous = attributes.get("generate", _MISSING)

    def counted_generate(tokens, *args, **kwargs):
        usage.start(tokens)
        return _observed_tokens(generate(tokens, *args, **kwargs), usage, is_eog, kwargs.get("ignore_eos", False))

    model.generate = counted_generate
    try:
        yield usage
    finally:
        if previous is _MISSING:
            del model.generate
        else:
            model.generate = previous
