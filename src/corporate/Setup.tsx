/* ============================================================================
   Corporate Dashboard — Initial Setup Wizard (CORP-SETUP-1 … 5)

   Shown ONCE, when the HR admin first opens a pre-provisioned tenant. Good
   Loop created the tenant after the commercial agreement; this wizard only
   configures the operational details.

   What HR can and cannot set, and why:
   · Convention type and licence count are CONFIRMED, not chosen — they come
     from the contract, so showing them as editable fields would be a lie about
     who decides.
   · The company code is generated, reusable, and does not expire. It is not a
     credential: it links an account to a tenant and determines which benefits
     that person gets.
   · The EAP contact feeds the employee app's Safety Gateway. If it is left
     blank the gateway falls back to a generic crisis line — never to nothing.
   · Step 4 exists only for a Professional Support convention, and even then it
     can be skipped: an empty therapist list is a valid finished setup.

   Credential verification is Good Loop's job, not HR's. HR invites an email
   address and never sees a therapist's patients, sessions, or performance.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { conventionBlurb, conventionLabel, type EapContact } from '../data/convention'
import { generateCompanyCode, type CorporateState, type TherapistRow } from './metrics'
import { BrandLogo } from '../components/Brand'

interface SetupProps {
  state: CorporateState
  onDone: (patch: Partial<CorporateState>) => void
}

const TOTAL = 5

export function SetupWizard({ state, onDone }: SetupProps) {
  const { t } = useI18n()
  const [step, setStep] = useState(1)
  const plus = state.conventionType === 'self-use-plus'

  const [code] = useState(() => state.companyCode || generateCompanyCode(state.profile.name))
  const [copied, setCopied] = useState(false)

  const [eap, setEap] = useState<EapContact>({ provider: '', phone: '', email: '', website: '', info: '' })
  const [invites, setInvites] = useState<TherapistRow[]>([])
  const [inviteEmail, setInviteEmail] = useState('')

  /* Step 4 does not exist without Professional Support, so the step AFTER 3 is
     5 in that case. Keeping the numbering stable (rather than renumbering the
     screens) means the progress rail matches the spec's screen ids. */
  const next = (from: number) => setStep(from === 3 && !plus ? 5 : from + 1)
  const back = (from: number) => setStep(from === 5 && !plus ? 3 : from - 1)

  function copyCode() {
    navigator.clipboard?.writeText(code).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800) },
      () => { /* clipboard blocked — the code is on screen and selectable */ },
    )
  }

  function sendInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return
    if (invites.some((i) => i.email === email)) return
    setInvites((list) => [
      ...list,
      { id: `inv-${Date.now()}`, name: '', crp: '', specializations: [], status: 'pending-invitation', email, invitedAt: Date.now() },
    ])
    setInviteEmail('')
  }

  function finish() {
    onDone({
      setupDoneAt: Date.now(),
      companyCode: code,
      eap: eap.provider.trim() && eap.phone.trim() ? eap : null,
      therapists: invites,
    })
  }

  return (
    <div className="c-setup">
      <div className="c-setup__card">
        <div className="c-brand"><BrandLogo /></div>
        <Rail step={step} plus={plus} />

        {step === 1 && (
          <>
            <h1 className="c-h1">{t('Welcome to Good Loop for {company}', { company: state.profile.name })}</h1>
            <p className="c-lead">
              {t("Your company's wellbeing program is ready to configure. This setup takes about 5 minutes.")}
            </p>
            <div className="c-panel">
              <div className="c-panel__label">{t('Your convention')}</div>
              <div className="c-panel__value">{t(conventionLabel(state.conventionType))}</div>
              <p className="c-small">{t(conventionBlurb(state.conventionType))}</p>
            </div>
            <div className="c-panel c-panel--count">
              <div className="c-bignum">{state.licences}</div>
              <div className="c-small">{t('employee licenses')}</div>
            </div>
            <p className="c-note">
              {t('Convention & licenses are set by the commercial agreement — shown as confirmation, not editable.')}
            </p>
            <button className="c-btn c-btn--primary" onClick={() => next(1)}>{t('Continue setup')}</button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="c-h1">{t('Your company code')}</h1>
            <p className="c-lead">
              {t('Employees use this code when registering in the Good Loop app to link their account to {company}.', { company: state.profile.name })}
            </p>
            <div className="c-code">
              <span className="c-code__value">{code}</span>
              <button className="c-btn c-btn--ghost" onClick={copyCode}>{copied ? t('Copied') : t('Copy')}</button>
            </div>
            <ul className="c-bullets">
              <li>{t('Reusable code — share it via email, intranet, or onboarding materials.')}</li>
              <li>{t('It determines which convention benefits your employees receive.')}</li>
              <li>{t('You can regenerate it later from Management if needed.')}</li>
            </ul>
            <div className="c-actions">
              <button className="c-btn c-btn--ghost" onClick={() => back(2)}>{t('Back')}</button>
              <button className="c-btn c-btn--primary" onClick={() => next(2)}>{t('Continue')}</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="c-h1">{t('Employee Assistance Program contact')}</h1>
            <p className="c-lead">
              {t('Shown to employees through the Safety Gateway if they need immediate support.')}
            </p>
            <EapForm value={eap} onChange={setEap} />
            <div className="c-preview">
              <div className="c-preview__label">{t('How it appears to employees')}</div>
              <div className="c-preview__card">
                <strong>{eap.provider || t('EAP provider name')}</strong>
                <span>{[eap.phone, eap.info].filter(Boolean).join(' · ') || t('Phone · availability')}</span>
              </div>
            </div>
            <p className="c-note">
              {t('If you leave this blank, employees see a generic crisis helpline instead. It is never empty.')}
            </p>
            <div className="c-actions">
              <button className="c-btn c-btn--ghost" onClick={() => back(3)}>{t('Back')}</button>
              <button className="c-btn c-btn--primary" onClick={() => next(3)}>{t('Continue')}</button>
            </div>
          </>
        )}

        {step === 4 && plus && (
          <>
            <h1 className="c-h1">{t('Invite therapists')}</h1>
            <p className="c-lead">
              {t('Add the licensed professionals who will provide therapy sessions. You can invite them now or later.')}
            </p>
            <div className="c-inviterow">
              <input
                className="c-input"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="therapist@email.com"
                onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
              />
              <button className="c-btn c-btn--primary" onClick={sendInvite}>{t('Send invite')}</button>
            </div>
            <ul className="c-invitelist">
              {invites.map((i) => (
                <li key={i.id}>
                  <span className="c-avatar" aria-hidden="true">{(i.email ?? '').slice(0, 2).toUpperCase()}</span>
                  <span className="c-invitelist__mail">{i.email}</span>
                  <span className="c-small">{t('Invitation sent')}</span>
                  <button className="c-link" onClick={() => setInvites((l) => l.filter((x) => x.id !== i.id))}>
                    {t('Remove')}
                  </button>
                </li>
              ))}
            </ul>
            <div className="c-panel">
              <div className="c-panel__label">{t('What happens next')}</div>
              <p className="c-small">
                {t('Existing Good Loop therapists receive a notification to accept. New ones get an email to register and complete credential verification. Status updates appear in Management.')}
              </p>
            </div>
            <div className="c-actions">
              <button className="c-btn c-btn--ghost" onClick={() => back(4)}>{t('Back')}</button>
              <button className="c-btn c-btn--primary" onClick={() => next(4)}>{t('Continue')}</button>
            </div>
            <button className="c-link c-link--center" onClick={() => next(4)}>
              {t("Skip for now — I'll add therapists later")}
            </button>
          </>
        )}

        {step === 5 && (
          <>
            <div className="c-success" aria-hidden="true">✓</div>
            <h1 className="c-h1">{t('Setup complete')}</h1>
            <p className="c-lead">{t("Your Good Loop wellbeing program is ready. Here's your summary:")}</p>
            <dl className="c-summary">
              <div><dt>{t('Convention')}</dt><dd>{t(conventionLabel(state.conventionType))}</dd></div>
              <div><dt>{t('Employee licenses')}</dt><dd>{state.licences}</dd></div>
              <div>
                <dt>{t('Company code')}</dt>
                <dd className="c-mono">{code} <button className="c-link" onClick={copyCode}>{copied ? t('Copied') : t('Copy')}</button></dd>
              </div>
              <div><dt>{t('EAP contact')}</dt><dd>{eap.provider || t('Generic crisis helpline')}</dd></div>
              {plus && <div><dt>{t('Therapists invited')}</dt><dd>{invites.length}</dd></div>}
            </dl>
            <ul className="c-bullets">
              <li>{t('Share the company code with employees so they can register.')}</li>
              <li>{t('Your dashboard will start showing data once employees begin using the app.')}</li>
              <li>{t('Auto-generated reports will be available at the end of each month.')}</li>
            </ul>
            <button className="c-btn c-btn--primary" onClick={finish}>{t('Go to dashboard')}</button>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */

function Rail({ step, plus }: { step: number; plus: boolean }) {
  const steps = plus ? [1, 2, 3, 4, 5] : [1, 2, 3, 5]
  return (
    <ol className="c-rail" aria-label={`Step ${step} of ${TOTAL}`}>
      {steps.map((n, i) => (
        <li key={n} className={n < step ? 'is-done' : n === step ? 'is-now' : ''}>
          {n < step ? '✓' : i + 1}
        </li>
      ))}
    </ol>
  )
}

export function EapForm({ value, onChange }: { value: EapContact; onChange: (v: EapContact) => void }) {
  const { t } = useI18n()
  const set = (patch: Partial<EapContact>) => onChange({ ...value, ...patch })
  return (
    <div className="c-form">
      <label className="c-field">
        <span className="c-field__label">{t('EAP provider name')} <em>*</em></span>
        <input className="c-input" value={value.provider} onChange={(e) => set({ provider: e.target.value })} placeholder="WellMind Support Services" />
      </label>
      <label className="c-field">
        <span className="c-field__label">{t('Phone number')} <em>*</em></span>
        <input className="c-input" value={value.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+1 800 555 0142" />
      </label>
      <label className="c-field">
        <span className="c-field__label">{t('Email')}</span>
        <input className="c-input" type="email" value={value.email ?? ''} onChange={(e) => set({ email: e.target.value })} placeholder="help@wellmind.example" />
      </label>
      <label className="c-field">
        <span className="c-field__label">{t('Website')}</span>
        <input className="c-input" value={value.website ?? ''} onChange={(e) => set({ website: e.target.value })} placeholder="https://" />
      </label>
      <label className="c-field c-field--wide">
        <span className="c-field__label">{t('Additional info')}</span>
        <textarea
          className="c-input"
          rows={2}
          value={value.info ?? ''}
          onChange={(e) => set({ info: e.target.value })}
          placeholder={t('Available 24/7 · Quote company code when calling')}
        />
      </label>
    </div>
  )
}
