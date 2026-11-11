/* ElevenLabs text-to-speech. POSTs to the REST API and returns mp3 bytes, which
   the Studio decodes into a clip buffer.

   The request used to carry only `text`, `model_id` and two voice settings, on
   the stated assumption that "the multilingual model auto-detects the language
   from the text, so no language flag is needed". That assumption is what the
   POs heard as broken voices in GL-ANX 1.1, and then again on every Portuguese
   protocol:

     · language is inferred PER REQUEST, and a protocol is one request per line.
       A two-word fragment ("pace", "calma", "profumo dentro calma") is valid in
       two or three languages at once, so the engine placed it wherever it
       liked — a Brazilian accent on the Italian, English and Spanish words
       inside the Portuguese.
     · stability 0.5 is the loose end of the range: the same voice id came back
       as an audibly different person from take to take.
     · with no seed and no stitching, every line was an isolated,
       non-deterministic generation. Nothing held the voice's identity together
       across the ~100 calls that make up one protocol.

   All of those levers are used now. The last one — telling the engine the
   language outright instead of letting it guess — needs a model that accepts
   `language_code`, and `eleven_multilingual_v2` is the one model that does
   not. So the model is a SETTING (tts/model.ts, chosen in the Voice engine
   panel) rather than a constant, and the body is built from that model's
   capabilities.

   Nothing here trusts that table completely: a 422 that names a parameter
   drops it, writes it down and retries, so a model whose capabilities have
   moved costs one free round trip rather than a dead render queue.

   SECURITY: the key is read from the admin-only shared row and therefore lives
   in the browser — fine for a closed test, NOT for production. Move this call
   behind a server proxy (e.g. a Supabase Edge Function) before any public
   release. */

import type { TtsJoinedRender, TtsOptions, TtsProvider, TtsSpan } from './types'
import { ttsLanguage, ttsModelId } from './settings'
import { resolveVoiceId } from './voiceCatalog'
import { announceElevenLabsRequest } from './requestNotice'
import {
  DROPPABLE, languageCodeFor, learnUnsupported, offendingParam, stabilityFor,
  ttsModel, unsupported, type TtsModel,
} from './model'

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech'

/** The model in force right now — a setting, read at call time so that
    changing it in the panel takes effect on the next line without a reload. */
export function activeModel(): TtsModel {
  return ttsModel(ttsModelId())
}

/** Learned marker for "this model does not serve character alignment". Not a
    body parameter — the whole `/with-timestamps` endpoint is what fails — so
    it is kept in the same store under a name no parameter can collide with. */
const NO_TIMESTAMPS = 'with-timestamps'

/* ---- voice settings ----------------------------------------------------
   Tuned for IDENTITY, not expression. The archetype has to survive 100
   separate generations recognisably; a little flatness costs less than the
   voice changing person mid-protocol. */
const STABILITY = 0.8
const SIMILARITY_BOOST = 0.85
/** ElevenLabs accepts 0.7…1.2 on `voice_settings.speed`; outside it, 422. */
const SPEED_MIN = 0.7
const SPEED_MAX = 1.2

/* ---- text shaping ------------------------------------------------------ */

/**
 * Normalize a line the way ElevenLabs documents, before it is spoken.
 *
 * The PLAIN sheets write pauses as the ellipsis CHARACTER: "calore … morbidezza
 * … abbandono". Passed through verbatim that is one unpunctuated run of
 * ambiguous nouns — the worst possible input for prosody and for language
 * inference. It is why those lines read wrong. ElevenLabs' own docs use "..."
 * as the pause-and-weight device, so the single U+2026 glyph becomes three
 * ASCII dots with consistent spacing.
 *
 * Deliberately NOT `<break time=.../>` tags: the docs warn that break tags make
 * the model "speed up, or introduce additional noises or audio artifacts" —
 * the exact class of defect being removed here.
 */
export function shapeTtsText(raw: string): string {
  let t = raw.replace(/…/g, '...')
  t = t.replace(/\s*\.\.\.\s*/g, '... ') // "a … b" and "a...b" → "a... b"
  t = t.replace(/(?:\.\.\.\s*){2,}/g, '... ') // collapse doubled ellipses
  t = t.replace(/[ \t\r\n]+/g, ' ').trim()
  // A bare fragment with no terminal punctuation reads as an unfinished clause.
  // A full stop gives the engine sentence structure — and one more cue that
  // this is prose in a specific language rather than a loose token.
  if (t && !/[.!?,;:]$/.test(t)) t += '.'
  return t
}

