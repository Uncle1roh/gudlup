-- ============================================================================
-- Good Loop — SCRIPT 9: promo codes
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- The same block is in setup.sql; this file is for a database that is already
-- live and only needs the promo codes added.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PROMO CODES
--
-- An admin mints a code with a discount percentage; a person types it at
-- registration and the account carries it. The profile keeps a SNAPSHOT of the
-- code and its percentage, so deleting a code stops new sign-ups using it and
-- never changes what an existing account was promised.
--
-- The percentage on a profile is written by the trigger, never by the client:
-- the browser sends the code, the database looks up what it is worth. A person
-- cannot change either column on their own profile after sign-up.
create table if not exists promo_codes (
  code         text primary key check (code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  discount_pct int  not null check (discount_pct between 1 and 100),
  created_at   timestamptz not null default now(),
  created_by   text
);
alter table promo_codes enable row level security;
drop policy if exists promo_codes_admin on promo_codes;
create policy promo_codes_admin on promo_codes
  for all using (is_admin()) with check (is_admin());

alter table profiles add column if not exists promo_code text;
alter table profiles add column if not exists promo_discount_pct int;

-- What a code is worth, or null. Callable BEFORE an account exists (anon), so
-- the sign-up form can answer while the person is still typing; it reveals the
-- percentage of one code at a time and nothing else about the table.
create or replace function check_promo_code(p_code text) returns int
  language sql stable security definer set search_path = public as $$
  select discount_pct from promo_codes where code = upper(trim(p_code))
$$;
revoke all on function check_promo_code(text) from public;
grant execute on function check_promo_code(text) to anon, authenticated;

create or replace function profiles_promo_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- after sign-up only an admin may touch the promo columns
  if tg_op = 'UPDATE' and not is_admin() then
    new.promo_code := old.promo_code;
    new.promo_discount_pct := old.promo_discount_pct;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.promo_code is not distinct from old.promo_code then
    return new;
  end if;
  if new.promo_code is null or trim(new.promo_code) = '' then
    new.promo_code := null;
    new.promo_discount_pct := null;
    return new;
  end if;
  new.promo_code := upper(trim(new.promo_code));
  select discount_pct into new.promo_discount_pct from promo_codes where code = new.promo_code;
  if new.promo_discount_pct is null then
    raise exception 'unknown promo code' using errcode = 'P0001', hint = 'PROMO_UNKNOWN';
  end if;
  return new;
end $$;
drop trigger if exists profiles_promo_guard on profiles;
create trigger profiles_promo_guard
  before insert or update on profiles
  for each row execute function profiles_promo_guard();

notify pgrst, 'reload schema';
