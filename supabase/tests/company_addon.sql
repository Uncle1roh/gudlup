-- ============================================================================
-- The company add-on, against the real functions: who may call them, what
-- HR can and cannot see, the tag filter, company benefits and the
-- identified consent, template-only challenges, the k-guarded dashboard.
-- Run by tools/db-gate.mjs on its own copy of a fresh database.
-- ============================================================================

update economy_settings set max_backdate_hours = null where id;

create or replace function co_as(p_name text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce((select auth_uid::text from profiles where name = p_name), ''), false)
$$;
create or replace function co_hint(p_sql text) returns text language plpgsql as $$
declare h text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return coalesce(nullif(h, ''), sqlerrm);
end $$;

do $$
declare
  u uuid;
  i int;
begin
  insert into companies (id, name) values ('CO-AURORA', 'Aurora Alimentos'), ('CO-PLAIN', 'Sem add-on');
  insert into company_addon_subscriptions (company_id, plan_id, starts_at) values ('CO-AURORA', 'premium', now() - interval '90 days');
  insert into profiles (auth_uid, role, name, company_id) values (gen_random_uuid(), 'hr_admin', 'co-hr', 'CO-AURORA');
  insert into profiles (auth_uid, role, name, company_id) values (gen_random_uuid(), 'hr_admin', 'co-hr-plain', 'CO-PLAIN');
  for i in 1..60 loop
    insert into profiles (auth_uid, role, name, company_id) values (gen_random_uuid(), 'b2c_user', 'co-emp' || i, 'CO-AURORA');
  end loop;
  update company_affiliations set started_at = now() - interval '60 days' where company_id = 'CO-AURORA';
  insert into profiles (auth_uid, role, name) values (gen_random_uuid(), 'b2c_user', 'co-outsider');
  insert into benefits (id, title, pillar, price_loops_centi, delivery_type, static_code, status)
  values ('00000000-0000-0000-0000-0000000000f1', 'Cesta de frutas', 'alimentacao', 0, 'static_code', 'FRUTA', 'active');
  insert into benefit_tag_map (benefit_id, tag_id) select '00000000-0000-0000-0000-0000000000f1', id from benefit_tags where slug = 'alimentos_bebidas';
end $$;

-- ---- who may call ---------------------------------------------------------------
do $$
declare failures text := ''; r text;
begin
  perform co_as('co-emp1');
  r := co_hint('select hr_list_tag_filter()');
  if r <> 'HR_ONLY' then failures := failures || format(E'\n  an employee reached HR functions (%s)', r); end if;
  perform co_as('co-hr-plain');
  if hr_get_addon() is not null then failures := failures || E'\n  a company with no add-on has a plan'; end if;
  r := co_hint('select hr_addon_dashboard()');
  if r <> 'ADDON_NONE' then failures := failures || format(E'\n  the add-on dashboard opened without the add-on (%s)', r); end if;
  perform co_as('co-hr');
  if (hr_get_addon()->>'multiplier')::numeric <> 1.5 then failures := failures || E'\n  Aurora''s plan is not Premium 1.5x'; end if;
  perform co_as('');
  if failures <> '' then raise exception 'access failed:%', failures; end if;
  raise notice 'ok  : HR of the company only, and only with the add-on';
end $$;

-- ---- a) the tag filter ------------------------------------------------------------------
do $$
declare
  failures text := '';
  food uuid := (select id from benefit_tags where slug = 'alimentos_bebidas');
  j json;
begin
  perform co_as('co-hr');
  j := hr_list_tag_filter();
  if not exists (select 1 from json_array_elements(j) e where e->>'slug' = 'alimentos_bebidas' and (e->>'affects')::int = 1) then
    failures := failures || E'\n  the filter did not say "afeta 1 benefício"';
  end if;
  perform hr_set_tag_disabled(food, true);
  perform hr_set_tag_disabled(food, true);
  perform co_as('co-emp1');
  if get_available_benefits()::text like '%Cesta de frutas%' then failures := failures || E'\n  a disabled tag still reached Aurora''s people'; end if;
  perform co_as('co-outsider');
  if get_available_benefits()::text not like '%Cesta de frutas%' then failures := failures || E'\n  the filter leaked beyond Aurora'; end if;
  -- redeemed before the switch? still visible: an employee redeems, then HR switches it off again
  perform co_as('co-hr');
  perform hr_set_tag_disabled(food, false);
  perform co_as('co-emp2');
  perform redeem_benefit('00000000-0000-0000-0000-0000000000f1');
  perform co_as('co-hr');
  perform hr_set_tag_disabled(food, true);
  perform co_as('co-emp2');
  if list_my_redemptions()::text not like '%FRUTA%' then failures := failures || E'\n  a redeemed code disappeared when the tag was switched off'; end if;
  perform co_as('co-hr');
  if json_array_length(hr_tag_filter_history()) <> 2 then failures := failures || E'\n  the history is not one row per switch-off'; end if;
  perform co_as('');
  if failures <> '' then raise exception 'tag filter failed:%', failures; end if;
  raise notice 'ok  : the filter hides, server-side, for this company only; redeemed codes stay; history kept';
