-- ============================================================================
-- Good Loop — SCRIPT 40: a person's own settings follow their account
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
--   "I keep on receiving the Introductory Wizard even when I log in to a
--    previously created User account."
--
-- The three first-run cards are shown until `tutorialSeenAt` is set, and
-- that lived in `localStorage` under `gl.selfuse.<id>`. So it was true per
-- BROWSER, not per account: a second device, a cleared cache, a private
-- window, and the app introduces itself again to somebody who has been
-- using it for weeks.
--
-- Same shape as the company's settings (supabase/39): one row, one jsonb
-- object, the device keeps a cache so the app still paints instantly.
--
-- ---------------------------------------------------------------------------
-- WHAT IS IN IT, AND WHAT IS DELIBERATELY NOT
--
-- IN: what a person has ANSWERED or CHOSEN, and what it costs to ask again —
--
--   tutorialSeenAt   the three cards, seen once
--   addressedAs      'sei pronto' or 'sei pronta': which recording they
--                    hear. Losing it re-asks a question they answered, and
--                    picks the audio by default in the meantime
--   saved            the list they made themselves
--   prefs            default length, preferred time, audio quality
--   notifications    the reminder switches
--   intake           the three answers behind their pathway
--   companyCode      the code on the account
--
-- NOT IN: their HISTORY. Sessions listened, pathway progress, weekly
-- check-ins, WHO-5. Those are records rather than settings, some of them
-- feed a professional's view, and what of a person's history lives on a
-- server is a decision to make deliberately and not as a side effect of
-- fixing a wizard. The mood calendar already went up on its own terms
-- (supabase/32-mood-readings.sql), with its own table and its own reason.
--
-- Also not in: anything anybody else may read. One row, one owner, one
-- policy — not a therapist, not an employer, not an admin.
-- ============================================================================

create table if not exists person_settings (
  profile_id uuid primary key references profiles(id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table person_settings enable row level security;

-- Theirs, and nobody else's. Not even an admin: there is nothing in here
-- that support could need and the person could not read out themselves.
drop policy if exists person_settings_own on person_settings;
create policy person_settings_own on person_settings
  for all
  using (profile_id = current_profile())
  with check (profile_id = current_profile());

-- ---------------------------------------------------------------------------
-- Tell PostgREST the shape changed
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- Should print the three columns.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'person_settings'
order by ordinal_position;
