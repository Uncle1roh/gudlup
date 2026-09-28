-- ============================================================================
-- Good Loop — SCRIPT 11: legal framework (v5, Path A)
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- The same block is in setup.sql; this file is for a database that is already
-- live and only needs the legal framework added. It implements the data side
-- of GoodLoop_MVP_Legal_Feature_Register_v5_PathA.xlsx: age and market on the
-- profile (ONB-01/03/04), versioned acceptances and a consent history
-- (LEG-01/02/04, ADM-07), data-subject requests with a 15-day clock (DAT-01,
-- DAT-04), the notice-and-action and complaints queues (ADM-04/05), the legal
-- text version register (ADM-06), crisis resources as configuration with a
-- last-verified date (CRS-03), the content tier and claims-gate record on a
-- protocol (ADM-02/03), the professional's attestation, insurance, terms and
-- consent template (M2R-03/04/05/06), the informed-consent gate (M2P-04), the
-- lobby location (M2P-06) and account deletion (DAT-06).
-- ============================================================================

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

notify pgrst, 'reload schema';