end $$;

-- ---- b) company benefits, and the identified consent ---------------------------------------
do $$
declare
  failures text := '';
  idb uuid;
  codeb uuid;
  r text;
  j json;
begin
  perform co_as('co-hr');
  r := co_hint($q$ select hr_save_company_benefit('{"title":"Static","pillar":"sono","priceLoopsCenti":0,"deliveryType":"static_code","status":"active"}'::jsonb) $q$);
  if r <> 'BENEFIT_DELIVERY' then failures := failures || format(E'\n  HR created a delivery mode outside the three (%s)', r); end if;
  idb := hr_save_company_benefit('{"title":"Um dia de folga","pillar":"pausas_lazer","priceLoopsCenti":0,"deliveryType":"identified","status":"active","stockTotal":5}'::jsonb);
  codeb := hr_save_company_benefit('{"title":"Vale academia","pillar":"movimento","priceLoopsCenti":0,"deliveryType":"code_pool","status":"active"}'::jsonb);
  if hr_upload_codes(codeb, array['GYM-1', 'GYM-2', 'GYM-1']) <> 2 then failures := failures || E'\n  HR code upload miscounted'; end if;

  perform co_as('co-emp3');
  if get_available_benefits()::text not like '%Um dia de folga%' then failures := failures || E'\n  the company benefit is missing for its employee'; end if;
  r := co_hint(format('select redeem_benefit(%L, true)', idb));
  if r <> 'BENEFIT_NEEDS_CONSENT' then failures := failures || format(E'\n  identified without an employee number (%s)', r); end if;
  r := co_hint(format('select redeem_benefit(%L, false, %L)', idb, 'M-1234'));
  if r <> 'BENEFIT_NEEDS_CONSENT' then failures := failures || format(E'\n  identified without consent (%s)', r); end if;
  perform redeem_benefit(idb, true, 'M-1234');
  perform redeem_benefit(codeb);
  perform co_as('co-outsider');
  if co_hint(format('select redeem_benefit(%L, true, %L)', idb, 'X')) <> 'BENEFIT_UNAVAILABLE' then failures := failures || E'\n  an outsider redeemed a company benefit'; end if;

  perform co_as('co-hr');
  j := hr_identified_redemptions();
  if json_array_length(j) <> 1 or (j->0->>'name') <> 'co-emp3' or (j->0->>'employeeNumber') <> 'M-1234' then
    failures := failures || format(E'\n  HR should see exactly the one consented redemption: %s', j);
  end if;
  if hr_list_company_benefits()::text ~* 'co-emp|user_?id|"name"' then failures := failures || E'\n  the company benefit list carried who redeemed'; end if;
  perform co_as('co-hr-plain');
  if co_hint('select hr_identified_redemptions()') <> 'ADDON_NONE' then failures := failures || E'\n  another company read Aurora''s redemptions'; end if;
  perform co_as('');
  if failures <> '' then raise exception 'company benefits failed:%', failures; end if;
  raise notice 'ok  : three delivery modes; codes anonymous; identified only with consent and a number; HR sees only those';
end $$;

-- ---- c) company challenges, from templates only --------------------------------------
do $$
declare
  failures text := '';
  ch uuid;
  r text;
