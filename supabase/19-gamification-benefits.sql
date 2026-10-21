-- ============================================================================
-- GAMIFICATION · 4 — BENEFITS AND THE LOOPS WALLET   (docs/gamification/SPEC.md §6)
--
-- For a database that is already live. The same block is in setup.sql.
-- Safe to re-run. Needs 16, 17 and 18.
--
-- Health-first, never a shop (GAM-R7): a benefit is care that comes back to
-- the person, exchanged for Loops. Nothing here tracks a stock level the
-- person can see — no scarcity, no countdown — and nothing is pushed.
--
-- Server is the source of truth (GAM-R8): what a person may see and redeem
-- is decided in get_available_benefits() and decided AGAIN inside
-- redeem_benefit(), which also takes the stock, the per-person limit, the
-- balance, the code and the ledger debit in one transaction under a per-
-- person lock — so a balance never goes negative and a code is never handed
-- to two people.
--
-- `company_id` null = a Good Loop benefit; set = that company's own (SPEC
-- §7.2b — the SPEC's `owner`). A Good Loop benefit must carry at least one
-- tag (§6.4), enforced here at commit, not only in the console.
-- ============================================================================

do $$ begin create type benefit_pillar as enum ('sono', 'mente', 'corpo', 'movimento', 'alimentacao', 'pausas_lazer'); exception when duplicate_object then null; end $$;
do $$ begin create type benefit_delivery as enum ('code_pool', 'static_code', 'link', 'collective', 'identified'); exception when duplicate_object then null; end $$;
do $$ begin create type benefit_status as enum ('draft', 'active', 'paused', 'archived'); exception when duplicate_object then null; end $$;
do $$ begin create type benefit_tag_group as enum ('partner_segment', 'benefit_type'); exception when duplicate_object then null; end $$;

create table if not exists benefits (
  id                      uuid primary key default gen_random_uuid(),
  company_id              text references companies(id) on delete cascade,     -- null = Good Loop
  title                   text not null check (length(trim(title)) between 1 and 120),
  description             text,
  care_rationale          text,                                                -- "Por que isso cuida de você"
  partner_name            text,
  pillar                  benefit_pillar not null,
  price_loops_centi       int check (price_loops_centi is null or price_loops_centi >= 0),  -- null = only through a challenge
  stock_total             int check (stock_total is null or stock_total >= 0),
  stock_remaining         int check (stock_remaining is null or stock_remaining >= 0),
  per_user_limit          int not null default 1 check (per_user_limit >= 1),
  valid_from              timestamptz,
  valid_to                timestamptz,
  code_validity_days      int check (code_validity_days is null or code_validity_days > 0),
  delivery_type           benefit_delivery not null default 'code_pool',
  static_code             text,
  link_url                text check (link_url is null or link_url ~* '^https?://'),
  terms                   text,
  image_asset             text,
  status                  benefit_status not null default 'draft',
  challenge_exclusive_id  uuid,                                                -- FK added with challenges (slice 5)
  legacy_partner_product_id uuid unique,                                       -- migrated from partner_products
  sort_order              int not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to > valid_from),
  check (delivery_type <> 'static_code' or static_code is not null or status = 'draft'),
  check (delivery_type <> 'link' or link_url is not null or status = 'draft'),
  check (price_loops_centi is not null or challenge_exclusive_id is not null or status = 'draft')
);
create index if not exists benefits_active on benefits (status, pillar, sort_order);

create table if not exists benefit_tags (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9_]+$'),
  label        text not null,
  tag_group    benefit_tag_group not null,
  description  text,
  active       boolean not null default true
);

create table if not exists benefit_tag_map (
  benefit_id  uuid not null references benefits(id) on delete cascade,
  tag_id      uuid not null references benefit_tags(id) on delete cascade,
  primary key (benefit_id, tag_id)
);

create table if not exists benefit_codes (
  id             uuid primary key default gen_random_uuid(),
  seq            bigint generated always as identity,   -- handed out in upload order
  benefit_id     uuid not null references benefits(id) on delete cascade,
  code           text not null,
  redemption_id  uuid,                                  -- FK below
  assigned_at    timestamptz,                           -- once set, never handed out again
  created_at     timestamptz not null default now(),
  unique (benefit_id, code)
);
create index if not exists benefit_codes_free on benefit_codes (benefit_id) where assigned_at is null;

