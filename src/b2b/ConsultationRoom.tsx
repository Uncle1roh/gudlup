import { useEffect, useMemo, useRef, useState } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { SessionPlayer } from '../lib/audio'
import { getProtocol, versionLengthSeconds } from '../data/protocols'
import { useProtocols } from '../admin/hooks'
import { PRESETS, type Patient, type RapidNote } from './data'
import { VideoStage } from './webrtc/VideoStage'
import type { LaunchConfig } from './ClinicalWizard'

export interface SessionResult {
  /** '' when the consultation was talk-only (no audio played). */
  protocolCode: string
  goal: string
  startedAt: number
  endedAt: number
  notes: RapidNote[]
  vasPre: number
  vasPost: number
  intervened: boolean
  /** The audio protocol ran to the end. */
  completed: boolean
  audioPlayed: boolean
}

interface ConsultationRoomProps {
  patient: Patient
  /** Pre-planned audio from the wizard/composer — optional: the call opens
      without one and the protocol is chosen from the library, mid-call. */
  config: LaunchConfig | null
  demoSeconds: number | null
  onEnd: (result: SessionResult) => void
}

type Status = 'running' | 'paused' | 'intervening'
type Dock = 'library' | 'notes' | 'session'

function mmss(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/**
 * The consultation room. The therapist enters the video call with the patient
 * first — no protocol required — talks, and only then (if at all) opens the
 * Good Loop library from the right-hand dock and plays a protocol into the
 * session. Notes are always available and are timestamped against the audio
 * when one is running, against the call otherwise.
 */
export function ConsultationRoom({ patient, config, demoSeconds, onEnd }: ConsultationRoomProps) {
  const { data: catalog, loading: catalogLoading } = useProtocols()
  const protocols = useMemo(() => (catalog ?? []).filter((p) => p.enabled), [catalog])

  const callStartedAt = useRef(Date.now())
  const [callElapsed, setCallElapsed] = useState(0)

  /* the audio protocol playing INTO the call (null = talking only) */
  const [activeCode, setActiveCode] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [status, setStatus] = useState<Status>('running')
  const [audioDone, setAudioDone] = useState(false)

  const [notes, setNotes] = useState<RapidNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [goal, setGoal] = useState(config?.goal ?? '')
  const [dock, setDock] = useState<Dock>(config ? 'library' : 'notes')
  const [pick, setPick] = useState<string>(config?.protocolCode ?? '')
  const [stereoOk, setStereoOk] = useState(false)
  const [checking, setChecking] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)

  const statusRef = useRef<Status>('running')
  const notesRef = useRef<RapidNote[]>([])
  const elapsedRef = useRef(0)
  const totalRef = useRef(0)
  const intervenedRef = useRef(false)
  const audioPlayedRef = useRef(false)
  const completedRef = useRef(false)
  const player = useRef<SessionPlayer | null>(null)

  statusRef.current = status
  notesRef.current = notes

  const protocol = activeCode ? getProtocol(activeCode) : undefined
  const preset = protocol ? PRESETS[protocol.family] : undefined
  const durationMin = config?.durationMin ?? 24
  const total = protocol ? (demoSeconds ?? versionLengthSeconds(protocol, durationMin)) : 0
  totalRef.current = total

  const bounds = useMemo(() => {
    if (!protocol) return []
    let acc = 0
    return protocol.phases.map((ph) => {
      const start = acc
      const len = ph.fraction * (demoSeconds ?? versionLengthSeconds(protocol, durationMin))
      acc += len
      return { ph, start, end: acc }
    })
  }, [protocol, demoSeconds, durationMin])

  /* one clock for the whole room: the call always ticks, the audio only while
     it is running */
  useEffect(() => {
    const iv = window.setInterval(() => {
      setCallElapsed((c) => c + 0.25)
      if (!player.current || statusRef.current !== 'running') return
      const next = elapsedRef.current + 0.25
      elapsedRef.current = next
      setElapsed(next)
      if (totalRef.current > 0 && next >= totalRef.current) {
        completedRef.current = true
        stopAudio(true)
      }
    }, 250)
    return () => {
      window.clearInterval(iv)
      player.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startAudio(code: string) {
    const p = getProtocol(code)
    if (!p) return
    const version = p.versions.find((v) => v.duration === durationMin) ?? p.versions[0]
    const url = version?.audioUrl?.['pt-BR']
    player.current?.stop()
    player.current = new SessionPlayer({ audioUrl: url, volume: 0.45 })
    void player.current.play()
    elapsedRef.current = 0
    audioPlayedRef.current = true
    completedRef.current = false
    setElapsed(0)
    setAudioDone(false)
    setActiveCode(code)
    setStatus('running')
    setDock('session')
    addNote(`Audio started — ${p.code} ${p.title}`)
  }

  function stopAudio(completed: boolean) {
    player.current?.stop()
    player.current = null
    setAudioDone(true)
    setStatus('running')
    addNote(completed ? 'Audio finished' : 'Audio stopped early')
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
      addNote('INTERVENE — two-way audio opened')
    }
  }

  /** Notes are stamped to the audio phase when one is playing; to the call
      clock otherwise (phase 0). */
  function addNote(text: string) {
    const playing = !!player.current
    const at = playing ? Math.round(elapsedRef.current) : Math.round((Date.now() - callStartedAt.current) / 1000)
    const idx = playing ? bounds.findIndex((b) => elapsedRef.current >= b.start && elapsedRef.current < b.end) : -1
    setNotes((n) => [...n, { phase: idx >= 0 ? bounds[idx].ph.id : 0, at, text }])
  }

  function submitNote() {
    if (!noteText.trim()) return
    addNote(noteText.trim())
    setNoteText('')
  }

  function runStereoCheck() {
    setChecking(true)
    setStereoOk(false)
    window.setTimeout(() => { setChecking(false); setStereoOk(true) }, 1200)
  }

  function endConsultation() {
    player.current?.stop()
    onEnd({
      protocolCode: audioPlayedRef.current ? (activeCode ?? '') : '',
      goal,
      startedAt: callStartedAt.current,
      endedAt: Date.now(),
      notes: notesRef.current,
      vasPre: audioPlayedRef.current ? 3 : 0,
      vasPost: audioPlayedRef.current ? (completedRef.current ? 6 : 5) : 0,
      intervened: intervenedRef.current,
      completed: audioPlayedRef.current ? completedRef.current : true,
      audioPlayed: audioPlayedRef.current,
    })
  }

  const playing = !!activeCode && !audioDone
  const curIdx = Math.max(0, bounds.findIndex((b) => elapsed >= b.start && elapsed < b.end))
  const curPhase = bounds[curIdx]?.ph
  const showOrb = !!curPhase?.showOrb && playing && status === 'running'
  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0
  const consentOk = patient.consents.therapy
  const canStart = consentOk && stereoOk

  return (
    <div className="monitor">
      {/* status bar */}
      <div className="monitor__bar">
        <span className="monitor__patient">● {patient.name}</span>
        <span className="monitor__proto">
          {playing ? `${protocol?.code} · ${goal || 'no goal set'}` : audioDone ? 'audio finished · in conversation' : 'consultation — no audio playing'}
        </span>
        <span className="monitor__clock">
          {playing ? `${mmss(elapsed)} / ${mmss(total)}` : mmss(callElapsed)}
        </span>
        {playing && status !== 'running' && (
          <span className={`monitor__state monitor__state--${status}`}>{status === 'paused' ? 'PAUSED' : 'INTERVENING'}</span>
        )}
        <button className="ctl ctl--stop monitor__end" onClick={() => setConfirmEnd(true)}>⏹ End consultation</button>
      </div>

      <div className="monitor__grid monitor__grid--room">
        {/* LEFT — the video call is the room; the audio mirror only appears
            once a protocol is playing */}
        <div className="monitor__video">
          <VideoStage patientName={patient.name} intervening={status === 'intervening'} />
          {playing && (
            <div className="vid-mirror">
              <div className={`vid-mirror__screen${showOrb ? '' : ' is-dark'}`}>
                {showOrb ? <BreathingOrb size={56} /> : <span className="vid-mirror__dot" />}
              </div>
              <span className="b2b-sub">patient screen</span>
            </div>
          )}
        </div>

        {/* RIGHT — the dock: library / notes / running session */}
        <div className="dock">
          <div className="dock__tabs">
            <button className={`dock__tab${dock === 'library' ? ' is-on' : ''}`} onClick={() => setDock('library')}>🎧 Library</button>
            <button className={`dock__tab${dock === 'notes' ? ' is-on' : ''}`} onClick={() => setDock('notes')}>📝 Notes{notes.length ? ` (${notes.length})` : ''}</button>
            <button className={`dock__tab${dock === 'session' ? ' is-on' : ''}`} onClick={() => setDock('session')} disabled={!activeCode}>▶ Session</button>
          </div>

          <div className="dock__body">
            {dock === 'library' && (
              <>
                <h3 className="monitor__h">Good Loop library</h3>
                <p className="dock__hint">
                  Talk first. When you're ready, pick a protocol and play it into the session — the patient hears it, you keep the video.
                </p>

                <div className="dock__checks">
                  <span className={`dock__check${consentOk ? ' is-ok' : ' is-bad'}`}>{consentOk ? '✓' : '✕'} Consent {consentOk ? 'active' : 'missing'}</span>
                  <span className={`dock__check${stereoOk ? ' is-ok' : ''}`}>
                    {stereoOk ? '✓ Stereo OK' : (
                      <button className="check__action" onClick={runStereoCheck} disabled={checking}>{checking ? 'Checking…' : 'Run stereo check'}</button>
                    )}
                  </span>
                </div>

                <label className="dock__label">Session goal</label>
                <input className="b2b-input" placeholder="e.g. Reduce acute anxiety" value={goal} onChange={(e) => setGoal(e.target.value)} />

                <div className="proto-list dock__protos">
                  {catalogLoading && <p className="b2b-sub">Loading protocols…</p>}
                  {!catalogLoading && protocols.length === 0 && <p className="b2b-sub">No protocols are enabled.</p>}
                  {protocols.map((p) => (
                    <button key={p.code} className={`proto${pick === p.code ? ' is-on' : ''}`} onClick={() => setPick(p.code)}>
                      <span className="proto__radio" />
                      <span className="proto__body">
                        <strong>{p.code} · {p.title}</strong>
                        <span className="b2b-sub">{p.blurb}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {pick && PRESETS[getProtocol(pick)?.family ?? ''] && (
                  <div className="dock__preset">
                    {(() => {
                      const ps = PRESETS[getProtocol(pick)!.family]
                      return <>Binaural <b>{ps.binaural}</b> · voice <b>{ps.voice}</b> · looper <b>{ps.loop}</b></>
                    })()}
                  </div>
                )}

                <button
                  className="b2b-btn b2b-btn--primary b2b-btn--lg"
                  disabled={!pick || !canStart}
                  onClick={() => startAudio(pick)}
                >
                  {playing ? 'Switch to this protocol →' : 'Play into session →'}
                </button>
                {!canStart && <p className="b2b-sub dock__blocked">{consentOk ? 'Run the stereo check first.' : 'Consent for therapy is not active for this patient.'}</p>}
              </>
            )}

            {dock === 'notes' && (
              <>
                <h3 className="monitor__h">Session notes</h3>
                <div className="notes-box">
                  <div className="notes-box__input">
                    <input
                      placeholder="Note…"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitNote()}
                    />
                    <button onClick={submitNote}>Add</button>
                  </div>
                  <ul className="notes-list notes-list--tall">
                    {notes.length === 0 && <li className="b2b-sub">Notes are timestamped — to the audio phase while a protocol plays, to the call clock otherwise. They feed the report.</li>}
                    {[...notes].reverse().map((n, i) => (
                      <li key={i} className="note-line">
                        <span className="note-line__ts">{n.phase ? `P${n.phase} · ` : ''}{mmss(n.at)}</span>
                        <span>{n.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {dock === 'session' && protocol && (
              <>
                <h3 className="monitor__h">Timeline — {protocol.code}</h3>
                <div className="phase-bar"><div className="phase-bar__fill" style={{ width: `${pct}%` }} /></div>
                <ol className="phases">
                  {bounds.map((b, i) => (
                    <li key={b.ph.id} className={`phase${i === curIdx && playing ? ' is-now' : ''}${elapsed >= b.end ? ' is-done' : ''}`}>
                      <span className="phase__num">{b.ph.id}</span>
                      <span className="phase__name">{b.ph.name}</span>
                      <span className="b2b-sub">{mmss(b.start)}</span>
                    </li>
                  ))}
                </ol>

                {preset && (
                  <>
                    <h3 className="monitor__h">Active parameters</h3>
                    <div className="params">
                      <span className="param">Binaural <b>{preset.binaural}</b></span>
                      <span className="param">Breathing <b>{preset.breathing}</b></span>
                      <span className="param">Voice <b>{preset.voice}</b></span>
                      <span className="param">Looper <b>{preset.loop}</b></span>
                    </div>
                  </>
                )}

                <div className="monitor__controls dock__controls">
                  <button className="ctl" disabled={!playing} onClick={togglePause}>{status === 'paused' ? '▶ Resume' : '⏸ Pause'}</button>
                  <button className="ctl ctl--stop" disabled={!playing} onClick={() => stopAudio(false)}>⏹ Stop audio</button>
                  <button className={`ctl ctl--intervene${status === 'intervening' ? ' is-active' : ''}`} disabled={!playing} onClick={intervene}>
                    {status === 'intervening' ? '✓ Resume treatment' : '⚠ INTERVENE'}
                  </button>
                </div>
                {audioDone && <p className="b2b-sub">Audio ended — you're back in conversation. Play another protocol from the library, or end the consultation.</p>}
              </>
            )}
          </div>
        </div>
      </div>

      {confirmEnd && (
        <div className="modal">
          <div className="modal__box">
            <h3>End the consultation?</h3>
            <p className="b2b-sub">
              {playing
                ? 'A protocol is still playing — it will stop. You go to the debrief and report.'
                : 'You go to the debrief and report.'}
            </p>
            <div className="modal__actions">
              <button className="b2b-btn" onClick={() => setConfirmEnd(false)}>Keep going</button>
              <button className="b2b-btn b2b-btn--danger" onClick={endConsultation}>End consultation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
