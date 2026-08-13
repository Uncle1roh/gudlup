/* Does the GL-ANX 1.1 voice fix actually work? Measure it, don't assume it.

   For every line the POs reported as wrong, this synthesizes TWICE — once with
   the request the app used to send, once through the real shipped code path —
   then sends each result to ElevenLabs' speech-to-text, which auto-detects the
   language. That turns "the voice has a Brazilian accent" into a number.

   The counting line also reports per-word timings, so "a little too fast when
   it says 1, 2, 3, 4, 5" becomes seconds instead of an impression.

   Run: npx esbuild tools/check-voice-drift.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/d.mjs && node <tmp>/d.mjs <api-key>

   Costs a few hundred ElevenLabs credits per run. It makes REAL billed calls. */

import { createElevenLabsTts } from '../src/tts/elevenlabs'

const key = process.argv[2]
if (!key) { console.error('usage: node d.mjs <api-key>'); process.exit(1) }

const MATERNAL = 'aYBXyupCnZqrSVuPsR5i'
const PATERNAL = 'Zd5ZRxsNxAoZHMRh5hdm'
const ASMR_F = 'ZRvGXr3q13HhP63mThiX'

interface Case {
  at: string
  lane: string
  voiceId: string
  text: string
  previousText?: string
  nextText?: string
  reported: string
}

/* Exactly the lines from the PO report, in the lanes they belong to. The
   neighbours are what SoundStudio's voiceContext() would hand the provider:
   the nearest voice lines in the protocol by time. */
const CASES: Case[] = [
  { at: '3:10', lane: 'VOX-L Materna SX', voiceId: MATERNAL, text: '1, 2, 3, 4, 5',
    previousText: 'senti il corpo che si lascia andare', nextText: 'ora sei completamente al sicuro',
    reported: 'a little too fast' },
  { at: '8:12', lane: 'VOX-R Paterna DX', voiceId: PATERNAL, text: 'non devi fare nulla, solo lasciati andare',
    previousText: 'il respiro trova il suo ritmo', nextText: 'lascia andare, lascia andare tutto',
    reported: 'phrase not good' },
  { at: '9:10', lane: 'VOX-R Paterna DX', voiceId: PATERNAL, text: 'lascia andare, lascia andare tutto',
    previousText: 'non devi fare nulla, solo lasciati andare', nextText: 'calore … morbidezza … abbandono',
    reported: 'phrase not good' },
  { at: '9:26', lane: 'VOX-R Paterna DX', voiceId: PATERNAL, text: 'calore … morbidezza … abbandono',
    previousText: 'lascia andare, lascia andare tutto', nextText: 'ogni muscolo si distende',
    reported: 'phrase not good — the "…" hypothesis' },
  { at: 'ECO', lane: 'VOX-R Paterna ECO', voiceId: PATERNAL, text: 'calore … sole … pelle',
    previousText: 'ogni muscolo si distende', nextText: 'profumo dentro calma',
    reported: 'voice changes from the chosen archetype' },
  { at: 'ECO', lane: 'VOX-R Paterna ECO', voiceId: PATERNAL, text: 'profumo dentro calma',
    previousText: 'calore … sole … pelle', nextText: 'il corpo riposa',
    reported: 'CLEAR BRAZILIAN ACCENT' },
  { at: '12:00', lane: 'VOX-C Sussurro LOOP', voiceId: ASMR_F, text: 'sono al sicuro',
    previousText: 'il corpo riposa', nextText: 'pace',
    reported: 'wrong voice' },
  { at: '12:04', lane: 'VOX-C Sussurro LOOP', voiceId: ASMR_F, text: 'pace',
    previousText: 'sono al sicuro', nextText: 'protetto',
    reported: 'read like "rhythm" in ENGLISH' },
  { at: '12:09', lane: 'VOX-C Sussurro LOOP', voiceId: ASMR_F, text: 'protetto',
    previousText: 'pace', nextText: 'calma',
    reported: 'seems correct' },
  { at: '12:14', lane: 'VOX-C Sussurro LOOP', voiceId: ASMR_F, text: 'calma',
    previousText: 'protetto', nextText: 'sono al sicuro',
    reported: 'STRONG BRAZILIAN ACCENT' },
]

/* ---- the request the app USED to send (the regression baseline) ---- */
async function renderOld(text: string, voiceId: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text, // raw, ellipsis character and all
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  if (!res.ok) throw new Error(`old ${res.status}: ${(await res.text()).slice(0, 140)}`)
  return res.arrayBuffer()
}

/* ---- speech-to-text: the objective judge ---- */
interface Stt { language_code?: string; language_probability?: number; text?: string; words?: { text: string; start?: number; end?: number; type?: string }[] }
async function transcribe(bytes: ArrayBuffer): Promise<Stt | { error: string }> {
  const fd = new FormData()
  fd.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'clip.mp3')
  fd.append('model_id', 'scribe_v1')
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': key! }, body: fd,
  })
  if (!res.ok) return { error: `stt ${res.status}: ${(await res.text()).slice(0, 120)}` }
  return (await res.json()) as Stt
}

