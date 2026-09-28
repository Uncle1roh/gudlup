-- ============================================================================
-- Good Loop — SCRIPT 10: partner products
--
-- Copy this whole file into the Supabase SQL editor and press Run.
-- Nothing to edit, nothing to uncomment. Safe to re-run.
--
-- The same block is in setup.sql; this file is for a database that is already
-- live and only needs the Partner offers added.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PARTNER PRODUCTS
--
-- Offers from partner brands — a product, the discount on it, and how to get
-- it — written in the admin console and shown on the Partner tab of the
-- person's app. Nothing here is about a person: it is catalogue, like
-- explore_rails, so anyone signed in may read the ACTIVE rows and only an
-- admin may write. (The app currently shows the tab to admins only; opening
-- it to everyone needs no database change.)
create table if not exists partner_products (
  id           uuid primary key default gen_random_uuid(),
  partner      text not null,
  title        text not null,
  description  text,
  discount     text,
  promo_code   text,
  url          text check (url is null or url ~* '^https?://'),
  image_url    text check (image_url is null or image_url ~* '^https?://'),
  active       boolean not null default true,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table partner_products enable row level security;
drop policy if exists partner_products_read on partner_products;
create policy partner_products_read on partner_products
  for select using (auth.uid() is not null and active);
drop policy if exists partner_products_admin on partner_products;
create policy partner_products_admin on partner_products
  for all using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';
