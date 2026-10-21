-- ============================================================================
-- The Progress tabs' reads: the person's own part in every collective
-- achievement (in minutes, never points), no unit figure below its
-- threshold, and a challenge history. Own copy of a fresh database.
-- ============================================================================

update economy_settings set max_backdate_hours = null where id;

do $$
declare
  u uuid;
  i int;
  old_ch uuid := '00000000-0000-0000-0000-0000000000d1';
begin
  insert into profiles (auth_uid, role, name, city_ibge_code) values
    ('00000000-0000-0000-0000-0000000000b1', 'b2c_user', 'pr-ana', '2611606') returning id into u;
  insert into consent_events (profile_id, purpose, granted, wording, locale, at) values (u, 'geo_ranking', true, 't', 'pt-BR', now() - interval '90 days');
  -- an old challenge she took part in, long ended
  insert into challenges (id, title, format, scope, metric, goal_value, starts_at, ends_at, status, reward_bonus_loops_centi)
  values (old_ch, 'Velho desafio', 'individual', 'national', 'sessions_completed', 1, now() - interval '80 days', now() - interval '60 days', 'active', 100);
  insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed)
  values ('b2c', u, 'PR', 24, now() - interval '70 days' - interval '24 minutes', now() - interval '70 days', 1440, true);
  for i in 1..3 loop
    insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed)
    values ('b2c', u, 'PR', 12, now() - make_interval(hours => i * 5) - interval '12 minutes', now() - make_interval(hours => i * 5), 720, true);
  end loop;
end $$;

select settle_challenges();
select refresh_geo_and_collectives();

do $$
declare
  failures text := '';
  j json;
  row json;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  j := get_my_collective_progress();
  if json_array_length(j) <> (select count(*) from achievement_definitions where active and kind = 'collective') then
    failures := failures || E'\n  not one row per collective achievement';
  end if;
  row := (select e from json_array_elements(j) e where e->>'slug' = 'city_in_loop');
  if (row->>'myMinutes')::int < 36 then failures := failures || format(E'\n  her month part should count her 36+ minutes: %s', row); end if;
  if row->>'unitShare' is not null then failures := failures || E'\n  Recife (one person) showed a city figure below the threshold'; end if;
  if (row->>'canTakePart')::boolean is not true then failures := failures || E'\n  a consented person with a city can take part'; end if;
  if j::text ~* 'points' then failures := failures || E'\n  points reached the person (PLAN A6)'; end if;
  if ((select e from json_array_elements(j) e where e->>'slug' = 'brazil_in_loop')->>'myMinutes')::int < 60 then
    failures := failures || E'\n  the national (lifetime) part should include her older session';
  end if;
  if ((get_my_ranking_part())->>'lifetimeMinutes')::int < 60 then failures := failures || E'\n  ranking part: lifetime minutes'; end if;
  j := get_my_challenges();
  if j::text not like '%Velho desafio%' then failures := failures || E'\n  the history lost a challenge she took part in 60 days ago'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  if failures <> '' then raise exception 'progress reads failed:%', failures; end if;
  raise notice 'ok  : her part in minutes, nothing below threshold, history kept';
end $$;

update economy_settings set max_backdate_hours = 24 where id;
