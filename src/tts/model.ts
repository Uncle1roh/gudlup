/* ============================================================================
   Good Loop — WHICH ElevenLabs model speaks, and what that model can take

   The model used to be one hard-coded constant with a comment saying it could
   not be changed until the POs re-auditioned the archetypes. That made every
   model question a code change, a build and a deploy — and it is why the
   Portuguese protocols spent months on `eleven_multilingual_v2`, the one
   model in the whole catalogue that REFUSES to be told what language the text
   is in.

   So the model is a setting now (Voice engine panel, stored beside the key and
   shared through `app_settings`), and this file is what the setting may say.

   ---------------------------------------------------------------------------
   WHY THE CAPABILITIES ARE WRITTEN DOWN

   ElevenLabs' request body is not the same from model to model, and the API
   does not advertise the differences: `GET /v1/models` returns
   `can_do_text_to_speech`, `can_use_style`, `languages` and little else —
   nothing about `language_code`, nothing about character alignment, nothing
   about `previous_text`. Send a parameter the model does not take and you get
   a 422 and no audio.

   Each entry below therefore says what this project has OBSERVED, and the
   client treats it as a first guess rather than as truth: a 422 that names a
   parameter drops that parameter, remembers it (`learnUnsupported`) and
   retries. A table that is wrong costs one free round trip, once per browser,
   instead of a dead render queue. That is what makes changing the model in a
   dropdown a safe thing for a non-programmer to do.

   ---------------------------------------------------------------------------
   THE ONE THAT MATTERS: language_code

   A protocol is one request per line, and the language is inferred PER
   REQUEST. "calma" is Italian, Portuguese and Spanish; "pace" is Italian and
   English. On a model that cannot be told the language, the engine guesses
   every line on its own — which is precisely the Brazilian accent on the
   Italian lines, and the foreign words inside the Portuguese ones, that the
   POs have reported from the beginning.

   Every model here except multilingual_v2 accepts `language_code`. That is
   the reason to leave multilingual_v2 behind, and the reason this file exists.
   ============================================================================ */

import type { VoiceLang } from './voiceLang'

export type TtsModelId =
  | 'eleven_flash_v2_5'
  | 'eleven_v3'
  | 'eleven_v4'
  | 'eleven_v4_turbo'
  | 'eleven_multilingual_v2'

export interface ModelCaps {
  /** Accepts `language_code` (ISO 639-1) to ENFORCE the language instead of
      inferring it per request. False only on multilingual_v2, which answers
      422 — the whole reason to move off it. */
  languageCode: boolean
  /** Accepts `apply_text_normalization: 'on'` — digits, dates and currency
      spelled out loud instead of guessed at. Only ever asked for when the
      language is ALSO enforced: normalization turns "1, 2, 3" into number
      words, and asking for that while the model is still guessing the
      language is how a counting line ends up counting in Portuguese. */
  textNormalization: boolean
  /** Serves `/with-timestamps` (character-level alignment), which is what lets
      a block of one-word lines be spoken as ONE utterance and cut back apart.
      Without it the Studio has to ask for "pace" on its own, and no model gets
      that right. See TtsProvider.renderJoined. */
  timestamps: boolean
  /** Accepts `previous_text` / `next_text`. Keeps prosody continuous across
      the ~100 separate generations of one protocol, and lends a short fragment
      the surrounding words it needs to be placed in the right language. */
  stitching: boolean
  /** `voice_settings.stability` as a DIAL (null) or as a three-way switch.
      The v3/v4 family takes only 0.0 / 0.5 / 1.0 and rounds anything else to
      the nearest — so the value is rounded here instead, where it can be
      seen, rather than silently somewhere in São Paulo. */
  stabilitySteps: number[] | null
}

export interface TtsModel {
  id: TtsModelId
  /** What the Voice panel shows. */
  label: string
  /** One line of Italian saying what choosing this costs or buys. */
  what: string
  caps: ModelCaps
}

/**
 * The models worth offering, best first.
 *
 * Flash v2.5 leads because it is the one that fits THIS workload. The
 * protocols are made of very short lines — "pace", "calma", "sono al sicuro" —
 * and flash takes a hard `language_code`, serves character alignment, accepts
 * stitching and keeps stability as a continuous dial, which is what holds one
 * archetype together over a hundred generations.
 *
 * v3 and v4 are the expressive family. They are listed because the founders
 * asked for them and because they may well sound better once the archetypes
 * are re-auditioned — but two of their properties are a poor fit here and are
 * written down rather than discovered later: stability is a three-way switch
 * rather than a dial, and ElevenLabs' own guidance is that prompts under ~250
 * characters are more likely to come out unstable. Every voice line in this
 * catalogue is far under 250 characters.
 */
