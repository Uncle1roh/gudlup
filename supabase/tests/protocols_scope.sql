-- ============================================================================
-- Who reads which catalogue rows — through RLS, as Supabase's `authenticated`
-- role. Run by tools/db-gate.mjs on its own copy of a fresh database.
-- ============================================================================

do $$
declare
  failures text := '';
  n int;
  codes text;
begin
  insert into companies (id, name) values ('PS-ACME', 'Acme'), ('PS-OTHER', 'Other');
  insert into protocols (code, family, title, enabled, tenants) values
    ('PS-OPEN', 'PS', 'Open', true, '"all"'), ('PS-OFF', 'PS', 'Disabled', false, '"all"'),
    ('PS-ACME-ONLY', 'PS', 'Acme only', true, '["PS-ACME"]'), ('PS-OTHER-ONLY', 'PS', 'Other only', true, '["PS-OTHER"]');
  insert into profiles (auth_uid, role, name, company_id) values
    ('00000000-0000-0000-0000-0000000000a1', 'b2c_user', 'ps-acme', 'PS-ACME'),
    ('00000000-0000-0000-0000-0000000000a2', 'b2c_user', 'ps-free', null),
    ('00000000-0000-0000-0000-0000000000a3', 'admin', 'ps-admin', null);
  grant select on protocols to authenticated;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  set local role authenticated;
  select string_agg(code, ',' order by code) into codes from protocols where code like 'PS-%';
  reset role;
  if codes <> 'PS-ACME-ONLY,PS-OPEN' then failures := failures || format(E'\n  an Acme employee reads %s, expected PS-ACME-ONLY,PS-OPEN', codes); end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
  set local role authenticated;
  select string_agg(code, ',' order by code) into codes from protocols where code like 'PS-%';
  reset role;
  if codes <> 'PS-OPEN' then failures := failures || format(E'\n  someone with no company reads %s, expected PS-OPEN', codes); end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  set local role authenticated;
  select count(*) into n from protocols where code like 'PS-%';
  reset role;
  if n <> 4 then failures := failures || format(E'\n  an admin reads %s rows, expected all 4', n); end if;

  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  select count(*) into n from protocols where code like 'PS-%';
  reset role;
  if n <> 0 then failures := failures || format(E'\n  signed out reads %s rows', n); end if;

  if failures <> '' then raise exception 'protocol scope failed:%', failures; end if;
  raise notice 'ok  : disabled rows and other companies'' protocols never reach a person';
end $$;
