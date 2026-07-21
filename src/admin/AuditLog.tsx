import { useAuditEvents } from './hooks'
import { tr } from '../i18n'
import { fmtDateTime } from '../b2b/data'

/** Group the action namespace (e.g. 'credential.approved' → 'credential') for a colour cue. */
function ns(action: string): string {
  return action.split('.')[0]
}

export function AuditLog() {
  const { data, loading } = useAuditEvents()
  const events = data ?? []

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">{tr('Audit log')}</h1>
        <p className="b2b-sub">Append-only record of admin actions. {events.length} event{events.length === 1 ? '' : 's'} this session.</p>
      </header>

      {loading && <p className="b2b-sub">{tr('Loading…')}</p>}

      {!loading && (
        <div className="adm-table adm-table--audit">
          <div className="adm-tr adm-tr--head">
            <div>{tr('When')}</div><div>{tr('Actor')}</div><div>{tr('Action')}</div><div>{tr('Target')}</div><div>{tr('Detail')}</div>
          </div>
          {events.map((e) => (
            <div className="adm-tr" key={e.id}>
              <div className="adm-muted">{fmtDateTime(e.at)}</div>
              <div className="adm-mono">{e.actor}</div>
              <div><span className={`adm-ns adm-ns--${ns(e.action)}`}>{e.action}</span></div>
              <div>{e.target ?? '—'}</div>
              <div className="adm-muted">{e.detail ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