create table if not exists benefit_redemptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references profiles(id) on delete cascade,
  benefit_id             uuid not null references benefits(id) on delete restrict,
  loops_spent_centi      int not null default 0 check (loops_spent_centi >= 0),
  code_id                uuid references benefit_codes(id) on delete set null,
  status                 text not null default 'active' check (status in ('active', 'refunded')),
  consent_identified_at  timestamptz,                   -- §7.4: identified redemptions only with this
  created_at             timestamptz not null default now(),
  expires_at             timestamptz,
  refunded_at            timestamptz,
  refunded_by            uuid references profiles(id) on delete set null
);
create index if not exists benefit_redemptions_user on benefit_redemptions (user_id, created_at desc);
create index if not exists benefit_redemptions_benefit on benefit_redemptions (benefit_id);
do $$ begin
  alter table benefit_codes add constraint benefit_codes_redemption_fk
    foreign key (redemption_id) references benefit_redemptions(id) on delete set null;
exception when duplicate_object then null; end $$;

-- The tag filter a company with the add-on may apply (§7.2a). Written from
-- slice 6; read by availability from now on. A row with enabled_at null is
-- a tag disabled now; the history stays.
create table if not exists company_disabled_tags (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null references companies(id) on delete cascade,
  tag_id       uuid not null references benefit_tags(id) on delete cascade,
  disabled_by  uuid references profiles(id) on delete set null,
  disabled_at  timestamptz not null default now(),
  enabled_by   uuid references profiles(id) on delete set null,
  enabled_at   timestamptz
);
create unique index if not exists company_disabled_tags_open on company_disabled_tags (company_id, tag_id) where enabled_at is null;

-- Seed tags (§6.4).
insert into benefit_tags (slug, label, tag_group) values
  ('beleza_cuidado',   'Beleza e cuidado pessoal', 'partner_segment'),
  ('alimentos_bebidas','Alimentos e bebidas',      'partner_segment'),
  ('farmacia_saude',   'Farmácia e saúde',         'partner_segment'),
  ('academias_esportes','Academias e esportes',    'partner_segment'),
  ('apps_bem_estar',   'Apps de bem-estar',        'partner_segment'),
  ('viagens_turismo',  'Viagens e turismo',        'partner_segment'),
  ('livros_cultura',   'Livros e cultura',         'partner_segment'),
  ('tecnologia_audio', 'Tecnologia e áudio',       'partner_segment'),
  ('moda',             'Moda',                     'partner_segment'),
  ('varejo',           'Varejo',                   'partner_segment'),
  ('desconto',         'Desconto',                 'benefit_type'),
  ('gratuidade',       'Gratuidade',               'benefit_type'),
  ('experiencia',      'Experiência',              'benefit_type'),
  ('produto_fisico',   'Produto físico',           'benefit_type'),
  ('doacao',           'Doação',                   'benefit_type')
on conflict (slug) do nothing;

-- ---- a Good Loop benefit carries at least one tag ---------------------------
-- Deferred to commit, so the console can insert the benefit and its tags in
-- one transaction in either order.
create or replace function gam_benefit_needs_tag() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  b uuid := coalesce(new.id, null);
begin
  if tg_table_name = 'benefit_tag_map' then
    b := case when tg_op = 'DELETE' then old.benefit_id else new.benefit_id end;
  end if;
  if exists (select 1 from benefits x where x.id = b and x.company_id is null and x.status <> 'draft')
     and not exists (select 1 from benefit_tag_map m where m.benefit_id = b) then
    raise exception 'a Good Loop benefit needs at least one tag' using errcode = 'P0001', hint = 'BENEFIT_NEEDS_TAG';
  end if;
  return null;
end $$;
drop trigger if exists benefits_need_tag on benefits;
create constraint trigger benefits_need_tag after insert or update on benefits
  deferrable initially deferred for each row execute function gam_benefit_needs_tag();
drop trigger if exists benefit_tag_map_need_tag on benefit_tag_map;
create constraint trigger benefit_tag_map_need_tag after delete on benefit_tag_map
  deferrable initially deferred for each row execute function gam_benefit_needs_tag();

-- ---- RLS --------------------------------------------------------------------------
alter table benefits enable row level security;
alter table benefit_tags enable row level security;
alter table benefit_tag_map enable row level security;
alter table benefit_codes enable row level security;
alter table benefit_redemptions enable row level security;
alter table company_disabled_tags enable row level security;

