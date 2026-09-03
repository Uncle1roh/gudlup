-- ============================================================================
-- Good Loop — SCRIPT 4: does what we published actually reach the app?
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- It changes NOTHING. It reads the catalog and says, line by line, what a
-- person and a therapist will see — and when the answer is "nothing", why.
--
-- ONE query, ONE table of results, because the SQL editor only ever shows you
-- the last statement's output.
--
-- Read the `what_people_see` column top to bottom. Run it before a demo: the
-- app can show nothing that is not in this list.
-- ============================================================================

-- The 19 codes the Self Use app knows by name (src/data/selfuse.ts). A
-- CLINICAL protocol that is not one of these is therapist-only by design: it
-- appears in the Workspace, never in the person's own browse list.
with spine(code) as (values
  ('GL-STRESS 4.1'), ('GL-STRESS 4.2'), ('GL-STRESS 4.3'), ('GL-STRESS 4.4'), ('GL-STRESS 4.5'),
  ('GL-ANX 1.1'), ('GL-ANX 1.3'), ('GL-ANX 1.4'),
  ('GL-BURN 3.1'), ('GL-BURN 3.2'), ('GL-BURN 3.3'), ('GL-BURN 3.4'), ('GL-BURN 3.5'),
  ('GL-RESIL 5.1'), ('GL-RESIL 5.2'), ('GL-RESIL 5.3'), ('GL-RESIL 5.4'), ('GL-RESIL 5.5'),
  ('GL-DEP 2.4')
),
rows_in_catalog as (
  select
    p.code,
    case when p.enabled then 'ON' else 'off' end                        as state,
    coalesce(p.audience, 'clinical')                                    as audience,
    -- durations that carry a rendered file
    coalesce((select string_agg(distinct (e->>'duration'), ' / ' order by (e->>'duration'))
                from jsonb_array_elements(coalesce(p.versions, '[]'::jsonb)) e
               where e->'audioUrl' is not null
                 and exists (select 1 from jsonb_each_text(e->'audioUrl') u where u.value <> '')),
             '—')                                                       as audio_minutes,
    -- durations that have a timeline but no rendered file yet
    coalesce((select string_agg(k, ' / ' order by k)
                from jsonb_object_keys(coalesce(p.plain_by_duration, '{}'::jsonb)) k),
             '—')                                                       as timeline_minutes,
    case
      when not p.enabled
        then 'HIDDEN everywhere — the protocol is switched off'
      when coalesce(p.plain_by_duration, '{}'::jsonb) = '{}'::jsonb
       and coalesce(p.versions, '[]'::jsonb) = '[]'::jsonb
        then 'HIDDEN — nothing imported for it at all'
      when coalesce(p.audience, 'clinical') = 'library'
        then 'Self Use: browsable'
      when p.code in (select code from spine)
       and exists (select 1 from jsonb_array_elements(coalesce(p.versions, '[]'::jsonb)) e
                    where e->'audioUrl' is not null
                      and exists (select 1 from jsonb_each_text(e->'audioUrl') u where u.value <> ''))
        then 'Self Use: browsable + plays the published file'
      when p.code in (select code from spine)
        then 'Self Use: browsable, but plays the PLACEHOLDER bed (no rendered audio)'
      else 'Workspace only — clinical protocol the Self Use app does not list'
    end                                                                 as what_people_see,
    coalesce(p.public_title, '—')                                       as public_title,
    p.updated_at::text                                                  as updated_at,
    1                                                                   as sort_group
  from protocols p
),
-- A session the app names and the catalog does not have. Every row here is a
-- card a person can read the name of and never start.
rows_missing as (
  select
    s.code,
    '—'                                                                 as state,
    '—'                                                                 as audience,
    '—'                                                                 as audio_minutes,
    '—'                                                                 as timeline_minutes,
    'MISSING from the catalog — the app names this session and cannot start it'
                                                                        as what_people_see,
    '—'                                                                 as public_title,
    '—'                                                                 as updated_at,
    2                                                                   as sort_group
  from spine s
  where not exists (select 1 from protocols p where p.code = s.code)
),
-- The bottom line, as the last row of the same table.
rows_total as (
  select
    'TOTAL'                                                             as code,
    '—'                                                                 as state,
    '—'                                                                 as audience,
    '—'                                                                 as audio_minutes,
    '—'                                                                 as timeline_minutes,
    (select count(*)::text from protocols)
      || ' protocols in the catalog · '
      || (select count(*)::text from protocols where enabled)
      || ' switched on · '
      || (select count(*)::text from spine s
           where exists (select 1 from protocols p where p.code = s.code and p.enabled))
      || ' of the 19 Self Use sessions are startable'                   as what_people_see,
    '—'                                                                 as public_title,
    '—'                                                                 as updated_at,
    3                                                                   as sort_group
)
select code, state, audience, audio_minutes, timeline_minutes, what_people_see, public_title, updated_at
from (
  select * from rows_in_catalog
  union all select * from rows_missing
  union all select * from rows_total
) all_rows
order by sort_group, (state = 'off'), code;
