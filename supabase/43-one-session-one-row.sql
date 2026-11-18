-- ============================================================================
-- Good Loop — SCRIPT 43: a session cannot be recorded twice
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- `recordSession()` inserts. It sends no id of its own — the row gets a fresh
-- uuid from the database — and there is no constraint saying that one person
-- cannot have two sessions of the same protocol starting at the same instant.
-- So nothing but the client's control flow stands between one completed
-- session and two rows for it.
--
-- Today that flow is careful: `finishSession` is called once from `onDone`,
-- it awaits, and a failure is swallowed rather than retried. So this is a
-- GUARD, not a repair of something misbehaving — which is exactly why it is
-- cheap to add now and awkward later:
--
--   · A double row is worth Loops twice (`sessions_credit` fires per row),
--     counts twice towards a challenge, and appears twice in the history a
--     professional reads.
--   · It is invisible. Two identical lines a few hundred milliseconds apart
--     read as a person who played something twice.
--   · The pass criterion the pilot tests is absolute — "Exactly one entry
--     with the right protocol, duration and date. No duplicates after
--     refresh" — and absolute is a job for a constraint, not for a promise
--     about the order in which callbacks fire.
--
-- A retry becomes safe as a side effect: the second insert is refused by the
-- index and the row from the first attempt is the one that stays. The CLIENT
-- has to agree with that, and it did not: `recordSession` threw and no caller
-- caught it, so a refused duplicate left the person stuck on the session
-- screen. That is fixed alongside this script — a 23505 from this index is
-- now read as "already recorded", which is exactly what it means.
--
-- ---------------------------------------------------------------------------
-- WHAT IT DOES NOT COVER, on purpose
--
-- Only `kind = 'b2c'` — a person's own practice, which is the path that has a
-- client sending the write. A clinical session is created by a professional
-- through their own screens and may legitimately repeat a start time (two
-- patients, one slot in the grid is not the only way); constraining that
-- would be a rule about care, invented here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Is there anything already doubled? (read-only)
-- ---------------------------------------------------------------------------
-- Expect no rows. Anything printed here is two records of one session, and
-- the index below cannot be created until they are resolved — so look at
-- this list first.
select b2c_profile_id,
       protocol_code,
       started_at,
       count(*) as rows_for_this_session
  from sessions
 where kind = 'b2c'
   and b2c_profile_id is not null
   and started_at is not null
 group by b2c_profile_id, protocol_code, started_at
having count(*) > 1
 order by count(*) desc, started_at desc;

-- ---------------------------------------------------------------------------
-- 2. The guard
-- ---------------------------------------------------------------------------
-- In a DO block so that existing duplicates produce a sentence you can act
-- on rather than an error that rolls the whole file back. Nothing above this
-- point writes anything, so there is nothing to lose either way.
-- It RAISES rather than notices, and that is the correction to the first
-- version of this file. The SQL editor shows only the last statement's
-- result and does not print `raise notice`: with a notice, a run that created
-- nothing and a run that created the index both ended in "Success. No rows
-- returned", so the one case worth knowing about was the one case invisible.
-- Nothing above this point writes anything, so failing costs nothing but the
-- rollback of a file that had nothing to roll back.
do $$
begin
  if exists (
    select 1 from sessions
     where kind = 'b2c' and b2c_profile_id is not null and started_at is not null
     group by b2c_profile_id, protocol_code, started_at
    having count(*) > 1
  ) then
    raise exception 'NOT CREATED: there are already duplicate b2c sessions. Run the select at the top of this file on its own, keep one row of each pair, then run this file again.'
      using errcode = 'P0001', hint = 'DUPLICATE_SESSIONS';
  end if;

  create unique index if not exists sessions_one_per_start
    on sessions (b2c_profile_id, protocol_code, started_at)
    where kind = 'b2c' and b2c_profile_id is not null and started_at is not null;
end $$;

-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 3. Did it work? (read-only — run this one on its own)
-- ---------------------------------------------------------------------------
-- The editor prints the LAST statement only, and the notify above is not an
-- answer. Select this block and run it by itself: one row means the guard is
-- in place, no rows means it is not.
select indexname, indexdef
  from pg_indexes
 where indexname = 'sessions_one_per_start';
