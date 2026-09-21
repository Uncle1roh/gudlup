-- ============================================================================
-- GOOD LOOP — Supabase go-live script (single paste-and-run)
--
-- Consolidates docs/DATA_MODEL.sql + docs/AUTH_POLICIES.sql in the CORRECT
-- order (helpers before the policies that use them), adds the RLS policies
-- that were missing (without them, inserts like "record a B2C session" or
-- "submit the psychosocial assessment" are silently denied), and replaces the
-- illustrative nr1_report() with a real implementation ported from
-- src/employer/aggregate.ts.
--
-- HOW TO RUN: Supabase → SQL Editor → paste this whole file → Run.
-- Safe to re-run: guarded with IF NOT EXISTS / OR REPLACE / drop-and-recreate
-- policies throughout.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Enums (guarded so re-runs don't fail)
-- ---------------------------------------------------------------------------
do $$ begin create type user_role as enum ('b2c_user', 'therapist', 'admin'); exception when duplicate_object then null; end $$;
do $$ begin create type therapist_status as enum ('pending', 'approved', 'rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type consent_kind as enum ('therapy', 'sharing', 'aggregates'); exception when duplicate_object then null; end $$;
do $$ begin create type goal_status as enum ('achieved', 'in-progress', 'review'); exception when duplicate_object then null; end $$;
do $$ begin create type session_kind as enum ('b2c', 'b2b'); exception when duplicate_object then null; end $$;
do $$ begin create type message_from as enum ('patient', 'therapist'); exception when duplicate_object then null; end $$;

alter type user_role        add value if not exists 'hr_admin';
alter type therapist_status add value if not exists 'more_info';

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id            text primary key,
  name          text not null,
  seats         int  not null default 0,
  active_users  int  not null default 0,
  status        text not null default 'active',   -- 'active' | 'paused'
  created_at    timestamptz not null default now()
);

create table if not exists profiles (
  id          uuid primary key default gen_random_uuid(),
  auth_uid    uuid unique,                 -- maps to Supabase auth.users.id
  role        user_role not null,
  name        text not null,
  locale      text not null default 'pt-BR',
  email       text,
  company_id  text references companies(id),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table profiles add column if not exists avatar_url text;

create table if not exists therapists (
  id            uuid primary key references profiles(id) on delete cascade,
  crp           text not null,
  status        therapist_status not null default 'pending',
  approved_at   timestamptz,
  decision_log  jsonb not null default '[]',
  created_at    timestamptz not null default now(),
  review_reason text,
  decided_at    timestamptz
);

-- The documents a clinician submits to prove they are one: [{ path, name,
-- size, at }]. `path` is an object in the private `credentials` bucket, which
-- only its owner and an admin may read. The registration NUMBER has always been
-- here; the proof behind it had nowhere to go, so the review was a number
-- someone typed about themselves.
alter table therapists add column if not exists documents jsonb not null default '[]';
-- WHO decided. A credential review is a person vouching for another person's
-- licence, and "approved" with nobody's name on it is an unanswerable question
-- the first time a patient asks how a therapist got in.
alter table therapists add column if not exists decided_by text;

-- ---------------------------------------------------------------------------
-- The rails on the Self Use home screen: a title and the sessions in it.
-- They used to be written in code, so the shelf could only change with a
-- deploy. Readable by anyone signed in (the app renders them), writable by an
-- admin. No rows = the app's built-in rails, which is what every install has
-- today and what a fresh database should keep.
-- ---------------------------------------------------------------------------
-- A COMPANY'S THERAPISTS
--
-- Who an employee may book is the list their employer put together, and a
-- therapist joins it by entering an activation code — never by an employer
-- typing a name. Two tables and one function:
--
--   therapist_activation_codes   what HR (or a Good Loop admin) hands out
--   company_therapists           who is on the list
--   redeem_therapist_activation  the ONLY way a row gets into it
--
-- The privacy boundary is the point: HR sees which therapists are enrolled,
-- and never which employee booked which one. Nothing here joins a therapist
-- to a patient.
create table if not exists therapist_activation_codes (
  code       text primary key,
  company_id text not null references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text,
  used_by    uuid references therapists(id) on delete set null,
  used_at    timestamptz,
  revoked_at timestamptz
);

create table if not exists company_therapists (
  company_id   text not null references companies(id) on delete cascade,
  therapist_id uuid not null references therapists(id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (company_id, therapist_id)
);

create or replace function is_hr() returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from profiles where auth_uid = auth.uid() and role = 'hr_admin') $$;

alter table therapist_activation_codes enable row level security;
alter table company_therapists enable row level security;

-- HR sees and issues codes for THEIR company; an admin for any.
drop policy if exists codes_admin on therapist_activation_codes;
create policy codes_admin on therapist_activation_codes
  for all using (is_admin()) with check (is_admin());
drop policy if exists codes_hr on therapist_activation_codes;
create policy codes_hr on therapist_activation_codes
  for all using (is_hr() and company_id = my_company_id())
  with check (is_hr() and company_id = my_company_id());

-- The list is readable by anyone signed in: an employee has to be able to see
-- who their company offers. It carries no clinical data and no patient link.
drop policy if exists company_therapists_read on company_therapists;
create policy company_therapists_read on company_therapists
  for select using (auth.uid() is not null);
drop policy if exists company_therapists_admin on company_therapists;
create policy company_therapists_admin on company_therapists
  for all using (is_admin()) with check (is_admin());
drop policy if exists company_therapists_hr on company_therapists;
create policy company_therapists_hr on company_therapists
  for all using (is_hr() and company_id = my_company_id())
  with check (is_hr() and company_id = my_company_id());

-- The only way onto a list. SECURITY DEFINER so a therapist never needs read
-- access to the code table: they present a code, and either they are enrolled
-- or they are told why not.
create or replace function redeem_therapist_activation(p_code text)
  returns text language plpgsql security definer set search_path = public as $$
declare
  v_row therapist_activation_codes%rowtype;
  v_therapist uuid;
begin
  select t.id into v_therapist
    from therapists t join profiles p on p.id = t.id
   where p.auth_uid = auth.uid();
  if v_therapist is null then return 'NOT_A_THERAPIST'; end if;

  select * into v_row from therapist_activation_codes
   where upper(code) = upper(trim(p_code)) for update;
  if v_row.code is null then return 'UNKNOWN'; end if;
  if v_row.revoked_at is not null then return 'REVOKED'; end if;
  if v_row.used_at is not null and v_row.used_by <> v_therapist then return 'ALREADY_USED'; end if;

  insert into company_therapists (company_id, therapist_id)
       values (v_row.company_id, v_therapist)
  on conflict do nothing;

  update therapist_activation_codes
     set used_by = v_therapist, used_at = now()
   where code = v_row.code;

  return 'OK:' || v_row.company_id;
end $$;

-- Which therapists an employee may book: the ones their company enrolled.
-- A company that has enrolled nobody keeps the previous behaviour — every
-- approved therapist — so no tenant loses professional support the day this
-- ships.
create or replace function public_therapists()
  returns table (id uuid, name text, crp text, avatar_url text)
  language sql stable security definer set search_path = public as $$
  with mine as (select my_company_id() as cid)
  select p.id, p.name, t.crp, p.avatar_url
    from therapists t
    join profiles p on p.id = t.id
   where t.status = 'approved' and p.active
     and (
       not exists (select 1 from company_therapists ct where ct.company_id = (select cid from mine))
       or exists (
         select 1 from company_therapists ct
          where ct.company_id = (select cid from mine) and ct.therapist_id = t.id
       )
     )
$$;

create table if not exists explore_rails (
  id         text primary key,
  title      text not null,
  subtitle   text,
  slugs      jsonb not null default '[]',
  position   integer not null default 0,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table explore_rails enable row level security;
drop policy if exists explore_rails_read on explore_rails;
create policy explore_rails_read on explore_rails
  for select using (auth.uid() is not null);
drop policy if exists explore_rails_admin_write on explore_rails;
create policy explore_rails_admin_write on explore_rails
  for all using (is_admin()) with check (is_admin());

create table if not exists patients (
  id                uuid primary key default gen_random_uuid(),
  therapist_id      uuid not null references therapists(id) on delete restrict,
  b2c_profile_id    uuid references profiles(id),
  name              text not null,
  age               int,
  sex               char(1),
  reason            text,
  conditions        text[] not null default '{}',
  medications       text[] not null default '{}',
  contraindications text[] not null default '{}',
  clinical_notes    text,
  prescription      text,
  created_at        timestamptz not null default now()
);

-- scheduling-lite: the next planned session (edited from the patient record)
alter table patients add column if not exists next_session_at timestamptz;

-- employee provisioning: which team the employee belongs to (feeds NR-1 by-team)
alter table profiles add column if not exists team text;

-- defensive adds: databases first created from the older docs/DATA_MODEL.sql may
-- lack these (create table if not exists doesn't add columns to existing tables)
alter table therapists add column if not exists review_reason text;
alter table therapists add column if not exists decided_at timestamptz;
alter table patients   add column if not exists b2c_profile_id uuid references profiles(id);
-- (the protocols alters live AFTER `create table protocols` below — on a fresh
--  database the table doesn't exist yet at this point in the script)

create table if not exists patient_consents (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  kind        consent_kind not null,
  granted     boolean not null,
  at          timestamptz not null default now(),
  unique (patient_id, kind)
);

create table if not exists goals (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  text        text not null,
  status      goal_status not null default 'in-progress',
  created_at  timestamptz not null default now()
);

create table if not exists scores (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references patients(id) on delete cascade,
  instrument      text not null,
  max             numeric not null,
  lower_is_better boolean not null default true,
  t0 numeric, t1 numeric, t2 numeric,
  captured_at     timestamptz not null default now()
);

create table if not exists sessions (
  id             uuid primary key default gen_random_uuid(),
  kind           session_kind not null,
  patient_id     uuid references patients(id) on delete cascade,
  b2c_profile_id uuid references profiles(id),
  therapist_id   uuid references therapists(id),
  protocol_code  text not null,
  duration_min   int not null,
  started_at     timestamptz not null,
  ended_at       timestamptz,
  vas_pre        numeric,
  vas_post       numeric,
  intervened     boolean not null default false,
  completed      boolean not null default true
);

create table if not exists rapid_notes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  phase       int not null,
  at_seconds  int not null,
  text        text not null
);

-- clinical diary: many dated notes per patient (therapist-only, see RLS below)
create table if not exists patient_notes (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  text        text not null,
  at          timestamptz not null default now(),
  edited_at   timestamptz
);
create index if not exists patient_notes_patient_idx on patient_notes (patient_id, at desc);

-- the PERCORSO: the three-month pathway the THERAPIST writes in the first
-- session. The app never composes one — it shows the next item and records
-- what was done. The patient reads their own plan and may only ever tick an
-- item off (done_at); everything else is the therapist's.
create table if not exists plan_items (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references patients(id) on delete cascade,
  position      int not null,
  protocol_code text not null,
  duration_min  int not null,
  week          int not null default 1,
  note          text,
  done_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists plan_items_patient_idx on plan_items (patient_id, position);
-- the therapist's framing of the whole pathway
alter table patients add column if not exists plan_title text;

-- RETIRED (app no longer reads or writes it). Chat between a patient and a
-- therapist was removed from every screen; the product decision is that the
-- only conversation is the one inside a live video session. The table, its
-- policies and its rows are LEFT IN PLACE on purpose: what people wrote to
-- each other is theirs, and deleting a clinical-adjacent history is not a
-- refactor. Drop it deliberately, with a retention decision behind it.
create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  sender      message_from not null,
  body        text not null,
  at          timestamptz not null default now(),
  read        boolean not null default false
);

create table if not exists reports (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  therapist_id  uuid not null references therapists(id),
  body          jsonb not null,
  signed_by_crp text,
  signed_at     timestamptz
);

create table if not exists clinical_events (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null,
  event_type  text not null,
  payload     jsonb not null default '{}',
  hash        text not null,
  at          timestamptz not null default now()
);

create table if not exists protocols (
  code         text primary key,
  family       text not null,
  title        text not null,
  blurb        text,
  phases       jsonb not null default '[]',
  versions     jsonb not null default '[]',
  enabled      boolean not null default true,
  source       text not null default 'seed',
  tenants      jsonb not null default '"all"',
  audio_ready  boolean not null default false,
  updated_at   timestamptz not null default now(),
  spec         jsonb,
  datasheet    jsonb,   -- canonical Protocol Datasheet workbook (xlsx imports)
  plain        jsonb,   -- PLAIN clip-level Timeline (new recommended format)
  asset_map    jsonb    -- Asset Library phase → storage-path assignments
);

-- defensive adds for databases created by an older setup.sql (create table if
-- not exists doesn't add columns to existing tables)
alter table protocols  add column if not exists spec jsonb;
alter table protocols  add column if not exists audio_ready boolean not null default false;
alter table protocols  add column if not exists datasheet jsonb;
alter table protocols  add column if not exists plain jsonb;
alter table protocols  add column if not exists asset_map jsonb;
-- the Sound Studio session saved onto a protocol (all multitrack edits)
alter table protocols  add column if not exists studio jsonb;
-- WHO the entry is for. 'clinical' = therapist-authored pathway material, kept
-- with its GL code and clinical title. 'library' = a general wellbeing audio a
-- person browses and starts alone, named after the moment it serves and never
-- presented as treatment. The two are never mixed in a query: this column is
-- the boundary between supervised and self-service material.
alter table protocols  add column if not exists audience text not null default 'clinical';
-- browse metadata for library entries (category, cover, tags)
alter table protocols  add column if not exists library jsonb;

-- TIME SIGNATURES. One protocol ships as a 6-, a 12- and a 24-minute session,
-- and each one is its own workbook and its own Studio session. They used to
-- share the single `plain` / `studio` columns, so publishing the 12-minute file
-- overwrote the other two — and rebuilding `versions` from that one workbook
-- deleted their attached audio with them. Each duration now has its own slot,
-- keyed "6" / "12" / "24"; `plain` and `studio` stay as the last-written mirror
-- so a client from before this change still finds something to open.
alter table protocols  add column if not exists plain_by_duration jsonb;
alter table protocols  add column if not exists studio_by_duration jsonb;

-- NAMING. `title` is the CLINICAL name (therapist- and admin-facing, it names a
-- therapeutic intent). `public_title` is the non-therapeutic name the PERSON
-- reads in the player: it says the moment, never a condition or a treatment.
-- Null → the clinical title is shown, which is what every row did before.
-- Setting it changes the LABEL only: the code, the family, the pathway and the
-- clinical record are untouched.
alter table protocols  add column if not exists public_title text;
alter table protocols  add column if not exists public_blurb text;

-- TAGS. Editorial metadata for finding and grouping published material (what it
-- is for, when it is used, how it is delivered). Never a clinical claim and
-- never a routing decision — the vocabulary lives in src/data/tags.ts.
alter table protocols  add column if not exists tags jsonb not null default '[]';

-- LANGUAGES. The app is read in Italian, Portuguese and English; its protocols
-- were written in whichever language the PO authored them in, so switching the
-- interface gave a person a translated app around an untranslated library.
-- This is the overlay: { "it": { "title": …, "publicTitle": …, "publicBlurb": … },
-- "pt-BR": { … } }, per language and per field. The columns above stay the
-- source of truth and are what a row shows when a language has nothing.
alter table protocols  add column if not exists i18n jsonb not null default '{}';

create table if not exists audit_events (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  actor     text not null,
  action    text not null,
  target    text,
  detail    text
);

-- B2C → therapist intake: an employee asks for a session; a therapist accepts,
-- which creates the linked patient record. Requester name/email are denormalized
-- at insert so therapists can read the queue without any grant on profiles.
create table if not exists session_requests (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  company_id      text references companies(id),
  requester_name  text not null,
  requester_email text,
  note            text,
  status          text not null default 'open',   -- 'open' | 'claimed'
  claimed_by      uuid references therapists(id),
  patient_id      uuid references patients(id),
  created_at      timestamptz not null default now()
);

-- scheduling: the therapist's weekly availability template + booked visits
create table if not exists therapist_availability (
  therapist_id uuid primary key references therapists(id) on delete cascade,
  slots        jsonb not null default '[]',  -- [{"weekday":1,"hhmm":"09:00"}] 0=Sun
  updated_at   timestamptz not null default now()
);

create table if not exists appointments (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null references therapists(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  patient_name  text not null,
  company_id    text references companies(id),
  starts_at     timestamptz not null,
  duration_min  int not null default 50,
  status        text not null default 'booked',  -- 'booked' | 'cancelled' | 'done'
  created_at    timestamptz not null default now(),
  unique (therapist_id, starts_at)
);

create table if not exists psychosocial_responses (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  company_id  text references companies(id),
  team        text,
  period      text not null,                 -- e.g. 'Q3 2026'
  dims        jsonb not null default '{}',   -- { demands:'high', pace:'moderate', ... }
  outcomes    jsonb not null default '{}',   -- { stress:true, anxiety:false, burnout:false }
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Helper functions (BEFORE any policy that uses them)
-- ---------------------------------------------------------------------------
create or replace function current_profile() returns uuid
  language sql stable security definer set search_path = public as
  $$ select id from profiles where auth_uid = auth.uid() $$;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from profiles where auth_uid = auth.uid() and role = 'admin') $$;

create or replace function my_company_id() returns text
  language sql stable security definer set search_path = public as
  $$ select company_id from profiles where auth_uid = auth.uid() $$;

-- The patient rows that BELONG to the signed-in consumer (their own record in
-- some therapist's roster). SECURITY DEFINER on purpose: a policy's subquery is
-- itself subject to RLS, and a consumer cannot read `patients` — without this
-- the pathway policies below would always match zero rows. It returns ids only,
-- so nothing clinical leaks through it.
create or replace function my_patient_ids() returns setof uuid
  language sql stable security definer set search_path = public as
  $$ select id from patients where b2c_profile_id = current_profile() $$;

-- ---------------------------------------------------------------------------
-- 4. Row-level security — enable everywhere, then per-table policies.
--    Policies are dropped and recreated so this file stays re-runnable.
-- ---------------------------------------------------------------------------
alter table profiles               enable row level security;
alter table therapists             enable row level security;
alter table patients               enable row level security;
alter table patient_consents       enable row level security;
alter table goals                  enable row level security;
alter table scores                 enable row level security;
alter table sessions               enable row level security;
alter table rapid_notes            enable row level security;
alter table messages               enable row level security;
alter table patient_notes          enable row level security;
alter table plan_items             enable row level security;
alter table reports                enable row level security;
alter table clinical_events        enable row level security;
alter table companies              enable row level security;
alter table protocols              enable row level security;
alter table audit_events           enable row level security;
alter table psychosocial_responses enable row level security;

-- profiles: self-service (sign-up + own lookup) + admin management ----------
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (auth_uid = auth.uid());
drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert with check (auth_uid = auth.uid());
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());
drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles
  for all using (is_admin()) with check (is_admin());

-- therapists: own row (sign-up + own status) + admin review ------------------
drop policy if exists therapists_select_own on therapists;
create policy therapists_select_own on therapists
  for select using (id = current_profile());
drop policy if exists therapists_insert_own on therapists;
create policy therapists_insert_own on therapists
  for insert with check (id = current_profile());
drop policy if exists therapists_admin on therapists;
create policy therapists_admin on therapists
  for all using (is_admin()) with check (is_admin());
-- NOTE: approval (pending → approved) is privileged: admin console or dashboard.
--
-- A clinician has no UPDATE policy on their own row, deliberately: the one
-- column that must never be self-served is `status`. Submitting credentials
-- still has to write two others, so it goes through this function instead —
-- it sets the number and the documents, and always sets status back to
-- 'pending'. Editing your own credentials therefore re-opens the review rather
-- than granting anything, and there is no argument that can approve you.
create or replace function submit_credentials(p_crp text, p_docs jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid;
begin
  me := current_profile();
  if me is null then
    raise exception 'not signed in';
  end if;
  update therapists
     set crp           = coalesce(nullif(btrim(p_crp), ''), crp),
         documents     = coalesce(p_docs, documents),
         status        = 'pending',
         review_reason = null,
         decided_at    = null
   where id = me;
  if not found then
    raise exception 'no clinician record for this account';
  end if;
end $$;

grant execute on function submit_credentials(text, jsonb) to authenticated;

-- patients + clinical satellites: only the owning therapist ------------------
drop policy if exists therapist_owns_patients on patients;
create policy therapist_owns_patients on patients
  for all using (therapist_id = current_profile())
  with check (therapist_id = current_profile());

drop policy if exists consents_via_patient on patient_consents;
create policy consents_via_patient on patient_consents
  for all using (patient_id in (select id from patients where therapist_id = current_profile()))
  with check (patient_id in (select id from patients where therapist_id = current_profile()));

drop policy if exists goals_via_patient on goals;
create policy goals_via_patient on goals
  for all using (patient_id in (select id from patients where therapist_id = current_profile()))
  with check (patient_id in (select id from patients where therapist_id = current_profile()));

drop policy if exists scores_via_patient on scores;
create policy scores_via_patient on scores
  for all using (patient_id in (select id from patients where therapist_id = current_profile()))
  with check (patient_id in (select id from patients where therapist_id = current_profile()));

drop policy if exists patient_notes_via_patient on patient_notes;
create policy patient_notes_via_patient on patient_notes
  for all using (patient_id in (select id from patients where therapist_id = current_profile()))
  with check (patient_id in (select id from patients where therapist_id = current_profile()));

-- the pathway: the therapist who owns the patient writes it…
drop policy if exists plan_items_via_patient on plan_items;
create policy plan_items_via_patient on plan_items
  for all using (patient_id in (select id from patients where therapist_id = current_profile()))
  with check (patient_id in (select id from patients where therapist_id = current_profile()));
-- …and the person it was written for reads it. They may update a row (to tick
-- an item off) but never insert or delete one: the pathway's content stays the
-- clinician's, only its progress is the patient's.
drop policy if exists plan_items_patient_reads on plan_items;
create policy plan_items_patient_reads on plan_items
  for select using (patient_id in (select my_patient_ids()));
drop policy if exists plan_items_patient_ticks on plan_items;
create policy plan_items_patient_ticks on plan_items
  for update using (patient_id in (select my_patient_ids()))
  with check (patient_id in (select my_patient_ids()));

drop policy if exists messages_via_patient on messages;
create policy messages_via_patient on messages
  for all using (patient_id in (select id from patients where therapist_id = current_profile()))
  with check (patient_id in (select id from patients where therapist_id = current_profile()));

-- sessions: B2C user sees + writes their own; therapist manages their patients'
drop policy if exists b2c_own_sessions on sessions;
create policy b2c_own_sessions on sessions
  for select using (b2c_profile_id = current_profile());
drop policy if exists b2c_insert_own_sessions on sessions;
create policy b2c_insert_own_sessions on sessions
  for insert with check (kind = 'b2c' and b2c_profile_id = current_profile());
-- B2C↔B2B bridge: a therapist may READ the self-practice sessions of a linked
-- consumer profile ONLY while that patient's 'sharing' consent is granted.
-- Revoking the consent revokes the visibility, server-side.
drop policy if exists therapist_reads_linked_b2c_sessions on sessions;
create policy therapist_reads_linked_b2c_sessions on sessions
  for select using (
    kind = 'b2c'
    and b2c_profile_id in (
      select p.b2c_profile_id
      from patients p
      join patient_consents c
        on c.patient_id = p.id and c.kind = 'sharing' and c.granted
      where p.therapist_id = current_profile()
        and p.b2c_profile_id is not null
    )
  );

drop policy if exists therapist_patient_sessions on sessions;
create policy therapist_patient_sessions on sessions
  for all using (patient_id in (select id from patients where therapist_id = current_profile()))
  with check (patient_id in (select id from patients where therapist_id = current_profile()));

drop policy if exists rapid_notes_via_session on rapid_notes;
create policy rapid_notes_via_session on rapid_notes
  for all using (session_id in (
    select s.id from sessions s
    join patients p on p.id = s.patient_id
    where p.therapist_id = current_profile()))
  with check (session_id in (
    select s.id from sessions s
    join patients p on p.id = s.patient_id
    where p.therapist_id = current_profile()));

drop policy if exists reports_own_therapist on reports;
create policy reports_own_therapist on reports
  for all using (therapist_id = current_profile())
  with check (therapist_id = current_profile());

-- clinical_events: append-only (insert by any signed-in user, no read/update/delete)
drop policy if exists clinical_events_append on clinical_events;
create policy clinical_events_append on clinical_events
  for insert with check (auth.uid() is not null);

-- catalog: readable by any signed-in user; writable by admins ----------------
drop policy if exists protocols_read_all on protocols;
create policy protocols_read_all on protocols
  for select using (auth.uid() is not null);
drop policy if exists protocols_admin_write on protocols;
create policy protocols_admin_write on protocols
  for all using (is_admin()) with check (is_admin());

-- asset_meta: PO tag extensions per library file (PLAIN random-draw pools) ---
-- path = storage path in protocol-audio (e.g. assets/soundscape/lake/calm-01.mp3)
-- tags = extra draw tags beyond the folder/filename ones ('lago','fabbrica',…)
create table if not exists asset_meta (
  path        text primary key,
  tags        text[] not null default '{}',
  updated_at  timestamptz not null default now()
);
alter table asset_meta enable row level security;
drop policy if exists asset_meta_read_all on asset_meta;
create policy asset_meta_read_all on asset_meta
  for select using (auth.uid() is not null);
drop policy if exists asset_meta_admin_write on asset_meta;
create policy asset_meta_admin_write on asset_meta
  for all using (is_admin()) with check (is_admin());

-- app_settings: operator settings that must OUTLIVE one browser --------------
-- Today this holds exactly one row, key = 'tts.elevenlabs': the ElevenLabs API
-- key and the two chosen voices. It used to live only in localStorage, which
-- is per ORIGIN — so every new machine, every cleared profile and every Vercel
-- preview URL asked an operator to paste the key again. It is a CREDENTIAL:
-- admins only, for reading as well as writing.
create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table app_settings enable row level security;
drop policy if exists app_settings_admin on app_settings;
create policy app_settings_admin on app_settings
  for all using (is_admin()) with check (is_admin());

-- companies + audit: admins only ---------------------------------------------
drop policy if exists companies_admin on companies;
create policy companies_admin on companies
  for all using (is_admin()) with check (is_admin());
drop policy if exists audit_admin on audit_events;
create policy audit_admin on audit_events
  for all using (is_admin()) with check (is_admin());

-- session requests: employee creates + tracks their own; APPROVED therapists
-- see the open queue and claim. DB enforces the approval, not just the UI.
create or replace function is_approved_therapist() returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from therapists t
                    join profiles p on p.id = t.id
                    where p.auth_uid = auth.uid() and t.status = 'approved') $$;

alter table session_requests enable row level security;
drop policy if exists sr_insert_own on session_requests;
create policy sr_insert_own on session_requests
  for insert with check (profile_id = current_profile());

-- scheduling policies -----------------------------------------------------
alter table therapist_availability enable row level security;
drop policy if exists ta_read_all on therapist_availability;
create policy ta_read_all on therapist_availability
  for select using (auth.uid() is not null);
drop policy if exists ta_own_write on therapist_availability;
create policy ta_own_write on therapist_availability
  for all using (therapist_id = current_profile())
  with check (therapist_id = current_profile());

alter table appointments enable row level security;
drop policy if exists ap_patient_own on appointments;
create policy ap_patient_own on appointments
  for select using (profile_id = current_profile());
drop policy if exists ap_therapist_own on appointments;
create policy ap_therapist_own on appointments
  for select using (therapist_id = current_profile());
drop policy if exists ap_patient_book on appointments;
create policy ap_patient_book on appointments
  for insert with check (profile_id = current_profile());
drop policy if exists ap_update_involved on appointments;
create policy ap_update_involved on appointments
  for update using (profile_id = current_profile() or therapist_id = current_profile())
  with check (profile_id = current_profile() or therapist_id = current_profile());
drop policy if exists sr_select_own on session_requests;
create policy sr_select_own on session_requests
  for select using (profile_id = current_profile());
drop policy if exists sr_therapist_read on session_requests;
create policy sr_therapist_read on session_requests
  for select using (is_approved_therapist());
drop policy if exists sr_therapist_claim on session_requests;
create policy sr_therapist_claim on session_requests
  for update using (is_approved_therapist())
  with check (claimed_by = current_profile());

-- psychosocial: an employee may INSERT their own response. NOBODY selects the
-- base rows from the client — HR reaches aggregates only via nr1_report().
drop policy if exists psychosocial_insert_own on psychosocial_responses;
create policy psychosocial_insert_own on psychosocial_responses
  for insert with check (profile_id = current_profile());

-- ---------------------------------------------------------------------------
-- 5. nr1_report() — the ONE call the employer dashboard makes.
--    SECURITY DEFINER so it can read the source rows; it returns ONLY
--    aggregates for the caller's company, with k-anonymity suppression.
--    Ported 1:1 from src/employer/aggregate.ts (the reference implementation):
--      • overall band per respondent: ≥3 high dims → high;
--        ≥1 high or ≥4 moderate → moderate; else low
--      • per-dimension band splits
--      • outcome prevalence (% elevated) with delta vs the previous cycle
--      • per-team splits, suppressed under k
--      • high-risk trend across cycles
--    Consent: submitting the assessment is the consent act recorded by the
--    employee flow; if the respondent is additionally linked to a patient row
--    with a REVOKED 'aggregates' consent, they are excluded.
-- ---------------------------------------------------------------------------
create or replace function nr1_report()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  cid         text := my_company_id();
  k           int  := 5;
  cname       text;
  eligible_n  int;
  cur_period  text;
  prev_period text;
  result      jsonb;
begin
  if cid is null then
    raise exception 'This account has no company bound. Run the HR binding statement at the bottom of supabase/seed_demo.sql.';
  end if;

  select name into cname from companies where id = cid;
  select count(*) into eligible_n from profiles where company_id = cid and active;

  -- newest two assessment cycles, ordered by 'Q<n> YYYY'
  select max(period) filter (where rn = 1), max(period) filter (where rn = 2)
    into cur_period, prev_period
  from (
    select period, row_number() over (
      order by coalesce(substring(period from '(\d{4})')::int, 0) * 4
             + coalesce(substring(period from 'Q([1-4])')::int, 0) desc) as rn
    from (select distinct period from psychosocial_responses where company_id = cid) p
  ) ranked
  where rn <= 2;

  if cur_period is null then
    return jsonb_build_object(
      'company', coalesce(cname, cid), 'period', '—',
      'eligible', coalesce(eligible_n, 0), 'respondents', 0, 'minCellSize', k,
      'overall', jsonb_build_object('low', 0, 'moderate', 0, 'high', 0),
      'dimensions', '[]'::jsonb, 'outcomes', '[]'::jsonb,
      'teams', '[]'::jsonb, 'trend', '[]'::jsonb,
      'generatedAt', (extract(epoch from now()) * 1000)::bigint);
  end if;

  -- one statement, CTEs only (no temp tables — safe under PostgREST/RPC)
  with base as (
    select r.profile_id, coalesce(r.team, '—') as team, r.period, r.dims, r.outcomes,
           (select count(*) from jsonb_each_text(r.dims) d where d.value = 'high')     as n_high,
           (select count(*) from jsonb_each_text(r.dims) d where d.value = 'moderate') as n_mod
    from psychosocial_responses r
    where r.company_id = cid
      and not exists (
        select 1 from patients p
        join patient_consents pc on pc.patient_id = p.id
        where p.b2c_profile_id = r.profile_id
          and pc.kind = 'aggregates' and pc.granted = false)
  ), banded as (
    select b.*, case when n_high >= 3 then 'high'
                     when n_high >= 1 or n_mod >= 4 then 'moderate'
                     else 'low' end as band
    from base b
  )
  select jsonb_build_object(
    'company', coalesce(cname, cid),
    'period', cur_period,
    'eligible', greatest(coalesce(eligible_n, 0), (select count(*) from banded where period = cur_period)),
    'respondents', (select count(*) from banded where period = cur_period),
    'minCellSize', k,

    'overall', (
      select jsonb_build_object(
        'low',      count(*) filter (where band = 'low'),
        'moderate', count(*) filter (where band = 'moderate'),
        'high',     count(*) filter (where band = 'high'))
      from banded where period = cur_period),

    'dimensions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', d.key, 'label', d.label, 'about', d.about,
        'split', (
          select jsonb_build_object(
            'low',      count(*) filter (where b.dims ->> d.key = 'low'),
            'moderate', count(*) filter (where b.dims ->> d.key = 'moderate'),
            'high',     count(*) filter (where b.dims ->> d.key = 'high'))
          from banded b where b.period = cur_period
        )) order by d.ord), '[]'::jsonb)
      from (values
        (1, 'demands',       'Work demands',        'Workload and cognitive/emotional load'),
        (2, 'pace',          'Pace & time pressure','Deadlines and pace of work'),
        (3, 'balance',       'Work–life balance',   'Boundaries between work and personal time'),
        (4, 'recognition',   'Recognition',         'Reward and acknowledgement for effort'),
        (5, 'support_mgr',   'Manager support',     'Guidance and backing from leadership'),
        (6, 'control',       'Control & autonomy',  'Influence over how work is done'),
        (7, 'role',          'Role clarity',        'Clear expectations and responsibilities'),
        (8, 'relationships', 'Relationships',       'Peer support and workplace conflict')
      ) as d(ord, key, label, about)),

    'outcomes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', o.key, 'label', o.label,
        'elevatedPct', o.cur_pct,
        'deltaPct', o.cur_pct - coalesce(o.prev_pct, o.cur_pct)) order by o.ord), '[]'::jsonb)
      from (
        select v.ord, v.key, v.label,
          coalesce((select round(100.0 * count(*) filter (where (b.outcomes ->> v.key)::boolean) / nullif(count(*), 0))
                    from banded b where b.period = cur_period), 0)::int as cur_pct,
          (select round(100.0 * count(*) filter (where (b.outcomes ->> v.key)::boolean) / nullif(count(*), 0))
           from banded b where b.period = prev_period)::int as prev_pct
        from (values
          (1, 'stress',  'Perceived stress'),
          (2, 'anxiety', 'Anxiety symptoms'),
          (3, 'burnout', 'Burnout risk')
        ) as v(ord, key, label)
      ) o),

    'teams', (
      select coalesce(jsonb_agg(
        case when tm.n < k then
          jsonb_build_object('team', tm.team, 'respondents', tm.n, 'suppressed', true)
        else
          jsonb_build_object('team', tm.team, 'respondents', tm.n, 'suppressed', false,
            'split', jsonb_build_object('low', tm.n_low, 'moderate', tm.n_mod, 'high', tm.n_high))
        end order by tm.team), '[]'::jsonb)
      from (
        select team, count(*) as n,
               count(*) filter (where band = 'low')      as n_low,
               count(*) filter (where band = 'moderate') as n_mod,
               count(*) filter (where band = 'high')     as n_high
        from banded where period = cur_period group by team
      ) tm),

    'trend', (
      select coalesce(jsonb_agg(jsonb_build_object('period', tr.period, 'highPct', tr.high_pct)
               order by tr.rank), '[]'::jsonb)
      from (
        select b.period,
               coalesce(substring(b.period from '(\d{4})')::int, 0) * 4
             + coalesce(substring(b.period from 'Q([1-4])')::int, 0) as rank,
               coalesce(round(100.0 * count(*) filter (where b.band = 'high') / nullif(count(*), 0)), 0)::int as high_pct
        from banded b group by b.period
      ) tr),

    'generatedAt', (extract(epoch from now()) * 1000)::bigint
  ) into result;

  return result;
