-- ============================================================================
-- GAMIFICATION · 3 — GEOGRAPHIC RANKS            (docs/gamification/SPEC.md §4)
--
-- For a database that is already live. The same block is in setup.sql.
-- Safe to re-run. Needs 16 and 17. Then run supabase/seed/br_municipalities.sql
-- (setup.sql carries that data inline).
--
-- GAM-R5, privacy by default:
--   - the city is one the person DECLARES in their profile, never a GPS fix;
--   - it counts only under a separate consent purpose, 'geo_ranking',
--     recorded in consent_events like every other purpose (LEG-04);
--   - a Points entry snapshots the city at credit time, and only while that
--     consent is granted, so moving city never rewrites a past month;
--   - once someone withdraws, none of their rows reaches any view;
--   - a city appears in a ranking or a collective goal only with at least
--     geo_min_active_users (50) active people in the period; a state, a
--     region or the country only above the k floor (hr_min_cohort, 25).
-- GAM-R4: the scopes are city, state, region and national. Nothing smaller.
-- GAM-R9: ranks are Points, never Loops — a multiplier changes nothing here.
-- PLAN A6: Points are never shown to the person. The functions the app calls
-- return ranks, shares of a goal and minutes, not points.
-- ============================================================================

create table if not exists br_municipalities (
  ibge_code   text primary key check (ibge_code ~ '^[0-9]{7}$'),
  name        text not null,
  uf          char(2) not null,
  region      text not null check (region in ('N', 'NE', 'SE', 'S', 'CO')),
  search_key  text not null
);
create index if not exists br_municipalities_search on br_municipalities (search_key text_pattern_ops);
create index if not exists br_municipalities_uf on br_municipalities (uf);
alter table br_municipalities enable row level security;
drop policy if exists br_municipalities_read on br_municipalities;
create policy br_municipalities_read on br_municipalities for select using (auth.uid() is not null);

alter table profiles add column if not exists city_ibge_code text references br_municipalities(ibge_code);

-- ---- consent ------------------------------------------------------------------
create or replace function gam_geo_consented(p_user uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select granted from consent_events
     where profile_id = p_user and purpose = 'geo_ranking'
     order by at desc limit 1), false)
$$;
revoke all on function gam_geo_consented(uuid) from public;

-- The city goes on a Points entry when it is written, and only under consent.
create or replace function gam_points_city() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.city_ibge_code is null and gam_geo_consented(new.user_id) then
    select city_ibge_code into new.city_ibge_code from profiles where id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists points_ledger_city on points_ledger;
create trigger points_ledger_city before insert on points_ledger
  for each row execute function gam_points_city();

-- ---- the roll-up ----------------------------------------------------------------
-- One materialized view, every scope and period at once (GROUPING SETS):
--   scope     'city' | 'state' | 'region' | 'national'
--   ref       ibge_code | UF | region code | 'BR'
--   period    first of the São Paulo month, or 1900-01-01 for all time
-- Only Points entries from sessions, with a city, from people whose LATEST
-- geo_ranking choice is a grant.
create materialized view if not exists geo_rollup as
with people as (
  select p.id from profiles p where gam_geo_consented(p.id)
),
r as (
  select pl.user_id, pl.period_month, pl.city_ibge_code, m.uf::text as uf, m.region, pl.points,
         s.started_at, s.completed, s.listened_sec, s.duration_min
    from points_ledger pl
    join people pp on pp.id = pl.user_id
    join br_municipalities m on m.ibge_code = pl.city_ibge_code
    join sessions s on s.id::text = pl.source_id
   where pl.source_type = 'session'
)
select
  case when grouping(r.city_ibge_code) = 0 then 'city'
       when grouping(r.uf) = 0 then 'state'
       when grouping(r.region) = 0 then 'region'
       else 'national' end                                         as scope,
  coalesce(r.city_ibge_code, r.uf, r.region, 'BR')                 as ref,
  coalesce(r.period_month, date '1900-01-01')                      as period_month,
  sum(r.points)::bigint                                            as points,
  count(distinct r.user_id)::int                                   as active_users,
  count(distinct r.city_ibge_code)::int                            as active_cities,
  (count(*) filter (where r.completed
     and extract(hour from r.started_at at time zone 'America/Sao_Paulo') >= 21))::int as night_sessions,
  (coalesce(sum(least(greatest(coalesce(r.listened_sec, 0), 0), r.duration_min * 60)), 0) / 60)::bigint as minutes
from r
group by grouping sets (
  (r.period_month, r.city_ibge_code), (r.period_month, r.uf), (r.period_month, r.region), (r.period_month),
  (r.city_ibge_code), (r.uf), (r.region), ()
);
create unique index if not exists geo_rollup_key on geo_rollup (scope, ref, period_month);

