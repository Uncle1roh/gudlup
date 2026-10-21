# Gamification — implementation plan (SPEC §0 step 2)

Status: **waiting for OK.** Nothing outside `docs/gamification/` has been changed.
Spec: `docs/gamification/SPEC.md`. Mockups are in `docs/gamification/Mocks/` (the spec says `mockups/`).

---

## A. Decisions needed before Slice 1

These are places where the spec collides with the code, `CLAUDE.md` or the Legal Framework v5 (Path A) register. Each one has a proposed default. **Bold** marks the ones that block a slice.

| # | Conflict | Proposed resolution |
|---|---|---|
| A1 | MN-03 vs the unlock sheet (§3.4) and the challenge announcement. | **Resolved 2026-10-21: legal has approved the spec as written.** The unlock sheet is built per §3.4 (bottom sheet on the next app open, never post-session, pager, `seen_at` on close). The challenge announcement is one gentle in-app message, with no repeated pushes. |
| A2 | SPN-02 / D-08: sponsor figures need n ≥ 25 plus complementary suppression, and the threshold must match the contract. Spec §7.2d / §12 say k = 10. | Use `MIN_COHORT = 25` (`src/legal/market.ts:137`) server-side for every HR add-on figure. Add complementary suppression: if "concluíram" or "participam" would let the other be derived for a cell under 25, both are hidden. k = 10 is not implemented. **Approved 2026-10-21.** |
| A3 | MN-17: no *attendance* data to sponsors. Affects "Adesão ao desafio %", `company_in_loop` and "Novembro em Loop". | **Decided 2026-10-21:** the full company adhesion rate is shown to HR, provided adhesion stays anonymous. It is a company-wide aggregate: no names, no list, nothing per person or per sub-group, and it is suppressed under n ≥ 25 (A2), with complementary suppression. |
| A4 | SPN-06: sponsors send "only generic programme communications from approved templates." | **Decided 2026-10-21:** HR company challenges come **only from templates**. The first set is written in Slice 6 (Boas-vindas, Sono em dia, Pausa consciente, Empresa em sintonia) and is editable by Admin; the founders will refine it. |
| A5 | MN-04 vs the Home challenge-card priority. | **Decided 2026-10-21:** use the spec order: company challenge > closest to completion > ending soonest. |
| A6 | MN-02 / lexicon LA10 ("pontuação", "nível"). | **Decided 2026-10-21: Points are internal and never shown to the person; what they see is Loops, the app currency.** Points still drive achievements, challenges and ranks (GAM-R9), and stay in the LGPD data export, which must be complete. Person-facing progress is shown in listening time ("3h 40min de 5h"), sessions or Loops, never in points. Collective goals are shown as a progress bar with a percentage, and the person's own part in minutes. The ranking reads "por pessoa ativa" without a points figure. The admin console and reports may show Points. |
| A7 | Admin console language: the spec gives admin labels in pt-BR. `CLAUDE.md` and project memory say **the admin console is always Italian** (`FixedLocale`). | Admin sections in Italian (Economia, Traguardi, Sfide, Benefici, Tag, Piani e aziende, Report). The HR portal and the employee app follow the person's locale, with pt authoritative for the employee copy. |
| A8 | i18n has no `en` dictionary: the English string is the key and the fallback (`src/i18n/index.tsx:155`). | New strings are written with English keys. Every key gets a `PT_GAMIFICATION` entry (authoritative) and an `IT_GAMIFICATION` entry in a new `src/i18n/gamification.ts`, merged in `index.tsx`. That covers "pt, it, en". |
| A9 | **No journey engine.** There is no `src/journey/`, no 12-week journey and no phase "Introdução e Estabilização". The live app has **Pathways** of 4–6 weeks (`src/data/selfuse.ts:352`, `selfUseStore.ts:340`). | `month1_done` → "Primeiro percurso concluído" (any pathway complete). `journey_done` → seeded **inactive** until a 12-week journey exists. Challenge metric `journey_phase_completed` → `pathway_completed`. |
| A10 | **No "Home" with an orb.** The routed B2C app is `src/selfuse/SelfUseApp.tsx`; `src/app/*` (ConsumerApp, HomeSession, Progress, Profile) is legacy and unrouted. Home = `Explore.tsx` (library rails). Tabs: home · therapist · progress · partners (admin-only) · profile. | Challenge card goes at the top of `Explore` (max one). **Benefits tab replaces the admin-only Partners tab**, in the same position (home · therapist · benefits · progress · profile is also possible). **Approved 2026-10-21: always on, with no feature switch.** `partner_products` migrates into `benefits` (A15). |
| A11 | **SOS sessions do not exist** as recorded sessions. HelpNow and SafetyLevel3 never call `recordSession`. | Add `sessions.is_sos boolean default false` and `SessionRecord.sos?`. GAM-R3 is enforced in `credit_session` and covered by fixtures, so it holds when SOS sessions arrive. |
| A12 | **Incomplete sessions are never recorded.** `finishSession` returns early on `!completed` (`SelfUseApp.tsx:416`), and the exit dialog promises "End session early? Your progress won't be saved." | **Superseded by A24.** The promise is kept: only completed sessions are recorded. The readers still filter on `completed = true` (`listSessions`, the therapist view of b2c sessions, the mock), so switching later is a one-line change. |
| A13 | **Listened time is not tracked.** `elapsedRef` advances while playing but jumps on seek (`Session.tsx:614`). | New accumulator in `Session.tsx` that counts wall-clock seconds only while audio plays. Seeks don't add time. It is put into `SessionOutcome.listenedSec`. The server caps it at `duration_min*60`. |
| A14 | **Stereo check and initial self-assessment are local-only.** The stereo check is in localStorage `stereoCheckedAt`. No initial self-assessment exists in selfuse; clinical instruments go through the therapist tab. | `stereo_ready`: add `sessions.stereo_checked boolean`, set by the player when the check passed in that session. `know_yourself`: seeded **inactive**, because there is no non-clinical initial self-assessment to count, and counting therapist-assigned instruments risks GAM-R2 and MN-28. |
| A15 | `partner_products` (admin-managed partner offers) overlaps with `benefits`. | `benefits` supersedes it. Slice 4 copies active rows into `benefits` (pillar `pausas_lazer`, tag `desconto`, `delivery_type = static_code`, price set by admin). It marks `partner_products` legacy, and `PartnerProducts.tsx` becomes the Benefici admin. The old table is not dropped. |
| A16 | **No affiliation history.** The company link is `profiles.company_id` only. Contract terms live in `convention.ts` / env, not the DB. GAM-R9 and §12 need "affiliation active at session end". | New `company_affiliations(user_id, company_id, started_at, ended_at)` maintained by a trigger on `profiles.company_id`, backfilled once from current profiles (started_at = profile created_at). |
| A17 | **No `employee` role.** An employee is `b2c_user` + `company_id`; HR is `hr_admin` (`is_hr()`, `my_company_id()`). | RLS uses these existing helpers. No new role. |
| A18 | Gate "fresh local Postgres 16" is not available. This machine has no psql, Postgres or Docker. setup.sql also needs Supabase objects: `auth.uid()`, `auth.users`, roles `anon` / `authenticated`. | Install PostgreSQL 16 via `winget install PostgreSQL.PostgreSQL.16` (**install approved 2026-10-21**). Add `tools/db/local-stubs.sql` (auth schema, `auth.uid()` reading `request.jwt.claim.sub`, `auth.users`, anon/authenticated roles) and `tools/db-gate.mjs`. The script creates a throwaway DB, applies stubs + setup.sql statement by statement (the `alter type … add value` at setup.sql:35 cannot run inside one transaction), re-applies, checks the trailing `notify`, then runs `supabase/tests/economy_parity.sql`. |
| A19 | Branch: `main` is behind `fix/gl-anx-voice-language-and-mastering` by the recent commits. | Create `feature/gamification` from the current HEAD (aeaf41d), not from `main`. |
| A20 | Brand tokens: `#00785C` and `#0E3527` are not tokens. Nearest are `--aura-deep #007a5e` and `--ink #15362b`. The font is Roboto, not Figtree. The self-use app is **dark by default** (`--su-*`, with a light theme in `selfuse-studio.css:2095`). | Use the existing tokens and Roboto. The badge tier colours from §9 go in as `--gl-tier-*` tokens. They are checked for ≥ 4.5:1 icon contrast on both `--su-ground` themes; the ring gets an outline on dark. |
| A21 | Data export is JSON (`src/legal/dataExport.ts`), not PDF. | Points, the Loops ledger, achievements and redemptions are added to the JSON export. |
| A22 | MN-32 (no per-employer variant of *the catalogue*) vs the company tag filter and company-own benefits. | Read "catalogue" as the session/content catalogue. Benefits are not content, so the tag filter is allowed. Protocols and sessions never vary by company. Noted for legal. |
| A23 | `setup.sql` is missing objects from migrations 5, 6 and 8 (`protocols.cover_url`, message read flags, two policies). | Out of scope. Not fixed here, only noted. The fresh-DB gate validates setup.sql as it stands. |
| A24 | Partial-listen credit (§2.2) vs the exit dialog's promise (A12). | **Decided in Slice 1:** the promise stands. A session's Points come from the seconds actually heard (seeks excluded) plus the completion bonus, and only completed sessions are recorded. The server and the fixtures already handle `completed = false` (partial listen: minutes, no bonus). Crediting early exits needs only the dialog copy changed and the early return in `finishSession` removed. |
| A25 | **setup.sql did not apply to a fresh database.** The policies at the old line 131 called `is_admin()` / `my_company_id()`, which are defined ~400 lines later. Live Supabase already had the functions, so this never showed. | **Fixed in Slice 1:** the three helpers are also defined before first use. |
| A26 | Ten existing suites fail at HEAD (aeaf41d) with no gamification change: asset-pools, pdf, shape, whisper-draws (assertions), and handoff, messages, tts-block, tts-request, wireframe-specs, wizard (missing modules or exports, top-level await). | Out of scope. The per-slice gate is "no new failures" plus the gamification suites passing. |
| A27 | Slice 2 choices the spec leaves open. | Collective achievements carry **no bonus by default**, because the spec sets none; Admin can edit it. Only sessions the economy **credited** count toward achievements, and only pathways finished **from now on** are sent to the server, so nothing pays out retroactively for pre-launch history (§2.2). Evaluation runs in a deferred trigger at commit, so it sees the usage the same credit wrote. The unlock sheet opens when the app opens or returns to the foreground, only over Home, never while a session is up. On the dark theme, locked badges are drawn at half opacity so they don't outshine the unlocked ones. |

