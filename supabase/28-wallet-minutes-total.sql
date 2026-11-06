-- ============================================================================
-- 28 · A carteira passa a devolver TAMBÉM os minutos de sempre
--
-- POR QUE. O cartão "Seu cuidado" dizia "você dedicou 0 min a você este mês"
-- embaixo de um saldo de centenas de Loops. O número estava certo e era
-- inútil: nos primeiros dias de um mês novo, o mês ainda não tem nada, e o
-- saldo de Loops é de sempre. Lido lado a lado, parecia que o saldo tinha
-- sido inventado.
--
-- O QUE MUDA. `get_wallet()` ganha mais uma chave, `minutes_total`: a soma de
-- todos os minutos elegíveis já creditados, sem filtro de mês. Nada mais é
-- alterado — nenhuma coluna, nenhuma regra, nenhum valor existente.
--
-- O app já sabe viver sem isso: enquanto este arquivo não for executado, ele
-- lê `minutes_month` no lugar e o cartão volta a ser o que era. Rodar isto é
-- o que faz o cartão deixar de mostrar zero.
--
-- COMO RODAR. Cole no SQL Editor do Supabase (produção) e execute. É
-- idempotente: pode rodar duas vezes sem efeito nenhum.
-- ============================================================================

create or replace function get_wallet() returns json
  language sql stable security definer set search_path = public as $$
  with me as (select current_profile() as id),
       mo as (select date_trunc('month', gam_sp_day(now()))::date as month)
  select json_build_object(
    'balance_centi',  coalesce((select sum(l.amount_centi) from loops_ledger l, me where l.user_id = me.id), 0),
    'points_total',   coalesce((select sum(p.points) from points_ledger p, me where p.user_id = me.id), 0),
    'points_month',   coalesce((select sum(p.points) from points_ledger p, me, mo where p.user_id = me.id and p.period_month = mo.month), 0),
    'minutes_month',  coalesce((select sum(d.eligible_minutes) from gam_daily_usage d, me, mo where d.user_id = me.id and d.day >= mo.month), 0),
    -- novo: todos os minutos elegíveis, desde sempre
    'minutes_total',  coalesce((select sum(d.eligible_minutes) from gam_daily_usage d, me where d.user_id = me.id), 0),
    'sessions_month', coalesce((select sum(d.sessions) from gam_daily_usage d, me, mo where d.user_id = me.id and d.day >= mo.month), 0),
    'multiplier',     (select m.multiplier from me, gam_multiplier_at(me.id, now()) m where m.multiplier > 1)
  )
$$;
revoke all on function get_wallet() from public;
do $$ begin grant execute on function get_wallet() to authenticated; exception when undefined_object then null; end $$;

-- ---- conferência -----------------------------------------------------------
-- Deve trazer as duas chaves, e `minutes_total` nunca menor que `minutes_month`.
select get_wallet();

notify pgrst, 'reload schema';
