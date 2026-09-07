/* ============================================================================
   Self Use — the app shell

   Five tabs, always visible EXCEPT during an active session (the immersive
   player) or an active videocall. No badge counts on any tab, and the
   Therapist tab is shown to everyone — what varies is what is inside it.

   The shell owns three things the tabs must not each re-derive:
   · the onboarding gate,
   · the session launcher (which decides whether a finished session ticks off a
     pathway week, a prescription, or neither),
   · the Safety Gateway — Level 2 is evaluated from the measurement series
     after every state change and shown at most once per trigger cycle.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/auth'
import { useDataProvider } from '../data/provider'
import { useI18n } from '../i18n'
import type { Launch } from './Home'
import { Explore } from './Explore'
import { SessionFlow, type SessionOutcome } from './Session'
import { TherapistTab } from './TherapistTab'
import { ProgressTab } from './ProgressTab'
import { ProfileTab } from './ProfileTab'
import { GlCheckFlow, Who5Flow, DailyMoodFlow } from './Measures'
import { SafetyLevel2, SafetyLevel3 } from './Safety'
import { PatientVideoCall } from './VideoCall'
import { useSelfUseStore, takeSignupIntake } from '../data/selfUseStore'
import { useTherapyStore, linkFromServer, profileFor } from './therapyStore'
import { resolveCompanyCode, hasProfessionalSupport, safetyContact } from '../data/convention'
import { LiveCatalogProvider, useCatalog, findPathway } from '../data/liveCatalog'
import { Icon, type IconName } from './icons'
import { buildMonthlyReportPdf, buildTherapyReportPdf } from './progressPdf'
import { weekCount, SELF_USE_SESSIONS, type PathwayId } from '../data/selfuse'
import { useAssessments, vasRecord, SELF_USE_PATIENT_ID } from '../data/assessmentStore'
import { safetyLevel2Trigger, dayKey } from '../data/measures'
import type { Appointment } from '../data/scheduling'
import type { Duration } from '../types/domain'

/* Home IS the library. There is no separate Explore tab: the rails, the
   pathways and the continue card are one screen, because a person opening the
   app wants to choose something, and a Home that only linked to the place
   where you choose was a hop with nothing in it. */
type Tab = 'home' | 'therapist' | 'progress' | 'profile'

const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'library', label: 'Home' },
  { id: 'therapist', icon: 'therapist', label: 'Therapist' },
  { id: 'progress', icon: 'progress', label: 'Progress' },
  { id: 'profile', icon: 'profile', label: 'Profile' },
]

type Overlay =
  | { kind: 'none' }
  | { kind: 'glcheck' }
  | { kind: 'who5' }
  | { kind: 'mood' }
  | { kind: 'safety3' }
  | { kind: 'call' }

interface SelfUseAppProps {
  /** Testing hook: shorten every session. null = full length. */
  demoSeconds?: number | null
  onDemoToggle?: () => void
}

/** The catalog is loaded once for the whole surface, so Home, Explore and the
    player can never disagree about what a session offers. */
export function SelfUseApp(props: SelfUseAppProps) {
  return (
    <LiveCatalogProvider>
      <SelfUseSurface {...props} />
    </LiveCatalogProvider>
  )
}