---

## B. Delivery pattern (all slices)

- **SQL:** each slice appends a block to `supabase/setup.sql` before the final `notify pgrst, 'reload schema';`. It also adds a numbered delta: `supabase/16-gamification-economy.sql`, `17-…`, following the repo pattern ("the same block is in setup.sql"). Idempotent throughout: `if not exists`, `create or replace`, `drop policy/trigger if exists`, enums in `do $$ … exception when duplicate_object`, seeds `on conflict do nothing`.
- **Pure logic:** `src/gamification/` with no React and no I/O: `economy.ts`, `achievements.ts`, `challenges.ts`, `geo.ts`, `benefits.ts`, `types.ts`.
- **DataProvider:** new methods go on the interface (`src/data/provider.tsx`) and in **both** `mock.ts` and `supabase.ts`. The mock keeps per-user ledgers in memory and in localStorage, and calls `src/gamification/*`. That is the same logic the SQL mirrors.
- **Tests:** `tools/test-gam-*.ts`, picked up by `npm test` (esbuild + node). The SQL parity test is in `supabase/tests/`, run by `tools/db-gate.mjs`.
- **No feature switch** (A10): the gamification UI is always on.
- **i18n:** `src/i18n/gamification.ts` (`PT_GAMIFICATION`, `IT_GAMIFICATION`), merged in `src/i18n/index.tsx`.
- **Untouched:** audio engine, Studio, PLAIN parser, TTS, therapist workspace, `src/app/*` legacy, `goodloop-admin-slice`.

