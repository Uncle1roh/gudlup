/* Proof of the ElevenLabs request contract — the GL-ANX 1.1 voice cluster.

   Every assertion here corresponds to a symptom the POs reported:
     · "profumo dentro calma" with a Brazilian accent, "pace" read as the
       English word  → short fragments need stitched context + shaped text
     · "the voice changes from the chosen archetype"      → stability, seed
     · "calore … morbidezza … abbandono" reads wrong      → ellipsis shaping
     · a model swap must not silently send an illegal body → MODEL_CAPS gating

   Run: npx esbuild tools/test-tts-request.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/t.mjs && node <tmp>/t.mjs             */

import { createElevenLabsTts, shapeTtsText, MODEL_ID } from '../src/tts/elevenlabs'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* ---------------------------------------------------------- text shaping */

assert(shapeTtsText('calore … morbidezza … abbandono') === 'calore... morbidezza... abbandono.',
  'U+2026 becomes the documented "..." with consistent spacing, and the line gets a full stop')
assert(shapeTtsText('pace') === 'pace.',
  'a one-word fragment gains terminal punctuation (sentence structure = a language cue)')
assert(shapeTtsText('sono al sicuro.') === 'sono al sicuro.',
  'an already-punctuated line is left alone')
assert(shapeTtsText('  lascia   andare,\n lascia andare tutto ') === 'lascia andare, lascia andare tutto.',
  'whitespace collapses; an existing comma is not doubled with a stop')
assert(shapeTtsText('calore…sole…pelle') === 'calore... sole... pelle.',
  'ellipses with no surrounding spaces still get separated')
assert(shapeTtsText('respira … … profondo') === 'respira... profondo.',
  'doubled ellipses collapse to one pause')
assert(!shapeTtsText('calore … sole').includes('<break'),
  'no <break> tags — the docs warn they make the model speed up or add artifacts')
assert(shapeTtsText('1, 2, 3, 4, 5') === '1, 2, 3, 4, 5.',
  'a counting line keeps its commas (the pacing) and gains a stop')

/* ------------------------------------------------- the request body itself */

interface Captured { url: string; body: Record<string, unknown> }
const sent: Captured[] = []
;(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
  sent.push({ url, body: JSON.parse(init.body) })
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
}

const VOICE = 'aYBXyupCnZqrSVuPsR5i'
const tts = createElevenLabsTts('key-under-test', VOICE, 'Zd5ZRxsNxAoZHMRh5hdm')

await tts.render('pace', { lang: 'it', previousText: 'sono al sicuro', nextText: 'protetto' })
const r = sent[0].body
const vs = r.voice_settings as Record<string, unknown>

assert(sent[0].url.endsWith(`/${VOICE}`), 'posts to the resolved voice id')
assert(r.text === 'pace.', 'the shaped text is what gets spoken, not the raw cell')
assert(r.previous_text === 'sono al sicuro.' && r.next_text === 'protetto.',
  'neighbours are sent as stitching context — the fix for short-fragment language drift')
assert(typeof r.seed === 'number' && (r.seed as number) >= 0 && (r.seed as number) <= 4294967295,
  'a seed inside the API range is always sent')
assert(vs.stability === 0.8, 'stability is at the identity end of the range, not the old 0.5')
assert(vs.use_speaker_boost === true, 'speaker boost on — holds the archetype')
assert(vs.style === 0, 'style stays 0: >0 trades identity for drama')
assert(!('speed' in vs), 'no speed key when the caller asks for no rate change')

/* language_code is a 422 on multilingual_v2, so it must NOT be sent there */
assert(MODEL_ID === 'eleven_multilingual_v2', 'still on the POs’ approved model')
assert(!('language_code' in r),
  'language_code withheld on multilingual_v2 (the model rejects it)')
assert(r.apply_text_normalization === 'auto',
  "normalization stays 'auto' while the language is unenforced — 'on' would risk counting in Portuguese")

/* determinism: same line + voice + context → same seed; anything different → different */
sent.length = 0
await tts.render('pace', { lang: 'it', previousText: 'sono al sicuro', nextText: 'protetto' })
await tts.render('pace', { lang: 'it', previousText: 'un altro contesto', nextText: 'protetto' })
await tts.render('pace', { lang: 'pt-BR', previousText: 'sono al sicuro', nextText: 'protetto' })
assert(sent[0].body.seed === r.seed, 'identical request → identical seed (a session re-renders the same)')
assert(sent[1].body.seed !== r.seed, 'different context → different seed')
assert(sent[2].body.seed !== r.seed, 'different language → different seed')

/* an explicit seed wins, so "Re-synthesize" can escape a bad take */
sent.length = 0
await tts.render('pace', { lang: 'it', seed: 12345 })
assert(sent[0].body.seed === 12345, 'an explicit seed overrides the derived one (the reroll path)')

/* the engine's own speech rate, for a line that must slow down */
sent.length = 0
await tts.render('1, 2, 3, 4, 5', { lang: 'it', rate: 0.8 })
assert((sent[0].body.voice_settings as Record<string, unknown>).speed === 0.8,
  'rate reaches voice_settings.speed')
sent.length = 0
await tts.render('x', { lang: 'it', rate: 3 })
assert((sent[0].body.voice_settings as Record<string, unknown>).speed === 1.2,
  'rate is clamped into the API range instead of 422-ing')

/* the secondary ([M]) voice still resolves */
sent.length = 0
await tts.render('respira', { lang: 'it', voice: 'secondary' })
assert(sent[0].url.endsWith('/Zd5ZRxsNxAoZHMRh5hdm'), 'voice:secondary still selects the male archetype')

/* errors stay diagnosable */
;(globalThis as unknown as { fetch: unknown }).fetch = async () => ({
  ok: false, status: 422, text: async () => 'language_code is not supported for this model',
})
let msg = ''
try { await tts.render('pace', { lang: 'it' }) } catch (e) { msg = (e as Error).message }
assert(msg.includes('422') && msg.includes('MODEL_CAPS'),
  'a 422 points at MODEL_CAPS — the first thing a model swap breaks')
