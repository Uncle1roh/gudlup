/* ============================================================================
   Good Loop — how a catalogue row is labelled (was: the claims gate, ADM-02,
   ADM-03, Part VII.4 / VII.6 of the Terms deliverable)

   A row used to have to pass three checks before it could be enabled: the
   LEXICON (no prohibited vocabulary anywhere a person reads), the
   FOUR-QUESTION SIGN-OFF (population, claim, selection, setting — each
   answered "no", with a name and a date) and the TIER RULE (red content
   never reaching the self-guided library).

   All three are gone from the console. A word list cannot tell a claim from
   an ordinary word: "recupero" is in Lexicon_Avoid as a care-pathway term
   and is also what a rest session is plainly called, so the gate refused
   work that was never a claim and there was no way past it. The positioning
   is maintained by the people writing the copy, and by the notices the app
   prints, not by a regex standing between the POs and publishing.

   WHAT REMAINS is the label itself, now two answers rather than three
   colours: clinical, or not.

   The stored VALUES are unchanged — `green` and `amber` — because the
   database column checks `tier in ('green','amber','red')` and a value
   outside that set would make every save fail. `red` is never written any
   more; a row that carries it reads as clinical and becomes `amber` the
   first time it is saved, which also defuses the `protocols_tier_guard`
   trigger that refuses red content in the self-guided library.
   ============================================================================ */

export type ContentTier = 'green' | 'amber' | 'red'

export const TIERS: { id: ContentTier; label: string; hint: string }[] = [
  { id: 'green', label: 'Non clinico', hint: 'Contenuto di benessere, a uso autonomo.' },
  { id: 'amber', label: 'Clinico', hint: 'Pensato per essere usato insieme a un professionista.' },
]

/** The stored value that one of the two answers maps to. Anything that is
    not plainly `green` is clinical, so a legacy `red` row stays clinical. */
export function tierChoice(t: ContentTier | undefined | null): ContentTier {
  return (t ?? 'green') === 'green' ? 'green' : 'amber'
}

/** What the row shows in the catalogue list. */
export function tierLabel(t: ContentTier | undefined | null): string {
  return tierChoice(t) === 'green' ? 'Non clinico' : 'Clinico'
}

/* ---- the sign-off record, kept but no longer asked for ------------------
   Rows signed before the gate was removed still carry it, and the column is
   still read and written. Nothing reads it to decide anything. */

export interface ClaimsGate {
  answers: Partial<Record<string, 'yes' | 'no'>>
  approvedBy: string
  approvedAt: number | null
  /** The substantiation file reference, where an efficiency claim is made. */
  substantiation?: string
}

export function emptyGate(): ClaimsGate {
  return { answers: {}, approvedBy: '', approvedAt: null }
}