---

## C. Per spec section

### §1 Principles → where each rule is enforced
| Rule | Enforcement |
|---|---|
| GAM-R1 | No decrement paths: ledger debits only for `redemption` and `admin_adjustment`; Points ledger is insert-only (no update/delete policy or grant). No consecutive-day metric in the `challenge_metric` enum. |
| GAM-R2 | The metric enums contain no assessment/VAS values. `credit_session` never reads `vas_*`. A test asserts the enum lists. |
| GAM-R3 | `credit_session` returns early on `is_sos`. `update_challenge_progress` and `evaluate_achievements` read only `points_ledger`, so SOS sessions have no row there. |
| GAM-R4 | `gam_scope` enum = `user, city, state, region, national, company`. A check forbids `user` on challenges. No team/area/unit column exists. `test-gam-schema` asserts the enum. |
| GAM-R5 | `geo_ranking` consent purpose, city opt-in, k-threshold views, HR functions with n ≥ 25 (A2). |
| GAM-R6 | `Session.tsx` post-session screen untouched. A test greps it for gamification imports. |
| GAM-R7 | Copy lint (Slice 4). |
| GAM-R8 | Ledgers are written only by `SECURITY DEFINER` functions. `revoke insert/update/delete` from `authenticated`/`anon`. RPC signatures take no amounts. |
| GAM-R9 | The multiplier is applied only in `credit_session` to `earn_company_multiplier`. Bonuses go through a function that has no multiplier parameter. |

