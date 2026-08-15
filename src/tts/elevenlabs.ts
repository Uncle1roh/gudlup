/* ElevenLabs text-to-speech. POSTs to the REST API and returns mp3 bytes, which
   the Studio decodes into a clip buffer.

   The request used to carry only `text`, `model_id` and two voice settings, on
   the stated assumption that "the multilingual model auto-detects the language
   from the text, so no language flag is needed". That assumption is what the
   POs heard as broken voices in GL-ANX 1.1:

     · language is inferred PER REQUEST, and a protocol is one request per line.
       A two-word Italian fragment ("pace", "calma", "profumo dentro calma") is
       also valid Portuguese or English, so the engine placed it in the wrong
       language — a Brazilian accent, or "pace" read as the English word.
     · stability 0.5 is the loose end of the range: the same voice id came back
       as an audibly different person from take to take.
     · with no seed and no stitching, every line was an isolated,
       non-deterministic generation. Nothing held the voice's identity together
       across the ~100 calls that make up one protocol.

   All four levers are now used. See MODEL_CAPS for what is model-dependent —
   notably `language_code`, which multilingual_v2 REJECTS, so on that model the
   language is steered through the text and its neighbours instead.

   SECURITY: the key is read from a VITE_ env var and therefore ships to the
   browser — fine for a closed test, NOT for production. Move this call behind a
   server proxy (e.g. a Supabase Edge Function) before any public release. */

import type { TtsJoinedRender, TtsOptions, TtsProvider, TtsSpan } from './types'
import { ttsLanguage } from './settings'

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech'

/* ---- model -------------------------------------------------------------
   ONE constant chooses the engine. Capabilities differ per model and the
   request body has to match, so they are declared together: sending
   `language_code` to multilingual_v2 is a 422, and the turbo/flash models
   reject `apply_text_normalization: 'on'`.

   Keep multilingual_v2 until the POs re-audition the archetypes: the
   turbo/flash/v3 models DO accept a hard language flag, but they render the
   voices with a different character than the ones already approved. */
export const MODEL_ID = 'eleven_multilingual_v2'

interface ModelCaps {
  /** Accepts `language_code` (ISO 639-1) to ENFORCE the language rather than
      infer it. False on multilingual_v2 — the reason the mitigations below
      (stitching, shaped text, terminal punctuation) carry the load instead. */
  languageCode: boolean
  /** Accepts `apply_text_normalization: 'on'` — spells digits, dates and
      currency out loud instead of guessing at them. Only ever REQUESTED when
      the language is also being enforced: normalization expands "1, 2, 3" into
      number WORDS, and asking for that while the model is still guessing the
      language is how a counting line ends up counting in Portuguese. Left at
      'auto' otherwise. */
  textNormalization: boolean
  /** Serves `/with-timestamps` (character-level alignment), which is what lets
      a block of short lines be spoken as one utterance and cut back apart. */
  timestamps: boolean
  /** Accepts `previous_text`/`next_text`. v3 rejects them outright ("not yet
      supported"), so adopting it would LOSE the stitching that fixed the
      counting line. */
  stitching: boolean
}

const MODEL_CAPS: Record<string, ModelCaps> = {
  eleven_multilingual_v2: { languageCode: false, textNormalization: true, timestamps: true, stitching: true },
  eleven_turbo_v2_5: { languageCode: true, textNormalization: false, timestamps: true, stitching: true },
  eleven_flash_v2_5: { languageCode: true, textNormalization: false, timestamps: true, stitching: true },
  eleven_v3: { languageCode: true, textNormalization: true, timestamps: false, stitching: false },
}

function caps(): ModelCaps {
  return MODEL_CAPS[MODEL_ID] ?? { languageCode: false, textNormalization: false, timestamps: false, stitching: false }
}

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

/** BCP-47 → ISO 639-1 ('pt-BR' → 'pt'), which is what `language_code` wants. */
function iso639(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0]
}

/**
 * Normalize a line the way ElevenLabs documents, before it is spoken.
 *
 * The PLAIN sheets write pauses as the ellipsis CHARACTER: "calore … morbidezza
 * … abbandono". Passed through verbatim that is one unpunctuated run of
 * ambiguous nouns — the worst possible input for prosody and, on
 * multilingual_v2, for language inference. It is why those lines read wrong.
 * ElevenLabs' own docs use "..." as the pause-and-weight device, so the single
 * U+2026 glyph becomes three ASCII dots with consistent spacing.
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
 */