export const TTS_MODELS: TtsModel[] = [
  {
    id: 'eleven_flash_v2_5',
    label: 'Flash v2.5 — consigliato',
    what: 'Accetta la lingua imposta, i tempi per carattere e il contesto delle battute vicine. Pensato per battute brevi: è quello che fa il lavoro di questo catalogo.',
    caps: { languageCode: true, textNormalization: true, timestamps: true, stitching: true, stabilitySteps: null },
  },
  {
    id: 'eleven_v4',
    label: 'Eleven v4 — il più recente',
    what: 'Il modello di punta di ElevenLabs, oltre 90 lingue. Più espressivo; la stabilità però non è più una manopola ma tre posizioni, e sotto i 250 caratteri ElevenLabs stessa avverte che può essere incostante. Da riascoltare con i PO prima di pubblicare.',
    caps: { languageCode: true, textNormalization: true, timestamps: true, stitching: true, stabilitySteps: [0, 0.5, 1] },
  },
  {
    id: 'eleven_v4_turbo',
    label: 'Eleven v4 Turbo',
    what: 'Come v4, ottimizzato per la bassa latenza. Utile per l’anteprima, non per il render finale.',
    caps: { languageCode: true, textNormalization: true, timestamps: true, stitching: true, stabilitySteps: [0, 0.5, 1] },
  },
  {
    id: 'eleven_v3',
    label: 'Eleven v3 — generazione precedente',
    what: 'Superato da v4. Stessi limiti: stabilità a tre posizioni e incostanza sulle battute corte.',
    caps: { languageCode: true, textNormalization: true, timestamps: true, stitching: true, stabilitySteps: [0, 0.5, 1] },
  },
  {
    id: 'eleven_multilingual_v2',
    label: 'Multilingual v2 — storico (non impone la lingua)',
    what: 'Il modello con cui sono state approvate le voci. È l’unico che RIFIUTA di farsi dire la lingua: ogni battuta viene indovinata da sola, ed è da lì che vengono l’accento brasiliano sull’italiano e le parole straniere nel portoghese. Tienilo solo per confrontare una voce con un render vecchio.',
    caps: { languageCode: false, textNormalization: true, timestamps: true, stitching: true, stabilitySteps: null },
  },
]

/** What ships, and what an unreadable or unknown setting falls back to. */
export const DEFAULT_TTS_MODEL: TtsModelId = 'eleven_flash_v2_5'

export function ttsModel(id: string | undefined): TtsModel {
  return TTS_MODELS.find((m) => m.id === id) ?? TTS_MODELS.find((m) => m.id === DEFAULT_TTS_MODEL)!
}

/* ---- the language code -------------------------------------------------
   ElevenLabs wants ISO 639-1 ('pt-BR' → 'pt'), and does NOT distinguish
   Brazilian from European Portuguese here: its own language list is one
   entry, "Portuguese (pt)". The accent comes from the VOICE, which is why
   the catalogue carries a Brazilian and an Italian voice for every archetype
   (voiceCatalog.voiceLangOf) and the Studio picks by language. Sending
   'pt-BR' is not more precise, it is a code the API does not know — and an
   unknown code is silently ignored, i.e. back to guessing. */
export function languageCodeFor(lang: VoiceLang | string): string {
  return lang.toLowerCase().split(/[-_]/)[0]
}

/** Round a wanted stability onto what the model actually accepts. */
export function stabilityFor(model: TtsModel, wanted: number): number {
  const steps = model.caps.stabilitySteps
  if (!steps) return wanted
  return steps.reduce((best, s) => (Math.abs(s - wanted) < Math.abs(best - wanted) ? s : best), steps[0])
}

/* ============================================================================
   What a model has PROVED it cannot take

   The table above is this project's best reading of ElevenLabs' docs and of
   what it has seen. It will go out of date — the docs did, twice, which is how
   v3 ended up marked as having no character alignment long after it grew some.

   So a 422 naming a parameter is treated as information rather than as a
   failure: the parameter is dropped, written down here, and the request is
   retried. Kept in localStorage so it is learned once per browser instead of
   once per page load, and keyed by model so switching back does not inherit
   another model's scars.
   ============================================================================ */

const LEARNED_KEY = 'gl.tts.unsupported'

type Learned = Record<string, string[]>

function readLearned(): Learned {
  try {
    const raw = localStorage.getItem(LEARNED_KEY)
    if (!raw) return {}
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object') return {}
    const out: Learned = {}
    for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
      if (Array.isArray(list)) out[k] = list.filter((x): x is string => typeof x === 'string')
    }
    return out
  } catch {
    return {} // no storage (a test, a node tool), or nonsense in it
  }
}

/** True when this model has already answered 422 over this parameter. */
export function unsupported(modelId: string, param: string): boolean {
  return (readLearned()[modelId] ?? []).includes(param)
}

export function learnUnsupported(modelId: string, param: string): void {
  const all = readLearned()
  const list = all[modelId] ?? []
  if (list.includes(param)) return
  all[modelId] = [...list, param]
  try { localStorage.setItem(LEARNED_KEY, JSON.stringify(all)) } catch { /* no storage */ }
}

/** Everything this model has been found to refuse — for the Voice panel, so
    the operator can see WHY a chosen model is not doing what it promises. */
export function learnedFor(modelId: string): string[] {
  return readLearned()[modelId] ?? []
}

/** Forget what was learned about a model (it was fixed upstream, or the
    failure was really a bad key). */
export function forgetLearned(modelId?: string): void {
  try {
    if (!modelId) { localStorage.removeItem(LEARNED_KEY); return }
    const all = readLearned()
    delete all[modelId]
    localStorage.setItem(LEARNED_KEY, JSON.stringify(all))
  } catch { /* no storage */ }
}

/** The request parameters a 422 can be about, longest name first so that
    "previous_text" is not matched as "text". */
export const DROPPABLE = [
  'apply_text_normalization',
  'previous_request_ids',
  'next_request_ids',
  'previous_text',
  'language_code',
  'next_text',
  'seed',
] as const

/**
 * Which parameter an error body is complaining about, if any.
 *
 * ElevenLabs phrases these several ways — "language_code is not supported for
 * this model", a pydantic `{"detail":{"loc":["body","previous_text"]}}`, or
 * prose naming the field — so this looks for the field NAME anywhere in the
 * body rather than trying to parse a shape that is not stable.
 */
export function offendingParam(detail: string, body: Record<string, unknown>): string | null {
  const low = detail.toLowerCase()
  for (const p of DROPPABLE) if (low.includes(p) && p in body) return p
  return null
}