-- The catalogue is read through get_available_benefits(), which applies the
-- company filter; the tables themselves are the admin's (and, from slice 6,
-- HR's for their own company).
drop policy if exists benefits_admin on benefits;
create policy benefits_admin on benefits for all using (is_admin()) with check (is_admin());
drop policy if exists benefit_tags_read on benefit_tags;
create policy benefit_tags_read on benefit_tags for select using (auth.uid() is not null);
drop policy if exists benefit_tags_admin on benefit_tags;
create policy benefit_tags_admin on benefit_tags for all using (is_admin()) with check (is_admin());
drop policy if exists benefit_tag_map_admin on benefit_tag_map;
create policy benefit_tag_map_admin on benefit_tag_map for all using (is_admin()) with check (is_admin());
-- A code is readable ONLY by the person it was handed to (§6.4). Not even an
-- admin reads codes through the API; they upload them and see counts.
drop policy if exists benefit_codes_mine on benefit_codes;
create policy benefit_codes_mine on benefit_codes for select using (
  redemption_id in (select id from benefit_redemptions where user_id = current_profile()));
drop policy if exists benefit_redemptions_mine on benefit_redemptions;
create policy benefit_redemptions_mine on benefit_redemptions for select using (user_id = current_profile() or is_admin());
drop policy if exists company_disabled_tags_admin on company_disabled_tags;
create policy company_disabled_tags_admin on company_disabled_tags for select using (is_admin());
revoke insert, update, delete, truncate on benefit_codes, benefit_redemptions, company_disabled_tags from anon, authenticated;

-- ---- availability --------------------------------------------------------------------
-- Challenges arrive in slice 5, which replaces this with the real test.
create or replace function gam_user_earned_benefit(p_user uuid, p_benefit uuid) returns boolean
  language sql stable as $$ select false $$;

-- The person's company, when it has an active add-on at this moment.
create or replace function gam_addon_company(p_user uuid)
  returns table (company_id text, allows_tag_filter boolean, allows_company_benefits boolean)
  language sql stable security definer set search_path = public as $$
  select a.company_id, pl.allows_tag_filter, pl.allows_company_benefits
    from company_affiliations a
    join company_addon_subscriptions s on s.company_id = a.company_id
    join addon_plans pl on pl.id = s.plan_id
   where a.user_id = p_user and a.ended_at is null
     and s.status = 'active' and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
   order by pl.loops_multiplier desc
   limit 1
$$;
revoke all on function gam_addon_company(uuid) from public;

-- May this person see (and so redeem) this benefit now? SPEC §6.4:
--   active public benefits
--   − those carrying a tag the person's company disabled (add-on + tag filter)
--   + the person's company's own benefits (add-on + company benefits)
--   + challenge-exclusive benefits the person earned
create or replace function gam_benefit_available(p_user uuid, p_benefit uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  with b as (
    select * from benefits
     where id = p_benefit and status = 'active'
       and (valid_from is null or valid_from <= now()) and (valid_to is null or valid_to > now())
  ),
  co as (select * from gam_addon_company(p_user))
  select exists (
    select 1 from b
     where (
       b.challenge_exclusive_id is not null and gam_user_earned_benefit(p_user, b.id)
     ) or (
       b.challenge_exclusive_id is null and b.company_id is null
       and not exists (
         select 1 from co
           join company_disabled_tags d on d.company_id = co.company_id and d.enabled_at is null
           join benefit_tag_map m on m.tag_id = d.tag_id and m.benefit_id = b.id
          where co.allows_tag_filter)
     ) or (
       b.challenge_exclusive_id is null and b.company_id is not null
       and exists (select 1 from co where co.company_id = b.company_id and co.allows_company_benefits)
     )
  )
$$;
revoke all on function gam_benefit_available(uuid, uuid) from public;

-- What the Benefits tab lists. No stock figure is returned — only whether
-- the benefit can still be had (§6.5: no scarcity, ever).
create or replace function get_available_benefits() returns json
  language sql stable security definer set search_path = public as $$
  with me as (select current_profile() as id),
       bal as (select coalesce(sum(amount_centi), 0) as centi from loops_ledger, me where user_id = me.id)
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'companyId', b.company_id,
           'companyName', (select c.name from companies c where c.id = b.company_id),
           'title', b.title, 'description', b.description, 'careRationale', b.care_rationale,
           'partnerName', b.partner_name, 'pillar', b.pillar, 'priceLoopsCenti', b.price_loops_centi,
           'perUserLimit', b.per_user_limit, 'validTo', b.valid_to, 'codeValidityDays', b.code_validity_days,
           'deliveryType', b.delivery_type, 'terms', b.terms, 'imageAsset', b.image_asset,
           'challengeExclusive', b.challenge_exclusive_id is not null,
           'tags', (select coalesce(json_agg(t.label order by t.tag_group, t.label), '[]'::json)
                      from benefit_tag_map m join benefit_tags t on t.id = m.tag_id where m.benefit_id = b.id),
           'myRedemptions', (select count(*) from benefit_redemptions r where r.benefit_id = b.id and r.user_id = me.id and r.status = 'active'),
           'inStock', b.stock_remaining is null or b.stock_remaining > 0 or b.delivery_type = 'collective',
           'balanceCenti', bal.centi)
         order by b.pillar, b.sort_order, b.title), '[]'::json)
    from benefits b, me, bal
   where me.id is not null and gam_benefit_available(me.id, b.id)
