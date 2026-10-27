# UI redesign + emotional check-in — plan

Phase 0 of `CLAUDE_CODE_PROMPT.md`. Written after reading the spec
(`checkin-emocional-spec.docx`), the 21 mockups, and the code they land on.

Short version: **the information architecture the mockups draw already
exists.** Self Use has five tabs in the mockups' exact order, Home is already
the library, the player, the video call and the treatment mode are built, and
the therapist console has an agenda and a live session. What is missing is (a)
a mood-driven token layer in place of the fixed dark "Studio" palette, (b) a
left rail on the desk, and (c) the emotional check-in — component, colour
engine, table, and the two places per session where it runs.

So this is mostly a **restyle plus one feature**, not a rebuild. Where a
mockup draws something we do not have the data for, it is listed under
*Missing pieces* and is not faked.

---

## 1. Mapping — mockup → what it becomes

| Mockup | Route / component today | What happens |
| --- | --- | --- |
| `HomeMood` | `#b2c` → `SelfUseApp` → `Explore` + `Catalog` | Restyle + restructure. Greeting and check-in pill move into a new top bar; the search field moves from the tab bar into the billboard's right side; chips become the 7 spec categories over `SELF_USE_THEMES`; the hero becomes the billboard (eyebrow, 76px title, code, three durations, voice, blurb, two actions); rails keep `resolveRails`. |
| — (shell) | `SelfUseApp` tab bar (`.tabbar`) | Becomes a left rail ≥900px, bottom tab bar below. Same five destinations, same order: Início, Terapia, Minha jornada, Benefícios, Perfil. |
| `Mobile`, `Protocolos` | same screens, narrow | No new screens: the same components at phone width. |
| `WTerapia`, `PsiAgenda`, `PsiEscolher` | `TherapistTab` (list, profile, booking, prescriptions) | Restyle; next-session card and "Entrar na sala de espera" surfaced at the top; booking flow reused as-is. |
| `WSalaEspera`, `PsiSalaEspera` | `VideoCall.tsx` waiting state | Restyle + **add the stereo L/R ear test and the checklist** (reusing `StereoCheck` from `Session.tsx`). |
| `WChamada`, `PsiChamada` | `VideoCall.tsx` call state | Restyle; phase label Acolhimento → Tratamento → Conversa final. |
| `WTratamento`, `PsiTratamento` | `VideoCall.tsx` `TreatmentMode` | Restyle to the dimmed immersive player; patient keeps "Pedir uma pausa" and cannot stop. Already true in code. |
| `WJornada`, `Jornada` | `ProgressTab` | Restyle; before/after chart gains the mood colours; check-in reminder card. |
| `WBeneficios`, `Beneficios` | `BenefitsTab` (+ `Conquistas`, `Coletivas`) | Restyle only. Balance, collective challenge, achievements and the two tabs already exist. |
| `WPerfil`, `Perfil` | `ProfileTab` | Restyle; add the stereo test entry point and the "Falar com um psicólogo" card. |
| `TerapeutaAgenda` | `#b2b` → `WorkspaceApp` roster + patient card | Restyle; the day agenda already reads `listAppointments`. |
| `TerapeutaSessao` | `workspace/LiveSession.tsx` | Restyle. Phases, treatment configuration, voice choice and Pausar/Parar already exist (Parar confirms). |
| — | `Session.tsx` `PreSession` / `PostSession` | Gain the check-in: `pre_session` before the VAS block, `post_session` after, then the before/after colour comparison. |

