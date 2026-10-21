# Good Loop — Gamification build
### Loops economy · Achievements · Geographic ranks · Challenges · Health-first Benefits · Company add-on

> Prompt for Claude Code. Save this file in the repo as `docs/gamification/SPEC.md` and treat it as the single source of truth for this feature. If PNG exports of the stakeholder mockups exist in `docs/gamification/mockups/`, use them as visual reference — but where a mockup and this spec disagree, **this spec wins** (the founders changed several rules after the mockups were made; see §11).

---

## 0. How to work

1. **Explore first, change nothing.** Before writing code, map the existing codebase and find:
   - the B2C app shell and tabs (`AppShell`, `ConsumerApp`, `HomeSession`, `JourneyTab`, `Progress`, `Profile`), the journey engine (`src/journey/`), and the **Benefits tab** (if no Benefits tab exists yet, you will create it in Slice 4);
   - where a finished session is recorded (`recordSession` on the DataProvider) and what the session record contains (protocol, duration type, SOS flag, completion, listened time);
   - the DataProvider interface and **both** implementations (mock + Supabase);
   - `setup.sql`, existing RLS policies, roles (employee, therapist, employer/HR, admin) and the tenant/company model (invitation code → company);
   - the Admin console, the Employer/HR dashboard, the i18n files (`pt`, `it`, `en`) and existing CSS tokens/components.
2. Write `docs/gamification/PLAN.md`: for every section of this spec, list the files you will create or change, the new tables/functions, and any conflict you found with existing code. **Stop and wait for my OK** before Slice 1.
3. Then implement **slice by slice** (§10) on the branch `feature/gamification`, one commit per slice. Don't start the next slice until the current one passes the gates.
4. **Gates for every slice** (all must pass):
   - `npx tsc --noEmit` and `npm run build` clean;
   - `setup.sql` applied to a **fresh** local Postgres 16 database and then **re-applied** to the same database without errors (idempotent);
   - `setup.sql` ends with `notify pgrst, 'reload schema';`;
   - node proofs (esbuild-bundled, same pattern the repo already uses) for the pure economy/evaluation logic, including the parity fixtures in §2.6.
5. Constraints:
   - TypeScript strict, React 18, custom CSS only (no UI framework). Reuse existing components and tokens; brand hex values in §9 are a fallback.
   - Every new DataProvider method exists in **both** mock and Supabase providers. Demo mode must work end to end on mock data.
   - Do **not** touch the audio engine, Sound Studio, protocol parser, TTS or the clinical (therapist) workspace.
   - All employee-facing copy in **pt-BR**. Add every key to `pt`, `it` and `en` (pt is authoritative; it/en can be first-pass translations).
   - Where this spec leaves a value open, implement the default from §12 as configuration and note it in PLAN.md. Do not block on it.

---

## 1. Product principles (non-negotiable)

Good Loop is a **health tech company**, not a store. **Loops** are, literally, the audio loops that take care of your mental health; they turn into benefits that go *beyond* health. Every screen must make the person feel that taking care of themselves is the point, and benefits are a consequence.

| ID | Rule |
|---|---|
| **GAM-R1** | **No streaks, no guilt, nothing is ever lost.** No "X days in a row", no broken-streak messages, no decaying progress. Achievements are permanent. Points never decrease. (Extends RN-AI-04.) |
| **GAM-R2** | **Reward usage, never results.** No goal, achievement, challenge or reward may depend on assessment scores (DASS-21, PSS-10, BRS…), VAS / VAS delta, or any clinical value. Completing an assessment *may* count (participation), its result never. |
| **GAM-R3** | **SOS sessions earn nothing and count for nothing** (no points, no Loops, no challenge or achievement progress). Nobody should hesitate to use SOS because of a game. |
| **GAM-R4** | **No micro-collectives.** Collective scopes allowed: **national, region, state, city** (only cities above the minimum population, §4.3) and **whole company**. Never team, area, department, unit, site, group or "friends". Enforce this in the schema (enum without those values) and in validation — not only in the UI. |
| **GAM-R5** | **Privacy by default (LGPD).** City comes from a value the user declares in their profile (opt-in, recorded consent) — **never GPS**. Aggregates below the k-threshold are hidden. HR never sees individuals, balances or redemptions, except in an *identified redemption* the employee explicitly consents to (§7.4). (Extends RN-LGPD-01/02/06/07.) |
| **GAM-R6** | **Celebration at the right moment.** Nothing from gamification appears on the post-session screen (RN-UX-03 stays: one metric, max 2 CTAs). Unlocks and Loops earned are shown on the next Home visit and in Progress/Benefits. |
| **GAM-R7** | **Health-first, never e-commerce** (copy glossary and forbidden patterns in §6.5). |
| **GAM-R8** | **The server is the source of truth.** The client never sends point or Loop amounts. All credits and debits are computed by database functions, are idempotent and are written to append-only ledgers. |
| **GAM-R9** | **The company multiplier affects only Loops earned from listening.** It never changes Points, rankings, achievement thresholds, challenge progress or bonus Loops. |