function explainError(status: number, detail: string): string {
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
  if (status === 422) {
    // the shape of the body is model-dependent; say so, because this is the
    // error a model swap produces first
    return `ElevenLabs 422: il modello "${MODEL_ID}" ha rifiutato un parametro della richiesta. Se il modello è stato cambiato di recente, controlla MODEL_CAPS in src/tts/elevenlabs.ts — language_code non è accettato da multilingual_v2, e apply_text_normalization:'on' non è accettato dai modelli turbo/flash. (${detail.slice(0, 160)})`
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
    if (opts?.voiceId?.trim()) return opts.voiceId.trim()
    return opts?.voice === 'secondary' && secondary ? secondary : voiceId
  }

  async function fetchBytes(text: string, opts?: TtsOptions): Promise<ArrayBuffer> {
    const c = caps()
    const voice = resolveVoice(opts)
    const lang = (opts?.lang ?? ttsLanguage()).trim()
    const shaped = shapeTtsText(text)
    const prev = opts?.previousText?.trim() ? shapeTtsText(opts.previousText) : undefined
    const next = opts?.nextText?.trim() ? shapeTtsText(opts.nextText) : undefined

    const settings: Record<string, unknown> = {
      stability: STABILITY,
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
      text: shaped,
      model_id: MODEL_ID,
      voice_settings: settings,
      seed: opts?.seed ?? seedFrom([voice, lang, shaped, prev, next]),
      apply_text_normalization: c.languageCode && c.textNormalization ? 'on' : 'auto',
    }
    // Only when the model accepts it — otherwise this is a 422.
    if (c.languageCode && lang) body.language_code = iso639(lang)
    // Request stitching. Two jobs: it keeps prosody continuous across the many
    // separate generations of one protocol, AND it lends a short fragment the
    // surrounding words it needs to be placed in the right language.
    if (c.stitching && prev) body.previous_text = prev
    if (c.stitching && next) body.next_text = next

    const res = await fetch(`${ENDPOINT}/${voice}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(explainError(res.status, detail))
    }
    return res.arrayBuffer()
  }

  /** Speak a block of lines as ONE utterance and report where each landed. */
  async function fetchJoined(texts: string[], opts?: TtsOptions): Promise<TtsJoinedRender> {
    const c = caps()
    if (!c.timestamps) throw new Error(`Model "${MODEL_ID}" has no character alignment — cannot render a joined block.`)
    const shaped = texts.map(shapeTtsText).filter((t) => t.length > 0)
    if (shaped.length !== texts.length) throw new Error('A line in the block is empty.')
    const voice = resolveVoice(opts)
    const lang = (opts?.lang ?? ttsLanguage()).trim()
    const combined = shaped.join(JOIN)
    const prev = opts?.previousText?.trim() ? shapeTtsText(opts.previousText) : undefined
    const next = opts?.nextText?.trim() ? shapeTtsText(opts.nextText) : undefined

    const body: Record<string, unknown> = {
      text: combined,
      model_id: MODEL_ID,
      voice_settings: {
        stability: STABILITY,
        similarity_boost: SIMILARITY_BOOST,
        style: 0,
        use_speaker_boost: true,
        ...(opts?.rate && Math.abs(opts.rate - 1) > 0.001
          ? { speed: +Math.min(SPEED_MAX, Math.max(SPEED_MIN, opts.rate)).toFixed(2) }
          : {}),
      },
      seed: opts?.seed ?? seedFrom([voice, lang, combined, prev, next]),
      apply_text_normalization: c.languageCode && c.textNormalization ? 'on' : 'auto',
    }
    if (c.languageCode && lang) body.language_code = iso639(lang)
    if (c.stitching && prev) body.previous_text = prev
    if (c.stitching && next) body.next_text = next

    const res = await fetch(`${ENDPOINT}/${voice}/with-timestamps`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(explainError(res.status, detail))
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
    canRenderJoined: caps().timestamps,
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
