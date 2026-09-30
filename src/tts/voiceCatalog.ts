/* ============================================================================
   Good Loop — Voice catalog

   The list is LIVE: it mirrors whatever the connected ElevenLabs account holds
   (see voiceSync.ts). The POs add a voice in their workspace and it shows up in
   every picker on the next load — no code change, no redeploy.

   The old hardcoded roster is gone. Its ids belonged to a different ElevenLabs
   account and returned 404 voice_not_found; a baked-in list is exactly what
   made that failure invisible until render time. What stays hardcoded:
     · the ARCHETYPES (the product's own vocabulary),
     · a tiny SEED so the app has something before the first sync,
     · ARCHETYPE_OVERRIDES, where a PO decision beats the inferred archetype.

   Defaults resolve BY ID with a fallback chain, never by list position:
   prepending a voice in 76f830a silently made the secondary Rhea (a maternal F
   voice), so every [M] double-induction row rendered in the wrong voice.
   ============================================================================ */

import { isVoiceLang, type VoiceLang } from './voiceLang'
import { registrySlot, type VoiceAccount } from './voiceAccounts'

export type ArchetypeId =
  | 'maternal' | 'paternal' | 'wise' | 'neutral' | 'warrior'
  | 'shadow' | 'ritual' | 'child' | 'whisper'

export interface Archetype { id: ArchetypeId; label: string; icon: string }

export const ARCHETYPES: Archetype[] = [
  { id: 'maternal', label: 'Materna', icon: '🤱' },
  { id: 'paternal', label: 'Paterna', icon: '👨' },
  { id: 'wise', label: 'Saggio / Mentore', icon: '🦉' },
  { id: 'neutral', label: 'Neutra / Descrittiva', icon: '📖' },
  { id: 'warrior', label: 'Guerriera', icon: '🛡️' },
  { id: 'shadow', label: 'Ombra', icon: '🌑' },
  { id: 'ritual', label: 'Rituale / Cerimoniale', icon: '🕯️' },
  { id: 'child', label: 'Bambino interiore', icon: '🧒' },
  { id: 'whisper', label: 'Intima / Sussurrata', icon: '🤫' },
]

export interface CatalogVoice {
  id: string // ElevenLabs voice id
  name: string
  gender: 'F' | 'M'
  archetype: ArchetypeId
  /** ElevenLabs category. 'premade' = stock voice on every account; anything
      else is this workspace's own (generated / cloned / library-added). */
  category?: string
  /**
   * The language this voice SPEAKS, read from the POs' naming convention:
   * "ITA …" / "… - ITA" is Italian, "BRA …" / "… - BRA" is Portuguese.
   * Absent on voices cached before the convention was read — those are
   * Italian, which is what the whole library was until then (`voiceLangOf`).
   */
  language?: VoiceLang
  /** Carries the POs' "[ok]" approval marker. */
  approved?: boolean
}

/** A PO decision beats both the naming convention and label inference. */
export const ARCHETYPE_OVERRIDES: Record<string, ArchetypeId> = {}

/** Preferred defaults, in order. The first one that exists in the live list
    wins, so a workspace change degrades instead of breaking. */
const PRIMARY_PREFERENCE = ['aYBXyupCnZqrSVuPsR5i']   // [ok] MATERNAL - ITA
const SECONDARY_PREFERENCE = ['Zd5ZRxsNxAoZHMRh5hdm'] // [ok] PATERNAL - ITA

/** Bootstrap list: the two defaults, so the pickers are never empty before the
    first sync. Replaced wholesale by the first successful sync. */
const SEED: CatalogVoice[] = [
  { id: 'aYBXyupCnZqrSVuPsR5i', name: 'Maternal', gender: 'F', archetype: 'maternal', category: 'generated', language: 'it', approved: true },
  { id: 'Zd5ZRxsNxAoZHMRh5hdm', name: 'Paternal', gender: 'M', archetype: 'paternal', category: 'generated', language: 'it', approved: true },
]

