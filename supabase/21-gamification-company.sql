-- ============================================================================
-- GAMIFICATION · 6 — THE COMPANY ADD-ON           (docs/gamification/SPEC.md §7)
--
-- For a database that is already live. The same block is in setup.sql.
-- Safe to re-run. Needs 16 to 20.
--
-- HR configures; HR never sees a person (GAM-R5, MN-17, SPN-01..08):
--   - every function here takes the company from my_company_id(), never
--     from the caller, and checks is_hr() and an active add-on;
--   - figures come only as company-wide aggregates, suppressed under
--     hr_min_cohort (25, SPN-02) with complementary suppression, so no
--     suppressed figure can be recovered by subtraction;
--   - no breakdown by area, unit or team exists to ask for (GAM-R4);
--   - names reach HR only for an IDENTIFIED redemption the employee chose,
--     after seeing exactly what is shared (§7.2b, §7.4);
--   - company challenges come only from approved templates (SPN-06, PLAN A4).
-- ============================================================================

-- ---- what an identified redemption shares, snapshotted when it happens ----------
alter table benefit_redemptions add column if not exists identified_name text;
alter table benefit_redemptions add column if not exists identified_employee_number text;

-- ---- the add-on a company has now ---------------------------------------------------
create or replace function gam_company_addon(p_company text)
  returns table (plan_id text, plan_name text, loops_multiplier numeric, allows_company_challenges boolean,
                 allows_company_benefits boolean, allows_tag_filter boolean, starts_at timestamptz, ends_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select pl.id, pl.name, pl.loops_multiplier, pl.allows_company_challenges, pl.allows_company_benefits, pl.allows_tag_filter,
         s.starts_at, s.ends_at
    from company_addon_subscriptions s join addon_plans pl on pl.id = s.plan_id
   where s.company_id = p_company and s.status = 'active'
     and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
   order by pl.loops_multiplier desc
   limit 1
$$;
revoke all on function gam_company_addon(text) from public;

-- The HR caller's company, or an error: HR of THIS company, with the add-on.
create or replace function gam_hr_company(p_needs text default null) returns text
  language plpgsql stable security definer set search_path = public as $$
declare
  v_co text := my_company_id();
  a record;
begin
  if not is_hr() or v_co is null then raise exception 'HR only' using errcode = 'P0001', hint = 'HR_ONLY'; end if;
  select * into a from gam_company_addon(v_co);
  if not found then raise exception 'no active add-on' using errcode = 'P0001', hint = 'ADDON_NONE'; end if;
  if (p_needs = 'challenges' and not a.allows_company_challenges)
  or (p_needs = 'benefits' and not a.allows_company_benefits)
  or (p_needs = 'tags' and not a.allows_tag_filter) then
    raise exception 'not in this plan' using errcode = 'P0001', hint = 'ADDON_FEATURE';
  end if;
  return v_co;
end $$;
revoke all on function gam_hr_company(text) from public;

-- Plano (§7.2e), read-only. Null when the company has no add-on.
create or replace function hr_get_addon() returns json
  language sql stable security definer set search_path = public as $$
  select case when not is_hr() then null else (
    select json_build_object('planId', a.plan_id, 'planName', a.plan_name, 'multiplier', a.loops_multiplier,
                             'companyChallenges', a.allows_company_challenges, 'companyBenefits', a.allows_company_benefits,
                             'tagFilter', a.allows_tag_filter, 'startsAt', a.starts_at, 'endsAt', a.ends_at)
      from gam_company_addon(my_company_id()) a) end
$$;
revoke all on function hr_get_addon() from public;
do $$ begin grant execute on function hr_get_addon() to authenticated; exception when undefined_object then null; end $$;

-- ---- a) Benefícios abertos: the tag filter -------------------------------------------
create or replace function hr_list_tag_filter() returns json
  language sql stable security definer set search_path = public as $$
  with co as (select gam_hr_company('tags') as id)
  select coalesce(json_agg(json_build_object(
           'id', t.id, 'slug', t.slug, 'label', t.label, 'group', t.tag_group,
           'disabled', exists (select 1 from company_disabled_tags d where d.company_id = co.id and d.tag_id = t.id and d.enabled_at is null),
           'affects', (select count(*) from benefit_tag_map m join benefits b on b.id = m.benefit_id
                        where m.tag_id = t.id and b.company_id is null and b.status = 'active' and b.challenge_exclusive_id is null),
           'benefits', (select coalesce(json_agg(b.title order by b.title), '[]'::json) from benefit_tag_map m join benefits b on b.id = m.benefit_id
                        where m.tag_id = t.id and b.company_id is null and b.status = 'active' and b.challenge_exclusive_id is null))
         order by t.tag_group, t.label), '[]'::json)
    from benefit_tags t, co
   where t.active
