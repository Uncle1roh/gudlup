-- ============================================================================
-- Good Loop — SCRIPT 30: let the commercial console actually change the
-- backgrounds, and let everybody else SEE the change
--
-- Run this on its own if setup.sql has already been run. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS BROKEN
--
-- The two background photographs became a setting (console commerciale →
-- Sfondi), stored as the `backgrounds` row of `app_settings` with the files in
-- the `protocol-audio` bucket. Three separate permissions stood in the way,
-- and the screen could not work until all three are fixed:
--
--   1. UPLOADING.  The bucket's only write policy is `is_admin()`. The Sfondi
--      page lives in the COMMERCIAL console, which only the `sales` role can
--      open — an admin cannot even reach that screen. So the upload came back
--      "new row violates row-level security policy", every time, for the only
--      role that can press the button.
--
--   2. SAVING.  `app_settings` is admin-only for writes, so Salva would have
--      failed next with the same message.
--
--   3. SEEING IT.  This is the quiet one. `app_settings` is admin-only for
--      READS too, except the one `feature_flags` key opened up in script 14.
--      So even once an admin had somehow saved a background, no visitor could
--      read the row: `refreshBackgrounds()` asks for it, gets zero rows (not
--      an error — RLS filters rather than refuses), and falls back to the
--      pictures that shipped with the build. The setting would have looked
--      saved and changed nothing anywhere. A landing page is read by people
--      who are not signed in at all, so this row has to be world-readable.
--
-- ---------------------------------------------------------------------------
-- WHAT IS AND IS NOT GRANTED
--
-- The commercial role gets exactly two things: the `backgrounds` row of
-- `app_settings`, and the `backgrounds/` folder of the audio bucket. It does
-- NOT get the rest of `app_settings` — the ElevenLabs keys live in there — and
-- it does NOT get the rest of the bucket, which is every protocol's audio.
-- Both limits are in the policy itself rather than in the screen that uses it.
--
-- Nothing here is secret: the row holds two public image URLs and two
-- booleans, and the images are served from a public bucket anyway.
-- ============================================================================

-- 1. "Is the person signed in part of the commercial team?" -------------------
-- Already defined in setup.sql; repeated here so this file stands alone, and
-- identical to it so running both is a no-op rather than a silent change.
--
-- `role::text`, not `role = 'sales'`: `profiles.role` is an enum, and the
-- Supabase editor runs a script as ONE transaction. A value added to an enum
-- by that same transaction cannot be used as a literal inside it, and a
-- `language sql` body is parsed when it is created -- so the literal form
-- fails on the first run of a fresh database and succeeds on the second,
-- which is the worst way for a permission function to behave.
create or replace function is_sales() returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from profiles where auth_uid = auth.uid() and role::text = 'sales') $$;
revoke all on function is_sales() from public;
grant execute on function is_sales() to authenticated;

-- 2. Anyone may READ the backgrounds row, and only that row -------------------
-- Policies are OR'd together: the admin policy still grants admins everything,
-- script 14 still opens `feature_flags`, and this adds one more named key for
-- everybody — `anon` included, on purpose. The landing page is the first thing
-- a stranger sees and it is where one of these two pictures goes.
drop policy if exists app_settings_read_backgrounds on app_settings;
create policy app_settings_read_backgrounds on app_settings
  for select using (key = 'backgrounds');

-- 3. Admin and commercial may WRITE that row ----------------------------------
-- `for all` covers the insert and the update halves of an upsert: the row is
-- created by whoever saves first and overwritten by everyone after, so a
-- policy that only allowed one of the two would work exactly once.
-- INSERT and UPDATE as two policies rather than one `for all`, and the reason
-- is not tidiness. A permissive policy's expression is evaluated for EVERY
-- command it covers, SELECT included -- and `is_sales()` has its execute
-- permission revoked from public (setup.sql, sales section). A `for all`
-- policy here would therefore make an anonymous read of this table call a
-- function anon may not call. `is_admin()` is public-executable, which is why
-- the older `for all` policies beside these have never shown the problem.
--
-- The pair also covers exactly what an upsert does and nothing more: the row
-- is created by whoever saves first and overwritten by everyone after, and a
-- policy covering only the insert half would have worked exactly once. No
-- DELETE: nothing in the console deletes these.
drop policy if exists app_settings_backgrounds_write on app_settings;
drop policy if exists app_settings_backgrounds_insert on app_settings;
create policy app_settings_backgrounds_insert on app_settings
  for insert
  with check (key = 'backgrounds' and (is_admin() or is_sales()));

drop policy if exists app_settings_backgrounds_update on app_settings;
create policy app_settings_backgrounds_update on app_settings
  for update
  using (key = 'backgrounds' and (is_admin() or is_sales()))
  with check (key = 'backgrounds' and (is_admin() or is_sales()));

-- 4. …and may write the FILES, under `backgrounds/` and nowhere else ----------
-- storage.foldername(name) splits the object path, so [1] is the first folder.
-- An upload to `backgrounds/landing.jpg` passes; one to `GL-ANX/1.1/voce.mp3`
-- does not. Split into insert and update for the same reason as the pair
-- above: a `for all` policy would be evaluated on anonymous SELECTs too, and
-- those must never call is_sales(). The two together are exactly an upsert,
-- which is what the page does -- it overwrites the same two paths rather
-- than accumulating files.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'objects') then
    execute 'drop policy if exists protocol_audio_backgrounds_write on storage.objects';
    execute 'drop policy if exists protocol_audio_backgrounds_insert on storage.objects';
    execute $p$
      create policy protocol_audio_backgrounds_insert on storage.objects
        for insert
        with check (
          bucket_id = 'protocol-audio'
          and (storage.foldername(name))[1] = 'backgrounds'
          and (is_admin() or is_sales())
        )
    $p$;

    execute 'drop policy if exists protocol_audio_backgrounds_update on storage.objects';
    execute $p$
      create policy protocol_audio_backgrounds_update on storage.objects
        for update
        using (
          bucket_id = 'protocol-audio'
          and (storage.foldername(name))[1] = 'backgrounds'
          and (is_admin() or is_sales())
        )
        with check (
          bucket_id = 'protocol-audio'
          and (storage.foldername(name))[1] = 'backgrounds'
          and (is_admin() or is_sales())
        )
    $p$;
  end if;
end $$;

-- 5. Check it from here -------------------------------------------------------
-- The row, if it has been saved yet (none is fine — the build's own pictures
-- are the fallback, by design), and the policies that should now exist: five
-- on app_settings and two on storage.objects.
select key, value, updated_at from app_settings where key = 'backgrounds';

select tablename, policyname from pg_policies
 where (schemaname = 'public'  and tablename = 'app_settings')
    or (schemaname = 'storage' and tablename = 'objects' and policyname like '%background%')
 order by tablename, policyname;

-- PostgREST caches the schema; a new policy needs it reloaded to take effect
-- on the API immediately rather than at the next restart.
notify pgrst, 'reload schema';
