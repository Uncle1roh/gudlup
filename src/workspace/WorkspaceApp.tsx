/* ============================================================================
   Therapist Workspace — shell (TH-SHELL)

   Fixed 220px sidebar plus a top bar. Three sidebar groups, and the grouping
   is by CADENCE rather than by feature: Daily (patients, calendar, messages),
   Weekly (prescriptions, reports), Utility (performance, sandbox, settings).
   A therapist opens the first group every working day and the last one rarely,
   so ordering by frequency is what keeps the daily path short.

   Badges follow the same logic: a red dot where something is waiting on a
   decision (booking requests, a patient whose adherence has fallen into the
   red), a number where something is countable (unread messages).

   Below 1024px the workspace tells the user to switch to a desktop. That is a
   deliberate refusal rather than a missing responsive pass: this surface holds
   a live video feed, a three-tab clinical panel and treatment transport at the
   same time, and a phone-sized version of it would be unsafe to run a session
   from.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth, SignOutButton } from '../auth/auth'
import { useI18n, fmtDate } from '../i18n'
import { useMessages, unreadFor } from '../data/messageStore'
import { useDataProvider } from '../data/provider'
import { LiveCatalogProvider } from '../data/liveCatalog'
import { mergeServerPatients } from './data'
import type { Therapist } from '../b2b/data'
import { isUpcoming, type Appointment } from '../data/scheduling'
import { TherapistOnboarding } from './Onboarding'
import { Roster, PatientCard, initials } from './Patients'
import { Calendar, AvailabilityModal } from './Calendar'
import { LiveSession, type SessionResult } from './LiveSession'
import { SessionReport } from './Report'
import { Messages, Prescriptions, ReportsArchive, Performance, WorkspaceSettings } from './Tools'
import {
  demoWorkspace,
  lowAdherencePatients,
  unreadCount,
  threadIdFor,
  useWorkspace,
  type SessionRow,
  type WorkspacePatient,
} from './data'

type Nav = 'patients' | 'calendar' | 'messages' | 'prescriptions' | 'reports' | 'performance' | 'sandbox' | 'settings'

const GROUPS: { title: string; items: { id: Nav; icon: string; label: string }[] }[] = [
  {
    title: 'Daily',
    items: [
      { id: 'patients', icon: '👥', label: 'Patients' },
      { id: 'calendar', icon: '📅', label: 'Calendar' },
      { id: 'messages', icon: '✉️', label: 'Messages' },
    ],
  },
  {
    title: 'Weekly',
    items: [
      { id: 'prescriptions', icon: '📋', label: 'Prescriptions' },
      { id: 'reports', icon: '📄', label: 'Reports' },
    ],
  },
  {
    title: 'Utility',
    items: [
      { id: 'performance', icon: '📈', label: 'Performance' },
      { id: 'sandbox', icon: '▶️', label: 'Sandbox' },
      { id: 'settings', icon: '⚙️', label: 'Settings' },
    ],
  },
]

type View =
  | { kind: 'nav' }
  | { kind: 'patient'; id: string }
  | { kind: 'call'; id: string; sandbox?: boolean }
  | { kind: 'report'; patientId: string; row: SessionRow; quickNotes?: SessionResult['quickNotes'] }

interface WorkspaceAppProps {
  demoSeconds?: number | null
}

/** A stand-in patient for the Sandbox. Nothing about it is ever persisted. */
function virtualPatient(): WorkspacePatient {
  const now = Date.now()
  return {
    id: 'sandbox', name: 'Virtual Patient', memberSince: now, status: 'active', linkedAt: now,
    sessions: [], assessments: [], notes: [], goals: [], prescriptions: [],
    bridged: false, bridgedSessions: [], messages: [], consentTherapy: true,
  }
}

/** One resolved catalog for the whole workspace: the protocol wizard, the
    prescription modal and the treatment player must agree about which
    protocols exist and which time signatures they publish. */
export function WorkspaceApp(props: WorkspaceAppProps) {
  return (
    <LiveCatalogProvider>
      <WorkspaceGate {...props} />
    </LiveCatalogProvider>
  )
}

