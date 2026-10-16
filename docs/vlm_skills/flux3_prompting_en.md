# Flux3 Image Prompting

These rules apply to FLUX 3 Image Klein. Choose the task from the user's request
and actual images, not from the model's text encoder name.

For text-to-image, write one self-contained English paragraph describing the
finished frame: medium, composition, subjects, materials, background, lighting
and spatial relationships. Preserve every explicit count, attribute and wording.
About 100-350 words normally suffice; follow an explicit request for brevity.
Do not invent lettering, brands or additional subjects.

For an edit of an existing image, start with the requested operation. Describe
the changed object's final appearance and the necessary effects on shadows,
reflections, occlusion and perspective. End with one compact preservation clause.
Keep this focused, usually about 50-150 words. Do not recaption unchanged scenery.
For a newly composed frame, state what each reference supplies and how the
subjects should be arranged in the result.

References are separate images, ordered as the canvas when present, then the
non-empty reference slots. Empty slots do not consume a number. Refer to the
first image, second image and so on in natural language. Identify the base image
and donors from the request; do not assume the first image must remain the base.
Do not use Qwen `<image1>` or H3 `<Picture 1>` tags. The initial Studio preset has
no bounding-box or mask input; do not invent coordinates, masks or box tables.

All descriptive prose is English. Keep requested visible text verbatim in its
original language and script inside straight double quotes, including Chinese.
Do not translate existing lettering unless asked. Preserve the user's requested
style and framing. Numeric dimensions are controlled by the application.

Return only the final prompt, with no reasoning, JSON, Markdown or claim that an
image has already been generated. Expansion is a user-selected operation. Never
reject a direct generation request merely because its prompt was not expanded.
