-- ============================================================================
-- GOOD LOOP — data model (Postgres / Supabase)
-- Derived 1:1 from the TypeScript domain types so screens can flip from the
-- mock provider to a real backend without changing the UI. Table/column names
-- mirror src/types/domain.ts and src/b2b/data.ts.
--
-- This is the target schema for the closed beta / pilot. RLS policies at the
-- bottom encode the access model from the 08 UX spec (see ACCESS_MATRIX.md):
--   B2C user  → only their own rows
--   Therapist → only THEIR patients (and those patients' clinical data)
--   Admin/HR  → anonymized aggregates only (via views, never base PII)
-- ============================================================================

create extension if not exists "pgcrypto";

-- --- roles & identity ------------------------------------------------------
create type user_role as enum ('b2c_user', 'therapist', 'admin');

-- One profile per human; a B2C user who is also a patient shares this profile
-- (single account across both products, per the spec).
create table profiles (
  id          uuid primary key default gen_random_uuid(),
  auth_uid    uuid unique,                 -- maps to Supabase auth.users.id
  role        user_role not null,
  name        text not null,
  locale      text not null default 'pt-BR',
  created_at  timestamptz not null default now()
);

create type therapist_status as enum ('pending', 'approved', 'rejected');

create table therapists (
  id            uuid primary key references profiles(id) on delete cascade,
  crp           text not null,             -- CRP/CFP registration
  status        therapist_status not null default 'pending',
  approved_at   timestamptz,
  decision_log  jsonb not null default '[]'  -- approval history (UC-B2B-01)
);

-- --- patients & clinical record -------------------------------------------
create table patients (
  id                uuid primary key default gen_random_uuid(),
  therapist_id      uuid not null references therapists(id) on delete restrict,
  b2c_profile_id    uuid references profiles(id),   -- B2C↔B2B bridge (nullable)
  name              text not null,
  age               int,
  sex               char(1),
  reason            text,
  conditions        text[] not null default '{}',
  medications       text[] not null default '{}',
  contraindications text[] not null default '{}',
  clinical_notes    text,                  -- therapist-only (RLS below)
  prescription      text,
  created_at        timestamptz not null default now()
);

create type consent_kind   as enum ('therapy', 'sharing', 'aggregates');
create table patient_consents (             -- 3 granular LGPD consents, timestamped
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  kind        consent_kind not null,
  granted     boolean not null,
  at          timestamptz not null default now(),
  unique (patient_id, kind)
);

create type goal_status as enum ('achieved', 'in-progress', 'review');
create table goals (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  text        text not null,
  status      goal_status not null default 'in-progress',
  created_at  timestamptz not null default now()
);

-- Assessment instruments tracked across T0/T1/T2 (DASS-21, PSS-10, BRS, CBI…).
create table scores (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references patients(id) on delete cascade,
  instrument      text not null,
  max             numeric not null,
  lower_is_better boolean not null default true,
  t0 numeric, t1 numeric, t2 numeric,
  captured_at     timestamptz not null default now()
);

-- --- sessions (unifies B2C SessionRecord and B2B B2bSession) ---------------
create type session_kind as enum ('b2c', 'b2b');
create table sessions (
  id            uuid primary key default gen_random_uuid(),
  kind          session_kind not null,
  patient_id    uuid references patients(id) on delete cascade,   -- b2b
  b2c_profile_id uuid references profiles(id),                    -- b2c
  therapist_id  uuid references therapists(id),                   -- b2b
  protocol_code text not null,
  duration_min  int not null,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  vas_pre       numeric,   -- 0..10 (the hidden VAS; never surfaced as a number)
  vas_post      numeric,
  intervened    boolean not null default false,
  completed     boolean not null default true
);

-- Timestamped rapid notes captured during a monitored session (UC-B2B-08).
create table rapid_notes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  phase       int not null,
  at_seconds  int not null,
  text        text not null
);

create type message_from as enum ('patient', 'therapist');
create table messages (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  sender      message_from not null,
  body        text not null,            -- char-limited at the app layer
  at          timestamptz not null default now(),
  read        boolean not null default false
);

-- Signed session report (UC-B2B-14). Body is the rendered report payload.
create table reports (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  therapist_id  uuid not null references therapists(id),
  body          jsonb not null,
  signed_by_crp text,                   -- evidentiary CRP signature
  signed_at     timestamptz
);

