-- ============================================================================
-- GAMIFICATION · 2 — ACHIEVEMENTS                (docs/gamification/SPEC.md §3)
--
-- For a database that is already live. The same block is in setup.sql.
-- Safe to re-run. Needs 16-gamification-economy.sql.
--
-- One-time and permanent (GAM-R1): an achievement, once unlocked, is never
-- taken back, and its bonus is credited once, by Good Loop, never multiplied
-- (GAM-R9). Nothing here reads an assessment result, a VAS or any clinical
-- value (GAM-R2), and only sessions the economy CREDITED count — so SOS
-- sessions count for nothing (GAM-R3), and the history from before launch
-- does not pay out retroactively (SPEC §2.2).
--
-- Individual achievements are evaluated when a credit commits: a deferred
-- trigger on points_ledger, so the day's usage the same credit wrote is
-- already there. Collective ones (§3.3) are seeded here and evaluated by the
-- geographic job in slice 3.
-- ============================================================================

do $$ begin create type achievement_kind as enum ('individual', 'collective'); exception when duplicate_object then null; end $$;
-- GAM-R4: the collective scopes. There is no team, area, department, unit,
-- site, group or friends value, and there never will be.
do $$ begin create type gam_scope as enum ('user', 'city', 'state', 'region', 'national', 'company'); exception when duplicate_object then null; end $$;
do $$ begin create type achievement_period as enum ('lifetime', 'month'); exception when duplicate_object then null; end $$;
do $$ begin create type achievement_tier as enum ('semente', 'broto', 'raiz', 'copa', 'coletiva', 'nacional', 'empresa'); exception when duplicate_object then null; end $$;

create table if not exists achievement_definitions (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  kind               achievement_kind not null,
  scope              gam_scope not null,
  metric             text not null,
  threshold          numeric not null check (threshold > 0),
  period             achievement_period not null default 'lifetime',
  tier               achievement_tier not null,
  icon               text not null,
  bonus_loops_centi  int not null default 0 check (bonus_loops_centi >= 0),
  active             boolean not null default true,
  sort_order         int not null default 0,
  check ((kind = 'individual') = (scope = 'user'))
);

-- What a metric may be. Usage only: nothing about scores, VAS or assessment
-- results (GAM-R2), nothing about consecutive days (GAM-R1).
do $$ begin
  alter table achievement_definitions add constraint achievement_metric_allowed check (metric in (
    'sessions_completed', 'stereo_sessions_completed', 'self_assessment_done', 'minutes_listened',
    'deep_sessions_completed', 'durations_completed', 'distinct_weeks', 'night_sessions',
    'midday_weekday_sessions', 'pathways_completed', 'journey_completed', 'challenges_completed',
    'city_month_points', 'city_rank_per_active', 'city_night_sessions', 'state_active_cities',
    'region_month_points', 'national_minutes_lifetime', 'company_active_share_pct',
    'company_collective_challenges'));
exception when duplicate_object then null; end $$;

create table if not exists user_achievements (
  user_id         uuid not null references profiles(id) on delete cascade,
  achievement_id  uuid not null references achievement_definitions(id) on delete cascade,
  unlocked_at     timestamptz not null default now(),
  seen_at         timestamptz,
  primary key (user_id, achievement_id)
);