---

## 2. Economy: Points → Loops

### 2.1 Definitions
- **Points (Pontos):** a measure of care. Generated **only by listening to protocols**. Cumulative, never spent, never decrease. Used for achievement progress, challenge progress and **geographic ranks**.
- **Loops:** the app currency. Generated **from Points** at a configurable rate, plus **bonus Loops** (achievements, challenges). Spent on benefits. Shown as whole numbers.
- **Multiplier:** a company add-on plan can multiply the Loops its employees earn from listening (e.g. Aurora bought the add-on with **1.5×** → its employees receive 1.5× Loops per minute listened).

### 2.2 Earning rules (defaults in `economy_settings`, editable in Admin)
| Setting | Default |
|---|---|
| `points_per_minute` | 1 point per full minute actually listened |
| `points_per_completed_session` | +10 when the session is completed |
| `daily_minutes_cap` | 120 eligible minutes per day (America/Sao_Paulo) |
| `daily_completion_bonus_cap` | 4 completion bonuses per day |
| `loops_per_point` | 0.1 (10 points = 1 Loop) |
| `min_contribution_points` (collectives) | 30 points in the period |

- Listened time = seconds the audio actually played (pauses excluded), **server-capped at the protocol's nominal duration**. If the session record does not carry listened seconds yet, add the field and have the player report it.
- SOS sessions: zero (GAM-R3). Sessions run inside the therapist (B2B) console: excluded for now (`count_clinical_sessions = false`).
- No retroactive credit for sessions recorded before launch (a one-off `backfill_points(from_date)` admin function may exist but is not run automatically).

### 2.3 Loops calculation per session
```
points            = floor(listened_minutes_capped) * points_per_minute
                  + (completed && under_daily_bonus_cap ? points_per_completed_session : 0)
base_centiloops   = round(points * loops_per_point * 100)
company_centiloops= round(base_centiloops * (multiplier - 1))     -- only if the user has an active
                                                                   -- affiliation to a company whose add-on
                                                                   -- subscription is active at session end
```
Store Loops in **integer centiloops** (1 Loop = 100) to avoid floating point. Display `floor(balance / 100)`.

### 2.4 Worked example
Ana (employee of Aurora, add-on 1.5×) completes a Standard 12-min session:
points = 12 + 10 = **22** → base = 2.20 Loops (220) → company bonus = 1.10 Loops (110) → **3.30 Loops** total, as two ledger entries. Her Points (22) are identical to a B2C user's: rankings stay fair.

### 2.5 Ledgers (append-only)
- `points_ledger(id, user_id, source_type, source_id, points, period_month, city_ibge_code, created_at)` — `city_ibge_code` snapshotted at credit time so ranks don't shift retroactively when someone moves.
- `loops_ledger(id, user_id, entry_type, amount_centi /* signed */, funding_source /* 'goodloop' | 'company' */, company_id null, multiplier_applied numeric null, source_type, source_id, created_at)`
  - `entry_type ∈ { earn_listening, earn_company_multiplier, achievement_bonus, challenge_bonus, redemption, redemption_refund, admin_adjustment }`
  - **Unique idempotency key** on `(user_id, entry_type, source_type, source_id)`.
- Balance = `sum(amount_centi)`; expose via function `get_wallet()`. A balance can never go negative (enforced in the redemption function under a per-user lock).
- No expiry by default (`loops_expiry_months = null`).
- Account deletion (Right to Disappear) removes both ledgers, redemptions and consent records. Data export (PDF) includes Points, Loops ledger, achievements and redemptions.

### 2.6 Implementation
- Supabase: crediting runs in a `SECURITY DEFINER` function called by a trigger on session insert/complete (`credit_session(session_id)`), then calls `evaluate_achievements(user_id)` and `update_challenge_progress(user_id, session_id)`.
- Mock provider: the same rules in a pure module `src/gamification/economy.ts` (no React, no I/O).
- **Parity fixtures:** `src/gamification/__fixtures__/economy.json` with ≥ 12 cases (partial listen, cap hit, SOS, completion bonus cap, multiplier 1.0/1.25/1.5/2.0, user without company, expired subscription, rounding). Both the node proof and a SQL test script must produce identical outputs for every case.

