# Good Loop — Step 5: employee assessment → live NR-1 aggregates

Cumulative drop-in (admin slice + import pipeline + NR-1 dashboard + WebRTC +
this). Extract over `goodloop-app/`, merge/replace. Strict `tsc` clean; `vite
build` clean; the loop was exercised end-to-end (below).

## New in this step — the NR-1 loop is now real

The employer dashboard no longer reads a hardcoded report. It's **computed from
individual (anonymised, consent-gated) responses**, and completing an assessment
actually moves the numbers.

**Employee side (B2C):** a "Your quarterly check-in is ready" card on Home opens
an 11-item psychosocial questionnaire (the 8 COPSOQ/HSE dimensions + stress /
anxiety / burnout), each on a 5-point scale with correct polarity handling. It's
anonymous by design — a banner makes that explicit — and submitting records one
response and returns home.

**Aggregation:** a pure `aggregate()` derives the whole report — overall risk,
per-dimension splits, outcome prevalence with cycle-over-cycle delta, per-team
breakdown with **k-anonymity suppression**, and the high-risk trend. The mock
seeds a deterministic population (~121 respondents across four cycles, two teams
below k) so the dashboard is populated and stable; a new submission is added and
the aggregate recomputes. `aggregate()` is also the reference for the
`SECURITY DEFINER` SQL function of the same name, so mock and server stay in
lockstep.

## Files — new in this step (3)
- `src/employer/assessment.ts` — dimensions, questionnaire, Likert→band mapping, `PsychosocialResponse`
- `src/employer/aggregate.ts` — pure responses → `Nr1Report` (with suppression)
- `src/app/Assessment.tsx` — the employee questionnaire screen

## Files — edited in this step (7)
- `src/data/provider.tsx` — `submitPsychosocialAssessment()` on the interface
- `src/data/mock.ts` — seeded response population; `getPsychosocialAggregates` now COMPUTES via `aggregate()`; submit path
- `src/data/supabase.ts` — `submitPsychosocialAssessment` inserts a response (period stamped to the current cycle)
- `src/app/AppShell.tsx` — routes to the assessment screen
- `src/app/HomeSession.tsx` — the check-in prompt card
- `src/index.css` — appended assessment + card styles
- `docs/DATA_MODEL.sql` — `psychosocial_responses` reshaped to per-respondent jsonb (dims/outcomes)

## Files — from earlier steps, included for a clean overwrite (25)
admin console (11), employer dashboard base (4), WebRTC (3), `src/data/{catalog,protocols}`,
`src/auth/{auth,AuthScreen}`, `src/b2b/{ClinicalWizard,MonitoredSession}`, `src/App.tsx`.

## Verified end-to-end
Ran the real mock provider: BEFORE = 121 respondents with a realistic spread
(work demands / pace highest-risk), an improving trend, and Finance (3) + People
(4) suppressed. After submitting a maximally high-risk check-in: respondents
121→122, Engineering's high share moved 8→9%, every dimension ticked up — the
report is genuinely recomputed from responses.

## Demo (offline)
1. `/#employer` → note the Aurora Tech figures.
2. `/#` (employee app) → **Your quarterly check-in is ready** → answer all 11 → **Submit**.
3. Back to `/#employer` → reload the dashboard → respondent count and the
   dimension/team figures have shifted. (One response moves things slightly by
   design; submit a few to see a larger swing.)

## Roadmap — remaining (mostly provisioning/external)
- **Supabase go-live**: provision the project, apply `docs/DATA_MODEL.sql`,
  set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, verify sign-in wiring.
  Recommended next milestone — it unblocks real auth, real data, real
  multi-device video (via the `Signaling` seam), and real NR-1 responses.
- Real WebRTC signalling backend (Supabase Realtime) — drop-in via `Signaling`.
- Audio rendering for imported protocols (author in Studio; wire `audioReady`).
