/* ============================================================================
   The overlap rule, exercised.

   There is no test runner in this project, so this is a script:

       npx tsx src/studio/voiceOverlap.test.ts

   It is here because the rule it checks is a decision the POs made, not an
   implementation detail — "the first goes right, the second goes left, and in
   the closing they stay centred a second apart" is the kind of thing that gets
   quietly re-broken by the next person who thinks sliding a clip is simpler.
   ============================================================================ */

import { planVoiceOverlaps, VOICE_GAP, type OverlapTrack, type OverlapPhase } from './voiceOverlap'

let failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { console.log('  ok  ', name) } else { failures++; console.log('  FAIL', name, detail ?? '') }
}

const voice = (id: string, startSec: number, durationSec: number, pan = 0) =>
  ({ id, startSec, durationSec, params: { pan } })

const CLOSING: OverlapPhase = { fase: 6, startSec: 300, endSec: 360 }

/* 1 — two centred voices overlapping in the middle of a session: pan apart */
{
  const tracks: OverlapTrack[] = [
    { type: 'voice', channel: 'C', clips: [voice('a', 100, 12), voice('b', 108, 10)] },
  ]
  const p = planVoiceOverlaps(tracks, CLOSING)
  check('mid-session: first goes right', p.pans['a'] === 1, p.pans)
  check('mid-session: second goes left', p.pans['b'] === -1, p.pans)
  check('mid-session: nothing moves in time', Object.keys(p.starts).length === 0, p.starts)
  check('mid-session: counted once', p.panned === 1 && p.moved === 0, p)
}

/* 2 — one of them already on a side: left alone, that is the composition */
{
  const tracks: OverlapTrack[] = [
    { type: 'voice', channel: 'L', clips: [voice('a', 100, 12)] },
    { type: 'voice', channel: 'C', clips: [voice('b', 108, 10)] },
  ]
  const p = planVoiceOverlaps(tracks, CLOSING)
  check('dichotic: untouched', p.panned === 0 && p.moved === 0 && Object.keys(p.pans).length === 0, p)
}

/* 2b — a lane that is centred but whose CLIP was panned hard is also a side */
{
  const tracks: OverlapTrack[] = [
    { type: 'voice', channel: 'C', clips: [voice('a', 100, 12, 1)] },
    { type: 'voice', channel: 'C', clips: [voice('b', 108, 10)] },
  ]
  const p = planVoiceOverlaps(tracks, CLOSING)
  check('clip-level pan counts as a side', p.panned === 0, p)
}

/* 3 — the closing: centred, one second of air, and the music follows */
{
  const tracks: OverlapTrack[] = [
    { type: 'voice', channel: 'C', clips: [voice('a', 330, 20), voice('b', 340, 25)] },
    { type: 'sample', clips: [{ id: 'mus', startSec: 300, durationSec: 60, params: { drawPhase: 6 } }] },
    { type: 'sample', clips: [{ id: 'bed', startSec: 300, durationSec: 60, params: { drawTag: 'lago', loop: true } }] },
  ]
  const p = planVoiceOverlaps(tracks, CLOSING)
  check('closing: the second line moves to first end + 1s', p.starts['b'] === 350 + VOICE_GAP, p.starts)
  check('closing: nothing is panned', Object.keys(p.pans).length === 0, p.pans)
  check('closing: ends with the last voice', p.closingEnd === 351 + 25, p.closingEnd)
  check('closing: the music is stretched to it', p.stretched['mus'] === 376 - 300, p.stretched)
  check('closing: the soundscape is NOT stretched', p.stretched['bed'] === undefined, p.stretched)
}

/* 4 — three in the closing cascade, each a second after the one before */
{
  const tracks: OverlapTrack[] = [
    { type: 'voice', channel: 'C', clips: [voice('a', 310, 10), voice('b', 315, 10), voice('c', 318, 10)] },
  ]
  const p = planVoiceOverlaps(tracks, CLOSING)
  check('closing cascade: b after a', p.starts['b'] === 321, p.starts)
  check('closing cascade: c after b', p.starts['c'] === 332, p.starts)
  check('closing cascade: two moves', p.moved === 2, p)
}

/* 5 — an overlap that STARTS before the closing is not a closing overlap */
{
  const tracks: OverlapTrack[] = [
    { type: 'voice', channel: 'C', clips: [voice('a', 280, 40), voice('b', 295, 20)] },
  ]
  const p = planVoiceOverlaps(tracks, CLOSING)
  check('overlap before phase 6 is panned, not moved', p.panned === 1 && p.moved === 0, p)
}

/* 6 — no phase map at all: everything takes the pan rule */
{
  const tracks: OverlapTrack[] = [
    { type: 'voice', channel: 'C', clips: [voice('a', 310, 20), voice('b', 320, 18)] },
  ]
  const p = planVoiceOverlaps(tracks, null)
  check('no phase map: pans instead of moving', p.panned === 1 && p.moved === 0, p)
}

/* 7 — voices that do not overlap are left completely alone */
{
  const tracks: OverlapTrack[] = [
    { type: 'voice', channel: 'C', clips: [voice('a', 10, 5), voice('b', 20, 5), voice('c', 330, 5)] },
    { type: 'sample', clips: [{ id: 'mus', startSec: 300, durationSec: 60, params: { drawPhase: 6 } }] },
  ]
  const p = planVoiceOverlaps(tracks, CLOSING)
  check('no overlap: no plan', p.panned === 0 && p.moved === 0 && p.longer === 0, p)
  check('no overlap: the music is not stretched', p.stretched['mus'] === undefined, p.stretched)
}

/* 8 — three centred voices at once: the two that can be split are, the third
       is left in the middle rather than being given a side it cannot have */
{
  const tracks: OverlapTrack[] = [
    { type: 'voice', channel: 'C', clips: [voice('a', 100, 30), voice('b', 105, 25), voice('c', 110, 20)] },
  ]
  const p = planVoiceOverlaps(tracks, CLOSING)
  check('three at once: one pair split', p.panned === 1, p)
  check('three at once: terminates', p.moved === 0, p)
}

console.log(failures ? `\n${failures} FAILED` : '\nall good')
/* A non-zero exit code so this can be wired into CI one day. `process` is
   Node's; the file is never imported by the app, so the browser build has no
   idea it exists. */
if (failures) (globalThis as { process?: { exitCode?: number } }).process!.exitCode = 1