$$;
revoke all on function get_available_benefits() from public;
do $$ begin grant execute on function get_available_benefits() to authenticated; exception when undefined_object then null; end $$;

-- ---- the one way to redeem --------------------------------------------------------------
create or replace function redeem_benefit(p_benefit uuid, p_consent_identified boolean default false) returns json
  language plpgsql security definer set search_path = public as $$
declare
  me uuid := current_profile();
  b benefits%rowtype;
  v_balance int;
  v_price int;
  v_red uuid := gen_random_uuid();
  v_code_id uuid;
  v_code text;
  v_expires timestamptz;
  v_used int;
begin
  if me is null then raise exception 'not signed in' using errcode = 'P0001', hint = 'NOT_SIGNED_IN'; end if;
  -- One redemption at a time per person: balance and limits are read and spent here.
  perform pg_advisory_xact_lock(hashtextextended('gam:wallet:' || me::text, 0));

  select * into b from benefits where id = p_benefit for update;
  if not found or not gam_benefit_available(me, p_benefit) then
    raise exception 'benefit not available' using errcode = 'P0001', hint = 'BENEFIT_UNAVAILABLE';
  end if;
  select count(*) into v_used from benefit_redemptions where user_id = me and benefit_id = b.id and status = 'active';
  if v_used >= b.per_user_limit then
    raise exception 'already redeemed' using errcode = 'P0001', hint = 'BENEFIT_LIMIT';
  end if;
  if b.delivery_type = 'identified' and not coalesce(p_consent_identified, false) then
    raise exception 'consent to be identified is required' using errcode = 'P0001', hint = 'BENEFIT_NEEDS_CONSENT';
  end if;

  v_price := coalesce(b.price_loops_centi, 0);
  select coalesce(sum(amount_centi), 0) into v_balance from loops_ledger where user_id = me;
  if v_balance < v_price then
    raise exception 'not enough Loops' using errcode = 'P0001', hint = 'BENEFIT_BALANCE';
  end if;

  if b.stock_remaining is not null and b.delivery_type <> 'collective' then
    if b.stock_remaining <= 0 then
      raise exception 'no longer available' using errcode = 'P0001', hint = 'BENEFIT_STOCK';
    end if;
    update benefits set stock_remaining = stock_remaining - 1, updated_at = now() where id = b.id;
  end if;

  if b.code_validity_days is not null then v_expires := now() + make_interval(days => b.code_validity_days); end if;
  if b.valid_to is not null and (v_expires is null or b.valid_to < v_expires) then v_expires := b.valid_to; end if;

  insert into benefit_redemptions (id, user_id, benefit_id, loops_spent_centi, status, consent_identified_at, expires_at)
  values (v_red, me, b.id, v_price, 'active',
          case when b.delivery_type = 'identified' then now() end, v_expires);

  if b.delivery_type = 'code_pool' then
    select id, code into v_code_id, v_code from benefit_codes
     where benefit_id = b.id and assigned_at is null
     order by seq
     limit 1
     for update skip locked;
    if v_code_id is null then
      raise exception 'no code left' using errcode = 'P0001', hint = 'BENEFIT_STOCK';
    end if;
    update benefit_codes set redemption_id = v_red, assigned_at = now() where id = v_code_id;
    update benefit_redemptions set code_id = v_code_id where id = v_red;
  elsif b.delivery_type = 'static_code' then
    v_code := b.static_code;
  end if;

  if v_price > 0 then
    insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, source_type, source_id)
    values (me, 'redemption', -v_price, 'goodloop', 'redemption', v_red::text);
  end if;

  return json_build_object('redemptionId', v_red, 'code', v_code, 'link', b.link_url,
                           'expiresAt', v_expires, 'loopsSpentCenti', v_price);
