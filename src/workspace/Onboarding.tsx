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

   That state is the SERVER's. It used to be a field in this browser's own
   workspace store, next to a button that set it to "approved" — so the screen
   that exists to check whether somebody is a clinician was answered by the
   person being checked, and the certificate they chose was never uploaded
   anywhere: the form kept the file NAME. A reviewer in the admin console was
   approving a string somebody had typed about themselves.

   Now: the file goes to the private `credentials` bucket, the row is written
   by `submit_credentials()` which can only ever set status back to 'pending',
   and this screen reads `therapists.status` back. Nothing here can approve
   anybody, which is the only property this screen really needs.

   TH-ON-3 will not enable its checkbox until the terms have actually been
   scrolled to the bottom, because a signature block records a full name, a
   licence number and a timestamp — an audit trail is only worth having if the
   act it records was real.
   ============================================================================ */

import { useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { uploadCredentialDoc, type CredentialDoc } from '../b2b/credentials'
import type { Therapist } from '../b2b/data'
import type { TherapistAccount } from './data'

interface OnboardingProps {
  account: TherapistAccount
  /** The credential record as the SERVER has it. The only thing that decides
      whether this flow is over. */
  cred: Therapist
  onSubmit: (patch: Partial<TherapistAccount>) => void
  /** Re-read the credential record after a submission. */
  onCredChanged: () => void
  onSign: () => void
  onFinish: (enterSandbox: boolean) => void
}

const REGIONS = ['SP', 'RJ', 'MG', 'RS', 'PR', 'BA', 'SC', 'PE', 'CE', 'DF', 'Other']

export function TherapistOnboarding({ account, cred, onSubmit, onCredChanged, onSign, onFinish }: OnboardingProps) {
  /* Registration is asked for once; after that the SERVER decides whether this
     flow continues. A therapist who has submitted sits on TH-ON-2 until a
     reviewer moves them, and no amount of clicking in here changes that. */
  if (!account.submittedAt && !cred.documents.length) {
    return <Registration account={account} cred={cred} onSubmit={onSubmit} onCredChanged={onCredChanged} />
  }
  if (cred.status !== 'approved') return <VerificationPending account={account} cred={cred} onCredChanged={onCredChanged} />
  if (!account.termsSignedAt) return <Terms account={account} onSign={onSign} />
  return <SandboxIntro onFinish={onFinish} />
}

/* ------------------------------------------------------------ TH-ON-1 --- */

function Registration({ account, cred, onSubmit, onCredChanged }: {
  account: TherapistAccount
  cred: Therapist
  onSubmit: OnboardingProps['onSubmit']
  onCredChanged: () => void
}) {
  const { t } = useI18n()
  const dp = useDataProvider()
  /* The FILE, not its name. The old form kept `f.name` and dropped the file on
     the floor, so "Professional certificate" was a field that recorded that a
     file had once been chosen. */
  const [certificate, setCertificate] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState<string | null>(null)

  /** Upload first, then write the row. A row pointing at an object that failed
      to upload would put an empty review in front of a reviewer. */
  async function send(form: Partial<TherapistAccount>) {
    setSendErr(null)
    setSending(true)
    try {
      const docs: CredentialDoc[] = [...cred.documents]
      if (certificate) docs.push(await uploadCredentialDoc(certificate))
      /* The registration number the reviewer checks. The local account calls it
         a licence; the therapists row calls it `crp`. Same number. */
      await dp.submitCredentials(String(form.licenceNumber ?? account.licenceNumber ?? ''), docs)
      onSubmit({ ...form, submittedAt: Date.now() })
      onCredChanged()
    } catch (e) {
      setSendErr((e as Error).message)
    } finally {
      setSending(false)
    }
  }
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
                  setCertificate(f)
                  set({ certificateName: f.name })
                }}
              />
            </label>
          </Field>
        </div>

        {sendErr && <p className="w-small w-err">{sendErr}</p>}
        <button
          className="w-btn w-btn--primary w-btn--block"
          disabled={!valid || sending}
          onClick={() => void send({ ...form, verificationRef: `GLCP-VR-${Math.floor(10000 + Math.random() * 89999)}` })}
        >
          {sending ? t('Sending…') : t('Submit for verification')}
        </button>
        <p className="w-small w-center">
          {t('Already have an account?')} <a href="#login">{t('Log in')}</a>
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ TH-ON-2 --- */

function VerificationPending({ account, cred, onCredChanged }: {
  account: TherapistAccount
  cred: Therapist
  onCredChanged: () => void
}) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [extra, setExtra] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function resubmit() {
    if (!extra) return
    setErr(null)
    setSending(true)
    try {
      const doc = await uploadCredentialDoc(extra)
      await dp.submitCredentials(cred.crp, [...cred.documents, doc])
      setExtra(null)
      onCredChanged()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const copy: Record<Therapist['status'], { title: string; body: string }> = {
    pending: {
      title: t('Verification in progress'),
      body: t("Our team is reviewing your credentials. You'll receive an email within 48 hours."),
    },
    approved: { title: t('Approved'), body: t('Continuing to the next step…') },
    rejected: {
      title: t('We could not verify your credentials'),
      body: cred.reason ?? t('Please review your submission and try again.'),
    },
    more_info: {
      title: t('Additional documents needed'),
      body: cred.reason ?? t('Our team needs one more document to complete the review.'),
    },
  }
  const c = copy[cred.status]

  return (
    <div className="w-auth">
      <div className="w-auth__card w-auth__card--center">
        <div className="w-hourglass" aria-hidden="true">⏳</div>
        <h1 className="w-h1">{c.title}</h1>
        <p className="w-lead">{c.body}</p>
        <p className="w-small">{t('Reference:')} <span className="w-mono">{account.verificationRef}</span></p>

        {/* What the reviewer is actually looking at. Seeing the list is what
            tells a clinician whether the thing they were asked for arrived. */}
        {cred.documents.length > 0 && (
          <ul className="w-docs">
            {cred.documents.map((d) => (
              <li key={d.path}>
                <span className="w-docs__name">📄 {d.name}</span>
                <span className="w-small">{(d.sizeBytes / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
        )}

        {/* Adding a document is possible in every un-approved state: waiting,
            sent back for more, or refused. There is nothing else to do here,
            and making someone wait to be allowed to answer helps no one. */}
        <label className="w-btn w-btn--ghost w-filebtn">
          {extra?.name ?? t('Upload document')}
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            hidden
            onChange={(e) => setExtra(e.target.files?.[0] ?? null)}
          />
        </label>
        {err && <p className="w-small w-err">{err}</p>}
        <button className="w-btn w-btn--primary w-btn--block" disabled={!extra || sending} onClick={() => void resubmit()}>
          {sending ? t('Sending…') : t('Submit')}
        </button>

        <p className="w-small">
          {t('A reviewer at Good Loop decides this. You will not see patients until they do.')}
        </p>
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
