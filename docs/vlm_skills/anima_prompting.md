# Anima Prompting

Use this skill when the selected preset or target is `Anima`, `anima_aio`, or
`anima-base-v1.0`.

Anima is not a generic Qwen natural-language target, even though the local
preset uses a Qwen text encoder. It is also not a pure SDXL tag target. Write a
hybrid Anima positive prompt: compact English Danbooru/Anima anchors first,
then short English `nltags` control sentences when layout, light, material, or
character interaction needs more precision.

## Output Contract

Return one JSON image action:

```json
{"action":"generate_image","prompt":"masterpiece, very_aesthetic, ...","draft_prompt":"...","prompt_intent":{"locked_tags":[],"must_preserve":[]},"subject_counts":{"girls":1,"boys":0,"others":0,"total":1},"summary":"...","confidence":0.95}
```

Rules:

- `prompt` is the final Anima positive prompt, in English.
- `draft_prompt` is the first-pass Anima skeleton, not a Chinese request.
- Put `negative_prompt`, `width`, `height`, `steps`, `cfg_scale`, `sampler`,
  `scheduler`, `image_number`, and seed only in JSON fields when explicitly
  requested or when the chosen Anima template exposes those controls.
- Keep visible chat short; the confirmation card owns the full payload.

## Positive Prompt Shape

Recommended order:

```text
quality / period / rating, subject count, character, series, artist, appearance, hard tags, environment tags, nltags
```

Use Anima-compatible English tags from Studio's shared local Rust tag lookup.
The prompt assistant receives its candidates; an external Agent must call
`simpai.prompts.tags` with short concepts before selecting tags. Use returned
`prompt_tag` values and preserve their escapes. Except for fixed Anima
quality/score/rating controls, do not supply tags from model memory or invent
underscore pseudo-tags from prose.

Filter lookup results by meaning and category: a matching artist or series
name is not an action, time or light tag. Unmatched concepts belong in short
English `nltags`; lookup failure must not be reported as successful validation.
Use `simpai.prompts.validate` and the existing Anima preflight before submission.

Character lookup confirms identity tags only. Do not treat character aliases as
appearance, outfit, prop, or color facts. When a named character's design is
uncertain, rely on the user's reference/image context or known local character
locks; keep uncertain visual details in `nltags` instead of blind appearance
tag searches.

If a canonical tag contains literal parentheses, escape the parentheses in the
final prompt so it is not confused with weight syntax, for example:
`surtr_\(arknights\)`.

Use one confirmed artist tag with `@` when the user specifies one or local
lookup provides one. Do not make up artist tags. Multi-artist strings belong to
an explicit artist-mixer workflow; normal Anima prompts should not pile several
`@artist` tags together.

Anima supports period/year controls such as `newest`, `recent`, `mid`, `early`,
`old`, and `year 2025`. Use the period/year that matches the user's requested
era. Do not keep `newest, year 2025` when the user asks for old anime,
retro/Heisei/cel style, or a specific earlier year.

Anima recognizes rating tokens `safe`, `sensitive`, `nsfw`, and `explicit`.
Choose the least explicit token that matches the user intent and local policy
signals. Do not escalate an ordinary SFW request to adult content just because
an external workflow used `nsfw` as a quality/anatomy default.

## `nltags`

Use `nltags` for things that are hard to express as one canonical tag:

- camera layout, subject placement, foreground/midground/background
- light direction, depth of field, face readability
- complex clothing/material combinations
- multi-character roles, gaze, hand placement, and relative positions

`nltags` should be 2-4 short English control sentences. Each sentence controls
one visible thing. Prefer direct wording such as:

```text
Place her full body slightly right of center.
Use soft window light from the left.
Keep her face sharp and readable.
Blur the classroom background gently.
```

Avoid literary backstory, abstract mood piles, video-only camera motion, and
long paragraphs. Do not contradict the hard tags.

## Composition And Size

Use the selected preset's resolution defaults unless the user asks for a size,
aspect ratio, wallpaper, portrait, square icon, or wide scene. If setting
structured size fields, choose the canvas after the visual idea is clear:

- portrait character: vertical canvas
- interaction or wide environment: horizontal canvas
- avatar or simple half-body: square canvas
- high-information centered scene: large square only when useful

Keep initial Anima base generation at or below the local preset's supported
range; larger final output belongs to upscale.

For multi-image requests, choose the canvas per image from that image's
composition. A user-approved resolution is allowed, not a global default that
must be reused for every image.

## Quality And Negative Prompt

Prefer the selected preset's default negative prompt. Add extra negative tags
only when the user asks for a specific exclusion or the target field exists.
Never put negative tags into the positive prompt.

Use weights sparingly. Anima weighting is meaningful at stronger values such as
`(chibi:2)`. Do not default to many small `(tag:1.1)` weights, and do not
weight character names, rating tokens, quality prefixes, or entire `nltags`
sentences.

## Final Check

- positive prompt is English and Anima-shaped
- no Chinese text in `prompt` or `draft_prompt`
- character/series/artist tags are resolved or clearly user-provided
- hard tags and `nltags` do not repeat or conflict
- subject count and visible relationships match `subject_counts`
- rating token does not exceed user intent
- generation controls are JSON fields, not prompt text
