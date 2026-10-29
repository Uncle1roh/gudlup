/* ============================================================================
   Loading a Studio backup: what it would change, said BEFORE it happens

   Restore replaces the desk, and the desk may hold the only copy of an
   afternoon. The confirmation used to describe the FILE — "3 clips (1 voice),
   backed up on the 14th" — which is true and undecidable: the question is
   never what is in the file, it is the distance between the file and the
   work in front of you.

   `diffStudioBackup` measures that distance. What is asserted here is the
   part somebody would regret getting wrong: another protocol, another time
   signature, unsaved work, a backup older than the session, lines whose
   words differ, and renders that stop being valid.

   The lines come back as translation KEYS with their numbers beside them,
   never as finished sentences — the Studio speaks three languages, and a
   sentence built with the numbers already in it can never be looked up.
   ============================================================================ */

import { diffStudioBackup, buildStudioBackup, type OpenSession } from '../src/studio/sessionFile'
import type { SeedClip, SeedTrack, StudioProject } from '../src/compose/types'

let failed = 0
let checks = 0
function eq(label: string, got: unknown, want: unknown): void {
  checks++
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) { failed++; console.log(`FAIL  ${label}\n      got  ${a}\n      want ${b}`) }
  else console.log(`ok  : ${label}`)
}
/** Does the diff carry a line with this key? */
function has(lines: { key: string }[], key: string): boolean {
  return lines.some((l) => l.key === key)
}

function voice(sourceId: string, it: string, ttsPath?: string): SeedClip {
  return {
    startSec: 0, durationSec: 5,
    params: { voiceId: 'v1' },
    text: it, textByLang: { it }, sourceId,
    ...(ttsPath ? { ttsPath, ttsText: it } : {}),
  } as unknown as SeedClip
}

function project(clips: SeedClip[], over: Partial<StudioProject> = {}): StudioProject {
  const track: SeedTrack = { type: 'voice', name: 'Voce Guida', volume: 0.8, clips } as unknown as SeedTrack
  return {
    name: 'GL-CALM 1.1 — Prova', lengthSec: 720, masterGain: 0.82,
    savedAt: 1_000, tracks: [track], ...over,
  } as StudioProject
}

const open = (p: StudioProject, over: Partial<OpenSession> = {}): OpenSession => ({
  project: p, code: 'GL-CALM 1.1', duration: 12, workingLang: 'it', workingTo: 'm', ...over,
})

const backup = (p: StudioProject, over: Partial<Parameters<typeof buildStudioBackup>[0]> = {}) =>
  buildStudioBackup({
    project: p, code: 'GL-CALM 1.1', duration: 12,
    workingLang: 'it', workingTo: 'm', now: 2_000, ...over,
  })

/* ---- the same session, twice: nothing to decide ------------------------- */
{
  const p = project([voice('clip:VC-001', 'Respira')])
  const d = diffStudioBackup(open(p), backup(p))
  eq('identical: no warnings', d.warnings, [])
  eq('identical: no changes', d.changes, [])
  eq('identical: harmless', d.harmless, true)
}

/* ---- an empty desk cannot lose anything --------------------------------- */
{
  const empty = project([])
  const d = diffStudioBackup(open(empty, { dirty: true }), backup(project([voice('clip:VC-001', 'Respira')])))
  eq('empty desk: harmless', d.harmless, true)
  eq('empty desk: no unsaved-work warning', has(d.warnings, 'What is open has changes that were never saved. Loading replaces them and they cannot be recovered.'), false)
}

/* ---- another protocol, another time signature --------------------------- */
{
  const p = project([voice('clip:VC-001', 'Respira')])
  const d = diffStudioBackup(open(p), backup(p, { code: 'GL-ANX 1.1', duration: 24 }))
  eq('another protocol is a warning', has(d.warnings, 'This backup is {code}. You are working on {open}.'), true)
  eq('another duration is a warning', has(d.warnings, 'This backup is the {n}-minute version. You are working on {open} minutes.'), true)
  const w = d.warnings.find((x) => x.key.startsWith('This backup is {code}'))
  eq('…and it names both codes', w?.vars, { code: 'GL-ANX 1.1', open: 'GL-CALM 1.1' })
  eq('not harmless', d.harmless, false)
}

