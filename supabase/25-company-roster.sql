-- ============================================================================
-- Good Loop — SCRIPT 25: the company's approved addresses
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
-- The same block is in setup.sql; this file is for a database that is live.
--
-- WHY
--
-- A company code is one secret shared by everyone, which makes it two
-- problems: it travels (a leaked code enrols strangers against paid licences)
-- and it cannot be taken back from ONE person (somebody who leaves keeps the
-- code they were given on their first day). Rotating the code punishes the
-- whole company for one departure.
--
-- So the code becomes the first of two gates. The second is a list of
-- addresses the employer approves — kept by HR, enforced here, never by the
-- browser.
--
--   code          says WHICH company, and what the convention opens
--   approved list says WHO inside it may use the code at all
--
-- Properties, deliberately:
--
--   · A company with NO list keeps working exactly as before — code only.
--     Adding the first address is what arms the gate, and it is an explicit
--     act by HR, not a migration that locks a tenant out overnight.
--   · The gate is a TRIGGER on profiles, so it holds for every path that can
--     write a company onto an account, including a hand-crafted request that
--     never went through our sign-up form.
--   · Turning an address off CUTS the account loose the same second
--     (profiles.company_id → null): the person keeps their account, their
--     history and their individual use, and loses the employer's convention —
--     the therapists it opened, the EAP it carried, the licence it consumed.
--   · The list carries no wellbeing data and no account state. HR learns
--     nothing about who uses the app from reading it — which is the whole
--     point of only ever showing them aggregates (SPN-01..08, LGPD).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
create table if not exists company_members (
  company_id   text not null references companies(id) on delete cascade,
  -- stored folded: an address is the same person however it was typed
  email        text not null check (email = lower(email) and email like '%@%.%'),
  name         text,
  -- whatever the employer already calls this person: badge number, payroll
  -- id, "Marketing". Free text, theirs, never read by the app.
  employee_ref text,
  enabled      boolean not null default true,
  added_at     timestamptz not null default now(),
  added_by     text,
  disabled_at  timestamptz,
  disabled_by  text,
  primary key (company_id, email)
);
create index if not exists company_members_email_idx on company_members (email);

alter table company_members enable row level security;

-- HR reads its own company's list; an admin reads any. Every WRITE goes
-- through the functions below instead, because disabling an address has to
-- cut the live account loose in the same statement — a policy that let HR
-- flip the column directly would leave the two out of step.
drop policy if exists company_members_hr_read on company_members;
create policy company_members_hr_read on company_members
  for select using (is_admin() or (is_hr() and company_id = my_company_id()));

-- ---------------------------------------------------------------------------
-- The question the sign-up form asks, before an account exists
--
-- Answerable by anon on purpose: the door has to say WHY a code did not take
-- while the person is still looking at the form. It answers about ONE address
-- the caller already typed, and it does not distinguish "never listed" from
-- "turned off" — both are DENIED — so the code cannot be used to read the
-- employer's list back out one address at a time.
-- ---------------------------------------------------------------------------
create or replace function company_email_status(p_company_id text, p_email text)
  returns text language sql stable security definer set search_path = public as $$
  select case
    when coalesce(trim(p_company_id), '') = '' then 'NO_COMPANY'
    when not exists (
      select 1 from company_members m where m.company_id = upper(trim(p_company_id))
    ) then 'NO_ROSTER'
    when exists (
      select 1 from company_members m
       where m.company_id = upper(trim(p_company_id))
         and m.email = lower(trim(coalesce(p_email, '')))
         and m.enabled
    ) then 'OK'
    else 'DENIED'
  end
