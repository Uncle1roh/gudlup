# Good Loop — App (MVP)

The B2C self-use app for Good Loop. This first module is the **"90-second WOW"**: the
shortest honest path from opening the app to finishing a guided session and feeling
something shift.

> Tagline: *Where transformation becomes listening.*

---

## What's in this module

A complete, runnable front-end for the first-session flow:

```
Welcome  →  Micro-intake (3 taps)  →  Headphone/stereo check  →  Immersive session  →  Result
```

- **Welcome** — minimal-friction entry (auth is mocked for now).
- **Micro-intake** — three tap-only questions: how you feel, what you're looking for,
  how long you have. The mood question is a Daylio-style emoji scale that secretly
  records a 0–10 VAS in the background (never shown as a clinical number).
- **Stereo check** — plays a tone in each ear so you can confirm headphones are working.
  Friendly and non-blocking: mono still continues with a recommendation.
- **Immersive player** — the centerpiece. The screen dims to near-black, a breathing
  orb appears only during the breath/body-scan phase, the session moves through its six
  phases, a gentle haptic marks each transition, and tapping reveals minimal controls
  (time left, pause, end) that auto-hide. Leaving the app auto-pauses it.
- **Result** — one number (your relaxation change, post minus pre), a quiet celebration,
  and at most two next steps. No dashboard, nothing that breaks the calm.

The **breathing orb with concentric "listening rings"** is the signature element and
recurs throughout: as the brand mark, the full-screen focus in the player, and the
post-session bloom.

---

## Run it

Requires Node 18+.

```bash
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173). The dev server is exposed on
your LAN, so you can also open that address on your **phone** on the same Wi-Fi — this is
worth doing, since the experience is built mobile-first and the haptics only fire on a
real device.

**Dev tip:** the small pill in the top-right toggles between a **1-minute demo** run and
the **full 6-minute** session, so you don't have to sit through six minutes while testing.

---

## Project structure

```
src/
  types/domain.ts      Core data model (Protocol, phases, VAS, session record) — shared
                       across B2C / B2B / admin / the future engine.
  data/protocols.ts    Seed catalog: the 6-phase structure + a few protocols, and the
                       first-session routing.
  lib/vas.ts           Emoji ↔ hidden-VAS mapping.
  lib/audio.ts         Stereo test tones + SessionPlayer (plays a pre-rendered file, or a
                       synthesized placeholder bed when no file exists yet).
  components/          BreathingOrb, EmojiScale.
  screens/             Welcome, MicroIntake, StereoCheck, ImmersivePlayer, PostSession.
  App.tsx              Flow state machine wiring it together.
  index.css            Design system: tokens, type, the orb/rings, player, reduced-motion.
```

## Maps to the spec

| Screen | Use cases / rules |
|---|---|
| Welcome | UC-B2C-01 |
| Micro-intake | UC-B2C-02, RN-UX-04 (disguised VAS), RN-LGPD-02 (consent) |
| Stereo check | UC-B2C-07, RN-AUDIO-02 (mono non-blocking) |
| Immersive player | UC-B2C-08/09, FN-02 (six phases), orb-in-Phase-2 rule |
| Result | UC-B2C-10 (VAS delta, gratify without breaking state) |

## Deliberate decisions

- **First session is always the 6-minute Quick version.** The duration question still
  asks 6/12/24, but that sets a preference for later — the first taste is always short.
  This resolves the earlier inconsistency of asking duration when the first session is
  fixed.
- **Clinical numbers stay hidden.** The user sees emoji and one plain-language result;
  the VAS lives in the data model only.
- **Pre-rendered audio model.** The player consumes an audio URL per protocol version and
  language. We have no real voice assets yet, so it falls back to a calm synthesized bed.
  The real-time compositing engine is a separate, later module.

## Known limitations (expected at this stage)

- **Placeholder audio.** The session plays a gentle synthesized pad, not real guided
  voice. Real audio is produced separately from your scripts and dropped in via the
  `audioUrl` fields.
- **Haptics are Android/Chrome only.** iOS Safari ignores `navigator.vibrate`; real
  Taptic feedback there needs the native wrapper we'll add later.
- **Fonts load from Google Fonts**, so first paint needs network. Easy to self-host later.
- **Auth, persistence, and a home screen are not here yet** — this module is only the
  first-run flow. Returning-user home, history, and routing come next.

## Next module

A returning-user **home** (Session / Progress / Explore / Profile), which introduces
routing and the three-month journey/progression screen you asked for.

---

## Sound Studio (new)

The tool for *creating and customizing the sound*, at **`/#studio`** (open
`http://localhost:5173/#studio`).

Compose a session from independent layers, hear changes live, and **export a real
`.wav`** — the same file the consumer player streams.

- **Binaural carrier** — two tones, one per ear, offset to create a beat (the
  beat frequency maps to brainwave bands: delta/theta/alpha).
