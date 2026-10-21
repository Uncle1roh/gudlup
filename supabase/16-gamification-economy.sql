-- ============================================================================
-- GAMIFICATION · 1 — THE LOOPS ECONOMY            (docs/gamification/SPEC.md §2)
--
-- For a database that is already live. The same block is in setup.sql.
-- Safe to re-run.
--
-- Points measure care: they come only from listening, are never spent and
-- never decrease. Loops are the currency: they come from Points plus bonuses,
-- and are kept in integer centiloops (1 Loop = 100). The client never sends
-- an amount (GAM-R8): a session row goes in, and credit_session() — fired by
-- a trigger — works out what it earns and writes it to two append-only
-- ledgers. The same rules are in src/gamification/economy.ts for the mock
-- provider; src/gamification/__fixtures__/economy.json holds the two
-- together (supabase/tests/economy_parity.sql + tools/test-gam-economy.ts).
--
--   GAM-R1  nothing decreases: the ledgers take no UPDATE, and no client role
--           can write them at all
--   GAM-R3  an SOS session earns nothing and is not even counted
--   GAM-R9  a company multiplier is a SEPARATE ledger entry on listening
--           Loops only — Points, ranks and bonuses never see it
-- ============================================================================

do $$ begin
  create type loops_entry_type as enum (
    'earn_listening', 'earn_company_multiplier', 'achievement_bonus',
    'challenge_bonus', 'redemption', 'redemption_refund', 'admin_adjustment');
exception when duplicate_object then null; end $$;
do $$ begin create type funding_source as enum ('goodloop', 'company'); exception when duplicate_object then null; end $$;

-- What a session row carries for the economy. listened_sec is what the player
-- measured (pauses, background and seeks excluded); the server caps it at the
-- nominal length, so a client cannot claim more than the session holds.
alter table sessions add column if not exists listened_sec   int;
alter table sessions add column if not exists is_sos         boolean not null default false;
alter table sessions add column if not exists stereo_checked boolean not null default false;
do $$ begin
  alter table sessions add constraint sessions_listened_sec_nonneg check (listened_sec is null or listened_sec >= 0);
exception when duplicate_object then null; end $$;

-- ---- settings (one row; SPEC §2.2 and §12 defaults; Admin › Economia) ------
create table if not exists economy_settings (
  id                            boolean primary key default true check (id),
  points_per_minute             int not null default 1   check (points_per_minute >= 0),
  points_per_completed_session  int not null default 10  check (points_per_completed_session >= 0),
  daily_minutes_cap             int not null default 120 check (daily_minutes_cap >= 0),
  daily_completion_bonus_cap    int not null default 4   check (daily_completion_bonus_cap >= 0),
  loops_per_point               numeric(10,4) not null default 0.1 check (loops_per_point >= 0),
  min_contribution_points       int not null default 30  check (min_contribution_points >= 0),
  count_clinical_sessions       boolean not null default false,
  loops_expiry_months           int check (loops_expiry_months is null or loops_expiry_months > 0),
  geo_min_active_users          int not null default 50  check (geo_min_active_users >= 1),
  -- SPN-02 / D-08: sponsor figures from fewer than 25 people are suppressed.
  -- The floor is in the schema, so no setting can lower it.
  hr_min_cohort                 int not null default 25  check (hr_min_cohort >= 25),
  -- A session row says when it ended, and the client writes the row. Without
  -- a bound, rows dated to past days would each find that day's caps unused.
  -- Older than this, a session is credited as of now. null = trust ended_at
  -- (only for a controlled backfill or the parity proof).
  max_backdate_hours            int default 24 check (max_backdate_hours is null or max_backdate_hours >= 0),
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid references profiles(id) on delete set null
);
insert into economy_settings (id) values (true) on conflict do nothing;

alter table economy_settings enable row level security;
drop policy if exists economy_settings_read on economy_settings;
create policy economy_settings_read on economy_settings for select using (auth.uid() is not null);
drop policy if exists economy_settings_admin on economy_settings;
create policy economy_settings_admin on economy_settings
  for update using (is_admin()) with check (is_admin());

