-- ============================================================================
-- Good Loop — SCRIPT 36: what the employee roster actually has (read-only)
--
-- Copy this whole file into the Supabase SQL editor and press Run. It CHANGES
-- NOTHING: five selects and one cache reload. Send me the output.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- company panel → Dipendenti refuses every invitation with:
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
--   1. The function is not there. Script 25 never applied, or applied and
--      rolled back. The Supabase editor runs a file as ONE transaction, so
--      ANY failed statement undoes the whole file — including the table and
--      the policies above it. The most likely failure is the one that script
--      now defends against: `create or replace function` CANNOT rename an
--      input parameter, so an older function taking `p_members` would make
--      the new one impossible to install.
--   2. The function is there under a DIFFERENT parameter name. Same error,
--      and the fix is the same: re-run script 25, which now drops first.
--   3. The function is there and correct, but `authenticated` has no execute
--      grant. PostgREST hides what the caller may not run, and reports it as
--      missing rather than as forbidden.
--   4. Everything is right and PostgREST's schema cache is stale. The reload
--      at the end of this file settles that.
--
-- One more thing worth knowing while reading the output: the app's roster
-- LIST swallows its errors and shows an empty list, so an absent table and a
-- company with no employees look identical on screen. That is being fixed in
-- the client separately. It is why the first visible symptom was the write.
-- ============================================================================

-- 1. Is the table there, and what is in it?
select 'table company_members' as what,
       to_regclass('public.company_members') is not null as exists;

select count(*) as rows_in_company_members
from company_members
where to_regclass('public.company_members') is not null;

-- 2. Every roster function this feature needs, with the EXACT argument names
--    PostgREST matches on. A missing row, or a different name in
--    `arguments`, is the answer.
select p.proname                                   as function,
       pg_get_function_identity_arguments(p.oid)   as arguments,
       p.prosecdef                                 as security_definer,
       p.proconfig                                 as settings
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'company_email_status', 'profiles_company_roster_guard',
     'hr_add_company_members', 'hr_set_member_access',
     'hr_remove_company_member', 'hr_unlisted_member_count',
     'hr_revoke_unlisted_members'
   )
 order by p.proname;

-- 3. Who may execute them. `authenticated` must be able to, or PostgREST
--    reports the function as missing rather than as refused.
select p.proname as function,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_may_run
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'hr\_%'
 order by p.proname;

-- 4. The policies on the roster table.
select pol.polname as policy,
       case pol.polcmd when 'r' then 'select' when 'a' then 'insert'
                       when 'w' then 'update' when 'd' then 'delete'
                       else 'all' end as cmd
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
 where c.relname = 'company_members'
 order by pol.polname;

-- 5. And the trigger that enforces the list at sign-up.
select tgname as trigger, tgenabled as enabled
  from pg_trigger
 where tgrelid = 'public.profiles'::regclass
   and not tgisinternal
 order by tgname;

-- ---------------------------------------------------------------------------
-- Finally, rule out a stale cache
-- ---------------------------------------------------------------------------
-- Harmless to run at any time. If the function IS there with the right
-- argument name and the right grant, this is the whole fix.
notify pgrst, 'reload schema';
