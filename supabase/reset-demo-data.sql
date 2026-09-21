-- ===========================================================================
-- Good Loop — clear the people, keep the product
--
-- Run this when the accounts and tenants in a database have drifted into a
-- state nobody can reason about, and you want one clean company, one clinician
-- and one person to demo with. It removes PEOPLE and TENANTS. It does not
-- touch the product.
--
-- DELETED
--   every profile except the admins, and their auth logins
--   every therapist, their credentials queue rows, availability and codes
--   every patient record and everything hanging off one — sessions, notes,
--   scores, goals, consents, plans, reports, messages, clinical events
--   every appointment and session request
--   every company, its therapist activation codes and its enrolled list
--   psychosocial (NR-1) responses
--
-- KEPT, AND NEVER REFERENCED BY A DELETE BELOW
--   protocols          ← every protocol, its PLAIN timelines, Studio sessions,
--                        datasheets, asset maps, per-duration material
--   asset_meta         ← the audio library's tags
--   app_settings       ← operator settings, including the ElevenLabs key
--   explore_rails      ← the library shelves
--   audit_events       ← the record of what admins did, which is the point
--   storage buckets    ← nothing here deletes an object; audio and credential
--                        files are untouched
--   admin@goodloop.app ← and any other profile whose role is 'admin'
--
-- HOW TO RUN IT
--   1. Run setup.sql first if you have not lately — this script needs the
--      'hr_admin' enum value it adds.
--   2. Run STEP 0 alone and read the numbers. That is the dry run: it deletes
--      nothing and tells you exactly what STEP 1 would remove. If it complains
--      that a table does not exist, setup.sql has not been run — do that first.
--   3. Run STEP 1 (the wipe) and STEP 2 (the demo company) together.
--   4. Register the three demo accounts in the app itself — the sign-up path
--      customers will use, so you are testing it at the same time. Emails and
--      the company code are in STEP 3.
--   5. Run STEP 3 to approve the clinician, put them on the demo company's
--      list, and give them bookable hours.
--
-- Everything destructive is inside one transaction and guarded: if the admin
-- profile is not found, the whole thing aborts and nothing is deleted.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- STEP 0 — the dry run. Deletes nothing. Run it on its own, first.
-- ---------------------------------------------------------------------------
select 'profiles to delete'      as what, count(*) from profiles where role <> 'admin'
union all select 'profiles kept (admins)',  count(*) from profiles where role = 'admin'
union all select 'therapists to delete',    count(*) from therapists
union all select 'patients to delete',      count(*) from patients
union all select 'appointments to delete',  count(*) from appointments
union all select 'companies to delete',     count(*) from companies
union all select 'auth logins to delete',   count(*) from auth.users
         where id not in (select auth_uid from profiles where role = 'admin' and auth_uid is not null)
union all select 'PROTOCOLS (kept)',        count(*) from protocols
union all select 'library shelves (kept)',  count(*) from explore_rails
union all select 'audio tags (kept)',       count(*) from asset_meta;

-- Protocols restricted to a named tenant would become invisible once that
-- company is gone. This lists them; nothing is changed. Expect zero rows.
select code, title, tenants from protocols where tenants::text <> '"all"';


-- ---------------------------------------------------------------------------
-- STEP 1 — the wipe. One transaction: it all happens or none of it does.
-- ---------------------------------------------------------------------------
begin;

do $$
declare
  n_admin int;
begin
  select count(*) into n_admin from profiles where role = 'admin';
  if n_admin = 0 then
    raise exception 'ABORTING: no admin profile in this database. Either this is the wrong project, or the admin account is already gone — either way, do not run a wipe here.';
  end if;
  if not exists (select 1 from profiles where lower(email) = 'admin@goodloop.app' and role = 'admin') then
    raise warning 'admin@goodloop.app was not found, but % other admin profile(s) exist and will be kept.', n_admin;
  end if;
  raise notice 'Keeping % admin profile(s) and every protocol.', n_admin;
end $$;

-- Children first: several of these are ON DELETE NO ACTION or RESTRICT, which
-- is deliberate — a clinical record should not vanish because somebody removed
-- a row two tables away.
-- In this order, and skipping any table this particular database has not got
-- yet — an older project may predate `therapist_codes` or `company_therapists`,
-- and a missing table should not abort a wipe halfway through.
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

-- The people. Admins survive, by role, not by email — an admin whose address
-- differs is still an admin.
delete from profiles where role <> 'admin';

-- The tenants.
delete from companies;

-- The logins. Anything with no admin profile behind it can no longer sign in
-- to anything, so leaving it would only be a way back into a deleted account.
--
-- Kept three ways over, because deleting the wrong row here is the one thing
-- in this file that cannot be undone: by the id an admin profile points at, by
-- any address an admin profile carries, and by the address itself.
delete from auth.users u
 where u.id not in (select auth_uid from profiles where role = 'admin' and auth_uid is not null)
   and lower(coalesce(u.email, '')) not in (
     select lower(email) from profiles where role = 'admin' and email is not null)
   and lower(coalesce(u.email, '')) <> 'admin@goodloop.app';

