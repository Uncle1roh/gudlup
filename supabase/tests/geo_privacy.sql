-- ============================================================================
-- Geographic ranks: the privacy rules and the collective awards, against the
-- real tables, views and functions. Run by tools/db-gate.mjs on a throwaway
-- database; never on Supabase.
--
-- Cities: São Paulo (A), Campinas (B), Recife (C, below the threshold).
-- The city threshold is lowered to 3 active people for the proof; the k
-- floor for states, regions and companies stays 25 (it cannot be lowered).
-- ============================================================================

update economy_settings set max_backdate_hours = null, geo_min_active_users = 3, min_contribution_points = 30 where id;
update achievement_definitions set threshold = 150 where slug = 'city_in_loop';

create or replace function t_user(p_name text, p_city text, p_consent boolean) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into profiles (auth_uid, role, name, city_ibge_code) values (gen_random_uuid(), 'b2c_user', p_name, p_city) returning id into v;
  if p_consent then
    insert into consent_events (profile_id, purpose, granted, wording, locale, at)
    values (v, 'geo_ranking', true, 'test', 'pt-BR', now() - interval '60 days');
  end if;
  return v;
end $$;

-- A 12-minute session, completed: 22 points. One per day, so no cap bites.
create or replace function t_session(p_user uuid, p_end timestamptz, p_min int default 12, p_listened int default null, p_completed boolean default true)
  returns void language sql as $$
  insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed)
  values ('b2c', p_user, 'GEO', p_min, p_end - make_interval(mins => p_min), p_end, coalesce(p_listened, p_min * 60), p_completed)
$$;

do $$
declare
  u uuid;
  i int;
  oct timestamptz := '2026-10-05 15:00:00+00';
  sep timestamptz := '2026-09-05 15:00:00+00';
begin
  -- A1..A4: two sessions in October, two in September
  for i in 1..4 loop
    u := t_user('geo-A' || i, '3550308', true);
    perform t_session(u, oct + make_interval(days => i));
    perform t_session(u, oct + make_interval(days => i + 7));
    perform t_session(u, sep + make_interval(days => i));
    perform t_session(u, sep + make_interval(days => i + 7));
  end loop;
  -- A5: a little — 2 points in October, under the contribution minimum
  u := t_user('geo-A5', '3550308', true);
  perform t_session(u, oct, 6, 120, false);
  -- A6: never consented. A7: consented, then withdrew.
  u := t_user('geo-A6', '3550308', false);
  perform t_session(u, oct + interval '2 days');
  u := t_user('geo-A7', '3550308', true);
  perform t_session(u, oct + interval '3 days');
  insert into consent_events (profile_id, purpose, granted, wording, locale, at) values (u, 'geo_ranking', false, 'test', 'pt-BR', now());
  -- B1..B3: three sessions in October, one in September
  for i in 1..3 loop
    u := t_user('geo-B' || i, '3509502', true);
    perform t_session(u, oct + make_interval(days => i));
    perform t_session(u, oct + make_interval(days => i + 5));
    perform t_session(u, oct + make_interval(days => i + 10));
    perform t_session(u, sep + make_interval(days => i));
  end loop;
  -- B3 moves to São Paulo, then listens once more
  update profiles set city_ibge_code = '3550308' where name = 'geo-B3';
  perform t_session((select id from profiles where name = 'geo-B3'), oct + interval '20 days');
  -- C1, C2: Recife, only two people — below the threshold
  for i in 1..2 loop
    u := t_user('geo-C' || i, '2611606', true);
    perform t_session(u, oct + make_interval(days => i));
    perform t_session(u, oct + make_interval(days => i + 3));
  end loop;
end $$;

-- A company with the add-on and exactly 25 people (the k floor): 15 of them
-- (60 %) listen in October.
do $$
declare
  u uuid;
  i int;
