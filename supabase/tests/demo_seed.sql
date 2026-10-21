-- seed: supabase/seed_gamification_demo.sql
-- ============================================================================
-- The demo seed, applied TWICE by tools/db-gate.mjs before this runs: what
-- it builds, and that the second run added nothing.
-- ============================================================================

do $$
declare
  failures text := '';
  n int;
  expected_sessions int := (select sum(3 + i % 5) from generate_series(1, 40) i);
  emp uuid := md5('gl-demo-person-1')::uuid;
  outsider uuid := md5('gl-demo-person-20')::uuid;
  fruit uuid := md5('gl-demo-benefit-alim1')::uuid;
begin
  if (select count(*) from profiles where email like 'demo+gam%@goodloop.demo') <> 40 then failures := failures || E'\n  not 40 demo people'; end if;
  if (select count(*) from company_affiliations where company_id = 'AURORA-ALIMENTOS' and ended_at is null) <> 12 then failures := failures || E'\n  not 12 Aurora employees'; end if;
  if (select count(*) from sessions where protocol_code = 'GL-DEMO') <> expected_sessions then
    failures := failures || format(E'\n  sessions: %s, expected %s once — the second run duplicated or lost some', (select count(*) from sessions where protocol_code = 'GL-DEMO'), expected_sessions);
  end if;
  if (select count(*) from points_ledger pl join profiles p on p.id = pl.user_id where p.email like 'demo+gam%') <> expected_sessions then
    failures := failures || E'\n  every demo session should be credited exactly once';
  end if;
  if (select count(*) from benefits where partner_name = '[PARCEIRO]') <> 15 then failures := failures || E'\n  not 15 [PARCEIRO] benefits'; end if;
  if exists (select 1 from benefits b where b.company_id is null and b.status = 'active' and not exists (select 1 from benefit_tag_map m where m.benefit_id = b.id)) then
    failures := failures || E'\n  an active Good Loop benefit without a tag';
  end if;
  if (select count(*) from challenges where title in ('Outubro Sereno', 'Semana do Sono', 'Novembro em Loop')) <> 3 then failures := failures || E'\n  the three demo challenges'; end if;
  if (select status from challenges where title = 'Semana do Sono') <> 'scheduled' then failures := failures || E'\n  Semana do Sono should be scheduled'; end if;
  if not exists (select 1 from challenge_participation p join challenges c on c.id = p.challenge_id where c.title = 'Outubro Sereno' and p.progress_value > 0) then
    failures := failures || E'\n  nobody progressed in Outubro Sereno';
  end if;
  if not exists (select 1 from challenge_participation p join challenges c on c.id = p.challenge_id where c.title = 'Novembro em Loop' and p.progress_value > 0) then
    failures := failures || E'\n  no Aurora employee progressed in Novembro em Loop';
  end if;
  if exists (select 1 from challenge_participation p join challenges c on c.id = p.challenge_id
              where c.title = 'Novembro em Loop' and p.user_id not in (select user_id from company_affiliations where company_id = 'AURORA-ALIMENTOS')) then
    failures := failures || E'\n  someone outside Aurora counted toward its challenge';
  end if;
  if not exists (select 1 from loops_ledger where company_id = 'AURORA-ALIMENTOS' and entry_type = 'earn_company_multiplier') then
    failures := failures || E'\n  Aurora''s 1.5x produced no company-funded Loops';
  end if;
  if gam_benefit_available(emp, fruit) then failures := failures || E'\n  an Aurora employee sees a food benefit Aurora switched off'; end if;
  if not gam_benefit_available(outsider, fruit) then failures := failures || E'\n  the filter reached someone outside Aurora'; end if;
  if (select max_backdate_hours from economy_settings where id) is distinct from 24 then failures := failures || E'\n  the seed left the backdating bound changed'; end if;
  select count(*) into n from geo_rollup where scope = 'city';
  if n = 0 then failures := failures || E'\n  the roll-up was not refreshed'; end if;
  -- 8 people a city never reach the 50-person threshold: no city is ranked
  if json_array_length(get_geo_rankings('city', 'all', 5)->'rows') <> 0 then
    failures := failures || E'\n  a demo city of 8 people appeared in the rankings';
  end if;
  if failures <> '' then raise exception 'demo seed failed:%', failures; end if;
  raise notice 'ok  : the demo seed builds what it says, once, and leaves the settings as it found them';
end $$;
