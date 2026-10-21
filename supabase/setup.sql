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

-- catalog: who reads which rows is decided further down, once
-- is_approved_therapist() exists ("PROTOCOLS — who may read"); writable by admins
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
  -- Employees only: an HR account carries its company too, and is not one
  -- of the people a multiplier, a share or a dashboard counts.
  if new.role <> 'b2c_user' then return null; end if;
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
 where p.company_id is not null and p.role = 'b2c_user'
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

-- ============================================================================
-- GAMIFICATION · 2 — ACHIEVEMENTS                (docs/gamification/SPEC.md §3)
--
-- The same block is supabase/17-gamification-achievements.sql, for a live database. Needs 16-gamification-economy.sql.
--
-- One-time and permanent (GAM-R1): an achievement, once unlocked, is never
-- taken back, and its bonus is credited once, by Good Loop, never multiplied
-- (GAM-R9). Nothing here reads an assessment result, a VAS or any clinical
-- value (GAM-R2), and only sessions the economy CREDITED count — so SOS
-- sessions count for nothing (GAM-R3), and the history from before launch
-- does not pay out retroactively (SPEC §2.2).
--
-- Individual achievements are evaluated when a credit commits: a deferred
-- trigger on points_ledger, so the day's usage the same credit wrote is
-- already there. Collective ones (§3.3) are seeded here and evaluated by the
-- geographic job in slice 3.
-- ============================================================================

do $$ begin create type achievement_kind as enum ('individual', 'collective'); exception when duplicate_object then null; end $$;
-- GAM-R4: the collective scopes. There is no team, area, department, unit,
-- site, group or friends value, and there never will be.
do $$ begin create type gam_scope as enum ('user', 'city', 'state', 'region', 'national', 'company'); exception when duplicate_object then null; end $$;
do $$ begin create type achievement_period as enum ('lifetime', 'month'); exception when duplicate_object then null; end $$;
do $$ begin create type achievement_tier as enum ('semente', 'broto', 'raiz', 'copa', 'coletiva', 'nacional', 'empresa'); exception when duplicate_object then null; end $$;

create table if not exists achievement_definitions (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  kind               achievement_kind not null,
  scope              gam_scope not null,
  metric             text not null,
  threshold          numeric not null check (threshold > 0),
  period             achievement_period not null default 'lifetime',
  tier               achievement_tier not null,
  icon               text not null,
  bonus_loops_centi  int not null default 0 check (bonus_loops_centi >= 0),
  active             boolean not null default true,
  sort_order         int not null default 0,
  check ((kind = 'individual') = (scope = 'user'))
);

-- What a metric may be. Usage only: nothing about scores, VAS or assessment
-- results (GAM-R2), nothing about consecutive days (GAM-R1).
do $$ begin
  alter table achievement_definitions add constraint achievement_metric_allowed check (metric in (
    'sessions_completed', 'stereo_sessions_completed', 'self_assessment_done', 'minutes_listened',
    'deep_sessions_completed', 'durations_completed', 'distinct_weeks', 'night_sessions',
    'midday_weekday_sessions', 'pathways_completed', 'journey_completed', 'challenges_completed',
    'city_month_points', 'city_rank_per_active', 'city_night_sessions', 'state_active_cities',
    'region_month_points', 'national_minutes_lifetime', 'company_active_share_pct',
    'company_collective_challenges'));
exception when duplicate_object then null; end $$;

create table if not exists user_achievements (
  user_id         uuid not null references profiles(id) on delete cascade,
  achievement_id  uuid not null references achievement_definitions(id) on delete cascade,
  unlocked_at     timestamptz not null default now(),
  seen_at         timestamptz,
  primary key (user_id, achievement_id)
);

-- A finished pathway (the live app's "journey", PLAN A9). Written by the app
-- through record_pathway_completed(); the slug is the pathway's own id.
create table if not exists pathway_completions (
  user_id       uuid not null references profiles(id) on delete cascade,
  pathway_slug  text not null,
  completed_at  timestamptz not null default now(),
  primary key (user_id, pathway_slug)
);

-- Seeds. Thresholds, bonuses and `active` are the Admin's to edit, so a
-- re-run never overwrites them. Default bonus by tier (SPEC §3.2):
-- Semente 20 · Broto 50 · Raiz 100 · Copa 250 Loops. Collectives carry no
-- bonus by default (the SPEC sets none); editable.
--   know_yourself  inactive: the live app has no non-clinical initial
--                  self-assessment to count (PLAN A14)
--   month1_done    "a first pathway finished" — there is no 12-week journey
--                  engine; pathways are what the app has (PLAN A9)
--   journey_done   inactive until a 12-week journey exists (PLAN A9)
insert into achievement_definitions (slug, kind, scope, metric, threshold, period, tier, icon, bonus_loops_centi, active, sort_order) values
  ('first_loop',        'individual', 'user', 'sessions_completed',        1,    'lifetime', 'semente', 'spark',      2000,  true,  10),
  ('stereo_ready',      'individual', 'user', 'stereo_sessions_completed', 1,    'lifetime', 'semente', 'headphones', 2000,  true,  20),
  ('know_yourself',     'individual', 'user', 'self_assessment_done',      1,    'lifetime', 'semente', 'thought',    2000,  false, 30),
  ('listen_1h',         'individual', 'user', 'minutes_listened',          60,   'lifetime', 'semente', 'clock',      2000,  true,  40),
  ('listen_5h',         'individual', 'user', 'minutes_listened',          300,  'lifetime', 'broto',   'clock',      5000,  true,  50),
  ('listen_20h',        'individual', 'user', 'minutes_listened',          1200, 'lifetime', 'raiz',    'clock',      10000, true,  60),
  ('listen_50h',        'individual', 'user', 'minutes_listened',          3000, 'lifetime', 'copa',    'clock',      25000, true,  70),
  ('deep_dive',         'individual', 'user', 'deep_sessions_completed',   1,    'lifetime', 'broto',   'wave',       5000,  true,  80),
  ('explorer',          'individual', 'user', 'durations_completed',       3,    'lifetime', 'broto',   'compass',    5000,  true,  90),
  ('own_rhythm',        'individual', 'user', 'distinct_weeks',            4,    'lifetime', 'broto',   'calendar',   5000,  true,  100),
  ('serene_nights',     'individual', 'user', 'night_sessions',            5,    'lifetime', 'broto',   'moon',       5000,  true,  110),
  ('work_pause',        'individual', 'user', 'midday_weekday_sessions',   5,    'lifetime', 'broto',   'sun',        5000,  true,  120),
  ('month1_done',       'individual', 'user', 'pathways_completed',        1,    'lifetime', 'raiz',    'route',      10000, true,  130),
  ('journey_done',      'individual', 'user', 'journey_completed',         1,    'lifetime', 'copa',    'sprout',     25000, false, 140),
  ('first_challenge',   'individual', 'user', 'challenges_completed',      1,    'lifetime', 'broto',   'flag',       5000,  true,  150),
  ('challenger',        'individual', 'user', 'challenges_completed',      5,    'lifetime', 'raiz',    'flag',       10000, true,  160),
  ('city_in_loop',      'collective', 'city',     'city_month_points',            100000,   'month',    'coletiva', 'pin',      0, true, 210),
  ('calm_capital',      'collective', 'city',     'city_rank_per_active',         1,        'month',    'coletiva', 'spark',    0, true, 220),
  ('collective_nights', 'collective', 'city',     'city_night_sessions',          1000,     'month',    'coletiva', 'moon',     0, true, 230),
  ('state_in_tune',     'collective', 'state',    'state_active_cities',          20,       'month',    'coletiva', 'map',      0, true, 240),
  ('region_in_loop',    'collective', 'region',   'region_month_points',          500000,   'month',    'coletiva', 'globe',    0, true, 250),
  ('brazil_in_loop',    'collective', 'national', 'national_minutes_lifetime',    60000000, 'lifetime', 'nacional', 'globe',    0, true, 260),
  ('company_in_loop',   'collective', 'company',  'company_active_share_pct',     60,       'month',    'empresa',  'building', 0, true, 270),
  ('company_in_tune',   'collective', 'company',  'company_collective_challenges', 1,       'month',    'empresa',  'building', 0, true, 280)
on conflict (slug) do nothing;

alter table achievement_definitions enable row level security;
alter table user_achievements enable row level security;
alter table pathway_completions enable row level security;
drop policy if exists achievement_definitions_read on achievement_definitions;
create policy achievement_definitions_read on achievement_definitions for select using (auth.uid() is not null);
drop policy if exists achievement_definitions_admin on achievement_definitions;
create policy achievement_definitions_admin on achievement_definitions for all using (is_admin()) with check (is_admin());
drop policy if exists user_achievements_read on user_achievements;
create policy user_achievements_read on user_achievements for select using (user_id = current_profile() or is_admin());
drop policy if exists pathway_completions_read on pathway_completions;
create policy pathway_completions_read on pathway_completions for select using (user_id = current_profile() or is_admin());
revoke insert, update, delete, truncate on user_achievements, pathway_completions from anon, authenticated;

-- ---- bonuses ------------------------------------------------------------------
-- The one way a bonus reaches the Loops ledger. It has no multiplier
-- parameter, so a bonus cannot be multiplied (GAM-R9). Idempotent on its key.
create or replace function gam_credit_bonus(
  p_user uuid, p_type loops_entry_type, p_source_type text, p_source_id text,
  p_centi int, p_funding funding_source, p_company text default null) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if p_centi is null or p_centi <= 0 then return false; end if;
  insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, company_id, source_type, source_id)
  values (p_user, p_type, p_centi, p_funding, p_company, p_source_type, p_source_id)
  on conflict do nothing;
  return found;
end $$;
revoke all on function gam_credit_bonus(uuid, loops_entry_type, text, text, int, funding_source, text) from public;
do $$ begin
  revoke all on function gam_credit_bonus(uuid, loops_entry_type, text, text, int, funding_source, text) from anon, authenticated;
exception when undefined_object then null; end $$;

-- ---- metrics ------------------------------------------------------------------
-- Challenges arrive in slice 5, which replaces this with the real count.
create or replace function gam_challenges_completed(p_user uuid) returns int
  language sql stable as $$ select 0 $$;

-- A person's individual metrics. Mirrors individualMetrics() in
-- src/gamification/achievements.ts. Times are São Paulo times; weeks are ISO
-- weeks and are counted, never required to be consecutive (GAM-R1).
create or replace function gam_user_metrics(p_user uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  with credited as (
    select s.*, (s.started_at at time zone 'America/Sao_Paulo') as local_start
      from sessions s
      join points_ledger pl
        on pl.user_id = s.b2c_profile_id and pl.source_type = 'session' and pl.source_id = s.id::text
     where s.b2c_profile_id = p_user and not s.is_sos
  ),
  done as (select * from credited where completed)
  select jsonb_build_object(
    'sessions_completed',        (select count(*) from done),
    'stereo_sessions_completed', (select count(*) from done where stereo_checked),
    'self_assessment_done',      0,
    'minutes_listened',          coalesce((select sum(eligible_minutes) from gam_daily_usage where user_id = p_user), 0),
    'deep_sessions_completed',   (select count(*) from done where duration_min = 24),
    'durations_completed',       (select count(distinct duration_min) from done where duration_min in (6, 12, 24)),
    'distinct_weeks',            (select count(distinct to_char(local_start, 'IYYY-IW')) from done),
    'night_sessions',            (select count(*) from done where extract(hour from local_start) >= 21),
    'midday_weekday_sessions',   (select count(*) from done
                                   where extract(isodow from local_start) between 1 and 5
                                     and extract(hour from local_start) in (12, 13)),
    'pathways_completed',        (select count(*) from pathway_completions where user_id = p_user),
    'journey_completed',         0,
    'challenges_completed',      gam_challenges_completed(p_user)
  )
$$;
revoke all on function gam_user_metrics(uuid) from public;

-- ---- evaluation -----------------------------------------------------------------
create or replace function evaluate_achievements(p_user uuid) returns int
  language plpgsql security definer set search_path = public as $$
declare
  m jsonb;
  d record;
  n int := 0;
begin
  if p_user is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('gam:ach:' || p_user::text, 0));
  m := gam_user_metrics(p_user);
  for d in
    select ad.* from achievement_definitions ad
     where ad.active and ad.kind = 'individual'
       and coalesce((m ->> ad.metric)::numeric, 0) >= ad.threshold
       and not exists (select 1 from user_achievements ua where ua.user_id = p_user and ua.achievement_id = ad.id)
     order by ad.sort_order
  loop
    insert into user_achievements (user_id, achievement_id) values (p_user, d.id) on conflict do nothing;
    if found then
      n := n + 1;
      perform gam_credit_bonus(p_user, 'achievement_bonus', 'achievement', d.id::text, d.bonus_loops_centi, 'goodloop');
    end if;
  end loop;
  return n;
end $$;
revoke all on function evaluate_achievements(uuid) from public;
do $$ begin revoke all on function evaluate_achievements(uuid) from anon, authenticated; exception when undefined_object then null; end $$;

-- At commit, after the credit has written the day's usage too. A failure
-- here must not undo the session: it is logged, and the next credit (or an
-- admin re-evaluation) picks the achievement up.
create or replace function gam_points_evaluate() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    perform evaluate_achievements(new.user_id);
  exception when others then
    raise warning 'evaluate_achievements(%) failed: %', new.user_id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists points_ledger_evaluate on points_ledger;
create constraint trigger points_ledger_evaluate after insert on points_ledger
  deferrable initially deferred
  for each row execute function gam_points_evaluate();

-- ---- what the app calls ------------------------------------------------------------
create or replace function record_pathway_completed(p_slug text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_slug is null or length(trim(p_slug)) = 0 or length(p_slug) > 120 then raise exception 'bad pathway'; end if;
  insert into pathway_completions (user_id, pathway_slug) values (me, trim(p_slug)) on conflict do nothing;
  perform evaluate_achievements(me);
end $$;
revoke all on function record_pathway_completed(text) from public;
do $$ begin grant execute on function record_pathway_completed(text) to authenticated; exception when undefined_object then null; end $$;

create or replace function get_my_achievements() returns json
  language sql stable security definer set search_path = public as $$
  with me as (select current_profile() as id),
       m  as (select gam_user_metrics(me.id) as v from me)
  select coalesce(json_agg(json_build_object(
           'id', d.id, 'slug', d.slug, 'kind', d.kind, 'scope', d.scope, 'metric', d.metric,
           'threshold', d.threshold, 'period', d.period, 'tier', d.tier, 'icon', d.icon,
           'bonusLoopsCenti', d.bonus_loops_centi, 'sortOrder', d.sort_order, 'active', d.active,
           'value', case when d.kind = 'individual' then coalesce((m.v ->> d.metric)::numeric, 0) end,
           'unlockedAt', ua.unlocked_at, 'seenAt', ua.seen_at)
         order by d.sort_order), '[]'::json)
    from achievement_definitions d
    cross join me cross join m
    left join user_achievements ua on ua.achievement_id = d.id and ua.user_id = me.id
   where me.id is not null and (d.active or ua.user_id is not null)
$$;
revoke all on function get_my_achievements() from public;
do $$ begin grant execute on function get_my_achievements() to authenticated; exception when undefined_object then null; end $$;

-- The unlock sheet closes → these are seen (SPEC §3.4).
create or replace function mark_achievements_seen(p_ids uuid[]) returns void
  language sql security definer set search_path = public as $$
  update user_achievements set seen_at = now()
   where user_id = current_profile() and achievement_id = any(p_ids) and seen_at is null
$$;
revoke all on function mark_achievements_seen(uuid[]) from public;
do $$ begin grant execute on function mark_achievements_seen(uuid[]) to authenticated; exception when undefined_object then null; end $$;

-- Admin › Conquistas "re-evaluate": e.g. after lowering a threshold.
create or replace function admin_evaluate_achievements() returns int
  language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  for r in select distinct user_id from points_ledger loop
    n := n + evaluate_achievements(r.user_id);
  end loop;
  return n;
end $$;
revoke all on function admin_evaluate_achievements() from public;
do $$ begin grant execute on function admin_evaluate_achievements() to authenticated; exception when undefined_object then null; end $$;

-- ============================================================================
-- GAMIFICATION · 3 — GEOGRAPHIC RANKS            (docs/gamification/SPEC.md §4)
--
-- The same block is supabase/18-gamification-geo.sql (+ supabase/seed/br_municipalities.sql), for a
-- live database.
--
-- GAM-R5, privacy by default:
--   - the city is one the person DECLARES in their profile, never a GPS fix;
--   - it counts only under a separate consent purpose, 'geo_ranking',
--     recorded in consent_events like every other purpose (LEG-04);
--   - a Points entry snapshots the city at credit time, and only while that
--     consent is granted, so moving city never rewrites a past month;
--   - once someone withdraws, none of their rows reaches any view;
--   - a city appears in a ranking or a collective goal only with at least
--     geo_min_active_users (50) active people in the period; a state, a
--     region or the country only above the k floor (hr_min_cohort, 25).
-- GAM-R4: the scopes are city, state, region and national. Nothing smaller.
-- GAM-R9: ranks are Points, never Loops — a multiplier changes nothing here.
-- PLAN A6: Points are never shown to the person. The functions the app calls
-- return ranks, shares of a goal and minutes, not points.
-- ============================================================================

create table if not exists br_municipalities (
  ibge_code   text primary key check (ibge_code ~ '^[0-9]{7}$'),
  name        text not null,
  uf          char(2) not null,
  region      text not null check (region in ('N', 'NE', 'SE', 'S', 'CO')),
  search_key  text not null
);
create index if not exists br_municipalities_search on br_municipalities (search_key text_pattern_ops);
create index if not exists br_municipalities_uf on br_municipalities (uf);
alter table br_municipalities enable row level security;
drop policy if exists br_municipalities_read on br_municipalities;
create policy br_municipalities_read on br_municipalities for select using (auth.uid() is not null);

alter table profiles add column if not exists city_ibge_code text references br_municipalities(ibge_code);

-- ---- consent ------------------------------------------------------------------
create or replace function gam_geo_consented(p_user uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select granted from consent_events
     where profile_id = p_user and purpose = 'geo_ranking'
     order by at desc limit 1), false)
$$;
revoke all on function gam_geo_consented(uuid) from public;

-- The city goes on a Points entry when it is written, and only under consent.
create or replace function gam_points_city() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.city_ibge_code is null and gam_geo_consented(new.user_id) then
    select city_ibge_code into new.city_ibge_code from profiles where id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists points_ledger_city on points_ledger;
create trigger points_ledger_city before insert on points_ledger
  for each row execute function gam_points_city();

-- ---- the roll-up ----------------------------------------------------------------
-- One materialized view, every scope and period at once (GROUPING SETS):
--   scope     'city' | 'state' | 'region' | 'national'
--   ref       ibge_code | UF | region code | 'BR'
--   period    first of the São Paulo month, or 1900-01-01 for all time
-- Only Points entries from sessions, with a city, from people whose LATEST
-- geo_ranking choice is a grant.
create materialized view if not exists geo_rollup as
with people as (
  select p.id from profiles p where gam_geo_consented(p.id)
),
r as (
  select pl.user_id, pl.period_month, pl.city_ibge_code, m.uf::text as uf, m.region, pl.points,
         s.started_at, s.completed, s.listened_sec, s.duration_min
    from points_ledger pl
    join people pp on pp.id = pl.user_id
    join br_municipalities m on m.ibge_code = pl.city_ibge_code
    join sessions s on s.id::text = pl.source_id
   where pl.source_type = 'session'
)
select
  case when grouping(r.city_ibge_code) = 0 then 'city'
       when grouping(r.uf) = 0 then 'state'
       when grouping(r.region) = 0 then 'region'
       else 'national' end                                         as scope,
  coalesce(r.city_ibge_code, r.uf, r.region, 'BR')                 as ref,
  coalesce(r.period_month, date '1900-01-01')                      as period_month,
  sum(r.points)::bigint                                            as points,
  count(distinct r.user_id)::int                                   as active_users,
  count(distinct r.city_ibge_code)::int                            as active_cities,
  (count(*) filter (where r.completed
     and extract(hour from r.started_at at time zone 'America/Sao_Paulo') >= 21))::int as night_sessions,
  (coalesce(sum(least(greatest(coalesce(r.listened_sec, 0), 0), r.duration_min * 60)), 0) / 60)::bigint as minutes
from r
group by grouping sets (
  (r.period_month, r.city_ibge_code), (r.period_month, r.uf), (r.period_month, r.region), (r.period_month),
  (r.city_ibge_code), (r.uf), (r.region), ()
);
create unique index if not exists geo_rollup_key on geo_rollup (scope, ref, period_month);

-- The four views the SPEC names (§4.4), over the roll-up.
create or replace view geo_city_month as
  select ref as city_ibge_code, period_month, points, active_users, night_sessions, minutes
    from geo_rollup where scope = 'city' and period_month <> date '1900-01-01';
create or replace view geo_state_month as
  select ref as uf, period_month, points, active_users, active_cities, night_sessions, minutes
    from geo_rollup where scope = 'state' and period_month <> date '1900-01-01';
create or replace view geo_region_month as
  select ref as region, period_month, points, active_users, active_cities, minutes
    from geo_rollup where scope = 'region' and period_month <> date '1900-01-01';
create or replace view geo_national as
  select period_month, points, active_users, active_cities, minutes
    from geo_rollup where scope = 'national';

-- Nobody reads these directly: they hold small cells. Only the functions
-- below, which apply the thresholds, look at them.
do $$ begin
  revoke all on geo_rollup, geo_city_month, geo_state_month, geo_region_month, geo_national from anon, authenticated;
exception when undefined_object then null; end $$;

-- ---- what the app calls -----------------------------------------------------------
create or replace function search_municipalities(p_q text, p_limit int default 12)
  returns table (ibge_code text, name text, uf text)
  language sql stable security definer set search_path = public as $$
  with q as (
    select trim(regexp_replace(lower(translate(coalesce(p_q, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9 ]+', ' ', 'g')) as k
  )
  select m.ibge_code, m.name, m.uf::text
    from br_municipalities m, q
   where length(q.k) >= 2 and (m.search_key like q.k || '%' or m.search_key like '% ' || q.k || '%')
   order by (m.search_key like q.k || '%') desc, length(m.name), m.name
   limit greatest(1, least(coalesce(p_limit, 12), 30))
$$;
revoke all on function search_municipalities(text, int) from public;
do $$ begin grant execute on function search_municipalities(text, int) to authenticated; exception when undefined_object then null; end $$;

-- The city a person declares. null clears it. The consent is its own row in
-- consent_events, written by the app like every other purpose.
create or replace function set_my_city(p_code text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_code is not null and not exists (select 1 from br_municipalities where ibge_code = p_code) then
    raise exception 'unknown municipality';
  end if;
  update profiles set city_ibge_code = p_code where id = me;
end $$;
revoke all on function set_my_city(text) from public;
do $$ begin grant execute on function set_my_city(text) to authenticated; exception when undefined_object then null; end $$;

-- The threshold that applies to a scope.
create or replace function gam_geo_threshold(p_scope text) returns int
  language sql stable security definer set search_path = public as $$
  select case when p_scope = 'city' then s.geo_min_active_users else s.hr_min_cohort end
    from economy_settings s where s.id
$$;
revoke all on function gam_geo_threshold(text) from public;

-- Rankings by Points per ACTIVE person, so a small city competes fairly with
-- São Paulo (§4.3). Only units above their threshold. The caller's own unit
-- comes back separately, ranked if it is eligible, even outside the top N.
-- Returned without Points (PLAN A6): rank, minutes per active person.
create or replace function get_geo_rankings(p_scope text, p_period text default 'month', p_limit int default 5) returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := current_profile();
  v_period date;
  v_threshold int;
  v_mine text;
  out_rows json;
  out_mine json;
begin
  if p_scope not in ('city', 'state', 'region') then raise exception 'scope must be city, state or region'; end if;
  v_period := case when p_period = 'all' then date '1900-01-01'
                   else date_trunc('month', gam_sp_day(now()))::date end;
  v_threshold := gam_geo_threshold(p_scope);

  if me is not null and gam_geo_consented(me) then
    select case p_scope when 'city' then m.ibge_code when 'state' then m.uf::text else m.region end
      into v_mine
      from profiles p join br_municipalities m on m.ibge_code = p.city_ibge_code
     where p.id = me;
  end if;

  with eligible as (
    select g.ref, g.active_users, g.minutes,
           rank() over (order by g.points::numeric / g.active_users desc, g.ref) as rnk
      from geo_rollup g
     where g.scope = p_scope and g.period_month = v_period and g.active_users >= v_threshold
  ),
  labelled as (
    select e.*, m.name, m.uf::text as uf
      from eligible e left join br_municipalities m on p_scope = 'city' and m.ibge_code = e.ref
  )
  select coalesce(json_agg(json_build_object(
           'ref', l.ref, 'name', l.name, 'uf', l.uf, 'rank', l.rnk,
           'minutesPerActive', round(l.minutes::numeric / l.active_users),
           'mine', l.ref = v_mine) order by l.rnk), '[]'::json),
         (select json_build_object('ref', x.ref, 'name', x.name, 'uf', x.uf, 'rank', x.rnk, 'eligible', true)
            from labelled x where x.ref = v_mine)
    into out_rows, out_mine
    from (select * from labelled order by rnk limit greatest(1, least(coalesce(p_limit, 5), 50))) l;

  if v_mine is not null and out_mine is null then
    select json_build_object('ref', v_mine, 'name', m.name, 'uf', m.uf, 'rank', null, 'eligible', false)
      into out_mine
      from (select 1) one left join br_municipalities m on p_scope = 'city' and m.ibge_code = v_mine;
  end if;

  return json_build_object('scope', p_scope, 'period', p_period, 'threshold', v_threshold,
                           'rows', out_rows, 'mine', out_mine);
end $$;
revoke all on function get_geo_rankings(text, text, int) from public;
do $$ begin grant execute on function get_geo_rankings(text, text, int) to authenticated; exception when undefined_object then null; end $$;

-- The violet city card (§4.5): the city, whether it is in the rankings yet,
-- its share of this month's "Cidade em Loop" goal, and the person's own part
-- in minutes. Nothing about the city is returned below the threshold.
create or replace function get_my_city_card() returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := current_profile();
  v_city text;
  v_month date := date_trunc('month', gam_sp_day(now()))::date;
  g geo_rollup%rowtype;
  v_goal numeric;
  v_threshold int := gam_geo_threshold('city');
  v_my_minutes bigint;
begin
  if me is null then return null; end if;
  select city_ibge_code into v_city from profiles where id = me;
  select threshold into v_goal from achievement_definitions where slug = 'city_in_loop';
  select coalesce(sum(eligible_minutes), 0) into v_my_minutes
    from gam_daily_usage where user_id = me and day >= v_month;
  if v_city is null then
    return json_build_object('consented', gam_geo_consented(me), 'city', null);
  end if;
  select * into g from geo_rollup where scope = 'city' and ref = v_city and period_month = v_month;
  return json_build_object(
    'consented', gam_geo_consented(me),
    'city', (select json_build_object('ref', m.ibge_code, 'name', m.name, 'uf', m.uf) from br_municipalities m where m.ibge_code = v_city),
    'eligible', coalesce(g.active_users, 0) >= v_threshold,
    'goalSlug', 'city_in_loop',
    'goalShare', case when coalesce(g.active_users, 0) >= v_threshold and v_goal > 0
                      then least(1, round(g.points::numeric / v_goal, 4)) end,
    'myMinutesMonth', v_my_minutes);
end $$;
revoke all on function get_my_city_card() from public;
do $$ begin grant execute on function get_my_city_card() to authenticated; exception when undefined_object then null; end $$;

-- ---- collective achievements (§3.3) -------------------------------------------
-- Awarded to everyone who contributed at least min_contribution_points in the
-- qualifying period and unit. One-time per person; bonus once, Good Loop's.
create or replace function gam_award(p_def uuid, p_user uuid) returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  v_bonus int;
begin
  insert into user_achievements (user_id, achievement_id) values (p_user, p_def) on conflict do nothing;
  if not found then return false; end if;
  select bonus_loops_centi into v_bonus from achievement_definitions where id = p_def;
  perform gam_credit_bonus(p_user, 'achievement_bonus', 'achievement', p_def::text, v_bonus, 'goodloop');
  return true;
end $$;
revoke all on function gam_award(uuid, uuid) from public;
do $$ begin revoke all on function gam_award(uuid, uuid) from anon, authenticated; exception when undefined_object then null; end $$;

create or replace function gam_evaluate_collectives() returns int
  language plpgsql security definer set search_path = public as $$
declare
  cfg economy_settings%rowtype;
  d   achievement_definitions%rowtype;
  r   record;
  n   int := 0;
  v_now_month date := date_trunc('month', gam_sp_day(now()))::date;
  v_city_k int;
  v_k int;
begin
  select * into cfg from economy_settings where id;
  v_city_k := cfg.geo_min_active_users;
  v_k := cfg.hr_min_cohort;

  for d in select * from achievement_definitions where active and kind = 'collective' loop
    for r in
      -- the people to award, per metric
      with units as (
        select g.scope, g.ref, g.period_month
          from geo_rollup g
         where g.period_month <> date '1900-01-01'
           and (
             (d.metric = 'city_month_points'   and g.scope = 'city'   and g.active_users >= v_city_k and g.points >= d.threshold) or
             (d.metric = 'city_night_sessions' and g.scope = 'city'   and g.active_users >= v_city_k and g.night_sessions >= d.threshold) or
             (d.metric = 'state_active_cities' and g.scope = 'state'  and g.active_users >= v_k and g.active_cities >= d.threshold) or
             (d.metric = 'region_month_points' and g.scope = 'region' and g.active_users >= v_k and g.points >= d.threshold)
           )
        union all
        -- Capital of calm: first by points per active person, in a month that has ENDED
        select 'city', x.ref, x.period_month from (
          select g.ref, g.period_month,
                 rank() over (partition by g.period_month order by g.points::numeric / g.active_users desc, g.ref) as rnk
            from geo_rollup g
           where d.metric = 'city_rank_per_active' and g.scope = 'city'
             and g.period_month <> date '1900-01-01' and g.period_month < v_now_month
             and g.active_users >= v_city_k
        ) x where x.rnk <= d.threshold
      )
      select pl.user_id
        from units u
        join points_ledger pl on pl.period_month = u.period_month and pl.source_type = 'session'
        join br_municipalities m on m.ibge_code = pl.city_ibge_code
       where gam_geo_consented(pl.user_id)
         and ((u.scope = 'city' and m.ibge_code = u.ref) or (u.scope = 'state' and m.uf::text = u.ref)
              or (u.scope = 'region' and m.region = u.ref))
       group by pl.user_id, u.scope, u.ref, u.period_month
      having sum(pl.points) >= cfg.min_contribution_points
      union
      -- Brazil in Loop: national lifetime minutes
      select pl.user_id
        from points_ledger pl
       where d.metric = 'national_minutes_lifetime'
         and exists (select 1 from geo_rollup g where g.scope = 'national' and g.period_month = date '1900-01-01'
                      and g.active_users >= v_k and g.minutes >= d.threshold)
         and pl.city_ibge_code is not null and pl.source_type = 'session' and gam_geo_consented(pl.user_id)
       group by pl.user_id
      having sum(pl.points) >= cfg.min_contribution_points
      union
      -- Company in Loop: ≥ threshold % of the company's eligible people had a
      -- session that month, add-on companies only, the company itself above k.
      -- Needs no geographic consent: the unit is the whole company.
      select c.user_id from (
        select a.company_id, mo.month, pl.user_id, sum(pl.points) as pts
          from (select distinct period_month as month from points_ledger) mo
          join company_affiliations a
            on a.started_at < (mo.month + interval '1 month') and (a.ended_at is null or a.ended_at >= mo.month)
          join points_ledger pl
            on pl.user_id = a.user_id and pl.period_month = mo.month and pl.source_type = 'session'
         where d.metric = 'company_active_share_pct'
           and exists (select 1 from company_addon_subscriptions s
                        where s.company_id = a.company_id and s.status = 'active'
                          and s.starts_at < (mo.month + interval '1 month') and (s.ends_at is null or s.ends_at > mo.month))
         group by a.company_id, mo.month, pl.user_id
      ) c
      join lateral (
        select count(distinct a2.user_id) as eligible
          from company_affiliations a2
         where a2.company_id = c.company_id
           and a2.started_at < (c.month + interval '1 month') and (a2.ended_at is null or a2.ended_at >= c.month)
      ) e on true
      join lateral (
        select count(distinct pl2.user_id) as active
          from points_ledger pl2
          join company_affiliations a3 on a3.user_id = pl2.user_id and a3.company_id = c.company_id
         where pl2.period_month = c.month and pl2.source_type = 'session'
      ) act on true
      where e.eligible >= v_k and act.active * 100 >= d.threshold * e.eligible
        and c.pts >= cfg.min_contribution_points
    loop
      if gam_award(d.id, r.user_id) then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function gam_evaluate_collectives() from public;
do $$ begin revoke all on function gam_evaluate_collectives() from anon, authenticated; exception when undefined_object then null; end $$;

-- Refresh + evaluate. Every 15 minutes through pg_cron where it exists;
-- otherwise from Admin › Economia "Ricalcola ora".
create or replace function refresh_geo_and_collectives() returns int
  language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently geo_rollup;
  return gam_evaluate_collectives();
end $$;
revoke all on function refresh_geo_and_collectives() from public;
do $$ begin revoke all on function refresh_geo_and_collectives() from anon, authenticated; exception when undefined_object then null; end $$;

create or replace function admin_refresh_geo() returns int
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return refresh_geo_and_collectives();
end $$;
revoke all on function admin_refresh_geo() from public;
do $$ begin grant execute on function admin_refresh_geo() to authenticated; exception when undefined_object then null; end $$;

-- pg_cron, guarded: a database without the extension (local Postgres, a
-- project that has not enabled it) applies this file cleanly and relies on
-- the Admin button instead.
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron is not available (%): use Admin › Economia "Ricalcola ora"', sqlerrm;
end $$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gl-geo-refresh';
    perform cron.schedule('gl-geo-refresh', '*/15 * * * *', 'select public.refresh_geo_and_collectives()');
  end if;
exception when others then
  raise notice 'could not schedule gl-geo-refresh (%): use the Admin button', sqlerrm;
end $$;

-- ---- the IBGE municipalities (generated; see tools/gen-municipalities.mjs) ----
-- GENERATED by tools/gen-municipalities.mjs from supabase/seed/br_municipalities.csv
-- 5571 IBGE municipalities. Do not edit by hand: edit the CSV and regenerate.
insert into br_municipalities (ibge_code, name, uf, region, search_key) values
('1100015','Alta Floresta D''Oeste','RO','N','alta floresta d oeste'),
('1100023','Ariquemes','RO','N','ariquemes'),
('1100031','Cabixi','RO','N','cabixi'),
('1100049','Cacoal','RO','N','cacoal'),
('1100056','Cerejeiras','RO','N','cerejeiras'),
('1100064','Colorado do Oeste','RO','N','colorado do oeste'),
('1100072','Corumbiara','RO','N','corumbiara'),
('1100080','Costa Marques','RO','N','costa marques'),
('1100098','Espigão D''Oeste','RO','N','espigao d oeste'),
('1100106','Guajará-Mirim','RO','N','guajara mirim'),
('1100114','Jaru','RO','N','jaru'),
('1100122','Ji-Paraná','RO','N','ji parana'),
('1100130','Machadinho D''Oeste','RO','N','machadinho d oeste'),
('1100148','Nova Brasilândia D''Oeste','RO','N','nova brasilandia d oeste'),
('1100155','Ouro Preto do Oeste','RO','N','ouro preto do oeste'),
('1100189','Pimenta Bueno','RO','N','pimenta bueno'),
('1100205','Porto Velho','RO','N','porto velho'),
('1100254','Presidente Médici','RO','N','presidente medici'),
('1100262','Rio Crespo','RO','N','rio crespo'),
('1100288','Rolim de Moura','RO','N','rolim de moura'),
('1100296','Santa Luzia D''Oeste','RO','N','santa luzia d oeste'),
('1100304','Vilhena','RO','N','vilhena'),
('1100320','São Miguel do Guaporé','RO','N','sao miguel do guapore'),
('1100338','Nova Mamoré','RO','N','nova mamore'),
('1100346','Alvorada D''Oeste','RO','N','alvorada d oeste'),
('1100379','Alto Alegre dos Parecis','RO','N','alto alegre dos parecis'),
('1100403','Alto Paraíso','RO','N','alto paraiso'),
('1100452','Buritis','RO','N','buritis'),
('1100502','Novo Horizonte do Oeste','RO','N','novo horizonte do oeste'),
('1100601','Cacaulândia','RO','N','cacaulandia'),
('1100700','Campo Novo de Rondônia','RO','N','campo novo de rondonia'),
('1100809','Candeias do Jamari','RO','N','candeias do jamari'),
('1100908','Castanheiras','RO','N','castanheiras'),
('1100924','Chupinguaia','RO','N','chupinguaia'),
('1100940','Cujubim','RO','N','cujubim'),
('1101005','Governador Jorge Teixeira','RO','N','governador jorge teixeira'),
('1101104','Itapuã do Oeste','RO','N','itapua do oeste'),
('1101203','Ministro Andreazza','RO','N','ministro andreazza'),
('1101302','Mirante da Serra','RO','N','mirante da serra'),
('1101401','Monte Negro','RO','N','monte negro'),
('1101435','Nova União','RO','N','nova uniao'),
('1101450','Parecis','RO','N','parecis'),
('1101468','Pimenteiras do Oeste','RO','N','pimenteiras do oeste'),
('1101476','Primavera de Rondônia','RO','N','primavera de rondonia'),
('1101484','São Felipe D''Oeste','RO','N','sao felipe d oeste'),
('1101492','São Francisco do Guaporé','RO','N','sao francisco do guapore'),
('1101500','Seringueiras','RO','N','seringueiras'),
('1101559','Teixeirópolis','RO','N','teixeiropolis'),
('1101609','Theobroma','RO','N','theobroma'),
('1101708','Urupá','RO','N','urupa'),
('1101757','Vale do Anari','RO','N','vale do anari'),
('1101807','Vale do Paraíso','RO','N','vale do paraiso'),
('1200013','Acrelândia','AC','N','acrelandia'),
('1200054','Assis Brasil','AC','N','assis brasil'),
('1200104','Brasiléia','AC','N','brasileia'),
('1200138','Bujari','AC','N','bujari'),
('1200179','Capixaba','AC','N','capixaba'),
('1200203','Cruzeiro do Sul','AC','N','cruzeiro do sul'),
('1200252','Epitaciolândia','AC','N','epitaciolandia'),
('1200302','Feijó','AC','N','feijo'),
('1200328','Jordão','AC','N','jordao'),
('1200336','Mâncio Lima','AC','N','mancio lima'),
('1200344','Manoel Urbano','AC','N','manoel urbano'),
('1200351','Marechal Thaumaturgo','AC','N','marechal thaumaturgo'),
('1200385','Plácido de Castro','AC','N','placido de castro'),
('1200393','Porto Walter','AC','N','porto walter'),
('1200401','Rio Branco','AC','N','rio branco'),
('1200427','Rodrigues Alves','AC','N','rodrigues alves'),
('1200435','Santa Rosa do Purus','AC','N','santa rosa do purus'),
('1200450','Senador Guiomard','AC','N','senador guiomard'),
('1200500','Sena Madureira','AC','N','sena madureira'),
('1200609','Tarauacá','AC','N','tarauaca'),
('1200708','Xapuri','AC','N','xapuri'),
('1200807','Porto Acre','AC','N','porto acre'),
('1300029','Alvarães','AM','N','alvaraes'),
('1300060','Amaturá','AM','N','amatura'),
('1300086','Anamã','AM','N','anama'),
('1300102','Anori','AM','N','anori'),
('1300144','Apuí','AM','N','apui'),
('1300201','Atalaia do Norte','AM','N','atalaia do norte'),
('1300300','Autazes','AM','N','autazes'),
('1300409','Barcelos','AM','N','barcelos'),
('1300508','Barreirinha','AM','N','barreirinha'),
('1300607','Benjamin Constant','AM','N','benjamin constant'),
('1300631','Beruri','AM','N','beruri'),
('1300680','Boa Vista do Ramos','AM','N','boa vista do ramos'),
('1300706','Boca do Acre','AM','N','boca do acre'),
('1300805','Borba','AM','N','borba'),
('1300839','Caapiranga','AM','N','caapiranga'),
('1300904','Canutama','AM','N','canutama'),
('1301001','Carauari','AM','N','carauari'),
('1301100','Careiro','AM','N','careiro'),
('1301159','Careiro da Várzea','AM','N','careiro da varzea'),
('1301209','Coari','AM','N','coari'),
('1301308','Codajás','AM','N','codajas'),
('1301407','Eirunepé','AM','N','eirunepe'),
('1301506','Envira','AM','N','envira'),
('1301605','Fonte Boa','AM','N','fonte boa'),
('1301654','Guajará','AM','N','guajara'),
('1301704','Humaitá','AM','N','humaita'),
('1301803','Ipixuna','AM','N','ipixuna'),
('1301852','Iranduba','AM','N','iranduba'),
('1301902','Itacoatiara','AM','N','itacoatiara'),
('1301951','Itamarati','AM','N','itamarati'),
('1302009','Itapiranga','AM','N','itapiranga'),
('1302108','Japurá','AM','N','japura'),
('1302207','Juruá','AM','N','jurua'),
('1302306','Jutaí','AM','N','jutai'),
('1302405','Lábrea','AM','N','labrea'),
('1302504','Manacapuru','AM','N','manacapuru'),
('1302553','Manaquiri','AM','N','manaquiri'),
('1302603','Manaus','AM','N','manaus'),
('1302702','Manicoré','AM','N','manicore'),
('1302801','Maraã','AM','N','maraa'),
('1302900','Maués','AM','N','maues'),
('1303007','Nhamundá','AM','N','nhamunda'),
('1303106','Nova Olinda do Norte','AM','N','nova olinda do norte'),
('1303205','Novo Airão','AM','N','novo airao'),
('1303304','Novo Aripuanã','AM','N','novo aripuana'),
('1303403','Parintins','AM','N','parintins'),
('1303502','Pauini','AM','N','pauini'),
('1303536','Presidente Figueiredo','AM','N','presidente figueiredo'),
('1303569','Rio Preto da Eva','AM','N','rio preto da eva'),
('1303601','Santa Isabel do Rio Negro','AM','N','santa isabel do rio negro'),
('1303700','Santo Antônio do Içá','AM','N','santo antonio do ica'),
('1303809','São Gabriel da Cachoeira','AM','N','sao gabriel da cachoeira'),
('1303908','São Paulo de Olivença','AM','N','sao paulo de olivenca'),
('1303957','São Sebastião do Uatumã','AM','N','sao sebastiao do uatuma'),
('1304005','Silves','AM','N','silves'),
('1304062','Tabatinga','AM','N','tabatinga'),
('1304104','Tapauá','AM','N','tapaua'),
('1304203','Tefé','AM','N','tefe'),
('1304237','Tonantins','AM','N','tonantins'),
('1304260','Uarini','AM','N','uarini'),
('1304302','Urucará','AM','N','urucara'),
('1304401','Urucurituba','AM','N','urucurituba'),
('1400027','Amajari','RR','N','amajari'),
('1400050','Alto Alegre','RR','N','alto alegre'),
('1400100','Boa Vista','RR','N','boa vista'),
('1400159','Bonfim','RR','N','bonfim'),
('1400175','Cantá','RR','N','canta'),
('1400209','Caracaraí','RR','N','caracarai'),
('1400233','Caroebe','RR','N','caroebe'),
('1400282','Iracema','RR','N','iracema'),
('1400308','Mucajaí','RR','N','mucajai'),
('1400407','Normandia','RR','N','normandia'),
('1400456','Pacaraima','RR','N','pacaraima'),
('1400472','Rorainópolis','RR','N','rorainopolis'),
('1400506','São João da Baliza','RR','N','sao joao da baliza'),
('1400605','São Luiz do Anauá','RR','N','sao luiz do anaua'),
('1400704','Uiramutã','RR','N','uiramuta'),
('1500107','Abaetetuba','PA','N','abaetetuba'),
('1500131','Abel Figueiredo','PA','N','abel figueiredo'),
('1500206','Acará','PA','N','acara'),
('1500305','Afuá','PA','N','afua'),
('1500347','Água Azul do Norte','PA','N','agua azul do norte'),
('1500404','Alenquer','PA','N','alenquer'),
('1500503','Almeirim','PA','N','almeirim'),
('1500602','Altamira','PA','N','altamira'),
('1500701','Anajás','PA','N','anajas'),
('1500800','Ananindeua','PA','N','ananindeua'),
('1500859','Anapu','PA','N','anapu'),
('1500909','Augusto Corrêa','PA','N','augusto correa'),
('1500958','Aurora do Pará','PA','N','aurora do para'),
('1501006','Aveiro','PA','N','aveiro'),
('1501105','Bagre','PA','N','bagre'),
('1501204','Baião','PA','N','baiao'),
('1501253','Bannach','PA','N','bannach'),
('1501303','Barcarena','PA','N','barcarena'),
('1501402','Belém','PA','N','belem'),
('1501451','Belterra','PA','N','belterra'),
('1501501','Benevides','PA','N','benevides'),
('1501576','Bom Jesus do Tocantins','PA','N','bom jesus do tocantins'),
('1501600','Bonito','PA','N','bonito'),
('1501709','Bragança','PA','N','braganca'),
('1501725','Brasil Novo','PA','N','brasil novo'),
('1501758','Brejo Grande do Araguaia','PA','N','brejo grande do araguaia'),
('1501782','Breu Branco','PA','N','breu branco'),
('1501808','Breves','PA','N','breves'),
('1501907','Bujaru','PA','N','bujaru'),
('1501956','Cachoeira do Piriá','PA','N','cachoeira do piria'),
('1502004','Cachoeira do Arari','PA','N','cachoeira do arari'),
('1502103','Cametá','PA','N','cameta'),
('1502152','Canaã dos Carajás','PA','N','canaa dos carajas'),
('1502202','Capanema','PA','N','capanema'),
('1502301','Capitão Poço','PA','N','capitao poco'),
('1502400','Castanhal','PA','N','castanhal'),
('1502509','Chaves','PA','N','chaves'),
('1502608','Colares','PA','N','colares'),
('1502707','Conceição do Araguaia','PA','N','conceicao do araguaia'),
('1502756','Concórdia do Pará','PA','N','concordia do para'),
('1502764','Cumaru do Norte','PA','N','cumaru do norte'),
('1502772','Curionópolis','PA','N','curionopolis'),
('1502806','Curralinho','PA','N','curralinho'),
('1502855','Curuá','PA','N','curua'),
('1502905','Curuçá','PA','N','curuca'),
('1502939','Dom Eliseu','PA','N','dom eliseu'),
('1502954','Eldorado do Carajás','PA','N','eldorado do carajas'),
('1503002','Faro','PA','N','faro'),
('1503044','Floresta do Araguaia','PA','N','floresta do araguaia'),
('1503077','Garrafão do Norte','PA','N','garrafao do norte'),
('1503093','Goianésia do Pará','PA','N','goianesia do para'),
('1503101','Gurupá','PA','N','gurupa'),
('1503200','Igarapé-Açu','PA','N','igarape acu'),
('1503309','Igarapé-Miri','PA','N','igarape miri'),
('1503408','Inhangapi','PA','N','inhangapi'),
('1503457','Ipixuna do Pará','PA','N','ipixuna do para'),
('1503507','Irituia','PA','N','irituia'),
('1503606','Itaituba','PA','N','itaituba'),
('1503705','Itupiranga','PA','N','itupiranga'),
('1503754','Jacareacanga','PA','N','jacareacanga'),
('1503804','Jacundá','PA','N','jacunda'),
('1503903','Juruti','PA','N','juruti'),
('1504000','Limoeiro do Ajuru','PA','N','limoeiro do ajuru'),
('1504059','Mãe do Rio','PA','N','mae do rio'),
('1504109','Magalhães Barata','PA','N','magalhaes barata'),
('1504208','Marabá','PA','N','maraba'),
('1504307','Maracanã','PA','N','maracana'),
('1504406','Marapanim','PA','N','marapanim'),
('1504422','Marituba','PA','N','marituba'),
('1504455','Medicilândia','PA','N','medicilandia'),
('1504505','Melgaço','PA','N','melgaco'),
('1504604','Mocajuba','PA','N','mocajuba'),
('1504703','Moju','PA','N','moju'),
('1504752','Mojuí dos Campos','PA','N','mojui dos campos'),
('1504802','Monte Alegre','PA','N','monte alegre'),
('1504901','Muaná','PA','N','muana'),
('1504950','Nova Esperança do Piriá','PA','N','nova esperanca do piria'),
('1504976','Nova Ipixuna','PA','N','nova ipixuna'),
('1505007','Nova Timboteua','PA','N','nova timboteua'),
('1505031','Novo Progresso','PA','N','novo progresso'),
('1505064','Novo Repartimento','PA','N','novo repartimento'),
('1505106','Óbidos','PA','N','obidos'),
('1505205','Oeiras do Pará','PA','N','oeiras do para'),
('1505304','Oriximiná','PA','N','oriximina'),
('1505403','Ourém','PA','N','ourem'),
('1505437','Ourilândia do Norte','PA','N','ourilandia do norte'),
('1505486','Pacajá','PA','N','pacaja'),
('1505494','Palestina do Pará','PA','N','palestina do para'),
('1505502','Paragominas','PA','N','paragominas'),
('1505536','Parauapebas','PA','N','parauapebas'),
('1505551','Pau D''Arco','PA','N','pau d arco'),
('1505601','Peixe-Boi','PA','N','peixe boi'),
('1505635','Piçarra','PA','N','picarra'),
('1505650','Placas','PA','N','placas'),
('1505700','Ponta de Pedras','PA','N','ponta de pedras'),
('1505809','Portel','PA','N','portel'),
('1505908','Porto de Moz','PA','N','porto de moz'),
('1506005','Prainha','PA','N','prainha'),
('1506104','Primavera','PA','N','primavera'),
('1506112','Quatipuru','PA','N','quatipuru'),
('1506138','Redenção','PA','N','redencao'),
('1506161','Rio Maria','PA','N','rio maria'),
('1506187','Rondon do Pará','PA','N','rondon do para'),
('1506195','Rurópolis','PA','N','ruropolis'),
('1506203','Salinópolis','PA','N','salinopolis'),
('1506302','Salvaterra','PA','N','salvaterra'),
('1506351','Santa Bárbara do Pará','PA','N','santa barbara do para'),
('1506401','Santa Cruz do Arari','PA','N','santa cruz do arari'),
('1506500','Santa Izabel do Pará','PA','N','santa izabel do para'),
('1506559','Santa Luzia do Pará','PA','N','santa luzia do para'),
('1506583','Santa Maria das Barreiras','PA','N','santa maria das barreiras'),
('1506609','Santa Maria do Pará','PA','N','santa maria do para'),
('1506708','Santana do Araguaia','PA','N','santana do araguaia'),
('1506807','Santarém','PA','N','santarem'),
('1506906','Santarém Novo','PA','N','santarem novo'),
('1507003','Santo Antônio do Tauá','PA','N','santo antonio do taua'),
('1507102','São Caetano de Odivelas','PA','N','sao caetano de odivelas'),
('1507151','São Domingos do Araguaia','PA','N','sao domingos do araguaia'),
('1507201','São Domingos do Capim','PA','N','sao domingos do capim'),
('1507300','São Félix do Xingu','PA','N','sao felix do xingu'),
('1507409','São Francisco do Pará','PA','N','sao francisco do para'),
('1507458','São Geraldo do Araguaia','PA','N','sao geraldo do araguaia'),
('1507466','São João da Ponta','PA','N','sao joao da ponta'),
('1507474','São João de Pirabas','PA','N','sao joao de pirabas'),
('1507508','São João do Araguaia','PA','N','sao joao do araguaia'),
('1507607','São Miguel do Guamá','PA','N','sao miguel do guama'),
('1507706','São Sebastião da Boa Vista','PA','N','sao sebastiao da boa vista'),
('1507755','Sapucaia','PA','N','sapucaia'),
('1507805','Senador José Porfírio','PA','N','senador jose porfirio'),
('1507904','Soure','PA','N','soure'),
('1507953','Tailândia','PA','N','tailandia'),
('1507961','Terra Alta','PA','N','terra alta'),
('1507979','Terra Santa','PA','N','terra santa'),
('1508001','Tomé-Açu','PA','N','tome acu'),
('1508035','Tracuateua','PA','N','tracuateua'),
('1508050','Trairão','PA','N','trairao'),
('1508084','Tucumã','PA','N','tucuma'),
('1508100','Tucuruí','PA','N','tucurui'),
('1508126','Ulianópolis','PA','N','ulianopolis'),
('1508159','Uruará','PA','N','uruara'),
('1508209','Vigia','PA','N','vigia'),
('1508308','Viseu','PA','N','viseu'),
('1508357','Vitória do Xingu','PA','N','vitoria do xingu'),
('1508407','Xinguara','PA','N','xinguara'),
('1600055','Serra do Navio','AP','N','serra do navio'),
('1600105','Amapá','AP','N','amapa'),
('1600154','Pedra Branca do Amapari','AP','N','pedra branca do amapari'),
('1600204','Calçoene','AP','N','calcoene'),
('1600212','Cutias','AP','N','cutias'),
('1600238','Ferreira Gomes','AP','N','ferreira gomes'),
('1600253','Itaubal','AP','N','itaubal'),
('1600279','Laranjal do Jari','AP','N','laranjal do jari'),
('1600303','Macapá','AP','N','macapa'),
('1600402','Mazagão','AP','N','mazagao'),
('1600501','Oiapoque','AP','N','oiapoque'),
('1600535','Porto Grande','AP','N','porto grande'),
('1600550','Pracuúba','AP','N','pracuuba'),
('1600600','Santana','AP','N','santana'),
('1600709','Tartarugalzinho','AP','N','tartarugalzinho'),
('1600808','Vitória do Jari','AP','N','vitoria do jari'),
('1700251','Abreulândia','TO','N','abreulandia'),
('1700301','Aguiarnópolis','TO','N','aguiarnopolis'),
('1700350','Aliança do Tocantins','TO','N','alianca do tocantins'),
('1700400','Almas','TO','N','almas'),
('1700707','Alvorada','TO','N','alvorada'),
('1701002','Ananás','TO','N','ananas'),
('1701051','Angico','TO','N','angico'),
('1701101','Aparecida do Rio Negro','TO','N','aparecida do rio negro'),
('1701309','Aragominas','TO','N','aragominas'),
('1701903','Araguacema','TO','N','araguacema'),
('1702000','Araguaçu','TO','N','araguacu'),
('1702109','Araguaína','TO','N','araguaina'),
('1702158','Araguanã','TO','N','araguana'),
('1702208','Araguatins','TO','N','araguatins'),
('1702307','Arapoema','TO','N','arapoema'),
('1702406','Arraias','TO','N','arraias'),
('1702554','Augustinópolis','TO','N','augustinopolis'),
('1702703','Aurora do Tocantins','TO','N','aurora do tocantins'),
('1702901','Axixá do Tocantins','TO','N','axixa do tocantins'),
('1703008','Babaçulândia','TO','N','babaculandia'),
('1703057','Bandeirantes do Tocantins','TO','N','bandeirantes do tocantins'),
('1703073','Barra do Ouro','TO','N','barra do ouro'),
('1703107','Barrolândia','TO','N','barrolandia'),
('1703206','Bernardo Sayão','TO','N','bernardo sayao'),
('1703305','Bom Jesus do Tocantins','TO','N','bom jesus do tocantins'),
('1703602','Brasilândia do Tocantins','TO','N','brasilandia do tocantins'),
('1703701','Brejinho de Nazaré','TO','N','brejinho de nazare'),
('1703800','Buriti do Tocantins','TO','N','buriti do tocantins'),
('1703826','Cachoeirinha','TO','N','cachoeirinha'),
('1703842','Campos Lindos','TO','N','campos lindos'),
('1703867','Cariri do Tocantins','TO','N','cariri do tocantins'),
('1703883','Carmolândia','TO','N','carmolandia'),
('1703891','Carrasco Bonito','TO','N','carrasco bonito'),
('1703909','Caseara','TO','N','caseara'),
('1704105','Centenário','TO','N','centenario'),
('1704600','Chapada de Areia','TO','N','chapada de areia'),
('1705102','Chapada da Natividade','TO','N','chapada da natividade'),
('1705508','Colinas do Tocantins','TO','N','colinas do tocantins'),
('1705557','Combinado','TO','N','combinado'),
('1705607','Conceição do Tocantins','TO','N','conceicao do tocantins'),
('1706001','Couto Magalhães','TO','N','couto magalhaes'),
('1706100','Cristalândia','TO','N','cristalandia'),
('1706258','Crixás do Tocantins','TO','N','crixas do tocantins'),
('1706506','Darcinópolis','TO','N','darcinopolis'),
('1707009','Dianópolis','TO','N','dianopolis'),
('1707108','Divinópolis do Tocantins','TO','N','divinopolis do tocantins'),
('1707207','Dois Irmãos do Tocantins','TO','N','dois irmaos do tocantins'),
('1707306','Dueré','TO','N','duere'),
('1707405','Esperantina','TO','N','esperantina'),
('1707553','Fátima','TO','N','fatima'),
('1707652','Figueirópolis','TO','N','figueiropolis'),
('1707702','Filadélfia','TO','N','filadelfia'),
('1708205','Formoso do Araguaia','TO','N','formoso do araguaia'),
('1708254','Tabocão','TO','N','tabocao'),
('1708304','Goianorte','TO','N','goianorte'),
('1709005','Goiatins','TO','N','goiatins'),
('1709302','Guaraí','TO','N','guarai'),
('1709500','Gurupi','TO','N','gurupi'),
('1709807','Ipueiras','TO','N','ipueiras'),
('1710508','Itacajá','TO','N','itacaja'),
('1710706','Itaguatins','TO','N','itaguatins'),
('1710904','Itapiratins','TO','N','itapiratins'),
('1711100','Itaporã do Tocantins','TO','N','itapora do tocantins'),
('1711506','Jaú do Tocantins','TO','N','jau do tocantins'),
('1711803','Juarina','TO','N','juarina'),
('1711902','Lagoa da Confusão','TO','N','lagoa da confusao'),
('1711951','Lagoa do Tocantins','TO','N','lagoa do tocantins'),
('1712009','Lajeado','TO','N','lajeado'),
('1712157','Lavandeira','TO','N','lavandeira'),
('1712405','Lizarda','TO','N','lizarda'),
('1712454','Luzinópolis','TO','N','luzinopolis'),
('1712504','Marianópolis do Tocantins','TO','N','marianopolis do tocantins'),
('1712702','Mateiros','TO','N','mateiros'),
('1712801','Maurilândia do Tocantins','TO','N','maurilandia do tocantins'),
('1713205','Miracema do Tocantins','TO','N','miracema do tocantins'),
('1713304','Miranorte','TO','N','miranorte'),
('1713601','Monte do Carmo','TO','N','monte do carmo'),
('1713700','Monte Santo do Tocantins','TO','N','monte santo do tocantins'),
('1713809','Palmeiras do Tocantins','TO','N','palmeiras do tocantins'),
('1713957','Muricilândia','TO','N','muricilandia'),
('1714203','Natividade','TO','N','natividade'),
('1714302','Nazaré','TO','N','nazare'),
('1714880','Nova Olinda','TO','N','nova olinda'),
('1715002','Nova Rosalândia','TO','N','nova rosalandia'),
('1715101','Novo Acordo','TO','N','novo acordo'),
('1715150','Novo Alegre','TO','N','novo alegre'),
('1715259','Novo Jardim','TO','N','novo jardim'),
('1715507','Oliveira de Fátima','TO','N','oliveira de fatima'),
('1715705','Palmeirante','TO','N','palmeirante'),
('1715754','Palmeirópolis','TO','N','palmeiropolis'),
('1716109','Paraíso do Tocantins','TO','N','paraiso do tocantins'),
('1716208','Paranã','TO','N','parana'),
('1716307','Pau D''Arco','TO','N','pau d arco'),
('1716505','Pedro Afonso','TO','N','pedro afonso'),
('1716604','Peixe','TO','N','peixe'),
('1716653','Pequizeiro','TO','N','pequizeiro'),
('1716703','Colméia','TO','N','colmeia'),
('1717008','Pindorama do Tocantins','TO','N','pindorama do tocantins'),
('1717206','Piraquê','TO','N','piraque'),
('1717503','Pium','TO','N','pium'),
('1717800','Ponte Alta do Bom Jesus','TO','N','ponte alta do bom jesus'),
('1717909','Ponte Alta do Tocantins','TO','N','ponte alta do tocantins'),
('1718006','Porto Alegre do Tocantins','TO','N','porto alegre do tocantins'),
('1718204','Porto Nacional','TO','N','porto nacional'),
('1718303','Praia Norte','TO','N','praia norte'),
('1718402','Presidente Kennedy','TO','N','presidente kennedy'),
('1718451','Pugmil','TO','N','pugmil'),
('1718501','Recursolândia','TO','N','recursolandia'),
('1718550','Riachinho','TO','N','riachinho'),
('1718659','Rio da Conceição','TO','N','rio da conceicao'),
('1718709','Rio dos Bois','TO','N','rio dos bois'),
('1718758','Rio Sono','TO','N','rio sono'),
('1718808','Sampaio','TO','N','sampaio'),
('1718840','Sandolândia','TO','N','sandolandia'),
('1718865','Santa Fé do Araguaia','TO','N','santa fe do araguaia'),
('1718881','Santa Maria do Tocantins','TO','N','santa maria do tocantins'),
('1718899','Santa Rita do Tocantins','TO','N','santa rita do tocantins'),
('1718907','Santa Rosa do Tocantins','TO','N','santa rosa do tocantins'),
('1719004','Santa Tereza do Tocantins','TO','N','santa tereza do tocantins'),
('1720002','Santa Terezinha do Tocantins','TO','N','santa terezinha do tocantins'),
('1720101','São Bento do Tocantins','TO','N','sao bento do tocantins'),
('1720150','São Félix do Tocantins','TO','N','sao felix do tocantins'),
('1720200','São Miguel do Tocantins','TO','N','sao miguel do tocantins'),
('1720259','São Salvador do Tocantins','TO','N','sao salvador do tocantins'),
('1720309','São Sebastião do Tocantins','TO','N','sao sebastiao do tocantins'),
('1720499','São Valério','TO','N','sao valerio'),
('1720655','Silvanópolis','TO','N','silvanopolis'),
('1720804','Sítio Novo do Tocantins','TO','N','sitio novo do tocantins'),
('1720853','Sucupira','TO','N','sucupira'),
('1720903','Taguatinga','TO','N','taguatinga'),
('1720937','Taipas do Tocantins','TO','N','taipas do tocantins'),
('1720978','Talismã','TO','N','talisma'),
('1721000','Palmas','TO','N','palmas'),
('1721109','Tocantínia','TO','N','tocantinia'),
('1721208','Tocantinópolis','TO','N','tocantinopolis'),
('1721257','Tupirama','TO','N','tupirama'),
('1721307','Tupiratins','TO','N','tupiratins'),
('1722081','Wanderlândia','TO','N','wanderlandia'),
('1722107','Xambioá','TO','N','xambioa'),
('2100055','Açailândia','MA','NE','acailandia'),
('2100105','Afonso Cunha','MA','NE','afonso cunha'),
('2100154','Água Doce do Maranhão','MA','NE','agua doce do maranhao'),
('2100204','Alcântara','MA','NE','alcantara'),
('2100303','Aldeias Altas','MA','NE','aldeias altas'),
('2100402','Altamira do Maranhão','MA','NE','altamira do maranhao'),
('2100436','Alto Alegre do Maranhão','MA','NE','alto alegre do maranhao'),
('2100477','Alto Alegre do Pindaré','MA','NE','alto alegre do pindare'),
('2100501','Alto Parnaíba','MA','NE','alto parnaiba'),
('2100550','Amapá do Maranhão','MA','NE','amapa do maranhao'),
('2100600','Amarante do Maranhão','MA','NE','amarante do maranhao'),
('2100709','Anajatuba','MA','NE','anajatuba'),
('2100808','Anapurus','MA','NE','anapurus'),
('2100832','Apicum-Açu','MA','NE','apicum acu'),
('2100873','Araguanã','MA','NE','araguana'),
('2100907','Araioses','MA','NE','araioses'),
('2100956','Arame','MA','NE','arame'),
('2101004','Arari','MA','NE','arari'),
('2101103','Axixá','MA','NE','axixa'),
('2101202','Bacabal','MA','NE','bacabal'),
('2101251','Bacabeira','MA','NE','bacabeira'),
('2101301','Bacuri','MA','NE','bacuri'),
('2101350','Bacurituba','MA','NE','bacurituba'),
('2101400','Balsas','MA','NE','balsas'),
('2101509','Barão de Grajaú','MA','NE','barao de grajau'),
('2101608','Barra do Corda','MA','NE','barra do corda'),
('2101707','Barreirinhas','MA','NE','barreirinhas'),
('2101731','Belágua','MA','NE','belagua'),
('2101772','Bela Vista do Maranhão','MA','NE','bela vista do maranhao'),
('2101806','Benedito Leite','MA','NE','benedito leite'),
('2101905','Bequimão','MA','NE','bequimao'),
('2101939','Bernardo do Mearim','MA','NE','bernardo do mearim'),
('2101970','Boa Vista do Gurupi','MA','NE','boa vista do gurupi'),
('2102002','Bom Jardim','MA','NE','bom jardim'),
('2102036','Bom Jesus das Selvas','MA','NE','bom jesus das selvas'),
('2102077','Bom Lugar','MA','NE','bom lugar'),
('2102101','Brejo','MA','NE','brejo'),
('2102150','Brejo de Areia','MA','NE','brejo de areia'),
('2102200','Buriti','MA','NE','buriti'),
('2102309','Buriti Bravo','MA','NE','buriti bravo'),
('2102325','Buriticupu','MA','NE','buriticupu'),
('2102358','Buritirana','MA','NE','buritirana'),
('2102374','Cachoeira Grande','MA','NE','cachoeira grande'),
('2102408','Cajapió','MA','NE','cajapio'),
('2102507','Cajari','MA','NE','cajari'),
('2102556','Campestre do Maranhão','MA','NE','campestre do maranhao'),
('2102606','Cândido Mendes','MA','NE','candido mendes'),
('2102705','Cantanhede','MA','NE','cantanhede'),
('2102754','Capinzal do Norte','MA','NE','capinzal do norte'),
('2102804','Carolina','MA','NE','carolina'),
('2102903','Carutapera','MA','NE','carutapera'),
('2103000','Caxias','MA','NE','caxias'),
('2103109','Cedral','MA','NE','cedral'),
('2103125','Central do Maranhão','MA','NE','central do maranhao'),
('2103158','Centro do Guilherme','MA','NE','centro do guilherme'),
('2103174','Centro Novo do Maranhão','MA','NE','centro novo do maranhao'),
('2103208','Chapadinha','MA','NE','chapadinha'),
('2103257','Cidelândia','MA','NE','cidelandia'),
('2103307','Codó','MA','NE','codo'),
('2103406','Coelho Neto','MA','NE','coelho neto'),
('2103505','Colinas','MA','NE','colinas'),
('2103554','Conceição do Lago-Açu','MA','NE','conceicao do lago acu'),
('2103604','Coroatá','MA','NE','coroata'),
('2103703','Cururupu','MA','NE','cururupu'),
('2103752','Davinópolis','MA','NE','davinopolis'),
('2103802','Dom Pedro','MA','NE','dom pedro'),
('2103901','Duque Bacelar','MA','NE','duque bacelar'),
('2104008','Esperantinópolis','MA','NE','esperantinopolis'),
('2104057','Estreito','MA','NE','estreito'),
('2104073','Feira Nova do Maranhão','MA','NE','feira nova do maranhao'),
('2104081','Fernando Falcão','MA','NE','fernando falcao'),
('2104099','Formosa da Serra Negra','MA','NE','formosa da serra negra'),
('2104107','Fortaleza dos Nogueiras','MA','NE','fortaleza dos nogueiras'),
('2104206','Fortuna','MA','NE','fortuna'),
('2104305','Godofredo Viana','MA','NE','godofredo viana'),
('2104404','Gonçalves Dias','MA','NE','goncalves dias'),
('2104503','Governador Archer','MA','NE','governador archer'),
('2104552','Governador Edison Lobão','MA','NE','governador edison lobao'),
('2104602','Governador Eugênio Barros','MA','NE','governador eugenio barros'),
('2104628','Governador Luiz Rocha','MA','NE','governador luiz rocha'),
('2104651','Governador Newton Bello','MA','NE','governador newton bello'),
('2104677','Governador Nunes Freire','MA','NE','governador nunes freire'),
('2104701','Graça Aranha','MA','NE','graca aranha'),
('2104800','Grajaú','MA','NE','grajau'),
('2104909','Guimarães','MA','NE','guimaraes'),
('2105005','Humberto de Campos','MA','NE','humberto de campos'),
('2105104','Icatu','MA','NE','icatu'),
('2105153','Igarapé do Meio','MA','NE','igarape do meio'),
('2105203','Igarapé Grande','MA','NE','igarape grande'),
('2105302','Imperatriz','MA','NE','imperatriz'),
('2105351','Itaipava do Grajaú','MA','NE','itaipava do grajau'),
('2105401','Itapecuru Mirim','MA','NE','itapecuru mirim'),
('2105427','Itinga do Maranhão','MA','NE','itinga do maranhao'),
('2105450','Jatobá','MA','NE','jatoba'),
('2105476','Jenipapo dos Vieiras','MA','NE','jenipapo dos vieiras'),
('2105500','João Lisboa','MA','NE','joao lisboa'),
('2105609','Joselândia','MA','NE','joselandia'),
('2105658','Junco do Maranhão','MA','NE','junco do maranhao'),
('2105708','Lago da Pedra','MA','NE','lago da pedra'),
('2105807','Lago do Junco','MA','NE','lago do junco'),
('2105906','Lago Verde','MA','NE','lago verde'),
('2105922','Lagoa do Mato','MA','NE','lagoa do mato'),
('2105948','Lago dos Rodrigues','MA','NE','lago dos rodrigues'),
('2105963','Lagoa Grande do Maranhão','MA','NE','lagoa grande do maranhao'),
('2105989','Lajeado Novo','MA','NE','lajeado novo'),
('2106003','Lima Campos','MA','NE','lima campos'),
('2106102','Loreto','MA','NE','loreto'),
('2106201','Luís Domingues','MA','NE','luis domingues'),
('2106300','Magalhães de Almeida','MA','NE','magalhaes de almeida'),
('2106326','Maracaçumé','MA','NE','maracacume'),
('2106359','Marajá do Sena','MA','NE','maraja do sena'),
('2106375','Maranhãozinho','MA','NE','maranhaozinho'),
('2106409','Mata Roma','MA','NE','mata roma'),
('2106508','Matinha','MA','NE','matinha'),
('2106607','Matões','MA','NE','matoes'),
('2106631','Matões do Norte','MA','NE','matoes do norte'),
('2106672','Milagres do Maranhão','MA','NE','milagres do maranhao'),
('2106706','Mirador','MA','NE','mirador'),
('2106755','Miranda do Norte','MA','NE','miranda do norte'),
('2106805','Mirinzal','MA','NE','mirinzal'),
('2106904','Monção','MA','NE','moncao'),
('2107001','Montes Altos','MA','NE','montes altos'),
('2107100','Morros','MA','NE','morros'),
('2107209','Nina Rodrigues','MA','NE','nina rodrigues'),
('2107258','Nova Colinas','MA','NE','nova colinas'),
('2107308','Nova Iorque','MA','NE','nova iorque'),
('2107357','Nova Olinda do Maranhão','MA','NE','nova olinda do maranhao'),
('2107407','Olho d''Água das Cunhãs','MA','NE','olho d agua das cunhas'),
('2107456','Olinda Nova do Maranhão','MA','NE','olinda nova do maranhao'),
('2107506','Paço do Lumiar','MA','NE','paco do lumiar'),
('2107605','Palmeirândia','MA','NE','palmeirandia'),
('2107704','Paraibano','MA','NE','paraibano'),
('2107803','Parnarama','MA','NE','parnarama'),
('2107902','Passagem Franca','MA','NE','passagem franca'),
('2108009','Pastos Bons','MA','NE','pastos bons'),
('2108058','Paulino Neves','MA','NE','paulino neves'),
('2108108','Paulo Ramos','MA','NE','paulo ramos'),
('2108207','Pedreiras','MA','NE','pedreiras'),
('2108256','Pedro do Rosário','MA','NE','pedro do rosario'),
('2108306','Penalva','MA','NE','penalva'),
('2108405','Peri Mirim','MA','NE','peri mirim'),
('2108454','Peritoró','MA','NE','peritoro'),
('2108504','Pindaré-Mirim','MA','NE','pindare mirim'),
('2108603','Pinheiro','MA','NE','pinheiro'),
('2108702','Pio XII','MA','NE','pio xii'),
('2108801','Pirapemas','MA','NE','pirapemas'),
('2108900','Poção de Pedras','MA','NE','pocao de pedras'),
('2109007','Porto Franco','MA','NE','porto franco'),
('2109056','Porto Rico do Maranhão','MA','NE','porto rico do maranhao'),
('2109106','Presidente Dutra','MA','NE','presidente dutra'),
('2109205','Presidente Juscelino','MA','NE','presidente juscelino'),
('2109239','Presidente Médici','MA','NE','presidente medici'),
('2109270','Presidente Sarney','MA','NE','presidente sarney'),
('2109304','Presidente Vargas','MA','NE','presidente vargas'),
('2109403','Primeira Cruz','MA','NE','primeira cruz'),
('2109452','Raposa','MA','NE','raposa'),
('2109502','Riachão','MA','NE','riachao'),
('2109551','Ribamar Fiquene','MA','NE','ribamar fiquene'),
('2109601','Rosário','MA','NE','rosario'),
('2109700','Sambaíba','MA','NE','sambaiba'),
('2109759','Santa Filomena do Maranhão','MA','NE','santa filomena do maranhao'),
('2109809','Santa Helena','MA','NE','santa helena'),
('2109908','Santa Inês','MA','NE','santa ines'),
('2110005','Santa Luzia','MA','NE','santa luzia'),
('2110039','Santa Luzia do Paruá','MA','NE','santa luzia do parua'),
('2110104','Santa Quitéria do Maranhão','MA','NE','santa quiteria do maranhao'),
('2110203','Santa Rita','MA','NE','santa rita'),
('2110237','Santana do Maranhão','MA','NE','santana do maranhao'),
('2110278','Santo Amaro do Maranhão','MA','NE','santo amaro do maranhao'),
('2110302','Santo Antônio dos Lopes','MA','NE','santo antonio dos lopes'),
('2110401','São Benedito do Rio Preto','MA','NE','sao benedito do rio preto'),
('2110500','São Bento','MA','NE','sao bento'),
('2110609','São Bernardo','MA','NE','sao bernardo'),
('2110658','São Domingos do Azeitão','MA','NE','sao domingos do azeitao'),
('2110708','São Domingos do Maranhão','MA','NE','sao domingos do maranhao'),
('2110807','São Félix de Balsas','MA','NE','sao felix de balsas'),
('2110856','São Francisco do Brejão','MA','NE','sao francisco do brejao'),
('2110906','São Francisco do Maranhão','MA','NE','sao francisco do maranhao'),
('2111003','São João Batista','MA','NE','sao joao batista'),
('2111029','São João do Carú','MA','NE','sao joao do caru'),
('2111052','São João do Paraíso','MA','NE','sao joao do paraiso'),
('2111078','São João do Soter','MA','NE','sao joao do soter'),
('2111102','São João dos Patos','MA','NE','sao joao dos patos'),
('2111201','São José de Ribamar','MA','NE','sao jose de ribamar'),
('2111250','São José dos Basílios','MA','NE','sao jose dos basilios'),
('2111300','São Luís','MA','NE','sao luis'),
('2111409','São Luís Gonzaga do Maranhão','MA','NE','sao luis gonzaga do maranhao'),
('2111508','São Mateus do Maranhão','MA','NE','sao mateus do maranhao'),
('2111532','São Pedro da Água Branca','MA','NE','sao pedro da agua branca'),
('2111573','São Pedro dos Crentes','MA','NE','sao pedro dos crentes'),
('2111607','São Raimundo das Mangabeiras','MA','NE','sao raimundo das mangabeiras'),
('2111631','São Raimundo do Doca Bezerra','MA','NE','sao raimundo do doca bezerra'),
('2111672','São Roberto','MA','NE','sao roberto'),
('2111706','São Vicente Ferrer','MA','NE','sao vicente ferrer'),
('2111722','Satubinha','MA','NE','satubinha'),
('2111748','Senador Alexandre Costa','MA','NE','senador alexandre costa'),
('2111763','Senador La Rocque','MA','NE','senador la rocque'),
('2111789','Serrano do Maranhão','MA','NE','serrano do maranhao'),
('2111805','Sítio Novo','MA','NE','sitio novo'),
('2111904','Sucupira do Norte','MA','NE','sucupira do norte'),
('2111953','Sucupira do Riachão','MA','NE','sucupira do riachao'),
('2112001','Tasso Fragoso','MA','NE','tasso fragoso'),
('2112100','Timbiras','MA','NE','timbiras'),
('2112209','Timon','MA','NE','timon'),
('2112233','Trizidela do Vale','MA','NE','trizidela do vale'),
('2112274','Tufilândia','MA','NE','tufilandia'),
('2112308','Tuntum','MA','NE','tuntum'),
('2112407','Turiaçu','MA','NE','turiacu'),
('2112456','Turilândia','MA','NE','turilandia'),
('2112506','Tutóia','MA','NE','tutoia'),
('2112605','Urbano Santos','MA','NE','urbano santos'),
('2112704','Vargem Grande','MA','NE','vargem grande'),
('2112803','Viana','MA','NE','viana'),
('2112852','Vila Nova dos Martírios','MA','NE','vila nova dos martirios'),
('2112902','Vitória do Mearim','MA','NE','vitoria do mearim'),
('2113009','Vitorino Freire','MA','NE','vitorino freire'),
('2114007','Zé Doca','MA','NE','ze doca'),
('2200053','Acauã','PI','NE','acaua'),
('2200103','Agricolândia','PI','NE','agricolandia'),
('2200202','Água Branca','PI','NE','agua branca'),
('2200251','Alagoinha do Piauí','PI','NE','alagoinha do piaui'),
('2200277','Alegrete do Piauí','PI','NE','alegrete do piaui'),
('2200301','Alto Longá','PI','NE','alto longa'),
('2200400','Altos','PI','NE','altos'),
('2200459','Alvorada do Gurguéia','PI','NE','alvorada do gurgueia'),
('2200509','Amarante','PI','NE','amarante'),
('2200608','Angical do Piauí','PI','NE','angical do piaui'),
('2200707','Anísio de Abreu','PI','NE','anisio de abreu'),
('2200806','Antônio Almeida','PI','NE','antonio almeida'),
('2200905','Aroazes','PI','NE','aroazes'),
('2200954','Aroeiras do Itaim','PI','NE','aroeiras do itaim'),
('2201002','Arraial','PI','NE','arraial'),
('2201051','Assunção do Piauí','PI','NE','assuncao do piaui'),
('2201101','Avelino Lopes','PI','NE','avelino lopes'),
('2201150','Baixa Grande do Ribeiro','PI','NE','baixa grande do ribeiro'),
('2201176','Barra D''Alcântara','PI','NE','barra d alcantara'),
('2201200','Barras','PI','NE','barras'),
('2201309','Barreiras do Piauí','PI','NE','barreiras do piaui'),
('2201408','Barro Duro','PI','NE','barro duro'),
('2201507','Batalha','PI','NE','batalha'),
('2201556','Bela Vista do Piauí','PI','NE','bela vista do piaui'),
('2201572','Belém do Piauí','PI','NE','belem do piaui'),
('2201606','Beneditinos','PI','NE','beneditinos'),
('2201705','Bertolínia','PI','NE','bertolinia'),
('2201739','Betânia do Piauí','PI','NE','betania do piaui'),
('2201770','Boa Hora','PI','NE','boa hora'),
('2201804','Bocaina','PI','NE','bocaina'),
('2201903','Bom Jesus','PI','NE','bom jesus'),
('2201919','Bom Princípio do Piauí','PI','NE','bom principio do piaui'),
('2201929','Bonfim do Piauí','PI','NE','bonfim do piaui'),
('2201945','Boqueirão do Piauí','PI','NE','boqueirao do piaui'),
('2201960','Brasileira','PI','NE','brasileira'),
('2201988','Brejo do Piauí','PI','NE','brejo do piaui'),
('2202000','Buriti dos Lopes','PI','NE','buriti dos lopes'),
('2202026','Buriti dos Montes','PI','NE','buriti dos montes'),
('2202059','Cabeceiras do Piauí','PI','NE','cabeceiras do piaui'),
('2202075','Cajazeiras do Piauí','PI','NE','cajazeiras do piaui'),
('2202083','Cajueiro da Praia','PI','NE','cajueiro da praia'),
('2202091','Caldeirão Grande do Piauí','PI','NE','caldeirao grande do piaui'),
('2202109','Campinas do Piauí','PI','NE','campinas do piaui'),
('2202117','Campo Alegre do Fidalgo','PI','NE','campo alegre do fidalgo'),
('2202133','Campo Grande do Piauí','PI','NE','campo grande do piaui'),
('2202174','Campo Largo do Piauí','PI','NE','campo largo do piaui'),
('2202208','Campo Maior','PI','NE','campo maior'),
('2202251','Canavieira','PI','NE','canavieira'),
('2202307','Canto do Buriti','PI','NE','canto do buriti'),
('2202406','Capitão de Campos','PI','NE','capitao de campos'),
('2202455','Capitão Gervásio Oliveira','PI','NE','capitao gervasio oliveira'),
('2202505','Caracol','PI','NE','caracol'),
('2202539','Caraúbas do Piauí','PI','NE','caraubas do piaui'),
('2202554','Caridade do Piauí','PI','NE','caridade do piaui'),
('2202604','Castelo do Piauí','PI','NE','castelo do piaui'),
('2202653','Caxingó','PI','NE','caxingo'),
('2202703','Cocal','PI','NE','cocal'),
('2202711','Cocal de Telha','PI','NE','cocal de telha'),
('2202729','Cocal dos Alves','PI','NE','cocal dos alves'),
('2202737','Coivaras','PI','NE','coivaras'),
('2202752','Colônia do Gurguéia','PI','NE','colonia do gurgueia'),
('2202778','Colônia do Piauí','PI','NE','colonia do piaui'),
('2202802','Conceição do Canindé','PI','NE','conceicao do caninde'),
('2202851','Coronel José Dias','PI','NE','coronel jose dias'),
('2202901','Corrente','PI','NE','corrente'),
('2203008','Cristalândia do Piauí','PI','NE','cristalandia do piaui'),
('2203107','Cristino Castro','PI','NE','cristino castro'),
('2203206','Curimatá','PI','NE','curimata'),
('2203230','Currais','PI','NE','currais'),
('2203255','Curralinhos','PI','NE','curralinhos'),
('2203271','Curral Novo do Piauí','PI','NE','curral novo do piaui'),
('2203305','Demerval Lobão','PI','NE','demerval lobao'),
('2203354','Dirceu Arcoverde','PI','NE','dirceu arcoverde'),
('2203404','Dom Expedito Lopes','PI','NE','dom expedito lopes'),
('2203420','Domingos Mourão','PI','NE','domingos mourao'),
('2203453','Dom Inocêncio','PI','NE','dom inocencio'),
('2203503','Elesbão Veloso','PI','NE','elesbao veloso'),
('2203602','Eliseu Martins','PI','NE','eliseu martins'),
('2203701','Esperantina','PI','NE','esperantina'),
('2203750','Fartura do Piauí','PI','NE','fartura do piaui'),
('2203800','Flores do Piauí','PI','NE','flores do piaui'),
('2203859','Floresta do Piauí','PI','NE','floresta do piaui'),
('2203909','Floriano','PI','NE','floriano'),
('2204006','Francinópolis','PI','NE','francinopolis'),
('2204105','Francisco Ayres','PI','NE','francisco ayres'),
('2204154','Francisco Macedo','PI','NE','francisco macedo'),
('2204204','Francisco Santos','PI','NE','francisco santos'),
('2204303','Fronteiras','PI','NE','fronteiras'),
('2204352','Geminiano','PI','NE','geminiano'),
('2204402','Gilbués','PI','NE','gilbues'),
('2204501','Guadalupe','PI','NE','guadalupe'),
('2204550','Guaribas','PI','NE','guaribas'),
('2204600','Hugo Napoleão','PI','NE','hugo napoleao'),
('2204659','Ilha Grande','PI','NE','ilha grande'),
('2204709','Inhuma','PI','NE','inhuma'),
('2204808','Ipiranga do Piauí','PI','NE','ipiranga do piaui'),
('2204907','Isaías Coelho','PI','NE','isaias coelho'),
('2205003','Itainópolis','PI','NE','itainopolis'),
('2205102','Itaueira','PI','NE','itaueira'),
('2205151','Jacobina do Piauí','PI','NE','jacobina do piaui'),
('2205201','Jaicós','PI','NE','jaicos'),
('2205250','Jardim do Mulato','PI','NE','jardim do mulato'),
('2205276','Jatobá do Piauí','PI','NE','jatoba do piaui'),
('2205300','Jerumenha','PI','NE','jerumenha'),
('2205359','João Costa','PI','NE','joao costa'),
('2205409','Joaquim Pires','PI','NE','joaquim pires'),
('2205458','Joca Marques','PI','NE','joca marques'),
('2205508','José de Freitas','PI','NE','jose de freitas'),
('2205516','Juazeiro do Piauí','PI','NE','juazeiro do piaui'),
('2205524','Júlio Borges','PI','NE','julio borges'),
('2205532','Jurema','PI','NE','jurema'),
('2205540','Lagoinha do Piauí','PI','NE','lagoinha do piaui'),
('2205557','Lagoa Alegre','PI','NE','lagoa alegre'),
('2205565','Lagoa do Barro do Piauí','PI','NE','lagoa do barro do piaui'),
('2205573','Lagoa de São Francisco','PI','NE','lagoa de sao francisco'),
('2205581','Lagoa do Piauí','PI','NE','lagoa do piaui'),
('2205599','Lagoa do Sítio','PI','NE','lagoa do sitio'),
('2205607','Landri Sales','PI','NE','landri sales'),
('2205706','Luís Correia','PI','NE','luis correia'),
('2205805','Luzilândia','PI','NE','luzilandia'),
('2205854','Madeiro','PI','NE','madeiro'),
('2205904','Manoel Emídio','PI','NE','manoel emidio'),
('2205953','Marcolândia','PI','NE','marcolandia'),
('2206001','Marcos Parente','PI','NE','marcos parente'),
('2206050','Massapê do Piauí','PI','NE','massape do piaui'),
('2206100','Matias Olímpio','PI','NE','matias olimpio'),
('2206209','Miguel Alves','PI','NE','miguel alves'),
('2206308','Miguel Leão','PI','NE','miguel leao'),
('2206357','Milton Brandão','PI','NE','milton brandao'),
('2206407','Monsenhor Gil','PI','NE','monsenhor gil'),
('2206506','Monsenhor Hipólito','PI','NE','monsenhor hipolito'),
('2206605','Monte Alegre do Piauí','PI','NE','monte alegre do piaui'),
('2206654','Morro Cabeça no Tempo','PI','NE','morro cabeca no tempo'),
('2206670','Morro do Chapéu do Piauí','PI','NE','morro do chapeu do piaui'),
('2206696','Murici dos Portelas','PI','NE','murici dos portelas'),
('2206704','Nazaré do Piauí','PI','NE','nazare do piaui'),
('2206720','Nazária','PI','NE','nazaria'),
('2206753','Nossa Senhora de Nazaré','PI','NE','nossa senhora de nazare'),
('2206803','Nossa Senhora dos Remédios','PI','NE','nossa senhora dos remedios'),
('2206902','Novo Oriente do Piauí','PI','NE','novo oriente do piaui'),
('2206951','Novo Santo Antônio','PI','NE','novo santo antonio'),
('2207009','Oeiras','PI','NE','oeiras'),
('2207108','Olho D''Água do Piauí','PI','NE','olho d agua do piaui'),
('2207207','Padre Marcos','PI','NE','padre marcos'),
('2207306','Paes Landim','PI','NE','paes landim'),
('2207355','Pajeú do Piauí','PI','NE','pajeu do piaui'),
('2207405','Palmeira do Piauí','PI','NE','palmeira do piaui'),
('2207504','Palmeirais','PI','NE','palmeirais'),
('2207553','Paquetá','PI','NE','paqueta'),
('2207603','Parnaguá','PI','NE','parnagua'),
('2207702','Parnaíba','PI','NE','parnaiba'),
('2207751','Passagem Franca do Piauí','PI','NE','passagem franca do piaui'),
('2207777','Patos do Piauí','PI','NE','patos do piaui'),
('2207793','Pau D''Arco do Piauí','PI','NE','pau d arco do piaui'),
('2207801','Paulistana','PI','NE','paulistana'),
('2207850','Pavussu','PI','NE','pavussu'),
('2207900','Pedro II','PI','NE','pedro ii'),
('2207934','Pedro Laurentino','PI','NE','pedro laurentino'),
('2207959','Nova Santa Rita','PI','NE','nova santa rita'),
('2208007','Picos','PI','NE','picos'),
('2208106','Pimenteiras','PI','NE','pimenteiras'),
('2208205','Pio IX','PI','NE','pio ix'),
('2208304','Piracuruca','PI','NE','piracuruca'),
('2208403','Piripiri','PI','NE','piripiri'),
('2208502','Porto','PI','NE','porto'),
('2208551','Porto Alegre do Piauí','PI','NE','porto alegre do piaui'),
('2208601','Prata do Piauí','PI','NE','prata do piaui'),
('2208650','Queimada Nova','PI','NE','queimada nova'),
('2208700','Redenção do Gurguéia','PI','NE','redencao do gurgueia'),
('2208809','Regeneração','PI','NE','regeneracao'),
('2208858','Riacho Frio','PI','NE','riacho frio'),
('2208874','Ribeira do Piauí','PI','NE','ribeira do piaui'),
('2208908','Ribeiro Gonçalves','PI','NE','ribeiro goncalves'),
('2209005','Rio Grande do Piauí','PI','NE','rio grande do piaui'),
('2209104','Santa Cruz do Piauí','PI','NE','santa cruz do piaui'),
('2209153','Santa Cruz dos Milagres','PI','NE','santa cruz dos milagres'),
('2209203','Santa Filomena','PI','NE','santa filomena'),
('2209302','Santa Luz','PI','NE','santa luz'),
('2209351','Santana do Piauí','PI','NE','santana do piaui'),
('2209377','Santa Rosa do Piauí','PI','NE','santa rosa do piaui'),
('2209401','Santo Antônio de Lisboa','PI','NE','santo antonio de lisboa'),
('2209450','Santo Antônio dos Milagres','PI','NE','santo antonio dos milagres'),
('2209500','Santo Inácio do Piauí','PI','NE','santo inacio do piaui'),
('2209559','São Braz do Piauí','PI','NE','sao braz do piaui'),
('2209609','São Félix do Piauí','PI','NE','sao felix do piaui'),
('2209658','São Francisco de Assis do Piauí','PI','NE','sao francisco de assis do piaui'),
('2209708','São Francisco do Piauí','PI','NE','sao francisco do piaui'),
('2209757','São Gonçalo do Gurguéia','PI','NE','sao goncalo do gurgueia'),
('2209807','São Gonçalo do Piauí','PI','NE','sao goncalo do piaui'),
('2209856','São João da Canabrava','PI','NE','sao joao da canabrava'),
('2209872','São João da Fronteira','PI','NE','sao joao da fronteira'),
('2209906','São João da Serra','PI','NE','sao joao da serra'),
('2209955','São João da Varjota','PI','NE','sao joao da varjota'),
('2209971','São João do Arraial','PI','NE','sao joao do arraial'),
('2210003','São João do Piauí','PI','NE','sao joao do piaui'),
('2210052','São José do Divino','PI','NE','sao jose do divino'),
('2210102','São José do Peixe','PI','NE','sao jose do peixe'),
('2210201','São José do Piauí','PI','NE','sao jose do piaui'),
('2210300','São Julião','PI','NE','sao juliao'),
('2210359','São Lourenço do Piauí','PI','NE','sao lourenco do piaui'),
('2210375','São Luis do Piauí','PI','NE','sao luis do piaui'),
('2210383','São Miguel da Baixa Grande','PI','NE','sao miguel da baixa grande'),
('2210391','São Miguel do Fidalgo','PI','NE','sao miguel do fidalgo'),
('2210409','São Miguel do Tapuio','PI','NE','sao miguel do tapuio'),
('2210508','São Pedro do Piauí','PI','NE','sao pedro do piaui'),
('2210607','São Raimundo Nonato','PI','NE','sao raimundo nonato'),
('2210623','Sebastião Barros','PI','NE','sebastiao barros'),
('2210631','Sebastião Leal','PI','NE','sebastiao leal'),
('2210656','Sigefredo Pacheco','PI','NE','sigefredo pacheco'),
('2210706','Simões','PI','NE','simoes'),
('2210805','Simplício Mendes','PI','NE','simplicio mendes'),
('2210904','Socorro do Piauí','PI','NE','socorro do piaui'),
('2210938','Sussuapara','PI','NE','sussuapara'),
('2210953','Tamboril do Piauí','PI','NE','tamboril do piaui'),
('2210979','Tanque do Piauí','PI','NE','tanque do piaui'),
('2211001','Teresina','PI','NE','teresina'),
('2211100','União','PI','NE','uniao'),
('2211209','Uruçuí','PI','NE','urucui'),
('2211308','Valença do Piauí','PI','NE','valenca do piaui'),
('2211357','Várzea Branca','PI','NE','varzea branca'),
('2211407','Várzea Grande','PI','NE','varzea grande'),
('2211506','Vera Mendes','PI','NE','vera mendes'),
('2211605','Vila Nova do Piauí','PI','NE','vila nova do piaui'),
('2211704','Wall Ferraz','PI','NE','wall ferraz'),
('2300101','Abaiara','CE','NE','abaiara'),
('2300150','Acarape','CE','NE','acarape'),
('2300200','Acaraú','CE','NE','acarau'),
('2300309','Acopiara','CE','NE','acopiara'),
('2300408','Aiuaba','CE','NE','aiuaba'),
('2300507','Alcântaras','CE','NE','alcantaras'),
('2300606','Altaneira','CE','NE','altaneira'),
('2300705','Alto Santo','CE','NE','alto santo'),
('2300754','Amontada','CE','NE','amontada'),
('2300804','Antonina do Norte','CE','NE','antonina do norte'),
('2300903','Apuiarés','CE','NE','apuiares'),
('2301000','Aquiraz','CE','NE','aquiraz'),
('2301109','Aracati','CE','NE','aracati'),
('2301208','Aracoiaba','CE','NE','aracoiaba'),
('2301257','Ararendá','CE','NE','ararenda'),
('2301307','Araripe','CE','NE','araripe'),
('2301406','Aratuba','CE','NE','aratuba'),
('2301505','Arneiroz','CE','NE','arneiroz'),
('2301604','Assaré','CE','NE','assare'),
('2301703','Aurora','CE','NE','aurora'),
('2301802','Baixio','CE','NE','baixio'),
('2301851','Banabuiú','CE','NE','banabuiu'),
('2301901','Barbalha','CE','NE','barbalha'),
('2301950','Barreira','CE','NE','barreira'),
('2302008','Barro','CE','NE','barro'),
('2302057','Barroquinha','CE','NE','barroquinha'),
('2302107','Baturité','CE','NE','baturite'),
('2302206','Beberibe','CE','NE','beberibe'),
('2302305','Bela Cruz','CE','NE','bela cruz'),
('2302404','Boa Viagem','CE','NE','boa viagem'),
('2302503','Brejo Santo','CE','NE','brejo santo'),
('2302602','Camocim','CE','NE','camocim'),
('2302701','Campos Sales','CE','NE','campos sales'),
('2302800','Canindé','CE','NE','caninde'),
('2302909','Capistrano','CE','NE','capistrano'),
('2303006','Caridade','CE','NE','caridade'),
('2303105','Cariré','CE','NE','carire'),
('2303204','Caririaçu','CE','NE','caririacu'),
('2303303','Cariús','CE','NE','carius'),
('2303402','Carnaubal','CE','NE','carnaubal'),
('2303501','Cascavel','CE','NE','cascavel'),
('2303600','Catarina','CE','NE','catarina'),
('2303659','Catunda','CE','NE','catunda'),
('2303709','Caucaia','CE','NE','caucaia'),
('2303808','Cedro','CE','NE','cedro'),
('2303907','Chaval','CE','NE','chaval'),
('2303931','Choró','CE','NE','choro'),
('2303956','Chorozinho','CE','NE','chorozinho'),
('2304004','Coreaú','CE','NE','coreau'),
('2304103','Crateús','CE','NE','crateus'),
('2304202','Crato','CE','NE','crato'),
('2304236','Croatá','CE','NE','croata'),
('2304251','Cruz','CE','NE','cruz'),
('2304269','Deputado Irapuan Pinheiro','CE','NE','deputado irapuan pinheiro'),
('2304277','Ereré','CE','NE','erere'),
('2304285','Eusébio','CE','NE','eusebio'),
('2304301','Farias Brito','CE','NE','farias brito'),
('2304350','Forquilha','CE','NE','forquilha'),
('2304400','Fortaleza','CE','NE','fortaleza'),
('2304459','Fortim','CE','NE','fortim'),
('2304509','Frecheirinha','CE','NE','frecheirinha'),
('2304608','General Sampaio','CE','NE','general sampaio'),
('2304657','Graça','CE','NE','graca'),
('2304707','Granja','CE','NE','granja'),
('2304806','Granjeiro','CE','NE','granjeiro'),
('2304905','Groaíras','CE','NE','groairas'),
('2304954','Guaiúba','CE','NE','guaiuba'),
('2305001','Guaraciaba do Norte','CE','NE','guaraciaba do norte'),
('2305100','Guaramiranga','CE','NE','guaramiranga'),
('2305209','Hidrolândia','CE','NE','hidrolandia'),
('2305233','Horizonte','CE','NE','horizonte'),
('2305266','Ibaretama','CE','NE','ibaretama'),
('2305308','Ibiapina','CE','NE','ibiapina'),
('2305332','Ibicuitinga','CE','NE','ibicuitinga'),
('2305357','Icapuí','CE','NE','icapui'),
('2305407','Icó','CE','NE','ico'),
('2305506','Iguatu','CE','NE','iguatu'),
('2305605','Independência','CE','NE','independencia'),
('2305654','Ipaporanga','CE','NE','ipaporanga'),
('2305704','Ipaumirim','CE','NE','ipaumirim'),
('2305803','Ipu','CE','NE','ipu'),
('2305902','Ipueiras','CE','NE','ipueiras'),
('2306009','Iracema','CE','NE','iracema'),
('2306108','Irauçuba','CE','NE','iraucuba'),
('2306207','Itaiçaba','CE','NE','itaicaba'),
('2306256','Itaitinga','CE','NE','itaitinga'),
('2306306','Itapajé','CE','NE','itapaje'),
('2306405','Itapipoca','CE','NE','itapipoca'),
('2306504','Itapiúna','CE','NE','itapiuna'),
('2306553','Itarema','CE','NE','itarema'),
('2306603','Itatira','CE','NE','itatira'),
('2306702','Jaguaretama','CE','NE','jaguaretama'),
('2306801','Jaguaribara','CE','NE','jaguaribara'),
('2306900','Jaguaribe','CE','NE','jaguaribe'),
('2307007','Jaguaruana','CE','NE','jaguaruana'),
('2307106','Jardim','CE','NE','jardim'),
('2307205','Jati','CE','NE','jati'),
('2307254','Jijoca de Jericoacoara','CE','NE','jijoca de jericoacoara'),
('2307304','Juazeiro do Norte','CE','NE','juazeiro do norte'),
('2307403','Jucás','CE','NE','jucas'),
('2307502','Lavras da Mangabeira','CE','NE','lavras da mangabeira'),
('2307601','Limoeiro do Norte','CE','NE','limoeiro do norte'),
('2307635','Madalena','CE','NE','madalena'),
('2307650','Maracanaú','CE','NE','maracanau'),
('2307700','Maranguape','CE','NE','maranguape'),
('2307809','Marco','CE','NE','marco'),
('2307908','Martinópole','CE','NE','martinopole'),
('2308005','Massapê','CE','NE','massape'),
('2308104','Mauriti','CE','NE','mauriti'),
('2308203','Meruoca','CE','NE','meruoca'),
('2308302','Milagres','CE','NE','milagres'),
('2308351','Milhã','CE','NE','milha'),
('2308377','Miraíma','CE','NE','miraima'),
('2308401','Missão Velha','CE','NE','missao velha'),
('2308500','Mombaça','CE','NE','mombaca'),
('2308609','Monsenhor Tabosa','CE','NE','monsenhor tabosa'),
('2308708','Morada Nova','CE','NE','morada nova'),
('2308807','Moraújo','CE','NE','moraujo'),
('2308906','Morrinhos','CE','NE','morrinhos'),
('2309003','Mucambo','CE','NE','mucambo'),
('2309102','Mulungu','CE','NE','mulungu'),
('2309201','Nova Olinda','CE','NE','nova olinda'),
('2309300','Nova Russas','CE','NE','nova russas'),
('2309409','Novo Oriente','CE','NE','novo oriente'),
('2309458','Ocara','CE','NE','ocara'),
('2309508','Orós','CE','NE','oros'),
('2309607','Pacajus','CE','NE','pacajus'),
('2309706','Pacatuba','CE','NE','pacatuba'),
('2309805','Pacoti','CE','NE','pacoti'),
('2309904','Pacujá','CE','NE','pacuja'),
('2310001','Palhano','CE','NE','palhano'),
('2310100','Palmácia','CE','NE','palmacia'),
('2310209','Paracuru','CE','NE','paracuru'),
('2310258','Paraipaba','CE','NE','paraipaba'),
('2310308','Parambu','CE','NE','parambu'),
('2310407','Paramoti','CE','NE','paramoti'),
('2310506','Pedra Branca','CE','NE','pedra branca'),
('2310605','Penaforte','CE','NE','penaforte'),
('2310704','Pentecoste','CE','NE','pentecoste'),
('2310803','Pereiro','CE','NE','pereiro'),
('2310852','Pindoretama','CE','NE','pindoretama'),
('2310902','Piquet Carneiro','CE','NE','piquet carneiro'),
('2310951','Pires Ferreira','CE','NE','pires ferreira'),
('2311009','Poranga','CE','NE','poranga'),
('2311108','Porteiras','CE','NE','porteiras'),
('2311207','Potengi','CE','NE','potengi'),
('2311231','Potiretama','CE','NE','potiretama'),
('2311264','Quiterianópolis','CE','NE','quiterianopolis'),
('2311306','Quixadá','CE','NE','quixada'),
('2311355','Quixelô','CE','NE','quixelo'),
('2311405','Quixeramobim','CE','NE','quixeramobim'),
('2311504','Quixeré','CE','NE','quixere'),
('2311603','Redenção','CE','NE','redencao'),
('2311702','Reriutaba','CE','NE','reriutaba'),
('2311801','Russas','CE','NE','russas'),
('2311900','Saboeiro','CE','NE','saboeiro'),
('2311959','Salitre','CE','NE','salitre'),
('2312007','Santana do Acaraú','CE','NE','santana do acarau'),
('2312106','Santana do Cariri','CE','NE','santana do cariri'),
('2312205','Santa Quitéria','CE','NE','santa quiteria'),
('2312304','São Benedito','CE','NE','sao benedito'),
('2312403','São Gonçalo do Amarante','CE','NE','sao goncalo do amarante'),
('2312502','São João do Jaguaribe','CE','NE','sao joao do jaguaribe'),
('2312601','São Luís do Curu','CE','NE','sao luis do curu'),
('2312700','Senador Pompeu','CE','NE','senador pompeu'),
('2312809','Senador Sá','CE','NE','senador sa'),
('2312908','Sobral','CE','NE','sobral'),
('2313005','Solonópole','CE','NE','solonopole'),
('2313104','Tabuleiro do Norte','CE','NE','tabuleiro do norte'),
('2313203','Tamboril','CE','NE','tamboril'),
('2313252','Tarrafas','CE','NE','tarrafas'),
('2313302','Tauá','CE','NE','taua'),
('2313351','Tejuçuoca','CE','NE','tejucuoca'),
('2313401','Tianguá','CE','NE','tiangua'),
('2313500','Trairi','CE','NE','trairi'),
('2313559','Tururu','CE','NE','tururu'),
('2313609','Ubajara','CE','NE','ubajara'),
('2313708','Umari','CE','NE','umari'),
('2313757','Umirim','CE','NE','umirim'),
('2313807','Uruburetama','CE','NE','uruburetama'),
('2313906','Uruoca','CE','NE','uruoca'),
('2313955','Varjota','CE','NE','varjota'),
('2314003','Várzea Alegre','CE','NE','varzea alegre'),
('2314102','Viçosa do Ceará','CE','NE','vicosa do ceara'),
('2400109','Acari','RN','NE','acari'),
('2400208','Assú','RN','NE','assu'),
('2400307','Afonso Bezerra','RN','NE','afonso bezerra'),
('2400406','Água Nova','RN','NE','agua nova'),
('2400505','Alexandria','RN','NE','alexandria'),
('2400604','Almino Afonso','RN','NE','almino afonso'),
('2400703','Alto do Rodrigues','RN','NE','alto do rodrigues'),
('2400802','Angicos','RN','NE','angicos'),
('2400901','Antônio Martins','RN','NE','antonio martins'),
('2401008','Apodi','RN','NE','apodi'),
('2401107','Areia Branca','RN','NE','areia branca'),
('2401206','Arez','RN','NE','arez'),
('2401305','Campo Grande','RN','NE','campo grande'),
('2401404','Baía Formosa','RN','NE','baia formosa'),
('2401453','Baraúna','RN','NE','barauna'),
('2401503','Barcelona','RN','NE','barcelona'),
('2401602','Bento Fernandes','RN','NE','bento fernandes'),
('2401651','Bodó','RN','NE','bodo'),
('2401701','Bom Jesus','RN','NE','bom jesus'),
('2401800','Brejinho','RN','NE','brejinho'),
('2401859','Caiçara do Norte','RN','NE','caicara do norte'),
('2401909','Caiçara do Rio do Vento','RN','NE','caicara do rio do vento'),
('2402006','Caicó','RN','NE','caico'),
('2402105','Campo Redondo','RN','NE','campo redondo'),
('2402204','Canguaretama','RN','NE','canguaretama'),
('2402303','Caraúbas','RN','NE','caraubas'),
('2402402','Carnaúba dos Dantas','RN','NE','carnauba dos dantas'),
('2402501','Carnaubais','RN','NE','carnaubais'),
('2402600','Ceará-Mirim','RN','NE','ceara mirim'),
('2402709','Cerro Corá','RN','NE','cerro cora'),
('2402808','Coronel Ezequiel','RN','NE','coronel ezequiel'),
('2402907','Coronel João Pessoa','RN','NE','coronel joao pessoa'),
('2403004','Cruzeta','RN','NE','cruzeta'),
('2403103','Currais Novos','RN','NE','currais novos'),
('2403202','Doutor Severiano','RN','NE','doutor severiano'),
('2403251','Parnamirim','RN','NE','parnamirim'),
('2403301','Encanto','RN','NE','encanto'),
('2403400','Equador','RN','NE','equador'),
('2403509','Espírito Santo','RN','NE','espirito santo'),
('2403608','Extremoz','RN','NE','extremoz'),
('2403707','Felipe Guerra','RN','NE','felipe guerra'),
('2403756','Fernando Pedroza','RN','NE','fernando pedroza'),
('2403806','Florânia','RN','NE','florania'),
('2403905','Francisco Dantas','RN','NE','francisco dantas'),
('2404002','Frutuoso Gomes','RN','NE','frutuoso gomes'),
('2404101','Galinhos','RN','NE','galinhos'),
('2404200','Goianinha','RN','NE','goianinha'),
('2404309','Governador Dix-Sept Rosado','RN','NE','governador dix sept rosado'),
('2404408','Grossos','RN','NE','grossos'),
('2404507','Guamaré','RN','NE','guamare'),
('2404606','Ielmo Marinho','RN','NE','ielmo marinho'),
('2404705','Ipanguaçu','RN','NE','ipanguacu'),
('2404804','Ipueira','RN','NE','ipueira'),
('2404853','Itajá','RN','NE','itaja'),
('2404903','Itaú','RN','NE','itau'),
('2405009','Jaçanã','RN','NE','jacana'),
('2405108','Jandaíra','RN','NE','jandaira'),
('2405207','Janduís','RN','NE','janduis'),
('2405306','Januário Cicco','RN','NE','januario cicco'),
('2405405','Japi','RN','NE','japi'),
('2405504','Jardim de Angicos','RN','NE','jardim de angicos'),
('2405603','Jardim de Piranhas','RN','NE','jardim de piranhas'),
('2405702','Jardim do Seridó','RN','NE','jardim do serido'),
('2405801','João Câmara','RN','NE','joao camara'),
('2405900','João Dias','RN','NE','joao dias'),
('2406007','José da Penha','RN','NE','jose da penha'),
('2406106','Jucurutu','RN','NE','jucurutu'),
('2406155','Jundiá','RN','NE','jundia'),
('2406205','Lagoa d''Anta','RN','NE','lagoa d anta'),
('2406304','Lagoa de Pedras','RN','NE','lagoa de pedras'),
('2406403','Lagoa de Velhos','RN','NE','lagoa de velhos'),
('2406502','Lagoa Nova','RN','NE','lagoa nova'),
('2406601','Lagoa Salgada','RN','NE','lagoa salgada'),
('2406700','Lajes','RN','NE','lajes'),
('2406809','Lajes Pintadas','RN','NE','lajes pintadas'),
('2406908','Lucrécia','RN','NE','lucrecia'),
('2407005','Luís Gomes','RN','NE','luis gomes'),
('2407104','Macaíba','RN','NE','macaiba'),
('2407203','Macau','RN','NE','macau'),
('2407252','Major Sales','RN','NE','major sales'),
('2407302','Marcelino Vieira','RN','NE','marcelino vieira'),
('2407401','Martins','RN','NE','martins'),
('2407500','Maxaranguape','RN','NE','maxaranguape'),
('2407609','Messias Targino','RN','NE','messias targino'),
('2407708','Montanhas','RN','NE','montanhas'),
('2407807','Monte Alegre','RN','NE','monte alegre'),
('2407906','Monte das Gameleiras','RN','NE','monte das gameleiras'),
('2408003','Mossoró','RN','NE','mossoro'),
('2408102','Natal','RN','NE','natal'),
('2408201','Nísia Floresta','RN','NE','nisia floresta'),
('2408300','Nova Cruz','RN','NE','nova cruz'),
('2408409','Olho d''Água do Borges','RN','NE','olho d agua do borges'),
('2408508','Ouro Branco','RN','NE','ouro branco'),
('2408607','Paraná','RN','NE','parana'),
('2408706','Paraú','RN','NE','parau'),
('2408805','Parazinho','RN','NE','parazinho'),
('2408904','Parelhas','RN','NE','parelhas'),
('2408953','Rio do Fogo','RN','NE','rio do fogo'),
('2409100','Passa e Fica','RN','NE','passa e fica'),
('2409209','Passagem','RN','NE','passagem'),
('2409308','Patu','RN','NE','patu'),
('2409332','Santa Maria','RN','NE','santa maria'),
('2409407','Pau dos Ferros','RN','NE','pau dos ferros'),
('2409506','Pedra Grande','RN','NE','pedra grande'),
('2409605','Pedra Preta','RN','NE','pedra preta'),
('2409704','Pedro Avelino','RN','NE','pedro avelino'),
('2409803','Pedro Velho','RN','NE','pedro velho'),
('2409902','Pendências','RN','NE','pendencias'),
('2410009','Pilões','RN','NE','piloes'),
('2410108','Poço Branco','RN','NE','poco branco'),
('2410207','Portalegre','RN','NE','portalegre'),
('2410256','Porto do Mangue','RN','NE','porto do mangue'),
('2410306','Serra Caiada','RN','NE','serra caiada'),
('2410405','Pureza','RN','NE','pureza'),
('2410504','Rafael Fernandes','RN','NE','rafael fernandes'),
('2410603','Rafael Godeiro','RN','NE','rafael godeiro'),
('2410702','Riacho da Cruz','RN','NE','riacho da cruz'),
('2410801','Riacho de Santana','RN','NE','riacho de santana'),
('2410900','Riachuelo','RN','NE','riachuelo'),
('2411007','Rodolfo Fernandes','RN','NE','rodolfo fernandes'),
('2411056','Tibau','RN','NE','tibau'),
('2411106','Ruy Barbosa','RN','NE','ruy barbosa'),
('2411205','Santa Cruz','RN','NE','santa cruz'),
('2411403','Santana do Matos','RN','NE','santana do matos'),
('2411429','Santana do Seridó','RN','NE','santana do serido'),
('2411502','Santo Antônio','RN','NE','santo antonio'),
('2411601','São Bento do Norte','RN','NE','sao bento do norte'),
('2411700','São Bento do Trairí','RN','NE','sao bento do trairi'),
('2411809','São Fernando','RN','NE','sao fernando'),
('2411908','São Francisco do Oeste','RN','NE','sao francisco do oeste'),
('2412005','São Gonçalo do Amarante','RN','NE','sao goncalo do amarante'),
('2412104','São João do Sabugi','RN','NE','sao joao do sabugi'),
('2412203','São José de Mipibu','RN','NE','sao jose de mipibu'),
('2412302','São José do Campestre','RN','NE','sao jose do campestre'),
('2412401','São José do Seridó','RN','NE','sao jose do serido'),
('2412500','São Miguel','RN','NE','sao miguel'),
('2412559','São Miguel do Gostoso','RN','NE','sao miguel do gostoso'),
('2412609','São Paulo do Potengi','RN','NE','sao paulo do potengi'),
('2412708','São Pedro','RN','NE','sao pedro'),
('2412807','São Rafael','RN','NE','sao rafael'),
('2412906','São Tomé','RN','NE','sao tome'),
('2413003','São Vicente','RN','NE','sao vicente'),
('2413102','Senador Elói de Souza','RN','NE','senador eloi de souza'),
('2413201','Senador Georgino Avelino','RN','NE','senador georgino avelino'),
('2413300','Serra de São Bento','RN','NE','serra de sao bento'),
('2413359','Serra do Mel','RN','NE','serra do mel'),
('2413409','Serra Negra do Norte','RN','NE','serra negra do norte'),
('2413508','Serrinha','RN','NE','serrinha'),
('2413557','Serrinha dos Pintos','RN','NE','serrinha dos pintos'),
('2413607','Severiano Melo','RN','NE','severiano melo'),
('2413706','Sítio Novo','RN','NE','sitio novo'),
('2413805','Taboleiro Grande','RN','NE','taboleiro grande'),
('2413904','Taipu','RN','NE','taipu'),
('2414001','Tangará','RN','NE','tangara'),
('2414100','Tenente Ananias','RN','NE','tenente ananias'),
('2414159','Tenente Laurentino Cruz','RN','NE','tenente laurentino cruz'),
('2414209','Tibau do Sul','RN','NE','tibau do sul'),
('2414308','Timbaúba dos Batistas','RN','NE','timbauba dos batistas'),
('2414407','Touros','RN','NE','touros'),
('2414456','Triunfo Potiguar','RN','NE','triunfo potiguar'),
('2414506','Umarizal','RN','NE','umarizal'),
('2414605','Upanema','RN','NE','upanema'),
('2414704','Várzea','RN','NE','varzea'),
('2414753','Venha-Ver','RN','NE','venha ver'),
('2414803','Vera Cruz','RN','NE','vera cruz'),
('2414902','Viçosa','RN','NE','vicosa'),
('2415008','Vila Flor','RN','NE','vila flor'),
('2500106','Água Branca','PB','NE','agua branca'),
('2500205','Aguiar','PB','NE','aguiar'),
('2500304','Alagoa Grande','PB','NE','alagoa grande'),
('2500403','Alagoa Nova','PB','NE','alagoa nova'),
('2500502','Alagoinha','PB','NE','alagoinha'),
('2500536','Alcantil','PB','NE','alcantil'),
('2500577','Algodão de Jandaíra','PB','NE','algodao de jandaira'),
('2500601','Alhandra','PB','NE','alhandra'),
('2500700','São João do Rio do Peixe','PB','NE','sao joao do rio do peixe'),
('2500734','Amparo','PB','NE','amparo'),
('2500775','Aparecida','PB','NE','aparecida'),
('2500809','Araçagi','PB','NE','aracagi'),
('2500908','Arara','PB','NE','arara'),
('2501005','Araruna','PB','NE','araruna'),
('2501104','Areia','PB','NE','areia'),
('2501153','Areia de Baraúnas','PB','NE','areia de baraunas'),
('2501203','Areial','PB','NE','areial'),
('2501302','Aroeiras','PB','NE','aroeiras'),
('2501351','Assunção','PB','NE','assuncao'),
('2501401','Baía da Traição','PB','NE','baia da traicao'),
('2501500','Bananeiras','PB','NE','bananeiras'),
('2501534','Baraúna','PB','NE','barauna'),
('2501575','Barra de Santana','PB','NE','barra de santana'),
('2501609','Barra de Santa Rosa','PB','NE','barra de santa rosa'),
('2501708','Barra de São Miguel','PB','NE','barra de sao miguel'),
('2501807','Bayeux','PB','NE','bayeux'),
('2501906','Belém','PB','NE','belem'),
('2502003','Belém do Brejo do Cruz','PB','NE','belem do brejo do cruz'),
('2502052','Bernardino Batista','PB','NE','bernardino batista'),
('2502102','Boa Ventura','PB','NE','boa ventura'),
('2502151','Boa Vista','PB','NE','boa vista'),
('2502201','Bom Jesus','PB','NE','bom jesus'),
('2502300','Bom Sucesso','PB','NE','bom sucesso'),
('2502409','Bonito de Santa Fé','PB','NE','bonito de santa fe'),
('2502508','Boqueirão','PB','NE','boqueirao'),
('2502607','Igaracy','PB','NE','igaracy'),
('2502706','Borborema','PB','NE','borborema'),
('2502805','Brejo do Cruz','PB','NE','brejo do cruz'),
('2502904','Brejo dos Santos','PB','NE','brejo dos santos'),
('2503001','Caaporã','PB','NE','caapora'),
('2503100','Cabaceiras','PB','NE','cabaceiras'),
('2503209','Cabedelo','PB','NE','cabedelo'),
('2503308','Cachoeira dos Índios','PB','NE','cachoeira dos indios'),
('2503407','Cacimba de Areia','PB','NE','cacimba de areia'),
('2503506','Cacimba de Dentro','PB','NE','cacimba de dentro'),
('2503555','Cacimbas','PB','NE','cacimbas'),
('2503605','Caiçara','PB','NE','caicara'),
('2503704','Cajazeiras','PB','NE','cajazeiras'),
('2503753','Cajazeirinhas','PB','NE','cajazeirinhas'),
('2503803','Caldas Brandão','PB','NE','caldas brandao'),
('2503902','Camalaú','PB','NE','camalau'),
('2504009','Campina Grande','PB','NE','campina grande'),
('2504033','Capim','PB','NE','capim'),
('2504074','Caraúbas','PB','NE','caraubas'),
('2504108','Carrapateira','PB','NE','carrapateira'),
('2504157','Casserengue','PB','NE','casserengue'),
('2504207','Catingueira','PB','NE','catingueira'),
('2504306','Catolé do Rocha','PB','NE','catole do rocha'),
('2504355','Caturité','PB','NE','caturite'),
('2504405','Conceição','PB','NE','conceicao'),
('2504504','Condado','PB','NE','condado'),
('2504603','Conde','PB','NE','conde'),
('2504702','Congo','PB','NE','congo'),
('2504801','Coremas','PB','NE','coremas'),
('2504850','Coxixola','PB','NE','coxixola'),
('2504900','Cruz do Espírito Santo','PB','NE','cruz do espirito santo'),
('2505006','Cubati','PB','NE','cubati'),
('2505105','Cuité','PB','NE','cuite'),
('2505204','Cuitegi','PB','NE','cuitegi'),
('2505238','Cuité de Mamanguape','PB','NE','cuite de mamanguape'),
('2505279','Curral de Cima','PB','NE','curral de cima'),
('2505303','Curral Velho','PB','NE','curral velho'),
('2505352','Damião','PB','NE','damiao'),
('2505402','Desterro','PB','NE','desterro'),
('2505501','Vista Serrana','PB','NE','vista serrana'),
('2505600','Diamante','PB','NE','diamante'),
('2505709','Dona Inês','PB','NE','dona ines'),
('2505808','Duas Estradas','PB','NE','duas estradas'),
('2505907','Emas','PB','NE','emas'),
('2506004','Esperança','PB','NE','esperanca'),
('2506103','Fagundes','PB','NE','fagundes'),
('2506202','Frei Martinho','PB','NE','frei martinho'),
('2506251','Gado Bravo','PB','NE','gado bravo'),
('2506301','Guarabira','PB','NE','guarabira'),
('2506400','Gurinhém','PB','NE','gurinhem'),
('2506509','Gurjão','PB','NE','gurjao'),
('2506608','Ibiara','PB','NE','ibiara'),
('2506707','Imaculada','PB','NE','imaculada'),
('2506806','Ingá','PB','NE','inga'),
('2506905','Itabaiana','PB','NE','itabaiana'),
('2507002','Itaporanga','PB','NE','itaporanga'),
('2507101','Itapororoca','PB','NE','itapororoca'),
('2507200','Itatuba','PB','NE','itatuba'),
('2507309','Jacaraú','PB','NE','jacarau'),
('2507408','Jericó','PB','NE','jerico'),
('2507507','João Pessoa','PB','NE','joao pessoa'),
('2507606','Juarez Távora','PB','NE','juarez tavora'),
('2507705','Juazeirinho','PB','NE','juazeirinho'),
('2507804','Junco do Seridó','PB','NE','junco do serido'),
('2507903','Juripiranga','PB','NE','juripiranga'),
('2508000','Juru','PB','NE','juru'),
('2508109','Lagoa','PB','NE','lagoa'),
('2508208','Lagoa de Dentro','PB','NE','lagoa de dentro'),
('2508307','Lagoa Seca','PB','NE','lagoa seca'),
('2508406','Lastro','PB','NE','lastro'),
('2508505','Livramento','PB','NE','livramento'),
('2508554','Logradouro','PB','NE','logradouro'),
('2508604','Lucena','PB','NE','lucena'),
('2508703','Mãe d''Água','PB','NE','mae d agua'),
('2508802','Malta','PB','NE','malta'),
('2508901','Mamanguape','PB','NE','mamanguape'),
('2509008','Manaíra','PB','NE','manaira'),
('2509057','Marcação','PB','NE','marcacao'),
('2509107','Mari','PB','NE','mari'),
('2509156','Marizópolis','PB','NE','marizopolis'),
('2509206','Massaranduba','PB','NE','massaranduba'),
('2509305','Mataraca','PB','NE','mataraca'),
('2509339','Matinhas','PB','NE','matinhas'),
('2509370','Mato Grosso','PB','NE','mato grosso'),
('2509396','Maturéia','PB','NE','matureia'),
('2509404','Mogeiro','PB','NE','mogeiro'),
('2509503','Montadas','PB','NE','montadas'),
('2509602','Monte Horebe','PB','NE','monte horebe'),
('2509701','Monteiro','PB','NE','monteiro'),
('2509800','Mulungu','PB','NE','mulungu'),
('2509909','Natuba','PB','NE','natuba'),
('2510006','Nazarezinho','PB','NE','nazarezinho'),
('2510105','Nova Floresta','PB','NE','nova floresta'),
('2510204','Nova Olinda','PB','NE','nova olinda'),
('2510303','Nova Palmeira','PB','NE','nova palmeira'),
('2510402','Olho d''Água','PB','NE','olho d agua'),
('2510501','Olivedos','PB','NE','olivedos'),
('2510600','Ouro Velho','PB','NE','ouro velho'),
('2510659','Parari','PB','NE','parari'),
('2510709','Passagem','PB','NE','passagem'),
('2510808','Patos','PB','NE','patos'),
('2510907','Paulista','PB','NE','paulista'),
('2511004','Pedra Branca','PB','NE','pedra branca'),
('2511103','Pedra Lavrada','PB','NE','pedra lavrada'),
('2511202','Pedras de Fogo','PB','NE','pedras de fogo'),
('2511301','Piancó','PB','NE','pianco'),
('2511400','Picuí','PB','NE','picui'),
('2511509','Pilar','PB','NE','pilar'),
('2511608','Pilões','PB','NE','piloes'),
('2511707','Pilõezinhos','PB','NE','piloezinhos'),
('2511806','Pirpirituba','PB','NE','pirpirituba'),
('2511905','Pitimbu','PB','NE','pitimbu'),
('2512002','Pocinhos','PB','NE','pocinhos'),
('2512036','Poço Dantas','PB','NE','poco dantas'),
('2512077','Poço de José de Moura','PB','NE','poco de jose de moura'),
('2512101','Pombal','PB','NE','pombal'),
('2512200','Prata','PB','NE','prata'),
('2512309','Princesa Isabel','PB','NE','princesa isabel'),
('2512408','Puxinanã','PB','NE','puxinana'),
('2512507','Queimadas','PB','NE','queimadas'),
('2512606','Quixaba','PB','NE','quixaba'),
('2512705','Remígio','PB','NE','remigio'),
('2512721','Pedro Régis','PB','NE','pedro regis'),
('2512747','Riachão','PB','NE','riachao'),
('2512754','Riachão do Bacamarte','PB','NE','riachao do bacamarte'),
('2512762','Riachão do Poço','PB','NE','riachao do poco'),
('2512788','Riacho de Santo Antônio','PB','NE','riacho de santo antonio'),
('2512804','Riacho dos Cavalos','PB','NE','riacho dos cavalos'),
('2512903','Rio Tinto','PB','NE','rio tinto'),
('2513000','Salgadinho','PB','NE','salgadinho'),
('2513109','Salgado de São Félix','PB','NE','salgado de sao felix'),
('2513158','Santa Cecília','PB','NE','santa cecilia'),
('2513208','Santa Cruz','PB','NE','santa cruz'),
('2513307','Santa Helena','PB','NE','santa helena'),
('2513356','Santa Inês','PB','NE','santa ines'),
('2513406','Santa Luzia','PB','NE','santa luzia'),
('2513505','Santana de Mangueira','PB','NE','santana de mangueira'),
('2513604','Santana dos Garrotes','PB','NE','santana dos garrotes'),
('2513653','Joca Claudino','PB','NE','joca claudino'),
('2513703','Santa Rita','PB','NE','santa rita'),
('2513802','Santa Teresinha','PB','NE','santa teresinha'),
('2513851','Santo André','PB','NE','santo andre'),
('2513901','São Bento','PB','NE','sao bento'),
('2513927','São Bentinho','PB','NE','sao bentinho'),
('2513943','São Domingos do Cariri','PB','NE','sao domingos do cariri'),
('2513968','São Domingos','PB','NE','sao domingos'),
('2513984','São Francisco','PB','NE','sao francisco'),
('2514008','São João do Cariri','PB','NE','sao joao do cariri'),
('2514107','São João do Tigre','PB','NE','sao joao do tigre'),
('2514206','São José da Lagoa Tapada','PB','NE','sao jose da lagoa tapada'),
('2514305','São José de Caiana','PB','NE','sao jose de caiana'),
('2514404','São José de Espinharas','PB','NE','sao jose de espinharas'),
('2514453','São José dos Ramos','PB','NE','sao jose dos ramos'),
('2514503','São José de Piranhas','PB','NE','sao jose de piranhas'),
('2514552','São José de Princesa','PB','NE','sao jose de princesa'),
('2514602','São José do Bonfim','PB','NE','sao jose do bonfim'),
('2514651','São José do Brejo do Cruz','PB','NE','sao jose do brejo do cruz'),
('2514701','São José do Sabugi','PB','NE','sao jose do sabugi'),
('2514800','São José dos Cordeiros','PB','NE','sao jose dos cordeiros'),
('2514909','São Mamede','PB','NE','sao mamede'),
('2515005','São Miguel de Taipu','PB','NE','sao miguel de taipu'),
('2515104','São Sebastião de Lagoa de Roça','PB','NE','sao sebastiao de lagoa de roca'),
('2515203','São Sebastião do Umbuzeiro','PB','NE','sao sebastiao do umbuzeiro'),
('2515302','Sapé','PB','NE','sape'),
('2515401','São Vicente do Seridó','PB','NE','sao vicente do serido'),
('2515500','Serra Branca','PB','NE','serra branca'),
('2515609','Serra da Raiz','PB','NE','serra da raiz'),
('2515708','Serra Grande','PB','NE','serra grande'),
('2515807','Serra Redonda','PB','NE','serra redonda'),
('2515906','Serraria','PB','NE','serraria'),
('2515930','Sertãozinho','PB','NE','sertaozinho'),
('2515971','Sobrado','PB','NE','sobrado'),
('2516003','Solânea','PB','NE','solanea'),
('2516102','Soledade','PB','NE','soledade'),
('2516151','Sossêgo','PB','NE','sossego'),
('2516201','Sousa','PB','NE','sousa'),
('2516300','Sumé','PB','NE','sume'),
('2516409','Tacima','PB','NE','tacima'),
('2516508','Taperoá','PB','NE','taperoa'),
('2516607','Tavares','PB','NE','tavares'),
('2516706','Teixeira','PB','NE','teixeira'),
('2516755','Tenório','PB','NE','tenorio'),
('2516805','Triunfo','PB','NE','triunfo'),
('2516904','Uiraúna','PB','NE','uirauna'),
('2517001','Umbuzeiro','PB','NE','umbuzeiro'),
('2517100','Várzea','PB','NE','varzea'),
('2517209','Vieirópolis','PB','NE','vieiropolis'),
('2517407','Zabelê','PB','NE','zabele'),
('2600054','Abreu e Lima','PE','NE','abreu e lima'),
('2600104','Afogados da Ingazeira','PE','NE','afogados da ingazeira'),
('2600203','Afrânio','PE','NE','afranio'),
('2600302','Agrestina','PE','NE','agrestina'),
('2600401','Água Preta','PE','NE','agua preta'),
('2600500','Águas Belas','PE','NE','aguas belas'),
('2600609','Alagoinha','PE','NE','alagoinha'),
('2600708','Aliança','PE','NE','alianca'),
('2600807','Altinho','PE','NE','altinho'),
('2600906','Amaraji','PE','NE','amaraji'),
('2601003','Angelim','PE','NE','angelim'),
('2601052','Araçoiaba','PE','NE','aracoiaba'),
('2601102','Araripina','PE','NE','araripina'),
('2601201','Arcoverde','PE','NE','arcoverde'),
('2601300','Barra de Guabiraba','PE','NE','barra de guabiraba'),
('2601409','Barreiros','PE','NE','barreiros'),
('2601508','Belém de Maria','PE','NE','belem de maria'),
('2601607','Belém do São Francisco','PE','NE','belem do sao francisco'),
('2601706','Belo Jardim','PE','NE','belo jardim'),
('2601805','Betânia','PE','NE','betania'),
('2601904','Bezerros','PE','NE','bezerros'),
('2602001','Bodocó','PE','NE','bodoco'),
('2602100','Bom Conselho','PE','NE','bom conselho'),
('2602209','Bom Jardim','PE','NE','bom jardim'),
('2602308','Bonito','PE','NE','bonito'),
('2602407','Brejão','PE','NE','brejao'),
('2602506','Brejinho','PE','NE','brejinho'),
('2602605','Brejo da Madre de Deus','PE','NE','brejo da madre de deus'),
('2602704','Buenos Aires','PE','NE','buenos aires'),
('2602803','Buíque','PE','NE','buique'),
('2602902','Cabo de Santo Agostinho','PE','NE','cabo de santo agostinho'),
('2603009','Cabrobó','PE','NE','cabrobo'),
('2603108','Cachoeirinha','PE','NE','cachoeirinha'),
('2603207','Caetés','PE','NE','caetes'),
('2603306','Calçado','PE','NE','calcado'),
('2603405','Calumbi','PE','NE','calumbi'),
('2603454','Camaragibe','PE','NE','camaragibe'),
('2603504','Camocim de São Félix','PE','NE','camocim de sao felix'),
('2603603','Camutanga','PE','NE','camutanga'),
('2603702','Canhotinho','PE','NE','canhotinho'),
('2603801','Capoeiras','PE','NE','capoeiras'),
('2603900','Carnaíba','PE','NE','carnaiba'),
('2603926','Carnaubeira da Penha','PE','NE','carnaubeira da penha'),
('2604007','Carpina','PE','NE','carpina'),
('2604106','Caruaru','PE','NE','caruaru'),
('2604155','Casinhas','PE','NE','casinhas'),
('2604205','Catende','PE','NE','catende'),
('2604304','Cedro','PE','NE','cedro'),
('2604403','Chã de Alegria','PE','NE','cha de alegria'),
('2604502','Chã Grande','PE','NE','cha grande'),
('2604601','Condado','PE','NE','condado'),
('2604700','Correntes','PE','NE','correntes'),
('2604809','Cortês','PE','NE','cortes'),
('2604908','Cumaru','PE','NE','cumaru'),
('2605004','Cupira','PE','NE','cupira'),
('2605103','Custódia','PE','NE','custodia'),
('2605152','Dormentes','PE','NE','dormentes'),
('2605202','Escada','PE','NE','escada'),
('2605301','Exu','PE','NE','exu'),
('2605400','Feira Nova','PE','NE','feira nova'),
('2605459','Fernando de Noronha','PE','NE','fernando de noronha'),
('2605509','Ferreiros','PE','NE','ferreiros'),
('2605608','Flores','PE','NE','flores'),
('2605707','Floresta','PE','NE','floresta'),
('2605806','Frei Miguelinho','PE','NE','frei miguelinho'),
('2605905','Gameleira','PE','NE','gameleira'),
('2606002','Garanhuns','PE','NE','garanhuns'),
('2606101','Glória do Goitá','PE','NE','gloria do goita'),
('2606200','Goiana','PE','NE','goiana'),
('2606309','Granito','PE','NE','granito'),
('2606408','Gravatá','PE','NE','gravata'),
('2606507','Iati','PE','NE','iati'),
('2606606','Ibimirim','PE','NE','ibimirim'),
('2606705','Ibirajuba','PE','NE','ibirajuba'),
('2606804','Igarassu','PE','NE','igarassu'),
('2606903','Iguaracy','PE','NE','iguaracy'),
('2607000','Inajá','PE','NE','inaja'),
('2607109','Ingazeira','PE','NE','ingazeira'),
('2607208','Ipojuca','PE','NE','ipojuca'),
('2607307','Ipubi','PE','NE','ipubi'),
('2607406','Itacuruba','PE','NE','itacuruba'),
('2607505','Itaíba','PE','NE','itaiba'),
('2607604','Ilha de Itamaracá','PE','NE','ilha de itamaraca'),
('2607653','Itambé','PE','NE','itambe'),
('2607703','Itapetim','PE','NE','itapetim'),
('2607752','Itapissuma','PE','NE','itapissuma'),
('2607802','Itaquitinga','PE','NE','itaquitinga'),
('2607901','Jaboatão dos Guararapes','PE','NE','jaboatao dos guararapes'),
('2607950','Jaqueira','PE','NE','jaqueira'),
('2608008','Jataúba','PE','NE','jatauba'),
('2608057','Jatobá','PE','NE','jatoba'),
('2608107','João Alfredo','PE','NE','joao alfredo'),
('2608206','Joaquim Nabuco','PE','NE','joaquim nabuco'),
('2608255','Jucati','PE','NE','jucati'),
('2608305','Jupi','PE','NE','jupi'),
('2608404','Jurema','PE','NE','jurema'),
('2608453','Lagoa do Carro','PE','NE','lagoa do carro'),
('2608503','Lagoa de Itaenga','PE','NE','lagoa de itaenga'),
('2608602','Lagoa do Ouro','PE','NE','lagoa do ouro'),
('2608701','Lagoa dos Gatos','PE','NE','lagoa dos gatos'),
('2608750','Lagoa Grande','PE','NE','lagoa grande'),
('2608800','Lajedo','PE','NE','lajedo'),
('2608909','Limoeiro','PE','NE','limoeiro'),
('2609006','Macaparana','PE','NE','macaparana'),
('2609105','Machados','PE','NE','machados'),
('2609154','Manari','PE','NE','manari'),
('2609204','Maraial','PE','NE','maraial'),
('2609303','Mirandiba','PE','NE','mirandiba'),
('2609402','Moreno','PE','NE','moreno'),
('2609501','Nazaré da Mata','PE','NE','nazare da mata'),
('2609600','Olinda','PE','NE','olinda'),
('2609709','Orobó','PE','NE','orobo'),
('2609808','Orocó','PE','NE','oroco'),
('2609907','Ouricuri','PE','NE','ouricuri'),
('2610004','Palmares','PE','NE','palmares'),
('2610103','Palmeirina','PE','NE','palmeirina'),
('2610202','Panelas','PE','NE','panelas'),
('2610301','Paranatama','PE','NE','paranatama'),
('2610400','Parnamirim','PE','NE','parnamirim'),
('2610509','Passira','PE','NE','passira'),
('2610608','Paudalho','PE','NE','paudalho'),
('2610707','Paulista','PE','NE','paulista'),
('2610806','Pedra','PE','NE','pedra'),
('2610905','Pesqueira','PE','NE','pesqueira'),
('2611002','Petrolândia','PE','NE','petrolandia'),
('2611101','Petrolina','PE','NE','petrolina'),
('2611200','Poção','PE','NE','pocao'),
('2611309','Pombos','PE','NE','pombos'),
('2611408','Primavera','PE','NE','primavera'),
('2611507','Quipapá','PE','NE','quipapa'),
('2611533','Quixaba','PE','NE','quixaba'),
('2611606','Recife','PE','NE','recife'),
('2611705','Riacho das Almas','PE','NE','riacho das almas'),
('2611804','Ribeirão','PE','NE','ribeirao'),
('2611903','Rio Formoso','PE','NE','rio formoso'),
('2612000','Sairé','PE','NE','saire'),
('2612109','Salgadinho','PE','NE','salgadinho'),
('2612208','Salgueiro','PE','NE','salgueiro'),
('2612307','Saloá','PE','NE','saloa'),
('2612406','Sanharó','PE','NE','sanharo'),
('2612455','Santa Cruz','PE','NE','santa cruz'),
('2612471','Santa Cruz da Baixa Verde','PE','NE','santa cruz da baixa verde'),
('2612505','Santa Cruz do Capibaribe','PE','NE','santa cruz do capibaribe'),
('2612554','Santa Filomena','PE','NE','santa filomena'),
('2612604','Santa Maria da Boa Vista','PE','NE','santa maria da boa vista'),
('2612703','Santa Maria do Cambucá','PE','NE','santa maria do cambuca'),
('2612802','Santa Terezinha','PE','NE','santa terezinha'),
('2612901','São Benedito do Sul','PE','NE','sao benedito do sul'),
('2613008','São Bento do Una','PE','NE','sao bento do una'),
('2613107','São Caitano','PE','NE','sao caitano'),
('2613206','São João','PE','NE','sao joao'),
('2613305','São Joaquim do Monte','PE','NE','sao joaquim do monte'),
('2613404','São José da Coroa Grande','PE','NE','sao jose da coroa grande'),
('2613503','São José do Belmonte','PE','NE','sao jose do belmonte'),
('2613602','São José do Egito','PE','NE','sao jose do egito'),
('2613701','São Lourenço da Mata','PE','NE','sao lourenco da mata'),
('2613800','São Vicente Férrer','PE','NE','sao vicente ferrer'),
('2613909','Serra Talhada','PE','NE','serra talhada'),
('2614006','Serrita','PE','NE','serrita'),
('2614105','Sertânia','PE','NE','sertania'),
('2614204','Sirinhaém','PE','NE','sirinhaem'),
('2614303','Moreilândia','PE','NE','moreilandia'),
('2614402','Solidão','PE','NE','solidao'),
('2614501','Surubim','PE','NE','surubim'),
('2614600','Tabira','PE','NE','tabira'),
('2614709','Tacaimbó','PE','NE','tacaimbo'),
('2614808','Tacaratu','PE','NE','tacaratu'),
('2614857','Tamandaré','PE','NE','tamandare'),
('2615003','Taquaritinga do Norte','PE','NE','taquaritinga do norte'),
('2615102','Terezinha','PE','NE','terezinha'),
('2615201','Terra Nova','PE','NE','terra nova'),
('2615300','Timbaúba','PE','NE','timbauba'),
('2615409','Toritama','PE','NE','toritama'),
('2615508','Tracunhaém','PE','NE','tracunhaem'),
('2615607','Trindade','PE','NE','trindade'),
('2615706','Triunfo','PE','NE','triunfo'),
('2615805','Tupanatinga','PE','NE','tupanatinga'),
('2615904','Tuparetama','PE','NE','tuparetama'),
('2616001','Venturosa','PE','NE','venturosa'),
('2616100','Verdejante','PE','NE','verdejante'),
('2616183','Vertente do Lério','PE','NE','vertente do lerio'),
('2616209','Vertentes','PE','NE','vertentes'),
('2616308','Vicência','PE','NE','vicencia'),
('2616407','Vitória de Santo Antão','PE','NE','vitoria de santo antao'),
('2616506','Xexéu','PE','NE','xexeu'),
('2700102','Água Branca','AL','NE','agua branca'),
('2700201','Anadia','AL','NE','anadia'),
('2700300','Arapiraca','AL','NE','arapiraca'),
('2700409','Atalaia','AL','NE','atalaia'),
('2700508','Barra de Santo Antônio','AL','NE','barra de santo antonio'),
('2700607','Barra de São Miguel','AL','NE','barra de sao miguel'),
('2700706','Batalha','AL','NE','batalha'),
('2700805','Belém','AL','NE','belem'),
('2700904','Belo Monte','AL','NE','belo monte'),
('2701001','Boca da Mata','AL','NE','boca da mata'),
('2701100','Branquinha','AL','NE','branquinha'),
('2701209','Cacimbinhas','AL','NE','cacimbinhas'),
('2701308','Cajueiro','AL','NE','cajueiro'),
('2701357','Campestre','AL','NE','campestre'),
('2701407','Campo Alegre','AL','NE','campo alegre'),
('2701506','Campo Grande','AL','NE','campo grande'),
('2701605','Canapi','AL','NE','canapi'),
('2701704','Capela','AL','NE','capela'),
('2701803','Carneiros','AL','NE','carneiros'),
('2701902','Chã Preta','AL','NE','cha preta'),
('2702009','Coité do Nóia','AL','NE','coite do noia'),
('2702108','Colônia Leopoldina','AL','NE','colonia leopoldina'),
('2702207','Coqueiro Seco','AL','NE','coqueiro seco'),
('2702306','Coruripe','AL','NE','coruripe'),
('2702355','Craíbas','AL','NE','craibas'),
('2702405','Delmiro Gouveia','AL','NE','delmiro gouveia'),
('2702504','Dois Riachos','AL','NE','dois riachos'),
('2702553','Estrela de Alagoas','AL','NE','estrela de alagoas'),
('2702603','Feira Grande','AL','NE','feira grande'),
('2702702','Feliz Deserto','AL','NE','feliz deserto'),
('2702801','Flexeiras','AL','NE','flexeiras'),
('2702900','Girau do Ponciano','AL','NE','girau do ponciano'),
('2703007','Ibateguara','AL','NE','ibateguara'),
('2703106','Igaci','AL','NE','igaci'),
('2703205','Igreja Nova','AL','NE','igreja nova'),
('2703304','Inhapi','AL','NE','inhapi'),
('2703403','Jacaré dos Homens','AL','NE','jacare dos homens'),
('2703502','Jacuípe','AL','NE','jacuipe'),
('2703601','Japaratinga','AL','NE','japaratinga'),
('2703700','Jaramataia','AL','NE','jaramataia'),
('2703759','Jequiá da Praia','AL','NE','jequia da praia'),
('2703809','Joaquim Gomes','AL','NE','joaquim gomes'),
('2703908','Jundiá','AL','NE','jundia'),
('2704005','Junqueiro','AL','NE','junqueiro'),
('2704104','Lagoa da Canoa','AL','NE','lagoa da canoa'),
('2704203','Limoeiro de Anadia','AL','NE','limoeiro de anadia'),
('2704302','Maceió','AL','NE','maceio'),
('2704401','Major Isidoro','AL','NE','major isidoro'),
('2704500','Maragogi','AL','NE','maragogi'),
('2704609','Maravilha','AL','NE','maravilha'),
('2704708','Marechal Deodoro','AL','NE','marechal deodoro'),
('2704807','Maribondo','AL','NE','maribondo'),
('2704906','Mar Vermelho','AL','NE','mar vermelho'),
('2705002','Mata Grande','AL','NE','mata grande'),
('2705101','Matriz de Camaragibe','AL','NE','matriz de camaragibe'),
('2705200','Messias','AL','NE','messias'),
('2705309','Minador do Negrão','AL','NE','minador do negrao'),
('2705408','Monteirópolis','AL','NE','monteiropolis'),
('2705507','Murici','AL','NE','murici'),
('2705606','Novo Lino','AL','NE','novo lino'),
('2705705','Olho d''Água das Flores','AL','NE','olho d agua das flores'),
('2705804','Olho d''Água do Casado','AL','NE','olho d agua do casado'),
('2705903','Olho d''Água Grande','AL','NE','olho d agua grande'),
('2706000','Olivença','AL','NE','olivenca'),
('2706109','Ouro Branco','AL','NE','ouro branco'),
('2706208','Palestina','AL','NE','palestina'),
('2706307','Palmeira dos Índios','AL','NE','palmeira dos indios'),
('2706406','Pão de Açúcar','AL','NE','pao de acucar'),
('2706422','Pariconha','AL','NE','pariconha'),
('2706448','Paripueira','AL','NE','paripueira'),
('2706505','Passo de Camaragibe','AL','NE','passo de camaragibe'),
('2706604','Paulo Jacinto','AL','NE','paulo jacinto'),
('2706703','Penedo','AL','NE','penedo'),
('2706802','Piaçabuçu','AL','NE','piacabucu'),
('2706901','Pilar','AL','NE','pilar'),
('2707008','Pindoba','AL','NE','pindoba'),
('2707107','Piranhas','AL','NE','piranhas'),
('2707206','Poço das Trincheiras','AL','NE','poco das trincheiras'),
('2707305','Porto Calvo','AL','NE','porto calvo'),
('2707404','Porto de Pedras','AL','NE','porto de pedras'),
('2707503','Porto Real do Colégio','AL','NE','porto real do colegio'),
('2707602','Quebrangulo','AL','NE','quebrangulo'),
('2707701','Rio Largo','AL','NE','rio largo'),
('2707800','Roteiro','AL','NE','roteiro'),
('2707909','Santa Luzia do Norte','AL','NE','santa luzia do norte'),
('2708006','Santana do Ipanema','AL','NE','santana do ipanema'),
('2708105','Santana do Mundaú','AL','NE','santana do mundau'),
('2708204','São Brás','AL','NE','sao bras'),
('2708303','São José da Laje','AL','NE','sao jose da laje'),
('2708402','São José da Tapera','AL','NE','sao jose da tapera'),
('2708501','São Luís do Quitunde','AL','NE','sao luis do quitunde'),
('2708600','São Miguel dos Campos','AL','NE','sao miguel dos campos'),
('2708709','São Miguel dos Milagres','AL','NE','sao miguel dos milagres'),
('2708808','São Sebastião','AL','NE','sao sebastiao'),
('2708907','Satuba','AL','NE','satuba'),
('2708956','Senador Rui Palmeira','AL','NE','senador rui palmeira'),
('2709004','Tanque d''Arca','AL','NE','tanque d arca'),
('2709103','Taquarana','AL','NE','taquarana'),
('2709152','Teotônio Vilela','AL','NE','teotonio vilela'),
('2709202','Traipu','AL','NE','traipu'),
('2709301','União dos Palmares','AL','NE','uniao dos palmares'),
('2709400','Viçosa','AL','NE','vicosa'),
('2800100','Amparo do São Francisco','SE','NE','amparo do sao francisco'),
('2800209','Aquidabã','SE','NE','aquidaba'),
('2800308','Aracaju','SE','NE','aracaju'),
('2800407','Arauá','SE','NE','araua'),
('2800506','Areia Branca','SE','NE','areia branca'),
('2800605','Barra dos Coqueiros','SE','NE','barra dos coqueiros'),
('2800670','Boquim','SE','NE','boquim'),
('2800704','Brejo Grande','SE','NE','brejo grande'),
('2801009','Campo do Brito','SE','NE','campo do brito'),
('2801108','Canhoba','SE','NE','canhoba'),
('2801207','Canindé de São Francisco','SE','NE','caninde de sao francisco'),
('2801306','Capela','SE','NE','capela'),
('2801405','Carira','SE','NE','carira'),
('2801504','Carmópolis','SE','NE','carmopolis'),
('2801603','Cedro de São João','SE','NE','cedro de sao joao'),
('2801702','Cristinápolis','SE','NE','cristinapolis'),
('2801900','Cumbe','SE','NE','cumbe'),
('2802007','Divina Pastora','SE','NE','divina pastora'),
('2802106','Estância','SE','NE','estancia'),
('2802205','Feira Nova','SE','NE','feira nova'),
('2802304','Frei Paulo','SE','NE','frei paulo'),
('2802403','Gararu','SE','NE','gararu'),
('2802502','General Maynard','SE','NE','general maynard'),
('2802601','Graccho Cardoso','SE','NE','graccho cardoso'),
('2802700','Ilha das Flores','SE','NE','ilha das flores'),
('2802809','Indiaroba','SE','NE','indiaroba'),
('2802908','Itabaiana','SE','NE','itabaiana'),
('2803005','Itabaianinha','SE','NE','itabaianinha'),
('2803104','Itabi','SE','NE','itabi'),
('2803203','Itaporanga d''Ajuda','SE','NE','itaporanga d ajuda'),
('2803302','Japaratuba','SE','NE','japaratuba'),
('2803401','Japoatã','SE','NE','japoata'),
('2803500','Lagarto','SE','NE','lagarto'),
('2803609','Laranjeiras','SE','NE','laranjeiras'),
('2803708','Macambira','SE','NE','macambira'),
('2803807','Malhada dos Bois','SE','NE','malhada dos bois'),
('2803906','Malhador','SE','NE','malhador'),
('2804003','Maruim','SE','NE','maruim'),
('2804102','Moita Bonita','SE','NE','moita bonita'),
('2804201','Monte Alegre de Sergipe','SE','NE','monte alegre de sergipe'),
('2804300','Muribeca','SE','NE','muribeca'),
('2804409','Neópolis','SE','NE','neopolis'),
('2804458','Nossa Senhora Aparecida','SE','NE','nossa senhora aparecida'),
('2804508','Nossa Senhora da Glória','SE','NE','nossa senhora da gloria'),
('2804607','Nossa Senhora das Dores','SE','NE','nossa senhora das dores'),
('2804706','Nossa Senhora de Lourdes','SE','NE','nossa senhora de lourdes'),
('2804805','Nossa Senhora do Socorro','SE','NE','nossa senhora do socorro'),
('2804904','Pacatuba','SE','NE','pacatuba'),
('2805000','Pedra Mole','SE','NE','pedra mole'),
('2805109','Pedrinhas','SE','NE','pedrinhas'),
('2805208','Pinhão','SE','NE','pinhao'),
('2805307','Pirambu','SE','NE','pirambu'),
('2805406','Poço Redondo','SE','NE','poco redondo'),
('2805505','Poço Verde','SE','NE','poco verde'),
('2805604','Porto da Folha','SE','NE','porto da folha'),
('2805703','Propriá','SE','NE','propria'),
('2805802','Riachão do Dantas','SE','NE','riachao do dantas'),
('2805901','Riachuelo','SE','NE','riachuelo'),
('2806008','Ribeirópolis','SE','NE','ribeiropolis'),
('2806107','Rosário do Catete','SE','NE','rosario do catete'),
('2806206','Salgado','SE','NE','salgado'),
('2806305','Santa Luzia do Itanhy','SE','NE','santa luzia do itanhy'),
('2806404','Santana do São Francisco','SE','NE','santana do sao francisco'),
('2806503','Santa Rosa de Lima','SE','NE','santa rosa de lima'),
('2806602','Santo Amaro das Brotas','SE','NE','santo amaro das brotas'),
('2806701','São Cristóvão','SE','NE','sao cristovao'),
('2806800','São Domingos','SE','NE','sao domingos'),
('2806909','São Francisco','SE','NE','sao francisco'),
('2807006','São Miguel do Aleixo','SE','NE','sao miguel do aleixo'),
('2807105','Simão Dias','SE','NE','simao dias'),
('2807204','Siriri','SE','NE','siriri'),
('2807303','Telha','SE','NE','telha'),
('2807402','Tobias Barreto','SE','NE','tobias barreto'),
('2807501','Tomar do Geru','SE','NE','tomar do geru'),
('2807600','Umbaúba','SE','NE','umbauba'),
('2900108','Abaíra','BA','NE','abaira'),
('2900207','Abaré','BA','NE','abare'),
('2900306','Acajutiba','BA','NE','acajutiba'),
('2900355','Adustina','BA','NE','adustina'),
('2900405','Água Fria','BA','NE','agua fria'),
('2900504','Érico Cardoso','BA','NE','erico cardoso'),
('2900603','Aiquara','BA','NE','aiquara'),
('2900702','Alagoinhas','BA','NE','alagoinhas'),
('2900801','Alcobaça','BA','NE','alcobaca'),
('2900900','Almadina','BA','NE','almadina'),
('2901007','Amargosa','BA','NE','amargosa'),
('2901106','Amélia Rodrigues','BA','NE','amelia rodrigues'),
('2901155','América Dourada','BA','NE','america dourada'),
('2901205','Anagé','BA','NE','anage'),
('2901304','Andaraí','BA','NE','andarai'),
('2901353','Andorinha','BA','NE','andorinha'),
('2901403','Angical','BA','NE','angical'),
('2901502','Anguera','BA','NE','anguera'),
('2901601','Antas','BA','NE','antas'),
('2901700','Antônio Cardoso','BA','NE','antonio cardoso'),
('2901809','Antônio Gonçalves','BA','NE','antonio goncalves'),
('2901908','Aporá','BA','NE','apora'),
('2901957','Apuarema','BA','NE','apuarema'),
('2902005','Aracatu','BA','NE','aracatu'),
('2902054','Araçás','BA','NE','aracas'),
('2902104','Araci','BA','NE','araci'),
('2902203','Aramari','BA','NE','aramari'),
('2902252','Arataca','BA','NE','arataca'),
('2902302','Aratuípe','BA','NE','aratuipe'),
('2902401','Aurelino Leal','BA','NE','aurelino leal'),
('2902500','Baianópolis','BA','NE','baianopolis'),
('2902609','Baixa Grande','BA','NE','baixa grande'),
('2902658','Banzaê','BA','NE','banzae'),
('2902708','Barra','BA','NE','barra'),
('2902807','Barra da Estiva','BA','NE','barra da estiva'),
('2902906','Barra do Choça','BA','NE','barra do choca'),
('2903003','Barra do Mendes','BA','NE','barra do mendes'),
('2903102','Barra do Rocha','BA','NE','barra do rocha'),
('2903201','Barreiras','BA','NE','barreiras'),
('2903235','Barro Alto','BA','NE','barro alto'),
('2903276','Barrocas','BA','NE','barrocas'),
('2903300','Barro Preto','BA','NE','barro preto'),
('2903409','Belmonte','BA','NE','belmonte'),
('2903508','Belo Campo','BA','NE','belo campo'),
('2903607','Biritinga','BA','NE','biritinga'),
('2903706','Boa Nova','BA','NE','boa nova'),
('2903805','Boa Vista do Tupim','BA','NE','boa vista do tupim'),
('2903904','Bom Jesus da Lapa','BA','NE','bom jesus da lapa'),
('2903953','Bom Jesus da Serra','BA','NE','bom jesus da serra'),
('2904001','Boninal','BA','NE','boninal'),
('2904050','Bonito','BA','NE','bonito'),
('2904100','Boquira','BA','NE','boquira'),
('2904209','Botuporã','BA','NE','botupora'),
('2904308','Brejões','BA','NE','brejoes'),
('2904407','Brejolândia','BA','NE','brejolandia'),
('2904506','Brotas de Macaúbas','BA','NE','brotas de macaubas'),
('2904605','Brumado','BA','NE','brumado'),
('2904704','Buerarema','BA','NE','buerarema'),
('2904753','Buritirama','BA','NE','buritirama'),
('2904803','Caatiba','BA','NE','caatiba'),
('2904852','Cabaceiras do Paraguaçu','BA','NE','cabaceiras do paraguacu'),
('2904902','Cachoeira','BA','NE','cachoeira'),
('2905008','Caculé','BA','NE','cacule'),
('2905107','Caém','BA','NE','caem'),
('2905156','Caetanos','BA','NE','caetanos'),
('2905206','Caetité','BA','NE','caetite'),
('2905305','Cafarnaum','BA','NE','cafarnaum'),
('2905404','Cairu','BA','NE','cairu'),
('2905503','Caldeirão Grande','BA','NE','caldeirao grande'),
('2905602','Camacan','BA','NE','camacan'),
('2905701','Camaçari','BA','NE','camacari'),
('2905800','Camamu','BA','NE','camamu'),
('2905909','Campo Alegre de Lourdes','BA','NE','campo alegre de lourdes'),
('2906006','Campo Formoso','BA','NE','campo formoso'),
('2906105','Canápolis','BA','NE','canapolis'),
('2906204','Canarana','BA','NE','canarana'),
('2906303','Canavieiras','BA','NE','canavieiras'),
('2906402','Candeal','BA','NE','candeal'),
('2906501','Candeias','BA','NE','candeias'),
('2906600','Candiba','BA','NE','candiba'),
('2906709','Cândido Sales','BA','NE','candido sales'),
('2906808','Cansanção','BA','NE','cansancao'),
('2906824','Canudos','BA','NE','canudos'),
('2906857','Capela do Alto Alegre','BA','NE','capela do alto alegre'),
('2906873','Capim Grosso','BA','NE','capim grosso'),
('2906899','Caraíbas','BA','NE','caraibas'),
('2906907','Caravelas','BA','NE','caravelas'),
('2907004','Cardeal da Silva','BA','NE','cardeal da silva'),
('2907103','Carinhanha','BA','NE','carinhanha'),
('2907202','Casa Nova','BA','NE','casa nova'),
('2907301','Castro Alves','BA','NE','castro alves'),
('2907400','Catolândia','BA','NE','catolandia'),
('2907509','Catu','BA','NE','catu'),
('2907558','Caturama','BA','NE','caturama'),
('2907608','Central','BA','NE','central'),
('2907707','Chorrochó','BA','NE','chorrocho'),
('2907806','Cícero Dantas','BA','NE','cicero dantas'),
('2907905','Cipó','BA','NE','cipo'),
('2908002','Coaraci','BA','NE','coaraci'),
('2908101','Cocos','BA','NE','cocos'),
('2908200','Conceição da Feira','BA','NE','conceicao da feira'),
('2908309','Conceição do Almeida','BA','NE','conceicao do almeida'),
('2908408','Conceição do Coité','BA','NE','conceicao do coite'),
('2908507','Conceição do Jacuípe','BA','NE','conceicao do jacuipe'),
('2908606','Conde','BA','NE','conde'),
('2908705','Condeúba','BA','NE','condeuba'),
('2908804','Contendas do Sincorá','BA','NE','contendas do sincora'),
('2908903','Coração de Maria','BA','NE','coracao de maria'),
('2909000','Cordeiros','BA','NE','cordeiros'),
('2909109','Coribe','BA','NE','coribe'),
('2909208','Coronel João Sá','BA','NE','coronel joao sa'),
('2909307','Correntina','BA','NE','correntina'),
('2909406','Cotegipe','BA','NE','cotegipe'),
('2909505','Cravolândia','BA','NE','cravolandia'),
('2909604','Crisópolis','BA','NE','crisopolis'),
('2909703','Cristópolis','BA','NE','cristopolis'),
('2909802','Cruz das Almas','BA','NE','cruz das almas'),
('2909901','Curaçá','BA','NE','curaca'),
('2910008','Dário Meira','BA','NE','dario meira'),
('2910057','Dias d''Ávila','BA','NE','dias d avila'),
('2910107','Dom Basílio','BA','NE','dom basilio'),
('2910206','Dom Macedo Costa','BA','NE','dom macedo costa'),
('2910305','Elísio Medrado','BA','NE','elisio medrado'),
('2910404','Encruzilhada','BA','NE','encruzilhada'),
('2910503','Entre Rios','BA','NE','entre rios'),
('2910602','Esplanada','BA','NE','esplanada'),
('2910701','Euclides da Cunha','BA','NE','euclides da cunha'),
('2910727','Eunápolis','BA','NE','eunapolis'),
('2910750','Fátima','BA','NE','fatima'),
('2910776','Feira da Mata','BA','NE','feira da mata'),
('2910800','Feira de Santana','BA','NE','feira de santana'),
('2910859','Filadélfia','BA','NE','filadelfia'),
('2910909','Firmino Alves','BA','NE','firmino alves'),
('2911006','Floresta Azul','BA','NE','floresta azul'),
('2911105','Formosa do Rio Preto','BA','NE','formosa do rio preto'),
('2911204','Gandu','BA','NE','gandu'),
('2911253','Gavião','BA','NE','gaviao'),
('2911303','Gentio do Ouro','BA','NE','gentio do ouro'),
('2911402','Glória','BA','NE','gloria'),
('2911501','Gongogi','BA','NE','gongogi'),
('2911600','Governador Mangabeira','BA','NE','governador mangabeira'),
('2911659','Guajeru','BA','NE','guajeru'),
('2911709','Guanambi','BA','NE','guanambi'),
('2911808','Guaratinga','BA','NE','guaratinga'),
('2911857','Heliópolis','BA','NE','heliopolis'),
('2911907','Iaçu','BA','NE','iacu'),
('2912004','Ibiassucê','BA','NE','ibiassuce'),
('2912103','Ibicaraí','BA','NE','ibicarai'),
('2912202','Ibicoara','BA','NE','ibicoara'),
('2912301','Ibicuí','BA','NE','ibicui'),
('2912400','Ibipeba','BA','NE','ibipeba'),
('2912509','Ibipitanga','BA','NE','ibipitanga'),
('2912608','Ibiquera','BA','NE','ibiquera'),
('2912707','Ibirapitanga','BA','NE','ibirapitanga'),
('2912806','Ibirapuã','BA','NE','ibirapua'),
('2912905','Ibirataia','BA','NE','ibirataia'),
('2913002','Ibitiara','BA','NE','ibitiara'),
('2913101','Ibititá','BA','NE','ibitita'),
('2913200','Ibotirama','BA','NE','ibotirama'),
('2913309','Ichu','BA','NE','ichu'),
('2913408','Igaporã','BA','NE','igapora'),
('2913457','Igrapiúna','BA','NE','igrapiuna'),
('2913507','Iguaí','BA','NE','iguai'),
('2913606','Ilhéus','BA','NE','ilheus'),
('2913705','Inhambupe','BA','NE','inhambupe'),
('2913804','Ipecaetá','BA','NE','ipecaeta'),
('2913903','Ipiaú','BA','NE','ipiau'),
('2914000','Ipirá','BA','NE','ipira'),
('2914109','Ipupiara','BA','NE','ipupiara'),
('2914208','Irajuba','BA','NE','irajuba'),
('2914307','Iramaia','BA','NE','iramaia'),
('2914406','Iraquara','BA','NE','iraquara'),
('2914505','Irará','BA','NE','irara'),
('2914604','Irecê','BA','NE','irece'),
('2914653','Itabela','BA','NE','itabela'),
('2914703','Itaberaba','BA','NE','itaberaba'),
('2914802','Itabuna','BA','NE','itabuna'),
('2914901','Itacaré','BA','NE','itacare'),
('2915007','Itaeté','BA','NE','itaete'),
('2915106','Itagi','BA','NE','itagi'),
('2915205','Itagibá','BA','NE','itagiba'),
('2915304','Itagimirim','BA','NE','itagimirim'),
('2915353','Itaguaçu da Bahia','BA','NE','itaguacu da bahia'),
('2915403','Itaju do Colônia','BA','NE','itaju do colonia'),
('2915502','Itajuípe','BA','NE','itajuipe'),
('2915601','Itamaraju','BA','NE','itamaraju'),
('2915700','Itamari','BA','NE','itamari'),
('2915809','Itambé','BA','NE','itambe'),
('2915908','Itanagra','BA','NE','itanagra'),
('2916005','Itanhém','BA','NE','itanhem'),
('2916104','Itaparica','BA','NE','itaparica'),
('2916203','Itapé','BA','NE','itape'),
('2916302','Itapebi','BA','NE','itapebi'),
('2916401','Itapetinga','BA','NE','itapetinga'),
('2916500','Itapicuru','BA','NE','itapicuru'),
('2916609','Itapitanga','BA','NE','itapitanga'),
('2916708','Itaquara','BA','NE','itaquara'),
('2916807','Itarantim','BA','NE','itarantim'),
('2916856','Itatim','BA','NE','itatim'),
('2916906','Itiruçu','BA','NE','itirucu'),
('2917003','Itiúba','BA','NE','itiuba'),
('2917102','Itororó','BA','NE','itororo'),
('2917201','Ituaçu','BA','NE','ituacu'),
('2917300','Ituberá','BA','NE','itubera'),
('2917334','Iuiu','BA','NE','iuiu'),
('2917359','Jaborandi','BA','NE','jaborandi'),
('2917409','Jacaraci','BA','NE','jacaraci'),
('2917508','Jacobina','BA','NE','jacobina'),
('2917607','Jaguaquara','BA','NE','jaguaquara'),
('2917706','Jaguarari','BA','NE','jaguarari'),
('2917805','Jaguaripe','BA','NE','jaguaripe'),
('2917904','Jandaíra','BA','NE','jandaira'),
('2918001','Jequié','BA','NE','jequie'),
('2918100','Jeremoabo','BA','NE','jeremoabo'),
('2918209','Jiquiriçá','BA','NE','jiquirica'),
('2918308','Jitaúna','BA','NE','jitauna'),
('2918357','João Dourado','BA','NE','joao dourado'),
('2918407','Juazeiro','BA','NE','juazeiro'),
('2918456','Jucuruçu','BA','NE','jucurucu'),
('2918506','Jussara','BA','NE','jussara'),
('2918555','Jussari','BA','NE','jussari'),
('2918605','Jussiape','BA','NE','jussiape'),
('2918704','Lafaiete Coutinho','BA','NE','lafaiete coutinho'),
('2918753','Lagoa Real','BA','NE','lagoa real'),
('2918803','Laje','BA','NE','laje'),
('2918902','Lajedão','BA','NE','lajedao'),
('2919009','Lajedinho','BA','NE','lajedinho'),
('2919058','Lajedo do Tabocal','BA','NE','lajedo do tabocal'),
('2919108','Lamarão','BA','NE','lamarao'),
('2919157','Lapão','BA','NE','lapao'),
('2919207','Lauro de Freitas','BA','NE','lauro de freitas'),
('2919306','Lençóis','BA','NE','lencois'),
('2919405','Licínio de Almeida','BA','NE','licinio de almeida'),
('2919504','Livramento de Nossa Senhora','BA','NE','livramento de nossa senhora'),
('2919553','Luís Eduardo Magalhães','BA','NE','luis eduardo magalhaes'),
('2919603','Macajuba','BA','NE','macajuba'),
('2919702','Macarani','BA','NE','macarani'),
('2919801','Macaúbas','BA','NE','macaubas'),
('2919900','Macururé','BA','NE','macurure'),
('2919926','Madre de Deus','BA','NE','madre de deus'),
('2919959','Maetinga','BA','NE','maetinga'),
('2920007','Maiquinique','BA','NE','maiquinique'),
('2920106','Mairi','BA','NE','mairi'),
('2920205','Malhada','BA','NE','malhada'),
('2920304','Malhada de Pedras','BA','NE','malhada de pedras'),
('2920403','Manoel Vitorino','BA','NE','manoel vitorino'),
('2920452','Mansidão','BA','NE','mansidao'),
('2920502','Maracás','BA','NE','maracas'),
('2920601','Maragogipe','BA','NE','maragogipe'),
('2920700','Maraú','BA','NE','marau'),
('2920809','Marcionílio Souza','BA','NE','marcionilio souza'),
('2920908','Mascote','BA','NE','mascote'),
('2921005','Mata de São João','BA','NE','mata de sao joao'),
('2921054','Matina','BA','NE','matina'),
('2921104','Medeiros Neto','BA','NE','medeiros neto'),
('2921203','Miguel Calmon','BA','NE','miguel calmon'),
('2921302','Milagres','BA','NE','milagres'),
('2921401','Mirangaba','BA','NE','mirangaba'),
('2921450','Mirante','BA','NE','mirante'),
('2921500','Monte Santo','BA','NE','monte santo'),
('2921609','Morpará','BA','NE','morpara'),
('2921708','Morro do Chapéu','BA','NE','morro do chapeu'),
('2921807','Mortugaba','BA','NE','mortugaba'),
('2921906','Mucugê','BA','NE','mucuge'),
('2922003','Mucuri','BA','NE','mucuri'),
('2922052','Mulungu do Morro','BA','NE','mulungu do morro'),
('2922102','Mundo Novo','BA','NE','mundo novo'),
('2922201','Muniz Ferreira','BA','NE','muniz ferreira'),
('2922250','Muquém do São Francisco','BA','NE','muquem do sao francisco'),
('2922300','Muritiba','BA','NE','muritiba'),
('2922409','Mutuípe','BA','NE','mutuipe'),
('2922508','Nazaré','BA','NE','nazare'),
('2922607','Nilo Peçanha','BA','NE','nilo pecanha'),
('2922656','Nordestina','BA','NE','nordestina'),
('2922706','Nova Canaã','BA','NE','nova canaa'),
('2922730','Nova Fátima','BA','NE','nova fatima'),
('2922755','Nova Ibiá','BA','NE','nova ibia'),
('2922805','Nova Itarana','BA','NE','nova itarana'),
('2922854','Nova Redenção','BA','NE','nova redencao'),
('2922904','Nova Soure','BA','NE','nova soure'),
('2923001','Nova Viçosa','BA','NE','nova vicosa'),
('2923035','Novo Horizonte','BA','NE','novo horizonte'),
('2923050','Novo Triunfo','BA','NE','novo triunfo'),
('2923100','Olindina','BA','NE','olindina'),
('2923209','Oliveira dos Brejinhos','BA','NE','oliveira dos brejinhos'),
('2923308','Ouriçangas','BA','NE','ouricangas'),
('2923357','Ourolândia','BA','NE','ourolandia'),
('2923407','Palmas de Monte Alto','BA','NE','palmas de monte alto'),
('2923506','Palmeiras','BA','NE','palmeiras'),
('2923605','Paramirim','BA','NE','paramirim'),
('2923704','Paratinga','BA','NE','paratinga'),
('2923803','Paripiranga','BA','NE','paripiranga'),
('2923902','Pau Brasil','BA','NE','pau brasil'),
('2924009','Paulo Afonso','BA','NE','paulo afonso'),
('2924058','Pé de Serra','BA','NE','pe de serra'),
('2924108','Pedrão','BA','NE','pedrao'),
('2924207','Pedro Alexandre','BA','NE','pedro alexandre'),
('2924306','Piatã','BA','NE','piata'),
('2924405','Pilão Arcado','BA','NE','pilao arcado'),
('2924504','Pindaí','BA','NE','pindai'),
('2924603','Pindobaçu','BA','NE','pindobacu'),
('2924652','Pintadas','BA','NE','pintadas'),
('2924678','Piraí do Norte','BA','NE','pirai do norte'),
('2924702','Piripá','BA','NE','piripa'),
('2924801','Piritiba','BA','NE','piritiba'),
('2924900','Planaltino','BA','NE','planaltino'),
('2925006','Planalto','BA','NE','planalto'),
('2925105','Poções','BA','NE','pocoes'),
('2925204','Pojuca','BA','NE','pojuca'),
('2925253','Ponto Novo','BA','NE','ponto novo'),
('2925303','Porto Seguro','BA','NE','porto seguro'),
('2925402','Potiraguá','BA','NE','potiragua'),
('2925501','Prado','BA','NE','prado'),
('2925600','Presidente Dutra','BA','NE','presidente dutra'),
('2925709','Presidente Jânio Quadros','BA','NE','presidente janio quadros'),
('2925758','Presidente Tancredo Neves','BA','NE','presidente tancredo neves'),
('2925808','Queimadas','BA','NE','queimadas'),
('2925907','Quijingue','BA','NE','quijingue'),
('2925931','Quixabeira','BA','NE','quixabeira'),
('2925956','Rafael Jambeiro','BA','NE','rafael jambeiro'),
('2926004','Remanso','BA','NE','remanso'),
('2926103','Retirolândia','BA','NE','retirolandia'),
('2926202','Riachão das Neves','BA','NE','riachao das neves'),
('2926301','Riachão do Jacuípe','BA','NE','riachao do jacuipe'),
('2926400','Riacho de Santana','BA','NE','riacho de santana'),
('2926509','Ribeira do Amparo','BA','NE','ribeira do amparo'),
('2926608','Ribeira do Pombal','BA','NE','ribeira do pombal'),
('2926657','Ribeirão do Largo','BA','NE','ribeirao do largo'),
('2926707','Rio de Contas','BA','NE','rio de contas'),
('2926806','Rio do Antônio','BA','NE','rio do antonio'),
('2926905','Rio do Pires','BA','NE','rio do pires'),
('2927002','Rio Real','BA','NE','rio real'),
('2927101','Rodelas','BA','NE','rodelas'),
('2927200','Ruy Barbosa','BA','NE','ruy barbosa'),
('2927309','Salinas da Margarida','BA','NE','salinas da margarida'),
('2927408','Salvador','BA','NE','salvador'),
('2927507','Santa Bárbara','BA','NE','santa barbara'),
('2927606','Santa Brígida','BA','NE','santa brigida'),
('2927705','Santa Cruz Cabrália','BA','NE','santa cruz cabralia'),
('2927804','Santa Cruz da Vitória','BA','NE','santa cruz da vitoria'),
('2927903','Santa Inês','BA','NE','santa ines'),
('2928000','Santaluz','BA','NE','santaluz'),
('2928059','Santa Luzia','BA','NE','santa luzia'),
('2928109','Santa Maria da Vitória','BA','NE','santa maria da vitoria'),
('2928208','Santana','BA','NE','santana'),
('2928307','Santanópolis','BA','NE','santanopolis'),
('2928406','Santa Rita de Cássia','BA','NE','santa rita de cassia'),
('2928505','Santa Terezinha','BA','NE','santa terezinha'),
('2928604','Santo Amaro','BA','NE','santo amaro'),
('2928703','Santo Antônio de Jesus','BA','NE','santo antonio de jesus'),
('2928802','Santo Estêvão','BA','NE','santo estevao'),
('2928901','São Desidério','BA','NE','sao desiderio'),
('2928950','São Domingos','BA','NE','sao domingos'),
('2929008','São Félix','BA','NE','sao felix'),
('2929057','São Félix do Coribe','BA','NE','sao felix do coribe'),
('2929107','São Felipe','BA','NE','sao felipe'),
('2929206','São Francisco do Conde','BA','NE','sao francisco do conde'),
('2929255','São Gabriel','BA','NE','sao gabriel'),
('2929305','São Gonçalo dos Campos','BA','NE','sao goncalo dos campos'),
('2929354','São José da Vitória','BA','NE','sao jose da vitoria'),
('2929370','São José do Jacuípe','BA','NE','sao jose do jacuipe'),
('2929404','São Miguel das Matas','BA','NE','sao miguel das matas'),
('2929503','São Sebastião do Passé','BA','NE','sao sebastiao do passe'),
('2929602','Sapeaçu','BA','NE','sapeacu'),
('2929701','Sátiro Dias','BA','NE','satiro dias'),
('2929750','Saubara','BA','NE','saubara'),
('2929800','Saúde','BA','NE','saude'),
('2929909','Seabra','BA','NE','seabra'),
('2930006','Sebastião Laranjeiras','BA','NE','sebastiao laranjeiras'),
('2930105','Senhor do Bonfim','BA','NE','senhor do bonfim'),
('2930154','Serra do Ramalho','BA','NE','serra do ramalho'),
('2930204','Sento Sé','BA','NE','sento se'),
('2930303','Serra Dourada','BA','NE','serra dourada'),
('2930402','Serra Preta','BA','NE','serra preta'),
('2930501','Serrinha','BA','NE','serrinha'),
('2930600','Serrolândia','BA','NE','serrolandia'),
('2930709','Simões Filho','BA','NE','simoes filho'),
('2930758','Sítio do Mato','BA','NE','sitio do mato'),
('2930766','Sítio do Quinto','BA','NE','sitio do quinto'),
('2930774','Sobradinho','BA','NE','sobradinho'),
('2930808','Souto Soares','BA','NE','souto soares'),
('2930907','Tabocas do Brejo Velho','BA','NE','tabocas do brejo velho'),
('2931004','Tanhaçu','BA','NE','tanhacu'),
('2931053','Tanque Novo','BA','NE','tanque novo'),
('2931103','Tanquinho','BA','NE','tanquinho'),
('2931202','Taperoá','BA','NE','taperoa'),
('2931301','Tapiramutá','BA','NE','tapiramuta'),
('2931350','Teixeira de Freitas','BA','NE','teixeira de freitas'),
('2931400','Teodoro Sampaio','BA','NE','teodoro sampaio'),
('2931509','Teofilândia','BA','NE','teofilandia'),
('2931608','Teolândia','BA','NE','teolandia'),
('2931707','Terra Nova','BA','NE','terra nova'),
('2931806','Tremedal','BA','NE','tremedal'),
('2931905','Tucano','BA','NE','tucano'),
('2932002','Uauá','BA','NE','uaua'),
('2932101','Ubaíra','BA','NE','ubaira'),
('2932200','Ubaitaba','BA','NE','ubaitaba'),
('2932309','Ubatã','BA','NE','ubata'),
('2932408','Uibaí','BA','NE','uibai'),
('2932457','Umburanas','BA','NE','umburanas'),
('2932507','Una','BA','NE','una'),
('2932606','Urandi','BA','NE','urandi'),
('2932705','Uruçuca','BA','NE','urucuca'),
('2932804','Utinga','BA','NE','utinga'),
('2932903','Valença','BA','NE','valenca'),
('2933000','Valente','BA','NE','valente'),
('2933059','Várzea da Roça','BA','NE','varzea da roca'),
('2933109','Várzea do Poço','BA','NE','varzea do poco'),
('2933158','Várzea Nova','BA','NE','varzea nova'),
('2933174','Varzedo','BA','NE','varzedo'),
('2933208','Vera Cruz','BA','NE','vera cruz'),
('2933257','Vereda','BA','NE','vereda'),
('2933307','Vitória da Conquista','BA','NE','vitoria da conquista'),
('2933406','Wagner','BA','NE','wagner'),
('2933455','Wanderley','BA','NE','wanderley'),
('2933505','Wenceslau Guimarães','BA','NE','wenceslau guimaraes'),
('2933604','Xique-Xique','BA','NE','xique xique'),
('3100104','Abadia dos Dourados','MG','SE','abadia dos dourados'),
('3100203','Abaeté','MG','SE','abaete'),
('3100302','Abre Campo','MG','SE','abre campo'),
('3100401','Acaiaca','MG','SE','acaiaca'),
('3100500','Açucena','MG','SE','acucena'),
('3100609','Água Boa','MG','SE','agua boa'),
('3100708','Água Comprida','MG','SE','agua comprida'),
('3100807','Aguanil','MG','SE','aguanil'),
('3100906','Águas Formosas','MG','SE','aguas formosas'),
('3101003','Águas Vermelhas','MG','SE','aguas vermelhas'),
('3101102','Aimorés','MG','SE','aimores'),
('3101201','Aiuruoca','MG','SE','aiuruoca'),
('3101300','Alagoa','MG','SE','alagoa'),
('3101409','Albertina','MG','SE','albertina'),
('3101508','Além Paraíba','MG','SE','alem paraiba'),
('3101607','Alfenas','MG','SE','alfenas'),
('3101631','Alfredo Vasconcelos','MG','SE','alfredo vasconcelos'),
('3101706','Almenara','MG','SE','almenara'),
('3101805','Alpercata','MG','SE','alpercata'),
('3101904','Alpinópolis','MG','SE','alpinopolis'),
('3102001','Alterosa','MG','SE','alterosa'),
('3102050','Alto Caparaó','MG','SE','alto caparao'),
('3102100','Alto Rio Doce','MG','SE','alto rio doce'),
('3102209','Alvarenga','MG','SE','alvarenga'),
('3102308','Alvinópolis','MG','SE','alvinopolis'),
('3102407','Alvorada de Minas','MG','SE','alvorada de minas'),
('3102506','Amparo do Serra','MG','SE','amparo do serra'),
('3102605','Andradas','MG','SE','andradas'),
('3102704','Cachoeira de Pajeú','MG','SE','cachoeira de pajeu'),
('3102803','Andrelândia','MG','SE','andrelandia'),
('3102852','Angelândia','MG','SE','angelandia'),
('3102902','Antônio Carlos','MG','SE','antonio carlos'),
('3103009','Antônio Dias','MG','SE','antonio dias'),
('3103108','Antônio Prado de Minas','MG','SE','antonio prado de minas'),
('3103207','Araçaí','MG','SE','aracai'),
('3103306','Aracitaba','MG','SE','aracitaba'),
('3103405','Araçuaí','MG','SE','aracuai'),
('3103504','Araguari','MG','SE','araguari'),
('3103603','Arantina','MG','SE','arantina'),
('3103702','Araponga','MG','SE','araponga'),
('3103751','Araporã','MG','SE','arapora'),
('3103801','Arapuá','MG','SE','arapua'),
('3103900','Araújos','MG','SE','araujos'),
('3104007','Araxá','MG','SE','araxa'),
('3104106','Arceburgo','MG','SE','arceburgo'),
('3104205','Arcos','MG','SE','arcos'),
('3104304','Areado','MG','SE','areado'),
('3104403','Argirita','MG','SE','argirita'),
('3104452','Aricanduva','MG','SE','aricanduva'),
('3104502','Arinos','MG','SE','arinos'),
('3104601','Astolfo Dutra','MG','SE','astolfo dutra'),
('3104700','Ataléia','MG','SE','ataleia'),
('3104809','Augusto de Lima','MG','SE','augusto de lima'),
('3104908','Baependi','MG','SE','baependi'),
('3105004','Baldim','MG','SE','baldim'),
('3105103','Bambuí','MG','SE','bambui'),
('3105202','Bandeira','MG','SE','bandeira'),
('3105301','Bandeira do Sul','MG','SE','bandeira do sul'),
('3105400','Barão de Cocais','MG','SE','barao de cocais'),
('3105509','Barão do Monte Alto','MG','SE','barao do monte alto'),
('3105608','Barbacena','MG','SE','barbacena'),
('3105707','Barra Longa','MG','SE','barra longa'),
('3105905','Barroso','MG','SE','barroso'),
('3106002','Bela Vista de Minas','MG','SE','bela vista de minas'),
('3106101','Belmiro Braga','MG','SE','belmiro braga'),
('3106200','Belo Horizonte','MG','SE','belo horizonte'),
('3106309','Belo Oriente','MG','SE','belo oriente'),
('3106408','Belo Vale','MG','SE','belo vale'),
('3106507','Berilo','MG','SE','berilo'),
('3106606','Bertópolis','MG','SE','bertopolis'),
('3106655','Berizal','MG','SE','berizal'),
('3106705','Betim','MG','SE','betim'),
('3106804','Bias Fortes','MG','SE','bias fortes'),
('3106903','Bicas','MG','SE','bicas'),
('3107000','Biquinhas','MG','SE','biquinhas'),
('3107109','Boa Esperança','MG','SE','boa esperanca'),
('3107208','Bocaina de Minas','MG','SE','bocaina de minas'),
('3107307','Bocaiúva','MG','SE','bocaiuva'),
('3107406','Bom Despacho','MG','SE','bom despacho'),
('3107505','Bom Jardim de Minas','MG','SE','bom jardim de minas'),
('3107604','Bom Jesus da Penha','MG','SE','bom jesus da penha'),
('3107703','Bom Jesus do Amparo','MG','SE','bom jesus do amparo'),
('3107802','Bom Jesus do Galho','MG','SE','bom jesus do galho'),
('3107901','Bom Repouso','MG','SE','bom repouso'),
('3108008','Bom Sucesso','MG','SE','bom sucesso'),
('3108107','Bonfim','MG','SE','bonfim'),
('3108206','Bonfinópolis de Minas','MG','SE','bonfinopolis de minas'),
('3108255','Bonito de Minas','MG','SE','bonito de minas'),
('3108305','Borda da Mata','MG','SE','borda da mata'),
('3108404','Botelhos','MG','SE','botelhos'),
('3108503','Botumirim','MG','SE','botumirim'),
('3108552','Brasilândia de Minas','MG','SE','brasilandia de minas'),
('3108602','Brasília de Minas','MG','SE','brasilia de minas'),
('3108701','Brás Pires','MG','SE','bras pires'),
('3108800','Braúnas','MG','SE','braunas'),
('3108909','Brazópolis','MG','SE','brazopolis'),
('3109006','Brumadinho','MG','SE','brumadinho'),
('3109105','Bueno Brandão','MG','SE','bueno brandao'),
('3109204','Buenópolis','MG','SE','buenopolis'),
('3109253','Bugre','MG','SE','bugre'),
('3109303','Buritis','MG','SE','buritis'),
('3109402','Buritizeiro','MG','SE','buritizeiro'),
('3109451','Cabeceira Grande','MG','SE','cabeceira grande'),
('3109501','Cabo Verde','MG','SE','cabo verde'),
('3109600','Cachoeira da Prata','MG','SE','cachoeira da prata'),
('3109709','Cachoeira de Minas','MG','SE','cachoeira de minas'),
('3109808','Cachoeira Dourada','MG','SE','cachoeira dourada'),
('3109907','Caetanópolis','MG','SE','caetanopolis'),
('3110004','Caeté','MG','SE','caete'),
('3110103','Caiana','MG','SE','caiana'),
('3110202','Cajuri','MG','SE','cajuri'),
('3110301','Caldas','MG','SE','caldas'),
('3110400','Camacho','MG','SE','camacho'),
('3110509','Camanducaia','MG','SE','camanducaia'),
('3110608','Cambuí','MG','SE','cambui'),
('3110707','Cambuquira','MG','SE','cambuquira'),
('3110806','Campanário','MG','SE','campanario'),
('3110905','Campanha','MG','SE','campanha'),
('3111002','Campestre','MG','SE','campestre'),
('3111101','Campina Verde','MG','SE','campina verde'),
('3111150','Campo Azul','MG','SE','campo azul'),
('3111200','Campo Belo','MG','SE','campo belo'),
('3111309','Campo do Meio','MG','SE','campo do meio'),
('3111408','Campo Florido','MG','SE','campo florido'),
('3111507','Campos Altos','MG','SE','campos altos'),
('3111606','Campos Gerais','MG','SE','campos gerais'),
('3111705','Canaã','MG','SE','canaa'),
('3111804','Canápolis','MG','SE','canapolis'),
('3111903','Cana Verde','MG','SE','cana verde'),
('3112000','Candeias','MG','SE','candeias'),
('3112059','Cantagalo','MG','SE','cantagalo'),
('3112109','Caparaó','MG','SE','caparao'),
('3112208','Capela Nova','MG','SE','capela nova'),
('3112307','Capelinha','MG','SE','capelinha'),
('3112406','Capetinga','MG','SE','capetinga'),
('3112505','Capim Branco','MG','SE','capim branco'),
('3112604','Capinópolis','MG','SE','capinopolis'),
('3112653','Capitão Andrade','MG','SE','capitao andrade'),
('3112703','Capitão Enéas','MG','SE','capitao eneas'),
('3112802','Capitólio','MG','SE','capitolio'),
('3112901','Caputira','MG','SE','caputira'),
('3113008','Caraí','MG','SE','carai'),
('3113107','Caranaíba','MG','SE','caranaiba'),
('3113206','Carandaí','MG','SE','carandai'),
('3113305','Carangola','MG','SE','carangola'),
('3113404','Caratinga','MG','SE','caratinga'),
('3113503','Carbonita','MG','SE','carbonita'),
('3113602','Careaçu','MG','SE','careacu'),
('3113701','Carlos Chagas','MG','SE','carlos chagas'),
('3113800','Carmésia','MG','SE','carmesia'),
('3113909','Carmo da Cachoeira','MG','SE','carmo da cachoeira'),
('3114006','Carmo da Mata','MG','SE','carmo da mata'),
('3114105','Carmo de Minas','MG','SE','carmo de minas'),
('3114204','Carmo do Cajuru','MG','SE','carmo do cajuru'),
('3114303','Carmo do Paranaíba','MG','SE','carmo do paranaiba'),
('3114402','Carmo do Rio Claro','MG','SE','carmo do rio claro'),
('3114501','Carmópolis de Minas','MG','SE','carmopolis de minas'),
('3114550','Carneirinho','MG','SE','carneirinho'),
('3114600','Carrancas','MG','SE','carrancas'),
('3114709','Carvalhópolis','MG','SE','carvalhopolis'),
('3114808','Carvalhos','MG','SE','carvalhos'),
('3114907','Casa Grande','MG','SE','casa grande'),
('3115003','Cascalho Rico','MG','SE','cascalho rico'),
('3115102','Cássia','MG','SE','cassia'),
('3115201','Conceição da Barra de Minas','MG','SE','conceicao da barra de minas'),
('3115300','Cataguases','MG','SE','cataguases'),
('3115359','Catas Altas','MG','SE','catas altas'),
('3115409','Catas Altas da Noruega','MG','SE','catas altas da noruega'),
('3115458','Catuji','MG','SE','catuji'),
('3115474','Catuti','MG','SE','catuti'),
('3115508','Caxambu','MG','SE','caxambu'),
('3115607','Cedro do Abaeté','MG','SE','cedro do abaete'),
('3115706','Central de Minas','MG','SE','central de minas'),
('3115805','Centralina','MG','SE','centralina'),
('3115904','Chácara','MG','SE','chacara'),
('3116001','Chalé','MG','SE','chale'),
('3116100','Chapada do Norte','MG','SE','chapada do norte'),
('3116159','Chapada Gaúcha','MG','SE','chapada gaucha'),
('3116209','Chiador','MG','SE','chiador'),
('3116308','Cipotânea','MG','SE','cipotanea'),
('3116407','Claraval','MG','SE','claraval'),
('3116506','Claro dos Poções','MG','SE','claro dos pocoes'),
('3116605','Cláudio','MG','SE','claudio'),
('3116704','Coimbra','MG','SE','coimbra'),
('3116803','Coluna','MG','SE','coluna'),
('3116902','Comendador Gomes','MG','SE','comendador gomes'),
('3117009','Comercinho','MG','SE','comercinho'),
('3117108','Conceição da Aparecida','MG','SE','conceicao da aparecida'),
('3117207','Conceição das Pedras','MG','SE','conceicao das pedras'),
('3117306','Conceição das Alagoas','MG','SE','conceicao das alagoas'),
('3117405','Conceição de Ipanema','MG','SE','conceicao de ipanema'),
('3117504','Conceição do Mato Dentro','MG','SE','conceicao do mato dentro'),
('3117603','Conceição do Pará','MG','SE','conceicao do para'),
('3117702','Conceição do Rio Verde','MG','SE','conceicao do rio verde'),
('3117801','Conceição dos Ouros','MG','SE','conceicao dos ouros'),
('3117836','Cônego Marinho','MG','SE','conego marinho'),
('3117876','Confins','MG','SE','confins'),
('3117900','Congonhal','MG','SE','congonhal'),
('3118007','Congonhas','MG','SE','congonhas'),
('3118106','Congonhas do Norte','MG','SE','congonhas do norte'),
('3118205','Conquista','MG','SE','conquista'),
('3118304','Conselheiro Lafaiete','MG','SE','conselheiro lafaiete'),
('3118403','Conselheiro Pena','MG','SE','conselheiro pena'),
('3118502','Consolação','MG','SE','consolacao'),
('3118601','Contagem','MG','SE','contagem'),
('3118700','Coqueiral','MG','SE','coqueiral'),
('3118809','Coração de Jesus','MG','SE','coracao de jesus'),
('3118908','Cordisburgo','MG','SE','cordisburgo'),
('3119005','Cordislândia','MG','SE','cordislandia'),
('3119104','Corinto','MG','SE','corinto'),
('3119203','Coroaci','MG','SE','coroaci'),
('3119302','Coromandel','MG','SE','coromandel'),
('3119401','Coronel Fabriciano','MG','SE','coronel fabriciano'),
('3119500','Coronel Murta','MG','SE','coronel murta'),
('3119609','Coronel Pacheco','MG','SE','coronel pacheco'),
('3119708','Coronel Xavier Chaves','MG','SE','coronel xavier chaves'),
('3119807','Córrego Danta','MG','SE','corrego danta'),
('3119906','Córrego do Bom Jesus','MG','SE','corrego do bom jesus'),
('3119955','Córrego Fundo','MG','SE','corrego fundo'),
('3120003','Córrego Novo','MG','SE','corrego novo'),
('3120102','Couto de Magalhães de Minas','MG','SE','couto de magalhaes de minas'),
('3120151','Crisólita','MG','SE','crisolita'),
('3120201','Cristais','MG','SE','cristais'),
('3120300','Cristália','MG','SE','cristalia'),
('3120409','Cristiano Otoni','MG','SE','cristiano otoni'),
('3120508','Cristina','MG','SE','cristina'),
('3120607','Crucilândia','MG','SE','crucilandia'),
('3120706','Cruzeiro da Fortaleza','MG','SE','cruzeiro da fortaleza'),
('3120805','Cruzília','MG','SE','cruzilia'),
('3120839','Cuparaque','MG','SE','cuparaque'),
('3120870','Curral de Dentro','MG','SE','curral de dentro'),
('3120904','Curvelo','MG','SE','curvelo'),
('3121001','Datas','MG','SE','datas'),
('3121100','Delfim Moreira','MG','SE','delfim moreira'),
('3121209','Delfinópolis','MG','SE','delfinopolis'),
('3121258','Delta','MG','SE','delta'),
('3121308','Descoberto','MG','SE','descoberto'),
('3121407','Desterro de Entre Rios','MG','SE','desterro de entre rios'),
('3121506','Desterro do Melo','MG','SE','desterro do melo'),
('3121605','Diamantina','MG','SE','diamantina'),
('3121704','Diogo de Vasconcelos','MG','SE','diogo de vasconcelos'),
('3121803','Dionísio','MG','SE','dionisio'),
('3121902','Divinésia','MG','SE','divinesia'),
('3122009','Divino','MG','SE','divino'),
('3122108','Divino das Laranjeiras','MG','SE','divino das laranjeiras'),
('3122207','Divinolândia de Minas','MG','SE','divinolandia de minas'),
('3122306','Divinópolis','MG','SE','divinopolis'),
('3122355','Divisa Alegre','MG','SE','divisa alegre'),
('3122405','Divisa Nova','MG','SE','divisa nova'),
('3122454','Divisópolis','MG','SE','divisopolis'),
('3122470','Dom Bosco','MG','SE','dom bosco'),
('3122504','Dom Cavati','MG','SE','dom cavati'),
('3122603','Dom Joaquim','MG','SE','dom joaquim'),
('3122702','Dom Silvério','MG','SE','dom silverio'),
('3122801','Dom Viçoso','MG','SE','dom vicoso'),
('3122900','Dona Euzébia','MG','SE','dona euzebia'),
('3123007','Dores de Campos','MG','SE','dores de campos'),
('3123106','Dores de Guanhães','MG','SE','dores de guanhaes'),
('3123205','Dores do Indaiá','MG','SE','dores do indaia'),
('3123304','Dores do Turvo','MG','SE','dores do turvo'),
('3123403','Doresópolis','MG','SE','doresopolis'),
('3123502','Douradoquara','MG','SE','douradoquara'),
('3123528','Durandé','MG','SE','durande'),
('3123601','Elói Mendes','MG','SE','eloi mendes'),
('3123700','Engenheiro Caldas','MG','SE','engenheiro caldas'),
('3123809','Engenheiro Navarro','MG','SE','engenheiro navarro'),
('3123858','Entre Folhas','MG','SE','entre folhas'),
('3123908','Entre Rios de Minas','MG','SE','entre rios de minas'),
('3124005','Ervália','MG','SE','ervalia'),
('3124104','Esmeraldas','MG','SE','esmeraldas'),
('3124203','Espera Feliz','MG','SE','espera feliz'),
('3124302','Espinosa','MG','SE','espinosa'),
('3124401','Espírito Santo do Dourado','MG','SE','espirito santo do dourado'),
('3124500','Estiva','MG','SE','estiva'),
('3124609','Estrela Dalva','MG','SE','estrela dalva'),
('3124708','Estrela do Indaiá','MG','SE','estrela do indaia'),
('3124807','Estrela do Sul','MG','SE','estrela do sul'),
('3124906','Eugenópolis','MG','SE','eugenopolis'),
('3125002','Ewbank da Câmara','MG','SE','ewbank da camara'),
('3125101','Extrema','MG','SE','extrema'),
('3125200','Fama','MG','SE','fama'),
('3125309','Faria Lemos','MG','SE','faria lemos'),
('3125408','Felício dos Santos','MG','SE','felicio dos santos'),
('3125507','São Gonçalo do Rio Preto','MG','SE','sao goncalo do rio preto'),
('3125606','Felisburgo','MG','SE','felisburgo'),
('3125705','Felixlândia','MG','SE','felixlandia'),
('3125804','Fernandes Tourinho','MG','SE','fernandes tourinho'),
('3125903','Ferros','MG','SE','ferros'),
('3125952','Fervedouro','MG','SE','fervedouro'),
('3126000','Florestal','MG','SE','florestal'),
('3126109','Formiga','MG','SE','formiga'),
('3126208','Formoso','MG','SE','formoso'),
('3126307','Fortaleza de Minas','MG','SE','fortaleza de minas'),
('3126406','Fortuna de Minas','MG','SE','fortuna de minas'),
('3126505','Francisco Badaró','MG','SE','francisco badaro'),
('3126604','Francisco Dumont','MG','SE','francisco dumont'),
('3126703','Francisco Sá','MG','SE','francisco sa'),
('3126752','Franciscópolis','MG','SE','franciscopolis'),
('3126802','Frei Gaspar','MG','SE','frei gaspar'),
('3126901','Frei Inocêncio','MG','SE','frei inocencio'),
('3126950','Frei Lagonegro','MG','SE','frei lagonegro'),
('3127008','Fronteira','MG','SE','fronteira'),
('3127057','Fronteira dos Vales','MG','SE','fronteira dos vales'),
('3127073','Fruta de Leite','MG','SE','fruta de leite'),
('3127107','Frutal','MG','SE','frutal'),
('3127206','Funilândia','MG','SE','funilandia'),
('3127305','Galiléia','MG','SE','galileia'),
('3127339','Gameleiras','MG','SE','gameleiras'),
('3127354','Glaucilândia','MG','SE','glaucilandia'),
('3127370','Goiabeira','MG','SE','goiabeira'),
('3127388','Goianá','MG','SE','goiana'),
('3127404','Gonçalves','MG','SE','goncalves'),
('3127503','Gonzaga','MG','SE','gonzaga'),
('3127602','Gouveia','MG','SE','gouveia'),
('3127701','Governador Valadares','MG','SE','governador valadares'),
('3127800','Grão Mogol','MG','SE','grao mogol'),
('3127909','Grupiara','MG','SE','grupiara'),
('3128006','Guanhães','MG','SE','guanhaes'),
('3128105','Guapé','MG','SE','guape'),
('3128204','Guaraciaba','MG','SE','guaraciaba'),
('3128253','Guaraciama','MG','SE','guaraciama'),
('3128303','Guaranésia','MG','SE','guaranesia'),
('3128402','Guarani','MG','SE','guarani'),
('3128501','Guarará','MG','SE','guarara'),
('3128600','Guarda-Mor','MG','SE','guarda mor'),
('3128709','Guaxupé','MG','SE','guaxupe'),
('3128808','Guidoval','MG','SE','guidoval'),
('3128907','Guimarânia','MG','SE','guimarania'),
('3129004','Guiricema','MG','SE','guiricema'),
('3129103','Gurinhatã','MG','SE','gurinhata'),
('3129202','Heliodora','MG','SE','heliodora'),
('3129301','Iapu','MG','SE','iapu'),
('3129400','Ibertioga','MG','SE','ibertioga'),
('3129509','Ibiá','MG','SE','ibia'),
('3129608','Ibiaí','MG','SE','ibiai'),
('3129657','Ibiracatu','MG','SE','ibiracatu'),
('3129707','Ibiraci','MG','SE','ibiraci'),
('3129806','Ibirité','MG','SE','ibirite'),
('3129905','Ibitiúra de Minas','MG','SE','ibitiura de minas'),
('3130002','Ibituruna','MG','SE','ibituruna'),
('3130051','Icaraí de Minas','MG','SE','icarai de minas'),
('3130101','Igarapé','MG','SE','igarape'),
('3130200','Igaratinga','MG','SE','igaratinga'),
('3130309','Iguatama','MG','SE','iguatama'),
('3130408','Ijaci','MG','SE','ijaci'),
('3130507','Ilicínea','MG','SE','ilicinea'),
('3130556','Imbé de Minas','MG','SE','imbe de minas'),
('3130606','Inconfidentes','MG','SE','inconfidentes'),
('3130655','Indaiabira','MG','SE','indaiabira'),
('3130705','Indianópolis','MG','SE','indianopolis'),
('3130804','Ingaí','MG','SE','ingai'),
('3130903','Inhapim','MG','SE','inhapim'),
('3131000','Inhaúma','MG','SE','inhauma'),
('3131109','Inimutaba','MG','SE','inimutaba'),
('3131158','Ipaba','MG','SE','ipaba'),
('3131208','Ipanema','MG','SE','ipanema'),
('3131307','Ipatinga','MG','SE','ipatinga'),
('3131406','Ipiaçu','MG','SE','ipiacu'),
('3131505','Ipuiúna','MG','SE','ipuiuna'),
('3131604','Iraí de Minas','MG','SE','irai de minas'),
('3131703','Itabira','MG','SE','itabira'),
('3131802','Itabirinha','MG','SE','itabirinha'),
('3131901','Itabirito','MG','SE','itabirito'),
('3132008','Itacambira','MG','SE','itacambira'),
('3132107','Itacarambi','MG','SE','itacarambi'),
('3132206','Itaguara','MG','SE','itaguara'),
('3132305','Itaipé','MG','SE','itaipe'),
('3132404','Itajubá','MG','SE','itajuba'),
('3132503','Itamarandiba','MG','SE','itamarandiba'),
('3132602','Itamarati de Minas','MG','SE','itamarati de minas'),
('3132701','Itambacuri','MG','SE','itambacuri'),
('3132800','Itambé do Mato Dentro','MG','SE','itambe do mato dentro'),
('3132909','Itamogi','MG','SE','itamogi'),
('3133006','Itamonte','MG','SE','itamonte'),
('3133105','Itanhandu','MG','SE','itanhandu'),
('3133204','Itanhomi','MG','SE','itanhomi'),
('3133303','Itaobim','MG','SE','itaobim'),
('3133402','Itapagipe','MG','SE','itapagipe'),
('3133501','Itapecerica','MG','SE','itapecerica'),
('3133600','Itapeva','MG','SE','itapeva'),
('3133709','Itatiaiuçu','MG','SE','itatiaiucu'),
('3133758','Itaú de Minas','MG','SE','itau de minas'),
('3133808','Itaúna','MG','SE','itauna'),
('3133907','Itaverava','MG','SE','itaverava'),
('3134004','Itinga','MG','SE','itinga'),
('3134103','Itueta','MG','SE','itueta'),
('3134202','Ituiutaba','MG','SE','ituiutaba'),
('3134301','Itumirim','MG','SE','itumirim'),
('3134400','Iturama','MG','SE','iturama'),
('3134509','Itutinga','MG','SE','itutinga'),
('3134608','Jaboticatubas','MG','SE','jaboticatubas'),
('3134707','Jacinto','MG','SE','jacinto'),
('3134806','Jacuí','MG','SE','jacui'),
('3134905','Jacutinga','MG','SE','jacutinga'),
('3135001','Jaguaraçu','MG','SE','jaguaracu'),
('3135050','Jaíba','MG','SE','jaiba'),
('3135076','Jampruca','MG','SE','jampruca'),
('3135100','Janaúba','MG','SE','janauba'),
('3135209','Januária','MG','SE','januaria'),
('3135308','Japaraíba','MG','SE','japaraiba'),
('3135357','Japonvar','MG','SE','japonvar'),
('3135407','Jeceaba','MG','SE','jeceaba'),
('3135456','Jenipapo de Minas','MG','SE','jenipapo de minas'),
('3135506','Jequeri','MG','SE','jequeri'),
('3135605','Jequitaí','MG','SE','jequitai'),
('3135704','Jequitibá','MG','SE','jequitiba'),
('3135803','Jequitinhonha','MG','SE','jequitinhonha'),
('3135902','Jesuânia','MG','SE','jesuania'),
('3136009','Joaíma','MG','SE','joaima'),
('3136108','Joanésia','MG','SE','joanesia'),
('3136207','João Monlevade','MG','SE','joao monlevade'),
('3136306','João Pinheiro','MG','SE','joao pinheiro'),
('3136405','Joaquim Felício','MG','SE','joaquim felicio'),
('3136504','Jordânia','MG','SE','jordania'),
('3136520','José Gonçalves de Minas','MG','SE','jose goncalves de minas'),
('3136553','José Raydan','MG','SE','jose raydan'),
('3136579','Josenópolis','MG','SE','josenopolis'),
('3136603','Nova União','MG','SE','nova uniao'),
('3136652','Juatuba','MG','SE','juatuba'),
('3136702','Juiz de Fora','MG','SE','juiz de fora'),
('3136801','Juramento','MG','SE','juramento'),
('3136900','Juruaia','MG','SE','juruaia'),
('3136959','Juvenília','MG','SE','juvenilia'),
('3137007','Ladainha','MG','SE','ladainha'),
('3137106','Lagamar','MG','SE','lagamar'),
('3137205','Lagoa da Prata','MG','SE','lagoa da prata'),
('3137304','Lagoa dos Patos','MG','SE','lagoa dos patos'),
('3137403','Lagoa Dourada','MG','SE','lagoa dourada'),
('3137502','Lagoa Formosa','MG','SE','lagoa formosa'),
('3137536','Lagoa Grande','MG','SE','lagoa grande'),
('3137601','Lagoa Santa','MG','SE','lagoa santa'),
('3137700','Lajinha','MG','SE','lajinha'),
('3137809','Lambari','MG','SE','lambari'),
('3137908','Lamim','MG','SE','lamim'),
('3138005','Laranjal','MG','SE','laranjal'),
('3138104','Lassance','MG','SE','lassance'),
('3138203','Lavras','MG','SE','lavras'),
('3138302','Leandro Ferreira','MG','SE','leandro ferreira'),
('3138351','Leme do Prado','MG','SE','leme do prado'),
('3138401','Leopoldina','MG','SE','leopoldina'),
('3138500','Liberdade','MG','SE','liberdade'),
('3138609','Lima Duarte','MG','SE','lima duarte'),
('3138625','Limeira do Oeste','MG','SE','limeira do oeste'),
('3138658','Lontra','MG','SE','lontra'),
('3138674','Luisburgo','MG','SE','luisburgo'),
('3138682','Luislândia','MG','SE','luislandia'),
('3138708','Luminárias','MG','SE','luminarias'),
('3138807','Luz','MG','SE','luz'),
('3138906','Machacalis','MG','SE','machacalis'),
('3139003','Machado','MG','SE','machado'),
('3139102','Madre de Deus de Minas','MG','SE','madre de deus de minas'),
('3139201','Malacacheta','MG','SE','malacacheta'),
('3139250','Mamonas','MG','SE','mamonas'),
('3139300','Manga','MG','SE','manga'),
('3139409','Manhuaçu','MG','SE','manhuacu'),
('3139508','Manhumirim','MG','SE','manhumirim'),
('3139607','Mantena','MG','SE','mantena'),
('3139706','Maravilhas','MG','SE','maravilhas'),
('3139805','Mar de Espanha','MG','SE','mar de espanha'),
('3139904','Maria da Fé','MG','SE','maria da fe'),
('3140001','Mariana','MG','SE','mariana'),
('3140100','Marilac','MG','SE','marilac'),
('3140159','Mário Campos','MG','SE','mario campos'),
('3140209','Maripá de Minas','MG','SE','maripa de minas'),
('3140308','Marliéria','MG','SE','marlieria'),
('3140407','Marmelópolis','MG','SE','marmelopolis'),
('3140506','Martinho Campos','MG','SE','martinho campos'),
('3140530','Martins Soares','MG','SE','martins soares'),
('3140555','Mata Verde','MG','SE','mata verde'),
('3140605','Materlândia','MG','SE','materlandia'),
('3140704','Mateus Leme','MG','SE','mateus leme'),
('3140803','Matias Barbosa','MG','SE','matias barbosa'),
('3140852','Matias Cardoso','MG','SE','matias cardoso'),
('3140902','Matipó','MG','SE','matipo'),
('3141009','Mato Verde','MG','SE','mato verde'),
('3141108','Matozinhos','MG','SE','matozinhos'),
('3141207','Matutina','MG','SE','matutina'),
('3141306','Medeiros','MG','SE','medeiros'),
('3141405','Medina','MG','SE','medina'),
('3141504','Mendes Pimentel','MG','SE','mendes pimentel'),
('3141603','Mercês','MG','SE','merces'),
('3141702','Mesquita','MG','SE','mesquita'),
('3141801','Minas Novas','MG','SE','minas novas'),
('3141900','Minduri','MG','SE','minduri'),
('3142007','Mirabela','MG','SE','mirabela'),
('3142106','Miradouro','MG','SE','miradouro'),
('3142205','Miraí','MG','SE','mirai'),
('3142254','Miravânia','MG','SE','miravania'),
('3142304','Moeda','MG','SE','moeda'),
('3142403','Moema','MG','SE','moema'),
('3142502','Monjolos','MG','SE','monjolos'),
('3142601','Monsenhor Paulo','MG','SE','monsenhor paulo'),
('3142700','Montalvânia','MG','SE','montalvania'),
('3142809','Monte Alegre de Minas','MG','SE','monte alegre de minas'),
('3142908','Monte Azul','MG','SE','monte azul'),
('3143005','Monte Belo','MG','SE','monte belo'),
('3143104','Monte Carmelo','MG','SE','monte carmelo'),
('3143153','Monte Formoso','MG','SE','monte formoso'),
('3143203','Monte Santo de Minas','MG','SE','monte santo de minas'),
('3143302','Montes Claros','MG','SE','montes claros'),
('3143401','Monte Sião','MG','SE','monte siao'),
('3143450','Montezuma','MG','SE','montezuma'),
('3143500','Morada Nova de Minas','MG','SE','morada nova de minas'),
('3143609','Morro da Garça','MG','SE','morro da garca'),
('3143708','Morro do Pilar','MG','SE','morro do pilar'),
('3143807','Munhoz','MG','SE','munhoz'),
('3143906','Muriaé','MG','SE','muriae'),
('3144003','Mutum','MG','SE','mutum'),
('3144102','Muzambinho','MG','SE','muzambinho'),
('3144201','Nacip Raydan','MG','SE','nacip raydan'),
('3144300','Nanuque','MG','SE','nanuque'),
('3144359','Naque','MG','SE','naque'),
('3144375','Natalândia','MG','SE','natalandia'),
('3144409','Natércia','MG','SE','natercia'),
('3144508','Nazareno','MG','SE','nazareno'),
('3144607','Nepomuceno','MG','SE','nepomuceno'),
('3144656','Ninheira','MG','SE','ninheira'),
('3144672','Nova Belém','MG','SE','nova belem'),
('3144706','Nova Era','MG','SE','nova era'),
('3144805','Nova Lima','MG','SE','nova lima'),
('3144904','Nova Módica','MG','SE','nova modica'),
('3145000','Nova Ponte','MG','SE','nova ponte'),
('3145059','Nova Porteirinha','MG','SE','nova porteirinha'),
('3145109','Nova Resende','MG','SE','nova resende'),
('3145208','Nova Serrana','MG','SE','nova serrana'),
('3145307','Novo Cruzeiro','MG','SE','novo cruzeiro'),
('3145356','Novo Oriente de Minas','MG','SE','novo oriente de minas'),
('3145372','Novorizonte','MG','SE','novorizonte'),
('3145406','Olaria','MG','SE','olaria'),
('3145455','Olhos-d''Água','MG','SE','olhos d agua'),
('3145505','Olímpio Noronha','MG','SE','olimpio noronha'),
('3145604','Oliveira','MG','SE','oliveira'),
('3145703','Oliveira Fortes','MG','SE','oliveira fortes'),
('3145802','Onça de Pitangui','MG','SE','onca de pitangui'),
('3145851','Oratórios','MG','SE','oratorios'),
('3145877','Orizânia','MG','SE','orizania'),
('3145901','Ouro Branco','MG','SE','ouro branco'),
('3146008','Ouro Fino','MG','SE','ouro fino'),
('3146107','Ouro Preto','MG','SE','ouro preto'),
('3146206','Ouro Verde de Minas','MG','SE','ouro verde de minas'),
('3146255','Padre Carvalho','MG','SE','padre carvalho'),
('3146305','Padre Paraíso','MG','SE','padre paraiso'),
('3146404','Paineiras','MG','SE','paineiras'),
('3146503','Pains','MG','SE','pains'),
('3146552','Pai Pedro','MG','SE','pai pedro'),
('3146602','Paiva','MG','SE','paiva'),
('3146701','Palma','MG','SE','palma'),
('3146750','Palmópolis','MG','SE','palmopolis'),
('3146909','Papagaios','MG','SE','papagaios'),
('3147006','Paracatu','MG','SE','paracatu'),
('3147105','Pará de Minas','MG','SE','para de minas'),
('3147204','Paraguaçu','MG','SE','paraguacu'),
('3147303','Paraisópolis','MG','SE','paraisopolis'),
('3147402','Paraopeba','MG','SE','paraopeba'),
('3147501','Passabém','MG','SE','passabem'),
('3147600','Passa Quatro','MG','SE','passa quatro'),
('3147709','Passa Tempo','MG','SE','passa tempo'),
('3147808','Passa Vinte','MG','SE','passa vinte'),
('3147907','Passos','MG','SE','passos'),
('3147956','Patis','MG','SE','patis'),
('3148004','Patos de Minas','MG','SE','patos de minas'),
('3148103','Patrocínio','MG','SE','patrocinio'),
('3148202','Patrocínio do Muriaé','MG','SE','patrocinio do muriae'),
('3148301','Paula Cândido','MG','SE','paula candido'),
('3148400','Paulistas','MG','SE','paulistas'),
('3148509','Pavão','MG','SE','pavao'),
('3148608','Peçanha','MG','SE','pecanha'),
('3148707','Pedra Azul','MG','SE','pedra azul'),
('3148756','Pedra Bonita','MG','SE','pedra bonita'),
('3148806','Pedra do Anta','MG','SE','pedra do anta'),
('3148905','Pedra do Indaiá','MG','SE','pedra do indaia'),
('3149002','Pedra Dourada','MG','SE','pedra dourada'),
('3149101','Pedralva','MG','SE','pedralva'),
('3149150','Pedras de Maria da Cruz','MG','SE','pedras de maria da cruz'),
('3149200','Pedrinópolis','MG','SE','pedrinopolis'),
('3149309','Pedro Leopoldo','MG','SE','pedro leopoldo'),
('3149408','Pedro Teixeira','MG','SE','pedro teixeira'),
('3149507','Pequeri','MG','SE','pequeri'),
('3149606','Pequi','MG','SE','pequi'),
('3149705','Perdigão','MG','SE','perdigao'),
('3149804','Perdizes','MG','SE','perdizes'),
('3149903','Perdões','MG','SE','perdoes'),
('3149952','Periquito','MG','SE','periquito'),
('3150000','Pescador','MG','SE','pescador'),
('3150109','Piau','MG','SE','piau'),
('3150158','Piedade de Caratinga','MG','SE','piedade de caratinga'),
('3150208','Piedade de Ponte Nova','MG','SE','piedade de ponte nova'),
('3150307','Piedade do Rio Grande','MG','SE','piedade do rio grande'),
('3150406','Piedade dos Gerais','MG','SE','piedade dos gerais'),
('3150505','Pimenta','MG','SE','pimenta'),
('3150539','Pingo-d''Água','MG','SE','pingo d agua'),
('3150570','Pintópolis','MG','SE','pintopolis'),
('3150604','Piracema','MG','SE','piracema'),
('3150703','Pirajuba','MG','SE','pirajuba'),
('3150802','Piranga','MG','SE','piranga'),
('3150901','Piranguçu','MG','SE','pirangucu'),
('3151008','Piranguinho','MG','SE','piranguinho'),
('3151107','Pirapetinga','MG','SE','pirapetinga'),
('3151206','Pirapora','MG','SE','pirapora'),
('3151305','Piraúba','MG','SE','pirauba'),
('3151404','Pitangui','MG','SE','pitangui'),
('3151503','Piumhi','MG','SE','piumhi'),
('3151602','Planura','MG','SE','planura'),
('3151701','Poço Fundo','MG','SE','poco fundo'),
('3151800','Poços de Caldas','MG','SE','pocos de caldas'),
('3151909','Pocrane','MG','SE','pocrane'),
('3152006','Pompéu','MG','SE','pompeu'),
('3152105','Ponte Nova','MG','SE','ponte nova'),
('3152131','Ponto Chique','MG','SE','ponto chique'),
('3152170','Ponto dos Volantes','MG','SE','ponto dos volantes'),
('3152204','Porteirinha','MG','SE','porteirinha'),
('3152303','Porto Firme','MG','SE','porto firme'),
('3152402','Poté','MG','SE','pote'),
('3152501','Pouso Alegre','MG','SE','pouso alegre'),
('3152600','Pouso Alto','MG','SE','pouso alto'),
('3152709','Prados','MG','SE','prados'),
('3152808','Prata','MG','SE','prata'),
('3152907','Pratápolis','MG','SE','pratapolis'),
('3153004','Pratinha','MG','SE','pratinha'),
('3153103','Presidente Bernardes','MG','SE','presidente bernardes'),
('3153202','Presidente Juscelino','MG','SE','presidente juscelino'),
('3153301','Presidente Kubitschek','MG','SE','presidente kubitschek'),
('3153400','Presidente Olegário','MG','SE','presidente olegario'),
('3153509','Alto Jequitibá','MG','SE','alto jequitiba'),
('3153608','Prudente de Morais','MG','SE','prudente de morais'),
('3153707','Quartel Geral','MG','SE','quartel geral'),
('3153806','Queluzito','MG','SE','queluzito'),
('3153905','Raposos','MG','SE','raposos'),
('3154002','Raul Soares','MG','SE','raul soares'),
('3154101','Recreio','MG','SE','recreio'),
('3154150','Reduto','MG','SE','reduto'),
('3154200','Resende Costa','MG','SE','resende costa'),
('3154309','Resplendor','MG','SE','resplendor'),
('3154408','Ressaquinha','MG','SE','ressaquinha'),
('3154457','Riachinho','MG','SE','riachinho'),
('3154507','Riacho dos Machados','MG','SE','riacho dos machados'),
('3154606','Ribeirão das Neves','MG','SE','ribeirao das neves'),
('3154705','Ribeirão Vermelho','MG','SE','ribeirao vermelho'),
('3154804','Rio Acima','MG','SE','rio acima'),
('3154903','Rio Casca','MG','SE','rio casca'),
('3155009','Rio Doce','MG','SE','rio doce'),
('3155108','Rio do Prado','MG','SE','rio do prado'),
('3155207','Rio Espera','MG','SE','rio espera'),
('3155306','Rio Manso','MG','SE','rio manso'),
('3155405','Rio Novo','MG','SE','rio novo'),
('3155504','Rio Paranaíba','MG','SE','rio paranaiba'),
('3155603','Rio Pardo de Minas','MG','SE','rio pardo de minas'),
('3155702','Rio Piracicaba','MG','SE','rio piracicaba'),
('3155801','Rio Pomba','MG','SE','rio pomba'),
('3155900','Rio Preto','MG','SE','rio preto'),
('3156007','Rio Vermelho','MG','SE','rio vermelho'),
('3156106','Ritápolis','MG','SE','ritapolis'),
('3156205','Rochedo de Minas','MG','SE','rochedo de minas'),
('3156304','Rodeiro','MG','SE','rodeiro'),
('3156403','Romaria','MG','SE','romaria'),
('3156452','Rosário da Limeira','MG','SE','rosario da limeira'),
('3156502','Rubelita','MG','SE','rubelita'),
('3156601','Rubim','MG','SE','rubim'),
('3156700','Sabará','MG','SE','sabara'),
('3156809','Sabinópolis','MG','SE','sabinopolis'),
('3156908','Sacramento','MG','SE','sacramento'),
('3157005','Salinas','MG','SE','salinas'),
('3157104','Salto da Divisa','MG','SE','salto da divisa'),
('3157203','Santa Bárbara','MG','SE','santa barbara'),
('3157252','Santa Bárbara do Leste','MG','SE','santa barbara do leste'),
('3157278','Santa Bárbara do Monte Verde','MG','SE','santa barbara do monte verde'),
('3157302','Santa Bárbara do Tugúrio','MG','SE','santa barbara do tugurio'),
('3157336','Santa Cruz de Minas','MG','SE','santa cruz de minas'),
('3157377','Santa Cruz de Salinas','MG','SE','santa cruz de salinas'),
('3157401','Santa Cruz do Escalvado','MG','SE','santa cruz do escalvado'),
('3157500','Santa Efigênia de Minas','MG','SE','santa efigenia de minas'),
('3157609','Santa Fé de Minas','MG','SE','santa fe de minas'),
('3157658','Santa Helena de Minas','MG','SE','santa helena de minas'),
('3157708','Santa Juliana','MG','SE','santa juliana'),
('3157807','Santa Luzia','MG','SE','santa luzia'),
('3157906','Santa Margarida','MG','SE','santa margarida'),
('3158003','Santa Maria de Itabira','MG','SE','santa maria de itabira'),
('3158102','Santa Maria do Salto','MG','SE','santa maria do salto'),
('3158201','Santa Maria do Suaçuí','MG','SE','santa maria do suacui'),
('3158300','Santana da Vargem','MG','SE','santana da vargem'),
('3158409','Santana de Cataguases','MG','SE','santana de cataguases'),
('3158508','Santana de Pirapama','MG','SE','santana de pirapama'),
('3158607','Santana do Deserto','MG','SE','santana do deserto'),
('3158706','Santana do Garambéu','MG','SE','santana do garambeu'),
('3158805','Santana do Jacaré','MG','SE','santana do jacare'),
('3158904','Santana do Manhuaçu','MG','SE','santana do manhuacu'),
('3158953','Santana do Paraíso','MG','SE','santana do paraiso'),
('3159001','Santana do Riacho','MG','SE','santana do riacho'),
('3159100','Santana dos Montes','MG','SE','santana dos montes'),
('3159209','Santa Rita de Caldas','MG','SE','santa rita de caldas'),
('3159308','Santa Rita de Jacutinga','MG','SE','santa rita de jacutinga'),
('3159357','Santa Rita de Minas','MG','SE','santa rita de minas'),
('3159407','Santa Rita de Ibitipoca','MG','SE','santa rita de ibitipoca'),
('3159506','Santa Rita do Itueto','MG','SE','santa rita do itueto'),
('3159605','Santa Rita do Sapucaí','MG','SE','santa rita do sapucai'),
('3159704','Santa Rosa da Serra','MG','SE','santa rosa da serra'),
('3159803','Santa Vitória','MG','SE','santa vitoria'),
('3159902','Santo Antônio do Amparo','MG','SE','santo antonio do amparo'),
('3160009','Santo Antônio do Aventureiro','MG','SE','santo antonio do aventureiro'),
('3160108','Santo Antônio do Grama','MG','SE','santo antonio do grama'),
('3160207','Santo Antônio do Itambé','MG','SE','santo antonio do itambe'),
('3160306','Santo Antônio do Jacinto','MG','SE','santo antonio do jacinto'),
('3160405','Santo Antônio do Monte','MG','SE','santo antonio do monte'),
('3160454','Santo Antônio do Retiro','MG','SE','santo antonio do retiro'),
('3160504','Santo Antônio do Rio Abaixo','MG','SE','santo antonio do rio abaixo'),
('3160603','Santo Hipólito','MG','SE','santo hipolito'),
('3160702','Santos Dumont','MG','SE','santos dumont'),
('3160801','São Bento Abade','MG','SE','sao bento abade'),
('3160900','São Brás do Suaçuí','MG','SE','sao bras do suacui'),
('3160959','São Domingos das Dores','MG','SE','sao domingos das dores'),
('3161007','São Domingos do Prata','MG','SE','sao domingos do prata'),
('3161056','São Félix de Minas','MG','SE','sao felix de minas'),
('3161106','São Francisco','MG','SE','sao francisco'),
('3161205','São Francisco de Paula','MG','SE','sao francisco de paula'),
('3161304','São Francisco de Sales','MG','SE','sao francisco de sales'),
('3161403','São Francisco do Glória','MG','SE','sao francisco do gloria'),
('3161502','São Geraldo','MG','SE','sao geraldo'),
('3161601','São Geraldo da Piedade','MG','SE','sao geraldo da piedade'),
('3161650','São Geraldo do Baixio','MG','SE','sao geraldo do baixio'),
('3161700','São Gonçalo do Abaeté','MG','SE','sao goncalo do abaete'),
('3161809','São Gonçalo do Pará','MG','SE','sao goncalo do para'),
('3161908','São Gonçalo do Rio Abaixo','MG','SE','sao goncalo do rio abaixo'),
('3162005','São Gonçalo do Sapucaí','MG','SE','sao goncalo do sapucai'),
('3162104','São Gotardo','MG','SE','sao gotardo'),
('3162203','São João Batista do Glória','MG','SE','sao joao batista do gloria'),
('3162252','São João da Lagoa','MG','SE','sao joao da lagoa'),
('3162302','São João da Mata','MG','SE','sao joao da mata'),
('3162401','São João da Ponte','MG','SE','sao joao da ponte'),
('3162450','São João das Missões','MG','SE','sao joao das missoes'),
('3162500','São João del Rei','MG','SE','sao joao del rei'),
('3162559','São João do Manhuaçu','MG','SE','sao joao do manhuacu'),
('3162575','São João do Manteninha','MG','SE','sao joao do manteninha'),
('3162609','São João do Oriente','MG','SE','sao joao do oriente'),
('3162658','São João do Pacuí','MG','SE','sao joao do pacui'),
('3162708','São João do Paraíso','MG','SE','sao joao do paraiso'),
('3162807','São João Evangelista','MG','SE','sao joao evangelista'),
('3162906','São João Nepomuceno','MG','SE','sao joao nepomuceno'),
('3162922','São Joaquim de Bicas','MG','SE','sao joaquim de bicas'),
('3162948','São José da Barra','MG','SE','sao jose da barra'),
('3162955','São José da Lapa','MG','SE','sao jose da lapa'),
('3163003','São José da Safira','MG','SE','sao jose da safira'),
('3163102','São José da Varginha','MG','SE','sao jose da varginha'),
('3163201','São José do Alegre','MG','SE','sao jose do alegre'),
('3163300','São José do Divino','MG','SE','sao jose do divino'),
('3163409','São José do Goiabal','MG','SE','sao jose do goiabal'),
('3163508','São José do Jacuri','MG','SE','sao jose do jacuri'),
('3163607','São José do Mantimento','MG','SE','sao jose do mantimento'),
('3163706','São Lourenço','MG','SE','sao lourenco'),
('3163805','São Miguel do Anta','MG','SE','sao miguel do anta'),
('3163904','São Pedro da União','MG','SE','sao pedro da uniao'),
('3164001','São Pedro dos Ferros','MG','SE','sao pedro dos ferros'),
('3164100','São Pedro do Suaçuí','MG','SE','sao pedro do suacui'),
('3164209','São Romão','MG','SE','sao romao'),
('3164308','São Roque de Minas','MG','SE','sao roque de minas'),
('3164407','São Sebastião da Bela Vista','MG','SE','sao sebastiao da bela vista'),
('3164431','São Sebastião da Vargem Alegre','MG','SE','sao sebastiao da vargem alegre'),
('3164472','São Sebastião do Anta','MG','SE','sao sebastiao do anta'),
('3164506','São Sebastião do Maranhão','MG','SE','sao sebastiao do maranhao'),
('3164605','São Sebastião do Oeste','MG','SE','sao sebastiao do oeste'),
('3164704','São Sebastião do Paraíso','MG','SE','sao sebastiao do paraiso'),
('3164803','São Sebastião do Rio Preto','MG','SE','sao sebastiao do rio preto'),
('3164902','São Sebastião do Rio Verde','MG','SE','sao sebastiao do rio verde'),
('3165008','São Tiago','MG','SE','sao tiago'),
('3165107','São Tomás de Aquino','MG','SE','sao tomas de aquino'),
('3165206','São Tomé das Letras','MG','SE','sao tome das letras'),
('3165305','São Vicente de Minas','MG','SE','sao vicente de minas'),
('3165404','Sapucaí-Mirim','MG','SE','sapucai mirim'),
('3165503','Sardoá','MG','SE','sardoa'),
('3165537','Sarzedo','MG','SE','sarzedo'),
('3165552','Setubinha','MG','SE','setubinha'),
('3165560','Sem-Peixe','MG','SE','sem peixe'),
('3165578','Senador Amaral','MG','SE','senador amaral'),
('3165602','Senador Cortes','MG','SE','senador cortes'),
('3165701','Senador Firmino','MG','SE','senador firmino'),
('3165800','Senador José Bento','MG','SE','senador jose bento'),
('3165909','Senador Modestino Gonçalves','MG','SE','senador modestino goncalves'),
('3166006','Senhora de Oliveira','MG','SE','senhora de oliveira'),
('3166105','Senhora do Porto','MG','SE','senhora do porto'),
('3166204','Senhora dos Remédios','MG','SE','senhora dos remedios'),
('3166303','Sericita','MG','SE','sericita'),
('3166402','Seritinga','MG','SE','seritinga'),
('3166501','Serra Azul de Minas','MG','SE','serra azul de minas'),
('3166600','Serra da Saudade','MG','SE','serra da saudade'),
('3166709','Serra dos Aimorés','MG','SE','serra dos aimores'),
('3166808','Serra do Salitre','MG','SE','serra do salitre'),
('3166907','Serrania','MG','SE','serrania'),
('3166956','Serranópolis de Minas','MG','SE','serranopolis de minas'),
('3167004','Serranos','MG','SE','serranos'),
('3167103','Serro','MG','SE','serro'),
('3167202','Sete Lagoas','MG','SE','sete lagoas'),
('3167301','Silveirânia','MG','SE','silveirania'),
('3167400','Silvianópolis','MG','SE','silvianopolis'),
('3167509','Simão Pereira','MG','SE','simao pereira'),
('3167608','Simonésia','MG','SE','simonesia'),
('3167707','Sobrália','MG','SE','sobralia'),
('3167806','Soledade de Minas','MG','SE','soledade de minas'),
('3167905','Tabuleiro','MG','SE','tabuleiro'),
('3168002','Taiobeiras','MG','SE','taiobeiras'),
('3168051','Taparuba','MG','SE','taparuba'),
('3168101','Tapira','MG','SE','tapira'),
('3168200','Tapiraí','MG','SE','tapirai'),
('3168309','Taquaraçu de Minas','MG','SE','taquaracu de minas'),
('3168408','Tarumirim','MG','SE','tarumirim'),
('3168507','Teixeiras','MG','SE','teixeiras'),
('3168606','Teófilo Otoni','MG','SE','teofilo otoni'),
('3168705','Timóteo','MG','SE','timoteo'),
('3168804','Tiradentes','MG','SE','tiradentes'),
('3168903','Tiros','MG','SE','tiros'),
('3169000','Tocantins','MG','SE','tocantins'),
('3169059','Tocos do Moji','MG','SE','tocos do moji'),
('3169109','Toledo','MG','SE','toledo'),
('3169208','Tombos','MG','SE','tombos'),
('3169307','Três Corações','MG','SE','tres coracoes'),
('3169356','Três Marias','MG','SE','tres marias'),
('3169406','Três Pontas','MG','SE','tres pontas'),
('3169505','Tumiritinga','MG','SE','tumiritinga'),
('3169604','Tupaciguara','MG','SE','tupaciguara'),
('3169703','Turmalina','MG','SE','turmalina'),
('3169802','Turvolândia','MG','SE','turvolandia'),
('3169901','Ubá','MG','SE','uba'),
('3170008','Ubaí','MG','SE','ubai'),
('3170057','Ubaporanga','MG','SE','ubaporanga'),
('3170107','Uberaba','MG','SE','uberaba'),
('3170206','Uberlândia','MG','SE','uberlandia'),
('3170305','Umburatiba','MG','SE','umburatiba'),
('3170404','Unaí','MG','SE','unai'),
('3170438','União de Minas','MG','SE','uniao de minas'),
('3170479','Uruana de Minas','MG','SE','uruana de minas'),
('3170503','Urucânia','MG','SE','urucania'),
('3170529','Urucuia','MG','SE','urucuia'),
('3170578','Vargem Alegre','MG','SE','vargem alegre'),
('3170602','Vargem Bonita','MG','SE','vargem bonita'),
('3170651','Vargem Grande do Rio Pardo','MG','SE','vargem grande do rio pardo'),
('3170701','Varginha','MG','SE','varginha'),
('3170750','Varjão de Minas','MG','SE','varjao de minas'),
('3170800','Várzea da Palma','MG','SE','varzea da palma'),
('3170909','Varzelândia','MG','SE','varzelandia'),
('3171006','Vazante','MG','SE','vazante'),
('3171030','Verdelândia','MG','SE','verdelandia'),
('3171071','Veredinha','MG','SE','veredinha'),
('3171105','Veríssimo','MG','SE','verissimo'),
('3171154','Vermelho Novo','MG','SE','vermelho novo'),
('3171204','Vespasiano','MG','SE','vespasiano'),
('3171303','Viçosa','MG','SE','vicosa'),
('3171402','Vieiras','MG','SE','vieiras'),
('3171501','Mathias Lobato','MG','SE','mathias lobato'),
('3171600','Virgem da Lapa','MG','SE','virgem da lapa'),
('3171709','Virgínia','MG','SE','virginia'),
('3171808','Virginópolis','MG','SE','virginopolis'),
('3171907','Virgolândia','MG','SE','virgolandia'),
('3172004','Visconde do Rio Branco','MG','SE','visconde do rio branco'),
('3172103','Volta Grande','MG','SE','volta grande'),
('3172202','Wenceslau Braz','MG','SE','wenceslau braz'),
('3200102','Afonso Cláudio','ES','SE','afonso claudio'),
('3200136','Águia Branca','ES','SE','aguia branca'),
('3200169','Água Doce do Norte','ES','SE','agua doce do norte'),
('3200201','Alegre','ES','SE','alegre'),
('3200300','Alfredo Chaves','ES','SE','alfredo chaves'),
('3200359','Alto Rio Novo','ES','SE','alto rio novo'),
('3200409','Anchieta','ES','SE','anchieta'),
('3200508','Apiacá','ES','SE','apiaca'),
('3200607','Aracruz','ES','SE','aracruz'),
('3200706','Atílio Vivácqua','ES','SE','atilio vivacqua'),
('3200805','Baixo Guandu','ES','SE','baixo guandu'),
('3200904','Barra de São Francisco','ES','SE','barra de sao francisco'),
('3201001','Boa Esperança','ES','SE','boa esperanca'),
('3201100','Bom Jesus do Norte','ES','SE','bom jesus do norte'),
('3201159','Brejetuba','ES','SE','brejetuba'),
('3201209','Cachoeiro de Itapemirim','ES','SE','cachoeiro de itapemirim'),
('3201308','Cariacica','ES','SE','cariacica'),
('3201407','Castelo','ES','SE','castelo'),
('3201506','Colatina','ES','SE','colatina'),
('3201605','Conceição da Barra','ES','SE','conceicao da barra'),
('3201704','Conceição do Castelo','ES','SE','conceicao do castelo'),
('3201803','Divino de São Lourenço','ES','SE','divino de sao lourenco'),
('3201902','Domingos Martins','ES','SE','domingos martins'),
('3202009','Dores do Rio Preto','ES','SE','dores do rio preto'),
('3202108','Ecoporanga','ES','SE','ecoporanga'),
('3202207','Fundão','ES','SE','fundao'),
('3202256','Governador Lindenberg','ES','SE','governador lindenberg'),
('3202306','Guaçuí','ES','SE','guacui'),
('3202405','Guarapari','ES','SE','guarapari'),
('3202454','Ibatiba','ES','SE','ibatiba'),
('3202504','Ibiraçu','ES','SE','ibiracu'),
('3202553','Ibitirama','ES','SE','ibitirama'),
('3202603','Iconha','ES','SE','iconha'),
('3202652','Irupi','ES','SE','irupi'),
('3202702','Itaguaçu','ES','SE','itaguacu'),
('3202801','Itapemirim','ES','SE','itapemirim'),
('3202900','Itarana','ES','SE','itarana'),
('3203007','Iúna','ES','SE','iuna'),
('3203056','Jaguaré','ES','SE','jaguare'),
('3203106','Jerônimo Monteiro','ES','SE','jeronimo monteiro'),
('3203130','João Neiva','ES','SE','joao neiva'),
('3203163','Laranja da Terra','ES','SE','laranja da terra'),
('3203205','Linhares','ES','SE','linhares'),
('3203304','Mantenópolis','ES','SE','mantenopolis'),
('3203320','Marataízes','ES','SE','marataizes'),
('3203346','Marechal Floriano','ES','SE','marechal floriano'),
('3203353','Marilândia','ES','SE','marilandia'),
('3203403','Mimoso do Sul','ES','SE','mimoso do sul'),
('3203502','Montanha','ES','SE','montanha'),
('3203601','Mucurici','ES','SE','mucurici'),
('3203700','Muniz Freire','ES','SE','muniz freire'),
('3203809','Muqui','ES','SE','muqui'),
('3203908','Nova Venécia','ES','SE','nova venecia'),
('3204005','Pancas','ES','SE','pancas'),
('3204054','Pedro Canário','ES','SE','pedro canario'),
('3204104','Pinheiros','ES','SE','pinheiros'),
('3204203','Piúma','ES','SE','piuma'),
('3204252','Ponto Belo','ES','SE','ponto belo'),
('3204302','Presidente Kennedy','ES','SE','presidente kennedy'),
('3204351','Rio Bananal','ES','SE','rio bananal'),
('3204401','Rio Novo do Sul','ES','SE','rio novo do sul'),
('3204500','Santa Leopoldina','ES','SE','santa leopoldina'),
('3204559','Santa Maria de Jetibá','ES','SE','santa maria de jetiba'),
('3204609','Santa Teresa','ES','SE','santa teresa'),
('3204658','São Domingos do Norte','ES','SE','sao domingos do norte'),
('3204708','São Gabriel da Palha','ES','SE','sao gabriel da palha'),
('3204807','São José do Calçado','ES','SE','sao jose do calcado'),
('3204906','São Mateus','ES','SE','sao mateus'),
('3204955','São Roque do Canaã','ES','SE','sao roque do canaa'),
('3205002','Serra','ES','SE','serra'),
('3205010','Sooretama','ES','SE','sooretama'),
('3205036','Vargem Alta','ES','SE','vargem alta'),
('3205069','Venda Nova do Imigrante','ES','SE','venda nova do imigrante'),
('3205101','Viana','ES','SE','viana'),
('3205150','Vila Pavão','ES','SE','vila pavao'),
('3205176','Vila Valério','ES','SE','vila valerio'),
('3205200','Vila Velha','ES','SE','vila velha'),
('3205309','Vitória','ES','SE','vitoria'),
('3300100','Angra dos Reis','RJ','SE','angra dos reis'),
('3300159','Aperibé','RJ','SE','aperibe'),
('3300209','Araruama','RJ','SE','araruama'),
('3300225','Areal','RJ','SE','areal'),
('3300233','Armação dos Búzios','RJ','SE','armacao dos buzios'),
('3300258','Arraial do Cabo','RJ','SE','arraial do cabo'),
('3300308','Barra do Piraí','RJ','SE','barra do pirai'),
('3300407','Barra Mansa','RJ','SE','barra mansa'),
('3300456','Belford Roxo','RJ','SE','belford roxo'),
('3300506','Bom Jardim','RJ','SE','bom jardim'),
('3300605','Bom Jesus do Itabapoana','RJ','SE','bom jesus do itabapoana'),
('3300704','Cabo Frio','RJ','SE','cabo frio'),
('3300803','Cachoeiras de Macacu','RJ','SE','cachoeiras de macacu'),
('3300902','Cambuci','RJ','SE','cambuci'),
('3300936','Carapebus','RJ','SE','carapebus'),
('3300951','Comendador Levy Gasparian','RJ','SE','comendador levy gasparian'),
('3301009','Campos dos Goytacazes','RJ','SE','campos dos goytacazes'),
('3301108','Cantagalo','RJ','SE','cantagalo'),
('3301157','Cardoso Moreira','RJ','SE','cardoso moreira'),
('3301207','Carmo','RJ','SE','carmo'),
('3301306','Casimiro de Abreu','RJ','SE','casimiro de abreu'),
('3301405','Conceição de Macabu','RJ','SE','conceicao de macabu'),
('3301504','Cordeiro','RJ','SE','cordeiro'),
('3301603','Duas Barras','RJ','SE','duas barras'),
('3301702','Duque de Caxias','RJ','SE','duque de caxias'),
('3301801','Engenheiro Paulo de Frontin','RJ','SE','engenheiro paulo de frontin'),
('3301850','Guapimirim','RJ','SE','guapimirim'),
('3301876','Iguaba Grande','RJ','SE','iguaba grande'),
('3301900','Itaboraí','RJ','SE','itaborai'),
('3302007','Itaguaí','RJ','SE','itaguai'),
('3302056','Italva','RJ','SE','italva'),
('3302106','Itaocara','RJ','SE','itaocara'),
('3302205','Itaperuna','RJ','SE','itaperuna'),
('3302254','Itatiaia','RJ','SE','itatiaia'),
('3302270','Japeri','RJ','SE','japeri'),
('3302304','Laje do Muriaé','RJ','SE','laje do muriae'),
('3302403','Macaé','RJ','SE','macae'),
('3302452','Macuco','RJ','SE','macuco'),
('3302502','Magé','RJ','SE','mage'),
('3302601','Mangaratiba','RJ','SE','mangaratiba'),
('3302700','Maricá','RJ','SE','marica'),
('3302809','Mendes','RJ','SE','mendes'),
('3302858','Mesquita','RJ','SE','mesquita'),
('3302908','Miguel Pereira','RJ','SE','miguel pereira'),
('3303005','Miracema','RJ','SE','miracema'),
('3303104','Natividade','RJ','SE','natividade'),
('3303203','Nilópolis','RJ','SE','nilopolis'),
('3303302','Niterói','RJ','SE','niteroi'),
('3303401','Nova Friburgo','RJ','SE','nova friburgo'),
('3303500','Nova Iguaçu','RJ','SE','nova iguacu'),
('3303609','Paracambi','RJ','SE','paracambi'),
('3303708','Paraíba do Sul','RJ','SE','paraiba do sul'),
('3303807','Paraty','RJ','SE','paraty'),
('3303856','Paty do Alferes','RJ','SE','paty do alferes'),
('3303906','Petrópolis','RJ','SE','petropolis'),
('3303955','Pinheiral','RJ','SE','pinheiral'),
('3304003','Piraí','RJ','SE','pirai'),
('3304102','Porciúncula','RJ','SE','porciuncula'),
('3304110','Porto Real','RJ','SE','porto real'),
('3304128','Quatis','RJ','SE','quatis'),
('3304144','Queimados','RJ','SE','queimados'),
('3304151','Quissamã','RJ','SE','quissama'),
('3304201','Resende','RJ','SE','resende'),
('3304300','Rio Bonito','RJ','SE','rio bonito'),
('3304409','Rio Claro','RJ','SE','rio claro'),
('3304508','Rio das Flores','RJ','SE','rio das flores'),
('3304524','Rio das Ostras','RJ','SE','rio das ostras'),
('3304557','Rio de Janeiro','RJ','SE','rio de janeiro'),
('3304607','Santa Maria Madalena','RJ','SE','santa maria madalena'),
('3304706','Santo Antônio de Pádua','RJ','SE','santo antonio de padua'),
('3304755','São Francisco de Itabapoana','RJ','SE','sao francisco de itabapoana'),
('3304805','São Fidélis','RJ','SE','sao fidelis'),
('3304904','São Gonçalo','RJ','SE','sao goncalo'),
('3305000','São João da Barra','RJ','SE','sao joao da barra'),
('3305109','São João de Meriti','RJ','SE','sao joao de meriti'),
('3305133','São José de Ubá','RJ','SE','sao jose de uba'),
('3305158','São José do Vale do Rio Preto','RJ','SE','sao jose do vale do rio preto'),
('3305208','São Pedro da Aldeia','RJ','SE','sao pedro da aldeia'),
('3305307','São Sebastião do Alto','RJ','SE','sao sebastiao do alto'),
('3305406','Sapucaia','RJ','SE','sapucaia'),
('3305505','Saquarema','RJ','SE','saquarema'),
('3305554','Seropédica','RJ','SE','seropedica'),
('3305604','Silva Jardim','RJ','SE','silva jardim'),
('3305703','Sumidouro','RJ','SE','sumidouro'),
('3305752','Tanguá','RJ','SE','tangua'),
('3305802','Teresópolis','RJ','SE','teresopolis'),
('3305901','Trajano de Moraes','RJ','SE','trajano de moraes'),
('3306008','Três Rios','RJ','SE','tres rios'),
('3306107','Valença','RJ','SE','valenca'),
('3306156','Varre-Sai','RJ','SE','varre sai'),
('3306206','Vassouras','RJ','SE','vassouras'),
('3306305','Volta Redonda','RJ','SE','volta redonda'),
('3500105','Adamantina','SP','SE','adamantina'),
('3500204','Adolfo','SP','SE','adolfo'),
('3500303','Aguaí','SP','SE','aguai'),
('3500402','Águas da Prata','SP','SE','aguas da prata'),
('3500501','Águas de Lindóia','SP','SE','aguas de lindoia'),
('3500550','Águas de Santa Bárbara','SP','SE','aguas de santa barbara'),
('3500600','Águas de São Pedro','SP','SE','aguas de sao pedro'),
('3500709','Agudos','SP','SE','agudos'),
('3500758','Alambari','SP','SE','alambari'),
('3500808','Alfredo Marcondes','SP','SE','alfredo marcondes'),
('3500907','Altair','SP','SE','altair'),
('3501004','Altinópolis','SP','SE','altinopolis'),
('3501103','Alto Alegre','SP','SE','alto alegre'),
('3501152','Alumínio','SP','SE','aluminio'),
('3501202','Álvares Florence','SP','SE','alvares florence'),
('3501301','Álvares Machado','SP','SE','alvares machado'),
('3501400','Álvaro de Carvalho','SP','SE','alvaro de carvalho'),
('3501509','Alvinlândia','SP','SE','alvinlandia'),
('3501608','Americana','SP','SE','americana'),
('3501707','Américo Brasiliense','SP','SE','americo brasiliense'),
('3501806','Américo de Campos','SP','SE','americo de campos'),
('3501905','Amparo','SP','SE','amparo'),
('3502002','Analândia','SP','SE','analandia'),
('3502101','Andradina','SP','SE','andradina'),
('3502200','Angatuba','SP','SE','angatuba'),
('3502309','Anhembi','SP','SE','anhembi'),
('3502408','Anhumas','SP','SE','anhumas'),
('3502507','Aparecida','SP','SE','aparecida'),
('3502606','Aparecida d''Oeste','SP','SE','aparecida d oeste'),
('3502705','Apiaí','SP','SE','apiai'),
('3502754','Araçariguama','SP','SE','aracariguama'),
('3502804','Araçatuba','SP','SE','aracatuba'),
('3502903','Araçoiaba da Serra','SP','SE','aracoiaba da serra'),
('3503000','Aramina','SP','SE','aramina'),
('3503109','Arandu','SP','SE','arandu'),
('3503158','Arapeí','SP','SE','arapei'),
('3503208','Araraquara','SP','SE','araraquara'),
('3503307','Araras','SP','SE','araras'),
('3503356','Arco-Íris','SP','SE','arco iris'),
('3503406','Arealva','SP','SE','arealva'),
('3503505','Areias','SP','SE','areias'),
('3503604','Areiópolis','SP','SE','areiopolis'),
('3503703','Ariranha','SP','SE','ariranha'),
('3503802','Artur Nogueira','SP','SE','artur nogueira'),
('3503901','Arujá','SP','SE','aruja'),
('3503950','Aspásia','SP','SE','aspasia'),
('3504008','Assis','SP','SE','assis'),
('3504107','Atibaia','SP','SE','atibaia'),
('3504206','Auriflama','SP','SE','auriflama'),
('3504305','Avaí','SP','SE','avai'),
('3504404','Avanhandava','SP','SE','avanhandava'),
('3504503','Avaré','SP','SE','avare'),
('3504602','Bady Bassitt','SP','SE','bady bassitt'),
('3504701','Balbinos','SP','SE','balbinos'),
('3504800','Bálsamo','SP','SE','balsamo'),
('3504909','Bananal','SP','SE','bananal'),
('3505005','Barão de Antonina','SP','SE','barao de antonina'),
('3505104','Barbosa','SP','SE','barbosa'),
('3505203','Bariri','SP','SE','bariri'),
('3505302','Barra Bonita','SP','SE','barra bonita'),
('3505351','Barra do Chapéu','SP','SE','barra do chapeu'),
('3505401','Barra do Turvo','SP','SE','barra do turvo'),
('3505500','Barretos','SP','SE','barretos'),
('3505609','Barrinha','SP','SE','barrinha'),
('3505708','Barueri','SP','SE','barueri'),
('3505807','Bastos','SP','SE','bastos'),
('3505906','Batatais','SP','SE','batatais'),
('3506003','Bauru','SP','SE','bauru'),
('3506102','Bebedouro','SP','SE','bebedouro'),
('3506201','Bento de Abreu','SP','SE','bento de abreu'),
('3506300','Bernardino de Campos','SP','SE','bernardino de campos'),
('3506359','Bertioga','SP','SE','bertioga'),
('3506409','Bilac','SP','SE','bilac'),
('3506508','Birigui','SP','SE','birigui'),
('3506607','Biritiba Mirim','SP','SE','biritiba mirim'),
('3506706','Boa Esperança do Sul','SP','SE','boa esperanca do sul'),
('3506805','Bocaina','SP','SE','bocaina'),
('3506904','Bofete','SP','SE','bofete'),
('3507001','Boituva','SP','SE','boituva'),
('3507100','Bom Jesus dos Perdões','SP','SE','bom jesus dos perdoes'),
('3507159','Bom Sucesso de Itararé','SP','SE','bom sucesso de itarare'),
('3507209','Borá','SP','SE','bora'),
('3507308','Boracéia','SP','SE','boraceia'),
('3507407','Borborema','SP','SE','borborema'),
('3507456','Borebi','SP','SE','borebi'),
('3507506','Botucatu','SP','SE','botucatu'),
('3507605','Bragança Paulista','SP','SE','braganca paulista'),
('3507704','Braúna','SP','SE','brauna'),
('3507753','Brejo Alegre','SP','SE','brejo alegre'),
('3507803','Brodowski','SP','SE','brodowski'),
('3507902','Brotas','SP','SE','brotas'),
('3508009','Buri','SP','SE','buri'),
('3508108','Buritama','SP','SE','buritama'),
('3508207','Buritizal','SP','SE','buritizal'),
('3508306','Cabrália Paulista','SP','SE','cabralia paulista'),
('3508405','Cabreúva','SP','SE','cabreuva'),
('3508504','Caçapava','SP','SE','cacapava'),
('3508603','Cachoeira Paulista','SP','SE','cachoeira paulista'),
('3508702','Caconde','SP','SE','caconde'),
('3508801','Cafelândia','SP','SE','cafelandia'),
('3508900','Caiabu','SP','SE','caiabu'),
('3509007','Caieiras','SP','SE','caieiras'),
('3509106','Caiuá','SP','SE','caiua'),
('3509205','Cajamar','SP','SE','cajamar'),
('3509254','Cajati','SP','SE','cajati'),
('3509304','Cajobi','SP','SE','cajobi'),
('3509403','Cajuru','SP','SE','cajuru'),
('3509452','Campina do Monte Alegre','SP','SE','campina do monte alegre'),
('3509502','Campinas','SP','SE','campinas'),
('3509601','Campo Limpo Paulista','SP','SE','campo limpo paulista'),
('3509700','Campos do Jordão','SP','SE','campos do jordao'),
('3509809','Campos Novos Paulista','SP','SE','campos novos paulista'),
('3509908','Cananéia','SP','SE','cananeia'),
('3509957','Canas','SP','SE','canas'),
('3510005','Cândido Mota','SP','SE','candido mota'),
('3510104','Cândido Rodrigues','SP','SE','candido rodrigues'),
('3510153','Canitar','SP','SE','canitar'),
('3510203','Capão Bonito','SP','SE','capao bonito'),
('3510302','Capela do Alto','SP','SE','capela do alto'),
('3510401','Capivari','SP','SE','capivari'),
('3510500','Caraguatatuba','SP','SE','caraguatatuba'),
('3510609','Carapicuíba','SP','SE','carapicuiba'),
('3510708','Cardoso','SP','SE','cardoso'),
('3510807','Casa Branca','SP','SE','casa branca'),
('3510906','Cássia dos Coqueiros','SP','SE','cassia dos coqueiros'),
('3511003','Castilho','SP','SE','castilho'),
('3511102','Catanduva','SP','SE','catanduva'),
('3511201','Catiguá','SP','SE','catigua'),
('3511300','Cedral','SP','SE','cedral'),
('3511409','Cerqueira César','SP','SE','cerqueira cesar'),
('3511508','Cerquilho','SP','SE','cerquilho'),
('3511607','Cesário Lange','SP','SE','cesario lange'),
('3511706','Charqueada','SP','SE','charqueada'),
('3511904','Clementina','SP','SE','clementina'),
('3512001','Colina','SP','SE','colina'),
('3512100','Colômbia','SP','SE','colombia'),
('3512209','Conchal','SP','SE','conchal'),
('3512308','Conchas','SP','SE','conchas'),
('3512407','Cordeirópolis','SP','SE','cordeiropolis'),
('3512506','Coroados','SP','SE','coroados'),
('3512605','Coronel Macedo','SP','SE','coronel macedo'),
('3512704','Corumbataí','SP','SE','corumbatai'),
('3512803','Cosmópolis','SP','SE','cosmopolis'),
('3512902','Cosmorama','SP','SE','cosmorama'),
('3513009','Cotia','SP','SE','cotia'),
('3513108','Cravinhos','SP','SE','cravinhos'),
('3513207','Cristais Paulista','SP','SE','cristais paulista'),
('3513306','Cruzália','SP','SE','cruzalia'),
('3513405','Cruzeiro','SP','SE','cruzeiro'),
('3513504','Cubatão','SP','SE','cubatao'),
('3513603','Cunha','SP','SE','cunha'),
('3513702','Descalvado','SP','SE','descalvado'),
('3513801','Diadema','SP','SE','diadema'),
('3513850','Dirce Reis','SP','SE','dirce reis'),
('3513900','Divinolândia','SP','SE','divinolandia'),
('3514007','Dobrada','SP','SE','dobrada'),
('3514106','Dois Córregos','SP','SE','dois corregos'),
('3514205','Dolcinópolis','SP','SE','dolcinopolis'),
('3514304','Dourado','SP','SE','dourado'),
('3514403','Dracena','SP','SE','dracena'),
('3514502','Duartina','SP','SE','duartina'),
('3514601','Dumont','SP','SE','dumont'),
('3514700','Echaporã','SP','SE','echapora'),
('3514809','Eldorado','SP','SE','eldorado'),
('3514908','Elias Fausto','SP','SE','elias fausto'),
('3514924','Elisiário','SP','SE','elisiario'),
('3514957','Embaúba','SP','SE','embauba'),
('3515004','Embu das Artes','SP','SE','embu das artes'),
('3515103','Embu-Guaçu','SP','SE','embu guacu'),
('3515129','Emilianópolis','SP','SE','emilianopolis'),
('3515152','Engenheiro Coelho','SP','SE','engenheiro coelho'),
('3515186','Espírito Santo do Pinhal','SP','SE','espirito santo do pinhal'),
('3515194','Espírito Santo do Turvo','SP','SE','espirito santo do turvo'),
('3515202','Estrela d''Oeste','SP','SE','estrela d oeste'),
('3515301','Estrela do Norte','SP','SE','estrela do norte'),
('3515350','Euclides da Cunha Paulista','SP','SE','euclides da cunha paulista'),
('3515400','Fartura','SP','SE','fartura'),
('3515509','Fernandópolis','SP','SE','fernandopolis'),
('3515608','Fernando Prestes','SP','SE','fernando prestes'),
('3515657','Fernão','SP','SE','fernao'),
('3515707','Ferraz de Vasconcelos','SP','SE','ferraz de vasconcelos'),
('3515806','Flora Rica','SP','SE','flora rica'),
('3515905','Floreal','SP','SE','floreal'),
('3516002','Flórida Paulista','SP','SE','florida paulista'),
('3516101','Florínea','SP','SE','florinea'),
('3516200','Franca','SP','SE','franca'),
('3516309','Francisco Morato','SP','SE','francisco morato'),
('3516408','Franco da Rocha','SP','SE','franco da rocha'),
('3516507','Gabriel Monteiro','SP','SE','gabriel monteiro'),
('3516606','Gália','SP','SE','galia'),
('3516705','Garça','SP','SE','garca'),
('3516804','Gastão Vidigal','SP','SE','gastao vidigal'),
('3516853','Gavião Peixoto','SP','SE','gaviao peixoto'),
('3516903','General Salgado','SP','SE','general salgado'),
('3517000','Getulina','SP','SE','getulina'),
('3517109','Glicério','SP','SE','glicerio'),
('3517208','Guaiçara','SP','SE','guaicara'),
('3517307','Guaimbê','SP','SE','guaimbe'),
('3517406','Guaíra','SP','SE','guaira'),
('3517505','Guapiaçu','SP','SE','guapiacu'),
('3517604','Guapiara','SP','SE','guapiara'),
('3517703','Guará','SP','SE','guara'),
('3517802','Guaraçaí','SP','SE','guaracai'),
('3517901','Guaraci','SP','SE','guaraci'),
('3518008','Guarani d''Oeste','SP','SE','guarani d oeste'),
('3518107','Guarantã','SP','SE','guaranta'),
('3518206','Guararapes','SP','SE','guararapes'),
('3518305','Guararema','SP','SE','guararema'),
('3518404','Guaratinguetá','SP','SE','guaratingueta'),
('3518503','Guareí','SP','SE','guarei'),
('3518602','Guariba','SP','SE','guariba'),
('3518701','Guarujá','SP','SE','guaruja'),
('3518800','Guarulhos','SP','SE','guarulhos'),
('3518859','Guatapará','SP','SE','guatapara'),
('3518909','Guzolândia','SP','SE','guzolandia'),
('3519006','Herculândia','SP','SE','herculandia'),
('3519055','Holambra','SP','SE','holambra'),
('3519071','Hortolândia','SP','SE','hortolandia'),
('3519105','Iacanga','SP','SE','iacanga'),
('3519204','Iacri','SP','SE','iacri'),
('3519253','Iaras','SP','SE','iaras'),
('3519303','Ibaté','SP','SE','ibate'),
('3519402','Ibirá','SP','SE','ibira'),
('3519501','Ibirarema','SP','SE','ibirarema'),
('3519600','Ibitinga','SP','SE','ibitinga'),
('3519709','Ibiúna','SP','SE','ibiuna'),
('3519808','Icém','SP','SE','icem'),
('3519907','Iepê','SP','SE','iepe'),
('3520004','Igaraçu do Tietê','SP','SE','igaracu do tiete'),
('3520103','Igarapava','SP','SE','igarapava'),
('3520202','Igaratá','SP','SE','igarata'),
('3520301','Iguape','SP','SE','iguape'),
('3520400','Ilhabela','SP','SE','ilhabela'),
('3520426','Ilha Comprida','SP','SE','ilha comprida'),
('3520442','Ilha Solteira','SP','SE','ilha solteira'),
('3520509','Indaiatuba','SP','SE','indaiatuba'),
('3520608','Indiana','SP','SE','indiana'),
('3520707','Indiaporã','SP','SE','indiapora'),
('3520806','Inúbia Paulista','SP','SE','inubia paulista'),
('3520905','Ipaussu','SP','SE','ipaussu'),
('3521002','Iperó','SP','SE','ipero'),
('3521101','Ipeúna','SP','SE','ipeuna'),
('3521150','Ipiguá','SP','SE','ipigua'),
('3521200','Iporanga','SP','SE','iporanga'),
('3521309','Ipuã','SP','SE','ipua'),
('3521408','Iracemápolis','SP','SE','iracemapolis'),
('3521507','Irapuã','SP','SE','irapua'),
('3521606','Irapuru','SP','SE','irapuru'),
('3521705','Itaberá','SP','SE','itabera'),
('3521804','Itaí','SP','SE','itai'),
('3521903','Itajobi','SP','SE','itajobi'),
('3522000','Itaju','SP','SE','itaju'),
('3522109','Itanhaém','SP','SE','itanhaem'),
('3522158','Itaoca','SP','SE','itaoca'),
('3522208','Itapecerica da Serra','SP','SE','itapecerica da serra'),
('3522307','Itapetininga','SP','SE','itapetininga'),
('3522406','Itapeva','SP','SE','itapeva'),
('3522505','Itapevi','SP','SE','itapevi'),
('3522604','Itapira','SP','SE','itapira'),
('3522653','Itapirapuã Paulista','SP','SE','itapirapua paulista'),
('3522703','Itápolis','SP','SE','itapolis'),
('3522802','Itaporanga','SP','SE','itaporanga'),
('3522901','Itapuí','SP','SE','itapui'),
('3523008','Itapura','SP','SE','itapura'),
('3523107','Itaquaquecetuba','SP','SE','itaquaquecetuba'),
('3523206','Itararé','SP','SE','itarare'),
('3523305','Itariri','SP','SE','itariri'),
('3523404','Itatiba','SP','SE','itatiba'),
('3523503','Itatinga','SP','SE','itatinga'),
('3523602','Itirapina','SP','SE','itirapina'),
('3523701','Itirapuã','SP','SE','itirapua'),
('3523800','Itobi','SP','SE','itobi'),
('3523909','Itu','SP','SE','itu'),
('3524006','Itupeva','SP','SE','itupeva'),
('3524105','Ituverava','SP','SE','ituverava'),
('3524204','Jaborandi','SP','SE','jaborandi'),
('3524303','Jaboticabal','SP','SE','jaboticabal'),
('3524402','Jacareí','SP','SE','jacarei'),
('3524501','Jaci','SP','SE','jaci'),
('3524600','Jacupiranga','SP','SE','jacupiranga'),
('3524709','Jaguariúna','SP','SE','jaguariuna'),
('3524808','Jales','SP','SE','jales'),
('3524907','Jambeiro','SP','SE','jambeiro'),
('3525003','Jandira','SP','SE','jandira'),
('3525102','Jardinópolis','SP','SE','jardinopolis'),
('3525201','Jarinu','SP','SE','jarinu'),
('3525300','Jaú','SP','SE','jau'),
('3525409','Jeriquara','SP','SE','jeriquara'),
('3525508','Joanópolis','SP','SE','joanopolis'),
('3525607','João Ramalho','SP','SE','joao ramalho'),
('3525706','José Bonifácio','SP','SE','jose bonifacio'),
('3525805','Júlio Mesquita','SP','SE','julio mesquita'),
('3525854','Jumirim','SP','SE','jumirim'),
('3525904','Jundiaí','SP','SE','jundiai'),
('3526001','Junqueirópolis','SP','SE','junqueiropolis'),
('3526100','Juquiá','SP','SE','juquia'),
('3526209','Juquitiba','SP','SE','juquitiba'),
('3526308','Lagoinha','SP','SE','lagoinha'),
('3526407','Laranjal Paulista','SP','SE','laranjal paulista'),
('3526506','Lavínia','SP','SE','lavinia'),
('3526605','Lavrinhas','SP','SE','lavrinhas'),
('3526704','Leme','SP','SE','leme'),
('3526803','Lençóis Paulista','SP','SE','lencois paulista'),
('3526902','Limeira','SP','SE','limeira'),
('3527009','Lindóia','SP','SE','lindoia'),
('3527108','Lins','SP','SE','lins'),
('3527207','Lorena','SP','SE','lorena'),
('3527256','Lourdes','SP','SE','lourdes'),
('3527306','Louveira','SP','SE','louveira'),
('3527405','Lucélia','SP','SE','lucelia'),
('3527504','Lucianópolis','SP','SE','lucianopolis'),
('3527603','Luís Antônio','SP','SE','luis antonio'),
('3527702','Luiziânia','SP','SE','luiziania'),
('3527801','Lupércio','SP','SE','lupercio'),
('3527900','Lutécia','SP','SE','lutecia'),
('3528007','Macatuba','SP','SE','macatuba'),
('3528106','Macaubal','SP','SE','macaubal'),
('3528205','Macedônia','SP','SE','macedonia'),
('3528304','Magda','SP','SE','magda'),
('3528403','Mairinque','SP','SE','mairinque'),
('3528502','Mairiporã','SP','SE','mairipora'),
('3528601','Manduri','SP','SE','manduri'),
('3528700','Marabá Paulista','SP','SE','maraba paulista'),
('3528809','Maracaí','SP','SE','maracai'),
('3528858','Marapoama','SP','SE','marapoama'),
('3528908','Mariápolis','SP','SE','mariapolis'),
('3529005','Marília','SP','SE','marilia'),
('3529104','Marinópolis','SP','SE','marinopolis'),
('3529203','Martinópolis','SP','SE','martinopolis'),
('3529302','Matão','SP','SE','matao'),
('3529401','Mauá','SP','SE','maua'),
('3529500','Mendonça','SP','SE','mendonca'),
('3529609','Meridiano','SP','SE','meridiano'),
('3529658','Mesópolis','SP','SE','mesopolis'),
('3529708','Miguelópolis','SP','SE','miguelopolis'),
('3529807','Mineiros do Tietê','SP','SE','mineiros do tiete'),
('3529906','Miracatu','SP','SE','miracatu'),
('3530003','Mira Estrela','SP','SE','mira estrela'),
('3530102','Mirandópolis','SP','SE','mirandopolis'),
('3530201','Mirante do Paranapanema','SP','SE','mirante do paranapanema'),
('3530300','Mirassol','SP','SE','mirassol'),
('3530409','Mirassolândia','SP','SE','mirassolandia'),
('3530508','Mococa','SP','SE','mococa'),
('3530607','Mogi das Cruzes','SP','SE','mogi das cruzes'),
('3530706','Mogi Guaçu','SP','SE','mogi guacu'),
('3530805','Mogi Mirim','SP','SE','mogi mirim'),
('3530904','Mombuca','SP','SE','mombuca'),
('3531001','Monções','SP','SE','moncoes'),
('3531100','Mongaguá','SP','SE','mongagua'),
('3531209','Monte Alegre do Sul','SP','SE','monte alegre do sul'),
('3531308','Monte Alto','SP','SE','monte alto'),
('3531407','Monte Aprazível','SP','SE','monte aprazivel'),
('3531506','Monte Azul Paulista','SP','SE','monte azul paulista'),
('3531605','Monte Castelo','SP','SE','monte castelo'),
('3531704','Monteiro Lobato','SP','SE','monteiro lobato'),
('3531803','Monte Mor','SP','SE','monte mor'),
('3531902','Morro Agudo','SP','SE','morro agudo'),
('3532009','Morungaba','SP','SE','morungaba'),
('3532058','Motuca','SP','SE','motuca'),
('3532108','Murutinga do Sul','SP','SE','murutinga do sul'),
('3532157','Nantes','SP','SE','nantes'),
('3532207','Narandiba','SP','SE','narandiba'),
('3532306','Natividade da Serra','SP','SE','natividade da serra'),
('3532405','Nazaré Paulista','SP','SE','nazare paulista'),
('3532504','Neves Paulista','SP','SE','neves paulista'),
('3532603','Nhandeara','SP','SE','nhandeara'),
('3532702','Nipoã','SP','SE','nipoa'),
('3532801','Nova Aliança','SP','SE','nova alianca'),
('3532827','Nova Campina','SP','SE','nova campina'),
('3532843','Nova Canaã Paulista','SP','SE','nova canaa paulista'),
('3532868','Nova Castilho','SP','SE','nova castilho'),
('3532900','Nova Europa','SP','SE','nova europa'),
('3533007','Nova Granada','SP','SE','nova granada'),
('3533106','Nova Guataporanga','SP','SE','nova guataporanga'),
('3533205','Nova Independência','SP','SE','nova independencia'),
('3533254','Novais','SP','SE','novais'),
('3533304','Nova Luzitânia','SP','SE','nova luzitania'),
('3533403','Nova Odessa','SP','SE','nova odessa'),
('3533502','Novo Horizonte','SP','SE','novo horizonte'),
('3533601','Nuporanga','SP','SE','nuporanga'),
('3533700','Ocauçu','SP','SE','ocaucu'),
('3533809','Óleo','SP','SE','oleo'),
('3533908','Olímpia','SP','SE','olimpia'),
('3534005','Onda Verde','SP','SE','onda verde'),
('3534104','Oriente','SP','SE','oriente'),
('3534203','Orindiúva','SP','SE','orindiuva'),
('3534302','Orlândia','SP','SE','orlandia'),
('3534401','Osasco','SP','SE','osasco'),
('3534500','Oscar Bressane','SP','SE','oscar bressane'),
('3534609','Osvaldo Cruz','SP','SE','osvaldo cruz'),
('3534708','Ourinhos','SP','SE','ourinhos'),
('3534757','Ouroeste','SP','SE','ouroeste'),
('3534807','Ouro Verde','SP','SE','ouro verde'),
('3534906','Pacaembu','SP','SE','pacaembu'),
('3535002','Palestina','SP','SE','palestina'),
('3535101','Palmares Paulista','SP','SE','palmares paulista'),
('3535200','Palmeira d''Oeste','SP','SE','palmeira d oeste'),
('3535309','Palmital','SP','SE','palmital'),
('3535408','Panorama','SP','SE','panorama'),
('3535507','Paraguaçu Paulista','SP','SE','paraguacu paulista'),
('3535606','Paraibuna','SP','SE','paraibuna'),
('3535705','Paraíso','SP','SE','paraiso'),
('3535804','Paranapanema','SP','SE','paranapanema'),
('3535903','Paranapuã','SP','SE','paranapua'),
('3536000','Parapuã','SP','SE','parapua'),
('3536109','Pardinho','SP','SE','pardinho'),
('3536208','Pariquera-Açu','SP','SE','pariquera acu'),
('3536257','Parisi','SP','SE','parisi'),
('3536307','Patrocínio Paulista','SP','SE','patrocinio paulista'),
('3536406','Paulicéia','SP','SE','pauliceia'),
('3536505','Paulínia','SP','SE','paulinia'),
('3536570','Paulistânia','SP','SE','paulistania'),
('3536604','Paulo de Faria','SP','SE','paulo de faria'),
('3536703','Pederneiras','SP','SE','pederneiras'),
('3536802','Pedra Bela','SP','SE','pedra bela'),
('3536901','Pedranópolis','SP','SE','pedranopolis'),
('3537008','Pedregulho','SP','SE','pedregulho'),
('3537107','Pedreira','SP','SE','pedreira'),
('3537156','Pedrinhas Paulista','SP','SE','pedrinhas paulista'),
('3537206','Pedro de Toledo','SP','SE','pedro de toledo'),
('3537305','Penápolis','SP','SE','penapolis'),
('3537404','Pereira Barreto','SP','SE','pereira barreto'),
('3537503','Pereiras','SP','SE','pereiras'),
('3537602','Peruíbe','SP','SE','peruibe'),
('3537701','Piacatu','SP','SE','piacatu'),
('3537800','Piedade','SP','SE','piedade'),
('3537909','Pilar do Sul','SP','SE','pilar do sul'),
('3538006','Pindamonhangaba','SP','SE','pindamonhangaba'),
('3538105','Pindorama','SP','SE','pindorama'),
('3538204','Pinhalzinho','SP','SE','pinhalzinho'),
('3538303','Piquerobi','SP','SE','piquerobi'),
('3538501','Piquete','SP','SE','piquete'),
('3538600','Piracaia','SP','SE','piracaia'),
('3538709','Piracicaba','SP','SE','piracicaba'),
('3538808','Piraju','SP','SE','piraju'),
('3538907','Pirajuí','SP','SE','pirajui'),
('3539004','Pirangi','SP','SE','pirangi'),
('3539103','Pirapora do Bom Jesus','SP','SE','pirapora do bom jesus'),
('3539202','Pirapozinho','SP','SE','pirapozinho'),
('3539301','Pirassununga','SP','SE','pirassununga'),
('3539400','Piratininga','SP','SE','piratininga'),
('3539509','Pitangueiras','SP','SE','pitangueiras'),
('3539608','Planalto','SP','SE','planalto'),
('3539707','Platina','SP','SE','platina'),
('3539806','Poá','SP','SE','poa'),
('3539905','Poloni','SP','SE','poloni'),
('3540002','Pompéia','SP','SE','pompeia'),
('3540101','Pongaí','SP','SE','pongai'),
('3540200','Pontal','SP','SE','pontal'),
('3540259','Pontalinda','SP','SE','pontalinda'),
('3540309','Pontes Gestal','SP','SE','pontes gestal'),
('3540408','Populina','SP','SE','populina'),
('3540507','Porangaba','SP','SE','porangaba'),
('3540606','Porto Feliz','SP','SE','porto feliz'),
('3540705','Porto Ferreira','SP','SE','porto ferreira'),
('3540754','Potim','SP','SE','potim'),
('3540804','Potirendaba','SP','SE','potirendaba'),
('3540853','Pracinha','SP','SE','pracinha'),
('3540903','Pradópolis','SP','SE','pradopolis'),
('3541000','Praia Grande','SP','SE','praia grande'),
('3541059','Pratânia','SP','SE','pratania'),
('3541109','Presidente Alves','SP','SE','presidente alves'),
('3541208','Presidente Bernardes','SP','SE','presidente bernardes'),
('3541307','Presidente Epitácio','SP','SE','presidente epitacio'),
('3541406','Presidente Prudente','SP','SE','presidente prudente'),
('3541505','Presidente Venceslau','SP','SE','presidente venceslau'),
('3541604','Promissão','SP','SE','promissao'),
('3541653','Quadra','SP','SE','quadra'),
('3541703','Quatá','SP','SE','quata'),
('3541802','Queiroz','SP','SE','queiroz'),
('3541901','Queluz','SP','SE','queluz'),
('3542008','Quintana','SP','SE','quintana'),
('3542107','Rafard','SP','SE','rafard'),
('3542206','Rancharia','SP','SE','rancharia'),
('3542305','Redenção da Serra','SP','SE','redencao da serra'),
('3542404','Regente Feijó','SP','SE','regente feijo'),
('3542503','Reginópolis','SP','SE','reginopolis'),
('3542602','Registro','SP','SE','registro'),
('3542701','Restinga','SP','SE','restinga'),
('3542800','Ribeira','SP','SE','ribeira'),
('3542909','Ribeirão Bonito','SP','SE','ribeirao bonito'),
('3543006','Ribeirão Branco','SP','SE','ribeirao branco'),
('3543105','Ribeirão Corrente','SP','SE','ribeirao corrente'),
('3543204','Ribeirão do Sul','SP','SE','ribeirao do sul'),
('3543238','Ribeirão dos Índios','SP','SE','ribeirao dos indios'),
('3543253','Ribeirão Grande','SP','SE','ribeirao grande'),
('3543303','Ribeirão Pires','SP','SE','ribeirao pires'),
('3543402','Ribeirão Preto','SP','SE','ribeirao preto'),
('3543501','Riversul','SP','SE','riversul'),
('3543600','Rifaina','SP','SE','rifaina'),
('3543709','Rincão','SP','SE','rincao'),
('3543808','Rinópolis','SP','SE','rinopolis'),
('3543907','Rio Claro','SP','SE','rio claro'),
('3544004','Rio das Pedras','SP','SE','rio das pedras'),
('3544103','Rio Grande da Serra','SP','SE','rio grande da serra'),
('3544202','Riolândia','SP','SE','riolandia'),
('3544251','Rosana','SP','SE','rosana'),
('3544301','Roseira','SP','SE','roseira'),
('3544400','Rubiácea','SP','SE','rubiacea'),
('3544509','Rubinéia','SP','SE','rubineia'),
('3544608','Sabino','SP','SE','sabino'),
('3544707','Sagres','SP','SE','sagres'),
('3544806','Sales','SP','SE','sales'),
('3544905','Sales Oliveira','SP','SE','sales oliveira'),
('3545001','Salesópolis','SP','SE','salesopolis'),
('3545100','Salmourão','SP','SE','salmourao'),
('3545159','Saltinho','SP','SE','saltinho'),
('3545209','Salto','SP','SE','salto'),
('3545308','Salto de Pirapora','SP','SE','salto de pirapora'),
('3545407','Salto Grande','SP','SE','salto grande'),
('3545506','Sandovalina','SP','SE','sandovalina'),
('3545605','Santa Adélia','SP','SE','santa adelia'),
('3545704','Santa Albertina','SP','SE','santa albertina'),
('3545803','Santa Bárbara d''Oeste','SP','SE','santa barbara d oeste'),
('3546009','Santa Branca','SP','SE','santa branca'),
('3546108','Santa Clara d''Oeste','SP','SE','santa clara d oeste'),
('3546207','Santa Cruz da Conceição','SP','SE','santa cruz da conceicao'),
('3546256','Santa Cruz da Esperança','SP','SE','santa cruz da esperanca'),
('3546306','Santa Cruz das Palmeiras','SP','SE','santa cruz das palmeiras'),
('3546405','Santa Cruz do Rio Pardo','SP','SE','santa cruz do rio pardo'),
('3546504','Santa Ernestina','SP','SE','santa ernestina'),
('3546603','Santa Fé do Sul','SP','SE','santa fe do sul'),
('3546702','Santa Gertrudes','SP','SE','santa gertrudes'),
('3546801','Santa Isabel','SP','SE','santa isabel'),
('3546900','Santa Lúcia','SP','SE','santa lucia'),
('3547007','Santa Maria da Serra','SP','SE','santa maria da serra'),
('3547106','Santa Mercedes','SP','SE','santa mercedes'),
('3547205','Santana da Ponte Pensa','SP','SE','santana da ponte pensa'),
('3547304','Santana de Parnaíba','SP','SE','santana de parnaiba'),
('3547403','Santa Rita d''Oeste','SP','SE','santa rita d oeste'),
('3547502','Santa Rita do Passa Quatro','SP','SE','santa rita do passa quatro'),
('3547601','Santa Rosa de Viterbo','SP','SE','santa rosa de viterbo'),
('3547650','Santa Salete','SP','SE','santa salete'),
('3547700','Santo Anastácio','SP','SE','santo anastacio'),
('3547809','Santo André','SP','SE','santo andre'),
('3547908','Santo Antônio da Alegria','SP','SE','santo antonio da alegria'),
('3548005','Santo Antônio de Posse','SP','SE','santo antonio de posse'),
('3548054','Santo Antônio do Aracanguá','SP','SE','santo antonio do aracangua'),
('3548104','Santo Antônio do Jardim','SP','SE','santo antonio do jardim'),
('3548203','Santo Antônio do Pinhal','SP','SE','santo antonio do pinhal'),
('3548302','Santo Expedito','SP','SE','santo expedito'),
('3548401','Santópolis do Aguapeí','SP','SE','santopolis do aguapei'),
('3548500','Santos','SP','SE','santos'),
('3548609','São Bento do Sapucaí','SP','SE','sao bento do sapucai'),
('3548708','São Bernardo do Campo','SP','SE','sao bernardo do campo'),
('3548807','São Caetano do Sul','SP','SE','sao caetano do sul'),
('3548906','São Carlos','SP','SE','sao carlos'),
('3549003','São Francisco','SP','SE','sao francisco'),
('3549102','São João da Boa Vista','SP','SE','sao joao da boa vista'),
('3549201','São João das Duas Pontes','SP','SE','sao joao das duas pontes'),
('3549250','São João de Iracema','SP','SE','sao joao de iracema'),
('3549300','São João do Pau d''Alho','SP','SE','sao joao do pau d alho'),
('3549409','São Joaquim da Barra','SP','SE','sao joaquim da barra'),
('3549508','São José da Bela Vista','SP','SE','sao jose da bela vista'),
('3549607','São José do Barreiro','SP','SE','sao jose do barreiro'),
('3549706','São José do Rio Pardo','SP','SE','sao jose do rio pardo'),
('3549805','São José do Rio Preto','SP','SE','sao jose do rio preto'),
('3549904','São José dos Campos','SP','SE','sao jose dos campos'),
('3549953','São Lourenço da Serra','SP','SE','sao lourenco da serra'),
('3550001','São Luiz do Paraitinga','SP','SE','sao luiz do paraitinga'),
('3550100','São Manuel','SP','SE','sao manuel'),
('3550209','São Miguel Arcanjo','SP','SE','sao miguel arcanjo'),
('3550308','São Paulo','SP','SE','sao paulo'),
('3550407','São Pedro','SP','SE','sao pedro'),
('3550506','São Pedro do Turvo','SP','SE','sao pedro do turvo'),
('3550605','São Roque','SP','SE','sao roque'),
('3550704','São Sebastião','SP','SE','sao sebastiao'),
('3550803','São Sebastião da Grama','SP','SE','sao sebastiao da grama'),
('3550902','São Simão','SP','SE','sao simao'),
('3551009','São Vicente','SP','SE','sao vicente'),
('3551108','Sarapuí','SP','SE','sarapui'),
('3551207','Sarutaiá','SP','SE','sarutaia'),
('3551306','Sebastianópolis do Sul','SP','SE','sebastianopolis do sul'),
('3551405','Serra Azul','SP','SE','serra azul'),
('3551504','Serrana','SP','SE','serrana'),
('3551603','Serra Negra','SP','SE','serra negra'),
('3551702','Sertãozinho','SP','SE','sertaozinho'),
('3551801','Sete Barras','SP','SE','sete barras'),
('3551900','Severínia','SP','SE','severinia'),
('3552007','Silveiras','SP','SE','silveiras'),
('3552106','Socorro','SP','SE','socorro'),
('3552205','Sorocaba','SP','SE','sorocaba'),
('3552304','Sud Mennucci','SP','SE','sud mennucci'),
('3552403','Sumaré','SP','SE','sumare'),
('3552502','Suzano','SP','SE','suzano'),
('3552551','Suzanápolis','SP','SE','suzanapolis'),
('3552601','Tabapuã','SP','SE','tabapua'),
('3552700','Tabatinga','SP','SE','tabatinga'),
('3552809','Taboão da Serra','SP','SE','taboao da serra'),
('3552908','Taciba','SP','SE','taciba'),
('3553005','Taguaí','SP','SE','taguai'),
('3553104','Taiaçu','SP','SE','taiacu'),
('3553203','Taiúva','SP','SE','taiuva'),
('3553302','Tambaú','SP','SE','tambau'),
('3553401','Tanabi','SP','SE','tanabi'),
('3553500','Tapiraí','SP','SE','tapirai'),
('3553609','Tapiratiba','SP','SE','tapiratiba'),
('3553658','Taquaral','SP','SE','taquaral'),
('3553708','Taquaritinga','SP','SE','taquaritinga'),
('3553807','Taquarituba','SP','SE','taquarituba'),
('3553856','Taquarivaí','SP','SE','taquarivai'),
('3553906','Tarabai','SP','SE','tarabai'),
('3553955','Tarumã','SP','SE','taruma'),
('3554003','Tatuí','SP','SE','tatui'),
('3554102','Taubaté','SP','SE','taubate'),
('3554201','Tejupá','SP','SE','tejupa'),
('3554300','Teodoro Sampaio','SP','SE','teodoro sampaio'),
('3554409','Terra Roxa','SP','SE','terra roxa'),
('3554508','Tietê','SP','SE','tiete'),
('3554607','Timburi','SP','SE','timburi'),
('3554656','Torre de Pedra','SP','SE','torre de pedra'),
('3554706','Torrinha','SP','SE','torrinha'),
('3554755','Trabiju','SP','SE','trabiju'),
('3554805','Tremembé','SP','SE','tremembe'),
('3554904','Três Fronteiras','SP','SE','tres fronteiras'),
('3554953','Tuiuti','SP','SE','tuiuti'),
('3555000','Tupã','SP','SE','tupa'),
('3555109','Tupi Paulista','SP','SE','tupi paulista'),
('3555208','Turiúba','SP','SE','turiuba'),
('3555307','Turmalina','SP','SE','turmalina'),
('3555356','Ubarana','SP','SE','ubarana'),
('3555406','Ubatuba','SP','SE','ubatuba'),
('3555505','Ubirajara','SP','SE','ubirajara'),
('3555604','Uchoa','SP','SE','uchoa'),
('3555703','União Paulista','SP','SE','uniao paulista'),
('3555802','Urânia','SP','SE','urania'),
('3555901','Uru','SP','SE','uru'),
('3556008','Urupês','SP','SE','urupes'),
('3556107','Valentim Gentil','SP','SE','valentim gentil'),
('3556206','Valinhos','SP','SE','valinhos'),
('3556305','Valparaíso','SP','SE','valparaiso'),
('3556354','Vargem','SP','SE','vargem'),
('3556404','Vargem Grande do Sul','SP','SE','vargem grande do sul'),
('3556453','Vargem Grande Paulista','SP','SE','vargem grande paulista'),
('3556503','Várzea Paulista','SP','SE','varzea paulista'),
('3556602','Vera Cruz','SP','SE','vera cruz'),
('3556701','Vinhedo','SP','SE','vinhedo'),
('3556800','Viradouro','SP','SE','viradouro'),
('3556909','Vista Alegre do Alto','SP','SE','vista alegre do alto'),
('3556958','Vitória Brasil','SP','SE','vitoria brasil'),
('3557006','Votorantim','SP','SE','votorantim'),
('3557105','Votuporanga','SP','SE','votuporanga'),
('3557154','Zacarias','SP','SE','zacarias'),
('3557204','Chavantes','SP','SE','chavantes'),
('3557303','Estiva Gerbi','SP','SE','estiva gerbi'),
('4100103','Abatiá','PR','S','abatia'),
('4100202','Adrianópolis','PR','S','adrianopolis'),
('4100301','Agudos do Sul','PR','S','agudos do sul'),
('4100400','Almirante Tamandaré','PR','S','almirante tamandare'),
('4100459','Altamira do Paraná','PR','S','altamira do parana'),
('4100509','Altônia','PR','S','altonia'),
('4100608','Alto Paraná','PR','S','alto parana'),
('4100707','Alto Piquiri','PR','S','alto piquiri'),
('4100806','Alvorada do Sul','PR','S','alvorada do sul'),
('4100905','Amaporã','PR','S','amapora'),
('4101002','Ampére','PR','S','ampere'),
('4101051','Anahy','PR','S','anahy'),
('4101101','Andirá','PR','S','andira'),
('4101150','Ângulo','PR','S','angulo'),
('4101200','Antonina','PR','S','antonina'),
('4101309','Antônio Olinto','PR','S','antonio olinto'),
('4101408','Apucarana','PR','S','apucarana'),
('4101507','Arapongas','PR','S','arapongas'),
('4101606','Arapoti','PR','S','arapoti'),
('4101655','Arapuã','PR','S','arapua'),
('4101705','Araruna','PR','S','araruna'),
('4101804','Araucária','PR','S','araucaria'),
('4101853','Ariranha do Ivaí','PR','S','ariranha do ivai'),
('4101903','Assaí','PR','S','assai'),
('4102000','Assis Chateaubriand','PR','S','assis chateaubriand'),
('4102109','Astorga','PR','S','astorga'),
('4102208','Atalaia','PR','S','atalaia'),
('4102307','Balsa Nova','PR','S','balsa nova'),
('4102406','Bandeirantes','PR','S','bandeirantes'),
('4102505','Barbosa Ferraz','PR','S','barbosa ferraz'),
('4102604','Barracão','PR','S','barracao'),
('4102703','Barra do Jacaré','PR','S','barra do jacare'),
('4102752','Bela Vista da Caroba','PR','S','bela vista da caroba'),
('4102802','Bela Vista do Paraíso','PR','S','bela vista do paraiso'),
('4102901','Bituruna','PR','S','bituruna'),
('4103008','Boa Esperança','PR','S','boa esperanca'),
('4103024','Boa Esperança do Iguaçu','PR','S','boa esperanca do iguacu'),
('4103040','Boa Ventura de São Roque','PR','S','boa ventura de sao roque'),
('4103057','Boa Vista da Aparecida','PR','S','boa vista da aparecida'),
('4103107','Bocaiúva do Sul','PR','S','bocaiuva do sul'),
('4103156','Bom Jesus do Sul','PR','S','bom jesus do sul'),
('4103206','Bom Sucesso','PR','S','bom sucesso'),
('4103222','Bom Sucesso do Sul','PR','S','bom sucesso do sul'),
('4103305','Borrazópolis','PR','S','borrazopolis'),
('4103354','Braganey','PR','S','braganey'),
('4103370','Brasilândia do Sul','PR','S','brasilandia do sul'),
('4103404','Cafeara','PR','S','cafeara'),
('4103453','Cafelândia','PR','S','cafelandia'),
('4103479','Cafezal do Sul','PR','S','cafezal do sul'),
('4103503','Califórnia','PR','S','california'),
('4103602','Cambará','PR','S','cambara'),
('4103701','Cambé','PR','S','cambe'),
('4103800','Cambira','PR','S','cambira'),
('4103909','Campina da Lagoa','PR','S','campina da lagoa'),
('4103958','Campina do Simão','PR','S','campina do simao'),
('4104006','Campina Grande do Sul','PR','S','campina grande do sul'),
('4104055','Campo Bonito','PR','S','campo bonito'),
('4104105','Campo do Tenente','PR','S','campo do tenente'),
('4104204','Campo Largo','PR','S','campo largo'),
('4104253','Campo Magro','PR','S','campo magro'),
('4104303','Campo Mourão','PR','S','campo mourao'),
('4104402','Cândido de Abreu','PR','S','candido de abreu'),
('4104428','Candói','PR','S','candoi'),
('4104451','Cantagalo','PR','S','cantagalo'),
('4104501','Capanema','PR','S','capanema'),
('4104600','Capitão Leônidas Marques','PR','S','capitao leonidas marques'),
('4104659','Carambeí','PR','S','carambei'),
('4104709','Carlópolis','PR','S','carlopolis'),
('4104808','Cascavel','PR','S','cascavel'),
('4104907','Castro','PR','S','castro'),
('4105003','Catanduvas','PR','S','catanduvas'),
('4105102','Centenário do Sul','PR','S','centenario do sul'),
('4105201','Cerro Azul','PR','S','cerro azul'),
('4105300','Céu Azul','PR','S','ceu azul'),
('4105409','Chopinzinho','PR','S','chopinzinho'),
('4105508','Cianorte','PR','S','cianorte'),
('4105607','Cidade Gaúcha','PR','S','cidade gaucha'),
('4105706','Clevelândia','PR','S','clevelandia'),
('4105805','Colombo','PR','S','colombo'),
('4105904','Colorado','PR','S','colorado'),
('4106001','Congonhinhas','PR','S','congonhinhas'),
('4106100','Conselheiro Mairinck','PR','S','conselheiro mairinck'),
('4106209','Contenda','PR','S','contenda'),
('4106308','Corbélia','PR','S','corbelia'),
('4106407','Cornélio Procópio','PR','S','cornelio procopio'),
('4106456','Coronel Domingos Soares','PR','S','coronel domingos soares'),
('4106506','Coronel Vivida','PR','S','coronel vivida'),
('4106555','Corumbataí do Sul','PR','S','corumbatai do sul'),
('4106571','Cruzeiro do Iguaçu','PR','S','cruzeiro do iguacu'),
('4106605','Cruzeiro do Oeste','PR','S','cruzeiro do oeste'),
('4106704','Cruzeiro do Sul','PR','S','cruzeiro do sul'),
('4106803','Cruz Machado','PR','S','cruz machado'),
('4106852','Cruzmaltina','PR','S','cruzmaltina'),
('4106902','Curitiba','PR','S','curitiba'),
('4107009','Curiúva','PR','S','curiuva'),
('4107108','Diamante do Norte','PR','S','diamante do norte'),
('4107124','Diamante do Sul','PR','S','diamante do sul'),
('4107157','Diamante D''Oeste','PR','S','diamante d oeste'),
('4107207','Dois Vizinhos','PR','S','dois vizinhos'),
('4107256','Douradina','PR','S','douradina'),
('4107306','Doutor Camargo','PR','S','doutor camargo'),
('4107405','Enéas Marques','PR','S','eneas marques'),
('4107504','Engenheiro Beltrão','PR','S','engenheiro beltrao'),
('4107520','Esperança Nova','PR','S','esperanca nova'),
('4107538','Entre Rios do Oeste','PR','S','entre rios do oeste'),
('4107546','Espigão Alto do Iguaçu','PR','S','espigao alto do iguacu'),
('4107553','Farol','PR','S','farol'),
('4107603','Faxinal','PR','S','faxinal'),
('4107652','Fazenda Rio Grande','PR','S','fazenda rio grande'),
('4107702','Fênix','PR','S','fenix'),
('4107736','Fernandes Pinheiro','PR','S','fernandes pinheiro'),
('4107751','Figueira','PR','S','figueira'),
('4107801','Floraí','PR','S','florai'),
('4107850','Flor da Serra do Sul','PR','S','flor da serra do sul'),
('4107900','Floresta','PR','S','floresta'),
('4108007','Florestópolis','PR','S','florestopolis'),
('4108106','Flórida','PR','S','florida'),
('4108205','Formosa do Oeste','PR','S','formosa do oeste'),
('4108304','Foz do Iguaçu','PR','S','foz do iguacu'),
('4108320','Francisco Alves','PR','S','francisco alves'),
('4108403','Francisco Beltrão','PR','S','francisco beltrao'),
('4108452','Foz do Jordão','PR','S','foz do jordao'),
('4108502','General Carneiro','PR','S','general carneiro'),
('4108551','Godoy Moreira','PR','S','godoy moreira'),
('4108601','Goioerê','PR','S','goioere'),
('4108650','Goioxim','PR','S','goioxim'),
('4108700','Grandes Rios','PR','S','grandes rios'),
('4108809','Guaíra','PR','S','guaira'),
('4108908','Guairaçá','PR','S','guairaca'),
('4108957','Guamiranga','PR','S','guamiranga'),
('4109005','Guapirama','PR','S','guapirama'),
('4109104','Guaporema','PR','S','guaporema'),
('4109203','Guaraci','PR','S','guaraci'),
('4109302','Guaraniaçu','PR','S','guaraniacu'),
('4109401','Guarapuava','PR','S','guarapuava'),
('4109500','Guaraqueçaba','PR','S','guaraquecaba'),
('4109609','Guaratuba','PR','S','guaratuba'),
('4109658','Honório Serpa','PR','S','honorio serpa'),
('4109708','Ibaiti','PR','S','ibaiti'),
('4109757','Ibema','PR','S','ibema'),
('4109807','Ibiporã','PR','S','ibipora'),
('4109906','Icaraíma','PR','S','icaraima'),
('4110003','Iguaraçu','PR','S','iguaracu'),
('4110052','Iguatu','PR','S','iguatu'),
('4110078','Imbaú','PR','S','imbau'),
('4110102','Imbituva','PR','S','imbituva'),
('4110201','Inácio Martins','PR','S','inacio martins'),
('4110300','Inajá','PR','S','inaja'),
('4110409','Indianópolis','PR','S','indianopolis'),
('4110508','Ipiranga','PR','S','ipiranga'),
('4110607','Iporã','PR','S','ipora'),
('4110656','Iracema do Oeste','PR','S','iracema do oeste'),
('4110706','Irati','PR','S','irati'),
('4110805','Iretama','PR','S','iretama'),
('4110904','Itaguajé','PR','S','itaguaje'),
('4110953','Itaipulândia','PR','S','itaipulandia'),
('4111001','Itambaracá','PR','S','itambaraca'),
('4111100','Itambé','PR','S','itambe'),
('4111209','Itapejara d''Oeste','PR','S','itapejara d oeste'),
('4111258','Itaperuçu','PR','S','itaperucu'),
('4111308','Itaúna do Sul','PR','S','itauna do sul'),
('4111407','Ivaí','PR','S','ivai'),
('4111506','Ivaiporã','PR','S','ivaipora'),
('4111555','Ivaté','PR','S','ivate'),
('4111605','Ivatuba','PR','S','ivatuba'),
('4111704','Jaboti','PR','S','jaboti'),
('4111803','Jacarezinho','PR','S','jacarezinho'),
('4111902','Jaguapitã','PR','S','jaguapita'),
('4112009','Jaguariaíva','PR','S','jaguariaiva'),
('4112108','Jandaia do Sul','PR','S','jandaia do sul'),
('4112207','Janiópolis','PR','S','janiopolis'),
('4112306','Japira','PR','S','japira'),
('4112405','Japurá','PR','S','japura'),
('4112504','Jardim Alegre','PR','S','jardim alegre'),
('4112603','Jardim Olinda','PR','S','jardim olinda'),
('4112702','Jataizinho','PR','S','jataizinho'),
('4112751','Jesuítas','PR','S','jesuitas'),
('4112801','Joaquim Távora','PR','S','joaquim tavora'),
('4112900','Jundiaí do Sul','PR','S','jundiai do sul'),
('4112959','Juranda','PR','S','juranda'),
('4113007','Jussara','PR','S','jussara'),
('4113106','Kaloré','PR','S','kalore'),
('4113205','Lapa','PR','S','lapa'),
('4113254','Laranjal','PR','S','laranjal'),
('4113304','Laranjeiras do Sul','PR','S','laranjeiras do sul'),
('4113403','Leópolis','PR','S','leopolis'),
('4113429','Lidianópolis','PR','S','lidianopolis'),
('4113452','Lindoeste','PR','S','lindoeste'),
('4113502','Loanda','PR','S','loanda'),
('4113601','Lobato','PR','S','lobato'),
('4113700','Londrina','PR','S','londrina'),
('4113734','Luiziana','PR','S','luiziana'),
('4113759','Lunardelli','PR','S','lunardelli'),
('4113809','Lupionópolis','PR','S','lupionopolis'),
('4113908','Mallet','PR','S','mallet'),
('4114005','Mamborê','PR','S','mambore'),
('4114104','Mandaguaçu','PR','S','mandaguacu'),
('4114203','Mandaguari','PR','S','mandaguari'),
('4114302','Mandirituba','PR','S','mandirituba'),
('4114351','Manfrinópolis','PR','S','manfrinopolis'),
('4114401','Mangueirinha','PR','S','mangueirinha'),
('4114500','Manoel Ribas','PR','S','manoel ribas'),
('4114609','Marechal Cândido Rondon','PR','S','marechal candido rondon'),
('4114708','Maria Helena','PR','S','maria helena'),
('4114807','Marialva','PR','S','marialva'),
('4114906','Marilândia do Sul','PR','S','marilandia do sul'),
('4115002','Marilena','PR','S','marilena'),
('4115101','Mariluz','PR','S','mariluz'),
('4115200','Maringá','PR','S','maringa'),
('4115309','Mariópolis','PR','S','mariopolis'),
('4115358','Maripá','PR','S','maripa'),
('4115408','Marmeleiro','PR','S','marmeleiro'),
('4115457','Marquinho','PR','S','marquinho'),
('4115507','Marumbi','PR','S','marumbi'),
('4115606','Matelândia','PR','S','matelandia'),
('4115705','Matinhos','PR','S','matinhos'),
('4115739','Mato Rico','PR','S','mato rico'),
('4115754','Mauá da Serra','PR','S','maua da serra'),
('4115804','Medianeira','PR','S','medianeira'),
('4115853','Mercedes','PR','S','mercedes'),
('4115903','Mirador','PR','S','mirador'),
('4116000','Miraselva','PR','S','miraselva'),
('4116059','Missal','PR','S','missal'),
('4116109','Moreira Sales','PR','S','moreira sales'),
('4116208','Morretes','PR','S','morretes'),
('4116307','Munhoz de Melo','PR','S','munhoz de melo'),
('4116406','Nossa Senhora das Graças','PR','S','nossa senhora das gracas'),
('4116505','Nova Aliança do Ivaí','PR','S','nova alianca do ivai'),
('4116604','Nova América da Colina','PR','S','nova america da colina'),
('4116703','Nova Aurora','PR','S','nova aurora'),
('4116802','Nova Cantu','PR','S','nova cantu'),
('4116901','Nova Esperança','PR','S','nova esperanca'),
('4116950','Nova Esperança do Sudoeste','PR','S','nova esperanca do sudoeste'),
('4117008','Nova Fátima','PR','S','nova fatima'),
('4117057','Nova Laranjeiras','PR','S','nova laranjeiras'),
('4117107','Nova Londrina','PR','S','nova londrina'),
('4117206','Nova Olímpia','PR','S','nova olimpia'),
('4117214','Nova Santa Bárbara','PR','S','nova santa barbara'),
('4117222','Nova Santa Rosa','PR','S','nova santa rosa'),
('4117255','Nova Prata do Iguaçu','PR','S','nova prata do iguacu'),
('4117271','Nova Tebas','PR','S','nova tebas'),
('4117297','Novo Itacolomi','PR','S','novo itacolomi'),
('4117305','Ortigueira','PR','S','ortigueira'),
('4117404','Ourizona','PR','S','ourizona'),
('4117453','Ouro Verde do Oeste','PR','S','ouro verde do oeste'),
('4117503','Paiçandu','PR','S','paicandu'),
('4117602','Palmas','PR','S','palmas'),
('4117701','Palmeira','PR','S','palmeira'),
('4117800','Palmital','PR','S','palmital'),
('4117909','Palotina','PR','S','palotina'),
('4118006','Paraíso do Norte','PR','S','paraiso do norte'),
('4118105','Paranacity','PR','S','paranacity'),
('4118204','Paranaguá','PR','S','paranagua'),
('4118303','Paranapoema','PR','S','paranapoema'),
('4118402','Paranavaí','PR','S','paranavai'),
('4118451','Pato Bragado','PR','S','pato bragado'),
('4118501','Pato Branco','PR','S','pato branco'),
('4118600','Paula Freitas','PR','S','paula freitas'),
('4118709','Paulo Frontin','PR','S','paulo frontin'),
('4118808','Peabiru','PR','S','peabiru'),
('4118857','Perobal','PR','S','perobal'),
('4118907','Pérola','PR','S','perola'),
('4119004','Pérola d''Oeste','PR','S','perola d oeste'),
('4119103','Piên','PR','S','pien'),
('4119152','Pinhais','PR','S','pinhais'),
('4119202','Pinhalão','PR','S','pinhalao'),
('4119251','Pinhal de São Bento','PR','S','pinhal de sao bento'),
('4119301','Pinhão','PR','S','pinhao'),
('4119400','Piraí do Sul','PR','S','pirai do sul'),
('4119509','Piraquara','PR','S','piraquara'),
('4119608','Pitanga','PR','S','pitanga'),
('4119657','Pitangueiras','PR','S','pitangueiras'),
('4119707','Planaltina do Paraná','PR','S','planaltina do parana'),
('4119806','Planalto','PR','S','planalto'),
('4119905','Ponta Grossa','PR','S','ponta grossa'),
('4119954','Pontal do Paraná','PR','S','pontal do parana'),
('4120002','Porecatu','PR','S','porecatu'),
('4120101','Porto Amazonas','PR','S','porto amazonas'),
('4120150','Porto Barreiro','PR','S','porto barreiro'),
('4120200','Porto Rico','PR','S','porto rico'),
('4120309','Porto Vitória','PR','S','porto vitoria'),
('4120333','Prado Ferreira','PR','S','prado ferreira'),
('4120358','Pranchita','PR','S','pranchita'),
('4120408','Presidente Castelo Branco','PR','S','presidente castelo branco'),
('4120507','Primeiro de Maio','PR','S','primeiro de maio'),
('4120606','Prudentópolis','PR','S','prudentopolis'),
('4120655','Quarto Centenário','PR','S','quarto centenario'),
('4120705','Quatiguá','PR','S','quatigua'),
('4120804','Quatro Barras','PR','S','quatro barras'),
('4120853','Quatro Pontes','PR','S','quatro pontes'),
('4120903','Quedas do Iguaçu','PR','S','quedas do iguacu'),
('4121000','Querência do Norte','PR','S','querencia do norte'),
('4121109','Quinta do Sol','PR','S','quinta do sol'),
('4121208','Quitandinha','PR','S','quitandinha'),
('4121257','Ramilândia','PR','S','ramilandia'),
('4121307','Rancho Alegre','PR','S','rancho alegre'),
('4121356','Rancho Alegre D''Oeste','PR','S','rancho alegre d oeste'),
('4121406','Realeza','PR','S','realeza'),
('4121505','Rebouças','PR','S','reboucas'),
('4121604','Renascença','PR','S','renascenca'),
('4121703','Reserva','PR','S','reserva'),
('4121752','Reserva do Iguaçu','PR','S','reserva do iguacu'),
('4121802','Ribeirão Claro','PR','S','ribeirao claro'),
('4121901','Ribeirão do Pinhal','PR','S','ribeirao do pinhal'),
('4122008','Rio Azul','PR','S','rio azul'),
('4122107','Rio Bom','PR','S','rio bom'),
('4122156','Rio Bonito do Iguaçu','PR','S','rio bonito do iguacu'),
('4122172','Rio Branco do Ivaí','PR','S','rio branco do ivai'),
('4122206','Rio Branco do Sul','PR','S','rio branco do sul'),
('4122305','Rio Negro','PR','S','rio negro'),
('4122404','Rolândia','PR','S','rolandia'),
('4122503','Roncador','PR','S','roncador'),
('4122602','Rondon','PR','S','rondon'),
('4122651','Rosário do Ivaí','PR','S','rosario do ivai'),
('4122701','Sabáudia','PR','S','sabaudia'),
('4122800','Salgado Filho','PR','S','salgado filho'),
('4122909','Salto do Itararé','PR','S','salto do itarare'),
('4123006','Salto do Lontra','PR','S','salto do lontra'),
('4123105','Santa Amélia','PR','S','santa amelia'),
('4123204','Santa Cecília do Pavão','PR','S','santa cecilia do pavao'),
('4123303','Santa Cruz de Monte Castelo','PR','S','santa cruz de monte castelo'),
('4123402','Santa Fé','PR','S','santa fe'),
('4123501','Santa Helena','PR','S','santa helena'),
('4123600','Santa Inês','PR','S','santa ines'),
('4123709','Santa Isabel do Ivaí','PR','S','santa isabel do ivai'),
('4123808','Santa Izabel do Oeste','PR','S','santa izabel do oeste'),
('4123824','Santa Lúcia','PR','S','santa lucia'),
('4123857','Santa Maria do Oeste','PR','S','santa maria do oeste'),
('4123907','Santa Mariana','PR','S','santa mariana'),
('4123956','Santa Mônica','PR','S','santa monica'),
('4124004','Santana do Itararé','PR','S','santana do itarare'),
('4124020','Santa Tereza do Oeste','PR','S','santa tereza do oeste'),
('4124053','Santa Terezinha de Itaipu','PR','S','santa terezinha de itaipu'),
('4124103','Santo Antônio da Platina','PR','S','santo antonio da platina'),
('4124202','Santo Antônio do Caiuá','PR','S','santo antonio do caiua'),
('4124301','Santo Antônio do Paraíso','PR','S','santo antonio do paraiso'),
('4124400','Santo Antônio do Sudoeste','PR','S','santo antonio do sudoeste'),
('4124509','Santo Inácio','PR','S','santo inacio'),
('4124608','São Carlos do Ivaí','PR','S','sao carlos do ivai'),
('4124707','São Jerônimo da Serra','PR','S','sao jeronimo da serra'),
('4124806','São João','PR','S','sao joao'),
('4124905','São João do Caiuá','PR','S','sao joao do caiua'),
('4125001','São João do Ivaí','PR','S','sao joao do ivai'),
('4125100','São João do Triunfo','PR','S','sao joao do triunfo'),
('4125209','São Jorge d''Oeste','PR','S','sao jorge d oeste'),
('4125308','São Jorge do Ivaí','PR','S','sao jorge do ivai'),
('4125357','São Jorge do Patrocínio','PR','S','sao jorge do patrocinio'),
('4125407','São José da Boa Vista','PR','S','sao jose da boa vista'),
('4125456','São José das Palmeiras','PR','S','sao jose das palmeiras'),
('4125506','São José dos Pinhais','PR','S','sao jose dos pinhais'),
('4125555','São Manoel do Paraná','PR','S','sao manoel do parana'),
('4125605','São Mateus do Sul','PR','S','sao mateus do sul'),
('4125704','São Miguel do Iguaçu','PR','S','sao miguel do iguacu'),
('4125753','São Pedro do Iguaçu','PR','S','sao pedro do iguacu'),
('4125803','São Pedro do Ivaí','PR','S','sao pedro do ivai'),
('4125902','São Pedro do Paraná','PR','S','sao pedro do parana'),
('4126009','São Sebastião da Amoreira','PR','S','sao sebastiao da amoreira'),
('4126108','São Tomé','PR','S','sao tome'),
('4126207','Sapopema','PR','S','sapopema'),
('4126256','Sarandi','PR','S','sarandi'),
('4126272','Saudade do Iguaçu','PR','S','saudade do iguacu'),
('4126306','Sengés','PR','S','senges'),
('4126355','Serranópolis do Iguaçu','PR','S','serranopolis do iguacu'),
('4126405','Sertaneja','PR','S','sertaneja'),
('4126504','Sertanópolis','PR','S','sertanopolis'),
('4126603','Siqueira Campos','PR','S','siqueira campos'),
('4126652','Sulina','PR','S','sulina'),
('4126678','Tamarana','PR','S','tamarana'),
('4126702','Tamboara','PR','S','tamboara'),
('4126801','Tapejara','PR','S','tapejara'),
('4126900','Tapira','PR','S','tapira'),
('4127007','Teixeira Soares','PR','S','teixeira soares'),
('4127106','Telêmaco Borba','PR','S','telemaco borba'),
('4127205','Terra Boa','PR','S','terra boa'),
('4127304','Terra Rica','PR','S','terra rica'),
('4127403','Terra Roxa','PR','S','terra roxa'),
('4127502','Tibagi','PR','S','tibagi'),
('4127601','Tijucas do Sul','PR','S','tijucas do sul'),
('4127700','Toledo','PR','S','toledo'),
('4127809','Tomazina','PR','S','tomazina'),
('4127858','Três Barras do Paraná','PR','S','tres barras do parana'),
('4127882','Tunas do Paraná','PR','S','tunas do parana'),
('4127908','Tuneiras do Oeste','PR','S','tuneiras do oeste'),
('4127957','Tupãssi','PR','S','tupassi'),
('4127965','Turvo','PR','S','turvo'),
('4128005','Ubiratã','PR','S','ubirata'),
('4128104','Umuarama','PR','S','umuarama'),
('4128203','União da Vitória','PR','S','uniao da vitoria'),
('4128302','Uniflor','PR','S','uniflor'),
('4128401','Uraí','PR','S','urai'),
('4128500','Wenceslau Braz','PR','S','wenceslau braz'),
('4128534','Ventania','PR','S','ventania'),
('4128559','Vera Cruz do Oeste','PR','S','vera cruz do oeste'),
('4128609','Verê','PR','S','vere'),
('4128625','Alto Paraíso','PR','S','alto paraiso'),
('4128633','Doutor Ulysses','PR','S','doutor ulysses'),
('4128658','Virmond','PR','S','virmond'),
('4128708','Vitorino','PR','S','vitorino'),
('4128807','Xambrê','PR','S','xambre'),
('4200051','Abdon Batista','SC','S','abdon batista'),
('4200101','Abelardo Luz','SC','S','abelardo luz'),
('4200200','Agrolândia','SC','S','agrolandia'),
('4200309','Agronômica','SC','S','agronomica'),
('4200408','Água Doce','SC','S','agua doce'),
('4200507','Águas de Chapecó','SC','S','aguas de chapeco'),
('4200556','Águas Frias','SC','S','aguas frias'),
('4200606','Águas Mornas','SC','S','aguas mornas'),
('4200705','Alfredo Wagner','SC','S','alfredo wagner'),
('4200754','Alto Bela Vista','SC','S','alto bela vista'),
('4200804','Anchieta','SC','S','anchieta'),
('4200903','Angelina','SC','S','angelina'),
('4201000','Anita Garibaldi','SC','S','anita garibaldi'),
('4201109','Anitápolis','SC','S','anitapolis'),
('4201208','Antônio Carlos','SC','S','antonio carlos'),
('4201257','Apiúna','SC','S','apiuna'),
('4201273','Arabutã','SC','S','arabuta'),
('4201307','Araquari','SC','S','araquari'),
('4201406','Araranguá','SC','S','ararangua'),
('4201505','Armazém','SC','S','armazem'),
('4201604','Arroio Trinta','SC','S','arroio trinta'),
('4201653','Arvoredo','SC','S','arvoredo'),
('4201703','Ascurra','SC','S','ascurra'),
('4201802','Atalanta','SC','S','atalanta'),
('4201901','Aurora','SC','S','aurora'),
('4201950','Balneário Arroio do Silva','SC','S','balneario arroio do silva'),
('4202008','Balneário Camboriú','SC','S','balneario camboriu'),
('4202057','Balneário Barra do Sul','SC','S','balneario barra do sul'),
('4202073','Balneário Gaivota','SC','S','balneario gaivota'),
('4202081','Bandeirante','SC','S','bandeirante'),
('4202099','Barra Bonita','SC','S','barra bonita'),
('4202107','Barra Velha','SC','S','barra velha'),
('4202131','Bela Vista do Toldo','SC','S','bela vista do toldo'),
('4202156','Belmonte','SC','S','belmonte'),
('4202206','Benedito Novo','SC','S','benedito novo'),
('4202305','Biguaçu','SC','S','biguacu'),
('4202404','Blumenau','SC','S','blumenau'),
('4202438','Bocaina do Sul','SC','S','bocaina do sul'),
('4202453','Bombinhas','SC','S','bombinhas'),
('4202503','Bom Jardim da Serra','SC','S','bom jardim da serra'),
('4202537','Bom Jesus','SC','S','bom jesus'),
('4202578','Bom Jesus do Oeste','SC','S','bom jesus do oeste'),
('4202602','Bom Retiro','SC','S','bom retiro'),
('4202701','Botuverá','SC','S','botuvera'),
('4202800','Braço do Norte','SC','S','braco do norte'),
('4202859','Braço do Trombudo','SC','S','braco do trombudo'),
('4202875','Brunópolis','SC','S','brunopolis'),
('4202909','Brusque','SC','S','brusque'),
('4203006','Caçador','SC','S','cacador'),
('4203105','Caibi','SC','S','caibi'),
('4203154','Calmon','SC','S','calmon'),
('4203204','Camboriú','SC','S','camboriu'),
('4203253','Capão Alto','SC','S','capao alto'),
('4203303','Campo Alegre','SC','S','campo alegre'),
('4203402','Campo Belo do Sul','SC','S','campo belo do sul'),
('4203501','Campo Erê','SC','S','campo ere'),
('4203600','Campos Novos','SC','S','campos novos'),
('4203709','Canelinha','SC','S','canelinha'),
('4203808','Canoinhas','SC','S','canoinhas'),
('4203907','Capinzal','SC','S','capinzal'),
('4203956','Capivari de Baixo','SC','S','capivari de baixo'),
('4204004','Catanduvas','SC','S','catanduvas'),
('4204103','Caxambu do Sul','SC','S','caxambu do sul'),
('4204152','Celso Ramos','SC','S','celso ramos'),
('4204178','Cerro Negro','SC','S','cerro negro'),
('4204194','Chapadão do Lageado','SC','S','chapadao do lageado'),
('4204202','Chapecó','SC','S','chapeco'),
('4204251','Cocal do Sul','SC','S','cocal do sul'),
('4204301','Concórdia','SC','S','concordia'),
('4204350','Cordilheira Alta','SC','S','cordilheira alta'),
('4204400','Coronel Freitas','SC','S','coronel freitas'),
('4204459','Coronel Martins','SC','S','coronel martins'),
('4204509','Corupá','SC','S','corupa'),
('4204558','Correia Pinto','SC','S','correia pinto'),
('4204608','Criciúma','SC','S','criciuma'),
('4204707','Cunha Porã','SC','S','cunha pora'),
('4204756','Cunhataí','SC','S','cunhatai'),
('4204806','Curitibanos','SC','S','curitibanos'),
('4204905','Descanso','SC','S','descanso'),
('4205001','Dionísio Cerqueira','SC','S','dionisio cerqueira'),
('4205100','Dona Emma','SC','S','dona emma'),
('4205159','Doutor Pedrinho','SC','S','doutor pedrinho'),
('4205175','Entre Rios','SC','S','entre rios'),
('4205191','Ermo','SC','S','ermo'),
('4205209','Erval Velho','SC','S','erval velho'),
('4205308','Faxinal dos Guedes','SC','S','faxinal dos guedes'),
('4205357','Flor do Sertão','SC','S','flor do sertao'),
('4205407','Florianópolis','SC','S','florianopolis'),
('4205431','Formosa do Sul','SC','S','formosa do sul'),
('4205456','Forquilhinha','SC','S','forquilhinha'),
('4205506','Fraiburgo','SC','S','fraiburgo'),
('4205555','Frei Rogério','SC','S','frei rogerio'),
('4205605','Galvão','SC','S','galvao'),
('4205704','Garopaba','SC','S','garopaba'),
('4205803','Garuva','SC','S','garuva'),
('4205902','Gaspar','SC','S','gaspar'),
('4206009','Governador Celso Ramos','SC','S','governador celso ramos'),
('4206108','Grão-Pará','SC','S','grao para'),
('4206207','Gravatal','SC','S','gravatal'),
('4206306','Guabiruba','SC','S','guabiruba'),
('4206405','Guaraciaba','SC','S','guaraciaba'),
('4206504','Guaramirim','SC','S','guaramirim'),
('4206603','Guarujá do Sul','SC','S','guaruja do sul'),
('4206652','Guatambú','SC','S','guatambu'),
('4206702','Herval d''Oeste','SC','S','herval d oeste'),
('4206751','Ibiam','SC','S','ibiam'),
('4206801','Ibicaré','SC','S','ibicare'),
('4206900','Ibirama','SC','S','ibirama'),
('4207007','Içara','SC','S','icara'),
('4207106','Ilhota','SC','S','ilhota'),
('4207205','Imaruí','SC','S','imarui'),
('4207304','Imbituba','SC','S','imbituba'),
('4207403','Imbuia','SC','S','imbuia'),
('4207502','Indaial','SC','S','indaial'),
('4207577','Iomerê','SC','S','iomere'),
('4207601','Ipira','SC','S','ipira'),
('4207650','Iporã do Oeste','SC','S','ipora do oeste'),
('4207684','Ipuaçu','SC','S','ipuacu'),
('4207700','Ipumirim','SC','S','ipumirim'),
('4207759','Iraceminha','SC','S','iraceminha'),
('4207809','Irani','SC','S','irani'),
('4207858','Irati','SC','S','irati'),
('4207908','Irineópolis','SC','S','irineopolis'),
('4208005','Itá','SC','S','ita'),
('4208104','Itaiópolis','SC','S','itaiopolis'),
('4208203','Itajaí','SC','S','itajai'),
('4208302','Itapema','SC','S','itapema'),
('4208401','Itapiranga','SC','S','itapiranga'),
('4208450','Itapoá','SC','S','itapoa'),
('4208500','Ituporanga','SC','S','ituporanga'),
('4208609','Jaborá','SC','S','jabora'),
('4208708','Jacinto Machado','SC','S','jacinto machado'),
('4208807','Jaguaruna','SC','S','jaguaruna'),
('4208906','Jaraguá do Sul','SC','S','jaragua do sul'),
('4208955','Jardinópolis','SC','S','jardinopolis'),
('4209003','Joaçaba','SC','S','joacaba'),
('4209102','Joinville','SC','S','joinville'),
('4209151','José Boiteux','SC','S','jose boiteux'),
('4209177','Jupiá','SC','S','jupia'),
('4209201','Lacerdópolis','SC','S','lacerdopolis'),
('4209300','Lages','SC','S','lages'),
('4209409','Laguna','SC','S','laguna'),
('4209458','Lajeado Grande','SC','S','lajeado grande'),
('4209508','Laurentino','SC','S','laurentino'),
('4209607','Lauro Müller','SC','S','lauro muller'),
('4209706','Lebon Régis','SC','S','lebon regis'),
('4209805','Leoberto Leal','SC','S','leoberto leal'),
('4209854','Lindóia do Sul','SC','S','lindoia do sul'),
('4209904','Lontras','SC','S','lontras'),
('4210001','Luiz Alves','SC','S','luiz alves'),
('4210035','Luzerna','SC','S','luzerna'),
('4210050','Macieira','SC','S','macieira'),
('4210100','Mafra','SC','S','mafra'),
('4210209','Major Gercino','SC','S','major gercino'),
('4210308','Major Vieira','SC','S','major vieira'),
('4210407','Maracajá','SC','S','maracaja'),
('4210506','Maravilha','SC','S','maravilha'),
('4210555','Marema','SC','S','marema'),
('4210605','Massaranduba','SC','S','massaranduba'),
('4210704','Matos Costa','SC','S','matos costa'),
('4210803','Meleiro','SC','S','meleiro'),
('4210852','Mirim Doce','SC','S','mirim doce'),
('4210902','Modelo','SC','S','modelo'),
('4211009','Mondaí','SC','S','mondai'),
('4211058','Monte Carlo','SC','S','monte carlo'),
('4211108','Monte Castelo','SC','S','monte castelo'),
('4211207','Morro da Fumaça','SC','S','morro da fumaca'),
('4211256','Morro Grande','SC','S','morro grande'),
('4211306','Navegantes','SC','S','navegantes'),
('4211405','Nova Erechim','SC','S','nova erechim'),
('4211454','Nova Itaberaba','SC','S','nova itaberaba'),
('4211504','Nova Trento','SC','S','nova trento'),
('4211603','Nova Veneza','SC','S','nova veneza'),
('4211652','Novo Horizonte','SC','S','novo horizonte'),
('4211702','Orleans','SC','S','orleans'),
('4211751','Otacílio Costa','SC','S','otacilio costa'),
('4211801','Ouro','SC','S','ouro'),
('4211850','Ouro Verde','SC','S','ouro verde'),
('4211876','Paial','SC','S','paial'),
('4211892','Painel','SC','S','painel'),
('4211900','Palhoça','SC','S','palhoca'),
('4212007','Palma Sola','SC','S','palma sola'),
('4212056','Palmeira','SC','S','palmeira'),
('4212106','Palmitos','SC','S','palmitos'),
('4212205','Papanduva','SC','S','papanduva'),
('4212239','Paraíso','SC','S','paraiso'),
('4212254','Passo de Torres','SC','S','passo de torres'),
('4212270','Passos Maia','SC','S','passos maia'),
('4212304','Paulo Lopes','SC','S','paulo lopes'),
('4212403','Pedras Grandes','SC','S','pedras grandes'),
('4212502','Penha','SC','S','penha'),
('4212601','Peritiba','SC','S','peritiba'),
('4212650','Pescaria Brava','SC','S','pescaria brava'),
('4212700','Petrolândia','SC','S','petrolandia'),
('4212809','Balneário Piçarras','SC','S','balneario picarras'),
('4212908','Pinhalzinho','SC','S','pinhalzinho'),
('4213005','Pinheiro Preto','SC','S','pinheiro preto'),
('4213104','Piratuba','SC','S','piratuba'),
('4213153','Planalto Alegre','SC','S','planalto alegre'),
('4213203','Pomerode','SC','S','pomerode'),
('4213302','Ponte Alta','SC','S','ponte alta'),
('4213351','Ponte Alta do Norte','SC','S','ponte alta do norte'),
('4213401','Ponte Serrada','SC','S','ponte serrada'),
('4213500','Porto Belo','SC','S','porto belo'),
('4213609','Porto União','SC','S','porto uniao'),
('4213708','Pouso Redondo','SC','S','pouso redondo'),
('4213807','Praia Grande','SC','S','praia grande'),
('4213906','Presidente Castello Branco','SC','S','presidente castello branco'),
('4214003','Presidente Getúlio','SC','S','presidente getulio'),
('4214102','Presidente Nereu','SC','S','presidente nereu'),
('4214151','Princesa','SC','S','princesa'),
('4214201','Quilombo','SC','S','quilombo'),
('4214300','Rancho Queimado','SC','S','rancho queimado'),
('4214409','Rio das Antas','SC','S','rio das antas'),
('4214508','Rio do Campo','SC','S','rio do campo'),
('4214607','Rio do Oeste','SC','S','rio do oeste'),
('4214706','Rio dos Cedros','SC','S','rio dos cedros'),
('4214805','Rio do Sul','SC','S','rio do sul'),
('4214904','Rio Fortuna','SC','S','rio fortuna'),
('4215000','Rio Negrinho','SC','S','rio negrinho'),
('4215059','Rio Rufino','SC','S','rio rufino'),
('4215075','Riqueza','SC','S','riqueza'),
('4215109','Rodeio','SC','S','rodeio'),
('4215208','Romelândia','SC','S','romelandia'),
('4215307','Salete','SC','S','salete'),
('4215356','Saltinho','SC','S','saltinho'),
('4215406','Salto Veloso','SC','S','salto veloso'),
('4215455','Sangão','SC','S','sangao'),
('4215505','Santa Cecília','SC','S','santa cecilia'),
('4215554','Santa Helena','SC','S','santa helena'),
('4215604','Santa Rosa de Lima','SC','S','santa rosa de lima'),
('4215653','Santa Rosa do Sul','SC','S','santa rosa do sul'),
('4215679','Santa Terezinha','SC','S','santa terezinha'),
('4215687','Santa Terezinha do Progresso','SC','S','santa terezinha do progresso'),
('4215695','Santiago do Sul','SC','S','santiago do sul'),
('4215703','Santo Amaro da Imperatriz','SC','S','santo amaro da imperatriz'),
('4215752','São Bernardino','SC','S','sao bernardino'),
('4215802','São Bento do Sul','SC','S','sao bento do sul'),
('4215901','São Bonifácio','SC','S','sao bonifacio'),
('4216008','São Carlos','SC','S','sao carlos'),
('4216057','São Cristóvão do Sul','SC','S','sao cristovao do sul'),
('4216107','São Domingos','SC','S','sao domingos'),
('4216206','São Francisco do Sul','SC','S','sao francisco do sul'),
('4216255','São João do Oeste','SC','S','sao joao do oeste'),
('4216305','São João Batista','SC','S','sao joao batista'),
('4216354','São João do Itaperiú','SC','S','sao joao do itaperiu'),
('4216404','São João do Sul','SC','S','sao joao do sul'),
('4216503','São Joaquim','SC','S','sao joaquim'),
('4216602','São José','SC','S','sao jose'),
('4216701','São José do Cedro','SC','S','sao jose do cedro'),
('4216800','São José do Cerrito','SC','S','sao jose do cerrito'),
('4216909','São Lourenço do Oeste','SC','S','sao lourenco do oeste'),
('4217006','São Ludgero','SC','S','sao ludgero'),
('4217105','São Martinho','SC','S','sao martinho'),
('4217154','São Miguel da Boa Vista','SC','S','sao miguel da boa vista'),
('4217204','São Miguel do Oeste','SC','S','sao miguel do oeste'),
('4217253','São Pedro de Alcântara','SC','S','sao pedro de alcantara'),
('4217303','Saudades','SC','S','saudades'),
('4217402','Schroeder','SC','S','schroeder'),
('4217501','Seara','SC','S','seara'),
('4217550','Serra Alta','SC','S','serra alta'),
('4217600','Siderópolis','SC','S','sideropolis'),
('4217709','Sombrio','SC','S','sombrio'),
('4217758','Sul Brasil','SC','S','sul brasil'),
('4217808','Taió','SC','S','taio'),
('4217907','Tangará','SC','S','tangara'),
('4217956','Tigrinhos','SC','S','tigrinhos'),
('4218004','Tijucas','SC','S','tijucas'),
('4218103','Timbé do Sul','SC','S','timbe do sul'),
('4218202','Timbó','SC','S','timbo'),
('4218251','Timbó Grande','SC','S','timbo grande'),
('4218301','Três Barras','SC','S','tres barras'),
('4218350','Treviso','SC','S','treviso'),
('4218400','Treze de Maio','SC','S','treze de maio'),
('4218509','Treze Tílias','SC','S','treze tilias'),
('4218608','Trombudo Central','SC','S','trombudo central'),
('4218707','Tubarão','SC','S','tubarao'),
('4218756','Tunápolis','SC','S','tunapolis'),
('4218806','Turvo','SC','S','turvo'),
('4218855','União do Oeste','SC','S','uniao do oeste'),
('4218905','Urubici','SC','S','urubici'),
('4218954','Urupema','SC','S','urupema'),
('4219002','Urussanga','SC','S','urussanga'),
('4219101','Vargeão','SC','S','vargeao'),
('4219150','Vargem','SC','S','vargem'),
('4219176','Vargem Bonita','SC','S','vargem bonita'),
('4219200','Vidal Ramos','SC','S','vidal ramos'),
('4219309','Videira','SC','S','videira'),
('4219358','Vitor Meireles','SC','S','vitor meireles'),
('4219408','Witmarsum','SC','S','witmarsum'),
('4219507','Xanxerê','SC','S','xanxere'),
('4219606','Xavantina','SC','S','xavantina'),
('4219705','Xaxim','SC','S','xaxim'),
('4219853','Zortéa','SC','S','zortea'),
('4220000','Balneário Rincão','SC','S','balneario rincao'),
('4300034','Aceguá','RS','S','acegua'),
('4300059','Água Santa','RS','S','agua santa'),
('4300109','Agudo','RS','S','agudo'),
('4300208','Ajuricaba','RS','S','ajuricaba'),
('4300307','Alecrim','RS','S','alecrim'),
('4300406','Alegrete','RS','S','alegrete'),
('4300455','Alegria','RS','S','alegria'),
('4300471','Almirante Tamandaré do Sul','RS','S','almirante tamandare do sul'),
('4300505','Alpestre','RS','S','alpestre'),
('4300554','Alto Alegre','RS','S','alto alegre'),
('4300570','Alto Feliz','RS','S','alto feliz'),
('4300604','Alvorada','RS','S','alvorada'),
('4300638','Amaral Ferrador','RS','S','amaral ferrador'),
('4300646','Ametista do Sul','RS','S','ametista do sul'),
('4300661','André da Rocha','RS','S','andre da rocha'),
('4300703','Anta Gorda','RS','S','anta gorda'),
('4300802','Antônio Prado','RS','S','antonio prado'),
('4300851','Arambaré','RS','S','arambare'),
('4300877','Araricá','RS','S','ararica'),
('4300901','Aratiba','RS','S','aratiba'),
('4301008','Arroio do Meio','RS','S','arroio do meio'),
('4301057','Arroio do Sal','RS','S','arroio do sal'),
('4301073','Arroio do Padre','RS','S','arroio do padre'),
('4301107','Arroio dos Ratos','RS','S','arroio dos ratos'),
('4301206','Arroio do Tigre','RS','S','arroio do tigre'),
('4301305','Arroio Grande','RS','S','arroio grande'),
('4301404','Arvorezinha','RS','S','arvorezinha'),
('4301503','Augusto Pestana','RS','S','augusto pestana'),
('4301552','Áurea','RS','S','aurea'),
('4301602','Bagé','RS','S','bage'),
('4301636','Balneário Pinhal','RS','S','balneario pinhal'),
('4301651','Barão','RS','S','barao'),
('4301701','Barão de Cotegipe','RS','S','barao de cotegipe'),
('4301750','Barão do Triunfo','RS','S','barao do triunfo'),
('4301800','Barracão','RS','S','barracao'),
('4301859','Barra do Guarita','RS','S','barra do guarita'),
('4301875','Barra do Quaraí','RS','S','barra do quarai'),
('4301909','Barra do Ribeiro','RS','S','barra do ribeiro'),
('4301925','Barra do Rio Azul','RS','S','barra do rio azul'),
('4301958','Barra Funda','RS','S','barra funda'),
('4302006','Barros Cassal','RS','S','barros cassal'),
('4302055','Benjamin Constant do Sul','RS','S','benjamin constant do sul'),
('4302105','Bento Gonçalves','RS','S','bento goncalves'),
('4302154','Boa Vista das Missões','RS','S','boa vista das missoes'),
('4302204','Boa Vista do Buricá','RS','S','boa vista do burica'),
('4302220','Boa Vista do Cadeado','RS','S','boa vista do cadeado'),
('4302238','Boa Vista do Incra','RS','S','boa vista do incra'),
('4302253','Boa Vista do Sul','RS','S','boa vista do sul'),
('4302303','Bom Jesus','RS','S','bom jesus'),
('4302352','Bom Princípio','RS','S','bom principio'),
('4302378','Bom Progresso','RS','S','bom progresso'),
('4302402','Bom Retiro do Sul','RS','S','bom retiro do sul'),
('4302451','Boqueirão do Leão','RS','S','boqueirao do leao'),
('4302501','Bossoroca','RS','S','bossoroca'),
('4302584','Bozano','RS','S','bozano'),
('4302600','Braga','RS','S','braga'),
('4302659','Brochier','RS','S','brochier'),
('4302709','Butiá','RS','S','butia'),
('4302808','Caçapava do Sul','RS','S','cacapava do sul'),
('4302907','Cacequi','RS','S','cacequi'),
('4303004','Cachoeira do Sul','RS','S','cachoeira do sul'),
('4303103','Cachoeirinha','RS','S','cachoeirinha'),
('4303202','Cacique Doble','RS','S','cacique doble'),
('4303301','Caibaté','RS','S','caibate'),
('4303400','Caiçara','RS','S','caicara'),
('4303509','Camaquã','RS','S','camaqua'),
('4303558','Camargo','RS','S','camargo'),
('4303608','Cambará do Sul','RS','S','cambara do sul'),
('4303673','Campestre da Serra','RS','S','campestre da serra'),
('4303707','Campina das Missões','RS','S','campina das missoes'),
('4303806','Campinas do Sul','RS','S','campinas do sul'),
('4303905','Campo Bom','RS','S','campo bom'),
('4304002','Campo Novo','RS','S','campo novo'),
('4304101','Campos Borges','RS','S','campos borges'),
('4304200','Candelária','RS','S','candelaria'),
('4304309','Cândido Godói','RS','S','candido godoi'),
('4304358','Candiota','RS','S','candiota'),
('4304408','Canela','RS','S','canela'),
('4304507','Canguçu','RS','S','cangucu'),
('4304606','Canoas','RS','S','canoas'),
('4304614','Canudos do Vale','RS','S','canudos do vale'),
('4304622','Capão Bonito do Sul','RS','S','capao bonito do sul'),
('4304630','Capão da Canoa','RS','S','capao da canoa'),
('4304655','Capão do Cipó','RS','S','capao do cipo'),
('4304663','Capão do Leão','RS','S','capao do leao'),
('4304671','Capivari do Sul','RS','S','capivari do sul'),
('4304689','Capela de Santana','RS','S','capela de santana'),
('4304697','Capitão','RS','S','capitao'),
('4304705','Carazinho','RS','S','carazinho'),
('4304713','Caraá','RS','S','caraa'),
('4304804','Carlos Barbosa','RS','S','carlos barbosa'),
('4304853','Carlos Gomes','RS','S','carlos gomes'),
('4304903','Casca','RS','S','casca'),
('4304952','Caseiros','RS','S','caseiros'),
('4305009','Catuípe','RS','S','catuipe'),
('4305108','Caxias do Sul','RS','S','caxias do sul'),
('4305116','Centenário','RS','S','centenario'),
('4305124','Cerrito','RS','S','cerrito'),
('4305132','Cerro Branco','RS','S','cerro branco'),
('4305157','Cerro Grande','RS','S','cerro grande'),
('4305173','Cerro Grande do Sul','RS','S','cerro grande do sul'),
('4305207','Cerro Largo','RS','S','cerro largo'),
('4305306','Chapada','RS','S','chapada'),
('4305355','Charqueadas','RS','S','charqueadas'),
('4305371','Charrua','RS','S','charrua'),
('4305405','Chiapetta','RS','S','chiapetta'),
('4305439','Chuí','RS','S','chui'),
('4305447','Chuvisca','RS','S','chuvisca'),
('4305454','Cidreira','RS','S','cidreira'),
('4305504','Ciríaco','RS','S','ciriaco'),
('4305587','Colinas','RS','S','colinas'),
('4305603','Colorado','RS','S','colorado'),
('4305702','Condor','RS','S','condor'),
('4305801','Constantina','RS','S','constantina'),
('4305835','Coqueiro Baixo','RS','S','coqueiro baixo'),
('4305850','Coqueiros do Sul','RS','S','coqueiros do sul'),
('4305871','Coronel Barros','RS','S','coronel barros'),
('4305900','Coronel Bicaco','RS','S','coronel bicaco'),
('4305934','Coronel Pilar','RS','S','coronel pilar'),
('4305959','Cotiporã','RS','S','cotipora'),
('4305975','Coxilha','RS','S','coxilha'),
('4306007','Crissiumal','RS','S','crissiumal'),
('4306056','Cristal','RS','S','cristal'),
('4306072','Cristal do Sul','RS','S','cristal do sul'),
('4306106','Cruz Alta','RS','S','cruz alta'),
('4306130','Cruzaltense','RS','S','cruzaltense'),
('4306205','Cruzeiro do Sul','RS','S','cruzeiro do sul'),
('4306304','David Canabarro','RS','S','david canabarro'),
('4306320','Derrubadas','RS','S','derrubadas'),
('4306353','Dezesseis de Novembro','RS','S','dezesseis de novembro'),
('4306379','Dilermando de Aguiar','RS','S','dilermando de aguiar'),
('4306403','Dois Irmãos','RS','S','dois irmaos'),
('4306429','Dois Irmãos das Missões','RS','S','dois irmaos das missoes'),
('4306452','Dois Lajeados','RS','S','dois lajeados'),
('4306502','Dom Feliciano','RS','S','dom feliciano'),
('4306551','Dom Pedro de Alcântara','RS','S','dom pedro de alcantara'),
('4306601','Dom Pedrito','RS','S','dom pedrito'),
('4306700','Dona Francisca','RS','S','dona francisca'),
('4306734','Doutor Maurício Cardoso','RS','S','doutor mauricio cardoso'),
('4306759','Doutor Ricardo','RS','S','doutor ricardo'),
('4306767','Eldorado do Sul','RS','S','eldorado do sul'),
('4306809','Encantado','RS','S','encantado'),
('4306908','Encruzilhada do Sul','RS','S','encruzilhada do sul'),
('4306924','Engenho Velho','RS','S','engenho velho'),
('4306932','Entre-Ijuís','RS','S','entre ijuis'),
('4306957','Entre Rios do Sul','RS','S','entre rios do sul'),
('4306973','Erebango','RS','S','erebango'),
('4307005','Erechim','RS','S','erechim'),
('4307054','Ernestina','RS','S','ernestina'),
('4307104','Herval','RS','S','herval'),
('4307203','Erval Grande','RS','S','erval grande'),
('4307302','Erval Seco','RS','S','erval seco'),
('4307401','Esmeralda','RS','S','esmeralda'),
('4307450','Esperança do Sul','RS','S','esperanca do sul'),
('4307500','Espumoso','RS','S','espumoso'),
('4307559','Estação','RS','S','estacao'),
('4307609','Estância Velha','RS','S','estancia velha'),
('4307708','Esteio','RS','S','esteio'),
('4307807','Estrela','RS','S','estrela'),
('4307815','Estrela Velha','RS','S','estrela velha'),
('4307831','Eugênio de Castro','RS','S','eugenio de castro'),
('4307864','Fagundes Varela','RS','S','fagundes varela'),
('4307906','Farroupilha','RS','S','farroupilha'),
('4308003','Faxinal do Soturno','RS','S','faxinal do soturno'),
('4308052','Faxinalzinho','RS','S','faxinalzinho'),
('4308078','Fazenda Vilanova','RS','S','fazenda vilanova'),
('4308102','Feliz','RS','S','feliz'),
('4308201','Flores da Cunha','RS','S','flores da cunha'),
('4308250','Floriano Peixoto','RS','S','floriano peixoto'),
('4308300','Fontoura Xavier','RS','S','fontoura xavier'),
('4308409','Formigueiro','RS','S','formigueiro'),
('4308433','Forquetinha','RS','S','forquetinha'),
('4308458','Fortaleza dos Valos','RS','S','fortaleza dos valos'),
('4308508','Frederico Westphalen','RS','S','frederico westphalen'),
('4308607','Garibaldi','RS','S','garibaldi'),
('4308656','Garruchos','RS','S','garruchos'),
('4308706','Gaurama','RS','S','gaurama'),
('4308805','General Câmara','RS','S','general camara'),
('4308854','Gentil','RS','S','gentil'),
('4308904','Getúlio Vargas','RS','S','getulio vargas'),
('4309001','Giruá','RS','S','girua'),
('4309050','Glorinha','RS','S','glorinha'),
('4309100','Gramado','RS','S','gramado'),
('4309126','Gramado dos Loureiros','RS','S','gramado dos loureiros'),
('4309159','Gramado Xavier','RS','S','gramado xavier'),
('4309209','Gravataí','RS','S','gravatai'),
('4309258','Guabiju','RS','S','guabiju'),
('4309308','Guaíba','RS','S','guaiba'),
('4309407','Guaporé','RS','S','guapore'),
('4309506','Guarani das Missões','RS','S','guarani das missoes'),
('4309555','Harmonia','RS','S','harmonia'),
('4309571','Herveiras','RS','S','herveiras'),
('4309605','Horizontina','RS','S','horizontina'),
('4309654','Hulha Negra','RS','S','hulha negra'),
('4309704','Humaitá','RS','S','humaita'),
('4309753','Ibarama','RS','S','ibarama'),
('4309803','Ibiaçá','RS','S','ibiaca'),
('4309902','Ibiraiaras','RS','S','ibiraiaras'),
('4309951','Ibirapuitã','RS','S','ibirapuita'),
('4310009','Ibirubá','RS','S','ibiruba'),
('4310108','Igrejinha','RS','S','igrejinha'),
('4310207','Ijuí','RS','S','ijui'),
('4310306','Ilópolis','RS','S','ilopolis'),
('4310330','Imbé','RS','S','imbe'),
('4310363','Imigrante','RS','S','imigrante'),
('4310405','Independência','RS','S','independencia'),
('4310413','Inhacorá','RS','S','inhacora'),
('4310439','Ipê','RS','S','ipe'),
('4310462','Ipiranga do Sul','RS','S','ipiranga do sul'),
('4310504','Iraí','RS','S','irai'),
('4310538','Itaara','RS','S','itaara'),
('4310553','Itacurubi','RS','S','itacurubi'),
('4310579','Itapuca','RS','S','itapuca'),
('4310603','Itaqui','RS','S','itaqui'),
('4310652','Itati','RS','S','itati'),
('4310702','Itatiba do Sul','RS','S','itatiba do sul'),
('4310751','Ivorá','RS','S','ivora'),
('4310801','Ivoti','RS','S','ivoti'),
('4310850','Jaboticaba','RS','S','jaboticaba'),
('4310876','Jacuizinho','RS','S','jacuizinho'),
('4310900','Jacutinga','RS','S','jacutinga'),
('4311007','Jaguarão','RS','S','jaguarao'),
('4311106','Jaguari','RS','S','jaguari'),
('4311122','Jaquirana','RS','S','jaquirana'),
('4311130','Jari','RS','S','jari'),
('4311155','Jóia','RS','S','joia'),
('4311205','Júlio de Castilhos','RS','S','julio de castilhos'),
('4311239','Lagoa Bonita do Sul','RS','S','lagoa bonita do sul'),
('4311254','Lagoão','RS','S','lagoao'),
('4311270','Lagoa dos Três Cantos','RS','S','lagoa dos tres cantos'),
('4311304','Lagoa Vermelha','RS','S','lagoa vermelha'),
('4311403','Lajeado','RS','S','lajeado'),
('4311429','Lajeado do Bugre','RS','S','lajeado do bugre'),
('4311502','Lavras do Sul','RS','S','lavras do sul'),
('4311601','Liberato Salzano','RS','S','liberato salzano'),
('4311627','Lindolfo Collor','RS','S','lindolfo collor'),
('4311643','Linha Nova','RS','S','linha nova'),
('4311700','Machadinho','RS','S','machadinho'),
('4311718','Maçambará','RS','S','macambara'),
('4311734','Mampituba','RS','S','mampituba'),
('4311759','Manoel Viana','RS','S','manoel viana'),
('4311775','Maquiné','RS','S','maquine'),
('4311791','Maratá','RS','S','marata'),
('4311809','Marau','RS','S','marau'),
('4311908','Marcelino Ramos','RS','S','marcelino ramos'),
('4311981','Mariana Pimentel','RS','S','mariana pimentel'),
('4312005','Mariano Moro','RS','S','mariano moro'),
('4312054','Marques de Souza','RS','S','marques de souza'),
('4312104','Mata','RS','S','mata'),
('4312138','Mato Castelhano','RS','S','mato castelhano'),
('4312153','Mato Leitão','RS','S','mato leitao'),
('4312179','Mato Queimado','RS','S','mato queimado'),
('4312203','Maximiliano de Almeida','RS','S','maximiliano de almeida'),
('4312252','Minas do Leão','RS','S','minas do leao'),
('4312302','Miraguaí','RS','S','miraguai'),
('4312351','Montauri','RS','S','montauri'),
('4312377','Monte Alegre dos Campos','RS','S','monte alegre dos campos'),
('4312385','Monte Belo do Sul','RS','S','monte belo do sul'),
('4312401','Montenegro','RS','S','montenegro'),
('4312427','Mormaço','RS','S','mormaco'),
('4312443','Morrinhos do Sul','RS','S','morrinhos do sul'),
('4312450','Morro Redondo','RS','S','morro redondo'),
('4312476','Morro Reuter','RS','S','morro reuter'),
('4312500','Mostardas','RS','S','mostardas'),
('4312609','Muçum','RS','S','mucum'),
('4312617','Muitos Capões','RS','S','muitos capoes'),
('4312625','Muliterno','RS','S','muliterno'),
('4312658','Não-Me-Toque','RS','S','nao me toque'),
('4312674','Nicolau Vergueiro','RS','S','nicolau vergueiro'),
('4312708','Nonoai','RS','S','nonoai'),
('4312757','Nova Alvorada','RS','S','nova alvorada'),
('4312807','Nova Araçá','RS','S','nova araca'),
('4312906','Nova Bassano','RS','S','nova bassano'),
('4312955','Nova Boa Vista','RS','S','nova boa vista'),
('4313003','Nova Bréscia','RS','S','nova brescia'),
('4313011','Nova Candelária','RS','S','nova candelaria'),
('4313037','Nova Esperança do Sul','RS','S','nova esperanca do sul'),
('4313060','Nova Hartz','RS','S','nova hartz'),
('4313086','Nova Pádua','RS','S','nova padua'),
('4313102','Nova Palma','RS','S','nova palma'),
('4313201','Nova Petrópolis','RS','S','nova petropolis'),
('4313300','Nova Prata','RS','S','nova prata'),
('4313334','Nova Ramada','RS','S','nova ramada'),
('4313359','Nova Roma do Sul','RS','S','nova roma do sul'),
('4313375','Nova Santa Rita','RS','S','nova santa rita'),
('4313391','Novo Cabrais','RS','S','novo cabrais'),
('4313409','Novo Hamburgo','RS','S','novo hamburgo'),
('4313425','Novo Machado','RS','S','novo machado'),
('4313441','Novo Tiradentes','RS','S','novo tiradentes'),
('4313466','Novo Xingu','RS','S','novo xingu'),
('4313490','Novo Barreiro','RS','S','novo barreiro'),
('4313508','Osório','RS','S','osorio'),
('4313607','Paim Filho','RS','S','paim filho'),
('4313656','Palmares do Sul','RS','S','palmares do sul'),
('4313706','Palmeira das Missões','RS','S','palmeira das missoes'),
('4313805','Palmitinho','RS','S','palmitinho'),
('4313904','Panambi','RS','S','panambi'),
('4313953','Pantano Grande','RS','S','pantano grande'),
('4314001','Paraí','RS','S','parai'),
('4314027','Paraíso do Sul','RS','S','paraiso do sul'),
('4314035','Pareci Novo','RS','S','pareci novo'),
('4314050','Parobé','RS','S','parobe'),
('4314068','Passa Sete','RS','S','passa sete'),
('4314076','Passo do Sobrado','RS','S','passo do sobrado'),
('4314100','Passo Fundo','RS','S','passo fundo'),
('4314134','Paulo Bento','RS','S','paulo bento'),
('4314159','Paverama','RS','S','paverama'),
('4314175','Pedras Altas','RS','S','pedras altas'),
('4314209','Pedro Osório','RS','S','pedro osorio'),
('4314308','Pejuçara','RS','S','pejucara'),
('4314407','Pelotas','RS','S','pelotas'),
('4314423','Picada Café','RS','S','picada cafe'),
('4314456','Pinhal','RS','S','pinhal'),
('4314464','Pinhal da Serra','RS','S','pinhal da serra'),
('4314472','Pinhal Grande','RS','S','pinhal grande'),
('4314498','Pinheirinho do Vale','RS','S','pinheirinho do vale'),
('4314506','Pinheiro Machado','RS','S','pinheiro machado'),
('4314548','Pinto Bandeira','RS','S','pinto bandeira'),
('4314555','Pirapó','RS','S','pirapo'),
('4314605','Piratini','RS','S','piratini'),
('4314704','Planalto','RS','S','planalto'),
('4314753','Poço das Antas','RS','S','poco das antas'),
('4314779','Pontão','RS','S','pontao'),
('4314787','Ponte Preta','RS','S','ponte preta'),
('4314803','Portão','RS','S','portao'),
('4314902','Porto Alegre','RS','S','porto alegre'),
('4315008','Porto Lucena','RS','S','porto lucena'),
('4315057','Porto Mauá','RS','S','porto maua'),
('4315073','Porto Vera Cruz','RS','S','porto vera cruz'),
('4315107','Porto Xavier','RS','S','porto xavier'),
('4315131','Pouso Novo','RS','S','pouso novo'),
('4315149','Presidente Lucena','RS','S','presidente lucena'),
('4315156','Progresso','RS','S','progresso'),
('4315172','Protásio Alves','RS','S','protasio alves'),
('4315206','Putinga','RS','S','putinga'),
('4315305','Quaraí','RS','S','quarai'),
('4315313','Quatro Irmãos','RS','S','quatro irmaos'),
('4315321','Quevedos','RS','S','quevedos'),
('4315354','Quinze de Novembro','RS','S','quinze de novembro'),
('4315404','Redentora','RS','S','redentora'),
('4315453','Relvado','RS','S','relvado'),
('4315503','Restinga Sêca','RS','S','restinga seca'),
('4315552','Rio dos Índios','RS','S','rio dos indios'),
('4315602','Rio Grande','RS','S','rio grande'),
('4315701','Rio Pardo','RS','S','rio pardo'),
('4315750','Riozinho','RS','S','riozinho'),
('4315800','Roca Sales','RS','S','roca sales'),
('4315909','Rodeio Bonito','RS','S','rodeio bonito'),
('4315958','Rolador','RS','S','rolador'),
('4316006','Rolante','RS','S','rolante'),
('4316105','Ronda Alta','RS','S','ronda alta'),
('4316204','Rondinha','RS','S','rondinha'),
('4316303','Roque Gonzales','RS','S','roque gonzales'),
('4316402','Rosário do Sul','RS','S','rosario do sul'),
('4316428','Sagrada Família','RS','S','sagrada familia'),
('4316436','Saldanha Marinho','RS','S','saldanha marinho'),
('4316451','Salto do Jacuí','RS','S','salto do jacui'),
('4316477','Salvador das Missões','RS','S','salvador das missoes'),
('4316501','Salvador do Sul','RS','S','salvador do sul'),
('4316600','Sananduva','RS','S','sananduva'),
('4316709','Santa Bárbara do Sul','RS','S','santa barbara do sul'),
('4316733','Santa Cecília do Sul','RS','S','santa cecilia do sul'),
('4316758','Santa Clara do Sul','RS','S','santa clara do sul'),
('4316808','Santa Cruz do Sul','RS','S','santa cruz do sul'),
('4316907','Santa Maria','RS','S','santa maria'),
('4316956','Santa Maria do Herval','RS','S','santa maria do herval'),
('4316972','Santa Margarida do Sul','RS','S','santa margarida do sul'),
('4317004','Santana da Boa Vista','RS','S','santana da boa vista'),
('4317103','Sant''Ana do Livramento','RS','S','sant ana do livramento'),
('4317202','Santa Rosa','RS','S','santa rosa'),
('4317251','Santa Tereza','RS','S','santa tereza'),
('4317301','Santa Vitória do Palmar','RS','S','santa vitoria do palmar'),
('4317400','Santiago','RS','S','santiago'),
('4317509','Santo Ângelo','RS','S','santo angelo'),
('4317558','Santo Antônio do Palma','RS','S','santo antonio do palma'),
('4317608','Santo Antônio da Patrulha','RS','S','santo antonio da patrulha'),
('4317707','Santo Antônio das Missões','RS','S','santo antonio das missoes'),
('4317756','Santo Antônio do Planalto','RS','S','santo antonio do planalto'),
('4317806','Santo Augusto','RS','S','santo augusto'),
('4317905','Santo Cristo','RS','S','santo cristo'),
('4317954','Santo Expedito do Sul','RS','S','santo expedito do sul'),
('4318002','São Borja','RS','S','sao borja'),
('4318051','São Domingos do Sul','RS','S','sao domingos do sul'),
('4318101','São Francisco de Assis','RS','S','sao francisco de assis'),
('4318200','São Francisco de Paula','RS','S','sao francisco de paula'),
('4318309','São Gabriel','RS','S','sao gabriel'),
('4318408','São Jerônimo','RS','S','sao jeronimo'),
('4318424','São João da Urtiga','RS','S','sao joao da urtiga'),
('4318432','São João do Polêsine','RS','S','sao joao do polesine'),
('4318440','São Jorge','RS','S','sao jorge'),
('4318457','São José das Missões','RS','S','sao jose das missoes'),
('4318465','São José do Herval','RS','S','sao jose do herval'),
('4318481','São José do Hortêncio','RS','S','sao jose do hortencio'),
('4318499','São José do Inhacorá','RS','S','sao jose do inhacora'),
('4318507','São José do Norte','RS','S','sao jose do norte'),
('4318606','São José do Ouro','RS','S','sao jose do ouro'),
('4318614','São José do Sul','RS','S','sao jose do sul'),
('4318622','São José dos Ausentes','RS','S','sao jose dos ausentes'),
('4318705','São Leopoldo','RS','S','sao leopoldo'),
('4318804','São Lourenço do Sul','RS','S','sao lourenco do sul'),
('4318903','São Luiz Gonzaga','RS','S','sao luiz gonzaga'),
('4319000','São Marcos','RS','S','sao marcos'),
('4319109','São Martinho','RS','S','sao martinho'),
('4319125','São Martinho da Serra','RS','S','sao martinho da serra'),
('4319158','São Miguel das Missões','RS','S','sao miguel das missoes'),
('4319208','São Nicolau','RS','S','sao nicolau'),
('4319307','São Paulo das Missões','RS','S','sao paulo das missoes'),
('4319356','São Pedro da Serra','RS','S','sao pedro da serra'),
('4319364','São Pedro das Missões','RS','S','sao pedro das missoes'),
('4319372','São Pedro do Butiá','RS','S','sao pedro do butia'),
('4319406','São Pedro do Sul','RS','S','sao pedro do sul'),
('4319505','São Sebastião do Caí','RS','S','sao sebastiao do cai'),
('4319604','São Sepé','RS','S','sao sepe'),
('4319703','São Valentim','RS','S','sao valentim'),
('4319711','São Valentim do Sul','RS','S','sao valentim do sul'),
('4319737','São Valério do Sul','RS','S','sao valerio do sul'),
('4319752','São Vendelino','RS','S','sao vendelino'),
('4319802','São Vicente do Sul','RS','S','sao vicente do sul'),
('4319901','Sapiranga','RS','S','sapiranga'),
('4320008','Sapucaia do Sul','RS','S','sapucaia do sul'),
('4320107','Sarandi','RS','S','sarandi'),
('4320206','Seberi','RS','S','seberi'),
('4320230','Sede Nova','RS','S','sede nova'),
('4320263','Segredo','RS','S','segredo'),
('4320305','Selbach','RS','S','selbach'),
('4320321','Senador Salgado Filho','RS','S','senador salgado filho'),
('4320354','Sentinela do Sul','RS','S','sentinela do sul'),
('4320404','Serafina Corrêa','RS','S','serafina correa'),
('4320453','Sério','RS','S','serio'),
('4320503','Sertão','RS','S','sertao'),
('4320552','Sertão Santana','RS','S','sertao santana'),
('4320578','Sete de Setembro','RS','S','sete de setembro'),
('4320602','Severiano de Almeida','RS','S','severiano de almeida'),
('4320651','Silveira Martins','RS','S','silveira martins'),
('4320677','Sinimbu','RS','S','sinimbu'),
('4320701','Sobradinho','RS','S','sobradinho'),
('4320800','Soledade','RS','S','soledade'),
('4320859','Tabaí','RS','S','tabai'),
('4320909','Tapejara','RS','S','tapejara'),
('4321006','Tapera','RS','S','tapera'),
('4321105','Tapes','RS','S','tapes'),
('4321204','Taquara','RS','S','taquara'),
('4321303','Taquari','RS','S','taquari'),
('4321329','Taquaruçu do Sul','RS','S','taquarucu do sul'),
('4321352','Tavares','RS','S','tavares'),
('4321402','Tenente Portela','RS','S','tenente portela'),
('4321436','Terra de Areia','RS','S','terra de areia'),
('4321451','Teutônia','RS','S','teutonia'),
('4321469','Tio Hugo','RS','S','tio hugo'),
('4321477','Tiradentes do Sul','RS','S','tiradentes do sul'),
('4321493','Toropi','RS','S','toropi'),
('4321501','Torres','RS','S','torres'),
('4321600','Tramandaí','RS','S','tramandai'),
('4321626','Travesseiro','RS','S','travesseiro'),
('4321634','Três Arroios','RS','S','tres arroios'),
('4321667','Três Cachoeiras','RS','S','tres cachoeiras'),
('4321709','Três Coroas','RS','S','tres coroas'),
('4321808','Três de Maio','RS','S','tres de maio'),
('4321832','Três Forquilhas','RS','S','tres forquilhas'),
('4321857','Três Palmeiras','RS','S','tres palmeiras'),
('4321907','Três Passos','RS','S','tres passos'),
('4321956','Trindade do Sul','RS','S','trindade do sul'),
('4322004','Triunfo','RS','S','triunfo'),
('4322103','Tucunduva','RS','S','tucunduva'),
('4322152','Tunas','RS','S','tunas'),
('4322186','Tupanci do Sul','RS','S','tupanci do sul'),
('4322202','Tupanciretã','RS','S','tupancireta'),
('4322251','Tupandi','RS','S','tupandi'),
('4322301','Tuparendi','RS','S','tuparendi'),
('4322327','Turuçu','RS','S','turucu'),
('4322343','Ubiretama','RS','S','ubiretama'),
('4322350','União da Serra','RS','S','uniao da serra'),
('4322376','Unistalda','RS','S','unistalda'),
('4322400','Uruguaiana','RS','S','uruguaiana'),
('4322509','Vacaria','RS','S','vacaria'),
('4322525','Vale Verde','RS','S','vale verde'),
('4322533','Vale do Sol','RS','S','vale do sol'),
('4322541','Vale Real','RS','S','vale real'),
('4322558','Vanini','RS','S','vanini'),
('4322608','Venâncio Aires','RS','S','venancio aires'),
('4322707','Vera Cruz','RS','S','vera cruz'),
('4322806','Veranópolis','RS','S','veranopolis'),
('4322855','Vespasiano Corrêa','RS','S','vespasiano correa'),
('4322905','Viadutos','RS','S','viadutos'),
('4323002','Viamão','RS','S','viamao'),
('4323101','Vicente Dutra','RS','S','vicente dutra'),
('4323200','Victor Graeff','RS','S','victor graeff'),
('4323309','Vila Flores','RS','S','vila flores'),
('4323358','Vila Lângaro','RS','S','vila langaro'),
('4323408','Vila Maria','RS','S','vila maria'),
('4323457','Vila Nova do Sul','RS','S','vila nova do sul'),
('4323507','Vista Alegre','RS','S','vista alegre'),
('4323606','Vista Alegre do Prata','RS','S','vista alegre do prata'),
('4323705','Vista Gaúcha','RS','S','vista gaucha'),
('4323754','Vitória das Missões','RS','S','vitoria das missoes'),
('4323770','Westfália','RS','S','westfalia'),
('4323804','Xangri-lá','RS','S','xangri la'),
('5000203','Água Clara','MS','CO','agua clara'),
('5000252','Alcinópolis','MS','CO','alcinopolis'),
('5000609','Amambai','MS','CO','amambai'),
('5000708','Anastácio','MS','CO','anastacio'),
('5000807','Anaurilândia','MS','CO','anaurilandia'),
('5000856','Angélica','MS','CO','angelica'),
('5000906','Antônio João','MS','CO','antonio joao'),
('5001003','Aparecida do Taboado','MS','CO','aparecida do taboado'),
('5001102','Aquidauana','MS','CO','aquidauana'),
('5001243','Aral Moreira','MS','CO','aral moreira'),
('5001508','Bandeirantes','MS','CO','bandeirantes'),
('5001904','Bataguassu','MS','CO','bataguassu'),
('5002001','Batayporã','MS','CO','bataypora'),
('5002100','Bela Vista','MS','CO','bela vista'),
('5002159','Bodoquena','MS','CO','bodoquena'),
('5002209','Bonito','MS','CO','bonito'),
('5002308','Brasilândia','MS','CO','brasilandia'),
('5002407','Caarapó','MS','CO','caarapo'),
('5002605','Camapuã','MS','CO','camapua'),
('5002704','Campo Grande','MS','CO','campo grande'),
('5002803','Caracol','MS','CO','caracol'),
('5002902','Cassilândia','MS','CO','cassilandia'),
('5002951','Chapadão do Sul','MS','CO','chapadao do sul'),
('5003108','Corguinho','MS','CO','corguinho'),
('5003157','Coronel Sapucaia','MS','CO','coronel sapucaia'),
('5003207','Corumbá','MS','CO','corumba'),
('5003256','Costa Rica','MS','CO','costa rica'),
('5003306','Coxim','MS','CO','coxim'),
('5003454','Deodápolis','MS','CO','deodapolis'),
('5003488','Dois Irmãos do Buriti','MS','CO','dois irmaos do buriti'),
('5003504','Douradina','MS','CO','douradina'),
('5003702','Dourados','MS','CO','dourados'),
('5003751','Eldorado','MS','CO','eldorado'),
('5003801','Fátima do Sul','MS','CO','fatima do sul'),
('5003900','Figueirão','MS','CO','figueirao'),
('5004007','Glória de Dourados','MS','CO','gloria de dourados'),
('5004106','Guia Lopes da Laguna','MS','CO','guia lopes da laguna'),
('5004304','Iguatemi','MS','CO','iguatemi'),
('5004403','Inocência','MS','CO','inocencia'),
('5004502','Itaporã','MS','CO','itapora'),
('5004601','Itaquiraí','MS','CO','itaquirai'),
('5004700','Ivinhema','MS','CO','ivinhema'),
('5004809','Japorã','MS','CO','japora'),
('5004908','Jaraguari','MS','CO','jaraguari'),
('5005004','Jardim','MS','CO','jardim'),
('5005103','Jateí','MS','CO','jatei'),
('5005152','Juti','MS','CO','juti'),
('5005202','Ladário','MS','CO','ladario'),
('5005251','Laguna Carapã','MS','CO','laguna carapa'),
('5005400','Maracaju','MS','CO','maracaju'),
('5005608','Miranda','MS','CO','miranda'),
('5005681','Mundo Novo','MS','CO','mundo novo'),
('5005707','Naviraí','MS','CO','navirai'),
('5005806','Nioaque','MS','CO','nioaque'),
('5006002','Nova Alvorada do Sul','MS','CO','nova alvorada do sul'),
('5006200','Nova Andradina','MS','CO','nova andradina'),
('5006259','Novo Horizonte do Sul','MS','CO','novo horizonte do sul'),
('5006275','Paraíso das Águas','MS','CO','paraiso das aguas'),
('5006309','Paranaíba','MS','CO','paranaiba'),
('5006358','Paranhos','MS','CO','paranhos'),
('5006408','Pedro Gomes','MS','CO','pedro gomes'),
('5006606','Ponta Porã','MS','CO','ponta pora'),
('5006903','Porto Murtinho','MS','CO','porto murtinho'),
('5007109','Ribas do Rio Pardo','MS','CO','ribas do rio pardo'),
('5007208','Rio Brilhante','MS','CO','rio brilhante'),
('5007307','Rio Negro','MS','CO','rio negro'),
('5007406','Rio Verde de Mato Grosso','MS','CO','rio verde de mato grosso'),
('5007505','Rochedo','MS','CO','rochedo'),
('5007554','Santa Rita do Pardo','MS','CO','santa rita do pardo'),
('5007695','São Gabriel do Oeste','MS','CO','sao gabriel do oeste'),
('5007703','Sete Quedas','MS','CO','sete quedas'),
('5007802','Selvíria','MS','CO','selviria'),
('5007901','Sidrolândia','MS','CO','sidrolandia'),
('5007935','Sonora','MS','CO','sonora'),
('5007950','Tacuru','MS','CO','tacuru'),
('5007976','Taquarussu','MS','CO','taquarussu'),
('5008008','Terenos','MS','CO','terenos'),
('5008305','Três Lagoas','MS','CO','tres lagoas'),
('5008404','Vicentina','MS','CO','vicentina'),
('5100102','Acorizal','MT','CO','acorizal'),
('5100201','Água Boa','MT','CO','agua boa'),
('5100250','Alta Floresta','MT','CO','alta floresta'),
('5100300','Alto Araguaia','MT','CO','alto araguaia'),
('5100359','Alto Boa Vista','MT','CO','alto boa vista'),
('5100409','Alto Garças','MT','CO','alto garcas'),
('5100508','Alto Paraguai','MT','CO','alto paraguai'),
('5100607','Alto Taquari','MT','CO','alto taquari'),
('5100805','Apiacás','MT','CO','apiacas'),
('5101001','Araguaiana','MT','CO','araguaiana'),
('5101209','Araguainha','MT','CO','araguainha'),
('5101258','Araputanga','MT','CO','araputanga'),
('5101308','Arenápolis','MT','CO','arenapolis'),
('5101407','Aripuanã','MT','CO','aripuana'),
('5101605','Barão de Melgaço','MT','CO','barao de melgaco'),
('5101704','Barra do Bugres','MT','CO','barra do bugres'),
('5101803','Barra do Garças','MT','CO','barra do garcas'),
('5101837','Boa Esperança do Norte','MT','CO','boa esperanca do norte'),
('5101852','Bom Jesus do Araguaia','MT','CO','bom jesus do araguaia'),
('5101902','Brasnorte','MT','CO','brasnorte'),
('5102504','Cáceres','MT','CO','caceres'),
('5102603','Campinápolis','MT','CO','campinapolis'),
('5102637','Campo Novo do Parecis','MT','CO','campo novo do parecis'),
('5102678','Campo Verde','MT','CO','campo verde'),
('5102686','Campos de Júlio','MT','CO','campos de julio'),
('5102694','Canabrava do Norte','MT','CO','canabrava do norte'),
('5102702','Canarana','MT','CO','canarana'),
('5102793','Carlinda','MT','CO','carlinda'),
('5102850','Castanheira','MT','CO','castanheira'),
('5103007','Chapada dos Guimarães','MT','CO','chapada dos guimaraes'),
('5103056','Cláudia','MT','CO','claudia'),
('5103106','Cocalinho','MT','CO','cocalinho'),
('5103205','Colíder','MT','CO','colider'),
('5103254','Colniza','MT','CO','colniza'),
('5103304','Comodoro','MT','CO','comodoro'),
('5103353','Confresa','MT','CO','confresa'),
('5103361','Conquista D''Oeste','MT','CO','conquista d oeste'),
('5103379','Cotriguaçu','MT','CO','cotriguacu'),
('5103403','Cuiabá','MT','CO','cuiaba'),
('5103437','Curvelândia','MT','CO','curvelandia'),
('5103452','Denise','MT','CO','denise'),
('5103502','Diamantino','MT','CO','diamantino'),
('5103601','Dom Aquino','MT','CO','dom aquino'),
('5103700','Feliz Natal','MT','CO','feliz natal'),
('5103809','Figueirópolis D''Oeste','MT','CO','figueiropolis d oeste'),
('5103858','Gaúcha do Norte','MT','CO','gaucha do norte'),
('5103908','General Carneiro','MT','CO','general carneiro'),
('5103957','Glória D''Oeste','MT','CO','gloria d oeste'),
('5104104','Guarantã do Norte','MT','CO','guaranta do norte'),
('5104203','Guiratinga','MT','CO','guiratinga'),
('5104500','Indiavaí','MT','CO','indiavai'),
('5104526','Ipiranga do Norte','MT','CO','ipiranga do norte'),
('5104542','Itanhangá','MT','CO','itanhanga'),
('5104559','Itaúba','MT','CO','itauba'),
('5104609','Itiquira','MT','CO','itiquira'),
('5104807','Jaciara','MT','CO','jaciara'),
('5104906','Jangada','MT','CO','jangada'),
('5105002','Jauru','MT','CO','jauru'),
('5105101','Juara','MT','CO','juara'),
('5105150','Juína','MT','CO','juina'),
('5105176','Juruena','MT','CO','juruena'),
('5105200','Juscimeira','MT','CO','juscimeira'),
('5105234','Lambari D''Oeste','MT','CO','lambari d oeste'),
('5105259','Lucas do Rio Verde','MT','CO','lucas do rio verde'),
('5105309','Luciara','MT','CO','luciara'),
('5105507','Vila Bela da Santíssima Trindade','MT','CO','vila bela da santissima trindade'),
('5105580','Marcelândia','MT','CO','marcelandia'),
('5105606','Matupá','MT','CO','matupa'),
('5105622','Mirassol d''Oeste','MT','CO','mirassol d oeste'),
('5105903','Nobres','MT','CO','nobres'),
('5106000','Nortelândia','MT','CO','nortelandia'),
('5106109','Nossa Senhora do Livramento','MT','CO','nossa senhora do livramento'),
('5106158','Nova Bandeirantes','MT','CO','nova bandeirantes'),
('5106174','Nova Nazaré','MT','CO','nova nazare'),
('5106182','Nova Lacerda','MT','CO','nova lacerda'),
('5106190','Nova Santa Helena','MT','CO','nova santa helena'),
('5106208','Nova Brasilândia','MT','CO','nova brasilandia'),
('5106216','Nova Canaã do Norte','MT','CO','nova canaa do norte'),
('5106224','Nova Mutum','MT','CO','nova mutum'),
('5106232','Nova Olímpia','MT','CO','nova olimpia'),
('5106240','Nova Ubiratã','MT','CO','nova ubirata'),
('5106257','Nova Xavantina','MT','CO','nova xavantina'),
('5106265','Novo Mundo','MT','CO','novo mundo'),
('5106273','Novo Horizonte do Norte','MT','CO','novo horizonte do norte'),
('5106281','Novo São Joaquim','MT','CO','novo sao joaquim'),
('5106299','Paranaíta','MT','CO','paranaita'),
('5106307','Paranatinga','MT','CO','paranatinga'),
('5106315','Novo Santo Antônio','MT','CO','novo santo antonio'),
('5106372','Pedra Preta','MT','CO','pedra preta'),
('5106422','Peixoto de Azevedo','MT','CO','peixoto de azevedo'),
('5106455','Planalto da Serra','MT','CO','planalto da serra'),
('5106505','Poconé','MT','CO','pocone'),
('5106653','Pontal do Araguaia','MT','CO','pontal do araguaia'),
('5106703','Ponte Branca','MT','CO','ponte branca'),
('5106752','Pontes e Lacerda','MT','CO','pontes e lacerda'),
('5106778','Porto Alegre do Norte','MT','CO','porto alegre do norte'),
('5106802','Porto dos Gaúchos','MT','CO','porto dos gauchos'),
('5106828','Porto Esperidião','MT','CO','porto esperidiao'),
('5106851','Porto Estrela','MT','CO','porto estrela'),
('5107008','Poxoréu','MT','CO','poxoreu'),
('5107040','Primavera do Leste','MT','CO','primavera do leste'),
('5107065','Querência','MT','CO','querencia'),
('5107107','São José dos Quatro Marcos','MT','CO','sao jose dos quatro marcos'),
('5107156','Reserva do Cabaçal','MT','CO','reserva do cabacal'),
('5107180','Ribeirão Cascalheira','MT','CO','ribeirao cascalheira'),
('5107198','Ribeirãozinho','MT','CO','ribeiraozinho'),
('5107206','Rio Branco','MT','CO','rio branco'),
('5107248','Santa Carmem','MT','CO','santa carmem'),
('5107263','Santo Afonso','MT','CO','santo afonso'),
('5107297','São José do Povo','MT','CO','sao jose do povo'),
('5107305','São José do Rio Claro','MT','CO','sao jose do rio claro'),
('5107354','São José do Xingu','MT','CO','sao jose do xingu'),
('5107404','São Pedro da Cipa','MT','CO','sao pedro da cipa'),
('5107578','Rondolândia','MT','CO','rondolandia'),
('5107602','Rondonópolis','MT','CO','rondonopolis'),
('5107701','Rosário Oeste','MT','CO','rosario oeste'),
('5107743','Santa Cruz do Xingu','MT','CO','santa cruz do xingu'),
('5107750','Salto do Céu','MT','CO','salto do ceu'),
('5107768','Santa Rita do Trivelato','MT','CO','santa rita do trivelato'),
('5107776','Santa Terezinha','MT','CO','santa terezinha'),
('5107792','Santo Antônio do Leste','MT','CO','santo antonio do leste'),
('5107800','Santo Antônio de Leverger','MT','CO','santo antonio de leverger'),
('5107859','São Félix do Araguaia','MT','CO','sao felix do araguaia'),
('5107875','Sapezal','MT','CO','sapezal'),
('5107883','Serra Nova Dourada','MT','CO','serra nova dourada'),
('5107909','Sinop','MT','CO','sinop'),
('5107925','Sorriso','MT','CO','sorriso'),
('5107941','Tabaporã','MT','CO','tabapora'),
('5107958','Tangará da Serra','MT','CO','tangara da serra'),
('5108006','Tapurah','MT','CO','tapurah'),
('5108055','Terra Nova do Norte','MT','CO','terra nova do norte'),
('5108105','Tesouro','MT','CO','tesouro'),
('5108204','Torixoréu','MT','CO','torixoreu'),
('5108303','União do Sul','MT','CO','uniao do sul'),
('5108352','Vale de São Domingos','MT','CO','vale de sao domingos'),
('5108402','Várzea Grande','MT','CO','varzea grande'),
('5108501','Vera','MT','CO','vera'),
('5108600','Vila Rica','MT','CO','vila rica'),
('5108808','Nova Guarita','MT','CO','nova guarita'),
('5108857','Nova Marilândia','MT','CO','nova marilandia'),
('5108907','Nova Maringá','MT','CO','nova maringa'),
('5108956','Nova Monte Verde','MT','CO','nova monte verde'),
('5200050','Abadia de Goiás','GO','CO','abadia de goias'),
('5200100','Abadiânia','GO','CO','abadiania'),
('5200134','Acreúna','GO','CO','acreuna'),
('5200159','Adelândia','GO','CO','adelandia'),
('5200175','Água Fria de Goiás','GO','CO','agua fria de goias'),
('5200209','Água Limpa','GO','CO','agua limpa'),
('5200258','Águas Lindas de Goiás','GO','CO','aguas lindas de goias'),
('5200308','Alexânia','GO','CO','alexania'),
('5200506','Aloândia','GO','CO','aloandia'),
('5200555','Alto Horizonte','GO','CO','alto horizonte'),
('5200605','Alto Paraíso de Goiás','GO','CO','alto paraiso de goias'),
('5200803','Alvorada do Norte','GO','CO','alvorada do norte'),
('5200829','Amaralina','GO','CO','amaralina'),
('5200852','Americano do Brasil','GO','CO','americano do brasil'),
('5200902','Amorinópolis','GO','CO','amorinopolis'),
('5201108','Anápolis','GO','CO','anapolis'),
('5201207','Anhanguera','GO','CO','anhanguera'),
('5201306','Anicuns','GO','CO','anicuns'),
('5201405','Aparecida de Goiânia','GO','CO','aparecida de goiania'),
('5201454','Aparecida do Rio Doce','GO','CO','aparecida do rio doce'),
('5201504','Aporé','GO','CO','apore'),
('5201603','Araçu','GO','CO','aracu'),
('5201702','Aragarças','GO','CO','aragarcas'),
('5201801','Aragoiânia','GO','CO','aragoiania'),
('5202155','Araguapaz','GO','CO','araguapaz'),
('5202353','Arenópolis','GO','CO','arenopolis'),
('5202502','Aruanã','GO','CO','aruana'),
('5202601','Aurilândia','GO','CO','aurilandia'),
('5202809','Avelinópolis','GO','CO','avelinopolis'),
('5203104','Baliza','GO','CO','baliza'),
('5203203','Barro Alto','GO','CO','barro alto'),
('5203302','Bela Vista de Goiás','GO','CO','bela vista de goias'),
('5203401','Bom Jardim de Goiás','GO','CO','bom jardim de goias'),
('5203500','Bom Jesus de Goiás','GO','CO','bom jesus de goias'),
('5203559','Bonfinópolis','GO','CO','bonfinopolis'),
('5203575','Bonópolis','GO','CO','bonopolis'),
('5203609','Brazabrantes','GO','CO','brazabrantes'),
('5203807','Britânia','GO','CO','britania'),
('5203906','Buriti Alegre','GO','CO','buriti alegre'),
('5203939','Buriti de Goiás','GO','CO','buriti de goias'),
('5203962','Buritinópolis','GO','CO','buritinopolis'),
('5204003','Cabeceiras','GO','CO','cabeceiras'),
('5204102','Cachoeira Alta','GO','CO','cachoeira alta'),
('5204201','Cachoeira de Goiás','GO','CO','cachoeira de goias'),
('5204250','Cachoeira Dourada','GO','CO','cachoeira dourada'),
('5204300','Caçu','GO','CO','cacu'),
('5204409','Caiapônia','GO','CO','caiaponia'),
('5204508','Caldas Novas','GO','CO','caldas novas'),
('5204557','Caldazinha','GO','CO','caldazinha'),
('5204607','Campestre de Goiás','GO','CO','campestre de goias'),
('5204656','Campinaçu','GO','CO','campinacu'),
('5204706','Campinorte','GO','CO','campinorte'),
('5204805','Campo Alegre de Goiás','GO','CO','campo alegre de goias'),
('5204854','Campo Limpo de Goiás','GO','CO','campo limpo de goias'),
('5204904','Campos Belos','GO','CO','campos belos'),
('5204953','Campos Verdes','GO','CO','campos verdes'),
('5205000','Carmo do Rio Verde','GO','CO','carmo do rio verde'),
('5205059','Castelândia','GO','CO','castelandia'),
('5205109','Catalão','GO','CO','catalao'),
('5205208','Caturaí','GO','CO','caturai'),
('5205307','Cavalcante','GO','CO','cavalcante'),
('5205406','Ceres','GO','CO','ceres'),
('5205455','Cezarina','GO','CO','cezarina'),
('5205471','Chapadão do Céu','GO','CO','chapadao do ceu'),
('5205497','Cidade Ocidental','GO','CO','cidade ocidental'),
('5205513','Cocalzinho de Goiás','GO','CO','cocalzinho de goias'),
('5205521','Colinas do Sul','GO','CO','colinas do sul'),
('5205703','Córrego do Ouro','GO','CO','corrego do ouro'),
('5205802','Corumbá de Goiás','GO','CO','corumba de goias'),
('5205901','Corumbaíba','GO','CO','corumbaiba'),
('5206206','Cristalina','GO','CO','cristalina'),
('5206305','Cristianópolis','GO','CO','cristianopolis'),
('5206404','Crixás','GO','CO','crixas'),
('5206503','Cromínia','GO','CO','crominia'),
('5206602','Cumari','GO','CO','cumari'),
('5206701','Damianópolis','GO','CO','damianopolis'),
('5206800','Damolândia','GO','CO','damolandia'),
('5206909','Davinópolis','GO','CO','davinopolis'),
('5207105','Diorama','GO','CO','diorama'),
('5207253','Doverlândia','GO','CO','doverlandia'),
('5207352','Edealina','GO','CO','edealina'),
('5207402','Edéia','GO','CO','edeia'),
('5207501','Estrela do Norte','GO','CO','estrela do norte'),
('5207535','Faina','GO','CO','faina'),
('5207600','Fazenda Nova','GO','CO','fazenda nova'),
('5207808','Firminópolis','GO','CO','firminopolis'),
('5207907','Flores de Goiás','GO','CO','flores de goias'),
('5208004','Formosa','GO','CO','formosa'),
('5208103','Formoso','GO','CO','formoso'),
('5208152','Gameleira de Goiás','GO','CO','gameleira de goias'),
('5208301','Divinópolis de Goiás','GO','CO','divinopolis de goias'),
('5208400','Goianápolis','GO','CO','goianapolis'),
('5208509','Goiandira','GO','CO','goiandira'),
('5208608','Goianésia','GO','CO','goianesia'),
('5208707','Goiânia','GO','CO','goiania'),
('5208806','Goianira','GO','CO','goianira'),
('5208905','Goiás','GO','CO','goias'),
('5209101','Goiatuba','GO','CO','goiatuba'),
('5209150','Gouvelândia','GO','CO','gouvelandia'),
('5209200','Guapó','GO','CO','guapo'),
('5209291','Guaraíta','GO','CO','guaraita'),
('5209408','Guarani de Goiás','GO','CO','guarani de goias'),
('5209457','Guarinos','GO','CO','guarinos'),
('5209606','Heitoraí','GO','CO','heitorai'),
('5209705','Hidrolândia','GO','CO','hidrolandia'),
('5209804','Hidrolina','GO','CO','hidrolina'),
('5209903','Iaciara','GO','CO','iaciara'),
('5209937','Inaciolândia','GO','CO','inaciolandia'),
('5209952','Indiara','GO','CO','indiara'),
('5210000','Inhumas','GO','CO','inhumas'),
('5210109','Ipameri','GO','CO','ipameri'),
('5210158','Ipiranga de Goiás','GO','CO','ipiranga de goias'),
('5210208','Iporá','GO','CO','ipora'),
('5210307','Israelândia','GO','CO','israelandia'),
('5210406','Itaberaí','GO','CO','itaberai'),
('5210562','Itaguari','GO','CO','itaguari'),
('5210604','Itaguaru','GO','CO','itaguaru'),
('5210802','Itajá','GO','CO','itaja'),
('5210901','Itapaci','GO','CO','itapaci'),
('5211008','Itapirapuã','GO','CO','itapirapua'),
('5211206','Itapuranga','GO','CO','itapuranga'),
('5211305','Itarumã','GO','CO','itaruma'),
('5211404','Itauçu','GO','CO','itaucu'),
('5211503','Itumbiara','GO','CO','itumbiara'),
('5211602','Ivolândia','GO','CO','ivolandia'),
('5211701','Jandaia','GO','CO','jandaia'),
('5211800','Jaraguá','GO','CO','jaragua'),
('5211909','Jataí','GO','CO','jatai'),
('5212006','Jaupaci','GO','CO','jaupaci'),
('5212055','Jesúpolis','GO','CO','jesupolis'),
('5212105','Joviânia','GO','CO','joviania'),
('5212204','Jussara','GO','CO','jussara'),
('5212253','Lagoa Santa','GO','CO','lagoa santa'),
('5212303','Leopoldo de Bulhões','GO','CO','leopoldo de bulhoes'),
('5212501','Luziânia','GO','CO','luziania'),
('5212600','Mairipotaba','GO','CO','mairipotaba'),
('5212709','Mambaí','GO','CO','mambai'),
('5212808','Mara Rosa','GO','CO','mara rosa'),
('5212907','Marzagão','GO','CO','marzagao'),
('5212956','Matrinchã','GO','CO','matrincha'),
('5213004','Maurilândia','GO','CO','maurilandia'),
('5213053','Mimoso de Goiás','GO','CO','mimoso de goias'),
('5213087','Minaçu','GO','CO','minacu'),
('5213103','Mineiros','GO','CO','mineiros'),
('5213400','Moiporá','GO','CO','moipora'),
('5213509','Monte Alegre de Goiás','GO','CO','monte alegre de goias'),
('5213707','Montes Claros de Goiás','GO','CO','montes claros de goias'),
('5213756','Montividiu','GO','CO','montividiu'),
('5213772','Montividiu do Norte','GO','CO','montividiu do norte'),
('5213806','Morrinhos','GO','CO','morrinhos'),
('5213855','Morro Agudo de Goiás','GO','CO','morro agudo de goias'),
('5213905','Mossâmedes','GO','CO','mossamedes'),
('5214002','Mozarlândia','GO','CO','mozarlandia'),
('5214051','Mundo Novo','GO','CO','mundo novo'),
('5214101','Mutunópolis','GO','CO','mutunopolis'),
('5214408','Nazário','GO','CO','nazario'),
('5214507','Nerópolis','GO','CO','neropolis'),
('5214606','Niquelândia','GO','CO','niquelandia'),
('5214705','Nova América','GO','CO','nova america'),
('5214804','Nova Aurora','GO','CO','nova aurora'),
('5214838','Nova Crixás','GO','CO','nova crixas'),
('5214861','Nova Glória','GO','CO','nova gloria'),
('5214879','Nova Iguaçu de Goiás','GO','CO','nova iguacu de goias'),
('5214903','Nova Roma','GO','CO','nova roma'),
('5215009','Nova Veneza','GO','CO','nova veneza'),
('5215207','Novo Brasil','GO','CO','novo brasil'),
('5215231','Novo Gama','GO','CO','novo gama'),
('5215256','Novo Planalto','GO','CO','novo planalto'),
('5215306','Orizona','GO','CO','orizona'),
('5215405','Ouro Verde de Goiás','GO','CO','ouro verde de goias'),
('5215504','Ouvidor','GO','CO','ouvidor'),
('5215603','Padre Bernardo','GO','CO','padre bernardo'),
('5215652','Palestina de Goiás','GO','CO','palestina de goias'),
('5215702','Palmeiras de Goiás','GO','CO','palmeiras de goias'),
('5215801','Palmelo','GO','CO','palmelo'),
('5215900','Palminópolis','GO','CO','palminopolis'),
('5216007','Panamá','GO','CO','panama'),
('5216304','Paranaiguara','GO','CO','paranaiguara'),
('5216403','Paraúna','GO','CO','parauna'),
('5216452','Perolândia','GO','CO','perolandia'),
('5216809','Petrolina de Goiás','GO','CO','petrolina de goias'),
('5216908','Pilar de Goiás','GO','CO','pilar de goias'),
('5217104','Piracanjuba','GO','CO','piracanjuba'),
('5217203','Piranhas','GO','CO','piranhas'),
('5217302','Pirenópolis','GO','CO','pirenopolis'),
('5217401','Pires do Rio','GO','CO','pires do rio'),
('5217609','Planaltina','GO','CO','planaltina'),
('5217708','Pontalina','GO','CO','pontalina'),
('5218003','Porangatu','GO','CO','porangatu'),
('5218052','Porteirão','GO','CO','porteirao'),
('5218102','Portelândia','GO','CO','portelandia'),
('5218300','Posse','GO','CO','posse'),
('5218391','Professor Jamil','GO','CO','professor jamil'),
('5218508','Quirinópolis','GO','CO','quirinopolis'),
('5218607','Rialma','GO','CO','rialma'),
('5218706','Rianápolis','GO','CO','rianapolis'),
('5218789','Rio Quente','GO','CO','rio quente'),
('5218805','Rio Verde','GO','CO','rio verde'),
('5218904','Rubiataba','GO','CO','rubiataba'),
('5219001','Sanclerlândia','GO','CO','sanclerlandia'),
('5219100','Santa Bárbara de Goiás','GO','CO','santa barbara de goias'),
('5219209','Santa Cruz de Goiás','GO','CO','santa cruz de goias'),
('5219258','Santa Fé de Goiás','GO','CO','santa fe de goias'),
('5219308','Santa Helena de Goiás','GO','CO','santa helena de goias'),
('5219357','Santa Isabel','GO','CO','santa isabel'),
('5219407','Santa Rita do Araguaia','GO','CO','santa rita do araguaia'),
('5219456','Santa Rita do Novo Destino','GO','CO','santa rita do novo destino'),
('5219506','Santa Rosa de Goiás','GO','CO','santa rosa de goias'),
('5219605','Santa Tereza de Goiás','GO','CO','santa tereza de goias'),
('5219704','Santa Terezinha de Goiás','GO','CO','santa terezinha de goias'),
('5219712','Santo Antônio da Barra','GO','CO','santo antonio da barra'),
('5219738','Santo Antônio de Goiás','GO','CO','santo antonio de goias'),
('5219753','Santo Antônio do Descoberto','GO','CO','santo antonio do descoberto'),
('5219803','São Domingos','GO','CO','sao domingos'),
('5219902','São Francisco de Goiás','GO','CO','sao francisco de goias'),
('5220009','São João d''Aliança','GO','CO','sao joao d alianca'),
('5220058','São João da Paraúna','GO','CO','sao joao da parauna'),
('5220108','São Luís de Montes Belos','GO','CO','sao luis de montes belos'),
('5220157','São Luiz do Norte','GO','CO','sao luiz do norte'),
('5220207','São Miguel do Araguaia','GO','CO','sao miguel do araguaia'),
('5220264','São Miguel do Passa Quatro','GO','CO','sao miguel do passa quatro'),
('5220280','São Patrício','GO','CO','sao patricio'),
('5220405','São Simão','GO','CO','sao simao'),
('5220454','Senador Canedo','GO','CO','senador canedo'),
('5220504','Serranópolis','GO','CO','serranopolis'),
('5220603','Silvânia','GO','CO','silvania'),
('5220686','Simolândia','GO','CO','simolandia'),
('5220702','Sítio d''Abadia','GO','CO','sitio d abadia'),
('5221007','Taquaral de Goiás','GO','CO','taquaral de goias'),
('5221080','Teresina de Goiás','GO','CO','teresina de goias'),
('5221197','Terezópolis de Goiás','GO','CO','terezopolis de goias'),
('5221304','Três Ranchos','GO','CO','tres ranchos'),
('5221403','Trindade','GO','CO','trindade'),
('5221452','Trombas','GO','CO','trombas'),
('5221502','Turvânia','GO','CO','turvania'),
('5221551','Turvelândia','GO','CO','turvelandia'),
('5221577','Uirapuru','GO','CO','uirapuru'),
('5221601','Uruaçu','GO','CO','uruacu'),
('5221700','Uruana','GO','CO','uruana'),
('5221809','Urutaí','GO','CO','urutai'),
('5221858','Valparaíso de Goiás','GO','CO','valparaiso de goias'),
('5221908','Varjão','GO','CO','varjao'),
('5222005','Vianópolis','GO','CO','vianopolis'),
('5222054','Vicentinópolis','GO','CO','vicentinopolis'),
('5222203','Vila Boa','GO','CO','vila boa'),
('5222302','Vila Propício','GO','CO','vila propicio'),
('5300108','Brasília','DF','CO','brasilia')
on conflict (ibge_code) do update set name = excluded.name, uf = excluded.uf, region = excluded.region, search_key = excluded.search_key;

-- ============================================================================
-- GAMIFICATION · 4 — BENEFITS AND THE LOOPS WALLET   (docs/gamification/SPEC.md §6)
--
-- The same block is supabase/19-gamification-benefits.sql, for a live database. Needs 16, 17 and 18.
--
-- Health-first, never a shop (GAM-R7): a benefit is care that comes back to
-- the person, exchanged for Loops. Nothing here tracks a stock level the
-- person can see — no scarcity, no countdown — and nothing is pushed.
--
-- Server is the source of truth (GAM-R8): what a person may see and redeem
-- is decided in get_available_benefits() and decided AGAIN inside
-- redeem_benefit(), which also takes the stock, the per-person limit, the
-- balance, the code and the ledger debit in one transaction under a per-
-- person lock — so a balance never goes negative and a code is never handed
-- to two people.
--
-- `company_id` null = a Good Loop benefit; set = that company's own (SPEC
-- §7.2b — the SPEC's `owner`). A Good Loop benefit must carry at least one
-- tag (§6.4), enforced here at commit, not only in the console.
-- ============================================================================

do $$ begin create type benefit_pillar as enum ('sono', 'mente', 'corpo', 'movimento', 'alimentacao', 'pausas_lazer'); exception when duplicate_object then null; end $$;
do $$ begin create type benefit_delivery as enum ('code_pool', 'static_code', 'link', 'collective', 'identified'); exception when duplicate_object then null; end $$;
do $$ begin create type benefit_status as enum ('draft', 'active', 'paused', 'archived'); exception when duplicate_object then null; end $$;
do $$ begin create type benefit_tag_group as enum ('partner_segment', 'benefit_type'); exception when duplicate_object then null; end $$;

create table if not exists benefits (
  id                      uuid primary key default gen_random_uuid(),
  company_id              text references companies(id) on delete cascade,     -- null = Good Loop
  title                   text not null check (length(trim(title)) between 1 and 120),
  description             text,
  care_rationale          text,                                                -- "Por que isso cuida de você"
  partner_name            text,
  pillar                  benefit_pillar not null,
  price_loops_centi       int check (price_loops_centi is null or price_loops_centi >= 0),  -- null = only through a challenge
  stock_total             int check (stock_total is null or stock_total >= 0),
  stock_remaining         int check (stock_remaining is null or stock_remaining >= 0),
  per_user_limit          int not null default 1 check (per_user_limit >= 1),
  valid_from              timestamptz,
  valid_to                timestamptz,
  code_validity_days      int check (code_validity_days is null or code_validity_days > 0),
  delivery_type           benefit_delivery not null default 'code_pool',
  static_code             text,
  link_url                text check (link_url is null or link_url ~* '^https?://'),
  terms                   text,
  image_asset             text,
  status                  benefit_status not null default 'draft',
  challenge_exclusive_id  uuid,                                                -- FK added with challenges (slice 5)
  legacy_partner_product_id uuid unique,                                       -- migrated from partner_products
  sort_order              int not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to > valid_from),
  check (delivery_type <> 'static_code' or static_code is not null or status = 'draft'),
  check (delivery_type <> 'link' or link_url is not null or status = 'draft'),
  check (price_loops_centi is not null or challenge_exclusive_id is not null or status = 'draft')
);
create index if not exists benefits_active on benefits (status, pillar, sort_order);

create table if not exists benefit_tags (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9_]+$'),
  label        text not null,
  tag_group    benefit_tag_group not null,
  description  text,
  active       boolean not null default true
);

create table if not exists benefit_tag_map (
  benefit_id  uuid not null references benefits(id) on delete cascade,
  tag_id      uuid not null references benefit_tags(id) on delete cascade,
  primary key (benefit_id, tag_id)
);

create table if not exists benefit_codes (
  id             uuid primary key default gen_random_uuid(),
  seq            bigint generated always as identity,   -- handed out in upload order
  benefit_id     uuid not null references benefits(id) on delete cascade,
  code           text not null,
  redemption_id  uuid,                                  -- FK below
  assigned_at    timestamptz,                           -- once set, never handed out again
  created_at     timestamptz not null default now(),
  unique (benefit_id, code)
);
create index if not exists benefit_codes_free on benefit_codes (benefit_id) where assigned_at is null;

create table if not exists benefit_redemptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references profiles(id) on delete cascade,
  benefit_id             uuid not null references benefits(id) on delete restrict,
  loops_spent_centi      int not null default 0 check (loops_spent_centi >= 0),
  code_id                uuid references benefit_codes(id) on delete set null,
  status                 text not null default 'active' check (status in ('active', 'refunded')),
  consent_identified_at  timestamptz,                   -- §7.4: identified redemptions only with this
  created_at             timestamptz not null default now(),
  expires_at             timestamptz,
  refunded_at            timestamptz,
  refunded_by            uuid references profiles(id) on delete set null
);
create index if not exists benefit_redemptions_user on benefit_redemptions (user_id, created_at desc);
create index if not exists benefit_redemptions_benefit on benefit_redemptions (benefit_id);
do $$ begin
  alter table benefit_codes add constraint benefit_codes_redemption_fk
    foreign key (redemption_id) references benefit_redemptions(id) on delete set null;
exception when duplicate_object then null; end $$;

-- The tag filter a company with the add-on may apply (§7.2a). Written from
-- slice 6; read by availability from now on. A row with enabled_at null is
-- a tag disabled now; the history stays.
create table if not exists company_disabled_tags (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null references companies(id) on delete cascade,
  tag_id       uuid not null references benefit_tags(id) on delete cascade,
  disabled_by  uuid references profiles(id) on delete set null,
  disabled_at  timestamptz not null default now(),
  enabled_by   uuid references profiles(id) on delete set null,
  enabled_at   timestamptz
);
create unique index if not exists company_disabled_tags_open on company_disabled_tags (company_id, tag_id) where enabled_at is null;

-- Seed tags (§6.4).
insert into benefit_tags (slug, label, tag_group) values
  ('beleza_cuidado',   'Beleza e cuidado pessoal', 'partner_segment'),
  ('alimentos_bebidas','Alimentos e bebidas',      'partner_segment'),
  ('farmacia_saude',   'Farmácia e saúde',         'partner_segment'),
  ('academias_esportes','Academias e esportes',    'partner_segment'),
  ('apps_bem_estar',   'Apps de bem-estar',        'partner_segment'),
  ('viagens_turismo',  'Viagens e turismo',        'partner_segment'),
  ('livros_cultura',   'Livros e cultura',         'partner_segment'),
  ('tecnologia_audio', 'Tecnologia e áudio',       'partner_segment'),
  ('moda',             'Moda',                     'partner_segment'),
  ('varejo',           'Varejo',                   'partner_segment'),
  ('desconto',         'Desconto',                 'benefit_type'),
  ('gratuidade',       'Gratuidade',               'benefit_type'),
  ('experiencia',      'Experiência',              'benefit_type'),
  ('produto_fisico',   'Produto físico',           'benefit_type'),
  ('doacao',           'Doação',                   'benefit_type')
on conflict (slug) do nothing;

-- ---- a Good Loop benefit carries at least one tag ---------------------------
-- Deferred to commit, so the console can insert the benefit and its tags in
-- one transaction in either order.
create or replace function gam_benefit_needs_tag() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  b uuid := coalesce(new.id, null);
begin
  if tg_table_name = 'benefit_tag_map' then
    b := case when tg_op = 'DELETE' then old.benefit_id else new.benefit_id end;
  end if;
  if exists (select 1 from benefits x where x.id = b and x.company_id is null and x.status <> 'draft')
     and not exists (select 1 from benefit_tag_map m where m.benefit_id = b) then
    raise exception 'a Good Loop benefit needs at least one tag' using errcode = 'P0001', hint = 'BENEFIT_NEEDS_TAG';
  end if;
  return null;
end $$;
drop trigger if exists benefits_need_tag on benefits;
create constraint trigger benefits_need_tag after insert or update on benefits
  deferrable initially deferred for each row execute function gam_benefit_needs_tag();
drop trigger if exists benefit_tag_map_need_tag on benefit_tag_map;
create constraint trigger benefit_tag_map_need_tag after delete on benefit_tag_map
  deferrable initially deferred for each row execute function gam_benefit_needs_tag();

-- ---- RLS --------------------------------------------------------------------------
alter table benefits enable row level security;
alter table benefit_tags enable row level security;
alter table benefit_tag_map enable row level security;
alter table benefit_codes enable row level security;
alter table benefit_redemptions enable row level security;
alter table company_disabled_tags enable row level security;

-- The catalogue is read through get_available_benefits(), which applies the
-- company filter; the tables themselves are the admin's (and, from slice 6,
-- HR's for their own company).
drop policy if exists benefits_admin on benefits;
create policy benefits_admin on benefits for all using (is_admin()) with check (is_admin());
drop policy if exists benefit_tags_read on benefit_tags;
create policy benefit_tags_read on benefit_tags for select using (auth.uid() is not null);
drop policy if exists benefit_tags_admin on benefit_tags;
create policy benefit_tags_admin on benefit_tags for all using (is_admin()) with check (is_admin());
drop policy if exists benefit_tag_map_admin on benefit_tag_map;
create policy benefit_tag_map_admin on benefit_tag_map for all using (is_admin()) with check (is_admin());
-- A code is readable ONLY by the person it was handed to (§6.4). Not even an
-- admin reads codes through the API; they upload them and see counts.
drop policy if exists benefit_codes_mine on benefit_codes;
create policy benefit_codes_mine on benefit_codes for select using (
  redemption_id in (select id from benefit_redemptions where user_id = current_profile()));
drop policy if exists benefit_redemptions_mine on benefit_redemptions;
create policy benefit_redemptions_mine on benefit_redemptions for select using (user_id = current_profile() or is_admin());
drop policy if exists company_disabled_tags_admin on company_disabled_tags;
create policy company_disabled_tags_admin on company_disabled_tags for select using (is_admin());
revoke insert, update, delete, truncate on benefit_codes, benefit_redemptions, company_disabled_tags from anon, authenticated;

-- ---- availability --------------------------------------------------------------------
-- Challenges arrive in slice 5, which replaces this with the real test.
create or replace function gam_user_earned_benefit(p_user uuid, p_benefit uuid) returns boolean
  language sql stable as $$ select false $$;

-- The person's company, when it has an active add-on at this moment.
create or replace function gam_addon_company(p_user uuid)
  returns table (company_id text, allows_tag_filter boolean, allows_company_benefits boolean)
  language sql stable security definer set search_path = public as $$
  select a.company_id, pl.allows_tag_filter, pl.allows_company_benefits
    from company_affiliations a
    join company_addon_subscriptions s on s.company_id = a.company_id
    join addon_plans pl on pl.id = s.plan_id
   where a.user_id = p_user and a.ended_at is null
     and s.status = 'active' and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
   order by pl.loops_multiplier desc
   limit 1
$$;
revoke all on function gam_addon_company(uuid) from public;

-- May this person see (and so redeem) this benefit now? SPEC §6.4:
--   active public benefits
--   − those carrying a tag the person's company disabled (add-on + tag filter)
--   + the person's company's own benefits (add-on + company benefits)
--   + challenge-exclusive benefits the person earned
create or replace function gam_benefit_available(p_user uuid, p_benefit uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  with b as (
    select * from benefits
     where id = p_benefit and status = 'active'
       and (valid_from is null or valid_from <= now()) and (valid_to is null or valid_to > now())
  ),
  co as (select * from gam_addon_company(p_user))
  select exists (
    select 1 from b
     where (
       b.challenge_exclusive_id is not null and gam_user_earned_benefit(p_user, b.id)
     ) or (
       b.challenge_exclusive_id is null and b.company_id is null
       and not exists (
         select 1 from co
           join company_disabled_tags d on d.company_id = co.company_id and d.enabled_at is null
           join benefit_tag_map m on m.tag_id = d.tag_id and m.benefit_id = b.id
          where co.allows_tag_filter)
     ) or (
       b.challenge_exclusive_id is null and b.company_id is not null
       and exists (select 1 from co where co.company_id = b.company_id and co.allows_company_benefits)
     )
  )
$$;
revoke all on function gam_benefit_available(uuid, uuid) from public;

-- What the Benefits tab lists. No stock figure is returned — only whether
-- the benefit can still be had (§6.5: no scarcity, ever).
create or replace function get_available_benefits() returns json
  language sql stable security definer set search_path = public as $$
  with me as (select current_profile() as id),
       bal as (select coalesce(sum(amount_centi), 0) as centi from loops_ledger, me where user_id = me.id)
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'companyId', b.company_id,
           'companyName', (select c.name from companies c where c.id = b.company_id),
           'title', b.title, 'description', b.description, 'careRationale', b.care_rationale,
           'partnerName', b.partner_name, 'pillar', b.pillar, 'priceLoopsCenti', b.price_loops_centi,
           'perUserLimit', b.per_user_limit, 'validTo', b.valid_to, 'codeValidityDays', b.code_validity_days,
           'deliveryType', b.delivery_type, 'terms', b.terms, 'imageAsset', b.image_asset,
           'challengeExclusive', b.challenge_exclusive_id is not null,
           'tags', (select coalesce(json_agg(t.label order by t.tag_group, t.label), '[]'::json)
                      from benefit_tag_map m join benefit_tags t on t.id = m.tag_id where m.benefit_id = b.id),
           'myRedemptions', (select count(*) from benefit_redemptions r where r.benefit_id = b.id and r.user_id = me.id and r.status = 'active'),
           'inStock', b.stock_remaining is null or b.stock_remaining > 0 or b.delivery_type = 'collective',
           'balanceCenti', bal.centi)
         order by b.pillar, b.sort_order, b.title), '[]'::json)
    from benefits b, me, bal
   where me.id is not null and gam_benefit_available(me.id, b.id)
$$;
revoke all on function get_available_benefits() from public;
do $$ begin grant execute on function get_available_benefits() to authenticated; exception when undefined_object then null; end $$;

-- ---- the one way to redeem --------------------------------------------------------------
create or replace function redeem_benefit(p_benefit uuid, p_consent_identified boolean default false) returns json
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile();
  b benefits%rowtype;
  v_balance int;
  v_price int;
  v_red uuid := gen_random_uuid();
  v_code_id uuid;
  v_code text;
  v_expires timestamptz;
  v_used int;
begin
  if me is null then raise exception 'not signed in' using errcode = 'P0001', hint = 'NOT_SIGNED_IN'; end if;
  -- One redemption at a time per person: balance and limits are read and spent here.
  perform pg_advisory_xact_lock(hashtextextended('gam:wallet:' || me::text, 0));

  select * into b from benefits where id = p_benefit for update;
  if not found or not gam_benefit_available(me, p_benefit) then
    raise exception 'benefit not available' using errcode = 'P0001', hint = 'BENEFIT_UNAVAILABLE';
  end if;
  select count(*) into v_used from benefit_redemptions where user_id = me and benefit_id = b.id and status = 'active';
  if v_used >= b.per_user_limit then
    raise exception 'already redeemed' using errcode = 'P0001', hint = 'BENEFIT_LIMIT';
  end if;
  if b.delivery_type = 'identified' and not coalesce(p_consent_identified, false) then
    raise exception 'consent to be identified is required' using errcode = 'P0001', hint = 'BENEFIT_NEEDS_CONSENT';
  end if;

  v_price := coalesce(b.price_loops_centi, 0);
  select coalesce(sum(amount_centi), 0) into v_balance from loops_ledger where user_id = me;
  if v_balance < v_price then
    raise exception 'not enough Loops' using errcode = 'P0001', hint = 'BENEFIT_BALANCE';
  end if;

  if b.stock_remaining is not null and b.delivery_type <> 'collective' then
    if b.stock_remaining <= 0 then
      raise exception 'no longer available' using errcode = 'P0001', hint = 'BENEFIT_STOCK';
    end if;
    update benefits set stock_remaining = stock_remaining - 1, updated_at = now() where id = b.id;
  end if;

  if b.code_validity_days is not null then v_expires := now() + make_interval(days => b.code_validity_days); end if;
  if b.valid_to is not null and (v_expires is null or b.valid_to < v_expires) then v_expires := b.valid_to; end if;

  insert into benefit_redemptions (id, user_id, benefit_id, loops_spent_centi, status, consent_identified_at, expires_at)
  values (v_red, me, b.id, v_price, 'active',
          case when b.delivery_type = 'identified' then now() end, v_expires);

  if b.delivery_type = 'code_pool' then
    select id, code into v_code_id, v_code from benefit_codes
     where benefit_id = b.id and assigned_at is null
     order by seq
     limit 1
     for update skip locked;
    if v_code_id is null then
      raise exception 'no code left' using errcode = 'P0001', hint = 'BENEFIT_STOCK';
    end if;
    update benefit_codes set redemption_id = v_red, assigned_at = now() where id = v_code_id;
    update benefit_redemptions set code_id = v_code_id where id = v_red;
  elsif b.delivery_type = 'static_code' then
    v_code := b.static_code;
  end if;

  if v_price > 0 then
    insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, source_type, source_id)
    values (me, 'redemption', -v_price, 'goodloop', 'redemption', v_red::text);
  end if;

  return json_build_object('redemptionId', v_red, 'code', v_code, 'link', b.link_url,
                           'expiresAt', v_expires, 'loopsSpentCenti', v_price);
end $$;
revoke all on function redeem_benefit(uuid, boolean) from public;
do $$ begin grant execute on function redeem_benefit(uuid, boolean) to authenticated; exception when undefined_object then null; end $$;

-- "Meus benefícios": what the person redeemed, with its code. Shown even if
-- the company later disabled the tag (§6.4) — availability is not asked.
create or replace function list_my_redemptions() returns json
  language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', r.id, 'benefitId', b.id, 'title', b.title, 'partnerName', b.partner_name, 'pillar', b.pillar,
           'deliveryType', b.delivery_type, 'terms', b.terms,
           'code', coalesce(c.code, case when b.delivery_type = 'static_code' then b.static_code end),
           'link', b.link_url, 'loopsSpentCenti', r.loops_spent_centi, 'status', r.status,
           'createdAt', r.created_at, 'expiresAt', r.expires_at)
         order by r.created_at desc), '[]'::json)
    from benefit_redemptions r
    join benefits b on b.id = r.benefit_id
    left join benefit_codes c on c.id = r.code_id
   where r.user_id = current_profile()
$$;
revoke all on function list_my_redemptions() from public;
do $$ begin grant execute on function list_my_redemptions() to authenticated; exception when undefined_object then null; end $$;

-- ---- the console -----------------------------------------------------------------------
-- Refund: the Loops come back as their own entry, the stock goes back; a code
-- already shown to the person is never handed to anyone else.
create or replace function admin_refund_redemption(p_redemption uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r benefit_redemptions%rowtype;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  select * into r from benefit_redemptions where id = p_redemption for update;
  if not found then raise exception 'no such redemption'; end if;
  if r.status = 'refunded' then return; end if;
  update benefit_redemptions set status = 'refunded', refunded_at = now(), refunded_by = current_profile() where id = r.id;
  update benefits set stock_remaining = stock_remaining + 1, updated_at = now()
   where id = r.benefit_id and stock_remaining is not null and delivery_type <> 'collective';
  if r.loops_spent_centi > 0 then
    insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, source_type, source_id)
    values (r.user_id, 'redemption_refund', r.loops_spent_centi, 'goodloop', 'redemption', r.id::text)
    on conflict do nothing;
  end if;
end $$;
revoke all on function admin_refund_redemption(uuid) from public;
do $$ begin grant execute on function admin_refund_redemption(uuid) to authenticated; exception when undefined_object then null; end $$;

-- CSV upload of codes. Returns how many were new; duplicates are skipped.
create or replace function admin_upload_codes(p_benefit uuid, p_codes text[]) returns int
  language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  insert into benefit_codes (benefit_id, code)
  select p_benefit, c from (select distinct trim(x) as c from unnest(p_codes) x) s
   where length(c) between 1 and 200
  on conflict (benefit_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function admin_upload_codes(uuid, text[]) from public;
do $$ begin grant execute on function admin_upload_codes(uuid, text[]) to authenticated; exception when undefined_object then null; end $$;

-- What the console shows of codes: counts, never the codes themselves.
create or replace function admin_benefit_code_counts() returns json
  language sql stable security definer set search_path = public as $$
  select case when not is_admin() then null else coalesce(json_object_agg(benefit_id, json_build_object('total', total, 'free', free)), '{}'::json) end
    from (select benefit_id, count(*) as total, count(*) filter (where assigned_at is null) as free
            from benefit_codes group by benefit_id) x
$$;
revoke all on function admin_benefit_code_counts() from public;
do $$ begin grant execute on function admin_benefit_code_counts() to authenticated; exception when undefined_object then null; end $$;

-- A benefit and its tags in ONE transaction, so the at-least-one-tag rule is
-- checked against the finished state, never a half-saved one.
create or replace function admin_save_benefit(p jsonb, p_tag_ids uuid[]) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
begin
  if not is_admin() then raise exception 'admin only'; end if;
  insert into benefits (id, company_id, title, description, care_rationale, partner_name, pillar,
                        price_loops_centi, stock_total, stock_remaining, per_user_limit, valid_from, valid_to,
                        code_validity_days, delivery_type, static_code, link_url, terms, image_asset, status,
                        challenge_exclusive_id, sort_order)
  values (v_id, nullif(p->>'companyId', ''), p->>'title', nullif(p->>'description', ''), nullif(p->>'careRationale', ''),
          nullif(p->>'partnerName', ''), (p->>'pillar')::benefit_pillar,
          (p->>'priceLoopsCenti')::int, (p->>'stockTotal')::int, (p->>'stockRemaining')::int,
          coalesce((p->>'perUserLimit')::int, 1), (p->>'validFrom')::timestamptz, (p->>'validTo')::timestamptz,
          (p->>'codeValidityDays')::int, (p->>'deliveryType')::benefit_delivery, nullif(p->>'staticCode', ''),
          nullif(p->>'linkUrl', ''), nullif(p->>'terms', ''), nullif(p->>'imageAsset', ''),
          coalesce((p->>'status')::benefit_status, 'draft'), nullif(p->>'challengeExclusiveId', '')::uuid,
          coalesce((p->>'sortOrder')::int, 0))
  on conflict (id) do update set
    company_id = excluded.company_id, title = excluded.title, description = excluded.description,
    care_rationale = excluded.care_rationale, partner_name = excluded.partner_name, pillar = excluded.pillar,
    price_loops_centi = excluded.price_loops_centi, stock_total = excluded.stock_total,
    stock_remaining = excluded.stock_remaining, per_user_limit = excluded.per_user_limit,
    valid_from = excluded.valid_from, valid_to = excluded.valid_to, code_validity_days = excluded.code_validity_days,
    delivery_type = excluded.delivery_type, static_code = excluded.static_code, link_url = excluded.link_url,
    terms = excluded.terms, image_asset = excluded.image_asset, status = excluded.status,
    challenge_exclusive_id = excluded.challenge_exclusive_id, sort_order = excluded.sort_order, updated_at = now();
  insert into benefit_tag_map (benefit_id, tag_id)
  select v_id, t from unnest(coalesce(p_tag_ids, '{}')) t on conflict do nothing;
  delete from benefit_tag_map where benefit_id = v_id and not (tag_id = any(coalesce(p_tag_ids, '{}')));
  -- the deferred rule runs now, so the console gets the refusal, not the commit
  set constraints benefits_need_tag, benefit_tag_map_need_tag immediate;
  return v_id;
end $$;
revoke all on function admin_save_benefit(jsonb, uuid[]) from public;
do $$ begin grant execute on function admin_save_benefit(jsonb, uuid[]) to authenticated; exception when undefined_object then null; end $$;

-- ---- the partner offers become benefits (PLAN A15) ------------------------------------
-- Copied once each, as DRAFTS: an offer had no Loop price and no pillar, and
-- an admin sets both before it goes live. The old table stays, unused.
insert into benefits (title, description, care_rationale, partner_name, pillar, delivery_type, static_code, link_url, status, sort_order, legacy_partner_product_id)
select pp.title, pp.description, null, pp.partner, 'pausas_lazer',
       case when pp.promo_code is not null then 'static_code'::benefit_delivery
            when pp.url is not null then 'link'::benefit_delivery else 'static_code'::benefit_delivery end,
       pp.promo_code, pp.url, 'draft', pp.position, pp.id
  from partner_products pp
 where pp.active
on conflict (legacy_partner_product_id) do nothing;
insert into benefit_tag_map (benefit_id, tag_id)
select b.id, t.id from benefits b, benefit_tags t
 where b.legacy_partner_product_id is not null and t.slug = 'desconto'
on conflict do nothing;

-- ============================================================================
-- GAMIFICATION · 5 — CHALLENGES                  (docs/gamification/SPEC.md §5)
--
-- The same block is supabase/20-gamification-challenges.sql, for a live database. Needs 16 to 19.
--
-- A challenge is a time-boxed event in one of two formats: individual (each
-- person reaches their own goal) or massive collective (everyone in a large
-- scope works toward one shared goal). The rules of §5.4's locked box are
-- the schema's, not the console's:
--   GAM-R4  scopes are national, region, state, city — or the WHOLE company.
--           No team, area, unit or group value exists to choose.
--   GAM-R2  metrics are usage only; nothing reads a score, a VAS or a result.
--   GAM-R1  no consecutive-day metric; nobody loses progress.
--   GAM-R3  only credited sessions count, so SOS never does.
--   GAM-R9  bonus Loops are never multiplied.
-- Only sessions whose END falls inside [starts_at, ends_at] count (§5.2).
-- ============================================================================

do $$ begin create type challenge_format as enum ('individual', 'collective'); exception when duplicate_object then null; end $$;
do $$ begin create type challenge_status as enum ('draft', 'scheduled', 'active', 'ended', 'settled', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin
  create type challenge_metric as enum (
    'minutes_listened', 'sessions_completed', 'deep_sessions_completed', 'sessions_in_time_window', 'pathway_completed');
exception when duplicate_object then null; end $$;
do $$ begin create type challenge_stock_rule as enum ('first_to_complete', 'raffle'); exception when duplicate_object then null; end $$;
-- How a collective goal is read: a TOTAL of the metric, or the SHARE of the
-- company's people who reached per_person_min ("60 % of the company with
-- 3+ sessions"). The share needs a known population: whole company only.
do $$ begin create type challenge_goal_kind as enum ('total', 'share_reaching_min'); exception when duplicate_object then null; end $$;

create table if not exists challenges (
  id                            uuid primary key default gen_random_uuid(),
  company_id                    text references companies(id) on delete cascade,   -- null = Good Loop
  title                         text not null check (length(trim(title)) between 1 and 80),
  description                   text check (description is null or length(description) <= 280),
  badge_icon                    text not null default 'flag',
  format                        challenge_format not null,
  scope                         gam_scope not null,
  scope_ref                     text,
  metric                        challenge_metric not null,
  goal_value                    numeric not null check (goal_value > 0),
  goal_kind                     challenge_goal_kind not null default 'total',
  per_person_min                numeric check (per_person_min is null or per_person_min > 0),
  window_start_hour             int check (window_start_hour between 0 and 23),
  window_end_hour               int check (window_end_hour between 1 and 24),
  starts_at                     timestamptz not null,
  ends_at                       timestamptz not null,
  timezone                      text not null default 'America/Sao_Paulo',
  status                        challenge_status not null default 'draft',
  reward_bonus_loops_centi      int check (reward_bonus_loops_centi is null or reward_bonus_loops_centi >= 0),
  reward_benefit_id             uuid references benefits(id) on delete set null,
  reward_rule_when_out_of_stock challenge_stock_rule not null default 'first_to_complete',
  announce_in_app               boolean not null default true,
  template_slug                 text,                                                -- company challenges (slice 6)
  goal_reached_at               timestamptz,
  created_by                    uuid references profiles(id) on delete set null,
  created_at                    timestamptz not null default now(),
  published_at                  timestamptz,
  settled_at                    timestamptz,
  check (ends_at > starts_at),
  check (scope <> 'user'),                                                            -- GAM-R4
  check ((company_id is null) = (scope <> 'company')),                               -- a company owns company scope, only
  check (company_id is null or scope_ref = company_id),
  check (metric <> 'sessions_in_time_window' or (window_start_hour is not null and window_end_hour is not null and window_end_hour > window_start_hour)),
  check (format = 'individual' or per_person_min is not null),
  check (goal_kind = 'total' or (format = 'collective' and scope = 'company' and goal_value <= 100)),
  check (reward_bonus_loops_centi is not null or reward_benefit_id is not null or status = 'draft')
);
create index if not exists challenges_live on challenges (status, starts_at, ends_at);

create table if not exists challenge_participation (
  challenge_id        uuid not null references challenges(id) on delete cascade,
  user_id             uuid not null references profiles(id) on delete cascade,
  progress_value      numeric not null default 0,
  contributed_points  int not null default 0,
  completed_at        timestamptz,
  rewarded_at         timestamptz,
  benefit_granted_at  timestamptz,
  updated_at          timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists challenge_participation_user on challenge_participation (user_id);

-- The sessions a challenge already counted, so a credit is never counted twice.
create table if not exists challenge_counted (
  challenge_id  uuid not null references challenges(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  source_id     text not null,
  primary key (challenge_id, user_id, source_id)
);

create table if not exists challenge_raffle_draws (
  challenge_id  uuid not null references challenges(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  won           boolean not null,
  drawn_at      timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create or replace view challenge_collective_progress as
  select challenge_id, sum(progress_value) as total_value, count(*) filter (where progress_value > 0) as participants
    from challenge_participation group by challenge_id;

do $$ begin
  alter table benefits add constraint benefits_challenge_exclusive_fk
    foreign key (challenge_exclusive_id) references challenges(id) on delete set null;
exception when duplicate_object then null; end $$;

alter table challenges enable row level security;
alter table challenge_participation enable row level security;
alter table challenge_counted enable row level security;
alter table challenge_raffle_draws enable row level security;
drop policy if exists challenges_admin on challenges;
create policy challenges_admin on challenges for all using (is_admin()) with check (is_admin());
drop policy if exists challenge_participation_mine on challenge_participation;
create policy challenge_participation_mine on challenge_participation for select using (user_id = current_profile() or is_admin());
drop policy if exists challenge_raffle_draws_admin on challenge_raffle_draws;
create policy challenge_raffle_draws_admin on challenge_raffle_draws for select using (is_admin());
revoke insert, update, delete, truncate on challenge_participation, challenge_counted, challenge_raffle_draws from anon, authenticated;
do $$ begin revoke all on challenge_collective_progress from anon, authenticated; exception when undefined_object then null; end $$;

-- ---- the rules a challenge must keep, as one check ---------------------------
-- Raises with a hint per broken rule; the console shows them as the
-- "Checagem Good Loop" ticks (§7.2c) and §5.4's locked box.
create or replace function gam_validate_challenge(c challenges) returns void
  language plpgsql stable security definer set search_path = public as $$
begin
  if c.scope = 'user' then raise exception 'scope' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE'; end if;
  if c.company_id is null and c.scope not in ('national', 'region', 'state', 'city') then
    raise exception 'a Good Loop challenge is national, regional, state or city-wide' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  if c.scope = 'national' and c.scope_ref is not null then
    raise exception 'a national challenge has no reference' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  if c.scope = 'region' and c.scope_ref not in ('N', 'NE', 'SE', 'S', 'CO') then
    raise exception 'unknown region' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  if c.scope = 'state' and not exists (select 1 from br_municipalities where uf::text = c.scope_ref) then
    raise exception 'unknown state' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  if c.scope = 'city' and not exists (select 1 from br_municipalities where ibge_code = c.scope_ref) then
    raise exception 'unknown city' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  if c.reward_benefit_id is not null and not exists (select 1 from benefits b where b.id = c.reward_benefit_id
       and (b.company_id is null or b.company_id = c.company_id)) then
    raise exception 'the reward benefit belongs to someone else' using errcode = 'P0001', hint = 'CHALLENGE_REWARD';
  end if;
end $$;
revoke all on function gam_validate_challenge(challenges) from public;

create or replace function gam_challenges_validate_trg() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform gam_validate_challenge(new);
  return new;
end $$;
drop trigger if exists challenges_validate on challenges;
create trigger challenges_validate before insert or update on challenges
  for each row execute function gam_challenges_validate_trg();

-- ---- who is in a challenge's scope --------------------------------------------
create or replace function gam_in_challenge_scope(p_user uuid, c challenges, p_at timestamptz) returns boolean
  language sql stable security definer set search_path = public as $$
  select case c.scope
    when 'national' then true
    when 'company' then exists (
      select 1 from company_affiliations a
       where a.user_id = p_user and a.company_id = c.company_id
         and a.started_at <= p_at and (a.ended_at is null or a.ended_at > p_at))
      and exists (
      select 1 from company_addon_subscriptions s
       where s.company_id = c.company_id and s.status = 'active'
         and s.starts_at <= p_at and (s.ends_at is null or s.ends_at > p_at))
    else gam_geo_consented(p_user) and exists (
      select 1 from profiles p join br_municipalities m on m.ibge_code = p.city_ibge_code
       where p.id = p_user
         and ((c.scope = 'city' and m.ibge_code = c.scope_ref)
           or (c.scope = 'state' and m.uf::text = c.scope_ref)
           or (c.scope = 'region' and m.region = c.scope_ref)))
  end
$$;
revoke all on function gam_in_challenge_scope(uuid, challenges, timestamptz) from public;

-- ---- rewards ----------------------------------------------------------------------
-- The bonus is funded by whoever owns the challenge (§7.2c: a company's
-- bonus is company-funded), and never multiplied. The exclusive benefit is
-- a RIGHT to redeem it; with limited stock, first-to-complete grants it
-- while units last and raffle leaves it to settlement.
create or replace function gam_reward_participant(p_challenge uuid, p_user uuid) returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
  v_stock int;
  v_granted int;
begin
  select * into c from challenges where id = p_challenge;
  update challenge_participation set rewarded_at = now()
   where challenge_id = p_challenge and user_id = p_user and rewarded_at is null;
  if not found then return false; end if;
  perform gam_credit_bonus(p_user, 'challenge_bonus', 'challenge', p_challenge::text, c.reward_bonus_loops_centi,
                           case when c.company_id is null then 'goodloop'::funding_source else 'company'::funding_source end,
                           c.company_id);
  if c.reward_benefit_id is not null and c.reward_rule_when_out_of_stock = 'first_to_complete' then
    select stock_total into v_stock from benefits where id = c.reward_benefit_id;
    select count(*) into v_granted from challenge_participation where challenge_id = p_challenge and benefit_granted_at is not null;
    if v_stock is null or v_granted < v_stock then
      update challenge_participation set benefit_granted_at = now() where challenge_id = p_challenge and user_id = p_user;
    end if;
  end if;
  return true;
end $$;
revoke all on function gam_reward_participant(uuid, uuid) from public;
do $$ begin revoke all on function gam_reward_participant(uuid, uuid) from anon, authenticated; exception when undefined_object then null; end $$;

-- A collective goal: the total, or the share of the company who reached the minimum.
create or replace function gam_collective_value(c challenges) returns numeric
  language plpgsql stable security definer set search_path = public as $$
declare
  v_people int;
  v_reached int;
begin
  if c.goal_kind = 'total' then
    return coalesce((select sum(progress_value) from challenge_participation where challenge_id = c.id), 0);
  end if;
  select count(distinct a.user_id) into v_people from company_affiliations a
   where a.company_id = c.company_id and a.started_at < c.ends_at and (a.ended_at is null or a.ended_at > c.starts_at);
  select count(*) into v_reached from challenge_participation
   where challenge_id = c.id and progress_value >= c.per_person_min;
  if v_people = 0 then return 0; end if;
  return round(100.0 * v_reached / v_people, 2);
end $$;
revoke all on function gam_collective_value(challenges) from public;

-- When a collective goal is reached: everyone who gave their part is rewarded
-- now; anyone who gives it later, at that moment; and when the challenge is a
-- whole company's, "Empresa em sintonia" goes to those who contributed (§3.3).
create or replace function gam_collective_check(p_challenge uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
  r record;
  v_def uuid;
  v_min int;
begin
  select * into c from challenges where id = p_challenge for update;
  if c.format <> 'collective' then return; end if;
  if c.goal_reached_at is null then
    if gam_collective_value(c) < c.goal_value then return; end if;
    update challenges set goal_reached_at = now() where id = c.id;
  end if;
  for r in select user_id from challenge_participation
            where challenge_id = c.id and rewarded_at is null
              and progress_value >= c.per_person_min
  loop
    perform gam_reward_participant(c.id, r.user_id);
  end loop;
  if c.scope = 'company' then
    select id into v_def from achievement_definitions where slug = 'company_in_tune' and active;
    select min_contribution_points into v_min from economy_settings where id;
    if v_def is not null then
      for r in select user_id from challenge_participation where challenge_id = c.id and contributed_points >= v_min loop
        perform gam_award(v_def, r.user_id);
      end loop;
    end if;
  end if;
end $$;
revoke all on function gam_collective_check(uuid) from public;

-- ---- progress ------------------------------------------------------------------------
-- One credited session, counted toward every live challenge the person is in
-- scope for. Called from the deferred credit trigger, before achievements
-- are evaluated, so "Primeiro desafio" unlocks in the same commit.
create or replace function update_challenge_progress(p_user uuid, p_source_id text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  s sessions%rowtype;
  pl points_ledger%rowtype;
  c challenges%rowtype;
  v_at timestamptz;
  v_inc numeric;
  v_hour int;
  v_prev numeric;
  v_new numeric;
begin
  select * into pl from points_ledger where user_id = p_user and source_type = 'session' and source_id = p_source_id;
  if not found then return; end if;
  select * into s from sessions where id::text = p_source_id;
  if not found or s.is_sos then return; end if;                                        -- GAM-R3
  v_at := coalesce(s.ended_at, pl.created_at);
  v_hour := extract(hour from s.started_at at time zone 'America/Sao_Paulo');

  for c in
    select * from challenges
     where status in ('scheduled', 'active') and starts_at <= v_at and ends_at >= v_at
       and metric <> 'pathway_completed'
  loop
    if not gam_in_challenge_scope(p_user, c, v_at) then continue; end if;
    insert into challenge_counted (challenge_id, user_id, source_id) values (c.id, p_user, p_source_id)
    on conflict do nothing;
    if not found then continue; end if;

    v_inc := case c.metric
      when 'minutes_listened' then floor(greatest(0, least(coalesce(s.listened_sec, 0), s.duration_min * 60)) / 60.0)
      when 'sessions_completed' then case when s.completed then 1 else 0 end
      when 'deep_sessions_completed' then case when s.completed and s.duration_min = 24 then 1 else 0 end
      when 'sessions_in_time_window' then case when s.completed and v_hour >= c.window_start_hour and v_hour < c.window_end_hour then 1 else 0 end
      else 0 end;

    insert into challenge_participation (challenge_id, user_id) values (c.id, p_user) on conflict do nothing;
    select progress_value into v_prev from challenge_participation where challenge_id = c.id and user_id = p_user for update;
    v_new := v_prev + v_inc;
    update challenge_participation
       set progress_value = v_new, contributed_points = contributed_points + pl.points, updated_at = now()
     where challenge_id = c.id and user_id = p_user;

    if c.format = 'individual' then
      if v_new >= c.goal_value then
        update challenge_participation set completed_at = coalesce(completed_at, now()) where challenge_id = c.id and user_id = p_user;
        perform gam_reward_participant(c.id, p_user);                                  -- individual: at once (§5.3)
      end if;
    else
      if v_new >= c.per_person_min then
        update challenge_participation set completed_at = coalesce(completed_at, now()) where challenge_id = c.id and user_id = p_user;
      end if;
      perform gam_collective_check(c.id);
    end if;
  end loop;
end $$;
revoke all on function update_challenge_progress(uuid, text) from public;
do $$ begin revoke all on function update_challenge_progress(uuid, text) from anon, authenticated; exception when undefined_object then null; end $$;

-- A finished pathway, for the pathway_completed metric.
create or replace function gam_pathway_challenge_progress(p_user uuid, p_slug text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
begin
  for c in select * from challenges
            where status in ('scheduled', 'active') and starts_at <= now() and ends_at >= now()
              and metric = 'pathway_completed'
  loop
    if not gam_in_challenge_scope(p_user, c, now()) then continue; end if;
    insert into challenge_counted (challenge_id, user_id, source_id) values (c.id, p_user, 'pathway:' || p_slug)
    on conflict do nothing;
    if not found then continue; end if;
    insert into challenge_participation (challenge_id, user_id, progress_value) values (c.id, p_user, 1)
    on conflict (challenge_id, user_id) do update set progress_value = challenge_participation.progress_value + 1, updated_at = now();
    if c.format = 'individual' then
      if (select progress_value from challenge_participation where challenge_id = c.id and user_id = p_user) >= c.goal_value then
        update challenge_participation set completed_at = coalesce(completed_at, now()) where challenge_id = c.id and user_id = p_user;
        perform gam_reward_participant(c.id, p_user);
      end if;
    else
      perform gam_collective_check(c.id);
    end if;
  end loop;
end $$;
revoke all on function gam_pathway_challenge_progress(uuid, text) from public;

-- The credit trigger, now: challenges first, then achievements.
create or replace function gam_points_evaluate() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.source_type = 'session' then perform update_challenge_progress(new.user_id, new.source_id); end if;
  exception when others then
    raise warning 'update_challenge_progress(%) failed: %', new.user_id, sqlerrm;
  end;
  begin
    perform evaluate_achievements(new.user_id);
  exception when others then
    raise warning 'evaluate_achievements(%) failed: %', new.user_id, sqlerrm;
  end;
  return null;
end $$;

create or replace function record_pathway_completed(p_slug text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_slug is null or length(trim(p_slug)) = 0 or length(p_slug) > 120 then raise exception 'bad pathway'; end if;
  insert into pathway_completions (user_id, pathway_slug) values (me, trim(p_slug)) on conflict do nothing;
  perform gam_pathway_challenge_progress(me, trim(p_slug));
  perform evaluate_achievements(me);
end $$;

-- What slice 2 and 4 left as placeholders.
create or replace function gam_challenges_completed(p_user uuid) returns int
  language sql stable security definer set search_path = public as $$
  select count(*)::int from challenge_participation where user_id = p_user and completed_at is not null
$$;
create or replace function gam_user_earned_benefit(p_user uuid, p_benefit uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from challenge_participation p join challenges c on c.id = p.challenge_id
     where p.user_id = p_user and c.reward_benefit_id = p_benefit and p.benefit_granted_at is not null)
$$;

-- ---- settlement -------------------------------------------------------------------------
-- At ends_at: collective rewards for whoever qualifies, raffles for limited
-- exclusive benefits, then 'settled'. Idempotent: a settled challenge is left
-- alone, and a raffle is drawn once (challenge_raffle_draws).
create or replace function settle_challenges() returns int
  language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
  r record;
  n int := 0;
  v_stock int;
  v_left int;
begin
  update challenges set status = 'active' where status = 'scheduled' and starts_at <= now() and ends_at > now();
  for c in select * from challenges where status in ('scheduled', 'active', 'ended') and ends_at <= now() for update loop
    update challenges set status = 'ended' where id = c.id and status <> 'ended';
    if c.format = 'collective' then perform gam_collective_check(c.id); end if;

    if c.reward_benefit_id is not null and c.reward_rule_when_out_of_stock = 'raffle'
       and not exists (select 1 from challenge_raffle_draws where challenge_id = c.id) then
      select stock_total into v_stock from benefits where id = c.reward_benefit_id;
      v_left := coalesce(v_stock, 2147483647) - (select count(*) from challenge_participation where challenge_id = c.id and benefit_granted_at is not null);
      for r in
        select p.user_id, row_number() over (order by gen_random_uuid()) as k
          from challenge_participation p
         where p.challenge_id = c.id and p.rewarded_at is not null and p.benefit_granted_at is null
      loop
        insert into challenge_raffle_draws (challenge_id, user_id, won) values (c.id, r.user_id, r.k <= v_left)
        on conflict do nothing;
        if r.k <= v_left then
          update challenge_participation set benefit_granted_at = now() where challenge_id = c.id and user_id = r.user_id;
        end if;
      end loop;
    end if;

    update challenges set status = 'settled', settled_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function settle_challenges() from public;
do $$ begin revoke all on function settle_challenges() from anon, authenticated; exception when undefined_object then null; end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gl-challenges-settle';
    perform cron.schedule('gl-challenges-settle', '5 * * * *', 'select public.settle_challenges()');
  end if;
exception when others then
  raise notice 'could not schedule gl-challenges-settle (%): use the Admin button', sqlerrm;
end $$;

-- ---- what the app reads -------------------------------------------------------------------
-- The live challenges this person is in scope for, with their own part. For
-- a collective: the shared value and, for a whole company, its share — but
-- never a list of people, and no participant count under k (§5.5, §7.3).
create or replace function get_my_challenges() returns json
  language sql stable security definer set search_path = public as $$
  with me as (select current_profile() as id),
       k as (select hr_min_cohort as v from economy_settings where id)
  select coalesce(json_agg(json_build_object(
           'id', c.id, 'companyId', c.company_id,
           'companyName', (select co.name from companies co where co.id = c.company_id),
           'title', c.title, 'description', c.description, 'badgeIcon', c.badge_icon,
           'format', c.format, 'scope', c.scope, 'scopeRef', c.scope_ref, 'metric', c.metric,
           'goalValue', c.goal_value, 'goalKind', c.goal_kind, 'perPersonMin', c.per_person_min,
           'windowStartHour', c.window_start_hour, 'windowEndHour', c.window_end_hour,
           'startsAt', c.starts_at, 'endsAt', c.ends_at, 'status', c.status,
           'rewardBonusLoopsCenti', c.reward_bonus_loops_centi,
           'rewardBenefit', (select json_build_object('id', b.id, 'title', b.title) from benefits b where b.id = c.reward_benefit_id),
           'myProgress', coalesce(p.progress_value, 0), 'myCompletedAt', p.completed_at, 'myRewardedAt', p.rewarded_at,
           'myBenefitGranted', p.benefit_granted_at is not null,
           'collectiveValue', case when c.format = 'collective' then gam_collective_value(c) end,
           'participants', case when c.format = 'collective' then (
              select case when c.scope = 'company' and count(*) < k.v then null else count(*) end
                from challenge_participation x where x.challenge_id = c.id and x.progress_value > 0) end,
           'goalReachedAt', c.goal_reached_at)
         order by c.ends_at), '[]'::json)
    from challenges c
    cross join me cross join k
    left join challenge_participation p on p.challenge_id = c.id and p.user_id = me.id
   where me.id is not null
     and c.status in ('active', 'scheduled', 'ended', 'settled')
     and c.ends_at > now() - interval '14 days'
     and gam_in_challenge_scope(me.id, c, least(now(), c.ends_at))
$$;
revoke all on function get_my_challenges() from public;
do $$ begin grant execute on function get_my_challenges() to authenticated; exception when undefined_object then null; end $$;

-- ---- the console (Good Loop challenges) ---------------------------------------------------
create or replace function admin_save_challenge(p jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if nullif(p->>'companyId', '') is not null then
    raise exception 'company challenges are written by the company''s HR' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  insert into challenges (id, title, description, badge_icon, format, scope, scope_ref, metric, goal_value, goal_kind,
                          per_person_min, window_start_hour, window_end_hour, starts_at, ends_at, status,
                          reward_bonus_loops_centi, reward_benefit_id, reward_rule_when_out_of_stock, announce_in_app, created_by)
  values (v_id, p->>'title', nullif(p->>'description', ''), coalesce(nullif(p->>'badgeIcon', ''), 'flag'),
          (p->>'format')::challenge_format, (p->>'scope')::gam_scope, nullif(p->>'scopeRef', ''),
          (p->>'metric')::challenge_metric, (p->>'goalValue')::numeric, 'total',
          (p->>'perPersonMin')::numeric, (p->>'windowStartHour')::int, (p->>'windowEndHour')::int,
          (p->>'startsAt')::timestamptz, (p->>'endsAt')::timestamptz, 'draft',
          (p->>'rewardBonusLoopsCenti')::int, nullif(p->>'rewardBenefitId', '')::uuid,
          coalesce((p->>'rewardRule')::challenge_stock_rule, 'first_to_complete'),
          coalesce((p->>'announceInApp')::boolean, true), current_profile())
  on conflict (id) do update set
    title = excluded.title, description = excluded.description, badge_icon = excluded.badge_icon,
    format = excluded.format, scope = excluded.scope, scope_ref = excluded.scope_ref, metric = excluded.metric,
    goal_value = excluded.goal_value, per_person_min = excluded.per_person_min,
    window_start_hour = excluded.window_start_hour, window_end_hour = excluded.window_end_hour,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    reward_bonus_loops_centi = excluded.reward_bonus_loops_centi, reward_benefit_id = excluded.reward_benefit_id,
    reward_rule_when_out_of_stock = excluded.reward_rule_when_out_of_stock, announce_in_app = excluded.announce_in_app
  where challenges.status in ('draft', 'scheduled');
  if not found then raise exception 'a live challenge cannot be edited' using errcode = 'P0001', hint = 'CHALLENGE_LIVE'; end if;
  -- an exclusive prize is exclusive to this challenge
  update benefits set challenge_exclusive_id = v_id where id = nullif(p->>'rewardBenefitId', '')::uuid and price_loops_centi is null;
  return v_id;
end $$;
revoke all on function admin_save_challenge(jsonb) from public;
do $$ begin grant execute on function admin_save_challenge(jsonb) to authenticated; exception when undefined_object then null; end $$;

-- publish | schedule | end | cancel | duplicate  (§5.4 actions)
create or replace function admin_challenge_action(p_id uuid, p_action text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  c challenges%rowtype;
  v_new uuid;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  select * into c from challenges where id = p_id for update;
  if not found or c.company_id is not null then raise exception 'no such Good Loop challenge'; end if;
  if p_action in ('publish', 'schedule') then
    if c.status <> 'draft' then raise exception 'already published' using errcode = 'P0001', hint = 'CHALLENGE_LIVE'; end if;
    if c.ends_at <= now() then raise exception 'it would end before it starts' using errcode = 'P0001', hint = 'CHALLENGE_DATES'; end if;
    if c.reward_bonus_loops_centi is null and c.reward_benefit_id is null then
      raise exception 'a challenge needs a reward' using errcode = 'P0001', hint = 'CHALLENGE_REWARD';
    end if;
    if p_action = 'publish' and c.starts_at > now() then
      update challenges set starts_at = now() where id = p_id;
    end if;
    update challenges set status = case when starts_at > now() then 'scheduled'::challenge_status else 'active'::challenge_status end,
                          published_at = now() where id = p_id;
    return p_id;
  elsif p_action = 'end' then
    update challenges set ends_at = least(ends_at, now()) where id = p_id and status in ('scheduled', 'active');
    perform settle_challenges();
    return p_id;
  elsif p_action = 'cancel' then
    update challenges set status = 'cancelled' where id = p_id and status in ('draft', 'scheduled', 'active');
    return p_id;
  elsif p_action = 'duplicate' then
    v_new := gen_random_uuid();
    insert into challenges (id, title, description, badge_icon, format, scope, scope_ref, metric, goal_value, goal_kind,
                            per_person_min, window_start_hour, window_end_hour, starts_at, ends_at, status,
                            reward_bonus_loops_centi, reward_benefit_id, reward_rule_when_out_of_stock, announce_in_app, created_by)
    select v_new, left(title || ' (cópia)', 80), description, badge_icon, format, scope, scope_ref, metric, goal_value, goal_kind,
           per_person_min, window_start_hour, window_end_hour, greatest(now(), starts_at), greatest(now(), starts_at) + (ends_at - starts_at), 'draft',
           reward_bonus_loops_centi, null, reward_rule_when_out_of_stock, announce_in_app, current_profile()
      from challenges where id = p_id;
    return v_new;
  end if;
  raise exception 'unknown action %', p_action;
end $$;
revoke all on function admin_challenge_action(uuid, text) from public;
do $$ begin grant execute on function admin_challenge_action(uuid, text) to authenticated; exception when undefined_object then null; end $$;

-- The console's list: every Good Loop challenge with its counts (§5.4).
create or replace function admin_list_challenges() returns json
  language sql stable security definer set search_path = public as $$
  select case when not is_admin() then null else coalesce(json_agg(json_build_object(
           'id', c.id, 'title', c.title, 'description', c.description, 'badgeIcon', c.badge_icon,
           'format', c.format, 'scope', c.scope, 'scopeRef', c.scope_ref, 'metric', c.metric,
           'goalValue', c.goal_value, 'perPersonMin', c.per_person_min,
           'windowStartHour', c.window_start_hour, 'windowEndHour', c.window_end_hour,
           'startsAt', c.starts_at, 'endsAt', c.ends_at, 'status', c.status,
           'rewardBonusLoopsCenti', c.reward_bonus_loops_centi, 'rewardBenefitId', c.reward_benefit_id,
           'rewardRule', c.reward_rule_when_out_of_stock, 'announceInApp', c.announce_in_app,
           'participants', (select count(*) from challenge_participation p where p.challenge_id = c.id and p.progress_value > 0),
           'completed', (select count(*) from challenge_participation p where p.challenge_id = c.id and p.completed_at is not null),
           'rewarded', (select count(*) from challenge_participation p where p.challenge_id = c.id and p.rewarded_at is not null),
           'collectiveValue', case when c.format = 'collective' then gam_collective_value(c) end)
         order by c.starts_at desc), '[]'::json) end
    from challenges c where c.company_id is null
$$;
revoke all on function admin_list_challenges() from public;
do $$ begin grant execute on function admin_list_challenges() to authenticated; exception when undefined_object then null; end $$;

-- "População ativa suficiente" and the estimated reach (§5.4 step 3, right column).
create or replace function admin_challenge_reach(p_scope text, p_ref text) returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', gam_sp_day(now()) - interval '1 month')::date;
  v_active int;
  v_people int;
  v_threshold int;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if p_scope not in ('national', 'region', 'state', 'city') then
    raise exception 'scope must be national, region, state or city' using errcode = 'P0001', hint = 'CHALLENGE_SCOPE';
  end if;
  v_threshold := gam_geo_threshold(case when p_scope = 'city' then 'city' else 'state' end);
  if p_scope = 'national' then
    select count(*) into v_people from profiles where role = 'b2c_user' and active;
    select coalesce((select active_users from geo_rollup where scope = 'national' and period_month = v_month), 0) into v_active;
  else
    select count(*) into v_people from profiles p join br_municipalities m on m.ibge_code = p.city_ibge_code
     where gam_geo_consented(p.id) and ((p_scope = 'city' and m.ibge_code = p_ref) or (p_scope = 'state' and m.uf::text = p_ref) or (p_scope = 'region' and m.region = p_ref));
    select coalesce((select active_users from geo_rollup where scope = p_scope and ref = p_ref and period_month = v_month), 0) into v_active;
  end if;
  return json_build_object('people', v_people, 'activeLastMonth', v_active, 'threshold', v_threshold,
                           'enough', p_scope = 'national' or v_active >= v_threshold);
end $$;
revoke all on function admin_challenge_reach(text, text) from public;
do $$ begin grant execute on function admin_challenge_reach(text, text) to authenticated; exception when undefined_object then null; end $$;

create or replace function admin_settle_challenges() returns int
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return settle_challenges();
end $$;
revoke all on function admin_settle_challenges() from public;
do $$ begin grant execute on function admin_settle_challenges() to authenticated; exception when undefined_object then null; end $$;

-- ============================================================================
-- GAMIFICATION · 6 — THE COMPANY ADD-ON           (docs/gamification/SPEC.md §7)
--
-- The same block is supabase/21-gamification-company.sql, for a live database. Needs 16 to 20.
--
-- HR configures; HR never sees a person (GAM-R5, MN-17, SPN-01..08):
--   - every function here takes the company from my_company_id(), never
--     from the caller, and checks is_hr() and an active add-on;
--   - figures come only as company-wide aggregates, suppressed under
--     hr_min_cohort (25, SPN-02) with complementary suppression, so no
--     suppressed figure can be recovered by subtraction;
--   - no breakdown by area, unit or team exists to ask for (GAM-R4);
--   - names reach HR only for an IDENTIFIED redemption the employee chose,
--     after seeing exactly what is shared (§7.2b, §7.4);
--   - company challenges come only from approved templates (SPN-06, PLAN A4).
-- ============================================================================

-- ---- what an identified redemption shares, snapshotted when it happens ----------
alter table benefit_redemptions add column if not exists identified_name text;
alter table benefit_redemptions add column if not exists identified_employee_number text;

-- ---- the add-on a company has now ---------------------------------------------------
create or replace function gam_company_addon(p_company text)
  returns table (plan_id text, plan_name text, loops_multiplier numeric, allows_company_challenges boolean,
                 allows_company_benefits boolean, allows_tag_filter boolean, starts_at timestamptz, ends_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select pl.id, pl.name, pl.loops_multiplier, pl.allows_company_challenges, pl.allows_company_benefits, pl.allows_tag_filter,
         s.starts_at, s.ends_at
    from company_addon_subscriptions s join addon_plans pl on pl.id = s.plan_id
   where s.company_id = p_company and s.status = 'active'
     and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
   order by pl.loops_multiplier desc
   limit 1
$$;
revoke all on function gam_company_addon(text) from public;

-- The HR caller's company, or an error: HR of THIS company, with the add-on.
create or replace function gam_hr_company(p_needs text default null) returns text
  language plpgsql stable security definer set search_path = public as $$
declare
  v_co text := my_company_id();
  a record;
begin
  if not is_hr() or v_co is null then raise exception 'HR only' using errcode = 'P0001', hint = 'HR_ONLY'; end if;
  select * into a from gam_company_addon(v_co);
  if not found then raise exception 'no active add-on' using errcode = 'P0001', hint = 'ADDON_NONE'; end if;
  if (p_needs = 'challenges' and not a.allows_company_challenges)
  or (p_needs = 'benefits' and not a.allows_company_benefits)
  or (p_needs = 'tags' and not a.allows_tag_filter) then
    raise exception 'not in this plan' using errcode = 'P0001', hint = 'ADDON_FEATURE';
  end if;
  return v_co;
end $$;
revoke all on function gam_hr_company(text) from public;

-- Plano (§7.2e), read-only. Null when the company has no add-on.
create or replace function hr_get_addon() returns json
  language sql stable security definer set search_path = public as $$
  select case when not is_hr() then null else (
    select json_build_object('planId', a.plan_id, 'planName', a.plan_name, 'multiplier', a.loops_multiplier,
                             'companyChallenges', a.allows_company_challenges, 'companyBenefits', a.allows_company_benefits,
                             'tagFilter', a.allows_tag_filter, 'startsAt', a.starts_at, 'endsAt', a.ends_at)
      from gam_company_addon(my_company_id()) a) end
$$;
revoke all on function hr_get_addon() from public;
do $$ begin grant execute on function hr_get_addon() to authenticated; exception when undefined_object then null; end $$;

-- ---- a) Benefícios abertos: the tag filter -------------------------------------------
create or replace function hr_list_tag_filter() returns json
  language sql stable security definer set search_path = public as $$
  with co as (select gam_hr_company('tags') as id)
  select coalesce(json_agg(json_build_object(
           'id', t.id, 'slug', t.slug, 'label', t.label, 'group', t.tag_group,
           'disabled', exists (select 1 from company_disabled_tags d where d.company_id = co.id and d.tag_id = t.id and d.enabled_at is null),
           'affects', (select count(*) from benefit_tag_map m join benefits b on b.id = m.benefit_id
                        where m.tag_id = t.id and b.company_id is null and b.status = 'active' and b.challenge_exclusive_id is null),
           'benefits', (select coalesce(json_agg(b.title order by b.title), '[]'::json) from benefit_tag_map m join benefits b on b.id = m.benefit_id
                        where m.tag_id = t.id and b.company_id is null and b.status = 'active' and b.challenge_exclusive_id is null))
         order by t.tag_group, t.label), '[]'::json)
    from benefit_tags t, co
   where t.active
$$;
revoke all on function hr_list_tag_filter() from public;
do $$ begin grant execute on function hr_list_tag_filter() to authenticated; exception when undefined_object then null; end $$;

-- Turning a tag off hides every public benefit carrying it from this
-- company's people; on again, they return. Each change is a row (history).
create or replace function hr_set_tag_disabled(p_tag uuid, p_disabled boolean) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_co text := gam_hr_company('tags');
begin
  if p_disabled then
    insert into company_disabled_tags (company_id, tag_id, disabled_by) values (v_co, p_tag, current_profile())
    on conflict do nothing;
  else
    update company_disabled_tags set enabled_at = now(), enabled_by = current_profile()
     where company_id = v_co and tag_id = p_tag and enabled_at is null;
  end if;
end $$;
revoke all on function hr_set_tag_disabled(uuid, boolean) from public;
do $$ begin grant execute on function hr_set_tag_disabled(uuid, boolean) to authenticated; exception when undefined_object then null; end $$;

create or replace function hr_tag_filter_history() returns json
  language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('label', t.label, 'disabledAt', d.disabled_at, 'enabledAt', d.enabled_at)
         order by d.disabled_at desc), '[]'::json)
    from company_disabled_tags d join benefit_tags t on t.id = d.tag_id
   where d.company_id = gam_hr_company('tags')
$$;
revoke all on function hr_tag_filter_history() from public;
do $$ begin grant execute on function hr_tag_filter_history() to authenticated; exception when undefined_object then null; end $$;

-- ---- b) Benefícios da empresa ----------------------------------------------------------
-- Three delivery modes only: a code pool (HR never learns who redeemed),
-- collective (to the whole company, nobody identified) and identified
-- (name + employee number, with the employee's explicit consent).
create or replace function hr_list_company_benefits() returns json
  language sql stable security definer set search_path = public as $$
  with co as (select gam_hr_company('benefits') as id)
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'title', b.title, 'description', b.description, 'careRationale', b.care_rationale,
           'pillar', b.pillar, 'priceLoopsCenti', b.price_loops_centi, 'stockTotal', b.stock_total,
           'deliveryType', b.delivery_type, 'status', b.status, 'terms', b.terms,
           'codesFree', (select count(*) from benefit_codes c where c.benefit_id = b.id and c.assigned_at is null),
           'codesTotal', (select count(*) from benefit_codes c where c.benefit_id = b.id))
         order by b.created_at desc), '[]'::json)
    from benefits b, co where b.company_id = co.id
$$;
revoke all on function hr_list_company_benefits() from public;
do $$ begin grant execute on function hr_list_company_benefits() to authenticated; exception when undefined_object then null; end $$;

create or replace function hr_save_company_benefit(p jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_co text := gam_hr_company('benefits');
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_delivery benefit_delivery := (p->>'deliveryType')::benefit_delivery;
begin
  if v_delivery not in ('code_pool', 'collective', 'identified') then
    raise exception 'a company benefit is a code, collective or identified' using errcode = 'P0001', hint = 'BENEFIT_DELIVERY';
  end if;
  if exists (select 1 from benefits where id = v_id and company_id is distinct from v_co) then
    raise exception 'not your company''s benefit' using errcode = 'P0001', hint = 'HR_ONLY';
  end if;
  insert into benefits (id, company_id, title, description, care_rationale, pillar, price_loops_centi, stock_total, stock_remaining,
                        per_user_limit, delivery_type, terms, status, code_validity_days)
  values (v_id, v_co, p->>'title', nullif(p->>'description', ''), nullif(p->>'careRationale', ''), (p->>'pillar')::benefit_pillar,
          (p->>'priceLoopsCenti')::int, (p->>'stockTotal')::int, (p->>'stockTotal')::int, 1, v_delivery,
          nullif(p->>'terms', ''), coalesce((p->>'status')::benefit_status, 'draft'), (p->>'codeValidityDays')::int)
  on conflict (id) do update set
    title = excluded.title, description = excluded.description, care_rationale = excluded.care_rationale,
    pillar = excluded.pillar, price_loops_centi = excluded.price_loops_centi,
    stock_remaining = case when excluded.stock_total is null then null
                           else greatest(0, excluded.stock_total - coalesce(benefits.stock_total - benefits.stock_remaining, 0)) end,
    stock_total = excluded.stock_total, delivery_type = excluded.delivery_type, terms = excluded.terms,
    status = excluded.status, code_validity_days = excluded.code_validity_days, updated_at = now();
  return v_id;
end $$;
revoke all on function hr_save_company_benefit(jsonb) from public;
do $$ begin grant execute on function hr_save_company_benefit(jsonb) to authenticated; exception when undefined_object then null; end $$;

create or replace function hr_upload_codes(p_benefit uuid, p_codes text[]) returns int
  language plpgsql security definer set search_path = public as $$
declare
  v_co text := gam_hr_company('benefits');
  n int;
begin
  if not exists (select 1 from benefits where id = p_benefit and company_id = v_co and delivery_type = 'code_pool') then
    raise exception 'not your company''s code benefit' using errcode = 'P0001', hint = 'HR_ONLY';
  end if;
  insert into benefit_codes (benefit_id, code)
  select p_benefit, c from (select distinct trim(x) as c from unnest(p_codes) x) s where length(c) between 1 and 200
  on conflict (benefit_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function hr_upload_codes(uuid, text[]) from public;
do $$ begin grant execute on function hr_upload_codes(uuid, text[]) to authenticated; exception when undefined_object then null; end $$;

-- The ONLY place HR sees a person: identified redemptions of its own
-- benefits, each one consented to. Nothing else about the person.
create or replace function hr_identified_redemptions() returns json
  language sql stable security definer set search_path = public as $$
  with co as (select gam_hr_company('benefits') as id)
  select coalesce(json_agg(json_build_object(
           'id', r.id, 'benefit', b.title, 'name', r.identified_name, 'employeeNumber', r.identified_employee_number,
           'consentedAt', r.consent_identified_at, 'status', r.status)
         order by r.created_at desc), '[]'::json)
    from benefit_redemptions r join benefits b on b.id = r.benefit_id, co
   where b.company_id = co.id and b.delivery_type = 'identified' and r.consent_identified_at is not null
$$;
revoke all on function hr_identified_redemptions() from public;
do $$ begin grant execute on function hr_identified_redemptions() to authenticated; exception when undefined_object then null; end $$;

-- Redemption, now with what an identified one shares. The employee confirms
-- their employee number on the consent step; their name comes from their
-- profile. Both are copied onto the redemption at that moment.
drop function if exists redeem_benefit(uuid, boolean);
create or replace function redeem_benefit(p_benefit uuid, p_consent_identified boolean default false, p_employee_number text default null) returns json
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile();
  b benefits%rowtype;
  v_balance int;
  v_price int;
  v_red uuid := gen_random_uuid();
  v_code_id uuid;
  v_code text;
  v_expires timestamptz;
  v_used int;
begin
  if me is null then raise exception 'not signed in' using errcode = 'P0001', hint = 'NOT_SIGNED_IN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gam:wallet:' || me::text, 0));

  select * into b from benefits where id = p_benefit for update;
  if not found or not gam_benefit_available(me, p_benefit) then
    raise exception 'benefit not available' using errcode = 'P0001', hint = 'BENEFIT_UNAVAILABLE';
  end if;
  select count(*) into v_used from benefit_redemptions where user_id = me and benefit_id = b.id and status = 'active';
  if v_used >= b.per_user_limit then
    raise exception 'already redeemed' using errcode = 'P0001', hint = 'BENEFIT_LIMIT';
  end if;
  if b.delivery_type = 'identified' and (not coalesce(p_consent_identified, false)
       or (b.company_id is not null and length(trim(coalesce(p_employee_number, ''))) = 0)) then
    raise exception 'consent to be identified is required' using errcode = 'P0001', hint = 'BENEFIT_NEEDS_CONSENT';
  end if;

  v_price := coalesce(b.price_loops_centi, 0);
  select coalesce(sum(amount_centi), 0) into v_balance from loops_ledger where user_id = me;
  if v_balance < v_price then
    raise exception 'not enough Loops' using errcode = 'P0001', hint = 'BENEFIT_BALANCE';
  end if;

  if b.stock_remaining is not null and b.delivery_type <> 'collective' then
    if b.stock_remaining <= 0 then
      raise exception 'no longer available' using errcode = 'P0001', hint = 'BENEFIT_STOCK';
    end if;
    update benefits set stock_remaining = stock_remaining - 1, updated_at = now() where id = b.id;
  end if;

  if b.code_validity_days is not null then v_expires := now() + make_interval(days => b.code_validity_days); end if;
  if b.valid_to is not null and (v_expires is null or b.valid_to < v_expires) then v_expires := b.valid_to; end if;

  insert into benefit_redemptions (id, user_id, benefit_id, loops_spent_centi, status, consent_identified_at, expires_at,
                                   identified_name, identified_employee_number)
  values (v_red, me, b.id, v_price, 'active',
          case when b.delivery_type = 'identified' then now() end, v_expires,
          case when b.delivery_type = 'identified' then (select name from profiles where id = me) end,
          case when b.delivery_type = 'identified' then nullif(trim(p_employee_number), '') end);

  if b.delivery_type = 'code_pool' then
    select id, code into v_code_id, v_code from benefit_codes
     where benefit_id = b.id and assigned_at is null
     order by seq
     limit 1
     for update skip locked;
    if v_code_id is null then
      raise exception 'no code left' using errcode = 'P0001', hint = 'BENEFIT_STOCK';
    end if;
    update benefit_codes set redemption_id = v_red, assigned_at = now() where id = v_code_id;
    update benefit_redemptions set code_id = v_code_id where id = v_red;
  elsif b.delivery_type = 'static_code' then
    v_code := b.static_code;
  end if;

  if v_price > 0 then
    insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, source_type, source_id)
    values (me, 'redemption', -v_price, 'goodloop', 'redemption', v_red::text);
  end if;

  return json_build_object('redemptionId', v_red, 'code', v_code, 'link', b.link_url,
                           'expiresAt', v_expires, 'loopsSpentCenti', v_price);
end $$;
revoke all on function redeem_benefit(uuid, boolean, text) from public;
do $$ begin grant execute on function redeem_benefit(uuid, boolean, text) to authenticated; exception when undefined_object then null; end $$;

-- What the employee is shown before consenting: exactly what will be shared.
create or replace function get_identified_preview() returns json
  language sql stable security definer set search_path = public as $$
  select json_build_object('name', p.name, 'companyName', (select c.name from companies c where c.id = p.company_id))
    from profiles p where p.id = current_profile()
$$;
revoke all on function get_identified_preview() from public;
do $$ begin grant execute on function get_identified_preview() to authenticated; exception when undefined_object then null; end $$;

-- ---- c) Desafios da empresa — from templates only (SPN-06, PLAN A4) -------------------
create table if not exists challenge_templates (
  slug               text primary key,
  title              text not null,
  description        text not null,
  badge_icon         text not null default 'flag',
  format             challenge_format not null,
  metric             challenge_metric not null,
  goal_value         numeric not null check (goal_value > 0),
  goal_kind          challenge_goal_kind not null default 'total',
  per_person_min     numeric,
  window_start_hour  int,
  window_end_hour    int,
  default_days       int not null default 30 check (default_days between 1 and 92),
  active             boolean not null default true,
  sort_order         int not null default 0
);
-- First set, written now; the founders will refine it (PLAN A4).
insert into challenge_templates (slug, title, description, badge_icon, format, metric, goal_value, goal_kind, per_person_min, window_start_hour, window_end_hour, default_days, sort_order) values
  ('boas_vindas', 'Boas-vindas', 'Três sessões no primeiro mês, para conhecer o seu ritmo.', 'spark',
   'individual', 'sessions_completed', 3, 'total', null, null, null, 30, 10),
  ('sono_em_dia', 'Sono em dia', 'Cinco sessões depois das 21h, para chegar à cama mais calmo.', 'moon',
   'individual', 'sessions_in_time_window', 5, 'total', null, 21, 24, 30, 20),
  ('pausa_consciente', 'Pausa consciente', 'Cinco pausas no meio do dia, entre 12h e 14h.', 'sun',
   'individual', 'sessions_in_time_window', 5, 'total', null, 12, 14, 30, 30),
  ('empresa_em_sintonia', 'Empresa em sintonia', 'A empresa inteira, junta: 60% de nós com três sessões ou mais no mês.', 'building',
   'collective', 'sessions_completed', 60, 'share_reaching_min', 3, null, null, 30, 40)
on conflict (slug) do nothing;
alter table challenge_templates enable row level security;
drop policy if exists challenge_templates_read on challenge_templates;
create policy challenge_templates_read on challenge_templates for select using (auth.uid() is not null);
drop policy if exists challenge_templates_admin on challenge_templates;
create policy challenge_templates_admin on challenge_templates for all using (is_admin()) with check (is_admin());

-- HR picks a template, the dates, the reward (company bonus Loops and/or one
-- of the company's own benefits) and, within the template, the goal. The
-- title and description are the template's: no free text reaches employees.
create or replace function hr_save_company_challenge(p jsonb) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_co text := gam_hr_company('challenges');
  tp challenge_templates%rowtype;
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
begin
  select * into tp from challenge_templates where slug = p->>'templateSlug' and active;
  if not found then raise exception 'choose a template' using errcode = 'P0001', hint = 'CHALLENGE_TEMPLATE'; end if;
  if exists (select 1 from challenges where id = v_id and (company_id is distinct from v_co or status not in ('draft', 'scheduled'))) then
    raise exception 'not editable' using errcode = 'P0001', hint = 'CHALLENGE_LIVE';
  end if;
  if nullif(p->>'rewardBenefitId', '') is not null
     and not exists (select 1 from benefits where id = (p->>'rewardBenefitId')::uuid and company_id = v_co) then
    raise exception 'the reward must be one of your company''s benefits' using errcode = 'P0001', hint = 'CHALLENGE_REWARD';
  end if;
  insert into challenges (id, company_id, title, description, badge_icon, format, scope, scope_ref, metric, goal_value, goal_kind,
                          per_person_min, window_start_hour, window_end_hour, starts_at, ends_at, status,
                          reward_bonus_loops_centi, reward_benefit_id, reward_rule_when_out_of_stock, announce_in_app,
                          template_slug, created_by)
  values (v_id, v_co, tp.title, tp.description, tp.badge_icon, tp.format, 'company', v_co, tp.metric,
          coalesce((p->>'goalValue')::numeric, tp.goal_value), tp.goal_kind,
          coalesce((p->>'perPersonMin')::numeric, tp.per_person_min), tp.window_start_hour, tp.window_end_hour,
          (p->>'startsAt')::timestamptz, (p->>'endsAt')::timestamptz, 'draft',
          (p->>'rewardBonusLoopsCenti')::int, nullif(p->>'rewardBenefitId', '')::uuid,
          coalesce((p->>'rewardRule')::challenge_stock_rule, 'first_to_complete'), true, tp.slug, current_profile())
  on conflict (id) do update set
    goal_value = excluded.goal_value, per_person_min = excluded.per_person_min,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    reward_bonus_loops_centi = excluded.reward_bonus_loops_centi, reward_benefit_id = excluded.reward_benefit_id,
    reward_rule_when_out_of_stock = excluded.reward_rule_when_out_of_stock;
  update benefits set challenge_exclusive_id = v_id
   where id = nullif(p->>'rewardBenefitId', '')::uuid and company_id = v_co and price_loops_centi is null;
  return v_id;
end $$;
revoke all on function hr_save_company_challenge(jsonb) from public;
do $$ begin grant execute on function hr_save_company_challenge(jsonb) to authenticated; exception when undefined_object then null; end $$;

create or replace function hr_company_challenge_action(p_id uuid, p_action text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_co text := gam_hr_company('challenges');
  c challenges%rowtype;
begin
  select * into c from challenges where id = p_id and company_id = v_co for update;
  if not found then raise exception 'not your company''s challenge' using errcode = 'P0001', hint = 'HR_ONLY'; end if;
  if p_action = 'publish' then
    if c.status <> 'draft' then raise exception 'already published' using errcode = 'P0001', hint = 'CHALLENGE_LIVE'; end if;
    if c.ends_at <= now() then raise exception 'dates' using errcode = 'P0001', hint = 'CHALLENGE_DATES'; end if;
    if c.reward_bonus_loops_centi is null and c.reward_benefit_id is null then
      raise exception 'a challenge needs a reward' using errcode = 'P0001', hint = 'CHALLENGE_REWARD';
    end if;
    update challenges set status = case when starts_at > now() then 'scheduled'::challenge_status else 'active'::challenge_status end,
                          published_at = now() where id = p_id;
  elsif p_action = 'end' then
    update challenges set ends_at = least(ends_at, now()) where id = p_id and status in ('scheduled', 'active');
    perform settle_challenges();
  elsif p_action = 'cancel' then
    update challenges set status = 'cancelled' where id = p_id and status in ('draft', 'scheduled', 'active');
  else
    raise exception 'unknown action %', p_action;
  end if;
end $$;
revoke all on function hr_company_challenge_action(uuid, text) from public;
do $$ begin grant execute on function hr_company_challenge_action(uuid, text) to authenticated; exception when undefined_object then null; end $$;

-- ---- d) the HR dashboard — company-wide aggregates only -------------------------------
-- A cell is shown only if the people it counts AND its complement (the
-- eligible people it does not count) are both at least k, so neither the
-- figure nor "the rest" can single anyone out by subtraction (SPN-02).
create or replace function gam_k_cell(p_count bigint, p_population bigint, p_k int) returns bigint
  language sql immutable as $$
  select case when p_count < p_k or (p_population - p_count) between 1 and p_k - 1 then null else p_count end
$$;

create or replace function hr_addon_dashboard() returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  v_co text := gam_hr_company(null);
  k int := (select hr_min_cohort from economy_settings where id);
  v_month date := date_trunc('month', gam_sp_day(now()))::date;
  v_eligible bigint;
  v_mult_people bigint;
  v_mult_centi bigint;
  v_red bigint;
  v_cards json;
begin
  select count(distinct user_id) into v_eligible from company_affiliations where company_id = v_co and ended_at is null;
  select count(distinct user_id), coalesce(sum(amount_centi), 0) into v_mult_people, v_mult_centi
    from loops_ledger where company_id = v_co and entry_type = 'earn_company_multiplier' and created_at >= v_month;
  select count(*) into v_red
    from benefit_redemptions r join benefits b on b.id = r.benefit_id
   where b.company_id = v_co and r.status = 'active' and r.created_at >= v_month;

  select coalesce(json_agg(json_build_object(
           'id', c.id, 'title', c.title, 'status', c.status, 'templateSlug', c.template_slug,
           'startsAt', c.starts_at, 'endsAt', c.ends_at, 'format', c.format, 'goalKind', c.goal_kind,
           'goalValue', c.goal_value, 'perPersonMin', c.per_person_min,
           'rewardBonusLoopsCenti', c.reward_bonus_loops_centi, 'rewardBenefitId', c.reward_benefit_id,
           -- adhesion: who took part, as a share of the whole company, k-guarded
           'adhesionPct', case when v_eligible >= k and gam_k_cell(x.took_part, v_eligible, k) is not null
                               then round(100.0 * x.took_part / v_eligible) end,
           'completedPct', case when v_eligible >= k and gam_k_cell(x.completed, v_eligible, k) is not null
                                then round(100.0 * x.completed / v_eligible) end,
           'collectivePct', case when c.goal_kind = 'share_reaching_min' and v_eligible >= k then gam_collective_value(c) end,
           'goalReached', c.goal_reached_at is not null)
         order by c.starts_at desc), '[]'::json)
    into v_cards
    from challenges c
    cross join lateral (
      select count(*) filter (where p.progress_value > 0) as took_part,
             count(*) filter (where p.completed_at is not null) as completed
        from challenge_participation p where p.challenge_id = c.id) x
   where c.company_id = v_co and c.status <> 'cancelled';

  return json_build_object(
    'minCohort', k,
    'eligible', case when v_eligible >= k then v_eligible end,
    'activeChallenges', (select count(*) from challenges where company_id = v_co and status = 'active'),
    'multiplierLoopsMonth', case when v_mult_people >= k then floor(v_mult_centi / 100) end,
    'redemptionsMonth', gam_k_cell(v_red, greatest(v_red, v_eligible), k),
    'challenges', v_cards);
end $$;
revoke all on function hr_addon_dashboard() from public;
do $$ begin grant execute on function hr_addon_dashboard() to authenticated; exception when undefined_object then null; end $$;

-- ---- Admin › Piani e aziende: assign, change, end a subscription ------------------------
create or replace function admin_set_company_plan(p_company text, p_plan text, p_starts timestamptz default now()) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  update company_addon_subscriptions set status = 'ended', ends_at = greatest(starts_at + interval '1 second', p_starts)
   where company_id = p_company and status = 'active' and (ends_at is null or ends_at > p_starts);
  if p_plan is not null then
    insert into company_addon_subscriptions (company_id, plan_id, starts_at, created_by) values (p_company, p_plan, p_starts, current_profile());
  end if;
end $$;
revoke all on function admin_set_company_plan(text, text, timestamptz) from public;
do $$ begin grant execute on function admin_set_company_plan(text, text, timestamptz) to authenticated; exception when undefined_object then null; end $$;

-- ============================================================================
-- GAMIFICATION · 7 — ADMIN REPORTS                 (docs/gamification/SPEC.md §8)
--
-- The same block is supabase/22-gamification-reports.sql, for a live database. Needs 16 to 21.
--
-- Totals for the Good Loop team, admin only: Points and Loops issued by
-- source and by who pays, Loops redeemed, redemptions per benefit, Loops a
-- company's multiplier issued per month (what Good Loop bills it for), and
-- how each challenge ended. Counts and sums only — no person in any row.
-- ============================================================================

create or replace function admin_gamification_report(p_from date, p_to date) returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := (p_from::timestamp at time zone 'America/Sao_Paulo');
  v_to   timestamptz := ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo');
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return json_build_object(
    'from', p_from, 'to', p_to,
    'pointsIssued', coalesce((select sum(points) from points_ledger where created_at >= v_from and created_at < v_to), 0),
    'loopsBySource', coalesce((
      select json_agg(json_build_object('entryType', entry_type, 'fundingSource', funding_source, 'centi', centi, 'entries', n) order by entry_type, funding_source)
        from (select entry_type, funding_source, sum(amount_centi) as centi, count(*) as n
                from loops_ledger where created_at >= v_from and created_at < v_to
               group by entry_type, funding_source) x), '[]'::json),
    'redemptionsByBenefit', coalesce((
      select json_agg(json_build_object('benefitId', b.id, 'title', b.title, 'companyId', b.company_id,
                                        'redemptions', x.n, 'refunded', x.refunded, 'loopsCenti', x.centi) order by x.n desc)
        from (select benefit_id, count(*) filter (where status = 'active') as n, count(*) filter (where status = 'refunded') as refunded,
                     sum(loops_spent_centi) filter (where status = 'active') as centi
                from benefit_redemptions where created_at >= v_from and created_at < v_to group by benefit_id) x
        join benefits b on b.id = x.benefit_id), '[]'::json),
    'multiplierByCompanyMonth', coalesce((
      select json_agg(json_build_object('companyId', x.company_id, 'companyName', c.name, 'month', x.month,
                                        'loopsCenti', x.centi, 'people', x.people) order by x.month, c.name)
        from (select company_id, date_trunc('month', gam_sp_day(created_at))::date as month,
                     sum(amount_centi) as centi, count(distinct user_id) as people
                from loops_ledger
               where entry_type = 'earn_company_multiplier' and created_at >= v_from and created_at < v_to and company_id is not null
               group by company_id, date_trunc('month', gam_sp_day(created_at))) x
        join companies c on c.id = x.company_id), '[]'::json),
    'challengeResults', coalesce((
      select json_agg(json_build_object('id', ch.id, 'title', ch.title, 'companyId', ch.company_id, 'status', ch.status,
                                        'startsAt', ch.starts_at, 'endsAt', ch.ends_at,
                                        'participants', (select count(*) from challenge_participation p where p.challenge_id = ch.id and p.progress_value > 0),
                                        'completed', (select count(*) from challenge_participation p where p.challenge_id = ch.id and p.completed_at is not null),
                                        'rewarded', (select count(*) from challenge_participation p where p.challenge_id = ch.id and p.rewarded_at is not null),
                                        'bonusCenti', (select coalesce(sum(amount_centi), 0) from loops_ledger l where l.entry_type = 'challenge_bonus' and l.source_id = ch.id::text))
             order by ch.starts_at desc)
        from challenges ch where ch.starts_at < v_to and ch.ends_at >= v_from and ch.status <> 'draft'), '[]'::json)
  );
end $$;
revoke all on function admin_gamification_report(date, date) from public;
do $$ begin grant execute on function admin_gamification_report(date, date) to authenticated; exception when undefined_object then null; end $$;

-- ============================================================================
-- PROTOCOLS — who may read which catalogue rows
--
-- The same block is supabase/23-protocols-read-scope.sql, for a live database.
--
-- The catalogue used to be readable in full by anyone signed in: disabled
-- protocols, clinical titles, studio sessions and audio URLs reached every
-- person's browser, and the app hid them on the client. A protocol scoped
-- to one company (`tenants`) was readable by — and listed for — everyone.
--
-- Now the database decides:
--   admins          every row (the console, the Studio, the preview)
--   approved        every row (the workspace prescribes from the full
--   therapists      catalogue, disabled ones included in their history)
--   everyone else   ENABLED rows whose `tenants` is "all" or includes their
--                   own company. The clinical-only codes stay readable to a
--                   patient: their therapist plays them in a led session.
-- ============================================================================

drop policy if exists protocols_read_all on protocols;
create policy protocols_read_all on protocols
  for select using (
    is_admin()
    or is_approved_therapist()
    or (auth.uid() is not null
        and enabled
        and (tenants = '"all"'::jsonb or tenants ? coalesce(my_company_id(), '')))
  );

-- PostgREST schema-cache reload. Supabase's API layer caches the table schema;
-- after the ALTERs above (protocols.plain, asset_meta) a stale cache yields
-- "Could not find the 'plain' column of 'protocols' in the schema cache" on
-- the first Publish. This notify forces the reload immediately — no waiting,
-- no project restart. Safe to re-run.
notify pgrst, 'reload schema';
