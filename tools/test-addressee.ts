/* ============================================================================
   Two forms of the same protocol

   Italian and Portuguese make the listener's gender audible, so a protocol is
   written and voiced twice. The rules that carry it are asserted here, and
   the first one is the one the catalogue depends on:

       THE MALE FORM KEEPS THE BARE KEY.

   Everything published before this feature existed is Italian-to-a-man filed
   under `it`, and must keep working untouched. The rest is about what a
   text-only import is allowed to do — which is: the words, and nothing else.

       npx esbuild tools/test-addressee.ts --bundle --platform=node \
         --format=cjs --define:import.meta.env={} --outfile=<tmp>/ad.cjs \
         && node <tmp>/ad.cjs
   ============================================================================ */

import {
  variantKey, parseVariantKey, textIn, textFor, variantsWithText,
  type TextByLang,
} from '../src/tts/voiceLang'
import { overlayScripts } from '../src/admin/publishPlain'
import { withAudioUrl, audioPath } from '../src/admin/attachAudio'
import { audioPick } from '../src/data/liveCatalog'
import type { PlainTimeline } from '../src/admin/plainTimeline'
import type { CatalogProtocol } from '../src/data/catalog'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* ------------------------------------------------------------- the key --- */
console.log('\n--- the male form keeps the bare key ---')
assert(variantKey('it', 'm') === 'it', 'Italian to a man is "it", not "it:m"')
assert(variantKey('it', 'f') === 'it:f', 'Italian to a woman is "it:f"')
assert(variantKey('pt-BR', 'm') === 'pt-BR', 'and the same for Portuguese')
assert(variantKey('pt-BR', 'f') === 'pt-BR:f', '…in both forms')
assert(variantKey('it') === 'it', 'male is the default, so every old caller keeps its key')
assert(parseVariantKey('it')?.to === 'm', 'an unsuffixed key reads back as the male form')
assert(parseVariantKey('pt-BR:f')?.lang === 'pt-BR' && parseVariantKey('pt-BR:f')?.to === 'f', 'and a suffixed one as the female')
assert(parseVariantKey('klingon') === null, 'a key that is not a language is not one')

/* ---------------------------------------------------------- reading it --- */
console.log('\n--- text written before the female scripts existed ---')
const legacy: TextByLang = { it: 'Quando sei pronto, chiudi gli occhi.' }
assert(textIn(legacy, 'it') === 'Quando sei pronto, chiudi gli occhi.', 'reads as the male Italian')
assert(textIn(legacy, 'it', 'f') === undefined, 'and has NO female text — it is not invented')
assert(textFor(legacy, 'it', 'f')?.exact === false, 'asking for the female form falls back…')
assert(textFor(legacy, 'it', 'f')?.text === legacy.it, '…to the male words')
assert(textFor(legacy, 'it', 'm')?.exact === true, 'and the male form is exact')
assert(textFor(undefined, 'it', 'm') === undefined, 'no text at all is undefined, not an empty string')

const both: TextByLang = { it: 'sei pronto', 'it:f': 'sei pronta' }
assert(textFor(both, 'it', 'f')?.text === 'sei pronta', 'with both, each form gets its own words')
assert(textFor(both, 'it', 'f')?.exact === true, 'and nothing is flagged as a fallback')
assert(variantsWithText(both).length === 2, 'and the map reports both variants')

/* ------------------------------------------------------------- audio ----- */
console.log('\n--- which recording plays ---')
const proto = { versions: [{ duration: 12, audioUrl: { it: 'IT_M.mp3' } }] } as unknown as CatalogProtocol
assert(audioPick(proto, 12, 'it', 'm')?.url === 'IT_M.mp3', 'a man gets the file that is there')
assert(audioPick(proto, 12, 'it', 'm')?.exact === true, '…as the exact form')
assert(audioPick(proto, 12, 'it', 'f')?.url === 'IT_M.mp3', 'a woman gets it too rather than an empty library')
assert(audioPick(proto, 12, 'it', 'f')?.exact === false, '…but it is marked as NOT her form, which is what the screen says')

