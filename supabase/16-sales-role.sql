-- ============================================================================
-- Good Loop — SCRIPT 16: the commercial role
--
-- Everything here is also in supabase/setup.sql. Run this on its own if
-- setup.sql has already been run. Safe to re-run: every statement is
-- `if not exists`, or a `drop policy if exists` followed by the `create`
-- that replaces it. Nothing is deleted and no existing policy is widened.
--
-- ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
-- Two teams were sharing one back-office. The content team publish protocols,
-- import audio and approve clinician credentials; the commercial team sell to
-- companies, run in-app campaigns and negotiate partners. The console split
-- in the client (`src/sales/SalesApp.tsx`), and a menu is a convenience —
-- this file is the actual answer to "what can a commercial account read".
--
-- ── THE RULE THIS FILE IS WRITTEN AROUND ──────────────────────────────────
-- A `sales` account is NOT an admin and inherits nothing from one. `is_admin()`
-- appears in sixty-odd policies and every one of them keeps meaning exactly
-- what it meant: the role of an admin. `is_sales()` is a separate function
-- and it is granted on five areas and no others:
--
--     companies                     — the customers, their codes and seats
--     addon_plans                   — the plans, which carry the multiplier
--     company_addon_subscriptions   — which company is on which plan
--     challenges / challenge_templates / challenge_counted
--                                   — the in-app campaigns
--     benefits / benefit_tags / benefit_tag_map / benefit_codes
--     partner_products              — what partners give and what it costs
--     promo_codes                   — the discount typed at registration
--
-- plus INSERT on audit_events, so its own actions are on the record.
--
-- IT HAS NO POLICY AT ALL on profiles, patients, sessions, patient_notes,
-- assessments, scores, goals, clinical_events, messages, appointments,
-- psychosocial_responses or anything else clinical. Not a restricted one —
-- none, which under row-level security means no row comes back. Somebody
-- selling a contract has no business reading a clinical note, and the
-- database is where that is settled, not the sidebar.
--
-- It also has no write over the catalogue, the audio, the credential queue,
-- the feature switches or the economy's own settings.
-- ============================================================================

-- ---- the role -------------------------------------------------------------
-- The same shape as the one that added `hr_admin`: a no-op on re-run.
do $$ begin
  alter type user_role add value if not exists 'sales';
exception when duplicate_object then null; end $$;

-- ---- who is one -----------------------------------------------------------
-- `role::text`, not `role = 'sales'`. The Supabase editor runs a script as
-- ONE transaction, and a value added to an enum by that same transaction
-- cannot be used in it — a `language sql` body is parsed when it is created,
-- so comparing against the literal here would fail on the very first run and
-- succeed on the second, which is the worst way for a permission function to
-- behave. Comparing text never touches the enum.
create or replace function is_sales() returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from profiles where auth_uid = auth.uid() and role::text = 'sales') $$;
revoke all on function is_sales() from public;
grant execute on function is_sales() to authenticated;

-- ---- the customers --------------------------------------------------------
drop policy if exists companies_sales on companies;
create policy companies_sales on companies
  for all using (is_sales()) with check (is_sales());

-- ---- the plans, and which company is on which -----------------------------
-- This pair IS the points multiplier: `addon_plans.multiplier` is the number,
-- and the subscription is what puts a company on it. Selling the Premium
-- contract and setting the multiplier are the same act, so they are the same
-- permission.
drop policy if exists addon_plans_sales on addon_plans;
create policy addon_plans_sales on addon_plans
  for all using (is_sales()) with check (is_sales());

drop policy if exists company_addon_subs_sales on company_addon_subscriptions;
create policy company_addon_subs_sales on company_addon_subscriptions
  for all using (is_sales()) with check (is_sales());

