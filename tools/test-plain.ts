/* Node proof: parse the real GL-ANX 1.1 Standard 12-min PLAIN workbook and
   assert the structural facts we know from the file. Run via esbuild bundle:
     node_modules/.bin/esbuild tools/test-plain.ts --bundle --platform=node \
       --external:xlsx --outfile=/tmp/test-plain.cjs && node /tmp/test-plain.cjs <file>
*/
import { readFileSync } from 'node:fs'
import { parsePlainTimeline, secToMmss } from '../src/admin/plainTimeline'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 }
  else console.log(`ok  : ${msg}`)
}

async function main() {
  const file = process.argv[2]
  const buf = readFileSync(file)
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const res = await parsePlainTimeline(bytes as ArrayBuffer)
  if (res.error || !res.timeline) { console.error('PARSE ERROR:', res.error); process.exit(1) }
  const t = res.timeline

  assert(t.code === 'GL-ANX 1.1', `code = ${t.code}`)
  assert(t.title?.includes('Calma'), `title = ${t.title}`)
  assert(t.versions.length === 1, `1 version sheet (got ${t.versions.length})`)

  const v = t.versions[0]
  assert(v.sheet === 'Standard' && v.versionKey === 'standard', `sheet ${v.sheet} → key ${v.versionKey}`)
  assert(v.clips.length === 71, `71 clips parsed (got ${v.clips.length})`)
  assert(v.declaredTotal === 71, `footer TOTALE CLIP = ${v.declaredTotal}`)
  assert(v.declaredDurationS === 720 && v.durationS === 720, `session 720 s (${secToMmss(v.durationS)})`)
  assert(v.phases.length === 6, `6 phases from README (got ${v.phases.length})`)
  assert(v.phases[3].startS === 330 && v.phases[3].endS === 570, `F4 = 5:30–9:30`)

  const byTipo = new Map<string, number>()
  for (const c of v.clips) byTipo.set(c.tipo, (byTipo.get(c.tipo) ?? 0) + 1)
  assert(byTipo.get('soundscape') === 7, `7 Soundscape (got ${byTipo.get('soundscape')})`)
  assert(byTipo.get('music') === 6, `6 Music (got ${byTipo.get('music')})`)
  assert(byTipo.get('binaural') === 2, `2 Binaural (got ${byTipo.get('binaural')})`)
  assert(byTipo.get('bilateral') === 1, `1 Bilateral (got ${byTipo.get('bilateral')})`)
  assert(byTipo.get('solfeggio') === 1, `1 Solfeggio (got ${byTipo.get('solfeggio')})`)
  assert(byTipo.get('voice') === 54, `54 Voice (got ${byTipo.get('voice')})`)
  assert(v.tracks.length === 11, `11 tracks (got ${v.tracks.length}: ${v.tracks.map((x) => x.name).join(', ')})`)

  // binaural beat derivation
  const bi = v.clips.find((c) => c.clipId === 'BI-001')!
  assert(bi.carrierLHz === 200 && bi.carrierRHz === 210 && bi.beatHz === 10, `BI-001 200/210 → beat 10 Hz`)

  // the loop clip resolves CSI-01..12 in ordine_loop order
  const loop = v.clips.find((c) => c.tipoContenuto === 'loop')!
  assert(loop.clipId === 'VC-019', `loop clip is VC-019 (got ${loop.clipId})`)
  assert(loop.setRange?.ids.length === 12, `set resolved to 12 IDs (got ${loop.setRange?.ids.length})`)
  assert(loop.setRange?.ids[0] === 'CSI-01' && loop.setRange?.ids[11] === 'CSI-12', `ordered CSI-01..CSI-12`)

  // affirmations incl. the 3 extra columns
  assert(t.affirmations.length === 12, `12 affirmations (got ${t.affirmations.length})`)
  const a1 = t.affirmations[0]
  assert(a1.id === 'CSI-01' && a1.inQuick && a1.inStandard && a1.inDeep, `CSI-01 in Quick·Std·Deep`)
  assert(a1.ordineLoop === 1 && a1.bilateraleLato === 'L' && !!a1.ecoKeyword, `extra columns kept (ordine=1, lato=L, eco_keyword)`)
  const a9 = t.affirmations.find((a) => a.id === 'CSI-09')!
  assert(!a9.inQuick && a9.inStandard && a9.inDeep, `CSI-09 = Std-Deep only`)

  // whispered paternal dichotic clip on the right
  const vr = v.clips.find((c) => c.traccia === 'VOX-R Paterna DX')!
  assert(vr.modalita === 'sussurrato' || v.clips.some((c) => c.traccia === 'VOX-R Paterna DX' && c.modalita === 'sussurrato'), `VOX-R has sussurrato clips`)

  // issue hygiene: no errors expected on this reference file
  const errors = t.issues.filter((i) => i.level === 'error')
  assert(errors.length === 0, `0 validation errors (got ${errors.length}${errors.length ? ': ' + errors.map((e) => e.message).join(' | ') : ''})`)
  const infoExtra = t.issues.find((i) => i.level === 'info' && /beyond the Rules doc/.test(i.message))
  assert(!!infoExtra, `info flag for the 3 extra Affermazioni columns present`)
  console.log(`\nIssues (${t.issues.length}):`)
  for (const i of t.issues) console.log(`  [${i.level}] ${i.sheet ?? '-'} ${i.clipId ?? ''} ${i.message}`)

  // negative probe: reject a non-PLAIN workbook shape
  const bogus = await parsePlainTimeline(new ArrayBuffer(8))
  assert(!!bogus.error, `garbage bytes rejected (${bogus.error?.slice(0, 40)}…)`)

  if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
  console.log('\nALL PASS')
}

void main()