end;
$$;

revoke all on function nr1_report() from public;
grant execute on function nr1_report() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Catalog cleanup — the catalog is admin-curated: ONLY imported protocols
--    live in it. Earlier setups seeded 5 demo entries; remove them (PO
--    decision: start clean, protocols arrive via the PLAIN import). Imported
--    protocols (source = 'imported') are never touched. Idempotent.
-- ---------------------------------------------------------------------------
delete from protocols where source = 'seed';


-- ---------------------------------------------------------------------------
-- 7. Storage: the protocol-audio bucket (rendered session WAVs).
--    Public-read so the player can stream; only admins write.
--    Guarded so the block is a no-op outside Supabase.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('protocol-audio', 'protocol-audio', true)
    on conflict (id) do nothing;

    execute 'drop policy if exists protocol_audio_admin_write on storage.objects';
    execute $pol$
      create policy protocol_audio_admin_write on storage.objects
        for all using (bucket_id = 'protocol-audio' and is_admin())
        with check (bucket_id = 'protocol-audio' and is_admin())
    $pol$;

    execute 'drop policy if exists protocol_audio_read on storage.objects';
    execute $pol$
      create policy protocol_audio_read on storage.objects
        for select using (bucket_id = 'protocol-audio')
    $pol$;

    -- avatars: every signed-in user may manage ONLY their own folder
    -- (path = <auth_uid>/avatar.jpg); everyone can read (public bucket)
    insert into storage.buckets (id, name, public)
    values ('avatars', 'avatars', true)
    on conflict (id) do nothing;

    execute 'drop policy if exists avatars_own_write on storage.objects';
    execute $pol$
      create policy avatars_own_write on storage.objects
        for all using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
        with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    $pol$;

    execute 'drop policy if exists avatars_read on storage.objects';
    execute $pol$
      create policy avatars_read on storage.objects
        for select using (bucket_id = 'avatars')
    $pol$;

    -- credentials: a diploma and a registration certificate are identity
    -- documents, so this bucket is PRIVATE (public = false) and read through
    -- short-lived signed URLs. A clinician writes and reads only their own
    -- folder (path = <auth_uid>/…); an admin reads every folder, because
    -- reviewing them is the whole point; nobody else sees anything.
    insert into storage.buckets (id, name, public)
    values ('credentials', 'credentials', false)
    on conflict (id) do nothing;

    execute 'drop policy if exists credentials_own on storage.objects';
    execute $pol$
      create policy credentials_own on storage.objects
        for all using (bucket_id = 'credentials' and (storage.foldername(name))[1] = auth.uid()::text)
        with check (bucket_id = 'credentials' and (storage.foldername(name))[1] = auth.uid()::text)
    $pol$;

    execute 'drop policy if exists credentials_admin_read on storage.objects';
    execute $pol$
      create policy credentials_admin_read on storage.objects
        for select using (bucket_id = 'credentials' and is_admin())
    $pol$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Connection codes: how a clinician takes someone on.
