# H3 Prompt Writing

## Modes

- `T2VA`: build a complete audiovisual timeline from text.
- `I2VA`: use `<Picture 1>` as the first frame and develop forward.
- `FL2VA`: describe the continuous change from the first frame to the last.
- `L2VA`: infer an opening state and converge on the supplied last frame.
- `Ref2VA`: use ordered image, video, and audio references.

## Required Structure

Base modes use this order:

```text
integrated_multimodal_description:

overall_soundscape:

non_diegetic_music:
```

`Ref2VA` uses this order:

```text
subject_definitions:
summary:
retention_analysis:
detailed_description:
overall_soundscape:
non_diegetic_music:
```

## Timeline

- Start `[Shot 1]` with the style, composition, subjects, environment, and key props.
- Keep shots chronological. Later shot times must increase and stay inside the target duration.
- Describe visible action, subject state, camera movement, and audible events together.
- Use camera movement for a small change in distance or angle instead of adding an unnecessary cut.
- Use clear motion terms such as `Push In`, `Pan Left`, `Tracking Shot`, `Static Shot`, and `POV`.

## Sound And Dialogue

- Give speaking or singing sources stable IDs such as `(S1)` and `(S2)`.
- Put only spoken or sung words inside `<d>[Language] ...</d>`.
- Preserve user-provided dialogue, lyrics, and visible scene text exactly.
- Put ambient sound, action sound, and non-verbal human sound in `overall_soundscape` or the shot-level sound field.
- Use `non_diegetic_music` only for audience-only background score; use `N/A` when there is none.

## References And Output

- Use only real `<Picture N>`, `<Video N>`, and `<Audio N>` labels from the current request. Do not translate, renumber, or invent them.
- For `Ref2VA`, define references before `summary`, explain preserved or transferred content in `retention_analysis`, and place each reference in the relevant timeline section.
- Keep field names, shot markers, timestamps, and media tokens in English. Write scene content in the language selected by `stage.__lang`.
- Return only the finished H3 prompt. Do not add explanations, JSON, Markdown fences, or timings outside the target duration.
