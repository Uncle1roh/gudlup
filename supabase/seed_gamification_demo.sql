-- ============================================================================
-- GAMIFICATION DEMO SEED — fictional, for a DEMO or STAGING database only.
-- docs/gamification/SPEC.md §10 slice 7. Never on production.
--
--   - Aurora Alimentos (AURORA-ALIMENTOS): Premium 1.5×, "Alimentos e
--     bebidas" switched off (a food company avoiding a conflict of interest)
--   - 40 demo people across São Paulo, Florianópolis, Curitiba, Recife and
--     Belo Horizonte — 12 of them Aurora employees — with listening history
--     over the last 18 days, most of them in the rankings (geo_ranking)
--   - "Outubro Sereno" (active, 5 h, a 90 %-off facial cream), "Semana do
--     Sono" (scheduled), "Novembro em Loop" (Aurora, ≥ 60 % with 3+ sessions)
--   - 15 benefits across every pillar; partners are [PARCEIRO]
--
-- Safe to re-run: every row has a fixed id and is inserted once. The demo
-- people have no login (auth_uid is null). To see an HR view of Aurora, set
-- an HR account's profiles.company_id to 'AURORA-ALIMENTOS'.
--
-- The city threshold is 50 active people; these 40 never reach it, so the
-- rankings show the "ainda reunindo pessoas" state, as they should. To show
-- rankings in a demo database ONLY, run, and later undo:
--   update economy_settings set geo_min_active_users = 5 where id;
--   select refresh_geo_and_collectives();
-- ============================================================================

begin;

-- History is dated over the past weeks: credit it on its own days, then put
-- the backdating bound back exactly as it was.
create temp table gl_demo_prev on commit drop as select max_backdate_hours as v from economy_settings where id;
update economy_settings set max_backdate_hours = null where id;

insert into companies (id, name, seats, status) values ('AURORA-ALIMENTOS', 'Aurora Alimentos', 60, 'active')
on conflict (id) do nothing;
insert into company_addon_subscriptions (id, company_id, plan_id, starts_at)
values ('9a000000-0000-0000-0000-000000000001', 'AURORA-ALIMENTOS', 'premium', now() - interval '120 days')
on conflict (id) do nothing;
insert into company_disabled_tags (company_id, tag_id)
select 'AURORA-ALIMENTOS', id from benefit_tags where slug = 'alimentos_bebidas'
on conflict do nothing;

-- ---- the people --------------------------------------------------------------
insert into profiles (id, role, name, email, company_id, city_ibge_code, created_at)
select md5('gl-demo-person-' || i)::uuid, 'b2c_user', format('Pessoa Demo %s', lpad(i::text, 2, '0')),
       format('demo+gam%s@goodloop.demo', lpad(i::text, 2, '0')),
       case when i <= 12 then 'AURORA-ALIMENTOS' end,
       (array['3550308', '4205407', '4106902', '2611606', '3106200'])[1 + (i - 1) % 5],
       now() - interval '120 days'
  from generate_series(1, 40) i
on conflict (id) do nothing;
update company_affiliations set started_at = now() - interval '120 days'
 where company_id = 'AURORA-ALIMENTOS' and user_id in (select md5('gl-demo-person-' || i)::uuid from generate_series(1, 12) i)
   and started_at > now() - interval '120 days';
-- 34 of the 40 take part in the rankings
insert into consent_events (profile_id, purpose, granted, wording, locale, at)
select md5('gl-demo-person-' || i)::uuid, 'geo_ranking', true,
       'Participar dos rankings — Sua escuta conta para a cidade que você escolher. Usamos só a cidade que você informar, nunca sua localização.',
       'pt-BR', now() - interval '100 days'
  from generate_series(1, 40) i
 where i % 7 <> 0
   and not exists (select 1 from consent_events c where c.profile_id = md5('gl-demo-person-' || i)::uuid and c.purpose = 'geo_ranking');