-- ---- company affiliation, as history ----------------------------------------
-- profiles.company_id says where someone is NOW. The multiplier needs where
-- they were when a session ENDED (SPEC §7.1, §12 "multiplier stops at
-- affiliation end"), so every change of company_id opens and closes a row.
create table if not exists company_affiliations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  company_id  text not null references companies(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists company_affiliations_open on company_affiliations(user_id) where ended_at is null;
create index if not exists company_affiliations_company on company_affiliations(company_id, started_at);

create or replace function gam_track_affiliation() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.company_id is not distinct from new.company_id then return null; end if;
  update company_affiliations set ended_at = greatest(now(), started_at)
   where user_id = new.id and ended_at is null;
  if new.company_id is not null then
    insert into company_affiliations (user_id, company_id, started_at)
    values (new.id, new.company_id, case when tg_op = 'INSERT' then new.created_at else now() end);
  end if;
  return null;
end $$;
drop trigger if exists profiles_track_affiliation on profiles;
create trigger profiles_track_affiliation after insert or update of company_id on profiles
  for each row execute function gam_track_affiliation();

-- Everyone already linked gets their open row, once.
insert into company_affiliations (user_id, company_id, started_at)
select p.id, p.company_id, p.created_at
  from profiles p
 where p.company_id is not null
   and not exists (select 1 from company_affiliations a where a.user_id = p.id and a.ended_at is null);

alter table company_affiliations enable row level security;
drop policy if exists company_affiliations_read on company_affiliations;
create policy company_affiliations_read on company_affiliations
  for select using (user_id = current_profile() or is_admin());

-- ---- the company add-on (SPEC §7.1). The Admin UI comes in slice 6; the
--      multiplier needs the tables now. ---------------------------------------
create table if not exists addon_plans (
  id                         text primary key,
  name                       text not null,
  loops_multiplier           numeric(4,2) not null check (loops_multiplier >= 1 and loops_multiplier <= 5),
  allows_company_challenges  boolean not null default true,
  allows_company_benefits    boolean not null default true,
  allows_tag_filter          boolean not null default true,
  active                     boolean not null default true,
  created_at                 timestamptz not null default now()
);
-- Names and values are placeholders (SPEC §7.1); editable.
insert into addon_plans (id, name, loops_multiplier) values
  ('essencial', 'Essencial', 1.00),
  ('plus',      'Plus',      1.25),
  ('premium',   'Premium',   1.50),
  ('max',       'Max',       2.00)
on conflict do nothing;

create table if not exists company_addon_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references companies(id) on delete cascade,
  plan_id     text not null references addon_plans(id),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  status      text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_at  timestamptz not null default now(),
  created_by  uuid references profiles(id) on delete set null,
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists company_addon_subscriptions_company on company_addon_subscriptions(company_id, starts_at);

alter table addon_plans enable row level security;
drop policy if exists addon_plans_read on addon_plans;
create policy addon_plans_read on addon_plans for select using (auth.uid() is not null);
drop policy if exists addon_plans_admin on addon_plans;
create policy addon_plans_admin on addon_plans for all using (is_admin()) with check (is_admin());

alter table company_addon_subscriptions enable row level security;
drop policy if exists addon_subs_admin on company_addon_subscriptions;
create policy addon_subs_admin on company_addon_subscriptions for all using (is_admin()) with check (is_admin());
drop policy if exists addon_subs_hr_read on company_addon_subscriptions;
create policy addon_subs_hr_read on company_addon_subscriptions
  for select using (is_hr() and company_id = my_company_id());

-- ---- the ledgers (SPEC §2.5) ------------------------------------------------
create table if not exists points_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  source_type     text not null,
  source_id       text not null,
  points          int  not null check (points >= 0),
  period_month    date not null,                 -- first day of the São Paulo month
  city_ibge_code  text,                          -- snapshotted at credit time (slice 3)
  created_at      timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);
create index if not exists points_ledger_user on points_ledger(user_id, created_at);
create index if not exists points_ledger_month_city on points_ledger(period_month, city_ibge_code);

create table if not exists loops_ledger (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles(id) on delete cascade,
  entry_type          loops_entry_type not null,
  amount_centi        int not null check (amount_centi <> 0),     -- signed
  funding_source      funding_source not null,
  company_id          text references companies(id) on delete set null,
  multiplier_applied  numeric(4,2),
  source_type         text not null,
  source_id           text not null,
  created_at          timestamptz not null default now(),
  unique (user_id, entry_type, source_type, source_id)
);
create index if not exists loops_ledger_user on loops_ledger(user_id, created_at);
create index if not exists loops_ledger_company_month on loops_ledger(company_id, created_at) where company_id is not null;

-- What each São Paulo day has used of the caps, and how many sessions it held.
create table if not exists gam_daily_usage (
  user_id             uuid not null references profiles(id) on delete cascade,
  day                 date not null,
  eligible_minutes    int  not null default 0,
  completion_bonuses  int  not null default 0,
  sessions            int  not null default 0,
  primary key (user_id, day)
);

-- Append-only. Deleting is left to the profile cascade — the right to
-- disappear (delete_my_account) removes the person's ledgers with them.
create or replace function gam_ledger_append_only() returns trigger
  language plpgsql as $$
begin
  raise exception '% is append-only: write a new entry instead', tg_table_name;
end $$;
drop trigger if exists points_ledger_append_only on points_ledger;
create trigger points_ledger_append_only before update on points_ledger
  for each row execute function gam_ledger_append_only();
drop trigger if exists loops_ledger_append_only on loops_ledger;
create trigger loops_ledger_append_only before update on loops_ledger
  for each row execute function gam_ledger_append_only();

alter table points_ledger enable row level security;
alter table loops_ledger enable row level security;
alter table gam_daily_usage enable row level security;
drop policy if exists points_ledger_read on points_ledger;
create policy points_ledger_read on points_ledger for select using (user_id = current_profile() or is_admin());
drop policy if exists loops_ledger_read on loops_ledger;
create policy loops_ledger_read on loops_ledger for select using (user_id = current_profile() or is_admin());
drop policy if exists gam_daily_usage_read on gam_daily_usage;
create policy gam_daily_usage_read on gam_daily_usage for select using (user_id = current_profile() or is_admin());
-- No insert/update/delete policy, and no privilege either: only the
-- SECURITY DEFINER functions below write here (SPEC §7.4).
revoke insert, update, delete, truncate on points_ledger, loops_ledger, gam_daily_usage from anon, authenticated;

-- ---- helpers ----------------------------------------------------------------
create or replace function gam_sp_day(p_at timestamptz) returns date
  language sql stable as
  $$ select (p_at at time zone 'America/Sao_Paulo')::date $$;

-- The multiplier in force for a person at an instant: an open affiliation to
-- a company whose add-on subscription is active at that instant. The highest
-- wins if two overlap in a changeover. Mirrors multiplierAt() in economy.ts.
create or replace function gam_multiplier_at(p_user uuid, p_at timestamptz)
  returns table (company_id text, multiplier numeric)
  language sql stable security definer set search_path = public as $$
  select a.company_id, pl.loops_multiplier
    from company_affiliations a
    join company_addon_subscriptions s on s.company_id = a.company_id
    join addon_plans pl on pl.id = s.plan_id
   where a.user_id = p_user
     and a.started_at <= p_at and (a.ended_at is null or a.ended_at > p_at)
     and s.status = 'active'
     and s.starts_at <= p_at and (s.ends_at is null or s.ends_at > p_at)
   order by pl.loops_multiplier desc
   limit 1
$$;
revoke all on function gam_multiplier_at(uuid, timestamptz) from public;

-- ---- crediting a session ----------------------------------------------------
-- Mirrors computeSessionCredit() in src/gamification/economy.ts.
--   points  = floor(listened minutes, capped at nominal and at the day) × ppm
--           + completion bonus while the day has bonuses left
--   base    = round(points × loops_per_point × 100)                centiloops
--   company = round(base × (multiplier − 1))      separate entry, company-funded
-- Idempotent: a session is credited once, whatever calls it again.
create or replace function credit_session(p_session uuid, p_trust_ended_at boolean default false) returns void
  language plpgsql security definer set search_path = public as $$
declare
  s          sessions%rowtype;
  cfg        economy_settings%rowtype;
  u          gam_daily_usage%rowtype;
  v_user     uuid;
  v_at       timestamptz;
  v_day      date;
  v_eligible int;
  v_bonus    boolean;
  v_points   int;
  v_base     int;
  v_company  int := 0;
  v_mult     numeric;
  v_company_id text;
begin
  select * into s from sessions where id = p_session;
  if not found or s.b2c_profile_id is null then return; end if;
  v_user := s.b2c_profile_id;
  select * into cfg from economy_settings where id;

  if s.is_sos then return; end if;                                          -- GAM-R3
  if s.kind = 'b2b' and not cfg.count_clinical_sessions then return; end if;

  -- One credit at a time per person: the day's caps are read and spent here.
  perform pg_advisory_xact_lock(hashtextextended('gam:' || v_user::text, 0));
  if exists (select 1 from points_ledger
              where user_id = v_user and source_type = 'session' and source_id = p_session::text) then
    return;
  end if;

  v_at := least(coalesce(s.ended_at, now()), now());
  if not p_trust_ended_at and cfg.max_backdate_hours is not null
     and v_at < now() - make_interval(hours => cfg.max_backdate_hours) then
    v_at := now();
  end if;
  v_day := gam_sp_day(v_at);

  insert into gam_daily_usage (user_id, day) values (v_user, v_day) on conflict do nothing;
  select * into u from gam_daily_usage where user_id = v_user and day = v_day for update;

  v_eligible := least(
    greatest(0, least(coalesce(s.listened_sec, 0), s.duration_min * 60)) / 60,
    greatest(0, cfg.daily_minutes_cap - u.eligible_minutes));
  v_bonus  := s.completed and u.completion_bonuses < cfg.daily_completion_bonus_cap;
  v_points := v_eligible * cfg.points_per_minute
            + case when v_bonus then cfg.points_per_completed_session else 0 end;
  v_base   := round(v_points * cfg.loops_per_point * 100);

  select m.company_id, m.multiplier into v_company_id, v_mult from gam_multiplier_at(v_user, v_at) m;
  if v_mult is not null and v_mult > 1 then
    v_company := round(v_base * (v_mult - 1));
  end if;

  insert into points_ledger (user_id, source_type, source_id, points, period_month)
  values (v_user, 'session', p_session::text, v_points, date_trunc('month', v_day)::date);

  if v_base > 0 then
    insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, source_type, source_id)
    values (v_user, 'earn_listening', v_base, 'goodloop', 'session', p_session::text)
    on conflict do nothing;
  end if;
  if v_company > 0 then
    insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, company_id, multiplier_applied, source_type, source_id)
    values (v_user, 'earn_company_multiplier', v_company, 'company', v_company_id, v_mult, 'session', p_session::text)
    on conflict do nothing;
  end if;

  update gam_daily_usage
     set eligible_minutes   = eligible_minutes + v_eligible,
         completion_bonuses = completion_bonuses + case when v_bonus then 1 else 0 end,
         sessions           = sessions + 1
   where user_id = v_user and day = v_day;
