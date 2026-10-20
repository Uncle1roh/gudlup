/* ============================================================================
   Switching between the male and the female version keeps the voices

   The male and the female version of a protocol are the SAME session said to
   two people: same tracks, same timing, same levels, same draws. Most of the
   lines are the same words too — "sei al sicuro" does not change. Only the
   gendered ones do: "sei pronto" / "sei pronta".

   Until this, switching version emptied every voice clip. The PO pressed
   "Tutte le voci" and paid ElevenLabs a second time for a whole protocol to
   change four words, and had no way of knowing WHICH four.

   Two rules make that stop, and this asserts both:

     · a line that is word for word the same keeps the render already paid
       for — renders are content-addressed, so it is literally the same
       stored object, not an approximation;
     · a line that really changed is reported as changed, so it can be
       synthesized by hand instead of being found by listening.

   Run: npx esbuild tools/test-voice-forms.ts --bundle --platform=node \
          --format=cjs --define:import.meta.env={} --outfile=x.cjs && node x.cjs
   ============================================================================ */

import {
  canonicalVoiceClip, compareForms, otherForm, switchClipLang, textOfVariant,
  type LangClip, type Variant,
} from '../src/studio/sessionLang'
import type { VoiceParams } from '../src/studio/multitrack'

let pass = 0
const fails: string[] = []
function assert(ok: boolean, what: string) {
  if (ok) { pass++; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const M: Variant = { lang: 'it', to: 'm' }
const F: Variant = { lang: 'it', to: 'f' }
const PT_M: Variant = { lang: 'pt-BR', to: 'm' }

const VOICE = 'aYBXyupCnZqrSVuPsR5i'

/** A voice clip as the Studio holds it while working in the male version. */
function clip(opts: {
  text: string
  female?: string
  path?: string
  rendered?: string
  voiceId?: string
}): LangClip {
  const id = opts.voiceId ?? VOICE
  return {
    text: opts.text,
    ttsPath: opts.path,
    ttsText: opts.rendered ?? (opts.path ? opts.text : undefined),
    params: { pan: 0, pulseHz: 0.35, toneHz: 320, voiceId: id, voiceArchetype: 'maternal', voiceGender: 'F' } as VoiceParams,
    sourceId: 'clip:VC-001',
    textByLang: { it: opts.text, ...(opts.female ? { 'it:f': opts.female } : {}) },
  }
}

console.log('--- a line that does not change keeps its voice ---')
{
  const c = clip({ text: 'Sono al sicuro.', female: 'Sono al sicuro.', path: 'tts/v/abc.mp3' })
  const r = switchClipLang(c, M, F)
  assert(r.carried, 'the switch reports the render as carried over, not lost')
  assert(r.clip.ttsPath === 'tts/v/abc.mp3', 'the female version points at the same stored render')
  assert(r.clip.ttsText === 'Sono al sicuro.', 'and the render is marked as speaking the line on screen')
  assert(compareForms(c, 'it') === 'same', 'the line reads as unchanged between the two versions')
}

console.log('')
console.log('--- a line that really changes does not ---')
{
  const c = clip({ text: 'Sei pronto.', female: 'Sei pronta.', path: 'tts/v/def.mp3' })
  const r = switchClipLang(c, M, F)
  assert(!r.carried, 'the male render is not passed off as the female one')
  assert(!r.clip.ttsPath, 'the female version opens with no render')
  assert(r.clip.text === 'Sei pronta.', 'and with its own words')
  assert(compareForms(c, 'it') === 'different', 'the line reads as changed — this is the one to synthesize')
}

console.log('')
console.log('--- what "the same line" means ---')
{
  const spaced = clip({ text: 'Sono al sicuro.', female: '  Sono   al sicuro. ', path: 'tts/v/abc.mp3' })
  assert(switchClipLang(spaced, M, F).carried, 'spacing from the Excel does not make two lines different')
  const dots = clip({ text: 'Respira…', female: 'Respira...', path: 'tts/v/abc.mp3' })
  assert(switchClipLang(dots, M, F).carried, 'nor does the ellipsis glyph')
  const cased = clip({ text: 'Respira.', female: 'respira.', path: 'tts/v/abc.mp3' })
  assert(switchClipLang(cased, M, F).carried, 'nor does capitalisation')
  const real = clip({ text: 'Sei al sicuro.', female: 'Sei al sicuro ora.', path: 'tts/v/abc.mp3' })
  assert(!switchClipLang(real, M, F).carried, 'an added word does')
}

console.log('')
console.log('--- it never crosses a language ---')
{
  /* The same sentence in Italian and in Portuguese would be two recordings
     even if a protocol somehow wrote the identical string in both. */
  const c: LangClip = {
    ...clip({ text: 'Calma.', path: 'tts/v/it.mp3' }),
    textByLang: { it: 'Calma.', 'pt-BR': 'Calma.' },
  }
  const r = switchClipLang(c, M, PT_M)
  assert(!r.carried && !r.clip.ttsPath, 'an Italian render is not handed to the Portuguese version')
}

console.log('')
console.log('--- nor a change of speaker ---')
{
  const c: LangClip = {
    ...clip({ text: 'Sono al sicuro.', female: 'Sono al sicuro.', path: 'tts/v/abc.mp3' }),
    voiceByLang: { 'it:f': { voiceId: 'bra-mat', voiceArchetype: 'maternal', voiceGender: 'F' } },
  }
  const r = switchClipLang(c, M, F)
  assert(!r.carried, 'the female version is set to another voice: the same words are another recording')
  assert((r.clip.params as VoiceParams).voiceId === 'bra-mat', 'and it keeps the voice it was given')
}

console.log('')
console.log('--- the speaker does not change by itself ---')
{
  const c = clip({ text: 'Sei pronto.', female: 'Sei pronta.', path: 'tts/v/def.mp3' })
  const r = switchClipLang(c, M, F)
  assert((r.clip.params as VoiceParams).voiceId === VOICE,
    'the same person says the female line: a form is not a language, the voice is unchanged')
}

console.log('')
console.log('--- switching back and forth loses nothing ---')
{
  const c = clip({ text: 'Sei pronto.', female: 'Sei pronta.', path: 'tts/v/male.mp3' })
  const f = switchClipLang(c, M, F).clip
  /* The female line is synthesized while she is on screen. */
  const fRendered: LangClip = { ...f, ttsPath: 'tts/v/female.mp3', ttsText: 'Sei pronta.' }
  const back = switchClipLang(fRendered, F, M)
  assert(back.clip.ttsPath === 'tts/v/male.mp3' && back.clip.text === 'Sei pronto.',
    'back in the male version, the male render and words are there')
  const again = switchClipLang(back.clip, M, F)
  assert(again.clip.ttsPath === 'tts/v/female.mp3' && again.clip.text === 'Sei pronta.',
    'and the female render was kept too — both versions hold their own')
}

console.log('')
console.log('--- a save made in the female version keeps both ---')
{
  const c = clip({ text: 'Sei pronto.', female: 'Sei pronta.', path: 'tts/v/male.mp3' })
  const f = switchClipLang(c, M, F).clip
  const fRendered: LangClip = { ...f, ttsPath: 'tts/v/female.mp3', ttsText: 'Sei pronta.' }
  const canon = canonicalVoiceClip(fRendered, F)
  assert(canon.text === 'Sei pronto.' && canon.ttsPath === 'tts/v/male.mp3',
    'the saved row is canonically the male one, whatever version was on screen')
  assert(canon.ttsByLang?.['it:f']?.path === 'tts/v/female.mp3',
    'and the female render travels in the map, so a reopen still has it')
}

console.log('')
console.log('--- with only one version written there is nothing to compare ---')
{
  const only = clip({ text: 'Sono al sicuro.', path: 'tts/v/abc.mp3' })
  assert(compareForms(only, 'it') === 'alone', 'no female text yet: not "different", and not marked')
  const r = switchClipLang(only, M, F)
  assert(r.missing, 'the clip is marked as having no text in this version')
  assert(!r.clip.ttsPath, 'and carries no render it has no words for')
}

console.log('')
console.log('--- while somebody is typing, the line on screen is the one that counts ---')
{
  /* The per-form maps are written on a switch and on a save. Between those
     two moments the working form's line lives on `text`, and a mark that
     read only the maps would describe the protocol as it was before the
     edit — telling the PO a line is unchanged at the exact moment they
     changed it. */
  const saved = clip({ text: 'Sei pronto.', female: 'Sei pronto.' })
  const editing: LangClip = { ...saved, text: 'Sei pronta.' }  // typed in the female box
  assert(compareForms(editing, 'it', 'f') === 'different',
    'typing a gendered word marks the line immediately, before any switch or save')
  assert(compareForms(editing, 'it') === 'same',
    'and without being told which form is being edited it still reads the maps — which is what a switch does')
  const undone: LangClip = { ...saved, text: 'Sei pronto.' }
  assert(compareForms(undone, 'it', 'f') === 'same', 'typing it back marks it unchanged again')
  const halfWritten: LangClip = { ...clip({ text: 'Sei pronto.' }), text: 'Sei pronta.' }
  assert(compareForms(halfWritten, 'it', 'f') === 'different',
    'the male line comes from the map, the female from the box: still a real comparison')
}

console.log('')
console.log('--- the helpers the console reads ---')
{
  const c = clip({ text: 'Sei pronto.', female: 'Sei pronta.' })
  assert(textOfVariant(c, M) === 'Sei pronto.' && textOfVariant(c, F) === 'Sei pronta.', 'each form reads its own line')
  assert(otherForm(M).to === 'f' && otherForm(F).to === 'm', 'the other form is the other form')
  assert(otherForm(M).lang === 'it', 'and the same language')
  const blank: LangClip = { ...c, textByLang: { it: 'Sei pronto.', 'it:f': '   ' } }
  assert(compareForms(blank, 'it') === 'alone', 'whitespace is not a female version')
}

console.log(`\n${pass} assertions passed.`)
if (fails.length) { console.log(`${fails.length} FAILED:`); for (const f of fails) console.log('  -', f); process.exit(1) }
