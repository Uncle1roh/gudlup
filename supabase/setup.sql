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
-- 'hr_admin' is the company-side role. The app has written it at sign-up since
-- the corporate dashboard shipped, and `is_hr()` below compares against it, but
-- the enum never had the value: on a real database an HR sign-up failed with
-- "invalid input value for enum user_role" and every policy calling is_hr()
-- raised instead of returning false. Added separately because ADD VALUE cannot
-- be used in the same transaction that creates the type.
do $$ begin alter type user_role add value if not exists 'hr_admin'; exception when duplicate_object then null; end $$;
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

-- The policies just below call is_admin() and my_company_id(), which §3 defines
-- four hundred lines later. On a database that already had them this never
-- showed; on a FRESH one the file stopped here ("function is_admin() does not
-- exist"). Defined now as well; §3 re-creates them identically.
create or replace function current_profile() returns uuid
  language sql stable security definer set search_path = public as
  $$ select id from profiles where auth_uid = auth.uid() $$;
create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from profiles where auth_uid = auth.uid() and role = 'admin') $$;
create or replace function my_company_id() returns text
  language sql stable security definer set search_path = public as
  $$ select company_id from profiles where auth_uid = auth.uid() $$;

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

-- How the guided audio addresses this person: 'm' → "sei pronto", 'f' → "sei
-- pronta". Italian and Portuguese make it audible, so the recording has to
-- know which one to play. NULL means nobody has been asked yet, which is
-- every account that existed before the female scripts did; the app asks
-- those once. It selects a recording and nothing else reads it.
alter table profiles add column if not exists addressed_as text;
do $$ begin
  alter table profiles add constraint profiles_addressed_as_ck check (addressed_as in ('m', 'f'));
exception when duplicate_object then null; end $$;

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
-- The free / reduced-cost flag on a self-service entry. saveProtocol writes
-- it unconditionally, and PostgREST rejects the whole row over one unknown
-- column — so a missing column here stops EVERY protocol save, not just the
-- priced ones. See supabase/13-offers-and-import-stamps.sql.
alter table protocols  add column if not exists offer jsonb;
-- When each duration's timeline was last replaced by a full import, so a
-- Studio session saved from the clips it replaced can be recognised as stale
-- WITHOUT being deleted. The delete came first and destroyed rack work on
-- four protocols; this is what replaced it.
alter table protocols  add column if not exists plain_imported_at jsonb;
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

-- The feature switches are the one row everybody may READ.
--
-- They turn the player, booking or the video call off while the app is
-- running, without a deployment. A kill switch only an admin can read is not
-- a kill switch: the person whose player is broken is not an admin. So this
-- policy grants a select on exactly one key, by name, to everybody including
-- `anon` — the switches are consulted before sign-in. Every other row, the
-- voice keys among them, stays admin-only: policies are OR'd, and this one
-- cannot reach past its own `key =` test.
drop policy if exists app_settings_read_flags on app_settings;
create policy app_settings_read_flags on app_settings
  for select using (key = 'feature_flags');

