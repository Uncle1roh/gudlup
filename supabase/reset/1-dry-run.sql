-- ===========================================================================
-- RESET 1 of 4 — THE DRY RUN.  Deletes nothing.  Safe to run any time.
--
-- Run this on its own and read the numbers. It tells you exactly what
-- 2-wipe.sql would remove and what it would keep. If anything here surprises
-- you, stop and do not run script 2.
-- ===========================================================================

select 'WILL DELETE — profiles (people)' as what,
       count(*) as rows from profiles where role <> 'admin'
union all
select 'WILL DELETE — therapists',        count(*) from therapists
union all
select 'WILL DELETE — patient records',   count(*) from patients
union all
select 'WILL DELETE — appointments',      count(*) from appointments
union all
select 'WILL DELETE — companies',         count(*) from companies
union all
select 'WILL DELETE — logins',            count(*) from auth.users
 where id not in (select auth_uid from profiles where role = 'admin' and auth_uid is not null)
   and lower(coalesce(email, '')) not in (select lower(email) from profiles where role = 'admin' and email is not null)
   and lower(coalesce(email, '')) <> 'admin@goodloop.app'
union all
select '— — — — — — — — — — — — — —',     null
union all
select 'WILL KEEP — admin profiles',      count(*) from profiles where role = 'admin'
union all
select 'WILL KEEP — admin logins',        count(*) from auth.users
 where id in (select auth_uid from profiles where role = 'admin' and auth_uid is not null)
    or lower(coalesce(email, '')) = 'admin@goodloop.app'
union all
select 'WILL KEEP — PROTOCOLS',           count(*) from protocols
union all
select 'WILL KEEP — library shelves',     count(*) from explore_rails
union all
select 'WILL KEEP — audio tags',          count(*) from asset_meta
union all
select 'WILL KEEP — operator settings',   count(*) from app_settings
union all
select 'WILL KEEP — audit trail',         count(*) from audit_events;


-- Two things worth eyeballing before you go on.

-- 1. The admin account(s) that will survive. There must be at least one row,
--    and admin@goodloop.app should be among them.
select email, role, active, created_at from profiles where role = 'admin';

-- 2. Protocols restricted to one company would stop being visible to anybody
--    once that company is deleted. Expect NO ROWS here. If any come back, tell
--    me before running script 2 and I will widen them first.
select code, title, tenants from protocols where tenants::text <> '"all"';