---

## 3. Achievements

### 3.1 Model
- `achievement_definitions(id, slug, kind /* individual | collective */, scope /* user | city | state | region | national | company */, metric, threshold, period /* lifetime | month */, tier, icon, bonus_loops_centi, active, sort_order)`
- `user_achievements(user_id, achievement_id, unlocked_at, seen_at null)` — unique per user/achievement; **one-time and permanent**.
- Bonus Loops credited once, on unlock, `funding_source = 'goodloop'`, **not multiplied** (GAM-R9).
- Evaluation: individual → after every credit; collective → scheduled job (§4.4) plus on demand from Admin.

### 3.2 Individual achievements (seed — thresholds and bonuses editable in Admin)
Tiers: **Semente → Broto → Raiz → Copa**. Default bonus by tier: Semente 20, Broto 50, Raiz 100, Copa 250 Loops.

| Slug | Name (pt-BR) | Rule | Tier |
|---|---|---|---|
| first_loop | Primeiro Loop | Complete the first session | Semente |
| stereo_ready | Fones a postos | Pass the stereo check and complete a session with headphones | Semente |
| know_yourself | Conhecer-se | Complete the initial self-assessment (participation only, never the result) | Semente |
| listen_1h | Horas de escuta I | 1 h listened | Semente |
| listen_5h | Horas de escuta II | 5 h listened | Broto |
| listen_20h | Horas de escuta III | 20 h listened | Raiz |
| listen_50h | Horas de escuta IV | 50 h listened | Copa |
| deep_dive | Mergulho profundo | Complete one Deep (24 min) session | Broto |
| explorer | Explorador | Complete Quick, Standard and Deep at least once each | Broto |
| own_rhythm | Ritmo próprio | Sessions in 4 different weeks (**not** consecutive — GAM-R1) | Broto |
| serene_nights | Noites serenas | 5 sessions started after 21:00 | Broto |
| work_pause | Pausa no expediente | 5 sessions on weekdays between 12:00 and 14:00 | Broto |
| month1_done | Mês 1 completo | Finish journey phase "Introdução e Estabilização" | Raiz |
| journey_done | Jornada completa | Finish the 12-week journey | Copa |
| first_challenge | Primeiro desafio | Complete one challenge (public or company) | Broto |
| challenger | Desafiante | Complete 5 challenges | Raiz |

All "sessions" above exclude SOS.

### 3.3 Collective achievements (hexagon badges)
Awarded to every user who contributed at least `min_contribution_points` in the qualifying period. One-time per user.

| Slug | Name | Rule | Scope |
|---|---|---|---|
| city_in_loop | Cidade em Loop | User's city reaches 100,000 points in a calendar month | city |
| calm_capital | Capital da calma | City ranks #1 in points per active person in a month | city |
| collective_nights | Noite serena coletiva | City reaches 1,000 night sessions (after 21:00) in a month | city |
| state_in_tune | Estado em sintonia | 20 cities of the state with active people in a month | state |
| region_in_loop | Região em Loop | IBGE region reaches its monthly points goal | region |
| brazil_in_loop | Brasil em Loop | National milestone: 1,000,000 hours listened (lifetime) | national |
| company_in_loop | Empresa em Loop | ≥ 60% of the company's eligible employees did ≥ 1 session in a month (add-on companies only) | company |
| company_in_tune | Empresa em sintonia | The whole company completes a company collective challenge | company |

There are **no** area/unit/team achievements (GAM-R4).

### 3.4 UI
- **Progress tab → segmented control "Resumo | Conquistas".** Under Conquistas: chips "Individuais · 7 de 16" / "Coletivas · 3 de 8"; a "Próxima conquista" card (badge, name, progress bar, "3h 40min de 5h · faltam 80 min"); a 3-column badge grid (unlocked in tier colours, locked in greyed state with "Bloqueada"); link "Ver todas as 16 conquistas".
- **Unlock sheet** (bottom sheet over Home, on the **next app open** — never after a session, GAM-R6): large badge with two faint orbit ellipses, eyebrow "Conquista desbloqueada", name, one warm sentence ("Você concluiu sua primeira sessão Deep de 24 minutos. Que bom ter dedicado esse tempo a você."), pill "+50 Loops de bônus", primary "Ver minhas conquistas", text button "Agora não". Queue multiple unlocks into one sheet with a pager. Mark `seen_at` on close.
- **Badge visual system:** individual = circle; collective = hexagon (shape differs, not only colour). Each badge: outer ring, inner fill, two faint rotated ellipses (the "loop" motif from the logo) and a centred stroke icon. Tier colours in §9. Locked = `#ECEADB` fill, `#8E8B7A` icon. Build it as one reusable `<Badge icon tier shape size locked />` SVG component.