-- All three areas on. Only ever written by an admin in the console.
insert into app_settings (key, value)
values ('feature_flags', '{"player": true, "booking": true, "video": true}'::jsonb)
on conflict (key) do nothing;

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
-- Dropped first: script 5 created this with an extra `patient_name` column,
-- and Postgres refuses to change a function's result columns in place
-- ("cannot change return type of existing function"). Nothing depends on it.
drop function if exists my_appointments();
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
-- PROMO CODES
--
-- An admin mints a code with a discount percentage; a person types it at
-- registration and the account carries it. The profile keeps a SNAPSHOT of the
-- code and its percentage, so deleting a code stops new sign-ups using it and
-- never changes what an existing account was promised.
--
-- The percentage on a profile is written by the trigger, never by the client:
-- the browser sends the code, the database looks up what it is worth. A person
-- cannot change either column on their own profile after sign-up.
create table if not exists promo_codes (
  code         text primary key check (code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  discount_pct int  not null check (discount_pct between 1 and 100),
  created_at   timestamptz not null default now(),
  created_by   text
);
alter table promo_codes enable row level security;
drop policy if exists promo_codes_admin on promo_codes;
create policy promo_codes_admin on promo_codes
  for all using (is_admin()) with check (is_admin());

alter table profiles add column if not exists promo_code text;
alter table profiles add column if not exists promo_discount_pct int;

-- What a code is worth, or null. Callable BEFORE an account exists (anon), so
-- the sign-up form can answer while the person is still typing; it reveals the
-- percentage of one code at a time and nothing else about the table.
create or replace function check_promo_code(p_code text) returns int
  language sql stable security definer set search_path = public as $$
  select discount_pct from promo_codes where code = upper(trim(p_code))
$$;
revoke all on function check_promo_code(text) from public;
grant execute on function check_promo_code(text) to anon, authenticated;

create or replace function profiles_promo_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- after sign-up only an admin may touch the promo columns
  if tg_op = 'UPDATE' and not is_admin() then
    new.promo_code := old.promo_code;
    new.promo_discount_pct := old.promo_discount_pct;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.promo_code is not distinct from old.promo_code then
    return new;
  end if;
  if new.promo_code is null or trim(new.promo_code) = '' then
    new.promo_code := null;
    new.promo_discount_pct := null;
    return new;
  end if;
  new.promo_code := upper(trim(new.promo_code));
  select discount_pct into new.promo_discount_pct from promo_codes where code = new.promo_code;
  if new.promo_discount_pct is null then
    raise exception 'unknown promo code' using errcode = 'P0001', hint = 'PROMO_UNKNOWN';
  end if;
  return new;
end $$;
drop trigger if exists profiles_promo_guard on profiles;
create trigger profiles_promo_guard
  before insert or update on profiles
  for each row execute function profiles_promo_guard();

-- ---------------------------------------------------------------------------
-- PARTNER PRODUCTS
--
-- Offers from partner brands — a product, the discount on it, and how to get
-- it — written in the admin console and shown on the Partner tab of the
-- person's app. Nothing here is about a person: it is catalogue, like
-- explore_rails, so anyone signed in may read the ACTIVE rows and only an
-- admin may write. (The app currently shows the tab to admins only; opening
-- it to everyone needs no database change.)
create table if not exists partner_products (
  id           uuid primary key default gen_random_uuid(),
  partner      text not null,
  title        text not null,
  description  text,
  discount     text,
  promo_code   text,
  url          text check (url is null or url ~* '^https?://'),
  image_url    text check (image_url is null or image_url ~* '^https?://'),
  active       boolean not null default true,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table partner_products enable row level security;
drop policy if exists partner_products_read on partner_products;
create policy partner_products_read on partner_products
  for select using (auth.uid() is not null and active);
drop policy if exists partner_products_admin on partner_products;
create policy partner_products_admin on partner_products
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- LEGAL FRAMEWORK (v5, Path A) — the same block as supabase/11-legal-framework.sql.
-- Age and market on the profile, versioned acceptances, a consent history,
-- data-subject requests, the notice-and-action and complaints queues, the
-- legal-text version register, crisis resources as configuration, the content
-- tier and claims gate, the professional's attestation / insurance / terms /
-- consent template, the informed-consent gate, the lobby location and account
-- deletion. See the numbered script for the reasoning next to each table.

-- ---------------------------------------------------------------------------
-- WHO A PERSON IS, FOR LEGAL PURPOSES
--
-- Date of birth is what the 18+ gate checks; the country is what the person
-- said at sign-up; the market is what the country maps to and is the ONE
-- field every market-dependent screen reads (crisis numbers, withdrawal
-- period, governing annex, supervisory authority). A personal e-mail is the
-- address a sponsored person gives so nothing is ever written to their work
-- address (SPN-12). None of these is ever shown to a sponsor.
alter table profiles add column if not exists birth_date     date;
alter table profiles add column if not exists country        text;
alter table profiles add column if not exists market         text check (market is null or market in ('BR','EU'));
alter table profiles add column if not exists personal_email text;

-- ---------------------------------------------------------------------------
-- LEGAL TEXT VERSIONS (ADM-06, LEG-07)
--
-- The texts themselves ship in the app (src/legal/); this register says which
-- version was in force when, in which language, and what changed. An
-- acceptance row points at a version string, so a dispute about which text
-- applied on a given day is answered from records. Readable by anyone —
-- previous versions must be viewable without login (LEG-06).
create table if not exists legal_versions (
  id             uuid primary key default gen_random_uuid(),
  doc_id         text not null,                 -- 'terms' | 'D-03-BR' | …
  version        text not null,
  locale         text not null default 'en',
  in_force_from  date not null,
  in_force_to    date,
  changelog      text,
  created_at     timestamptz not null default now(),
  created_by     text,
  unique (doc_id, version, locale)
);
alter table legal_versions enable row level security;
drop policy if exists legal_versions_read on legal_versions;
create policy legal_versions_read on legal_versions for select using (true);
drop policy if exists legal_versions_admin on legal_versions;
create policy legal_versions_admin on legal_versions
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- ACCEPTANCES (LEG-01, LEG-02, LEG-09, M2P-02, M2R-05, SPN-07)
--
-- One row per affirmative act: accepting the Terms, ticking "not for
-- emergencies", the first-booking acknowledgement, the professional terms,
-- the sponsor's D-09 acknowledgement. Append-only: a person can add a row,
-- never change or remove one — the burden of proving acceptance sits with
-- the controller, and a mutable log proves nothing.
create table if not exists legal_acceptances (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  doc_id       text not null,                   -- 'terms' | 'crisis-ack' | 'D-09' | 'professional' | 'BKG-1' | 'renewal'
  version      text not null,
  locale       text not null,
  channel      text not null default 'app',     -- 'app' | 'web' | 'email'
  user_agent   text,
  accepted_at  timestamptz not null default now()
);
create index if not exists legal_acceptances_profile on legal_acceptances(profile_id, doc_id);
alter table legal_acceptances enable row level security;
drop policy if exists legal_acceptances_own_read on legal_acceptances;
create policy legal_acceptances_own_read on legal_acceptances
  for select using (profile_id = current_profile() or is_admin());
drop policy if exists legal_acceptances_own_insert on legal_acceptances;
create policy legal_acceptances_own_insert on legal_acceptances
  for insert with check (profile_id = current_profile());

-- ---------------------------------------------------------------------------
-- CONSENT HISTORY (LEG-04, LEG-05, DSR domain B)
--
-- Granular, never bundled, withdrawable without closing the account. Every
-- grant and every withdrawal is its own row carrying the exact wording the
-- person saw; the current state is the latest row per purpose. Append-only
-- for the same reason as the acceptances.
create table if not exists consent_events (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  purpose     text not null,                    -- 'measurement' | 'aggregate' | 'notifications' | 'therapist_bridge' | 'marketing' | 'testimonial' | 'research'
  granted     boolean not null,
  wording     text not null,
  locale      text not null,
  channel     text not null default 'app',
  at          timestamptz not null default now()
);
create index if not exists consent_events_profile on consent_events(profile_id, purpose, at desc);
alter table consent_events enable row level security;
drop policy if exists consent_events_own_read on consent_events;
create policy consent_events_own_read on consent_events
  for select using (profile_id = current_profile() or is_admin());
drop policy if exists consent_events_own_insert on consent_events;
create policy consent_events_own_insert on consent_events
  for insert with check (profile_id = current_profile());

-- ---------------------------------------------------------------------------
-- DATA-SUBJECT REQUESTS (DAT-01, DAT-04, DSR spec 6.3)
--
-- The clock starts when the request arrives, not when it is triaged: due_at
-- is fifteen calendar days from received_at for every user in every market.
-- A sponsor has no standing here — a request can only be filed by the
-- person, for the person.
create table if not exists data_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  kind         text not null check (kind in ('access','portability','rectification','deletion')),
  market       text,
  status       text not null default 'open' check (status in ('open','verified','delivered','closed','refused')),
  note         text,
  received_at  timestamptz not null default now(),
  due_at       timestamptz not null default (now() + interval '15 days'),
  verified_at  timestamptz,
  delivered_at timestamptz,
  handled_by   text,
  outcome      text
);
alter table data_requests enable row level security;
drop policy if exists data_requests_own on data_requests;
create policy data_requests_own on data_requests
  for select using (profile_id = current_profile() or is_admin());
drop policy if exists data_requests_own_insert on data_requests;
create policy data_requests_own_insert on data_requests
  for insert with check (profile_id = current_profile());
drop policy if exists data_requests_admin on data_requests;
create policy data_requests_admin on data_requests
  for update using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- REPORTS: NOTICE-AND-ACTION AND COMPLAINTS (ADM-04, ADM-05, Terms cl. 9 / 19)
--
-- A content report is assessed and actioned on extrajudicial notice (STF,
-- June 2025; DSA). A complaint is acknowledged in 2 working days and
-- answered in 10. Both are one table with a kind, because the intake, the
-- record and the log are the same shape.
create table if not exists content_reports (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('content','complaint')),
  reporter_id      uuid references profiles(id) on delete set null,
  reporter_email   text,
  subject          text not null,
  location         text,
  reason           text not null,
  status           text not null default 'received' check (status in ('received','acknowledged','assessing','actioned','dismissed','closed')),
  received_at      timestamptz not null default now(),
  acknowledged_at  timestamptz,
  decided_at       timestamptz,
  decided_by       text,
  decision         text
);
alter table content_reports enable row level security;
drop policy if exists reports_own_read on content_reports;
create policy reports_own_read on content_reports
  for select using (reporter_id = current_profile() or is_admin());
