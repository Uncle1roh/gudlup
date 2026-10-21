/* ============================================================================
   Geographic ranks — the rules, with no React and no I/O.  SPEC §4.

   The database is the source (geo_rollup + get_geo_rankings in setup.sql);
   these are the same rules for the mock: rank by Points per ACTIVE person,
   ties by reference, and nothing below its threshold — a city needs
   geo_min_active_users (50) active people, a state or region the k floor.
   What reaches the person is a rank and minutes per active person, never
   Points (PLAN A6). The city is the one they declare, never a location.
   ============================================================================ */

export type GeoScope = 'city' | 'state' | 'region'

export interface Municipality {
  ibgeCode: string
  name: string
  uf: string
}

/** One unit's totals for a period, as the roll-up holds them. */
export interface GeoUnit {
  ref: string
  points: number
  activeUsers: number
  minutes: number
}

export interface RankRow {
  ref: string
  /** City name; null for a state or region (see UF_NAMES / REGION_NAMES). */
  name: string | null
  uf: string | null
  rank: number
  minutesPerActive: number
  mine: boolean
}

export interface GeoRanking {
  scope: GeoScope
  period: 'month' | 'all'
  threshold: number
  rows: RankRow[]
  /** The person's own unit: ranked when eligible, even outside the top N. */
  mine: { ref: string; name: string | null; uf: string | null; rank: number | null; eligible: boolean } | null
}

export interface CityCard {
  consented: boolean
  city: Municipality | null
  /** Above the threshold — only then are city figures shown at all. */
  eligible: boolean
  goalSlug: string
  /** 0..1 of this month's "Cidade em Loop" goal; null below the threshold. */
  goalShare: number | null
  myMinutesMonth: number
}

/** Mirrors the ranking in get_geo_rankings(): eligible units, by Points per
    active person, ties by reference. The SQL ranks over (value, ref), so
    every unit has its own place — two cities never share one. */
export function rankUnits(units: GeoUnit[], threshold: number): (GeoUnit & { rank: number; minutesPerActive: number })[] {
  const eligible = units.filter((u) => u.activeUsers >= threshold && u.activeUsers > 0)
  const sorted = [...eligible].sort((a, b) => {
    const d = b.points / b.activeUsers - a.points / a.activeUsers
    return d !== 0 ? d : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0
  })
  return sorted.map((u, i) => ({ ...u, rank: i + 1, minutesPerActive: Math.round(u.minutes / u.activeUsers) }))
}

export const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
}

/** IBGE regions. English keys for i18n; pt-BR in src/i18n/gamification.ts. */
export const REGION_NAMES: Record<string, string> = {
  N: 'North', NE: 'Northeast', SE: 'Southeast', S: 'South', CO: 'Centre-West',
}

export const REGION_OF_UF: Record<string, string> = {
  AC: 'N', AP: 'N', AM: 'N', PA: 'N', RO: 'N', RR: 'N', TO: 'N',
  AL: 'NE', BA: 'NE', CE: 'NE', MA: 'NE', PB: 'NE', PE: 'NE', PI: 'NE', RN: 'NE', SE: 'NE',
  ES: 'SE', MG: 'SE', RJ: 'SE', SP: 'SE',
  PR: 'S', RS: 'S', SC: 'S',
  DF: 'CO', GO: 'CO', MT: 'CO', MS: 'CO',
}

/** "Campinas · SP" */
export const cityLabel = (m: { name: string | null; uf: string | null; ref?: string }) =>
  m.name ? `${m.name}${m.uf ? ` · ${m.uf}` : ''}` : (m.ref ?? '')

