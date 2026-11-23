# Good Loop — working rules

## Stack

Vite + React 18 + TypeScript (strict), custom CSS, Supabase (São Paulo),
ElevenLabs TTS, Vercel (hash routing — no SPA rewrite config needed).

## Hard rules

- NEVER extract or reference `goodloop-admin-slice` — superseded snapshot.
- `tsc --noEmit` must pass before any commit. Vite prod build must succeed.
- Keep `package-lock.json` in sync: run `npm install` after any dep change.
- Supabase schema changes require `notify pgrst, 'reload schema';` in setup.sql.
- Default UI locale is Italian. DASS-21 items stay in English (pending
  validated clinical translations).
- Good Loop is a MITIGATION tool only. Never imply psychosocial risk
  assessment or employer risk-register output.
- NR-1 reporting: aggregates only, k-anonymity suppression. No individual
  records reach the client (NR-1 + LGPD requirement).
- Publishing or editing ONE time signature (6/12/24 min) of a protocol must
  never disturb the others — their timeline, Studio session and attached audio.
  Read per-duration material through `plainFor` / `studioFor` / `mergedPlain`,
  never the legacy `plain` / `studio` fields. See `docs/PROTOCOL_CATALOG.md`.
- `title` is the CLINICAL name; `publicTitle` is the non-therapeutic one a
  person reads. Patient-facing screens print `patientTitle()`. Tags are
  editorial only — never a clinical claim, never a routing decision.

## Audio engine

- PLAIN Timeline Excel is the canonical protocol format: one row per clip,
  six track types (Soundscape, Music, Binaural, Bilateral, Solfeggio, Voice).
- `volume_db` is literal gain, −60…+12 dB, audio-taper faders. Source
  normalization is upstream (POs), not in the engine.
- Crossfades are real clip overlaps with equal-power sin/cos ramps.
- Signal order: EQ → calibration → fades.
- Music assets −18 LUFS, soundscapes −24 LUFS. Master to −16 LUFS with
  −1 dBTP true-peak limiter (BS.1770-4).
- Music/soundscape drawn randomly from tagged asset pools, not fixed phase maps.
- Excel `fx` column activates the Studio rack (eco / riverbero / coro /
  saturazione / filtro) per track; `sequenza` places a non-uniform loop.
  Grammar in `docs/EXCEL_FX.md`.
- Breathing pacer is retired — all protocols are voice-guided.
- In `assets/heartbeat` and `assets/bowl` the FILENAME decides which pool a
  file joins, not the folder — the live library keeps every singing bowl in
  the heartbeat folder (`specialKind` in `src/admin/assets.ts`).

## Voices

Nine archetypes; the live list is the connected account's own voices
(`src/tts/voiceCatalog.ts`). Defaults: ITA Maternal (primary) and ITA Paternal
(secondary), read from the registry — never hard-coded ids.

The ElevenLabs account is ONE and fixed in the code: `ACTIVE_ACCOUNT_ID` in
`src/tts/voiceAccounts.ts` (goodloop — Giovanni Bartegno). Never point the
engine at another workspace, and never hard-code an id of the legacy account:
its ids stay in the registry only so old protocols resolve to their twins.

## Style

Terse. Edit files directly — no diffs or patch proposals. Ask only when a
fact genuinely can't be inferred.
