/* Health-first, never e-commerce — SPEC §6.5, GAM-R7, as a test.

   Fails when a word from the "never use" column, or a forbidden pattern,
   reaches the pt-BR strings of the Benefits and Challenges screens: the
   gamification dictionary, the screens' own source, and the demo
   catalogue a walkthrough shows. Add a screen to SCREENS when it is built.

   Run: npm test -- gam-copy                                                  */

import { readFileSync, existsSync } from 'node:fs'
import { PT_GAMIFICATION } from '../src/i18n/gamification'
import { DEMO_BENEFITS } from '../src/gamification/benefitsDemo'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* §6.5, "Never use" — pt-BR, with the English a screen might slip in. */
const FORBIDDEN: [RegExp, string][] = [
  [/\bcompr(ar|a|as|e|ou|ando)\b/i, 'Comprar'],
  [/\bcarrinho\b/i, 'Carrinho'],
  [/\bcheckout\b/i, 'Checkout'],
  [/\bloja(s)?\b/i, 'Loja'],
  [/\bshop(ping)?\b/i, 'Shop'],
  [/\boferta(s)?\b/i, 'Oferta'],
  [/\bpromo(ção|cao|ções|coes)\b/i, 'Promoção'],
  [/\bimperd[ií]ve(l|is)\b/i, 'Imperdível'],
  [/\bliquida(ção|cao)\b/i, 'Liquidação'],
  [/[úu]ltimas unidades/i, 'Últimas unidades'],
  [/\bs[óo] hoje\b/i, 'Só hoje'],
  [/saldo de compras/i, 'Saldo de compras'],
  [/\bcashback\b/i, 'cashback'],
  [/mais vendid/i, 'Mais vendidos'],
  [/\b(buy|cart|store|sale|deal|offer)s?\b/i, 'English shop words'],
  [/\bpontua(ção|cao)\b|\bn[íi]vel\b/i, 'measurement words (lexicon LA10, PLAN A6)'],
]

function scan(where: string, text: string) {
  const hits = FORBIDDEN.filter(([re]) => re.test(text)).map(([, w]) => w)
  assert(!hits.length, `${where}: no forbidden word${hits.length ? ` — found ${hits.join(', ')}` : ''}`)
}

/* the dictionary, value by value */
for (const [k, v] of Object.entries(PT_GAMIFICATION)) {
  const hits = FORBIDDEN.filter(([re]) => re.test(v)).map(([, w]) => w)
  if (hits.length) assert(false, `pt-BR "${k}" → "${v}" uses ${hits.join(', ')}`)
}
assert(true, `${Object.keys(PT_GAMIFICATION).length} pt-BR gamification strings scanned`)

/* the demo catalogue the person sees */
for (const b of DEMO_BENEFITS) scan(`demo benefit "${b.title}"`, [b.title, b.careRationale, b.description, b.terms].filter(Boolean).join(' '))

/* the screens: their string literals and t() keys, and the forbidden UI patterns */
const SCREENS = [
  'src/selfuse/BenefitsTab.tsx',
  'src/selfuse/ChallengeCard.tsx',
  'src/selfuse/ChallengeDetail.tsx',
]
for (const f of SCREENS.filter((x) => existsSync(x))) {
  /* the code, not the comments that state the rules */
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  const literals = [...src.matchAll(/'([^'\n]{3,})'/g)].map((m) => m[1]).filter((s) => /\s/.test(s)).join(' | ')
  scan(f, literals)
  assert(!/line-through|<s>|<del>|<strike/i.test(src), `${f}: no strikethrough price`)
  assert(!/countdown|setInterval|stockRemaining|stock_remaining/i.test(src), `${f}: no countdown, no stock figure`)
  assert(!/mais vendid|best.?sell|trending|popular/i.test(src), `${f}: no "mais vendidos"`)
}

/* §6.5: the tab never learns a stock figure at all */
{
  const benefits = readFileSync('src/gamification/benefits.ts', 'utf8')
  const view = benefits.slice(benefits.indexOf('export interface BenefitView'), benefits.indexOf('export interface Redemption'))
  assert(!/stock/i.test(view.replace('inStock', '')), 'BenefitView carries no stock figure — only whether it can be had')
}

console.log(process.exitCode ? '\nFAILED' : '\ndone.')