end $$;
revoke all on function credit_session(uuid, boolean) from public;
do $$ begin
  revoke all on function credit_session(uuid, boolean) from anon, authenticated;
exception when undefined_object then null; end $$;

-- Fired on every session row. A failure to credit must never lose the
-- session itself: it is logged, and backfill_points() can credit it later.
create or replace function gam_sessions_credit() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    perform credit_session(new.id);
  exception when others then
    raise warning 'credit_session(%) failed: %', new.id, sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists sessions_credit on sessions;
create trigger sessions_credit after insert or update of completed, listened_sec, ended_at on sessions
  for each row execute function gam_sessions_credit();

-- ---- reading the wallet ------------------------------------------------------
create or replace function get_wallet() returns json
  language sql stable security definer set search_path = public as $$
  with me as (select current_profile() as id),
       mo as (select date_trunc('month', gam_sp_day(now()))::date as month)
  select json_build_object(
    'balance_centi',  coalesce((select sum(l.amount_centi) from loops_ledger l, me where l.user_id = me.id), 0),
    'points_total',   coalesce((select sum(p.points) from points_ledger p, me where p.user_id = me.id), 0),
    'points_month',   coalesce((select sum(p.points) from points_ledger p, me, mo where p.user_id = me.id and p.period_month = mo.month), 0),
    'minutes_month',  coalesce((select sum(d.eligible_minutes) from gam_daily_usage d, me, mo where d.user_id = me.id and d.day >= mo.month), 0),
    'sessions_month', coalesce((select sum(d.sessions) from gam_daily_usage d, me, mo where d.user_id = me.id and d.day >= mo.month), 0),
    'multiplier',     (select m.multiplier from me, gam_multiplier_at(me.id, now()) m where m.multiplier > 1)
  )
$$;
revoke all on function get_wallet() from public;
do $$ begin grant execute on function get_wallet() to authenticated; exception when undefined_object then null; end $$;

-- ---- backfill (admin; never run automatically — SPEC §2.2) -------------------
create or replace function backfill_points(p_from date) returns int
  language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  for r in
    select id from sessions
     where b2c_profile_id is not null and ended_at >= p_from
     order by ended_at
  loop
    perform credit_session(r.id, true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function backfill_points(date) from public;
do $$ begin grant execute on function backfill_points(date) to authenticated; exception when undefined_object then null; end $$;

notify pgrst, 'reload schema';
