-- ============================================================================
-- GAMIFICATION · 8 — YOUR PART, AND YOUR HISTORY       (Progress tabs)
--
-- For a database that is already live. The same block is in setup.sql.
-- Safe to re-run. Needs 16 to 23.
--
-- Two reads for the person's own Progress screens:
--   get_my_collective_progress()  for every collective achievement: the
--       person's own part (minutes — never points, PLAN A6), what part
--       qualifies, and how far the unit (their city, state, region, the
--       country, their company) is toward the goal — the unit's figure only
--       when it is above its threshold, as everywhere else (GAM-R5).
--   get_my_challenges()  now also returns every challenge the person took
--       part in, however long ago, so Progress › Desafios has a history.
-- ============================================================================

-- The minutes a person heard in credited sessions, optionally since a date
-- and optionally only those that carried a city (geo_ranking consented).
create or replace function gam_my_minutes(p_user uuid, p_since date, p_with_city boolean) returns bigint
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(least(greatest(coalesce(s.listened_sec, 0), 0), s.duration_min * 60)) / 60, 0)::bigint
    from points_ledger pl
    join sessions s on s.id::text = pl.source_id
   where pl.user_id = p_user and pl.source_type = 'session'
     and (p_since is null or pl.period_month >= p_since)
     and (not p_with_city or pl.city_ibge_code is not null)
$$;
revoke all on function gam_my_minutes(uuid, date, boolean) from public;

create or replace function get_my_collective_progress() returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := current_profile();
  cfg economy_settings%rowtype;
  v_month date := date_trunc('month', gam_sp_day(now()))::date;
  v_city text; v_uf text; v_region text;
  v_consent boolean;
  v_company text;
  v_company_name text;
  v_month_geo bigint;
  v_life_geo bigint;
  v_month_all bigint;
  out_rows json;
begin
  if me is null then return '[]'::json; end if;
  select * into cfg from economy_settings where id;
  v_consent := gam_geo_consented(me);
  select p.city_ibge_code, m.uf::text, m.region into v_city, v_uf, v_region
    from profiles p left join br_municipalities m on m.ibge_code = p.city_ibge_code where p.id = me;
  select a.company_id, c.name into v_company, v_company_name
    from company_affiliations a join companies c on c.id = a.company_id
   where a.user_id = me and a.ended_at is null limit 1;
  v_month_geo := gam_my_minutes(me, v_month, true);
  v_life_geo := gam_my_minutes(me, null, true);
  v_month_all := gam_my_minutes(me, v_month, false);

  select coalesce(json_agg(t.x order by t.sort), '[]'::json) into out_rows from (
    select d.sort_order as sort, json_build_object(
      'slug', d.slug,
      'unit', d.scope,
      'unitRef', case d.scope when 'city' then v_city when 'state' then v_uf when 'region' then v_region
                              when 'national' then 'BR' when 'company' then v_company end,
      'unitName', case d.scope when 'city' then (select name from br_municipalities where ibge_code = v_city)
                               when 'company' then v_company_name end,
      -- whether the person can take part at all
      'canTakePart', case when d.scope = 'company' then v_company is not null else v_consent and v_city is not null end,
      'myMinutes', case when d.scope = 'company' then v_month_all
                        when d.period = 'lifetime' then v_life_geo else v_month_geo end,
      'neededMinutes', cfg.min_contribution_points,
      'unitShare', (
        case d.metric
          when 'city_month_points' then (select least(1, round(g.points::numeric / d.threshold, 4)) from geo_rollup g
                 where g.scope = 'city' and g.ref = v_city and g.period_month = v_month and g.active_users >= cfg.geo_min_active_users)
          when 'city_night_sessions' then (select least(1, round(g.night_sessions::numeric / d.threshold, 4)) from geo_rollup g
                 where g.scope = 'city' and g.ref = v_city and g.period_month = v_month and g.active_users >= cfg.geo_min_active_users)
          when 'state_active_cities' then (select least(1, round(g.active_cities::numeric / d.threshold, 4)) from geo_rollup g
                 where g.scope = 'state' and g.ref = v_uf and g.period_month = v_month and g.active_users >= cfg.hr_min_cohort)
          when 'region_month_points' then (select least(1, round(g.points::numeric / d.threshold, 4)) from geo_rollup g
                 where g.scope = 'region' and g.ref = v_region and g.period_month = v_month and g.active_users >= cfg.hr_min_cohort)
          when 'national_minutes_lifetime' then (select least(1, round(g.minutes::numeric / d.threshold, 4)) from geo_rollup g
                 where g.scope = 'national' and g.period_month = date '1900-01-01' and g.active_users >= cfg.hr_min_cohort)
          when 'company_active_share_pct' then (
            select case when e.n >= cfg.hr_min_cohort then least(1, round((100.0 * act.n / e.n) / d.threshold, 4)) end
              from (select count(distinct user_id) as n from company_affiliations where company_id = v_company and ended_at is null) e,
                   (select count(distinct pl.user_id) as n from points_ledger pl
                      join company_affiliations a on a.user_id = pl.user_id and a.company_id = v_company and a.ended_at is null
                     where pl.period_month = v_month and pl.source_type = 'session') act
             where v_company is not null)
          else null end)
    ) as x
      from achievement_definitions d
     where d.active and d.kind = 'collective'
  ) t;
  return out_rows;
end $$;
revoke all on function get_my_collective_progress() from public;
do $$ begin grant execute on function get_my_collective_progress() to authenticated; exception when undefined_object then null; end $$;

-- What the Rankings tab shows of the person's own part.
create or replace function get_my_ranking_part() returns json
  language sql stable security definer set search_path = public as $$
  select json_build_object(
    'monthMinutes', gam_my_minutes(current_profile(), date_trunc('month', gam_sp_day(now()))::date, true),
    'lifetimeMinutes', gam_my_minutes(current_profile(), null, true))
$$;
revoke all on function get_my_ranking_part() from public;
do $$ begin grant execute on function get_my_ranking_part() to authenticated; exception when undefined_object then null; end $$;

-- The person's challenges: live ones in scope, recently ended ones in scope,
-- and every one they ever took part in (the history).
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
         order by c.ends_at desc), '[]'::json)
    from challenges c
    cross join me cross join k
    left join challenge_participation p on p.challenge_id = c.id and p.user_id = me.id
   where me.id is not null
     and c.status in ('active', 'scheduled', 'ended', 'settled')
     and (
       (p.user_id is not null and p.progress_value > 0)
       or (c.ends_at > now() - interval '14 days' and gam_in_challenge_scope(me.id, c, least(now(), c.ends_at)))
     )
$$;

notify pgrst, 'reload schema';
