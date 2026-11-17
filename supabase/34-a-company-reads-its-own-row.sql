-- ============================================================================
-- Good Loop — SCRIPT 34: a company can read its own row
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- Sell a company 88 licences in the commercial console, then sign in as that
-- company's HR admin: the dashboard says 0 licences, and where the company's
-- name should be it prints the company CODE. Reported as "company licenses
-- count is Zero even if I created 88 for such company".
--
-- The console is right. The row says 88 and the Aziende list shows "0 / 88",
-- which is seats USED over seats SOLD — correct for a company nobody has
-- registered against yet. What is wrong is what the company itself can see.
--
-- `companies` had exactly two policies: `companies_admin` (is_admin) and
-- `companies_sales` (is_sales). An `hr_admin` had none — and under
-- row-level security "no policy" is not an error, it is zero rows. So
-- `listCompanies()` came back EMPTY rather than refused, the client found no
-- row for its own code, and fell back to what it has when a company is
-- unknown to it: the code as the name, and zero licences
-- (`src/corporate/data.ts`, `tenantFromCode`). A silent empty list is the
-- worst shape a permission error can take: nothing logs, nothing throws, and
-- the screen invents a number.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS GRANTS, AND WHAT IT DOES NOT
--
-- SELECT, on one row: the caller's own company. Not insert, not update, not
-- delete — a company that could raise its own seat count is a billing hole,
-- and seats are sold by the commercial team. Not other companies' rows
-- either: `my_company_id()` is the company on the caller's own profile.
--
-- The row holds a name, a seat count, a status and a created date. Nothing
-- clinical, nothing about any person, and nothing another tenant can see.
-- ============================================================================

drop policy if exists companies_own_read on companies;
create policy companies_own_read on companies
  for select
  using (is_hr() and id = my_company_id());

-- ---------------------------------------------------------------------------
-- Tell PostgREST that policies changed
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- Should print the four policies on the table: admin, sales, and this one.
select polname, cmd
from (
  select pol.polname,
         case pol.polcmd when 'r' then 'select' when 'a' then 'insert'
                         when 'w' then 'update' when 'd' then 'delete'
                         else 'all' end as cmd
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  where c.relname = 'companies'
) p
order by polname;