$$;
revoke all on function hr_list_tag_filter() from public;
do $$ begin grant execute on function hr_list_tag_filter() to authenticated; exception when undefined_object then null; end $$;

-- Turning a tag off hides every public benefit carrying it from this
-- company's people; on again, they return. Each change is a row (history).
create or replace function hr_set_tag_disabled(p_tag uuid, p_disabled boolean) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_co text := gam_hr_company('tags');
begin
  if p_disabled then
    insert into company_disabled_tags (company_id, tag_id, disabled_by) values (v_co, p_tag, current_profile())
    on conflict do nothing;
  else
    update company_disabled_tags set enabled_at = now(), enabled_by = current_profile()
     where company_id = v_co and tag_id = p_tag and enabled_at is null;
  end if;
end $$;
revoke all on function hr_set_tag_disabled(uuid, boolean) from public;
do $$ begin grant execute on function hr_set_tag_disabled(uuid, boolean) to authenticated; exception when undefined_object then null; end $$;

create or replace function hr_tag_filter_history() returns json
  language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('label', t.label, 'disabledAt', d.disabled_at, 'enabledAt', d.enabled_at)
         order by d.disabled_at desc), '[]'::json)
    from company_disabled_tags d join benefit_tags t on t.id = d.tag_id
   where d.company_id = gam_hr_company('tags')
$$;
revoke all on function hr_tag_filter_history() from public;
do $$ begin grant execute on function hr_tag_filter_history() to authenticated; exception when undefined_object then null; end $$;

-- ---- b) Benefícios da empresa ----------------------------------------------------------
-- Three delivery modes only: a code pool (HR never learns who redeemed),
-- collective (to the whole company, nobody identified) and identified
-- (name + employee number, with the employee's explicit consent).
create or replace function hr_list_company_benefits() returns json
  language sql stable security definer set search_path = public as $$
  with co as (select gam_hr_company('benefits') as id)
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'title', b.title, 'description', b.description, 'careRationale', b.care_rationale,
           'pillar', b.pillar, 'priceLoopsCenti', b.price_loops_centi, 'stockTotal', b.stock_total,
           'deliveryType', b.delivery_type, 'status', b.status, 'terms', b.terms,
           'codesFree', (select count(*) from benefit_codes c where c.benefit_id = b.id and c.assigned_at is null),
           'codesTotal', (select count(*) from benefit_codes c where c.benefit_id = b.id))
         order by b.created_at desc), '[]'::json)
    from benefits b, co where b.company_id = co.id
$$;
revoke all on function hr_list_company_benefits() from public;
do $$ begin grant execute on function hr_list_company_benefits() to authenticated; exception when undefined_object then null; end $$;

