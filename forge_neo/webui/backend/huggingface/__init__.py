import os.path

folder = os.path.dirname(__file__)  # huggingface


class Token:
    wan_compress = os.path.join(folder, "wan.tokenizer.json.xz")
    wan_t2v = os.path.join(folder, "Wan-AI", "Wan2.1-T2V-14B", "tokenizer", "tokenizer.json")
    wan_i2v = os.path.join(folder, "Wan-AI", "Wan2.1-I2V-14B", "tokenizer", "tokenizer.json")

    neta_compress = os.path.join(folder, "neta.tokenizer.json.xz")
    neta_lumina = os.path.join(folder, "neta-art", "Neta-Lumina", "tokenizer", "tokenizer.json")

    z_compress = os.path.join(folder, "z.tokenizer.json.xz")
    z_image = os.path.join(folder, "Tongyi-MAI", "Z-Image-Turbo", "tokenizer", "tokenizer.json")

    f2_4b = os.path.join(folder, "black-forest-labs", "FLUX.2-klein-4B", "tokenizer", "tokenizer.json")
    f2_9b = os.path.join(folder, "black-forest-labs", "FLUX.2-klein-9B", "tokenizer", "tokenizer.json")

    anima = os.path.join(folder, "circlestone-labs", "Anima", "tokenizer", "tokenizer.json")

    ernie_compress = os.path.join(folder, "ernie.tokenizer.json.xz")
    ernie = os.path.join(folder, "baidu", "ERNIE-Image", "tokenizer", "tokenizer.json")


class sha256:
    wan = "20a46ac256746594ed7e1e3ef733b83fbc5a6f0922aa7480eda961743de080ef"
    # https://huggingface.co/Wan-AI/Wan2.1-T2V-14B-Diffusers/blob/main/tokenizer/tokenizer.json

    neta = "3f289bc05132635a8bc7aca7aa21255efd5e18f3710f43e3cdb96bcd41be4922"
    # https://huggingface.co/neta-art/Neta-Lumina-diffusers/blob/main/tokenizer/tokenizer.json

    z = "aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4"
    # https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/blob/main/tokenizer/tokenizer.json

    f2 = "aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4"
    # https://huggingface.co/black-forest-labs/FLUX.2-klein-4B/blob/main/tokenizer/tokenizer.json

    ernie = "577575622324b2e099e2648be26bdeb5e5815ffe66d7004e9e3ddbf421db6bf1"
    # https://huggingface.co/baidu/ERNIE-Image/blob/main/tokenizer/tokenizer.json


def decompress(source: str, target: str):
    import lzma

    os.makedirs(os.path.dirname(target), exist_ok=True)
    with lzma.open(source, "rb") as input_file:
        with open(target, "wb") as output_file:
            output_file.write(input_file.read())


def compress(source: str, target: str):
    import lzma

    with open(source, "rb") as input_file:
        with lzma.open(target, "wb") as output_file:
            output_file.write(input_file.read())


def decompress_tokenizer_if_available(source: str, target: str, expected_sha256: str):
    if os.path.isfile(target):
        return
    if not os.path.isfile(source):
        return
    import tempfile

    target_dir = os.path.dirname(os.path.abspath(target))
    os.makedirs(target_dir, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".tokenizer-", suffix=".tmp", dir=target_dir)
    os.close(descriptor)
    try:
        decompress(source, temporary)
        compare_sha256(temporary, expected_sha256)
        os.replace(temporary, target)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def process():
    decompress_tokenizer_if_available(Token.wan_compress, Token.wan_t2v, sha256.wan)
    decompress_tokenizer_if_available(Token.wan_compress, Token.wan_i2v, sha256.wan)
    decompress_tokenizer_if_available(Token.neta_compress, Token.neta_lumina, sha256.neta)
    decompress_tokenizer_if_available(Token.z_compress, Token.z_image, sha256.z)
    decompress_tokenizer_if_available(Token.z_compress, Token.f2_4b, sha256.f2)
    decompress_tokenizer_if_available(Token.z_compress, Token.f2_9b, sha256.f2)
    decompress_tokenizer_if_available(Token.z_compress, Token.anima, sha256.f2)
    decompress_tokenizer_if_available(Token.ernie_compress, Token.ernie, sha256.ernie)

    # if not os.path.isfile(Token.wan_compress):
    #     compress(Token.wan_t2v, Token.wan_compress)
    # if not os.path.isfile(Token.neta_compress):
    #     compare_sha256(Token.neta_lumina, sha256.neta)
    #     compress(Token.neta_lumina, Token.neta_compress)
    # if not os.path.isfile(Token.z_compress):
    #     compress(Token.z_image, Token.z_compress)
    # if not os.path.isfile(Token.ernie_compress):
    #     compress(Token.ernie, Token.ernie_compress)


def compare_sha256(path: str, target: str):
    import hashlib

    with open(path, "rb") as f:
        data = f.read()
    _hash = hashlib.sha256(data)
    assert _hash.hexdigest() == target
