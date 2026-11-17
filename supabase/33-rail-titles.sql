-- ============================================================================
-- Good Loop — SCRIPT 33: a shelf can be named in every language
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- console → Scaffali della libreria prints, under each title field, how that
-- title will read in every language. For the shelves the app ships with it
-- works perfectly: "Six minutes", "Calm", "New in the library" are ENGLISH
-- KEYS, the product dictionaries carry them, and the lines show "Sei minuti"
-- and "Seis minutos".
--
-- For a shelf somebody INVENTS it cannot work at all. "Pausas para a tarde"
-- is a string no dictionary has ever seen, so the page could only report
-- that there was no translation and that every language would read it as
-- typed. From the operator's side this is a feature that works for the first
-- few shelves and then stops — exactly when they create a new one, which is
-- how it was reported.
--
-- The dictionaries are the wrong place for it. They are the PRODUCT's words,
-- shipped in the bundle and changed by a deploy; a shelf name is editorial
-- content, written by whoever runs the library, and content carries its own
-- translations. Protocols already work this way (`protocols.i18n`, holding
-- public_title / public_subtitle / public_blurb per language), and this is
-- the same column on the same principle.
--
-- ---------------------------------------------------------------------------
-- WHAT IT HOLDS
--
--   { "pt-BR": { "title": "Pausas para a tarde", "subtitle": "…" },
--     "it":    { "title": "Pause del pomeriggio" } }
--
-- Every part optional. A language with nothing written FALLS BACK to the
-- dictionary lookup, which is what keeps the built-in shelves reading
-- exactly as they do today — so no existing row needs migrating, and this
-- script adds a column and changes no data.
-- ============================================================================

alter table explore_rails
  add column if not exists i18n jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Tell PostgREST the shape changed
-- ---------------------------------------------------------------------------
-- Without this the API keeps serving the old column list and the console
-- reports a missing column that plainly exists. (The client also retries a
-- save without the column, so a console on a database that has not run this
-- script still publishes its shelves — it just cannot store translations.)
notify pgrst, 'reload schema';

-- Should print one row.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'explore_rails' and column_name = 'i18n';
