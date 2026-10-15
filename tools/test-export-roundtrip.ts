/* ============================================================================
   The SQL export is only a backup if the Studio will open it

   supabase/export-studio-sessions.sql writes a JSON object by hand in SQL,
   and src/studio/sessionFile.ts decides whether to open it. Nothing connects
   those two files but a shared shape, so this is where that shape is pinned:
   the object the SQL builds, CSV-encoded the way the Supabase editor encodes
   it, split by tools/split-studio-csv.mjs, and handed to the real reader.

   Run: npx esbuild tools/test-export-roundtrip.ts --bundle --platform=node \
          --format=cjs --define:import.meta.env={} --outfile=x.cjs && node x.cjs
   ============================================================================ */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describeStudioBackup, parseStudioBackup } from '../src/studio/sessionFile'
import type { StudioProject } from '../src/compose/types'

let pass = 0
const fails: string[] = []
function assert(ok: boolean, what: string) {
  if (ok) { pass++; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* A session as the database holds it, with the things that must survive. */
const project: StudioProject = {
  name: 'GL-ANX 1.1 — Calma e sicurezza',
  lengthSec: 1440,
  masterGain: 0.82,
  fadeInSec: 2,
  fadeOutSec: 4,
  phases: [{ fase: 1, startSec: 0, endSec: 240 }],
  savedAt: 1_760_000_000_000,
  tracks: [
    {
      type: 'voice', name: 'Voce', volume: 0.9,
      clips: [{
        /* A quote, a comma and a newline in the text: the three things a CSV
           round trip gets wrong, and a voice line can contain all three. */
        startSec: 10, durationSec: 20, params: {} as never,
        text: 'Lei disse "respira, ora".' + String.fromCharCode(10) + 'E poi tacque.',
        gainDb: -3, eq: { lowGainDb: 1 } as never,
        ttsPath: 'tts/v/abc.mp3',
        textByLang: {
          it: 'Respira', 'it:f': 'Respira',
          'pt-BR': 'Respire', 'pt-BR:f': 'Respire',
        },
        ttsByLang: { it: 'tts/v/abc.mp3', 'pt-BR': 'tts/v/def.mp3' },
        voiceByLang: { it: { voiceId: 'v1' }, 'pt-BR': { voiceId: 'v2' } } as never,
      }],
    },
    { type: 'music', name: 'Musica', volume: 0.5, baseLufs: -18, clips: [{ startSec: 0, durationSec: 1440, params: {} as never }] },
  ],
}

/** Exactly what QUERY 2's `jsonb_build_object` produces, as text. */
function sqlRow(code: string, duration: number | null, p: StudioProject): string {
  return JSON.stringify({
    kind: 'goodloop.studio.session',
    version: 1,
    exportedAt: 1_760_500_000_000,
    code,
    duration,
    workingLang: 'it',
    workingTo: 'm',
    project: p,
  })
}

/** Exactly what QUERY 2's filename expression produces. */
function sqlFilename(code: string, duration: number | null): string {
  const folded = code.trim()
    .split('')
    .map((c) => ('\\/:*?"<>|'.includes(c) || /\s/.test(c) ? '-' : c))
    .join('')
    .replace(/-+/g, '-')
    .replace(/(^-)|(-$)/g, '')
  return `${folded}${duration != null ? `_${duration}min` : ''}_2026-10-15_14-30.glstudio.json`
}

/** CSV as the Supabase editor downloads it: quote every field, double the
    quotes inside, CRLF between rows. */
function csv(rows: string[][]): string {
  return rows.map((r) => r.map((f) => `"${f.replace(/"/g, '""')}"`).join(',')).join('\r\n') + '\r\n'
}

const dir = mkdtempSync(join(tmpdir(), 'glexport-'))
const csvPath = join(dir, 'sessions.csv')
const outDir = join(dir, 'studio-backups')

const wanted: [string, number | null][] = [
  ['GL-ANX 1.1', 6],
  ['GL-ANX 1.1', 24],
  ['GL-CALM 1.1', null],          // a legacy session with no usable length
  ['GL/ODD:1.0', 12],             // a code a filesystem refuses
]

writeFileSync(csvPath, csv([
  ['filename', 'glstudio_json'],
  ...wanted.map(([code, d]) => [sqlFilename(code, d), sqlRow(code, d, project)]),
]))

console.log('--- the splitter ---')
const out = execFileSync(process.execPath, ['tools/split-studio-csv.mjs', csvPath, outDir], { encoding: 'utf8' })
console.log(out.trim().split(String.fromCharCode(10)).map((l) => '    ' + l).join(String.fromCharCode(10)))

const files = readdirSync(outDir).sort()
assert(files.length === 4, `every row became a file (${files.length})`)
assert(files.every((f) => f.endsWith('.glstudio.json')), 'each one named the way Restore expects')
assert(files.some((f) => f.startsWith('GL-ANX-1.1_6min_')) && files.some((f) => f.startsWith('GL-ANX-1.1_24min_')),
  'two time signatures of one protocol land as two files, not one')
assert(files.some((f) => f.startsWith('GL-CALM-1.1_2026')), 'a session with no duration still gets a file')
assert(!files.some((f) => /[\\/:*?"<>|]/.test(f)), 'a code with a slash and a colon came out usable: ' + files.find((f) => f.startsWith('GL-ODD')))

console.log('')
console.log('--- the Studio reading what the SQL wrote ---')
for (const f of files) {
  const res = parseStudioBackup(readFileSync(join(outDir, f), 'utf8'))
  assert(res.ok, `Restore accepts ${f}`)
  if (!res.ok) continue
  const b = res.backup
  const clip = b.project.tracks[0].clips[0]
  assert(b.project.lengthSec === 1440 && b.project.masterGain === 0.82, `  levels survive in ${f}`)
  assert(b.project.phases?.length === 1 && b.project.fadeInSec === 2, '  phases and session fades survive')
  assert(b.project.savedAt === 1_760_000_000_000, '  the original save time is the one in the file, not the export time')
  assert(clip.eq?.lowGainDb === 1 && clip.ttsPath === 'tts/v/abc.mp3', '  per-clip EQ and the rendered voice survive')
  assert(
    clip.textByLang?.['it:f'] === 'Respira' && clip.textByLang?.['pt-BR:f'] === 'Respire'
    && !!clip.ttsByLang?.['pt-BR'] && !!clip.voiceByLang?.['pt-BR'],
    '  all four variants survive — the file is the only copy of the three not on screen',
  )
  assert(clip.text === 'Lei disse "respira, ora".' + String.fromCharCode(10) + 'E poi tacque.',
    '  a voice line with a quote, a comma and a newline comes back byte for byte')
  assert(b.project.tracks[1].baseLufs === -18, '  a lane authored in LUFS keeps its target')
  assert(describeStudioBackup(b).clips === 2, '  and the confirmation counts what is really there')
  break   // the four files differ only in their name and code
}

const odd = files.find((f) => f.startsWith('GL-ODD'))!
const oddBack = parseStudioBackup(readFileSync(join(outDir, odd), 'utf8'))
assert(oddBack.ok && oddBack.backup.code === 'GL/ODD:1.0',
  'the code inside the file is the real one, even where the filename had to be folded')
const calm = files.find((f) => f.startsWith('GL-CALM'))!
const calmBack = parseStudioBackup(readFileSync(join(outDir, calm), 'utf8'))
assert(calmBack.ok && calmBack.backup.duration === null, 'a null duration is read as "work it out from the clips"')

console.log('')
console.log('--- what the splitter refuses ---')
function split(rows: string[][]): { code: number; out: string } {
  const p = join(dir, 'bad.csv')
  writeFileSync(p, csv(rows))
  try {
    return { code: 0, out: execFileSync(process.execPath, ['tools/split-studio-csv.mjs', p, join(dir, 'bad-out')], { encoding: 'utf8' }) }
  } catch (e) {
    return { code: 1, out: String((e as { stdout?: string }).stdout ?? '') }
  }
}
const broken = split([['filename', 'glstudio_json'], ['a.glstudio.json', '{not json']])
assert(broken.code === 1 && /not valid JSON/.test(broken.out), 'a truncated download is reported, not written')
const notOurs = split([['filename', 'glstudio_json'], ['a.glstudio.json', '{"hello":"world"}']])
assert(notOurs.code === 1 && /not a Studio session/.test(notOurs.out), 'JSON that is not a session is reported')
const noTracks = split([['filename', 'glstudio_json'], ['a.glstudio.json', sqlRow('X', 6, { ...project, tracks: [] })]])
assert(noTracks.code === 1 && /no tracks/.test(noTracks.out), 'an empty session is caught here rather than at Restore')

console.log(`${String.fromCharCode(10)}${pass} assertions passed.`)
if (fails.length) { console.log(`${fails.length} FAILED:`); for (const f of fails) console.log('  -', f); process.exit(1) }