### §2 Economy → Slice 1
**SQL** (`setup.sql` block "Gamification · economy", `16-gamification-economy.sql`)
- `sessions`: `add column if not exists listened_sec int`, `is_sos bool default false`, `stereo_checked bool default false`. A `duration_type` column is not needed: Quick/Standard/Deep is a display label of `duration_min`.
- `economy_settings` (single row, key/value typed columns, §2.2 defaults + `count_clinical_sessions false`, `loops_expiry_months null`, `geo_min_active_users 50`, `hr_min_cohort 25`).
- `company_affiliations` + trigger on `profiles` (A16).
- `addon_plans`, `company_addon_subscriptions`. These are created here because the multiplier needs them; the Admin UI comes in Slice 6.
- `points_ledger` and `loops_ledger` as in §2.5, with a unique idempotency key. Indexes on `(user_id, created_at)` and `(period_month, city_ibge_code)`.
- `gam_daily_usage(user_id, day, eligible_minutes, completion_bonuses)` for the daily caps (America/Sao_Paulo).
- Functions:
  - `credit_session(session_id)`: SECURITY DEFINER.
    - `kind='b2c'` only. Clinical sessions are excluded unless the setting is on.
    - Listened time is capped at the nominal duration. The daily caps apply.
    - The credit day and the multiplier window use `least(ended_at, now())`, so a client cannot backdate into a window.
  - `get_wallet()`
  - `backfill_points(from_date)`: admin only, never auto-run.
  - `gam_credit_bonus(user, entry_type, source, centi, funding)`: internal, not granted.
- Trigger `sessions_credit` (after insert, and after update of `completed, listened_sec, ended_at`) calls `credit_session`. Slices 2 and 5 extend it to call `evaluate_achievements` and `update_challenge_progress`.
- `delete_my_account()` is extended: the ledgers, usage, achievements, participations, redemptions and affiliations all `on delete cascade` from `profiles`. Codes assigned to a deleted redemption are released, not reused.

