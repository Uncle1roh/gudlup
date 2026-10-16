-- ============================================================================
-- Good Loop — SCRIPT 14: the switches that turn an area off without a deploy
--
-- Everything here is also in supabase/setup.sql. Run this file on its own if
-- setup.sql has already been run and you only want the new part. Safe to
-- re-run either way.
--
-- WHAT IT DOES
--   · lets ANY visitor READ the one `app_settings` row that holds the
--     feature switches, while leaving every other row admin-only
--   · creates that row, with all three areas ON
--
-- WHY THE READ POLICY IS NEEDED: `app_settings` is admin-only, which is right
-- for the voice keys it was built for. But a kill switch only an admin can
-- read is not a kill switch — the person whose player is broken is not an
-- admin. So exactly one key becomes world-readable, by name. The switches
-- are not secret; the keys in the other rows still are.
-- ============================================================================

-- 1. The row ------------------------------------------------------------------
insert into app_settings (key, value)
values ('feature_flags', '{"player": true, "booking": true, "video": true}'::jsonb)
on conflict (key) do nothing;

-- 2. Anyone may read THAT ROW, and only that row ------------------------------
-- Policies are OR'd: the admin policy still grants admins everything, and this
-- one adds a read of a single named key for everybody else, signed in or not.
-- `anon` is included on purpose — the switches are consulted before sign-in.
drop policy if exists app_settings_read_flags on app_settings;
create policy app_settings_read_flags on app_settings
  for select using (key = 'feature_flags');

-- 3. Check it from here -------------------------------------------------------
-- Should return one row with the three switches.
select key, value, updated_at from app_settings where key = 'feature_flags';

-- PostgREST caches the schema; a new policy needs it reloaded to take effect
-- on the API immediately rather than at the next restart.
notify pgrst, 'reload schema';
