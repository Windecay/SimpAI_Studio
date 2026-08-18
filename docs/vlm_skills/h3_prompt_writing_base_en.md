# H3 Base Mode Prompt Writing Rules

Applies to `T2VA`, `I2VA`, `FL2VA`, and `L2VA`. The compiler selects the active mode. Follow only that mode's alignment rule and never mix rules from another mode.

## Output Structure

Return only these three sections in this order:

```text
integrated_multimodal_description:

overall_soundscape:

non_diegetic_music:
```

`T2VA` has no image-alignment preamble. `I2VA`, `FL2VA`, and `L2VA` each place one alignment line before the three sections, followed by a blank line:

- `I2VA`: `<Picture 1>` is fully aligned at `0.00` seconds and the video develops forward from that first frame.
- `FL2VA`: `<Picture 1>` aligns at `0.00` seconds and `<Picture 2>` aligns at the target duration; focus on continuous visible change between them.
- `L2VA`: `<Picture 1>` aligns at the target duration as the final frame; infer the opening state and gradually arrive at this image.

## Mode-Specific Writing

- `T2VA`: build the complete audiovisual timeline from text. Do not add picture tokens or image-alignment text.
- `I2VA`: treat `<Picture 1>` as a first-frame fact. The first action must grow naturally from its `0.00`-second state; do not introduce it as a reference image appearing later.
- `FL2VA`: treat the two pictures as first and last constraints. Describe how the subject, pose, setting, lighting, and camera change continuously from the first frame to the last. Do not describe two isolated stills or jump directly to the final frame.
- `L2VA`: treat `<Picture 1>` as a final-frame fact. State the inferred opening state, the progression, and the action that reaches the final frame. Do not place this image at `0.00` seconds or describe it as the first frame.

When no cut is requested between endpoint frames, prefer one continuous shot. Add cuts, transitions, or scene changes only when the user asks for them. State camera type, meaningful amplitude, and speed, using terms such as `Push In`, `Pan Left`, `Tracking Shot`, `Static Shot`, or `POV`.

## Timeline And Sound

- For 10-30 second outputs, structure the timeline as setup, action development, visible change, result, and ending. Do not compress the action into the opening and fill the remaining time with a static view.
- Use roughly 1-4 shots for 10-15 seconds and 3-5 purposeful shots for 15-30 seconds; add a shot only when it changes viewpoint or meaningful information.

- Start `integrated_multimodal_description` with `[Shot 1]`. Keep shot times increasing and inside the target duration; the final shot must reach the target duration.
- In each shot, write visible action and subject state first, then `Camera:`, `Dialogue and visible text:`, and `Synchronized sound:` in that order.
- Give each speaking or singing source a stable `(S1)`, `(S2)` ID. Put only spoken or sung words inside `<d>[Language] ...</d>`; write `None` when there is no dialogue.
- Put visible scene text in English double quotation marks and preserve user-provided wording. Ambient sound, footsteps, impacts, and non-verbal human sounds are synchronized sound.
- Use `overall_soundscape` for audible in-world ambience, action sounds, and dialogue-related sound. Use `non_diegetic_music` only for audience-only score, or `N/A` when there is none.

Base modes allow only the picture tokens supported by the active mode: `T2VA` uses no pictures, `I2VA` and `L2VA` use only `<Picture 1>`, and `FL2VA` uses only `<Picture 1>` and `<Picture 2>`. Do not write `<Video N>` or `<Audio N>`, and do not invent, translate, or renumber media tokens.
