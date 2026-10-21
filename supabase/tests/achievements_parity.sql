-- fixtures: src/gamification/__fixtures__/achievements.json
-- ============================================================================
-- Achievements in the database, on the same fixtures as
-- tools/test-gam-achievements.ts. Run by tools/db-gate.mjs on a throwaway
-- database; never on Supabase.
--
-- Three statements, three transactions, because evaluation is a DEFERRED
-- trigger: it runs when the credit commits. The first statement writes every
-- scenario's sessions and pathways and commits; the second checks what the
-- triggers unlocked and paid; the third proves the bonus is paid once.
-- ============================================================================

update economy_settings set max_backdate_hours = null, loops_per_point = 0.1, count_clinical_sessions = false where id;

do $$
declare
  sc jsonb;
  s  jsonb;
  p  text;
  i  int := 0;
  v_user uuid;
begin
  for sc in select jsonb_array_elements(j->'scenarios') from fixtures loop
    i := i + 1;
    insert into profiles (role, name) values ('b2c_user', 'ach-parity-' || i) returning id into v_user;
    for s in select jsonb_array_elements(sc->'sessions') loop
      insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at,
                            listened_sec, completed, is_sos, stereo_checked)
      values ('b2c', v_user, 'ACH', (s->>'durationMin')::int,
              (s->>'startedAt')::timestamptz,
              (s->>'startedAt')::timestamptz + make_interval(mins => (s->>'durationMin')::int),
              (s->>'listenedSec')::int, (s->>'completed')::boolean, (s->>'sos')::boolean,
              (s->>'stereoChecked')::boolean);
    end loop;
    for p in select jsonb_array_elements_text(sc->'pathways') loop
      insert into pathway_completions (user_id, pathway_slug) values (v_user, p);
    end loop;
  end loop;
end $$;

do $$
declare
  sc jsonb;
  k  text;
  i  int := 0;
  v_user uuid;
  m jsonb;
  got text;
  want text;
  bonus int;
  failures text := '';
begin
  for sc in select jsonb_array_elements(j->'scenarios') from fixtures loop
    i := i + 1;
    select id into v_user from profiles where name = 'ach-parity-' || i;
    m := gam_user_metrics(v_user);

    select coalesce(string_agg(d.slug, ',' order by d.sort_order), '') into got
      from user_achievements ua join achievement_definitions d on d.id = ua.achievement_id
     where ua.user_id = v_user;
    select coalesce(string_agg(x, ',' order by o), '') into want
      from jsonb_array_elements_text(sc->'expected'->'unlocked') with ordinality as t(x, o);
    if got <> want then
      failures := failures || format(E'\n  %s: unlocked [%s], expected [%s]', sc->>'name', got, want);
    end if;

    for k in select jsonb_object_keys(sc->'expected'->'metrics') loop
      if (m->>k)::numeric <> (sc->'expected'->'metrics'->>k)::numeric then
        failures := failures || format(E'\n  %s: %s = %s, expected %s', sc->>'name', k, m->>k, sc->'expected'->'metrics'->>k);
      end if;
    end loop;

    select coalesce(sum(amount_centi), 0) into bonus from loops_ledger where user_id = v_user and entry_type = 'achievement_bonus';
    if bonus <> (sc->'expected'->>'bonusCenti')::int then
      failures := failures || format(E'\n  %s: bonus %s, expected %s', sc->>'name', bonus, sc->'expected'->>'bonusCenti');
    end if;
    if exists (select 1 from loops_ledger where user_id = v_user and entry_type = 'achievement_bonus'
                and (funding_source <> 'goodloop' or multiplier_applied is not null)) then
      failures := failures || format(E'\n  %s: a bonus was company-funded or multiplied', sc->>'name');
    end if;

    if failures = '' then raise notice 'ok  : %', sc->>'name'; end if;
  end loop;
  if failures <> '' then raise exception 'achievements parity failed:%', failures; end if;
end $$;

-- Once, whatever re-runs it; and the admin re-evaluation adds nothing new.
do $$
declare
  v_user uuid;
  before_n int;
  after_n int;
begin
  select id into v_user from profiles where name = 'ach-parity-2';
  select count(*) into before_n from loops_ledger where user_id = v_user;
  perform evaluate_achievements(v_user);
  perform evaluate_achievements(v_user);
  select count(*) into after_n from loops_ledger where user_id = v_user;
  if before_n <> after_n then raise exception 'evaluate_achievements paid again (% → % entries)', before_n, after_n; end if;

  -- GAM-R4 in the schema: there is no team/area value to put anywhere.
  begin
    insert into achievement_definitions (slug, kind, scope, metric, threshold, tier, icon)
    values ('team_x', 'collective', 'team', 'city_month_points', 1, 'coletiva', 'pin');
    raise exception 'a team-scoped achievement was accepted';
  exception when invalid_text_representation then null;
  end;
  -- GAM-R2 in the schema: a metric on assessment results is refused.
  begin
    insert into achievement_definitions (slug, kind, scope, metric, threshold, tier, icon)
    values ('calm_score', 'individual', 'user', 'dass21_improvement', 1, 'broto', 'spark');
    raise exception 'a score-based metric was accepted';
  exception when check_violation then null;
  end;
  raise notice 'ok  : bonuses paid once; team scopes and score metrics refused by the schema';
end $$;

update economy_settings set max_backdate_hours = 24 where id;
