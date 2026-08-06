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
  /** BCP-47-ish language tag from the ElevenLabs labels, when present. */
  language?: string
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
}

/** Read "[ok] ASMR (M) - ITA" into archetype + gender + a clean display name. */
export function parseVoiceName(raw: string): ParsedVoiceName {
  const approved = /^\s*\[ok\]/i.test(raw)
  let rest = raw.replace(/^\s*\[ok\]\s*/i, '').trim()
  rest = rest.replace(/\s*[-–—]\s*IT(A)?\s*$/i, '').trim() // drop the language tail
  const m = /^([A-Za-zÀ-ÿ]+)\s*(?:\(\s*([FM])\s*\))?$/.exec(rest)
  if (!m) return { name: rest || raw, approved }
  const token = m[1].toUpperCase()
  const archetype = NAME_TO_ARCHETYPE[token]
  const explicit = m[2]?.toUpperCase() as 'F' | 'M' | undefined
  const gender = explicit ?? (archetype ? ARCHETYPE_GENDER[archetype] : undefined)
  // "MATERNAL" → "Maternal"; keep ASMR-style acronyms upper-case
  const pretty = token.length <= 4 ? token : token.charAt(0) + token.slice(1).toLowerCase()
  return { name: explicit ? `${pretty} (${explicit})` : pretty, archetype, gender, approved }
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
}

/** When the list last came from ElevenLabs (null = still the seed). */
export function voicesSyncedAt(): number | null {
  return lastSyncAt
}

function pick(preferred: string[], fallback: (v: CatalogVoice) => boolean): CatalogVoice {
  for (const id of preferred) {
    const hit = VOICE_CATALOG.find((v) => v.id === id)
    if (hit) return hit
  }
  return VOICE_CATALOG.find(fallback) ?? VOICE_CATALOG[0]
}

/** The standard engine voice — every [F] / unmarked line. */
export function defaultPrimary(): CatalogVoice {
  return pick(PRIMARY_PREFERENCE, (v) => v.archetype === 'maternal' || v.gender === 'F')
}

/** The default secondary — [M] rows of the Deep double-induction. */
export function defaultSecondary(): CatalogVoice {
  return pick(SECONDARY_PREFERENCE, (v) => v.archetype === 'paternal' || v.gender === 'M')
}

export function voiceById(id: string | undefined): CatalogVoice | undefined {
  return id ? VOICE_CATALOG.find((v) => v.id === id) : undefined
}

export function voicesByArchetype(a: ArchetypeId): CatalogVoice[] {
  // PO-approved ([ok]) voices first, then the rest of the workspace's voices
  return VOICE_CATALOG
    .filter((v) => v.archetype === a)
    .sort((x, y) => Number(!!y.approved) - Number(!!x.approved) || x.name.localeCompare(y.name))
}

/** Display label, e.g. "Custom Mattia (F · Materna)". */
export function voiceLabel(v: CatalogVoice): string {
  const arch = ARCHETYPES.find((a) => a.id === v.archetype)
  return `${v.name} (${v.gender} · ${arch?.label ?? v.archetype})`
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

export function matchVoiceFromText(text: string | undefined): CatalogVoice | undefined {
  if (!text) return undefined
  const t = text.toLowerCase()
  // 1) explicit name wins
  const byName = VOICE_CATALOG.find((v) => t.includes(v.name.toLowerCase()))
  if (byName) return byName
  // 2) archetype keyword, gender-filtered when [F]/[M] present
  const hit = ARCHETYPE_KEYWORDS.find(([rx]) => rx.test(text))
  if (!hit) return undefined
  const list = voicesByArchetype(hit[1])
  const g = /\[F\]|femmin|female|femin/i.test(text) ? 'F' : /\[M\]|maschil|male|masculin/i.test(text) ? 'M' : undefined
  return (g ? list.find((v) => v.gender === g) : undefined) ?? list[0]
}
