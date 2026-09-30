import os
import re


PE_CATALOGS = ("clip", "text_encoders", "LLM")


def _is_projector(name):
    filename = os.path.basename(str(name).replace("\\", "/")).casefold()
    return "mmproj" in filename or "projector" in filename or bool(
        re.search(r"(?<![a-z0-9])vision(?![a-z0-9])", filename)
    )


def is_pe_model_name(name):
    filename = os.path.basename(str(name).replace("\\", "/"))
    stem, extension = os.path.splitext(filename)
    return (
        "pe" in stem.casefold()
        and extension.casefold() in {".safetensors", ".gguf"}
        and not _is_projector(filename)
        and not re.search(r"(?:^|[-_.])mtp(?:[-_.]|$)", stem, re.I)
    )


def _model_tokens(path):
    stem = os.path.splitext(os.path.basename(path))[0].casefold()
    stem = re.sub(r"[-_.](?:i?q\d+(?:_[a-z0-9]+)*|(?:b?f|fp)(?:8|16|32))$", "", stem)
    return set(re.findall(r"[a-z0-9]+", stem)) - {"mmproj", "projector", "vision"}


def paired_mmproj(model_path):
    directory = os.path.dirname(os.path.realpath(model_path))
    try:
        with os.scandir(directory) as entries:
            candidates = [
                entry.path for entry in entries if entry.is_file()
                and entry.name.lower().endswith(".gguf")
                and _is_projector(entry.name)
                and os.path.dirname(os.path.realpath(entry.path)) == directory
            ]
    except OSError:
        return None
    model_tokens = _model_tokens(model_path)
    scored = []
    for candidate in candidates:
        tokens = _model_tokens(candidate)
        if tokens and not (tokens <= model_tokens or model_tokens <= tokens):
            continue
        name = os.path.basename(candidate).casefold()
        precision = 0
        if re.search(r"[-_.]q8(?:_[a-z0-9]+)*\.gguf$", name):
            precision = 2
        elif re.search(r"[-_.](?:b?f|fp)16\.gguf$", name):
            precision = 1
        scored.append((len(model_tokens & tokens), precision, candidate))
    scored.sort(key=lambda item: (-item[0], -item[1], item[2].casefold()))
    if not scored or (len(scored) > 1 and scored[0][:2] == scored[1][:2]):
        return None
    return scored[0][2]


def pe_model_rows(inventory):
    rows = []
    names = set()
    for catalog, name, path in inventory:
        if catalog not in PE_CATALOGS or not is_pe_model_name(name) or not path or not os.path.isfile(path):
            continue
        mmproj = paired_mmproj(path) if str(name).lower().endswith(".gguf") else None
        if str(name).lower().endswith(".gguf") and not mmproj:
            continue
        key = str(name).replace("\\", "/").casefold()
        if key in names:
            continue
        names.add(key)
        rows.append({"catalog": catalog, "name": name, "path": path, "mmproj": mmproj})
    return rows
