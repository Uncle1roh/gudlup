/* ============================================================================
   The fade-out belongs at the end of the MUSIC, not of the window

   A 24-minute protocol's music row is a window far longer than any one track.
   The drawn song must not loop, so it ends where it ends — and the Excel's
   `fade_out_s`, baked at the end of the CLIP, used to land on the silence
   after it. The music stopped dead; the POs heard "the 24-minute protocol
   ignores fade-out".

   `sampleCoveredSec` is the rule that fixes it: a clip renders to the length
   of the material it actually has, so the fade is baked onto the last seconds
   of music. Here it is, asserted, plus proof that `applyClipShape` ramps to
   silence at the end of whatever buffer it is handed.

       npx esbuild tools/test-music-fade.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/mf.mjs && node <tmp>/mf.mjs
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

import { applyClipShape, sampleCoveredSec } from '../src/studio/multitrack'
import { planSampleFadeOuts } from '../src/admin/plainStudio'
import type { PlainClip } from '../src/admin/plainTimeline'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const SR = 44100
const song = (sec: number) => ({ duration: sec })

/* ---------------------------------------------- how much material there is */
console.log('\n--- what a window can actually be filled with ---')

// the case the POs hit: 24 min of window, one 6-minute track
assert(sampleCoveredSec([song(360)], 1440, false) === 360, 'one song under a 24-minute window covers only its own 6 minutes')
assert(sampleCoveredSec([song(360)], 300, false) === 300, 'the same song under a 5-minute window covers the whole window')
assert(sampleCoveredSec([song(360), song(420)], 1440, false) === 1440, 'a playlist cycles, so it fills the window')
assert(sampleCoveredSec([song(90)], 1440, true) === 1440, 'a looping texture fills the window')
assert(sampleCoveredSec([], 1440, false) === 1440, 'no material at all leaves the window as it was (a silent clip)')

/* -------------------------------------------------- the fade lands on audio */
console.log('\n--- the fade is baked at the end of the buffer it is given ---')

function tone(seconds: number): InstanceType<typeof FakeAB> {
  const b = new FakeAB({ numberOfChannels: 2, length: Math.round(seconds * SR), sampleRate: SR })
  for (let ch = 0; ch < 2; ch++) b.getChannelData(ch).fill(0.5)
  return b
}
const at = (b: InstanceType<typeof FakeAB>, sec: number) => Math.abs(b.getChannelData(0)[Math.floor(sec * SR)])

// 6 minutes of music with the sheet's 8-second fade
const faded = applyClipShape(tone(360) as unknown as AudioBuffer, undefined, 0, 8) as unknown as InstanceType<typeof FakeAB>
assert(Math.abs(faded.duration - 360) < 0.01, 'the shaped buffer is as long as the music')
assert(at(faded, 300) > 0.49, 'the middle of the track is untouched')
assert(at(faded, 356) < 0.4 && at(faded, 356) > 0.05, 'four seconds from the end it is part way down')
assert(at(faded, 359.9) < 0.02, 'the last moments are effectively silent — the fade completed')

// the old behaviour, for contrast: the same fade over a 24-minute window
const windowed = applyClipShape(tone(1440) as unknown as AudioBuffer, undefined, 0, 8) as unknown as InstanceType<typeof FakeAB>
assert(at(windowed, 359.9) > 0.49, 'baked over the whole window instead, minute 6 is at full level — nothing fades where the music ends')

/* ------------------------------------- the fade-out every bed should have */
console.log('\n--- where a fade-out comes from ---')

const clip = (o: Partial<PlainClip> & { clipId: string; tipo: string; startS: number; endS: number }): PlainClip =>
  ({ traccia: o.traccia ?? 'MUS', fadeInS: 0, fadeOutS: 0, crossfadePrecS: null, ...o }) as unknown as PlainClip

// the bug the POs hit: six songs, six lanes, one clip each — nobody has a
// predecessor in their own lane, so nothing ever faded
const sixLanes = [0, 240, 480, 720, 960, 1200].map((start, i) =>
  clip({ clipId: `MU-00${i + 1}`, tipo: 'music', traccia: `MUS-${i + 1}`, startS: start, endS: start + 240 }))
const six = planSampleFadeOuts(sixLanes)
assert(six.byClip.size === 6, 'all six fade out even though each is alone on its lane')
assert(six.byClip.get('MU-001') === 3, 'a bed handing over fades for 3s when the sheet says nothing')
assert(six.byClip.get('MU-006') === 8, 'and the last music of the session closes over 8s')
assert(six.reasons.filter((r) => r.why === 'closing').length === 1, 'exactly one closing fade')

// the sheet always wins when it asks for more
const authored = planSampleFadeOuts([
  clip({ clipId: 'A', tipo: 'music', startS: 0, endS: 300, fadeOutS: 12 }),
  clip({ clipId: 'B', tipo: 'music', startS: 300, endS: 600, fadeOutS: 20 }),
])
assert(!authored.byClip.has('A'), '12s written in the sheet is not replaced by a 3s handover')
assert(!authored.byClip.has('B'), 'nor is a 20s closing fade')

// a crossfade on the incoming clip sets the length of the outgoing fade
const xf = planSampleFadeOuts([
  clip({ clipId: 'A', tipo: 'music', startS: 0, endS: 300 }),
  clip({ clipId: 'B', tipo: 'music', startS: 300, endS: 600, crossfadePrecS: 6 }),
])
assert(xf.byClip.get('A') === 6, "the outgoing clip fades over the incoming clip's crossfade")

// a gap is not a handover — silence between two beds is deliberate
const gapped = planSampleFadeOuts([
  clip({ clipId: 'A', tipo: 'music', startS: 0, endS: 100 }),
  clip({ clipId: 'B', tipo: 'music', startS: 400, endS: 600 }),
])
assert(gapped.byClip.get('A') === 8, 'a bed with silence after it closes rather than hands over')
assert(gapped.reasons.find((r) => r.clipId === 'A')?.why === 'closing', 'and it is reported as a closing')

// no fade may eat its own clip
const tiny = planSampleFadeOuts([clip({ clipId: 'T', tipo: 'music', startS: 0, endS: 9 })])
assert(tiny.byClip.get('T') === 3, 'a 9s clip closes over 3s, not 8')

// soundscapes hand over too, but the session's end is the music's job
const beds = planSampleFadeOuts([
  clip({ clipId: 'S1', tipo: 'soundscape', startS: 0, endS: 300 }),
  clip({ clipId: 'S2', tipo: 'soundscape', startS: 300, endS: 600 }),
])
assert(beds.byClip.get('S1') === 3, 'one soundscape handing over to the next fades out')
assert(!beds.byClip.has('S2'), 'the last soundscape is left alone — it is not the closing')

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); throw new Error('music fade tests failed') }
