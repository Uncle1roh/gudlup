import { useState } from 'react'
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
      <button className="b2b-back" onClick={onBack}>← Elenco pazienti</button>
      <h1 className="b2b-h1">Credenziali</h1>

      <div className={`cred-banner cred-banner--${phase === 'approved' ? 'ok' : 'pending'}`}>
        {phase === 'approved' ? (
          <><b>✓ Approvato</b><span>Il tuo account è verificato e attivo.</span></>
        ) : (
          <><b>⏳ In attesa di verifica</b><span>Approvazione dell’amministratore entro 48h. Nel frattempo puoi iniziare il tutorial.</span></>
        )}
      </div>

      <section className="b2b-card">
        <h2 className="b2b-card__title">Iscrizione professionale</h2>

        <label className="b2b-label">Numero di iscrizione all’albo</label>
        <input className="b2b-input" value={crp} onChange={(e) => setCrp(e.target.value)} />
        <p className={`fmt-hint${formatValid ? ' is-ok' : ' is-bad'}`}>
          {formatValid ? '✓ Formato valido (verificato al caricamento)' : 'Formato atteso: CRP 04/12345'}
        </p>

        <label className="b2b-label" style={{ marginTop: 14 }}>Certificato</label>
        <div className="upload">
          <span>📄 {fileName}</span>
          <button className="b2b-chip" onClick={() => setFileName('crp_certificate_v2.pdf')}>Sostituisci…</button>
        </div>

        <button className="b2b-btn b2b-btn--primary" style={{ marginTop: 16 }} disabled={!formatValid || phase === 'submitting'} onClick={submit}>
          {phase === 'submitting' ? 'Validazione…' : 'Invia di nuovo per la verifica'}
        </button>
      </section>

      <p className="b2b-sub">L’accesso ai pazienti viene abilitato solo dopo l’approvazione manuale dell’amministratore. Lo storico delle approvazioni viene conservato.</p>
    </div>
  )
}