-- A finished pathway (the live app's "journey", PLAN A9). Written by the app
-- through record_pathway_completed(); the slug is the pathway's own id.
create table if not exists pathway_completions (
  user_id       uuid not null references profiles(id) on delete cascade,
  pathway_slug  text not null,
  completed_at  timestamptz not null default now(),
  primary key (user_id, pathway_slug)
);

-- Seeds. Thresholds, bonuses and `active` are the Admin's to edit, so a
-- re-run never overwrites them. Default bonus by tier (SPEC §3.2):
-- Semente 20 · Broto 50 · Raiz 100 · Copa 250 Loops. Collectives carry no
-- bonus by default (the SPEC sets none); editable.
--   know_yourself  inactive: the live app has no non-clinical initial
--                  self-assessment to count (PLAN A14)
--   month1_done    "a first pathway finished" — there is no 12-week journey
--                  engine; pathways are what the app has (PLAN A9)
--   journey_done   inactive until a 12-week journey exists (PLAN A9)
insert into achievement_definitions (slug, kind, scope, metric, threshold, period, tier, icon, bonus_loops_centi, active, sort_order) values
  ('first_loop',        'individual', 'user', 'sessions_completed',        1,    'lifetime', 'semente', 'spark',      2000,  true,  10),
  ('stereo_ready',      'individual', 'user', 'stereo_sessions_completed', 1,    'lifetime', 'semente', 'headphones', 2000,  true,  20),
  ('know_yourself',     'individual', 'user', 'self_assessment_done',      1,    'lifetime', 'semente', 'thought',    2000,  false, 30),
  ('listen_1h',         'individual', 'user', 'minutes_listened',          60,   'lifetime', 'semente', 'clock',      2000,  true,  40),
  ('listen_5h',         'individual', 'user', 'minutes_listened',          300,  'lifetime', 'broto',   'clock',      5000,  true,  50),
  ('listen_20h',        'individual', 'user', 'minutes_listened',          1200, 'lifetime', 'raiz',    'clock',      10000, true,  60),
  ('listen_50h',        'individual', 'user', 'minutes_listened',          3000, 'lifetime', 'copa',    'clock',      25000, true,  70),
  ('deep_dive',         'individual', 'user', 'deep_sessions_completed',   1,    'lifetime', 'broto',   'wave',       5000,  true,  80),
  ('explorer',          'individual', 'user', 'durations_completed',       3,    'lifetime', 'broto',   'compass',    5000,  true,  90),
  ('own_rhythm',        'individual', 'user', 'distinct_weeks',            4,    'lifetime', 'broto',   'calendar',   5000,  true,  100),
  ('serene_nights',     'individual', 'user', 'night_sessions',            5,    'lifetime', 'broto',   'moon',       5000,  true,  110),
  ('work_pause',        'individual', 'user', 'midday_weekday_sessions',   5,    'lifetime', 'broto',   'sun',        5000,  true,  120),
  ('month1_done',       'individual', 'user', 'pathways_completed',        1,    'lifetime', 'raiz',    'route',      10000, true,  130),
  ('journey_done',      'individual', 'user', 'journey_completed',         1,    'lifetime', 'copa',    'sprout',     25000, false, 140),
  ('first_challenge',   'individual', 'user', 'challenges_completed',      1,    'lifetime', 'broto',   'flag',       5000,  true,  150),
  ('challenger',        'individual', 'user', 'challenges_completed',      5,    'lifetime', 'raiz',    'flag',       10000, true,  160),
  ('city_in_loop',      'collective', 'city',     'city_month_points',            100000,   'month',    'coletiva', 'pin',      0, true, 210),
  ('calm_capital',      'collective', 'city',     'city_rank_per_active',         1,        'month',    'coletiva', 'spark',    0, true, 220),
  ('collective_nights', 'collective', 'city',     'city_night_sessions',          1000,     'month',    'coletiva', 'moon',     0, true, 230),
  ('state_in_tune',     'collective', 'state',    'state_active_cities',          20,       'month',    'coletiva', 'map',      0, true, 240),
  ('region_in_loop',    'collective', 'region',   'region_month_points',          500000,   'month',    'coletiva', 'globe',    0, true, 250),
  ('brazil_in_loop',    'collective', 'national', 'national_minutes_lifetime',    60000000, 'lifetime', 'nacional', 'globe',    0, true, 260),
  ('company_in_loop',   'collective', 'company',  'company_active_share_pct',     60,       'month',    'empresa',  'building', 0, true, 270),
  ('company_in_tune',   'collective', 'company',  'company_collective_challenges', 1,       'month',    'empresa',  'building', 0, true, 280)
on conflict (slug) do nothing;

alter table achievement_definitions enable row level security;
alter table user_achievements enable row level security;
alter table pathway_completions enable row level security;
drop policy if exists achievement_definitions_read on achievement_definitions;
create policy achievement_definitions_read on achievement_definitions for select using (auth.uid() is not null);
drop policy if exists achievement_definitions_admin on achievement_definitions;
create policy achievement_definitions_admin on achievement_definitions for all using (is_admin()) with check (is_admin());
drop policy if exists user_achievements_read on user_achievements;
create policy user_achievements_read on user_achievements for select using (user_id = current_profile() or is_admin());
drop policy if exists pathway_completions_read on pathway_completions;
create policy pathway_completions_read on pathway_completions for select using (user_id = current_profile() or is_admin());
revoke insert, update, delete, truncate on user_achievements, pathway_completions from anon, authenticated;

-- ---- bonuses ------------------------------------------------------------------
-- The one way a bonus reaches the Loops ledger. It has no multiplier
-- parameter, so a bonus cannot be multiplied (GAM-R9). Idempotent on its key.
create or replace function gam_credit_bonus(
  p_user uuid, p_type loops_entry_type, p_source_type text, p_source_id text,
  p_centi int, p_funding funding_source, p_company text default null) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if p_centi is null or p_centi <= 0 then return false; end if;
  insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, company_id, source_type, source_id)
  values (p_user, p_type, p_centi, p_funding, p_company, p_source_type, p_source_id)
  on conflict do nothing;
  return found;
