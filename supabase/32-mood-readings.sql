-- ============================================================================
-- Good Loop — SCRIPT 32: the mood calendar gets a memory
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- The glasses beside the Loops chip open a month of squares, each one filled
-- with the colour of the two sliders the person moved at the end of a
-- session. End-to-end testing reported that the previous days were empty for
-- every account, and the reason was not the grid and not the colours: the
-- ONLY copy of those readings was `localStorage`.
--
-- So the history lasted exactly as long as one browser profile on one
-- device. Clear the site data, reinstall the app, open it on a phone after a
-- laptop, or simply sign in somewhere else, and a person was shown an empty
-- month — which does not say "we lost this", it says "you never answered".
-- A calendar IS a history; the whole point of it is the days before today.
--
-- This is the same move the assessment queue already made: `localStorage`
-- stops being the store and becomes a cache, so the first paint is instant
-- and a lost connection does not blank the month, while the record itself
-- lives where clearing a browser cannot reach it.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS NOT
--
-- It is not a clinical record and it is not scored. Nothing interprets these
-- numbers, nothing compares them to a threshold, and nobody but the person
-- can read them: not a therapist, not an employer, not a company report.
-- That is one policy below and no second one, deliberately — the session
-- VAS already travels to a professional through `assessments`, by its own
-- rules and with its own consent, and this table is not a second channel for
-- the same thing.
--
-- Nor is it append-only, which `assessments` is. A frozen assessment is
-- evidence; a square on your own calendar is not, and a person who asks for
-- their data to be erased (DAT-08) must get it erased. Hence a plain delete
-- and the cascade on the profile.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table if not exists mood_readings (
  -- WHO. Row-level security scopes on this and nothing else.
  owner_profile uuid not null references profiles(id) on delete cascade,

  -- WHEN, to the millisecond the person let go of the slider. This is the
  -- identity of a reading: one answer, at one moment, by one person. It is
  -- why the key is composite and why re-sending a reading is a no-op rather
  -- than a duplicate square.
  at            timestamptz not null,

  -- The calendar day the square belongs to, as the DEVICE computed it
  -- ('YYYY-MM-DD'). Stored rather than derived, because the day a person
  -- means is the day in their own timezone, and the server has no business
  -- guessing it: a session finished at 00:30 in Rome belongs to that date in
  -- Rome, not to the one UTC is still on.
  day           text not null,

  -- 1..5 on the MOOD axis, derived from `valence`. Kept as its own column
  -- because three things read it and none of them should have to know about
  -- the two axes: the square's shade, the monthly PDF, and the three buckets
  -- (positive / neutral / negative) a company aggregate is ever allowed.
  level         smallint not null check (level between 1 and 5),

  -- The reading itself, -1.00 .. 1.00 on each axis. Nullable because the
  -- five-emoji check-in this replaced carried only a level, and those rows
  -- are still legible: `entryColor` places them on the mood axis with the
  -- energy axis unknown.
  valence       numeric(4,2) check (valence is null or valence between -1 and 1),
  arousal       numeric(4,2) check (arousal is null or arousal between -1 and 1),

  -- Up to 200 characters the person may add. Optional, and never read by
  -- anybody else.
  note          text check (note is null or char_length(note) <= 200),

  created_at    timestamptz not null default now(),

  primary key (owner_profile, at)
);

-- The calendar asks for one person's readings in time order, always.
create index if not exists mood_readings_owner_idx
  on mood_readings (owner_profile, at desc);

alter table mood_readings enable row level security;

-- ---------------------------------------------------------------------------
-- Who may read and write: the person, their own rows, and nobody else
-- ---------------------------------------------------------------------------
drop policy if exists mood_readings_own on mood_readings;
create policy mood_readings_own on mood_readings
  for all
  using (owner_profile = current_profile())
  with check (owner_profile = current_profile());

-- ---------------------------------------------------------------------------
-- Tell PostgREST the shape changed
-- ---------------------------------------------------------------------------
-- Without this the API keeps serving the old table list and the app reports
-- a missing relation that plainly exists.
notify pgrst, 'reload schema';

-- Should print the eight columns above.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'mood_readings'
order by ordinal_position;
