/* ============================================================================
   The backup takes every session, puts each in its own file, and the
   verifier agrees with the backup

   This runs the real pipeline with the database replaced by a handful of
   rows: sessionsFromRows -> files on disk -> verify-studio-backup. Nothing
   is mocked between those steps, so a disagreement between what the backup
   writes and what the verifier expects fails here rather than on the day it
   matters.

   Run: npx esbuild tools/test-backup-studio.ts --bundle --platform=node \
          --format=cjs --define:import.meta.env={} --outfile=x.cjs && node x.cjs
   ============================================================================ */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { manifestFor, sessionsFromRows, type ProtocolRow } from './studioBackupSet'
import { parseStudioBackup } from '../src/studio/sessionFile'
import type { StudioProject } from '../src/compose/types'

let pass = 0
const fails: string[] = []
function assert(ok: boolean, what: string) {
  if (ok) { pass++; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

function session(name: string, lengthSec: number, opts: { voices?: number; partial?: boolean } = {}): StudioProject {
  const voices = opts.voices ?? 2
  return {
    name, lengthSec, masterGain: 0.8, fadeInSec: 2, fadeOutSec: 3,
    phases: [{ fase: 1, startSec: 0, endSec: Math.round(lengthSec / 4) }],
    savedAt: 1_760_000_000_000,
    tracks: [
      {
        type: 'voice', name: 'Voce', volume: 0.9,
        clips: Array.from({ length: voices }, (_, i) => ({
          startSec: i * 30, durationSec: 20, params: {} as never,
          text: `Riga ${i}`, ttsPath: `tts/${name}-${i}.mp3`,
          eq: { lowGainDb: 1 } as never,
          textByLang: opts.partial && i === 0
            ? { it: `Riga ${i}`, 'it:f': `Riga ${i}` }            // three variants missing one
            : { it: `Riga ${i}`, 'it:f': `Riga ${i}`, 'pt-BR': `Linha ${i}`, 'pt-BR:f': `Linha ${i}` },
          ttsByLang: { it: `tts/${name}-${i}.mp3` },
          voiceByLang: { it: { voiceId: 'v1' } } as never,
        })),
      },
      { type: 'music', name: 'Musica', volume: 0.5, baseLufs: -18, clips: [{ startSec: 0, durationSec: lengthSec, params: {} as never }] },
    ],
  }
}

const rows: ProtocolRow[] = [
  /* three time signatures, three sessions */
  { code: 'GL-ANX 1.1', studio_by_duration: { 6: session('sei', 360), 12: session('dodici', 720), 24: session('ventiquattro', 1440) } },
  /* only one duration authored */
  { code: 'GL-ENER 3.3', studio_by_duration: { 12: session('solo-dodici', 720) } },
  /* a row from before the split: one session, no duration of its own */
  { code: 'GL-CALM 1.1', studio: session('legacy', 1440) },
  /* a protocol with nothing saved in the Studio at all */
  { code: 'GL-SLEEP 2.0', studio: null, studio_by_duration: null },
  /* an empty session: present in the column, nothing in it */
  { code: 'GL-EMPTY 0.1', studio_by_duration: { 6: { ...session('vuoto', 360), tracks: [] } } },
  /* a voice clip that never got its Portuguese */
  { code: 'GL-PART 4.0', studio_by_duration: { 6: session('parziale', 360, { partial: true }) } },
]

const now = 1_760_500_000_000
const entries = sessionsFromRows(rows, now)

console.log('--- which rows become which files ---')
assert(entries.length === 6, `six sessions out of six protocols, not one per protocol (${entries.length})`)
assert(entries.filter((e) => e.code === 'GL-ANX 1.1').length === 3, 'a protocol with three time signatures gives three files')
assert(entries.filter((e) => e.code === 'GL-ENER 3.3').length === 1, 'a protocol with one gives one')
assert(!entries.some((e) => e.code === 'GL-SLEEP 2.0'), 'a protocol with no Studio work gives none')
assert(!entries.some((e) => e.code === 'GL-EMPTY 0.1'), 'an empty session is skipped, not written as a file Restore would refuse')

const legacy = entries.filter((e) => e.code === 'GL-CALM 1.1')
assert(legacy.length === 1, 'a pre-split session is taken once, not once per duration')
assert(legacy[0]?.duration === 24, 'and it lands on the time signature its LENGTH matches (24)')

const names = entries.map((e) => e.file)
assert(new Set(names).size === names.length, 'every file has a different name — nothing overwrites anything')
assert(names.every((n) => n.endsWith('.glstudio.json')), 'all named the way Restore expects')
assert(names.some((n) => n.startsWith('GL-ANX-1.1_6min_')) && names.some((n) => n.startsWith('GL-ANX-1.1_24min_')),
  'the code and the time signature are in the name, so a human can find one')

console.log('')
console.log('--- what is inside one ---')
const one = entries.find((e) => e.code === 'GL-ANX 1.1' && e.duration === 24)!
const back = parseStudioBackup(JSON.stringify(one.backup))
assert(back.ok, 'the file the backup writes is one Restore accepts')
if (back.ok) {
  const b = back.backup
  assert(b.code === 'GL-ANX 1.1' && b.duration === 24, 'it knows which protocol and which time signature it is')
  assert(b.project.name === 'ventiquattro', 'and it is the RIGHT session of the three, not the first one found')
  assert(b.project.savedAt === 1_760_000_000_000, 'the save time is the session, not the export')
  assert(b.project.phases?.length === 1 && b.project.fadeInSec === 2, 'phases and session fades are in it')
  const clip = b.project.tracks[0].clips[0]
  assert(clip.eq?.lowGainDb === 1 && clip.ttsPath === 'tts/ventiquattro-0.mp3', 'per-clip EQ and the rendered voice are in it')
  assert(clip.textByLang?.['pt-BR:f'] === 'Linha 0', 'and all four variants')
}

console.log('')
console.log('--- the manifest ---')
const m = manifestFor(entries, { now, database: 'test-db', protocols: rows.length })
assert(m.sessions === 6 && m.protocols === 6, 'it counts sessions and protocols separately')
assert(m.files.length === 6 && m.files.every((f) => f.clips > 0), 'every file is listed, with its clip count')
assert(m.files.map((f) => f.file).join() === [...names].sort().join(), 'in the same order the files are on disk')

console.log('')
console.log('--- the verifier, on the folder the backup produced ---')
const dir = mkdtempSync(join(tmpdir(), 'glbk-'))
for (const e of entries) writeFileSync(join(dir, e.file), JSON.stringify(e.backup))
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n')

function verify(folder: string): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync(process.execPath, [VERIFY, folder], { encoding: 'utf8' }) }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, out: String(err.stdout ?? '') + String(err.stderr ?? '') }
  }
}
const VERIFY = process.env.GL_VERIFY_BUNDLE ?? 'node_modules/.cache/gl/verify.cjs'

