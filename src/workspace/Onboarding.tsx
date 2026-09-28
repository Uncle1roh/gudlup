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
import { useLegal } from '../legal/LegalContext'
import { HelpNowButton } from '../legal/HelpNow'
import { legalDoc, blocksFor } from '../legal/corpus'
import { LEGAL_VERSION } from '../legal/types'
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

/* The professional registers with ONE of two bodies: a Brazilian regional
   council (CRP, by region) or an Italian Ordine (by region). Which one is
   the first thing a reviewer needs to know and the first thing the person's
   profile prints (PRF-1 / PRF-1-IT). */
const CRP_REGIONS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24']
const ORDINE_REGIONS = ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto']

export function TherapistOnboarding({ account, cred, onSubmit, onCredChanged, onSign, onFinish }: OnboardingProps) {
  // above every return: a hook after one would change the hook count
  const legal = useLegal()
  /* Registration is asked for once; after that the SERVER decides whether this
     flow continues. A therapist who has submitted sits on TH-ON-2 until a
     reviewer moves them, and no amount of clicking in here changes that.

     APPROVED IS APPROVED. This used to ask for a registration whenever the
     credential row carried no uploaded documents — and a therapist approved by
     a reviewer who filed the paperwork elsewhere has none. They were sent to
     fill in a form about credentials that had already been accepted, on every
     browser they opened, and the workspace behind it stayed shut. The local
     `submittedAt` is a UI breadcrumb; the row's status is the fact. */
  if (cred.status !== 'approved' && !account.submittedAt && !cred.documents.length) {
    return <WithHelp><Registration account={account} cred={cred} onSubmit={onSubmit} onCredChanged={onCredChanged} /></WithHelp>
  }
  if (cred.status !== 'approved') return <WithHelp><VerificationPending account={account} cred={cred} onCredChanged={onCredChanged} /></WithHelp>
  /* The Terms screen is owed until the SERVER has this version accepted —
     the same test the gate in WorkspaceApp applies. Keying it on the local
     `termsSignedAt` alone was a loop: every therapist who signed before the
     acceptance was recorded server-side (all of them, the day versioned terms
     shipped, and anyone after a new version) skipped the Terms, landed on the
     sandbox intro, and was sent back to it by the gate on every click. */
  if (!account.termsSignedAt || (legal.loaded && !legal.accepted('professional'))) {
    return <WithHelp><Terms account={account} onSign={onSign} /></WithHelp>
  }
  return <WithHelp><SandboxIntro onFinish={onFinish} /></WithHelp>
}

/** Help now on the first-time screens too (CRS-01): every screen, not only
    the ones behind the gate. */
