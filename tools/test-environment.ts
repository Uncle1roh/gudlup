/* ============================================================================
   Which environment am I, and is this area switched on?

   Two questions with the same failure mode: answering them wrong is silent.
   A staging deployment that thinks it is production shows no banner; a kill
   switch that fails closed takes the product down during the incident it was
   meant to contain. Both defaults are asserted here.

   Run: npx esbuild tools/test-environment.ts --bundle --platform=node \
          --format=cjs --define:import.meta.env={} --outfile=x.cjs && node x.cjs
   ============================================================================ */

import { ALL_ON, FEATURES, normalize } from '../src/app/features'
import { envLabel, envNote, NON_PRODUCTION, showsBanner, type AppEnv } from '../src/app/environment'

let pass = 0
const fails: string[] = []
function assert(ok: boolean, what: string) {
  if (ok) { pass++; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* --------------------------------------------------------- the banner --- */
console.log('--- who shows a banner ---')
assert(!showsBanner('production'), 'production shows nothing — a banner that is always there is never read')
for (const e of NON_PRODUCTION) {
  assert(showsBanner(e), `${e} shows one`)
}
assert(NON_PRODUCTION.length === 4, 'four non-production environments: staging, demo, local, unknown')

/* The first production deploy put a red "ENVIRONMENT NOT DECLARED" across
   the login page of the real app. A person signing in cannot set a build
   variable, so all it told them was that something was broken. The warning
   goes to the people who can end it. */
assert(showsBanner('unknown', 'team'), 'an undeclared deployment warns the console, the Studio and the workspaces')
assert(!showsBanner('unknown', 'public'), 'and says nothing on the app a person signs in to')
for (const e of ['staging', 'demo', 'local'] as AppEnv[]) {
  assert(showsBanner(e, 'public'), `${e} still shows everywhere — a demo to a prospect happens in the consumer app`)
}
assert(!showsBanner('production', 'team') && !showsBanner('production', 'public'), 'production shows nothing anywhere')
assert(showsBanner('unknown') === showsBanner('unknown', 'team'), 'the default surface is the one that gets told')

console.log('')
console.log('--- what it says ---')
const envs: AppEnv[] = ['production', 'staging', 'demo', 'local', 'unknown']
for (const e of envs) {
  assert(!!envLabel(e), `${e} has a label: ${envLabel(e)}`)
}
assert(envNote('production') === '', 'production has no note, because it has no banner')
for (const e of NON_PRODUCTION) {
  assert(envNote(e).length > 20, `${e} explains itself rather than just naming itself`)
}
assert(/not set/i.test(envNote('unknown')) && /VITE_APP_ENV/.test(envNote('unknown')),
  'an undeclared deployment names the variable to set — nobody fixes what they cannot see')
assert(/real/i.test(envNote('unknown')),
  'and says to treat the data as real until told otherwise, which is the safe reading')

/* --------------------------------------------------- the kill switches -- */
console.log('')
console.log('--- the switches default to ON ---')
assert(FEATURES.length === 3 && FEATURES.map((f) => f.id).join() === 'player,booking,video',
  'three areas: player, booking, video')
assert(Object.values(ALL_ON).every(Boolean), 'the baseline is everything on')

console.log('')
console.log('--- only a real false turns something off ---')
assert(Object.keys(normalize(null)).length === 0, 'null leaves every area alone')
assert(Object.keys(normalize(undefined)).length === 0, 'so does undefined')
assert(Object.keys(normalize('player')).length === 0, 'and a string — a half-written row is not a decision')
assert(Object.keys(normalize(42)).length === 0, 'and a number')
assert(normalize({ player: false }).player === false, 'an explicit false switches it off')
assert(normalize({ player: true }).player === true, 'an explicit true switches it on')
assert(normalize({ player: 'false' }).player === undefined,
  'the STRING "false" does not: a quoted boolean in the jsonb would otherwise take the player down')
assert(normalize({ player: 0 }).player === undefined, 'nor does 0')
assert(normalize({ player: null }).player === undefined, 'nor does null')
assert(normalize({ nonsense: false }).player === undefined, 'an unknown key is ignored, not applied to everything')

console.log('')
console.log('--- a row that only mentions one area ---')
const partial = { ...ALL_ON, ...normalize({ video: false }) }
assert(partial.video === false, 'the one named is off')
assert(partial.player === true && partial.booking === true, 'and the two not named stay on')

console.log('')
console.log('--- every area describes itself and what stops ---')
for (const f of FEATURES) {
  assert(f.what.length > 30, `${f.id} says what switching it off does, in a sentence`)
  assert(f.label.length > 0 && f.label[0] === f.label[0].toUpperCase(), `${f.id} has a readable label`)
}

console.log(`\n${pass} assertions passed.`)
if (fails.length) { console.log(`${fails.length} FAILED:`); for (const f of fails) console.log('  -', f); process.exit(1) }
