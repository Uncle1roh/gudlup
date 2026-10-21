-- ============================================================================
-- Challenges against the real tables, triggers and functions. Run by
-- tools/db-gate.mjs on a throwaway database; never on Supabase.
--
-- Progress is counted by the DEFERRED credit trigger, so each scenario is
-- written in one statement and checked in the next.
-- ============================================================================

update economy_settings set max_backdate_hours = null, min_contribution_points = 30 where id;

create or replace function ch_user(p_name text, p_city text default null, p_consent boolean default false, p_company text default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into profiles (auth_uid, role, name, city_ibge_code, company_id) values (gen_random_uuid(), 'b2c_user', p_name, p_city, p_company) returning id into v;
  if p_company is not null then update company_affiliations set started_at = now() - interval '60 days' where user_id = v; end if;
  if p_consent then
    insert into consent_events (profile_id, purpose, granted, wording, locale, at) values (v, 'geo_ranking', true, 't', 'pt-BR', now() - interval '60 days');
  end if;
  return v;
end $$;
create or replace function ch_session(p_user uuid, p_end timestamptz, p_min int default 24, p_completed boolean default true, p_sos boolean default false) returns void language sql as $$
  insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed, is_sos)
  values ('b2c', p_user, 'CH', p_min, p_end - make_interval(mins => p_min), p_end, p_min * 60, p_completed, p_sos)
$$;
create or replace function ch_hint(p_sql text) returns text language plpgsql as $$
declare h text; st text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics h = pg_exception_hint, st = returned_sqlstate;
  return coalesce(nullif(h, ''), st);
end $$;

