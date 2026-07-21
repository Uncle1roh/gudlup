import { useEffect, useRef, useState } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { SessionPlayer } from '../lib/audio'
import { getProtocol, versionLengthSeconds } from '../data/protocols'
import { PRESETS, type Patient, type RapidNote } from './data'
import { VideoStage } from './webrtc/VideoStage'
import type { LaunchConfig } from './ClinicalWizard'

export interface SessionResult {
  protocolCode: string
  goal: string
  startedAt: number
  endedAt: number
  notes: RapidNote[]
  vasPre: number
  vasPost: number
  intervened: boolean
  completed: boolean
}

interface MonitoredSessionProps {
  patient: Patient
  config: LaunchConfig
  demoSeconds: number | null
  onEnd: (result: SessionResult) => void
}

type Status = 'running' | 'paused' | 'intervening'

function mmss(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function MonitoredSession({ patient, config, demoSeconds, onEnd }: MonitoredSessionProps) {
  const protocol = getProtocol(config.protocolCode) ?? getProtocol('GL-ANX 1.1')!
  const preset = PRESETS[protocol.family]
  const total = demoSeconds ?? versionLengthSeconds(protocol, 24)

  // phase boundaries
  const bounds = (() => {
    let acc = 0
    return protocol.phases.map((ph) => {
      const start = acc
      const len = ph.fraction * total
      acc += len
      return { ph, start, end: acc }
    })
  })()

  const [elapsed, setElapsed] = useState(0)
  const [status, setStatus] = useState<Status>('running')
  const [notes, setNotes] = useState<RapidNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [confirmStop, setConfirmStop] = useState(false)

  const statusRef = useRef<Status>('running')
  const startedAt = useRef(Date.now())
  const intervenedRef = useRef(false)
  const player = useRef<SessionPlayer | null>(null)
  const ended = useRef(false)
  const elapsedRef = useRef(0)
  const notesRef = useRef<RapidNote[]>([])

  statusRef.current = status
  notesRef.current = notes

  // audio + timer lifecycle
  useEffect(() => {
    const version = protocol.versions.find((v) => v.duration === 24)
    const url = version?.audioUrl?.['pt-BR']
    player.current = new SessionPlayer({ audioUrl: url, volume: 0.45 })
    void player.current.play()

    const iv = setInterval(() => {
      if (statusRef.current !== 'running') return
      const next = elapsedRef.current + 0.25
      elapsedRef.current = next
      setElapsed(next)
      if (next >= total && !ended.current) {
        ended.current = true
        finish(true)
      }
    }, 250)

    return () => {
      clearInterval(iv)
      player.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function finish(completed: boolean) {
    player.current?.stop()
    onEnd({
      protocolCode: protocol.code,
      goal: config.goal,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      notes: notesRef.current,
      vasPre: 3,
      vasPost: completed ? 6 : 5,
      intervened: intervenedRef.current,
      completed,
    })
  }

  function togglePause() {
    if (status === 'running') {
      setStatus('paused')
      player.current?.pause()
    } else if (status === 'paused') {
      setStatus('running')
      void player.current?.resume()
    }
  }

  function intervene() {
    if (status === 'intervening') {
      setStatus('running')
      void player.current?.resume()
    } else {
      intervenedRef.current = true
      setStatus('intervening')
      player.current?.pause()
      addNote(`INTERVENE — two-way audio opened`)
    }
  }

  function addNote(text: string) {
    const idx = bounds.findIndex((b) => elapsed >= b.start && elapsed < b.end)
    const phase = idx >= 0 ? bounds[idx].ph.id : protocol.phases.length
    setNotes((n) => [...n, { phase, at: Math.round(elapsed), text }])
  }

  function submitNote() {
    if (!noteText.trim()) return
    addNote(noteText.trim())
    setNoteText('')
  }

  const curIdx = Math.max(0, bounds.findIndex((b) => elapsed >= b.start && elapsed < b.end))
  const curPhase = bounds[curIdx]?.ph ?? protocol.phases[protocol.phases.length - 1]
  const showOrb = !!curPhase.showOrb && status === 'running'
  const pct = Math.min(100, (elapsed / total) * 100)

  return (
    <div className="monitor">
      {/* status bar */}
      <div className="monitor__bar">
        <span className="monitor__patient">● {patient.name}</span>
        <span className="monitor__proto">{protocol.code} · {config.goal || 'no goal set'}</span>
        <span className="monitor__clock">{mmss(elapsed)} / {mmss(total)}</span>
        {status !== 'running' && <span className={`monitor__state monitor__state--${status}`}>{status === 'paused' ? 'PAUSED' : 'INTERVENING'}</span>}
      </div>

      <div className="monitor__grid">
        {/* LEFT 60% — live patient video + mirrored immersive overlay */}
        <div className="monitor__video">
          <VideoStage patientName={patient.name} intervening={status === 'intervening'} />
          {/* small mirror of patient's immersive screen */}
          <div className="vid-mirror">
            <div className={`vid-mirror__screen${showOrb ? '' : ' is-dark'}`}>
              {showOrb ? <BreathingOrb size={56} /> : <span className="vid-mirror__dot" />}
            </div>
            <span className="b2b-sub">patient screen</span>
          </div>
        </div>

        {/* RIGHT TOP — timeline + active parameters */}
        <div className="monitor__timeline">
          <h3 className="monitor__h">Timeline</h3>
          <div className="phase-bar">
            <div className="phase-bar__fill" style={{ width: `${pct}%` }} />
          </div>
          <ol className="phases">
            {bounds.map((b, i) => (
              <li key={b.ph.id} className={`phase${i === curIdx ? ' is-now' : ''}${elapsed >= b.end ? ' is-done' : ''}`}>
                <span className="phase__num">{b.ph.id}</span>
                <span className="phase__name">{b.ph.name}</span>
                <span className="b2b-sub">{mmss(b.start)}</span>
              </li>
            ))}
          </ol>

          <h3 className="monitor__h">Active parameters</h3>
          <div className="params">
            <span className="param">Binaural <b>{preset.binaural}</b></span>
            <span className="param">Breathing <b>{preset.breathing}</b></span>
            <span className="param">Voice <b>{preset.voice}</b></span>
            <span className="param">Looper <b>{preset.loop}</b></span>
          </div>
        </div>

        {/* RIGHT BOTTOM — controls + rapid notes */}
        <div className="monitor__actions">
          <div className="monitor__controls">
            <button className="ctl" onClick={togglePause}>{status === 'paused' ? '▶ Resume' : '⏸ Pause'}</button>
            <button className="ctl ctl--stop" onClick={() => setConfirmStop(true)}>⏹ Stop</button>
            <button className={`ctl ctl--intervene${status === 'intervening' ? ' is-active' : ''}`} onClick={intervene}>
              {status === 'intervening' ? '✓ Resume treatment' : '⚠ INTERVENE'}
            </button>
          </div>

          <div className="notes-box">
            <div className="notes-box__input">
              <input
                placeholder="Rapid note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitNote()}
              />
              <button onClick={submitNote}>Add</button>
            </div>
            <ul className="notes-list">
              {notes.length === 0 && <li className="b2b-sub">Notes are timestamped to the current phase and feed the report.</li>}
              {[...notes].reverse().map((n, i) => (
                <li key={i} className="note-line">
                  <span className="note-line__ts">P{n.phase} · {mmss(n.at)}</span>
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {confirmStop && (
        <div className="modal">
          <div className="modal__box">
            <h3>Stop the session?</h3>
            <p className="b2b-sub">The patient will return to the video call. This ends treatment early.</p>
            <div className="modal__actions">
              <button className="b2b-btn" onClick={() => setConfirmStop(false)}>Keep going</button>
              <button className="b2b-btn b2b-btn--danger" onClick={() => finish(false)}>Stop session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
