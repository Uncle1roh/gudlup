-- fixtures: src/gamification/__fixtures__/economy.json
-- ============================================================================
-- The Loops economy in the database, on the same fixtures as
-- tools/test-gam-economy.ts. Run by tools/db-gate.mjs on a throwaway database
-- (it writes freely); never run it on Supabase.
--
-- Each case is a REAL session row: inserting it fires sessions_credit →
-- credit_session(), and the proof reads back what the ledgers received.
-- Fails by raising.
-- ============================================================================

do $$
declare
  c        jsonb;
  i        int := 0;
  failures text := '';
  v_user   uuid;
  v_sess   uuid;
  v_co     text;
  v_plan   text;
  v_end    timestamptz;
  got_pts  int;
  got_base int;
  got_co   int;
begin
  for c in select jsonb_array_elements(j->'cases') from fixtures loop
    i := i + 1;

    update economy_settings set
      points_per_minute = 1, points_per_completed_session = 10,
      daily_minutes_cap = 120, daily_completion_bonus_cap = 4,
      loops_per_point = coalesce((c->'settings'->>'loopsPerPoint')::numeric, 0.1),
      count_clinical_sessions = coalesce((c->'settings'->>'countClinicalSessions')::boolean, false),
      max_backdate_hours = null          -- the fixtures are dated in the past on purpose
    where id;

    insert into profiles (role, name) values ('b2c_user', 'parity ' || i) returning id into v_user;

    if jsonb_typeof(c->'company') = 'object' then
      v_co := 'gam-parity-' || i;
      v_plan := 'parity-' || replace((c->'company'->>'multiplier'), '.', '_');
      insert into companies (id, name) values (v_co, v_co);
      insert into addon_plans (id, name, loops_multiplier)
        values (v_plan, v_plan, (c->'company'->>'multiplier')::numeric) on conflict do nothing;
      insert into company_affiliations (user_id, company_id, started_at, ended_at)
        values (v_user, v_co, (c->'company'->>'affiliationStartsAt')::timestamptz, (c->'company'->>'affiliationEndsAt')::timestamptz);
      insert into company_addon_subscriptions (company_id, plan_id, status, starts_at, ends_at)
        values (v_co, v_plan, c->'company'->>'subscriptionStatus',
                (c->'company'->>'subscriptionStartsAt')::timestamptz, (c->'company'->>'subscriptionEndsAt')::timestamptz);
    end if;

    if jsonb_typeof(c->'usage') = 'object' then
      insert into gam_daily_usage (user_id, day, eligible_minutes, completion_bonuses)
      values (v_user, (c->'usage'->>'day')::date, (c->'usage'->>'eligibleMinutes')::int, (c->'usage'->>'completionBonuses')::int);
    end if;

    v_end := (c->'session'->>'endedAt')::timestamptz;
    insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at,
                          listened_sec, completed, is_sos)
    values ((c->'session'->>'kind')::session_kind, v_user, 'PARITY',
            (c->'session'->>'durationMin')::int,
            v_end - make_interval(mins => (c->'session'->>'durationMin')::int), v_end,
            (c->'session'->>'listenedSec')::int,
            (c->'session'->>'completed')::boolean, (c->'session'->>'sos')::boolean)
    returning id into v_sess;

    select coalesce(sum(points), 0) into got_pts from points_ledger where user_id = v_user;
    select coalesce(sum(amount_centi) filter (where entry_type = 'earn_listening'), 0),
           coalesce(sum(amount_centi) filter (where entry_type = 'earn_company_multiplier'), 0)
      into got_base, got_co
      from loops_ledger where user_id = v_user;

    if got_pts  <> (c->'expected'->>'points')::int
    or got_base <> (c->'expected'->>'baseCenti')::int
    or got_co   <> (c->'expected'->>'companyCenti')::int then
      failures := failures || format(E'\n  %s: got %s / %s / %s, expected %s / %s / %s',
        c->>'name', got_pts, got_base, got_co,
        c->'expected'->>'points', c->'expected'->>'baseCenti', c->'expected'->>'companyCenti');
    else
      raise notice 'ok  : %', c->>'name';
    end if;
  end loop;

  if i < 12 then failures := failures || format(E'\n  only %s fixtures (need ≥ 12)', i); end if;
  if failures <> '' then raise exception 'economy parity failed:%', failures; end if;
end $$;

-- ---- what the fixtures cannot show -------------------------------------------
do $$
declare
  v_user uuid;
  v_sess uuid;
  n_before int;
  n_after  int;
  ok boolean;