begin
  insert into companies (id, name) values ('GEO-CO', 'Geo Co');
  insert into company_addon_subscriptions (company_id, plan_id, starts_at) values ('GEO-CO', 'premium', '2026-01-01');
  for i in 1..25 loop
    insert into profiles (auth_uid, role, name) values (gen_random_uuid(), 'b2c_user', 'geo-E' || i) returning id into u;
    insert into company_affiliations (user_id, company_id, started_at) values (u, 'GEO-CO', '2026-01-01');
    if i <= 15 then
      perform t_session(u, '2026-10-06 15:00:00+00'::timestamptz);
      perform t_session(u, '2026-10-08 15:00:00+00'::timestamptz);
    end if;
  end loop;
end $$;

select refresh_geo_and_collectives();

do $$
declare
  j json;
  card json;
  id_of_a1 uuid;
  failures text := '';
  n int;
  who text;
begin
  -- the snapshot: B3's earlier rows stay in Campinas, the new one is São Paulo
  if (select count(*) from points_ledger pl join profiles p on p.id = pl.user_id
       where p.name = 'geo-B3' and pl.city_ibge_code = '3509502') <> 4
  or (select count(*) from points_ledger pl join profiles p on p.id = pl.user_id
       where p.name = 'geo-B3' and pl.city_ibge_code = '3550308') <> 1 then
    failures := failures || E'\n  moving city rewrote past Points entries';
  end if;
  -- no consent, no city on the entry
  if exists (select 1 from points_ledger pl join profiles p on p.id = pl.user_id where p.name = 'geo-A6' and pl.city_ibge_code is not null) then
    failures := failures || E'\n  an entry carried a city without consent';
  end if;
  -- withdrawn: out of every view, even though the entry carries the city
  if (select active_users from geo_city_month where city_ibge_code = '3550308' and period_month = '2026-10-01') <> 6 then
    failures := failures || format(E'\n  São Paulo October active people = %s, expected 6 (A1-A5 + B3; not A6, not A7)',
      (select active_users from geo_city_month where city_ibge_code = '3550308' and period_month = '2026-10-01'));
  end if;

  -- rankings as A1 sees them
  select auth_uid into id_of_a1 from profiles where name = 'geo-A1';
  perform set_config('request.jwt.claim.sub', id_of_a1::text, true);
  update economy_settings set geo_min_active_users = 3 where id;
  -- October is not "this month" for the clock running the proof, so read
  -- the month directly through the roll-up the function reads.
  select json_agg(ref order by rnk) into j from (
    select ref, rank() over (order by points::numeric / active_users desc, ref) as rnk
      from geo_rollup where scope = 'city' and period_month = '2026-10-01' and active_users >= gam_geo_threshold('city')) x;
  if j::text <> '["3509502", "3550308"]' then
    failures := failures || format(E'\n  October city ranking %s, expected Campinas then São Paulo, Recife absent', j);
  end if;
  j := get_geo_rankings('city', 'all', 5);
  if j::text like '%2611606%' then failures := failures || E'\n  Recife (2 people) appeared in a ranking'; end if;
  if (j->'mine'->>'ref') <> '3550308' or (j->'mine'->>'eligible')::boolean is not true then
    failures := failures || format(E'\n  A1''s own city missing from the all-time ranking: %s', j->'mine');
  end if;
  if j::text ~* 'points' then failures := failures || E'\n  the ranking returned points to the person (PLAN A6)'; end if;
  begin
    perform get_geo_rankings('team', 'month', 5);
    failures := failures || E'\n  a team scope was accepted';
  exception when raise_exception then null;
  end;

  -- the same, as C1 in Recife
  perform set_config('request.jwt.claim.sub', (select auth_uid::text from profiles where name = 'geo-C1'), true);
  j := get_geo_rankings('city', 'all', 5);
  if (j->'mine'->>'eligible')::boolean is not false or (j->'mine'->>'rank') is not null then
    failures := failures || format(E'\n  Recife was ranked for its own person: %s', j->'mine');
  end if;
  card := get_my_city_card();
  if (card->>'eligible')::boolean is not false or (card->>'goalShare') is not null then
    failures := failures || format(E'\n  the Recife card showed city figures below the threshold: %s', card);
  end if;
  perform set_config('request.jwt.claim.sub', '', true);

  -- collective awards
  for who in select unnest(array['geo-A1','geo-A2','geo-A3','geo-A4','geo-B1','geo-B2','geo-B3']) loop
    if not exists (select 1 from user_achievements ua join achievement_definitions d on d.id = ua.achievement_id
                    join profiles p on p.id = ua.user_id where d.slug = 'city_in_loop' and p.name = who) then
      failures := failures || format(E'\n  %s did not get Cidade em Loop', who);
    end if;
  end loop;
  for who in select unnest(array['geo-A5','geo-A6','geo-A7','geo-C1','geo-C2']) loop
    if exists (select 1 from user_achievements ua join achievement_definitions d on d.id = ua.achievement_id
                join profiles p on p.id = ua.user_id where d.kind = 'collective' and p.name = who) then
      failures := failures || format(E'\n  %s got a collective achievement it should not have', who);
    end if;
  end loop;
  select count(*) into n from user_achievements ua join achievement_definitions d on d.id = ua.achievement_id
   join profiles p on p.id = ua.user_id where d.slug = 'calm_capital';
  if n <> 4 or exists (select 1 from user_achievements ua join achievement_definitions d on d.id = ua.achievement_id
                         join profiles p on p.id = ua.user_id where d.slug = 'calm_capital' and p.name not like 'geo-A%') then
    failures := failures || format(E'\n  Capital da calma (September, ended) went to %s people, expected A1-A4', n);
  end if;
  if exists (select 1 from user_achievements ua join achievement_definitions d on d.id = ua.achievement_id where d.slug = 'state_in_tune') then
    failures := failures || E'\n  Estado em sintonia awarded with two cities';
  end if;
  select count(*) into n from user_achievements ua join achievement_definitions d on d.id = ua.achievement_id
   join profiles p on p.id = ua.user_id where d.slug = 'company_in_loop' and p.name like 'geo-E%';
  if n <> 15 then failures := failures || format(E'\n  Empresa em Loop: %s people, expected the 15 who listened', n); end if;

  -- once
  n := (select count(*) from user_achievements);
  perform refresh_geo_and_collectives();
  if (select count(*) from user_achievements) <> n then failures := failures || E'\n  re-evaluating awarded again'; end if;

  if failures <> '' then raise exception 'geo privacy failed:%', failures; end if;
  raise notice 'ok  : threshold, consent, snapshot, rankings, collective awards';
