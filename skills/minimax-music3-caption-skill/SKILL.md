---
name: minimax-music3-caption-skill
description: >-
  Structured caption and lyrics authoring guide for MiniMax Music 3 (MiniMax-Music3 preset) in SimpAI Studio.
  Use when writing or optimizing music style captions (Global Metadata / Vocal Details / Arrangement),
  structuring song lyrics with [Intro]/[Verse]/[Chorus]/[Bridge]/[Instrumental]/[Outro] section tags,
  composing purely instrumental soundtracks, or configuring duration, cfg_scale, top_k, and FLAC/MP3 output.
when_to_use: >-
  Activate whenever the user selects MiniMax-Music3 or asks to compose/generate songs, vocals, guofeng ballads,
  pop/rock tracks, or instrumental background music in SimpAI Studio.
version: 1.0.0
---

# MiniMax Music 3 Caption & Lyrics Skill (`MiniMax-Music3`)

## 1. Input Split Contract (Caption vs. Lyrics)
`MiniMax-Music3` separates musical direction from sung text across two distinct inputs:
1. **`prompt` (Main Prompt -> `MiniMaxMusic3TextEncode.caption`)**:
   - Write an **English three-part structured musical brief** (`Global Metadata`, `Vocal Details`, `Arrangement`).
   - **Never paste or repeat raw lyrics inside `prompt`**—lyrics in `caption` confuse acoustic conditioning and dilute arrangement control.
2. **`scene_additional_prompt` (Lyrics Box -> `MiniMaxMusic3TextEncode.lyrics`)**:
   - Contains **only section tags in square brackets + sung lyrics** in the user's requested language (Chinese, English, Japanese, Cantonese, etc.), or section tags alone for instrumental tracks.
   - Square-bracket section tags (`[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Instrumental]`, `[Outro]`) are **preserved verbatim** by Studio (never expanded as wildcard arrays on `MiniMax-Music3`).

---

## 2. Three-Section Caption Architecture (`prompt`)

Always format `prompt` as three concise paragraphs with explicit headers:

```text
Global Metadata: <genre & subgenre>, <BPM>, <key / scale>, <time signature>, <core mood & sonic aesthetic>.
Vocal Details: <singer gender & vocal range>, <timbre & register>, <phrasing, breath, diction, vibrato, and backing vocal placement>.
Arrangement: <section-by-section instrumentation and dynamic arc from intro -> verse -> pre-chorus -> chorus -> bridge/solo -> outro>.
```

### Section Rules
1. **`Global Metadata`**:
   - Specify concrete genre/fusion (e.g., `Chinese-style Mandopop ballad (guofeng)`, `Mandopop indie pop-rock`, `Cinematic neo-classical ambient soundtrack`, `City Pop / Funk-pop`).
   - Give an explicit tempo (`68 BPM`, `118 BPM`), key or modal color (`D minor`, `F major`, `minor pentatonic`), meter (`4/4`, `3/4`, `6/8`), and emotional trajectory.
2. **`Vocal Details`**:
   - For **vocal songs**: state voice type (`male tenor`, `female mezzo-soprano`, `warm baritone`), microphone/register feel (`close-mic breathy chest voice in verses, open resonant mixed belt in chorus`), language diction (`clear Mandarin diction`), and where harmonies appear (`wordless backing pad only in second chorus`).
   - For **purely instrumental music**: explicitly write:
     `Vocal Details: purely instrumental, no vocals, no spoken words.`
3. **`Arrangement`**:
   - Describe **how instruments enter and evolve across sections** rather than dumping an unordered instrument list.
   - Contrast sparse verses against fuller choruses and specify how the ending resolves (`outro strips back to solo felt piano and room reverb`).

---

## 3. Lyrics & Section Tag Rules (`scene_additional_prompt`)

- Supported structural markers:
  - `[Intro]`
  - `[Verse]`
  - `[Pre-Chorus]`
  - `[Chorus]`
  - `[Bridge]`
  - `[Instrumental]`
  - `[Outro]`
- Keep line lengths singable and rhythmically balanced within matching sections (`[Verse]` 4–8 lines, `[Chorus]` 4–6 lines).
- For **instrumental tracks**, supply structural tags without sung words:
  ```text
  [Intro]
  [Instrumental]
  [Bridge]
  [Instrumental]
  [Outro]
  ```
- Optional brief performance cues in parentheses (e.g., `(softly)`, `(guitar solo)`) may be used sparingly, but avoid prose instructions in the lyrics box.

---

## 4. Recommended Studio Parameters

| Parameter | Studio Key | Recommended Setting | Notes |
|---|---|---|---|
| Max Duration (s) | `scene_video_duration` | `60`–`150` (short/standard), `180`–`300` (full song) | Acts as an upper ceiling (`15`–`360`s); the model naturally concludes when lyrics finish. |
| Caption/Lyric Adherence | `scene_var_number3` (`cfg_scale`) | `1.5`–`1.7` (`1.6` default) | Values above `2.0` can cause strained or shouted vocals. |
| Melodic Variety | `scene_var_number` (`top_k`) | `45`–`55` (`50` default) | `30` = more predictable phrasing; `80+` = more adventurous motifs. |
| Diffusion Steps / CFG | `overwrite_step` / `guidance_scale` | `30` steps, CFG `1.7`, `euler` + `simple` | Clean convergence in 25–35 steps. |
| Tiled Audio VAE | `scene_switch_option1` | `false` (&le;150s), `true` (&gt;150s or &le;16 GB VRAM) | Switches to `VAEDecodeAudioTiled` (`tile_size=1536, overlap=64`) to prevent OOM on long tracks. |
| Output Format | `scene_switch_option2` | `false` = lossless `FLAC`, `true` = `MP3 320kbps` | Single-pass encoding in `SaveAudioWebsocket` with embedded FFmetadata. |

