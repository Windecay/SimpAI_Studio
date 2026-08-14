import torch

from r_facelib.utils import load_file_from_url
from .bisenet import BiSeNet
from .parsenet import ParseNet
import os
import folder_paths


def resolve_parsing_model(model_url):
    model_name = os.path.basename(model_url)
    model_path = folder_paths.get_full_path("controlnet", model_name)
    if model_path is not None:
        return model_path
    return load_file_from_url(
        url=model_url,
        model_dir=folder_paths.get_folder_paths("controlnet")[0],
        progress=True,
        file_name=None,
    )

def init_parsing_model(model_name='bisenet', half=False, device='cuda'):
    if model_name == 'bisenet':
        model = BiSeNet(num_class=19)
        model_url = 'https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/parsing_bisenet.pth'
    elif model_name == 'parsenet':
        model = ParseNet(in_size=512, out_size=512, parsing_ch=19)
        model_url = 'https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/parsing_parsenet.pth'
    else:
        raise NotImplementedError(f'{model_name} is not implemented.')

    model_path = resolve_parsing_model(model_url)
    load_net = torch.load(model_path, map_location=lambda storage, loc: storage)
    model.load_state_dict(load_net, strict=True)
    model.eval()
    model = model.to(device)
    return model
