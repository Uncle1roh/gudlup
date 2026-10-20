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
     · between the two ADDRESS FORMS of one language, a line that is word
       for word the same keeps the render already paid for — renders are
       content-addressed, so it is the same stored object, and only the
       lines that really change need synthesizing a second time;
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
  /** The render came from the OTHER address form: the line is word for word
      the same, so the audio already paid for is this version's audio too. */
  carried: boolean
}

/* ---- the same line, in both address forms --------------------------------

   "Sei al sicuro" is the same sentence whether it is said to a man or to a
   woman; "sei pronto" is not. In a real protocol most lines are the first
   kind — the gendered ones are a minority, and they are the only ones that
   need a second ElevenLabs render.

   Until now switching form threw every render away and the PO re-synthesized
   the whole protocol to change a handful of words. What follows is the one
   question that avoids it: did this line actually change? */

/** Two texts that are the same line — spacing, case and ellipsis aside. */
function sameLine(a: string | undefined, b: string | undefined): boolean {
  return nonEmpty(a) && nonEmpty(b) && scriptKey(a) === scriptKey(b)
}

/** The other address form of the same language. */
export function otherForm(v: Variant): Variant {
  return { lang: v.lang, to: v.to === 'f' ? 'm' : 'f' }
}

/** The text a clip holds in one variant, or undefined. */
export function textOfVariant(c: LangClip, v: Variant): string | undefined {
  const s = c.textByLang?.[keyOf(v)]
  return nonEmpty(s) ? s : undefined
}

/** How a clip's line relates to the same clip in the other address form. */
export type FormDiff =
  /** Word for word the same: one render serves both. */
  | 'same'
  /** Really different words: this form needs its own render. */
  | 'different'
  /** Only one of the two forms is written, so there is nothing to compare. */
  | 'alone'

/**
 * `working` is the form being EDITED, when there is one.
 *
 * The maps are only written when the version is switched or the session is
 * saved — while somebody is typing, the working form's line is on `text`
 * and the map still holds what it was before. Comparing the maps alone
 * therefore answers a question about the past: a line just made different
 * went on reading "the same", which is exactly the wrong way round for a
 * mark whose job is to say "this one needs its own recording".
 */
export function compareForms(c: LangClip, lang: VoiceLang, working?: Addressee): FormDiff {
  const read = (to: Addressee) => {
    if (working === to) return nonEmpty(c.text) ? c.text : undefined
    return textOfVariant(c, { lang, to })
  }
  const m = read('m')
  const f = read('f')
  if (!m || !f) return 'alone'
  return sameLine(m, f) ? 'same' : 'different'
}

/**
 * The render of the OTHER address form, when it speaks this form's words.
 *
 * Renders are content-addressed on {text, voice, language, context}, so an
 * identical line in the same voice IS the same stored object — carrying the
 * path over is not an approximation, it is the same file.
 *
 * The voice has to match too: the same sentence in another voice is another
 * recording, and handing it over would quietly change who is speaking.
 */
function carriedRender(c: LangClip, v: Variant, text: string, voice: VoiceChoice): { path: string; text: string } | undefined {
  const k = keyOf(otherForm(v))
  const alt = c.ttsByLang?.[k]
  if (!alt?.path || !sameLine(alt.text, text)) return undefined
  const altVoice = c.voiceByLang?.[k]
  if (altVoice && altVoice.voiceId !== voice.voiceId) return undefined
  return { path: alt.path, text: text.trim() }
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
  /* The render: this form's own, or the other form's when the line is word
     for word the same. Nothing synthesized is thrown away for a word that
     did not change. */
  let tts = c.ttsByLang?.[lang]
  let carried = false
  if (!tts?.path && nonEmpty(text)) {
    const over = carriedRender(c, v, text, voice)
    if (over) { tts = over; carried = true }
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
    carried,
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