begin
  update economy_settings set loops_per_point = 0.1, count_clinical_sessions = false, max_backdate_hours = 24 where id;
  insert into profiles (role, name) values ('b2c_user', 'rules') returning id into v_user;

  -- Idempotent: crediting again, or touching the row, adds nothing.
  insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed)
  values ('b2c', v_user, 'RULES', 12, now() - interval '13 minutes', now() - interval '1 minute', 720, true)
  returning id into v_sess;
  select count(*) into n_before from loops_ledger where user_id = v_user;
  perform credit_session(v_sess);
  perform credit_session(v_sess, true);
  update sessions set listened_sec = 700 where id = v_sess;
  select count(*) into n_after from loops_ledger where user_id = v_user;
  if n_before <> 1 or n_after <> 1 then raise exception 'credit is not idempotent (% then % entries)', n_before, n_after; end if;

  -- Append-only.
  begin
    update loops_ledger set amount_centi = 999999 where user_id = v_user;
    raise exception 'loops_ledger accepted an UPDATE';
  exception when raise_exception then
    if sqlerrm like '%accepted an UPDATE%' then raise; end if;
  end;
  begin
    update points_ledger set points = 0 where user_id = v_user;
    raise exception 'points_ledger accepted an UPDATE';
  exception when raise_exception then
    if sqlerrm like '%accepted an UPDATE%' then raise; end if;
  end;

  -- A row dated weeks ago is credited as of today, so old days' caps cannot
  -- be mined: with today's minutes already spent it earns only the bonus.
  insert into gam_daily_usage (user_id, day, eligible_minutes, completion_bonuses)
  values (v_user, gam_sp_day(now()), 120, 0)
  on conflict (user_id, day) do update set eligible_minutes = 120;
  insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed)
  values ('b2c', v_user, 'RULES', 24, now() - interval '30 days', now() - interval '30 days' + interval '24 minutes', 1440, true)
  returning id into v_sess;
  select points = 10 into ok from points_ledger where source_id = v_sess::text;
  if not ok then raise exception 'a backdated session was credited against its own (empty) day'; end if;

  -- A future ended_at is credited as of now, not in a future month.
  insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed)
  values ('b2c', v_user, 'RULES', 6, now(), now() + interval '90 days', 360, true)
  returning id into v_sess;
  select period_month = date_trunc('month', gam_sp_day(now()))::date into ok from points_ledger where source_id = v_sess::text;
  if not ok then raise exception 'a future-dated session landed in a future month'; end if;

  -- Affiliation history follows profiles.company_id.
  insert into companies (id, name) values ('gam-aff-a', 'A'), ('gam-aff-b', 'B');
  update profiles set company_id = 'gam-aff-a' where id = v_user;
  update profiles set company_id = 'gam-aff-b' where id = v_user;
  update profiles set company_id = null where id = v_user;
  if (select count(*) from company_affiliations where user_id = v_user) <> 2
  or exists (select 1 from company_affiliations where user_id = v_user and ended_at is null) then
    raise exception 'affiliation history did not follow company_id';
  end if;

  -- The SPN-02 floor cannot be lowered.
  begin
    update economy_settings set hr_min_cohort = 10 where id;
    raise exception 'hr_min_cohort accepted 10';
  exception when check_violation then null;
  end;

  -- The right to disappear takes the ledgers with the person.
  delete from sessions where b2c_profile_id = v_user;
  delete from profiles where id = v_user;
  if exists (select 1 from loops_ledger where user_id = v_user)
  or exists (select 1 from points_ledger where user_id = v_user)
  or exists (select 1 from gam_daily_usage where user_id = v_user)
  or exists (select 1 from company_affiliations where user_id = v_user) then
    raise exception 'deleting the profile left gamification rows behind';
  end if;

  raise notice 'ok  : idempotent, append-only, backdating bounded, affiliation history, SPN-02 floor, deletion cascades';
end $$;

-- ---- the wallet as a signed-in person reads it --------------------------------
do $$
declare
  v_auth uuid := gen_random_uuid();
  v_user uuid;
  w json;
begin
  insert into profiles (auth_uid, role, name) values (v_auth, 'b2c_user', 'wallet') returning id into v_user;
  insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed)
  values ('b2c', v_user, 'W', 12, now() - interval '13 minutes', now() - interval '1 minute', 720, true);
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  w := get_wallet();
  if (w->>'balance_centi')::int <> 220 or (w->>'points_month')::int <> 22
  or (w->>'minutes_month')::int <> 12 or (w->>'sessions_month')::int <> 1
  or (w->>'multiplier') is not null then
    raise exception 'get_wallet() returned %', w;
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'ok  : get_wallet() for the signed-in person';
end $$;
