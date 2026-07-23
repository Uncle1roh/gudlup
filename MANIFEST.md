# Good Loop — build manifest

**Slice: PLAIN render = Studio mixdown · tag/phase pools + random draw
(slice 3)** (current)
- `src/admin/assetPools.ts`: pool model + random draw per the Rules doc
  §7.1–7.2. "Sensible migration" — NO files move: Music phase pools = the
  existing GLOBAL `assets/music/f1…f6` folders; Soundscape tag pools = the
  `assets/soundscape/<texture>` folders + filename tokens, matched to the
  Italian `ambiente` text by an it/en/pt synonym dictionary ("lago calmo" →
  lake, "vento leggero" → wind, "pioggia dolce" → rain); heartbeat ambiente
  → the `assets/heartbeat` pool (Dec. H). POs can add extra draw tags per
  file WITHOUT moving it via the NEW `asset_meta` table (path → tags[]),
  edited inline on soundscape rows in the Asset Library (saved on blur).
  Draws use a seeded RNG (mulberry32): reproducible when the seed is fixed,
  fresh per render otherwise; every draw is reported ("SS-001 drew
  calm-01.mp3 — tag "lago calmo" → 2 candidates").
- `plainToStudioTracks` now takes `{ pools, seed }`: sample clips get the
  drawn file's URL + label (empty pool → silent + note), so "Open in Sound
  Studio" plays the real files; lanes carry a NEW `duck` family marker
  (music / soundscape / none — heartbeat = none).
- `src/admin/renderPlain.ts`: the WAV IS the Studio mixdown — the render
  seeds the SAME project the Studio opens and mixes it through the SAME
  `renderClipBuffer` + `renderMixdownBuffer` + shared FX chain; voice clips
  are ElevenLabs-rendered per clip voiceId (cached per voice+text), baked
  with `bakeVoiceBuffer` + `applyClipShape`. On top, the app-side §8.3
  DUCKING: Music −10 dB / Soundscape −6 dB under active voice, attack
  200 ms / release 500 ms, computed from the voice-clip WINDOWS (no
  detector needed — we know the timeline); voice, entrainment and heartbeat
  never duck. Implemented as a NEW optional `gainAutomation` on `MixTrack`
  (a second gain node — the Studio's own export path is untouched). 90 s
  preview supported.
- PlainImport is now the full vertical: review → seed Studio → Publish
  (CatalogProtocol with the full timeline in the NEW `protocols.plain`
  jsonb column — re-renderable from catalog data; existing
  spec/datasheet/assetMap on the same code are preserved) → Render WAV
  (version chips, preview + voice toggles, VoiceEnginePanel, live progress,
  draw + ducking notes) → Download / Upload & attach (192 kbps MP3 via the
  shared attach path — the exact file that streams in the employee app).
  Attach requires a published protocol and a FULL render.
- `supabase/setup.sql`: adds `protocols.plain` (+ defensive alter) and the
  `asset_meta` table with RLS (read: signed-in; write: admins). Validated
  against a real Postgres 16 (auth schema + roles stubbed): clean on a
  FRESH database and idempotent on a second run; columns + policies
  verified present.
- Verified: `tsc --noEmit` + `npm run build` clean; node proof
  `tools/test-plain-pools.ts` (esbuild-bundled) → synonym mapping, pools
  (f1×2/f3×1, 5 soundscapes, 1 heartbeat), draws ("lago calmo"→lake,
  heartbeat→heartbeat pool, asset_meta tag "fabbrica" reaches its file,
  empty pool→null), seeded reproducibility, duck envelope math (attack
  10.0→10.2 s to −10 dB, release 20.0→20.5 s back to 1, window merging),
  and the pools-integrated seed on the real GL-ANX 1.1 (SS-1 lake URLs,
  MUS F1/F3 drawn + 4 silent phases, duck families, identical draws for
  identical seeds). Slice-1 and slice-2 proofs re-run: ALL PASS.
- Notes: a re-render draws fresh files BY DESIGN (the Rules doc's session
  variability); fix the seed for reproducibility. Loudness normalization /
  true-peak / <70 dB SPL ceiling (§9) stay on the Renderer-v3 backlog.

**Slice: PLAIN → Sound Studio seeding, 1 row = 1 clip (slice 2)**
- `src/admin/plainStudio.ts`: `plainToStudioTracks()` seeds the Studio from a
  parsed PLAIN version — every Excel row becomes exactly ONE clip on a track
  named from `traccia`, in file order. Binaural → carrier (L+R)/2 + beat
  R−L; Solfeggio → binaural clip with beat 0 (house convention); Bilateral →
  intervallo/blip + NEW `panAmp` param (pan_ampiezza/100, engine honors it);
  Soundscape/Music → silent SAMPLE lanes labeled with the tag / phase pool
  (slice 3 wires the random draw). Voice: archetipo+modalità → catalog voice
  (Dec. 6: sussurrato prefers a same-gender Whisper voice — Paterna
  sussurrata → Thomas); riverbero_pct → track Reverb; velocità wpm → ×speed
  (130 wpm baseline, noted); hard-L/R tracks get the track CHANNEL with clip
  pan 0.
- Two documented lane splits keep row↔clip 1:1 while respecting track-level
  FX: linea clips with eco=on ride "<traccia> · eco" (Emotional Echo
  pre-enabled, delay/mix from eco_ritardo/eco_volume); a loop clip expands
  on "<traccia> · loop (<set>)" — one clip per affirmation per cycle at
  `intervallo` spacing, `attenuazione_ciclo` dB per cycle, 1s/2s default
  envelope per the Rules doc, echo/reverb inherited. Every seeding decision
  is returned as a note and shown in the review screen.
- Volume model: guide voice 0 dB ≙ fader 0.8; each track's fader = its
  LOUDEST clip's nominal dB; per-clip differences ride NEW `Clip.gainDb` +
  Excel `fade_in/fade_out`, baked into the clip's rendered buffer by
  `applyClipShape()` (multitrack.ts) — waveform, realtime playback, cut/glue
  and WAV mixdown all see the same shaped audio, zero scheduler changes.
  Applied across doRender, rebakeVoice, ♪ Synthesize and "All voices";
  Inspector shows a read-only "from the protocol Excel" line on shaped clips.
- **Bug fix:** the Studio voice ▶ Preview now speaks with the CLIP's voice
  (voiceId passed through to the TTS provider) instead of the default.
- PlainImport review screen: "Open in Sound Studio →" per version (disabled
  while errors exist) seeds the project, lists the seeding decisions, then a
  second click navigates — nothing is hidden behind the tab switch.
- Verified: `tsc --noEmit` + `npm run build` clean; node proofs
  (esbuild-bundled): `tools/test-plain-studio.ts` against the real GL-ANX
  1.1 → 13 tracks / 82 clips (70 rows + 12 loop expansions), SS-1 fader
  −6 dB with the −14 dB coda offset, MUS-1 −6 dB with two −12 dB F1–F2
  offsets, BIN-1 205/10 Hz + −9 dB second clip, SOL-1 432 Hz beat 0, BIL-1
  400 Hz·4 s·panAmp 1.0, VOX-C 33 clips Valeria + Reverb 30%, loop 12 clips
  @20 s with echo −8 dB/+2 s, VOX-L/R channels L/R, eco lane VR-009/010,
  Dec. 6 voice matrix; `tools/test-shape.ts` → applyClipShape gain/fade math
  numerically exact, no-op passthrough returns the original buffer; slice-1
  parser test still ALL PASS.
- Next slice: render = Studio mixdown; Asset Library tags + phase pools
  (Supabase migration from f1–f6) + random draw filling the sample lanes.

**Slice: PLAIN Timeline importer + validation (slice 1 of the clip-level
format)**
- NEW recommended import path per the "Rules for Good Loop protocols" doc
  (Dec. A–H, §5–§8): `src/admin/plainTimeline.ts` parses the README /
  per-version clip grids / Affermazioni workbook — one row = one clip, six
  track types (Soundscape · Music · Binaural · Bilateral · Solfeggio ·
  Voice), all 36 columns typed. Numeric `start_s`/`end_s` are authoritative;
  `m:ss` cells are cross-checked only. Banner + TOTALE/DURATA footer rows
  skipped; Binaural beat derived (carrier_R − carrier_L); loop sets
  (`CSI-01..12`) resolved against the Affermazioni sheet in `ordine_loop`
  order. The 3 extra Affermazioni columns (`ordine_loop`, `bilaterale_lato`,
  `eco_keyword`) are kept and flagged to POs via an info issue.
- Validation per the Rules doc: required fields per type, pan −100..+100,
  `crossfade_prec_s` only on Soundscape/Music, same-track overlaps beyond
  their crossfade, Binaural XOR Solfeggio (error, binding §8.5 r.5), §8.0
  phase-window warnings (Binaural in F3–F4, Solfeggio in F4, Bilateral
  outside F4), loop-fits-window check, declared TOTALE/DURATA cross-checks,
  8 ⊂ 12 ⊂ 20 subset sanity. Retired concepts (breathing pacer, key/BPM
  metadata, synth beds) simply don't exist in the vocabulary; heartbeat is a
  Soundscape clip with an "heartbeat" ambiente (Dec. H, info note).
- Import hub: `.xlsx` files are probed for the PLAIN shape FIRST (header row
  with clip_id/traccia/tipo/start_s/end_s — legacy Scheda Dati/Unica can't
  match it) and routed to the new `PlainImport.tsx` review screen: identity,
  per-version phase map + duration, tracks with clip counts per type, the
  affirmation database, and all issues by severity. The formats panel now
  shows PLAIN as the ⭐ recommended card (full-width); Scheda Unica and the
  multi-sheet workbook remain fully supported and unchanged.
- Verified: `tsc --noEmit` + `npm run build` clean; node proof
  (`tools/test-plain.ts`, esbuild-bundled) against the real
  `GL-ANX_1_1_Standard_12min_Timeline_PLAIN.xlsx`: 71 clips (7 SS · 6 MU ·
  2 BI · 1 BIL · 1 SOL · 54 VC) on 11 tracks, 6 README phases (F4 =
  5:30–9:30), BI-001 200/210 → 10 Hz, VC-019 loop → 12 ordered CSI IDs,
  12 affirmations with the extra columns, 0 errors/warnings, garbage bytes
  rejected.
- Next slices: Studio seeding 1:1 (+ clip-voice Preview fix), render =
  Studio mixdown, Asset Library tags + phase pools with random draw.

**Fix: voice tracks — function first, side second**
- Regression fixed: ECO/SUSSURRO rows on L/R (e.g. GL-ANX 1.2's right-side
  whispers) were being absorbed into the RIGHT track at 72% volume, deleting
  the echo lane. Now the split is by FUNCTION first: "Voice — guide" and
  "Voice — echo & whisper" (32%, side kept as clip pan) ALWAYS exist;
  "Voice — LEFT/RIGHT" appear for the version's principal dichotic VOCE/LOOP
  rows only. Verified via node seed test on 1.2 (6/12 min).

**Fix: Studio v2 corrections (PO feedback)**
- **L/R visible**: dichotic rows now seed onto dedicated "Voice — LEFT" /
  "Voice — RIGHT" tracks with the track CHANNEL set (clip pan 0 — the track
  positions the side); fine pans (L25) stay per-clip on the guide track.
  CORO rows get their own "Voice — CORO (refrain)" track with the Harmonizer
  PRE-ENABLED (seed now carries channel + effects).
- **Honest percents**: the Solfeggio track volume equals the doc's percent
  (528 Hz al 15% → 15%), via DsMix.solfeggioPct.
- **Session fades present**: ### MIX fade in/out (defaults 2 s/3 s) ride the
  master in Export WAV and Attach (mixdown gain ramps); the live transport
  stays un-faded for editing.
- **No more synth music/soundscape ANYWHERE**: the Studio seeds only the
  library sample tracks (empty "map files in the Asset Library" lanes when
  unmapped), and Renderer v3 plays only mapped f1–f6 files — unmapped phases
  are silent with an explicit note. synthPad/texture fallbacks deleted; the
  excel's MUSICA section is metadata only (validation message softened).
  Bowl/heartbeat synth provisionals stay until the PO files arrive.

**Slice: Studio v2 + audio polish**
- **Per-row voices reach the Studio**: datasheetToStudioTracks rebuilds the
  voice tracks straight from the datasheet rows — every clip carries its OWN
  voiceId (row Voce → catalog; [M] → protocol secondary; default otherwise),
  fine pan (L25 etc.) and speed. "Synthesize all" now speaks each line with
  its right voice (this was the "all audios have the same voice" bug — the
  old seed dropped the voice column).
- **v2 layers visible in the Studio**: binaural CURVE seeded as per-phase
  clips (e.g. 10 Hz → 7 Hz → 10 Hz, editable clip by clip); "Solfeggio N Hz"
  track (binaural clip with beat 0 = pure tone both channels); "Breathing
  pacer" track with breath clips per RESPIRAZIONE row (rate derived from the
  pattern timings).
- **Audio polish ("sounds weird")**: breathing pacer rebuilt — darker
  breath-like band (300–480 Hz + low-pass 900), eased swell envelopes, level
  −18→−24 dB (was reading as wind static); solfeggio now a pure sine (the
  triangle's harmonics clashed with the music bed), capped at −14 dB
  regardless of the doc percentage; continuous whisper now follows the
  datasheet's [M] voice (was the engine secondary).

**Slice: Scheda Unica v2 — the 7 gaps closed**
Pattern analysis across ALL 8 Italian protocols + the 9 in-depth technique
docs ("112 techniques 9 tools") drove a format+engine upgrade:
- **Binaural curve per phase**: FASI gains a Binaural column ("Theta 7 Hz
  (rampa 90 s)") — the renderer ramps the beat per phase and back (curves
  like Alpha 10→Theta 7→Alpha 10 now render as documented). Legacy Deep
  Theta transition still works when no curve is declared.
- **### MIX section**: per-protocol music/soundscape/binaural offsets,
  solfeggio layer (432/528/396 Hz continuous, % or dB), tipo battimento
  binaural/ISOCRONICO (amplitude-pulsed carrier — works without headphones),
  phase crossfade, session fades, eco loop vs eco dicotico (delay+gain),
  whisper gain, bilateral volume % + blip ms. All optional; engine defaults
  otherwise.
- **### RESPIRAZIONE**: guided breathing pacer rows (pattern catalog:
  Sospiro Fisiologico, 4-7-8, Coerente 5-5/6-6, Box, 4-4-6[-2], Cyclic
  Sighing, or any numeric sequence) — rendered as band-passed air swells
  (rising inhale / falling exhale) at −18 dB in the declared phase.
- **TIMELINE v2**: columns matched BY HEADER (order-independent); Canale
  accepts fine pans (L25/R40); optional Effetto (CORO = harmonized chorus on
  that row, ECO = extra delayed copy) and Velocità (pitch-preserving speed)
  columns.
- **### TECNICHE / ### NOTE**: documentary sections preserved verbatim on
  the protocol and summarized in the review screen ('#' ids no longer eaten
  by the comment rule — only '//' comments).
- **Admin UI**: import hub explains both accepted formats (Scheda Unica
  recommended card + legacy multi-sheet); review screen shows v2 facts
  (voices, curve, solfeggio, isochronic, breathing, MIX) and preserved
  sections. Sign-out buttons get a solid contrasting background
  (b2b-btn--signout) in admin + employer.
- Deliverables: GL_Scheda_UNICA_TEMPLATE.xlsx (v2, guided) and
  GL-STRESS-4_3_Scheda_UNICA.xlsx (flagship example: curve, MIX per the doc,
  8 breathing rows, CORO refrain at 10:00, Cornelio as [M] wise voice) —
  both validated through the shipped parser with zero issues.

**Slice: single-tab datasheet ("Scheda Unica") + per-row voices**
- `datasheet.ts` — new SINGLE-TAB import format: one sheet, sections marked by
  `### NAME` rows (PROTOCOLLO · PARAMETRI · VERSIONI · FASI · TIMELINE ·
  AFFERMAZIONI · MUSICA), `//` comment rows ignored. The TIMELINE section is
  unified (Versione column instead of three sheets), has NO Fase column
  (derived from the FASI windows by time), and its Voce column accepts a
  catalog voice NAME, an archetype word, or F/M. AFFERMAZIONI gains Versioni
  ("6,12,24") and per-affirmation Voce columns. PROTOCOLLO block carries
  "Voce predefinita" / "Voce [M] predefinita". Multi-sheet workbooks still
  import unchanged (shared finishValidation). Stub rows (only Versione+Tempo
  filled) are skipped, not flagged.
- `renderDatasheet.ts` — per-row voice resolution, most specific wins:
  row Voce → affirmation Voce → protocol defaults → Invarianti archetype →
  engine defaults (Valeria/Marco). Render notes list row-level voices used
  and warn on names that don't match the catalog.
- Deliverables: GL_Scheda_UNICA_TEMPLATE.xlsx (guided template) and
  GL-ANX-1_3_Scheda_UNICA.xlsx (real example, validated: 43/57/86 timeline
  rows, defaults Valeria/Marco Trox, 8 named-voice rows, zero issues).

**Fix: type-exact values + time scrubbing**
- **Every numeric value is click-to-type**: the shown value (dashed underline)
  on Inspector sliders, track volume %, and all FX params becomes an input on
  click — type "83", "0.83", "83%", "-6 dB", comma decimals; Enter/blur
  commits, Esc cancels; clamped to the param range ("%"/bare-number shorthand
  on 0..1 params).
- **Time**: the current-time readout in the top bar is click-to-type
  ("3:45" or plain seconds) and the RULER now scrubs — press and DRAG to
  slide the playhead (pointer-captured). While playing, the playhead follows
  instantly and the transport restart is debounced (90 ms) so scrubbing
  doesn't stutter.

**Slice: track effects (FX chain)**
- New `src/studio/effects.ts` — five effects, PO list included:
  · HARMONIZER (Coral/Multiple voice): pitch-shifted copies (resample + WSOLA
    stretch-back, duration preserved) layered around the original with stereo
    spread + optional octave layer → one voice reads as a chorus. Processed
    OFFLINE per clip, cached per source+params; clips play their harmonized
    buffer transparently (fxBuffer) in transport and mixdown.
  · EMOTIONAL ECHO: delay + feedback with warm low-pass on repeats.
  · REVERB: convolver with generated exponential-decay impulse (cached IRs).
  · SATURATION: soft tanh waveshaping, warmth → distortion by drive.
  · FILTER: low/high-pass tone shaping.
- ONE chain builder serves the realtime player AND the offline mixdown
  (identical nodes) — editing sound == exported sound. Chain order:
  harmonized clips → saturation → filter → echo → reverb → gain → pan.
- UI: FX button on every track header (active-count badge) → drawer with
  metadata-driven cards (enable + sliders per effect). Effects apply LIVE
  during playback via the hot-swap (signature includes the FX chain).
- MixTrack/SchedTrack carry `effects`; Track model + attach/export wired.

**Fix: Italian default · voice migration + datasheet voice spec · volume UX**
- **Default locale = Italian** (`src/i18n`): the env override (VITE_DEFAULT_LOCALE)
  still wins; the fallback was ''en''. Users who previously picked a language
  keep their saved choice (localStorage) — switch once in the selector.
- **Legacy voice migration**: saved voice ids that are NOT in the PO catalog
  (e.g. the old male primary) are treated as unset → Valeria/Marco take over
  automatically, in the provider AND in the panel preselects. No user action.
- **Datasheet voice specification**: the Invarianti rows "Voce primaria /
  secondaria" now RESOLVE to catalog voices by explicit name ("Valeria") or
  archetype keyword (materna/paterna/sussurrata/saggio/neutra/guerriero/
  ombra/rituale/bambino, it·en·pt, [F]/[M] gender filter). Renderer v3 uses
  them per row; unspecified → engine defaults. Render notes state which
  voices were used and why.
- **Track volume UX**: dedicated full-width volume row per track header
  (lane height 86→104), 0.5% slider steps, mouse-wheel ±1% fine adjust,
  live % readout.

**Slice: PO voice catalog baked in (no more voice IDs)**
- New `src/tts/voiceCatalog.ts`: the definitive PO list — 9 archetypes
  (Maternal, Paternal, Wise/Mentor, Neutral, Warrior, Shadow, Ritual,
  Interior Kid, Intimate/Whispered), 17 named ElevenLabs voices with their
  ids. Defaults: Valeria (F · Maternal) = the standard engine voice;
  Marco Trox (M · Paternal) = the [M] Deep double-induction voice.
- Voice Engine panel rewritten: API key + two catalog dropdowns grouped by
  archetype — NO voice-ID fields, no "Load voices". Key alone is enough;
  voices default from the catalog (settings/env stay backward compatible).
- Studio per-clip Voice picker now offers the built-in catalog by archetype
  (replaces the account-roster mechanism).
- CORAL/MULTIPLE (Harmonizer) and EMOTIONAL ECHO are documented in the
  catalog module as EFFECTS (roadmap; the engine's −8 dB/+2 s echo stacking
  already covers Emotional Echo's core behavior).

**Slice: playback audit · voice roster · in-Studio asset picker**
- **Real audio everywhere (audit)**: confirmed by architecture — the data
  provider hydrates the shared protocol registry from the catalog at startup
  (provider.tsx), every picker reads that registry, and all three players
  (B2C SessionRunner, ImmersivePlayer, therapist MonitoredSession) play
  `version.audioUrl['pt-BR']` when attached, placeholder otherwise. Attaching
  audio in admin makes it selectable and playable on every surface.
- **Voice roster (9 PO voices)**: 🎙 → Load voices now SAVES the account's
  voice roster (localStorage). Every voice clip's inspector gains a Voice
  dropdown: Default (engine voice) + the roster. Changing a rendered clip's
  voice clears its TTS take (a different voice = a new render — ♪ or
  "All voices" picks it up); pan/speed keep re-baking instantly. voiceId flows
  through TtsOptions → ElevenLabs (explicit voiceId > secondary > primary),
  and "Synthesize all" caches per voice+line.
- **In-Studio asset picker**: sample clips' inspector now browses the whole
  library (music grouped by phase, soundscapes by texture) and swaps THIS
  clip's file on pick — the protocol's per-phase default mapping stays in the
  Asset Library, as before. ＋ Track → "Audio file" + picker = free-form
  library clips anywhere.

**Fix: Studio layout + cross-track clip drag**
- **Toolbar** no longer clips off-screen: it wraps to a second row when
  narrow; proper `.mt-tbtn--wide` class replaces the oversized ad-hoc buttons
  ("♪ All voices", "✂ Cut", "🩹 Glue" now single-line, compact); project-name
  field yields space; tighter master/time groups; disabled states dimmed.
- **Track headers** widened (236→254 px) so M · S · L/C/R · volume · ＋ sit
  comfortably in one row.
- **Cross-track clip drag**: while moving a clip, dragging it up or down into
  another lane of the SAME track type carries it over (e.g. a guide voice clip
  down to "Voice — echo & whisper"); works for every type, live during
  playback, selection follows the clip. Different-type lanes reject the hop.
  Bottom hint documents it.

**Fix: pitch-preserving voice speed**
- New `src/studio/timestretch.ts`: native WSOLA time-stretch (40 ms Hann
  frames, 50% overlap-add, waveform-similarity alignment on the mono mix,
  same offsets applied to both channels). `bakeVoiceBuffer` stretches the TTS
  source instead of using playbackRate — the ×0.7–×1.4 voice speed slider now
  changes speed WITHOUT changing pitch.
- Validated numerically: output duration exact at every rate, pitch drift
  ≤ 0.02% (zero-crossing rate), amplitude preserved; worst case (8 s line at
  ×0.7) stretches in ~160 ms — still effectively instant in the UI.

**Slice: Studio editing overhaul (PO feedback)**
- **Live editing** — the transport now HOT-SWAPS while playing: any parameter
  re-render, drag, cut/glue, or synthesized voice landing reschedules playback
  at the current playhead, so volume/frequency/pan edits are audible
  immediately (previously sources were scheduled once at play, making every
  edit seem broken until stop/play).
- **Track channel L/C/R** — every track header has an L·C·R selector; the whole
  track is stereo-positioned live and in the mixdown/attach (per-clip voice pan
  still available on top for fine placement). New StereoPanner per track in
  MultitrackPlayer + pan in MixTrack.
- **✂ Cut** — splits the selected clip at the playhead into two pieces by
  SLICING the rendered buffer (periodic layers stay phase-continuous; TTS
  voices stay intact — no re-render). Pieces are "frozen": movable and
  re-cuttable, param/length edits blocked with a hint.
- **🩹 Glue** — merges the selected clip with the next clip on its track into
  one frozen clip; any gap becomes silence inside it (guard at 60 s).
- **Voice speed** — ×0.7–×1.4 slider; re-bakes the rendered voice instantly
  from its TTS source (no new API call), clip length follows the voice. Pan
  edits on rendered voices likewise re-bake instantly.
- Player/mixdown now honor clip durationSec (start(when, offset, duration)) so
  cut/trimmed clips can never overhang their timeline length.

**Fix: overall mix loudness + Studio batch voice synthesis**
- `renderDatasheet.ts` — **master makeup gain**: soft TTS voices (measured ref
  RMS 0.060 in the field) dragged the WHOLE mix down, since every layer follows
  the measured voice. The master now lifts the mix so the voice lands near
  −17 dBFS; all documented layer offsets ride along unchanged (binaural bed
  back at proper presence). New render note lists every psychoacoustic layer
  of the version with its state ("bilateral OFF by design" for 6-min etc.) so
  what was scheduled is auditable at a glance.
- `SoundStudio.tsx` — **"♪ Synthesize all voices"** in the top bar: renders
  every voice clip that has text and no voice yet, sequentially, one TTS call
  per unique line (cached), with progress and per-clip error reporting.

**Fix: music asset listing (flat layouts)**
- `assets.ts` — the music lister accepted ONLY the `assets/music/f1..f6/`
  folder layout, while soundscapes tolerated flat files too. Flat music files
  (`assets/music/f1_track.mp3` or unprefixed) were invisible → unmappable →
  synth-only music in renders AND in the Studio while soundscapes worked.
  Music now also lists flat files (phase from the `f1_`/`f2-` name prefix;
  unprefixed files appear in a "No phase prefix" group, selectable for any
  phase). `AssetLibrary.tsx` shows that group and clearer empty-state hints.

**Fix: silent music/soundscape in v3 renders + real assets in the Studio**
- `renderDatasheet.ts` — v3.1 **loudness-measured gain staging**: the PO files
  are already normalized (music −18 LUFS, soundscapes −24 LUFS) and the fixed
  "−18/−20 dB vs voice" gains attenuated them a second time (≈ −36/−46 dBFS —
  inaudible). The renderer now measures the RMS of every decoded asset and of
  the rendered voice and gains each layer to its documented offset relative to
  the MEASURED voice loudness (binaural and file-based heartbeat/bowl too).
  Also: spec-compliant curve automation (no events coincident with
  setValueCurveAtTime ranges — undefined/throwing behavior across browsers).
- `DatasheetImport.tsx` — the render (and publish) now re-reads the protocol's
  saved assetMap right before running, so mapping assets in the Asset Library
  AFTER importing takes effect without re-importing; publish never clobbers a
  saved mapping with undefined.
- **Studio real audio**: new `sample` clip type in `multitrack.ts` (plays a
  real library file, looped to clip length, fetched+decoded once per URL, with
  waveforms and realtime playback like any clip). `datasheetToStudioTracks`
  in `specStudio.ts` seeds Music/Soundscape SAMPLE tracks per mapped phase
  (synth kept only for unmapped gaps); "Edit in Studio" on a datasheet uses it
  with the freshest mapping. Voice clips still synthesize per clip via the ♪
  button (existing Studio behavior). A failed file fetch renders the clip
  silent with a "load failed" label instead of crashing.

**Fix: publish hang in the importers**
- `DatasheetImport.tsx` / `SpecImport.tsx`: `publish()` and `markReady()` had
  no error handling — any `saveProtocol` failure (most commonly the database
  missing the new `protocols.datasheet` / `asset_map` columns because the
  updated `supabase/setup.sql` hadn't been run) left the button stuck on
  "Publishing…" forever. Both now catch, reset `busy`, and show the error
  inline with an actionable hint (run setup.sql / sign in as admin). A failed
  audit write no longer blocks the flow after a successful save.

**Slice: Secondary [M] voice (Deep double-induction)**
- `src/tts/settings.ts` — optional `voiceIdSecondary` in the saved keys
  (backwards-compatible with existing localStorage).
- `src/tts/types.ts` — `TtsOptions.voice: 'primary' | 'secondary'` +
  `TtsProvider.hasSecondaryVoice`.
- `src/tts/elevenlabs.ts` — routes `voice: 'secondary'` to the [M] Voice ID,
  falls back to primary when unset.
- `src/tts/index.ts` — settings-first, env fallback `VITE_ELEVENLABS_VOICE_ID_M`.
- `src/tts/VoiceEnginePanel.tsx` — second Voice ID field (dropdown after
  "Load voices"), "▶ Test M" button (Italian double-induction line), F+M badge.
- `src/admin/renderDatasheet.ts` — [M] jobs (Storia B rows, `Voce = M`) render
  with the secondary voice; per-voice TTS cache; render notes now say whether
  the male voice was used or fell back.
- `.env.example` — documents `VITE_ELEVENLABS_VOICE_ID_M`.
Verified: `tsc --noEmit` + `npm run build` clean; no callers outside `src/tts`
touch the changed signatures.


**Slice: Asset Library · Datasheet Importer · Renderer v3** (current)

## What this slice adds
1. **Asset Library** (admin → Asset library): browses the PO's produced audio in
   `protocol-audio/assets` — music by phase F1–F6, soundscape loop textures by
   type, heartbeat/bowl once delivered — with in-place preview, and a per-protocol
   **phase → asset mapping** (music stem + soundscape texture per phase, plus
   heartbeat and singing-bowl file pickers) saved on the catalog entry
   (`protocols.asset_map`).
2. **Datasheet Importer** (admin → Protocol catalog → Import → pick the .xlsx):
   parses the Protocol Datasheet workbook (GL-ANX 1.3 format — Protocollo,
   Invarianti, Versioni, Fasi, Timeline_6/12/24min, Affermazioni, MappaMusicale,
   Asset, LayerEngine), validates with explicit issues, publishes the datasheet +
   a derived legacy spec to the catalog (`protocols.datasheet`). Timelines still
   "DA COMPILARE" import fine and are flagged **timeline pending**.
3. **Renderer v3** (`renderDatasheet.ts`): executes the datasheet with the real
   assets — music stems per phase per MappaMusicale with equal-power crossfades
   at phase boundaries and loop seams; looping soundscape textures; NEW heartbeat
   layer (60 BPM sub-audio lub-dub, −24/−20 dB, F2–F4; synth until the PO file is
   mapped); NEW singing-bowl layer (synth inharmonic strike; timeline BOWL rows +
   "Transizioni / F3 ogni 30 s" schedule); per-version affirmation fades
   (1.0/2.0 · 1.5/2.5 · 1.5/3.0 s); REC sub-sets per version; 600 Hz/100 ms
   bilateral (every 4 s Std / 3 s Deep, loop phase); Deep-only Theta 6 Hz in F4
   and dichotic/double-induction fallback when a timeline lacks L/R rows.
   Session streaming copies now encode at **192 kbps** MP3 (was 128).

## New / rewritten files
`src/admin/{assets.ts, AssetLibrary.tsx, datasheet.ts, DatasheetImport.tsx,
renderDatasheet.ts}` (new) · `src/admin/{AdminApp.tsx, ImportProtocol.tsx,
attachAudio.ts}` · `src/data/{catalog.ts, supabase.ts}` · `supabase/setup.sql`
(adds `protocols.datasheet` + `protocols.asset_map`; also fixes the protocol
column alters running before `create table protocols` on a fresh database) ·
`src/index.css` · new dependency: `xlsx` (lazy-loaded only when a workbook is
parsed — split into its own chunk).

## Verified
- `tsc --noEmit` clean; `npm run build` clean (xlsx code-split, 429 kB own chunk).
- Parser run against the real `GL-ANX-1_3_Scheda_Dati_Protocollo_1.xlsx`:
  all three version columns parse exactly (loop 12/20/24 s, fades 1.0/2.0 ·
  1.5/2.5 · 1.5/3.0, REC ×8/12/20, stacking none/echo/triple, bilateral
  600 Hz/4 s · /3 s @100 ms, heartbeat −24/−20 dB F2–F4, whisper −12 dB F4,
  dichotic 15×4 / 12×8 / 12×16 DI, Theta 6 Hz F4); 6-min timeline → 43 rows →
  35 voice jobs incl. 11 loop-faded + 3 repeats at −3 dB; bowl strikes at 0:02
  and 5:55; 12/24-min correctly flagged timeline-pending.
- `supabase/setup.sql` validated against a real Postgres 16: clean on a FRESH
  database and idempotent on a second run; all four catalog columns present.

## Renderer v3 flow (admin)
1. Asset library → pick the protocol → assign a music stem + soundscape per
   phase (+ heartbeat/bowl files when the PO delivers) → Save.
2. Protocol catalog → Import → the datasheet .xlsx → review → Publish.
3. Render stage: pick a version (pending timelines are disabled), 90 s preview
   or full, voice on (ElevenLabs, Italian) → Render WAV (v3) → Upload & attach
   (192 kbps MP3) → the exact file streams in the employee app + monitored
   sessions.

## Still pending after this slice
- Timeline_12min / Timeline_24min conversion into the datasheet (workbook side).
- PO deliverables: singing-bowl + heartbeat files (drop into
  `assets/bowl` / `assets/heartbeat`, then map them — the synth provisionals
  swap out automatically), music license confirmation.
- Remaining protocol docs → datasheets.
- Second (male) TTS voice for the Deep double-induction rows — currently
  rendered with the primary voice and flagged in the render notes.
