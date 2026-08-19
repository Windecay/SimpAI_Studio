# H3 Ref2VA Prompt Writing Rules

`Ref2VA` combines ordered image, video, and audio references into one video. It does not use the three base-mode sections. Return exactly these six sections in this order:

```text
subject_definitions:
summary:
retention_analysis:
detailed_description:
overall_soundscape:
non_diegetic_music:
```

## Reference Tokens

Number pictures, videos, and audio independently. Use only tokens that actually exist in the current request:

- `<Subject N>`: a reusable character, object, environment, or style definition.
- `<Picture N>`: a concrete image, appearance, composition, or endpoint-frame anchor.
- `<Video N>`: a complete video, motion pattern, editing rhythm, or shot-structure reference.
- `<Audio N>`: an independent audio, vocal quality, dialogue, or rhythm reference.

Never translate, renumber, delete, or invent these tokens. Define reusable subjects in `subject_definitions` before `summary`. Describe visible traits for each subject; do not replace the description with generic preservation language.

## Picture Identity And Video Motion

- When `retention_analysis` assigns motion, timing, pose, action, temporal continuity, or camera trajectory to `<Video N>`, the picture defines the identity and appearance that must appear in the result, while the video defines how that picture subject moves. Read the video frames chronologically and apply the visible pose changes, body motion, action state, timing, and compatible camera trajectory to the shot's `<Picture N>` subject.
- Do not keep the video actor's identity, face, clothing, or body type unless the user explicitly requests it, and do not ignore the video action because the picture is static. If `<Picture 1>` shows an ancient-style woman and `<Video 1>` shows a man sleeping, describe `<Picture 1>` sleeping with `<Video 1>`'s pose and timing; do not leave the woman standing and do not replace her with the man.

## Six Sections

- In `summary`, use applicable task-type prefixes from: `keyframe completion`, `reference generation`, `video editing`, `video continuation`, `audio reuse`, and `audio reference`. Follow the prefix with a short task summary, but do not reduce the production timeline to a plot sentence.
- In `retention_analysis`, state the role of every reference. Visual references use only `fully_preserved`, `partially_preserved`, `attribute_transfer`, or `weak_reference`. Audio references use only `fully_copy`, `partially_copy`, `reference`, or `weak_reference`. State which attributes are preserved, transferred, copied, or only loosely referenced.
- `detailed_description` is the main production specification. Establish overall style, visual tone, and composition first, then write a chronological plan from `[Shot 1]` with visible action, subject state, camera movement, and sound. Place each relevant `<Picture N>`, `<Video N>`, and `<Audio N>` in the shot where it affects the result.
- Use `overall_soundscape` for in-world ambience, action sounds, dialogue, and sound copied or transferred from a referenced audio source.
- Use `non_diegetic_music` only for audience-only score, or `N/A` when there is none.

## Subjects, Speakers, And Timeline

- For 10-30 second outputs, carry references and subject state through setup, development, visible change, result, and ending. Do not use references only in the opening and then introduce an unsupported subject or setting.
- Use roughly 3-5 purposeful shots for 15-30 seconds. Prefer a continuous take or in-shot camera movement when the physical action remains continuous; add cuts for a real viewpoint, information, or target change.

Keep the full appearance description in `subject_definitions`; use the relevant picture tokens directly in shots instead of repeating identity-preservation declarations. Do not merge different picture identities just because clothing, gender, style, or setting looks similar unless the user explicitly says they are the same identity.

Keep speaking or singing sources bound consistently as `<Subject N> (S1)`, `<Subject N> (S2)`, and so on. Put only spoken words inside `<d>[Language] ...</d>`. Use `<scenetrans>` for dialogue continuing across shots and `<cutoff>` for dialogue truncated by the end of the video. In every shot, write visible action first, then `Camera:`, `Dialogue and visible text:`, and `Synchronized sound:`. Keep all timing within the target duration.
