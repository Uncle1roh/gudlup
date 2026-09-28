/* ============================================================================
   Good Loop — legal framework: shared types

   The legal corpus (notices D-01 to D-17, Terms, End-User Supplement,
   Professional Terms) is stored as flat blocks — a heading, a paragraph or a
   list item — rather than as prose, so the same text can be rendered on the
   legal page, quoted one tap away from a notice, and diffed between versions.
   ============================================================================ */

import type { Market } from './messages'

export type LegalDocId =
  | 'D-01' | 'D-02' | 'D-03-BR' | 'D-03-EU' | 'D-04' | 'D-05' | 'D-06' | 'D-07'
  | 'D-08' | 'D-09' | 'D-10' | 'D-11' | 'D-12' | 'D-13' | 'D-14' | 'D-15' | 'D-16' | 'D-17'
  | 'terms' | 'supplement' | 'professional' | 'privacy'

export interface LegalBlock {
  kind: 'h' | 'p' | 'li'
  text: string
  /** Set only on annex text that REPLACES a clause in one market. */
  market?: Market
}

export interface LegalDocText {
  id: string
  title: string
  blocks: LegalBlock[]
}

/** Which notices a person is shown, by the mode they are in (Part II.1). */
export const NOTICES_SELF_GUIDED: LegalDocId[] = ['D-01', 'D-02', 'D-04', 'D-06', 'D-10', 'D-11', 'D-12', 'D-13', 'D-14', 'D-15', 'D-16']
export const NOTICES_GUIDED: LegalDocId[] = ['D-01', 'D-05', 'D-06', 'D-07', 'D-10', 'D-11', 'D-12', 'D-13', 'D-14', 'D-15', 'D-16']

/**
 * The version of the legal corpus the product ships. Bumping it is a legal
 * event: every person is asked to accept the new version (LEG-09), the old
 * one stays readable in the archive (LEG-07), and the version register in the
 * database (legal_versions) records the date it came into force (ADM-06).
 * The texts are drafts until counsel signs them off, which the version string
 * says out loud.
 */
export const LEGAL_VERSION = '0.5-draft'

/** The document ids a person must accept to hold an account (LEG-01). The
    notices are incorporated by reference into the Terms (cl. 2.2), so one
    acceptance covers the set — but each named notice is linked from the
    acceptance screen, as D-01's drafting note requires. */
export const ACCEPTANCE_DOCS: LegalDocId[] = ['terms']

/** What a market's legal page must carry (LEG-06). */
export function crisisNoticeId(market: Market): LegalDocId {
  return market === 'BR' ? 'D-03-BR' : 'D-03-EU'
}