---

## 4. Geographic ranks

### 4.1 Opt-in
- New profile fields: `city_ibge_code`, `state_uf` (derived), `region` (derived). Asked the first time the user opens Conquistas › Coletivas (and editable in Perfil): "Quer que seus pontos somem para a sua cidade? Usamos só a cidade que você informar, nunca sua localização."
- Store as a separate consent purpose `geo_ranking` with timestamp (RN-LGPD-01/02). Revoking it stops future attribution (past ledger rows keep their city snapshot but are excluded from views for that user going forward). Toggle "Participar dos rankings" in Perfil.
- Without opt-in the user still earns everything individually; they just don't count for collectives.

### 4.2 Reference data
- Table `br_municipalities(ibge_code, name, uf, region)` with all IBGE municipalities, seeded from a CSV committed to the repo (`supabase/seed/br_municipalities.csv`). If the full list can't be obtained offline, seed the 27 capitals plus the 100 largest cities and leave a TODO in PLAN.md.
- City picker: searchable input by name with UF suffix ("Campinas · SP").

### 4.3 Metrics and thresholds
- Period: current calendar month (America/Sao_Paulo) and all-time.
- Metric for ranking: **points per active person** (active = ≥ 1 eligible session in the period), so small cities compete fairly with São Paulo. Totals are shown too.
- A city appears in any ranking or collective goal only if it has ≥ `geo_min_active_users` (default **50**) active people in the period. States/regions/national have no lower bound beyond k.
- Ranks are based on **Points only** (GAM-R9).

### 4.4 Computation
- Materialized views `geo_city_month`, `geo_state_month`, `geo_region_month`, `geo_national` + function `get_geo_rankings(scope, period, limit)` that returns only rows above the threshold, plus the caller's own city position (even if outside the top N).
- Refresh + collective-achievement evaluation every 15 min via `pg_cron` when the extension is available (guard `create extension if not exists` so local Postgres without pg_cron still applies cleanly); otherwise an Admin button "Recalcular agora".

### 4.5 UI (Progress › Conquistas › Coletivas)
- Violet city card: pin icon + "São Paulo · SP", "Meta da cidade: Cidade em Loop", big number "84.320 de 100.000 pontos", progress bar in sandy, "Sua contribuição: 412 pontos este mês".
- Card "Ranking de cidades · pontos por pessoa ativa": top 5 with the user's city highlighted ("São Paulo · sua cidade"), tab or chip to switch Cidades / Estados / Regiões.
- Row of collective hexagon badges (unlocked + locked).
- Footnote: "Usamos a cidade do seu perfil, nunca sua localização. Você pode sair do ranking no Perfil."

---

## 5. Challenges (temporary events)

### 5.1 Concept
A challenge is a **time-boxed event**. Two formats only:
- **Individual:** each person reaches their own goal inside the window.
- **Massive collective:** everyone in a large scope works toward one shared goal. Public scopes: `national | region | state | city` (city only above the threshold). Company scope: `company` (the **whole company**, never a subset). **No teams, areas or groups** (GAM-R4) — the schema must not allow them.

### 5.2 Model
- `challenges(id, owner /* 'goodloop' | company_id */, title, description, badge_icon, format /* individual | collective */, scope, scope_ref /* ibge_code, uf, region or company_id */, metric, goal_value, per_person_min /* collective: min contribution to receive the reward */, starts_at, ends_at, status /* draft | scheduled | active | ended | settled | cancelled */, reward_bonus_loops_centi null, reward_benefit_id null, reward_rule_when_out_of_stock /* first_to_complete | raffle */, announce_in_app bool, created_by, published_at)`
- `challenge_participation(challenge_id, user_id, progress_value, contributed_points, completed_at null, rewarded_at null)`
- `challenge_collective_progress(challenge_id, total_value, participants)` (or a view).
- Metrics (enum): `minutes_listened`, `sessions_completed`, `deep_sessions_completed`, `sessions_in_time_window` (with start/end hour), `journey_phase_completed`. **Forbidden:** anything in GAM-R2, consecutive-day metrics (GAM-R1), anything counting SOS (GAM-R3).
- Only sessions whose end time falls inside `[starts_at, ends_at]` count.

