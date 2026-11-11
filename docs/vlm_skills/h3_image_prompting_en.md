# Native MiniMax H3-Image Prompting

Use for `MiniMax-H3(R2I)` and `MiniMax-H3(Pose)`, which share the native image
workflow. Do not use P-H3 hybrid-model/LoRA assumptions or H3 video sections.

- Use English visual narration in the final model prompt. Keep the original
  instruction and UI explanations in the user's language; preserve the required
  language of visible lettering and authored copy. Return only the prompt.
- For text-to-image, specify subjects, counts, spatial relations, visible action
  or pose, environment, composition, lighting, materials and style. Add only
  details needed for a coherent requested scene.
- For edits, write one continuous plain-text paragraph in this order: source
  definitions, target overview and individual relationships, changed or new
  details. Narrate the final state, not editing commands. Begin the overview
  with `The target image`. Follow requested new scenes instead of forcing the old
  background or framing.
- Define independent scopes with grounded bindings such as `The red cup at the
  left of <Picture 1> is <Subject 1>.` Keep Subject labels stable, not one per
  picture. Cite each contributing image explicitly, not ranges or "all references".
  Property-only donors define properties rather than whole donor objects. New
  content and wholly removed content with no retained use receive no Subject.
  If no source content remains or supplies a property, start with the overview.
- Give every defined Subject its own relationship: full preservation, partial
  preservation with retained and changed categories, exact attribute transfer
  to a named carrier, or weak reference with explicit adaptation. Use the
  standalone sentence `<Subject N> is fully preserved.` for full preservation.
  Moving, rotating, copying, relighting and occlusion are changes; a fully
  preserved parent cannot contain an edited child. Do not re-caption fully
  preserved appearance. Describe removal through the resulting surface or space.
- Use only actual labels `<Picture 1>` through `<Picture 9>`. The canvas comes
  first when present, then non-empty reference slots in upload order. Empty
  slots do not consume numbers.
- State whether each picture supplies the edit source, identity, clothing,
  pose, style, objects or composition. Do not merge different identities or
  copy unrequested reference attributes.
- For pose transfer, `<Picture 1>` supplies the character and original scene;
  `<Picture 2>` supplies only pose, orientation, limb positions and gestures.
  The changed character is partially preserved, not fully preserved. Retain
  identity, clothing, accessories and unrequested scene content; do not import
  the pose reference's mannequin appearance or background.
- For an actual painted mask, change only the requested region and explicitly
  preserve everything outside it. A mask is execution data, not a picture.
  Never invent a mask or turn its colors into output content.
- Inspect actual sources before asserting visible facts. Do not guess hidden
  parts, unreadable wording, unfamiliar identities or exact HEX colors. Preserve
  unreadable regions without claiming complete transcription or translation.
  Ask only when essential unknown information prevents a useful prompt.
- Quote literal lettering with single or double quotes; preserve capitalization,
  punctuation, values and line order. Transcribe readable source text once in its
  definition, then supply the complete resulting line or field for each edit.
  Provide actual translations or authored copy when requested; otherwise do not
  add or rewrite text. Use full-width spaces (U+3000) immediately before or after
  Chinese text where spaces are needed, without adding unsolicited spacing.
- Organize T2I descriptions naturally, not with the edit relationship structure.
  Complete requested designed artifacts with actual labels, UI states and copy;
  use supplied or derivable values, not invented real statistics or certifications.
  Check counts, exclusions, left/right, perspective, hand contact and support.
  Distinguish canvas size from object size; settle composition before preservation.
- Do not output JSON, Markdown, headings, video sections, shot lists, timestamps,
  camera movement, audio, dialogue, sampling settings, negative-prompt lists or
  hype/quality-tag boilerplate.

An installed PE model is optional and defaults to `None`; it does not replace
the generation text encoder. PE receives the same ordered independent images
and actual mask state. Identical assistant-applied prompts are not expanded
twice. Original input and actual PE output remain separately recorded.
Selecting PE does not authorize downloads or establish generation quality.

Resolution defaults to a 2048 area tier with 3072 and 4096 options; source aspect
ratio determines actual dimensions. Keep resolution and sampling in parameters.

## Example

For a local recolor of a cup with an unchanged neighboring lemon:

```text
The red cup on the left in <Picture 1> is <Subject 1>. The lemon on the right in <Picture 1> is <Subject 2>. The target image shows <Subject 1> with a blue finish. <Subject 1> is partially preserved; its shape, material, position, and scale remain while its surface color changes. <Subject 2> is fully preserved. The blue finish follows the existing surface shading and highlights of <Subject 1>, with the rest of the source image unchanged.
```

## Sources

Reviewed the official MiniMax [H3-Image Prompt Writing](https://github.com/MiniMax-AI/MiniMax-H3-Image/tree/main/skills/h3-image-prompt-writing)
`SKILL.md`, `references/t2i-en.txt`, `references/edit-en.txt` and their complete
examples. This is an adaptation to Studio's ordering, mask and pose contracts,
not a verbatim copy or a claim that the earlier Feishu page was accessed.
