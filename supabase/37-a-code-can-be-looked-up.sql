-- ============================================================================
-- Good Loop — SCRIPT 37: a company code can be looked up
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- Sell a company in the commercial console, hand its code to an employee,
-- and the registration form says "We do not know this code yet. You can
-- create your account without it and add it later." Every code. Reported as
-- "company codes are not being recognized — even if created".
--
-- The form was not asking the database. `resolveCompanyCode()` reads a
-- registry built out of an environment variable plus a list written in
-- TypeScript — four demo tenants. Any company sold through the console was
-- unknown to it by construction, and the only way to add one was a deploy.
--
-- It is worse than a bad message: the code is what ties an account to a
-- company, so a code the form shrugs at is a person who registers with no
-- company behind them. Hence the next report too, that no count appeared
-- against the company whose code had just been typed in.
--
-- ---------------------------------------------------------------------------
-- WHY A FUNCTION AND NOT A POLICY ON THE TABLE
--
-- The person asking has no account yet: they are `anon`, mid-registration.
-- Letting anon SELECT on `companies` would let anyone on the internet list
-- every customer, their codes, their seat counts and their contact
-- addresses. So this is a function instead, and it answers exactly two
-- things about ONE code it is given:
--
--     name    — so the form can say "Looney Tunes INC" and the person can
--               see they have the right company before they commit
--     active  — a paused contract is not an open door
--
-- No seats, no contact e-mail, no created date, no way to enumerate: a code
-- it does not recognise returns zero rows, and codes are not guessable in
-- bulk (NAME-YYYY-XX). Same shape as `check_promo_code`, which has answered
-- an anonymous question about one string since the promo codes existed.
-- ============================================================================

create or replace function company_by_code(p_code text)
  returns table (name text, active boolean)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select c.name, c.status = 'active'
    from companies c
   where c.id = upper(trim(p_code))
$$;

-- Anyone may ask about a code they already hold, including somebody who is
-- not signed in — which is the whole point, since they are registering.
revoke all on function company_by_code(text) from public;
grant execute on function company_by_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tell PostgREST the shape changed
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- Should answer for a real code, and return no rows for nonsense.
select * from company_by_code('LOONEY-2026-BR');
select * from company_by_code('NOPE-0000-XX');
