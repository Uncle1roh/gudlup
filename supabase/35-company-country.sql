-- ============================================================================
-- Good Loop — SCRIPT 35: a company's contract has a country
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- company panel → Perfil shows "País", locked, because it is contractual.
-- For every company sold through the commercial console it was EMPTY, and
-- being locked there was no way to fill it. Reported as "I think there might
-- be data missing here from Registration. At least surely the Country, which
-- I clearly remember inputting Brazil."
--
-- The country typed during registration was the HR ADMIN'S OWN — the door
-- asks "where do you live", and that answer sets that person's market. It
-- was never the company's, and it should not become it: the market decides
-- the crisis numbers, the withdrawal period, the governing annex of the
-- Terms and the supervisory authority, and inheriting all of that from the
-- country one employee happens to live in is how a Brazilian contract ends
-- up answering to the wrong authority because its HR lead moved to Lisbon.
--
-- So the country belongs to the COMPANY, set by the team that sells the
-- contract. `console comerciale → Aziende → + Nuova azienda` now asks for it
-- and will not create a company without one.
--
-- ---------------------------------------------------------------------------
-- WHAT ABOUT THE COMPANIES THAT ALREADY EXIST
--
-- They get NULL, and their panel shows the field empty — exactly as it does
-- today, and honestly. Nothing is guessed on their behalf. Fill them in by
-- hand once (there are three in production as this is written):
--
--   update companies set country = 'BR' where id = 'LOONEY-2026-BR';
--
-- 'BR' and 'IT' are the two territories the service is offered in
-- (src/legal/market.ts, D-12). The check below allows only those two, so a
-- typo cannot quietly put a company in a market that has no crisis numbers.
-- ============================================================================

alter table companies
  add column if not exists country text;

-- Two letters, and only a market that exists. Written as a trigger-free
-- check so an existing NULL stays valid.
alter table companies
  drop constraint if exists companies_country_supported;
alter table companies
  add constraint companies_country_supported
  check (country is null or country in ('BR', 'IT'));

-- ---------------------------------------------------------------------------
-- Tell PostgREST the shape changed
-- ---------------------------------------------------------------------------
-- Without this the API keeps serving the old column list and the console
-- reports a missing column that plainly exists.
notify pgrst, 'reload schema';

-- Should print one row, and then every company with its country (null until
-- somebody fills it in).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'companies' and column_name = 'country';

select id, name, country from companies order by name;