--
-- The therapist mints a code and gives it to a person; the person types it
-- into their app and the two are linked. The table and both functions were
-- called by the app and defined nowhere, so on a real database every code was
-- refused and a patient the therapist HAD connected never saw them.
create table if not exists therapist_codes (
  code         text primary key,
  therapist_id uuid not null references therapists(id) on delete cascade,
  label        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table therapist_codes enable row level security;
-- Only the clinician who owns a code can see or change it. A patient never
-- reads this table at all — redemption goes through the function below, which
-- is why it can stay closed.
drop policy if exists tc_owner_all on therapist_codes;
create policy tc_owner_all on therapist_codes
  for all using (therapist_id = current_profile())
  with check (therapist_id = current_profile());

-- Redeem one. Returns the link, and is idempotent: a person who types the
-- same code twice is linked once, not twice.
create or replace function redeem_therapist_code(p_code text)
  returns table (patient_id uuid, therapist_id uuid, therapist_name text, crp text)
  language plpgsql volatile security definer set search_path = public as $$
declare
  v_me    uuid := current_profile();
  v_th    uuid;
  v_pid   uuid;
  v_name  text;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;

  select c.therapist_id into v_th
    from therapist_codes c
   where upper(c.code) = upper(trim(p_code)) and c.active;
  if v_th is null then
    raise exception 'unknown code';
  end if;

  select p.id into v_pid
    from patients p
   where p.therapist_id = v_th and p.b2c_profile_id = v_me
   limit 1;

  if v_pid is null then
    select p.name into v_name from profiles p where p.id = v_me;
    insert into patients (therapist_id, b2c_profile_id, name, reason)
    values (v_th, v_me, coalesce(v_name, 'Paziente'), 'Connected by code')
    returning id into v_pid;
  end if;

  return query
    select v_pid, v_th, p.name, t.crp
      from profiles p
      join therapists t on t.id = p.id
     where p.id = v_th;
end $$;

-- The link the signed-in person already has, if any. The app asks on every
-- start so a connection made from the clinician's side shows up here too.
create or replace function my_therapist_link()
  returns table (patient_id uuid, therapist_id uuid, therapist_name text, crp text, since timestamptz)
  language sql stable security definer set search_path = public as $$
  select pt.id, pt.therapist_id, pr.name, th.crp, pt.created_at
    from patients pt
    join profiles pr on pr.id = pt.therapist_id
    left join therapists th on th.id = pt.therapist_id
   where pt.b2c_profile_id = current_profile()
   order by pt.created_at desc
   limit 1
$$;

revoke all on function redeem_therapist_code(text) from public;
revoke all on function my_therapist_link() from public;
grant execute on function redeem_therapist_code(text) to authenticated;
grant execute on function my_therapist_link() to authenticated;

-- ---------------------------------------------------------------------------
-- Booking, both directions.
--
-- The app has called these two since booking was written; neither existed in
-- this file, so on a real database `rpc('booked_times')` and
-- `rpc('my_appointments')` both failed. The first is survivable — every slot
-- looks free and the unique index refuses the clash. The second is not: the
-- appointment a person had just booked came back as null, so their Terapeuta
-- tab showed no session, the join window never opened, and the booking read
-- as "nothing happened".

-- Which instants are taken, and NOTHING else about them. A patient must see
-- that 14:00 is gone without learning who took it: no ids, no names, no rows.
create or replace function booked_times(t_id uuid, from_at timestamptz, to_at timestamptz)
  returns table (starts_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select a.starts_at
    from appointments a
   where a.therapist_id = t_id
     and a.status = 'booked'
     and a.starts_at >= from_at
     and a.starts_at <  to_at
$$;

-- The signed-in person's own appointments, with the clinician's NAME.
-- SECURITY DEFINER because that name lives in `profiles` behind a join the
-- patient cannot make: an inner join to a table RLS hides drops the parent
-- row, which is how a booking that was written came back as nothing.
create or replace function my_appointments()
  returns table (
    id uuid, therapist_id uuid, therapist_name text,
    starts_at timestamptz, duration_min int, status text
  )
  language sql stable security definer set search_path = public as $$
  select a.id, a.therapist_id, p.name, a.starts_at, a.duration_min, a.status
    from appointments a
    left join profiles p on p.id = a.therapist_id
   where a.profile_id = current_profile()
   order by a.starts_at
$$;

revoke all on function booked_times(uuid, timestamptz, timestamptz) from public;
revoke all on function my_appointments() from public;
grant execute on function booked_times(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function my_appointments() to authenticated;

-- ---------------------------------------------------------------------------
-- PostgREST schema-cache reload. Supabase's API layer caches the table schema;
-- after the ALTERs above (protocols.plain, asset_meta) a stale cache yields
-- "Could not find the 'plain' column of 'protocols' in the schema cache" on
-- the first Publish. This notify forces the reload immediately — no waiting,
-- no project restart. Safe to re-run.
notify pgrst, 'reload schema';
