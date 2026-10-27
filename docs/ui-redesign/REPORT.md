# UI redesign + emotional check-in — what was built

Branch `feat/ui-redesign-mood-checkin`, one commit per phase, on top of
`cdfaa70`. Not deployed — Lucas handles deployments.

```
0b86050  Phase 0: what the mockups ask for, against what is already there
4747a69  Phase 1: the surface takes the colour of the day
d38f267  Phase 2: ten seconds to say how you are, and a colour that says it back
1ed9cf9  Phase 3: Home opens on a billboard, and the search moves to it
135ebaa  Blur the panes, not the lists
d8154cd  Phase 4: the waiting room checks the ears, and the rest follows the colour
```

The plan, with the mapping from each mockup to the component it lands on, is
`PLAN.md`. This file is what actually changed, what it is wired to, and what
is still open.

---

## 1. Per screen

| Screen | What changed |
| --- | --- |
| **Shell (all of Self Use)** | The fixed dark "Studio" palette becomes the colour of the person's last check-in. Desktop navigation is a 92 px left rail — logo plus five icon circles in the mockups' order, active one a solid `--act-bg` circle — from 900 px up; below that the bottom tab bar, same five, same order. The search field leaves the bar. Outfit for display, DM Sans for body. |
| **Home / library** | New top bar: greeting, the check-in pill, Loops balance, avatar. The hero becomes the billboard — eyebrow, 76 px title, the three lengths, the blurb, "Ouvir agora" + "Sobre esta sessão" — standing on the mood colour with no picture behind it. The search is a glass pill on the right, where "Sua trilha" used to be. Categories become chips over the rails; the standing column is gone. A session booked for today appears as a card with "Entrar" and the privacy line. |
| **The session** | The check-in runs on its own screen before the pre-session screen and again after the audio, tied together by one correlation id. The post screen shows the two colours and the two words side by side. The five-face VAS is untouched at both ends. |
| **Terapia / waiting room** | Readiness checks: camera and microphone (live state), wired stereo headphones with the **same L/R ear test the player runs**, and a quiet place. The test never blocks the appointment. |
| **Call, treatment** | Restyled by the token layer only. Pausar/Parar stay therapist-only; the patient still has "Pedir uma pausa" and cannot stop the treatment. |
| **Minha jornada** | The tab is "Minha jornada" (was "Progresso"). It gains the check-in card: the last fortnight as colours with the chosen word under each, the most recent before/after pair from one session, and a way to check in. |
| **Benefícios** | Token layer only — balance, collective challenge, achievements and the two tabs already existed. |
| **Perfil** | Leads with "Falar com um psicólogo", which opens Terapia. |
| **Psychologist console** | Token layer only; it is not inside `.su-mood`, so it is unchanged. See §6. |

## 2. Files

**New**

```
src/mood/moodColor.ts         the spec's algorithm, pure, no dependency
src/mood/tokens.ts            the two token sets, the veil, the contrast floor
src/mood/MoodContext.tsx      the provider: latest check-in → CSS properties
src/mood/MoodCheckIn.tsx      grid, words, confirmation
src/mood/MoodPill.tsx         the control in the top bar
src/mood/MoodBeforeAfter.tsx  two colours, two words
src/mood/MoodJourney.tsx      the check-ins on Minha jornada
src/mood/useMoodRecorder.ts   one place that decides whether a row is stored
src/mood/config.ts            the two switches the POs have not decided
src/selfuse-mood.css          the token re-point, the glass, the rail, the Home
src/i18n/mood.ts              IT + PT for everything above
tools/test-mood-color.ts      81 assertions, including the contrast gate
supabase/26-mood-checkins.sql the migration
supabase/tests/mood_privacy.sql the privacy proof
public/fonts/{Outfit,DMSans}-Roman-latin{,-ext}.woff2
docs/ui-redesign/PLAN.md, REPORT.md
```

**Changed** — `src/main.tsx` (one import), `src/selfuse/SelfUseApp.tsx`
(provider, rail labels, today card), `Explore.tsx` (top bar, search slot),
`Catalog.tsx` (billboard, chips), `Session.tsx` (the two check-in stages),
`VideoCall.tsx` (readiness checks), `ProfileTab.tsx`, `ProgressTab.tsx`,
`src/data/{provider,mock,supabase}.ts` (two methods), `src/i18n/index.tsx`,
`supabase/setup.sql`.

(The diff against `cdfaa70` also carries the approved-addresses work —
`supabase/25-company-roster.sql`, `src/corporate/Employees.tsx` — which was
committed before this branch and is nothing to do with the redesign.)

