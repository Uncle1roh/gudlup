-- ============================================================================
-- Good Loop — SCRIPT 5: let a patient find a therapist and see their booking
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment.
--
-- Three things are broken in the database, not in the app, and no amount of
-- front-end work fixes them:
--
--   1. A PATIENT CANNOT SEE ANY THERAPIST. `therapists` is readable only by
--      its owner and by admins, and `profiles` only by its owner. The app asks
--      for the roster, row-level security returns zero rows, and the person is
--      told "no therapist is available through your company yet" — which is
--      false, and indistinguishable from the truth.
--
--   2. A PATIENT CANNOT SEE A BOOKING THEY JUST MADE. The booking INSERT
--      succeeds; reading it back joins through those same two tables, the join
--      finds nothing, and the row vanishes from the patient's view. So the
--      join window never opens, the video room id is never known, and
--      "cancel" silently does nothing while the slot stays blocked forever.
--
--   3. A CANCELLED SLOT IS POISONED FOREVER. `unique (therapist_id,
--      starts_at)` counts cancelled rows, so once a booking at 17:30 is
--      cancelled nobody can ever book 17:30 again — the grid offers it and
--      every attempt fails with "that time was just taken".
--
-- The fixes below expose the LEAST possible: a therapist's name and role, and
-- only for approved therapists. No emails, no CRP, no patient identities.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The public roster: approved therapists only, name and role only.
--
-- SECURITY DEFINER because a policy's own subquery is subject to RLS, so a
-- patient reading `profiles` inside a view would still see nothing. The
-- function returns a fixed, narrow column list — it cannot leak a column it
-- does not select.
-- ---------------------------------------------------------------------------
create or replace function public_therapists()
  returns table (id uuid, name text, crp text, avatar_url text)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select p.id, p.name, t.crp, p.avatar_url
  from therapists t
  join profiles p on p.id = t.id
  where t.status = 'approved' and p.active
$$;

revoke all on function public_therapists() from public;
grant execute on function public_therapists() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The patient's own appointment, with the therapist's name attached.
--
-- Same reason: the app needs one string from a table the patient may not read.
-- It returns only appointments belonging to the caller.
-- ---------------------------------------------------------------------------
create or replace function my_appointments()
  returns table (
    id uuid,
    therapist_id uuid,
    therapist_name text,
    patient_name text,
    starts_at timestamptz,
    duration_min int,
    status text
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select a.id, a.therapist_id, p.name, a.patient_name,
         a.starts_at, a.duration_min, a.status::text
  from appointments a
  join profiles p on p.id = a.therapist_id
  where a.patient_profile_id = current_profile()
  order by a.starts_at
$$;

revoke all on function my_appointments() from public;
grant execute on function my_appointments() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Which start times are already taken, WITHOUT revealing who took them.
--
-- Under RLS a patient sees only their own bookings, so somebody else's 17:30
-- still renders as free and the person learns it is taken by failing. This
-- returns instants and nothing else.
-- ---------------------------------------------------------------------------
create or replace function booked_times(t_id uuid, from_at timestamptz, to_at timestamptz)
  returns table (starts_at timestamptz)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select a.starts_at from appointments a
  where a.therapist_id = t_id
    and a.status = 'booked'
    and a.starts_at >= from_at
    and a.starts_at < to_at
$$;

revoke all on function booked_times(uuid, timestamptz, timestamptz) from public;
grant execute on function booked_times(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. A cancelled slot must become bookable again.
-- The unconditional unique constraint is replaced by a PARTIAL index that
-- only counts live bookings.
-- ---------------------------------------------------------------------------
alter table appointments drop constraint if exists appointments_therapist_id_starts_at_key;
drop index if exists appointments_booked_slot;
create unique index appointments_booked_slot
  on appointments (therapist_id, starts_at)
  where (status = 'booked');

-- ---------------------------------------------------------------------------
-- 5. Chat: the patient half of the policy was simply missing, so the messages
-- table could never work in both directions even once the app writes to it.
-- ---------------------------------------------------------------------------
drop policy if exists messages_patient_reads on messages;
create policy messages_patient_reads on messages
  for select using (patient_id in (select my_patient_ids()));

drop policy if exists messages_patient_writes on messages;
create policy messages_patient_writes on messages
  for insert with check (patient_id in (select my_patient_ids()));

-- Without this the API keeps serving the old function list.
notify pgrst, 'reload schema';

-- Should print three functions and one index.
select routine_name from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('public_therapists', 'my_appointments', 'booked_times')
 order by routine_name;
