/* ============================================================================
   Admin — Conformità

   Five queues the legal framework requires the back office to run, in one
   screen with sub-tabs:

     Richieste dati     DAT-04 — data-subject requests with the 15-day clock
     Segnalazioni       ADM-04 / ADM-05 — notice-and-action and complaints,
                        2 working days to acknowledge, 10 to reply
     Testi legali       ADM-06 / LEG-07 — the version register
     Numeri di emergenza CRS-03 — crisis numbers as configuration, with the
                        last-verified date and a warning past 90 days
     Consensi           ADM-07 — one person's acceptance and consent history

   Everything here is written to the audit trail (ADM-08) like every other
   admin action. Nothing here reads a clinical record.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useAdminUsers, useCrisisResources, useDataRequests, useLegalVersions, useReports } from './hooks'
import type { DataRequest, DataRequestStatus, Report, ReportStatus, Acceptance, ConsentEvent } from '../legal/records'
import { addWorkingDays, COMPLAINT_ACK_WORKING_DAYS, COMPLAINT_REPLY_WORKING_DAYS, crisisVerificationOverdue, type CrisisResource } from '../legal/market'
import { LEGAL_VERSION } from '../legal/types'
import { LEGAL_INDEX } from '../legal/corpus'

type Tab = 'dsr' | 'reports' | 'legal' | 'crisis' | 'consents'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dsr', label: 'Richieste dati' },
  { id: 'reports', label: 'Segnalazioni e reclami' },
  { id: 'legal', label: 'Testi legali' },
  { id: 'crisis', label: 'Numeri di emergenza' },
  { id: 'consents', label: 'Registro consensi' },
]

const DAY = 86_400_000
const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export function Compliance({ actor }: { actor: string }) {
  const [tab, setTab] = useState<Tab>('dsr')
  return (
    <div className="adm-page">
      <div className="adm-page__head">
        <h1 className="b2b-h1">Conformità</h1>
        <p className="b2b-sub">Le code che il quadro legale richiede: richieste dei dati con scadenza a 15 giorni, segnalazioni e reclami, il registro delle versioni dei testi, i numeri di emergenza con data di verifica, e lo storico dei consensi di una persona.</p>
      </div>
      <div className="adm-tabs" role="tablist" aria-label="Code di conformità">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            className={`adm-tab${tab === x.id ? ' is-on' : ''}`}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
      {tab === 'dsr' && <DataRequests actor={actor} />}
      {tab === 'reports' && <Reports actor={actor} />}
      {tab === 'legal' && <LegalVersions actor={actor} />}
      {tab === 'crisis' && <Crisis actor={actor} />}
      {tab === 'consents' && <Consents />}
    </div>
  )
}

/* ------------------------------------------------------ richieste dati -- */

const DSR_KIND: Record<DataRequest['kind'], string> = { access: 'Accesso', portability: 'Portabilità', rectification: 'Rettifica', deletion: 'Cancellazione' }
const DSR_STATUS: Record<DataRequestStatus, string> = { open: 'Aperta', verified: 'Identità verificata', delivered: 'Consegnata', closed: 'Chiusa', refused: 'Rifiutata' }

function slaPill(dueAt: number, done: boolean) {
  if (done) return <span className="adm-pill adm-pill--ok">nei termini</span>
  const left = Math.ceil((dueAt - Date.now()) / DAY)
  if (left < 0) return <span className="adm-pill adm-pill--bad">scaduta da {-left} g</span>
  if (left <= 3) return <span className="adm-pill adm-pill--warn">{left} g</span>
  return <span className="adm-pill adm-pill--info">{left} g</span>
}

