-- ===========================================================================
-- RESET 2 of 4 — THE WIPE.  This one deletes.  Run 1-dry-run.sql first.
--
-- DELETES   every profile except admins, and the logins behind them; every
--           therapist; every patient record and everything clinical hanging
--           off one; appointments; availability; connection codes; companies;
--           NR-1 responses.
--
-- KEEPS     protocols and all their material, the audio library and its tags,
--           the library shelves, operator settings (the ElevenLabs key), the
--           audit trail, storage files, and every admin account. None of those
--           words appears in a delete below — check for yourself.
--
-- It is one transaction: it all happens, or none of it does. It refuses to
-- run at all if there is no admin profile in this database.
-- ===========================================================================

begin;

do $$
declare
  n_admin int;
begin
  select count(*) into n_admin from profiles where role = 'admin';
  if n_admin = 0 then
    raise exception
      'ABORTING — no admin profile here. Either this is the wrong project or the admin is already gone. Nothing was deleted.';
  end if;
  if not exists (select 1 from profiles where lower(email) = 'admin@goodloop.app' and role = 'admin') then
    raise warning 'admin@goodloop.app not found, but % other admin profile(s) exist and are being kept.', n_admin;
  end if;
  raise notice 'Keeping % admin profile(s). Protocols are not touched.', n_admin;
end $$;

-- Children before parents. Several of these relationships are ON DELETE
-- RESTRICT on purpose — a clinical record should not disappear because
-- somebody removed a row two tables away — so the order matters. Tables a
-- given database has not got yet are skipped rather than aborting the run.
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    -- everything hanging off a patient
    'clinical_events', 'reports', 'plan_items', 'patient_notes', 'rapid_notes',
    'messages', 'scores', 'goals', 'patient_consents', 'sessions',
    -- scheduling
    'session_requests', 'appointments', 'therapist_availability', 'therapist_codes',
    -- NR-1 responses
    'psychosocial_responses',
    -- the patient records themselves: before therapists (ON DELETE RESTRICT)
    'patients',
    -- the company side of a clinician, then the clinician
    'company_therapists', 'therapist_activation_codes', 'therapists'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipped %, not in this database', t;
    else
      execute format('delete from public.%I', t);
      get diagnostics n = row_count;
      raise notice 'deleted % row(s) from %', n, t;
    end if;
  end loop;
end $$;

-- The people. Admins survive by ROLE, not by address — an admin whose email
-- is spelled differently is still an admin.
delete from profiles where role <> 'admin';

-- The tenants.
delete from companies;

-- The logins. One with no profile behind it cannot sign in to anything, so
-- leaving it would only be a way back into a deleted account.
--
-- Admin logins are kept three ways over, because this is the one delete in
-- the file that cannot be undone: by the id an admin profile points at, by any
-- address an admin profile carries, and by the address itself.
delete from auth.users u
 where u.id not in (select auth_uid from profiles where role = 'admin' and auth_uid is not null)
   and lower(coalesce(u.email, '')) not in (
     select lower(email) from profiles where role = 'admin' and email is not null)
   and lower(coalesce(u.email, '')) <> 'admin@goodloop.app';

commit;

-- What is left standing.
select 'profiles left (admins only)' as what, count(*) as rows from profiles
union all select 'logins left',    count(*) from auth.users
union all select 'companies left', count(*) from companies
union all select 'PROTOCOLS (untouched)', count(*) from protocols;
