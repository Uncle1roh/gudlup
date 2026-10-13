/* ============================================================================
   Free and reduced-cost offers

   The commercial flag on a self-service entry: free, or a token price, with
   an optional window. The window is the part worth testing — a promotion
   nobody remembers to switch off is a price change, and the dates are the
   only thing that stops that.

       npx esbuild tools/test-offers.ts --bundle --platform=node \
         --format=cjs --define:import.meta.env={} --outfile=<tmp>/of.cjs \
         && node <tmp>/of.cjs
   ============================================================================ */

import { formatOffer, offerActive, OFFER_DEFAULT_CURRENCY, OFFER_DEFAULT_MINOR, type ProtocolOffer } from '../src/data/catalog'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 13, 12, 0, 0)
const of = (o: ProtocolOffer) => ({ offer: o })

/* ------------------------------------------------------------- the window */
console.log('\n--- when an offer is in force ---')

assert(!offerActive(undefined, NOW), 'no protocol, no offer')
assert(!offerActive({}, NOW), 'a protocol with no offer has none')

assert(!!offerActive(of({ kind: 'free' }), NOW), 'an open-ended offer is always on')
assert(
  !!offerActive(of({ kind: 'free', from: NOW - DAY, until: NOW + DAY }), NOW),
  'inside both ends it is on',
)
assert(
  !offerActive(of({ kind: 'free', from: NOW + DAY }), NOW),
  'before it starts it is off',
)
assert(
  !offerActive(of({ kind: 'free', until: NOW - DAY }), NOW),
  'after it ends it is off — the point of having an end',
)
assert(
  !!offerActive(of({ kind: 'reduced', priceMinor: 10, from: NOW - DAY }), NOW),
  'a start with no end runs on',
)
assert(
  !!offerActive(of({ kind: 'reduced', priceMinor: 10, until: NOW + DAY }), NOW),
  'an end with no start is already running',
)
/* Boundaries are inclusive: an offer that runs "from the 13th" is on at the
   first instant of the 13th, not from the 14th. */
assert(!!offerActive(of({ kind: 'free', from: NOW }), NOW), 'the first instant counts')
assert(!!offerActive(of({ kind: 'free', until: NOW }), NOW), 'so does the last')

/* -------------------------------------------------------------- the badge */
console.log('\n--- what the badge says ---')

assert(formatOffer({ kind: 'free' }, 'it', 'Gratis') === 'Gratis', 'free says free, in the reader’s word')

const it = formatOffer({ kind: 'reduced', priceMinor: 10, currency: 'EUR' }, 'it', 'Gratis')
assert(/0[.,]10/.test(it) && /€/.test(it), `ten cents in Italian reads as a currency (${it})`)

const br = formatOffer({ kind: 'reduced', priceMinor: 50, currency: 'BRL' }, 'pt-BR', 'Grátis')
assert(/0[.,]50/.test(br) && /R\$/.test(br), `and in Brazil it is reais (${br})`)

assert(
  formatOffer({ kind: 'reduced' }, 'it', 'Gratis') === formatOffer({ kind: 'reduced', priceMinor: OFFER_DEFAULT_MINOR, currency: OFFER_DEFAULT_CURRENCY }, 'it', 'Gratis'),
  'an offer saved with no amount falls back to the ten-cent reference',
)

/* A bad currency code must not take the card down with it. */
const junk = formatOffer({ kind: 'reduced', priceMinor: 10, currency: 'XX' }, 'it', 'Gratis')
assert(junk.includes('0.10') || junk.includes('0,10'), `an unknown currency still prints the number (${junk})`)

console.log(`\n${pass} assertions passed.`)
if (fails.length) {
  console.log(`${fails.length} FAILED:`)
  for (const f of fails) console.log('  -', f)
  process.exit(1)
}
