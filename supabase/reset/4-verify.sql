-- ===========================================================================
-- RESET 4 of 4 — CHECK IT.  Deletes nothing. Run it whenever you want to see
-- the state of the demo.
-- ===========================================================================

-- Who exists. Expect four rows: your admin, the demo person, the clinician
-- (approved), and HR.
select p.email,
       p.role,
       p.company_id,
       t.status as clinician_status,
       p.active
  from profiles p
  left join therapists t on t.id = p.id
 order by p.role::text, p.email;

-- The product, which the reset must not have touched. Compare these with what
-- 1-dry-run.sql reported before you started: they should be identical.
select 'PROTOCOLS'          as what, count(*) as rows from protocols
union all select 'library shelves',   count(*) from explore_rails
union all select 'audio tags',        count(*) from asset_meta
union all select 'operator settings', count(*) from app_settings
union all select 'audit trail',       count(*) from audit_events;

-- The demo itself: the pieces that make it a demo rather than an empty app.
select 'companies'                     as what, count(*) as rows from companies
union all select 'clinicians on the demo list', count(*) from company_therapists where company_id = 'DEMO-2026-GL'
union all select 'bookable hours published',    count(*) from therapist_availability
union all select 'patient records',             count(*) from patients
union all select 'sessions in the history',     count(*) from sessions
union all select 'prescribed plan items',       count(*) from plan_items
union all select 'upcoming appointments',       count(*) from appointments where status = 'booked';

-- The next appointment, which is what makes the join button live in a demo.
select p.name as patient, a.starts_at, a.duration_min, a.status
  from appointments a join profiles p on p.id = a.profile_id
 where a.status = 'booked'
 order by a.starts_at;
