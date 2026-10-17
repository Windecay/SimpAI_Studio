# MOSS-Image Prompting

Adapted from OpenMOSS/MOSS-Image, `skills/moss-image-prompt-enhancer/SKILL.md`
and `references/layout.md` (Apache-2.0). The Studio regional JSON editor owns
coordinate conversion; this reference does not authorize generation.

## Caption

Use a caption for ordinary scenes, photographs and illustrations. A detailed
image does not automatically need Layout. Describe concrete visible choices:
subject, count, appearance, action, setting, framing, medium, light, materials,
palette and mood. Preserve requested relationships, exclusions and style.
Default to English descriptive prose, honoring an explicitly requested language.
Keep visible wording verbatim in its original language, including punctuation,
capitalization and line breaks. Do not mistake quoted instructions for lettering.
Avoid generic quality tags, arbitrary word budgets, invented event facts,
unrequested subjects, names, watermarks, text and style changes. Respect brevity
and minimalist briefs. Ordinary prompt expansion returns only the caption.

## Layout

Use Layout for requested text placement, several panels or controlled object
relationships. Compose reading order, prominence, imagery and legible typography.
Use coherent visible units; overlaps are allowed. Boxes annotate placement and do
not request drawn borders. Captions describe appearance, never JSON conversion.

In Studio, use the Regional button at the bottom of the prompt field. The editable draft uses:
`width`, `height`, `bbox_coord_space="abs"`, `bbox_format="xyxy"`, a `summary`
object and a nonempty flat `items` array. Use actual pixels from the top left.
Dimensions must match generation and be positive multiples of 16.
`summary.caption` is an optional global description and may be empty when regions
are present. Do not invent a summary. Optional `meta` and `palette` are
string arrays, and `canvas` is `single`, `multi_panel` or `collage`.
Each item has `label` (`object`, `character` or `text`), nonempty `caption` and
`bbox=[left,top,right,bottom]` inside the canvas. Text items also require literal
`text`; optional `tags` and `palette` are string arrays.
Do not add IDs, parents, children, local coordinates or scene-schema elements.
The editor encloses fractional edges, subtracts the canvas center and serializes
one line with integer `abs_centralized` / `yxyx` boxes, omitting width and height.
Do not calculate centered coordinates yourself or paste the editable draft
directly into the positive prompt. Apply it through the editor.

When revising a supplied compiled Layout, preserve its boxes, roles, exact text
and optional fields unless the user asks to change them. Return only the revised
compiled JSON. Keep dimensions unchanged. Do not turn Layout into generic prose.
Check subject counts, exact text, readable scale and consistent spatial relations.
Only the caption or compiled Layout belongs in the positive prompt.
