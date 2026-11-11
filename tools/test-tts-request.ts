/* Proof of the ElevenLabs request contract — the GL-ANX 1.1 voice cluster.

   Every assertion here corresponds to a symptom the POs reported:
     · "profumo dentro calma" with a Brazilian accent, "pace" read as the
       English word  → short fragments need stitched context + shaped text
     · Portuguese protocols reading words in other languages → the request has
       to SAY the language, which means a model that accepts language_code
     · "the voice changes from the chosen archetype"      → stability, seed
     · "calore … morbidezza … abbandono" reads wrong      → ellipsis shaping
     · a model swap must not silently send an illegal body, and must not
       silently stop sending the language either

   Run: npx esbuild tools/test-tts-request.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/t.mjs && node <tmp>/t.mjs             */

import { createElevenLabsTts, shapeTtsText, activeModel } from '../src/tts/elevenlabs'
import { setTtsModelId, ttsModelId } from '../src/tts/settings'
import { DEFAULT_TTS_MODEL, languageCodeFor, learnedFor, ttsModel } from '../src/tts/model'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* The model is a SETTING now, so the suite needs somewhere for it to live.
   A Map is enough: nothing here depends on storage being a real browser's. */
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
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

/* ------------------------------------------------------ the language code */

assert(languageCodeFor('pt-BR') === 'pt',
  "pt-BR becomes 'pt' — ElevenLabs' list has ONE Portuguese, and an unknown code is silently ignored")
assert(languageCodeFor('it') === 'it', 'a bare tag is passed through')

/* ------------------------------------------------- the request body itself */

interface Captured { url: string; body: Record<string, unknown> }
let sent: Captured[] = []
const okFetch = async (url: string, init: { body: string }) => {
  sent.push({ url, body: JSON.parse(init.body) })
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8), text: async () => '' }
}
;(globalThis as unknown as { fetch: unknown }).fetch = okFetch

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

/* THE REGRESSION THIS FILE EXISTS FOR: the language is stated, not inferred */
assert(ttsModelId() === DEFAULT_TTS_MODEL && DEFAULT_TTS_MODEL === 'eleven_flash_v2_5',
  'the shipped default is a model that can be TOLD the language')
assert(r.model_id === 'eleven_flash_v2_5', 'the chosen model is what the body names')
assert(r.language_code === 'it', 'an Italian line declares Italian')
assert(r.apply_text_normalization === 'on',
  "normalization is on once the language is enforced — safe now that '1, 2, 3' cannot be counted in the wrong one")

sent = []
await tts.render('calma', { lang: 'pt-BR' })
assert(sent[0].body.language_code === 'pt',
  'a Portuguese line declares Portuguese — "calma" is Italian, Portuguese AND Spanish, and this is what stops the engine choosing')

/* determinism: same line + voice + context → same seed; anything different → different */
sent = []
await tts.render('pace', { lang: 'it', previousText: 'sono al sicuro', nextText: 'protetto' })
await tts.render('pace', { lang: 'it', previousText: 'un altro contesto', nextText: 'protetto' })
await tts.render('pace', { lang: 'pt-BR', previousText: 'sono al sicuro', nextText: 'protetto' })
assert(sent[0].body.seed === r.seed, 'identical request → identical seed (a session re-renders the same)')
assert(sent[1].body.seed !== r.seed, 'different context → different seed')
assert(sent[2].body.seed !== r.seed, 'different language → different seed')

/* an explicit seed wins, so "Re-synthesize" can escape a bad take */
sent = []
await tts.render('pace', { lang: 'it', seed: 12345 })
assert(sent[0].body.seed === 12345, 'an explicit seed overrides the derived one (the reroll path)')

/* the engine's own speech rate, for a line that must slow down */
sent = []
await tts.render('1, 2, 3, 4, 5', { lang: 'it', rate: 0.8 })
assert((sent[0].body.voice_settings as Record<string, unknown>).speed === 0.8,
  'rate reaches voice_settings.speed')