end $$;

-- Below k a company earns nothing collective: 24 people, everyone listens.
do $$
declare
  u uuid;
  i int;
begin
  insert into companies (id, name) values ('GEO-SMALL', 'Small');
  insert into company_addon_subscriptions (company_id, plan_id, starts_at) values ('GEO-SMALL', 'premium', '2026-01-01');
  for i in 1..24 loop
    insert into profiles (auth_uid, role, name) values (gen_random_uuid(), 'b2c_user', 'geo-S' || i) returning id into u;
    insert into company_affiliations (user_id, company_id, started_at) values (u, 'GEO-SMALL', '2026-01-01');
    perform t_session(u, '2026-10-06 15:00:00+00'::timestamptz);
    perform t_session(u, '2026-10-08 15:00:00+00'::timestamptz);
  end loop;
end $$;
select refresh_geo_and_collectives();
do $$ begin
  if exists (select 1 from user_achievements ua join profiles p on p.id = ua.user_id
              join achievement_definitions d on d.id = ua.achievement_id
             where p.name like 'geo-S%' and d.slug = 'company_in_loop') then
    raise exception 'a 24-person company got Empresa em Loop (below k = 25)';
  end if;
  raise notice 'ok  : a company below k earns no collective achievement';
end $$;

update economy_settings set max_backdate_hours = 24, geo_min_active_users = 50 where id;
update achievement_definitions set threshold = 100000 where slug = 'city_in_loop';
drop function t_session(uuid, timestamptz, int, int, boolean);
drop function t_user(text, text, boolean);
