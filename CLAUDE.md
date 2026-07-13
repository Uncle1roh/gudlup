# Good Loop — project guide for Claude Code

This file orients you (Claude Code) to the project. Read it before making changes.

## What this is

Good Loop is an audio-based wellbeing platform launching in Brazil (patent
IT 102017000097567). A session is guided sound — binaural tones, dichotic
affirmations, soundscapes, breathing pacing — structured into six therapeutic
phases. The product is, underneath, one parameterized audio-composition engine
wrapped in a clinical/CRM platform.

This repo is the **B2C self-use app** plus a **Sound Studio** for composing the
audio. A separate B2B telemedicine product comes later.

## How we work

The human is a coder acting in a support role; the build is done in **vertical
slices** that each run and can be tested, then extended. Keep every change
runnable. Architect for the full platform, ship one slice at a time. Don't
introduce a backend, auth, or heavy dependencies until a slice actually needs it.

## Stack & conventions

- Vite + React 18 + TypeScript. No UI framework — custom CSS for a distinctive,
  on-brand look. Mobile-first PWA (native wrapper later).
- Design system + all styling live in `src/index.css` (design tokens, the
  breathing-orb signature, the Studio styles, brand tokens).
- Core data model: `src/types/domain.ts` — `Protocol`, `ProtocolVersion`,
  `SessionPhase`, `MoodCheck`/VAS, `MicroIntakeResult`, `SessionRecord`. This is
  the contract everything shares; extend it rather than inventing parallel types.
- Run: `npm install && npm run dev` (server is exposed on the LAN for phone
  testing). Routes: `/` = consumer flow, `/#studio` = Sound Studio.

## Map

```
src/
  types/domain.ts      core data model
  data/protocols.ts    6-phase structure + seed protocols + first-session routing
  lib/vas.ts           emoji <-> hidden VAS (RN-UX-04: clinical data is never shown as a number)
  lib/audio.ts         B2C player: stereo test tones + pre-rendered-file player (synth fallback)
  lib/engine.ts        Sound Studio engine: layered graph, live preview, offline render-to-WAV
  lib/wav.ts           AudioBuffer -> WAV encoder
  components/          BreathingOrb, EmojiScale
  screens/             Welcome, MicroIntake, StereoCheck, ImmersivePlayer, PostSession
  studio/SoundStudio.tsx  the customization UI
  App.tsx              hash route -> SoundStudio or the consumer flow
```

## Key decisions

- **MVP plays pre-rendered audio files**; the real-time engine is being built
  separately (the Studio is its seed). The Studio's WAV export is exactly what the
  consumer player streams — customize in the Studio, render, drop into a protocol.
- VAS is collected via emoji and never shown to the user as a number.
- First B2C session is always the 6-minute Quick version (the WOW); the duration
  question sets a preference for later.

## Brand (from the identity book)

- Display font **PP Fragment (Fragment Sans)**; body **TT Commons Pro**. These are
  licensed — place the files in `public/fonts/` (see `README_FONTS.md`); the
  `@font-face` rules are already wired with graceful fallback.
- Palette: emerald `#009B77`, mint `#3DB189`, celadon `#B7DBAD`, tea `#D6E6B6`,
  lemon `#F4F0BE`, beige `#FAF8DF`; secondary violet `#533360`, sand `#E89D64`,
  blue `#2465AB`. Reversible emerald/cream.
- Signature motif: the **harmonograph curve of the perfect fifth (3:2)** — the
  brand encodes sound into its shape; green is the colour of the fifth. The Studio
  is already on-brand; the consumer flow still uses placeholder fonts/palette.

## Current state

- **Sound Studio — multitrack editor (done, desktop-only):** an Audacity-style
  arrange view over the GL layer synths. Track lanes + ruler + playhead; place
  (double-click), move, and trim clips with live waveforms; per-track
  mute/solo/volume; mixed transport; WAV mixdown export. Track types are the GL
  layers (binaural / soundscape / breath / voice). Binaural stays stereo through
  playback and export. Opens on the GL-ANX 1.1 bed; gated to ≥1024px viewports.
  Engine logic in `src/studio/multitrack.ts`, UI in `src/studio/SoundStudio.tsx`.
  (The old single-config Studio + `src/lib/engine.ts` are now superseded; engine.ts
  is kept as the synthesis reference.)
- **Data-access seam (done):** all screens read/write through a `DataProvider`
  interface (`src/data/provider.tsx`) via async hooks (`src/data/hooks.ts`) —
  never by importing seed data directly. Today it's backed by an in-memory mock
  (`src/data/mock.ts`, writes persist for the session); swapping to Supabase is a
  one-line change in `DataLayerProvider`. Target schema + RLS in
  `docs/DATA_MODEL.sql`; the role/permission model in `docs/ACCESS_MATRIX.md`.
