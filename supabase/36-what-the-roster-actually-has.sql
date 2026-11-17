-- ============================================================================
-- Good Loop — SCRIPT 36: what the employee roster actually has (read-only)
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- It CHANGES NOTHING. Send me the table it prints.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- company panel → Dipendenti refused every invitation with:
--
--   Could not find the function public.hr_add_company_members(p_rows)
--   in the schema cache
--
-- That sentence is PostgREST saying "I know of no function of that name
-- taking an argument called p_rows". The repository has one, in
-- supabase/25-company-roster.sql, and the client calls it with exactly that
-- argument — so the question is only ever about the DATABASE, and these are
-- the four shapes the answer can take:
--
--   1. It is not there. Script 25 never applied, or applied and rolled
--      back. The editor runs a file as ONE transaction, so any failed
--      statement undoes the whole file — including the table and the
--      policies above it. The likeliest failure was the one that script now
--      defends against: `create or replace function` CANNOT rename an input
--      parameter, so an older function taking `p_members` made the new one
--      impossible to install, and the error scrolled past at the bottom of
--      a long file.
--   2. It is there under a DIFFERENT parameter name. Same error from
--      PostgREST, same fix: re-run script 25, which now drops first.
--   3. It is there and correct, but `authenticated` cannot execute it.
--      PostgREST hides what the caller may not run and reports it missing
--      rather than forbidden.
--   4. All correct, and PostgREST's schema cache is stale. The reload at
--      the end settles that.
--
-- ---------------------------------------------------------------------------
-- ONE QUERY, ON PURPOSE
--
-- This file used to be five separate selects, and the Supabase editor shows
-- only the LAST statement's result — so it reported the triggers and hid
-- everything that mattered. It is one `union all` now: one table, every
-- answer in it, nothing to scroll past.
--
-- READ IT LIKE THIS. Every `what` below should say `yes` or name the thing
-- it found. The row that matters most is
--
--   fn hr_add_company_members → should read: p_rows jsonb | exec: true
--
-- Anything else there — a different argument name, `exec: false`, or the
-- row missing altogether — is the answer, and it maps to one of the four
-- cases above.
-- ============================================================================

with checks as (
  -- 1. the table the roster lives in
  select 1 as ord,
         'table company_members' as what,
         case when to_regclass('public.company_members') is null
              then 'MISSING' else 'yes' end as answer

  union all
  -- 2. how many addresses are on it (0 is fine; MISSING is not)
  select 2,
         'rows in company_members',
         case when to_regclass('public.company_members') is null then 'n/a'
              else (select count(*)::text from company_members) end

  union all
  -- 3. every function the feature needs, with the EXACT argument names
  --    PostgREST matches on, and whether a signed-in caller may run it
  select 3,
         'fn ' || p.proname,
         coalesce(nullif(pg_get_function_identity_arguments(p.oid), ''), '(none)')
           || '  |  exec: ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
           || '  |  definer: ' || p.prosecdef::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'company_email_status', 'profiles_company_roster_guard',
       'hr_add_company_members', 'hr_set_member_access',
       'hr_remove_company_member', 'hr_unlisted_member_count',
       'hr_revoke_unlisted_members'
     )

  union all
  -- 4. and the ones that should be there but are not
  select 4,
         'fn ' || missing.name,
         'MISSING'
    from (values
      ('company_email_status'), ('profiles_company_roster_guard'),
      ('hr_add_company_members'), ('hr_set_member_access'),
      ('hr_remove_company_member'), ('hr_unlisted_member_count'),
      ('hr_revoke_unlisted_members')
    ) as missing(name)
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = missing.name
   )

  union all
  -- 5. the policies on the roster table
  select 5,
         'policy ' || pol.polname,
         case pol.polcmd when 'r' then 'select' when 'a' then 'insert'
                         when 'w' then 'update' when 'd' then 'delete'
                         else 'all' end
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
   where c.relname = 'company_members'

  union all
  -- 6. the trigger that enforces the list at sign-up
  select 6,
         'trigger ' || tgname,
         case tgenabled when 'O' then 'enabled' when 'D' then 'DISABLED' else tgenabled::text end
    from pg_trigger
   where tgrelid = 'public.profiles'::regclass
     and not tgisinternal
     and tgname = 'profiles_company_roster_guard'
)
select what, answer from checks order by ord, what;

-- ---------------------------------------------------------------------------
-- And rule out a stale cache while we are here
-- ---------------------------------------------------------------------------
-- Harmless at any time. If everything above reads right, this is the whole
-- fix. (It prints nothing — the table above is the output.)
notify pgrst, 'reload schema';