/**
 * Who may be in here, decided before the workspace exists.
 *
 * Its own component on purpose. The decision is asynchronous — it is a row on
 * the server — and a gate written as an early return inside the workspace
 * would change how many hooks that render called, which React refuses. Here,
 * the workspace below is simply not mounted until the answer is yes.
 */
function WorkspaceGate({ demoSeconds = null }: WorkspaceAppProps) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const { state, update } = useWorkspace()
  const [sandboxOnEntry, setSandboxOnEntry] = useState(false)

  /* ---- may this account see patients? ------------------------------------

     The workspace used to ask its own local store, which held a `verification`
     field this browser wrote — with a button next to it that set the field to
     'approved'. The answer now comes from the `therapists` row, where only a
     reviewer can put it, and it is re-read every time the workspace opens.

     While it is unknown the workspace does not render. Failing OPEN here would
     mean an unreachable server hands out the roster, which is the one outcome
     this check exists to prevent. */
  const [cred, setCred] = useState<Therapist | null>(null)
  const [credErr, setCredErr] = useState<string | null>(null)
  const loadCred = useCallback(() => {
    setCredErr(null)
    void dp.getTherapist()
      .then(setCred)
      .catch((e: Error) => { setCred(null); setCredErr(e.message) })
  }, [dp])
  useEffect(loadCred, [loadCred])

  if (!cred) {
    return (
      <div className="w-auth">
        <div className="w-auth__card w-auth__card--center">
          <div className="w-hourglass" aria-hidden="true">⏳</div>
          <h1 className="w-h1">{credErr ? t('We could not check your credentials') : t('One moment')}</h1>
          <p className="w-lead">
            {credErr
              ? t('The workspace stays closed until your registration can be confirmed. Try again in a moment.')
              : t('Confirming your registration…')}
          </p>
          {credErr && <button className="w-btn w-btn--primary w-btn--block" onClick={loadCred}>{t('Try again')}</button>}
        </div>
      </div>
    )
  }

  const onboarded = cred.status === 'approved' && state.account.termsSignedAt

  if (!onboarded) {
    return (
      <TherapistOnboarding
        account={state.account}
        cred={cred}
        onCredChanged={loadCred}
        onSubmit={(patch) => update((s) => ({ ...s, account: { ...s.account, ...patch } }))}
        onSign={() => update((s) => ({ ...s, account: { ...s.account, termsSignedAt: Date.now() } }))}
        onFinish={(sandbox) => {
          update((s) => ({
            ...s,
            account: { ...s.account, sandboxSeenAt: Date.now() },
            // A brand-new therapist has an empty roster; a demo build seeds one
            // so every downstream screen is reachable.
            patients: s.patients.length ? s.patients : demoWorkspace().patients,
          }))
          // the workspace does not exist yet; it opens on the sandbox instead
          if (sandbox) setSandboxOnEntry(true)
        }}
      />
    )
  }
  return <WorkspaceSurface demoSeconds={demoSeconds} sandboxOnEntry={sandboxOnEntry} />
}