### 5.3 Rewards
- `reward_bonus_loops_centi`: bonus Loops (not multiplied).
- `reward_benefit_id`: an **exclusive benefit** that becomes redeemable only by people who completed the challenge (its Loop price can be 0 or reduced). Stock rule: first to complete, or raffle at settlement.
- Individual challenges reward immediately on completion. Collective challenges reward at goal reach (or at settlement) to everyone with `contributed ≥ per_person_min`.
- Settlement job at `ends_at`: finalize, run raffles, set `settled`. Idempotent.

### 5.4 Admin — "Desafios" (Good Loop public challenges)
- **List:** header "Desafios Good Loop" + primary "Novo desafio"; KPIs (Desafios ativos, Pessoas participando, Concluíram, Recompensas entregues); filter chips Todos / Ativos / Agendados / Rascunhos / Encerrados; search; table columns: Desafio (badge + name), Período, Formato/Escopo, Meta, Recompensa, Participam / concluíram, Status (coloured pill), actions menu (Editar, Duplicar, Encerrar, Cancelar). Info cards: "Regras fixas em todo desafio" and "Estoque de recompensas".
- **Create/edit (stepper):** 1 Informações (name, short description, badge icon picker) · 2 Período (start, end, timezone) · 3 Formato e meta (Individual / Coletivo massivo; scope picker national/region/state/city with live check "população ativa suficiente"; metric; goal value; per-person minimum for collectives) · 4 Recompensa (bonus Loops and/or exclusive benefit from the catalog; quantity; out-of-stock rule) · 5 Comunicação (announce in app — one gentle message, no repeated pushes) · 6 Revisar e publicar (Salvar rascunho / Agendar / Publicar agora).
- Locked info box (not editable): "Sessões SOS nunca contam · sem metas sobre autoavaliações ou VAS · sem sequências diárias · ninguém perde progresso · sem equipes ou grupos pequenos."
- Right column: live preview of the Home card as the user will see it + estimated reach.

### 5.5 App
- **Home:** keep the single-CTA Home (big "Iniciar sessão" orb, journey week chip, one "Para você hoje" card). Add **at most one** challenge card under the orb: badge, eyebrow ("Desafio Good Loop · faltam 9 dias" or "Desafio da sua empresa · faltam 12 dias"), title, progress bar, "3h 12min de 5h", and the reward line ("+300 Loops" or the benefit name). Priority when several are active: company challenge > closest to completion > ending soonest. Tapping opens the detail.
- **Challenge detail:** back button, status pill, eyebrow with dates, title, one-sentence description, progress ring (individual: your progress; collective: shared progress + "Sua parte" + participants count), "Como funciona" checklist (the goal, which sessions count, "Sessões SOS não contam: use-as sempre que precisar."), reward card, sticky primary "Iniciar sessão".
- Collective detail never shows other people's names or individual rankings.

---

## 6. Benefits tab — health-first, Loops wallet

### 6.1 Intent
The tab must read as **care that comes back to you**, not as a shop. The person's care habit is the hero; Loops are the evidence of that care; benefits are what care unlocks beyond health.

### 6.2 Layout (top to bottom)
1. **"Seu cuidado" header card** (green, calm): minutes and sessions dedicated this month ("Você dedicou 3h 40min a você este mês"), the Loops balance as a consequence ("= 412 Loops"), a one-line explainer ("Cada Loop nasce de um minuto de cuidado com a sua mente."), and a secondary "Iniciar sessão" button. If the company has a multiplier: "Sua empresa multiplica seus Loops em 1,5×".
2. **"Próximo marco de cuidado"**: the next achievement or the active challenge, with progress.
3. **Benefits grouped by wellbeing pillar** (not shop categories): **Sono · Mente · Corpo · Movimento · Alimentação · Pausas e lazer**. Each pillar shows a short curated list (max ~6 items, no infinite scroll — RN-UX-02). Each card: pillar icon tile, title, partner, a "Por que isso cuida de você" line, price in Loops ("Trocar por 50 Loops"). If the balance is not enough: gentle progress ("Faltam 12 Loops · cerca de 2 sessões Standard").
4. **"Desbloqueados por desafios"**: exclusive benefits the user earned.
5. **"Meus benefícios"**: redeemed items with code, copy button, validity, how to use.