/* ---- the POs' naming convention ----------------------------------------
   Voices are authored in ElevenLabs as "[ok] ARCHETYPE (F|M) - ITA", e.g.
   "[ok] MATERNAL - ITA" or "[ok] ASMR (M) - ITA". That name is a far better
   source of truth than ElevenLabs' labels, which are empty on generated
   voices — every one of them would otherwise land in Neutra as F. */
const NAME_TO_ARCHETYPE: Record<string, ArchetypeId> = {
  MATERNAL: 'maternal',
  PATERNAL: 'paternal',
  MENTOR: 'wise',
  WISE: 'wise',
  NEUTRAL: 'neutral',
  WARRIOR: 'warrior',
  SHADOW: 'shadow',
  RITUAL: 'ritual',
  CHILD: 'child',
  ASMR: 'whisper',
  WHISPER: 'whisper',
}

/** Genders implied by the archetype when the name carries no (F)/(M). */
const ARCHETYPE_GENDER: Partial<Record<ArchetypeId, 'F' | 'M'>> = {
  maternal: 'F',
  paternal: 'M',
}

export interface ParsedVoiceName {
  /** Display name, e.g. "Maternal" or "ASMR (M)". */
  name: string
  archetype?: ArchetypeId
  gender?: 'F' | 'M'
  /** The PO marked this voice as approved with the [ok] prefix. */
  approved: boolean
  /** The language marker, when the name carries one. */
  language?: VoiceLang
}

/* ---- the language marker -------------------------------------------------
   The POs name a voice's language in the voice's NAME, because ElevenLabs
   labels are empty on generated voices. Two forms are in the wild and both are
   accepted, so renaming the library is never a prerequisite:

     prefix   "ITA MATERNAL (F)"   "BRA - MATERNAL"   "[ok] ITA ASMR (M)"
     suffix   "[ok] MATERNAL - ITA"   "PATERNAL - BRA"

   ITA is Italian and BRA is Portuguese (Brazil). The marker is STRIPPED before
   the archetype is read, so "BRA MATERNAL" parses exactly as "MATERNAL" did. */
const LANG_TOKEN: Record<string, VoiceLang> = {
  ITA: 'it', IT: 'it',
  BRA: 'pt-BR', BR: 'pt-BR', PT: 'pt-BR', PTBR: 'pt-BR', 'PT-BR': 'pt-BR',
}
/* The prefix is only ever the two three-letter markers: "IT…" or "PT…" at the
   start of a name is more likely a word than a language. */
const LANG_PREFIX = /^(ITA|BRA)(?=$|[\s\-–—:_])\s*[-–—:_]?\s*/i
const LANG_SUFFIX = /\s*[-–—]\s*(ITA|IT|BRA|BR|PT-?BR|PT)\s*$/i

/** Read "[ok] ASMR (M) - ITA" / "BRA MATERNAL (F)" into archetype + gender +
    language + a clean display name. */
export function parseVoiceName(raw: string): ParsedVoiceName {
  const approved = /^\s*\[ok\]/i.test(raw)
  let rest = raw.replace(/^\s*\[ok\]\s*/i, '').trim()
  let language: VoiceLang | undefined
  const pre = LANG_PREFIX.exec(rest)
  if (pre) {
    language = LANG_TOKEN[pre[1].toUpperCase()]
    rest = rest.slice(pre[0].length).trim()
  }
  const post = LANG_SUFFIX.exec(rest)
  if (post) {
    language = language ?? LANG_TOKEN[post[1].toUpperCase().replace(/^PT-?BR$/, 'PTBR')]
    rest = rest.slice(0, post.index).trim()
  }
  /* "MALE - RITUAL" / "FEMALE - MATERNAL" / "RITUAL - MALE": the form the
     POs name voices in now. Before this the regex below failed on it, the
     gender fell through to "F" for every generated voice, and the display
     name was cut down to "BRA" / "ITA". */
  const parts = rest.split(/\s*[-–—]\s*|\s+/).filter(Boolean)
  const genderWord = parts.find((w) => /^(MALE|FEMALE|MASCHIO|FEMMINA|MASCULINO|FEMININO)$/i.test(w))
  const archWord = parts.find((w) => NAME_TO_ARCHETYPE[w.toUpperCase()])
  if (genderWord && archWord) {
    const g: 'F' | 'M' = /^(FEMALE|FEMMINA|FEMININO)$/i.test(genderWord) ? 'F' : 'M'
    const token = archWord.toUpperCase()
    const pretty = token.length <= 4 ? token : token.charAt(0) + token.slice(1).toLowerCase()
    return { name: `${pretty} (${g})`, archetype: NAME_TO_ARCHETYPE[token], gender: g, approved, language }
  }
  const m = /^([A-Za-zÀ-ÿ]+)\s*(?:\(\s*([FM])\s*\))?$/.exec(rest)
  if (!m) return { name: rest || raw, approved, language }
  const token = m[1].toUpperCase()
  const archetype = NAME_TO_ARCHETYPE[token]
  const explicit = m[2]?.toUpperCase() as 'F' | 'M' | undefined
  const gender = explicit ?? (archetype ? ARCHETYPE_GENDER[archetype] : undefined)
  // "MATERNAL" → "Maternal"; keep ASMR-style acronyms upper-case
  const pretty = token.length <= 4 ? token : token.charAt(0) + token.slice(1).toLowerCase()
  return { name: explicit ? `${pretty} (${explicit})` : pretty, archetype, gender, approved, language }
}

