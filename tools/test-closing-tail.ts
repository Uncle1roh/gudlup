/* ============================================================================
   A voice clip never ends the piece with the music

   WHY THIS EXISTS. The POs' report (2026-11-18): protocols end abruptly. Not
   sometimes — more often than not. The cause was in this rule's own closing
   step, and it was deliberate: when two voices in the sixth phase had to be
   pushed apart in time, the phase's music was stretched "to the last voice so
   the two fade out together". Together is the defect. The last word and the
   last bar landing on the same instant is a session that has spent twenty
   minutes letting someone down slowly and then shuts a door.

   THE RULE NOW. The closing's bed is stretched PAST the last voice, so there
   is air after the speaking stops: at least MUSIC_TAIL_MIN_SEC, and when it
   has to be stretched at all it is stretched to exactly MUSIC_TAIL_SEC. And
   it applies whether or not any voice moved — ending on a cut is the ordinary
   case, not a side effect of resolving an overlap.

   WHAT THIS GUARDS, in order of what would hurt:

   · THE TAIL EXISTS, and it exists with no overlap anywhere. That is the
     "or any other moment" half of the request, and the half the old code
     could not do: it returned early unless a voice had been moved.
   · A BED ALREADY LONG ENOUGH IS LEFT ALONE. Stretching something composed
     to outlast the voice by twenty seconds would be re-authoring it.
   · THE SESSION GROWS TO HOLD IT. A tail past the end of `lengthSec` would
     be cut off at exactly the moment this rule exists to protect — so the
     plan reports where the session must now reach, measured on the stretched
     bed, not on the last voice.
   · ONLY MUSIC, AND ONLY WHAT CLOSES THE PHASE. A soundscape is a texture
     placed to end where it ends; a bed that ends mid-phase was meant to.
   · THE EARLIER RULES ARE UNCHANGED. Two centred voices outside the closing
     still separate in the stereo field and nothing moves in time; voices
     already panned apart are still left alone; the closing still spaces by
     VOICE_GAP. A fix to the ending must not quietly re-time a protocol.
   ============================================================================ */

import {
  planVoiceOverlaps, VOICE_GAP, MUSIC_TAIL_SEC, MUSIC_TAIL_MIN_SEC,
  type OverlapTrack, type OverlapPhase,
} from '../src/studio/voiceOverlap'

let failed = 0
let checks = 0
function assert(cond: boolean, label: string): void {
  checks++
  if (cond) console.log(`ok  : ${label}`)
  else { failed++; console.log(`FAIL  ${label}`) }
}
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

/* A 24-minute session whose sixth phase is the last two minutes. */
const CLOSING: OverlapPhase = { fase: 6, startSec: 1320, endSec: 1440 }

let n = 0
const voice = (startSec: number, durationSec: number, pan = 0): OverlapTrack['clips'][number] =>
  ({ id: `v${++n}`, startSec, durationSec, params: { pan } })
const music = (startSec: number, durationSec: number): OverlapTrack['clips'][number] =>
  ({ id: `m${++n}`, startSec, durationSec, params: { drawPhase: 6 } })

const voiceLane = (clips: OverlapTrack['clips'], channel: 'L' | 'C' | 'R' = 'C'): OverlapTrack =>
  ({ type: 'voice', channel, clips })
const musicLane = (clips: OverlapTrack['clips']): OverlapTrack => ({ type: 'music', clips })

/* ---- the tail, with no overlap at all ----------------------------------- */

{
  /* One voice in the closing, ending at 1430. The bed ends at 1440 — ten
     seconds of air, which is already more than the floor. Left alone. */
  const p = planVoiceOverlaps([voiceLane([voice(1400, 30)]), musicLane([music(1320, 120)])], CLOSING)
  assert(p.longer === 0, 'a bed that already outlasts the last voice by more than the floor is untouched')
  assert(Object.keys(p.stretched).length === 0, 'and nothing is rewritten')
}

{
  /* The abrupt ending, and no overlap anywhere: the voice and the bed both
     end at 1440. This is the case the old rule could not see. */
  const m = music(1320, 120)
  const p = planVoiceOverlaps([voiceLane([voice(1410, 30)]), musicLane([m])], CLOSING)
  assert(p.moved === 0 && p.panned === 0, 'no voice had to move — nothing overlaps')
  assert(p.longer === 1, 'and the bed is still stretched, because the voice was ending the piece with it')
  assert(close(m.startSec + p.stretched[m.id], 1440 + MUSIC_TAIL_SEC),
    `the bed now ends ${MUSIC_TAIL_SEC}s after the last voice (${(m.startSec + p.stretched[m.id]).toFixed(1)}s)`)
  assert(close(p.sessionEnd, 1440 + MUSIC_TAIL_SEC),
    'and the session is reported long enough to contain it, measured on the BED')
  assert(p.sessionEnd > p.closingEnd, 'the session end is past the last voice, not level with it')
}

{
  /* Inside the floor but not level with it: the bed outlasts the voice by 2 s,
     which is a cut, not an ending. */
  const m = music(1320, 120)
  const p = planVoiceOverlaps([voiceLane([voice(1400, 38)]), musicLane([m])], CLOSING)
  assert(p.longer === 1, `${MUSIC_TAIL_MIN_SEC - 3}s of air is not an ending — still stretched`)
  assert(close(m.startSec + p.stretched[m.id], 1438 + MUSIC_TAIL_SEC), 'and stretched to the target, not to the floor')
}

