-- ============================================================================
-- Benefits: availability and redemption against the real functions. Run by
-- tools/db-gate.mjs on a throwaway database; never on Supabase.
-- ============================================================================

create or replace function t_as(p_name text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', (select auth_uid::text from profiles where name = p_name), false)
$$;
-- the HINT of a raised error, or 'ok'
create or replace function t_try(p_sql text) returns text language plpgsql as $$
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
  ana uuid; bia uuid; caio uuid;
  t_desc uuid := (select id from benefit_tags where slug = 'desconto');
  t_food uuid := (select id from benefit_tags where slug = 'alimentos_bebidas');
begin
  insert into companies (id, name) values ('BEN-AURORA', 'Aurora'), ('BEN-OTHER', 'Other');
  insert into company_addon_subscriptions (company_id, plan_id, starts_at) values ('BEN-AURORA', 'premium', now() - interval '30 days');
  insert into profiles (auth_uid, role, name) values (gen_random_uuid(), 'b2c_user', 'ben-ana') returning id into ana;
  insert into profiles (auth_uid, role, name) values (gen_random_uuid(), 'b2c_user', 'ben-bia') returning id into bia;
  insert into profiles (auth_uid, role, name, company_id) values (gen_random_uuid(), 'b2c_user', 'ben-caio', 'BEN-AURORA') returning id into caio;
  -- 100 Loops each, as an adjustment
  insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, source_type, source_id)
  select u, 'admin_adjustment', 10000, 'goodloop', 'test', 'seed' from unnest(array[ana, bia, caio]) u;

  insert into benefits (id, title, pillar, price_loops_centi, delivery_type, static_code, status, per_user_limit, stock_total, stock_remaining)
  values ('00000000-0000-0000-0000-00000000000a', 'Code pool', 'sono', 5000, 'code_pool', null, 'active', 1, null, null),
         ('00000000-0000-0000-0000-00000000000b', 'Too dear', 'mente', 20000, 'static_code', 'STATIC-B', 'active', 1, null, null),
         ('00000000-0000-0000-0000-00000000000c', 'Food', 'alimentacao', 1000, 'static_code', 'FOOD-10', 'active', 2, null, null),
         ('00000000-0000-0000-0000-00000000000e', 'Identified', 'pausas_lazer', 0, 'identified', null, 'active', 1, null, null),
         ('00000000-0000-0000-0000-00000000000f', 'Last one', 'corpo', 1000, 'static_code', 'LAST', 'active', 1, 1, 1);
  -- an active static-code benefit without its code is refused by the schema
  begin
    insert into benefits (title, pillar, price_loops_centi, delivery_type, status) values ('No code', 'sono', 100, 'static_code', 'active');
    raise exception 'a static-code benefit without a code was accepted';
  exception when check_violation then null;
  end;
  insert into benefit_tag_map (benefit_id, tag_id) values
    ('00000000-0000-0000-0000-00000000000a', t_desc), ('00000000-0000-0000-0000-00000000000b', t_desc),
    ('00000000-0000-0000-0000-00000000000c', t_food), ('00000000-0000-0000-0000-00000000000e', t_desc),
    ('00000000-0000-0000-0000-00000000000f', t_desc);
  -- Aurora's own benefit (no tag needed), and the tag Aurora switched off
  insert into benefits (id, company_id, title, pillar, price_loops_centi, delivery_type, static_code, status)
  values ('00000000-0000-0000-0000-00000000000d', 'BEN-AURORA', 'Aurora breakfast', 'alimentacao', 0, 'static_code', 'CAFE', 'active');
  insert into company_disabled_tags (company_id, tag_id) values ('BEN-AURORA', t_food);
end $$;

do $$
declare
  failures text := '';
  j json;
  r text;
  bal int;
  n int;
  ana uuid := (select id from profiles where name = 'ben-ana');
