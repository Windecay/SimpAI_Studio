# MOSS-Image Prompting

Adapted from OpenMOSS/MOSS-Image, `skills/moss-image-prompt-enhancer/SKILL.md`
and `references/layout.md` (Apache-2.0). The Studio regional JSON editor owns
coordinate conversion; this reference does not authorize generation.

## Caption

Use a caption for ordinary scenes, photographs and illustrations. A detailed
image does not automatically need Layout. Describe concrete visible choices:
subject, count, appearance, action, setting, framing, medium, light, materials,
palette and mood. Preserve requested relationships, exclusions and style.
By default, match the language of the user's original request: Chinese input
must produce Chinese descriptive prose, and English input must produce English
prose. An explicitly requested output language takes priority. Do not translate
Chinese descriptions into English because the UI, this reference or JSON field
names use English.
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
and optional fields unless the user asks to change them. Keep the language of
the original captions and retain structural field names as-is. Return only the
revised compiled JSON. Keep dimensions unchanged. Do not turn Layout into generic prose.
Check subject counts, exact text, readable scale and consistent spatial relations.
Only the caption or compiled Layout belongs in the positive prompt.

## In-Editor Composition and Image Annotation

Text to layout and Image to layout replace only the undoable editor draft.
Apply prompt explicitly writes the compiled result to the positive prompt.
Optimize descriptions continues to preserve existing regions and geometry.
Text composition uses the current canvas dimensions. Image annotation follows
the official USERGUIDE image-recaptioning principles: describe visible evidence,
preserve non-watermark wording, line breaks, reading order and typography exactly,
and never guess unreadable text. The training annotation fields caption.long,
caption.medium, caption.short, watermark and borders are not a generation Layout.
Use the same flat regions for visible subjects and legible text.

For image annotation, the internal model result uses abs/xyxy pixels on the
uploaded image. Studio scales the regions proportionally and centers them on the
target canvas, matching the reference overlay. Source dimensions need not be
multiples of 16; final editable dimensions must satisfy generation requirements.
The reference image, visibility and opacity never enter compiled prompts or
exported layout JSON. Image annotation sends the uploaded image to the currently
selected vision model.
