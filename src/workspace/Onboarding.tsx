/* ============================================================================
   Therapist Workspace — first-time flow (TH-ON-1 … TH-ON-4)

   Four screens, once. The therapist has ALREADY completed the 68-hour GLCP
   training on the external eLearning platform, so this flow does not teach
   anything: it verifies credentials and takes a legal signature.

   TH-ON-2 has four states, and they are genuinely different outcomes rather
   than cosmetic variants — approved auto-advances, rejected shows a reason and
   a resubmit path, and "documents needed" opens an upload for the specific
   thing the reviewer asked for. Treating them as one screen with a status line
   would lose the action each one needs.

   TH-ON-3 will not enable its checkbox until the terms have actually been
   scrolled to the bottom, because a signature block records a full name, a
   licence number and a timestamp — an audit trail is only worth having if the
   act it records was real.
   ============================================================================ */

import { useRef, useState } from 'react'
import { useI18n } from '../i18n'
import type { TherapistAccount, VerificationState } from './data'

interface OnboardingProps {
  account: TherapistAccount
  onSubmit: (patch: Partial<TherapistAccount>) => void
  onSign: () => void
  onFinish: (enterSandbox: boolean) => void
}

const REGIONS = ['SP', 'RJ', 'MG', 'RS', 'PR', 'BA', 'SC', 'PE', 'CE', 'DF', 'Other']

export function TherapistOnboarding({ account, onSubmit, onSign, onFinish }: OnboardingProps) {
  if (!account.submittedAt) return <Registration account={account} onSubmit={onSubmit} />
  if (account.verification !== 'approved') return <VerificationPending account={account} onSubmit={onSubmit} />
  if (!account.termsSignedAt) return <Terms account={account} onSign={onSign} />
  return <SandboxIntro onFinish={onFinish} />
}

/* ------------------------------------------------------------ TH-ON-1 --- */

function Registration({ account, onSubmit }: { account: TherapistAccount; onSubmit: OnboardingProps['onSubmit'] }) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    fullName: account.fullName,
    email: account.email,
    licenceNumber: account.licenceNumber,
    licenceRegion: account.licenceRegion || REGIONS[0],
    glcpNumber: account.glcpNumber,
    certificateName: account.certificateName ?? '',
    photoDataUrl: account.photoDataUrl,
  })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const photoRef = useRef<HTMLInputElement>(null)

  const errors: Record<string, string> = {}
  if (!form.fullName.trim()) errors.fullName = t('Required')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errors.email = t('Enter the email on your GLCP certificate')
  if (!form.licenceNumber.trim()) errors.licenceNumber = t('Required')
  if (!form.glcpNumber.trim()) errors.glcpNumber = t('Required')
  if (!form.certificateName) errors.certificateName = t('Upload your professional certificate')
  if (!form.photoDataUrl) errors.photoDataUrl = t('A photo is shown to patients during booking')

  const valid = Object.keys(errors).length === 0
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  const blur = (k: string) => setTouched((s) => ({ ...s, [k]: true }))
  const err = (k: string) => (touched[k] ? errors[k] : undefined)

  function readPhoto(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => set({ photoDataUrl: String(reader.result) })
    reader.readAsDataURL(file)
  }

  return (
    <div className="w-auth">
      <div className="w-auth__card">
        <div className="w-brand">Good Loop</div>
        <h1 className="w-h1">{t('Welcome to Good Loop')}</h1>
        <p className="w-lead">{t('Complete your professional registration to get started.')}</p>

        <div className="w-form">
          <Field label={t('Full name')} error={err('fullName')}>
            <input className="w-input" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} onBlur={() => blur('fullName')} />
          </Field>
          <Field label={t('Email')} hint={t('must match GLCP certification email')} error={err('email')}>
            <input className="w-input" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} onBlur={() => blur('email')} />
          </Field>
          <Field label={t('Professional license (CRP/CFP)')} error={err('licenceNumber')}>
            <input className="w-input" value={form.licenceNumber} onChange={(e) => set({ licenceNumber: e.target.value })} onBlur={() => blur('licenceNumber')} placeholder="06/158342" />
          </Field>
          <Field label={t('License issuing state/region')}>
            <select className="w-input" value={form.licenceRegion} onChange={(e) => set({ licenceRegion: e.target.value })}>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label={t('GLCP certification number')} hint={t('cross-validated with the training platform')} error={err('glcpNumber')}>
            <input className="w-input" value={form.glcpNumber} onChange={(e) => set({ glcpNumber: e.target.value })} onBlur={() => blur('glcpNumber')} />
          </Field>
          <Field label={t('Profile photo')} hint={t('shown to patients during booking · 400×400 min')} error={err('photoDataUrl')}>
            <div className="w-upload">
              {form.photoDataUrl && <img className="w-upload__thumb" src={form.photoDataUrl} alt="" />}
              <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => readPhoto(e.target.files?.[0])} />
              <button className="w-btn w-btn--ghost" onClick={() => photoRef.current?.click()}>
                {form.photoDataUrl ? t('Change photo') : t('Upload')}
              </button>
            </div>
          </Field>
          <Field label={t('Professional certificate')} hint={t('PDF/JPG/PNG · 10MB max')} error={err('certificateName')}>
            <label className="w-btn w-btn--ghost w-filebtn">
              {form.certificateName || t('Choose file')}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > 10 * 1024 * 1024) { blur('certificateName'); return }
                  set({ certificateName: f.name })
                }}
              />
            </label>
          </Field>
        </div>

        <button
          className="w-btn w-btn--primary w-btn--block"
          disabled={!valid}
          onClick={() =>
            onSubmit({
              ...form,
              verification: 'pending',
              verificationRef: `GLCP-VR-${Math.floor(10000 + Math.random() * 89999)}`,
              submittedAt: Date.now(),
            })
          }
        >
          {t('Submit for verification')}
        </button>
        <p className="w-small w-center">
          {t('Already have an account?')} <a href="#login">{t('Log in')}</a>
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ TH-ON-2 --- */