## 3. The migration

`supabase/26-mood-checkins.sql`, idempotent, ending with
`notify pgrst, 'reload schema';`. The same block is in `setup.sql`.

- `mood_checkins` with exactly the spec's fields, `valence`/`arousal` as
  `numeric(3,2)` bounded to ±1 by a check constraint.
- `session_id` is a **correlation id minted by the app**, not a reference to
  `sessions`: the "before" happens before any session row exists.
- RLS: `mood_own_read` and `mood_own_insert`. No employer policy, no HR
  policy, no therapist policy — stated in the file so the omission cannot be
  read as an oversight.
- `has_consent(purpose)` (new, SECURITY DEFINER) backs the insert policy, so a
  row cannot be written without the measurement consent even by a client that
  forgot to ask.
- `profiles.mood_variant` holds the A/B arm when the pilot is switched on.

Validated: `node tools/db-gate.mjs` — `setup.sql` applied twice to a fresh
Postgres 16, then every SQL proof, including the new one. **PASS.**

## 4. Feature flags and defaults

| Flag | Default | What it does |
| --- | --- | --- |
| `AB_PILOT_ENABLED` (`src/mood/config.ts`) | **`false`** | Off: everybody sees the colour, and `variant` is `color` on every row. On: the arm is drawn once per person and kept; group B gets the identical check-in on a fixed neutral grey. |
| `MOOD_CONSENT_PURPOSE` (`src/mood/config.ts`) | `'measurement'` | Which consent gates storage. Without it the check-in still runs and still colours the app — in memory, on that device — and the screen says so. |

No existing flag changed. `player` and `video` still gate what they gated.

## 5. Deliberate differences from the mockups

Each one is a case where the drawing and a rule in this repo disagreed, and
the rule won:

1. **No protocol code under the billboard title.** `HomeMood.dc.html` prints
   "GL-CALM". A code is a clinical identifier and never reaches a person in
   the self-guided layer (vocabulary rule at the head of `Explore.tsx`,
   `CLAUDE.md`). The public name, the three lengths and the blurb are there.
2. **Six chips, not seven.** The catalogue's themes are Foco, Calma, Energia,
   Equilíbrio, Crescimento. "Menos estresse" and "Resiliência" are not themes
   anything is filed under, and a chip that filters to nothing is a lie.
