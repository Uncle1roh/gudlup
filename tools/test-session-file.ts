/* ============================================================================
   The Studio session file — write it, read it back, refuse the wrong things

   This is the copy of the work that does not depend on the database, so the
   thing it must never do is lose something on the way through. The round
   trip here carries the fields that have gone missing before: per-clip EQ,
   the rendered voice path, and the per-language text and voice maps that are
   the ONLY place the other three versions live.

   Run: npx esbuild tools/test-session-file.ts --bundle --platform=node \
          --format=cjs --define:import.meta.env={} --outfile=x.cjs && node x.cjs
   ============================================================================ */

import {
  STUDIO_FILE_KIND,
  STUDIO_FILE_VERSION,
  buildStudioBackup,
  describeStudioBackup,
  parseStudioBackup,
  studioBackupFilename,
} from '../src/studio/sessionFile'
import type { StudioProject } from '../src/compose/types'

let pass = 0
const fails: string[] = []
function assert(ok: boolean, what: string) {
  if (ok) { pass++; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* A session with the things that have been dropped before. */
const project: StudioProject = {
  name: 'GL-ANX 1.1 — Calma e sicurezza',
  lengthSec: 1440,
  masterGain: 0.82,
  fadeInSec: 2,
  fadeOutSec: 4,
  phases: [{ fase: 1, startSec: 0, endSec: 240 }, { fase: 6, startSec: 1200, endSec: 1440 }],
  savedAt: 1_760_000_000_000,
  tracks: [
    {
      type: 'voice', name: 'Voce', volume: 0.9, channel: 'C',
      clips: [{
        startSec: 10, durationSec: 20,
        params: { pan: 0 } as never,
        text: 'Respira',
        gainDb: -3, fadeInSec: 1, fadeOutSec: 2, calibrateDb: -18,
        eq: { lowGainDb: 1 } as never,
        ttsPath: 'tts/v/abc.mp3', ttsText: 'Respira',
        sourceId: 'c1',
        textByLang: { it: 'Respira', 'it:f': 'Respira', 'pt-BR': 'Respire', 'pt-BR:f': 'Respire' },
        ttsByLang: { it: 'tts/v/abc.mp3', 'pt-BR': 'tts/v/def.mp3' },
        voiceByLang: { it: { voiceId: 'v1' }, 'pt-BR': { voiceId: 'v2' } } as never,
      }],
    },
    {
      type: 'music', name: 'Musica', volume: 0.5, baseLufs: -18,
      clips: [{ startSec: 0, durationSec: 1440, params: {} as never }],
    },
  ],
}

/* ------------------------------------------------------- the round trip -- */
console.log('--- write it, read it back ---')
const written = buildStudioBackup({
  project, code: 'GL-ANX 1.1', duration: 24,
  workingLang: 'pt-BR', workingTo: 'f',
  scripts: { bySource: { c1: { 'pt-BR': 'Respire' } }, byItText: {} },
  now: 1_760_500_000_000,
})
const back = parseStudioBackup(JSON.stringify(written, null, 2))
assert(back.ok, 'a file this module wrote is a file it can read')
if (!back.ok) { console.log('cannot continue'); process.exit(1) }
const b = back.backup

assert(b.code === 'GL-ANX 1.1' && b.duration === 24, 'it still knows which protocol and which time signature it is')
assert(b.workingLang === 'pt-BR' && b.workingTo === 'f', 'and which of the four versions was on screen')
assert(b.project.lengthSec === 1440 && b.project.masterGain === 0.82, 'length and master survive')
assert(b.project.fadeInSec === 2 && b.project.fadeOutSec === 4, 'the session fades survive')
assert(b.project.phases?.length === 2, 'the phase windows survive — the closing is told apart by them')
assert(b.project.savedAt === 1_760_000_000_000, 'the original save time is kept, not overwritten by the export')

const clip = b.project.tracks[0].clips[0]
assert(clip.eq?.lowGainDb === 1, 'per-clip EQ survives')
assert(clip.ttsPath === 'tts/v/abc.mp3' && clip.ttsText === 'Respira', 'the rendered voice survives')
assert(clip.textByLang?.['pt-BR'] === 'Respire' && clip.textByLang?.['it:f'] === 'Respira',
  'and the text of ALL FOUR versions — the file is the only copy of the three not on screen')
assert(!!clip.ttsByLang?.['pt-BR'] && !!clip.voiceByLang?.['pt-BR'], 'with their renders and their voices')
assert(b.project.tracks[1].baseLufs === -18, 'a lane authored in LUFS keeps its target')
assert(!!b.scripts?.bySource?.c1, 'the timeline texts ride along, so a restore can still fill a language')

/* ------------------------------------------------------------ the name --- */
console.log('\n--- what the file is called ---')
const name = studioBackupFilename(written)
assert(name.startsWith('GL-ANX-1.1_24min_'), 'the code and the time signature lead: ' + name)
assert(name.endsWith('.glstudio.json'), 'and it ends in .glstudio.json')
assert(!/[\\/:*?"<>|]/.test(name), 'nothing in it a filesystem refuses')
const slashy = studioBackupFilename({ ...written, code: 'GL/ANX:1.1' })
assert(!/[\\/:*?"<>|]/.test(slashy), 'including when the code itself carries one (' + slashy + ')')
const unnamed = studioBackupFilename({ ...written, code: null, duration: null })
assert(unnamed.endsWith('.glstudio.json') && unnamed.length > 14, 'a session with no code still gets a name: ' + unnamed)

/* --------------------------------------------------- what it refuses ----- */
console.log('\n--- the wrong file ---')
const notJson = parseStudioBackup('this is not json at all {')
assert(!notJson.ok && notJson.reason === 'not-json', 'a file that is not JSON says so')
const notOurs = parseStudioBackup(JSON.stringify({ hello: 'world' }))
assert(!notOurs.ok && notOurs.reason === 'not-ours', 'JSON that is not ours says so')
const excel = parseStudioBackup(JSON.stringify({ code: 'GL-ANX 1.1', versions: [] }))
assert(!excel.ok && excel.reason === 'not-ours', 'and so does something of ours that is not a SESSION')
const tooNew = parseStudioBackup(JSON.stringify({ ...written, version: STUDIO_FILE_VERSION + 1 }))
assert(!tooNew.ok && tooNew.reason === 'too-new',
  'a file from a newer Studio is refused rather than opened with fields silently dropped')
const empty = parseStudioBackup(JSON.stringify({ ...written, project: { ...project, tracks: [] } }))
assert(!empty.ok && empty.reason === 'empty', 'a session with no tracks is refused')
const noProject = parseStudioBackup(JSON.stringify({ kind: STUDIO_FILE_KIND, version: 1 }))
assert(!noProject.ok && noProject.reason === 'empty', 'and so is one with no session in it at all')

/* ----------------------------------------------------------- repairs ----- */
console.log('\n--- a file that is ours but damaged ---')
const noLength = parseStudioBackup(JSON.stringify({ ...written, project: { ...project, lengthSec: 0 } }))
assert(noLength.ok && noLength.backup.project.lengthSec >= 1440,
  'a lost length is refitted around the clips, never truncating the session')
const noGain = parseStudioBackup(JSON.stringify({ ...written, project: { ...project, masterGain: undefined } }))
assert(noGain.ok && Number.isFinite(noGain.backup.project.masterGain), 'a lost master fader comes back at a usable value')
const lowerCase = parseStudioBackup(JSON.stringify({ ...written, code: '  gl-anx 1.1  ' }))
assert(lowerCase.ok && lowerCase.backup.code === 'GL-ANX 1.1', 'the code is read in the form the catalogue uses')
const olderVersion = parseStudioBackup(JSON.stringify({ ...written, version: 0 }))
assert(olderVersion.ok, 'an OLDER file still opens — only a newer one is refused')

/* --------------------------------------------------------- the summary --- */
console.log('\n--- what the confirmation says ---')
const d = describeStudioBackup(b)
assert(d.clips === 2 && d.voices === 1, 'it counts clips and voice clips, not tracks')

console.log(`\n${pass} assertions passed.`)
if (fails.length) { console.log(`${fails.length} FAILED:`); for (const f of fails) console.log('  -', f); process.exit(1) }