sent = []
await tts.render('x', { lang: 'it', rate: 3 })
assert((sent[0].body.voice_settings as Record<string, unknown>).speed === 1.2,
  'rate is clamped into the API range instead of 422-ing')

/* the secondary ([M]) voice still resolves */
sent = []
await tts.render('respira', { lang: 'it', voice: 'secondary' })
assert(sent[0].url.endsWith('/Zd5ZRxsNxAoZHMRh5hdm'), 'voice:secondary still selects the male archetype')

/* ------------------------------------------------- changing the model ---- */

setTtsModelId('eleven_multilingual_v2')
sent = []
await tts.render('pace', { lang: 'it' })
assert(sent[0].body.model_id === 'eleven_multilingual_v2', 'the setting reaches the body with no reload')
assert(!('language_code' in sent[0].body),
  'language_code withheld on multilingual_v2 — the one model that answers 422 to it')
assert(sent[0].body.apply_text_normalization === 'auto',
  "normalization falls back to 'auto' when the language is unenforced: 'on' would risk counting in Portuguese")
assert(activeModel().id === 'eleven_multilingual_v2', 'activeModel() follows the setting')

setTtsModelId('eleven_v4')
sent = []
await tts.render('pace', { lang: 'it' })
assert((sent[0].body.voice_settings as Record<string, unknown>).stability === 1,
  'on the v3/v4 family stability is a three-way switch, so 0.8 is rounded HERE (to the stable end) rather than silently upstream')
assert(sent[0].body.language_code === 'it', 'v4 is told the language too')
assert(ttsModel('eleven_flash_v2_5').caps.stabilitySteps === null,
  'flash keeps stability as a continuous dial')

/* ---- a 422 that names a parameter is information, not a dead render ---- */

setTtsModelId('eleven_flash_v2_5')
sent = []
let calls = 0
;(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
  calls += 1
  const body = JSON.parse(init.body) as Record<string, unknown>
  sent.push({ url, body })
  if ('language_code' in body) {
    return { ok: false, status: 422, text: async () => '{"detail":{"loc":["body","language_code"],"msg":"language_code is not supported for this model"}}' }
  }
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8), text: async () => '' }
}
const bytes = await tts.render('pace', { lang: 'it' })
assert(calls === 2 && bytes.byteLength === 8,
  'a 422 naming a parameter drops it and retries — the render succeeds instead of dying on a stale capability table')
assert('language_code' in sent[0].body && !('language_code' in sent[1].body),
  'the retry is the same request minus the one parameter the model refused')
assert(learnedFor('eleven_flash_v2_5').includes('language_code'),
  'and it is written down, so the next hundred lines of this protocol do not each pay for the same discovery')

sent = []
calls = 0
await tts.render('calma', { lang: 'pt-BR' })
assert(calls === 1 && !('language_code' in sent[0].body),
  'learned once, never sent again — one free round trip per browser, not per line')

/* ---- a 422 that survives the retry has to say what to do about it ---- */

;(globalThis as unknown as { fetch: unknown }).fetch = async () => ({
  ok: false, status: 422, text: async () => 'seed is not supported for this model',
})
let msg = ''
try { await tts.render('pace', { lang: 'it' }) } catch (e) { msg = (e as Error).message }
assert(msg.includes('422') && msg.includes('seed') && msg.includes('pannello Voce'),
  'a 422 the retry cannot fix names the parameter and points at the panel where the model is changed')

/* ---- the other errors stay as diagnosable as they were ---- */

;(globalThis as unknown as { fetch: unknown }).fetch = async () => ({
  ok: false, status: 401, text: async () => 'invalid_api_key',
})
msg = ''
try { await tts.render('pace', { lang: 'it' }) } catch (e) { msg = (e as Error).message }
assert(msg.includes('401') && msg.toLowerCase().includes('chiave'),
  'a bad key still reads as a bad key, not as a model problem')
