import { useRef, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { registerProtocol } from '../data/protocols'
import { FAMILY_LABEL } from '../compose/types'
import { parseImport, isParseable, csvTemplate, type ParsedDraft } from './importParse'
import { parseProtocolDoc, looksLikeProtocolDoc, type ProtocolSpec } from './protocolDoc'
import { SpecImport } from './SpecImport'
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
  const [reading, setReading] = useState(false)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null)
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''

    // Protocol DOCUMENT path (.pdf / .txt / .md): the full "Protocol for
    // Developers" spec — parsed into a ProtocolSpec and rendered to audio.
    if (ext === 'pdf' || ext === 'txt' || ext === 'md') {
      setReading(true)
      try {
        const text = ext === 'pdf'
          ? await (await import('./pdfText')).extractPdfText(f)
          : await f.text()
        if (!looksLikeProtocolDoc(text)) {
          setError(`"${f.name}" doesn't look like a protocol document (no GL-code + timeline found). For bulk imports use CSV/JSON.`)
          return
        }
        const res = parseProtocolDoc(text)
        if (res.error || !res.spec) { setError(res.error ?? 'Could not parse that document.'); return }
        setFileName(f.name)
        setSpec(res.spec)
        void dp.logAudit({ actor, action: 'protocol.import.parsed', target: f.name, detail: `spec doc · ${res.spec.code} · ${res.spec.versions.length} versions` })
      } catch (err) {
        const msg = (err as Error).message
        setError(/dynamically imported module|Failed to fetch|import/i.test(msg)
          ? 'The app was updated since this page was opened, so part of it is stale — refresh the page (Ctrl+Shift+R) and pick the file again.'
          : `Could not read that file: ${msg}`)
      } finally {
        setReading(false)
      }
      return
    }

    // Structured path (.csv / .tsv / .json): one row per protocol.
    if (!isParseable(f.name)) {
      setError(`"${f.name}" isn't a supported file. Upload a protocol PDF (the "Protocol for Developers" document), or a CSV/JSON for bulk import.`)
      return
    }
    let text = ''
    try { text = await f.text() } catch { setError('Could not read that file.'); return }
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
        <header className="adm-page__head"><h1 className="b2b-h1">Import complete</h1></header>
        <div className="adm-note adm-note--ok">
          <b>{publishedCount} protocol{publishedCount === 1 ? '' : 's'} published</b> to the shared catalog — available to every company,
          and now selectable in the clinician session wizard. Audio still shows as <i>placeholder</i> until rendered.
        </div>
        <div className="adm-import__foot" style={{ marginTop: 16 }}>
          <div className="adm-cred__actions">
            <button className="b2b-btn b2b-btn--primary" onClick={onBack}>View catalog</button>
            <button className="b2b-btn" onClick={() => { window.location.hash = '#studio' }}>Open Sound Studio to render audio →</button>
          </div>
          <p className="b2b-sub adm-import__hint">
            Rendering the layered bed + pt-BR voice for each protocol is done in the Sound Studio (the audio authoring tool);
            once exported, flip <code>audioReady</code> and the player uses it instead of the synthesized placeholder.
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
            <h1 className="b2b-h1">Review import</h1>
            <p className="b2b-sub">From <code>{fileName}</code> — {drafts.length} parsed, {drafts.filter((d) => d.ok).length} ready. Edit titles, choose what to publish.</p>
          </div>
          <button className="b2b-btn b2b-btn--ghost" onClick={() => { setStep('upload'); setDrafts([]) }}>← Choose another file</button>
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
                    <span className="adm-tag">{FAMILY_LABEL[d.protocol.family]}</span>
                    <span className="adm-draft__vers">{d.protocol.versions.map((v) => `${v.duration}m`).join(' · ')}</span>
                    <span className="adm-draft__vers">{d.protocol.phases.length} phases</span>
                    {d.compose.brainwave && <span className="adm-tag">{d.compose.brainwave}</span>}
                  </div>
                  <input
                    className="b2b-input adm-draft__title"
                    value={edits[i]?.title ?? d.protocol.title}
                    onChange={(e) => setEdits((m) => ({ ...m, [i]: { ...m[i], title: e.target.value } }))}
                  />
                  <input
                    className="b2b-input adm-draft__blurb"
                    placeholder="Patient-facing description"
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
            {busy ? 'Publishing…' : `Publish ${okCount} protocol${okCount === 1 ? '' : 's'} →`}
          </button>
          {okCount === 0 && <p className="b2b-sub">Fix the errors above (or pick a row) to publish.</p>}
        </div>
      </div>
    )
  }

  /* ---- UPLOAD ---- */
  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Import protocols</h1>
          <p className="b2b-sub">Turn a written spec into playable, publishable Good Loop protocols.</p>
        </div>
        <button className="b2b-btn b2b-btn--ghost" onClick={onBack}>← Back to catalog</button>
      </header>

      <div className="adm-import">
        <label className="adm-drop">
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.csv,.tsv,.json" style={{ display: 'none' }} onChange={onPick} />
          <span className="adm-drop__icon" aria-hidden="true">⇪</span>
          <span className="adm-drop__cta">
            <b>{reading ? 'Reading document…' : 'Choose a protocol PDF — or a CSV/JSON for bulk import'}</b>
            <span className="adm-drop__meta">PDF/TXT/MD: the full "Protocol for Developers" document (timelines, affirmations, audio config) · CSV/JSON: one protocol per row</span>
          </span>
          {/* NOTE: no onClick here — this span sits inside the <label>, whose
              native activation already opens the file input; a programmatic
              .click() on top of that opened the dialog twice. */}
          <span className="b2b-btn b2b-btn--primary adm-drop__btn">Browse…</span>
        </label>

        {error && <div className="adm-issues adm-issues--err" style={{ maxWidth: 720 }}><span>{error}</span></div>}

        <div className="adm-src">
          <input ref={srcRef} type="file" accept=".pdf,.xlsx,.xls,.doc,.docx" style={{ display: 'none' }} onChange={onSource} />
          <button className="b2b-btn b2b-btn--ghost" onClick={() => srcRef.current?.click()}>Attach source document (optional)</button>
          {sourceDoc ? <span className="b2b-sub">Source of record: <b>{sourceDoc}</b></span> : <span className="b2b-sub">the original PDF/Excel, kept for reference</span>}
          <button className="adm-link" onClick={() => download('goodloop-protocol-template.csv', csvTemplate(), 'text/csv')}>Download CSV template</button>
        </div>

        <ol className="adm-pipe">
          <li className="adm-pipe__step is-active"><span className="adm-pipe__num">1</span><span className="adm-pipe__body"><span className="adm-pipe__label">Upload spec</span><span className="adm-pipe__note">protocol PDF (full audio configuration) or CSV / JSON (bulk)</span></span></li>
          <li className="adm-pipe__step is-next"><span className="adm-pipe__num">2</span><span className="adm-pipe__body"><span className="adm-pipe__label">Review & edit</span><span className="adm-pipe__note">validated drafts, fix titles, choose what to publish</span></span></li>
          <li className="adm-pipe__step is-next"><span className="adm-pipe__num">3</span><span className="adm-pipe__body"><span className="adm-pipe__label">Publish</span><span className="adm-pipe__note">once → available to every company &amp; the clinician wizard</span></span></li>
          <li className="adm-pipe__step is-next"><span className="adm-pipe__num">4</span><span className="adm-pipe__body"><span className="adm-pipe__label">Render audio</span><span className="adm-pipe__note">WAV rendered right here from the parsed configuration (bed + pt-BR voice), or fine-tune in the Sound Studio</span></span></li>
        </ol>
      </div>
    </div>
  )
}
