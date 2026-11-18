-- ============================================================================
-- Good Loop — SCRIPT 44: a role is not something you give yourself
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- RUN THIS ONE FIRST, before 41/42/43 if you have not run them yet. The hole
-- it closes reaches everything the others protect.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- `profiles` carries two self-service policies, and both check exactly one
-- thing — that the row belongs to the caller:
--
--   create policy profiles_insert_own on profiles
--     for insert with check (auth_uid = auth.uid());
--   create policy profiles_update_own on profiles
--     for update using (auth_uid = auth.uid()) with check (auth_uid = auth.uid());
--
-- Postgres row-level security is ROW level. It has no per-column grain. So
-- the policy that exists to let a person fix their own name also lets them
-- send any other column in the same row — `role` among them.
--
-- One REST call, from any signed-in account, no company code, no approval:
--
--   PATCH /rest/v1/profiles?auth_uid=eq.<their own uid>
--   { "role": "admin" }
--
-- The caller is then an admin of the platform. That is: every company's
-- data, every person's profile, the audit trail, publishing protocols,
-- approving clinicians, and the roles of everyone else — including the power
-- to demote the real admin, which script 42 would then permit, because by
-- its count another active admin exists. The guard would be protecting the
-- attacker.
--
-- Two more columns in the same breath, and they are not smaller:
--
--   · `company_id`. `my_company_id()` reads this row. Rewriting it moves the
--     person into another company and hands them that company's aggregates —
--     a client of ours reading another client's wellbeing data. (A NEW
--     profile is still held by the roster guard of script 25, which checks
--     the address against the company's approved list. An UPDATE never went
--     past it.)
--   · `active`. An account switched off comes back on. That includes one
--     suspended because the person was found to be under eighteen (D-11),
--     which is the one suspension that exists to be irreversible from the
--     product.
--
-- This is not something scripts 41–43 introduced; it has been true since the
-- policies were written. It is here because it reaches past all three of
-- them, and because fixing security in place is the standing instruction.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS ADDS
--
-- A trigger that freezes the privileged columns for the person themselves,
-- and leaves everything else exactly as it was. It is deliberately the
-- narrowest rule that closes the hole:
--
--   · The columns a person really does edit — name, locale, country, birth
--     date, personal email, avatar, how they are addressed — are untouched.
--     Those are every field `updateMyProfile`, `setMyAvatar` and
--     `setAddressedAs` actually send.
--   · An admin keeps doing all of it. The console's role picker and its
--     on/off switch go through this trigger unchanged.
--   · A SIGN-UP still chooses its own role, because it must: a person
--     registers as `b2c_user`, a clinician as `therapist`, a company
--     referent as `hr_admin`. Only the two roles that are never
--     self-service are refused — `admin` and `sales`. The product agrees
--     already: those two doors hide the "create an account" link
--     (`noSignup` in `src/auth/AuthScreen.tsx`).
--   · The SQL editor is not blocked. With no signed-in user there is no
--     `auth.uid()`, and the write is taken to be yours: that is what
--     `seed_demo.sql`, `16-sales-role.sql` and the recovery `update` at the
--     foot of script 42 are, and breaking them would take away the way back
--     from a locked console.
--
-- WHAT IT DOES NOT DO. It says nothing about the service-role key, which
-- also has no `auth.uid()`. That key is a server-side secret and must never
-- reach a client bundle — the rule it is already held to.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. An admin who cannot sign in is not an admin
-- ---------------------------------------------------------------------------
-- `is_admin()` has always ignored `active`, so an account switched off in the
-- console still passed every policy that asks for an admin — over REST, where
-- the console's own screens are not in the way. The trigger below has to ask
-- "is this caller an admin" and must not accept a disabled one, and the same
-- answer is the right one everywhere else it is asked.
--
-- Nothing else about the function changes: same name, same signature, same
-- SECURITY DEFINER, so every policy using it keeps working.
create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (
       select 1 from profiles
        where auth_uid = auth.uid()
          and role = 'admin'
          and coalesce(active, true)
     ) $$;

-- ---------------------------------------------------------------------------
-- 2. The guard
-- ---------------------------------------------------------------------------
create or replace function profiles_no_self_promotion() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- No signed-in user: the SQL editor, or a server holding the service key.
  -- Both answer to the project owner, not to a role in this table.
  if auth.uid() is null then
    return new;
  end if;

  -- An admin administers. That is the whole job of the console.
  if is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Sign-up picks its own role, and must: person, clinician, company
    -- referent. The two that are never self-service are refused here.
    if new.role::text in ('admin', 'sales') then
      raise exception 'this role is not self-service — an admin assigns it'
        using errcode = 'P0001', hint = 'ROLE_NOT_SELF_SERVICE';
    end if;
    return new;
  end if;

  -- UPDATE, by the person whose row it is.
  if new.role::text is distinct from old.role::text then
    raise exception 'a role is assigned by an admin, not by the account itself'
      using errcode = 'P0001', hint = 'ROLE_NOT_SELF_SERVICE';
  end if;
  if new.active is distinct from old.active then
    raise exception 'an account is switched on and off from the admin console'
      using errcode = 'P0001', hint = 'ACTIVE_NOT_SELF_SERVICE';
  end if;
  if new.company_id is distinct from old.company_id then
    raise exception 'a company is joined at registration, with the company code and the approved address list'
      using errcode = 'P0001', hint = 'COMPANY_NOT_SELF_SERVICE';
  end if;

  return new;
end $$;

drop trigger if exists profiles_no_self_promotion on profiles;
create trigger profiles_no_self_promotion
  before insert or update on profiles
  for each row execute function profiles_no_self_promotion();

-- ---------------------------------------------------------------------------
-- 3. Who is an admin right now, and did anybody already do this?
-- ---------------------------------------------------------------------------
-- Read-only, and worth actually reading. An admin here you do not recognise
-- is not a finding about this script: it is an account to switch off.
select p.email,
       p.role::text   as role,
       p.active,
       p.company_id,
       p.created_at
  from profiles p
 where p.role::text in ('admin', 'sales')
 order by p.role::text, p.created_at;

-- Admins who can no longer pass `is_admin()` after step 1 — switched off, or
-- with no login behind them. Expect no rows; anything here is an account that
-- believed it still had the console.
select p.email,
       p.active,
       (p.auth_uid is null) as has_no_login
  from profiles p
 where p.role::text = 'admin'
   and (not coalesce(p.active, true) or p.auth_uid is null);

-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
