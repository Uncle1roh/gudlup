/* ============================================================================
   Good Loop — is this folder of backups actually usable?

     npm run verify:studio                 (checks ./studio-backups)
     npm run verify:studio -- some/folder

   A backup nobody has opened is a belief, not a backup. This opens every
   file with the SAME reader the Studio ⬆ Restore button uses, so a file that
   passes here is a file that will restore.

   It checks, per file:
     · it parses, and Restore accepts it
     · it has tracks and clips
     · every voice clip that has text still has it in all four variants
     · the code and time signature are known, so Save afterwards goes to the
       right row

   And across the folder:
     · every file named in manifest.json is present, and vice versa
     · every count in the manifest matches the file it describes

   Exit code 0 means every file is restorable. Anything else, read the list.
   ============================================================================ */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describeStudioBackup, parseStudioBackup, STUDIO_FILE_EXT } from '../src/studio/sessionFile'
import type { Manifest } from './studioBackupSet'

const dir = process.argv[2] ?? 'studio-backups'

if (!existsSync(dir)) {
  console.error(`${dir}/ does not exist. Run "npm run backup:studio" first.`)
  process.exit(1)
}

const files = readdirSync(dir).filter((f) => f.endsWith(STUDIO_FILE_EXT)).sort()
if (!files.length) {
  console.error(`${dir}/ holds no ${STUDIO_FILE_EXT} files.`)
  process.exit(1)
}

const problems: string[] = []
const warnings: string[] = []
let clipsTotal = 0
let voiceTotal = 0

interface Seen { tracks: number; clips: number; voiceClips: number; code: string | null; duration: number | null }
const seen = new Map<string, Seen>()

console.log(`Checking ${files.length} files in ${dir}/\n`)

for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8')
  const res = parseStudioBackup(text)
  if (!res.ok) {
    problems.push(`${f}: Restore would refuse this file (${res.reason})`)
    continue
  }
  const b = res.backup
  const d = describeStudioBackup(b)

  if (!b.code) warnings.push(`${f}: no protocol code in it — restoring will ask which protocol it belongs to`)
  if (b.duration == null) warnings.push(`${f}: no time signature in it — the Studio will guess from the length`)

  /* The four variants are the thing most worth checking, because only one of
     them is ever on screen: a backup that lost the other three looks perfect
     until somebody opens the Portuguese version a month from now. */
  let voiceWithText = 0
  let fullyVariant = 0
  for (const t of b.project.tracks) {
    if (t.type !== 'voice') continue
    for (const c of t.clips ?? []) {
      const byLang = c.textByLang
      const anyText = c.text || c.ttsText || (byLang && Object.values(byLang).some(Boolean))
      if (!anyText) continue
      voiceWithText++
      const four = ['it', 'it:f', 'pt-BR', 'pt-BR:f']
      if (byLang && four.every((k) => typeof byLang[k] === 'string' && byLang[k]!.trim())) fullyVariant++
    }
  }
  if (voiceWithText && fullyVariant < voiceWithText) {
    warnings.push(`${f}: ${voiceWithText - fullyVariant} of ${voiceWithText} voice clips are not filled in all four variants`)
  }

  const tracks = b.project.tracks.length
  seen.set(f, { tracks, clips: d.clips, voiceClips: d.voices, code: b.code, duration: b.duration })
  clipsTotal += d.clips
  voiceTotal += d.voices

  const where = b.code ? `${b.code} · ${b.duration ?? '?'} min` : '(no code)'
  console.log(`  ok  ${f}`)
  console.log(`      ${where} — ${tracks} tracks, ${d.clips} clips (${d.voices} voice), saved ${new Date(b.project.savedAt || b.exportedAt).toLocaleString()}`)
}

/* ------------------------------------------------------- the manifest --- */

const manifestPath = join(dir, 'manifest.json')
if (!existsSync(manifestPath)) {
  warnings.push('no manifest.json in the folder — nothing to check the file list against')
} else {
  let m: Manifest | undefined
  try {
    m = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  } catch (e) {
    problems.push(`manifest.json is not readable: ${(e as Error).message}`)
  }
  if (m) {
    const listed = new Set(m.files.map((x) => x.file))
    for (const f of files) if (!listed.has(f)) problems.push(`${f} is in the folder but not in manifest.json`)
    for (const x of m.files) {
      if (!seen.has(x.file)) { problems.push(`${x.file} is in manifest.json but not in the folder`); continue }
      const s = seen.get(x.file)!
      if (s.clips !== x.clips) problems.push(`${x.file}: manifest says ${x.clips} clips, the file has ${s.clips}`)
      if (s.tracks !== x.tracks) problems.push(`${x.file}: manifest says ${x.tracks} tracks, the file has ${s.tracks}`)
      if (s.voiceClips !== x.voiceClips) problems.push(`${x.file}: manifest says ${x.voiceClips} voice clips, the file has ${s.voiceClips}`)
    }
    console.log(`\nManifest taken ${m.takenAt} from ${m.database}: ${m.sessions} sessions out of ${m.protocols} protocols.`)
  }
}

/* ------------------------------------------------------------ the word --- */

console.log('')
if (warnings.length) {
  console.log(`${warnings.length} thing${warnings.length === 1 ? '' : 's'} to be aware of:`)
  for (const w of warnings) console.log('  -', w)
  console.log('')
}
if (problems.length) {
  console.log(`${problems.length} PROBLEM${problems.length === 1 ? '' : 'S'}:`)
  for (const p of problems) console.log('  -', p)
  console.log('\nThis folder is not a complete backup. Run npm run backup:studio again.')
  process.exit(1)
}
console.log(`All ${files.length} files are restorable. ${clipsTotal} clips in total, ${voiceTotal} of them voice.`)
