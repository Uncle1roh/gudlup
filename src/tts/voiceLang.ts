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

/* ============================================================================
   WHO the protocol is speaking to

   The scripts address the listener directly, and Italian and Portuguese make
   the listener's gender audible: "sei pronto" / "sei pronta". One recording
   cannot do both, so the same protocol is written and voiced twice.

   This is a SECOND AXIS on the path language already travels — workbook,
   Studio, published file — not a new path. Everything below is keyed by the
   pair, and the one rule that matters is this:

       THE MALE FORM KEEPS THE BARE LANGUAGE KEY.

   `it` IS Italian addressed to a man; `it:f` is the new one. Every protocol
   published before this existed therefore stays exactly where it is, counts
   as the male version, and needs no migration — which is the whole reason
   the key is shaped this way rather than `it:m`.
   ============================================================================ */

/** Which form the listener is addressed in. */
export type Addressee = 'm' | 'f'

export const ADDRESSEES: Addressee[] = ['m', 'f']

/** How the admin console names each form. */
export const ADDRESSEE_LABEL: Record<Addressee, string> = {
  m: 'Maschile',
  f: 'Femminile',
}

/** One letter for chips and status lines: "IT·M ✓ · IT·F —". */
export const ADDRESSEE_SHORT: Record<Addressee, string> = { m: 'M', f: 'F' }

/** A language AND the form it addresses the listener in. */
export interface VoiceVariant {
  lang: VoiceLang
  to: Addressee
}

/** Every variant that can be voiced today, in the order the console lists. */
export const VOICE_VARIANTS: VoiceVariant[] = VOICE_LANGS.flatMap((lang) =>
  ADDRESSEES.map((to) => ({ lang, to })),
)

/**
 * The key a variant's text and audio are stored under.
 *
 * Male → the bare language code, so nothing already published moves.
 */
export function variantKey(lang: ScriptLang, to: Addressee = 'm'): string {
  return to === 'f' ? `${lang}:f` : lang
}

/** Read a variant key back. An unsuffixed key is the male form. */
export function parseVariantKey(key: string): { lang: ScriptLang; to: Addressee } | null {
  const [lang, suffix] = key.split(':f').length > 1 ? [key.slice(0, -2), 'f'] : [key, 'm']
  return SCRIPT_LANGS.includes(lang as ScriptLang) ? { lang: lang as ScriptLang, to: suffix as Addressee } : null
}

export function variantLabel(lang: ScriptLang, to: Addressee): string {
  return `${LANG_LABEL[lang]} · ${ADDRESSEE_LABEL[to]}`
}

export function variantShort(lang: ScriptLang, to: Addressee): string {
  return `${LANG_SHORT[lang]}·${ADDRESSEE_SHORT[to]}`
}

/** Per-language text, as stored on a clip, an affirmation or a Studio clip.
    Keyed by `variantKey`, so `it` is Italian-to-a-man and `it:f` the other. */
export type TextByLang = Partial<Record<string, string>>

/** The non-empty text of one language and form, or undefined.
 *
 *  Reading the female form of a protocol written before this feature existed
 *  must not invent one: it returns undefined, and the caller decides whether
 *  to fall back. Only `textFor` below falls back, and it says when it did.
 */
export function textIn(map: TextByLang | undefined, lang: ScriptLang, to: Addressee = 'm'): string | undefined {
  const v = map?.[variantKey(lang, to)]?.trim()
  return v ? v : undefined
}

/**
 * The text to use, and whether it is the form that was asked for.
 *
 * A catalogue mid-translation has protocols written for a man and not yet for
 * a woman. Hiding those would empty her library, so she gets the male text —
 * and `exact: false` is what the screens use to say so rather than let her
 * discover it by being called "pronto".
 */
export function textFor(
  map: TextByLang | undefined,
  lang: ScriptLang,
  to: Addressee,
): { text: string; exact: boolean } | undefined {
  const wanted = textIn(map, lang, to)
  if (wanted) return { text: wanted, exact: true }
  const other = textIn(map, lang, to === 'f' ? 'm' : 'f')
  return other ? { text: other, exact: false } : undefined
}

/** Languages that carry text in a map, in either form. */
export function langsWithText(map: TextByLang | undefined): ScriptLang[] {
  return SCRIPT_LANGS.filter((l) => ADDRESSEES.some((to) => !!textIn(map, l, to)))
}

/** The variants a map actually carries text for. */
export function variantsWithText(map: TextByLang | undefined): { lang: ScriptLang; to: Addressee }[] {
  const out: { lang: ScriptLang; to: Addressee }[] = []
  for (const lang of SCRIPT_LANGS) for (const to of ADDRESSEES) if (textIn(map, lang, to)) out.push({ lang, to })
  return out
}

/** The key a line is looked up by when only its Italian text is known:
    spacing, case and the ellipsis glyph do not make two lines different. */
export function scriptKey(text: string): string {
  return text.replace(/…/g, '...').replace(/\s+/g, ' ').trim().toLowerCase()
}
