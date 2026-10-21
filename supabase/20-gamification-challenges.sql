-- ============================================================================
-- GAMIFICATION · 5 — CHALLENGES                  (docs/gamification/SPEC.md §5)
--
-- For a database that is already live. The same block is in setup.sql.
-- Safe to re-run. Needs 16 to 19.
--
-- A challenge is a time-boxed event in one of two formats: individual (each
-- person reaches their own goal) or massive collective (everyone in a large
-- scope works toward one shared goal). The rules of §5.4's locked box are
-- the schema's, not the console's:
--   GAM-R4  scopes are national, region, state, city — or the WHOLE company.
--           No team, area, unit or group value exists to choose.
--   GAM-R2  metrics are usage only; nothing reads a score, a VAS or a result.
--   GAM-R1  no consecutive-day metric; nobody loses progress.
--   GAM-R3  only credited sessions count, so SOS never does.
--   GAM-R9  bonus Loops are never multiplied.
-- Only sessions whose END falls inside [starts_at, ends_at] count (§5.2).
-- ============================================================================

do $$ begin create type challenge_format as enum ('individual', 'collective'); exception when duplicate_object then null; end $$;
do $$ begin create type challenge_status as enum ('draft', 'scheduled', 'active', 'ended', 'settled', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin
  create type challenge_metric as enum (
    'minutes_listened', 'sessions_completed', 'deep_sessions_completed', 'sessions_in_time_window', 'pathway_completed');
exception when duplicate_object then null; end $$;
do $$ begin create type challenge_stock_rule as enum ('first_to_complete', 'raffle'); exception when duplicate_object then null; end $$;
-- How a collective goal is read: a TOTAL of the metric, or the SHARE of the
-- company's people who reached per_person_min ("60 % of the company with
-- 3+ sessions"). The share needs a known population: whole company only.
do $$ begin create type challenge_goal_kind as enum ('total', 'share_reaching_min'); exception when duplicate_object then null; end $$;

create table if not exists challenges (
  id                            uuid primary key default gen_random_uuid(),
  company_id                    text references companies(id) on delete cascade,   -- null = Good Loop
  title                         text not null check (length(trim(title)) between 1 and 80),
  description                   text check (description is null or length(description) <= 280),
  badge_icon                    text not null default 'flag',
  format                        challenge_format not null,
  scope                         gam_scope not null,
  scope_ref                     text,
  metric                        challenge_metric not null,
  goal_value                    numeric not null check (goal_value > 0),
  goal_kind                     challenge_goal_kind not null default 'total',
  per_person_min                numeric check (per_person_min is null or per_person_min > 0),
  window_start_hour             int check (window_start_hour between 0 and 23),
  window_end_hour               int check (window_end_hour between 1 and 24),
  starts_at                     timestamptz not null,
  ends_at                       timestamptz not null,
  timezone                      text not null default 'America/Sao_Paulo',
  status                        challenge_status not null default 'draft',
  reward_bonus_loops_centi      int check (reward_bonus_loops_centi is null or reward_bonus_loops_centi >= 0),
  reward_benefit_id             uuid references benefits(id) on delete set null,
  reward_rule_when_out_of_stock challenge_stock_rule not null default 'first_to_complete',
  announce_in_app               boolean not null default true,
  template_slug                 text,                                                -- company challenges (slice 6)
  goal_reached_at               timestamptz,
  created_by                    uuid references profiles(id) on delete set null,
  created_at                    timestamptz not null default now(),
  published_at                  timestamptz,
  settled_at                    timestamptz,
  check (ends_at > starts_at),
  check (scope <> 'user'),                                                            -- GAM-R4
  check ((company_id is null) = (scope <> 'company')),                               -- a company owns company scope, only
  check (company_id is null or scope_ref = company_id),
  check (metric <> 'sessions_in_time_window' or (window_start_hour is not null and window_end_hour is not null and window_end_hour > window_start_hour)),
  check (format = 'individual' or per_person_min is not null),
  check (goal_kind = 'total' or (format = 'collective' and scope = 'company' and goal_value <= 100)),
  check (reward_bonus_loops_centi is not null or reward_benefit_id is not null or status = 'draft')
);
create index if not exists challenges_live on challenges (status, starts_at, ends_at);

create table if not exists challenge_participation (
  challenge_id        uuid not null references challenges(id) on delete cascade,
  user_id             uuid not null references profiles(id) on delete cascade,
  progress_value      numeric not null default 0,
  contributed_points  int not null default 0,
  completed_at        timestamptz,
  rewarded_at         timestamptz,
  benefit_granted_at  timestamptz,
  updated_at          timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists challenge_participation_user on challenge_participation (user_id);

-- The sessions a challenge already counted, so a credit is never counted twice.
create table if not exists challenge_counted (
  challenge_id  uuid not null references challenges(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  source_id     text not null,
  primary key (challenge_id, user_id, source_id)
);

create table if not exists challenge_raffle_draws (
  challenge_id  uuid not null references challenges(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  won           boolean not null,
  drawn_at      timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create or replace view challenge_collective_progress as
  select challenge_id, sum(progress_value) as total_value, count(*) filter (where progress_value > 0) as participants
    from challenge_participation group by challenge_id;

do $$ begin
  alter table benefits add constraint benefits_challenge_exclusive_fk
    foreign key (challenge_exclusive_id) references challenges(id) on delete set null;
exception when duplicate_object then null; end $$;

alter table challenges enable row level security;
alter table challenge_participation enable row level security;
alter table challenge_counted enable row level security;
alter table challenge_raffle_draws enable row level security;
drop policy if exists challenges_admin on challenges;
create policy challenges_admin on challenges for all using (is_admin()) with check (is_admin());
drop policy if exists challenge_participation_mine on challenge_participation;
create policy challenge_participation_mine on challenge_participation for select using (user_id = current_profile() or is_admin());
drop policy if exists challenge_raffle_draws_admin on challenge_raffle_draws;
create policy challenge_raffle_draws_admin on challenge_raffle_draws for select using (is_admin());
revoke insert, update, delete, truncate on challenge_participation, challenge_counted, challenge_raffle_draws from anon, authenticated;
do $$ begin revoke all on challenge_collective_progress from anon, authenticated; exception when undefined_object then null; end $$;

-- ---- the rules a challenge must keep, as one check ---------------------------
-- Raises with a hint per broken rule; the console shows them as the
-- "Checagem Good Loop" ticks (§7.2c) and §5.4's locked box.
create or replace function gam_validate_challenge(c challenges) returns void
  language plpgsql stable security definer set search_path = public as $$
begin
  if c.scope = 'user' then raise exception 'scope' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE'; end if;
  if c.company_id is null and c.scope not in ('national', 'region', 'state', 'city') then
    raise exception 'a Good Loop challenge is national, regional, state or city-wide' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  if c.scope = 'national' and c.scope_ref is not null then
    raise exception 'a national challenge has no reference' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  if c.scope = 'region' and c.scope_ref not in ('N', 'NE', 'SE', 'S', 'CO') then
    raise exception 'unknown region' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  if c.scope = 'state' and not exists (select 1 from br_municipalities where uf::text = c.scope_ref) then
    raise exception 'unknown state' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  if c.scope = 'city' and not exists (select 1 from br_municipalities where ibge_code = c.scope_ref) then
    raise exception 'unknown city' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  if c.reward_benefit_id is not null and not exists (select 1 from benefits b where b.id = c.reward_benefit_id
       and (b.company_id is null or b.company_id = c.company_id)) then
    raise exception 'the reward benefit belongs to someone else' using errcode = 'P0001', hint = 'CHALLENGE_REWARD';
  end if;
end $$;
revoke all on function gam_validate_challenge(challenges) from public;

create or replace function gam_challenges_validate_trg() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform gam_validate_challenge(new);
  return new;
end $$;
drop trigger if exists challenges_validate on challenges;
create trigger challenges_validate before insert or update on challenges
  for each row execute function gam_challenges_validate_trg();

-- ---- who is in a challenge's scope --------------------------------------------
create or replace function gam_in_challenge_scope(p_user uuid, c challenges, p_at timestamptz) returns boolean
  language sql stable security definer set search_path = public as $$
  select case c.scope
    when 'national' then true
    when 'company' then exists (
      select 1 from company_affiliations a
       where a.user_id = p_user and a.company_id = c.company_id
         and a.started_at <= p_at and (a.ended_at is null or a.ended_at > p_at))
      and exists (
      select 1 from company_addon_subscriptions s
       where s.company_id = c.company_id and s.status = 'active'
         and s.starts_at <= p_at and (s.ends_at is null or s.ends_at > p_at))
    else gam_geo_consented(p_user) and exists (
      select 1 from profiles p join br_municipalities m on m.ibge_code = p.city_ibge_code
       where p.id = p_user
         and ((c.scope = 'city' and m.ibge_code = c.scope_ref)
           or (c.scope = 'state' and m.uf::text = c.scope_ref)
           or (c.scope = 'region' and m.region = c.scope_ref)))
  end
$$;
revoke all on function gam_in_challenge_scope(uuid, challenges, timestamptz) from public;

-- ---- rewards ----------------------------------------------------------------------
-- The bonus is funded by whoever owns the challenge (§7.2c: a company's
-- bonus is company-funded), and never multiplied. The exclusive benefit is
-- a RIGHT to redeem it; with limited stock, first-to-complete grants it
-- while units last and raffle leaves it to settlement.
create or replace function gam_reward_participant(p_challenge uuid, p_user uuid) returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
  v_stock int;
  v_granted int;
begin
  select * into c from challenges where id = p_challenge;
  update challenge_participation set rewarded_at = now()
   where challenge_id = p_challenge and user_id = p_user and rewarded_at is null;
  if not found then return false; end if;
  perform gam_credit_bonus(p_user, 'challenge_bonus', 'challenge', p_challenge::text, c.reward_bonus_loops_centi,
                           case when c.company_id is null then 'goodloop'::funding_source else 'company'::funding_source end,
                           c.company_id);
  if c.reward_benefit_id is not null and c.reward_rule_when_out_of_stock = 'first_to_complete' then
    select stock_total into v_stock from benefits where id = c.reward_benefit_id;
    select count(*) into v_granted from challenge_participation where challenge_id = p_challenge and benefit_granted_at is not null;
    if v_stock is null or v_granted < v_stock then
      update challenge_participation set benefit_granted_at = now() where challenge_id = p_challenge and user_id = p_user;
    end if;
  end if;
  return true;
end $$;
revoke all on function gam_reward_participant(uuid, uuid) from public;
do $$ begin revoke all on function gam_reward_participant(uuid, uuid) from anon, authenticated; exception when undefined_object then null; end $$;

-- A collective goal: the total, or the share of the company who reached the minimum.
create or replace function gam_collective_value(c challenges) returns numeric
  language plpgsql stable security definer set search_path = public as $$
declare
  v_people int;
  v_reached int;
begin
  if c.goal_kind = 'total' then
    return coalesce((select sum(progress_value) from challenge_participation where challenge_id = c.id), 0);
  end if;
  select count(distinct a.user_id) into v_people from company_affiliations a
   where a.company_id = c.company_id and a.started_at < c.ends_at and (a.ended_at is null or a.ended_at > c.starts_at);
  select count(*) into v_reached from challenge_participation
   where challenge_id = c.id and progress_value >= c.per_person_min;
  if v_people = 0 then return 0; end if;
  return round(100.0 * v_reached / v_people, 2);
end $$;
revoke all on function gam_collective_value(challenges) from public;

-- When a collective goal is reached: everyone who gave their part is rewarded
-- now; anyone who gives it later, at that moment; and when the challenge is a
-- whole company's, "Empresa em sintonia" goes to those who contributed (§3.3).
create or replace function gam_collective_check(p_challenge uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
  r record;
  v_def uuid;
  v_min int;
begin
  select * into c from challenges where id = p_challenge for update;
  if c.format <> 'collective' then return; end if;
  if c.goal_reached_at is null then
    if gam_collective_value(c) < c.goal_value then return; end if;
    update challenges set goal_reached_at = now() where id = c.id;
  end if;
  for r in select user_id from challenge_participation
            where challenge_id = c.id and rewarded_at is null
              and progress_value >= c.per_person_min
  loop
    perform gam_reward_participant(c.id, r.user_id);
  end loop;
  if c.scope = 'company' then
    select id into v_def from achievement_definitions where slug = 'company_in_tune' and active;
    select min_contribution_points into v_min from economy_settings where id;
    if v_def is not null then
      for r in select user_id from challenge_participation where challenge_id = c.id and contributed_points >= v_min loop
        perform gam_award(v_def, r.user_id);
      end loop;
    end if;
  end if;
end $$;
revoke all on function gam_collective_check(uuid) from public;

-- ---- progress ------------------------------------------------------------------------
-- One credited session, counted toward every live challenge the person is in
-- scope for. Called from the deferred credit trigger, before achievements
-- are evaluated, so "Primeiro desafio" unlocks in the same commit.
create or replace function update_challenge_progress(p_user uuid, p_source_id text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  s sessions%rowtype;
  pl points_ledger%rowtype;
  c challenges%rowtype;
  v_at timestamptz;
  v_inc numeric;
  v_hour int;
  v_prev numeric;
  v_new numeric;
begin
  select * into pl from points_ledger where user_id = p_user and source_type = 'session' and source_id = p_source_id;
  if not found then return; end if;
  select * into s from sessions where id::text = p_source_id;
  if not found or s.is_sos then return; end if;                                        -- GAM-R3
  v_at := coalesce(s.ended_at, pl.created_at);
  v_hour := extract(hour from s.started_at at time zone 'America/Sao_Paulo');

  for c in
    select * from challenges
     where status in ('scheduled', 'active') and starts_at <= v_at and ends_at >= v_at
       and metric <> 'pathway_completed'
  loop
    if not gam_in_challenge_scope(p_user, c, v_at) then continue; end if;
    insert into challenge_counted (challenge_id, user_id, source_id) values (c.id, p_user, p_source_id)
    on conflict do nothing;
    if not found then continue; end if;

    v_inc := case c.metric
      when 'minutes_listened' then floor(greatest(0, least(coalesce(s.listened_sec, 0), s.duration_min * 60)) / 60.0)
      when 'sessions_completed' then case when s.completed then 1 else 0 end
      when 'deep_sessions_completed' then case when s.completed and s.duration_min = 24 then 1 else 0 end
      when 'sessions_in_time_window' then case when s.completed and v_hour >= c.window_start_hour and v_hour < c.window_end_hour then 1 else 0 end
      else 0 end;

    insert into challenge_participation (challenge_id, user_id) values (c.id, p_user) on conflict do nothing;
    select progress_value into v_prev from challenge_participation where challenge_id = c.id and user_id = p_user for update;
    v_new := v_prev + v_inc;
    update challenge_participation
       set progress_value = v_new, contributed_points = contributed_points + pl.points, updated_at = now()
     where challenge_id = c.id and user_id = p_user;

    if c.format = 'individual' then
      if v_new >= c.goal_value then
        update challenge_participation set completed_at = coalesce(completed_at, now()) where challenge_id = c.id and user_id = p_user;
        perform gam_reward_participant(c.id, p_user);                                  -- individual: at once (§5.3)
      end if;
    else
      if v_new >= c.per_person_min then
        update challenge_participation set completed_at = coalesce(completed_at, now()) where challenge_id = c.id and user_id = p_user;
      end if;
      perform gam_collective_check(c.id);
    end if;
  end loop;
end $$;
revoke all on function update_challenge_progress(uuid, text) from public;
do $$ begin revoke all on function update_challenge_progress(uuid, text) from anon, authenticated; exception when undefined_object then null; end $$;

-- A finished pathway, for the pathway_completed metric.
create or replace function gam_pathway_challenge_progress(p_user uuid, p_slug text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
begin
  for c in select * from challenges
            where status in ('scheduled', 'active') and starts_at <= now() and ends_at >= now()
              and metric = 'pathway_completed'
  loop
    if not gam_in_challenge_scope(p_user, c, now()) then continue; end if;
    insert into challenge_counted (challenge_id, user_id, source_id) values (c.id, p_user, 'pathway:' || p_slug)
    on conflict do nothing;
    if not found then continue; end if;
    insert into challenge_participation (challenge_id, user_id, progress_value) values (c.id, p_user, 1)
    on conflict (challenge_id, user_id) do update set progress_value = challenge_participation.progress_value + 1, updated_at = now();
    if c.format = 'individual' then
      if (select progress_value from challenge_participation where challenge_id = c.id and user_id = p_user) >= c.goal_value then
        update challenge_participation set completed_at = coalesce(completed_at, now()) where challenge_id = c.id and user_id = p_user;
        perform gam_reward_participant(c.id, p_user);
      end if;
    else
      perform gam_collective_check(c.id);
    end if;
  end loop;
end $$;
revoke all on function gam_pathway_challenge_progress(uuid, text) from public;

-- The credit trigger, now: challenges first, then achievements.
create or replace function gam_points_evaluate() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.source_type = 'session' then perform update_challenge_progress(new.user_id, new.source_id); end if;
  exception when others then
    raise warning 'update_challenge_progress(%) failed: %', new.user_id, sqlerrm;
  end;
  begin
    perform evaluate_achievements(new.user_id);
  exception when others then
    raise warning 'evaluate_achievements(%) failed: %', new.user_id, sqlerrm;
  end;
  return null;
end $$;

create or replace function record_pathway_completed(p_slug text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_slug is null or length(trim(p_slug)) = 0 or length(p_slug) > 120 then raise exception 'bad pathway'; end if;
  insert into pathway_completions (user_id, pathway_slug) values (me, trim(p_slug)) on conflict do nothing;
  perform gam_pathway_challenge_progress(me, trim(p_slug));
  perform evaluate_achievements(me);
end $$;

-- What slice 2 and 4 left as placeholders.
create or replace function gam_challenges_completed(p_user uuid) returns int
  language sql stable security definer set search_path = public as $$
  select count(*)::int from challenge_participation where user_id = p_user and completed_at is not null
$$;
create or replace function gam_user_earned_benefit(p_user uuid, p_benefit uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from challenge_participation p join challenges c on c.id = p.challenge_id
     where p.user_id = p_user and c.reward_benefit_id = p_benefit and p.benefit_granted_at is not null)
$$;

-- ---- settlement -------------------------------------------------------------------------
-- At ends_at: collective rewards for whoever qualifies, raffles for limited
-- exclusive benefits, then 'settled'. Idempotent: a settled challenge is left
-- alone, and a raffle is drawn once (challenge_raffle_draws).
create or replace function settle_challenges() returns int
  language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
  r record;
  n int := 0;
  v_stock int;
  v_left int;
begin
  update challenges set status = 'active' where status = 'scheduled' and starts_at <= now() and ends_at > now();
  for c in select * from challenges where status in ('scheduled', 'active', 'ended') and ends_at <= now() for update loop
    update challenges set status = 'ended' where id = c.id and status <> 'ended';
    if c.format = 'collective' then perform gam_collective_check(c.id); end if;

    if c.reward_benefit_id is not null and c.reward_rule_when_out_of_stock = 'raffle'
       and not exists (select 1 from challenge_raffle_draws where challenge_id = c.id) then
      select stock_total into v_stock from benefits where id = c.reward_benefit_id;
      v_left := coalesce(v_stock, 2147483647) - (select count(*) from challenge_participation where challenge_id = c.id and benefit_granted_at is not null);
      for r in
        select p.user_id, row_number() over (order by gen_random_uuid()) as k
          from challenge_participation p
         where p.challenge_id = c.id and p.rewarded_at is not null and p.benefit_granted_at is null
      loop
        insert into challenge_raffle_draws (challenge_id, user_id, won) values (c.id, r.user_id, r.k <= v_left)
        on conflict do nothing;
        if r.k <= v_left then
          update challenge_participation set benefit_granted_at = now() where challenge_id = c.id and user_id = r.user_id;
        end if;
      end loop;
    end if;

    update challenges set status = 'settled', settled_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function settle_challenges() from public;
do $$ begin revoke all on function settle_challenges() from anon, authenticated; exception when undefined_object then null; end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gl-challenges-settle';
    perform cron.schedule('gl-challenges-settle', '5 * * * *', 'select public.settle_challenges()');
  end if;
exception when others then
  raise notice 'could not schedule gl-challenges-settle (%): use the Admin button', sqlerrm;
end $$;

-- ---- what the app reads -------------------------------------------------------------------
-- The live challenges this person is in scope for, with their own part. For
-- a collective: the shared value and, for a whole company, its share — but
-- never a list of people, and no participant count under k (§5.5, §7.3).
create or replace function get_my_challenges() returns json
  language sql stable security definer set search_path = public as $$
  with me as (select current_profile() as id),
       k as (select hr_min_cohort as v from economy_settings where id)
  select coalesce(json_agg(json_build_object(
           'id', c.id, 'companyId', c.company_id,
           'companyName', (select co.name from companies co where co.id = c.company_id),
           'title', c.title, 'description', c.description, 'badgeIcon', c.badge_icon,
           'format', c.format, 'scope', c.scope, 'scopeRef', c.scope_ref, 'metric', c.metric,
           'goalValue', c.goal_value, 'goalKind', c.goal_kind, 'perPersonMin', c.per_person_min,
           'windowStartHour', c.window_start_hour, 'windowEndHour', c.window_end_hour,
           'startsAt', c.starts_at, 'endsAt', c.ends_at, 'status', c.status,
           'rewardBonusLoopsCenti', c.reward_bonus_loops_centi,
           'rewardBenefit', (select json_build_object('id', b.id, 'title', b.title) from benefits b where b.id = c.reward_benefit_id),
           'myProgress', coalesce(p.progress_value, 0), 'myCompletedAt', p.completed_at, 'myRewardedAt', p.rewarded_at,
           'myBenefitGranted', p.benefit_granted_at is not null,
           'collectiveValue', case when c.format = 'collective' then gam_collective_value(c) end,
           'participants', case when c.format = 'collective' then (
              select case when c.scope = 'company' and count(*) < k.v then null else count(*) end
                from challenge_participation x where x.challenge_id = c.id and x.progress_value > 0) end,
           'goalReachedAt', c.goal_reached_at)
         order by c.ends_at), '[]'::json)
    from challenges c
    cross join me cross join k
    left join challenge_participation p on p.challenge_id = c.id and p.user_id = me.id
   where me.id is not null
     and c.status in ('active', 'scheduled', 'ended', 'settled')
     and c.ends_at > now() - interval '14 days'
     and gam_in_challenge_scope(me.id, c, least(now(), c.ends_at))
$$;
revoke all on function get_my_challenges() from public;
do $$ begin grant execute on function get_my_challenges() to authenticated; exception when undefined_object then null; end $$;

-- ---- the console (Good Loop challenges) ---------------------------------------------------
create or replace function admin_save_challenge(p jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if nullif(p->>'companyId', '') is not null then
    raise exception 'company challenges are written by the company''s HR' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  insert into challenges (id, title, description, badge_icon, format, scope, scope_ref, metric, goal_value, goal_kind,
                          per_person_min, window_start_hour, window_end_hour, starts_at, ends_at, status,
                          reward_bonus_loops_centi, reward_benefit_id, reward_rule_when_out_of_stock, announce_in_app, created_by)
  values (v_id, p->>'title', nullif(p->>'description', ''), coalesce(nullif(p->>'badgeIcon', ''), 'flag'),
          (p->>'format')::challenge_format, (p->>'scope')::gam_scope, nullif(p->>'scopeRef', ''),
          (p->>'metric')::challenge_metric, (p->>'goalValue')::numeric, 'total',
          (p->>'perPersonMin')::numeric, (p->>'windowStartHour')::int, (p->>'windowEndHour')::int,
          (p->>'startsAt')::timestamptz, (p->>'endsAt')::timestamptz, 'draft',
          (p->>'rewardBonusLoopsCenti')::int, nullif(p->>'rewardBenefitId', '')::uuid,
          coalesce((p->>'rewardRule')::challenge_stock_rule, 'first_to_complete'),
          coalesce((p->>'announceInApp')::boolean, true), current_profile())
  on conflict (id) do update set
    title = excluded.title, description = excluded.description, badge_icon = excluded.badge_icon,
    format = excluded.format, scope = excluded.scope, scope_ref = excluded.scope_ref, metric = excluded.metric,
    goal_value = excluded.goal_value, per_person_min = excluded.per_person_min,
    window_start_hour = excluded.window_start_hour, window_end_hour = excluded.window_end_hour,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    reward_bonus_loops_centi = excluded.reward_bonus_loops_centi, reward_benefit_id = excluded.reward_benefit_id,
    reward_rule_when_out_of_stock = excluded.reward_rule_when_out_of_stock, announce_in_app = excluded.announce_in_app
  where challenges.status in ('draft', 'scheduled');
  if not found then raise exception 'a live challenge cannot be edited' using errcode = 'P0001', hint = 'CHALLENGE_LIVE'; end if;
  -- an exclusive prize is exclusive to this challenge
  update benefits set challenge_exclusive_id = v_id where id = nullif(p->>'rewardBenefitId', '')::uuid and price_loops_centi is null;
  return v_id;
end $$;
revoke all on function admin_save_challenge(jsonb) from public;
do $$ begin grant execute on function admin_save_challenge(jsonb) to authenticated; exception when undefined_object then null; end $$;

-- publish | schedule | end | cancel | duplicate  (§5.4 actions)
create or replace function admin_challenge_action(p_id uuid, p_action text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
  v_new uuid;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  select * into c from challenges where id = p_id for update;
  if not found or c.company_id is not null then raise exception 'no such Good Loop challenge'; end if;
  if p_action in ('publish', 'schedule') then
    if c.status <> 'draft' then raise exception 'already published' using errcode = 'P0001', hint = 'CHALLENGE_LIVE'; end if;
    if c.ends_at <= now() then raise exception 'it would end before it starts' using errcode = 'P0001', hint = 'CHALLENGE_DATES'; end if;
    if c.reward_bonus_loops_centi is null and c.reward_benefit_id is null then
      raise exception 'a challenge needs a reward' using errcode = 'P0001', hint = 'CHALLENGE_REWARD';
    end if;
    if p_action = 'publish' and c.starts_at > now() then
      update challenges set starts_at = now() where id = p_id;
    end if;
    update challenges set status = case when starts_at > now() then 'scheduled'::challenge_status else 'active'::challenge_status end,
                          published_at = now() where id = p_id;
    return p_id;
  elsif p_action = 'end' then
    update challenges set ends_at = least(ends_at, now()) where id = p_id and status in ('scheduled', 'active');
    perform settle_challenges();
    return p_id;
  elsif p_action = 'cancel' then
    update challenges set status = 'cancelled' where id = p_id and status in ('draft', 'scheduled', 'active');
    return p_id;
  elsif p_action = 'duplicate' then
    v_new := gen_random_uuid();
    insert into challenges (id, title, description, badge_icon, format, scope, scope_ref, metric, goal_value, goal_kind,
                            per_person_min, window_start_hour, window_end_hour, starts_at, ends_at, status,
                            reward_bonus_loops_centi, reward_benefit_id, reward_rule_when_out_of_stock, announce_in_app, created_by)
    select v_new, left(title || ' (cópia)', 80), description, badge_icon, format, scope, scope_ref, metric, goal_value, goal_kind,
           per_person_min, window_start_hour, window_end_hour, greatest(now(), starts_at), greatest(now(), starts_at) + (ends_at - starts_at), 'draft',
           reward_bonus_loops_centi, null, reward_rule_when_out_of_stock, announce_in_app, current_profile()
      from challenges where id = p_id;
    return v_new;
  end if;
  raise exception 'unknown action %', p_action;
end $$;
revoke all on function admin_challenge_action(uuid, text) from public;
do $$ begin grant execute on function admin_challenge_action(uuid, text) to authenticated; exception when undefined_object then null; end $$;

-- The console's list: every Good Loop challenge with its counts (§5.4).
create or replace function admin_list_challenges() returns json
  language sql stable security definer set search_path = public as $$
  select case when not is_admin() then null else coalesce(json_agg(json_build_object(
           'id', c.id, 'title', c.title, 'description', c.description, 'badgeIcon', c.badge_icon,
           'format', c.format, 'scope', c.scope, 'scopeRef', c.scope_ref, 'metric', c.metric,
           'goalValue', c.goal_value, 'perPersonMin', c.per_person_min,
           'windowStartHour', c.window_start_hour, 'windowEndHour', c.window_end_hour,
           'startsAt', c.starts_at, 'endsAt', c.ends_at, 'status', c.status,
           'rewardBonusLoopsCenti', c.reward_bonus_loops_centi, 'rewardBenefitId', c.reward_benefit_id,
           'rewardRule', c.reward_rule_when_out_of_stock, 'announceInApp', c.announce_in_app,
           'participants', (select count(*) from challenge_participation p where p.challenge_id = c.id and p.progress_value > 0),
           'completed', (select count(*) from challenge_participation p where p.challenge_id = c.id and p.completed_at is not null),
           'rewarded', (select count(*) from challenge_participation p where p.challenge_id = c.id and p.rewarded_at is not null),
           'collectiveValue', case when c.format = 'collective' then gam_collective_value(c) end)
         order by c.starts_at desc), '[]'::json) end
    from challenges c where c.company_id is null
$$;
revoke all on function admin_list_challenges() from public;
do $$ begin grant execute on function admin_list_challenges() to authenticated; exception when undefined_object then null; end $$;

-- "População ativa suficiente" and the estimated reach (§5.4 step 3, right column).
create or replace function admin_challenge_reach(p_scope text, p_ref text) returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', gam_sp_day(now()) - interval '1 month')::date;
  v_active int;
  v_people int;
  v_threshold int;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if p_scope not in ('national', 'region', 'state', 'city') then
    raise exception 'scope must be national, region, state or city' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  v_threshold := gam_geo_threshold(case when p_scope = 'city' then 'city' else 'state' end);
  if p_scope = 'national' then
    select count(*) into v_people from profiles where role = 'b2c_user' and active;
    select coalesce((select active_users from geo_rollup where scope = 'national' and period_month = v_month), 0) into v_active;
  else
    select count(*) into v_people from profiles p join br_municipalities m on m.ibge_code = p.city_ibge_code
     where gam_geo_consented(p.id) and ((p_scope = 'city' and m.ibge_code = p_ref) or (p_scope = 'state' and m.uf::text = p_ref) or (p_scope = 'region' and m.region = p_ref));
    select coalesce((select active_users from geo_rollup where scope = p_scope and ref = p_ref and period_month = v_month), 0) into v_active;
  end if;
  return json_build_object('people', v_people, 'activeLastMonth', v_active, 'threshold', v_threshold,
                           'enough', p_scope = 'national' or v_active >= v_threshold);
end $$;
revoke all on function admin_challenge_reach(text, text) from public;
do $$ begin grant execute on function admin_challenge_reach(text, text) to authenticated; exception when undefined_object then null; end $$;

create or replace function admin_settle_challenges() returns int
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return settle_challenges();
end $$;
revoke all on function admin_settle_challenges() from public;
do $$ begin grant execute on function admin_settle_challenges() to authenticated; exception when undefined_object then null; end $$;

notify pgrst, 'reload schema';
