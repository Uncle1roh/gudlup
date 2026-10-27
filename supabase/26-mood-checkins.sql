-- ============================================================================
-- Good Loop — SCRIPT 26: the emotional check-in
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
-- The same block is in setup.sql; this file is for a database that is live.
--
-- docs/ui-redesign/checkin-emocional-spec.docx, § "Dados a salvar em cada
-- check-in". Ten seconds before and after a session: where the person is on
-- two axes, and the word they chose for it.
--
-- WHAT THIS DATA IS
--
-- Mood is health data — GDPR art. 9, LGPD "dado pessoal sensível". The spec
-- says so and leaves the consent text to a lawyer. Three consequences, all
-- enforced here rather than in the app:
--
--   · a person reads and writes their OWN rows and nothing else;
--   · there is no employer policy, no HR policy and no therapist policy on
--     this table. That is not an omission. An employer who could read these
--     rows would know which of their people felt bad on which Tuesday, and
--     the whole product's privacy boundary (SPN-01..08, NR-1 aggregates with
--     k-anonymity) would be worth nothing;
--   · nothing is written at all unless the person has the measurement
--     consent — the app checks before inserting (src/mood/config.ts), and
--     the policy below checks again, because a client-side rule is a request.
--
-- Note on `session_id`: it is a CORRELATION id minted by the app, not a
-- reference to `sessions`. The "before" check-in happens before the session
-- row exists, so a foreign key would make the honest order impossible.
-- ============================================================================

do $$ begin create type mood_context as enum ('pre_session', 'post_session', 'standalone'); exception when duplicate_object then null; end $$;
do $$ begin create type mood_variant as enum ('color', 'no_color'); exception when duplicate_object then null; end $$;

create table if not exists mood_checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  context       mood_context not null,
  -- ties the before and the after of one session together
  session_id    uuid,
  protocol_code text,
  -- the two axes, −1 … +1, two decimals (spec § Especificações técnicas)
  valence       numeric(3,2) not null check (valence between -1 and 1),
  arousal       numeric(3,2) not null check (arousal between -1 and 1),
  -- the word they chose; null when they skipped it, which is allowed and
  -- counted (the pilot measures how often it is chosen)
  label_id      text,
  locale        text not null,
  -- the colour they actually saw, for analysis
  color_oklch   text not null,
  variant       mood_variant not null default 'color'
);

create index if not exists mood_checkins_mine on mood_checkins (user_id, created_at desc);
create index if not exists mood_checkins_session on mood_checkins (session_id) where session_id is not null;

alter table mood_checkins enable row level security;

-- Their own rows. Both directions, and nothing else anywhere in this file.
drop policy if exists mood_own_read on mood_checkins;
create policy mood_own_read on mood_checkins
  for select using (user_id = current_profile());

-- Whether the caller's LATEST answer on a purpose is yes. SECURITY DEFINER
-- so a policy can ask it without the caller needing to read the consent
-- log, and so the answer cannot depend on which grants an install happens
-- to have. Withdrawing consent is a new event, which is why this reads the
-- most recent one rather than "any granted".
create or replace function has_consent(p_purpose text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.granted
      from consent_events c
     where c.profile_id = current_profile() and c.purpose = p_purpose
     order by c.at desc
     limit 1), false)
$$;
revoke all on function has_consent(text) from public;
grant execute on function has_consent(text) to authenticated;

-- The insert carries the consent check as well as the ownership one: an
-- app build that forgot to ask still cannot write.
drop policy if exists mood_own_insert on mood_checkins;
create policy mood_own_insert on mood_checkins
  for insert with check (user_id = current_profile() and has_consent('measurement'));

-- A check-in is a fact about a moment. It is not edited, and a row that
-- could be rewritten would make the before/after comparison worthless.
-- Deleting is a different matter: an account erasure (DAT-06) takes these
-- with the profile, through the cascade above.

-- Which arm of the colour pilot a person is in, kept so the two groups stay
-- two groups across devices. Null until the pilot is switched on in the app
-- (AB_PILOT_ENABLED in src/mood/config.ts), and everybody sees the colour.
alter table profiles add column if not exists mood_variant mood_variant;

notify pgrst, 'reload schema';
