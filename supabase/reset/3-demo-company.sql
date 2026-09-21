-- ===========================================================================
-- RESET 3 of 4 — THE DEMO COMPANY, AND THE HR LOGIN
--
-- Run this AFTER ../7-demo-user.sql, which builds the demo person and the demo
-- clinician (with their history, prescriptions, measurements and an upcoming
-- appointment). That script puts the person on ACME-2026; this one moves the
-- whole demo onto ONE company — Good Loop Demo, code DEMO-2026-GL — and adds
-- the employer side, which 7 does not cover.
--
-- Needs one more login, created the same way as the other two:
--   Authentication → Users → Add user → Auto Confirm User ON
--     hr.demo@goodloop.app
--
-- Change the three addresses below if you used different ones. Safe to re-run.
-- ===========================================================================

do $$
declare
  -- ---- edit these if you used different addresses -------------------------
  person_email    text := 'demo@goodloop.app';
  clinician_email text := 'terapeuta@goodloop.app';
  hr_email        text := 'hr.demo@goodloop.app';
  company         text := 'DEMO-2026-GL';
  -- -------------------------------------------------------------------------
  hr_auth   uuid;
  t_profile uuid;
begin
  -- The company itself. The id IS the code people type at sign-up, and this
  -- one is already known to the app as "Self Use + Professional Support" —
  -- which is what opens the Terapeuta tab, booking and video sessions. Any
  -- other code would demo the audio library with the clinical half switched off.
  insert into companies (id, name, seats, active_users, status)
  values (company, 'Good Loop Demo', 999, 0, 'active')
  on conflict (id) do update set name = excluded.name, seats = 999, status = 'active';

  -- The demo person belongs to it.
  update profiles set company_id = company, locale = 'it'
   where lower(email) = lower(person_email);

  -- The clinician, and their place on the company's bookable list. That list
  -- is exactly what an employee sees under "Trova un terapeuta".
  select p.id into t_profile from profiles p where lower(p.email) = lower(clinician_email);
  if t_profile is null then
    raise exception 'No profile for % — run ../7-demo-user.sql first.', clinician_email;
  end if;

  update therapists set status = 'approved', approved_at = coalesce(approved_at, now())
   where id = t_profile;

  insert into company_therapists (company_id, therapist_id)
  values (company, t_profile)
  on conflict do nothing;

  -- The employer login, if it exists. Everything else still works without it;
  -- you just cannot show the company dashboard.
  select id into hr_auth from auth.users where lower(email) = lower(hr_email);
  if hr_auth is null then
    raise warning 'No login for % — create it in Authentication → Users (Auto Confirm ON) and re-run this script if you want to demo the employer dashboard.', hr_email;
  else
    insert into profiles (auth_uid, role, name, email, locale, company_id, active)
    values (hr_auth, 'hr_admin', 'Referente Good Loop Demo', hr_email, 'it', company, true)
    on conflict (auth_uid) do update
      set role = 'hr_admin', company_id = company, email = excluded.email, active = true;
  end if;

  -- A spare activation code, so the "a therapist joins a company list" step
  -- can be demonstrated live without generating one first.
  insert into therapist_activation_codes (code, company_id, created_by)
  values ('DEMO-TH-2026', company, 'reset script')
  on conflict (code) do nothing;

  update companies
     set active_users = (select count(*) from profiles where company_id = company)
   where id = company;

  raise notice 'Demo company ready: % — clinician on the list, HR %.', company,
    case when hr_auth is null then 'NOT created' else 'created' end;
end $$;

notify pgrst, 'reload schema';