### 6.3 Redemption flow
Card → detail sheet (description, why it cares for you, partner, validity, terms) → confirm "Trocar 50 Loops por este benefício?" → `redeem_benefit(benefit_id)` (atomic: availability for this user incl. company tag filter, stock, per-user limit, balance, code assignment, ledger debit) → success state showing the code. Refund function for admin (`redemption_refund`).

### 6.4 Catalog model
- `benefits(id, owner /* 'goodloop' | company_id */, title, description, care_rationale, partner_name, pillar, price_loops_centi null, stock_total null, stock_remaining null, per_user_limit, valid_from, valid_to, code_validity_days, delivery_type /* code_pool | static_code | link | collective | identified */, terms, image_asset, status /* draft | active | paused | archived */, challenge_exclusive_id null)`
- `benefit_codes(id, benefit_id, code, redemption_id null)` — codes readable **only** by the redeeming user (RLS).
- `benefit_redemptions(id, user_id, benefit_id, loops_spent_centi, code_id null, status, consent_identified_at null, created_at, expires_at)`
- **Tags** — every Good Loop benefit must have **at least one tag** (validation in Admin and a DB check via trigger):
  - `benefit_tags(id, slug, label, tag_group /* partner_segment | benefit_type */, description, active)`
  - `benefit_tag_map(benefit_id, tag_id)`
  - Seed tags — partner segment: Beleza e cuidado pessoal · Alimentos e bebidas · Farmácia e saúde · Academias e esportes · Apps de bem-estar · Viagens e turismo · Livros e cultura · Tecnologia e áudio · Moda · Varejo. Benefit type: Desconto · Gratuidade · Experiência · Produto físico · Doação.
- Availability for a user = active public benefits **minus** any benefit carrying a tag disabled by the user's company (only if the company has an active add-on) **plus** the company's own benefits **plus** challenge-exclusive benefits the user earned. Enforced server-side in `get_available_benefits()` and again inside `redeem_benefit()` — never only in the UI.
- Already-redeemed codes stay visible to the user even if the company later disables that tag.

### 6.5 Copy glossary and forbidden patterns (GAM-R7)
| Use | Never use |
|---|---|
| Trocar Loops / Resgatar | Comprar, Carrinho, Checkout, Loja, Shop |
| Benefício, Cuidado, Marco de cuidado | Oferta, Promoção, Imperdível, Liquidação |
| "Faltam 12 Loops · cerca de 2 sessões" | "Últimas unidades!", "Só hoje!" |
| Loops (as care evidence) | Saldo de compras, cashback |

Forbidden UI patterns: countdown timers on benefits, strikethrough prices, scarcity badges, "mais vendidos", infinite scroll, cross-sell carousels, push notifications about benefits. Challenge end dates may show "faltam N dias" in neutral tone.

---

## 7. Company add-on (sold to HR)

### 7.1 Plans and multipliers (managed by Good Loop Admin)
- `addon_plans(id, name, loops_multiplier numeric, allows_company_challenges bool, allows_company_benefits bool, allows_tag_filter bool, active)` — seed: **Essencial 1.0×**, **Plus 1.25×**, **Premium 1.5×**, **Max 2.0×** (names and values are placeholders; editable).
- `company_addon_subscriptions(id, company_id, plan_id, starts_at, ends_at null, status)`. The multiplier applies to listening sessions that **end** while the subscription is active and the employee's affiliation is active.
- The multiplier portion is a separate ledger entry (`earn_company_multiplier`, `funding_source = 'company'`) so Good Loop can report and bill Loops issued per company per month.

### 7.2 HR portal — new add-on sections
Navigation adds **Desafios (Add-on)**, **Benefícios (Add-on)** and **Plano**. Persistent privacy banner: "Você vê apenas resultados agregados da empresa. Nomes só aparecem quando o colaborador escolhe se identificar para resgatar um benefício."

**a) Benefícios › Benefícios abertos** — the tag filter:
- List of all `partner_segment` and `benefit_type` tags with a toggle each (all ON by default), a count "afeta N benefícios", and an expandable preview of the affected benefits.
- Turning a tag OFF hides every public benefit carrying that tag for this company's employees. Show a confirmation summary ("Seus colaboradores deixarão de ver 7 benefícios") and log `company_disabled_tags(company_id, tag_id, disabled_by, disabled_at)` with history.
- Example in demo data: Aurora Alimentos (a food company) disables "Alimentos e bebidas" for conflict of interest.

