-- ============================================================================
-- 27 · Um minuto é um Ponto é um Loop
--
-- Decisão dos POs, 2026-11-02:
--
--   · 1 minuto de escuta = 1 Ponto = 1 Loop;
--   · só conta se a pessoa TERMINAR o protocolo — uma sessão interrompida
--     continua sendo registrada (os minutos são reais e o histórico do
--     profissional os lê), mas não gera nada;
--   · o multiplicador vem do CONTRATO da empresa e é 1, 1,5 ou 2.
--
-- Antes: 1 ponto por minuto, 10 pontos de bônus por sessão completada, e
-- 0,1 Loop por ponto — uma sessão Padrão de 12 minutos valia 22 pontos e
-- 2 Loops. Agora vale 12 pontos e 12 Loops.
--
-- NADA é recalculado para trás (os registros são só de acréscimo, GAM-R8):
-- isto vale para as sessões registradas a partir de agora.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Idempotente.
-- Espelha src/gamification/economy.ts; a prova está em
-- supabase/tests/economy_parity.sql + tools/test-gam-economy.ts.
-- ============================================================================

-- 1. AS REGRAS, como padrão da tabela e na linha que já existe ---------------
alter table economy_settings
  alter column points_per_completed_session set default 0,
  alter column loops_per_point              set default 1;

update economy_settings set
  points_per_minute            = 1,
  points_per_completed_session = 0,
  loops_per_point              = 1,
  updated_at                   = now()
where id;

-- 2. O MULTIPLICADOR do contrato: 1, 1,5 ou 2 --------------------------------
-- O painel admin agora oferece só estes três (src/admin/Plans.tsx). A trava
-- fica no banco também, porque um plano é escrito por uma pessoa.
alter table addon_plans drop constraint if exists addon_plans_contract_multiplier;
-- Planos já gravados fora da escala sobem para o degrau mais próximo ACIMA
-- (ninguém perde Loops por causa desta mudança), com teto em 2.
update addon_plans
   set loops_multiplier = case
         when loops_multiplier <= 1   then 1
         when loops_multiplier <= 1.5 then 1.5
         else 2 end
 where loops_multiplier not in (1, 1.5, 2);
alter table addon_plans
  add constraint addon_plans_contract_multiplier
  check (loops_multiplier in (1, 1.5, 2));

-- 3. A FUNÇÃO que credita, com a condição de ter terminado -------------------
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
  -- A session that was not FINISHED earns nothing, however long it played
  -- (POs, 2026-11-02). The row is still recorded; only the credit is zero.
  if not s.completed then return; end if;
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

-- 4. CONFERE -----------------------------------------------------------------
select points_per_minute   as pontos_por_minuto,
       loops_per_point     as loops_por_ponto,
       points_per_completed_session as bonus_de_conclusao,
       daily_minutes_cap   as teto_de_minutos_por_dia
  from economy_settings;

select id as plano, name as nome, loops_multiplier as multiplicador
  from addon_plans order by loops_multiplier;

notify pgrst, 'reload schema';