function verdict(s: Stt | { error: string }): string {
  if ('error' in s) return s.error
  const lc = (s.language_code ?? '??').toLowerCase()
  const p = s.language_probability !== undefined ? ` p=${s.language_probability.toFixed(2)}` : ''
  const ok = lc.startsWith('it')
  return `${ok ? 'ita' : `>>> ${lc.toUpperCase()} <<<`}${p}  "${(s.text ?? '').trim()}"`
}
const isIt = (s: Stt | { error: string }) => !('error' in s) && (s.language_code ?? '').toLowerCase().startsWith('it')

const tts = createElevenLabsTts(key, MATERNAL)
let oldWrong = 0, newWrong = 0, counted = 0
const rows: string[] = []

for (const c of CASES) {
  process.stderr.write(`  … ${c.lane} "${c.text.slice(0, 28)}"\n`)
  let oldV = 'skipped', newV = 'skipped'
  let oldOk = true, newOk = true
  try {
    const a = await transcribe(await renderOld(c.text, c.voiceId))
    oldV = verdict(a); oldOk = isIt(a)
  } catch (e) { oldV = (e as Error).message }
  try {
    const bytes = await tts.render(c.text, { lang: 'it', voiceId: c.voiceId, previousText: c.previousText, nextText: c.nextText })
    const b = await transcribe(bytes)
    newV = verdict(b); newOk = isIt(b)
    // the counting line: per-word timings answer "too fast" with numbers
    if (c.text.startsWith('1,') && !('error' in b) && b.words?.length) {
      const w = b.words.filter((x) => x.type !== 'spacing' && x.start !== undefined)
      if (w.length > 1) {
        const span = (w[w.length - 1].end ?? 0) - (w[0].start ?? 0)
        rows.push(`         timings: ${w.map((x) => `${x.text}@${(x.start ?? 0).toFixed(2)}s`).join(' ')}  → ${span.toFixed(2)} s for the count`)
      }
    }
  } catch (e) { newV = (e as Error).message }
  if (!oldOk) oldWrong++
  if (!newOk) newWrong++
  counted++
  rows.push(`${c.at.padEnd(6)} ${c.lane.padEnd(20)} "${c.text}"`)
  rows.push(`         PO said : ${c.reported}`)
  rows.push(`         OLD     : ${oldV}`)
  rows.push(`         NEW     : ${newV}`)
  rows.push('')
}

console.log('=== detected language per line (ElevenLabs scribe_v1, no language hint) ===\n')
console.log(rows.join('\n'))
console.log('=== summary ===')
console.log(`lines tested                       : ${counted}`)
console.log(`detected as NOT Italian — OLD path : ${oldWrong}`)
console.log(`detected as NOT Italian — NEW path : ${newWrong}`)
console.log('')

/* ---- the LOOP block, spoken whole and cut apart ----
   The residual failures above are all ONE-WORD lines, and no model fixes them:
   isolated "pace"/"calma" came back non-Italian on 0-of-3 takes across
   multilingual_v2 (short and long stitching), turbo_v2_5 and flash_v2_5 with
   language_code=it, and v3. The fix is not to ask for one word at a time.
   This renders the block through the shipped renderJoined() and checks that
   each line's spoken words really do fall inside the span we cut for it. */
console.log('=== LOOP block as ONE utterance, then cut apart ===')
const BLOCK = ['sono al sicuro', 'pace', 'protetto', 'calma']
try {
  const joined = await tts.renderJoined!(BLOCK, { lang: 'it', voiceId: ASMR_F })
  const s = await transcribe(joined.bytes)
  if ('error' in s) {
    console.log(`  ${s.error}`)
  } else {
    const lc = (s.language_code ?? '??').toLowerCase()
    console.log(`  block detected: ${lc.startsWith('it') ? 'ita' : `>>> ${lc.toUpperCase()} <<<`} p=${(s.language_probability ?? 0).toFixed(2)}  "${(s.text ?? '').trim()}"`)
    const words = (s.words ?? []).filter((w) => w.type !== 'spacing' && w.start !== undefined)
    let allIn = true
    for (let i = 0; i < BLOCK.length; i++) {
      const span = joined.spans[i]
      const inSpan = words
        .filter((w) => { const mid = (w.start! + (w.end ?? w.start!)) / 2; return mid >= span.startSec && mid <= span.endSec })
        .map((w) => w.text.replace(/[.,!?]/g, '').toLowerCase())
      const want = BLOCK[i].split(/\s+/).map((w) => w.toLowerCase())
      const ok = inSpan.length === want.length && want.every((w) => inSpan.includes(w))
      if (!ok) allIn = false
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} "${BLOCK[i]}" → ${span.startSec.toFixed(2)}-${span.endSec.toFixed(2)}s contains [${inSpan.join(' ')}]`)
    }
    console.log(allIn
      ? '  → every line sits cleanly inside its own slice; the cuts land in the silence.'
      : '  → a slice does not match its line: do NOT ship this cut.')
  }
} catch (e) {
  console.log(`  block render failed: ${(e as Error).message}`)
}
console.log('')
console.log('Caveat worth stating: speech-to-text detects the LANGUAGE of the words,')
console.log('which catches "pace"-as-English and pt-BR pronunciation, but a native')
console.log('Italian speaker with a mild Brazilian colouring can still transcribe as')
console.log('Italian. A clean sweep here is necessary, not sufficient — the POs still')
console.log('have to listen.')
