-- ============================================================================
-- PROTOCOLS — who may read which catalogue rows
--
-- For a database that is already live. The same block is in setup.sql.
-- Safe to re-run.
--
-- The catalogue used to be readable in full by anyone signed in: disabled
-- protocols, clinical titles, studio sessions and audio URLs reached every
-- person's browser, and the app hid them on the client. A protocol scoped
-- to one company (`tenants`) was readable by — and listed for — everyone.
--
-- Now the database decides:
--   admins          every row (the console, the Studio, the preview)
--   approved        every row (the workspace prescribes from the full
--   therapists      catalogue, disabled ones included in their history)
--   everyone else   ENABLED rows whose `tenants` is "all" or includes their
--                   own company. The clinical-only codes stay readable to a
--                   patient: their therapist plays them in a led session.
-- ============================================================================

drop policy if exists protocols_read_all on protocols;
create policy protocols_read_all on protocols
  for select using (
    is_admin()
    or is_approved_therapist()
    or (auth.uid() is not null
        and enabled
        and (tenants = '"all"'::jsonb or tenants ? coalesce(my_company_id(), '')))
  );

notify pgrst, 'reload schema';
