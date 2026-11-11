/* ============================================================================
   Commercial console — Sfondi

   The two photographs the product stands on: one behind the landing page,
   the three public pages and the door, one behind the signed-in app.

   WHY THIS SCREEN EXISTS. Those pictures have been changed three times by
   the founders, and every change was a code edit, a build and a deploy for
   what is a choice of picture. They are a setting now (`app/backgrounds.ts`,
   stored in `app_settings`), and this is where the setting is made: pick a
   file, see it, save it. Every app picks it up on its next load.

   WHAT IT WILL NOT LET YOU CHANGE. The scrim over the picture, the fades,
   the type and the layout. A background anybody can change is useful; a
   design anybody can change is a design nobody owns — and the scrim in
   particular is what keeps cream type legible over whatever picture lands
   here, so it is not an option.

   THE RINGS. The brand's rings were the background of both surfaces until
   these pictures arrived, and both of them already carry the same shape —
   the landing is concentric ripples, the app is a person at the centre of
   the frame. They are off by default and switched back on here, so the
   decision is reversible without anybody being asked for a deploy.
   ============================================================================ */

import { useEffect, useRef, useState } from 'react'
import { st } from './i18n'
import { uploadBackground } from '../admin/assets'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import {
  DEFAULT_BACKGROUNDS, backgrounds, refreshBackgrounds, saveBackgrounds,
  type BackgroundSet,
} from '../app/backgrounds'

type Which = 'landing' | 'app'

const SURFACES: { id: Which; title: string; what: string; ringLabel: string; ringWhat: string }[] = [
  {
    id: 'landing',
    title: 'Pagina pubblica e accesso',
    what: 'Dietro la landing, le tre pagine pubbliche e la schermata di accesso. È la prima cosa che vede chi non conosce ancora Good Loop.',
    ringLabel: 'Anelli attorno al soggetto',
    ringWhat: 'Il alone di anelli sottili al centro dell’immagine. Ha senso solo se la foto ha un soggetto lì.',
  },
  {
    id: 'app',
    title: 'App di chi ascolta',
    what: 'Dietro la libreria e le altre destinazioni dell’app. Non si vede durante una sessione: lì comanda la copertina del protocollo.',
    ringLabel: 'Anelli nell’angolo',
    ringWhat: 'Il marchio, grande, in alto a destra, nella palette chiara o scura scelta dalla persona.',
  },
]