create or replace function hr_save_company_benefit(p jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_co text := gam_hr_company('benefits');
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_delivery benefit_delivery := (p->>'deliveryType')::benefit_delivery;
begin
  if v_delivery not in ('code_pool', 'collective', 'identified') then
    raise exception 'a company benefit is a code, collective or identified' using errcode = 'P0001', hint = 'BENEFIT_DELIVERY';
  end if;
  if exists (select 1 from benefits where id = v_id and company_id is distinct from v_co) then
    raise exception 'not your company''s benefit' using errcode = 'P0001', hint = 'HR_ONLY';
  end if;
  insert into benefits (id, company_id, title, description, care_rationale, pillar, price_loops_centi, stock_total, stock_remaining,
                        per_user_limit, delivery_type, terms, status, code_validity_days)
  values (v_id, v_co, p->>'title', nullif(p->>'description', ''), nullif(p->>'careRationale', ''), (p->>'pillar')::benefit_pillar,
          (p->>'priceLoopsCenti')::int, (p->>'stockTotal')::int, (p->>'stockTotal')::int, 1, v_delivery,
          nullif(p->>'terms', ''), coalesce((p->>'status')::benefit_status, 'draft'), (p->>'codeValidityDays')::int)
  on conflict (id) do update set
    title = excluded.title, description = excluded.description, care_rationale = excluded.care_rationale,
    pillar = excluded.pillar, price_loops_centi = excluded.price_loops_centi,
    stock_remaining = case when excluded.stock_total is null then null
                           else greatest(0, excluded.stock_total - coalesce(benefits.stock_total - benefits.stock_remaining, 0)) end,
    stock_total = excluded.stock_total, delivery_type = excluded.delivery_type, terms = excluded.terms,
    status = excluded.status, code_validity_days = excluded.code_validity_days, updated_at = now();
  return v_id;
end $$;
revoke all on function hr_save_company_benefit(jsonb) from public;
do $$ begin grant execute on function hr_save_company_benefit(jsonb) to authenticated; exception when undefined_object then null; end $$;

create or replace function hr_upload_codes(p_benefit uuid, p_codes text[]) returns int
  language plpgsql security definer set search_path = public as $$
declare
  v_co text := gam_hr_company('benefits');
  n int;
begin
  if not exists (select 1 from benefits where id = p_benefit and company_id = v_co and delivery_type = 'code_pool') then
    raise exception 'not your company''s code benefit' using errcode = 'P0001', hint = 'HR_ONLY';
  end if;
  insert into benefit_codes (benefit_id, code)
  select p_benefit, c from (select distinct trim(x) as c from unnest(p_codes) x) s where length(c) between 1 and 200
  on conflict (benefit_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function hr_upload_codes(uuid, text[]) from public;
do $$ begin grant execute on function hr_upload_codes(uuid, text[]) to authenticated; exception when undefined_object then null; end $$;

-- The ONLY place HR sees a person: identified redemptions of its own
-- benefits, each one consented to. Nothing else about the person.
create or replace function hr_identified_redemptions() returns json
  language sql stable security definer set search_path = public as $$
  with co as (select gam_hr_company('benefits') as id)
  select coalesce(json_agg(json_build_object(
           'id', r.id, 'benefit', b.title, 'name', r.identified_name, 'employeeNumber', r.identified_employee_number,
           'consentedAt', r.consent_identified_at, 'status', r.status)
         order by r.created_at desc), '[]'::json)
    from benefit_redemptions r join benefits b on b.id = r.benefit_id, co
   where b.company_id = co.id and b.delivery_type = 'identified' and r.consent_identified_at is not null
$$;
revoke all on function hr_identified_redemptions() from public;
do $$ begin grant execute on function hr_identified_redemptions() to authenticated; exception when undefined_object then null; end $$;

-- Redemption, now with what an identified one shares. The employee confirms
-- their employee number on the consent step; their name comes from their
-- profile. Both are copied onto the redemption at that moment.
drop function if exists redeem_benefit(uuid, boolean);
create or replace function redeem_benefit(p_benefit uuid, p_consent_identified boolean default false, p_employee_number text default null) returns json
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile();
  b benefits%rowtype;
  v_balance int;
  v_price int;
  v_red uuid := gen_random_uuid();
  v_code_id uuid;
  v_code text;
  v_expires timestamptz;
  v_used int;
begin
  if me is null then raise exception 'not signed in' using errcode = 'P0001', hint = 'NOT_SIGNED_IN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gam:wallet:' || me::text, 0));

  select * into b from benefits where id = p_benefit for update;
  if not found or not gam_benefit_available(me, p_benefit) then
    raise exception 'benefit not available' using errcode = 'P0001', hint = 'BENEFIT_UNAVAILABLE';
  end if;
  select count(*) into v_used from benefit_redemptions where user_id = me and benefit_id = b.id and status = 'active';
  if v_used >= b.per_user_limit then
    raise exception 'already redeemed' using errcode = 'P0001', hint = 'BENEFIT_LIMIT';
  end if;
  if b.delivery_type = 'identified' and (not coalesce(p_consent_identified, false)
       or (b.company_id is not null and length(trim(coalesce(p_employee_number, ''))) = 0)) then
    raise exception 'consent to be identified is required' using errcode = 'P0001', hint = 'BENEFIT_NEEDS_CONSENT';
  end if;

  v_price := coalesce(b.price_loops_centi, 0);
  select coalesce(sum(amount_centi), 0) into v_balance from loops_ledger where user_id = me;
  if v_balance < v_price then
    raise exception 'not enough Loops' using errcode = 'P0001', hint = 'BENEFIT_BALANCE';
  end if;

  if b.stock_remaining is not null and b.delivery_type <> 'collective' then
    if b.stock_remaining <= 0 then
      raise exception 'no longer available' using errcode = 'P0001', hint = 'BENEFIT_STOCK';
    end if;
    update benefits set stock_remaining = stock_remaining - 1, updated_at = now() where id = b.id;
  end if;

  if b.code_validity_days is not null then v_expires := now() + make_interval(days => b.code_validity_days); end if;
  if b.valid_to is not null and (v_expires is null or b.valid_to < v_expires) then v_expires := b.valid_to; end if;

  insert into benefit_redemptions (id, user_id, benefit_id, loops_spent_centi, status, consent_identified_at, expires_at,
                                   identified_name, identified_employee_number)
  values (v_red, me, b.id, v_price, 'active',
          case when b.delivery_type = 'identified' then now() end, v_expires,
          case when b.delivery_type = 'identified' then (select name from profiles where id = me) end,
          case when b.delivery_type = 'identified' then nullif(trim(p_employee_number), '') end);

  if b.delivery_type = 'code_pool' then
    select id, code into v_code_id, v_code from benefit_codes
     where benefit_id = b.id and assigned_at is null
     order by seq
     limit 1
     for update skip locked;
    if v_code_id is null then
      raise exception 'no code left' using errcode = 'P0001', hint = 'BENEFIT_STOCK';
    end if;
    update benefit_codes set redemption_id = v_red, assigned_at = now() where id = v_code_id;
    update benefit_redemptions set code_id = v_code_id where id = v_red;
  elsif b.delivery_type = 'static_code' then
    v_code := b.static_code;
  end if;

  if v_price > 0 then
    insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, source_type, source_id)
    values (me, 'redemption', -v_price, 'goodloop', 'redemption', v_red::text);
  end if;

  return json_build_object('redemptionId', v_red, 'code', v_code, 'link', b.link_url,
                           'expiresAt', v_expires, 'loopsSpentCenti', v_price);
