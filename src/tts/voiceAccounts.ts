/* ============================================================================
   Good Loop — the ElevenLabs accounts we use, and their voices, by hand

   The live list (voiceSync.ts) read each voice's language, gender and
   archetype out of its NAME. The POs name voices "BRA - MALE - RITUAL", a
   form the parser did not know: the gender token fell through, generated
   voices carry no gender label, so every male voice became female; the
   display name was cut at the first " - " and every voice read "BRA" or
   "ITA"; and with no "[ok]" marker anywhere, whatever else sat in the
   workspace came along too. Voices that did not match the account, and
   voices twice.

   So for the accounts we actually use, the list is written down here — from
   the POs' own comparison sheet (Suggestions/ElevenLabs voice ID
   comparison.xlsx) — and the name is never parsed. An account is recognised
   by a FINGERPRINT of its key: the first 24 hex characters of its SHA-256.
   The key itself is never in this file, in the bundle or in the repo; a
   fingerprint cannot be turned back into a key.

   Both accounts carry the same 22 voices — 11 characters, each in Italian
   (ITA) and Portuguese (BRA) — so a voice has an identity beyond its id: its
   SLOT, language + gender + archetype. A protocol saved while one account was
   connected names the other account's ids; every request resolves the id to
   the same slot in the account connected now (`registrySlot`, used by
   `resolveVoiceId`).

   A key that matches neither account still gets the live list, read by the
   same parser — which now also understands "MALE - RITUAL".
   ============================================================================ */

import type { ArchetypeId } from './voiceCatalog'
import type { VoiceLang } from './voiceLang'

export interface AccountVoice {
  id: string
  language: VoiceLang
  gender: 'F' | 'M'
  archetype: ArchetypeId
}

export interface VoiceAccount {
  id: string
  /** Who the account belongs to, as the admin reads it in the voice panel. */
  label: string
  /** First 24 hex characters of SHA-256(api key). */
  fingerprint: string
  voices: AccountVoice[]
}

/* One row per voice, in the sheet's own order and naming:
   [ language, gender, archetype, id ]. MENTOR is the product's "wise",
   ASMR its "whisper". */
type Row = [VoiceLang, 'F' | 'M', ArchetypeId, string]
const account = (id: string, label: string, fingerprint: string, rows: Row[]): VoiceAccount => ({
  id, label, fingerprint,
  voices: rows.map(([language, gender, archetype, voiceId]) => ({ id: voiceId, language, gender, archetype })),
})

