/* ============================================================================
   Good Loop — the therapist ↔ patient link

   One `patients` row is the link. `therapist_id` names the clinician,
   `b2c_profile_id` names the person, and every shared thing keys off its id:
   the chat thread, the prescribed pathway, the clinical record, the session
   history a therapist may read.

   Before this existed, both sides kept their own copy of the relationship in
   their own browser. The therapist's app minted a connection code into
   `gl.workspace`; the patient's app validated codes against two strings
   hardcoded in the source. They were never the same codes, there was no table
   behind either, and the flow could not connect two real people — not even
   two tabs of the same browser.

   The code is a handoff, not a secret: it is said out loud in a first
   appointment or typed into a chat. So it is short, unambiguous to read aloud,
   and it does nothing on its own — redeeming it requires being signed in, and
   `redeem_therapist_code` (supabase/6-two-sided-care.sql) is the only door.
   ============================================================================ */

/** What the signed-in person's therapist relationship looks like to them. */
export interface TherapistLink {
  /** The `patients` row id — the key for messages, plan items and history. */
  patientId: string
  therapistId: string
  therapistName: string
  /** The clinician's registration number, shown so a person can verify it. */
  crp?: string
  /** When the link was made (ms). */
  since: number
}

/** A connection code a therapist hands out. */
export interface TherapistCode {
  code: string
  /** What the therapist wrote to remember who it was for. */
  label?: string
  active: boolean
  createdAt: number
}

/* Characters that cannot be confused with each other when read aloud or
   copied by hand: no O/0, no I/1/L, no S/5, no B/8, no Z/2. A code is spoken
   in a first appointment, and "did you say O or zero" is a support ticket. */
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679'

/**
 * A code in the shape `GL-XXXX-XXXX`.
 *
 * Two groups of four from a 25-character alphabet is about 37 bits — far more
 * than enough when the only thing a guess buys you is the chance to become
 * somebody's patient, which the therapist sees immediately and can undo.
 */
export function generateConnectionCode(): string {
  const pick = (n: number) => {
    const bytes = new Uint8Array(n)
    crypto.getRandomValues(bytes)
    return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
  }
  return `GL-${pick(4)}-${pick(4)}`
}

/** Accept what a person actually types: spaces, lowercase, a missing prefix. */
export function normalizeConnectionCode(raw: string): string {
  const bare = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^GL/, '')
  if (bare.length !== 8) return raw.trim().toUpperCase()
  return `GL-${bare.slice(0, 4)}-${bare.slice(4)}`
}
