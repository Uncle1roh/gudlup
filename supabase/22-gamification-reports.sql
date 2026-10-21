-- ============================================================================
-- GAMIFICATION · 7 — ADMIN REPORTS                 (docs/gamification/SPEC.md §8)
--
-- For a database that is already live. The same block is in setup.sql.
-- Safe to re-run. Needs 16 to 21.
--
-- Totals for the Good Loop team, admin only: Points and Loops issued by
-- source and by who pays, Loops redeemed, redemptions per benefit, Loops a
-- company's multiplier issued per month (what Good Loop bills it for), and
-- how each challenge ended. Counts and sums only — no person in any row.
-- ============================================================================

create or replace function admin_gamification_report(p_from date, p_to date) returns json
  language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := (p_from::timestamp at time zone 'America/Sao_Paulo');
  v_to   timestamptz := ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo');
begin
  if not is_admin() then raise exception 'admin only'; end if;
  return json_build_object(
    'from', p_from, 'to', p_to,
    'pointsIssued', coalesce((select sum(points) from points_ledger where created_at >= v_from and created_at < v_to), 0),
    'loopsBySource', coalesce((
      select json_agg(json_build_object('entryType', entry_type, 'fundingSource', funding_source, 'centi', centi, 'entries', n) order by entry_type, funding_source)
        from (select entry_type, funding_source, sum(amount_centi) as centi, count(*) as n
                from loops_ledger where created_at >= v_from and created_at < v_to
               group by entry_type, funding_source) x), '[]'::json),
    'redemptionsByBenefit', coalesce((
      select json_agg(json_build_object('benefitId', b.id, 'title', b.title, 'companyId', b.company_id,
                                        'redemptions', x.n, 'refunded', x.refunded, 'loopsCenti', x.centi) order by x.n desc)
        from (select benefit_id, count(*) filter (where status = 'active') as n, count(*) filter (where status = 'refunded') as refunded,
                     sum(loops_spent_centi) filter (where status = 'active') as centi
                from benefit_redemptions where created_at >= v_from and created_at < v_to group by benefit_id) x
        join benefits b on b.id = x.benefit_id), '[]'::json),
    'multiplierByCompanyMonth', coalesce((
      select json_agg(json_build_object('companyId', x.company_id, 'companyName', c.name, 'month', x.month,
                                        'loopsCenti', x.centi, 'people', x.people) order by x.month, c.name)
        from (select company_id, date_trunc('month', gam_sp_day(created_at))::date as month,
                     sum(amount_centi) as centi, count(distinct user_id) as people
                from loops_ledger
               where entry_type = 'earn_company_multiplier' and created_at >= v_from and created_at < v_to and company_id is not null
               group by company_id, date_trunc('month', gam_sp_day(created_at))) x
        join companies c on c.id = x.company_id), '[]'::json),
    'challengeResults', coalesce((
      select json_agg(json_build_object('id', ch.id, 'title', ch.title, 'companyId', ch.company_id, 'status', ch.status,
                                        'startsAt', ch.starts_at, 'endsAt', ch.ends_at,
                                        'participants', (select count(*) from challenge_participation p where p.challenge_id = ch.id and p.progress_value > 0),
                                        'completed', (select count(*) from challenge_participation p where p.challenge_id = ch.id and p.completed_at is not null),
                                        'rewarded', (select count(*) from challenge_participation p where p.challenge_id = ch.id and p.rewarded_at is not null),
                                        'bonusCenti', (select coalesce(sum(amount_centi), 0) from loops_ledger l where l.entry_type = 'challenge_bonus' and l.source_id = ch.id::text))
             order by ch.starts_at desc)
        from challenges ch where ch.starts_at < v_to and ch.ends_at >= v_from and ch.status <> 'draft'), '[]'::json)
  );
end $$;
revoke all on function admin_gamification_report(date, date) from public;
do $$ begin grant execute on function admin_gamification_report(date, date) to authenticated; exception when undefined_object then null; end $$;

notify pgrst, 'reload schema';
