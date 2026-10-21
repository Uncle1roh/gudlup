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
import { copyFor } from '../gamification/copy'
import { fmtMinutes, nextAchievement, type AchievementView } from '../gamification/achievements'
import { DEFAULT_ECONOMY, displayLoops, type EconomySettings, type Wallet } from '../gamification/economy'
import {
  PILLARS, RedeemError, byPillar, missingLoops, standardSessionsFor,
  type BenefitView, type Redemption, type RedeemResult,
} from '../gamification/benefits'

export function BenefitsTab({ onStartSession, onSeeAchievements }: { onStartSession: () => void; onSeeAchievements: () => void }) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [list, setList] = useState<BenefitView[] | null>(null)
  const [mine, setMine] = useState<Redemption[]>([])
  const [next, setNext] = useState<AchievementView | null>(null)
  const [cfg, setCfg] = useState<EconomySettings>(DEFAULT_ECONOMY)
  const [open, setOpen] = useState<BenefitView | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    Promise.all([dp.getWallet(), dp.getAvailableBenefits(), dp.listMyRedemptions()])
      .then(([w, b, r]) => { setWallet(w); setList(b); setMine(r) })
      .catch(() => setFailed(true))
    dp.listMyAchievements().then((a) => setNext(nextAchievement(a))).catch(() => setNext(null))
    dp.getEconomySettings().then(setCfg).catch(() => { /* the defaults estimate well enough */ })
  }, [dp])
  useEffect(() => { load() }, [load])

  if (failed) {
    return (
      <div className="su-page benefits">
        <h1 className="display su-h1">{t('Benefits')}</h1>
        <p className="small muted">{t('Your benefits could not be loaded right now.')}</p>
      </div>
    )
  }
  if (!wallet || !list) {
    return (
      <div className="su-page benefits">
        <h1 className="display su-h1">{t('Benefits')}</h1>
        <p className="small muted" aria-busy="true">{t('Loading…')}</p>
      </div>
    )
  }

  const pillars = byPillar(list)
  const unlocked = list.filter((b) => b.challengeExclusive)

  return (
    <div className="su-page benefits">
      <h1 className="display su-h1">{t('Benefits')}</h1>

      {/* 1 — the care, then the Loops it became */}
      <section className="gam-care" aria-label={t('Your care')}>
        <p className="eyebrow">{t('Your care')}</p>
        <p className="gam-care__time">{t('You gave {time} to yourself this month', { time: fmtMinutes(wallet.minutesMonth) })}</p>
        <p className="gam-care__loops"><Icon name="loop" size={22} /> {t('= {n} Loops', { n: String(wallet.loops) })}</p>
        <p className="small">{t('Every Loop is born from a minute of care for your mind.')}</p>
        {wallet.multiplier !== null && (
          <p className="small gam-care__mult">{t('Your company multiplies your Loops by {x}×', { x: wallet.multiplier.toLocaleString('pt-BR') })}</p>
        )}
        <button className="btn btn--ghost gam-care__start" onClick={onStartSession}>{t('Start a session')}</button>
      </section>

      {/* 2 — the next milestone */}
      {next && (
        <button className="card gam-milestone" onClick={onSeeAchievements}>
          <Badge icon={next.icon} tier={next.tier} shape="circle" size={48} locked />
          <span className="gam-milestone__body">
            <span className="eyebrow">{t('Next milestone of care')}</span>
            <span className="gam-milestone__name">{t(copyFor(next.slug).name)}</span>
            <span className="gam-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, ((next.value ?? 0) / next.threshold) * 100)}%` }} /></span>
          </span>
        </button>
      )}

      {/* 3 — by pillar */}
      {PILLARS.map((p) => {
        const items = pillars.get(p.id) ?? []
        if (!items.length) return null
        return (
          <section key={p.id} className="gam-pillar" aria-labelledby={`pillar-${p.id}`}>
            <h2 id={`pillar-${p.id}`} className="home__sect gam-pillar__title">
              <span className="gam-pillar__tile" aria-hidden="true"><Icon name={p.icon} size={18} /></span>
              {t(p.label)}
            </h2>
            <ul className="gam-benefits">
              {items.map((b) => (
                <li key={b.id}>
                  <BenefitCard b={b} wallet={wallet} cfg={cfg} onOpen={() => setOpen(b)} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {/* 4 — unlocked by challenges */}
      {unlocked.length > 0 && (
        <section className="gam-pillar">
          <h2 className="home__sect">{t('Unlocked by challenges')}</h2>
          <ul className="gam-benefits">
            {unlocked.map((b) => (
              <li key={b.id}><BenefitCard b={b} wallet={wallet} cfg={cfg} onOpen={() => setOpen(b)} /></li>
            ))}
          </ul>
        </section>
      )}

      {/* 5 — what you redeemed */}
      <section className="gam-pillar">
        <h2 className="home__sect">{t('My benefits')}</h2>
        {mine.length === 0 ? (
          <p className="small muted">{t('What you redeem appears here, with its code and how to use it.')}</p>
        ) : (
          <ul className="gam-mine">
            {mine.map((r) => <li key={r.id}><MyBenefit r={r} /></li>)}
          </ul>
        )}
      </section>

      {open && (
        <BenefitSheet
          b={open}
          wallet={wallet}
          cfg={cfg}
          onClose={() => setOpen(null)}
          onRedeemed={() => load()}
        />
      )}
    </div>
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RedeemResult | null>(null)
  const line = priceLine(t, b, wallet, cfg)
  const identified = b.deliveryType === 'identified'
  const price = displayLoops(b.priceLoopsCenti ?? 0)

  async function redeem() {
    setBusy(true)
    setError(null)
    try {
      const r = await dp.redeemBenefit(b.id, identified ? consent : false)
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
    <div className="sheet-scrim" role="dialog" aria-modal="true" aria-labelledby="gam-benefit-title" onClick={onClose}>
      <div className="sheet gam-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" aria-hidden="true" />
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
              <label className="legal-ack">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{t('To deliver this benefit, your name and employee number will be shared with your company’s HR. Nothing else is shared.')}</span>
              </label>
            )}
            {error && <p className="small" role="alert">{error}</p>}
            <button className="btn btn--primary" disabled={busy || (identified && !consent)} onClick={() => void redeem()}>
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
      </div>
    </div>
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