/* ---- unsaved work on screen --------------------------------------------- */
{
  const p = project([voice('clip:VC-001', 'Respira')])
  const d = diffStudioBackup(open(p, { dirty: true }), backup(p))
  eq('dirty desk is a warning', has(d.warnings, 'What is open has changes that were never saved. Loading replaces them and they cannot be recovered.'), true)
  eq('…so it is not harmless even though the file matches', d.harmless, false)
}

/* ---- a backup older than what is open ----------------------------------- */
{
  const p = project([voice('clip:VC-001', 'Respira')], { savedAt: 9_000 })
  const d = diffStudioBackup(open(p), backup(p, { now: 3_000 }))
  eq('going back in time is a warning', has(d.warnings, 'This backup is OLDER than the session on screen. Loading it goes back in time.'), true)
}

/* ---- the words, which are the expensive part ---------------------------- */
{
  const mine = project([
    voice('clip:VC-001', 'Respira profondamente'),
    voice('clip:VC-002', 'Sei al sicuro'),
    voice('clip:VC-003', 'Lascia andare'),
  ])
  const theirs = project([
    voice('clip:VC-001', 'Respira profondamente'),
    voice('clip:VC-002', 'Sei al sicuro, qui'),   // reworded
    voice('clip:VC-009', 'Una riga nuova'),       // only in the file
  ])
  const d = diffStudioBackup(open(mine), backup(theirs))
  const rew = d.changes.find((c) => c.key === '{n} voice lines are worded differently in the backup.')
  eq('one line reworded', rew?.vars, { n: 1 })
  const gone = d.changes.find((c) => c.key === '{n} voice lines on screen are not in the backup at all.')
  eq('one line of mine disappears', gone?.vars, { n: 1 })
  const neu = d.changes.find((c) => c.key === '{n} voice lines in the backup are not on screen.')
  eq('one line arrives', neu?.vars, { n: 1 })
}

/* ---- renders that stop being valid -------------------------------------- */
{
  const mine = project([voice('clip:VC-001', 'Respira', 'tts/a.mp3'), voice('clip:VC-002', 'Calma', 'tts/b.mp3')])
  const theirs = project([voice('clip:VC-001', 'Respira', 'tts/a.mp3'), voice('clip:VC-002', 'Calma')])
  const d = diffStudioBackup(open(mine), backup(theirs))
  const lost = d.changes.find((c) => c.key === '{n} synthesized voice clips lose their render and have to be spoken again.')
  eq('one render is lost', lost?.vars, { n: 1 })
}

/* ---- the rack ------------------------------------------------------------ */
{
  const mine = project([voice('clip:VC-001', 'A')], { lengthSec: 720, masterGain: 0.82 })
  const theirs = project([voice('clip:VC-001', 'A'), voice('clip:VC-002', 'B')], { lengthSec: 1440, masterGain: 0.5 })
  const d = diffStudioBackup(open(mine), backup(theirs))
  const n = d.changes.find((c) => c.key === '{a} clips on screen → {b} in the backup.')
  eq('clip counts', n?.vars, { a: 1, b: 2 })
  const len = d.changes.find((c) => c.key === 'Length {a} → {b}.')
  eq('length in m:ss', len?.vars, { a: '12:00', b: '24:00' })
  eq('master level', has(d.changes, 'The master level is different.'), true)
}

/* ---- it opens in another version ---------------------------------------- */
{
  const p = project([voice('clip:VC-001', 'A')])
  const d = diffStudioBackup(open(p), backup(p, { workingLang: 'pt-BR', workingTo: 'f' }))
  eq('a different variant is said out loud', has(d.changes, 'It opens in a different version (language or form) from the one you are in.'), true)
}

/* ---- every line is a KEY, never a built sentence ------------------------- */
{
  const mine = project([voice('clip:VC-001', 'A')])
  const theirs = project([voice('clip:VC-001', 'B'), voice('clip:VC-002', 'C')], { lengthSec: 360 })
  const d = diffStudioBackup(open(mine, { dirty: true }), backup(theirs, { code: 'GL-ANX 1.1' }))
  const all = [...d.warnings, ...d.changes]
  eq('there is something to read', all.length > 0, true)
  for (const l of all) {
    /* A key never carries a digit it did not declare: numbers live in `vars`
       and arrive through the translator, or the Italian and Portuguese
       dictionaries can never match. */
    const bare = l.key.replace(/\{[a-z]+\}/g, '')
    eq(`no interpolated value in "${l.key.slice(0, 40)}…"`, /\d/.test(bare), false)
  }
}

console.log(`\n${checks} checks, ${failed} failed`)
process.exit(failed ? 1 : 0)
