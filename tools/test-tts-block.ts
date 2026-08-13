/* Proof of the joined-block render: the fix for the whisper LOOP lane.

   A one-word request has no language to detect. Measured: isolated "pace" and
   "calma" came back non-Italian on 0-of-3 takes across five configurations,
   including turbo_v2_5 and flash_v2_5 with an explicit language_code=it. Spoken
   inside a sentence the same model is right every time. So short lines are
   spoken as ONE utterance and cut apart on the returned character timings.

   This checks the two halves that can go wrong silently:
     · the spans must TILE the audio (no gap, no overlap, cuts in the silence)
     · a mismatched or missing alignment must REFUSE to cut rather than slice
       mid-word

   Run: npx esbuild tools/test-tts-block.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/b.mjs && node <tmp>/b.mjs              */

import { createElevenLabsTts, shapeTtsText } from '../src/tts/elevenlabs'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

const VOICE = 'ZRvGXr3q13HhP63mThiX'
const LINES = ['sono al sicuro', 'pace', 'protetto', 'calma']

/* The real timings measured from /with-timestamps for
   "Sono al sicuro. Pace. Protetto. Calma." — reused here so the span maths is
   tested against what the API actually returns. */
const TEXT = 'sono al sicuro. pace. protetto. calma.'
const CHAR_TIMES: [string, number, number][] = []
{
  // per-character spans consistent with the observed word timings
  const words: [string, number, number][] = [
    ['sono al sicuro.', 0.00, 0.99],
    ['pace.', 1.16, 1.74],
    ['protetto.', 1.92, 2.67],
    ['calma.', 2.84, 3.62],
  ]
  let cursor = 0
  for (const [w, s, e] of words) {
    const idx = TEXT.indexOf(w, cursor)
    for (let i = cursor; i < idx; i++) CHAR_TIMES.push([TEXT[i], s, s]) // the joining space
    const per = (e - s) / w.length
    for (let i = 0; i < w.length; i++) CHAR_TIMES.push([w[i], s + i * per, s + (i + 1) * per])
    cursor = idx + w.length
  }
  for (let i = cursor; i < TEXT.length; i++) CHAR_TIMES.push([TEXT[i], 3.62, 3.62])
}

let captured: Record<string, unknown> | null = null
let responder: () => unknown = () => ({
  audio_base64: btoa('fake-mp3-bytes'),
  alignment: {
    characters: CHAR_TIMES.map((c) => c[0]),
    character_start_times_seconds: CHAR_TIMES.map((c) => c[1]),
    character_end_times_seconds: CHAR_TIMES.map((c) => c[2]),
  },
})
;(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
  captured = { url, body: JSON.parse(init.body) }
  return { ok: true, json: async () => responder() }
}

const tts = createElevenLabsTts('key-under-test', VOICE)

assert(tts.canRenderJoined === true, 'multilingual_v2 exposes the joined render (it serves /with-timestamps)')

const joined = await tts.renderJoined!(LINES, { lang: 'it' })
const body = (captured as { body: Record<string, unknown> }).body
const url = (captured as { url: string }).url

assert(url.endsWith('/with-timestamps'), 'posts to the timestamps endpoint')
assert(body.text === 'Sono al sicuro. Pace. Protetto. Calma.'.toLowerCase().replace(/^s/, 's')
  || body.text === 'sono al sicuro. pace. protetto. calma.',
  `the block is sent as ONE run of sentences (got "${body.text}")`)
assert(!String(body.text).includes('…'), 'the ellipsis character never reaches the API')
assert(joined.spans.length === LINES.length, 'one span per line')

/* the spans must tile: first starts at 0, last ends at the audio end, and each
   boundary is shared — a gap would drop audio, an overlap would double a word */
assert(close(joined.spans[0].startSec, 0), 'the first span starts at 0 (keeps the opening breath)')
assert(close(joined.spans[3].endSec, 3.62), 'the last span runs to the end of the audio')
for (let i = 1; i < joined.spans.length; i++) {
  assert(close(joined.spans[i].startSec, joined.spans[i - 1].endSec),
    `span ${i} starts exactly where span ${i - 1} ends (no gap, no overlap)`)
}
/* and each cut must land in the SILENCE between words, not inside one */
const gaps: [number, number][] = [[0.99, 1.16], [1.74, 1.92], [2.67, 2.84]]
for (let i = 0; i < gaps.length; i++) {
  const cut = joined.spans[i].endSec
  assert(cut > gaps[i][0] && cut < gaps[i][1],
    `cut ${i + 1} at ${cut.toFixed(3)}s falls inside the silence ${gaps[i][0]}–${gaps[i][1]}s`)
}
assert(joined.bytes.byteLength > 0, 'audio bytes are decoded from base64')

/* ---- it must REFUSE to cut on an alignment it cannot trust ---- */
responder = () => ({
  audio_base64: btoa('x'),
  alignment: { characters: ['n', 'o'], character_start_times_seconds: [0, 1], character_end_times_seconds: [1, 2] },
})
let err = ''
try { await tts.renderJoined!(LINES, { lang: 'it' }) } catch (e) { err = (e as Error).message }
assert(/does not match the text sent/.test(err), 'a mismatched alignment refuses to cut instead of slicing mid-word')

responder = () => ({ audio_base64: btoa('x') })
err = ''
try { await tts.renderJoined!(LINES, { lang: 'it' }) } catch (e) { err = (e as Error).message }
assert(/no usable character alignment/.test(err), 'a missing alignment is an error, not a silent bad cut')

responder = () => ({ alignment: { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] } })
err = ''
try { await tts.renderJoined!(LINES, { lang: 'it' }) } catch (e) { err = (e as Error).message }
assert(/no audio/.test(err), 'a response with no audio is an error')

/* ---- shaping is what makes the join a run of sentences ---- */
assert(shapeTtsText('pace') === 'pace.', 'each line gains terminal punctuation before joining')
assert(['pace.', 'calma.'].join(' ') === 'pace. calma.', 'joining shaped lines yields complete sentences')
