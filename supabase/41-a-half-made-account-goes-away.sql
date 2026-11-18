-- ============================================================================
-- Good Loop — SCRIPT 41: a half-made account goes away instead of burning
--                        the address
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- Signing up is TWO writes against two different services, and only the
-- first of them is a transaction:
--
--   1. auth.signUp()            → creates the login
--   2. insert into profiles     → creates the person
--
-- Step 2 can refuse, and legitimately. `profiles.company_id` is a foreign
-- key to `companies(id)`, so a company code with one wrong character is a
-- foreign-key violation; the roster trigger refuses an address the employer
-- has not approved; a promo code can be unknown. In every one of those cases
-- the sign-up form showed the right sentence — and left the login behind.
--
-- What that costs the person is worse than the refusal they read:
--
--   · The address is now TAKEN. Trying again says "This address already has
--     an account", which is true and unhelpful: the account has no profile.
--   · Signing in succeeds and lands nowhere, because the role is read from
--     the profile that was never written.
--   · Nothing in the product can undo it. `delete_my_account()` starts from
--     `current_profile()`, which is null for exactly these accounts, so it
--     raises 'not signed in' and refuses.
--
-- So a typo in a company code permanently consumed a work address. In a
-- pilot where the addresses are real employees of one company, that is the
-- kind of defect that is discovered by the person it happens to.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS ADDS
--
-- One function, which the sign-up form calls when step 2 fails: it removes
-- the login that step 1 made, so the address is free and the person can
-- correct the code and try again.
--
-- WHY IT IS SAFE, which matters because it deletes from `auth.users`:
--
--   · It takes no argument. There is nothing to pass it but your own
--     session, so it cannot be aimed at somebody else.
--   · It refuses the moment a profile exists. That is the whole guard: an
--     account with a profile is a real account, and the path for deleting
--     one of those is `delete_my_account()`, which detaches clinical records
--     and keeps what the law requires. This function only ever reaches an
--     account that is half-made, and a half-made account owns nothing —
--     no sessions, no readings, no consents, no company seat.
--   · `security definer` because `auth.users` is not the caller's to write;
--     `search_path` is pinned for the same reason every other definer
--     function here pins it.
--
-- It is written to be callable by `authenticated` only: the caller has a
-- session by definition — step 1 is what gave them one.
-- ============================================================================

-- A rename of the (empty) argument list is not possible with `create or
-- replace`, and this file has to be re-runnable from any earlier state, so
-- the drop is explicit — the same lesson as supabase/25.
drop function if exists abandon_orphan_signup();

create or replace function abandon_orphan_signup() returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  -- The guard. A profile means a real account, and this is not the function
  -- that deletes one of those.
  if exists (select 1 from profiles where auth_uid = uid) then
    raise exception 'this account has a profile — delete_my_account() is the path for it'
      using errcode = 'P0001';
  end if;

  delete from auth.users where id = uid;
end $$;

revoke all on function abandon_orphan_signup() from public;
grant execute on function abandon_orphan_signup() to authenticated;

-- ---------------------------------------------------------------------------
-- The ones already stranded
-- ---------------------------------------------------------------------------
-- Read-only: every login with no profile, oldest first. These are the
-- addresses the defect has already consumed — in the pilot's case, people
-- who tried a company code while the codes were not being recognised.
--
-- The rows this prints can be removed with the statement underneath it,
-- which is COMMENTED OUT on purpose: it deletes logins, and it is yours to
-- run once you have looked at the list and recognised the addresses.
select u.id,
       u.email,
       u.created_at,
       u.last_sign_in_at
  from auth.users u
  left join profiles p on p.auth_uid = u.id
 where p.id is null
 order by u.created_at;

-- UNCOMMENT TO CLEAN UP, once the list above is what you expect:
--
-- delete from auth.users u
--  where not exists (select 1 from profiles p where p.auth_uid = u.id);

-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