/** The display name of a registered voice: the character, and its gender
    where the character comes in both ("ASMR (F)" / "ASMR (M)"). */
const SLOT_NAME: Record<ArchetypeId, string> = {
  maternal: 'Maternal', paternal: 'Paternal', wise: 'Mentor', neutral: 'Neutral',
  warrior: 'Warrior', shadow: 'Shadow', ritual: 'Ritual', child: 'Child', whisper: 'ASMR',
}

/** One of our accounts (voiceAccounts.ts) as catalog voices: exactly its 22,
    named from the slot, never parsed from ElevenLabs. */
export function accountCatalog(account: VoiceAccount): CatalogVoice[] {
  return account.voices.map((v) => {
    const base = SLOT_NAME[v.archetype]
    const name = v.archetype === 'maternal' || v.archetype === 'paternal' ? base : `${base} (${v.gender})`
    return { id: v.id, name, gender: v.gender, archetype: v.archetype, category: 'generated', language: v.language, approved: true }
  })
}

/** The language a catalog voice speaks. No marker = Italian: every voice the
    POs made before the Portuguese library existed is an Italian one. */
export function voiceLangOf(v: Pick<CatalogVoice, 'language'> | undefined): VoiceLang {
  const l: unknown = v?.language
  return isVoiceLang(l) ? l : 'it'
}

/* The live list. Mutated in place so existing imports of VOICE_CATALOG keep
   pointing at the same array and see synced content. */
export const VOICE_CATALOG: CatalogVoice[] = [...SEED]

let lastSyncAt: number | null = null

/** Replace the catalog with the voices the connected account actually has. */
export function registerVoices(list: CatalogVoice[], at: number = Date.now()): void {
  if (!list.length) return
  VOICE_CATALOG.splice(0, VOICE_CATALOG.length, ...list)
  lastSyncAt = at
  // every sync feeds the ledger, so yesterday's account stays readable
  rememberVoices(list)
}

/** When the list last came from ElevenLabs (null = still the seed). */
export function voicesSyncedAt(): number | null {
  return lastSyncAt
}

/** The voices of one language, or the whole catalog when no language is
    asked for (callers that predate spoken languages). */
export function voicesForLang(lang?: VoiceLang): CatalogVoice[] {
  return lang ? VOICE_CATALOG.filter((v) => voiceLangOf(v) === lang) : VOICE_CATALOG
}

/** True when the connected account has at least one voice in `lang`. */
export function hasVoicesFor(lang: VoiceLang): boolean {
  return VOICE_CATALOG.some((v) => voiceLangOf(v) === lang)
}