**TS**
- `src/gamification/economy.ts`: `computeSessionCredit(input, settings, ctx) → {points, baseCenti, companyCenti}`, `displayLoops(centi)`, `dayKeySaoPaulo(date)`.
- `src/gamification/__fixtures__/economy.json`: ≥ 12 cases, covering every case listed in §2.6 plus a clinical session and a backdated `ended_at`.
- `src/types/domain.ts`: `SessionRecord` + `listenedSec?`, `sos?`, `stereoChecked?`, `completed`.
- `src/selfuse/Session.tsx`: listened-seconds accumulator and stereo flag in `SessionOutcome` (A13, A14). This is a player-reporting change only; the audio engine is not touched.
- `src/selfuse/SelfUseApp.tsx` `finishSession`: records incomplete sessions server-side (A12).
- `provider.tsx`, `mock.ts`, `supabase.ts`: `getWallet()`, `listLoopsLedger()`, `getEconomySettings()`, `saveEconomySettings()` (admin).
- `tools/test-gam-economy.ts` (fixtures in node) and `supabase/tests/economy_parity.sql` (the same fixtures loaded as JSON, the same outputs asserted).
- `tools/db-gate.mjs` and `tools/db/local-stubs.sql` (A18).
- `src/legal/dataExport.ts`: adds the gamification section (A21).

### §3 Achievements → Slice 2
- **SQL:**
  - `achievement_definitions` and `user_achievements` (unique `(user_id, achievement_id)`).
  - Seeds for §3.2 and §3.3, with `journey_done` and `know_yourself` inactive (A9, A14). The `month1_done` rule is remapped (A9).
  - `evaluate_achievements(user_id)` is SECURITY DEFINER and idempotent. Its bonus goes through `gam_credit_bonus` with `funding_source = 'goodloop'` and no multiplier.
  - Week-based rules (`own_rhythm`) count distinct ISO weeks, never consecutive weeks.
  - `serene_nights` and `work_pause` use `started_at` in America/Sao_Paulo.
  - `mark_achievements_seen(ids[])`.
  - Pathway completion needs a server signal: add `pathway_completions(user_id, pathway_slug, completed_at)` written by an RPC from `SelfUseApp` when `isPathwayComplete` flips.
- **TS:**
  - `src/gamification/achievements.ts` holds the same rules for the mock.
  - DataProvider: `listAchievements()`, `markAchievementsSeen()`, `recordPathwayCompleted()`.
- **UI:**
  - `src/gamification/ui/Badge.tsx` is one SVG with `shape` circle/hexagon, `tier`, `size`, `locked` and an icon from `src/selfuse/icons.tsx`. Icons are added to the `IconName` union as needed.
  - `src/selfuse/ProgressTab.tsx` gets a segmented control "Resumo | Conquistas". Resumo = the existing content, unchanged.
  - `src/selfuse/Conquistas.tsx`: chips, next-achievement card, grid, "Ver todas".
  - `src/selfuse/UnlockSheet.tsx` per §3.4 (A1): it opens over Home on the next app open and is never mounted from the post-session screen.
  - CSS goes in `src/selfuse-studio.css` (gamification section) using the `--su-*` and `--gl-tier-*` tokens.
- **Tests:** `tools/test-gam-achievements.ts` covers thresholds, once-only bonus, SOS exclusion and the non-consecutive weeks rule.

### §4 Geographic ranks → Slice 3
- **SQL:**
  - `br_municipalities` is seeded from `supabase/seed/br_municipalities.csv` (5,570 rows) and loaded into setup.sql as an idempotent `insert … on conflict do nothing` block generated by `tools/gen-municipalities.mjs`. If the full IBGE list can't be fetched, the seed is the 27 capitals plus the 100 largest cities, with a TODO here.
  - `profiles` gets `city_ibge_code`; `state_uf` and `region` come from a join, not stored copies.
  - `geo_ranking` is added to the `consent_events` purposes (TS `ConsentPurpose` in `src/legal/records.ts`).
  - `points_ledger.city_ibge_code` is snapshotted only while consent is granted. Revoking stops future snapshots, and the views exclude the user's rows after the revocation timestamp.
  - Materialized views `geo_city_month`, `geo_state_month`, `geo_region_month` and `geo_national` (unique indexes for `refresh … concurrently`).
  - `get_geo_rankings(scope, period, limit)` applies the 50-active-users threshold.
  - `refresh_geo_and_collectives()` also evaluates the collective achievements.
  - pg_cron is guarded: `do $$ begin create extension if not exists pg_cron; exception when others then raise notice … end $$;`. The schedule is created only if `cron.schedule` exists.