export function WithHelp({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-authwrap">
      <div className="w-auth__help"><HelpNowButton variant="inline" /></div>
      {children}
    </div>
  )
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
  /* M2R-01/03/04: which body, where they practise from, and their cover. The
     attestation is a statement the professional makes, recorded with a date;
     booking is blocked where it is missing. */
  const [registry, setRegistry] = useState<'CRP' | 'Ordine'>('CRP')
  const [practiceCountry, setPracticeCountry] = useState<'BR' | 'IT'>('BR')
  const [attested, setAttested] = useState(false)
  const [insuranceExpires, setInsuranceExpires] = useState('')
  const [insuranceRef, setInsuranceRef] = useState('')

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
      await dp.updateMyProfessionalRecord({
        registry, registryRegion: String(form.licenceRegion ?? ''), practiceCountry, attestedAt: Date.now(),
        insuranceExpiresAt: insuranceExpires || null, insuranceDoc: insuranceRef.trim() || null,
      }).catch(() => undefined)
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
    licenceRegion: account.licenceRegion || '',
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
          <Field label={t('Professional body')}>
            <select className="w-input" value={registry} onChange={(e) => { const r = e.target.value as 'CRP' | 'Ordine'; setRegistry(r); setPracticeCountry(r === 'CRP' ? 'BR' : 'IT'); set({ licenceRegion: '' }) }}>
              <option value="CRP">{t('CRP — Conselho Regional de Psicologia (Brazil)')}</option>
              <option value="Ordine">{t('Ordine degli Psicologi (Italy)')}</option>
            </select>
          </Field>
          <Field label={registry === 'CRP' ? t('CRP registration number') : t('Albo registration number')} error={err('licenceNumber')}>
            <input className="w-input" value={form.licenceNumber} onChange={(e) => set({ licenceNumber: e.target.value })} onBlur={() => blur('licenceNumber')} placeholder={registry === 'CRP' ? '06/158342' : '12345'} />
          </Field>
          <Field label={registry === 'CRP' ? t('CRP region') : t('Ordine region')}>
            <select className="w-input" value={form.licenceRegion} onChange={(e) => set({ licenceRegion: e.target.value })}>
              <option value="">{t('Choose…')}</option>
              {(registry === 'CRP' ? CRP_REGIONS : ORDINE_REGIONS).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label={t('Where you practise from')} hint={t('the territory your registration authorises (D-12)')}>
            <select className="w-input" value={practiceCountry} onChange={(e) => setPracticeCountry(e.target.value as 'BR' | 'IT')}>
              <option value="BR">{t('Brazil')}</option>
              <option value="IT">{t('Italy')}</option>
            </select>
          </Field>
          <Field label={t('Professional indemnity insurance')} hint={t('expiry date and policy reference')}>
            <input className="w-input" type="date" value={insuranceExpires} onChange={(e) => setInsuranceExpires(e.target.value)} />
            <input className="w-input" value={insuranceRef} onChange={(e) => setInsuranceRef(e.target.value)} placeholder={t('insurer · policy number')} />
          </Field>
          <label className="w-check">
            <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
            {t('I confirm that I am registered and authorised to practise in the territory above, that I practise from it, and that no disciplinary proceedings are outstanding against me (P2.1, P2.3).')}
          </label>
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
          disabled={!valid || sending || !attested || !form.licenceRegion}
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

/**
 * The Professional Terms (Part V.D of the legal deliverable), from the legal
 * corpus in the interface language, accepted by version and recorded on the
 * server (M2R-05). The old text — "audio protocols", "the pre-launch
 * checklist will refuse to start treatment", "end-to-end encrypted" — was a
 * description of Path B and of controls the product does not have.
 */
function Terms({ account, onSign }: { account: TherapistAccount; onSign: () => void }) {
  const { t, locale } = useI18n()
  const dp = useDataProvider()
  const legal = useLegal()
  const [atBottom, setAtBottom] = useState(false)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const doc = legalDoc('professional', locale)

  async function sign() {
    setBusy(true)
    try {
      await legal.accept('professional')
      await dp.updateMyProfessionalRecord({ termsVersion: LEGAL_VERSION, termsAcceptedAt: Date.now() }).catch(() => undefined)
      onSign()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-auth">
      <div className="w-auth__card">
        <h1 className="w-h1">{doc?.title ?? t('Professional Terms')}</h1>
        <p className="w-small">{t('Version {v}', { v: LEGAL_VERSION })} · <a href="#legal/professional" target="_blank" rel="noreferrer">{t('Open on the legal information page')} ↗</a></p>
        <div
          className="w-terms legal-text"
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setAtBottom(true)
          }}
        >
          {doc && blocksFor(doc, legal.market).map((b, i) => (
            b.kind === 'h' ? <h2 key={i} className="legal-text__h">{b.text}</h2> : <p key={i}>{b.text}</p>
          ))}
        </div>
        {!atBottom && <p className="w-small">↓ {t('Scroll to the bottom to enable signature')}</p>}

        <div className="w-signature">
          {t('I,')} <strong>{account.fullName}</strong>, <strong>{account.licenceNumber}</strong>,{' '}
          {t('accept the Professional Terms.')}
        </div>

        <label className={`w-check${atBottom ? '' : ' is-disabled'}`}>
          <input type="checkbox" disabled={!atBottom} checked={checked} onChange={() => setChecked((v) => !v)} />
          {t('I have read and accept the Professional Terms')}
        </label>

        <button className="w-btn w-btn--primary w-btn--block" disabled={!checked || busy} onClick={() => void sign()}>
          {busy ? t('Please wait…') : t('Sign and continue')}
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
          <li>{t('Try choosing content and playing it, with a virtual patient')}</li>
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