function WorkspaceSurface({ demoSeconds = null, sandboxOnEntry }: WorkspaceAppProps & { sandboxOnEntry?: boolean }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const dp = useDataProvider()
  const { state, update } = useWorkspace()
  const [nav, setNav] = useState<Nav>(sandboxOnEntry ? 'sandbox' : 'patients')
  const [view, setView] = useState<View>(sandboxOnEntry ? { kind: 'call', id: 'sandbox', sandbox: true } : { kind: 'nav' })
  const [menu, setMenu] = useState(false)
  const [availOpen, setAvailOpen] = useState(false)
  const [messagePatient, setMessagePatient] = useState<string | undefined>(undefined)

  /* The badge has to count the live thread as well as the seeded fixtures, or
     a message a patient sent from their own app raises no flag anywhere. */
  const { rows: messageRows } = useMessages()
  const unread =
    unreadCount(state) +
    state.patients.reduce((n, p) => n + unreadFor(messageRows, threadIdFor(p), 'therapist'), 0)
  const lowAdherence = lowAdherencePatients(state)

  /* The appointment id is the ROOM both devices join. The patient books
     through the data layer and the therapist reads the same record, so
     neither side has to be handed a room id by hand.

     The workspace roster and the scheduling roster are two different lists
     in this build, so they are matched by name — the only key they share.
     No match means no shared room, and the call falls back to the in-tab
     simulated peer, which the waiting room states plainly rather than
     pretending to be a real session. */
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const loadAppointments = useCallback(() => {
    void dp.listMyAppointments().then(setAppointments).catch(() => setAppointments([]))
  }, [dp])
  useEffect(loadAppointments, [loadAppointments])

  /* People who connected with a code exist in the database; this roster is
     local. Merge them in so a therapist actually SEES someone who joined —
     without which the connection code led nowhere on this side either. Local
     notes, goals and prescriptions survive the merge, and a hand-added record
     with the same name is adopted rather than duplicated. */
  useEffect(() => {
    let alive = true
    void dp.listPatients()
      .then((rows) => {
        if (!alive || !rows.length) return
        update((s) => mergeServerPatients(s, rows.map((r) => ({ id: r.id, name: r.name }))))
      })
      .catch(() => { /* no backend, or none yet: the local roster stands */ })
    return () => { alive = false }
  }, [dp, update])

  const roomFor = useMemo(() => {
    const byName = new Map<string, Appointment>()
    for (const a of appointments) {
      if (!isUpcoming(a, Date.now())) continue
      const key = (a.patientName ?? '').trim().toLowerCase()
      if (key && !byName.has(key)) byName.set(key, a)
    }
    return (name: string): string | null => byName.get(name.trim().toLowerCase())?.id ?? null
  }, [appointments])
  const patient = view.kind === 'patient' || view.kind === 'call' ? state.patients.find((p) => p.id === view.id) : undefined

  function startCall(id: string) {
    setView({ kind: 'call', id })
  }

  function saveSession(patientId: string, row: SessionRow, quickNotes: SessionResult['quickNotes']) {
    // The session note and the quick-notes are ONE clinical entry, tagged
    // "Session #N" — the notes list is unified and searchable.
    const noteText = [
      row.note,
      ...quickNotes.map((q) => `${fmtDate(q.at, { hour: '2-digit', minute: '2-digit' })} P${q.phase} — ${q.text}`),
    ]
      .filter(Boolean)
      .join('\n')

    update((s) => ({
      ...s,
      patients: s.patients.map((p) =>
        p.id === patientId
          ? {
              ...p,
              sessions: [row, ...p.sessions.filter((x) => x.id !== row.id)],
              lastSessionAt: row.at,
              nextSessionAt: undefined,
              notes: [
                ...p.notes.filter((n) => n.tag !== `Session #${row.noteNumber}`),
                {
                  id: `n-${row.id}`,
                  at: row.at,
                  tag: `Session #${row.noteNumber}`,
                  time: fmtDate(row.at, { hour: '2-digit', minute: '2-digit' }),
                  text: noteText,
                },
              ],
            }
          : p,
      ),
    }))
  }

  /* --------------------------------------------------- full-screen views -- */

  if (view.kind === 'call') {
    const p = view.sandbox ? virtualPatient() : patient
    if (p) {
      return (
        <LiveSession
          patient={p}
          sandbox={view.sandbox}
          roomId={view.sandbox ? null : roomFor(p.name)}
          demoSeconds={demoSeconds}
          onExit={() => { setView({ kind: 'nav' }); loadAppointments() }}
          onEnd={(r) => {
            if (view.sandbox) { setView({ kind: 'nav' }); return }
            saveSession(p.id, r.row, r.quickNotes)
            loadAppointments()
            setView({ kind: 'report', patientId: p.id, row: r.row, quickNotes: r.quickNotes })
          }}
        />
      )
    }
  }

  if (view.kind === 'report') {
    const p = state.patients.find((x) => x.id === view.patientId)
    if (p) {
      return (
        <div className="w-app">
          <TooSmall />
          <Sidebar
            nav={nav}
            setNav={(n) => { setNav(n); setView({ kind: 'nav' }) }}
            account={state.account}
            unread={unread}
            requests={state.requests.length}
            lowAdherence={lowAdherence}
            collapsed
          />
          <div className="w-content">
            <TopBar
              crumbs={[t('Patients'), p.name, t('Session Report')]}
              account={state.account}
              menu={menu}
              setMenu={setMenu}
              onProfile={() => { setNav('settings'); setView({ kind: 'nav' }) }}
            />
            <main className="w-main">
              <SessionReport
                patient={p}
                account={state.account}
                row={view.row}
                quickNotes={view.quickNotes}
                onSave={(row) => saveSession(p.id, row, [])}
                onBack={() => { setNav('patients'); setView({ kind: 'nav' }) }}
              />
            </main>
          </div>
        </div>
      )
    }
  }

  /* -------------------------------------------------------------- shell -- */

  const crumbs =
    view.kind === 'patient' && patient ? [t('Patients'), patient.name] : [t(labelFor(nav))]

  return (
    <div className="w-app">
      <TooSmall />

      <Sidebar
        nav={nav}
        setNav={(n) => {
          setNav(n)
          setView(n === 'sandbox' ? { kind: 'call', id: 'sandbox', sandbox: true } : { kind: 'nav' })
        }}
        account={state.account}
        unread={unread}
        requests={state.requests.length}
        lowAdherence={lowAdherence}
      />

      <div className="w-content">
        <TopBar
          crumbs={crumbs}
          account={state.account}
          menu={menu}
          setMenu={setMenu}
          onProfile={() => { setNav('settings'); setView({ kind: 'nav' }) }}
        />

        <main className="w-main">
          {view.kind === 'patient' && patient ? (
            <>
              <button className="w-link w-back" onClick={() => setView({ kind: 'nav' })}>‹ {t('Patients')}</button>
              <PatientCard
                patient={patient}
                update={update}
                onCall={() => startCall(patient.id)}
                onMessage={() => { setMessagePatient(patient.id); setNav('messages'); setView({ kind: 'nav' }) }}
                onOpenReport={(sessionId) => {
                  const row = patient.sessions.find((s) => s.id === sessionId)
                  if (row) setView({ kind: 'report', patientId: patient.id, row })
                }}
              />
            </>
          ) : (
            <>
              {nav === 'patients' && (
                <Roster state={state} update={update} onOpen={(id) => setView({ kind: 'patient', id })} onCall={startCall} />
              )}
              {nav === 'calendar' && (
                <Calendar state={state} update={update} onOpenPatient={(id) => setView({ kind: 'patient', id })} onCall={startCall} />
              )}
              {nav === 'messages' && (
                <Messages
                  state={state}
                  update={update}
                  initialPatientId={messagePatient}
                  onOpenPatient={(id) => setView({ kind: 'patient', id })}
                />
              )}
              {nav === 'prescriptions' && (
                <Prescriptions state={state} update={update} onOpenPatient={(id) => setView({ kind: 'patient', id })} />
              )}
              {nav === 'reports' && (
                <ReportsArchive
                  state={state}
                  onOpen={(patientId, sessionId) => {
                    const p = state.patients.find((x) => x.id === patientId)
                    const row = p?.sessions.find((s) => s.id === sessionId)
                    if (row) setView({ kind: 'report', patientId, row })
                  }}
                />
              )}
              {nav === 'performance' && <Performance state={state} />}
              {nav === 'settings' && (
                <WorkspaceSettings state={state} update={update} onOpenAvailability={() => setAvailOpen(true)} />
              )}
            </>
          )}
        </main>
      </div>

      {availOpen && <AvailabilityModal state={state} update={update} onClose={() => setAvailOpen(false)} />}
      {user && null}
    </div>
  )
}

