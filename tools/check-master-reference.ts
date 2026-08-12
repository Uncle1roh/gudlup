/* Run the REAL §9 mastering pass over a rendered WAV and report exactly what it
   does to it. Written to answer one question about GL-ANX 1.1: the POs chose the
   voice level by ear (−6 LUFS), so does putting the missing §9 stage back change
   the sound they approved, or only stop it clipping?

   Run: npx esbuild tools/check-master-reference.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/m.mjs && node <tmp>/m.mjs "<file.wav>"  */

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

import { readFileSync } from 'node:fs'
import { measureLufs, measureTruePeakDb, masterizeBuffer, SESSION_TARGET_LUFS, SESSION_CEILING_DBTP } from '../src/studio/mastering'

const file = process.argv[2]
if (!file) { console.error('usage: node m.mjs <file.wav>'); process.exit(1) }
const buf = readFileSync(file)

let pos = 12, channels = 0, sampleRate = 0, bits = 0, dataOff = 0, dataLen = 0
while (pos + 8 <= buf.length) {
  const id = buf.toString('ascii', pos, pos + 4)
  const size = buf.readUInt32LE(pos + 4)
  if (id === 'fmt ') { channels = buf.readUInt16LE(pos + 10); sampleRate = buf.readUInt32LE(pos + 12); bits = buf.readUInt16LE(pos + 22) }
  else if (id === 'data') { dataOff = pos + 8; dataLen = size }
  pos += 8 + size + (size & 1)
}
if (bits !== 16) { console.error(`only 16-bit handled here, got ${bits}`); process.exit(1) }
const frames = Math.floor(dataLen / ((bits / 8) * channels))

const ab = new FakeAB({ numberOfChannels: channels, length: frames, sampleRate })
for (let c = 0; c < channels; c++) {
  const d = ab.getChannelData(c)
  let o = dataOff + c * 2
  for (let i = 0; i < frames; i++, o += 2 * channels) d[i] = buf.readInt16LE(o) / 32768
}

const db = (v: number) => (v <= 0 ? -Infinity : 20 * Math.log10(v))
function stats(b: InstanceType<typeof FakeAB>) {
  let peak = 0, atFs = 0, runs = 0, longest = 0
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c)
    let run = 0
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i])
      if (v > peak) peak = v
      // what a 16-bit encode would pin to full scale
      if (v >= 32767 / 32768) { atFs++; run++; if (run > longest) longest = run; if (run === 2) runs++ } else run = 0
    }
  }
  return { peak, atFs, runs, longest }
}

const before = stats(ab)
const lufsBefore = measureLufs(ab as unknown as AudioBuffer)
const tpBefore = measureTruePeakDb(ab as unknown as AudioBuffer)

// keep a copy of the voice-band level so the balance can be compared after
function bandRms(b: InstanceType<typeof FakeAB>, from: number, to: number) {
  const s = Math.round(from * b.sampleRate), e = Math.min(b.length, Math.round(to * b.sampleRate))
  let acc = 0, n = 0
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c)
    for (let i = s; i < e; i++) { acc += d[i] * d[i]; n++ }
  }
  return db(Math.sqrt(acc / Math.max(1, n)))
}
const probes: [string, number, number][] = [
  ['08:12 "non devi fare nulla"', 8 * 60 + 12, 8 * 60 + 18],
  ['12:00 whisper LOOP block', 12 * 60, 12 * 60 + 20],
  ['14:27 flagged binaural window', 14 * 60 + 27, 14 * 60 + 46],
  ['23:52 hottest short-term', 23 * 60 + 50, 23 * 60 + 58],
]
const rmsBefore = probes.map(([, a, b2]) => bandRms(ab, a, b2))

const report = masterizeBuffer(ab as unknown as AudioBuffer)
const after = stats(ab)
const rmsAfter = probes.map(([, a, b2]) => bandRms(ab, a, b2))