**b) Benefícios › Benefícios da empresa** — company-own benefits (same model, `owner = company_id`): title, description, care rationale, pillar, Loop price and/or "só por desafio", quantity, and **delivery mode**:
- **Código / voucher** — HR uploads a CSV of codes; HR never learns who redeemed (anonymous);
- **Coletivo** — delivered to the whole company (e.g. a company-wide breakfast); nobody is identified;
- **Resgate identificado** — for days off or physical items: at redemption the employee sees exactly what will be shared (name + employee ID) and must tick an explicit consent; consent stored with timestamp; HR sees only these consented redemptions.

**c) Desafios** — same generator as §5.4, restricted to: format Individual or Coletivo (scope = **whole company only**); rewards = company bonus Loops (`funding_source = 'company'`) and/or a company benefit; a "Checagem Good Loop" box that validates GAM-R1/R2/R3/R4 automatically and shows ✓ per rule; templates to start from (Boas-vindas, Sono em dia, Pausa consciente, Empresa em sintonia).
**d) HR dashboard for the add-on:** KPIs (Desafios ativos, Adesão ao desafio %, Loops gerados pelo multiplicador no mês, Benefícios resgatados) and per-challenge cards — **company-level aggregates only, no breakdown by area/unit/team**, and any figure based on fewer than `k = 10` people is hidden.
**e) Plano** (read-only): current plan, multiplier, included features, contact for upgrade.

### 7.3 Employee app
- Company challenges appear with the company's name/logo chip ("Desafio da sua empresa").
- Company benefits appear inside their pillar with the company chip.
- If the multiplier is active, the Benefits header says so; nowhere else.
- Collective company detail shows only the company-wide percentage and "Sua parte". Privacy line: "A empresa vê só o resultado geral. Para benefícios identificados, você decide se compartilha seu nome."

### 7.4 Roles and RLS
- Employee: own ledgers, achievements, participations, redemptions (read); writes only through RPCs.
- HR: company-scoped configuration tables (read/write); aggregates only through functions that enforce k; consented identified redemptions only.
- Good Loop Admin: everything, plus economy settings, plans, tags, public catalog, public challenges and reports.
- No client role can insert into `points_ledger` or `loops_ledger` directly.

---

## 8. Good Loop Admin console — new sections
Sidebar adds: **Economia · Conquistas · Desafios · Benefícios · Tags · Planos e empresas · Relatórios**.
- **Economia:** edit §2.2 settings with a live calculator ("Uma sessão Standard concluída gera X pontos e Y Loops; com 1,5× gera Z").
- **Conquistas:** list of definitions; edit threshold, bonus, active; preview badge.
- **Desafios:** §5.4.
- **Benefícios:** catalog CRUD, tags (≥ 1 required), pillar, care rationale, Loop price, stock, CSV code upload, pause/archive, redemption list, refunds.
- **Tags:** CRUD of the tag taxonomy and how many companies disabled each.
- **Planos e empresas:** plan CRUD; assign/change/end a company's subscription.
- **Relatórios:** Points and Loops issued (by source and funding), Loops redeemed, redemptions by benefit, Loops issued via multiplier per company per month (CSV export for billing), challenge results.

---

## 9. Visual direction (from the approved stakeholder mockups)
- Brand: Emerald `#009B77` (decorative), primary button `#00785C` with white text, deep green text `#0E3527`, body text `#1F2A26`, muted `#55625C`; cream background `#FAF8DF`, lemon `#F4F0BE`; mints `#3DB189` `#7AC69B`, celadon `#B7DBAD`, tea `#E3EDC6`; violet `#533360` (collectives), sandy `#E89D64` (rewards accent), blue `#2465AB` (national / company chip). Borders `#E7E4CC`. Font: the project font if defined; otherwise Figtree.
- Badge tier colours (fill / ring / icon): Semente `#E3EDC6/#B7DBAD/#2F5B3A` · Broto `#B7DBAD/#7AC69B/#1F4A33` · Raiz `#3DB189/#7AC69B/#0E3527` · Copa `#00785C/#3DB189/#FAF8DF` · Coletiva `#533360/#E89D64/#F4F0BE` · Nacional `#2465AB/#F4F0BE/#FFFFFF` · Empresa `#3B2A47/#E89D64/#F4F0BE` · Bloqueada `#ECEADB/#D9D6C3/#8E8B7A`.
- Cards: white, radius 20, 1px border. Pills: radius 999, 12px bold. Touch targets ≥ 44px. Text contrast ≥ 4.5:1. Stroke icons (no emoji anywhere).
- B2C tab bar: Início · Jornada · Benefícios · Progresso · Perfil (keep existing order if it differs, but Benefits must be a tab).

---

## 10. Slices and acceptance criteria

