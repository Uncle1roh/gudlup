/* ============================================================================
   The demo catalogue — fictional, for demo mode and the walkthrough.

   SPEC §10 slice 7: ~15 benefits across every pillar, partner names kept as
   [PARCEIRO] placeholders. The tag list mirrors the seed in setup.sql
   (§6.4). Nothing here ever reaches a real database; the live catalogue is
   written in Admin › Benefici.
   ============================================================================ */

import type { Benefit, BenefitTag } from './benefits'

export const TAG_SEED: BenefitTag[] = ([
  ['beleza_cuidado', 'Beleza e cuidado pessoal', 'partner_segment'],
  ['alimentos_bebidas', 'Alimentos e bebidas', 'partner_segment'],
  ['farmacia_saude', 'Farmácia e saúde', 'partner_segment'],
  ['academias_esportes', 'Academias e esportes', 'partner_segment'],
  ['apps_bem_estar', 'Apps de bem-estar', 'partner_segment'],
  ['viagens_turismo', 'Viagens e turismo', 'partner_segment'],
  ['livros_cultura', 'Livros e cultura', 'partner_segment'],
  ['tecnologia_audio', 'Tecnologia e áudio', 'partner_segment'],
  ['moda', 'Moda', 'partner_segment'],
  ['varejo', 'Varejo', 'partner_segment'],
  ['desconto', 'Desconto', 'benefit_type'],
  ['gratuidade', 'Gratuidade', 'benefit_type'],
  ['experiencia', 'Experiência', 'benefit_type'],
  ['produto_fisico', 'Produto físico', 'benefit_type'],
  ['doacao', 'Doação', 'benefit_type'],
] as const).map(([slug, label, group]) => ({ id: `tag-${slug}`, slug, label, group, description: null, active: true }))

const tag = (slug: string) => `tag-${slug}`

function b(
  id: string, pillar: Benefit['pillar'], title: string, careRationale: string, price: number,
  tags: string[], delivery: Benefit['deliveryType'] = 'static_code', extra: Partial<Benefit> = {},
): Benefit {
  return {
    id, companyId: null, title, description: null, careRationale, partnerName: '[PARCEIRO]', pillar,
    priceLoopsCenti: price, stockTotal: null, stockRemaining: null, perUserLimit: 1,
    validFrom: null, validTo: null, codeValidityDays: 30, deliveryType: delivery,
    staticCode: delivery === 'static_code' ? `DEMO-${id.toUpperCase()}` : null,
    linkUrl: delivery === 'link' ? 'https://example.org/beneficio' : null,
    terms: 'Válido uma vez por pessoa. Benefício de demonstração.', imageAsset: null,
    status: 'active', challengeExclusiveId: null, sortOrder: 0, tagIds: tags.map(tag), ...extra,
  }
}

export const DEMO_BENEFITS: Benefit[] = [
  b('sono1', 'sono', 'Máscara de dormir em seda', 'Escuridão de verdade ajuda o corpo a reconhecer a hora de descansar.', 6000, ['beleza_cuidado', 'produto_fisico']),
  b('sono2', 'sono', '30% em travesseiro anatômico', 'Um apoio certo para o pescoço deixa o sono mais contínuo.', 9000, ['varejo', 'desconto']),
  b('sono3', 'sono', 'Chá calmante, caixa com 20', 'Um ritual quente e sem cafeína antes de deitar sinaliza pausa.', 3000, ['alimentos_bebidas', 'produto_fisico']),
  b('mente1', 'mente', '3 meses de app de diário', 'Escrever o que pesa tira da cabeça e põe no papel.', 5000, ['apps_bem_estar', 'gratuidade'], 'code_pool'),
  b('mente2', 'mente', 'Livro sobre atenção plena', 'Ler devagar, sem tela, é descanso para a atenção.', 7000, ['livros_cultura', 'produto_fisico']),
  b('corpo1', 'corpo', '20% em sessão de massagem', 'Soltar a musculatura ajuda a mente a soltar junto.', 8000, ['beleza_cuidado', 'desconto']),
  b('corpo2', 'corpo', '15% em farmácia parceira', 'Cuidar do básico, como protetor e hidratante, também é cuidado.', 2500, ['farmacia_saude', 'desconto'], 'link'),
  b('corpo3', 'corpo', '90% em creme facial', 'Um momento de autocuidado no fim do dia, só para você.', 0, ['beleza_cuidado', 'desconto'], 'code_pool', { priceLoopsCenti: null, challengeExclusiveId: 'outubro-sereno' }),
  b('mov1', 'movimento', 'Aula experimental de ioga', 'Respirar e mover o corpo no mesmo ritmo acalma por dentro.', 4000, ['academias_esportes', 'experiencia']),
  b('mov2', 'movimento', '1 mês de academia com 25%', 'Movimento regular é um dos cuidados mais simples com o humor.', 12000, ['academias_esportes', 'desconto'], 'code_pool'),
  b('alim1', 'alimentacao', 'Cesta de frutas da estação', 'Comer com cor e com calma é uma pausa que alimenta.', 7500, ['alimentos_bebidas', 'produto_fisico']),
  b('alim2', 'alimentacao', 'Consulta com nutricionista, 30%', 'Uma conversa sobre o que você come, sem regras impostas.', 10000, ['farmacia_saude', 'desconto']),
  b('pausa1', 'pausas_lazer', 'Ingresso de cinema', 'Duas horas longe das notificações também descansam.', 6500, ['livros_cultura', 'gratuidade'], 'code_pool'),
  b('pausa2', 'pausas_lazer', 'Fone com cancelamento de ruído, 20%', 'Silêncio onde você estiver, para ouvir o que importa.', 15000, ['tecnologia_audio', 'desconto']),
  b('pausa3', 'pausas_lazer', 'Doação para um projeto de saúde mental', 'Seu cuidado também pode cuidar de outra pessoa.', 2000, ['doacao'], 'collective'),
]

/** Codes for the demo's code-pool benefits. */
export const DEMO_CODES: Record<string, string[]> = {
  mente1: ['DIARIO-7KQ2', 'DIARIO-P3LM', 'DIARIO-X81C'],
  mov2: ['GYM-5521', 'GYM-0943'],
  pausa1: ['CINE-AB12', 'CINE-CD34', 'CINE-EF56'],
  corpo3: ['CREME-90-A', 'CREME-90-B'],
}