const bothAudio = { versions: [{ duration: 12, audioUrl: { it: 'IT_M.mp3', 'it:f': 'IT_F.mp3' } }] } as unknown as CatalogProtocol
assert(audioPick(bothAudio, 12, 'it', 'f')?.url === 'IT_F.mp3', 'once hers exists she gets hers')
assert(audioPick(bothAudio, 12, 'it', 'f')?.exact === true, '…exactly')
assert(audioPick(bothAudio, 12, 'it', 'm')?.url === 'IT_M.mp3', 'and his is untouched by hers arriving')

console.log('\n--- publishing one does not move the other ---')
const published = { code: 'GL-ANX 1.1', versions: [{ duration: 12, audioUrl: { it: 'IT_M.mp3' } }] } as unknown as CatalogProtocol
const after = withAudioUrl(published, 12, 'it', 'IT_F.mp3', 1, 'f')
const urls = after.versions[0].audioUrl as Record<string, string>
assert(urls.it === 'IT_M.mp3', 'the male file is exactly where it was')
assert(urls['it:f'] === 'IT_F.mp3', 'and the female one is beside it')
assert(audioPath('GL-ANX 1.1', 12, 'it') === 'GL-ANX_1_1/12min-it.mp3', 'the male storage path is unchanged')
assert(audioPath('GL-ANX 1.1', 12, 'it', 'f') === 'GL-ANX_1_1/12min-it-f.mp3', 'the female one is a new name beside it')

/* --------------------------------------------------- the text-only import */
console.log('\n--- "only the words" touches only the words ---')
function timeline(text: TextByLang, startSec: number, volumeDb: number): PlainTimeline {
  return {
    code: 'GL-ANX 1.1',
    versions: [{
      sheet: '12min', durationMin: 12, durationS: 720, phases: [],
      clips: [{
        clipId: 'v1', tipo: 'voice', startS: startSec, durataS: 10, volumeDb,
        testo: text.it, testoByLang: text,
      }],
    }],
    affirmations: [],
    issues: [],
  } as unknown as PlainTimeline
}

const stored = timeline({ it: 'sei pronto' }, 30, -6)
const incoming = timeline({ it: 'sei pronto', 'it:f': 'sei pronta' }, 999, +12)
const { merged, updated, unmatched } = overlayScripts(stored, incoming)
const clip = merged.versions[0].clips[0] as unknown as { startS: number; volumeDb: number; testoByLang: TextByLang }

assert(clip.testoByLang['it:f'] === 'sei pronta', 'the new female text is taken')
assert(clip.testoByLang.it === 'sei pronto', 'the male text it already had is kept')
assert(clip.startS === 30, 'the START TIME in the file is ignored — the stored one stands')
assert(clip.volumeDb === -6, 'and so is the level')
assert(updated.length === 1, 'the one clip whose words changed is reported')
assert(unmatched.length === 0, 'and nothing was unmatched')

console.log('\n--- a file for the wrong protocol ---')
const foreign = timeline({ it: 'altro testo' }, 30, -6)
;(foreign.versions[0].clips[0] as unknown as { clipId: string }).clipId = 'somebody-elses-clip'
const off = overlayScripts(stored, foreign)
assert(off.unmatched.includes('somebody-elses-clip'), 'the unmatched row is named, not swallowed')
assert(off.merged.versions[0].clips.length === 1, 'and it is NOT added to the protocol')
assert((off.merged.versions[0].clips[0] as unknown as { testoByLang: TextByLang }).testoByLang.it === 'sei pronto',
  'the stored clip keeps its own words')

console.log('\n--- an empty column does not erase anything ---')
const blank = timeline({ it: '  ' }, 30, -6)
const kept = overlayScripts(timeline({ it: 'sei pronto', 'it:f': 'sei pronta' }, 30, -6), blank)
const keptClip = kept.merged.versions[0].clips[0] as unknown as { testoByLang: TextByLang }
assert(keptClip.testoByLang.it === 'sei pronto', 'a blank cell leaves the stored male text alone')
assert(keptClip.testoByLang['it:f'] === 'sei pronta', 'and the female text it never mentioned')
assert(kept.updated.length === 0, 'and nothing is reported as changed')

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); process.exit(1) }