console.log(`file            : ${file.split(/[\\/]/).pop()}`)
console.log(`format          : ${channels} ch · ${sampleRate} Hz · ${bits}-bit · ${(frames / sampleRate / 60).toFixed(2)} min`)
console.log('')
console.log('                       BEFORE          AFTER §9')
console.log(`integrated loudness   ${lufsBefore.toFixed(2)} LUFS     ${report.postLufs.toFixed(2)} LUFS      (target ${SESSION_TARGET_LUFS})`)
console.log(`true peak             ${tpBefore >= 0 ? '+' : ''}${tpBefore.toFixed(2)} dBTP      ${report.truePeakDb >= 0 ? '+' : ''}${report.truePeakDb.toFixed(2)} dBTP     (ceiling ${SESSION_CEILING_DBTP})`)
console.log(`sample peak           ${db(before.peak).toFixed(2)} dBFS      ${db(after.peak).toFixed(2)} dBFS`)
console.log(`samples at full scale ${before.atFs}           ${after.atFs}`)
console.log(`clipped runs (>=2)    ${before.runs}            ${after.runs}   (longest ${before.longest} → ${after.longest} samples)`)
console.log('')
console.log(`normalization gain    ${report.gainDb >= 0 ? '+' : ''}${report.gainDb.toFixed(2)} dB applied to the WHOLE mix (balance untouched)`)
console.log(`limiter               ${report.limiterDb < -0.01 ? `${report.limiterDb.toFixed(2)} dB at its deepest` : 'never engaged'}`)
console.log('')
/* Split each moment's change into the part that is the global normalization
   (which moves everything equally and preserves the balance the POs approved)
   and the part the LIMITER took off locally. A correct limiter shows ~0 dB of
   local reduction in quiet passages and takes its reduction only where the
   peaks are; a uniform reduction everywhere is the failure mode — it means the
   ceiling was paid for with a global trim. */
console.log('Per-moment change, split into normalization vs. local limiting:')
console.log('  moment                            before →  after     global   limiter')
const local: number[] = []
for (let i = 0; i < probes.length; i++) {
  const d = rmsAfter[i] - rmsBefore[i]
  const lim = d - report.gainDb
  local.push(lim)
  console.log(`  ${probes[i][0].padEnd(32)} ${rmsBefore[i].toFixed(2)} → ${rmsAfter[i].toFixed(2)}   ${report.gainDb >= 0 ? '+' : ''}${report.gainDb.toFixed(2)} dB   ${lim.toFixed(2)} dB`)
}
const quiet = local.slice(0, -1) // the last probe is the hottest moment
const worstQuiet = Math.min(...quiet)
const hottest = local[local.length - 1]
console.log('')
if (worstQuiet > -0.1 && hottest < worstQuiet - 0.05) {
  console.log(`→ correct: quiet passages untouched by the limiter (${worstQuiet.toFixed(2)} dB), reduction`)
  console.log(`  concentrated on the hottest moment (${hottest.toFixed(2)} dB). The approved balance survives;`)
  console.log('  only the peaks were capped.')
} else if (worstQuiet < -0.3) {
  console.log(`→ WARNING: the limiter is pulling down QUIET passages too (${worstQuiet.toFixed(2)} dB).`)
  console.log('  That is a global trim wearing a limiter costume — the ceiling is deciding the loudness.')
} else {
  console.log(`→ limiter reduction: quiet ${worstQuiet.toFixed(2)} dB, hottest ${hottest.toFixed(2)} dB.`)
}
const missed = Math.abs(report.postLufs - SESSION_TARGET_LUFS)
console.log(missed <= 0.5
  ? `→ landed on target: ${report.postLufs.toFixed(2)} LUFS vs ${SESSION_TARGET_LUFS} (${missed.toFixed(2)} LU off).`
  : `→ WARNING: ${missed.toFixed(2)} LU off the ${SESSION_TARGET_LUFS} LUFS target.`)