/**
 * A default, within one language.
 *
 * The preferred ids are Italian voices, so they only count when Italian is
 * what is asked for. Then, inside the language: the archetype the default
 * stands for (maternal / paternal), PO-approved first · then the gender ·
 * then any voice of that language. A language with NO voice at all falls back
 * to the Italian default rather than to nothing — the caller says so in its
 * notes (`hasVoicesFor`), because a Portuguese line read by an Italian voice
 * is a wrong take, and it must not happen quietly.
 */
function pick(preferred: string[], archetype: ArchetypeId, gender: 'F' | 'M', lang?: VoiceLang): CatalogVoice {
  const pool = voicesForLang(lang)
  for (const id of preferred) {
    const hit = pool.find((v) => v.id === id)
    if (hit) return hit
  }
  const sorted = [...pool].sort((a, b) => Number(!!b.approved) - Number(!!a.approved))
  const inLang = sorted.find((v) => v.archetype === archetype)
    ?? sorted.find((v) => v.gender === gender)
    ?? sorted[0]
  if (inLang) return inLang
  if (lang && lang !== 'it') return pick(preferred, archetype, gender, 'it')
  return VOICE_CATALOG.find((v) => v.archetype === archetype || v.gender === gender) ?? VOICE_CATALOG[0]
}

/** The standard engine voice — every [F] / unmarked line — in `lang`
    (Italian when omitted: the defaults CLAUDE.md names are Italian voices). */
export function defaultPrimary(lang?: VoiceLang): CatalogVoice {
  return pick(PRIMARY_PREFERENCE, 'maternal', 'F', lang)
}

/** The default secondary — [M] rows of the Deep double-induction. */
export function defaultSecondary(lang?: VoiceLang): CatalogVoice {
  return pick(SECONDARY_PREFERENCE, 'paternal', 'M', lang)
}

/**
 * The same voice, in another language: the voice of `lang` with the same
 * archetype AND gender, then the same archetype, then that language's default
 * of the same gender. This is how a Portuguese session finds its voices — the
 * Excel's `archetipo` chose an Italian maternal voice, so the Portuguese line
 * gets the Portuguese maternal voice, never a different character.
 */
export function counterpartVoice(v: { archetype?: string; gender?: 'F' | 'M' } | undefined, lang: VoiceLang): CatalogVoice {
  if (v?.archetype) {
    const same = voicesByArchetype(v.archetype as ArchetypeId, lang)
    const hit = same.find((x) => x.gender === v.gender) ?? same[0]
    if (hit) return hit
  }
  return v?.gender === 'M' ? defaultSecondary(lang) : defaultPrimary(lang)
}

/* ============================================================================
   Following a voice into another ElevenLabs account

   A voice id belongs to the ACCOUNT that made it. Rotate the key — a new
   workspace, a rebuilt one, the agency's account handed over to the client —
   and every id saved in a protocol points at a voice that no longer exists:
   the Studio shows "non in questo account" on every clip and nothing will
   synthesize.

   The ids change; the PO naming convention does not. "[ok] ASMR (M) - ITA"
   is an ASMR voice in any account, so the ARCHETYPE (with the gender) is the
   identity worth keeping, and an id is only its address in one workspace.

   Two pieces make that work:
   · a ledger of every voice this browser has ever seen, so the archetype of
     an id from the OLD account is still known after the catalog is replaced;
   · `resolveVoiceId`, which every caller uses instead of `voiceById` — exact
     id first, then the same archetype in the account that is connected now.

   Nothing is rewritten on disk by this. A protocol keeps the id it was saved
   with, and the moment the old key comes back, so does the exact voice.
   ============================================================================ */

const KNOWN_KEY = 'gl.tts.voices.known'

export interface KnownVoice {
  id: string
  name: string
  archetype: ArchetypeId
  gender: 'F' | 'M'
  /** Absent on ledger entries written before voices had a language. */
  language?: VoiceLang
}

