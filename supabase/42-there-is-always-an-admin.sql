-- ============================================================================
-- Good Loop — SCRIPT 42: the console cannot be locked for everybody
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- console → Utenti e ruoli offers every account a role picker, and the roles
-- in it include `admin`. The write behind it is a bare update:
--
--   update profiles set role = 'b2c_user' where id = …
--
-- allowed by `profiles_admin_all`, which lets an admin write any profile —
-- their own among them. So an admin can take the admin role away from the
-- last admin. Nothing in the client, the policy or the table says no.
--
-- What that costs is not a row. The console is the only way to publish a
-- protocol, approve a clinician, switch an account off, read the audit trail
-- or change the roles back. Losing the last admin means losing all of it,
-- and the only way back is a SQL editor — which is to say: not something the
-- team can do from the product.
--
-- Two ways to arrive there, and the second one is the likely one:
--
--   · demoting someone else, then yourself, in that order
--   · one admin account, held by one person, demoted by mistake from a
--     dropdown that looks like every other dropdown on the screen
--
-- The same applies to the switch beside it: an admin deactivated is an admin
-- who cannot sign in, so `active = false` on the last one locks the door just
-- as firmly as a role change.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS ADDS
--
-- A trigger on `profiles` that counts what would be LEFT and refuses the
-- write when the answer is nobody. In the database rather than the console
-- because the policy allows the raw update: a check in the client is a check
-- somebody can go around with a REST call, and this is one of the few rules
-- where going around it cannot be undone from inside the product.
--
-- It is deliberately the narrowest rule that closes the hole:
--
--   · It only ever refuses the LAST one. Demoting an admin while another
--     remains is ordinary administration and stays ordinary.
--   · It says nothing about who that admin is. Protecting one address
--     (`admin@goodloop.app`) would be a fixture written into a constraint,
--     and would still let that account be the one that is demoted while it
--     is the only one.
--   · It does not touch INSERT. Creating accounts is not how this breaks.
--   · It refuses a DELETE of the last admin too, for the same reason and in
--     the same breath — `admin_delete_profile()` is an admin's own function
--     and would otherwise reach it.
--
-- WHAT IT DOES NOT DO. It cannot stop the last admin from being locked out
-- by something outside this table — a forgotten password with no mail
-- delivery, say. That is why the recovery path at the end of this file
-- exists, written out so it can be found when it is needed.
-- ============================================================================

create or replace function profiles_keep_an_admin() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  others int;
begin
  -- Was this row an ACTIVE admin before the write? If not, nothing it can
  -- become reduces the number of them.
  if not (old.role::text = 'admin' and coalesce(old.active, true)) then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  -- Will it still be one after? (An UPDATE that changes neither column is
  -- the common case — a name, a locale — and must cost nothing.)
  if tg_op = 'UPDATE'
     and new.role::text = 'admin'
     and coalesce(new.active, true) then
    return new;
  end if;

  select count(*) into others
    from profiles p
   where p.role::text = 'admin'
     and coalesce(p.active, true)
     and p.id <> old.id;

  if others = 0 then
    raise exception 'this is the last active admin — give another account the admin role first'
      using errcode = 'P0001', hint = 'LAST_ADMIN';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end $$;

drop trigger if exists profiles_keep_an_admin on profiles;
create trigger profiles_keep_an_admin
  before update or delete on profiles
  for each row execute function profiles_keep_an_admin();

-- ---------------------------------------------------------------------------
-- How many there are right now
-- ---------------------------------------------------------------------------
-- Read-only. One active admin is enough for the trigger to protect; two is
-- what an organisation wants, so that losing a password is not an incident.
select count(*) filter (where role::text = 'admin' and coalesce(active, true)) as active_admins,
       count(*) filter (where role::text = 'admin' and not coalesce(active, true)) as switched_off_admins
  from profiles;

-- ---------------------------------------------------------------------------
-- THE WAY BACK, if a console is ever locked anyway
-- ---------------------------------------------------------------------------
-- Run from the SQL editor, which answers to the project owner rather than to
-- a role in the table. Put the address in, uncomment, run:
--
--   update profiles set role = 'admin', active = true
--    where email = 'someone@goodloop.app';
--
-- The trigger does not stand in the way of this: it refuses writes that
-- REMOVE the last admin, never one that adds another.

-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