### The player background
`ImmersiveSession` keeps its dark ground and takes the mood colour at
**chroma × 0.5** as the base of its gradient (spec: "mesma cor com saturação
pela metade").

---

## 2. Token layer — how the restyle reaches every screen

`selfuse-studio.css` already re-points the seven names that `selfuse.css`
reads (`--ink`, `--line`, `--mist`…) to its own `--su-*` palette. The mood
layer uses the same lever one level up:

```
mood colour → --mood-bg + token set (light|dark)  →  --ink/--ink-2/--link/
--glass/--btn/--line/--act-bg/--act-fg  →  the --su-* names  →  1 644 lines of
selfuse.css, unchanged
```

So "all screens use tokens only" is achieved by re-pointing, not by editing
every rule. New file `src/selfuse-mood.css`, imported after
`selfuse-studio.css`, scoped to `.su-mood` which the Self Use frames carry
alongside `.su-studio`.

Token set chosen by **L ≥ 0.65 → dark text set, otherwise light text set**,
exactly as the mockup's `renderVals()` does.

---

## 3. Missing pieces — in the mockups, no data behind them

| Mockup element | Status | Decision |
| --- | --- | --- |
| **Continuar ouvindo** (rail with % progress) | A session ended early records **nothing resumable** — by design (`finishSession`: no local log, no position). There is no "position" column anywhere. | Rail **hidden**. The existing honest version ("Ouvir de novo" / `recentRail`, completed sessions) stays. Adding resume means a new `position_sec` on `sessions` and player plumbing — out of scope here, listed as a TODO. |
| **Recomendados para você** "com base em como você tem se sentido" | No recommender exists, and a recommendation derived from mood data would be an inference about a person (MN-03/MN-19 territory). | Rail shown **only** as the admin-arranged rail that already exists (`resolveRails`), with the neutral subtitle. No mood-derived ordering. |
| **Trilhas de 12 semanas** as tall cards | Pathways exist (`catalog.pathways`) but their length is 4–12 weeks and "48 sessões" is invented. | Tall-card rail built from real pathways; meta line prints the real week count, or nothing. |
| **Loops balance in the top bar** | Real (`getWallet`). | Shown. |
| **Collective challenge** on Benefícios | Real (`Coletivas`, `listMyChallenges`). | Shown. |
| **Artwork per protocol** | `coverFor(slug, theme, coverUrl)` already does tint-over-image with a solid fallback. `coverUrl` is the brief's `artworkUrl`. | Reused as-is; no new field. |
| **"Semana X de 12" ring** on Jornada | Real for an active pathway. | Shown; hidden when no pathway is running. |

---

## 4. Migration

One file, `supabase/26-mood-checkins.sql`, idempotent, ending with
`notify pgrst, 'reload schema';`, and the same block appended to `setup.sql`.

```sql
create table mood_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  context mood_context not null,          -- pre_session | post_session | standalone
  session_id uuid,                        -- links a pre to its post
  protocol_code text,
  valence numeric(3,2) not null check (valence between -1 and 1),
  arousal numeric(3,2) not null check (arousal between -1 and 1),
  label_id text,
  locale text not null,
  color_oklch text not null,
  variant mood_variant not null default 'color'
);
```

RLS: `mood_own` — insert and select where `user_id = current_profile()`. No
employer policy, no HR policy, no therapist policy; the omission is
deliberate and commented in the file. `profiles.mood_variant` holds the A/B
assignment so it is stable per person.

**Consent.** Mood is health data (LGPD sensitive / GDPR art. 9). Nothing is
written unless the existing `measurement` consent is on; otherwise the
check-in still runs and colours the app **in memory only**, and says so. The
current consent text does not mention emotional state, so the gate is behind
`MOOD_CONSENT_PURPOSE` in `src/mood/config.ts` with a TODO for the DPO —
no legal text is invented here.

---

## 5. Order of work (one commit per phase)

1. **Phase 1 — tokens and shell.** `src/mood/moodColor.ts` + `MoodProvider`
   (background only), `selfuse-mood.css`, left rail / bottom bar, Outfit +
   DM Sans.
2. **Phase 2 — the check-in.** `MoodCheckIn`, words, confirmation, the
   migration, provider methods, unit tests, pre/post wiring, before/after.
3. **Phase 3 — Home.** Top bar with the pill, billboard, search on the right,
   7 chips, rails, mobile Home.
4. **Phase 4 — the rest.** Terapia + waiting room (stereo test) + call +
   treatment, Jornada, Benefícios, Perfil, then the psychologist console.
5. **REPORT.md** and the quality gates.

## 6. Nothing here needed a stop-and-ask

Checked against the three conditions in §1.3 of the brief:

- **(a) clinical rules** — DASS-21 stays English (`Measures.tsx` untouched);
  no clinical language enters the self-guided layer (the check-in says
  "como você está agora", never a symptom); Pausar/Parar stay therapist-only
  in `TreatmentMode`; the stereo check is kept and gains a second home in the
  waiting room.
- **(b) data model** — `mood_checkins` is a new table. It does not replace
  `assessments` (VAS) or `daily moods` in `selfUseStore`; both stay readable,
  as the brief asks.
- **(c) employer exposure** — no HR/employer path reads mood rows. The
  corporate console's aggregates are untouched.
