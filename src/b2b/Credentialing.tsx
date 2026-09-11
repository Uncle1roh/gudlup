/* ============================================================================
   Good Loop — credentials (clinician surface)

   The screen a clinician answers the review with. It used to be a mock: the
   banner said "Approvato" from a `useState` default, the certificate was a
   string that never left the component, and pressing submit set a local flag
   after a one-second timer. Nothing it showed had been anywhere near the
   server, and the admin console reviewing it saw only a registration number
   the clinician had typed about themselves.

   Now it shows the row as the server has it, uploads real files to the private
   `credentials` bucket, and submits through `submit_credentials()` — which can
   only ever set the status back to 'pending'. Nothing on this screen can
   approve anybody, which is the property it exists to have.
   ============================================================================ */

import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { uploadCredentialDoc } from './credentials'
import type { Therapist } from './data'

interface CredentialingProps {
  /** The credential record as the server has it. */
  therapist: Therapist
  /** Re-read it after a submission. */
  onChanged: () => void
  onBack?: () => void
}

const CRP_RE = /^CRP\s?\d{2}\/\d{4,6}$/i

const BANNER: Record<Therapist['status'], { cls: string; title: string; body: string }> = {
  approved: { cls: 'ok', title: '✓ Approvato', body: 'Il tuo account è verificato e attivo.' },
  pending: {
    cls: 'pending', title: '⏳ In attesa di verifica',
    body: 'Un amministratore Good Loop verifica i documenti. Fino ad allora non vedrai pazienti.',
  },
  more_info: {
    cls: 'pending', title: '📄 Servono altri documenti',
    body: 'Chi ha revisionato la richiesta ha bisogno di un altro documento.',
  },
  rejected: {
    cls: 'pending', title: '✕ Credenziali non verificate',
    body: 'La richiesta non è stata approvata. Puoi correggere e inviare di nuovo.',
  },
}

export function Credentialing({ therapist, onChanged, onBack }: CredentialingProps) {
  const dp = useDataProvider()
  const [crp, setCrp] = useState(therapist.crp)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const formatValid = CRP_RE.test(crp.trim())
  const banner = BANNER[therapist.status]

  /* Something has to be new for a re-submission to mean anything: a different
     number, or a document that was not there before. Re-sending the same row
     only moves it back to the bottom of somebody's queue. */
  const changed = crp.trim() !== therapist.crp || !!file

  async function submit() {
    if (!formatValid || !changed) return
    setError(null)
    setBusy(true)
    try {
      const docs = [...therapist.documents]
      if (file) docs.push(await uploadCredentialDoc(file))
      await dp.submitCredentials(crp.trim(), docs)
      setFile(null)
      setSent(true)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="b2b-page b2b-page--narrow">
      {onBack && <button className="b2b-back" onClick={onBack}>← Elenco pazienti</button>}
      <h1 className="b2b-h1">Credenziali</h1>

      <div className={`cred-banner cred-banner--${banner.cls}`}>
        <b>{banner.title}</b>
        <span>{therapist.reason ?? banner.body}</span>
      </div>

      <section className="b2b-card">
        <h2 className="b2b-card__title">Iscrizione professionale</h2>

        <label className="b2b-label">Numero di iscrizione all’albo</label>
        <input className="b2b-input" value={crp} onChange={(e) => { setCrp(e.target.value); setSent(false) }} />
        <p className={`fmt-hint${formatValid ? ' is-ok' : ' is-bad'}`}>
          {formatValid ? '✓ Formato valido' : 'Formato atteso: CRP 04/12345'}
        </p>

        <label className="b2b-label" style={{ marginTop: 14 }}>Documenti inviati</label>
        {therapist.documents.length === 0 ? (
          <p className="b2b-sub">Nessun documento ancora. Allega l’iscrizione all’albo (PDF o foto).</p>
        ) : (
          <ul className="cred-docs">
            {therapist.documents.map((d) => (
              <li key={d.path}>
                <span>📄 {d.name}</span>
                <span className="b2b-sub">{(d.sizeBytes / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
        )}

        <label className="b2b-label" style={{ marginTop: 14 }}>Aggiungi un documento</label>
        <div className="upload">
          <span>{file ? `📄 ${file.name}` : 'PDF, JPG o PNG · max 12 MB'}</span>
          <label className="b2b-chip">
            Scegli file…
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              hidden
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSent(false) }}
            />
          </label>
        </div>

        {error && <p className="fmt-hint is-bad">{error}</p>}
        {sent && !error && <p className="fmt-hint is-ok">✓ Inviato. La revisione riparte da qui.</p>}

        <button
          className="b2b-btn b2b-btn--primary"
          style={{ marginTop: 16 }}
          disabled={!formatValid || !changed || busy}
          onClick={() => void submit()}
        >
          {busy ? 'Invio…' : 'Invia per la verifica'}
        </button>
      </section>

      <p className="b2b-sub">
        L’accesso ai pazienti viene abilitato solo dopo l’approvazione manuale dell’amministratore. Modificare il
        numero o i documenti riapre la verifica: è la stessa cosa che è stata approvata a cambiare.
      </p>
    </div>
  )
}
