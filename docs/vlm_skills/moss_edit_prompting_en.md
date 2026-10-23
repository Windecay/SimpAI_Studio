# Moss-Edit image editing prompts

Edit only the single main image supplied through the canvas.

State the requested change and the properties to preserve. Do not recaption the entire unchanged scene.
Example: “Change the blue jacket to red. Preserve the person's identity, hairstyle, pose, background and other clothing.”

Do not refer to other input images or add image numbers, Qwen/H3 image tags or MOSS Layout JSON. Write the final editing instruction in English; preserve requested on-image wording in its original language.

For removal, name each requested subject and associated object explicitly using its position or appearance. State that each must disappear completely and describe the empty area that replaces them. Distinguish foreground subjects to remove from background subjects to preserve.

This preset has no mask and does not promise pixel-exact preservation outside the requested change. Do not invent missing references, masks or coordinates. Return only the final editing instruction, without analysis, explanation or JSON.