function readKnown(): Record<string, KnownVoice> {
  try {
    const raw = localStorage.getItem(KNOWN_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, KnownVoice>) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

let KNOWN: Record<string, KnownVoice> = typeof localStorage === 'undefined' ? {} : readKnown()

/** Remember what these voices ARE, so their ids stay readable after a key
    change. Merged, never replaced: the old account's voices stay on file. */
export function rememberVoices(list: CatalogVoice[]): void {
  let changed = false
  for (const v of list) {
    const prev = KNOWN[v.id]
    const language = voiceLangOf(v)
    if (prev && prev.archetype === v.archetype && prev.gender === v.gender && prev.name === v.name && prev.language === language) continue
    KNOWN[v.id] = { id: v.id, name: v.name, archetype: v.archetype, gender: v.gender, language }
    changed = true
  }
  if (!changed) return
  try { localStorage.setItem(KNOWN_KEY, JSON.stringify(KNOWN)) } catch { /* private mode: in memory only */ }
}

/** What this browser knows about an id, whichever account it came from. */
export function knownVoice(id: string | undefined): KnownVoice | undefined {
  return id ? KNOWN[id] : undefined
}

export interface VoiceResolution {
  /** The voice to use now, or undefined when nothing in this account fits. */
  voice?: CatalogVoice
  /** Set when the saved id belongs to another account and this is its stand-in. */
  remappedFrom?: KnownVoice
}

/**
 * The voice a saved id means in the account connected right now.
 *
 * Exact id · then the same archetype AND gender · then the same archetype.
 * Gender is allowed to give way because an account may carry only one voice
 * of an archetype; archetype never is, because it is the clinical choice.
 */
export function resolveVoiceId(id: string | undefined, hint?: { archetype?: string; gender?: 'F' | 'M'; language?: VoiceLang }): VoiceResolution {
  if (!id) return {}
  const exact = VOICE_CATALOG.find((v) => v.id === id)
  if (exact) return { voice: exact }
  /* A voice of one of OUR accounts (voiceAccounts.ts) has an exact twin in
     the other: same language, gender and archetype. No guessing, no ledger —
     the saved id is followed into the account connected now. */
  const slot = registrySlot(id)
  if (slot) {
    const twin = VOICE_CATALOG.find((v) => voiceLangOf(v) === slot.language && v.gender === slot.gender && v.archetype === slot.archetype)
    if (twin) {
      return { voice: twin, remappedFrom: { id, name: `${twin.name} · ${slot.account.label}`, archetype: slot.archetype, gender: slot.gender, language: slot.language } }
    }
  }
  /* The ledger only holds accounts THIS browser has synced. A protocol
     authored on another machine carries its own answer: the archetype saved
     on the clip. Either source names the same thing. */
  const was: KnownVoice | undefined = KNOWN[id] ?? (hint?.archetype
    ? { id, name: hint.archetype, archetype: hint.archetype as ArchetypeId, gender: hint.gender ?? 'F', language: hint.language }
    : undefined)
  if (!was) return {}
  /* The stand-in speaks the SAME language as the voice it replaces: a
     Portuguese clip remapped to an Italian voice would be a wrong take. Only
     an account with nothing in that language widens to every voice. */
  const lang = hint?.language ?? was.language
  const pool = lang && hasVoicesFor(lang) ? voicesForLang(lang) : VOICE_CATALOG
  const byBoth = pool.find((v) => v.archetype === was.archetype && v.gender === was.gender)
  const byArchetype = byBoth ?? pool.find((v) => v.archetype === was.archetype)
  return byArchetype ? { voice: byArchetype, remappedFrom: was } : {}
}

export function voiceById(id: string | undefined): CatalogVoice | undefined {
  return id ? VOICE_CATALOG.find((v) => v.id === id) : undefined
}

export function voicesByArchetype(a: ArchetypeId, lang?: VoiceLang): CatalogVoice[] {
  // PO-approved ([ok]) voices first, then the rest of the workspace's voices
  return voicesForLang(lang)
    .filter((v) => v.archetype === a)
    .sort((x, y) => Number(!!y.approved) - Number(!!x.approved) || x.name.localeCompare(y.name))
}

/** Display label, e.g. "Maternal (F · Materna · IT)". The language is part of
    the label now that an Italian and a Portuguese maternal voice can both be
    called "Maternal". */
export function voiceLabel(v: CatalogVoice): string {
  const arch = ARCHETYPES.find((a) => a.id === v.archetype)
  return `${v.name} (${v.gender} · ${arch?.label ?? v.archetype} · ${voiceLangOf(v) === 'pt-BR' ? 'PT' : 'IT'})`
}

/* ---- archetype inference from the ElevenLabs labels ----
   ElevenLabs has no notion of our archetypes, so we read its own metadata
   (descriptive / use_case / name) and map it onto the product's vocabulary.
   Order matters: the first pattern that matches wins. */
const INFERENCE: [RegExp, ArchetypeId][] = [
  [/whisper|sussurr|asmr|breathy/i, 'whisper'],
  [/villain|demon|dark|menac|malevolent|sinister|evil/i, 'shadow'],
  [/warrior|fierce|dominant|commanding|firm|power/i, 'warrior'],
  [/ancient|ceremon|ritual|epic|sacred|myth/i, 'ritual'],
  [/child|kid|bubbly|quirky|playful|sweet|cute/i, 'child'],
  [/wise|mature|mentor|narrat|storytell|educator|professor|sage/i, 'wise'],
  [/matern|nurtur|caring|soothing|gentle|gentile|gentle|warm.*(female|woman)/i, 'maternal'],
  [/patern|deep|resonant|comforting|fatherly/i, 'paternal'],
]

export interface ElevenLabsLabels {
  gender?: string
  descriptive?: string
  use_case?: string
  age?: string
  accent?: string
  language?: string
}

export function inferArchetype(name: string, labels: ElevenLabsLabels = {}, gender: 'F' | 'M' = 'F'): ArchetypeId {
  const hay = [name, labels.descriptive, labels.use_case, labels.age].filter(Boolean).join(' ')
  for (const [rx, a] of INFERENCE) {
    if (rx.test(hay)) {
      // a "deep/comforting" female reads maternal, not paternal, and vice versa
      if (a === 'paternal' && gender === 'F') return 'maternal'
      if (a === 'maternal' && gender === 'M') return 'paternal'
      return a
    }
  }
  return 'neutral'
}

/* ---- match a datasheet voice description to a catalog voice ----
   Accepts either an explicit voice NAME ("Custom Mattia", "Marco Trox") or an
   archetype keyword in Italian/English/Portuguese ("materna", "paternal",
   "sussurrata", "saggio/mentore", "guerriero", "ombra", "rituale",
   "bambino interiore", "neutra"), optionally gender-filtered by [F]/[M]. */
const ARCHETYPE_KEYWORDS: [RegExp, ArchetypeId][] = [
  [/matern/i, 'maternal'],
  [/patern/i, 'paternal'],
  [/sagg|mentor|wise|sábi|sabi/i, 'wise'],
  [/neutr|descri/i, 'neutral'],
  [/guerr|warrior/i, 'warrior'],
  [/ombra|shadow|sombra/i, 'shadow'],
  [/ritual|cerimon|ceremon/i, 'ritual'],
  [/bambin|child|kid|criança|crianca/i, 'child'],
  [/sussurr|whisper|intim/i, 'whisper'],
]

/* `lang` narrows the whole match to the voices of one language: the SAME
   `archetipo` cell ("Materna [F]") has to choose the Italian maternal voice
   for the Italian text and the Portuguese one for the Portuguese text. Without
   a language the whole catalog is searched, as before. */
export function matchVoiceFromText(text: string | undefined, lang?: VoiceLang): CatalogVoice | undefined {
  if (!text) return undefined
  const t = text.toLowerCase()
  const pool = voicesForLang(lang)
  // 1) explicit name wins
  const byName = pool.find((v) => t.includes(v.name.toLowerCase()))
  if (byName) return byName
  // 2) archetype keyword, gender-filtered when [F]/[M] present
  const hit = ARCHETYPE_KEYWORDS.find(([rx]) => rx.test(text))
  if (!hit) return undefined
  const list = voicesByArchetype(hit[1], lang)
  const g = /\[F\]|femmin|female|femin/i.test(text) ? 'F' : /\[M\]|maschil|male|masculin/i.test(text) ? 'M' : undefined
  return (g ? list.find((v) => v.gender === g) : undefined) ?? list[0]
}
