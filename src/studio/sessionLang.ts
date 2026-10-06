/* ============================================================================
   Good Loop — one Studio session, spoken in several languages

   The Studio works in ONE language at a time: the voice clips show and speak
   that language's text in that language's voice. Everything else — tracks,
   timing, levels, fx, EQ, the pool draws, fades — is the SAME session in
   every language. There is one session per duration, and it carries every
   language together.

   How that is held without touching the rest of the Studio:

     · the clip's live fields (`text`, `ttsPath`/`ttsText`, `params.voiceId`…)
       are always the WORKING language's — every existing code path (preview,
       synthesis, the inspector, the overlap planner) reads those and keeps
       working unchanged;
     · the per-language maps (`textByLang`, `ttsByLang`, `voiceByLang`) hold
       the others. Switching folds the live fields into the maps ("stash") and
       lifts the other language out of them ("load");
     · a SAVED session is canonical: its live fields are the ITALIAN ones,
       which is what every session saved before this module existed holds, and
       what any older reader expects.

   A saved session from before has `text` (Italian) and nothing else. Opened
   in Portuguese, each clip finds its Portuguese in the stored timeline — by
   `sourceId` (clip_id / affirmation id) when it has one, else by its Italian
   text. A clip that finds none shows as MISSING, never silently Italian.

   Pure functions over a minimal clip shape, so the rules are asserted in
   tools/test-voice-lang.ts without a browser.
   ============================================================================ */

import type { ScriptIndex, VoiceChoice } from '../compose/types'
import type { ClipParams, VoiceParams } from './multitrack'
import { counterpartVoice, voiceById } from '../tts/voiceCatalog'
import { VOICE_VARIANTS, scriptKey, variantKey, type Addressee, type VoiceLang } from '../tts/voiceLang'

/* ---- the working VARIANT ------------------------------------------------

   The Studio used to work in one LANGUAGE at a time. It now works in one
   language AND one address form — "sei pronto" and "sei pronta" are two
   recordings of the same clip, with the same timing, levels, fx and draws.

   Everything below is keyed by `variantKey`, so the male form keeps the bare
   language key and every session saved before this still loads as what it
   is: the male one. The SPOKEN language is still a language — it picks the
   voice and the TTS — and that is why both travel together. */
export interface Variant {
  lang: VoiceLang
  to: Addressee
}

export const IT_M: Variant = { lang: 'it', to: 'm' }

function keyOf(v: Variant): string {
  return variantKey(v.lang, v.to)
}

/** What a clip needs for this module — the Studio's Clip and a SeedClip both fit. */
export interface LangClip {
  text?: string
  ttsPath?: string
  ttsText?: string
  params: ClipParams
  sourceId?: string
  textByLang?: Partial<Record<string, string>>
  ttsByLang?: Partial<Record<string, { path?: string; text?: string }>>
  voiceByLang?: Partial<Record<string, VoiceChoice>>
}

const nonEmpty = (s: string | undefined): s is string => !!s && !!s.trim()

/** The live voice of a clip, as a VoiceChoice. */
function liveVoice(p: VoiceParams): VoiceChoice {
  return { voiceId: p.voiceId, voiceArchetype: p.voiceArchetype, voiceGender: p.voiceGender }
}

/** Fold the WORKING language's live fields into the per-language maps. */
export function stashLang<C extends LangClip>(c: C, v: Variant): C {
  const lang = keyOf(v)
  const p = c.params as VoiceParams
  const textByLang = { ...(c.textByLang ?? {}) }
  if (c.text !== undefined) textByLang[lang] = c.text
  const ttsByLang = { ...(c.ttsByLang ?? {}) }
  /* A render is kept only while it still speaks the text on the clip — an
     edited line must not come back as "rendered" in the old words. */
  const rendered = !!c.ttsPath && !!c.ttsText && c.ttsText === (c.text ?? '').trim()
  if (rendered) ttsByLang[lang] = { path: c.ttsPath, text: c.ttsText }
  else delete ttsByLang[lang]
  const voiceByLang = { ...(c.voiceByLang ?? {}), [lang]: liveVoice(p) }
  return { ...c, textByLang, ttsByLang, voiceByLang }
}