function VerificationPending({ account, onSubmit }: { account: TherapistAccount; onSubmit: OnboardingProps['onSubmit'] }) {
  const { t } = useI18n()
  const [extraDoc, setExtraDoc] = useState('')

  const copy: Record<VerificationState, { title: string; body: string }> = {
    pending: {
      title: t('Verification in progress'),
      body: t("Our team is reviewing your credentials. You'll receive an email within 48 hours."),
    },
    approved: { title: t('Approved'), body: t('Continuing to the next step…') },
    rejected: {
      title: t('We could not verify your credentials'),
      body: account.verificationReason ?? t('Please review your submission and try again.'),
    },
    'docs-needed': {
      title: t('Additional documents needed'),
      body: account.verificationReason ?? t('Our team needs one more document to complete the review.'),
    },
  }
  const c = copy[account.verification]

  return (
    <div className="w-auth">
      <div className="w-auth__card w-auth__card--center">
        <div className="w-hourglass" aria-hidden="true">⏳</div>
        <h1 className="w-h1">{c.title}</h1>
        <p className="w-lead">{c.body}</p>
        <p className="w-small">{t('Reference:')} <span className="w-mono">{account.verificationRef}</span></p>

        {account.verification === 'docs-needed' && (
          <>
            <label className="w-btn w-btn--ghost w-filebtn">
              {extraDoc || t('Upload document')}
              <input type="file" hidden onChange={(e) => setExtraDoc(e.target.files?.[0]?.name ?? '')} />
            </label>
            <button
              className="w-btn w-btn--primary w-btn--block"
              disabled={!extraDoc}
              onClick={() => onSubmit({ verification: 'pending', verificationReason: undefined })}
            >
              {t('Submit')}
            </button>
          </>
        )}

        {account.verification === 'rejected' && (
          <button className="w-btn w-btn--primary w-btn--block" onClick={() => onSubmit({ submittedAt: null })}>
            {t('Update and resubmit')}
          </button>
        )}

        {account.verification === 'pending' && (
          <>
            <button className="w-link" onClick={() => onSubmit({ submittedAt: null })}>
              {t('Need to update your submission?')}
            </button>
            {/* Stands in for the reviewer's decision arriving by email. */}
            <button className="w-link w-link--quiet" onClick={() => onSubmit({ verification: 'approved' })}>
              {t('Simulate approval (demo)')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ TH-ON-3 --- */

const TERMS = `Good Loop Professional Platform — Terms & Conditions

1. Scope of use
The Good Loop Professional Platform provides audio protocols, a session workspace and clinical documentation tools for use by licensed mental-health professionals who have completed Good Loop Clinical Practitioner (GLCP) certification.

2. Professional responsibility
Clinical judgement remains entirely yours. Good Loop protocols are an adjunct to your practice. You determine which protocol is appropriate for a patient, when to run it, when to pause or intervene, and when not to use one at all. Nothing in the platform constitutes a clinical recommendation.

3. Patient consent
You may not run a Good Loop protocol without an active therapy-data consent from the patient. The pre-launch checklist verifies that consent and will refuse to start treatment without it.

4. Confidentiality
Clinical notes, session reports, assessment results and messages are end-to-end encrypted and are not visible to Good Loop administrators or to any corporate client. A corporate client receives only aggregate, k-anonymised programme statistics and a single anonymous count of employees using professional support.

5. Records and signature
Session reports carry your digital signature — your full name, your professional licence number, and a timestamp. Re-opening and re-signing a report creates a new version; previous versions are preserved in an audit trail and are never deleted.

6. Audio safety
Protocols are mastered to a fixed loudness target with a true-peak limiter. The patient application enforces a maximum sound pressure level. You must instruct patients to use stereo headphones and must not run a protocol where the pre-launch stereo check has failed.

7. Data protection
You process patient data as a controller under applicable data-protection law (GDPR / LGPD). Good Loop acts as a processor for the data held on the platform. Patients may export or delete their data at any time.

8. Availability and scheduling
Sessions you accept through the platform are commitments to your patients. Cancellations and reschedules should follow your own professional practice standards.

9. Suspension
Good Loop may suspend access where certification lapses, where a professional licence is withdrawn, or where platform use breaches these terms.

10. Changes
Material changes to these terms will be notified by email and require a new signature before continued use.

By signing below you confirm that you have read and agree to these Terms & Conditions.`

function Terms({ account, onSign }: { account: TherapistAccount; onSign: () => void }) {
  const { t } = useI18n()
  const [atBottom, setAtBottom] = useState(false)
  const [checked, setChecked] = useState(false)

  return (
    <div className="w-auth">
      <div className="w-auth__card">
        <h1 className="w-h1">{t('Terms & Conditions')}</h1>
        <div
          className="w-terms"
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setAtBottom(true)
          }}
        >
          <pre>{TERMS}</pre>
        </div>
        {!atBottom && <p className="w-small">↓ {t('Scroll to the bottom to enable signature')}</p>}

        <div className="w-signature">
          {t('I,')} <strong>{account.fullName}</strong>, {t('CRP')} <strong>{account.licenceNumber}</strong>,{' '}
          {t('agree to the Terms & Conditions of the Good Loop Professional Platform.')}
        </div>

        <label className={`w-check${atBottom ? '' : ' is-disabled'}`}>
          <input type="checkbox" disabled={!atBottom} checked={checked} onChange={() => setChecked((v) => !v)} />
          {t('I have read and agree to the Terms & Conditions')}
        </label>

        <button className="w-btn w-btn--primary w-btn--block" disabled={!checked} onClick={onSign}>
          {t('Sign and continue')}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ TH-ON-4 --- */

function SandboxIntro({ onFinish }: { onFinish: OnboardingProps['onFinish'] }) {
  const { t } = useI18n()
  return (
    <div className="w-auth">
      <div className="w-auth__card w-auth__card--center">
        <div className="w-hourglass" aria-hidden="true">🎛️</div>
        <h1 className="w-h1">{t('Your practice environment is ready')}</h1>
        <p className="w-lead">
          {t('The Sandbox lets you explore every feature of the workspace with a virtual patient. No real data, no consequences — just practice.')}
        </p>
        <ul className="w-bullets">
          <li>{t('Try the video call interface and three-tab layout')}</li>
          <li>{t('Test protocol selection and treatment monitoring')}</li>
          <li>{t('Practice note-taking and report signing')}</li>
          <li>{t('Always available from your sidebar')}</li>
        </ul>
        <button className="w-btn w-btn--primary w-btn--block" onClick={() => onFinish(true)}>{t('Enter Sandbox')}</button>
        <button className="w-btn w-btn--ghost w-btn--block" onClick={() => onFinish(false)}>{t('Go to my workspace')}</button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="w-field">
      <span className="w-field__label">
        {label}
        {hint && <em> · {hint}</em>}
      </span>
      {children}
      {error && <span className="w-error">{error}</span>}
    </label>
  )
}
