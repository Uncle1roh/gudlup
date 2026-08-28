/* ============================================================================
   Opening the Sound Studio with something in it

   The bug: the hand-off was consumed by READING it, inside a `useMemo` — that
   is, during render. Any second render of the Studio got nothing and fell back
   to the demo bed, which is indistinguishable from "my work was not saved".

   The desktop gate unmounts the editor below 1024px and re-renders on every
   resize event, so this happened in production, not only under StrictMode.

       npx esbuild tools/test-handoff.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/h.mjs && node <tmp>/h.mjs
   ============================================================================ */

/* sessionStorage before the module under test loads — it reads it on demand. */
const mem = new Map<string, string>()
;(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as unknown as Storage

const { setStudioSeed, setStudioProject, peekStudioSeed, releaseStudioSeed } = await import('../src/compose/handoff')
import type { SeedTrack, StudioProject } from '../src/compose/types'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const TRACK: SeedTrack = {
  type: 'voice', name: 'Voce', volume: 0.7,
  clips: [{ startSec: 10, durationSec: 20, params: { pan: 0 } as never, text: 'ciao' }],
} as SeedTrack

/* ------------------------------------------------------ reading is free -- */
console.log('\n--- reading does not consume ---')

releaseStudioSeed()
setStudioSeed([TRACK], 'GL-ANX 1.1', { code: 'GL-ANX 1.1', duration: 12 }, undefined, { returnTo: '#admin' })

assert(peekStudioSeed()?.name === 'GL-ANX 1.1', 'the Studio finds what was set for it')

/* THE regression. Render, render again — the desktop gate does exactly this on
   every resize event, and StrictMode does it on every mount in development. */
assert(peekStudioSeed()?.name === 'GL-ANX 1.1', 'a second read gets the same thing, not null')
assert(peekStudioSeed()?.name === 'GL-ANX 1.1', 'and a third')
assert(peekStudioSeed()?.tracks.length === 1, 'with its tracks intact')
assert(peekStudioSeed()?.attach?.duration === 12, 'and the time signature it belongs to')
assert(peekStudioSeed()?.returnTo === '#admin', 'and where the back button goes')

/* ------------------------------------------------------- across a reload -- */
console.log('\n--- reloading the page inside the Studio ---')

/* A reload wipes every module variable. Only sessionStorage is left, which is
   why the seed is written there: coming back to the demo bed after an
   accidental refresh is the same loss by another route. */
/* Asserted on the stored bytes rather than on a re-imported module: a bundler
   may or may not hand back a fresh copy, and what actually matters is that the
   session is in storage for the next page life to find. */
const storedRaw = mem.get('gl.studio.handoff')
assert(!!storedRaw, 'the session is written to sessionStorage, not only to a module variable')
const storedSeed = JSON.parse(storedRaw as string)
assert(storedSeed.name === 'GL-ANX 1.1', 'a fresh page life finds the session')
assert(storedSeed.tracks[0].clips[0].text === 'ciao', 'down to the clip text')
assert(storedSeed.attach.duration === 12, 'and the time signature it belongs to')

/* ------------------------------------------------------------ releasing -- */
console.log('\n--- leaving on purpose ---')

releaseStudioSeed()
assert(peekStudioSeed() === null, 'the back button ends the session')
assert(mem.size === 0, 'and clears the stored copy too, so a later visit is not hijacked')

/* -------------------------------------------------------- newest wins ---- */
console.log('\n--- opening a different protocol ---')

setStudioSeed([TRACK], 'first')
setStudioSeed([TRACK], 'second')
assert(peekStudioSeed()?.name === 'second', 'the most recent hand-off is the one that opens')

const project: StudioProject = {
  name: 'saved session', lengthSec: 720, masterGain: 0.8,
  fadeInSec: 2, fadeOutSec: 3, tracks: [TRACK], savedAt: 1,
}
setStudioProject(project, { code: 'GL-ANX 1.2', duration: 24 }, '#admin')
const reopened = peekStudioSeed()
assert(reopened?.name === 'saved session', 'a saved project replaces a seed')
assert(reopened?.lengthSec === 720, 'carrying its length')
assert(reopened?.masterGain === 0.8, 'its master fader')
assert(reopened?.fadeInSec === 2 && reopened?.fadeOutSec === 3, 'and its session fades')
assert(reopened?.attach?.code === 'GL-ANX 1.2', 'attached to the right protocol')

/* --------------------------------------------------- a hostile storage --- */
console.log('\n--- when storage will not play along ---')

mem.set('gl.studio.handoff', '{ not json')
releaseStudioSeed()
mem.set('gl.studio.handoff', '{ not json')
assert(peekStudioSeed() === null, 'unreadable stored state is ignored rather than thrown')

mem.set('gl.studio.handoff', JSON.stringify({ name: 'x' }))
assert(peekStudioSeed() === null, 'and so is stored state with no tracks in it')

console.log(`\n${pass} assertions passed.`)
if (fails.length) {
  console.log(`${fails.length} FAILED:`)
  for (const f of fails) console.log('  -', f)
  process.exit(1)
}
