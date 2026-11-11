-- ============================================================================
-- Good Loop — SCRIPT 31: the subtitle under the cover
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- On the home shelf a session is an album: a square cover with its NAME
-- printed large across the picture, and the same name printed again on the
-- line underneath. Twice, in every tile, saying nothing the second time.
--
-- That line is now a SUBTITLE of its own — a short second line a PO writes in
-- console → protocollo → Dettagli, beside the name and the description, in
-- each of the three languages. Nothing written means an empty line, NOT the
-- name repeated: repeating it is the thing this replaces, and the slot holds
-- its height either way so a shelf of covers stays aligned.
--
-- It is a LABEL and only a label. The code, the family, the durations, the
-- timelines, the Studio sessions and the rendered audio are untouched by it,
-- exactly as `public_title` is, and nothing clinical reads it. Same editorial
-- rule as every other public name: it says the moment, never a condition, a
-- diagnosis or a treatment.
--
-- The per-language copies live where the others do, in the `i18n` column:
--   { "pt-BR": { "publicTitle": …, "publicSubtitle": …, "publicBlurb": … } }
-- so no second column is needed for the translations.
-- ============================================================================

alter table protocols add column if not exists public_subtitle text;

-- Without this the API keeps serving the old column list and the console
-- reports a missing column that plainly exists.
notify pgrst, 'reload schema';

-- Should print one row.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'protocols' and column_name = 'public_subtitle';
