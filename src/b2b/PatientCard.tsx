import { fmtDate, relWhen, type Patient, type Score } from './data'
import { getProtocol } from '../data/protocols'
import { LINKED_PATIENT_ID } from '../data/mock'

interface PatientCardProps {
  patient: Patient
  onBack: () => void
  onEdit: () => void
  onStartSession: () => void
}

function ScoreTrend({ s }: { s: Score }) {
  const pts = [s.t0, s.t1, s.t2].filter((v): v is number => v != null)
  const first = pts[0]
  const latest = pts[pts.length - 1]
  const delta = latest - first
  const improved = s.lowerIsBetter ? delta < 0 : delta > 0
  return (
    <div className="score">
      <div className="score__top">
        <span className="score__label">{s.label}</span>
        <span className={`score__delta${improved ? ' is-good' : pts.length > 1 ? ' is-bad' : ''}`}>
          {pts.length > 1 ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : '—'}
        </span>
      </div>
      <div className="score__bars">
        {(['T0', 'T1', 'T2'] as const).map((t, i) => {
          const v = [s.t0, s.t1, s.t2][i]
          return (
            <div key={t} className="score__bar">
              <div className="score__track">
                {v != null && <div className="score__fill" style={{ height: `${Math.min(100, (v / s.max) * 100)}%` }} />}
              </div>
              <span className="score__t">{t}</span>
              <span className="score__v">{v != null ? v : '·'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PatientCard({ patient: p, onBack, onEdit, onStartSession }: PatientCardProps) {
  const sinceLast = p.b2cSessions.filter((s) => !p.lastSessionAt || s.date > p.lastSessionAt)
  const interVas = sinceLast.length ? sinceLast.reduce((a, s) => a + (s.vasPost - s.vasPre), 0) / sinceLast.length : null
  const linked = p.id === LINKED_PATIENT_ID

  return (
    <div className="b2b-page">
      <button className="b2b-back" onClick={onBack}>← Roster</button>

      <div className="card-head">
        <div className="card-head__id">
          <div className="card-head__avatar">{p.sex === 'F' ? '🧑🏻' : '🧑🏽'}</div>
          <div>
            <h1 className="b2b-h1">{p.name}</h1>
            <p className="b2b-sub">{p.age} · {p.sex === 'F' ? 'Female' : 'Male'} · {p.reason}</p>
          </div>
        </div>
        <div className="card-head__cta">
          {p.nextSessionAt && <span className="b2b-sub">Next: {relWhen(p.nextSessionAt)}</span>}
          <button className="b2b-btn b2b-btn--ghost" onClick={onEdit}>Edit record</button>
          <button className="b2b-btn b2b-btn--primary" onClick={onStartSession}>Start session →</button>
        </div>
      </div>

      {/* continuity briefing (auto) */}
      <div className="continuity">
        <span className="continuity__tag">Pre-session briefing</span>
        <span>
          {sinceLast.length
            ? `${sinceLast.length} B2C session${sinceLast.length > 1 ? 's' : ''} since last appointment · inter-session VAS ${interVas! >= 0 ? '+' : ''}${interVas!.toFixed(1)}`
            : 'No B2C sessions since last appointment'}
          {p.unread > 0 && ` · ${p.unread} unread message`}
        </span>
      </div>

      <div className="card-grid">
        {/* clinical snapshot */}
        <section className="b2b-card">
          <h2 className="b2b-card__title">Clinical snapshot</h2>
          <dl className="kv">
            <dt>Active conditions</dt><dd>{p.conditions.join(', ') || '—'}</dd>
            <dt>Medications</dt><dd>{p.medications.join(', ') || 'None'}</dd>
            <dt>GL contraindications</dt><dd>{p.contraindications.join(', ')}</dd>
            <dt>Prescription</dt><dd>{p.prescription ?? 'None set'}</dd>
          </dl>
        </section>

        {/* scores */}
        <section className="b2b-card">
          <h2 className="b2b-card__title">Assessment trend (T0 → T2)</h2>
          <div className="scores">{p.scores.map((s) => <ScoreTrend key={s.label} s={s} />)}</div>
        </section>

        {/* goals */}
        <section className="b2b-card">
          <h2 className="b2b-card__title">Goals</h2>
          <ul className="goals">
            {p.goals.map((g, i) => (
              <li key={i} className="goal">
                <span className={`goal__dot goal__dot--${g.status}`} />
                <span>{g.text}</span>
                <span className="goal__status">{g.status.replace('-', ' ')}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* B2B chronology */}
        <section className="b2b-card">
          <h2 className="b2b-card__title">Session history</h2>
          <ul className="chron">
            {p.b2bSessions.length === 0 && <li className="b2b-sub">No sessions yet</li>}
            {[...p.b2bSessions].reverse().map((s) => {
              const proto = getProtocol(s.protocolCode)
              return (
                <li key={s.id} className="chron__item">
                  <div>
                    <strong>{proto?.title ?? s.protocolCode}</strong>
                    <span className="b2b-sub">{fmtDate(s.date)} · {s.duration} min · {s.notes.length} note{s.notes.length !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="chron__delta">+{(s.vasPost - s.vasPre).toFixed(0)}</span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* B2C between appointments */}
        <section className="b2b-card">
          <h2 className="b2b-card__title">B2C self-practice {linked && <span className="link-badge">● linked account · live</span>}</h2>
          <ul className="chron">
            {p.b2cSessions.length === 0 && <li className="b2b-sub">No self-practice logged</li>}
            {[...p.b2cSessions].reverse().slice(0, 4).map((s, i) => (
              <li key={i} className="chron__item">
                <div>
                  <strong>{getProtocol(s.protocolCode)?.title ?? s.protocolCode}</strong>
                  <span className="b2b-sub">{fmtDate(s.date)} · {s.duration} min</span>
                </div>
                <span className="chron__delta">+{(s.vasPost - s.vasPre).toFixed(0)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* notes (therapist-only) */}
        <section className="b2b-card">
          <h2 className="b2b-card__title">Clinical notes <span className="lock">🔒 therapist only</span></h2>
          <p className="notes">{p.clinicalNotes}</p>
          {p.messages.length > 0 && (
            <>
              <h3 className="b2b-card__sub">Messages</h3>
              <ul className="msgs">
                {p.messages.map((m, i) => (
                  <li key={i} className={`msg msg--${m.from}`}>
                    <span className="msg__who">{m.from === 'patient' ? p.name.split(' ')[0] : 'You'}</span>
                    <span>{m.text}</span>
                    <span className="b2b-sub">{relWhen(m.at)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
