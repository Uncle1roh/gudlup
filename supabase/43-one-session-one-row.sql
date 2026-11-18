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
-- index, the client already swallows that error, and the row from the first
-- attempt is the one that stays.
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
do $$
begin
  if exists (
    select 1 from sessions
     where kind = 'b2c' and b2c_profile_id is not null and started_at is not null
     group by b2c_profile_id, protocol_code, started_at
    having count(*) > 1
  ) then
    raise notice 'NOT CREATED: there are already duplicate b2c sessions — see the list above, keep one row of each pair, then run this file again.';
  else
    create unique index if not exists sessions_one_per_start
      on sessions (b2c_profile_id, protocol_code, started_at)
      where kind = 'b2c' and b2c_profile_id is not null and started_at is not null;
    raise notice 'sessions_one_per_start is in place.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
