-- ============================================================================
-- Good Loop — SCRIPT 2 of 2: who is allowed to publish a protocol
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- It changes nothing. It only tells you which accounts can write to the
-- catalog, because that is the one thing script 1 could not check for you:
-- the SQL editor bypasses the permission rule that a publish has to pass.
--
-- Find the address you sign into the admin app with in this list.
--
--   · It is there, role = admin  → you can publish. Nothing to do.
--   · It is NOT there            → run the one line at the bottom.
-- ============================================================================

select
  email,
  role,
  active,
  case
    when role <> 'admin' then 'CANNOT publish — needs role = admin'
    when not active then 'CANNOT publish — account is deactivated'
    when auth_uid is null then 'CANNOT publish — not linked to a login yet'
    else 'can publish'
  end as verdict
from profiles
order by (role = 'admin') desc, email;


-- If your address is missing or does not say "can publish", edit the address
-- in the line below, remove the two dashes at the start, and run it:

-- update profiles set role = 'admin', active = true where email = 'YOUR@EMAIL.HERE';
