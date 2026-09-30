/* ============================================================================
   Good Loop — the languages a protocol is SPOKEN in

   A protocol used to be spoken in one language, and that language was nowhere
   in the data: the Excel had one `testo` column, the Studio one text per clip,
   the render hard-coded `lang: 'it'`, and the file was filed under 'pt-BR'
   because that was the only key the upload knew. Every one of those was the
   same assumption written down in a different place.

   Now the spoken language is a value, carried from the workbook to the file:

     · the Excel carries one text column per language (`testo` = Italian,
       `testo_pt` = Portuguese, `testo_en` stored for later);
     · the Studio session keeps every language's text on the same clip, and
       works in one of them at a time — timing, levels, fx and draws are
       SHARED, only the words and the voice speaking them change;
     · the published audio is filed per language on the version.

   `VoiceLang` is what can be spoken and published TODAY. English is written
   down (`ScriptLang`) but nothing renders it yet; adding it here is the whole
   change when it arrives — every map below is keyed by the union, not by
   hand-written branches.

   Deliberately a different axis from the interface locale: a therapist can
   read the app in Portuguese and render a protocol in Italian.
   ============================================================================ */

/** A language a protocol can be spoken and published in. */
export type VoiceLang = 'it' | 'pt-BR'

/** A language a protocol's TEXT can be written in. A superset: English text
    is stored from the Excel so nobody has to re-import when it is voiced. */
export type ScriptLang = VoiceLang | 'en'

export const VOICE_LANGS: VoiceLang[] = ['it', 'pt-BR']
export const SCRIPT_LANGS: ScriptLang[] = ['it', 'pt-BR', 'en']

/** How the admin console (Italian, pinned) names each language. The words are
    the languages' own names — "Português", not "Portoghese" — which is how a
    bilingual team recognises them at a glance. */
export const LANG_LABEL: Record<ScriptLang, string> = {
  it: 'Italiano',
  'pt-BR': 'Português',
  en: 'English',
}

/** Two letters for chips and status lines: "IT ✓ · PT —". */
export const LANG_SHORT: Record<ScriptLang, string> = {
  it: 'IT',
  'pt-BR': 'PT',
  en: 'EN',
}

/** The phrase "in <language>" for Italian status lines. */
export const LANG_IN: Record<ScriptLang, string> = {
  it: 'in italiano',
  'pt-BR': 'in portoghese',
  en: 'in inglese',
}

export function isVoiceLang(v: unknown): v is VoiceLang {
  return v === 'it' || v === 'pt-BR'
}

/** The other spoken language — the one a working session is NOT in. */
export function otherVoiceLang(l: VoiceLang): VoiceLang {
  return l === 'it' ? 'pt-BR' : 'it'
}

/** Per-language text, as stored on a clip, an affirmation or a Studio clip. */
export type TextByLang = Partial<Record<ScriptLang, string>>

/** The non-empty text of one language, or undefined. */
export function textIn(map: TextByLang | undefined, lang: ScriptLang): string | undefined {
  const v = map?.[lang]?.trim()
  return v ? v : undefined
}

/** Languages that actually carry text in a map. */
export function langsWithText(map: TextByLang | undefined): ScriptLang[] {
  return SCRIPT_LANGS.filter((l) => !!textIn(map, l))
}

/** The key a line is looked up by when only its Italian text is known:
    spacing, case and the ellipsis glyph do not make two lines different. */
export function scriptKey(text: string): string {
  return text.replace(/…/g, '...').replace(/\s+/g, ' ').trim().toLowerCase()
}