- **Module 1 (done):** B2C onboarding → first session "WOW" flow.
- **Sound Studio v1 (done):** four-layer composition (binaural / soundscape /
  breathing / affirmation), live preview, WAV export. At `/#studio`.
- **Returning-user app shell (done):** four tabs (Session / Progress / Explore /
  Profile) per the 08 spec — Home single-CTA + Quick Start, Progress dashboard
  with the 3-month journey + mood trend + history, Explore two-tap filter,
  Profile with reminders + LGPD export/delete. In `src/app/`. After onboarding
  completes (or via the dev "skip →"), the app lands here.
- **B2B therapist console (done):** the telemedicine MVP core, in `src/b2b/`,
  at `/#therapist` (or `/#b2b`). Full clinical lifecycle: credentialing →
  patient roster → patient card → clinical wizard (pick protocol + green/red
  checklist) → monitored session (3-panel, INTERVENE, timestamped notes) →
  debrief → signed session report. Desktop-oriented. Excludes (per the 07
  annotations / post-MVP): training & sandbox, patient pre-fill form, the
  structured-rapport wizard UI, granular wizard sliders, full messaging inbox,
  and the corporate NR-1 admin dashboard.

## Roadmap (in order)

0. ~~**Full B2B demo journey**~~ **DONE** (see `docs/DEMO_GUIDE.md`). Works offline,
   no backend/keys. Added: **demo auth** (login works locally, persisted in
   localStorage, any creds — `src/auth/`); a **Session Composer** "easy mode" in front
   of the Studio (`src/compose/` — preset focus/length/soundscape/brainwave/voice/
   intensity → live preview → export WAV → **Open in Studio** seeded with the same bed),
   shared by B2C (home → "Compose your own") and B2B (wizard → "Compose audio"); the
   **Studio adopts the composed seed** on hand-off (`src/compose/handoff.ts`); **editable
   patient records** (`src/b2b/PatientEdit.tsx` + `updatePatient` on the data layer); and a
   **live B2C↔B2B link** — the mock store is now a shared module singleton and a self-use
   session in the consumer app pushes into the linked patient (`p1`) record. Two extra
   protocols (GL-BURN 3.1, GL-RESIL 5.1) added so all five families resolve.
1. **Go live on the data seam — data layer + auth done; needs a project to run.**
   The Supabase-backed `DataProvider` (`src/data/supabase.ts`, incl. `updatePatient`) and
   **email+password auth** (`src/auth/`) auto-activate when `VITE_SUPABASE_URL` +
   `VITE_SUPABASE_ANON_KEY` are set. **Note:** with no env the app now runs in **demo
   auth** (a real login screen, any creds, local session) rather than a silent stub.
   Auth + data share one client (`src/auth/supabaseClient.ts`). To run end-to-end: create
   the project, apply `docs/DATA_MODEL.sql` **then `docs/AUTH_POLICIES.sql`**, turn email
   confirmation off, set env. See `docs/AUTH_SETUP.md` + `docs/SUPABASE_SETUP.md`.
2. ~~Brand fonts + re-skin~~ **DONE.** Fragment Sans (display) + TT Commons Pro
   (body) are self-hosted as woff2 in `public/fonts/` (wired in `src/index.css`,
   preloaded in `index.html`, no Google Fonts). The palette is remapped to the
   brand in `:root` — Emerald `#009b77` primary, beige/cream surfaces, deep-forest
   text, mint/celadon/lemon neutrals, violet/blue/sand accents — so it cascades
   across B2C, B2B, the auth screens, and the player. **Flag:** the supplied PP
   Fragment is *personal-use* and TT Commons is the free-host build — both need a
   production licence before public launch (see `README_FONTS.md`). The Studio's
   dark DAW theme already harmonised (mint accent + lemon playhead) and was left.
3. Remaining B2C journey from the 08 spec: Progressive Assessment, Smart
   Reminders backend; static CVV-188 crisis footer line (no logic — thresholds
   parked); persist micro-intake + full credentialing to the DB.
4. **B2C↔B2B data merge** (the `patients.b2c_profile_id` bridge already exists —
   wire consent-gated self-use history into the clinician view) + **scheduling**
   (table + booking UI + real "next session" both sides) for the pilot.
5. Real audio assets + the video/realtime media layer (local-stereo split so
   binaural survives; intervene = voice channel only).
6. Studio polish later: save/load projects, more track types, snapping options.

**Voice (TTS) — built (`src/tts/`).** The Studio voice track previews with the
browser voice and renders real voice via ElevenLabs or Azure (env-selected) into
the clip → layered + exported. Needs an API key to render; see `docs/TTS_SETUP.md`.
Next: pick the winning pt-BR voice on the ANX family, then proxy the key
server-side before any public release.

## Open flags (raise these; don't quietly resolve)

- Crisis/referral thresholds are undefined and must be defined before real users.
- Scientific claims need calibration for ANVISA/CFP; the team needs a CRP
  psychologist.
- Real pre-rendered audio assets (produced from scripts) are still needed.
