/* The three-second tail every bed ends with (POs, 2026-11-02).

   `clipFadeOutSec` is a floor, not a default, and it is the one place the
   rule lives — the Studio's buffer pipeline and the offline PLAIN renderer
   both reach it through `shapeClipBuffer`, so what the admin auditions and
   what the WAV holds cannot drift apart.

   Run: npm test -- clip-fade                                             */

import { clipFadeOutSec, STUDIO_FADE_OUT_SEC } from '../src/studio/multitrack'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

assert(STUDIO_FADE_OUT_SEC === 3, 'the tail is three seconds')

/* ---- a bed gets the tail, whatever the sheet said ---------------------- */
assert(clipFadeOutSec('soundscape', undefined, 120) === 3, 'soundscape, no fade in the sheet → 3s')
assert(clipFadeOutSec('music', 0, 240) === 3, 'music, an explicit 0 → 3s (the import cannot tell 0 from unset)')
assert(clipFadeOutSec('binaural', 1, 600) === 3, 'binaural asking for 1s → 3s: it is a floor')
assert(clipFadeOutSec('sample', 8, 600) === 8, '…and a sheet asking for 8s keeps its 8s')
assert(clipFadeOutSec('breath', 2.5, 300) === 3, 'breathing, 2.5s → 3s')
assert(clipFadeOutSec('bilateral', undefined, 90) === 3, 'bilateral → 3s')

/* ---- never more than half the audio there is --------------------------- */
assert(clipFadeOutSec('music', undefined, 4) === 2, 'a four-second clip fades over two, not three')
assert(clipFadeOutSec('music', undefined, 1) === 0.5, 'a one-second stab fades over half a second')
assert(clipFadeOutSec('music', 5, 4) === 5, 'an explicit fade longer than the clip is left alone: that is the sheet’s business')

/* ---- never on a voice clip --------------------------------------------- */
assert(clipFadeOutSec('voice', undefined, 12) === 0, 'a spoken line is NOT faded: three seconds of it would be three seconds of the sentence going quiet')
assert(clipFadeOutSec('voice', 0.4, 12) === 0.4, '…and a voice clip keeps whatever fade it was given')

/* ---- an unknown caller changes nothing --------------------------------- */
assert(clipFadeOutSec(undefined, undefined, 120) === 0, 'no track type → no floor, so nothing else that shapes a buffer is touched')
assert(clipFadeOutSec(undefined, 2, 120) === 2, '…and its own fade survives')

/* ---- nothing is ever negative ------------------------------------------ */
assert(clipFadeOutSec('music', -5, 120) === 3, 'a negative fade in the sheet is read as none')
assert(clipFadeOutSec('voice', -5, 12) === 0, 'and on a voice clip it is zero, never less')

console.log(process.exitCode ? '\nFAILED' : '\ndone.')
