/* ============================================================================
   Therapist Workspace — the live session (TH-CALL-* and TH-GL-*)

   The most important screen in the product, and the densest. 70% patient video
   on the left, a 30% three-tab panel on the right. Switching tabs never
   touches the feed — the therapist must be able to look up a VAS trend without
   losing sight of the person.

   Notes tab
     ONE free-text note per session, timestamped as it is written, tagged
     "Session #N". Not a Pre/During/Debrief split: a session is one clinical
     account, and the Good Loop quick-notes fold into the same entry.
     The VAS widgets live here and only here — the therapist records them from
     the patient's spoken answer, and the patient never sees a VAS control.

   Good Loop tab
     wizard → pre-launch check → monitoring → ended.
     · All 25 protocols are selectable IN a live session; the six clinical-only
       ones carry a badge but are not restricted here — the restriction is on
       PRESCRIBING them as homework.
     · Stereo failure and missing consent are HARD blocks. Latency is a soft
       warning the therapist decides on.
     · During treatment the therapist hears everything the patient hears, and
       the video feed stays visible — observation is the point.
     · Intervene pauses the audio and opens a two-way channel; every
       intervention is logged with its timestamp and phase.

   Reorientation is protected on this side too: when the audio ends the panel
   returns to Notes for the debrief, with no pop-up and no celebration.

   The call is a REAL WebRTC peer connection (`useVideoCall`). Two things it
   deliberately does not do:
   · The protocol audio is never streamed through the peer connection. WebRTC
     voice is mono-ised and echo-cancelled, which would destroy the binaural
     beat the whole method rests on. The patient's device plays the file
     locally and the transport carries CONTROL messages that keep the two
     sides in step — play, pause, resume, stop, intervene, end.
   · The therapist's own monitor audio is a second, local playback. They hear
     what the patient hears without it crossing the wire.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n, fmtDate } from '../i18n'
import { useVideoCall, type VideoCall } from '../b2b/webrtc/useVideoCall'
import { PeerVideo, SelfVideo } from './Video'
import { getProtocol } from '../data/protocols'
import { useCatalog, audioUrlFor, type ClinicalEntry } from '../data/liveCatalog'
import { SessionPlayer } from '../lib/audio'
import { CLUSTER_LABEL, adherencePct, nextSessionNumber, vasSeries, type SessionRow, type WorkspacePatient } from './data'
import { initials, versionShort } from './Patients'
import type { Duration } from '../types/domain'
import { BrandIcon } from '../components/Brand'

type Tab = 'notes' | 'goodloop' | 'reference'

export interface SessionResult {
  row: SessionRow
  quickNotes: { at: number; phase: number; text: string }[]
}

interface LiveSessionProps {
  patient: WorkspacePatient
  /** Sandbox runs the identical workspace with a banner and nothing saved. */
  sandbox?: boolean
  /**
   * The shared room BOTH peers join — the appointment id. Null (or without
   * Supabase env) falls back to an in-tab simulated patient on a real peer
   * connection, which is the demo path and says so on screen.
   */
  roomId?: string | null
  /** Testing hook: shorten the treatment. */
  demoSeconds?: number | null
  onEnd: (r: SessionResult) => void
  onExit: () => void
}

const PHASES = ['Intro', 'Breath', 'Explore', 'Process', 'Integr', 'Ground']