- **TS:**
  - `src/gamification/geo.ts` handles the threshold and ranking for the mock. Mock demo users are spread across the 5 cities.
  - DataProvider: `searchMunicipalities(q)`, `setMyCity()`, `getGeoRankings()`, `adminRefreshGeo()`.
- **UI:**
  - `src/selfuse/Coletivas.tsx` (the Coletivas sub-view): the opt-in prompt on first open, the city card, the rankings with Cidades/Estados/Regiões chips, the hexagon badges and the footnote.
  - `ProfileTab.tsx` privacy page: the "Participar dos rankings" toggle and the city picker (`CityPicker.tsx`, "Campinas · SP").
  - Admin: a "Ricalcola ora" button in the Economia section.

### §5 Public challenges → Slice 5
- **SQL:**
  - Enums `challenge_format`, `challenge_status` and `challenge_metric` (`minutes_listened`, `sessions_completed`, `deep_sessions_completed`, `sessions_in_time_window`, `pathway_completed`).
  - The `challenges` table has a check `scope <> 'user'` and checks for the scope_ref shape.
  - `challenge_participation` and the `challenge_collective_progress` view.
  - Functions:
    - `update_challenge_progress(user, session)`
    - `settle_challenges()`: idempotent; runs the raffle with `gen_random_uuid` ordering recorded in `challenge_raffle_draws` for audit.
    - `admin_upsert_challenge(...)`, which validates GAM-R1–R4 and refuses to publish otherwise.
    - `get_my_challenges()`
  - Settlement uses the guarded pg_cron hourly, plus an admin button.
- **TS:**
  - `src/gamification/challenges.ts` holds the validation and progress rules, shared by the admin stepper's live check and the mock.
  - DataProvider: `listMyChallenges()`, `getChallenge()`, `adminListChallenges()`, `adminSaveChallenge()`, `adminChallengeAction()`.
- **UI app:**
  - `src/selfuse/ChallengeCard.tsx` at the top of `Explore.tsx` (max one, priority per A5).
  - `src/selfuse/ChallengeDetail.tsx`: progress ring, "Como funciona", reward, sticky "Iniciar sessão". The CTA opens the existing session flow; the app never chooses a session for the person (MN-04).
- **UI admin:** `src/admin/Challenges.tsx` (list and KPIs) and `src/admin/ChallengeEditor.tsx` (6-step stepper, locked rules box, live Home-card preview), in Italian (A7).
- **Tests:** `tools/test-gam-challenges.ts` covers forbidden scopes and metrics, the window boundaries, SOS, and settlement idempotency.

