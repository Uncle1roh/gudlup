-- ============================================================================
-- Good Loop — SCRIPT 15: the assessment queue, out of the browser
--
-- Everything here is also in supabase/setup.sql. Run this on its own if
-- setup.sql has already been run. Safe to re-run.
--
-- WHAT WAS WRONG: the clinical assessment queue — DASS-21, CBI, the session
-- VAS, every score a therapist reads — lived in one localStorage key called
-- `gl.assessments`. Clearing a browser destroyed it. Two devices disagreed.
-- The therapist's desktop and the patient's app only agreed because, in the
-- demo, they were the same browser.
--
-- APPEND-ONLY IS NOW THE DATABASE'S RULE, not the client's. `freeze()` in
-- src/data/assessments.ts refuses to modify a completed record, and that was
-- the only thing enforcing it. A clinical record that may be used to show
-- efficacy proves nothing if it can be edited afterwards, so the trigger
-- below refuses the write whatever the client believes.
--
-- WHO SEES WHAT: a person sees their own records. A therapist sees the
-- records of their own patients and nobody else's. Admins see none of it
-- from here — this is clinical material, not catalogue material.
-- ============================================================================

create table if not exists assessments (
  -- The client generates the id ('as-<base36>-<n>'), because a record is
  -- created offline and synced; a server default would renumber it.
  id              text primary key,

  -- WHO IT BELONGS TO. `owner_profile` is the person the assessment is
  -- about, and is what row-level security scopes on.
  owner_profile   uuid not null references profiles(id) on delete cascade,

  -- The clinical record, when the person is somebody's patient. Null for a
  -- self-use person with no therapist: they still take assessments.
  patient_id      uuid references patients(id) on delete set null,

  -- The key the app indexes by. 'me' on a person's own app, a patient id on
  -- the therapist's desktop. Kept so the client-side queries are unchanged.
  patient_key     text not null,

  instrument_id   text not null,          -- 'DASS21' | 'CBI' | 'VAS' | ...
  timepoint       text not null,          -- 't0' | 't1' | 't2' | 'session'
  administered_at timestamptz not null,
  completed_at    timestamptz,
  status          text not null,          -- 'proposed' | 'confirmed' | 'in_progress' | 'completed'
  proposed_by     text not null default 'system',
  confirmed_by    text,
  responses       jsonb not null default '[]'::jsonb,
  scores          jsonb,
  immutable       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists assessments_owner_idx   on assessments (owner_profile, administered_at desc);
create index if not exists assessments_patient_idx on assessments (patient_id) where patient_id is not null;

alter table assessments enable row level security;

-- ---------------------------------------------------------------------------
-- Append-only, enforced here and not in the client
-- ---------------------------------------------------------------------------
-- Once a record is frozen it is evidence. The client already refuses to touch
-- it; this makes the refusal true even when the client is wrong, out of date,
-- or somebody poking the API directly.
create or replace function assessments_no_edit_after_freeze()
returns trigger language plpgsql as $$
begin
  if old.immutable then
    raise exception
      'Assessment % is completed and cannot be modified (append-only clinical record).', old.id
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists assessments_freeze_guard on assessments;
create trigger assessments_freeze_guard
  before update on assessments
  for each row execute function assessments_no_edit_after_freeze();

-- A frozen record cannot be deleted either: deleting and re-inserting would
-- be an edit with extra steps.
create or replace function assessments_no_delete_after_freeze()
returns trigger language plpgsql as $$
begin
  if old.immutable then
    raise exception
      'Assessment % is completed and cannot be deleted (append-only clinical record).', old.id
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists assessments_delete_guard on assessments;
create trigger assessments_delete_guard
  before delete on assessments
  for each row execute function assessments_no_delete_after_freeze();

-- ---------------------------------------------------------------------------
-- Who may read and write
-- ---------------------------------------------------------------------------
-- The person: their own records, and only their own.
drop policy if exists assessments_own on assessments;
create policy assessments_own on assessments
  for all
  using (owner_profile = current_profile())
  with check (owner_profile = current_profile());

-- The therapist: the records of their own patients. Read and write, because
-- sending an instrument is a write the therapist makes on the patient's row.
drop policy if exists assessments_therapist on assessments;
create policy assessments_therapist on assessments
  for all
  using (
    patient_id is not null
    and exists (
      select 1 from patients p
       where p.id = assessments.patient_id
         and p.therapist_id = current_profile()
    )
  )
  with check (
    patient_id is not null
    and exists (
      select 1 from patients p
       where p.id = assessments.patient_id
         and p.therapist_id = current_profile()
    )
  );

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- A NOTE ON SOMETHING THIS DOES NOT FIX
-- ---------------------------------------------------------------------------
-- src/data/assessmentStore.ts says "the patient never sees a score", and on
-- the screens that is true: nothing on the Self Use side renders one.
--
-- But the SCORING happens in the browser — `freeze()` computes the scaled
-- scores and submits them — so the patient's own client has the number in
-- memory before it is ever stored, and these policies let them read back the
-- row they wrote. The rule is honoured by the interface, not by the
-- boundary.
--
-- Making it structural means scoring server-side: the client submits raw
-- responses, a SECURITY DEFINER function scores them, and `scores` becomes
-- readable only by the therapist. That is a deliberate piece of work, not a
-- policy tweak, and it is written down here so it is not mistaken for done.
