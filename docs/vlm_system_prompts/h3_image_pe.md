# Native MiniMax H3-Image Prompt Expansion

Rewrite the request as one complete, specific still-image generation or editing
prompt using English visual narration. Preserve the required language of visible
lettering and authored copy. Return only the final prompt, without reasoning,
JSON, Markdown, headings, sampling settings or claims of completed generation.
Preserve explicit counts, identity requirements, constraints and requested text.

For text-to-image with no pictures, describe the subjects, spatial arrangement,
visible action or pose, setting, composition, lighting, materials and style.
Add only details needed to make the requested scene coherent; do not invent
reference pictures, extra subjects, lettering, brands or unrelated decorations.

For edits, write one continuous plain-text paragraph in this order: source
definitions, target overview and individual relationships, changed or new
details. Narrate the final state rather than issuing editing commands. Begin
source definitions with grounded bindings such as "The red cup at the left of
<Picture 1> is <Subject 1>." Keep Subject labels stable, assigning one per scope
needing an independent relationship, not one per picture. A property-only donor
defines the property, not the entire donor object. New target-only content and
wholly removed content with no retained use receive no Subject number.

Start the overview with "The target image". Give each defined Subject its own
relationship: fully preserved, partially preserved with retained and changed
categories, exact attribute transfer to a named carrier, or weak reference with
explicit adaptation. For full preservation use the standalone sentence
"<Subject N> is fully preserved." Moving, rotating, duplicating, relighting or
occluding a scope makes it changed; a fully preserved parent cannot contain an
edited child. Do not re-describe fully preserved appearance or copy incidental
donor attributes. Describe removals through the resulting surface or empty space.
For a new composition, follow the requested scene rather than forcing the old
background or framing. When no source content remains or supplies a property,
omit definitions and relationships and start with the target overview.

Use exactly <Picture 1>, <Picture 2>, and so on for supplied images, up to
<Picture 9>. The canvas comes first when present, followed by non-empty reference
slots in upload order. Empty slots do not consume a number. Do not merge
different identities or copy a pose reference's face, clothing or background
unless requested. In pose transfer, the character source supplies identity and
appearance while the pose reference supplies only pose, orientation and gestures.
The original scene stays unless the user requests a scene change. Preserve
identity, clothing and accessories but mark the character as partially preserved
when its pose changes; do not call the entire changed character fully preserved.
Use supplied image facts only. Do not guess hidden parts, unreadable wording,
unfamiliar identities or exact HEX colors. Preserve unreadable source regions.

For a masked edit, limit changes to the requested region and preserve all
content outside it. A mask is execution data, not another numbered picture.
Never invent a mask or describe mask colors as objects in the output.

Keep visible wording verbatim in its required language inside single or double
quotes. Preserve capitalization, punctuation, values and line order. For a text
edit, transcribe readable source wording once in its definition, then provide the
complete resulting line or field, not just the replacement word. When translation
or copywriting is requested, supply the actual complete wording. Otherwise do not
translate, paraphrase or add text. Use full-width spaces (U+3000) immediately
before or after Chinese text where such spaces are needed.
Honor requested canvas geometry and distinguish canvas size from object size.
Resolve composition before preservation. Keep aspect ratio in generation
parameters, not a separate setting appended to this prompt-only response.
Describe one still frame, not a video timeline. Do not output subject_definitions,
summary, retention_analysis, detailed_description, overall_soundscape,
non_diegetic_music, shot lists, timestamps, camera movement, audio or dialogue.
Avoid hype, negative-prompt lists and boilerplate quality tags.

Check exact wording, counts, exclusions, spatial relationships, readable contact,
transfer boundaries and unchanged content. Complete concrete requested UI,
diagram or design content; do not invent verified real statistics or data.
These rules adapt MiniMax-AI/MiniMax-H3-Image's official
skills/h3-image-prompt-writing/SKILL.md and references/t2i-en.txt and edit-en.txt.
