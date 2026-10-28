/* ============================================================================
   Benefícios — SPEC §6

   Care that comes back to you, not a shop. Top to bottom:
     1. "Seu cuidado": the time given to yourself this month, and the Loops it
        became — the habit is the hero, the balance its consequence
     2. the next milestone of care
     3. benefits by wellbeing pillar, a short list each (no infinite scroll)
     4. what challenges unlocked
     5. "Meus benefícios": what was redeemed, with its code

   GAM-R7, the glossary of §6.5: Trocar / Resgatar, never Comprar or Loja; no
   countdowns, no strikethrough prices, no scarcity, no "mais vendidos", no
   cross-sell. tools/test-gam-copy.ts fails the build's tests if a forbidden
   word reaches these screens.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { Icon } from './icons'
import { Badge } from '../gamification/ui/Badge'
import { GamDialog } from '../gamification/ui/Dialog'
import { copyFor } from '../gamification/copy'
import { fmtMinutes, type AchievementView } from '../gamification/achievements'
import { isLive, visibleChallenges, type ChallengeView } from '../gamification/challenges'
import { ChallengeCard } from './ChallengeCard'
import { TopBar, PageTitle } from '../ui2/TopBar'
import { DEFAULT_ECONOMY, displayLoops, type EconomySettings, type Wallet } from '../gamification/economy'
import {
  PILLARS, RedeemError, byPillar, missingLoops, standardSessionsFor,
  type BenefitView, type Redemption, type RedeemResult,
} from '../gamification/benefits'

export function BenefitsTab({ name, hasCompany, onStartSession, onSeeAchievements, onSeeChallenges }: {
  /** First name, when the account gives one — the top bar prints it. */
  name: string | null
  /** The person belongs to a company, so an employer's challenge is theirs. */
  hasCompany: boolean
  onStartSession: () => void
  onSeeAchievements: () => void
  onSeeChallenges: () => void
}) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [list, setList] = useState<BenefitView[] | null>(null)
  const [mine, setMine] = useState<Redemption[]>([])
  const [achievements, setAchievements] = useState<AchievementView[]>([])
  const [challenge, setChallenge] = useState<ChallengeView | null>(null)
  const [tab, setTab] = useState<'available' | 'mine'>('available')
  const [cfg, setCfg] = useState<EconomySettings>(DEFAULT_ECONOMY)
  const [open, setOpen] = useState<BenefitView | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    Promise.all([dp.getWallet(), dp.getAvailableBenefits(), dp.listMyRedemptions()])
      .then(([w, b, r]) => { setWallet(w); setList(b); setMine(r) })
      .catch(() => setFailed(true))
    /* The whole list, not only the next one: the top card shows three.
       Same call the summary makes. */
    dp.listMyAchievements().then(setAchievements).catch(() => setAchievements([]))
    dp.listMyChallenges()
      .then((all) => {
        const live = visibleChallenges(all, hasCompany).filter((c) => isLive(c, Date.now()))
        setChallenge(live.find((c) => c.companyId) ?? live[0] ?? null)
      })
      .catch(() => setChallenge(null))
    dp.getEconomySettings().then(setCfg).catch(() => { /* the defaults estimate well enough */ })
  }, [dp])
  useEffect(() => { load() }, [load])

  if (failed) {
    return (
      <>
        <TopBar name={name} />
        <PageTitle title={t('Benefits')} />
        <p className="call2-note">{t('Your benefits could not be loaded right now.')}</p>
      </>
    )
  }
  if (!wallet || !list) {
    return (
      <>
        <TopBar name={name} />
        <PageTitle title={t('Benefits')} />
        <p className="call2-note" aria-busy="true">{t('Loading…')}</p>
      </>
    )
  }

  const pillars = byPillar(list)
  const unlocked = list.filter((b) => b.challengeExclusive)

  return (
    <>
      <TopBar name={name} />
      <PageTitle title={t('Benefits')} note={t('Every Loop is born from a minute of care for your mind.')} />

      {/* The mockup's three cards across the top: the balance, the company's
          challenge, and what has been unlocked. Each one is the app's own
          block, in the mockup's shape — the balance still leads with the TIME
          the person gave themselves, because the habit is the hero and the
          Loops are its consequence (SPEC §6). */}
      <section className="g3">
        <article className="glass bn2-card">
          <span className="bn2-eyebrow">{t('Your care')}</span>
          <span className="bn2-balance">
            {displayLoops(wallet.balanceCenti).toLocaleString('pt-BR')}
            <small>{t('Loops')}</small>
          </span>
          <span className="call2-note">{t('You gave {time} to yourself this month', { time: fmtMinutes(wallet.minutesMonth) })}</span>
          {/* "Your company multiplies your Loops" is a sentence about an
              employer. Without a company code there is no employer to
              multiply anything. */}
          {hasCompany && wallet.multiplier !== null && (
            <span className="call2-note">{t('Your company multiplies your Loops by {x}×', { x: wallet.multiplier.toLocaleString('pt-BR') })}</span>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="glass-btn call2-pill" onClick={onStartSession}>{t('Start a session')}</button>
        </article>

        {challenge ? (
          <ChallengeCard c={challenge} onOpen={onSeeChallenges} />
        ) : (
          <article className="glass bn2-card">
            <span className="bn2-eyebrow">{t('Challenges')}</span>
            <span className="call2-note">{t('Nothing selected yet.')}</span>
          </article>
        )}

        <article className="glass bn2-card">
          <h2 className="call2-pane__h">{t('Achievements')}</h2>
          {!achievements.length && <span className="call2-note">{t('Nothing selected yet.')}</span>}
          <ul className="bn2-achv">
            {achievements.slice(0, 3).map((a) => (
              <li key={a.slug}>
                <Badge icon={a.icon} tier={a.tier} shape="circle" size={34} locked={!a.unlockedAt} />
                <span className={a.unlockedAt ? undefined : 'call2-list__off'}>{t(copyFor(a.slug).name)}</span>
              </li>
            ))}
          </ul>
          <div style={{ flex: 1 }} />
          <button type="button" className="glass-btn call2-pill" onClick={onSeeAchievements}>{t('See all {n} achievements', { n: achievements.length })}</button>
        </article>
      </section>

      {/* Two tabs, as the mockup has them. The pillars survive inside the
          first one: "care for the body" and "care for the mind" are how this
          catalogue is organised, and a single undifferentiated grid would
          throw that away. */}
      <div className="segmented bn2-tabs" role="tablist" aria-label={t('Benefits')}>
        <button role="tab" aria-selected={tab === 'available'} onClick={() => setTab('available')}>{t('Available')}</button>
        <button role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>{t('My benefits')}</button>
      </div>

      {tab === 'available' && (
        <>
          {PILLARS.map((p) => {
            const items = pillars.get(p.id) ?? []
            if (!items.length) return null
            return (
              <section key={p.id} aria-labelledby={`pillar-${p.id}`} className="bn2-sect">
                <h2 id={`pillar-${p.id}`} className="call2-pane__h">
                  <span className="bn2-pill-icon" aria-hidden="true"><Icon name={p.icon} size={16} /></span>
                  {t(p.label)}
                </h2>
                <div className="g4">
                  {items.map((b) => <BenefitCard key={b.id} b={b} wallet={wallet} cfg={cfg} onOpen={() => setOpen(b)} />)}
                </div>
              </section>
            )
          })}

          {unlocked.length > 0 && (
            <section className="bn2-sect">
              <h2 className="call2-pane__h">{t('Unlocked by challenges')}</h2>
              <div className="g4">
                {unlocked.map((b) => <BenefitCard key={b.id} b={b} wallet={wallet} cfg={cfg} onOpen={() => setOpen(b)} />)}
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'mine' && (
        <section className="bn2-sect">
          {mine.length === 0 ? (
            <p className="call2-note">{t('What you redeem appears here, with its code and how to use it.')}</p>
          ) : (
            <ul className="gam-mine">
              {mine.map((r) => <li key={r.id}><MyBenefit r={r} /></li>)}
            </ul>
          )}
        </section>
      )}

      {open && (
        <BenefitSheet
          b={open}
          wallet={wallet}
          cfg={cfg}
          onClose={() => setOpen(null)}
          onRedeemed={() => load()}
        />
      )}
    </>
  )
}

function priceLine(t: ReturnType<typeof useI18n>['t'], b: BenefitView, wallet: Wallet, cfg: EconomySettings): { can: boolean; text: string } {
  if (b.myRedemptions >= b.perUserLimit) return { can: false, text: t('Already in My benefits') }
  if (!b.inStock) return { can: false, text: t('Not available right now') }
  const price = b.priceLoopsCenti ?? 0
  const missing = missingLoops(price, wallet.balanceCenti)
  if (missing > 0) {
    const n = standardSessionsFor(price - wallet.balanceCenti, cfg, wallet.multiplier)
    return { can: false, text: t('{n} Loops to go · about {s} Standard sessions', { n: String(missing), s: String(n) }) }
  }
  return { can: true, text: price > 0 ? t('Exchange for {n} Loops', { n: String(displayLoops(price)) }) : t('Redeem') }
}

function BenefitCard({ b, wallet, cfg, onOpen }: { b: BenefitView; wallet: Wallet; cfg: EconomySettings; onOpen: () => void }) {
  const { t } = useI18n()
  const line = priceLine(t, b, wallet, cfg)
  const pillar = PILLARS.find((p) => p.id === b.pillar)
  return (
    <button className="card gam-benefit" onClick={onOpen}>
      <span className="gam-benefit__tile" aria-hidden="true">{pillar && <Icon name={pillar.icon} size={22} />}</span>
      <span className="gam-benefit__body">
        {b.companyId && <span className="gam-chip gam-chip--company">{t('From your company')}</span>}
        <span className="gam-benefit__title">{b.title}</span>
        {b.partnerName && <span className="small muted">{b.partnerName}</span>}
        {b.careRationale && <span className="small gam-benefit__why">{b.careRationale}</span>}
        <span className={`gam-benefit__price${line.can ? ' is-ready' : ''}`}>{line.text}</span>
      </span>
    </button>
  )
}

const REFUSAL_TEXT: Record<string, string> = {
  BENEFIT_UNAVAILABLE: 'This benefit is no longer available to you.',
  BENEFIT_LIMIT: 'You have already redeemed this benefit.',
  BENEFIT_BALANCE: 'You do not have enough Loops for this one yet.',
  BENEFIT_STOCK: 'This benefit is not available right now.',
  BENEFIT_NEEDS_CONSENT: 'To redeem this benefit, confirm that your details may be shared.',
}

function BenefitSheet({ b, wallet, cfg, onClose, onRedeemed }: { b: BenefitView; wallet: Wallet; cfg: EconomySettings; onClose: () => void; onRedeemed: () => void }) {
  const { t, d } = useI18n()
  const dp = useDataProvider()
  const [step, setStep] = useState<'detail' | 'confirm' | 'done'>('detail')
  const [consent, setConsent] = useState(false)
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [shared, setShared] = useState<{ name: string; companyName: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RedeemResult | null>(null)
  const line = priceLine(t, b, wallet, cfg)
  const identified = b.deliveryType === 'identified'
  const price = displayLoops(b.priceLoopsCenti ?? 0)
  /* Identified (§7.2b): before consenting, the person sees EXACTLY what is
     shared — their name, the employee number they type, and with whom. */
  useEffect(() => {
    if (!identified) return
    dp.getIdentifiedPreview().then(setShared).catch(() => setShared(null))
  }, [dp, identified])
  const needsNumber = identified && b.companyId !== null

  async function redeem() {
    setBusy(true)
    setError(null)
    try {
      const r = await dp.redeemBenefit(b.id, identified ? consent : false, needsNumber ? employeeNumber.trim() : undefined)
      setResult(r)
      setStep('done')
      onRedeemed()
    } catch (e) {
      setError(t(e instanceof RedeemError ? REFUSAL_TEXT[e.refusal] ?? 'That did not work. Please try again.' : 'That did not work. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GamDialog labelledBy="gam-benefit-title" onClose={onClose} className="gam-sheet">
        <h2 id="gam-benefit-title" className="display gam-sheet__title">{b.title}</h2>
        {b.partnerName && <p className="small muted">{b.partnerName}</p>}

        {step === 'detail' && (
          <>
            {b.description && <p>{b.description}</p>}
            {b.careRationale && (
              <>
                <h3 className="gam-sheet__h">{t('Why this takes care of you')}</h3>
                <p>{b.careRationale}</p>
              </>
            )}
            {b.validTo && <p className="small muted">{t('Valid until {date}', { date: d(b.validTo, { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>}
            {b.terms && <p className="small muted">{b.terms}</p>}
            <button className="btn btn--primary" disabled={!line.can} onClick={() => setStep('confirm')}>{line.text}</button>
            <button className="btn btn--ghost" onClick={onClose}>{t('Close')}</button>
          </>
        )}

        {step === 'confirm' && (
          <>
            <p className="gam-sheet__ask">
              {price > 0 ? t('Exchange {n} Loops for this benefit?', { n: String(price) }) : t('Redeem this benefit?')}
            </p>
            {identified && (
              <div className="gam-shared">
                <p className="small">{t('To deliver this benefit, your name and employee number will be shared with your company’s HR. Nothing else is shared.')}</p>
                <dl className="gam-shared__what">
                  <dt>{t('Name')}</dt><dd>{shared?.name || '—'}</dd>
                  {shared?.companyName && <><dt>{t('Shared with')}</dt><dd>{t('HR at {company}', { company: shared.companyName })}</dd></>}
                </dl>
                {needsNumber && (
                  <label className="gam-shared__field">
                    <span className="small">{t('Employee number')}</span>
                    <input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} autoComplete="off" maxLength={40} />
                  </label>
                )}
                <label className="legal-ack">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>{t('I agree to share these details to receive this benefit.')}</span>
                </label>
              </div>
            )}
            {error && <p className="small" role="alert">{error}</p>}
            <button className="btn btn--primary" disabled={busy || (identified && !consent) || (needsNumber && !employeeNumber.trim())} onClick={() => void redeem()}>
              {busy ? t('Redeeming…') : price > 0 ? t('Exchange {n} Loops', { n: String(price) }) : t('Redeem')}
            </button>
            <button className="btn btn--ghost" onClick={() => setStep('detail')}>{t('Back')}</button>
          </>
        )}

        {step === 'done' && result && (
          <>
            <p className="gam-sheet__ask">{t('It is yours. Enjoy taking care of yourself.')}</p>
            <Delivery code={result.code} link={result.link} expiresAt={result.expiresAt} />
            <button className="btn btn--primary" onClick={onClose}>{t('Done')}</button>
          </>
        )}
    </GamDialog>
  )
}

function Delivery({ code, link, expiresAt }: { code: string | null; link: string | null; expiresAt: number | null }) {
  const { t, d } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <div className="gam-code">
      {code && (
        <div className="gam-code__row">
          <code className="gam-code__value">{code}</code>
          <button
            className="btn btn--quiet gam-code__copy"
            onClick={() => { void navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => setCopied(false)) }}
          >
            <Icon name="copy" size={18} /> {copied ? t('Copied') : t('Copy')}
          </button>
        </div>
      )}
      {link && <a className="btn btn--ghost" href={link} target="_blank" rel="noopener noreferrer">{t('How to use it')}</a>}
      {expiresAt && <p className="small muted">{t('Valid until {date}', { date: d(expiresAt, { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>}
    </div>
  )
}

function MyBenefit({ r }: { r: Redemption }) {
  const { t } = useI18n()
  return (
    <div className={`card gam-mine__item${r.status === 'refunded' ? ' is-refunded' : ''}`}>
      <p className="gam-benefit__title">{r.title}</p>
      {r.partnerName && <p className="small muted">{r.partnerName}</p>}
      {r.status === 'refunded'
        ? <p className="small muted">{t('Returned — the Loops are back in your balance.')}</p>
        : <Delivery code={r.code} link={r.link} expiresAt={r.expiresAt} />}
      {r.terms && <p className="small muted">{r.terms}</p>}
    </div>
  )
}
