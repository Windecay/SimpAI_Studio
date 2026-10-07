"""WD14 model identities shared by the UI tagger and Agent status."""

import os

from modules.model_path_utils import find_model_in_dirs


MODEL_SPECS = (
    (
        "wd-eva02-tagger-2026-canary-onnx-v2",
        "https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/clip_vision/wd-eva02-tagger-2026-canary-onnx-v2.onnx",
        "https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/clip_vision/wd-eva02-tagger-2026-canary-onnx-v2.csv",
    ),
    (
        "wd-eva02-large-tagger-v3",
        "https://www.modelscope.cn/models/windecay/WD-tagger/resolve/master/wd-eva02-large-tagger-v3.onnx",
        "https://www.modelscope.cn/models/windecay/WD-tagger/resolve/master/wd-eva02-large-tagger-v3.csv",
    ),
    (
        "wd-v1-4-moat-tagger-v2",
        "https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/wd-v1-4-moat-tagger-v2.onnx",
        "https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/wd-v1-4-moat-tagger-v2.csv",
    ),
)


def installed_models(paths):
    models = []
    for name, _, _ in MODEL_SPECS:
        files = {ext: find_model_in_dirs(paths, name + "." + ext) for ext in ("onnx", "csv")}
        missing = [ext for ext, path in files.items() if not path or not os.path.isfile(path)]
        models.append({"model_id": name, "ready": not missing, "missing_files": missing})
    return models