-- ---- the benefits ---------------------------------------------------------------
insert into benefits (id, title, care_rationale, partner_name, pillar, price_loops_centi, delivery_type, static_code, link_url, terms, status, code_validity_days, sort_order)
values
  (md5('gl-demo-benefit-sono1')::uuid,  'Máscara de dormir em seda', 'Escuridão de verdade ajuda o corpo a reconhecer a hora de descansar.', '[PARCEIRO]', 'sono', 6000, 'static_code', 'DEMO-SONO1', null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 1),
  (md5('gl-demo-benefit-sono2')::uuid,  '30% em travesseiro anatômico', 'Um apoio certo para o pescoço deixa o sono mais contínuo.', '[PARCEIRO]', 'sono', 9000, 'static_code', 'DEMO-SONO2', null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 2),
  (md5('gl-demo-benefit-sono3')::uuid,  'Chá calmante, caixa com 20', 'Um ritual quente e sem cafeína antes de deitar sinaliza pausa.', '[PARCEIRO]', 'sono', 3000, 'static_code', 'DEMO-SONO3', null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 3),
  (md5('gl-demo-benefit-mente1')::uuid, '3 meses de app de diário', 'Escrever o que pesa tira da cabeça e põe no papel.', '[PARCEIRO]', 'mente', 5000, 'code_pool', null, null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 1),
  (md5('gl-demo-benefit-mente2')::uuid, 'Livro sobre atenção plena', 'Ler devagar, sem tela, é descanso para a atenção.', '[PARCEIRO]', 'mente', 7000, 'static_code', 'DEMO-MENTE2', null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 2),
  (md5('gl-demo-benefit-corpo1')::uuid, '20% em sessão de massagem', 'Soltar a musculatura ajuda a mente a soltar junto.', '[PARCEIRO]', 'corpo', 8000, 'static_code', 'DEMO-CORPO1', null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 1),
  (md5('gl-demo-benefit-corpo2')::uuid, '15% em farmácia parceira', 'Cuidar do básico, como protetor e hidratante, também é cuidado.', '[PARCEIRO]', 'corpo', 2500, 'link', null, 'https://example.org/beneficio', 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 2),
  (md5('gl-demo-benefit-mov1')::uuid,   'Aula experimental de ioga', 'Respirar e mover o corpo no mesmo ritmo acalma por dentro.', '[PARCEIRO]', 'movimento', 4000, 'static_code', 'DEMO-MOV1', null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 1),
  (md5('gl-demo-benefit-mov2')::uuid,   '1 mês de academia com 25%', 'Movimento regular é um dos cuidados mais simples com o humor.', '[PARCEIRO]', 'movimento', 12000, 'code_pool', null, null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 2),
  (md5('gl-demo-benefit-alim1')::uuid,  'Cesta de frutas da estação', 'Comer com cor e com calma é uma pausa que alimenta.', '[PARCEIRO]', 'alimentacao', 7500, 'static_code', 'DEMO-ALIM1', null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 1),
  (md5('gl-demo-benefit-alim2')::uuid,  'Consulta com nutricionista, 30%', 'Uma conversa sobre o que você come, sem regras impostas.', '[PARCEIRO]', 'alimentacao', 10000, 'static_code', 'DEMO-ALIM2', null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 2),
  (md5('gl-demo-benefit-pausa1')::uuid, 'Ingresso de cinema', 'Duas horas longe das notificações também descansam.', '[PARCEIRO]', 'pausas_lazer', 6500, 'code_pool', null, null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 1),
  (md5('gl-demo-benefit-pausa2')::uuid, 'Fone com cancelamento de ruído, 20%', 'Silêncio onde você estiver, para ouvir o que importa.', '[PARCEIRO]', 'pausas_lazer', 15000, 'static_code', 'DEMO-PAUSA2', null, 'Válido uma vez por pessoa. Benefício de demonstração.', 'active', 30, 2),
  (md5('gl-demo-benefit-pausa3')::uuid, 'Doação para um projeto de saúde mental', 'Seu cuidado também pode cuidar de outra pessoa.', '[PARCEIRO]', 'pausas_lazer', 2000, 'collective', null, null, 'Benefício de demonstração.', 'active', null, 3)
on conflict (id) do nothing;
-- the Outubro Sereno prize: only through the challenge, made active once linked below
insert into benefits (id, title, care_rationale, partner_name, pillar, price_loops_centi, delivery_type, static_code, terms, status, stock_total, stock_remaining, code_validity_days)
values (md5('gl-demo-benefit-corpo3')::uuid, '90% em creme facial', 'Um momento de autocuidado no fim do dia, só para você.', '[PARCEIRO]', 'corpo', null, 'static_code', 'DEMO-CREME90',
        'Para quem concluir o desafio Outubro Sereno. Benefício de demonstração.', 'draft', 30, 30, 30)
on conflict (id) do nothing;

insert into benefit_tag_map (benefit_id, tag_id)
select md5('gl-demo-benefit-' || m.b)::uuid, t.id
  from (values ('sono1', 'beleza_cuidado'), ('sono1', 'produto_fisico'), ('sono2', 'varejo'), ('sono2', 'desconto'),
               ('sono3', 'alimentos_bebidas'), ('sono3', 'produto_fisico'), ('mente1', 'apps_bem_estar'), ('mente1', 'gratuidade'),
               ('mente2', 'livros_cultura'), ('mente2', 'produto_fisico'), ('corpo1', 'beleza_cuidado'), ('corpo1', 'desconto'),
               ('corpo2', 'farmacia_saude'), ('corpo2', 'desconto'), ('corpo3', 'beleza_cuidado'), ('corpo3', 'desconto'),
               ('mov1', 'academias_esportes'), ('mov1', 'experiencia'), ('mov2', 'academias_esportes'), ('mov2', 'desconto'),
               ('alim1', 'alimentos_bebidas'), ('alim1', 'produto_fisico'), ('alim2', 'farmacia_saude'), ('alim2', 'desconto'),
               ('pausa1', 'livros_cultura'), ('pausa1', 'gratuidade'), ('pausa2', 'tecnologia_audio'), ('pausa2', 'desconto'),
               ('pausa3', 'doacao')) as m(b, tag)
  join benefit_tags t on t.slug = m.tag
