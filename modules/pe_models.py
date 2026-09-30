import os
import re


PE_CATALOGS = ("clip", "text_encoders", "LLM")


def _is_projector(name):
    filename = os.path.basename(str(name).replace("\\", "/")).casefold()
    return "mmproj" in filename or "projector" in filename or bool(
        re.search(r"(?<![a-z0-9])vision(?![a-z0-9])", filename)
    )


def is_pe_model_name(name):
    parts = str(name).replace("\\", "/").split("/")
    filename = parts[-1]
    stem, extension = os.path.splitext(filename)
    pe_directory = any(re.search(r"(?:^|[-_.\s])pe(?:$|[-_.\s])", part, re.I) for part in parts[:-1])
    return (
        ("pe" in stem.casefold() or pe_directory)
        and extension.casefold() in {".safetensors", ".gguf"}
        and not _is_projector(filename)
        and not re.search(r"(?:^|[-_.])mtp(?:[-_.]|$)", stem, re.I)
    )


def scan_pe_model_files(catalog, roots):
    if catalog not in PE_CATALOGS:
        return []
    if isinstance(roots, (str, os.PathLike)):
        roots = [roots]
    inventory = []
    for root in roots or []:
        root = os.path.abspath(root)
        root_real = os.path.normcase(os.path.realpath(root))
        for directory, subdirs, filenames in os.walk(root):
            subdirs[:] = sorted(name for name in subdirs if name != ".git")
            for filename in sorted(filenames, key=str.casefold):
                path = os.path.join(directory, filename)
                name = os.path.relpath(path, root)
                if not is_pe_model_name(name):
                    continue
                try:
                    if os.path.commonpath((root_real, os.path.normcase(os.path.realpath(path)))) != root_real:
                        continue
                except ValueError:
                    continue
                inventory.append((catalog, name, path))
    return inventory


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