const good = verify(dir)
assert(good.code === 0, 'a folder the backup wrote passes verification')
assert(/All 6 files are restorable/.test(good.out), 'and it says so plainly')
assert(/not filled in all four variants/.test(good.out),
  'a voice clip missing its Portuguese is reported as something to be aware of, not as a failure')

console.log('')
console.log('--- the verifier catching a broken folder ---')
const broken = mkdtempSync(join(tmpdir(), 'glbk-bad-'))
for (const e of entries) writeFileSync(join(broken, e.file), JSON.stringify(e.backup))
writeFileSync(join(broken, 'manifest.json'), JSON.stringify(m, null, 2) + '\n')
rmSync(join(broken, entries[0].file))                       // a file that went missing
const missing = verify(broken)
assert(missing.code === 1 && /is in manifest.json but not in the folder/.test(missing.out),
  'a file that disappeared from the folder is caught by the manifest')

const truncated = mkdtempSync(join(tmpdir(), 'glbk-trunc-'))
writeFileSync(join(truncated, entries[0].file), JSON.stringify(entries[0].backup).slice(0, 200))
const cut = verify(truncated)
assert(cut.code === 1 && /Restore would refuse this file/.test(cut.out),
  'a half-written file is caught here rather than at Restore')

const tampered = mkdtempSync(join(tmpdir(), 'glbk-tamper-'))
writeFileSync(join(tampered, entries[0].file), JSON.stringify(entries[0].backup))
writeFileSync(join(tampered, 'manifest.json'), JSON.stringify(
  { ...m, files: [{ ...m.files.find((f) => f.file === entries[0].file)!, clips: 999 }] }, null, 2))
const wrongCount = verify(tampered)
assert(wrongCount.code === 1 && /manifest says 999 clips/.test(wrongCount.out),
  'a file whose contents no longer match the manifest is caught')

console.log('')
console.log('--- an empty folder ---')
const empty = mkdtempSync(join(tmpdir(), 'glbk-empty-'))
const none = verify(empty)
assert(none.code === 1 && /holds no .glstudio.json files/.test(none.out), 'an empty folder is a failure, not a pass')

for (const d of [dir, broken, truncated, tampered, empty]) rmSync(d, { recursive: true, force: true })

console.log(`\n${pass} assertions passed.`)
if (fails.length) { console.log(`${fails.length} FAILED:`); for (const f of fails) console.log('  -', f); process.exit(1) }