export const VOICE_ACCOUNTS: VoiceAccount[] = [
  account('mattia', 'Good Loop — Mattia Volpe', '7a6e3c331b6e5d1ad5036fac', [
    ['pt-BR', 'M', 'ritual', 'smo2FZxpDzhClRoz96Ai'],
    ['it', 'M', 'ritual', 'BO2jrTp9rZq5PAFFKFkY'],
    ['pt-BR', 'M', 'whisper', 'nNbLaZY6EgDO8foLdve2'],
    ['it', 'M', 'whisper', 'qdpKTqUnlINIT9ZHgLxp'],
    ['pt-BR', 'F', 'whisper', 'GrTtLkCHTGKygU8VxsQS'],
    ['it', 'F', 'whisper', 'ZRvGXr3q13HhP63mThiX'],
    ['pt-BR', 'M', 'neutral', 'pq7LxqR8sIiverSkxdcf'],
    ['it', 'M', 'neutral', 'zYhyu02LNRVcOuxBwMWQ'],
    ['pt-BR', 'M', 'shadow', 'ponN8HpIW3pd0SyfoIfM'],
    ['it', 'M', 'shadow', 'aq3LQaWBzfz3CsMFZiNj'],
    ['pt-BR', 'M', 'child', 'LRGcc2DhwbSKjBWfLfQ8'],
    ['it', 'M', 'child', 'HTxKlWlffetRfhLkM28O'],
    ['pt-BR', 'F', 'child', 'GEme8iz67yw0vJXl8N4M'],
    ['it', 'F', 'child', 'VNiq79V3RZXAikhzeiie'],
    ['pt-BR', 'M', 'warrior', 'YB2IZqo4SVa7MbWTXLJO'],
    ['it', 'M', 'warrior', '81bQqVBYbh4lBxcdSkJ9'],
    ['pt-BR', 'M', 'wise', 'j00fZexLKA6f1nnkTT6o'],
    ['it', 'M', 'wise', 'PY4BQlRLAu6xlgvpn88R'],
    ['pt-BR', 'M', 'paternal', 'VUdkHNBsZcln94Q64kN7'],
    ['it', 'M', 'paternal', 'Zd5ZRxsNxAoZHMRh5hdm'],
    ['pt-BR', 'F', 'maternal', 'esolwfQMJakk5IMnRLnW'],
    ['it', 'F', 'maternal', 'aYBXyupCnZqrSVuPsR5i'],
  ]),
  account('giovanni', 'Good Loop — Giovanni Bartegno', '17acff0d7372be969934250a', [
    ['pt-BR', 'M', 'ritual', 'h0DmKj0V07XbagTwk7R7'],
    ['it', 'M', 'ritual', 'dfEeRSEY7d1F7CF8Gf2z'],
    ['pt-BR', 'M', 'whisper', 'AxeDqIUOBuQ4iIK8Y7vx'],
    ['it', 'M', 'whisper', 'WvwpNrjWsoFcxzIUpRSQ'],
    ['pt-BR', 'F', 'whisper', 'grmlvDB04J5dVnNwn2y0'],
    ['it', 'F', 'whisper', 'nBUC7NncvAu68caDaiqs'],
    ['pt-BR', 'M', 'neutral', 'vOPeTtZsLM4cmO75WiE0'],
    ['it', 'M', 'neutral', 'CtjaSV3g6wsWCuMPcmlt'],
    ['pt-BR', 'M', 'shadow', 'IdvNiUWVjoSi7eAldstQ'],
    ['it', 'M', 'shadow', '0Id6wSRTZQEJx4VteOqx'],
    ['pt-BR', 'M', 'child', 'mxOniifyfbdDtSRRbkJK'],
    ['it', 'M', 'child', 'xWUVsThf0g94fLFnyKyu'],
    ['pt-BR', 'F', 'child', 'Oxe0mX7VsrWE4ax66pZI'],
    ['it', 'F', 'child', 'oORF58WMiwpz7G8vx7vq'],
    ['pt-BR', 'M', 'warrior', 'AczVUCd8xuW0VU7Thjt2'],
    ['it', 'M', 'warrior', 'gyA8K4KTxq77biqmUAAH'],
    ['pt-BR', 'M', 'wise', 'edV5fQJjr0QuvYNuerhY'],
    ['it', 'M', 'wise', 'yWVubC5wu56wc7ZIx0Xg'],
    ['pt-BR', 'M', 'paternal', '4Krxg1yOB5BADklSoABl'],
    ['it', 'M', 'paternal', '5QUQJ5kO3rFLoQn19xKw'],
    ['pt-BR', 'F', 'maternal', 'SFRn2I758mcELCWQJNVP'],
    ['it', 'F', 'maternal', 'D0zGXCB1jW8c5sN9iDPp'],
  ]),
]

/** First 24 hex characters of SHA-256(key) — how an account is recognised. */
export async function keyFingerprint(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key.trim())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}

export function accountForFingerprint(fp: string): VoiceAccount | undefined {
  return VOICE_ACCOUNTS.find((a) => a.fingerprint === fp)
}

export async function accountForKey(key: string | undefined): Promise<VoiceAccount | undefined> {
  if (!key?.trim()) return undefined
  try {
    return accountForFingerprint(await keyFingerprint(key))
  } catch {
    return undefined // no WebCrypto (very old browser, insecure origin): the live list still works
  }
}

export interface VoiceSlot { language: VoiceLang; gender: 'F' | 'M'; archetype: ArchetypeId }

/** The slot a registered voice id fills, in whichever account it belongs to. */
export function registrySlot(id: string | undefined): (VoiceSlot & { account: VoiceAccount }) | undefined {
  if (!id) return undefined
  for (const a of VOICE_ACCOUNTS) {
    const v = a.voices.find((x) => x.id === id)
    if (v) return { language: v.language, gender: v.gender, archetype: v.archetype, account: a }
  }
  return undefined
}
