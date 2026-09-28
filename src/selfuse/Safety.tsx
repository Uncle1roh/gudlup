/* ============================================================================
   Self Use — the support screen

   ONE way in, and the person opens it: "I need support" at the end of a
   session (SafetyLevel3). It offers a way to reach a human — the company's
   own support contact where one is configured, and the crisis numbers of the
   person's market from configuration (CRS-03), never from a constant.

   What used to be here and is gone on purpose: "Level 2", a sheet the app
   opened by itself after reading the check-in and mood series ("we've
   noticed things have felt heavier lately"). A notice triggered by what a
   person entered or rated is an output about that person and is the
   behaviour the legal framework forbids outright (Feature Register MN-03,
   MN-19). The persistent Help now button is the static replacement.
   ============================================================================ */

import { useI18n } from '../i18n'
import type { EapContact } from '../data/convention'
import { useLegal } from '../legal/LegalContext'
import { Icon } from './icons'

interface GatewayProps {
  /** The company EAP when one is configured; the market's numbers always follow. */
  eap: EapContact | null
  onClose: () => void
}

function ContactCard({ c, kind }: { c: EapContact; kind: string }) {
  return (
    <a className="safety-card" href={`tel:${c.phone.replace(/\s/g, '')}`}>
      <div className="safety-card__kind">{kind}</div>
      <div className="safety-card__name">{c.provider}</div>
      <div className="safety-card__phone">{c.phone}</div>
      {c.info && <div className="safety-card__info">{c.info}</div>}
      {c.email && <div className="safety-card__info">{c.email}</div>}
    </a>
  )
}

/** Opened by the person from the end-of-session screen. */
export function SafetyLevel3({ eap, onClose }: GatewayProps) {
  const { t } = useI18n()
  const { crisis } = useLegal()
  return (
    <div className="app-frame su-studio">
      <div className="screen screen--center safety">
        <div className="screen__body safety__body">
          <div className="safety__mark" aria-hidden="true"><Icon name="support" size={26} /></div>
          <h2 className="display">{t("We're here to help you find support")}</h2>
          <p className="lead">
            {t("If you're going through a difficult moment, you don't have to face it alone. These resources can help right now.")}
          </p>

          <div className="safety__cards">
            {eap && <ContactCard c={eap} kind={t('Your company support (EAP)')} />}
            {crisis.map((r) => (
              <ContactCard
                key={r.id}
                c={{ provider: r.label, phone: r.number, info: r.hours }}
                kind={t('Emergency and support lines')}
              />
            ))}
          </div>
          <p className="small muted">{t('Good Loop can’t respond to emergencies. Good Loop is a wellbeing service and does not replace professional care.')}</p>
        </div>
        <div className="screen__footer">
          <button className="btn btn--primary" onClick={onClose}>{t('Back to Home')}</button>
        </div>
      </div>
    </div>
  )
}

/** The static line at the foot of Profile. */
export function SafetyLevel1() {
  const { t } = useI18n()
  return (
    <p className="small muted safety-l1">
      {t('Good Loop is a wellbeing service. It is not treatment and does not replace professional mental health support. If you need specialised help, talk to your doctor or your company’s support service.')}
    </p>
  )
}