function SelfUseSurface({ demoSeconds = null, onDemoToggle }: SelfUseAppProps) {
  const { t } = useI18n()
  const catalog = useCatalog()
  const { user, signOut } = useAuth()
  const dp = useDataProvider()
  const { state, update, reset } = useSelfUseStore(user?.id)
  const { update: updateAssessments } = useAssessments()
  const { state: therapy, update: updateTherapy } = useTherapyStore(user?.id)

  const [tab, setTab] = useState<Tab>('home')
  const [launch, setLaunch] = useState<(Launch & { prescriptionId?: string }) | null>(null)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const [safety2, setSafety2] = useState(false)

  const convention = useMemo(() => resolveCompanyCode(state.companyCode), [state.companyCode])
  const eap = convention?.eap ?? null

  /* The real appointment is what makes a call possible: its id is the ROOM
     both devices join, and its start time is what opens the join window.
     Booking writes it, both sides read it, and neither has to be told a
     room id by hand. */
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const loadAppointment = useCallback(() => {
    void dp.getMyAppointment().then(setAppointment).catch(() => setAppointment(null))
  }, [dp])
  useEffect(loadAppointment, [loadAppointment])

  /* ------------------------------------------- what the server knows -----

     Both of these live in localStorage, which is right for a person's own
     device and wrong as the ONLY source: a session recorded on their phone,
     or a therapist who linked them from the console, exists in the database
     and this app could not see it. Signing in on a second device — or on a
     demo account provisioned entirely server-side — showed "you have not done
     a session yet" and no therapist, both of which were false.

     Merged, never replaced. The local copy is the newer one during a session
     and must survive; the server fills in what this device has not seen. */

  useEffect(() => {
    let alive = true
    void dp.listSessions()
      .then((rows) => {
        if (!alive || !rows.length) return
        update((s) => {
          const seen = new Set(s.logs.map((l) => `${l.at}|${l.duration}`))
          const extra = rows
            .filter((r) => !seen.has(`${r.startedAt}|${r.duration}`))
            .map((r) => ({
              at: r.startedAt,
              /* The log is keyed by SESSION SLUG and the record carries a
                 protocol code; a code the catalog cannot place is kept with an
                 empty slug rather than dropped, so the count and the streak
                 stay true even when the name cannot be shown. */
              slug: SELF_USE_SESSIONS.find((x) => x.protocolCode === r.protocolCode)?.slug ?? '',
              duration: r.duration,
            }))
          if (!extra.length) return s
          return { ...s, logs: [...s.logs, ...extra].sort((a, b) => a.at - b.at) }
        })
      })
      .catch(() => { /* offline: the local history stands */ })
    return () => { alive = false }
  }, [dp, update])

  /* The company on the person's PROFILE, when this browser does not know one.
     Onboarding writes it locally; an account that never went through
     onboarding here — a second device, or one provisioned server-side — had no
     company, so the convention resolved to nothing and the app told them their
     plan has no professional support. A code typed here is never overwritten. */
  useEffect(() => {
    if (state.companyCode) return
    let alive = true
    void dp.getMyCompanyCode()
      .then((code) => {
        if (!alive || !code) return
        update((s) => (s.companyCode ? s : { ...s, companyCode: code }))
      })
      .catch(() => { /* offline: no convention, which is the safe default */ })
    return () => { alive = false }
  }, [dp, state.companyCode, update])

  useEffect(() => {
    let alive = true
    void dp.getMyTherapistLink()
      .then((found) => {
        if (!alive || !found) return
        updateTherapy((s) => {
          // a link already on this device wins: it carries the session
          // history, goals and intake this app has collected since
          if (s.link) return s
          return {
            request: null,
            link: linkFromServer(profileFor({ id: found.therapistId, name: found.therapistName }), found.since),
          }
        })
      })
      .catch(() => { /* no backend, or no therapist: State A stands */ })
    return () => { alive = false }
  }, [dp, updateTherapy])

  /* ------------------------------------------------- Safety Gateway L2 --- */
  useEffect(() => {
    if (!state.onboardedAt) return
    const trigger = safetyLevel2Trigger({
      glChecks: state.glChecks,
      moods: state.moods,
      lastSessionAt: state.logs.length ? state.logs[state.logs.length - 1].at : null,
      now: Date.now(),
    })
    // Once per trigger CYCLE: the same trigger id does not reappear until a
    // different one fires, or the person's data leaves the triggering shape.
    if (trigger && state.safetyShown !== trigger) {
      setSafety2(true)
      update((s) => ({ ...s, safetyShown: trigger }))
    } else if (!trigger && state.safetyShown) {
      update((s) => ({ ...s, safetyShown: null }))
    }
  }, [state.glChecks, state.moods, state.logs, state.onboardedAt, state.safetyShown, update])

  /* ------------------------------------------------------ first run -----

     There is no onboarding any more. A person registers and lands on the
     library: the seven screens that used to stand between the two — welcome,
     account, consents, four intake questions, a recommended pathway and a
     "ready for your first session?" flourish — are gone. Consent is taken at
     registration, which is the last honest moment to ask for it, and the
     company code is a field on the same form.

     Nobody is recommended a pathway any more either. They browse the Pathways
     rail and choose one, which is a smaller promise than a recommendation
     built from four questions.

     This effect is what "first run" now means: apply what registration
     answered and mark the account started. An account that arrives without a
     handoff — an existing person signing in on a new device — is marked
     started with usage consent only, because they consented when they
     registered and this device simply has not heard about it. */
  useEffect(() => {
    if (state.onboardedAt) return
    const signup = takeSignupIntake()
    const now = Date.now()
    update((s) => (s.onboardedAt ? s : {
      ...s,
      onboardedAt: now,
      companyCode: signup?.companyCode ?? s.companyCode,
      consents: {
        ...s.consents,
        usageAt: s.consents.usageAt ?? now,
        measurementAt: signup ? (signup.measurement ? now : null) : s.consents.measurementAt,
      },
    }))
  }, [state.onboardedAt, update])

  /* ------------------------------------------------------ the session --- */
  if (launch) {
    const session = catalog.sessions.find((x) => x.slug === launch.slug)
    /* A launch that resolves to nothing used to fall through to the tab UI
       with `launch` still set: the tap did nothing, no message, and the stale
       state sat there. Reachable through a prescription whose session left
       the catalog — so say what happened instead of appearing broken. */
    if (!session) {
      return (
        <div className="app-frame su-studio">
          <div className="screen screen--center">
            <div className="screen__body">
              <h2 className="display">{t('This session is not available')}</h2>
              <p className="lead">
                {t('It is no longer in the catalog. If your therapist prescribed it, they can prescribe it again.')}
              </p>
              <button className="btn btn--primary" onClick={() => setLaunch(null)}>{t('Go back')}</button>
            </div>
          </div>
        </div>
      )
    }
    if (session) {
      const pw = findPathway(catalog.pathways, state.pathway?.id)
      const planWeek = pw?.plan.find((w) => w.week === launch.pathwayWeek)
      const doneThisWeek = launch.pathwayWeek ? state.pathway?.done[launch.pathwayWeek] ?? 0 : 0
      const context = planWeek
        ? t('{done} of {total} this week.', { done: doneThisWeek + 1, total: weekCount(planWeek) })
        : undefined

      return (
        <SessionFlow
          session={session}
          duration={launch.duration}
          needsStereoCheck={!state.stereoCheckedAt}
          contextLine={context}
          demoSeconds={demoSeconds}
          /* Only a PASS retires the check. Recording a failure as a pass meant
             someone on a mono Bluetooth earpiece was never asked again. */
          onStereoChecked={(passed) => { if (passed) update((s) => ({ ...s, stereoCheckedAt: Date.now() })) }}
          onCancel={() => setLaunch(null)}
          onNeedSupport={() => { setLaunch(null); setOverlay({ kind: 'safety3' }) }}
          onDone={(o) => { void finishSession(o) }}
        />
      )
    }
  }

  async function finishSession(o: SessionOutcome) {
    const l = launch
    setLaunch(null)
    if (!o.completed) return // ended early — nothing is recorded, as promised

    /* The session VAS. It runs in this channel as well as the therapist one and
       lands in the same series, so a person who does both produces one trend
       rather than two half-trends that no one can compare. It needs no
       confirmation and is frozen the moment it is written. */
    if (typeof o.vasPre === 'number' && typeof o.vasPost === 'number') {
      updateAssessments((rs) => [...rs, vasRecord(SELF_USE_PATIENT_ID, o.vasPre as number, o.vasPost as number, o.completedAt)])
    }

    const session = catalog.sessions.find((x) => x.slug === o.slug)
    // The clinical record still goes through the data layer, keyed on the
    // protocol behind the session — that is what a therapist's history reads.
    if (session) {
      await dp
        .recordSession({
          id: `s-${o.startedAt}`,
          protocolCode: session.protocolCode,
          duration: o.duration,
          startedAt: o.startedAt,
          completedAt: o.completedAt,
        })
        .catch(() => { /* offline — the local log below still holds */ })
    }

    update((s) => {
      const log = {
        at: o.completedAt,
        slug: o.slug,
        duration: o.duration,
        prescriptionId: l?.prescriptionId,
        pathwayWeek: l?.prescriptionId ? undefined : l?.pathwayWeek,
        feedback: o.feedback,
      }
      // A prescribed session belongs to the THERAPY, never to the pathway.
      if (l?.prescriptionId || !l?.pathwayWeek || !s.pathway) {
        return { ...s, logs: [...s.logs, log] }
      }
      const week = l.pathwayWeek
      const done = { ...s.pathway.done, [week]: (s.pathway.done[week] ?? 0) + 1 }
      const p = findPathway(catalog.pathways, s.pathway.id)
      const complete = p ? p.plan.every((w) => (done[w.week] ?? 0) >= weekCount(w)) : false
      return {
        ...s,
        logs: [...s.logs, log],
        pathway: { ...s.pathway, done, completedAt: complete ? Date.now() : s.pathway.completedAt },
        completedPathways: complete && p ? [...s.completedPathways, { id: p.id, at: Date.now() }] : s.completedPathways,
      }
    })

    if (l?.prescriptionId) {
      updateTherapy((s) =>
        s.link
          ? {
              ...s,
              link: {
                ...s.link,
                prescriptions: s.link.prescriptions.map((rx) =>
                  rx.id === l.prescriptionId
                    ? { ...rx, done: rx.done + 1, status: rx.done + 1 >= rx.perWeek ? 'completed' : 'active' }
                    : rx,
                ),
              },
            }
          : s,
      )
    }

    setTab(l?.prescriptionId ? 'therapist' : 'home')
  }

  /* --------------------------------------------------------- overlays --- */
  if (overlay.kind === 'safety3') {
    return <SafetyLevel3 eap={eap} onClose={() => { setOverlay({ kind: 'none' }); setTab('home') }} />
  }
  if (overlay.kind === 'glcheck') {
    return (
      <GlCheckFlow
        previous={state.glChecks[state.glChecks.length - 1] ?? null}
        onDone={(e) => update((s) => ({ ...s, glChecks: [...s.glChecks, e] }))}
        onClose={() => setOverlay({ kind: 'none' })}
      />
    )
  }
  if (overlay.kind === 'who5') {
    return (
      <Who5Flow
        previous={state.who5[state.who5.length - 1] ?? null}
        onDone={(e) => update((s) => ({ ...s, who5: [...s.who5, e] }))}
        onClose={() => setOverlay({ kind: 'none' })}
      />
    )
  }
  if (overlay.kind === 'mood') {
    const today = state.moods.find((m) => m.day === dayKey(Date.now())) ?? null
    return (
      <DailyMoodFlow
        today={today}
        onDone={(e) => update((s) => ({ ...s, moods: [...s.moods.filter((m) => m.day !== e.day), e] }))}
        onClose={() => setOverlay({ kind: 'none' })}
      />
    )
  }
  if (overlay.kind === 'call' && therapy.link) {
    return (
      <PatientVideoCall
        therapist={therapy.link.therapist}
        startsAt={appointment?.startsAtMs ?? therapy.link.nextSessionAt}
        roomId={appointment?.id ?? null}
        demoSeconds={demoSeconds}
        onLeave={() => { setOverlay({ kind: 'none' }); setTab('therapist'); loadAppointment() }}
      />
    )
  }

  /* ------------------------------------------------------------ tabs ---- */

  function startPathway(id: PathwayId) {
    update((s) => ({ ...s, pathway: { id, startedAt: Date.now(), done: {} } }))
  }

  function startFromExplore(l: Launch) {
    setLaunch(l)
  }

  /* The monthly summary is a real document a person can keep or show someone.
     "Export my data" in Privacy & Data stays JSON on purpose — that one exists
     to be portable and machine-readable, which is a different job. */
  function exportSelfUse() {
    buildMonthlyReportPdf({
      state,
      sessions: catalog.sessions,
      pathway: findPathway(catalog.pathways, state.pathway?.id),
      personName: displayName(user?.email),
    }).save(`good-loop-${dayKey(Date.now())}.pdf`)
  }

  function exportTherapy() {
    if (!therapy.link) return
    buildTherapyReportPdf(therapy.link, catalog.sessions, displayName(user?.email))
      .save(`good-loop-therapy-${dayKey(Date.now())}.pdf`)
  }

  /** GDPR/LGPD portability: everything held about this person, as data. */
  function exportRawData() {
    downloadJson(`good-loop-my-data-${dayKey(Date.now())}.json`, {
      exportedAt: new Date().toISOString(),
      profile: { email: user?.email ?? null, companyCode: state.companyCode },
      consents: state.consents,
      preferences: { notifications: state.notifications, session: state.prefs },
      pathway: state.pathway,
      completedPathways: state.completedPathways,
      logs: state.logs,
      glChecks: state.glChecks,
      who5: state.who5,
      moods: state.moods,
      therapy: therapy.link
        ? {
            therapist: therapy.link.therapist.name,
            sessions: therapy.link.sessions,
            prescriptions: therapy.link.prescriptions,
            goals: therapy.link.goals,
            vas: therapy.link.vas,
            scores: therapy.link.scores,
          }
        : null,
    })
  }

  return (
    <div className="app-frame app-frame--tabs su-studio">
      <div className="tabview">
        {tab === 'home' && (
          <Explore
            pathway={state.pathway}
            completed={state.completedPathways.map((c) => c.id)}
            onStartPathway={startPathway}
            onStart={startFromExplore}
          />
        )}

        {tab === 'therapist' && (
          <TherapistTab
            hasConvention={hasProfessionalSupport(convention)}
            therapy={therapy}
            update={updateTherapy}
            appointment={appointment}
            onAppointmentChanged={loadAppointment}
            onGoSelfUse={() => setTab('home')}
            onStartPrescription={(l, id) => setLaunch({ ...l, prescriptionId: id })}
            onJoinCall={() => setOverlay({ kind: 'call' })}
          />
        )}

        {tab === 'progress' && (
          <ProgressTab
            state={state}
            therapy={therapy}
            onGlCheck={() => setOverlay({ kind: 'glcheck' })}
            onWho5={() => setOverlay({ kind: 'who5' })}
            onMood={() => setOverlay({ kind: 'mood' })}
            onGoTherapist={() => setTab('therapist')}
            onExportSelfUse={exportSelfUse}
            onExportTherapy={exportTherapy}
          />
        )}

        {tab === 'profile' && (
          <ProfileTab
            name={displayName(user?.email)}
            email={user?.email ?? ''}
            convention={convention}
            hasTherapist={Boolean(therapy.link)}
            state={state}
            update={update}
            onLogout={() => void signOut()}
            onDeleteAccount={() => { reset(); void signOut() }}
            onExport={exportRawData}
          />
        )}
      </div>

      <nav className="tabbar">
        {TABS.map((tb) => (
          <button key={tb.id} className={`tabbar__btn${tab === tb.id ? ' is-on' : ''}`} onClick={() => setTab(tb.id)}>
            <span className="tabbar__icon"><Icon name={tb.icon} /></span>
            <span className="tabbar__label">{t(tb.label)}</span>
          </button>
        ))}
      </nav>

      {onDemoToggle && (
        <button className="dev-toggle su-dev" onClick={onDemoToggle}>
          {demoSeconds ? t('demo {n}s', { n: demoSeconds }) : t('full length')}
        </button>
      )}

      {safety2 && <SafetyLevel2 eap={safetyContact(convention)} onClose={() => setSafety2(false)} />}
    </div>
  )
}

/* ------------------------------------------------------------------------- */

function displayName(email?: string | null): string {
  if (!email) return 'there'
  const local = email.split('@')[0]
  return local.split(/[._-]/)[0].replace(/^./, (c) => c.toUpperCase())
}

function downloadJson(filename: string, data: unknown): void {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    /* download blocked — the person can still read their data on screen */
  }
}

export type { Duration }