end $$;
revoke all on function redeem_benefit(uuid, boolean, text) from public;
do $$ begin grant execute on function redeem_benefit(uuid, boolean, text) to authenticated; exception when undefined_object then null; end $$;

-- What the employee is shown before consenting: exactly what will be shared.
create or replace function get_identified_preview() returns json
  language sql stable security definer set search_path = public as $$
  select json_build_object('name', p.name, 'companyName', (select c.name from companies c where c.id = p.company_id))
    from profiles p where p.id = current_profile()
$$;
revoke all on function get_identified_preview() from public;
do $$ begin grant execute on function get_identified_preview() to authenticated; exception when undefined_object then null; end $$;

-- ---- c) Desafios da empresa — from templates only (SPN-06, PLAN A4) -------------------
create table if not exists challenge_templates (
  slug               text primary key,
  title              text not null,
  description        text not null,
  badge_icon         text not null default 'flag',
  format             challenge_format not null,
  metric             challenge_metric not null,
  goal_value         numeric not null check (goal_value > 0),
  goal_kind          challenge_goal_kind not null default 'total',
  per_person_min     numeric,
  window_start_hour  int,
  window_end_hour    int,
  default_days       int not null default 30 check (default_days between 1 and 92),
  active             boolean not null default true,
  sort_order         int not null default 0
);
-- First set, written now; the founders will refine it (PLAN A4).
insert into challenge_templates (slug, title, description, badge_icon, format, metric, goal_value, goal_kind, per_person_min, window_start_hour, window_end_hour, default_days, sort_order) values
  ('boas_vindas', 'Boas-vindas', 'Três sessões no primeiro mês, para conhecer o seu ritmo.', 'spark',
   'individual', 'sessions_completed', 3, 'total', null, null, null, 30, 10),
  ('sono_em_dia', 'Sono em dia', 'Cinco sessões depois das 21h, para chegar à cama mais calmo.', 'moon',
   'individual', 'sessions_in_time_window', 5, 'total', null, 21, 24, 30, 20),
  ('pausa_consciente', 'Pausa consciente', 'Cinco pausas no meio do dia, entre 12h e 14h.', 'sun',
   'individual', 'sessions_in_time_window', 5, 'total', null, 12, 14, 30, 30),
  ('empresa_em_sintonia', 'Empresa em sintonia', 'A empresa inteira, junta: 60% de nós com três sessões ou mais no mês.', 'building',
   'collective', 'sessions_completed', 60, 'share_reaching_min', 3, null, null, 30, 40)
on conflict (slug) do nothing;
alter table challenge_templates enable row level security;
drop policy if exists challenge_templates_read on challenge_templates;
create policy challenge_templates_read on challenge_templates for select using (auth.uid() is not null);
drop policy if exists challenge_templates_admin on challenge_templates;
create policy challenge_templates_admin on challenge_templates for all using (is_admin()) with check (is_admin());