$$;
revoke all on function company_email_status(text, text) from public;
grant execute on function company_email_status(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The gate itself
--
-- Fires only when an account is being GIVEN a company — a sign-up, or a
-- profile that gains one later. An existing link is never re-checked here, so
-- building a list for the first time cannot disconnect anybody; HR does that
-- knowingly, with hr_revoke_unlisted_members() below.
-- ---------------------------------------------------------------------------
create or replace function profiles_company_roster_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.company_id is not distinct from old.company_id then return new; end if;
  -- the employer's own people: an HR admin and a clinician are not employees
  -- consuming a licence, and are not on the list
  if new.role::text <> 'b2c_user' then return new; end if;
  -- provisioned by hand, by someone who can already read the whole table
  if is_admin() then return new; end if;
  if company_email_status(new.company_id, coalesce(new.email, '')) = 'DENIED' then
    raise exception 'address is not approved for this company'
      using errcode = 'P0001', hint = 'COMPANY_NOT_APPROVED';
  end if;
  return new;
end $$;
drop trigger if exists profiles_company_roster_guard on profiles;
create trigger profiles_company_roster_guard
  before insert or update on profiles
  for each row execute function profiles_company_roster_guard();

-- ---------------------------------------------------------------------------
-- What HR does with the list. Company comes from my_company_id(), never from
-- the caller: an HR account cannot write another company's roster by asking.
-- ---------------------------------------------------------------------------

-- Add or update rows. `p_rows` is [{ email, name, employee_ref }, …] — one
-- address typed into the form, or a few hundred from a spreadsheet, same call.
-- An address already on the list keeps its enabled flag: re-importing last
-- year's export must never quietly re-admit somebody HR turned off.
create or replace function hr_add_company_members(p_rows jsonb)
  returns int language plpgsql security definer set search_path = public as $$
declare
  v_cid text := my_company_id();
  v_actor text;
  v_n int := 0;
begin
  if not (is_hr() or is_admin()) then raise exception 'not allowed'; end if;
  if v_cid is null then raise exception 'no company on this account'; end if;
  select email into v_actor from profiles where auth_uid = auth.uid();

  with incoming as (
    select distinct on (lower(trim(r->>'email')))
           lower(trim(r->>'email'))             as email,
           nullif(trim(r->>'name'), '')         as name,
           nullif(trim(r->>'employee_ref'), '') as employee_ref
      from jsonb_array_elements(p_rows) r
     where lower(trim(coalesce(r->>'email', ''))) like '%@%.%'
     order by 1
  )
  insert into company_members (company_id, email, name, employee_ref, added_by)
  select v_cid, email, name, employee_ref, v_actor from incoming
  on conflict (company_id, email) do update
     set name         = coalesce(excluded.name, company_members.name),
         employee_ref = coalesce(excluded.employee_ref, company_members.employee_ref);

  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function hr_add_company_members(jsonb) from public;
grant execute on function hr_add_company_members(jsonb) to authenticated;

-- Turn one address on or off. OFF is the one that matters: it cuts the live
-- account loose in the same transaction, which is what "cancel the access of
-- somebody who left" has to mean. ON re-links an account that is not already
-- with another company — a rehire gets their convention back.
create or replace function hr_set_member_access(p_email text, p_enabled boolean)
  returns void language plpgsql security definer set search_path = public as $$
declare
  v_cid text := my_company_id();
  v_actor text;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not (is_hr() or is_admin()) then raise exception 'not allowed'; end if;
  if v_cid is null then raise exception 'no company on this account'; end if;
  select email into v_actor from profiles where auth_uid = auth.uid();

  update company_members
     set enabled     = p_enabled,
         disabled_at = case when p_enabled then null else now() end,
         disabled_by = case when p_enabled then null else v_actor end
   where company_id = v_cid and email = v_email;
  if not found then raise exception 'address is not on this list'; end if;

  if p_enabled then
    update profiles set company_id = v_cid
     where lower(email) = v_email and company_id is null and role::text = 'b2c_user';
  else
    update profiles set company_id = null
     where lower(email) = v_email and company_id = v_cid and role::text = 'b2c_user';
  end if;
end $$;
revoke all on function hr_set_member_access(text, boolean) from public;
grant execute on function hr_set_member_access(text, boolean) to authenticated;

-- Off the list entirely. Same consequence as disabling, plus the row goes:
-- for an address added by mistake, where leaving a disabled line behind would
-- be a record of somebody who never belonged here.
create or replace function hr_remove_company_member(p_email text)
  returns void language plpgsql security definer set search_path = public as $$
declare
  v_cid text := my_company_id();
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not (is_hr() or is_admin()) then raise exception 'not allowed'; end if;
  if v_cid is null then raise exception 'no company on this account'; end if;
  update profiles set company_id = null
   where lower(email) = v_email and company_id = v_cid and role::text = 'b2c_user';
  delete from company_members where company_id = v_cid and email = v_email;
end $$;
revoke all on function hr_remove_company_member(text) from public;
grant execute on function hr_remove_company_member(text) to authenticated;

-- How many accounts are on the company code today WITHOUT being on the list:
-- what a leaked code actually cost, as one number. A count and nothing else —
-- no addresses, no names, nothing about what any of them did in the app.
create or replace function hr_unlisted_member_count()
  returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from profiles p
   where p.company_id = my_company_id()
     and (is_hr() or is_admin())
     and p.role::text = 'b2c_user'
     and not exists (
       select 1 from company_members m
        where m.company_id = p.company_id and m.email = lower(p.email) and m.enabled
     )
$$;
revoke all on function hr_unlisted_member_count() from public;
grant execute on function hr_unlisted_member_count() to authenticated;

-- Close the door on everyone the list does not name. Deliberate, confirmed in
-- the console, and reported as a count. Refused while the list is empty,
-- because "approve nobody" would disconnect the entire company.
create or replace function hr_revoke_unlisted_members()
  returns int language plpgsql security definer set search_path = public as $$
declare
  v_cid text := my_company_id();
  v_n int := 0;
begin
  if not (is_hr() or is_admin()) then raise exception 'not allowed'; end if;
  if v_cid is null then raise exception 'no company on this account'; end if;
  if not exists (select 1 from company_members where company_id = v_cid and enabled) then
    raise exception 'the approved list is empty';
  end if;
  update profiles set company_id = null
   where company_id = v_cid
     and role::text = 'b2c_user'
     and not exists (
       select 1 from company_members m
        where m.company_id = v_cid and m.email = lower(profiles.email) and m.enabled
     );
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function hr_revoke_unlisted_members() from public;
grant execute on function hr_revoke_unlisted_members() to authenticated;

notify pgrst, 'reload schema';
