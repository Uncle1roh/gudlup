-- ============================================================================
-- GOOD LOOP — optional DEMO seed (run AFTER supabase/setup.sql)
--
-- Gives a fresh project the same living demo the mock provider has:
--   • the corporate tenant "Aurora Tech"
--   • ~65 synthetic employees with psychosocial responses across 4 quarterly
--     cycles (improving over time), so the employer NR-1 dashboard renders a
--     full report immediately — including two small teams under k=5 that
--     exercise the anonymity suppression
--   • ready-made statements to bind the admin / HR / demo accounts you create
--     in Authentication → Users to their app roles
--
-- Synthetic profiles have no auth_uid — they can never sign in; they exist
-- only so the aggregate has population. Safe to re-run (guarded deletes).
-- ============================================================================

-- 1. Tenant ------------------------------------------------------------------
insert into companies (id, name, seats, active_users, status)
values ('c1', 'Aurora Tech', 250, 168, 'active')
on conflict (id) do nothing;

-- 2. Synthetic population + responses ----------------------------------------
do $$
declare
  team_names  text[] := array['Engineering', 'Sales', 'Customer Support', 'Product', 'People', 'Finance'];
  team_counts int[]  := array[52, 28, 22, 12, 4, 3];
  periods     text[] := array['Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026'];
  factors     numeric[] := array[1.35, 1.18, 1.05, 0.95];  -- earlier = worse
  dim_keys    text[] := array['demands','pace','balance','recognition','support_mgr','control','role','relationships'];
  p_high      numeric[] := array[0.28, 0.26, 0.25, 0.16, 0.12, 0.10, 0.075, 0.075];
  p_mod       numeric[] := array[0.38, 0.37, 0.36, 0.34, 0.30, 0.26, 0.23, 0.20];
  out_keys    text[] := array['stress','anxiety','burnout'];
  out_prob    numeric[] := array[0.30, 0.23, 0.19];
  t int; i int; pd int; d int; o int;
  pid uuid;
  dims jsonb; outs jsonb;
  r numeric; ph numeric;
begin
  -- wipe previous demo rows so re-runs stay clean
  delete from psychosocial_responses where profile_id in
    (select id from profiles where company_id = 'c1' and auth_uid is null and email like 'demo-emp-%');
  delete from profiles where company_id = 'c1' and auth_uid is null and email like 'demo-emp-%';

  perform setseed(0.42);  -- deterministic across runs

  for t in 1 .. array_length(team_names, 1) loop
    for i in 1 .. team_counts[t] loop
      insert into profiles (role, name, email, company_id, active)
      values ('b2c_user',
              'Demo ' || team_names[t] || ' ' || i,
              'demo-emp-' || t || '-' || i || '@aurora.demo',
              'c1', true)
      returning id into pid;

      for pd in 1 .. array_length(periods, 1) loop
        dims := '{}'::jsonb;
        for d in 1 .. array_length(dim_keys, 1) loop
          r := random();
          ph := least(0.9, p_high[d] * factors[pd]);
          dims := dims || jsonb_build_object(dim_keys[d],
            case when r < ph then 'high'
                 when r < ph + p_mod[d] then 'moderate'
                 else 'low' end);
        end loop;
        outs := '{}'::jsonb;
        for o in 1 .. array_length(out_keys, 1) loop
          outs := outs || jsonb_build_object(out_keys[o], random() < least(0.9, out_prob[o] * factors[pd]));
        end loop;
        insert into psychosocial_responses (profile_id, company_id, team, period, dims, outcomes)
        values (pid, 'c1', team_names[t], periods[pd], dims, outs);
      end loop;
    end loop;
  end loop;
end $$;

-- 3. Role accounts ------------------------------------------------------------
-- First create the users in the dashboard: Authentication → Users → Add user
-- (check "Auto confirm"), e.g.:
--     admin@goodloop.app   (platform admin)
--     camila@aurora.co     (HR / employer dashboard)
-- Then run the two statements below to bind them to app roles.
-- (B2C users and therapists don't need this — the app's sign-up creates their
--  profile rows itself.)

insert into profiles (auth_uid, role, name, email)
select id, 'admin', 'Good Loop Admin', 'admin@goodloop.app'
from auth.users where email = 'admin@goodloop.app'
on conflict (auth_uid) do update set role = 'admin';

insert into profiles (auth_uid, role, name, email, company_id)
select id, 'hr_admin', 'Camila Rocha', 'camila@aurora.co', 'c1'
from auth.users where email = 'camila@aurora.co'
on conflict (auth_uid) do update set role = 'hr_admin', company_id = 'c1';