### §6 Benefits tab + wallet → Slice 4
- **SQL:**
  - Tables `benefits`, `benefit_codes` (RLS: select only where the code's redemption belongs to `auth.uid()`), `benefit_redemptions`, `benefit_tags` and `benefit_tag_map`.
  - A deferred constraint trigger enforces at least one tag for `owner='goodloop'`.
  - Seed tags.
  - `get_available_benefits()`, `redeem_benefit(benefit_id, consent_identified bool)` and `admin_refund_redemption(id)`.
  - `redeem_benefit` uses `pg_advisory_xact_lock(hashtext(user_id))` and `select … for update skip locked` on codes.
  - `company_disabled_tags` is created now (the filter reads it) and is written only from Slice 6.
  - The `partner_products` migration (A15).
- **TS:**
  - `src/gamification/benefits.ts` holds availability and affordability ("cerca de N sessões Standard").
  - DataProvider: `getAvailableBenefits()`, `redeemBenefit()`, `listMyRedemptions()`, plus the admin catalog, tags, codes CSV, refund and redemptions list methods.
- **UI app:** `src/selfuse/BenefitsTab.tsx` replaces `PartnersTab.tsx` in the tab bar (A10). It holds the "Seu cuidado" header, next milestone, pillars, challenge-unlocked benefits and "Meus benefícios", plus `BenefitSheet.tsx` (detail → confirm → code).
- **UI admin:** `src/admin/Benefits.tsx` (catalog CRUD, tags ≥ 1, CSV codes, pause/archive, redemptions, refunds) and `src/admin/Tags.tsx`.
- **Lint:** `tools/test-gam-copy.ts` fails on any §6.5 forbidden word or lexicon measurement word (A6) in `PT_GAMIFICATION` values and in string literals of the Benefits/Challenge files.

### §7 Company add-on → Slice 6
- **SQL:**
  - The plan seeds are already in place from Slice 1.
  - `company_disabled_tags` gets its history (`enabled_at` null = currently disabled).
  - `hr_set_tag_disabled()`, `hr_upsert_company_benefit()`, `hr_upload_codes()` and `hr_upsert_company_challenge()` (template-only, A4; whole company only; company-funded bonus).
  - `hr_addon_dashboard()` gives company aggregates with n ≥ 25 and complementary suppression (A2).
  - `hr_identified_redemptions()` returns only rows with `consent_identified_at`.
  - Every function checks `is_hr()`, `my_company_id()` and an active subscription with the feature flag.
- **TS / UI HR** (`src/corporate/`):
  - New nav entries: Sfide/Desafios (Add-on), Benefícios (Add-on) and Plano, shown only with an active subscription.
  - A persistent privacy banner.
  - `AddonBenefits.tsx` has two tabs: abertos (the tag filter with a confirm summary) and da empresa (3 delivery modes).
  - `AddonChallenges.tsx` (templates, Checagem Good Loop), `AddonDashboard.tsx` and `AddonPlan.tsx`.
  - Strings go in `src/i18n/corporate.ts`.
  - The D-09 gate stays in front of everything.
- **App:**
  - Company challenge and benefit chips.
  - The identified-redemption consent step, which shows exactly the name and employee ID that will be shared.
  - The multiplier line appears only in the Benefits header.
- **Tests:** `tools/test-gam-company.ts` covers the multiplier window and affiliation end, the tag filter applied server-side in the mock, k suppression and complementary suppression.

### §8 Admin → Slices 1/4/5/6/7
`src/admin/AdminApp.tsx` gets these sections (Italian labels):

| Section | File | Slice |
|---|---|---|
| Economia | `Economy.tsx`, with live calculator and the geo recalc | 1 UI deferred to 7; settings RPC in 1 |
| Traguardi | `Achievements.tsx` | 2 |
| Sfide | `Challenges.tsx` | 5 |
| Benefici | `Benefits.tsx` | 4 |
| Tag | `Tags.tsx` | 4 |
| Piani e aziende | `Plans.tsx` | 6 |
| Report | `GamReports.tsx`, with CSV export of multiplier Loops per company per month | 7 |

### §9 Visual → all UI slices
See A20. A new `--gl-tier-*` token block goes in `src/index.css`. No emoji. Touch targets ≥ 44 px.

### §10 Slice 7
- Demo seed:
  - SQL: `supabase/seed_gamification_demo.sql`.
  - Mock: `src/data/mock.ts` extension. Contents: Aurora Alimentos (Premium 1.5×, "Alimentos e bebidas" disabled), ~40 users in the 5 cities, Outubro Sereno / Semana do Sono / Novembro em Loop, ~15 benefits with `[PARCEIRO]`. For mock rankings to show, the demo needs ≥ 50 active per city; the mock lowers `geo_min_active_users` to 5 in demo mode only, and this is labelled in the UI as demo.
- `docs/gamification/TEST_SCENARIOS.md` (pt-BR, one per acceptance criterion).

---

## D. Order and gates
1 Economy core → 2 Achievements → 3 Geo → 4 Benefits → 5 Challenges → 6 Company → 7 Admin/demo. That is the spec order. Slice 4 comes before 5 because challenge rewards can reference benefits.

Each slice ends with:
- `npx tsc --noEmit`
- `npm run build`
- `npm test` (all suites, including the existing ones)
- `node tools/db-gate.mjs` (fresh apply, re-apply, notify check, SQL parity)
- one commit on `feature/gamification`

Nothing is pushed without your request.
