-- ============================================================================
-- Good Loop — SCRIPT 38: how many seats a company is actually using
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- `companies.active_users` is written once, when the company is created, and
-- never again. Nothing in the app and nothing in the database has ever
-- updated it. So the Aziende list's "0 / 88" was not a bug in a counter — it
-- was a column nobody counts, reading back the zero it was born with.
--
-- Reported twice, in the same words: "I don't see any count being added to
-- the company whose code I inserted." The other half of that was the code
-- not being recognised at all (supabase/37), so there was no link to count
-- either; this is what makes the number real once there is.
--
-- ---------------------------------------------------------------------------
-- WHY A FUNCTION, AND WHY IT COUNTS NOTHING ELSE
--
-- The count has to be readable by the COMMERCIAL console, and a `sales`
-- account has no policy on `profiles` at all — deliberately, because
-- somebody selling a contract has no business reading the people on it
-- (supabase/16-sales-role.sql). A plain join would return zero rows and look
-- exactly like the bug it is replacing.
--
-- So: `security definer`, which steps past that policy, and therefore as
-- narrow as it can be made —
--
--   · it returns COUNTS BY COMPANY and nothing else. No names, no
--     addresses, no ids. There is no shape of answer here that could
--     identify a person;
--   · it answers only an admin or a commercial account, and nobody else;
--   · it counts the people who consume a seat: an active `b2c_user` with
--     that company on their profile. An HR admin and a clinician are the
--     employer's own staff and are not employees against the licence count,
--     which is the same rule the roster trigger uses.
--
-- The column stays where it is, unused, rather than being dropped: it is
-- `not null default 0` and a drop would need every reader found first. The
-- client prefers this function's answer and falls back to the column, so a
-- database that has not run this file shows exactly what it showed before.
-- ============================================================================

create or replace function company_seat_usage()
  returns table (company_id text, active_users int)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select p.company_id, count(*)::int
    from profiles p
   where p.company_id is not null
     and p.active
     and p.role::text = 'b2c_user'
     and (is_admin() or is_sales())
   group by p.company_id
$$;

revoke all on function company_seat_usage() from public;
grant execute on function company_seat_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- Tell PostgREST the shape changed
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- Run as an admin, this should print one row per company that has anybody.
select * from company_seat_usage() order by company_id;
