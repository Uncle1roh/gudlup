/* Geographic ranks: the rules the mock shares with get_geo_rankings(), the
   IBGE seed, and the privacy promises of GAM-R5 as the demo provider keeps
   them. The database side is supabase/tests/geo_privacy.sql.

   Run: npm test -- gam-geo                                                  */

import { readFileSync } from 'node:fs'
import {
  DEMO_CITY_MONTH, DEMO_MUNICIPALITIES, REGION_OF_UF, UF_NAMES, rankUnits, rollUp, searchKey, searchMunicipalities, cityLabel,
} from '../src/gamification/geo'
import { createMockProvider } from '../src/data/mock'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* A stand-in for the browser storage the demo provider keeps its state in. */
const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}

/* ---- ranking ------------------------------------------------------------- */
{
  const units = [
    { ref: 'big', points: 100000, activeUsers: 2000, minutes: 70000 },    // 50 / person
    { ref: 'small', points: 6000, activeUsers: 60, minutes: 4000 },       // 100 / person
    { ref: 'tiny', points: 9000, activeUsers: 30, minutes: 6000 },        // 300 / person, below 50
    { ref: 'tie-b', points: 3000, activeUsers: 60, minutes: 2000 },       // 50 / person
  ]
  const r = rankUnits(units, 50)
  assert(r.map((x) => x.ref).join() === 'small,big,tie-b', `per active person, a small city beats São Paulo; ties by reference (${r.map((x) => x.ref).join()})`)
  assert(!r.some((x) => x.ref === 'tiny'), 'a city below 50 active people never appears, however well it does')
  assert(r.map((x) => x.rank).join() === '1,2,3', 'every place has its own rank, as the SQL ranks over (value, reference)')
  assert(r[0].minutesPerActive === 67, `minutes per active person rounded (${r[0].minutesPerActive})`)
}

/* ---- the IBGE seed ---------------------------------------------------------- */
{
  const lines = readFileSync('supabase/seed/br_municipalities.csv', 'utf8').trim().split('\n')
  assert(lines[0] === 'ibge_code,name,uf,region', 'CSV header')
  const rows = lines.slice(1)
  assert(rows.length >= 5570, `every IBGE municipality is seeded (${rows.length})`)
  const ufs = new Set(rows.map((l) => l.split(',').slice(-2)[0]))
  assert(ufs.size === 27 && [...ufs].every((u) => UF_NAMES[u]), 'all 27 federative units, each with its name')
  const byCode = new Map(rows.map((l) => [l.slice(0, 7), l]))
  assert(DEMO_MUNICIPALITIES.every((m) => byCode.get(m.ibgeCode)?.includes(`,${m.uf},`)), 'every demo city is a real IBGE code in its own state')
  assert(rows.every((l) => { const parts = l.split(','); const uf = parts[parts.length - 2]; const region = parts[parts.length - 1]; return REGION_OF_UF[uf] === region }), 'every municipality sits in its IBGE region')
  const sql = readFileSync('supabase/seed/br_municipalities.sql', 'utf8')
  assert(sql.includes(`-- ${rows.length} IBGE municipalities`), 'the generated SQL is in step with the CSV (run tools/gen-municipalities.mjs after editing it)')
  assert(readFileSync('supabase/setup.sql', 'utf8').includes("('3550308','São Paulo','SP','SE','sao paulo')"), 'setup.sql carries the seed inline')
}

/* ---- the picker -------------------------------------------------------------- */
assert(searchKey('São Paulo') === 'sao paulo' && searchKey("Alta Floresta D'Oeste") === 'alta floresta d oeste', 'search keys drop accents and punctuation')
assert(searchMunicipalities(DEMO_MUNICIPALITIES, 'sao').map((m) => m.name).join() === 'São Luís,São Paulo', '"sao" finds São Luís and São Paulo, shorter names first (as the SQL orders)')
assert(searchMunicipalities(DEMO_MUNICIPALITIES, 'sao p')[0]?.name === 'São Paulo', '"sao p" finds São Paulo')
assert(searchMunicipalities(DEMO_MUNICIPALITIES, 'paulo').some((m) => m.name === 'São Paulo'), 'a word inside the name matches too')
assert(searchMunicipalities(DEMO_MUNICIPALITIES, 'f').length === 0, 'one letter is not a search')
assert(cityLabel({ name: 'Campinas', uf: 'SP' }) === 'Campinas · SP', 'labels read "Campinas · SP"')

/* ---- roll-up -------------------------------------------------------------------- */
{
  const ufOf = (ref: string) => DEMO_MUNICIPALITIES.find((m) => m.ibgeCode === ref)?.uf
  const states = rollUp(DEMO_CITY_MONTH, 'state', ufOf)
  const sp = states.find((s) => s.ref === 'SP')
  assert(sp?.activeUsers === 2140 + 230, 'São Paulo state = São Paulo + Campinas')
  const regions = rollUp(DEMO_CITY_MONTH, 'region', ufOf)
  assert(regions.every((r) => ['N', 'NE', 'SE', 'S', 'CO'].includes(r.ref)), 'regions are IBGE regions only — nothing smaller than a city, nothing in between (GAM-R4)')
}

/* ---- the demo provider keeps the promises ------------------------------------------ */
async function demo() {
  store.clear()
  const dp = createMockProvider({ gamificationHistory: false })
  let r = await dp.getGeoRankings('city', 'month', 5)
  assert(r.mine === null, 'no consent: the person has no place in any ranking')
  assert(!r.rows.some((x) => x.ref === '1721000'), 'Palmas (31 active people) never appears')
  assert(r.rows[0]?.ref !== '3550308', 'per active person, the biggest city is not automatically first')
  assert(!JSON.stringify(r).match(/points/i), 'rankings carry no points (PLAN A6)')

  await dp.setMyCity('1721000')
  await dp.recordConsent({ purpose: 'geo_ranking', granted: true, wording: 'test', locale: 'pt-BR' })
  r = await dp.getGeoRankings('city', 'month', 5)
  assert(r.mine?.ref === '1721000' && r.mine.eligible === false && r.mine.rank === null, 'my city below the threshold: named to me, never ranked')
  let card = await dp.getMyCityCard()
  assert(card?.eligible === false && card.goalShare === null, 'and its card shows no city figure')

  await dp.setMyCity('3509502')
  r = await dp.getGeoRankings('city', 'month', 5)
  assert(r.mine?.eligible === true && typeof r.mine.rank === 'number', 'Campinas: ranked, even if outside the top 5')
  card = await dp.getMyCityCard()
  assert(card?.eligible === true && card.goalShare !== null && card.goalShare <= 1, 'Campinas: the card shows its share of the goal')

  await dp.recordConsent({ purpose: 'geo_ranking', granted: false, wording: 'test', locale: 'pt-BR' })
  r = await dp.getGeoRankings('city', 'month', 5)
  assert(r.mine === null, 'withdrawn: out of the rankings at once')

  let threw = false
  try { await dp.setMyCity('9999999') } catch { threw = true }
  assert(threw, 'an unknown code is refused')
}

demo().then(() => console.log(process.exitCode ? '\nFAILED' : '\ndone.'))
