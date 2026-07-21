import { useState } from 'react'
import { tr } from '../i18n'
import { DEMO_THERAPIST } from './data'

interface CredentialingProps {
  onBack: () => void
}

const CRP_RE = /^CRP\s?\d{2}\/\d{4,6}$/i

export function Credentialing({ onBack }: CredentialingProps) {
  const [crp, setCrp] = useState(DEMO_THERAPIST.crp)
  const [fileName, setFileName] = useState('crp_certificate.pdf')
  const [phase, setPhase] = useState<'approved' | 'submitting' | 'pending'>('approved')

  const formatValid = CRP_RE.test(crp.trim())

  function submit() {
    if (!formatValid) return
    setPhase('submitting')
    setTimeout(() => setPhase('pending'), 1000)
  }

  return (
    <div className="b2b-page b2b-page--narrow">
      <button className="b2b-back" onClick={onBack}>{tr('← Roster')}</button>
      <h1 className="b2b-h1">{tr('Credentials')}</h1>

      <div className={`cred-banner cred-banner--${phase === 'approved' ? 'ok' : 'pending'}`}>
        {phase === 'approved' ? (
          <><b>{tr('✓ Approved')}</b><span>{tr('Your account is verified and active.')}</span></>
        ) : (
          <><b>{tr('⏳ Pending review')}</b><span>{tr('Admin approval within a 48h SLA. You can begin the tutorial while you wait.')}</span></>
        )}
      </div>

      <section className="b2b-card">
        <h2 className="b2b-card__title">{tr('Professional registration')}</h2>

        <label className="b2b-label">{tr('CRP / CFP number')}</label>
        <input className="b2b-input" value={crp} onChange={(e) => setCrp(e.target.value)} />
        <p className={`fmt-hint${formatValid ? ' is-ok' : ' is-bad'}`}>
          {formatValid ? tr('✓ Format valid (auto-checked on upload)') : tr('Expected format: CRP 04/12345')}
        </p>

        <label className="b2b-label" style={{ marginTop: 14 }}>{tr('Certificate')}</label>
        <div className="upload">
          <span>📄 {fileName}</span>
          <button className="b2b-chip" onClick={() => setFileName('crp_certificate_v2.pdf')}>{tr('Replace…')}</button>
        </div>

        <button className="b2b-btn b2b-btn--primary" style={{ marginTop: 16 }} disabled={!formatValid || phase === 'submitting'} onClick={submit}>
          {phase === 'submitting' ? tr('Validating…') : tr('Re-submit for review')}
        </button>
      </section>

      <p className="b2b-sub">{tr('Access to patients is released only after manual admin approval. Approval history is retained.')}</p>
    </div>
  )
}
