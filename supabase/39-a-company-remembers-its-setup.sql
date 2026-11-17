-- ============================================================================
-- Good Loop — SCRIPT 39: a company remembers its own configuration
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- Three reports, one cause:
--
--   "After registering the company I always see the first configuration
--    Wizard, even if I have already entered the account and done some few
--    things. I keep on receiving the first configuration wizard."
--
--   "Aside from having always again the introductory wizard, I noticed that
--    the data about the Helpline/Crisis management has been completely lost
--    even if I inputted it and saved previously."
--
-- Everything the company panel knows about itself — that the wizard is done,
-- the crisis line it wants its people shown, which reports it wants, its
-- industry and size, its contact, its list of admins — lived in
-- `localStorage` under `gl.corporate.<CODE>` and nowhere else. It was never
-- written to this database at all.
--
-- So it lasted exactly as long as one browser profile on one machine. A
-- second device, a cleared cache, a different browser, a colleague opening
-- the panel: the wizard again, and the helpline gone. Not lost — never
-- stored. The HELPLINE is the one that matters: it is the number the Safety
-- Gateway shows a person in difficulty, and a company that set it and then
-- found it blank had every reason to think the product had thrown it away.
--
-- ---------------------------------------------------------------------------
-- WHAT IS STORED HERE, AND WHAT IS NOT
--
-- One row per company, one jsonb object: the configuration the COMPANY
-- chooses. Explicitly NOT in it:
--
--   · the contract — name, country, code, licences, convention, dates. Those
--     live on `companies` and on the convention registry, are read fresh on
--     every load, and are not the tenant's to edit. A stale copy here could
--     otherwise show a company the wrong licence count or somebody else's
--     name;
--   · anything about a person. No employee, no session, no score, no mood.
--     The roster is `company_members`, with its own table and its own rules;
--     this row is settings.
--
-- Who may touch it: the HR of that company, and an admin. NOT a commercial
-- account — a salesperson has no business in a customer's crisis line.
-- ============================================================================

create table if not exists company_settings (
  company_id text primary key references companies(id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table company_settings enable row level security;

-- The company's own HR: their row, and only theirs. `my_company_id()` reads
-- the company off the caller's own profile, so this cannot be widened by
-- asking for another id.
drop policy if exists company_settings_hr on company_settings;
create policy company_settings_hr on company_settings
  for all
  using (is_hr() and company_id = my_company_id())
  with check (is_hr() and company_id = my_company_id());

-- An admin, for the support call.
drop policy if exists company_settings_admin on company_settings;
create policy company_settings_admin on company_settings
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Tell PostgREST the shape changed
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- Should print the four columns, and then whatever is already there.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'company_settings'
order by ordinal_position;

select company_id, updated_at, updated_by from company_settings order by company_id;