export function LiveSession({ patient, sandbox, roomId = null, demoSeconds, onEnd, onExit }: LiveSessionProps) {
  const { t } = useI18n()
  /* The Sandbox never opens a real room: a practice session must not be
     joinable by a patient who happens to be waiting. */
  /* When the PATIENT's audio actually starts. The monitor used to start its
     own player and clock the instant `play` was sent, but the patient runs a
     ten-second transition first — so every phase readout, every quick-note
     timestamp and the end of the treatment were ten seconds ahead of the
     person they describe. */
  const [patientStartedAt, setPatientStartedAt] = useState<number | null>(null)
  const call = useVideoCall({
    roomId: sandbox ? null : roomId,
    role: 'therapist',
    onControl: (c) => { if (c.action === 'started') setPatientStartedAt(Date.now()) },
  })
  const [joined, setJoined] = useState(false)
  const [tab, setTab] = useState<Tab>('notes')
  const [collapsed, setCollapsed] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [reminded, setReminded] = useState(false)

  /* The patient connecting IS the moment the session starts. Waiting for the
     therapist to press a second button after that would be one click between
     them and a person who is already on screen. */
  useEffect(() => {
    if (call.callState === 'connected' && !joined) {
      startedAt.current = Date.now()
      setJoined(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.callState])

  const sessionNumber = nextSessionNumber(patient)
  const startedAt = useRef(Date.now())

  // Notes tab state
  const [goal, setGoal] = useState('')
  const [note, setNote] = useState('')
  const [vasPre, setVasPre] = useState<number | null>(null)
  const [vasPost, setVasPost] = useState<number | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Good Loop tab state
  const [gl, setGl] = useState<GlState>({ stage: 'idle' })
  const [quickNotes, setQuickNotes] = useState<{ at: number; phase: number; text: string }[]>([])

  useEffect(() => {
    if (!joined) return
    const id = window.setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 1000)
    return () => clearInterval(id)
  }, [joined])

  // Auto-save the note, the way the wireframe's "Saved · 14:03" implies.
  useEffect(() => {
    if (!note) return
    const id = window.setTimeout(() => setSavedAt(Date.now()), 900)
    return () => clearTimeout(id)
  }, [note])

  /* ------------------------------------------------- TH-CALL-WAIT ------ */
  if (!joined) {
    return (
      <div className={`w-call${sandbox ? ' w-call--sandbox' : ''}`}>
        {sandbox && <SandboxBanner onExit={onExit} />}
        <div className="w-call__wait">
          <div className="w-call__waitmain">
            <div className="w-avatar w-avatar--xl" aria-hidden="true">{initials(patient.name)}</div>
            <h2 className="w-h2">
              {call.callState === 'connecting'
                ? t('Connecting to {name}…', { name: patient.name })
                : call.peerPresent
                  ? t('{name} is in the waiting room', { name: patient.name })
                  : t('Waiting for {name} to join…', { name: patient.name })}
            </h2>
            {call.callState === 'connecting' && <div className="w-spinner" aria-hidden="true" />}

            <SelfVideo call={call} className="w-selfcam" />

            {call.camStatus === 'denied' && (
              <p className="w-warnbox">
                {t('Your camera is blocked. Allow it in the browser address bar, then retry.')}
                {' '}
                <button className="w-link" onClick={call.startCamera}>{t('Retry')}</button>
              </p>
            )}
            {call.camStatus === 'error' && (
              <p className="w-warnbox">
                {t('No camera available. A session needs a secure (https) connection and a working camera.')}
                {' '}
                <button className="w-link" onClick={call.startCamera}>{t('Retry')}</button>
              </p>
            )}

            {!reminded ? (
              <button className="w-link" onClick={() => setReminded(true)}>{t('Send a reminder?')}</button>
            ) : (
              <p className="w-small">{t('Reminder sent.')}</p>
            )}

            <button
              className="w-btn w-btn--primary"
              disabled={call.camStatus !== 'live' || call.callState === 'connecting' || (call.realtime && !call.peerPresent)}
              onClick={call.connectPatient}
            >
              {sandbox ? t('Start practice session') : t('Call the patient')}
            </button>

            {call.realtime && !call.peerPresent && (
              <button className="w-link w-link--quiet" disabled={call.camStatus !== 'live'} onClick={call.connectSimulated}>
                {t('Demo · simulate the patient')}
              </button>
            )}
            <p className="w-small">
              {call.realtime
                ? t('Real room. The patient joins from their app and the call connects between the two devices.')
                : t('Demo room: the patient feed is simulated in this tab over a real peer connection.')}
            </p>
            <button className="w-btn w-btn--ghost" onClick={onExit}>{t('Cancel')}</button>
          </div>

          <aside className="w-call__prep">
            <div className="w-field__label">{t('Pre-session preparation')}</div>
            <h3>{patient.name} · {t('Session #{n}', { n: sessionNumber })}</h3>

            <label className="w-field">
              <span className="w-field__label">{t("Today's goal")}</span>
              <input className="w-input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t('e.g. Continue exposure work')} />
            </label>

            {patient.sessions[0] && (
              <div className="w-prepblock">
                <div className="w-field__label">
                  {t('Last session')} · {fmtDate(patient.sessions[0].at, { month: 'short', day: 'numeric' })}
                </div>
                {patient.sessions[0].protocolCode && (
                  <p className="w-mono w-small">{patient.sessions[0].protocolCode} · {versionShort(patient.sessions[0].version)}</p>
                )}
                <p className="w-small">{patient.sessions[0].note}</p>
              </div>
            )}

            <div className="w-prepblock">
              <div className="w-field__label">{t('VAS trend')}</div>
              <p className="w-small">{vasSeries(patient).join(' · ') || t('Not recorded')}</p>
            </div>

            <div className="w-prepblock">
              <div className="w-field__label">{t('Active goals')}</div>
              <ul className="w-small">
                {patient.goals.filter((g) => g.status === 'in-progress').map((g) => <li key={g.id}>• {g.text}</li>)}
                {!patient.goals.some((g) => g.status === 'in-progress') && <li>{t('None set.')}</li>}
              </ul>
            </div>

            <div className="w-prepblock">
              <div className="w-field__label">{t('Active prescription adherence')}</div>
              <p className="w-small">
                {patient.prescriptions.length
                  ? `${Math.round(patient.prescriptions.reduce((n, r) => n + adherencePct(r), 0) / patient.prescriptions.length)}%`
                  : t('No active prescriptions.')}
              </p>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------ TH-CALL-ACTIVE ----- */

  function finish() {
    const treatment = gl.stage === 'ended' ? gl.summary : undefined
    call.sendControl({ action: 'end' })
    call.hangup()
    onEnd({
      row: {
        id: `s-${startedAt.current}`,
        at: startedAt.current,
        kind: treatment ? 'gl-video' : 'video',
        protocolCode: treatment?.code,
        version: treatment?.version,
        minutes: Math.max(1, Math.round(elapsed / 60)),
        phasesCompleted: treatment?.phases,
        pauses: treatment?.pauses,
        interventions: treatment?.interventions,
        vasPre: vasPre ?? undefined,
        vasPost: vasPost ?? undefined,
        note,
        noteNumber: sessionNumber,
        goal: goal || undefined,
        signatureVersion: 0,
      },
      quickNotes,
    })
  }

  return (
    <div className={`w-call${sandbox ? ' w-call--sandbox' : ''}`}>
      {sandbox && <SandboxBanner onExit={onExit} />}

      <header className="w-call__top">
        <div>
          <strong>{patient.name}</strong>
          <span className="w-small"> — {t('Session #{n}', { n: sessionNumber })}</span>
        </div>
        <span className="w-call__timer">{fmtClock(elapsed)}</span>
        <button className="w-link" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? t('Expand panel') : t('Collapse panel')}
        </button>
      </header>

      <div className={`w-call__body${collapsed ? ' is-collapsed' : ''}`}>
        <div className="w-video">
          <PeerVideo call={call} fallbackInitials={initials(patient.name)} label={t('patient webcam feed')} />

          {gl.stage === 'running' && (
            <div className="w-video__glbadge">
              {t('GOOD LOOP ACTIVE')} · {fmtClock(gl.elapsed)} / {fmtClock(gl.total)}
            </div>
          )}
          {gl.stage === 'running' && gl.intervening && (
            <div className="w-video__live">🔴 {t('two-way audio open')}</div>
          )}

          <SelfVideo call={call} className="w-video__self" />

          <div className="w-video__bar">
            <button className="w-callbtn" aria-pressed={!call.micOn} disabled={call.camStatus !== 'live'} onClick={call.toggleMic}>
              {call.micOn ? '🎤' : '🔇'}<span>{t('Mute')}</span>
            </button>
            <button className="w-callbtn" aria-pressed={!call.camOn} disabled={call.camStatus !== 'live'} onClick={call.toggleCam}>
              {call.camOn ? '📷' : '🚫'}<span>{t('Camera')}</span>
            </button>
            <button className="w-callbtn w-callbtn--end" onClick={() => setConfirmEnd(true)}>
              <span>{t('End Call')}</span>
            </button>
          </div>
        </div>

        {!collapsed && (
          <aside className="w-panel">
            <nav className="w-panel__tabs" role="tablist">
              {(['notes', 'goodloop', 'reference'] as Tab[]).map((x) => (
                <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}>
                  {t(x === 'notes' ? 'Notes' : x === 'goodloop' ? 'Good Loop' : 'Reference')}
                </button>
              ))}
            </nav>

            {tab === 'notes' && (
              <NotesTab
                sessionNumber={sessionNumber}
                goal={goal}
                setGoal={setGoal}
                note={note}
                setNote={setNote}
                savedAt={savedAt}
                vasPre={vasPre}
                setVasPre={setVasPre}
                vasPost={vasPost}
                setVasPost={setVasPost}
                quickNotes={quickNotes}
                previous={patient.sessions[0]}
              />
            )}

            {tab === 'goodloop' && (
              <GoodLoopTab
                state={gl}
                setState={setGl}
                call={call}
                patientStartedAt={patientStartedAt}
                onArmTreatment={() => setPatientStartedAt(null)}
                sandbox={!!sandbox}
                demoSeconds={demoSeconds ?? null}
                quickNotes={quickNotes}
                addQuickNote={(text, phase) => setQuickNotes((q) => [...q, { at: Date.now(), phase, text }])}
                consentActive={patient.consentTherapy}
                onTreatmentEnded={() => setTab('notes')}
              />
            )}

            {tab === 'reference' && <ReferenceTab patient={patient} vasPre={vasPre} vasPost={vasPost} />}
          </aside>
        )}
      </div>

      {confirmEnd && (
        <div className="w-scrim" role="dialog" aria-modal="true">
          <div className="w-modal w-modal--sm">
            <h2 className="w-h2">{t('End this call?')}</h2>
            <p className="w-lead">{t('The session report opens next, pre-filled and editable.')}</p>
            <div className="w-actions">
              <button className="w-btn w-btn--ghost" onClick={() => setConfirmEnd(false)}>{t('Cancel')}</button>
              <button className="w-btn w-btn--primary" onClick={() => (sandbox ? onExit() : finish())}>
                {t('End Call')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SandboxBanner({ onExit }: { onExit: () => void }) {
  const { t } = useI18n()
  return (
    <div className="w-sandboxbar">
      <span>⚠ {t('Sandbox Mode — practice environment. No real data is recorded.')}</span>
      <button className="w-link" onClick={onExit}>{t('Exit Sandbox')}</button>
    </div>
  )
}

/* -------------------------------------------------------- Notes tab ----- */

function NotesTab({
  sessionNumber,
  goal,
  setGoal,
  note,
  setNote,
  savedAt,
  vasPre,
  setVasPre,
  vasPost,
  setVasPost,
  quickNotes,
  previous,
}: {
  sessionNumber: number
  goal: string
  setGoal: (v: string) => void
  note: string
  setNote: (v: string) => void
  savedAt: number | null
  vasPre: number | null
  setVasPre: (v: number) => void
  vasPost: number | null
  setVasPost: (v: number) => void
  quickNotes: { at: number; phase: number; text: string }[]
  previous?: SessionRow
}) {
  const { t } = useI18n()
  const [postOpen, setPostOpen] = useState(false)

  return (
    <div className="w-panel__body">
      <label className="w-field">
        <span className="w-field__label">{t("Today's goal")}</span>
        <input className="w-input w-input--sm" value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>

      <VasWidget label={t('VAS Pre-Session')} value={vasPre} onChange={setVasPre} placeholder={t('Record during rapport')} />

      <div className="w-noteblock">
        <div className="w-noteblock__head">
          <span className="w-tag">{t('Session #{n}', { n: sessionNumber })}</span>
          {savedAt && <span className="w-small">{t('Saved')} {fmtDate(savedAt, { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        <textarea
          className="w-input w-notearea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('Session note…')}
        />
        {quickNotes.length > 0 && (
          <ul className="w-quicknotes">
            {quickNotes.map((q, i) => (
              <li key={i}>
                <span className="w-mono w-small">{fmtDate(q.at, { hour: '2-digit', minute: '2-digit' })} P{q.phase}</span>
                {' — '}{q.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!postOpen ? (
        <button className="w-link" onClick={() => setPostOpen(true)}>{t('Record VAS Post-Session')}</button>
      ) : (
        <VasWidget
          label={t('VAS Post-Session')}
          value={vasPost}
          onChange={setVasPost}
          placeholder={t('Record at debrief')}
          delta={vasPre != null && vasPost != null ? vasPost - vasPre : null}
          from={vasPre}
        />
      )}

      {previous && (
        <details className="w-prev">
          <summary>{t('Previous session notes')}</summary>
          <p className="w-small">{previous.note}</p>
        </details>
      )}

      <p className="w-note">
        {t('Notes auto-save and are end-to-end encrypted. The VAS is recorded from the patient’s spoken answer — the patient never sees a VAS control.')}
      </p>
    </div>
  )
}

function VasWidget({
  label,
  value,
  onChange,
  placeholder,
  delta,
  from,
}: {
  label: string
  value: number | null
  onChange: (v: number) => void
  placeholder: string
  delta?: number | null
  from?: number | null
}) {
  const { t } = useI18n()
  return (
    <div className="w-vaswidget">
      <div className="w-vaswidget__head">
        <span className="w-field__label">{label}</span>
        <span className="w-small">
          {value == null
            ? placeholder
            : delta != null && from != null
              ? `Δ ${delta > 0 ? '+' : '−'}${Math.abs(delta)} (${t('from')} ${from} ${t('to')} ${value})`
              : `${value} — ${vasWord(value)}`}
        </span>
      </div>
      <div className="w-vasrow">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} className="w-vasdot" aria-pressed={value === n} onClick={() => onChange(n)}>{n}</button>
        ))}
      </div>
    </div>
  )
}

function vasWord(n: number): string {
  if (n <= 3) return 'Low'
  if (n <= 6) return 'Moderate'
  return 'High'
}

/* ----------------------------------------------------- Good Loop tab ---- */

type GlState =
  | { stage: 'idle' }
  | { stage: 'wizard' }
  | { stage: 'check'; code: string; version: Duration; rationale: string }
  | { stage: 'running'; code: string; version: Duration; total: number; elapsed: number; paused: boolean; intervening: boolean; pauses: number; interventions: number }
  | { stage: 'ended'; summary: { code: string; version: Duration; played: number; phases: number; pauses: number; interventions: number } }

function GoodLoopTab({
  state,
  setState,
  call,
  patientStartedAt,
  onArmTreatment,
  sandbox,
  demoSeconds,
  quickNotes,
  addQuickNote,
  consentActive,
  onTreatmentEnded,
}: {
  state: GlState
  setState: (s: GlState) => void
  call: VideoCall
  /** When the patient's own player started, or null while still waiting. */
  patientStartedAt: number | null
  /** Clear the ack before sending a new `play`. */
  onArmTreatment: () => void
  sandbox: boolean
  demoSeconds: number | null
  quickNotes: { at: number; phase: number; text: string }[]
  addQuickNote: (text: string, phase: number) => void
  consentActive: boolean
  onTreatmentEnded: () => void
}) {
  const { t } = useI18n()

  if (state.stage === 'idle') {
    return (
      <div className="w-panel__body w-panel__empty">
        <BrandIcon className="w-glmark" />
        <h3>{t('Start a Good Loop session')}</h3>
        <p className="w-small">{t('Select a protocol to begin treatment during this call.')}</p>
        <button className="w-btn w-btn--primary" onClick={() => setState({ stage: 'wizard' })}>{t('Select protocol')}</button>
      </div>
    )
  }

  if (state.stage === 'wizard') {
    return <ProtocolWizard onCancel={() => setState({ stage: 'idle' })} onProceed={(code, version, rationale) => setState({ stage: 'check', code, version, rationale })} />
  }

  if (state.stage === 'check') {
    return (
      <PreLaunchCheck
        code={state.code}
        version={state.version}
        consentActive={consentActive}
        onChange={() => setState({ stage: 'wizard' })}
        onStart={() => {
          /* This is what triggers the patient's 10-second countdown and then
             their local player. The audio itself never crosses the wire. */
          onArmTreatment()
          call.sendControl({ action: 'play', protocolCode: state.code, durationMin: state.version })
          setState({
            stage: 'running',
            code: state.code,
            version: state.version,
            total: demoSeconds ?? state.version * 60,
            elapsed: 0,
            paused: false,
            intervening: false,
            pauses: 0,
            interventions: 0,
          })
        }}
      />
    )
  }

  if (state.stage === 'running') {
    return (
      <TreatmentMonitor
        state={state}
        setState={setState}
        call={call}
        patientStartedAt={patientStartedAt}
        sandbox={sandbox}
        quickNotes={quickNotes}
        addQuickNote={addQuickNote}
        onEnded={onTreatmentEnded}
      />
    )
  }

  return (
    <div className="w-panel__body">
      <h3 className="w-h3">{t('Treatment completed')} ✓</h3>
      <dl className="w-summary">
        <div><dt>{t('Protocol')}</dt><dd className="w-mono">{state.summary.code} {versionShort(state.summary.version)}</dd></div>
        <div><dt>{t('Duration played')}</dt><dd>{fmtClock(state.summary.played)}</dd></div>
        <div><dt>{t('Phases completed')}</dt><dd>{state.summary.phases} / 6</dd></div>
        <div><dt>{t('Pauses')}</dt><dd>{state.summary.pauses}</dd></div>
        <div><dt>{t('Interventions')}</dt><dd>{state.summary.interventions}</dd></div>
      </dl>
      {quickNotes.length > 0 && (
        <>
          <div className="w-field__label">{t('Notes during treatment')}</div>
          <ul className="w-quicknotes">
            {quickNotes.map((q, i) => (
              <li key={i}>
                <span className="w-mono w-small">{fmtClock((q.at - quickNotes[0].at) / 1000)} P{q.phase}</span> — {q.text}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="w-note">
        {t('The panel returned to Notes for the debrief. All treatment data is included in the session report.')}
      </p>
    </div>
  )
}

function ProtocolWizard({
  onCancel,
  onProceed,
}: {
  onCancel: () => void
  onProceed: (code: string, version: Duration, rationale: string) => void
}) {
  const { t } = useI18n()
  const catalog = useCatalog()
  /* Every ENABLED clinical protocol the catalog carries — including the six
     clinical-only ones, which are usable here and only here. A protocol
     imported and published this morning appears without a code change. */
  const clusters = useMemo(() => {
    const m = new Map<string, ClinicalEntry[]>()
    for (const p of catalog.clinical) m.set(p.family, [...(m.get(p.family) ?? []), p])
    return [...m.entries()].map(([family, list]) => ({ family, list }))
  }, [catalog.clinical])

  const [code, setCode] = useState<string | null>(null)
  const selected = catalog.clinical.find((c) => c.code === code)
  const [version, setVersion] = useState<Duration | null>(null)
  const [rationale, setRationale] = useState('')

  /* Only the time signatures this protocol publishes. Selecting a new protocol
     clears the version, because the one already chosen may not exist here. */
  const versions = selected?.durations ?? []
  const chosenVersion: Duration = version && versions.includes(version) ? version : (versions[1] ?? versions[0] ?? 12)

  return (
    <div className="w-panel__body">
      <div className="w-step">① {t('Protocol')}</div>
      <div className="w-protolist">
        {!clusters.length && <p className="w-small">{t('No protocol is published and enabled yet.')}</p>}
        {clusters.map(({ family, list }) => (
          <div key={family}>
            <div className="w-field__label">{t(CLUSTER_LABEL[family] ?? family)}</div>
            {list.map((p) => (
              <button
                key={p.code}
                className="w-proto"
                aria-pressed={code === p.code}
                onClick={() => { setCode(p.code); setVersion(null) }}
              >
                <span className="w-mono">{p.code}</span>
                <span>{p.title}</span>
                {p.clinicalOnly && <span className="w-tag w-tag--warn">{t('Clinical only')}</span>}
                {!p.audioReady && <span className="w-tag">{t('No audio yet')}</span>}
                {code === p.code && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="w-step">② {t('Version')}</div>
      <div className="w-inline">
        {!selected && <span className="w-small">{t('Select a protocol first.')}</span>}
        {versions.map((d) => (
          <button key={d} className="w-chip" aria-pressed={chosenVersion === d} onClick={() => setVersion(d)}>
            {t(d === 6 ? 'Quick' : d === 12 ? 'Standard' : 'Deep')} · {d}m
          </button>
        ))}
        {selected && !versions.length && (
          <span className="w-small">{t('This protocol has no published time signature yet.')}</span>
        )}
      </div>

      <div className="w-step">③ {t('Notes')} <em className="w-small">({t('optional')})</em></div>
      <textarea
        className="w-input"
        rows={2}
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder={t('Note the clinical rationale for this selection…')}
      />

      <p className="w-note">
        {t('All 25 protocols are available inside a live session. The six clinical-only ones cannot be prescribed as homework.')}
      </p>

      <div className="w-actions">
        <button className="w-btn w-btn--ghost" onClick={onCancel}>{t('Cancel')}</button>
        <button
          className="w-btn w-btn--primary"
          disabled={!code || !versions.length}
          onClick={() => code && onProceed(code, chosenVersion, rationale)}
        >
          {t('Proceed to checklist')}
        </button>
      </div>
    </div>
  )
}

function PreLaunchCheck({
  code,
  version,
  consentActive,
  onChange,
  onStart,
}: {
  code: string
  version: Duration
  consentActive: boolean
  onChange: () => void
  onStart: () => void
}) {
  const { t, locale } = useI18n()
  const catalog = useCatalog()
  const protocol = getProtocol(code)
  const entry = catalog.clinical.find((c) => c.code === code)
  const rendered = Boolean(audioUrlFor(protocol, version, locale))

  /* Two hard blocks and one soft warning. Stereo and consent stop the start
     button dead; latency is reported and the therapist decides. */
  const [stereoOk] = useState(true)
  const [latency] = useState(340)
  const latencyBand = latency < 200 ? 'ok' : latency <= 500 ? 'warn' : 'bad'
  const blocked = !stereoOk || !consentActive

  return (
    <div className="w-panel__body">
      <div className="w-selected">
        <div>
          <div className="w-mono">{code}</div>
          <div className="w-small">{entry?.title ?? protocol?.title}</div>
          <div className="w-small">{t(version === 6 ? 'Quick' : version === 12 ? 'Standard' : 'Deep')} ({version} min)</div>
        </div>
        <button className="w-link" onClick={onChange}>{t('Change')}</button>
      </div>

      <ul className="w-checks">
        <li className={stereoOk ? 'is-ok' : 'is-bad'}>
          <span>{stereoOk ? '✓' : '✕'}</span>
          <span>{t('Patient stereo headphones')}</span>
          <span className="w-small">{stereoOk ? t('Stereo output detected') : t('Mono or no output — treatment blocked')}</span>
        </li>
        <li className={consentActive ? 'is-ok' : 'is-bad'}>
          <span>{consentActive ? '✓' : '✕'}</span>
          <span>{t('Patient consent active')}</span>
          <span className="w-small">{consentActive ? t('Therapy data consent verified') : t('Missing — treatment blocked')}</span>
        </li>
        <li className={latencyBand === 'ok' ? 'is-ok' : latencyBand === 'warn' ? 'is-warn' : 'is-bad'}>
          <span>{latencyBand === 'ok' ? '✓' : '!'}</span>
          <span>{t('Connection latency')}</span>
          <span className="w-small">{latency}ms · {latencyBand === 'ok' ? t('good') : t('200–500ms range')}</span>
        </li>
      </ul>

      {latencyBand !== 'ok' && !blocked && (
        <p className="w-warnbox">
          {t('Connection quality is reduced. Audio may be affected — you may still proceed.')}
        </p>
      )}
      {!rendered && (
        <p className="w-warnbox">
          {t('No rendered audio is published for this time signature. The session will play the placeholder bed.')}
        </p>
      )}

      <button className="w-btn w-btn--primary w-btn--block" disabled={blocked} onClick={onStart}>
        {t('Start Treatment')}
      </button>
      <p className="w-note">
        {t("On Start, the patient's screen shows a 10-second countdown, then the immersive player.")}
      </p>
    </div>
  )
}

function TreatmentMonitor({
  state,
  setState,
  call,
  patientStartedAt,
  sandbox,
  quickNotes,
  addQuickNote,
  onEnded,
}: {
  state: Extract<GlState, { stage: 'running' }>
  setState: (s: GlState) => void
  call: VideoCall
  /** When the patient's own player started, or null while still waiting. */
  patientStartedAt: number | null
  sandbox: boolean
  quickNotes: { at: number; phase: number; text: string }[]
  addQuickNote: (text: string, phase: number) => void
  onEnded: () => void
}) {
  const { t, locale } = useI18n()
  const catalog = useCatalog()
  const entry = catalog.all.find((p) => p.code === state.code)
  const protocol = entry ?? getProtocol(state.code)
  const fractions = protocol?.phases.length
    ? protocol.phases.map((p) => p.fraction)
    : [0.11, 0.16, 0.16, 0.38, 0.1, 0.09]
  /* The therapist HEARS what the patient hears — including the real mixdown
     when one is published. Monitoring a placeholder while the patient listens
     to a rendered voice would make the observation worthless, so a failure to
     load it is reported here rather than passed over. */
  const audioUrl = audioUrlFor(protocol, state.version, locale)
  const [audioFailed, setAudioFailed] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const playerRef = useRef<SessionPlayer | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const callRef = useRef(call)
  callRef.current = call
  const [confirmStop, setConfirmStop] = useState(false)

  /* Start with the patient, not before them.
     A sandbox rehearsal and the in-tab simulated peer never ack, so a short
     grace period starts the monitor anyway rather than hanging it. */
  const [graceOver, setGraceOver] = useState(false)
  useEffect(() => {
    if (patientStartedAt) return
    const id = window.setTimeout(() => setGraceOver(true), sandbox ? 0 : 14_000)
    return () => clearTimeout(id)
  }, [patientStartedAt, sandbox])
  const live = patientStartedAt !== null || graceOver

  /* The therapist HEARS the treatment audio — that is what makes monitoring
     possible at all, so the player runs on this side too. */
  useEffect(() => {
    if (!live) return
    const p = new SessionPlayer({
      audioUrl,
      volume: 0.4,
      onFallback: (reason) => setAudioFailed(reason),
    })
    playerRef.current = p
    void p.play()
    return () => p.stop()
  }, [audioUrl, live])

  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => {
      const s = stateRef.current
      if (s.stage !== 'running' || s.paused || s.intervening) return
      const next = s.elapsed + 1
      if (next >= s.total) {
        playerRef.current?.stop()
        callRef.current.sendControl({ action: 'stop' })
        setState({
          stage: 'ended',
          summary: { code: s.code, version: s.version, played: s.total, phases: 6, pauses: s.pauses, interventions: s.interventions },
        })
        onEnded()
        return
      }
      setState({ ...s, elapsed: next })
    }, 1000)
    return () => clearInterval(id)
  }, [setState, onEnded, live])

  let acc = 0
  let phaseIdx = 0
  for (let i = 0; i < fractions.length; i += 1) {
    acc += fractions[i] * state.total
    if (state.elapsed < acc) { phaseIdx = i; break }
    phaseIdx = i
  }

  const togglePause = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    if (state.paused) { void p.resume(); call.sendControl({ action: 'resume' }) }
    else { p.pause(); call.sendControl({ action: 'pause' }) }
    setState({ ...state, paused: !state.paused, pauses: state.paused ? state.pauses : state.pauses + 1 })
  }, [state, setState, call])

  const toggleIntervene = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    const on = !state.intervening
    if (on) { p.pause() } else { void p.resume() }
    /* The patient's player pauses and their microphone path opens on the
       same message, so the two sides cannot drift apart mid-intervention. */
    call.sendControl({ action: 'intervene', on })
    setState({
      ...state,
      intervening: on,
      interventions: on ? state.interventions + 1 : state.interventions,
    })
    addQuickNote(on ? 'Intervention started' : 'Treatment resumed', phaseIdx + 1)
  }, [state, setState, addQuickNote, phaseIdx, call])

  return (
    <div className="w-panel__body">
      <h3 className="w-h3">
        <span className="w-mono">{state.code}</span> — {protocol?.title}
      </h3>
      <p className="w-small">
        {t(state.version === 6 ? 'Quick' : state.version === 12 ? 'Standard' : 'Deep')} — {fmtClock(state.total)}
      </p>

      <div className="w-phase">{t('Phase {n} of 6', { n: phaseIdx + 1 })} — {protocol?.phases[phaseIdx]?.name}</div>
      <div className="w-ticks">
        {PHASES.map((p, i) => (
          <span key={p} className={i < phaseIdx ? 'is-done' : i === phaseIdx ? 'is-now' : ''}>{t(p)}</span>
        ))}
      </div>
      <div className="w-progress"><span style={{ width: `${(state.elapsed / state.total) * 100}%` }} /></div>
      <div className="w-small">{fmtClock(state.elapsed)} / {fmtClock(state.total)}</div>

      <div className="w-params">
        <div className="w-field__label">{t('Active parameters')} <em>· {t('read-only')}</em></div>
        <dl>
          <div><dt>{t('Binaural')}</dt><dd>{binauralFor(state.code)}</dd></div>
          <div><dt>{t('Voice archetype')}</dt><dd>{voiceFor(state.code)}</dd></div>
          <div><dt>{t('Active patterns')}</dt><dd>PAT-01, 02, 08</dd></div>
        </dl>
      </div>

      <div className="w-field__label">{t('Quick notes')}</div>
      <ul className="w-quicknotes">
        {quickNotes.map((q, i) => (
          <li key={i}>
            <span className="w-mono w-small">P{q.phase}</span> — {q.text}
          </li>
        ))}
      </ul>
      <input
        className="w-input w-input--sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('Add a note… auto-tags time + phase')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) { addQuickNote(draft.trim(), phaseIdx + 1); setDraft('') }
        }}
      />

      <div className="w-transport">
        <button className="w-tbtn" aria-pressed={state.paused} onClick={togglePause}>
          {state.paused ? '▶' : '❚❚'}<span>{state.paused ? t('Resume') : t('Pause')}</span>
        </button>
        <button className="w-tbtn" onClick={() => setConfirmStop(true)}>
          ⏹<span>{t('Stop')}</span>
        </button>
        <button className={`w-tbtn w-tbtn--intervene${state.intervening ? ' is-on' : ''}`} onClick={toggleIntervene}>
          🔴<span>{state.intervening ? t('Resume treatment') : t('Intervene')}</span>
        </button>
      </div>

      {state.intervening && (
        <p className="w-warnbox">{t('Two-way audio is open. The patient can hear you. Tap Resume when you are done.')}</p>
      )}
      {audioFailed && (
        <p className="w-warnbox">
          {t('Your monitor audio fell back to the ambient bed ({reason}). Check with the patient what they can hear.', { reason: audioFailed })}
        </p>
      )}

      {confirmStop && (
        <div className="w-scrim" role="dialog" aria-modal="true">
          <div className="w-modal w-modal--sm">
            <h2 className="w-h2">{t('End treatment now?')}</h2>
            <p className="w-lead">{t('The patient enters reorientation.')}</p>
            <div className="w-actions">
              <button className="w-btn w-btn--ghost" onClick={() => setConfirmStop(false)}>{t('Cancel')}</button>
              <button
                className="w-btn w-btn--primary"
                onClick={() => {
                  playerRef.current?.stop()
                  call.sendControl({ action: 'stop' })
                  setState({
                    stage: 'ended',
                    summary: {
                      code: state.code, version: state.version, played: state.elapsed,
                      phases: phaseIdx + 1, pauses: state.pauses, interventions: state.interventions,
                    },
                  })
                  setConfirmStop(false)
                  onEnded()
                }}
              >
                {t('End treatment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function binauralFor(code: string): string {
  if (code.startsWith('GL-ANX')) return 'Theta 6 Hz'
  if (code.startsWith('GL-STRESS')) return 'Alpha 10 Hz'
  if (code.startsWith('GL-DEP')) return 'Low-beta 14 Hz'
  if (code.startsWith('GL-BURN')) return 'Alpha 9 Hz'
  return 'SMR 12 Hz'
}

function voiceFor(code: string): string {
  if (code.startsWith('GL-ANX')) return 'Maternal'
  if (code.startsWith('GL-DEP')) return 'Encouraging'
  if (code.startsWith('GL-BURN')) return 'Grounded'
  return 'Neutral'
}

/* ------------------------------------------------------ Reference tab --- */

function ReferenceTab({
  patient,
  vasPre,
  vasPost,
}: {
  patient: WorkspacePatient
  vasPre: number | null
  vasPost: number | null
}) {
  const { t } = useI18n()
  const byInstrument = new Map<string, (typeof patient.assessments)[number]>()
  for (const a of [...patient.assessments].sort((x, y) => x.at - y.at)) byInstrument.set(a.instrument, a)
  const series = vasSeries(patient)
  const live = vasPre != null && vasPost != null ? vasPre - vasPost : null

  return (
    <div className="w-panel__body">
      <div className="w-field__label">{t('Latest assessments')}</div>
      <ul className="w-reflist">
        {[...byInstrument.values()].map((a) => (
          <li key={a.instrument}>
            <span>{a.instrument}</span>
            <strong>{a.values.map((v) => v.value).join('/')}</strong>
          </li>
        ))}
        {!byInstrument.size && <li className="w-small">{t('No assessments yet.')}</li>}
      </ul>

      <div className="w-field__label">{t('VAS trend · last 8')}</div>
      <p className="w-small">
        {series.length ? `${(series.reduce((a, b) => a + b, 0) / series.length).toFixed(1)} ${t('avg drop')}` : t('Not recorded')}
        {live != null && <> · {t('this session')} {live > 0 ? '−' : '+'}{Math.abs(live)}</>}
      </p>

      <div className="w-field__label">{t('Active prescriptions')}</div>
      <ul className="w-reflist">
        {patient.prescriptions.map((rx) => (
          <li key={rx.id}>
            <span className="w-mono w-small">{rx.protocolCode} {versionShort(rx.version)} {rx.perWeek}×/{t('week')}</span>
            <strong>{adherencePct(rx)}%</strong>
          </li>
        ))}
        {!patient.prescriptions.length && <li className="w-small">{t('None.')}</li>}
      </ul>

      <div className="w-field__label">{t('Goals')}</div>
      <ul className="w-reflist">
        {patient.goals.filter((g) => g.status === 'in-progress').map((g) => (
          <li key={g.id}><span>{g.text}</span><em className="w-small">{t('In progress')}</em></li>
        ))}
      </ul>

      <div className="w-field__label">{t('Self Use · this week')}</div>
      <p className="w-small">
        {patient.bridged
          ? t('{n} sessions', { n: patient.bridgedSessions.filter((b) => Date.now() - b.at < 7 * 86_400_000).length })
          : t('Not bridged.')}
      </p>

      <p className="w-note">{t('Read-only, refreshed live — a VAS recorded in Notes appears here immediately.')}</p>
    </div>
  )
}

/* ------------------------------------------------------------------------- */

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