- **Soundscape** — an ambient bed: Calm Lake, Warm Air, or Deep, with a warmth
  (low-pass) control.
- **Breathing pace** — a soft tone that swells at a set breaths-per-minute.
- **Affirmation** — a placeholder pulsed tone you can place between the ears
  (dichotic). Real guided voice (TTS) is the next audio module; this layer holds
  its place in the mix.

Press play, drag sliders to hear them live, then **Export .wav** to download the
rendered file. "Load GL-ANX 1.1" seeds the controls from the one fully-specified
protocol.

**Engine code:** `src/lib/engine.ts` (the layer graph, live preview, and offline
render) and `src/lib/wav.ts` (WAV encoder). The same graph builder runs both the
live `AudioContext` and the `OfflineAudioContext` used for export.

**Scope of v1 / what's next:** this is a single continuous bed; per-phase
automation (parameters changing across the six phases) and real TTS voice are the
next audio steps. The architecture is built to grow into the full 9-pattern /
8-layer engine.

---

## Returning-user app (new)

After onboarding completes, the app lands on the **returning-user shell** — the
four-tab experience from the 08 spec (`src/app/`):

- **Session** — one large Quick Start CTA ("same as last time") + a single daily
  recommendation card. One tap to start; no catalog scrolling.
- **Progress** — the dashboard kept *out* of the post-session flow: the
  **3-month journey** (weekly cadence), a mood-trend sparkline, headline stats,
  recent-session history, and a data-export (PDF) action.
- **Explore** — find a session in two taps: how you feel × duration → a suggested
  session you can start.
- **Profile** — reminder preference (nudges, not streaks), language, and the LGPD
  controls (export / delete account).

Sessions launched from anywhere run through `SessionRunner` (quick pre-mood →
immersive player → result), and each completed session is recorded into the
in-memory history (seeded with mock data until persistence lands).

**Testing tip:** the dev pill (top-right in onboarding, and in Profile) toggles
**1-min demo** vs **full** session length. There's also a **"skip →"** on the
onboarding screens to jump straight into the app as a returning user.

---

## B2B therapist console (new) — `/#therapist`

The telemedicine MVP core, built per the 5.3 requirements and the 07 use-case
annotations (`src/b2b/`). Desktop-oriented — best viewed on a laptop. It walks
the full clinical session lifecycle:

1. **Credentialing** (UC-B2B-01) — CRP/CFP upload, automatic format validation,
   approval status + 48h SLA. (Top-bar credential chip.)
2. **Patient roster** (UC-B2B-04) — the therapist home: sortable / filterable
   caseload with status indicators (next/last session, VAS-trend arrow,
   assessment-due, B2C-inactivity, unread).
3. **Patient card** (UC-B2B-05) — clinical snapshot, T0→T2 assessment trend,
   goals, session chronology, B2C self-practice, therapist-only notes, and an
   auto pre-session continuity briefing.
4. **Clinical wizard** (UC-B2B-07, simplified) — choose a protocol (its preset
   maps to the audio file), set a goal, and clear the green/red pre-launch
   checklist (stereo+latency / goal / patient ready / consent). Start is gated.
5. **Monitored session** (UC-B2B-08) — the centrepiece. 3-panel therapist UI:
   patient video + mirrored immersive screen, phase timeline + live parameters,
   and PAUSE / STOP / **INTERVENE** (one tap → two-way audio + auto-pause) with
   timestamped rapid notes. Audio + phase timeline run live.
6. **Debrief** (UC-B2B-09/10) — post-treatment transition, light 3-phase debrief
   (observations pre-filled from notes), available instruments — no AI prompts.
7. **Session report** (UC-B2B-14) — auto-generated (protocol, params, VAS
   pre/post, timestamped notes, next goal), therapist-editable, with a **CRP
   digital signature** required before saving.

**To demo it for stakeholders:** open `/#therapist` → pick a patient → **Start
session** → choose a protocol and clear the checklist → **Start treatment** →
watch the timeline advance, try **INTERVENE**, add a rapid note → **Stop** (or
let it complete) → **debrief** → **sign** the report. The top-bar pill toggles
**demo ~90s** vs **full 24 min** so the session fits a live walkthrough.

**Excluded** (per your 07 annotations / post-MVP): training & sandbox
(UC-B2B-02), patient pre-fill form (UC-B2B-03), the structured-rapport wizard UI
(UC-B2B-06 — the platform just provides video + card + continuity), granular
wizard sliders (UC-B2B-07), the full messaging inbox (UC-B2B-13), and the
corporate NR-1 admin dashboard (UC-B2B-16).

**Honest scope:** in-memory mock caseload (no persistence), placeholder synth
audio, the patient "webcam" is a placeholder (no real WebRTC), and the brand
re-skin is still pending the font files.
