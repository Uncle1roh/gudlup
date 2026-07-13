-- ===========================================================================
-- Good Loop — Auth & self-service RLS policies
-- Apply AFTER docs/DATA_MODEL.sql (Supabase SQL editor → run).
--
-- DATA_MODEL.sql enables row-level security on `profiles` but ships no policy
-- for it, which means "deny all" — so sign-up (insert) and the data layer's
-- profile lookup (select) would both fail. These policies let a signed-in user
-- read and create ONLY their own profile / therapist rows, which is exactly
-- what email+password sign-up needs. Everything else stays governed by the
-- ownership policies already in DATA_MODEL.sql.
-- ===========================================================================

-- Helper used here AND by the sessions/patients policies in DATA_MODEL.sql:
-- the caller's profile id, derived from their auth JWT.
create or replace function current_profile() returns uuid
  language sql stable as
  $$ select id from profiles where auth_uid = auth.uid() $$;

alter table therapists enable row level security;

-- profiles: read / create / update only your own row -------------------------
create policy profiles_select_own on profiles
  for select using (auth_uid = auth.uid());

create policy profiles_insert_own on profiles
  for insert with check (auth_uid = auth.uid());

create policy profiles_update_own on profiles
  for update using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());

-- therapists: read / create only the row keyed to your profile ---------------
-- (insert runs right after the profile insert during clinician sign-up, so
--  current_profile() already resolves to the new profile id.)
create policy therapists_select_own on therapists
  for select using (id = current_profile());

create policy therapists_insert_own on therapists
  for insert with check (id = current_profile());

-- NOTE: therapist APPROVAL (status pending → approved) is a privileged action.
-- Do it from the Supabase dashboard or a service-role backend, NOT the client —
-- there is intentionally no client UPDATE policy on therapists.status here.