-- HR picks a template, the dates, the reward (company bonus Loops and/or one
-- of the company's own benefits) and, within the template, the goal. The
-- title and description are the template's: no free text reaches employees.
create or replace function hr_save_company_challenge(p jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_co text := gam_hr_company('challenges');
  tp challenge_templates%rowtype;
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
begin
  select * into tp from challenge_templates where slug = p->>'templateSlug' and active;
  if not found then raise exception 'choose a template' using errcode = 'P0001', hint = 'CHALLENGE_TEMPLATE'; end if;
  if exists (select 1 from challenges where id = v_id and (company_id is distinct from v_co or status not in ('draft', 'scheduled'))) then
    raise exception 'not editable' using errcode = 'P0001', hint = 'CHALLENGE_LIVE';
  end if;
  if nullif(p->>'rewardBenefitId', '') is not null
     and not exists (select 1 from benefits where id = (p->>'rewardBenefitId')::uuid and company_id = v_co) then
    raise exception 'the reward must be one of your company''s benefits' using errcode = 'P0001', hint = 'CHALLENGE_REWARD';
  end if;
  insert into challenges (id, company_id, title, description, badge_icon, format, scope, scope_ref, metric, goal_value, goal_kind,
                          per_person_min, window_start_hour, window_end_hour, starts_at, ends_at, status,
                          reward_bonus_loops_centi, reward_benefit_id, reward_rule_when_out_of_stock, announce_in_app,
                          template_slug, created_by)
  values (v_id, v_co, tp.title, tp.description, tp.badge_icon, tp.format, 'company', v_co, tp.metric,
          coalesce((p->>'goalValue')::numeric, tp.goal_value), tp.goal_kind,
          coalesce((p->>'perPersonMin')::numeric, tp.per_person_min), tp.window_start_hour, tp.window_end_hour,
          (p->>'startsAt')::timestamptz, (p->>'endsAt')::timestamptz, 'draft',
          (p->>'rewardBonusLoopsCenti')::int, nullif(p->>'rewardBenefitId', '')::uuid,
          coalesce((p->>'rewardRule')::challenge_stock_rule, 'first_to_complete'), true, tp.slug, current_profile())
  on conflict (id) do update set
    goal_value = excluded.goal_value, per_person_min = excluded.per_person_min,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    reward_bonus_loops_centi = excluded.reward_bonus_loops_centi, reward_benefit_id = excluded.reward_benefit_id,
    reward_rule_when_out_of_stock = excluded.reward_rule_when_out_of_stock;
  update benefits set challenge_exclusive_id = v_id
   where id = nullif(p->>'rewardBenefitId', '')::uuid and company_id = v_co and price_loops_centi is null;
  return v_id;
end $$;
revoke all on function hr_save_company_challenge(jsonb) from public;
do $$ begin grant execute on function hr_save_company_challenge(jsonb) to authenticated; exception when undefined_object then null; end $$;

create or replace function hr_company_challenge_action(p_id uuid, p_action text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_co text := gam_hr_company('challenges');
  c challenges%rowtype;
begin
  select * into c from challenges where id = p_id and company_id = v_co for update;
  if not found then raise exception 'not your company''s challenge' using errcode = 'P0001', hint = 'HR_ONLY'; end if;
  if p_action = 'publish' then
    if c.status <> 'draft' then raise exception 'already published' using errcode = 'P0001', hint = 'CHALLENGE_LIVE'; end if;
    if c.ends_at <= now() then raise exception 'dates' using errcode = 'P0001', hint = 'CHALLENGE_DATES'; end if;
    if c.reward_bonus_loops_centi is null and c.reward_benefit_id is null then
      raise exception 'a challenge needs a reward' using errcode = 'P0001', hint = 'CHALLENGE_REWARD';
    end if;
    update challenges set status = case when starts_at > now() then 'scheduled'::challenge_status else 'active'::challenge_status end,
                          published_at = now() where id = p_id;
  elsif p_action = 'end' then
    update challenges set ends_at = least(ends_at, now()) where id = p_id and status in ('scheduled', 'active');
    perform settle_challenges();
  elsif p_action = 'cancel' then
    update challenges set status = 'cancelled' where id = p_id and status in ('draft', 'scheduled', 'active');
  else
    raise exception 'unknown action %', p_action;
  end if;
end $$;
revoke all on function hr_company_challenge_action(uuid, text) from public;
do $$ begin grant execute on function hr_company_challenge_action(uuid, text) to authenticated; exception when undefined_object then null; end $$;

-- ---- d) the HR dashboard — company-wide aggregates only -------------------------------
-- A cell is shown only if the people it counts AND its complement (the
-- eligible people it does not count) are both at least k, so neither the
-- figure nor "the rest" can single anyone out by subtraction (SPN-02).
create or replace function gam_k_cell(p_count bigint, p_population bigint, p_k int) returns bigint
  language sql immutable as $$
  select case when p_count < p_k or (p_population - p_count) between 1 and p_k - 1 then null else p_count end
$$;

create or replace function hr_addon_dashboard() returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  v_co text := gam_hr_company(null);
  k int := (select hr_min_cohort from economy_settings where id);
  v_month date := date_trunc('month', gam_sp_day(now()))::date;
  v_eligible bigint;
  v_mult_people bigint;
  v_mult_centi bigint;
  v_red bigint;
  v_cards json;
begin
  select count(distinct user_id) into v_eligible from company_affiliations where company_id = v_co and ended_at is null;
  select count(distinct user_id), coalesce(sum(amount_centi), 0) into v_mult_people, v_mult_centi
    from loops_ledger where company_id = v_co and entry_type = 'earn_company_multiplier' and created_at >= v_month;
  select count(*) into v_red
    from benefit_redemptions r join benefits b on b.id = r.benefit_id
   where b.company_id = v_co and r.status = 'active' and r.created_at >= v_month;

  select coalesce(json_agg(json_build_object(
           'id', c.id, 'title', c.title, 'status', c.status, 'templateSlug', c.template_slug,
           'startsAt', c.starts_at, 'endsAt', c.ends_at, 'format', c.format, 'goalKind', c.goal_kind,
           'goalValue', c.goal_value, 'perPersonMin', c.per_person_min,
           'rewardBonusLoopsCenti', c.reward_bonus_loops_centi, 'rewardBenefitId', c.reward_benefit_id,
           -- adhesion: who took part, as a share of the whole company, k-guarded
           'adhesionPct', case when v_eligible >= k and gam_k_cell(x.took_part, v_eligible, k) is not null
                               then round(100.0 * x.took_part / v_eligible) end,
           'completedPct', case when v_eligible >= k and gam_k_cell(x.completed, v_eligible, k) is not null
                                then round(100.0 * x.completed / v_eligible) end,
           'collectivePct', case when c.goal_kind = 'share_reaching_min' and v_eligible >= k then gam_collective_value(c) end,
           'goalReached', c.goal_reached_at is not null)
         order by c.starts_at desc), '[]'::json)
    into v_cards
    from challenges c
    cross join lateral (
      select count(*) filter (where p.progress_value > 0) as took_part,
             count(*) filter (where p.completed_at is not null) as completed
        from challenge_participation p where p.challenge_id = c.id) x
   where c.company_id = v_co and c.status <> 'cancelled';

  return json_build_object(
    'minCohort', k,
    'eligible', case when v_eligible >= k then v_eligible end,
    'activeChallenges', (select count(*) from challenges where company_id = v_co and status = 'active'),
    'multiplierLoopsMonth', case when v_mult_people >= k then floor(v_mult_centi / 100) end,
    'redemptionsMonth', gam_k_cell(v_red, greatest(v_red, v_eligible), k),
    'challenges', v_cards);
end $$;
revoke all on function hr_addon_dashboard() from public;
do $$ begin grant execute on function hr_addon_dashboard() to authenticated; exception when undefined_object then null; end $$;

-- ---- Admin › Piani e aziende: assign, change, end a subscription ------------------------
create or replace function admin_set_company_plan(p_company text, p_plan text, p_starts timestamptz default now()) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  update company_addon_subscriptions set status = 'ended', ends_at = greatest(starts_at + interval '1 second', p_starts)
   where company_id = p_company and status = 'active' and (ends_at is null or ends_at > p_starts);
  if p_plan is not null then
    insert into company_addon_subscriptions (company_id, plan_id, starts_at, created_by) values (p_company, p_plan, p_starts, current_profile());
  end if;
end $$;
revoke all on function admin_set_company_plan(text, text, timestamptz) from public;
do $$ begin grant execute on function admin_set_company_plan(text, text, timestamptz) to authenticated; exception when undefined_object then null; end $$;

notify pgrst, 'reload schema';