export function Backgrounds() {
  const [set, setSet] = useState<BackgroundSet>(() => backgrounds())
  const [busy, setBusy] = useState<Which | 'save' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const files = useRef<Record<Which, HTMLInputElement | null>>({ landing: null, app: null })

  useEffect(() => { void refreshBackgrounds().then((b) => setSet(b)) }, [])

  const dirty = JSON.stringify(set) !== JSON.stringify(backgrounds())

  async function pick(which: Which, file: File | undefined) {
    if (!file) return
    setBusy(which); setError(null); setStatus(null)
    try {
      if (!hasSupabaseEnv()) {
        /* Demo mode has no storage behind it. A local preview is still
           worth having — it is how the picture is judged — and it is said
           out loud that it lives only in this browser. */
        const url = URL.createObjectURL(file)
        setSet((s) => ({ ...s, [which]: url }))
        setStatus('Anteprima locale: senza database l’immagine non viene caricata da nessuna parte e sparisce al ricaricamento.')
        return
      }
      const { url, note } = await uploadBackground(which, file)
      setSet((s) => ({ ...s, [which]: url }))
      /* `note` is what happened to the FILE on the way — almost always that
         it was scaled down. Worth saying: an operator who exported at 4000 px
         should know the page did not use all of it, and an operator whose
         landing got slower should be able to see that it did not come from
         here. */
      setStatus(`Immagine caricata.${note ? ' ' + note : ''} Premi Salva per metterla in linea.`)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save'); setError(null); setStatus(null)
    const res = await saveBackgrounds(set)
    setBusy(null)
    if (!res.ok) {
      /* The same permission wall as the upload, one step later: the row is
         admin-only until script 30 runs, and "new row violates row-level
         security policy" tells the person nothing they can act on. */
      setError(/row-level security|violates|permission/i.test(res.message)
        ? 'Salvataggio non riuscito: questo account non ha il permesso di scrivere questa impostazione. È un permesso del database, da eseguire una volta sola: supabase/30-backgrounds-access.sql.'
        : res.message)
      return
    }
    setStatus('Salvato. Chi apre l’app adesso vede questi sfondi; chi la ha già aperta li vede al prossimo caricamento.')
  }

  return (
    <div className="adm-page">
      <header className="adm-head">
        <h1 className="adm-h1">{st('Sfondi')}</h1>
        <p className="b2b-sub">
          Le due fotografie su cui sta il prodotto. Si cambiano da qui, senza passare da un rilascio.
          Il velo sopra l’immagine, le sfumature e il testo non si toccano: sono quelli che tengono
          leggibile il testo chiaro su qualsiasi foto finisca qui.
        </p>
      </header>

      {error && <p className="adm-plain__status adm-plain__status--err">{error}</p>}
      {status && <p className="adm-plain__status">{status}</p>}

      <div className="sls-bg">
        {SURFACES.map((s) => {
          const url = set[s.id]
          const isDefault = url === DEFAULT_BACKGROUNDS[s.id]
          const ringKey = s.id === 'landing' ? 'landingRings' as const : 'appRings' as const
          return (
            <section className="sls-bg__card" key={s.id}>
              <header className="sls-bg__head">
                <h2 className="sls-bg__title">{s.title}</h2>
                <p className="b2b-sub">{s.what}</p>
              </header>

              {/* The picture as it will be cropped: `cover`, like the app. */}
              <div className="sls-bg__preview" style={{ backgroundImage: `url(${url})` }}>
                <span className="sls-bg__scrim" />
                <span className="sls-bg__note">{isDefault ? 'immagine del rilascio' : 'immagine caricata'}</span>
              </div>

              <div className="sls-bg__acts">
                <input
                  ref={(el) => { files.current[s.id] = el }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  hidden
                  onChange={(e) => { void pick(s.id, e.target.files?.[0]); e.currentTarget.value = '' }}
                />
                <button
                  className="b2b-btn b2b-btn--primary"
                  disabled={busy !== null}
                  onClick={() => files.current[s.id]?.click()}
                >
                  {busy === s.id ? 'Caricamento…' : 'Carica un’immagine'}
                </button>
                <button
                  className="b2b-btn"
                  disabled={busy !== null || isDefault}
                  onClick={() => setSet((p) => ({ ...p, [s.id]: DEFAULT_BACKGROUNDS[s.id] }))}
                >
                  ↺ Torna a quella del rilascio
                </button>
              </div>

              <label className="sls-bg__ring">
                <input
                  type="checkbox"
                  checked={set[ringKey]}
                  onChange={(e) => setSet((p) => ({ ...p, [ringKey]: e.target.checked }))}
                />
                <span>
                  <b>{s.ringLabel}</b>
                  <em>{s.ringWhat}</em>
                </span>
              </label>

              <p className="sls-bg__url" title={url}>{url}</p>
            </section>
          )
        })}
      </div>

      <div className={`sls-bg__save${dirty ? ' is-on' : ''}`}>
        <span className="b2b-sub">
          {dirty ? 'Ci sono modifiche non salvate.' : 'Nessuna modifica.'}
          {!hasSupabaseEnv() && ' Senza database la scelta vale solo in questo browser.'}
        </span>
        <button className="b2b-btn b2b-btn--primary" disabled={!dirty || busy !== null} onClick={() => void save()}>
          {busy === 'save' ? 'Salvataggio…' : 'Salva e metti in linea'}
        </button>
      </div>

      <p className="b2b-sub sls-bg__tip">
        Carica pure il file pieno: viene ridotto qui, prima di partire, a circa 2000 px sul lato lungo e
        sotto mezzo megabyte — questa foto è la prima cosa che un telefono scarica, e una da dieci
        megabyte è una landing rotta per tutti. L’immagine viene ritagliata al centro per riempire
        qualsiasi schermo, quindi tieni il soggetto lontano dai bordi — e scura abbastanza da reggere
        il testo chiaro che ci sta sopra.
      </p>
    </div>
  )
}