begin
  -- codes are loaded by an admin; here, directly
  insert into benefit_codes (benefit_id, code) values ('00000000-0000-0000-0000-00000000000a', 'A-1'), ('00000000-0000-0000-0000-00000000000a', 'A-2');

  -- availability: Caio (Aurora) does not see Food, does see Aurora's own; Ana the reverse
  perform t_as('ben-caio');
  j := get_available_benefits();
  if j::text like '%"Food"%' then failures := failures || E'\n  a disabled tag still reached Aurora'; end if;
  if j::text not like '%Aurora breakfast%' then failures := failures || E'\n  Aurora''s own benefit missing for its employee'; end if;
  if j::text ~* 'stock_remaining|stockRemaining' then failures := failures || E'\n  a stock figure reached the person'; end if;
  r := t_try($q$ select redeem_benefit('00000000-0000-0000-0000-00000000000c') $q$);
  if r <> 'BENEFIT_UNAVAILABLE' then failures := failures || format(E'\n  Caio redeemed a tag-disabled benefit (%s)', r); end if;

  perform t_as('ben-ana');
  j := get_available_benefits();
  if j::text not like '%"Food"%' then failures := failures || E'\n  Food missing for someone with no company'; end if;
  if j::text like '%Aurora breakfast%' then failures := failures || E'\n  a company benefit reached someone outside it'; end if;

  -- redeem: code, debit, limit
  j := redeem_benefit('00000000-0000-0000-0000-00000000000a');
  if (j->>'code') <> 'A-1' then failures := failures || format(E'\n  first code was %s', j->>'code'); end if;
  select sum(amount_centi) into bal from loops_ledger where user_id = ana;
  if bal <> 5000 then failures := failures || format(E'\n  balance after a 50-Loop redemption: %s', bal); end if;
  r := t_try($q$ select redeem_benefit('00000000-0000-0000-0000-00000000000a') $q$);
  if r <> 'BENEFIT_LIMIT' then failures := failures || format(E'\n  per-person limit not enforced (%s)', r); end if;

  -- never negative
  r := t_try($q$ select redeem_benefit('00000000-0000-0000-0000-00000000000b') $q$);
  if r <> 'BENEFIT_BALANCE' then failures := failures || format(E'\n  redeemed beyond the balance (%s)', r); end if;
  select sum(amount_centi) into bal from loops_ledger where user_id = ana;
  if bal <> 5000 then failures := failures || E'\n  a refused redemption moved the balance'; end if;

  -- identified: only with consent, and the consent is stored
  r := t_try($q$ select redeem_benefit('00000000-0000-0000-0000-00000000000e', false) $q$);
  if r <> 'BENEFIT_NEEDS_CONSENT' then failures := failures || format(E'\n  identified without consent (%s)', r); end if;
  perform redeem_benefit('00000000-0000-0000-0000-00000000000e', true);
  if not exists (select 1 from benefit_redemptions where user_id = ana and benefit_id = '00000000-0000-0000-0000-00000000000e' and consent_identified_at is not null) then
    failures := failures || E'\n  the identification consent was not recorded';
  end if;

  -- stock: one left, two people
  perform redeem_benefit('00000000-0000-0000-0000-00000000000f');
  perform t_as('ben-bia');
  r := t_try($q$ select redeem_benefit('00000000-0000-0000-0000-00000000000f') $q$);
  if r not in ('BENEFIT_STOCK', 'BENEFIT_UNAVAILABLE') then failures := failures || format(E'\n  the last unit went twice (%s)', r); end if;

  -- the second code goes to the second person, never the first one's
  j := redeem_benefit('00000000-0000-0000-0000-00000000000a');
  if (j->>'code') <> 'A-2' then failures := failures || format(E'\n  Bia got code %s', j->>'code'); end if;
  r := t_try($q$ select redeem_benefit('00000000-0000-0000-0000-00000000000a') $q$);
  if r <> 'BENEFIT_LIMIT' then failures := failures || format(E'\n  (%s)', r); end if;

  -- codes: readable only by the person they were handed to (RLS, as Supabase's role)
  perform t_as('ben-ana');
  grant select on benefit_codes, benefit_redemptions to authenticated;
  set local role authenticated;
  select count(*) into n from benefit_codes;
  reset role;
  if n <> 1 then failures := failures || format(E'\n  Ana can read %s codes through the API, expected only her own', n); end if;

  -- Meus benefícios keeps the code even after the company changes its filter
  j := list_my_redemptions();
  if j::text not like '%A-1%' then failures := failures || E'\n  the redeemed code is missing from Meus benefícios'; end if;

  if failures <> '' then raise exception 'benefits failed:%', failures; end if;
  raise notice 'ok  : availability, company filter, limits, balance, consent, stock, codes, RLS';
end $$;

-- refund (as an admin) and the tag rule
do $$
declare
  failures text := '';
  ana uuid := (select id from profiles where name = 'ben-ana');
  red uuid := (select id from benefit_redemptions where user_id = (select id from profiles where name = 'ben-ana') and benefit_id = '00000000-0000-0000-0000-00000000000f');
  bal int;
  r text;
begin
  insert into profiles (auth_uid, role, name) values (gen_random_uuid(), 'admin', 'ben-admin');
  perform t_as('ben-admin');
  perform admin_refund_redemption(red);
  perform admin_refund_redemption(red);
  select sum(amount_centi) into bal from loops_ledger where user_id = ana;
  if bal <> 4000 + 1000 then failures := failures || format(E'\n  refund: balance %s, expected 5000 (once, not twice)', bal); end if;
  if (select stock_remaining from benefits where id = '00000000-0000-0000-0000-00000000000f') <> 1 then
    failures := failures || E'\n  refund did not return the unit';
  end if;
  if admin_upload_codes('00000000-0000-0000-0000-00000000000a', array['A-1', 'A-3', 'A-3', '  ']) <> 1 then
    failures := failures || E'\n  code upload: duplicates or blanks were counted';
  end if;

  -- a Good Loop benefit with no tag is refused at commit
  begin
    insert into benefits (id, title, pillar, price_loops_centi, delivery_type, static_code, status)
    values ('00000000-0000-0000-0000-0000000000aa', 'Untagged', 'sono', 100, 'static_code', 'X', 'active');
    set constraints benefits_need_tag immediate;
    r := 'ok';
  exception when others then
    get stacked diagnostics r = pg_exception_hint;
  end;
  if r is distinct from 'BENEFIT_NEEDS_TAG' then failures := failures || format(E'\n  an untagged Good Loop benefit was accepted (%s)', r); end if;
  set constraints all deferred;

  perform set_config('request.jwt.claim.sub', '', false);
  if failures <> '' then raise exception 'benefits failed:%', failures; end if;
  raise notice 'ok  : refund once, code upload, at least one tag';
end $$;

-- the console's save: benefit and tags together, the tag rule answered at once
do $$
declare
  r text;
  v uuid;
  t_desc uuid := (select id from benefit_tags where slug = 'desconto');
begin
  perform set_config('request.jwt.claim.sub', (select auth_uid::text from profiles where name = 'ben-admin'), false);
  begin
    perform admin_save_benefit('{"title":"No tag","pillar":"sono","priceLoopsCenti":100,"deliveryType":"static_code","staticCode":"X","status":"active"}'::jsonb, '{}');
    r := 'ok';
  exception when others then
    get stacked diagnostics r = pg_exception_hint;
  end;
  if r is distinct from 'BENEFIT_NEEDS_TAG' then raise exception 'admin_save_benefit accepted an untagged active benefit (%)', r; end if;
  v := admin_save_benefit('{"title":"Tagged","pillar":"sono","priceLoopsCenti":100,"deliveryType":"static_code","staticCode":"X","status":"active"}'::jsonb, array[t_desc]);
  v := admin_save_benefit(jsonb_build_object('id', v, 'title', 'Tagged, renamed', 'pillar', 'mente', 'priceLoopsCenti', 200,
                          'deliveryType', 'static_code', 'staticCode', 'X', 'status', 'paused'), array[t_desc]);
  if (select title from benefits where id = v) <> 'Tagged, renamed' then raise exception 'admin_save_benefit did not update'; end if;
  perform set_config('request.jwt.claim.sub', '', false);
  raise notice 'ok  : the console saves a benefit with its tags in one step';
end $$;

-- the right to disappear: redemptions go, a shown code is never re-issued
do $$
declare
  ana uuid := (select id from profiles where name = 'ben-ana');
begin
  delete from profiles where id = ana;
  if exists (select 1 from benefit_redemptions where user_id = ana) then raise exception 'redemptions survived the deletion'; end if;
  if (select assigned_at from benefit_codes where code = 'A-1') is null then raise exception 'a code already shown became free again'; end if;
  raise notice 'ok  : deletion removes redemptions, keeps shown codes out of circulation';
end $$;

drop function t_as(text);
drop function t_try(text);
