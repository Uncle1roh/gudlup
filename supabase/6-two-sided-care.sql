-- ============================================================================
-- Good Loop — SCRIPT 6: make the two sides talk
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Run script 5 first.
--
-- Everything a therapist and a patient are supposed to share — the connection
-- itself, the chat, the prescribed pathway — was written into browser storage
-- on both sides. Two people, two localStorage keys, no wire between them. A
-- patient could type "I had a bad week" and no therapist would ever see it;
-- a therapist could prescribe a protocol and no patient would ever receive it.
--
-- The tables for all of it already exist (`patients`, `messages`,
-- `plan_items`). What was missing is the LINK between a person's login and a
-- therapist's patient record, and the permissions for the patient half of
-- each conversation. That is what this script adds.
--
-- The link is the `patients` row: `therapist_id` on one side,
-- `b2c_profile_id` on the other. Everything else keys off it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A patient may read their OWN patient row.
--
-- Without this the person cannot discover that they have a therapist at all:
-- the row that links them is invisible to them, so the app fell back to
-- hardcoded demo fixtures.
-- ---------------------------------------------------------------------------
drop policy if exists patients_self_read on patients;
create policy patients_self_read on patients
  for select using (b2c_profile_id = current_profile());

-- ---------------------------------------------------------------------------
-- 2. Read state is per SIDE.
--
-- One `read` flag was quietly answering "has the therapist seen this?" and
-- "has the patient seen this?" with the same column — whichever was asked
-- last won. They are different facts.
-- ---------------------------------------------------------------------------
alter table messages add column if not exists read_by_patient   boolean not null default false;
alter table messages add column if not exists read_by_therapist boolean not null default false;

-- Existing rows: a message is at least read by whoever wrote it.
update messages set read_by_patient   = true where sender = 'patient'   and not read_by_patient;
update messages set read_by_therapist = true where sender = 'therapist' and not read_by_therapist;

-- Each side may mark its own column. Insert is already covered (script 5 for
-- the patient, messages_via_patient for the therapist).
drop policy if exists messages_patient_marks_read on messages;
create policy messages_patient_marks_read on messages
  for update using (patient_id in (select my_patient_ids()))
  with check (patient_id in (select my_patient_ids()));

-- ---------------------------------------------------------------------------
-- 3. Connection codes — how a person becomes someone's patient.
--
-- The therapist's app generated a random code and kept it in its own browser;
-- the patient's app validated against two codes hardcoded in the source. The
-- flow could not connect anybody, ever, not even in the same browser.
-- ---------------------------------------------------------------------------
create table if not exists therapist_codes (
  code         text primary key,
  therapist_id uuid not null references therapists(id) on delete cascade,
  label        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists therapist_codes_owner_idx on therapist_codes (therapist_id);

alter table therapist_codes enable row level security;

-- A therapist manages their own codes. Nobody else may LIST them — redeeming
-- goes through the function below, which checks one code at a time and
-- therefore cannot be used to enumerate them.
drop policy if exists therapist_codes_own on therapist_codes;
create policy therapist_codes_own on therapist_codes
  for all using (therapist_id = current_profile())
  with check (therapist_id = current_profile());

-- ---------------------------------------------------------------------------
-- 4. Redeem a code: create or claim the patient record, and consent with it.
--
-- SECURITY DEFINER because the person redeeming may not read `therapist_codes`
-- and may not insert into `patients` — that is the therapist's table. The
-- function is the only door, it takes one code, and it writes exactly one row.
-- Re-redeeming the same code is idempotent: it returns the existing link.
-- ---------------------------------------------------------------------------
create or replace function redeem_therapist_code(p_code text)
  returns table (patient_id uuid, therapist_id uuid, therapist_name text, crp text)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_therapist uuid;
  v_me        uuid;
  v_name      text;
  v_patient   uuid;
begin
  v_me := current_profile();
  if v_me is null then
    raise exception 'not signed in';
  end if;

  select c.therapist_id into v_therapist
  from therapist_codes c
  where upper(c.code) = upper(trim(p_code)) and c.active;

  if v_therapist is null then
    raise exception 'unknown code';
  end if;

  select p.name into v_name from profiles p where p.id = v_me;

  -- already linked to this therapist? hand the same row back
  select p.id into v_patient
  from patients p
  where p.b2c_profile_id = v_me and p.therapist_id = v_therapist;

  if v_patient is null then
    insert into patients (therapist_id, b2c_profile_id, name)
    values (v_therapist, v_me, coalesce(v_name, 'Paziente'))
    returning id into v_patient;

    insert into patient_consents (patient_id, kind, granted)
    values (v_patient, 'therapy', true);
  end if;

  return query
    select v_patient, v_therapist, pr.name, t.crp
    from therapists t join profiles pr on pr.id = t.id
    where t.id = v_therapist;
end;
$$;

revoke all on function redeem_therapist_code(text) from public;
grant execute on function redeem_therapist_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. "Who is my therapist?" — one call, for the patient's own link.
-- ---------------------------------------------------------------------------
create or replace function my_therapist_link()
  returns table (patient_id uuid, therapist_id uuid, therapist_name text, crp text, since timestamptz)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select p.id, p.therapist_id, pr.name, t.crp, p.created_at
  from patients p
  join therapists t on t.id = p.therapist_id
  join profiles pr on pr.id = t.id
  where p.b2c_profile_id = current_profile()
  order by p.created_at desc
  limit 1
$$;

revoke all on function my_therapist_link() from public;
grant execute on function my_therapist_link() to authenticated;

-- Without this the API keeps serving the old function list.
notify pgrst, 'reload schema';

-- Should print two functions and one table.
select 'function' as kind, routine_name as name from information_schema.routines
 where routine_schema = 'public' and routine_name in ('redeem_therapist_code', 'my_therapist_link')
union all
select 'table', table_name from information_schema.tables
 where table_schema = 'public' and table_name = 'therapist_codes'
 order by kind, name;
