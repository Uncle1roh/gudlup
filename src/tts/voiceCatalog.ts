/* ============================================================================
   Good Loop — Voice catalog (PO-approved ElevenLabs voices per archetype)
   The definitive voice list selected by the Project Leaders. Baked into the
   app so no screen ever asks for a voice ID again: every picker offers these
   by name, grouped by archetype.

   Defaults: Valeria (Maternal, F) is THE standard engine voice — every [F] /
   unmarked line. Marco Trox (Paternal, M) is the default secondary — the [M]
   rows of the Deep double-induction.

   Also in the PO list, as EFFECTS rather than voices (engine roadmap):
   · CORAL/MULTIPLE — a Harmonizer effect layering a voice into a chorus.
   · EMOTIONAL ECHO — an activatable echo effect (the engine's −8 dB/+2 s
     echo stacking already implements its core behavior).
   ============================================================================ */

export type ArchetypeId =
  | 'maternal' | 'paternal' | 'wise' | 'neutral' | 'warrior'
  | 'shadow' | 'ritual' | 'child' | 'whisper'

export interface Archetype { id: ArchetypeId; label: string; icon: string }

export const ARCHETYPES: Archetype[] = [
  { id: 'maternal', label: 'Maternal', icon: '🤱' },
  { id: 'paternal', label: 'Paternal', icon: '👨' },
  { id: 'wise', label: 'Wise / Mentor', icon: '🦉' },
  { id: 'neutral', label: 'Neutral / Descriptive', icon: '📖' },
  { id: 'warrior', label: 'Warrior', icon: '🛡️' },
  { id: 'shadow', label: 'Shadow', icon: '🌑' },
  { id: 'ritual', label: 'Ritual / Ceremonial', icon: '🕯️' },
  { id: 'child', label: 'Interior Kid', icon: '🧒' },
  { id: 'whisper', label: 'Intimate / Whispered', icon: '🤫' },
]

export interface CatalogVoice {
  id: string // ElevenLabs voice id
  name: string
  gender: 'F' | 'M'
  archetype: ArchetypeId
}

export const VOICE_CATALOG: CatalogVoice[] = [
  // Maternal
  { id: 'DrXMEEZ3ZiRzhi81CK7I', name: 'Valeria', gender: 'F', archetype: 'maternal' },
  // Paternal
  { id: 'W71zT1VwIFFx3mMGH2uZ', name: 'Marco Trox', gender: 'M', archetype: 'paternal' },
  // Wise / Mentor
  { id: 'O79jWrXzrCmtLwD8gO2a', name: 'Brando Vox', gender: 'M', archetype: 'wise' },
  { id: '6sFKzaJr574YWVu4UuJF', name: 'Cornelio', gender: 'M', archetype: 'wise' },
  { id: '9ebwxABSgElm9wISOP0J', name: 'Iris', gender: 'F', archetype: 'wise' },
  // Neutral / Descriptive
  { id: 'wNIMZNAVa95a3UpgwWJr', name: 'Giulio', gender: 'M', archetype: 'neutral' },
  { id: '9EU0h6CVtEDS6vriwwq5', name: 'Veronica', gender: 'F', archetype: 'neutral' },
  { id: 'Dzlw1nIlAqiOOW6J7qo1', name: 'Chiara', gender: 'F', archetype: 'neutral' },
  // Warrior
  { id: 'k8cFOyAg7B9qwBlDDNTC', name: 'Miguel', gender: 'M', archetype: 'warrior' },
  // Shadow
  { id: 'iB0m5bo5Htdz0t9yE0xq', name: 'Jax Meridian', gender: 'M', archetype: 'shadow' },
  { id: 'NxGA8X3YhTrnf3TRQf6Q', name: 'Jerry B', gender: 'M', archetype: 'shadow' },
  { id: 'vfaqCOvlrKi4Zp7C2IAm', name: 'Malyx', gender: 'M', archetype: 'shadow' },
  // Ritual / Ceremonial
  { id: 'cPoqAvGWCPfCfyPMwe4z', name: 'Victor', gender: 'M', archetype: 'ritual' },
  // Interior Kid
  { id: 'XJ2fW4ybq7HouelYYGcL', name: 'Cherry Twinkle', gender: 'M', archetype: 'child' },
  // Intimate / Whispered
  { id: '1cxc5c3E9K6F1wlqOJGV', name: 'Emily', gender: 'F', archetype: 'whisper' },
  { id: 'crip8a67H5HFGlukcx1h', name: 'Thomas', gender: 'M', archetype: 'whisper' },
  { id: 'uCAKWh24Y93ESUjKwRGP', name: 'Matthew Schmitz', gender: 'M', archetype: 'whisper' },
]

/** The standard engine voice — every [F] / unmarked line. */
export const DEFAULT_PRIMARY = VOICE_CATALOG[0] // Valeria — Maternal
/** The default secondary — [M] rows (Deep double-induction). */
export const DEFAULT_SECONDARY = VOICE_CATALOG[1] // Marco Trox — Paternal

export function voiceById(id: string | undefined): CatalogVoice | undefined {
  return id ? VOICE_CATALOG.find((v) => v.id === id) : undefined
}

export function voicesByArchetype(a: ArchetypeId): CatalogVoice[] {
  return VOICE_CATALOG.filter((v) => v.archetype === a)
}

/** Display label, e.g. "Valeria (F · Maternal)". */
export function voiceLabel(v: CatalogVoice): string {
  const arch = ARCHETYPES.find((a) => a.id === v.archetype)
  return `${v.name} (${v.gender} · ${arch?.label ?? v.archetype})`
}