end $$;
revoke all on function redeem_benefit(uuid, boolean) from public;
do $$ begin grant execute on function redeem_benefit(uuid, boolean) to authenticated; exception when undefined_object then null; end $$;

-- "Meus benefícios": what the person redeemed, with its code. Shown even if
-- the company later disabled the tag (§6.4) — availability is not asked.
create or replace function list_my_redemptions() returns json
  language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', r.id, 'benefitId', b.id, 'title', b.title, 'partnerName', b.partner_name, 'pillar', b.pillar,
           'deliveryType', b.delivery_type, 'terms', b.terms,
           'code', coalesce(c.code, case when b.delivery_type = 'static_code' then b.static_code end),
           'link', b.link_url, 'loopsSpentCenti', r.loops_spent_centi, 'status', r.status,
           'createdAt', r.created_at, 'expiresAt', r.expires_at)
         order by r.created_at desc), '[]'::json)
    from benefit_redemptions r
    join benefits b on b.id = r.benefit_id
    left join benefit_codes c on c.id = r.code_id
   where r.user_id = current_profile()
$$;
revoke all on function list_my_redemptions() from public;
do $$ begin grant execute on function list_my_redemptions() to authenticated; exception when undefined_object then null; end $$;

-- ---- the console -----------------------------------------------------------------------
-- Refund: the Loops come back as their own entry, the stock goes back; a code
-- already shown to the person is never handed to anyone else.
create or replace function admin_refund_redemption(p_redemption uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  r benefit_redemptions%rowtype;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  select * into r from benefit_redemptions where id = p_redemption for update;
  if not found then raise exception 'no such redemption'; end if;
  if r.status = 'refunded' then return; end if;
  update benefit_redemptions set status = 'refunded', refunded_at = now(), refunded_by = current_profile() where id = r.id;
  update benefits set stock_remaining = stock_remaining + 1, updated_at = now()
   where id = r.benefit_id and stock_remaining is not null and delivery_type <> 'collective';
  if r.loops_spent_centi > 0 then
    insert into loops_ledger (user_id, entry_type, amount_centi, funding_source, source_type, source_id)
    values (r.user_id, 'redemption_refund', r.loops_spent_centi, 'goodloop', 'redemption', r.id::text)
    on conflict do nothing;
  end if;
end $$;
revoke all on function admin_refund_redemption(uuid) from public;
do $$ begin grant execute on function admin_refund_redemption(uuid) to authenticated; exception when undefined_object then null; end $$;

-- CSV upload of codes. Returns how many were new; duplicates are skipped.
create or replace function admin_upload_codes(p_benefit uuid, p_codes text[]) returns int
  language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  insert into benefit_codes (benefit_id, code)
  select p_benefit, c from (select distinct trim(x) as c from unnest(p_codes) x) s
   where length(c) between 1 and 200
  on conflict (benefit_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function admin_upload_codes(uuid, text[]) from public;
do $$ begin grant execute on function admin_upload_codes(uuid, text[]) to authenticated; exception when undefined_object then null; end $$;

-- What the console shows of codes: counts, never the codes themselves.
create or replace function admin_benefit_code_counts() returns json
  language sql stable security definer set search_path = public as $$
  select case when not is_admin() then null else coalesce(json_object_agg(benefit_id, json_build_object('total', total, 'free', free)), '{}'::json) end
    from (select benefit_id, count(*) as total, count(*) filter (where assigned_at is null) as free
            from benefit_codes group by benefit_id) x
$$;
revoke all on function admin_benefit_code_counts() from public;
do $$ begin grant execute on function admin_benefit_code_counts() to authenticated; exception when undefined_object then null; end $$;

-- A benefit and its tags in ONE transaction, so the at-least-one-tag rule is
-- checked against the finished state, never a half-saved one.
create or replace function admin_save_benefit(p jsonb, p_tag_ids uuid[]) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
begin
  if not is_admin() then raise exception 'admin only'; end if;
  insert into benefits (id, company_id, title, description, care_rationale, partner_name, pillar,
                        price_loops_centi, stock_total, stock_remaining, per_user_limit, valid_from, valid_to,
                        code_validity_days, delivery_type, static_code, link_url, terms, image_asset, status,
                        challenge_exclusive_id, sort_order)
  values (v_id, nullif(p->>'companyId', ''), p->>'title', nullif(p->>'description', ''), nullif(p->>'careRationale', ''),
          nullif(p->>'partnerName', ''), (p->>'pillar')::benefit_pillar,
          (p->>'priceLoopsCenti')::int, (p->>'stockTotal')::int, (p->>'stockRemaining')::int,
          coalesce((p->>'perUserLimit')::int, 1), (p->>'validFrom')::timestamptz, (p->>'validTo')::timestamptz,
          (p->>'codeValidityDays')::int, (p->>'deliveryType')::benefit_delivery, nullif(p->>'staticCode', ''),
          nullif(p->>'linkUrl', ''), nullif(p->>'terms', ''), nullif(p->>'imageAsset', ''),
          coalesce((p->>'status')::benefit_status, 'draft'), nullif(p->>'challengeExclusiveId', '')::uuid,
          coalesce((p->>'sortOrder')::int, 0))
  on conflict (id) do update set
    company_id = excluded.company_id, title = excluded.title, description = excluded.description,
    care_rationale = excluded.care_rationale, partner_name = excluded.partner_name, pillar = excluded.pillar,
    price_loops_centi = excluded.price_loops_centi, stock_total = excluded.stock_total,
    stock_remaining = excluded.stock_remaining, per_user_limit = excluded.per_user_limit,
    valid_from = excluded.valid_from, valid_to = excluded.valid_to, code_validity_days = excluded.code_validity_days,
    delivery_type = excluded.delivery_type, static_code = excluded.static_code, link_url = excluded.link_url,
    terms = excluded.terms, image_asset = excluded.image_asset, status = excluded.status,
    challenge_exclusive_id = excluded.challenge_exclusive_id, sort_order = excluded.sort_order, updated_at = now();
  insert into benefit_tag_map (benefit_id, tag_id)
  select v_id, t from unnest(coalesce(p_tag_ids, '{}')) t on conflict do nothing;
  delete from benefit_tag_map where benefit_id = v_id and not (tag_id = any(coalesce(p_tag_ids, '{}')));
  -- the deferred rule runs now, so the console gets the refusal, not the commit
  set constraints benefits_need_tag, benefit_tag_map_need_tag immediate;
  return v_id;
end $$;
revoke all on function admin_save_benefit(jsonb, uuid[]) from public;
do $$ begin grant execute on function admin_save_benefit(jsonb, uuid[]) to authenticated; exception when undefined_object then null; end $$;

-- ---- the partner offers become benefits (PLAN A15) ------------------------------------
-- Copied once each, as DRAFTS: an offer had no Loop price and no pillar, and
-- an admin sets both before it goes live. The old table stays, unused.
insert into benefits (title, description, care_rationale, partner_name, pillar, delivery_type, static_code, link_url, status, sort_order, legacy_partner_product_id)
select pp.title, pp.description, null, pp.partner, 'pausas_lazer',
       case when pp.promo_code is not null then 'static_code'::benefit_delivery
            when pp.url is not null then 'link'::benefit_delivery else 'static_code'::benefit_delivery end,
       pp.promo_code, pp.url, 'draft', pp.position, pp.id
  from partner_products pp
 where pp.active
on conflict (legacy_partner_product_id) do nothing;
insert into benefit_tag_map (benefit_id, tag_id)
select b.id, t.id from benefits b, benefit_tags t
 where b.legacy_partner_product_id is not null and t.slug = 'desconto'
on conflict do nothing;
-- The Supabase SQL editor runs a whole file as ONE transaction. The inserts
-- above leave the "a benefit needs a tag" check pending until commit, and a
-- pending check makes any later ALTER TABLE benefits fail (55006). Run the
-- checks now, then put them back to deferred. Outside a transaction both
-- lines are no-ops.
set constraints all immediate;
set constraints all deferred;

notify pgrst, 'reload schema';