begin
  perform co_as('co-hr');
  r := co_hint($q$ select hr_save_company_challenge(jsonb_build_object('startsAt', now(), 'endsAt', now() + interval '20 days', 'rewardBonusLoopsCenti', 1000)) $q$);
  if r <> 'CHALLENGE_TEMPLATE' then failures := failures || format(E'\n  a company challenge without a template (%s)', r); end if;
  r := co_hint(format($q$ select hr_save_company_challenge(jsonb_build_object('templateSlug', 'boas_vindas', 'startsAt', now(), 'endsAt', now() + interval '20 days', 'rewardBenefitId', %L)) $q$,
               '00000000-0000-0000-0000-0000000000f1'));
  if r <> 'CHALLENGE_REWARD' then failures := failures || format(E'\n  a company rewarded with a Good Loop benefit (%s)', r); end if;
  ch := hr_save_company_challenge(jsonb_build_object('templateSlug', 'empresa_em_sintonia', 'title', 'Bônus pra quem trabalhar mais',
          'startsAt', now() - interval '5 days', 'endsAt', now() + interval '20 days', 'rewardBonusLoopsCenti', 2000));
  if (select title from challenges where id = ch) <> 'Empresa em sintonia' then failures := failures || E'\n  HR free text reached the challenge title (SPN-06)'; end if;
  if (select scope::text || ':' || scope_ref from challenges where id = ch) <> 'company:CO-AURORA' then failures := failures || E'\n  a company challenge is not whole-company'; end if;
  perform hr_company_challenge_action(ch, 'publish');
  perform co_as('co-hr-plain');
  if co_hint(format('select hr_company_challenge_action(%L, %L)', ch, 'cancel')) not in ('ADDON_NONE', 'HR_ONLY') then
    failures := failures || E'\n  another company''s HR acted on Aurora''s challenge';
  end if;
  perform co_as('');
  if failures <> '' then raise exception 'company challenges failed:%', failures; end if;
  raise notice 'ok  : templates only, whole company only, company rewards only';
end $$;

-- 30 of the 60 take part (one session each); 10 of them do three.
do $$
declare i int; u uuid;
begin
  for i in 1..30 loop
    u := (select id from profiles where name = 'co-emp' || i);
    insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed)
    values ('b2c', u, 'CO', 12, now() - interval '2 days' - interval '12 minutes', now() - interval '2 days', 720, true);
    if i <= 10 then
      insert into sessions (kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed)
      values ('b2c', u, 'CO', 12, now() - interval '3 days' - interval '12 minutes', now() - interval '3 days', 720, true),
             ('b2c', u, 'CO', 12, now() - interval '4 days' - interval '12 minutes', now() - interval '4 days', 720, true);
    end if;
  end loop;
end $$;

-- ---- d) the dashboard -------------------------------------------------------------------------
do $$
declare
  failures text := '';
  j json;
  card json;
begin
  perform co_as('co-hr');
  j := hr_addon_dashboard();
  card := (select e from json_array_elements(j->'challenges') e where e->>'templateSlug' = 'empresa_em_sintonia');
  if (j->>'eligible')::int <> 60 then failures := failures || format(E'\n  eligible %s, expected 60', j->>'eligible'); end if;
  if (card->>'adhesionPct')::int is distinct from 50 then failures := failures || format(E'\n  adhesion: 30 of 60 should read 50%% (got %s)', card->>'adhesionPct'); end if;
  if card->>'completedPct' is not null then failures := failures || E'\n  10 people completed — under k, must be hidden'; end if;
  if (j->>'multiplierLoopsMonth') is null then failures := failures || E'\n  30 people earned multiplier Loops: the month''s total should show'; end if;
  if j::text ~* 'co-emp|"(name|email|user_?id|area|team|unit)"' then failures := failures || E'\n  the dashboard carried a person or a sub-group'; end if;
  perform co_as('');
  if failures <> '' then raise exception 'dashboard failed:%', failures; end if;
  raise notice 'ok  : company-wide only, k = 25 with complementary suppression';
end $$;

-- 27 take part of 30 eligible → the 3 who did not are fewer than k: hidden too.
do $$
begin
  if gam_k_cell(27, 30, 25) is not null then raise exception 'complementary suppression: 27 of 30 leaves 3 recoverable'; end if;
  if gam_k_cell(30, 30, 25) is distinct from 30 then raise exception 'everyone of 30: nothing to recover, shown'; end if;
  if gam_k_cell(24, 100, 25) is not null then raise exception 'under k shown'; end if;
  if gam_k_cell(50, 100, 25) is distinct from 50 then raise exception '50 of 100 hidden'; end if;
  raise notice 'ok  : gam_k_cell';
end $$;

-- ---- the console: changing a company's plan changes the multiplier from then on -----
do $$
begin
  insert into profiles (auth_uid, role, name) values (gen_random_uuid(), 'admin', 'co-admin');
  perform co_as('co-admin');
  perform admin_set_company_plan('CO-AURORA', 'max');
  perform co_as('co-hr');
  if (hr_get_addon()->>'multiplier')::numeric <> 2 then raise exception 'the plan change did not take'; end if;
  perform co_as('co-admin');
  perform admin_set_company_plan('CO-AURORA', null);
  perform co_as('co-hr');
  if hr_get_addon() is not null then raise exception 'ending the plan left it active'; end if;
  perform co_as('');
  raise notice 'ok  : plans assigned, changed, ended';
end $$;

update economy_settings set max_backdate_hours = 24 where id;
drop function co_as(text);
drop function co_hint(text);
