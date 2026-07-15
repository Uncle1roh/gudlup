# Good Loop — build manifest

**Fix: publish hang in the importers** (current)
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