commit;


-- ---------------------------------------------------------------------------
-- STEP 2 — the demo company.
--
-- The id IS the code people type at sign-up, and DEMO-2026-GL is the one the
-- app already knows: it resolves to "Self Use + Professional Support", which
-- is what opens the Terapeuta tab, booking and video sessions. Any other code
-- would give a demo the audio library and nothing else.
-- ---------------------------------------------------------------------------
insert into companies (id, name, seats, active_users, status)
values ('DEMO-2026-GL', 'Good Loop Demo', 999, 0, 'active')
on conflict (id) do update
  set name = excluded.name, seats = excluded.seats, status = 'active';


-- ---------------------------------------------------------------------------
-- STEP 3 — after registering the three accounts IN THE APP.
--
--   the person      /            → Register → company code DEMO-2026-GL
--                                  email demo@goodloop.app
--   the clinician   /#therapist  → Register → licence number as you like
--                                  email terapeuta.demo@goodloop.app
--   the company     /#hr         → Register → company code DEMO-2026-GL
--                                  email hr.demo@goodloop.app
--
-- Use the same password for all three so a demo is one thing to remember, and
-- change it after any demo where somebody watched you type it.
--
-- This step then does what a real deployment does by hand: approves the
-- clinician, puts them on the company's bookable list, and publishes hours so
-- a customer can actually book a session on screen.
-- ---------------------------------------------------------------------------
begin;

-- Everyone on the demo tenant.
update profiles
   set company_id = 'DEMO-2026-GL', locale = 'it'
 where lower(email) in ('demo@goodloop.app', 'hr.demo@goodloop.app');

update profiles set locale = 'it' where lower(email) = 'terapeuta.demo@goodloop.app';

-- Approve the clinician. Without this they see the credential upload instead
-- of a roster, and nobody can book them.
update therapists t
   set status = 'approved',
       approved_at = coalesce(t.approved_at, now()),
       decided_at = now(),
       decision_log = t.decision_log || jsonb_build_object(
         'at', now(), 'by', 'reset-demo-data.sql', 'action', 'approved',
         'reason', 'Demo account seeded with the database reset')
  from profiles p
 where p.id = t.id and lower(p.email) = 'terapeuta.demo@goodloop.app';

-- Put them on the demo company's list, which is the list its employees see.
insert into company_therapists (company_id, therapist_id)
select 'DEMO-2026-GL', t.id
  from therapists t join profiles p on p.id = t.id
 where lower(p.email) = 'terapeuta.demo@goodloop.app'
on conflict do nothing;

-- Bookable hours: Monday to Friday, 09:00 / 14:00 / 16:00. A clinician with no
-- availability shows "no free times" to every patient, which in a demo reads
-- as a broken booking screen.
insert into therapist_availability (therapist_id, slots, updated_at)
select t.id,
       '[{"weekday":1,"hhmm":"09:00"},{"weekday":1,"hhmm":"14:00"},{"weekday":1,"hhmm":"16:00"},
         {"weekday":2,"hhmm":"09:00"},{"weekday":2,"hhmm":"14:00"},{"weekday":2,"hhmm":"16:00"},
         {"weekday":3,"hhmm":"09:00"},{"weekday":3,"hhmm":"14:00"},{"weekday":3,"hhmm":"16:00"},
         {"weekday":4,"hhmm":"09:00"},{"weekday":4,"hhmm":"14:00"},{"weekday":4,"hhmm":"16:00"},
         {"weekday":5,"hhmm":"09:00"},{"weekday":5,"hhmm":"14:00"},{"weekday":5,"hhmm":"16:00"}]'::jsonb,
       now()
  from therapists t join profiles p on p.id = t.id
 where lower(p.email) = 'terapeuta.demo@goodloop.app'
on conflict (therapist_id) do update set slots = excluded.slots, updated_at = now();

-- Seats used, so the company dashboard is not showing zero of everything.
update companies
   set active_users = (select count(*) from profiles where company_id = 'DEMO-2026-GL')
 where id = 'DEMO-2026-GL';

commit;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- STEP 4 — check it. Every line below should read as you expect.
-- ---------------------------------------------------------------------------
select p.email, p.role, p.company_id, t.status as therapist_status
  from profiles p left join therapists t on t.id = p.id
 order by p.role, p.email;

select 'protocols still here' as what, count(*) from protocols
union all select 'shelves still here', count(*) from explore_rails
union all select 'companies', count(*) from companies
union all select 'therapists on the demo list', count(*) from company_therapists where company_id = 'DEMO-2026-GL'
union all select 'bookable hours published', count(*) from therapist_availability;
