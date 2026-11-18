"""Mesh file types shared by the Comfy output reader and the media library."""

import os


MESH_MIME_TYPES = {
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".obj": "model/obj",
    ".ply": "application/octet-stream",
    ".stl": "model/stl",
}
MESH_EXTENSIONS = frozenset(MESH_MIME_TYPES)


def is_mesh_file(path, *, extension=None):
    extension = extension or os.path.splitext(path)[1].lower()
    if extension != ".ply":
        return extension in MESH_EXTENSIONS
    # PLY is also used by Gaussian splats and point clouds. Only index PLY
    # as a mesh when its header declares faces.
    try:
        with open(path, "rb") as file:
            if file.readline(16).strip() != b"ply":
                return False
            header = file.read(16 * 1024).split(b"end_header", 1)
        if len(header) != 2:
            return False
        for line in header[0].splitlines():
            fields = line.split()
            if len(fields) == 3 and fields[:2] == [b"element", b"face"]:
                return fields[2].isdigit() and int(fields[2]) > 0
    except (OSError, ValueError):
        pass
    return False
