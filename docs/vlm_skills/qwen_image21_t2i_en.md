# Qwen Image 2.1 PE Text-to-Image Prompt Skill

Use this skill for `Qwen2.1-Edit` when no input image is attached and the user
wants a new image. It adapts the shared `image-prompt-t2i` skill to the
SimpAI prompt-action contract.

## Output boundary

- Write one generator-ready prompt only.
- Do not return the shared skill's JSON wrapper, `rewritten_prompt`,
  `wh_ratio`, or `ratio_follow` fields. SimpAI keeps aspect ratio and
  resolution in the preset controls.
- In Canvas Agent requests, put the finished prompt in the runtime action's
  `prompt` field and follow the outer action JSON contract supplied by the
  runtime.
- Do not include Markdown fences, headings, analysis, model parameters,
  resolution, seed, steps, CFG, sampler, or LoRA syntax in the prompt.

## Eight-step prompt structure

Plan against the shared skill's eight steps, then emit one coherent description
of the finished frame:

1. Separate fixed constraints from open choices. Preserve named subjects,
   counts, colors, positions, ratios, layouts, and requested visible text
   exactly. Apply job-level instructions such as sharpness or quote style
   silently instead of repeating them as image content.
2. Fix orientation and aspect ratio. Prefer an explicitly requested ratio;
   otherwise choose `3:2` for a normal horizontal frame, `2:3` for a vertical
   frame, `1:1` for a square emblem, or `16:9` for a wide cinematic or
   presentation frame. The ratio belongs to preset controls and must not appear
   in the prompt body.
3. Open with one sentence of about twenty words naming the medium, style,
   subject, and background or palette. It describes an observed finished image,
   not an instruction to a renderer.
4. Internally inventory every visible element with a position and list every
   legible text string in reading order. Spread positional references across
   the top, bottom, sides, corners, and center instead of clustering them.
5. Walk the frame in reading order: background and supporting surface, top band,
   left-to-right body regions, then bottom band or foreground. For one subject,
   walk the background, placement and pose, head and face, body and garments,
   held objects, and remaining edge details. About one third of the sentences
   should begin with a positional phrase such as "On the right side of the
   frame" or "In the upper-left corner".
6. Handle visible text in reading order. State its position, weight, color,
   case, relative size, and exact characters. Put every rendered string in
   straight double quotes, preserving the user's script, capitalization,
   punctuation, and spacing. Do not invent signs, logos, captions, subtitles,
   watermarks, or translations.
7. Give lighting its own sentence: source, direction, softness, shadows, and
   highlights. Do not leave lighting as an abstract quality slogan.
8. End with exactly one sentence that steps back to cover composition balance,
   palette, medium, style, and mood. Do not add another summary afterward.

For a complex frame, default to roughly twenty sentences and four to five
hundred English words. A simple frame may be shorter, but extra length must not
invent facts that conflict with the brief. Use present tense, third person, and
observable details; qualify genuinely uncertain details naturally. Name colors
with useful modifiers, state materials and small counts, describe people by
observable surface, and keep shadows, reflections, scale, and light physically
coherent. Avoid empty quality slogans such as "masterpiece", "8K", and
"highly detailed", and do not write the prompt as "create" or "the AI should".

## Text in the image

- Treat text that must appear in the image as literal content.
- Preserve the user's exact characters, language, capitalization, punctuation,
  and spacing when supplied.
- Put each rendered text string inside straight double quotes in the prompt.
- Do not invent a sign, caption, logo, subtitle, watermark, or translation.

## Length and language

- The final visual description is normally English for this Qwen target.
  Preserve quoted on-image text exactly as requested, regardless of the
  description language.
- Describe the observed frame directly without user-facing explanation or
  renderer instructions.

## Final check

Before returning, verify that the prompt is one coherent scene, every explicit
constraint is present, the subject relationship is visible, quoted text is
exact, and execution controls are outside the prompt.