function DataRequests({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, error, refetch } = useDataRequests()
  const [busy, setBusy] = useState<string | null>(null)

  async function move(r: DataRequest, status: DataRequestStatus) {
    setBusy(r.id)
    const patch: Parameters<typeof dp.updateDataRequest>[1] = { status, handledBy: actor }
    if (status === 'verified') patch.verifiedAt = Date.now()
    if (status === 'delivered') patch.deliveredAt = Date.now()
    await dp.updateDataRequest(r.id, patch)
    await dp.logAudit({ actor, action: `dsr.${status}`, target: r.requester?.email ?? r.profileId, detail: DSR_KIND[r.kind] }).catch(() => undefined)
    setBusy(null)
    refetch()
  }

  const rows = data ?? []
  return (
    <>
      <p className="b2b-sub">Il termine è di 15 giorni di calendario dal ricevimento, per ogni persona in ogni Paese (specifica DSR, regola 1). La verifica dell’identità passa dall’account, mai da un documento. La cartella clinica di un professionista non si consegna: si indirizza al professionista (4.3).</p>
      {error && <p className="pe-err">Impossibile caricare: esegui supabase/11-legal-framework.sql.</p>}
      {loading && <p className="adm-muted">Caricamento…</p>}
      {!loading && !rows.length && <p className="adm-muted">Nessuna richiesta.</p>}
      {rows.length > 0 && (
        <div className="adm-table adm-table--dsr">
          <div className="adm-tr adm-tr--head">
            <div>Ricevuta</div><div>Persona</div><div>Tipo</div><div>Mercato</div><div>Scadenza</div><div>Stato</div><div className="adm-tr__right">Azione</div>
          </div>
          {rows.map((r) => {
            const done = r.status === 'delivered' || r.status === 'closed' || r.status === 'refused'
            return (
              <div className={`adm-tr${done ? ' is-inactive' : ''}`} key={r.id}>
                <div>{fmt(r.receivedAt)}</div>
                <div><b>{r.requester?.name ?? '—'}</b><br /><span className="adm-muted">{r.requester?.email ?? r.profileId}</span></div>
                <div>{DSR_KIND[r.kind]}</div>
                <div>{r.market ?? '—'}</div>
                <div>{fmt(r.dueAt)} {slaPill(r.dueAt, done)}</div>
                <div>{DSR_STATUS[r.status]}</div>
                <div className="adm-tr__right">
                  {r.status === 'open' && <button className="b2b-btn" disabled={busy === r.id} onClick={() => void move(r, 'verified')}>Identità verificata</button>}
                  {r.status === 'verified' && <button className="b2b-btn b2b-btn--primary" disabled={busy === r.id} onClick={() => void move(r, 'delivered')}>Consegnata</button>}
                  {r.status === 'delivered' && <button className="b2b-btn b2b-btn--ghost" disabled={busy === r.id} onClick={() => void move(r, 'closed')}>Chiudi</button>}
                  {r.market === 'EU' && !done && r.status !== 'delivered' && (
                    <button className="b2b-btn b2b-btn--ghost" disabled={busy === r.id} onClick={() => void move(r, 'refused')} title="Solo per utenti UE: richiesta manifestamente infondata o eccessiva (GDPR art. 12(5)). Mai in Brasile.">Rifiuta</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* -------------------------------------------------------- segnalazioni -- */

const REPORT_KIND: Record<Report['kind'], string> = { content: 'Contenuto', complaint: 'Reclamo' }
const REPORT_STATUS: Record<ReportStatus, string> = { received: 'Ricevuta', acknowledged: 'Presa in carico', assessing: 'In valutazione', actioned: 'Azione presa', dismissed: 'Archiviata', closed: 'Chiusa' }

function Reports({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, error, refetch } = useReports()
  const [busy, setBusy] = useState<string | null>(null)
  const [decision, setDecision] = useState<Record<string, string>>({})

  async function move(r: Report, status: ReportStatus) {
    setBusy(r.id)
    const patch: Parameters<typeof dp.updateReport>[1] = { status }
    if (status === 'acknowledged') patch.acknowledgedAt = Date.now()
    if (status === 'actioned' || status === 'dismissed' || status === 'closed') {
      patch.decidedAt = Date.now(); patch.decidedBy = actor; patch.decision = decision[r.id] ?? ''
    }
    await dp.updateReport(r.id, patch)
    await dp.logAudit({ actor, action: `report.${status}`, target: r.subject, detail: REPORT_KIND[r.kind] }).catch(() => undefined)
    setBusy(null)
    refetch()
  }

  const rows = data ?? []
  return (
    <>
      <p className="b2b-sub">Un reclamo si conferma entro {COMPLAINT_ACK_WORKING_DAYS} giorni lavorativi e si risponde entro {COMPLAINT_REPLY_WORKING_DAYS} (Termini, cl. 19). Una segnalazione di contenuto si valuta su notifica extragiudiziale e, se fondata, il contenuto viene rimosso o limitato e la persona informata (cl. 9). Ogni decisione resta a registro.</p>
      {error && <p className="pe-err">Impossibile caricare: esegui supabase/11-legal-framework.sql.</p>}
      {loading && <p className="adm-muted">Caricamento…</p>}
      {!loading && !rows.length && <p className="adm-muted">Nessuna segnalazione.</p>}
      {rows.map((r) => {
        const ackDue = addWorkingDays(new Date(r.receivedAt), COMPLAINT_ACK_WORKING_DAYS).getTime()
        const replyDue = addWorkingDays(new Date(r.receivedAt), COMPLAINT_REPLY_WORKING_DAYS).getTime()
        const done = r.status === 'actioned' || r.status === 'dismissed' || r.status === 'closed'
        return (
          <article key={r.id} className={`card adm-report${done ? ' is-inactive' : ''}`}>
            <div className="adm-report__head">
              <span className="adm-pill adm-pill--info">{REPORT_KIND[r.kind]}</span>
              <b>{r.subject}</b>
              <span className="adm-muted">{fmt(r.receivedAt)} · {r.reporterEmail ?? 'anonimo'}</span>
              <span className="adm-pill">{REPORT_STATUS[r.status]}</span>
            </div>
            {r.location && <p className="adm-muted">Dove: {r.location}</p>}
            <p>{r.reason}</p>
            {!done && (
              <p className="adm-muted">
                Conferma entro {fmt(ackDue)} {slaPill(ackDue, !!r.acknowledgedAt)} · risposta entro {fmt(replyDue)} {slaPill(replyDue, false)}
              </p>
            )}
            {r.decision && <p><b>Decisione:</b> {r.decision} <span className="adm-muted">({r.decidedBy}, {fmt(r.decidedAt)})</span></p>}
            {!done && (
              <div className="adm-report__acts">
                {r.status === 'received' && <button className="b2b-btn" disabled={busy === r.id} onClick={() => void move(r, 'acknowledged')}>Conferma ricezione</button>}
                {r.status === 'acknowledged' && <button className="b2b-btn" disabled={busy === r.id} onClick={() => void move(r, 'assessing')}>In valutazione</button>}
                {(r.status === 'assessing' || r.status === 'acknowledged') && (
                  <>
                    <input className="b2b-input" placeholder="Decisione e motivazione (viene comunicata alla persona)" value={decision[r.id] ?? ''} onChange={(e) => setDecision({ ...decision, [r.id]: e.target.value })} />
                    <button className="b2b-btn b2b-btn--primary" disabled={busy === r.id || !(decision[r.id] ?? '').trim()} onClick={() => void move(r, 'actioned')}>Azione presa</button>
                    <button className="b2b-btn b2b-btn--ghost" disabled={busy === r.id || !(decision[r.id] ?? '').trim()} onClick={() => void move(r, 'dismissed')}>Archivia</button>
                  </>
                )}
              </div>
            )}
          </article>
        )
      })}
    </>
  )
}

/* -------------------------------------------------------- testi legali -- */

function LegalVersions({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, error, refetch } = useLegalVersions()
  const [docId, setDocId] = useState('terms')
  const [locale, setLocale] = useState('it')
  const [version, setVersion] = useState(LEGAL_VERSION)
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10))
  const [changelog, setChangelog] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    try {
      await dp.saveLegalVersion({ docId, locale, version: version.trim(), inForceFrom: from, inForceTo: null, changelog: changelog.trim() || undefined, createdBy: actor })
      await dp.logAudit({ actor, action: 'legal.version', target: `${docId} ${version}`, detail: `${locale} · dal ${from}` }).catch(() => undefined)
      setChangelog('')
      refetch()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="b2b-sub">I testi sono nel codice (src/legal): questo registro dice quale versione è entrata in vigore quando, in quale lingua, e cosa è cambiato. L’accettazione di una persona punta alla versione; le versioni precedenti restano leggibili nella pagina legale (Termini, cl. 21.3). Versione corrente nel prodotto: <b>{LEGAL_VERSION}</b>. Portoghese e italiano sono le versioni che fanno fede nei rispettivi mercati e vanno confermate dal legale prima di segnarle “in vigore”.</p>
      <div className="adm-addrow">
        <select className="adm-select" value={docId} onChange={(e) => setDocId(e.target.value)}>
          <option value="terms">Termini e condizioni</option>
          <option value="notices">Informative D-01…D-17</option>
          <option value="supplement">Supplemento utente finale</option>
          <option value="privacy">Informativa sulla privacy</option>
          <option value="professional">Termini per i professionisti</option>
          {LEGAL_INDEX.filter((x) => x.group === 'notices').map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
        </select>
        <select className="adm-select" value={locale} onChange={(e) => setLocale(e.target.value)}>
          <option value="it">Italiano</option><option value="pt-BR">Português</option><option value="en">English</option>
        </select>
        <input className="b2b-input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="versione" />
        <input className="b2b-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="b2b-input" value={changelog} onChange={(e) => setChangelog(e.target.value)} placeholder="cosa cambia" />
        <button className="b2b-btn b2b-btn--primary" disabled={busy || !version.trim()} onClick={() => void add()}>Registra</button>
      </div>
      {error && <p className="pe-err">Impossibile caricare: esegui supabase/11-legal-framework.sql.</p>}
      {loading && <p className="adm-muted">Caricamento…</p>}
      {(data ?? []).length > 0 && (
        <div className="adm-table adm-table--versions">
          <div className="adm-tr adm-tr--head"><div>Documento</div><div>Versione</div><div>Lingua</div><div>In vigore</div><div>Note</div></div>
          {(data ?? []).map((v) => (
            <div className="adm-tr" key={v.id}>
              <div><b>{v.docId}</b></div>
              <div className="adm-mono">{v.version}</div>
              <div>{v.locale}</div>
              <div>{v.inForceFrom}{v.inForceTo ? ` → ${v.inForceTo}` : <span className="adm-pill adm-pill--live"> in vigore</span>}</div>
              <div className="adm-muted">{v.changelog ?? ''}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ----------------------------------------------------- numeri di crisi -- */

function Crisis({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, error, refetch } = useCrisisResources()
  const [draft, setDraft] = useState<CrisisResource | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(r: CrisisResource) {
    setBusy(true)
    try {
      await dp.saveCrisisResource(r)
      await dp.logAudit({ actor, action: 'crisis.saved', target: `${r.market} ${r.label}`, detail: r.number }).catch(() => undefined)
      setDraft(null)
      refetch()
    } finally {
      setBusy(false)
    }
  }
  async function verify(r: CrisisResource) {
    await save({ ...r, lastVerifiedAt: new Date().toISOString(), verifiedBy: actor })
  }

  const rows = [...(data ?? [])].sort((a, b) => a.market.localeCompare(b.market) || a.position - b.position)
  return (
    <>
      <p className="b2b-sub">Un numero sbagliato è peggio di nessun numero: ogni riga porta la data dell’ultima verifica e chi l’ha fatta, e dopo 90 giorni il console lo segnala. La scheda “Aiuto subito” legge queste righe, mai una costante nel codice. Per l’Unione europea il 112 è certo; la linea nazionale di ascolto di ogni Paese va aggiunta qui solo dopo averla verificata (D-03).</p>
      {error && <p className="pe-err">Impossibile caricare: esegui supabase/11-legal-framework.sql.</p>}
      {loading && <p className="adm-muted">Caricamento…</p>}
      <div className="adm-table adm-table--crisis">
        <div className="adm-tr adm-tr--head"><div>Mercato</div><div>Etichetta</div><div>Numero</div><div>Orari</div><div>Verificato</div><div className="adm-tr__right">Azioni</div></div>
        {rows.map((r) => (
          <div className={`adm-tr${r.active ? '' : ' is-inactive'}`} key={r.id}>
            <div>{r.market}</div>
            <div><b>{r.label}</b>{r.url ? <><br /><a href={r.url} target="_blank" rel="noreferrer" className="adm-muted">{r.url}</a></> : null}</div>
            <div className="adm-mono">{r.number}</div>
            <div>{r.hours ?? ''}</div>
            <div>
              {r.lastVerifiedAt ? `${fmt(Date.parse(r.lastVerifiedAt))} · ${r.verifiedBy ?? ''}` : 'mai'}
              {' '}{crisisVerificationOverdue(r) ? <span className="adm-pill adm-pill--warn">da verificare</span> : <span className="adm-pill adm-pill--ok">ok</span>}
            </div>
            <div className="adm-tr__right">
              <button className="b2b-btn" disabled={busy} onClick={() => void verify(r)}>Verificato oggi</button>
              <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => setDraft({ ...r })}>Modifica</button>
            </div>
          </div>
        ))}
      </div>
      <div className="adm-made__acts" style={{ marginTop: 12 }}>
        <button className="b2b-btn b2b-btn--primary" onClick={() => setDraft({ id: `res-${Date.now().toString(36)}`, market: 'EU', position: (rows.length + 1), label: '', number: '', hours: '', url: '', lastVerifiedAt: null, verifiedBy: null, active: true })}>Aggiungi numero</button>
      </div>
      {draft && (
        <div className="card adm-partner-form">
          <div className="adm-partner-form__grid">
            <label><span className="b2b-label">Mercato</span>
              <select className="adm-select" value={draft.market} onChange={(e) => setDraft({ ...draft, market: e.target.value as 'BR' | 'EU' })}><option value="BR">BR</option><option value="EU">EU</option></select>
            </label>
            <label><span className="b2b-label">Posizione</span><input className="b2b-input" type="number" value={draft.position} onChange={(e) => setDraft({ ...draft, position: Number(e.target.value) })} /></label>
            <label><span className="b2b-label">Etichetta</span><input className="b2b-input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="es. Telefono Amico" /></label>
            <label><span className="b2b-label">Numero</span><input className="b2b-input" value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value.replace(/[^0-9+]/g, '') })} /></label>
            <label><span className="b2b-label">Orari</span><input className="b2b-input" value={draft.hours ?? ''} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} placeholder="24h · gratuito" /></label>
            <label className="adm-partner-form__wide"><span className="b2b-label">Sito</span><input className="b2b-input" value={draft.url ?? ''} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://" /></label>
            <label className="adm-partner-form__check"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Attivo</label>
          </div>
          <div className="adm-made__acts">
            <button className="b2b-btn b2b-btn--primary" disabled={busy || !draft.label.trim() || !draft.number.trim()} onClick={() => void save({ ...draft, hours: draft.hours?.trim() || undefined, url: draft.url?.trim() || undefined })}>Salva</button>
            <button className="b2b-btn b2b-btn--ghost" onClick={() => setDraft(null)}>Annulla</button>
          </div>
        </div>
      )}
    </>
  )
}

/* ----------------------------------------------------- registro consensi -- */

function Consents() {
  const dp = useDataProvider()
  const users = useAdminUsers()
  const [profileId, setProfileId] = useState('')
  const [rows, setRows] = useState<{ acceptances: Acceptance[]; consents: ConsentEvent[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profileId) { setRows(null); return }
    setError(null)
    dp.listUserLegalRecords(profileId).then(setRows).catch((e) => setError((e as Error).message))
  }, [dp, profileId])

  return (
    <>
      <p className="b2b-sub">Lo storico delle accettazioni e dei consensi di una persona: quale versione dei Termini, quando, in che lingua, da quale canale; ogni consenso dato o revocato con la formulazione vista. L’onere di provare il consenso è del titolare — questo è il registro. Esportabile dalla risposta a una richiesta dei dati (dominio B).</p>
      <div className="adm-addrow">
        <select className="adm-select" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          <option value="">Scegli una persona…</option>
          {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
        </select>
      </div>
      {error && <p className="pe-err">{error}</p>}
      {rows && (
        <>
          <h2 className="adm-h2">Accettazioni</h2>
          {!rows.acceptances.length && <p className="adm-muted">Nessuna accettazione registrata.</p>}
          {rows.acceptances.length > 0 && (
            <div className="adm-table adm-table--versions">
              <div className="adm-tr adm-tr--head"><div>Documento</div><div>Versione</div><div>Lingua</div><div>Canale</div><div>Quando</div></div>
              {rows.acceptances.map((a) => (
                <div className="adm-tr" key={a.id}><div><b>{a.docId}</b></div><div className="adm-mono">{a.version}</div><div>{a.locale}</div><div>{a.channel}</div><div>{new Date(a.acceptedAt).toLocaleString('it-IT')}</div></div>
              ))}
            </div>
          )}
          <h2 className="adm-h2" style={{ marginTop: 16 }}>Consensi</h2>
          {!rows.consents.length && <p className="adm-muted">Nessun consenso registrato.</p>}
          {rows.consents.length > 0 && (
            <div className="adm-table adm-table--consents">
              <div className="adm-tr adm-tr--head"><div>Finalità</div><div>Stato</div><div>Formulazione</div><div>Quando</div></div>
              {rows.consents.map((c) => (
                <div className="adm-tr" key={c.id}>
                  <div><b>{c.purpose}</b></div>
                  <div>{c.granted ? <span className="adm-pill adm-pill--ok">dato</span> : <span className="adm-pill adm-pill--idle">revocato</span>}</div>
                  <div className="adm-muted">{c.wording}</div>
                  <div>{new Date(c.at).toLocaleString('it-IT')}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