end $$;
revoke all on function gam_credit_bonus(uuid, loops_entry_type, text, text, int, funding_source, text) from public;
do $$ begin
  revoke all on function gam_credit_bonus(uuid, loops_entry_type, text, text, int, funding_source, text) from anon, authenticated;
exception when undefined_object then null; end $$;

-- ---- metrics ------------------------------------------------------------------
-- Challenges arrive in slice 5, which replaces this with the real count.
create or replace function gam_challenges_completed(p_user uuid) returns int
  language sql stable as $$ select 0 $$;

-- A person's individual metrics. Mirrors individualMetrics() in
-- src/gamification/achievements.ts. Times are São Paulo times; weeks are ISO
-- weeks and are counted, never required to be consecutive (GAM-R1).
create or replace function gam_user_metrics(p_user uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  with credited as (
    select s.*, (s.started_at at time zone 'America/Sao_Paulo') as local_start
      from sessions s
      join points_ledger pl
        on pl.user_id = s.b2c_profile_id and pl.source_type = 'session' and pl.source_id = s.id::text
     where s.b2c_profile_id = p_user and not s.is_sos
  ),
  done as (select * from credited where completed)
  select jsonb_build_object(
    'sessions_completed',        (select count(*) from done),
    'stereo_sessions_completed', (select count(*) from done where stereo_checked),
    'self_assessment_done',      0,
    'minutes_listened',          coalesce((select sum(eligible_minutes) from gam_daily_usage where user_id = p_user), 0),
    'deep_sessions_completed',   (select count(*) from done where duration_min = 24),
    'durations_completed',       (select count(distinct duration_min) from done where duration_min in (6, 12, 24)),
    'distinct_weeks',            (select count(distinct to_char(local_start, 'IYYY-IW')) from done),
    'night_sessions',            (select count(*) from done where extract(hour from local_start) >= 21),
    'midday_weekday_sessions',   (select count(*) from done
                                   where extract(isodow from local_start) between 1 and 5
                                     and extract(hour from local_start) in (12, 13)),
    'pathways_completed',        (select count(*) from pathway_completions where user_id = p_user),
    'journey_completed',         0,
    'challenges_completed',      gam_challenges_completed(p_user)
  )
$$;
revoke all on function gam_user_metrics(uuid) from public;

-- ---- evaluation -----------------------------------------------------------------
create or replace function evaluate_achievements(p_user uuid) returns int
  language plpgsql security definer set search_path = public as $$
declare
  m jsonb;
  d record;
  n int := 0;
begin
  if p_user is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('gam:ach:' || p_user::text, 0));
  m := gam_user_metrics(p_user);
  for d in
    select ad.* from achievement_definitions ad
     where ad.active and ad.kind = 'individual'
       and coalesce((m ->> ad.metric)::numeric, 0) >= ad.threshold
       and not exists (select 1 from user_achievements ua where ua.user_id = p_user and ua.achievement_id = ad.id)
     order by ad.sort_order
  loop
    insert into user_achievements (user_id, achievement_id) values (p_user, d.id) on conflict do nothing;
    if found then
      n := n + 1;
      perform gam_credit_bonus(p_user, 'achievement_bonus', 'achievement', d.id::text, d.bonus_loops_centi, 'goodloop');
    end if;
  end loop;
  return n;
