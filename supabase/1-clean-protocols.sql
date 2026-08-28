-- ============================================================================
-- Good Loop — SCRIPT 1 of 2: clean the protocol catalog
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment.
--
-- It deletes EVERY protocol so you can start again from the workbooks, brings
-- the table up to the schema the current app writes, and tells the API to
-- reload. It does NOT touch your audio files, the PO asset library, or session
-- history.
--
-- When it finishes you should see: protocols_remaining = 0.
-- ============================================================================

-- Columns the app writes. Safe to run on a database that already has them.
alter table protocols add column if not exists spec               jsonb;
alter table protocols add column if not exists datasheet          jsonb;
alter table protocols add column if not exists plain              jsonb;
alter table protocols add column if not exists asset_map          jsonb;
alter table protocols add column if not exists studio             jsonb;
alter table protocols add column if not exists plain_by_duration  jsonb;
alter table protocols add column if not exists studio_by_duration jsonb;
alter table protocols add column if not exists audio_ready        boolean not null default false;
alter table protocols add column if not exists audience           text not null default 'clinical';
alter table protocols add column if not exists library            jsonb;
alter table protocols add column if not exists public_title       text;
alter table protocols add column if not exists public_blurb       text;
alter table protocols add column if not exists tags               jsonb not null default '[]';

-- Every protocol goes. Audio files in the protocol-audio bucket stay where
-- they are; re-publishing overwrites them by path.
delete from protocols;

-- Without this the API keeps serving the old column list and the app reports a
-- missing column that plainly exists.
notify pgrst, 'reload schema';

-- This is the number you are looking for. It must be 0.
select count(*) as protocols_remaining from protocols;
