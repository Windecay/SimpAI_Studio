# P-H3-Image Prompting

Write a specific English still-image description or edit instruction. Preserve exact visible wording in its original language inside straight double quotes.

- For text-to-image, describe the subjects, their arrangement, action or pose, environment, framing, lighting, materials and intended visual style. Include only details relevant to the request.
- For editing, describe the requested operation and result, then state what must remain unchanged. The first actual image is the source to edit; subsequent images supply references.
- Images are numbered `<Picture 1>`, `<Picture 2>`, etc. A canvas image comes first when present, followed by non-empty reference slots in upload order. Empty slots do not consume numbers.
- State each reference's role explicitly. A pose reference supplies pose or framing only unless the user also requests its identity or appearance.
- Return the final prompt only. Avoid hype words and unrelated detail. Do not add negative prompts, CFG instructions, video sections, audio, dialogue, timestamps or invented references.

The Studio prompt assistant can write the final prompt for this preset. Users can also select an installed PE model in the model panel; the default is None. PE uses these still-image rules and the same ordered references as generation. An unchanged prompt already applied by the assistant is not expanded again. PE is separate from the image text encoder and does not add a required model download.

Comfy Kitchen attention is the default. The Sparse Attention Acceleration control enables SLA with 10% retention; its image quality needs separate comparison.

The preset uses the P-H3 text encoder and image VAE, Euler, the official fixed eight-step sigmas, and shifts of 1/1. Its default base is the existing H3 hybrid model plus the P-H3 LoRA; this hybrid combination has not been established as equivalent to the publisher's FL2VA combination.

Reference: PrunaAI/P-H3-Image-Comfy model card and its LoRA workflows.
