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

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); throw new Error('music fade tests failed') }