/* ------------------------------------------------------------------------- */

/**
 * Below 1024px the workspace refuses rather than shrinking — it runs a live
 * video call, a clinical panel and treatment transport at once, and a
 * phone-sized version would be unsafe to hold a session in.
 *
 * It is a component rather than markup repeated per view because the CSS hides
 * every sibling of it inside `.w-app`: a `.w-app` that forgets this element
 * renders a blank page on a phone, which is exactly what the session-report
 * view used to do.
 */
function TooSmall() {
  const { t } = useI18n()
  return (
    <div className="w-toosmall">
      <div>
        <h2 className="w-h2">{t('Please use a desktop')}</h2>
        <p className="w-lead">
          {t('The therapist workspace runs a live video call, a clinical panel and treatment controls at once. It needs a screen at least 1024px wide.')}
        </p>
      </div>
    </div>
  )
}

function labelFor(n: Nav): string {
  return GROUPS.flatMap((g) => g.items).find((i) => i.id === n)?.label ?? 'Patients'
}

function Sidebar({
  nav,
  setNav,
  account,
  unread,
  requests,
  lowAdherence,
  collapsed,
}: {
  nav: Nav
  setNav: (n: Nav) => void
  account: { fullName: string; online: boolean }
  unread: number
  requests: number
  lowAdherence: number
  collapsed?: boolean
}) {
  const { t } = useI18n()
  return (
    <aside className={`w-sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="w-sidebar__top">
        <span className="w-brand">Good Loop</span>
        <div className="w-sidebar__me">
          <span className="w-avatar" aria-hidden="true">{initials(account.fullName)}</span>
          <span className="w-sidebar__name">
            <strong>{account.fullName}</strong>
            <em className={`w-online${account.online ? ' is-on' : ''}`}>{account.online ? t('Online') : t('Offline')}</em>
          </span>
        </div>
      </div>

      {GROUPS.map((g) => (
        <nav key={g.title} className="w-sidebar__group">
          <div className="w-sidebar__grouptitle">{t(g.title)}</div>
          {g.items.map((i) => {
            const badge =
              i.id === 'messages' && unread > 0 ? String(unread)
              : i.id === 'calendar' && requests > 0 ? '·'
              : i.id === 'prescriptions' && lowAdherence > 0 ? '·'
              : null
            return (
              <button key={i.id} className={`w-navitem${nav === i.id ? ' is-on' : ''}`} onClick={() => setNav(i.id)}>
                <span className="w-navitem__icon" aria-hidden="true">{i.icon}</span>
                <span className="w-navitem__label">{t(i.label)}</span>
                {badge && <span className={`w-navitem__badge${badge === '·' ? ' is-dot' : ''}`}>{badge === '·' ? '' : badge}</span>}
              </button>
            )
          })}
        </nav>
      ))}
    </aside>
  )
}

function TopBar({
  crumbs,
  account,
  menu,
  setMenu,
  onProfile,
}: {
  crumbs: string[]
  account: { fullName: string }
  menu: boolean
  setMenu: (v: boolean) => void
  onProfile: () => void
}) {
  const { t } = useI18n()
  return (
    <header className="w-topbar">
      <nav className="w-crumbs" aria-label={t('Breadcrumb')}>
        {crumbs.map((c, i) => (
          <span key={`${c}-${i}`}>
            {i > 0 && <span className="w-crumbs__sep" aria-hidden="true">/</span>}
            {c}
          </span>
        ))}
      </nav>
      <div className="w-topbar__right">
        <button className="w-user" onClick={() => setMenu(!menu)} aria-expanded={menu}>
          <span>{account.fullName}</span>
          <span className="w-avatar" aria-hidden="true">{initials(account.fullName)}</span>
        </button>
        {menu && (
          <div className="w-usermenu">
            <button className="w-usermenu__row" onClick={() => { onProfile(); setMenu(false) }}>{t('Profile')}</button>
            <a className="w-usermenu__row" href="mailto:support@goodloop.health">{t('Help')}</a>
            <SignOutButton className="w-usermenu__row" />
          </div>
        )}
      </div>
    </header>
  )
}
