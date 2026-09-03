/* ============================================================================
   Self Use — Safety Gateway

   Three levels, and the difference between them is WHO opened them:

     Level 1  informative, always present. Static text at the foot of Profile.
              Rendered by ProfileTab, not here.
     Level 2  data-triggered (SAFE-2). Shown ONCE per trigger cycle.
     Level 3  user-triggered (SAFE-3) by "Need support" in post-session feedback.

   Neither modal is diagnostic and neither is alarmist. They never name a
   condition, never score anything, and never tell a person what is wrong with
   them — they offer a way to reach a human. Level 2 is dismissible; Level 3 is
   closed by the person choosing to go back.
   ============================================================================ */

import { useI18n } from '../i18n'
import { GENERIC_CRISIS, type EapContact } from '../data/convention'
import { Icon } from './icons'

interface GatewayProps {
  /** The company EAP when one is configured; the generic line is always added. */
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

/** SAFE-3 — user-triggered from post-session feedback. */
export function SafetyLevel3({ eap, onClose }: GatewayProps) {
  const { t } = useI18n()
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
            <ContactCard c={GENERIC_CRISIS} kind={t('Crisis helpline')} />
          </div>
        </div>
        <div className="screen__footer">
          <button className="btn btn--primary" onClick={onClose}>{t('Back to Home')}</button>
        </div>
      </div>
    </div>
  )
}

/** SAFE-2 — data-triggered. Empathetic, dismissible, shown once per cycle. */
export function SafetyLevel2({ eap, onClose }: GatewayProps) {
  const { t } = useI18n()
  return (
    <div className="sheet-scrim" role="dialog" aria-modal="true">
      <div className="sheet safety-sheet fade-in">
        <h3 className="display sheet__title">{t('Checking in — how are you doing?')}</h3>
        <p className="lead">
          {t("We've noticed things have felt heavier lately. That's completely okay. If it would help, support is here whenever you're ready.")}
        </p>
        <div className="safety__cards">
          <ContactCard c={eap ?? GENERIC_CRISIS} kind={eap ? t('Your company support (EAP)') : t('Crisis helpline')} />
        </div>
        <button className="btn btn--quiet" onClick={onClose}>{t('Not now')}</button>
      </div>
    </div>
  )
}

/** Level 1 — the static footer that is always present at the foot of Profile. */
export function SafetyLevel1() {
  const { t } = useI18n()
  return (
    <p className="small muted safety-l1">
      {t('Good Loop is a personal wellbeing and development program. It does not replace professional mental health support. If you need specialized assistance, talk to your doctor or your company’s support service.')}
    </p>
  )
}