/** Lines are joined with a single space. shapeTtsText has already given each
    one terminal punctuation, so the result is a run of complete sentences —
    "Sono al sicuro. Pace. Protetto. Calma." — which is exactly the form that
    measured Italian on every take where the words alone did not. */
const JOIN = ' '

/** base64 → bytes, without assuming a Buffer (this ships to the browser). */
function base64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

interface Alignment {
  characters?: string[]
  character_start_times_seconds?: number[]
  character_end_times_seconds?: number[]
}

/**
 * Turn per-character timings into one span per line.
 *
 * Each line's span is widened to the MIDPOINT of the silence between it and its
 * neighbour, so the cut lands in the gap rather than on a consonant, and the
 * natural breath before a whispered word is kept with it. The first line starts
 * at 0 and the last runs to the end of the audio, so the spans tile the whole
 * render and nothing is thrown away.
 */
function spansFromAlignment(shaped: string[], combined: string, a: Alignment): TtsSpan[] {
  const chars = a.characters ?? []
  const starts = a.character_start_times_seconds ?? []
  const ends = a.character_end_times_seconds ?? []
  if (chars.length !== starts.length || chars.length !== ends.length || !chars.length) {
    throw new Error('ElevenLabs returned no usable character alignment for the joined render.')
  }
  if (chars.join('') !== combined) {
    // the endpoint aligns against the text we sent; if that ever stops being
    // true, cutting on these indices would slice mid-word
    throw new Error('ElevenLabs alignment does not match the text sent — refusing to cut on it.')
  }
  const raw: TtsSpan[] = []
  let cursor = 0
  for (const frag of shaped) {
    const idx = combined.indexOf(frag, cursor)
    if (idx < 0) throw new Error(`Could not locate "${frag.slice(0, 24)}" in the joined text.`)
    const last = idx + frag.length - 1
    raw.push({ startSec: starts[idx], endSec: ends[last] })
    cursor = last + 1
  }
  const audioEnd = ends[ends.length - 1]
  return raw.map((s, i) => ({
    startSec: i === 0 ? 0 : (raw[i - 1].endSec + s.startSec) / 2,
    endSec: i === raw.length - 1 ? audioEnd : (s.endSec + raw[i + 1].startSec) / 2,
  }))
}

/** FNV-1a over the request's identity: the same line, voice, language and
    context always sample the same way, so re-rendering a clinical session
    reproduces it instead of quietly producing a new performance. */