{
  /* Exactly at the floor: allowed, left alone. The boundary is where a rule
     gets re-litigated later, so it is written down. */
  const p = planVoiceOverlaps(
    [voiceLane([voice(1400, 1440 - MUSIC_TAIL_MIN_SEC - 1400)]), musicLane([music(1320, 120)])],
    CLOSING,
  )
  assert(p.longer === 0, `exactly ${MUSIC_TAIL_MIN_SEC}s of air is enough — the floor is inclusive`)
}

/* ---- the tail, after the closing has pushed voices apart ---------------- */

{
  const a = voice(1400, 20)   // 1400 → 1420
  const b = voice(1410, 20)   // overlaps: pushed to 1420 + VOICE_GAP
  const m = music(1320, 120)  // ends 1440
  const p = planVoiceOverlaps([voiceLane([a, b]), musicLane([m])], CLOSING)
  assert(p.moved === 1, 'the second line is pushed, not panned: the closing stays centred')
  assert(close(p.starts[b.id], 1420 + VOICE_GAP), `pushed to ${VOICE_GAP}s after the first`)
  assert(close(p.closingEnd, 1420 + VOICE_GAP + 20), 'the closing now ends where the pushed voice ends')
  assert(p.longer === 1, 'and the bed, which used to end before that, is stretched')
  assert(close(m.startSec + p.stretched[m.id], p.closingEnd + MUSIC_TAIL_SEC),
    'to the pushed voice PLUS the tail — not level with it, which is what used to happen')
  assert(close(p.sessionEnd, p.closingEnd + MUSIC_TAIL_SEC), 'and the session reaches the bed, not the voice')
}

/* ---- what must not be stretched ---------------------------------------- */

{
  /* A soundscape is a texture, not a piece: `isMusicClip` keeps it out. */
  const sc = { id: 'sc1', startSec: 1320, durationSec: 120, params: { loop: true } }
  const p = planVoiceOverlaps([voiceLane([voice(1410, 30)]), { type: 'sample', clips: [sc] }], CLOSING)
  assert(p.longer === 0, 'a looping soundscape is never stretched — it was placed to end where it ends')
}

{
  /* A bed that ends in the MIDDLE of the closing was meant to. */
  const mid = music(1320, 40)   // ends 1360, far from the phase end
  const p = planVoiceOverlaps([voiceLane([voice(1410, 30)]), musicLane([mid])], CLOSING)
  assert(p.longer === 0, 'a bed that does not close the phase is left where it was')
}

{
  /* No voice in the closing at all: nothing to outlast, nothing to do. */
  const p = planVoiceOverlaps([voiceLane([voice(60, 20)]), musicLane([music(1320, 120)])], CLOSING)
  assert(p.longer === 0 && p.sessionEnd === 0, 'a closing with no voice in it is not an abrupt ending')
}

{
  /* No phase map: the rule has no closing to reason about. */
  const p = planVoiceOverlaps([voiceLane([voice(1410, 30)]), musicLane([music(1320, 120)])], null)
  assert(p.longer === 0, 'with no closing phase declared, nothing is stretched')
}

/* ---- the rules that were already there --------------------------------- */

{
  /* Two centred voices OUTSIDE the closing: apart in the field, not in time. */
  const a = voice(200, 30)
  const b = voice(210, 30)
  const p = planVoiceOverlaps([voiceLane([a, b])], CLOSING)
  /* `panned` counts PAIRS answered, not clips moved — which is also what the
     editor's note reports ("1 in the stereo field"). */
  assert(p.panned === 1 && p.moved === 0, 'outside the closing two centred voices separate in the stereo field')
  assert(p.pans[a.id] === 1 && p.pans[b.id] === -1, 'first one right, second one left')
  assert(Object.keys(p.starts).length === 0, 'and the timeline does not change')
}

{
  /* Already apart in the field: that overlap is the composition. */
  const p = planVoiceOverlaps(
    [voiceLane([voice(200, 30)], 'L'), voiceLane([voice(210, 30)], 'R')],
    CLOSING,
  )
  assert(p.panned === 0 && p.moved === 0, 'a dichotic pair is left exactly as composed')
}

{
  /* A third line pushed twice, and the bed following the FINAL position —
     placed late enough in the phase that the pushes carry the last voice past
     where the bed used to end, which is the real shape of the complaint. */
  const a = voice(1380, 20)
  const b = voice(1385, 20)
  const c = voice(1390, 20)
  const m = music(1320, 120)
  const p = planVoiceOverlaps([voiceLane([a, b, c]), musicLane([m])], CLOSING)
  assert(p.moved === 2, 'both later lines end up moved')
  const ends = [a, b, c].map((v) => (p.starts[v.id] ?? v.startSec) + v.durationSec)
  assert(close(p.closingEnd, Math.max(...ends)), 'the closing ends at the last of them')
  assert(close(m.startSec + p.stretched[m.id], Math.max(...ends) + MUSIC_TAIL_SEC),
    'and the bed outlasts that one by the tail')
}

/* ---- the plan stays pure (it runs inside a React state updater) -------- */

{
  const tracks = [voiceLane([voice(1410, 30)]), musicLane([music(1320, 120)])]
  const before = JSON.stringify(tracks)
  planVoiceOverlaps(tracks, CLOSING)
  planVoiceOverlaps(tracks, CLOSING)
  assert(JSON.stringify(tracks) === before, 'planning twice changes no clip — StrictMode calls the updater twice')
}

assert(MUSIC_TAIL_SEC >= 5 && MUSIC_TAIL_SEC <= 10, `the tail is inside the POs' 5-10s (${MUSIC_TAIL_SEC}s)`)
assert(MUSIC_TAIL_MIN_SEC <= MUSIC_TAIL_SEC, 'and the floor is not above the target')

console.log(`\n${checks} assertions, ${failed} failed`)
if (failed) process.exit(1)
