# Anima Reference Prompt Contract

Both Anima-Reference themes reuse Anima's Rust tag lookup. Select indexed
tags; never invent tags from memory.

## Tag Source

Use Studio's local lookup: Prompt Tools candidates or `simpai.prompts.tags`
for an external Agent. Query short concepts such as `sleeping`, `closed eyes`,
`on bed`; translate unmatched Chinese concepts into short English queries.
No network tag search.

Select only relevant candidates of the right category. Use returned
`prompt_tag` values, preserving escapes. Similar artist, series or character
names are not action, time or light tags. Do not paste all hits.
Except for Anima Base quality/score/rating controls, tags need local lookup
evidence. No translated pseudo-tags, filenames or prose joined by underscores.
Put unmatched ideas into short English nltags; never claim failed lookup was
validated. Keep the preset's negative defaults.

## References And Themes

Upload the main reference to `Upload and canvas(1)`. Optional
`Upload prompt image(2)` gives another view of the SAME character. For two
people, use one joint image or side-by-side collage in the main input.

Character Reference (`char`) guides appearance; style can follow the prompt.
Character & Style Reference (`cs`) also guides style. Theme selects the mode;
`char`/`cs` are not prompt switches.

Write the scene only by default. Do not recaption hair, eyes, clothes, identity
or artist. Add appearance/style changes only when requested; identity/artist
tags require lookup, not identification guessed from a picture.
Requested pose, expression, camera and background override the reference pose.
This regenerates the whole scene, without a mask or pixel preservation.

## Output And Checks

Order: subject count, retrieved action/pose/expression/scene tags, then 2-4
short English nltags for placement, relationships, time and light. The default
Anima style supplies quality, score and rating tags; don't repeat them.
Negative defaults come from the preset's negative prompt. For a different
rating, adjust the style and rating tags to avoid conflicts.
Keep counts consistent; no `solo` with two people, or open eyes/looking at
viewer when closed eyes are required. Do not add unrelated people, artists or
period tags.

Return English prompt text only, without JSON, Markdown, image-number tags
or settings. Keep `instruction` separate from API `prompt`; use parameter
fields. Never add `<lora:snapref_v2a:...>`. Use `simpai.prompts.validate`
and route preview. Report lookup/validation errors; write unmatched ideas as
sentences.

## Nap Examples

Examples are not defaults. Select actual count/gender and tags from current
lookup. Afternoon and window light are sentences, not assumed indexed tags.

```text
1girl, solo, sleeping, closed eyes, lying, on bed, pillow, blanket, bedroom.
She is taking an afternoon nap on her side with closed eyes and her head on a pillow.
A light blanket covers her lower body, and soft window light fills the bedroom.
```

For two characters in one joint reference:

```text
2girls, sleeping, closed eyes, lying, on bed, pillow, blanket, bedroom.
Both characters take an afternoon nap side by side with closed eyes and separate pillows.
The left character lies on her left side; the right character lies on her right side.
Soft window light fills the bedroom.
```

Start with preset defaults. Reference Fidelity trades detail for prompt freedom; weights
balance views. Reference Megapixels affects input detail, not output size.
Review generated identity, count and pose.