-- ---- the discounts --------------------------------------------------------
-- A promo code is a price, and a price is commercial. It is also what the
-- paid mobile app will be sold against, which is the reason the screen moved
-- out of the admin console with the rest.
drop policy if exists promo_codes_sales on promo_codes;
create policy promo_codes_sales on promo_codes
  for all using (is_sales()) with check (is_sales());

-- ---- the campaigns --------------------------------------------------------
-- A challenge is a commercial incentive that runs inside the app. What it
-- cannot do is change what a Loop is worth: `economy_settings` is the
-- product's, and is not granted here.
drop policy if exists challenges_sales on challenges;
create policy challenges_sales on challenges
  for all using (is_sales()) with check (is_sales());

drop policy if exists challenge_templates_sales on challenge_templates;
create policy challenge_templates_sales on challenge_templates
  for all using (is_sales()) with check (is_sales());

-- Read only: what a campaign counted is a result, and a result that the
-- person who owns the campaign can edit is not a result.
drop policy if exists challenge_counted_sales on challenge_counted;
create policy challenge_counted_sales on challenge_counted
  for select using (is_sales());

-- ---- the partners ---------------------------------------------------------
drop policy if exists benefits_sales on benefits;
create policy benefits_sales on benefits
  for all using (is_sales()) with check (is_sales());

drop policy if exists benefit_tags_sales on benefit_tags;
create policy benefit_tags_sales on benefit_tags
  for all using (is_sales()) with check (is_sales());

drop policy if exists benefit_tag_map_sales on benefit_tag_map;
create policy benefit_tag_map_sales on benefit_tag_map
  for all using (is_sales()) with check (is_sales());

drop policy if exists benefit_codes_sales on benefit_codes;
create policy benefit_codes_sales on benefit_codes
  for all using (is_sales()) with check (is_sales());

drop policy if exists partner_products_sales on partner_products;
create policy partner_products_sales on partner_products
  for all using (is_sales()) with check (is_sales());

-- A redemption is somebody's. The commercial team may see WHAT was redeemed
-- in totals through the reports, never who redeemed it, so there is no policy
-- for them on benefit_redemptions and this comment is here to say that the
-- omission is deliberate rather than forgotten.

-- ---- its own actions, on the record ---------------------------------------
-- Insert only. An audit log that the people it logs can edit is a diary.
drop policy if exists audit_sales_write on audit_events;
create policy audit_sales_write on audit_events
  for insert with check (is_sales());

-- ---- what you just granted ------------------------------------------------
-- `role::text`, for the same reason `is_sales()` uses it: the editor runs
-- this file as ONE transaction, and a value added to an enum by that
-- transaction cannot be compared against inside it. Postgres is explicit
-- about it — "unsafe use of new value of enum type ... New enum values must
-- be committed before they can be used" — and it is right: the catalogue
-- row is not visible to other sessions yet. Casting to text asks nothing of
-- the enum, so it works on the first run as well as every later one.
select
  (select count(*) from pg_policies where schemaname = 'public' and policyname like '%_sales%')  as sales_policies,
  (select count(*) from profiles where role::text = 'sales')                                     as sales_accounts;

-- ── MAKING THE FIRST ONE ───────────────────────────────────────────────────
-- RUN THIS AS A SEPARATE STEP, after the script above has finished. The
-- editor runs whatever you paste as one transaction, and `'sales'::user_role`
-- cannot be written until the value that was added above is committed. Paste
-- it on its own and press Run again.
--
-- Supabase owns the auth tables, so the login is made by hand:
--   Authentication → Users → Add user, "Auto Confirm User" ON
-- then bind it, with the address you used:
--
--   insert into profiles (auth_uid, role, name, email, locale, active)
--   select u.id, 'sales'::user_role, 'Comercial', u.email, 'pt-BR', true
--   from auth.users u
--   where lower(u.email) = lower('comercial@goodloop.app')
--     and not exists (select 1 from profiles p where p.auth_uid = u.id);
--
-- It signs in at #sales. An account that lands on the wrong door is sent to
-- its own, so there is nothing else to configure.
