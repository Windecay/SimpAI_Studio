# Anima Reference Prompt Contract

All three Anima-Reference themes reuse Anima's Rust tag lookup. Select indexed
tags; never invent tags from memory.

## Tag Source

Use Studio's local lookup: Prompt Tools candidates or `simpai.prompts.tags`.
Query short concepts (`sleeping`, `closed eyes`, `on bed`); translate unmatched
Chinese concepts into short English queries. No network tag search.

Pick relevant candidates of the right category using returned `prompt_tag`
values (keep escapes). Similar artist, series or character names are not
action, time or light tags. Except for Anima Base quality/score/rating controls,
tags need lookup evidence—no pseudo-tags, filenames or underscore prose. Put
unmatched ideas into short English nltags; never claim failed lookup was
validated. Keep preset negative defaults.

## References And Themes

Put the main reference in `Upload and canvas(1)`. Optional
`Upload prompt image(2)` and `Upload prompt image(3)` add up to two more
images. In character modes, all slots show the SAME character (for two people,
use one joint image in slot 1). In Style mode, upload 1-3 artworks in the same
art style.

- Character & Style Reference (`cs`): appearance and art style.
- Character Reference (`char`): appearance only; prompt sets style.
- Style Reference (`style`): art style only (line work, palette, lighting,
  shading); the reference's character stays out.

Theme selects the mode; `cs`/`char`/`style` are not prompt switches. In `cs`
and `char`, write only the scene by default (describe hair, eyes, clothes or
artist only when changing them). In `style`, describe BOTH the desired character
(count, hair, eyes, outfit, colors) AND the scene; do not recaption the
reference's character or add unrelated artist tags. Requested pose, expression,
camera and background override the reference pose (full-scene regeneration, no
mask).

## Output And Checks

Order: subject count, retrieved appearance (for Style Reference or requested
changes) and action/pose/expression/scene tags, then 2-4 short English nltags.
Default Anima style supplies quality/score/rating tags; don't repeat them. Keep
counts consistent (no `solo` with two people; no open eyes when closed eyes are
required).

Return English prompt text only (no JSON, Markdown, image numbers or settings).
Keep `instruction` separate from API `prompt`; never add
`<lora:snapref_v2s_pre1:...>`. Use `simpai.prompts.validate` and route preview.

## Examples

```text
1girl, solo, sleeping, closed eyes, lying, on bed, pillow, blanket, bedroom.
She is taking an afternoon nap on her side with closed eyes and her head on a pillow.
A light blanket covers her lower body, and soft window light fills the bedroom.
```

Two characters in one joint reference:

```text
2girls, sleeping, closed eyes, lying, on bed, pillow, blanket, bedroom.
Both characters take an afternoon nap side by side with closed eyes and separate pillows.
The left character lies on her left side; the right character lies on her right side.
Soft window light fills the bedroom.
```

Style Reference (target character + scene):

```text
1girl, solo, short silver hair, blue eyes, maid, apron, holding tray, smile, cowboy shot, cafe interior.
A cheerful silver-haired maid stands inside a cozy cafe holding a serving tray.
Warm afternoon light falls across the counter.
```

Reference Fidelity trades detail for prompt freedom; weights 1-3 balance inputs
(in Style mode, weights above `1.0` may pull in the reference's character).
Reference Resolution (512-1024) affects input detail, not output size.
