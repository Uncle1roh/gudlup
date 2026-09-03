-- ============================================================================
-- Good Loop — SCRIPT 3: stop re-typing the ElevenLabs key
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. It creates ONE small table.
--
-- Why: the key was kept in the browser (localStorage), which belongs to one
-- ADDRESS on one computer. A different machine, a cleared profile, or a
-- Vercel preview URL is a different address — so the key looked lost and had
-- to be pasted again. After this script the Voice engine panel saves it in the
-- database instead, and every admin, on every computer and every deploy, finds
-- it already there.
--
-- It is a credential, so only accounts with role = 'admin' can read or write
-- it. A patient or a therapist cannot see it. (Script 2 tells you which
-- accounts are admins.)
-- ============================================================================

create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table app_settings enable row level security;

drop policy if exists app_settings_admin on app_settings;
create policy app_settings_admin on app_settings
  for all using (is_admin()) with check (is_admin());

-- Without this the API keeps serving the old table list and the app reports a
-- missing table that plainly exists.
notify pgrst, 'reload schema';

-- Should print one row: app_settings.
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'app_settings';