-- The four views the SPEC names (§4.4), over the roll-up.
create or replace view geo_city_month as
  select ref as city_ibge_code, period_month, points, active_users, night_sessions, minutes
    from geo_rollup where scope = 'city' and period_month <> date '1900-01-01';
create or replace view geo_state_month as
  select ref as uf, period_month, points, active_users, active_cities, night_sessions, minutes
    from geo_rollup where scope = 'state' and period_month <> date '1900-01-01';
create or replace view geo_region_month as
  select ref as region, period_month, points, active_users, active_cities, minutes
    from geo_rollup where scope = 'region' and period_month <> date '1900-01-01';
create or replace view geo_national as
  select period_month, points, active_users, active_cities, minutes
    from geo_rollup where scope = 'national';

-- Nobody reads these directly: they hold small cells. Only the functions
-- below, which apply the thresholds, look at them.
do $$ begin
  revoke all on geo_rollup, geo_city_month, geo_state_month, geo_region_month, geo_national from anon, authenticated;
exception when undefined_object then null; end $$;

-- ---- what the app calls -----------------------------------------------------------
create or replace function search_municipalities(p_q text, p_limit int default 12)
  returns table (ibge_code text, name text, uf text)
  language sql stable security definer set search_path = public as $$
  with q as (
    select trim(regexp_replace(lower(translate(coalesce(p_q, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9 ]+', ' ', 'g')) as k
  )
  select m.ibge_code, m.name, m.uf::text
    from br_municipalities m, q
   where length(q.k) >= 2 and (m.search_key like q.k || '%' or m.search_key like '% ' || q.k || '%')
   order by (m.search_key like q.k || '%') desc, length(m.name), m.name
   limit greatest(1, least(coalesce(p_limit, 12), 30))
$$;
revoke all on function search_municipalities(text, int) from public;
do $$ begin grant execute on function search_municipalities(text, int) to authenticated; exception when undefined_object then null; end $$;

-- The city a person declares. null clears it. The consent is its own row in
-- consent_events, written by the app like every other purpose.
create or replace function set_my_city(p_code text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_code is not null and not exists (select 1 from br_municipalities where ibge_code = p_code) then
    raise exception 'unknown municipality';
  end if;
  update profiles set city_ibge_code = p_code where id = me;
end $$;
revoke all on function set_my_city(text) from public;
do $$ begin grant execute on function set_my_city(text) to authenticated; exception when undefined_object then null; end $$;

-- The threshold that applies to a scope.
create or replace function gam_geo_threshold(p_scope text) returns int
  language sql stable security definer set search_path = public as $$
  select case when p_scope = 'city' then s.geo_min_active_users else s.hr_min_cohort end
    from economy_settings s where s.id
$$;
revoke all on function gam_geo_threshold(text) from public;

-- Rankings by Points per ACTIVE person, so a small city competes fairly with
-- São Paulo (§4.3). Only units above their threshold. The caller's own unit
-- comes back separately, ranked if it is eligible, even outside the top N.
-- Returned without Points (PLAN A6): rank, minutes per active person.
create or replace function get_geo_rankings(p_scope text, p_period text default 'month', p_limit int default 5) returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := current_profile();
  v_period date;
  v_threshold int;
  v_mine text;
  out_rows json;
  out_mine json;
begin
  if p_scope not in ('city', 'state', 'region') then raise exception 'scope must be city, state or region'; end if;
  v_period := case when p_period = 'all' then date '1900-01-01'
                   else date_trunc('month', gam_sp_day(now()))::date end;
  v_threshold := gam_geo_threshold(p_scope);

  if me is not null and gam_geo_consented(me) then
    select case p_scope when 'city' then m.ibge_code when 'state' then m.uf::text else m.region end
      into v_mine
      from profiles p join br_municipalities m on m.ibge_code = p.city_ibge_code
     where p.id = me;
  end if;

  with eligible as (
    select g.ref, g.active_users, g.minutes,
           rank() over (order by g.points::numeric / g.active_users desc, g.ref) as rnk
      from geo_rollup g
     where g.scope = p_scope and g.period_month = v_period and g.active_users >= v_threshold
  ),
  labelled as (
    select e.*, m.name, m.uf::text as uf
      from eligible e left join br_municipalities m on p_scope = 'city' and m.ibge_code = e.ref
  )
  select coalesce(json_agg(json_build_object(
           'ref', l.ref, 'name', l.name, 'uf', l.uf, 'rank', l.rnk,
           'minutesPerActive', round(l.minutes::numeric / l.active_users),
           'mine', l.ref = v_mine) order by l.rnk), '[]'::json),
         (select json_build_object('ref', x.ref, 'name', x.name, 'uf', x.uf, 'rank', x.rnk, 'eligible', true)
            from labelled x where x.ref = v_mine)
    into out_rows, out_mine
    from (select * from labelled order by rnk limit greatest(1, least(coalesce(p_limit, 5), 50))) l;

  if v_mine is not null and out_mine is null then
    select json_build_object('ref', v_mine, 'name', m.name, 'uf', m.uf, 'rank', null, 'eligible', false)
      into out_mine
      from (select 1) one left join br_municipalities m on p_scope = 'city' and m.ibge_code = v_mine;
  end if;

  return json_build_object('scope', p_scope, 'period', p_period, 'threshold', v_threshold,
                           'rows', out_rows, 'mine', out_mine);
end $$;
revoke all on function get_geo_rankings(text, text, int) from public;
do $$ begin grant execute on function get_geo_rankings(text, text, int) to authenticated; exception when undefined_object then null; end $$;

-- The violet city card (§4.5): the city, whether it is in the rankings yet,
-- its share of this month's "Cidade em Loop" goal, and the person's own part
-- in minutes. Nothing about the city is returned below the threshold.
create or replace function get_my_city_card() returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := current_profile();
  v_city text;
  v_month date := date_trunc('month', gam_sp_day(now()))::date;
  g geo_rollup%rowtype;
  v_goal numeric;
  v_threshold int := gam_geo_threshold('city');
  v_my_minutes bigint;
begin
  if me is null then return null; end if;
  select city_ibge_code into v_city from profiles where id = me;
  select threshold into v_goal from achievement_definitions where slug = 'city_in_loop';
  select coalesce(sum(eligible_minutes), 0) into v_my_minutes
    from gam_daily_usage where user_id = me and day >= v_month;
  if v_city is null then
    return json_build_object('consented', gam_geo_consented(me), 'city', null);
  end if;
  select * into g from geo_rollup where scope = 'city' and ref = v_city and period_month = v_month;
  return json_build_object(
    'consented', gam_geo_consented(me),
    'city', (select json_build_object('ref', m.ibge_code, 'name', m.name, 'uf', m.uf) from br_municipalities m where m.ibge_code = v_city),
    'eligible', coalesce(g.active_users, 0) >= v_threshold,
    'goalSlug', 'city_in_loop',
    'goalShare', case when coalesce(g.active_users, 0) >= v_threshold and v_goal > 0
                      then least(1, round(g.points::numeric / v_goal, 4)) end,
    'myMinutesMonth', v_my_minutes);
end $$;
revoke all on function get_my_city_card() from public;
do $$ begin grant execute on function get_my_city_card() to authenticated; exception when undefined_object then null; end $$;

-- ---- collective achievements (§3.3) -------------------------------------------
-- Awarded to everyone who contributed at least min_contribution_points in the
-- qualifying period and unit. One-time per person; bonus once, Good Loop's.
create or replace function gam_award(p_def uuid, p_user uuid) returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  v_bonus int;
begin
  insert into user_achievements (user_id, achievement_id) values (p_user, p_def) on conflict do nothing;
  if not found then return false; end if;
  select bonus_loops_centi into v_bonus from achievement_definitions where id = p_def;
  perform gam_credit_bonus(p_user, 'achievement_bonus', 'achievement', p_def::text, v_bonus, 'goodloop');
  return true;
end $$;
revoke all on function gam_award(uuid, uuid) from public;
do $$ begin revoke all on function gam_award(uuid, uuid) from anon, authenticated; exception when undefined_object then null; end $$;

create or replace function gam_evaluate_collectives() returns int
  language plpgsql security definer set search_path = public as $$
declare
  cfg economy_settings%rowtype;
  d   achievement_definitions%rowtype;
  r   record;
  n   int := 0;
  v_now_month date := date_trunc('month', gam_sp_day(now()))::date;
  v_city_k int;
  v_k int;
begin
  select * into cfg from economy_settings where id;
  v_city_k := cfg.geo_min_active_users;
  v_k := cfg.hr_min_cohort;

  for d in select * from achievement_definitions where active and kind = 'collective' loop
    for r in
      -- the people to award, per metric
      with units as (
        select g.scope, g.ref, g.period_month
          from geo_rollup g
         where g.period_month <> date '1900-01-01'
           and (
             (d.metric = 'city_month_points'   and g.scope = 'city'   and g.active_users >= v_city_k and g.points >= d.threshold) or
             (d.metric = 'city_night_sessions' and g.scope = 'city'   and g.active_users >= v_city_k and g.night_sessions >= d.threshold) or
             (d.metric = 'state_active_cities' and g.scope = 'state'  and g.active_users >= v_k and g.active_cities >= d.threshold) or
             (d.metric = 'region_month_points' and g.scope = 'region' and g.active_users >= v_k and g.points >= d.threshold)
           )
        union all
        -- Capital of calm: first by points per active person, in a month that has ENDED
        select 'city', x.ref, x.period_month from (
          select g.ref, g.period_month,
                 rank() over (partition by g.period_month order by g.points::numeric / g.active_users desc, g.ref) as rnk
            from geo_rollup g
           where d.metric = 'city_rank_per_active' and g.scope = 'city'
             and g.period_month <> date '1900-01-01' and g.period_month < v_now_month
             and g.active_users >= v_city_k
        ) x where x.rnk <= d.threshold
      )
      select pl.user_id
        from units u
        join points_ledger pl on pl.period_month = u.period_month and pl.source_type = 'session'
        join br_municipalities m on m.ibge_code = pl.city_ibge_code
       where gam_geo_consented(pl.user_id)
         and ((u.scope = 'city' and m.ibge_code = u.ref) or (u.scope = 'state' and m.uf::text = u.ref)
              or (u.scope = 'region' and m.region = u.ref))
       group by pl.user_id, u.scope, u.ref, u.period_month
      having sum(pl.points) >= cfg.min_contribution_points
      union
      -- Brazil in Loop: national lifetime minutes
      select pl.user_id
        from points_ledger pl
       where d.metric = 'national_minutes_lifetime'
         and exists (select 1 from geo_rollup g where g.scope = 'national' and g.period_month = date '1900-01-01'
                      and g.active_users >= v_k and g.minutes >= d.threshold)
         and pl.city_ibge_code is not null and pl.source_type = 'session' and gam_geo_consented(pl.user_id)
       group by pl.user_id
      having sum(pl.points) >= cfg.min_contribution_points
      union
      -- Company in Loop: ≥ threshold % of the company's eligible people had a
      -- session that month, add-on companies only, the company itself above k.
      -- Needs no geographic consent: the unit is the whole company.
      select c.user_id from (
        select a.company_id, mo.month, pl.user_id, sum(pl.points) as pts
          from (select distinct period_month as month from points_ledger) mo
          join company_affiliations a
            on a.started_at < (mo.month + interval '1 month') and (a.ended_at is null or a.ended_at >= mo.month)
          join points_ledger pl
            on pl.user_id = a.user_id and pl.period_month = mo.month and pl.source_type = 'session'
         where d.metric = 'company_active_share_pct'
           and exists (select 1 from company_addon_subscriptions s
                        where s.company_id = a.company_id and s.status = 'active'
                          and s.starts_at < (mo.month + interval '1 month') and (s.ends_at is null or s.ends_at > mo.month))
         group by a.company_id, mo.month, pl.user_id
      ) c
      join lateral (
        select count(distinct a2.user_id) as eligible
          from company_affiliations a2
         where a2.company_id = c.company_id
           and a2.started_at < (c.month + interval '1 month') and (a2.ended_at is null or a2.ended_at >= c.month)
      ) e on true
      join lateral (
        select count(distinct pl2.user_id) as active
          from points_ledger pl2
          join company_affiliations a3 on a3.user_id = pl2.user_id and a3.company_id = c.company_id
         where pl2.period_month = c.month and pl2.source_type = 'session'
      ) act on true
      where e.eligible >= v_k and act.active * 100 >= d.threshold * e.eligible
        and c.pts >= cfg.min_contribution_points
    loop
      if gam_award(d.id, r.user_id) then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function gam_evaluate_collectives() from public;
do $$ begin revoke all on function gam_evaluate_collectives() from anon, authenticated; exception when undefined_object then null; end $$;

-- Refresh + evaluate. Every 15 minutes through pg_cron where it exists;
-- otherwise from Admin › Economia "Ricalcola ora".
create or replace function refresh_geo_and_collectives() returns int
  language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently geo_rollup;
  return gam_evaluate_collectives();
end $$;
revoke all on function refresh_geo_and_collectives() from public;
do $$ begin revoke all on function refresh_geo_and_collectives() from anon, authenticated; exception when undefined_object then null; end $$;

create or replace function admin_refresh_geo() returns int
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return refresh_geo_and_collectives();
end $$;
revoke all on function admin_refresh_geo() from public;
do $$ begin grant execute on function admin_refresh_geo() to authenticated; exception when undefined_object then null; end $$;

-- pg_cron, guarded: a database without the extension (local Postgres, a
-- project that has not enabled it) applies this file cleanly and relies on
-- the Admin button instead.
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron is not available (%): use Admin › Economia "Ricalcola ora"', sqlerrm;
end $$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gl-geo-refresh';
    perform cron.schedule('gl-geo-refresh', '*/15 * * * *', 'select public.refresh_geo_and_collectives()');
  end if;
exception when others then
  raise notice 'could not schedule gl-geo-refresh (%): use the Admin button', sqlerrm;
end $$;

notify pgrst, 'reload schema';
