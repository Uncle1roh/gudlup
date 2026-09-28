/* ============================================================================
   Good Loop — the legal context

   One hook every surface reads: which market the person is in, the catalogue
   string for a Message ID in their language, the crisis numbers for their
   market, and what they have accepted and consented to. It sits inside the
   data layer and tolerates a signed-out session — the door and the legal
   page show the crisis sheet too, and a person with no account is placed by
   the interface language until they say where they live.
   ============================================================================ */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { legalMsg, type LegalMessageId, type Market } from './messages'
import { DEFAULT_CRISIS, marketForLocale, type CrisisResource } from './market'
import type { Acceptance, ConsentEvent, ConsentPurpose, LegalProfile } from './records'
import { consentState } from './records'
import { LEGAL_VERSION } from './types'

export interface LegalApi {
  /** The signed-in person's legal profile, or null when signed out / loading. */
  profile: LegalProfile | null
  loaded: boolean
  market: Market
  /** A catalogue string in the interface language (ADM-09). */
  m: (id: LegalMessageId, vars?: Record<string, string | number>) => string
  /** Active crisis numbers for the market, in sheet order. Never empty. */
  crisis: CrisisResource[]
  acceptances: Acceptance[]
  consents: ConsentEvent[]
  /** Whether the CURRENT version of a document has been accepted. */
  accepted: (docId: string) => boolean
  consented: (purpose: ConsentPurpose) => boolean
  accept: (docId: string, channel?: string) => Promise<void>
  setConsent: (purpose: ConsentPurpose, granted: boolean, wording: string) => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<LegalApi | null>(null)

export function LegalProvider({ children }: { children: ReactNode }) {
  const dp = useDataProvider()
  const { locale } = useI18n()
  const [profile, setProfile] = useState<LegalProfile | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [acceptances, setAcceptances] = useState<Acceptance[]>([])
  const [consents, setConsents] = useState<ConsentEvent[]>([])
  const [crisisAll, setCrisisAll] = useState<CrisisResource[]>(DEFAULT_CRISIS)

  const refresh = useCallback(async () => {
    try {
      const p = await dp.getMyLegalProfile()
      setProfile(p)
      const [a, c] = await Promise.all([dp.listMyAcceptances(), dp.listMyConsents()])
      setAcceptances(a)
      setConsents(c)
    } catch {
      /* signed out, or no profile row yet — the placeholders stand */
      setProfile(null)
      setAcceptances([])
      setConsents([])
    } finally {
      setLoaded(true)
    }
  }, [dp])

  useEffect(() => { void refresh() }, [refresh])

  /* The numbers come from configuration (CRS-03). An unreachable table
     leaves the seed list in place: a crisis sheet is never empty. */
  useEffect(() => {
    let alive = true
    dp.listCrisisResources()
      .then((rows) => { if (alive && rows.length) setCrisisAll(rows) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [dp])

  const market: Market = profile?.market ?? marketForLocale(locale)

  const value = useMemo<LegalApi>(() => {
    const state = consentState(consents)
    const crisis = crisisAll
      .filter((r) => r.market === market && r.active)
      .sort((a, b) => a.position - b.position)
    return {
      profile, loaded, market,
      m: (id, vars) => legalMsg(id, locale, vars),
      crisis: crisis.length ? crisis : DEFAULT_CRISIS.filter((r) => r.market === market),
      acceptances, consents,
      accepted: (docId) => acceptances.some((a) => a.docId === docId && a.version === LEGAL_VERSION),
      consented: (purpose) => state[purpose]?.granted === true,
      accept: async (docId, channel) => {
        await dp.recordAcceptance({ docId, version: LEGAL_VERSION, locale, channel })
        setAcceptances(await dp.listMyAcceptances().catch(() => acceptances))
      },
      setConsent: async (purpose, granted, wording) => {
        await dp.recordConsent({ purpose, granted, wording, locale })
        setConsents(await dp.listMyConsents().catch(() => consents))
      },
      refresh,
    }
  }, [profile, loaded, market, locale, crisisAll, acceptances, consents, dp, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Outside a provider (a unit-rendered component, the hub) the hook still
    answers, from the interface language and the seed numbers. */
export function useLegal(): LegalApi {
  const ctx = useContext(Ctx)
  const { locale } = useI18n()
  const fallback = useMemo<LegalApi>(() => {
    const market = marketForLocale(locale)
    return {
      profile: null, loaded: true, market,
      m: (id, vars) => legalMsg(id, locale, vars),
      crisis: DEFAULT_CRISIS.filter((r) => r.market === market),
      acceptances: [], consents: [],
      accepted: () => false, consented: () => false,
      accept: async () => undefined, setConsent: async () => undefined,
      refresh: async () => undefined,
    }
  }, [locale])
  return ctx ?? fallback
}
