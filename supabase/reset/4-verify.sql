-- ===========================================================================
-- RESET 4 of 4 — CHECK IT.  Deletes nothing. Run it whenever you want to see
-- the state of the demo.
--
-- ONE query, because the SQL editor only shows the last statement's result.
-- ===========================================================================

select line, detail
from (

  -- Who exists. Expect four: your admin, the person, the clinician (approved)
  -- and HR.
  select 10 as ord, '=== ACCOUNTS ===' as line, '' as detail
  union all select 11, coalesce(p.email, '(no email)'),
                       p.role::text
                       || coalesce(' · ' || p.company_id, ' · no company')
                       || coalesce(' · clinician ' || t.status::text, '')
              from profiles p left join therapists t on t.id = p.id

  -- The product. These must match what 1-dry-run.sql said before you started.
  union all select 20, '', ''
  union all select 21, '=== THE PRODUCT (must be unchanged) ===', ''
  union all select 22, 'PROTOCOLS',         count(*)::text from protocols
  union all select 23, 'library shelves',   count(*)::text from explore_rails
  union all select 24, 'audio tags',        count(*)::text from asset_meta
  union all select 25, 'operator settings', count(*)::text from app_settings
  union all select 26, 'audit trail',       count(*)::text from audit_events

  -- The demo: the pieces that make it a demo rather than an empty app.
  union all select 30, '', ''
  union all select 31, '=== THE DEMO ===', ''
  union all select 32, 'companies',                    count(*)::text from companies
  union all select 33, 'clinicians on the demo list',  count(*)::text from company_therapists where company_id = 'DEMO-2026-GL'
  union all select 34, 'clinicians with bookable hours', count(*)::text from therapist_availability
  union all select 35, 'patient records',              count(*)::text from patients
  union all select 36, 'sessions in the history',      count(*)::text from sessions
  union all select 37, 'prescribed plan items',        count(*)::text from plan_items
  union all select 38, 'upcoming appointments',        count(*)::text from appointments where status = 'booked'

  -- The next appointment is what makes the join button live on stage.
  union all select 40, '', ''
  union all select 41, '=== NEXT SESSIONS BOOKED ===', ''
  union all select 42, to_char(a.starts_at, 'DD/MM HH24:MI'),
                       a.patient_name || ' · ' || a.duration_min || ' min'
              from appointments a where a.status = 'booked'
  union all select 43, 'none booked yet', ''
              where not exists (select 1 from appointments where status = 'booked')

) x
order by ord, line;
