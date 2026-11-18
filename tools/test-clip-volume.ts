/* ============================================================================
   One clip louder than its neighbours, without a second track

   WHY THIS EXISTS. On a voice track the POs found that one or two lines out of
   twenty need a nudge — a name spoken too softly, a closing sentence that sits
   under the bed. The alternative they were reaching for was a whole new track
   for those two clips, which splits the layer in two and leaves the mix with
   a level that no longer belongs to one place.

   The Studio's `Volume clip` slider is that nudge. What makes it usable is not
   the slider, it is the ORDER it lands in — and order is the thing a later
   refactor silently breaks:

     EQ  →  LUFS calibration (the Excel's level)  →  clip trim  →  fades

   The protocol's `volume_lufs` normalizes the clip to an ABSOLUTE target. If
   the trim were applied BEFORE that, calibration would measure the trimmed
   clip and scale it straight back to the target — the slider would move, the
   waveform would not, and nobody would be able to say why. If it were applied
   to the track fader instead, every clip on the layer would move together.

   So this file pins three properties, by measurement:

     · the trim is an OFFSET on the authored level, and survives calibration
     · it belongs to ONE clip — two clips from the same source, same protocol
       level, different trims, differ by exactly the difference
     · it is NOT cumulative. The editor re-shapes from the untouched source
       buffer on every slider move (`ttsSource` for a voice, a fresh offline
       render for a bed), so dragging is reversible rather than compounding.

   WHAT IT DOES NOT CLAIM. Nothing here is about a cut (frozen) piece: that
   audio is authoritative and is deliberately never re-rendered, which is why
   the inspector hides the slider for one.
   ============================================================================ */

class FakeAB {
  numberOfChannels: number; length: number; sampleRate: number; private ch: Float32Array[]
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels; this.length = opts.length; this.sampleRate = opts.sampleRate
    this.ch = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length))
  }
  get duration() { return this.length / this.sampleRate }
  getChannelData(i: number) { return this.ch[i] }
}
;(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = FakeAB

import { shapeClipBuffer, applyClipShape, clipFadeOutSec, ANCHOR_LUFS, defaultClipEq } from '../src/studio/multitrack'
import { measureLufs } from '../src/studio/mastering'

let failed = 0
let checks = 0
function assert(cond: boolean, label: string): void {
  checks++
  if (cond) console.log(`ok  : ${label}`)
  else { failed++; console.log(`FAIL  ${label}`) }
}
const close = (a: number, b: number, eps = 0.3) => Math.abs(a - b) <= eps

const SR = 44100
/* A stand-in for a spoken line: a steady tone is enough, because every
   assertion here is about a RATIO, and the calibration is what removes the
   source level from the question in the first place. */
function voiceLike(amp = 0.1, seconds = 8): FakeAB {
  const b = new FakeAB({ numberOfChannels: 2, length: Math.round(seconds * SR), sampleRate: SR })
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin((2 * Math.PI * 997 * i) / SR)
  }
  return b
}
/** The editor never re-shapes a buffer it has already shaped — it goes back to
    `ttsSource`. This is that source, handed out fresh each time. */
const freshSource = (amp?: number) => voiceLike(amp) as unknown as AudioBuffer

/* The protocol level for this clip, from the sheet: 3 LU under the voice
   anchor. Every case below starts from exactly this. */
const SHEET_DB = -3
const shaped = (gainDb?: number, amp?: number) =>
  measureLufs(shapeClipBuffer(freshSource(amp), { calibrateDb: SHEET_DB, gainDb, trackType: 'voice' }))

/* ---- the authored level, untouched ------------------------------------- */

const atSheet = shaped(undefined)
assert(close(atSheet, ANCHOR_LUFS + SHEET_DB),
  `with the slider at rest the clip sits where the Excel put it (${atSheet.toFixed(2)} vs ${(ANCHOR_LUFS + SHEET_DB).toFixed(2)} LUFS)`)
assert(close(shaped(0), atSheet, 0.01), '0 dB on the slider is exactly the track level — not a near miss')

/* ---- the trim is an offset ON that level, applied after calibration ---- */

for (const trim of [-12, -6, -1.5, 1.5, 4, 9]) {
  const got = shaped(trim)
  assert(close(got, ANCHOR_LUFS + SHEET_DB + trim),
    `${trim > 0 ? '+' : ''}${trim} dB on the clip lands ${trim > 0 ? '+' : ''}${trim} LU from the authored level (${got.toFixed(2)} LUFS)`)
}

/* The one that catches a reordering of `shapeClipBuffer`: if calibration ran
   last it would scale the trimmed clip straight back to the sheet's target,
   and this difference would collapse to zero. */
assert(Math.abs(shaped(-9) - atSheet) > 8,
  'calibration does not run after the trim — a −9 dB clip is audibly below the layer, not pulled back onto it')

/* ---- it belongs to one clip ------------------------------------------- */

const quiet = shaped(-6)
const loud = shaped(4)
assert(close(loud - quiet, 10),
  `two clips on the same track, same sheet level, differ by exactly their trims (${(loud - quiet).toFixed(2)} LU apart)`)
assert(close(shaped(-6, 0.02), shaped(-6, 0.6)),
  'and the trim means the same thing whatever the TTS take came back at — calibration removes the source level first')

/* ---- dragging is reversible, not cumulative --------------------------- */

const once = shaped(-6)
const again = shaped(-6)
assert(close(once, again, 0.01), 'shaping the source twice with the same trim gives the same level (no stacking)')
assert(close(shaped(0), atSheet, 0.01), 'and dragging back to 0 returns the clip to the authored level')

/* ---- the trim does not drag the rest of the clip's shape along -------- */

assert(clipFadeOutSec('voice', 0, 8) === 0,
  'a voice clip still gets no three-second bed tail — the trim changes level, nothing else')
assert(clipFadeOutSec('sample', 0, 8) === 3,
  'and a bed still gets one, with or without a trim')

{
  /* A bed is trimmed by the same slider, through the same call — so this is
     the plain arithmetic, with no calibration in the way. */
  const flat = new FakeAB({ numberOfChannels: 2, length: SR, sampleRate: SR })
  for (let ch = 0; ch < 2; ch++) flat.getChannelData(ch).fill(0.5)
  const out = applyClipShape(flat as unknown as AudioBuffer, -6) as unknown as FakeAB
  assert(Math.abs(out.getChannelData(0)[SR / 2] - 0.5 * Math.pow(10, -6 / 20)) < 1e-4,
    'on a bed the trim is one uniform gain over the whole buffer')
  assert(out !== (flat as unknown as AudioBuffer), 'and it leaves the source buffer alone (the editor re-shapes from it)')
}

/* ---- EQ first, so shaping the voice never moves it off its level ------- */

{
  const eq = defaultClipEq()
  eq.bands[2] = { type: 'peaking', enabled: true, freqHz: 997, gainDb: 10, q: 1.2 }
  const got = measureLufs(shapeClipBuffer(freshSource(), { eq, calibrateDb: SHEET_DB, gainDb: -6, trackType: 'voice' }))
  assert(close(got, ANCHOR_LUFS + SHEET_DB - 6, 0.6),
    `a +10 dB bell on the voice does not change where the clip sits: the trim is still the only offset (${got.toFixed(2)} LUFS)`)
}

console.log(`\n${checks} assertions, ${failed} failed`)
if (failed) process.exit(1)