on conflict do nothing;

insert into benefit_codes (benefit_id, code)
select md5('gl-demo-benefit-' || c.b)::uuid, c.code
  from (values ('mente1', 'DIARIO-7KQ2'), ('mente1', 'DIARIO-P3LM'), ('mente1', 'DIARIO-X81C'), ('mente1', 'DIARIO-Q9ZT'),
               ('mov2', 'GYM-5521'), ('mov2', 'GYM-0943'), ('mov2', 'GYM-7718'),
               ('pausa1', 'CINE-AB12'), ('pausa1', 'CINE-CD34'), ('pausa1', 'CINE-EF56'), ('pausa1', 'CINE-GH78')) as c(b, code)
on conflict do nothing;

-- Aurora's own benefits
insert into benefits (id, company_id, title, care_rationale, pillar, price_loops_centi, delivery_type, status, stock_total, stock_remaining, code_validity_days)
values (md5('gl-demo-benefit-aurora-folga')::uuid, 'AURORA-ALIMENTOS', 'Um dia de folga', 'Um dia inteiro para descansar de verdade.', 'pausas_lazer', 30000, 'identified', 'active', 10, 10, 60),
       (md5('gl-demo-benefit-aurora-cafe')::uuid, 'AURORA-ALIMENTOS', 'Café da manhã da empresa', 'Uma pausa juntos, sem pressa.', 'alimentacao', 0, 'collective', 'active', null, null, null)
on conflict (id) do nothing;

-- ---- the challenges ------------------------------------------------------------------
insert into challenges (id, title, description, badge_icon, format, scope, metric, goal_value, starts_at, ends_at, status,
                        reward_benefit_id, reward_rule_when_out_of_stock, published_at)
values (md5('gl-demo-challenge-outubro-sereno')::uuid, 'Outubro Sereno', 'Cinco horas de escuta ao longo do mês, no seu ritmo.', 'moon',
        'individual', 'national', 'minutes_listened', 300,
        date_trunc('month', now()), date_trunc('month', now()) + interval '1 month' - interval '1 second', 'active',
        md5('gl-demo-benefit-corpo3')::uuid, 'first_to_complete', now())
on conflict (id) do nothing;
update benefits set challenge_exclusive_id = md5('gl-demo-challenge-outubro-sereno')::uuid, status = 'active'
 where id = md5('gl-demo-benefit-corpo3')::uuid and challenge_exclusive_id is null;

insert into challenges (id, title, description, badge_icon, format, scope, metric, goal_value, window_start_hour, window_end_hour,
                        starts_at, ends_at, status, reward_bonus_loops_centi, published_at)
values (md5('gl-demo-challenge-semana-do-sono')::uuid, 'Semana do Sono', 'Cinco sessões depois das 21h em uma semana, para chegar à cama mais calmo.', 'moon',
        'individual', 'national', 'sessions_in_time_window', 5, 21, 24,
        now() + interval '10 days', now() + interval '17 days', 'scheduled', 3000, now())
on conflict (id) do nothing;

insert into challenges (id, company_id, title, description, badge_icon, format, scope, scope_ref, metric, goal_value, goal_kind, per_person_min,
                        starts_at, ends_at, status, reward_bonus_loops_centi, template_slug, published_at)
select md5('gl-demo-challenge-novembro-em-loop')::uuid, 'AURORA-ALIMENTOS', 'Novembro em Loop', t.description, t.badge_icon,
       'collective', 'company', 'AURORA-ALIMENTOS', t.metric, 60, t.goal_kind, 3,
       now() - interval '6 days', now() + interval '24 days', 'active', 3000, t.slug, now()
  from challenge_templates t where t.slug = 'empresa_em_sintonia'
on conflict (id) do nothing;

-- ---- listening history: 3 to 7 sessions each over 18 days, mixed lengths ------------
insert into sessions (id, kind, b2c_profile_id, protocol_code, duration_min, started_at, ended_at, listened_sec, completed, stereo_checked)
select md5(format('gl-demo-session-%s-%s', i, j))::uuid, 'b2c', md5('gl-demo-person-' || i)::uuid, 'GL-DEMO',
       d, e - make_interval(mins => d), e, d * 60, true, j = 1
  from generate_series(1, 40) i
  cross join lateral generate_series(1, 3 + i % 5) j
  cross join lateral (select (array[6, 12, 24])[1 + (i + j) % 3] as d) dur
  cross join lateral (select now() - make_interval(days => (j * 3 + i) % 18, hours => (i * 5 + j * 7) % 14) - interval '30 minutes' as e) t
on conflict (id) do nothing;

update economy_settings set max_backdate_hours = (select v from gl_demo_prev) where id;

commit;

-- the roll-up and the collective achievements, now that the history is in
select refresh_geo_and_collectives();
