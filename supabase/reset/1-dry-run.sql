-- ===========================================================================
-- RESET 1 of 4 — THE DRY RUN.  Deletes nothing.  Safe to run any time.
--
-- ONE query, because the Supabase SQL editor only shows you the result of the
-- last statement it ran. Everything you need to see is in the table it
-- returns: what would be deleted, what would be kept, the admin accounts that
-- survive, and any protocol that would be left stranded.
--
-- Read it top to bottom, then decide whether to run 2-wipe.sql.
-- ===========================================================================

select line, detail
from (

  select 10 as ord, '=== WOULD BE DELETED ===' as line, '' as detail
  union all select 11, 'people (profiles)',        count(*)::text from profiles where role <> 'admin'
  union all select 12, 'therapists',               count(*)::text from therapists
  union all select 13, 'patient records',          count(*)::text from patients
  union all select 14, 'appointments',             count(*)::text from appointments
  union all select 15, 'companies',                count(*)::text from companies
  union all select 16, 'logins (auth users)',      count(*)::text from auth.users
    where id not in (select auth_uid from profiles where role = 'admin' and auth_uid is not null)
      and lower(coalesce(email, '')) not in (select lower(email) from profiles where role = 'admin' and email is not null)
      and lower(coalesce(email, '')) <> 'admin@goodloop.app'

  union all select 20, '', ''
  union all select 21, '=== WOULD BE KEPT ===', ''
  union all select 22, 'PROTOCOLS',               count(*)::text from protocols
  union all select 23, 'library shelves',         count(*)::text from explore_rails
  union all select 24, 'audio tags',              count(*)::text from asset_meta
  union all select 25, 'operator settings (incl. the ElevenLabs key)', count(*)::text from app_settings
  union all select 26, 'audit trail',             count(*)::text from audit_events
  union all select 27, 'admin profiles',          count(*)::text from profiles where role = 'admin'

  -- CHECK 1: the admin accounts that survive. admin@goodloop.app must be here.
  union all select 30, '', ''
  union all select 31, '=== ADMINS THAT SURVIVE (must include admin@goodloop.app) ===', ''
  union all select 32, coalesce(email, '(no email on this profile)'),
                       'role ' || role::text || case when active then '' else ' — INACTIVE' end
              from profiles where role = 'admin'
  union all select 33, '!!! NO ADMIN PROFILE — the wipe will refuse to run !!!', ''
              where not exists (select 1 from profiles where role = 'admin')

  -- CHECK 2: protocols tied to one company would go invisible when companies
  -- are deleted. Expect the "none" line. Any other row here means stop.
  union all select 40, '', ''
  union all select 41, '=== PROTOCOLS LIMITED TO ONE COMPANY (expect: none) ===', ''
  union all select 42, code, 'visible only to ' || tenants::text
              from protocols where tenants::text <> '"all"'
  union all select 43, 'none — every protocol is visible to all tenants', ''
              where not exists (select 1 from protocols where tenants::text <> '"all"')
  union all select 43, '^^^ these would go invisible — say so before running the wipe ^^^', ''
              where exists (select 1 from protocols where tenants::text <> '"all"')

) x
order by ord, line;