-- Immutable, append-only clinical/telemetry events — the NR-1/PGR audit trail.
-- Hash + timestamp give the "immutable record" the compliance layer needs.
create table clinical_events (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null,            -- patient or profile id
  event_type  text not null,           -- 'vas', 'assessment_done', 'session_done'…
  payload     jsonb not null default '{}',
  hash        text not null,
  at          timestamptz not null default now()
);
-- No UPDATE/DELETE grants on clinical_events (enforced via RLS / role grants).

-- ===========================================================================
-- ROW-LEVEL SECURITY (sketch) — the access model lives in the DB, not the UI.
-- ===========================================================================
alter table profiles          enable row level security;
alter table patients          enable row level security;
alter table sessions          enable row level security;
alter table reports           enable row level security;
alter table messages          enable row level security;
alter table goals             enable row level security;
alter table scores            enable row level security;

-- helper: current profile id from the JWT
-- create function current_profile() returns uuid language sql stable as
--   $$ select id from profiles where auth_uid = auth.uid() $$;

-- B2C user: only their own sessions.
create policy b2c_own_sessions on sessions
  for select using (b2c_profile_id = current_profile());

-- Therapist: only sessions for patients they own.
create policy therapist_patient_sessions on sessions
  for all using (
    patient_id in (select id from patients
                   where therapist_id = current_profile())
  );

-- Therapist: only their own patients (incl. clinical_notes column).
create policy therapist_owns_patients on patients
  for all using (therapist_id = current_profile());

-- Admin gets NO base-table access to PII. Aggregates are exposed only through
-- SECURITY DEFINER views that return anonymized, grouped data (NR-1 dashboard):
--   create view nr1_company_aggregates as
--     select company_id, count(*) filter (where ...) as baseline_pct, ...
--   -- with no patient_id / name / session content columns.

