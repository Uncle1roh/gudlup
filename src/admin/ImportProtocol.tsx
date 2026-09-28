import { useI18n } from '../i18n'
import { useRef, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { registerProtocol } from '../data/protocols'
import { FAMILY_LABEL } from '../compose/types'
import { parseImport, isParseable, csvTemplate, type ParsedDraft } from './importParse'
import { extractDocxText } from './docxText'
import { parseProtocolDoc, looksLikeProtocolDoc, type ProtocolSpec } from './protocolDoc'
import { SpecImport } from './SpecImport'
import { parseDatasheet, type Datasheet } from './datasheet'
import { DatasheetImport } from './DatasheetImport'
import { parsePlainTimeline, probePlainTimeline, type PlainTimeline } from './plainTimeline'
import { PlainImport } from './PlainImport'
import type { CatalogProtocol } from '../data/catalog'

type Step = 'upload' | 'review' | 'done'
interface Edit { title?: string; blurb?: string }

function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ImportProtocol({ actor, onBack }: { actor: string; onBack: () => void }) {
  const dp = useDataProvider()
  /* the console is pinned to Italian: family names are shown in Italian */
  const { t: tr } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const srcRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [sourceDoc, setSourceDoc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<ParsedDraft[]>([])
  const [include, setInclude] = useState<Record<number, boolean>>({})
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [publishedCount, setPublishedCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [spec, setSpec] = useState<ProtocolSpec | null>(null)
  const [datasheet, setDatasheet] = useState<Datasheet | null>(null)
  const [plain, setPlain] = useState<PlainTimeline | null>(null)
  const [reading, setReading] = useState(false)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null)
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''

    // Protocol DATASHEET path (.xlsx / .xls): the GL-ANX 1.3 workbook — the
    // canonical structured database of a protocol's audio configuration.
    // Parsed sheet-by-sheet and handed to the datasheet review/render screen.
    if (ext === 'xlsx' || ext === 'xls') {
      setReading(true)
      try {
        const bytes = await f.arrayBuffer()
        // NEW recommended path: PLAIN clip-level Timeline (README / version
        // sheets with a clip_id grid / Affermazioni). Probed first; legacy
        // Scheda Dati / Scheda Unica workbooks fall through unchanged.
        if (await probePlainTimeline(bytes)) {
          const pres = await parsePlainTimeline(bytes)
          if (pres.error || !pres.timeline) { setError(pres.error ?? 'Impossibile leggere questo PLAIN Timeline.'); return }
          setFileName(f.name)
          setPlain(pres.timeline)
          const nClips = pres.timeline.versions.reduce((n, v) => n + v.clips.length, 0)
          void dp.logAudit({ actor, action: 'protocol.import.parsed', target: f.name, detail: `plain timeline · ${pres.timeline.code ?? '?'} · ${pres.timeline.versions.length} versions · ${nClips} clips · ${pres.timeline.issues.length} issues` })
          return
        }
        const res = await parseDatasheet(bytes)
        if (res.error || !res.datasheet) { setError(res.error ?? 'Impossibile leggere questa cartella di lavoro.'); return }
        setFileName(f.name)
        setDatasheet(res.datasheet)
        void dp.logAudit({ actor, action: 'protocol.import.parsed', target: f.name, detail: `datasheet · ${res.datasheet.code} · ${res.datasheet.versions.length} versions · ${res.datasheet.issues.length} notes` })
      } catch (err) {
        setError(`Impossibile leggere la cartella di lavoro: ${(err as Error).message}`)
      } finally {
        setReading(false)
      }
      return
    }

    // Protocol DOCUMENT path (.docx / .pdf / .txt / .md): the full "Protocol
    // for Developers" spec — parsed into a ProtocolSpec and rendered to audio.
    // .docx is the most reliable: it's the source document and its tables come
    // through column-perfect; PDF text layers vary by exporter.
    if (ext === 'docx' || ext === 'pdf' || ext === 'txt' || ext === 'md') {
      setReading(true)
      try {
        const text = ext === 'docx'
          ? await extractDocxText(f)
          : ext === 'pdf'
            ? await (await import('./pdfText')).extractPdfText(f)
            : await f.text()
        if (ext === 'pdf' && text.replace(/\s+/g, '').length < 200) {
          setError(`"${f.name}" contiene poco o nessun testo selezionabile: probabilmente è un PDF scansionato o appiattito. Carica il .docx originale (ora supportato) oppure esporta di nuovo il PDF con il livello di testo.`)
          return
        }
        if (!looksLikeProtocolDoc(text)) {
          setError(`"${f.name}" non sembra un documento di protocollo (nessun codice GL con timeline). Se è un PDF esportato, prova a caricare il .docx originale: si importa in modo più affidabile. Per importazioni in blocco usa CSV/JSON.`)
          return
        }
        const res = parseProtocolDoc(text)
        if (res.error || !res.spec) { setError(res.error ?? 'Impossibile leggere questo documento.'); return }
        setFileName(f.name)
        setSpec(res.spec)
        void dp.logAudit({ actor, action: 'protocol.import.parsed', target: f.name, detail: `spec doc · ${res.spec.code} · ${res.spec.versions.length} versions` })
      } catch (err) {
        const msg = (err as Error).message
        setError(/dynamically imported module|Failed to fetch|import/i.test(msg)
          ? 'L’app è stata aggiornata dopo l’apertura di questa pagina e una parte non è più attuale: ricarica la pagina (Ctrl+Shift+R) e scegli di nuovo il file.'
          : `Impossibile leggere il file: ${msg}`)
      } finally {
        setReading(false)
      }
      return
    }

    // Structured path (.csv / .tsv / .json): one row per protocol.
    if (!isParseable(f.name)) {
      setError(`"${f.name}" non è un formato supportato. Carica il PDF del protocollo (il documento "Protocol for Developers") oppure un CSV/JSON per l’importazione in blocco.`)
      return
    }
    let text = ''
    try { text = await f.text() } catch { setError('Impossibile leggere il file.'); return }
    const res = parseImport(f.name, text)
    if (res.error) { setError(res.error); return }
    setFileName(f.name)
    setDrafts(res.drafts)
    setInclude(Object.fromEntries(res.drafts.map((d, i) => [i, d.ok])))
    setEdits({})
    setStep('review')
    void dp.logAudit({ actor, action: 'protocol.import.parsed', target: f.name, detail: `${res.drafts.length} rows` })
  }

  function onSource(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setSourceDoc(f.name)
  }

  async function publish() {
    setBusy(true)
    let n = 0
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]
      if (!include[i] || !d.ok) continue
      const final: CatalogProtocol = {
        ...d.protocol,
        title: (edits[i]?.title ?? d.protocol.title).trim() || d.protocol.title,
        blurb: (edits[i]?.blurb ?? d.protocol.blurb).trim(),
        updatedAt: Date.now(),
      }
      await dp.saveProtocol(final)
      registerProtocol(final) // resolvable in-session everywhere getProtocol() is called
      await dp.logAudit({ actor, action: 'protocol.imported', target: final.code, detail: `${FAMILY_LABEL[final.family]}${sourceDoc ? ` · src ${sourceDoc}` : ''}` })
      n++
    }
    setPublishedCount(n)
    setBusy(false)
    setStep('done')
  }

  /* ---- PLAIN TIMELINE (parsed clip-level workbook) ---- */
  if (plain && fileName) {
    return (
      <PlainImport
        protocolCode={plain.code ?? ''}
        timeline={plain}
        fileName={fileName}
        actor={actor}
        onCancel={() => { setPlain(null); setFileName(null) }}
        onDone={onBack}
      />
    )
  }

  /* ---- PROTOCOL DATASHEET (parsed workbook) ---- */
  if (datasheet && fileName) {
    return (
      <DatasheetImport
        datasheet={datasheet}
        fileName={fileName}
        actor={actor}
        onCancel={() => { setDatasheet(null); setFileName(null) }}
        onDone={onBack}
      />
    )
  }

  /* ---- PROTOCOL DOCUMENT (parsed spec) ---- */
  if (spec && fileName) {
    return (
      <SpecImport
        spec={spec}
        fileName={fileName}
        actor={actor}
        onCancel={() => { setSpec(null); setFileName(null) }}
        onDone={onBack}
      />
    )
  }

  /* ---- DONE ---- */
  if (step === 'done') {
    return (
      <div className="adm-page">
        <header className="adm-page__head"><h1 className="b2b-h1">Importazione completata</h1></header>
        <div className="adm-note adm-note--ok">
          <b>{publishedCount === 1 ? '1 protocollo pubblicato' : `${publishedCount} protocolli pubblicati`}</b> nel catalogo condiviso: disponibili per ogni azienda
          e già selezionabili nella procedura guidata del clinico. L’audio resta <i>provvisorio</i> finché non viene renderizzato.
        </div>
        <div className="adm-import__foot" style={{ marginTop: 16 }}>
          <div className="adm-cred__actions">
            <button className="b2b-btn b2b-btn--primary" onClick={onBack}>Vai al catalogo</button>
            <button className="b2b-btn" onClick={() => { window.location.hash = '#studio' }}>Apri il Sound Studio per renderizzare l’audio →</button>
          </div>
          <p className="b2b-sub adm-import__hint">
            Il render del letto sonoro a strati e della voce pt-BR di ogni protocollo si fa nel Sound Studio (lo strumento di authoring audio);
            una volta esportato, attiva <code>audioReady</code> e il player lo usa al posto del segnaposto sintetizzato.
          </p>
        </div>
      </div>
    )
  }

  /* ---- REVIEW ---- */
  if (step === 'review') {
    const okCount = drafts.filter((d, i) => d.ok && include[i]).length
    return (
      <div className="adm-page">
        <header className="adm-page__head adm-page__head--row">
          <div>
            <h1 className="b2b-h1">Revisione importazione</h1>
            <p className="b2b-sub">Da <code>{fileName}</code>: {drafts.length} letti, {drafts.filter((d) => d.ok).length} pronti. Modifica i titoli e scegli cosa pubblicare.</p>
          </div>
          <button className="b2b-btn b2b-btn--ghost" onClick={() => { setStep('upload'); setDrafts([]) }}>← Scegli un altro file</button>
        </header>

        <div className="adm-review">
          {drafts.map((d, i) => {
            const errs = d.issues.filter((x) => x.startsWith('ERROR'))
            const warns = d.issues.filter((x) => !x.startsWith('ERROR'))
            return (
              <div key={i} className={`adm-draft ${d.ok ? '' : 'is-bad'}`}>
                <label className="adm-draft__pick">
                  <input type="checkbox" checked={!!include[i]} disabled={!d.ok} onChange={(e) => setInclude((m) => ({ ...m, [i]: e.target.checked }))} />
                </label>
                <div className="adm-draft__body">
                  <div className="adm-draft__top">
                    <span className="adm-mono">{d.protocol.code}</span>
                    <span className="adm-tag">{tr(FAMILY_LABEL[d.protocol.family])}</span>
                    <span className="adm-draft__vers">{d.protocol.versions.map((v) => `${v.duration}m`).join(' · ')}</span>
                    <span className="adm-draft__vers">{d.protocol.phases.length} fasi</span>
                    {d.compose.brainwave && <span className="adm-tag">{d.compose.brainwave}</span>}
                  </div>
                  <input
                    className="b2b-input adm-draft__title"
                    value={edits[i]?.title ?? d.protocol.title}
                    onChange={(e) => setEdits((m) => ({ ...m, [i]: { ...m[i], title: e.target.value } }))}
                  />
                  <input
                    className="b2b-input adm-draft__blurb"
                    placeholder="Descrizione per la persona"
                    value={edits[i]?.blurb ?? d.protocol.blurb}
                    onChange={(e) => setEdits((m) => ({ ...m, [i]: { ...m[i], blurb: e.target.value } }))}
                  />
                  {errs.length > 0 && <div className="adm-issues adm-issues--err">{errs.map((x, k) => <span key={k}>{x.replace(/^ERROR:\s*/, '')}</span>)}</div>}
                  {warns.length > 0 && <div className="adm-issues adm-issues--warn">{warns.map((x, k) => <span key={k}>{x}</span>)}</div>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="adm-review__foot">
          <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={busy || okCount === 0} onClick={publish}>
            {busy ? 'Pubblicazione…' : okCount === 1 ? 'Pubblica 1 protocollo →' : `Pubblica ${okCount} protocolli →`}
          </button>
          {okCount === 0 && <p className="b2b-sub">Correggi gli errori qui sopra (o seleziona una riga) per pubblicare.</p>}
        </div>
      </div>
    )
  }

  /* ---- UPLOAD ---- */
  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Importa protocolli</h1>
          <p className="b2b-sub">Trasforma una specifica scritta in protocolli Good Loop ascoltabili e pubblicabili.</p>
        </div>
        <button className="b2b-btn b2b-btn--ghost" onClick={onBack}>← Torna al catalogo</button>
      </header>

      <div className="adm-import">
        <label className="adm-drop">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.docx,.pdf,.txt,.md,.csv,.tsv,.json" style={{ display: 'none' }} onChange={onPick} />
          <span className="adm-drop__icon" aria-hidden="true">⇪</span>
          <span className="adm-drop__cta">
            <b>{reading ? 'Lettura del file…' : 'Scegli un PLAIN Timeline o un Protocol Datasheet (.xlsx), un documento di protocollo (.docx / PDF), oppure CSV/JSON per l’importazione in blocco'}</b>
            <span className="adm-drop__meta">XLSX (consigliato): il PLAIN Timeline a livello di clip (preferito) o una cartella Datasheet legacy · DOCX/PDF/TXT/MD: il documento descrittivo "Protocol for Developers" · CSV/JSON: un protocollo per riga</span>
          </span>
          {/* NOTE: no onClick here — this span sits inside the <label>, whose
              native activation already opens the file input; a programmatic
              .click() on top of that opened the dialog twice. */}
          <span className="b2b-btn b2b-btn--primary adm-drop__btn">Sfoglia…</span>
        </label>

        {error && <div className="adm-issues adm-issues--err" style={{ maxWidth: 720 }}><span>{error}</span></div>}

        <div className="adm-formats">
          <div className="adm-formats__title">Formati Excel accettati</div>
          <div className="adm-formats__grid">
            <div className="adm-formats__card adm-formats__card--best">
              <b>⭐ PLAIN Timeline (a livello di clip) — consigliato</b>
              <p>Fogli <code>README</code> · uno per versione (Quick/Standard/Deep) · <code>Affermazioni</code>. <b>Una riga = una clip</b> su una traccia con nome (<code>traccia</code>), sei tipi: Soundscape, Music, Binaural, Bilateral, Solfeggio, Voice. Tempi numerici in <code>start_s</code>/<code>end_s</code>; volumi in dB rispetto alla voce guida (0 dB).</p>
              <p>Voice comprende dicotico / sussurro / eco a strati / looper tramite parametri (archetipo, pan, modalità, eco, set_affermazioni <code>CSI-01..12</code>). Soundscape porta solo un tag <code>ambiente</code> e Music solo la sua <code>fase</code>: l’app estrae il file a caso dal pool. Battimento binaurale = carrier_R − carrier_L. Validato sul documento delle regole (§8.0 finestre, Binaural XOR Solfeggio).</p>
            </div>
            <div className="adm-formats__card">
              <b>Scheda Unica (un solo foglio)</b>
              <p>Un foglio con sezioni <code>### NOME</code>: PROTOCOLLO · PARAMETRI · VERSIONI · FASI · TIMELINE · AFFERMAZIONI · MUSICA (+ MIX, RESPIRAZIONE, TECNICHE/NOTE). Colonne Voce/Canale/Effetto/Velocità per riga. Ancora pienamente supportato.</p>
            </div>
            <div className="adm-formats__card">
              <b>Cartella a più fogli (legacy)</b>
              <p>Il layout originale di GL-ANX 1.3: Protocollo, Invarianti, Versioni, Fasi, Timeline_6/12/24min, Affermazioni, MappaMusicale. Ancora pienamente supportato; si importa senza modifiche.</p>
            </div>
          </div>
          <p className="adm-formats__foot">Le colonne si riconoscono dal nome dell’intestazione: colonne in più e ordini diversi vanno bene. Le righe di commento iniziano con <code>//</code>. Chiedi al team di sviluppo <code>GL_Scheda_UNICA_TEMPLATE.xlsx</code>: contiene le istruzioni di compilazione e un esempio per sezione.</p>
        </div>

        <div className="adm-src">
          <input ref={srcRef} type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" style={{ display: 'none' }} onChange={onSource} />
          <button className="b2b-btn b2b-btn--ghost" onClick={() => srcRef.current?.click()}>Allega il documento sorgente (facoltativo)</button>
          {sourceDoc ? <span className="b2b-sub">Documento di riferimento: <b>{sourceDoc}</b></span> : <span className="b2b-sub">il PDF/Excel originale, conservato come riferimento</span>}
          <button className="adm-link" onClick={() => download('goodloop-protocol-template.csv', csvTemplate(), 'text/csv')}>Scarica il modello CSV</button>
        </div>

        <ol className="adm-pipe">
          <li className="adm-pipe__step is-active"><span className="adm-pipe__num">1</span><span className="adm-pipe__body"><span className="adm-pipe__label">Carica la specifica</span><span className="adm-pipe__note">PDF del protocollo (configurazione audio completa) o CSV / JSON (in blocco)</span></span></li>
          <li className="adm-pipe__step is-next"><span className="adm-pipe__num">2</span><span className="adm-pipe__body"><span className="adm-pipe__label">Rivedi e modifica</span><span className="adm-pipe__note">bozze validate: correggi i titoli, scegli cosa pubblicare</span></span></li>
          <li className="adm-pipe__step is-next"><span className="adm-pipe__num">3</span><span className="adm-pipe__body"><span className="adm-pipe__label">Pubblica</span><span className="adm-pipe__note">una volta → disponibile per ogni azienda e nella procedura guidata del clinico</span></span></li>
          <li className="adm-pipe__step is-next"><span className="adm-pipe__num">4</span><span className="adm-pipe__body"><span className="adm-pipe__label">Render audio</span><span className="adm-pipe__note">WAV renderizzato qui dalla configurazione letta (letto sonoro + voce pt-BR), oppure rifinito nel Sound Studio</span></span></li>
        </ol>
      </div>
    </div>
  )
}
