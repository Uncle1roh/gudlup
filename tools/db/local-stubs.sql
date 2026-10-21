-- ============================================================================
-- The Supabase objects setup.sql leans on, for a plain local Postgres 16.
--
-- setup.sql is written for Supabase: its SQL functions and policies call
-- auth.uid(), it deletes from auth.users and it grants to anon/authenticated.
-- On a bare server every one of those fails at create time. These stubs are
-- the minimum that lets the file apply unchanged, so the fresh-database gate
-- (tools/db-gate.mjs) tests the real script and not a copy of it.
--
-- auth.uid() reads the same setting PostgREST sets, so a test can act as a
-- person with:   select set_config('request.jwt.claim.sub', '<uuid>', true);
--
-- NEVER run this on Supabase: it would shadow the real auth schema.
-- ============================================================================

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
  language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
  language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
