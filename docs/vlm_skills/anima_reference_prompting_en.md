# Anima Reference Prompt Contract

Both Anima-Reference themes reuse Anima's Rust tag lookup. Select indexed
tags; never invent tags from memory.

## Tag Source

Use Studio's shared local lookup: injected candidates in Prompt Tools,
or `simpai.prompts.tags` for an external Agent. Query short concepts such as
`sleeping`, `closed eyes`, `on bed`; translate an unmatched Chinese concept
into a short English query and search again. No network tag search.

Select only relevant candidates of the right category. Use returned
`prompt_tag` values, preserving escapes. A similar artist, series or character
name is not evidence for an action, time or light tag. Do not paste all hits.
Except for Anima Base quality/score/rating controls, tags need local lookup
evidence. No translated pseudo-tags, filenames or prose joined by underscores.
Put unmatched ideas into short English nltags; never claim failed lookup was
validated. Keep `score_7` spelling and the preset's negative defaults.

## References And Themes

Upload the main reference to `Upload and canvas(1)`. Optional
`Upload prompt image(2)` gives another view of the SAME character.
For two people, put one joint image or side-by-side collage in the main input.

Character Reference (`char`) guides appearance; style can follow the prompt.
Character & Style Reference (`cs`) also guides style. Theme selects the mode;
`char`/`cs` are not prompt switches.

Write the scene only by default. Do not recaption hair, eyes, clothes, identity
or artist. Add an appearance/style change only when requested; identity/artist
tags still require lookup, never identification guessed from a picture.
Requested pose, expression, camera and background override the reference pose.
This regenerates the whole scene, without a mask or pixel preservation.

## Output And Checks

Order: quality/rating prefix, subject count, retrieved action/pose/expression/
scene tags, then 2-4 short English nltags for placement, relationships, time
and light. Keep counts consistent; no `solo` with two people, or open eyes/
looking at viewer when closed eyes are required. Do not add unrelated people,
artists or period tags.

Return only English prompt text, without JSON, Markdown, image-number tags
or generation settings. Keep original `instruction` separate from API
`prompt`; parameters belong in fields. Never add `<lora:snapref_v2a:...>`.
Use `simpai.prompts.validate` and route preview; retain existing Anima checks.
Report lookup/validation errors honestly; rewrite unmatched ideas as sentences.

## Nap Examples

Examples are not defaults. Select actual count/gender and tags from current
lookup. Afternoon and window light are sentences, not assumed indexed tags.

```text
masterpiece, best quality, score_7, safe, 1girl, solo, sleeping, closed eyes, lying, on bed, pillow, blanket, bedroom.
She is taking an afternoon nap on her side with closed eyes and her head on a pillow.
A light blanket covers her lower body, and soft window light fills the bedroom.
```

For two characters in one joint reference:

```text
masterpiece, best quality, score_7, safe, 2girls, sleeping, closed eyes, lying, on bed, pillow, blanket, bedroom.
Both characters take an afternoon nap side by side with closed eyes and separate pillows.
The left character lies on her left side; the right character lies on her right side.
Soft window light fills the bedroom.
```

Start with preset defaults. Reference Fidelity trades detail for prompt freedom; weights
balance views. Reference Megapixels affects input detail, not output size.
Review generated identity, count and pose.