export interface LoadResult<C> {
  clip: C
  /** No text in the language, while another language has one: shown as missing. */
  missing: boolean
  /** The text was found in the stored timeline (the session had none). */
  filled: boolean
}

/**
 * Put `lang` into the live fields, from the maps — filling a missing text from
 * the stored timeline's texts, and a missing voice with the same archetype and
 * gender in that language.
 */
export function loadLang<C extends LangClip>(c: C, v: Variant, scripts?: ScriptIndex): LoadResult<C> {
  const lang = keyOf(v)
  const p = c.params as VoiceParams
  let text = c.textByLang?.[lang]
  let filled = false
  if (!nonEmpty(text) && scripts) {
    const bySource = c.sourceId ? scripts.bySource[c.sourceId]?.[lang] : undefined
    const it = c.textByLang?.it
    const byText = !bySource && nonEmpty(it) ? scripts.byItText[scriptKey(it)]?.[lang] : undefined
    const found = bySource ?? byText
    if (nonEmpty(found)) { text = found; filled = true }
  }
  const others = VOICE_VARIANTS.map(keyOf).some((k) => k !== lang && nonEmpty(c.textByLang?.[k]))
  const missing = !nonEmpty(text) && (others || !!c.sourceId)

  const tts = c.ttsByLang?.[lang]
  /* The voice this language was left with; else the counterpart of the voice
     the clip has now — the same archetype and gender, in `lang`. */
  let voice = c.voiceByLang?.[lang]
  if (!voice) {
    /* The other FORM of the same language keeps the same voice — the words
       change, the speaker does not. Only a language change needs a
       counterpart voice. */
    const sameLangOtherForm = c.voiceByLang?.[variantKey(v.lang, v.to === 'f' ? 'm' : 'f')]
    if (sameLangOtherForm) voice = sameLangOtherForm
    else {
      const cur = voiceById(p.voiceId)
      const alt = counterpartVoice(cur ? { archetype: cur.archetype, gender: cur.gender } : { archetype: p.voiceArchetype, gender: p.voiceGender }, v.lang)
      voice = { voiceId: alt.id, voiceArchetype: alt.archetype, voiceGender: alt.gender }
    }
  }
  const textByLang = filled ? { ...(c.textByLang ?? {}), [lang]: text } : c.textByLang
  return {
    clip: {
      ...c,
      text: text ?? '',
      textByLang,
      ttsPath: tts?.path,
      ttsText: tts?.text,
      params: { ...p, voiceId: voice.voiceId, voiceArchetype: voice.voiceArchetype, voiceGender: voice.voiceGender, voiceLang: v.lang } as ClipParams,
    },
    missing,
    filled,
  }
}

/** Switch one voice clip from the working language to another. */
export function switchClipLang<C extends LangClip>(c: C, from: Variant, to: Variant, scripts?: ScriptIndex): LoadResult<C> {
  return loadLang(stashLang(c, from), to, scripts)
}

/**
 * A voice clip as it is SAVED: every language in the maps, and the live
 * fields set to the Italian ones — whatever language the session was being
 * worked in — so an older reader of the session still finds Italian where it
 * always did.
 */
export function canonicalVoiceClip<C extends LangClip>(c: C, working: Variant): C {
  const s = stashLang(c, working)
  const p = s.params as VoiceParams
  const it = s.voiceByLang?.it
  const tts = s.ttsByLang?.it
  return {
    ...s,
    text: s.textByLang?.it,
    ttsPath: tts?.path,
    ttsText: tts?.text,
    params: { ...p, voiceId: it?.voiceId, voiceArchetype: it?.voiceArchetype, voiceGender: it?.voiceGender, voiceLang: 'it' } as ClipParams,
  }
}

/** A voice clip with no text in the working language that should have one. */
export function isTextMissing(c: LangClip): boolean {
  if (nonEmpty(c.text)) return false
  return !!c.sourceId || VOICE_VARIANTS.map(keyOf).some((k) => nonEmpty(c.textByLang?.[k]))
}
