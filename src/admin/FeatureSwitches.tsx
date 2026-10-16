/* ============================================================================
   Gli interruttori: spegnere un’area senza un deploy

   Tre aree — il player, le prenotazioni, la videochiamata. Sono quelle che
   dipendono da qualcosa fuori dal nostro codice, e quelle in cui un guasto
   sta davanti a una persona invece che a un operatore.

   Lo stato vive in `app_settings`, una riga sola, letta da ogni app al
   caricamento. Spegnere qui ha effetto su tutti entro pochi secondi: non
   serve ricostruire né ridistribuire niente.

   La conferma non è una formalità. Spegnere il player ferma le sessioni di
   chiunque stia per ascoltarne una, e il testo della conferma dice chi se ne
   accorge e come.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useDataProvider } from '../data/provider'
import {
  FEATURES, features, refreshFeatures, saveFeatures,
  type FeatureFlags, type FeatureId,
} from '../app/features'

const WHAT_IT_STOPS: Record<FeatureId, string> = {
  player: 'Nessuno può avviare una sessione. Il catalogo resta navigabile; chi sta già ascoltando arriva in fondo.',
  booking: 'Nessuno può prenotare un nuovo appuntamento. Quelli già presi restano, e restano visibili.',
  video: 'Il pulsante per entrare in videochiamata sparisce. L’appuntamento resta: il terapeuta dovrà avvisare la persona.',
}

export function FeatureSwitches({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const [flags, setFlags] = useState<FeatureFlags>(() => features())
  const [busy, setBusy] = useState<FeatureId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  /* Read the row rather than trust the cache: this is the one screen where
     being a few seconds stale is actively misleading. */
  useEffect(() => { void refreshFeatures().then(setFlags) }, [])

  async function toggle(id: FeatureId) {
    const label = FEATURES.find((f) => f.id === id)?.label ?? id
    const turningOff = flags[id] !== false
    if (turningOff && !window.confirm(
      `Spegnere "${label}"?${String.fromCharCode(10, 10)}${WHAT_IT_STOPS[id]}${String.fromCharCode(10, 10)}Ha effetto su tutte le app entro pochi secondi.`,
    )) return

    setBusy(id)
    setError(null)
    setNote(null)
    const next: FeatureFlags = { ...flags, [id]: !turningOff }
    const res = await saveFeatures(next)
    if (!res.ok) {
      setError(res.message)
      setBusy(null)
      return
    }
    setFlags(next)
    setNote(turningOff ? `${label}: spento.` : `${label}: riacceso.`)
    await dp.logAudit({
      actor,
      action: turningOff ? 'feature.disabled' : 'feature.enabled',
      target: id,
      detail: turningOff ? WHAT_IT_STOPS[id] : 'riacceso',
    }).catch(() => undefined)
    setBusy(null)
  }

  const off = FEATURES.filter((f) => flags[f.id] === false)

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">Interruttori</h1>
        <p className="b2b-sub">
          Spegni un’area che si è rotta, senza aspettare un deploy. Ha effetto
          su tutte le app entro pochi secondi.
        </p>
      </header>

      {off.length > 0 && (
        <p className="adm-note adm-note--warn">
          <strong>Spento adesso: {off.map((f) => f.label).join(', ')}.</strong>{' '}
          Le persone vedono una schermata che dice “temporaneamente non
          disponibile”. Non è un errore e non sparisce da sola.
        </p>
      )}
      {error && <p className="adm-note adm-note--err">{error}</p>}
      {note && <p className="adm-note adm-note--ok">{note}</p>}

      <ul className="ftsw">
        {FEATURES.map((f) => {
          const on = flags[f.id] !== false
          return (
            <li key={f.id} className={`ftsw__row${on ? '' : ' is-off'}`}>
              <div className="ftsw__text">
                <div className="ftsw__name">
                  <span>{f.label}</span>
                  <span className={`adm-pill ${on ? 'adm-pill--ok' : 'adm-pill--warn'}`}>
                    {on ? 'attivo' : 'spento'}
                  </span>
                </div>
                <p className="ftsw__what">{on ? f.what : WHAT_IT_STOPS[f.id]}</p>
              </div>
              <button
                className={`b2b-btn ${on ? 'b2b-btn--danger' : 'b2b-btn--primary'}`}
                disabled={busy === f.id}
                onClick={() => void toggle(f.id)}
              >
                {busy === f.id ? '…' : on ? 'Spegni' : 'Riaccendi'}
              </button>
            </li>
          )
        })}
      </ul>

      <p className="adm-note ftsw__foot">
        Se il database stesso è irraggiungibile gli interruttori non si leggono
        e tutto resta <strong>acceso</strong> — di proposito: un interruttore
        che si chiude da solo spegnerebbe il prodotto proprio nel momento in cui
        serve di più. Per quel caso c’è <code>VITE_FEATURES_OFF</code>, che si
        imposta su Vercel e richiede un deploy.
      </p>
    </div>
  )
}
