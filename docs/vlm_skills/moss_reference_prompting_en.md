# MOSS-Reference Prompting

Use one anime character image in the main reference slot. Prefer a single
figure in a neutral pose on a solid white background. A head-to-thigh crop
favors facial details; a full-body picture shows the entire outfit.

Write a short, comma-separated list of English tags describing the new scene,
starting with the appropriate character count and `solo`. Include the
requested action, pose, expression, setting, framing and lighting. Keep hair,
face, outfit and accessories in the reference image unless the user explicitly
asks to change them. Do not add image numbers, layout JSON, generic quality tags,
artist tags or a character-reference trigger.

Example: `1girl, solo, walking, looking back, train platform, dusk, rim lighting, medium shot`

Start with an empty negative prompt. If the reference pose carries over, try a
neutral reference or reduce Character Reference Guidance toward 1.0. A setting
of 2.5 favors likeness. Eye color, skin tone and small accessories may still
change; try another seed before assuming a setting preserves them.