function seedFrom(parts: (string | undefined)[]): number {
  let h = 0x811c9dc5
  for (const p of parts) {
    const s = p ?? ''
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    h ^= 0x2f // separator, so ('ab','c') and ('a','bc') differ
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0 // the API wants 0…4294967295
}

/**
 * ElevenLabs' failures are almost always about WHICH KEY is in force, not
 * about the request. Both of the ones this project hit — a voice belonging to
 * another workspace, and a key whose own credit cap is exhausted while the
 * account still shows plenty — read as nonsense until you know that.
 *
 * `dropped` names a parameter that was already removed and retried, so the
 * message can say the model refused it twice rather than blaming the body.
 */
function explainError(status: number, detail: string, model: TtsModel, dropped: string | null): string {
  const body = detail.toLowerCase()
  if (status === 404 && body.includes('voice_not_found')) {
    return `ElevenLabs 404: questa voce non esiste per la chiave in uso — appartiene a un altro account o workspace. Controlla il pannello Voce: l’account mostrato è quello che possiede la voce? (${detail.slice(0, 120)})`
  }
  if (status === 401 || body.includes('invalid_api_key')) {
    return `ElevenLabs 401: chiave non valida o revocata. (${detail.slice(0, 120)})`
  }
  if (status === 429 || body.includes('quota') || body.includes('credit') || body.includes('character_limit')) {
    return `ElevenLabs ${status}: credito esaurito PER QUESTA CHIAVE. Se l’account ha ancora crediti, la chiave ha un tetto proprio (impostato alla creazione) oppure è di un altro account — il pannello Voce mostra quale account e quanti caratteri restano. (${detail.slice(0, 120)})`
  }
  if (dropped) {
    return `ElevenLabs ${status}: il modello "${model.id}" ha rifiutato la richiesta anche senza "${dropped}". Prova un altro modello dal pannello Voce — Flash v2.5 è quello su cui questo catalogo è stato verificato. (${detail.slice(0, 160)})`
  }
  if (status === 422) {
    return `ElevenLabs 422: il modello "${model.id}" ha rifiutato un parametro della richiesta, e il nome del parametro non compare nella risposta — quindi non è stato possibile toglierlo e riprovare da soli. Cambia modello dal pannello Voce. (${detail.slice(0, 160)})`
  }
  return `ElevenLabs ${status}: ${detail.slice(0, 180)}`
}

export function createElevenLabsTts(apiKey: string, voiceId: string, voiceIdSecondary?: string): TtsProvider {
  let audio: HTMLAudioElement | null = null
  /** Object URL of the audition currently held, so it can always be released. */
  let current: string | null = null
  const release = (): void => {
    if (current) { URL.revokeObjectURL(current); current = null }
  }
  const secondary = voiceIdSecondary?.trim() || undefined

  function resolveVoice(opts?: TtsOptions): string {
    // explicit roster voice beats the primary/secondary pair; no secondary
    // configured → 'secondary' falls back to the primary (callers can check
    // hasSecondaryVoice to surface that in their notes)
    const chosen = opts?.voiceId?.trim() || (opts?.voice === 'secondary' && secondary ? secondary : voiceId)
    /* EVERY request goes out with a voice of the account connected now. A
       protocol saved under the other Good Loop account names that account's
       ids — sent as-is they are voice_not_found, or worse, a stranger's voice
       — so the id is followed to its twin here (voiceAccounts.ts), once, for
       every caller: the Studio, the Excel render, the datasheet render. */
    return resolveVoiceId(chosen).voice?.id ?? chosen
  }

  /**
   * Build the part of the body that is the same for a single line and for a
   * joined block, with every model-dependent field decided by the model.
   */
  function bodyFor(model: TtsModel, text: string, lang: string, seedParts: (string | undefined)[], opts?: TtsOptions): Record<string, unknown> {
    const c = model.caps
    const prev = opts?.previousText?.trim() ? shapeTtsText(opts.previousText) : undefined
    const next = opts?.nextText?.trim() ? shapeTtsText(opts.nextText) : undefined

    const settings: Record<string, unknown> = {
      stability: stabilityFor(model, STABILITY),
      similarity_boost: SIMILARITY_BOOST,
      style: 0, // >0 trades identity for drama — not what these protocols want
      use_speaker_boost: true,
    }
    // The engine's own speech rate, used in preference to stretching the audio
    // after the fact: a counting line ("uno, due, tre…") slowed here keeps its
    // natural articulation, where WSOLA only makes it longer.
    if (opts?.rate && Math.abs(opts.rate - 1) > 0.001) {
      settings.speed = +Math.min(SPEED_MAX, Math.max(SPEED_MIN, opts.rate)).toFixed(2)
    }

    const body: Record<string, unknown> = {
      text,
      model_id: model.id,
      voice_settings: settings,
      seed: opts?.seed ?? seedFrom(seedParts),
      /* Normalization is only ever asked for once the language is ENFORCED.
         It expands "1, 2, 3" into number words, and asking for that while the
         model is still guessing the language is how a counting line ends up
         counting in Portuguese. */
      apply_text_normalization: c.languageCode && c.textNormalization ? 'on' : 'auto',
    }
    /* THE LINE THIS WHOLE FILE IS ABOUT. On every model but multilingual_v2
       the language is stated instead of inferred, so "calma" in a Portuguese
       protocol is Portuguese and "pace" in an Italian one is Italian. */
    if (c.languageCode && lang) body.language_code = languageCodeFor(lang)
    /* Request stitching. Two jobs: it keeps prosody continuous across the many
       separate generations of one protocol, AND it lends a short fragment the
       surrounding words it needs to be placed in the right language. */
    if (c.stitching && prev) body.previous_text = prev
    if (c.stitching && next) body.next_text = next
    return body
  }

  /**
   * POST, and treat a 422 that names a parameter as information.
   *
   * The capability table in tts/model.ts is a reading of ElevenLabs' docs,
   * and those have been wrong about this project's own models before. Rather
   * than let a stale row stop a render, the named parameter is dropped,
   * written down for next time, and the request goes again. A 422 costs no
   * credits, so the whole recovery is free; it happens once per browser per
   * model, and after that the parameter is simply never sent.
   */
  async function post(url: string, body: Record<string, unknown>, model: TtsModel, accept?: string): Promise<Response> {
    const sent: Record<string, unknown> = { ...body }
    for (const p of DROPPABLE) if (unsupported(model.id, p)) delete sent[p]

    const headers: Record<string, string> = { 'xi-api-key': apiKey, 'Content-Type': 'application/json' }
    if (accept) headers.Accept = accept
    const send = (b: Record<string, unknown>) => fetch(url, { method: 'POST', headers, body: JSON.stringify(b) })

    let res = await send(sent)
    if (res.ok) return res

    const detail = await res.text().catch(() => '')
    if (res.status === 422) {
      const bad = offendingParam(detail, sent)
      if (bad) {
        learnUnsupported(model.id, bad)
        delete sent[bad]
        res = await send(sent)
        if (res.ok) return res
        throw new Error(explainError(res.status, await res.text().catch(() => ''), model, bad))
      }
    }
    throw new Error(explainError(res.status, detail, model, null))
  }

  async function fetchBytes(text: string, opts?: TtsOptions): Promise<ArrayBuffer> {
    const model = activeModel()
    const voice = resolveVoice(opts)
    const lang = (opts?.lang ?? ttsLanguage()).trim()
    const shaped = shapeTtsText(text)
    const prev = opts?.previousText?.trim() ? shapeTtsText(opts.previousText) : undefined
    const next = opts?.nextText?.trim() ? shapeTtsText(opts.nextText) : undefined
    const body = bodyFor(model, shaped, lang, [voice, lang, shaped, prev, next], opts)

    announceElevenLabsRequest(shaped.length)
    const res = await post(`${ENDPOINT}/${voice}`, body, model, 'audio/mpeg')
    return res.arrayBuffer()
  }

  /** Speak a block of lines as ONE utterance and report where each landed. */
  async function fetchJoined(texts: string[], opts?: TtsOptions): Promise<TtsJoinedRender> {
    const model = activeModel()
    if (!model.caps.timestamps || unsupported(model.id, NO_TIMESTAMPS)) {
      throw new Error(`Il modello "${model.id}" non restituisce i tempi per carattere, quindi un blocco non si può tagliare. Scegli un altro modello dal pannello Voce (Flash v2.5 lo fa).`)
    }
    const shaped = texts.map(shapeTtsText).filter((t) => t.length > 0)
    if (shaped.length !== texts.length) throw new Error('A line in the block is empty.')
    const voice = resolveVoice(opts)
    const lang = (opts?.lang ?? ttsLanguage()).trim()
    const combined = shaped.join(JOIN)
    const prev = opts?.previousText?.trim() ? shapeTtsText(opts.previousText) : undefined
    const next = opts?.nextText?.trim() ? shapeTtsText(opts.nextText) : undefined
    const body = bodyFor(model, combined, lang, [voice, lang, combined, prev, next], opts)

    announceElevenLabsRequest(combined.length, shaped.length)
    let res: Response
    try {
      res = await post(`${ENDPOINT}/${voice}/with-timestamps`, body, model, undefined)
    } catch (e) {
      /* The endpoint itself refused, not one parameter of it. If the model is
         the reason, remember that: the Studio reads canRenderJoined and will
         stop grouping lines into blocks, which is slower and costs more but
         at least renders. It is said out loud because a protocol whose
         one-word lines are rendered alone is the defect the POs reported. */
      const m = (e as Error).message
      if (/404|405|422|not supported|alignment/i.test(m)) learnUnsupported(model.id, NO_TIMESTAMPS)
      throw new Error(`${m} — il modello "${model.id}" non sembra servire i tempi per carattere. Scegli Flash v2.5 dal pannello Voce.`)
    }
    const json = (await res.json()) as { audio_base64?: string; alignment?: Alignment }
    if (!json.audio_base64) throw new Error('ElevenLabs returned no audio for the joined block.')
    return {
      bytes: base64ToBytes(json.audio_base64),
      spans: spansFromAlignment(shaped, combined, json.alignment ?? {}),
    }
  }

  return {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    canRender: true,
    hasSecondaryVoice: Boolean(secondary),
    /* A getter, not a value: the model is a setting now, and a provider made
       before the operator changed it must not keep promising what the old
       model could do. */
    get canRenderJoined() {
      const m = activeModel()
      return m.caps.timestamps && !unsupported(m.id, NO_TIMESTAMPS)
    },
    async render(text: string, opts?: TtsOptions) {
      return fetchBytes(text, opts)
    },
    async renderJoined(texts: string[], opts?: TtsOptions) {
      return fetchJoined(texts, opts)
    },
    async speak(text: string, opts?: TtsOptions) {
      const bytes = await fetchBytes(text, opts)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
      /* Revoking only on `ended` leaked an entire mp3 per audition that was
         stopped or replaced mid-play — and auditioning repeatedly is exactly
         how the Studio is used. The previous blob is released whatever ends
         it: finishing, being replaced, or stop(). */
      release()
      audio = new Audio(url)
      current = url
      audio.onended = release
      await audio.play()
    },
    stop() {
      audio?.pause()
      release()
    },
  }
}