-- ---- the schema refuses what the SPEC forbids ---------------------------------
do $$
declare
  failures text := '';
  r text;
  base text := $b$ (title, format, scope, scope_ref, metric, goal_value, per_person_min, starts_at, ends_at, reward_bonus_loops_centi, company_id) values ('x', $b$;
begin
  r := ch_hint($q$ insert into challenges (title, format, scope, metric, goal_value, starts_at, ends_at, reward_bonus_loops_centi)
               values ('team', 'collective', 'team', 'sessions_completed', 1, now(), now() + interval '1 day', 100) $q$);
  if r <> '22P02' then failures := failures || format(E'\n  a team scope: %s', r); end if;
  r := ch_hint($q$ insert into challenges (title, format, scope, metric, goal_value, starts_at, ends_at, reward_bonus_loops_centi)
               values ('user', 'individual', 'user', 'sessions_completed', 1, now(), now() + interval '1 day', 100) $q$);
  if r not in ('23514', 'CHALLENGE_SCOPE') then failures := failures || format(E'\n  scope user: %s', r); end if;
  r := ch_hint($q$ insert into challenges (title, format, scope, metric, goal_value, starts_at, ends_at, reward_bonus_loops_centi)
               values ('dass', 'individual', 'national', 'dass21_improvement', 1, now(), now() + interval '1 day', 100) $q$);
  if r <> '22P02' then failures := failures || format(E'\n  a score metric: %s', r); end if;
  r := ch_hint($q$ insert into challenges (title, format, scope, metric, goal_value, starts_at, ends_at, reward_bonus_loops_centi)
               values ('streak', 'individual', 'national', 'consecutive_days', 7, now(), now() + interval '1 day', 100) $q$);
  if r <> '22P02' then failures := failures || format(E'\n  a streak metric: %s', r); end if;
  r := ch_hint($q$ insert into challenges (title, format, scope, metric, goal_value, starts_at, ends_at, reward_bonus_loops_centi)
               values ('co', 'collective', 'company', 'sessions_completed', 1, now(), now() + interval '1 day', 100) $q$);
  if r not in ('23514', 'CHALLENGE_SCOPE') then failures := failures || format(E'\n  company scope with no company: %s', r); end if;
  r := ch_hint($q$ insert into challenges (title, format, scope, metric, goal_value, starts_at, ends_at, reward_bonus_loops_centi)
               values ('nomin', 'collective', 'national', 'sessions_completed', 10, now(), now() + interval '1 day', 100) $q$);
  if r <> '23514' then failures := failures || format(E'\n  collective without a per-person minimum: %s', r); end if;
  r := ch_hint($q$ insert into challenges (title, format, scope, metric, goal_value, starts_at, ends_at, reward_bonus_loops_centi)
               values ('win', 'individual', 'national', 'sessions_in_time_window', 3, now(), now() + interval '1 day', 100) $q$);
  if r <> '23514' then failures := failures || format(E'\n  a time window without hours: %s', r); end if;
  r := ch_hint($q$ insert into challenges (title, format, scope, scope_ref, metric, goal_value, per_person_min, starts_at, ends_at, reward_bonus_loops_centi)
               values ('city', 'collective', 'city', '0000000', 'sessions_completed', 3, 1, now(), now() + interval '1 day', 100) $q$);
  if r <> 'CHALLENGE_SCOPE' then failures := failures || format(E'\n  an unknown city: %s', r); end if;
  if failures <> '' then raise exception 'schema rules failed:%', failures; end if;
  raise notice 'ok  : no team scope, no score or streak metric, whole company only, scope references checked';
end $$;

-- ---- scenario: Outubro Sereno — individual, national, 5 h, an exclusive prize for one ---
do $$
declare
  ana uuid; bia uuid; caio uuid;
  ch uuid := '00000000-0000-0000-0000-0000000000c1';
  ben uuid := '00000000-0000-0000-0000-0000000000b1';
begin
  insert into benefits (id, title, pillar, price_loops_centi, delivery_type, static_code, status, stock_total, stock_remaining)
  values (ben, '90% creme facial', 'corpo', null, 'static_code', 'CREME90', 'draft', 1, 1);
  insert into benefit_tag_map (benefit_id, tag_id) select ben, id from benefit_tags where slug = 'desconto';
  insert into challenges (id, title, format, scope, metric, goal_value, starts_at, ends_at, status, reward_bonus_loops_centi, reward_benefit_id)
  values (ch, 'Outubro Sereno', 'individual', 'national', 'minutes_listened', 300, now() - interval '10 days', now() + interval '10 days', 'active', 9000, ben);
  update benefits set challenge_exclusive_id = ch, status = 'active' where id = ben;

  ana := ch_user('ch-ana'); bia := ch_user('ch-bia'); caio := ch_user('ch-caio');
  -- Ana: 13 Deep sessions = 312 minutes, inside the window → completes first
  for i in 1..13 loop perform ch_session(ana, now() - make_interval(days => 9) + make_interval(hours => i * 3)); end loop;
  -- Bia: 13 too, a day later → completes second
  for i in 1..13 loop perform ch_session(bia, now() - make_interval(days => 5) + make_interval(hours => i * 3)); end loop;
  -- Caio: 12 inside, plus one BEFORE the window and one SOS → not complete
  for i in 1..12 loop perform ch_session(caio, now() - make_interval(days => 8) + make_interval(hours => i * 3)); end loop;
  perform ch_session(caio, now() - interval '20 days');
  perform ch_session(caio, now() - interval '1 day', 24, true, true);
end $$;

do $$
declare
  failures text := '';
  ch uuid := '00000000-0000-0000-0000-0000000000c1';
  ben uuid := '00000000-0000-0000-0000-0000000000b1';
  p record;
  j json;
begin
  for p in select pr.name, cp.* from challenge_participation cp join profiles pr on pr.id = cp.user_id where cp.challenge_id = ch order by pr.name loop
    raise notice '      % progress=% completed=% rewarded=% granted=%', p.name, p.progress_value, p.completed_at is not null, p.rewarded_at is not null, p.benefit_granted_at is not null;
  end loop;
  if (select progress_value from challenge_participation cp join profiles pr on pr.id = cp.user_id where cp.challenge_id = ch and pr.name = 'ch-caio') <> 288 then
    failures := failures || E'\n  Caio: a session outside the window or an SOS session counted';
  end if;
  if (select count(*) from challenge_participation where challenge_id = ch and completed_at is not null) <> 2 then
    failures := failures || E'\n  expected Ana and Bia to complete';
  end if;
  if (select count(*) from loops_ledger where entry_type = 'challenge_bonus' and source_id = ch::text and amount_centi = 9000 and funding_source = 'goodloop' and multiplier_applied is null) <> 2 then
    failures := failures || E'\n  the 90-Loop bonus was not paid exactly once each, by Good Loop, unmultiplied';
  end if;
  if (select pr.name from challenge_participation cp join profiles pr on pr.id = cp.user_id where cp.challenge_id = ch and cp.benefit_granted_at is not null) is distinct from 'ch-ana' then
    failures := failures || E'\n  first to complete: the one prize should be Ana''s';
  end if;
  if not exists (select 1 from user_achievements ua join achievement_definitions d on d.id = ua.achievement_id join profiles pr on pr.id = ua.user_id
                  where d.slug = 'first_challenge' and pr.name = 'ch-ana') then
    failures := failures || E'\n  Primeiro desafio did not unlock in the same commit';
  end if;
  -- the prize: Ana may redeem it, Bia may not
  perform set_config('request.jwt.claim.sub', (select auth_uid::text from profiles where name = 'ch-ana'), false);
  j := redeem_benefit(ben);
  if j->>'code' <> 'CREME90' then failures := failures || E'\n  Ana could not redeem her prize'; end if;
  j := get_my_challenges();
  if j::text not like '%Outubro Sereno%' or j::text ~* '"(name|email|userId|user_id)"' then
    failures := failures || E'\n  get_my_challenges: missing, or carried someone''s identity';
  end if;
  perform set_config('request.jwt.claim.sub', (select auth_uid::text from profiles where name = 'ch-bia'), false);
  if ch_hint(format('select redeem_benefit(%L)', ben)) <> 'BENEFIT_UNAVAILABLE' then failures := failures || E'\n  Bia redeemed a prize she did not win'; end if;
  perform set_config('request.jwt.claim.sub', '', false);
  if failures <> '' then raise exception 'Outubro Sereno failed:%', failures; end if;
  raise notice 'ok  : window, SOS, reward at once, bonus once, first-to-complete prize, Primeiro desafio';
end $$;

-- ---- scenario: a city collective, and a raffle at settlement -------------------
do $$
declare
  u uuid;
  i int;
  city uuid := '00000000-0000-0000-0000-0000000000c2';
  raffle uuid := '00000000-0000-0000-0000-0000000000c3';
  ben uuid := '00000000-0000-0000-0000-0000000000b2';
begin
  insert into challenges (id, title, format, scope, scope_ref, metric, goal_value, per_person_min, starts_at, ends_at, status, reward_bonus_loops_centi)
  values (city, 'Recife em Loop', 'collective', 'city', '2611606', 'sessions_completed', 4, 1, now() - interval '10 days', now() + interval '10 days', 'active', 3000);
  insert into benefits (id, title, pillar, price_loops_centi, delivery_type, static_code, status, stock_total, stock_remaining)
  values (ben, 'Raffled', 'sono', null, 'static_code', 'R1', 'draft', 1, 1);
  insert into benefit_tag_map (benefit_id, tag_id) select ben, id from benefit_tags where slug = 'gratuidade';
  insert into challenges (id, title, format, scope, metric, goal_value, starts_at, ends_at, status, reward_bonus_loops_centi, reward_benefit_id, reward_rule_when_out_of_stock)
  values (raffle, 'Semana do Sono', 'individual', 'national', 'sessions_completed', 1, now() - interval '10 days', now() - interval '1 hour', 'active', 500, ben, 'raffle');
  update benefits set challenge_exclusive_id = raffle, status = 'active' where id = ben;

  for i in 1..4 loop
    u := ch_user('ch-rec' || i, '2611606', i <> 4);           -- rec4 never consented: does not count
    perform ch_session(u, now() - interval '3 days' + make_interval(hours => i));
  end loop;
  u := ch_user('ch-rec5', '2611606', true);
  perform ch_session(u, now() - interval '2 days');
  u := ch_user('ch-sp', '3550308', true);                     -- another city: does not count
  perform ch_session(u, now() - interval '2 days');
end $$;

select settle_challenges();
select settle_challenges();

do $$
declare
  failures text := '';
  city uuid := '00000000-0000-0000-0000-0000000000c2';
  raffle uuid := '00000000-0000-0000-0000-0000000000c3';
  c challenges%rowtype;
begin
  select * into c from challenges where id = city;
  if gam_collective_value(c) <> 4 or c.goal_reached_at is null then
    failures := failures || format(E'\n  Recife: %s sessions counted, expected 4 (rec1-3, rec5; not rec4, not São Paulo)', gam_collective_value(c));
  end if;
  if (select count(*) from challenge_participation where challenge_id = city and rewarded_at is not null) <> 4 then
    failures := failures || E'\n  Recife: everyone who gave their part should be rewarded at goal';
  end if;
  if (select status from challenges where id = city) <> 'active' then failures := failures || E'\n  a live challenge was settled early'; end if;
  select * into c from challenges where id = raffle;
  if c.status <> 'settled' then failures := failures || format(E'\n  the ended challenge is %s, not settled', c.status); end if;
  if (select count(*) from challenge_raffle_draws where challenge_id = raffle) < 2 then
    failures := failures || E'\n  the raffle drew no one';
  end if;
  if (select count(*) from challenge_participation where challenge_id = raffle and benefit_granted_at is not null) <> 1
  or (select count(*) from challenge_raffle_draws where challenge_id = raffle and won) <> 1 then
    failures := failures || E'\n  one unit, one winner — settled twice, still one';
  end if;
  if failures <> '' then raise exception 'collective / raffle failed:%', failures; end if;
  raise notice 'ok  : city collective counts consented people in the city only; raffle once, one winner, settled once';
end $$;

-- ---- scenario: Novembro em Loop — 60 % of the whole company with 3+ sessions ---------
do $$
declare
  u uuid;
  i int;
  ch uuid := '00000000-0000-0000-0000-0000000000c4';
begin
  insert into companies (id, name) values ('CH-AURORA', 'Aurora');
  insert into company_addon_subscriptions (company_id, plan_id, starts_at) values ('CH-AURORA', 'premium', now() - interval '90 days');
  insert into challenges (id, company_id, title, format, scope, scope_ref, metric, goal_value, goal_kind, per_person_min, starts_at, ends_at, status, reward_bonus_loops_centi)
  values (ch, 'CH-AURORA', 'Novembro em Loop', 'collective', 'company', 'CH-AURORA', 'sessions_completed', 60, 'share_reaching_min', 3,
          now() - interval '10 days', now() + interval '10 days', 'active', 2000);
  for i in 1..25 loop
    u := ch_user('ch-emp' || i, null, false, 'CH-AURORA');
    if i <= 15 then
      perform ch_session(u, now() - interval '6 days');
      perform ch_session(u, now() - interval '5 days');
      perform ch_session(u, now() - interval '4 days');
    elsif i <= 18 then
      perform ch_session(u, now() - interval '4 days');         -- took part, below the minimum
    end if;
  end loop;
end $$;

do $$
declare
  failures text := '';
  ch uuid := '00000000-0000-0000-0000-0000000000c4';
  c challenges%rowtype;
begin
  select * into c from challenges where id = ch;
  if gam_collective_value(c) <> 60 or c.goal_reached_at is null then
    failures := failures || format(E'\n  share = %s %%, expected 60 and the goal reached', gam_collective_value(c));
  end if;
  if (select count(*) from challenge_participation where challenge_id = ch and rewarded_at is not null) <> 15 then
    failures := failures || E'\n  only the 15 who reached 3 sessions are rewarded';
  end if;
  if exists (select 1 from loops_ledger where entry_type = 'challenge_bonus' and source_id = ch::text
              and (funding_source <> 'company' or company_id <> 'CH-AURORA' or multiplier_applied is not null)) then
    failures := failures || E'\n  a company challenge bonus must be company-funded and never multiplied';
  end if;
  if (select count(*) from user_achievements ua join achievement_definitions d on d.id = ua.achievement_id where d.slug = 'company_in_tune') <> 18 then
    failures := failures || E'\n  Empresa em sintonia should reach everyone who contributed 30+ points: the 15, and the 3 with one session (§3.3)';
  end if;
  if failures <> '' then raise exception 'company challenge failed:%', failures; end if;
  raise notice 'ok  : whole-company share goal, company-funded bonus, Empresa em sintonia';
end $$;

update economy_settings set max_backdate_hours = 24 where id;
drop function ch_user(text, text, boolean, text);
drop function ch_session(uuid, timestamptz, int, boolean, boolean);
drop function ch_hint(text);