**Slice 1 — Economy core**
- [ ] Tables, RLS and functions of §2 in `setup.sql` (fresh + idempotent).
- [ ] `credit_session` trigger; SOS and clinical sessions yield zero; daily caps; multiplier entry only for active subscriptions.
- [ ] `src/gamification/economy.ts` + parity fixtures pass in node and SQL.
- [ ] `get_wallet()` and DataProvider methods in mock + Supabase.

**Slice 2 — Achievements**
- [ ] Definitions seeded (§3.2–3.3), evaluation function, bonus Loops once.
- [ ] `<Badge>` component; Progress › Conquistas; unlock sheet on next open, never post-session.

**Slice 3 — Geographic ranks**
- [ ] Profile city picker + `geo_ranking` consent + toggle; IBGE seed.
- [ ] Views, threshold, `get_geo_rankings`, scheduled refresh (guarded pg_cron) + Admin "Recalcular agora".
- [ ] Coletivas screen; city below threshold never appears.

**Slice 4 — Benefits tab + wallet**
- [ ] Catalog, tags (≥ 1 enforced), codes, `get_available_benefits`, atomic `redeem_benefit`, refunds.
- [ ] Health-first layout §6.2; copy glossary respected (add a lint/test that fails if forbidden words from §6.5 appear in pt-BR strings of the Benefits/Challenges screens).

**Slice 5 — Public challenges**
- [ ] Model, progress updates, settlement job, raffles.
- [ ] Admin list + stepper; Home card (max one) + detail screen.
- [ ] Schema rejects team/area scopes and forbidden metrics.

**Slice 6 — Company add-on**
- [ ] Plans, subscriptions, multiplier reporting.
- [ ] HR: tag filter, company benefits (3 delivery modes, consent flow), company challenges (whole company only), aggregated dashboard with k = 10, plan page.
- [ ] Employee app shows company challenges/benefits; disabled tags hidden server-side.

**Slice 7 — Admin reports, demo seed, test scenarios**
- [ ] Admin Economia, Tags, Planos e empresas, Relatórios.
- [ ] Demo seed (fictional): company **Aurora Alimentos** (Premium 1.5×, tag "Alimentos e bebidas" disabled), ~40 demo users across São Paulo, Florianópolis, Curitiba, Recife and Belo Horizonte, one active public challenge "Outubro Sereno" (5 h, reward 90% off a facial cream from a placeholder partner), one scheduled "Semana do Sono", one company collective challenge "Novembro em Loop" (≥ 60% of the company with 3+ sessions), ~15 benefits across all pillars. Partner names stay as `[PARCEIRO]` placeholders.
- [ ] `docs/gamification/TEST_SCENARIOS.md`: plain-language pt-BR scenarios for the founders (one per acceptance criterion above), same style as the existing E2E test pack.

---

## 11. What changed versus the stakeholder mockups
The mockups are still the visual reference, with these logic changes from the founders:
1. Challenges no longer unlock a benefit *instead of* currency: rewards are **bonus Loops and/or an exclusive benefit**; regular benefits are **redeemed with Loops**.
2. The Benefits screen gains the **"Seu cuidado" wallet header**, Loop prices and pillar grouping (§6.2). Remove any shop-like elements.
3. **Remove every area/unit/team element**: the HR "Novembro em Loop" per-area bars, area chips in "Criar desafio", the "Unidade em Loop"/"Equipe em sintonia" badges and the "Coletivo por área" format. Company collectives are whole-company only.
4. HR gains **Benefícios abertos (tag filter)** and **Plano (multiplier)**; Admin gains **Economia, Tags, Planos e empresas**.
5. "Pontos Loop" in the mockups becomes two concepts: **Pontos** (ranks/progress) and **Loops** (currency).

---

## 12. Defaults to implement as configuration (confirm with founders later)
| Topic | Default |
|---|---|
| Points / minute, completion bonus | 1 / +10 |
| Points → Loops | 10 → 1 |
| Daily caps | 120 min, 4 completion bonuses |
| Achievement bonus by tier | 20 / 50 / 100 / 250 Loops |
| Loops expiry | none |
| Employee leaves the company | keeps all Loops already earned; multiplier stops at affiliation end |
| Tag filter availability | only for companies with an active add-on |
| HR can grant bonus Loops in company challenges | yes, recorded as company-funded |
| City threshold | 50 active people / month |
| k-anonymity for HR figures | 10 |
| Ranking period | calendar month, America/Sao_Paulo |
| Retroactive credit | no (optional admin backfill function) |
| Clinical (therapist-led) sessions earn points | no |
