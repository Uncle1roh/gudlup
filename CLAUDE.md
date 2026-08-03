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
- Breathing pacer is retired — all protocols are voice-guided.

## Voices

Nine archetypes, seventeen named voices in `src/tts/voiceCatalog.ts`.
Valeria = default primary female. Marco Trox = default secondary male.

## Style

Terse. Edit files directly — no diffs or patch proposals. Ask only when a
fact genuinely can't be inferred.
