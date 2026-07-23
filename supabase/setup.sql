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
-- 6. Catalog seed — the 5 launch protocols (same as src/data/protocols.ts),
--    so the app has content on a fresh project. Idempotent.
-- ---------------------------------------------------------------------------
insert into protocols (code, family, title, blurb, phases, versions, source) values
  ('GL-ANX 1.1',    'GL-ANX',    'Calm and Inner Safety',       'Settle a racing mind and find a steady sense of safety.',
   '[{"id":1,"name":"Intro + Validation","fraction":0.11},{"id":2,"name":"Breath + Body Scan","fraction":0.16,"showOrb":true},{"id":3,"name":"Exploration","fraction":0.16},{"id":4,"name":"Processing","fraction":0.38},{"id":5,"name":"Integration","fraction":0.10},{"id":6,"name":"Outro + Grounding","fraction":0.09}]',
   '[{"duration":6},{"duration":12},{"duration":24}]', 'seed'),
  ('GL-STRESS 4.1', 'GL-STRESS', 'Calm and Focus',              'Quiet a crowded mind and gather your attention.',
   '[{"id":1,"name":"Intro + Validation","fraction":0.11},{"id":2,"name":"Breath + Body Scan","fraction":0.16,"showOrb":true},{"id":3,"name":"Exploration","fraction":0.16},{"id":4,"name":"Processing","fraction":0.38},{"id":5,"name":"Integration","fraction":0.10},{"id":6,"name":"Outro + Grounding","fraction":0.09}]',
   '[{"duration":6},{"duration":12},{"duration":24}]', 'seed'),
  ('GL-DEP 2.4',    'GL-DEP',    'Vital Energy and Motivation', 'Reconnect with a gentle sense of momentum and warmth.',
   '[{"id":1,"name":"Intro + Validation","fraction":0.11},{"id":2,"name":"Breath + Body Scan","fraction":0.16,"showOrb":true},{"id":3,"name":"Exploration","fraction":0.16},{"id":4,"name":"Processing","fraction":0.38},{"id":5,"name":"Integration","fraction":0.10},{"id":6,"name":"Outro + Grounding","fraction":0.09}]',
   '[{"duration":6},{"duration":12},{"duration":24}]', 'seed'),
  ('GL-BURN 3.1',   'GL-BURN',   'Rest and Recovery',           'Step out of overdrive and let your system recover.',
   '[{"id":1,"name":"Intro + Validation","fraction":0.11},{"id":2,"name":"Breath + Body Scan","fraction":0.16,"showOrb":true},{"id":3,"name":"Exploration","fraction":0.16},{"id":4,"name":"Processing","fraction":0.38},{"id":5,"name":"Integration","fraction":0.10},{"id":6,"name":"Outro + Grounding","fraction":0.09}]',
   '[{"duration":6},{"duration":12},{"duration":24}]', 'seed'),
  ('GL-RESIL 5.1',  'GL-RESIL',  'Steadiness and Strength',     'Build a calm, resilient baseline you can return to.',
   '[{"id":1,"name":"Intro + Validation","fraction":0.11},{"id":2,"name":"Breath + Body Scan","fraction":0.16,"showOrb":true},{"id":3,"name":"Exploration","fraction":0.16},{"id":4,"name":"Processing","fraction":0.38},{"id":5,"name":"Integration","fraction":0.10},{"id":6,"name":"Outro + Grounding","fraction":0.09}]',
   '[{"duration":6},{"duration":12},{"duration":24}]', 'seed')
on conflict (code) do nothing;


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
  end if;
end $$;