/** Lower-case, accents gone — the same key the database searches on. */
export function searchKey(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/* ---- the demo --------------------------------------------------------------

   The mock provider has one person, so the cities around them are fixtures:
   the 27 capitals plus Campinas, with this month's totals invented for the
   five demo cities of SPEC §10 slice 7. Plainly demo data — never shown
   outside demo mode. */

export const DEMO_MUNICIPALITIES: Municipality[] = [
  ['1200401', 'Rio Branco', 'AC'], ['2704302', 'Maceió', 'AL'], ['1600303', 'Macapá', 'AP'], ['1302603', 'Manaus', 'AM'],
  ['2927408', 'Salvador', 'BA'], ['2304400', 'Fortaleza', 'CE'], ['5300108', 'Brasília', 'DF'], ['3205309', 'Vitória', 'ES'],
  ['5208707', 'Goiânia', 'GO'], ['2111300', 'São Luís', 'MA'], ['5103403', 'Cuiabá', 'MT'], ['5002704', 'Campo Grande', 'MS'],
  ['3106200', 'Belo Horizonte', 'MG'], ['1501402', 'Belém', 'PA'], ['2507507', 'João Pessoa', 'PB'], ['4106902', 'Curitiba', 'PR'],
  ['2611606', 'Recife', 'PE'], ['2211001', 'Teresina', 'PI'], ['3304557', 'Rio de Janeiro', 'RJ'], ['2408102', 'Natal', 'RN'],
  ['4314902', 'Porto Alegre', 'RS'], ['1100205', 'Porto Velho', 'RO'], ['1400100', 'Boa Vista', 'RR'], ['4205407', 'Florianópolis', 'SC'],
  ['3550308', 'São Paulo', 'SP'], ['2800308', 'Aracaju', 'SE'], ['1721000', 'Palmas', 'TO'], ['3509502', 'Campinas', 'SP'],
].map(([ibgeCode, name, uf]) => ({ ibgeCode, name, uf }))

/** This month's demo totals: points, active people, minutes. */
export const DEMO_CITY_MONTH: GeoUnit[] = [
  { ref: '3550308', points: 84320, activeUsers: 2140, minutes: 61200 },   // São Paulo
  { ref: '4205407', points: 21960, activeUsers: 410, minutes: 16100 },    // Florianópolis
  { ref: '4106902', points: 30480, activeUsers: 690, minutes: 22300 },    // Curitiba
  { ref: '2611606', points: 18900, activeUsers: 455, minutes: 13700 },    // Recife
  { ref: '3106200', points: 26250, activeUsers: 600, minutes: 19200 },    // Belo Horizonte
  { ref: '3509502', points: 9100, activeUsers: 230, minutes: 6600 },      // Campinas
  { ref: '1721000', points: 900, activeUsers: 31, minutes: 650 },         // Palmas — below 50, never shown
]

export function searchMunicipalities(list: Municipality[], q: string, limit = 12): Municipality[] {
  const k = searchKey(q)
  if (k.length < 2) return []
  return list
    .map((m) => ({ m, key: searchKey(m.name) }))
    .filter(({ key }) => key.startsWith(k) || key.includes(` ${k}`))
    .sort((a, b) => Number(b.key.startsWith(k)) - Number(a.key.startsWith(k)) || a.m.name.length - b.m.name.length || a.m.name.localeCompare(b.m.name))
    .slice(0, limit)
    .map(({ m }) => m)
}

/** Roll the demo cities up to states or regions. */
export function rollUp(cities: GeoUnit[], scope: GeoScope, ufOf: (ref: string) => string | undefined): GeoUnit[] {
  if (scope === 'city') return cities
  const by = new Map<string, GeoUnit>()
  for (const c of cities) {
    const uf = ufOf(c.ref)
    if (!uf) continue
    const ref = scope === 'state' ? uf : REGION_OF_UF[uf]
    if (!ref) continue
    const cur = by.get(ref) ?? { ref, points: 0, activeUsers: 0, minutes: 0 }
    by.set(ref, { ref, points: cur.points + c.points, activeUsers: cur.activeUsers + c.activeUsers, minutes: cur.minutes + c.minutes })
  }
  return [...by.values()]
}
