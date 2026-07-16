# Good Loop — build manifest

**Fix: pitch-preserving voice speed** (current)
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