end $$;
revoke all on function evaluate_achievements(uuid) from public;
do $$ begin revoke all on function evaluate_achievements(uuid) from anon, authenticated; exception when undefined_object then null; end $$;

-- At commit, after the credit has written the day's usage too. A failure
-- here must not undo the session: it is logged, and the next credit (or an
-- admin re-evaluation) picks the achievement up.
create or replace function gam_points_evaluate() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    perform evaluate_achievements(new.user_id);
  exception when others then
    raise warning 'evaluate_achievements(%) failed: %', new.user_id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists points_ledger_evaluate on points_ledger;
create constraint trigger points_ledger_evaluate after insert on points_ledger
  deferrable initially deferred
  for each row execute function gam_points_evaluate();

-- ---- what the app calls ------------------------------------------------------------
create or replace function record_pathway_completed(p_slug text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_slug is null or length(trim(p_slug)) = 0 or length(p_slug) > 120 then raise exception 'bad pathway'; end if;
  insert into pathway_completions (user_id, pathway_slug) values (me, trim(p_slug)) on conflict do nothing;
  perform evaluate_achievements(me);
end $$;
revoke all on function record_pathway_completed(text) from public;
do $$ begin grant execute on function record_pathway_completed(text) to authenticated; exception when undefined_object then null; end $$;

create or replace function get_my_achievements() returns json
  language sql stable security definer set search_path = public as $$
  with me as (select current_profile() as id),
       m  as (select gam_user_metrics(me.id) as v from me)
  select coalesce(json_agg(json_build_object(
           'id', d.id, 'slug', d.slug, 'kind', d.kind, 'scope', d.scope, 'metric', d.metric,
           'threshold', d.threshold, 'period', d.period, 'tier', d.tier, 'icon', d.icon,
           'bonusLoopsCenti', d.bonus_loops_centi, 'sortOrder', d.sort_order, 'active', d.active,
           'value', case when d.kind = 'individual' then coalesce((m.v ->> d.metric)::numeric, 0) end,
           'unlockedAt', ua.unlocked_at, 'seenAt', ua.seen_at)
         order by d.sort_order), '[]'::json)
    from achievement_definitions d
    cross join me cross join m
    left join user_achievements ua on ua.achievement_id = d.id and ua.user_id = me.id
   where me.id is not null and (d.active or ua.user_id is not null)
$$;
revoke all on function get_my_achievements() from public;
do $$ begin grant execute on function get_my_achievements() to authenticated; exception when undefined_object then null; end $$;

-- The unlock sheet closes → these are seen (SPEC §3.4).
create or replace function mark_achievements_seen(p_ids uuid[]) returns void
  language sql security definer set search_path = public as $$
  update user_achievements set seen_at = now()
   where user_id = current_profile() and achievement_id = any(p_ids) and seen_at is null
$$;
revoke all on function mark_achievements_seen(uuid[]) from public;
do $$ begin grant execute on function mark_achievements_seen(uuid[]) to authenticated; exception when undefined_object then null; end $$;

-- Admin › Conquistas "re-evaluate": e.g. after lowering a threshold.
create or replace function admin_evaluate_achievements() returns int
  language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  for r in select distinct user_id from points_ledger loop
    n := n + evaluate_achievements(r.user_id);
  end loop;
  return n;
end $$;
revoke all on function admin_evaluate_achievements() from public;
do $$ begin grant execute on function admin_evaluate_achievements() to authenticated; exception when undefined_object then null; end $$;

notify pgrst, 'reload schema';