-- ===========================================================================
-- ADMIN CONSOLE additions (#admin) — protocol catalog, tenants, users, audit.
-- Appended for the admin panel build. Safe to run on the existing schema
-- (IF NOT EXISTS throughout). Mirrors src/data/catalog.ts + src/admin/types.ts
-- and the queries in src/data/supabase.ts.
-- ===========================================================================

-- widen existing enums (no-op if already present)
alter type user_role       add value if not exists 'hr_admin';
alter type therapist_status add value if not exists 'more_info';

-- --- companies (corporate tenants) ----------------------------------------
-- id is TEXT (matches the client-generated ids, e.g. 'c-abc12') so the app can
-- create a tenant without a round-trip; switch to uuid later if desired.
create table if not exists companies (
  id            text primary key,
  name          text not null,
  seats         int  not null default 0,
  active_users  int  not null default 0,
  status        text not null default 'active',   -- 'active' | 'paused'
  created_at    timestamptz not null default now()
);

-- --- protocol catalog ------------------------------------------------------
-- The single shared catalog every company draws from. Seeded from the static
-- PROTOCOLS; the import pipeline (step 2) inserts rows with source='imported'.
create table if not exists protocols (
  code         text primary key,
  family       text not null,
  title        text not null,
  blurb        text,
  phases       jsonb not null default '[]',
  versions     jsonb not null default '[]',
  enabled      boolean not null default true,
  source       text not null default 'seed',      -- 'seed' | 'imported'
  tenants      jsonb not null default '"all"',     -- '"all"' | ["c-id", ...]
  audio_ready  boolean not null default false,
  updated_at   timestamptz not null default now()
);

-- --- audit trail (append-only) --------------------------------------------
create table if not exists audit_events (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  actor     text not null,
  action    text not null,
  target    text,
  detail    text
);

-- --- columns the admin views read on existing tables ----------------------
alter table profiles   add column if not exists email      text;
alter table profiles   add column if not exists company_id text references companies(id);
alter table profiles   add column if not exists active     boolean not null default true;

alter table therapists add column if not exists created_at    timestamptz not null default now();
alter table therapists add column if not exists review_reason text;
alter table therapists add column if not exists decided_at    timestamptz;

-- --- RLS for the admin surface --------------------------------------------
alter table companies    enable row level security;
alter table protocols    enable row level security;
alter table audit_events enable row level security;

-- helper: is the caller a platform admin?
create or replace function is_admin() returns boolean language sql stable as
  $$ select exists (select 1 from profiles where auth_uid = auth.uid() and role = 'admin') $$;

-- Catalog: readable by any signed-in user (the B2C player and therapist wizard
-- resolve protocols from it); writable by admins only.
create policy protocols_read_all  on protocols    for select using (auth.uid() is not null);
create policy protocols_admin_write on protocols  for all    using (is_admin()) with check (is_admin());

-- Companies, audit, and the admin view of profiles: admins only.
create policy companies_admin     on companies    for all using (is_admin()) with check (is_admin());
create policy audit_admin         on audit_events for all using (is_admin()) with check (is_admin());
create policy profiles_admin_all  on profiles     for all using (is_admin()) with check (is_admin());
-- Therapists table already carries clinical linkage; admins may review credentials:
create policy therapists_admin    on therapists   for all using (is_admin()) with check (is_admin());

-- ===========================================================================
-- EMPLOYER NR-1 psychosocial-risk aggregates (#employer)
-- The HR dashboard NEVER reads employee rows. It calls one SECURITY DEFINER
-- function that aggregates consenting respondents for the caller's company and
-- applies the k-anonymity suppression, returning the report as JSON. HR has no
-- table grants on the source data at all.
-- ===========================================================================

-- Per-respondent psychosocial assessment (source of the aggregates). Populated
-- by the employee assessment flow; inclusion is gated on the 'aggregates'
-- consent. One row per respondent per cycle; dims/outcomes are jsonb maps that
-- mirror src/employer/assessment.ts (PsychosocialResponse).
create table if not exists psychosocial_responses (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  company_id  text references companies(id),
  team        text,
  period      text not null,                 -- e.g. 'Q2 2026'
  dims        jsonb not null default '{}',   -- { demands:'high', pace:'moderate', ... }
  outcomes    jsonb not null default '{}',   -- { stress:true, anxiety:false, burnout:false }
  created_at  timestamptz not null default now()
);
alter table psychosocial_responses enable row level security;
-- No SELECT policy for HR: rows are reachable ONLY through the function below.

-- Which company the caller (HR) belongs to.
create or replace function my_company_id() returns text language sql stable as
  $$ select company_id from profiles where auth_uid = auth.uid() $$;

-- The one call the dashboard makes. SECURITY DEFINER so it can read the source
-- rows, but it returns ONLY aggregates for the caller's company, and every team
-- group below k is suppressed. Shape matches src/employer/types.ts (Nr1Report).
-- Body is illustrative; the point is the boundary: no employee row leaves here.
create or replace function nr1_report()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  cid text := my_company_id();
  k   int := 5;
  result jsonb;
begin
  if cid is null then
    raise exception 'no company for caller';
  end if;

  with base as (
    select r.* from psychosocial_responses r
    join patient_consents pc on false  -- placeholder: real join gates on the
                                        -- 'aggregates' consent per respondent
    where r.company_id = cid
  ),
  teams as (
    select team, count(distinct profile_id) as respondents,
           count(*) filter (where band='low') as low,
           count(*) filter (where band='moderate') as moderate,
           count(*) filter (where band='high') as high
    from base group by team
  )
  select jsonb_build_object(
    'company', (select name from companies where id = cid),
    'minCellSize', k,
    -- dimensions, outcomes, overall, trend built with the same grouping...
    'teams', coalesce(jsonb_agg(
      case when t.respondents < k
        then jsonb_build_object('team', t.team, 'respondents', t.respondents, 'suppressed', true)
        else jsonb_build_object('team', t.team, 'respondents', t.respondents, 'suppressed', false,
               'split', jsonb_build_object('low', t.low, 'moderate', t.moderate, 'high', t.high))
      end), '[]'::jsonb)
  ) into result
  from teams t;

  return result;
end;
$$;

revoke all on function nr1_report() from public;
grant execute on function nr1_report() to authenticated;   -- HR calls this; RLS on the caller's role can narrow further

-- ===========================================================================
-- Protocol-document imports: the full parsed audio configuration (timelines,
-- affirmations, binaural/bilateral plans) travels with the catalog entry so a
-- fresh session can render or execute it. Additive; seeds leave it null.
-- ===========================================================================
alter table protocols add column if not exists spec jsonb;
