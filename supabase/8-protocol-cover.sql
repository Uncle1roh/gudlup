-- ============================================================================
-- Good Loop — SCRIPT 8: a real image per protocol
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment.
--
-- One column. Covers are generated artwork today — a drawn scene per theme —
-- which is honest about there being no commissioned art, and it is the reason
-- people are reporting poor contrast: a duotone gradient behind white type is
-- as much contrast as a gradient can give. A real photograph, chosen for the
-- session, is the fix, and the app was built for it: `coverStyle()` was always
-- one function returning a background, so an image simply replaces the drawing
-- wherever one exists.
--
-- The file itself lives in the `protocol-audio` bucket under assets/covers/,
-- beside the rest of the PO library, and this column holds its public URL.
-- ============================================================================

alter table protocols add column if not exists cover_url text;

-- Without this the API keeps serving the old column list and the app reports a
-- missing column that plainly exists.
notify pgrst, 'reload schema';

-- Should print one row.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'protocols' and column_name = 'cover_url';