drop policy if exists reports_insert on content_reports;
create policy reports_insert on content_reports
  for insert with check (auth.uid() is not null);
drop policy if exists reports_admin on content_reports;
create policy reports_admin on content_reports
  for update using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- CRISIS RESOURCES AS CONFIGURATION (CRS-03, MN-24)
--
-- Numbers are edited here, not in a release. Each carries the date someone
-- last checked it and who; the console warns after 90 days. Readable by
-- anyone, including a person who is not signed in — the crisis sheet is on
-- the sign-in screen too.
create table if not exists crisis_resources (
  id                text primary key,
  market            text not null check (market in ('BR','EU')),
  position          int  not null default 0,
  label             text not null,
  number            text not null,
  hours             text,
  url               text,
  last_verified_at  timestamptz,
  verified_by       text,
  active            boolean not null default true,
  updated_at        timestamptz not null default now()
);
alter table crisis_resources enable row level security;
drop policy if exists crisis_resources_read on crisis_resources;
create policy crisis_resources_read on crisis_resources for select using (true);
drop policy if exists crisis_resources_admin on crisis_resources;
create policy crisis_resources_admin on crisis_resources
  for all using (is_admin()) with check (is_admin());
insert into crisis_resources (id, market, position, label, number, hours, url) values
  ('br-cvv',    'BR', 1, 'CVV',       '188', '24h · gratuito', 'https://cvv.org.br'),
  ('br-samu',   'BR', 2, 'SAMU',      '192', null, null),
  ('br-police', 'BR', 3, 'Polícia',   '190', null, null),
  ('eu-112',    'EU', 1, 'Emergenze', '112', null, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- CONTENT TIER AND CLAIMS GATE (ADM-02, ADM-03, M1-02, Part VII.4 / VII.6)
--
-- Every catalogue row carries the application tier — green, amber, red —
-- and the four-question sign-off. A red-tier row can never be published to
-- the self-guided library: the trigger refuses it, so the rule holds even
-- when the console is bypassed.
alter table protocols add column if not exists tier        text not null default 'green' check (tier in ('green','amber','red'));
alter table protocols add column if not exists claims_gate jsonb;

create or replace function protocols_tier_guard() returns trigger
  language plpgsql as $$
begin
  if new.tier = 'red' and coalesce(new.audience, 'clinical') = 'library' then
    raise exception 'red-tier content cannot be published to the self-guided library'
      using errcode = 'P0001', hint = 'TIER_RED_LIBRARY';
  end if;
  return new;
end $$;
drop trigger if exists protocols_tier_guard on protocols;
create trigger protocols_tier_guard
  before insert or update on protocols
  for each row execute function protocols_tier_guard();

-- ---------------------------------------------------------------------------
-- THE PROFESSIONAL'S OWN RECORD (M2R-01 to M2R-06, D-12)
--
-- verified_at is when a reviewer last confirmed the registration; the
-- patient-side profile prints it (PRF-1). practice_country and attested_at
-- are the territorial attestation; insurance_expires_at the cover; the
-- professional terms are accepted by version; the consent template is the
-- informed-consent form the professional writes and every patient accepts
-- before the first session (P3.2). None of it is clinical data.
alter table therapists add column if not exists verified_at            timestamptz;
alter table therapists add column if not exists registry               text;      -- 'CRP' | 'Ordine'
alter table therapists add column if not exists registry_region        text;
alter table therapists add column if not exists practice_country       text;
alter table therapists add column if not exists attested_at            timestamptz;
alter table therapists add column if not exists insurance_expires_at   date;
alter table therapists add column if not exists insurance_doc          text;
alter table therapists add column if not exists terms_version          text;
alter table therapists add column if not exists terms_accepted_at      timestamptz;
alter table therapists add column if not exists consent_template       jsonb;
alter table therapists add column if not exists consent_template_version int not null default 0;

-- A credential approval IS the verification: keep verified_at in step with
-- approved_at so the date the patient reads is the date a reviewer acted.
create or replace function therapists_verified_stamp() returns trigger
  language plpgsql as $$
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    new.approved_at := coalesce(new.approved_at, now());
    new.verified_at := now();
  end if;
  return new;
end $$;
drop trigger if exists therapists_verified_stamp on therapists;
create trigger therapists_verified_stamp
  before update on therapists
  for each row execute function therapists_verified_stamp();

-- What a patient may read about a professional they can book: the public
-- card. Exposes the registration line and nothing about the practice.
create or replace function professional_card(p_therapist uuid)
returns table (id uuid, name text, registration text, registry text, registry_region text, verified_at timestamptz, consent_template jsonb, consent_template_version int)
  language sql stable security definer set search_path = public as $$
  select t.id, p.name, t.crp, t.registry, t.registry_region, t.verified_at, t.consent_template, t.consent_template_version
  from therapists t join profiles p on p.id = t.id
  where t.id = p_therapist and t.status = 'approved'
$$;
revoke all on function professional_card(uuid) from public;
grant execute on function professional_card(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- INFORMED CONSENT (M2P-04, P3.2)
--
-- The professional's document, accepted by the person, versioned, with a
-- copy of what was accepted — a professional obligation of the professional
-- that the platform only gives a mechanism to. A session cannot be joined
-- until a row exists for the current template version.
create table if not exists patient_informed_consents (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references profiles(id) on delete cascade,
  therapist_id      uuid not null references therapists(id) on delete cascade,
  template_version  int  not null,
  template_copy     jsonb not null,
  accepted_at       timestamptz not null default now(),
  unique (profile_id, therapist_id, template_version)
);
alter table patient_informed_consents enable row level security;
drop policy if exists pic_own on patient_informed_consents;
create policy pic_own on patient_informed_consents
  for select using (profile_id = current_profile() or therapist_id = current_profile());
drop policy if exists pic_insert on patient_informed_consents;
create policy pic_insert on patient_informed_consents
  for insert with check (profile_id = current_profile());

-- Where the person is during a session, confirmed in the lobby so the
-- professional can get help to them in an emergency (M2P-06, M2R-10). Read by
-- that professional only, through the appointment they already own.
alter table appointments add column if not exists patient_location text;
alter table appointments add column if not exists location_confirmed_at timestamptz;

-- ---------------------------------------------------------------------------
-- SPONSOR ACKNOWLEDGEMENT (SPN-07) — recorded as a legal_acceptances row with
-- doc_id 'D-09' by the sponsor admin; nothing else to create.
-- COHORT THRESHOLD (SPN-02) — the number the contract states, on the company.
alter table companies add column if not exists min_cohort int not null default 25;

-- ---------------------------------------------------------------------------
-- ACCOUNT DELETION (DAT-06, D-11)
--
-- The person's own rows go; what the law requires stays. A professional's
-- clinical record is the professional's (P3.3): the patient row is detached
-- from the account rather than destroyed, and its retention is the
-- professional's regulatory minimum. Billing and audit rows are not touched
-- because there are none on the person. The auth user is removed last so a
-- failed step never leaves a login with no profile.
create or replace function delete_my_account() returns void
  language plpgsql security definer set search_path = public as $$
declare
  pid uuid := current_profile();
  uid uuid := auth.uid();
begin
  if pid is null then raise exception 'not signed in'; end if;
  update patients set b2c_profile_id = null where b2c_profile_id = pid;
  delete from sessions where b2c_profile_id = pid;
  delete from profiles where id = pid;     -- cascades: consents, acceptances, requests, appointments, informed consents
  delete from auth.users where id = uid;
end $$;
revoke all on function delete_my_account() from public;
grant execute on function delete_my_account() to authenticated;

-- ONB-02 / D-11: an admin suspends and deletes a person found to be under 18.
create or replace function admin_delete_profile(p_profile uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  select auth_uid into uid from profiles where id = p_profile;
  update patients set b2c_profile_id = null where b2c_profile_id = p_profile;
  delete from sessions where b2c_profile_id = p_profile;
  delete from profiles where id = p_profile;
  if uid is not null then delete from auth.users where id = uid; end if;
end $$;
revoke all on function admin_delete_profile(uuid) from public;
grant execute on function admin_delete_profile(uuid) to authenticated;

-- The person may correct their own name, personal e-mail, country and
-- locale (DAT-07). The existing profiles_update_own policy already allows
-- the row update; market follows country through this guard so a screen can
-- never set the two apart.
create or replace function profiles_market_guard() returns trigger
  language plpgsql as $$
begin
  if new.country = 'BR' then new.market := 'BR';
  elsif new.country = 'IT' then new.market := 'EU';
  end if;
  return new;
end $$;
drop trigger if exists profiles_market_guard on profiles;
create trigger profiles_market_guard
  before insert or update on profiles
  for each row execute function profiles_market_guard();

-- ---------------------------------------------------------------------------
/* ===========================================================================
   Top sessions — the only cross-user aggregate the library exposes

   `sessions` is deliberately per-principal: a person reads their own rows, a
   therapist reads a consenting patient's, and there is no admin select policy
   at all. A "most listened" shelf cannot be built from the client for exactly
   that reason, which is correct — so this is the one narrow hole, cut on
   purpose and no wider than the shelf needs.

   What leaves the function is a LIST OF PROTOCOL CODES. No counts, no
   profiles, no dates. The ranking is the product; the numbers behind it are
   nobody's business and are not returned.

   k-anonymity, the house rule from NR-1 reporting, applies here too. A
   protocol needs FIVE distinct listeners before it can be named. On a
   small or young install that means the shelf is short or empty, which is the
   right failure: with three users and no threshold, "most listened" is a
   readout of what one identifiable person has been playing.

   Ranked by distinct listeners first and plays second, so one enthusiast
   cannot push a session to the top of a shelf the whole library sees.

   Ninety days, not all time: a shelf that cannot change is not a chart.
   =========================================================================== */
create or replace function top_sessions(p_limit int default 10)
  returns table (protocol_code text)
  language sql stable security definer set search_path = public as $$
  select s.protocol_code
    from sessions s
   where s.kind = 'b2c'
     and s.completed
     and s.b2c_profile_id is not null
     and s.ended_at is not null
     and s.ended_at >= now() - interval '90 days'
   group by s.protocol_code
  having count(distinct s.b2c_profile_id) >= 5
   order by count(distinct s.b2c_profile_id) desc, count(*) desc, s.protocol_code
   limit greatest(1, least(coalesce(p_limit, 10), 50))
$$;

-- Signed-in readers only. `anon` must not have it: the shelf is for people
-- using the app, not for anyone holding the public key.
revoke execute on function top_sessions(int) from public, anon;
grant execute on function top_sessions(int) to authenticated;

-- ---------------------------------------------------------------------------
-- The assessment queue (see supabase/15-assessments.sql for the full notes)
--
-- DASS-21, CBI and the session VAS lived in one localStorage key. Clearing a
-- browser destroyed them and two devices disagreed. Append-only is enforced
-- by the triggers below rather than by the client that happens to be writing.
-- ---------------------------------------------------------------------------
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

-- ============================================================================
-- GAMIFICATION · 1 — THE LOOPS ECONOMY            (docs/gamification/SPEC.md §2)
--
-- The same block is supabase/16-gamification-economy.sql, for a live database.
--
-- Points measure care: they come only from listening, are never spent and
-- never decrease. Loops are the currency: they come from Points plus bonuses,
-- and are kept in integer centiloops (1 Loop = 100). The client never sends
-- an amount (GAM-R8): a session row goes in, and credit_session() — fired by
-- a trigger — works out what it earns and writes it to two append-only
-- ledgers. The same rules are in src/gamification/economy.ts for the mock
-- provider; src/gamification/__fixtures__/economy.json holds the two
-- together (supabase/tests/economy_parity.sql + tools/test-gam-economy.ts).
--
--   GAM-R1  nothing decreases: the ledgers take no UPDATE, and no client role
--           can write them at all
--   GAM-R3  an SOS session earns nothing and is not even counted
--   GAM-R9  a company multiplier is a SEPARATE ledger entry on listening
--           Loops only — Points, ranks and bonuses never see it
-- ============================================================================

do $$ begin
  create type loops_entry_type as enum (
    'earn_listening', 'earn_company_multiplier', 'achievement_bonus',
    'challenge_bonus', 'redemption', 'redemption_refund', 'admin_adjustment');
exception when duplicate_object then null; end $$;
do $$ begin create type funding_source as enum ('goodloop', 'company'); exception when duplicate_object then null; end $$;

-- What a session row carries for the economy. listened_sec is what the player
-- measured (pauses, background and seeks excluded); the server caps it at the
-- nominal length, so a client cannot claim more than the session holds.
alter table sessions add column if not exists listened_sec   int;
alter table sessions add column if not exists is_sos         boolean not null default false;
alter table sessions add column if not exists stereo_checked boolean not null default false;
do $$ begin
  alter table sessions add constraint sessions_listened_sec_nonneg check (listened_sec is null or listened_sec >= 0);
exception when duplicate_object then null; end $$;

-- ---- settings (one row; SPEC §2.2 and §12 defaults; Admin › Economia) ------
create table if not exists economy_settings (
  id                            boolean primary key default true check (id),
  points_per_minute             int not null default 1   check (points_per_minute >= 0),
  points_per_completed_session  int not null default 10  check (points_per_completed_session >= 0),
  daily_minutes_cap             int not null default 120 check (daily_minutes_cap >= 0),
  daily_completion_bonus_cap    int not null default 4   check (daily_completion_bonus_cap >= 0),
  loops_per_point               numeric(10,4) not null default 0.1 check (loops_per_point >= 0),
  min_contribution_points       int not null default 30  check (min_contribution_points >= 0),
  count_clinical_sessions       boolean not null default false,
  loops_expiry_months           int check (loops_expiry_months is null or loops_expiry_months > 0),
  geo_min_active_users          int not null default 50  check (geo_min_active_users >= 1),
  -- SPN-02 / D-08: sponsor figures from fewer than 25 people are suppressed.
  -- The floor is in the schema, so no setting can lower it.
  hr_min_cohort                 int not null default 25  check (hr_min_cohort >= 25),
  -- A session row says when it ended, and the client writes the row. Without
  -- a bound, rows dated to past days would each find that day's caps unused.
  -- Older than this, a session is credited as of now. null = trust ended_at
  -- (only for a controlled backfill or the parity proof).
  max_backdate_hours            int default 24 check (max_backdate_hours is null or max_backdate_hours >= 0),
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid references profiles(id) on delete set null
);
insert into economy_settings (id) values (true) on conflict do nothing;

alter table economy_settings enable row level security;
drop policy if exists economy_settings_read on economy_settings;
create policy economy_settings_read on economy_settings for select using (auth.uid() is not null);
drop policy if exists economy_settings_admin on economy_settings;
create policy economy_settings_admin on economy_settings
  for update using (is_admin()) with check (is_admin());

-- ---- company affiliation, as history ----------------------------------------
-- profiles.company_id says where someone is NOW. The multiplier needs where
-- they were when a session ENDED (SPEC §7.1, §12 "multiplier stops at
-- affiliation end"), so every change of company_id opens and closes a row.
create table if not exists company_affiliations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  company_id  text not null references companies(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists company_affiliations_open on company_affiliations(user_id) where ended_at is null;
create index if not exists company_affiliations_company on company_affiliations(company_id, started_at);

create or replace function gam_track_affiliation() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.company_id is not distinct from new.company_id then return null; end if;
  update company_affiliations set ended_at = greatest(now(), started_at)
   where user_id = new.id and ended_at is null;
  if new.company_id is not null then
    insert into company_affiliations (user_id, company_id, started_at)
    values (new.id, new.company_id, case when tg_op = 'INSERT' then new.created_at else now() end);
  end if;
  return null;
end $$;
drop trigger if exists profiles_track_affiliation on profiles;
create trigger profiles_track_affiliation after insert or update of company_id on profiles
  for each row execute function gam_track_affiliation();

-- Everyone already linked gets their open row, once.
insert into company_affiliations (user_id, company_id, started_at)
select p.id, p.company_id, p.created_at
  from profiles p
 where p.company_id is not null
   and not exists (select 1 from company_affiliations a where a.user_id = p.id and a.ended_at is null);

alter table company_affiliations enable row level security;
drop policy if exists company_affiliations_read on company_affiliations;
create policy company_affiliations_read on company_affiliations
  for select using (user_id = current_profile() or is_admin());

-- ---- the company add-on (SPEC §7.1). The Admin UI comes in slice 6; the
--      multiplier needs the tables now. ---------------------------------------
create table if not exists addon_plans (
  id                         text primary key,
  name                       text not null,
  loops_multiplier           numeric(4,2) not null check (loops_multiplier >= 1 and loops_multiplier <= 5),
  allows_company_challenges  boolean not null default true,
  allows_company_benefits    boolean not null default true,
  allows_tag_filter          boolean not null default true,
  active                     boolean not null default true,
  created_at                 timestamptz not null default now()
);
-- Names and values are placeholders (SPEC §7.1); editable.
insert into addon_plans (id, name, loops_multiplier) values
  ('essencial', 'Essencial', 1.00),
  ('plus',      'Plus',      1.25),
  ('premium',   'Premium',   1.50),
  ('max',       'Max',       2.00)
on conflict do nothing;

create table if not exists company_addon_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references companies(id) on delete cascade,
  plan_id     text not null references addon_plans(id),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  status      text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_at  timestamptz not null default now(),
  created_by  uuid references profiles(id) on delete set null,
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists company_addon_subscriptions_company on company_addon_subscriptions(company_id, starts_at);

alter table addon_plans enable row level security;
drop policy if exists addon_plans_read on addon_plans;
create policy addon_plans_read on addon_plans for select using (auth.uid() is not null);
drop policy if exists addon_plans_admin on addon_plans;
create policy addon_plans_admin on addon_plans for all using (is_admin()) with check (is_admin());

alter table company_addon_subscriptions enable row level security;
drop policy if exists addon_subs_admin on company_addon_subscriptions;
create policy addon_subs_admin on company_addon_subscriptions for all using (is_admin()) with check (is_admin());
drop policy if exists addon_subs_hr_read on company_addon_subscriptions;
create policy addon_subs_hr_read on company_addon_subscriptions
  for select using (is_hr() and company_id = my_company_id());

-- ---- the ledgers (SPEC §2.5) ------------------------------------------------
create table if not exists points_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  source_type     text not null,
  source_id       text not null,
  points          int  not null check (points >= 0),
  period_month    date not null,                 -- first day of the São Paulo month
  city_ibge_code  text,                          -- snapshotted at credit time (slice 3)
  created_at      timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);
create index if not exists points_ledger_user on points_ledger(user_id, created_at);
create index if not exists points_ledger_month_city on points_ledger(period_month, city_ibge_code);

create table if not exists loops_ledger (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles(id) on delete cascade,
  entry_type          loops_entry_type not null,
  amount_centi        int not null check (amount_centi <> 0),     -- signed
  funding_source      funding_source not null,
  company_id          text references companies(id) on delete set null,
  multiplier_applied  numeric(4,2),
  source_type         text not null,
  source_id           text not null,
  created_at          timestamptz not null default now(),
  unique (user_id, entry_type, source_type, source_id)
);
create index if not exists loops_ledger_user on loops_ledger(user_id, created_at);
create index if not exists loops_ledger_company_month on loops_ledger(company_id, created_at) where company_id is not null;

-- What each São Paulo day has used of the caps, and how many sessions it held.
create table if not exists gam_daily_usage (
  user_id             uuid not null references profiles(id) on delete cascade,
  day                 date not null,
  eligible_minutes    int  not null default 0,
  completion_bonuses  int  not null default 0,
  sessions            int  not null default 0,
  primary key (user_id, day)
);

-- Append-only. Deleting is left to the profile cascade — the right to
-- disappear (delete_my_account) removes the person's ledgers with them.
create or replace function gam_ledger_append_only() returns trigger
  language plpgsql as $$
begin
  raise exception '% is append-only: write a new entry instead', tg_table_name;
end $$;
drop trigger if exists points_ledger_append_only on points_ledger;
create trigger points_ledger_append_only before update on points_ledger
  for each row execute function gam_ledger_append_only();
drop trigger if exists loops_ledger_append_only on loops_ledger;
create trigger loops_ledger_append_only before update on loops_ledger
  for each row execute function gam_ledger_append_only();

alter table points_ledger enable row level security;
alter table loops_ledger enable row level security;
alter table gam_daily_usage enable row level security;
drop policy if exists points_ledger_read on points_ledger;
create policy points_ledger_read on points_ledger for select using (user_id = current_profile() or is_admin());
drop policy if exists loops_ledger_read on loops_ledger;
create policy loops_ledger_read on loops_ledger for select using (user_id = current_profile() or is_admin());
drop policy if exists gam_daily_usage_read on gam_daily_usage;
create policy gam_daily_usage_read on gam_daily_usage for select using (user_id = current_profile() or is_admin());
-- No insert/update/delete policy, and no privilege either: only the
-- SECURITY DEFINER functions below write here (SPEC §7.4).
revoke insert, update, delete, truncate on points_ledger, loops_ledger, gam_daily_usage from anon, authenticated;

-- ---- helpers ----------------------------------------------------------------
create or replace function gam_sp_day(p_at timestamptz) returns date
  language sql stable as
  $$ select (p_at at time zone 'America/Sao_Paulo')::date $$;

-- The multiplier in force for a person at an instant: an open affiliation to
-- a company whose add-on subscription is active at that instant. The highest
-- wins if two overlap in a changeover. Mirrors multiplierAt() in economy.ts.
create or replace function gam_multiplier_at(p_user uuid, p_at timestamptz)
  returns table (company_id text, multiplier numeric)
  language sql stable security definer set search_path = public as $$
  select a.company_id, pl.loops_multiplier
    from company_affiliations a
    join company_addon_subscriptions s on s.company_id = a.company_id
    join addon_plans pl on pl.id = s.plan_id
   where a.user_id = p_user
     and a.started_at <= p_at and (a.ended_at is null or a.ended_at > p_at)
     and s.status = 'active'
     and s.starts_at <= p_at and (s.ends_at is null or s.ends_at > p_at)
   order by pl.loops_multiplier desc
   limit 1
$$;
revoke all on function gam_multiplier_at(uuid, timestamptz) from public;

-- ---- crediting a session ----------------------------------------------------
-- Mirrors computeSessionCredit() in src/gamification/economy.ts.
--   points  = floor(listened minutes, capped at nominal and at the day) × ppm
--           + completion bonus while the day has bonuses left
--   base    = round(points × loops_per_point × 100)                centiloops
--   company = round(base × (multiplier − 1))      separate entry, company-funded
-- Idempotent: a session is credited once, whatever calls it again.
create or replace function credit_session(p_session uuid, p_trust_ended_at boolean default false) returns void
  language plpgsql security definer set search_path = public as $$
declare
  s          sessions%rowtype;
  cfg        economy_settings%rowtype;
  u          gam_daily_usage%rowtype;
  v_user     uuid;
  v_at       timestamptz;
  v_day      date;
  v_eligible int;
  v_bonus    boolean;
  v_points   int;
  v_base     int;
  v_company  int := 0;
  v_mult     numeric;
  v_company_id text;
begin
  select * into s from sessions where id = p_session;
  if not found or s.b2c_profile_id is null then return; end if;
  v_user := s.b2c_profile_id;
  select * into cfg from economy_settings where id;

  if s.is_sos then return; end if;                                          -- GAM-R3
  if s.kind = 'b2b' and not cfg.count_clinical_sessions then return; end if;

  -- One credit at a time per person: the day's caps are read and spent here.
  perform pg_advisory_xact_lock(hashtextextended('gam:' || v_user::text, 0));
  if exists (select 1 from points_ledger
              where user_id = v_user and source_type = 'session' and source_id = p_session::text) then
    return;
  end if;

  v_at := least(coalesce(s.ended_at, now()), now());
  if not p_trust_ended_at and cfg.max_backdate_hours is not null
     and v_at < now() - make_interval(hours => cfg.max_backdate_hours) then
    v_at := now();
  end if;
  v_day := gam_sp_day(v_at);

  insert into gam_daily_usage (user_id, day) values (v_user, v_day) on conflict do nothing;
  select * into u from gam_daily_usage where user_id = v_user and day = v_day for update;

  v_eligible := least(
    greatest(0, least(coalesce(s.listened_sec, 0), s.duration_min * 60)) / 60,
    greatest(0, cfg.daily_minutes_cap - u.eligible_minutes));
  v_bonus  := s.completed and u.completion_bonuses < cfg.daily_completion_bonus_cap;
  v_points := v_eligible * cfg.points_per_minute
            + case when v_bonus then cfg.points_per_completed_session else 0 end;
  v_base   := round(v_points * cfg.loops_per_point * 100);

  select m.company_id, m.multiplier into v_company_id, v_mult from gam_multiplier_at(v_user, v_at) m;
  if v_mult is not null and v_mult > 1 then
    v_company := round(v_base * (v_mult - 1));
  end if;

  insert into points_ledger (user_id, source_type, source_id, points, period_month)
  values (v_user, 'session', p_session::text, v_points, date_trunc('month', v_day)::date);

  if v_base > 0 then
    insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, source_type, source_id)
    values (v_user, 'earn_listening', v_base, 'goodloop', 'session', p_session::text)
    on conflict do nothing;
  end if;
  if v_company > 0 then
    insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, company_id, multiplier_applied, source_type, source_id)
    values (v_user, 'earn_company_multiplier', v_company, 'company', v_company_id, v_mult, 'session', p_session::text)
    on conflict do nothing;
  end if;

  update gam_daily_usage
     set eligible_minutes   = eligible_minutes + v_eligible,
         completion_bonuses = completion_bonuses + case when v_bonus then 1 else 0 end,
         sessions           = sessions + 1
   where user_id = v_user and day = v_day;
end $$;
revoke all on function credit_session(uuid, boolean) from public;
do $$ begin
  revoke all on function credit_session(uuid, boolean) from anon, authenticated;
exception when undefined_object then null; end $$;

-- Fired on every session row. A failure to credit must never lose the
-- session itself: it is logged, and backfill_points() can credit it later.
create or replace function gam_sessions_credit() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    perform credit_session(new.id);
  exception when others then
    raise warning 'credit_session(%) failed: %', new.id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists sessions_credit on sessions;
create trigger sessions_credit after insert or update of completed, listened_sec, ended_at on sessions
  for each row execute function gam_sessions_credit();

-- ---- reading the wallet ------------------------------------------------------
create or replace function get_wallet() returns json
  language sql stable security definer set search_path = public as $$
  with me as (select current_profile() as id),
       mo as (select date_trunc('month', gam_sp_day(now()))::date as month)
  select json_build_object(
    'balance_centi',  coalesce((select sum(l.amount_centi) from loops_ledger l, me where l.user_id = me.id), 0),
    'points_total',   coalesce((select sum(p.points) from points_ledger p, me where p.user_id = me.id), 0),
    'points_month',   coalesce((select sum(p.points) from points_ledger p, me, mo where p.user_id = me.id and p.period_month = mo.month), 0),
    'minutes_month',  coalesce((select sum(d.eligible_minutes) from gam_daily_usage d, me, mo where d.user_id = me.id and d.day >= mo.month), 0),
    'sessions_month', coalesce((select sum(d.sessions) from gam_daily_usage d, me, mo where d.user_id = me.id and d.day >= mo.month), 0),
    'multiplier',     (select m.multiplier from me, gam_multiplier_at(me.id, now()) m where m.multiplier > 1)
  )
$$;
revoke all on function get_wallet() from public;
do $$ begin grant execute on function get_wallet() to authenticated; exception when undefined_object then null; end $$;

-- ---- backfill (admin; never run automatically — SPEC §2.2) -------------------
create or replace function backfill_points(p_from date) returns int
  language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  for r in
    select id from sessions
     where b2c_profile_id is not null and ended_at >= p_from
     order by ended_at
  loop
    perform credit_session(r.id, true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function backfill_points(date) from public;
do $$ begin grant execute on function backfill_points(date) to authenticated; exception when undefined_object then null; end $$;

-- PostgREST schema-cache reload. Supabase's API layer caches the table schema;
-- after the ALTERs above (protocols.plain, asset_meta) a stale cache yields
-- "Could not find the 'plain' column of 'protocols' in the schema cache" on
-- the first Publish. This notify forces the reload immediately — no waiting,
-- no project restart. Safe to re-run.
notify pgrst, 'reload schema';