3. **No "Continuar ouvindo" rail.** A session ended early records no position
   — by design — so there is nothing to continue. The honest rail ("Ouvir de
   novo", completed sessions) stays. Resuming needs a `position_sec` on
   `sessions` and player plumbing; it is a feature, not a restyle.
4. **No voice name on the billboard.** It is not on the resolved session, and
   inventing "Voz: Valeria" for a protocol recorded by someone else would be
   worse than leaving it out.
5. **No photographic background anywhere**, as the brief instructs — and none
   behind the billboard either: a cover photo under 76 px type is a second
   ground fighting the first. Covers still do their job on the cards.
6. **The fonts are self-hosted, not fetched from Google.** Same families, same
   weights, same `display: swap`. `index.html` says in a comment why Roboto is
   self-hosted — no reader's address reaches a third party — and a redesign is
   not a reason to start. Files are in `public/fonts`, both OFL.
7. **The check-in does not replace the five-face VAS.** The brief says keep
   existing VAS data readable; ending the collection would also end a stream a
   linked clinician reads. Both run; the check-in is skippable.

## 6. What is NOT done

- **The psychologist console** (`TerapeutaAgenda`, `TerapeutaSessao`) is
  restyled by nothing: it lives in `src/workspace`, outside `.su-mood`, and
  keeps the look it got in `cdfaa70`. Its structure already matches the
  mockups (day agenda + patient card; phases, treatment configuration, voice
  choice, Pausar/Parar with a confirm), so what is missing is the visual pass,
  not the behaviour. Doing it means a token layer for the workspace, which is
  a second stylesheet and was out of reach in this pass.
- **Mobile therapy flow** (`PsiAgenda`…`PsiTratamento`) is the same components
  at phone width, not purpose-built screens.
- **The 12-week list and the progress ring** on Minha jornada are the existing
  ones; only the check-in card is new.

## 7. Quality gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run build` | clean (`✓ built in 6.7s`; the pre-existing 500 kB chunk warning) |
| `package-lock.json` | untouched — no dependency was added (the colour maths is 30 lines instead of `culori`) |
| `npm test` | 53 suites. `test-mood-color` passes with **81 assertions**. The same **10 pre-existing failures** as before this branch (`asset-pools, handoff, messages, pdf, shape, tts-block, tts-request, whisper-draws, wireframe-specs, wizard`) and 5 workbook-dependent skips. Nothing new broke. |
| SQL twice on fresh Postgres 16 | `node tools/db-gate.mjs` → **PASS**, including `mood_privacy.sql` |
| Contrast ≥ 4.5:1 | **Automated**, not eyeballed: `test-mood-color` sweeps a 101 × 101 grid of moods and asserts body text, secondary text and links all clear 4.5:1 against the actual ground, with the five named colours (`#FBC959 #95E3D3 #BEB6A9 #C25237 #46576C`) asserted by name. Worst case 5.52:1 (body), 4.75:1 (secondary). |
| Colour never the only signal | The chosen word is printed beside every swatch — in the confirmation, the pill, the before/after and the journey strip — and the grid has an `aria-live` line naming the quadrant. |
| Keyboard | The grid is focusable and moves in 0.1 steps with the arrow keys; every control is reachable and `:focus-visible` is drawn in the current ink. |
| No employee-facing English | Checked mechanically: the 129 `t()` keys in the files this branch changed all exist in **both** the IT and the PT-BR dictionaries. |
| E2E | The repo has no browser E2E suite. What was driven by hand in a real browser is in §8. |

### Two findings worth keeping

- **`backdrop-filter` does not scale.** Glass on every card meant eighty
  composited layers on the library and the renderer died. The blur is now on
  the few elements that are genuinely a pane (`sheet`, `panel`, the popover,
  the search field, the phone's tab bar); everything else is translucent and
  looks the same against a flat colour. Commit `135ebaa`.
- **The spec's token-set threshold is not a contrast rule.** `L ≥ 0.65` puts a
  mid-tone like `#71979A` just inside the light-text set, where cream is
  2.97:1. The rule is implemented exactly as written; what makes it legible is
  the **veil** — white at 20 % under dark text, `#07100E` at 34 % under light
  text — measured over the whole grid. It is the same device the mockup
  already used (its two radial gradients), made explicit. `src/mood/tokens.ts`.

## 8. What was verified in a real browser, and what could not be

Driven in headless Edge against the demo data layer, at 1440 × 1050 and
390 × 844:

- the left rail, the bottom tab bar, the token re-point, the self-hosted fonts;
- the top bar, billboard, chips, search pill, rails;
- the check-in end to end: drag to a quadrant → background animates to
  `#bd6143` with the token set flipping to light text → words become
  Ansioso/Tenso/Irritado/Sobrecarregado → pick → "Hoje você se sente:
  Tenso(a)" → panel closes, the app keeps the colour, the pill shows the word;
  the same again into the calm quadrant (`#9ecfb9`, dark text);
- the phone layout: no horizontal overflow, the popover fits.

**Could not be driven here:** this headless Edge build dies on the session
player and on tab switches away from Home — verified as **pre-existing** by
reproducing it on `cdfaa70` with none of this branch's code. So the
pre/post-session check-in screens, the waiting room and Minha jornada were
verified by types, by build and by reading, not by clicking. They should be
clicked through on a real device before this ships.

## 9. Open decisions and TODOs

Still open from the spec, and still unanswered here:

- [ ] **Mandatory or optional check-in per session.** Shipped optional: "Agora
      não" skips the screen and stores nothing. One line in `Session.tsx` to
      change.
- [ ] **Fixed or drifting colour during a session.** Shipped fixed (the
      mirror). The drift is the pilot's hypothesis, not a default.
- [ ] **Aggregates for B2B.** Nothing is exposed. There is no employer path to
      these rows at all, and adding one would need the k-anonymity route.
- [ ] **Who signs off GDPR/LGPD, and the consent text.** `MOOD_CONSENT_PURPOSE`
      points at the existing `measurement` consent, whose wording covers
      "medidas de bem-estar" and does not say "emotional state". A TODO is in
      `src/mood/config.ts` with the question stated. No legal text was
      invented.
- [ ] **Whether the A/B pilot starts in v1.** `AB_PILOT_ENABLED = false`.

Added by this work:

- [ ] **Resume a session** (`position_sec` on `sessions` + player plumbing)
      before "Continuar ouvindo" can exist.
- [ ] **A token layer for the workspace**, if the psychologist console is to
      follow the same visual system.
- [ ] **Calibrate the five anchors** against the Jonauskaite dataset and test
      them with people in Italy and Brazil — the spec says the current five are
      a first version.
- [ ] **Click the untested screens on a real device** (§8).
